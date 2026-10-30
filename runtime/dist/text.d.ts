import { View } from "./view.js";
import type { RenderBackend, Surface } from "./backend.js";
import { type Fill, type Shadow, type Outline, type Color } from "./value.js";
import { type TextTransform, type FontWeight } from "./measure.js";
import type { Numerals, NumeralWidth } from "./font-features.js";
import { type FamilyValue } from "./font-value.js";
export declare class Text extends View {
    textColor: Color;
    fontSize: number;
    /** A family string, a Font, or a list of them. */
    fontFamily: FamilyValue;
    fontWeight: FontWeight;
    letterSpacing: number;
    selectable: boolean;
    text: string;
    /** The glyphs' drop shadow (a decoration value); null = none.
     *  Replaces the two-stacked-runs idiom (weather's ShadowText). */
    textShadow: Shadow | null;
    /** A bounded-width run wraps (default) or stays a single line. */
    wrap: boolean;
    /** Where a run with no width of its own wraps; it then takes its widest line. 0 = one line. */
    wrapWidth: number;
    /** Line clamp (schema.ts): the height derive and every renderer honour it. */
    maxLines: number;
    /** True when the clamp actually dropped something (schema.ts). Read-only. */
    truncated: boolean;
    textAlign: "start" | "center" | "end" | "left" | "right";
    italic: boolean;
    textFill: Fill | null;
    outline: Outline | null;
    textTransform: TextTransform;
    smallCaps: boolean;
    numerals: Numerals;
    numeralWidth: NumeralWidth;
    slashedZero: boolean;
    underline: boolean;
    strike: boolean;
    lineHeight: number;
    /** The per-line advance: the declared leading (a fontSize multiplier, the
     *  Markdown convention) or, at the 0 default, the font's natural line box. */
    private $lineAdvance;
    /** The effective font's ascent above the baseline (the font bounding box,
     *  a property of the font — independent of this run's characters). */
    get ascent(): number;
    /** The effective font's descent below the baseline — ascent + descent is
     *  the natural line box. */
    get descent(): number;
    /** The capital ink band above the baseline (probed from "H") — the band a
     *  LABEL centers on (TextLabel), as against `y = center`, which centers the box. */
    get capHeight(): number;
    /** The lowercase ink band above the baseline (probed from "x"). */
    get xHeight(): number;
    /** The y of the FIRST baseline inside this view — what cross-font,
     *  cross-size baseline alignment positions against:
     *  `y = { title.y + title.baseline - this.baseline }`. With the face's own
     *  line box it is the ascent; a declared `lineHeight` puts half its
     *  difference from that box above each line and half below, as the DOM's
     *  line-height does, and every renderer places glyphs by the same rule. */
    get baseline(): number;
    /** The run's widest line: a hard line, or — with a `wrapWidth` and wrapping on —
     *  a line as wrapped at that width. */
    $widestLine(): number;
    /** Whether the run wraps at its box: a width given it, or one taken from a `wrapWidth`.
     *  `width` is read first, always: who owns it is not a tracked fact, so when a
     *  layout takes the width over from the run's own auto-size (a flexing run
     *  built after boot) it is the width's change that brings this question back. */
    $bounded(): boolean;
    /** True when the run sizes its own width: nothing set it, and what owns it, if
     *  anything, is the run's own auto-size. */
    get $ownWidth(): boolean;
    /** Size to the text: installed at attach, and again when a layout or a
     *  State lets go of a size (View.$sizeReleased → $bindExtent), so a Text
     *  that stops flexing is as wide as its words again — never the number its
     *  width held when the layout first took it. */
    private $bindTextSize;
    protected $bindExtent(): void;
    $attach(backend: RenderBackend, parentSurface: Surface | null, before?: Surface | null): void;
    /** A Text's own content folds into `contentWidth`/`contentHeight` as its
     *  MEASURED glyph extent — the way an Image folds in its bitmap (view.ts
     *  contentExtent). Without this a Text reported the base 0, so a container
     *  sizing to `label.contentWidth` (an auto-sized pill/badge) always read
     *  empty. Reads `text` and the font slots under tracking (contentExtent runs
     *  tracked), so it re-measures when the text or style changes — the fix for
     *  content-bound labels. The natural single-line width; height follows the
     *  wrapped line count when the width is bounded, matching the derives above. */
    protected $contentExtent(size: "width" | "height"): number;
    protected $flush(s: Surface): void;
}
