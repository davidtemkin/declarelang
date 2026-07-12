// Markdown — the rich content component (design/text-and-markdown.md). Points
// at any string and renders it: `Markdown [ text = … ]`. The string is parsed
// (md.ts, the standalone reader) into the block tree; each block becomes neo
// views, stacked vertically, wrapped, styled by the `prose` defaults. The
// render is REACTIVE: a Constraint over `text` (and `width`) re-renders when
// either changes, so a computed/streamed value renders live and a resize
// re-flows.
//
// Block layout is a deterministic y-cursor (measure each block, place at an
// absolute offset — no nested auto-size ordering). The INLINE tier is a
// multi-run layout: a paragraph's styled runs (strong/em/code/link/strike) are
// wrapped together across style boundaries and emitted as one `Text` per
// styled segment-piece (plus a chip behind code, a rule through strike). neo's
// `Text` is one style per run, so rich flow is composed FROM runs, not a new
// backend primitive — both backends render it identically, for free.
import { View, onDiscard, fireEvent } from "./view.js";
import { Text } from "./text.js";
import { SimpleLayout } from "./layout.js";
import { Constraint } from "./reactive.js";
import { defineAttributes } from "./attributes.js";
import { fontMetrics, fontString, textWidth } from "./measure.js";
import { parse } from "./md.js";
import { parseHtml } from "./html.js";
// ── prose stylesheet ─────────────────────────────────────────────────────────
// The role → style map that makes rendered Markdown look good with zero author
// effort, on the theme tokens. A design artifact, deliberately data (not code).
const PROSE = {
    heading: [30, 24, 20, 18, 16, 15], // px by level 1..6
    body: 16,
    codeSize: 14,
    codeRadius: 8,
    codePad: 14,
    mono: "ui-monospace, SFMono-Regular, monospace",
    blockGap: 16,
    itemGap: 6,
    indent: 26,
    quoteIndent: 20,
    cellGap: 18,
};
// The rich-element colours (headings, code, links, rules, quotes) come in a dark and
// a light set; `C` points at the one matching the app's colour scheme, chosen per
// rebuild from the root App's `dark` (below). Body text is themed separately via the
// `bodyColor` attribute, so a caller can dim prose independently of the scheme.
const COLORS_DARK = {
    headingColor: 0xffffff, bodyColor: 0xc7d0d6,
    code: 0xd6e2ea, codeChip: 0x172b39, codeFg: 0xb8c4cc, codeBg: 0x0e1922,
    rule: 0x24394a, link: 0x6aa4ff, quoteRule: 0x2f4a5c, quoteColor: 0x9fb0ba,
};
const COLORS_LIGHT = {
    headingColor: 0x111c24, bodyColor: 0x33424e,
    code: 0x2c5578, codeChip: 0xe6edf3, codeFg: 0x2e3b46, codeBg: 0xeef3f8,
    rule: 0xd3dce4, link: 0x2f6fe0, quoteRule: 0xc4d0da, quoteColor: 0x5a6874,
};
let C = COLORS_DARK; // active set; set at the top of each rebuild
let SCALE = 1; // font-size multiplier (the `scale` attr), set per rebuild
let ACCENTS = {}; // named text fills (HTMLText `accents`), set per rebuild
// The running-text style pulled from the prevailing text slots (fontSize/
// fontWeight/letterSpacing), set per rebuild — so ALL prose body (paragraphs
// AND list/quote/table text) obeys the ambient text style, like a `Text`.
let BODY = { size: 16, weight: "normal", tracking: 0 };
// The rich-text STRUCTURE style, resolved per rebuild from the prevailing
// structural slots (headingColor/headingWeight/linkColor/codeColor) with the
// theme-aware house token as the fallback — so headings/links/inline-code obey
// an app-wide override but look right with zero config.
let HEADINGW = "bold";
let HEADINGC = 0, LINKC = 0, CODEC = 0;
/** Resolve a `<span class="…">` name to a themed fill: the whole class, else its
 *  first matching token (`"accent big"`); no match ⇒ undefined (plain text). */
function resolveAccent(name) {
    if (name in ACCENTS)
        return ACCENTS[name];
    for (const tok of name.split(/\s+/))
        if (tok in ACCENTS)
            return ACCENTS[tok];
    return undefined;
}
const sz = (n) => Math.round(n * SCALE); // scale a prose size, keeping whole pixels
const FALLBACK_FAMILY = "system-ui, sans-serif";
function base(size, weight, color, tracking = 0) {
    return { size: sz(size), weight, italic: false, mono: false, strike: false, color, tracking };
}
function fontOf(s, family) {
    return fontString({ fontFamily: s.mono ? PROSE.mono : family, fontSize: s.size, fontWeight: s.weight, italic: s.italic });
}
/** Walk the inline tree, resolving each leaf's prevailing style. */
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
            case "fill": {
                const f = resolveAccent(n.name);
                flatten(n.inline, f !== undefined ? { ...style, fill: f } : style, out);
                break;
            }
        }
    }
}
/** Wrap a mix of styled runs within `width`. A "word" is a maximal run of
 *  non-space text and may span several styles (e.g. `un**bold**`) — it never
 *  breaks internally. Words flow across lines greedily; `align` shifts each
 *  finished line. Returns the placed pieces (one per style-run-per-line). */
function layoutInline(runs, style, family, width, align = "left", lineHeightMul = 1) {
    const atoms = [];
    flatten(runs, style, atoms);
    const baseFont = fontOf(style, family);
    const bm = fontMetrics(baseFont);
    const lineH = Math.ceil(bm.ascent + bm.descent); // the glyph box (chip height)
    const adv = Math.ceil(lineH * lineHeightMul); // the line stride, incl. leading
    const halfLead = Math.round((adv - lineH) / 2); // centre each line in its slot
    const spaceW = textWidth(" ", baseFont, style.tracking);
    const tokens = [];
    let word = [];
    const flushWord = () => { if (word.length) {
        tokens.push({ word });
        word = [];
    } };
    for (const a of atoms) {
        if ("br" in a) {
            flushWord();
            tokens.push({ br: true });
            continue;
        }
        for (const part of a.text.split(/(\s+)/)) {
            if (part === "")
                continue;
            if (/^\s+$/.test(part)) {
                flushWord();
                const last = tokens[tokens.length - 1];
                if (last && "word" in last)
                    tokens.push({ sp: true }); // one space between words, none leading
            }
            else {
                word.push({ text: part, style: a.style, w: textWidth(part, fontOf(a.style, family), a.style.tracking) });
            }
        }
    }
    flushWord();
    const placed = [];
    let x = 0, line = 0, pendingSpace = false;
    for (const tok of tokens) {
        if ("br" in tok) {
            line++;
            x = 0;
            pendingSpace = false;
            continue;
        }
        if ("sp" in tok) {
            pendingSpace = true;
            continue;
        }
        const ww = tok.word.reduce((s, p) => s + p.w, 0);
        const gap = pendingSpace && x > 0 ? spaceW : 0;
        if (x + gap + ww > width && x > 0) {
            line++;
            x = 0;
        } // wrap (the space is dropped at the break)
        else
            x += gap;
        pendingSpace = false;
        for (const p of tok.word) {
            placed.push({ text: p.text, style: p.style, x, y: line * adv + halfLead, w: p.w });
            x += p.w;
        }
    }
    if (align !== "left" && placed.length) {
        const right = new Map();
        for (const p of placed)
            right.set(p.y, Math.max(right.get(p.y) ?? 0, p.x + p.w));
        for (const p of placed) {
            const free = width - (right.get(p.y) ?? 0);
            if (free > 0)
                p.x += align === "center" ? free / 2 : free;
        }
    }
    return { placed, height: (line + 1) * adv, lineH };
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
// ── the y-cursor builder ───────────────────────────────────────────────────
class Column {
    family;
    width;
    lineHeight;
    onLink;
    out = [];
    y = 0;
    constructor(family, width, lineHeight = 1, onLink) {
        this.family = family;
        this.width = width;
        this.lineHeight = lineHeight;
        this.onLink = onLink;
    }
    place(v, x, h) { v.x = x; v.y = Math.round(this.y); this.out.push(v); this.y += h; }
    span(v, x, y, h) { v.x = x; v.y = Math.round(y); v.height = Math.max(1, Math.round(h)); this.out.push(v); }
    gap(n) { this.y += n; }
    /** Place a laid-out flow at (x0, y0); the y-cursor is untouched. */
    put(flow, x0, y0) {
        for (const p of flow.placed) {
            const px = Math.round(x0 + p.x), py = Math.round(y0 + p.y);
            if (p.style.mono)
                this.out.push(chip(px, py, p.w, flow.lineH));
            const t = new Text();
            t.x = px;
            t.y = py;
            t.width = Math.ceil(p.w) + 2;
            t.wrap = false;
            t.fontSize = p.style.size;
            t.fontWeight = p.style.weight;
            t.italic = p.style.italic;
            t.fontFamily = p.style.mono ? PROSE.mono : this.family;
            t.textColor = p.style.color;
            t.text = p.text;
            if (p.style.tracking !== 0)
                t.letterSpacing = p.style.tracking;
            if (p.style.fill !== undefined)
                t.textFill = p.style.fill;
            if (p.style.link !== undefined && this.onLink) {
                const href = p.style.link;
                setClick(t, () => this.onLink(href));
            }
            this.out.push(t);
            if (p.style.strike)
                this.out.push(rectAt(px, py + Math.round(p.style.size * 0.55), Math.ceil(p.w), 1, p.style.color));
        }
    }
    /** Lay out `runs` at the cursor and advance past them. */
    flow(runs, x0, width, style, align = "left") {
        const f = layoutInline(runs, style, this.family, width, align, this.lineHeight);
        this.put(f, x0, this.y);
        this.y += f.height;
    }
    /** Place a short run at a fixed (x, y) WITHOUT moving the cursor — a list marker
     *  set in the gutter beside its (hanging-indented) item text. */
    mark(text, x, y, style) {
        this.put(layoutInline([{ t: "text", value: text }], style, this.family, 9999, "left", this.lineHeight), x, y);
    }
}
function chip(x, y, w, h) {
    const v = rectView(Math.ceil(w) + 6, h, C.codeChip, 3);
    v.x = x - 3;
    v.y = y;
    return v;
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
// RichText lays the same runs out as child views itself. Markdown groups its
// paragraphs and headings into these (its lists/tables/code stay classic views),
// which is what makes prose selection contiguous instead of word-by-word.
/** Flatten an inline tree to fully-resolved runs for the seam — the effective
 *  font, colour, and (for `code`) chip are baked in so a backend just realizes
 *  what it is told. Mirrors `flatten`, then bakes the per-run family. */
function richRunsOf(inline, style, family) {
    const atoms = [];
    flatten(inline, style, atoms);
    return atoms.map((a) => {
        if ("br" in a)
            return { br: true };
        const s = a.style;
        const run = {
            text: a.text, size: s.size, weight: s.weight, italic: s.italic,
            family: s.mono ? PROSE.mono : family, strike: s.strike, color: s.color, tracking: s.tracking,
        };
        if (s.mono)
            run.chipBg = C.codeChip;
        if (s.link !== undefined)
            run.href = s.link;
        if (s.fill !== undefined)
            run.fill = s.fill; // a themed accent fill (gradient/solid) overrides `color`
        return run;
    });
}
/** Canvas fallback: flow the resolved runs as child views (the same greedy
 *  word-wrap as `layoutInline`, but over already-resolved runs). Returns the
 *  views to parent and the total height. */
function flowRichCanvas(blocks, width, onLink) {
    const views = [];
    let y = 0;
    for (const b of blocks) {
        y += b.gapBefore;
        const lead = b.runs.find((r) => "text" in r);
        const bm = fontMetrics(fontString({ fontFamily: lead?.family ?? FALLBACK_FAMILY, fontSize: lead?.size ?? sz(PROSE.body), fontWeight: lead?.weight ?? "normal" }));
        const lineH = Math.ceil(bm.ascent + bm.descent); // glyph box (for half-leading)
        const adv = Math.round(b.fontSize * b.lineHeight); // line box = round(fontSize × lineHeight), CSS-unitless — matches the DOM path
        const halfLead = Math.round((adv - lineH) / 2); // centre the glyph box in the line box (half-leading)
        const spaceW = textWidth(" ", fontString({ fontFamily: lead?.family ?? FALLBACK_FAMILY, fontSize: lead?.size ?? sz(PROSE.body), fontWeight: "normal" }));
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
            const f = fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: r.weight, italic: r.italic });
            for (const part of r.text.split(/(\s+)/)) {
                if (part === "")
                    continue;
                if (/^\s+$/.test(part)) {
                    flush();
                    const last = toks[toks.length - 1];
                    if (last && "word" in last)
                        toks.push({ sp: true });
                }
                else
                    word.push({ text: part, run: r, w: textWidth(part, f, r.tracking) });
            }
        }
        flush();
        let x = 0, line = 0, pending = false;
        for (const tok of toks) {
            if ("br" in tok) {
                line++;
                x = 0;
                pending = false;
                continue;
            }
            if ("sp" in tok) {
                pending = true;
                continue;
            }
            const ww = tok.word.reduce((s, p) => s + p.w, 0);
            const gap = pending && x > 0 ? spaceW : 0;
            if (x + gap + ww > width && x > 0) {
                line++;
                x = 0;
            }
            else
                x += gap;
            pending = false;
            for (const p of tok.word) {
                const py = y + line * adv + halfLead, r = p.run;
                if (r.chipBg !== undefined) {
                    const c = rectView(Math.ceil(p.w) + 6, lineH, r.chipBg, 3);
                    c.x = x - 3;
                    c.y = py;
                    views.push(c);
                }
                const t = new Text();
                t.x = x;
                t.y = py;
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
                if (r.href !== undefined && onLink) {
                    const href = r.href;
                    setClick(t, () => onLink(href));
                }
                views.push(t);
                if (r.strike)
                    views.push(rectAt(x, py + Math.round(r.size * 0.55), Math.ceil(p.w), 1, r.color));
                x += p.w;
            }
        }
        y += (line + 1) * adv;
    }
    return { views, height: y };
}
/** TextFlow — the internal native-flow renderer (NOT a user component; see the
 *  RichText family below). A flowing block of styled text: `content` (resolved
 *  runs) and `flowWidth` are set by its owner before attach; it renders natively
 *  (DOM) or manually (canvas) and auto-sizes its height to the flowed content. */
class TextFlow extends View {
    content = [];
    flowWidth = 0;
    onLink = null;
    manual = [];
    attach(backend, parentSurface, before = null) {
        super.attach(backend, parentSurface, before);
        // Re-flow when the width or the prevailing `selectable` changes.
        const c = new Constraint("TextFlow.flow", () => `${this.flowWidth} ${this.selectable}`, () => this.render(), 0);
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
        if (this.surface !== null && h >= 0)
            this.height = h;
    }
    render() {
        const s = this.surface;
        if (s === null)
            return;
        const link = this.onLink ?? (() => { });
        const h = s.setRichContent(this.content, this.selectable, this.flowWidth, (nh) => this.onMeasured(nh), link);
        if (h >= 0) { // native path: the backend flowed + measured
            this.clearManual();
            this.height = h;
            return;
        }
        // Canvas: lay the runs out as child views ourselves.
        this.clearManual();
        const { views, height } = flowRichCanvas(this.content, this.flowWidth, this.onLink ?? undefined);
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
// ── block → view ────────────────────────────────────────────────────────────
function renderBlocks(blocks, col, x0, width, textColor = C.bodyColor) {
    for (let bi = 0; bi < blocks.length; bi++) {
        if (bi > 0)
            col.gap(PROSE.blockGap);
        const b = blocks[bi];
        switch (b.t) {
            case "heading":
                col.flow(b.inline, x0, width, base(PROSE.heading[b.level - 1], HEADINGW, HEADINGC));
                break;
            case "paragraph":
                col.flow(b.inline, x0, width, base(BODY.size, BODY.weight, textColor, BODY.tracking));
                break;
            case "rule":
                col.place(rectView(width, 1, C.rule), x0, 1);
                break;
            case "code": {
                const fm = fontMetrics(fontString({ fontFamily: PROSE.mono, fontSize: sz(PROSE.codeSize), fontWeight: "normal" }));
                const lines = b.text === "" ? 1 : b.text.split("\n").length;
                const h = Math.ceil(lines * (fm.ascent + fm.descent)) + 2 * PROSE.codePad;
                const box = rectView(width, h, C.codeBg, PROSE.codeRadius);
                // a long line stays on one line and the box scrolls horizontally (clipped to
                // its width) instead of spilling over the prose — a code block, not soft-wrap.
                box.scrollsX = true;
                const t = textView(width - 2 * PROSE.codePad, sz(PROSE.codeSize), C.codeFg, "normal", b.text);
                t.x = PROSE.codePad;
                t.y = PROSE.codePad;
                t.wrap = false;
                t.fontFamily = PROSE.mono;
                box.appendChild(t);
                col.place(box, x0, h);
                break;
            }
            case "blockquote": {
                const top = col.y;
                renderBlocks(b.blocks, col, x0 + PROSE.quoteIndent, width - PROSE.quoteIndent, C.quoteColor);
                col.span(rectView(3, 1, C.quoteRule), x0, top, col.y - top);
                break;
            }
            case "list": {
                for (let i = 0; i < b.items.length; i++) {
                    if (i > 0)
                        col.gap(PROSE.itemGap);
                    const it = b.items[i];
                    const marker = b.ordered ? `${b.start + i}.` : it.task === null ? "•" : it.task ? "☑" : "☐";
                    const [head, ...rest] = it.blocks;
                    const lead = head && (head.t === "paragraph" || head.t === "heading") ? head.inline : [];
                    // Hanging indent: the item text (first line AND its wraps) flows at
                    // x0+indent, so it forms a clean block; the marker sits in the gutter at
                    // x0 beside the first line. (Previously the marker was inline and wraps
                    // fell back to x0 — the "continuation left of the text" margin bug.)
                    const y0 = col.y;
                    col.flow(lead, x0 + PROSE.indent, width - PROSE.indent, base(BODY.size, BODY.weight, textColor, BODY.tracking));
                    col.mark(marker, x0, y0, base(BODY.size, BODY.weight, textColor, BODY.tracking));
                    const tail = head && (head.t === "paragraph" || head.t === "heading") ? rest : it.blocks;
                    if (tail.length) {
                        col.gap(PROSE.itemGap);
                        renderBlocks(tail, col, x0 + PROSE.indent, width - PROSE.indent, textColor);
                    }
                }
                break;
            }
            case "table":
                renderTable(b, col, x0, width, textColor);
                break;
        }
    }
}
/** GFM table — real cells: even columns, per-column alignment, wrapping runs,
 *  row height = tallest cell. */
function renderTable(b, col, x0, width, bodyColor = C.bodyColor) {
    const cols = b.header.length;
    const colW = (width - (cols - 1) * PROSE.cellGap) / cols;
    const colX = (c) => x0 + c * (colW + PROSE.cellGap);
    const row = (cells, weight, color) => {
        const top = col.y;
        let h = 0;
        for (let c = 0; c < cols; c++) {
            const cell = cells[c] ?? [];
            const f = layoutInline(cell, base(BODY.size, weight, color, BODY.tracking), col.family, colW, b.align[c] ?? "left", col.lineHeight);
            col.put(f, colX(c), top);
            h = Math.max(h, f.height);
        }
        col.y = top + h;
    };
    row(b.header, HEADINGW, HEADINGC);
    col.gap(PROSE.itemGap);
    col.place(rectView(width, 1, C.rule), x0, 1);
    for (const r of b.rows) {
        col.gap(PROSE.itemGap);
        row(r, "normal", bodyColor);
    }
}
// ── the components ───────────────────────────────────────────────────────────
// `RichText` is the ABSTRACT family: flowing, structured, styled text. You never
// write `RichText [ ]` (like `Layout`, it names no format) — you write `Markdown`
// or `HTMLText`, which differ ONLY in how they parse their source into the block
// tree. The rendering engine is shared here (TextFlow for prose, Column for
// structure); the base owns the reactive render, each concrete class supplies a
// parser. Shared attributes (lineHeight/bodyColor/scale) and the `link` event
// live on the base, so both formats inherit them.
export class RichText extends View {
    built = [];
    /** Named text fills a source can reference (HTMLText's `accents`); none by
     *  default — Markdown has no syntax to name one. */
    accentsOf() { return {}; }
    attach(backend, parentSurface, before = null) {
        super.attach(backend, parentSurface, before);
        // Reactive render: re-parse and rebuild whenever the source OR `width` changes
        // (a resize re-flows, not only an edit); `dark`/`scale` in the key so a theme
        // flip or font-size change re-renders.
        const c = new Constraint(`${this.constructor.name}.render`, () => `${this.width} ${this.sourceKey()} ${this.lineHeight} ${this.bodyColor} ${this.isDark()} ${this.scale}`, () => this.rebuild(), 0);
        c.run();
        onDiscard(this, () => c.dispose());
    }
    /** The root App's colour scheme (`app.dark`), read by walking to the tree root. */
    isDark() {
        let r = this;
        while (r instanceof View && r.parent !== null)
            r = r.parent;
        return !!r.dark;
    }
    /** A link run was activated. Mechanism only: fire `onLink(href)` for the app to
     *  dispatch (scroll to an anchor, set a route, open externally). Unhandled, it
     *  falls back to the App's `navigate` channel — so external links work with no
     *  wiring, and an app that owns routing overrides by declaring `onLink`. */
    dispatchLink(href) {
        if (typeof this.onLink === "function") {
            fireEvent(this, "link", href);
            return;
        }
        let r = this;
        while (r instanceof View && r.parent !== null)
            r = r.parent;
        if (r instanceof View)
            r.navigate = href;
    }
    rebuild() {
        C = this.isDark() ? COLORS_DARK : COLORS_LIGHT; // pick the palette for this render
        SCALE = this.scale || 1; // font-size multiplier for this render
        ACCENTS = this.accentsOf(); // named text fills for this render
        for (const v of this.built) {
            this.removeChild(v);
            v.discard();
        }
        this.built = [];
        const width = this.width || 640;
        const family = this.fontFamily || FALLBACK_FAMILY;
        const lead = this.lineHeight || 1;
        const bodyColor = this.bodyColor ?? C.bodyColor;
        // Running text obeys the ambient (prevailing) text style, exactly like a
        // `Text` does — so rich text is no longer the one text in the language that
        // ignores its inherited style. Size/weight/tracking follow fontSize/fontWeight/
        // letterSpacing; their View defaults (16/normal/0) match the house body, so
        // prose that sets nothing renders unchanged. Colour stays on the theme-aware
        // `bodyColor` house default (textColor's default is opaque black, which would
        // break dark-mode prose), overridable via `bodyColor`.
        BODY = { size: this.fontSize || PROSE.body, weight: this.fontWeight || "normal", tracking: this.letterSpacing || 0 };
        HEADINGW = this.headingWeight || "bold";
        HEADINGC = this.headingColor ?? C.headingColor;
        LINKC = this.linkColor ?? C.link;
        CODEC = this.codeColor ?? C.code;
        const onLink = (href) => this.dispatchLink(href); // click on a link run → app policy
        // Group consecutive paragraphs and headings into ONE native RichText (so
        // their selection, baselines and copy are the platform's, contiguously);
        // every other block (list, code, quote, table, rule) is a classic sub-view
        // built through the Column machinery. The block-views then stack vertically.
        const children = [];
        let group = [];
        const flushGroup = () => {
            if (group.length === 0)
                return;
            const rt = new TextFlow();
            rt.width = width;
            rt.flowWidth = width;
            rt.content = group;
            rt.onLink = onLink;
            children.push(rt);
            group = [];
        };
        for (const b of this.parseSource()) {
            if (b.t === "paragraph" || b.t === "heading") {
                const gapBefore = group.length === 0 ? 0 : PROSE.blockGap;
                group.push(b.t === "heading"
                    ? { tag: `h${b.level}`, runs: richRunsOf(b.inline, base(PROSE.heading[b.level - 1], HEADINGW, HEADINGC), family), gapBefore, lineHeight: 1.2, fontSize: sz(PROSE.heading[b.level - 1]) }
                    : { tag: "p", runs: richRunsOf(b.inline, base(BODY.size, BODY.weight, bodyColor, BODY.tracking), family), gapBefore, lineHeight: lead, fontSize: sz(BODY.size) });
            }
            else {
                flushGroup();
                const col = new Column(family, width, lead, onLink);
                renderBlocks([b], col, 0, width, bodyColor);
                const sub = new View();
                sub.width = width;
                sub.height = Math.ceil(col.y);
                for (const v of col.out)
                    sub.appendChild(v);
                children.push(sub);
            }
        }
        flushGroup();
        let at = 0;
        for (const v of children) {
            this.insertChild(v, at++);
            this.built.push(v);
            if (this.backend !== null)
                v.attach(this.backend, this.surface);
        }
        // Stack the block-views, PROSE.blockGap apart; their heights (a RichText's
        // measured at attach) drive the stack, and auto-extent gives this box its
        // height — so we leave `height` unset for the derive to own.
        const stack = new SimpleLayout();
        stack.axis = "y";
        stack.spacing = PROSE.blockGap;
        this.layout = stack;
        this.childrenMutated();
    }
}
/** Rich content authored in Markdown (`text`). */
export class Markdown extends RichText {
    sourceKey() { return this.text; }
    parseSource() { return parse(this.text); }
}
/** Rich content authored in a WHITELISTED HTML subset (`html`), validated at
 *  render time. `unsupported` decides what a tag outside the set does — `strip`
 *  (unwrap, keep text) or `error` (throw) — so LOADED content has defined
 *  behaviour, never silent corruption. Same flow engine as Markdown. */
export class HTMLText extends RichText {
    // `accents` folded into the key (as a signature) so a re-themed fill re-renders.
    sourceKey() { return this.html + " " + this.unsupported + " " + JSON.stringify(this.accents ?? {}); }
    parseSource() { return parseHtml(this.html, this.unsupported); }
    accentsOf() { return this.accents ?? {}; }
}
// Shared attributes live on the RichText base; Markdown/HTMLText inherit them
// and add only their own source attribute(s).
defineAttributes(RichText, { lineHeight: { def: 1 }, bodyColor: { def: null }, scale: { def: 1 } });
defineAttributes(Markdown, { text: { def: "" } });
defineAttributes(HTMLText, { html: { def: "" }, unsupported: { def: "strip" }, accents: { def: {} } });
//# sourceMappingURL=markdown.js.map