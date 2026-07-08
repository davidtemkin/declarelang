// Native browser text metrics — the shared text primitive. The Flash-era
// letter-spacing / text-metric adjustment is deliberately shed (APPROACH §3,
// deliberately-not-reproduced ledger #1): the browser measures, neo believes
// it. One lazily-created off-screen 2D context measures for everyone — the
// Text leaf (auto-sizing), the DOM backend (a line-height that pins the
// first baseline to the font ascent), and the Canvas backend (the fillText
// baseline) — so both backends place identical glyph geometry and differ
// only in the rasterizer that inks it.
/** A weight token → its numeric CSS weight. The numeric form is what both the
 *  canvas `ctx.font` string and the DOM `font-weight` carry, and it is what
 *  selects the matching web face when a `font` declares several. */
const WEIGHT_CSS = {
    thin: "100", extralight: "200", light: "300", regular: "400", normal: "400",
    medium: "500", semibold: "600", bold: "700", extrabold: "800", black: "900",
};
export function cssWeight(w) {
    return WEIGHT_CSS[w] ?? "400";
}
// Created on first use — never at import or instantiation time — so the
// model stays importable in Node (unit tests) and measurement remains a
// browser-only, attach-time activity.
let measureCtx = null;
function measurer() {
    return (measureCtx ??= document.createElement("canvas").getContext("2d"));
}
/** A style as a canvas font string — the one font encoding the measurer and
 *  both backends share, so they cannot disagree about which font they mean. */
export function fontString(style) {
    return `${cssWeight(style.fontWeight)} ${style.fontSize}px ${style.fontFamily}`;
}
/** The advance width of `text` in `font`, in px (fractional), including
 *  `letterSpacing` tracking (canvas-native; the shared measurer is reset). */
export function textWidth(text, font, letterSpacing = 0) {
    const m = measurer();
    m.font = font;
    const ls = m;
    ls.letterSpacing = `${letterSpacing}px`;
    const w = m.measureText(text).width;
    ls.letterSpacing = "0px"; // the measurer is shared — leave it neutral
    return w;
}
/** Font-wide ascent/descent (the font bounding box) — a property of the
 *  font, independent of any particular string. ascent+descent is the natural
 *  line height; a baseline at `ascent` renders identically as DOM text (with
 *  line-height = ascent+descent) and as fillText. */
export function fontMetrics(font) {
    const m = measurer();
    m.font = font;
    const t = m.measureText("");
    return { ascent: t.fontBoundingBoxAscent, descent: t.fontBoundingBoxDescent };
}
//# sourceMappingURL=measure.js.map