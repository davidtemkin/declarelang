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
import { colorToCss, isGradient } from "./value.js";
import { routeInput } from "./input.js";
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
    ROTATE: 38,
};
function host() {
    const h = globalThis.__declareMacHost;
    if (h === undefined)
        throw new Error("mac backend: no host bridge installed");
    return h;
}
/** The op buffer. Batched per settle and flushed by the frame pump — one
 *  crossing per frame no matter how many attributes changed. */
const ops = [];
let flushScheduled = false;
function emit(op, id, ...args) {
    ops.push([op, id, ...args]);
    if (!flushScheduled) {
        flushScheduled = true;
        // The frame pump: rAF is the display link on the native side, so a flush
        // lands exactly once per displayed frame (never per attribute write).
        const raf = globalThis.requestAnimationFrame;
        if (typeof raf === "function")
            raf(flushOps);
        else
            queueMicrotask(flushOps);
    }
}
/** How many ops the current (unflushed) settle produced — benchmarks only. */
export function countOps() { return ops.length; }
/** The serialized size of the pending buffer, for measuring the crossing. */
export function peekOps() { return JSON.stringify(ops).length; }
export function flushOps() {
    flushScheduled = false;
    if (ops.length === 0)
        return;
    const json = JSON.stringify(ops);
    ops.length = 0;
    host().commit(json);
}
let nextId = 1;
// ── the surface ─────────────────────────────────────────────────────────────
/** One view's retained state. The fields are the SCENE MODEL (the same one the
 *  canvas backend keeps) — every setter both records the value and emits the
 *  op that mirrors it into the layer tree. */
class MacSurface {
    id = nextId++;
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
    onScrollCb = null;
    parent = null;
    children = [];
    ignoresClip = false;
    sink = null;
    /** What the view declared it wants (dbl / hold / touch) — see setInput. */
    wants = undefined;
    /** Shape clip (path data) and box clip — kept for the HIT walk, which must
     *  subtract exactly what the paint does. */
    clipData = null;
    boxClip = false;
    scrollsX = false;
    scrollXOffset = 0;
    /** Set when this surface hosts native rich content: its height is answered
     *  by the host's text layout, and its hit region is the box (the overlay
     *  owns interior selection). */
    richHeight = 0;
    constructor() {
        emit(OP.CREATE, this.id);
    }
    setX(v) { this.x = v; this.geom(); }
    setY(v) { this.y = v; this.geom(); }
    setWidth(v) { this.width = v; this.geom(); }
    setHeight(v) { this.height = v; this.geom(); }
    geom() { emit(OP.GEOM, this.id, this.x, this.y, this.width, this.height); }
    /** The last realized SOLID fill, as css — attachRoot reads it to paint the
     *  page behind a top-level app (the DOM/canvas attachRoot rule, mirrored).
     *  Solid fills only, exactly like the canvas mirror: a gradient app ground
     *  gets no page echo there either. */
    fillCss = null;
    setFill(fill) {
        if (isGradient(fill)) {
            const g = fill;
            this.fillCss = null;
            emit(OP.GRADIENT, this.id, { angle: g.angle, stops: g.stops.map((st) => [st.offset, colorToCss(st.color)]) });
        }
        else {
            this.fillCss = fill === null ? null : colorToCss(fill);
            emit(OP.FILL, this.id, this.fillCss);
        }
    }
    setCornerRadius(r) { emit(OP.RADIUS, this.id, r); }
    setStroke(s) {
        emit(OP.STROKE, this.id, s === null ? null : s.width, s === null ? null : colorToCss(s.color));
    }
    setShadow(sh) {
        if (sh === null)
            emit(OP.SHADOW, this.id, null);
        else
            emit(OP.SHADOW, this.id, sh.dx, sh.dy, sh.blur, colorToCss(sh.color));
    }
    setVisible(v) { this.visible = v; emit(OP.VISIBLE, this.id, v ? 1 : 0); }
    setOpacity(o) { this.opacity = o; emit(OP.OPACITY, this.id, o); }
    /** The schema token rides the wire verbatim; the Swift side maps it to a
     *  CIFilter for `layer.compositingFilter` (public on macOS — LayerTree
     *  case 35). A compositing filter rides the layer, not the order, so the
     *  restack/clipHost machinery is untouched. */
    setBlend(mode) { emit(OP.BLEND, this.id, mode); }
    /** The frost, natively (LayerTree case 36): the Swift side samples the
     *  layers beneath the node's padded region (CALayer.render(in:)), filters
     *  in encoded sRGB (the DrawReplay color-space precedent) and lands the
     *  result as a masked layer under the node's own fill. [blur, saturate]
     *  ride the wire; null clears. */
    setBackdrop(spec) {
        emit(OP.BACKDROP, this.id, spec === null ? null : spec.blur, spec === null ? 1 : spec.saturate);
    }
    setCursor(c) { this.cursorStyle = c; emit(OP.CURSOR, this.id, c); }
    /** No CSS pointer-events natively: the hit walk is ours, so an inert
     *  surface simply drops its sink (setInput(null)) — this is a no-op kept
     *  for protocol completeness. The carved-sink rule needs nothing here
     *  because nothing but our own walk ever hit-tests. */
    /** Consulted by hit() below — the walk decides, so the walk must know. */
    pe = "";
    setPointerEvents(mode) { this.pe = mode; }
    /** Rotation rides its own op; the pivot arrives via SCALE (the runtime
     *  always pushes both — view.ts pushTransform), and the Swift side folds
     *  both into one CATransform3D (applyScale). */
    setRotation(deg, _px, _py) {
        this.rotationDeg = deg;
        emit(OP.ROTATE, this.id, deg);
    }
    /** Invert the paint transform (scale, then rotation, about the shared
     *  pivot) — the hit/cursor/wheel walks' transform term, the same inverse
     *  interaction.ts toChildLocal applies (the ONE-WALK rule). */
    invertTransform(lx, ly) {
        if (this.scaleK === 1 && this.rotationDeg === 0)
            return [lx, ly];
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
    setScale(scale, px, py) {
        this.scaleK = scale;
        this.pivotX = px;
        this.pivotY = py;
        emit(OP.SCALE, this.id, scale, px, py);
    }
    setClip(pathData) {
        this.clipData = pathData;
        emit(OP.CLIP, this.id, pathData);
    }
    setBoxClip(on) {
        this.boxClip = on;
        emit(OP.BOXCLIP, this.id, on ? 1 : 0);
    }
    setIgnoreClip(on) {
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
    setIgnoreScroll(on) {
        emit(OP.IGNORESCROLL, this.id, on ? 1 : 0);
    }
    /** An app ROOT (top-level or an island tenant) — roots keep to their frame
     *  and never self-scroll (the DOM's applyScrollStyle root branch). Stamped by
     *  attachRoot / mountEmbed, which run AFTER attach's scrolls push — so the
     *  push guards on it for any later re-push. */
    appRoot = false;
    setScroll(on, onScroll) {
        if (this.appRoot && on)
            return; // a root never self-scrolls
        this.scrolls = on;
        this.onScrollCb = on ? onScroll : null;
        if (!on)
            this.scrollOffset = 0;
        emit(OP.SCROLL, this.id, on ? 1 : 0);
    }
    /** Horizontal scroll is not yet realized natively (code blocks clip). */
    setScrollX(on) {
        if (this.appRoot && on)
            return; // a root never self-scrolls
        // NOT deferred any more. The Files browser's column strip scrolls
        // HORIZONTALLY, and `scrollIntoView` on the DOM backend hands off to the
        // element's native one, which reveals on both axes. With this unimplemented
        // a newly opened column simply never slid into view.
        this.scrollsX = on;
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
    contentExtentXPublic() { return this.contentExtentX(); }
    /** Set the vertical offset and notify, for the smooth-reveal animation. */
    setScrollOffset(v) { this.scrollOffset = v; this.onScrollCb?.(v); }
    contentExtentX() {
        let w = 0;
        for (const c of this.children) {
            if (!c.visible)
                continue;
            let cw = c.width;
            if (!c.boxClip && c.clipData === null && !c.scrollsX)
                cw = Math.max(cw, c.contentExtentX());
            w = Math.max(w, c.x + cw);
        }
        return w;
    }
    /** Reveal this surface within its nearest HORIZONTALLY scrolling ancestor. */
    revealX(align, smooth = false) {
        let sc = this.parent;
        let left = this.x;
        while (sc !== null && !sc.scrollsX) {
            left += sc.x;
            sc = sc.parent;
        }
        if (sc === null)
            return;
        const right = left + this.width;
        const viewLeft = sc.scrollXOffset;
        const viewRight = viewLeft + sc.width;
        let next = sc.scrollXOffset;
        // `nearest` is CSSOM's minimal-scroll rule, which Chrome realizes: nothing
        // when the target is visible; nothing when it already COVERS the viewport;
        // and for a target WIDER than the viewport, align the near edge — the
        // minimal move — never the far one.
        if (align === "start")
            next = left;
        else if (left < viewLeft && right > viewRight) { /* covers the viewport */ }
        else if (left < viewLeft)
            next = this.width > sc.width ? right - sc.width : left;
        else if (right > viewRight)
            next = this.width > sc.width ? left : right - sc.width;
        const max = Math.max(0, sc.contentExtentX() - sc.width);
        next = Math.min(max, Math.max(0, next));
        if (next !== sc.scrollXOffset) {
            if (smooth)
                glideX(sc, next);
            else {
                sc.scrollXOffset = next;
                emit(OP.SCROLLXPOS, sc.id, next, sc.contentExtentX());
            }
        }
    }
    setText(text) { emit(OP.TEXT, this.id, text); }
    setTextStyle(style) {
        emit(OP.TEXTSTYLE, this.id, {
            family: style.fontFamily, size: style.fontSize, weight: style.fontWeight,
            italic: style.italic === true, color: style.color === null ? null : colorToCss(style.color),
            // A gradient text-fill: the DOM clips a background to the glyphs and the
            // canvas realizes the same ramp over the box, so the host is handed the
            // ramp itself and clips it to the glyph outlines.
            fillGradient: style.textFill != null && isGradient(style.textFill)
                ? { angle: style.textFill.angle,
                    stops: style.textFill.stops.map((st) => [st.offset, colorToCss(st.color)]) }
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
    setDrawing(list) {
        emit(OP.DRAW, this.id, list === null ? null : { ops: list.ops, bounds: list.bounds });
    }
    setImage(image) {
        const handle = image === null ? null : image.__handle ?? null;
        emit(OP.IMAGE, this.id, handle);
    }
    setImageStretch(stretch) { emit(OP.STRETCH, this.id, stretch); }
    /** Tint (compositing.md §3.4): the color rides as CSS text; the Swift side
     *  re-derives the bitmap as an alpha-mask fill (LayerTree case 37). */
    setImageTint(color) {
        emit(OP.TINT, this.id, color === null ? null : colorToCss(color));
    }
    /** Native rich text: the host lays the blocks out (Core Text) and answers
     *  the flowed height, which the runtime treats exactly as the DOM
     *  backend's measured height. `selectable` mounts a real NSTextView so
     *  selection is the platform's own. */
    setRichContent(blocks, selectable, width, onResize, onLink) {
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
    setRichWidth(width) {
        emit(OP.RICHWIDTH, this.id, width);
    }
    /** Called from the host when a rich flow's laid-out height is known. */
    applyRichHeight(h) {
        if (h === this.richHeight)
            return;
        this.richHeight = h;
        richCallbacks.get(this.id)?.onResize(h);
    }
    /** The write half of scrollY/scrollX — clamped like every other write, and
     *  emitted so the layer tree moves this frame. */
    scrollToY(v) {
        if (!this.scrolls)
            return;
        const next = Math.min(Math.max(0, this.contentExtent() - this.height), Math.max(0, v));
        if (next === this.scrollOffset)
            return;
        this.setScrollOffset(next);
        emit(OP.SCROLLPOS, this.id, next, this.contentExtent());
    }
    scrollToX(v) {
        if (!this.scrollsX)
            return;
        const next = Math.min(Math.max(0, this.contentExtentX() - this.width), Math.max(0, v));
        if (next === this.scrollXOffset)
            return;
        this.scrollXOffset = next;
        emit(OP.SCROLLXPOS, this.id, next, this.contentExtentX());
    }
    scrollIntoView(align = "nearest", smooth = false) {
        this.revealX(align, smooth);
        // Walk to the nearest scrolling ancestor, accumulating this surface's
        // offset within it — the canvas backend's math, verbatim.
        let sc = this.parent;
        let top = this.y;
        while (sc !== null && !sc.scrolls) {
            top += sc.y;
            sc = sc.parent;
        }
        if (sc === null)
            return;
        const bottom = top + this.height;
        const viewTop = sc.scrollOffset;
        const viewBottom = viewTop + sc.height;
        let next = sc.scrollOffset;
        // Same `nearest` rule as revealX — measured against Chrome on the embedded
        // desktop's Files-column reveal: a column TALLER than the island viewport,
        // below the fold, top-aligns there (minimal); the far-edge alignment this
        // used to do scrolled ~100px further than the reference.
        if (align === "start")
            next = top;
        else if (top < viewTop && bottom > viewBottom) { /* covers the viewport */ }
        else if (top < viewTop)
            next = this.height > sc.height ? bottom - sc.height : top;
        else if (bottom > viewBottom)
            next = this.height > sc.height ? top : bottom - sc.height;
        const max = Math.max(0, sc.contentExtent() - sc.height);
        next = Math.min(max, Math.max(0, next));
        if (next !== sc.scrollOffset) {
            if (smooth)
                glideY(sc, next);
            else {
                sc.scrollOffset = next;
                sc.onScrollCb?.(next);
                emit(OP.SCROLLPOS, sc.id, next, sc.contentExtent());
            }
        }
    }
    revealRichAnchor(_slug, _within) { return false; }
    /** An embed marker (DOMIsland's `slot`, and so AppIsland's `run:…` key).
     *  Natively nothing mounts into an element — the host reads the pending
     *  markers and inserts a child app's ROOT SURFACE here, so the tenant
     *  lands in this very layer tree (mountEmbed below). */
    setEmbed(id, view) {
        if (id === "") {
            embeds.delete(this.id);
            islandViews.delete(this.id);
        }
        else {
            embeds.set(this.id, id);
            // Keep the island VIEW, not just its slot: the name channel runs the other
            // way (child `appName` → the island's `childName`), and a hosting window
            // titles itself by it. The DOM backend keeps the same back-reference on
            // the box element; here the surface holds it directly.
            if (view !== undefined)
                islandViews.set(this.id, view);
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
    setInput(sink, wants) {
        this.sink = sink;
        this.wants = sink !== null ? wants : undefined;
    }
    setEditable(spec) {
        if (spec === null) {
            editCallbacks.delete(this.id);
            emit(OP.EDIT, this.id, null);
            return;
        }
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
    activateEditable(active) { emit(OP.EDITFOCUS, this.id, active ? 1 : 0); }
    insertChild(child, before) {
        const c = child;
        const b = before;
        if (c.parent !== null) {
            const i = c.parent.children.indexOf(c);
            if (i >= 0)
                c.parent.children.splice(i, 1);
        }
        const at = b === null ? this.children.length : Math.max(0, this.children.indexOf(b));
        this.children.splice(at, 0, c);
        c.parent = this;
        emit(OP.INSERT, this.id, c.id, b === null ? -1 : b.id);
    }
    destroy() {
        if (this.parent !== null) {
            const i = this.parent.children.indexOf(this);
            if (i >= 0)
                this.parent.children.splice(i, 1);
            this.parent = null;
        }
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
    virtualExtent = null;
    setVirtualExtent(h) {
        if (h === this.virtualExtent)
            return;
        this.virtualExtent = h;
        // Push the fresh range at the scroller that owns it, so the scrollbar
        // re-sizes now rather than at the next scroll — the extent only crosses the
        // bridge on a SCROLLPOS, and a windowed list may never be scrolled at all
        // before the user grabs the bar.
        for (let sc = this.parent; sc !== null; sc = sc.parent) {
            if (!sc.scrolls)
                continue;
            emit(OP.SCROLLPOS, sc.id, sc.scrollOffset, sc.contentExtent());
            break;
        }
    }
    contentExtent() {
        let max = 0;
        for (const c of this.children) {
            if (!c.visible)
                continue;
            let ch = c.height;
            if (!c.boxClip && c.clipData === null && !c.scrolls)
                ch = Math.max(ch, c.contentExtent());
            const b = c.y + ch;
            if (b > max)
                max = b;
        }
        return this.virtualExtent !== null ? Math.max(max, this.virtualExtent) : max;
    }
    /** Hit-test a point in this surface's parent coordinates. The canvas
     *  backend's walk, kept identical so the two renderers resolve the same
     *  target for the same point: scale inverted, shape clip subtracted (only
     *  ignoreclip children survive outside it), scroll frame corrected,
     *  children probed in reverse paint order, then this surface's own sink. */
    hit(px, py) {
        // OPACITY IS PAINT, NOT PRESENCE (the canvas walk's ruling, mirrored): a
        // fully transparent view is still hittable — the press-catcher idiom — and
        // the opacity gate this walk carried made the native host disagree with
        // both other renderers. The gates are `visible` and `pointerEvents`, whose
        // "none" is subtree-transparent per the reference.
        if (!this.visible || this.pe === "none")
            return null;
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
                if (!c.ignoresClip)
                    continue;
                const t = c.hit(cxx, cyx);
                if (t !== null)
                    return t;
            }
            return null;
        }
        if ((this.scrolls || this.scrollsX) && !inBox)
            return null;
        const cy = this.scrolls ? ly + this.scrollOffset : ly;
        const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
        for (let i = this.children.length - 1; i >= 0; i--) {
            const t = this.children[i].hit(cx, cy);
            if (t !== null)
                return t;
        }
        if (this.sink !== null && inBox) {
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
    cursorAt(px, py) {
        if (!this.visible || this.opacity <= 0)
            return "";
        let lx = px - this.x;
        let ly = py - this.y;
        [lx, ly] = this.invertTransform(lx, ly);
        const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
        const clipped = this.clipData !== null || this.boxClip;
        if (clipped && !this.insideClip(lx, ly)) {
            for (let i = this.children.length - 1; i >= 0; i--) {
                const c = this.children[i];
                if (!c.ignoresClip)
                    continue;
                const got = c.cursorAt(lx, ly);
                if (got !== "")
                    return got;
            }
            return "";
        }
        if ((this.scrolls || this.scrollsX) && !inBox)
            return "";
        const cy = this.scrolls ? ly + this.scrollOffset : ly;
        const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
        for (let i = this.children.length - 1; i >= 0; i--) {
            const got = this.children[i].cursorAt(cx, cy);
            if (got !== "")
                return got;
        }
        return inBox ? this.cursorStyle : "";
    }
    /** Walk the tree the way hit() does, narrating each step. */
    trace(px, py, depth = 0) {
        const pad = "  ".repeat(depth);
        const lx0 = px - this.x, ly0 = py - this.y;
        let lx = lx0, ly = ly0;
        [lx, ly] = this.invertTransform(lx, ly);
        const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
        const clipped = this.clipData !== null || this.boxClip;
        console.log(`${pad}#${this.id} box=${this.x},${this.y} ${this.width}x${this.height} local=${lx.toFixed(0)},${ly.toFixed(0)}`
            + ` vis=${this.visible} inBox=${inBox} clip=${clipped} ignoreclip=${this.ignoresClip}`
            + ` scrollsX=${this.scrollsX} sink=${this.sink !== null} kids=${this.children.length}`);
        if (!this.visible || this.opacity <= 0) {
            console.log(`${pad}  -> invisible, stop`);
            return;
        }
        if (clipped && !this.insideClip(lx, ly)) {
            console.log(`${pad}  -> outside own clip; only ignoreclip kids`);
            for (let i = this.children.length - 1; i >= 0; i--) {
                if (!this.children[i].ignoresClip)
                    continue;
                this.children[i].trace(lx, ly, depth + 1);
            }
            return;
        }
        if ((this.scrolls || this.scrollsX) && !inBox) {
            console.log(`${pad}  -> scroller, point outside, stop`);
            return;
        }
        for (let i = this.children.length - 1; i >= 0; i--)
            this.children[i].trace(lx, ly, depth + 1);
    }
    insideClip(lx, ly) {
        if (this.clipData !== null)
            return pointInPath(this.clipData, lx, ly);
        return lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
    }
    /** Does this surface contain the point (its clip respected)? A wheel
     *  belongs to the topmost surface under the pointer and then to ITS
     *  ancestors — never to an occluded sibling, which is what let a scroll
     *  over the front window drive a scroller in the window behind it. */
    ownsPoint(px, py) {
        if (!this.visible || this.opacity <= 0)
            return false;
        let lx = px - this.x;
        let ly = py - this.y;
        [lx, ly] = this.invertTransform(lx, ly);
        if (this.clipData !== null || this.boxClip)
            return this.insideClip(lx, ly);
        return lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
    }
    /** Route a HORIZONTAL wheel delta to the innermost surface that scrolls on
     *  that axis. A trackpad reports both deltas and the DOM routes each to
     *  whichever ancestor scrolls that way; only the vertical half existed here,
     *  so the Files strip could be revealed programmatically but never dragged. */
    scrollByX(px, py, dx) {
        if (!this.visible || this.opacity <= 0)
            return false;
        let lx = px - this.x;
        let ly = py - this.y;
        [lx, ly] = this.invertTransform(lx, ly);
        const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
        if ((this.scrolls || this.scrollsX) && !inBox)
            return false;
        const cy = this.scrolls ? ly + this.scrollOffset : ly;
        const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
        for (let i = this.children.length - 1; i >= 0; i--) {
            const c = this.children[i];
            if (!c.ownsPoint(cx, cy))
                continue;
            if (c.scrollByX(cx, cy, dx))
                return true;
            break; // the point is this child's; siblings behind it never see it
        }
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
    scrollBy(px, py, dy) {
        if (!this.visible || this.opacity <= 0)
            return false;
        let lx = px - this.x;
        let ly = py - this.y;
        [lx, ly] = this.invertTransform(lx, ly);
        const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
        if ((this.scrolls || this.scrollsX) && !inBox)
            return false;
        const cy = this.scrolls ? ly + this.scrollOffset : ly;
        const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
        for (let i = this.children.length - 1; i >= 0; i--) {
            if (this.children[i].scrollBy(cx, cy, dy))
                return true;
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
const surfaces = new Map();
const richCallbacks = new Map();
const editCallbacks = new Map();
/** Surfaces carrying an embed marker (`slot`), for the host's island wiring. */
const embeds = new Map();
const islandViews = new Map();
/** A surface's absolute origin in the ROOT app's coordinate space.
 *
 *  An embedded child needs this to convert the host's pointer into its own
 *  space — the web reads `host.getBoundingClientRect()` for exactly this, and
 *  natively there is no element to ask, so the surface tree answers instead.
 *  A scrolling ancestor shifts everything inside it, so its offset comes off
 *  the sum (the same arithmetic LayerTree.absY does). */
export function surfaceOrigin(id) {
    const s = surfaces.get(id);
    if (s === undefined)
        return [0, 0];
    let x = s.x, y = s.y;
    for (let p = s.parent; p !== null; p = p.parent) {
        if (p.scrolls)
            y -= p.scrollOffset;
        if (p.scrollsX)
            x -= p.scrollXOffset;
        x += p.x;
        y += p.y;
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
export function publishChildName(islandId, name) {
    const v = islandViews.get(islandId);
    if (v !== undefined && v.childName !== name)
        v.childName = name;
}
/** The island markers currently declared — the host mounts a child program
 *  into each (AppIsland), and re-reads because a slot is a constraint. */
export function embedsPending() {
    const out = [];
    for (const [id, slot] of embeds)
        out.push({ id, slot });
    return out;
}
/** Insert a child app's root surface into an island's surface. No coordinate
 *  sync and no second input router: the tenant is an ordinary subtree, so the
 *  paint and hit walks reach it exactly as they reach anything else. */
export function mountEmbed(islandId, childRoot) {
    surfaces.get(islandId)?.insertChild(childRoot, null);
    // AN EMBEDDED APP'S ROOT KEEPS TO ITS FRAME AND NEVER SELF-SCROLLS — the
    // DOM's applyScrollStyle root branch, which fires for EVERY element stamped
    // data-declare-app, tenants included: the root wears `overflow: clip`, and
    // what scrolls is the ISLAND element (or an interior pane), never the root.
    // The native tenant root still carried its App-default `scrolls = y`, so a
    // stray offset on it (a location seek, a wheel that resolved to the root)
    // TRANSLATED THE WHOLE APP inside its island — measured: the Viewer's edit
    // pane sat 235px high, its editor overlay over the window title bar.
    const r = childRoot;
    r.scrolls = false;
    r.scrollsX = false;
    r.scrollOffset = 0;
    r.scrollXOffset = 0;
    emit(OP.SCROLLPOS, r.id, 0, 0);
    emit(OP.SCROLLXPOS, r.id, 0, 0);
    emit(OP.SCROLL, r.id, 0);
    emit(OP.SCROLLX, r.id, 0);
    r.appRoot = true; // keeps a later scrolls push from re-arming
    // …and KEEPS TO ITS FRAME: the other half of the root rule (the DOM's
    // `overflow: clip` on every data-declare-app element). Without it the island's
    // contentExtent recursion descends into the tenant and finds content that
    // deliberately overflows the app box — the desktop's wallpaper is drawn in a
    // 1920x1200 reference box, bottom at y=900 inside a 600-tall tenant — so the
    // island's scroll range ran 300px past the app into bare host ("scroll off
    // the bottom into white space"). A clipping child contains its own overflow,
    // which is exactly what an app root is supposed to do.
    r.setBoxClip(true);
}
/** Tear down whatever tenant an island is already hosting.
 *
 *  `mountEmbed` INSERTS, so a remount used to stack a second copy of the app on
 *  top of the first — the Viewer changes its env when you switch Reader/Source,
 *  which is a remount, so its document ended up drawn two and three times over
 *  itself at different sizes. An island hosts one tenant; evicting the old one
 *  is part of mounting the new. */
export function clearEmbed(islandId) {
    const s = surfaces.get(islandId);
    if (s === undefined)
        return;
    for (const c of [...s.children])
        c.destroy();
}
/** The scene model for a surface id (the host reads box geometry to size a
 *  mounted tenant). */
export function surfaceById(id) {
    return surfaces.get(id) ?? null;
}
/** Shape-clip point testing. The host owns Core Graphics paths, so it answers
 *  — memoized per (path, point) round to keep the hover walk cheap. */
let pointInPathImpl = null;
export function provideHitPath(fn) {
    pointInPathImpl = fn;
}
function pointInPath(d, x, y) {
    return pointInPathImpl === null ? true : pointInPathImpl(d, x, y);
}
// ── the backend ─────────────────────────────────────────────────────────────
export class MacBackend {
    root = null;
    createSurface() {
        const s = new MacSurface();
        surfaces.set(s.id, s);
        return s;
    }
    /** No HTMLElement here: the "host" is the native window's root layer. The
     *  root surface is named to the Swift side, and input routing starts. */
    attachRoot(_host, root) {
        const r = root;
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
        routeInput(() => macRoot === r, (e) => {
            const ee = e;
            const t = r.hit(ee.clientX, ee.clientY);
            if (ee.type === "pointermove") {
                const cur = r.cursorAt(ee.clientX, ee.clientY);
                if (cur !== lastCursor) {
                    lastCursor = cur;
                    emit(OP.CURSOR, 0, cur);
                }
            }
            if (globalThis.__declareHitDebug === true
                && ee.type !== "pointermove") {
                console.log("[hit] " + ee.type + " @" + ee.clientX.toFixed(0) + "," + ee.clientY.toFixed(0)
                    + " -> " + (t === null ? "null" : "id " + t.key.id));
            }
            return t;
        }, (e) => ({ x: e.clientX, y: e.clientY }), (t) => {
            // The cursor is set by the cursorAt walk on every move (see above);
            // hover changes only need to keep it in step when the target changes
            // without the pointer moving.
            void t;
            if (globalThis.__declareHitDebug === true) {
                console.log("[hit] hover -> " + (t === null ? "null"
                    : "id " + t.key.id + " cursor=" + (t.cursor ?? "-")));
            }
        });
    }
}
let macRoot = null;
let lastCursor = "";
// ── smooth reveal ───────────────────────────────────────────────────────────
//
// `scrollIntoView(..., true)` asks for the DOM's `behavior: "smooth"`, which
// the browser animates for us. Nothing animates it here, so a newly revealed
// Files column POPPED into place instead of sliding. Same easing the platform
// uses for a short programmatic scroll: ease-in-out over ~320ms.
const GLIDE_MS = 320;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function glide(from, to, step) {
    const t0 = Date.now();
    let ticks = 0;
    const tick = () => {
        const t = Math.min(1, (Date.now() - t0) / GLIDE_MS);
        ticks++;
        step(from + (to - from) * ease(t));
        if (t < 1)
            requestAnimationFrame(tick);
        else if (globalThis.__declareHitDebug === true) {
            console.log(`[glide] ${from.toFixed(0)} -> ${to.toFixed(0)} in ${ticks} frames`);
        }
    };
    requestAnimationFrame(tick);
}
function glideX(sc, to) {
    glide(sc.scrollXOffset, to, (v) => {
        sc.scrollXOffset = v;
        emit(OP.SCROLLXPOS, sc.id, v, sc.contentExtentXPublic());
        flushOps();
    });
}
function glideY(sc, to) {
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
export function macScrollTo(id, y, x = null) {
    const s = surfaces.get(id);
    if (s === undefined)
        return;
    let moved = false;
    if (s.scrolls) {
        const max = Math.max(0, s.contentExtent() - s.height);
        const next = Math.min(max, Math.max(0, y));
        if (next !== s.scrollOffset) {
            s.setScrollOffset(next); // sets the field AND notifies
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
    if (moved)
        flushOps();
}
/** Narrate the hit walk at a point — a diagnostic for "nothing is hittable here". */
export function macTraceHit(x, y) {
    const t = macRoot?.hit(x, y) ?? null;
    console.log(`[trace] === hit walk at ${x},${y} -> `
        + (t === null ? "NOTHING" : `id ${t.key.id} cursor=${t.cursor ?? "-"}`)
        + ` (cursorAt="${macRoot?.cursorAt(x, y) ?? ""}") ===`);
    macRoot?.trace(x, y);
}
export function macScroll(x, y, dy, dx = 0) {
    if (dy !== 0)
        macRoot?.scrollBy(x, y, dy);
    if (dx !== 0)
        macRoot?.scrollByX(x, y, dx);
    flushOps();
}
export function macRichHeight(id, h) {
    surfaces.get(id)?.applyRichHeight(h);
}
export function macRichLink(id, href) {
    richCallbacks.get(id)?.onLink(href);
}
export function macEditInput(id, value) {
    editCallbacks.get(id)?.onInput?.(value);
}
export function macEditFocus(id, focused) {
    const spec = editCallbacks.get(id);
    if (focused)
        spec?.onFocus?.();
    else
        spec?.onBlur?.();
}
export function macEditEnter(id) {
    editCallbacks.get(id)?.onEnter?.();
}
//# sourceMappingURL=mac-backend.js.map