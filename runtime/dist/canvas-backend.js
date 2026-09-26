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
import { applyH, frontFacing, homography, inFront, invertH } from "./projective.js";
const FIT_FRAC = { start: 0, center: 0.5, end: 1 };
import { IDENTITY as IDENTITY_AFFINE, apply as applyAffine, fromParts as affineFromParts, invert as invertAffine, isIdentity as affineIsIdentity, rotationOf as affineRotationOf, scaleOf as affineScaleOf } from "./affine.js";
import { inAnimationFrame, sample, motionToken, DEFAULT_MOTION } from "./animate.js";
import { ScrollPhysics } from "./scroll-physics.js";
const MICROTASK_PAINT = -1;
const EMPTY_BOX = Object.freeze({ x0: 0, y0: 0, x1: 0, y1: 0 });
const boxEmpty = (b) => !(b.x1 > b.x0 && b.y1 > b.y0);
const boxUnion = (a, b) => boxEmpty(a) ? b : boxEmpty(b) ? a
    : { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
const boxHit = (a, b) => !boxEmpty(a) && !boxEmpty(b) && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** the damage the current partial frame repaints — a few disjoint device
 *  rectangles; null during a full paint */
let DAMAGE_CULL = null;
/** did the drawing just painted come from a memo raster (vs vector replay)? */
let DREW_RASTER = false;
const hitsAny = (a, list) => { for (const r of list)
    if (boxHit(a, r))
        return true; return false; };
const boxArea = (b) => boxEmpty(b) ? 0 : (b.x1 - b.x0) * (b.y1 - b.y0);
/** At most this many damage rectangles: past it, the pair whose merge wastes
 *  least is merged (a clip of a few rects costs nothing; of hundreds, it does). */
const MAX_DAMAGE_RECTS = 8;
/** Past this share of the canvas, a plain full repaint is simpler and no
 *  slower — the clip, the clear and the cull walk stop paying for themselves.
 *  MEASURED on an iPhone 15 Pro (2026-09-19), where a phone-sized canvas makes
 *  a desktop window cover most of the screen: at 0.5 the fallback fired on most
 *  drag and open/close frames and cost more than it saved; 0.8 keeps those
 *  partial (minimize's frames over 20 ms: 102 → 69) and 0.98 costs again
 *  (drag's paint JS 245 → 293 ms), a clip over nearly everything. */
const DAMAGE_MAX = 0.8;
/** Add `b` to a small set of pixel-aligned rects: aligned outward with a
 *  pixel of antialiasing slack and clipped to the canvas; merged with a
 *  neighbour when their bounding box wastes little (repeatedly — a merge can
 *  make another cheap); and past the cap, the least wasteful pair merged. */
function addDamageRect(list, b, w, h) {
    if (boxEmpty(b))
        return;
    const r = { x0: Math.max(0, Math.floor(b.x0) - 1), y0: Math.max(0, Math.floor(b.y0) - 1), x1: Math.min(w, Math.ceil(b.x1) + 1), y1: Math.min(h, Math.ceil(b.y1) + 1) };
    if (r.x1 > r.x0 && r.y1 > r.y0)
        insertDamageRect(list, r);
}
function insertDamageRect(list, rect) {
    let r = rect;
    // merge into a neighbour only when the bounding box wastes little (a row
    // and a tall scroll-bar strip overlap, yet their union is the whole list);
    // rects may overlap — the clip is their union, the clear is idempotent
    for (let i = 0; i < list.length;) {
        const q = list[i], u = boxUnion(q, r);
        const contained = q.x0 <= r.x0 && q.y0 <= r.y0 && q.x1 >= r.x1 && q.y1 >= r.y1;
        if (contained)
            return;
        if (boxArea(u) <= 1.25 * (boxArea(q) + boxArea(r))) {
            r = u;
            list.splice(i, 1);
            i = 0;
        }
        else
            i++;
    }
    list.push(r);
    while (list.length > MAX_DAMAGE_RECTS) {
        let bi = 0, bj = 1, best = Infinity;
        for (let i = 0; i < list.length; i++)
            for (let j = i + 1; j < list.length; j++) {
                const waste = boxArea(boxUnion(list[i], list[j])) - boxArea(list[i]) - boxArea(list[j]);
                if (waste < best) {
                    best = waste;
                    bi = i;
                    bj = j;
                }
            }
        const m = boxUnion(list[bi], list[bj]);
        list.splice(bj, 1);
        list.splice(bi, 1);
        insertDamageRect(list, m); // the merged box may now touch another
    }
}
/** > 0 while painting inside a changed surface: nothing under it is skipped */
let DAMAGE_FORCE = 0;
/** the device offset of the group layer being painted into (its children's CTM is shifted by it) */
let LAYER_DX = 0, LAYER_DY = 0;
/** > 0 inside a 3D surface: boxes recorded there are unknown */
let PAINT_UNKNOWN = 0;
const damageDisabled = () => typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && globalThis.__declareNoDamage === true;
const damageChecking = () => typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && globalThis.__declareDamageCheck !== undefined;
import { notifyIslandSlot } from "./backend.js";
import { lockFocusZoom } from "./viewport-lock.js";
import { colorToCss, insetSides, isGradient, radiusFit, radiusIsSquare, filterCss, filterBlur, filterBleed } from "./value.js";
import { paintBox, paintBoxShadow, boxShape, realizeGradient } from "./boxpaint.js";
import { clampLines, cssWeight, fontMetrics, fontString, textWidth, transformText, wrapLines } from "./measure.js";
import { replay, replayArea, rasterPad, rasterEntryCap, rasterTotalCap, rasterLooksBlank, listIsolated, makeCanvas, RASTER_MAX_DIM, RASTER_MAX_AREA, RASTER_GRACE_MS } from "./draw.js";
import { applyFilterFallback, ctxFilterSupported, parseFilter } from "./canvas-filter.js";
import { rasterWorkerAvailable, rasterInWorker } from "./raster-client.js";
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
/** Does a box stroke put ink on the canvas? A per-side stroke (BoxStroke) does
 *  when any side has a width. */
function strokeInks(st) {
    if (st === null || st === undefined)
        return false;
    if (Array.isArray(st)) {
        for (const side of st)
            if (side != null && side.width > 0)
                return true;
        return false;
    }
    return st.width > 0;
}
/** SCRATCH POOL. A group layer, a mask, a tint pass and a frost snapshot
 *  each need a canvas for one paint — the same sizes frame after frame while
 *  something moves (a dragged window's layer, the menu bar's frost). Taking
 *  them from a pool keyed by exact size spares the allocation and the backing
 *  store each time; a canvas unused for a second is let go, and the pool never
 *  holds more than POOL_MAX_PX. take() hands back a cleared canvas with its
 *  context state saved; give() restores that state and returns it. */
const POOL = new Map();
let poolPx = 0;
const POOL_MAX_PX = 6_000_000;
const POOL_IDLE_MS = 1000;
function takeScratch(w, h) {
    const e = POOL.get(w + "x" + h)?.pop();
    if (e !== undefined) {
        poolPx -= w * h;
        const g = e.c.getContext("2d");
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, w, h);
        g.save();
        return { c: e.c, g };
    }
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    g.save();
    return { c, g };
}
function giveScratch(c) {
    c.getContext("2d").restore();
    const now = performance.now();
    for (const [k, list] of POOL) { // let go of what went quiet
        for (let i = list.length - 1; i >= 0; i--) {
            if (now - list[i].at > POOL_IDLE_MS) {
                poolPx -= list[i].c.width * list[i].c.height;
                list.splice(i, 1);
            }
        }
        if (list.length === 0)
            POOL.delete(k);
    }
    const px = c.width * c.height;
    if (px === 0 || poolPx + px > POOL_MAX_PX)
        return;
    const k = c.width + "x" + c.height;
    let list = POOL.get(k);
    if (list === undefined)
        POOL.set(k, list = []);
    list.push({ c, at: now });
    poolPx += px;
}
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
/** Advances once per compositor paint. An entry whose `seen` is behind it was
 *  not painted last frame — off-screen, hidden, or occluded — and is worth
 *  nothing at any recency. A static scene does not advance it, so idling
 *  evicts nothing. */
let memoGeneration = 0;
/** Multiplies the total cap. Halved whenever the platform hands back a
 *  DISCOVERED ceiling — a null context, a throw, or a large raster that came
 *  back blank (Safari's failure past its canvas budget is transparent, not
 *  slow) — so the session lives under the limit it actually hit. Never raised:
 *  the ceiling is unknowable and a guess that was once too high stays wrong. */
let budgetScale = 1;
const memoHolders = new Set();
// ── the admission threshold: THIS backend's constants over the shared quantities ──
//
// cost ≈ ops × OP_US + weightedCoveredDevicePx × PX_US_PER_MPX / 1e6, where the
// area is already kind-weighted by draw.ts (a gradient pixel counts 30 fill
// pixels). MEASURED 2026-08-25 under Chrome tracing on this renderer, two mark
// sizes: the per-op floor is 0.3–0.8 µs and a solid fill shades at 0.05 ms/Mpx.
// Rounded UP, because a miss here is a slow frame and a wrong promotion is only
// memory. Sanity at 1 ms: a full-viewport solid fill (2.16 Mpx at 2×) prices at
// ~0.1 ms and stays vectors; a full-viewport gradient wash prices at ~3 ms and
// promotes; a thousand tiny fills price at ~1.4 ms and promote. The previous
// constants (20 µs, 500 µs/Mpx) were each ten times high and promoted
// recordings that cost 50 µs to replay.
const OP_US = 1;
const PX_US_PER_MPX = 50;
const PROMOTE_US = 1000;
/** Below this a blank check is not worth its GPU sync; above it, a raster that
 *  painted nothing is exactly the failure the check exists to catch. */
const BLANK_CHECK_BYTES = 8 << 20;
// a diag window into the pool (the __declareDiag family): entries and bytes,
// so a session growing rasters is visible rather than mysterious
globalThis.__declareRasterStats =
    () => {
        let workerEntries = 0;
        if (typeof ImageBitmap !== "undefined")
            for (const h of memoHolders)
                if (h.rasterEntry?.canvas instanceof ImageBitmap)
                    workerEntries++;
        return { entries: memoHolders.size, bytes: memoBytes, paints: memoPaints, attempts: memoAttempts,
            generation: memoGeneration, budgetScale, workerEntries };
    };
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
    // a worker bitmap holds GPU/shared memory until closed — release it now,
    // not whenever the collector gets to it
    if (typeof ImageBitmap !== "undefined" && e.canvas instanceof ImageBitmap)
        e.canvas.close();
}
/** Eviction by RELEVANCE, then by value — not by recency. An entry not painted
 *  last frame is off-screen and worthless however recently it was made, and
 *  the biggest of those frees the most; among the live ones, the lowest value
 *  density (milliseconds the raster saves per hit, per byte it holds) goes
 *  first. Both terms are per-entry facts, exactly known — the design's
 *  observation that only the absolute budget is fuzzy, the relative order
 *  never is. */
function evictLeastValuable(except) {
    let victim = null;
    let worst = Infinity;
    for (const h of memoHolders) {
        const e = h.rasterEntry;
        if (h === except || e === null)
            continue;
        const stale = e.seen < memoGeneration - 1;
        const score = stale ? -e.bytes : (e.rasterMs * Math.max(1, e.hits)) / e.bytes;
        if (score < worst) {
            worst = score;
            victim = h;
        }
    }
    if (victim === null)
        return false;
    releaseRaster(victim);
    return true;
}
class ScrollLoop {
    comp;
    pending = new Map();
    tweens = new Map();
    touch = null;
    moved = new Set();
    active = new Set();
    quiet = new Map();
    constructor(comp) {
        this.comp = comp;
    }
    /** An offset moved: a fact to report after paint, and damage of the
     *  scroller's box (DIRTY REGIONS) — without booking a frame, since the
     *  loop only moves offsets inside one (or right before invalidating). */
    mark(s) { this.moved.add(s); this.comp.mark(s); }
    begin(s) {
        const q = this.quiet.get(s);
        if (q !== undefined) {
            clearTimeout(q);
            this.quiet.delete(s);
        }
        if (!this.active.has(s)) {
            this.active.add(s);
            s.reportScrolling(true);
        }
    }
    settle(s) {
        if (this.active.has(s)) {
            this.active.delete(s);
            s.reportScrolling(false);
        }
    }
    idle(s) {
        return !this.pending.has(s) && !this.tweens.has(s) && this.touch?.s !== s && !this.quiet.has(s);
    }
    /** Desktop: a wheel delta, applied next frame. */
    enqueue(s, dx, dy) {
        const p = this.pending.get(s);
        if (p !== undefined) {
            p.dx += dx;
            p.dy += dy;
        }
        else
            this.pending.set(s, { dx, dy });
        this.tweens.delete(s); // a gesture cancels a glide
        this.begin(s);
        this.comp.invalidate(s);
    }
    /** A request with a glide: a tween on the provider's own loop. */
    glide(s, axis, to, g) {
        const curve = motionToken(g.motion ?? "cubicOut") ?? DEFAULT_MOTION;
        const from = axis === "y" ? s.scrollOffset : s.scrollXOffset;
        const list = (this.tweens.get(s) ?? []).filter((t) => t.axis !== axis);
        list.push({ axis, from, to, start: performance.now(), duration: Math.max(1, g.duration ?? 260), curve });
        this.tweens.set(s, list);
        this.begin(s);
        this.comp.invalidate(s);
    }
    cancelGlides(s) {
        if (!this.tweens.delete(s))
            return;
        if (this.idle(s))
            this.settle(s);
    }
    /** Touch: a session opens over an unclaimed scrollable pane; it OWNS the
     *  finger only once it moves past the tap slop, so a tap still lands. */
    touchDown(s, x, y, t) {
        this.tweens.delete(s);
        const physics = new ScrollPhysics({ contentWidth: s.contentExtentX(), contentHeight: s.contentExtent(), viewportWidth: s.width, viewportHeight: s.height });
        physics.setContentOffset(s.scrollXOffset, s.scrollOffset);
        this.touch = { s, physics, started: false, x0: x, y0: y, last: t };
        physics.handleFingerEvent({ type: "down", x, y, time: t });
    }
    /** True = the session owns this move (the browser must not pan the page). */
    touchMove(x, y, t) {
        const ts = this.touch;
        if (ts === null)
            return false;
        if (!ts.started) {
            if (Math.abs(x - ts.x0) + Math.abs(y - ts.y0) < 4)
                return false;
            ts.started = true;
            this.begin(ts.s);
        }
        ts.last = t;
        this.apply(ts.s, ts.physics.handleFingerEvent({ type: "move", x, y, time: t }));
        this.comp.invalidate(ts.s);
        return true;
    }
    touchUp(x, y, t, cancel = false) {
        const ts = this.touch;
        if (ts === null)
            return;
        if (!ts.started) {
            this.touch = null;
            return;
        } // a tap — nothing scrolled
        this.apply(ts.s, ts.physics.handleFingerEvent({ type: cancel ? "cancel" : "up", x, y, time: t }));
        this.comp.invalidate(ts.s); // momentum / spring from here
    }
    apply(s, st) {
        // the FACT stays clamped; the rubber band lives in the visual offset only
        // (Mesa's overscroll is positive when pulled PAST THE TOP/LEFT — i.e. the
        // content sits below its origin — so it subtracts from the offset)
        const maxY = Math.max(0, s.contentExtent() - s.height), maxX = Math.max(0, s.contentExtentX() - s.width);
        if (s.scrolls) {
            s.scrollVisualY = st.contentOffsetY - st.overscrollY;
            const y = Math.min(maxY, Math.max(0, st.contentOffsetY));
            if (y !== s.scrollOffset) {
                s.scrollOffset = y;
                this.mark(s);
            }
        }
        if (s.scrollsX) {
            s.scrollVisualX = st.contentOffsetX - st.overscrollX;
            const x = Math.min(maxX, Math.max(0, st.contentOffsetX));
            if (x !== s.scrollXOffset) {
                s.scrollXOffset = x;
                this.mark(s);
            }
        }
    }
    /** Runs FIRST in the frame; answers whether another frame is wanted. */
    step(now) {
        let live = false;
        for (const [s, p] of this.pending) {
            if (s.scrollsX && p.dx !== 0) {
                const nx = Math.min(Math.max(0, s.contentExtentX() - s.width), Math.max(0, s.scrollXOffset + p.dx));
                if (nx !== s.scrollXOffset) {
                    s.scrollXOffset = nx;
                    this.mark(s);
                }
            }
            if (s.scrolls && p.dy !== 0) {
                const ny = Math.min(Math.max(0, s.contentExtent() - s.height), Math.max(0, s.scrollOffset + p.dy));
                if (ny !== s.scrollOffset) {
                    s.scrollOffset = ny;
                    this.mark(s);
                }
            }
            // a wheel stream ends when it goes quiet
            const q = this.quiet.get(s);
            if (q !== undefined)
                clearTimeout(q);
            this.quiet.set(s, setTimeout(() => { this.quiet.delete(s); if (this.idle(s))
                this.settle(s); }, 120));
        }
        this.pending.clear();
        for (const [s, list] of this.tweens) {
            const keep = [];
            for (const t of list) {
                const p = Math.min(1, (now - t.start) / t.duration);
                const v = t.from + (t.to - t.from) * sample(t.curve, p);
                if (t.axis === "y") {
                    if (v !== s.scrollOffset) {
                        s.scrollOffset = v;
                        this.mark(s);
                    }
                }
                else if (v !== s.scrollXOffset) {
                    s.scrollXOffset = v;
                    this.mark(s);
                }
                if (p < 1)
                    keep.push(t);
            }
            if (keep.length > 0) {
                this.tweens.set(s, keep);
                live = true;
            }
            else {
                this.tweens.delete(s);
                if (this.idle(s))
                    this.settle(s);
            }
        }
        const ts = this.touch;
        if (ts !== null && ts.started) {
            const st = ts.physics.isAnimating() ? ts.physics.step(Math.max(1, now - ts.last)) : ts.physics.getState();
            ts.last = now;
            this.apply(ts.s, st);
            if (ts.physics.isAnimating() || st.phase === "dragging")
                live = true;
            else {
                ts.s.scrollVisualY = null;
                ts.s.scrollVisualX = null;
                this.mark(ts.s);
                this.touch = null;
                if (this.idle(ts.s))
                    this.settle(ts.s);
            }
        }
        return live;
    }
    /** After paint: the facts, once per frame. */
    flushFacts() {
        for (const s of this.moved)
            s.reportOffsets();
        this.moved.clear();
    }
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
    /** The runtime scroll provider's loop — runs FIRST in every frame. */
    scrollLoop = new ScrollLoop(this);
    /** The page-scroll STRUT (pageRoot realization): an inert 1px-wide element
     *  in the host whose height is the root's content extent — the document's
     *  scroll range, without the canvas itself ever growing. */
    strut = null;
    hostElement() {
        return this.host;
    }
    /** Size the page STRUT to the root's content extent NOW. Paint does this every
     *  frame; a page scroll asks first too, because an arrival reveals in the settle
     *  BEFORE the first paint — against a document not yet tall enough, the browser
     *  clamped `window.scrollTo` to 0, the reveal reported success, and a deep link
     *  (`#section`) on canvas landed at the top. */
    syncPageExtent() {
        const root = this.root;
        if (this.strut === null || root === null || !root.pageRoot)
            return;
        // the extent arrives from the model (setPageExtent — the App's own
        // contentHeight), so no child walk is needed here
        const target = Math.max(root.height, Math.round(root.extentH));
        if (this.strut.style.height !== `${target}px`)
            this.strut.style.height = `${target}px`;
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
            // An UNCLAIMED finger over an interior scrolling pane opens the runtime
            // provider's touch session (Mesa physics — drag, momentum, rubber band).
            // The page root is never its target: the page's scroll is the browser's.
            else if (claim.drag === false && e.touches.length === 1) {
                const r = this.canvas.getBoundingClientRect();
                const t0 = e.touches[0];
                const pane = this.root.scrollerAt(t0.clientX - r.left, t0.clientY - r.top);
                if (pane !== null)
                    this.scrollLoop.touchDown(pane, t0.clientX, t0.clientY, e.timeStamp);
            }
        }, { passive: false });
        canvas.addEventListener("touchmove", (e) => {
            // a live hold-capture owns the finger regardless of the touchdown claim
            if (holdCaptureActive()) {
                e.preventDefault();
                return;
            }
            // a touch scroll session owns the finger once it moves past the tap slop
            if (this.scrollLoop.touch !== null && e.touches.length === 1) {
                const t0 = e.touches[0];
                if (this.scrollLoop.touchMove(t0.clientX, t0.clientY, e.timeStamp)) {
                    e.preventDefault();
                    return;
                }
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
            if (this.scrollLoop.touch !== null) {
                const t0 = e.changedTouches[0];
                if (t0 !== undefined)
                    this.scrollLoop.touchUp(t0.clientX, t0.clientY, e.timeStamp, e.type === "touchcancel");
            }
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
            const dx = e.shiftKey ? (e.deltaX || e.deltaY) : e.deltaX;
            const dy = e.shiftKey ? 0 : e.deltaY;
            // the delta lands on the scroll loop (applied, painted, reported next frame)
            if (this.root.scrollBy(x, y, dx, dy))
                e.preventDefault();
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
                if ((sf.scrolls || sf.scrollsX) && !inBox)
                    return null;
                for (let i = sf.children.length - 1; i >= 0; i--) {
                    const c = sf.children[i];
                    const shift = sf.scrolls && !c.ignoresScroll ? sf.scrollOffset : 0;
                    const shiftX = sf.scrollsX && !c.ignoresScroll ? sf.scrollXOffset : 0;
                    const hit = walk(c, lx + shiftX - c.x, ly + shift - c.y, ax + c.x - shiftX, ay + c.y - shift);
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
            const was = barHover;
            if (barHover !== null && barDrag === null)
                barHover.barWide = false;
            barHover = sf;
            if (sf !== null)
                sf.barWide = true;
            if (was !== null)
                this.invalidateBar(was);
            if (sf !== null)
                this.invalidateBar(sf);
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
            if (barDrag !== null)
                this.invalidate(barDrag.s);
            if (barHold !== null)
                this.invalidate(barHold.s);
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
                this.invalidate(f.s);
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
                    this.invalidate(hold.s);
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
    /** The surfaces changed since the last frame (dirty regions, above); `full`
     *  = repaint everything (the first frame, or a change with no surface). */
    dirty = new Set();
    full = true;
    /** boxes to repaint that belong to no live surface: a removed or moved subtree's old place */
    extra = [];
    /** frosted surfaces — damage within a frost's blur reach repaints the frost */
    frosts = new Set();
    /** A repaint of the old place of a subtree that left it (removed, or moved). */
    damageBox(b) {
        if (b === null)
            this.full = true;
        else if (!boxEmpty(b))
            this.extra.push(b);
        this.schedule();
    }
    /** Request a repaint — of `s`'s subtree when a surface is named (dirty
     *  regions), of everything when not. Every change since the last frame
     *  coalesces into one scheduled requestAnimationFrame; with a paint already
     *  pending — or before attach, whose first paint covers everything — the
     *  scheduling is a no-op, so an idle or unattached tree costs nothing. */
    invalidate(s) {
        if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && s !== undefined && globalThis.__declareDamageWho !== undefined)
            devNoteWho(s);
        if (s === undefined)
            this.full = true;
        else if (!this.full) {
            s.damaged = true;
            this.dirty.add(s);
            // A surface recorded as painting NOTHING that changes may paint something
            // now — an image's bitmap landing, a drawing or a fill arriving on an
            // empty view. Its ancestors' records left it out, so the cull would skip
            // the whole subtree and it would never be drawn (an image inside a plain
            // or blending parent stayed blank until an unrelated repaint). "Unknown"
            // up the chain, as a subtree changing shape says (insertChild).
            if (s.painted !== null && boxEmpty(s.painted)) {
                for (let a = s; a !== null && a.painted !== null; a = a.parent)
                    a.painted = null;
            }
        }
        this.schedule();
    }
    /** Repaint only `s`'s scroll bar strip — its thumb follows the content
     *  extent, and hover widens it; the content itself did not change. */
    bars = new Set();
    invalidateBar(s) {
        if (!this.full)
            this.bars.add(s);
        this.schedule();
    }
    /** The device strip a scroller's bar paints in (null: unknowable, 3D). */
    barStrip(s, dpr) {
        const pm = this.parentMatrix(s, dpr);
        if (pm === null)
            return null;
        let m = pm.translate(s.x, s.y);
        if (!affineIsIdentity(s.xform))
            m = m.multiply(new DOMMatrix([s.xform[0], s.xform[1], s.xform[2], s.xform[3], s.xform[4], s.xform[5]]));
        return CanvasSurface.mapBox(m, s.width - 14, 0, s.width, s.height);
    }
    /** Damage `s` without scheduling (a change made inside the frame, before
     *  its paint). */
    mark(s) {
        if (!this.full) {
            s.damaged = true;
            this.dirty.add(s);
        }
    }
    schedule() {
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
                this.frameTick();
            });
            return;
        }
        this.frame = requestAnimationFrame(this.frameTick);
    }
    /** The frame: scroll loop → paint → facts. The offsets move and the frame
     *  paints them BEFORE any program hears the fact, so the settle the fact
     *  triggers can never delay the motion; while the loop is live (momentum,
     *  a glide, a rubber-band spring) it books the next frame itself. */
    frameTick = () => {
        const live = this.scrollLoop.step(performance.now());
        this.paint();
        this.scrollLoop.flushFacts();
        if (live && this.frame === 0 && this.ctx !== null)
            this.frame = requestAnimationFrame(this.frameTick);
    };
    /** A destroyed root takes the canvas (and any pending frame) with it;
     *  destroying any other surface just repaints the scene without it. */
    destroyed(surface) {
        if (surface !== this.root) {
            this.dirty.delete(surface);
            this.damageBox(surface.painted);
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
    /** When the previous paint landed. A paint within RASTER_GRACE_MS of the
     *  last is a frame IN MOTION — a scroll, a spring, a drag — and a frost may
     *  be approximate there; the rest timer below books the one exact frame once
     *  the frames stop (the memo's own grace, applied to frost). */
    lastPaintAt = 0;
    inMotion = false;
    frostRestTimer = 0;
    /** A frost painted approximately asks for its exact frame at rest. */
    frostsResting = new Set();
    frostWantsRest(f) {
        this.frostsResting.add(f);
        if (this.frostRestTimer !== 0)
            clearTimeout(this.frostRestTimer);
        this.frostRestTimer = setTimeout(() => {
            this.frostRestTimer = 0;
            for (const s of this.frostsResting)
                this.invalidate(s);
            this.frostsResting.clear();
        }, RASTER_GRACE_MS + 15);
    }
    sized = -1;
    dpr = 0;
    /** This frame's damage (DIRTY REGIONS), or null to repaint everything. */
    collectDamage(w, h, dpr) {
        const list = [];
        if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__) {
            DEV_BIG = "";
            DEV_BIG_AREA = 0;
        }
        for (const b of this.extra)
            addDamageRect(list, b, w, h);
        // bars: asked for, and every scroller whose content changed (a child's
        // move or resize changes the extent, so the thumb)
        const bars = new Set(this.bars);
        for (const s of this.dirty)
            if (s.parent !== null && s.parent.scrolls && !s.ignoresScroll)
                bars.add(s.parent);
        for (const s of bars) {
            if (!this.rooted(s) || !s.scrolls)
                continue;
            const b = this.barStrip(s, dpr);
            if (b === null) {
                if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__)
                    DEV_WHY = "3D ancestor";
                return null;
            }
            addDamageRect(list, b, w, h);
        }
        for (const s of this.dirty) {
            if (!this.rooted(s))
                continue; // gone: its old box arrived as `extra`
            if (s.painted === null) {
                if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__)
                    DEV_WHY = "a changed surface painted under 3D";
                return null;
            }
            const m = this.parentMatrix(s, dpr);
            if (m === null) {
                if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__)
                    DEV_WHY = "3D ancestor";
                return null;
            }
            const now = CanvasSurface.subtreeBoxNow(s, m); // where it is
            if (now === null) {
                if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__)
                    DEV_WHY = "3D in the changed subtree";
                return null;
            }
            addDamageRect(list, s.painted, w, h); // where it was
            addDamageRect(list, now, w, h);
            if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__)
                devNoteBig(s, s.painted, now);
        }
        if (list.length === 0)
            return list;
        // frost paints a blur of what lies under it: damage within its reach
        // repaints the whole frosted box (which may reach another frost)
        for (let grew = true; grew;) {
            grew = false;
            for (const f of this.frosts) {
                const fb = f.painted;
                // never painted: not on screen (under a hidden ancestor), so nothing of
                // it depends on a backdrop — and a change that shows it is damage itself
                if (fb === null || boxEmpty(fb))
                    continue;
                const r = f.frostReach(dpr);
                if (!hitsAny({ x0: fb.x0 - r, y0: fb.y0 - r, x1: fb.x1 + r, y1: fb.y1 + r }, list))
                    continue;
                // covered already? (against the part on the canvas — what adding it adds)
                const c0 = Math.max(0, fb.x0), c1 = Math.max(0, fb.y0), c2 = Math.min(w, fb.x1), c3 = Math.min(h, fb.y1);
                if (c2 <= c0 || c3 <= c1)
                    continue;
                if (list.some((q) => q.x0 <= c0 && q.y0 <= c1 && q.x1 >= c2 && q.y1 >= c3))
                    continue;
                addDamageRect(list, fb, w, h);
                grew = true;
            }
        }
        let area = 0;
        for (const q of list)
            area += boxArea(q);
        let lim = DAMAGE_MAX;
        if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__) {
            const v = globalThis.__declareDamageMax;
            if (v !== undefined)
                lim = +v;
        }
        if (area > lim * w * h) {
            if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__)
                DEV_WHY = "damage over half the canvas" + (DEV_BIG ? " — largest: " + DEV_BIG + (this.extra.length ? ` (+${this.extra.length} removed/moved boxes)` : "") : "");
            return null;
        } // a full repaint is simpler and no slower
        return list;
    }
    /** Is `s` in this compositor's live tree? */
    rooted(s) {
        let p = s;
        while (p !== null && p !== this.root)
            p = p.parent;
        return p === this.root;
    }
    /** The device matrix `s`'s own translate/transform composes onto — the paint
     *  walk's, rebuilt from the ancestors: dpr, then each ancestor's offset and
     *  affine, and a scrolling ancestor's offset for content it scrolls. Null
     *  under a 3D ancestor (its projection is not an affine). */
    parentMatrix(s, dpr) {
        const chain = [];
        for (let p = s.parent; p !== null; p = p.parent)
            chain.push(p);
        let m = new DOMMatrix([dpr, 0, 0, dpr, 0, 0]);
        let child = s;
        for (let i = chain.length - 1; i >= 0; i--) {
            const a = chain[i];
            const next = i > 0 ? chain[i - 1] : s;
            if (a.spec3D !== null)
                return null;
            m = m.translate(a.x, a.y);
            if (!affineIsIdentity(a.xform))
                m = m.multiply(new DOMMatrix([a.xform[0], a.xform[1], a.xform[2], a.xform[3], a.xform[4], a.xform[5]]));
            if ((a.scrolls || a.scrollsX) && !next.ignoresScroll) {
                m = m.translate(a.scrollsX ? -(a.scrollVisualX ?? a.scrollXOffset) : 0, a.scrolls ? -(a.scrollVisualY ?? a.scrollOffset) : 0);
            }
            child = next;
        }
        void child;
        return m;
    }
    paint = () => {
        this.frame = 0;
        memoGeneration++;
        const now = performance.now();
        this.inMotion = now - this.lastPaintAt < RASTER_GRACE_MS;
        this.lastPaintAt = now;
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
        if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__)
            DEV_T0 = performance.now();
        // what changed: rectangles, or null for everything (see DIRTY REGIONS above)
        let whole = this.full || this.sized !== w * 65536 + h || this.dpr !== dpr || root.painted === null;
        if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && damageDisabled())
            whole = true;
        const damage = whole ? null : this.collectDamage(w, h, dpr);
        if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && damage === null) {
            devNoteFull(this.full ? "invalidated without a surface" : this.sized !== w * 65536 + h ? "size" : this.dpr !== dpr ? "dpr"
                : root.painted === null ? "root box unknown" : whole ? "switched off" : DEV_WHY);
        }
        this.sized = w * 65536 + h;
        this.dpr = dpr;
        // this frame's changes are taken NOW: a request made DURING the paint (a
        // playing video asks for its next frame from paintContent) belongs to the
        // next frame and must survive this one's reset
        const changed = this.dirty;
        this.dirty = new Set();
        this.extra = [];
        this.bars.clear();
        this.full = false;
        if (damage === null) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, w, h);
            ctx.save();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            try {
                root.paint(ctx);
            }
            finally {
                ctx.restore();
            }
        }
        else if (damage.length > 0) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.save();
            ctx.beginPath();
            for (const q of damage)
                ctx.rect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0);
            ctx.clip();
            for (const q of damage)
                ctx.clearRect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            DAMAGE_CULL = damage;
            try {
                if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && damageChecking())
                    devPaintCounted(ctx, root);
                else
                    root.paint(ctx);
            }
            finally {
                DAMAGE_CULL = null;
            }
            ctx.restore();
            if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && damageChecking())
                devCheckDamage(ctx, root, damage, w, h, dpr);
        }
        for (const s of changed)
            if (!this.dirty.has(s))
                s.damaged = false;
        if (typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__)
            devPaintEnd(damage, w, h);
        // The page realization's STRUT tracks the content extent — the document's
        // scroll range is exactly the scrolling content's reach (visible children
        // that didn't opt out), never more.
        this.syncPageExtent();
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
    /** The device box this subtree last PAINTED (DIRTY REGIONS); null = unknown
     *  (painted under 3D). EMPTY when it painted nothing — including never: a
     *  surface not yet painted was not on screen, and whatever first paints it
     *  (its insertion, an ancestor shown or scrolled) is damage of its own. */
    painted = EMPTY_BOX;
    /** In the compositor's changed set this frame. */
    damaged = false;
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
    /** The whole paint transform as one matrix about the pivot (affine.ts) —
     *  what paint applies and the hit walk inverts; setScale/setRotation keep
     *  it in step for a caller of the similarity pair. */
    xform = IDENTITY_AFFINE;
    rebuildXform() {
        this.xform = affineFromParts({ scale: this.scaleK, scaleX: 1, scaleY: 1, rotation: this.rotationDeg, skewX: 0, skewY: 0, pivotX: this.pivotX, pivotY: this.pivotY });
    }
    setTransform(m, px, py) {
        this.xform = m;
        this.pivotX = px;
        this.pivotY = py;
        this.scaleK = affineScaleOf(m);
        this.rotationDeg = (affineRotationOf(m) * 180) / Math.PI;
        this.compositor.invalidate(this);
    }
    /** The third dimension (graphics-pass.md §6): the subtree paints into a
     *  local-space layer and lands through its homography in horizontal
     *  strips (each strip an affine — exact along rows for rotateX, close for
     *  the rest); the hit walk unprojects the same homography. */
    spec3D = null;
    setTransform3D(spec) { this.spec3D = spec; this.compositor.invalidate(this); }
    setPerspective(_px) { }
    homography3D() {
        const d = this.spec3D;
        return homography(this.xform, this.x, this.y, this.pivotX, this.pivotY, d, d.perspective, d.originX, d.originY);
    }
    scrolls = false;
    scrollOffset = 0;
    /** The HORIZONTAL twin (setScrollX / scrollToX): a pane may scroll one axis
     *  or both; each axis keeps its own flag and offset, and every walk that
     *  shifts by `scrollOffset` shifts by `scrollXOffset` beside it. */
    scrollsX = false;
    scrollXOffset = 0;
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
        this.compositor.invalidate(this);
    }
    onScrollCb = null;
    onScrollXCb = null;
    onScrollingCb = null;
    /** The VISUAL offset while a touch session rubber-bands past the range —
     *  presentation only; null = paint at the (clamped) fact. */
    scrollVisualY = null;
    scrollVisualX = null;
    /** The facts, written by the scroll loop after the frame painted. */
    reportOffsets() {
        if (this.scrolls)
            this.onScrollCb?.(this.scrollOffset);
        if (this.scrollsX)
            this.onScrollXCb?.(this.scrollXOffset);
    }
    reportScrolling(active) { this.onScrollingCb?.(active); }
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
                if (radiusIsSquare(this.cornerRadius))
                    p.rect(0, 0, this.width, this.height);
                else
                    p.roundRect(0, 0, this.width, this.height, radiusFit(this.cornerRadius, this.width, this.height));
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
    halfLead = 0;
    textShadow = null;
    // Typographical treatments (the span/Text paint vocabulary) — mirrored from
    // the DOM's setRichContent/setTextStyle so canvas runs wear the same look.
    textOutline = null;
    textTransform = "none";
    textUnderline = false;
    textStrike = false;
    fontSizePx = 0;
    letterSpacing = 0;
    /** Wrapping (set-time): whether this run wraps within `width`, its alignment,
     *  and the cached line break — recomputed when text/style/width change so the
     *  paint walk stays measure-free after the first frame. */
    maxLines = 0;
    wrap = false;
    align = "left";
    textLines = null;
    image = null;
    alignX = "center";
    alignY = "center";
    setImageAlign(ax, ay) { this.alignX = ax; this.alignY = ay; this.compositor.invalidate(this); }
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
    setX(v) { this.x = v; this.compositor.invalidate(this); }
    setY(v) { this.y = v; this.compositor.invalidate(this); }
    setWidth(v) { this.width = v; this.box = null; this.textLines = null; if (this.boxClip)
        this.clipPath = null; this.compositor.invalidate(this); }
    setHeight(v) { this.height = v; this.box = null; if (this.boxClip)
        this.clipPath = null; this.compositor.invalidate(this); }
    setVisible(v) { this.visible = v; this.compositor.invalidate(this); }
    setOpacity(o) { this.opacity = o; this.compositor.invalidate(this); }
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
    /** The view's own painted subtree filtered as a group (graphics-pass.md
     *  §1): a fourth reason for the offscreen layer, landed through
     *  `ctx.filter` (shadow and tint natively). null = none. */
    filter = null;
    setFilter(list) {
        this.filter = list;
        this.compositor.invalidate(this);
    }
    /** The soft mask (graphics-pass.md §2): a `destination-in` pass over the
     *  group layer — a gradient's alpha over the box, or a stencil surface's
     *  own paint (read live at paint time, so a stencil attaching or moving
     *  later just works) at its box. */
    mask = null;
    setMask(spec) {
        this.mask = spec;
        this.compositor.invalidate(this);
    }
    setBackdrop(spec) {
        this.backdrop = spec;
        if (spec !== null)
            this.compositor.frosts.add(this);
        else
            this.compositor.frosts.delete(this);
        this.compositor.invalidate(this);
    }
    /** How far outside its box a frost's backdrop sample reaches, device px. */
    frostReach(dpr) {
        return this.backdrop === null ? 0 : Math.ceil(3.5 * filterBlur(this.backdrop) * dpr) + 4;
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
        this.compositor.invalidate(this);
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
        this.rebuildXform();
        this.compositor.invalidate(this);
    }
    setRotation(deg, px, py) {
        this.rotationDeg = deg;
        this.pivotX = px;
        this.pivotY = py;
        this.rebuildXform();
        this.compositor.invalidate(this);
    }
    /** Invert this surface's paint transform (scale, then rotation, about the
     *  shared pivot) — the hit walk's transform term, so a transformed view
     *  stays clickable where it is DRAWN. The same inverse interaction.ts
     *  toChildLocal applies in the model walk (the ONE-WALK rule). */
    invertTransform(lx, ly) {
        if (this.spec3D !== null) {
            // the walk subtracted x/y; the homography carries them, so add back
            const H = this.homography3D();
            if (this.spec3D.backfaceHidden && !frontFacing(H, this.width, this.height))
                return [-1e9, -1e9]; // a hidden back is not there to hit
            const inv = invertH(H);
            return inFront(inv, lx + this.x, ly + this.y) ? applyH(inv, lx + this.x, ly + this.y) : [-1e9, -1e9];
        }
        if (affineIsIdentity(this.xform))
            return [lx, ly];
        return applyAffine(invertAffine(this.xform), lx, ly);
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
        this.compositor.invalidate(this);
    }
    setCornerRadius(r) {
        this.cornerRadius = r;
        this.box = null;
        if (this.boxClip)
            this.clipPath = null;
        this.compositor.invalidate(this);
    }
    setStroke(st) {
        this.stroke = st;
        this.compositor.invalidate(this);
    }
    /** The content inset (`View.padding`). The LEADING half is already in the
     *  children's own x/y — view.ts shifts the position on its way here, so the
     *  compositor walk, the raster extents and the hit test need nothing. What
     *  this is for is the TRAILING half, which only a scroller can show: the
     *  extents below add it, so a padded scroller stops the full bottom (right)
     *  inset past its last child. */
    padBottom = 0;
    padRight = 0;
    setPadding(inset) {
        const [, right, bottom] = insetSides(inset);
        if (right === this.padRight && bottom === this.padBottom)
            return;
        this.padRight = right;
        this.padBottom = bottom;
        this.compositor.invalidate(this);
    }
    setShadow(sh) {
        this.shadow = sh;
        this.compositor.invalidate(this);
    }
    setClip(d) {
        this.clipData = d;
        this.clipPath = null;
        this.compositor.invalidate(this);
    }
    setBoxClip(on) {
        this.boxClip = on;
        this.clipPath = null;
        this.compositor.invalidate(this);
    }
    setDrawing(list) {
        this.drawing = list;
        releaseRaster(this); // a new recording invalidates the memo by identity
        this.rasterPending = null; // …and orphans a raster in flight (dropped on arrival)
        this.rasterSeen = null;
        this.rasterScalePending = null;
        if (this.rasterRestTimer !== 0) {
            clearTimeout(this.rasterRestTimer);
            this.rasterRestTimer = 0;
        }
        this.compositor.invalidate(this);
    }
    /** @internal the raster memo's per-surface state (module functions manage the pool) */
    rasterEntry = null;
    /** A raster the worker is making for this surface (raster-client.ts); the
     *  arrival installs it only if this is still the request it answers. */
    rasterPending = null;
    rasterSeen = null;
    rasterScalePending = null;
    rasterRestTimer = 0;
    /** Paint this view's recording: vectors, or the memoized raster when the
     *  (list, scale) pair is stable. DIRTY REGIONS: the two differ slightly
     *  (sub-pixel phase, and the known blur hole), so a partial frame that
     *  SWITCHES this drawing between them — a promotion, a fall back to vectors —
     *  shows the switch only inside the damage, a seam across the drawing. Such a
     *  frame books the whole drawing for the next one. */
    paintDrawing(ctx) {
        DREW_RASTER = false;
        this.paintDrawingInner(ctx);
        if (DAMAGE_CULL !== null && DAMAGE_FORCE === 0 && DREW_RASTER !== this.drewRaster)
            this.compositor.invalidate(this);
        this.drewRaster = DREW_RASTER;
    }
    drewRaster = false;
    paintDrawingInner(ctx) {
        const list = this.drawing;
        const b = list.bounds;
        if (b === null)
            return;
        const m = ctx.getTransform();
        // rotation/skew keeps pure vectors (a resampled blit would soften — rare,
        // and the memo is an optimization, never a semantic); the same axis test
        // decides whether a culling clip can be expressed at all
        const axis = Math.abs(m.b) <= 1e-6 && Math.abs(m.c) <= 1e-6 && m.a > 0 && m.d > 0;
        // The region a vector replay can be SEEN in, in the recording's own units:
        // the whole canvas, mapped back through the live transform. Conservative
        // (a scroll pane's clip is tighter), and every op outside it is skipped
        // byte-identically — see draw.ts replay().
        const clip = axis
            ? { x: -m.e / m.a, y: -m.f / m.d, w: ctx.canvas.width / m.a, h: ctx.canvas.height / m.d }
            : undefined;
        memoPaints++;
        if (globalThis.__declareNoRasterMemo === true) {
            // the A/B lever means OFF, not "stop using": an entry promoted before the
            // lever was thrown is released, so the pool reads empty and its bytes are
            // really gone — otherwise a before/after measured the memo's absence with
            // its memory still held
            releaseRaster(this);
            replayOnScene(ctx, list, clip);
            return;
        }
        if (!axis) {
            replayOnScene(ctx, list, clip);
            return;
        }
        const sx = Math.round(m.a * 1e4) / 1e4;
        const sy = Math.round(m.d * 1e4) / 1e4;
        // ADMISSION: is this recording worth bytes at all? The quantity is the
        // recording's (draw.ts replayArea, in its own units); the scale² and the
        // threshold are this backend's. Cheap lists replay as vectors forever —
        // crisp, zero memory, and they were never the problem.
        const est = list.ops.length * OP_US + (replayArea(list) * sx * sy) * PX_US_PER_MPX / 1e6;
        if (est < PROMOTE_US) {
            replayOnScene(ctx, list, clip);
            return;
        }
        const e = this.rasterEntry;
        if (e !== null && e.list === list && e.sx === sx && e.sy === sy) {
            e.stamp = ++memoStamp;
            e.seen = memoGeneration;
            e.hits++;
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            DREW_RASTER = true;
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
                e.seen = memoGeneration;
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                DREW_RASTER = true;
                ctx.drawImage(e.canvas, m.e + m.a * e.bx, m.f + m.d * e.by, e.canvas.width * (sx / e.sx), e.canvas.height * (sy / e.sy));
                ctx.restore();
                if (this.rasterRestTimer !== 0)
                    clearTimeout(this.rasterRestTimer);
                this.rasterRestTimer = setTimeout(() => { this.rasterRestTimer = 0; this.compositor.invalidate(this); }, RASTER_GRACE_MS + 15);
                return;
            }
            this.rasterScalePending = null; // quiet for the beat: fall through to the exact raster
        }
        // promotion by STABILITY for a NEW list: raster only when the same key
        // repeats — content re-recorded every frame keeps pure vector replay
        const seen = this.rasterSeen;
        this.rasterSeen = { list, sx, sy };
        if (e === null && (seen === null || seen.list !== list)) {
            replayOnScene(ctx, list, clip);
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
            replayOnScene(ctx, list, clip);
            return;
        }
        while (memoBytes + bytes > rasterTotalCap(viewportBytes(root)) * budgetScale) {
            if (!evictLeastValuable(this)) {
                replayOnScene(ctx, list, clip);
                return;
            }
        }
        // THE WORKER RASTER (adaptive-draw-cache.md §3.1, built 2026-09-10): where
        // the engine can, the pixels are made OFF the main thread and arrive a
        // frame or two later as a transferable bitmap. Until then this frame
        // paints what it has — the prior raster of the same list, scaled (the
        // stretch grace's own move), or vectors — so a settle that re-records a
        // drawing never stalls the frame on its raster, and a flick stays a
        // translate of bitmaps that already exist. Deniable: no worker, and the
        // synchronous path below is exactly what it was.
        if (rasterWorkerAvailable()) {
            const pend = this.rasterPending;
            if (pend === null || pend.list !== list || pend.sx !== sx || pend.sy !== sy) {
                const req = { list, sx, sy, bx, by, w, h, bytes };
                this.rasterPending = req;
                memoAttempts++;
                void rasterInWorker({ list, sx, sy, bx, by, w, h, blankCheck: bytes > BLANK_CHECK_BYTES }).then((r) => {
                    if (this.rasterPending !== req) {
                        r?.bitmap.close();
                        return;
                    } // superseded: a newer recording or scale
                    this.rasterPending = null;
                    if (r === null) {
                        this.compositor.invalidate(this);
                        return;
                    } // the worker could not: the next paint rasters in place
                    if (r.blank) {
                        r.bitmap.close();
                        budgetScale = Math.max(0.125, budgetScale * 0.5); // a DISCOVERED ceiling
                        globalThis.__declareRasterErr = "raster came back blank";
                        return;
                    }
                    const rootNow = this.compositor.rootCanvas;
                    releaseRaster(this);
                    while (memoBytes + bytes > rasterTotalCap(viewportBytes(rootNow)) * budgetScale) {
                        if (!evictLeastValuable(this)) {
                            r.bitmap.close();
                            return;
                        }
                    }
                    this.rasterEntry = { list, sx, sy, canvas: r.bitmap, bytes, bx, by, stamp: ++memoStamp, seen: memoGeneration, rasterMs: r.rasterMs, hits: 0 };
                    memoBytes += bytes;
                    memoHolders.add(this);
                    this.compositor.invalidate(this); // the frame that shows the bitmap
                });
            }
            if (e !== null && e.list === list) {
                // the prior raster of this list, scaled, until the exact one lands
                e.stamp = ++memoStamp;
                e.seen = memoGeneration;
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                DREW_RASTER = true;
                ctx.drawImage(e.canvas, m.e + m.a * e.bx, m.f + m.d * e.by, e.canvas.width * (sx / e.sx), e.canvas.height * (sy / e.sy));
                ctx.restore();
            }
            else
                replayOnScene(ctx, list, clip);
            return;
        }
        releaseRaster(this);
        let cv;
        let rasterMs = 0;
        try {
            const t0 = performance.now();
            cv = document.createElement("canvas");
            cv.width = w;
            cv.height = h;
            const c2 = cv.getContext("2d");
            if (c2 === null)
                throw new Error("no 2d context");
            c2.setTransform(sx, 0, 0, sy, -bx * sx, -by * sy);
            replay(c2, list); // the WHOLE recording — a memo must not depend on the viewport
            rasterMs = performance.now() - t0;
            // the platform may silently drop a raster later (GPU process restart);
            // a lost context releases the entry and the next paint re-derives
            cv.addEventListener?.("contextlost", () => { releaseRaster(this); this.compositor.invalidate(this); });
            if (bytes > BLANK_CHECK_BYTES && rasterLooksBlank(cv, list, sx, sy, bx, by))
                throw new Error("raster came back blank");
        }
        catch (err) {
            // a DISCOVERED ceiling: live under it for the rest of the session
            budgetScale = Math.max(0.125, budgetScale * 0.5);
            globalThis.__declareRasterErr = String(err);
            replayOnScene(ctx, list, clip); // a refused allocation is a slow frame, never a wrong one
            return;
        }
        this.rasterEntry = { list, sx, sy, canvas: cv, bytes, bx, by, stamp: ++memoStamp, seen: memoGeneration, rasterMs, hits: 0 };
        memoBytes += bytes;
        memoHolders.add(this);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        DREW_RASTER = true;
        ctx.drawImage(cv, m.e + m.a * bx, m.f + m.d * by);
        ctx.restore();
    }
    setText(text) {
        this.text = text;
        this.textLines = null;
        this.compositor.invalidate(this);
    }
    setTextStyle(st) {
        this.font = fontString(st);
        // a SOLID textFill overrides textColor (schema.ts); a gradient one takes the
        // ramp path below
        this.textFill = colorToCss(typeof st.textFill === "number" ? st.textFill : st.color);
        this.textGradient = st.textFill != null && isGradient(st.textFill) ? st.textFill : null;
        const fm = fontMetrics(this.font);
        this.ascent = fm.ascent;
        this.lineHeight = st.lineHeight != null && st.lineHeight > 0
            ? Math.round(st.fontSize * st.lineHeight)
            : fm.ascent + fm.descent;
        // Half the difference between the declared line and the face's own box goes
        // above each line and half below — the DOM's line-height, so a tight
        // `lineHeight = 1` keeps its glyphs centered in the box rather than sitting
        // on its floor.
        this.halfLead = Math.floor((this.lineHeight - (fm.ascent + fm.descent)) / 2); // the floor above, the rest below — the browser's split
        this.textShadow = st.shadow ?? null;
        // smallCaps rides `fontString(st)` above (the CSS variant slot), so the
        // painter and the shared measurer synthesize the same caps; the rest are
        // paint-time decorations honored in the text branch below.
        this.textOutline = st.outline ?? null;
        this.fontSizePx = st.fontSize;
        this.textTransform = st.textTransform ?? "none";
        this.textUnderline = st.underline ?? false;
        this.textStrike = st.strike ?? false;
        this.letterSpacing = st.letterSpacing;
        this.wrap = st.wrap ?? false;
        // a clamped non-wrapping run is a one-line clamp (the DOM does the same)
        this.maxLines = st.maxLines != null && st.maxLines > 0 ? (this.wrap ? st.maxLines : 1) : 0;
        if (this.maxLines > 0)
            this.wrap = true;
        this.align = st.align ?? "left";
        this.textLines = null;
        this.compositor.invalidate(this);
    }
    setImage(image) {
        this.image = image;
        this.tinted = null;
        this.compositor.invalidate(this);
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
        this.compositor.invalidate(this);
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
        this.compositor.invalidate(this);
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
        this.compositor.invalidate(this);
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
        this.compositor.invalidate(this); // the strut tracks the extent per paint
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
        // the page root's wheel is the browser's own — never consumed here
        return (this.scrolls || this.scrollsX) && !this.pageRoot && inBox ? "scroller" : null;
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
    /** The caret/selection write half (TextInput.select, #22): land the range on
     *  the native element. For a collapsed range at either extreme, bring the
     *  caret's end of the box into view — the platform reveals mid-text carets
     *  itself once typing starts. */
    setSelection(start, end) {
        const el = this.editEl;
        if (el === null)
            return;
        const len = el.value.length;
        const s = Math.max(0, Math.min(len, start));
        const e = Math.max(0, Math.min(len, end));
        try {
            el.setSelectionRange(s, e, "forward");
        }
        catch {
            return;
        } // input types without selection
        if (s === e) {
            if (e <= 0) {
                el.scrollTop = 0;
                el.scrollLeft = 0;
            }
            else if (e >= len) {
                el.scrollTop = el.scrollHeight;
            }
        }
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
            if (s.clipData !== null || s.boxClip || s.scrolls || s.scrollsX) {
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
            if (p !== null && p.scrollsX && !s.ignoresScroll)
                ax -= p.scrollXOffset;
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
        // A scroll container clips to its box and offsets its content — hit-test
        // children in the SAME frame the paint walk draws them.
        const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
        if ((this.scrolls || this.scrollsX) && !inBox)
            return null;
        const cy = this.scrolls ? ly + this.scrollOffset : ly;
        const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
        if (this.scrolls || this.scrollsX) {
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
            if ((this.scrolls || this.scrollsX) && c.ignoresScroll)
                continue;
            const t = c.hit(cx, cy);
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
            // THE CURSOR IS DEEPEST-WINS, sink not required — the DOM's own rule (a
            // sinkless element's CSS cursor shows while its hits pass through to
            // the sink ancestor). The desktop's resize halo is the living case:
            // eight sinkless cursor zones over one sink; without this probe the
            // sealed surface answered the halo's sink but never the zones' cursors,
            // so a canvas window had no resize cursors at all (2026-08-21).
            const zc = this.cursorProbe(lx, cy);
            return { key: this, sink: this.sink, ...this.wants, pinch, x: lx, y: ly,
                cursor: zc !== undefined ? zc : this.cursorStyle !== "" ? this.cursorStyle : undefined };
        }
        return null;
    }
    /** The deepest cursor among CHILDREN under the point, sinks ignored —
     *  hit()'s geometry (transform, clip, scroll) without its targeting.
     *  Called with the same child-frame coords hit() probes children at, and
     *  only when a sink target is being returned, so the extra walk is scoped
     *  to that target's subtree. */
    cursorProbe(clx, ccy) {
        for (let i = this.children.length - 1; i >= 0; i--) {
            const c = this.children[i];
            if (!c.visible)
                continue;
            let lx = clx - c.x;
            let ly = ccy - c.y;
            [lx, ly] = c.invertTransform(lx, ly);
            const cp = c.clipPathObj();
            if (cp !== null && !hitCtx().isPointInPath(cp, lx, ly))
                continue;
            const inBox = lx >= 0 && ly >= 0 && lx < c.width && ly < c.height;
            if ((c.scrolls || c.scrollsX) && !inBox)
                continue;
            const cy2 = c.scrolls ? ly + c.scrollOffset : ly;
            const cx2 = c.scrollsX ? lx + c.scrollXOffset : lx;
            const deep = c.cursorProbe(cx2, cy2);
            if (deep !== undefined)
                return deep;
            if (inBox && c.pe !== "none" && c.cursorStyle !== "")
                return c.cursorStyle;
        }
        return undefined;
    }
    setScroll(on, onScroll, onScrolling) {
        this.scrolls = on;
        this.onScrollCb = on ? onScroll : null;
        this.onScrollingCb = on ? (onScrolling ?? null) : null;
        if (!on) {
            this.scrollOffset = 0;
            this.scrollVisualY = null;
        }
    }
    setVirtualExtent(h) {
        const v = h ?? 0;
        if (v === this.virtualExtent)
            return;
        this.virtualExtent = v;
        this.compositor.invalidateBar(this);
    }
    /** Content extent along y — the real children floor'd by the virtual one. */
    contentExtent() {
        let extent = this.virtualExtent;
        for (const c of this.children)
            if (c.visible && !c.ignoresScroll)
                extent = Math.max(extent, c.y + c.height);
        // the TRAILING inset (setPadding): a padded scroller stops a full inset
        // after its last child, not flush against it
        return extent === 0 ? 0 : extent + this.padBottom;
    }
    /** The horizontal scroll regime — the exact twin of setScroll: clip to the
     *  box, translate the content by the offset, mirror the user's pan into
     *  `scrollX` through the callback. Found unbuilt by the Files browser's column
     *  strip (2026-08-29): its reveal animator wrote `strip.scrollX` and the
     *  attribute push optional-called a scrollToX that did not exist, so a fresh
     *  column never slid into view on this renderer alone — while the hit walk,
     *  which the View side already shifts by scrollX, disagreed with the paint. */
    setScrollX(on, onScroll, onScrolling) {
        this.scrollsX = on;
        this.onScrollXCb = on ? (onScroll ?? null) : null;
        if (on && onScrolling !== undefined)
            this.onScrollingCb = onScrolling;
        if (!on) {
            this.scrollXOffset = 0;
            this.scrollVisualX = null;
        }
        this.compositor.invalidate(this);
    }
    /** Content extent along x — the widest a child reaches (contentExtent's twin;
     *  no virtual floor: windowing is vertical). */
    contentExtentX() {
        let extent = 0;
        for (const c of this.children)
            if (c.visible && !c.ignoresScroll)
                extent = Math.max(extent, c.x + c.width);
        return extent === 0 ? 0 : extent + this.padRight;
    }
    /** A request on x (`scrollToX`) — clamped exactly as a wheel would be; with a
     *  glide it tweens on the scroll loop, and a gesture in flight owns the offset
     *  (the request is dropped — arbitration rule 1). */
    scrollToX(v, glide) {
        if (!this.scrollsX)
            return;
        const loop = this.compositor.scrollLoop;
        if (loop.touch?.s === this)
            return;
        const next = Math.min(Math.max(0, this.contentExtentX() - this.width), Math.max(0, v));
        if (glide !== undefined) {
            loop.glide(this, "x", next, glide);
            return;
        }
        // equal = inert: the fact's own echo through the attribute push (view.ts
        // scrollX) must never cancel a glide or a session in progress
        if (next === this.scrollXOffset)
            return;
        loop.cancelGlides(this);
        this.scrollXOffset = next;
        this.onScrollXCb?.(next);
        this.compositor.invalidate(this);
    }
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
     *  lands exactly where a user scroll would. */
    scrollToY(v, glide) {
        if (!this.scrolls)
            return;
        const loop = this.compositor.scrollLoop;
        if (loop.touch?.s === this)
            return;
        const extent = this.contentExtent();
        const next = Math.min(Math.max(0, extent - this.height), Math.max(0, v));
        if (glide !== undefined) {
            loop.glide(this, "y", next, glide);
            return;
        }
        if (next === this.scrollOffset)
            return; // the fact's echo (see scrollToX)
        loop.cancelGlides(this);
        this.scrollOffset = next;
        this.onScrollCb?.(next);
        this.compositor.invalidate(this);
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
        // the x arm (the mac backend's revealX, verbatim in spirit): the nearest
        // HORIZONTAL scroller reveals this surface's box on its own axis
        {
            let cx = this;
            let offX = 0;
            while (cx.parent !== null && !cx.parent.scrollsX) {
                offX += cx.x;
                cx = cx.parent;
            }
            const scx = cx.parent;
            if (scx !== null && !scx.pageRoot) {
                offX += cx.x;
                const maxX = Math.max(0, scx.contentExtentX() - scx.width);
                let nextX = Math.min(maxX, Math.max(0, offX));
                if (align === "nearest") {
                    const left = scx.scrollXOffset, right = left + scx.width;
                    if (offX >= left && offX + this.width <= right)
                        nextX = scx.scrollXOffset; // already visible
                    else
                        nextX = offX < left ? Math.max(0, offX) : Math.min(maxX, offX + this.width - scx.width);
                }
                if (nextX !== scx.scrollXOffset) {
                    scx.scrollXOffset = nextX;
                    scx.onScrollXCb?.(nextX);
                    this.compositor.invalidate(this);
                }
            }
        }
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
                // the compositor's scroll listener mirror it back. The document must
                // already be tall enough to reach `next` (syncPageExtent).
                this.compositor.syncPageExtent();
                window.scrollTo({ top: next });
                return;
            }
            sc.scrollOffset = next;
            sc.onScrollCb?.(next);
            this.compositor.invalidate(sc);
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
    scrollBy(px, py, dx, dy) {
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
        if ((this.scrolls || this.scrollsX) && !inBox)
            return false;
        const cy = this.scrolls ? ly + this.scrollOffset : ly;
        const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
        for (let i = this.children.length - 1; i >= 0; i--) {
            const c = this.children[i];
            if (c.scrollBy(this.scrollsX && c.ignoresScroll ? lx : cx, this.scrolls && c.ignoresScroll ? ly : cy, dx, dy))
                return true;
        }
        // the page root's own scroll is the browser's — never consumed here
        if (this.pageRoot || !inBox)
            return false;
        // a horizontal pane takes the horizontal delta and lets a vertical one pass
        // to whatever scrolls vertically here or above (the DOM backend's rule).
        // The delta is QUEUED on the scroll loop — applied next frame, painted,
        // then reported — and the pane CONTAINS: consumed even at its limit
        // (arbitration rule 2 — no chaining to the page).
        const loop = this.compositor.scrollLoop;
        if (this.scrollsX && dx !== 0) {
            loop.enqueue(this, dx, 0);
            if (!this.scrolls)
                return true;
        }
        if (this.scrolls) {
            if (dy !== 0)
                loop.enqueue(this, 0, dy);
            return true;
        }
        return false;
    }
    /** The innermost scrolling pane under (px,py) in PARENT-local space — a
     *  touch session's target (scrollBy's walk, without a delta). Never the page
     *  root: its scroll is the browser's. */
    scrollerAt(px, py) {
        if (!this.visible)
            return null;
        const lx = px - this.x;
        const ly = py - this.y;
        const cp = this.clipPathObj();
        if (cp !== null && !hitCtx().isPointInPath(cp, lx, ly))
            return null;
        const inBox = lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
        if ((this.scrolls || this.scrollsX) && !inBox)
            return null;
        const cy = this.scrolls ? ly + this.scrollOffset : ly;
        const cx = this.scrollsX ? lx + this.scrollXOffset : lx;
        for (let i = this.children.length - 1; i >= 0; i--) {
            const c = this.children[i];
            const hit = c.scrollerAt(this.scrollsX && c.ignoresScroll ? lx : cx, this.scrolls && c.ignoresScroll ? ly : cy);
            if (hit !== null)
                return hit;
        }
        if (this.pageRoot || !inBox)
            return null;
        return this.scrolls || this.scrollsX ? this : null;
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
        // a surface arriving from a painted place (a reorder, a re-home) leaves a
        // hole there: repaint its old box
        if (c.painted !== null && !boxEmpty(c.painted))
            this.compositor.damageBox(c.painted);
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
        // THE ANCESTORS' PAINTED BOXES NO LONGER BOUND THEIR CHILDREN. `painted` is
        // "where this surface and its subtree last landed", and it is what a partial
        // frame culls against — so a container that last painted while it was EMPTY
        // carries an empty box, misses the damage its own new child just booked, and
        // returns before reaching that child. The child is never drawn, and nothing
        // marks damage again: the content stays blank until something forces a full
        // repaint.
        //
        // Measured on marketmap at a PHONE viewport (2026-09-20): the treemap paints
        // its tiles after the first frame, the container was recorded empty by that
        // frame, and the map never appeared — 35% of the canvas drawn against 92%
        // with damage off, fixed permanently by a one-pixel resize. Desktop widths
        // lay the tiles out before that first frame, which is why every gate — the
        // damage checker included — ran green over it.
        //
        // Clearing the record says "unknown", which is what it now is: the cull
        // keeps a surface whose box is unknown, it repaints and recomputes. This is
        // the same signal paint() already propagates upward for a child whose box it
        // could not know, applied at the moment the subtree changes shape.
        for (let a = this; a !== null && a.painted !== null; a = a.parent)
            a.painted = null;
        // what changed is the child's place and its stacking among siblings — all
        // within its own box (its old box went in above). A blending child can
        // turn the parent's content into a group: then the parent is the change.
        this.compositor.invalidate(c.blends > 0 ? this : c);
    }
    destroy() {
        releaseRaster(this); // the memo pool must not outlive the surface
        this.rasterPending = null;
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
        this.compositor.frosts.delete(this);
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
        if (!this.visible || this.opacity <= 0) {
            this.painted = EMPTY_BOX;
            return;
        }
        // a partial frame skips a subtree whose last paint missed the damage —
        // unless it (or an ancestor) changed, when where it WAS says nothing
        if (DAMAGE_CULL !== null && DAMAGE_FORCE === 0 && !this.damaged && this.painted !== null && !hitsAny(this.painted, DAMAGE_CULL))
            return;
        const forced = this.damaged;
        const three = this.spec3D !== null;
        if (forced)
            DAMAGE_FORCE++;
        if (three)
            PAINT_UNKNOWN++;
        // this surface's own device matrix, for the record below (a group layer's
        // children paint shifted by its offset: add it back)
        let m = null;
        if (PAINT_UNKNOWN === 0) {
            m = ctx.getTransform().translate(this.x, this.y);
            if (!affineIsIdentity(this.xform))
                m = m.multiply(new DOMMatrix([this.xform[0], this.xform[1], this.xform[2], this.xform[3], this.xform[4], this.xform[5]]));
            m.e += LAYER_DX;
            m.f += LAYER_DY;
        }
        try {
            this.paintSelf(ctx);
        }
        finally {
            if (forced)
                DAMAGE_FORCE--;
            if (three)
                PAINT_UNKNOWN--;
        }
        if (m === null) {
            this.painted = null;
            return;
        }
        // own ink, then the children's — a clipping surface's cut to its box (its
        // box bounds them; a transparent full-window container must not count as
        // ink, or every change inside it damages the window)
        let b = CanvasSurface.inkOf(this, m);
        const clips = this.boxClip || this.scrolls || this.scrollsX || this.clipData !== null;
        const cut = clips ? CanvasSurface.mapBox(m, 0, 0, this.width, this.height) : null;
        for (const c of this.children) {
            if (c.painted === null) {
                this.painted = null;
                return;
            }
            if (boxEmpty(c.painted))
                continue;
            if (cut === null || c.ignoresClip)
                b = boxUnion(b, c.painted);
            else {
                const x0 = Math.max(cut.x0, c.painted.x0), y0 = Math.max(cut.y0, c.painted.y0), x1 = Math.min(cut.x1, c.painted.x1), y1 = Math.min(cut.y1, c.painted.y1);
                if (x1 > x0 && y1 > y0)
                    b = boxUnion(b, { x0, y0, x1, y1 });
            }
        }
        this.painted = b;
    }
    /** Does this surface itself put anything on the canvas (children aside)?
     *  A plain container — no fill, stroke, shadow, text, image, drawing, frost,
     *  scroll bars, filter or mask — does not. */
    ownsInk() {
        return this.fill !== null || this.gradient !== null || strokeInks(this.stroke) || this.shadow !== null
            || this.backdrop !== null || this.image !== null || this.drawing !== null || (this.text !== "" && this.font !== "")
            || this.scrolls || this.scrollsX || this.filter !== null || this.mask !== null || this.spec3D !== null;
    }
    /** One surface's OWN ink in device space: its box, grown by what paints past
     *  a box — a filter's bleed, a box shadow, glyphs over a tight line box, a
     *  text shadow or outline — and its drawing's bounds with the raster pad.
     *  The same measure a group layer sizes itself by. */
    static inkOf(s, m) {
        if (!s.ownsInk())
            return EMPTY_BOX;
        let bleed = s.filter === null ? 0 : filterBleed(s.filter);
        if (s.shadow !== null)
            bleed = Math.max(bleed, Math.abs(s.shadow.dx) + s.shadow.blur, Math.abs(s.shadow.dy) + s.shadow.blur);
        if (s.ascent > 0)
            bleed = Math.max(bleed, s.ascent);
        if (s.textShadow !== null)
            bleed = Math.max(bleed, Math.abs(s.textShadow.dx) + s.textShadow.blur, Math.abs(s.textShadow.dy) + s.textShadow.blur);
        if (s.textOutline !== null)
            bleed = Math.max(bleed, s.textOutline.width);
        let b = CanvasSurface.mapBox(m, -bleed, -bleed, s.width + bleed, s.height + bleed);
        const d = s.drawing;
        if (d !== null && d.bounds !== null) {
            const p = rasterPad(d) + bleed;
            b = boxUnion(b, CanvasSurface.mapBox(m, d.bounds.x - p, d.bounds.y - p, d.bounds.x + d.bounds.w + p, d.bounds.y + d.bounds.h + p));
        }
        return b;
    }
    static mapBox(m, ax, ay, bx, by) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < 4; i++) {
            const px = i & 1 ? bx : ax, py = i & 2 ? by : ay;
            const X = m.a * px + m.c * py + m.e, Y = m.b * px + m.d * py + m.f;
            if (X < x0)
                x0 = X;
            if (X > x1)
                x1 = X;
            if (Y < y0)
                y0 = Y;
            if (Y > y1)
                y1 = Y;
        }
        return { x0, y0, x1, y1 };
    }
    /** Where `s`'s subtree paints NOW, given the matrix its own offset composes
     *  onto; null when unknowable (3D). An invisible subtree paints nothing. */
    static subtreeBoxNow(s, parent) {
        if (!s.visible || s.opacity <= 0)
            return EMPTY_BOX;
        if (s.spec3D !== null)
            return null;
        let m = parent.translate(s.x, s.y);
        if (!affineIsIdentity(s.xform))
            m = m.multiply(new DOMMatrix([s.xform[0], s.xform[1], s.xform[2], s.xform[3], s.xform[4], s.xform[5]]));
        let b = CanvasSurface.inkOf(s, m);
        const clips = s.boxClip || s.scrolls || s.scrollsX || s.clipData !== null;
        const cut = clips ? CanvasSurface.mapBox(m, 0, 0, s.width, s.height) : null;
        let inside = EMPTY_BOX; // the clipped children's union, cut below
        for (const c of s.children) {
            const clipped = cut !== null && !c.ignoresClip;
            // the clipped union already fills the box: no child can add to it
            if (clipped && cut !== null && inside.x0 <= cut.x0 && inside.y0 <= cut.y0 && inside.x1 >= cut.x1 && inside.y1 >= cut.y1)
                continue;
            const cm = (s.scrolls || s.scrollsX) && !c.ignoresScroll
                ? m.translate(s.scrollsX ? -(s.scrollVisualX ?? s.scrollXOffset) : 0, s.scrolls ? -(s.scrollVisualY ?? s.scrollOffset) : 0) : m;
            const cb = CanvasSurface.subtreeBoxNow(c, cm);
            if (cb === null)
                return null;
            if (clipped)
                inside = boxUnion(inside, cb);
            else
                b = boxUnion(b, cb);
        }
        if (cut !== null && !boxEmpty(inside)) {
            const x0 = Math.max(cut.x0, inside.x0), y0 = Math.max(cut.y0, inside.y0), x1 = Math.min(cut.x1, inside.x1), y1 = Math.min(cut.y1, inside.y1);
            if (x1 > x0 && y1 > y0)
                b = boxUnion(b, { x0, y0, x1, y1 });
        }
        return b;
    }
    paintSelf(ctx) {
        if (!this.visible || this.opacity <= 0)
            return;
        if (this.spec3D !== null) {
            this.paint3D(ctx);
            return;
        }
        ctx.save();
        ctx.translate(this.x, this.y);
        if (!affineIsIdentity(this.xform)) {
            // one matrix: scale, skew, rotate about the shared pivot (affine.ts)
            const m = this.xform;
            ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
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
            || this.filter !== null
            || this.mask !== null
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
        // A filter lands on the CLIPPED subtree and its bleed escapes the clip, as
        // a CSS filter's shadow escapes the element's own overflow: under one the
        // clip goes inside the layer instead of around it.
        const clipInside = group && this.filter !== null ? cpPaint : null;
        if (cpPaint !== null && clipInside === null)
            ctx.clip(cpPaint);
        if (group)
            this.paintLayer(ctx, clipInside);
        else
            this.paintContent(ctx);
        ctx.restore();
    }
    /** The device-space rectangle a group layer actually needs: this subtree's
     *  ink, every bleed that reaches past a box, clamped to the target.
     *
     *  Conservative by construction — it is always safe to paint into MORE than
     *  this. It returns null (meaning "use the whole target", the old behaviour)
     *  when the answer is unknowable or worthless: a 3D descendant, whose
     *  projection is not its box, and a union already covering most of the window.
     *
     *  What reaches past a box, and is therefore added here: a filter's bleed
     *  (filterBleed, the same call the 3D path makes), a box shadow's offset and
     *  blur (painted before the clip, so it escapes on purpose), a drawing's own
     *  bounds plus rasterPad, and a text run's glyphs, which exceed the line box
     *  whenever `lineHeight` is tighter than the face — the case that bit the Mac
     *  host this same day. A clipping surface bounds its children, so the walk
     *  stops there and only follows the ones that opt out. */
    groupDeviceBox(ctx) {
        const target = ctx.canvas;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        let unbounded = false;
        const mark = (m, ax, ay, bx, by) => {
            for (const p of [[ax, ay], [bx, ay], [ax, by], [bx, by]]) {
                const dx = m.a * p[0] + m.c * p[1] + m.e, dy = m.b * p[0] + m.d * p[1] + m.f;
                if (dx < x0)
                    x0 = dx;
                if (dx > x1)
                    x1 = dx;
                if (dy < y0)
                    y0 = dy;
                if (dy > y1)
                    y1 = dy;
            }
        };
        /// Mark one surface's own ink, in a matrix ALREADY in its local space.
        const ink = (s, m) => {
            let bleed = s.filter === null ? 0 : filterBleed(s.filter);
            if (s.shadow !== null) {
                bleed = Math.max(bleed, Math.abs(s.shadow.dx) + s.shadow.blur, Math.abs(s.shadow.dy) + s.shadow.blur);
            }
            if (s.ascent > 0)
                bleed = Math.max(bleed, s.ascent); // glyphs past a tight line box
            mark(m, -bleed, -bleed, s.width + bleed, s.height + bleed);
            const d = s.drawing;
            if (d !== null && d.bounds !== null) {
                const p = rasterPad(d) + bleed;
                mark(m, d.bounds.x - p, d.bounds.y - p, d.bounds.x + d.bounds.w + p, d.bounds.y + d.bounds.h + p);
            }
        };
        /// A CHILD, whose own offset and transform still have to be composed —
        /// unlike the group's root, whose local space the caller's CTM already is.
        const walk = (s, parent) => {
            if (unbounded || !s.visible || s.opacity <= 0)
                return;
            if (s.spec3D !== null) {
                unbounded = true;
                return;
            }
            let m = parent.translate(s.x, s.y);
            if (!affineIsIdentity(s.xform)) {
                const f = s.xform;
                m = m.multiply(new DOMMatrix([f[0], f[1], f[2], f[3], f[4], f[5]]));
            }
            ink(s, m);
            const clips = s.boxClip || s.scrolls || s.scrollsX || s.clipData !== null;
            for (const c of s.children)
                if (!clips || c.ignoresClip)
                    walk(c, m);
        };
        // paint() has already put the CTM in THIS surface's local space (translate
        // by x/y, then its own affine), so the root is marked with it as-is and only
        // descendants compose further.
        const self = ctx.getTransform();
        if (this.spec3D !== null)
            return null;
        ink(this, self);
        const rootClips = this.boxClip || this.scrolls || this.scrollsX || this.clipData !== null;
        for (const c of this.children)
            if (!rootClips || c.ignoresClip)
                walk(c, self);
        if (unbounded || !(x1 > x0) || !(y1 > y0))
            return null;
        const px = Math.max(0, Math.floor(x0) - 1), py = Math.max(0, Math.floor(y0) - 1);
        const qx = Math.min(target.width, Math.ceil(x1) + 1), qy = Math.min(target.height, Math.ceil(y1) + 1);
        if (qx <= px || qy <= py)
            return null;
        const w = qx - px, h = qy - py;
        if (w * h > target.width * target.height * 0.6)
            return null; // nothing worth the arithmetic
        return { x: px, y: py, w, h };
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
    paintLayer(ctx, clipInside = null) {
        const target = ctx.canvas;
        if (target.width === 0 || target.height === 0)
            return;
        // THE LAYER IS THE SUBTREE, not the window (2026-09-13). A group layer used
        // to be allocated at the target's full size whatever it held, so a 200×260
        // card fading in cost a 1880×1320 buffer — allocated, painted, filtered and
        // blitted — every frame. Measured on Chrome, six such groups allocated 360
        // full-canvas scratches a second, ~900 Mpx/s; on Safari, where the filter
        // has no native path, six filtered cards at rest cost one 3.7-SECOND frame.
        // The extent is knowable (groupDeviceBox), so take it; when it is not, or
        // when it saves nothing, fall back to exactly what this did before.
        const box = this.groupDeviceBox(ctx);
        const { c: layer, g: lctx } = takeScratch(box === null ? target.width : box.w, box === null ? target.height : box.h);
        try {
            this.paintLayerInto(ctx, layer, lctx, box, clipInside);
        }
        finally {
            giveScratch(layer);
        }
    }
    paintLayerInto(ctx, layer, lctx, box, clipInside) {
        const m = ctx.getTransform();
        // the same CTM, moved so the layer's own origin is the box's corner — the
        // landing below puts it back, still integer-aligned, still no resampling
        if (box === null)
            lctx.setTransform(m);
        else
            lctx.setTransform(m.a, m.b, m.c, m.d, m.e - box.x, m.f - box.y);
        const ldx = box === null ? 0 : box.x, ldy = box === null ? 0 : box.y;
        LAYER_DX += ldx;
        LAYER_DY += ldy;
        if (clipInside !== null) {
            lctx.save();
            lctx.clip(clipInside);
        }
        try {
            this.paintContent(lctx);
        }
        finally {
            LAYER_DX -= ldx;
            LAYER_DY -= ldy;
            if (clipInside !== null)
                lctx.restore();
        }
        if (this.mask !== null)
            this.applyMaskTo(layer, lctx);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = this.opacity;
        const lx = box === null ? 0 : box.x, ly = box === null ? 0 : box.y;
        if (this.filter === null) {
            ctx.drawImage(layer, lx, ly);
        }
        else {
            // THE FILTER TIER (graphics-pass.md §1). Lengths are view units; the
            // filter runs in device space, so they scale by the composed transform's
            // magnitude — frost's rule, the opposite of a drawing's d.filter. `tint`
            // has no ctx.filter function: a source-in pass over the layer first.
            const mag = Math.hypot(m.a, m.b) || 1;
            let src = layer;
            const tint = this.filter.find((f) => f.fn === "colorize");
            let tinted = null;
            if (tint !== undefined && tint.fn === "colorize") {
                const { c: t, g: tg } = takeScratch(layer.width, layer.height);
                tinted = t;
                tg.drawImage(layer, 0, 0);
                tg.globalCompositeOperation = "source-in";
                tg.fillStyle = colorToCss(tint.color);
                tg.fillRect(0, 0, t.width, t.height);
                src = t;
            }
            const rest = this.filter.filter((f) => f.fn !== "colorize");
            const css = filterCss(rest, mag);
            if (rest.length === 0)
                ctx.drawImage(src, lx, ly);
            else if (ctxFilterSupported()) {
                ctx.filter = css;
                ctx.drawImage(src, lx, ly);
                ctx.filter = "none";
            }
            else
                ctx.drawImage(applyFilterFallback(src, parseFilter(css), this.compositor.inMotion), lx, ly);
            if (tinted !== null)
                giveScratch(tinted);
        }
        ctx.restore();
    }
    /** A view out of its plane: its subtree into a local-space layer at the
     *  composed density, then onto the parent's context through the
     *  homography, strip by strip. Children outside the box (plus the filter's
     *  bleed) are cut — the projected layer is the box. */
    paint3D(ctx) {
        const d = this.spec3D;
        const H = this.homography3D();
        const w = this.width, h = this.height;
        if (w <= 0 || h <= 0)
            return;
        if (d.backfaceHidden && !frontFacing(H, w, h))
            return;
        const m = ctx.getTransform();
        const k = Math.hypot(m.a, m.b) || 1; // device px per parent unit
        // the layer reaches past the box by the filter's bleed and the box
        // shadow's (spread, offset, 3σ) — the shadow is the plane's own paint, so
        // it is projected with the face, as a CSS box-shadow is transformed with it
        const boxShadow = this.shadow;
        const shadowPad = boxShadow === null ? 0 : Math.ceil(Math.max(Math.abs(boxShadow.dx), Math.abs(boxShadow.dy)) + 3 * boxShadow.blur);
        const pad = Math.max(this.filter === null ? 0 : filterBleed(this.filter), shadowPad);
        const lw = Math.max(1, Math.ceil((w + 2 * pad) * k)), lh = Math.max(1, Math.ceil((h + 2 * pad) * k));
        if (lw * lh > 16_000_000)
            return; // a projected layer past any sane budget: skip, never hang
        const layer = document.createElement("canvas");
        layer.width = lw;
        layer.height = lh;
        const lctx = layer.getContext("2d");
        lctx.setTransform(k, 0, 0, k, pad * k, pad * k);
        if (boxShadow !== null) {
            this.box ??= boxShape(w, h, this.cornerRadius);
            paintBoxShadow(lctx, this.box, boxShadow);
        }
        this.paintContent(lctx);
        if (this.mask !== null)
            this.applyMaskTo(layer, lctx);
        // The strips land on a scratch of their own, and the scratch lands ONCE as
        // the group — opacity, a blend and the filter on the projected whole (a
        // per-strip filter would blur or shadow each strip onto the faces around
        // it: the composed card's bands, 2026-09-12).
        const filterCss3D = this.filter !== null && ctxFilterSupported() ? filterCss(this.filter.filter((f) => f.fn !== "colorize"), k) : null;
        let target = ctx;
        let scratch = null;
        let sbx = 0, sby = 0;
        {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (const [cx, cy] of [[-pad, -pad], [w + pad, -pad], [-pad, h + pad], [w + pad, h + pad]]) {
                const [px, py] = applyH(H, cx, cy);
                const dx = m.a * px + m.c * py + m.e, dy = m.b * px + m.d * py + m.f;
                x0 = Math.min(x0, dx);
                y0 = Math.min(y0, dy);
                x1 = Math.max(x1, dx);
                y1 = Math.max(y1, dy);
            }
            const bleed = Math.ceil(pad * k) + 1; // the filter's reach, in device px
            sbx = Math.floor(x0) - bleed;
            sby = Math.floor(y0) - bleed;
            const sw = Math.ceil(x1) + bleed - sbx, sh = Math.ceil(y1) + bleed - sby;
            if (sw > 0 && sh > 0 && sw * sh <= 16_000_000) {
                scratch = document.createElement("canvas");
                scratch.width = sw;
                scratch.height = sh;
                target = scratch.getContext("2d");
                target.setTransform(m.a, m.b, m.c, m.d, m.e - sbx, m.f - sby);
            }
        }
        ctx.save();
        if (scratch === null) {
            ctx.globalAlpha = this.opacity;
            if (this.blendMode !== "source-over")
                ctx.globalCompositeOperation = this.blendMode;
            if (filterCss3D !== null)
                ctx.filter = filterCss3D; // only when no scratch could be had
        }
        // Strips run along the axis the projection is exact on: rows under a turn
        // about X (a row stays a row, only its scale changes), columns under a
        // turn about Y. Each strip is one affine map of its layer pixels.
        const byColumns = Math.abs(Math.sin((d.rotateY * Math.PI) / 180)) > Math.abs(Math.sin((d.rotateX * Math.PI) / 180));
        const span = byColumns ? w : h, spanPx = byColumns ? lw : lh;
        const N = Math.max(8, Math.min(120, Math.ceil(span / 3)));
        const S0 = -pad, SS = span + 2 * pad;
        const at = (along, across) => byColumns ? applyH(H, along, across) : applyH(H, across, along);
        const acrossEnd = (byColumns ? h : w) + pad;
        // Do the strips land as axis-aligned bands? Under a turn about one axis
        // and no 2D rotation or skew they do (a row stays horizontal, a column
        // vertical), and then each can own whole device pixels.
        const base = target.getTransform();
        const devAxis = (x, y) => byColumns ? base.a * x + base.c * y + base.e : base.b * x + base.d * y + base.f;
        const e0 = at(S0, -pad), e1 = at(S0, acrossEnd), f0 = at(S0 + SS, -pad), f1 = at(S0 + SS, acrossEnd);
        const aligned = Math.abs(devAxis(e0[0], e0[1]) - devAxis(e1[0], e1[1])) < 1e-6 && Math.abs(devAxis(f0[0], f0[1]) - devAxis(f1[0], f1[1])) < 1e-6;
        for (let i = 0; i < N; i++) {
            const t0 = S0 + (SS * i) / N, t1 = S0 + (SS * (i + 1)) / N;
            const [p0x, p0y] = at(t0, -pad), [p1x, p1y] = at(t0, acrossEnd), [p2x, p2y] = at(t1, -pad);
            const s0 = Math.floor((t0 + pad) * k), s1 = Math.min(spanPx, Math.ceil((t1 + pad) * k) + 1);
            if (s1 - s0 <= 0)
                continue;
            // the strip's affine: along = one source pixel across the strip's
            // length, across = one source pixel through it
            const acrossPx = byColumns ? lh : lw;
            const ux = (p1x - p0x) / acrossPx, uy = (p1y - p0y) / acrossPx;
            const n = (t1 - t0) * k || 1;
            const vx = (p2x - p0x) / n, vy = (p2y - p0y) / n;
            // one source pixel past its neighbours on both sides: an antialiased
            // strip edge drawn alone showed as a hairline seam
            const o0 = Math.max(0, s0 - 1), o1 = Math.min(spanPx, s1 + 1);
            target.save();
            if (aligned) {
                // the strip owns exactly its band of whole device pixels: the band's
                // edges are shared with its neighbours, so the bands tile — no
                // antialiased seam, and the rows it draws past the band are cut
                const T = base, dev = (x, y) => [T.a * x + T.c * y + T.e, T.b * x + T.d * y + T.f];
                const a0 = dev(p0x, p0y), a1 = dev(p2x, p2y);
                const lo = Math.round(byColumns ? a0[0] : a0[1]), hi = i === N - 1 ? Infinity : Math.round(byColumns ? a1[0] : a1[1]);
                target.setTransform(1, 0, 0, 1, 0, 0);
                target.beginPath();
                const from = i === 0 ? -Infinity : lo;
                if (byColumns)
                    target.rect(Math.max(-1e6, from), -1e6, Math.min(1e6, hi) - Math.max(-1e6, from), 2e6);
                else
                    target.rect(-1e6, Math.max(-1e6, from), 2e6, Math.min(1e6, hi) - Math.max(-1e6, from));
                target.clip();
                target.setTransform(T);
            }
            if (byColumns) {
                target.transform(vx, vy, ux, uy, p0x, p0y);
                target.drawImage(layer, o0, 0, o1 - o0, lh, o0 - s0, 0, o1 - o0, lh);
            }
            else {
                target.transform(ux, uy, vx, vy, p0x, p0y);
                target.drawImage(layer, 0, o0, lw, o1 - o0, 0, o0 - s0, lw, o1 - o0);
            }
            target.restore();
        }
        if (scratch !== null) {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = this.opacity;
            if (this.blendMode !== "source-over")
                ctx.globalCompositeOperation = this.blendMode;
            if (filterCss3D !== null)
                ctx.filter = filterCss3D; // device space, as ctx.filter lengths are
            ctx.drawImage(scratch, sbx, sby);
        }
        ctx.restore();
    }
    /** Cut the group layer to the mask's alpha. The mask is painted into its
     *  own scratch first (a stencil's several fills must not each cut the
     *  layer in turn), then landed with `destination-in`. */
    applyMaskTo(layer, lctx) {
        const spec = this.mask;
        const { c: m, g: mctx } = takeScratch(layer.width, layer.height);
        try {
            this.maskInto(m, mctx, layer, lctx, spec);
        }
        finally {
            giveScratch(m);
        }
    }
    maskInto(m, mctx, layer, lctx, spec) {
        void layer;
        mctx.setTransform(lctx.getTransform()); // the masked view's own frame
        if (spec.kind === "gradient") {
            mctx.fillStyle = realizeGradient(mctx, spec.gradient, this.width, this.height);
            mctx.fillRect(0, 0, this.width, this.height);
        }
        else {
            const st = spec.stencil.surface;
            if (st === null)
                return; // not attached yet: no mask this frame
            mctx.translate(spec.stencil.x, spec.stencil.y);
            st.paintContent(mctx);
        }
        lctx.save();
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.globalCompositeOperation = "destination-in";
        lctx.drawImage(m, 0, 0);
        lctx.restore();
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
        const pad = filterBlur(b);
        const cs = [[-pad, -pad], [this.width + pad, -pad], [-pad, this.height + pad], [this.width + pad, this.height + pad]]
            .map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
        const dx0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[0]))));
        const dy0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[1]))));
        const dx1 = Math.min(ctx.canvas.width, Math.ceil(Math.max(...cs.map((c) => c[0]))));
        const dy1 = Math.min(ctx.canvas.height, Math.ceil(Math.max(...cs.map((c) => c[1]))));
        const dw = dx1 - dx0, dh = dy1 - dy0;
        if (dw <= 0 || dh <= 0)
            return;
        const { c: snap, g: sg } = takeScratch(dw, dh);
        try {
            sg.drawImage(ctx.canvas, dx0, dy0, dw, dh, 0, 0, dw, dh);
            this.frostFrom(ctx, snap, b, scaleMag, dx0, dy0);
        }
        finally {
            giveScratch(snap);
        }
    }
    frostFrom(ctx, snap, b, scaleMag, dx0, dy0) {
        ctx.save();
        // clip to the view's own painted shape (rounded box; an explicit shape
        // clip from paint()'s bracket composes by intersection)
        this.box ??= boxShape(this.width, this.height, this.cornerRadius);
        ctx.clip(this.box);
        // blur is stated in view px; the filter runs in device space
        const spec = filterCss(b, scaleMag);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (ctxFilterSupported()) {
            ctx.filter = spec;
            ctx.drawImage(snap, dx0, dy0);
        }
        else {
            // WebKit accepts ctx.filter and paints unfiltered (canvas-filter.ts), so
            // frost there composited an untouched copy of its own backdrop. Blur the
            // sample ourselves and draw the RESULT — same promise, different
            // mechanism, which is the standing ruling for anything that differs by
            // engine rather than by design.
            // in motion: the GPU-only blur, no readback, no colour — and a booking
            // for the exact frame at rest; at rest: the calibrated pass, once
            const approx = this.compositor.inMotion;
            const out = applyFilterFallback(snap, parseFilter(spec), approx);
            ctx.drawImage(out, dx0, dy0);
            if (approx)
                this.compositor.frostWantsRest(this);
        }
        ctx.restore();
    }
    /** Paint order: box (shadow, fill, inside border), image, drawing, text,
     *  then children — the same content order the DOM backend's element order
     *  produces. */
    paintContent(ctx, skipExempt = false) {
        // __declareNoFrost: an A/B lever, never a setting — it exists so a frame-
        // rate question can be answered by measurement rather than by argument
        if (this.backdrop !== null && globalThis.__declareNoFrost !== true)
            this.paintFrost(ctx);
        this.paintBox(ctx);
        if (this.image !== null) {
            const st = this.stretch;
            // an <img> reports naturalWidth, a <video> videoWidth — one fact, two spellings
            const vid = this.image;
            const natW = typeof vid.videoWidth === "number" ? vid.videoWidth : this.image.naturalWidth;
            const natH = typeof vid.videoWidth === "number" ? vid.videoHeight : this.image.naturalHeight;
            const bmp = this.tintedBitmap(natW, natH) ?? this.image;
            // resampled as the browser resamples an <img>, not canvas's default
            const smooth = ctx.imageSmoothingQuality;
            ctx.imageSmoothingQuality = "high";
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
                ctx.drawImage(bmp, (this.width - dw) * (FIT_FRAC[this.alignX] ?? 0.5), (this.height - dh) * (FIT_FRAC[this.alignY] ?? 0.5), dw, dh);
                if (st === "cover")
                    ctx.restore();
            }
            else {
                const w = st === "width" || st === "both" ? this.width : natW;
                const h = st === "height" || st === "both" ? this.height : natH;
                ctx.drawImage(bmp, 0, 0, w, h);
            }
            ctx.imageSmoothingQuality = smooth;
            // a running video changes pixels with no write to the graph: ask for the
            // next frame here, or the picture would freeze on its first one
            if (this.videoRunning())
                this.compositor.invalidate(this);
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
            // The painted glyphs after `textTransform` — the shared measurer shaped
            // widths from this same string (measure.ts transformText), so wraps and
            // alignment agree with what lands.
            const disp = this.textTransform === "none" ? this.text : transformText(this.text, this.textTransform);
            // One line's ink: the outline strokes UNDER the fill (CSS `paint-order:
            // stroke` — the DOM twin), then underline/strike rule beneath, in the
            // solid text color (CSS `text-decoration-color` = currentColor, not the
            // gradient fill). Stroke width is user-space, so the CTM scales it right.
            const paintLine = (line, x, y) => {
                const o = this.textOutline;
                if (o !== null) {
                    ctx.save();
                    ctx.lineWidth = o.width;
                    ctx.strokeStyle = colorToCss(o.color);
                    ctx.lineJoin = "round";
                    ctx.strokeText(line, x, y);
                    ctx.restore();
                }
                ctx.fillText(line, x, y);
                if (this.textUnderline || this.textStrike) {
                    const lw = textWidth(line, this.font, this.letterSpacing);
                    const th = Math.max(1, Math.round(this.fontSizePx / 16));
                    // The rule is CENTER-anchored on the decoration axis (`fillRect` takes a
                    // top, so subtract half the thickness): the browser paints line-through
                    // and underline at a font-metric position, and matching that CENTER —
                    // not the band's top — is what keeps the Canvas and DOM backends in step.
                    // Ratios are measured off the reference (system-ui, several sizes): a
                    // strike centered ~0.31·fs ABOVE the baseline (through the letter bodies),
                    // an underline ~0.11·fs below it. The old top-anchored 0.28/0.12 sank both
                    // by half a thickness — the strike visibly (~0.05·fs low), the underline
                    // slightly.
                    ctx.save();
                    ctx.fillStyle = this.textFill;
                    if (this.textUnderline)
                        ctx.fillRect(x, Math.round(y + this.fontSizePx * 0.11 - th / 2), lw, th);
                    if (this.textStrike)
                        ctx.fillRect(x, Math.round(y - this.fontSizePx * 0.31 - th / 2), lw, th);
                    ctx.restore();
                }
            };
            if (this.wrap && this.width > 0) {
                // Wrapping: break at the set-time-cached points and stack the lines at
                // the shared stride (the DOM backend's `line-height`), aligning each
                // within the box. The greedy breaker (measure.ts) is the one BOTH
                // backends share, so the DOM's native wrap and this agree.
                if (this.textLines === null) {
                    this.textLines = clampLines(wrapLines(disp, this.font, this.width, this.letterSpacing), this.maxLines, this.font, this.width, this.letterSpacing);
                }
                const lines = this.textLines;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    let x = 0;
                    if (this.align !== "left") {
                        const lw = textWidth(line, this.font, this.letterSpacing);
                        x = this.align === "center" ? (this.width - lw) / 2 : this.width - lw;
                    }
                    paintLine(line, x, this.halfLead + this.ascent + i * this.lineHeight);
                }
            }
            else {
                // A single (non-wrapping) run still honors alignment: the DOM backend
                // sets width:100% + text-align for a non-left run, centering/ending the
                // line within the box. Mirror that — measure the line and offset x by
                // the same rule the wrap branch uses, so both backends place identical
                // glyph geometry. (align=left keeps x=0, the shrink-to-content case.)
                // A hard newline still breaks the line, as it does on the DOM (`pre`) and the
                // Mac host — only SOFT wrapping is off. Painting the whole string at one
                // baseline put every line of a Markdown code block on the first line, in a
                // box already sized (by Text's own height) for all of them.
                const hard = disp.split("\n");
                for (let i = 0; i < hard.length; i++) {
                    const line = hard[i];
                    let x = 0;
                    if (this.align !== "left" && this.width > 0) {
                        const lw = textWidth(line, this.font, this.letterSpacing);
                        x = this.align === "center" ? (this.width - lw) / 2 : this.width - lw;
                    }
                    paintLine(line, x, this.halfLead + this.ascent + i * this.lineHeight);
                }
            }
            if (restoreShadow)
                ctx.restore();
            if (this.letterSpacing !== 0)
                lsCtx.letterSpacing = "0px";
        }
        if (this.scrolls || this.scrollsX) {
            // Scroll container: clip to the box and offset the content — the canvas
            // realization of native `overflow`, on whichever axes scroll. Siblings
            // outside this surface are untouched, so fixed chrome draws at its own
            // coordinates: no reposition, no jitter. (Mirror this transform in `hit`
            // and `scrollBy`.)
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, this.width, this.height);
            ctx.clip();
            // (the VISUAL offset carries a touch session's rubber band; the fact
            // underneath stays clamped)
            ctx.translate(this.scrollsX ? -(this.scrollVisualX ?? this.scrollXOffset) : 0, this.scrolls ? -(this.scrollVisualY ?? this.scrollOffset) : 0);
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
// ─── DEV ONLY (profiling builds) ────────────────────────────────────────────
// Everything below is reached only from sites guarded by the build flag named
// in place, so a production build folds the calls away and drops these.
/** why the last paint was full (the reason meter) */
let DEV_WHY = "";
let DEV_BIG = "", DEV_BIG_AREA = 0, DEV_T0 = 0;
function devNoteFull(why) {
    const st = (globalThis.__declarePaintWhy ??= {});
    st[why] = (st[why] ?? 0) + 1;
}
/** The paint meter: paints, their JS time, how many were partial, and the
 *  share of the canvas they covered. */
function devPaintEnd(damage, w, h) {
    const st = (globalThis.__declarePaintStats ??= { n: 0, ms: 0, full: 0, partial: 0, area: 0 });
    st.n++;
    st.ms += performance.now() - DEV_T0;
    if (damage === null) {
        st.full++;
        st.area += 1;
    }
    else {
        st.partial++;
        let a = 0;
        for (const q of damage)
            a += boxArea(q);
        st.area += a / Math.max(1, w * h);
    }
}
/** The largest single contribution to a frame's damage, for the reason meter. */
function devNoteBig(s, was, now) {
    const u = boxUnion(was, now), area = boxArea(u);
    if (area <= DEV_BIG_AREA)
        return;
    DEV_BIG_AREA = area;
    const text = s.text;
    DEV_BIG = `${Math.round(s.width)}x${Math.round(s.height)} ${s.children.length}ch${text ? " '" + text.slice(0, 10) + "'" : ""} was ${Math.round(was.x1 - was.x0)}x${Math.round(was.y1 - was.y0)} now ${Math.round(now.x1 - now.x0)}x${Math.round(now.y1 - now.y0)}`;
}
/** A partial frame painted with save/restore counted: a restore() below the
 *  clip's level would drop the clip mid-frame and paint outside the damage. */
function devPaintCounted(ctx, root) {
    let depth = 0, escaped = null;
    const save0 = ctx.save, restore0 = ctx.restore;
    ctx.save = function () { depth++; save0.call(this); };
    ctx.restore = function () { depth--; if (depth < 0 && escaped === null)
        escaped = String(new Error().stack).split("\n").slice(2, 7).join(" < "); restore0.call(this); };
    try {
        root.paint(ctx);
    }
    finally {
        ctx.save = save0;
        ctx.restore = restore0;
    }
    if (escaped !== null || depth !== 0) {
        const g = globalThis;
        (g.__declareDamageEscape ??= []).push({ depth, escaped });
    }
}
/** Who invalidates large containers (a surface with at least
 *  __declareDamageWhoMin children), by call site. */
function devNoteWho(s) {
    if (s.children.length < +(globalThis.__declareDamageWhoMin ?? 9))
        return;
    const g = globalThis;
    if (typeof g.__declareDamageWho !== "object")
        g.__declareDamageWho = {};
    const k = `${Math.round(s.width)}x${Math.round(s.height)} ${s.children.length}ch < ` + String(new Error().stack).split("\n").slice(2, 5).map((l) => l.trim().replace(/\(.*\//, "(")).join(" < ");
    g.__declareDamageWho[k] = (g.__declareDamageWho[k] ?? 0) + 1;
}
/** THE CHECKING MODE: after a partial frame, repaint everything offscreen and
 *  compare with what the partial frame left on the canvas. Run it with GPU
 *  canvas off (the rig passes --disable-accelerated-2d-canvas): Chrome picks
 *  GPU or software per canvas, and the two antialias differently. */
function devCheckDamage(screen, root, damage, w, h, dpr) {
    const within = (x, y) => { for (const q of damage)
        if (x >= q.x0 && x < q.x1 && y >= q.y0 && y < q.y1)
            return true; return false; };
    // Two references, one per region. INSIDE the damage: everything repainted
    // under the SAME clip with no culling — exact, so any difference is a
    // subtree the cull wrongly skipped. (Not the unclipped repaint: Chrome's
    // software raster antialiases a curve differently near a clip or canvas
    // edge — measured up to 9 rows in, 18/255; its GPU raster doesn't — and
    // the check pins software.) OUTSIDE: the full unclipped repaint, past a
    // tolerance for that same edge noise left by earlier partial frames — a
    // missed invalidation (content moved or changed, never repainted) shows
    // far above it.
    const canvas = screen.canvas;
    if (w === 0 || h === 0)
        return;
    const ref = (clip) => {
        const off = document.createElement("canvas");
        off.width = w;
        off.height = h;
        const c = off.getContext("2d", { willReadFrequently: true });
        if (clip) {
            c.beginPath();
            for (const q of damage)
                c.rect(q.x0, q.y0, q.x1 - q.x0, q.y1 - q.y0);
            c.clip();
        }
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        root.paint(c);
        return c.getImageData(0, 0, w, h).data;
    };
    const a = screen.getImageData(0, 0, w, h).data, full = ref(false), clipped = ref(true);
    const OUTSIDE_NOISE = 24;
    let n = 0, nin = 0, worst = 0, pxIn = 0, pxOut = 0;
    const cells = new Map();
    const px = [];
    for (let i = 0; i < a.length; i += 4) {
        const p = i >> 2, x = p % w, y = (p / w) | 0;
        const inside = within(x, y);
        const b = inside ? clipped : full, tol = inside ? 3 : OUTSIDE_NOISE;
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]), Math.abs(a[i + 3] - b[i + 3]));
        if (d <= tol)
            continue;
        n++;
        if (d > worst)
            worst = d;
        if (inside)
            nin++;
        if ((inside ? pxIn++ : pxOut++) < 4)
            px.push([x, y, a[i], a[i + 1], a[i + 2], a[i + 3], b[i], b[i + 1], b[i + 2], b[i + 3]]);
        const key = (inside ? "in " : "out ") + ((x >> 6) << 6) + "," + ((y >> 6) << 6);
        cells.set(key, (cells.get(key) ?? 0) + 1);
    }
    const g = globalThis;
    if (typeof g.__declareDamageCheck !== "object" || g.__declareDamageCheck === null)
        g.__declareDamageCheck = { partials: 0, mismatches: [] };
    const rec = g.__declareDamageCheck;
    rec.partials++;
    if (n > 0 && rec.mismatches.length < 50) {
        const suspects = [];
        const q = px.find((p) => !within(p[0], p[1])) ?? px[0], pt = { x0: q[0] - 3, y0: q[1] - 3, x1: q[0] + 4, y1: q[1] + 4 };
        const walk = (x, depth) => {
            if (suspects.length >= 8)
                return;
            const any = x;
            if (x.painted !== null && boxHit(x.painted, pt) && x.visible)
                suspects.push({ depth, n: x.children.length, w: +x.width.toFixed(2), h: +x.height.toFixed(2), text: String(any.text ?? "").slice(0, 12), painted: [x.painted.x0, x.painted.y0, x.painted.x1, x.painted.y1].map((v) => +v.toFixed(2)), drawing: any.drawing !== null, fill: any.fill, hitsDamage: hitsAny(x.painted, damage) });
            for (const c of x.children)
                walk(c, depth + 1);
        };
        walk(root, 0);
        const gs = globalThis;
        if (n > 100 && gs.__declareDamageShots === undefined)
            gs.__declareDamageShots = [canvas.toDataURL()];
        const top = [...cells].sort((p, q2) => q2[1] - p[1]).slice(0, 8).map(([k, v]) => k + ":" + v);
        rec.mismatches.push({ pixels: n, inside: nin, worst, frame: rec.partials, damage, top, px, suspects });
    }
}
/** A recording onto the SHARED scene. One that composites with anything but
 *  source-over (`multiply`, `destination-out`, `source-atop`) replays onto a
 *  transparent surface of its own over the recording's device-space extent (the
 *  whole target when an op has none), which then lands source-over — so the
 *  operator acts on the drawing's own marks, as on the canvas element the DOM
 *  renderer gives each drawing, never on the card or the page beneath it. Here,
 *  not in draw.ts, because only this renderer shares one canvas. */
function replayOnScene(ctx, list, clip) {
    if (!listIsolated(list)) {
        replay(ctx, list, clip);
        return;
    }
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const m = ctx.getTransform();
    let x0 = 0, y0 = 0, x1 = W, y1 = H;
    const ext = list.extents ?? [];
    let lx0 = Infinity, ly0 = Infinity, lx1 = -Infinity, ly1 = -Infinity, bounded = true;
    for (let i = 0; i < list.ops.length; i++) {
        const k = list.ops[i].op;
        if (k !== "fillRect" && k !== "strokeRect" && k !== "clearRect" && k !== "fill" && k !== "stroke" && k !== "fillText" && k !== "strokeText" && k !== "drawImage")
            continue;
        const e = ext[i];
        if (!e) {
            bounded = false;
            break;
        }
        lx0 = Math.min(lx0, e.x);
        ly0 = Math.min(ly0, e.y);
        lx1 = Math.max(lx1, e.x + e.w);
        ly1 = Math.max(ly1, e.y + e.h);
    }
    if (bounded && lx0 <= lx1) {
        const pad = rasterPad(list) + 2;
        const cs = [[lx0 - pad, ly0 - pad], [lx1 + pad, ly0 - pad], [lx0 - pad, ly1 + pad], [lx1 + pad, ly1 + pad]]
            .map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
        x0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[0]))));
        y0 = Math.max(0, Math.floor(Math.min(...cs.map((c) => c[1]))));
        x1 = Math.min(W, Math.ceil(Math.max(...cs.map((c) => c[0]))));
        y1 = Math.min(H, Math.ceil(Math.max(...cs.map((c) => c[1]))));
    }
    if (x1 <= x0 || y1 <= y0)
        return;
    const layer = makeCanvas(x1 - x0, y1 - y0);
    const lc = layer.getContext("2d");
    if (lc === null) {
        replay(ctx, list, clip);
        return;
    }
    lc.setTransform(m.a, m.b, m.c, m.d, m.e - x0, m.f - y0);
    replay(lc, list, clip);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(layer, x0, y0);
    ctx.restore();
}
//# sourceMappingURL=canvas-backend.js.map