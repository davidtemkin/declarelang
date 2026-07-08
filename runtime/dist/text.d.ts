import { View } from "./view.js";
import type { RenderBackend, Surface } from "./backend.js";
import { type Shadow } from "./value.js";
export declare class Text extends View {
    text: string;
    /** The glyphs' drop shadow (a decoration value, styling rung); null = none.
     *  Replaces the two-stacked-runs idiom (neoweather's ShadowText). */
    textShadow: Shadow | null;
    attach(backend: RenderBackend, parentSurface: Surface | null): void;
    protected flush(s: Surface): void;
}
