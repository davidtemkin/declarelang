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
import { stripSource } from "./internal/error-codes.mjs";
import * as esbuild from "esbuild";
import { compileProgram } from "../compiler/dist/declarec.js";
import { REGISTRY_MANIFEST } from "../runtime/dist/registry.js";
import { THEME_PRESET_NAMES } from "../runtime/dist/themes.js";

// A body USES the theme presets when it names one (`SanFrancisco`) or `activeTone` —
// the trigger that keeps themes.js (the preset records) aboard a production
// build; an app that names none tree-shakes it to the empty stub.
const THEME_USE = new RegExp(`\\b(?:${[...THEME_PRESET_NAMES, "activeTone"].join("|")})\\b`);
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
  for (const s of [...program.themes, ...program.styles, ...program.fonts]) walk(s.body);
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
/** PRECOMPILE A PROGRAM'S BODIES (runtime/src/expr.ts, "PRECOMPILED BODIES").
 *  Rewrites `program` in place — each `{ }` body's `src`, each method's `body`
 *  and each script block's `src` becomes a token — and returns the module code
 *  that defines the functions they name, or null to ship the program as text.
 *
 *  Each function is built exactly as the runtime would build it from the text:
 *  the same datapath rewrite (datapath.js), the same parameters, the same
 *  helper and script names in scope — unpacked ONCE by the factory instead of
 *  once per call — and it must parse under the same prelude the runtime uses,
 *  or that one body stays text. Identical bodies share one function, as the
 *  runtime's per-text memo made them do. A program whose scripts import modules
 *  compiles them into a bundled module with no name list, so its script names
 *  are not knowable here: the whole program ships as text, as before. */
async function precompileBodies(program) {
  await import(join(RUNTIME, "services.js"));   // the body services, so the helper names are the runtime's full list
  const { bodyScopeNames } = await import(join(RUNTIME, "expr.js"));
  const { rewriteDatapaths } = await import(join(RUNTIME, "datapath.js"));
  const helpers = bodyScopeNames();
  const scripts = program.scripts ?? [];
  const scriptNames = [];
  for (const sc of scripts) {
    if (sc.src.trim() === "") continue;   // an empty block defines nothing
    const m = /\/\*\$b\*\/\s*return\s*\{([^}]*)\}\s*;?\s*$/.exec(sc.src);
    if (m === null) return null;
    for (const part of m[1].split(",")) {
      const id = part.split(":")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(id)) scriptNames.push(id);
    }
  }
  if (scriptNames.some((n) => helpers.includes(n))) return null;   // the runtime's prelude would reject it too
  const prelude = `const { ${helpers.join(", ")} } = $d;` + (scriptNames.length > 0 ? ` const { ${scriptNames.join(", ")} } = $s;` : "");
  const parses = (params, body) => { try { new Function("$d", "$s", ...params, `"use strict"; ${prelude} ${body}`); return true; } catch { return false; } };
  for (const sc of scripts) { try { new Function(`"use strict"; ${sc.src}`); } catch { return null; } }

  const fns = [];
  const slots = new Map();
  const slot = (key, fn) => { let i = slots.get(key); if (i === undefined) { i = fns.length; fns.push(fn); slots.set(key, i); } return i; };
  const seen = new Set();
  const walk = (v) => {
    if (v === null || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (v.kind === "code" && typeof v.src === "string" && v.src.charCodeAt(0) !== 0) {
      const r = rewriteDatapaths(v.src);
      const body = "error" in r ? null : `return (${r.src}\n);`;
      if (body !== null && parses(["parent", "classroot"], body)) v.src = "\u0000" + slot("e\u0000" + v.src, `function(parent, classroot) { ${body} }`);
    }
    if (Array.isArray(v.methods)) for (const m of v.methods) {
      if (m === null || typeof m !== "object" || typeof m.body !== "string" || m.body.charCodeAt(0) === 0) continue;
      const params = (m.params ?? []).map((q) => q.name);
      const r = rewriteDatapaths(m.body);
      const body = "error" in r ? null : `{ ${r.src}\n }`;
      if (body !== null && parses(["parent", "classroot", "$base", ...params], body)) {
        // a method that reaches `super` keeps "$base" in its token: instantiate
        // decides whether to build the object `super.name(…)` reads by looking
        // for it in the method's text (the runtime reads only the number)
        m.body = "\u0000" + slot("m\u0000" + params.join("\u001f") + "\u0000" + m.body, `function(parent, classroot, $base${params.map((q) => ", " + q).join("")}) { ${body} }`) + (m.body.includes("$base") ? "$base" : "");
      }
    }
    for (const k of Object.keys(v)) walk(v[k]);
  };
  walk(program);
  const scriptFns = scripts.map((sc) => `function() { ${sc.src}\n }`);
  scripts.forEach((sc, i) => { sc.src = "\u0000" + i + "/*$b*/"; });   // the marker keeps instantiate evaluating each block alone
  return `function $makeBodies($d, $s) {\n${prelude}\nreturn [\n${fns.join(",\n")}\n];\n}\n` +
    `const $scripts = [${scriptFns.join(",\n")}];\n` +
    `providePrecompiled($makeBodies, $scripts);\n`;
}


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
  // PRECOMPILED BODIES (on by default; opts.precompile === false ships text):
  // every `{ }` body, method body and script block leaves as a FUNCTION in the
  // bundle, and the program carries a token naming it (runtime/src/expr.ts,
  // "PRECOMPILED BODIES"). Done on a COPY — built.program stays the compiled
  // program every other consumer of this result reads.
  const shipped = opts.precompile === false ? built.program : JSON.parse(JSON.stringify(built.program));
  const precompiled = opts.precompile === false ? null : await precompileBodies(shipped);
  const programJson = JSON.stringify(shipped, opts.debug ? undefined : compactValue);
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
    (precompiled === null ? "" : `import { providePrecompiled } from ${JSON.stringify(join(RUNTIME, "expr.js"))};\n${precompiled}`) +
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
import { notAboard } from "./errors.js";
const ZERO = { x: 0, y: 0 };
export function setInspectionTarget() {}
export function inspectionOrigin() { return ZERO; }
export function inspectionTarget() { return null; }
export function evaluateIn() { return { ok: false, error: notAboard("evaluateIn", "inspector").message }; }
export const Inspect = new Proxy({ ready: () => false }, {
  get: (t, k) => (k in t ? t[k] : () => { throw notAboard("Inspect." + String(k), "inspector"); }),
});
`;

  // ERROR PROSE → CODES (production only; --debug keeps the sentences). Every
  // `DeclareError` message a shipped app can throw is a string literal in its
  // bundle — esbuild minifies names, never string contents — and most of that
  // prose is developer-facing: read once while building, fixed, never seen
  // again. Here each message becomes `[Declare E42] <its runtime values>`: the
  // throw, the position and every interpolated value survive, so a production
  // failure is still diagnosable on its own, and `declare-help E42` gives the
  // sentence back. (App-RENDERABLE text is untouched — a DataSource's `.error`
  // is a plain Error, never a DeclareError.) The catalog rides out on the
  // build result so a caller can publish it.
  // REGISTERED LAST (see the esbuild call): esbuild gives a file to the FIRST
  // matching onLoad, so every slim-* stub must claim its module before this
  // broad filter sees it — otherwise the strip hands esbuild the full module a
  // stub was about to replace, and the bundle GROWS (measured: +14 KB when this
  // ran ahead of slim-check).
  const errorCatalog = {};
  const errorCodePlugin = {
    name: "error-codes",
    setup(build) {
      build.onLoad({ filter: /[/\\]runtime[/\\]dist[/\\][^/\\]+\.js$/ }, async (args) => {
        const raw = await readFile(args.path, "utf8");
        const { src: out, entries } = stripSource(raw);
        for (const e of entries) errorCatalog[e.code] = { message: e.message, file: args.path.split("/").pop(), line: e.line };
        return { contents: out, loader: "js", resolveDir: RUNTIME };
      });
    },
  };
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
    let themes = false, draw = false, filter = false, focusKeys = false, tips = false, touch = false, selectors = false, schemas = false;
    // A SELECTOR plan (any non-string segment — index/slice/wildcard) in an
    // attribute path or an emitted body plan keeps the evaluator aboard.
    const planful = (v) => v != null && v.kind === "path" && Array.isArray(v.plan) && v.plan.some((s) => typeof s !== "string");
    const walkSel = (el) => {
      for (const a of el.attrs ?? []) {
        if (planful(a.value)) selectors = true;
        if (a.value?.kind === "schema") schemas = true;
        // the NAMED forms (typed data): `schema = TaskDoc` / `schema = Task[]`
        // parse as idents and resolve at boot — the validator must ride
        if (a.name === "schema" && a.value?.kind === "ident" && a.value.name !== "null") schemas = true;
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
    // The source components themselves (`Keys [ … ]`, `Focus [ … ]`, `Tip [ … ]`)
    // — read off the used set, not the tree's tags, because the set also
    // carries every class's `extends` base: a program whose keyboard member is
    // `hot: Hot [ … ]` (class Hot extends Keys) needs the service as surely as
    // one that writes `Keys [ … ]`.
    for (const name of built.usedComponents) {
      if (name === "Keys" || name === "Focus") focusKeys = true;
      if (name === "Tip") tips = true;
    }
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
      for (const c of el.children ?? []) walkEl(c);
    };
    for (const r of roots) {
      walkBodies(r, (src) => {
        if (THEME_USE.test(src)) themes = true;
        // `d.filter = …` in any body keeps the canvas `filter` fallback
        // (canvas-filter.js, ~1.8 KB gz): Safari accepts ctx.filter and paints
        // unfiltered, so a program that sets one needs the module to render
        // there at all. One that never sets one does not — the DOM backend's own
        // frost is CSS backdrop-filter. Conservative: any body, not just draw().
        if (/\.filter\s*=[^=]/.test(src)) filter = true;
        // A body may CALL the services (`Keys.isDown(…)`, `Focus.focus(this)`).
        if (/\bKeys\b|\bFocus\b/.test(src)) focusKeys = true;
        if (/\bTip\b/.test(src)) tips = true;
        // An emitted body plan with a selector segment: $data([…{…]).
        if (/\$data\(\[[^\]]*\{/.test(src)) selectors = true;
      });
      walkEl(r);
      walkSel(r);
    }
    // Every constructor name reachable as a `call` node in a bare value — one
    // walk, so a nested call (`gradient(stop(0, blur(2)))`, absurd but legal to
    // parse) is seen too.
    const EFFECT_CALLS = new Set(["blur", "brightness", "contrast", "saturate", "grayscale", "invert",
      "sepia", "hueRotate", "colorize", "frost", "radialGradient", "conicGradient"]);
    const walkCalls = (v, hit) => {
      if (v == null || typeof v !== "object") return;
      if (v.kind === "call" && typeof v.name === "string") hit(v.name);
      for (const k of Object.keys(v)) {
        const x = v[k];
        if (Array.isArray(x)) for (const y of x) walkCalls(y, hit);
        else if (x != null && typeof x === "object") walkCalls(x, hit);
      }
    };

    // ── THE GRAPHICS AND TEXT VOCABULARY ────────────────────────────────────
    //
    // Read from the PARSE TREE, not from the program's text. The rule these must
    // obey is one-directional: a module may be dropped only when the program
    // CANNOT reach it, never merely when it does not appear to. A word match got
    // that backwards for the value-carrying modules — a filter or a gradient that
    // arrives from a remote `DataSource` is named nowhere in the program, so the
    // match saw nothing, the module was dropped, and the production build threw
    // on a program that worked in development.
    //
    // So a slot that CAN carry one of these values keeps its module whenever the
    // value is not a literal the compiler can read. `code` is a `{ }` body and
    // `path` is a `:path` read: both can yield anything at run time.
    const DYNAMIC = new Set(["code", "path", "query", "subfrom"]);
    const isDynamic = (v) => v != null && DYNAMIC.has(v.kind);

    // Slots that can hold a Filter list or a Backdrop; a Shape mask; an Image
    // tint; and a Fill (which a gradient is). Named generously: a name here only
    // ever KEEPS a module, and the library's own fill-ish slots vary by component.
    const FILTER_SLOTS = new Set(["filter", "backdrop"]);
    const MASK_SLOTS = new Set(["mask"]);
    const TINT_SLOTS = new Set(["tint"]);
    const FILL_SLOTS = new Set(["fill", "textFill", "ink", "background", "bg", "tintUse", "hue"]);
    // Attributes that can only be reached by NAMING them, so their presence in
    // the tree is exact — no dynamic path can set an attribute that is not written.
    const THREE_D = new Set(["rotateX", "rotateY", "translateZ", "perspective", "backface"]);
    const FEATURES = new Set(["numerals", "numeralWidth", "slashedZero"]);

    // ── THE PER-SIDE STROKE IS NOT GATED, AND CANNOT BE ────────────────────
    //
    // stroke-sides.js (the split, the uniform test, the list's equality and
    // coercion, and the two painters) rode behind a `usesStrokeSides` fact read
    // from a LIST LITERAL in a stroke slot. That fact was exact only while the
    // slot's body-facing type was `Stroke | null`, which foreclosed every other
    // way of producing four sides. It is `BoxStroke` now (scaffold.ts): a `{ }`
    // constraint may compute the list, and so may an imperative write in a
    // method body. Neither is a literal, so neither can be read from the tree —
    // a method body is TypeScript this build never parses, and `stroke = { … }`
    // holds an expression whose value is only known at run time.
    //
    // A slimming decision may only drop a module the program CANNOT reach. The
    // honest answer is therefore to ship it: 213 B gzipped, against 688 B of
    // headroom at the band, versus a `notAboard` refusal at paint time on a
    // program that ran in development. The alternative — matching `stroke(` in
    // body text — is the word match this file already learned not to trust.
    let effects = false, domEffects = false, threeD = false, features = false;
    let filterSlotSet = false, filterSlotDynamic = false, maskOrTint = false, fillDynamic = false;

    const walkVocab = (el) => {
      for (const a of el.attrs ?? []) {
        if (THREE_D.has(a.name)) threeD = true;
        if (FEATURES.has(a.name)) features = true;
        if (FILTER_SLOTS.has(a.name)) { filterSlotSet = true; if (isDynamic(a.value)) filterSlotDynamic = true; }
        if (MASK_SLOTS.has(a.name) || TINT_SLOTS.has(a.name)) maskOrTint = true;
        if (FILL_SLOTS.has(a.name) && isDynamic(a.value)) fillDynamic = true;
        // a BARE constructor call in a literal slot — `filter = [blur(3)]`,
        // `fill = gradient(…)`: the name is a `call` node, read structurally
        walkCalls(a.value, (name) => {
          if (EFFECT_CALLS.has(name)) effects = true;
          if (name === "colorize") domEffects = true;
        });
      }
      for (const d of el.decls ?? []) {
        if (isDynamic(d.def)) { /* a declared value can hold anything, but it only
          reaches paint through a SET slot, which the checks above already see */ }
        walkCalls(d.def, (name) => {
          if (EFFECT_CALLS.has(name)) effects = true;
          if (name === "colorize") domEffects = true;
        });
      }
      for (const c of el.children ?? []) walkVocab(c);
    };
    for (const r of roots) walkVocab(r);
    // A `{ }` body can CALL these by name: `fill = { gradient("90deg", a, b) }`,
    // `d.filter = blur(2)`. Body sources are the other half of the tree.
    let measure = false, drawImage = false, drawText = false;
    for (const r of roots) {
      walkBodies(r, (src) => {
        for (const n of EFFECT_CALLS) if (new RegExp(`\\b${n}\\s*\\(`).test(src)) effects = true;
        if (/\bcolorize\s*\(/.test(src)) domEffects = true;
        if (/\bmeasureText\s*\(|\bprovidedTextStyle\s*\(/.test(src)) measure = true;
        if (/\bdrawImage\s*\(/.test(src)) drawImage = true;
        if (/\b(?:fillText|strokeText)\s*\(/.test(src)) drawText = true;
      });
    }
    // THE ONE-DIRECTIONAL RULE, stated: a carrying slot whose value is not a
    // literal keeps its module, because what that value will be is unknowable
    // here. Dropping it would be a guess, and a wrong guess throws in production
    // on a program that ran in development — the one failure this must not have.
    if (filterSlotSet || fillDynamic) effects = true;
    if (maskOrTint || filterSlotDynamic) domEffects = true;
    const faces = built.usedComponents.includes("Face");
    // RICH TEXT. The DOM backend's native flow (dom-rich.js — the block/run
    // builder, the inline-view slot placement, the line clamp) is reachable from
    // exactly one place: a RichText pushing its parsed blocks at the surface
    // beneath it. A program that names no rich-text component drops the
    // component itself already (slim-registry above), so the flow could never
    // run — but a method on DomSurface is unreachable to a tree shaker, which is
    // why it shipped to every app. The used-set answers the question exactly:
    // it carries every class's `extends` base, so `class Note extends Markdown`
    // (and `class Deep extends Note`) puts `Markdown` in the set, as does a body
    // that constructs one by name or a `use [ … ]` keep-list — the same
    // indirection the source components above read off this set.
    const richText = ["Markdown", "HTMLText", "RichText"].some((n) => built.usedComponents.includes(n));
    // the change event arms only through `trackChanges` (an onChange with no
    // list never fires), so the attribute's presence is the whole fact
    let changeEvent = false;
    const walkChange = (el) => {
      if ((el.attrs ?? []).some((a) => a.name === "trackChanges")) changeEvent = true;
      for (const c of el.children ?? []) walkChange(c);
    };
    for (const r of roots) walkChange(r);
    return { usesThemes: themes, usesDraw: draw, usesFilter: filter, usesFocusKeys: focusKeys, usesTips: tips, claimsTouch: touch, usesSelectors: selectors, usesSchemas: schemas,
      usesEffects: effects, usesDomEffects: domEffects, uses3D: threeD, usesMeasureText: measure, usesDrawImage: drawImage, usesDrawText: drawText, usesFeatures: features, usesFaces: faces, usesChangeEvent: changeEvent,
      usesRichText: richText };
  })();
  // index.js re-exports inspect's query surface by name; a stub must export
  // every name (esbuild resolves named re-exports even when unused downstream).
  // The stub bridge is not EMPTY: an empty `window.__declare` is
  // indistinguishable from breakage to anyone probing a shipped artifact
  // (found exactly that way — a bug report's "the artifact you ship is the
  // one you cannot question"). One field says what happened and names the
  // door; costs a string.
  const bridgeStub = `import { notAboard } from "./errors.js";
export function bridgeFor() { return { stub: notAboard("bridgeFor", "bridge").message }; }
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
    "checkThemeRecord", "checkStyleDecls", "programSchemas", "withDecls",
    "manyPathOf", "coerceToken", "cssAttributeHint"]
    .map((n) => `export function ${n}() { throw notAboard("${n}", "checker"); }`)
    .join("\n") + "\n";
  const checkStubSrc = `import { notAboard } from "./errors.js";\n` + checkStub;
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
import { notAboard } from "./errors.js";
const REFUSE = () => { throw notAboard("select", "selectors"); };
export const selectNodes = REFUSE, selectValue = REFUSE, evaluatePlan = REFUSE;
`;
  // The data-shape validator (data-schema.js, B4) rides only when the
  // program declares a schema — the same pay-per-use lever.
  const dataSchemaStub = `
export function validateShape() { return null; }
export function validateDoc() { return null; }
export function fieldValueError() { return null; }
`;
  // shape-resolve (typed data): the schema-declaration resolver — pure
  // declaration machinery a schema-less program never exercises.
  const shapeResolveStub = `
const EMPTY = new Map();
export function resolveShapes() { return { table: EMPTY, errors: [] }; }
export function shapeNames() { return new Set(); }
export function isArrayDoc() { return false; }
`;
  // themes.js is imported unconditionally by services.js (body scope) and
  // instantiate.js (theme resolution), so the stub keeps their named imports
  // resolvable while dropping the preset records: an empty preset table and an
  // identity tone. A program that names a preset or `activeTone` keeps the real one.
  const themesStub = `export const THEME_PRESETS = Object.freeze({});\nexport const THEME_PRESET_NAMES = [];\nexport function activeTone(accent) { return accent; }\n`;
  const viewportStub = `export function lockFocusZoom() {}\n`;
  // canvas-filter.js: the Safari ctx.filter fallback. Stubbed to "the engine
  // supports it" so replay() takes the direct path — correct for a program that
  // never sets d.filter, since no filter op ever reaches the fallback. ⚠ NOT for
  // a canvas-backend build: frost there filters a backdrop snapshot through this
  // module with no d.filter in the program at all.
  const filterStub = `export function parseFilter() { return { blur: 0, saturate: 1, brightness: 1, contrast: 1, grayscale: 0, invert: 0, unsupported: [] }; }\nexport function isIdentity() { return true; }\nexport function ctxFilterSupported() { return true; }\nexport function forceFilterFallback() {}\nexport function applyFilterFallback(src) { return src; }\n`;
  const drawStub = `export function record() { return null; }\nexport function replay() {}\nexport class Draw {}\nexport class DrawGradient {}\nexport function replayArea() { return 0; }\nexport function rasterLooksBlank() { return false; }\nexport function rasterPad() { return 0; }\nexport function rasterEntryCap() { return 0; }\nexport function rasterTotalCap() { return 0; }\nexport const RASTER_MAX_DIM = 0;\nexport const RASTER_MAX_AREA = 0;\nexport const RASTER_GRACE_MS = 0;\nexport function makeCanvas() { return null; }\nexport function registerDrawImage() {}\nexport function drawImageBitmap() { return undefined; }\nexport function drawImageHandles() { return []; }\n`;
  // The named-vocabulary stubs (programFacts above): each keeps its module's
  // export list and refuses through notAboard, so a program that reaches one
  // anyway fails with the name it used instead of painting wrong.
  const effectsStub = `import { notAboard } from "./errors.js";
const refuse = (n) => () => { throw notAboard(n, "unused"); };
export const blur = refuse("blur");
export const brightness = refuse("brightness");
export const contrast = refuse("contrast");
export const saturate = refuse("saturate");
export const grayscale = refuse("grayscale");
export const invert = refuse("invert");
export const sepia = refuse("sepia");
export const hueRotate = refuse("hueRotate");
export const colorize = refuse("colorize");
export const frost = refuse("frost");
export const radialGradient = refuse("radialGradient");
export const conicGradient = refuse("conicGradient");
export function coerceRadialConic(lit) { throw notAboard(lit.name, "unused"); }
export function coerceFilter(lit) { if (lit.kind === "ident" && lit.name === "null") return { ok: true, value: null }; throw notAboard("filter", "unused"); }
`;
  const domEffectsStub = `import { notAboard } from "./errors.js";
export function tintFilterRef() { throw notAboard("colorize", "unused"); }
export function applyDomMask(s) { if (s.maskSpec !== null) throw notAboard("mask", "unused"); }
`;
  const projectiveStub = `import { notAboard } from "./errors.js";
const refuse = () => { throw notAboard("rotateX", "unused"); };
const flat = (v) => { if ((v.rotateX ?? 0) !== 0 || (v.rotateY ?? 0) !== 0 || (v.translateZ ?? 0) !== 0) refuse(); return null; };
export const has3D = (p) => { flat(p); return false; };
export const spec3DOf = (v) => flat(v);
export const childHomography = (parent, c) => flat(c);
export const unprojectChild = refuse;
export const unproject = refuse;
export const footprint3D = refuse;
export const domTransform3D = refuse;
export const homography = refuse;
export const applyH = refuse;
export const invertH = refuse;
export const inFront = refuse;
export const quadThrough = refuse;
export const boxThroughH = refuse;
export const affineFit = refuse;
export const frontFacing = refuse;
`;
  const measureTextStub = `import { notAboard } from "./errors.js";
export function measureText() { throw notAboard("measureText", "unused"); }
`;
  const fontDeriveStub = `import { notAboard } from "./errors.js";
export function derivedName() { throw notAboard("numerals", "unused"); }
export function splitDerived() { throw notAboard("numerals", "unused"); }
export function ensureDerived() { throw notAboard("numerals", "unused"); }
`;
  const faceLiteralStub = `import { notAboard } from "./errors.js";
export const FONT_WEIGHTS = Object.freeze({});
export const FACE_WEIGHT_FORMS = "";
export function faceWeight() { throw notAboard("Face", "unused"); }
export function faceWeightLiteral() { throw notAboard("Face", "unused"); }
export function faceWeightDescriptor() { throw notAboard("Face", "unused"); }
export function faceSourceLiteral() { throw notAboard("Face", "unused"); }
export function faceSourceCss() { throw notAboard("Face", "unused"); }
`;
  const drawImageStub = `import { notAboard } from "./errors.js";
export function registerDrawImage() {}
export function drawImageBitmap() { return undefined; }
export function drawImageHandles() { return []; }
export function drawImageOp() { throw notAboard("drawImage", "unused"); }
`;
  const drawTextStub = `import { notAboard } from "./errors.js";
export function styledRun() { throw notAboard("fillText", "unused"); }
`;
  // The DOM backend's native rich-text FLOW (dom-rich.js): only a RichText
  // reaches it, so an app that names none refuses the whole module. `false`
  // for the slot capability is the honest answer from a build with no flow at
  // all — nothing reads it, and a backend that says it cannot place inline
  // views is the documented fallback rather than a lie.
  const domRichStub = `import { notAboard } from "./errors.js";
const refuse = () => { throw notAboard("Markdown", "unused"); };
export const richInlineSlots = false;
export const measureRichSlots = refuse;
export const setRichWidth = refuse;
export const setRichClamp = refuse;
export const setRichContent = refuse;
`;
  const changeEventStub = `import { notAboard } from "./errors.js";
export function setChangeDispatcher() {}
export function trackNode(node, names) { if (names !== null && names.length > 0) throw notAboard("trackChanges", "unused"); }
export function untrackNode() {}
export function fireChanges() { return false; }
export function endChangeChain() {}
`;
  const stubFor = (name, filterRe, contents) => ({
    name,
    setup(build) {
      build.onLoad({ filter: filterRe }, () => ({ contents, loader: "js", resolveDir: RUNTIME }));
    },
  });
  const factPlugins = opts.debug ? [] : [
    stubFor("slim-check", /[/\\]check\.js$/, checkStubSrc),
    stubFor("slim-bridge", /[/\\]inspect\.js$/, bridgeStub),
    stubFor("slim-datapath", /[/\\]datapath\.js$/, datapathStub),
    ...(programFacts.usesThemes ? [] : [stubFor("slim-themes", /[/\\]themes\.js$/, themesStub)]),
    ...(programFacts.usesDraw ? [] : [stubFor("slim-draw", /[/\\]draw\.js$/, drawStub)]),
    ...(programFacts.usesFilter || (canvas) ? [] : [stubFor("slim-filter", /[/\\]canvas-filter\.js$/, filterStub)]),
    ...(programFacts.usesFocusKeys ? [] : [
      stubFor("slim-focus", /[/\\]focus\.js$/, focusStub),
      stubFor("slim-keys", /[/\\]keys\.js$/, keysStub),
    ]),
    ...(programFacts.usesTips ? [] : [stubFor("slim-tip", /[/\\]tip\.js$/, tipStub)]),
    ...(programFacts.claimsTouch ? [] : [stubFor("slim-viewport", /[/\\]viewport-lock\.js$/, viewportStub)]),
    ...(programFacts.usesSelectors ? [] : [stubFor("slim-select", /[/\\]select\.js$/, selectStub)]),
    ...(programFacts.usesSchemas ? [] : [stubFor("slim-dataschema", /[/\\]data-schema\.js$/, dataSchemaStub)]),
    ...(programFacts.usesSchemas ? [] : [stubFor("slim-shapes", /[/\\]shape-resolve\.js$/, shapeResolveStub)]),
    ...(programFacts.usesEffects ? [] : [stubFor("slim-effects", /[/\\]effects\.js$/, effectsStub)]),
    ...(programFacts.usesDomEffects ? [] : [stubFor("slim-dom-effects", /[/\\]dom-effects\.js$/, domEffectsStub)]),
    ...(programFacts.uses3D ? [] : [stubFor("slim-3d", /[/\\]projective\.js$/, projectiveStub)]),
    ...(programFacts.usesMeasureText ? [] : [stubFor("slim-measure-text", /[/\\]text-measure\.js$/, measureTextStub)]),
    ...(programFacts.usesFeatures ? [] : [stubFor("slim-features", /[/\\]font-derive\.js$/, fontDeriveStub)]),
    ...(programFacts.usesFaces ? [] : [stubFor("slim-face", /[/\\]face-literal\.js$/, faceLiteralStub)]),
    ...(programFacts.usesDrawImage ? [] : [stubFor("slim-draw-image", /[/\\]draw-image\.js$/, drawImageStub)]),
    ...(programFacts.usesDrawText ? [] : [stubFor("slim-draw-text", /[/\\]draw-text\.js$/, drawTextStub)]),
    ...(programFacts.usesChangeEvent ? [] : [stubFor("slim-change-event", /[/\\]change-event\.js$/, changeEventStub)]),
    ...(programFacts.usesRichText ? [] : [stubFor("slim-dom-rich", /[/\\]dom-rich\.js$/, domRichStub)]),
  ];

  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: RUNTIME, loader: "js", sourcefile: name + ".entry.js" },
    bundle: true, minify: true, format: "esm", target: "es2020",
    external: ["*kernel-js.js"],
    // no runtime-development switches, no native-kernel binding (build-flags.d.ts)
    define: {
      // `opts.marks` keeps the dev switches so the boot stamps wall-clock marks —
      // a MEASUREMENT build (mac-host/profile/coldload.mjs), never a deploy
      __DECLARE_DEV_SWITCHES__: opts.marks ? "true" : "false", __DECLARE_NATIVE_KERNEL__: "false",
      // THE KERNEL RIDES INSIDE THE BUNDLE (base64). A sibling file saved ~3 KB
      // gzipped but cost a request before first paint — one round trip on a real
      // network (a real iPad over Wi-Fi, 2026-09-18: +50–150 ms on every app's
      // startup, and Safari re-requested the file despite the page's preload).
      // One file, one request; the decode is measured in the boot stages.
      __DECLARE_INLINE_KERNEL__: "true",
      __DECLARE_JS_KERNEL__: "false",   // a production build carries no debug kernel, not even its switch
    },
    write: false, legalComments: "none", metafile: true,
    plugins: [...(slim ? [slimPlugin] : []), ...(opts.debug ? [] : [inspectPlugin]), ...factPlugins, ...(opts.debug ? [] : [errorCodePlugin])],
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
    // code → prose for every DeclareError this build coded (empty under
    // --debug, which keeps the sentences). `declare-help E42` reads the
    // committed catalog; this rides out for a caller that wants the build's own.
    errorCodes: errorCatalog,
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
