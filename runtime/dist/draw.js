// First-class drawing, per the ruled rendering model (HANDOFF "The rendering
// model"): a view's draw method runs on *invalidation* — never per frame —
// and records into a **display list** of plain-data ops. Never live pixels,
// never a stored Path2D: every op is structured-cloneable by construction, so
// a recording can cross a worker boundary later. Bounds are a first-class
// product of recording (conservative unions of op geometry, stroke-expanded).
//
// Both backends replay the same list — the Canvas backend straight into the
// shared ctx during the composite walk, the DOM backend rasterized into that
// view's own <canvas> — which is what makes a recording substrate-independent
// and lets the runtime re-host a view without re-entering user code.
//
// The vocabulary is Canvas2D, and completeness is the goal: a developer who
// knows Canvas should find Canvas. The only things left out are the ones the
// recording model genuinely cannot honor —
//   • READS (measureText, getImageData, isPointInPath/Stroke, every getter):
//     the body records ops possibly detached from any live context, so it
//     cannot answer a synchronous read.
//   • LIVE IMAGE SOURCES (drawImage, createPattern(image), putImageData): they
//     take a live HTMLImageElement/ImageBitmap/ImageData; the op shape is here
//     and ready, but the pixels reach it through an image-HANDLE model (a
//     decoded, transferable bitmap) that the loading side must supply — the
//     follow-on, not a refusal.
// Everything else — text, gradients, shadow/blur, filter, compositing,
// clipping, transforms, the full path and rect set — is here.
import { DeclareError } from "./errors.js";
import { applyFilterFallback, ctxFilterSupported, isIdentity, parseFilter } from "./canvas-filter.js";
import { fontMetrics, textWidth } from "./measure.js";
import { colorToCss } from "./value.js";
/** A style value may be a CSS string or a Declare `Color` (a number) — draw() is
 *  first-class with the language's Color type, so `d.fillStyle = #BCC4E2`
 *  reads like the `fill` attribute, not `"#bcc4e2"`. Strings still pass
 *  through, so the Canvas2D shape is intact. */
const cssOf = (v) => (typeof v === "string" ? v : colorToCss(v));
/** The handle `createLinearGradient`/… returns — Canvas2D's exact shape
 *  (build, `addColorStop`, then assign to fillStyle/strokeStyle), but a plain
 *  accumulator so nothing live crosses the recording boundary. */
export class DrawGradient {
    /** @internal the recorded form the style setter reads. */
    rec;
    constructor(kind, coords) {
        this.rec = { kind, coords, stops: [] };
    }
    addColorStop(offset, color) {
        this.rec.stops.push([offset, cssOf(color)]);
    }
}
const isGradient = (v) => v instanceof DrawGradient;
/** The write-only, Canvas2D-shaped context a draw method records into.
 *
 *  Write-only is a semantic, not a convenience (rendering model rule 4):
 *  reads would break replayability, worker transfer, and substrate
 *  independence, so the style properties throw on read. Inputs reach a draw
 *  method through the view's attributes; at R4, reading a constrained
 *  attribute inside draw is what re-triggers recording. */
export class Draw {
    ops = [];
    /** parallel to `ops` — see DisplayList.extents */
    extents = [];
    push(op) { this.ops.push(op); this.extents.push(null); }
    /** THE VIEW'S OWN SIZE, for a drawing that sizes itself — `d.w` / `d.h`.
     *
     *  The scaffold has typed these since draw() was typed at all, so arithmetic
     *  on them compiled; the runtime never supplied them, so they read `undefined`,
     *  the arithmetic went NaN, the recording bounded to nothing and the drawing
     *  silently vanished. Typechecked, documented, and absent — found by a cold
     *  agent run, 2026-08-05.
     *
     *  GETTERS, not fields, and that is the whole design. `record()` runs inside a
     *  tracked computation, so reading the view's width here registers a dependency
     *  — meaning a plain field would make EVERY drawing re-record on resize, which
     *  is exactly the size-dependent recording the icon guidance warns costs a
     *  reallocation per frame. A getter is read only if the body reads it, so the
     *  dependency is pay-per-use: `d.w` opts a drawing into re-recording on resize,
     *  and a drawing that never mentions it never pays. */
    boxW;
    boxH;
    get w() { return this.boxW(); }
    get h() { return this.boxH(); }
    constructor(boxW = () => 0, boxH = () => 0) {
        this.boxW = boxW;
        this.boxH = boxH;
    }
    // ── bounds bookkeeping (recording-internal, never exposed) ──
    /** Everything painted so far; null until the first paint op. */
    ink = null;
    /** Extent of the current path; reset by beginPath, kept by fill/stroke
     *  (mirroring Canvas2D, where filling does not clear the path). */
    path = null;
    /** Mirror of the recorded lineWidth, for stroke expansion. */
    strokeHalf = 0.5;
    /** Cleared once an op paints an extent the recorder can't bound locally. */
    exactBounds = true;
    /** Mirror of the recorded text state, for bounding a run — the same
     *  pattern as `strokeHalf` for stroke expansion. Canvas2D's defaults. */
    tFont = "10px sans-serif";
    tAlign = "start";
    tBaseline = "alphabetic";
    tLetter = 0;
    /** The live transform matrix [a,b,c,d,e,f] and its save/restore stack. Every
     *  painted extent is mapped through it before it grows the ink box, so the
     *  recording's bounds land in the VIEW's local space even under scale/rotate/
     *  translate — the per-view raster canvas is then sized to what actually
     *  paints, not to the pre-transform authoring coordinates (without this a
     *  scaled illustration is sized to its unscaled box and detaches from the
     *  view as it grows). */
    ctm = [1, 0, 0, 1, 0, 0];
    ctmStack = [];
    // ── styles ──
    set fillStyle(v) {
        this.push(isGradient(v) ? { op: "fillStyle", grad: v.rec } : { op: "fillStyle", v: cssOf(v) });
    }
    get fillStyle() { return this.readOnly("fillStyle"); }
    set strokeStyle(v) {
        this.push(isGradient(v) ? { op: "strokeStyle", grad: v.rec } : { op: "strokeStyle", v: cssOf(v) });
    }
    get strokeStyle() { return this.readOnly("strokeStyle"); }
    set lineWidth(v) { this.strokeHalf = v / 2; this.push({ op: "set", k: "lineWidth", v }); }
    get lineWidth() { return this.readOnly("lineWidth"); }
    set lineCap(v) { this.push({ op: "set", k: "lineCap", v }); }
    get lineCap() { return this.readOnly("lineCap"); }
    set lineJoin(v) { this.push({ op: "set", k: "lineJoin", v }); }
    get lineJoin() { return this.readOnly("lineJoin"); }
    set miterLimit(v) { this.push({ op: "set", k: "miterLimit", v }); }
    get miterLimit() { return this.readOnly("miterLimit"); }
    set lineDashOffset(v) { this.push({ op: "set", k: "lineDashOffset", v }); }
    get lineDashOffset() { return this.readOnly("lineDashOffset"); }
    setLineDash(segments) { this.push({ op: "setLineDash", segments: segments.slice() }); }
    set globalAlpha(v) { this.push({ op: "set", k: "globalAlpha", v }); }
    get globalAlpha() { return this.readOnly("globalAlpha"); }
    set globalCompositeOperation(v) { this.push({ op: "set", k: "globalCompositeOperation", v }); }
    get globalCompositeOperation() { return this.readOnly("globalCompositeOperation"); }
    // shadow/blur: the extent grows unpredictably past the shape, so bounds go loose
    set shadowBlur(v) { this.exactBounds = false; this.push({ op: "set", k: "shadowBlur", v }); }
    get shadowBlur() { return this.readOnly("shadowBlur"); }
    set shadowColor(v) { this.push({ op: "set", k: "shadowColor", v: cssOf(v) }); }
    get shadowColor() { return this.readOnly("shadowColor"); }
    set shadowOffsetX(v) { this.exactBounds = false; this.push({ op: "set", k: "shadowOffsetX", v }); }
    get shadowOffsetX() { return this.readOnly("shadowOffsetX"); }
    set shadowOffsetY(v) { this.exactBounds = false; this.push({ op: "set", k: "shadowOffsetY", v }); }
    get shadowOffsetY() { return this.readOnly("shadowOffsetY"); }
    set filter(v) { this.exactBounds = false; this.push({ op: "set", k: "filter", v }); }
    get filter() { return this.readOnly("filter"); }
    set imageSmoothingEnabled(v) { this.push({ op: "set", k: "imageSmoothingEnabled", v }); }
    get imageSmoothingEnabled() { return this.readOnly("imageSmoothingEnabled"); }
    set imageSmoothingQuality(v) { this.push({ op: "set", k: "imageSmoothingQuality", v }); }
    get imageSmoothingQuality() { return this.readOnly("imageSmoothingQuality"); }
    // text state
    set font(v) { this.tFont = v; this.push({ op: "set", k: "font", v }); }
    get font() { return this.readOnly("font"); }
    set textAlign(v) { this.tAlign = v; this.push({ op: "set", k: "textAlign", v }); }
    get textAlign() { return this.readOnly("textAlign"); }
    set textBaseline(v) { this.tBaseline = v; this.push({ op: "set", k: "textBaseline", v }); }
    get textBaseline() { return this.readOnly("textBaseline"); }
    set direction(v) { this.push({ op: "set", k: "direction", v }); }
    get direction() { return this.readOnly("direction"); }
    set letterSpacing(v) { this.tLetter = parseFloat(v) || 0; this.push({ op: "set", k: "letterSpacing", v }); }
    get letterSpacing() { return this.readOnly("letterSpacing"); }
    set wordSpacing(v) { this.push({ op: "set", k: "wordSpacing", v }); }
    get wordSpacing() { return this.readOnly("wordSpacing"); }
    set fontKerning(v) { this.push({ op: "set", k: "fontKerning", v }); }
    get fontKerning() { return this.readOnly("fontKerning"); }
    // ── gradients (recordable handles — Canvas2D shape, plain-data payload) ──
    createLinearGradient(x0, y0, x1, y1) {
        return new DrawGradient("linear", [x0, y0, x1, y1]);
    }
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
        return new DrawGradient("radial", [x0, y0, r0, x1, y1, r1]);
    }
    createConicGradient(startAngle, x, y) {
        return new DrawGradient("conic", [startAngle, x, y]);
    }
    // ── rects ──
    fillRect(x, y, w, h) {
        this.push({ op: "fillRect", x, y, w, h });
        this.mark(x, y, x + w, y + h);
    }
    strokeRect(x, y, w, h) {
        this.push({ op: "strokeRect", x, y, w, h });
        const e = this.strokeHalf;
        this.mark(x - e, y - e, x + w + e, y + h + e);
    }
    clearRect(x, y, w, h) {
        this.push({ op: "clearRect", x, y, w, h });
        this.mark(x, y, x + w, y + h);
    }
    // ── path building ──
    beginPath() { this.push({ op: "beginPath" }); this.path = null; }
    moveTo(x, y) { this.push({ op: "moveTo", x, y }); this.extend(x, y, x, y); }
    lineTo(x, y) { this.push({ op: "lineTo", x, y }); this.extend(x, y, x, y); }
    /** Bounds take the full circle's box — conservative for partial arcs,
     *  exact for full ones, and no trigonometry in the recorder. */
    arc(x, y, r, a0, a1, ccw = false) {
        this.push({ op: "arc", x, y, r, a0, a1, ccw });
        this.extend(x - r, y - r, x + r, y + r);
    }
    /** The tangent arc's box is bounded by its two guide points (conservative:
     *  the curve stays within their span plus the corner it rounds). */
    arcTo(x1, y1, x2, y2, r) {
        this.push({ op: "arcTo", x1, y1, x2, y2, r });
        this.extend(x1, y1, x1, y1);
        this.extend(x2, y2, x2, y2);
    }
    ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
        this.push({ op: "ellipse", x, y, rx, ry, rot, a0, a1, ccw });
        // conservative: the rotated ellipse fits in a circle of its larger radius
        const r = Math.max(Math.abs(rx), Math.abs(ry));
        this.extend(x - r, y - r, x + r, y + r);
    }
    rect(x, y, w, h) {
        this.push({ op: "rect", x, y, w, h });
        this.extend(x, y, x + w, y + h);
    }
    roundRect(x, y, w, h, radii = 0) {
        this.push({ op: "roundRect", x, y, w, h, radii: Array.isArray(radii) ? radii.slice() : radii });
        this.extend(x, y, x + w, y + h);
    }
    quadraticCurveTo(cpx, cpy, x, y) {
        this.push({ op: "quadraticCurveTo", cpx, cpy, x, y });
        this.extend(cpx, cpy, cpx, cpy);
        this.extend(x, y, x, y);
    }
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
        this.push({ op: "bezierCurveTo", cp1x, cp1y, cp2x, cp2y, x, y });
        this.extend(cp1x, cp1y, cp1x, cp1y);
        this.extend(cp2x, cp2y, cp2x, cp2y);
        this.extend(x, y, x, y);
    }
    closePath() { this.push({ op: "closePath" }); }
    // ── paint ──
    fill(rule) {
        this.push({ op: "fill", rule });
        if (this.path)
            this.mark(this.path.x, this.path.y, this.path.x + this.path.w, this.path.y + this.path.h);
    }
    /** Stroke ink extends half the line width beyond the path box. (A sharp
     *  miter join can poke further; bounds stay advisory until dirty-region
     *  culling consumes them — the rung that lands culling owns tightening.) */
    stroke() {
        this.push({ op: "stroke" });
        if (this.path) {
            const e = this.strokeHalf;
            this.mark(this.path.x - e, this.path.y - e, this.path.x + this.path.w + e, this.path.y + this.path.h + e);
        }
    }
    /** Clip narrows subsequent painting to the current path — no ink of its own,
     *  scoped by save/restore. */
    clip(rule) { this.push({ op: "clip", rule }); }
    // Text: the recorder has no context to measure with, so it asks the SHARED
    // measurer (measure.ts — the one both backends and Text layout already use)
    // for the run's advance and the font's ascent/descent, and bounds the run
    // from those. `exact` still goes false: the box is the FONT's bounding box
    // around the run, padded, not the glyphs' ink — enough to size a raster,
    // not enough to cull against a dirty region.
    //
    // Found by asking "is the size always known?" (DT, 2026-08-25): it was not.
    // fillText marked only its ANCHOR POINT, so a draw() whose only ink was text
    // bounded to a degenerate box, and the DOM backend — which sizes a per-view
    // canvas to the bounds — allocated a 1x1 canvas and rendered NOTHING.
    // Measured on test/probe/textbounds.declare: 0 white pixels on DOM against
    // 3597 on the canvas backend, whose bounds only gate the memo.
    fillText(text, x, y, maxWidth) {
        this.push({ op: "fillText", text: String(text), x, y, maxWidth });
        this.exactBounds = false;
        this.textExtent(String(text), x, y, maxWidth, 0);
    }
    strokeText(text, x, y, maxWidth) {
        this.push({ op: "strokeText", text: String(text), x, y, maxWidth });
        this.exactBounds = false;
        this.textExtent(String(text), x, y, maxWidth, this.strokeHalf);
    }
    /** The run's box from the mirrored text state. With no measurer at all (a
     *  bare Node test constructing a Draw — headless verify provides one) this
     *  falls back to the anchor point, which is what every call did before. */
    textExtent(text, x, y, maxWidth, pen) {
        let w, asc, desc;
        try {
            w = textWidth(text, this.tFont, this.tLetter);
            const m = fontMetrics(this.tFont);
            asc = m.ascent;
            desc = m.descent;
        }
        catch {
            this.mark(x, y, x, y);
            return;
        }
        if (maxWidth !== undefined && maxWidth >= 0 && w > maxWidth)
            w = maxWidth;
        // the measurer is Skia's or an approximation; the renderer may be Core
        // Text. Glyph overhang, italics and metric disagreement all live in this
        // margin — 8% of the advance plus a couple of pixels each way, plus the pen
        const px = w * 0.08 + 2 + pen, py = 2 + pen;
        let x0;
        switch (this.tAlign) {
            case "center":
                x0 = x - w / 2;
                break;
            case "right":
            case "end":
                x0 = x - w;
                break;
            default:
                x0 = x;
                break; // left, start
        }
        const lh = asc + desc;
        let y0;
        switch (this.tBaseline) {
            case "top":
            case "hanging":
                y0 = y;
                break;
            case "middle":
                y0 = y - lh / 2;
                break;
            case "bottom":
            case "ideographic":
                y0 = y - lh;
                break;
            default:
                y0 = y - asc;
                break; // alphabetic
        }
        this.mark(x0 - px, y0 - py, x0 + w + px, y0 + lh + py);
    }
    // ── state + transform ──
    // The recorder tracks the transform matrix, so bounds stay EXACT under any
    // affine transform (the mapped corners give the local-space extent); only
    // blur/filter/text leave bounds inexact.
    save() { this.ctmStack.push([...this.ctm]); this.push({ op: "save" }); }
    restore() { const m = this.ctmStack.pop(); if (m)
        this.ctm = m; this.push({ op: "restore" }); }
    translate(x, y) {
        const [a, b, c, d, e, f] = this.ctm;
        this.ctm = [a, b, c, d, a * x + c * y + e, b * x + d * y + f];
        this.push({ op: "translate", x, y });
    }
    rotate(angle) {
        const s = Math.sin(angle), co = Math.cos(angle);
        this.ctm = matMul(this.ctm, [co, s, -s, co, 0, 0]);
        this.push({ op: "rotate", angle });
    }
    scale(x, y) {
        const [a, b, c, d, e, f] = this.ctm;
        this.ctm = [a * x, b * x, c * y, d * y, e, f];
        this.push({ op: "scale", x, y });
    }
    transform(a, b, c, d, e, f) {
        this.ctm = matMul(this.ctm, [a, b, c, d, e, f]);
        this.push({ op: "transform", m: [a, b, c, d, e, f] });
    }
    setTransform(a, b, c, d, e, f) {
        this.ctm = [a, b, c, d, e, f];
        this.push({ op: "setTransform", m: [a, b, c, d, e, f] });
    }
    resetTransform() { this.ctm = [1, 0, 0, 1, 0, 0]; this.push({ op: "resetTransform" }); }
    /** The finished recording. Called by record(); a Draw is single-use. */
    list() {
        return { ops: this.ops, bounds: this.ink, exact: this.exactBounds, extents: this.extents };
    }
    readOnly(what) {
        throw new DeclareError(`the draw context is write-only — ${what} cannot be read back; inputs come in through attributes (rendering model)`);
    }
    extend(x0, y0, x1, y1) {
        this.path = union(this.path, x0, y0, x1, y1);
    }
    /** Grow the ink box by a painted extent, mapping its four corners through
     *  the live transform first (a rotate makes the axis-aligned span of the
     *  mapped corners the tight local box). Callers pass authoring coordinates;
     *  `extend` keeps the current PATH in those same coordinates, and the
     *  transform is applied here, once, when the path/rect is committed to ink. */
    mark(x0, y0, x1, y1) {
        const [a, b, c, d, e, f] = this.ctm;
        let mx0 = x0, my0 = y0, mx1 = x1, my1 = y1;
        if (!(a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0)) {
            const xa = a * x0 + c * y0 + e, xb = a * x1 + c * y0 + e, xc = a * x0 + c * y1 + e, xd = a * x1 + c * y1 + e;
            const ya = b * x0 + d * y0 + f, yb = b * x1 + d * y0 + f, yc = b * x0 + d * y1 + f, yd = b * x1 + d * y1 + f;
            mx0 = Math.min(xa, xb, xc, xd);
            my0 = Math.min(ya, yb, yc, yd);
            mx1 = Math.max(xa, xb, xc, xd);
            my1 = Math.max(ya, yb, yc, yd);
        }
        this.ink = union(this.ink, mx0, my0, mx1, my1);
        // the op this extent belongs to is the one just pushed — every paint op
        // pushes, then marks, and nothing marks without pushing first
        const i = this.extents.length - 1;
        if (i >= 0)
            this.extents[i] = union(this.extents[i], mx0, my0, mx1, my1);
    }
}
/** 2D affine compose, m·n (both [a,b,c,d,e,f]) — the CTM after `ctx.transform`
 *  or `ctx.rotate` applies n in m's current frame. */
function matMul(m, n) {
    const [a, b, c, d, e, f] = m;
    const [a2, b2, c2, d2, e2, f2] = n;
    return [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];
}
function union(b, x0, y0, x1, y1) {
    if (b === null)
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const nx = Math.min(b.x, x0);
    const ny = Math.min(b.y, y0);
    return { x: nx, y: ny, w: Math.max(b.x + b.w, x1) - nx, h: Math.max(b.y + b.h, y1) - ny };
}
/** Run a draw method against a fresh recorder and return its display list. */
export function record(fn, boxW, boxH) {
    const d = new Draw(boxW, boxH);
    fn(d);
    return d.list();
}
/** Build a real CanvasGradient from a recorded one, against the replay ctx. */
function buildGradient(ctx, g) {
    const c = g.coords;
    const grad = g.kind === "linear" ? ctx.createLinearGradient(c[0], c[1], c[2], c[3])
        : g.kind === "radial" ? ctx.createRadialGradient(c[0], c[1], c[2], c[3], c[4], c[5])
            : ctx.createConicGradient(c[0], c[1], c[2]);
    for (const [o, col] of g.stops)
        grad.addColorStop(o, col);
    return grad;
}
/** Replay a recording into a real 2D context — the one interpreter both
 *  backends share, so a recording renders identically wherever it lands.
 *  Style state is saved/restored; the path is cleared on both sides (save/
 *  restore does not cover the current path in Canvas2D). */
/** Classify a recording's REPLAY expense — the shared half of the adaptive
 *  draw cache (rendering model): a backend may memoize the raster of an
 *  "expensive" list and blit it while (list, scale, dpr) are unchanged. Pure
 *  over the recording, so every backend gates identically. `filter` (blur is
 *  the canonical case — measured ~24ms/flush for one full-screen mesh on
 *  WebKit's deferred CPU raster) is expensive outright; otherwise expense is
 *  op volume, with gradient paints weighted (each builds a ramp at replay). */
/** The raster-policy caps — OUR frugality rules, not platform truth (the web
 *  exposes no raster budget, and its limits are uncharacterized; these keep a
 *  compliant distance from the one documented hard edge, Safari's per-canvas
 *  caps, and scale the total in VIEWPORTS because backdrop-class rasters
 *  scale with the screen). Shared so every backend prices identically. */
/** The BLEED PAD for a recording whose bounds are not exact: blur and shadow
 *  paint past the recorded shapes by amounts the recorder cannot fold into
 *  bounds — but the ops carry the radii, so a sound overscan is computable
 *  after the fact. CSS/canvas `blur(r)` is Gaussian with σ = r/2; visible
 *  support ends by ~3σ, padded here to 2.5·r for margin. Shadows add their
 *  own blur (same law) plus their offset. Shared, so a backend that rasters
 *  a recording (the memo here; the DOM's per-view canvas in its turn) covers
 *  the same painted extent everywhere. */
export function rasterPad(list) {
    if (list.exact)
        return 0;
    let blur = 0, shadowBlur = 0, shadowOff = 0;
    for (const o of list.ops) {
        if (o.op === "set") {
            if (o.k === "filter" && typeof o.v === "string") {
                for (const m of o.v.matchAll(/blur\((\d+(?:\.\d+)?)px\)/g))
                    blur = Math.max(blur, Number(m[1]));
            }
            else if (o.k === "shadowBlur" && typeof o.v === "number")
                shadowBlur = Math.max(shadowBlur, o.v);
            else if ((o.k === "shadowOffsetX" || o.k === "shadowOffsetY") && typeof o.v === "number")
                shadowOff = Math.max(shadowOff, Math.abs(o.v));
        }
    }
    // clamped: a giant blur's far tail is invisible, and an unbounded pad can
    // balloon a viewport-class backdrop past the entry cap at high dpr
    return Math.min(128, Math.ceil(2.5 * blur + 2.5 * shadowBlur + shadowOff));
}
/** The STRETCH GRACE (DT's rule, 2026-08-20): a drawn view whose scale just
 *  changed may render as its stretched prior raster for up to this long;
 *  once the scale has been quiet for the beat, the next frame is exact.
 *  Time-based by CHOICE, not heuristic — "animation done" is undetectable in
 *  this language (a spring, a pointer constraint, and a stream are all just
 *  writers), so the tolerance is declared instead: transitional frames may
 *  stretch, resting content is always crisp within a beat. The constant
 *  matches the visibility facts' at-rest flush — one platform notion of
 *  "quiet for a beat". */
export const RASTER_GRACE_MS = 120;
export const RASTER_MAX_DIM = 8192; // Safari's per-canvas dimension cap (iOS 18 tier)
export const RASTER_MAX_AREA = 16_777_216; // …and the old area cap (iOS < 18) — the safe floor
export function rasterEntryCap(viewportBytes) {
    // 3 viewports: a full-viewport backdrop plus its bleed pad at high dpr
    // must fit — 2 refused exactly the raster the cache exists for
    return Math.min(RASTER_MAX_AREA * 4, 3 * viewportBytes);
}
export function rasterTotalCap(viewportBytes) {
    return Math.min(96 << 20, Math.max(32 << 20, 4 * viewportBytes));
}
const infoCache = new WeakMap();
const UNCULLABLE = new Set(["copy", "source-in", "source-out", "destination-in", "destination-out", "destination-atop"]);
/** Per-pixel shading costs more than a solid fill. A PLACEHOLDER until the
 *  op-kind sweep on rasterbench measures it — stated so nobody mistakes it
 *  for a number. */
const GRADIENT_WEIGHT = 3;
function listInfo(list) {
    const hit = infoCache.get(list);
    if (hit !== undefined)
        return hit;
    const ext = list.extents ?? [];
    let area = 0, fillGrad = false, strokeGrad = false, filtered = false, cullable = true;
    for (let i = 0; i < list.ops.length; i++) {
        const o = list.ops[i];
        switch (o.op) {
            case "fillStyle":
                fillGrad = o.grad !== undefined;
                break;
            case "strokeStyle":
                strokeGrad = o.grad !== undefined;
                break;
            case "set":
                if (o.k === "filter" && o.v !== "none" && o.v !== "")
                    filtered = true;
                else if (o.k === "globalCompositeOperation" && UNCULLABLE.has(String(o.v)))
                    cullable = false;
                break;
            case "fillRect":
            case "fill":
            case "fillText": {
                const e = ext[i];
                if (e)
                    area += e.w * e.h * (fillGrad ? GRADIENT_WEIGHT : 1);
                break;
            }
            case "strokeRect":
            case "stroke":
            case "strokeText": {
                const e = ext[i];
                if (e)
                    area += e.w * e.h * (strokeGrad ? GRADIENT_WEIGHT : 1);
                break;
            }
            case "clearRect": {
                const e = ext[i];
                if (e)
                    area += e.w * e.h;
                break;
            }
        }
    }
    const info = { area: filtered ? Infinity : area, cullable };
    infoCache.set(list, info);
    return info;
}
/** The recording's covered area — see ListInfo.area. Pure over the recording,
 *  so every backend prices the same quantity; each applies its own scale² and
 *  its own threshold. This REPLACES the op-counting classifier: measured under
 *  Chrome tracing (2026-08-24), two lists of identical op count differed 205x
 *  in paint cost by covered area alone, and the op count called both
 *  "expensive". Op count is still a term — a stroke has real per-op setup
 *  cost — but it is the backend's term to weigh, from `list.ops.length`. */
export function replayArea(list) {
    return listInfo(list).area;
}
/** Is this paint op entirely outside `cull`? Ops without an extent (state,
 *  paths, transforms — and a paint op the recorder could not bound) never
 *  skip. `cull` is in the recording's local space, already padded by
 *  `rasterPad` so a bleed from just outside still lands. */
function culled(list, i, cull) {
    if (cull === null)
        return false;
    const e = list.extents?.[i];
    if (!e)
        return false;
    return e.x + e.w < cull.x || e.x > cull.x + cull.w || e.y + e.h < cull.y || e.y > cull.y + cull.h;
}
/** Replay a recording into a real 2D context. `clip`, when given, is the
 *  region (recording-local) the replay can be SEEN in: paint ops entirely
 *  outside it are skipped. BYTE-IDENTICAL where visible — a skipped op painted
 *  nothing inside the clip, and a list using a composite operator that reaches
 *  outside its source is never culled (ListInfo.cullable). This is the cheapest
 *  lever there is against the cost that was measured: what reaches the
 *  compositor is what costs, and an off-screen op reaching it costs the same as
 *  an on-screen one. `__declareNoCull` disables it for an A/B. */
export function replay(ctx, list, clip) {
    const info = listInfo(list);
    let cull = null;
    if (clip !== undefined && info.cullable && globalThis.__declareNoCull !== true) {
        const pad = rasterPad(list);
        cull = pad === 0 ? clip : { x: clip.x - pad, y: clip.y - pad, w: clip.w + 2 * pad, h: clip.h + 2 * pad };
    }
    // WebKit accepts ctx.filter and paints unfiltered (canvas-filter.ts), so a
    // recording that sets one has to be interpreted rather than handed over.
    if (info.area === Infinity && !ctxFilterSupported()) {
        replayFiltered(ctx, list, cull);
        return;
    }
    replayDirect(ctx, list, cull);
}
function replayDirect(ctx, list, cull) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < list.ops.length; i++) {
        const o = list.ops[i];
        if (culled(list, i, cull))
            continue;
        switch (o.op) {
            case "fillStyle":
                ctx.fillStyle = o.grad ? buildGradient(ctx, o.grad) : o.v;
                break;
            case "strokeStyle":
                ctx.strokeStyle = o.grad ? buildGradient(ctx, o.grad) : o.v;
                break;
            case "set":
                ctx[o.k] = o.v;
                break;
            case "setLineDash":
                ctx.setLineDash(o.segments);
                break;
            case "fillRect":
                ctx.fillRect(o.x, o.y, o.w, o.h);
                break;
            case "strokeRect":
                ctx.strokeRect(o.x, o.y, o.w, o.h);
                break;
            case "clearRect":
                ctx.clearRect(o.x, o.y, o.w, o.h);
                break;
            case "beginPath":
                ctx.beginPath();
                break;
            case "moveTo":
                ctx.moveTo(o.x, o.y);
                break;
            case "lineTo":
                ctx.lineTo(o.x, o.y);
                break;
            case "arc":
                ctx.arc(o.x, o.y, o.r, o.a0, o.a1, o.ccw);
                break;
            case "arcTo":
                ctx.arcTo(o.x1, o.y1, o.x2, o.y2, o.r);
                break;
            case "ellipse":
                ctx.ellipse(o.x, o.y, o.rx, o.ry, o.rot, o.a0, o.a1, o.ccw);
                break;
            case "rect":
                ctx.rect(o.x, o.y, o.w, o.h);
                break;
            case "roundRect":
                ctx.roundRect(o.x, o.y, o.w, o.h, o.radii);
                break;
            case "quadraticCurveTo":
                ctx.quadraticCurveTo(o.cpx, o.cpy, o.x, o.y);
                break;
            case "bezierCurveTo":
                ctx.bezierCurveTo(o.cp1x, o.cp1y, o.cp2x, o.cp2y, o.x, o.y);
                break;
            case "closePath":
                ctx.closePath();
                break;
            case "fill":
                o.rule ? ctx.fill(o.rule) : ctx.fill();
                break;
            case "stroke":
                ctx.stroke();
                break;
            case "clip":
                o.rule ? ctx.clip(o.rule) : ctx.clip();
                break;
            case "fillText":
                ctx.fillText(o.text, o.x, o.y, o.maxWidth);
                break;
            case "strokeText":
                ctx.strokeText(o.text, o.x, o.y, o.maxWidth);
                break;
            case "save":
                ctx.save();
                break;
            case "restore":
                ctx.restore();
                break;
            case "translate":
                ctx.translate(o.x, o.y);
                break;
            case "rotate":
                ctx.rotate(o.angle);
                break;
            case "scale":
                ctx.scale(o.x, o.y);
                break;
            case "transform":
                ctx.transform(o.m[0], o.m[1], o.m[2], o.m[3], o.m[4], o.m[5]);
                break;
            case "setTransform":
                ctx.setTransform(o.m[0], o.m[1], o.m[2], o.m[3], o.m[4], o.m[5]);
                break;
            case "resetTransform":
                ctx.resetTransform();
                break;
        }
    }
    ctx.beginPath();
    ctx.restore();
}
/** Replay with `filter` INTERPRETED — for engines that accept the property and
 *  ignore it.
 *
 *  PER OPERATION, not per group. Canvas2D filters each drawing operation's own
 *  source before compositing it, so two adjacent rects under one blur show a
 *  seam where their union would be solid. Measured on Chrome, which is the
 *  conformance reference: seam alpha 191 against a unioned 255. (⚠ The Mac
 *  host's DrawReplay builds a GROUP layer instead — everything under the filter
 *  into one side context — which is a different picture wherever filtered marks
 *  overlap. Noted, not fixed here.)
 *
 *  The mechanism is two contexts in lockstep. Every state, path and transform
 *  op goes to both; a paint op with a filter live is drawn on the SCRATCH,
 *  filtered, and composited back. Three things deliberately do not mirror,
 *  because the spec applies them after the filter rather than to its source:
 *  `globalAlpha`, `globalCompositeOperation`, and `clip`. They stay on the
 *  target, where compositing the filtered result honours them for free. */
function replayFiltered(ctx, list, cull) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const scratch = document.createElement("canvas");
    scratch.width = W;
    scratch.height = H;
    const sx = scratch.getContext("2d");
    if (sx === null) {
        replayDirect(ctx, list, cull);
        return;
    }
    // ⚠ INHERIT THE AMBIENT TRANSFORM. replay() is handed a context the backend
    // has already positioned and scaled (the view's offset, times dpr); the
    // recording's coordinates are relative to THAT, not to the canvas. A scratch
    // starting at identity draws the same marks at 1x in the wrong corner — which
    // is exactly what it did: a 200..600 device-px bar landed at 100..300.
    sx.setTransform(ctx.getTransform());
    let spec = null;
    const saved = []; // `filter` is part of the gstate
    const both = (fn) => { fn(ctx); fn(sx); };
    /** Draw one mark through the filter: onto the scratch at full opacity and
     *  source-over (alpha and blend belong to the composite), filter it, lay it
     *  down under the target's own transform-free identity, then wipe. */
    const filtered = (paint) => {
        sx.save();
        sx.globalAlpha = 1;
        sx.globalCompositeOperation = "source-over";
        paint(sx);
        sx.restore();
        // ⚠ NO TRANSFORM CORRECTION. `ctx.filter` lengths are DEVICE space and are
        // not affected by the CTM — measured on Chrome, a blur(10px) edge ramps over
        // the same 32 device px at scale 1, 2 and 4, and blur.declare's sigma reads
        // 19.7 at dpr 1 and at dpr 2 alike. An earlier version scaled the radius by
        // the transform's magnitude, which was wrong at every dpr and merely
        // CANCELLED at dpr 2 against a pyramid that under-blurred by about the same
        // factor. Two errors agreeing is not a measurement.
        //
        // (Frost is the opposite case and keeps its own scaling: a backdrop blur is
        // stated in VIEW units, and CSS backdrop-filter scales with the element's
        // transform, so paintFrost multiplies by the magnitude on purpose.)
        const out = applyFilterFallback(scratch, spec);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(out, 0, 0);
        ctx.restore();
        sx.save();
        sx.setTransform(1, 0, 0, 1, 0, 0);
        sx.clearRect(0, 0, W, H);
        sx.restore();
    };
    const paint = (fn) => {
        if (spec === null)
            fn(ctx);
        else
            filtered(fn);
    };
    ctx.save();
    ctx.beginPath();
    sx.save();
    sx.beginPath();
    for (let i = 0; i < list.ops.length; i++) {
        const o = list.ops[i];
        if (culled(list, i, cull))
            continue;
        switch (o.op) {
            case "fillStyle":
                both((c) => { c.fillStyle = o.grad ? buildGradient(c, o.grad) : o.v; });
                break;
            case "strokeStyle":
                both((c) => { c.strokeStyle = o.grad ? buildGradient(c, o.grad) : o.v; });
                break;
            case "set":
                if (o.k === "filter") {
                    const css = String(o.v);
                    const f = css === "none" || css === "" ? null : parseFilter(css);
                    spec = f !== null && !isIdentity(f) ? f : null;
                }
                else if (o.k === "globalAlpha" || o.k === "globalCompositeOperation") {
                    ctx[o.k] = o.v; // composite-time, target only
                }
                else {
                    both((c) => { c[o.k] = o.v; });
                }
                break;
            case "setLineDash":
                both((c) => c.setLineDash(o.segments));
                break;
            case "fillRect":
                paint((c) => c.fillRect(o.x, o.y, o.w, o.h));
                break;
            case "strokeRect":
                paint((c) => c.strokeRect(o.x, o.y, o.w, o.h));
                break;
            case "clearRect":
                ctx.clearRect(o.x, o.y, o.w, o.h);
                break; // not a drawing op — never filtered
            case "beginPath":
                both((c) => c.beginPath());
                break;
            case "moveTo":
                both((c) => c.moveTo(o.x, o.y));
                break;
            case "lineTo":
                both((c) => c.lineTo(o.x, o.y));
                break;
            case "arc":
                both((c) => c.arc(o.x, o.y, o.r, o.a0, o.a1, o.ccw));
                break;
            case "arcTo":
                both((c) => c.arcTo(o.x1, o.y1, o.x2, o.y2, o.r));
                break;
            case "ellipse":
                both((c) => c.ellipse(o.x, o.y, o.rx, o.ry, o.rot, o.a0, o.a1, o.ccw));
                break;
            case "rect":
                both((c) => c.rect(o.x, o.y, o.w, o.h));
                break;
            case "roundRect":
                both((c) => c.roundRect(o.x, o.y, o.w, o.h, o.radii));
                break;
            case "quadraticCurveTo":
                both((c) => c.quadraticCurveTo(o.cpx, o.cpy, o.x, o.y));
                break;
            case "bezierCurveTo":
                both((c) => c.bezierCurveTo(o.cp1x, o.cp1y, o.cp2x, o.cp2y, o.x, o.y));
                break;
            case "closePath":
                both((c) => c.closePath());
                break;
            case "fill":
                paint((c) => (o.rule ? c.fill(o.rule) : c.fill()));
                break;
            case "stroke":
                paint((c) => c.stroke());
                break;
            case "clip":
                o.rule ? ctx.clip(o.rule) : ctx.clip();
                break; // applies AFTER the filter
            case "fillText":
                paint((c) => c.fillText(o.text, o.x, o.y, o.maxWidth));
                break;
            case "strokeText":
                paint((c) => c.strokeText(o.text, o.x, o.y, o.maxWidth));
                break;
            case "save":
                saved.push(spec);
                both((c) => c.save());
                break;
            case "restore":
                spec = saved.length ? saved.pop() : null;
                both((c) => c.restore());
                break;
            case "translate":
                both((c) => c.translate(o.x, o.y));
                break;
            case "rotate":
                both((c) => c.rotate(o.angle));
                break;
            case "scale":
                both((c) => c.scale(o.x, o.y));
                break;
            case "transform":
                both((c) => c.transform(o.m[0], o.m[1], o.m[2], o.m[3], o.m[4], o.m[5]));
                break;
            case "setTransform":
                both((c) => c.setTransform(o.m[0], o.m[1], o.m[2], o.m[3], o.m[4], o.m[5]));
                break;
            case "resetTransform":
                both((c) => c.resetTransform());
                break;
        }
    }
    ctx.beginPath();
    ctx.restore();
}
//# sourceMappingURL=draw.js.map