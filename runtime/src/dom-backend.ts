// DOM render backend — the first implementation of the render seam.
//
// Each view becomes an absolutely-positioned <div>, nested to mirror the view
// tree, so a child's x/y are relative to its parent: the LZX coordinate model
// expressed directly in CSS, with no layout engine involved (layout is R7).
//
// R3 content, all native where the DOM is native: text is a real DOM text
// run (the browser's rasterizer, selection, a11y), an image is a real <img>
// (stretch expressed as CSS %, so it tracks the view box for free), clip is
// CSS clip-path, and group opacity is what CSS opacity already means. Only a
// recorded *drawing* rasterizes — into this view's own <canvas>, sized by
// the recording's bounds (their first consumer). Content elements are
// created on first use: a plain colored view stays one bare <div>.
//
// R5 input rides the browser's own hit-testing: surfaces are pointer-inert
// until a sink arrives (setInput flips pointer-events on), content elements
// stay inert (hits are box-geometry, like the canvas walk), and resolution
// is target → nearest sinked surface; the pairing/click rule is shared
// (input.ts), so both backends decide clicks identically.

import type { EditableSpec, InputSink, RenderBackend, Stretch, Surface } from "./backend.js";
import { colorToCss, isGradient, type Fill, type Shadow, type Stroke } from "./value.js";
import { boxBounds, paintBox, type BoxState } from "./boxpaint.js";
import { fontMetrics, fontString, cssWeight, type TextStyle } from "./measure.js";
import { replay, type DisplayList } from "./draw.js";
import { onDprChange } from "./dpr.js";
import { routeInput } from "./input.js";

/** Style a native editable element to match the view's painted text metrics, so
 *  the caret and glyphs sit exactly where the static measure would place them. */
function applyEditStyle(el: HTMLElement, st: TextStyle): void {
  const s = el.style;
  s.fontFamily = st.fontFamily;
  s.fontSize = st.fontSize + "px";
  s.fontWeight = cssWeight(st.fontWeight);
  s.letterSpacing = st.letterSpacing === 0 ? "normal" : st.letterSpacing + "px";
  s.color = colorToCss(st.color);
  const m = fontMetrics(fontString(st));
  s.lineHeight = m.ascent + m.descent + "px";
}

/** Element → its surface's input sink. Setting a sink is also what flips the
 *  element's pointer-events on, so membership here and native hit-testability
 *  are the same fact. Module-level (not per-backend) because DomBackend is
 *  stateless; a WeakMap adds no lifetime. */
const SINKS = new WeakMap<HTMLElement, InputSink>();

export class DomBackend implements RenderBackend {
  createSurface(): Surface {
    return new DomSurface();
  }

  attachRoot(host: HTMLElement, root: Surface): void {
    // Every surface is absolutely positioned (see DomSurface), so the tree
    // needs a positioned ancestor to anchor to; otherwise the root would
    // position against the viewport instead of `host` on a plain (static)
    // host element. Only touch it if the caller hasn't already opted into
    // a positioning scheme of their own.
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    const rootEl = (root as DomSurface).element;
    // Views are a painted UI, not a document: a press-drag (event drag, and any
    // future gesture) must not start a native text/element selection. Suppress
    // it once at the root — `user-select` inherits, so every view div is covered
    // (editable fields opt back IN, see setEditable). `touch-action: none` is
    // the same intent for touch: the app owns the gesture, not the browser.
    rootEl.style.userSelect = "none";
    (rootEl.style as CSSStyleDeclaration & { webkitUserSelect: string }).webkitUserSelect = "none";
    rootEl.style.touchAction = "none";
    host.appendChild(rootEl);
    // Input: the browser's own hit-test picks the target (only sinked
    // surface elements accept pointer events — everything else is
    // pointer-inert, see DomSurface), so resolution is just "walk up to the
    // nearest surface with a sink and localize the point to its box". The
    // pairing/click rule is the shared router's (input.ts).
    routeInput(
      () => rootEl.isConnected,
      (e) => {
        let el = e.target instanceof HTMLElement && rootEl.contains(e.target) ? e.target : null;
        while (el !== null && !SINKS.has(el)) el = el === rootEl ? null : el.parentElement;
        if (el === null) return null;
        const r = el.getBoundingClientRect();
        return { key: el, sink: SINKS.get(el)!, x: e.clientX - r.left, y: e.clientY - r.top };
      },
      (e) => {
        const r = rootEl.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      }
    );
  }
}

class DomSurface implements Surface {
  readonly element: HTMLDivElement;
  private textEl: HTMLSpanElement | null = null;
  private editEl: HTMLInputElement | HTMLTextAreaElement | null = null;
  private edit: EditableSpec | null = null;
  private imgEl: HTMLImageElement | null = null;
  private drawEl: HTMLCanvasElement | null = null;
  private drawing: DisplayList | null = null;
  private stretch: Stretch = "none";
  /** The box's retained paint state — the same BoxState the Canvas walk
   *  keeps, because with `cornerRadius > 0` the box RASTERIZES through the
   *  shared painter (boxEl below) instead of brushing CSS. `fillV` keeps the
   *  raw Fill for the CSS branch's gradient string. */
  private readonly box: BoxState = {
    width: 0, height: 0, fill: null, gradient: null, cornerRadius: 0, stroke: null, shadow: null,
  };
  private fillV: Fill = null;
  /** The per-view box raster (created only while cornerRadius > 0 — the
   *  measured CSS-unstable case; see boxpaint.ts). First in content order:
   *  the box paints beneath image/drawing/text, like the Canvas walk. */
  private boxEl: HTMLCanvasElement | null = null;
  /** Set once a raster has ever existed (arms the dpr watch exactly once). */
  private watching = false;
  private gone = false;

  constructor() {
    const el = document.createElement("div");
    const s = el.style;
    // Absolute + a zeroed box so x/y/width/height map 1:1 to the view's
    // geometry; each surface is a positioning context for its children.
    s.position = "absolute";
    s.left = "0px";
    s.top = "0px";
    s.margin = "0";
    s.padding = "0";
    s.border = "0";
    s.boxSizing = "border-box";
    // Input is opt-in (setInput): a surface without a sink must be
    // transparent to the pointer, exactly like the canvas hit walk skipping
    // a sink-less view, so the native hit-test and the walk resolve the
    // same target for the same point.
    s.pointerEvents = "none";
    this.element = el;
  }

  setX(v: number): void { this.element.style.left = v + "px"; }
  setY(v: number): void { this.element.style.top = v + "px"; }

  setWidth(v: number): void {
    this.element.style.width = v + "px";
    this.box.width = v;
    if (this.boxEl !== null) this.rasterizeBox(); // the raster is box-sized
  }

  setHeight(v: number): void {
    this.element.style.height = v + "px";
    this.box.height = v;
    if (this.boxEl !== null) this.rasterizeBox();
  }

  // ── Box decoration: CSS properties as PAINT PRIMITIVES where they are
  // MEASURED pixel-stable against the shared box painter — flat and square
  // (background, linear-gradient, the inset ring, box-shadow, blurred and
  // translucent included) — and the shared painter ITSELF, rasterized into a
  // per-view canvas, the moment cornerRadius > 0 (Chrome's border-radius
  // corner AA diverges from path AA by up to ~80/255 — the ruled fallback:
  // per-view rasterization wherever a CSS paint primitive proves
  // pixel-unstable). Either way the value painted is always the one resolved
  // value the attribute system produced — no selector, no cascade, no CSS
  // *model* anywhere. Cross-backend identity is pinned by the suite.

  setFill(f: Fill): void {
    this.fillV = f;
    if (isGradient(f)) {
      this.box.gradient = f;
      this.box.fill = null;
    } else {
      this.box.gradient = null;
      this.box.fill = f === null ? null : colorToCss(f);
    }
    this.decorate();
  }

  setCornerRadius(r: number): void {
    // Rounds the painted box only — children are never clipped, matching
    // the recorded lean and the walk.
    this.box.cornerRadius = r;
    this.decorate();
  }

  setStroke(st: Stroke | null): void {
    this.box.stroke = st;
    this.decorate();
  }

  setShadow(sh: Shadow | null): void {
    this.box.shadow = sh;
    this.decorate();
  }

  /** Route the box paint: rounded → the shared raster; square → CSS. One
   *  CSS property carries the square drop shadow AND the inside border (an
   *  inset zero-blur ring — a CSS `border` would shift absolutely-positioned
   *  children by its width, so it is never used). */
  private decorate(): void {
    const s = this.element.style;
    if (this.box.cornerRadius > 0) {
      s.background = "";
      s.boxShadow = "";
      this.rasterizeBox();
      return;
    }
    if (this.boxEl !== null) {
      this.boxEl.remove();
      this.boxEl = null;
    }
    const f = this.fillV;
    s.background = isGradient(f)
      ? `linear-gradient(${f.angle}deg, ${f.stops
          .map((st) => colorToCss(st.color) + (st.offset === null ? "" : ` ${st.offset * 100}%`))
          .join(", ")})`
      : colorToCss(f);
    const parts: string[] = [];
    const sh = this.box.shadow;
    if (sh !== null) parts.push(`${sh.dx}px ${sh.dy}px ${sh.blur}px ${colorToCss(sh.color)}`);
    const st = this.box.stroke;
    if (st !== null) parts.push(`inset 0 0 0 ${st.width}px ${colorToCss(st.color)}`);
    s.boxShadow = parts.join(", ");
  }

  /** Rasterize the box through the SHARED painter (boxpaint.ts) into the
   *  per-view box canvas, sized by the paint's conservative bounds (the box
   *  plus its shadow's reach) at the current devicePixelRatio — exactly the
   *  drawing raster's discipline below. */
  private rasterizeBox(): void {
    if (this.boxEl === null) {
      const c = document.createElement("canvas");
      c.style.position = "absolute";
      c.style.pointerEvents = "none"; // content is inert — hits are box-geometry
      this.placeContent(c); // first: the box paints beneath all other content
      this.boxEl = c;
      this.watchDpr();
    }
    const c = this.boxEl;
    const b = boxBounds(this.box);
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.ceil(b.w * dpr));
    const h = Math.max(1, Math.ceil(b.h * dpr));
    c.width = w;
    c.height = h;
    c.style.left = b.x + "px";
    c.style.top = b.y + "px";
    c.style.width = w / dpr + "px";
    c.style.height = h / dpr + "px";
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, -b.x * dpr, -b.y * dpr);
    paintBox(ctx, this.box, null);
  }

  /** Arm the shared dpr watch once (rasters must stay crisp across zoom /
   *  display moves; text and <img> re-render natively and need nothing). */
  private watchDpr(): void {
    if (this.watching) return;
    this.watching = true;
    onDprChange(
      () => !this.gone,
      () => {
        if (this.drawEl !== null) this.rasterize();
        if (this.boxEl !== null) this.rasterizeBox();
      }
    );
  }

  setVisible(v: boolean): void { this.element.style.display = v ? "" : "none"; }

  setOpacity(o: number): void {
    this.element.style.opacity = String(o);
    // opacity 0 prunes the subtree for input, like the canvas walk (its
    // paint/hit cull). CSS opacity alone still hit-tests, and pointer-events
    // doesn't inherit past an explicitly-sinked descendant — visibility
    // does, and paints identically (nothing, either way).
    this.element.style.visibility = o <= 0 ? "hidden" : "";
  }

  setClip(d: string | null): void {
    // clip-path clips native hit-testing along with the pixels, so the
    // clipped-away part of an interactive box falls through — the same
    // subtraction the canvas walk's isPointInPath makes.
    this.element.style.clipPath = d === null ? "" : `path("${d}")`;
  }

  setInput(sink: InputSink | null): void {
    if (sink !== null) {
      SINKS.set(this.element, sink);
      this.element.style.pointerEvents = "auto";
    } else {
      SINKS.delete(this.element);
      this.element.style.pointerEvents = "none";
    }
  }

  setEditable(spec: EditableSpec | null): void {
    if (spec === null) {
      this.editEl?.remove();
      this.editEl = null;
      this.edit = null;
      return;
    }
    const tag = spec.multiline ? "textarea" : "input";
    let el = this.editEl;
    if (el === null || el.tagName.toLowerCase() !== tag) {
      el?.remove();
      el = document.createElement(tag) as HTMLInputElement | HTMLTextAreaElement;
      const s = el.style;
      // Fill the surface box; transparent so the view's own box paint shows
      // through, and interactive (it IS the editable). No native chrome.
      s.position = "absolute";
      s.left = "0";
      s.top = "0";
      s.width = "100%";
      s.height = "100%";
      s.margin = "0";
      s.padding = "0";
      s.border = "0";
      s.boxSizing = "border-box";
      s.background = "transparent";
      s.outline = "none";
      // An editable opts back INTO selection (the root turned it off); the
      // caret/selection is the whole point of a text field.
      s.userSelect = "text";
      (s as CSSStyleDeclaration & { webkitUserSelect: string }).webkitUserSelect = "text";
      s.touchAction = "auto";
      (s as CSSStyleDeclaration & { resize: string }).resize = "none";
      s.pointerEvents = "auto";
      const self = el;
      el.addEventListener("input", () => this.edit?.onInput(self.value));
      el.addEventListener("focus", () => this.edit?.onFocus());
      el.addEventListener("blur", () => this.edit?.onBlur());
      el.addEventListener("keydown", (e) => {
        if (!(this.edit?.multiline ?? false) && (e as KeyboardEvent).key === "Enter") this.edit?.onEnter?.();
      });
      this.element.appendChild(el);
      this.editEl = el;
    }
    this.edit = spec;
    if (el.value !== spec.value) el.value = spec.value; // guard: don't reset the caret on an echo
    (el as HTMLInputElement).placeholder = spec.placeholder;
    applyEditStyle(el, spec.style);
  }

  activateEditable(active: boolean): void {
    if (this.editEl === null) return;
    if (active) this.editEl.focus();
    else this.editEl.blur();
  }

  setText(text: string): void {
    this.textRun().textContent = text;
  }

  setTextStyle(st: TextStyle): void {
    const s = this.textRun().style;
    s.fontFamily = st.fontFamily;
    s.fontSize = st.fontSize + "px";
    s.fontWeight = cssWeight(st.fontWeight);
    s.letterSpacing = st.letterSpacing === 0 ? "normal" : st.letterSpacing + "px";
    s.color = colorToCss(st.color);
    const sh = st.shadow ?? null;
    s.textShadow = sh === null ? "" : `${sh.dx}px ${sh.dy}px ${sh.blur}px ${colorToCss(sh.color)}`;
    // Pin the first baseline to the font ascent: a line-height of exactly
    // ascent+descent leaves no half-leading, so DOM text and the Canvas
    // backend's fillText(…, ascent) place identical glyph geometry.
    const m = fontMetrics(fontString(st));
    s.lineHeight = m.ascent + m.descent + "px";
  }

  /** The text run element, created on first use. A positioned <span> — not a
   *  bare text node — so it paints in element order with the other content
   *  (in-flow text would paint *under* positioned siblings), matching the
   *  Canvas walk's content order. */
  private textRun(): HTMLSpanElement {
    if (this.textEl === null) {
      const el = document.createElement("span");
      const s = el.style;
      s.position = "absolute";
      s.left = "0";
      s.top = "0";
      s.whiteSpace = "pre"; // a run never wraps (wrap semantics: open question)
      // Content is pointer-inert (here and for img/drawing below): the hit
      // region is the view's geometry BOX, so a glyph run overflowing an
      // explicit box can't grow it — keeping DOM hits identical to the
      // canvas walk's box test. (Native text selection goes with this;
      // it returns via a future `selectable` attribute — HANDOFF §R5.)
      s.pointerEvents = "none";
      this.placeContent(el, this.boxEl, this.imgEl, this.drawEl);
      this.textEl = el;
    }
    return this.textEl;
  }

  /** Insert a content element at its slot in the fixed content paint order —
   *  box raster, image, drawing, text, then child surfaces (the Canvas
   *  walk's order) —
   *  by anchoring after the last present content element that precedes it
   *  (or at the very front). Appending would be wrong for content that
   *  arrives LATE: an <img> lands asynchronously on load, after the child
   *  surfaces attached, and must not cover them (found by neoweather's
   *  topBar, whose bitmap covered the zip Text child). */
  private placeContent(el: HTMLElement, ...prior: (HTMLElement | null)[]): void {
    let anchor: ChildNode | null = this.element.firstChild;
    for (const p of prior) {
      if (p !== null) anchor = p.nextSibling;
    }
    this.element.insertBefore(el, anchor);
  }

  setImage(image: HTMLImageElement | null): void {
    this.imgEl?.remove();
    this.imgEl = image;
    if (image !== null) {
      const s = image.style;
      s.position = "absolute";
      s.left = "0";
      s.top = "0";
      s.pointerEvents = "none"; // content is inert — hits are box-geometry
      this.applyStretch();
      this.placeContent(image, this.boxEl);
    }
  }

  setImageStretch(stretch: Stretch): void {
    this.stretch = stretch;
    if (this.imgEl !== null) this.applyStretch();
  }

  /** `100%` tracks the view box natively (a later resize costs no image
   *  bookkeeping); the un-stretched axis is pinned to the NATURAL dimension —
   *  CSS `auto` would preserve the intrinsic ratio and drag it along with the
   *  stretched axis, which is not what a single-axis stretch means (the
   *  canvas walk draws the un-stretched axis at natural size; found by
   *  neoweather's `stretches=width` tab art). The element is always loaded
   *  when it crosses the seam, so the natural size is known. */
  private applyStretch(): void {
    const img = this.imgEl!;
    const s = img.style;
    s.width = this.stretch === "width" || this.stretch === "both" ? "100%" : `${img.naturalWidth}px`;
    s.height = this.stretch === "height" || this.stretch === "both" ? "100%" : `${img.naturalHeight}px`;
  }

  setDrawing(list: DisplayList | null): void {
    this.drawing = list;
    if (list === null || list.bounds === null) {
      this.drawEl?.remove();
      this.drawEl = null;
      return;
    }
    if (this.drawEl === null) {
      const c = document.createElement("canvas");
      c.style.position = "absolute";
      c.style.pointerEvents = "none"; // content is inert — hits are box-geometry
      this.placeContent(c, this.boxEl, this.imgEl);
      this.drawEl = c;
      this.watchDpr();
    }
    this.rasterize();
  }

  /** Rasterize the recording into this view's canvas, sized to the bounds at
   *  the current devicePixelRatio; CSS size is derived from the backing
   *  store so device pixels map 1:1. */
  private rasterize(): void {
    const c = this.drawEl!;
    const b = this.drawing!.bounds!;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.ceil(b.w * dpr));
    const h = Math.max(1, Math.ceil(b.h * dpr));
    c.width = w;
    c.height = h;
    c.style.left = b.x + "px";
    c.style.top = b.y + "px";
    c.style.width = w / dpr + "px";
    c.style.height = h / dpr + "px";
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, -b.x * dpr, -b.y * dpr);
    replay(ctx, this.drawing!);
  }

  insertChild(child: Surface, before: Surface | null): void {
    // insertBefore both parents and MOVES an existing child — exactly the
    // seam's contract; null appends.
    this.element.insertBefore(
      (child as DomSurface).element,
      before === null ? null : (before as DomSurface).element
    );
  }

  destroy(): void {
    this.gone = true; // quiets any armed dpr listener
    this.element.remove();
  }
}
