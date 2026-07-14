import type { RenderBackend, Surface } from "./backend.js";
export declare class HeadlessBackend implements RenderBackend {
    createSurface(): Surface;
    /** No page to root into — the tree lives (and settles) unrooted. */
    attachRoot(_host: HTMLElement, _root: Surface): void;
}
