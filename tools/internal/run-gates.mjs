// run-gates — the test chain, with a clock on it.
//
// `npm test` was 44 suites joined by `&&`: one opaque command that prints
// whatever each suite prints and takes as long as it takes. Two failure modes
// follow from that, and both bit on 2026-08-04. A long run is indistinguishable
// from a hang, because nothing says which suite is running or how long the last
// one took. And nothing is measurable, so cost concentrates invisibly — the
// eleven-suite subset measured that day took 7.5 minutes, of which ONE suite
// (`crawl`, 380s) was 85%, and nobody knew.
//
// So: run the same suites in the same order, but emit a line per suite AS IT
// FINISHES, append it to a log, and print a ranked table at the end. Per-CASE
// numbers come from the harness (`DECLARE_TIMING=1`), which is a different
// altitude — a runner can only ever see suites.
//
//   node tools/internal/run-gates.mjs              # all, in npm-test order
//   node tools/internal/run-gates.mjs --timing     # …and per-case detail
//   node tools/internal/run-gates.mjs --only unit,docs,crawl
//   node tools/internal/run-gates.mjs --bail        # stop at the first failure
//
// The suite ORDER is read from package.json's own `test` script rather than
// duplicated here — a second list would drift, and the drift would be silent.

import { readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i < 0 ? null : argv[i + 1]; };

/** The suite list, taken from package.json's `test` script — one source. */
function suites() {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
  const names = [...(pkg.scripts?.test ?? "").matchAll(/node (test\/([a-z0-9-]+)\.test\.mjs)/g)]
    .map((m) => ({ path: m[1], name: m[2] }));
  const only = val("--only");
  if (only === null) return names;
  const want = new Set(only.split(",").map((s) => s.trim()));
  return names.filter((s) => want.has(s.name));
}

const LOG = resolve(ROOT, "gates.log");
writeFileSync(LOG, `# gates ${new Date().toISOString()}\n`);
const line = (s) => { process.stdout.write(s + "\n"); appendFileSync(LOG, s + "\n"); };

const list = suites();
line(`gates: ${list.length} suite(s) — live log at gates.log`);

const env = { ...process.env, ...(has("--timing") ? { DECLARE_TIMING: "1" } : {}) };
const results = [];
const t0 = Date.now();

for (const s of list) {
  const started = Date.now();
  const r = spawnSync("node", [s.path], { cwd: ROOT, encoding: "utf8", env, maxBuffer: 1 << 28 });
  const ms = Date.now() - started;
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  // the suite's own summary line is the authoritative verdict; the exit code is
  // the fallback for a suite that died before printing one
  const tail = out.trim().split("\n").filter((l) => /passed,\s*\d+ failed/.test(l)).pop();
  const ok = r.status === 0 && (tail === undefined || / 0 failed/.test(tail));
  results.push({ ...s, ms, ok, tail: tail ?? `exit ${r.status}` });
  line(`  ${ok ? "ok  " : "FAIL"} ${String((ms / 1000).toFixed(1)).padStart(6)}s  ${s.name.padEnd(20)} ${tail ?? ""}`);
  if (has("--timing")) for (const l of out.split("\n").filter((l) => l.includes("⏱"))) line(`      ${l.trim()}`);
  if (!ok && has("--bail")) break;
}

const total = (Date.now() - t0) / 1000;
const failed = results.filter((r) => !r.ok);
line("");
line(`gates: ${results.length - failed.length}/${results.length} suites green in ${total.toFixed(1)}s`);
// Ranked, because the point is to see where the time actually went. A suite that
// is a tenth of the run is worth naming; the rest is noise.
const ranked = [...results].sort((a, b) => b.ms - a.ms).filter((r) => r.ms / 1000 >= total * 0.02);
if (ranked.length > 0) {
  line("gates: where the time went —");
  for (const r of ranked) {
    line(`   ${String((r.ms / 1000).toFixed(1)).padStart(7)}s  ${String(Math.round((r.ms / 10) / total)).padStart(3)}%  ${r.name}`);
  }
}
if (failed.length > 0) {
  line(`gates: FAILED — ${failed.map((f) => f.name).join(", ")}`);
  process.exitCode = 1;
}
