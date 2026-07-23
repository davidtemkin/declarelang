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
    /** A Text's own content folds into `contentWidth`/`contentHeight` as its
     *  MEASURED glyph extent — the way an Image folds in its bitmap (view.ts
     *  contentExtent). Without this a Text reported the base 0, so a container
     *  sizing to `label.contentWidth` (an auto-sized pill/badge) always read
     *  empty. Reads `text` and the font slots under tracking (contentExtent runs
     *  tracked), so it re-measures when the text or style changes — the fix for
     *  content-bound labels. The natural single-line width; height follows the
     *  wrapped line count when the width is bounded, matching the derives above. */
    protected contentExtent(size: "width" | "height"): number;
    /** The ink band (y axis): first line's cap top to the last line's baseline
     *  — what `y = center` centers (bind.ts bindAlign). Descenders hang below
     *  the band as overhang, per typographic convention. The x axis stays the
     *  geometric box. */
    alignBand(axis: "x" | "y"): {
        lead: number;
        size: number;
    };
    protected flush(s: Surface): void;
}
