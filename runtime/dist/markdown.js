// Markdown — the rich content component (docs/system-design/text-and-markdown.md). Points
// at any string and renders it: `Markdown [ text = … ]`. The string is parsed
// (md.ts, the standalone reader) into the block tree; each block becomes Declare
// views, stacked vertically, wrapped, styled by the `prose` defaults. The
// render is REACTIVE: a Constraint over `text` (and `width`) re-renders when
// either changes, so a computed/streamed value renders live and a resize
// re-flows.
//
// Block layout is a deterministic y-cursor (measure each block, place at an
// absolute offset — no nested auto-size ordering). The INLINE tier is a
// multi-run layout: a paragraph's styled runs (strong/em/code/link/strike) are
// wrapped together across style boundaries and emitted as one `Text` per
// styled segment-piece (plus a chip behind code, a rule through strike). Declare's
// `Text` is one style per run, so rich flow is composed FROM runs, not a new
// backend primitive — both backends render it identically, for free.
import { View, onDiscard, fireEvent } from "./view.js";
import { Text } from "./text.js";
import { Image } from "./image.js";
import { Layout } from "./layout.js";
import { Constraint } from "./reactive.js";
import { defineAttributes, providedDefault, providedRead, setBound } from "./attributes.js";
import { ellipsize, fontMetrics, fontString, textWidth, transformText } from "./measure.js";
import { featureFamily, featureTags } from "./font-features.js";
import { faceGeneration } from "./face-table.js";
import { heldFamily } from "./font-value.js";
import { parse } from "./md.js";
import { headingSlug } from "./slug.js";
import { parseHtml } from "./html.js";
import { resolveAsset } from "./asset-base.js";
import { styleBundles, bundleRecord } from "./style-bundles.js";
// ── prose style map ──────────────────────────────────────────────────────────
// The role → style map that makes rendered Markdown look good with zero author
// effort, on the theme tokens. A design artifact, deliberately data (not code).
const PROSE = {
    heading: [32, 24, 20, 18, 16, 15], // px by level 1..6
    headingGap: [40, 38, 30, 24, 20, 18], // space ABOVE a heading (not first), by level
    headingBelow: 10, // space below a heading, before its content
    body: 16,
    codeSize: 13, // the house code rendition size — shared by inline, fenced, and <pre> code
    codeRadius: 8,
    codePad: 14,
    codeGutter: 10, // slack below code when a line overflows: the DOM overlay scrollbar's seat (#25)
    codeRuleWidth: 2, // the `codeRule` left accent bar's thickness
    codeRuleGap: 12, // extra left padding for code text when a `codeRule` bar is present
    mono: "ui-monospace, SFMono-Regular, monospace",
    blockGap: 16,
    itemGap: 6,
    indent: 28, // list item body's hanging indent (text left)
    markerGap: 7, // gap between the marker's right edge and the item text
    quoteIndent: 20,
    cellGap: 18,
};
// The rich-element colors (headings, code, links, rules, quotes) come in a dark and
// a light set; `C` points at the one matching the app's color scheme, chosen per
// rebuild from the root App's `dark` (below). Body text is themed separately via the
// `bodyColor` attribute, so a caller can dim prose independently of the scheme.
const COLORS_DARK = {
    headingColor: 0xffffff, bodyColor: 0xc7d0d6,
    code: 0xb8cfef, codeChip: 0x172b39, codeFg: 0xb8c4cc, codeBg: 0x121f2a,
    rule: 0x24394a, link: 0x6aa4ff, quoteRule: 0x2f4a5c, quoteColor: 0x9fb0ba,
};
const COLORS_LIGHT = {
    headingColor: 0x111c24, bodyColor: 0x33424e,
    code: 0x2c5578, codeChip: 0xe6edf3, codeFg: 0x2e3b46, codeBg: 0xe6ecf2,
    rule: 0xd3dce4, link: 0x2f6fe0, quoteRule: 0xc4d0da, quoteColor: 0x5a6874,
};
let C = COLORS_DARK; // active set; set at the top of each rebuild
let SCALE = 1; // font-size multiplier (the `scale` attr), set per rebuild
// THE LINE BUDGET for one build (`RichText.maxLines`). Lines are counted across
// the WHOLE document, in order, and spent while it is BUILT (layoutBlocks and
// the structural builders) — never while a flow renders, because a flow renders
// again later (a width change, an image or a face landing) when this global no
// longer describes anything. Infinity = no clamp.
let BUDGET = Infinity;
let TRUNCATED = false;
let STYLES = {}; // named styles (HTMLText local `textStyles`), set per rebuild
const bundleCache = new WeakMap();
/** Set one RunStyle field from a runtime value (shared by static + dynamic). */
function assignRunField(rs, name, val) {
    switch (name) {
        case "fontSize":
            if (typeof val === "number")
                rs.fontSize = val;
            break;
        case "letterSpacing":
            if (typeof val === "number")
                rs.letterSpacing = val;
            break;
        case "fontFamily":
            if (typeof val === "string")
                rs.fontFamily = val;
            break;
        case "fontWeight":
            if (typeof val === "string" || typeof val === "number")
                rs.fontWeight = val;
            break;
        case "italic":
            rs.italic = val === true;
            break;
        case "smallCaps":
            rs.smallCaps = val === true;
            break;
        case "numerals":
            if (typeof val === "string")
                rs.numerals = val;
            break;
        case "numeralWidth":
            if (typeof val === "string")
                rs.numeralWidth = val;
            break;
        case "slashedZero":
            rs.slashedZero = val === true;
            break;
        case "underline":
            rs.underline = val === true;
            break;
        case "strike":
            rs.strike = val === true;
            break;
        case "textColor":
            if (typeof val === "number" || val === null)
                rs.textColor = val;
            break;
        case "textFill":
            rs.textFill = val;
            break;
        case "textShadow":
            rs.textShadow = val;
            break;
        case "outline":
            rs.outline = val;
            break;
        case "textTransform":
            if (typeof val === "string")
                rs.textTransform = val;
            break;
    }
}
const TEXT_ATTR = new Set(["fontSize", "fontFamily", "fontWeight", "italic", "textColor", "textFill", "letterSpacing",
    "textShadow", "outline", "textTransform", "smallCaps", "numerals", "numeralWidth", "slashedZero",
    "underline", "strike"]);
/** A `style` bundle's text attributes read into a RunStyle — from the bundle's
 *  record (style-bundles.ts), the same values a drawing or a body reads by name. */
function bundleToRunStyle(el) {
    const rs = {};
    const rec = bundleRecord(el);
    for (const [name, val] of Object.entries(rec))
        if (TEXT_ATTR.has(name))
            assignRunField(rs, name, val);
    return rs;
}
// The running-text style pulled from the provided text slots (fontSize/
// fontWeight/letterSpacing), set per rebuild — so ALL prose body (paragraphs
// AND list/quote/table text) obeys the ambient text style, like a `Text`.
let BODY = { size: 16, weight: "normal", tracking: 0 };
// The rich-text STRUCTURE style, resolved per rebuild from the provided
// structural slots (headingColor/headingWeight/linkColor/codeColor) with the
// theme-aware house token as the fallback — so headings/links/inline-code obey
// an app-wide override but look right with zero config.
let HEADINGW = "bold";
let HEADINGC = 0, LINKC = 0, CODEC = 0;
let LINKU = false; // underline links (schema `linkUnderline`)
// Code face + size — resolved per rebuild from the provided codeSize/codeFamily
// slots, with the house code style (PROSE.codeSize / PROSE.mono) as the fallback.
// One value drives every monospace region: inline code, fenced blocks, and the
// `<pre>` HTMLText path — so the reader view and fenced code share one rendition.
let CODESIZE = 0, CODEFAM = "";
// Code-block box paint, resolved per rebuild from the provided codeBackground/
// codeRule slots (null = the house look). CODEBG null ⇒ fenced code keeps its
// themed tint and a `<pre>` stays bare; CODERULE null ⇒ no left bar on either.
let CODEBG = null, CODERULE = null;
// Resolve an inline image's `src` against the document's asset base (the same
// rebase an `Image [ source ]` gets), set per rebuild from the component's root.
// Absolute/protocol-relative/root-relative/data: srcs pass through untouched.
let RESOLVE_SRC = (s) => s;
let LAYOUT = {};
/** Resolve a block type's geometry from the map: its own entry, then `default`,
 *  field by field (a `pre` with no own entry shares `code`). Zero maxWidth = the
 *  full track; the house result for an empty map is full-width, left, no margin. */
function geoFor(t) {
    const d = LAYOUT.default ?? {};
    const own = LAYOUT[t] ?? (t === "pre" ? LAYOUT.code : undefined) ?? {};
    const margin = own.margin ?? d.margin ?? [0, 0];
    return {
        maxWidth: own.maxWidth ?? d.maxWidth ?? 0,
        ml: margin[0] ?? 0,
        mr: margin[1] ?? 0,
        align: own.align ?? d.align ?? "left",
    };
}
/** Place a built block-view in its track: given the column `width` and the block
 *  type's geometry, size it to the (possibly measure-capped) content width and set
 *  its x by the alignment. `apply(width, geo)` returns the content width the block
 *  should be BUILT at; then `pos` offsets the finished view. One helper so the flow
 *  group and every structural block share identical geometry. */
function contentWidth(width, g) {
    const track = Math.max(0, width - g.ml - g.mr);
    return g.maxWidth > 0 ? Math.min(track, g.maxWidth) : track;
}
function placeX(width, cw, g) {
    if (g.align === "center")
        return g.ml + (width - g.ml - g.mr - cw) / 2;
    if (g.align === "right")
        return width - g.mr - cw;
    return g.ml;
}
const geoEqual = (a, b) => a.maxWidth === b.maxWidth && a.ml === b.ml && a.mr === b.mr && a.align === b.align;
/** Resolve a `<span class="…">` name through the by-name cascade — local inline
 *  `textStyles` first, then a global `style` bundle — the whole class, else its
 *  first matching token (`"hero big"`); no match ⇒ undefined (plain text). */
function resolveStyle(name) {
    const bundles = styleBundles();
    for (const tok of [name, ...name.split(/\s+/)]) {
        if (tok in STYLES)
            return STYLES[tok]; // local inline (nearest)
        const b = bundles.get(tok);
        if (b !== undefined) { // global `style` bundle
            // A bundle is a record of literals: its run style is read once per Element.
            let rs = bundleCache.get(b);
            if (rs === undefined) {
                rs = bundleToRunStyle(b);
                bundleCache.set(b, rs);
            }
            return rs;
        }
    }
    return undefined;
}
const sz = (n) => Math.round(n * SCALE); // scale a prose size, keeping whole pixels
const FALLBACK_FAMILY = "system-ui, sans-serif";
function base(size, weight, color, tracking = 0) {
    return { size: sz(size), weight, italic: false, mono: false, strike: false, color, tracking };
}
/** Apply a named `RunStyle` (Text's own attribute names) onto the ambient
 *  style. Each field maps to its internal Style twin; a size is SCALE-multiplied
 *  like every prose size so the `scale` attr still governs. */
function applyStyle(style, rs) {
    const s = { ...style };
    if (rs.fontSize !== undefined)
        s.size = sz(rs.fontSize);
    if (rs.fontFamily !== undefined)
        s.family = rs.fontFamily;
    if (rs.fontWeight !== undefined)
        s.weight = rs.fontWeight;
    if (rs.italic !== undefined)
        s.italic = rs.italic;
    if (rs.textColor !== undefined)
        s.color = rs.textColor;
    if (rs.textFill !== undefined)
        s.fill = rs.textFill;
    if (rs.letterSpacing !== undefined)
        s.tracking = rs.letterSpacing;
    if (rs.textShadow !== undefined)
        s.shadow = rs.textShadow;
    if (rs.outline !== undefined)
        s.outline = rs.outline;
    if (rs.textTransform !== undefined)
        s.transform = rs.textTransform;
    if (rs.smallCaps !== undefined)
        s.smallCaps = rs.smallCaps;
    if (rs.numerals !== undefined)
        s.numerals = rs.numerals;
    if (rs.numeralWidth !== undefined)
        s.numeralWidth = rs.numeralWidth;
    if (rs.slashedZero !== undefined)
        s.slashedZero = rs.slashedZero;
    if (rs.underline !== undefined)
        s.underline = rs.underline;
    if (rs.strike !== undefined)
        s.strike = rs.strike;
    return s;
}
/** Walk the inline tree, resolving each leaf's effective style. */
function flatten(ns, style, out) {
    for (const n of ns) {
        switch (n.t) {
            case "text":
                out.push({ text: n.value, style });
                break;
            case "code":
                out.push({ text: n.value, style: { ...style, mono: true, color: CODEC } });
                break;
            case "br":
                out.push({ br: true });
                break;
            case "strong":
                flatten(n.inline, { ...style, weight: "bold" }, out);
                break;
            case "em":
                flatten(n.inline, { ...style, italic: true }, out);
                break;
            case "strike":
                flatten(n.inline, { ...style, strike: true }, out);
                break;
            case "link":
                flatten(n.inline, { ...style, color: LINKC, link: n.href }, out);
                break;
            // An inline image is an atomic box, not styled text; it carries the ambient
            // link (an image that is a link's content) so the box is clickable.
            case "image":
                out.push({ img: { src: RESOLVE_SRC(n.src), alt: n.alt, title: n.title, href: style.link } });
                break;
            case "styled": {
                const rs = resolveStyle(n.name);
                flatten(n.inline, rs !== undefined ? applyStyle(style, rs) : style, out);
                break;
            }
        }
    }
}
// ── views ────────────────────────────────────────────────────────────────
function textView(width, size, color, weight, body) {
    const t = new Text();
    t.width = width;
    t.fontSize = size;
    t.textColor = color;
    t.fontWeight = weight;
    t.text = body;
    return t;
}
function rectView(width, height, fill, radius = 0) {
    const v = new View();
    v.width = width;
    v.height = height;
    v.fill = fill;
    if (radius)
        v.cornerRadius = radius;
    return v;
}
/** Install an `onClick` handler on a view programmatically — a dynamic handler
 *  attribute (like the language's `onClick() { … }`), so the view's input sink
 *  installs at attach and the Canvas backend hit-tests it. Used for link runs. */
function setClick(v, fn) {
    v.onClick = fn;
}
function rectAt(x, y, w, h, fill) {
    const v = rectView(w, h, fill);
    v.x = x;
    v.y = y;
    return v;
}
// ── rich text: native flow ───────────────────────────────────────────────────
// A flowing run of styled text — the read-only sibling of the editable field.
// The DOM backend realizes it as real flowing HTML, so selection, copy, find,
// a11y and baselines are the browser's own; where that is unavailable (canvas)
// RichText lays the same runs out as child views itself. EVERY text region is one
// of these — a paragraph/heading group, but also each list item, table cell and
// quote line — which is what makes prose selection contiguous per region instead
// of word-by-word. Only the STRUCTURE around them (markers, rules, the code box)
// is plain views.
/** Flatten an inline tree to fully-resolved runs for the seam — the effective
 *  font, color, and (for `code`) chip are baked in so a backend just realizes
 *  what it is told. Mirrors `flatten`, then bakes the per-run family. */
function richRunsOf(inline, style, family) {
    const atoms = [];
    flatten(inline, style, atoms);
    return atoms.map((a) => {
        if ("br" in a)
            return { br: true };
        if ("img" in a)
            return { img: a.img };
        const s = a.style;
        const run = {
            text: a.text, size: s.size, weight: s.weight, italic: s.italic,
            // THE FEATURES RIDE THE FAMILY NAME (font-features.ts), so deriving it
            // once here is all the plumbing there is: every fontString in the flow,
            // the DOM run block and the Mac payload all read `run.family`.
            family: featureFamily(s.mono ? CODEFAM : (s.family ?? family), featureTags(s)),
            strike: s.strike, color: s.color, tracking: s.tracking,
        };
        // inline code reads as a colored mono word, not a filled chip/button
        if (s.link !== undefined) {
            run.href = s.link;
            if (LINKU)
                run.underline = true;
        }
        if (s.fill !== undefined)
            run.fill = s.fill; // a themed accent fill (gradient/solid) overrides `color`
        // typographical treatments carried through to the backend (paint/decoration)
        if (s.underline)
            run.underline = true;
        if (s.shadow != null)
            run.shadow = s.shadow;
        if (s.outline != null)
            run.outline = s.outline;
        if (s.transform !== undefined && s.transform !== "none")
            run.transform = s.transform;
        if (s.smallCaps)
            run.smallCaps = true;
        return run;
    });
}
/** Carry a run's paint/decoration treatments onto its canvas Text view — the
 *  canvas twin of dom-backend's setRichContent run block, so a span wears the
 *  same look on either substrate. Strike stays a manual rule in the flow below
 *  (baseline-tuned and DOM-parity-gated); underline, absent on canvas until now,
 *  and the paint treatments (shadow/outline/transform/smallCaps) the Text painter
 *  draws. smallCaps also rides the run's fontString at measure time, so its
 *  synthesized-caps width is the one the flow lays out. */
function applyRunTreatments(t, r) {
    if (r.shadow != null)
        t.textShadow = r.shadow;
    if (r.outline != null)
        t.outline = r.outline;
    if (r.transform !== undefined)
        t.textTransform = r.transform;
    if (r.smallCaps)
        t.smallCaps = true;
    if (r.underline)
        t.underline = true;
}
/** Canvas fallback: flow the resolved runs as child views (the same greedy
 *  word-wrap as `layoutInline`, but over already-resolved runs). Returns the
 *  views to parent and the total height. Inline images are placed as atomic
 *  replaced boxes via `imageFor` (a persistent Image view per src); an image
 *  whose load has FAILED degrades to its `alt` text. */
function flowRichCanvas(blocks, width, onLink, imageFor, opts) {
    const views = [];
    // How many lines this flow may show — the share of `RichText.maxLines` its
    // document allotted it when it was built (TextFlow.clampLines). Absent = all.
    let remaining = opts?.keep ?? Infinity;
    let lines = 0;
    const anchors = new Map();
    // The first block's first line's baseline, in flow coordinates — what a
    // baseline-aligning layout sits this flow on. Decided by the same strut and
    // growth the paint uses, so the DOM path (which measures with this function
    // on the first block alone) and the canvas path agree by construction.
    let firstBaseline = null;
    let y = 0;
    for (const b of blocks) {
        y += b.gapBefore;
        // A heading's anchor records its top (after the gap above it) so a `@name`
        // reveal can clamp the scroll ancestor to it — the Canvas twin of the DOM
        // heading element's native scrollIntoView. First slug wins (preorder).
        if (b.anchor !== undefined && !anchors.has(b.anchor))
            anchors.set(b.anchor, y);
        // The block's LEAD run sets its strut and the space it coalesces with: the
        // LONGEST text run, not the first. A paragraph that opens with inline code
        // ("`src` is a URL…") used to take both from the monospace code face, so every
        // body word was placed on its own at a monospace space's width — visibly
        // spaced-out lines on canvas. Ordinary prose has one dominant run, which is the
        // first run anyway, so its geometry is unchanged.
        const textRuns = b.runs.filter((r) => "text" in r);
        const lead = textRuns.length === 0 ? undefined : textRuns.reduce((best, r) => (r.text.length > best.text.length ? r : best));
        const bm = fontMetrics(fontString({ fontFamily: lead?.family ?? FALLBACK_FAMILY, fontSize: lead?.size ?? sz(PROSE.body), fontWeight: lead?.weight ?? "normal" }));
        const lineH = Math.ceil(bm.ascent + bm.descent); // glyph box (for half-leading)
        const adv = Math.round(b.fontSize * b.lineHeight); // line box = round(fontSize × lineHeight), CSS-unitless — matches the DOM path
        const halfLead = Math.round((adv - lineH) / 2); // centre the glyph box in the line box (half-leading)
        const spaceFont = fontString({ fontFamily: lead?.family ?? FALLBACK_FAMILY, fontSize: lead?.size ?? sz(PROSE.body), fontWeight: "normal" });
        const spaceW = textWidth(" ", spaceFont);
        // A space is as wide as a space in the face it was typed in — the run it came
        // from. The lead face keeps the one measured above (bit-identical for plain prose).
        const spaceMemo = new Map();
        const spaceOf = (r) => {
            if (r === undefined)
                return spaceW;
            const sf = fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: "normal" });
            if (sf === spaceFont)
                return spaceW;
            let w = spaceMemo.get(sf);
            if (w === undefined) {
                w = textWidth(" ", sf, r.tracking);
                spaceMemo.set(sf, w);
            }
            return w;
        };
        let pendingRun;
        // Preformatted (a `<pre>` code flow): keep whitespace verbatim, break on the
        // runs' own newlines, no soft-wrap — the manual twin of CSS `white-space: pre`.
        if (b.pre) {
            let px = 0, ln = 0;
            for (const r of b.runs) {
                if ("br" in r) {
                    ln++;
                    px = 0;
                    continue;
                }
                if ("img" in r)
                    continue; // an image never occurs in a `pre` (code) block
                const f = fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: r.weight, italic: r.italic, smallCaps: r.smallCaps });
                const segs = r.text.split("\n");
                for (let si = 0; si < segs.length; si++) {
                    if (si > 0) {
                        ln++;
                        px = 0;
                    }
                    const seg = segs[si];
                    if (seg === "" || ln >= remaining)
                        continue;
                    const w = textWidth(r.transform ? transformText(seg, r.transform) : seg, f, r.tracking);
                    const t = new Text();
                    t.x = px;
                    t.y = y + ln * adv + halfLead;
                    t.width = Math.ceil(w) + 2;
                    t.wrap = false;
                    t.fontSize = r.size;
                    t.fontWeight = r.weight;
                    t.italic = r.italic;
                    t.fontFamily = r.family;
                    t.textColor = r.color;
                    t.text = seg;
                    if (r.tracking !== 0)
                        t.letterSpacing = r.tracking;
                    if (r.fill !== undefined)
                        t.textFill = r.fill;
                    applyRunTreatments(t, r);
                    if (r.href !== undefined && onLink) {
                        const href = r.href;
                        setClick(t, () => onLink(href));
                    }
                    views.push(t);
                    px += w;
                }
            }
            firstBaseline ??= y + halfLead + bm.ascent; // a pre's line 0: the strut, nothing grows it
            lines += ln + 1;
            y += Math.min(ln + 1, Math.max(0, remaining)) * adv;
            remaining -= ln + 1;
            continue;
        }
        const toks = [];
        let word = [];
        const flush = () => { if (word.length) {
            toks.push({ word });
            word = [];
        } };
        for (const r of b.runs) {
            if ("br" in r) {
                flush();
                toks.push({ br: true });
                continue;
            }
            // Inline image on the manual flow (Canvas/mac): a real replaced box — a
            // persistent, cached Image view (from `imageFor`) sized to its natural
            // aspect capped to the flow width, placed atomically in the line, bottom on
            // the baseline. Before the bitmap loads it occupies nothing (it pops in on
            // load, when the flow reflows); a FAILED load degrades to the `alt` text (a
            // broken image's own fallback), in the block's lead style.
            if ("img" in r) {
                const info = imageFor?.(r.img.src);
                if (info !== undefined && !info.failed) {
                    flush();
                    let iw = 0, ih = 0;
                    if (info.loaded && info.nw > 0) {
                        iw = Math.min(info.nw, width);
                        ih = Math.max(1, Math.round(info.nh * (iw / info.nw)));
                    }
                    toks.push({ img: info.view, w: iw, h: ih, href: r.img.href });
                    continue;
                }
                // no image host, or the load failed → alt text fallback
                const base = { text: "", size: lead?.size ?? b.fontSize, weight: lead?.weight ?? "normal", italic: false, family: lead?.family ?? FALLBACK_FAMILY, strike: false, color: lead?.color ?? 0, tracking: lead?.tracking ?? 0 };
                if (r.img.href !== undefined)
                    base.href = r.img.href;
                const imf = fontString({ fontFamily: base.family, fontSize: base.size, fontWeight: base.weight });
                for (const part of (r.img.alt || r.img.src).split(/(\s+)/)) {
                    if (part === "")
                        continue;
                    if (/^\s+$/.test(part)) {
                        flush();
                        const last = toks[toks.length - 1];
                        if (last && ("word" in last || "img" in last))
                            toks.push({ sp: true });
                    }
                    else
                        word.push({ text: part, run: { ...base, text: part }, w: textWidth(part, imf, base.tracking) });
                }
                continue;
            }
            const f = fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: r.weight, italic: r.italic, smallCaps: r.smallCaps });
            for (const part of r.text.split(/(\s+)/)) {
                if (part === "")
                    continue;
                if (/^\s+$/.test(part)) {
                    flush();
                    const last = toks[toks.length - 1];
                    if (last && ("word" in last || "img" in last))
                        toks.push({ sp: true, run: r });
                }
                else
                    word.push({ text: part, run: r, w: textWidth(r.transform ? transformText(part, r.transform) : part, f, r.tracking) });
            }
        }
        flush();
        // A single word (no internal whitespace) WIDER than the flow cannot wrap at a
        // space, so — matching CSS `overflow-wrap: break-word` and the DOM backend
        // (a long code span or slash-path in a narrow table cell) — it breaks at
        // character boundaries into pieces that each fit. Only over-wide words are
        // touched; a word that fits is passed through untouched, so this is a no-op
        // for ordinary prose (and keeps the DOM↔canvas perceptual gate green there).
        // The pieces carry no space between them, so they render contiguously but may
        // wrap between any two characters, exactly as break-word does.
        const breakWide = (w) => {
            if (w.reduce((s, p) => s + p.w, 0) <= width)
                return [w];
            const out = [];
            let cur = [], curW = 0;
            for (const p of w) {
                const pf = fontString({ fontFamily: p.run.family, fontSize: p.run.size, fontWeight: p.run.weight, italic: p.run.italic, smallCaps: p.run.smallCaps });
                const meas = (s) => textWidth(p.run.transform ? transformText(s, p.run.transform) : s, pf, p.run.tracking);
                let buf = "";
                for (const ch of [...p.text]) {
                    const trialW = meas(buf + ch);
                    if (buf !== "" && curW + trialW > width) { // committing buf keeps the piece ≤ width
                        cur.push({ text: buf, run: p.run, w: meas(buf) });
                        out.push(cur);
                        cur = [];
                        curW = 0;
                        buf = "";
                    }
                    buf += ch;
                }
                if (buf !== "") {
                    const bw = meas(buf);
                    cur.push({ text: buf, run: p.run, w: bw });
                    curW += bw;
                }
            }
            if (cur.length)
                out.push(cur);
            return out;
        };
        const broken = [];
        for (const tok of toks) {
            if ("word" in tok)
                for (const piece of breakWide(tok.word))
                    broken.push({ word: piece });
            else
                broken.push(tok);
        }
        // Collect this block's views WITH their line, tracking each line's right
        // edge, so a centred/right-aligned block (a table cell's column) can shift
        // every view on a line by its free space — the manual twin of CSS text-align.
        // Two-pass, content-derived line boxes (the CSS inline-formatting model).
        // Pass 1 flows tokens into lines and records each view WITH its line and its
        // offset FROM THAT LINE'S BASELINE (`boff`); it also grows each line's box to
        // fit any run taller than the block. Pass 2 stacks the lines by their own
        // heights and resolves every view's y. For ALL of today's content this is
        // byte-identical to the old block-uniform `adv`: every line is seeded with the
        // block STRUT (the block font's own line box, whose height IS `adv`), and no
        // inline run yet exceeds it — inline `code` is smaller, same-family bold/italic
        // share font-bounding metrics — so `max(strut, run)` stays the strut. A run
        // TALLER than the block (a bigger inline size, once that lands) is what finally
        // grows a line; until then this pass changes no pixel. Baseline alignment (a
        // run sits ON the line baseline, not top-aligned) falls out of pass 2 for free
        // — it generalizes the old `ry` fix.
        const blockViews = [];
        const lineRight = new Map();
        let x = 0, line = 0, pending = false;
        // The block strut: `strutAbove` is the baseline's distance below the line top
        // (the old `halfLead + bm.ascent`), `strutBelow` the descent side; together
        // they are exactly `adv`, so an all-strut (today's) line box is bit-identical.
        const strutAbove = halfLead + bm.ascent;
        const strutBelow = adv - strutAbove;
        const lineAbove = []; // per line: baseline distance below the line top (max over runs)
        const lineBelow = []; // per line: descent extent below the baseline (max over runs)
        // A run's own half-leading box (CSS: leading split evenly around the glyph),
        // widening the line only past the strut.
        const grow = (ln, fmAsc, fmDesc, size) => {
            const box = Math.round(size * (b.lineHeight || 1));
            const hl = Math.round((box - Math.ceil(fmAsc + fmDesc)) / 2);
            lineAbove[ln] = Math.max(lineAbove[ln] ?? strutAbove, fmAsc + hl);
            lineBelow[ln] = Math.max(lineBelow[ln] ?? strutBelow, fmDesc + hl);
        };
        let group = null;
        const flushGroup = () => {
            if (group === null)
                return;
            const g = group;
            group = null;
            const r = g.run;
            const t = new Text();
            t.x = g.x0;
            t.width = Math.ceil(g.end - g.x0) + 2;
            t.wrap = false;
            t.fontSize = r.size;
            t.fontWeight = r.weight;
            t.italic = r.italic;
            t.fontFamily = r.family;
            t.textColor = r.color;
            t.text = g.parts.join("");
            if (r.tracking !== 0)
                t.letterSpacing = r.tracking;
            if (r.fill !== undefined)
                t.textFill = r.fill;
            applyRunTreatments(t, r);
            if (r.href !== undefined && onLink) {
                const href = r.href;
                setClick(t, () => onLink(href));
            }
            // A plain run is the lead face, so its top sits `bm.ascent` above the baseline.
            blockViews.push({ v: t, line: g.line, boff: -bm.ascent });
        };
        for (const tok of broken) {
            if ("br" in tok) {
                flushGroup();
                line++;
                x = 0;
                pending = false;
                continue;
            }
            if ("sp" in tok) {
                pending = true;
                pendingRun = tok.run;
                continue;
            }
            // An inline image: an atomic replaced box. Wrap it like a word if it does
            // not fit, grow the line to its height (bottom on the baseline), and place
            // the persistent Image view. Zero-sized (not-yet-loaded) images just take
            // their seat; the load reflows the whole flow.
            if ("img" in tok) {
                flushGroup();
                const iw = tok.w, ih = tok.h;
                const gap = pending && x > 0 ? spaceOf(pendingRun) : 0;
                if (iw > 0 && x + gap + iw > width && x > 0) {
                    line++;
                    x = 0;
                }
                else
                    x += gap;
                pending = false;
                const im = tok.img;
                im.x = x;
                im.width = iw;
                im.height = ih;
                if (tok.href !== undefined && onLink) {
                    const href = tok.href;
                    setClick(im, () => onLink(href));
                }
                if (ih > 0)
                    lineAbove[line] = Math.max(lineAbove[line] ?? strutAbove, ih); // fit the box above the baseline
                blockViews.push({ v: im, line, boff: -ih, persistent: true });
                x += iw;
                lineRight.set(line, x);
                continue;
            }
            const ww = tok.word.reduce((s, p) => s + p.w, 0);
            const gap = pending && x > 0 ? spaceOf(pendingRun) : 0;
            if (x + gap + ww > width && x > 0) {
                flushGroup();
                line++;
                x = 0;
            }
            else
                x += gap;
            pending = false;
            let first = true;
            for (const p of tok.word) {
                const r = p.run;
                const rFont = fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: r.weight, italic: r.italic, smallCaps: r.smallCaps });
                // COALESCE consecutive same-run words on a line into ONE Text view.
                // A view per WORD is what this used to emit — a 100-word paragraph was
                // ~100 views — because whitespace flushes the token. Runs of body prose
                // are the overwhelming majority of a document and can be one view a line.
                //
                // ⚠ ONLY when the run's font is the one `spaceW` was measured with. The
                // gaps between words were laid out at that width; inside a single Text
                // the engine uses the RUN's own space advance instead, so coalescing a
                // run in a different face would move every word after the first space.
                // Restricting it to the lead face keeps every position bit-identical —
                // which is what lets the DOM↔canvas perceptual gate stay green.
                const plain = r.chipBg === undefined && !r.strike && rFont === spaceFont;
                if (group !== null && (!plain || group.run !== r || group.line !== line))
                    flushGroup();
                if (plain) {
                    if (group === null)
                        group = { run: r, x0: x, line, parts: [], end: x };
                    else if (first && gap > 0)
                        group.parts.push(" ");
                    group.parts.push(p.text);
                    x += p.w;
                    group.end = x;
                }
                else {
                    // A non-lead run — different face/size/weight, inline `code`, a strike —
                    // is measured and baseline-aligned: its top is its OWN ascent above the
                    // line baseline (`boff = -ascent`), and it grows the line if it is taller.
                    const fm = fontMetrics(rFont);
                    grow(line, fm.ascent, fm.descent, r.size);
                    const t = new Text();
                    if (r.chipBg !== undefined) {
                        const c = rectView(Math.ceil(p.w) + 6, lineH, r.chipBg, 3);
                        c.x = x - 3;
                        blockViews.push({ v: c, line, boff: -bm.ascent });
                    }
                    t.x = x;
                    t.width = Math.ceil(p.w) + 2;
                    t.wrap = false;
                    t.fontSize = r.size;
                    t.fontWeight = r.weight;
                    t.italic = r.italic;
                    t.fontFamily = r.family;
                    t.textColor = r.color;
                    t.text = p.text;
                    if (r.tracking !== 0)
                        t.letterSpacing = r.tracking;
                    if (r.fill !== undefined)
                        t.textFill = r.fill; // themed accent (gradient/solid) — same ramp as the DOM path
                    applyRunTreatments(t, r);
                    if (r.href !== undefined && onLink) {
                        const href = r.href;
                        setClick(t, () => onLink(href));
                    }
                    blockViews.push({ v: t, line, boff: -fm.ascent });
                    // The strike rule, CENTER-anchored ~0.31·size ABOVE the baseline — the
                    // same font-metric position the Text component and the DOM backend use,
                    // so `~~struck~~` prose lines up across all three. (The old
                    // `-ascent + 0.55·size` sat ~0.1·size too low.) Thickness tracks size
                    // like the Text rule; at prose sizes that is the 1px hairline as before.
                    if (r.strike) {
                        const sth = Math.max(1, Math.round(r.size / 16));
                        blockViews.push({ v: rectAt(x, 0, Math.ceil(p.w), sth, r.color), line, boff: -Math.round(r.size * 0.31) - Math.floor(sth / 2) });
                    }
                    x += p.w;
                }
                lineRight.set(line, x);
                first = false;
            }
        }
        flushGroup();
        // Pass 2: stack the lines (each by its own box, the strut where nothing grew)
        // and place every view at its line's baseline plus its own offset.
        const lineTop = [];
        let yy = y;
        for (let k = 0; k <= line; k++) {
            lineTop[k] = yy;
            yy += (lineAbove[k] ?? strutAbove) + (lineBelow[k] ?? strutBelow);
        }
        firstBaseline ??= lineTop[0] + (lineAbove[0] ?? strutAbove); // line 0's baseline, grown or strut
        for (const bv of blockViews)
            bv.v.y = lineTop[bv.line] + (lineAbove[bv.line] ?? strutAbove) + bv.boff;
        if (b.align === "center" || b.align === "right") {
            for (const { v, line: ln } of blockViews) {
                const free = width - (lineRight.get(ln) ?? 0);
                if (free > 0)
                    v.x += b.align === "center" ? free / 2 : free;
            }
        }
        // THE CLAMP (RichText.maxLines). The lines exist here — every view carries
        // its line index — so spending the budget is: keep the lines that fit, drop
        // the views on the rest, end the last kept line with an ellipsis, and stop
        // the block's height at that line's bottom. `remaining` runs across the
        // blocks of this flow, so the next block sees what this one left.
        const lineCount = line + 1;
        lines += lineCount;
        let keep = lineCount;
        if (remaining < lineCount) {
            keep = Math.max(0, Math.floor(remaining));
            // The ellipsis marks a line that was CUT SHORT, which happens only when
            // this block is PARTLY kept. When the budget runs out exactly at a block
            // boundary, the last kept line is a whole line and nothing marks it —
            // which is also what -webkit-line-clamp and CTLineCreateTruncatedLine do
            // there, so the three renderers agree by rule and not by luck.
            if (keep > 0) {
                const onLast = blockViews.filter((bv) => bv.line === keep - 1 && bv.v instanceof Text);
                const tail = onLast[onLast.length - 1]?.v;
                if (tail !== undefined && !tail.text.endsWith("…")) {
                    const f = fontString({ fontFamily: tail.fontFamily, fontSize: tail.fontSize, fontWeight: tail.fontWeight, italic: tail.italic });
                    tail.text = ellipsize(tail.text, f, width - tail.x, tail.letterSpacing);
                    tail.width = Math.ceil(textWidth(tail.text, f, tail.letterSpacing)) + 2;
                }
            }
            // A wholly dropped block takes its gap with it: `y` was already advanced
            // by `gapBefore` above, and a gap before nothing is a gap nobody asked for.
            yy = keep > 0 ? lineTop[keep - 1] + (lineAbove[keep - 1] ?? strutAbove) + (lineBelow[keep - 1] ?? strutBelow) : lineTop[0] - b.gapBefore;
        }
        remaining -= lineCount;
        // Persistent (image) views are already children managed by the flow's image
        // cache — position them (done above) but do NOT hand them back to be inserted
        // and discarded with the per-pass text views.
        for (const bv of blockViews) {
            if (bv.line >= keep) {
                if (bv.persistent !== true)
                    bv.v.discard();
                continue;
            }
            if (bv.persistent !== true)
                views.push(bv.v);
        }
        y = yy;
    }
    return { views, height: y, anchors, firstBaseline, lines };
}
/** TextFlow — the internal native-flow renderer (NOT a user component; see the
 *  RichText family below). A flowing block of styled text: `content` (resolved
 *  runs) and `flowWidth` are set by its owner before attach; it renders natively
 *  (DOM) or manually (canvas) and auto-sizes its height to the flowed content. */
class TextFlow extends View {
    content = [];
    flowWidth = 0;
    /** The lines this flow may show under its document's `maxLines`, allotted
     *  when the document was BUILT and reused by every render after; 0 = all. */
    clampLines = 0;
    /** Re-flow at a new width, keeping the view and its content.
     *
     *  ⚠ THE EARLY-OUT IS THE WHOLE POINT. Prose is capped at a reading measure,
     *  so most flows in a document do NOT change width when the window does —
     *  and re-laying them out is the expensive part (on the native host
     *  `setRichContent` runs a synchronous AppKit text layout). Rebuilding used
     *  to re-lay every flow unconditionally: ~40 of them per drag step, 699ms of
     *  a 712ms resize frame, nearly all of it for flows whose width was
     *  identical before and after. */
    reflow(w) {
        if (this.flowWidth === w)
            return;
        this.width = w;
        this.flowWidth = w;
        // A flow with nothing that wraps (a `pre` — fixed lines, scrolled
        // horizontally) cannot change its layout or its height when the container
        // width changes, so it needs no re-flow at all. Skipping it here also skips
        // serializing its blocks across the seam, which for a document of code
        // fences was megabytes per drag.
        if (this.content.every((b) => b.pre === true)) {
            // ... but the HOST box must still adopt the width (it bounds the pre's
            // native horizontal scroller — stuck at a boot-time 0 it clips the flow
            // to nothing). Width-only, no re-flow; no backend hook ⇒ full render.
            if (this.surface?.setRichWidth !== undefined) {
                this.surface.setRichWidth(w);
                return;
            }
        }
        this.render();
    }
    onLink = null;
    /** The default link behavior (location.md §0.5). §12.2's mechanism, closed:
     *  a Markdown/HTMLText instance is a RichText PARENT holding TextFlow
     *  children — an author's declared `onLink` installs on the parent, while
     *  each flow reads its own `this.onLink`, so no handler ever arrived and
     *  every authored href was dead. The default therefore walks UP: the
     *  nearest ancestor with a declared onLink wins whole (the docs app's
     *  openDocLink keeps its custom routing untouched); with none, the href
     *  goes into the app's follow — "#story" navigates in-app, a URL leaves
     *  through navigate. Bound, so either backend can take it as a bare fn. */
    followLink = (href) => {
        for (let n = this.parent; n !== null; n = n.parent) {
            const h = n.onLink;
            if (typeof h === "function") {
                h.call(n, href);
                return;
            }
        }
        const app = this.root;
        app?.follow?.(href);
    };
    manual = [];
    /** The first line's baseline inside this flow (the RichText's `baseline`
     *  fact). On the native path the backend flowed the text, so it is measured
     *  here by running the manual flow over the FIRST block alone — the same
     *  arithmetic the canvas path paints by, the DOM↔canvas parity gate being
     *  what makes that the DOM's number too. Null until rendered. */
    firstBaseline = null;
    /** Inline images are PERSISTENT children keyed by (resolved) src — created once
     *  and kept across reflows so a bitmap's async load survives, and pruned when
     *  the content no longer references them. Each installs a constraint that
     *  reflows this flow when its natural size (or failure) lands, so an image pops
     *  into place the frame it loads — the Canvas/mac twin of the DOM `<img>`'s
     *  native reflow. (Text/rect views live in `manual` and are rebuilt each pass;
     *  images must not be, or every reflow would restart their load.) */
    imageViews = new Map();
    imageUsed = new Set();
    imageSeq = new Map(); // per-pass occurrence counter, by src
    // Keyed by OCCURRENCE, not src: two images with the same URL are two boxes in
    // the flow (as two `<img>` on DOM), so each needs its own view — sharing one
    // would let only the last placement survive. The occurrence order is stable
    // across reflows, so the key `src#n` is stable too.
    imageFor = (src) => {
        const n = this.imageSeq.get(src) ?? 0;
        this.imageSeq.set(src, n + 1);
        const key = src + "#" + n;
        let im = this.imageViews.get(key);
        if (im === undefined) {
            im = new Image();
            im.stretches = "both"; // fill the aspect-correct box the flow sizes it to
            im.source = src;
            this.imageViews.set(key, im);
            this.appendChild(im);
            if (this.backend !== null && this.surface !== null)
                im.attach(this.backend, this.surface);
            const view = im;
            const c = new Constraint("TextFlow.img", () => `${view.loaded} ${view.naturalWidth} ${view.naturalHeight} ${view.failed}`, () => this.render(), 0);
            c.run();
            onDiscard(im, () => c.dispose());
        }
        this.imageUsed.add(key);
        return { view: im, nw: im.naturalWidth, nh: im.naturalHeight, loaded: im.loaded, failed: im.failed };
    };
    /** Canvas only: each heading anchor's y offset inside this flow, captured on
     *  the manual layout (the DOM path finds the tagged element instead). */
    anchorYs = new Map();
    /** The heading anchor slugs this flow renders — read from `content`, so it is
     *  the same on both backends and available as soon as the content is set (before
     *  a native measure). The reveal walk (view.ts) collects these. */
    anchorSlugs() {
        const out = [];
        for (const b of this.content)
            if (b.anchor !== undefined)
                out.push(b.anchor);
        return out;
    }
    /** Bring heading `slug` into view (location.md §6). Backend-split at the seam:
     *  DOM finds the `data-anchor` element and scrolls it natively; Canvas passes the
     *  recorded y offset so the surface clamps the scroll ancestor. Returns whether
     *  it revealed — false before the flow has realized that heading. */
    revealAnchor(slug, inset = 0) {
        const within = this.anchorYs.has(slug) ? this.anchorYs.get(slug) : -1;
        return this.surface?.revealRichAnchor(slug, within, inset) ?? false;
    }
    /** True while this flow's height is a PROVISIONAL number — rendered (or just
     *  un-hidden), with the backend's asynchronous measurement still outstanding
     *  (§12.1: the DOM's ResizeObserver reports a frame after layout; a flow
     *  inside a display:none subtree measures 0 until re-shown). The reveal
     *  machinery HOLDS an anchored arrival while any flow reports true
     *  (location.md §0.5.3 — the component-sourced veto). Set at render and at
     *  visibility-flip (view.ts markRichPending); cleared by the measurement
     *  callback. Synchronous backends (headless, canvas) never set it. */
    measurePending = false;
    /** The flow's EFFECTIVE `selectable` — the species default (ruled
     *  2026-07-30): a flowing document is selectable BY ITS NATURE, so when
     *  nobody on the ancestor chain says otherwise, the answer is true — the
     *  Jots shape (a Markdown note, no declaration anywhere) reads as the
     *  document it is. Any provision still wins over this default, in either
     *  direction: `selectable = false` on the instance, a container, or a
     *  Control ancestor vetoes it (the unusual non-selectable document, one
     *  explicit line); the ambient default stays false for everything that is
     *  not a flow (a `Text` is a label). The provided read is tracked, so a
     *  provision appearing later re-flows. */
    effSelectable() {
        // A flowing document is selectable by nature: DEFAULT true, so a bare
        // Markdown/HTMLText selects, yet a provider above — a container's
        // `selectable = false`, or `selectable = false` on the Markdown instance
        // (a provision, since RichText declares no such slot) — overrides. Read as
        // a provided value, tracked, so a provision appearing later re-flows.
        return providedRead(this, "selectable", true, true);
    }
    attach(backend, parentSurface, before = null) {
        super.attach(backend, parentSurface, before);
        // Re-flow when the width or the effective `selectable` changes.
        const c = new Constraint("TextFlow.flow", () => `${this.flowWidth} ${this.effSelectable()}`, () => this.render(), 0);
        c.run();
        onDiscard(this, () => c.dispose());
    }
    clearManual() {
        for (const v of this.manual) {
            this.removeChild(v);
            v.discard();
        }
        this.manual = [];
    }
    /** The backend re-measured the native flow (font load, or becoming visible
     *  after attaching under a zero-sized ancestor). Track it so the stack re-flows. */
    onMeasured(h) {
        this.measurePending = false; // the settled height has arrived (the veto lifts)
        if (this.surface !== null && h >= 0)
            this.height = h;
    }
    render() {
        const s = this.surface;
        if (s === null)
            return;
        // The DEFAULT for a rich-text link is the app's own follow (location.md
        // §0.5): a plain click on an authored href reaches the app with no wiring —
        // "#story" navigates in-app, a URL leaves through navigate — and an
        // explicit onLink handler still wins whole. This closes §12.2 (every
        // authored .md link was dead unless each flow hand-wired a handler).
        const link = this.onLink ?? this.followLink;
        // Arm the veto BEFORE the flow: on a deferred-measure backend the settled
        // height arrives through onMeasured a frame later; until then this flow's
        // height is provisional and an anchored reveal must hold (§0.5.3).
        this.measurePending = s.deferredRichMeasure === true;
        const h = s.setRichContent(this.content, this.effSelectable(), this.flowWidth, (nh) => this.onMeasured(nh), link);
        if (h >= 0) { // native path: the backend flowed + measured
            this.clearManual();
            this.height = h;
            this.firstBaseline = this.content.length > 0
                ? flowRichCanvas(this.content.slice(0, 1), this.flowWidth, undefined, undefined, { measure: true }).firstBaseline
                : null;
            // THE CLAMP, on a renderer that wraps for itself (RichText.maxLines). The
            // document allotted this flow its lines when it was built; the engine is
            // handed that count on every render, so a later render cannot drift.
            if (this.clampLines > 0) {
                const clamped = s.setRichClamp?.(this.clampLines) ?? -1;
                if (clamped >= 0)
                    this.height = clamped;
            }
            return;
        }
        // Canvas: lay the runs out as child views ourselves.
        this.clearManual();
        this.imageUsed.clear();
        this.imageSeq.clear();
        const { views, height, anchors, firstBaseline } = flowRichCanvas(this.content, this.flowWidth, this.onLink ?? this.followLink, this.imageFor, this.clampLines > 0 ? { keep: this.clampLines } : undefined);
        // Prune image children the content no longer references (a re-pointed `text`).
        for (const [key, im] of this.imageViews)
            if (!this.imageUsed.has(key)) {
                this.removeChild(im);
                im.discard();
                this.imageViews.delete(key);
            }
        this.anchorYs = anchors;
        this.firstBaseline = firstBaseline;
        let at = 0;
        for (const v of views) {
            this.insertChild(v, at++);
            this.manual.push(v);
            if (this.backend !== null)
                v.attach(this.backend, this.surface);
        }
        this.height = height;
        this.childrenMutated();
    }
}
/** The vertical stacking spine every prose container uses. Owns only its children's
 *  y (SimpleLayout leaves the cross axis and sizes alone), so a child growing after
 *  an async measure re-flows the stack through the ordinary reactive wake. */
/** The prose block stack — a PRIVATE strategy over the Layout kernel (the
 *  language-facing SimpleLayout is a library class now; the runtime keeps its
 *  own tiny y-stack for rendered blocks — same place() shape, no surface). */
class ProseStack extends Layout {
    spacing = 0;
    place() {
        let pos = 0;
        return this.laid().map((c) => {
            const box = { y: pos };
            if (c.visible)
                pos += c.height + this.spacing;
            return box;
        });
    }
}
function yStack(spacing) {
    const s = new ProseStack();
    s.spacing = spacing;
    return s;
}
/** A native flowing block of styled text — one contiguous, selectable region on the
 *  DOM backend. `content` is the resolved RichBlock(s); `width` is the flow width. */
function flowView(content, width, ctx) {
    const rt = new TextFlow();
    rt.width = width;
    rt.flowWidth = width;
    rt.content = content;
    rt.onLink = ctx.onLink;
    setRewidth(rt, (w) => rt.reflow(w));
    return rt;
}
const REWIDTH = new WeakMap();
function setRewidth(v, f) { REWIDTH.set(v, f); return v; }
/** The plain text of an inline sequence — for a heading's anchor slug. Drops
 *  emphasis/link wrappers and keeps the readable characters (matches what a
 *  reader sees, so the slug reads like the heading). */
function inlineText(inline) {
    let s = "";
    for (const n of inline) {
        if (n.t === "text" || n.t === "code")
            s += n.value;
        else if (n.t === "br")
            s += " ";
        else if (n.t === "image")
            s += n.alt;
        else
            s += inlineText(n.inline);
    }
    return s;
}
/** One paragraph or heading resolved to the seam's RichBlock shape. A heading
 *  also carries its `anchor` — the deterministic slug of its text (location.md §6:
 *  a heading IS its anchor) — so a fragment `@name` can bring it into view. */
function proseBlock(b, gapBefore, bodyColor, ctx) {
    if (b.t === "heading") {
        const size = PROSE.heading[b.level - 1];
        return { tag: `h${b.level}`, runs: richRunsOf(b.inline, base(size, HEADINGW, HEADINGC), ctx.family), gapBefore, lineHeight: 1.2, fontSize: sz(size), anchor: headingSlug(inlineText(b.inline)) || undefined };
    }
    return { tag: "p", runs: richRunsOf(b.inline, base(BODY.size, BODY.weight, bodyColor, BODY.tracking), ctx.family), gapBefore, lineHeight: ctx.lead, fontSize: sz(BODY.size) };
}
function layoutBlocks(blocks, width, bodyColor, ctx) {
    const out = [];
    let group = [];
    let prevProse = null; // previous prose block in this group
    let groupGeo = null; // the coalesced group's geometry
    // THE LINE BUDGET is spent here, while the document is built. Each prose block
    // is COUNTED at its content width (the measure-only pass canvas lays out by) and
    // its group allotted what is left; a group that must stop early carries that
    // count as `clampLines`. A block that begins with nothing left is not built.
    let groupTotal = 0, groupKeep = 0;
    // Flush the coalesced prose group: one TextFlow, built at its measure-capped
    // content width and offset by its alignment. An empty map ⇒ contentWidth = width
    // and placeX = 0, so this is byte-identical to the old `flowView(group, width)`.
    const flush = () => {
        if (group.length && groupGeo) {
            const cw = contentWidth(width, groupGeo);
            const v = flowView(group, cw, ctx);
            if (groupKeep < groupTotal)
                v.clampLines = groupKeep;
            v.x = placeX(width, cw, groupGeo);
            out.push({ view: v, geo: groupGeo });
        }
        group = [];
        prevProse = null;
        groupGeo = null;
        groupTotal = 0;
        groupKeep = 0;
    };
    for (const b of blocks) {
        if (BUDGET <= 0) {
            TRUNCATED = true;
            break;
        }
        if (b.t === "paragraph" || b.t === "heading") {
            const g = geoFor(b.t);
            // A geometry change within a prose run (e.g. centered headings over a
            // left-aligned column) can't share one native flow — flush and start fresh.
            if (group.length && groupGeo && !geoEqual(groupGeo, g))
                flush();
            // headings get generous space above and tight space below, so a section
            // groups with its own content instead of floating in an even column
            const gap = group.length === 0 ? 0
                : b.t === "heading" ? PROSE.headingGap[b.level - 1]
                    : prevProse === "heading" ? PROSE.headingBelow
                        : PROSE.blockGap;
            const rb = proseBlock(b, gap, bodyColor, ctx);
            if (BUDGET < Infinity) {
                const n = linesOf([rb], contentWidth(width, g));
                const k = Math.min(n, BUDGET);
                groupTotal += n;
                groupKeep += k;
                BUDGET -= n;
                if (k < n)
                    TRUNCATED = true;
            }
            group.push(rb);
            prevProse = b.t;
            groupGeo = g;
            continue;
        }
        flush();
        const g = geoFor(b.t);
        const cw = contentWidth(width, g);
        let v = null;
        switch (b.t) {
            case "list":
                v = buildList(b, cw, bodyColor, ctx);
                break;
            case "table":
                v = buildTable(b, cw, bodyColor, ctx);
                break;
            case "blockquote":
                v = buildQuote(b, cw, ctx);
                break;
            case "code":
                v = buildCode(b, cw);
                break;
            case "pre":
                v = buildPre(b, cw, bodyColor, ctx);
                break;
            case "rule":
                v = setRewidth(rectView(cw, 1, C.rule), (w) => { v.width = w; });
                break;
        }
        if (v !== null) {
            v.x = placeX(width, cw, g);
            out.push({ view: v, geo: g });
        }
    }
    flush();
    return out;
}
/** How many lines `blocks` flow to at `width` — the measure-only pass. */
function linesOf(blocks, width) {
    return flowRichCanvas(blocks, width, undefined, undefined, { measure: true }).lines;
}
/** A stacked container of `blocks` at `width` — the recursion point for a list
 *  item's body and a blockquote's content, so nested prose flows natively too. */
function buildBlocks(blocks, width, bodyColor, ctx) {
    const c = new View();
    c.width = width;
    const laid = layoutBlocks(blocks, width, bodyColor, ctx);
    for (const e of laid)
        c.appendChild(e.view);
    c.layout = yStack(PROSE.blockGap);
    // Nested blocks (a list item's body, a quote's body) re-width by recursing.
    setRewidth(c, (w) => { c.width = w; relayoutEntries(laid, w); });
    return c;
}
/** Apply a new container width to a laid-out set of blocks, in place.
 *  Returns false if any block has no re-width — the caller then rebuilds. */
function relayoutEntries(entries, width) {
    // ⚠ CHECK ALL, THEN APPLY. Bailing part-way through leaves the blocks before
    // the un-re-widthable one already re-laid — and re-widthing a flow costs a
    // full text layout — only for the caller's fallback rebuild to throw that
    // work away. A document with a `pre`, `code` or `table` in it (any Viewer
    // reader page) would then do strictly MORE work per resize than the plain
    // rebuild it replaced. This way it is either all-rewidth or straight to
    // rebuild, never both.
    for (const e of entries)
        if (REWIDTH.get(e.view) === undefined)
            return false;
    for (const e of entries) {
        const cw = contentWidth(width, e.geo);
        REWIDTH.get(e.view)(cw);
        e.view.x = placeX(width, cw, e.geo);
    }
    return true;
}
/** A preformatted, monospace flow that KEEPS its accent-colored runs — the
 *  syntax-highlighted code block (`<pre>` from HTMLText). Whitespace is preserved
 *  and the runs' own `\n`s are the line breaks; on DOM it's one contiguous,
 *  selectable `<pre>` with per-token color. The mono family rides in as the
 *  `family` arg (a non-`mono` base style, so no inline-code chip behind each run);
 *  `<span class>` accents still compose their fill on top. */
// The code text's left indent inside a box: the base pad, plus room for the
// `codeRule` bar when one is drawn.
const codePadLeft = (bar) => PROSE.codePad + (bar ? PROSE.codeRuleWidth + PROSE.codeRuleGap : 0);
function buildPre(b, width, bodyColor, ctx) {
    const bar = CODERULE !== null;
    const boxed = CODEBG !== null || bar; // a `<pre>` stays BARE until code chrome is set
    const padL = boxed ? codePadLeft(bar) : 0;
    const padR = boxed ? PROSE.codePad : 0;
    const flowW = width - padL - padR;
    const runs = richRunsOf(b.inline, base(CODESIZE, BODY.weight, bodyColor, BODY.tracking), CODEFAM);
    // Code renders at the font's natural line box (ascent+descent), NOT the prose
    // `lead` — so the `<pre>` reader/source view spaces its lines identically to a
    // fenced code block (whose Text leaf the backend sets to the same metric).
    const fm = fontMetrics(fontString({ fontFamily: CODEFAM, fontSize: sz(CODESIZE), fontWeight: "normal" }));
    const lead = (fm.ascent + fm.descent) / sz(CODESIZE);
    const flow = flowView([{ tag: "pre", runs, gapBefore: 0, lineHeight: lead, fontSize: sz(CODESIZE), pre: true }], flowW, ctx);
    if (BUDGET < Infinity) { // a <pre> spends its lines, and stops at its share
        const n = linesOf(flow.content, flowW);
        const k = Math.min(n, BUDGET);
        if (k < n) {
            flow.clampLines = Math.max(1, k);
            TRUNCATED = true;
        }
        BUDGET -= n;
    }
    // the widest line, for the gutter decision below — the runs' own text, priced
    // with the code face (a pre never wraps, so this is the scroll-overflow test)
    const preFont = fontString({ fontFamily: CODEFAM, fontSize: sz(CODESIZE), fontWeight: "normal" });
    const preMaxW = runs.map((r) => ("br" in r ? "\n" : "img" in r ? "" : r.text)).join("").split("\n").reduce((m, l) => Math.max(m, textWidth(l, preFont)), 0);
    if (!boxed)
        return flow; // today's behaviour when no chrome is set
    // Chrome opted in: wrap the flow in the same tinted box (+ optional bar) a fenced
    // block gets, so a highlighted `<pre>` and a fenced ``` render coherently. The box
    // itself does NOT scroll — an inner scroller carries the flow, so long lines scroll
    // horizontally while the box, its tint, and the left bar stay put (the scroller-
    // sibling pattern). `clip` rounds the box AND trims the full-height bar to the
    // corner. The box height tracks the flow's async measure (the `buildQuote` bar).
    const box = rectView(width, 1, CODEBG ?? C.codeBg, PROSE.codeRadius);
    box.clip = true;
    const rule = bar ? rectView(PROSE.codeRuleWidth, 1, CODERULE) : null;
    if (rule !== null) {
        rule.x = 0;
        rule.y = 0;
        box.appendChild(rule);
    }
    const scroller = new View();
    scroller.x = padL;
    scroller.y = PROSE.codePad;
    scroller.width = flowW;
    scroller.scrolls = "x";
    flow.x = 0;
    flow.y = 0;
    scroller.appendChild(flow);
    box.appendChild(scroller);
    // THE SCROLLBAR GUTTER (#25): a DOM overlay scrollbar reserves no space of
    // its own, so without slack it renders ON the last line of code. Reserve a few
    // px below the text exactly when a long line makes a bar possible; a block
    // that fits keeps today's height.
    const size = () => {
        const g = preMaxW > scroller.width + 0.5 ? PROSE.codeGutter : 0;
        const h = Math.max(1, flow.height + 2 * PROSE.codePad + g);
        box.height = h;
        scroller.height = flow.height + g;
        if (rule !== null)
            rule.height = h;
    };
    const c = new Constraint("RichText.codeBox", () => `${flow.height}`, size, 0);
    c.run();
    onDiscard(box, () => c.dispose());
    // The box's height already follows `flow.height` through the constraint above,
    // and a `pre` never re-wraps, so a width change is purely these three widths.
    setRewidth(box, (w) => {
        box.width = w;
        const fw = w - padL - padR;
        scroller.width = fw;
        flow.reflow(fw);
        size();
    });
    return box;
}
/** A fenced code block — a single preformatted, monospace Text in a rounded box
 *  that scrolls horizontally (not soft-wrapped). Already one run; no TextFlow. The
 *  box tint is `codeBackground` (else the themed house tint), plus a `codeRule`
 *  left bar when set — the same chrome a highlighted `<pre>` gets, for coherence. */
function buildCode(b, width) {
    const fm = fontMetrics(fontString({ fontFamily: CODEFAM, fontSize: sz(CODESIZE), fontWeight: "normal" }));
    const bar = CODERULE !== null;
    const padL = codePadLeft(bar);
    const codeFont = fontString({ fontFamily: CODEFAM, fontSize: sz(CODESIZE), fontWeight: "normal" });
    let codeText = b.text;
    if (BUDGET < Infinity) { // a fenced block spends one line per line of code
        const all = codeText === "" ? [""] : codeText.split("\n");
        const k = Math.min(all.length, BUDGET);
        if (k < all.length) {
            codeText = all.slice(0, k).join("\n");
            TRUNCATED = true;
        }
        BUDGET -= all.length;
    }
    const textLines = codeText === "" ? [""] : codeText.split("\n");
    const maxW = textLines.reduce((m, l) => Math.max(m, textWidth(l, codeFont)), 0);
    const baseH = Math.ceil(textLines.length * (fm.ascent + fm.descent)) + 2 * PROSE.codePad;
    const box = rectView(width, baseH, CODEBG ?? C.codeBg, PROSE.codeRadius);
    box.clip = true; // round the box + trim the full-height bar to the corner radius
    const rule = bar ? rectView(PROSE.codeRuleWidth, baseH, CODERULE) : null;
    if (rule !== null) {
        rule.x = 0;
        rule.y = 0;
        box.appendChild(rule);
    }
    // an inner scroller holds the text — long lines scroll while the bar stays fixed
    const scroller = new View();
    scroller.x = padL;
    scroller.y = PROSE.codePad;
    scroller.scrolls = "x";
    const t = textView(width - padL - PROSE.codePad, sz(CODESIZE), C.codeFg, "normal", codeText);
    t.x = 0;
    t.y = 0;
    t.wrap = false;
    t.fontFamily = CODEFAM;
    scroller.appendChild(t);
    box.appendChild(scroller);
    // Width sets the widths and the GUTTER (#25): the height itself comes from the
    // LINE COUNT (the text does not wrap), plus the overlay scrollbar's seat
    // exactly when a line is longer than the box — see buildPre's twin.
    const size = (w) => {
        const iw = w - padL - PROSE.codePad;
        const g = maxW > iw + 0.5 ? PROSE.codeGutter : 0;
        box.height = baseH + g;
        scroller.height = baseH - 2 * PROSE.codePad + g;
        if (rule !== null)
            rule.height = baseH + g;
        scroller.width = iw;
        t.width = iw;
    };
    size(width);
    setRewidth(box, (w) => {
        box.width = w;
        size(w);
    });
    return box;
}
/** A list — one reactive row per item: the marker in the gutter, the item's body
 *  (its own TextFlow(s), hanging-indented) beside it. The row auto-sizes to the
 *  body; the list stacks the rows. */
function buildList(b, width, bodyColor, ctx) {
    const list = new View();
    list.width = width;
    const rows = [];
    const bodyW = width - PROSE.indent;
    for (let i = 0; i < b.items.length; i++) {
        // The marker is a flow too, but it spends none of the budget: only the item's
        // BODY does (through buildBlocks). An item reached with nothing left is not
        // built at all, so a clamp never strands a bullet beside no text.
        if (BUDGET <= 0) {
            TRUNCATED = true;
            break;
        }
        const it = b.items[i];
        const marker = b.ordered ? `${b.start + i}.` : it.task === null ? "•" : it.task ? "☑" : "☐";
        const row = new View();
        row.width = width;
        // The marker is a one-run TextFlow too, so it shares the body's exact line box
        // — its baseline lines up with the item's first line with no metric fudge. It's
        // RIGHT-aligned in the gutter so it hugs the text (a small `markerGap` before
        // it), the way a browser renders a list marker — bullets and numbers sit just
        // left of the item, not stranded out at the paragraph margin.
        const mk = flowView([{ tag: "p", runs: richRunsOf([{ t: "text", value: marker }], base(BODY.size, BODY.weight, bodyColor, BODY.tracking), ctx.family), gapBefore: 0, lineHeight: ctx.lead, fontSize: sz(BODY.size), align: "right" }], PROSE.indent - PROSE.markerGap, ctx);
        mk.x = 0;
        mk.y = 0;
        const body = buildBlocks(it.blocks, bodyW, bodyColor, ctx);
        body.x = PROSE.indent;
        body.y = 0;
        row.appendChild(mk);
        row.appendChild(body);
        list.appendChild(row);
        rows.push({ row, body });
    }
    // Tight vs loose (CommonMark): a tight list packs its items at `itemGap`; a
    // loose one — items separated by a blank line — gets paragraph spacing between
    // them (`blockGap`), the same air the reference gives a loose item's `<p>`.
    list.layout = yStack(b.loose ? PROSE.blockGap : PROSE.itemGap);
    setRewidth(list, (w) => {
        list.width = w;
        for (const r of rows) {
            r.row.width = w;
            REWIDTH.get(r.body)?.(w - PROSE.indent);
        }
    });
    return list;
}
/** A GFM table — even columns with per-column alignment, each cell its own
 *  TextFlow, each row auto-sizing to its tallest cell, a rule under the header. */
function buildTable(b, width, bodyColor, ctx) {
    const cols = b.header.length;
    const colW = (width - (cols - 1) * PROSE.cellGap) / cols;
    const colX = (c) => c * (colW + PROSE.cellGap);
    const table = new View();
    table.width = width;
    const laidRows = [];
    const makeRow = (cells, weight, color) => {
        const rowCells = [];
        const row = new View();
        row.width = width;
        const contents = [];
        for (let c = 0; c < cols; c++) {
            const al = b.align[c];
            contents.push([{
                    tag: "p", runs: richRunsOf(cells[c] ?? [], base(BODY.size, weight, color, BODY.tracking), ctx.family),
                    gapBefore: 0, lineHeight: ctx.lead, fontSize: sz(BODY.size), align: al === "center" || al === "right" ? al : undefined,
                }]);
        }
        // A row spends the lines of its TALLEST cell, once — not a share per cell.
        const cellLines = BUDGET < Infinity ? contents.map((cc) => linesOf(cc, colW)) : [];
        const rowLines = cellLines.reduce((m, n) => Math.max(m, n), 0);
        const rowKeep = BUDGET < Infinity ? Math.min(rowLines, BUDGET) : Infinity;
        if (BUDGET < Infinity) {
            BUDGET -= rowLines;
            if (rowKeep < rowLines)
                TRUNCATED = true;
        }
        for (let c = 0; c < cols; c++) {
            const cell = flowView(contents[c], colW, ctx);
            if (rowKeep < (cellLines[c] ?? 0))
                cell.clampLines = rowKeep;
            cell.x = colX(c);
            cell.y = 0;
            rowCells.push(cell);
            row.appendChild(cell);
        }
        laidRows.push({ row, cells: rowCells });
        return row;
    };
    table.appendChild(makeRow(b.header, HEADINGW, HEADINGC));
    const headRule = rectView(width, 1, C.rule);
    table.appendChild(headRule);
    for (const r of b.rows) {
        if (BUDGET <= 0) {
            TRUNCATED = true;
            break;
        } // a row reached with nothing left is not built
        table.appendChild(makeRow(r, "normal", bodyColor));
    }
    table.layout = yStack(PROSE.itemGap);
    // Column widths are arithmetic — no content measurement — so a width change is
    // a re-x and a reflow per cell. The runs are untouched.
    setRewidth(table, (w) => {
        const cw2 = (w - (cols - 1) * PROSE.cellGap) / cols;
        table.width = w;
        headRule.width = w;
        for (const lr of laidRows) {
            lr.row.width = w;
            lr.cells.forEach((cell, c) => { cell.x = c * (cw2 + PROSE.cellGap); cell.reflow(cw2); });
        }
    });
    return table;
}
/** A blockquote — its content (recursed, in the quote color) indented past a left
 *  rule that spans the content height reactively (a late re-flow lengthens it). */
function buildQuote(b, width, ctx) {
    const outer = new View();
    outer.width = width;
    const body = buildBlocks(b.blocks, width - PROSE.quoteIndent, C.quoteColor, ctx);
    body.x = PROSE.quoteIndent;
    body.y = 0;
    const rule = rectView(3, 1, C.quoteRule);
    rule.x = 0;
    rule.y = 0;
    outer.appendChild(rule);
    outer.appendChild(body);
    const c = new Constraint("RichText.quoteRule", () => `${body.height}`, () => { rule.height = Math.max(1, body.height); }, 0);
    c.run();
    onDiscard(outer, () => c.dispose());
    setRewidth(outer, (w) => { outer.width = w; REWIDTH.get(body)?.(w - PROSE.quoteIndent); });
    return outer;
}
// ── the components ───────────────────────────────────────────────────────────
// `RichText` is the ABSTRACT family: flowing, structured, styled text. You never
// write `RichText [ ]` (like `Layout`, it names no format) — you write `Markdown`
// or `HTMLText`, which differ ONLY in how they parse their source into the block
// tree. The rendering engine is shared here (reactive TextFlow containers — see
// layoutBlocks); the base owns the reactive render, each concrete class supplies a
// parser. Shared attributes (lineHeight/bodyColor/scale) and the `link` event
// live on the base, so both formats inherit them.
export class RichText extends View {
    built = [];
    /** Named styles a source can reference (HTMLText's `styles`); none by
     *  default — Markdown has no syntax to name one. */
    stylesOf() { return {}; }
    /** RichText's `scale` is a FONT-SIZE multiplier consumed by rebuild(), not the
     *  paint transform it means on a plain View — so mask the base flush()'s scale
     *  push. Without this, a `scale` constraint that evaluates before the surface
     *  attaches bakes a CSS transform ON TOP of the scaled fonts (double-scaling),
     *  and the view's measured height no longer matches its painted height. */
    flush(s) {
        super.flush(s);
        if (this.scale !== 1)
            s.setScale(1, this.pivotX, this.pivotY);
    }
    /** …and mask the GEOMETRY meaning too. The glyphs are already scaled into
     *  the runs, so this view's measured width/height ARE its on-screen box —
     *  but footprint() (auto-extent, layout, bounds) multiplies by `scale`,
     *  shrinking the box a second time. Measured: at the reader's default 0.9
     *  every code block stood 1/0.9 taller on screen than in the model — the
     *  desktop's 7,000px Window block bled ~760px of pixels past its measured
     *  extent, and the next segments were laid over its tail ("the prose
     *  overlaps the code blocks", 2026-08-20). Identity here completes the
     *  rule flush() started: to the geometry system a RichText is untransformed.
     *  (Rotation is honored via the base walk with scale forced to 1 — a
     *  rotated RichText keeps its swept box.) */
    footprint() {
        if (this.rotation === 0)
            return { x: 0, y: 0, width: this.width, height: this.height };
        // the base corner walk with scale pinned to 1 (rotation still honored)
        const w = this.width, h = this.height;
        const px = this.pivotX, py = this.pivotY;
        const a = (this.rotation * Math.PI) / 180;
        const ca = Math.cos(a), sa = Math.sin(a);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
            const dx = cx - px, dy = cy - py;
            const fx = px + (dx * ca - dy * sa);
            const fy = py + (dx * sa + dy * ca);
            if (fx < minX)
                minX = fx;
            if (fx > maxX)
                maxX = fx;
            if (fy < minY)
                minY = fy;
            if (fy > maxY)
                maxY = fy;
        }
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    attach(backend, parentSurface, before = null) {
        super.attach(backend, parentSurface, before);
        // Reactive render: re-parse and rebuild whenever the source OR `width` changes
        // (a resize re-flows, not only an edit); `dark`/`scale` in the key so a theme
        // flip or font-size change re-renders.
        // STRUCTURE — the source and everything baked into the runs (palette, scale,
        // sizes). These genuinely need a re-parse and a rebuild.
        // `faceGeneration()` is in the key because the flow MEASURES inside rebuild,
        // which is the apply — where reads are not tracked (face-table.ts). Without
        // it a face that lands after this flow was built leaves every run placed by
        // the fallback's widths, and paints the real face over those positions.
        const c = new Constraint(`${this.constructor.name}.render`, () => `${this.sourceKey()} ${this.lineHeight} ${this.maxLines} ${this.bodyColor} ${this.isDark()} ${this.scale} ${this.codeBackground} ${this.codeRule} ${faceGeneration()} ${heldFamily(this, "fontFamily", this.fontFamily)} ${heldFamily(this, "codeFamily", this.codeFamily)}`, () => this.rebuild(), 0);
        c.run();
        onDiscard(this, () => c.dispose());
        // WIDTH — nothing structural depends on it, so re-width in place. Separate
        // constraint, and it must run AFTER the first build (c.run() above) so there
        // is something to re-width.
        const cw = new Constraint(`${this.constructor.name}.rewidth`, () => `${this.width}`, () => this.relayout(this.width > 0 ? this.width : 640), 0);
        cw.run();
        onDiscard(this, () => cw.dispose());
    }
    /** The color scheme for the house rich-element palette: the explicit `dark`
     *  override if set (an app whose own theme selector differs from the OS), else
     *  the root App's OS `dark`, read by walking to the tree root. */
    isDark() {
        if (this.dark != null)
            return this.dark;
        let r = this;
        while (r instanceof View && r.parent !== null)
            r = r.parent;
        return !!r.dark;
    }
    /** A link run was activated. Mechanism only: fire `onLink(href)` for the app to
     *  dispatch (custom routing — the docs app's openDocLink); unhandled, the href
     *  goes into the App's FOLLOW (location.md §0.5) — "#story" navigates in-app,
     *  anything else leaves through navigate — so authored prose links work with
     *  no wiring at all. (The old fallback was `navigate(href)` raw, which sent a
     *  fragment ref to the HOST as an outbound URL — the browser then opened
     *  DISTRO_ROOT + "#…", a different page entirely: §12.2's second half.) */
    dispatchLink(href) {
        if (typeof this.onLink === "function") {
            fireEvent(this, "link", href);
            return;
        }
        let r = this;
        while (r instanceof View && r.parent !== null)
            r = r.parent;
        const app = r;
        if (typeof app.follow === "function")
            app.follow(href);
        else
            app.navigate?.(href); // a non-App root: external links keep working
    }
    /** The last layout's blocks, with the geometry each derived from. */
    laid = [];
    /** A WIDTH-ONLY change: re-width what is already built instead of rebuilding.
     *
     *  Nothing structural depends on width — `parseSource()` never sees it, and a
     *  RichBlock carries no wrapping (the backend is handed the width and does
     *  the wrapping itself). All width does is set each block's content width and
     *  x. Rebuilding for it re-parsed the source, discarded every view and
     *  re-attached fresh ones, which on the native host meant a synchronous text
     *  layout per flow — ~40 per drag step, 699ms of a 712ms frame, most of it for
     *  flows whose width had not actually changed.
     *
     *  Falls back to a full rebuild if any block has no re-width registered, so an
     *  unconverted block type stays correct. */
    relayout(width) {
        // A clamped document's allotments depend on how its lines wrap, and wrapping
        // depends on width — so a width change re-spends the budget from the top.
        if (this.maxLines > 0) {
            this.rebuild();
            return;
        }
        if (this.laid.length === 0) {
            this.rebuild();
            return;
        }
        if (!relayoutEntries(this.laid, width)) {
            this.rebuild();
            return;
        }
        this.childrenMutated();
        this.claimBaseline();
    }
    /** Land the `baseline` fact: the first stacked block sits at y = 0, so when
     *  it is a prose flow its first line's baseline IS this box's. */
    claimBaseline() {
        const first = this.laid[0]?.view;
        setBound(this, "baseline", first instanceof TextFlow ? first.firstBaseline : null);
    }
    rebuild() {
        C = this.isDark() ? COLORS_DARK : COLORS_LIGHT; // pick the palette for this render
        BUDGET = this.maxLines > 0 ? this.maxLines : Infinity; // the flow clamp, for this render
        TRUNCATED = false;
        SCALE = this.scale || 1; // font-size multiplier for this render
        STYLES = this.stylesOf(); // named styles for this render
        for (const v of this.built) {
            this.removeChild(v);
            v.discard();
        }
        this.built = [];
        const width = this.width > 0 ? this.width : 640;
        // The family a flow's value names now — held while a newly chosen font is
        // inside its wait, exactly as the render key above read it (font-value.ts).
        const family = heldFamily(this, "fontFamily", this.fontFamily) || FALLBACK_FAMILY;
        const lead = this.lineHeight || 1;
        const bodyColor = this.bodyColor ?? C.bodyColor;
        // Running text obeys the ambient text style, exactly like a
        // `Text` does — so rich text honors its inherited style like every other
        // run. Size/weight/tracking follow fontSize/fontWeight/
        // letterSpacing; their View defaults (16/normal/0) match the house body, so
        // prose that sets nothing renders unchanged. Color stays on the theme-aware
        // `bodyColor` house default (textColor's default is opaque black, which would
        // break dark-mode prose), overridable via `bodyColor`.
        BODY = { size: this.fontSize || PROSE.body, weight: this.fontWeight || "normal", tracking: this.letterSpacing || 0 };
        HEADINGW = this.headingWeight || "bold";
        HEADINGC = this.headingColor ?? C.headingColor;
        LINKC = this.linkColor ?? C.link;
        LINKU = this.linkUnderline === true;
        CODEC = this.codeColor ?? C.code;
        CODESIZE = this.codeSize || PROSE.codeSize;
        CODEFAM = heldFamily(this, "codeFamily", this.codeFamily) || PROSE.mono;
        CODEBG = this.codeBackground;
        CODERULE = this.codeRule;
        LAYOUT = this.richTextLayout ?? {};
        RESOLVE_SRC = (src) => resolveAsset(src, this.root);
        const ctx = { family, lead, onLink: (href) => this.dispatchLink(href) };
        // Render the block tree to a flat list of stacked sub-views: paragraphs and
        // headings coalesce into native TextFlows, and list/table/quote/code/rule each
        // become their own reactive sub-view (their text regions are TextFlows too).
        const children = layoutBlocks(this.parseSource(), width, bodyColor, ctx);
        let at = 0;
        for (const e of children) {
            this.insertChild(e.view, at++);
            this.built.push(e.view);
            if (this.backend !== null)
                e.view.attach(this.backend, this.surface);
        }
        this.laid = children; // kept so a width change can re-width
        // Stack the block-views, PROSE.blockGap apart; their heights (a TextFlow's
        // measured at attach, a container's derived by auto-extent) drive the stack,
        // and auto-extent gives this box its height — so leave `height` unset.
        this.layout = yStack(PROSE.blockGap);
        this.childrenMutated();
        this.claimBaseline();
        // The build spent the budget; report what happened, so a
        // "Show more" has a fact to bind to rather than a look to infer.
        setBound(this, "truncated", TRUNCATED);
    }
}
/** Rich content authored in Markdown (`text`). */
export class Markdown extends RichText {
    // `?? ""` on both: an unresolved `:path` is defined to fall back to the
    // default, but one browser-side crash report (`.replace` on null) suggests a
    // path where a null still reaches here — unreproduced headless, guarded
    // anyway, since the correct rendering of a null source IS the empty flow.
    sourceKey() { return this.text ?? ""; }
    parseSource() { return parse(this.text ?? ""); }
}
/** Rich content authored in a WHITELISTED HTML subset (`html`), validated at
 *  render time. `unsupported` decides what a tag outside the set does — `strip`
 *  (unwrap, keep text) or `error` (throw) — so LOADED content has defined
 *  behaviour, never silent corruption. Same flow engine as Markdown. */
export class HTMLText extends RichText {
    // folded into the key (as a signature) so a re-themed style re-renders.
    sourceKey() { return this.html + " " + this.unsupported + " " + JSON.stringify(this.textStyles ?? {}); }
    parseSource() { return parseHtml(this.html, this.unsupported); }
    stylesOf() { return this.textStyles ?? {}; }
}
// Shared attributes live on the RichText base; Markdown/HTMLText inherit them
// and add only their own source attribute(s).
defineAttributes(RichText, {
    // FACE slots, off View: each defaults to the nearest provided value.
    textColor: { def: 0x000000, defBinding: providedDefault("textColor", 0x000000) },
    fontSize: { def: 16, defBinding: providedDefault("fontSize", 16) },
    fontFamily: { def: "sans-serif", defBinding: providedDefault("fontFamily", "sans-serif") },
    fontWeight: { def: "normal", defBinding: providedDefault("fontWeight", "normal") },
    letterSpacing: { def: 0, defBinding: providedDefault("letterSpacing", 0) },
    // `selectable` is NOT declared here: RichText reads it as a provided value
    // (effSelectable / TextFlow), so a container's provision reaches the flow
    // children without RichText's own slot shadowing the walk.
    // Rich-text STRUCTURE slots, off View: heading/link/code/richTextLayout —
    // null color = the theme-aware house token (resolved in rebuild()).
    headingColor: { def: null, defBinding: providedDefault("headingColor", null) },
    headingWeight: { def: "bold", defBinding: providedDefault("headingWeight", "bold") },
    linkColor: { def: null, defBinding: providedDefault("linkColor", null) },
    linkUnderline: { def: false, defBinding: providedDefault("linkUnderline", false) },
    codeColor: { def: null, defBinding: providedDefault("codeColor", null) },
    codeSize: { def: 0, defBinding: providedDefault("codeSize", 0) },
    codeFamily: { def: "", defBinding: providedDefault("codeFamily", "") },
    codeBackground: { def: null, defBinding: providedDefault("codeBackground", null) },
    codeRule: { def: null, defBinding: providedDefault("codeRule", null) },
    richTextLayout: { def: null, defBinding: providedDefault("richTextLayout", null) },
    lineHeight: { def: 1 }, bodyColor: { def: null }, scale: { def: 1 }, dark: { def: null }, baseline: { def: null },
    maxLines: { def: 0 }, truncated: { def: false },
});
defineAttributes(Markdown, {
    text: { def: "" },
});
defineAttributes(HTMLText, {
    html: { def: "" },
    unsupported: { def: "strip" },
    textStyles: { def: {} },
});
//# sourceMappingURL=markdown.js.map