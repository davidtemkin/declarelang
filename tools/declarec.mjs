#!/usr/bin/env node
// declarec — Declare's production build (the emit half + CLI).
//
//   node tools/declarec.mjs <app.declare> [-o dist] [--keep-pos] [--quiet]
//
// Precompiles an app (compiler/dist/declarec.js: parse + resolve + typecheck at
// BUILD time → serializable program), bundles the runtime's RUN-PATH ONLY with
// esbuild (minified; the parser + typechecker are tree-shaken out), embeds the
// program, and writes a self-contained, deployable dist/ — the Declare analogue
// of `lzc`. The heavy lifting `buildProduction()` is exported so the dev server
// can produce (and cache) the same artifact on demand.

import { readFile, writeFile, mkdir, cp, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import * as esbuild from "esbuild";
import { compileProgram } from "../compiler/dist/declarec.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME = resolve(HERE, "../runtime/dist"); // the run-path lives here

const shortHash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 8);
const kb = (n) => (n / 1024).toFixed(1) + " KB";
const gz = (s) => gzipSync(Buffer.from(s)).length;

/** Produce the deployable artifacts (in memory) for one app source.
 *  Returns { ok, errors, files: [{name, contents}], program, sizes }.
 *  `files` are the generated app files (index.html + app.<hash>.js); data
 *  assets are copied separately (CLI) or served from the source dir (server). */
export async function buildProduction(source, opts = {}) {
  const name = opts.name ?? "app";
  const built = compileProgram(source, { originDir: opts.originDir, stripPos: opts.stripPos ?? true });
  if (built.program === null) {
    return { ok: false, errors: built.errors, warnings: built.warnings, files: [], sizes: null };
  }

  // The program is embedded as a JSON string parsed at boot — JSON.parse is far
  // faster than the JS parser on a large object literal, and keeps the bundle
  // clean for the minifier. The backend is a build choice: DOM (managed
  // elements) or Canvas (one <canvas>, the app painted by the runtime's own
  // display list). Only the chosen backend is bundled.
  const canvas = opts.backend === "canvas";
  const backend = canvas
    ? { cls: "CanvasBackend", file: "canvas-backend.js" }
    : { cls: "DomBackend", file: "dom-backend.js" };
  const programJson = JSON.stringify(built.program);
  const entry =
    `import { renderProgramAsync } from ${JSON.stringify(join(RUNTIME, "boot.js"))};\n` +
    `import { ${backend.cls} } from ${JSON.stringify(join(RUNTIME, backend.file))};\n` +
    `const PROGRAM = JSON.parse(${JSON.stringify(programJson)});\n` +
    `const host = document.getElementById("host");\n` +
    `if (host) renderProgramAsync(PROGRAM, host, new ${backend.cls}());\n`;

  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: RUNTIME, loader: "js", sourcefile: name + ".entry.js" },
    bundle: true, minify: true, format: "esm", target: "es2020",
    write: false, legalComments: "none",
  });
  const appJs = result.outputFiles[0].text;
  const appName = `app.${shortHash(appJs)}.js`;

  const html =
    `<!doctype html><meta charset="utf-8"><title>${name}</title>\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<style>html,body{margin:0;padding:0;height:100%}</style>\n` +
    `<div id="host"></div>\n` +
    `<script type="module" src="./${appName}"></script>\n`;

  const sizes = {
    programRaw: programJson.length,
    appRaw: appJs.length,
    appGzip: gz(appJs),
    htmlRaw: html.length,
    htmlGzip: gz(html),
    totalGzip: gz(appJs) + gz(html),
  };
  return {
    ok: true, errors: [], warnings: built.warnings, program: built.program, sizes,
    files: [{ name: "index.html", contents: html }, { name: appName, contents: appJs }],
  };
}

// Dev-only siblings that must never land in a production build (they'd clobber
// the generated files or bloat the deploy): the app source, the generated
// files, dev host artifacts, VCS/OS cruft, and any dotdir (e.g. the server's
// own `.prod-cache` output dir, which must not recurse into itself).
const SKIP_DIRS = new Set(["dist", "prebuilt", "node_modules"]);
const SKIP_FILES = new Set(["index.html", ".DS_Store"]);

/** Copy the runtime assets the app fetches by relative url (data/, fonts,
 *  images) — every sibling of the source EXCEPT `.declare` sources, the
 *  generated output, and dev/VCS cruft. */
async function copyAssets(srcDir, outDir) {
  const copied = [];
  for (const entry of await readdir(srcDir, { withFileTypes: true })) {
    const { name } = entry;
    if (name.startsWith(".") || name.endsWith(".declare") || name.startsWith("app.")) continue;
    if (entry.isDirectory() && SKIP_DIRS.has(name)) continue;
    if (entry.isFile() && SKIP_FILES.has(name)) continue;
    await cp(join(srcDir, name), join(outDir, name), { recursive: true });
    copied.push(name);
  }
  return copied;
}

/** Build an app AND write the deployable tree to `outDir` (generated files +
 *  copied assets). The shared emit used by the CLI and the dev server. Returns
 *  the buildProduction result plus `{ outDir, appName, assets }`. On a compile
 *  error, returns `{ ok:false, errors }` and writes nothing. */
export async function writeProduction({ source, name = "app", srcDir = null, outDir, stripPos = true, backend }) {
  const out = await buildProduction(source, { name, originDir: srcDir, stripPos, backend });
  if (!out.ok) return out;
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const f of out.files) await writeFile(join(outDir, f.name), f.contents);
  const assets = srcDir ? await copyAssets(srcDir, outDir) : [];
  const appName = out.files.find((f) => f.name.startsWith("app."))?.name;
  return { ...out, outDir, appName, assets };
}

async function cli(argv) {
  const args = argv.slice(2);
  let input = null, outDir = null, keepPos = false, quiet = false, backend = "dom";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-o" || a === "--out") outDir = args[++i];
    else if (a === "--keep-pos") keepPos = true;
    else if (a === "--quiet") quiet = true;
    else if (a === "--canvas") backend = "canvas";
    else if (a === "--backend") backend = args[++i];
    else if (!a.startsWith("-")) input = a;
  }
  if (input === null) {
    console.error("usage: declarec <app.declare> [-o dist] [--canvas] [--keep-pos] [--quiet]");
    process.exit(2);
  }
  const srcPath = resolve(input);
  const srcDir = dirname(srcPath);
  const name = basename(srcPath, ".declare");
  outDir = resolve(outDir ?? join(srcDir, "dist"));

  const source = await readFile(srcPath, "utf8");
  const t0 = Date.now();
  const out = await writeProduction({ source, name, srcDir, outDir, stripPos: !keepPos, backend });
  const ms = Date.now() - t0;

  if (!out.ok) {
    console.error(`declarec: ${out.errors.length} error(s) in ${input}`);
    for (const e of out.errors.slice(0, 20)) {
      const at = e.pos ? ` (offset ${e.pos.offset})` : "";
      console.error(`  ✗ ${e.message}${at}`);
    }
    process.exit(1);
  }

  const assets = out.assets;
  if (!quiet) {
    console.log(`declarec ✓ ${name} → ${outDir}  (${ms} ms)`);
    console.log(`  ${out.appName}`);
    console.log(`    program JSON   ${kb(out.sizes.programRaw)}  (embedded)`);
    console.log(`    app bundle     ${kb(out.sizes.appRaw)} raw   ${kb(out.sizes.appGzip)} gzip`);
    console.log(`    index.html     ${kb(out.sizes.htmlRaw)} raw   ${kb(out.sizes.htmlGzip)} gzip`);
    console.log(`    ── total over the wire (gzip): ${kb(out.sizes.totalGzip)} ──`);
    if (assets.length) console.log(`  assets: ${assets.join(", ")}`);
    if (out.warnings.length) console.log(`  ${out.warnings.length} warning(s)`);
  }
}

// Run as CLI when invoked directly (not when imported by the server).
if (import.meta.url === `file://${process.argv[1]}`) {
  cli(process.argv).catch((e) => { console.error(e); process.exit(1); });
}
