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
// exists), no Flash colortransform/frames, no capability probing, no
// per-sprite `clickable` state (interactivity is the seam's sink, derived
// from declared handlers). Rotation/scale inverses — originally left out with
// the rest — arrived with the compositing arc (2026-08: `invertPoint` below,
// so the hit walk tells the truth about a turned or scaled surface).
import { DeclareError } from "./errors.js";
import { inAnimationFrame } from "./animate.js";
const MICROTASK_PAINT = -1;
import { notifyIslandSlot } from "./backend.js";
import { lockFocusZoom } from "./viewport-lock.js";
import { colorToCss, isGradient } from "./value.js";
import { paintBox, paintBoxShadow, boxShape, realizeGradient } from "./boxpaint.js";
import { cssWeight, fontMetrics, fontString, textWidth, wrapLines } from "./measure.js";
import { replay, replayCost, rasterPad, rasterEntryCap, rasterTotalCap, RASTER_MAX_DIM, RASTER_MAX_AREA, RASTER_GRACE_MS } from "./draw.js";
import { onDprChange } from "./dpr.js";
import { routeInput, holdCaptureActive } from "./input.js";
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
/** The Blend enum's camelCase tokens → Canvas2D operators. The set is the
 *  W3C compositing-and-blending modes every backend carries natively
 *  (compositing.md §2); only two spellings differ from a mechanical
 *  hyphenation: `normal` is source-over, `plusLighter` is `lighter`. */
const BLEND_OPS = {
    normal: "source-over", multiply: "multiply", screen: "screen",
    overlay: "overlay", darken: "darken", lighten: "lighten",
    colorDodge: "color-dodge", colorBurn: "color-burn",
    hardLight: "hard-light", softLight: "soft-light",
    difference: "difference", exclusion: "exclusion", hue: "hue",
    saturation: "saturation", color: "color", luminosity: "luminosity",
    plusLighter: "lighter",
};
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
let memoBytes = 0;
let memoStamp = 0;
let memoPaints = 0;
let memoAttempts = 0;
const memoHolders = new Set();
// a diag window into the pool (the __declareDiag family): entries and bytes,
// so a session growing rasters is visible rather than mysterious
globalThis.__declareRasterStats =
    () => ({ entries: memoHolders.size, bytes: memoBytes, paints: memoPaints, attempts: memoAttempts });
function viewportBytes(c) {
    return c === null ? 8 << 20 : c.width * c.height * 4;
}
function releaseRaster(s) {
    const e = s.rasterEntry;
    if (e === null)
        return;
    memoBytes -= e.bytes;
    s.rasterEntry = null;
    memoHolders.delete(s);
}
function evictOldest(except) {
    let victim = null;
    let oldest = Infinity;
    for (const h of memoHolders) {
        if (h === except || h.rasterEntry === null)
            continue;
        if (h.rasterEntry.stamp < oldest) {
            oldest = h.rasterEntry.stamp;
            victim = h;
        }
    }
    if (victim === null)
        return false;
    releaseRaster(victim);
    return true;
}
class Compositor {
    canvas = null;
    /** the sealed surface's element — the raster memo denominates its caps in
     *  viewports, and the viewport is this canvas */
    get rootCanvas() { return this.canvas; }
    embeddedRoot = false;
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
    /** The page-scroll STRUT (pageRoot realization): an inert 1px-wide element
     *  in the host whose height is the root's content extent — the document's
     *  scroll range, without the canvas itself ever growing. */
    strut = null;
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
            throw new DeclareError("a CanvasBackend hosts one tree — use a fresh backend per render");
        }
        const canvas = document.createElement("canvas");
        canvas.style.display = "block"; // no inline-baseline gap inside the host
        // A painted UI, not a document: a press-drag must not start a native
        // selection of the canvas/page (editable overlays opt back in themselves).
        canvas.style.userSelect = "none";
        canvas.style.webkitUserSelect = "none";
        // The browser owns every gesture until a view claims one — the DOM root's
        // same defaults (dom-backend refreshTouchAction), realized once on the
        // shared canvas element; per-VIEW claims are arbitrated per gesture below,
        // since one element cannot carry per-subtree CSS. An EMBEDDED island's
        // default is no claim at all — the finger belongs to the host page's
        // regime — while its declared claims still stand (rootTouchAction).
        const embedded = typeof host.closest === "function" && host.closest("[data-declare-app], [data-declare-embed]") !== null;
        this.embeddedRoot = embedded;
        canvas.style.touchAction = root.rootTouchAction(embedded);
        const ctx = canvas.getContext("2d");
        if (ctx === null)
            throw new DeclareError("Canvas 2D is unavailable in this browser");
        this.canvas = canvas;
        this.ctx = ctx;
        this.root = root;
        this.host = host;
        // Native editable overlays (Layer 3) are absolutely positioned within the
        // host; make it a positioning context so their coordinates share the
        // canvas's origin. (A no-op if the host is already positioned.)
        if (getComputedStyle(host).position === "static")
            host.style.position = "relative";
        // Paint the page BEHIND the app with the app's own background — the DOM
        // backend's rule (its attachRoot), mirrored: outside a content-sized app
        // the two renderers must show the SAME pixels, and overscroll must match
        // the app rather than flash the stub page's ground. Solid fills only (the
        // DOM read resolves the same way) and top-level only — an embedded canvas
        // render must never touch the host page.
        if (!embedded && root.fill !== null) {
            const doc = host.ownerDocument;
            doc.documentElement.style.background = root.fill;
            doc.body.style.background = root.fill;
            doc.documentElement.style.height = "100%";
            doc.body.style.height = "100%";
            doc.body.style.margin = "0";
        }
        host.appendChild(canvas);
        // THE PAGE REALIZATION (ruled 2026-07-29): the root's scroll regime is
        // the browser's own page scroll, never a pane — the same contract as the
        // DOM backend, realized canvas-fashion. The canvas rides FIXED at the
        // viewport (it never scrolls away and never grows with content); an
        // inert STRUT gives the document its scroll extent (updated per paint);
        // and the root becomes a `pageRoot` pane whose offset mirrors the
        // window's own scroll — the existing pane walks then paint and hit the
        // right slice with no new machinery. scrollBy/wheelTo never consume for
        // a pageRoot: the browser scrolls the page natively. Top-level only —
        // an embedded island keeps its box realization.
        if (!embedded && root.scrolls) {
            root.pageRoot = true;
            canvas.style.position = "fixed";
            canvas.style.left = "0";
            canvas.style.top = "0";
            const strut = host.ownerDocument.createElement("div");
            strut.style.cssText = "position:absolute;left:0;top:0;width:1px;height:0;visibility:hidden;pointer-events:none";
            host.appendChild(strut);
            this.strut = strut;
            const w = host.ownerDocument.defaultView;
            w?.addEventListener("scroll", () => {
                if (this.root !== null && this.root.pageRoot && this.root.scrollOffset !== w.scrollY) {
                    this.root.scrollOffset = w.scrollY;
                    this.invalidate();
                }
            }, { passive: true });
        }
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
        }, 
        // One host element paints everything, so the per-view cursor is applied
        // here as the hover target changes (the DOM backend brushes per element).
        (t) => {
            if (this.canvas !== null)
                this.canvas.style.cursor = t !== null && t.cursor !== undefined ? t.cursor : "";
        });
        // Tap-to-dismiss for native editable overlays: a pointerdown that lands on the
        // CANVAS is by definition outside every overlay (they are separate sibling
        // elements), so blur the focused field — mobile Safari won't drop it (and the
        // keyboard) on a tap of non-focusable pixels the way desktop does.
        canvas.addEventListener("pointerdown", () => {
            const active = document.activeElement;
            if (active instanceof HTMLElement &&
                (active.tagName === "INPUT" || active.tagName === "TEXTAREA") &&
                host.contains(active)) {
                active.blur();
            }
        });
        // Per-gesture CLAIM arbitration — the canvas twin of the DOM backend's
        // per-element touch-action (its refreshTouchAction): hit-test where the
        // first finger lands, union the declared claims up the hit chain (a claim
        // covers its subtree), and suppress exactly what the claim names while
        // the gesture lives. The raw touch family claims every finger (suppress
        // at touchstart, as root `none` used to); `onPointerMove` claims only the
        // single-finger drag — a second finger's pinch is left to the browser.
        let claim = null;
        let claimStart = null; // axis arbitration anchor
        let axisVerdict = null; // latched once per gesture
        canvas.addEventListener("touchstart", (e) => {
            if (this.canvas === null || this.root === null)
                return;
            if (claim === null) {
                const r = this.canvas.getBoundingClientRect();
                const t0 = e.touches[0];
                claim = this.root.claimAt(t0.clientX - r.left, t0.clientY - r.top);
                claimStart = { x: t0.clientX, y: t0.clientY };
                axisVerdict = null;
            }
            if (claim.touch)
                e.preventDefault();
            // the PINCH claim engages at the SECOND finger — one finger stays the
            // enclosing regime's pan, exactly the DOM's `pan-x pan-y`
            else if (claim.pinch && e.touches.length >= 2)
                e.preventDefault();
        }, { passive: false });
        canvas.addEventListener("touchmove", (e) => {
            // a live hold-capture owns the finger regardless of the touchdown claim
            if (holdCaptureActive()) {
                e.preventDefault();
                return;
            }
            if (claim === null)
                return;
            if (claim.touch) {
                e.preventDefault();
                return;
            }
            if (claim.pinch && e.touches.length >= 2) {
                e.preventDefault();
                return;
            }
            if (claim.drag === false || e.touches.length !== 1)
                return;
            if (claim.drag === "both") {
                e.preventDefault();
                return;
            }
            // The AXIS-SCOPED claim (claim-surface.md, D8 RULED): mirror the DOM's
            // native pan-x/pan-y arbitration — decide ONCE per gesture by the
            // dominant axis of the first meaningful movement, then latch (the same
            // one-way rule every claim follows).
            if (axisVerdict === null && claimStart !== null) {
                const t0 = e.touches[0];
                const dx = Math.abs(t0.clientX - claimStart.x);
                const dy = Math.abs(t0.clientY - claimStart.y);
                if (dx + dy >= 4)
                    axisVerdict = (claim.drag === "x" ? dx >= dy : dy >= dx) ? "ours" : "theirs";
            }
            if (axisVerdict === "ours")
                e.preventDefault();
        }, { passive: false });
        const gestureEnd = (e) => {
            if (e.touches.length === 0) {
                claim = null;
                claimStart = null;
                axisVerdict = null;
            }
        };
        canvas.addEventListener("touchend", gestureEnd);
        canvas.addEventListener("touchcancel", gestureEnd);
        // Wheel → the nearest enclosing claim or scroller under the pointer, the
        // DOM backend's exact arbitration walked on the hit chain: an onWheel
        // view claims the stream over its subtree (trackpad pinch included), a
        // scrolling pane nearer the pointer keeps its wheel (own pixels means own
        // scroll — the clamp uses the content extent, and the compositor repaints).
        canvas.addEventListener("wheel", (e) => {
            if (this.canvas === null || this.root === null)
                return;
            const r = this.canvas.getBoundingClientRect();
            const x = e.clientX - r.left;
            const y = e.clientY - r.top;
            if (this.root.wheelTo(x, y, e.deltaX, e.deltaY, e.ctrlKey) === "claimed") {
                e.preventDefault();
                return;
            }
            if (this.root.scrollBy(x, y, e.deltaY)) {
                e.preventDefault();
                this.invalidate();
            }
        }, { passive: false });
        // ── the OVERLAY SCROLLBAR's interaction (one design, both pointer
        // kinds): a fine pointer near the bar WIDENS it and can grab the thumb
        // (track press jumps-to-spot, then drags); touch has no hover — a
        // touch-HOLD on the thumb (250ms, <8px wander) engages the scrub and
        // widens until release. All state lives here; the app never routes. ──
        const findBar = (px, py) => {
            const walk = (sf, lx, ly, ax, ay) => {
                if (!sf.visible)
                    return null;
                const inBox = lx >= 0 && ly >= 0 && lx < sf.width && ly < sf.height;
                if (sf.scrolls && !inBox)
                    return null;
                for (let i = sf.children.length - 1; i >= 0; i--) {
                    const c = sf.children[i];
                    const shift = sf.scrolls && !c.ignoresScroll ? sf.scrollOffset : 0;
                    const hit = walk(c, lx - c.x, ly + shift - c.y, ax + c.x, ay + c.y - shift);
                    if (hit !== null)
                        return hit;
                }
                if (sf.scrolls && !sf.pageRoot && inBox && lx >= sf.width - 16 && sf.barGeom() !== null)
                    return { s: sf, ax, ay };
                return null;
            };
            return this.root === null ? null : walk(this.root, px, py, 0, 0);
        };
        const toLocal = (e) => {
            const r = canvas.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        };
        let barHover = null;
        let barDrag = null;
        let barHold = null;
        const setHover = (sf) => {
            if (barHover === sf)
                return;
            if (barHover !== null && barDrag === null)
                barHover.barWide = false;
            barHover = sf;
            if (sf !== null)
                sf.barWide = true;
            this.invalidate();
        };
        const dragMove = (e) => {
            const p = toLocal(e);
            if (barDrag !== null) {
                barDrag.s.scrubTo(p.y - barDrag.ay - barDrag.grabDy);
            }
            else if (barHold !== null) {
                if (barHold.engaged)
                    barHold.s.scrubTo(p.y - barHold.ay - barHold.s.barGeom().thumbH / 2);
                else if (Math.abs(p.y - barHold.startY) > 8)
                    dragEnd(); // it was a pan — stand down
            }
        };
        const dragEnd = () => {
            if (barDrag !== null) {
                if (barDrag.s !== barHover)
                    barDrag.s.barWide = false;
                barDrag = null;
            }
            if (barHold !== null) {
                window.clearTimeout(barHold.timer);
                barHold.s.barWide = false;
                barHold = null;
            }
            window.removeEventListener("pointermove", dragMove, true);
            window.removeEventListener("pointerup", dragEnd, true);
            window.removeEventListener("pointercancel", dragEnd, true);
            this.invalidate();
        };
        const armWindow = () => {
            window.addEventListener("pointermove", dragMove, true);
            window.addEventListener("pointerup", dragEnd, true);
            window.addEventListener("pointercancel", dragEnd, true);
        };
        canvas.addEventListener("pointermove", (e) => {
            if (e.pointerType !== "mouse" || barDrag !== null)
                return;
            const p = toLocal(e);
            setHover(findBar(p.x, p.y)?.s ?? null);
        });
        canvas.addEventListener("pointerleave", () => { if (barDrag === null)
            setHover(null); });
        canvas.addEventListener("pointerdown", (e) => {
            const p = toLocal(e);
            const f = findBar(p.x, p.y);
            if (f === null)
                return;
            const g = f.s.barGeom();
            const localY = p.y - f.ay;
            // The CLAIM is the painted bar's pixels only — the wider proximity
            // band is hover-widen territory, and presses there belong to the app
            // (the desktop's inside-edge RESIZE band lives exactly in it).
            const lx = p.x - f.ax;
            const bw = f.s.barWide ? 9 : 5;
            const bx = f.s.width - (f.s.barWide ? 12 : 8);
            if (lx < bx - 1 || lx > bx + bw)
                return;
            if (e.pointerType === "mouse") {
                // on the thumb → grab where held; on the track → jump-to-spot, then grab centered
                let grabDy = localY - g.thumbY;
                if (grabDy < 0 || grabDy > g.thumbH) {
                    f.s.scrubTo(localY - g.thumbH / 2);
                    grabDy = g.thumbH / 2;
                }
                barDrag = { s: f.s, ay: f.ay, grabDy };
                f.s.barWide = true;
                e.stopPropagation();
                e.preventDefault();
                armWindow();
                this.invalidate();
            }
            else {
                // touch: only the THUMB arms, and only a HOLD engages (no hover on
                // touch — hold IS the grab-the-indicator gesture); a pan cancels the arm
                if (localY < g.thumbY || localY > g.thumbY + g.thumbH)
                    return;
                const hold = { s: f.s, ay: f.ay, startY: p.y, engaged: false, timer: 0 };
                hold.timer = window.setTimeout(() => {
                    hold.engaged = true;
                    hold.s.barWide = true;
                    this.invalidate();
                }, 250);
                barHold = hold;
                armWindow();
            }
        }, true);
        // The full-gesture-control clause (Rule 3, viewport-lock.ts): an app that
        // claimed every finger holds the viewport still while a field has focus —
        // the editable overlays live in `host`, so the lock scopes there. Top-level
        // only; an embedded island must not rewrite the host page's viewport.
        if (!embedded && root.claimsAllFingers()) {
            lockFocusZoom(host, () => this.canvas !== null);
        }
        this.invalidate();
    }
    /** Re-brush the shared element's gesture default when the root's
     *  page-scrollability fact changes (CanvasSurface.setPageScrollable). */
    refreshRootTouchAction(s) {
        if (this.canvas !== null && s === this.root)
            this.canvas.style.touchAction = s.rootTouchAction(this.embeddedRoot);
    }
    /** Request a repaint. Every change since the last frame coalesces into one
     *  scheduled requestAnimationFrame; with a paint already pending — or before
     *  attach, whose first paint covers everything — this is a no-op, so an
     *  idle or unattached tree costs nothing. */
    invalidate() {
        if (this.frame !== 0 || this.ctx === null)
            return;
        // Inside an animation frame, paint into THIS frame — a microtask, so it runs
        // after the settle has quiesced but before the browser's render step —
        // rather than booking the next one, which halves the cadence.
        if (inAnimationFrame()) {
            this.frame = MICROTASK_PAINT;
            queueMicrotask(() => {
                if (this.frame !== MICROTASK_PAINT)
                    return;
                this.frame = 0;
                this.paint();
            });
            return;
        }
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
        this.strut?.remove();
        this.strut = null;
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
        // The page realization's STRUT tracks the content extent — the document's
        // scroll range is exactly the scrolling content's reach (visible children
        // that didn't opt out), never more.
        if (this.strut !== null && root.pageRoot) {
            // the extent arrives from the model (setPageExtent — the App's own
            // contentHeight), so no child walk is needed here
            const target = Math.max(root.height, Math.round(root.extentH));
            if (this.strut.style.height !== `${target}px`)
                this.strut.style.height = `${target}px`;
        }
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
    /** This surface's compositing operator (globalCompositeOperation form;
     *  "source-over" = normal painting). See setBlend. */
    blendMode = "source-over";
    /** How many BLENDING surfaces this subtree holds, self included —
     *  maintained incrementally (setBlend / insertChild / destroy) so an
     *  isolating ancestor (a scroller) can know, without walking, that its
     *  content must composite through a group (compositing.md §4.1: blending
     *  never reaches past the nearest isolating ancestor). */
    blends = 0;
    cursorStyle = "";
    /** Uniform scale about (pivotX, pivotY) in this surface's own coordinates;
     *  1 = identity. Applied in the paint walk and inverted in the hit walk. */
    scaleK = 1;
    pivotX = 0;
    pivotY = 0;
    /** Rotation in degrees, clockwise, about the same pivot — paint walk
     *  applies it after scale (they commute for uniform scale); the hit walk
     *  inverts it so a rotated control stays honestly clickable. */
    rotationDeg = 0;
    scrolls = false;
    scrollOffset = 0;
    /** A windowed block's LOGICAL extent (setVirtualExtent — replicate.ts):
     *  the scroll range's floor when only a window of rows exists. */
    virtualExtent = 0;
    /** The overlay scrollbar's WIDE state (pointer near, grabbed, or
     *  touch-held) — proximity widens for a mouse, a hold widens for touch. */
    barWide = false;
    /** The bar's frame-local geometry, or null when nothing overflows. */
    barGeom() {
        if (!this.scrolls || this.pageRoot)
            return null;
        const ext = this.contentExtent();
        if (ext <= this.height + 1)
            return null;
        const trackH = this.height - 4;
        const thumbH = Math.max(24, (this.height / ext) * trackH);
        const maxOff = ext - this.height;
        const thumbY = 2 + (maxOff > 0 ? (this.scrollOffset / maxOff) * (trackH - thumbH) : 0);
        return { trackH, thumbH, thumbY, ext };
    }
    /** Drive the scroll from a bar-scrub position (frame-local thumb top). */
    scrubTo(thumbTop) {
        const g = this.barGeom();
        if (g === null)
            return;
        const span = g.trackH - g.thumbH;
        const frac = span > 0 ? Math.min(1, Math.max(0, (thumbTop - 2) / span)) : 0;
        const next = frac * (g.ext - this.height);
        if (next === this.scrollOffset)
            return;
        this.scrollOffset = next;
        this.onScrollCb?.(next);
        this.compositor.invalidate();
    }
    onScrollCb = null;
    parent = null;
    children = [];
    /** True when this surface opts out of its parent's box/shape clip
     *  (ignoreClip) — the parent's paint/hit brackets skip the clip for it. */
    ignoresClip = false;
    setIgnoreClip(on) {
        this.ignoresClip = on;
    }
    clipData = null;
    /** The BOX-clip (`clip = true`): clip to the surface's own (rounded) box.
     *  A first-class mode, not a baked rect path — the box is read at use time,
     *  so an animating width/height tracks without a re-derive. */
    boxClip = false;
    /** Backend-retained cache of the clip path (never recording state);
     *  rebuilt lazily so setClip stays legal before any canvas exists. For the
     *  box-clip it caches the rounded-box Path2D, invalidated on geometry/
     *  radius change. */
    clipPath = null;
    /** The effective clip as a Path2D: an explicit shape clip, or — for the
     *  box-clip — the surface's own box, rounded by cornerRadius (matching the
     *  DOM backend, where `overflow: clip` follows border-radius). Null =
     *  unclipped. */
    clipPathObj() {
        if (this.clipData !== null) {
            this.clipPath ??= new Path2D(this.clipData);
            return this.clipPath;
        }
        if (this.boxClip) {
            if (this.clipPath === null) {
                const p = new Path2D();
                const r = Math.min(this.cornerRadius, this.width / 2, this.height / 2);
                if (r > 0)
                    p.roundRect(0, 0, this.width, this.height, r);
                else
                    p.rect(0, 0, this.width, this.height);
                this.clipPath = p;
            }
            return this.clipPath;
        }
        return null;
    }
    drawing = null;
    text = "";
    /** Text style pre-resolved at set time — the paint walk does zero
     *  measuring or formatting. */
    font = "";
    textFill = "";
    textGradient = null;
    ascent = 0;
    /** The natural line height (ascent+descent) — the wrapped-line stride, and
     *  what the DOM backend sets as `line-height`, so multi-line agrees. */
    lineHeight = 0;
    textShadow = null;
    letterSpacing = 0;
    /** Wrapping (set-time): whether this run wraps within `width`, its alignment,
     *  and the cached line break — recomputed when text/style/width change so the
     *  paint walk stays measure-free after the first frame. */
    wrap = false;
    align = "left";
    textLines = null;
    image = null;
    stretch = "none";
    /** The view's input route; null = transparent to the pointer (hit walk). */
    sink = null;
    /** The declared-handler facts the router arbitrates with (input.ts). */
    wants = undefined;
    /** The native editable overlay (Layer 3), a DOM element over the canvas; null
     *  = this surface is not an editable text field. */
    editEl = null;
    edit = null;
    constructor(compositor) {
        this.compositor = compositor;
    }
    setX(v) { this.x = v; this.compositor.invalidate(); }
    setY(v) { this.y = v; this.compositor.invalidate(); }
    setWidth(v) { this.width = v; this.box = null; this.textLines = null; if (this.boxClip)
        this.clipPath = null; this.compositor.invalidate(); }
    setHeight(v) { this.height = v; this.box = null; if (this.boxClip)
        this.clipPath = null; this.compositor.invalidate(); }
    setVisible(v) { this.visible = v; this.compositor.invalidate(); }
    setOpacity(o) { this.opacity = o; this.compositor.invalidate(); }
    /** Add `delta` to the blending count of `from` and every ancestor above it
     *  — the incremental half of the `blends` field's contract. */
    static addBlends(from, delta) {
        for (let p = from; p !== null; p = p.parent)
            p.blends += delta;
    }
    /** The frost spec (setBackdrop); null = none. Painted by paintFrost at the
     *  top of paintContent — under the view's own fill, over everything already
     *  on the surface. */
    backdrop = null;
    setBackdrop(spec) {
        this.backdrop = spec;
        this.compositor.invalidate();
    }
    setBlend(mode) {
        // The schema's camelCase token → the canvas operator. The single-surface
        // painter's model realizes §4.1 directly: at the moment this surface
        // lands, everything beneath it inside its isolating group is already
        // painted, so the operator IS the semantics — a leaf simply paints with
        // it; a subtree composites internally first (the opacity-group path) and
        // the finished group lands with it (paint()).
        const op = BLEND_OPS[mode] ?? "source-over";
        if (op === this.blendMode)
            return;
        const was = this.blendMode !== "source-over" ? 1 : 0;
        const now = op !== "source-over" ? 1 : 0;
        this.blendMode = op;
        if (now !== was)
            CanvasSurface.addBlends(this, now - was);
        this.compositor.invalidate();
    }
    // pointer-events is a DOM compositing concept; the canvas paints its own
    // display list and hit-tests it, so there is nothing to yield to here.
    /** Consulted by hit() below — the walk realizes what CSS realizes on DOM. */
    pe = "";
    setPointerEvents(m) { this.pe = m; }
    // Paint-inert: the cursor rides the hover walk (hit() carries it to the
    // router's onHover, which brushes the host element) — nothing to repaint.
    setCursor(c) { this.cursorStyle = c; }
    setScale(scale, px, py) {
        this.scaleK = scale;
        this.pivotX = px;
        this.pivotY = py;
        this.compositor.invalidate();
    }
    setRotation(deg, px, py) {
        this.rotationDeg = deg;
        this.pivotX = px;
        this.pivotY = py;
        this.compositor.invalidate();
    }
    /** Invert this surface's paint transform (scale, then rotation, about the
     *  shared pivot) — the hit walk's transform term, so a transformed view
     *  stays clickable where it is DRAWN. The same inverse interaction.ts
     *  toChildLocal applies in the model walk (the ONE-WALK rule). */
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
        if (this.boxClip)
            this.clipPath = null;
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
    setBoxClip(on) {
        this.boxClip = on;
        this.clipPath = null;
        this.compositor.invalidate();
    }
    setDrawing(list) {
        this.drawing = list;
        releaseRaster(this); // a new recording invalidates the memo by identity
        this.rasterSeen = null;
        this.rasterCostOf = null;
        this.rasterScalePending = null;
        if (this.rasterRestTimer !== 0) {
            clearTimeout(this.rasterRestTimer);
            this.rasterRestTimer = 0;
        }
        this.compositor.invalidate();
    }
    /** @internal the raster memo's per-surface state (module functions manage the pool) */
    rasterEntry = null;
    rasterSeen = null;
    rasterScalePending = null;
    rasterRestTimer = 0;
    rasterCostOf = null;
    /** Paint this view's recording: vectors, or the memoized raster when the
     *  (list, scale) pair is stable — see the module header above. */
    paintDrawing(ctx) {
        const list = this.drawing;
        const b = list.bounds;
        if (b === null)
            return;
        if (globalThis.__declareNoRasterMemo === true) {
            replay(ctx, list);
            return;
        }
        if (this.rasterCostOf === null || this.rasterCostOf.list !== list)
            this.rasterCostOf = { list, cost: replayCost(list) };
        memoPaints++;
        if (this.rasterCostOf.cost === "cheap") {
            replay(ctx, list);
            return;
        }
        const m = ctx.getTransform();
        // rotation/skew keeps pure vectors (a resampled blit would soften — rare,
        // and the memo is an optimization, never a semantic)
        if (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6 || m.a <= 0 || m.d <= 0) {
            replay(ctx, list);
            return;
        }
        const sx = Math.round(m.a * 1e4) / 1e4;
        const sy = Math.round(m.d * 1e4) / 1e4;
        const e = this.rasterEntry;
        if (e !== null && e.list === list && e.sx === sx && e.sy === sy) {
            e.stamp = ++memoStamp;
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(e.canvas, m.e + m.a * e.bx, m.f + m.d * e.by);
            ctx.restore();
            return;
        }
        if (e !== null && e.list === list) {
            // SCALE CHANGED, original in hand: the stretch grace (DT's rule — see
            // RASTER_GRACE_MS). Transitional frames blit the prior raster scaled —
            // the DOM compositor's own move — and once the scale has been quiet
            // for the beat, the frame after is exact. Rest must SCHEDULE that
            // frame: a settled scene stops compositing, so the timer below asks
            // for the one repaint that snaps it crisp.
            const now = performance.now();
            const pend = this.rasterScalePending;
            if (pend === null || pend.sx !== sx || pend.sy !== sy) {
                this.rasterScalePending = { sx, sy, since: now };
            }
            const stable = this.rasterScalePending;
            if (now - stable.since < RASTER_GRACE_MS) {
                e.stamp = ++memoStamp;
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.drawImage(e.canvas, m.e + m.a * e.bx, m.f + m.d * e.by, e.canvas.width * (sx / e.sx), e.canvas.height * (sy / e.sy));
                ctx.restore();
                if (this.rasterRestTimer !== 0)
                    clearTimeout(this.rasterRestTimer);
                this.rasterRestTimer = setTimeout(() => { this.rasterRestTimer = 0; this.compositor.invalidate(); }, RASTER_GRACE_MS + 15);
                return;
            }
            this.rasterScalePending = null; // quiet for the beat: fall through to the exact raster
        }
        // promotion by STABILITY for a NEW list: raster only when the same key
        // repeats — content re-recorded every frame keeps pure vector replay
        const seen = this.rasterSeen;
        this.rasterSeen = { list, sx, sy };
        if (e === null && (seen === null || seen.list !== list)) {
            replay(ctx, list);
            return;
        }
        memoAttempts++;
        const root = this.compositor.rootCanvas;
        // blur/shadow paint past inexact bounds — overscan by the computed bleed
        const pad = rasterPad(list);
        const bx = b.x - pad, by = b.y - pad;
        const w = Math.ceil((b.w + 2 * pad) * sx);
        const h = Math.ceil((b.h + 2 * pad) * sy);
        const bytes = w * h * 4;
        if (w < 1 || h < 1 || w > RASTER_MAX_DIM || h > RASTER_MAX_DIM || w * h > RASTER_MAX_AREA || bytes > rasterEntryCap(viewportBytes(root))) {
            replay(ctx, list);
            return;
        }
        releaseRaster(this);
        while (memoBytes + bytes > rasterTotalCap(viewportBytes(root))) {
            if (!evictOldest(this)) {
                replay(ctx, list);
                return;
            }
        }
        let cv;
        try {
            cv = document.createElement("canvas");
            cv.width = w;
            cv.height = h;
            const c2 = cv.getContext("2d");
            if (c2 === null)
                throw new Error("no 2d context");
            c2.setTransform(sx, 0, 0, sy, -bx * sx, -by * sy);
            replay(c2, list);
            // the platform may silently drop a raster later (GPU process restart);
            // a lost context releases the entry and the next paint re-derives
            cv.addEventListener?.("contextlost", () => { releaseRaster(this); this.compositor.invalidate(); });
        }
        catch (err) {
            globalThis.__declareRasterErr = String(err);
            replay(ctx, list); // a refused allocation is a slow frame, never a wrong one
            return;
        }
        this.rasterEntry = { list, sx, sy, canvas: cv, bytes, bx, by, stamp: ++memoStamp };
        memoBytes += bytes;
        memoHolders.add(this);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(cv, m.e + m.a * bx, m.f + m.d * by);
        ctx.restore();
    }
    setText(text) {
        this.text = text;
        this.textLines = null;
        this.compositor.invalidate();
    }
    setTextStyle(st) {
        this.font = fontString(st);
        this.textFill = colorToCss(st.color);
        this.textGradient = st.textFill != null && isGradient(st.textFill) ? st.textFill : null;
        const fm = fontMetrics(this.font);
        this.ascent = fm.ascent;
        this.lineHeight = st.lineHeight != null && st.lineHeight > 0
            ? Math.round(st.fontSize * st.lineHeight)
            : fm.ascent + fm.descent;
        this.textShadow = st.shadow ?? null;
        this.letterSpacing = st.letterSpacing;
        this.wrap = st.wrap ?? false;
        this.align = st.align ?? "left";
        this.textLines = null;
        this.compositor.invalidate();
    }
    setImage(image) {
        this.image = image;
        this.tinted = null;
        this.compositor.invalidate();
    }
    /** Tint (compositing.md §3.4): a `source-in` fill over the drawn bitmap in
     *  an offscreen — result color = tint, alpha = the bitmap's — cached at
     *  natural size until the image or the tint changes (a playing video
     *  re-tints per frame; its pixels change with no write to the graph). */
    tintColor = null;
    tinted = null;
    setImageTint(color) {
        this.tintColor = color;
        this.tinted = null;
        this.compositor.invalidate();
    }
    tintedBitmap(natW, natH) {
        if (this.tintColor === null || this.image === null)
            return this.image;
        if (natW <= 0 || natH <= 0)
            return this.image;
        if (this.tinted === null || this.videoRunning()) {
            const c = this.tinted ?? document.createElement("canvas");
            c.width = natW;
            c.height = natH;
            const tctx = c.getContext("2d");
            tctx.clearRect(0, 0, natW, natH);
            tctx.drawImage(this.image, 0, 0, natW, natH);
            tctx.globalCompositeOperation = "source-in";
            tctx.fillStyle = colorToCss(this.tintColor);
            tctx.fillRect(0, 0, natW, natH);
            tctx.globalCompositeOperation = "source-over";
            this.tinted = c;
        }
        return this.tinted;
    }
    /** A PLAYING video is the one content kind whose pixels change with no write
     *  to the graph: nothing invalidates, so nothing would repaint. The paint
     *  walk asks this after drawing and schedules the next frame while it is
     *  true — the loop lives here rather than behind a new Surface call, because
     *  the DOM backend needs no such thing (the element composites itself).
     *  Duck-typed, not `instanceof`: HTMLVideoElement does not exist in Node. */
    videoRunning() {
        const v = this.image;
        return v !== null && typeof v.paused === "boolean" && !v.paused && !v.ended;
    }
    setImageStretch(stretch) {
        this.stretch = stretch;
        this.compositor.invalidate();
    }
    setInput(sink, wants) {
        this.sink = sink; // input state changes no pixels — no invalidate
        this.wants = wants;
    }
    /** `ignoreScroll` (backend.ts): this surface rides its nearest enclosing
     *  scroll frame. The walks realize it — paint/hit/extent treat a flagged
     *  child of a scroller as UNSHIFTED by that scroller's offset (it stands
     *  against the frame) and exclude it from the scroll range. */
    ignoresScroll = false;
    setIgnoreScroll(on) {
        this.ignoresScroll = on;
        this.compositor.invalidate();
    }
    /** ROOT only (backend.ts): the App's reactive page-scrollability fact —
     *  keys the shared element's gesture default (rootTouchAction). */
    extentW = 0;
    extentH = 0;
    setPageExtent(w, h) {
        if (this.extentW === w && this.extentH === h)
            return;
        this.extentW = w;
        this.extentH = h;
        this.compositor.refreshRootTouchAction(this);
        this.compositor.invalidate(); // the strut tracks the extent per paint
    }
    /** This surface is THE PAGE: the root whose scroll regime the browser owns
     *  (Compositor.attach converts the root's pane scroll into this — the
     *  canvas rides fixed, an inert strut gives the document its extent, and
     *  `scrollOffset` mirrors the window's own scroll). Paint and hit treat it
     *  as a scroller; scrollBy/wheelTo do NOT consume for it — the browser
     *  scrolls the page natively. */
    pageRoot = false;
    /** The ROOT surface's touch-action for the shared canvas element — the DOM
     *  root's same defaults (dom-backend refreshTouchAction): an App that
     *  claimed the raw touch family owns every finger; one that claimed the
     *  drag keeps only pinch for the user; otherwise pan stays with the user
     *  exactly when the page can scroll (the App's reactive fact, above) and
     *  retires when it can't. Double-tap zoom retires everywhere — a painted
     *  UI can never concede it. */
    rootTouchAction(embedded = false) {
        if (this.wants?.wantsTouch === true)
            return "none";
        if (this.wants?.wantsDrag === true)
            return "pinch-zoom";
        // an embedded island's box has nothing to scroll, but the finger belongs
        // to the host page's regime — retiring pan here would eat every swipe
        // that starts over the island. `manipulation`: pan and pinch chain to
        // the host, double-tap zoom retires (a painted UI never concedes it).
        if (embedded)
            return "manipulation";
        const de = typeof document !== "undefined" ? document.documentElement : null;
        const effH = this.scrolls || this.pageRoot ? Math.max(this.height, this.extentH) : this.height;
        const pan = de !== null && (this.width > de.clientWidth + 1 || effH > de.clientHeight + 1);
        return pan ? "manipulation" : "pinch-zoom";
    }
    /** Did this (root) view declare the raw touch family — the full-gesture-
     *  control fact the compositor's focus-zoom lock keys on. */
    claimsAllFingers() {
        return this.wants?.wantsTouch === true;
    }
    /** The gesture CLAIM over a point: the union of declared claims of the view
     *  under it and its ancestors — a claim covers its subtree, mirroring the
     *  DOM, where an element's effective touch-action intersects along its
     *  ancestor chain. Read once at gesture start (the compositor's touchstart). */
    claimAt(px, py) {
        const c = { touch: false, pinch: false, drag: false };
        const t = this.hit(px, py);
        for (let s = t !== null ? t.key : null; s !== null; s = s.parent) {
            if (s.wants?.wantsTouch === true)
                c.touch = true;
            // the pinch claim covers its subtree: two fingers over it are the
            // app's, single-finger pan stays the enclosing regime's
            if (s.wants?.wantsPinch === true)
                c.pinch = true;
            // a hold-gated drag view (onHold + the drag pair) claims nothing at
            // touchdown — its claim engages at the hold (holdCaptureActive).
            // The INNERMOST drag view's declared axis is the claim's scope
            // (claim-surface.md, D8): first found wins, never widened by an outer.
            if (s.wants?.wantsDrag === true && s.wants?.wantsHold !== true && c.drag === false) {
                c.drag = s.wants.claimAxis ?? "both";
            }
        }
        return c;
    }
    /** Deliver a wheel at (px,py) — PARENT-local, mirroring hit's transform —
     *  to the nearest enclosing view claiming the wheel stream (wantsWheel),
     *  unless a scrolling pane sits nearer the pointer, which keeps its wheel
     *  (delegation beats a claim — the DOM backend's exact arbitration). A
     *  positional descent like scrollBy, NOT the hit chain: a scroller has no
     *  sink, so hit() would walk straight past it. Returns "claimed" when
     *  delivered, "scroller" when a nearer pane owns it (scrollBy's business),
     *  null when the point met neither. */
    wheelTo(px, py, deltaX, deltaY, pinch) {
        if (!this.visible)
            return null;
        let lx = px - this.x;
        let ly = py - this.y;
        [lx, ly] = this.invertTransform(lx, ly);
        const cp = this.clipPathObj();
        if (cp !== null && !hitCtx().isPointInPath(cp, lx, ly))
            return null;
        const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
        if (this.scrolls && !inBox)
            return null;
        const cy = this.scrolls ? ly + this.scrollOffset : ly;
        for (let i = this.children.length - 1; i >= 0; i--) {
            const c = this.children[i];
            const r = c.wheelTo(lx, c.ignoresScroll ? ly : cy, deltaX, deltaY, pinch);
            if (r !== null)
                return r;
        }
        if (this.wants?.wantsWheel === true && this.sink !== null && inBox) {
            this.sink("wheel", lx, ly, { deltaX, deltaY, pinch });
            return "claimed";
        }
        // the page root's wheel is the browser's own — never consumed here
        return this.scrolls && !this.pageRoot && inBox ? "scroller" : null;
    }
    setEditable(spec) {
        if (spec === null) {
            this.editEl?.remove();
            this.editEl = null;
            this.edit = null;
            this.maybeUnregisterOverlay(); // the embed overlay may still ride this surface
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
            // Parity with the DOM backend's editable: the field's inset, the
            // spellcheck election, and the wrap mode all come from the one spec —
            // the overlay is the same editable, positioned differently.
            el.spellcheck = spec.spellcheck;
            el.style.padding = spec.padding > 0 ? `${spec.padding}px` : "0";
            if (el instanceof HTMLTextAreaElement) {
                el.wrap = spec.wrap ? "soft" : "off";
                el.style.whiteSpace = spec.wrap ? "pre-wrap" : "pre";
                el.style.overflow = "auto";
            }
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
        if (this.pendingEmbed !== null) {
            const p = this.pendingEmbed;
            this.pendingEmbed = null;
            this.setEmbed(p.id, p.view);
        }
    }
    /** Glue the overlay to the surface's on-screen box: accumulate x/y up the
     *  parent chain (canvas-logical coordinates ARE host CSS pixels — dpr lives
     *  in the paint transform, not here) and hide it if any ancestor is
     *  invisible. Called each paint by the compositor so it tracks motion. */
    reposition() {
        if (this.editEl === null && this.embedEl === null)
            return;
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
        for (let s = this; s !== null; s = s.parent) {
            if (!s.visible)
                shown = false;
            // A SCROLLER frame-bounds its subtree exactly as paint does — without
            // this, a scrolled-away field's overlay floated outside the pane.
            if (s.clipData !== null || s.boxClip || s.scrolls) {
                // Every calendar clip is a box (clip=true → rect(0,0,width,height)); an
                // ancestor's box, expressed in this surface's local space, is [-ax..width-ax].
                clipped = true;
                if (-ax > clipL)
                    clipL = -ax;
                if (-ay > clipT)
                    clipT = -ay;
                if (s.width - ax < clipR)
                    clipR = s.width - ax;
                if (s.height - ay < clipB)
                    clipB = s.height - ay;
            }
            ax += s.x;
            ay += s.y;
            // the paint transform's missing term (found live: editable titles held
            // still while the grid scrolled beneath them): a scrolling parent
            // TRANSLATES its content — the overlay must ride the same translation
            const p = s.parent;
            if (p !== null && p.scrolls && !s.ignoresScroll)
                ay -= p.scrollOffset;
        }
        // one geometry, applied to every overlay this surface carries — the
        // editable field and/or a foreign island's box (both are host-level
        // siblings the compositor's own clip never touches)
        for (const el of [this.editEl, this.embedEl]) {
            if (el === null)
                continue;
            const st = el.style;
            st.left = ax + "px";
            st.top = ay + "px";
            st.width = this.width + "px";
            st.height = this.height + "px";
            // Visible slice = the overlay box ∩ the accumulated clip; empty ⇒ fully
            // clipped away (hide it, like the DOM field vanishing behind clip-path).
            let elShown = shown;
            if (clipped) {
                const visL = Math.max(0, clipL);
                const visT = Math.max(0, clipT);
                const visR = Math.min(this.width, clipR);
                const visB = Math.min(this.height, clipB);
                if (visR <= visL || visB <= visT) {
                    elShown = false;
                    st.clipPath = "";
                }
                else {
                    st.clipPath = `inset(${visT}px ${this.width - visR}px ${this.height - visB}px ${visL}px)`;
                }
            }
            else {
                st.clipPath = "";
            }
            st.display = elShown ? "" : "none";
        }
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
        // OPACITY IS PAINT, NOT PRESENCE: a fully transparent view is still hittable
        // — the DOM backend inherits that from CSS, and the corpus relies on it (a
        // transparent view as a press-catcher is a standing idiom, and an author who
        // wants a fade to become absence writes it: `visible = { opacity > 0 }`,
        // three places in the corpus). Skipping opacity-0 here made this walk
        // disagree with both the DOM router AND the `hovered` intrinsic, which
        // considers only `visible`. The gates that mean "not there" are `visible`
        // and `pointerEvents`; this is not one of them.
        if (!this.visible)
            return null;
        // The other gate. "none" is INHERITED, not subtree-final: it makes this
        // view pointer-transparent; it does NOT seal the subtree. Descend anyway
        // and let each child answer for itself — which is what the DOM reference
        // does, because dom-backend gives any view carrying a sink
        // `pointer-events: auto`, and an explicit value beats an inherited one.
        // Returning null here skipped the subtree outright, so the documented
        // "full-viewport chrome overlay" could hold nothing interactive.
        // MEASURED (transparent root; an `auto` panel and a plain handler-bearing
        // child, one click each): before DOM 1/101, canvas 0/0, mac 0/0 — after,
        // all three 1/101. The gate below decides only whether THIS view is the
        // target.
        let lx = px - this.x;
        let ly = py - this.y;
        // Invert the paint transform so the point lands in the subtree's own
        // (untransformed) coordinates — a scaled or rotated view stays clickable
        // where drawn.
        [lx, ly] = this.invertTransform(lx, ly);
        const cpHit = this.clipPathObj();
        if (cpHit !== null && !hitCtx().isPointInPath(cpHit, lx, ly)) {
            // outside this surface's clip only its ignoreClip children remain live
            const cyx = this.scrolls ? ly + this.scrollOffset : ly;
            for (let i = this.children.length - 1; i >= 0; i--) {
                const c = this.children[i];
                if (!c.ignoresClip)
                    continue;
                const t = c.hit(lx, cyx);
                if (t !== null)
                    return t;
            }
            return null;
        }
        // A scroll container clips to its box and offsets its content — hit-test
        // children in the SAME frame the paint walk draws them.
        const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
        if (this.scrolls && !inBox)
            return null;
        const cy = this.scrolls ? ly + this.scrollOffset : ly;
        if (this.scrolls) {
            // frame chrome (ignoreScroll) rides the frame and paints ABOVE the
            // scrolled content — hit it first, at UNSHIFTED coordinates
            for (let i = this.children.length - 1; i >= 0; i--) {
                const c = this.children[i];
                if (!c.ignoresScroll)
                    continue;
                const t = c.hit(lx, ly);
                if (t !== null)
                    return t;
            }
        }
        for (let i = this.children.length - 1; i >= 0; i--) {
            const c = this.children[i];
            if (this.scrolls && c.ignoresScroll)
                continue;
            const t = c.hit(lx, cy);
            if (t !== null)
                return t;
        }
        // A pointer-transparent view is a corridor, not a target: its children were
        // already offered the point above, so an `auto` descendant has taken it.
        if (this.sink !== null && inBox && this.pe !== "none") {
            // the nearest PINCH OWNER up the chain (self included) — the claim
            // covers a subtree, so the gesture belongs to the declaring ancestor
            let pinch;
            for (let s = this; s !== null; s = s.parent) {
                if (s.wants?.wantsPinch === true && s.sink !== null) {
                    pinch = { key: s, sink: s.sink };
                    break;
                }
            }
            return { key: this, sink: this.sink, ...this.wants, pinch, x: lx, y: ly, cursor: this.cursorStyle !== "" ? this.cursorStyle : undefined };
        }
        return null;
    }
    setScroll(on, onScroll) {
        this.scrolls = on;
        this.onScrollCb = on ? onScroll : null;
        if (!on)
            this.scrollOffset = 0;
    }
    setVirtualExtent(h) {
        const v = h ?? 0;
        if (v === this.virtualExtent)
            return;
        this.virtualExtent = v;
        this.compositor.invalidate();
    }
    /** Content extent along y — the real children floor'd by the virtual one. */
    contentExtent() {
        let extent = this.virtualExtent;
        for (const c of this.children)
            if (c.visible && !c.ignoresScroll)
                extent = Math.max(extent, c.y + c.height);
        return extent;
    }
    // Horizontal scroll is a DOM-backend affordance for now (code blocks); the canvas
    // compositor's x-scroll is a later addition, so this is a no-op here (over-wide
    // content simply isn't clipped on canvas — the docs render on DOM).
    setScrollX(_on, _onScroll) { }
    // Native rich-text flow is a DOM affordance; on canvas the RichText component lays
    // the runs out as child views itself. -1 signals "not handled, fall back".
    setRichContent() { return -1; }
    /** Reveal a heading anchor inside a flow (location.md §6). On canvas there is no
     *  element to scroll — the flow gave us the heading's y offset (`within`) inside
     *  this surface, so reveal is a `scrollIntoView` clamped to that offset. `within`
     *  < 0 means the flow hasn't laid the heading out yet — not handled. `slug` is
     *  the DOM path's key; here the offset already resolved it. */
    revealRichAnchor(_slug, within, inset = 0) {
        if (within < 0)
            return false;
        // `inset` (location.md §0.5.4): land short of the top — the clamp's twin
        // of the DOM path's scroll-margin.
        this.scrollIntoView(within - inset);
        return true;
    }
    /** The write half of `scrollY` — same clamp as scrollBy, so a program write
     *  lands exactly where a user scroll would. (No scrollToX: this backend has
     *  no horizontal scroll state yet — the attribute push optional-calls.) */
    scrollToY(v) {
        if (!this.scrolls)
            return;
        const extent = this.contentExtent();
        const next = Math.min(Math.max(0, extent - this.height), Math.max(0, v));
        if (next === this.scrollOffset)
            return;
        this.scrollOffset = next;
        this.onScrollCb?.(next);
        this.compositor.invalidate();
    }
    /** Scroll this surface to the top of its nearest scrolling ancestor — the
     *  canvas twin of DOM's native scrollIntoView. Sums local offsets up to the
     *  scroll container, clamps to its content extent (the same math scrollBy
     *  uses), sets the offset, mirrors it into `scrollY`, and repaints. `within` (px)
     *  targets a point INSIDE this surface (a heading's offset) instead of its top.
     *  "nearest" scrolls the minimum distance that reveals the surface — nothing
     *  when it is already visible (the keyboard traversal's reveal). */
    scrollIntoView(align = 0, _smooth = false, inset = 0) {
        const within = (typeof align === "number" ? align : 0) - inset;
        let cur = this;
        let off = 0;
        while (cur.parent !== null && !cur.parent.scrolls) {
            off += cur.y;
            cur = cur.parent;
        }
        const sc = cur.parent;
        if (sc === null)
            return; // nothing scrolls above us
        off += cur.y + within; // cur is the scroll container's direct child
        const max = Math.max(0, sc.contentExtent() - sc.height);
        let next = Math.min(max, Math.max(0, off));
        if (align === "nearest") {
            const top = sc.scrollOffset, bottom = top + sc.height;
            if (off >= top && off + this.height <= bottom)
                return; // already visible
            next = off < top ? Math.max(0, off) : Math.min(max, off + this.height - sc.height);
        }
        if (next !== sc.scrollOffset) {
            if (sc.pageRoot) {
                // the page root's offset is the window's — ask the browser, and let
                // the compositor's scroll listener mirror it back
                window.scrollTo({ top: next });
                return;
            }
            sc.scrollOffset = next;
            sc.onScrollCb?.(next);
            this.compositor.invalidate();
        }
    }
    /** Two island realizations, split by the slot's PROTOCOL:
     *
     *   `run:` — an APPISLAND: the tenant is a Declare program, so it needs no
     *   element at all — it mounts by SURFACE COMPOSITION (the mac backend's
     *   own pattern; boot.ts mountEmbeddedApp inserts the child's root surface
     *   right here, and the paint and hit walks reach it like anything else).
     *
     *   anything else — FOREIGN content: it cannot live inside the sealed
     *   surface, so the island realizes as a positioned DOM OVERLAY over the
     *   canvas — the editable field's own mechanism, shared: same host, same
     *   per-paint reposition, same ancestor clipping. The overlay carries the
     *   `data-declare-slot` attribute and the `__declareIsland` handle, so a
     *   page script finds and speaks to it exactly as on the DOM backend. */
    setEmbed(id, view) {
        if (id === "" || id.startsWith("run:")) {
            if (this.embedEl !== null) {
                this.embedEl.remove();
                this.embedEl = null;
                this.maybeUnregisterOverlay();
            }
            this.pendingEmbed = null;
            notifyIslandSlot({ view, el: null, slot: id });
            return;
        }
        const host = this.compositor.hostElement();
        if (host === null) {
            // pre-attach (the attach walk marks slots before the host exists) —
            // remountEditable() replays this once the compositor has its element
            this.pendingEmbed = { id, view };
            this.compositor.registerEditable(this);
            return;
        }
        let el = this.embedEl;
        if (el === null) {
            el = document.createElement("div");
            const st = el.style;
            st.position = "absolute";
            st.margin = "0";
            st.overflow = "hidden";
            host.appendChild(el);
            this.embedEl = el;
            this.compositor.registerEditable(this);
        }
        el.dataset.declareSlot = id;
        const box = el;
        const fh = view?.foreignHandle;
        if (typeof fh === "function")
            box.__declareIsland = fh.call(view);
        this.reposition();
        notifyIslandSlot({ view, el, slot: id });
    }
    embedEl = null;
    pendingEmbed = null;
    maybeUnregisterOverlay() {
        if (this.editEl === null && this.edit === null && this.embedEl === null && this.pendingEmbed === null)
            this.compositor.unregisterEditable(this);
    }
    /** Route a wheel delta to the innermost scrolling surface under (px,py) in
     *  PARENT-local space; true when consumed. Mirrors hit's transform so it
     *  targets exactly what the user sees; the compositor requests the repaint. */
    scrollBy(px, py, dy) {
        // Opacity is paint, not presence — a wheel is input, routed by position, and
        // it reaches a transparent scroller exactly as a click reaches a transparent
        // sink (see hit()). Only `visible` means "not there".
        if (!this.visible)
            return false;
        const lx = px - this.x;
        const ly = py - this.y;
        const cpScroll = this.clipPathObj();
        if (cpScroll !== null && !hitCtx().isPointInPath(cpScroll, lx, ly))
            return false;
        const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
        if (this.scrolls && !inBox)
            return false;
        const cy = this.scrolls ? ly + this.scrollOffset : ly;
        for (let i = this.children.length - 1; i >= 0; i--) {
            const c = this.children[i];
            if (c.scrollBy(lx, this.scrolls && c.ignoresScroll ? ly : cy, dy))
                return true;
        }
        // the page root's own scroll is the browser's — never consumed here
        if (this.scrolls && !this.pageRoot && inBox) {
            const max = Math.max(0, this.contentExtent() - this.height);
            const next = Math.min(max, Math.max(0, this.scrollOffset + dy));
            if (next !== this.scrollOffset) {
                this.scrollOffset = next;
                this.onScrollCb?.(next);
            }
            return true;
        }
        return false;
    }
    /** Where this surface lived before travelWith moved it (null = at home). */
    travelHomeSurface = null;
    /** Travel with a scroller (the FocusRing's ride — DOM re-parents the
     *  element; here the surface re-homes in the tree, so it paints inside
     *  the scroller's clip AND scroll translate, last = above the rows). */
    travelWith(host) {
        if (host === null) {
            if (this.travelHomeSurface !== null) {
                this.travelHomeSurface.insertChild(this, null);
                this.travelHomeSurface = null;
            }
            return;
        }
        const h = host;
        if (this.parent === h)
            return;
        if (this.travelHomeSurface === null)
            this.travelHomeSurface = this.parent;
        if (this.parent !== null) {
            const sib = this.parent.children;
            const i = sib.indexOf(this);
            if (i >= 0)
                sib.splice(i, 1);
        }
        h.insertChild(this, null);
    }
    isTraveling() { return this.travelHomeSurface !== null; }
    insertChild(child, before) {
        const c = child;
        const existing = this.children.indexOf(c);
        if (existing >= 0)
            this.children.splice(existing, 1); // a re-insert is a move
        else if (c.parent !== this && c.blends > 0) {
            // arriving from elsewhere: its blending count moves ancestor chains
            if (c.parent !== null)
                CanvasSurface.addBlends(c.parent, -c.blends);
            CanvasSurface.addBlends(this, c.blends);
        }
        c.parent = this;
        const at = before === null ? -1 : this.children.indexOf(before);
        this.children.splice(at < 0 ? this.children.length : at, 0, c);
        this.compositor.invalidate();
    }
    destroy() {
        releaseRaster(this); // the memo pool must not outlive the surface
        if (this.rasterRestTimer !== 0) {
            clearTimeout(this.rasterRestTimer);
            this.rasterRestTimer = 0;
        }
        this.editEl?.remove();
        this.editEl = null;
        this.embedEl?.remove();
        this.embedEl = null;
        this.pendingEmbed = null;
        this.compositor.unregisterEditable(this);
        if (this.parent !== null) {
            if (this.blends > 0)
                CanvasSurface.addBlends(this.parent, -this.blends);
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
        if (this.scaleK !== 1 || this.rotationDeg !== 0) {
            // scale, then rotate, about the shared pivot (the documented order —
            // commutative for uniform scale)
            ctx.translate(this.pivotX, this.pivotY);
            if (this.scaleK !== 1)
                ctx.scale(this.scaleK, this.scaleK);
            if (this.rotationDeg !== 0)
                ctx.rotate((this.rotationDeg * Math.PI) / 180);
            ctx.translate(-this.pivotX, -this.pivotY);
        }
        // A blending view lands with its operator from here on — set BEFORE the
        // shadow so the whole unit (shadow included) blends, the way a CSS
        // mix-blend-mode element's box-shadow blends with it. The save() above
        // restores source-over after this subtree.
        if (this.blendMode !== "source-over")
            ctx.globalCompositeOperation = this.blendMode;
        // The box's own drop shadow is painted BEFORE the clip, so it escapes the
        // view's overflow exactly as a CSS box-shadow escapes overflow:hidden.
        // (paintBox no longer casts it — it would land inside the clip.)
        if (this.shadow !== null && this.width > 0 && this.height > 0) {
            this.box ??= boxShape(this.width, this.height, this.cornerRadius);
            paintBoxShadow(ctx, this.box, this.shadow);
        }
        const cpPaint = this.clipPathObj();
        // Offscreen-group cases (one layer, three reasons — compositing.md §4.1):
        // a translucent subtree (the R1 opacity group); a blending view WITH
        // children (the subtree composites internally first, then the finished
        // group lands with the operator — leaf-only blending would pass a naive
        // probe and be wrong in real programs); and a scroller whose CONTENT
        // blends (a scroller is an isolating boundary, so blending must not
        // reach past its content group — the `blends` count knows without
        // walking; the count includes this surface itself, whose own blend is
        // the outside world's business, hence the subtraction).
        const group = this.opacity < 1
            || (this.blendMode !== "source-over" && this.children.length > 0)
            || (this.scrolls && this.blends > (this.blendMode !== "source-over" ? 1 : 0));
        // ignoreClip children paint OUTSIDE the clip bracket, in their declared
        // stacking side (leading exempt run below the clipped set, the rest
        // above) — mirroring the DOM's element partition. Only taken on the
        // plain path: under a group layer the whole subtree composites as one
        // (a clipped exempt child there is the documented edge).
        const exempt = cpPaint !== null && !group && this.children.some((c) => c.ignoresClip);
        if (exempt) {
            let i = 0;
            while (i < this.children.length && this.children[i].ignoresClip) {
                this.children[i].paint(ctx);
                i++;
            }
            ctx.save();
            ctx.clip(cpPaint);
            this.paintContent(ctx, true);
            ctx.restore();
            for (let j = i; j < this.children.length; j++) {
                if (this.children[j].ignoresClip)
                    this.children[j].paint(ctx);
            }
            ctx.restore();
            return;
        }
        if (cpPaint !== null)
            ctx.clip(cpPaint);
        if (group)
            this.paintLayer(ctx);
        else
            this.paintContent(ctx);
        ctx.restore();
    }
    /** The offscreen GROUP: the subtree paints normally (source-over, full
     *  alpha) into a layer sharing the target's device size and transform,
     *  then lands in one drawImage carrying the ambient state — this surface's
     *  opacity, and (when it blends) the operator paint() already set on the
     *  shared ctx — an identity-transform, pixel-aligned blit (no resampling)
     *  that still honors the ambient clip. Group opacity, group blending, and
     *  scroller isolation are all this one landing. The cost exists only where
     *  a group does; sizing layers to subtree bounds and pooling them are
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
    /** The sample-under frost (compositing.md §5.2), which the single-surface
     *  painter's model makes natural: at the moment this surface paints,
     *  everything beneath it is already on the target — capture the view's
     *  region over-scanned by the blur radius (so edges do not bleed dry),
     *  redraw it through `ctx.filter = blur() saturate()` clipped to the
     *  view's own painted shape, and let paintBox lay the fill over it.
     *  Region-bounded; inside a group layer the target IS the group, so the
     *  sample honors the same isolation blending does (§4.2). Re-sampling
     *  happens for free: the compositor repaints the scene when anything
     *  invalidates, so a frosted region follows under-content change without
     *  its own bookkeeping (the adaptive-draw-cache interaction stated in the
     *  plan — invalidation is under-content-driven, never own-state-driven). */
    paintFrost(ctx) {
        const b = this.backdrop;
        if (this.width <= 0 || this.height <= 0)
            return;
        const m = ctx.getTransform();
        // the device-space bounding box of the padded local box — corner-mapped,
        // so a rotated ancestor (rotation landed with Part II) still samples the
        // right region; the blur scale is the transform's magnitude, which is
        // m.a when the walk is translate+scale only
        const scaleMag = Math.hypot(m.a, m.b);
        const pad = b.blur;
        const cs = [[-pad, -pad], [this.width + pad, -pad], [-pad, this.height + pad], [this.width + pad, this.height + pad]]
            .map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
        const dx0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[0]))));
        const dy0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[1]))));
        const dx1 = Math.min(ctx.canvas.width, Math.ceil(Math.max(...cs.map((c) => c[0]))));
        const dy1 = Math.min(ctx.canvas.height, Math.ceil(Math.max(...cs.map((c) => c[1]))));
        const dw = dx1 - dx0, dh = dy1 - dy0;
        if (dw <= 0 || dh <= 0)
            return;
        const snap = document.createElement("canvas");
        snap.width = dw;
        snap.height = dh;
        snap.getContext("2d").drawImage(ctx.canvas, dx0, dy0, dw, dh, 0, 0, dw, dh);
        ctx.save();
        // clip to the view's own painted shape (rounded box; an explicit shape
        // clip from paint()'s bracket composes by intersection)
        this.box ??= boxShape(this.width, this.height, this.cornerRadius);
        ctx.clip(this.box);
        // blur is stated in view px; the filter runs in device space
        ctx.filter = `blur(${b.blur * scaleMag}px) saturate(${b.saturate})`;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(snap, dx0, dy0);
        ctx.restore();
    }
    /** Paint order: box (shadow, fill, inside border), image, drawing, text,
     *  then children — the same content order the DOM backend's element order
     *  produces. */
    paintContent(ctx, skipExempt = false) {
        if (this.backdrop !== null)
            this.paintFrost(ctx);
        this.paintBox(ctx);
        if (this.image !== null) {
            const st = this.stretch;
            // an <img> reports naturalWidth, a <video> videoWidth — one fact, two spellings
            const vid = this.image;
            const natW = typeof vid.videoWidth === "number" ? vid.videoWidth : this.image.naturalWidth;
            const natH = typeof vid.videoWidth === "number" ? vid.videoHeight : this.image.naturalHeight;
            const bmp = this.tintedBitmap(natW, natH) ?? this.image;
            if (st === "cover" || st === "contain") {
                // Aspect-preserving: one scale for both axes — max fills-and-crops
                // (cover), min letterboxes (contain) — centered either way; cover
                // clips to the box, exactly object-fit's crop.
                const sc = natW > 0 && natH > 0
                    ? (st === "cover" ? Math.max : Math.min)(this.width / natW, this.height / natH)
                    : 0;
                const dw = natW * sc;
                const dh = natH * sc;
                if (st === "cover") {
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(0, 0, this.width, this.height);
                    ctx.clip();
                }
                ctx.drawImage(bmp, (this.width - dw) / 2, (this.height - dh) / 2, dw, dh);
                if (st === "cover")
                    ctx.restore();
            }
            else {
                const w = st === "width" || st === "both" ? this.width : natW;
                const h = st === "height" || st === "both" ? this.height : natH;
                ctx.drawImage(bmp, 0, 0, w, h);
            }
            // a running video changes pixels with no write to the graph: ask for the
            // next frame here, or the picture would freeze on its first one
            if (this.videoRunning())
                this.compositor.invalidate();
        }
        if (this.drawing !== null)
            this.paintDrawing(ctx);
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
            const lsCtx = ctx;
            if (this.letterSpacing !== 0)
                lsCtx.letterSpacing = this.letterSpacing + "px";
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
            }
            else {
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
            if (restoreShadow)
                ctx.restore();
            if (this.letterSpacing !== 0)
                lsCtx.letterSpacing = "0px";
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
            for (const child of this.children) {
                if ((skipExempt && child.ignoresClip) || child.ignoresScroll)
                    continue;
                child.paint(ctx);
            }
            ctx.restore();
            // frame chrome (ignoreScroll): rides the frame — painted unshifted,
            // above the scrolled content (the sticky-frame order), still clipped
            // to the pane's box
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, this.width, this.height);
            ctx.clip();
            for (const child of this.children) {
                if (!child.ignoresScroll || (skipExempt && child.ignoresClip))
                    continue;
                child.paint(ctx);
            }
            ctx.restore();
            // the SCROLLBAR: canvas panes had none at all (the DOM pane gets the
            // platform's overlay bar for free) — a thumb proportional to the
            // content, on the right edge, whenever the content overflows.
            const g = this.barGeom();
            if (g !== null) {
                const wide = this.barWide;
                const bw = wide ? 9 : 5;
                const bx = this.width - (wide ? 12 : 8);
                ctx.save();
                if (wide) {
                    ctx.fillStyle = "rgba(128, 134, 140, 0.14)";
                    ctx.beginPath();
                    ctx.roundRect(bx - 1.5, 1, bw + 3, this.height - 2, (bw + 3) / 2);
                    ctx.fill();
                }
                ctx.fillStyle = wide ? "rgba(110, 116, 122, 0.72)" : "rgba(128, 134, 140, 0.5)";
                ctx.beginPath();
                ctx.roundRect(bx, g.thumbY, bw, g.thumbH, bw / 2);
                ctx.fill();
                ctx.restore();
            }
        }
        else {
            for (const child of this.children) {
                if (skipExempt && child.ignoresClip)
                    continue;
                child.paint(ctx);
            }
        }
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