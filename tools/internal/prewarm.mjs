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
// For each curated program it writes bundles/cache/<key>.json carrying:
//   • run — the compiled program + static deps + source, plus the dependency
//     CLOSURE rewritten for the browser: library reads dropped (BUILD_ID gates
//     them, like the browser's own closure), every remaining entry a
//     DEPLOY-RELATIVE id with a CONTENT-HASH validator the browser re-derives by
//     GET-and-hash. This is what makes the tier self-validating and drift-proof.
//   • crawler — the static-extraction document (docs/system-design/capabilities.md §5), executed
//     headlessly to t=0, under the SAME closure so it invalidates on the same edits.
//
// NO BUILD_ID is written into the artifacts: they live under bundles/, which the
// commit hook (tools/internal/hooks/pre-commit → stamp-version.mjs) hashes into the
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
import { compileTracked, crawlDocument, diskDataResolver, crawlerDocument, lineMetrics } from "../../compiler/dist/compile-node.js";
import { fnv1a } from "../../compiler/dist/closure.js";
import { prewarmKey } from "../../browser/prewarm-cache.js";
import { buildProduction } from "../declarec.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const LIBRARY_ROOT = path.join(ROOT, "library");
const CACHE_DIR = path.join(ROOT, "bundles", "cache");

// The curated set. Small on purpose — the flagship, high-traffic pages, the ones
// whose compiler-free first paint is worth committing an artifact for. Everything
// else stays pure browser-compile (this tier is additive, never required). `kinds`
// selects which artifacts to emit: "run" (the compiled program) and/or "crawler" (the
// static-extraction document, for content pages crawlers read).
const PROGRAMS = [
  { main: "apps/homepage/homepage.declare", props: { render: "dom" }, kinds: ["run", "crawler"] },
  { main: "apps/calendar/calendar.declare", props: { render: "dom" }, kinds: ["run"] },
  { main: "apps/docs/docs.declare", props: { render: "dom" }, kinds: ["run", "crawler"] },
  { main: "apps/desktop/desktop.declare", props: { render: "dom" }, kinds: ["run"] },
];

const toPosix = (p) => p.split(path.sep).join("/");
const underLibrary = (abs) => abs === LIBRARY_ROOT || abs.startsWith(LIBRARY_ROOT + path.sep);

/** Rewrite one disk closure entry for the browser: deploy-relative id + a
 *  content-hash validator (or {missing} preserved). Dirs are dropped by the
 *  caller (the Node include host records only files, but be defensive). */
function browserEntry(e) {
  const id = toPosix(path.relative(ROOT, e.id));
  if (e.v?.missing) return { id, kind: "file", v: { missing: true } };
  return { id, kind: "file", v: { hash: fnv1a(readFileSync(e.id, "utf8")) } };
}

/** The browser-shaped closure for a compile: the main file + local includes,
 *  each a deploy-relative content-hash entry. Library reads and the manifest are
 *  dropped — BUILD_ID gates them, exactly as the browser's own compileTracked
 *  excludes them (compile-browser.ts). */
function browserClosure(closure, props) {
  const entries = closure.entries
    .filter((e) => e.kind === "file" && !underLibrary(e.id))
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
// read the same bytes). Written BEFORE the compile loop so the
// homepage crawl below (and the bake after it) reads this run's figures,
// never last commit's.
const stats = {};
for (const rel of ["apps/homepage/homepage.declare", "apps/calendar/calendar.declare"]) {
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

console.log(`prewarm: generating committed cache for ${PROGRAMS.length} program(s) → bundles/cache/`);
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
  if (prog.kinds.includes("run")) {
    const n = writeArtifact(prewarmKey(prog.main, "run", prog.props), {
      main: prog.main, kind: "run", props: prog.props,
      program: tracked.source, deps: tracked.deps, source: src,
      closure: closureRun,
    });
    sizes.push(`run ${(gzipSync(Buffer.from(JSON.stringify({ program: tracked.source }))).length / 1024).toFixed(1)}KB gz`);
  }
  if (prog.kinds.includes("crawler")) {
    // The CRAWLED document — every reachable location's content in the one page
    // (location.md §7). Data resolves from the program's own directory only (the
    // build-time rule); a network DataSource fails this script loudly.
    const html = await crawlDocument(tracked.source, {
      deps: tracked.deps, links: tracked.links,
      data: diskDataResolver(path.join(ROOT, path.dirname(prog.main))),
    });
    const name = path.basename(prog.main).replace(/\.declare$/, "");
    const document = html === null ? crawlerDocument("", name) : crawlerDocument(html, name);
    writeArtifact(prewarmKey(prog.main, "crawler", {}), {
      main: prog.main, kind: "crawler", props: {},
      document,
      closure: browserClosure(tracked.closure, {}),   // backend-independent
    });
    sizes.push(`crawler ${((document.length) / 1024).toFixed(1)}KB`);
  }
  console.log(`  ${prog.main.padEnd(38)} ${closureRun.entries.length} dep(s) · ${sizes.join(" · ")}`);
}

// Prune artifacts no longer produced (a program dropped from the curated set, or
// a kind removed) so bundles/cache/ exactly reflects the manifest.
let pruned = 0;
for (const f of readdirSync(CACHE_DIR)) {
  if (f.endsWith(".json") && !generated.has(f)) { unlinkSync(path.join(CACHE_DIR, f)); pruned++; }
}

console.log(`prewarm: ${wrote} written, ${skipped} unchanged${pruned ? `, ${pruned} pruned` : ""} · ${generated.size} artifact(s)`);
