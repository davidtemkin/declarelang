// tools/prebuild.mjs — validate every example (the CI/authoring gate).
//
// Declare's static site (GitHub Pages) is PROGRAM-URL oriented: the deployed
// `.declare` SOURCE is the address AND the source of truth — a navigation to it is
// compiled in the browser on load and cached there (browser/boot-uniform.js), or
// runs a committed precompiled artifact when one still validates against the source
// (browser/prewarm-cache.js). There is NO per-example index.html: the repo-root
// index.html is the ONE curated page; every other program is reached by its program
// URL (browse-to-run). So this tool no longer generates pages — it is the gate:
//
//   - COMPILES every examples/<name>/<name>.declare (and every demo) with the
//     Node compiler, failing loudly on any error — the gate the browser's
//     typecheck-less render path does not provide;
//   - REPORTS each app's compiled size / gzipped weight / LOC;
//   - writes library/index.json — the full library file list the browser prefetches.
//
//   node tools/prebuild.mjs
//
// The platform version the browser cache keys on is stamped separately by
// tools/stamp-version.mjs (the commit hook). App-source freshness is the browser
// closure check (and the prewarm tier's re-probe), no re-stamp needed.

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

function buildExample(name) {
  const dir = path.join(EXAMPLES, name);
  const appFile = path.join(dir, name + ".declare");
  const src = readFileSync(appFile, "utf8");

  // Compile to VALIDATE (and to measure) — the artifact is not emitted.
  const tracked = compileTracked(src, { originDir: dir, mainId: appFile, props: { render: "dom" } });
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
console.log(`prebuild: validating ${names.length} example(s) · library {${libFiles.join(", ")}}`);
for (const name of names) {
  const r = buildExample(name);
  console.log(`  ${r.name.padEnd(12)} ${(r.program / 1024).toFixed(1).padStart(6)} KB · ${String(r.demos).padStart(2)} demos · ${String(r.pageWeight).padStart(3)} KB gz · ${String(r.sourceLines).padStart(4)} LOC · ${r.deps} dep(s)`);
}
