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
import { NeoError } from "./errors.js";
import { colorToCss, isGradient } from "./value.js";
import { paintBox } from "./boxpaint.js";
import { cssWeight, fontMetrics, fontString } from "./measure.js";
import { replay } from "./draw.js";
import { onDprChange } from "./dpr.js";
import { routeInput } from "./input.js";
/** Style a native editable overlay to match the view's painted text metrics, so
 *  its caret and glyphs align with the static-text measure (measure.ts). */
function applyCanvasEditStyle(el, st) {
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
let scratch = null;
const hitCtx = () => (scratch ??= document.createElement("canvas").getContext("2d"));
export class CanvasBackend {
    compositor = new Compositor();
    createSurface() {
        return new CanvasSurface(this.compositor);
    }
    attachRoot(host, root) {
        this.compositor.attach(host, root);
    }
}
/** The scene owner: the one shared <canvas>, the dirty-bit + rAF paint
 *  scheduler, and devicePixelRatio handling. Surfaces only ever call
 *  `invalidate()`; nothing else about how pixels reach the screen leaks out. */
class Compositor {
    canvas = null;
    ctx = null;
    root = null;
    /** The page host — the parent of both the canvas and the native editable
     *  overlays (Layer 3), so an overlay's absolute coordinates share the
     *  canvas's origin. */
    host = null;
    /** Surfaces with a live native editable overlay: repositioned each paint so
     *  the overlay tracks a moving/animating ancestor. */
    editables = new Set();
    /** Pending requestAnimationFrame handle; 0 = no paint scheduled. */
    frame = 0;
    hostElement() {
        return this.host;
    }
    registerEditable(s) {
        this.editables.add(s);
    }
    unregisterEditable(s) {
        this.editables.delete(s);
    }
    attach(host, root) {
        if (this.canvas !== null) {
            throw new NeoError("a CanvasBackend hosts one tree — use a fresh backend per render");
        }
        const canvas = document.createElement("canvas");
        canvas.style.display = "block"; // no inline-baseline gap inside the host
        // A painted UI, not a document: a press-drag must not start a native
        // selection of the canvas/page (editable overlays opt back in themselves).
        canvas.style.userSelect = "none";
        canvas.style.webkitUserSelect = "none";
        canvas.style.touchAction = "none";
        const ctx = canvas.getContext("2d");
        if (ctx === null)
            throw new NeoError("Canvas 2D is unavailable in this browser");
        this.canvas = canvas;
        this.ctx = ctx;
        this.root = root;
        this.host = host;
        // Native editable overlays (Layer 3) are absolutely positioned within the
        // host; make it a positioning context so their coordinates share the
        // canvas's origin. (A no-op if the host is already positioned.)
        if (getComputedStyle(host).position === "static")
            host.style.position = "relative";
        host.appendChild(canvas);
        // Editables that registered during the attach walk (before this host
        // existed) can now mount their overlay elements.
        for (const s of [...this.editables])
            s.remountEditable();
        // Even an idle tree must re-rasterize crisply when the user zooms or
        // moves the window between displays; a destroyed root ends the watch.
        onDprChange(() => this.canvas !== null, () => this.invalidate());
        // Input: own pixels means own hit-testing — resolution is the scene
        // walk (CanvasSurface.hit); the pairing/click rule is the shared
        // router's (input.ts). Events cost nothing while none arrive.
        routeInput(() => this.canvas !== null, (e) => {
            if (this.canvas === null || this.root === null)
                return null;
            const r = this.canvas.getBoundingClientRect();
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            if (x < 0 || y < 0 || x >= r.width || y >= r.height)
                return null;
            return this.root.hit(x, y);
        }, (e) => {
            const r = this.canvas.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        });
        this.invalidate();
    }
    /** Request a repaint. Every change since the last frame coalesces into one
     *  scheduled requestAnimationFrame; with a paint already pending — or before
     *  attach, whose first paint covers everything — this is a no-op, so an
     *  idle or unattached tree costs nothing. */
    invalidate() {
        if (this.frame !== 0 || this.ctx === null)
            return;
        this.frame = requestAnimationFrame(this.paint);
    }
    /** A destroyed root takes the canvas (and any pending frame) with it;
     *  destroying any other surface just repaints the scene without it. */
    destroyed(surface) {
        if (surface !== this.root) {
            this.invalidate();
            return;
        }
        if (this.frame !== 0)
            cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.canvas?.remove();
        this.canvas = null; // also quiets the dpr watch
        this.ctx = null;
        this.root = null;
        this.editables.clear();
        this.host = null;
    }
    paint = () => {
        this.frame = 0;
        const { canvas, ctx, root } = this;
        if (canvas === null || ctx === null || root === null)
            return;
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
        for (const e of this.editables)
            e.reposition();
    };
}
/** One view's retained visual state in the scene. A setter stores the value
 *  and invalidates the compositor — nothing draws eagerly; the next frame's
 *  paint walk reads everything back. */
class CanvasSurface {
    compositor;
    x = 0;
    y = 0;
    width = 0;
    height = 0;
    /** A solid fill pre-resolved to a canvas fillStyle (null = none) — the
     *  R1 fast path; a gradient fill is retained as data and realized per
     *  paint (its geometry depends on the box). Together with cornerRadius/
     *  stroke/shadow these fields ARE the shared BoxState (boxpaint.ts) —
     *  non-private so the surface passes itself to the one shared painter. */
    fill = null;
    gradient = null;
    cornerRadius = 0;
    stroke = null;
    shadow = null;
    /** The rounded box path, rebuilt lazily when geometry/radius change. */
    box = null;
    visible = true;
    opacity = 1;
    parent = null;
    children = [];
    clipData = null;
    /** Backend-retained cache of the clip path (never recording state);
     *  rebuilt lazily so setClip stays legal before any canvas exists. */
    clipPath = null;
    drawing = null;
    text = "";
    /** Text style pre-resolved at set time — the paint walk does zero
     *  measuring or formatting. */
    font = "";
    textFill = "";
    ascent = 0;
    textShadow = null;
    letterSpacing = 0;
    image = null;
    stretch = "none";
    /** The view's input route; null = transparent to the pointer (hit walk). */
    sink = null;
    /** The native editable overlay (Layer 3), a DOM element over the canvas; null
     *  = this surface is not an editable text field. */
    editEl = null;
    edit = null;
    constructor(compositor) {
        this.compositor = compositor;
    }
    setX(v) { this.x = v; this.compositor.invalidate(); }
    setY(v) { this.y = v; this.compositor.invalidate(); }
    setWidth(v) { this.width = v; this.box = null; this.compositor.invalidate(); }
    setHeight(v) { this.height = v; this.box = null; this.compositor.invalidate(); }
    setVisible(v) { this.visible = v; this.compositor.invalidate(); }
    setOpacity(o) { this.opacity = o; this.compositor.invalidate(); }
    setFill(f) {
        if (isGradient(f)) {
            this.gradient = f;
            this.fill = null;
        }
        else {
            this.gradient = null;
            this.fill = f === null ? null : colorToCss(f);
        }
        this.compositor.invalidate();
    }
    setCornerRadius(r) {
        this.cornerRadius = r;
        this.box = null;
        this.compositor.invalidate();
    }
    setStroke(st) {
        this.stroke = st;
        this.compositor.invalidate();
    }
    setShadow(sh) {
        this.shadow = sh;
        this.compositor.invalidate();
    }
    setClip(d) {
        this.clipData = d;
        this.clipPath = null;
        this.compositor.invalidate();
    }
    setDrawing(list) {
        this.drawing = list;
        this.compositor.invalidate();
    }
    setText(text) {
        this.text = text;
        this.compositor.invalidate();
    }
    setTextStyle(st) {
        this.font = fontString(st);
        this.textFill = colorToCss(st.color);
        this.ascent = fontMetrics(this.font).ascent;
        this.textShadow = st.shadow ?? null;
        this.letterSpacing = st.letterSpacing;
        this.compositor.invalidate();
    }
    setImage(image) {
        this.image = image;
        this.compositor.invalidate();
    }
    setImageStretch(stretch) {
        this.stretch = stretch;
        this.compositor.invalidate();
    }
    setInput(sink) {
        this.sink = sink; // input state changes no pixels — no invalidate
    }
    setEditable(spec) {
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
            el = document.createElement(tag);
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
            s.webkitUserSelect = "text";
            s.touchAction = "auto";
            s.resize = "none";
            const self = el;
            el.addEventListener("input", () => this.edit?.onInput(self.value));
            el.addEventListener("focus", () => this.edit?.onFocus());
            el.addEventListener("blur", () => this.edit?.onBlur());
            el.addEventListener("keydown", (e) => {
                if (!(this.edit?.multiline ?? false) && e.key === "Enter")
                    this.edit?.onEnter?.();
            });
            host.appendChild(el);
            this.editEl = el;
        }
        this.edit = spec;
        if (el !== null) {
            if (el.value !== spec.value)
                el.value = spec.value; // guard the caret against an echo
            el.placeholder = spec.placeholder;
            applyCanvasEditStyle(el, spec.style);
        }
        this.compositor.registerEditable(this);
        this.reposition();
    }
    activateEditable(active) {
        if (this.editEl === null)
            return;
        if (active)
            this.editEl.focus();
        else
            this.editEl.blur();
    }
    /** Re-apply the retained editable spec — used by the compositor once the host
     *  exists, since a TextInput's setEditable runs during the attach walk, before
     *  attachRoot stores the host (so no element could be created then). */
    remountEditable() {
        if (this.edit !== null)
            this.setEditable(this.edit);
    }
    /** Glue the overlay to the surface's on-screen box: accumulate x/y up the
     *  parent chain (canvas-logical coordinates ARE host CSS pixels — dpr lives
     *  in the paint transform, not here) and hide it if any ancestor is
     *  invisible. Called each paint by the compositor so it tracks motion. */
    reposition() {
        const el = this.editEl;
        if (el === null)
            return;
        let ax = 0;
        let ay = 0;
        let shown = true;
        for (let s = this; s !== null; s = s.parent) {
            ax += s.x;
            ay += s.y;
            if (!s.visible)
                shown = false;
        }
        const st = el.style;
        st.left = ax + "px";
        st.top = ay + "px";
        st.width = this.width + "px";
        st.height = this.height + "px";
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
    hit(px, py) {
        if (!this.visible || this.opacity <= 0)
            return null;
        const lx = px - this.x;
        const ly = py - this.y;
        if (this.clipData !== null) {
            this.clipPath ??= new Path2D(this.clipData);
            if (!hitCtx().isPointInPath(this.clipPath, lx, ly))
                return null;
        }
        for (let i = this.children.length - 1; i >= 0; i--) {
            const t = this.children[i].hit(lx, ly);
            if (t !== null)
                return t;
        }
        if (this.sink !== null && lx >= 0 && ly >= 0 && lx < this.width && ly < this.height) {
            return { key: this, sink: this.sink, x: lx, y: ly };
        }
        return null;
    }
    insertChild(child, before) {
        const c = child;
        const existing = this.children.indexOf(c);
        if (existing >= 0)
            this.children.splice(existing, 1); // a re-insert is a move
        c.parent = this;
        const at = before === null ? -1 : this.children.indexOf(before);
        this.children.splice(at < 0 ? this.children.length : at, 0, c);
        this.compositor.invalidate();
    }
    destroy() {
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
    paint(ctx) {
        if (!this.visible || this.opacity <= 0)
            return;
        ctx.save();
        ctx.translate(this.x, this.y);
        if (this.clipData !== null) {
            this.clipPath ??= new Path2D(this.clipData);
            ctx.clip(this.clipPath);
        }
        if (this.opacity < 1)
            this.paintLayer(ctx);
        else
            this.paintContent(ctx);
        ctx.restore();
    }
    /** Group opacity: the subtree paints opaquely into a layer sharing the
     *  target's device size and transform, then lands in one drawImage at this
     *  opacity — an identity-transform, pixel-aligned blit (no resampling)
     *  that still honors the ambient clip. The cost exists only where
     *  translucency does; sizing layers to subtree bounds and pooling them are
     *  later policy work (free dimensions — rendering model). */
    paintLayer(ctx) {
        const target = ctx.canvas;
        if (target.width === 0 || target.height === 0)
            return;
        const layer = document.createElement("canvas");
        layer.width = target.width;
        layer.height = target.height;
        const lctx = layer.getContext("2d");
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
    paintContent(ctx) {
        this.paintBox(ctx);
        if (this.image !== null) {
            const st = this.stretch;
            const w = st === "width" || st === "both" ? this.width : this.image.naturalWidth;
            const h = st === "height" || st === "both" ? this.height : this.image.naturalHeight;
            ctx.drawImage(this.image, 0, 0, w, h);
        }
        if (this.drawing !== null)
            replay(ctx, this.drawing);
        if (this.text !== "" && this.font !== "") {
            ctx.font = this.font;
            ctx.fillStyle = this.textFill;
            ctx.textBaseline = "alphabetic";
            // Tracking (canvas-native) — set for this run, reset after so the shared
            // ctx stays neutral for siblings/children.
            const lsCtx = ctx;
            if (this.letterSpacing !== 0)
                lsCtx.letterSpacing = this.letterSpacing + "px";
            const sh = this.textShadow;
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
                ctx.fillText(this.text, 0, this.ascent);
                ctx.restore();
            }
            else {
                ctx.fillText(this.text, 0, this.ascent);
            }
            if (this.letterSpacing !== 0)
                lsCtx.letterSpacing = "0px";
        }
        for (const child of this.children)
            child.paint(ctx);
    }
    /** The box paint — the SHARED painter (boxpaint.ts; the DOM backend
     *  rasterizes the same code where CSS proved pixel-unstable). A plain
     *  solid box — the overwhelmingly common case — stays the single-fillRect
     *  fast path inside it; the surface's fields are the BoxState it reads,
     *  and the returned Path2D is the lazily-rebuilt box cache. */
    paintBox(ctx) {
        this.box = paintBox(ctx, this, this.box);
    }
}
//# sourceMappingURL=canvas-backend.js.map