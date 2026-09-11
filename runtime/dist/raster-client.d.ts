import type { DisplayList } from "./draw.js";
export interface RasterRequest {
    list: DisplayList;
    sx: number;
    sy: number;
    bx: number;
    by: number;
    w: number;
    h: number;
    blankCheck: boolean;
}
export interface RasterResult {
    bitmap: ImageBitmap;
    rasterMs: number;
    blank: boolean;
}
/** Can this engine raster off the main thread at all? */
export declare function rasterWorkerAvailable(): boolean;
/** Raster a recording off the main thread. Resolves null when the worker
 *  could not (the caller falls back to vectors or a synchronous raster). */
export declare function rasterInWorker(req: RasterRequest): Promise<RasterResult | null>;
/** @internal diag: how many rasters are in flight */
export declare function rasterWorkerPending(): number;
