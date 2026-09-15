export type Affine = readonly [number, number, number, number, number, number];
export declare const IDENTITY: Affine;
/** The per-view parts, as the attributes name them (degrees, clockwise on a
 *  y-down screen). `scale` is the uniform shorthand multiplied into both axes. */
export interface TransformParts {
    scale: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    skewX: number;
    skewY: number;
    pivotX: number;
    pivotY: number;
}
export declare const isIdentityParts: (p: TransformParts) => boolean;
/** M = T(pivot) · R(rotation) · K(skew) · S(scale) · T(−pivot): scale first,
 *  then skew, then rotate — about the shared pivot (the documented order; for
 *  a uniform scale and no skew it collapses to the old similarity). */
export declare function fromParts(p: TransformParts): Affine;
export declare const apply: (m: Affine, x: number, y: number) => [number, number];
/** m1 ∘ m2 — apply m2 first, then m1. */
export declare function compose(m1: Affine, m2: Affine): Affine;
/** The inverse, or the identity for a degenerate (zero-scale) matrix — a
 *  collapsed view is hit nowhere, and the callers check the box after. */
export declare function invert(m: Affine): Affine;
/** The uniform scale a general matrix "is" — √|det|, the geometric mean of
 *  the axis scales — and its rotation: what raster density and the
 *  similarity-shaped facts (`apparentScale`, `rootTransform().scale`) report. */
export declare const scaleOf: (m: Affine) => number;
export declare const rotationOf: (m: Affine) => number;
export declare const isIdentity: (m: Affine) => boolean;
/** A local box through the matrix — its axis-aligned footprint. */
export declare function boxThrough(m: Affine, x: number, y: number, w: number, h: number): {
    x: number;
    y: number;
    width: number;
    height: number;
};
export declare const cssMatrix: (m: Affine) => string;
