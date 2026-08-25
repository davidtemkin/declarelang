/** The subset of CSS filter functions expressible here. `blur` is the pyramid;
 *  the rest are a per-pixel matrix folded into one pass over the small buffer. */
export interface FilterSpec {
    blur: number;
    saturate: number;
    brightness: number;
    contrast: number;
    grayscale: number;
    invert: number;
    /** Functions present in the string that this cannot express — reported, not applied. */
    unsupported: string[];
}
/** Parse the CSS filter subset. A percentage or a plain number both work, as in
 *  CSS (`saturate(180%)` === `saturate(1.8)`). */
export declare function parseFilter(css: string): FilterSpec;
export declare function isIdentity(f: FilterSpec): boolean;
export declare function ctxFilterSupported(): boolean;
/** @internal test seam — force the fallback path on an engine that has filter,
 *  so the two can be diffed against each other. */
export declare function forceFilterFallback(on: boolean): void;
/** Apply `spec` to `src` and return a canvas holding the result. The caller owns
 *  neither buffer beyond the next call — this recycles scratch canvases, because
 *  frost runs every frame the scene invalidates and allocating two canvases per
 *  frosted view per frame is its own performance bug.
 *
 *  A wide blur is done on a DOWNSAMPLED buffer and scaled back: the cost then
 *  falls with the square of the factor, and the resampling either side is itself
 *  part of the blur, so its contribution is subtracted from the box passes
 *  rather than ignored. The colour matrix rides the same small buffer. */
export declare function applyFilterFallback(src: HTMLCanvasElement, spec: FilterSpec): HTMLCanvasElement;
