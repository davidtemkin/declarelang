import type { Color, Fill, Shadow } from "./value.js";
export type FontWeight = "thin" | "extralight" | "light" | "regular" | "normal" | "medium" | "semibold" | "bold" | "extrabold" | "black";
export declare function cssWeight(w: FontWeight): string;
/** A text run's style — the render seam's text currency. Backends derive
 *  what their substrate needs (font string, CSS color, ascent) from this.
 *  Since the styling rung the values are the EFFECTIVE (prevailing) ones —
 *  Text's style derive resolves them before they cross the seam — and the
 *  run's optional glyph shadow rides along (style is the cold path). */
export interface TextStyle {
    readonly fontFamily: string;
    readonly fontSize: number;
    readonly fontWeight: FontWeight;
    readonly letterSpacing: number;
    readonly color: Color;
    readonly shadow?: Shadow | null;
    /** Run wraps within its box width (`pre-wrap`) vs a single line (`pre`). */
    readonly wrap?: boolean;
    readonly align?: "left" | "center" | "right";
    readonly italic?: boolean;
    /** Fill the glyphs with a gradient (or solid Fill) — overrides `color` when
     *  set. Canvas realizes it over the text box; DOM clips a background to text. */
    readonly textFill?: Fill | null;
    /** Opt back into native text selection (the app root suppresses it): the run
     *  becomes a selection/pointer target. Off by default (app feel). */
    readonly selectable?: boolean;
}
/** Inject the measuring context for a DOM-less host — the environment
 *  contract's text-metrics seam (docs/system-design/capabilities.md §3, verify §2.8).
 *  Headless execution (static extraction, verify rung 4) passes a real 2D
 *  context for exact typography or a deterministic stand-in (the compiler's
 *  headless.ts approximation); in a browser nothing is injected and the
 *  lazily-created off-screen context above measures as always. */
export declare function provideMeasurer(ctx: CanvasRenderingContext2D): void;
/** A style as a canvas font string — the one font encoding the measurer and
 *  both backends share, so they cannot disagree about which font they mean. */
export declare function fontString(style: {
    fontFamily: string;
    fontSize: number;
    fontWeight: FontWeight;
    italic?: boolean;
}): string;
/** The advance width of `text` in `font`, in px (fractional), including
 *  `letterSpacing` tracking (canvas-native; the shared measurer is reset). */
export declare function textWidth(text: string, font: string, letterSpacing?: number): number;
/** Font-wide ascent/descent (the font bounding box) — a property of the
 *  font, independent of any particular string. ascent+descent is the natural
 *  line height; a baseline at `ascent` renders identically as DOM text (with
 *  line-height = ascent+descent) and as fillText. */
export declare function fontMetrics(font: string): {
    ascent: number;
    descent: number;
};
/** The CAP HEIGHT of `font` — the baseline-to-capital band the optical
 *  centering literal centers (`y = center` on a Text; the text-box-trim
 *  semantics). Probed once per font from a capital sample glyph; a measurer
 *  that reports no actualBoundingBoxAscent (the deterministic headless stub
 *  predates the field) falls back to the classic 0.7em approximation. */
export declare function capHeight(font: string): number;
/** `text` broken into the lines it wraps to within `width` px in `font` —
 *  greedy soft-break at spaces, hard-break at "\n", via the shared measurer.
 *  The DOM backend wraps natively; this is the shared breaker the Canvas
 *  backend paints and the model measures its auto-extent height from. A word
 *  longer than the box stays on its own line (no mid-word break), matching the
 *  default `word-break: normal`. */
export declare function wrapLines(text: string, font: string, width: number, letterSpacing?: number): string[];
