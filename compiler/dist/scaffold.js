// scaffold — the typed-scaffolding generator: the FIRST slice of Declare's
// compile-time typechecker. APPROACH §5 commits the compiler to hand `{ }`
// bodies and typechecking to the TypeScript compiler API *as a library* — it
// does not reimplement TypeScript, and "typechecking largely falls out given
// the right typed scaffolding." This module builds that scaffolding: it turns
// the class schemas (schema.ts) + the value vocabulary (value.ts) into an
// ambient TypeScript surface — a source STRING of `type`/`declare` shapes —
// against which stock tsc can check a resolved `{ }` body.
//
// A pure function: `generateScaffold(schemas, classDecls)` reads the program's
// schema registry (built-ins + user classes, exactly the table
// `programSchemas` returns) plus the class declarations (for their methods),
// and returns the scaffold text. No side effects, no I/O — the STRING is the
// whole product, so the same generator serves the Node compile and the
// in-browser path. The typecheck phase (typecheck.ts) appends a check-block per
// `{ }` body to this scaffold and maps tsc's diagnostics back to Declare
// positions.
//
// Two parts, mirroring the two lexical homes of a value:
//
//   1. A fixed PRELUDE — the closed value vocabulary of value.ts as TS types,
//      plus the value-constructor signatures (gradient/stroke/colorStop/shadow) a
//      body may call. This is the single source of the AttrType → TS mapping;
//      it mirrors value.ts's runtime types exactly.
//
//   2. One `declare class` per schema — built-ins and user classes — with each
//      attribute typed through the AttrType → TS map, the base wired via
//      `extends`, and (for user classes) the declared methods. The view-tree
//      nouns (language §11: parent / classroot / $root / children) live on View
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
// the `return (…)` and the outer slot annotation.
//
// ── What tsc does not type ───────────────────────────────────────────────────
//
// A `:path` read lowers to `this.$data([…])`, which this scaffold types `any`. Where a
// schema declares the data, the type check gives each body's `this` a signature per path
// it reads (schema-check.ts pathReadTypes), so the read has its field's type; data of no
// declared shape stays `any`.
//
// Compile-layer only: nothing in the zero-dependency runtime graph imports this
// (the same posture as compile.ts / free-idents). Its two VALUE imports —
// MOTION_TOKENS and declaredType — read the runtime's own vocabulary tables so
// the scaffold cannot drift from them; everything else is `import type`.
import { MOTION_TOKENS } from "../../runtime/dist/easing.js";
import { isAuthoredUnion } from "../../runtime/dist/value.js";
import { declaredType } from "../../runtime/dist/value.js";
import { EVENT_PAYLOAD, handlerName } from "../../runtime/dist/schema.js";
import { THEME_PRESET_NAMES } from "../../runtime/dist/themes.js";
import { THEME_RECORDS, ThemeDefaults } from "../../runtime/dist/themes-data.js";
import { runtimeMethodsOf } from "../../runtime/dist/runtime-methods.js";
import { CSS_COLORS } from "../../runtime/dist/css-colors.js";
/** The fixed value-type prelude — the closed vocabulary of value.ts as TS
 *  types, plus the value constructors in scope for every body. Mirrors
 *  value.ts's runtime shapes exactly (Length/Color/Fill/Stroke/Shadow/
 *  Percent/Gradient and the gradient/stroke/colorStop/shadow constructors). `DataCursor`
 *  is the deferred schema-typed-`:path` placeholder (see the header). `Theme`
 *  (and every record-typed slot) is DELIBERATELY `Record<string, any>`, not
 *  `unknown`: a record's keys are open by design (no schema construct yet), so
 *  `unknown` would make every read of a correct program a type error — and a
 *  check that fires on correct code is the cardinal sin (diagnostics.md §4 /
 *  verify-and-evals.md). `any` under-reports instead; schema-typed records
 *  close the hole when the `schema` construct lands. */
const PRELUDE = `/** What a geometry slot takes: a number in the view's own units, or a percent of
 *  the parent on that axis (\`width = 50%\`), resolved against the parent reactively,
 *  so a percent is a live relationship and not a number computed once. There is no
 *  unit vocabulary — no px, em or rem — because there is one coordinate space and
 *  the renderer owns the device pixels. */
type Length = number | { percent: number };
/** A corner rounding: one number for all four corners, or
 *  \`[topLeft, topRight, bottomRight, bottomLeft]\` to round only some. */
type Radius = number | readonly [number, number, number, number];
/** A room-inside: one number insets all four sides, or
 *  \`[top, right, bottom, left]\` to inset only some. The same literal shape as a
 *  \`Radius\` and a different meaning — a radius rounds corners and counts from the
 *  top-LEFT, an inset holds edges away and counts from the TOP. */
type Inset = number | readonly [number, number, number, number];
/** A color: \`0xRRGGBB\`, or a string of the CSS spelling — \`"#RRGGBB"\`,
 *  \`"#RRGGBBAA"\` or a CSS name (\`"royalblue"\`). A color with alpha is held in the
 *  runtime's own encoding (see \`Color.withAlpha\`). \`null\` means NO color — an
 *  unfilled view, an unstroked box — which is why it is part of the type rather than a
 *  sentinel. However it is written, a color read back is its number. */
type Color = number | \`#\${string}\` | ColorName | null;
/** The CSS color names. */
type ColorName = ${Object.keys(CSS_COLORS).map((n) => JSON.stringify(n)).join(" | ")};
/** A clip path, as the \`clip\` slot takes it: an SVG path string in the view's own
 *  coordinates, or \`null\` for the plain rectangle. \`clip = true\` is the box; a shape
 *  is for everything else. */
type ClipPath = string | null;
/** A gradient value, as \`gradient\`, \`radialGradient\` and \`conicGradient\` build it.
 *  Any \`Fill\` slot takes one, and a drawing can too. Write it through a constructor
 *  rather than by hand: the shape is published so a program can read one back. */
interface Gradient { kind?: "linear" | "radial" | "conic"; angle: number; cx?: number; cy?: number; r?: number; stops: readonly { offset: number | null; color: Color }[] }
/** What a fill slot holds: a flat color, or a gradient. \`null\` is no fill at all. */
type Fill = Color | Gradient;
/** A border, built by \`stroke(width, color)\`. It is drawn INSIDE the box, so a
 *  stroke never changes a view's size — there is no \`borderWidth\` to add to a layout.
 *  On \`Text.textStroke\` the same value strokes the GLYPHS' edges, under their fill:
 *  a filled letter shows a thin ring and an unfilled one reads hollow. */
interface Stroke { width: number; color: Color }
/** What the \`stroke\` slot holds: ONE Stroke on all four sides, or four —
 *  \`[top, right, bottom, left]\`, clockwise from the top, \`null\` for a bare side.
 *  The one-or-four shape is the house pattern for anything said per side (see
 *  \`Radius\`), and the slot reads back what was written, so a body that reaches
 *  into a stroke asks which form it has first: \`Array.isArray(v.stroke)\`, or
 *  \`v.stroke && "width" in v.stroke\`. \`null\` is no border at all. */
type BoxStroke = Stroke | readonly [Stroke | null, Stroke | null, Stroke | null, Stroke | null] | null;
/** A drop shadow, built by \`Shadow(dx, dy, blur, color)\`. It is also a \`VisualFilter\`, so
 *  it composes in a filter list; on \`textShadow\` it shadows the glyphs. */
interface Shadow { fn: "shadow"; dx: number; dy: number; blur: number; color: Color }
/** A visual filter: a blur, one of the amount filters, a hue rotation, a colorize, or
 *  a shadow, built by \`VisualFilter.blur(4)\` and its kin (\`Shadow(…)\` for a shadow).
 *  \`visualFilter\` applies one, or a list in order, to the view's own paint as a GROUP
 *  (so a subtree blurs together, not child by child); \`backdrop\` applies the same to
 *  what lies beneath. There is no CSS \`filter\` string: the tokens are functions, so a
 *  misspelling is a compile error rather than a silent no-op. */
type VisualFilter = { fn: "blur"; radius: number } | { fn: "brightness" | "contrast" | "saturate" | "grayscale" | "invert" | "sepia"; amount: number } | { fn: "hueRotate"; degrees: number } | { fn: "colorize"; color: Color } | Shadow;
/** A token record — every color and metric an app names once. Provided down the
 *  tree (\`provided("theme")\`), spread to override a token, and declared at the top
 *  level with \`theme Name [ … ]\`. Its keys are open by design: a record whose keys
 *  the program chooses cannot be closed without firing on correct code. A read of
 *  \`provided("theme")\` is closed all the same, over every token some theme
 *  declares, so a misspelled token is a compile error. */
type Theme = Readonly<Record<string, any>>;
/** The data a \`:path\` reads against — a view's place in the bound data, its
 *  \`datapath\` plus its position under replication. You rarely name the type: a
 *  \`:path\` reads through it for you. */
interface DataCursor { readonly data: any; readonly path: readonly string[] }
/** One message across the island boundary — what \`post\` and \`postToHost\` send and
 *  \`onPost\` and \`onHostMessage\` receive between an embedded app and its host. */
interface IslandMessage { readonly topic: string; readonly payload: unknown }
/** A navigation the embedded app asked for — what an island's \`onNavigate\`
 *  receives: \`to\`, the address made absolute; \`program\`, the Declare program it
 *  names ("" when none); \`location\`, the place after its \`#\`; \`newWindow\`, whether
 *  it asked for a window of its own (\`openWindow\`). */
interface IslandNavigation { readonly to: string; readonly program: string; readonly location: string; readonly newWindow: boolean }
/** Build a border: \`stroke = Stroke(1, #B0B0B0)\`. Drawn inside the box, so it costs
 *  no layout. On a Text, \`textStroke = Stroke(1, #C0392B)\` strokes the glyphs. */
declare function Stroke(width: number, color: Color): Stroke;
/** Build a drop shadow — offset, blur, color. On \`shadow\` it falls from the box, on
 *  \`textShadow\` from the glyphs, and in a filter list it composes with the rest. */
declare function Shadow(dx: number, dy: number, blur: number, color: Color): Shadow;
/** The gradients, built by kind. Legal in a bare slot, which is why each is a call and
 *  not a record. */
declare const Gradient: {
  /** A linear gradient: \`Gradient.linear(#F8F8F8, #D8D8D8)\` top to bottom, or with an
   *  angle first — \`Gradient.linear("90deg", …)\`. Colors spread evenly;
   *  \`Gradient.stop(offset, color)\` places one exactly. */
  linear(...args: (Color | \`\${number}deg\` | { offset: number | null; color: Color })[]): Gradient;
  /** A radial gradient from a center and radius, in the view's own units — a glow, a
   *  vignette, a sphere's shading. */
  radial(cx: number, cy: number, r: number, ...stops: (Color | { offset: number | null; color: Color })[]): Gradient;
  /** A gradient swept AROUND a center from a starting angle — a hue wheel, a pie, a
   *  progress sweep. */
  conic(cx: number, cy: number, angle: number, ...stops: (Color | { offset: number | null; color: Color })[]): Gradient;
  /** One gradient stop at an exact offset (0 to 1) instead of letting the colors spread
   *  evenly. */
  stop(offset: number, color: Color): { offset: number; color: Color };
};
/** The visual filters, built by kind: \`visualFilter = VisualFilter.blur(4)\`, or a list
 *  applied in order, \`[VisualFilter.grayscale(1), VisualFilter.brightness(0.8)]\`. */
declare const VisualFilter: {
  /** The frosted-glass backdrop: blur what lies beneath, and lift its saturation a little
   *  so color shows through rather than going grey. \`backdrop = VisualFilter.frost(26, 1.5)\`. */
  frost(radius: number, saturation?: number): readonly VisualFilter[];
  /** Blur, by radius in the view's own units. On \`visualFilter\` it blurs this view's
   *  paint; on \`backdrop\`, what is behind it. */
  blur(radius: number): VisualFilter;
  /** Scale brightness — 1 is unchanged, 0 is black, above 1 lightens. */
  brightness(amount: number): VisualFilter;
  /** Scale contrast — 1 is unchanged, 0 is flat grey, above 1 hardens. */
  contrast(amount: number): VisualFilter;
  /** Scale saturation — 1 is unchanged, 0 is grey, above 1 intensifies. */
  saturate(amount: number): VisualFilter;
  /** Remove color, 0 to 1, where 1 is fully grey. */
  grayscale(amount: number): VisualFilter;
  /** Invert, 0 to 1, where 1 is a full negative. */
  invert(amount: number): VisualFilter;
  /** Warm toward sepia, 0 to 1. */
  sepia(amount: number): VisualFilter;
  /** Rotate every hue around the color wheel by an angle in degrees. */
  hueRotate(degrees: number): VisualFilter;
  /** Replace the paint's color while KEEPING its alpha — the one-mask-many-colors idiom:
   *  one bitmap or drawing, recolored per use. \`Image.tint\` is the shorthand for an image. */
  colorize(color: Color): VisualFilter;
};
/** A color is written \`0x4169E1\`, \`"#4169E1"\` (or \`"#4169E1CC"\` with alpha) or a name
 *  (\`"royalblue"\`), and held as a number in the runtime's own encoding, which bit
 *  operations would break: these operations read and write it for you. \`null\` is no color.
 *  Text is not a color until it is read as one: \`Color.from(s)\` reads it, \`Color.hex(c)\`
 *  writes it. */
declare const Color: {
  /** The color at an alpha from 0 (clear) to 1 (opaque), whatever alpha it had. */
  withAlpha(c: Color, alpha: number): Color;
  /** \`a\` mixed toward \`b\` by \`t\` (0 is a, 1 is b), channel by channel, alpha too. A
   *  theme's \`controlSelected\` is its accent laid over its surface:
   *  \`Color.mix(surface, accent, 0.22)\`. */
  mix(a: Color, b: Color, t: number): Color;
  /** Lighter by \`k\` (0 to 1) of perceived lightness (OKLCH), so steps look even. */
  lighter(c: Color, k: number): Color;
  /** Darker by \`k\` (0 to 1) of perceived lightness (OKLCH). */
  darker(c: Color, k: number): Color;
  /** The WCAG contrast ratio of two colors: 1 (none) to 21 (black on white). 4.5 is the
   *  floor for body text. */
  contrast(a: Color, b: Color): number;
  /** Its channels: r, g, b from 0 to 255 and a from 0 to 1, or null for none. */
  components(c: Color): { readonly r: number; readonly g: number; readonly b: number; readonly a: number } | null;
  /** Its hex text: \`"#rrggbb"\`, or \`"#rrggbbaa"\` when it is not opaque, or null for none —
   *  to show a color as text, or to write one to data that keeps colors as strings. Two
   *  colors are the same color when their hex text is the same, however each was written. */
  hex(c: Color): \`#\${string}\` | null;
  /** The color some text writes — \`"#RGB"\`, \`"#RRGGBB"\`, \`"#RRGGBBAA"\` or a CSS name
   *  (\`"crimson"\`, any case) — or null when the text is not one: a field a person types a
   *  color into, or text from a service.
   *  The way back is \`Color.hex\`. */
  from(s: string): Color;
};
/** The style of one run of text that has no view — a \`style\` bundle, or an inline
 *  record with the same fields. Each field is the \`Text\` attribute of that name;
 *  a field left out takes its plain default, never an inherited value. */
interface TextStyle {
  fontFamily?: string | Font | readonly (string | Font)[] | null; fontSize?: number; fontWeight?: FontWeight; italic?: boolean;
  letterSpacing?: number; lineHeight?: number; textColor?: Color | null; textShadow?: Shadow | null;
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize"; smallCaps?: boolean;
  numeralStyle?: "normal" | "lining" | "oldstyle"; numeralWidth?: "normal" | "tabular" | "proportional"; slashedZero?: boolean;
  textFill?: Fill | null; textStroke?: Stroke | null; underline?: boolean; strike?: boolean;
}
/** The palette a \`<span class>\` names: style name → that style's fields. The KEYS
 *  are open — content chooses them — and the VALUES are closed, so a misspelled
 *  field is caught in the record form exactly as it is in a \`style\` bundle. This
 *  is the one record slot that can be narrowed without firing on correct code:
 *  only the value side has a declared shape. */
type TextStyles = Readonly<Record<string, TextStyle>>;
/** Which named style each kind of element rich text styles wears: a name from
 *  \`textStyles\` or a \`style\` declaration. The KEYS are closed — the elements —
 *  so a misspelled one is caught; the values are the program's own names. */
interface TagStyles {
  strong?: string; em?: string; strike?: string; code?: string; link?: string; quote?: string;
  h1?: string; h2?: string; h3?: string; h4?: string; h5?: string; h6?: string;
}
/** Which tags in rich-text content build views: tag name → one of the program's
 *  view classes, written as a value (\`{ Chip: Chip }\`). Keys open — content
 *  chooses them; values closed to view classes, so a string is caught. */
type TagViews = Readonly<Record<string, abstract new (...args: any[]) => View>>;
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
/** What the person has asked their system for — App.accessibilitySettings, fed live
 *  by the host. */
interface AccessibilitySettings { readonly reduceMotion: boolean; readonly increaseContrast: boolean; readonly reduceTransparency: boolean; readonly textScale: number }
/** What measureText reports — a Text's own fact names. */
interface TextMetrics { readonly width: number; readonly height: number; readonly baseline: number; readonly capHeight: number; readonly lines: number }
/** Measure a run of text in a style, with the measurer and wrapping a \`Text\` uses —
 *  one line, or wrapped at \`width\`. Called in a constraint or a drawing, it re-runs
 *  when anything it measured with changes, a font's faces included.
 *
 *  The style says everything the measurement uses: a field left out takes its plain
 *  default, never the face around it. **To measure the way a \`Text\` here would
 *  render, pass \`providedTextStyle(…)\`** — the provided face, with your overrides:
 *  \`measureText(words, providedTextStyle({ lineHeight: 1.3 }), 300).width\`. */
declare function measureText(text: string, style: TextStyle, width?: number): TextMetrics;
/** Make a value safe to CONCATENATE into rich-text content: \`&\`, \`<\`, \`>\`, \`"\` and
 *  \`'\` become entities, and nothing else changes. **Escape every interpolated value,
 *  never the markup you wrote** — the markup is how content names an inline view, so
 *  an unescaped \`<\` or \`'\` arriving from data does not merely read wrong, it closes
 *  an attribute or opens an element of its own. Content assembled in a \`{ }\` is the
 *  only place this matters; a literal document has nothing to escape.
 *  \`html = { "Assigned to <Person name='" + escapeHtml(app.me) + "'/>" }\` */
declare function escapeHtml(s: string): string;
/** What \`afterDelay(ms, fn)\` returns: \`cancel()\` drops the wait if it has not run. */
interface DelayHandle { cancel(): void }
/** A gradient built INSIDE a drawing, by \`d.createLinearGradient\` and its kin —
 *  the Canvas2D shape, stops added by call. The declarative \`Gradient\` is the one a
 *  \`fill\` slot takes; this one exists only for the duration of a recording. */
interface DrawGradient { addColorStop(offset: number, color: string | Color): void }
// what drawImage takes — any Image view (structural, so a subclass qualifies)
/** What \`d.drawImage\` accepts: any \`Image\` view, by its loading facts. Structural,
 *  so a subclass of \`Image\` qualifies — you hand over the node, not a URL, because
 *  the node is what knows whether the bytes have arrived. */
interface DrawImageSource { loaded: boolean; naturalWidth: number; naturalHeight: number }
/** The canvas drawing context a \`draw(d: DrawContext)\` body receives — a Canvas2D-
 *  shaped recorder whose operations every renderer replays (runtime/src/draw.ts). */
interface DrawContext {
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
/** A pointer's position, in two frames, and how far it has moved. \`x\`/\`y\` are in this
 *  view's own coordinates; \`rootX\`/\`rootY\` are in root space. \`deltaX\`/\`deltaY\` are the
 *  travel since the press — on a drag (\`onDragStart\`, \`onDrag\`, \`onDragEnd\`) in the frame
 *  the dragged view's own \`x\`/\`y\` are set in, so \`x = startX + e.deltaX\` keeps it under
 *  the finger however the views around it are scaled or scrolled; elsewhere in root space;
 *  on a wheel, the scroll amount. \`shift\`, \`ctrl\`, \`alt\` and \`meta\` are the keys held
 *  with it, as a \`KeyEvent\` names them: a Shift-click extends a selection, a ⌘-click
 *  (Ctrl-click off the Mac) adds to one. */
interface PointerEvent {
  /** Where the pointer is, in this view's own coordinates — through its whole transform:
   *  its parents' places, scales and rotations, and its own. */
  x: number;
  /** Where the pointer is, in this view's own coordinates (see \`x\`). */
  y: number;
  /** Where the pointer is, in root space: the app's own frame, which nothing scales or
   *  scrolls — the one \`app.viewAt\` takes. */
  rootX: number;
  /** Where the pointer is, in root space (see \`rootX\`). */
  rootY: number;
  /** How far the pointer has moved since the press. On a drag (\`onDragStart\`, \`onDrag\`,
   *  \`onDragEnd\`): in the frame the dragged view's own \`x\` is set in — its parent's —
   *  with any scrolling around it since the press, so \`x = startX + e.deltaX\` moves the
   *  view by exactly the finger's travel, and nothing divides it by a scale. On other
   *  pointer events: in root space. On a wheel: the scroll amount. 0 with no press. */
  deltaX: number;
  /** How far the pointer has moved since the press, as \`deltaX\` says, down the page. */
  deltaY: number;
  /** Shift is held. */
  shift: boolean;
  /** The Control key is held: ⌃ on a Mac, Ctrl elsewhere. */
  ctrl: boolean;
  /** Alt is held (⌥ on a Mac). */
  alt: boolean;
  /** The meta key is held: ⌘ on a Mac, the Windows key elsewhere. */
  meta: boolean;
  /** A button or finger is down. */
  down: boolean
}
/** A release, plus the one fact a drag handler must not miss: \`canceled\` is true
 *  when the browser reclaimed the gesture — a touch that became a scroll. Commit on
 *  release only when it is false, or an interruption reads as a drop. */
interface PointerUpEvent extends PointerEvent { canceled: boolean }
/** The end of a drag: released, or taken back (\`canceled\`) by a system
 *  interruption, Escape, or the window losing focus. Commit only when \`canceled\`
 *  is false. */
interface DragEndEvent extends PointerUpEvent { canceled: boolean }
/** The multi-finger stream: every finger down (\`touches\`) and the ones this event
 *  moved (\`changed\`). Declaring a touch handler claims every finger, so the app then
 *  owes its own zoom. */
interface TouchEvent extends PointerEvent { touches: readonly Touch[]; changed: readonly Touch[] }
/** A wheel or trackpad scroll, by axis: how far is \`deltaX\` and \`deltaY\` (from
 *  PointerEvent), in pixels. A trackpad PINCH arrives here too, with
 *  \`pinch\` true — the browser reports it as a wheel event with a modifier, and
 *  hiding that would make a zoom impossible to write. */
interface WheelEvent extends PointerEvent { pinch: boolean }
/** A resolved two-finger zoom: the accumulated \`scale\` (1 at \`onPinchStart\`) and the
 *  point between the fingers it pivots about. \`center\` is that point in ROOT space (the
 *  same as \`rootX\`/\`rootY\`); \`x\`/\`y\` are the same point in this view's own coordinates —
 *  what zooming "about the fingers" on this view wants. */
interface PinchEvent extends PointerEvent { scale: number; center: { readonly x: number; readonly y: number } }
/** A key, both ways: \`code\` is the physical key regardless of layout (what a
 *  shortcut wants), \`key\` is the character it produced (what typing wants). Plus the
 *  four modifiers, whether the key is repeating, and \`isComposing\`: the key belongs to
 *  an input method's composition (an accent, a Japanese reading, the Return that
 *  commits one), so it is the method's to act on, not a command or a typed letter;
 *  and \`altGraph\`: AltGr is held (Windows and Linux layouts, where it also reads as
 *  Ctrl and Alt), so the key types a character such as € and is not a chord. */
interface KeyEvent { code: string; key: string; shift: boolean; ctrl: boolean; alt: boolean; meta: boolean; repeat: boolean; isComposing: boolean; altGraph: boolean }
/** Where the focus indicator should be, and where it came from — the rect and
 *  radius to draw, the view and root it belongs to, the scroller it sits in, and the
 *  \`home…\` fields it is travelling from. What a custom focus ring reads to animate. */
interface FocusGeometry { x: number; y: number; w: number; h: number; rad: number; view: View; root: View; scroller: View; homeX: number; homeY: number; homeW: number; homeH: number; homeRad: number; homeRot: number; theme: any }
/** A tooltip's request: the text, and the rect of the view asking, so a custom
 *  tip can place itself against the thing it describes. */
interface TooltipEvent { readonly text: string; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly root: View }
/** One message from an \`EventStream\` or \`Socket\`: its payload, its type, and its
 *  id. \`onMessage\` receives it, and \`last\` holds the most recent. */
interface StreamMessage { readonly data: string; readonly type: string; readonly id: string }
/** A file the person chose (\`FilePicker.pick\`) or dropped (\`onFilesDrop\`): its name, size in
 *  bytes, MIME type, when it last changed (ms since 1970), its path within a chosen or
 *  dropped folder ("" for a file on its own), and a \`url\` that reads it — an \`Image\`'s
 *  \`source\`, a \`DataSource\`'s \`url\` — or, in a \`DataSource\` body, uploads it. */
interface File { readonly name: string; readonly size: number; readonly type: string; readonly modified: number; readonly path: string; readonly url: string }
/** Files dragged over a view: how many (0 when the browser does not say), and where, in
 *  the view's own coordinates. */
interface FilesOverEvent { readonly count: number; readonly x: number; readonly y: number }
/** Files dropped on a view: the files — a dropped folder's, every file in it, each with
 *  its path — and where, in the view's own coordinates. */
interface FilesDropEvent { readonly files: File[]; readonly x: number; readonly y: number }
/** The clipboard at a copy, cut or paste: one thing in several representations, by MIME
 *  type. A copy \`put\`s as many as it likes — \`put(text)\` is plain text, which every app
 *  reads; \`put("text/html", …)\` for apps that take formatting; a type of its own
 *  (\`"application/x-…"\`) for itself. A paste reads the best it understands: \`types\` lists
 *  what is on offer, \`get(type)\` reads one (null when absent), \`text\` is the plain text,
 *  and \`files\` holds pasted files and images. */
interface ClipboardEvent { readonly types: string[]; readonly text: string; readonly files: File[]; get(type: string): string | null; put(text: string): void; put(type: string, data: string): void }
/** Writing to the clipboard from a press — a "Copy link" button: \`copy(text)\`, or
 *  \`copy({ "text/plain": …, "text/html": … })\` for several representations. Call it from
 *  what the person does, as a browser allows the write only then. Pasting is the person's:
 *  a view reads the clipboard in \`onClipboardPaste\`. */
declare const Clipboard: { copy(what: string | Record<string, string>): void };
/** Commands run by name (the key walk: guide 09, Commands): \`run(name)\` walks from the last focus
 *  outside command chrome — a menu bar, a menu, a command button — outward, and the first
 *  view whose \`keyBindings\` bind the command runs it; \`state(name)\` says whether one would
 *  ("on", "off" for greyed, "none"); \`target()\` is where the walk starts. */
declare const Commands: { run(name: string, from?: unknown): boolean; state(name: string, from?: unknown): "on" | "off" | "none"; target(): any };
/** What \`FilePicker.pick\` offers: the types (MIME types or extensions), more than one file,
 *  or a whole folder. */
interface FilePickOptions { accept?: string[]; multiple?: boolean; folder?: boolean }
/** The person's files: \`pick\` opens the file dialog — from a press, as a browser allows
 *  one only then — and resolves to the files chosen, none if it was dismissed. \`save\` hands
 *  the person a file the program made, its text or a Blob's bytes: a browser downloads it to
 *  where its downloads go; the Mac shows its save panel, opening in Downloads with the name
 *  filled in. It resolves to whether the file was saved (false when the person cancelled;
 *  a browser does not say, and answers true). The options are the file's name, with its
 *  extension, and its MIME type (from the extension when left out). */
declare const FilePicker: { pick(options?: FilePickOptions): Promise<File[]>; save(contents: string | Blob, options: { name: string; type?: string }): Promise<boolean> };
/** What a program says to assistive technology with no view to say it from —
 *  "Message sent", "3 results": \`announce\` speaks it without moving the focus,
 *  \`polite\` (the default) at the next pause, \`assertive\` at once. A view whose
 *  own changes should be heard sets \`accessibilityLive\` instead. */
declare const Accessibility: {
  announce(text: string, politeness?: "polite" | "assertive"): void;
  announced(): readonly { text: string; politeness: "polite" | "assertive" }[];
};
/** The easing curves built from numbers, beside the named tokens (\`easing = quadOut\`):
 *  each is an \`Easing\`, what an \`Animator\`'s \`easing\` takes. */
declare const Easing: {
  /** From two control points, the CSS \`cubic-bezier\` form — so a curve copied from a
   *  design tool or a stylesheet transfers unchanged. */
  cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing;
  /** Overshoots its destination and settles back. The argument is how far past it goes. */
  back(overshoot: number): Easing;
  /** \`n\` discrete jumps rather than a continuous ease — a ticking counter, a sprite
   *  flip. \`jump\` chooses whether the first or last step is taken at the ends. */
  steps(n: number, jump?: "jumpStart" | "jumpEnd"): Easing;
  /** OpenLaszlo's pole form: a begin and end pole rather than two control points. */
  laszlo(beginPole: number, endPole: number): Easing;
};
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
  /** The wake trace: what each settle changed, and what opened it. */
  trace: {
    start(cap?: number): void; stop(): void; clear(): void; active(): boolean;
    read(): TraceSettle[];
    text(settles?: TraceSettle[]): string;
  };
  /** The profiler, recording the subject's turns: stop() answers the report as text. */
  profile: { start(why?: boolean): void; stop(): string; active(): boolean };
};
/** One attribute the wake trace saw change: the view it lives on (\`path\`) and
 *  the attribute, its value before and after, and — for a change the settle
 *  made — the rule that wrote it (\`by\`; null for a plain write). */
interface TraceChange { path: string; attr: string; from?: number | boolean | string | null; to?: number | boolean | string | null; by: { rule: string; source: string | null; line?: number; file?: string } | null }
/** One settle, as the wake trace recorded it: its number; when it opened (\`at\`,
 *  ms since the trace started) and how long it ran (\`ms\`); the user code that
 *  ran before it (\`origin\`); how many rules the kernel ran (\`runs\`); the writes
 *  that opened it (\`triggers\`) and what it changed in response (\`changes\`); and
 *  \`unnamed\`, cells that moved but belong to no addressable attribute. */
interface TraceSettle { n: number; at: number; ms: number; origin: string[]; runs: number; triggers: TraceChange[]; changes: TraceChange[]; unnamed: number }
declare function setTimeout(fn: (...args: any[]) => void, ms?: number): number;
declare function clearTimeout(id: number): void;
declare function setInterval(fn: (...args: any[]) => void, ms?: number): number;
declare function clearInterval(id: number): void;
declare const console: { log(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void };
/* The network and URL globals, declared by hand — the checker loads no DOM lib
 * (its Text / Image would collide with the classes). A \`script\` block uses
 * them; a { } body is refused \`fetch\` and the timers by the resolver, which
 * names DataSource / afterDelay / Time (compile.ts isKnownGlobal). */
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
declare const performance: { now(): number };
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
/** A shared function every { } body has, as a person writes its call —
 *  `escapeHtml(s)` — read from its prelude declaration; null when `name` is
 *  not one. */
export function sharedFunctionSignature(name) {
    const m = new RegExp(`^declare function ${name}\\(([^)]*)\\)`, "m").exec(PRELUDE);
    if (m === null)
        return null;
    return `${name}(${m[1].split(",").map((p) => p.trim().split(/\??:/)[0].trim()).filter((p) => p !== "").join(", ")})`;
}
export const PRELUDE_NAMES = new Set([...PRELUDE.matchAll(/^(?:declare\s+)?(?:interface|type|function|const|var|let|class|enum|namespace)\s+([A-Za-z]\w*)/gm)].map((m) => m[1]));
/** The HOST's surface, not the language's. These are declared in the prelude so a
 *  handler typechecks against the real shape each has in every host Declare runs
 *  in — the checker loads no DOM lib, because its `Text`/`Image` would collide
 *  with the classes. They are documented as a POLICY (what a body may reach
 *  for, and why script is the place for the rest), never name by name: Declare
 *  does not own `fetch`, and restating MDN here would go stale.
 *
 *  The doc gate requires prose for every shared prelude name EXCEPT these, which
 *  is what makes a NEW language-owned name fail the gate instead of shipping
 *  undocumented. Add a name here only when the host owns it. */
export const HOST_GLOBALS = new Set([
    "setTimeout", "clearTimeout", "setInterval", "clearInterval", "console",
    "queueMicrotask", "structuredClone", "performance",
    "encodeURIComponent", "decodeURIComponent", "encodeURI", "decodeURI",
    "fetch", "Headers", "RequestInit", "Response", "Blob", "FormData",
    "AbortSignal", "AbortController", "URL", "URLSearchParams",
]);
/** The host names a program can CALL or construct — those the prelude declares as
 *  a value (function, class, const, var), not only as a type. Every host must
 *  provide each one; the Mac host's smoke test holds it to that
 *  (test/mac-shell.test.mjs), so a name added here cannot ship without it. */
export const HOST_VALUE_GLOBALS = new Set([...HOST_GLOBALS].filter((n) => new RegExp(`^declare\\s+(?:function|class|const|var|let)\\s+${n}\\b`, "m").test(PRELUDE)));
/** Record types the PRELUDE already gives a shape. A record-typed attribute
 *  whose name is here is NOT given the generated open alias below — it has a
 *  real declaration, and a second one is a duplicate identifier. Add a name here
 *  when you write its shape into the prelude, and only then. */
const PRELUDE_RECORDS = new Set(["Theme", "TextStyles", "TagStyles", "TagViews", "RichTextLayout", "DelayHandle", "AccessibilitySettings", "FocusGeometry", "TooltipEvent"]);
/** One AttrType (value.ts) → its TypeScript type, mirroring the value model.
 *  Enum and record arms reference a NAMED type (`type Stretch = …`, `Theme`)
 *  emitted in the prelude / near-use; class references the peer
 *  `declare class`. The nullable decoration slots (stroke/shadow) and the two
 *  styling channels carry their `| null` here, matching what coercion admits. */
export function tsType(t) {
    switch (t.kind) {
        case "length": return "Length";
        case "radius": return "Radius";
        case "inset": return "Inset";
        case "number": return t.nullable === true ? "number | null" : "number";
        case "boolean": return t.nullable === true ? "boolean | null" : "boolean";
        case "flex": return "boolean | number";
        case "string": return "string";
        case "color": return "Color";
        case "shape": return "ClipPath | boolean | null"; // `clip`: a shape, or true for the view's own box
        case "dataschema": return "any"; // the parsed shape declarations — data, not a body-facing type
        // An AUTHORED literal union (`"idle" | "loading"`) carries the union TEXT
        // as its name and is already TypeScript, so it emits inline and needs no
        // alias; a built-in vocabulary (LayoutAxis, Easing) references the emitted
        // `type <Name> = …` alias. Both are `t.name` — the difference is whether
        // an alias is generated for it (see generateScaffold's `enums`).
        case "enum": return t.name;
        case "class": return t.required === true ? t.of : `${t.of} | null`; // a schema slot's only literal is `null` for "none"; a declared `Menu` is never empty
        case "fn": return `(${t.written.replace(/->/g, "=>")}) | null`; // a callback slot; `null` = none
        case "cursor": return "DataCursor"; // reads see the place; writes are widened in memberSig
        case "slotref": return "string"; // a bare slot name, a string at runtime
        case "record": return t.data === true && t.required !== true ? `${t.name} | null` : t.name; // data record (nullable unless declared without `?`) / Theme-class token record
        case "fill": return "Fill";
        case "stroke": return "BoxStroke"; // one Stroke, four clockwise from the top, or null
        case "glyphStroke": return "Stroke | null"; // one Stroke along the glyphs' edges (Text.textStroke), or null
        case "shadow": return "Shadow | null";
        case "filter": return "VisualFilter | readonly VisualFilter[] | null";
        case "mask": return "Gradient | View | null";
        case "easing": return "Easing"; // the token union, or a curve the Easing builders make
        // a family string, a Font object, or a fallback list of them; null only where a slot
        // says null is its default (codeFamily: the house monospace) — a face's own family is
        // never null, and the face provided from above is read as provided("fontFamily")
        case "font": return t.nullable === true ? "string | Font | readonly (string | Font)[] | null" : "string | Font | readonly (string | Font)[]";
        case "faceSource": return "string | readonly string[]";
        case "faceWeight": return "FontWeight | readonly [number, number]";
        case "array": return t.of !== undefined ? `${t.of}[]` : "any[]";
        case "object": return t.written !== undefined ? t.written.replace(/->/g, "=>") : "any";
        case "view": return t.required === true ? "View" : "View | null";
    }
}
/** The event-payload type names, writable in a handler's signature. Declared
 *  in the prelude above; the shapes live in the runtime (events.ts, keys.ts,
 *  tip.ts, focus.ts) and this list is what makes them nameable by an author. */
const PAYLOAD_TYPES = new Set(["PointerEvent", "PointerUpEvent", "DragEndEvent", "TouchEvent", "WheelEvent", "PinchEvent", "Touch", "KeyEvent", "FocusGeometry", "TooltipEvent", "StreamMessage", "File", "FilesOverEvent", "FilesDropEvent", "ClipboardEvent", "FilePickOptions", "DrawContext", "DrawGradient"]);
/** A WRITTEN signature type name (`f(w: Window) -> number`) → its TypeScript
 *  type. Two sources, the same two an attribute declaration draws on: the
 *  declarable value vocabulary (`number`, `string`, `array`, `LayoutAxis`, …) and the
 *  classes, every one of which is emitted here as a peer
 *  `declare class`. Returns null when the name is neither, so the caller can
 *  report it positioned against the author's text.
 *
 *  Nullability is the OPEN QUESTION here, and the reason some corpus signatures
 *  stay bare. A class-typed SLOT is `| null` (declared `= null` — how the
 *  corpus holds instances), so passing one to a non-null parameter is an error;
 *  make the parameter nullable instead and every use inside the body becomes
 *  "possibly null". Measured on library/menu.declare: non-null costs 3 call
 *  sites, nullable costs 9 body reads. Neither is right, because the language
 *  has no nullable/optional parameter spelling (`c: Menu?`) — when it gets one,
 *  this is the line that changes. Non-null is kept meanwhile: it keeps bodies
 *  clean and pushes the check to the caller, where the knowledge is. */
export function signatureTsType(written, isClassName, nullable = false) {
    const nul = (t) => (nullable ? `${t} | null` : t);
    // `Window[]` — an element-typed array. Resolve the ELEMENT and append; the
    // spelling is already TypeScript's.
    if (written.endsWith("[]")) {
        const base = signatureTsType(written.slice(0, -2), isClassName, false);
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
        return nul(t.kind === "view" ? "View" : t.kind === "class" ? t.of : tsType(t));
    if (isClassName(written))
        return nul(written);
    // A paint written by name is "a paint, or none": null is no paint throughout
    // the language (Color is number | null, Fill holds it, the stroke and shadow
    // slots take it), so a method that computes one for a slot may return null —
    // `outline(s) -> Stroke { return s == null ? null : stroke(…) }` (Presentify
    // run 7). stroke() and shadow() themselves still give a value, never null.
    if (written === "Stroke" || written === "Shadow")
        return `${written} | null`;
    // any other TypeScript type, as written — its names are TypeScript's to
    // check, at the parameter (typecheck.ts probeTypes)
    return nul(written.replace(/->/g, "=>"));
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
function methodSig(m, isClassName) {
    const params = m.params.map((p, i) => {
        const ts = p.type === undefined ? null : signatureTsType(p.type, isClassName, p.nullable === true);
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
    const ret = m.returns === undefined ? "any" : (signatureTsType(m.returns, isClassName, m.returnsNullable === true) ?? "any");
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
 *  datapaths are checked against declared schemas by schema-check.ts, and
 *  `unknown` would flag every correct read (the same deliberate under-report
 *  as Theme). Members the runtime marks `protected` (TweenLayout.laid) are
 *  declared public here: a check-block is a free function, not a subclass
 *  body, so TS's protected rule would reject the legal subclass call. */
/** The CALLABLE surface of a service that is also a class. `Focus` names one
 *  concept — the focus service — which a body can either ASK
 *  (`Focus.focus(this)`) or LISTEN to (`Focus [ onFocusChange(v) { … } ]`).
 *  The keyboard splits the two: `Keyboard` is asked (`Keyboard.isDown("KeyA")`,
 *  an abstract class no tag builds) and a `KeyListener` member listens. Emitted
 *  as STATIC members of the generated class so the call typechecks; at runtime
 *  a tag and a body identifier are different namespaces (the body's `Keyboard`
 *  is the injected service object — expr.ts setBodyServices). */
export const LANGUAGE_STATICS = {
    Keyboard: [
        `  static isDown(code: string): boolean;`,
        `  static held(): string[];`,
        // Claim the nav keys (arrows/Space/Home/End/Page) from the browser's
        // scroll defaults while an overlay roves — an open Menu's claim.
        `  static navClaim(owner: object, on: boolean): void;`,
        // the overlay the keys go to now (planes.md §9)
        `  static _claimant(): any;`,
        // declared shortcuts (planes.md §9): a Shortcuts set registers; the
        // resolved set where focus is, for a panel that lists them
        `  static _declareShortcuts(owner: object): void;`,
        `  static shortcutsInForce(): any[];`,
        `  static keyLabel(key: string): string;`,
    ],
    Focus: [
        `  static focus(v: unknown): void;`,
        `  static blur(): void;`,
        `  static next(past?: View | null): void;`,
        `  static prev(past?: View | null): void;`,
        `  static byKeyboard(): boolean;`,
        `  static getFocus(): any;`,
        // focus scopes (planes.md §13): into a scope, and between regions
        `  static focusIn(v: unknown): boolean;`,
        `  static nextRegion(dir: number): void;`,
        `  static holds(v: unknown): boolean;`,
        // an overlay closing gives focus back (Floating's _closing) — internal
        `  static _giveBack(overlay: unknown): void;`,
        // focus is in a member scope entered inside a stop (TextInput's Escape) — internal
        `  static _inMember(): boolean;`,
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
        // a node's own later work: the wait or the step belongs to the node that
        // asked, and its discard cancels it (node.ts afterDelay, afterSettle)
        `  afterDelay(ms: number, fn: () => void): DelayHandle;`,
        `  afterSettle(fn: () => void): void;`,
        // the text face provided where this node is
        `  providedTextStyle(overrides?: TextStyle): TextStyle;`,
        `  $data(path: string | readonly unknown[]): any;`,
        // what a handler's `:field = v` lowers to (datapath.ts writeTargetForm) — the
        // write climbs to the nearest cursor exactly as the read does
        `  $cell(segs: readonly unknown[]): { value: any };`,
    ],
    // The App's navigation SERVICE ACTION (view.ts App.openURL, capabilities.md
    // §6): a link/button calls `app.openURL(url)` in an activation handler to leave
    // the app for another address. A method, not an attribute, and the extractor
    // reads the CALL (links.ts).
    App: [
        // a value the program's host provides (an island's `provides`, a page's
        // `provide`, launch parameters): typed BY THE DEFAULT — the host is compiled
        // separately, so the default is the one statement of the type this program
        // relies on (checked again at the read)
        `  hostProvided<T = any>(name: string, fallback?: T): T;`,
        `  openURL(to: string): void;`,
        `  openWindow(to: string): void;`,
        // the island bridge's tenant-side verb (islands design): this app → its
        // host island's onPost. Meaningful only when embedded and linked.
        `  postToHost(topic: string, payload?: unknown): void;`,
        // The ONE operation behind every arrival (location.md §0.5): followLink(ref)
        // applies the app's onFollowLink hook once, then routes — external through
        // openURL, "#…" into a location write + reveal. destinationOf strips the
        // runtime's own trailing `@name`; apps never hand-write that split.
        `  followLink(ref: string, replace?: boolean): void;`,
        `  destinationOf(loc: string): string;`,
        // The DEFAULT landing, exposed (view.ts App.reveal): scroll the target
        // into view, revealInset honored — what an arrival does when no onArrive
        // is declared. An onArrive that wants the scroll AND more composes it
        // back by calling this (the tabOrder()/tabDefault() move).
        `  reveal(target: View): void;`,
        // The Inspector service action (view.ts App.inspect): a button calls
        // `app.inspect("run:<slot>")` to open the Inspector on an embedded app, or
        // `app.inspect()` for this one. Rides the same host-polled channel shape as
        // openURL/openWindow — a `{ }` body never touches the document.
        `  inspect(slot?: string): void;`,
        // INTERIM (capabilities.md §7): the two host-fed live-demo channels the
        // demo-hosting site apps still read — `demoSources` (host-seeded name→source
        // map, host-client.js) and `liveReport` (the last live recompile's rendered
        // report). Host-fed, read-only, never set in `[ ]`. RULED to dissolve into a
        // per-instance `LiveDemo` class (shape 3 — each instance owns its own
        // `source`/`report`); until that rework these ride here so App's schema stays
        // clean of editing knowledge. `any` values, the same under-report as Theme.
        `  readonly demoSources: Readonly<Record<string, any>>;`,
        `  readonly liveReport: string;`,
    ],
    View: [
        // The datapath read/write pair (view.ts): the compiled form every `:path`
        // island lowers to (compile.ts emits the pre-parsed plan —
        // `this.$data(["location","city"])`, selectors as tagged segments), and
        // callable by hand. Data-shaped → `any`: a datapath is checked against
        // the declared schemas by schema-check.ts, not here.
        `  $setData(path: string | readonly string[], v: any): void;`,
        `  scrollIntoView(align?: "start" | "nearest", smooth?: boolean, inset?: number): void;`,
        // The scroll-offset REQUEST verbs (platform-authorship.md): the platform
        // clamps to the real range (Infinity = the far end) and holds a request a
        // hidden surface cannot take yet, applying it on show. `scrollY`/`scrollX`
        // are the FACTS (read-only). The optional glide is the PLATFORM's own
        // motion — the browser's smooth scroll, an NSAnimationContext, the runtime
        // provider's tween — not a Declare Animator: the provider's curve, no
        // Animator semantics, cancelled by a gesture in flight (ruled 2026-09-10).
        `  scrollTo(y: number | { x?: number; y?: number }, glide?: { duration?: number; easing?: string }): void;`,
        `  scrollToX(x: number, glide?: { duration?: number; easing?: string }): void;`,
        `  scrollBy(dx: number, dy: number, glide?: { duration?: number; easing?: string }): void;`,
        // The view's origin in root space via THE one walk (scroll-aware) — the
        // anchor primitive overlays position by (menus, popovers).
        `  rootOrigin(): { x: number; y: number };`,
        // The hit-test pair (view.ts): the same top-paints-first walk the pointer
        // uses, callable from any handler — the drop-target primitive. Missing
        // here until the shelf eval's reference tripped over it (2026-08-07),
        // the day after the prose taught it.
        `  viewAt(x: number, y: number, except?: View | null): View | null;`,
        `  containsPoint(x: number, y: number): boolean;`,
        // Re-host this view's surface inside a scroller so the platform carries
        // it with the content (the FocusRing's ride); false = unsupported.
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
        // the same similarity, to another view's frame — across islands (planes.md §12)
        `  transformTo(other: View): { x: number; y: number; scale: number; rotation: number };`,
        // bounds() minus the position: x/y are the transform's lead offsets, and it
        // never reads the view's x/y — the form a layout's place() consumes (a
        // strategy must not read the slots it writes).
        `  footprint(): { x: number; y: number; width: number; height: number };`,
        `  raise(below?: View | null): void;`,
        // The room inside: the view's extent on `size` less both of its padding's
        // insets on that axis, never below 0 — what `100%` resolves against.
        `  contentBox(size: "width" | "height"): number;`,
        // Tear a runtime-created view down for good: unlink from the parent,
        // unwire constraints, drop the surface, notify the ex-parent's layout and
        // auto-extent — the self-completing pair of createView.
        `  discard(): void;`,
        // The keyboard-traversal protocol (focus.ts): a view's tabOrder() decides
        // the members Tab descends into — override it to gate traversal (a closed
        // AccordionPane contributes none); tabDefault() is the default the
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
    // Play from the start (media.ts): a sound held in memory starts another voice over any still sounding.
    Media: [`  play(): void;`],
    Animator: [`  start(): void;`, `  stop(): void;`],
    AnimatorGroup: [`  start(): void;`, `  stop(): void;`],
    // Take the NEXT target outright instead of travelling to it — for a value
    // that arrives with its data (spring.ts arrive): called from the onLoad.
    Spring: [`  arrive(): void;`],
    // The socket's one verb (streams.ts): a call you make; onMessage is it
    // calling you. The shared stream surface (url/active/retry + the read-only
    // intrinsics) flows from the Stream schema's attrs, not from here.
    Socket: [`  send(text: string): void;`],
    // the island bridge's host-side verb: this island → its linked tenant's
    // onHostMessage. The state channel is the instance's `external` declarations.
    // the island's host-side verb (this island → what it hosts: onPost), and
    // the host's read of a value the hosted side EXPOSES — typed by the default,
    // like hostProvided on the other side (the hosted side compiles separately).
    DOMIsland: [
        `  post(topic: string, payload?: unknown): void;`,
        `  exposed<T>(name: string, dflt: T): T;`,
        `  exposed(name: string): any;`,
    ],
    // The edit-session VERBS (editor.ts): `dirty`/`valid`/`error` are schema
    // attrs (readable state), but committing/reverting the draft are calls.
    // …and the selection write half (#22): one verb — a caret is a zero-length
    // range. "start" / "end" / "all" are the word forms; numbers clamp; `end`
    // omitted means a caret at `at`.
    NativeText: [`  select(at: number | "start" | "end" | "all", end?: number): void;`],
    // The State verbs (state.ts): drive `applied` imperatively — legal only on
    // an UNGATED state (gate XOR verbs; a gated state throws with the rule named).
    // Implemented and advertised since the start; unreachable from source until
    // 2026-07-28 because this table simply lacked the entry.
    State: [`  apply(): void;`, `  remove(): void;`, `  toggle(): void;`],
    // viewExtent: the alignment BAND — the arranged view's own extent on an
    // axis, or 0 when that extent is measured from the laid children (layout.ts).
    Layout: [`  view: View;`, `  laid(): View[];`, `  refuseBaseline(child: View): void;`, `  refuseStackBaseline(): void;`, `  contentExtent(size: "width" | "height"): number;`, `  viewExtent(size: "width" | "height"): number;`, `  sizedByContent(child: View, size: "width" | "height"): boolean;`, `  sizedByChildren(size: "width" | "height"): boolean;`], // view: runtime `View | null`, non-null by the time any body runs
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
    // exactly as the untyped `any` always was. Reads keep seeing the DataCursor.
    // `object` admits every container and refuses primitives — toCursor's rule.
    if (t.kind === "cursor")
        return [`  get ${name}(): DataCursor;`, `  set ${name}(v: DataCursor | object | null);`];
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
function emitClass(s, decl, rootType, extras, isClassName) {
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
        // `$root` — the App at the top of the tree. The `app` noun compiles to
        // `this.$root`; typing it as THE PROGRAM'S root instance type (the
        // caller-passed `rootType` — the root element's synthesized anonymous
        // subclass when it has inline decls/children/methods, else `App`) makes
        // `app.cardW` and every other root-declared member check, not just the
        // built-in App/stage surface.
        lines.push(`  $root: ${rootType};`);
        lines.push(`  readonly children: View[];`); // on the ROOT (Node) — every node has children
        // The provided-value read (language §9). `provided("name"[, default])`
        // compiles to `this.$provided(…)`; it returns `any` — a non-local read the
        // checker provably can't type — so static typing comes from binding it into
        // a typed slot (`t: Theme = provided("theme", …)`), never from the call.
        // The one exception is the theme: every key it can carry is declared
        // somewhere the compile sees (a preset, the library defaults, or one of the
        // program's `theme` declarations), so its read is closed over those keys
        // (`$ThemeTokens`, beside the theme names) and a misspelled token is an error.
        lines.push(`  $provided(name: "theme", dflt?: any): $ThemeTokens;`);
        lines.push(`  $provided(name: string, dflt?: any): any;`);
    }
    // One optional handler member per event this schema DECLARES. Emitting them
    // is what makes a user's handler an OVERRIDE: writing `onPointerUp(e: string)`
    // is then a TS2416 against this signature, and writing `onPointerUp(e)` with no
    // type is a TS7006 — the same treatment TypeScript gives any override, which
    // is the behaviour the language section that is 1:1 with TS should have.
    // A handler the runtime gives a base body (View's onKeyDown: the arrows in a
    // stop) is a required member, so `super.onKeyDown(e)` type-checks.
    for (const ev of s.events ?? []) {
        const payload = EVENT_PAYLOAD[ev];
        const opt = runtimeMethodsOf(s.name).has(handlerName(ev)) ? "" : "?";
        lines.push(`  ${handlerName(ev)}${opt}(${payload === undefined ? "" : `e: ${payload}`}): void;`);
    }
    const api = LANGUAGE_API[s.name];
    if (api !== undefined)
        lines.push(...api);
    const statics = LANGUAGE_STATICS[s.name];
    if (statics !== undefined)
        lines.push(...statics);
    if (decl !== undefined)
        for (const m of decl.body.methods)
            lines.push(methodSig(m, isClassName));
    // Instance members the EMITTER computed from the class BODY (its named
    // children, typed by their instance types) — on the class itself, so a
    // cross-reference through the class NAME (`section.area`) sees them too.
    if (extras !== undefined)
        lines.push(...extras);
    const cls = lines.length === 0
        ? `declare class ${s.name}${ext} {}`
        : `declare class ${s.name}${ext} {\n${lines.join("\n")}\n}`;
    return cls;
}
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
 *  ambient `declare const Name: Theme`, so a body can name it, and its tokens
 *  join the keys `provided("theme")` can be read for (themeTokenTypes). */
themes = [], 
/** The keys the program's theme provisions add by writing a record
 *  (typecheck.ts providedThemeKeys) — readable from `provided("theme")` too. */
themeKeys = [], 
/** The program's `style Name [ … ]` bundles — each a value in body scope, like a
 *  theme, typed EXACTLY by the fields it sets (so `Caption.fontSize` is a number,
 *  not `number | undefined`), which is still a `TextStyle`. */
styles = [], 
/** The standard library's global names (typecheck.ts libGlobals). The
 *  program's classes and schemas live in `namespace $P`, so inside it — where
 *  the check-blocks are — one named like a library type (`Pick`) shadows it;
 *  outside, each gets a global alias for the scripts, except one of these. */
libNames = new Set()) {
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
    // first-encounter order (built-in enum names are globally consistent — Easing
    // is identical on Animator and AnimatorGroup — so a name pins one token set).
    const enums = new Map();
    for (const s of all.values()) {
        for (const t of Object.values(s.attrs))
            if (t.kind === "enum" && !isAuthoredUnion(t.name) && !enums.has(t.name))
                enums.set(t.name, { tokens: t.tokens, numeric: t.numeric !== undefined, boolean: t.boolean === true });
    }
    // …and from METHOD SIGNATURE types. An enum (or record) named ONLY by a
    // signature — `f(a: LayoutAxis)` in a program whose attributes never mention LayoutAxis —
    // still needs its alias emitted, or the scaffold references an undeclared
    // type and every body reports a bogus "nothing in scope is named 'LayoutAxis'".
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
            enums.set(t.name, { tokens: t.tokens, numeric: t.numeric !== undefined, boolean: t.boolean === true });
    }
    const enumLines = [...enums].map(([name, e]) => `type ${name} = ${e.tokens.map((t) => JSON.stringify(t)).join(" | ")}${e.numeric ? " | number" : ""}${e.boolean ? " | boolean" : ""};`);
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
    // (Each is emitted with the program's classes, in `namespace $P` below.)
    // Methods ride the user class declaration, keyed by class name.
    const declOf = new Map();
    for (const d of classDecls)
        declOf.set(d.name, d);
    // Base-before-derived: a stable sort by chain depth (roots at 0). Ambient
    // declarations hoist, so this is for readability, not resolution.
    const depth = (s) => (s.base === null ? 0 : 1 + depth(s.base));
    // Signature types may name a schema too (`advance(t: Task)`) — the widened
    // predicate lets the written name pass through to the interface above.
    // The program's own classes and schemas are declared in `namespace $P`, and
    // the check-blocks run inside it (typecheck.ts runTsc): a program name there
    // shadows a standard-library type of the same name (`class Pick`), as any
    // inner declaration shadows an outer one. A built-in reaching one from
    // outside names it `$P.` (the tag table, `$root`); scripts, global too, reach
    // it by an alias — none for a name the library holds, which keeps its meaning
    // there. Messages drop the `$P.` (typecheck.ts).
    const own = (n) => declOf.has(n) || shapeNameSet.has(n);
    const sorted = [...all.values()].sort((a, b) => depth(a) - depth(b));
    // the root's instance type is the program's: a class of its, or an `_E<n>` of the check-blocks'
    const rootQ = own(rootType) || /^_E\d+$/.test(rootType) ? `$P.${rootType}` : rootType;
    const emit = (s) => emitClass(s, declOf.get(s.name), rootQ, classExtras?.get(s.name), (n) => all.has(n) || shapeNameSet.has(n));
    const classes = sorted.filter((s) => !own(s.name)).map(emit);
    const ownDecls = [...shapes.map((d) => `interface ${d.name} ${shapeObjectText(d.fields)}`),
        ...sorted.filter((s) => own(s.name)).map((s) => emit(s).replace(/^declare class /, "class "))];
    const ownBlock = ownDecls.length === 0 ? "" : `declare namespace $P {\n${ownDecls.join("\n\n")}\n}`;
    const aliases = [...new Set([...declOf.keys(), ...shapeNameSet])].filter((n) => !libNames.has(n))
        .map((n) => declOf.has(n) && all.has(n) ? `type ${n} = $P.${n};\ndeclare const ${n}: typeof $P.${n};` : `type ${n} = $P.${n};`);
    const q = (n) => (own(n) ? `$P.${n}` : n);
    // tag name → instance class, for createView's literal-tag overload (View's
    // LANGUAGE_API). Every schema, built-in and user, under its instantiable name.
    const tagLines = ["interface DeclareTags {", ...[...all.keys()].map((n) => `  ${JSON.stringify(n)}: ${q(n)};`), "}",
        // a class named as a value in a body reads this table (compile.ts rewrites
        // `v instanceof Card` to `v instanceof $classes.Card`), so it narrows as the
        // class itself would
        `declare const $classes: { ${[...all.keys()].map((n) => `readonly ${n}: typeof ${q(n)}`).join("; ")} };`];
    // The Easing union — named tokens (generated from animate.ts, single source
    // of truth), or a curve the Easing builders in the prelude return.
    const motionLine = `type Easing = ${MOTION_TOKENS.map((t) => JSON.stringify(t)).join(" | ")} | { readonly __easing: true };`;
    // The theme names in scope as `Theme` values: the built-in presets plus any
    // the program declares — a body names one (`theme = { app.systemDark ? … : … }`).
    const tokens = [...themeTokenTypes(themes, themeKeys)].map(([k, t]) => `readonly ${k}: ${t}`);
    const themeLine = [...new Set([...THEME_PRESET_NAMES, ...themes.map((t) => t.name)])].map((n) => `declare const ${n}: Theme;`).join("\n")
        + `\ntype $ThemeTokens = { ${tokens.join("; ")} };`
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
    // the services a body asks (Focus, Keyboard): a value with its members, not a
    // class — a statics table on a name no class takes
    const serviceLines = Object.entries(LANGUAGE_STATICS).filter(([n]) => schemas[n] === undefined)
        .map(([n, members]) => `declare const ${n}: {\n${members.map((m) => m.replace(/^  static /, "  ")).join("\n")}\n};`).join("\n");
    return [PRELUDE, enumLines.join("\n"), recordLines.join("\n"), motionLine, themeLine, serviceLines, tagLines.join("\n"), classes.join("\n\n"), ownBlock, aliases.join("\n")].filter((x) => x.length > 0).join("\n\n") + "\n";
}
/** Every key a provided theme can carry, with the type a read of it yields:
 *  the presets' tokens, the library defaults every provided theme is laid
 *  over, the tokens of each `theme` the program declares, and the keys its
 *  provisions write as records (`provided`; `any` unless declared). A key is a
 *  `number` when every declaration of it is one (a color or a metric) and
 *  `any` otherwise — a word, a list, a constructor, or a name whose meaning
 *  depends on its slot — so a read never fails on a value it would accept. */
export function themeTokenTypes(themes, provided = []) {
    const out = new Map();
    const note = (k, numeric) => {
        out.set(k, numeric && out.get(k) !== "any" ? "number" : "any");
    };
    for (const rec of [ThemeDefaults, ...Object.values(THEME_RECORDS)]) {
        for (const [k, v] of Object.entries(rec))
            note(k, typeof v === "number");
    }
    for (const t of themes) {
        for (const a of t.body.attrs) {
            const v = a.value;
            note(a.name, v.kind === "number" || v.kind === "hexColor" || (v.kind === "value" && typeof v.value === "number"));
        }
    }
    for (const k of provided)
        if (!out.has(k))
            out.set(k, "any");
    return out;
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
    return f.array ? (f.tokens !== undefined && f.tokens.length > 1 ? `(${base})[]` : `${base}[]`) : base;
}
// An optional field may be absent or null — JSON's two spellings of "none", one
// field in the schema (`km?: number` is `km: number | null`), so a record the
// program builds with `km: cond ? 3 : null` fits it, as the service's own do.
export function shapeObjectText(fields) {
    return `{ ${fields.map((f) => `${f.name}${f.optional ? "?" : ""}: ${shapeFieldTsType(f)}${f.optional ? " | null" : ""}`).join("; ")} }`;
}
//# sourceMappingURL=scaffold.js.map