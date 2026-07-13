// tools/prebuild.mjs — validate every example and generate its static page.
//
// Declare's static site (GitHub Pages) is UNIFORM browser-compile: the deployed
// `.declare` SOURCE is the single source of truth, compiled in the browser on
// load and cached there (web/boot-uniform.js — the OL5 static-deploy model). So
// there is no committed precompiled artifact to keep in sync. This tool instead:
//
//   - COMPILES every examples/<name>/<name>.declare (and every demo) with the
//     Node compiler, failing loudly on any error — the CI/authoring gate that the
//     browser's typecheck-less render path does not provide;
//   - REPORTS each app's compiled size / gzipped weight / LOC;
//   - GENERATES a per-example static index.html that boots via boot-uniform.js
//     (except the site, whose page is the hand-authored repo-root index.html).
//
//   node tools/prebuild.mjs
//
// The platform version the browser cache keys on is stamped separately by
// tools/stamp-version.mjs (the commit hook) — it covers runtime + compiler
// bundle + web client + library, so any of those changing drops every cached
// compile. App-source freshness is the browser closure check, no re-stamp needed.

import path from "node:path";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { compile, compileTracked } from "../compiler/dist/compile-node.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const EXAMPLES = path.join(ROOT, "examples");
const RUNTIME_GZ_BYTES = 45 * 1024; // the runtime's real shipping weight (see server/index.mjs)

const fail = (label, c) => {
  if (c.errors?.length) throw new Error(`prebuild: ${label} did not compile:\n` +
    c.errors.map((e) => "  " + (e.pos?.line != null ? `line ${e.pos.line}: ` : "") + e.message).join("\n"));
};

const exampleIndexHtml = (name) => `<!doctype html>
<meta charset="utf-8">
<title>${name} · Declare</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<link rel="icon" type="image/png" sizes="256x256" href="../../assets/favicon.png">
<link rel="apple-touch-icon" href="../../assets/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Declare">
<meta property="og:title" content="${name} · Declare">
<meta property="og:image" content="https://davidtemkin.github.io/declarelang/assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://davidtemkin.github.io/declarelang/assets/og-image.png">
<style>html,body{margin:0;padding:0;background:#0B141B}</style>
<div id="host"></div>
<script type="module">
  // UNIFORM browser-compile: the deployed ${name}.declare is the source of truth.
  // boot-uniform.js compiles it in-browser on first load, caches the compiled
  // program (keyed by the platform BUILD_ID + the source's content hash), and on
  // later loads reuses the cache unless the source or platform changed.
  import boot from "../../web/boot-uniform.js";
  boot({ main: "./${name}.declare" });
</script>
`;

function buildExample(name) {
  const dir = path.join(EXAMPLES, name);
  const appFile = path.join(dir, name + ".declare");
  const src = readFileSync(appFile, "utf8");

  // Compile to VALIDATE (and to measure) — the artifact is not emitted.
  const tracked = compileTracked(src, { originDir: dir, mainId: appFile, props: { backend: "dom" } });
  fail(name + ".declare", tracked);

  const pageWeight = Math.round((RUNTIME_GZ_BYTES + gzipSync(tracked.source).length) / 1024);
  const sourceLines = src.split("\n").filter((l) => { const t = l.trim(); return t !== "" && !t.startsWith("//"); }).length;

  // Validate demos too (the site + docs ship a demos/ dir; the flagship apps don't).
  // No manifest is emitted: a page seeds only the demos it names in boot(), and every
  // other preview is fetched from its demos/ dir ON DEMAND when it first goes live
  // (host-client.js mountPreviews) — the in-process echo of browse-to-run.
  let demos = 0;
  const demoDir = path.join(dir, "demos");
  if (existsSync(demoDir)) {
    for (const f of readdirSync(demoDir).sort()) {
      if (!f.endsWith(".declare")) continue;
      fail(`demo ${f}`, compile(readFileSync(path.join(demoDir, f), "utf8"), {}));
      demos++;
    }
  }

  // The site's page is the repo-root index.html (hand-authored, SEO meta); every
  // other example gets a generated static index.html next to its sources.
  if (name !== "site") writeFileSync(path.join(dir, "index.html"), exampleIndexHtml(name));

  return { name, program: tracked.source.length, demos, pageWeight, sourceLines, deps: tracked.closure.entries.length };
}

// The library file index: every source under library/src, so the browser boot
// can prefetch them ALL (not just manifest tags) — the include search path's
// second root must be fully present for a bare `include` to resolve in-browser,
// mirroring the Node fs host, which can read any library file on demand.
const libSrc = path.join(ROOT, "library", "src");
const libFiles = existsSync(libSrc) ? readdirSync(libSrc).filter((f) => f.endsWith(".declare")).sort() : [];
writeFileSync(path.join(ROOT, "library", "index.json"), JSON.stringify(libFiles) + "\n");

const names = readdirSync(EXAMPLES).filter((n) => existsSync(path.join(EXAMPLES, n, `${n}.declare`))).sort();
console.log(`prebuild: validating ${names.length} example(s) + generating pages · library {${libFiles.join(", ")}}`);
for (const name of names) {
  const r = buildExample(name);
  console.log(`  ${r.name.padEnd(12)} ${(r.program / 1024).toFixed(1).padStart(6)} KB · ${String(r.demos).padStart(2)} demos · ${String(r.pageWeight).padStart(3)} KB gz · ${String(r.sourceLines).padStart(4)} LOC · ${r.deps} dep(s)`);
}
