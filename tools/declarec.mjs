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

/** Minify every `{ }` body in a compiled program in place — comments and
 *  whitespace only (esbuild's minifyWhitespace; never minifySyntax, so the
 *  code that runs is token-identical to what the author wrote and the
 *  compiler validated). Expressions wrap as a var initializer and methods as
 *  a function so esbuild parses them in context; the wrapper is then sliced
 *  back off. A body that fails to transform is kept verbatim. */
async function minifyBodies(program) {
  const jobs = [];
  const expr = (v) => jobs.push(
    esbuild.transform(`var __d=(\n${v.src}\n);`, { minifyWhitespace: true }).then((t) => {
      const a = t.code.indexOf("=(");
      const b = t.code.lastIndexOf(");");
      if (a > 0 && b > a + 2) v.src = t.code.slice(a + 2, b);
    }, () => {})
  );
  const method = (m) => jobs.push(
    esbuild.transform(`function __d(${m.params.join(",")}){\n${m.body}\n}`, { minifyWhitespace: true }).then((t) => {
      const a = t.code.indexOf("{");
      const b = t.code.lastIndexOf("}");
      if (a > 0 && b > a) m.body = t.code.slice(a + 1, b);
    }, () => {})
  );
  const walk = (el) => {
    for (const a of el.attrs ?? []) if (a.value?.kind === "code") expr(a.value);
    for (const d of el.decls ?? []) if (d.def?.kind === "code") expr(d.def);
    for (const m of el.methods ?? []) method(m);
    for (const c of el.children ?? []) walk(c);
  };
  walk(program.root);
  for (const c of program.classes) walk(c.body);
  for (const s of [...program.stylesheets, ...program.styles, ...program.fonts]) walk(s.body);
  await Promise.all(jobs);
}

/** The JSON.stringify replacer behind program compaction: drop empty member
 *  arrays (hydrateProgram restores them), `name: null` / `def: null`
 *  (restored), and false flags (readers treat absence as false — `deps` is
 *  NOT here: an empty deps list means "a constant constraint", while absence
 *  means "track at runtime"). */
const ELIDE_EMPTY = new Set(["attrs", "decls", "methods", "children", "params",
  "includes", "includeSpans", "uses", "classes", "stylesheets", "styles", "fonts"]);
const ELIDE_FALSE = new Set(["hex", "many", "prevailing", "readOnly", "entry"]);
// Exported for test/hydrate.test.mjs — the round-trip invariant must exercise
// THIS replacer, never a copy that could drift from it.
export { compactValue, ELIDE_FALSE };
function compactValue(key, value) {
  if (value === false && ELIDE_FALSE.has(key)) return undefined;
  if (value === null && (key === "name" || key === "def")) return undefined;
  if (Array.isArray(value) && value.length === 0 && ELIDE_EMPTY.has(key)) return undefined;
  return value;
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
  // Compact the embedded program (production only; --debug ships it verbatim):
  // strip comments and whitespace from every { } body (they are byte-for-byte
  // the author's text otherwise), and elide what a checked tree repeats
  // thousands of times — empty member arrays, null names/defaults, false
  // flags. The entry's hydrateProgram restores the structural fields at boot;
  // the boolean flags need no restoring (absence already reads as false).
  if (!opts.debug) await minifyBodies(built.program);
  const programJson = JSON.stringify(built.program, opts.debug ? undefined : compactValue);
  const entry =
    `import ${JSON.stringify(join(RUNTIME, "index.js"))};\n` +
    `import { renderProgramAsync } from ${JSON.stringify(join(RUNTIME, "boot.js"))};\n` +
    `import { hydrateProgram } from ${JSON.stringify(join(RUNTIME, "hydrate.js"))};\n` +
    `import { ${backend.cls} } from ${JSON.stringify(join(RUNTIME, backend.file))};\n` +
    `const PROGRAM = hydrateProgram(JSON.parse(${JSON.stringify(programJson)}));\n` +
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

  // Inspector slimming (same lever, dev-tooling edition): the object-browser
  // service (inspect-service.js, the ⌥⌘D / ?inspector substrate) is DEV tooling —
  // a production artifact ships a no-op stand-in unless --debug keeps the real
  // one. `explain()` (inspect.ts) stays either way — that promise is the running
  // app's, not the browser UI's. Roughly 9 KB gz back off every app's wire.
  const inspectStub = `
const ZERO = { x: 0, y: 0 };
export function setInspectionTarget() {}
export function inspectionOrigin() { return ZERO; }
export function inspectionTarget() { return null; }
export function evaluateIn() { return { ok: false, error: "the inspector is not aboard this production build (declarec --debug keeps it)" }; }
export const Inspect = new Proxy({ ready: () => false }, {
  get: (t, k) => (k in t ? t[k] : () => { throw new Error("Inspect." + String(k) + ": the inspector is not aboard this production build (declarec --debug keeps it)"); }),
});
`;
  const inspectPlugin = {
    name: "slim-inspector",
    setup(build) {
      build.onLoad({ filter: /[/\\]inspect-service\.js$/ }, () => ({
        contents: inspectStub,
        loader: "js",
        resolveDir: RUNTIME,
      }));
    },
  };

  // Three more used-set substitutions, gated on PROGRAM FACTS the compile
  // already knows (the same lever as slim-registry — never a heuristic):
  //  - the `__declare` page bridge (inspect.ts, ~6.5 KB min) is dev tooling;
  //    production ships a stub unless --debug.
  //  - the Themes preset service + its city records tree-shake when no body in
  //    the program ever says `Themes` (value.ts's DEFAULT_THEME imports the one
  //    SanFrancisco record directly and is unaffected).
  //  - the Canvas2D draw-recording vocabulary (draw.js, ~9 KB min) loads only
  //    when some element actually declares a `draw` body.
  const walkBodies = (el, fn) => {
    for (const a of el.attrs ?? []) if (a.value?.kind === "code") fn(a.value.src);
    for (const d of el.decls ?? []) if (d.def?.kind === "code") fn(d.def.src);
    for (const m of el.methods ?? []) fn(m.body ?? "");
    for (const c of el.children ?? []) walkBodies(c, fn);
  };
  const programFacts = (() => {
    let themes = false, draw = false;
    const roots = [built.program.root, ...built.program.classes.map((c) => c.body)];
    for (const r of roots) {
      walkBodies(r, (src) => { if (/\bThemes\b/.test(src)) themes = true; });
      const walkDraw = (el) => {
        if ((el.methods ?? []).some((m) => m.name === "draw")) draw = true;
        for (const c of el.children ?? []) walkDraw(c);
      };
      walkDraw(r);
    }
    return { usesThemes: themes, usesDraw: draw };
  })();
  // index.js re-exports inspect's query surface by name; a stub must export
  // every name (esbuild resolves named re-exports even when unused downstream).
  const bridgeStub = `export function bridgeFor() { return {}; }
export function viewAt() { return null; }
export function dependentsOf() { return []; }
export function expandValue() { return null; }
export function slotsOf() { return []; }
export function inspect() { return null; }
export function find() { return null; }
export function explain() { return null; }
export function stats() { return null; }
export function pathOf() { return ""; }
export function kindName() { return ""; }
export const clock = {};
`;
  // The validator itself (check.js): a trusted program (compileProgram stamped
  // it — the gate above this emit) never calls it, and program-schema.js now
  // carries the schema half instantiate really needs — so production ships
  // throwing stand-ins. Every name any bundled module imports must exist
  // (esbuild resolves named imports and re-exports even when unused).
  const checkStub = ["check", "checkAttr", "checkMethod", "checkDecl", "checkComponentValue",
    "checkEntry", "checkThemeRecord", "checkStyleDecls", "programSchemas", "withDecls",
    "manyPathOf", "coerceToken", "cssAttributeHint"]
    .map((n) => `export function ${n}() { throw new Error("${n}: the checker is not aboard this production build — the program was checked at compile time (declarec --debug keeps the checker)"); }`)
    .join("\n") + "\n";
  const themesStub = `export const Themes = Object.freeze({});\n`;
  const drawStub = `export function record() { return null; }\nexport function replay() {}\nexport class Draw {}\nexport class DrawGradient {}\n`;
  const stubFor = (name, filterRe, contents) => ({
    name,
    setup(build) {
      build.onLoad({ filter: filterRe }, () => ({ contents, loader: "js", resolveDir: RUNTIME }));
    },
  });
  const factPlugins = opts.debug ? [] : [
    stubFor("slim-check", /[/\\]check\.js$/, checkStub),
    stubFor("slim-bridge", /[/\\]inspect\.js$/, bridgeStub),
    ...(programFacts.usesThemes ? [] : [stubFor("slim-themes", /[/\\]themes\.js$/, themesStub)]),
    ...(programFacts.usesDraw ? [] : [stubFor("slim-draw", /[/\\]draw\.js$/, drawStub)]),
  ];

  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: RUNTIME, loader: "js", sourcefile: name + ".entry.js" },
    bundle: true, minify: true, format: "esm", target: "es2020",
    write: false, legalComments: "none", metafile: true,
    plugins: [...(slim ? [slimPlugin] : []), ...(opts.debug ? [] : [inspectPlugin]), ...factPlugins],
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
    closure: built.closure, program: built.program, sizes, metafile: result.metafile,
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
