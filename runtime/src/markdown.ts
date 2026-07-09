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

import { View, onDiscard } from "./view.js";
import { Text } from "./text.js";
import type { RenderBackend, Surface } from "./backend.js";
import { Constraint } from "./reactive.js";
import { defineAttributes } from "./attributes.js";
import { fontMetrics, fontString, textWidth, type FontWeight } from "./measure.js";
import { parse, type Block, type Inline, type Align } from "./md.js";

// ── prose stylesheet ─────────────────────────────────────────────────────────
// The role → style map that makes rendered Markdown look good with zero author
// effort, on the theme tokens. A design artifact, deliberately data (not code).
const PROSE = {
  heading: [30, 24, 20, 18, 16, 15], // px by level 1..6
  headingColor: 0xffffff,
  body: 16,
  bodyColor: 0xc7d0d6,
  code: 0xd6e2ea, // inline code text
  codeChip: 0x172b39, // inline code background chip
  codeSize: 14,
  codeFg: 0xb8c4cc,
  codeBg: 0x0e1922,
  codeRadius: 8,
  codePad: 14,
  mono: "ui-monospace, SFMono-Regular, monospace",
  rule: 0x24394a,
  link: 0x6aa4ff,
  quoteRule: 0x2f4a5c,
  quoteColor: 0x9fb0ba,
  blockGap: 16,
  itemGap: 6,
  indent: 26,
  quoteIndent: 20,
  cellGap: 18,
};

const FALLBACK_FAMILY = "system-ui, sans-serif";

// ── inline tier ────────────────────────────────────────────────────────────
// A run's resolved style, and the flow layout that wraps a mix of them.
interface Style { size: number; weight: FontWeight; italic: boolean; mono: boolean; strike: boolean; color: number; link?: string }
function base(size: number, weight: FontWeight, color: number): Style {
  return { size, weight, italic: false, mono: false, strike: false, color };
}
function fontOf(s: Style, family: string): string {
  return fontString({ fontFamily: s.mono ? PROSE.mono : family, fontSize: s.size, fontWeight: s.weight, italic: s.italic });
}

type Atom = { text: string; style: Style } | { br: true };
/** Walk the inline tree, resolving each leaf's prevailing style. */
function flatten(ns: Inline[], style: Style, out: Atom[]): void {
  for (const n of ns) {
    switch (n.t) {
      case "text": out.push({ text: n.value, style }); break;
      case "code": out.push({ text: n.value, style: { ...style, mono: true, color: PROSE.code } }); break;
      case "br": out.push({ br: true }); break;
      case "strong": flatten(n.inline, { ...style, weight: "bold" }, out); break;
      case "em": flatten(n.inline, { ...style, italic: true }, out); break;
      case "strike": flatten(n.inline, { ...style, strike: true }, out); break;
      case "link": flatten(n.inline, { ...style, color: PROSE.link, link: n.href }, out); break;
    }
  }
}

interface Piece { text: string; style: Style; w: number }
interface Placed { text: string; style: Style; x: number; y: number; w: number }
interface Flow { placed: Placed[]; height: number; lineH: number }

/** Wrap a mix of styled runs within `width`. A "word" is a maximal run of
 *  non-space text and may span several styles (e.g. `un**bold**`) — it never
 *  breaks internally. Words flow across lines greedily; `align` shifts each
 *  finished line. Returns the placed pieces (one per style-run-per-line). */
function layoutInline(runs: Inline[], style: Style, family: string, width: number, align: Align = "left"): Flow {
  const atoms: Atom[] = [];
  flatten(runs, style, atoms);

  const baseFont = fontOf(style, family);
  const bm = fontMetrics(baseFont);
  const lineH = Math.ceil(bm.ascent + bm.descent);
  const spaceW = textWidth(" ", baseFont);

  // Tokenize into words (piece lists) with explicit inter-word spaces.
  type Tok = { word: Piece[] } | { sp: true } | { br: true };
  const tokens: Tok[] = [];
  let word: Piece[] = [];
  const flushWord = () => { if (word.length) { tokens.push({ word }); word = []; } };
  for (const a of atoms) {
    if ("br" in a) { flushWord(); tokens.push({ br: true }); continue; }
    for (const part of a.text.split(/(\s+)/)) {
      if (part === "") continue;
      if (/^\s+$/.test(part)) {
        flushWord();
        const last = tokens[tokens.length - 1];
        if (last && "word" in last) tokens.push({ sp: true }); // one space between words, none leading
      } else {
        word.push({ text: part, style: a.style, w: textWidth(part, fontOf(a.style, family)) });
      }
    }
  }
  flushWord();

  const placed: Placed[] = [];
  let x = 0, line = 0, pendingSpace = false;
  for (const tok of tokens) {
    if ("br" in tok) { line++; x = 0; pendingSpace = false; continue; }
    if ("sp" in tok) { pendingSpace = true; continue; }
    const ww = tok.word.reduce((s, p) => s + p.w, 0);
    const gap = pendingSpace && x > 0 ? spaceW : 0;
    if (x + gap + ww > width && x > 0) { line++; x = 0; } // wrap (the space is dropped at the break)
    else x += gap;
    pendingSpace = false;
    for (const p of tok.word) { placed.push({ text: p.text, style: p.style, x, y: line * lineH, w: p.w }); x += p.w; }
  }

  if (align !== "left" && placed.length) {
    const right = new Map<number, number>();
    for (const p of placed) right.set(p.y, Math.max(right.get(p.y) ?? 0, p.x + p.w));
    for (const p of placed) {
      const free = width - (right.get(p.y) ?? 0);
      if (free > 0) p.x += align === "center" ? free / 2 : free;
    }
  }
  return { placed, height: (line + 1) * lineH, lineH };
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

// ── the y-cursor builder ───────────────────────────────────────────────────
class Column {
  readonly out: View[] = [];
  y = 0;
  constructor(readonly family: string, readonly width: number) {}

  place(v: View, x: number, h: number): void { v.x = x; v.y = Math.round(this.y); this.out.push(v); this.y += h; }
  span(v: View, x: number, y: number, h: number): void { v.x = x; v.y = Math.round(y); v.height = Math.max(1, Math.round(h)); this.out.push(v); }
  gap(n: number): void { this.y += n; }

  /** Place a laid-out flow at (x0, y0); the y-cursor is untouched. */
  put(flow: Flow, x0: number, y0: number): void {
    for (const p of flow.placed) {
      const px = Math.round(x0 + p.x), py = Math.round(y0 + p.y);
      if (p.style.mono) this.out.push(chip(px, py, p.w, flow.lineH));
      const t = new Text();
      t.x = px; t.y = py; t.width = Math.ceil(p.w) + 2; t.wrap = false;
      t.fontSize = p.style.size; t.fontWeight = p.style.weight; t.italic = p.style.italic;
      t.fontFamily = p.style.mono ? PROSE.mono : this.family;
      t.textColor = p.style.color; t.text = p.text;
      this.out.push(t);
      if (p.style.strike) this.out.push(rectAt(px, py + Math.round(p.style.size * 0.55), Math.ceil(p.w), 1, p.style.color));
    }
  }
  /** Lay out `runs` at the cursor and advance past them. */
  flow(runs: Inline[], x0: number, width: number, style: Style, align: Align = "left"): void {
    const f = layoutInline(runs, style, this.family, width, align);
    this.put(f, x0, this.y);
    this.y += f.height;
  }
}
function chip(x: number, y: number, w: number, h: number): View {
  const v = rectView(Math.ceil(w) + 6, h, PROSE.codeChip, 3);
  v.x = x - 3; v.y = y;
  return v;
}
function rectAt(x: number, y: number, w: number, h: number, fill: number): View {
  const v = rectView(w, h, fill);
  v.x = x; v.y = y;
  return v;
}

// ── block → view ────────────────────────────────────────────────────────────
function renderBlocks(blocks: Block[], col: Column, x0: number, width: number, textColor = PROSE.bodyColor): void {
  for (let bi = 0; bi < blocks.length; bi++) {
    if (bi > 0) col.gap(PROSE.blockGap);
    const b = blocks[bi];
    switch (b.t) {
      case "heading":
        col.flow(b.inline, x0, width, base(PROSE.heading[b.level - 1], "bold", PROSE.headingColor));
        break;
      case "paragraph":
        col.flow(b.inline, x0, width, base(PROSE.body, "normal", textColor));
        break;
      case "rule":
        col.place(rectView(width, 1, PROSE.rule), x0, 1);
        break;
      case "code": {
        const fm = fontMetrics(fontString({ fontFamily: PROSE.mono, fontSize: PROSE.codeSize, fontWeight: "normal" }));
        const lines = b.text === "" ? 1 : b.text.split("\n").length;
        const h = Math.ceil(lines * (fm.ascent + fm.descent)) + 2 * PROSE.codePad;
        const box = rectView(width, h, PROSE.codeBg, PROSE.codeRadius);
        const t = textView(width - 2 * PROSE.codePad, PROSE.codeSize, PROSE.codeFg, "normal", b.text);
        t.x = PROSE.codePad; t.y = PROSE.codePad; t.wrap = false; t.fontFamily = PROSE.mono;
        box.appendChild(t);
        col.place(box, x0, h);
        break;
      }
      case "blockquote": {
        const top = col.y;
        renderBlocks(b.blocks, col, x0 + PROSE.quoteIndent, width - PROSE.quoteIndent, PROSE.quoteColor);
        col.span(rectView(3, 1, PROSE.quoteRule), x0, top, col.y - top);
        break;
      }
      case "list": {
        for (let i = 0; i < b.items.length; i++) {
          if (i > 0) col.gap(PROSE.itemGap);
          const it = b.items[i];
          const marker = b.ordered ? `${b.start + i}.` : it.task === null ? "•" : it.task ? "☑" : "☐";
          const [head, ...rest] = it.blocks;
          const lead: Inline[] = head && (head.t === "paragraph" || head.t === "heading") ? head.inline : [];
          col.flow([{ t: "text", value: `${marker}  ` }, ...lead], x0, width, base(PROSE.body, "normal", textColor));
          const tail = head && (head.t === "paragraph" || head.t === "heading") ? rest : it.blocks;
          if (tail.length) { col.gap(PROSE.itemGap); renderBlocks(tail, col, x0 + PROSE.indent, width - PROSE.indent, textColor); }
        }
        break;
      }
      case "table":
        renderTable(b, col, x0, width);
        break;
    }
  }
}

/** GFM table — real cells: even columns, per-column alignment, wrapping runs,
 *  row height = tallest cell. */
function renderTable(b: Extract<Block, { t: "table" }>, col: Column, x0: number, width: number): void {
  const cols = b.header.length;
  const colW = (width - (cols - 1) * PROSE.cellGap) / cols;
  const colX = (c: number) => x0 + c * (colW + PROSE.cellGap);
  const row = (cells: Inline[][], weight: FontWeight, color: number) => {
    const top = col.y;
    let h = 0;
    for (let c = 0; c < cols; c++) {
      const cell = cells[c] ?? [];
      const f = layoutInline(cell, base(PROSE.body, weight, color), col.family, colW, b.align[c] ?? "left");
      col.put(f, colX(c), top);
      h = Math.max(h, f.height);
    }
    col.y = top + h;
  };
  row(b.header, "bold", PROSE.headingColor);
  col.gap(PROSE.itemGap);
  col.place(rectView(width, 1, PROSE.rule), x0, 1);
  for (const r of b.rows) { col.gap(PROSE.itemGap); row(r, "normal", PROSE.bodyColor); }
}

// ── the component ──────────────────────────────────────────────────────────────
export class Markdown extends View {
  declare text: string;
  private built: View[] = [];

  override attach(backend: RenderBackend, parentSurface: Surface | null, before: Surface | null = null): void {
    super.attach(backend, parentSurface, before);
    // Reactive render: re-parse and rebuild whenever `text` OR `width` changes
    // (the key is composite so a resize re-flows, not only a text edit).
    const c = new Constraint("Markdown.render", () => `${this.width} ${this.text}`, () => this.rebuild(), 0);
    c.run();
    onDiscard(this, () => c.dispose());
  }

  private rebuild(): void {
    for (const v of this.built) { this.removeChild(v); v.discard(); }
    this.built = [];
    const width = this.width || 640;
    const family = this.fontFamily || FALLBACK_FAMILY;
    const col = new Column(family, width);
    renderBlocks(parse(this.text), col, 0, width);
    let at = 0;
    for (const v of col.out) {
      this.insertChild(v, at++);
      this.built.push(v);
      if (this.backend !== null) v.attach(this.backend, this.surface);
    }
    this.height = Math.ceil(col.y); // the box extends to the rendered content
    this.childrenMutated();
  }
}

defineAttributes(Markdown, {
  text: { def: "" },
});
