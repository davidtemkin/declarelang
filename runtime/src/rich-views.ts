// The rich text's VIEW PATH — a document built from views, for a renderer whose
// text engine lays out no whole document (canvas, the Mac): prose runs become
// TextFlows (flowed by the renderer where it can, else laid out here, one Text
// per styled piece — `flowRichCanvas`), and lists, tables, quotes, code boxes and
// rules become views around them. It is also the path that spends a line budget
// (`maxLines`), block by block, as the document is built. Its own module so a DOM
// build that never names `maxLines` carries none of it (declarec's
// slim-rich-views): the DOM lays the whole document out natively (rich-doc.ts).

import { View, onDiscard } from "./view.js";
import { Text } from "./text.js";
import type { Image } from "./image.js";
import type { RichBlock, RichRun, SlotBox } from "./backend.js";
import { Constraint } from "./reactive.js";
import { isGradient, type Gradient } from "./value.js";
import { breakBetween, breakUnits, ellipsize, fontMetrics, fontString, textWidth, transformText, type FontWeight } from "./measure.js";
import type { Block, Inline } from "./md.js";
import { sliceGradient } from "./boxpaint.js";
import {
  BODY, C, CODEBG, CODEFAM, CODERULE, CODESIZE, FALLBACK_FAMILY, PROSE, HEADINGC, HEADINGW, REWIDTH, TextFlow,
  base, codeBlock, codeChrome, contentWidth, flowView, geoEqual, geoFor, listMarker, placeX, proseBlock,
  relayoutEntries, richRunsOf, setRewidth, sz, tableCells, yStack, type Ctx, type Laid,
} from "./rich-text.js";

// THE LINE BUDGET for one build (`RichText.maxLines`). Lines are counted across
// the WHOLE document, in order, and spent while it is BUILT (layoutBlocks and
// the structural builders) — never while a flow renders, because a flow renders
// again later (a width change, an image or a face landing) when this global no
// longer describes anything. Infinity = no clamp.
let BUDGET = Infinity;
let TRUNCATED = false;
/** Open a build's budget: `maxLines` lines (0 = no clamp), nothing dropped yet. */
export function startBudget(maxLines: number): void { BUDGET = maxLines > 0 ? maxLines : Infinity; TRUNCATED = false; }
/** Whether the build that just ran dropped anything (`RichText.truncated`). */
export function budgetTruncated(): boolean { return TRUNCATED; }

// ── views ────────────────────────────────────────────────────────────────
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

/** Carry a run's paint/decoration treatments onto its canvas Text view — the
 *  canvas twin of dom-backend's setRichContent run block, so a span wears the
 *  same look on either substrate. Strike stays a manual rule in the flow below
 *  (baseline-tuned and DOM-parity-gated); underline, absent on canvas until now,
 *  and the paint treatments (shadow/outline/transform/smallCaps) the Text painter
 *  draws. smallCaps also rides the run's fontString at measure time, so its
 *  synthesized-caps width is the one the flow lays out. */
function applyRunTreatments(t: Text, r: Extract<RichRun, { text: string }>): void {
  if (r.shadow != null) t.textShadow = r.shadow;
  if (r.outline != null) t.outline = r.outline;
  if (r.transform !== undefined) t.textTransform = r.transform;
  if (r.smallCaps) t.smallCaps = true;
  if (r.underline) t.underline = true;
}

/** What the canvas flow needs to size and place one inline image: the persistent
 *  (cached, reactive) Image view plus its natural size and load/fail state. */
export type ImageInfo = { view: Image; nw: number; nh: number; loaded: boolean; failed: boolean };
export type ImageFor = (src: string) => ImageInfo;

/** Canvas fallback: flow the resolved runs as child views (the same greedy
 *  word-wrap as `layoutInline`, but over already-resolved runs). Returns the
 *  views to parent and the total height. Inline images are placed as atomic
 *  replaced boxes via `imageFor` (a persistent Image view per src); an image
 *  whose load has FAILED degrades to its `alt` text. */
export function flowRichCanvas(blocks: RichBlock[], width: number, onLink?: (href: string) => void, imageFor?: ImageFor,
                        opts?: { measure?: boolean; keep?: number }): { views: View[]; height: number; anchors: Map<string, number>; firstBaseline: number | null; lines: number; slots: Record<string, SlotBox>; widest: number } {
  const views: View[] = [];
  // The right edge of the widest line laid out — what a rich text with no width
  // of its own is as wide as (RichText.fitNatural).
  let widest = 0;
  // The INLINE-VIEW GEOMETRY FACT this pass produces: slot → box, in flow
  // coordinates. Identical in shape to what the DOM path reads back off its
  // placeholders, which is what lets one Layout place views on either substrate.
  const slots: Record<string, SlotBox> = {};
  // How many lines this flow may show — the share of `RichText.maxLines` its
  // document allotted it when it was built (TextFlow.clampLines). Absent = all.
  let remaining = opts?.keep ?? Infinity;
  let lines = 0;
  const anchors = new Map<string, number>();
  // The first block's first line's baseline, in flow coordinates — what a
  // baseline-aligning layout sits this flow on. Decided by the same strut and
  // growth the paint uses, so the DOM path (which measures with this function
  // on the first block alone) and the canvas path agree by construction.
  let firstBaseline: number | null = null;
  let y = 0;
  for (const b of blocks) {
    y += b.gapBefore;
    // A heading's anchor records its top (after the gap above it) so a `@name`
    // reveal can clamp the scroll ancestor to it — the Canvas twin of the DOM
    // heading element's native scrollIntoView. First slug wins (preorder).
    if (b.anchor !== undefined && !anchors.has(b.anchor)) anchors.set(b.anchor, y);
    // The block's LEAD run sets its strut and the space it coalesces with: the
    // LONGEST text run, not the first. A paragraph that opens with inline code
    // ("`src` is a URL…") used to take both from the monospace code face, so every
    // body word was placed on its own at a monospace space's width — visibly
    // spaced-out lines on canvas. Ordinary prose has one dominant run, which is the
    // first run anyway, so its geometry is unchanged.
    const textRuns = b.runs.filter((r): r is Extract<RichRun, { text: string }> => "text" in r);
    const lead = textRuns.length === 0 ? undefined : textRuns.reduce((best, r) => (r.text.length > best.text.length ? r : best));
    // The STRUT is the block's own font, as CSS's root inline box is — not the
    // lead run's. A line of figures with a longer caption in a small face
    // ("55 km") otherwise hung a small face's box in a big line and
    // pushed the descent past where the browser puts it. A block that names no
    // font of its own falls back to the lead run.
    const bm = b.family !== undefined
      ? fontMetrics(fontString({ fontFamily: b.family, fontSize: b.fontSize, fontWeight: b.weight ?? "normal" }))
      : fontMetrics(fontString({ fontFamily: lead?.family ?? FALLBACK_FAMILY, fontSize: lead?.size ?? sz(PROSE.body), fontWeight: lead?.weight ?? "normal" }));
    const lineH = Math.ceil(bm.ascent + bm.descent);              // glyph box (for half-leading)
    const adv = Math.round(b.fontSize * b.lineHeight);            // line box = round(fontSize × lineHeight), CSS-unitless — matches the DOM path
    // Centre the glyph box in the line box (half-leading), the browser's way:
    // the space above takes the FLOOR of the half, the space below the rest
    // (LayoutNG's AddLeading), so an odd leading puts its extra pixel below.
    const halfLead = Math.floor((adv - lineH) / 2);
    const spaceFont = fontString({ fontFamily: lead?.family ?? FALLBACK_FAMILY, fontSize: lead?.size ?? sz(PROSE.body), fontWeight: "normal" });
    const spaceW = textWidth(" ", spaceFont);
    // A space is as wide as a space in the face it was typed in — the run it came
    // from. The lead face keeps the one measured above (bit-identical for plain prose).
    const spaceMemo = new Map<string, number>();
    const spaceOf = (r: Extract<RichRun, { text: string }> | undefined): number => {
      if (r === undefined) return spaceW;
      const sf = fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: "normal" });
      // a tracked space is wider by the tracking, as a CSS space is
      if (sf === spaceFont && !r.tracking) return spaceW;
      const key = r.tracking ? `${sf}|${r.tracking}` : sf;
      let w = spaceMemo.get(key);
      if (w === undefined) { w = textWidth(" ", sf, r.tracking); spaceMemo.set(key, w); }
      return w;
    };
    let pendingRun: Extract<RichRun, { text: string }> | undefined;

    // Preformatted (a `<pre>` code flow): keep whitespace verbatim, break on the
    // runs' own newlines, no soft-wrap — the manual twin of CSS `white-space: pre`.
    if (b.pre) {
      let px = 0, ln = 0;
      for (const r of b.runs) {
        if ("br" in r) { ln++; px = 0; continue; }
        if ("img" in r) continue;   // an image never occurs in a `pre` (code) block
        // An inline view inside a `pre` takes its seat at the cursor: a pre does
        // not wrap, so there is nothing to wrap it against — but every slot still
        // gets a box, so the view is never left stranded at the origin.
        if ("view" in r) {
          if (ln < remaining) slots[r.view.slot] = { x: px, y: y + ln * adv + halfLead, width: r.view.width, height: r.view.height };
          px += r.view.width;
          continue;
        }
        const f = fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: r.weight, italic: r.italic, smallCaps: r.smallCaps });
        const segs = r.text.split("\n");
        for (let si = 0; si < segs.length; si++) {
          if (si > 0) { ln++; px = 0; }
          const seg = segs[si];
          if (seg === "" || ln >= remaining) continue;
          const w = textWidth(r.transform ? transformText(seg, r.transform) : seg, f, r.tracking);
          const t = new Text();
          t.x = px; t.y = y + ln * adv + halfLead; t.width = Math.ceil(w) + 2; t.wrap = false;
          t.fontSize = r.size; t.fontWeight = r.weight; t.italic = r.italic; t.fontFamily = r.family; t.textColor = r.color; t.text = seg;
          if (r.tracking !== 0) t.letterSpacing = r.tracking;
          if (r.fill !== undefined) t.textFill = r.fill;
          applyRunTreatments(t, r);
          if (r.href !== undefined && onLink) { const href = r.href; setClick(t, () => onLink(href)); }
          views.push(t);
          px += w;
        }
      }
      firstBaseline ??= y + halfLead + bm.ascent;   // a pre's line 0: the strut, nothing grows it
      lines += ln + 1;
      y += Math.min(ln + 1, Math.max(0, remaining)) * adv;
      remaining -= ln + 1;
      continue;
    }

    type P = { text: string; run: Extract<RichRun, { text: string }>; w: number };
    type Tok = { word: P[] } | { sp: true; run?: Extract<RichRun, { text: string }> } | { br: true } | { img: Image; w: number; h: number; href?: string }
      | { slot: string; w: number; h: number; bl?: number };
    const toks: Tok[] = [];
    let word: P[] = [];
    const flush = () => { if (word.length) { toks.push({ word }); word = []; } };
    for (const r of b.runs) {
      if ("br" in r) { flush(); toks.push({ br: true }); continue; }
      // Inline image on the manual flow (Canvas/mac): a real replaced box — a
      // persistent, cached Image view (from `imageFor`) sized to its natural
      // aspect capped to the flow width, placed atomically in the line, bottom on
      // the baseline. Before the bitmap loads it occupies nothing (it pops in on
      // load, when the flow reflows); a FAILED load degrades to the `alt` text (a
      // broken image's own fallback), in the block's lead style.
      // An inline VIEW on the manual flow: an atomic replaced box of the view's
      // current size, wrapped like a word and sat on the baseline — the same
      // treatment an image gets, except that the box is filled by a real view
      // the flow does not own (it only says where the box landed).
      if ("view" in r) { flush(); toks.push({ slot: r.view.slot, w: r.view.width, h: r.view.height, bl: r.view.baseline }); continue; }
      if ("img" in r) {
        const info = imageFor?.(r.img.src);
        if (info !== undefined && !info.failed) {
          flush();
          let iw = 0, ih = 0;
          if (info.loaded && info.nw > 0) { iw = Math.min(info.nw, width); ih = Math.max(1, Math.round(info.nh * (iw / info.nw))); }
          toks.push({ img: info.view, w: iw, h: ih, href: r.img.href });
          continue;
        }
        // no image host, or the load failed → alt text fallback
        const base: Extract<RichRun, { text: string }> = { text: "", size: lead?.size ?? b.fontSize, weight: lead?.weight ?? "normal", italic: false, family: lead?.family ?? FALLBACK_FAMILY, strike: false, color: lead?.color ?? 0, tracking: lead?.tracking ?? 0 };
        if (r.img.href !== undefined) base.href = r.img.href;
        const imf = fontString({ fontFamily: base.family, fontSize: base.size, fontWeight: base.weight });
        for (const part of (r.img.alt || r.img.src).split(/(\s+)/)) {
          if (part === "") continue;
          if (/^\s+$/.test(part)) { flush(); const last = toks[toks.length - 1]; if (last && ("word" in last || "img" in last || "slot" in last)) toks.push({ sp: true }); }
          else word.push({ text: part, run: { ...base, text: part }, w: textWidth(part, imf, base.tracking) });
        }
        continue;
      }
      const f = fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: r.weight, italic: r.italic, smallCaps: r.smallCaps });
      for (const part of r.text.split(/(\s+)/)) {
        if (part === "") continue;
        if (/^\s+$/.test(part)) { flush(); const last = toks[toks.length - 1]; if (last && ("word" in last || "img" in last || "slot" in last)) toks.push({ sp: true, run: r }); }
        else {
          // a place the browser may break INSIDE the word (after a hyphen,
          // between CJK characters, at a Thai word boundary) ends one word
          // token and starts the next, with no space between them
          const units = breakUnits(part);
          for (let k = 0; k < units.length; k++) {
            const u = units[k];
            const prev = word[word.length - 1];
            if (k > 0 || (prev !== undefined && breakBetween(prev.text, u))) flush();
            word.push({ text: u, run: r, w: textWidth(r.transform ? transformText(u, r.transform) : u, f, r.tracking) });
          }
        }
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
    const breakWide = (w: P[]): P[][] => {
      if (w.reduce((s, p) => s + p.w, 0) <= width) return [w];
      const out: P[][] = [];
      let cur: P[] = [], curW = 0;
      for (const p of w) {
        const pf = fontString({ fontFamily: p.run.family, fontSize: p.run.size, fontWeight: p.run.weight, italic: p.run.italic, smallCaps: p.run.smallCaps });
        const meas = (s: string) => textWidth(p.run.transform ? transformText(s, p.run.transform) : s, pf, p.run.tracking);
        let buf = "";
        for (const ch of [...p.text]) {
          const trialW = meas(buf + ch);
          if (buf !== "" && curW + trialW > width) {          // committing buf keeps the piece ≤ width
            cur.push({ text: buf, run: p.run, w: meas(buf) });
            out.push(cur); cur = []; curW = 0; buf = "";
          }
          buf += ch;
        }
        if (buf !== "") { const bw = meas(buf); cur.push({ text: buf, run: p.run, w: bw }); curW += bw; }
      }
      if (cur.length) out.push(cur);
      return out;
    };
    const broken: Tok[] = [];
    for (const tok of toks) {
      if ("word" in tok) for (const piece of breakWide(tok.word)) broken.push({ word: piece });
      else broken.push(tok);
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
    // A laid entry is either a VIEW this pass created (text, chip, rule), a
    // PERSISTENT child the flow keeps (an inline image), or a SLOT — a box with
    // no view of its own, published as the geometry fact instead of positioned.
    const blockViews: { v: View | null; line: number; boff: number; persistent?: boolean; slot?: string; sx?: number; sy?: number; sw?: number; sh?: number; run?: RichRun; w?: number; dir?: Dir }[] = [];
    const lineRight = new Map<number, number>();
    let x = 0, line = 0, pending = false;
    // The block strut: `strutAbove` is the baseline's distance below the line top
    // (the old `halfLead + bm.ascent`), `strutBelow` the descent side; together
    // they are exactly `adv`, so an all-strut (today's) line box is bit-identical.
    const strutAbove = halfLead + bm.ascent;
    const strutBelow = adv - strutAbove;
    const lineAbove: number[] = [];   // per line: baseline distance below the line top (max over runs)
    const lineBelow: number[] = [];   // per line: descent extent below the baseline (max over runs)
    // A run's own half-leading box (CSS: leading split evenly around the glyph),
    // widening the line only past the strut.
    const grow = (ln: number, fmAsc: number, fmDesc: number, size: number) => {
      // A run's box is exactly `round(size × lineHeight)` tall, as a CSS inline
      // box is: the space below its baseline is what the box leaves under the
      // space above — computed as the strut is, so a run in the block's own face
      // matches the strut to the pixel. (Descent plus a ROUNDED half-leading
      // overshot the box by up to a pixel, and every line grew by it.)
      const box = Math.round(size * (b.lineHeight || 1));
      const above = Math.floor((box - Math.ceil(fmAsc + fmDesc)) / 2) + fmAsc;
      lineAbove[ln] = Math.max(lineAbove[ln] ?? strutAbove, above);
      lineBelow[ln] = Math.max(lineBelow[ln] ?? strutBelow, box - above);
    };
    type Group = { run: Extract<RichRun, { text: string }>; x0: number; line: number; parts: string[]; end: number };
    let group: Group | null = null;
    const flushGroup = () => {
      if (group === null) return;
      const g = group; group = null;
      const r = g.run;
      const t = new Text();
      t.x = g.x0; t.width = Math.ceil(g.end - g.x0) + 2; t.wrap = false;
      t.fontSize = r.size; t.fontWeight = r.weight; t.italic = r.italic; t.fontFamily = r.family;
      t.textColor = r.color; t.text = g.parts.join("");
      if (r.tracking !== 0) t.letterSpacing = r.tracking;
      if (r.fill !== undefined) t.textFill = r.fill;
      applyRunTreatments(t, r);
      if (r.href !== undefined && onLink) { const href = r.href; setClick(t, () => onLink(href)); }
      // A plain run is the lead face, which is not always the block's own (the
      // strut's): it sits by its own ascent and grows the line like any run —
      // a no-op for ordinary prose, where the lead face IS the block's.
      const fm = fontMetrics(fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: r.weight, italic: r.italic }));
      grow(g.line, fm.ascent, fm.descent, r.size);
      blockViews.push({ v: t, line: g.line, boff: -fm.ascent, run: r, w: g.end - g.x0, dir: dirOf(t.text) });
    };
    for (const tok of broken) {
      if ("br" in tok) { flushGroup(); line++; x = 0; pending = false; continue; }
      if ("sp" in tok) { pending = true; pendingRun = tok.run; continue; }
      // An inline image: an atomic replaced box. Wrap it like a word if it does
      // not fit, grow the line to its height (bottom on the baseline), and place
      // the persistent Image view. Zero-sized (not-yet-loaded) images just take
      // their seat; the load reflows the whole flow.
      // AN INLINE VIEW: an atomic box wrapped like a word, sat on the line by the
      // baseline it CLAIMS — so a chip's label reads on the same line as the words
      // around it. With no claim the box's BOTTOM takes the baseline, the placement
      // a replaced box gets (and what the `bl = vh` default makes bit-identical to
      // before). The box then straddles the baseline, so it grows the line on BOTH
      // sides: `bl` above it, `vh - bl` below.
      if ("slot" in tok) {
        flushGroup();
        const vw = tok.w, vh = tok.h;
        const bl = tok.bl ?? vh;
        const gap = pending && x > 0 ? spaceOf(pendingRun) : 0;
        if (vw > 0 && x + gap + vw > width && x > 0) { line++; x = 0; } else x += gap;
        pending = false;
        if (vh > 0) {
          lineAbove[line] = Math.max(lineAbove[line] ?? strutAbove, bl);
          lineBelow[line] = Math.max(lineBelow[line] ?? strutBelow, vh - bl);
        }
        blockViews.push({ v: null, line, boff: -bl, slot: tok.slot, sx: x, sw: vw, sh: vh, w: vw, dir: "N" });
        x += vw;
        lineRight.set(line, x);
        continue;
      }
      if ("img" in tok) {
        flushGroup();
        const iw = tok.w, ih = tok.h;
        const gap = pending && x > 0 ? spaceOf(pendingRun) : 0;
        if (iw > 0 && x + gap + iw > width && x > 0) { line++; x = 0; } else x += gap;
        pending = false;
        const im = tok.img;
        im.x = x; im.width = iw; im.height = ih;
        if (tok.href !== undefined && onLink) { const href = tok.href; setClick(im, () => onLink(href)); }
        if (ih > 0) lineAbove[line] = Math.max(lineAbove[line] ?? strutAbove, ih);   // fit the box above the baseline
        blockViews.push({ v: im, line, boff: -ih, persistent: true, w: iw, dir: "N" });
        x += iw;
        lineRight.set(line, x);
        continue;
      }
      const ww = tok.word.reduce((s, p) => s + p.w, 0);
      const gap = pending && x > 0 ? spaceOf(pendingRun) : 0;
      if (x + gap + ww > width && x > 0) { flushGroup(); line++; x = 0; } else x += gap;
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
        const plain = !r.strike && rFont === spaceFont;
        if (group !== null && (!plain || group.run !== r || group.line !== line)) flushGroup();
        if (plain) {
          if (group === null) group = { run: r, x0: x, line, parts: [], end: x };
          else if (first && gap > 0) group.parts.push(" ");
          group.parts.push(p.text);
          x += p.w;
          group.end = x;
        } else {
          // A non-lead run — different face/size/weight, inline `code`, a strike —
          // is measured and baseline-aligned: its top is its OWN ascent above the
          // line baseline (`boff = -ascent`), and it grows the line if it is taller.
          const fm = fontMetrics(rFont);
          grow(line, fm.ascent, fm.descent, r.size);
          const t = new Text();
          t.x = x; t.width = Math.ceil(p.w) + 2; t.wrap = false;
          t.fontSize = r.size; t.fontWeight = r.weight; t.italic = r.italic; t.fontFamily = r.family; t.textColor = r.color; t.text = p.text;
          if (r.tracking !== 0) t.letterSpacing = r.tracking;
          if (r.fill !== undefined) t.textFill = r.fill;   // themed accent (gradient/solid) — same ramp as the DOM path
          applyRunTreatments(t, r);
          if (r.href !== undefined && onLink) { const href = r.href; setClick(t, () => onLink(href)); }
          const d = dirOf(p.text);
          blockViews.push({ v: t, line, boff: -fm.ascent, run: r, w: p.w, dir: d });
          // The strike rule, CENTER-anchored ~0.31·size ABOVE the baseline — the
          // same font-metric position the Text class and the DOM backend use,
          // so `~~struck~~` prose lines up across all three. (The old
          // `-ascent + 0.55·size` sat ~0.1·size too low.) Thickness tracks size
          // like the Text rule; at prose sizes that is the 1px hairline as before.
          if (r.strike) { const sth = Math.max(1, Math.round(r.size / 16)); blockViews.push({ v: rectAt(x, 0, Math.ceil(p.w), sth, r.color), line, boff: -Math.round(r.size * 0.31) - Math.floor(sth / 2), w: p.w, dir: d }); }
          x += p.w;
        }
        lineRight.set(line, x);
        first = false;
      }
    }
    flushGroup();
    // Pass 2: stack the lines (each by its own box, the strut where nothing grew)
    // and place every view at its line's baseline plus its own offset.
    const lineTop: number[] = [];
    let yy = y;
    for (let k = 0; k <= line; k++) { lineTop[k] = yy; yy += (lineAbove[k] ?? strutAbove) + (lineBelow[k] ?? strutBelow); }
    firstBaseline ??= lineTop[0] + (lineAbove[0] ?? strutAbove);   // line 0's baseline, grown or strut
    for (const bv of blockViews) {
      const yy2 = lineTop[bv.line] + (lineAbove[bv.line] ?? strutAbove) + bv.boff;
      if (bv.v !== null) bv.v.y = yy2; else bv.sy = yy2;
    }
    // BIDI. Pieces were placed left to right in logical order; a run of
    // right-to-left pieces is then mirrored within its own span, which is the
    // Unicode bidi algorithm's reordering at the grain this flow places things
    // (a view, a run piece, an inline box) — the engine orders the characters
    // inside each piece as it paints. The paragraph is left-to-right, as the
    // DOM's is by default.
    reorderBidi(blockViews);
    if (b.align === "center" || b.align === "right") {
      for (const bv of blockViews) {
        const free = width - (lineRight.get(bv.line) ?? 0);
        if (free <= 0) continue;
        const d = b.align === "center" ? free / 2 : free;
        if (bv.v !== null) bv.v.x += d; else bv.sx = (bv.sx ?? 0) + d;
      }
    }
    // ONE RAMP PER RUN. A run that is not the lead face is painted a word per
    // view, and each view would lay the run's whole gradient over its own box —
    // a ramp that restarts at every word. The DOM paints the span as one inline
    // box, so each piece takes its slice of one ramp laid across the run's
    // extent on the line.
    const pieces = new Map<RichRun, Map<number, Text[]>>();
    for (const bv of blockViews) {
      if (bv.run === undefined || !(bv.v instanceof Text) || !("text" in bv.run) || bv.run.fill == null || !isGradient(bv.run.fill)) continue;
      const lines = pieces.get(bv.run) ?? new Map<number, Text[]>();
      pieces.set(bv.run, lines);
      const on = lines.get(bv.line) ?? [];
      lines.set(bv.line, on);
      on.push(bv.v);
    }
    for (const [run, lines] of pieces) {
      const r = run as Extract<RichRun, { text: string }>;
      const g = r.fill as Gradient;
      // every piece of one run is one face, so one line box tall
      const fm = fontMetrics(fontString({ fontFamily: r.family, fontSize: r.size, fontWeight: r.weight, italic: r.italic }));
      const h = fm.ascent + fm.descent;
      // A run that wraps is ONE inline box broken across lines, and its ramp
      // is laid over the fragments set end to end (CSS's sliced decoration):
      // each line's fragment takes the next stretch of the one ramp.
      const order = [...lines.keys()].sort((a, b) => a - b);
      const span = order.map((ln) => { const on = lines.get(ln)!; return { on, x0: Math.min(...on.map((t) => t.x)), x1: Math.max(...on.map((t) => t.x + t.width)) }; });
      const total = span.reduce((sum, f) => sum + f.x1 - f.x0, 0);
      if (span.length === 1 && span[0].on.length < 2) continue;
      let before = 0;
      for (const f of span) {
        for (const t of f.on) t.textFill = sliceGradient(g, { x: f.x0 - before, y: 0, w: total, h }, { x: t.x, y: 0, w: t.width, h });
        before += f.x1 - f.x0;
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
        const tail = onLast[onLast.length - 1]?.v as Text | undefined;
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
    for (const r of lineRight.values()) if (r > widest) widest = r;
    // Persistent (image) views are already children managed by the flow's image
    // cache — position them (done above) but do NOT hand them back to be inserted
    // and discarded with the per-pass text views.
    for (const bv of blockViews) {
      // A slot on a clamped-away line gets no box: the view stays unplaced (and
      // its class decides what an unplaced chip looks like) rather than being
      // stranded at a position the flow never laid out.
      if (bv.slot !== undefined) {
        if (bv.line < keep) slots[bv.slot] = { x: bv.sx ?? 0, y: bv.sy ?? 0, width: bv.sw ?? 0, height: bv.sh ?? 0 };
        continue;
      }
      if (bv.v === null) continue;
      if (bv.line >= keep) { if (bv.persistent !== true) bv.v.discard(); continue; }
      if (bv.persistent !== true) views.push(bv.v);
    }
    y = yy;
  }
  return { views, height: y, anchors, firstBaseline, lines, slots, widest };
}

type Dir = "L" | "R" | "E" | "N";
const RTL_CHARS = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
const RTL_ALL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/g;
/** A piece's direction: R when its letters are all right-to-left, L when any
 *  letter is not, E for figures alone (they follow the text before them), N
 *  for the rest (punctuation, space, an inline box). */
function dirOf(text: string): Dir {
  const r = RTL_CHARS.test(text);
  if (/\p{L}/u.test(text.replace(RTL_ALL, ""))) return "L";
  if (r) return "R";
  return /\d/.test(text) ? "E" : "N";
}
function reorderBidi(views: { v: View | null; line: number; sx?: number; w?: number; dir?: Dir }[]): void {
  if (!views.some((b) => b.dir === "R")) return;
  const byLine = new Map<number, typeof views>();
  for (const b of views) if (b.dir !== undefined && b.w !== undefined) {
    const on = byLine.get(b.line) ?? [];
    byLine.set(b.line, on);
    on.push(b);
  }
  const xOf = (b: (typeof views)[number]): number => b.v !== null ? b.v.x : (b.sx ?? 0);
  for (const on of byLine.values()) {
    if (!on.some((b) => b.dir === "R")) continue;
    on.sort((a, b) => xOf(a) - xOf(b));
    // resolve: figures take the strong direction before them; a neutral
    // between two right-to-left pieces is right-to-left, else the paragraph's
    const strong = on.map((b) => b.dir === "L" || b.dir === "R" ? b.dir : null);
    const res: ("L" | "R")[] = [];
    for (let i = 0; i < on.length; i++) {
      const d = on[i].dir!;
      if (d === "L" || d === "R") { res.push(d); continue; }
      let prev: "L" | "R" | null = null, next: "L" | "R" | null = null;
      for (let k = i - 1; k >= 0 && prev === null; k--) prev = strong[k];
      for (let k = i + 1; k < on.length && next === null; k++) next = strong[k];
      res.push(d === "E" ? (prev === "R" ? "R" : "L") : (prev === "R" && next === "R" ? "R" : "L"));
    }
    for (let i = 0; i < on.length;) {
      if (res[i] !== "R") { i++; continue; }
      let j = i;
      while (j + 1 < on.length && res[j + 1] === "R") j++;
      if (j > i) {
        const x0 = xOf(on[i]), x1 = xOf(on[j]) + on[j].w!;
        for (let k = i; k <= j; k++) {
          const nx = x0 + x1 - (xOf(on[k]) + on[k].w!);
          if (on[k].v !== null) on[k].v!.x = nx; else on[k].sx = nx;
        }
      }
      i = j + 1;
    }
  }
}

/** Render a block sequence to a list of stacked child views: consecutive
 *  paragraphs/headings coalesce into ONE native TextFlow (contiguous selection and
 *  baselines), and each list/table/quote/code/rule becomes its own reactive
 *  sub-view. The caller stacks the result with a `yStack`. */
export function layoutBlocks(blocks: Block[], width: number, bodyColor: number, ctx: Ctx): Laid[] {
  const out: Laid[] = [];
  let group: RichBlock[] = [];
  let prevProse: "paragraph" | "heading" | null = null;      // previous prose block in this group
  let groupGeo: ReturnType<typeof geoFor> | null = null;     // the coalesced group's geometry
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
      if (groupKeep < groupTotal) v.clampLines = groupKeep;
      v.x = placeX(width, cw, groupGeo);
      out.push({ view: v, geo: groupGeo });
    }
    group = []; prevProse = null; groupGeo = null; groupTotal = 0; groupKeep = 0;
  };
  for (const b of blocks) {
    if (BUDGET <= 0) { TRUNCATED = true; break; }
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
      const rb = proseBlock(b, gap, bodyColor, ctx);
      if (BUDGET < Infinity) {
        const n = linesOf([rb], contentWidth(width, g));
        const k = Math.min(n, BUDGET);
        groupTotal += n; groupKeep += k; BUDGET -= n;
        if (k < n) TRUNCATED = true;
      }
      group.push(rb);
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
      case "code": v = buildCode(b, cw, ctx); break;
      case "pre": v = buildPre(b, cw, bodyColor, ctx); break;
      case "rule": v = setRewidth(rectView(cw, 1, C.rule), (w) => { v!.width = w; }); break;
    }
    if (v !== null) { v.x = placeX(width, cw, g); out.push({ view: v, geo: g }); }
  }
  flush();
  return out;
}

/** How many lines `blocks` flow to at `width` — the measure-only pass. */
function linesOf(blocks: RichBlock[], width: number): number {
  return flowRichCanvas(blocks, width, undefined, undefined, { measure: true }).lines;
}

/** A stacked container of `blocks` at `width` — the recursion point for a list
 *  item's body and a blockquote's content, so nested prose flows natively too. */
function buildBlocks(blocks: Block[], width: number, bodyColor: number, ctx: Ctx): View {
  const c = new View();
  c.width = width;
  const laid = layoutBlocks(blocks, width, bodyColor, ctx);
  for (const e of laid) c.$appendChild(e.view);
  c.layout = yStack(PROSE.blockGap);
  // Nested blocks (a list item's body, a quote's body) re-width by recursing.
  setRewidth(c, (w) => { c.width = w; relayoutEntries(laid, w); });
  return c;
}

/** A `<pre>` (HTMLText) — syntax-highlighted code that keeps its accent-colored
 *  runs. The mono family rides in as the flow family (a non-`mono` base style,
 *  so no inline-code chip behind each run); `<span class>` accents compose
 *  their fill on top. BARE until code chrome is set; then boxed like a fenced
 *  block, so the two render coherently. */
function buildPre(b: Extract<Block, { t: "pre" }>, width: number, bodyColor: number, ctx: Ctx): View {
  const block = codeBlock(richRunsOf(b.inline, base(CODESIZE, BODY.weight, bodyColor, BODY.tracking), CODEFAM));
  if (CODEBG === null && CODERULE === null) return spendLines(flowView([block], width, ctx), width);
  return buildCodeBox(block, width, ctx, true);
}

/** A fenced code block — its text in the code face and color, in a code box. */
function buildCode(b: Extract<Block, { t: "code" }>, width: number, ctx: Ctx): View {
  let codeText = b.text;
  if (BUDGET < Infinity) {                       // a fenced block spends one line per line of code
    const all = codeText === "" ? [""] : codeText.split("\n");
    const k = Math.min(all.length, BUDGET);
    if (k < all.length) { codeText = all.slice(0, k).join("\n"); TRUNCATED = true; }
    BUDGET -= all.length;
  }
  return buildCodeBox(codeBlock(richRunsOf([{ t: "text", value: codeText }], base(CODESIZE, "normal", C.codeFg), CODEFAM)), width, ctx, false);
}

/** A code flow spends its lines of the budget, and stops at its share. */
function spendLines(flow: TextFlow, width: number): TextFlow {
  if (BUDGET < Infinity) {
    const n = linesOf(flow.content as RichBlock[], width);
    const k = Math.min(n, BUDGET);
    if (k < n) { flow.clampLines = Math.max(1, k); TRUNCATED = true; }
    BUDGET -= n;
  }
  return flow;
}

/** A code box: the rounded tint (clipped, so the full-height bar is trimmed
 *  to the corner) holding a horizontal scroller that holds the code flow. The
 *  box itself does not scroll — long lines scroll while the tint and the bar
 *  stay put. The scroller carries the bottom padding as well as the lines, so
 *  an overlay scrollbar sits on the padding and never on the last line. */
function buildCodeBox(block: RichBlock, width: number, ctx: Ctx, spend: boolean): View {
  const ch = codeChrome();
  const flowW = width - ch.padLeft - ch.pad;
  const flow = flowView([block], flowW, ctx);
  if (spend) spendLines(flow, flowW);
  const box = rectView(width, 1, ch.fill, ch.radius);
  box.clip = true;
  const rule = ch.bar !== null ? rectView(ch.bar.width, 1, ch.bar.color) : null;
  if (rule !== null) { rule.x = 0; rule.y = 0; box.$appendChild(rule); }
  const scroller = new View();
  scroller.x = ch.padLeft; scroller.y = ch.pad; scroller.width = flowW; scroller.scrolls = "x";
  flow.x = 0; flow.y = 0;
  scroller.$appendChild(flow);
  box.$appendChild(scroller);
  const size = (): void => {
    const h = Math.max(1, flow.height + 2 * ch.pad);
    box.height = h;
    scroller.height = flow.height + ch.pad;
    if (rule !== null) rule.height = h;
  };
  const c = new Constraint("RichText.codeBox", () => `${flow.height}`, size, 0);
  c.run();
  onDiscard(box, () => c.dispose());
  // The box's height follows `flow.height` through the constraint above, and a
  // `pre` never re-wraps, so a width change is purely these widths.
  setRewidth(box, (w) => {
    box.width = w;
    const fw = w - ch.padLeft - ch.pad;
    scroller.width = fw;
    flow.reflow(fw);
  });
  return box;
}

/** A list — one reactive row per item: the marker in the gutter, the item's body
 *  (its own TextFlow(s), hanging-indented) beside it. The row auto-sizes to the
 *  body; the list stacks the rows. */
function buildList(b: Extract<Block, { t: "list" }>, width: number, bodyColor: number, ctx: Ctx): View {
  const list = new View();
  list.width = width;
  const rows: { row: View; body: View }[] = [];
  const bodyW = width - PROSE.indent;
  for (let i = 0; i < b.items.length; i++) {
    // The marker is a flow too, but it spends none of the budget: only the item's
    // BODY does (through buildBlocks). An item reached with nothing left is not
    // built at all, so a clamp never strands a bullet beside no text.
    if (BUDGET <= 0) { TRUNCATED = true; break; }
    const it = b.items[i];
    const marker = listMarker(b, it, i);
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
    row.$appendChild(mk);
    row.$appendChild(body);
    list.$appendChild(row);
    rows.push({ row, body });
  }
  // Tight vs loose (CommonMark): a tight list packs its items at `itemGap`; a
  // loose one — items separated by a blank line — gets paragraph spacing between
  // them (`blockGap`), the same air the reference gives a loose item's `<p>`.
  list.layout = yStack(b.loose ? PROSE.blockGap : PROSE.itemGap);
  setRewidth(list, (w) => {
    list.width = w;
    for (const r of rows) { r.row.width = w; REWIDTH.get(r.body)?.(w - PROSE.indent); }
  });
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
  const laidRows: { row: View; cells: TextFlow[] }[] = [];
  const makeRow = (cells: Inline[][], weight: FontWeight, color: number): View => {
    const rowCells: TextFlow[] = [];
    const row = new View();
    row.width = width;
    const contents = tableCells(b, cells, weight, color, ctx).map((cell) => [cell]);
    // A row spends the lines of its TALLEST cell, once — not a share per cell.
    const cellLines = BUDGET < Infinity ? contents.map((cc) => linesOf(cc, colW)) : [];
    const rowLines = cellLines.reduce((m, n) => Math.max(m, n), 0);
    const rowKeep = BUDGET < Infinity ? Math.min(rowLines, BUDGET) : Infinity;
    if (BUDGET < Infinity) { BUDGET -= rowLines; if (rowKeep < rowLines) TRUNCATED = true; }
    for (let c = 0; c < cols; c++) {
      const cell = flowView(contents[c], colW, ctx);
      if (rowKeep < (cellLines[c] ?? 0)) cell.clampLines = rowKeep;
      cell.x = colX(c); cell.y = 0;
      rowCells.push(cell);
      row.$appendChild(cell);
    }
    laidRows.push({ row, cells: rowCells });
    return row;
  };
  table.$appendChild(makeRow(b.header, HEADINGW, HEADINGC));
  const headRule = rectView(width, 1, C.rule);
  table.$appendChild(headRule);
  for (const r of b.rows) {
    if (BUDGET <= 0) { TRUNCATED = true; break; }   // a row reached with nothing left is not built
    table.$appendChild(makeRow(r, "normal", bodyColor));
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
function buildQuote(b: Extract<Block, { t: "blockquote" }>, width: number, ctx: Ctx): View {
  const outer = new View();
  outer.width = width;
  const body = buildBlocks(b.blocks, width - PROSE.quoteIndent, C.quoteColor, ctx);
  body.x = PROSE.quoteIndent; body.y = 0;
  const rule = rectView(3, 1, C.quoteRule);
  rule.x = 0; rule.y = 0;
  outer.$appendChild(rule);
  outer.$appendChild(body);
  const c = new Constraint("RichText.quoteRule", () => `${body.height}`, () => { rule.height = Math.max(1, body.height); }, 0);
  c.run();
  onDiscard(outer, () => c.dispose());
  setRewidth(outer, (w) => { outer.width = w; REWIDTH.get(body)?.(w - PROSE.quoteIndent); });
  return outer;
}

