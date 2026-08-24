#!/usr/bin/env node
// run — the eval harness orchestrator (docs/system-design/verify-and-evals.md §3).
//
//   node evals/harness/run.mjs [flags]
//     --tasks a,b,c        which tasks (default: all under evals/tasks/)
//     --tracks one-shot,iterated   (default: one-shot,iterated)
//     --models m1,m2       label(s) for the run; passed to the solver (default: reference)
//     --solver reference|claude    generation seam (default: reference)
//     --budget N           iterated-track iteration cap (default: task budget.json, else 8)
//     --run <name>         run directory name (default: timestamp)
//
//   Round flags (a pinned round lives entirely outside this tree — evals/ROUNDS.md):
//     --subject <dir>      the language under test: a downloaded distribution. The
//                          agent's sandbox is copied from it AND the ladder that
//                          scores the result is ITS tools/verify.mjs. Default: this tree.
//     --runs <dir>         where metrics + per-cell evidence land (default: evals/runs/<run>)
//     --sandboxes <dir>    where agent sandboxes are built (default: $TMPDIR — purged by the OS)
//     --reps N             draws per cell (alias of --repeats)
//     --sha <sha>          provenance stamped on every metrics line
//     --purge-sandboxes    delete each sandbox entirely after its evidence is persisted
//
// For each task × track × model it builds a hermetic sandbox, runs the solver
// (one-shot = one call; iterated = a harness-owned verify loop), scores every
// attempt with the ladder (score.mjs → verify), and appends a metrics line. Then
// it regenerates evals/RESULTS.md. The reference solver spends no model budget —
// it's the shakedown/CI path that proves the whole pipeline end to end.

import { readdirSync, existsSync, statSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, cpSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { makeSandbox, makeDistroSandbox, sandboxName } from "./sandbox.mjs";
import { makeSolver } from "./solvers.mjs";
import { score, renderForSolver } from "./score.mjs";
import { generateResults } from "./results.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TASKS_DIR = join(ROOT, "evals/tasks");
const RUNS_DIR = join(ROOT, "evals/runs");

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const val = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const list = (name, def) => val(name, def).split(",").map((s) => s.trim()).filter(Boolean);

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const runName = val("run", stamp);
// distro mode (the bootstrap arm): the sandbox is a FRESH CLONE of the repo,
// the solver an agent that sets up and iterates itself (track "agentic" —
// one solver call, the verify loop lives inside the agent). Pair with
// --solver claude-distro.
const distro = argv.includes("--distro");
const tracks = distro ? ["agentic"] : list("tracks", "one-shot,iterated");
const models = list("models", "reference");
const solverId = val("solver", "reference");
// "reference" is a MODEL LABEL only for the reference solver; a real solver
// would pass it verbatim to `claude --model reference` and every cell dies at
// R1 on the CLI's model-not-found reply (burned a run on 2026-08-08).
if (solverId !== "reference" && models.includes("reference")) {
  console.error(`--solver ${solverId} needs a real model: add --models sonnet (or opus, haiku, …)`);
  process.exit(1);
}
const budgetOverride = val("budget", null);
// which brief the model is measured on. Default = the lean, purpose-built
// generation brief. (docs-ia §9 step 1 head-to-head, n=3 Sonnet one-shot: the
// unified core doc docs/declare.md measured WORSE as a generation context —
// 0/9 vs 2/9 green, 531K vs 463K tok — so it did NOT earn retirement of the
// brief. The flag stays so future candidates can be re-measured the same way.)
// The default is a FROZEN BASELINE (evals/baselines/, banner at its head): it is
// not documentation, it is not maintained, and it states rules that have since
// been reversed. That is deliberate — it is the text July's numbers were taken
// against, so it must not move. Measure a candidate by passing --brief-doc; do
// not "fix" the baseline to make a comparison look better.
const briefDocPath = val("brief-doc", "evals/baselines/declare-for-llms-2026-07.md");
// corpus mode (the docs-accessibility arm): the sandbox carries the category-B
// docs TREE instead of one brief file, and the solver reads its way in
// (claude-docs). Pair with --solver claude-docs.
const corpus = argv.includes("--corpus");

const repeats = Number(val("reps", val("repeats", 1))); // draws per cell, to separate noise from signal
const REFERENCE_DOC = readFileSync(join(ROOT, briefDocPath), "utf8");

// ── the round's subject ──────────────────────────────────────────────────────
// The tasks (briefs, asserts, fixtures) always come from THIS tree — they are the
// frozen instrument. The SUBJECT is what they measure, and it may be elsewhere.
const SUBJECT = resolve(val("subject", ROOT));
if (!existsSync(join(SUBJECT, "tools/verify.mjs"))) {
  console.error(`--subject ${SUBJECT} has no tools/verify.mjs — is it an unpacked distribution?`);
  process.exit(1);
}
const subjectSha = val("sha", null);
let subjectVersion = null;
try { subjectVersion = JSON.parse(readFileSync(join(SUBJECT, "package.json"), "utf8")).version ?? null; } catch { /* none */ }
const sandboxBase = val("sandboxes", null) ? resolve(val("sandboxes")) : null;
const purgeSandboxes = argv.includes("--purge-sandboxes");

/** The token sum hides its own shape: cache reads dominate an agentic cell and
 *  grow with TURNS, not with reading. Keep the parts so a round can say what it
 *  actually spent — fresh context read, output written, turns taken, dollars. */
function breakdown(gen) {
  const u = gen?.usage?.usage ?? null;
  if (!u) return null;
  const input = u.input_tokens ?? 0, create = u.cache_creation_input_tokens ?? 0;
  return {
    fresh: input + create, cacheRead: u.cache_read_input_tokens ?? 0,
    output: u.output_tokens ?? 0, turns: gen?.turns ?? null, costUsd: gen?.costUsd ?? null,
  };
}

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

// ── per-cell evidence ────────────────────────────────────────────────────────
// A sandbox is disposable (hundreds of MB once the agent has installed), but what
// it produced is the round's record. Persist the four artifacts a later reader
// needs — the program, the agent's own account, the ladder's full report, the
// metrics line — then shed the bulk.
function persistCell({ cellName, appFile, sc, gen, line, dir }) {
  const out = join(runDir, "cells", cellName);
  mkdirSync(out, { recursive: true });
  if (existsSync(appFile)) cpSync(appFile, join(out, "app.declare"));
  writeFileSync(join(out, "metric.json"), JSON.stringify(line, null, 1));
  if (sc?.raw) writeFileSync(join(out, "verify.json"), JSON.stringify(sc.raw, null, 1));
  writeFileSync(join(out, "transcript.json"), JSON.stringify(
    { task: line.task, track: line.track, model: line.model, solver: line.solver,
      usage: gen?.usage ?? null, turns: gen?.turns ?? null, costUsd: gen?.costUsd ?? null,
      report: sc?.report ?? null, reply: gen?.raw ?? null }, null, 1));
  if (dir) {
    if (purgeSandboxes) rmSync(join(dir, ".."), { recursive: true, force: true });
    else rmSync(join(dir, "node_modules"), { recursive: true, force: true });
  }
  return out;
}

// ── one BOOTSTRAP attempt — fresh copy of the subject, agent sets up and self-iterates ──
async function runDistroCell({ task, model, rep, solver, metricsFile }) {
  const { dir } = makeDistroSandbox({ runName, task, model, rep, subject: SUBJECT === ROOT ? null : SUBJECT, base: sandboxBase });
  const appFile = join(dir, "my-apps", "app.declare");
  const t0 = Date.now();
  let sc = null, gen = null;
  try {
    gen = await solver.solve({ task, brief: task.brief, model, cwd: dir });
  } catch (e) {
    sc = { ok: false, rungClimbed: 0, rungFailed: 1, compileOk: false, diagnostics: [], report: `solver error: ${e?.message ?? e}`, formatDistance: null };
  }
  if (sc === null) {
    sc = gen?.source == null
      ? { ok: false, rungClimbed: 0, rungFailed: 1, compileOk: false, diagnostics: [], report: "agent produced no my-apps/app.declare", formatDistance: null }
      : await score(appFile, task, { subjectRoot: SUBJECT });
  }
  const cellName = sandboxName({ task, track: "agentic", model, rep });
  const line = {
    ts: new Date().toISOString(), run: runName, task: task.id, track: "agentic", model, rep, solver: solver.id,
    sha: subjectSha, version: subjectVersion,
    briefDoc: "distro:download", iterations: 1, iterationsToGreen: sc.ok ? 1 : null,
    ok: !!sc.ok, rungClimbed: sc.rungClimbed ?? 0, rungFailed: sc.rungFailed ?? null,
    compileOk: !!sc.compileOk, tokens: gen?.tokens ?? null, usage: breakdown(gen), wallMs: Date.now() - t0,
    formatDistance: sc.formatDistance ?? null, idiom: sc.idiom ?? null, diagnostics: sc.diagnostics ?? [],
    cell: cellName,
  };
  appendFileSync(metricsFile, JSON.stringify(line) + "\n");
  // the agent's own account of its run — the qualitative record (what it read,
  // what setup it did, how it iterated) lives in the CLI reply; keep it
  persistCell({ cellName, appFile, sc, gen, line, dir });
  return line;
}

// ── one attempt (a task × track × model cell) ────────────────────────────────
async function runCell({ task, track, model, rep, solver, runDir, metricsFile }) {
  const { dir } = makeSandbox({ runDir, runName, task, track, model, rep, briefDocPath, corpus });
  const appFile = join(dir, "app.declare");
  const t0 = Date.now();
  let tokens = 0, iterations = 0, prior = null, report = null, sc = null;
  const transcript = [];

  const cap = track === "iterated" ? task.maxIterations : 1;
  for (let i = 1; i <= cap; i++) {
    iterations = i;
    let gen;
    try {
      gen = await solver.solve({ task, referenceDoc: REFERENCE_DOC, brief: task.brief, prior, report, model, cwd: dir });
    } catch (e) {
      transcript.push({ iteration: i, error: String(e?.message ?? e) });
      sc = { ok: false, rungClimbed: 0, rungFailed: 1, compileOk: false, diagnostics: [], report: `solver error: ${e?.message ?? e}`, formatDistance: null };
      break;
    }
    tokens += gen.tokens ?? 0;
    writeFileSync(appFile, gen.source);
    sc = await score(appFile, task, { subjectRoot: SUBJECT });
    transcript.push({ iteration: i, tokens: gen.tokens ?? 0, usage: gen.usage ?? null, ok: sc.ok, rungClimbed: sc.rungClimbed, rungFailed: sc.rungFailed, report: sc.report });
    if (sc.ok) break;
    prior = gen.source;
    report = sc.report;
  }

  const wallMs = Date.now() - t0;
  writeFileSync(join(dir, "transcript.json"), JSON.stringify({ task: task.id, track, model, solver: solver.id, transcript }, null, 2));

  const metric = {
    ts: new Date().toISOString(), run: runName, task: task.id, track, model, rep, solver: solver.id,
    sha: subjectSha, version: subjectVersion,
    briefDoc: corpus ? "corpus:docs" : briefDocPath,
    iterations, iterationsToGreen: sc?.ok ? iterations : null,
    ok: !!sc?.ok, rungClimbed: sc?.rungClimbed ?? 0, rungFailed: sc?.rungFailed ?? null,
    compileOk: !!sc?.compileOk, tokens: tokens || null, wallMs,
    formatDistance: sc?.formatDistance ?? null,
    idiom: sc?.idiom ?? null,
    diagnostics: (sc?.diagnostics ?? []).map((d) => ({ code: d.code, phase: d.phase, line: d.line })),
    sandbox: corpus ? dir : join("evals/runs", runName, sandboxName({ task, track, model, rep })),
  };
  appendFileSync(metricsFile, JSON.stringify(metric) + "\n");
  return metric;
}

// ── main ─────────────────────────────────────────────────────────────────────
const tasks = loadTasks(list("tasks", ""));
if (tasks.length === 0) { console.error("no tasks found under evals/tasks/"); process.exit(2); }

// --runs names the results root directly (a round owns its own tree); without it
// the classic layout applies, one directory per run under evals/runs/.
const runDir = val("runs", null) ? resolve(val("runs")) : join(RUNS_DIR, runName);
mkdirSync(runDir, { recursive: true });
const metricsFile = join(runDir, "metrics.jsonl");
writeFileSync(metricsFile, "");
const solver = makeSolver(solverId);

console.log(`eval run '${runName}' — solver=${solverId} · tasks=${tasks.map((t) => t.id).join(",")} · tracks=${tracks.join(",")} · models=${models.join(",")}${repeats > 1 ? ` · ${repeats} reps` : ""}`);
if (SUBJECT !== ROOT) console.log(`  subject ${SUBJECT}${subjectVersion ? ` (v${subjectVersion}` : ""}${subjectSha ? ` @ ${subjectSha.slice(0, 8)}` : ""}${subjectVersion ? ")" : ""} — its verify is the ruler`);
console.log("");

const metrics = [];
for (const task of tasks) {
  for (const track of tracks) {
    for (const model of models) {
      for (let rep = 1; rep <= repeats; rep++) {
        const repLabel = repeats > 1 ? ` · r${rep}` : "";
        process.stdout.write(`  ${task.id} · ${track} · ${model}${repLabel} … `);
        const m = distro
          ? await runDistroCell({ task, model, rep, solver, metricsFile })
          : await runCell({ task, track, model, rep, solver, runDir, metricsFile });
        const green = m.ok ? "green" : `R${m.rungClimbed}${m.rungFailed ? `→✗R${m.rungFailed}` : ""}`;
        const iters = track === "iterated" ? ` (${m.iterations} iter)` : "";
        // report what was actually spent: fresh context + output + turns, not the
        // cache-read-inflated sum (see breakdown())
        const u = m.usage;
        const tok = u ? ` · ${Math.round(u.fresh / 1000)}k in/${Math.round(u.output / 1000)}k out${u.turns ? `/${u.turns}t` : ""}${u.costUsd ? ` · $${u.costUsd.toFixed(2)}` : ""}`
          : m.tokens ? ` · ${m.tokens} tok` : "";
        console.log(`${green}${iters}${tok} · ${(m.wallMs / 1000).toFixed(0)}s`);
        metrics.push(m);
      }
    }
  }
}

// a round writes its own scoreboard beside its evidence; only a classic in-tree
// run rewrites the committed one
const resultsPath = val("runs", null) ? join(runDir, "RESULTS.md") : join(ROOT, "evals/RESULTS.md");
generateResults(metrics, { runName, solverId, resultsPath });
console.log(`\n  metrics → ${metricsFile}`);
console.log(`  results → ${resultsPath}`);

const failed = metrics.filter((m) => !m.ok).length;
console.log(`\n  ${metrics.length - failed}/${metrics.length} cells green.`);
process.exit(0);
