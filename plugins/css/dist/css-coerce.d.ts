/** A CSS color value → 0xRRGGBB int, or undefined if unrecognizable. Accepts
 *  `#rgb`, `#rrggbb`, `rgb(r,g,b)` (channels clamped to 255), and the 148
 *  `<named-color>` keywords (case-insensitive). */
export declare function coerceColor(raw: string): number | undefined;
/** A CSS length → number (px stripped), or undefined. Unitless is accepted. */
export declare function coerceLength(raw: string): number | undefined;
/** A bare number, or undefined. */
export declare function coerceNumber(raw: string): number | undefined;
/** A non-empty string (verbatim, trimmed), or undefined. */
export declare function coerceString(raw: string): string | undefined;
/** A font-weight → "bold" | "normal", or undefined. Numeric ≥600 → bold. */
export declare function coerceWeight(raw: string): string | undefined;
