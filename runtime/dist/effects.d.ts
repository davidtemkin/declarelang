import { type Backdrop, type Coerced, type Color, type Filter, type Gradient, type GradientStop } from "./value.js";
import type { Literal } from "./parser.js";
/** `radialGradient(cx, cy, r, stops…)` — centre as fractions of the box, reach
 *  as a fraction of the farthest-corner distance (graphics-pass.md §3). */
export declare function radialGradient(cx: number, cy: number, r: number, ...args: (number | GradientStop)[]): Gradient;
/** `conicGradient(cx, cy, angleDeg, stops…)` — a sweep from `angle` (CSS `from`, 0 = up, clockwise). */
export declare function conicGradient(cx: number, cy: number, angle: number, ...args: (number | GradientStop)[]): Gradient;
export declare const blur: (radius: number) => Filter;
export declare const brightness: (amount: number) => Filter;
export declare const contrast: (amount: number) => Filter;
export declare const saturate: (amount: number) => Filter;
export declare const grayscale: (amount: number) => Filter;
export declare const invert: (amount: number) => Filter;
export declare const sepia: (amount: number) => Filter;
export declare const hueRotate: (degrees: number) => Filter;
/** `colorize(color)`: the group's alpha in one colour (template-image rendering) —
 *  what `Image.tint` is sugar for. (`tint(…)` is the theme helper's name.) */
export declare const colorize: (color: Color) => Filter;
/** The frost: blur + saturate, the material pair every platform's menus wear. */
export declare const frost: (radius: number, saturation?: number) => Backdrop;
/** A written `radialGradient(…)` / `conicGradient(…)` fill. */
export declare function coerceRadialConic(lit: Extract<Literal, {
    kind: "call";
}>): Coerced;
/** A written `filter` / `backdrop` value: one function, a list, `frost(…)`, or null. */
export declare function coerceFilter(lit: Literal): Coerced;
