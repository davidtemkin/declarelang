// run-gates — the test chain, with a clock on it, and suites as RULES
// (design record: docs/system-design/derivation.md · usage: docs/operational/derive.md).
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
//   node tools/internal/run-gates.mjs              # what the change-set touches
//   node tools/internal/run-gates.mjs --all        # every suite, unconditionally
//   node tools/internal/run-gates.mjs --timing     # …and per-case detail
//   node tools/internal/run-gates.mjs --only unit,docs,crawl
//   node tools/internal/run-gates.mjs --bail        # stop at the first failure
//
// The suite ORDER is read from package.json's own `test` script rather than
// duplicated here — a second list would drift, and the drift would be silent.
//
// DON'T TEST WHAT'S NOT CHANGED. A suite is a rule: declared inputs, and a
// recorded hash of them from its last GREEN run (.derive/gates.json, untracked
// — the same mechanism derive.mjs uses for build rules, same walker,
// tools/internal/filesets.mjs). A suite whose inputs are byte-identical to the
// last time it passed is reported `skip` and not run; `--all` runs everything,
// and is the right habit before a push and after anything structural.
//
// The maps err COARSE on purpose — every suite depends on the core (runtime,
// compiler, library, its own file, the harness), so a core edit still runs the
// world, and skipping only ever kicks in for scoped edits (docs, one app, the
// server). A suite with NO entry in SUITE_INPUTS always runs: unmapped means
// unskippable, so an unlisted dependency fails safe. The residual risk is a
// mapped list that is too narrow; if a suite ever misses a regression through
// skipping, the fix is its input list, not distrust of the mechanism.

import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { spawnSync, execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fileSet, setHash } from "./filesets.mjs";

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

// Every suite depends on these; a change here runs everything mapped.
const CORE = ["runtime/src", "compiler/src", "library", "test/harness.mjs", "package.json"];
const T = (name) => `test/${name}.test.mjs`;

/** Declared inputs per suite, BEYOND core + its own file. A suite absent from
 *  this map always runs. Coarse over narrow, always. */
const SUITE_INPUTS = {
  // pure core: compiled behavior + fixtures inside the test file itself
  "unit": [], "seam": ["runtime/src"], "diagnostics-hints": [], "databinding": [],
  "materialization": [], "dataschema": [], "datasource-failure": [], "table": [],
  "dep-extract": [], "dep-projection": [], "script-block": [], "static-constraint": [],
  "highlight": [], "inspect": [], "md": [], "themes": [], "html": [], "richtext": [],
  "components": [], "streams": ["server"], "schema-completeness": ["docs/declare-model.json", "tools/internal/doc"],
  // the doc corpus
  "docs": ["docs", "tools/internal/doc", "tools/internal/ops.mjs", "skill", ".claude/skills",
           "apps/homepage/getstarted.md", "apps/homepage/declare-faq.md", "apps/docs", "bundles/version.json"],
  "ops": ["tools", "docs", "skill", ".claude/skills", "apps/homepage/getstarted.md", "apps/homepage/declare-faq.md"],
  // formatting covers every canon .declare file
  "format": ["tools/format.mjs", { dir: "apps", ext: ".declare" }, { dir: "test", ext: ".declare" },
             { dir: "evals", ext: ".declare" }],
  // apps and their drives
  "tracker": ["apps/tracker", "server", "browser"],
  "desktop-input": ["apps/desktop", "server", "browser"],
  "verify-apps": ["apps", "tools/verify.mjs"],
  "crawl": ["apps/homepage", "browser", "server", "docs/declare.md"],
  "gesture": ["test/probe", "browser", "server"],
  "history": ["test/probe", "browser", "server"],
  "perceptual": ["test/probe", "test/artifacts", "browser", "server"],
  // the toolchain and its delivery
  "scaffold": ["compiler/src"],
  "declarec": ["tools/declarec.mjs", "browser", "bundles"],
  "slim": ["tools", "bundles", "browser"],
  "prewarm": ["tools/internal/prewarm.mjs", "bundles/cache", "apps", "docs/declare.md"],
  "serve-parity": ["server", "browser"],
  "serve": ["server", "browser", "bundles"],
  "serve-browser": ["server", "browser", "bundles"],
  // the dumb-static-host contract: the browser compiles the app itself, so
  // the client that feeds its include host and the apps it compiles both count
  "static-host": ["browser", "bundles", "apps"],
  "streams-browser": ["server", "browser"],
  "network-browser": ["server", "browser"],
  "toolchain-realm": ["tools", "server"],
  "hydrate": ["browser", "server", "bundles", "apps/homepage"],
  "prod-parity": ["tools", "browser", "server", "bundles", "apps/homepage"],
  "dist-freshness": ["apps/homepage/dist", "tools", "apps/homepage/stats.json"],
};

// ── The iOS advisory (David, 2026-08-06) ────────────────────────────────────
// The real-device gesture regression (tools/internal/sim/regress.mjs — a
// booted simulator + Appium) is TOO HEAVY for routine gates and is NOT run
// here. What gates do instead is remember: regress.mjs stamps the hash of
// the touch-input sources on a fully green run (.derive/ios-regress.json),
// and when those sources have changed since, the summary below says so —
// an advisory, never a failure. The input list is the surface a real device
// exercises differently from headless Chrome: the router, the two web
// backends' claim/selection realizations, the hit walk, the viewport lock,
// and the rig itself.
const IOS_INPUTS = ["runtime/src/input.ts", "runtime/src/dom-backend.ts",
  "runtime/src/canvas-backend.ts", "runtime/src/interaction.ts",
  "runtime/src/viewport-lock.ts",
  // the rig by extension — a bare dir would sweep node_modules and the
  // ever-growing appium.log, and the stamp would never go quiet
  { dir: "tools/internal/sim", ext: ".mjs" },
  { dir: "tools/internal/sim", ext: ".declare" }];
const IOS_STAMP = resolve(ROOT, ".derive/ios-regress.json");
const iosHash = () => setHash(ROOT, fileSet(ROOT, IOS_INPUTS));

const GATES_MANIFEST = resolve(ROOT, ".derive/gates.json");
const manifest = existsSync(GATES_MANIFEST)
  ? (() => { try { return JSON.parse(readFileSync(GATES_MANIFEST, "utf8")); } catch { return {}; } })()
  : {};
const suiteHash = (s) => {
  const extra = SUITE_INPUTS[s.name];
  if (extra === undefined) return null;                        // unmapped — always runs
  return setHash(ROOT, fileSet(ROOT, [...CORE, s.path, ...extra]));
};

const LOG = resolve(ROOT, "gates.log");
writeFileSync(LOG, `# gates ${new Date().toISOString()}\n`);
const line = (s) => { process.stdout.write(s + "\n"); appendFileSync(LOG, s + "\n"); };

const list = suites();
line(`gates: ${list.length} suite(s) — live log at gates.log`);

const env = { ...process.env, ...(has("--timing") ? { DECLARE_TIMING: "1" } : {}) };
const results = [];
const t0 = Date.now();

let skippedCount = 0;
for (const s of list) {
  const inHash = suiteHash(s);
  if (!has("--all") && inHash !== null && manifest[s.name] === inHash) {
    skippedCount++;
    results.push({ ...s, ms: 0, ok: true, tail: "(inputs unchanged since last green)", skipped: true });
    line(`  skip         --  ${s.name.padEnd(20)} inputs unchanged since last green`);
    continue;
  }
  const started = Date.now();
  const r = spawnSync("node", [s.path], { cwd: ROOT, encoding: "utf8", env, maxBuffer: 1 << 28 });
  const ms = Date.now() - started;
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  // the suite's own summary line is the authoritative verdict; the exit code is
  // the fallback for a suite that died before printing one
  const tail = out.trim().split("\n").filter((l) => /passed,\s*\d+ failed/.test(l)).pop();
  const ok = r.status === 0 && (tail === undefined || / 0 failed/.test(tail));
  results.push({ ...s, ms, ok, tail: tail ?? `exit ${r.status}` });
  if (ok && inHash !== null) manifest[s.name] = inHash;        // green → record; red stays unrecorded and reruns
  else if (!ok) delete manifest[s.name];
  line(`  ${ok ? "ok  " : "FAIL"} ${String((ms / 1000).toFixed(1)).padStart(6)}s  ${s.name.padEnd(20)} ${tail ?? ""}`);
  if (has("--timing")) for (const l of out.split("\n").filter((l) => l.includes("⏱"))) line(`      ${l.trim()}`);
  if (!ok && has("--bail")) break;
}

mkdirSync(dirname(GATES_MANIFEST), { recursive: true });
writeFileSync(GATES_MANIFEST, JSON.stringify(manifest, null, 1) + "\n");

const total = (Date.now() - t0) / 1000;
const failed = results.filter((r) => !r.ok);
line("");
const ranOnly = results.filter((r) => !r.skipped);
line(`gates: ${ranOnly.length - failed.length}/${ranOnly.length} suites green in ${total.toFixed(1)}s`
  + (skippedCount > 0 ? ` (${skippedCount} skipped — inputs unchanged since last green; --all runs everything)` : ""));
// Ranked, because the point is to see where the time actually went. A suite that
// is a tenth of the run is worth naming; the rest is noise.
const ranked = [...results].sort((a, b) => b.ms - a.ms).filter((r) => r.ms / 1000 >= total * 0.02);
if (ranked.length > 0) {
  line("gates: where the time went —");
  for (const r of ranked) {
    line(`   ${String((r.ms / 1000).toFixed(1)).padStart(7)}s  ${String(Math.round((r.ms / 10) / total)).padStart(3)}%  ${r.name}`);
  }
}
{
  const stamped = existsSync(IOS_STAMP)
    ? (() => { try { return JSON.parse(readFileSync(IOS_STAMP, "utf8")).hash; } catch { return null; } })()
    : null;
  if (stamped !== iosHash()) {
    line(`gates: note — touch-input sources changed since the last green iOS regression;`
      + ` when convenient: node tools/internal/sim/regress.mjs <sessionId> (recipe in tools/internal/sim/drive.mjs)`);
  }
}
// ── The prose-audit advisory (same pattern as the iOS one) ──────────────────
// The prose-consistency agent (.claude/agents/prose-consistency.md) is TOO
// HEAVY for gates and runs at intervals; the danger is that "intervals"
// quietly becomes "never" (measured: as of 2026-08-07 it had never run, and
// nothing anywhere said so). The stamp records the audit's date + commit and
// where its report landed (docs/system-design/audits/); this advisory counts
// how far the prose corpus has moved since, and starts asking past a
// threshold. An advisory, never a failure.
{
  const PROSE_STAMP = resolve(ROOT, ".derive/prose-audit.json");
  const PROSE_PATHS = ["docs/declare.md", "docs/guide", "docs/operational", "README.md",
    "apps/homepage/getstarted.md", "apps/homepage/declare-faq.md", "skill", "tools/internal/doc/prose"];
  const stamp = existsSync(PROSE_STAMP)
    ? (() => { try { return JSON.parse(readFileSync(PROSE_STAMP, "utf8")); } catch { return null; } })()
    : null;
  try {
    const since = stamp?.commit
      ? execSync(`git rev-list --count ${stamp.commit}..HEAD -- ${PROSE_PATHS.join(" ")}`, { cwd: ROOT, encoding: "utf8" }).trim()
      : null;
    if (stamp === null) {
      line(`gates: note — the prose-consistency audit has NEVER run; after the next surface-moving change,`
        + ` run the prose-consistency agent and stamp .derive/prose-audit.json {date, commit, report}`);
    } else if (Number(since) >= 12) {
      line(`gates: note — the prose corpus has moved ${since} commits since the last prose-consistency audit`
        + ` (${stamp.date}, report ${stamp.report ?? "unrecorded"}); consider a fresh run`);
    }
  } catch { /* a shallow or detached checkout answers no advisory */ }
}
if (failed.length > 0) {
  line(`gates: FAILED — ${failed.map((f) => f.name).join(", ")}`);
  process.exitCode = 1;
}
