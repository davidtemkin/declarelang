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
        this.ops.push(isGradient(v) ? { op: "fillStyle", grad: v.rec } : { op: "fillStyle", v: cssOf(v) });
    }
    get fillStyle() { return this.readOnly("fillStyle"); }
    set strokeStyle(v) {
        this.ops.push(isGradient(v) ? { op: "strokeStyle", grad: v.rec } : { op: "strokeStyle", v: cssOf(v) });
    }
    get strokeStyle() { return this.readOnly("strokeStyle"); }
    set lineWidth(v) { this.strokeHalf = v / 2; this.ops.push({ op: "set", k: "lineWidth", v }); }
    get lineWidth() { return this.readOnly("lineWidth"); }
    set lineCap(v) { this.ops.push({ op: "set", k: "lineCap", v }); }
    get lineCap() { return this.readOnly("lineCap"); }
    set lineJoin(v) { this.ops.push({ op: "set", k: "lineJoin", v }); }
    get lineJoin() { return this.readOnly("lineJoin"); }
    set miterLimit(v) { this.ops.push({ op: "set", k: "miterLimit", v }); }
    get miterLimit() { return this.readOnly("miterLimit"); }
    set lineDashOffset(v) { this.ops.push({ op: "set", k: "lineDashOffset", v }); }
    get lineDashOffset() { return this.readOnly("lineDashOffset"); }
    setLineDash(segments) { this.ops.push({ op: "setLineDash", segments: segments.slice() }); }
    set globalAlpha(v) { this.ops.push({ op: "set", k: "globalAlpha", v }); }
    get globalAlpha() { return this.readOnly("globalAlpha"); }
    set globalCompositeOperation(v) { this.ops.push({ op: "set", k: "globalCompositeOperation", v }); }
    get globalCompositeOperation() { return this.readOnly("globalCompositeOperation"); }
    // shadow/blur: the extent grows unpredictably past the shape, so bounds go loose
    set shadowBlur(v) { this.exactBounds = false; this.ops.push({ op: "set", k: "shadowBlur", v }); }
    get shadowBlur() { return this.readOnly("shadowBlur"); }
    set shadowColor(v) { this.ops.push({ op: "set", k: "shadowColor", v: cssOf(v) }); }
    get shadowColor() { return this.readOnly("shadowColor"); }
    set shadowOffsetX(v) { this.exactBounds = false; this.ops.push({ op: "set", k: "shadowOffsetX", v }); }
    get shadowOffsetX() { return this.readOnly("shadowOffsetX"); }
    set shadowOffsetY(v) { this.exactBounds = false; this.ops.push({ op: "set", k: "shadowOffsetY", v }); }
    get shadowOffsetY() { return this.readOnly("shadowOffsetY"); }
    set filter(v) { this.exactBounds = false; this.ops.push({ op: "set", k: "filter", v }); }
    get filter() { return this.readOnly("filter"); }
    set imageSmoothingEnabled(v) { this.ops.push({ op: "set", k: "imageSmoothingEnabled", v }); }
    get imageSmoothingEnabled() { return this.readOnly("imageSmoothingEnabled"); }
    set imageSmoothingQuality(v) { this.ops.push({ op: "set", k: "imageSmoothingQuality", v }); }
    get imageSmoothingQuality() { return this.readOnly("imageSmoothingQuality"); }
    // text state
    set font(v) { this.ops.push({ op: "set", k: "font", v }); }
    get font() { return this.readOnly("font"); }
    set textAlign(v) { this.ops.push({ op: "set", k: "textAlign", v }); }
    get textAlign() { return this.readOnly("textAlign"); }
    set textBaseline(v) { this.ops.push({ op: "set", k: "textBaseline", v }); }
    get textBaseline() { return this.readOnly("textBaseline"); }
    set direction(v) { this.ops.push({ op: "set", k: "direction", v }); }
    get direction() { return this.readOnly("direction"); }
    set letterSpacing(v) { this.ops.push({ op: "set", k: "letterSpacing", v }); }
    get letterSpacing() { return this.readOnly("letterSpacing"); }
    set wordSpacing(v) { this.ops.push({ op: "set", k: "wordSpacing", v }); }
    get wordSpacing() { return this.readOnly("wordSpacing"); }
    set fontKerning(v) { this.ops.push({ op: "set", k: "fontKerning", v }); }
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
        this.ops.push({ op: "fillRect", x, y, w, h });
        this.mark(x, y, x + w, y + h);
    }
    strokeRect(x, y, w, h) {
        this.ops.push({ op: "strokeRect", x, y, w, h });
        const e = this.strokeHalf;
        this.mark(x - e, y - e, x + w + e, y + h + e);
    }
    clearRect(x, y, w, h) {
        this.ops.push({ op: "clearRect", x, y, w, h });
        this.mark(x, y, x + w, y + h);
    }
    // ── path building ──
    beginPath() { this.ops.push({ op: "beginPath" }); this.path = null; }
    moveTo(x, y) { this.ops.push({ op: "moveTo", x, y }); this.extend(x, y, x, y); }
    lineTo(x, y) { this.ops.push({ op: "lineTo", x, y }); this.extend(x, y, x, y); }
    /** Bounds take the full circle's box — conservative for partial arcs,
     *  exact for full ones, and no trigonometry in the recorder. */
    arc(x, y, r, a0, a1, ccw = false) {
        this.ops.push({ op: "arc", x, y, r, a0, a1, ccw });
        this.extend(x - r, y - r, x + r, y + r);
    }
    /** The tangent arc's box is bounded by its two guide points (conservative:
     *  the curve stays within their span plus the corner it rounds). */
    arcTo(x1, y1, x2, y2, r) {
        this.ops.push({ op: "arcTo", x1, y1, x2, y2, r });
        this.extend(x1, y1, x1, y1);
        this.extend(x2, y2, x2, y2);
    }
    ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
        this.ops.push({ op: "ellipse", x, y, rx, ry, rot, a0, a1, ccw });
        // conservative: the rotated ellipse fits in a circle of its larger radius
        const r = Math.max(Math.abs(rx), Math.abs(ry));
        this.extend(x - r, y - r, x + r, y + r);
    }
    rect(x, y, w, h) {
        this.ops.push({ op: "rect", x, y, w, h });
        this.extend(x, y, x + w, y + h);
    }
    roundRect(x, y, w, h, radii = 0) {
        this.ops.push({ op: "roundRect", x, y, w, h, radii: Array.isArray(radii) ? radii.slice() : radii });
        this.extend(x, y, x + w, y + h);
    }
    quadraticCurveTo(cpx, cpy, x, y) {
        this.ops.push({ op: "quadraticCurveTo", cpx, cpy, x, y });
        this.extend(cpx, cpy, cpx, cpy);
        this.extend(x, y, x, y);
    }
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
        this.ops.push({ op: "bezierCurveTo", cp1x, cp1y, cp2x, cp2y, x, y });
        this.extend(cp1x, cp1y, cp1x, cp1y);
        this.extend(cp2x, cp2y, cp2x, cp2y);
        this.extend(x, y, x, y);
    }
    closePath() { this.ops.push({ op: "closePath" }); }
    // ── paint ──
    fill(rule) {
        this.ops.push({ op: "fill", rule });
        if (this.path)
            this.mark(this.path.x, this.path.y, this.path.x + this.path.w, this.path.y + this.path.h);
    }
    /** Stroke ink extends half the line width beyond the path box. (A sharp
     *  miter join can poke further; bounds stay advisory until dirty-region
     *  culling consumes them — the rung that lands culling owns tightening.) */
    stroke() {
        this.ops.push({ op: "stroke" });
        if (this.path) {
            const e = this.strokeHalf;
            this.mark(this.path.x - e, this.path.y - e, this.path.x + this.path.w + e, this.path.y + this.path.h + e);
        }
    }
    /** Clip narrows subsequent painting to the current path — no ink of its own,
     *  scoped by save/restore. */
    clip(rule) { this.ops.push({ op: "clip", rule }); }
    // Text: the run's width/height need font metrics the recorder can't measure,
    // so bounds go loose (the anchor point is recorded for a floor).
    fillText(text, x, y, maxWidth) {
        this.ops.push({ op: "fillText", text: String(text), x, y, maxWidth });
        this.exactBounds = false;
        this.mark(x, y, x, y);
    }
    strokeText(text, x, y, maxWidth) {
        this.ops.push({ op: "strokeText", text: String(text), x, y, maxWidth });
        this.exactBounds = false;
        this.mark(x, y, x, y);
    }
    // ── state + transform ──
    // The recorder tracks the transform matrix, so bounds stay EXACT under any
    // affine transform (the mapped corners give the local-space extent); only
    // blur/filter/text leave bounds inexact.
    save() { this.ctmStack.push([...this.ctm]); this.ops.push({ op: "save" }); }
    restore() { const m = this.ctmStack.pop(); if (m)
        this.ctm = m; this.ops.push({ op: "restore" }); }
    translate(x, y) {
        const [a, b, c, d, e, f] = this.ctm;
        this.ctm = [a, b, c, d, a * x + c * y + e, b * x + d * y + f];
        this.ops.push({ op: "translate", x, y });
    }
    rotate(angle) {
        const s = Math.sin(angle), co = Math.cos(angle);
        this.ctm = matMul(this.ctm, [co, s, -s, co, 0, 0]);
        this.ops.push({ op: "rotate", angle });
    }
    scale(x, y) {
        const [a, b, c, d, e, f] = this.ctm;
        this.ctm = [a * x, b * x, c * y, d * y, e, f];
        this.ops.push({ op: "scale", x, y });
    }
    transform(a, b, c, d, e, f) {
        this.ctm = matMul(this.ctm, [a, b, c, d, e, f]);
        this.ops.push({ op: "transform", m: [a, b, c, d, e, f] });
    }
    setTransform(a, b, c, d, e, f) {
        this.ctm = [a, b, c, d, e, f];
        this.ops.push({ op: "setTransform", m: [a, b, c, d, e, f] });
    }
    resetTransform() { this.ctm = [1, 0, 0, 1, 0, 0]; this.ops.push({ op: "resetTransform" }); }
    /** The finished recording. Called by record(); a Draw is single-use. */
    list() {
        return { ops: this.ops, bounds: this.ink, exact: this.exactBounds };
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
        if (a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0) {
            this.ink = union(this.ink, x0, y0, x1, y1);
            return;
        }
        const xa = a * x0 + c * y0 + e, xb = a * x1 + c * y0 + e, xc = a * x0 + c * y1 + e, xd = a * x1 + c * y1 + e;
        const ya = b * x0 + d * y0 + f, yb = b * x1 + d * y0 + f, yc = b * x0 + d * y1 + f, yd = b * x1 + d * y1 + f;
        this.ink = union(this.ink, Math.min(xa, xb, xc, xd), Math.min(ya, yb, yc, yd), Math.max(xa, xb, xc, xd), Math.max(ya, yb, yc, yd));
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
export function record(fn) {
    const d = new Draw();
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
export function replay(ctx, list) {
    ctx.save();
    ctx.beginPath();
    for (const o of list.ops) {
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
//# sourceMappingURL=draw.js.map