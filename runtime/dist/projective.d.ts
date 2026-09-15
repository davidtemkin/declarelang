import type { Affine } from "./affine.js";
/** Row-major 3×3: [x-row, y-row, w-row]. */
export type Homography = readonly [number, number, number, number, number, number, number, number, number];
export interface Parts3D {
    rotateX: number;
    rotateY: number;
    translateZ: number;
}
export declare const has3D: (p: Parts3D) => boolean;
/** local (u, v) on the plane → the PARENT's coordinates, as a homography.
 *  `affine` is the view's 2D matrix (about its pivot), `x`/`y` its position in
 *  the parent, `pivot` the 3D rotation's centre (the same pivot), `P` the
 *  parent's perspective (0 = orthographic) about the parent-space origin
 *  (ox, oy). */
export declare function homography(affine: Affine, x: number, y: number, pivotX: number, pivotY: number, p3: Parts3D, P: number, ox: number, oy: number): Homography;
export declare const applyH: (h: Homography, x: number, y: number) => [number, number];
export declare function invertH(h: Homography): Homography;
/** Is a point on the plane in FRONT of the eye (w > 0)? Behind it there is
 *  nothing to hit — the inverse would name a point the viewer cannot see. */
export declare const inFront: (h: Homography, x: number, y: number) => boolean;
/** The projected quad of a local box, and its axis-aligned bounds. */
export declare function quadThrough(h: Homography, x: number, y: number, w: number, hgt: number): [number, number][];
export declare function boxThroughH(h: Homography, x: number, y: number, w: number, hgt: number): {
    x: number;
    y: number;
    width: number;
    height: number;
};
/** The affine that agrees with the homography at three corners of a box —
 *  the similarity-shaped facts (rootTransform, apparentScale) of a 3D view. */
export declare function affineFit(h: Homography, w: number, hgt: number): Affine;
/** Is the view's FRONT face toward the viewer? The projected quad's winding
 *  flips when the back shows (backface = hidden hides it then). */
export declare function frontFacing(h: Homography, w: number, hgt: number): boolean;
/** A view as the 3D paths read it. */
export interface View3D {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly pivotX: number;
    readonly pivotY: number;
    readonly rotateX?: number;
    readonly rotateY?: number;
    readonly translateZ?: number;
    readonly backface?: string;
    readonly perspective?: number;
}
/** What a surface is handed for a view out of its plane: its rotation, and the
 *  parent's eye (perspective about the parent's box centre). */
export interface Spec3D {
    rotateX: number;
    rotateY: number;
    translateZ: number;
    backfaceHidden: boolean;
    perspective: number;
    originX: number;
    originY: number;
}
/** The seam spec for `v` under `parent`, or null for a view that stays in its plane. */
export declare function spec3DOf(v: View3D, parent: View3D | null): Spec3D | null;
/** Child `c`'s map local → `parent`'s coordinates, or null for a view that
 *  stays in its plane. `affine` is asked only for a view that leaves it. */
export declare function childHomography(parent: View3D | null, c: View3D, affine: () => Affine): Homography | null;
/** A parent-space point → child `c`'s plane through its homography; far away
 *  when it lies behind the eye or lands on a hidden back face (nothing to hit). */
export declare function unprojectChild(h: Homography, c: View3D, x: number, y: number): [number, number];
/** A point → the plane through `h` (no back-face rule), far away behind the eye. */
export declare function unproject(h: Homography, x: number, y: number): [number, number];
/** A 3D view's layout footprint: the projected quad's bounds, measured as if the
 *  vanishing point sat at the view's own pivot — position-free by construction
 *  (the exact projection depends on where the view sits in a parent that may be
 *  sizing itself from this very footprint; hit-testing uses the exact homography). */
export declare function footprint3D(v: View3D, affine: Affine, parentPerspective: number): {
    x: number;
    y: number;
    width: number;
    height: number;
};
/** The DOM's realization: the homography its pointer inverse keeps, and the CSS
 *  3D transform about the pivot that goes between the translation and the matrix. */
export declare function domTransform3D(affine: Affine, x: number, y: number, pivotX: number, pivotY: number, d: Spec3D): {
    h: Homography;
    css: string;
};
