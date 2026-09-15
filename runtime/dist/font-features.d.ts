/** The shape of the digits: `normal` is whatever the face does by default. */
export type Numerals = "normal" | "lining" | "oldstyle";
/** The advance of the digits: `tabular` = every digit the same width. */
export type NumeralWidth = "normal" | "tabular" | "proportional";
/** A style's OpenType feature tags, sorted so one combination has one name. */
export declare function featureTags(style: {
    numerals?: Numerals;
    numeralWidth?: NumeralWidth;
    slashedZero?: boolean;
}): string[];
/** One family name as a CSS font shorthand will accept it. An unquoted family
 *  must be a sequence of identifiers, and a token that starts with a digit is
 *  not one — so `400 17px Source Serif 4` is not a font at all, and canvas
 *  `ctx.font` REJECTS it silently and keeps whatever font it had. The measurer
 *  then measures in one face while the painter draws in another: tiny glyphs,
 *  huge word gaps, a column that wraps short. Found by my-apps/fonts-and-text,
 *  whose reading face is Source Serif 4; DOM and the Mac host were unaffected.
 *  A name that is already quoted, a generic keyword, or a valid identifier
 *  sequence passes through untouched, so no existing font string changes. */
export declare function cssFamilyName(name: string): string;
/** The family list a style should MEASURE AND PAINT in — the authored list when
 *  it asks for no features, and the derived-then-plain list when it does. Every
 *  name leaves CSS-safe (cssFamilyName), and a list that needs no quoting comes
 *  back as the very string that went in. */
export declare function featureFamily(family: string, tags: readonly string[]): string;
