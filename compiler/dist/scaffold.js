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
import { MOTION_TOKENS } from "../../runtime/dist/animate.js";
import { isAuthoredUnion } from "../../runtime/dist/value.js";
import { declaredType } from "../../runtime/dist/value.js";
import { EVENT_PAYLOAD, handlerName, SCHEMAS } from "../../runtime/dist/schema.js";
import { runtimeMethodsOf } from "../../runtime/dist/runtime-methods.js";
import { THEME_PRESET_NAMES } from "../../runtime/dist/themes.js";
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
const PRELUDE = `/** A percentage literal — what \`width = 50%\` becomes. Resolved against the parent
 *  on each axis, reactively, so a percent is a live relationship and not a number
 *  computed once. */
type Percent = { percent: number };
/** What a geometry slot takes: a number in the view's own units, or a percent of
 *  the parent on that axis. There is no unit vocabulary — no px, em or rem — because
 *  there is one coordinate space and the renderer owns the device pixels. */
type Length = number | Percent;
/** A corner rounding: one number for all four corners, or
 *  \`[topLeft, topRight, bottomRight, bottomLeft]\` to round only some. */
type Radius = number | readonly [number, number, number, number];
/** A color as \`0xRRGGBB\`, or with alpha as the runtime's own encoding (see
 *  \`colorWithAlpha\`). \`null\` means NO color — an unfilled view, an unstroked box —
 *  which is why it is part of the type rather than a sentinel. In a bare slot the
 *  CSS names and \`#RRGGBB\` are also legal; inside \`{ }\` a color is a number. */
type Color = number | null;
/** A clip path, as the \`clip\` slot takes it: an SVG path string in the view's own
 *  coordinates, or \`null\` for the plain rectangle. \`clip = true\` is the box; a shape
 *  is for everything else. */
type Shape = string | null;
/** A gradient value, as \`gradient\`, \`radialGradient\` and \`conicGradient\` build it.
 *  Any \`Fill\` slot takes one, and a drawing can too. Write it through a constructor
 *  rather than by hand: the shape is published so a program can read one back. */
interface Gradient { kind?: "linear" | "radial" | "conic"; angle: number; cx?: number; cy?: number; r?: number; stops: readonly { offset: number | null; color: Color }[] }
/** What a fill slot holds: a flat color, or a gradient. \`null\` is no fill at all. */
type Fill = Color | Gradient;
/** A border, built by \`stroke(width, color)\`. It is drawn INSIDE the box, so a
 *  stroke never changes a view's size — there is no \`borderWidth\` to add to a layout. */
interface Stroke { width: number; color: Color }
/** A ring drawn OUTSIDE the box, built by \`outline(width, color)\` — the focus
 *  silhouette's shape. Unlike a stroke it does not eat into the content box; unlike
 *  CSS's \`outline\` it is a value, not a property with its own cascade. */
interface Outline { width: number; color: Color }
/** A drop shadow, built by \`shadow(dx, dy, blur, color)\`. It is also a \`Filter\`, so
 *  it composes in a filter list; on \`textShadow\` it shadows the glyphs. */
interface Shadow { fn: "shadow"; dx: number; dy: number; blur: number; color: Color }
/** One entry in a filter list: a blur, one of the amount filters, a hue rotation, a
 *  colorize, or a shadow. \`filter\` applies the list to the view's own paint as a
 *  GROUP (so a subtree blurs together, not child by child); \`backdrop\` applies the
 *  same list to what lies beneath. There is no CSS \`filter\` string: the tokens are
 *  functions, so a misspelling is a compile error rather than a silent no-op. */
type Filter = { fn: "blur"; radius: number } | { fn: "brightness" | "contrast" | "saturate" | "grayscale" | "invert" | "sepia"; amount: number } | { fn: "hueRotate"; degrees: number } | { fn: "tint"; color: Color } | Shadow;
/** What lies BENEATH a view, filtered: the same list \`filter\` takes, applied to
 *  the backdrop instead of the view's own paint. \`frost\` is the common one. */
type Backdrop = readonly Filter[];
/** A token record — every color and metric an app names once. Provided down the
 *  tree (\`provided("theme")\`), spread to override a token, and declared at the top
 *  level with \`theme Name [ … ]\`. Its keys are open by design, which is why reads
 *  are typed \`any\`: a record whose keys the program chooses cannot be closed
 *  without firing on correct code. */
type Theme = Readonly<Record<string, any>>;
/** The house ACTIVE TONE: \`accent\` laid 22% over the \`surface\` it sits on —
 *  what a theme's \`controlSelected\` holds. An app that overrides \`accent\` computes
 *  it so the selected tone follows, instead of keeping the preset's, which was
 *  derived from a different accent: \`controlSelected: activeTone(pick, base.surface)\`.
 *  Both arguments are colors; nothing is read from the tree, so it means the same
 *  wherever it is called. */
declare function activeTone(accent: Color, surface: Color): Color;
/** The data a \`:path\` reads against — a view's place in the bound data, its
 *  \`datapath\` plus its position under replication. You rarely name the type: a
 *  \`:path\` reads through it for you. */
interface Cursor { readonly data: any; readonly path: readonly string[] }
/** One message across the island boundary — what \`post\` sends and \`onPost\`
 *  receives between an embedded app and its host. */
interface IslandPost { readonly topic: string; readonly payload: unknown }
/** A linear gradient: \`gradient(#F8F8F8, #D8D8D8)\` top to bottom, or with an angle
 *  first — \`gradient("90deg", …)\`. Colors spread evenly; \`stop(offset, color)\` places
 *  one exactly. Legal in a bare slot, which is why it is a call and not a record. */
declare function gradient(...args: (Color | string | { offset: number | null; color: Color })[]): Gradient;
/** A radial gradient from a center and radius, in the view's own units — a glow,
 *  a vignette, a sphere's shading. */
declare function radialGradient(cx: number, cy: number, r: number, ...stops: (Color | { offset: number | null; color: Color })[]): Gradient;
/** A gradient swept AROUND a center from a starting angle — a hue wheel, a pie,
 *  a progress sweep. */
declare function conicGradient(cx: number, cy: number, angle: number, ...stops: (Color | { offset: number | null; color: Color })[]): Gradient;
/** Build a border: \`stroke = stroke(1, #B0B0B0)\`. Drawn inside the box, so it
 *  costs no layout. */
declare function stroke(width: number, color: Color): Stroke;
/** Build a ring drawn outside the box — what a focus silhouette wears. */
declare function outline(width: number, color: Color): Outline;
/** Place one gradient stop at an exact offset (0 to 1) instead of letting the
 *  colors spread evenly. */
declare function stop(offset: number, color: Color): { offset: number; color: Color };
/** Build a drop shadow — offset, blur, color. On \`shadow\` it falls from the box, on
 *  \`textShadow\` from the glyphs, and in a filter list it composes with the rest. */
declare function shadow(dx: number, dy: number, blur: number, color: Color): Shadow;
/** The frosted-glass backdrop: blur what lies beneath, and lift its saturation a
 *  little so color shows through rather than going grey. \`backdrop = frost(26, 1.5)\`. */
declare function frost(radius: number, saturation?: number): Backdrop;
/** Blur, by radius in the view's own units. \`filter = blur(4)\` blurs this view's
 *  paint; \`backdrop = blur(20)\` blurs what is behind it. */
declare function blur(radius: number): Filter;
/** Scale brightness — 1 is unchanged, 0 is black, above 1 lightens. */
declare function brightness(amount: number): Filter;
/** Scale contrast — 1 is unchanged, 0 is flat grey, above 1 hardens. */
declare function contrast(amount: number): Filter;
/** Scale saturation — 1 is unchanged, 0 is grey, above 1 intensifies. */
declare function saturate(amount: number): Filter;
/** Remove color, 0 to 1, where 1 is fully grey. */
declare function grayscale(amount: number): Filter;
/** Invert, 0 to 1, where 1 is a full negative. */
declare function invert(amount: number): Filter;
/** Warm toward sepia, 0 to 1. */
declare function sepia(amount: number): Filter;
/** Rotate every hue around the color wheel by an angle in degrees. */
declare function hueRotate(degrees: number): Filter;
/** Replace the paint's color while KEEPING its alpha — the one-mask-many-colors
 *  idiom: one bitmap or drawing, recolored per use. \`Image.tint\` is the shorthand
 *  for an image. */
declare function colorize(color: Color): Filter;
/** A translucent color in the runtime's own encoding: an \`0xRRGGBB\` and an alpha
 *  from 0 to 255 — the same byte an \`0xRRGGBBAA\` literal carries, which is what the
 *  compiler lowers that literal to. Returns an opaque \`0xRRGGBB\` at 255, so the common
 *  case stays a plain color. */
declare function colorWithAlpha(rgb: number, a: number): number;
/** The style of one run of text that has no view — a \`style\` bundle, or an inline
 *  record with the same fields. Each field is the \`Text\` attribute of that name;
 *  a field left out takes its plain default, never an inherited value. */
interface TextStyle {
  fontFamily?: string | Font | readonly (string | Font)[] | null; fontSize?: number; fontWeight?: FontWeight; italic?: boolean;
  letterSpacing?: number; lineHeight?: number; textColor?: Color | null; textShadow?: Shadow | null;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize"; smallCaps?: boolean;
  numerals?: "normal" | "lining" | "oldstyle"; numeralWidth?: "normal" | "tabular" | "proportional"; slashedZero?: boolean;
  textFill?: Fill | null; outline?: Outline | null; underline?: boolean; strike?: boolean;
}
/** The palette a \`<span class>\` names: style name → that style's fields. The KEYS
 *  are open — content chooses them — and the VALUES are closed, so a misspelled
 *  field is caught in the record form exactly as it is in a \`style\` bundle. This
 *  is the one record slot that can be narrowed without firing on correct code:
 *  only the value side has a declared shape. */
type TextStyles = Readonly<Record<string, TextStyle>>;
/** One block type's geometry in a rich-text flow: a measure to cap its width at
 *  (0 = the full track), a \`[left, right]\` margin, and how it sits in what is
 *  left. Every field is optional; what a block does not state it takes from the
 *  map's \`default\` entry, field by field. */
interface BlockGeometry { maxWidth?: number; margin?: readonly [number, number]; align?: "left" | "center" | "right" }
/** Per-BLOCK-TYPE geometry for a rich-text flow: block name → that block's
 *  \`BlockGeometry\`. The keys are the block types a document has — \`default\` for
 *  all of them, then \`code\`, \`p\`, \`h1\`, \`blockquote\` and the rest by name — so a
 *  reading measure with full-bleed code is two entries:
 *  \`richTextLayout = { { default: { maxWidth: 560 }, code: { maxWidth: 0 } } }\`.
 *  A \`pre\` with no entry of its own follows \`code\`. Keys open, values closed: a
 *  misspelled field is caught, a block type you invent is not. */
type RichTextLayout = Readonly<Record<string, BlockGeometry>>;
/** What measureText reports — a Text's own fact names. */
interface TextMeasure { readonly width: number; readonly height: number; readonly baseline: number; readonly capHeight: number; readonly lines: number }
/** Measure a run of text in a style, with the measurer and wrapping a \`Text\` uses —
 *  one line, or wrapped at \`width\`. Called in a constraint or a drawing, it re-runs
 *  when anything it measured with changes, a font's faces included. */
declare function measureText(text: string, style: TextStyle, width?: number): TextMeasure;
/** The \`TextStyle\` in force where you write this — the provided text face
 *  (\`textColor\`, \`fontSize\`, \`fontFamily\`, \`fontWeight\`, \`letterSpacing\`), each
 *  falling to the same default a \`Text\` would, with \`overrides\` replacing any of
 *  them. Hand it to \`measureText\` or a drawing's \`fillText\`/\`strokeText\` to
 *  measure or paint a run the way a \`Text\` here would render it. It is a property
 *  of the node, so a value body and that same view's \`draw()\` get the same
 *  record; a drawing's own \`font\` state is unrelated to it. */
declare function providedTextStyle(overrides?: TextStyle): TextStyle;
/** Make a value safe to CONCATENATE into rich-text content: \`&\`, \`<\`, \`>\`, \`"\` and
 *  \`'\` become entities, and nothing else changes. **Escape every interpolated value,
 *  never the markup you wrote** — the markup is how content names an inline view, so
 *  an unescaped \`<\` or \`'\` arriving from data does not merely read wrong, it closes
 *  an attribute or opens an element of its own. Content assembled in a \`{ }\` is the
 *  only place this matters; a literal document has nothing to escape.
 *  \`html = { "Assigned to <Person name='" + escapeHtml(app.me) + "'/>" }\` */
declare function escapeHtml(s: string): string;
/** A gradient built INSIDE a drawing, by \`d.createLinearGradient\` and its kin —
 *  the Canvas2D shape, stops added by call. The declarative \`Gradient\` is the one a
 *  \`fill\` slot takes; this one exists only for the duration of a recording. */
interface DrawGradient { addColorStop(offset: number, color: string | Color): void }
// what drawImage takes — any Image view (structural, so a subclass qualifies)
/** What \`d.drawImage\` accepts: any \`Image\` view, by its loading facts. Structural,
 *  so a subclass of \`Image\` qualifies — you hand over the node, not a URL, because
 *  the node is what knows whether the bytes have arrived. */
interface DrawImageSource { loaded: boolean; naturalWidth: number; naturalHeight: number }
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
  drawImage(image: DrawImageSource, dx: number, dy: number): void;
  drawImage(image: DrawImageSource, dx: number, dy: number, dw: number, dh: number): void;
  drawImage(image: DrawImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw?: boolean): void;
  fill(rule?: string): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  fillText(text: string, x: number, y: number, style: TextStyle, maxWidth?: number): void;
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
  strokeText(text: string, x: number, y: number, style: TextStyle, maxWidth?: number): void;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  translate(x: number, y: number): void;
}
/** One finger in a multi-finger gesture: a stable id for its lifetime, and a
 *  point. The id is what lets you follow the same finger across moves. */
interface Touch { id: number; x: number; y: number }
/** One value that ended a settle different from where it started — its name, and
 *  what it was and is. The unit \`onChange\` reports. */
interface ValueChange { readonly name: string; readonly previousValue: any; readonly currentValue: any }
/** What \`onChange\` receives: every value this node named in \`trackChanges\` that
 *  ended the settle different, in list order, once per settle. */
interface ChangeEvent { readonly changed: readonly ValueChange[] }
/** A pointer's position. The raw handlers carry root-space points for a drag,
 *  since a drag needs a frame that does not move with the dragged thing; \`onClick\`
 *  and \`onPointerDown\` carry view-local ones. */
interface PointerEvent { x: number; y: number }
/** A release, plus the one fact a drag handler must not miss: \`canceled\` is true
 *  when the browser reclaimed the gesture — a touch that became a scroll. Commit on
 *  release only when it is false, or an interruption reads as a drop. */
interface PointerUpEvent extends PointerEvent { canceled: boolean }
/** The multi-finger stream: every finger down (\`touches\`) and the ones this event
 *  moved (\`changed\`). Declaring a touch handler claims every finger, so the app then
 *  owes its own zoom. */
interface TouchEvent extends PointerEvent { touches: readonly Touch[]; changed: readonly Touch[] }
/** A wheel or trackpad scroll, by axis. A trackpad PINCH arrives here too, with
 *  \`pinch\` true — the browser reports it as a wheel event with a modifier, and
 *  hiding that would make a zoom impossible to write. */
interface WheelEvent extends PointerEvent { deltaX: number; deltaY: number; pinch: boolean }
/** A resolved two-finger zoom: the accumulated \`scale\` and the \`center\` it
 *  pivots about, so the view can zoom about the point the fingers chose. */
interface PinchEvent extends PointerEvent { scale: number; center: { readonly x: number; readonly y: number } }
/** A key, both ways: \`code\` is the physical key regardless of layout (what a
 *  shortcut wants), \`key\` is the character it produced (what typing wants). Plus the
 *  four modifiers and whether the key is repeating. */
interface KeyEvent { code: string; key: string; shift: boolean; ctrl: boolean; alt: boolean; meta: boolean; repeat: boolean }
/** Where the focus indicator should be, and where it came from — the rect and
 *  radius to draw, the view and root it belongs to, the scroller it sits in, and the
 *  \`home…\` fields it is travelling from. What a custom focus ring reads to animate. */
interface FocusGeometry { x: number; y: number; w: number; h: number; rad: number; view: View; root: View; scroller: View; homeX: number; homeY: number; homeW: number; homeH: number; homeRad: number }
/** A tooltip's request: the text, and the rect of the view asking, so a custom
 *  tip can place itself against the thing it describes. */
interface TipEvent { readonly text: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly root: View }
/** One message from an \`EventStream\` or \`Socket\`: its payload, its type, and its
 *  id. \`onMessage\` receives it, and \`last\` holds the most recent. */
interface StreamMessage { readonly data: string; readonly type: string; readonly id: string }
/** An easing curve, built by \`cubicBezier\`, \`back\`, \`steps\` or \`laszlo\` — what an
 *  \`Animator\`'s \`curve\` takes, alongside the named tokens. Opaque by design: a curve
 *  is a value you pass, not a shape you inspect. */
type MotionCurve = { readonly __motion: true };
/** An easing curve from two control points, the CSS \`cubic-bezier\` form — so a
 *  curve copied from a design tool or a stylesheet transfers unchanged. */
declare function cubicBezier(x1: number, y1: number, x2: number, y2: number): MotionCurve;
/** An easing curve that overshoots its destination and settles back. The argument
 *  is how far past it goes. */
declare function back(overshoot: number): MotionCurve;
/** A stepped curve: \`n\` discrete jumps rather than a continuous ease — a ticking
 *  counter, a sprite flip. \`jump\` chooses whether the first or last step is taken at
 *  the ends. */
declare function steps(n: number, jump?: "jumpStart" | "jumpEnd"): MotionCurve;
/** An easing curve in OpenLaszlo's pole form: a begin and end pole rather than two
 *  control points. The same family of shapes as \`cubicBezier\`, reached the way the
 *  animations it came from were written. */
declare function laszlo(beginPole: number, endPole: number): MotionCurve;
/** The running program, readable — what the Inspector is built on: the node rows
 *  with their kinds and constraint state, and whether the service is up. Dev tooling;
 *  a production build ships a stub unless you ask for it. */
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
declare const console: { log(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void };
/* The network and URL globals a handler reaches for. The checker deliberately
 * loads no DOM lib (its Text / Image would collide with the components), so
 * these are declared by hand — the narrow, honest shape each actually has in
 * every host Declare runs in. Three agents in one session wrote
 * \`(globalThis as any).fetch\` because the checker said fetch was not in
 * scope (field report 2026-08-21); it is. */
interface Headers { get(name: string): string | null; has(name: string): boolean; forEach(fn: (value: string, key: string) => void): void }
interface AbortSignal { readonly aborted: boolean; addEventListener(type: "abort", fn: () => void): void }
declare class AbortController { readonly signal: AbortSignal; abort(reason?: unknown): void }
interface RequestInit { method?: string; headers?: Record<string, string> | [string, string][]; body?: string | FormData | Blob | ArrayBuffer | null; credentials?: "omit" | "same-origin" | "include"; mode?: "cors" | "no-cors" | "same-origin"; cache?: string; redirect?: "follow" | "error" | "manual"; signal?: AbortSignal | null; keepalive?: boolean }
interface Response { readonly ok: boolean; readonly status: number; readonly statusText: string; readonly url: string; readonly headers: Headers; readonly bodyUsed: boolean; json(): Promise<any>; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>; blob(): Promise<Blob>; clone(): Response }
interface Blob { readonly size: number; readonly type: string; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }
interface FormData { append(name: string, value: string | Blob, fileName?: string): void; get(name: string): string | Blob | null; has(name: string): boolean }
declare function fetch(input: string | URL, init?: RequestInit): Promise<Response>;
declare class URLSearchParams { constructor(init?: string | Record<string, string> | [string, string][]); get(name: string): string | null; getAll(name: string): string[]; has(name: string): boolean; set(name: string, value: string): void; append(name: string, value: string): void; delete(name: string): void; forEach(fn: (value: string, key: string) => void): void; toString(): string }
declare class URL { constructor(url: string | URL, base?: string | URL); href: string; readonly origin: string; protocol: string; host: string; hostname: string; port: string; pathname: string; search: string; hash: string; readonly searchParams: URLSearchParams; toString(): string }
declare function queueMicrotask(fn: () => void): void;
declare function structuredClone<T>(value: T): T;
declare function encodeURIComponent(s: string | number | boolean): string;
declare function decodeURIComponent(s: string): string;
declare function encodeURI(s: string): string;
declare function decodeURI(s: string): string;`;
/** Every name the PRELUDE declares — the resolver's second tier of "known
 *  global" (compile.ts isKnownGlobal). Read off the prelude text itself, so
 *  a name declared here is admitted there and nowhere else: the prelude is
 *  the law, and the two layers cannot disagree again (they did, for `fetch`:
 *  admitted by the resolver, refused by the checker — field report
 *  2026-08-21). */
export const PRELUDE_NAMES = new Set([...PRELUDE.matchAll(/^(?:declare\s+)?(?:interface|type|function|const|var|let|class|enum|namespace)\s+([A-Za-z]\w*)/gm)].map((m) => m[1]));
/** The HOST's surface, not the language's. These are declared in the prelude so a
 *  handler typechecks against the real shape each has in every host Declare runs
 *  in — the checker loads no DOM lib, because its `Text`/`Image` would collide
 *  with the components. They are documented as a POLICY (what a body may reach
 *  for, and why script is the place for the rest), never name by name: Declare
 *  does not own `fetch`, and restating MDN here would go stale.
 *
 *  The doc gate requires prose for every shared prelude name EXCEPT these, which
 *  is what makes a NEW language-owned name fail the gate instead of shipping
 *  undocumented. Add a name here only when the host owns it. */
export const HOST_GLOBALS = new Set([
    "setTimeout", "clearTimeout", "setInterval", "clearInterval", "console",
    "queueMicrotask", "structuredClone",
    "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
    "fetch", "Headers", "RequestInit", "Response", "Blob", "FormData",
    "AbortSignal", "AbortController", "URL", "URLSearchParams",
]);
/** Record types the PRELUDE already gives a shape. A record-typed attribute
 *  whose name is here is NOT given the generated open alias below — it has a
 *  real declaration, and a second one is a duplicate identifier. Add a name here
 *  when you write its shape into the prelude, and only then. */
const PRELUDE_RECORDS = new Set(["Theme", "TextStyles", "RichTextLayout"]);
/** One AttrType (value.ts) → its TypeScript type, mirroring the value model.
 *  Enum and record arms reference a NAMED type (`type Stretch = …`, `Theme`)
 *  emitted in the prelude / near-use; component references the peer
 *  `declare class`. The nullable decoration slots (stroke/shadow) and the two
 *  styling channels carry their `| null` here, matching what coercion admits. */
export function tsType(t) {
    switch (t.kind) {
        case "length": return "Length";
        case "radius": return "Radius";
        case "number": return "number";
        case "boolean": return "boolean";
        case "string": return "string";
        case "color": return "Color";
        case "shape": return "Shape";
        case "dataschema": return "any"; // the parsed shape declarations — data, not a body-facing type
        // An AUTHORED literal union (`"idle" | "loading"`) carries the union TEXT
        // as its name and is already TypeScript, so it emits inline and needs no
        // alias; a built-in vocabulary (Axis, Motion) references the emitted
        // `type <Name> = …` alias. Both are `t.name` — the difference is whether
        // an alias is generated for it (see generateScaffold's `enums`).
        case "enum": return t.name;
        case "component": return `${t.of} | null`; // the only literal is `null` for "none"
        case "fn": return `(${t.written.replace(/->/g, "=>")}) | null`; // a callback slot; `null` = none
        case "cursor": return "Cursor"; // reads see the place; writes are widened in memberSig
        case "slotref": return "string"; // a bare slot name, a string at runtime
        case "record": return t.data === true ? `${t.name} | null` : t.name; // data record (schema-typed, nullable like a component slot) / Theme-class token record
        case "fill": return "Fill";
        case "stroke": return "Stroke | null";
        case "outline": return "Outline | null";
        case "shadow": return "Shadow | null";
        case "filter": return "Filter | readonly Filter[] | null";
        case "mask": return "Gradient | View | null";
        case "motion": return "Motion"; // the token union + MotionCurve brand (prelude)
        case "font": return "string | Font | readonly (string | Font)[] | null"; // a family string, a Font object, or a fallback list of them
        case "faceSource": return "string | readonly string[]";
        case "faceWeight": return "FontWeight | readonly [number, number]";
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
export function signatureTsType(written, isComponent, nullable = false) {
    const nul = (t) => (nullable ? `${t} | null` : t);
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
    // a literal union is already TypeScript — pass it through
    if (isAuthoredUnion(written))
        return nul(written);
    if (PAYLOAD_TYPES.has(written))
        return nul(written); // `onPointerUp(e: PointerUpEvent)`
    const t = declaredType(written);
    if (t !== null)
        return nul(t.kind === "view" ? "View" : t.kind === "component" ? t.of : tsType(t));
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
function methodSig(m, isComponent) {
    const params = m.params.map((p, i) => {
        const ts = p.type === undefined ? null : signatureTsType(p.type, isComponent, p.nullable === true);
        // `?` means MAY BE ABSENT — omittable as well as null, matching TypeScript's
        // own `?:` and how the corpus already guards (`if (selKey != null) …`). An
        // UNTYPED parameter is likewise omittable (no declared contract to keep).
        // Either can only actually BE optional when nothing REQUIRED follows, which
        // is TypeScript's own rule (TS1016) — otherwise it stays required.
        const required = (q) => q.type !== undefined && q.nullable !== true;
        const omittable = !required(p) && !m.params.slice(i + 1).some(required);
        if (ts === null)
            return `${p.name}${omittable ? "?" : ""}: any`;
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
export const LANGUAGE_STATICS = {
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
export const LANGUAGE_API = {
    // The cursor READ, on Node rather than View (2026-09-14): a `:path` island
    // lowers to `this.$data(…)`, and the things that read data are often not
    // views — a Spring's target, a Time's gate, a DataSource's url. The read
    // climbs to the nearest view that has a cursor; the WRITE half ($setData)
    // stays on View, because an edit into a record belongs to the leaf that owns
    // the edit. Data-shaped → `any`, the same deliberate under-report as
    // Dataset.value.
    Node: [
        `  $data(path: string | readonly (string | { i: number } | { s: (number | null)[] } | { w: number })[]): any;`,
    ],
    // The App's navigation SERVICE ACTION (view.ts App.navigate, capabilities.md
    // §6): a link/button calls `app.navigate(url)` in an activation handler. A
    // method, not an attribute — `app.navigate = url` is a type error now, which
    // is the migration signal, and the extractor reads the CALL (links.ts).
    App: [
        `  navigate(to: string): void;`,
        `  openWindow(to: string): void;`,
        // the island bridge's tenant-side verb (islands design): this app → its
        // host island's onPost. Meaningful only when embedded and linked.
        `  post(topic: string, payload?: unknown): void;`,
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
        `  $setData(path: string | readonly string[], v: any): void;`,
        `  scrollIntoView(align?: "start" | "nearest", smooth?: boolean): void;`,
        // The scroll-offset REQUEST verbs (platform-authorship.md): the platform
        // clamps to the real range (Infinity = the far end) and holds a request a
        // hidden surface cannot take yet, applying it on show. `scrollY`/`scrollX`
        // are the FACTS (read-only). The optional glide is the PLATFORM's own
        // motion — the browser's smooth scroll, an NSAnimationContext, the runtime
        // provider's tween — not a Declare Animator: the provider's curve, no
        // Animator semantics, cancelled by a gesture in flight (ruled 2026-09-10).
        `  scrollTo(y: number, glide?: { duration?: number; motion?: string }): void;`,
        `  scrollToX(x: number, glide?: { duration?: number; motion?: string }): void;`,
        `  scrollBy(dx: number, dy: number, glide?: { duration?: number; motion?: string }): void;`,
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
        // the composed similarity to root-frame space — the method tier's exact
        // transform (the visibility FACTS are its coarse at-rest companions)
        `  rootTransform(): { x: number; y: number; scale: number; rotation: number };`,
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
    // the island bridge's host-side verb: this island → its linked tenant's
    // onPost. The state channel is the instance's `external` declarations.
    DOMIsland: [`  post(topic: string, payload?: unknown): void;`],
    // The edit-session VERBS (editor.ts): `dirty`/`valid`/`error` are schema
    // attrs (readable state), but committing/reverting the draft are calls.
    Editor: [`  commit(): void;`, `  revert(): void;`],
    // The selection write half (#22): one verb — a caret is a zero-length range.
    // "start" / "end" / "all" are the word forms; numbers clamp; `end` omitted
    // means a caret at `at`.
    TextInput: [`  select(at: number | "start" | "end" | "all", end?: number): void;`],
    // The State verbs (state.ts): drive `applied` imperatively — legal only on
    // an UNGATED state (gate XOR verbs; a gated state throws with the rule named).
    // Implemented and advertised since the start; unreachable from source until
    // 2026-07-28 because this table simply lacked the entry.
    State: [`  apply(): void;`, `  remove(): void;`, `  toggle(): void;`],
    // viewExtent: the alignment BAND — the arranged view's own extent on an
    // axis, or 0 when that extent is measured from the laid children (layout.ts).
    Layout: [`  view: View;`, `  laid(): View[];`, `  refuseBaseline(child: View): void;`, `  refuseStackBaseline(): void;`, `  viewExtent(size: "width" | "height"): number;`], // view: runtime `View | null`, non-null by the time any body runs
    TweenLayout: [`  laid(): View[];`, `  retarget(animate: boolean): void;`],
};
/** One attribute member. A length-typed slot is the read/write ASYMMETRY the
 *  runtime actually has: a body may WRITE `number | Percent` (the slot accepts
 *  both), but a READ always sees the RESOLVED pixel number (the constraint
 *  system resolves a percent against the parent before any body runs — which
 *  is why `parent.width - 8` is the corpus-wide idiom and works). Model it as
 *  divergent accessors: `get(): number; set(v: Length)`. Symmetric kinds stay
 *  plain members. */
export function memberSig(name, t, nonNullColor = false, readOnly = false) {
    // A schema `readOnly` slot is computed — a constraint READS it, nothing sets
    // it. checkAttr already refuses `hovered = true` written as an attribute, but
    // an assignment inside a `{ }` body is TypeScript's to catch, and it could not
    // while this emitted a plain mutable member: `onClick() { this.hovered = true }`
    // typechecked clean. The two halves of one rule now agree.
    if (readOnly) {
        // a length's divergent get/set collapses to the getter — there is no setter
        if (t.kind === "length")
            return [`  readonly ${name}: number;`];
        if (t.kind === "color" && nonNullColor)
            return [`  readonly ${name}: number;`];
        return [`  readonly ${name}: ${tsType(t)};`];
    }
    if (t.kind === "length")
        return [`  get ${name}(): number;`, `  set ${name}(v: Length);`];
    // A cursor slot ACCEPTS a place-bearing VALUE too — `datapath = { d.value.rec }`
    // hands the machinery a container it turns back into a place (toCursor), and
    // a typed dataset value (typed data: `Doc | null`) must stay assignable
    // exactly as the untyped `any` always was. Reads keep seeing the Cursor.
    // `object` admits every container and refuses primitives — toCursor's rule.
    if (t.kind === "cursor")
        return [`  get ${name}(): Cursor;`, `  set ${name}(v: Cursor | object | null);`];
    // A color declared with a concrete (non-null) default is a plain color —
    // reads never see null — so it is typed non-null. A `= null` (or absent)
    // default keeps Color's nullability: the inherit / "no paint" slots.
    if (t.kind === "color" && nonNullColor)
        return [`  ${name}: number;`];
    return [`  ${name}: ${tsType(t)};`];
}
/** One schema → its `declare class`. Attributes come first (in schema order),
 *  then — on View alone — the view-tree noun members (every View-derived class
 *  inherits them via `extends`), then a user class's declared methods. Absent
 *  base (View / Layout / Dataset / Animator / AnimatorGroup roots) → no
 *  `extends`; an empty class → `{}`. */
function emitClass(s, decl, rootType, extras, isComponent) {
    const ext = s.base !== null ? ` extends ${s.base.name}` : "";
    const lines = [];
    // A color slot is non-null unless it means inherit/absent — i.e. unless its
    // default is `= null` (or it has none). So a concretely-defaulted user color
    // reads as a plain color, never "possibly null", in every constraint.
    const nonNullColors = new Set();
    if (decl !== undefined) {
        for (const d of decl.body.decls) {
            if (d.def !== null && !(d.def.kind === "ident" && d.def.name === "null"))
                nonNullColors.add(d.name);
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
        lines.push(`  readonly children: View[];`); // on the ROOT (Node) — every node has children
        // The provided-value read (language §9). `provided("name"[, default])`
        // compiles to `this.$provided(…)`; it returns `any` — a non-local read the
        // checker provably can't type — so static typing comes from binding it into
        // a typed slot (`t: Theme = provided("theme", …)`), never from the call.
        lines.push(`  $provided(name: string, dflt?: any): any;`);
        // `providedTextStyle(overrides?)` → `this.$providedTextStyle(…)`. Unlike
        // `$provided` this one IS typed: its shape is known (the provided face as a
        // `TextStyle`), so a misspelled override field is caught at the call.
        lines.push(`  $providedTextStyle(overrides?: TextStyle): TextStyle;`);
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
    if (api !== undefined)
        lines.push(...api);
    const statics = LANGUAGE_STATICS[s.name];
    if (statics !== undefined)
        lines.push(...statics);
    if (decl !== undefined)
        for (const m of decl.body.methods)
            lines.push(methodSig(m, isComponent));
    // Instance members the EMITTER computed from the class BODY (its named
    // children, typed by their instance types) — on the class itself, so a
    // cross-reference through the class NAME (`section.area`) sees them too.
    if (extras !== undefined)
        lines.push(...extras);
    const cls = lines.length === 0
        ? `declare class ${s.name}${ext} {}`
        : `declare class ${s.name}${ext} {\n${lines.join("\n")}\n}`;
    // A built-in's PLUMBING — its runtime methods the reference documents no
    // contract for (runtimePlumbing) — typed loosely on a companion interface
    // that only `$base` is intersected with (typecheck.ts). An override's
    // `super.maybeAuto()` then typechecks, since the override rule is uniform;
    // a plain body's `this.maybeAuto()` still does not, since the class itself
    // never advertises the name.
    if (decl !== undefined || !Object.hasOwn(SCHEMAS, s.name))
        return cls;
    const plumbing = [...runtimePlumbing(s.name)].map((n) => `  ${n}(...args: any[]): any;`);
    return `${cls}\ninterface ${s.name}$plumbing {${plumbing.length === 0 ? "" : `\n${plumbing.join("\n")}\n`}}`;
}
/** The names a built-in schema's runtime class implements as methods that the
 *  reference does NOT document as its callable surface — runtime plumbing
 *  (`DataSource.maybeAuto`, `Animator.tick`, `View.attach`). Overriding one is
 *  legal (a method is a method) and warned (Diag.overridesPlumbing): the
 *  runtime calls it on its own schedule, and the reference states no contract.
 *  Documented = named in LANGUAGE_API up the schema chain, or in
 *  PROSE_DOCUMENTED; test/override-runtime.test.mjs pins this set against the
 *  doc model's own api/structural split, member by member. */
export function runtimePlumbing(schema) {
    let set = PLUMBING.get(schema);
    if (set === undefined) {
        const documented = new Set();
        for (let s = Object.hasOwn(SCHEMAS, schema) ? SCHEMAS[schema] : null; s !== null; s = s.base) {
            for (const line of LANGUAGE_API[s.name] ?? []) {
                const m = line.trim().match(/^([A-Za-z_$][\w$]*)\s*[<(]/);
                if (m !== null)
                    documented.add(m[1]);
            }
            for (const n of PROSE_DOCUMENTED[s.name] ?? [])
                documented.add(n);
        }
        set = new Set([...runtimeMethodsOf(schema)].filter((n) => !documented.has(n)));
        PLUMBING.set(schema, set);
    }
    return set;
}
const PLUMBING = new Map();
/** Runtime methods the reference documents in PROSE alone — a `## name()`
 *  section in tools/internal/doc/prose/<Class>.md with no LANGUAGE_API line
 *  (a user layout's `attachTo`/`rearm` are protocol the strategy overrides,
 *  not verbs a body calls, so the check block never lists them). */
const PROSE_DOCUMENTED = {
    Layout: ["attachTo", "rearm"],
};
/** Generate the scaffold for a program: the fixed prelude, the enum type
 *  aliases every schema references, and one `declare class` per schema (built-in
 *  + user), base-before-derived. Pure — the returned STRING is the whole
 *  product. `schemas` is `programSchemas(program.classes).schemas`; `classDecls`
 *  is `program.classes` (their methods). */
export function generateScaffold(schemas, classDecls, rootType = "App", classExtras, 
/** Written signature type names from INLINE elements too (the caller walks
 *  the whole tree; `classDecls` covers only `class` bodies). Enum/record
 *  aliases are collected from these as well as from attributes. */
extraSignatureTypes = [], 
/** The program's `schema Name [ … ]` declarations (typed data) — each
 *  projects as an ambient `interface Name`, which is what makes the name
 *  real in every { } body, method signature, and script function. */
shapes = [], 
/** The program's `theme Name [ … ]` declarations — each projects as an
 *  ambient `declare const Name: Theme`, so a body can name it. */
themeNames = [], 
/** The program's `style Name [ … ]` bundles — each a value in body scope, like a
 *  theme, typed EXACTLY by the fields it sets (so `Caption.fontSize` is a number,
 *  not `number | undefined`), which is still a `TextStyle`. */
styles = []) {
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
            if (t.kind === "enum" && !isAuthoredUnion(t.name) && !enums.has(t.name))
                enums.set(t.name, { tokens: t.tokens, numeric: t.numeric !== undefined });
    }
    // …and from METHOD SIGNATURE types. An enum (or record) named ONLY by a
    // signature — `f(a: Axis)` in a program whose attributes never mention Axis —
    // still needs its alias emitted, or the scaffold references an undeclared
    // type and every body reports a bogus "nothing in scope is named 'Axis'".
    const sigTypes = [];
    for (const d of classDecls) {
        for (const m of d.body.methods) {
            for (const prm of m.params)
                if (prm.type !== undefined)
                    sigTypes.push(prm.type);
            if (m.returns !== undefined)
                sigTypes.push(m.returns);
        }
    }
    sigTypes.push(...extraSignatureTypes);
    for (const name of sigTypes) {
        const t = declaredType(name);
        if (t !== null && t.kind === "enum" && !isAuthoredUnion(t.name) && !enums.has(t.name))
            enums.set(t.name, { tokens: t.tokens, numeric: t.numeric !== undefined });
    }
    const enumLines = [...enums].map(([name, e]) => `type ${name} = ${e.tokens.map((t) => JSON.stringify(t)).join(" | ")}${e.numeric ? " | number" : ""};`);
    // Record aliases: every record-typed attribute references a NAMED open record.
    // A record the PRELUDE already declares is skipped — it has a real shape there
    // and a second alias here would be a duplicate identifier. Everything else gets
    // its own open alias emitted, so a new record-typed slot needs no prelude edit.
    // `any`, not `unknown` — the same deliberate under-report as Theme (prelude).
    const records = new Set();
    for (const s of all.values()) {
        for (const t of Object.values(s.attrs))
            if (t.kind === "record" && !PRELUDE_RECORDS.has(t.name))
                records.add(t.name);
    }
    for (const name of sigTypes) {
        const t = declaredType(name);
        if (t !== null && t.kind === "record" && !PRELUDE_RECORDS.has(t.name))
            records.add(t.name);
    }
    // …EXCEPT names that are declared schemas: those get real interfaces below,
    // never the open-record alias (`sel: Task` must check against Task's fields).
    const shapeNameSet = new Set(shapes.map((d) => d.name));
    const recordLines = [...records].filter((n) => !shapeNameSet.has(n)).map((name) => `type ${name} = Readonly<Record<string, any>>;`);
    // The schema interfaces (typed data): ONE declaration serves both halves —
    // the runtime validates data against it, and this projection is the exact
    // same shape as a TS type. The schema grammar is the proper subset of the
    // type system that can be checked against data while the program runs.
    const shapeLines = shapes.map((d) => `interface ${d.name} ${shapeObjectText(d.fields)}`);
    // Methods ride the user class declaration, keyed by class name.
    const declOf = new Map();
    for (const d of classDecls)
        declOf.set(d.name, d);
    // Base-before-derived: a stable sort by chain depth (roots at 0). Ambient
    // declarations hoist, so this is for readability, not resolution.
    const depth = (s) => (s.base === null ? 0 : 1 + depth(s.base));
    // Signature types may name a schema too (`advance(t: Task)`) — the widened
    // predicate lets the written name pass through to the interface above.
    const classes = [...all.values()].sort((a, b) => depth(a) - depth(b)).map((s) => emitClass(s, declOf.get(s.name), rootType, classExtras?.get(s.name), (n) => all.has(n) || shapeNameSet.has(n)));
    // tag name → instance class, for createView's literal-tag overload (View's
    // LANGUAGE_API). Every schema, built-in and user, under its instantiable name.
    const tagLines = ["interface DeclareTags {", ...[...all.keys()].map((n) => `  ${JSON.stringify(n)}: ${n};`), "}"];
    // The Motion union — named tokens (generated from animate.ts, single source
    // of truth) plus the MotionCurve brand the constructors in the prelude return.
    const motionLine = `type Motion = ${MOTION_TOKENS.map((t) => JSON.stringify(t)).join(" | ")} | MotionCurve;`;
    // The theme names in scope as `Theme` values: the built-in presets plus any
    // the program declares — a body names one (`theme = { app.dark ? … : … }`).
    const themeLine = [...new Set([...THEME_PRESET_NAMES, ...themeNames])].map((n) => `declare const ${n}: Theme;`).join("\n")
        + styles.map((s) => {
            const textAttr = (name) => {
                for (let sc = schemas["Text"]; sc; sc = sc.base)
                    if (Object.hasOwn(sc.attrs, name))
                        return sc.attrs[name];
                return null;
            };
            // A bundle's literal family is a string (a Font is an object in the tree).
            const fields = s.fields.map((f) => { const t = textAttr(f); return `readonly ${f}: ${t === null ? "any" : t.kind === "font" ? "string" : tsType(t)}`; });
            return `\ndeclare const ${s.name}: { ${fields.join("; ")} };`;
        }).join("");
    return [PRELUDE, enumLines.join("\n"), recordLines.join("\n"), shapeLines.join("\n"), motionLine, themeLine, tagLines.join("\n"), classes.join("\n\n")].filter((x) => x.length > 0).join("\n\n") + "\n";
}
/** A shape's TS object-type text — `{ id: string; n?: number; owner: Person;
 *  status: "open" | "closed"; steps: { a: string }[] }`. A named ref prints
 *  its NAME (the interface is emitted beside it); an inline nested shape
 *  prints structurally. `any` stays `any` — the deliberate under-report a
 *  declared escape hatch asks for. */
export function shapeFieldTsType(f) {
    const base = f.ref !== undefined ? f.ref
        : f.fields !== undefined ? shapeObjectText(f.fields)
            : f.tokens !== undefined ? f.tokens.map((t) => JSON.stringify(t)).join(" | ")
                : (f.type ?? "any");
    return f.array ? `${base}[]` : base;
}
export function shapeObjectText(fields) {
    return `{ ${fields.map((f) => `${f.name}${f.optional ? "?" : ""}: ${shapeFieldTsType(f)}`).join("; ")} }`;
}
//# sourceMappingURL=scaffold.js.map