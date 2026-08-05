// derive — regenerate every committed artifact that is DERIVED from the tree,
// in dependency order, from one door.
//
// THE PROBLEM THIS EXISTS FOR. Three generated artifacts are committed: the
// prewarm cache (bundles/cache/), the documentation model
// (docs/declare-model.json), and the production builds (apps/*/dist + the
// stats.json they embed). Each had its own regeneration command and its own
// gate, and nothing derived them — so any source edit staled whichever ones
// depended on it, and the knowledge of WHICH to regenerate lived only in the
// text of a test failure. Three of main's commits in a row were instances of
// exactly that, each one a person or an agent reading a failure message and
// running the command it named.
//
// The loop is the bug, not the individual staleness. So: one command that knows
// the graph, runs the stages in order, and reports what moved.
//
// ORDER IS LOAD-BEARING, and it is not obvious — it is why this cannot be a
// checklist someone follows by hand:
//
//   prewarm  writes apps/homepage/stats.json (measured wire figures)
//      └─ declarec EMBEDS stats.json into apps/homepage/dist
//
// so prewarm invalidates the dist every time it moves a number, and a dist
// rebuilt before prewarm is stale the moment prewarm runs. That cycle is what
// made the dist stale on essentially every commit; the repair was not "remember
// to rebuild the dist" but "rebuild it after the thing that invalidates it."
//
// USAGE
//   node tools/internal/derive.mjs                  regenerate what is stale
//   node tools/internal/derive.mjs --check          exit 1 if anything WAS stale
//   node tools/internal/derive.mjs --timing         per-stage cost
//   node tools/internal/derive.mjs --paths          print the derived paths and exit
//
// `--check` is honest rather than clever: every generator here is already
// idempotent and only writes what changed, so the check is "run them, and see
// which outputs moved." That costs a full derive (~13s) and cannot lie, where a
// hand-maintained input list could.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const CHECK = has("--check");
const TIMING = has("--timing");

/** Every path a stage below may write. `--check` and the pre-commit hook both
 *  need this list, and it must not drift from the stages — so it lives once. */
const DERIVED = [
  "bundles/cache",
  "bundles",
  "apps/homepage/stats.json",
  "apps/docs/docs-model.json",
  "apps/docs/chapters",
  "apps/docs/demos",
  "docs/declare-model.json",
  "index.html",
  "apps/*/index.html",
  "service-worker.js",
  "README.md",
  "docs/declare.md",
  "apps/homepage/declare-faq.md",
];

/** The committed production builds, discovered rather than listed — a new app
 *  with a dist should not need this file edited. */
function distApps() {
  const appsDir = join(ROOT, "apps");
  if (!existsSync(appsDir)) return [];
  return readdirSync(appsDir)
    .filter((a) => existsSync(join(appsDir, a, "dist", "BUILD.json")))
    .map((a) => ({ app: a, out: `apps/${a}/dist`, src: `apps/${a}/${a}.declare` }));
}

if (has("--paths")) {
  for (const p of [...DERIVED, ...distApps().map((d) => d.out)]) console.log(p);
  process.exit(0);
}

const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: "pipe", maxBuffer: 1 << 28 });

/** The stages, in the order the graph requires. Each is `[label, fn]`. */
const STAGES = [
  // 1. the compiled toolchain everything downstream runs ON. Incremental; a
  //    no-op when nothing in runtime/src or compiler/src moved.
  ["tsc", () => run("npx", ["tsc", "-b"])],

  // 2. the prewarm cache AND apps/homepage/stats.json. Must precede the dist
  //    builds, which embed stats.json — see the header.
  ["prewarm", () => run("node", ["tools/internal/prewarm.mjs"])],

  // 3. the measured figures, stamped into prose (<!--stat:key--> markers), so a
  //    quoted number cannot rot against the artifact it describes.
  ["stamp-stats", () => run("node", ["tools/internal/stamp-stats.mjs"])],

  // 4-5. the documentation model: extract reads the runtime schemas, the prose
  //      files and the guide; assemble augments the SAME file with spine/links.
  ["extract", () => run("node", ["tools/internal/doc/extract.mjs"])],
  ["assemble", () => run("node", ["tools/internal/doc/assemble.mjs"])],

  // 6. the committed production builds — AFTER prewarm, because they embed
  //    stats.json. This is the edge that was missing entirely.
  ["dist", () => {
    for (const d of distApps()) run("node", ["tools/declarec.mjs", d.src, "-o", d.out, "--crawler"]);
  }],

  // 7. the static surfaces baked from the built page
  ["bake-crawler", () => run("node", ["tools/internal/bake-homepage-crawler.mjs"])],
  ["bake-stubs", () => run("node", ["tools/internal/bake-app-stubs.mjs"])],

  // 8. stale platform bundles, then the cache-busting build id LAST — it hashes
  //    everything above, so it must see their final state.
  ["stamp-version", () => run("node", ["tools/internal/stamp-version.mjs"])],
];

/** A (path → mtime:size) snapshot of every derived FILE.
 *
 *  Not `git status`: that answers "does this differ from the last commit", which
 *  is the wrong question in a tree where the derived artifacts are ALREADY dirty
 *  — a merge in progress, an unstaged rebuild — because then a genuinely stale
 *  artifact is indistinguishable from one that was merely already modified. It
 *  under-reported exactly that way on first use.
 *
 *  CONTENT, not mtime. Most generators here write only what changed, but not all:
 *  extract.mjs rewrites every chapter JSON on every run, so an mtime comparison
 *  called 83 artifacts stale on a tree that was perfectly current. Hashing costs
 *  a read of each derived file twice and answers the question actually being
 *  asked — did the BYTES change — which is the one a reader cares about. */
function snapshotDerived() {
  const patterns = [...DERIVED, ...distApps().map((d) => d.out)];
  const seen = new Map();
  const walk = (rel) => {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) return;
    let st; try { st = statSync(abs); } catch { return; }
    if (st.isDirectory()) { for (const e of readdirSync(abs)) walk(join(rel, e)); return; }
    try { seen.set(rel, createHash("sha1").update(readFileSync(abs)).digest("hex")); } catch { /* vanished mid-walk */ }
  };
  for (const p of patterns) {
    if (!p.includes("*")) { walk(p); continue; }
    // one glob shape is used: apps/*/index.html
    const [head, tail] = p.split("*");
    const base = join(ROOT, head);
    if (!existsSync(base)) continue;
    for (const e of readdirSync(base)) walk(join(head, e, tail).replace(/\/+/g, "/"));
  }
  return seen;
}

const before = snapshotDerived();
const t0 = Date.now();
for (const [label, fn] of STAGES) {
  const s = Date.now();
  try { fn(); } catch (e) {
    console.error(`derive: ${label} FAILED\n${(e.stdout ?? "") + (e.stderr ?? e.message)}`);
    process.exit(1);
  }
  if (TIMING) console.log(`  ${String(Date.now() - s).padStart(6)}ms  ${label}`);
}

const after = snapshotDerived();
const total = ((Date.now() - t0) / 1000).toFixed(1);

if (CHECK) {
  // a file this run rewrote (new mtime) or created was stale in the tree
  const stale = [...after.keys()].filter((p) => before.get(p) !== after.get(p));
  if (stale.length > 0) {
    console.error(`derive --check: ${stale.length} artifact(s) were STALE — run \`node tools/internal/derive.mjs\` and stage them:`);
    for (const p of stale) console.error(`   ${p}`);
    process.exit(1);
  }
  console.log(`derive --check: all derived artifacts current (${total}s)`);
} else {
  const moved = [...after.keys()].filter((p) => before.get(p) !== after.get(p));
  console.log(`derive: ${moved.length} of ${after.size} derived file(s) regenerated (${total}s)`);
  for (const p of moved.slice(0, 12)) console.log(`   ${p}`);
}
