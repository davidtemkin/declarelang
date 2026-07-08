import type { RenderBackend, Surface } from "./backend.js";
export declare class CanvasBackend implements RenderBackend {
    private readonly compositor;
    createSurface(): Surface;
    attachRoot(host: HTMLElement, root: Surface): void;
}
