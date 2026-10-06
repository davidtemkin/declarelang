import type { Literal } from "./parser.js";
import { type AttrType, type Coerced, type GradientStop } from "./value.js";
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
/** Coerce the written form of a literal to a slot's type (value.ts coerce):
 *  the whole literal vocabulary, and the reason a written form is not one of
 *  the type's. A compiled program ships its literals as the values this
 *  produced at compile time, so a build carries it only for a literal that
 *  arrives as written — rich text's inline views, and what the compile could
 *  not ship as a value. */
export declare function parseLiteral(type: AttrType, lit: Literal): Coerced;
