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
import { IDENTITY as IDENTITY_AFFINE, apply as applyAffine, fromParts as affineFromParts, invert as invertAffine, isIdentity as affineIsIdentity, rotationOf as affineRotationOf, scaleOf as affineScaleOf } from "./affine.js";
import { applyH, frontFacing, homography, inFront, invertH } from "./projective.js";
import { effectiveFamily } from "./measure.js";
import { colorToCss, isGradient } from "./value.js";
import { routeInput } from "./input.js";
// ── the wire ────────────────────────────────────────────────────────────────
/** A filter function as the Swift side reads it: `fn` plus its one argument
 *  (`v`), colours as CSS text — the SHADOW op's own convention. */
function wireFilter(f) {
    switch (f.fn) {
        case "blur": return { fn: "blur", v: f.radius };
        case "hueRotate": return { fn: "hueRotate", v: f.degrees };
        case "tint": return { fn: "tint", color: colorToCss(f.color) };
        case "shadow": return { fn: "shadow", dx: f.dx, dy: f.dy, blur: f.blur, color: colorToCss(f.color) };
        default: return { fn: f.fn, v: f.amount };
    }
}
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
    RASTERSCALE: 40,
    EDITSEL: 41,
    /** The host's scroll process (scrolling.md "The scroll process"): a view
     *  that claims the wheel (`onWheel`) so the host's walk hands it the stream
     *  instead of scrolling; and a glide request — (axis, to, duration, bezier). */
    WHEELCLAIM: 42, SCROLLGLIDE: 43,
    /** The filter tier (graphics-pass.md §1): the node's own painted subtree
     *  through `layer.filters` (+ the layer's own shadow for a shadow-of-alpha). */
    FILTER: 44,
    /** The soft mask (graphics-pass.md §2): a gradient's alpha, or a stencil node's painted alpha. */
    MASK: 45,
    /** The whole paint transform as one affine (graphics-pass.md §5): a b c d e f, y-down local space. */
    TRANSFORM: 46,
    /** Where a contain/cover fit sits in the box: alignX alignY tokens. */
    IMAGEALIGN: 47,
    /** The third dimension: rotateX rotateY translateZ backfaceHidden — or null (LayerTree case 48). */
    TRANSFORM3D: 48,
    /** This node is the eye for its children: perspective px (0 = none) (case 49). */
    PERSPECTIVE: 49,
};
/** A Declare motion token as the cubic bezier the host animates with — the
 *  platform's motion honoring the program's curve (scrolling.md: "where a
 *  provider can honor a Declare motion curve it does"). Penner's families as
 *  their standard CSS approximations; unknown → cubicOut, the scroll default. */
const GLIDE_BEZIERS = {
    linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1],
    easeIn: [0.11, 0, 0.5, 0], easeOut: [0.5, 1, 0.89, 1], easeBoth: [0.45, 0, 0.55, 1],
    sineIn: [0.12, 0, 0.39, 0], sineOut: [0.61, 1, 0.88, 1], sineBoth: [0.37, 0, 0.63, 1],
    quadIn: [0.11, 0, 0.5, 0], quadOut: [0.5, 1, 0.89, 1], quadBoth: [0.45, 0, 0.55, 1],
    cubicIn: [0.32, 0, 0.67, 0], cubicOut: [0.33, 1, 0.68, 1], cubicBoth: [0.65, 0, 0.35, 1],
    quartIn: [0.5, 0, 0.75, 0], quartOut: [0.25, 1, 0.5, 1], quartBoth: [0.76, 0, 0.24, 1],
    quintIn: [0.64, 0, 0.78, 0], quintOut: [0.22, 1, 0.36, 1], quintBoth: [0.83, 0, 0.17, 1],
    expoIn: [0.7, 0, 0.84, 0], expoOut: [0.16, 1, 0.3, 1], expoBoth: [0.87, 0, 0.13, 1],
    circIn: [0.55, 0, 1, 0.45], circOut: [0, 0.55, 0.45, 1], circBoth: [0.85, 0, 0.15, 1],
    backIn: [0.36, 0, 0.66, -0.56], backOut: [0.34, 1.56, 0.64, 1], backBoth: [0.68, -0.6, 0.32, 1.6],
};
function glideBezier(motion) {
    return GLIDE_BEZIERS[motion ?? "cubicOut"] ?? GLIDE_BEZIERS.cubicOut;
}
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
    // LAYOUT HAS SETTLED — re-clamp every scroller before the ops cross. An
    // empty buffer means nothing moved, so there is nothing to re-clamp.
    if (ops.length === 0)
        return;
    reclampScrollers();
    const json = JSON.stringify(ops);
    ops.length = 0;
    host().commit(json);
}
/** Every live scrolling surface, so the post-settle sweep can find them
 *  without walking the tree. Membership follows setScroll/setScrollX. */
const scrollers = new Set();
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
function reclampScrollers() {
    for (const sc of scrollers) {
        if (sc.scrolls) {
            const ext = sc.pageExtentY();
            const next = Math.min(Math.max(0, ext - sc.viewportH), Math.max(0, sc.scrollOffset));
            if (next !== sc.scrollOffset || ext !== sc.publishedExtent) {
                sc.publishedExtent = ext;
                // An extent-only change publishes the RANGE and leaves the offset to
                // the host (null): the host owns the offset between fact reports, and
                // re-stating a frame-old number would drag a live scroll back.
                if (next !== sc.scrollOffset) {
                    sc.setScrollOffset(next);
                    emit(OP.SCROLLPOS, sc.id, next, ext);
                }
                else
                    emit(OP.SCROLLPOS, sc.id, null, ext);
            }
        }
        if (sc.scrollsX) {
            const extX = sc.pageExtentX();
            const nextX = Math.min(Math.max(0, extX - sc.viewportW), Math.max(0, sc.scrollXOffset));
            if (nextX !== sc.scrollXOffset || extX !== sc.publishedExtentX) {
                sc.publishedExtentX = extX;
                if (nextX !== sc.scrollXOffset) {
                    sc.scrollXOffset = nextX;
                    sc.notifyScrollX(nextX);
                    emit(OP.SCROLLXPOS, sc.id, nextX, extX);
                }
                else
                    emit(OP.SCROLLXPOS, sc.id, null, extX);
            }
        }
    }
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
    onScrollXCb = null;
    onScrollingCb = null;
    /** The host's `scrolling` fact as last reported, and whether a GESTURE
     *  (a trackpad stream, its momentum, a bar drag) owns the offset right now —
     *  a request during it is dropped (arbitration rule 1). Both arrive per
     *  frame through macScrollFacts; the model never infers them. */
    scrollingLive = false;
    gestureLive = false;
    /** Where this surface lived before travelWith moved it (null = at home). */
    travelHome = null;
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
    /** The extent last PUBLISHED to the host, per axis — what its scrollbar is
     *  currently sized from. `-1` is "never published", so the first sweep after
     *  a scroller appears always states its range. */
    publishedExtent = -1;
    publishedExtentX = -1;
    /** Set when this surface hosts native rich content: its height is answered
     *  by the host's text layout, and its hit region is the box (the overlay
     *  owns interior selection). */
    richHeight = 0;
    constructor() {
        emit(OP.CREATE, this.id);
    }
    setX(v) { this.x = v; this.geom(); }
    setY(v) { this.y = v; this.geom(); }
    setWidth(v) { this.frameW = v; this.realizeSize(); }
    setHeight(v) { this.frameH = v; this.realizeSize(); }
    geom() { emit(OP.GEOM, this.id, this.x, this.y, this.width, this.height); }
    /** The MODEL frame, kept apart from the realized box: an EMBEDDED app root
     *  realizes LARGER than its frame along a declared scroll axis — the DOM's
     *  applyRootSize, where the root element grows to the page extent and the
     *  island's scroll box pans over it. A virtual range alone is not enough:
     *  it gave the island somewhere to scroll TO, but the root still clipped at
     *  its frame, so the revealed region was bare host ("scrolling birds in a
     *  desktop window goes black"). The model's width/height are untouched —
     *  realization only. Top level (no parent surface) nothing grows; the page
     *  itself is the scroller there. */
    frameW = 0;
    frameH = 0;
    realizeSize() {
        const grow = this.appRoot && this.parent !== null;
        const w = grow && this.wantsScrollX ? Math.max(this.frameW, this.pageExtentW) : this.frameW;
        const h = grow && this.wantsScrollY ? Math.max(this.frameH, this.pageExtentH) : this.frameH;
        if (w === this.width && h === this.height)
            return;
        this.width = w;
        this.height = h;
        this.geom();
    }
    /** The last realized SOLID fill, as css — attachRoot reads it to paint the
     *  page behind a top-level app (the DOM/canvas attachRoot rule, mirrored).
     *  Solid fills only, exactly like the canvas mirror: a gradient app ground
     *  gets no page echo there either. */
    fillCss = null;
    setFill(fill) {
        if (isGradient(fill)) {
            const g = fill;
            this.fillCss = null;
            emit(OP.GRADIENT, this.id, { kind: g.kind ?? "linear", angle: g.angle, cx: g.cx ?? 0.5, cy: g.cy ?? 0.5, r: g.r ?? 1,
                stops: g.stops.map((st) => [st.offset, colorToCss(st.color)]) });
        }
        else {
            this.fillCss = fill === null ? null : colorToCss(fill);
            emit(OP.FILL, this.id, this.fillCss);
        }
    }
    // one number, or the four corners as four args (LayerTree reads a(3) to tell)
    setCornerRadius(r) {
        if (typeof r === "number")
            emit(OP.RADIUS, this.id, r);
        else
            emit(OP.RADIUS, this.id, r[0], r[1], r[2], r[3]);
    }
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
        // the list rides the wire as plain records (Frost.swift reads the chain)
        emit(OP.BACKDROP, this.id, spec === null ? null : spec.map(wireFilter));
    }
    /** The view's own painted subtree, filtered as a group — LayerTree case 44:
     *  Core Image on the node's own layer (`layer.filters`), which macOS 26 still
     *  honours (frostprobe2), plus the layer's own shadow for `shadow(…)`. */
    setFilter(list) {
        emit(OP.FILTER, this.id, list === null ? null : list.map(wireFilter));
    }
    /** The mask — LayerTree case 45: a CAGradientLayer as `layer.mask`, or the
     *  stencil node's subtree rendered to a bitmap at its box (re-rendered per
     *  commit, the frost's epoch rule). A stencil not yet attached sends
     *  nothing; its own attach re-pushes through the model (View.flush). */
    setMask(spec) {
        if (spec === null) {
            emit(OP.MASK, this.id, null);
            return;
        }
        if (spec.kind === "gradient") {
            const g = spec.gradient;
            emit(OP.MASK, this.id, "gradient", { kind: g.kind ?? "linear", angle: g.angle, cx: g.cx ?? 0.5, cy: g.cy ?? 0.5, r: g.r ?? 1,
                stops: g.stops.map((st) => [st.offset, colorToCss(st.color)]) });
            return;
        }
        const st = spec.stencil.surface;
        if (st === null)
            return;
        emit(OP.MASK, this.id, "view", st.id, spec.stencil.x, spec.stencil.y, spec.stencil.width, spec.stencil.height);
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
        this.xform = affineFromParts({ scale: this.scaleK, scaleX: 1, scaleY: 1, rotation: deg, skewX: 0, skewY: 0, pivotX: this.pivotX, pivotY: this.pivotY });
        emit(OP.ROTATE, this.id, deg);
    }
    /** Invert the paint transform (scale, then rotation, about the shared
     *  pivot) — the hit/cursor/wheel walks' transform term, the same inverse
     *  interaction.ts toChildLocal applies (the ONE-WALK rule). */
    invertTransform(lx, ly) {
        if (this.spec3D !== null) {
            const d = this.spec3D;
            const H = homography(this.xform, this.x, this.y, this.pivotX, this.pivotY, d, d.perspective, d.originX, d.originY);
            if (d.backfaceHidden && !frontFacing(H, this.width, this.height))
                return [-1e9, -1e9]; // a hidden back is not there to hit
            const inv = invertH(H);
            return inFront(inv, lx + this.x, ly + this.y) ? applyH(inv, lx + this.x, ly + this.y) : [-1e9, -1e9];
        }
        if (affineIsIdentity(this.xform))
            return [lx, ly];
        return applyAffine(invertAffine(this.xform), lx, ly);
    }
    /** The whole paint transform about the pivot (affine.ts). The similarity
     *  setters rebuild it; setTransform hands it over whole and the Swift side
     *  folds it into one CATransform3D (case 46). */
    xform = IDENTITY_AFFINE;
    spec3D = null;
    setTransform3D(spec) {
        this.spec3D = spec;
        if (spec === null)
            emit(OP.TRANSFORM3D, this.id, null);
        // the pivot rides along: the affine folds it in, so no SCALE op carries it
        else
            emit(OP.TRANSFORM3D, this.id, spec.rotateX, spec.rotateY, spec.translateZ, spec.backfaceHidden ? 1 : 0, this.pivotX, this.pivotY);
    }
    setPerspective(px) { emit(OP.PERSPECTIVE, this.id, px); }
    setTransform(m, px, py) {
        this.xform = m;
        this.pivotX = px;
        this.pivotY = py;
        this.scaleK = affineScaleOf(m);
        this.rotationDeg = (affineRotationOf(m) * 180) / Math.PI;
        emit(OP.TRANSFORM, this.id, m[0], m[1], m[2], m[3], m[4], m[5]);
    }
    setScale(scale, px, py) {
        this.scaleK = scale;
        this.pivotX = px;
        this.pivotY = py;
        this.xform = affineFromParts({ scale, scaleX: 1, scaleY: 1, rotation: this.rotationDeg, skewX: 0, skewY: 0, pivotX: px, pivotY: py });
        emit(OP.SCALE, this.id, scale, px, py);
    }
    /** The composed scale a drawing is seen at, at rest (backend.ts). The host
     *  DESCRIBES most recordings as layers, which the render server rasterizes
     *  under any transform; the remainder — text, focal radials, filters — it
     *  rasters into a bitmap at the backing scale, and that bitmap was stretched
     *  under a view scale. This hands the host the density to raster that
     *  remainder at, the same fix the DOM backend makes for the same softness. */
    setRasterScale(k) {
        emit(OP.RASTERSCALE, this.id, k);
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
    /** Retained for the wheel walk (wheelTo): pinned chrome reads FRAME
     *  coordinates, not the scrolled content's. The Swift side owns the
     *  visual realization; this is the model's copy of the same fact. */
    ignoresScroll = false;
    setIgnoreScroll(on) {
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
    setScroll(on, onScroll, onScrolling) {
        this.wantsScrollY = on;
        if (this.appRoot && on)
            return; // a root never self-scrolls
        this.scrolls = on;
        this.onScrollCb = on ? onScroll : null;
        this.onScrollingCb = on ? (onScrolling ?? null) : null;
        if (!on)
            this.scrollOffset = 0;
        if (on || this.scrollsX)
            scrollers.add(this);
        else
            scrollers.delete(this);
        emit(OP.SCROLL, this.id, on ? 1 : 0);
    }
    /** The horizontal regime — the host translates the content layer on x
     *  exactly as on y, and its facts (`scrollX`) arrive through the same
     *  per-frame report. (The Files browser's column strip is the corpus case:
     *  its reveal needs the axis, and `scrollIntoView` reveals on both.) */
    setScrollX(on, onScroll, onScrolling) {
        this.wantsScrollX = on;
        if (this.appRoot && on)
            return; // a root never self-scrolls
        this.scrollsX = on;
        this.onScrollXCb = on ? (onScroll ?? null) : null;
        if (on && onScrolling !== undefined)
            this.onScrollingCb = onScrolling;
        if (on || this.scrolls)
            scrollers.add(this);
        else
            scrollers.delete(this);
        emit(OP.SCROLLX, this.id, on ? 1 : 0);
    }
    notifyScrollX(x) { this.onScrollXCb?.(x); }
    /** The host's per-frame report lands here (macScrollFacts): the offsets it
     *  moved, and the `scrolling`/gesture state of its process. */
    hostFacts(y, x, scrolling, gesture) {
        this.gestureLive = gesture;
        if (y !== null && this.scrolls && y !== this.scrollOffset)
            this.setScrollOffset(y);
        if (x !== null && this.scrollsX && x !== this.scrollXOffset) {
            this.scrollXOffset = x;
            this.onScrollXCb?.(x);
        }
        if (scrolling !== this.scrollingLive) {
            this.scrollingLive = scrolling;
            this.onScrollingCb?.(scrolling);
        }
    }
    /** Travel with a scroller (the FocusRing's ride): re-home in the model
     *  tree — the INSERT op re-parents the layer onto the scroller's content
     *  layer, so the host's own translate carries it, last = above the rows. */
    travelWith(host) {
        if (host === null) {
            if (this.travelHome !== null) {
                const h = this.travelHome;
                this.travelHome = null;
                h.insertChild(this, null);
            }
            return;
        }
        const h = host;
        if (this.parent === h)
            return;
        if (this.travelHome === null)
            this.travelHome = this.parent;
        h.insertChild(this, null);
    }
    isTraveling() { return this.travelHome !== null; }
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
    /** The scroll VIEWPORT — this box, except for the PAGE ROOT, whose box is
     *  the App's own size while the WINDOW is what it scrolls in (the DOM's
     *  document scroll). The window size is what `__declareResize` last handed
     *  the shim (innerWidth/innerHeight). Weather's phone dialect declares its
     *  App 2652 tall: clamped against its own box the page had a 40px range. */
    get viewportH() {
        if (this !== macRoot)
            return this.height;
        const h = globalThis.innerHeight;
        return typeof h === "number" && h > 0 ? h : this.height;
    }
    get viewportW() {
        if (this !== macRoot)
            return this.width;
        const w = globalThis.innerWidth;
        return typeof w === "number" && w > 0 ? w : this.width;
    }
    /** The page's scrollable extent: the larger of the box and its content. */
    pageExtentY() { const e = this.contentExtent(); return this === macRoot ? Math.max(e, this.height) : e; }
    pageExtentX() { const e = this.contentExtentX(); return this === macRoot ? Math.max(e, this.width) : e; }
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
        const viewRight = viewLeft + sc.viewportW;
        let next = sc.scrollXOffset;
        // `nearest` is CSSOM's minimal-scroll rule, which Chrome realizes: nothing
        // when the target is visible; nothing when it already COVERS the viewport;
        // and for a target WIDER than the viewport, align the near edge — the
        // minimal move — never the far one.
        if (align === "start")
            next = left;
        else if (left < viewLeft && right > viewRight) { /* covers the viewport */ }
        else if (left < viewLeft)
            next = this.width > sc.viewportW ? right - sc.viewportW : left;
        else if (right > viewRight)
            next = this.width > sc.viewportW ? left : right - sc.viewportW;
        const max = Math.max(0, sc.pageExtentX() - sc.viewportW);
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
            // The EFFECTIVE family: OpenType figures ride the family name, and the
            // host reads the suffix off it (TextEngine.swift) — so what the shared
            // measurer measured and what Core Text paints are one string.
            family: effectiveFamily(style), size: style.fontSize, weight: style.fontWeight,
            italic: style.italic === true,
            // a SOLID textFill overrides textColor before the payload is built, so the
            // host needs no second colour slot (schema.ts: "like the box fill, but for
            // the letters")
            color: (() => {
                const solid = typeof style.textFill === "number" ? style.textFill : style.color;
                return solid === null ? null : colorToCss(solid);
            })(),
            // A gradient text-fill: the DOM clips a background to the glyphs and the
            // canvas realizes the same ramp over the box, so the host is handed the
            // ramp itself and clips it to the glyph outlines.
            fillGradient: style.textFill != null && isGradient(style.textFill)
                ? { angle: style.textFill.angle,
                    stops: style.textFill.stops.map((st) => [st.offset, colorToCss(st.color)]) }
                : null,
            align: style.align ?? "left", wrap: style.wrap === true,
            maxLines: style.maxLines ?? 0,
            letterSpacing: style.letterSpacing ?? 0,
            // Leading as a fontSize multiplier (0 = natural). The host's TextEngine
            // does not consume it yet — seam row in test/seam.test.mjs.
            lineHeight: style.lineHeight ?? 0,
            selectable: style.selectable === true,
            shadow: style.shadow == null ? null
                : [style.shadow.dx, style.shadow.dy, style.shadow.blur, colorToCss(style.shadow.color)],
            // Typographical treatments — the paint vocabulary the web backends carry.
            // Colors ride as CSS strings here (the standalone TEXTSTYLE convention),
            // unlike the rich-run bridge which sends color numbers.
            outline: style.outline == null ? null : { width: style.outline.width, color: colorToCss(style.outline.color) },
            textTransform: style.textTransform == null || style.textTransform === "none" ? null : style.textTransform,
            smallCaps: style.smallCaps === true,
            underline: style.underline === true,
            strike: style.strike === true,
        });
    }
    setDrawing(list) {
        emit(OP.DRAW, this.id, list === null ? null : { ops: list.ops, bounds: list.bounds });
    }
    setImage(image) {
        // A media element (the env's <video> shim) is not a bitmap: it binds the
        // node to a native player layer instead, and the host draws the frames.
        const media = image === null ? undefined : image.__mediaHandle;
        if (media !== undefined) {
            emit(OP.MEDIA, this.id, media);
            return;
        }
        const handle = image === null ? null : image.__handle ?? null;
        emit(OP.IMAGE, this.id, handle);
    }
    setImageStretch(stretch) { emit(OP.STRETCH, this.id, stretch); }
    setImageAlign(ax, ay) { emit(OP.IMAGEALIGN, this.id, ax, ay); }
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
        // Inline image runs cross the bridge as they are: the native flow draws them
        // as NSTextAttachments (Overlays.swift RichImages) and, for a bitmap that
        // lands late, pushes the re-laid height back through `__declareRichHeight`
        // → onResize — the same parity the DOM and Canvas flows have.
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
    /** The flow's LINE CLAMP (`RichText.maxLines`). Synchronous like `richLayout`
     *  and for the same reason: the clamped height is a fact this settle needs,
     *  since everything stacked below the flow is placed from it. The model says
     *  HOW MANY lines (it owns the budget across the whole document); TextKit
     *  decides where the last one ends, being the thing that wrapped it. */
    setRichClamp(maxLines) {
        const h = host().richClamp(this.id, maxLines);
        if (h >= 0)
            this.richHeight = h;
        return h;
    }
    /** Called from the host when a rich flow's laid-out height is known. */
    applyRichHeight(h) {
        if (h === this.richHeight)
            return;
        this.richHeight = h;
        richCallbacks.get(this.id)?.onResize(h);
    }
    /** A REQUEST on y/x (scrollTo/scrollToX) — clamped like every other write.
     *  Plain: the offset lands in the model and crosses as SCROLLPOS, the host
     *  moving the layer this frame. With a glide: the HOST animates it
     *  (SCROLLGLIDE — its own display-link tween on the program's curve) and the
     *  facts arrive per frame as it moves. A gesture in flight owns the offset:
     *  the request is dropped (arbitration rule 1). Equal = inert — the fact's
     *  own echo through the attribute push must never cancel a live glide. */
    scrollToY(v, glide) {
        if (!this.scrolls || this.gestureLive)
            return;
        const ext = this.pageExtentY();
        const next = Math.min(Math.max(0, ext - this.viewportH), Math.max(0, v));
        if (glide !== undefined) {
            emit(OP.SCROLLGLIDE, this.id, 1, next, glide.duration ?? 260, ...glideBezier(glide.motion));
            return;
        }
        if (next === this.scrollOffset)
            return;
        this.setScrollOffset(next);
        emit(OP.SCROLLPOS, this.id, next, ext);
    }
    scrollToX(v, glide) {
        if (!this.scrollsX || this.gestureLive)
            return;
        const ext = this.pageExtentX();
        const next = Math.min(Math.max(0, ext - this.viewportW), Math.max(0, v));
        if (glide !== undefined) {
            emit(OP.SCROLLGLIDE, this.id, 0, next, glide.duration ?? 260, ...glideBezier(glide.motion));
            return;
        }
        if (next === this.scrollXOffset)
            return;
        this.scrollXOffset = next;
        this.onScrollXCb?.(next);
        emit(OP.SCROLLXPOS, this.id, next, ext);
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
        const viewBottom = viewTop + sc.viewportH;
        let next = sc.scrollOffset;
        // Same `nearest` rule as revealX — measured against Chrome on the embedded
        // desktop's Files-column reveal: a column TALLER than the island viewport,
        // below the fold, top-aligns there (minimal); the far-edge alignment this
        // used to do scrolled ~100px further than the reference.
        if (align === "start")
            next = top;
        else if (top < viewTop && bottom > viewBottom) { /* covers the viewport */ }
        else if (top < viewTop)
            next = this.height > sc.viewportH ? bottom - sc.viewportH : top;
        else if (bottom > viewBottom)
            next = this.height > sc.viewportH ? top : bottom - sc.viewportH;
        const max = Math.max(0, sc.pageExtentY() - sc.viewportH);
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
        const claimedWheel = this.wants?.wantsWheel === true;
        this.sink = sink;
        this.wants = sink !== null ? wants : undefined;
        // the host's wheel walk needs to know a claimant when it sees one
        const claimsWheel = this.wants?.wantsWheel === true;
        if (claimsWheel !== claimedWheel)
            emit(OP.WHEELCLAIM, this.id, claimsWheel ? 1 : 0);
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
    /** TextInput.select's write half (#22) — the overlay clamps and applies. */
    setSelection(start, end) { emit(OP.EDITSEL, this.id, start, end); }
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
        scrollers.delete(this); // a destroyed scroller must not be swept
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
    pageExtentW = 0;
    pageExtentH = 0;
    setPageExtent(w, h) {
        if (w === this.pageExtentW && h === this.pageExtentH)
            return;
        this.pageExtentW = w;
        this.pageExtentH = h;
        this.realizeSize();
        // Same republish rule as setVirtualExtent: the range only crosses the
        // bridge on a SCROLLPOS, so push it at the scroller that owns this root.
        for (let sc = this.parent; sc !== null; sc = sc.parent) {
            if (!sc.scrolls)
                continue;
            emit(OP.SCROLLPOS, sc.id, sc.scrollOffset, sc.contentExtent());
            break;
        }
    }
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
        // both other renderers. The gates are `visible` and `pointerEvents`.
        if (!this.visible)
            return null;
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
    /** The wheel CLAIM walk (canvas-backend wheelTo, mirrored): descend to the
     *  view under the point and answer with the nearest `onWheel` CLAIMANT or
     *  the nearest scroller — whichever is deeper wins, the DOM's delegation
     *  (an intervening scroller keeps its wheel; a claimant with no nearer
     *  scroller hears the stream, trackpad pinch included). The transform
     *  inverse keeps a rotated subtree honest. Null = neither wants it. */
    wheelTo(px, py, deltaX, deltaY, pinch) {
        if (!this.visible || this.opacity <= 0)
            return null;
        let lx = px - this.x;
        let ly = py - this.y;
        [lx, ly] = this.invertTransform(lx, ly);
        if ((this.clipData !== null || this.boxClip) && !this.insideClip(lx, ly))
            return null;
        const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
        if ((this.scrolls || this.scrollsX) && !inBox)
            return null;
        const cy = this.scrolls ? ly + this.scrollOffset : ly;
        const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
        for (let i = this.children.length - 1; i >= 0; i--) {
            const c = this.children[i];
            const r = c.wheelTo(c.ignoresScroll ? lx : cx, c.ignoresScroll ? ly : cy, deltaX, deltaY, pinch);
            if (r !== null)
                return r;
        }
        if (this.wants?.wantsWheel === true && this.sink !== null && inBox) {
            this.sink("wheel", lx, ly, { deltaX, deltaY, pinch });
            return "claimed";
        }
        return (this.scrolls || this.scrollsX) && inBox ? "scroller" : null;
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
/** The island VIEW behind a surface id — what the bridge links against
 *  (mac-boot's mountCompiled calls linkIslandTenant on it, so the native
 *  runner speaks the same `external` facts and post/onPost verbs as every
 *  other host; islands design, 2026-08-20). */
export function islandViewById(id) {
    return islandViews.get(id);
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
export function createOverlaySurface() {
    if (macRoot === null)
        return null;
    const s = new MacSurface();
    surfaces.set(s.id, s);
    s.setX(0);
    s.setY(0);
    s.setWidth(macRoot.width);
    s.setHeight(macRoot.height);
    macRoot.insertChild(s, null);
    return s;
}
/** The root's live box — an overlay tracks the window through it. */
export function rootBox() {
    return macRoot === null ? null : { width: macRoot.width, height: macRoot.height };
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
// `scrollIntoView(..., true)` asks for the DOM's `behavior: "smooth"`. The HOST
// animates it (SCROLLGLIDE — its display-link tween), the same ease-in-out
// over ~320ms the platform uses for a short programmatic scroll.
const GLIDE_MS = 320;
function glideX(sc, to) {
    if (sc.gestureLive)
        return;
    emit(OP.SCROLLGLIDE, sc.id, 0, to, GLIDE_MS, ...glideBezier("cubicBoth"));
}
function glideY(sc, to) {
    if (sc.gestureLive)
        return;
    emit(OP.SCROLLGLIDE, sc.id, 1, to, GLIDE_MS, ...glideBezier("cubicBoth"));
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
        const max = Math.max(0, s.pageExtentY() - s.viewportH);
        const next = Math.min(max, Math.max(0, y));
        if (next !== s.scrollOffset) {
            s.setScrollOffset(next); // sets the field AND notifies
            emit(OP.SCROLLPOS, s.id, next, s.contentExtent());
            moved = true;
        }
    }
    if (x !== null && s.scrollsX) {
        const maxX = Math.max(0, s.pageExtentX() - s.viewportW);
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
/** The wheel CLAIMANT delivery (App.swift → LayerTree.wheel → `__declareWheel`):
 *  the host's own walk found an `onWheel` view nearest under the point and
 *  hands it the stream here — `pinch` true for a trackpad magnify or a
 *  ctrl+wheel (the web's spelling of desktop pinch, so `e.pinch` zoom math
 *  written for Chrome runs unchanged). Scrolling never comes through here any
 *  more: a wheel over a scroller is the HOST's process, and what it moved
 *  arrives as facts (macScrollFacts). */
export function macWheel(x, y, dx, dy, pinch) {
    macRoot?.wheelTo(x, y, dx, dy, pinch);
    flushOps();
}
/** The host's per-frame scroll report (`__declareScrollFacts`): rows of
 *  [id, y|null, x|null, scrolling, gesture] for every surface its process
 *  moved or whose state changed this frame — written AFTER the frame that
 *  showed them (scrolling.md: the settle never delays the motion). */
export function macScrollFacts(batch) {
    if (!Array.isArray(batch))
        return;
    for (const row of batch) {
        const s = surfaces.get(row[0]);
        if (s === undefined)
            continue;
        const y = typeof row[1] === "number" ? row[1] : null;
        const x = typeof row[2] === "number" ? row[2] : null;
        s.hostFacts(y, x, Boolean(row[3]), Boolean(row[4]));
    }
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