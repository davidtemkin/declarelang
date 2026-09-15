/** What measureText reports — a Text's own fact names. */
export interface TextMeasure {
    readonly width: number;
    readonly height: number;
    readonly baseline: number;
    readonly capHeight: number;
    readonly lines: number;
}
interface StyleFields {
    fontFamily?: unknown;
    fontSize?: unknown;
    fontWeight?: unknown;
    italic?: unknown;
    letterSpacing?: unknown;
    lineHeight?: unknown;
    textTransform?: unknown;
    smallCaps?: unknown;
    numerals?: unknown;
    numeralWidth?: unknown;
    slashedZero?: unknown;
}
/** Measure `text` in `style` — one line per hard newline, or wrapped at `width`. */
export declare function measureText(text: unknown, style?: StyleFields | null, width?: number): TextMeasure;
export {};
