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
    lineHeight: number;
    /** The per-line advance: the declared leading (a fontSize multiplier, the
     *  Markdown convention) or, at the 0 default, the font's natural line box. */
    private lineAdvance;
    /** The effective font's ascent above the baseline (the font bounding box,
     *  a property of the font — independent of this run's characters). */
    get ascent(): number;
    /** The effective font's descent below the baseline — ascent + descent is
     *  the natural line box. */
    get descent(): number;
    /** The capital ink band above the baseline (probed from "H" — what
     *  `y = center` optically centers). */
    get capHeight(): number;
    /** The lowercase ink band above the baseline (probed from "x"). */
    get xHeight(): number;
    /** The y of the FIRST baseline inside this view — what cross-font,
     *  cross-size baseline alignment positions against:
     *  `y = { title.y + title.baseline - this.baseline }`. Both renderers
     *  place the first line's baseline at the font ascent (the natural-box
     *  rule; a declared `lineHeight` changes the stride between lines, never
     *  where the first baseline sits). */
    get baseline(): number;
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
