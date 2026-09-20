// Native browser text metrics — the shared text primitive. The Flash-era
// letter-spacing / text-metric adjustment is deliberately shed (APPROACH §3,
// deliberately-not-reproduced ledger #1): the browser measures, Declare believes
// it. One lazily-created off-screen 2D context measures for everyone — the
// Text leaf (auto-sizing), the DOM backend (a line-height that pins the
// first baseline to the font ascent), and the Canvas backend (the fillText
// baseline) — so both backends place identical glyph geometry and differ
// only in the rasterizer that inks it.
import { phasesOn, phased } from "./phase-timer.js";
import { trackFamilies, faceGenerationNow } from "./face-table.js";
import { familyOf } from "./font-value.js";
import { featureFamily, featureTags } from "./font-features.js";
/** A weight token → its numeric CSS weight. The numeric form is what both the
 *  canvas `ctx.font` string and the DOM `font-weight` carry, and it is what
 *  selects the matching web face when a `font` declares several. */
const WEIGHT_CSS = {
    thin: "100", extralight: "200", light: "300", regular: "400", normal: "400",
    medium: "500", semibold: "600", bold: "700", extrabold: "800", black: "900",
};
export function cssWeight(w) {
    if (typeof w === "number")
        return Number.isFinite(w) ? String(Math.round(Math.min(1000, Math.max(1, w)))) : "400";
    return WEIGHT_CSS[w] ?? "400";
}
// Created on first use — never at import or instantiation time — so the
// model stays importable in Node (unit tests) and measurement remains a
// browser-only, attach-time activity.
let measureCtx = null;
function measurer() {
    return (measureCtx ??= document.createElement("canvas").getContext("2d"));
}
// ── THE MEASURE MEMO ─────────────────────────────────────────────────────────
// A measurement is a pure function of (font, text, tracking[, width]) for as
// long as the faces behind the font do not change — and every derive that
// measures (Text.height, Text.width, a flow) re-runs whenever ANY of its inputs
// moves, re-measuring text that did not (5,883 Text.height runs in one weather
// city animation; `ctx.font` parsing + measureText were 40% of that settle).
// The memo answers repeats; it is dropped whole when the face table's
// generation moves (a declared face landed — face-table.ts), when the browser
// finishes loading any font (a system or CSS face the table does not see), and
// when a different measurer is provided. Reactivity is untouched: fontString
// still tracks the families, so a landing face still re-runs every measurer.
let memoGen = -1;
let memoEpoch = 0;
let memoSeen = -1;
const BUCKETS = new Map();
let memoEntries = 0;
const MEMO_CAP = 50000;
function bucketOf(font) {
    let b = BUCKETS.get(font);
    if (b === undefined) {
        b = { widths: new Map(), wraps: new Map(), metrics: null, probes: new Map() };
        BUCKETS.set(font, b);
    }
    return b;
}
if (typeof document !== "undefined") {
    const fonts = document.fonts;
    fonts?.addEventListener?.("loadingdone", () => { memoEpoch++; });
}
/** Counters, for the profile rig (never read by the runtime). */
export const measureMemoStats = { hits: 0, misses: 0, clears: 0 };
// the counters are read by the profiling rigs only, so only those builds publish them
if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__)
    globalThis.__declareMeasureMemo = measureMemoStats;
function memoFresh() {
    const g = faceGenerationNow();
    if (g === memoGen && memoEpoch === memoSeen && memoEntries < MEMO_CAP)
        return;
    measureMemoStats.clears++;
    memoGen = g;
    memoSeen = memoEpoch;
    BUCKETS.clear();
    memoEntries = 0;
}
/** Measure live, bypassing the memo (tests; the A/B switch). */
const NO_MEMO = typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && globalThis.__declareNoMeasureMemo === true;
/** Inject the measuring context for a DOM-less host — the environment
 *  contract's text-metrics seam (docs/system-design/capabilities.md §3, verify §2.8).
 *  Headless execution (static extraction, verify rung 4) passes a real 2D
 *  context for exact typography or a deterministic stand-in (the compiler's
 *  headless.ts approximation); in a browser nothing is injected and the
 *  lazily-created off-screen context above measures as always. */
export function provideMeasurer(ctx) {
    measureCtx = ctx;
    memoEpoch++; // a different measurer measures differently
}
/** The family list a style actually paints and measures in: the family its value
 *  names now (a string as written; a Font's current family, held for a text view
 *  while a newly chosen font loads — font-value.ts), or — when the style asks for
 *  OpenType figures — the derived-then-plain list those features ride in
 *  (font-features.ts). Every renderer asks THIS, so all three name the same font
 *  and the measurer cannot drift from the painter. */
export function effectiveFamily(style) {
    return featureFamily(familyOf(style), featureTags(style));
}
export function fontString(style) {
    const family = effectiveFamily(style);
    // THE FACE TABLE IS A TRACKED READ (face-table.ts). Every measurement in the
    // program goes through this one function, so tracking the family here is what
    // makes a face that lands after boot re-measure and redraw the text that asked
    // for it — the auto-size constraints and the metric getters were always inside
    // the graph; the table they measure against was not. A no-op while painting.
    trackFamilies(family);
    // CSS font shorthand order: font-style font-variant font-weight font-size family.
    // `small-caps` rides the variant slot — canvas `ctx.font` honors it, so the
    // shared measurer sees the same synthesized caps the painter draws (widths agree).
    return `${style.italic ? "italic " : ""}${style.smallCaps ? "small-caps " : ""}${cssWeight(style.fontWeight)} ${style.fontSize}px ${family}`;
}
/** The glyphs a `textTransform` actually paints — applied at BOTH measure and
 *  paint time so a transformed run's width matches its picture (the DOM gets the
 *  same shaping free from CSS `text-transform`). `capitalize` uppercases the
 *  first letter of each whitespace-separated word, like the CSS keyword. */
export function transformText(text, transform) {
    switch (transform) {
        case "uppercase": return text.toUpperCase();
        case "lowercase": return text.toLowerCase();
        case "capitalize": return text.replace(/(^|\s)(\S)/g, (_m, sp, ch) => sp + ch.toUpperCase());
        default: return text;
    }
}
/** The advance width of `text` in `font`, in px (fractional), including
 *  `letterSpacing` tracking (canvas-native; the shared measurer is reset). */
export function textWidth(text, font, letterSpacing = 0) {
    if (!NO_MEMO) {
        memoFresh();
        const b = bucketOf(font);
        let byText = b.widths.get(letterSpacing);
        if (byText === undefined) {
            byText = new Map();
            b.widths.set(letterSpacing, byText);
        }
        const hit = byText.get(text);
        if (hit !== undefined) {
            measureMemoStats.hits++;
            return hit;
        }
        measureMemoStats.misses++;
        const w = (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && phasesOn ? phased("text measure", () => textWidthLive(text, font, letterSpacing)) : textWidthLive(text, font, letterSpacing));
        byText.set(text, w);
        memoEntries++;
        return w;
    }
    return (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && phasesOn ? phased("text measure", () => textWidthLive(text, font, letterSpacing)) : textWidthLive(text, font, letterSpacing));
}
function textWidthLive(text, font, letterSpacing) {
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
    if (!NO_MEMO) {
        memoFresh();
        const b = bucketOf(font);
        if (b.metrics !== null) {
            measureMemoStats.hits++;
            return b.metrics;
        }
        measureMemoStats.misses++;
        const r = (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && phasesOn ? phased("text measure", () => fontMetricsLive(font)) : fontMetricsLive(font));
        b.metrics = r;
        memoEntries++;
        return r;
    }
    return (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && phasesOn ? phased("text measure", () => fontMetricsLive(font)) : fontMetricsLive(font));
}
function fontMetricsLive(font) {
    const m = measurer();
    m.font = font;
    const t = m.measureText("");
    return { ascent: t.fontBoundingBoxAscent, descent: t.fontBoundingBoxDescent };
}
/** The CAP HEIGHT of `font` — the baseline-to-capital band the optical
 *  centering literal centers (`y = center` on a Text; the text-box-trim
 *  semantics). Probed once per font from a capital sample glyph; a measurer
 *  that reports no actualBoundingBoxAscent (the deterministic headless stub
 *  predates the field) falls back to the classic 0.7em approximation. */
export function capHeight(font) {
    return probe("H", font, capHeightLive);
}
function probe(which, font, live) {
    if (NO_MEMO)
        return live(font);
    memoFresh();
    const b = bucketOf(font);
    const hit = b.probes.get(which);
    if (hit !== undefined)
        return hit;
    const v = live(font);
    b.probes.set(which, v);
    memoEntries++;
    return v;
}
function capHeightLive(font) {
    const m = measurer();
    m.font = font;
    const t = m.measureText("H");
    if (typeof t.actualBoundingBoxAscent === "number" && t.actualBoundingBoxAscent > 0)
        return t.actualBoundingBoxAscent;
    const size = /(\d+(?:\.\d+)?)px/.exec(font);
    return 0.7 * (size ? parseFloat(size[1]) : 16);
}
/** The X-HEIGHT of `font` — the lowercase ink band, probed from a sample
 *  glyph exactly as capHeight probes "H" (compositing.md Part III: no web
 *  API reads a font's tables — the binary is unreachable for system fonts
 *  and carries three competing metric sets browsers disagree on; the
 *  measurer reports what THIS engine will actually render). The classic
 *  0.5em approximation carries the deterministic headless stub. */
export function xHeight(font) {
    return probe("x", font, xHeightLive);
}
function xHeightLive(font) {
    const m = measurer();
    m.font = font;
    const t = m.measureText("x");
    if (typeof t.actualBoundingBoxAscent === "number" && t.actualBoundingBoxAscent > 0)
        return t.actualBoundingBoxAscent;
    const size = /(\d+(?:\.\d+)?)px/.exec(font);
    return 0.5 * (size ? parseFloat(size[1]) : 16);
}
/** `text` broken into the lines it wraps to within `width` px in `font` —
 *  greedy soft-break at spaces, hard-break at "\n", via the shared measurer.
 *  The DOM backend wraps natively; this is the shared breaker the Canvas
 *  backend paints and the model measures its auto-extent height from.
 *
 *  This is a deliberate approximation of CSS line breaking, not UAX #14. The
 *  break opportunities it knows are the space and the "/" and "-" below. Its
 *  known gaps, all measured against Chrome (2026-09-05) and all UNDER-counts
 *  — whose failure is an overflow or a scrollbar, never a wrong line:
 *  a line's own indent (see `countIndent`), CJK (a break between any two
 *  ideographs), the other Unicode spaces, the dash family past ASCII "-", the
 *  soft hyphen, and a tab, which it measures as one glyph rather than to the
 *  next `tab-size` stop. Widen it against a measurement, never a theory. */
/** LINE CLAMP (2026-09-12, `Text.maxLines`): keep the first `max` lines and end
 *  the last kept line with an ellipsis that FITS — words dropped from its end
 *  until "…" fits the width, then characters if the last word alone is too
 *  long. Every renderer clamps through this one function (the DOM's native
 *  clamp is asked for the same count; the mac host mirrors the rule), so the
 *  measured height and the painted lines agree. `max <= 0` = no clamp. */
export function clampLines(lines, max, font, width, letterSpacing = 0) {
    if (max <= 0)
        return lines;
    const kept = lines.slice(0, max);
    const n = kept.length;
    if (n === 0)
        return kept;
    // nothing to do when the text fit its lines — an over-long TOKEN on its own
    // line (the breaker's `overflow-wrap: normal` rule) is the one kept line
    // that does not, and it gets the ellipsis too
    if (lines.length <= max && textWidth(kept[n - 1], font, letterSpacing) <= width)
        return lines;
    kept[n - 1] = ellipsize(kept[n - 1], font, width, letterSpacing);
    return kept;
}
/** The tail half of `clampLines`, separately callable: drop words (then, if the
 *  last word alone is too long, characters) from the end until the text plus an
 *  ellipsis fits `width`, and return it WITH the ellipsis. A FLOW clamp needs it
 *  on its own, because the line it cuts short was wrapped to fit exactly — the
 *  ellipsis has to be made room for beside what is already there. */
export function ellipsize(text, font, width, letterSpacing = 0) {
    let last = text.replace(/\s+$/, "");
    const fits = (s) => textWidth(s + "…", font, letterSpacing) <= width;
    while (last.length > 0 && !fits(last)) {
        const cut = last.lastIndexOf(" ");
        last = cut > 0 ? last.slice(0, cut) : last.slice(0, -1);
        last = last.replace(/\s+$/, "");
    }
    return last + "…";
}
export function wrapLines(text, font, width, letterSpacing = 0) {
    return wrapMemo("L", text, font, width, letterSpacing, () => (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && phasesOn ? phased("text measure", () => wrapLinesLive(text, font, width, letterSpacing)) : wrapLinesLive(text, font, width, letterSpacing)));
}
/** The memoized breaker: the returned array is FROZEN — callers read it (and
 *  clampLines slices before it edits), so one array can answer every repeat. */
function wrapMemo(rule, text, font, width, letterSpacing, live) {
    if (NO_MEMO)
        return live();
    memoFresh();
    const b = bucketOf(font);
    let byWidth = b.wraps.get(rule);
    if (byWidth === undefined) {
        byWidth = new Map();
        b.wraps.set(rule, byWidth);
    }
    let byLs = byWidth.get(width);
    if (byLs === undefined) {
        byLs = new Map();
        byWidth.set(width, byLs);
    }
    let byText = byLs.get(letterSpacing);
    if (byText === undefined) {
        byText = new Map();
        byLs.set(letterSpacing, byText);
    }
    const hit = byText.get(text);
    if (hit !== undefined) {
        measureMemoStats.hits++;
        return hit;
    }
    measureMemoStats.misses++;
    const lines = Object.freeze(live());
    byText.set(text, lines);
    memoEntries++;
    return lines;
}
function wrapLinesLive(text, font, width, letterSpacing) {
    // A box of text (`white-space: pre-wrap` on the DOM, the same rule on canvas)
    // COUNTS a line's own leading spaces and overflows an over-long token on its own
    // line (`overflow-wrap: normal`). Measuring with `countIndent: true` is what makes
    // an INDENTED wrapped line — a code snippet most of all — report the height the box
    // actually renders, instead of under-counting and spilling past the bottom edge.
    return wrapBy(text, font, width, letterSpacing, { countIndent: true, breakWord: false });
}
/** The same breaker under an EDITABLE's rules — what a native field will do
 *  with this text, which is not what a box of text would do with it. Used by
 *  TextInput's auto-height: a field that sizes to its own content has to
 *  measure the way the element it becomes will lay out. */
export function wrapEditable(text, font, width, letterSpacing = 0) {
    return wrapMemo("E", text, font, width, letterSpacing, () => wrapEditableLive(text, font, width, letterSpacing));
}
function wrapEditableLive(text, font, width, letterSpacing) {
    return wrapBy(text, font, width, letterSpacing, { countIndent: true, breakWord: true });
}
function wrapBy(text, font, width, letterSpacing, rule) {
    if (width <= 0)
        return text.split("\n");
    const m = measurer();
    m.font = font;
    const ls = m;
    ls.letterSpacing = `${letterSpacing}px`;
    const out = [];
    for (const seg of text.split("\n")) {
        let cur = "";
        // `ink`: the line holds something past its indent — what a break is
        // allowed to leave behind, so a deep indent never lands on a line alone.
        let ink = false;
        // Break opportunities are the BROWSER'S: at spaces (the space collapses
        // at the break), and after "/" or "-" inside a word — how engines wrap
        // paths, URLs, and hyphenated words; the delimiter stays with the line it
        // ends. Without these a spaceless path measured as ONE line while the DOM
        // rendered two (the desktop's preview pane caught it), so the model's
        // height under-counted and layouts stacked into the overflow.
        const words = seg.split(" ");
        for (let i = 0; i < words.length; i++) {
            const chunks = words[i].split(/(?<=[/-])/);
            for (let j = 0; j < chunks.length; j++) {
                // The separator belongs to the word that FOLLOWS it, which is what
                // makes a line's indent measurable: leading spaces ARE the empty
                // words, so testing the LINE for emptiness (`countIndent` off) drops
                // every indent in the text. At a break the separator is dropped
                // rather than carried — that is CSS hanging it at the line's end.
                const sep = j === 0 && (rule.countIndent ? i > 0 : cur !== "") ? " " : "";
                const trial = !rule.countIndent && cur === "" ? chunks[j] : cur + sep + chunks[j];
                const held = rule.countIndent ? ink : cur !== "";
                if (held && m.measureText(trial).width > width) {
                    out.push(cur);
                    cur = chunks[j];
                    ink = chunks[j] !== "";
                }
                else {
                    cur = trial;
                    ink = ink || chunks[j] !== "";
                }
                // break-word: the piece has a line to itself and still does not fit,
                // so the browser breaks it mid-word at the last character that fits.
                if (rule.breakWord && m.measureText(cur).width > width) {
                    const over = cur;
                    cur = "";
                    for (const ch of over) {
                        if (cur !== "" && m.measureText(cur + ch).width > width) {
                            out.push(cur);
                            cur = ch;
                        }
                        else
                            cur += ch;
                    }
                    ink = true;
                }
            }
        }
        out.push(cur);
    }
    ls.letterSpacing = "0px"; // the measurer is shared — leave it neutral
    return out.length === 0 ? [""] : out;
}
//# sourceMappingURL=measure.js.map