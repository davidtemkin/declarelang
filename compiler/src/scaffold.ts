// scaffold — the typed-scaffolding generator: the FIRST slice of Declare's
// compile-time typechecker. APPROACH §5 commits the compiler to hand `{ }`
// bodies and typechecking to the TypeScript compiler API *as a library* — it
// does not reimplement TypeScript, and "typechecking largely falls out given
// the right typed scaffolding." This module builds that scaffolding: it turns
// the component schemas (schema.ts) + the value vocabulary (value.ts) into an
// ambient TypeScript surface — a source STRING of `type`/`declare` shapes —
// against which stock tsc can check a resolved `{ }` body.
//
// A pure function: `generateScaffold(schemas, classDecls)` reads the program's
// schema registry (built-ins + user classes, exactly the table
// `programSchemas` returns) plus the class declarations (for their methods),
// and returns the scaffold text. No side effects, no I/O — the STRING is the
// whole product, so the same generator serves the Node compile and the
// in-browser path. It is deliberately standalone (nothing imports it yet — not
// wired into compile.ts): this slice proves the generator with stock tsc; the
// next slice auto-emits a check-block per body and maps tsc diagnostics back to
// neo positions (see the deferrals below).
//
// Two parts, mirroring the two lexical homes of a value:
//
//   1. A fixed PRELUDE — the closed value vocabulary of value.ts as TS types,
//      plus the value-constructor signatures (gradient/stroke/stop/shadow) a
//      body may call. This is the single source of the AttrType → TS mapping;
//      it mirrors value.ts's runtime types exactly.
//
//   2. One `declare class` per schema — built-ins and user classes — with each
//      attribute typed through the AttrType → TS map, the base wired via
//      `extends`, and (for user classes) the declared methods. The view-tree
//      nouns (language §11: parent / classroot / root / children) live on View
//      and reach every View-derived class through `extends`.
//
// ── The settled check-block SHAPE (how a body is checked against this) ───────
//
// A resolved `{ }` body (compile.ts has already rewritten its bare names to
// `this.slot` / `parent.…` / `classroot.…`) is checked by appending, to the
// scaffold, a line of the form:
//
//     const _slot: <SlotTsType> = (function (this: <Class>) {
//       return <resolved-body>;
//     }).call(<instance>);
//
//   • `this: <Class>` types the function's `this`, putting the class's whole
//     inherited slot set in scope — so `this.sel`, `this.openHeight`,
//     `parent.width` all resolve, and a typo (`this.openHeightX`) is a TS2339.
//   • `: <SlotTsType>` is the slot's declared type (from attrType via the map).
//     It checks the body's VALUE against the slot — a boolean flowing into a
//     `Length` slot is a TS2322 on the assignment. This is the whole point: the
//     declarative type catches imperative misuse across the `[ ]`/`{ }` seam.
//   • `.call(<instance>)` is load-bearing and RELIES on `strictBindCallApply`
//     (enabled by tsconfig `strict`). Under it, `fn.call(inst)` is typed to
//     return the function's ACTUAL return type (not `any`), and to check
//     `inst` against `this: <Class>`. Without strictBindCallApply, `.call`
//     returns `any` and every cross-boundary error is silently swallowed —
//     so any consumer of this scaffold MUST typecheck under `strict`.
//
// A METHOD (statement) body checks with the same `this: <Class>` wrapper minus
// the `return (…)` and the outer slot annotation (a method has no single slot
// type until the typed-method form `name: (p: T) -> R` lands, HANDOFF §R5).
//
// ── Deferred (NOT built here — the next slices) ──────────────────────────────
//
//   (a) schema-typed `:path` datapaths. Typing a `:field.path` read needs the
//       `schema` construct (designed, not implemented — language §13); until
//       then a cursor slot is a nominal `Cursor` placeholder (= unknown), so a
//       `:path` value is opaque, not mis-typed. Dynamic-mode `:path` (value
//       coerced at the runtime boundary) is unchanged by this.
//   (b) auto-emitting a check-block per `{ }` body of a program and mapping the
//       resulting tsc diagnostics back to neo `Pos` — the NEXT slice.
//   (c) wiring this into compile.ts / the build pipeline.
//
// Runtime-free by construction: every import here is `import type` (erased), so
// the emitted dist/scaffold.js has no imports and never enters the
// zero-dependency runtime graph — the same posture as compile.ts / free-idents.

import type { ComponentSchema } from "../../runtime/dist/schema.js";
import type { AttrType } from "../../runtime/dist/value.js";
import type { ClassDecl, Method } from "../../runtime/dist/parser.js";
import { MOTION_TOKENS } from "../../runtime/dist/animate.js";

/** The fixed value-type prelude — the closed vocabulary of value.ts as TS
 *  types, plus the value constructors in scope for every body. Mirrors
 *  value.ts's runtime shapes exactly (Length/Color/Fill/Stroke/Shadow/Theme/
 *  Percent/Gradient and the gradient/stroke/stop/shadow constructors). `Cursor`
 *  is the deferred schema-typed-`:path` placeholder (see the header). */
const PRELUDE = `type Percent = { percent: number };
type Length = number | Percent;
type Color = number | null;
type Shape = string | null;
interface Gradient { angle: number; stops: readonly { offset: number | null; color: number }[] }
type Fill = Color | Gradient;
interface Stroke { width: number; color: number }
interface Shadow { dx: number; dy: number; blur: number; color: number }
type Theme = Readonly<Record<string, unknown>>;
type Cursor = unknown;
declare function gradient(...args: (number | string | { offset: number | null; color: number })[]): Gradient;
declare function stroke(width: number, color: number): Stroke;
declare function stop(offset: number, color: number): { offset: number; color: number };
declare function shadow(dx: number, dy: number, blur: number, color: number): Shadow;
type MotionCurve = { readonly __motion: true };
declare function cubicBezier(x1: number, y1: number, x2: number, y2: number): MotionCurve;
declare function back(overshoot: number): MotionCurve;
declare function steps(n: number, jump?: "jumpStart" | "jumpEnd"): MotionCurve;
declare function laszlo(beginPole: number, endPole: number): MotionCurve;`;

/** One AttrType (value.ts) → its TypeScript type, mirroring the value model.
 *  Enum and record arms reference a NAMED type (`type Stretch = …`, `Theme`)
 *  emitted in the prelude / near-use; component references the peer
 *  `declare class`. The nullable decoration slots (stroke/shadow) and the two
 *  styling channels carry their `| null` here, matching what coercion admits. */
export function tsType(t: AttrType): string {
  switch (t.kind) {
    case "length": return "Length";
    case "number": return "number";
    case "boolean": return "boolean";
    case "string": return "string";
    case "color": return "Color";
    case "shape": return "Shape";
    case "enum": return t.name; // references the emitted `type <Name> = …` alias
    case "component": return `${t.of} | null`; // the only literal is `null` for "none"
    case "cursor": return "Cursor"; // deferred: schema-typed :path (header (a))
    case "slotref": return "string"; // a bare slot name, a string at runtime
    case "record": return t.name; // e.g. Theme (in the prelude)
    case "fill": return "Fill";
    case "stroke": return "Stroke | null";
    case "shadow": return "Shadow | null";
    case "motion": return "Motion"; // the token union + MotionCurve brand (prelude)
    case "styles": return "string[]"; // a static bundle-name list
    case "stylesheet": return "string | null"; // a declared stylesheet by name
    case "font": return "string"; // fontFamily reads as a family string in a { } body
  }
}

/** A method member's ambient signature. The grammar carries no parameter types
 *  and no return type yet (the shorthand `name(params) { … }`; the typed form
 *  `name: (p: T) -> R { … }` waits for the type surface, HANDOFF §R5), so each
 *  bare parameter is typed `any` (a caller passing any argument checks) and the
 *  return is `void` — matching the statement-body shape (methods act, they do
 *  not yield constraint values). This is the one line to revisit when the typed
 *  method form lands: read the written `: T` params and `-> R` return then. */
function methodSig(m: Method): string {
  const params = m.params.map((p) => `${p}: any`).join(", ");
  return `  ${m.name}(${params}): void;`;
}

/** One schema → its `declare class`. Attributes come first (in schema order),
 *  then — on View alone — the view-tree noun members (every View-derived class
 *  inherits them via `extends`), then a user class's declared methods. Absent
 *  base (View / Layout / Dataset / Animator / AnimatorGroup roots) → no
 *  `extends`; an empty class → `{}`. */
function emitClass(s: ComponentSchema, decl: ClassDecl | undefined): string {
  const ext = s.base !== null ? ` extends ${s.base.name}` : "";
  const lines: string[] = [];
  for (const [name, t] of Object.entries(s.attrs)) lines.push(`  ${name}: ${tsType(t)};`);
  if (s.name === "View") {
    // The view-tree nouns (language §11). `classroot` is typed `View` — the
    // "not tracked" default; a check-block pins the true enclosing class per
    // body through its `this: <Class>` wrapper (header). Non-View roots carry
    // no nouns in this slice (their bodies are a later concern).
    lines.push(`  parent: View;`);
    lines.push(`  classroot: View;`);
    // `root` — the App at the top of the tree. The `app` noun compiles to
    // `this.root`; typing it `App` here makes `app.hostWidth` etc. check
    // against the App/stage surface rather than the bare View one.
    lines.push(`  root: App;`);
    lines.push(`  readonly children: View[];`);
  }
  if (decl !== undefined) for (const m of decl.body.methods) lines.push(methodSig(m));
  return lines.length === 0
    ? `declare class ${s.name}${ext} {}`
    : `declare class ${s.name}${ext} {\n${lines.join("\n")}\n}`;
}

/** Generate the scaffold for a program: the fixed prelude, the enum type
 *  aliases every schema references, and one `declare class` per schema (built-in
 *  + user), base-before-derived. Pure — the returned STRING is the whole
 *  product. `schemas` is `programSchemas(program.classes).schemas`; `classDecls`
 *  is `program.classes` (their methods). */
export function generateScaffold(
  schemas: Readonly<Record<string, ComponentSchema>>,
  classDecls: readonly ClassDecl[]
): string {
  // Every schema reachable — the registry entries PLUS abstract bases the
  // registry omits (the `Layout` base is deliberately not a name-table key,
  // schema.ts, yet `layout: Layout | null` and `SimpleLayout extends Layout`
  // both need it declared). Walk each entry's base chain; first name wins.
  const all = new Map<string, ComponentSchema>();
  const collect = (s: ComponentSchema): void => {
    for (let c: ComponentSchema | null = s; c !== null && !all.has(c.name); c = c.base) all.set(c.name, c);
  };
  for (const s of Object.values(schemas)) collect(s);

  // The enum aliases every enum-typed attribute references, deduped by name in
  // first-encounter order (built-in enum names are globally consistent — Motion
  // is identical on Animator and AnimatorGroup — so a name pins one token set).
  const enums = new Map<string, readonly string[]>();
  for (const s of all.values()) {
    for (const t of Object.values(s.attrs)) if (t.kind === "enum" && !enums.has(t.name)) enums.set(t.name, t.tokens);
  }
  const enumLines = [...enums].map(
    ([name, toks]) => `type ${name} = ${toks.map((t) => JSON.stringify(t)).join(" | ")};`
  );

  // Methods ride the user class declaration, keyed by class name.
  const declOf = new Map<string, ClassDecl>();
  for (const d of classDecls) declOf.set(d.name, d);

  // Base-before-derived: a stable sort by chain depth (roots at 0). Ambient
  // declarations hoist, so this is for readability, not resolution.
  const depth = (s: ComponentSchema): number => (s.base === null ? 0 : 1 + depth(s.base));
  const classes = [...all.values()].sort((a, b) => depth(a) - depth(b)).map((s) => emitClass(s, declOf.get(s.name)));

  // The Motion union — named tokens (generated from animate.ts, single source
  // of truth) plus the MotionCurve brand the constructors in the prelude return.
  const motionLine = `type Motion = ${MOTION_TOKENS.map((t) => JSON.stringify(t)).join(" | ")} | MotionCurve;`;

  return [PRELUDE, enumLines.join("\n"), motionLine, classes.join("\n\n")].filter((x) => x.length > 0).join("\n\n") + "\n";
}
