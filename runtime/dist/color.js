// color — the operations on a Color, reached through its type in any `{ }` body:
// `Color.withAlpha(c, 0.25)`, `Color.mix(a, b, t)`, `Color.lighter(c, k)`,
// `Color.darker(c, k)`, `Color.contrast(a, b)`, `Color.components(c)`, `Color.hex(c)`, `Color.from(s)`.
//
// A Color is a number: `0xRRGGBB` when opaque, and with alpha the runtime's own
// encoding above 2^32 (value.ts ALPHA), which bit operations would cut to 32 bits.
// These read and write that encoding, so a program never does. A `null` color
// (none) gives null back.
import { colorToCss, colorWithAlpha, hexColor, toColor } from "./value.js";
const ALPHA = 0x100000000;
function parts(c) {
    let rgb = c, a = 255;
    if (c >= ALPHA) {
        const v = c - ALPHA;
        a = v % 256;
        rgb = Math.floor(v / 256);
    }
    return [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, a];
}
function make(r, g, b, a) {
    const ch = (x) => Math.max(0, Math.min(255, Math.round(x)));
    return colorWithAlpha((ch(r) << 16) | (ch(g) << 8) | ch(b), ch(a));
}
// sRGB ⇄ OKLab, for steps that look even (lighter, darker)
const lin = (u) => { const x = u / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const gam = (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
function toLab(r, g, b) {
    const R = lin(r), G = lin(g), B = lin(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromLab(L, A, B) {
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    return [gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}
function shiftLightness(c, k) {
    if (c === null)
        return null;
    const [r, g, b, a] = parts(c);
    const [L, A, B] = toLab(r, g, b);
    const [r2, g2, b2] = fromLab(Math.max(0, Math.min(1, L + k)), A, B);
    return make(r2, g2, b2, a);
}
/** WCAG relative luminance, 0…1. */
function luminance(c) {
    const [r, g, b] = parts(c);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** Lighter by `k` (0…1) of perceived lightness (OKLCH), so steps look even. */
export function lighter(c, k) { return shiftLightness(toColor(c), k); }
/** Darker by `k` (0…1) of perceived lightness (OKLCH). */
export function darker(c, k) { return shiftLightness(toColor(c), -k); }
/** The WCAG contrast ratio of two colors, 1 (none) to 21 (black on white). */
export function contrast(a, b) {
    a = toColor(a);
    b = toColor(b);
    if (a === null || b === null)
        return 1;
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Its channels: r, g, b from 0 to 255 and a from 0 to 1, or null for none. */
export function components(c) {
    c = toColor(c);
    if (c === null)
        return null;
    const [r, g, b, a] = parts(c);
    return Object.freeze({ r, g, b, a: a / 255 });
}
/** The color some text writes: "#RGB", "#RRGGBB" or "#RRGGBBAA" (any case) — or null
 *  when the text is not one. A name is not read here: names are read where the
 *  compile can see them, and the names' table stays out of the running program. */
export function from(s) {
    return typeof s === "string" ? hexColor(s.trim()) ?? null : null;
}
/** Its hex text, as the renderers write it: "#rrggbb", or "#rrggbbaa" when it is not
 *  opaque — or null for none. */
export function hex(c) {
    c = toColor(c);
    return c === null ? null : colorToCss(c);
}
export const ColorOps = Object.freeze({
    /** The color at an alpha from 0 (clear) to 1 (opaque), whatever alpha it had. */
    withAlpha(c, alpha) {
        c = toColor(c);
        if (c === null)
            return null;
        const [r, g, b] = parts(c);
        return make(r, g, b, Math.max(0, Math.min(1, alpha)) * 255);
    },
    /** `a` mixed toward `b` by `t` (0 is a, 1 is b), channel by channel, alpha too. */
    mix(a, b, t) {
        a = toColor(a);
        b = toColor(b);
        if (a === null)
            return b;
        if (b === null)
            return a;
        const p = parts(a), q = parts(b), k = Math.max(0, Math.min(1, t));
        return make(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k, p[3] + (q[3] - p[3]) * k);
    },
    lighter, darker, contrast, components, hex, from,
});
//# sourceMappingURL=color.js.map