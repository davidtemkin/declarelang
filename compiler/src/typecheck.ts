// typecheck — the tsc-over-{ }-bodies phase (APPROACH §5). The scaffold
// (scaffold.ts) turns the component schemas into an ambient TypeScript surface;
// this module appends a CHECK-BLOCK per resolved `{ }` body and runs stock tsc
// over the whole, then maps each TS diagnostic back to a `.declare` LINE through
// the diagnostics mechanism (diagnostics.ts, code DECLARE6001). HOST-AGNOSTIC: it
// imports `typescript` statically (the bundle already carries it for
// free-idents) and reads the `lib.*.d.ts` texts through ONE injected provider
// (provideLib below — Node registers a disk reader, the browser bundle embeds
// the es2022 closure), so the SAME checker runs on the compile front-end, in
// the browser, and in the compile worker — never in the zero-dependency runtime.
//
// The check-block SHAPE (scaffold.ts documents it): a resolved body has had its
// bare names rewritten to `this.slot` / `parent.…` / `classroot.…` (compile.ts),
// so each scope noun is typed as the function's `this` and two params:
//
//     const _cN: <SlotTsType> = (function (this: <Self>, parent: <Parent>, classroot: <Root>, <params: any…>) {
//       return ( <resolved expression body> );
//     }).call(inst, inst, inst, …);
//
//   • `this: <Self>` — the element the body is written on, typed by its
//     INSTANCE type: a synthesized anonymous subclass (`_E<n> extends <tag>`)
//     carrying the element's inline declarations, named children, and methods
//     (language §5 — an element with decls IS a one-off subclass; withDecls is
//     the checker's same currency), else the tag class. So `this.openHeightX`
//     is a TS2339 and `app.cardW` (a root-declared member) resolves.
//   • `: <SlotTsType>` — the slot's declared type: a boolean flowing into a
//     Length slot is a TS2322 across the [ ]/{ } seam (the whole point). A
//     declaration-default binding checks against ITS declared type.
//   • `parent` / `classroot` — the enclosing element and the body root, typed
//     by their instance types (deeper `parent.parent` rides View). A CLASS
//     body's root-level `parent` is `View` (an instance mounts under some
//     view, statically unknowable); the main root's parent is truly `null`.
//     A method (statement) body drops the `return (…)` and slot type and
//     declares its own params (typed `any` — bodies carry no type syntax).
//   • `.call(inst, …)` — RELIES on strictBindCallApply (tsconfig `strict`) to
//     type the return against the slot and check the scope nouns.
//
// LINE MAPPING. Scope resolution only splices identifiers INLINE — it never
// adds or removes a newline — so a resolved body has the same line structure as
// the source. Each check-block reproduces the body's lines verbatim, so a TS
// diagnostic's line within a block maps to (block's original start line + the
// offset within the block). v1 reports at LINE granularity (what APPROACH asks).
//
// v1 SCOPE: bodies that embed a datapath island (`:path`) are skipped — `:path`
// is Declare surface the runtime rewrites (expr.ts), not TypeScript; typechecking
// data reads is a later slice. All other `{ }` bodies (attribute expressions,
// declaration-default bindings, method statements) are checked.

import ts from "typescript";
import { parseProgram, type Element, type Program } from "../../runtime/dist/parser.js";
import { programSchemas } from "../../runtime/dist/check.js";
import { generateScaffold, memberSig, tsType } from "./scaffold.js";
import { attrType, descendsFrom, type ComponentSchema } from "../../runtime/dist/schema.js";
import { declaredType } from "../../runtime/dist/value.js";
import { fillDatapaths } from "../../runtime/dist/datapath.js";
import { Diag } from "../../runtime/dist/diagnostics.js";
import { DeclareError, type Pos } from "../../runtime/dist/errors.js";


/** A raw tsc diagnostic on the case file: its TS code, flattened message, and
 *  1-based line within case.ts. */
interface TsDiag {
  code: number;
  message: string;
  line: number;
}

/** One emitted check-block's line footprint. A TS diagnostic can land on the
 *  WRAPPER line (a TS2322 assignment error reports at `const _cN =`, before the
 *  body) as well as inside the body, so the unit spans the whole block
 *  [blockStart, blockEnd]; the mapping clamps into the body's line range.
 *  `tag`/`slot`/`slotTs` carry the body's home for the message layer — a
 *  diagnostic speaks about "the { } body of 'width' on this View", never about
 *  check-block internals. */
interface Unit {
  blockStart: number; // first case-file line of the whole emitted block
  blockEnd: number; // last case-file line
  bodyStart: number; // case-file line of the body's first line
  origStartLine: number; // source line of the body's first line
  lineCount: number;
  tag: string; // the element the body is written on
  slot: string | null; // the attribute/declaration name; null for a method body
  slotTs: string | null; // the slot's TS type; null for a method body
}

/** Typecheck every resolved `{ }` body in `resolved` (compile()'s output — a
 *  self-contained program whose bare names are already paths). Returns coded
 *  DECLARE6001 diagnostics (empty when clean). Never throws on TS internals: a
 *  body that cannot be framed is skipped, not failed. */
export function typecheckBodies(resolved: string, program: Program): DeclareError[] {
  const { schemas } = programSchemas(program.classes);

  let rprog: Program;
  try {
    rprog = parseProgram(resolved);
  } catch {
    return []; // resolved is our own output — if it will not re-parse, skip typecheck
  }

  const emitter = new CaseEmitter(schemas);
  // Pass 1 — synthesize each element's INSTANCE type (language §5: an element
  // with inline declarations is an anonymous one-off subclass — withDecls is
  // the checker's currency for the same fact). The root's instance type then
  // feeds the scaffold, so `app`/`this.root` carries the root's declared
  // members program-wide.
  for (const cls of rprog.classes) emitter.classHasChildren.set(cls.name, cls.body.children.length > 0);
  for (const cls of rprog.classes) emitter.assignTypes(cls.body, true);
  const rootType = emitter.assignTypes(rprog.root, false);
  const scaffold = generateScaffold(schemas, program.classes, rootType, emitter.classExtras);
  // Pass 2 — the check-blocks, typed by the instance types pass 1 assigned.
  for (const cls of rprog.classes) emitter.walkElement(cls.body, [], true);
  emitter.walkElement(rprog.root, [], false);
  if (emitter.units.length === 0) return [];

  const diags = runTsc(scaffold, emitter.caseSrc);
  const starts = lineStarts(resolved);
  const synthTags = emitter.synthTags;
  const out: DeclareError[] = [];
  for (const d of diags) {
    const u = emitter.unitAt(d.line);
    if (u === null) continue; // a diagnostic outside any body (scaffold-level — shouldn't occur)
    // Clamp into the body's line range: an assignment error on the wrapper line
    // maps to the body's first line; a body-internal error maps line-for-line.
    const rel = Math.min(Math.max(d.line - u.bodyStart, 0), u.lineCount - 1);
    out.push(Diag.typeError(explainTs(d, u, synthTags), posOfLine(u.origStartLine + rel, starts), d.code));
  }
  // Deterministic report: same input → same diagnostics, same order (position,
  // then TS code, then text — the loop-stability guarantee evals depend on).
  out.sort((a, b) => (a.pos?.offset ?? 0) - (b.pos?.offset ?? 0) || a.message.localeCompare(b.message));
  return out;
}

// ── The message layer — a tsc diagnostic, re-said for the language's primary
// reader (diagnostics.md §4: name the fix, one canonical rewrite, quote the
// rule, never leak internals). tsc DETECTS; these templates EXPLAIN — the
// repair literature's measured gap between stock compiler text and
// explanation-grade text as LLM repair input is the whole reason this layer
// exists. tsc's own near-miss suggestions ("Did you mean 'isDark'?") are kept:
// the scaffold now models real instance types, so they are grounded in the
// correct member set. Unmatched codes keep tsc's text (translated of synth
// names) — honest fallback, upgraded family by family as evals surface what
// models actually trip on. ──

function explainTs(d: TsDiag, u: Unit, synthTags: ReadonlyMap<string, string>): string {
  // Internal synthesized type names (`_E7`) → the language's vocabulary: the
  // element's tag, spoken as an instance ("this View").
  const say = (typeName: string): string => {
    const tag = synthTags.get(typeName);
    return tag === undefined ? `${typeName}` : `this ${tag}`;
  };
  const msg = d.message.replace(/_E\d+/g, (n) => say(n));
  const home = u.slot !== null ? `the { } body of '${u.slot}'` : "this method body";

  let m: RegExpMatchArray | null;
  switch (d.code) {
    // The SEAM error — the body's value doesn't fit the slot's declared type.
    case 2322:
      m = msg.match(/Type '(.+?)' is not assignable to type '(.+?)'/s);
      if (m !== null && u.slot !== null) {
        const canon =
          m[1] === "boolean" && u.slotTs === "Length"
            ? ` — a condition belongs in a ternary that yields numbers: { cond ? 40 : 25 }`
            : ` — make the expression yield a ${m[2]}`;
        return `${home} computes ${article(m[1])}, but '${u.slot}' is typed ${m[2]}${canon}`;
      }
      return msg;
    // A missing member — with tsc's suggestion when it has one (grounded in
    // the real instance type since the scaffold models it).
    case 2551:
      m = msg.match(/Property '(.+?)' does not exist on type '(.+?)'\. Did you mean '(.+?)'\?/s);
      if (m !== null) return `'${m[1]}' is not a member of ${quoteType(m[2])} — did you mean '${m[3]}'?`;
      return msg;
    case 2339:
      m = msg.match(/Property '(.+?)' does not exist on type '(.+?)'/s);
      if (m !== null) {
        return `'${m[1]}' is not a member of ${quoteType(m[2])} — declare it (${m[1]}: <type> = …) or fix the name`;
      }
      return msg;
    // A bare name that resolved to nothing (scope resolution already rewrote
    // members, so what is left must be a parameter, a local, or a global).
    case 2304:
      m = msg.match(/Cannot find name '(.+?)'/s);
      if (m !== null) {
        return `nothing in scope is named '${m[1]}' — a bare name in a { } body is a member (written this.${m[1]}, or via parent/classroot/app), a method parameter, or a global`;
      }
      return msg;
    // Arithmetic over a non-number.
    case 2362:
      return `the left operand of this arithmetic is not a number — ${home} must compute with numeric attributes or convert explicitly`;
    case 2363:
      return `the right operand of this arithmetic is not a number — ${home} must compute with numeric attributes or convert explicitly`;
    case 2365:
      m = msg.match(/Operator '(.+?)' cannot be applied to types '(.+?)' and '(.+?)'/s);
      if (m !== null) return `'${m[1]}' cannot compare ${article(m[2])} with ${article(m[3])} — make both sides the same type`;
      return msg;
    // Excess arguments (missing ones never fire — parameters are optional
    // because the grammar has no required-marker, so tsc reports the range
    // form: "Expected 0-2 arguments, but got 3").
    case 2554:
      m = msg.match(/Expected (?:\d+-)?(\d+) arguments?, but got (\d+)/s);
      if (m !== null) {
        const declared = m[1];
        const got = Number(m[2]);
        return `this call passes ${got} arguments but the method declares ${declared} parameter${declared === "1" ? "" : "s"} — drop the extra${got - Number(declared) === 1 ? "" : "s"}`;
      }
      return msg;
    default:
      return msg;
  }
}

/** "boolean" → "a boolean", "unknown"/"any" pass bare — tiny readability. */
function article(type: string): string {
  return /^(a|e|i|o|u)/i.test(type) ? `an ${type}` : `a ${type}`;
}

/** A type name in a message: synth names were already translated to "this
 *  <Tag>" (leave those bare); real class names get quotes. */
function quoteType(t: string): string {
  return t.startsWith("this ") ? t : `${t}`;
}

/** Emits the case.ts (scaffold-relative) check-blocks and records each one's
 *  line footprint. Two passes over each tree: `assignTypes` synthesizes an
 *  ambient INSTANCE type per element that widens its tag class (inline
 *  declarations, named children, element methods — the anonymous one-off
 *  subclass of language §5); `walkElement` then emits the check-blocks with an
 *  innermost-first ancestor stack, so a body's `this`, `parent` (the enclosing
 *  element) and `classroot` (the body root) each get the INSTANCE type, not
 *  just the tag class. */
class CaseEmitter {
  readonly units: Unit[] = [];
  private lines: string[] = [];
  private counter = 0;
  private typeCounter = 0;
  /** Element → the name of its instance type (a synthesized `_E<n>` when the
   *  element widens its tag, else the tag class itself). */
  private instType = new Map<Element, string>();

  constructor(private readonly schemas: Readonly<Record<string, ComponentSchema>>) {}

  get caseSrc(): string {
    return this.lines.join("\n");
  }

  /** Class name → instance members computed from its BODY (named children,
   *  children override) — handed to generateScaffold so they live ON the
   *  class's own `declare class`, where a cross-reference through the class
   *  NAME (`section.area`) sees them too. */
  readonly classExtras = new Map<string, readonly string[]>();

  /** Pass 1 — bottom-up: assign every element its instance type, emitting a
   *  `declare class _E<n> extends <tag> { … }` for each element that adds
   *  members beyond its tag class. Members:
   *    • inline declarations, via the SAME declaredType table the checker uses
   *      (a length decl gets the read/write accessor pair, like schema slots);
   *    • named children, typed by THEIR instance types (a replicated named
   *      child is typed as a single instance — v1, like the extractor);
   *    • element methods, `(p?: any, …): any` — no written types yet, params
   *      optional (the grammar has no required-marker; trailing omission is
   *      legal JS), excess arguments still error;
   *    • a `children` override when the element's static child list is
   *      HOMOGENEOUS (one instance type — e.g. one replicated template), so
   *      `for (const c of this.children) c.dayKey` checks exactly. A MIXED
   *      list falls to `any[]`: the guard idiom (`c.dayKey != null`) is how a
   *      body legally discriminates, and TS cannot narrow member-existence on
   *      a union, so a union type would flag the guard itself. Static child
   *      lists are COMPLETE (trees are declared + replicated, never built
   *      imperatively), which is what makes the homogeneous case exact.
   *  A CLASS-BODY root contributes its members to `classExtras` (its schema
   *  class already carries decls and methods — only named children and the
   *  children override are new facts) and keeps the class's own name as its
   *  instance type. Returns the assigned type name. */
  /** Class name → the instance types of its BODY's children — an instance of
   *  the class starts from these (composition: instance children APPEND to the
   *  class's). Recorded in declaration order; `classHasChildren` covers a
   *  forward reference (tag used before its class is processed). */
  private classChildTypes = new Map<string, ReadonlySet<string>>();
  /** Class name → whether its body declares any children — the pre-scanned
   *  fact that lets a forward-referenced class tag force the safe `any[]`. */
  classHasChildren = new Map<string, boolean>();

  /** Element → its named-member lines (own named children + any hoisted up
   *  from State children) — what a State ancestor hoists again, so nesting
   *  chains. */
  private namedMembers = new Map<Element, readonly string[]>();

  assignTypes(el: Element, classRoot: boolean): string {
    const members: string[] = [];
    const childTypes = new Set<string>();
    const named: string[] = [];
    for (const child of el.children) {
      const childType = this.assignTypes(child, false);
      childTypes.add(childType);
      if (child.name !== null) named.push(`  ${child.name}: ${childType};`);
      // A State's children REPARENT to the state's owner when it applies, so
      // its named children are members of THIS element at runtime — hoist them
      // (they also stay on the State's own type; both paths are addressable).
      const cs = this.schemas[child.tag];
      if (cs !== undefined && descendsFrom(cs, "State")) named.push(...(this.namedMembers.get(child) ?? []));
    }
    members.push(...named);
    this.namedMembers.set(el, named);
    if (classRoot) {
      // A class instance's runtime children = the class body's ++ whatever the
      // instantiation site appends — unknowable at the class, so the class's
      // own `children` is the safe `any[]` whenever iteration is plausible.
      this.classChildTypes.set(el.tag, childTypes);
      if (el.children.length > 0) members.push(`  readonly children: any[];`);
      if (members.length > 0) this.classExtras.set(el.tag, members);
      this.instType.set(el, el.tag);
      return el.tag;
    }
    // An instance's children include its TAG class's body children (if the tag
    // is a user class): union them in. A tag whose class is not yet processed
    // (forward reference) but does declare children falls to mixed → `any[]`.
    const inherited = this.classChildTypes.get(el.tag);
    const unresolved = inherited === undefined && this.classHasChildren.get(el.tag) === true;
    if (inherited !== undefined) for (const t of inherited) childTypes.add(t);
    if (childTypes.size > 0 || unresolved) {
      const exact = !unresolved && childTypes.size === 1;
      members.push(`  readonly children: ${exact ? `${[...childTypes][0]}[]` : "any[]"};`);
    }
    for (const d of el.decls) {
      const t = declaredType(d.type);
      // A color with a concrete (non-null) default is non-null (see memberSig):
      // nullable only where it means inherit/absent (`= null` or no default).
      const nonNullColor = t !== null && t.kind === "color" && d.def !== null && !(d.def.kind === "ident" && d.def.name === "null");
      if (t === null) members.push(`  readonly ${d.name}: any;`); // outside the declarable vocabulary — under-report
      else if (d.readOnly) members.push(`  readonly ${d.name}: ${t.kind === "length" || nonNullColor ? "number" : tsType(t)};`);
      else members.push(...memberSig(d.name, t, nonNullColor));
    }
    for (const m of el.methods) {
      members.push(`  ${m.name}(${m.params.map((p) => `${p}?: any`).join(", ")}): any;`);
    }
    if (members.length === 0) {
      this.instType.set(el, el.tag);
      return el.tag;
    }
    const name = `_E${this.typeCounter++}`;
    this.lines.push(`declare class ${name} extends ${el.tag} {`, ...members, `}`);
    this.instType.set(el, name);
    return name;
  }

  /** Pass 2 — emit a check-block per `{ }` body. `classBody` marks a walk
   *  rooted at a class declaration's body (its root-level `parent` is typed
   *  `View`: an instance mounts under SOME view, statically unknowable — while
   *  the main tree's root is the App, whose parent truly is null). */
  walkElement(el: Element, ancestors: readonly Element[], classBody: boolean): void {
    const levels = [el, ...ancestors];
    for (const a of el.attrs) {
      if (a.value.kind === "code") {
        this.emit(a.value.src, a.value.pos, a.name, tsSlotType(this.schemas, el.tag, a.name), levels, true, [], classBody);
      }
    }
    for (const d of el.decls) {
      if (d.def?.kind === "code") {
        // A declaration-default binding checks against the DECL's own declared
        // type (the tag schema does not carry an inline decl).
        const t = declaredType(d.type);
        this.emit(d.def.src, d.def.pos, d.name, t === null ? "unknown" : tsType(t), levels, true, [], classBody);
      }
    }
    for (const m of el.methods) this.emit(m.body, m.bodyPos, null, null, levels, false, m.params, classBody);
    for (const child of el.children) this.walkElement(child, levels, classBody);
  }

  /** `slot`/`slotTs` are the slot's name and TS type (an expression body
   *  checks against it), null for a method. `params` are a method's parameters
   *  — declared in the check-block header (typed `any`; the grammar carries no
   *  written types), so a handler body's `e.x` resolves instead of failing as
   *  an unknown name. `brace` is the `{` position; the body starts on its
   *  line. */
  private emit(
    src: string,
    brace: Pos,
    slot: string | null,
    slotTs: string | null,
    levels: readonly Element[],
    expression: boolean,
    params: readonly string[],
    classBody: boolean
  ): void {
    // v1: skip a body that embeds a datapath island (neutralizing it is a later
    // slice) — `:path` is not TypeScript.
    if (fillDatapaths(src) !== src) return;

    const ty = (el: Element): string => this.instType.get(el) ?? el.tag;
    const self = ty(levels[0]);
    // The runtime `parent` is the nearest ancestor that IS a view: a non-View
    // wrapper's children reparent to its owner (a State's children mount onto
    // the state's host view when it applies), so the static tree parent is
    // skipped when its tag does not descend from View. No view ancestor at
    // all → a class root (`View` — an instance mounts under SOME view) or the
    // main root (truly `null` — the App has no parent).
    let parent = classBody ? "View" : "null";
    for (let i = 1; i < levels.length; i++) {
      const s = this.schemas[levels[i].tag];
      if (s === undefined || descendsFrom(s, "View")) {
        parent = ty(levels[i]);
        break;
      }
    }
    const root = ty(levels[levels.length - 1]);
    const inst = (t: string) => `(undefined as unknown as ${t})`;
    const paramSig = params.map((p) => `, ${p}: any`).join("");
    const paramArgs = params.map(() => `, undefined as any`).join("");
    const header = `(function (this: ${self}, parent: ${parent}, classroot: ${root}${paramSig}) {`;
    const footer = `}).call(${inst(self)}, ${inst(parent)}, ${inst(root)}${paramArgs});`;

    // Emit the body verbatim across its own lines, so a diagnostic line maps
    // straight back. The body opens on `brace.line` (just after `{`).
    const bodyLines = src.split("\n");
    const id = `_c${this.counter++}`;
    const blockStart = this.lines.length + 1;
    let bodyStart: number;
    if (expression) {
      // `const _cN: T = (function(){ return (` … body lines … `); }).call(…);`
      this.lines.push(`const ${id}: ${slotTs ?? "unknown"} = ${header} return (`);
      bodyStart = this.lines.length + 1;
      this.lines.push(...bodyLines);
      this.lines.push(`); ${footer}`);
    } else {
      this.lines.push(`${header}`);
      bodyStart = this.lines.length + 1;
      this.lines.push(...bodyLines);
      this.lines.push(footer);
    }
    this.units.push({
      blockStart,
      blockEnd: this.lines.length,
      bodyStart,
      origStartLine: brace.line,
      lineCount: bodyLines.length,
      tag: levels[0].tag,
      slot,
      slotTs,
    });
  }

  /** Synthesized type name (`_E<n>`) → the tag it widens — so a diagnostic can
   *  translate internal names back to the language's vocabulary before a user
   *  (or a model) ever sees them. */
  get synthTags(): ReadonlyMap<string, string> {
    const m = new Map<string, string>();
    for (const [el, name] of this.instType) if (name !== el.tag) m.set(name, el.tag);
    return m;
  }

  /** The block whose case-file span contains `line`, or null. */
  unitAt(line: number): Unit | null {
    for (const u of this.units) {
      if (line >= u.blockStart && line <= u.blockEnd) return u;
    }
    return null;
  }
}

/** A slot's TypeScript type, resolved through the schema chain (the value
 *  check's teeth). Unknown slots — a typo — fall to `unknown`; the TS2339 that
 *  names the missing property is the real report. */
function tsSlotType(schemas: Readonly<Record<string, ComponentSchema>>, tag: string, slot: string): string {
  const schema = schemas[tag];
  if (schema === undefined) return "unknown";
  const t = attrType(schema, slot);
  return t === null ? "unknown" : tsType(t);
}

// ── The standard-library provider (the ONE host seam) ────────────────────────
// tsc needs the ES `lib.*.d.ts` declaration files (data, not code — the typed
// surface of the JS standard library). WHERE they come from is the only
// host-specific fact in this module: Node reads them from disk beside the
// `typescript` package (compile-node.ts registers that provider at load);
// the browser bundle EMBEDS the es2022 closure (~52 KB gz) and registers it at
// bundle init (tools/internal/build-compiler.mjs) — which is what makes `typecheck` a
// real flag in the browser and the worker, not a Node-only capability. A
// typecheck attempted with NO provider registered throws loudly (a wiring bug
// must never degrade into silently-unchecked code).
let libProvider: ((name: string) => string | undefined) | null = null;

/** Register where `lib.*.d.ts` texts come from (Node: disk; browser: embedded).
 *  Consulted lazily, only when a typecheck actually runs. */
export function provideLib(provider: (name: string) => string | undefined): void {
  libProvider = provider;
}

/** Run stock tsc over the scaffold + the case file in an in-memory host (libs
 *  via the registered provider), under `strict`. Returns the case file's
 *  diagnostics. */
function runTsc(scaffold: string, caseSrc: string): TsDiag[] {
  const files: Record<string, string> = { "scaffold.ts": scaffold, "case.ts": caseSrc };
  // A lib request may arrive as a bare name or prefixed by the default-lib
  // location ("./lib.es2021.d.ts") — normalize to the basename for the provider.
  const lib = (name: string): string | undefined => {
    if (libProvider === null) throw new Error("typecheck: no lib.d.ts provider registered (provideLib) — the host wiring is broken");
    const base = name.split("/").pop() ?? name;
    return base.startsWith("lib.") && base.endsWith(".d.ts") ? libProvider(base) : undefined;
  };
  const readFile = (name: string): string | undefined => (Object.hasOwn(files, name) ? files[name] : lib(name));
  const options: import("typescript").CompilerOptions = {
    strict: true, // strictBindCallApply — the check-block shape depends on it
    target: ts.ScriptTarget.ES2022,
    lib: ["lib.es2022.d.ts"], // ES only — no DOM globals to collide with Text / Image
    skipLibCheck: true,
    noEmit: true,
    types: [],
  };
  const host: import("typescript").CompilerHost = {
    getSourceFile: (name, target) => {
      const text = readFile(name);
      return text === undefined ? undefined : ts.createSourceFile(name, text, target, true);
    },
    getDefaultLibFileName: (o) => ts.getDefaultLibFileName(o),
    getDefaultLibLocation: () => "",
    writeFile: () => {},
    getCurrentDirectory: () => "/",
    getDirectories: () => [],
    fileExists: (name) => Object.hasOwn(files, name) || lib(name) !== undefined,
    readFile,
    getCanonicalFileName: (n) => n,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    directoryExists: () => true,
    realpath: (n) => n,
  };
  const program = ts.createProgram(["scaffold.ts", "case.ts"], options, host);
  const sf = program.getSourceFile("case.ts");
  if (sf === undefined) return [];
  return [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]
    .filter((d) => !UNSATISFIABLE.has(d.code))
    .map((d) => ({
      code: d.code,
      message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
      line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0,
    }));
}

/** TS's implicit-`any` family: each of these demands a WRITTEN type annotation
 *  — and a `{ }` body has no type syntax (language rule: bodies are plain ES),
 *  so on correct code the demand is unsatisfiable and the diagnostic a
 *  guaranteed false positive (`const c = (x, y) => …` in a method body). They
 *  are SUPPRESSED at the report, not via `noImplicitAny: false` — the flag
 *  also changes INFERENCE (`const a = []` becomes `never[]` instead of an
 *  evolving array, spraying downstream ghosts on every later push), and the
 *  inference must stay stock. Filtering the report keeps checking and
 *  inference intact and drops only the unactionable demands. */
const UNSATISFIABLE: ReadonlySet<number> = new Set([
  7005, 7006, 7008, 7009, 7010, 7011, 7015, 7017, 7018, 7019, 7022, 7023, 7024, 7031, 7033, 7034, 7051, 7053,
]);

// ── line arithmetic on the original source ───────────────────────────────────

function lineStarts(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return starts;
}

function posOfLine(line: number, starts: readonly number[]): Pos {
  const offset = starts[Math.min(line - 1, starts.length - 1)] ?? 0;
  return { line, col: 1, offset };
}
