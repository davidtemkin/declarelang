import type { RenderBackend, Surface } from "./backend.js";
export declare class DomBackend implements RenderBackend {
    createSurface(): Surface;
    attachRoot(host: HTMLElement, root: Surface): void;
}
