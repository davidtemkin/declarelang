// dom-rich.ts — the DOM backend's RICH-TEXT FLOW, split out so it rides only
// with rich text.
//
// Everything here is reachable from exactly one place in the runtime: a
// RichText (Markdown / HTMLText) pushing its parsed blocks at the surface
// beneath it (markdown.ts). An app that names no rich-text component drops the
// component modules already (the used-set registry slim), so this code could
// never run in such a bundle — yet it shipped in every one of them, because a
// method on DomSurface is unreachable to a tree shaker. It lives in its own
// module so tools/declarec.mjs can substitute a refusing stub (programFacts
// `usesRichText`), the same lever the effects/3D/measure-text modules ride.
//
// The split is mechanical: these were DomSurface methods, so they take the
// surface as `h` and read/write the same four fields on it. `refreshSelectable`
// is the surface's own hook into dom-backend's page-wide coalesced iOS region
// refresh, which stays there because its pending list is shared with the plain
// text leaves.
import type { RichBlock, SlotBox } from "./backend.js";
import { colorToCss, isGradient, gradientCss } from "./value.js";
import { cssWeight } from "./measure.js";

/** The surface state a rich flow owns: the one flowing content element, the
 *  observer watching its height, and the two callbacks the flow reports
 *  through. Implemented by DomSurface (dom-backend.ts). */
export interface RichHost {
  readonly element: HTMLElement;
  richEl: HTMLDivElement | null;
  richObserver: ResizeObserver | null;
  onRichResize: ((height: number) => void) | undefined;
  onRichSlots: ((boxes: Record<string, SlotBox>) => void) | undefined;
  /** dom-backend's coalesced iOS selectable-region refresh (module state there). */
  refreshSelectable(el: HTMLElement): void;
}

/** This backend places inline views: `setRichContent` emits one inline-block
 *  placeholder per slot and reads back where the browser put it. */
export const richInlineSlots = true;

/** Read back every slot placeholder's box, in flow-local coordinates, and
 *  publish the geometry fact. `offsetLeft`/`offsetTop` rather than a client
 *  rect ON PURPOSE: they are LAYOUT coordinates, so an ancestor `scale` (a CSS
 *  transform) cannot scale the numbers the model then places views with. The
 *  rich host is `position: absolute`, so it is the placeholders' offsetParent.
 *  Called where a layout has already been forced (right after the height read,
 *  and from the ResizeObserver) — never forcing one of its own. */
export function measureRichSlots(h: RichHost): void {
  const host = h.richEl;
  const cb = h.onRichSlots;
  if (host === null || cb === undefined) return;
  const out: Record<string, SlotBox> = {};
  host.querySelectorAll<HTMLElement>("[data-rich-slot]").forEach((el) => {
    const key = el.dataset.richSlot;
    if (key === undefined) return;
    out[key] = { x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
  });
  cb(out);
}

/** Width-only follow-up to setRichContent: the host tracks the flow's width
 *  (it bounds a pre block's native horizontal scroller) without re-flowing —
 *  the cheap half the all-`pre` reflow early-out still needs. */
export function setRichWidth(h: RichHost, width: number): void {
  if (h.richEl !== null) h.richEl.style.width = width + "px";
}

/** Clamp the flow to `maxLines` (0 lifts the clamp), and answer its new height.
 *
 *  `-webkit-line-clamp` on the flow HOST rather than on a block: the host is
 *  one `-webkit-box` and a clamp there counts lines ACROSS its block children,
 *  which is the cross-block semantics the model wants and not the usual use of
 *  the property. Measured on the probe flow: 209px unclamped, 126px at five
 *  lines, 81px at three, later blocks gone. The browser ends the last kept line
 *  with its own ellipsis, because it is the one that wrapped it. */
export function setRichClamp(h: RichHost, maxLines: number): number {
  const host = h.richEl;
  if (host === null) return -1;
  const s = host.style as CSSStyleDeclaration & { webkitLineClamp: string; webkitBoxOrient: string };
  if (maxLines > 0) {
    s.display = "-webkit-box";
    s.webkitBoxOrient = "vertical";
    s.webkitLineClamp = String(maxLines);
    s.overflow = "hidden";
  } else {
    s.display = "";
    s.webkitBoxOrient = "";
    s.webkitLineClamp = "";
    s.overflow = "";
  }
  const height = Math.ceil(host.getBoundingClientRect().height);
  measureRichSlots(h);   // the clamp just re-flowed the lines (same layout)
  return height;
}

/** Native rich-text flow (RichText). Build ONE flowing content element — a block
 *  per RichBlock (real `<p>`/`<h*>` for a11y), inline runs in NORMAL flow (a
 *  `<span>`/`<code>`) — so the browser wraps, aligns baselines, and lets the user
 *  select/copy/find contiguously. Returns the measured (flowed) height. */
export function setRichContent(
  h: RichHost,
  blocks: RichBlock[],
  selectable: boolean,
  width: number,
  onResize: (height: number) => void,
  onLink: (href: string) => void,
  onSlots?: (boxes: Record<string, SlotBox>) => void
): number {
  const doc = h.element.ownerDocument;
  let host = h.richEl;
  if (host === null) {
    host = h.richEl = doc.createElement("div");
    const s = host.style;
    s.position = "absolute"; s.left = "0"; s.top = "0";
    h.element.appendChild(host);
  }
  host.style.width = width + "px";
  host.textContent = "";
  // Subtractive selection (the class ruling): `none` on an unselectable
  // flow, platform default + the stamp on a selectable one — never `text`.
  host.style.userSelect = selectable ? "text" : "none";
  (host.style as CSSStyleDeclaration & { webkitUserSelect: string }).webkitUserSelect = selectable ? "text" : "none";
  host.style.pointerEvents = selectable ? "auto" : "none";
  if (selectable) {
    host.dataset.declareSelectable = "1";
    h.refreshSelectable(host);
  } else delete host.dataset.declareSelectable;
  for (const b of blocks) {
    // A `pre` block is a real <pre>: whitespace preserved and, being code, it does
    // NOT wrap — long lines keep their shape and the block scrolls HORIZONTALLY
    // (native overflow-x), the way an editor shows code. Its height stays a stable
    // lines×lineHeight (no width-dependent reflow), so the flow measures it cleanly.
    // Its runs carry the monospace family and per-token colors, so it is one
    // contiguous, selectable, syntax-colored element.
    const be = doc.createElement(b.pre ? "pre" : /^h[1-6]$/.test(b.tag) ? b.tag : "p");
    // A heading carries its anchor slug so a `@name` reveal (location.md §6) can
    // find this exact element and scroll it into view natively.
    if (b.anchor !== undefined) be.setAttribute("data-anchor", b.anchor);
    const bs = be.style;
    bs.margin = "0"; bs.marginTop = b.gapBefore + "px";
    // Line box in PX — round(fontSize × lineHeight), NOT a unitless multiplier:
    // pinned so it keys off the block's own size (not the inherited cascade) and
    // matches the Canvas backend's line advance exactly (conformity).
    bs.fontSize = b.fontSize + "px";
    bs.lineHeight = Math.round(b.fontSize * b.lineHeight) + "px";
    // …and in the block's own FACE: the block element's font is every line's
    // strut. Left to the cascade it was the page's default (Times, whose line box
    // the browsers enlarge), which widened every line of a system-ui paragraph by
    // a pixel beyond the canvas and Mac layouts.
    if (b.family !== undefined) { bs.fontFamily = b.family; bs.fontWeight = cssWeight(b.weight ?? "normal"); }
    if (b.pre) { bs.whiteSpace = "pre"; bs.overflowX = "auto"; bs.overflowY = "hidden"; }
    // A flowing block wraps at spaces, and a token WIDER than the flow (a long
    // code span or slash-path in a narrow table cell) breaks rather than
    // overflowing its box — otherwise it spills past the column and collides
    // with the neighbour cell. A no-op for prose that fits (breaks only what
    // cannot). `pre` blocks are exempt: code keeps its shape and scrolls.
    else { bs.whiteSpace = "normal"; bs.overflowWrap = "break-word"; }
    if (b.align !== undefined && b.align !== "left") bs.textAlign = b.align;
    for (const r of b.runs) {
      if ("br" in r) { be.appendChild(doc.createElement("br")); continue; }
      // An INLINE VIEW's slot: an empty inline-block PLACEHOLDER of the view's
      // current size. The browser flows it as an atomic box — never split,
      // growing the line when it is taller than the text — and we read back
      // where it landed. The view itself is a real positioned Declare view
      // elsewhere in the tree; this element only holds its seat, and being
      // empty it contributes nothing to a selection or a copy.
      //
      // WHERE IT SITS ON THE LINE. An empty inline-block has no line box of its
      // own, so its CSS baseline is its bottom margin edge — the placement an
      // `<img>` gets, and the right one for a view whose subtree claims no
      // baseline. When the view DOES claim one, the model has already measured
      // it (`r.view.baseline`, down from the top of the box) and the offset is
      // arithmetic: sitting that line on the text's means dropping the box by
      // `height − baseline`, which `vertical-align` takes as a length RAISING
      // the box, hence the negative. Computed, never guessed, and the same
      // number the manual flow places by.
      if ("view" in r) {
        const ph = doc.createElement("span");
        ph.dataset.richSlot = r.view.slot;
        const ps = ph.style;
        ps.display = "inline-block";
        ps.width = r.view.width + "px";
        ps.height = r.view.height + "px";
        ps.verticalAlign = r.view.baseline === undefined ? "baseline" : (r.view.baseline - r.view.height) + "px";
        be.appendChild(ph);
        continue;
      }
      // An inline image (`![alt](src)`) is a real <img>, flowing as a replaced
      // box the browser wraps and reflows natively; it caps to the flow width,
      // shows its `alt` if it cannot load, and — when the image is a link's
      // content — sits inside an <a> that routes its click through `onLink`.
      if ("img" in r) {
        const im = r.img;
        const img = doc.createElement("img");
        img.src = im.src; img.alt = im.alt;
        if (im.title !== undefined) img.title = im.title;
        const is = img.style;
        // Cap to the flow width, keep aspect, and sit the image's bottom on the
        // text baseline (CSS default `vertical-align: baseline`) — the same
        // placement the Canvas flow uses, so the backends agree.
        is.maxWidth = "100%"; is.height = "auto"; is.verticalAlign = "baseline";
        if (im.href !== undefined) {
          const a = doc.createElement("a");
          a.href = im.href; a.style.pointerEvents = "auto";
          a.addEventListener("click", (e) => { const m = e as MouseEvent; if (m.button === 0 && !m.metaKey && !m.ctrlKey && !m.shiftKey && !m.altKey) { e.preventDefault(); onLink(im.href!); } });
          a.appendChild(img); be.appendChild(a);
        } else be.appendChild(img);
        continue;
      }
      // A link run is a REAL <a href> — native hover URL, right/middle/⌘-click
      // open-in-tab — but a plain left click routes through `onLink` so the app,
      // not the browser, decides (scroll, in-app route, or app.navigate).
      const isLink = r.href !== undefined;
      const el = doc.createElement(isLink ? "a" : "span");
      const rs = el.style;
      if (isLink) {
        (el as HTMLAnchorElement).href = r.href!;
        rs.textDecoration = "none"; rs.cursor = "pointer"; rs.pointerEvents = "auto";
        el.addEventListener("click", (e) => {
          const m = e as MouseEvent;
          if (m.button === 0 && !m.metaKey && !m.ctrlKey && !m.shiftKey && !m.altKey) { e.preventDefault(); onLink(r.href!); }
        });
      }
      rs.fontFamily = r.family;
      rs.fontSize = r.size + "px";
      // Per-run line box (`round(size × multiplier)`, the twin of the block's
      // strut above). A run at the block size restates the block value, so
      // uniform content is byte-identical; a BIGGER run grows only its own
      // line — the browser takes the max inline box, exactly as the Canvas
      // two-pass takes max over a line's runs. This is what lets a variable
      // inline size flow correctly and stay in step with the Canvas layout.
      rs.lineHeight = Math.round(r.size * b.lineHeight) + "px";
      rs.fontWeight = cssWeight(r.weight);
      if (r.italic) rs.fontStyle = "italic";
      rs.color = colorToCss(r.color);
      // A themed accent fill overrides the solid color: a gradient clips a
      // background to the glyphs (matching Text.textFill and the Canvas ramp),
      // a solid fill is just that color.
      if (r.fill != null) {
        if (isGradient(r.fill)) {
          rs.backgroundImage = gradientCss(r.fill);
          (rs as CSSStyleDeclaration & { webkitBackgroundClip: string }).webkitBackgroundClip = "text";
          rs.backgroundClip = "text";
          (rs as CSSStyleDeclaration & { webkitTextFillColor: string }).webkitTextFillColor = "transparent";
          rs.color = "transparent";
        } else {
          rs.color = colorToCss(r.fill);
        }
      }
      if (r.tracking !== 0) rs.letterSpacing = r.tracking + "px";
      // decorations compose (a run may be both underlined and struck); wins over
      // the link default of "none" set above.
      const deco = (r.underline ? "underline " : "") + (r.strike ? "line-through" : "");
      if (deco.trim() !== "") rs.textDecoration = deco.trim();
      // typographical treatments (CSS twins of the RunStyle fields)
      if (r.shadow != null) rs.textShadow = `${r.shadow.dx}px ${r.shadow.dy}px ${r.shadow.blur}px ${colorToCss(r.shadow.color)}`;
      if (r.outline != null) {
        (rs as CSSStyleDeclaration & { webkitTextStroke: string }).webkitTextStroke = `${r.outline.width}px ${colorToCss(r.outline.color)}`;
        rs.paintOrder = "stroke fill";   // stroke UNDER fill, so the fill stays crisp
      }
      if (r.transform != null) rs.textTransform = r.transform;
      if (r.smallCaps) rs.fontVariant = "small-caps";
      el.textContent = r.text;
      be.appendChild(el);
    }
    host.appendChild(be);
  }
  // Watch the flowed height: offsetHeight can read 0 here (attached inside a
  // momentarily zero-sized ancestor during a page transition, or before a web
  // font loads), and it also changes when a font arrives. The observer reports
  // the settled height back so the RichText — and the stack around it — correct.
  h.onRichSlots = onSlots;
  if (typeof ResizeObserver !== "undefined") {
    const measured = host;
    if (h.richObserver === null) {
      h.richObserver = new ResizeObserver(() => {
        h.onRichResize?.(measured.offsetHeight);
        measureRichSlots(h);
      });
      h.richObserver.observe(measured);
    }
    h.onRichResize = onResize;
  }
  const flowed = host.offsetHeight;   // forced layout → the flowed height
  // The layout the line above forced is the one the slots were placed in, so
  // reading their boxes here costs nothing extra — and the views are in place
  // for the very first paint instead of one frame behind it. The observer
  // above re-publishes whenever a later measurement moves them.
  measureRichSlots(h);
  return flowed;
}
