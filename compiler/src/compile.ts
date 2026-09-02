// compile — the source-level front-end: parse + check + compile-time scope
// resolution, producing a *resolved* program source whose `{ }` bodies read
// enclosing-scope members through explicit paths. This is where bare names
// (language §11) become meaning:
//
//   Bare names resolve up the BRACKET NESTING, innermost first — the brackets
//   are the scope exactly as they are the tree. Each enclosing element is a
//   level whose surface is its full member set (its class chain's attributes,
//   methods, and named children, plus anything declared inline); the nearest
//   level owning the name wins, and the rewrite is the explicit read the R4
//   ruling demands (compile-time resolution, never runtime `with`/Proxy
//   scoping): `this.x` at the code's own node, `parent.…x` at an intermediate
//   ancestor, `classroot.x` at the enclosing body root (a class root, or the
//   App root — the whole main tree is the anonymous App class of §5). Writes
//   rewrite identically, so `count = count + 1` in a class handler mutates
//   classroot state through the reactive setter.
//
//   Because every View level carries the built-in attributes, a bare `width`
//   always means `this.width` — outer built-ins are unreachable by shadowing,
//   which makes the doc's `opacity = { shown ? 1 : 0 }` (Screen, Appendix A)
//   work while keeping bare geometry predictable. A *user-declared* outer
//   member shadowed by a nearer resolution is the confusable case, and warns,
//   naming the qualified spelling. A name no level, parameter, or global
//   answers is a positioned error — the typo'd `lable` dies at compile time.
//
//   `App.zip` (§11's qualified form) resolves lexically: `App` names the root
//   level wherever the main tree encloses the code. Inside a named class's
//   body the App is NOT in scope — classes are lexically top-level (the
//   App-as-global question is recorded in HANDOFF §R6).
//
// Identifier classification rides the TypeScript parser (free-idents.ts —
// sanctioned reuse; see that file's header), which is exactly why this module
// is NOT part of the runtime graph: dist/index.js stays zero-dependency and
// browser-loadable, and the browser path consumes this module's *output* (a
// resolved source), compiling on the Node side of the pipeline — the same
// place the APPROACH §5 tsc front-end will live. Import it as
// `neolang/dist/compile.js`.
//
// The output is source-to-source: the input with each bare occurrence spliced
// to its explicit path (object-literal shorthand `{ count }` becomes
// `count: classroot.count`). Diagnostics always carry ORIGINAL positions —
// resolution runs on the un-rewritten tree. Resolution runs only once check()
// is clean: under an unknown tag or member the scope surfaces would be
// guesses, and phased diagnostics (syntax → types → resolution) beat noisy
// ones.

import { parseProgram, type Element, type Program } from "../../runtime/dist/parser.js";
import { DeclareError, DeclareErrors, type Pos } from "../../runtime/dist/errors.js";
import { check, programSchemas } from "../../runtime/dist/check.js";
import { SCHEMAS, descendsFrom, attrType } from "../../runtime/dist/schema.js";
import { resolveShapes } from "../../runtime/dist/shape-resolve.js";
import { serializeDeps } from "../../runtime/dist/deps.js";
import { serializeLinks, type SerializedLink } from "../../runtime/dist/links.js";
import { annotateProgram } from "./dep-extract.js";
import { schemaCheck } from "./schema-check.js";
import { extractLinks, attachAuthoredLinks } from "./links.js";
import { buildRegistry, checkReferences } from "./registry.js";
import ts from "typescript";
import { stripEditsFor, tsBodySyntax } from "./strip-types.js";

/** Marks a script body the compiler has already given its bindings tail, so a
 *  recompile of emitted output (serve/prod parity paths) doesn't append twice. */
const BINDINGS_MARK = "/*$b*/";

/** The top-level names a `script { … }` block declares — functions, classes,
 *  enums, and variables, including the names inside destructuring patterns.
 *  These become the block's bindings object; nothing nested is reachable, which
 *  is the point (a script block is module scope, not a scope noun). */
function topLevelBindings(src: string): string[] {
  const names: string[] = [];
  const addFromName = (n: ts.BindingName): void => {
    if (ts.isIdentifier(n)) { names.push(n.text); return; }
    for (const el of n.elements) {
      if (ts.isBindingElement(el)) addFromName(el.name);
    }
  };
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile("script.ts", src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  } catch { return names; }
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) {
      if (st.name !== undefined) names.push(st.name.text);
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) addFromName(d.name);
    } else if (ts.isImportDeclaration(st)) {
      names.push(...importedNames(st));
    }
  }
  return [...new Set(names)];
}

/** The value bindings one `import` declaration introduces — default, namespace,
 *  and named (as-renamed) alike. Type-only imports bind nothing at runtime. */
export function importedNames(st: ts.ImportDeclaration): string[] {
  const names: string[] = [];
  const c = st.importClause;
  if (c === undefined || c.isTypeOnly) return names;
  if (c.name !== undefined) names.push(c.name.text);
  const b = c.namedBindings;
  if (b !== undefined) {
    if (ts.isNamespaceImport(b)) names.push(b.name.text);
    else for (const s of b.elements) if (!s.isTypeOnly) names.push(s.name.text);
  }
  return names;
}

/** The MUTABLE subset of a script block's top-level bindings: `let` and `var`.
 *  A body receives every script binding as a `const` copy (expr.ts
 *  scriptPrelude), so a read of a `let` sees its value at that moment and a
 *  write throws at runtime — "Assignment to constant variable", once per
 *  frame from a per-frame Time, with a minified stack naming nothing (field report
 *  2026-08-21). The resolver refuses the write instead. */
function topLevelMutableBindings(src: string): string[] {
  const names: string[] = [];
  const addFromName = (n: ts.BindingName): void => {
    if (ts.isIdentifier(n)) { names.push(n.text); return; }
    for (const el of n.elements) if (ts.isBindingElement(el)) addFromName(el.name);
  };
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile("script.ts", src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  } catch { return names; }
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st) && (st.declarationList.flags & ts.NodeFlags.Const) === 0) {
      for (const d of st.declarationList.declarations) addFromName(d.name);
    }
  }
  return names;
}
/** Does a method body READ the named binding anywhere (as a value, not as a
 *  property name or a declaration)? The parser's word, not a regex: `dt` inside
 *  a string or a comment is not a read. */
function bodyMentions(src: string, name: string): boolean {
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile("body.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  } catch { return true; } // unparseable → not our call; the checker reports it
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(n) && n.text === name) {
      const p = n.parent;
      const isName = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n)
        || ((ts.isVariableDeclaration(p) || ts.isParameter(p)) && p.name === n);
      if (!isName) { found = true; return; }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}
/** Does a { } body read the AMBIENT clock — `Date.now()`, `new Date()` with no
 *  argument, `performance.now()`? A read with no cell behind it: the body
 *  evaluates once and never again (the stopped clock, open-items L-25). The
 *  current time is a Time member's facts. `new Date(value)` projects a VALUE
 *  and is not judged. Returns the spelling found, or null. */
function ambientRead(src: string): string | null {
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile("body.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  } catch { return null; }
  let found: string | null = null;
  const visit = (n: ts.Node): void => {
    if (found !== null) return;
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ts.isIdentifier(n.expression.expression)
        && n.expression.name.text === "now" && (n.expression.expression.text === "Date" || n.expression.expression.text === "performance")) {
      found = `${n.expression.expression.text}.now()`;
      return;
    }
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "Date" && (n.arguments === undefined || n.arguments.length === 0)) {
      found = "new Date()";
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}
/** Is this element's `tick` written `frame` at its own site? Conservative: an
 *  inherited class default is not seen and a `{ }` is unknown — no warning. */
function tickIsFrame(el: Element): boolean {
  for (const a of el.attrs) if (a.name === "tick") return a.value.kind === "ident" && a.value.name === "frame";
  return false;
}
import { setBodySyntaxValidator } from "../../runtime/dist/expr.js";

// Bodies are authored as TypeScript: when the compiler is present, the
// check-phase body-syntax gate parses TS (the type-level syntax is stripped
// before emission, below). Installed at module load — every compile() on
// every host goes through this file.
setBodySyntaxValidator(tsBodySyntax);
import type { ComponentSchema } from "../../runtime/dist/schema.js";
import { freeIdentifiers, hexColor8Literals } from "./free-idents.js";
import { fillDatapaths, scanDatapaths, splitPath } from "../../runtime/dist/datapath.js";
import { CONSTRUCTOR_NAMES } from "../../runtime/dist/expr.js";
import { CSS_COLORS } from "../../runtime/dist/css-colors.js";
import { hostGlobalHint } from "../../runtime/dist/teach.js";
import { PRELUDE_NAMES } from "./scaffold.js";
import { resolveIncludes, resolveAutoIncludes, spliceScriptFiles, NO_INCLUDES, type IncludeHost, type AutoIncludeHost } from "../../runtime/dist/include.js";
import { typecheckBodies } from "./typecheck.js";
import type { TypeOracle } from "./typecheck.js";
import { Diag, toDiagnostic, renderReport, type Diagnostic, type DiagPhase } from "../../runtime/dist/diagnostics.js";

/** The names resolution leaves alone in CALLEE position: the four value
 *  constructors expr.ts scopes into every body — `stroke(…)` builds a Stroke
 *  while bare `stroke` is still the slot — plus one more: the spine's
 *  global-function table publishes `colorWithAlpha(rgb, a)` and every body's
 *  runtime scope carries it (expr.ts LOWERED — it is the lowering target for
 *  `0xRRGGBBAA` literals), so a DYNAMIC alpha (`colorWithAlpha(theme.accent,
 *  hover ? 0.8 : 0.4)`) is callable exactly as documented; the literal
 *  spelling stays `0xRRGGBBAA` for constant alpha. Callee position only,
 *  like the constructors — bare `colorWithAlpha` is still a member name. */
const CALLEE_GLOBALS = new Set([...CONSTRUCTOR_NAMES, "colorWithAlpha"]);

/** A compile result. `source` is the resolved program (null when there are
 *  errors); `deps` is the extracted `{ }`-constraint dependency list (walk-order
 *  read-paths, docs/system-design/constraints.md §5), present exactly when `source` is — so
 *  the ONE result carries everything a renderer needs and no caller re-derives
 *  or forgets it. `warnings` (shadowing) never block. `diagnostics` is the
 *  unified, coded view of everything reported (errors + warnings, every phase —
 *  the one structured surface, diagnostics.ts); `errors`/`warnings` remain the
 *  raw DeclareError lists for existing callers. */
export interface Compiled {
  source: string | null;
  deps?: readonly (readonly string[])[];
  /** The extracted navigation relation (capabilities.md §6, links.ts) — a
   *  sparse walk-order side-list of `navigate(to)` targets, present exactly when
   *  `source` is. Rides the ONE result like `deps`; the runtime zips it back on
   *  and the static extractor turns each into an `<a href>`. */
  links?: readonly SerializedLink[];
  /** The authored link namespace (location.md §0.3, registry.ts): every shows
   *  name, and every registered anchor with the destination that gates it.
   *  Present exactly when `source` is. The crawler's seeds and the checked
   *  vocabulary for evaluated references. */
  linkRegistry?: { destinations: readonly string[]; anchors: Readonly<Record<string, string>> };
  errors: DeclareError[];
  warnings: DeclareError[];
  diagnostics: Diagnostic[];
  /** The whole compile RENDERED (renderReport): a count summary + each
   *  diagnostic's `rendered`, one per line; "" when there is nothing to say.
   *  A CLI prints it verbatim; a rich consumer reads `diagnostics` instead —
   *  the same dual-form rule each Diagnostic itself follows. */
  report: string;
}

/** Assemble the unified diagnostic view: each error/warning becomes a coded
 *  Diagnostic (its own catalog code if a factory set one, else the phase
 *  fallback) CARRYING its rendered form, plus the whole-compile `report` —
 *  spread into every result literal so no exit path can omit either. Errors
 *  precede warnings; a caller wanting source order can sort on `pos`. */
function diagnose(
  errors: readonly DeclareError[],
  warnings: readonly DeclareError[],
  errPhase: DiagPhase,
  warnPhase: DiagPhase = "name"
): { diagnostics: Diagnostic[]; report: string } {
  const diagnostics = [
    ...errors.map((e) => toDiagnostic(e, "error", errPhase)),
    ...warnings.map((w) => toDiagnostic(w, "warning", warnPhase)),
  ];
  return { diagnostics, report: renderReport(diagnostics) };
}

/** The gesture model's ordinary-apps clause (Rule 3, docs/guide Gestures
 *  chapter): iOS zooms the whole page toward a focused text field whose text
 *  is smaller than 16px — factor = 16 ÷ fontSize, measured — and back on
 *  blur. The runtime leaves that behavior alone, so the fix belongs in the
 *  source, and the compiler names it here: a WARNING, never blocking. Only
 *  written knowledge speaks — a field whose effective size comes from a
 *  literal number below 16 (its own `fontSize`, or the nearest enclosing
 *  literal; prevailing inheritance follows containment). A `{ }`-computed
 *  size is unknowable at compile time and stays silent. Two exemptions: an
 *  app with full gesture control (its App declares the raw touch family) —
 *  the runtime suspends the auto-zoom for it (viewport-lock.ts) — and
 *  merged-in library source (below `mainStart`), which the author cannot
 *  edit; their own fields are the ones they can fix. */
function smallFieldWarnings(program: Program, mainStart: number): DeclareError[] {
  const out: DeclareError[] = [];
  if (program.root.methods.some((m) => m.name.startsWith("onTouch"))) return out;
  const bases = new Map(program.classes.map((c) => [c.name, c.base]));
  const isField = (tag: string): boolean => {
    for (let t: string | undefined = tag; t !== undefined; t = bases.get(t)) if (t === "TextInput") return true;
    return false;
  };
  const walk = (el: Element, inherited: number | null): void => {
    let size = inherited;
    let ownPos: Pos | null = null;
    const own = el.attrs.find((a) => a.name === "fontSize");
    if (own !== undefined) {
      // A written number is knowledge; anything else (a `{ }` body, a theme
      // derive) means "unknowable below here" — silence, not a guess.
      size = own.value.kind === "number" ? own.value.value : null;
      ownPos = own.pos;
    }
    if (isField(el.tag) && size !== null && size < 16 && el.pos.offset >= mainStart) {
      const at = ownPos !== null && size !== inherited ? ownPos : el.pos;
      out.push(Diag.smallField(
        `a text field at ${size}px: iOS zooms the whole page toward any focused field smaller than 16px, and back on blur — set fontSize = 16 on the field (or the ancestor it inherits from) to keep the viewport still`,
        at,
        `measured: the zoom factor is 16 ÷ fontSize — at ${size}px the page jumps to ×${(16 / size).toFixed(2)}; at 16px it stays put`
      ));
    }
    for (const c of el.children) walk(c, size);
  };
  for (const cls of program.classes) walk(cls.body, null);
  walk(program.root, null);
  return out;
}

/** Names bound in every body without being members: the scope-noun arguments of
 *  the compiled Function (expr.ts) and its own `arguments`. `this` is not an
 *  identifier and needs no entry. `classroot` is deliberately NOT here — it is
 *  surfaced as a free identifier so the resolver can REJECT it in the App body
 *  (there is no component to root there) and pass it through untouched in a
 *  class body, where the runtime binds it. */
const BOUND = ["parent", "arguments"];

/** Which kind of `{ }` body is being resolved. `classroot` is valid ONLY in a
 *  `class` body (the component you define); every other kind rejects it. */
type ScopeKind = "class" | "app" | "stylesheet" | "bundle";

// What a bare name in a { } body may resolve to beyond the tree — ONE list,
// the same on every host, and the checker's prelude is the law:
//   1. the ES built-ins (a fixed set — NOT `name in globalThis`, which on a
//      Node compile admitted `process` and `Buffer`, and in a browser compile
//      `document`, each then refused at the typecheck with TypeScript's own
//      advice: "change lib to dom", "npm i @types/node");
//   2. the host chores the prelude declares by hand (timers, console, the
//      fetch/URL family — scaffold.ts), the same shape on all three renderers;
//   3. the runtime services in body scope (expr.ts setBodyServices).
// Everything else is unresolved — and a known host global (document, window,
// process, …) is refused BY NAME with the Declare way (teach.ts).
// `globalThis` is on the ES list, so `(globalThis as any).x` remains the one
// visible, greppable escape (library/menu.declare uses it for rAF).
const ES_GLOBALS = new Set([
  "globalThis", "Object", "Function", "Array", "Number", "Boolean", "String", "Symbol", "BigInt",
  "Date", "RegExp", "Math", "JSON", "Intl", "Reflect", "Proxy", "Promise",
  "Error", "AggregateError", "EvalError", "RangeError", "ReferenceError", "SyntaxError", "TypeError", "URIError",
  "Map", "Set", "WeakMap", "WeakSet", "WeakRef", "FinalizationRegistry",
  "ArrayBuffer", "SharedArrayBuffer", "DataView", "Atomics",
  "Int8Array", "Uint8Array", "Uint8ClampedArray", "Int16Array", "Uint16Array", "Int32Array", "Uint32Array",
  "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array",
  "parseInt", "parseFloat", "isNaN", "isFinite", "Infinity", "NaN", "undefined", "eval",
  "encodeURI", "encodeURIComponent", "decodeURI", "decodeURIComponent", "escape", "unescape",
]);

// The runtime services in body scope (expr.ts setBodyServices): bare `Focus`
// in a handler is the service, never a member to resolve. `afterSettle` is the
// one function-shaped entry — "finish after your change has taken effect".
const RUNTIME_SERVICES = new Set(["Focus", "Keys", "Themes", "Inspect", "afterSettle"]);

const isKnownGlobal = (name: string): boolean => ES_GLOBALS.has(name) || PRELUDE_NAMES.has(name) || RUNTIME_SERVICES.has(name);

interface Edit {
  start: number;
  end: number;
  text: string;
}

/** One scope level's member surface. `all` answers resolution (schema-chain
 *  attributes + methods + named children + inline members); `declared` is
 *  the user-written subset — the only names whose shadowing warns (built-in
 *  `width` exists at every level; warning about it would be noise). */
interface Surface {
  all: Set<string>;
  declared: Set<string>;
}

/** Options for compile(): the file-access host `include` resolution rides and
 *  the main file's directory. The host defaults to the Node filesystem (this
 *  is the Node-side front-end) and originDir to the process cwd — includes
 *  resolve relative to the compiling file's dir when the caller supplies it. */
export interface CompileOptions {
  host?: IncludeHost;
  originDir?: string;
  /** The tsc-over-`{ }`-bodies typecheck (typecheck.ts) — ON BY DEFAULT, part
   *  of THE compile like every other phase: the checker is imported directly
   *  (never injected), so no front-end can exist where this flag silently
   *  no-ops. A type error blocks emission like any other, reported as an
   *  DECLARE6001 diagnostic mapped to its `.declare` line. `typecheck: false`
   *  (URL `?typecheck=0`, CLI `--no-typecheck`) is the EXPLICIT opt-out for a
   *  latency-critical loop (a debounced per-keystroke compile) — a visible,
   *  greppable choice, never a wiring accident. */
  typecheck?: boolean;
  /** Bundle the program's script module — the seam that makes ES `import`
   *  inside `script { }` real (composition.md §2). Handed the concatenated
   *  script sources (TypeScript, imports included) and the directory bare
   *  and relative specifiers resolve against; returns the bundled CommonJS
   *  text, or an error to report. Node hosts (the dev server, declarec,
   *  verify) supply an esbuild-backed implementation (compile-node); the
   *  in-browser compiler has none, so a program with script imports is
   *  refused there with the reason. */
  bundleScripts?: (entry: string, resolveDir: string) => Promise<{ code: string } | { error: string }>;
}

/** Compile a Declare source: full diagnostics (include resolve + check + scope
 *  resolution), and a SELF-CONTAINED resolved source the zero-dependency
 *  runtime consumes with NO include host. Included libraries are spliced in
 *  (each with its own `include` directives excised, dependency-first so a base
 *  is declared above its subclass) ahead of the main file (its directives
 *  excised too), producing ONE merged source: parse → check → scope-resolve →
 *  emit all run over its identical offsets, so the output contains every
 *  included class/stylesheet/style, carries no `include` directive, and has
 *  every body — the main file's AND the included files' — bare-name-resolved.
 *
 *  Diagnostics trade-off (composition.md §1): the file-named collision /
 *  missing-file / stray-root reports come from the include walk (before the
 *  merge). Everything after — check and scope-resolution — runs on the merged
 *  source, so a type error inside an INCLUDED file is positioned within the
 *  merged text, not its own file. This is the v1 reading §1 already defers
 *  (multi-file `Pos`); it keeps the emit path drift-free — one source feeds
 *  check, the Resolver, and the output, so their offsets cannot disagree. */
export async function compile(source: string, opts: CompileOptions = {}): Promise<Compiled> {
  let main: Program;
  try {
    main = parseProgram(source);
  } catch (e) {
    // The recognition layer (parser.ts) recovers through known TS-isms and
    // raises them ALL as one DeclareErrors — flatten, so each gets its own
    // positioned diagnostic like check()'s errors always have.
    if (e instanceof DeclareErrors) return { source: null, errors: [...e.errors], warnings: [], ...diagnose([...e.errors], [], "syntax") };
    if (e instanceof DeclareError) return { source: null, errors: [e], warnings: [], ...diagnose([e], [], "syntax") };
    throw e;
  }
  const host = opts.host ?? NO_INCLUDES;
  const resolved = await resolveIncludes(main, host, opts.originDir ?? "");
  if (resolved.errors.length > 0) {
    return { source: null, errors: resolved.errors, warnings: [], ...diagnose(resolved.errors, [], "module") };
  }

  // Auto-include: pull the libraries that define the program's bare component
  // tags (`Bar [ … ]` with no `include`, no inline class) — after explicit
  // includes, sharing their visited set so the two dedup. A no-op on a host
  // without the manifest (single-file compiles stay byte-identical).
  const auto = await resolveAutoIncludes(resolved.program, main.root, host, resolved.visited);
  if (auto.errors.length > 0) {
    return { source: null, errors: auto.errors, warnings: [], ...diagnose(auto.errors, [], "module") };
  }

  // The one self-contained source: explicit-include libraries, then auto-
  // included component libraries (both dependency-first, their own directives
  // cut), then the main file (its directives cut). With no includes and no
  // magic tags this is `source` unchanged, so single-file offsets are identical.
  // Script files splice in and include directives cut out in ONE pass (both
  // span sets are in the original text's coordinates). A missing script file
  // reports like a missing include.
  const scriptFileErrors: DeclareError[] = [];
  let mainSource = await spliceScriptFiles(source, main.scriptFiles, main.scriptFileSpans, opts.originDir ?? "", host, scriptFileErrors, main.includeSpans);
  if (scriptFileErrors.length > 0) {
    return { source: null, errors: scriptFileErrors, warnings: [], ...diagnose(scriptFileErrors, [], "module") };
  }
  const libSources = [...resolved.sources, ...auto.sources];
  // Parallel to libSources: which FILE each prelude segment is, so a position
  // that lands in the prelude is rebased onto that file (makeRebaser).
  const libIds = [...resolved.sourceIds, ...auto.sourceIds];

  // Library-provided singletons ride in by MANIFEST RULE (`$provide` in
  // autoincludes.json): the FocusRing with any Control descendant (OL's
  // `canvas.focusclass` default, reborn), the Tooltip with any `tip`
  // attribute — each suppressed when the author declares that name
  // themselves (the customization path). The trigger vocabulary and the
  // executor live below; the ASSOCIATIONS are the library's data.
  {
    const byName = new Map(auto.program.classes.map((c) => [c.name, c]));
    const treeHas = (el: Element, tag: string): boolean =>
      el.tag === tag || el.children.some((ch) => treeHas(ch, tag));
    // Splice an auto-provided singleton as the LAST App child. The preceding
    // member may have closed INLINE (no trailing comma — the inline-]& rule),
    // so add the terminator when the last non-space char before the close
    // isn't one already.
    const spliceLast = (src: string, snippet: string): string => {
      const close = src.lastIndexOf("]");
      if (close < 0) return src;
      let i = close - 1;
      while (i >= 0 && /\s/.test(src[i])) i--;
      const needsComma = i >= 0 && src[i] !== "," && src[i] !== "[";
      return src.slice(0, close) + (needsComma ? "," : "") + snippet + src.slice(close);
    };
    // ── PROVIDED SINGLETONS — data, not code paths ────────────────────────
    // The library manifest's `$provide` rules say when a program has EARNED a
    // library-provided singleton (the FocusRing with any Control descendant;
    // the Tooltip with any `tip` attribute). The compiler executes ONE
    // generic rule over a small trigger vocabulary — `baseUsed` (a declared
    // class descends from the named base) and `attributeUsed` (any element
    // sets the named attribute) — includes the class's own manifest file, and
    // splices `Class [ ],` as the LAST App child (source order stacks, so
    // last = above content). A program that declares its own instance or
    // class of that name suppresses the provision — the customization path.
    // Adding a provided singleton is a manifest edit, never a compiler edit.
    const descendsFromNamed = (name: string, base: string): boolean => {
      const seen = new Set<string>();
      for (let c = byName.get(name); c !== undefined && !seen.has(c.name); c = byName.get(c.base ?? "")) {
        if (c.name === base) return true;
        seen.add(c.name);
        if (c.base === undefined || c.base === null) break;
        if (c.base === base) return true;
      }
      return false;
    };
    // An element's tag descends from a BUILT-IN base: walk the declared-class
    // chain to its terminal name, then the schema chain. This is what scopes
    // `attributeUsed` — on a View descendant a schema-owned name like `tip`
    // can only mean the schema's slot (redeclaration is refused), but on a
    // Node-descended class an attribute named `tip` is the AUTHOR'S slot and
    // must never trigger provision (David's catch).
    const tagDescendsFrom = (tag: string, base: string): boolean => {
      let name = tag;
      const seen = new Set<string>();
      while (byName.has(name) && !seen.has(name)) {
        seen.add(name);
        const b = byName.get(name)?.base;
        if (b === undefined || b === null) return false;
        name = b;
      }
      const schema = Object.hasOwn(SCHEMAS, name) ? SCHEMAS[name] : null;
      return schema !== null && (schema.name === base || descendsFrom(schema, base));
    };
    const elUsesAttr = (el: Element, name: string, onBase: string | null): boolean =>
      (el.attrs.some((a) => a.name === name) && (onBase === null || tagDescendsFrom(el.tag, onBase))) ||
      el.children.some((ch) => elUsesAttr(ch, name, onBase));
    const attrUsed = (name: string, onBase: string | null): boolean =>
      elUsesAttr(main.root, name, onBase) || auto.program.classes.some((c) => elUsesAttr(c.body, name, onBase));
    // The host's own type, not a convenient re-description of it. This cast used
    // to declare `resolveLibrary` SYNCHRONOUS — and when the include seam went
    // async the compiler believed the cast: `lib` became a Promise, `lib.canonical`
    // undefined, and `libSources.push(lib.source)` pushed undefined, so a
    // $provide'd component was silently never spliced. tsc could not object,
    // because the lie was written here. Reuse AutoIncludeHost's shape instead.
    const autoHost = host as Partial<Pick<AutoIncludeHost, "autoincludes" | "resolveLibrary">>;
    if (typeof autoHost.autoincludes === "function" && typeof autoHost.resolveLibrary === "function") {
      const manifest = autoHost.autoincludes();
      const rules = manifest["$provide"];
      if (Array.isArray(rules)) {
        for (const rule of rules) {
          if (rule === null || typeof rule !== "object") continue;
          const r = rule as { class?: unknown; when?: { baseUsed?: unknown; attributeUsed?: unknown; onBase?: unknown }; comment?: unknown };
          const cls = typeof r.class === "string" ? r.class : null;
          if (cls === null) continue;
          const when = r.when ?? {};
          const triggered =
            (typeof when.baseUsed === "string" && auto.program.classes.some((c) => descendsFromNamed(c.name, when.baseUsed as string))) ||
            (typeof when.attributeUsed === "string" &&
              attrUsed(when.attributeUsed, typeof when.onBase === "string" ? when.onBase : null));
          if (!triggered) continue;
          if (byName.has(cls) || treeHas(main.root, cls)) continue; // the program provides its own
          const path = manifest[cls];
          const lib = typeof path === "string" ? await autoHost.resolveLibrary!(path) : null;
          if (lib === null || lib === undefined || resolved.visited.has(lib.canonical)) continue;
          libSources.push(lib.source);
          libIds.push(lib.canonical);
          const comment = typeof r.comment === "string" ? r.comment : `${cls} — provided with the component library`;
          mainSource = spliceLast(mainSource, `\n    // ${comment}\n\n    ${cls} [ ],\n`);
        }
      }
    }
  }
  let merged = libSources.length > 0
    ? libSources.join("\n") + "\n" + mainSource
    : mainSource;
  // Every phase below indexes into `merged`; the author indexes into their own
  // files. `rb` closes that gap on the way out (see makeRebaser): the prelude is
  // a sequence of whole files, each `source + "\n"`, so its segment table is
  // known exactly here — captured BEFORE the shows-lowering below edits the
  // main region.
  const preludeLen = merged.length - mainSource.length;   // bytes; smallFieldWarnings scopes by it
  const segments: PreludeSegment[] = [];
  {
    let startLine = 1;
    for (let i = 0; i < libSources.length; i++) {
      const lines = countLines(libSources[i]);
      segments.push({ file: displayFile(libIds[i], opts.originDir ?? ""), source: libSources[i], startLine, lines });
      startLine += lines; // the joining "\n" closes the segment's last line; no blank line is added
    }
  }
  const rb = makeRebaser(mainSource, segments);
  const rbAll = (es: readonly DeclareError[]): DeclareError[] => es.map(rb);

  // Re-parse the merged source so every later phase indexes into ONE text.
  // (Each piece parsed cleanly on its own as a library / program, and a run of
  // top-level declarations followed by the main root is itself a valid program.)
  let program: Program;
  try {
    program = parseProgram(merged);
  } catch (e) {
    if (e instanceof DeclareError) { const es = rbAll([e]); return { source: null, errors: es, warnings: [], ...diagnose(es, [], "syntax") }; }
    throw e;
  }
  // ── the LINK REGISTRY (location.md §0.3, registry.ts) ───────────────────
  // BEFORE the lowering, deliberately: these checks read the AUTHORED program
  // — the double-gate lint must see the author's visible, not the location
  // gate the lowering is about to synthesize. Authored names collected and
  // uniqueness-enforced; every literal reference resolved; the migration lint.
  const regResult = buildRegistry(program);
  const refResult = checkReferences(program, regResult.registry);
  const regErrors = rbAll([...regResult.errors, ...refResult.errors]);
  const regWarnings = rbAll([...regResult.warnings, ...refResult.warnings]);
  if (regErrors.length > 0) return { source: null, errors: regErrors, warnings: regWarnings, ...diagnose(regErrors, regWarnings, "structure") };
  const linkRegistry = {
    destinations: [...regResult.registry.destinations],
    anchors: Object.fromEntries(regResult.registry.anchors),
  };

  // ── `shows` LOWERING (location.md §0.4) ─────────────────────────────────
  // `shows = "why"` implies the visibility: the location's DESTINATION part
  // (the runtime strips its own trailing `@name` — app.destinationOf) equals
  // the name. Lowered HERE, as a text edit on the merged source, because the
  // pipeline is source-spliced: everything downstream — check, resolution,
  // typecheck, DEP EXTRACTION, emission — then treats the implied binding as
  // authored code, so its `app.location` read is statically wired like any
  // other and the trusted path needs no special case. An authored `visible`
  // constraint ANDs on top (wrapped in place); an authored literal `false`
  // wins whole (shows adds a gate, never resurrects a hidden view). Inserted
  // text carries NO newline, so the author↔merged line mapping (rb) is
  // untouched; only columns after an insertion on that one line drift.
  {
    const edits: { start: number; end: number; text: string }[] = [];
    const gate = (name: string): string => `app.destinationOf(app.location) == ${JSON.stringify(name)}`;
    const walk = (el: Element): void => {
      const sh = el.attrs.find((a) => a.name === "shows");
      if (sh !== undefined && sh.value.kind === "string") {
        const vis = el.attrs.find((a) => a.name === "visible");
        if (vis === undefined) {
          edits.push({ start: sh.pos.offset, end: sh.pos.offset, text: `visible = { ${gate(sh.value.value)} }, ` });
        } else if (vis.value.kind === "ident" && vis.value.name === "true") {
          edits.push({ start: vis.value.pos.offset, end: vis.value.pos.offset + 4, text: `{ ${gate(sh.value.value)} }` });
        } else if (vis.value.kind === "code") {
          const inner = vis.value.pos.offset + 1;
          edits.push({ start: inner, end: inner, text: ` (${gate(sh.value.value)}) && (` });
          edits.push({ start: inner + vis.value.src.length, end: inner + vis.value.src.length, text: `) ` });
        }
      }
      for (const c of el.children) walk(c);
    };
    walk(program.root); // App tree only — `shows` in a class body is a check error (§0.4)
    if (edits.length > 0) {
      edits.sort((a, b) => b.start - a.start);
      for (const e of edits) merged = merged.slice(0, e.start) + e.text + merged.slice(e.end);
      try {
        program = parseProgram(merged); // later phases index the LOWERED text
      } catch (e) {
        if (e instanceof DeclareError) { const es = rbAll([e]); return { source: null, errors: es, warnings: [], ...diagnose(es, [], "syntax") }; }
        throw e;
      }
    }
  }

  const errors = rbAll(check(program));
  if (errors.length > 0) return { source: null, errors, warnings: [], ...diagnose(errors, [], "structure") };

  // Resolve EVERY body — the main tree's and every included class/stylesheet/
  // style's — so no unresolved bare name reaches the self-contained output.
  const r = new Resolver(merged, program);
  r.canBundleScripts = opts.bundleScripts !== undefined;
  r.checkScripts(program);
  for (const cls of program.classes) r.resolveElement(cls.body, [], null);
  for (const s of program.stylesheets) r.resolveStylesheet(s.body);
  for (const s of program.styles) r.resolveBundle(s.body);
  r.resolveElement(program.root, [], program.root);
  r.warnings.push(...smallFieldWarnings(program, preludeLen));
  const byPos = (a: DeclareError, b: DeclareError) => (a.pos?.offset ?? 0) - (b.pos?.offset ?? 0);
  r.errors.sort(byPos);
  r.warnings.sort(byPos);
  if (r.errors.length > 0) {
    const es = rbAll(r.errors), ws = rbAll(r.warnings);
    return { source: null, errors: es, warnings: ws, ...diagnose(es, ws, "name") };
  }
  // Splice highest-offset first so earlier offsets stay valid. Identifier
  // spans never overlap, so order within a body is immaterial beyond that.
  r.edits.sort((a, b) => b.start - a.start);
  let out = merged;
  for (const e of r.edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);

  // tsc over the resolved `{ }` bodies — a phase of THE compile (on unless the
  // caller EXPLICITLY opts a latency-critical loop out). The checker is a
  // direct import: there is no front-end that can forget to wire it, on any
  // host — only the lib.d.ts SOURCE differs per host (typecheck.ts provideLib;
  // an unregistered provider throws, never silently skips). A type error
  // blocks emission like any other, mapped to its `.declare` line (DECLARE6001).
  let typeOracle: TypeOracle | null = null;
  if (opts.typecheck !== false) {
    const tc = typecheckBodies(out, program);
    typeOracle = tc.oracle;
    const typeErrors = rbAll(tc.errors);
    if (typeErrors.length > 0) {
      const ws = rbAll(r.warnings);
      return { source: null, errors: typeErrors, warnings: ws, ...diagnose(typeErrors, ws, "typecheck") };
    }
  }

  // TS-only syntax is checked (above), then STRIPPED for emission
  // (strip-types.ts): bodies run as JavaScript in the zero-dependency runtime,
  // so `x as T`/`x!`/`<T>x` are removed by byte-preserving splices. Runs on a
  // fresh parse of the resolved text (its offsets are the output's offsets).
  {
    let sp: Program | null = null;
    try { sp = parseProgram(out); } catch { /* the dep-extract parse below reports it */ }
    if (sp !== null) {
      const strips: { start: number; end: number }[] = [];
      const asCode = (v: unknown): { src: string; pos: { offset: number } } | null =>
        v !== null && typeof v === "object" && (v as { kind?: string }).kind === "code" ? (v as { src: string; pos: { offset: number } }) : null;
      const collectStrips = (el: { attrs: readonly { value: unknown }[]; decls: readonly { def: unknown }[]; methods: readonly { body: string; bodyPos: { offset: number } }[]; children: readonly unknown[] }): void => {
        for (const a of el.attrs) {
          const v = asCode(a.value);
          if (v !== null) for (const e of stripEditsFor(v.src, true)) strips.push({ start: v.pos.offset + 1 + e.start, end: v.pos.offset + 1 + e.end });
        }
        for (const d of el.decls) {
          const v = asCode(d.def);
          if (v !== null) for (const e of stripEditsFor(v.src, true)) strips.push({ start: v.pos.offset + 1 + e.start, end: v.pos.offset + 1 + e.end });
        }
        for (const m of el.methods) {
          for (const e of stripEditsFor(m.body, false)) strips.push({ start: m.bodyPos.offset + 1 + e.start, end: m.bodyPos.offset + 1 + e.end });
        }
        for (const c of el.children) collectStrips(c as typeof el);
      };
      collectStrips(sp.root as never);
      for (const cls of sp.classes) collectStrips(cls.body as never);
      // NOTE: `script { … }` bodies are NOT handled here. stripEditsFor removes
      // casts only — type annotations and declarations are a compile error in an
      // ordinary body, so there is nothing else for it to delete. A script block
      // is real TypeScript (`function f(n: number): number`), so it needs a true
      // transpile, which runs as its own pass below once these offsets settle.
      strips.sort((a, b) => b.start - a.start);
      for (const e of strips) out = out.slice(0, e.start) + out.slice(e.end);
    }
  }

  // `script { … }` → JavaScript. Unlike a `{ }` body — where a type annotation
  // is an error and only casts need removing — a script block is ordinary
  // TypeScript, so it is genuinely transpiled. A fresh parse gives spans in the
  // just-stripped text; splicing back-to-front keeps the earlier ones valid.
  {
    let sp: Program | null = null;
    try { sp = parseProgram(out); } catch { /* reported by the dep-extract parse */ }
    const hasImports = (src: string): boolean => {
      try {
        const sf = ts.createSourceFile("s.ts", src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
        return sf.statements.some((st) => ts.isImportDeclaration(st));
      } catch { return false; }
    };
    if (sp !== null && sp.scripts.length > 0 && opts.bundleScripts !== undefined
        && sp.scripts.some((s) => !s.src.includes(BINDINGS_MARK) && hasImports(s.src))) {
      // IMPORTS PRESENT → the program's script module is real: every block, in
      // source order, concatenates into ONE module (cross-block references and
      // hoisted imports are the module's own semantics), the host's bundler
      // resolves and inlines the imports, and the result is re-embedded as a
      // single block — as a STRING LITERAL evaluated with `new Function`, so
      // the artifact stays self-contained source and no brace of the bundled
      // JS ever meets the tokenizer.
      const blocks = [...sp.scripts].sort((a, b) => a.span.start - b.span.start);
      const entry = blocks.map((s) => s.src).join("\n\n");
      const visible = [...new Set(blocks.flatMap((s) => topLevelBindings(s.src)))];
      const bundled = await opts.bundleScripts(entry + `\nmodule.exports = { ${visible.join(", ")} };\n`, opts.originDir ?? ".");
      if ("error" in bundled) {
        const es = rbAll([new DeclareError(`script imports failed to bundle — ${bundled.error}`, posOf(out, blocks[0].span.start))]);
        return { source: null, errors: es, warnings: [], ...diagnose(es, [], "module") };
      }
      const blockSrc = ` const js = ${JSON.stringify(bundled.code)}; const module = { exports: {} }; new Function("module", "exports", js)(module, module.exports); ${BINDINGS_MARK} return module.exports; `;
      for (const s of [...blocks].reverse()) {
        const bodyOpen = s.span.end - s.src.length - 1;   // just past the `{`
        const replacement = s === blocks[0] ? blockSrc : " ";
        out = out.slice(0, bodyOpen) + replacement + out.slice(bodyOpen + s.src.length);
      }
    } else if (sp !== null && sp.scripts.length > 0) {
      for (const s of [...sp.scripts].sort((a, b) => b.span.start - a.span.start)) {
        if (s.src.includes(BINDINGS_MARK)) continue;      // already compiled once
        const bodyOpen = s.span.end - s.src.length - 1;   // just past the `{`
        const js = ts.transpileModule(s.src, {
          compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, isolatedModules: true },
          reportDiagnostics: false,
        }).outputText;
        // The block's own top-level names, harvested from the TS AST while we
        // have it. Emitting them as a trailing `return { … }` is what lets the
        // runtime evaluate the block with `new Function` and receive its
        // bindings — there is no other way to enumerate a function's scope, and
        // doing it here keeps the artifact self-contained (programs are data).
        const names = topLevelBindings(s.src);
        const tail = names.length > 0 ? ` ${BINDINGS_MARK} return { ${names.join(", ")} };` : "";
        out = out.slice(0, bodyOpen) + " " + js.trim() + tail + " " + out.slice(bodyOpen + s.src.length);
      }
    }
  }

  // Final phase (NOT opt-in): static dependency extraction (docs/system-design/constraints.md
  // §5). Re-parse the RESOLVED source — so every reactive read is an explicit
  // `this.…`/`parent.…`/`classroot.…`/`:path` — annotate each `{ }` constraint
  // with its read-paths, and serialize them in walk order. Folding this INTO
  // compile() is the whole point: `deps` becomes part of the ONE result every
  // caller renders, so a client can no longer re-run the extractor (the server's
  // old `depsFor`, declarec's hand-run) or forget it (the browser paths, which
  // silently fell to runtime tracking). An analyzable constraint is wired to its
  // read-paths; an UNANALYZABLE one (a §3 residue) is a BLOCKING error that names
  // the fix (constraints.md §3 + diagnostics.md §4) — never a silent fallback.
  // Legitimate calls into language methods are analyzable via their declared
  // effect signatures (effects.ts), so only genuinely-dynamic targets — indexing
  // by a runtime value, a computed datapath, node-collection aggregation, or an
  // opaque call — reach this error.
  let depProgram: Program;
  try {
    depProgram = parseProgram(out);
  } catch (e) {
    if (e instanceof DeclareError) { const es = rbAll([e]), ws = rbAll(r.warnings); return { source: null, errors: es, warnings: ws, ...diagnose(es, ws, "syntax") }; }
    throw e;
  }
  // Static `:path` checking against declared schemas (B4, language §9) —
  // runs on the resolved parse, where cursor expressions are explicit. The
  // named `schema =` forms resolve first (typed data — idempotent; errors
  // were the main check()'s to report).
  resolveShapes(depProgram);
  {
    const schemaErrors = rbAll(schemaCheck(depProgram));
    if (schemaErrors.length > 0) {
      const ws = rbAll(r.warnings);
      return { source: null, errors: schemaErrors, warnings: ws, ...diagnose(schemaErrors, ws, "structure") };
    }
  }
  const residue = annotateProgram(depProgram, typeOracle).errors;
  if (residue.length > 0) {
    const errs = rbAll(residue
      .sort((a, b) => a.offset - b.offset)
      .map((e) => Diag.residue(e.message, posOf(out, e.offset))));
    const ws = rbAll(r.warnings);
    return { source: null, errors: errs, warnings: ws, ...diagnose(errs, ws, "constraint") };
  }
  // The navigation relation (capabilities.md §6): AUTHORED `link` attributes
  // are the ground truth (attachAuthoredLinks — a literal slot becomes {href}
  // directly); handler inference (extractLinks) remains for the un-migrated
  // corpus, attaching only where no authored link exists.
  attachAuthoredLinks(depProgram);
  extractLinks(depProgram);
  const okWarnings = rbAll([...r.warnings, ...regWarnings]);
  return { source: out, deps: serializeDeps(depProgram), links: serializeLinks(depProgram), linkRegistry, errors: [], warnings: okWarnings, ...diagnose([], okWarnings, "name") };
}

/** Rebase positions from the MERGED source onto the author's own file.
 *
 *  Every phase after the source merge — check, resolution, typecheck, the dep
 *  residue — indexes into one merged text whose prelude is the included library
 *  source. A position straight out of those phases therefore names a line in a
 *  file the author never wrote: a four-line program that instantiates a library
 *  component reported its typo at *line 332*. Parse-phase errors precede the
 *  merge and were always right, which is why this went unnoticed; the fix has to
 *  reach every later phase.
 *
 *  Rebasing is done in LINES, not bytes: the merge splices whole sources, and the
 *  later edits (identifier rewrites, type strips) are intra-line splices, so the
 *  prelude's line count is invariant across `merged`, the resolved text, and the
 *  stripped text — while its byte length is not. The offset is then recomputed
 *  against the author's source, so it is exact in the coordinates the caller
 *  actually holds.
 *
 *  A position landing INSIDE the prelude belongs to an included file — the
 *  author's own (`rooms/pulse.declare`) as often as the library's. It is
 *  rebased onto THAT file's coordinates and the position names the file
 *  (Pos.file → "rooms/pulse.declare:118:23"). Until 2026-08-23 every such
 *  position was labelled "in included library source, line N" with N in the
 *  merged text: five agents editing five included rooms each began every red
 *  run with `wc -l` to learn whose error it was, and four wrote a throwaway
 *  harness to verify one room alone (field report 2026-08-21). */
interface PreludeSegment { file: string; source: string; startLine: number; lines: number }

function countLines(s: string): number {
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s[i] === "\n") n++;
  return n;
}

/** A canonical include id as the author would write it: relative to the
 *  program's directory when it lives under it (the usual `rooms/x.declare`),
 *  else as the host named it (a library file, an absolute path, a URL). */
function displayFile(id: string, originDir: string): string {
  if (originDir !== "") {
    const dir = originDir.endsWith("/") ? originDir : originDir + "/";
    if (id.startsWith(dir)) return id.slice(dir.length);
  }
  // a component-library file (auto-included, so never under the program's
  // directory): name it from its `library/` root, the way the map names it
  const lib = id.lastIndexOf("/library/");
  if (lib >= 0) return id.slice(lib + 1);
  return id;
}

function makeRebaser(mainSource: string, segments: readonly PreludeSegment[]): (e: DeclareError) => DeclareError {
  if (segments.length === 0) return (e) => e;
  const last = segments[segments.length - 1];
  const preludeLines = last.startLine + last.lines - 1;
  const lineStartsOf = (source: string): number[] => {
    const starts = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === "\n") starts.push(i + 1);
    return starts;
  };
  const mainStarts = lineStartsOf(mainSource);
  const segStarts = new Map<PreludeSegment, number[]>();
  return (e) => {
    const p = e.pos;
    if (p === undefined) return e;
    const line = p.line - preludeLines;
    if (line < 1) {
      // inside the prelude: find the segment, rebase onto its own lines
      const seg = segments.find((s) => p.line >= s.startLine && p.line < s.startLine + s.lines) ?? last;
      let starts = segStarts.get(seg);
      if (starts === undefined) { starts = lineStartsOf(seg.source); segStarts.set(seg, starts); }
      const segLine = p.line - seg.startLine + 1;
      const base = starts[segLine - 1] ?? 0;
      return new DeclareError(e.rawMessage,
        { line: segLine, col: p.col, offset: base + Math.max(0, p.col - 1), file: seg.file },
        { code: e.code, hint: e.hint });
    }
    const base = mainStarts[line - 1] ?? 0;
    return new DeclareError(e.rawMessage, { line, col: p.col, offset: base + Math.max(0, p.col - 1) },
      { code: e.code, hint: e.hint });
  };
}

/** Line/col/offset for a byte offset into `source` — positions a dep-residue
 *  error (a rare path, so a linear scan is fine). */
function posOf(source: string, offset: number): Pos {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\n") { line++; lineStart = i + 1; }
  }
  return { line, col: offset - lineStart + 1, offset };
}

class Resolver {
  readonly errors: DeclareError[] = [];
  readonly warnings: DeclareError[] = [];
  readonly edits: Edit[] = [];
  private readonly schemas: Record<string, ComponentSchema>;
  /** Per-class inherited method/named-child members (attributes already ride
   *  the schema chain) and the user-declared name set, both accumulated
   *  through user bases — bases precede subclasses, so one pass suffices. */
  private readonly classExtras = new Map<string, { members: Set<string>; declared: Set<string> }>();
  private readonly surfaces = new Map<Element, Surface>();
  private readonly lineStarts: number[] = [0];
  /** Names the program's `script { … }` blocks declare. A body may call them
   *  like any global — they ARE globals, of the program's own module scope —
   *  so they resolve here rather than being reported unresolved. */
  private readonly scriptNames: Set<string>;
  /** The `let`/`var` subset of scriptNames — readable from a body (a copy),
   *  never writable (see topLevelMutableBindings). */
  private readonly scriptMutable: Set<string>;

  /** Whether this compile can bundle script imports (CompileOptions.bundleScripts). */
  canBundleScripts = false;

  constructor(source: string, program: Program) {
    this.schemas = programSchemas(program.classes, new Set((program.shapes ?? []).map((s) => s.name))).schemas; // check-clean: no errors
    this.scriptNames = new Set(program.scripts.flatMap((b) => topLevelBindings(b.src)));
    this.scriptMutable = new Set(program.scripts.flatMap((b) => topLevelMutableBindings(b.src)));
    for (let i = 0; i < source.length; i++) {
      if (source[i] === "\n") this.lineStarts.push(i + 1);
    }
    for (const cls of program.classes) {
      const base = this.classExtras.get(cls.base);
      const members = new Set(base?.members);
      const declared = new Set(base?.declared);
      for (const d of cls.body.decls) declared.add(d.name);
      for (const m of cls.body.methods) { members.add(m.name); declared.add(m.name); }
      for (const c of cls.body.children) {
        if (c.name !== null) { members.add(c.name); declared.add(c.name); }
      }
      this.classExtras.set(cls.name, { members, declared });
    }
  }

  /** `export`/`import` at the top of a `script { … }` block, refused WHERE IT
   *  IS WRITTEN.
   *
   *  A script block's source is appended to the typecheck scaffold, and in
   *  TypeScript a single top-level `export` turns that whole file from a script
   *  into a MODULE — at which point every ambient declaration the scaffold made
   *  (every component, every one of the program's own members) stops being a
   *  global and resolves to nothing. One `export` therefore produced a spray of
   *  unresolved-name errors naming innocent symbols at unrelated lines, with
   *  nothing at all pointing at the cause. Eighteen of them, into library source,
   *  in the report that prompted this.
   *
   *  It is refused rather than quietly stripped: a script block is not a module
   *  and has no importers. Its top-level names are ALREADY visible to every
   *  body in the program — that is what the block is for — so `export` is not
   *  merely redundant, it describes a mechanism that does not exist here.
   *  Accepting it silently would teach the wrong model of where these names go. */
  checkScripts(program: Program): void {
    for (const b of program.scripts) {
      // the body's start offset in the merged source: the span ends at the
      // closing brace, so backing up over the raw source and that brace lands
      // just past the `{` — the same arithmetic the transpile pass uses.
      const bodyOpen = b.span.end - b.src.length - 1;
      let sf: ts.SourceFile;
      try {
        sf = ts.createSourceFile("script.ts", b.src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
      } catch { continue; }
      for (const st of sf.statements) {
        const pos = (n: ts.Node): Pos => this.posAt(bodyOpen + n.getStart(sf));
        if (ts.isImportEqualsDeclaration(st)) {
          this.errors.push(new DeclareError(
            `a script { } block imports with ES \`import\`, not \`import =\` (the CommonJS-interop form)`,
            pos(st)));
          continue;
        }
        if (ts.isImportDeclaration(st)) {
          // ES import inside a script block IS the JS-module mechanism
          // (composition.md §2: \`include\` moves Declare declarations,
          // \`import\` moves JS bindings) — real wherever the compile host can
          // bundle (Node: the dev server, declarec, verify). The in-browser
          // compiler cannot resolve modules, so it refuses with the reason.
          if (!this.canBundleScripts) {
            this.errors.push(new DeclareError(
              `a script { } import needs a compile host with a bundler — the dev server, declarec, or verify. This compiler (the in-browser one) cannot resolve modules; run against the dev server, or ship a build`,
              pos(st)));
          }
          continue;
        }
        if (ts.isExportDeclaration(st) || ts.isExportAssignment(st)) {
          this.errors.push(new DeclareError(
            `a script { } block cannot export — nothing imports it; drop the export, its top-level names are already visible to every { } in the program`,
            pos(st)));
          continue;
        }
        const mod = ts.canHaveModifiers(st)
          ? ts.getModifiers(st)?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword)
          : undefined;
        if (mod !== undefined) {
          this.errors.push(new DeclareError(
            `'export' has no meaning in a script { } block — drop the keyword; a top-level name here is already visible to every { } in the program`,
            pos(mod)));
        }
      }
    }
  }

  /** A `<->` needs a DATASET to edit. The arrow's right-hand side names a place
   *  in data — a static `:field`, or a `{ }` that yields the field's name at
   *  runtime (the generic-editor form) — and both resolve against the nearest
   *  enclosing `datapath`. With no datapath anywhere above it, there is no place
   *  to write: the binding is inert, and it was inert SILENTLY, clean through
   *  every rung of verify.
   *
   *  That silence is the whole bug. It is also how `text <-> { app.note }` reads
   *  as if it two-way binds an ordinary slot — the `{ }` is evaluated for a field
   *  NAME, so `{ app.note }` binds to a dataset field literally called "start",
   *  finds nothing, and does nothing in either direction. declare.md carries that
   *  exact line as an example, so it is the shape an author is most likely to
   *  write first.
   *
   *  CLASS BODIES ARE EXEMPT. A component written to be dropped into a datapath'd
   *  context (`class Row extends View [ TextInput [ text <-> :name ] ]`) has no
   *  datapath of its own and is entirely correct — its cursor arrives from the use
   *  site, which is not visible here. Only the main tree, where the whole chain up
   *  to `App` is in hand, can say for certain that nothing supplies one. */
  checkTwoWayScope(el: Element, levels: Element[], mainRoot: Element | null): void {
    if (mainRoot === null) return;                       // class body — unknowable, see above
    const twoWay = el.attrs.filter((a) => a.bind === "two");
    if (twoWay.length === 0) return;
    // a datapath anywhere up the chain, including one a State applies to a level
    const supplies = (e: Element): boolean =>
      e.attrs.some((a) => a.name === "datapath") ||
      e.children.some((c) => c.attrs.some((a) => a.name === "datapath"));
    if (levels.some(supplies)) return;
    // The write-back spelling differs by family and the message must name the
    // one that exists on THIS component: an Editor (TextInput) delivers through
    // the `input` EVENT (`onInput(v: string)`), a Control (Checkbox, Slider,
    // RadioGroup) through the `input` METHOD (`input(v: …)`, Contract 1). Naming
    // the wrong one sends the reader to a member that is legal to declare, never
    // called, and silent — which is the failure this whole check exists to end.
    const schema = this.schemas[el.tag] as ComponentSchema | undefined;
    const hasInputEvent = (s: ComponentSchema | undefined): boolean => {
      for (let c = s; c !== undefined && c !== null; c = c.base ?? undefined) {
        if (c.events?.includes("input") === true) return true;
      }
      return false;
    };
    const writeBack = hasInputEvent(schema)
      ? `'onInput(v: string) { app.slot = v }'`
      : `'input(v: …) { app.slot = v }'`;
    for (const a of twoWay) {
      const wrote = a.value.kind === "path" ? `:${a.value.path}` : "{ … }";
      this.errors.push(new DeclareError(
        `'${a.name} <-> ${wrote}' has no data to edit — a two-way binding writes into a dataset through the nearest enclosing 'datapath', and nothing above this declares one, so the binding would do nothing in either direction. Put the editor inside a view with 'datapath = { … }' over a Dataset — or, to drive an ordinary slot, use the value pattern instead: '${a.name} = { app.slot }' one-way plus ${writeBack} to write back`,
        a.pos));
    }
  }

  /** A { } that reads the ambient clock is a stopped clock (open-items L-25):
   *  a warning naming the spelling and the member that carries time. */
  private warnAmbient(src: string, pos: Pos): void {
    const what = ambientRead(src);
    if (what !== null) this.warnings.push(Diag.ambientRead(what, pos));
  }

  /** Walk one body root (a class body, or the main tree — `mainRoot` set
   *  there enables the lexical `App` self-name). `ancestors` is innermost
   *  first and ends at the body root. `scope` names WHICH kind of body this is,
   *  so `classroot` (valid only in a class) can be rejected everywhere else. */
  resolveElement(el: Element, ancestors: Element[], mainRoot: Element | null): void {
    const scope: ScopeKind = mainRoot === null ? "class" : "app";
    const levels = [el, ...ancestors];
    this.checkTwoWayScope(el, levels, mainRoot);
    for (const a of el.attrs) {
      if (a.value.kind === "code") {
        this.resolveBody(a.value.src, a.value.pos, true, [], levels, mainRoot, scope, a.name);
        this.warnAmbient(a.value.src, a.value.pos);
      }
    }
    // A declaration default that is a binding (the styling rung's ruled R6
    // unlock — `labelColor: Color = { theme.buttonText }`) resolves at the
    // same levels an attribute body here does: the runtime evaluates it with
    // `this` = the instance (attributes.ts evalDefault), so `theme` means
    // `this.theme` exactly as it would in a set.
    for (const d of el.decls) {
      if (d.def?.kind === "code") {
        this.resolveBody(d.def.src, d.def.pos, true, [], levels, mainRoot, scope);
        this.warnAmbient(d.def.src, d.def.pos);
      }
    }
    for (const m of el.methods) {
      this.resolveBody(m.body, m.bodyPos, false, m.params.map((p) => p.name), levels, mainRoot, scope);
      // A per-frame Time whose onTick never reads its step is not integrating —
      // it is polling (declare.md §1, "nothing waits"). A warning: the program
      // runs, but the handler's condition names what it was really waiting
      // for. Judged only at `tick = frame`: on a calendar tick, an onTick that
      // ignores dt is the "when the minute turns" event, not a poll.
      if (m.name === "onTick" && m.params.length > 0 && tickIsFrame(el)) {
        const schema = this.schemas[el.tag];
        const isTime = schema !== undefined && (schema.name === "Time" || descendsFrom(schema, "Time"));
        if (isTime && !bodyMentions(m.body, m.params[0].name)) this.warnings.push(Diag.timePolls(m.params[0].name, m.bodyPos));
      }
    }
    for (const child of el.children) this.resolveElement(child, levels, mainRoot);
  }

  /** A stylesheet body (styling rung): each class-keyed entry's `{ }` fields
   *  resolve at ONE level — the keyed class itself (the applier evaluates a
   *  field with `this` = the styled view, the ruled bundle rule), so `theme`
   *  becomes `this.theme` and resolves through that view's prevailing chain.
   *  The theme record is literal-only (checked) — nothing to resolve. */
  resolveStylesheet(body: Element): void {
    for (const child of body.children) {
      if (child.entry !== true) continue;
      for (const a of child.attrs) {
        if (a.value.kind === "code") this.resolveBody(a.value.src, a.value.pos, true, [], [child], null, "stylesheet");
      }
    }
  }

  /** A style bundle's `{ }` fields apply to arbitrary views, so bare names
   *  resolve against the one surface every application is guaranteed to have
   *  — View's (`theme`, the decoration slots, the prevailing quartet all
   *  rewrite to `this.…`); a class-specific member must be written
   *  `this.member` (the conservative reading — recorded in HANDOFF). */
  resolveBundle(body: Element): void {
    for (const a of body.attrs) {
      if (a.value.kind === "code") this.resolveBody(a.value.src, a.value.pos, true, [], [VIEW_LEVEL], null, "bundle");
    }
  }

  private resolveBody(
    src: string,
    brace: Pos,
    expression: boolean,
    params: readonly string[],
    levels: readonly Element[],
    mainRoot: Element | null,
    scope: ScopeKind,
    slot?: string
  ): void {
    const bodyStart = brace.offset + 1; // the body begins just after `{`
    // Datapath islands (R8) resolve HERE, at compile time (data-paths.md §5's
    // emitted plans): each island becomes its explicit runtime form over
    // pre-parsed segments — `:location.city` → `this.$data(["location","city"])`
    // — so the emitted program carries no `:` value mode and the runtime's
    // island scanner is a dev-path affordance only (direct instantiate;
    // production builds stub it out, declarec.mjs). check() ran before
    // resolution, so islands here are clean single paths — trouble spellings
    // and many-paths were refused with their pointed errors. Resolve-twice
    // stays a fixpoint: the emitted form has no islands to find, and `$data`
    // is a member of `this`, never a free identifier.
    for (const p of scanDatapaths(src)) {
      this.edits.push({
        start: bodyStart + p.start,
        end: bodyStart + p.end,
        text: `this.$data(${JSON.stringify(p.plan ?? splitPath(p.path))})`,
      });
    }
    // The TS-facing passes below still see the ORIGINAL body text (edits are
    // collected, not applied), so islands are neutralized with a same-length,
    // identifier-free filler to keep every offset true.
    const idents = freeIdentifiers(fillDatapaths(src), { expression, bound: [...BOUND, ...params] });
    if (idents === null) return; // TS could not parse what new Function did — leave the body alone
    for (const id of idents) {
      if (id.callee && CALLEE_GLOBALS.has(id.name)) continue; // a value constructor, not a member
      if (id.name === "app") {
        // `app` (language §11) — the running App at the top of the tree. Sugar
        // for `this.root` (the `root` getter walks parent links to the top),
        // so it reads as a noun anywhere — `app.hostWidth`, `app.navigate(…)`
        // — and typechecks as `App` via View's `root: App` in the scaffold. A
        // scope noun, never a member, so it is intercepted before the surface
        // search; a param named `app` is forbidden (check.ts) so it cannot be
        // shadowed here.
        this.edits.push({
          start: bodyStart + id.start,
          end: bodyStart + id.end,
          text: id.shorthand ? `${id.name}: this.root` : "this.root",
        });
        continue;
      }
      if (id.name === "classroot") {
        // `classroot` reaches the root of the component (class) the code is
        // written in — meaningful ONLY inside a class body, where it passes
        // through untouched and the runtime binds it (expr.ts). Anywhere else
        // (the App block, a stylesheet or style-bundle body) there is no
        // component to root, so it is an error naming where the code actually is.
        if (scope !== "class") {
          const where = scope === "app" ? "the App" : scope === "stylesheet" ? "a stylesheet" : "a style bundle";
          this.errors.push(Diag.classrootOutsideClass(where, this.posAt(bodyStart + id.start)));
        }
        continue;
      }
      const pos = this.posAt(bodyStart + id.start);
      // A write to a script block's `let` from a body: the body holds a const
      // COPY of the binding (expr.ts scriptPrelude), so the write can only
      // throw — and nothing else in the program could have noticed it anyway.
      // Refused here, where the name is known, with the Declare shape named.
      if (id.assigned && this.scriptMutable.has(id.name)) {
        this.errors.push(Diag.scriptWrite(id.name, pos));
        continue;
      }
      let k = levels.findIndex((lv) => this.surfaceOf(lv).all.has(id.name));
      let selfName = false;
      if (k === -1 && mainRoot !== null && id.name === "App") {
        k = levels.length - 1; // the root level itself — `App.zip` reads the anonymous App class
        selfName = true;
      }
      if (k === -1) {
        if (!isKnownGlobal(id.name) && !this.scriptNames.has(id.name)) {
          const hostHint = hostGlobalHint(id.name);
          // A bare enum token inside { } — `fontWeight = { bold ? semibold : regular }`
          // — is the slot's OWN vocabulary spoken without quotes. The bare form is
          // the literal-slot spelling (`fontWeight = semibold`); inside a body a
          // token is a string. Name the quoted form rather than a flat "unresolved".
          const slotSchema = slot !== undefined && levels.length > 0 ? this.schemas[levels[0].tag] : undefined;
          const slotType = slotSchema !== undefined && slot !== undefined ? attrType(slotSchema, slot) : null;
          if (slotType !== null && slotType.kind === "enum" && slotType.tokens.includes(id.name)) {
            this.errors.push(Diag.enumTokenInExpr(id.name, slot!, pos));
            continue;
          }
          if (Object.hasOwn(CSS_COLORS, id.name)) {
            // A bare CSS color name inside { } — a bare-slot literal, not an
            // identifier here; name the 0x form rather than a flat "unresolved".
            const hex = "0x" + CSS_COLORS[id.name].toString(16).padStart(6, "0");
            this.errors.push(Diag.namedColorInExpr(id.name, hex, pos));
          } else if (hostHint !== null) {
            this.errors.push(Diag.hostGlobal(id.name, hostHint, pos));
          } else {
            this.errors.push(Diag.unresolved(id.name, levels.map(describe).join(" → "), pos));
          }
        }
        continue;
      }
      const path = this.pathTo(k, levels.length, mainRoot !== null);
      const expr = selfName ? path : `${path}.${id.name}`;
      this.edits.push({
        start: bodyStart + id.start,
        end: bodyStart + id.end,
        text: id.shorthand ? `${id.name}: ${expr}` : expr,
      });
      for (let j = k + 1; j < levels.length; j++) {
        if (this.surfaceOf(levels[j]).declared.has(id.name)) {
          // The outer reach the user should WRITE. In the App body the root is
          // `app`, never `classroot` (classroot is a component-only noun); in a
          // class body it stays `classroot`.
          const outer = (mainRoot !== null && j === levels.length - 1)
            ? `app.${id.name}`
            : `${this.pathTo(j, levels.length)}.${id.name}`;
          this.warnings.push(Diag.shadowing(
            `bare '${id.name}' means ${describe(levels[k])}'s here, shadowing ${describe(levels[j])}'s '${id.name}' — write ${outer} to reach the outer one`,
            pos
          ));
          break;
        }
      }
    }
    // Lower every 0xRRGGBBAA (8-hex) literal to a colorWithAlpha(…) call — the
    // `0x` twin of #RRGGBBAA. Both the runtime (expr.ts injects colorWithAlpha)
    // and the typecheck (scaffold declares it, returning Color) see this one
    // resolved form, so a color in a numeric slot fails by Color's nullability.
    for (const c of hexColor8Literals(fillDatapaths(src), expression)) {
      this.edits.push({
        start: bodyStart + c.start,
        end: bodyStart + c.end,
        text: `colorWithAlpha(0x${c.rgb.toString(16).padStart(6, "0")}, 0x${c.a.toString(16).padStart(2, "0")})`,
      });
    }
  }

  /** The explicit path to level `k` of `count` levels: the node itself, a
   *  parent chain, or the body root. In a CLASS body the root is `classroot`
   *  (the component instance). In the App body (`appRoot`) it is `this.root`
   *  (i.e. `app`) — `classroot` never appears in App output, so a bare App-name
   *  rewrite is idempotent and cannot collide with the App-body classroot ban. */
  private pathTo(k: number, count: number, appRoot = false): string {
    if (k === 0) return "this";
    if (k === count - 1) return appRoot ? "this.root" : "classroot";
    return Array<string>(k).fill("parent").join(".");
  }

  /** A level's member surface (cached per element — a class body's elements
   *  are consulted once per body they appear over). */
  private surfaceOf(el: Element): Surface {
    let s = this.surfaces.get(el);
    if (s !== undefined) return s;
    const all = new Set<string>();
    // The tag's schema chain: built-in attributes and every class-declared
    // attribute, user chains included (check-clean ⇒ the tag is known).
    for (let sc: ComponentSchema | null = this.schemas[el.tag]; sc !== null; sc = sc.base) {
      for (const name of Object.keys(sc.attrs)) all.add(name);
    }
    const extras = this.classExtras.get(el.tag);
    for (const name of extras?.members ?? []) all.add(name);
    const declared = new Set(extras?.declared);
    for (const d of el.decls) { all.add(d.name); declared.add(d.name); }
    for (const m of el.methods) { all.add(m.name); declared.add(m.name); }
    for (const c of el.children) {
      if (c.name !== null) { all.add(c.name); declared.add(c.name); }
    }
    s = { all, declared };
    this.surfaces.set(el, s);
    return s;
  }

  private posAt(offset: number): Pos {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - this.lineStarts[lo] + 1, offset };
  }
}

const describe = (el: Element): string => (el.name !== null ? `${el.name}: ${el.tag}` : el.tag);

/** The synthetic single level a bundle body resolves at (resolveBundle):
 *  View's member surface, `this`-pathed. */
const VIEW_LEVEL: Element = {
  tag: "View", name: null, attrs: [], decls: [], methods: [], children: [],
  pos: { line: 0, col: 0, offset: 0 },
};
