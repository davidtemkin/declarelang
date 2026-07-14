// score — turn a candidate app.declare into a structured score by running the
// verify ladder (design/verify-and-evals.md §3.5: "verify's JSON report IS the
// score for rungs 1–5"). The eval harness's mechanical oracle: every number
// here is decided by a machine, never a judge.
//
// The candidate lives in a sandbox (where the model wrote it); the ACCEPTANCE
// (assert.mjs / states.mjs / baselines / fixtures) lives in the task dir and is
// never shown to the model. We run verify against the candidate file but point
// its rung-5/6 inputs at the hidden acceptance — so the score measures the
// program against the brief's contract, not against anything the author saw.

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { formatSource } from "../../tools/format.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Run `node tools/verify.mjs … --json` and return its parsed report. */
function runVerify(appFile, opts) {
  const args = [join(ROOT, "tools/verify.mjs"), appFile, "--json", "--rung", String(opts.rung ?? 6)];
  if (opts.typecheck === false) args.push("--no-typecheck");
  if (opts.assert) args.push("--assert", opts.assert);
  if (opts.states) args.push("--states", opts.states);
  if (opts.baselines) args.push("--baselines", opts.baselines);
  if (opts.fixtures) args.push("--fixtures", opts.fixtures);
  return new Promise((res) => {
    const p = spawn("node", args, { cwd: ROOT });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => {
      let report = null;
      try { report = JSON.parse(out); } catch { /* verify crashed before emitting JSON */ }
      res({ code, report, stderr: err, raw: out });
    });
  });
}

/** Character-level diff size between raw source and its canonical form — the
 *  "format distance" metric (§2.9): how far the model's output sits from canon.
 *  0 = already canon. A cheap line-multiset delta, direction-agnostic. */
export function formatDistance(src) {
  let canon;
  try { canon = formatSource(src); } catch { return null; } // unparseable → no distance
  if (canon === src) return 0;
  const bag = (s) => { const m = new Map(); for (const l of s.split("\n")) m.set(l, (m.get(l) ?? 0) + 1); return m; };
  const a = bag(src), b = bag(canon);
  let d = 0;
  for (const [l, n] of a) d += Math.max(0, n - (b.get(l) ?? 0));
  for (const [l, n] of b) d += Math.max(0, n - (a.get(l) ?? 0));
  return d;
}

/**
 * Score a candidate program against a task's hidden acceptance.
 * @param {string} appFile   absolute path to the candidate app.declare
 * @param {object} task      { dir, hasAssert, hasStates, hasBaselines, hasFixtures }
 * @returns normalized score consumed by the runner + RESULTS generator.
 */
export async function score(appFile, task) {
  const opts = { rung: 6 };
  if (task.hasAssert) opts.assert = join(task.dir, "assert.mjs");
  if (task.hasStates) opts.states = join(task.dir, "states.mjs");
  if (task.hasBaselines) opts.baselines = join(task.dir, "baselines");
  if (task.hasFixtures) opts.fixtures = join(task.dir, "fixtures");

  const { report, stderr } = await runVerify(appFile, opts);
  const src = existsSync(appFile) ? readFileSync(appFile, "utf8") : "";

  if (!report) {
    return {
      ok: false, rungClimbed: 0, rungFailed: 1, compileOk: false,
      diagnostics: [], summary: "verify produced no report",
      stderr: stderr.slice(-500), formatDistance: formatDistance(src),
    };
  }

  const errs = (report.diagnostics ?? []).filter((d) => d.severity === "error");
  return {
    ok: report.ok === true,
    rungClimbed: report.rungClimbed ?? 0,
    rungFailed: report.rungFailed ?? null,
    compileOk: report.rungClimbed >= 3, // parsed, resolved, analyzed
    diagnostics: errs.map((d) => ({ code: d.code, phase: d.phase, line: d.line ?? d.pos?.line, message: d.message })),
    boot: report.boot ?? null,
    behavior: report.behavior ?? null,
    visual: report.visual ?? null,
    stats: report.stats ?? null,
    // What verify would print — the exact teaching surface a solver iterates against.
    report: renderForSolver(report),
    formatDistance: formatDistance(src),
  };
}

/** Render a verify JSON report as the compact, fix-naming text a solver reads
 *  between iterations — the same diagnostic voice, no JSON, no stack traces. */
export function renderForSolver(report) {
  const lines = [];
  const r = report.rungFailed;
  if (report.ok) return `verify: clean through R${report.rungClimbed}.`;
  lines.push(`verify: FAILED at rung ${r} (${["", "structure", "resolution", "analysis", "boot", "behavior", "visual"][r] ?? "?"}).`);
  const errs = (report.diagnostics ?? []).filter((d) => d.severity === "error");
  for (const d of errs) lines.push("  " + (d.rendered ?? `${d.message} [${d.code}]`).replace(/\n/g, "\n  "));
  if (report.boot && !report.boot.ok) for (const m of report.boot.errors ?? []) lines.push("  " + m);
  if (report.behavior && !report.behavior.ok) for (const m of report.behavior.failures ?? []) lines.push("  assertion: " + m);
  if (report.visual && !report.visual.ok) for (const m of report.visual.failures ?? []) lines.push("  visual: " + m);
  return lines.join("\n");
}
