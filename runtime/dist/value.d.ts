import type { Literal, ShapeField } from "./parser.js";
import { type Motion } from "./animate.js";
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
/** Encode rgb (0xRRGGBB) + alpha (0…255) as one Color number. */
export declare function colorWithAlpha(rgb: number, a: number): number;
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
export declare function gradientCss(g: Gradient): string;
/** What paints a view's box: a solid Color (null = paint nothing) or a
 *  Gradient — the ruled `fill` slot's type, subsuming backgroundColor. */
export type Fill = Color | Gradient;
/** Narrow a Fill to its gradient arm. */
export declare function isGradient(f: Fill): f is Gradient;
/** A border drawn INSIDE the view box (ruled: `stroke` over CSS's `border` —
 *  the box stays the layout/hit fact, per R5's hit-region rule). */
export interface Stroke {
    readonly width: number;
    readonly color: Color;
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
export type Filter = {
    readonly fn: "blur";
    readonly radius: number;
} | {
    readonly fn: "brightness" | "contrast" | "saturate" | "grayscale" | "invert" | "sepia";
    readonly amount: number;
} | {
    readonly fn: "hueRotate";
    readonly degrees: number;
} | {
    readonly fn: "tint";
    readonly color: Color;
} | Shadow;
/** What a `backdrop` slot holds: the frost is a filter list applied to the
 *  sample beneath the view's own painted shape, under the view's own fill.
 *  `frost(radius, saturation?)` builds the common pair. */
export type Backdrop = readonly Filter[];
/** What a `mask` slot holds (graphics-pass.md §2): a Gradient (its ALPHA over
 *  the view's box), or a View — the stencil — whose painted alpha, placed by
 *  its own x/y inside the masked view's box, is the mask. A stencil is usually
 *  a `visible = false` child. Plain data or a node reference; the seam
 *  resolves the node's surface lazily (backend.ts MaskSpec). */
export type Mask = Gradient | {
    readonly surface: unknown;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
};
export declare function isMaskGradient(m: Mask): m is Gradient;
/** A `filter`/`backdrop` value as written or bound: one function, a list, or
 *  null — normalized to a frozen list (empty = none) at the seam. */
export type FilterValue = Filter | readonly Filter[] | null;
export declare function filterList(v: FilterValue | undefined): readonly Filter[];
export declare function gradient(...args: (number | string | GradientStop)[]): Gradient;
export declare const stop: (offset: number, color: Color) => GradientStop;
export declare const stroke: (width: number, color: Color) => Stroke;
export declare const outline: (width: number, color: Color) => Outline;
export declare const shadow: (dx: number, dy: number, blur: number, color: Color) => Shadow;
/** The CSS spelling of a filter list — DOM `filter:`/`backdrop-filter:` and
 *  canvas `ctx.filter` share it. `scale` maps view units to the target's
 *  (device px on canvas, 1 on the DOM where CSS scales with the transform).
 *  `tint` has no CSS function: the DOM realizes it as an SVG `feColorMatrix`
 *  reference the backend registers (`tintRef`), canvas as a `source-in` pass
 *  after the blit — both leave it out of this string. */
export declare function filterCss(list: readonly Filter[], scale?: number, tintRef?: (color: Color) => string): string;
/** How far a filter's output can reach past the painted box, in view units —
 *  a blur's 3σ, a shadow's offset plus its 3σ. The over-scan a backdrop sample
 *  and an offscreen group both pad by (graphics-pass.md §0, the bleed rule). */
export declare function filterBleed(list: readonly Filter[]): number;
/** The largest blur radius in a list — what a frost's sample over-scans by. */
export declare function filterBlur(list: readonly Filter[]): number;
export declare function shadowEqual(a: Shadow | null, b: Shadow | null): boolean;
export declare function strokeEqual(a: Stroke | null, b: Stroke | null): boolean;
export declare function outlineEqual(a: Outline | null, b: Outline | null): boolean;
export declare function filterEqual(a: Filter, b: Filter): boolean;
/** Structural equality over a filter value in any written form (one, a list, null). */
export declare function filtersEqual(a: FilterValue | undefined, b: FilterValue | undefined): boolean;
export declare function backdropEqual(a: Backdrop | null, b: Backdrop | null): boolean;
export declare function fillEqual(a: Fill, b: Fill): boolean;
/** A theme: a plain immutable record of design tokens (ruled, v1 —
 *  wholesale-swapped, never mutated in place). `theme.role` in library
 *  components ALWAYS resolves: `Control` declares `theme: Theme = { provided(
 *  "theme", SanFrancisco) }`, so no provider means San Francisco, never a
 *  fallback expression in component source. `depth` (0 = flat … 1 =
 *  dimensional) is the treatment dial components translate in their decoration
 *  constraints. Partial reskin is explicit-base spread:
 *  `theme = { { ...provided("theme"), accent: 0xE05252 } }`. */
export type Theme = Readonly<Record<string, unknown>>;
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
export declare function isAlign(v: unknown): v is Align;
/** A Length: pixels (a bare number) or a parent-relative Percent. */
export type Length = number | Percent;
/** A box's corner rounding: ONE radius for all four corners, or FOUR — top-left,
 *  top-right, bottom-right, bottom-left, clockwise from the top-left as CSS orders
 *  them. `[0, 8, 0, 8]` rounds only the top-right and bottom-left; a corner given
 *  `0` stays square. The number form is the whole language of before; the list
 *  form is what a shape that continues past its own edge needs (a chip cut at a
 *  line break, a tab joined to its pane, a segment in a bar). */
export type Radius = number | readonly [number, number, number, number];
export declare function radiusCorners(r: Radius): [number, number, number, number];
export declare function radiusIsSquare(r: Radius): boolean;
export declare function radiusMax(r: Radius): number;
/** The four corners fitted to a w×h box the way CSS fits border-radius: when
 *  two adjacent radii would overlap along an edge, EVERY radius shrinks by the
 *  same factor, so the shape stays a scaled copy of the one asked for. A uniform
 *  radius past half the box lands at half the box — a pill — exactly as before. */
export declare function radiusFit(r: Radius, w: number, h: number): [number, number, number, number];
/** A coerced literal — ready to assign to a typed view field. Percent is the
 *  one member with no field to land in yet (see above); the decoration
 *  records (Gradient/Stroke/Shadow) arrive from constructor literals. */
export type AttrValue = number | boolean | string | null | Percent | Align | Gradient | Stroke | Shadow | readonly Filter[] | Mask | Motion | readonly ShapeField[] | {
    readonly arrayRoot: true;
    readonly fields: readonly ShapeField[];
};
/** Narrow an AttrValue to the Percent arm (no longer the only object in the
 *  union since decoration values landed — the key is the discriminant). */
export declare function isPercent(v: AttrValue): v is Percent;
/** An attribute's declared type — the currency of the component schemas
 *  (schema.ts). The enum arm carries its name and full token set so a schema
 *  line reads as the union declaration it stands for. The component arm (R7)
 *  types a slot whose VALUE is a component instance — View.layout: a Layout —
 *  written as the member `layout: SimpleLayout [ … ]` (the checker routes
 *  that member shape here; the only literal such a slot coerces is `null`). */
export type AttrType = {
    readonly kind: "length" | "number" | "boolean" | "string" | "color" | "shape" | "radius";
} | {
    readonly kind: "dataschema";
} | {
    readonly kind: "object" | "view";
} | {
    readonly kind: "array";
    readonly of?: string;
} | {
    readonly kind: "enum";
    readonly name: string;
    readonly tokens: readonly string[];
    /** A vocabulary that also takes a NUMBER in this inclusive range — `fontWeight = 350`
     *  beside `fontWeight = medium` (CSS Fonts 4: the keywords are aliases for points
     *  on the 1–1000 line). The scaffold alias gains `| number`. */
    readonly numeric?: readonly [number, number];
} | {
    readonly kind: "component";
    readonly of: string;
} | {
    readonly kind: "fn";
    readonly written: string;
} | {
    readonly kind: "cursor";
} | {
    readonly kind: "slotref";
} | {
    readonly kind: "record";
    readonly name: string;
    readonly data?: true;
} | {
    readonly kind: "fill";
} | {
    readonly kind: "stroke";
} | {
    readonly kind: "outline";
} | {
    readonly kind: "shadow";
} | {
    readonly kind: "filter";
} | {
    readonly kind: "mask";
} | {
    readonly kind: "motion";
} | {
    readonly kind: "font";
} | {
    readonly kind: "faceSource";
} | {
    readonly kind: "faceWeight";
};
/** Declare an enum attribute type: `enumType("Stretch", "none", "width", …)`
 *  — how §6's named unions declare. Built-in consumers: Image.stretches and
 *  Text.fontWeight (R3); user unions and Align slot in as pure data. */
export declare function enumType(name: string, ...tokens: string[]): AttrType;
/** An enum that also takes a number in `[min, max]` — see AttrType's `numeric`. */
export declare function numericEnumType(name: string, range: readonly [number, number], ...tokens: string[]): AttrType;
/** Resolve a written declaration type name (`count: number`), or null when
 *  the name is not in the declarable vocabulary. */
/** An AUTHORED literal union (`"idle" | "loading"`) is an enum whose NAME is
 *  the written union text — that text is the discriminator between it and a
 *  built-in vocabulary (Axis, Motion), whose name is an identifier. Every
 *  consumer asks this one question here, not with its own `startsWith('"')`. */
export declare const isAuthoredUnion: (name: string) => boolean;
/** The members of a written string-literal union, or null when `text` is not
 *  one. Quote-AWARE: the members are extracted as JSON string literals and
 *  must reconstruct the text exactly, so a member containing `|` (`"a|b" |
 *  "c"`) parses correctly — a bare split on `|` did not (review, 2026-09-04). */
export declare function parseLiteralUnion(text: string): string[] | null;
export declare function declaredType(name: string): AttrType | null;
/** The declarable type names, for the checker's "expected one of …" message. */
export declare const DECLARED_TYPE_NAMES: readonly string[];
/** The result of coercing one literal to one type: the typed value, or — for
 *  the checker's message — what the type expected, plus `found` when the
 *  coercer knows more than the raw literal shows (e.g. *why* a name is not a
 *  color). When `found` is absent the checker describes the literal itself. */
export type Coerced = {
    readonly ok: true;
    readonly value: AttrValue;
} | {
    readonly ok: false;
    readonly expected: string;
    readonly found?: string;
};
/** Coerce a parsed literal to an attribute type. Pure — safe for the checker
 *  to call speculatively; instantiate assigns the same result. */
export declare function coerce(type: AttrType, lit: Literal): Coerced;
export declare const FILL: string;
/** A constructor argument as a plain color number (no null). */
export declare function argColor(lit: Literal): number | null;
export declare function argNumber(lit: Literal): number | null;
/** The stops of a written gradient call (after its geometry arguments). */
export declare function coerceStops(args: Literal[]): GradientStop[] | string;
export declare function coerceShadow(lit: Literal): Coerced;
/** A literal as a message names it — "got the string \"wide\"". Hex-written
 *  numbers read back as hex, so a color message shows the channels. */
export declare function describeLiteral(lit: Literal): string;
/** Render a Color as a CSS color string (a DOM style value or a canvas
 *  fillStyle — both backends share this one encoding). Decodes both Color
 *  encodings: plain opaque 0xRRGGBB and the translucent form (see Color). */
export declare function colorToCss(c: Color): string;
