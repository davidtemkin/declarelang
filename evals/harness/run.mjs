#!/usr/bin/env node
// run — the eval harness orchestrator (design/verify-and-evals.md §3).
//
//   node evals/harness/run.mjs [flags]
//     --tasks a,b,c        which tasks (default: all under evals/tasks/)
//     --tracks one-shot,iterated   (default: one-shot,iterated)
//     --models m1,m2       label(s) for the run; passed to the solver (default: reference)
//     --solver reference|claude    generation seam (default: reference)
//     --budget N           iterated-track iteration cap (default: task budget.json, else 8)
//     --run <name>         run directory name (default: timestamp)
//
// For each task × track × model it builds a hermetic sandbox, runs the solver
// (one-shot = one call; iterated = a harness-owned verify loop), scores every
// attempt with the ladder (score.mjs → verify), and appends a metrics line. Then
// it regenerates evals/RESULTS.md. The reference solver spends no model budget —
// it's the shakedown/CI path that proves the whole pipeline end to end.

import { readdirSync, existsSync, statSync, mkdirSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeSandbox } from "./sandbox.mjs";
import { makeSolver } from "./solvers.mjs";
import { score, renderForSolver } from "./score.mjs";
import { generateResults } from "./results.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TASKS_DIR = join(ROOT, "evals/tasks");
const RUNS_DIR = join(ROOT, "evals/runs");
const REFERENCE_DOC = readFileSync(join(ROOT, "docs/declare-for-llms.md"), "utf8");

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const val = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const list = (name, def) => val(name, def).split(",").map((s) => s.trim()).filter(Boolean);

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const runName = val("run", stamp);
const tracks = list("tracks", "one-shot,iterated");
const models = list("models", "reference");
const solverId = val("solver", "reference");
const budgetOverride = val("budget", null);

// ── task discovery ───────────────────────────────────────────────────────────
function loadTasks(only) {
  const ids = readdirSync(TASKS_DIR).filter((d) => statSync(join(TASKS_DIR, d)).isDirectory());
  return ids
    .filter((id) => only.length === 0 || only.includes(id))
    .map((id) => {
      const dir = join(TASKS_DIR, id);
      const budgetFile = join(dir, "budget.json");
      const budget = existsSync(budgetFile) ? JSON.parse(readFileSync(budgetFile, "utf8")) : {};
      return {
        id, dir,
        brief: readFileSync(join(dir, "brief.md"), "utf8"),
        hasReference: existsSync(join(dir, "reference.declare")),
        hasAssert: existsSync(join(dir, "assert.mjs")),
        hasStates: existsSync(join(dir, "states.mjs")),
        hasBaselines: existsSync(join(dir, "baselines")),
        hasFixtures: existsSync(join(dir, "fixtures")),
        maxIterations: Number(budgetOverride ?? budget.maxIterations ?? 8),
      };
    });
}

// ── one attempt (a task × track × model cell) ────────────────────────────────
async function runCell({ task, track, model, solver, runDir, metricsFile }) {
  const { dir } = makeSandbox({ runDir, task, track, model });
  const appFile = join(dir, "app.declare");
  const t0 = Date.now();
  let tokens = 0, iterations = 0, prior = null, report = null, sc = null;
  const transcript = [];

  const cap = track === "iterated" ? task.maxIterations : 1;
  for (let i = 1; i <= cap; i++) {
    iterations = i;
    let gen;
    try {
      gen = await solver.solve({ task, referenceDoc: REFERENCE_DOC, brief: task.brief, prior, report, model });
    } catch (e) {
      transcript.push({ iteration: i, error: String(e?.message ?? e) });
      sc = { ok: false, rungClimbed: 0, rungFailed: 1, compileOk: false, diagnostics: [], report: `solver error: ${e?.message ?? e}`, formatDistance: null };
      break;
    }
    tokens += gen.tokens ?? 0;
    writeFileSync(appFile, gen.source);
    sc = await score(appFile, task);
    transcript.push({ iteration: i, tokens: gen.tokens ?? 0, ok: sc.ok, rungClimbed: sc.rungClimbed, rungFailed: sc.rungFailed, report: sc.report });
    if (sc.ok) break;
    prior = gen.source;
    report = sc.report;
  }

  const wallMs = Date.now() - t0;
  writeFileSync(join(dir, "transcript.json"), JSON.stringify({ task: task.id, track, model, solver: solver.id, transcript }, null, 2));

  const metric = {
    ts: new Date().toISOString(), run: runName, task: task.id, track, model, solver: solver.id,
    iterations, iterationsToGreen: sc?.ok ? iterations : null,
    ok: !!sc?.ok, rungClimbed: sc?.rungClimbed ?? 0, rungFailed: sc?.rungFailed ?? null,
    compileOk: !!sc?.compileOk, tokens: tokens || null, wallMs,
    formatDistance: sc?.formatDistance ?? null,
    diagnostics: (sc?.diagnostics ?? []).map((d) => ({ code: d.code, phase: d.phase, line: d.line })),
    sandbox: join("evals/runs", runName, `${task.id}__${track}__${model.replace(/[^\w.-]/g, "_")}`),
  };
  appendFileSync(metricsFile, JSON.stringify(metric) + "\n");
  return metric;
}

// ── main ─────────────────────────────────────────────────────────────────────
const tasks = loadTasks(list("tasks", ""));
if (tasks.length === 0) { console.error("no tasks found under evals/tasks/"); process.exit(2); }

const runDir = join(RUNS_DIR, runName);
mkdirSync(runDir, { recursive: true });
const metricsFile = join(runDir, "metrics.jsonl");
writeFileSync(metricsFile, "");
const solver = makeSolver(solverId);

console.log(`eval run '${runName}' — solver=${solverId} · tasks=${tasks.map((t) => t.id).join(",")} · tracks=${tracks.join(",")} · models=${models.join(",")}\n`);

const metrics = [];
for (const task of tasks) {
  for (const track of tracks) {
    for (const model of models) {
      process.stdout.write(`  ${task.id} · ${track} · ${model} … `);
      const m = await runCell({ task, track, model, solver, runDir, metricsFile });
      const green = m.ok ? "green" : `R${m.rungClimbed}${m.rungFailed ? `→✗R${m.rungFailed}` : ""}`;
      const iters = track === "iterated" ? ` (${m.iterations} iter)` : "";
      const tok = m.tokens ? ` · ${m.tokens} tok` : "";
      console.log(`${green}${iters}${tok} · ${m.wallMs}ms`);
      metrics.push(m);
    }
  }
}

const resultsPath = join(ROOT, "evals/RESULTS.md");
generateResults(metrics, { runName, solverId, resultsPath });
console.log(`\n  metrics → ${join("evals/runs", runName, "metrics.jsonl")}`);
console.log(`  results → evals/RESULTS.md`);

const failed = metrics.filter((m) => !m.ok).length;
console.log(`\n  ${metrics.length - failed}/${metrics.length} cells green.`);
process.exit(0);
