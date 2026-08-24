// eval-references — every eval task's reference solution must stay green
// against the CURRENT language.
//
// The references live in evals/tasks/*/reference.declare and are the canon each
// task's acceptance was written against. They are also the one corpus that
// exercises idioms the apps and library do not (a drag ghost over a hit-tested
// surface, replicate-then-filter) — which is how a platform change can break
// user-facing semantics while every other suite stays green. Measured
// 2026-08-23: the pointer-corridor change (0762f6fb, 2026-08-17) silently broke
// the shelf reference's drop logic for six days; four verify runs would have
// named it the day it landed. This suite is those runs.
//
// Two tiers, matching the ladder split verify-apps.test.mjs states:
//   npm test         → rungs 1–4 per reference (no browser, seconds)
//   --ladder         → rungs 5 with each task's assert.mjs (Chromium, minutes);
//                      runs inside `npm run test:ladder`
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, summarize } from "./harness.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TASKS = join(ROOT, "evals/tasks");
const LADDER = process.argv.includes("--ladder");

const tasks = readdirSync(TASKS)
  .filter((d) => statSync(join(TASKS, d)).isDirectory())
  .map((id) => ({
    id,
    reference: join(TASKS, id, "reference.declare"),
    assert: join(TASKS, id, "assert.mjs"),
  }))
  .filter((t) => existsSync(t.reference));

for (const t of tasks) {
  const rung = LADDER && existsSync(t.assert) ? "5" : "4";
  await test(`evals/tasks/${t.id} reference climbs R1–R${rung}`, () => {
    const args = [join(ROOT, "tools/verify.mjs"), t.reference, "--json", "--rung", rung];
    if (rung === "5") args.push("--assert", t.assert);
    const r = spawnSync("node", args, { cwd: ROOT, encoding: "utf8" });
    let report = null;
    try { report = JSON.parse(r.stdout); } catch { /* fall through to the throw */ }
    if (!report) throw new Error(`verify produced no report: ${r.stderr.slice(-300)}`);
    if (!report.ok) {
      const errs = (report.diagnostics ?? [])
        .filter((d) => d.severity === "error")
        .map((d) => `${d.code} ${d.message}`);
      throw new Error(`FAILED at R${report.rungFailed}: ${errs[0] ?? (report.behavior?.failures ?? [])[0] ?? "see verify output"}`);
    }
  });
}

summarize("eval-references");
