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
// Declare positions (see the deferrals below).
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
//       resulting tsc diagnostics back to Declare `Pos` — the NEXT slice.
//   (c) wiring this into compile.ts / the build pipeline.
//
// Runtime-free by construction: every import here is `import type` (erased), so
// the emitted dist/scaffold.js has no imports and never enters the
// zero-dependency runtime graph — the same posture as compile.ts / free-idents.
import { MOTION_TOKENS } from "../../runtime/dist/animate.js";
/** The fixed value-type prelude — the closed vocabulary of value.ts as TS
 *  types, plus the value constructors in scope for every body. Mirrors
 *  value.ts's runtime shapes exactly (Length/Color/Fill/Stroke/Shadow/
 *  Percent/Gradient and the gradient/stroke/stop/shadow constructors). `Cursor`
 *  is the deferred schema-typed-`:path` placeholder (see the header). `Theme`
 *  (and every record-typed slot) is DELIBERATELY `Record<string, any>`, not
 *  `unknown`: a record's keys are open by design (no schema construct yet), so
 *  `unknown` would make every read of a correct program a type error — and a
 *  check that fires on correct code is the cardinal sin (diagnostics.md §4 /
 *  verify-and-evals.md). `any` under-reports instead; schema-typed records
 *  close the hole when the `schema` construct lands. */
const PRELUDE = `type Percent = { percent: number };
type Length = number | Percent;
type Color = number | null;
type Shape = string | null;
interface Gradient { angle: number; stops: readonly { offset: number | null; color: number }[] }
type Fill = Color | Gradient;
interface Stroke { width: number; color: number }
interface Shadow { dx: number; dy: number; blur: number; color: number }
type Theme = Readonly<Record<string, any>>;
type Cursor = unknown;
declare function gradient(...args: (number | string | { offset: number | null; color: number })[]): Gradient;
declare function stroke(width: number, color: number): Stroke;
declare function stop(offset: number, color: number): { offset: number; color: number };
declare function shadow(dx: number, dy: number, blur: number, color: number): Shadow;
type MotionCurve = { readonly __motion: true };
declare function cubicBezier(x1: number, y1: number, x2: number, y2: number): MotionCurve;
declare function back(overshoot: number): MotionCurve;
declare function steps(n: number, jump?: "jumpStart" | "jumpEnd"): MotionCurve;
declare function laszlo(beginPole: number, endPole: number): MotionCurve;
declare const Focus: { focus(v: unknown): void; blur(): void; next(): void; prev(): void; byKeyboard(): boolean };
declare const Themes: { sanFrancisco(dark?: boolean): Record<string, unknown>; cupertino(dark?: boolean): Record<string, unknown>; mountainView(dark?: boolean): Record<string, unknown>; redmond(dark?: boolean): Record<string, unknown>; tint(c: number, dark?: boolean): number };
declare const Keys: { isDown(code: string): boolean; held(): string[] };
declare function setTimeout(fn: (...args: any[]) => void, ms?: number): number;
declare function clearTimeout(id: number): void;
declare function setInterval(fn: (...args: any[]) => void, ms?: number): number;
declare function clearInterval(id: number): void;`;
/** One AttrType (value.ts) → its TypeScript type, mirroring the value model.
 *  Enum and record arms reference a NAMED type (`type Stretch = …`, `Theme`)
 *  emitted in the prelude / near-use; component references the peer
 *  `declare class`. The nullable decoration slots (stroke/shadow) and the two
 *  styling channels carry their `| null` here, matching what coercion admits. */
export function tsType(t) {
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
 *  return is `any` — NOT `void`: methods do yield constraint values (`width =
 *  { app.lerp(4, 9, t) }` is the calendar's idiom throughout), and `void` would
 *  flag every such use of a correct program. Parameters are OPTIONAL: the
 *  grammar has no required-marker, and JS callers legally omit trailing args
 *  (`setMonth(y, m)` against `setMonth(y, m, d)`), so arity enforcement is
 *  unfounded — but an EXCESS argument still errors, which is a real catch.
 *  `any` under-reports the return until the typed form carries a written
 *  `-> R`; this is the one line to revisit when it lands. */
function methodSig(m) {
    const params = m.params.map((p) => `${p}?: any`).join(", ");
    return `  ${m.name}(${params}): any;`;
}
/** LANGUAGE-API members — the runtime surface a `{ }` body may READ or CALL
 *  that is deliberately NOT in the schemas: a schema models what an author can
 *  SET in `[ ]` ("lifecycle state (value, status, error) is runtime surface
 *  read from bindings, not author-settable — hence absent here", schema.ts),
 *  while a body also reads that lifecycle surface and calls runtime methods.
 *  This table is the TYPE half of what effects.ts is for DEPENDENCIES: a
 *  language-supplied member's signature is DECLARED (its body is runtime TS,
 *  not Declare source), a user member's is derived — same footing, no
 *  privilege tier. Signatures mirror the runtime (data.ts, animator.ts,
 *  layout.ts, backend.ts); data-shaped values are `any`, not `unknown` —
 *  a datum's shape is unknowable until the `schema` construct lands, and
 *  `unknown` would flag every correct read (the same deliberate under-report
 *  as Theme). Members the runtime marks `protected` (TweenLayout.laid) are
 *  declared public here: a check-block is a free function, not a subclass
 *  body, so TS's protected rule would reject the legal subclass call. */
export const LANGUAGE_API = {
    // The App's navigation SERVICE ACTION (view.ts App.navigate, capabilities.md
    // §6): a link/button calls `app.navigate(url)` in an activation handler. A
    // method, not an attribute — `app.navigate = url` is a type error now, which
    // is the migration signal, and the extractor reads the CALL (links.ts).
    App: [
        `  navigate(to: string): void;`,
        `  createView(tag: string, parent: View, props?: Record<string, unknown>): View;`,
        // INTERIM (capabilities.md §7): the two host-fed live-demo channels the
        // demo-hosting site apps still read — `demoSources` (host-seeded name→source
        // map, host-client.js) and `liveReport` (the last live recompile's rendered
        // report). Host-fed, read-only, never set in `[ ]`. RULED to dissolve into a
        // per-instance `LiveDemo` component (shape 3 — each instance owns its own
        // `source`/`report`); until that rework these ride here so App's schema stays
        // clean of editing knowledge. `any` values, the same under-report as Theme.
        `  readonly demoSources: Readonly<Record<string, any>>;`,
        `  readonly liveReport: string;`,
    ],
    View: [
        `  scrollIntoView(align?: "start" | "nearest"): void;`,
        // The keyboard-traversal protocol (focus.ts): a view's tabOrder() decides
        // the members Tab descends into — override it to gate traversal (a closed
        // TabSlider pane contributes none); tabDefault() is the default the
        // override composes with (visible children, source order).
        `  tabOrder(): View[];`,
        `  tabDefault(): View[];`,
        // Returns the runtime stylesheet handle the `stylesheet` slot accepts —
        // `any` until the handle type is worth naming (the effects side of this
        // same method lives in effects.ts: pure, deps only on its arguments).
        `  lookupStylesheet(name: string): any;`,
    ],
    Dataset: [
        // The read + structural-mutation surface (runtime/src/data.ts). Paths are
        // dot-strings, root-relative; array indices are ordinary segments. Edits
        // drive bindings and replication through the ordinary settle.
        `  readonly value: any;`,
        `  read(path: readonly (string | number)[]): any;`,
        `  set(path: any, v: any): void;`,
        `  insert(path: any, index: number, v: any): void;`,
        `  removeAt(path: any, index: number): any;`,
        `  move(path: any, from: number, to: number): void;`,
    ],
    DataSource: [
        `  readonly idle: boolean;`,
        `  readonly loading: boolean;`,
        `  readonly loaded: boolean;`,
        `  readonly failed: boolean;`,
        `  readonly status: string;`,
        `  readonly error: any;`,
        `  fetch(): Promise<void>;`,
        `  clear(): void;`,
    ],
    Animator: [`  start(): void;`],
    AnimatorGroup: [`  start(): void;`],
    // The edit-session VERBS (editor.ts): `dirty`/`valid`/`error` are schema
    // attrs (readable state), but committing/reverting the draft are calls.
    Editor: [`  commit(): void;`, `  revert(): void;`],
    Layout: [`  view: View;`], // runtime `View | null`, non-null by the time any body runs
    TweenLayout: [`  laid(): View[];`, `  retarget(animate: boolean): void;`],
};
/** One attribute member. A length-typed slot is the read/write ASYMMETRY the
 *  runtime actually has: a body may WRITE `number | Percent` (the slot accepts
 *  both), but a READ always sees the RESOLVED pixel number (the constraint
 *  system resolves a percent against the parent before any body runs — which
 *  is why `parent.width - 8` is the corpus-wide idiom and works). Model it as
 *  divergent accessors: `get(): number; set(v: Length)`. Symmetric kinds stay
 *  plain members. */
export function memberSig(name, t) {
    if (t.kind === "length")
        return [`  get ${name}(): number;`, `  set ${name}(v: Length);`];
    return [`  ${name}: ${tsType(t)};`];
}
/** One schema → its `declare class`. Attributes come first (in schema order),
 *  then — on View alone — the view-tree noun members (every View-derived class
 *  inherits them via `extends`), then a user class's declared methods. Absent
 *  base (View / Layout / Dataset / Animator / AnimatorGroup roots) → no
 *  `extends`; an empty class → `{}`. */
function emitClass(s, decl, rootType, extras) {
    const ext = s.base !== null ? ` extends ${s.base.name}` : "";
    const lines = [];
    for (const [name, t] of Object.entries(s.attrs))
        lines.push(...memberSig(name, t));
    if (s.base === null) {
        // The tree nouns (language §11) — on EVERY root class, not View alone:
        // Spring/State/Dataset bodies say `app` too (every node has parent/root;
        // the animator-leak fix is the runtime's same fact). `classroot` is typed
        // `View` — the "not tracked" default; a check-block pins the true
        // enclosing class per body through its `this: <Class>` wrapper (header).
        // The `parent` MEMBER is `any`: a chain (`x.parent.…`) or a cross-instance
        // hop (`classroot.parent.select(…)`) lands on whatever hosts the instance,
        // statically unknowable — `View` here would flag every legal member such a
        // hop reaches. The immediate `parent` PARAM in each check-block stays
        // precisely typed; only the member navigation is silenced.
        lines.push(`  parent: any;`);
        lines.push(`  classroot: View;`);
        // `root` — the App at the top of the tree. The `app` noun compiles to
        // `this.root`; typing it as THE PROGRAM'S root instance type (the
        // caller-passed `rootType` — the root element's synthesized anonymous
        // subclass when it has inline decls/children/methods, else `App`) makes
        // `app.cardW` and every other root-declared member check, not just the
        // built-in App/stage surface.
        lines.push(`  root: ${rootType};`);
        if (s.name === "View")
            lines.push(`  readonly children: View[];`);
    }
    const api = LANGUAGE_API[s.name];
    if (api !== undefined)
        lines.push(...api);
    if (decl !== undefined)
        for (const m of decl.body.methods)
            lines.push(methodSig(m));
    // Instance members the EMITTER computed from the class BODY (its named
    // children, typed by their instance types) — on the class itself, so a
    // cross-reference through the class NAME (`section.area`) sees them too.
    if (extras !== undefined)
        lines.push(...extras);
    return lines.length === 0
        ? `declare class ${s.name}${ext} {}`
        : `declare class ${s.name}${ext} {\n${lines.join("\n")}\n}`;
}
/** Generate the scaffold for a program: the fixed prelude, the enum type
 *  aliases every schema references, and one `declare class` per schema (built-in
 *  + user), base-before-derived. Pure — the returned STRING is the whole
 *  product. `schemas` is `programSchemas(program.classes).schemas`; `classDecls`
 *  is `program.classes` (their methods). */
export function generateScaffold(schemas, classDecls, rootType = "App", classExtras) {
    // Every schema reachable — the registry entries PLUS abstract bases the
    // registry omits (the `Layout` base is deliberately not a name-table key,
    // schema.ts, yet `layout: Layout | null` and `SimpleLayout extends Layout`
    // both need it declared). Walk each entry's base chain; first name wins.
    const all = new Map();
    const collect = (s) => {
        for (let c = s; c !== null && !all.has(c.name); c = c.base)
            all.set(c.name, c);
    };
    for (const s of Object.values(schemas))
        collect(s);
    // The enum aliases every enum-typed attribute references, deduped by name in
    // first-encounter order (built-in enum names are globally consistent — Motion
    // is identical on Animator and AnimatorGroup — so a name pins one token set).
    const enums = new Map();
    for (const s of all.values()) {
        for (const t of Object.values(s.attrs))
            if (t.kind === "enum" && !enums.has(t.name))
                enums.set(t.name, t.tokens);
    }
    const enumLines = [...enums].map(([name, toks]) => `type ${name} = ${toks.map((t) => JSON.stringify(t)).join(" | ")};`);
    // Record aliases: every record-typed attribute references a NAMED open record.
    // `Theme` ships in the prelude; any other name (e.g. `Accents`) gets its own
    // alias emitted here, so a new record-typed slot needs no prelude edit.
    // `any`, not `unknown` — the same deliberate under-report as Theme (prelude).
    const records = new Set();
    for (const s of all.values()) {
        for (const t of Object.values(s.attrs))
            if (t.kind === "record" && t.name !== "Theme")
                records.add(t.name);
    }
    const recordLines = [...records].map((name) => `type ${name} = Readonly<Record<string, any>>;`);
    // Methods ride the user class declaration, keyed by class name.
    const declOf = new Map();
    for (const d of classDecls)
        declOf.set(d.name, d);
    // Base-before-derived: a stable sort by chain depth (roots at 0). Ambient
    // declarations hoist, so this is for readability, not resolution.
    const depth = (s) => (s.base === null ? 0 : 1 + depth(s.base));
    const classes = [...all.values()].sort((a, b) => depth(a) - depth(b)).map((s) => emitClass(s, declOf.get(s.name), rootType, classExtras?.get(s.name)));
    // The Motion union — named tokens (generated from animate.ts, single source
    // of truth) plus the MotionCurve brand the constructors in the prelude return.
    const motionLine = `type Motion = ${MOTION_TOKENS.map((t) => JSON.stringify(t)).join(" | ")} | MotionCurve;`;
    return [PRELUDE, enumLines.join("\n"), recordLines.join("\n"), motionLine, classes.join("\n\n")].filter((x) => x.length > 0).join("\n\n") + "\n";
}
//# sourceMappingURL=scaffold.js.map