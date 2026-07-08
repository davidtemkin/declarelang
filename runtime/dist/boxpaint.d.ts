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
