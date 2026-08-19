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
// Compile-layer only: nothing in the zero-dependency runtime graph imports this
// (the same posture as compile.ts / free-idents). Its two VALUE imports —
// MOTION_TOKENS and declaredType — read the runtime's own vocabulary tables so
// the scaffold cannot drift from them; everything else is `import type`.

import type { ComponentSchema } from "../../runtime/dist/schema.js";
import type { AttrType } from "../../runtime/dist/value.js";
import type { ClassDecl, Method, Param } from "../../runtime/dist/parser.js";
import { MOTION_TOKENS } from "../../runtime/dist/animate.js";
import { declaredType } from "../../runtime/dist/value.js";
import { EVENT_PAYLOAD, handlerName } from "../../runtime/dist/schema.js";

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
interface Gradient { angle: number; stops: readonly { offset: number | null; color: Color }[] }
type Fill = Color | Gradient;
interface Stroke { width: number; color: Color }
interface Shadow { dx: number; dy: number; blur: number; color: Color }
interface Backdrop { blur: number; saturate: number }
type Theme = Readonly<Record<string, any>>;
interface Cursor { readonly data: any; readonly path: readonly string[] }
declare function gradient(...args: (Color | string | { offset: number | null; color: Color })[]): Gradient;
declare function stroke(width: number, color: Color): Stroke;
declare function stop(offset: number, color: Color): { offset: number; color: Color };
declare function shadow(dx: number, dy: number, blur: number, color: Color): Shadow;
declare function frost(radius: number, saturation?: number): Backdrop;
declare function colorWithAlpha(rgb: number, a: number): number;
interface DrawGradient { addColorStop(offset: number, color: string | Color): void }
/** The canvas drawing context a \`draw(d: Draw)\` body receives — a Canvas2D-
 *  shaped recorder. Mirrors runtime/src/draw.ts; every \`draw(d)\` in the corpus
 *  was \`any\` until this was declared. */
interface Draw {
  // The view's own SIZE, for a drawing that sizes itself. Reading one opts this
  // drawing into re-recording when the view resizes (draw.ts explains why that
  // is a getter and not a field). There is no \`x\`/\`y\`: a recording's origin IS
  // the view's top-left, so they could only ever be 0 — they were typed here and
  // unsupplied by the runtime, which made \`d.w - 20\` compile, read undefined,
  // go NaN, and silently erase the drawing.
  w: number;
  h: number;
  fillStyle: string | Color | DrawGradient;
  strokeStyle: string | Color | DrawGradient;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  miterLimit: number;
  lineDashOffset: number;
  globalAlpha: number;
  globalCompositeOperation: string;
  shadowBlur: number;
  shadowColor: string | Color;
  shadowOffsetX: number;
  shadowOffsetY: number;
  filter: string;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  direction: string;
  letterSpacing: string;
  wordSpacing: string;
  fontKerning: string;
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void;
  beginPath(): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;
  clip(rule?: string): void;
  closePath(): void;
  createConicGradient(startAngle: number, x: number, y: number): DrawGradient;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): DrawGradient;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): DrawGradient;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw?: boolean): void;
  fill(rule?: string): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  lineTo(x: number, y: number): void;
  list(): any;
  moveTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  rect(x: number, y: number, w: number, h: number): void;
  resetTransform(): void;
  restore(): void;
  rotate(angle: number): void;
  roundRect(x: number, y: number, w: number, h: number, radii: number | number[]): void;
  save(): void;
  scale(x: number, y: number): void;
  setLineDash(segments: number[]): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  stroke(): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  strokeText(text: string, x: number, y: number, maxWidth?: number): void;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  translate(x: number, y: number): void;
}
interface Touch { id: number; x: number; y: number }
interface PointerEvent { x: number; y: number }
interface PointerUpEvent extends PointerEvent { canceled: boolean }
interface TouchEvent extends PointerEvent { touches: readonly Touch[]; changed: readonly Touch[] }
interface WheelEvent extends PointerEvent { deltaX: number; deltaY: number; pinch: boolean }
interface PinchEvent extends PointerEvent { scale: number; center: { readonly x: number; readonly y: number } }
interface KeyEvent { code: string; key: string; shift: boolean; ctrl: boolean; alt: boolean; meta: boolean; repeat: boolean }
interface FocusGeometry { x: number; y: number; w: number; h: number; rad: number; view: View; root: View; scroller: View; homeX: number; homeY: number; homeW: number; homeH: number; homeRad: number }
interface TipEvent { readonly text: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly root: View }
interface StreamMessage { readonly data: string; readonly type: string; readonly id: string }
type MotionCurve = { readonly __motion: true };
declare function cubicBezier(x1: number, y1: number, x2: number, y2: number): MotionCurve;
declare function back(overshoot: number): MotionCurve;
declare function steps(n: number, jump?: "jumpStart" | "jumpEnd"): MotionCurve;
declare function laszlo(beginPole: number, endPole: number): MotionCurve;
declare const Themes: { sanFrancisco(dark?: boolean): Record<string, unknown>; cupertino(dark?: boolean): Record<string, unknown>; mountainView(dark?: boolean): Record<string, unknown>; redmond(dark?: boolean): Record<string, unknown>; tint(c: number, dark?: boolean): number };
declare const Inspect: {
  ready(): boolean;
  rows(open: Record<string, boolean>): { path: string; name: string; kind: string; depth: number; hasKids: boolean; visible: boolean; constrained: boolean; motion: boolean }[];
  node(path: string): any;
  kindOf(path: string): string;
  slots(path: string): { attr: string; text: string; kind: string; open: boolean; origin: string; motion: boolean; viewKind?: string; color?: string }[];
  explain(path: string, attr: string): any;
  depValue(path: string, readPath: string): string;
  depTargetPath(path: string, readPath: string): string;
  expand(path: string, attr: string, trail: readonly string[]): any;
  dependents(attr: string): { path: string; attr: string; label: string }[];
  rect(path: string): { x: number; y: number; width: number; height: number } | null;
  at(x: number, y: number, pierce?: boolean): string;
  stats(): { nodes: number; ownedSlots: number; motionBusy: boolean };
  hasData(path: string): boolean;
  dataKeys(path: string): string[];
  dataRows(path: string): { key: string; text: string; kind: string; open: boolean }[];
  dataPreview(path: string): string;
  evaluate(path: string, src: string): { ok: boolean; input: string; text: string; verb: string; temporary?: boolean };
  clock: { manual(): void; auto(): void; step(ms?: number): void; settleMotion(maxMs?: number): boolean; now(): number };
};
/** Run \`step\` exactly once, at the close of the current settle — your
 *  handler's writes applied, views real, placed, and sized, nothing painted
 *  yet. What it writes lands in the same frame as the change itself. Reach
 *  for a constraint first; afterSettle is for work that is irreducibly a
 *  READING of the new geometry (aiming a camera at a view your write just
 *  caused to exist), never for waiting. */
declare function afterSettle(step: () => void): void;
declare function setTimeout(fn: (...args: any[]) => void, ms?: number): number;
declare function clearTimeout(id: number): void;
declare function setInterval(fn: (...args: any[]) => void, ms?: number): number;
declare function clearInterval(id: number): void;
declare const console: { log(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void };`;

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
    case "dataschema": return "any"; // the parsed shape declarations — data, not a body-facing type
    case "enum": return t.name; // references the emitted `type <Name> = …` alias
    case "component": return `${t.of} | null`; // the only literal is `null` for "none"
    case "fn": return `(${t.written.replace(/->/g, "=>")}) | null`; // a callback slot; `null` = none
    case "cursor": return "Cursor"; // deferred: schema-typed :path (header (a))
    case "slotref": return "string"; // a bare slot name, a string at runtime
    case "record": return t.name; // e.g. Theme (in the prelude)
    case "fill": return "Fill";
    case "stroke": return "Stroke | null";
    case "shadow": return "Shadow | null";
    case "backdrop": return "Backdrop | null";
    case "motion": return "Motion"; // the token union + MotionCurve brand (prelude)
    case "styles": return "string[]"; // a static bundle-name list
    case "stylesheet": return "string | null"; // a declared stylesheet by name
    case "font": return "string"; // fontFamily reads as a family string in a { } body
    case "array": return t.of !== undefined ? `${t.of}[]` : "any[]";
    case "object": return "any";
    case "view": return "View | null";
  }
}

/** The event-payload type names, writable in a handler's signature. Declared
 *  in the prelude above; the shapes live in the runtime (events.ts, keys.ts,
 *  tip.ts, focus.ts) and this list is what makes them nameable by an author. */
const PAYLOAD_TYPES = new Set(["PointerEvent", "PointerUpEvent", "TouchEvent", "WheelEvent", "PinchEvent", "Touch", "KeyEvent", "FocusGeometry", "TipEvent", "StreamMessage", "Draw", "DrawGradient"]);

/** A WRITTEN signature type name (`f(w: Window) -> number`) → its TypeScript
 *  type. Two sources, the same two an attribute declaration draws on: the
 *  declarable value vocabulary (`number`, `string`, `array`, `Axis`, …) and the
 *  component classes, every one of which is emitted here as a peer
 *  `declare class`. Returns null when the name is neither, so the caller can
 *  report it positioned against the author's text.
 *
 *  Nullability is the OPEN QUESTION here, and the reason some corpus signatures
 *  stay bare. A component-typed SLOT is `| null` (declared `= null` — how the
 *  corpus holds instances), so passing one to a non-null parameter is an error;
 *  make the parameter nullable instead and every use inside the body becomes
 *  "possibly null". Measured on library/menu.declare: non-null costs 3 call
 *  sites, nullable costs 9 body reads. Neither is right, because the language
 *  has no nullable/optional parameter spelling (`c: Menu?`) — when it gets one,
 *  this is the line that changes. Non-null is kept meanwhile: it keeps bodies
 *  clean and pushes the check to the caller, where the knowledge is. */
export function signatureTsType(written: string, isComponent: (n: string) => boolean, nullable = false): string | null {
  const nul = (t: string): string => (nullable ? `${t} | null` : t);
  // `Window[]` — an element-typed array. Resolve the ELEMENT and append; the
  // spelling is already TypeScript's.
  if (written.endsWith("[]")) {
    const base = signatureTsType(written.slice(0, -2), isComponent, false);
    return base === null ? null : nul(`${base}[]`);
  }
  // A FUNCTION type — `(id: string) -> void`, what a method IS (language §4).
  // The written form differs from TypeScript's by exactly one token, so the
  // translation is that token; the names inside were validated by the checker.
  // PARENTHESISED when nullable: `(id: string) => void | null` would read as a
  // function RETURNING `void | null`, not a nullable function.
  if (written.startsWith("(")) {
    const fn = written.replace(/->/g, "=>");
    return nullable ? `(${fn}) | null` : fn;
  }
  if (PAYLOAD_TYPES.has(written)) return nul(written);   // `onPointerUp(e: PointerUpEvent)`
  const t = declaredType(written);
  if (t !== null) return nul(t.kind === "view" ? "View" : t.kind === "component" ? t.of : tsType(t));
  return isComponent(written) ? nul(written) : null;
}

/** A method member's ambient signature — what a CALLER checks against (the
 *  body is checked separately, in typecheck.ts's `emit`).
 *
 *  A parameter with a written type is emitted as that type and is REQUIRED:
 *  the author stated the contract, so omitting the argument is a real error.
 *  A bare parameter stays `?: any` — optional because the grammar has no
 *  required-marker and JS callers legally omit trailing args, so arity
 *  enforcement would be unfounded (an EXCESS argument still errors either way).
 *  That asymmetry is the migration pressure: annotating a signature is what
 *  buys the checking.
 *
 *  An omitted return stays `any` — NOT `void`: methods do yield constraint
 *  values (`width = { app.lerp(4, 9, t) }` is the calendar's idiom throughout),
 *  and `void` would flag every such use of a correct program. */
function methodSig(m: Method, isComponent: (n: string) => boolean): string {
  const params = m.params.map((p, i) => {
    const ts = p.type === undefined ? null : signatureTsType(p.type, isComponent, p.nullable === true);
    // `?` means MAY BE ABSENT — omittable as well as null, matching TypeScript's
    // own `?:` and how the corpus already guards (`if (selKey != null) …`). An
    // UNTYPED parameter is likewise omittable (no declared contract to keep).
    // Either can only actually BE optional when nothing REQUIRED follows, which
    // is TypeScript's own rule (TS1016) — otherwise it stays required.
    const required = (q: Param): boolean => q.type !== undefined && q.nullable !== true;
    const omittable = !required(p) && !m.params.slice(i + 1).some(required);
    if (ts === null) return `${p.name}${omittable ? "?" : ""}: any`;
    return `${p.name}${omittable ? "?" : ""}: ${ts}`;
  }).join(", ");
  const ret = m.returns === undefined ? "any" : (signatureTsType(m.returns, isComponent, m.returnsNullable === true) ?? "any");
  return `  ${m.name}(${params}): ${ret};`;
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
/** The CALLABLE surface of a service that is also a component. `Keys` and
 *  `Focus` name one concept each — the keyboard, the focus service — which a
 *  body can either ASK (`Keys.isDown("KeyA")`, `Focus.focus(this)`) or LISTEN
 *  to (`Keys [ onKeyDown(e) { … } ]`). Emitted as STATIC members of the
 *  component's class so both readings typecheck under the one name; at runtime
 *  they never meet, since a tag and a body identifier are different namespaces
 *  (the body's `Keys` is the injected service object — expr.ts setBodyServices). */
export const LANGUAGE_STATICS: Readonly<Record<string, readonly string[]>> = {
  Keys: [
    `  static isDown(code: string): boolean;`,
    `  static held(): string[];`,
    // Claim the nav keys (arrows/Space/Home/End/Page) from the browser's
    // scroll defaults while an overlay roves — an open Menu's claim.
    `  static navClaim(owner: object, on: boolean): void;`,
  ],
  Focus: [
    `  static focus(v: unknown): void;`,
    `  static blur(): void;`,
    `  static next(): void;`,
    `  static prev(): void;`,
    `  static byKeyboard(): boolean;`,
    `  static getFocus(): any;`,
  ],
};

export const LANGUAGE_API: Readonly<Record<string, readonly string[]>> = {
  // The App's navigation SERVICE ACTION (view.ts App.navigate, capabilities.md
  // §6): a link/button calls `app.navigate(url)` in an activation handler. A
  // method, not an attribute — `app.navigate = url` is a type error now, which
  // is the migration signal, and the extractor reads the CALL (links.ts).
  App: [
    `  navigate(to: string): void;`,
    `  openWindow(to: string): void;`,
    // The ONE operation behind every arrival (location.md §0.5): follow(ref)
    // applies the app's onFollow hook once, then routes — external through
    // navigate, "#…" into a location write + reveal. destinationOf strips the
    // runtime's own trailing `@name`; apps never hand-write that split.
    `  follow(ref: string, replace?: boolean): void;`,
    `  destinationOf(loc: string): string;`,
    // The DEFAULT landing, exposed (view.ts App.reveal): scroll the target
    // into view, revealInset honored — what an arrival does when no onArrive
    // is declared. An onArrive that wants the scroll AND more composes it
    // back by calling this (the tabOrder()/tabDefault() move).
    `  reveal(target: View): void;`,
    // The Inspector service action (view.ts App.inspect): a button calls
    // `app.inspect("run:<slot>")` to open the Inspector on an embedded app, or
    // `app.inspect()` for this one. Rides the same host-polled channel shape as
    // navigate/openWindow — a `{ }` body never touches the document.
    `  inspect(slot?: string): void;`,
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
    // The datapath read/write pair (view.ts): the compiled form every `:path`
    // island lowers to (compile.ts emits the pre-parsed plan —
    // `this.$data(["location","city"])`, selectors as tagged segments), and
    // callable by hand. Data-shaped → `any`, the same deliberate under-report
    // as Dataset.value: a datum's shape is unknowable until the `schema`
    // construct lands.
    `  $data(path: string | readonly (string | { i: number } | { s: (number | null)[] } | { w: number })[]): any;`,
    `  $setData(path: string | readonly string[], v: any): void;`,
    `  scrollIntoView(align?: "start" | "nearest", smooth?: boolean): void;`,
    // The scroll-offset REQUEST pair (platform-authorship.md): the platform
    // clamps to the real range (Infinity = the far end) and holds a request a
    // hidden surface cannot take yet, applying it on show. The verbs, where
    // `scrollY`/`scrollX` are the facts.
    `  scrollTo(y: number): void;`,
    `  scrollToX(x: number): void;`,
    // The view's origin in root space via THE one walk (scroll-aware) — the
    // anchor primitive overlays position by (menus, popovers).
    `  rootOrigin(): { x: number; y: number };`,
    // The hit-test pair (view.ts): the same top-paints-first walk the pointer
    // uses, callable from any handler — the drop-target primitive. Missing
    // here until the shelf eval's reference tripped over it (2026-08-07),
    // the day after the prose taught it.
    `  viewAt(x: number, y: number): View | null;`,
    `  containsPoint(x: number, y: number): boolean;`,
    // Re-host this view's surface inside a scroller so the platform carries
    // it with the content (the FocusRing's ride); false = unsupported.
    `  travelWith(scroller: View | null): boolean;`,
    // Imperative creation — the receiver IS the parent (and the new view's
    // scope/data anchor). The tag is a string LITERAL at nearly every call
    // site, and the scaffold owns the class table — so the return is the class
    // the tag names (DeclareTags, emitted per program). A DYNAMIC tag string
    // falls to the second overload and honestly returns View: unknowable
    // statically, by construction.
    `  createView<K extends keyof DeclareTags>(tag: K, props?: Record<string, unknown>): DeclareTags[K];`,
    `  createView(tag: string, props?: Record<string, unknown>): View;`,
    // The transformed footprint — the AABB of the frame under scale-then-rotate
    // about the pivot, in the PARENT's coordinates. What layouts pack and
    // auto-extent measures; identity when scale = 1 and rotation = 0.
    `  bounds(): { x: number; y: number; width: number; height: number };`,
    // rootOrigin()'s box sibling: the transformed frame in ROOT-content space,
    // scroll-aware (the hit walk's math) — a one-shot query, never a fact.
    `  rootBounds(): { x: number; y: number; width: number; height: number };`,
    // bounds() minus the position: x/y are the transform's lead offsets, and it
    // never reads the view's x/y — the form a layout's place() consumes (a
    // strategy must not read the slots it writes).
    `  footprint(): { x: number; y: number; width: number; height: number };`,
    `  raise(below?: View | null): void;`,
    `  removeChild(child: View): void;`,
    // Tear a runtime-created view down for good: unlink from the parent,
    // unwire constraints, drop the surface, notify the ex-parent's layout and
    // auto-extent — the self-completing pair of createView.
    `  discard(): void;`,
    `  insertChild(child: View, index: number): void;`,
    // The keyboard-traversal protocol (focus.ts): a view's tabOrder() decides
    // the members Tab descends into — override it to gate traversal (a closed
    // Accordion Pane contributes none); tabDefault() is the default the
    // override composes with (visible children, source order).
    `  tabOrder(): View[];`,
    `  tabDefault(): View[];`,
    // Returns the runtime stylesheet handle the `stylesheet` slot accepts —
    // `any` until the handle type is worth naming (the effects side of this
    // same method lives in effects.ts: pure, deps only on its arguments).
    `  lookupStylesheet(name: string): any;`,
  ],
  Dataset: [
    // The read + structural-mutation surface (runtime/src/data.ts) — D7's
    // ratified authoring surface. Paths are the B2 currency (data-paths.md
    // §11): SEGMENTS (["events", idx, "y"] — the documented form, numbers
    // welcome) or an RFC 6901 POINTER string ("/events/3/y" — the interop
    // spelling; "/rows/-" appends on set). Dot-strings are refused. Edits
    // drive bindings and replication through the ordinary settle.
    `  read(path: string | readonly (string | number)[]): any;`,
    `  set(path: string | readonly (string | number)[], v: any): void;`,
    `  insert(path: string | readonly (string | number)[], index: number, v: any): void;`,
    `  removeAt(path: string | readonly (string | number)[], index: number): any;`,
    `  move(path: string | readonly (string | number)[], from: number, to: number): void;`,
  ],
  // NOTE: the lifecycle (value/status/error/statusCode/errorBody and the four
  // booleans) is NOT listed here — it is declared in the schema now, so it
  // flows into the typed surface and the generated reference from one place.
  // Only the VERBS need naming, since a method is not an attribute.
  DataSource: [
    `  fetch(): Promise<void>;`,
    `  clear(): void;`,
  ],
  Animator: [`  start(): void;`, `  stop(): void;`],
  AnimatorGroup: [`  start(): void;`, `  stop(): void;`],
  // The socket's one verb (streams.ts): a call you make; onMessage is it
  // calling you. The shared stream surface (url/active/retry + the read-only
  // intrinsics) flows from the Stream schema's attrs, not from here.
  Socket: [`  send(text: string): void;`],
  // The edit-session VERBS (editor.ts): `dirty`/`valid`/`error` are schema
  // attrs (readable state), but committing/reverting the draft are calls.
  Editor: [`  commit(): void;`, `  revert(): void;`],
  // The State verbs (state.ts): drive `applied` imperatively — legal only on
  // an UNGATED state (gate XOR verbs; a gated state throws with the rule named).
  // Implemented and advertised since the start; unreachable from source until
  // 2026-07-28 because this table simply lacked the entry.
  State: [`  apply(): void;`, `  remove(): void;`, `  toggle(): void;`],
  Layout: [`  view: View;`, `  laid(): View[];`], // view: runtime `View | null`, non-null by the time any body runs
  TweenLayout: [`  laid(): View[];`, `  retarget(animate: boolean): void;`],
};

/** One attribute member. A length-typed slot is the read/write ASYMMETRY the
 *  runtime actually has: a body may WRITE `number | Percent` (the slot accepts
 *  both), but a READ always sees the RESOLVED pixel number (the constraint
 *  system resolves a percent against the parent before any body runs — which
 *  is why `parent.width - 8` is the corpus-wide idiom and works). Model it as
 *  divergent accessors: `get(): number; set(v: Length)`. Symmetric kinds stay
 *  plain members. */
export function memberSig(name: string, t: AttrType, nonNullColor = false, readOnly = false): string[] {
  // A schema `readOnly` slot is computed — a constraint READS it, nothing sets
  // it. checkAttr already refuses `hovered = true` written as an attribute, but
  // an assignment inside a `{ }` body is TypeScript's to catch, and it could not
  // while this emitted a plain mutable member: `onClick() { this.hovered = true }`
  // typechecked clean. The two halves of one rule now agree.
  if (readOnly) {
    // a length's divergent get/set collapses to the getter — there is no setter
    if (t.kind === "length") return [`  readonly ${name}: number;`];
    if (t.kind === "color" && nonNullColor) return [`  readonly ${name}: number;`];
    return [`  readonly ${name}: ${tsType(t)};`];
  }
  if (t.kind === "length") return [`  get ${name}(): number;`, `  set ${name}(v: Length);`];
  // A color declared with a concrete (non-null) default is a plain color —
  // reads never see null — so it is typed non-null. A `= null` (or absent)
  // default keeps Color's nullability: the inherit / "no paint" slots.
  if (t.kind === "color" && nonNullColor) return [`  ${name}: number;`];
  return [`  ${name}: ${tsType(t)};`];
}

/** One schema → its `declare class`. Attributes come first (in schema order),
 *  then — on View alone — the view-tree noun members (every View-derived class
 *  inherits them via `extends`), then a user class's declared methods. Absent
 *  base (View / Layout / Dataset / Animator / AnimatorGroup roots) → no
 *  `extends`; an empty class → `{}`. */
function emitClass(
  s: ComponentSchema,
  decl: ClassDecl | undefined,
  rootType: string,
  extras: readonly string[] | undefined,
  isComponent: (n: string) => boolean
): string {
  const ext = s.base !== null ? ` extends ${s.base.name}` : "";
  const lines: string[] = [];
  // A color slot is non-null unless it means inherit/absent — i.e. unless its
  // default is `= null` (or it has none). So a concretely-defaulted user color
  // reads as a plain color, never "possibly null", in every constraint.
  const nonNullColors = new Set<string>();
  if (decl !== undefined) {
    for (const d of decl.body.decls) {
      if (d.def !== null && !(d.def.kind === "ident" && d.def.name === "null")) nonNullColors.add(d.name);
    }
  }
  const readOnlyHere = new Set(s.readOnly ?? []);
  for (const [name, t] of Object.entries(s.attrs)) {
    lines.push(...memberSig(name, t, t.kind === "color" && nonNullColors.has(name), readOnlyHere.has(name)));
  }
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
    lines.push(`  readonly children: View[];`);   // on the ROOT (Node) — every node has children
  }
  // One optional handler member per event this schema DECLARES. Emitting them
  // is what makes a user's handler an OVERRIDE: writing `onPointerUp(e: string)`
  // is then a TS2416 against this signature, and writing `onPointerUp(e)` with no
  // type is a TS7006 — the same treatment TypeScript gives any override, which
  // is the behaviour the language section that is 1:1 with TS should have.
  for (const ev of s.events ?? []) {
    const payload = EVENT_PAYLOAD[ev];
    lines.push(`  ${handlerName(ev)}?(${payload === undefined ? "" : `e: ${payload}`}): void;`);
  }
  const api = LANGUAGE_API[s.name];
  if (api !== undefined) lines.push(...api);
  const statics = LANGUAGE_STATICS[s.name];
  if (statics !== undefined) lines.push(...statics);
  if (decl !== undefined) for (const m of decl.body.methods) lines.push(methodSig(m, isComponent));
  // Instance members the EMITTER computed from the class BODY (its named
  // children, typed by their instance types) — on the class itself, so a
  // cross-reference through the class NAME (`section.area`) sees them too.
  if (extras !== undefined) lines.push(...extras);
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
  classDecls: readonly ClassDecl[],
  rootType: string = "App",
  classExtras?: ReadonlyMap<string, readonly string[]>,
  /** Written signature type names from INLINE elements too (the caller walks
   *  the whole tree; `classDecls` covers only `class` bodies). Enum/record
   *  aliases are collected from these as well as from attributes. */
  extraSignatureTypes: readonly string[] = []
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
  // …and from METHOD SIGNATURE types. An enum (or record) named ONLY by a
  // signature — `f(a: Axis)` in a program whose attributes never mention Axis —
  // still needs its alias emitted, or the scaffold references an undeclared
  // type and every body reports a bogus "nothing in scope is named 'Axis'".
  const sigTypes: string[] = [];
  for (const d of classDecls) {
    for (const m of d.body.methods) {
      for (const prm of m.params) if (prm.type !== undefined) sigTypes.push(prm.type);
      if (m.returns !== undefined) sigTypes.push(m.returns);
    }
  }
  sigTypes.push(...extraSignatureTypes);
  for (const name of sigTypes) {
    const t = declaredType(name);
    if (t !== null && t.kind === "enum" && !enums.has(t.name)) enums.set(t.name, t.tokens);
  }
  const enumLines = [...enums].map(
    ([name, toks]) => `type ${name} = ${toks.map((t) => JSON.stringify(t)).join(" | ")};`
  );

  // Record aliases: every record-typed attribute references a NAMED open record.
  // `Theme` ships in the prelude; any other name (e.g. `Accents`) gets its own
  // alias emitted here, so a new record-typed slot needs no prelude edit.
  // `any`, not `unknown` — the same deliberate under-report as Theme (prelude).
  const records = new Set<string>();
  for (const s of all.values()) {
    for (const t of Object.values(s.attrs)) if (t.kind === "record" && t.name !== "Theme") records.add(t.name);
  }
  for (const name of sigTypes) {
    const t = declaredType(name);
    if (t !== null && t.kind === "record" && t.name !== "Theme") records.add(t.name);
  }
  const recordLines = [...records].map((name) => `type ${name} = Readonly<Record<string, any>>;`);

  // Methods ride the user class declaration, keyed by class name.
  const declOf = new Map<string, ClassDecl>();
  for (const d of classDecls) declOf.set(d.name, d);

  // Base-before-derived: a stable sort by chain depth (roots at 0). Ambient
  // declarations hoist, so this is for readability, not resolution.
  const depth = (s: ComponentSchema): number => (s.base === null ? 0 : 1 + depth(s.base));
  const classes = [...all.values()].sort((a, b) => depth(a) - depth(b)).map((s) => emitClass(s, declOf.get(s.name), rootType, classExtras?.get(s.name), (n) => all.has(n)));
  // tag name → instance class, for createView's literal-tag overload (View's
  // LANGUAGE_API). Every schema, built-in and user, under its instantiable name.
  const tagLines = ["interface DeclareTags {", ...[...all.keys()].map((n) => `  ${JSON.stringify(n)}: ${n};`), "}"];

  // The Motion union — named tokens (generated from animate.ts, single source
  // of truth) plus the MotionCurve brand the constructors in the prelude return.
  const motionLine = `type Motion = ${MOTION_TOKENS.map((t) => JSON.stringify(t)).join(" | ")} | MotionCurve;`;

  return [PRELUDE, enumLines.join("\n"), recordLines.join("\n"), motionLine, tagLines.join("\n"), classes.join("\n\n")].filter((x) => x.length > 0).join("\n\n") + "\n";
}
