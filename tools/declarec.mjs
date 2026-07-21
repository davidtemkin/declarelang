#!/usr/bin/env node
// declarec — Declare's production build (the emit half + CLI).
//
//   node tools/declarec.mjs <app.declare> [-o dist] [--canvas] [--crawler] [--extract] [--debug] [--quiet]
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
import { REGISTRY_MANIFEST } from "../runtime/dist/registry.js";
import { parseArgvFlags, DEFAULT_FLAGS } from "../compiler/dist/flags.js";
import { highlight } from "../compiler/dist/highlight.js";
import { compile as compileFull, crawlExtract, diskDataResolver, crawlerDocument } from "../compiler/dist/compile-node.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME = resolve(HERE, "../runtime/dist"); // the run-path lives here
const TABLES = ["TAGS", "LAYOUTS", "LAYOUT_BASES", "DATA", "ANIMATORS", "ANIMATOR_GROUPS", "STATES"];

/** Generate a SLIM registry.js — the name→class tables carrying ONLY the
 *  component classes `usedNames` covers. Substituted for the full registry.js at
 *  bundle time (the esbuild plugin below), so every unused component class —
 *  and the modules reachable only through it (the Markdown/HTML parsers, etc.) —
 *  is dropped by tree-shaking. The dev path keeps the full module untouched. */
function slimRegistrySource(usedNames) {
  const used = new Set(usedNames);
  const entries = REGISTRY_MANIFEST.filter((e) => used.has(e.name));
  const imports = new Map(); // module → Set(export) — deduped
  for (const e of entries) {
    if (!imports.has(e.module)) imports.set(e.module, new Set());
    imports.get(e.module).add(e.export);
  }
  const importLines = [...imports].map(([mod, exps]) =>
    `import { ${[...exps].join(", ")} } from ${JSON.stringify("./" + mod)};`).join("\n");
  const table = (t) => {
    const pairs = entries.filter((e) => e.table === t)
      .map((e) => (e.name === e.export ? e.name : `${JSON.stringify(e.name)}: ${e.export}`));
    return `export const ${t} = { ${pairs.join(", ")} };`;
  };
  return `${importLines}\n${TABLES.map(table).join("\n")}\n`;
}

const shortHash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 8);
const kb = (n) => (n / 1024).toFixed(1) + " KB";
const gz = (s) => gzipSync(Buffer.from(s)).length;

/** Produce the deployable artifacts (in memory) for one app source.
 *  Returns { ok, errors, files: [{name, contents}], program, sizes }.
 *  `files` are the generated app files (index.html + app.<hash>.js); data
 *  assets are copied separately (CLI) or served from the source dir (server). */
export async function buildProduction(source, opts = {}) {
  const name = opts.name ?? "app";
  // The build's closure props: every flag that shapes the ARTIFACT (a change
  // to any invalidates a cache exactly like a file change), plus whatever the
  // caller adds (the server contributes its toolchain fingerprint).
  const props = {
    render: opts.render === "canvas" ? "canvas" : "dom",
    slim: String(opts.slim !== false),
    stripPos: String(opts.stripPos ?? true),
    typecheck: "true",   // always on — a mandatory phase of the one compile (docs/system-design/requests.md)
    crawler: String(!!opts.crawler),
    ...(opts.props ?? {}),
  };
  const mainId = opts.originDir ? join(opts.originDir, `${name}.declare`) : undefined;
  const built = compileProgram(source, { originDir: opts.originDir, stripPos: opts.stripPos ?? true, mainId, props });
  if (built.program === null) {
    return { ok: false, errors: built.errors, warnings: built.warnings, diagnostics: built.diagnostics, report: built.report, closure: built.closure, files: [], sizes: null };
  }

  // The program is embedded as a JSON string parsed at boot — JSON.parse is far
  // faster than the JS parser on a large object literal, and keeps the bundle
  // clean for the minifier. The backend is a build choice: DOM (managed
  // elements) or Canvas (one <canvas>, the app painted by the runtime's own
  // display list). Only the chosen backend is bundled.
  const canvas = opts.render === "canvas";
  const backend = canvas
    ? { cls: "CanvasBackend", file: "canvas-backend.js" }
    : { cls: "DomBackend", file: "dom-backend.js" };
  const programJson = JSON.stringify(built.program);
  const entry =
    `import ${JSON.stringify(join(RUNTIME, "index.js"))};\n` +
    `import { renderProgramAsync } from ${JSON.stringify(join(RUNTIME, "boot.js"))};\n` +
    `import { ${backend.cls} } from ${JSON.stringify(join(RUNTIME, backend.file))};\n` +
    `const PROGRAM = JSON.parse(${JSON.stringify(programJson)});\n` +
    `const host = document.getElementById("host");\n` +
    // The host is the app's element: clear it before mount, so a `--crawler`
    // build's embedded static block (crawler content, capabilities.md §5)
    // is replaced by the real app the moment it runs.
    `if (host) { host.replaceChildren(); renderProgramAsync(PROGRAM, host, new ${backend.cls}()); }\n`;

  // Registry slimming (on by default; opts.slim === false keeps the full set):
  // substitute the runtime's registry.js with a subset carrying only the
  // component classes this app can instantiate (built.usedComponents), so esbuild
  // drops the rest. The used-set is sound — every construction path is a static
  // reference (tags, class bases, `{ }`-body `new X()`, or the `use` list).
  const slim = opts.slim !== false;
  const slimPlugin = {
    name: "slim-registry",
    setup(build) {
      build.onLoad({ filter: /[/\\]registry\.js$/ }, () => ({
        contents: slimRegistrySource(built.usedComponents),
        loader: "js",
        resolveDir: RUNTIME,
      }));
    },
  };

  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: RUNTIME, loader: "js", sourcefile: name + ".entry.js" },
    bundle: true, minify: true, format: "esm", target: "es2020",
    write: false, legalComments: "none",
    plugins: slim ? [slimPlugin] : [],
  });
  const appJs = result.outputFiles[0].text;
  const moduleName = `app.${shortHash(appJs)}.js`;

  // `--crawler`: the extracted static document (docs/system-design/capabilities.md §5) baked
  // into the host element — content for crawlers and AI readers that never run
  // the script; the entry above clears it before mount. Compile through THE
  // front-end (auto-include host and all), then execute headlessly and extract
  // — the SAME compile the app itself gets (typecheck already gated the build
  // above, so it is skipped here).
  let staticBlock = "";
  let pageTitle = name;
  if (opts.crawler) {
    const compiled = compileFull(source, { originDir: opts.originDir, typecheck: false });
    // The CRAWLED document (location.md §7) — every reachable location's content in
    // the one page. Data resolves from the app's own directory (the build-time rule);
    // a network DataSource fails the build loudly, by design.
    const ex = compiled.source === null ? null : await crawlExtract(compiled.source, {
      deps: compiled.deps, links: compiled.links,
      data: opts.originDir ? diskDataResolver(opts.originDir) : undefined,
    });
    if (ex && ex.html) staticBlock = `<div id="declare-static">\n${ex.html}\n</div>`;
    // the settled appName names the deployed page — the <title> SEO reads
    if (ex && ex.title) pageTitle = ex.title;
  }

  // A crawler block (--crawler) is removed BEFORE first paint by a synchronous classic
  // script — so a human never flashes the bare extraction while the async app module
  // loads, while a non-JS crawler still reads it in the served HTML. Not CSS-hidden:
  // same content for every agent, presentation swaps at mount (progressive enhancement,
  // not cloaking). See browser/serve-core.js for the full rationale.
  const clearStatic = staticBlock
    ? `<script>document.getElementById("declare-static")?.remove()</script>\n`
    : "";
  const html =
    `<!doctype html><meta charset="utf-8"><title>${pageTitle.replace(/</g, "&lt;")}</title>\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<style>html,body{margin:0;padding:0;height:100%}</style>\n` +
    `<div id="host">${staticBlock}</div>\n` +
    clearStatic +
    `<script type="module" src="./${moduleName}"></script>\n`;

  const sizes = {
    programRaw: programJson.length,
    programGzip: gz(programJson),   // the app ALONE (compiled, pre-bundle) — the runtime's share is the rest of appGzip
    appRaw: appJs.length,
    appGzip: gz(appJs),
    htmlRaw: html.length,
    htmlGzip: gz(html),
    totalGzip: gz(appJs) + gz(html),
  };
  return {
    ok: true, errors: [], warnings: built.warnings, diagnostics: built.diagnostics, report: built.report,
    closure: built.closure, program: built.program, sizes,
    usedComponents: built.usedComponents, slim,
    files: [{ name: "index.html", contents: html }, { name: moduleName, contents: appJs }],
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
 *  the buildProduction result plus `{ outDir, moduleName, assets }`. On a compile
 *  error, returns `{ ok:false, errors }` and writes nothing. */
export async function writeProduction({ source, name = "app", srcDir = null, outDir, stripPos = true, render, slim = true, crawler = false, props }) {
  const out = await buildProduction(source, { name, originDir: srcDir, stripPos, render, slim, crawler, props });
  if (!out.ok) return out;
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const f of out.files) await writeFile(join(outDir, f.name), f.contents);
  const assets = srcDir ? await copyAssets(srcDir, outDir) : [];
  const moduleName = out.files.find((f) => f.name.startsWith("app."))?.name;
  return { ...out, outDir, moduleName, assets };
}

async function cli(argv) {
  // CLI-only switches (output dir, quiet, and the artifacts --highlight / --extract);
  // the two MODIFIERS --render/--canvas and --crawler share the canonical model (flags.ts),
  // so they mean exactly what the same names mean as server/browser URL modifiers. A
  // build always slims + strips positions + typechecks (docs/system-design/requests.md §"Removed
  // knobs"); --debug is the one escape hatch, for debugging the emitter — it keeps
  // source positions AND the full registry.
  const passthrough = [];
  let outDir = null, quiet = false, doHighlight = false, doExtract = false, debug = false;
  const raw = argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a === "-o" || a === "--out") outDir = raw[++i];
    else if (a === "--quiet") quiet = true;
    else if (a === "--highlight") doHighlight = true;
    else if (a === "--extract") doExtract = true;
    else if (a === "--debug") debug = true;
    else passthrough.push(a);
  }
  const { flags, rest } = parseArgvFlags(passthrough, DEFAULT_FLAGS); // declarec is always a build
  const input = rest.find((a) => !a.startsWith("-")) ?? null;
  if (input === null) {
    console.error("usage: declarec <app.declare> [-o dist] [--canvas] [--crawler] [--extract] [--debug] [--quiet]");
    console.error("       declarec --highlight <app.declare> [-o out.json]   # the reader's segments (JSON)");
    process.exit(2);
  }
  const srcPath = resolve(input);
  const srcDir = dirname(srcPath);
  const name = basename(srcPath, ".declare");

  // --highlight: emit the compiler's preprocessed form (compiler/src/highlight.ts)
  // — prose (Markdown from /* */ comments) + syntax-highlighted <pre> code — as a
  // JSON segment list the code viewer renders. A lightweight build-time companion
  // to the live server route, for static hosting.
  if (doHighlight) {
    const source = await readFile(srcPath, "utf8");
    const segments = highlight(source);
    const outFile = outDir
      ? (outDir.endsWith(".json") ? resolve(outDir) : join(resolve(outDir), `${name}.highlight.json`))
      : join(srcDir, `${name}.highlight.json`);
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, JSON.stringify({ path: input, segments }));
    if (!quiet) {
      const prose = segments.filter((s) => s.kind === "prose").length;
      const code = segments.filter((s) => s.kind === "code").length;
      console.log(`declarec --highlight ✓ ${name} → ${outFile}`);
      console.log(`  ${segments.length} segments (${code} code, ${prose} prose)`);
    }
    return;
  }

  outDir = resolve(outDir ?? join(srcDir, "dist"));

  const source = await readFile(srcPath, "utf8");
  const t0 = Date.now();
  const out = await writeProduction({ source, name, srcDir, outDir, render: flags.render, crawler: flags.crawler, stripPos: !debug, slim: !debug });
  const ms = Date.now() - t0;

  if (!out.ok) {
    // The compile's own rendered report, verbatim — the ONE renderer's output
    // (code, line/col, hint), never a hand-rolled projection of it.
    console.error(`declarec: ${input}`);
    console.error(out.report ?? out.errors.map((e) => e.message).join("\n"));
    process.exit(1);
  }

  // --extract: also emit the static-extraction document as a standalone file — the
  // declarec × extract artifact (a build may legitimately produce more than one file).
  // A fresh compile through the front-end + a headless extract; typecheck already gated
  // the build above, so it is skipped on this second pass.
  if (doExtract) {
    const compiled = compileFull(source, { originDir: srcDir, typecheck: false });
    const ex = compiled.source === null ? null : await crawlExtract(compiled.source, {
      deps: compiled.deps, links: compiled.links,
      data: srcDir ? diskDataResolver(srcDir) : undefined,
    });
    const doc = ex === null ? null : crawlerDocument(ex.html, ex.title || name);
    if (doc !== null) {
      await writeFile(join(outDir, `${name}.extract.html`), doc);
      if (!quiet) console.log(`  ${name}.extract.html   ${kb(doc.length)} raw  (static extraction)`);
    }
  }

  const assets = out.assets;
  if (!quiet) {
    console.log(`declarec ✓ ${name} → ${outDir}  (${ms} ms)`);
    console.log(`  ${out.moduleName}`);
    console.log(`    program JSON   ${kb(out.sizes.programRaw)}  (embedded)`);
    console.log(`    app bundle     ${kb(out.sizes.appRaw)} raw   ${kb(out.sizes.appGzip)} gzip`);
    console.log(`    index.html     ${kb(out.sizes.htmlRaw)} raw   ${kb(out.sizes.htmlGzip)} gzip`);
    console.log(`    ── total over the wire (gzip): ${kb(out.sizes.totalGzip)} ──`);
    if (out.slim) {
      // Count only the RUNTIME components (the registry names) — the used-set also
      // carries the app's own classes (always bundled, never in the registry), so
      // they don't belong in an "N of M runtime components" figure.
      const builtins = new Set(REGISTRY_MANIFEST.map((e) => e.name));
      const kept = [...out.usedComponents].filter((n) => builtins.has(n)).sort();
      console.log(`    registry: ${kept.length} of ${builtins.size} runtime components kept — ${kept.join(", ")}`);
    } else console.log(`    registry: FULL (slimming off)`);
    if (assets.length) console.log(`  assets: ${assets.join(", ")}`);
    if (out.warnings.length) console.log(`  ${out.warnings.length} warning(s)`);
  }
}

// Run as CLI when invoked directly (not when imported by the server).
if (import.meta.url === `file://${process.argv[1]}`) {
  cli(process.argv).catch((e) => { console.error(e); process.exit(1); });
}
