// Canvas render backend — the second implementation of the render seam, and
// the proof that the seam is real: the same View tree renders here or in the
// DOM backend with zero changes to View/Node (APPROACH §4).
//
// Own-pixels model: the whole tree rasterizes into ONE shared <canvas>.
// Surfaces are lightweight retained-state nodes and a Compositor repaints the
// scene back-to-front (painter's algorithm) on a dirty bit +
// requestAnimationFrame: any burst of changes coalesces into a single
// scheduled paint, and an idle tree burns zero CPU.
//
// The composite walk (R3, per the ruled rendering model): parent state —
// transform, clip, alpha — is applied here, at composite time, never baked
// into content, so a move / re-clip / fade is re-composition only. Group
// opacity (ruled at R1): a translucent surface composites its subtree as one
// unit through an offscreen layer, exactly CSS `opacity`'s meaning, so the
// two backends agree even when children overlap their parent. Recorded
// drawings replay directly into the shared ctx; text is fillText on the
// shared metrics (measure.ts); images are drawImage of the loaded element.
//
// The LZX canvas kernel (../runtime/lfc-src/kernel/canvas/) was read for
// intent — one shared surface, a dirty-bit rAF scheduler, dpr in a base
// transform, and (R5) the reverse painter's-walk hit test — and rewritten
// fresh: no z-sorting (tree order is paint order until a z attribute
// exists), no Flash colortransform/frames, no rotation/scale inverses, no
// capability probing, no per-sprite `clickable` state (interactivity is the
// seam's sink, derived from declared handlers).

import { DeclareError } from "./errors.js";
import type { EditableSpec, InputSink, RenderBackend, Stretch, Surface } from "./backend.js";
import { colorToCss, isGradient, type Fill, type Gradient, type Shadow, type Stroke } from "./value.js";
import { paintBox, realizeGradient } from "./boxpaint.js";
import { cssWeight, fontMetrics, fontString, textWidth, wrapLines, type TextStyle } from "./measure.js";
import { replay, type DisplayList } from "./draw.js";
import { onDprChange } from "./dpr.js";
import { routeInput, type HitTarget } from "./input.js";

/** Style a native editable overlay to match the view's painted text metrics, so
 *  its caret and glyphs align with the static-text measure (measure.ts). */
function applyCanvasEditStyle(el: HTMLElement, st: TextStyle): void {
  const s = el.style;
  s.fontFamily = st.fontFamily;
  s.fontSize = st.fontSize + "px";
  s.fontWeight = cssWeight(st.fontWeight);
  s.letterSpacing = st.letterSpacing === 0 ? "normal" : st.letterSpacing + "px";
  s.color = colorToCss(st.color);
  const m = fontMetrics(fontString(st));
  s.lineHeight = m.ascent + m.descent + "px";
}

/** An identity-transform scratch context for Path2D point tests: the
 *  compositor's own ctx carries the dpr transform (which would rescale the
 *  path under isPointInPath), so clip hit-testing gets a context where path
 *  space and point space are the same local space. Lazy — a clip-free app
 *  (and the Node-importable surface) never creates it. */
let scratch: CanvasRenderingContext2D | null = null;
const hitCtx = (): CanvasRenderingContext2D =>
  (scratch ??= document.createElement("canvas").getContext("2d")!);

export class CanvasBackend implements RenderBackend {
  private readonly compositor = new Compositor();

  createSurface(): Surface {
    return new CanvasSurface(this.compositor);
  }

  attachRoot(host: HTMLElement, root: Surface): void {
    this.compositor.attach(host, root as CanvasSurface);
  }
}

/** The scene owner: the one shared <canvas>, the dirty-bit + rAF paint
 *  scheduler, and devicePixelRatio handling. Surfaces only ever call
 *  `invalidate()`; nothing else about how pixels reach the screen leaks out. */
class Compositor {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private root: CanvasSurface | null = null;
  /** The page host — the parent of both the canvas and the native editable
   *  overlays (Layer 3), so an overlay's absolute coordinates share the
   *  canvas's origin. */
  private host: HTMLElement | null = null;
  /** Surfaces with a live native editable overlay: repositioned each paint so
   *  the overlay tracks a moving/animating ancestor. */
  private readonly editables = new Set<CanvasSurface>();
  /** Pending requestAnimationFrame handle; 0 = no paint scheduled. */
  private frame = 0;

  hostElement(): HTMLElement | null {
    return this.host;
  }
  registerEditable(s: CanvasSurface): void {
    this.editables.add(s);
  }
  unregisterEditable(s: CanvasSurface): void {
    this.editables.delete(s);
  }

  attach(host: HTMLElement, root: CanvasSurface): void {
    if (this.canvas !== null) {
      throw new DeclareError("a CanvasBackend hosts one tree — use a fresh backend per render");
    }
    const canvas = document.createElement("canvas");
    canvas.style.display = "block"; // no inline-baseline gap inside the host
    // A painted UI, not a document: a press-drag must not start a native
    // selection of the canvas/page (editable overlays opt back in themselves).
    canvas.style.userSelect = "none";
    (canvas.style as CSSStyleDeclaration & { webkitUserSelect: string }).webkitUserSelect = "none";
    canvas.style.touchAction = "none";
    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new DeclareError("Canvas 2D is unavailable in this browser");
    this.canvas = canvas;
    this.ctx = ctx;
    this.root = root;
    this.host = host;
    // Native editable overlays (Layer 3) are absolutely positioned within the
    // host; make it a positioning context so their coordinates share the
    // canvas's origin. (A no-op if the host is already positioned.)
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    host.appendChild(canvas);
    // Editables that registered during the attach walk (before this host
    // existed) can now mount their overlay elements.
    for (const s of [...this.editables]) s.remountEditable();
    // Even an idle tree must re-rasterize crisply when the user zooms or
    // moves the window between displays; a destroyed root ends the watch.
    onDprChange(
      () => this.canvas !== null,
      () => this.invalidate()
    );
    // Input: own pixels means own hit-testing — resolution is the scene
    // walk (CanvasSurface.hit); the pairing/click rule is the shared
    // router's (input.ts). Events cost nothing while none arrive.
    routeInput(
      () => this.canvas !== null,
      (e) => {
        if (this.canvas === null || this.root === null) return null;
        const r = this.canvas.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        if (x < 0 || y < 0 || x >= r.width || y >= r.height) return null;
        return this.root.hit(x, y);
      },
      (e) => {
        const r = this.canvas!.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      }
    );
    // Tap-to-dismiss for native editable overlays: a pointerdown that lands on the
    // CANVAS is by definition outside every overlay (they are separate sibling
    // elements), so blur the focused field — mobile Safari won't drop it (and the
    // keyboard) on a tap of non-focusable pixels the way desktop does.
    canvas.addEventListener("pointerdown", () => {
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA") &&
        host.contains(active)
      ) {
        active.blur();
      }
    });
    // Wheel → the scrolling surface under the pointer (own pixels means own
    // scroll); the clamp uses the content extent, and the compositor repaints.
    canvas.addEventListener("wheel", (e) => {
      if (this.canvas === null || this.root === null) return;
      const r = this.canvas.getBoundingClientRect();
      if (this.root.scrollBy(e.clientX - r.left, e.clientY - r.top, e.deltaY)) {
        e.preventDefault();
        this.invalidate();
      }
    }, { passive: false });
    this.invalidate();
  }

  /** Request a repaint. Every change since the last frame coalesces into one
   *  scheduled requestAnimationFrame; with a paint already pending — or before
   *  attach, whose first paint covers everything — this is a no-op, so an
   *  idle or unattached tree costs nothing. */
  invalidate(): void {
    if (this.frame !== 0 || this.ctx === null) return;
    this.frame = requestAnimationFrame(this.paint);
  }

  /** A destroyed root takes the canvas (and any pending frame) with it;
   *  destroying any other surface just repaints the scene without it. */
  destroyed(surface: CanvasSurface): void {
    if (surface !== this.root) {
      this.invalidate();
      return;
    }
    if (this.frame !== 0) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.canvas?.remove();
    this.canvas = null; // also quiets the dpr watch
    this.ctx = null;
    this.root = null;
    this.editables.clear();
    this.host = null;
  }

  private readonly paint = (): void => {
    this.frame = 0;
    const { canvas, ctx, root } = this;
    if (canvas === null || ctx === null || root === null) return;
    // Backing store = the root's logical size × devicePixelRatio; the CSS box
    // stays logical. Re-derived every paint, so a root resize or a dpr change
    // (browser zoom, moving to another display) re-rasterizes crisply. All
    // painting happens in logical coordinates — dpr lives entirely in this
    // base transform. (Resizing the backing store also resets ctx state.)
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(0, Math.round(root.width * dpr));
    const h = Math.max(0, Math.round(root.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = root.width + "px";
      canvas.style.height = root.height + "px";
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    root.paint(ctx);
    // Glue each native editable overlay to its surface's on-screen box (Layer
    // 3) — after paint, so an animating ancestor's new position is reflected.
    for (const e of this.editables) e.reposition();
  };
}

/** One view's retained visual state in the scene. A setter stores the value
 *  and invalidates the compositor — nothing draws eagerly; the next frame's
 *  paint walk reads everything back. */
class CanvasSurface implements Surface {
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  /** A solid fill pre-resolved to a canvas fillStyle (null = none) — the
   *  R1 fast path; a gradient fill is retained as data and realized per
   *  paint (its geometry depends on the box). Together with cornerRadius/
   *  stroke/shadow these fields ARE the shared BoxState (boxpaint.ts) —
   *  non-private so the surface passes itself to the one shared painter. */
  fill: string | null = null;
  gradient: Gradient | null = null;
  cornerRadius = 0;
  stroke: Stroke | null = null;
  shadow: Shadow | null = null;
  /** The rounded box path, rebuilt lazily when geometry/radius change. */
  private box: Path2D | null = null;
  visible = true;
  opacity = 1;
  /** Uniform scale about (pivotX, pivotY) in this surface's own coordinates;
   *  1 = identity. Applied in the paint walk and inverted in the hit walk. */
  scaleK = 1;
  pivotX = 0;
  pivotY = 0;
  scrolls = false;
  scrollOffset = 0;
  private onScrollCb: ((y: number) => void) | null = null;
  parent: CanvasSurface | null = null;
  readonly children: CanvasSurface[] = [];

  private clipData: string | null = null;
  /** The BOX-clip (`clip = true`): clip to the surface's own (rounded) box.
   *  A first-class mode, not a baked rect path — the box is read at use time,
   *  so an animating width/height tracks without a re-derive. */
  private boxClip = false;
  /** Backend-retained cache of the clip path (never recording state);
   *  rebuilt lazily so setClip stays legal before any canvas exists. For the
   *  box-clip it caches the rounded-box Path2D, invalidated on geometry/
   *  radius change. */
  private clipPath: Path2D | null = null;

  /** The effective clip as a Path2D: an explicit shape clip, or — for the
   *  box-clip — the surface's own box, rounded by cornerRadius (matching the
   *  DOM backend, where `overflow: clip` follows border-radius). Null =
   *  unclipped. */
  private clipPathObj(): Path2D | null {
    if (this.clipData !== null) {
      this.clipPath ??= new Path2D(this.clipData);
      return this.clipPath;
    }
    if (this.boxClip) {
      if (this.clipPath === null) {
        const p = new Path2D();
        const r = Math.min(this.cornerRadius, this.width / 2, this.height / 2);
        if (r > 0) p.roundRect(0, 0, this.width, this.height, r);
        else p.rect(0, 0, this.width, this.height);
        this.clipPath = p;
      }
      return this.clipPath;
    }
    return null;
  }
  private drawing: DisplayList | null = null;
  private text = "";
  /** Text style pre-resolved at set time — the paint walk does zero
   *  measuring or formatting. */
  private font = "";
  private textFill = "";
  private textGradient: Gradient | null = null;
  private ascent = 0;
  /** The natural line height (ascent+descent) — the wrapped-line stride, and
   *  what the DOM backend sets as `line-height`, so multi-line agrees. */
  private lineHeight = 0;
  private textShadow: Shadow | null = null;
  private letterSpacing = 0;
  /** Wrapping (set-time): whether this run wraps within `width`, its alignment,
   *  and the cached line break — recomputed when text/style/width change so the
   *  paint walk stays measure-free after the first frame. */
  private wrap = false;
  private align: "left" | "center" | "right" = "left";
  private textLines: string[] | null = null;
  private image: HTMLImageElement | null = null;
  private stretch: Stretch = "none";
  /** The view's input route; null = transparent to the pointer (hit walk). */
  private sink: InputSink | null = null;
  /** The native editable overlay (Layer 3), a DOM element over the canvas; null
   *  = this surface is not an editable text field. */
  private editEl: HTMLInputElement | HTMLTextAreaElement | null = null;
  private edit: EditableSpec | null = null;

  constructor(private readonly compositor: Compositor) {}

  setX(v: number): void { this.x = v; this.compositor.invalidate(); }
  setY(v: number): void { this.y = v; this.compositor.invalidate(); }
  setWidth(v: number): void { this.width = v; this.box = null; this.textLines = null; if (this.boxClip) this.clipPath = null; this.compositor.invalidate(); }
  setHeight(v: number): void { this.height = v; this.box = null; if (this.boxClip) this.clipPath = null; this.compositor.invalidate(); }
  setVisible(v: boolean): void { this.visible = v; this.compositor.invalidate(); }
  setOpacity(o: number): void { this.opacity = o; this.compositor.invalidate(); }
  setScale(scale: number, px: number, py: number): void {
    this.scaleK = scale; this.pivotX = px; this.pivotY = py; this.compositor.invalidate();
  }

  setFill(f: Fill): void {
    if (isGradient(f)) {
      this.gradient = f;
      this.fill = null;
    } else {
      this.gradient = null;
      this.fill = f === null ? null : colorToCss(f);
    }
    this.compositor.invalidate();
  }

  setCornerRadius(r: number): void {
    this.cornerRadius = r;
    this.box = null;
    if (this.boxClip) this.clipPath = null;
    this.compositor.invalidate();
  }

  setStroke(st: Stroke | null): void {
    this.stroke = st;
    this.compositor.invalidate();
  }

  setShadow(sh: Shadow | null): void {
    this.shadow = sh;
    this.compositor.invalidate();
  }

  setClip(d: string | null): void {
    this.clipData = d;
    this.clipPath = null;
    this.compositor.invalidate();
  }

  setBoxClip(on: boolean): void {
    this.boxClip = on;
    this.clipPath = null;
    this.compositor.invalidate();
  }

  setDrawing(list: DisplayList | null): void {
    this.drawing = list;
    this.compositor.invalidate();
  }

  setText(text: string): void {
    this.text = text;
    this.textLines = null;
    this.compositor.invalidate();
  }

  setTextStyle(st: TextStyle): void {
    this.font = fontString(st);
    this.textFill = colorToCss(st.color);
    this.textGradient = st.textFill != null && isGradient(st.textFill) ? st.textFill : null;
    const fm = fontMetrics(this.font);
    this.ascent = fm.ascent;
    this.lineHeight = fm.ascent + fm.descent;
    this.textShadow = st.shadow ?? null;
    this.letterSpacing = st.letterSpacing;
    this.wrap = st.wrap ?? false;
    this.align = st.align ?? "left";
    this.textLines = null;
    this.compositor.invalidate();
  }

  setImage(image: HTMLImageElement | null): void {
    this.image = image;
    this.compositor.invalidate();
  }

  setImageStretch(stretch: Stretch): void {
    this.stretch = stretch;
    this.compositor.invalidate();
  }

  setInput(sink: InputSink | null): void {
    this.sink = sink; // input state changes no pixels — no invalidate
  }

  setEditable(spec: EditableSpec | null): void {
    if (spec === null) {
      this.editEl?.remove();
      this.editEl = null;
      this.edit = null;
      this.compositor.unregisterEditable(this);
      return;
    }
    const host = this.compositor.hostElement();
    const tag = spec.multiline ? "textarea" : "input";
    let el = this.editEl;
    if (host !== null && (el === null || el.tagName.toLowerCase() !== tag)) {
      el?.remove();
      el = document.createElement(tag) as HTMLInputElement | HTMLTextAreaElement;
      const s = el.style;
      // A transparent overlay over the shared canvas, absolutely positioned in
      // the host (reposition() glues it to the surface box each frame).
      s.position = "absolute";
      s.margin = "0";
      s.padding = "0";
      s.border = "0";
      s.boxSizing = "border-box";
      s.background = "transparent";
      s.outline = "none";
      // The editable is selectable even though the canvas is not — the caret
      // and selection are the field's whole purpose.
      s.userSelect = "text";
      (s as CSSStyleDeclaration & { webkitUserSelect: string }).webkitUserSelect = "text";
      s.touchAction = "auto";
      (s as CSSStyleDeclaration & { resize: string }).resize = "none";
      const self = el;
      el.addEventListener("input", () => this.edit?.onInput(self.value));
      el.addEventListener("focus", () => this.edit?.onFocus());
      el.addEventListener("blur", () => this.edit?.onBlur());
      el.addEventListener("keydown", (e) => {
        if (!(this.edit?.multiline ?? false) && (e as KeyboardEvent).key === "Enter") this.edit?.onEnter?.();
      });
      host.appendChild(el);
      this.editEl = el;
    }
    this.edit = spec;
    if (el !== null) {
      if (el.value !== spec.value) el.value = spec.value; // guard the caret against an echo
      (el as HTMLInputElement).placeholder = spec.placeholder;
      applyCanvasEditStyle(el, spec.style);
    }
    this.compositor.registerEditable(this);
    this.reposition();
  }

  activateEditable(active: boolean): void {
    if (this.editEl === null) return;
    if (active) this.editEl.focus();
    else this.editEl.blur();
  }

  /** Re-apply the retained editable spec — used by the compositor once the host
   *  exists, since a TextInput's setEditable runs during the attach walk, before
   *  attachRoot stores the host (so no element could be created then). */
  remountEditable(): void {
    if (this.edit !== null) this.setEditable(this.edit);
  }

  /** Glue the overlay to the surface's on-screen box: accumulate x/y up the
   *  parent chain (canvas-logical coordinates ARE host CSS pixels — dpr lives
   *  in the paint transform, not here) and hide it if any ancestor is
   *  invisible. Called each paint by the compositor so it tracks motion. */
  reposition(): void {
    const el = this.editEl;
    if (el === null) return;
    let shown = true;
    // Accumulate this surface's absolute position AND clip the overlay to every
    // clipping ancestor — the native twin of the DOM backend, where the field is
    // a real descendant of the clip-path'd ancestor and is clipped for free. A
    // canvas overlay is a host-level sibling that the compositor's ctx.clip never
    // touches, so without this a collapsed/scrolled-away clip leaks its field.
    // ax/ay run up to the absolute origin; ox/oy track this surface's origin in
    // the CURRENT ancestor's local space so each box clip maps into ours.
    let ax = 0;
    let ay = 0;
    // Clip rect, in THIS surface's own local coordinates (∞ = unclipped).
    let clipL = -Infinity;
    let clipT = -Infinity;
    let clipR = Infinity;
    let clipB = Infinity;
    let clipped = false;
    for (let s: CanvasSurface | null = this; s !== null; s = s.parent) {
      if (!s.visible) shown = false;
      if (s.clipData !== null || s.boxClip) {
        // Every calendar clip is a box (clip=true → rect(0,0,width,height)); an
        // ancestor's box, expressed in this surface's local space, is [-ax..width-ax].
        clipped = true;
        if (-ax > clipL) clipL = -ax;
        if (-ay > clipT) clipT = -ay;
        if (s.width - ax < clipR) clipR = s.width - ax;
        if (s.height - ay < clipB) clipB = s.height - ay;
      }
      ax += s.x;
      ay += s.y;
    }
    const st = el.style;
    st.left = ax + "px";
    st.top = ay + "px";
    st.width = this.width + "px";
    st.height = this.height + "px";
    // Visible slice = the overlay box ∩ the accumulated clip; empty ⇒ fully
    // clipped away (hide it, like the DOM field vanishing behind clip-path).
    if (clipped) {
      const visL = Math.max(0, clipL);
      const visT = Math.max(0, clipT);
      const visR = Math.min(this.width, clipR);
      const visB = Math.min(this.height, clipB);
      if (visR <= visL || visB <= visT) {
        shown = false;
        st.clipPath = "";
      } else {
        st.clipPath = `inset(${visT}px ${this.width - visR}px ${this.height - visB}px ${visL}px)`;
      }
    } else {
      st.clipPath = "";
    }
    st.display = shown ? "" : "none";
  }

  /** Hit-test (px,py) — given in the PARENT's space, mirroring paint's
   *  transform — against this subtree: children front-to-back (reverse
   *  paint order), then self. Prunes exactly what paint prunes (invisible,
   *  alpha 0, outside the clip), so a view is hittable iff it is paintable.
   *  Returns the topmost surface that accepts input (has a sink) and
   *  contains the point in its geometry box: ink — drawings, image pixels,
   *  glyphs — neither extends nor perforates the hit region, and a sink-less
   *  surface is transparent, so both backends resolve identically (the DOM
   *  keeps content elements pointer-inert for the same reason). */
  hit(px: number, py: number): HitTarget | null {
    if (!this.visible || this.opacity <= 0) return null;
    let lx = px - this.x;
    let ly = py - this.y;
    if (this.scaleK !== 1) {
      // Invert the paint transform so the point lands in the subtree's own
      // (unscaled) coordinates — a scaled view stays clickable where drawn.
      lx = (lx - this.pivotX) / this.scaleK + this.pivotX;
      ly = (ly - this.pivotY) / this.scaleK + this.pivotY;
    }
    const cpHit = this.clipPathObj();
      if (cpHit !== null && !hitCtx().isPointInPath(cpHit, lx, ly)) return null;
    // A scroll container clips to its box and offsets its content — hit-test
    // children in the SAME frame the paint walk draws them.
    const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
    if (this.scrolls && !inBox) return null;
    const cy = this.scrolls ? ly + this.scrollOffset : ly;
    for (let i = this.children.length - 1; i >= 0; i--) {
      const t = this.children[i].hit(lx, cy);
      if (t !== null) return t;
    }
    if (this.sink !== null && inBox) {
      return { key: this, sink: this.sink, x: lx, y: ly };
    }
    return null;
  }

  setScroll(on: boolean, onScroll: (y: number) => void): void {
    this.scrolls = on;
    this.onScrollCb = on ? onScroll : null;
    if (!on) this.scrollOffset = 0;
  }

  // Horizontal scroll is a DOM-backend affordance for now (code blocks); the canvas
  // compositor's x-scroll is a later addition, so this is a no-op here (over-wide
  // content simply isn't clipped on canvas — the docs render on DOM).
  setScrollX(_on: boolean): void {}

  // Native rich-text flow is a DOM affordance; on canvas the RichText component lays
  // the runs out as child views itself. -1 signals "not handled, fall back".
  setRichContent(): number { return -1; }

  /** Reveal a heading anchor inside a flow (location.md §6). On canvas there is no
   *  element to scroll — the flow gave us the heading's y offset (`within`) inside
   *  this surface, so reveal is a `scrollIntoView` clamped to that offset. `within`
   *  < 0 means the flow hasn't laid the heading out yet — not handled. `slug` is
   *  the DOM path's key; here the offset already resolved it. */
  revealRichAnchor(_slug: string, within: number): boolean {
    if (within < 0) return false;
    this.scrollIntoView(within);
    return true;
  }

  /** Scroll this surface to the top of its nearest scrolling ancestor — the
   *  canvas twin of DOM's native scrollIntoView. Sums local offsets up to the
   *  scroll container, clamps to its content extent (the same math scrollBy
   *  uses), sets the offset, mirrors it into `scrollY`, and repaints. `within` (px)
   *  targets a point INSIDE this surface (a heading's offset) instead of its top.
   *  "nearest" scrolls the minimum distance that reveals the surface — nothing
   *  when it is already visible (the keyboard traversal's reveal). */
  scrollIntoView(align: "start" | "nearest" | number = 0): void {
    const within = typeof align === "number" ? align : 0;
    let cur: CanvasSurface = this;
    let off = 0;
    while (cur.parent !== null && !cur.parent.scrolls) { off += cur.y; cur = cur.parent; }
    const sc = cur.parent;
    if (sc === null) return;                 // nothing scrolls above us
    off += cur.y + within;                   // cur is the scroll container's direct child
    let extent = 0;
    for (const c of sc.children) if (c.visible) extent = Math.max(extent, c.y + c.height);
    const max = Math.max(0, extent - sc.height);
    let next = Math.min(max, Math.max(0, off));
    if (align === "nearest") {
      const top = sc.scrollOffset, bottom = top + sc.height;
      if (off >= top && off + this.height <= bottom) return;   // already visible
      next = off < top ? Math.max(0, off) : Math.min(max, off + this.height - sc.height);
    }
    if (next !== sc.scrollOffset) {
      sc.scrollOffset = next;
      sc.onScrollCb?.(next);
      this.compositor.invalidate();
    }
  }

  // Canvas has no per-view DOM element to mark — foreign embedding is DOM-only
  // (the editable-demo host runs on the DOM backend; canvas is parked).
  setEmbed(_id: string): void {}

  /** Route a wheel delta to the innermost scrolling surface under (px,py) in
   *  PARENT-local space; true when consumed. Mirrors hit's transform so it
   *  targets exactly what the user sees; the compositor requests the repaint. */
  scrollBy(px: number, py: number, dy: number): boolean {
    if (!this.visible || this.opacity <= 0) return false;
    const lx = px - this.x;
    const ly = py - this.y;
    const cpScroll = this.clipPathObj();
      if (cpScroll !== null && !hitCtx().isPointInPath(cpScroll, lx, ly)) return false;
    const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
    if (this.scrolls && !inBox) return false;
    const cy = this.scrolls ? ly + this.scrollOffset : ly;
    for (let i = this.children.length - 1; i >= 0; i--) {
      if (this.children[i].scrollBy(lx, cy, dy)) return true;
    }
    if (this.scrolls && inBox) {
      let extent = 0;
      for (const c of this.children) if (c.visible) extent = Math.max(extent, c.y + c.height);
      const max = Math.max(0, extent - this.height);
      const next = Math.min(max, Math.max(0, this.scrollOffset + dy));
      if (next !== this.scrollOffset) {
        this.scrollOffset = next;
        this.onScrollCb?.(next);
      }
      return true;
    }
    return false;
  }

  insertChild(child: Surface, before: Surface | null): void {
    const c = child as CanvasSurface;
    const existing = this.children.indexOf(c);
    if (existing >= 0) this.children.splice(existing, 1); // a re-insert is a move
    c.parent = this;
    const at = before === null ? -1 : this.children.indexOf(before as CanvasSurface);
    this.children.splice(at < 0 ? this.children.length : at, 0, c);
    this.compositor.invalidate();
  }

  destroy(): void {
    this.editEl?.remove();
    this.editEl = null;
    this.compositor.unregisterEditable(this);
    if (this.parent !== null) {
      const siblings = this.parent.children;
      siblings.splice(siblings.indexOf(this), 1);
      this.parent = null;
    }
    this.compositor.destroyed(this);
  }

  /** Composite this surface: position, clip, then paint the subtree — the
   *  ancestor transform/clip/alpha stack applied here, at composite time
   *  (rendering model rule 3). Fully opaque (the common case) paints
   *  directly; translucent composites through an offscreen layer for group
   *  semantics. An invisible or fully transparent surface prunes its
   *  subtree. */
  paint(ctx: CanvasRenderingContext2D): void {
    if (!this.visible || this.opacity <= 0) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.scaleK !== 1) {
      ctx.translate(this.pivotX, this.pivotY);
      ctx.scale(this.scaleK, this.scaleK);
      ctx.translate(-this.pivotX, -this.pivotY);
    }
    const cpPaint = this.clipPathObj();
      if (cpPaint !== null) ctx.clip(cpPaint);
    if (this.opacity < 1) this.paintLayer(ctx);
    else this.paintContent(ctx);
    ctx.restore();
  }

  /** Group opacity: the subtree paints opaquely into a layer sharing the
   *  target's device size and transform, then lands in one drawImage at this
   *  opacity — an identity-transform, pixel-aligned blit (no resampling)
   *  that still honors the ambient clip. The cost exists only where
   *  translucency does; sizing layers to subtree bounds and pooling them are
   *  later policy work (free dimensions — rendering model). */
  private paintLayer(ctx: CanvasRenderingContext2D): void {
    const target = ctx.canvas;
    if (target.width === 0 || target.height === 0) return;
    const layer = document.createElement("canvas");
    layer.width = target.width;
    layer.height = target.height;
    const lctx = layer.getContext("2d")!;
    lctx.setTransform(ctx.getTransform());
    this.paintContent(lctx);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = this.opacity;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }

  /** Paint order: box (shadow, fill, inside border), image, drawing, text,
   *  then children — the same content order the DOM backend's element order
   *  produces. */
  private paintContent(ctx: CanvasRenderingContext2D): void {
    this.paintBox(ctx);
    if (this.image !== null) {
      const st = this.stretch;
      const w = st === "width" || st === "both" ? this.width : this.image.naturalWidth;
      const h = st === "height" || st === "both" ? this.height : this.image.naturalHeight;
      ctx.drawImage(this.image, 0, 0, w, h);
    }
    if (this.drawing !== null) replay(ctx, this.drawing);
    if (this.text !== "" && this.font !== "") {
      ctx.font = this.font;
      // A gradient text-fill is realized over the view box, so multi-line runs
      // share one continuous ramp (like the DOM's background-clip:text).
      ctx.fillStyle = this.textGradient !== null
        ? realizeGradient(ctx, this.textGradient, this.width, this.height)
        : this.textFill;
      ctx.textBaseline = "alphabetic";
      // Tracking (canvas-native) — set for this run, reset after so the shared
      // ctx stays neutral for siblings/children.
      const lsCtx = ctx as unknown as { letterSpacing: string };
      if (this.letterSpacing !== 0) lsCtx.letterSpacing = this.letterSpacing + "px";
      const sh = this.textShadow;
      let restoreShadow = false;
      if (sh !== null) {
        // The glyph shadow paints beneath its own glyphs (CSS text-shadow's
        // meaning — canvas shadows do exactly this). Offsets/blur live in
        // DEVICE space (untransformed by the CTM), so scale by the walk's
        // transform (translate+scale only — m.a/m.d are the axis scales).
        const m = ctx.getTransform();
        ctx.save();
        ctx.shadowColor = colorToCss(sh.color);
        ctx.shadowOffsetX = sh.dx * m.a;
        ctx.shadowOffsetY = sh.dy * m.d;
        ctx.shadowBlur = sh.blur * m.a;
        restoreShadow = true;
      }
      if (this.wrap && this.width > 0) {
        // Wrapping: break at the set-time-cached points and stack the lines at
        // the shared stride (the DOM backend's `line-height`), aligning each
        // within the box. The greedy breaker (measure.ts) is the one BOTH
        // backends share, so the DOM's native wrap and this agree.
        if (this.textLines === null) {
          this.textLines = wrapLines(this.text, this.font, this.width, this.letterSpacing);
        }
        const lines = this.textLines;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          let x = 0;
          if (this.align !== "left") {
            const lw = textWidth(line, this.font, this.letterSpacing);
            x = this.align === "center" ? (this.width - lw) / 2 : this.width - lw;
          }
          ctx.fillText(line, x, this.ascent + i * this.lineHeight);
        }
      } else {
        // A single (non-wrapping) run still honors alignment: the DOM backend
        // sets width:100% + text-align for a non-left run, centering/ending the
        // line within the box. Mirror that — measure the line and offset x by
        // the same rule the wrap branch uses, so both backends place identical
        // glyph geometry. (align=left keeps x=0, the shrink-to-content case.)
        let x = 0;
        if (this.align !== "left" && this.width > 0) {
          const lw = textWidth(this.text, this.font, this.letterSpacing);
          x = this.align === "center" ? (this.width - lw) / 2 : this.width - lw;
        }
        ctx.fillText(this.text, x, this.ascent);
      }
      if (restoreShadow) ctx.restore();
      if (this.letterSpacing !== 0) lsCtx.letterSpacing = "0px";
    }
    if (this.scrolls) {
      // Scroll container: clip to the box and offset the content — the canvas
      // realization of native `overflow`. Siblings outside this surface are
      // untouched, so fixed chrome draws at its own coordinates: no reposition,
      // no jitter. (Mirror this transform in `hit` and `scrollBy`.)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.width, this.height);
      ctx.clip();
      ctx.translate(0, -this.scrollOffset);
      for (const child of this.children) child.paint(ctx);
      ctx.restore();
    } else {
      for (const child of this.children) child.paint(ctx);
    }
  }

  /** The box paint — the SHARED painter (boxpaint.ts; the DOM backend
   *  rasterizes the same code where CSS proved pixel-unstable). A plain
   *  solid box — the overwhelmingly common case — stays the single-fillRect
   *  fast path inside it; the surface's fields are the BoxState it reads,
   *  and the returned Path2D is the lazily-rebuilt box cache. */
  private paintBox(ctx: CanvasRenderingContext2D): void {
    this.box = paintBox(ctx, this, this.box);
  }
}
