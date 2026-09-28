#!/usr/bin/env node
// declarec — Declare's production build (the emit half + CLI).
//
//   node tools/declarec.mjs <app.declare> [-o dist] [--canvas] [--crawler] [--extract] [--kernel wasm|js] [--debug] [--why] [--quiet]
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
import { dirname, resolve, basename, join, relative, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { stripSource, HOST_SOURCES } from "./internal/error-codes.mjs";
import * as esbuild from "esbuild";
import { compileProgram } from "../compiler/dist/declarec.js";
import { stripPos } from "../compiler/dist/program-build.js";
import { CAPABILITIES, neededCapabilities, standIn, subsetModule } from "../compiler/dist/capabilities.js";
import { REGISTRY_MANIFEST } from "../runtime/dist/registry.js";

import { parseArgvFlags, DEFAULT_FLAGS } from "../compiler/dist/flags.js";
import { highlight } from "../compiler/dist/highlight.js";
import { compile as compileFull, crawlExtract, diskDataResolver, crawlerDocument } from "../compiler/dist/compile-node.js";
import { parseLibrary } from "../runtime/dist/parser.js";
import { hashValidator } from "../compiler/dist/compile-node.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNTIME = resolve(HERE, "../runtime/dist"); // the run-path lives here
const BROWSER = resolve(HERE, "../browser");      // the web host (boot-uniform, host-client) a SITE module carries
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
export { compactValue, ELIDE_FALSE, minifyBodies };
function compactValue(key, value) {
  if (value === false && ELIDE_FALSE.has(key)) return undefined;
  if (value === null && (key === "name" || key === "def")) return undefined;
  if (Array.isArray(value) && value.length === 0 && ELIDE_EMPTY.has(key)) return undefined;
  return value;
}

const shortHash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 8);
const kb = (n) => (n / 1024).toFixed(1) + " KB";
const gz = (s) => gzipSync(Buffer.from(s)).length;

/** THE SHIP BLOCK, with its defaults — what the program declares a package
 *  must carry beyond what its source names (runtime/src/parser.ts Ship). */
const NO_SHIP = { islands: [], files: [], compiler: false, inspector: false };
const shipOf = (program) => ({ ...NO_SHIP, ...(program.ship ?? {}) });

/** The island program names a program mounts: an island whose `program` is
 *  a LITERAL, found in the tree, plus the program's `ship [ islands = [ … ] ]`
 *  for islands whose `program` is computed and so unreadable to a build. */
function islandNames(program) {
  const names = new Set(shipOf(program).islands);
  const bases = new Map(program.classes.map((c) => [c.name, c.base]));
  const isIsland = (tag) => {
    const seen = new Set();
    let t = tag;
    while (t !== null && t !== undefined && !seen.has(t)) { if (t === "AppIsland") return true; seen.add(t); t = bases.get(t) ?? null; }
    return false;
  };
  const walk = (el) => {
    if (isIsland(el.tag)) {
      const a = (el.attrs ?? []).find((x) => x.name === "program");
      // a compiled program carries the name as its value (compiler/src/lower-literals.ts)
      const name = a?.value?.kind === "string" || a?.value?.kind === "value" ? a.value.value : null;
      if (typeof name === "string" && name !== "" && !name.startsWith("__")) names.add(name);
    }
    for (const c of el.children ?? []) walk(c);
  };
  walk(program.root);
  for (const c of program.classes) walk(c.body);
  return names;
}

/** The files a program would carry if it were packaged on its own: every
 *  sibling of its source except sources, generated output, and dev/VCS cruft —
 *  copyAssets' rule, as a list of absolute paths. */
async function assetFilesOf(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const { name } = entry;
    if (name.startsWith(".") || name.endsWith(".declare") || name.startsWith("app.")) continue;
    if (entry.isDirectory() && SKIP_DIRS.has(name)) continue;
    if (entry.isFile() && SKIP_FILES.has(name)) continue;
    const abs = join(dir, name);
    if (entry.isDirectory()) for (const rel of await walkFiles(abs)) out.push(join(abs, rel));
    else out.push(abs);
  }
  return out;
}

/** THE ISLANDS — the programs this app can mount as an `AppIsland`, compiled
 *  AHEAD and shipped beside it (hosting.md, model 1: a build runs what it was
 *  built with, and compiles nothing unless the program says so), each with
 *  everything it would carry if it were packaged alone. TRANSITIVE: an island
 *  program's own islands, `ship` block, and data files come along too, so a
 *  window that hosts a program that hosts another works in the package as it
 *  does on the site. Keyed by resolved file: a program named by several hosts,
 *  or reached through a cycle (a program embedding itself), compiles and ships
 *  ONCE, and the walk terminates.
 *
 *  Names resolve as the page host resolves them at run time — every island,
 *  at any depth, against the PAGE program's `demos/` folder (host-client
 *  childAssetBase / sourceFor take the one page `demoBase`). An island's DATA
 *  resolves against its own program's folder, which is where its files are
 *  collected from and what their URL-map keys are relative to.
 *
 *  Returns the compiled tenants, the files they need (absolute path + the key
 *  the package's URL map answers for), and the run-time facts their `ship`
 *  blocks add to the package's own. */
async function buildIslands(program, originDir, keepPos) {
  const tenants = [], files = [];
  let compiler = false, inspector = false;
  const seen = new Set([originDir === undefined ? "" : resolve(originDir)]);   // the page's own folder ships physically
  const queue = [...islandNames(program)];
  const built = new Set();
  const within = (abs) => originDir !== undefined && (abs === resolve(originDir) || abs.startsWith(resolve(originDir) + sep));
  while (queue.length > 0) {
    const name = queue.shift();
    if (originDir === undefined) throw new Error(`ship: this build has no source directory to resolve the island '${name}' against — build from a file (declarec <app.declare>)`);
    const file = resolve(originDir, "demos", name + ".declare");
    if (built.has(file)) continue;
    built.add(file);
    if (!existsSync(file)) throw new Error(`ship: the island '${name}' names no program — expected ${relative(originDir, file)} (a name or a relative path, from the program's demos/ folder, as AppIsland.program spells it)`);
    const t = await buildProgramFile(file, name, keepPos);
    tenants.push({ name, ...t });
    const own = shipOf(t.program);
    compiler ||= own.compiler;
    inspector ||= own.inspector;
    for (const n of islandNames(t.program)) queue.push(n);
    // what the island would have carried alone: its folder's data and assets,
    // and the files its own ship block names (relative to ITS program) —
    // unless the folder is the page's, which the package already holds
    const dir = dirname(file);
    const wanted = [];
    if (!seen.has(dir) && !within(dir)) { seen.add(dir); wanted.push(...await assetFilesOf(dir)); }
    for (const f of own.files) {
      const abs = resolve(dir, f);
      if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error(`ship: the island '${name}' names the file '${f}', which is not there — expected ${abs}`);
      wanted.push(abs);
    }
    for (const abs of wanted) if (!within(abs)) files.push(abs);
  }
  return { tenants, files, compiler, inspector };
}

/** One program compiled ahead as a PROGRAM OBJECT — an island's, or the
 *  Inspector's — in the form the runtime instantiates with no parser aboard:
 *  bodies minified, the tree compacted, no source text. */
async function buildProgramFile(file, name, keepPos) {
  const src = await readFile(file, "utf8");
  const built = await compileProgram(src, { originDir: dirname(file), stripPos: !keepPos, mainId: file });
  if (built.program === null) throw new Error(`ship: '${name}' did not compile:\n${built.report}`);
  await minifyBodies(built.program);
  const programJson = JSON.parse(JSON.stringify(built.program, compactValue));
  const contents = JSON.stringify(programJson);
  return { key: shortHash(contents), contents, usedComponents: built.usedComponents, program: built.program };
}

/** THE FILES — what the program declares it reads that no literal names, or
 *  that lives outside its folder (`ship [ files = […] ]`). Each is copied
 *  INTO the package as files/<hash><ext>, and the entry maps the URL the
 *  program will ask for to the copy (runtime asset-base provideUrlMap), so the
 *  program's own text is untouched and the folder is self-contained. */
async function buildFiles(program, originDir, alsoAbs = []) {
  const out = [];
  const byAbs = new Set();
  const add = async (path, abs) => {
    if (byAbs.has(abs)) return;
    byAbs.add(abs);
    const contents = await readFile(abs);
    out.push({ path, abs, file: "files/" + shortHash(contents) + extname(abs), contents });
    // A shipped Declare SOURCE answers the two requests every host answers for
    // one (compiler/src/reqtypes.ts): `?file`, the bytes (the entry above — the
    // map drops a query it has no entry for), and `?segments`, the reader's
    // highlighted form, computed here as the dev server and the prewarm tier
    // compute it, since a package has no highlighter to ask
    if (extname(abs) === ".declare") {
      const seg = JSON.stringify({ path, segments: highlight(contents.toString("utf8")) });
      out.push({ path: path + "?segments", abs, file: "files/" + shortHash(seg) + ".segments.json", contents: seg });
    }
  };
  for (const path of shipOf(program).files) {
    if (originDir === undefined) throw new Error(`ship: this build has no source directory to resolve the file '${path}' against — build from a file (declarec <app.declare>)`);
    const abs = resolve(originDir, path);
    if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error(`ship: the file '${path}' is not there — expected ${abs} (a path relative to the program, as its url or source would spell it)`);
    await add(path, abs);
  }
  // the islands' files (buildIslands): keyed by their path from THIS program,
  // which is the URL an island's own relative request resolves to in the package
  for (const abs of alsoAbs) await add(relative(originDir, abs).split(sep).join("/"), abs);
  return out;
}

/** THE INSPECTOR, compiled ahead (`ship [ inspector = true ]`): the Inspector
 *  is a Declare program, and a package that answers questions about itself
 *  carries it as a program object the way it carries an island's — mounted by
 *  browser/inspector-boot.js from the entry's provideInspectorProgram, with no
 *  compiler on the page unless the program ships one too. */
const INSPECTOR_SRC = resolve(HERE, "../library/platform-apps/inspector/inspector.declare");
const buildInspector = (keepPos) => buildProgramFile(INSPECTOR_SRC, "the Inspector", keepPos);

/** THE COMPILER, mirrored into the package (`ship [ compiler = true ]`): the
 *  distro's layout — bundles/declare-compiler.js, bundles/compile-worker.js,
 *  library/ (the auto-include manifest and every component it can reach) —
 *  under the package root, which the entry names once (compiler-client
 *  provideCompilerRoot). The whole library rides: what source typed at run
 *  time will name is not knowable ahead. */
async function compilerFiles() {
  const out = [];
  for (const rel of ["bundles/declare-compiler.js", "bundles/compile-worker.js"]) {
    out.push({ name: rel, contents: await readFile(resolve(HERE, "..", rel)) });
  }
  const lib = resolve(HERE, "../library");
  for (const rel of await walkFiles(lib)) {
    // dotfiles, prose, and a platform app's own test fixtures stay behind
    if (rel.split("/").some((seg) => seg.startsWith(".") || seg === "tests")) continue;
    if (rel.endsWith(".md")) continue;
    out.push({ name: "library/" + rel, contents: await readFile(join(lib, rel)) });
  }
  return out;
}

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
  // A program's own `theme Name [ … ]` records and `style` bundles are in body
  // scope BY NAME, through the same script scope (instantiate.ts installs
  // each before any body compiles), so the prelude unpacks them as it does a
  // script's bindings — a body reading `Faces.helvetica` resolves the theme.
  for (const t of program.themes ?? []) if (!scriptNames.includes(t.name)) scriptNames.push(t.name);
  for (const s of program.styles ?? []) if (!scriptNames.includes(s.name)) scriptNames.push(s.name);
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
    // THE KERNEL THE BUILD CARRIES (reactive.ts kernelReady): "wasm", the default,
    // or "js" — the JavaScript kernel with the bundle and no WebAssembly at all
    kernel: opts.kernel === "js" ? "js" : "wasm",
    stripPos: String(opts.stripPos ?? true),
    typecheck: "true",   // always on — a mandatory phase of the one compile (docs/system-design/requests.md)
    crawler: String(!!opts.crawler),
    // the corpus gate's build: the `__declare` bridge aboard, nothing else changed
    ...(opts.bridge ? { bridge: "true" } : {}),
    ...(opts.keepAll ? { keepAll: "true" } : {}),
    ...(opts.props ?? {}),
  };
  const mainId = opts.originDir ? join(opts.originDir, `${name}.declare`) : undefined;
  // Positions ride the compile and are stripped AFTER the program's own ship
  // block is read: an inspectable package keeps them (the Inspector's "why"
  // names a line; so does an error), a plain one does not.
  const built = await compileProgram(source, { originDir: opts.originDir, stripPos: false, mainId, props, facts: true });
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
  // THE SHIP BLOCK (runtime/src/parser.ts Ship): what this package carries
  // beyond what the source names — each member a fact the program stated.
  const declared = shipOf(built.program);
  const keepPos = !!opts.debug || declared.inspector || (opts.stripPos === false);
  // The islands' programs, compiled ahead (buildIslands): shipped beside the
  // app as programs/<hash>.json, loaded when an island first names one, each
  // with the files it would carry alone. The Inspector, when declared,
  // arrives the same way.
  const isl = await buildIslands(built.program, opts.originDir, keepPos);
  const tenants = isl.tenants;
  const shippedFiles = await buildFiles(built.program, opts.originDir, isl.files);
  // the package's run-time facts: this program's, OR any island's — a hosted
  // program that compiles at run time needs the compiler aboard its host too
  const ship = { ...declared, compiler: declared.compiler || isl.compiler, inspector: declared.inspector || isl.inspector };
  if (!keepPos && !ship.inspector) stripPos(built.program);
  const inspector = ship.inspector ? await buildInspector(keepPos) : null;
  const hosts = !!opts.hosts || tenants.length > 0 || ship.inspector;
  const alsoUses = [...(opts.alsoUses ?? []), ...tenants.flatMap((t) => t.usedComponents), ...(inspector ? inspector.usedComponents : [])];
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
  // THE BUILD IS A PAGE. The program in hand, booted through the page boot
  // every host runs (browser/boot-page.js): the app-relative data and asset
  // base, the host client — the location↔history mirror (Back, the URL),
  // islands, the page title. A program that could not answer Back or mount an
  // island would not be a smaller build; it would be a broken one. Nothing of
  // the distro rides: no compiler, no compiler loader, no live edit, no
  // service worker, no launcher — a package runs what it was built with
  // (hosting.md, the three models). The module's default export IS the page
  // boot with the program bound; the emitted page calls it as a site stub does.
  // What the ship block adds to the entry, each a one-time statement to the
  // seam it names: the files map (asset-base provideUrlMap), the compiler's
  // whereabouts (compiler-client provideCompilerRoot), the Inspector's program
  // (inspector-boot provideInspectorProgram). `here` is the package folder —
  // the program's own directory, since the page boots `./<name>.declare`.
  const shipEntry =
    (shippedFiles.length === 0 ? "" :
      `import { provideUrlMap } from ${JSON.stringify(join(RUNTIME, "asset-base.js"))};\n` +
      `{ const here = new URL(".", import.meta.url); const FILES = ${JSON.stringify(Object.fromEntries(shippedFiles.map((f) => [f.path, f.file])))};\n` +
      `  const map = new Map(Object.entries(FILES).map(([k, v]) => [new URL(k, here).href, new URL(v, here).href]));\n` +
      `  provideUrlMap((u) => { const q = u.indexOf("?"); return map.get(u) ?? map.get(q < 0 ? u : u.slice(0, q)) ?? u; }); }\n`) +
    (!ship.compiler ? "" :
      `import { provideCompilerRoot } from ${JSON.stringify(join(BROWSER, "compiler-client.js"))};\n` +
      `provideCompilerRoot(new URL(".", import.meta.url));\n`) +
    (inspector === null ? "" :
      `import { provideInspectorProgram } from ${JSON.stringify(join(BROWSER, "inspector-boot.js"))};\n` +
      `provideInspectorProgram(async () => hydrateProgram(await (await fetch(new URL(${JSON.stringify("programs/" + inspector.key + ".json")}, import.meta.url))).json()));\n`);
  const entry =
    `import { bootPage } from ${JSON.stringify(join(BROWSER, "boot-page.js"))};\n` +
    `import { hydrateProgram } from ${JSON.stringify(join(RUNTIME, "hydrate.js"))};\n` +
    (precompiled === null ? "" : `import { providePrecompiled } from ${JSON.stringify(join(RUNTIME, "expr.js"))};\n${precompiled}`) +
    shipEntry +
    `const PROGRAM = hydrateProgram(JSON.parse(${JSON.stringify(programJson)}));\n` +
    (tenants.length === 0
      ? `export default (cfg) => bootPage({ ...cfg, program: PROGRAM, path: "build" });\n`
      // the islands' programs, by the name the island spells (host-client's slot
      // name): fetched beside this module the first time an island names one
      : `const ISLANDS = ${JSON.stringify(Object.fromEntries(tenants.map((t) => [t.name, "programs/" + t.key + ".json"])))};\n` +
        `const island = async (u, name) => { const rel = ISLANDS[name]; if (rel === undefined) return null; const r = await fetch(new URL(rel, import.meta.url)); return r.ok ? { program: hydrateProgram(await r.json()) } : null; };\n` +
        `export default (cfg) => bootPage({ ...cfg, program: PROGRAM, path: "build", prewarm: island });\n`);

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
        // `alsoUses`: components the page must carry for programs it HOSTS —
        // a site page's islands run in its runtime (prewarm.mjs unions them)
        contents: slimRegistrySource([...new Set([...built.usedComponents, ...alsoUses])]),
        loader: "js",
        resolveDir: RUNTIME,
      }));
    },
  };

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
      // the runtime, and the web host's own sources (their boot and island
      // reports are Declare diagnostics too, and ship in the same bundle)
      const host = HOST_SOURCES.map((f) => f.replace(/\.js$/, "").replace(/[-]/g, "\\-")).join("|");
      build.onLoad({ filter: new RegExp(`[/\\\\](?:runtime[/\\\\]dist[/\\\\][^/\\\\]+|browser[/\\\\](?:${host}))\\.js$`) }, async (args) => {
        const raw = await readFile(args.path, "utf8");
        const { src: out, entries } = stripSource(raw);
        for (const e of entries) errorCatalog[e.code] = { message: e.message, file: args.path.split("/").pop(), line: e.line };
        return { contents: out, loader: "js", resolveDir: dirname(args.path) };
      });
    },
  };
  // ── CAPABILITIES (compiler/src/capabilities.ts) ───────────────────────────
  // What this program reaches, read off it by ONE walk, closed over the
  // manifest's `requires`; every capability left out has its modules replaced by
  // a stand-in GENERATED from the real module's exports (inert where the core
  // calls it regardless, refusing "not aboard" everywhere else). A page that
  // hosts other programs keeps what they may need; --debug keeps everything but
  // another renderer and an unasked-for compiler.
  const facts = built.facts;   // read from the program as written, before its literals became values
  const context = { render: canvas ? "canvas" : "dom", debug: !!opts.debug, inspector: !!ship.inspector, compiler: !!ship.compiler, hosts, bridge: !!opts.bridge };
  const needed = neededCapabilities(facts, context);
  // `keepAll`: every capability aboard — the corpus gate's reference build
  const absent = opts.keepAll ? [] : CAPABILITIES.filter((c) => !needed.has(c.id));
  const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const capabilityPlugin = {
    name: "capabilities",
    setup(build) {
      for (const cap of absent) {
        for (const m of cap.modules) {
          const inBrowser = m.startsWith("browser/");
          const base = inBrowser ? m.slice("browser/".length) : m;
          const file = inBrowser ? join(BROWSER, base + ".js") : join(RUNTIME, base + ".js");
          const filter = new RegExp(`[/\\\\]${inBrowser ? "browser" : "runtime[/\\\\]dist"}[/\\\\]${escapeRe(base)}\\.js$`);
          const helpers = inBrowser ? "../runtime/dist/stand-in.js" : "./stand-in.js";
          build.onLoad({ filter }, async () => {
            const source = await readFile(file, "utf8");
            // a table the program reaches only by name ships the entries it names
            const contents = cap.subset !== undefined
              ? subsetModule(cap, m, source, facts)
              : standIn(cap, m, source, helpers);
            return { contents, loader: "js", resolveDir: inBrowser ? BROWSER : RUNTIME };
          });
        }
      }
    },
  };

  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: RUNTIME, loader: "js", sourcefile: name + ".entry.js" },
    bundle: true, minify: true, format: "esm", target: "es2020",
    // the compiler stays a lazy, external fetch (compiler-client) — a live edit's,
    // never on the path to first paint
    external: ["*declare-compiler.js"],
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
      __DECLARE_KERNEL__: JSON.stringify(props.kernel),
    },
    write: false, legalComments: "none", metafile: true,
    plugins: [...(slim ? [slimPlugin] : []), capabilityPlugin, ...(opts.debug || ship.inspector ? [] : [errorCodePlugin])],
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
    // the page boots exactly as a site stub does (browser/serve-core.js): `main`
    // names the program's own directory — its assets and data resolve beside
    // it — and the module's boot() has the program in hand
    `<script type="module">\n` +
    `  import boot from "./${moduleName}";\n` +
    `  boot({ main: "./${name}.declare"${canvas ? ', backend: "CanvasBackend"' : ""}, demos: [] });\n` +
    `</script>\n`;

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
    usedComponents: built.usedComponents, slim, kernel: props.kernel,
    // what the build carries beyond its core, and why; what it left out
    // `absent`: left out, a stand-in in their place; `cut`: tables shipped with
    // only the entries the program names
    capabilities: { needed: Object.fromEntries(needed), absent: absent.filter((c) => c.subset === undefined).map((c) => c.id),
      cut: absent.filter((c) => c.subset !== undefined).map((c) => c.id) },
    // code → prose for every DeclareError this build coded (empty under
    // --debug, which keeps the sentences). `declare-help E42` reads the
    // committed catalog; this rides out for a caller that wants the build's own.
    errorCodes: errorCatalog,
    files: [{ name: "index.html", contents: html }, { name: moduleName, contents: appJs },
            ...tenants.map((t) => ({ name: "programs/" + t.key + ".json", contents: t.contents })),
            ...(inspector === null ? [] : [{ name: "programs/" + inspector.key + ".json", contents: inspector.contents }]),
            ...shippedFiles.map((f) => ({ name: f.file, contents: f.contents })),
            ...(ship.compiler ? await compilerFiles() : [])],
    islands: tenants.map((t) => ({ name: t.name, file: "programs/" + t.key + ".json", gzip: gz(t.contents) })),
    // what the ship block put in the folder, for the CLI's account and the closure
    ship, shipped: {
      files: shippedFiles.map((f) => ({ path: f.path, file: f.file, abs: f.abs, gzip: gz(f.contents) })),
      inspector: inspector === null ? null : { file: "programs/" + inspector.key + ".json", gzip: gz(inspector.contents) },
      compiler: ship.compiler,
    },
  };
}

// Dev-only siblings that must never land in a production build (they'd clobber
// the generated files or bloat the deploy): the app source, the generated
// files, dev host artifacts, VCS/OS cruft, and any dotdir (e.g. the server's
// own `.prod-cache` output dir, which must not recurse into itself).
// `tests/` holds a program's verify fixtures (baselines, assert scripts) —
// read beside the source by `verify`, never by the running program.
const SKIP_DIRS = new Set(["dist", "prebuilt", "node_modules", "tests"]);
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
export async function writeProduction({ source, name = "app", srcDir = null, outDir, stripPos = true, render, slim = true, crawler = false, kernel, props }) {
  const out = await buildProduction(source, { name, originDir: srcDir, stripPos, render, slim, crawler, kernel, props });
  if (!out.ok) return out;
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  for (const f of out.files) { await mkdir(dirname(join(outDir, f.name)), { recursive: true }); await writeFile(join(outDir, f.name), f.contents); }
  const assets = srcDir ? await copyAssets(srcDir, outDir) : [];
  const moduleName = out.files.find((f) => f.name.startsWith("app."))?.name;
  if (srcDir) await writeBuildClosure({ outDir, srcDir, closure: out.closure, assets, metafile: out.metafile, shipped: out.shipped.files.map((f) => f.abs), capabilities: out.capabilities });
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

async function writeBuildClosure({ outDir, srcDir, closure, assets, metafile, shipped = [], capabilities }) {
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
  // …and the files the program's ship block named, wherever they live
  for (const abs of shipped) entries.push({ id: rel(abs), kind: "file", v: hashValidator(abs) });
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
    JSON.stringify({ closure: { entries, props: closure.props }, built: rel(srcDir), capabilities }, null, 1));
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
  // the three MODIFIERS --render/--canvas, --crawler and --kernel share the canonical model (flags.ts),
  // so they mean exactly what the same names mean as server/browser URL modifiers. A
  // build always slims + strips positions + typechecks (docs/system-design/requests.md §"Removed
  // knobs"); --debug is the one escape hatch, for debugging the emitter — it keeps
  // source positions AND the full registry.
  const passthrough = [];
  let outDir = null, quiet = false, doHighlight = false, doExtract = false, debug = false, json = false, why = false;
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
    else if (a === "--why") why = true;
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
    console.error("usage: declarec <app.declare> [-o dist] [--canvas] [--crawler] [--extract] [--kernel wasm|js] [--debug] [--why] [--quiet]");
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
  const out = await writeProduction({ source, name, srcDir, outDir, render: flags.render, crawler: flags.crawler, stripPos: !debug, slim: !debug, kernel: flags.kernel });
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
    console.log(`    kernel: ${out.kernel === "js" ? "JavaScript (--kernel=js)" : "WebAssembly"}`);
    if (out.slim) {
      // Count only the RUNTIME components (the registry names) — the used-set also
      // carries the app's own classes (always bundled, never in the registry), so
      // they don't belong in an "N of M runtime components" figure.
      const builtins = new Set(REGISTRY_MANIFEST.map((e) => e.name));
      const kept = [...out.usedComponents].filter((n) => builtins.has(n)).sort();
      console.log(`    registry: ${kept.length} of ${builtins.size} runtime components kept — ${kept.join(", ")}`);
    } else console.log(`    registry: FULL (slimming off)`);
    // what the build carries of the optional runtime (compiler/src/capabilities.ts);
    // --why says what in the program brought each one aboard
    const aboard = Object.entries(out.capabilities.needed);
    const { absent: out_, cut } = out.capabilities;
    console.log(`    capabilities: ${aboard.length} of ${aboard.length + out_.length + cut.length} aboard${cut.length ? `, ${cut.length} cut to what the program names (${cut.join(", ")})` : ""}${out_.length ? ` — left out: ${out_.join(", ")}` : ""}`);
    if (why) for (const [id, reason] of aboard) console.log(`      ${id}: ${reason}`);
    if (assets.length) console.log(`  assets: ${assets.join(", ")}`);
    if (out.islands.length) console.log(`  islands: ${out.islands.map((i) => `${i.name} → ${i.file} (${kb(i.gzip)} gzip)`).join(", ")}`);
    for (const f of out.shipped.files) console.log(`  ship files: ${f.path} → ${f.file} (${kb(f.gzip)} gzip)`);
    if (out.shipped.inspector) console.log(`  ship inspector: ${out.shipped.inspector.file} (${kb(out.shipped.inspector.gzip)} gzip), positions and error prose kept`);
    if (out.shipped.compiler) console.log(`  ship compiler: bundles/declare-compiler.js, bundles/compile-worker.js, library/ (fetched on the first compile)`);
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
