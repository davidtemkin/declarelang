import { type BoxStroke, type Coerced, type Stroke } from "./value.js";
import type { Literal } from "./parser.js";
/** The four sides of a BoxStroke — top, right, bottom, left. A single Stroke
 *  (or null) answers on every side, so one branch serves both written forms. */
export declare function strokeSides(s: BoxStroke): [Stroke | null, Stroke | null, Stroke | null, Stroke | null];
/** The uniform Stroke a four-side LIST is on all four sides, or null when it is
 *  bare on all four — and `undefined` when the sides genuinely differ, which is
 *  the signal to take a painter's per-side path. `strokeUniform` (value.ts)
 *  answers the single-Stroke and null forms itself and defers here only for a
 *  list, so this is the only piece of the question that is per-side. */
export declare function sidesUniform(s: readonly (Stroke | null)[]): Stroke | null | undefined;
/** Structural equality where either side is a four-side list — the arm
 *  `strokeEqual` (value.ts) hands over once it knows one of them is. */
export declare function sidesEqual(a: BoxStroke, b: BoxStroke): boolean;
/** The per-side literal's coercion: four, clockwise from the top, `null` for a
 *  bare side. A list reaches coercion whole (like a filter list) — refused here
 *  by shape, because a two-item list is a mistake, not a shorthand. `one` is
 *  value.ts's single-stroke coercer and `expected` its wording, so the type and
 *  its diagnostic stay one thing. */
export declare function coerceStrokeSides(lit: Literal & {
    kind: "list";
}, one: (l: Literal) => Coerced, expected: string): Coerced;
/** The per-side border on CANVAS. Each side is painted as the box MINUS a copy
 *  of itself shifted in from that edge by the side's width, clipped to the box —
 *  which is exactly what a zero-blur inset shadow paints, and is how the DOM
 *  backend spells the same thing (`sideShadows`, four `inset` box-shadows). Two
 *  consequences worth knowing, and they are the same on both backends:
 *
 *   • On a ROUNDED box a side's band follows the corner arc and tapers into it,
 *     rather than being mitred against its neighbour. Two adjacent stroked
 *     sides therefore meet along the curve with a hairline of overlap, not a
 *     diagonal seam; two opposite ones (the rules-only case this exists for)
 *     never meet at all.
 *   • Sides of DIFFERENT widths do not mitre either — each is its own band. */
export declare function paintSides(ctx: CanvasRenderingContext2D, box: Path2D, s: BoxStroke, w: number, h: number): void;
/** The per-side border on the DOM — one `inset` box-shadow per stroked side, in
 *  the order the shadow list wants them. `inset 0 Wpx 0 0` leaves a band of W
 *  along the top, and its three rotations do the other edges. On a rounded box
 *  each band follows the corner arc and tapers into it (the browser clips an
 *  inset shadow to the border box), which is the same shape `paintSides` draws
 *  — a rounded card with only its top and bottom stroked gets two rules that
 *  curve away at the corners rather than two straight lines butting into them. */
export declare function sideShadows(s: BoxStroke): string[];
