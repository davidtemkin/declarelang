import { View } from "./view.js";
import type { RenderBackend, Surface } from "./backend.js";
export declare class Markdown extends View {
    text: string;
    private built;
    attach(backend: RenderBackend, parentSurface: Surface | null, before?: Surface | null): void;
    private rebuild;
}
