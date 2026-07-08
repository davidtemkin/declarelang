import type { Color, Shadow } from "./value.js";
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
}
/** A style as a canvas font string — the one font encoding the measurer and
 *  both backends share, so they cannot disagree about which font they mean. */
export declare function fontString(style: {
    fontFamily: string;
    fontSize: number;
    fontWeight: FontWeight;
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
