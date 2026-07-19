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
// The op vocabulary is a Canvas2D-shaped subset sized to its consumers
// (grown with them, not gold-plated ahead of them).
import { DeclareError } from "./errors.js";
import { colorToCss } from "./value.js";
/** A style value may be a CSS string or a Declare `Color` (a number) — draw() is
 *  first-class with the language's Color type, so `d.fillStyle = #BCC4E2`
 *  reads like the `fill` attribute, not `"#bcc4e2"`. Strings still pass
 *  through, so the Canvas2D shape is intact. */
const cssOf = (v) => (typeof v === "string" ? v : colorToCss(v));
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
    set fillStyle(v) { this.ops.push({ op: "fillStyle", v: cssOf(v) }); }
    get fillStyle() { return this.readOnly("fillStyle"); }
    set strokeStyle(v) { this.ops.push({ op: "strokeStyle", v: cssOf(v) }); }
    get strokeStyle() { return this.readOnly("strokeStyle"); }
    set lineWidth(v) {
        this.strokeHalf = v / 2;
        this.ops.push({ op: "lineWidth", v });
    }
    get lineWidth() { return this.readOnly("lineWidth"); }
    set lineCap(v) { this.ops.push({ op: "lineCap", v: v }); }
    get lineCap() { return this.readOnly("lineCap"); }
    fillRect(x, y, w, h) {
        this.ops.push({ op: "fillRect", x, y, w, h });
        this.mark(x, y, x + w, y + h);
    }
    beginPath() {
        this.ops.push({ op: "beginPath" });
        this.path = null;
    }
    moveTo(x, y) {
        this.ops.push({ op: "moveTo", x, y });
        this.extend(x, y, x, y);
    }
    lineTo(x, y) {
        this.ops.push({ op: "lineTo", x, y });
        this.extend(x, y, x, y);
    }
    /** Bounds take the full circle's box — conservative for partial arcs,
     *  exact for full ones, and no trigonometry in the recorder. */
    arc(x, y, r, a0, a1, ccw = false) {
        this.ops.push({ op: "arc", x, y, r, a0, a1, ccw });
        this.extend(x - r, y - r, x + r, y + r);
    }
    rect(x, y, w, h) {
        this.ops.push({ op: "rect", x, y, w, h });
        this.extend(x, y, x + w, y + h);
    }
    closePath() { this.ops.push({ op: "closePath" }); }
    fill() {
        this.ops.push({ op: "fill" });
        if (this.path)
            this.mark(this.path.x, this.path.y, this.path.x + this.path.w, this.path.y + this.path.h);
    }
    /** Stroke ink extends half the line width beyond the path box. (A sharp
     *  miter join can poke further; the recorder doesn't expose lineJoin yet,
     *  and bounds stay advisory until dirty-region culling consumes them — the
     *  rung that lands culling owns tightening this.) */
    stroke() {
        this.ops.push({ op: "stroke" });
        if (this.path) {
            const e = this.strokeHalf;
            this.mark(this.path.x - e, this.path.y - e, this.path.x + this.path.w + e, this.path.y + this.path.h + e);
        }
    }
    /** The finished recording. Called by record(); a Draw is single-use. */
    list() {
        return { ops: this.ops, bounds: this.ink };
    }
    readOnly(what) {
        throw new DeclareError(`the draw context is write-only — ${what} cannot be read back; inputs come in through attributes (rendering model)`);
    }
    extend(x0, y0, x1, y1) {
        this.path = union(this.path, x0, y0, x1, y1);
    }
    mark(x0, y0, x1, y1) {
        this.ink = union(this.ink, x0, y0, x1, y1);
    }
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
                ctx.fillStyle = o.v;
                break;
            case "strokeStyle":
                ctx.strokeStyle = o.v;
                break;
            case "lineWidth":
                ctx.lineWidth = o.v;
                break;
            case "lineCap":
                ctx.lineCap = o.v;
                break;
            case "fillRect":
                ctx.fillRect(o.x, o.y, o.w, o.h);
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
            case "rect":
                ctx.rect(o.x, o.y, o.w, o.h);
                break;
            case "closePath":
                ctx.closePath();
                break;
            case "fill":
                ctx.fill();
                break;
            case "stroke":
                ctx.stroke();
                break;
        }
    }
    ctx.beginPath();
    ctx.restore();
}
//# sourceMappingURL=draw.js.map