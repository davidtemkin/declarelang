import { type Gradient, type Shadow, type Stroke } from "./value.js";
/** The box's retained paint state — the shape both surfaces keep. The solid
 *  fill is pre-resolved to a canvas fillStyle at set time (the R1 fast
 *  path); a gradient stays data (its geometry depends on the box). */
export interface BoxState {
    width: number;
    height: number;
    fill: string | null;
    gradient: Gradient | null;
    cornerRadius: number;
    stroke: Stroke | null;
    shadow: Shadow | null;
}
/** Paint `b` into `ctx` at the current transform's origin. `box` is the
 *  caller's cached Path2D for the box shape (invalidated on geometry/radius
 *  change); the possibly-rebuilt path is returned for re-caching. */
export declare function paintBox(ctx: CanvasRenderingContext2D, b: BoxState, box: Path2D | null): Path2D | null;
/** The box shape as a Path2D — a rounded rect (r > 0) or a plain rect. Shared
 *  by the fill/border paint and the drop-shadow paint so both trace the same
 *  outline. */
export declare function boxShape(w: number, h: number, r: number): Path2D;
/** The drop shadow, CSS box-shadow semantics: cast by the border box, never
 *  painted inside it. Painted by the caller BEFORE the view's own clip, so it
 *  escapes overflow the way a CSS box-shadow does. Canvas shadow state is
 *  DEVICE-space (untransformed), so offsets scale by the walk's transform; the
 *  shape itself is drawn far off-canvas with a compensating offset so only its
 *  shadow lands. */
export declare function paintBoxShadow(ctx: CanvasRenderingContext2D, box: Path2D, sh: Shadow): void;
/** A Gradient realized against a box, per CSS `linear-gradient` geometry:
 *  the angle is compass-style (0 up, clockwise), the line is centered and
 *  sized so the first/last stops touch the box's corners, and unplaced stops
 *  space evenly between their placed neighbors (first 0, last 1), offsets
 *  monotonic. */
export declare function realizeGradient(ctx: CanvasRenderingContext2D, g: Gradient, w: number, h: number): CanvasGradient;
/** The conservative pixel bounds of the box paint — the box plus its
 *  shadow's reach (offset + blur) — what sizes the DOM backend's per-view
 *  raster (the drawing-bounds discipline, applied to decoration). */
export declare function boxBounds(b: BoxState): {
    x: number;
    y: number;
    w: number;
    h: number;
};
