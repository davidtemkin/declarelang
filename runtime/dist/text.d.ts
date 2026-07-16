import { View } from "./view.js";
import type { RenderBackend, Surface } from "./backend.js";
import { type Fill, type Shadow } from "./value.js";
export declare class Text extends View {
    text: string;
    /** The glyphs' drop shadow (a decoration value, styling rung); null = none.
     *  Replaces the two-stacked-runs idiom (weather's ShadowText). */
    textShadow: Shadow | null;
    /** A bounded-width run wraps (default) or stays a single line. */
    wrap: boolean;
    textAlign: "left" | "center" | "right";
    italic: boolean;
    textFill: Fill | null;
    attach(backend: RenderBackend, parentSurface: Surface | null): void;
    protected flush(s: Surface): void;
}
