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
import type { RenderBackend, RichBlock, RichRun, Surface } from "./backend.js";
import { SimpleLayout } from "./layout.js";
import { Constraint } from "./reactive.js";
import { defineAttributes } from "./attributes.js";
import { fontMetrics, fontString, textWidth, type FontWeight } from "./measure.js";
import { parse, type Block, type Inline } from "./md.js";
import { parseHtml, type Unsupported } from "./html.js";
import type { Fill } from "./value.js";

// ── prose stylesheet ─────────────────────────────────────────────────────────
// The role → style map that makes rendered Markdown look good with zero author
// effort, on the theme tokens. A design artifact, deliberately data (not code).
const PROSE = {
  heading: [32, 24, 20, 18, 16, 15], // px by level 1..6
  headingGap: [40, 38, 30, 24, 20, 18], // space ABOVE a heading (not first), by level
  headingBelow: 10,                    // space below a heading, before its content
  body: 16,
  codeSize: 13,   // the house code rendition size — shared by inline, fenced, and <pre> code
  codeRadius: 8,
  codePad: 14,
  codeRuleWidth: 2,   // the `codeRule` left accent bar's thickness
  codeRuleGap: 12,    // extra left padding for code text when a `codeRule` bar is present
  mono: "ui-monospace, SFMono-Regular, monospace",
  blockGap: 16,
  itemGap: 6,
  indent: 28,     // list item body's hanging indent (text left)
  markerGap: 7,   // gap between the marker's right edge and the item text
  quoteIndent: 20,
  cellGap: 18,
};

// The rich-element colours (headings, code, links, rules, quotes) come in a dark and
// a light set; `C` points at the one matching the app's colour scheme, chosen per
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
let C: typeof COLORS_DARK = COLORS_DARK;        // active set; set at the top of each rebuild
let SCALE = 1;                                   // font-size multiplier (the `scale` attr), set per rebuild
let ACCENTS: Record<string, Fill> = {};          // named text fills (HTMLText `accents`), set per rebuild
// The running-text style pulled from the prevailing text slots (fontSize/
// fontWeight/letterSpacing), set per rebuild — so ALL prose body (paragraphs
// AND list/quote/table text) obeys the ambient text style, like a `Text`.
let BODY: { size: number; weight: FontWeight; tracking: number } = { size: 16, weight: "normal", tracking: 0 };
// The rich-text STRUCTURE style, resolved per rebuild from the prevailing
// structural slots (headingColor/headingWeight/linkColor/codeColor) with the
// theme-aware house token as the fallback — so headings/links/inline-code obey
// an app-wide override but look right with zero config.
let HEADINGW: FontWeight = "bold";
let HEADINGC = 0, LINKC = 0, CODEC = 0;
// Code face + size — resolved per rebuild from the prevailing codeSize/codeFamily
// slots, with the house code style (PROSE.codeSize / PROSE.mono) as the fallback.
// One value drives every monospace region: inline code, fenced blocks, and the
// `<pre>` HTMLText path — so the reader view and fenced code share one rendition.
let CODESIZE = 0, CODEFAM = "";
// Code-block box paint, resolved per rebuild from the prevailing codeBackground/
// codeRule slots (null = the house look). CODEBG null ⇒ fenced code keeps its
// themed tint and a `<pre>` stays bare; CODERULE null ⇒ no left bar on either.
let CODEBG: number | null = null, CODERULE: number | null = null;
// Per-block-type layout geometry (the richTextLayout map), set per rebuild — an
// empty map means every block flows full-width and left-aligned, exactly as before.
type BlockGeo = { maxWidth?: number; margin?: readonly [number, number]; align?: "left" | "center" | "right" };
let LAYOUT: Readonly<Record<string, BlockGeo>> = {};

/** Resolve a block type's geometry from the map: its own entry, then `default`,
 *  field by field (a `pre` with no own entry shares `code`). Zero maxWidth = the
 *  full track; the house result for an empty map is full-width, left, no margin. */
function geoFor(t: string): { maxWidth: number; ml: number; mr: number; align: "left" | "center" | "right" } {
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
function contentWidth(width: number, g: ReturnType<typeof geoFor>): number {
  const track = Math.max(0, width - g.ml - g.mr);
  return g.maxWidth > 0 ? Math.min(track, g.maxWidth) : track;
}
function placeX(width: number, cw: number, g: ReturnType<typeof geoFor>): number {
  if (g.align === "center") return g.ml + (width - g.ml - g.mr - cw) / 2;
  if (g.align === "right") return width - g.mr - cw;
  return g.ml;
}
const geoEqual = (a: ReturnType<typeof geoFor>, b: ReturnType<typeof geoFor>): boolean =>
  a.maxWidth === b.maxWidth && a.ml === b.ml && a.mr === b.mr && a.align === b.align;

/** Resolve a `<span class="…">` name to a themed fill: the whole class, else its
 *  first matching token (`"accent big"`); no match ⇒ undefined (plain text). */
function resolveAccent(name: string): Fill | undefined {
  if (name in ACCENTS) return ACCENTS[name];
  for (const tok of name.split(/\s+/)) if (tok in ACCENTS) return ACCENTS[tok];
  return undefined;
}
const sz = (n: number) => Math.round(n * SCALE); // scale a prose size, keeping whole pixels

const FALLBACK_FAMILY = "system-ui, sans-serif";

// ── inline tier ────────────────────────────────────────────────────────────
// A run's resolved style, flattened from the inline tree for the seam.
interface Style { size: number; weight: FontWeight; italic: boolean; mono: boolean; strike: boolean; color: number; tracking: number; link?: string; fill?: Fill }
function base(size: number, weight: FontWeight, color: number, tracking = 0): Style {
  return { size: sz(size), weight, italic: false, mono: false, strike: false, color, tracking };
}

type Atom = { text: string; style: Style } | { br: true };
/** Walk the inline tree, resolving each leaf's prevailing style. */
function flatten(ns: Inline[], style: Style, out: Atom[]): void {
  for (const n of ns) {
    switch (n.t) {
      case "text": out.push({ text: n.value, style }); break;
      case "code": out.push({ text: n.value, style: { ...style, mono: true, color: CODEC } }); break;
      case "br": out.push({ br: true }); break;
      case "strong": flatten(n.inline, { ...style, weight: "bold" }, out); break;
      case "em": flatten(n.inline, { ...style, italic: true }, out); break;
      case "strike": flatten(n.inline, { ...style, strike: true }, out); break;
      case "link": flatten(n.inline, { ...style, color: LINKC, link: n.href }, out); break;
      case "fill": { const f = resolveAccent(n.name); flatten(n.inline, f !== undefined ? { ...style, fill: f } : style, out); break; }
    }
  }
}

// ── views ────────────────────────────────────────────────────────────────
function textView(width: number, size: number, color: number, weight: FontWeight, body: string): Text {
  const t = new Text();
  t.width = width; t.fontSize = size; t.textColor = color; t.fontWeight = weight; t.text = body;
  return t;
}
function rectView(width: number, height: number, fill: number, radius = 0): View {
  const v = new View();
  v.width = width; v.height = height; v.fill = fill;
  if (radius) v.cornerRadius = radius;
  return v;
}

/** Install an `onClick` handler on a view programmatically — a dynamic handler
 *  attribute (like the language's `onClick() { … }`), so the view's input sink
 *  installs at attach and the Canvas backend hit-tests it. Used for link runs. */
function setClick(v: View, fn: () => void): void {
  (v as unknown as Record<string, unknown>).onClick = fn;
}

function rectAt(x: number, y: number, w: number, h: number, fill: number): View {
  const v = rectView(w, h, fill);
  v.x = x; v.y = y;
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
 *  font, colour, and (for `code`) chip are baked in so a backend just realizes
 *  what it is told. Mirrors `flatten`, then bakes the per-run family. */
function richRunsOf(inline: Inline[], style: Style, family: string): RichRun[] {
  const atoms: Atom[] = [];
  flatten(inline, style, atoms);
  return atoms.map((a): RichRun => {
    if ("br" in a) return { br: true };
    const s = a.style;
    const run: RichRun = {
      text: a.text, size: s.size, weight: s.weight, italic: s.italic,
      family: s.mono ? CODEFAM : family, strike: s.strike, color: s.color, tracking: s.tracking,
    };
    // inline code reads as a coloured mono word, not a filled chip/button
    if (s.link !== undefined) run.href = s.link;
    if (s.fill !== undefined) run.fill = s.fill;   // a themed accent fill (gradient/solid) overrides `color`
    return run;
  });
}

/** Canvas fallback: flow the resolved runs as child views (the same greedy
 *  word-wrap as `layoutInline`, but over already-resolved runs). Returns the
 *  views to parent and the total height. */
function flowRichCanvas(blocks: RichBlock[], width: number, onLink?: (href: string) => void): { views: View[]; height: number } {
  const views: View[] = [];
  let y = 0;
  for (const b of blocks) {
    y += b.gapBefore;
    const lead = b.runs.find((r): r is Extract<RichRun, { text: string }> => "text" in r);
    const bm = fontMetrics(fontString({ fontFamily: lead?.family ?? FALLBACK_FAMILY, fontSize: lead?.size ?? sz(PROSE.body), fontWeight: lead?.weight ?? "normal" }));
    const lineH = Math.ceil(bm.ascent + bm.descent);              // glyph box (for half-leading)
    const adv = Math.round(b.fontSize * b.lineHeight);            // line box = round(fontSize × lineHeight), CSS-unitless — matches the DOM path
    const halfLead = Math.round((adv - lineH) / 2);              // centre the glyph box in the line box (half-leading)
    const spaceW = textWidth(" ", fontString({ fontFamily: lead?.family ?? FALLBACK_FAMILY, fontSize: lead?.size ?? sz(PROSE.body), fontWeight: "normal" }));

    // Preformatted (a `<pre>` code flow): keep whitespace verbatim, break on the
    // runs' own newlines, no soft-wrap — the manual twin of CSS `white-space: pre`.
    if (b.pre) {
      let px = 0, ln = 0;
      for (const r of b.runs) {
        if ("br" in r) { ln++; px = 0; continue; }
        const f = fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: r.weight, italic: r.italic });
        const segs = r.text.split("\n");
        for (let si = 0; si < segs.length; si++) {
          if (si > 0) { ln++; px = 0; }
          const seg = segs[si];
          if (seg === "") continue;
          const w = textWidth(seg, f, r.tracking);
          const t = new Text();
          t.x = px; t.y = y + ln * adv + halfLead; t.width = Math.ceil(w) + 2; t.wrap = false;
          t.fontSize = r.size; t.fontWeight = r.weight; t.italic = r.italic; t.fontFamily = r.family; t.textColor = r.color; t.text = seg;
          if (r.tracking !== 0) t.letterSpacing = r.tracking;
          if (r.fill !== undefined) t.textFill = r.fill;
          if (r.href !== undefined && onLink) { const href = r.href; setClick(t, () => onLink(href)); }
          views.push(t);
          px += w;
        }
      }
      y += (ln + 1) * adv;
      continue;
    }

    type P = { text: string; run: Extract<RichRun, { text: string }>; w: number };
    type Tok = { word: P[] } | { sp: true } | { br: true };
    const toks: Tok[] = [];
    let word: P[] = [];
    const flush = () => { if (word.length) { toks.push({ word }); word = []; } };
    for (const r of b.runs) {
      if ("br" in r) { flush(); toks.push({ br: true }); continue; }
      const f = fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: r.weight, italic: r.italic });
      for (const part of r.text.split(/(\s+)/)) {
        if (part === "") continue;
        if (/^\s+$/.test(part)) { flush(); const last = toks[toks.length - 1]; if (last && "word" in last) toks.push({ sp: true }); }
        else word.push({ text: part, run: r, w: textWidth(part, f, r.tracking) });
      }
    }
    flush();

    // Collect this block's views WITH their line, tracking each line's right
    // edge, so a centred/right-aligned block (a table cell's column) can shift
    // every view on a line by its free space — the manual twin of CSS text-align.
    const blockViews: { v: View; line: number }[] = [];
    const lineRight = new Map<number, number>();
    let x = 0, line = 0, pending = false;
    for (const tok of toks) {
      if ("br" in tok) { line++; x = 0; pending = false; continue; }
      if ("sp" in tok) { pending = true; continue; }
      const ww = tok.word.reduce((s, p) => s + p.w, 0);
      const gap = pending && x > 0 ? spaceW : 0;
      if (x + gap + ww > width && x > 0) { line++; x = 0; } else x += gap;
      pending = false;
      for (const p of tok.word) {
        const py = y + line * adv + halfLead, r = p.run;
        if (r.chipBg !== undefined) { const c = rectView(Math.ceil(p.w) + 6, lineH, r.chipBg, 3); c.x = x - 3; c.y = py; blockViews.push({ v: c, line }); }
        const t = new Text();
        t.x = x; t.y = py; t.width = Math.ceil(p.w) + 2; t.wrap = false;
        t.fontSize = r.size; t.fontWeight = r.weight; t.italic = r.italic; t.fontFamily = r.family; t.textColor = r.color; t.text = p.text;
        if (r.tracking !== 0) t.letterSpacing = r.tracking;
        if (r.fill !== undefined) t.textFill = r.fill;   // themed accent (gradient/solid) — same ramp as the DOM path
        if (r.href !== undefined && onLink) { const href = r.href; setClick(t, () => onLink(href)); }
        blockViews.push({ v: t, line });
        if (r.strike) blockViews.push({ v: rectAt(x, py + Math.round(r.size * 0.55), Math.ceil(p.w), 1, r.color), line });
        x += p.w;
        lineRight.set(line, x);
      }
    }
    if (b.align === "center" || b.align === "right") {
      for (const { v, line: ln } of blockViews) {
        const free = width - (lineRight.get(ln) ?? 0);
        if (free > 0) v.x += b.align === "center" ? free / 2 : free;
      }
    }
    for (const { v } of blockViews) views.push(v);
    y += (line + 1) * adv;
  }
  return { views, height: y };
}

/** TextFlow — the internal native-flow renderer (NOT a user component; see the
 *  RichText family below). A flowing block of styled text: `content` (resolved
 *  runs) and `flowWidth` are set by its owner before attach; it renders natively
 *  (DOM) or manually (canvas) and auto-sizes its height to the flowed content. */
class TextFlow extends View {
  content: RichBlock[] = [];
  flowWidth = 0;
  onLink: ((href: string) => void) | null = null;
  private manual: View[] = [];

  override attach(backend: RenderBackend, parentSurface: Surface | null, before: Surface | null = null): void {
    super.attach(backend, parentSurface, before);
    // Re-flow when the width or the prevailing `selectable` changes.
    const c = new Constraint("TextFlow.flow", () => `${this.flowWidth} ${this.selectable}`, () => this.render(), 0);
    c.run();
    onDiscard(this, () => c.dispose());
  }

  private clearManual(): void {
    for (const v of this.manual) { this.removeChild(v); v.discard(); }
    this.manual = [];
  }

  /** The backend re-measured the native flow (font load, or becoming visible
   *  after attaching under a zero-sized ancestor). Track it so the stack re-flows. */
  private onMeasured(h: number): void {
    if (this.surface !== null && h >= 0) this.height = h;
  }

  private render(): void {
    const s = this.surface;
    if (s === null) return;
    const link = this.onLink ?? (() => {});
    const h = s.setRichContent(this.content, this.selectable, this.flowWidth, (nh) => this.onMeasured(nh), link);
    if (h >= 0) {                       // native path: the backend flowed + measured
      this.clearManual();
      this.height = h;
      return;
    }
    // Canvas: lay the runs out as child views ourselves.
    this.clearManual();
    const { views, height } = flowRichCanvas(this.content, this.flowWidth, this.onLink ?? undefined);
    let at = 0;
    for (const v of views) { this.insertChild(v, at++); this.manual.push(v); if (this.backend !== null) v.attach(this.backend, this.surface); }
    this.height = height;
    this.childrenMutated();
  }
}

// ── block → reactive view ─────────────────────────────────────────────────────
// Each structural block becomes its OWN sub-view, stacked in a reactive `yStack`
// so a TextFlow measuring late (font load, becoming visible) re-flows the blocks
// below it and grows its container through auto-extent — no synchronous height
// guess. Every text region (paragraph, list item, table cell, quote body) is a
// native TextFlow: one contiguous, selectable run, not a word-per-view scatter.
// Style globals (C/BODY/HEADING/SCALE) are set per rebuild and read directly; the
// per-render family, body line-height, and link dispatcher ride this Ctx.
interface Ctx { family: string; lead: number; onLink: (href: string) => void }

/** The vertical stacking spine every prose container uses. Owns only its children's
 *  y (SimpleLayout leaves the cross axis and sizes alone), so a child growing after
 *  an async measure re-flows the stack through the ordinary reactive wake. */
function yStack(spacing: number): SimpleLayout {
  const s = new SimpleLayout();
  s.axis = "y"; s.spacing = spacing;
  return s;
}

/** A native flowing block of styled text — one contiguous, selectable region on the
 *  DOM backend. `content` is the resolved RichBlock(s); `width` is the flow width. */
function flowView(content: RichBlock[], width: number, ctx: Ctx): TextFlow {
  const rt = new TextFlow();
  rt.width = width; rt.flowWidth = width; rt.content = content; rt.onLink = ctx.onLink;
  return rt;
}

/** One paragraph or heading resolved to the seam's RichBlock shape. */
function proseBlock(b: Extract<Block, { t: "paragraph" }> | Extract<Block, { t: "heading" }>, gapBefore: number, bodyColor: number, ctx: Ctx): RichBlock {
  if (b.t === "heading") {
    const size = PROSE.heading[b.level - 1];
    return { tag: `h${b.level}`, runs: richRunsOf(b.inline, base(size, HEADINGW, HEADINGC), ctx.family), gapBefore, lineHeight: 1.2, fontSize: sz(size) };
  }
  return { tag: "p", runs: richRunsOf(b.inline, base(BODY.size, BODY.weight, bodyColor, BODY.tracking), ctx.family), gapBefore, lineHeight: ctx.lead, fontSize: sz(BODY.size) };
}

/** Render a block sequence to a list of stacked child views: consecutive
 *  paragraphs/headings coalesce into ONE native TextFlow (contiguous selection and
 *  baselines), and each list/table/quote/code/rule becomes its own reactive
 *  sub-view. The caller stacks the result with a `yStack`. */
function layoutBlocks(blocks: Block[], width: number, bodyColor: number, ctx: Ctx): View[] {
  const out: View[] = [];
  let group: RichBlock[] = [];
  let prevProse: "paragraph" | "heading" | null = null;      // previous prose block in this group
  let groupGeo: ReturnType<typeof geoFor> | null = null;     // the coalesced group's geometry
  // Flush the coalesced prose group: one TextFlow, built at its measure-capped
  // content width and offset by its alignment. An empty map ⇒ contentWidth = width
  // and placeX = 0, so this is byte-identical to the old `flowView(group, width)`.
  const flush = () => {
    if (group.length && groupGeo) {
      const cw = contentWidth(width, groupGeo);
      const v = flowView(group, cw, ctx);
      v.x = placeX(width, cw, groupGeo);
      out.push(v);
    }
    group = []; prevProse = null; groupGeo = null;
  };
  for (const b of blocks) {
    if (b.t === "paragraph" || b.t === "heading") {
      const g = geoFor(b.t);
      // A geometry change within a prose run (e.g. centered headings over a
      // left-aligned column) can't share one native flow — flush and start fresh.
      if (group.length && groupGeo && !geoEqual(groupGeo, g)) flush();
      // headings get generous space above and tight space below, so a section
      // groups with its own content instead of floating in an even column
      const gap = group.length === 0 ? 0
        : b.t === "heading" ? PROSE.headingGap[b.level - 1]
        : prevProse === "heading" ? PROSE.headingBelow
        : PROSE.blockGap;
      group.push(proseBlock(b, gap, bodyColor, ctx));
      prevProse = b.t;
      groupGeo = g;
      continue;
    }
    flush();
    const g = geoFor(b.t);
    const cw = contentWidth(width, g);
    let v: View | null = null;
    switch (b.t) {
      case "list": v = buildList(b, cw, bodyColor, ctx); break;
      case "table": v = buildTable(b, cw, bodyColor, ctx); break;
      case "blockquote": v = buildQuote(b, cw, ctx); break;
      case "code": v = buildCode(b, cw); break;
      case "pre": v = buildPre(b, cw, bodyColor, ctx); break;
      case "rule": v = rectView(cw, 1, C.rule); break;
    }
    if (v !== null) { v.x = placeX(width, cw, g); out.push(v); }
  }
  flush();
  return out;
}

/** A stacked container of `blocks` at `width` — the recursion point for a list
 *  item's body and a blockquote's content, so nested prose flows natively too. */
function buildBlocks(blocks: Block[], width: number, bodyColor: number, ctx: Ctx): View {
  const c = new View();
  c.width = width;
  for (const v of layoutBlocks(blocks, width, bodyColor, ctx)) c.appendChild(v);
  c.layout = yStack(PROSE.blockGap);
  return c;
}

/** A preformatted, monospace flow that KEEPS its accent-coloured runs — the
 *  syntax-highlighted code block (`<pre>` from HTMLText). Whitespace is preserved
 *  and the runs' own `\n`s are the line breaks; on DOM it's one contiguous,
 *  selectable `<pre>` with per-token colour. The mono family rides in as the
 *  `family` arg (a non-`mono` base style, so no inline-code chip behind each run);
 *  `<span class>` accents still compose their fill on top. */
// The code text's left indent inside a box: the base pad, plus room for the
// `codeRule` bar when one is drawn.
const codePadLeft = (bar: boolean): number => PROSE.codePad + (bar ? PROSE.codeRuleWidth + PROSE.codeRuleGap : 0);

function buildPre(b: Extract<Block, { t: "pre" }>, width: number, bodyColor: number, ctx: Ctx): View {
  const bar = CODERULE !== null;
  const boxed = CODEBG !== null || bar;             // a `<pre>` stays BARE until code chrome is set
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
  if (!boxed) return flow;                          // today's behaviour when no chrome is set
  // Chrome opted in: wrap the flow in the same tinted box (+ optional bar) a fenced
  // block gets, so a highlighted `<pre>` and a fenced ``` render coherently. The box
  // itself does NOT scroll — an inner scroller carries the flow, so long lines scroll
  // horizontally while the box, its tint, and the left bar stay put (the scroller-
  // sibling pattern). `clip` rounds the box AND trims the full-height bar to the
  // corner. The box height tracks the flow's async measure (the `buildQuote` bar).
  const box = rectView(width, 1, CODEBG ?? C.codeBg, PROSE.codeRadius);
  box.clip = true;
  const rule = bar ? rectView(PROSE.codeRuleWidth, 1, CODERULE!) : null;
  if (rule !== null) { rule.x = 0; rule.y = 0; box.appendChild(rule); }
  const scroller = new View();
  scroller.x = padL; scroller.y = PROSE.codePad; scroller.width = flowW; scroller.scrollsX = true;
  flow.x = 0; flow.y = 0;
  scroller.appendChild(flow);
  box.appendChild(scroller);
  const c = new Constraint("RichText.codeBox", () => `${flow.height}`, () => {
    const h = Math.max(1, flow.height + 2 * PROSE.codePad);
    box.height = h;
    scroller.height = flow.height;
    if (rule !== null) rule.height = h;
  }, 0);
  c.run();
  onDiscard(box, () => c.dispose());
  return box;
}

/** A fenced code block — a single preformatted, monospace Text in a rounded box
 *  that scrolls horizontally (not soft-wrapped). Already one run; no TextFlow. The
 *  box tint is `codeBackground` (else the themed house tint), plus a `codeRule`
 *  left bar when set — the same chrome a highlighted `<pre>` gets, for coherence. */
function buildCode(b: Extract<Block, { t: "code" }>, width: number): View {
  const fm = fontMetrics(fontString({ fontFamily: CODEFAM, fontSize: sz(CODESIZE), fontWeight: "normal" }));
  const bar = CODERULE !== null;
  const padL = codePadLeft(bar);
  const lines = b.text === "" ? 1 : b.text.split("\n").length;
  const h = Math.ceil(lines * (fm.ascent + fm.descent)) + 2 * PROSE.codePad;
  const box = rectView(width, h, CODEBG ?? C.codeBg, PROSE.codeRadius);
  box.clip = true;   // round the box + trim the full-height bar to the corner radius
  if (bar) { const rule = rectView(PROSE.codeRuleWidth, h, CODERULE!); rule.x = 0; rule.y = 0; box.appendChild(rule); }
  // an inner scroller holds the text — long lines scroll while the bar stays fixed
  const scroller = new View();
  scroller.x = padL; scroller.y = PROSE.codePad; scroller.width = width - padL - PROSE.codePad; scroller.height = h - 2 * PROSE.codePad; scroller.scrollsX = true;
  const t = textView(width - padL - PROSE.codePad, sz(CODESIZE), C.codeFg, "normal", b.text);
  t.x = 0; t.y = 0; t.wrap = false; t.fontFamily = CODEFAM;
  scroller.appendChild(t);
  box.appendChild(scroller);
  return box;
}

/** A list — one reactive row per item: the marker in the gutter, the item's body
 *  (its own TextFlow(s), hanging-indented) beside it. The row auto-sizes to the
 *  body; the list stacks the rows. */
function buildList(b: Extract<Block, { t: "list" }>, width: number, bodyColor: number, ctx: Ctx): View {
  const list = new View();
  list.width = width;
  const bodyW = width - PROSE.indent;
  for (let i = 0; i < b.items.length; i++) {
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
    mk.x = 0; mk.y = 0;
    const body = buildBlocks(it.blocks, bodyW, bodyColor, ctx);
    body.x = PROSE.indent; body.y = 0;
    row.appendChild(mk);
    row.appendChild(body);
    list.appendChild(row);
  }
  list.layout = yStack(PROSE.itemGap);
  return list;
}

/** A GFM table — even columns with per-column alignment, each cell its own
 *  TextFlow, each row auto-sizing to its tallest cell, a rule under the header. */
function buildTable(b: Extract<Block, { t: "table" }>, width: number, bodyColor: number, ctx: Ctx): View {
  const cols = b.header.length;
  const colW = (width - (cols - 1) * PROSE.cellGap) / cols;
  const colX = (c: number) => c * (colW + PROSE.cellGap);
  const table = new View();
  table.width = width;
  const makeRow = (cells: Inline[][], weight: FontWeight, color: number): View => {
    const row = new View();
    row.width = width;
    for (let c = 0; c < cols; c++) {
      const al = b.align[c];
      const cell = flowView([{
        tag: "p", runs: richRunsOf(cells[c] ?? [], base(BODY.size, weight, color, BODY.tracking), ctx.family),
        gapBefore: 0, lineHeight: ctx.lead, fontSize: sz(BODY.size), align: al === "center" || al === "right" ? al : undefined,
      }], colW, ctx);
      cell.x = colX(c); cell.y = 0;
      row.appendChild(cell);
    }
    return row;
  };
  table.appendChild(makeRow(b.header, HEADINGW, HEADINGC));
  table.appendChild(rectView(width, 1, C.rule));
  for (const r of b.rows) table.appendChild(makeRow(r, "normal", bodyColor));
  table.layout = yStack(PROSE.itemGap);
  return table;
}

/** A blockquote — its content (recursed, in the quote colour) indented past a left
 *  rule that spans the content height reactively (a late re-flow lengthens it). */
function buildQuote(b: Extract<Block, { t: "blockquote" }>, width: number, ctx: Ctx): View {
  const outer = new View();
  outer.width = width;
  const body = buildBlocks(b.blocks, width - PROSE.quoteIndent, C.quoteColor, ctx);
  body.x = PROSE.quoteIndent; body.y = 0;
  const rule = rectView(3, 1, C.quoteRule);
  rule.x = 0; rule.y = 0;
  outer.appendChild(rule);
  outer.appendChild(body);
  const c = new Constraint("RichText.quoteRule", () => `${body.height}`, () => { rule.height = Math.max(1, body.height); }, 0);
  c.run();
  onDiscard(outer, () => c.dispose());
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
export abstract class RichText extends View {
  declare lineHeight: number;
  declare bodyColor: number | null;
  declare scale: number;
  /** Colour-scheme override (null = follow the App's OS `dark`). */
  declare dark: boolean | null;
  private built: View[] = [];

  /** Parse the current source into the block tree. */
  protected abstract parseSource(): Block[];
  /** The source string(s) folded into the reactive render key, so an edit
   *  (or a policy change) re-parses and re-flows. */
  protected abstract sourceKey(): string;
  /** Named text fills a source can reference (HTMLText's `accents`); none by
   *  default — Markdown has no syntax to name one. */
  protected accentsOf(): Record<string, Fill> { return {}; }

  /** RichText's `scale` is a FONT-SIZE multiplier consumed by rebuild(), not the
   *  paint transform it means on a plain View — so mask the base flush()'s scale
   *  push. Without this, a `scale` constraint that evaluates before the surface
   *  attaches bakes a CSS transform ON TOP of the scaled fonts (double-scaling),
   *  and the view's measured height no longer matches its painted height. */
  protected override flush(s: Surface): void {
    super.flush(s);
    if (this.scale !== 1) s.setScale(1, this.pivotX, this.pivotY);
  }

  override attach(backend: RenderBackend, parentSurface: Surface | null, before: Surface | null = null): void {
    super.attach(backend, parentSurface, before);
    // Reactive render: re-parse and rebuild whenever the source OR `width` changes
    // (a resize re-flows, not only an edit); `dark`/`scale` in the key so a theme
    // flip or font-size change re-renders.
    const c = new Constraint(`${this.constructor.name}.render`, () => `${this.width} ${this.sourceKey()} ${this.lineHeight} ${this.bodyColor} ${this.isDark()} ${this.scale} ${this.codeBackground} ${this.codeRule}`, () => this.rebuild(), 0);
    c.run();
    onDiscard(this, () => c.dispose());
  }

  /** The colour scheme for the house rich-element palette: the explicit `dark`
   *  override if set (an app whose own theme selector differs from the OS), else
   *  the root App's OS `dark`, read by walking to the tree root. */
  private isDark(): boolean {
    if (this.dark != null) return this.dark;
    let r: unknown = this;
    while (r instanceof View && r.parent !== null) r = r.parent;
    return !!(r as { dark?: boolean }).dark;
  }

  /** A link run was activated. Mechanism only: fire `onLink(href)` for the app to
   *  dispatch (scroll to an anchor, set a route, open externally). Unhandled, it
   *  falls back to the App's `navigate` channel — so external links work with no
   *  wiring, and an app that owns routing overrides by declaring `onLink`. */
  private dispatchLink(href: string): void {
    if (typeof (this as unknown as Record<string, unknown>).onLink === "function") { fireEvent(this, "link", href); return; }
    let r: unknown = this;
    while (r instanceof View && r.parent !== null) r = r.parent;
    // The root App's navigate SERVICE ACTION (capabilities.md §6) — the same call
    // a link/button makes in a handler; the host opens it. (A non-App root has no
    // navigate; the link is then inert, as before.)
    (r as unknown as { navigate?: (to: string) => void }).navigate?.(href);
  }

  private rebuild(): void {
    C = this.isDark() ? COLORS_DARK : COLORS_LIGHT;   // pick the palette for this render
    SCALE = this.scale || 1;                          // font-size multiplier for this render
    ACCENTS = this.accentsOf();                       // named text fills for this render
    for (const v of this.built) { this.removeChild(v); v.discard(); }
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
    CODESIZE = this.codeSize || PROSE.codeSize;
    CODEFAM = this.codeFamily || PROSE.mono;
    CODEBG = this.codeBackground;
    CODERULE = this.codeRule;
    LAYOUT = this.richTextLayout ?? {};
    const ctx: Ctx = { family, lead, onLink: (href) => this.dispatchLink(href) };

    // Render the block tree to a flat list of stacked sub-views: paragraphs and
    // headings coalesce into native TextFlows, and list/table/quote/code/rule each
    // become their own reactive sub-view (their text regions are TextFlows too).
    const children = layoutBlocks(this.parseSource(), width, bodyColor, ctx);
    let at = 0;
    for (const v of children) {
      this.insertChild(v, at++);
      this.built.push(v);
      if (this.backend !== null) v.attach(this.backend, this.surface);
    }
    // Stack the block-views, PROSE.blockGap apart; their heights (a TextFlow's
    // measured at attach, a container's derived by auto-extent) drive the stack,
    // and auto-extent gives this box its height — so leave `height` unset.
    this.layout = yStack(PROSE.blockGap);
    this.childrenMutated();
  }
}

/** Rich content authored in Markdown (`text`). */
export class Markdown extends RichText {
  declare text: string;
  protected sourceKey(): string { return this.text; }
  protected parseSource(): Block[] { return parse(this.text); }
}

/** Rich content authored in a WHITELISTED HTML subset (`html`), validated at
 *  render time. `unsupported` decides what a tag outside the set does — `strip`
 *  (unwrap, keep text) or `error` (throw) — so LOADED content has defined
 *  behaviour, never silent corruption. Same flow engine as Markdown. */
export class HTMLText extends RichText {
  declare html: string;
  declare unsupported: Unsupported;
  declare accents: Record<string, Fill>;
  // `accents` folded into the key (as a signature) so a re-themed fill re-renders.
  protected sourceKey(): string { return this.html + " " + this.unsupported + " " + JSON.stringify(this.accents ?? {}); }
  protected parseSource(): Block[] { return parseHtml(this.html, this.unsupported); }
  protected override accentsOf(): Record<string, Fill> { return this.accents ?? {}; }
}

// Shared attributes live on the RichText base; Markdown/HTMLText inherit them
// and add only their own source attribute(s).
defineAttributes(RichText, { lineHeight: { def: 1 }, bodyColor: { def: null }, scale: { def: 1 }, dark: { def: null } });
defineAttributes(Markdown, { text: { def: "" } });
defineAttributes(HTMLText, { html: { def: "" }, unsupported: { def: "strip" }, accents: { def: {} } });
