import type { Literal } from "./parser.js";
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
    readonly color: number;
}
/** A linear gradient (a decoration Fill). `angle` is in degrees with CSS's
 *  compass semantics — 0 points up, clockwise; the constructor's default is
 *  180 (top → bottom). Plain immutable data — structured-cloneable, like
 *  every decoration value. */
export interface Gradient {
    readonly angle: number;
    readonly stops: readonly GradientStop[];
}
/** What paints a view's box: a solid Color (null = paint nothing) or a
 *  Gradient — the ruled `fill` slot's type, subsuming backgroundColor. */
export type Fill = Color | Gradient;
/** Narrow a Fill to its gradient arm. */
export declare function isGradient(f: Fill): f is Gradient;
/** A border drawn INSIDE the view box (ruled: `stroke` over CSS's `border` —
 *  the box stays the layout/hit fact, per R5's hit-region rule). */
export interface Stroke {
    readonly width: number;
    readonly color: number;
}
/** A drop shadow (`shadow` on the view box, `textShadow` on glyphs) — the
 *  CSS box-shadow shape minus spread, until a consumer needs it. */
export interface Shadow {
    readonly dx: number;
    readonly dy: number;
    readonly blur: number;
    readonly color: number;
}
export declare function gradient(...args: (number | string | GradientStop)[]): Gradient;
export declare const stop: (offset: number, color: number) => GradientStop;
export declare const stroke: (width: number, color: number) => Stroke;
export declare const shadow: (dx: number, dy: number, blur: number, color: number) => Shadow;
export declare function shadowEqual(a: Shadow | null, b: Shadow | null): boolean;
export declare function strokeEqual(a: Stroke | null, b: Stroke | null): boolean;
export declare function fillEqual(a: Fill, b: Fill): boolean;
/** A theme: a plain immutable record of design tokens (ruled, v1 —
 *  wholesale-swapped, never mutated in place). The default is the HOUSE
 *  theme (design/components-baseline.md Contract 2): the ruled v1 role
 *  vocabulary with the house light palette, so `theme.role` in library
 *  components ALWAYS resolves — no provider means the house look, never a
 *  fallback expression in component source. `depth` (0 = flat …
 *  1 = dimensional) is the treatment dial components translate in their
 *  decoration constraints. Partial reskin is explicit-base spread:
 *  `theme = { { ...app.theme, accent: 0xE05252 } }`. (The dark-aware house —
 *  a binding default off `app.dark` — is the noted follow-up.) */
export type Theme = Readonly<Record<string, unknown>>;
export declare const DEFAULT_THEME: Theme;
/** A parent-relative percentage, as written (`{ percent: 50 }` for `50%`).
 *  It stays symbolic: resolving it against a parent measurement is constraint
 *  work that lands at R4 — until then instantiate refuses it loudly rather
 *  than misrendering 50% as 50px (see instantiate.ts). */
export interface Percent {
    readonly percent: number;
}
/** A Length: pixels (a bare number) or a parent-relative Percent. */
export type Length = number | Percent;
/** A coerced literal — ready to assign to a typed view field. Percent is the
 *  one member with no field to land in yet (see above); the decoration
 *  records (Gradient/Stroke/Shadow) arrive from constructor literals. */
export type AttrValue = number | boolean | string | null | Percent | Gradient | Stroke | Shadow | Motion;
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
    readonly kind: "length" | "number" | "boolean" | "string" | "color" | "shape";
} | {
    readonly kind: "enum";
    readonly name: string;
    readonly tokens: readonly string[];
} | {
    readonly kind: "component";
    readonly of: string;
} | {
    readonly kind: "cursor";
} | {
    readonly kind: "slotref";
} | {
    readonly kind: "record";
    readonly name: string;
} | {
    readonly kind: "fill";
} | {
    readonly kind: "stroke";
} | {
    readonly kind: "shadow";
} | {
    readonly kind: "motion";
} | {
    readonly kind: "styles";
} | {
    readonly kind: "stylesheet";
} | {
    readonly kind: "cssRules";
} | {
    readonly kind: "font";
};
/** Declare an enum attribute type: `enumType("Stretch", "none", "width", …)`
 *  — how §6's named unions declare. Built-in consumers: Image.stretches and
 *  Text.fontWeight (R3); user unions and Align slot in as pure data. */
export declare function enumType(name: string, ...tokens: string[]): AttrType;
/** Resolve a written declaration type name (`count: number`), or null when
 *  the name is not in the declarable vocabulary. */
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
/** A literal as a message names it — "got the string \"wide\"". Hex-written
 *  numbers read back as hex, so a color message shows the channels. */
export declare function describeLiteral(lit: Literal): string;
/** Render a Color as a CSS color string (a DOM style value or a canvas
 *  fillStyle — both backends share this one encoding). Decodes both Color
 *  encodings: plain opaque 0xRRGGBB and the translucent form (see Color). */
export declare function colorToCss(c: Color): string;
