// derive — every committed artifact that is DERIVED from the tree, as a RULE
// GRAPH (design record: docs/system-design/derivation.md · usage:
// docs/operational/derive.md): declared inputs, declared outputs, order validated against the
// declarations, and a rule skipped when nothing it reads has changed.
//
// This is a make, structured as one because the problem is make-shaped and the
// previous shape — nine stages in a hand-maintained order, all running
// unconditionally — failed in exactly the ways make exists to prevent:
//
//   · ORDER BY COMMENT. The order was right because a comment said so. When
//     extract quietly grew a read of bundles/version.json — written five stages
//     later — nothing objected, and every committed model trailed the build id
//     by one derive. That was a CYCLE (extract → version.json → stamp-version →
//     bundles/cache → prewarm), survivable only because one edge happened to be
//     weak. Here, a rule whose input is produced by a LATER rule is a build
//     error that names both rules and the file.
//
//   · EVERYTHING, ALWAYS. A no-op derive cost ~21s — extract alone re-reading
//     every prose file and re-measuring every island stage to conclude nothing
//     changed — and the pre-commit hook pays it on every commit. Here a rule
//     runs only when the hash of its declared inputs differs from the manifest
//     (.derive/manifest.json, untracked); a doc edit runs the doc rules and a
//     commit touching neither runs nearly nothing. The gates remain the
//     backstop for a wrongly-narrow input list: assemble --check, the prewarm
//     freshness gate and dist-freshness all verify content independently.
//
//   · TWO AUTHORS, ONE FILE. extract and assemble both wrote
//     docs/declare-model.json; a bare extract deleted assemble's half. Now
//     extract writes an untracked intermediate (.derive/docs-extract.json),
//     assemble is the committed model's only author, and two rules declaring
//     the same output is a build error.
//
// A rule's own tool sources are among its inputs, so editing a generator reruns
// it. Input hashes are recorded AFTER the rule runs (the post-image), so a rule
// that stamps one of its own inputs (assemble → docs/operational markers)
// settles immediately instead of re-triggering itself once per derive.
//
// STAMPS vs OUTPUTS. An output is a file this rule authors whole. A stamp is a
// marker-delimited or token write INTO a file someone else authors (a `?v=`, a
// `<!--stat-->` figure, a baked region). Stamps participate in ordering — a rule
// reading a stamped file runs after the stamper — but not in tamper detection,
// because the surrounding file is legitimately edited by hand.
//
// USAGE
//   node tools/internal/derive.mjs                regenerate what is stale
//   node tools/internal/derive.mjs --all          ignore the manifest, run everything
//   node tools/internal/derive.mjs --check        RUNS everything, then exit 1 if anything WAS stale
//   node tools/internal/derive.mjs --dry          READ-ONLY: exit 1 if anything IS stale, writing nothing
//   node tools/internal/derive.mjs --timing       per-rule cost + skip report
//   node tools/internal/derive.mjs --paths        print the committed derived paths

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fileSet as fileSetIn, setHash as setHashIn, fileHash as fileHashIn, forget } from "./filesets.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const CHECK = has("--check");
// --dry is the READ-ONLY probe --check is not: --check runs every stale rule and
// only then reports, which is the right thing before a release and the wrong
// thing in a pre-commit hook, where the whole point is to answer "would this
// need work?" without doing the work. Same freshness test, no rule ever run, no
// manifest written.
const DRY = has("--dry");
const TIMING = has("--timing");
const ALL = has("--all");

// Every rule command runs under a HARD deadline, killed outright on overrun
// (SIGKILL — no cooperation asked). Several rules execute app code in-process
// (dist --crawler, prewarm, bake-crawler boot real programs), so an app bug —
// a leaked timer, a runaway loop, a never-settling fetch — must be able to
// fail a BUILD STEP but never wedge the pipeline (2026-08-08: four derive
// runs from three sessions sat forever behind one app's setInterval). 300s is
// ~12x the slowest rule's cold cost; a step that genuinely needs longer is a
// step to split, not a timeout to raise.
const RULE_TIMEOUT_MS = 300_000;
const run = (cmd, args) => execFileSync(cmd, args, {
  cwd: ROOT, encoding: "utf8", stdio: "pipe", maxBuffer: 1 << 28,
  timeout: RULE_TIMEOUT_MS, killSignal: "SIGKILL",
});

/** The committed production builds, discovered rather than listed — a new app
 *  with a dist should not need this file edited. */
function distApps() {
  const appsDir = join(ROOT, "apps");
  if (!existsSync(appsDir)) return [];
  return readdirSync(appsDir)
    .filter((a) => existsSync(join(appsDir, a, "dist", "BUILD.json")))
    .map((a) => ({ app: a, out: `apps/${a}/dist`, src: `apps/${a}/${a}.declare` }));
}

// ── the rules ────────────────────────────────────────────────────────────────
// Input/output specs: a string is a file or a directory (recursive); an object
// is a filtered walk { dir, ext?, exclude?: [dir names], pre?/notPre?: basename
// prefix }; "apps/*/index.html" is the one glob shape in use. Every rule lists
// its own tool sources as inputs. The prefix filters exist for one real case:
// apps/docs/demos/ holds AUTHORED per-class examples beside GENERATED seg_*
// islands — extract reads the former and owns the latter, and the whole-dir
// claim was the first thing the graph validator rejected.

const RULES = [
  {
    name: "tsc", always: true,       // tsc owns its own incrementality (~0.4s no-op)
    inputs: ["runtime/src", "compiler/src", "tsconfig.json", "runtime/tsconfig.json", "compiler/tsconfig.json"],
    outputs: [],                     // dist dirs are inputs to later rules, not managed artifacts
    run: () => run("npx", ["tsc", "-b"]),
  },
  {
    name: "bundles",                 // the committed platform bundles — pure functions of tree inputs
    inputs: ["tools/internal/bundle-freshness.mjs", "tools/internal/build-boot.mjs", "tools/internal/build-compiler.mjs",
             "runtime/dist", "compiler/dist", "browser"],
    outputs: [{ dir: "bundles", exclude: ["cache", "version.json"] }],
    run: () => run("node", ["--input-type=module", "-e",
      `import { rebuildStale } from "${join(ROOT, "tools/internal/bundle-freshness.mjs")}"; rebuildStale("${ROOT}", { log: console.log });`]),
  },
  {
    name: "stats",                   // the measured figures (in-memory production builds; no crawl, no prose read)
    inputs: ["tools/internal/prewarm.mjs", "tools/declarec.mjs", "compiler/dist", "runtime/dist", "library", "browser",
             { dir: "apps", ext: ".declare", exclude: ["dist"], notPre: "seg_" }],
    outputs: ["apps/homepage/stats.json"],
    run: () => run("node", ["tools/internal/prewarm.mjs", "--stats-only"]),
  },
  {
    name: "stamp-stats",             // measured figures into prose citations
    inputs: ["tools/internal/stamp-stats.mjs", "apps/homepage/stats.json"],
    outputs: [],
    stamps: ["README.md", "docs/declare.md", "apps/homepage/declare-faq.md"],
    run: () => run("node", ["tools/internal/stamp-stats.mjs"]),
  },
  {
    name: "prewarm",                 // the compiled-program cache + crawl artifacts. AFTER stamp-stats,
                                     // because the homepage crawl fetches the FAQ and docs/declare.md —
                                     // as one pass with stats, the cached crawl carried LAST round's
                                     // stamped figures (the buildId lag's third sibling; found by this graph)
    inputs: ["tools/internal/prewarm.mjs", "compiler/dist", "runtime/dist", "library",
             { dir: "apps", ext: ".declare", exclude: ["dist"], notPre: "seg_" },
             "apps/homepage/demos", "apps/homepage/stats.json",
             "apps/homepage/declare-faq.md", "apps/homepage/getstarted.md", "docs/declare.md"],
    outputs: ["bundles/cache"],
    run: () => run("node", ["tools/internal/prewarm.mjs", "--no-stats"]),
  },
  {
    name: "extract",                 // the doc tree: intermediate model + the docs app's chapters and demo islands
    inputs: [{ dir: "tools/internal/doc", exclude: ["assemble.mjs"] }, "runtime/dist", "compiler/dist", "library",
             "docs/guide", "docs/tenets",
             { dir: "apps/docs/demos", notPre: "seg_" }],       // the authored per-class examples it embeds
    outputs: [".derive/docs-extract.json", "apps/docs/chapters", "apps/docs/search-index.json",
              { dir: "apps/docs/demos", pre: "seg_" }],         // the generated islands, and only those
    run: () => run("node", ["tools/internal/doc/extract.mjs"]),
  },
  {
    name: "dist",                    // the committed production builds (embed stats.json; crawl fetches declare.md)
    inputs: ["tools/declarec.mjs", "compiler/dist", "runtime/dist", "browser", "library",
             { dir: "bundles", exclude: ["cache", "version.json"] },
             { dir: "apps/homepage", exclude: ["dist", "index.html"] }, "docs/declare.md"],
    outputs: distApps().map((d) => d.out),
    // `--crawler` (the baked static document) is only for the INDEXED surfaces
    // (David's ruling, 2026-08-08) — today that means HOMEPAGE alone. Every
    // other app's dist is a plain production build: crawling it buys nothing a
    // search engine reads, and it executes the app's own code at build time —
    // surface area no app should get by merely having a dist. Docs is indexed
    // in principle but deliberately NOT crawled yet (ruled 2026-08-08): its
    // crawl went from ~1 min to 15–20 min when the 2026-08-05 backlink pass
    // made the full 356-class reference reachable (each cold boot also pays
    // the app's whole-corpus prefetch, ~2.7s). Enabling it needs a design —
    // a warm crawl (crawlAll's warm: true), or projecting the static document
    // from declare-model.json directly, since the reference pages are
    // generated from it anyway.
    run: () => {
      const CRAWLED = new Set(["homepage"]);
      for (const d of distApps()) {
        run("node", ["tools/declarec.mjs", d.src, "-o", d.out, ...(CRAWLED.has(d.app) ? ["--crawler"] : [])]);
      }
    },
  },
  {
    name: "bake-crawler",            // the root page's static extraction (runs the homepage itself)
    inputs: ["tools/internal/bake-homepage-crawler.mjs", "compiler/dist", "runtime/dist", "library",
             { dir: "apps/homepage", exclude: ["dist", "index.html"] }, "docs/declare.md"],
    outputs: [],
    stamps: ["index.html"],
    run: () => run("node", ["tools/internal/bake-homepage-crawler.mjs"]),
  },
  {
    name: "bake-stubs",              // the cold-static stub page per program directory
    inputs: ["tools/internal/bake-app-stubs.mjs", { dir: "apps", ext: ".declare", exclude: ["dist"], notPre: "seg_" }],
    outputs: [],
    stamps: ["apps/*/index.html"],
    run: () => run("node", ["tools/internal/bake-app-stubs.mjs"]),
  },
  {
    name: "stamp-version",           // the cache-busting id, hashed over the finished platform
    inputs: ["tools/internal/stamp-version.mjs", "tools/internal/bundle-freshness.mjs",
             "browser", "compiler/dist", "runtime/dist", "library",
             { dir: "bundles", exclude: ["version.json"] },
             "index.html", "service-worker.js", "apps/*/index.html"],
    outputs: ["bundles/version.json"],
    stamps: ["service-worker.js", "index.html", "apps/*/index.html"],
    run: () => run("node", ["tools/internal/stamp-version.mjs"]),
  },
  {
    name: "assemble",                // the ONE committed doc model + projections; needs the final build id
    inputs: ["tools/internal/doc/assemble.mjs", "tools/internal/doc/links.mjs", "tools/internal/ops.mjs",
             // conceptSpine() reads this file directly (prose/ arrives via the
             // extract intermediate, but concepts.json has no such carrier) —
             // undeclared, an edit to it never invalidated the model and only
             // assemble --check noticed, one gate late
             "tools/internal/doc/concepts.json",
             ".derive/docs-extract.json", "compiler/dist", "runtime/dist", "library",
             "bundles/version.json", "skill/SKILL.md",
             { dir: "docs", exclude: ["declare-model.json"] }],
    outputs: ["docs/declare-model.json", ".claude/skills/declare/SKILL.md"],
    stamps: ["docs/operational/flags.md", "docs/operational/getting-started.md"],
    run: () => run("node", ["tools/internal/doc/assemble.mjs"]),
  },
];

// ── spec → file set (tools/internal/filesets.mjs — shared with run-gates) ────

const fileSet = (specs) => fileSetIn(ROOT, specs);
const setHash = (files) => setHashIn(ROOT, files);
const fileHash = (abs) => fileHashIn(abs);

// ── the graph, validated ─────────────────────────────────────────────────────
// Two invariants, both build errors, both the failure modes this file has
// actually had:
//   1. one author per output — two rules declaring the same output path;
//   2. no forward reads — a rule whose input is an output or stamp of a LATER
//      rule (the buildId cycle, which ran silently for a week).

function validate() {
  const producers = new Map();                                   // path → rule name (outputs only)
  for (const r of RULES) {
    for (const f of fileSet(r.outputs)) {
      const prior = producers.get(f);
      if (prior !== undefined && prior !== r.name) {
        console.error(`derive: INVALID GRAPH — '${f}' is an output of both '${prior}' and '${r.name}'.`);
        console.error(`  One author per committed artifact; make one of them a stamp, or split the file.`);
        process.exit(1);
      }
      producers.set(f, r.name);
    }
  }
  const producedAt = new Map();                                  // path → earliest producing index
  RULES.forEach((r, i) => {
    for (const f of [...fileSet(r.outputs), ...fileSet(r.stamps)]) {
      if (!producedAt.has(f)) producedAt.set(f, i);
    }
  });
  RULES.forEach((r, i) => {
    for (const f of fileSet(r.inputs)) {
      const j = producedAt.get(f);
      if (j !== undefined && j > i) {
        console.error(`derive: INVALID GRAPH — '${r.name}' reads '${f}', which '${RULES[j].name}' produces LATER.`);
        console.error(`  Reorder the rules, or delete the edge — a forward read is a cycle waiting for a second edge.`);
        process.exit(1);
      }
    }
  });
}

// ── the committed derived paths (for the hook and --paths) ───────────────────
// Generated from the rules so it cannot drift from them; .derive/* is untracked
// and excluded. Stamped files are included: the hook must stage them.
function derivedPaths() {
  const out = [];
  for (const r of RULES) {
    for (const s of [...(r.outputs ?? []), ...(r.stamps ?? [])]) {
      const p = typeof s === "object" ? s.dir : s;
      if (p.startsWith(".derive")) continue;
      if (!out.includes(p)) out.push(p);
    }
  }
  return out;
}

if (has("--paths")) {
  for (const p of derivedPaths()) console.log(p);
  process.exit(0);
}

// ── run ──────────────────────────────────────────────────────────────────────

validate();

const MANIFEST = join(ROOT, ".derive/manifest.json");
const manifest = existsSync(MANIFEST)
  ? (() => { try { return JSON.parse(readFileSync(MANIFEST, "utf8")); } catch { return {}; } })()
  : {};

const specKey = (r) => createHash("sha1")
  .update(JSON.stringify({ i: r.inputs, o: r.outputs, s: r.stamps ?? [] })).digest("hex").slice(0, 8);

const t0 = Date.now();
let ran = 0, skipped = 0;
const movedFiles = [];
const staleRules = [];

for (const r of RULES) {
  const key = `${r.name}:${specKey(r)}`;
  const rec = manifest[key];
  const preOut = new Map([...fileSet(r.outputs)].map((f) => [f, fileHash(join(ROOT, f))]));
  const inNow = setHash(fileSet(r.inputs));

  const fresh = !ALL && !r.always && rec !== undefined
    && rec.in === inNow
    && rec.out === setHash(new Set(preOut.keys()));
  if (fresh) {
    skipped++;
    if (TIMING) console.log(`    skip      ${r.name}`);
    continue;
  }

  // READ-ONLY: record the verdict and move on. `always` rules are excluded —
  // they are unconditional by declaration, not evidence that anything is stale.
  if (DRY) { if (!r.always) staleRules.push(r.name); continue; }

  const s = Date.now();
  try { r.run(); } catch (e) {
    if (e.code === "ETIMEDOUT" || e.signal === "SIGKILL") {
      console.error(`derive: ${r.name} KILLED after ${RULE_TIMEOUT_MS / 1000}s — a build step may not hang.`);
      console.error(`  Rules that boot app code (dist --crawler, prewarm, bake-crawler) inherit the app's bugs:`);
      console.error(`  a leaked timer, a runaway loop, a fetch that never settles. Find the app, fix the bug.`);
      console.error((e.stdout ?? "") + (e.stderr ?? ""));
      process.exit(1);
    }
    console.error(`derive: ${r.name} FAILED\n${(e.stdout ?? "") + (e.stderr ?? e.message)}`);
    process.exit(1);
  }
  ran++;

  // Post-image bookkeeping: a rule may have changed its own inputs (stamps) and
  // its outputs — drop stale memo entries and rehash.
  for (const f of [...fileSet(r.inputs), ...fileSet(r.outputs), ...fileSet(r.stamps)]) forget(join(ROOT, f));
  const outSet = fileSet(r.outputs);
  for (const f of outSet) {
    if (preOut.get(f) !== fileHash(join(ROOT, f))) movedFiles.push(f);
  }
  for (const f of preOut.keys()) if (!outSet.has(f)) movedFiles.push(f);   // deleted output
  manifest[key] = { in: setHash(fileSet(r.inputs)), out: setHash(outSet) };
  if (TIMING) console.log(`  ${String(Date.now() - s).padStart(6)}ms  ${r.name}`);
}

// prune manifest entries for renamed/re-specced rules
for (const k of Object.keys(manifest)) {
  if (!RULES.some((r) => k === `${r.name}:${specKey(r)}`)) delete manifest[k];
}
if (!DRY) {
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
}

const total = ((Date.now() - t0) / 1000).toFixed(1);

if (DRY) {
  if (staleRules.length > 0) {
    console.error(`derive --dry: ${staleRules.length} rule(s) STALE — run \`npm run derive\`: ${staleRules.join(", ")}`);
    process.exit(1);
  }
  console.log("derive --dry: all derived artifacts current");
  process.exit(0);
}

if (CHECK) {
  if (movedFiles.length > 0) {
    console.error(`derive --check: ${movedFiles.length} artifact(s) were STALE — run \`node tools/internal/derive.mjs\` and stage them:`);
    for (const p of movedFiles.slice(0, 20)) console.error(`   ${p}`);
    process.exit(1);
  }
  console.log(`derive --check: all derived artifacts current (${ran} ran, ${skipped} skipped, ${total}s)`);
} else {
  console.log(`derive: ${movedFiles.length} derived file(s) regenerated — ${ran} rule(s) ran, ${skipped} skipped (${total}s)`);
  for (const p of movedFiles.slice(0, 12)) console.log(`   ${p}`);
}
