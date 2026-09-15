import type { DisplayList, DrawImageSource, DrawOp } from "./draw.js";
export declare function registerDrawImage(h: number, bitmap: CanvasImageSource): void;
export declare function drawImageBitmap(h: number): CanvasImageSource | undefined;
/** The image handles a recording references — what a raster worker must hold
 *  before it can replay the list. */
export declare function drawImageHandles(list: DisplayList): number[];
/** The op for Canvas2D's three shapes — (img, dx, dy), (img, dx, dy, dw, dh),
 *  and (img, sx, sy, sw, sh, dx, dy, dw, dh) — over an `Image` view, or null for
 *  an image that has not loaded (the read of `loaded` is the dependency that
 *  re-runs the body when it does). */
export declare function drawImageOp(image: DrawImageSource, a: number[]): Extract<DrawOp, {
    op: "drawImage";
}> | null;
