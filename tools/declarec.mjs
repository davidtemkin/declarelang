#!/usr/bin/env node
// declarec — Declare's production build (the emit half + CLI).
//
//   node tools/declarec.mjs <app.declare> [-o dist] [--canvas] [--crawler] [--extract] [--debug] [--quiet]
//   node tools/declarec.mjs check <file.declare…> [--json]   # compile + report, emit nothing
//
// Precompiles an app (compiler/dist/declarec.js: parse + resolve + typecheck at
// BUILD time → serializable program), bundles the runtime's RUN-PATH ONLY with
// esbuild (minified; the parser + typechecker are tree-shaken out), embeds the
// program, and writes a self-contained, deployable dist/ — the Declare analogue
// of `lzc`. The heavy lifting `buildProduction()` is exported so the dev server
// can produce (and cache) the same artifact on demand.

import { readFile, writeFile, mkdir, cp, rm, readdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve, basename, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import * as esbuild from "esbuild";
import { compileProgram } from "../compiler/dist/declarec.js";
import { REGISTRY_MANIFEST } from "../runtime/dist/registry.js";
import { parseArgvFlags, DEFAULT_FLAGS } from "../compiler/dist/flags.js";
import { highlight } from "../compiler/dist/highlight.js";
import { compile as compileFull, crawlExtract, diskDataResolver, crawlerDocument } from "../compiler/dist/compile-node.js";
import { parseLibrary } from "../runtime/dist/parser.js";
import { hashValidator } from "../compiler/dist/compile-node.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME = resolve(HERE, "../runtime/dist"); // the run-path lives here
const TABLES = ["TAGS", "LAYOUTS", "LAYOUT_BASES", "DATA", "ANIMATORS", "ANIMATOR_GROUPS", "SOURCES", "STATES"];

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
const ELIDE_FALSE = new Set(["hex", "many", "prevailing", "readOnly", "external", "entry"]);
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
  // ⚠ `--render mac` IS NOT A BUILD TARGET, and must not silently become one.
  // Two different constructs share the word "mac" and only one of them is a
  // declarec job:
  //   • the mac RUNTIME — bundles/declare-mac.js, the JS the native host loads
  //     as its world. Built once for the platform by tools/internal/build-mac.mjs
  //     and kept fresh by bundle-freshness.mjs, not per app.
  //   • "package this program as a Mac app" — a standalone .app carrying the
  //     program. A separate construct, still to be designed.
  // Until the second exists, refuse: this used to fall through a two-way ternary
  // and emit a DOM build — a page importing DomBackend that the native host
  // cannot boot at all. A wrong artifact is worse than a refusal.
  if (opts.render === "mac") {
    const why =
      "--render mac is not a build target.\n"
      + "  The native host loads the mac RUNTIME bundle, which is a platform artifact,\n"
      + "  not a per-app build:   node tools/internal/build-mac.mjs\n"
      + "  (kept fresh automatically — see tools/internal/bundle-freshness.mjs)\n"
      + "  Packaging a program as a standalone .app is a separate construct, not implemented.";
    // `report` is what the CLI prints; it must not be "" or the `??` below it
    // selects the empty string and the reason vanishes.
    return { ok: false, errors: [{ message: why }], warnings: [], diagnostics: [],
             report: why, closure: null, files: [], sizes: null };
  }

  const props = {
    render: opts.render === "canvas" ? "canvas" : "dom",
    slim: String(opts.slim !== false),
    stripPos: String(opts.stripPos ?? true),
    typecheck: "true",   // always on — a mandatory phase of the one compile (docs/system-design/requests.md)
    crawler: String(!!opts.crawler),
    ...(opts.props ?? {}),
  };
  const mainId = opts.originDir ? join(opts.originDir, `${name}.declare`) : undefined;
  const built = await compileProgram(source, { originDir: opts.originDir, stripPos: opts.stripPos ?? true, mainId, props });
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
  // services.js, NOT index.js. The entry needs the `{ }`-body service wiring
  // (Focus/Keys/Themes/Inspect) and nothing else the barrel re-exports. esbuild
  // can only drop a re-export when the module behind it is side-effect-free,
  // and most of this runtime is not (top-level `defineAttributes`), so
  // importing index.js pinned modules the program could never reach — it
  // shipped `image.js` and `text-input.js` to apps that name neither, undoing
  // slim-registry's correct exclusion through a second door. The dev path still
  // imports index.js, which imports services.js, so nothing there changes.
  const entry =
    `import ${JSON.stringify(join(RUNTIME, "services.js"))};\n` +
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
    let themes = false, draw = false, focusKeys = false, tips = false, touch = false, selectors = false, schemas = false;
    // A SELECTOR plan (any non-string segment — index/slice/wildcard) in an
    // attribute path or an emitted body plan keeps the evaluator aboard.
    const planful = (v) => v != null && v.kind === "path" && Array.isArray(v.plan) && v.plan.some((s) => typeof s !== "string");
    const walkSel = (el) => {
      for (const a of el.attrs ?? []) {
        if (planful(a.value)) selectors = true;
        if (a.value?.kind === "schema") schemas = true;
      }
      for (const d of el.decls ?? []) if (planful(d.def)) selectors = true;
      for (const c of el.children ?? []) walkSel(c);
    };
    const roots = [built.program.root, ...built.program.classes.map((c) => c.body)];
    // Any component the program can construct whose RUNTIME class makes itself
    // a tab stop without the source saying so (text-input.ts sets `focusable`
    // at attach). Everything else declares focusability in source, which the
    // walk below sees — including the library's Control (`focusable = { … }`).
    const SELF_FOCUSING = new Set(["TextInput"]);
    for (const name of built.usedComponents) if (SELF_FOCUSING.has(name)) focusKeys = true;
    const walkEl = (el) => {
      if ((el.methods ?? []).some((m) => m.name === "draw")) draw = true;
      // The focus-zoom lock (viewport-lock.js, ~1.7 KB gz) runs only for an app
      // that claimed the raw touch family — the runtime keys it on the ROOT's
      // wantsTouch. This walk is deliberately WIDER than that: any element
      // anywhere declaring a touch handler keeps the module. Over-approximating
      // costs a non-touch app nothing (it has no such handler) while making it
      // impossible to stub the lock out of an app that turns out to need it,
      // which would hand iOS a mid-gesture zoom and shear every coordinate.
      if ((el.methods ?? []).some((m) => /^onTouch(Start|Move|End|Cancel)$/.test(m.name))) touch = true;
      for (const m of el.methods ?? []) {
        // A focused view's OWN key handlers arrive through deliverKeys (focus.ts),
        // so they need both services; focus handlers obviously need focus.
        if (/^on(KeyDown|KeyUp|Focus|Blur|EscapeFocus)$/.test(m.name)) focusKeys = true;
      }
      for (const a of el.attrs ?? []) {
        // `focusable = …` in any form except the literal `false` makes a tab stop.
        if (a.name === "focusable" && !(a.value?.kind === "ident" && a.value.name === "false")) focusKeys = true;
        if (a.name === "tip") tips = true;
      }
      // The source components themselves (`Keys [ … ]`, `Focus [ … ]`, `Tip [ … ]`).
      if (el.tag === "Keys" || el.tag === "Focus") focusKeys = true;
      if (el.tag === "Tip") tips = true;
      for (const c of el.children ?? []) walkEl(c);
    };
    for (const r of roots) {
      walkBodies(r, (src) => {
        if (/\bThemes\b/.test(src)) themes = true;
        // A body may CALL the services (`Keys.isDown(…)`, `Focus.focus(this)`).
        if (/\bKeys\b|\bFocus\b/.test(src)) focusKeys = true;
        if (/\bTip\b/.test(src)) tips = true;
        // An emitted body plan with a selector segment: $data([…{…]).
        if (/\$data\(\[[^\]]*\{/.test(src)) selectors = true;
      });
      walkEl(r);
      walkSel(r);
    }
    return { usesThemes: themes, usesDraw: draw, usesFocusKeys: focusKeys, usesTips: tips, claimsTouch: touch, usesSelectors: selectors, usesSchemas: schemas };
  })();
  // index.js re-exports inspect's query surface by name; a stub must export
  // every name (esbuild resolves named re-exports even when unused downstream).
  // The stub bridge is not EMPTY: an empty `window.__declare` is
  // indistinguishable from breakage to anyone probing a shipped artifact
  // (found exactly that way — a bug report's "the artifact you ship is the
  // one you cannot question"). One field says what happened and names the
  // door; costs a string.
  const bridgeStub = `export function bridgeFor() { return { stub: "production build - the introspection bridge ships with declarelang build --debug" }; }
export function pickAt() { return null; }
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
  // The focus + keyboard services (focus.js, keys.js — ~5 KB minified together).
  // boot.ts wires them for EVERY app (Focus.setRoot, Keys.listen, deliverKeys),
  // which is why they shipped everywhere; an app with nothing focusable, no key
  // or focus handler, and no body calling either has no use for the wiring at
  // all. Gated together because they are one mechanism: Tab navigation is the
  // keyboard driving focus, and a focused view's own key handlers arrive
  // through deliverKeys. The stubs keep every name the run-path imports.
  const focusStub = `
const NOOP = () => {};
const OFF = () => NOOP;
export const Focus = {
  setRoot: NOOP, focus: NOOP, blur: NOOP, next: NOOP, prev: NOOP,
  byKeyboard: () => false, getFocus: () => null,
  onFocusChange: OFF, onGeometry: OFF, noteDiscarded: NOOP,
};
export function deliverKeys() { return NOOP; }
export class FocusService {}
`;
  // (`follower` is private to the real service — a Constraint it builds
  // internally — so it is deliberately absent here; nothing outside calls it.)
  const keysStub = `
const NOOP = () => {};
const OFF = () => NOOP;
export const Keys = {
  listen: NOOP, isDown: () => false, held: () => [],
  onKeyDown: OFF, onKeyUp: OFF, keyDown: NOOP, keyUp: NOOP, chord: OFF,
};
export function setKeysFocusProbe() {}
export class KeysService {}
export function normalize() { return null; }
`;
  // The tip service (tip.js): view.ts reports hover/press to it for any view
  // carrying `tip = "…"`, so an app with no tips never needs it.
  const tipStub = `
const NOOP = () => {};
export const Tip = { over: NOOP, out: NOOP, hide: NOOP, onTip: () => NOOP, show: NOOP };
`;
  // The datapath ISLAND SCANNER (datapath.js's lexical layer) is compile-time
  // machinery since the emitted-plans change (data-paths.md §5): compile()
  // lowers every `:path` island to `this.$data([…])` before emission, so a
  // production program has no `:` value mode left for the runtime to scan —
  // rewriteDatapaths is the identity on every body it will ever see here.
  // splitPath stays REAL: the attribute-path currency (bindDatapath,
  // replication, $data's string form) still splits at link time.
  const datapathStub = `
export const splitPath = (path) => (path === "" ? [] : path.split("."));
export const isSelective = (plan) => plan.some((s) => typeof s !== "string" && !("i" in s));
export function staticSegs(plan) {
  const out = [];
  for (const s of plan) {
    if (typeof s === "string") out.push(s);
    else if ("i" in s && s.i >= 0) out.push(String(s.i));
    else return null;
  }
  return out;
}
export function scanDatapaths() { return []; }
export function datapathTrouble() { return null; }
export function rewriteDatapaths(src) { return { src }; }
export function fillDatapaths(src) { return src; }
`;
  // The selector EVALUATOR (select.js — slices/wildcards/indices, B3) rides
  // only when the program's plans actually contain a selector segment — the
  // §7 pay-for-what-you-write table. A name-only program ships today's walk.
  const selectStub = `
const REFUSE = () => { throw new Error("path selectors are not aboard this build (the program declared none at compile time — rebuild)"); };
export const selectNodes = REFUSE, selectValue = REFUSE, evaluatePlan = REFUSE;
`;
  // The data-shape validator (data-schema.js, B4) rides only when the
  // program declares a schema — the same pay-per-use lever.
  const dataSchemaStub = `
export function validateShape() { return null; }
`;
  const themesStub = `export const Themes = Object.freeze({});\n`;
  const viewportStub = `export function lockFocusZoom() {}\n`;
  const drawStub = `export function record() { return null; }\nexport function replay() {}\nexport class Draw {}\nexport class DrawGradient {}\nexport function replayArea() { return 0; }\nexport function rasterPad() { return 0; }\nexport function rasterEntryCap() { return 0; }\nexport function rasterTotalCap() { return 0; }\nexport const RASTER_MAX_DIM = 0;\nexport const RASTER_MAX_AREA = 0;\nexport const RASTER_GRACE_MS = 0;\n`;
  const stubFor = (name, filterRe, contents) => ({
    name,
    setup(build) {
      build.onLoad({ filter: filterRe }, () => ({ contents, loader: "js", resolveDir: RUNTIME }));
    },
  });
  const factPlugins = opts.debug ? [] : [
    stubFor("slim-check", /[/\\]check\.js$/, checkStub),
    stubFor("slim-bridge", /[/\\]inspect\.js$/, bridgeStub),
    stubFor("slim-datapath", /[/\\]datapath\.js$/, datapathStub),
    ...(programFacts.usesThemes ? [] : [stubFor("slim-themes", /[/\\]themes\.js$/, themesStub)]),
    ...(programFacts.usesDraw ? [] : [stubFor("slim-draw", /[/\\]draw\.js$/, drawStub)]),
    ...(programFacts.usesFocusKeys ? [] : [
      stubFor("slim-focus", /[/\\]focus\.js$/, focusStub),
      stubFor("slim-keys", /[/\\]keys\.js$/, keysStub),
    ]),
    ...(programFacts.usesTips ? [] : [stubFor("slim-tip", /[/\\]tip\.js$/, tipStub)]),
    ...(programFacts.claimsTouch ? [] : [stubFor("slim-viewport", /[/\\]viewport-lock\.js$/, viewportStub)]),
    ...(programFacts.usesSelectors ? [] : [stubFor("slim-select", /[/\\]select\.js$/, selectStub)]),
    ...(programFacts.usesSchemas ? [] : [stubFor("slim-dataschema", /[/\\]data-schema\.js$/, dataSchemaStub)]),
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
    const compiled = await compileFull(source, { originDir: opts.originDir, typecheck: false });
    // The CRAWLED document (location.md §7) — every reachable location's content in
    // the one page. Data resolves from the app's own directory (the build-time rule);
    // a network DataSource fails the build loudly, by design.
    // Deadlined: the crawl runs the APP's code, and an app that never
    // quiesces (a fetch that never settles, an unbounded location family)
    // must fail THIS build with its name on it, not hang it. (A synchronous
    // spin can't be raced from inside the process — derive's per-rule
    // process kill is the backstop for that.)
    const CRAWL_DEADLINE_MS = 120_000;
    const ex = compiled.source === null ? null : await Promise.race([
      crawlExtract(compiled.source, {
        deps: compiled.deps, links: compiled.links,
        data: opts.originDir ? diskDataResolver(opts.originDir) : undefined,
      }),
      new Promise((_, reject) => {
        const t = setTimeout(() => reject(new Error(
          `--crawler: the crawl of ${name} did not finish within ${CRAWL_DEADLINE_MS / 1000}s — ` +
          `the app's own code runs during extraction, so a data source that never settles or an ` +
          `unbounded location set hangs it. Fix the app, or build without --crawler (only indexed ` +
          `surfaces need the baked document).`)), CRAWL_DEADLINE_MS);
        t.unref?.(); // the watchdog itself must never hold the process open
      }),
    ]);
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
  if (srcDir) await writeBuildClosure({ outDir, srcDir, closure: out.closure, assets, metafile: out.metafile });
  return { ...out, outDir, moduleName, assets };
}

/* ── BUILD.json — what this dist was built from ────────────────────────────
 *
 * The compiler already tracks a dependency CLOSURE for every compile (the OL5
 * DependencyTracker model, `compiler/src/closure.ts`): each file the compile
 * read — source, includes, auto-included libraries, the manifest — with a cheap
 * validator, and `isUpToDate(closure, props, probe)` answers "still fresh?".
 * The dev server asks exactly that question (`toolchain-worker.mjs:54`). A
 * production build computed the same closure and then threw it away, so a
 * COMMITTED dist/ had no way to say what it was built from — and drifted
 * silently: apps/homepage/dist was five days and a redesign behind its source,
 * with no shots/ at all, and nothing anywhere could tell.
 *
 * Persisting it closes that. Two things the compile closure does NOT cover, so
 * they are recorded here alongside it:
 *   - the COPIED ASSETS. `copyAssets` runs after the compile, so a changed
 *     screenshot or data file is invisible to the compiler's closure. Each
 *     copied file gets a validator of its own.
 *   - the PATHS. A closure entry's id is environment-local — absolute on disk.
 *     Committed, that is machine-specific, so ids are stored REPO-RELATIVE and
 *     resolved at check time (the same rewrite `prewarm.mjs` does to make a
 *     disk closure browser-shaped).
 */
async function walkFiles(dir, base = "") {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...await walkFiles(join(dir, e.name), rel));
    else out.push(rel);
  }
  return out;
}

async function writeBuildClosure({ outDir, srcDir, closure, assets, metafile }) {
  if (!closure) return;
  const repoRoot = resolve(HERE, "..");
  const rel = (abs) => relative(repoRoot, abs).split(sep).join("/");
  // rewritten to CONTENT validators: this file is committed, so it must be
  // reproducible (an mtime moves on every rebuild) and survive a clone (a fresh
  // checkout moves every mtime). The compile records mtime+size, which is right
  // for the live cache and wrong the moment the closure is written to disk.
  const entries = closure.entries.map((e) => ({ ...e, id: rel(e.id), v: hashValidator(e.id) }));
  // the copied assets, each with its own validator. An asset is a FILE
  // (declare-faq.md, stats.json) or a DIRECTORY (shots/, data/, demos/) — walk
  // the directories so a single changed screenshot invalidates the build.
  for (const name of assets) {
    const at = join(srcDir, name);
    const files = statSync(at).isDirectory() ? await walkFiles(at, name) : [name];
    for (const f of files) {
      const abs = join(srcDir, f);
      entries.push({ id: rel(abs), kind: "file", v: hashValidator(abs) });
    }
  }
  // …and the PLATFORM this bundle EMBEDS. `app.<hash>.js` is the runtime and the
  // program in one file, so the runtime is as much an input as the source is —
  // but the compile closure only ever knew about what the COMPILER read, and the
  // runtime is what esbuild read. The gap was invisible because it is masked: a
  // runtime change moves the bundle's bytes, which moves its content hash, so a
  // BROWSER can never be served a stale build. What could go stale, silently, is
  // the committed dist relative to the repo — a flawlessly cache-invalidated
  // build of an old runtime. It was caught once, by luck, because the change also
  // moved a figure in stats.json, which IS in the closure.
  //
  // Taken from esbuild's own metafile rather than a hand-kept list, so it cannot
  // drift from what was actually bundled — including the slim plugin's stubbing,
  // which changes the input set per app.
  for (const id of Object.keys(metafile?.inputs ?? {})) {
    if (id.startsWith("<")) continue;                       // the stdin entry, not a file
    const abs = resolve(process.cwd(), id);
    if (!existsSync(abs)) continue;
    entries.push({ id: rel(abs), kind: "file", v: hashValidator(abs) });
  }
  await writeFile(join(outDir, "BUILD.json"),
    JSON.stringify({ closure: { entries, props: closure.props }, built: rel(srcDir) }, null, 1));
}

/** `declarec check <files…> [--json]` — the COMPILE without the build: parse,
 *  resolve, check, typecheck; report; emit nothing. The one door for anything
 *  that needs to know whether a source is legal without wanting a dist/ —
 *  editors, CI, a source-to-source tool verifying its own output.
 *
 *  Two output forms, the dual-form rule every diagnostic already follows: the
 *  default prints each compile's own rendered `report` verbatim (the ONE
 *  renderer, never a hand-rolled projection); `--json` emits the machine form,
 *  one flat record per diagnostic with its file. Exit 1 if any file has an
 *  error, 0 otherwise — warnings never fail the run. */
async function checkFiles(files, { json, quiet }) {
  const records = [];
  let failed = 0, errs = 0, warns = 0;
  for (const f of files) {
    const srcPath = resolve(f);
    let source;
    try {
      source = await readFile(srcPath, "utf8");
    } catch {
      records.push({ file: f, code: "DECLARE5000", severity: "error", phase: "module", message: `cannot read '${f}'` });
      failed++; errs++;
      if (!json) console.error(`declarec check: cannot read '${f}'`);
      continue;
    }
    // A LIBRARY (class/style/font declarations, no root element) is a legitimate
    // check target — until now it could only be checked transitively, by
    // compiling an app that includes it. It goes through the SAME pipeline: a
    // bare `App [ ]` is appended, which forces the real compile without shifting
    // a single position, since the library text stays a prefix of what is
    // parsed. `parseLibrary` is the discriminator (it requires eof after the top
    // declarations, so a program's root element makes it throw) — a decision the
    // grammar makes, not a guess from an error message.
    let isLibrary = false;
    try { parseLibrary(source); isLibrary = true; } catch { /* a program, or broken as both */ }
    const out = await compileFull(isLibrary ? `${source}\nApp [ ]\n` : source, { originDir: dirname(srcPath) });
    for (const d of out.diagnostics) {
      records.push({
        file: f, code: d.code, severity: d.severity, phase: d.phase, message: d.message,
        ...(d.pos ? { line: d.pos.line, col: d.pos.col } : {}),
        ...(d.hint !== undefined ? { hint: d.hint } : {}),
      });
    }
    errs += out.errors.length;
    warns += out.warnings.length;
    if (out.errors.length > 0) failed++;
    if (!json && out.report !== "") {
      console.error(`declarec check: ${f}`);
      console.error(out.report);
    }
  }
  if (json) console.log(JSON.stringify(records, null, 2));
  else if (!quiet) {
    const n = files.length;
    console.log(errs === 0
      ? `declarec check ✓ ${n} file(s) clean${warns > 0 ? ` (${warns} warning(s))` : ""}`
      : `declarec check ✗ ${failed} of ${n} file(s) failed — ${errs} error(s), ${warns} warning(s)`);
  }
  return errs === 0 ? 0 : 1;
}

async function cli(argv) {
  // CLI-only switches (output dir, quiet, and the artifacts --highlight / --extract);
  // the two MODIFIERS --render/--canvas and --crawler share the canonical model (flags.ts),
  // so they mean exactly what the same names mean as server/browser URL modifiers. A
  // build always slims + strips positions + typechecks (docs/system-design/requests.md §"Removed
  // knobs"); --debug is the one escape hatch, for debugging the emitter — it keeps
  // source positions AND the full registry.
  const passthrough = [];
  let outDir = null, quiet = false, doHighlight = false, doExtract = false, debug = false, json = false;
  const raw = argv.slice(2);
  // `check` is a SUBCOMMAND (first positional), not a flag: it does a different
  // job — report, emit nothing — and takes many files where a build takes one.
  const isCheck = raw[0] === "check";
  for (let i = isCheck ? 1 : 0; i < raw.length; i++) {
    const a = raw[i];
    if (a === "-o" || a === "--out") outDir = raw[++i];
    else if (a === "--quiet") quiet = true;
    else if (a === "--highlight") doHighlight = true;
    else if (a === "--extract") doExtract = true;
    else if (a === "--debug") debug = true;
    else if (a === "--json") json = true;
    else passthrough.push(a);
  }
  if (isCheck) {
    const files = passthrough.filter((a) => !a.startsWith("-"));
    if (files.length === 0) {
      console.error("usage: declarec check <file.declare…> [--json] [--quiet]");
      process.exit(2);
    }
    process.exit(await checkFiles(files, { json, quiet }));
  }
  const { flags, rest } = parseArgvFlags(passthrough, DEFAULT_FLAGS); // declarec is always a build
  const input = rest.find((a) => !a.startsWith("-")) ?? null;
  if (input === null) {
    console.error("usage: declarec <app.declare> [-o dist] [--canvas] [--crawler] [--extract] [--debug] [--quiet]");
    console.error("       declarec check <file.declare…> [--json]            # compile + report, emit nothing");
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
    const compiled = await compileFull(source, { originDir: srcDir, typecheck: false });
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
// Exit EXPLICITLY on success: `--crawler`/`--extract` boot the app in-process,
// and an app whose init starts a raw timer (a clock applet's setInterval)
// leaves that handle alive after discard — the runtime cannot know about raw
// JS timers, so relying on event-loop drain hangs the build forever on any
// such app (four derive runs wedged on lzx-dashboard, 2026-08-08). The CLI's
// contract is "files written = done"; termination must not depend on the
// crawled app's timer hygiene. (Imported-as-module callers — the dev server —
// are unaffected: this branch is CLI-only.)
if (import.meta.url === `file://${process.argv[1]}`) {
  cli(process.argv).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
}
