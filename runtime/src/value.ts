// The value model — the closed, compiler/kernel-owned vocabulary of literal
// value types (language §6): Color and Length, the plain number / boolean /
// string, and structural enums (named unions like `value Stretch = none |
// width | height | both`). The coercion that turns `navy` into an integer or
// `50%` into a Percent is deliberately imperative and lives here, never in
// Declare source. Each type's `coerce` case owns its "expects …" wording, so
// a type and its diagnostics are one thing and cannot drift apart.

import type { Literal, ShapeField } from "./parser.js";
import { diag } from "./errors.js";
import type { Motion } from "./animate.js";
import { sidesEqual, sidesUniform } from "./stroke-sides.js";
import { parseLiteral } from "./literal-parse.js";

/** A color as one number, or `null` for "no color".
 *
 *  Opaque colors are plain 0xRRGGBB (0…0xFFFFFF) — every number a program
 *  computes is an opaque color, and `0x…` literals stay 6-digit opaque (the
 *  R2 ruling, intact). Alpha arrives ONLY through the `#RGBA`/`#RRGGBBAA`
 *  literal forms (ruled): a translucent color is encoded above 2^32
 *  (ALPHA + rgb·256 + a), so numeric punning between an opaque color and an
 *  alpha-bearing one is unrepresentable — no computable number collides with
 *  the translucent range, and an explicit `…FF` alpha normalizes back to the
 *  opaque form at coercion. `colorToCss` decodes both. */
export type Color = number | null;

/** The base of the translucent encoding — see the Color doc above. */
const ALPHA = 0x100000000;

/** Encode rgb (0xRRGGBB) + alpha (0…255) as one Color number. */
export function colorWithAlpha(rgb: number, a: number): number {
  return a >= 0xff ? rgb : ALPHA + rgb * 0x100 + a;
}

/** A gradient stop: an explicit 0…1 offset, or null for even spacing. */
export interface GradientStop {
  readonly offset: number | null;
  readonly color: Color;
}

/** A linear gradient (a decoration Fill). `angle` is in degrees with CSS's
 *  compass semantics — 0 points up, clockwise; the constructor's default is
 *  180 (top → bottom). Plain immutable data — structured-cloneable, like
 *  every decoration value. */
export interface Gradient {
  /** `linear` (the default, and what a missing field means), `radial`, or
   *  `conic` (graphics-pass.md §3). */
  readonly kind?: "linear" | "radial" | "conic";
  /** linear: the compass angle; conic: the start angle (CSS `from`). */
  readonly angle: number;
  /** radial + conic: the centre as fractions of the box (0…1); linear ignores. */
  readonly cx?: number;
  readonly cy?: number;
  /** radial: the ramp's reach as a fraction of the farthest-corner distance —
   *  CSS's default sizing — so `radialGradient(0.5, 0.38, 0.3, …)` is
   *  `radial-gradient(circle at 50% 38%, … 30%)`. */
  readonly r?: number;
  readonly stops: readonly GradientStop[];
}

/** The CSS spelling of a gradient — background, mask-image and text-fill share it. */
export function gradientCss(g: Gradient): string {
  const stops = g.stops.map((st) => colorToCss(st.color) + (st.offset === null ? "" : ` ${st.offset * 100}%`)).join(", ");
  const at = `${(g.cx ?? 0.5) * 100}% ${(g.cy ?? 0.5) * 100}%`;
  if (g.kind === "radial") {
    // the reach scales every placed stop (an unplaced last stop lands at r)
    const r = g.r ?? 1;
    const scaled = g.stops.map((st, i) => colorToCss(st.color) + " " + ((st.offset ?? (i === g.stops.length - 1 ? 1 : i === 0 ? 0 : NaN)) * r * 100).toFixed(3) + "%")
      .map((s) => s.replace(" NaN%", ""));
    return `radial-gradient(circle farthest-corner at ${at}, ${scaled.join(", ")})`;
  }
  if (g.kind === "conic") return `conic-gradient(from ${g.angle}deg at ${at}, ${stops})`;
  return `linear-gradient(${g.angle}deg, ${stops})`;
}

/** What paints a view's box: a solid Color (null = paint nothing) or a
 *  Gradient — the ruled `fill` slot's type, subsuming backgroundColor. */
export type Fill = Color | Gradient;

/** Narrow a Fill to its gradient arm. */
export function isGradient(f: Fill): f is Gradient {
  return typeof f === "object" && f !== null;
}

/** A border drawn INSIDE the view box (ruled: `stroke` over CSS's `border` —
 *  the box stays the layout/hit fact, per R5's hit-region rule). */
export interface Stroke {
  readonly width: number;
  readonly color: Color;
}

/** What `View.stroke` holds: ONE Stroke on all four sides, or FOUR — top,
 *  right, bottom, left, clockwise from the top, as CSS orders the edges of a
 *  box. A `null` in a side's place leaves that side bare, which is how a
 *  single rule is written (`[ stroke(1, line), null, null, null ]` is a top
 *  rule and nothing else). The whole slot `null` is no border at all.
 *
 *  The one-value-or-four-clockwise shape is the house pattern for anything
 *  said per side or per corner — `cornerRadius` (a Radius), `padding` (an
 *  Inset), and this. Whichever one you are reading, the single value is the
 *  uniform case and the list starts at the top and goes round. */
export type BoxStroke = Stroke | readonly (Stroke | null)[] | null;

/** The uniform Stroke this value is on all four sides, or null when it is
 *  bare on all four — and `undefined` when the sides genuinely differ, which
 *  is the signal to take a painter's per-side path. Keeps the overwhelmingly
 *  common uniform case on the one-ring fast path in both backends; the FOUR-side
 *  arm lives in stroke-sides.ts, one module for everything four sides mean. */
export function strokeUniform(s: BoxStroke): Stroke | null | undefined {
  if (s === null || !Array.isArray(s)) return s as Stroke | null;
  return sidesUniform(s as readonly (Stroke | null)[]);
}

/** A glyph OUTLINE (`outline` on text) — a stroke traced along each letterform's
 *  contour (CSS `-webkit-text-stroke` / canvas `strokeText`), NOT a box border
 *  (that is `stroke`). Same shape as Stroke; a distinct type so the two never
 *  confuse. Paint-only: it does not change advance or the line box. */
export interface Outline {
  readonly width: number;
  readonly color: Color;
}

/** A drop shadow — ONE value, three sites (graphics-pass.md §1.1): on the
 *  view box (`shadow`, the CSS box-shadow shape minus spread), on glyphs
 *  (`textShadow`), and inside a `filter` list, where it shadows the painted
 *  group's ALPHA (CSS `drop-shadow`). It carries its function tag so a list
 *  can hold it beside the other filters. */
export interface Shadow {
  readonly fn: "shadow";
  readonly dx: number;
  readonly dy: number;
  readonly blur: number;
  readonly color: Color;
}

/** The filter vocabulary (graphics-pass.md §1) — ONE set of functions at two
 *  tiers: `filter` (the view's own painted subtree, as a group) and `backdrop`
 *  (what lies beneath, sampled before the view paints); the same names are
 *  ordinary functions inside `{ }`, and a `draw()` body's `d.filter` takes the
 *  list too. Plain, frozen data: a list crosses the raster worker and the Mac
 *  bridge as-is. Lengths are VIEW units and scale with the view's transform. */
export type Filter =
  | { readonly fn: "blur"; readonly radius: number }
  | { readonly fn: "brightness" | "contrast" | "saturate" | "grayscale" | "invert" | "sepia"; readonly amount: number }
  | { readonly fn: "hueRotate"; readonly degrees: number }
  | { readonly fn: "colorize"; readonly color: Color }
  | Shadow;

/** What a `backdrop` slot holds: the frost is a filter list applied to the
 *  sample beneath the view's own painted shape, under the view's own fill.
 *  `frost(radius, saturation?)` builds the common pair. */
export type Backdrop = readonly Filter[];

/** What a `mask` slot holds (graphics-pass.md §2): a Gradient (its ALPHA over
 *  the view's box), or a View — the stencil — whose painted alpha, placed by
 *  its own x/y inside the masked view's box, is the mask. A stencil is usually
 *  a `visible = false` child. Plain data or a node reference; the seam
 *  resolves the node's surface lazily (backend.ts MaskSpec). */
export type Mask = Gradient | { readonly surface: unknown; readonly x: number; readonly y: number; readonly width: number; readonly height: number };
export function isMaskGradient(m: Mask): m is Gradient {
  return typeof m === "object" && m !== null && "stops" in m;
}

/** A `filter`/`backdrop` value as written or bound: one function, a list, or
 *  null — normalized to a frozen list (empty = none) at the seam. */
export type FilterValue = Filter | readonly Filter[] | null;
export function filterList(v: FilterValue | undefined): readonly Filter[] {
  if (v === null || v === undefined) return EMPTY_FILTERS;
  return Array.isArray(v) ? (v as readonly Filter[]) : [v as Filter];
}
const EMPTY_FILTERS: readonly Filter[] = Object.freeze([]);

// ── The value constructors' RUNTIME forms — the same names inside `{ }`
// bodies (expr.ts puts them in scope), producing the same immutable
// plain-data records the literal grammar coerces to. One asymmetry, recorded:
// at runtime a leading number is indistinguishable from a color (no written
// form to consult), so the runtime gradient spells its optional angle as the
// string "45deg" — CSS's own spelling.

export function gradient(...args: (number | string | GradientStop)[]): Gradient {
  let angle = 180;
  if (typeof args[0] === "string") {
    const m = /^(-?\d+(?:\.\d+)?)deg$/.exec(args[0]);
    if (m === null) throw new Error(`gradient: an angle is written "45deg", got "${args[0]}"`);
    angle = parseFloat(m[1]);
    args = args.slice(1);
  }
  if (args.length < 2) throw new Error("gradient needs at least two stops");
  const stops = args.map((a): GradientStop => {
    if (typeof a === "number") return Object.freeze({ offset: null, color: a });
    if (typeof a === "object" && a !== null && "color" in a) return a;
    throw new Error(diag`a gradient stop is a color or stop(offset, color)`);
  });
  return Object.freeze({ angle, stops: Object.freeze(stops) });
}

// radialGradient / conicGradient and the filter functions live in effects.ts —
// carried by a production build only when a program names one.

export const stop = (offset: number, color: Color): GradientStop => Object.freeze({ offset, color });
/** A width that cannot be a width. A stroke is drawn INSIDE the box, so a value
 *  past a few thousand points is never art — and a `Color` is a number at
 *  runtime, so `stroke(provided("theme").line, 1)` produces exactly this: a fourteen-million
 *  point stroke, which paints as a filled black box, with nothing to say so.
 *  Reported once per distinct pair, because the constructor runs inside a
 *  constraint and may re-evaluate on every settle. (A warning, not a refusal:
 *  the value is legal, it is only certainly not what was meant.) */
const MAX_SANE_STROKE = 4096;
const swapped = new Set<string>();
function checkOrder(fn: "stroke" | "outline", width: number, color: Color): void {
  if (!(typeof width === "number") || width <= MAX_SANE_STROKE) return;
  const key = `${fn}:${width}:${String(color)}`;
  if (swapped.has(key)) return;
  swapped.add(key);
  const looksSwapped = Number.isInteger(width) && width <= 0xffffff && typeof color === "number" && color <= MAX_SANE_STROKE;
  console.warn(looksSwapped
    ? diag`[Declare] ${fn}(${width}, ${String(color)}) — the arguments look reversed: it is ${fn}(width, color), and ${width} is 0x${width.toString(16).toUpperCase()} as a colour. A stroke is drawn inside the box, so this paints as a filled rectangle`
    : diag`[Declare] ${fn}(${width}, …) — a stroke width of ${width} is drawn inside the box, so it paints as a filled rectangle. ${fn}(width, color) takes the width first`);
}

export const stroke = (width: number, color: Color): Stroke => { checkOrder("stroke", width, color); return Object.freeze({ width, color }); };
export const outline = (width: number, color: Color): Outline => { checkOrder("outline", width, color); return Object.freeze({ width, color }); };
export const shadow = (dx: number, dy: number, blur: number, color: Color): Shadow =>
  Object.freeze({ fn: "shadow", dx, dy, blur, color });
/** How far a filter's output can reach past the painted box, in view units —
 *  a blur's 3σ, a shadow's offset plus its 3σ. The over-scan a backdrop sample
 *  and an offscreen group both pad by (graphics-pass.md §0, the bleed rule). */
export function filterBleed(list: readonly Filter[]): number {
  let pad = 0;
  for (const f of list) {
    if (f.fn === "blur") pad += f.radius * 3;
    else if (f.fn === "shadow") pad = Math.max(pad, Math.max(Math.abs(f.dx), Math.abs(f.dy)) + f.blur * 3);
  }
  return Math.ceil(pad);
}

/** The largest blur radius in a list — what a frost's sample over-scans by. */
export function filterBlur(list: readonly Filter[]): number {
  let r = 0;
  for (const f of list) if (f.fn === "blur") r += f.radius;
  return r;
}

// Structural equality for the decoration values (ruled: the === write gate
// extends to shallow structural equality for these — a constraint
// re-producing an equal record stops the cascade like a scalar). Each is
// called by the attribute layer only when identity already differed.

export function shadowEqual(a: Shadow | null, b: Shadow | null): boolean {
  return a !== null && b !== null &&
    a.dx === b.dx && a.dy === b.dy && a.blur === b.blur && a.color === b.color;
}

export function strokeEqual(a: BoxStroke, b: BoxStroke): boolean {
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) return sidesEqual(a, b);
  const s = a as Stroke;
  const t = b as Stroke;
  return s.width === t.width && s.color === t.color;
}

export function outlineEqual(a: Outline | null, b: Outline | null): boolean {
  return a !== null && b !== null && a.width === b.width && a.color === b.color;
}

export function filterEqual(a: Filter, b: Filter): boolean {
  if (a === b) return true;
  if (a.fn !== b.fn) return false;
  switch (a.fn) {
    case "blur": return a.radius === (b as typeof a).radius;
    case "hueRotate": return a.degrees === (b as typeof a).degrees;
    case "colorize": return a.color === (b as typeof a).color;
    case "shadow": return shadowEqual(a, b as Shadow);
    default: return a.amount === (b as typeof a).amount;
  }
}
/** Structural equality over a filter value in any written form (one, a list, null). */
export function filtersEqual(a: FilterValue | undefined, b: FilterValue | undefined): boolean {
  const la = filterList(a), lb = filterList(b);
  if (la.length !== lb.length) return false;
  for (let i = 0; i < la.length; i++) if (!filterEqual(la[i], lb[i])) return false;
  return true;
}
export function backdropEqual(a: Backdrop | null, b: Backdrop | null): boolean {
  return filtersEqual(a, b);
}

export function fillEqual(a: Fill, b: Fill): boolean {
  if (!isGradient(a) || !isGradient(b)) return false; // unequal solids already failed ===
  return a.angle === b.angle && a.stops.length === b.stops.length &&
    a.stops.every((s, i) => s.offset === b.stops[i].offset && s.color === b.stops[i].color);
}

/** A theme: a plain immutable record of design tokens (ruled, v1 —
 *  wholesale-swapped, never mutated in place). `provided("theme").role`
 *  ALWAYS resolves: the theme is the one provided value with a built-in
 *  default (attributes.ts providedRead), so no provider means San Francisco,
 *  never a fallback expression in class source. `depth` (0 = flat … 1 =
 *  dimensional) is the treatment dial classes translate in their decoration
 *  constraints. Partial reskin is explicit-base spread:
 *  `theme = { { ...provided("theme"), accent: 0xE05252 } }`. */
export type Theme = Readonly<Record<string, unknown>>;
// The preset records live in themes-data.ts and are served by name through
// themes.ts (the `theme Name [ … ]` declarations project into that module).

/** A parent-relative percentage, as written (`{ percent: 50 }` for `50%`).
 *  It stays symbolic: resolving it against a parent measurement is constraint
 *  work that lands at R4 — until then instantiate refuses it loudly rather
 *  than misrendering 50% as 50px (see instantiate.ts). */
export interface Percent {
  readonly percent: number;
}

/** A position literal (`x = center`, `y = end`) — symbolic like Percent,
 *  resolved at bind time against the parent's extent AND the view's own
 *  (bind.ts bindAlign). `center` centers the box (View.alignBand) — for a Text
 *  too, the geometric box; the library's TextLabel cap-centers a label. The closed set: center | end —
 *  start is 0, the default; nothing else, ever. */
export interface Align {
  readonly align: "center" | "end";
}

export function isAlign(v: unknown): v is Align {
  return typeof v === "object" && v !== null && "align" in v;
}

/** A Length: pixels (a bare number) or a parent-relative Percent. */
export type Length = number | Percent;

/** A box's corner rounding: ONE radius for all four corners, or FOUR — top-left,
 *  top-right, bottom-right, bottom-left, clockwise from the top-left as CSS orders
 *  them. `[0, 8, 0, 8]` rounds only the top-right and bottom-left; a corner given
 *  `0` stays square. The number form is the whole language of before; the list
 *  form is what a shape that continues past its own edge needs (a chip cut at a
 *  line break, a tab joined to its pane, a segment in a bar). */
export type Radius = number | readonly [number, number, number, number];

export function radiusCorners(r: Radius): [number, number, number, number] {
  return typeof r === "number" ? [r, r, r, r] : [r[0], r[1], r[2], r[3]];
}
export function radiusIsSquare(r: Radius): boolean {
  return typeof r === "number" ? r <= 0 : r[0] <= 0 && r[1] <= 0 && r[2] <= 0 && r[3] <= 0;
}
export function radiusMax(r: Radius): number {
  return typeof r === "number" ? r : Math.max(r[0], r[1], r[2], r[3]);
}
/** The four corners fitted to a w×h box the way CSS fits border-radius: when
 *  two adjacent radii would overlap along an edge, EVERY radius shrinks by the
 *  same factor, so the shape stays a scaled copy of the one asked for. A uniform
 *  radius past half the box lands at half the box — a pill — exactly as before. */
/** An inset from a box's four edges — `View.padding` today. ONE number
 *  insets every side; FOUR are top, right, bottom, left, clockwise from the
 *  top, the order CSS writes its box edges in. `0` (the default everywhere) is
 *  no inset.
 *
 *  This is the HOUSE PATTERN for anything said per side or per corner: one
 *  value for all of them, or a list of four starting at the top and going
 *  clockwise. `cornerRadius` (a Radius — top-left first, since a corner list
 *  starts at the first corner), `stroke` (a BoxStroke — top first), and this
 *  all read the same way, so knowing one is knowing all three. A list of any
 *  other length is a mistake, never a shorthand. */
export type Inset = number | readonly [number, number, number, number];

/** The four sides of an Inset — top, right, bottom, left. Negative values are
 *  clamped to 0: an inset that grew the box would make a layout place children
 *  outside the view it arranges. */
export function insetSides(i: Inset): [number, number, number, number] {
  const n = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
  return typeof i === "number" ? [n(i), n(i), n(i), n(i)] : [n(i[0]), n(i[1]), n(i[2]), n(i[3])];
}

/** ONE side of an Inset, without materializing the other three — the hot pair:
 *  every child's position push and every descent of the hit walk asks for the
 *  LEADING inset (left on x, top on y), and the answer is almost always the
 *  literal 0 an unpadded view carries. Same clamp as insetSides. */
export function insetLead(i: Inset, axis: "x" | "y"): number {
  if (typeof i === "number") return Number.isFinite(i) && i > 0 ? i : 0;
  const v = axis === "x" ? i[3] : i[0];
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** True when this inset takes nothing off any side — the zero-cost path a
 *  layout takes when nobody asked for padding. */
/** An inset as CSS `padding` (`"0"` when there is none). */
export function insetCss(i: Inset): string {
  const [t, r, b, l] = insetSides(i);
  return t === 0 && r === 0 && b === 0 && l === 0 ? "0" : `${t}px ${r}px ${b}px ${l}px`;
}

export function insetIsZero(i: Inset): boolean {
  const [t, r, b, l] = insetSides(i);
  return t === 0 && r === 0 && b === 0 && l === 0;
}

export function radiusFit(r: Radius, w: number, h: number): [number, number, number, number] {
  const c = radiusCorners(r).map((v) => Math.max(0, v)) as [number, number, number, number];
  const [tl, tr, br, bl] = c;
  const over = (edge: number, sum: number): number => (sum > 0 ? edge / sum : 1);
  const f = Math.min(1, over(w, tl + tr), over(w, bl + br), over(h, tl + bl), over(h, tr + br));
  return f >= 1 ? c : [tl * f, tr * f, br * f, bl * f];
}

/** A coerced literal — ready to assign to a typed view field. Percent is the
 *  one member with no field to land in yet (see above); the decoration
 *  records (Gradient/Stroke/Shadow) arrive from constructor literals. */
export type AttrValue = number | boolean | string | null | Percent | Align | Gradient | Stroke | readonly (Stroke | null)[] | readonly number[] | readonly string[] | Shadow | readonly Filter[] | Mask | Motion | readonly ShapeField[] | { readonly arrayRoot: true; readonly fields: readonly ShapeField[] };

/** Narrow an AttrValue to the Percent arm (no longer the only object in the
 *  union since decoration values landed — the key is the discriminant). */
export function isPercent(v: AttrValue): v is Percent {
  return typeof v === "object" && v !== null && "percent" in v;
}

/** An attribute's declared type — the currency of the class schemas
 *  (schema.ts). The enum arm carries its name and full token set so a schema
 *  line reads as the union declaration it stands for. The class arm (R7)
 *  types a slot whose VALUE is a class instance — View.layout: a Layout —
 *  written as the member `layout: SimpleLayout [ … ]` (the checker routes
 *  that member shape here; the only literal such a slot coerces is `null`). */
export type AttrType =
  // `inset` and `radius` are the same LITERAL shape — one number, or four
  // clockwise — and every path that admits one admits the other. They are two
  // kinds rather than one because the four numbers START SOMEWHERE DIFFERENT
  // (a radius at the top-left corner, an inset at the top edge), and the kind
  // is what carries that as far as the scaffold, whose `Radius` on a padding
  // slot told authors and agents that padding rounds corners.
  // `nullable` (number and boolean): a declared `number | null` — a table slot
  // whose cell carries null beside its number (attributes.ts, kernel.c)
  | { readonly kind: "length" | "number" | "boolean" | "string" | "color" | "shape" | "radius" | "inset"; readonly nullable?: true }
  // A data-shape (B4, language §9's optional `schema` — the "shape" kind
  // above is the SVG clip path, unrelated): the slot holds parsed ShapeField
  // declarations, literal-only (`[ city: string, rows[]: [ … ] ]`).
  | { readonly kind: "dataschema" }
  // The records door (planes.md §4): structured slots — an array of records,
  // a plain record, a View reference. Literal form: null only; the values
  // arrive from `{ }` bindings (plain TS) and runtime writes.
  // `written`: a TypeScript type outside the vocabulary above (`Map<string,
  // number>`, `{ a: number }`, `string | null`) — stored as a plain value,
  // checked by TypeScript as written (resolveWrittenType's fallback).
  | { readonly kind: "object"; readonly written?: string }
  // `required`: a DECLARED attribute written without `?` (`target: View`) —
  // never empty, so null is not among its values. Schema slots never carry it.
  | { readonly kind: "view"; readonly required?: true }
  // `of` = the written ELEMENT type name when declared `Window[]` — carried for
  // the typechecker (a `{ }` body sees Window[], not any[]); runtime coercion
  // is per-kind and unchanged (`null` or a whole-value binding, as ever).
  | { readonly kind: "array"; readonly of?: string }
  | { readonly kind: "enum"; readonly name: string; readonly tokens: readonly string[];
      /** A vocabulary that also takes a NUMBER in this inclusive range — `fontWeight = 350`
       *  beside `fontWeight = medium` (CSS Fonts 4: the keywords are aliases for points
       *  on the 1–1000 line). The scaffold alias gains `| number`. */
      readonly numeric?: readonly [number, number] }
  // `required`: a DECLARED attribute written without `?` (`child: Menu`) —
  // never empty. A schema slot (`layout: Layout`) never carries it: null is
  // its "none".
  | { readonly kind: "class"; readonly of: string; readonly required?: true }
  // A FUNCTION type — `(id: string) -> void`, the type a method IS
  // (language §4). `written` is the source form; scaffold translates it.
  | { readonly kind: "fn"; readonly written: string }
  // R8: a slot whose value is a *place in a dataset* (View.datapath — the
  // cursor `:path` reads resolve against, language §9). Its written forms are
  // a `:path` literal (relative to the inherited cursor), a `{ }` expression
  // yielding a place, or `null`; only the null coerces — the other two are
  // standing relationships the checker routes to their own paths.
  | { readonly kind: "cursor" }
  // Animation (animation.md §3): the Animator.attribute slot's type — a bare
  // token that NAMES another slot on the animator's target. Its only literal
  // form is an identifier, and it stays a bare string at runtime; that the
  // named slot exists and is numeric is the one animation compile check, run
  // against the TARGET's schema at the element walk (check.ts), not here.
  | { readonly kind: "slotref" }
  // Styling: a typed token record (a Theme — a design-token record, wholesale-
  // swapped; provided as a named theme, a `{ }` binding, or an inline `Theme
  // [ … ]` record) and the three decoration slots, whose literal
  // forms are the ruled value CONSTRUCTORS (`gradient(…)`, `stroke(…)`,
  // `shadow(…)`) — self-naming, arity-checked, identical inside `{ }` where
  // the same names are ordinary functions in scope.
  // `required` as on class: a declared data record written without `?`.
  | { readonly kind: "record"; readonly name: string; readonly data?: true; readonly required?: true }
  | { readonly kind: "fill" }
  | { readonly kind: "stroke" }
  | { readonly kind: "outline" }
  | { readonly kind: "shadow" }
  // A filter list (graphics-pass.md §1): `filter` on the view's own paint,
  // `backdrop` on what lies beneath. Literal forms: one constructor
  // (`blur(3)`), a bare list of them (`[blur(3), brightness(0.8)]`), the
  // `frost(radius, saturation?)` pair, or `null` (the default) = none.
  | { readonly kind: "filter" }
  // A soft mask (graphics-pass.md §2): a gradient's alpha, or a View's
  // painted alpha. Literal forms: a gradient constructor or null; a stencil
  // view arrives from a `{ }` binding (`mask = { stencil }`).
  | { readonly kind: "mask" }
  // Animation (animation.md §1): an easing curve. Two written forms, both
  // already in the grammar — a bare named token (`easeBoth`, `quartOut`, like
  // any enum) or a value constructor (`cubicBezier(…)`, `back(…)`, `steps(…)`,
  // `laszlo(…)`, like `shadow(…)`). Resolves to a Motion value (animate.ts).
  | { readonly kind: "motion" }
  // Fonts: a family slot (`fontFamily`, `codeFamily`). Its literal form is a
  // family string or a list of them; from a { } it also takes a Font object or a
  // list mixing both (font-value.ts resolves it where text measures and paints).
  | { readonly kind: "font" }
  // A FontFace's `src`: a URL string, `url("…")`, `local("…")`, or a list of them.
  | { readonly kind: "faceSource" }
  // A FontFace's `weight`: a token, a number 1–1000, or `range(lo, hi)`.
  | { readonly kind: "faceWeight" };

/** Declare an enum attribute type: `enumType("Stretch", "none", "width", …)`
 *  — how §6's named unions declare. Built-in consumers: Image.stretches and
 *  Text.fontWeight (R3); user unions and Align slot in as pure data. */
export function enumType(name: string, ...tokens: string[]): AttrType {
  return { kind: "enum", name, tokens };
}
/** An enum that also takes a number in `[min, max]` — see AttrType's `numeric`. */
export function numericEnumType(name: string, range: readonly [number, number], ...tokens: string[]): AttrType {
  return { kind: "enum", name, tokens, numeric: range };
}

// What a user attribute declaration may name as its type (language §4:
// "ordinary TypeScript types plus the built-in value vocabulary of §6") —
// the TS primitives spelled as TS spells them, the value types capitalized
// as the doc capitalizes them. Arbitrary TS types are the tsc compiler
// path's surface; user `value` unions are their own future construct.
const DECLARED_TYPES: Readonly<Record<string, AttrType>> = {
  number: { kind: "number" },
  string: { kind: "string" },
  boolean: { kind: "boolean" },
  Color: { kind: "color" },
  Length: { kind: "length" },
  Radius: { kind: "radius" },
  Shape: { kind: "shape" },
  // An Inset (`View.padding`) is the same LITERAL shape as a Radius — one
  // number, or four clockwise — and rides the same routes: the coercer and the
  // bare-four-item-list path are the ones a Radius already has. It is its OWN
  // KIND because the names mean different things to a reader (corners vs edges,
  // and an Inset's four start at the TOP), and only a kind carries that to the
  // scaffold and from there to the reference.
  Inset: { kind: "inset" },
  // The records door (planes.md §4 — classes arrange records): a slot
  // holding an ARRAY of records (`items`), a plain OBJECT record, or a VIEW
  // reference (`opener`). Literal defaults are null-only — structured values
  // arrive from `{ }` bindings and runtime writes; the names stay precise
  // (no `any` in the vocabulary) so a declaration still documents intent.
  array: { kind: "array" },
  object: { kind: "object" },
  View: { kind: "view" },
  // The design-token record views style off, read with `provided("theme")`.
  // A named record type, declarable for an attribute that holds a theme.
  Theme: { kind: "record", name: "Theme" },
  // What `afterDelay` hands back: a node can keep the pending call and
  // `cancel()` it from a later handler (a notice that a newer one replaces).
  DelayHandle: { kind: "record", name: "DelayHandle", data: true },
  // Built-in VALUE ENUMS, declarable by name so a library-authored class keeps
  // the bare-token use-site surface (`axis = x`, `align = center`) — these are
  // as built-in as Color. (User-authored unions remain their own future
  // construct, per the note above.)
  Axis: enumType("Axis", "x", "y"),
  // A flow's MAIN-axis justification (`justify = center` centres a short row)
  // and a layout's CROSS-axis alignment — CSS's split of the two words. `none`
  // is a cross axis the strategy leaves to the children (SimpleLayout's
  // default); `baseline` aligns children by the baseline each DECLARES.
  Justify: enumType("Justify", "start", "center", "end", "fill"),
  CrossAlign: enumType("CrossAlign", "none", "start", "center", "end", "baseline"),
};

/** Resolve a written declaration type name (`count: number`), or null when
 *  the name is not in the declarable vocabulary. */
/** An AUTHORED literal union (`"idle" | "loading"`) is an enum whose NAME is
 *  the written union text — that text is the discriminator between it and a
 *  built-in vocabulary (Axis, Motion), whose name is an identifier. Every
 *  consumer asks this one question here, not with its own `startsWith('"')`. */
export const isAuthoredUnion = (name: string): boolean => name.startsWith('"');

/** The members of a written string-literal union, or null when `text` is not
 *  one. Quote-AWARE: the members are extracted as JSON string literals and
 *  must reconstruct the text exactly, so a member containing `|` (`"a|b" |
 *  "c"`) parses correctly — a bare split on `|` did not (review, 2026-09-04). */
export function parseLiteralUnion(text: string): string[] | null {
  if (!isAuthoredUnion(text)) return null;
  const lits = text.match(/"(?:[^"\\]|\\.)*"/g);
  if (lits === null || lits.join(" | ") !== text.trim()) return null;
  const out: string[] = [];
  for (const l of lits) { try { out.push(JSON.parse(l) as string); } catch { return null; } }
  return out;
}

/** A NULLABLE number or boolean — `number | null`, `null | number`, `number?`
 *  (and `| undefined`, which a slot holds as null): "n" or "b", else null. Such
 *  a slot stays in the kernel's table, its null carried by the cell's flag. */
export function nullablePrimitive(written: string): "n" | "b" | null {
  const parts = written.endsWith("?") ? [written.slice(0, -1).trim(), "null"] : written.split("|").map((p) => p.trim());
  if (parts.length !== 2) return null;
  const base = parts.filter((p) => p !== "null" && p !== "undefined");
  if (base.length !== 1) return null;
  return base[0] === "number" ? "n" : base[0] === "boolean" ? "b" : null;
}

export function declaredType(name: string): AttrType | null {
  return Object.hasOwn(DECLARED_TYPES, name) ? DECLARED_TYPES[name] : null;
}

/** The declarable type names, for the checker's "expected one of …" message. */
export const DECLARED_TYPE_NAMES: readonly string[] = Object.keys(DECLARED_TYPES);

/** The result of coercing one literal to one type: the typed value, or — for
 *  the checker's message — what the type expected, plus `found` when the
 *  coercer knows more than the raw literal shows (e.g. *why* a name is not a
 *  color). When `found` is absent the checker describes the literal itself. */
export type Coerced =
  | { readonly ok: true; readonly value: AttrValue }
  | { readonly ok: false; readonly expected: string; readonly found?: string };

const ok = (value: AttrValue): Coerced => ({ ok: true, value });

/** THE LITERAL SINK — compile time only. While the compiler checks the program
 *  it will ship, every literal coerced to a value is reported here, and the
 *  compiler ships the value in place of the written form
 *  (compiler/src/lower-literals.ts). Null at run time. */
let literalSink: ((lit: Literal, value: unknown) => void) | null = null;
export function withLiteralSink<T>(sink: (lit: Literal, value: unknown) => void, run: () => T): T {
  const prev = literalSink;
  literalSink = sink;
  try { return run(); } finally { literalSink = prev; }
}
/** Report a literal's value to the sink (coerceToken's untyped path uses it too). */
export function noteLiteral(lit: Literal, value: unknown): void {
  literalSink?.(lit, value);
}

/** Coerce a parsed literal to an attribute type. Pure — safe for the checker
 *  to call speculatively; instantiate assigns the same result. A literal the
 *  compiler already coerced (`value`) is its value; any other is parsed by the
 *  literal vocabulary (literal-parse.ts parseLiteral), which a build carries
 *  only when it can meet a literal still as written. */
export function coerce(type: AttrType, lit: Literal): Coerced {
  if (lit.kind === "value") return ok(lit.value as AttrValue);
  // A data shape is read as it is, not parsed: its parsed ShapeField
  // declarations pass through as plain data — an array-root document (`schema =
  // Task[]`) as the wrapper shape-resolve.ts defines, so validation knows the
  // root is an array. (Its names may resolve to recursive shapes, so the
  // compile cannot ship it as a value.)
  if (lit.kind === "schema" && type.kind === "dataschema") return ok((lit.arrayRoot === true ? { arrayRoot: true, fields: lit.shape } : lit.shape) as AttrValue);
  const c = parseLiteral(type, lit);
  if (c.ok && literalSink !== null) literalSink(lit, c.value);
  return c;
}

/** Coerce a theme-record token to its runtime value (checkThemeRecord vetted
 *  the shapes): numbers and strings pass through, hex/named colors ground as
 *  Color, `true`/`false`/`null` as themselves, a constructor call as the first
 *  of fill/stroke/shadow that admits it, and a LIST of any of those.
 *
 *  A list is a token because the rule the record actually keeps is "a token is
 *  bounded, plain data" — spreadable, comparable, serializable, inspectable
 *  without asking what kind of object it is — and a frozen array of literals is
 *  all of those. Excluding it did not keep lists out; it denied them a type, so
 *  the one the corpus needed most, a font stack, was written as a comma-joined
 *  string and parsed back into a list at the other end. ONE LEVEL: a list of
 *  lists is refused, which keeps "bounded" a fact rather than a hope. */
export function coerceToken(lit: Literal): unknown {
  if (lit.kind === "value") return lit.value;
  const v = tokenOf(lit);
  if (v !== undefined) noteLiteral(lit, v);
  return v;
}

function tokenOf(lit: Literal): unknown {
  switch (lit.kind) {
    case "list": {
      const out: unknown[] = [];
      for (const item of lit.items) {
        // one level: a nested list is not a token, and neither is anything else
        // coerceToken refuses — the whole list fails so the record's error names
        // the token, and checkThemeRecord says which item was wrong.
        if (item.kind === "list") return undefined;
        const v = coerceToken(item);
        if (v === undefined) return undefined;
        out.push(v);
      }
      return Object.freeze(out);
    }
    case "number":
      return lit.value;
    case "string":
      return lit.value;
    case "hexColor": {
      const c = coerce({ kind: "color" }, lit);
      return c.ok ? c.value : undefined;
    }
    case "ident": {
      if (lit.name === "true") return true;
      if (lit.name === "false") return false;
      if (lit.name === "null") return null;
      const c = coerce({ kind: "color" }, lit); // named colors
      return c.ok ? c.value : undefined;
    }
    case "call": {
      const asFill = coerce({ kind: "fill" }, lit);
      if (asFill.ok) return asFill.value;
      const asStroke = coerce({ kind: "stroke" }, lit);
      if (asStroke.ok) return asStroke.value;
      const asShadow = coerce({ kind: "shadow" }, lit);
      if (asShadow.ok) return asShadow.value;
      const asBackdrop = coerce({ kind: "filter" }, lit);
      return asBackdrop.ok ? asBackdrop.value : undefined;
    }
    default:
      return undefined;
  }
}

/** A literal as a message names it — "got the string \"wide\"". Hex-written
 *  numbers read back as hex, so a color message shows the channels. */
export function describeLiteral(lit: Literal): string {
  switch (lit.kind) {
    case "number":
      return `the number ${lit.hex && lit.value >= 0 ? "0x" + lit.value.toString(16).toUpperCase() : lit.value}`;
    case "percent":
      return `the percent ${lit.value}%`;
    case "string":
      return `the string ${JSON.stringify(lit.value)}`;
    case "hexColor":
      return `the color ${lit.raw}`;
    case "ident":
      return `'${lit.name}'`;
    case "code":
      // Unreachable through checkAttr (which routes { } to the binding
      // path before coercion), but coerce/describeLiteral are public and
      // must stay total over the literal union.
      return "a { … } expression";
    case "path":
      return `the datapath :${lit.path}${lit.many ? "[]" : ""}`;
    case "schema":
      return "a schema shape";
    case "call":
      return `'${lit.name}(…)'`;
    case "list":
      return `the list [${lit.items.map((i) => (i.kind === "ident" ? i.name : i.kind === "string" ? `"${i.value}"` : "…")).join(", ")}]`;
    case "value":
      return `the value ${JSON.stringify(lit.value)}`;
  }
}

/** Render a Color as a CSS color string (a DOM style value or a canvas
 *  fillStyle — both backends share this one encoding). Decodes both Color
 *  encodings: plain opaque 0xRRGGBB and the translucent form (see Color). */
export function colorToCss(c: Color): string {
  if (c === null) return "transparent";
  // A STRING reaching here is the classic seam mistake — a `{ }` body handed
  // `"#87CEEB"` (or a named color) where a color is a NUMBER (`0x87CEEB`).
  // Typed code can't do it (`Color = number | null`), but an `any` smuggles it
  // through, and the old arithmetic below then produced garbage CSS the
  // browser DISCARDED SILENTLY — a paint that simply never happens, no error
  // anywhere (measured cost: an hour of a real user's debugging, 2026-08-07).
  // Say it loudly, once per distinct value, and paint nothing on purpose.
  if (typeof c !== "number") {
    warnBadColor(c);
    return "transparent";
  }
  if (c < ALPHA) return "#" + c.toString(16).padStart(6, "0");
  const v = c - ALPHA;
  return "#" + Math.floor(v / 0x100).toString(16).padStart(6, "0") + (v % 0x100).toString(16).padStart(2, "0");
}

const badColors = new Set<string>();
function warnBadColor(c: unknown): void {
  const key = String(c);
  if (badColors.has(key) || typeof console === "undefined") return;
  badColors.add(key);
  const hex = /^#([0-9a-fA-F]{6})$/.exec(key);
  // one sentence, one code: the form the value should have taken is a hole,
  // itself a diagnostic sentence, never a concatenation the strip would skip
  const form = hex ? diag`write 0x${hex[1].toUpperCase()}` : diag`0xRRGGBB (named colors are bare-value vocabulary only)`;
  console.error(diag`[Declare] a color attribute received ${JSON.stringify(key)} (a ${typeof c}) — inside { } a color is a NUMBER: ${form}. Nothing was painted.`);
}
