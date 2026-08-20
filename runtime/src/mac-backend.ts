// mac-backend — the NATIVE realization of the Surface protocol: a retained
// CALayer tree on the far side of a command buffer.
//
// THE SPLIT (docs/system-design/native-host.md §4). The runtime is unchanged
// and unaware: it drives this backend exactly as it drives the DOM one. What
// crosses to Swift is *final geometry* — one flat op buffer per settle, posted
// once, applied inside one CATransaction. Nothing is read back on the hot
// path; the host answers only two questions (text metrics, image size), both
// on the cold path.
//
// WHAT STAYS IN JS. Everything the canvas backend already proved the runtime
// can own: the scene model (geometry, order, clip, scroll offsets), the HIT
// WALK (reverse child order, isPointInPath clip subtraction, ignoreclip
// exemption, scroll-frame correction), and scroll routing. Keeping the model
// here means the native host never needs a second copy of the hit rules —
// the two renderers cannot disagree because there is one implementation of
// the decision and two of the drawing.
//
// WHAT CROSSES. Ops are [opcode, id, …args] arrays, batched into one array
// and JSON-posted at flush. Opcodes are ints so the wire stays small; strings
// (colors, text, path data) ride verbatim. A surface is an integer id — the
// Swift side keeps id → CALayer.

import type {
  Surface, RenderBackend, InputSink, EditableSpec, RichBlock, Stretch, InputWants,
} from "./backend.js";
import type { DisplayList } from "./draw.js";
import type { TextStyle } from "./measure.js";
import { colorToCss, isGradient, type Fill, type Gradient, type Shadow, type Stroke } from "./value.js";
import { routeInput, type HitTarget } from "./input.js";

// ── the wire ────────────────────────────────────────────────────────────────

export const OP = {
  CREATE: 1, DESTROY: 2, INSERT: 3, ROOT: 4,
  GEOM: 5, FILL: 6, GRADIENT: 7, RADIUS: 8, STROKE: 9, SHADOW: 10,
  VISIBLE: 11, OPACITY: 12, SCALE: 13, CLIP: 14, BOXCLIP: 15,
  TEXT: 16, TEXTSTYLE: 17, DRAW: 18, IMAGE: 19, STRETCH: 20,
  SCROLL: 21, SCROLLPOS: 22, CURSOR: 23, EDIT: 24, EDITFOCUS: 25,
  RICH: 26, RICHSCROLL: 27, EMBED: 28, IGNORECLIP: 29,
  SCROLLX: 30, SCROLLXPOS: 31, PAGEFILL: 32,
  IGNORESCROLL: 33, RICHWIDTH: 34, BLEND: 35, BACKDROP: 36, TINT: 37,
  ROTATE: 38, MEDIA: 39,
} as const;

/** The host side of the bridge — provided by the Swift shell before boot. */
export interface MacHost {
  /** Apply one settle's ops (a JSON array of arrays) inside one CATransaction. */
  commit(json: string): void;
  /** Measure text: returns [width, ascent, descent, capAscent]. Cold path. */
  measure(text: string, font: string, letterSpacing: number): number[];
  /** Natural size of a loaded image handle: [w, h]. */
  imageSize(handle: number): number[];
  /** Read back a native editable's current value (focus/blur sync). */
  editValue?(id: number): string;
  /** Lay a rich-text flow out natively and answer its height (cold path). */
  richLayout(id: number, blocksJson: string, selectable: boolean, width: number): number;
}

function host(): MacHost {
  const h = (globalThis as unknown as { __declareMacHost?: MacHost }).__declareMacHost;
  if (h === undefined) throw new Error("mac backend: no host bridge installed");
  return h;
}

/** The op buffer. Batched per settle and flushed by the frame pump — one
 *  crossing per frame no matter how many attributes changed. */
const ops: unknown[][] = [];
let flushScheduled = false;

function emit(op: number, id: number, ...args: unknown[]): void {
  ops.push([op, id, ...args]);
  if (!flushScheduled) {
    flushScheduled = true;
    // The frame pump: rAF is the display link on the native side, so a flush
    // lands exactly once per displayed frame (never per attribute write).
    const raf = (globalThis as unknown as { requestAnimationFrame?: (cb: () => void) => void }).requestAnimationFrame;
    if (typeof raf === "function") raf(flushOps);
    else queueMicrotask(flushOps);
  }
}

/** How many ops the current (unflushed) settle produced — benchmarks only. */
export function countOps(): number { return ops.length; }
/** The serialized size of the pending buffer, for measuring the crossing. */
export function peekOps(): number { return JSON.stringify(ops).length; }

export function flushOps(): void {
  flushScheduled = false;
  // LAYOUT HAS SETTLED — re-clamp every scroller before the ops cross. An
  // empty buffer means nothing moved, so there is nothing to re-clamp.
  if (ops.length === 0) return;
  reclampScrollers();
  const json = JSON.stringify(ops);
  ops.length = 0;
  host().commit(json);
}

/** Every live scrolling surface, so the post-settle sweep can find them
 *  without walking the tree. Membership follows setScroll/setScrollX. */
const scrollers = new Set<MacSurface>();

/** The browser's half of the scroll contract, which this backend has to do by
 *  hand: WHEN THE CONTENT OR THE BOX CHANGES, THE OFFSET IS RE-CLAMPED AND THE
 *  RANGE RE-PUBLISHED.
 *
 *  A DOM scroller gets this free — shrink the content under a scrolled element
 *  and the browser pulls `scrollTop` back to the new maximum, fires `scroll`,
 *  and resizes the bar. Here both halves were missing, and a resize is exactly
 *  when both bite:
 *
 *    • THE STRANDED OFFSET. Scroll weather's pane to the bottom at 900x568
 *      (offset 1144), then widen to 1280x900: the content re-flows shorter and
 *      the viewport grows, so the real maximum collapses — but the offset
 *      stayed at 1144 and the pane rendered past the end of its own content,
 *      two-thirds of the window empty. That is the "grey areas".
 *    • THE STALE RANGE. The host learns a scroller's extent ONLY from
 *      SCROLLPOS, i.e. only when someone scrolls. Until then its scrollbar is
 *      sized from the pre-resize content, so the thumb is the wrong length and
 *      a drag maps to the wrong place — "won't scroll far enough". The wheel
 *      looked fine because that path recomputes the extent on every event; it
 *      is everything driven by the PUBLISHED extent that was wrong.
 *
 *  Runs at flush, not in the geometry setters: extent is a property of the
 *  whole subtree, so it is only knowable once the settle that moved things has
 *  finished. Publishing on an extent change (not just an offset change) is what
 *  fixes the scrollbar; `setScrollOffset` notifies the view so `scrollY` agrees,
 *  exactly as the DOM's scroll event does. */
function reclampScrollers(): void {
  for (const sc of scrollers) {
    if (sc.scrolls) {
      const ext = sc.contentExtent();
      const next = Math.min(Math.max(0, ext - sc.height), Math.max(0, sc.scrollOffset));
      if (next !== sc.scrollOffset || ext !== sc.publishedExtent) {
        sc.publishedExtent = ext;
        if (next !== sc.scrollOffset) sc.setScrollOffset(next);
        emit(OP.SCROLLPOS, sc.id, next, ext);
      }
    }
    if (sc.scrollsX) {
      const extX = sc.contentExtentXPublic();
      const nextX = Math.min(Math.max(0, extX - sc.width), Math.max(0, sc.scrollXOffset));
      if (nextX !== sc.scrollXOffset || extX !== sc.publishedExtentX) {
        sc.publishedExtentX = extX;
        sc.scrollXOffset = nextX;
        emit(OP.SCROLLXPOS, sc.id, nextX, extX);
      }
    }
  }
}

let nextId = 1;

// ── the surface ─────────────────────────────────────────────────────────────

/** One view's retained state. The fields are the SCENE MODEL (the same one the
 *  canvas backend keeps) — every setter both records the value and emits the
 *  op that mirrors it into the layer tree. */
class MacSurface implements Surface {
  readonly id = nextId++;
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  visible = true;
  opacity = 1;
  cursorStyle = "";
  scaleK = 1;
  pivotX = 0;
  pivotY = 0;
  rotationDeg = 0;
  scrolls = false;
  scrollOffset = 0;
  private onScrollCb: ((y: number) => void) | null = null;
  parent: MacSurface | null = null;
  readonly children: MacSurface[] = [];
  ignoresClip = false;
  sink: InputSink | null = null;
  /** What the view declared it wants (dbl / hold / touch) — see setInput. */
  wants: InputWants | undefined = undefined;
  /** Shape clip (path data) and box clip — kept for the HIT walk, which must
   *  subtract exactly what the paint does. */
  private clipData: string | null = null;
  private boxClip = false;
  scrollsX = false;
  scrollXOffset = 0;
  /** The extent last PUBLISHED to the host, per axis — what its scrollbar is
   *  currently sized from. `-1` is "never published", so the first sweep after
   *  a scroller appears always states its range. */
  publishedExtent = -1;
  publishedExtentX = -1;
  /** Set when this surface hosts native rich content: its height is answered
   *  by the host's text layout, and its hit region is the box (the overlay
   *  owns interior selection). */
  private richHeight = 0;

  constructor() {
    emit(OP.CREATE, this.id);
  }

  setX(v: number): void { this.x = v; this.geom(); }
  setY(v: number): void { this.y = v; this.geom(); }
  setWidth(v: number): void { this.frameW = v; this.realizeSize(); }
  setHeight(v: number): void { this.frameH = v; this.realizeSize(); }
  private geom(): void { emit(OP.GEOM, this.id, this.x, this.y, this.width, this.height); }

  /** The MODEL frame, kept apart from the realized box: an EMBEDDED app root
   *  realizes LARGER than its frame along a declared scroll axis — the DOM's
   *  applyRootSize, where the root element grows to the page extent and the
   *  island's scroll box pans over it. A virtual range alone is not enough:
   *  it gave the island somewhere to scroll TO, but the root still clipped at
   *  its frame, so the revealed region was bare host ("scrolling birds in a
   *  desktop window goes black"). The model's width/height are untouched —
   *  realization only. Top level (no parent surface) nothing grows; the page
   *  itself is the scroller there. */
  private frameW = 0;
  private frameH = 0;
  realizeSize(): void {
    const grow = this.appRoot && this.parent !== null;
    const w = grow && this.wantsScrollX ? Math.max(this.frameW, this.pageExtentW) : this.frameW;
    const h = grow && this.wantsScrollY ? Math.max(this.frameH, this.pageExtentH) : this.frameH;
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.geom();
  }

  /** The last realized SOLID fill, as css — attachRoot reads it to paint the
   *  page behind a top-level app (the DOM/canvas attachRoot rule, mirrored).
   *  Solid fills only, exactly like the canvas mirror: a gradient app ground
   *  gets no page echo there either. */
  fillCss: string | null = null;
  setFill(fill: Fill): void {
    if (isGradient(fill)) {
      const g = fill as Gradient;
      this.fillCss = null;
      emit(OP.GRADIENT, this.id, { angle: g.angle, stops: g.stops.map((st) => [st.offset, colorToCss(st.color)]) });
    } else {
      this.fillCss = fill === null ? null : colorToCss(fill);
      emit(OP.FILL, this.id, this.fillCss);
    }
  }
  setCornerRadius(r: number): void { emit(OP.RADIUS, this.id, r); }
  setStroke(s: Stroke | null): void {
    emit(OP.STROKE, this.id, s === null ? null : s.width, s === null ? null : colorToCss(s.color));
  }
  setShadow(sh: Shadow | null): void {
    if (sh === null) emit(OP.SHADOW, this.id, null);
    else emit(OP.SHADOW, this.id, sh.dx, sh.dy, sh.blur, colorToCss(sh.color));
  }
  setVisible(v: boolean): void { this.visible = v; emit(OP.VISIBLE, this.id, v ? 1 : 0); }
  setOpacity(o: number): void { this.opacity = o; emit(OP.OPACITY, this.id, o); }
  /** The schema token rides the wire verbatim; the Swift side maps it to a
   *  CIFilter for `layer.compositingFilter` (public on macOS — LayerTree
   *  case 35). A compositing filter rides the layer, not the order, so the
   *  restack/clipHost machinery is untouched. */
  setBlend(mode: string): void { emit(OP.BLEND, this.id, mode); }
  /** The frost, natively (LayerTree case 36): the Swift side samples the
   *  layers beneath the node's padded region (CALayer.render(in:)), filters
   *  in encoded sRGB (the DrawReplay color-space precedent) and lands the
   *  result as a masked layer under the node's own fill. [blur, saturate]
   *  ride the wire; null clears. */
  setBackdrop(spec: { blur: number; saturate: number } | null): void {
    emit(OP.BACKDROP, this.id, spec === null ? null : spec.blur, spec === null ? 1 : spec.saturate);
  }
  setCursor(c: string): void { this.cursorStyle = c; emit(OP.CURSOR, this.id, c); }
  /** No CSS pointer-events natively: the hit walk is ours, so an inert
   *  surface simply drops its sink (setInput(null)) — this is a no-op kept
   *  for protocol completeness. The carved-sink rule needs nothing here
   *  because nothing but our own walk ever hit-tests. */
  /** Consulted by hit() below — the walk decides, so the walk must know. */
  pe = "";
  setPointerEvents(mode: string): void { this.pe = mode; }

  /** Rotation rides its own op; the pivot arrives via SCALE (the runtime
   *  always pushes both — view.ts pushTransform), and the Swift side folds
   *  both into one CATransform3D (applyScale). */
  setRotation(deg: number, _px: number, _py: number): void {
    this.rotationDeg = deg;
    emit(OP.ROTATE, this.id, deg);
  }

  /** Invert the paint transform (scale, then rotation, about the shared
   *  pivot) — the hit/cursor/wheel walks' transform term, the same inverse
   *  interaction.ts toChildLocal applies (the ONE-WALK rule). */
  invertTransform(lx: number, ly: number): [number, number] {
    if (this.scaleK === 1 && this.rotationDeg === 0) return [lx, ly];
    let dx = lx - this.pivotX;
    let dy = ly - this.pivotY;
    if (this.scaleK !== 1 && this.scaleK !== 0) {
      dx /= this.scaleK;
      dy /= this.scaleK;
    }
    if (this.rotationDeg !== 0) {
      const a = (-this.rotationDeg * Math.PI) / 180;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rx = dx * ca - dy * sa;
      const ry = dx * sa + dy * ca;
      dx = rx;
      dy = ry;
    }
    return [dx + this.pivotX, dy + this.pivotY];
  }
  setScale(scale: number, px: number, py: number): void {
    this.scaleK = scale; this.pivotX = px; this.pivotY = py;
    emit(OP.SCALE, this.id, scale, px, py);
  }

  setClip(pathData: string | null): void {
    this.clipData = pathData;
    emit(OP.CLIP, this.id, pathData);
  }
  setBoxClip(on: boolean): void {
    this.boxClip = on;
    emit(OP.BOXCLIP, this.id, on ? 1 : 0);
  }
  setIgnoreClip(on: boolean): void {
    this.ignoresClip = on;
    // The host needs this too, not just the hit walk: a CALayer's
    // masksToBounds is all-or-nothing, so an exempt child has to be lifted out
    // of the clipping layer the way the DOM backend lifts one out of its inner
    // clip box. Without it the dock's label pill — which sits well above its
    // own parent's box — was clipped away entirely.
    emit(OP.IGNORECLIP, this.id, on ? 1 : 0);
  }

  /** Fixed chrome: this surface does not ride its scroller's content. The host
   *  realizes it by hosting the layer on the scroller's OWN layer rather than
   *  the content layer that translates — the same escape shape `setIgnoreClip`
   *  uses, one property over.
   *
   *  Was absent entirely until 2026-08-05, which the seam table (test/seam.test.mjs)
   *  had recorded as a GAP and gate-baseline.json had sized: `ignorescroll`'s
   *  1.17% structural figure WAS this hole, since no pixel test can see an
   *  absence unless something is actually scrolled under the pinned thing. */
  /** Retained for the wheel walk (wheelTo): pinned chrome reads FRAME
   *  coordinates, not the scrolled content's. The Swift side owns the
   *  visual realization; this is the model's copy of the same fact. */
  ignoresScroll = false;
  setIgnoreScroll(on: boolean): void {
    this.ignoresScroll = on;
    emit(OP.IGNORESCROLL, this.id, on ? 1 : 0);
  }

  /** An app ROOT (top-level or an island tenant) — roots keep to their frame
   *  and never self-scroll (the DOM's applyScrollStyle root branch). Stamped by
   *  attachRoot / mountEmbed, which run AFTER attach's scrolls push — so the
   *  push guards on it for any later re-push. */
  appRoot = false;
  /** The DECLARED axes, recorded before the root guard: a tenant root never
   *  self-scrolls, but its declared axis still decides whether its page
   *  extent grows the ISLAND's scroll range (contentExtent) — the DOM's
   *  scrollYOn/scrollXOn, which applyScrollStyle records even on the root
   *  branch. attach's scrolls push runs before mountEmbed retires the root,
   *  and a later re-push updates these through the guard. */
  wantsScrollY = false;
  wantsScrollX = false;
  setScroll(on: boolean, onScroll: (y: number) => void): void {
    this.wantsScrollY = on;
    if (this.appRoot && on) return;                 // a root never self-scrolls
    this.scrolls = on;
    this.onScrollCb = on ? onScroll : null;
    if (!on) this.scrollOffset = 0;
    if (on || this.scrollsX) scrollers.add(this); else scrollers.delete(this);
    emit(OP.SCROLL, this.id, on ? 1 : 0);
  }
  /** Horizontal scroll is not yet realized natively (code blocks clip). */
  setScrollX(on: boolean): void {
    this.wantsScrollX = on;
    if (this.appRoot && on) return;                 // a root never self-scrolls
    // NOT deferred any more. The Files browser's column strip scrolls
    // HORIZONTALLY, and `scrollIntoView` on the DOM backend hands off to the
    // element's native one, which reveals on both axes. With this unimplemented
    // a newly opened column simply never slid into view.
    this.scrollsX = on;
    if (on || this.scrolls) scrollers.add(this); else scrollers.delete(this);
    emit(OP.SCROLLX, this.id, on ? 1 : 0);
  }

  /** The widest a child reaches — the horizontal twin of contentExtent().
   *
   *  RECURSES, because this stands in for the DOM's `scrollWidth`, which
   *  measures where the content actually ends rather than what the immediate
   *  child declares. The Files strip is exactly that case: its row's declared
   *  width lags the columns inside it, so a shallow sum said the content fit
   *  and no column ever slid into view. A child that clips (or scrolls on this
   *  axis) contains its own overflow, so the walk stops there — again as the
   *  DOM does. */
  contentExtentXPublic(): number { return this.contentExtentX(); }

  /** Set the vertical offset and notify, for the smooth-reveal animation. */
  setScrollOffset(v: number): void { this.scrollOffset = v; this.onScrollCb?.(v); }

  private contentExtentX(): number {
    let w = 0;
    for (const c of this.children) {
      if (!c.visible) continue;
      let cw = c.width;
      if (!c.boxClip && c.clipData === null && !c.scrollsX) cw = Math.max(cw, c.contentExtentX());
      w = Math.max(w, c.x + cw);
    }
    return w;
  }

  /** Reveal this surface within its nearest HORIZONTALLY scrolling ancestor. */
  private revealX(align: "start" | "nearest", smooth = false): void {
    let sc: MacSurface | null = this.parent;
    let left = this.x;
    while (sc !== null && !sc.scrollsX) { left += sc.x; sc = sc.parent; }
    if (sc === null) return;
    const right = left + this.width;
    const viewLeft = sc.scrollXOffset;
    const viewRight = viewLeft + sc.width;
    let next = sc.scrollXOffset;
    // `nearest` is CSSOM's minimal-scroll rule, which Chrome realizes: nothing
    // when the target is visible; nothing when it already COVERS the viewport;
    // and for a target WIDER than the viewport, align the near edge — the
    // minimal move — never the far one.
    if (align === "start") next = left;
    else if (left < viewLeft && right > viewRight) { /* covers the viewport */ }
    else if (left < viewLeft) next = this.width > sc.width ? right - sc.width : left;
    else if (right > viewRight) next = this.width > sc.width ? left : right - sc.width;
    const max = Math.max(0, sc.contentExtentX() - sc.width);
    next = Math.min(max, Math.max(0, next));
    if (next !== sc.scrollXOffset) {
      if (smooth) glideX(sc, next);
      else {
        sc.scrollXOffset = next;
        emit(OP.SCROLLXPOS, sc.id, next, sc.contentExtentX());
      }
    }
  }

  setText(text: string): void { emit(OP.TEXT, this.id, text); }
  setTextStyle(style: TextStyle): void {
    emit(OP.TEXTSTYLE, this.id, {
      family: style.fontFamily, size: style.fontSize, weight: style.fontWeight,
      italic: style.italic === true, color: style.color === null ? null : colorToCss(style.color),
      // A gradient text-fill: the DOM clips a background to the glyphs and the
      // canvas realizes the same ramp over the box, so the host is handed the
      // ramp itself and clips it to the glyph outlines.
      fillGradient: style.textFill != null && isGradient(style.textFill)
        ? { angle: (style.textFill as Gradient).angle,
            stops: (style.textFill as Gradient).stops.map((st) => [st.offset, colorToCss(st.color)]) }
        : null,
      align: style.align ?? "left", wrap: style.wrap === true,
      letterSpacing: style.letterSpacing ?? 0,
      // Leading as a fontSize multiplier (0 = natural). The host's TextEngine
      // does not consume it yet — seam row in test/seam.test.mjs.
      lineHeight: style.lineHeight ?? 0,
      selectable: style.selectable === true,
      shadow: style.shadow == null ? null
        : [style.shadow.dx, style.shadow.dy, style.shadow.blur, colorToCss(style.shadow.color)],
    });
  }

  setDrawing(list: DisplayList | null): void {
    emit(OP.DRAW, this.id, list === null ? null : { ops: list.ops, bounds: list.bounds });
  }

  setImage(image: unknown | null): void {
    // A media element (the env's <video> shim) is not a bitmap: it binds the
    // node to a native player layer instead, and the host draws the frames.
    const media = image === null ? undefined : (image as { __mediaHandle?: number }).__mediaHandle;
    if (media !== undefined) { emit(OP.MEDIA, this.id, media); return; }
    const handle = image === null ? null : (image as { __handle?: number }).__handle ?? null;
    emit(OP.IMAGE, this.id, handle);
  }
  setImageStretch(stretch: Stretch): void { emit(OP.STRETCH, this.id, stretch); }
  /** Tint (compositing.md §3.4): the color rides as CSS text; the Swift side
   *  re-derives the bitmap as an alpha-mask fill (LayerTree case 37). */
  setImageTint(color: number | null): void {
    emit(OP.TINT, this.id, color === null ? null : colorToCss(color));
  }

  /** Native rich text: the host lays the blocks out (Core Text) and answers
   *  the flowed height, which the runtime treats exactly as the DOM
   *  backend's measured height. `selectable` mounts a real NSTextView so
   *  selection is the platform's own. */
  setRichContent(blocks: RichBlock[], selectable: boolean, width: number,
                 onResize: (height: number) => void, onLink: (href: string) => void): number {
    richCallbacks.set(this.id, { onResize, onLink });
    // SYNCHRONOUS, like the DOM backend: the flow's height is a fact this
    // settle needs (the view sizes to it). AppKit's text system lays the
    // blocks out and answers now; an async answer would leave every flow at
    // height 0 for a frame — and a zero-height flow stacks on its siblings.
    this.richHeight = host().richLayout(this.id, JSON.stringify(blocks), selectable, width);
    return this.richHeight;
  }
  /** Width-only: an all-`pre` flow cannot re-wrap, so its lines and height are
   *  unchanged — but the host box must still adopt the width, because it bounds
   *  the pre's native horizontal scroller and a box left at its boot-time width
   *  clips the flow to nothing. No blocks cross the bridge: the host holds the
   *  laid-out state and only re-sizes its container. */
  setRichWidth(width: number): void {
    emit(OP.RICHWIDTH, this.id, width);
  }

  /** Called from the host when a rich flow's laid-out height is known. */
  applyRichHeight(h: number): void {
    if (h === this.richHeight) return;
    this.richHeight = h;
    richCallbacks.get(this.id)?.onResize(h);
  }

  /** The write half of scrollY/scrollX — clamped like every other write, and
   *  emitted so the layer tree moves this frame. */
  scrollToY(v: number): void {
    if (!this.scrolls) return;
    const next = Math.min(Math.max(0, this.contentExtent() - this.height), Math.max(0, v));
    if (next === this.scrollOffset) return;
    this.setScrollOffset(next);
    emit(OP.SCROLLPOS, this.id, next, this.contentExtent());
  }
  scrollToX(v: number): void {
    if (!this.scrollsX) return;
    const next = Math.min(Math.max(0, this.contentExtentX() - this.width), Math.max(0, v));
    if (next === this.scrollXOffset) return;
    this.scrollXOffset = next;
    emit(OP.SCROLLXPOS, this.id, next, this.contentExtentX());
  }

  scrollIntoView(align: "start" | "nearest" = "nearest", smooth = false): void {
    this.revealX(align, smooth);
    // Walk to the nearest scrolling ancestor, accumulating this surface's
    // offset within it — the canvas backend's math, verbatim.
    let sc: MacSurface | null = this.parent;
    let top = this.y;
    while (sc !== null && !sc.scrolls) { top += sc.y; sc = sc.parent; }
    if (sc === null) return;
    const bottom = top + this.height;
    const viewTop = sc.scrollOffset;
    const viewBottom = viewTop + sc.height;
    let next = sc.scrollOffset;
    // Same `nearest` rule as revealX — measured against Chrome on the embedded
    // desktop's Files-column reveal: a column TALLER than the island viewport,
    // below the fold, top-aligns there (minimal); the far-edge alignment this
    // used to do scrolled ~100px further than the reference.
    if (align === "start") next = top;
    else if (top < viewTop && bottom > viewBottom) { /* covers the viewport */ }
    else if (top < viewTop) next = this.height > sc.height ? bottom - sc.height : top;
    else if (bottom > viewBottom) next = this.height > sc.height ? top : bottom - sc.height;
    const max = Math.max(0, sc.contentExtent() - sc.height);
    next = Math.min(max, Math.max(0, next));
    if (next !== sc.scrollOffset) {
      if (smooth) glideY(sc, next);
      else {
        sc.scrollOffset = next;
        sc.onScrollCb?.(next);
        emit(OP.SCROLLPOS, sc.id, next, sc.contentExtent());
      }
    }
  }

  revealRichAnchor(_slug: string, _within: number): boolean { return false; }
  /** An embed marker (DOMIsland's `slot`, and so AppIsland's `run:…` key).
   *  Natively nothing mounts into an element — the host reads the pending
   *  markers and inserts a child app's ROOT SURFACE here, so the tenant
   *  lands in this very layer tree (mountEmbed below). */
  setEmbed(id: string, view?: unknown): void {
    if (id === "") { embeds.delete(this.id); islandViews.delete(this.id); }
    else {
      embeds.set(this.id, id);
      // Keep the island VIEW, not just its slot: the name channel runs the other
      // way (child `appName` → the island's `childName`), and a hosting window
      // titles itself by it. The DOM backend keeps the same back-reference on
      // the box element; here the surface holds it directly.
      if (view !== undefined) islandViews.set(this.id, view as IslandView);
    }
    emit(OP.EMBED, this.id, id);
  }

  /** The sink, plus WHAT THIS VIEW ASKED FOR.
   *
   *  `wants` is not decoration: the shared router reads `wantsDbl` off the hit
   *  target to decide whether to HOLD a click for the double-click window, and
   *  `wantsHold` to arm the hold timer. A backend that drops it silently loses
   *  onDblClick and onHold — the DOM backend keeps the same fact in a WANTS map
   *  and spreads it onto every hit target, so this mirrors it exactly.
   *  `wantsTouch` is recorded for symmetry; a Mac mouse never reports fingers. */
  setInput(sink: InputSink | null, wants?: InputWants): void {
    this.sink = sink;
    this.wants = sink !== null ? wants : undefined;
  }

  setEditable(spec: EditableSpec | null): void {
    if (spec === null) { editCallbacks.delete(this.id); emit(OP.EDIT, this.id, null); return; }
    editCallbacks.set(this.id, spec);
    emit(OP.EDIT, this.id, {
      multiline: spec.multiline === true, spellcheck: spec.spellcheck !== false,
      wrap: spec.wrap !== false, padding: spec.padding ?? 0,
      value: spec.value ?? "", placeholder: spec.placeholder ?? "",
      // An editable carries its OWN style — the DOM backend styles the element
      // from `spec.style`, not from the surface's text style. Leaving it out made
      // every field fall back to the default face, which is why the Viewer's
      // code editor was proportional where the DOM's was monospace.
      style: {
        family: spec.style.fontFamily, size: spec.style.fontSize,
        weight: spec.style.fontWeight, italic: spec.style.italic === true,
        color: spec.style.color === null ? null : colorToCss(spec.style.color),
        align: spec.style.align ?? "left",
        letterSpacing: spec.style.letterSpacing ?? 0,
      },
    });
  }
  activateEditable(active: boolean): void { emit(OP.EDITFOCUS, this.id, active ? 1 : 0); }

  insertChild(child: Surface, before: Surface | null): void {
    const c = child as MacSurface;
    const b = before as MacSurface | null;
    if (c.parent !== null) {
      const i = c.parent.children.indexOf(c);
      if (i >= 0) c.parent.children.splice(i, 1);
    }
    const at = b === null ? this.children.length : Math.max(0, this.children.indexOf(b));
    this.children.splice(at, 0, c);
    c.parent = this;
    emit(OP.INSERT, this.id, c.id, b === null ? -1 : b.id);
  }

  destroy(): void {
    if (this.parent !== null) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
      this.parent = null;
    }
    scrollers.delete(this);       // a destroyed scroller must not be swept
    richCallbacks.delete(this.id);
    editCallbacks.delete(this.id);
    surfaces.delete(this.id);
    emit(OP.DESTROY, this.id);
  }

  // ── the scene model: extent, hit, scroll (the canvas walk, natively) ──────

  /** Content extent for scrolling: the furthest child bottom. */
  /** The DOM's `scrollHeight`: where the content ends, descendants included
   *  (see contentExtentX for why the walk has to go deeper than the children). */
  /** A windowed block's LOGICAL extent — the DOM backend's strut, as a floor.
   *
   *  A virtualized collection materializes ~a viewport of rows, so the walk
   *  below measures the WINDOW and the scroller's range would cover only the
   *  rows currently realized: dragging the thumb to the end lands mid-collection.
   *  The DOM realizes the floor as an inert zero-width strut child whose height
   *  IS the range; there is no reason to fake a child here, because the extent
   *  is computed rather than measured — a floor says the same thing directly.
   *  `null` clears it (the block stopped virtualizing). */
  /** ROOT only (backend.ts): the App's reactive content extent. The DOM
   *  realizes this by GROWING the root element along each declared scroll
   *  axis — an enclosing island's `overflow: auto` then scrolls it. The
   *  native mirror is realizeSize: an embedded root's box grows the same
   *  way, so the island's extent walk sees the range AND the content below
   *  the fold is actually there to reveal. Top level it is moot — the root
   *  has no parent surface and nothing grows. */
  private pageExtentW = 0;
  private pageExtentH = 0;
  setPageExtent(w: number, h: number): void {
    if (w === this.pageExtentW && h === this.pageExtentH) return;
    this.pageExtentW = w;
    this.pageExtentH = h;
    this.realizeSize();
    // Same republish rule as setVirtualExtent: the range only crosses the
    // bridge on a SCROLLPOS, so push it at the scroller that owns this root.
    for (let sc: MacSurface | null = this.parent; sc !== null; sc = sc.parent) {
      if (!sc.scrolls) continue;
      emit(OP.SCROLLPOS, sc.id, sc.scrollOffset, sc.contentExtent());
      break;
    }
  }

  private virtualExtent: number | null = null;
  setVirtualExtent(h: number | null): void {
    if (h === this.virtualExtent) return;
    this.virtualExtent = h;
    // Push the fresh range at the scroller that owns it, so the scrollbar
    // re-sizes now rather than at the next scroll — the extent only crosses the
    // bridge on a SCROLLPOS, and a windowed list may never be scrolled at all
    // before the user grabs the bar.
    for (let sc: MacSurface | null = this.parent; sc !== null; sc = sc.parent) {
      if (!sc.scrolls) continue;
      emit(OP.SCROLLPOS, sc.id, sc.scrollOffset, sc.contentExtent());
      break;
    }
  }

  contentExtent(): number {
    let max = 0;
    for (const c of this.children) {
      if (!c.visible) continue;
      let ch = c.height;
      if (!c.boxClip && c.clipData === null && !c.scrolls) ch = Math.max(ch, c.contentExtent());
      const b = c.y + ch;
      if (b > max) max = b;
    }
    return this.virtualExtent !== null ? Math.max(max, this.virtualExtent) : max;
  }

  /** Hit-test a point in this surface's parent coordinates. The canvas
   *  backend's walk, kept identical so the two renderers resolve the same
   *  target for the same point: scale inverted, shape clip subtracted (only
   *  ignoreclip children survive outside it), scroll frame corrected,
   *  children probed in reverse paint order, then this surface's own sink. */
  hit(px: number, py: number): HitTarget | null {
    // OPACITY IS PAINT, NOT PRESENCE (the canvas walk's ruling, mirrored): a
    // fully transparent view is still hittable — the press-catcher idiom — and
    // the opacity gate this walk carried made the native host disagree with
    // both other renderers. The gates are `visible` and `pointerEvents`.
    if (!this.visible) return null;
    // `pointerEvents = "none"` makes THIS view pointer-transparent; it does
    // NOT seal the subtree. Descend anyway and let each child answer for
    // itself — the DOM reference's behavior, since dom-backend gives any view
    // carrying a sink `pointer-events: auto` and an explicit value beats an
    // inherited one. Sealing here made the documented "full-viewport chrome
    // overlay" hold nothing interactive, which is why the Inspector's own
    // window works on the web and could never work natively.
    // MEASURED (transparent root; an `auto` panel and a plain handler-bearing
    // child): before DOM 1/101, canvas 0/0, mac 0/0 — after, all three 1/101.

    let lx = px - this.x;
    let ly = py - this.y;
    [lx, ly] = this.invertTransform(lx, ly);
    const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
    const clipped = this.clipData !== null || this.boxClip;
    if (clipped && !this.insideClip(lx, ly)) {
      const cyx = this.scrolls ? ly + this.scrollOffset : ly;
      const cxx = this.scrollsX ? lx + this.scrollXOffset : lx;
      for (let i = this.children.length - 1; i >= 0; i--) {
        const c = this.children[i];
        if (!c.ignoresClip) continue;
        const t = c.hit(cxx, cyx);
        if (t !== null) return t;
      }
      return null;
    }
    if ((this.scrolls || this.scrollsX) && !inBox) return null;
    const cy = this.scrolls ? ly + this.scrollOffset : ly;
    const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
    for (let i = this.children.length - 1; i >= 0; i--) {
      const t = this.children[i].hit(cx, cy);
      if (t !== null) return t;
    }
    // A pointer-transparent view is a corridor, not a target.
    if (this.sink !== null && inBox && this.pe !== "none") {
      return { key: this, sink: this.sink, ...this.wants, x: lx, y: ly,
               cursor: this.cursorStyle !== "" ? this.cursorStyle : undefined };
    }
    return null;
  }

  /** Inside this surface's clip? The box clip is the rounded box; a shape
   *  clip asks the host (Core Graphics owns the path) — cached per path so
   *  the walk stays cheap. */
  /** The cursor the pointer should show at a point.
   *
   *  NOT the same walk as hit(). On the web a cursor comes from CSS on
   *  whatever element is under the pointer, whether or not it takes events —
   *  the window's resize band is exactly that: eight strips that style a
   *  cursor and carry no handlers, sitting inside one halo that owns the
   *  press. Reading the cursor off the hit TARGET therefore found nothing, and
   *  the window edges showed no resize cursor at all. */
  cursorAt(px: number, py: number): string {
    if (!this.visible || this.opacity <= 0) return "";
    let lx = px - this.x;
    let ly = py - this.y;
    [lx, ly] = this.invertTransform(lx, ly);
    const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
    const clipped = this.clipData !== null || this.boxClip;
    if (clipped && !this.insideClip(lx, ly)) {
      for (let i = this.children.length - 1; i >= 0; i--) {
        const c = this.children[i];
        if (!c.ignoresClip) continue;
        const got = c.cursorAt(lx, ly);
        if (got !== "") return got;
      }
      return "";
    }
    if ((this.scrolls || this.scrollsX) && !inBox) return "";
    const cy = this.scrolls ? ly + this.scrollOffset : ly;
    const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
    for (let i = this.children.length - 1; i >= 0; i--) {
      const got = this.children[i].cursorAt(cx, cy);
      if (got !== "") return got;
    }
    return inBox ? this.cursorStyle : "";
  }

  /** Walk the tree the way hit() does, narrating each step. */
  trace(px: number, py: number, depth = 0): void {
    const pad = "  ".repeat(depth);
    const lx0 = px - this.x, ly0 = py - this.y;
    let lx = lx0, ly = ly0;
    [lx, ly] = this.invertTransform(lx, ly);
    const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
    const clipped = this.clipData !== null || this.boxClip;
    console.log(`${pad}#${this.id} box=${this.x},${this.y} ${this.width}x${this.height} local=${lx.toFixed(0)},${ly.toFixed(0)}`
      + ` vis=${this.visible} inBox=${inBox} clip=${clipped} ignoreclip=${this.ignoresClip}`
      + ` scrollsX=${this.scrollsX} sink=${this.sink !== null} kids=${this.children.length}`);
    if (!this.visible || this.opacity <= 0) { console.log(`${pad}  -> invisible, stop`); return; }
    if (clipped && !this.insideClip(lx, ly)) {
      console.log(`${pad}  -> outside own clip; only ignoreclip kids`);
      for (let i = this.children.length - 1; i >= 0; i--) {
        if (!this.children[i].ignoresClip) continue;
        this.children[i].trace(lx, ly, depth + 1);
      }
      return;
    }
    if ((this.scrolls || this.scrollsX) && !inBox) { console.log(`${pad}  -> scroller, point outside, stop`); return; }
    for (let i = this.children.length - 1; i >= 0; i--) this.children[i].trace(lx, ly, depth + 1);
  }

  private insideClip(lx: number, ly: number): boolean {
    if (this.clipData !== null) return pointInPath(this.clipData, lx, ly);
    return lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
  }

  // (`ownsPoint` lived here: scrollByX's "the topmost child containing the
  // point owns the gesture" rule. It had the right instinct about the leak and
  // the wrong test — a Declare window's chrome sits ABOVE its content, so
  // "contains the point" stops at a press catcher. Replaced by `scrollClaimed`,
  // which asks about scrollers instead, and now used by BOTH axes.)

  /** The wheel CLAIM walk (canvas-backend wheelTo, mirrored): descend to the
   *  view under the point and answer with the nearest `onWheel` CLAIMANT or
   *  the nearest scroller — whichever is deeper wins, the DOM's delegation
   *  (an intervening scroller keeps its wheel; a claimant with no nearer
   *  scroller hears the stream, trackpad pinch included). The transform
   *  inverse keeps a rotated subtree honest. Null = neither wants it. */
  wheelTo(px: number, py: number, deltaX: number, deltaY: number, pinch: boolean): "claimed" | "scroller" | null {
    if (!this.visible || this.opacity <= 0) return null;
    let lx = px - this.x;
    let ly = py - this.y;
    [lx, ly] = this.invertTransform(lx, ly);
    if ((this.clipData !== null || this.boxClip) && !this.insideClip(lx, ly)) return null;
    const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
    if ((this.scrolls || this.scrollsX) && !inBox) return null;
    const cy = this.scrolls ? ly + this.scrollOffset : ly;
    const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
    for (let i = this.children.length - 1; i >= 0; i--) {
      const c = this.children[i];
      const r = c.wheelTo(c.ignoresScroll ? lx : cx, c.ignoresScroll ? ly : cy, deltaX, deltaY, pinch);
      if (r !== null) return r;
    }
    if (this.wants?.wantsWheel === true && this.sink !== null && inBox) {
      this.sink("wheel", lx, ly, { deltaX, deltaY, pinch });
      return "claimed";
    }
    return (this.scrolls || this.scrollsX) && inBox ? "scroller" : null;
  }

  /** Route a HORIZONTAL wheel delta to the innermost surface that scrolls on
   *  that axis. A trackpad reports both deltas and the DOM routes each to
   *  whichever ancestor scrolls that way; only the vertical half existed here,
   *  so the Files strip could be revealed programmatically but never dragged. */
  scrollByX(px: number, py: number, dx: number): boolean {
    if (!this.visible || this.opacity <= 0) return false;
    let lx = px - this.x;
    let ly = py - this.y;
    [lx, ly] = this.invertTransform(lx, ly);
    const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
    if ((this.scrolls || this.scrollsX) && !inBox) return false;
    const cy = this.scrolls ? ly + this.scrollOffset : ly;
    const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
    for (let i = this.children.length - 1; i >= 0; i--) {
      if (this.children[i].scrollByX(cx, cy, dx)) return true;
      if (scrollClaimed) break;             // see `scrollClaimed`
    }
    if ((this.scrolls || this.scrollsX) && inBox) scrollClaimed = true;
    if (this.scrollsX && inBox) {
      const max = Math.max(0, this.contentExtentX() - this.width);
      const next = Math.min(max, Math.max(0, this.scrollXOffset + dx));
      if (next !== this.scrollXOffset) {
        this.scrollXOffset = next;
        emit(OP.SCROLLXPOS, this.id, next, this.contentExtentX());
        return true;
      }
      return max > 0;
    }
    return false;
  }

  /** Route a wheel delta to the innermost scrolling surface under the point
   *  (the canvas backend's scrollBy, verbatim + the op emit). */
  scrollBy(px: number, py: number, dy: number): boolean {
    if (!this.visible || this.opacity <= 0) return false;
    let lx = px - this.x;
    let ly = py - this.y;
    [lx, ly] = this.invertTransform(lx, ly);
    const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
    if ((this.scrolls || this.scrollsX) && !inBox) return false;
    const cy = this.scrolls ? ly + this.scrollOffset : ly;
    const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
    for (let i = this.children.length - 1; i >= 0; i--) {
      if (this.children[i].scrollBy(cx, cy, dy)) return true;
      // A SCROLLER UNDER THE POINT ENDS THE SIBLING SEARCH, whether or not it
      // could use this delta. See `scrollClaimed`.
      if (scrollClaimed) break;
    }
    if (this.scrolls || this.scrollsX) {
      if (inBox) scrollClaimed = true;      // this gesture is ours, siblings behind
    }
    if (this.scrolls && inBox) {
      const max = Math.max(0, this.contentExtent() - this.height);
      const next = Math.min(max, Math.max(0, this.scrollOffset + dy));
      if (next !== this.scrollOffset) {
        this.scrollOffset = next;
        this.onScrollCb?.(next);
        emit(OP.SCROLLPOS, this.id, next, this.contentExtent());
        return true;
      }
      return max > 0; // a scroller at its edge still owns the gesture
    }
    return false;
  }
}

// ── registries the host talks back through ──────────────────────────────────

const surfaces = new Map<number, MacSurface>();
const richCallbacks = new Map<number, { onResize: (h: number) => void; onLink: (href: string) => void }>();
const editCallbacks = new Map<number, EditableSpec>();
/** Surfaces carrying an embed marker (`slot`), for the host's island wiring. */
const embeds = new Map<number, string>();
/** The island View behind each of those surfaces — the target of the NAME
 *  channel back up from a mounted child (see setEmbed). */
interface IslandView { childName?: string }
const islandViews = new Map<number, IslandView>();

/** A surface's absolute origin in the ROOT app's coordinate space.
 *
 *  An embedded child needs this to convert the host's pointer into its own
 *  space — the web reads `host.getBoundingClientRect()` for exactly this, and
 *  natively there is no element to ask, so the surface tree answers instead.
 *  A scrolling ancestor shifts everything inside it, so its offset comes off
 *  the sum (the same arithmetic LayerTree.absY does). */
export function surfaceOrigin(id: number): [number, number] {
  const s = surfaces.get(id);
  if (s === undefined) return [0, 0];
  let x = s.x, y = s.y;
  for (let p = s.parent; p !== null; p = p.parent) {
    if (p.scrolls) y -= p.scrollOffset;
    if (p.scrollsX) x -= p.scrollXOffset;
    x += p.x; y += p.y;
  }
  return [x, y];
}

/** Publish a mounted child app's `appName` onto its island's `childName`.
 *
 *  The reverse of the `env` channel: the desktop's AppWindow titles itself by
 *  the child, so the Viewer's window is named for the file it is showing and
 *  follows in-app navigation. The DOM backend does this from one self-retiring
 *  rAF loop over the slot boxes; natively the island runner already has a
 *  per-tenant follow loop, so it calls this. */
export function publishChildName(islandId: number, name: string): void {
  const v = islandViews.get(islandId);
  if (v !== undefined && v.childName !== name) v.childName = name;
}

/** The island markers currently declared — the host mounts a child program
 *  into each (AppIsland), and re-reads because a slot is a constraint. */
export function embedsPending(): { id: number; slot: string }[] {
  const out: { id: number; slot: string }[] = [];
  for (const [id, slot] of embeds) out.push({ id, slot });
  return out;
}

/** The island VIEW behind a surface id — what the bridge links against
 *  (mac-boot's mountCompiled calls linkIslandTenant on it, so the native
 *  runner speaks the same `external` facts and post/onPost verbs as every
 *  other host; islands design, 2026-08-20). */
export function islandViewById(id: number): unknown {
  return islandViews.get(id);
}

/** Insert a child app's root surface into an island's surface. No coordinate
 *  sync and no second input router: the tenant is an ordinary subtree, so the
 *  paint and hit walks reach it exactly as they reach anything else. */
export function mountEmbed(islandId: number, childRoot: Surface): void {
  surfaces.get(islandId)?.insertChild(childRoot, null);
  // AN EMBEDDED APP'S ROOT KEEPS TO ITS FRAME AND NEVER SELF-SCROLLS — the
  // DOM's applyScrollStyle root branch, which fires for EVERY element stamped
  // data-declare-app, tenants included: the root wears `overflow: clip`, and
  // what scrolls is the ISLAND element (or an interior pane), never the root.
  // The native tenant root still carried its App-default `scrolls = y`, so a
  // stray offset on it (a location seek, a wheel that resolved to the root)
  // TRANSLATED THE WHOLE APP inside its island — measured: the Viewer's edit
  // pane sat 235px high, its editor overlay over the window title bar.
  const r = childRoot as MacSurface;
  r.scrolls = false;
  r.scrollsX = false;
  r.scrollOffset = 0;
  r.scrollXOffset = 0;
  emit(OP.SCROLLPOS, r.id, 0, 0);
  emit(OP.SCROLLXPOS, r.id, 0, 0);
  emit(OP.SCROLL, r.id, 0);
  emit(OP.SCROLLX, r.id, 0);
  r.appRoot = true;                  // keeps a later scrolls push from re-arming
  // …and KEEPS TO ITS FRAME: the other half of the root rule (the DOM's
  // `overflow: clip` on every data-declare-app element). Without it the island's
  // contentExtent recursion descends into the tenant and finds content that
  // deliberately overflows the app box — the desktop's wallpaper is drawn in a
  // 1920x1200 reference box, bottom at y=900 inside a 600-tall tenant — so the
  // island's scroll range ran 300px past the app into bare host ("scroll off
  // the bottom into white space"). A clipping child contains its own overflow,
  // which is exactly what an app root is supposed to do.
  r.setBoxClip(true);
  // The root attached — and pushed its frame and page extent — BEFORE this
  // stamp, so its realization was computed as a top-level root's (frame-tight).
  // Recompute now that it is embedded: a declared scroll axis grows the box to
  // the page extent (realizeSize), which is what the island scrolls over.
  r.realizeSize();
}

/** Tear down whatever tenant an island is already hosting.
 *
 *  `mountEmbed` INSERTS, so a remount used to stack a second copy of the app on
 *  top of the first — the Viewer changes its env when you switch Reader/Source,
 *  which is a remount, so its document ended up drawn two and three times over
 *  itself at different sizes. An island hosts one tenant; evicting the old one
 *  is part of mounting the new. */
export function clearEmbed(islandId: number): void {
  const s = surfaces.get(islandId);
  if (s === undefined) return;
  for (const c of [...s.children]) c.destroy();
}

/** The scene model for a surface id (the host reads box geometry to size a
 *  mounted tenant). */
export function surfaceById(id: number): { width: number; height: number } | null {
  return surfaces.get(id) ?? null;
}

/** A CHROME surface: host-owned, inserted as the root's last child so it paints
 *  and hit-tests above everything the running program has.
 *
 *  The native answer to the DOM's overlay host (`inspector-boot` appends a
 *  viewport-covering div beside the app). Nothing in the program declares this
 *  — it belongs to the host, which is what lets the Inspector be chrome ABOUT a
 *  program rather than something inside it. An app mounted into it reaches
 *  input by the ordinary walk, in the ordinary order: topmost first, falling
 *  through wherever the chrome states `pointerEvents = "none"`.
 *
 *  Returns null before a root is attached. `sizeOverlay` keeps it on the
 *  window; `dropOverlay` removes it. */
export function createOverlaySurface(): Surface | null {
  if (macRoot === null) return null;
  const s = new MacSurface();
  surfaces.set(s.id, s);
  s.setX(0); s.setY(0);
  s.setWidth(macRoot.width); s.setHeight(macRoot.height);
  macRoot.insertChild(s, null);
  return s;
}

/** The root's live box — an overlay tracks the window through it. */
export function rootBox(): { width: number; height: number } | null {
  return macRoot === null ? null : { width: macRoot.width, height: macRoot.height };
}

/** Shape-clip point testing. The host owns Core Graphics paths, so it answers
 *  — memoized per (path, point) round to keep the hover walk cheap. */
let pointInPathImpl: ((d: string, x: number, y: number) => boolean) | null = null;
export function provideHitPath(fn: (d: string, x: number, y: number) => boolean): void {
  pointInPathImpl = fn;
}
function pointInPath(d: string, x: number, y: number): boolean {
  return pointInPathImpl === null ? true : pointInPathImpl(d, x, y);
}

// ── the backend ─────────────────────────────────────────────────────────────

export class MacBackend implements RenderBackend {
  root: MacSurface | null = null;

  createSurface(): Surface {
    const s = new MacSurface();
    surfaces.set(s.id, s);
    return s;
  }

  /** No HTMLElement here: the "host" is the native window's root layer. The
   *  root surface is named to the Swift side, and input routing starts. */
  attachRoot(_host: unknown, root: Surface): void {
    const r = root as MacSurface;
    this.root = r;
    macRoot = r;
    emit(OP.ROOT, r.id);
    // THE APP-ROOT RULES, the native mirror of what both web attachRoots do
    // (dom-backend attachRoot / canvas Compositor.attach):
    //   • the page behind the app wears the app's own background, so the
    //     window's ground past a content-sized app matches the app instead of
    //     flashing the platform default — this alone was the ~90pt on every
    //     small-program fidelity score;
    //   • definitional containment — "every scroller, the App included, keeps
    //     to its frame" (docs/guide/05-space.md; the DOM realizes it as
    //     `overflow: clip` on the root element) — is applied by the host's
    //     ROOT handler, keyed on root-ness itself so no later clip push can
    //     clear it.
    // Root-grows-with-content (the page scrolling a too-tall app) is NOT yet
    // mirrored: the native window is the frame today.
    emit(OP.PAGEFILL, r.id, r.fillCss);
    routeInput(
      () => macRoot === r,
      (e) => {
        const ee = e as unknown as { clientX: number; clientY: number; type: string };
        const t = r.hit(ee.clientX, ee.clientY);
        if (ee.type === "pointermove") {
          const cur = r.cursorAt(ee.clientX, ee.clientY);
          if (cur !== lastCursor) { lastCursor = cur; emit(OP.CURSOR, 0, cur); }
        }
        if ((globalThis as unknown as { __declareHitDebug?: boolean }).__declareHitDebug === true
            && ee.type !== "pointermove") {
          console.log("[hit] " + ee.type + " @" + ee.clientX.toFixed(0) + "," + ee.clientY.toFixed(0)
            + " -> " + (t === null ? "null" : "id " + (t.key as unknown as { id: number }).id));
        }
        return t;
      },
      (e) => ({ x: (e as unknown as { clientX: number }).clientX, y: (e as unknown as { clientY: number }).clientY }),
      (t) => {
        // The cursor is set by the cursorAt walk on every move (see above);
        // hover changes only need to keep it in step when the target changes
        // without the pointer moving.
        void t;
        if ((globalThis as unknown as { __declareHitDebug?: boolean }).__declareHitDebug === true) {
          console.log("[hit] hover -> " + (t === null ? "null"
            : "id " + (t.key as unknown as { id: number }).id + " cursor=" + (t.cursor ?? "-")));
        }
      }
    );
  }
}

let macRoot: MacSurface | null = null;
let lastCursor = "";

// ── smooth reveal ───────────────────────────────────────────────────────────
//
// `scrollIntoView(..., true)` asks for the DOM's `behavior: "smooth"`, which
// the browser animates for us. Nothing animates it here, so a newly revealed
// Files column POPPED into place instead of sliding. Same easing the platform
// uses for a short programmatic scroll: ease-in-out over ~320ms.

const GLIDE_MS = 320;
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function glide(from: number, to: number, step: (v: number) => void): void {
  const t0 = Date.now();
  let ticks = 0;
  const tick = (): void => {
    const t = Math.min(1, (Date.now() - t0) / GLIDE_MS);
    ticks++;
    step(from + (to - from) * ease(t));
    if (t < 1) requestAnimationFrame(tick);
    else if ((globalThis as unknown as { __declareHitDebug?: boolean }).__declareHitDebug === true) {
      console.log(`[glide] ${from.toFixed(0)} -> ${to.toFixed(0)} in ${ticks} frames`);
    }
  };
  requestAnimationFrame(tick);
}

function glideX(sc: MacSurface, to: number): void {
  glide(sc.scrollXOffset, to, (v) => {
    sc.scrollXOffset = v;
    emit(OP.SCROLLXPOS, sc.id, v, sc.contentExtentXPublic());
    flushOps();
  });
}

function glideY(sc: MacSurface, to: number): void {
  glide(sc.scrollOffset, to, (v) => {
    sc.setScrollOffset(v);
    emit(OP.SCROLLPOS, sc.id, v, sc.contentExtent());
    flushOps();
  });
}

// ── the host→JS entry points (called from Swift) ────────────────────────────

/** Set a NAMED surface's scroll offset — the scrollbar drag.
 *
 *  Dragging a thumb is not a wheel gesture: it addresses one specific scroller,
 *  the one the thumb belongs to. Routing it as a delta at a point would re-run
 *  the geometric wheel walk and could land on a nested scroller that happens to
 *  sit under the bar. The clamp is the same one every other write uses, so the
 *  offset stays inside the content however far the pointer is dragged. */
export function macScrollTo(id: number, y: number, x: number | null = null): void {
  const s = surfaces.get(id);
  if (s === undefined) return;
  let moved = false;
  if (s.scrolls) {
    const max = Math.max(0, s.contentExtent() - s.height);
    const next = Math.min(max, Math.max(0, y));
    if (next !== s.scrollOffset) {
      s.setScrollOffset(next);                    // sets the field AND notifies
      emit(OP.SCROLLPOS, s.id, next, s.contentExtent());
      moved = true;
    }
  }
  if (x !== null && s.scrollsX) {
    const maxX = Math.max(0, s.contentExtentXPublic() - s.width);
    const nextX = Math.min(maxX, Math.max(0, x));
    if (nextX !== s.scrollXOffset) {
      s.scrollXOffset = nextX;
      emit(OP.SCROLLXPOS, s.id, nextX, s.contentExtentXPublic());
      moved = true;
    }
  }
  if (moved) flushOps();
}

/** Narrate the hit walk at a point — a diagnostic for "nothing is hittable here". */
export function macTraceHit(x: number, y: number): void {
  const t = macRoot?.hit(x, y) ?? null;
  console.log(`[trace] === hit walk at ${x},${y} -> `
    + (t === null ? "NOTHING" : `id ${(t.key as unknown as { id: number }).id} cursor=${t.cursor ?? "-"}`)
    + ` (cursorAt="${macRoot?.cursorAt(x, y) ?? ""}") ===`);
  macRoot?.trace(x, y);
}

/** Did the walk pass a scroller that CONTAINS the point — whether or not it
 *  could use this delta?
 *
 *  The scroll walks answer one boolean, "did anything move", and that conflated
 *  two different facts. A subtree that declines a delta is not the same as a
 *  subtree the gesture was never over, and the sibling loop needs the second:
 *
 *    THE LEAK. In the desktop, windows overlap, so one point is inside two of
 *    them. A horizontal two-finger gesture over the Files column strip scrolled
 *    the strip sideways — and its small vertical component walked straight past
 *    the front window (whose only scroller there is horizontal, so it moved
 *    nothing for a dy) into the window BEHIND, and scrolled that. One gesture,
 *    two windows. Both scrollers are `inBox`, so the inBox guards cannot catch
 *    it: the front window is simply visited first and declines.
 *
 *    THE FIRST FIX WAS WORSE. Stopping at the topmost child that CONTAINS the
 *    point looks like the DOM's rule and breaks ordinary scrolling: a Declare
 *    window carries decorative siblings ABOVE its content — measured in the
 *    Markdown window as #319 (a full-bleed press catcher over the scroller) and
 *    #309 (the frame) — so the search stopped at a chrome layer and the pane
 *    behind it never scrolled at all.
 *
 *  So the rule is narrower, and it is about SCROLLERS rather than about
 *  ownership: the first scroller under the point claims the gesture against
 *  everything behind it. Chrome with nothing to scroll is passed straight
 *  through. And because this only ends the SIBLING loop, the delta still chains
 *  UP through ancestors — which is what keeps a vertical wheel over an X-only
 *  code block scrolling the page it sits in, exactly as a browser does.
 *
 *  Module-level rather than a return value: the walks are synchronous, single
 *  threaded, and re-entered per gesture, and the two public entries below own
 *  the reset. */
let scrollClaimed = false;

export function macScroll(x: number, y: number, dy: number, dx = 0): void {
  scrollClaimed = false;
  if (dy !== 0) macRoot?.scrollBy(x, y, dy);
  scrollClaimed = false;
  if (dx !== 0) macRoot?.scrollByX(x, y, dx);
  flushOps();
}

/** The wheel ENTRY (App.swift scrollWheel and magnify → `__declareWheel`):
 *  the claim walk first — the nearest `onWheel` view under the point hears
 *  the stream, `pinch` true for a trackpad magnify or a ctrl+wheel (the
 *  web's own spelling of desktop pinch, so `e.pinch` zoom math written for
 *  Chrome runs unchanged here) — then the scroller walk for whatever no
 *  claim took. This is the native host's half of gestures.md's desktop
 *  contract; before it, every wheel bypassed `onWheel` entirely. */
export function macWheel(x: number, y: number, dx: number, dy: number, pinch: boolean): void {
  if (macRoot?.wheelTo(x, y, dx, dy, pinch) !== "claimed") {
    // Reset per AXIS: each is a separate walk, and a claim made while routing
    // the vertical half must not cut the horizontal one short.
    scrollClaimed = false;
    if (dy !== 0) macRoot?.scrollBy(x, y, dy);
    scrollClaimed = false;
    if (dx !== 0) macRoot?.scrollByX(x, y, dx);
  }
  flushOps();
}
export function macRichHeight(id: number, h: number): void {
  surfaces.get(id)?.applyRichHeight(h);
}
export function macRichLink(id: number, href: string): void {
  richCallbacks.get(id)?.onLink(href);
}
export function macEditInput(id: number, value: string): void {
  editCallbacks.get(id)?.onInput?.(value);
}
export function macEditFocus(id: number, focused: boolean): void {
  const spec = editCallbacks.get(id);
  if (focused) spec?.onFocus?.(); else spec?.onBlur?.();
}
export function macEditEnter(id: number): void {
  editCallbacks.get(id)?.onEnter?.();
}
