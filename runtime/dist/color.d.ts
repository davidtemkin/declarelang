import { type Color } from "./value.js";
/** A color's channels: r, g, b 0…255 and a 0…1 — or null for none. */
export interface ColorComponents {
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a: number;
}
/** Lighter by `k` (0…1) of perceived lightness (OKLCH), so steps look even. */
export declare function lighter(c: Color, k: number): Color;
/** Darker by `k` (0…1) of perceived lightness (OKLCH). */
export declare function darker(c: Color, k: number): Color;
/** The WCAG contrast ratio of two colors, 1 (none) to 21 (black on white). */
export declare function contrast(a: Color, b: Color): number;
/** Its channels: r, g, b from 0 to 255 and a from 0 to 1, or null for none. */
export declare function components(c: Color): ColorComponents | null;
/** The color some text writes: "#RGB", "#RRGGBB" or "#RRGGBBAA" (any case) — or null
 *  when the text is not one. A name is not read here: names are read where the
 *  compile can see them, and the names' table stays out of the running program. */
export declare function from(s: string): Color;
/** Its hex text, as the renderers write it: "#rrggbb", or "#rrggbbaa" when it is not
 *  opaque — or null for none. */
export declare function hex(c: Color): `#${string}` | null;
export declare const ColorOps: Readonly<{
    /** The color at an alpha from 0 (clear) to 1 (opaque), whatever alpha it had. */
    withAlpha(c: Color, alpha: number): Color;
    /** `a` mixed toward `b` by `t` (0 is a, 1 is b), channel by channel, alpha too. */
    mix(a: Color, b: Color, t: number): Color;
    lighter: typeof lighter;
    darker: typeof darker;
    contrast: typeof contrast;
    components: typeof components;
    hex: typeof hex;
    from: typeof from;
}>;
