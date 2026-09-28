import type { Literal } from "./parser.js";
import { type Coerced, type GradientStop } from "./value.js";
export declare function coerceColor(lit: Literal): Coerced;
export declare const FILL: string;
/** A constructor argument as a plain color number (no null). */
export declare function argColor(lit: Literal): number | null;
export declare function argNumber(lit: Literal): number | null;
/** The stops of a written gradient call (after its geometry arguments). */
export declare function coerceStops(args: Literal[]): GradientStop[] | string;
export declare function coerceFill(lit: Literal): Coerced;
export declare function coerceStroke(lit: Literal): Coerced;
export declare function coerceOutline(lit: Literal): Coerced;
export declare function coerceShadow(lit: Literal): Coerced;
export declare function coerceMotion(lit: Literal): Coerced;
export declare function coerceShape(lit: Literal): Coerced;
/** A mask: a gradient whose alpha masks the view, or null. */
export declare function coerceMask(lit: Literal): Coerced;
