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
//     declares its own params (typed `any` — a param LIST carries no
//     annotations by language rule; body-interior type syntax is fine, the
//     checker consumes it and strip-types.ts removes it before emission).
//   • `.call(inst, …)` — RELIES on strictBindCallApply (tsconfig `strict`) to
//     type the return against the slot and check the scope nouns.
//
// LINE MAPPING. Scope resolution only splices identifiers INLINE — it never
// adds or removes a newline — so a resolved body has the same line structure as
// the source. Each check-block reproduces the body's lines verbatim, so a TS
// diagnostic's line within a block maps to (block's original start line + the
// offset within the block). v1 reports at LINE granularity (what APPROACH asks).
//
// SCOPE: every `{ }` body (attribute expressions, declaration-default
// bindings, method statements) is checked. Datapath islands (`:path`) are no
// longer a skip class: compile-time resolution (compile.ts resolveBody,
// data-paths.md §5) lowers each to `this.$data([…])` BEFORE this phase runs,
// so a datapath body reaches tsc as plain TypeScript (`$data` is typed in the
// scaffold, returning `any` — the same deliberate under-report as
// Dataset.value until the `schema` construct lands). The island guard below
// remains for a source that somehow still carries one — skipped, never
// misparsed.

import ts from "typescript";
import { parseProgram, type Element, type Param, type Program, type SchemaDecl } from "../../runtime/dist/parser.js";
import { resolveShapes } from "../../runtime/dist/shape-resolve.js";
import { programSchemas } from "../../runtime/dist/check.js";
import { resolveWrittenType } from "../../runtime/dist/program-schema.js";
import { generateScaffold, memberSig, tsType, signatureTsType, shapeObjectText } from "./scaffold.js";
import { attrType, descendsFrom, type ComponentSchema } from "../../runtime/dist/schema.js";
import { declaredType, type AttrType } from "../../runtime/dist/value.js";
import { fillDatapaths } from "../../runtime/dist/datapath.js";

/** TS primitives a Declare type name can resolve to — where "declare it" is
 *  not a fix (there is no slot to add to a `number`). */
const PRIMITIVE_TYPES = new Set(["number", "string", "boolean", "any[]", "Length", "Color"]);
import { Diag } from "../../runtime/dist/diagnostics.js";
import { DeclareError, type Pos } from "../../runtime/dist/errors.js";


/** A raw tsc diagnostic on the case file: its TS code, flattened message, and
 *  1-based line within case.ts. */
interface TsDiag {
  code: number;
  message: string;
  line: number;
  character: number; // 0-based column within `line` of the case file
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
  origStartCol: number; // source column of the `{` that opens the body (the first body line follows it)
  lineCount: number;
  tag: string; // the element the body is written on
  slot: string | null; // the attribute/declaration name; null for a method body
  slotTs: string | null; // the slot's TS type; null for a method body
}

/** Typecheck every resolved `{ }` body in `resolved` (compile()'s output — a
 *  self-contained program whose bare names are already paths). Returns coded
 *  DECLARE6001 diagnostics (empty when clean). Never throws on TS internals: a
 *  body that cannot be framed is skipped, not failed. */
export function typecheckBodies(resolved: string, program: Program): { errors: DeclareError[]; oracle: TypeOracle | null } {
  const { schemas } = programSchemas(program.classes, new Set((program.shapes ?? []).map((s) => s.name)));

  let rprog: Program;
  try {
    rprog = parseProgram(resolved);
  } catch {
    return { errors: [], oracle: null }; // resolved is our own output — if it will not re-parse, skip typecheck
  }
  // Resolve the re-parsed program's schemas (typed data): the named
  // `schema =` forms become resolved shape literals, which is what the
  // Dataset `.value` narrowing below projects from. Errors were already
  // reported by check(); this run is for the projection.
  resolveShapes(rprog);

  const emitter = new CaseEmitter(schemas, rprog.shapes ?? []);
  // Pass 1 — synthesize each element's INSTANCE type (language §5: an element
  // with inline declarations is an anonymous one-off subclass — withDecls is
  // the checker's currency for the same fact). The root's instance type then
  // feeds the scaffold, so `app`/`this.root` carries the root's declared
  // members program-wide.
  for (const cls of rprog.classes) emitter.classHasChildren.set(cls.name, cls.body.children.length > 0);
  for (const cls of rprog.classes) emitter.assignTypes(cls.body, true);
  const rootType = emitter.assignTypes(rprog.root, false);
  let scaffold = generateScaffold(schemas, program.classes, rootType, emitter.classExtras, emitter.signatureTypeNames, rprog.shapes ?? []);
  // A program's `script { … }` blocks are ambient TypeScript for every body:
  // their declarations are real signatures, so appending the source to the
  // scaffold is what makes `dbl(app.v)` typecheck against the actual function
  // rather than resolving to `any` — and what makes a wrong argument an error
  // at the call site, in the body, where the author can act on it. An `import`
  // cannot ride along (one module statement flips the whole scaffold from a
  // script into a module and every ambient name dies) — each import is
  // replaced by `declare const <name>: any` per binding: the imported surface
  // types as `any` here, and the bundler makes it real.
  for (const b of program.scripts) scaffold += "\n" + ambientScript(b.src) + "\n";
  // Pass 2 — the check-blocks, typed by the instance types pass 1 assigned.
  for (const cls of rprog.classes) emitter.walkElement(cls.body, [], true);
  emitter.walkElement(rprog.root, [], false);
  if (emitter.units.length === 0) return { errors: [], oracle: null };

  const { diags, program: tsProgram } = runTsc(scaffold, emitter.caseSrc);
  const starts = lineStarts(resolved);
  const synthTags = emitter.synthTags;
  const out: DeclareError[] = [];
  for (const d of diags) {
    const u = emitter.unitAt(d.line);
    if (u === null) {
      // Not inside a body — but it may be on a synthesized instance MEMBER, and
      // an instance is a singleton subclass, so its overrides are checked like
      // any subclass's. Report those at the member the author wrote.
      const mp = emitter.memberPos.get(d.line);
      if (mp !== undefined) out.push(Diag.typeError(explainMember(d, mp), mp.pos, d.code));
      continue;
    }
    // Clamp into the body's line range: an assignment error on the wrapper line
    // maps to the body's first line; a body-internal error maps line-for-line.
    // The COLUMN maps too, because the body is emitted verbatim: on a later
    // body line tsc's character IS the source column; on the first line the
    // body text follows the `{`, so it is offset by the brace's column. An
    // error on the wrapper itself (rel clamped) lands at the brace. Before
    // 2026-08-23 every typecheck position said col 1 — five files and a line
    // number into the wrong one was the whole of "is this mine?".
    const inBody = d.line >= u.bodyStart && d.line < u.bodyStart + u.lineCount;
    const rel = Math.min(Math.max(d.line - u.bodyStart, 0), u.lineCount - 1);
    const col = !inBody ? u.origStartCol : rel === 0 ? u.origStartCol + 1 + d.character : d.character + 1;
    out.push(Diag.typeError(explainTs(d, u, synthTags), posAt(u.origStartLine + rel, col, starts), d.code));
  }
  // Deterministic report: same input → same diagnostics, same order (position,
  // then TS code, then text — the loop-stability guarantee evals depend on).
  out.sort((a, b) => (a.pos?.offset ?? 0) - (b.pos?.offset ?? 0) || a.message.localeCompare(b.message));
  return { errors: out, oracle: buildOracle(tsProgram, emitter) };
}

/** The L-21 TYPE ORACLE (RULED 2026-09-01: method calls resolve with TS
 *  semantics, no deviation). Dependency extraction asks, for a { } body it is
 *  walking and a method name called there, what the CHECKER says the
 *  receivers' static types are — answered from the very ts.Program the
 *  typecheck just ran, so the answer is exactly TypeScript's. The extractor
 *  then follows only that family's bodies; a receiver TS types as `any` sends
 *  the constraint to the runtime tracking path instead of any name-keyed union. */
export interface TypeOracle {
  /** The static targets of every `<recv>.<method>(…)` call inside the body
   *  whose opening `{` sits at (line, col) in the resolved source. `classes`
   *  are class/tag names, resolved by the extractor through its class chain
   *  (plus the override closure); `braces` are INSTANCE methods, identified by
   *  their own body's `{` position. "any" = some receiver is untypeable, or
   *  the call could not be located; null = the body is unknown to the check.
   *  The caller treats both as: go dynamic. */
  methodTargets(line: number, col: number, method: string):
    { classes: string[]; braces: { line: number; col: number }[] } | "any" | null;
}

function buildOracle(tsProgram: import("typescript").Program, emitter: CaseEmitter): TypeOracle | null {
  const sf = tsProgram.getSourceFile("case.ts");
  if (sf === undefined) return null;
  const checker = tsProgram.getTypeChecker();
  const byKey = new Map<string, Unit>();
  for (const u of emitter.units) byKey.set(u.origStartLine + ":" + u.origStartCol, u);
  const instEls = emitter.instElements;
  const text = sf.text;
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  const lineStart = (line1: number): number => starts[Math.min(line1 - 1, starts.length - 1)] ?? 0;
  return {
    methodTargets(line, col, method) {
      const u = byKey.get(line + ":" + col);
      if (u === undefined) return null;
      // the block's character span in case.ts — the search never leaves it
      const from = lineStart(u.blockStart);
      const to = u.blockEnd < starts.length ? lineStart(u.blockEnd + 1) : text.length;
      const classes = new Set<string>();
      const braces: { line: number; col: number }[] = [];
      let any = false;
      let found = false;
      const consider = (t: import("typescript").Type): void => {
        if (t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) return;   // strict-null unions strip
        if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) { any = true; return; }
        if (t.isUnion()) { for (const p of t.types) consider(p); return; }
        const name = t.getSymbol()?.getName();
        if (name === undefined || name === "" || name.startsWith("__")) { any = true; return; }
        const el = instEls.get(name);
        if (el !== undefined) {
          // a synthesized one-off subclass: its OWN method wins, else its tag's chain
          const m = el.methods.find((mm) => mm.name === method);
          if (m !== undefined) braces.push({ line: m.bodyPos.line, col: m.bodyPos.col });
          else classes.add(el.tag);
        } else {
          classes.add(name);
        }
      };
      const visit = (n: import("typescript").Node): void => {
        if (n.getEnd() < from || n.getStart(sf) >= to) return;
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === method) {
          found = true;
          consider(checker.getTypeAtLocation(n.expression.expression));
        }
        n.forEachChild(visit);
      };
      visit(sf);
      if (!found || any) return "any";
      return { classes: [...classes], braces };
    },
  };
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

/** A diagnostic on a synthesized instance MEMBER. An instance that adds members
 *  is a singleton subclass of the tag it instantiates — free to ADD anything,
 *  but bound by the ordinary rule when it OVERRIDES: the signature must stay
 *  compatible with the one it is replacing, or every caller holding the class
 *  type is wrong. (This is what TypeScript reports as TS2416; the language says
 *  it in its own terms.) */
function explainMember(d: TsDiag, mp: { name: string; tag: string }): string {
  if (d.code === 2416) {
    return `'${mp.name}' overrides ${mp.tag}'s '${mp.name}' with an incompatible signature — an instance may ADD members freely, but one it replaces must keep the original's parameters and return, or a caller holding a ${mp.tag} would be wrong`;
  }
  return d.message;
}

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
            // The font slot's accepted forms, stated where the mistake is made
            // (borrowed from coerceFont's own failure text — the type alone
            // says "string" without saying WHICH string).
            : u.slot === "fontFamily" || u.slot === "codeFamily"
              ? ` — a declared font (by name), or a raw family string like "Helvetica, sans-serif"`
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
        // A `:path` LOWERS to `this.$data(…)`, so a path written on a non-view
        // node surfaces here as a missing `$data` member — and the generic advice
        // ("declare it: $data: <type> = …") is nonsense the author cannot act on.
        // Two independent agents followed it. The real fact is that a cursor
        // belongs to a VIEW; a State, Spring or Animator is a non-visual member
        // with no datapath of its own, so the path has to be read on the view and
        // pointed at from here.
        if (m[1] === "$data" || m[1] === "$setData") {
          const t = quoteType(m[2]);
          return `a ':path' reads the enclosing VIEW's datapath, and ${t} is not a view — it has no cursor. ` +
            `Declare an attribute on the enclosing view that reads the path ('n: number = { :field }'), and read that attribute here.`;
        }
        // "declare it" is only advice on a COMPONENT, where a declaration is
        // the fix. On a primitive (a typed parameter's `number`, a `string`)
        // there is nothing to declare — the name is simply wrong, or the
        // parameter's written type is.
        return PRIMITIVE_TYPES.has(m[2])
          ? `'${m[1]}' is not a member of ${m[2]} — fix the name, or widen the type it was read through`
          : `'${m[1]}' is not a member of ${quoteType(m[2])} — declare it (${m[1]}: <type> = …) or fix the name`;
      }
      return msg;
    // `await` in a body. A handler is synchronous by design: a value the screen
    // derives from is a DataSource (arrival is a write burst the tree settles
    // on), and a one-off sequence chains .then(). Said in Declare's words,
    // not TypeScript's ("only allowed within async functions" names a fix the
    // language does not have — there is no `async` handler).
    // Assigning a read-only intrinsic. For `.value` the answer is the verb the
    // guide teaches — `set([], v)` replaces the whole document — because the
    // raw TS text sends an author to a dead end (field report 2026-08-21:
    // guide says set([], v), runtime said "assign .value", TS refused that).
    case 2540:
      m = msg.match(/Cannot assign to '(.+?)'/s);
      if (m?.[1] === "value") return `'value' is read-only — data changes through the verbs: set(path, v) writes one place, set([], v) replaces the whole document, insert/removeAt/move reshape arrays; a source's value changes by arrival (fetch/reload)`;
      if (m !== null) return `'${m[1]}' is read-only — a fact the component maintains; write the thing it derives from, not the fact`;
      return msg;
    case 1308:
      return `a { } body is synchronous — there is no 'await' (and no async handler). For a value the screen derives from, declare a DataSource and read .value/.loaded; for a one-off sequence (a POST, then a write), chain .then(): fetch(url, init).then((r) => r.json()).then((j) => { app.x = j })`;
    // A host global the resolver let through (it admits only the prelude and
    // the ES built-ins, so this is rare) — never TypeScript's advice to add
    // lib.dom or @types/node, which names a fix the language does not take.
    case 2584:
    case 2591:
      m = msg.match(/Cannot find name '(.+?)'/s);
      if (m !== null) return `'${m[1]}' is the host's, not Declare's — a program runs on three renderers and names none of their globals; see Vocabulary → Types and functions for what a body may name`;
      return msg;
    // A bare name that resolved to nothing (scope resolution already rewrote
    // members, so what is left must be a parameter, a local, or a global).
    case 2304:
      m = msg.match(/Cannot find name '(.+?)'/s);
      if (m !== null) {
        // Name what "a global" means, because the old wording listed it as an
        // option and an author whose `fetch` had just been refused read that as
        // "fetch is a global, so why not?" — and reached for (globalThis as any).
        return `nothing in scope is named '${m[1]}' — a bare name in a { } body is a member (written this.${m[1]}, or via parent/classroot/app), a method parameter, or one of the globals a body may use (fetch, URL, setTimeout, console, Math, JSON, …); '${m[1]}' is none of these`;
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
    // Argument-count mismatch, in BOTH directions. Excess always fired; a
    // MISSING argument fires only for a parameter with a written type, which
    // is what makes the signature a contract (an untyped parameter stays
    // optional — the grammar has no required-marker, so tsc reports the range
    // form "Expected 0-2 arguments, but got 3" and only the upper bound binds).
    case 2554:
      m = msg.match(/Expected (?:(\d+)-)?(\d+) arguments?, but got (\d+)/s);
      if (m !== null) {
        const low = m[1] === undefined ? Number(m[2]) : Number(m[1]);
        const high = Number(m[2]);
        const got = Number(m[3]);
        const plural = (n: number): string => (n === 1 ? "" : "s");
        if (got > high) {
          return `this call passes ${got} arguments but the method declares ${high} parameter${plural(high)} — drop the extra${plural(got - high)}`;
        }
        return `this call passes ${got} argument${plural(got)} but ${low} ${low === 1 ? "is" : "are"} required — a parameter with a written type must be given a value`;
      }
      return msg;
    // A possibly-absent value read without a check. Names BOTH repairs, since
    // which is right depends on who knows: the body can check, or the signature
    // can drop the `?` and make the CALLER guarantee it.
    case 18047:
    case 18048:
      m = msg.match(/'(.+?)' is possibly '(null|undefined)'/s);
      if (m !== null) {
        return `'${m[1]}' may be absent here — check it ('if (${m[1]} != null) …'), or drop the '?' from its type so the caller must supply one`;
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

  constructor(
    private readonly schemas: Readonly<Record<string, ComponentSchema>>,
    /** The program's schema declarations (typed data) — record-slot decl
     *  resolution and the Dataset `.value` narrowing ask these. */
    shapes: readonly SchemaDecl[] = []
  ) {
    this.shapeNames = new Set(shapes.map((d) => d.name));
  }
  private readonly shapeNames: ReadonlySet<string>;

  get caseSrc(): string {
    return this.lines.join("\n");
  }

  /** Class name → instance members computed from its BODY (named children,
   *  children override) — handed to generateScaffold so they live ON the
   *  class's own `declare class`, where a cross-reference through the class
   *  NAME (`section.area`) sees them too. */
  readonly classExtras = new Map<string, readonly string[]>();
  /** Every written signature type name seen anywhere in the tree. An enum or
   *  record named ONLY by a signature still needs its alias emitted into the
   *  scaffold, or the ambient text references an undeclared type. */
  readonly signatureTypeNames: string[] = [];
  /** Case-file line → the author position of the synthesized class MEMBER on
   *  it. A customized instance is emitted as `declare class _E7 extends B`: a
   *  singleton subclass, so ordinary subclass rules apply and an incompatible
   *  override is a real error (TS2416). Those land OUTSIDE any body unit, and
   *  were being dropped — this is what gives them a position to be reported at. */
  readonly memberPos = new Map<number, { pos: Pos; name: string; tag: string }>();

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
      // A declared attribute may be typed by a COMPONENT CLASS (`w: Menu = null`),
      // not only by the value vocabulary — same fallback program-schema's
      // checkDecl makes, or this path would silently under-report the slot as
      // `any` and a typo through it would compile.
      const isC = (n: string): boolean => this.schemas[n] !== undefined || this.classHasChildren.has(n);
      const isShape = (n: string): boolean => this.shapeNames.has(n);
      const arrayOf = (n: string): AttrType | null =>
        n.endsWith("[]") && (declaredType(n.slice(0, -2)) !== null || isC(n.slice(0, -2)) || isShape(n.slice(0, -2)) || arrayOf(n.slice(0, -2)) !== null)
          ? ({ kind: "array", of: n.slice(0, -2) } as AttrType) : null;
      // THE SAME resolver checkDecl uses — see resolveWrittenType's note. These
      // were separate copies until a literal union taught to one and not the
      // other made every assignment report "read-only" (2026-09-04).
      const t = resolveWrittenType(d.type, isC, isShape);
      // A color with a concrete (non-null) default is non-null (see memberSig):
      // nullable only where it means inherit/absent (`= null` or no default).
      const nonNullColor = t !== null && t.kind === "color" && d.def !== null && !(d.def.kind === "ident" && d.def.name === "null");
      if (t === null) members.push(`  readonly ${d.name}: any;`); // outside the declarable vocabulary — under-report
      else if (d.readOnly) members.push(`  readonly ${d.name}: ${t.kind === "length" || nonNullColor ? "number" : tsType(t)};`);
      else members.push(...memberSig(d.name, t, nonNullColor));
    }
    for (const m of el.methods) {
      // Same rule as scaffold's methodSig, for an INLINE element's synthesized
      // type: a written type is emitted and REQUIRED, a bare parameter stays
      // optional `any`. Both sites must agree or a method checks differently
      // depending on whether it sits in a `class` or in the tree.
      const ps = m.params.map((prm, i) => {
        const t = prm.type === undefined ? null : signatureTsType(prm.type, (n) => this.schemas[n] !== undefined || this.shapeNames.has(n), prm.nullable === true);
        // See scaffold's methodSig: a parameter is optional only while nothing
        // REQUIRED follows it (TypeScript's TS1016).
        const req = (q: Param): boolean => q.type !== undefined && q.nullable !== true;
        const omittable = !req(prm) && !m.params.slice(i + 1).some(req);
        if (t === null) return `${prm.name}${omittable ? "?" : ""}: any`;
        return `${prm.name}${omittable ? "?" : ""}: ${t}`;
      }).join(", ");
      const ret = m.returns === undefined ? "any" : (signatureTsType(m.returns, (n) => this.schemas[n] !== undefined || this.shapeNames.has(n), m.returnsNullable === true) ?? "any");
      members.push(`  ${m.name}(${ps}): ${ret};`);
      for (const prm of m.params) if (prm.type !== undefined) this.signatureTypeNames.push(prm.type);
      if (m.returns !== undefined) this.signatureTypeNames.push(m.returns);
    }
    // TYPED DATASET VALUE (typed data, 2026-09-01): a Dataset/DataSource
    // element with a resolved `schema =` narrows its `.value` to the document
    // type — `app.nest.value.tasks` is `Task[]` to every body and method, so
    // the `as Task[]` coercion tax is retired at its source. A named form
    // projects the NAME; the inline literal projects structurally.
    const doc = this.docTypeOf(el);
    if (doc !== null) members.push(`  value: ${doc} | null;`);
    if (members.length === 0) {
      this.instType.set(el, el.tag);
      return el.tag;
    }
    const name = `_E${this.typeCounter++}`;
    this.lines.push(`declare class ${name} extends ${el.tag} {`);
    for (const line of members) {
      this.lines.push(line);
      const m = /^ {2}([a-zA-Z_$][\w$]*)[(<]/.exec(line);
      const src = m === null ? undefined : el.methods.find((x) => x.name === m[1]);
      if (src !== undefined) this.memberPos.set(this.lines.length, { pos: src.pos, name: src.name, tag: el.tag });
    }
    this.lines.push(`}`);
    this.instType.set(el, name);
    return name;
  }

  /** The DOCUMENT type text a Dataset element's resolved `schema =` declares
   *  (`{ cols: Col[] }`, `TaskDoc`, `Task[]`), or null. Feeds two walls: the
   *  `.value` narrowing (readers) and the `contents` slot annotation below
   *  (the producer) — one declaration, both ends of a derived dataset. */
  private docTypeOf(el: Element): string | null {
    const dsSchema = this.schemas[el.tag];
    if (dsSchema === undefined || (el.tag !== "Dataset" && !descendsFrom(dsSchema, "Dataset"))) return null;
    const sa = el.attrs.find((a) => a.name === "schema" && a.value.kind === "schema");
    if (sa === undefined || sa.value.kind !== "schema") return null;
    const v = sa.value;
    return v.refName !== undefined
      ? (v.arrayRoot === true ? `${v.refName}[]` : v.refName)
      : (v.arrayRoot === true ? `${shapeObjectText(v.shape)}[]` : shapeObjectText(v.shape));
  }

  /** Pass 2 — emit a check-block per `{ }` body. `classBody` marks a walk
   *  rooted at a class declaration's body (its root-level `parent` is typed
   *  `View`: an instance mounts under SOME view, statically unknowable — while
   *  the main tree's root is the App, whose parent truly is null). */
  walkElement(el: Element, ancestors: readonly Element[], classBody: boolean): void {
    const levels = [el, ...ancestors];
    for (const a of el.attrs) {
      if (a.value.kind === "code") {
        // THE PRODUCER'S WALL (typed data, 2026-09-02): on a schema'd derived
        // dataset, `contents` is checked against the DOCUMENT type — the
        // compiler guards data the program constructs, the runtime guards
        // data it doesn't. (An `any`-returning helper silences this, as any
        // `any` does; a typed signature — `buildCols() -> Board` — closes
        // the chain end to end.)
        const slotType = a.name === "contents" ? (this.docTypeOf(el) ?? tsSlotType(this.schemas, el.tag, a.name)) : tsSlotType(this.schemas, el.tag, a.name);
        this.emit(a.value.src, a.value.pos, a.name, a.name === "contents" && this.docTypeOf(el) !== null ? `${slotType} | null` : slotType, levels, true, [], classBody);
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
    params: readonly Param[],
    classBody: boolean
  ): void {
    // A body that still embeds a datapath island is not TypeScript — compile()
    // lowers islands before this phase, so this only guards a caller handing
    // in un-resolved source; skipped, never misparsed.
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
    // A parameter's WRITTEN type is what makes the body check: `f(v: number)`
    // gives `v.toUpperCase()` a TS2339 here. A bare parameter stays `any` —
    // the under-report constraints.md §2 names, and the reason a bare
    // parameter also blinds dep-extraction to every read through it.
    const paramTs = (p: Param): string =>
      (p.type === undefined ? null : signatureTsType(p.type, (n) => this.schemas[n] !== undefined || this.shapeNames.has(n), p.nullable === true)) ?? "any";
    const paramSig = params.map((p) => `, ${p.name}: ${paramTs(p)}`).join("");
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
      origStartCol: brace.col,
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

  /** Synthesized instance-type name → its ELEMENT — the L-21 oracle's bridge:
   *  an `_E<n>`-typed receiver resolves to that element's own method (by its
   *  body's brace position), else falls to its tag's class chain. */
  get instElements(): ReadonlyMap<string, Element> {
    const m = new Map<string, Element>();
    for (const [el, name] of this.instType) if (name !== el.tag) m.set(name, el);
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
  if (t === null) return "unknown";
  // The check-block annotates the slot with its WRITE type, and a cursor
  // slot's write side accepts a place-bearing VALUE (`datapath = { d.value }`
  // — toCursor's contract; scaffold memberSig carries the same asymmetry).
  if (t.kind === "cursor") return "Cursor | object | null";
  return tsType(t);
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
function runTsc(scaffold: string, caseSrc: string): { diags: TsDiag[]; program: import("typescript").Program } {
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
  if (sf === undefined) return { diags: [], program };
  const diags = [...program.getSyntacticDiagnostics(sf), ...program.getSemanticDiagnostics(sf)]
    .filter((d) => !UNSATISFIABLE.has(d.code))
    .map((d) => {
      const lc = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : null;
      return {
        code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
        line: lc ? lc.line + 1 : 0,
        character: lc ? lc.character : 0,                 // 0-based, within that case-file line
      };
    });
  return { diags, program };
}

/** TS's implicit-`any` family: each of these demands a WRITTEN type annotation
 *  on a BINDING — and while a `{ }` body may carry expression-level type syntax
 *  (`as`/`satisfies`, checked then stripped), the language keeps parameter
 *  lists and declarations annotation-free, so on correct code the demand is
 *  unsatisfiable and the diagnostic a guaranteed false positive
 *  (`const c = (x, y) => …` in a method body). They
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

/** A script block's source made scaffold-safe: every `import` declaration is
 *  replaced (same length is NOT needed — the ambient copy carries no positions)
 *  by `declare const <name>: any;` per value binding it introduces. */
function ambientScript(src: string): string {
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile("s.ts", src, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  } catch { return src; }
  const edits: { start: number; end: number; text: string }[] = [];
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue;
    const names: string[] = [];
    const c = st.importClause;
    if (c !== undefined && !c.isTypeOnly) {
      if (c.name !== undefined) names.push(c.name.text);
      const b = c.namedBindings;
      if (b !== undefined) {
        if (ts.isNamespaceImport(b)) names.push(b.name.text);
        else for (const s of b.elements) if (!s.isTypeOnly) names.push(s.name.text);
      }
    }
    edits.push({ start: st.getStart(sf), end: st.end, text: names.map((n) => `declare const ${n}: any;`).join(" ") });
  }
  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

function posAt(line: number, col: number, starts: readonly number[]): Pos {
  const lineStart = starts[Math.min(line - 1, starts.length - 1)] ?? 0;
  return { line, col, offset: lineStart + Math.max(0, col - 1) };
}
