// tools/internal/prewarm.mjs — generate the COMMITTED pre-warm cache (bundles/cache/).
//
// The static deploy's default model is UNIFORM browser-compile: the deployed
// `.declare` SOURCE is the source of truth, compiled in the browser on load
// (browser/boot-uniform.js). This tool adds an OPTIONAL, additive tier on top —
// a curated set of high-traffic programs shipped PRECOMPILED so the browser can
// render them with no compiler download and no recompile (browser/prewarm-cache.js).
//
//   node tools/internal/prewarm.mjs
//
// For each curated program it writes bundles/cache/<key>.json for two kinds:
//   • run — the compiled program + static deps + source, plus the dependency CLOSURE
//     rewritten for the browser — library reads dropped (BUILD_ID gates them, like
//     the browser's own closure), every remaining entry a DEPLOY-RELATIVE id with a
//     CONTENT-HASH validator the browser re-derives by GET-and-hash. That is what
//     makes the tier self-validating and drift-proof.
//   • segments — { path, segments, metrics } for the code viewer, served by the
//     service worker's `?segments` route (it builds the key itself).
//
// (The `crawler` kind was removed 2026-08-12 — nothing ever read it. See the
// note at the write site.)
//
// NO BUILD_ID is written into the artifacts: they live under bundles/, which the
// derive chain (tools/internal/derive.mjs → stamp-version.mjs) hashes into the
// BUILD_ID AFTER this runs. Embedding the id would be circular; the closure
// re-check is the real freshness gate. The hook runs this BEFORE stamping so a
// commit ships freshly-regenerated artifacts — but correctness never depends on
// it: an un-regenerated artifact simply reads stale and boot falls through to
// compile the live source. Writes are idempotent (only changed files rewritten),
// and artifacts no longer produced are pruned.

import path from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { compileTracked, lineMetrics, highlight } from "../../compiler/dist/compile-node.js";
import { fnv1a } from "../../compiler/dist/closure.js";
import { prewarmKey } from "../../browser/prewarm-cache.js";
import { PREWARMED } from "../../browser/prewarm-manifest.js";
import { buildProduction } from "../declarec.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const CACHE_DIR = path.join(ROOT, "bundles", "cache");

// The curated set is a DECLARATION, and it lives in browser/prewarm-manifest.js so
// the readers can consult it too — boot asks "is there a build for this program?"
// before requesting anything, instead of computing a key and discovering the answer
// as a 404. This tool is one of that list's three readers; it writes an artifact per
// entry. (prewarm-cache.js stays the oracle for HOW a key is computed.)
const PROGRAMS = PREWARMED;

const toPosix = (p) => p.split(path.sep).join("/");

/** Rewrite one disk closure entry for the browser: deploy-relative id + a
 *  content-hash validator (or {missing} preserved). Dirs are dropped by the
 *  caller (the Node include host records only files, but be defensive). */
function browserEntry(e) {
  const id = toPosix(path.relative(ROOT, e.id));
  if (e.v?.missing) return { id, kind: "file", v: { missing: true } };
  return { id, kind: "file", v: { hash: fnv1a(readFileSync(e.id, "utf8")) } };
}

/** The browser-shaped closure for a compile: every FILE the compile read — the
 *  main source, its `include`s, the auto-included component library it actually
 *  resolved, and the manifest — each a deploy-relative content-hash entry. This is
 *  the SAME set compileTracked records on both hosts; the browser re-probes it by
 *  content hash exactly as the Node side re-probes by disk stat, so a component edit
 *  invalidates uniformly with no build step. Only the runtime/compiler BUNDLE stays
 *  out (a load-time artifact, BUILD_ID-gated). Dirs carry no source, so drop them. */
function browserClosure(closure, props) {
  const entries = closure.entries
    .filter((e) => e.kind === "file")
    .map(browserEntry);
  return { entries, props };
}

mkdirSync(CACHE_DIR, { recursive: true });

const generated = new Set();
let wrote = 0, skipped = 0;

function writeArtifact(key, artifact) {
  const file = path.join(CACHE_DIR, key + ".json");
  const json = JSON.stringify(artifact) + "\n";
  generated.add(key + ".json");
  if (existsSync(file) && readFileSync(file, "utf8") === json) { skipped++; return json.length; }
  writeFileSync(file, json);
  wrote++;
  return json.length;
}

// The homepage's figures, computed rather than claimed: line metrics for the
// apps it cites, written beside it as its own material (stats.json — the same
// pattern as language.json, so the live page, the dev server, and both crawls
// read the same bytes). Before the compile loop when both halves run in one
// pass; under derive, its own rule (see the split note below).
if (!process.argv.includes("--no-stats")) {
const stats = {};
for (const rel of ["apps/homepage/homepage.declare", "apps/calendar/calendar.declare",
                   "apps/tracker/tracker.declare", "apps/desktop/desktop.declare"]) {
  const src = readFileSync(path.join(ROOT, rel), "utf8");
  const name = path.basename(rel, ".declare");
  // the "over the wire" figure is the PRODUCTION build (declarec: app + runtime
  // + library slices, gzipped) — the number the homepage's caption promises,
  // not this tool's program-only artifact
  const built = await buildProduction(src, { name, originDir: path.join(ROOT, path.dirname(rel)) });
  if (!built.ok) throw new Error(`prewarm stats: ${rel} failed the production build`);
  stats[name] = { ...lineMetrics(src), wireGzip: built.sizes.totalGzip, programGzip: built.sizes.programGzip };
}
const statsFile = path.join(ROOT, "apps/homepage/stats.json");
const statsJson = JSON.stringify(stats, null, 2) + "\n";
if (!existsSync(statsFile) || readFileSync(statsFile, "utf8") !== statsJson) {
  writeFileSync(statsFile, statsJson);
  console.log(`prewarm: wrote apps/homepage/stats.json (${Object.entries(stats).map(([k, v]) => `${k} ${v.code} code · ${(v.wireGzip / 1024).toFixed(1)}KB gz`).join(", ")})`);
}

}

// The two halves are SEPARATE derive rules, because they sit on opposite sides
// of stamp-stats: the stats above are an input to the figure stamping, while the
// compile-and-crawl loop below READS the stamped prose — the homepage crawl
// fetches declare-faq.md and docs/declare.md, so it must run after their figures
// are current. As one pass, the crawl always carried LAST round's figures (the
// same one-round lag the buildId had), which the derive graph refused the moment
// the edges were declared. `--stats-only` is the first rule; `--no-stats` the
// second; a bare run still does both, stats first (the standalone behavior).
if (process.argv.includes("--stats-only")) process.exit(0);

console.log(`prewarm: generating committed cache for ${PROGRAMS.length} program(s) → bundles/cache/`);
// `--timing`: a line per STEP as it happens, with its own cost. This script is the
// slowest thing in the commit path — it recompiles every program and executes the
// crawler pages to t=0 (in Node; no browser is involved) — and it printed only a
// per-program summary AFTER the work, so a long run was indistinguishable from a
// hang. Real-time visibility is worth one flag.
const TIMING = process.argv.includes("--timing");
let stepT0 = Date.now();
const step = (label) => {
  if (!TIMING) return;
  const dt = Date.now() - stepT0;
  stepT0 = Date.now();
  process.stdout.write(`  ${String(dt).padStart(6)}ms  ${label}\n`);
};

for (const prog of PROGRAMS) {
  const absMain = path.join(ROOT, prog.main);
  if (!existsSync(absMain)) throw new Error(`prewarm: ${prog.main} does not exist`);
  const src = readFileSync(absMain, "utf8");

  const tracked = compileTracked(src, { originDir: path.dirname(absMain), mainId: absMain, props: prog.props });
  if (tracked.source === null || tracked.errors?.length) {
    throw new Error(`prewarm: ${prog.main} did not compile:\n` +
      (tracked.errors ?? []).map((e) => "  " + (e.pos?.line != null ? `line ${e.pos.line}: ` : "") + e.message).join("\n"));
  }
  const closureRun = browserClosure(tracked.closure, prog.props);

  const sizes = [];
  writeArtifact(prewarmKey(prog.main, "run", prog.props), {
    main: prog.main, kind: "run", props: prog.props,
    program: tracked.source, deps: tracked.deps, source: src,
    closure: closureRun,
  });
  sizes.push(`run ${(gzipSync(Buffer.from(JSON.stringify({ program: tracked.source }))).length / 1024).toFixed(1)}KB gz`);
  step(`${prog.main} · compile + run artifact`);
  {
    // The VIEWER artifacts — every prebaked app ships its reader too: the
    // highlighted segments and line metrics the dev server serves as
    // `?segments`, here committed so the static host's viewer (standalone or
    // embedded) shows the same reader. READ BY THE SERVICE WORKER, which builds
    // the key itself (service-worker.js segmentsResponse) rather than going
    // through loadPrewarm — so a grep for loadPrewarm call sites does not find
    // this consumer. Validated against the ONE file the segments derive from —
    // the program's own source; a miss falls through to the raw bytes, which is
    // the viewer's plain-code fallback.
    const payload = { path: prog.main, segments: highlight(src), metrics: lineMetrics(src) };
    writeArtifact(prewarmKey(prog.main, "segments", {}), {
      main: prog.main, kind: "segments", props: {},
      payload,
      closure: { entries: [{ id: prog.main, kind: "file", v: { hash: fnv1a(src) } }], props: {} },
    });
    sizes.push(`segments ${(gzipSync(Buffer.from(JSON.stringify(payload))).length / 1024).toFixed(1)}KB gz`);
  }
  step(`${prog.main} · segments`);
  // The `crawler` kind was removed 2026-08-12 — the ONLY one that was truly dead.
  // It was unreachable (boot-extract.js asked loadPrewarm for kind "seo"; this
  // wrote "crawler", so the key never matched, and the identity guard would have
  // refused it anyway), redundant, and structurally unfit: it is reachable only
  // through `?extract`, which needs a browser running JS with the service worker
  // installed — which a crawler is not. Crawler content has to be IN THE HTML,
  // and it is: bake-homepage-crawler.mjs injects the homepage's extraction into
  // index.html itself. A second page wanting it is another BAKE, not a kind here.
  console.log(`  ${prog.main.padEnd(38)} ${closureRun.entries.length} dep(s) · ${sizes.join(" · ")}`);
}

// Prune artifacts no longer produced (a program dropped from the curated set, or
// a kind removed) so bundles/cache/ exactly reflects the manifest.
let pruned = 0;
for (const f of readdirSync(CACHE_DIR)) {
  if (f.endsWith(".json") && !generated.has(f)) { unlinkSync(path.join(CACHE_DIR, f)); pruned++; }
}

console.log(`prewarm: ${wrote} written, ${skipped} unchanged${pruned ? `, ${pruned} pruned` : ""} · ${generated.size} artifact(s)`);
