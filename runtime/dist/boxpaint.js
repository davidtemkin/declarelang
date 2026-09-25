// The box paint — the one drawing of "a colored box with corner radius and
// an optional border and drop shadow" (the ruled box ontology), shared by
// BOTH backends so they cannot drift:
//
//   - the Canvas backend composites it straight into the shared canvas
//     (CanvasSurface.paintContent);
//   - the DOM backend brushes CSS paint primitives for every case MEASURED
//     pixel-stable against this code (flat and square: background,
//     linear-gradient, the inset ring, box-shadow — blurred and translucent
//     included), and rasterizes THIS SAME code into a per-view canvas the
//     moment `cornerRadius > 0`, where Chrome's border-radius corner AA
//     measurably diverges from path AA (up to ~80/255 per channel at a
//     corner pixel). That is the ruled
//     fallback landing: CSS as a paint primitive only while it proves
//     pixel-stable, per-view rasterization where it does not.
//
// Semantics (mirroring CSS's, which the DOM backend's stable cases share):
// the drop shadow is cast by the border box and never painted beneath it (a
// translucent box does not show its own shadow through itself); the border
// paints INSIDE the box (never layout); the corner radius shapes the PAINT
// only — children are not clipped (the recorded lean). A plain solid box
// stays the single-fillRect fast path.
import { colorToCss, colorWithAlpha, radiusFit, radiusIsSquare, strokeUniform } from "./value.js";
import { paintSides } from "./stroke-sides.js";
/** Paint `b` into `ctx` at the current transform's origin. `box` is the
 *  caller's cached Path2D for the box shape (invalidated on geometry/radius
 *  change); the possibly-rebuilt path is returned for re-caching. */
export function paintBox(ctx, b, box) {
    const w = b.width;
    const h = b.height;
    if (w <= 0 || h <= 0)
        return box;
    const r = b.cornerRadius;
    // One stroke on all four sides (the overwhelmingly common case) keeps the
    // single-ring path below; `undefined` means the sides genuinely differ and
    // the per-side painter runs instead.
    const st = strokeUniform(b.stroke);
    // NB: the drop shadow is NOT painted here — it is cast OUTSIDE the box and
    // must escape the view's own clip (as a CSS box-shadow escapes the element's
    // overflow:hidden), so the caller paints it BEFORE clipping (paintBoxShadow).
    if (radiusIsSquare(r) && st === null && b.gradient === null) {
        if (b.fill !== null) {
            ctx.fillStyle = b.fill;
            ctx.fillRect(0, 0, w, h);
        }
        return box;
    }
    if (box === null) {
        box = boxShape(w, h, r);
    }
    if (b.gradient !== null) {
        ctx.fillStyle = realizeGradient(ctx, b.gradient, w, h);
        ctx.fill(box);
    }
    else if (b.fill !== null) {
        ctx.fillStyle = b.fill;
        ctx.fill(box);
    }
    if (st === undefined) {
        paintSides(ctx, box, b.stroke, w, h);
    }
    else if (st !== null && st.width > 0) {
        // An inside border: stroke the box path at double width, clipped to
        // the box — the inner half remains, following the rounded corners
        // exactly (the offset curve of a rounded rect).
        ctx.save();
        ctx.clip(box);
        ctx.strokeStyle = colorToCss(st.color);
        ctx.lineWidth = st.width * 2;
        ctx.stroke(box);
        ctx.restore();
    }
    return box;
}
/** The box shape as a Path2D — a rounded rect or a plain rect. Shared by the
 *  fill/border paint and the drop-shadow paint so both trace the same outline.
 *  The corners are fitted to the box first (radiusFit — CSS's overlap rule), so
 *  a per-corner list and a uniform radius go through one path builder. */
export function boxShape(w, h, r) {
    const p = new Path2D();
    if (radiusIsSquare(r))
        p.rect(0, 0, w, h);
    else
        p.roundRect(0, 0, w, h, radiusFit(r, w, h));
    return p;
}
/** The drop shadow, CSS box-shadow semantics: cast by the border box, never
 *  painted inside it. Painted by the caller BEFORE the view's own clip, so it
 *  escapes overflow the way a CSS box-shadow does. Canvas shadow state is
 *  DEVICE-space (untransformed), so offsets scale by the walk's transform; the
 *  shape itself is drawn far off-canvas with a compensating offset so only its
 *  shadow lands. */
export function paintBoxShadow(ctx, box, sh) {
    const m = ctx.getTransform();
    ctx.save();
    // Clip to the COMPLEMENT of the box (evenodd over an enclosing rect), then
    // fill the box black IN PLACE: the black fill is entirely inside the box and
    // the clip removes it, so only the drop shadow — which extends OUTSIDE the
    // box — survives. This is CSS's outset box-shadow (painted behind the box,
    // clipped to outside it), and it needs no trick.
    //
    // ⚠ It used to. The shape was filled 1e5 px off-canvas and only its shadow
    // brought back by a compensating x-offset — but the y-offset was NOT
    // compensated, so under any ROTATION (m.b ≠ 0) the shadow's source landed
    // 1e5·m.b px off-canvas vertically and the shadow vanished. Measured on
    // test/probe/boxshadow.declare: a rotated card lost its shadow on Chrome and
    // Firefox alike (Firefox showed it most, since the desktop's tilt egg leaves
    // windows rotated). In place, there is nothing off-canvas to lose.
    const K = 1e5;
    const outside = new Path2D();
    outside.rect(-K, -K, 2 * K, 2 * K);
    outside.addPath(box);
    ctx.clip(outside, "evenodd");
    ctx.shadowColor = colorToCss(sh.color);
    // canvas shadow offset/blur are DEVICE space; map the LOCAL offset through the
    // transform's linear part so the shadow rotates and scales WITH the box (CSS
    // box-shadow does), and take the scale MAGNITUDE for the blur so a rotation
    // does not shrink it (m.a alone is s·cosθ).
    ctx.shadowOffsetX = sh.dx * m.a + sh.dy * m.c;
    ctx.shadowOffsetY = sh.dx * m.b + sh.dy * m.d;
    ctx.shadowBlur = sh.blur * Math.hypot(m.a, m.b);
    ctx.fillStyle = "#000";
    ctx.fill(box);
    ctx.restore();
}
/** A Gradient realized against a box, per CSS `linear-gradient` geometry:
 *  the angle is compass-style (0 up, clockwise), the line is centered and
 *  sized so the first/last stops touch the box's corners, and unplaced stops
 *  space evenly between their placed neighbors (first 0, last 1), offsets
 *  monotonic. */
export function realizeGradient(ctx, g, w, h) {
    let grad;
    if (g.kind === "radial") {
        // CSS `circle farthest-corner at cx cy`, the ramp reaching r of that distance
        const px = (g.cx ?? 0.5) * w, py = (g.cy ?? 0.5) * h;
        const far = Math.hypot(Math.max(px, w - px), Math.max(py, h - py));
        grad = ctx.createRadialGradient(px, py, 0, px, py, Math.max(0.001, far * (g.r ?? 1)));
    }
    else if (g.kind === "conic") {
        // CSS `from Adeg` starts at 12 o'clock; canvas 0 is 3 o'clock
        grad = ctx.createConicGradient(((g.angle - 90) * Math.PI) / 180, (g.cx ?? 0.5) * w, (g.cy ?? 0.5) * h);
    }
    else {
        const rad = (g.angle * Math.PI) / 180;
        const dx = Math.sin(rad);
        const dy = -Math.cos(rad);
        const len = Math.abs(w * dx) + Math.abs(h * dy);
        const cx = w / 2;
        const cy = h / 2;
        grad = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
    }
    const offs = resolveStopOffsets(g);
    g.stops.forEach((s, i) => grad.addColorStop(offs[i], colorToCss(s.color)));
    return grad;
}
function resolveStopOffsets(g) {
    const n = g.stops.length;
    const offs = g.stops.map((s) => s.offset);
    if (offs[0] === null)
        offs[0] = 0;
    if (offs[n - 1] === null)
        offs[n - 1] = 1;
    for (let i = 1; i < n - 1; i++) {
        if (offs[i] !== null)
            continue;
        let j = i + 1;
        while (offs[j] === null)
            j++;
        const from = offs[i - 1];
        const to = offs[j];
        for (let k = i; k < j; k++)
            offs[k] = from + ((to - from) * (k - i + 1)) / (j - i + 1);
        i = j;
    }
    // CSS: a stop before its predecessor clamps up to it; canvas requires 0…1.
    let prev = 0;
    return offs.map((o) => (prev = Math.min(1, Math.max(prev, o))));
}
/** The part of a gradient laid over `whole` that falls on `part` (both boxes in
 *  one coordinate space), as a gradient of `part`'s own — so a run of text split
 *  into several painted pieces shows ONE ramp across all of them, as the DOM's
 *  span does, instead of the whole ramp again on every piece. Linear: each stop
 *  re-projected onto the piece's own gradient line, clipped to 0…1 with the
 *  colour interpolated at the cut. Radial and conic: the centre moved into the
 *  piece's box, and the radial reach rescaled to its farthest corner. */
export function sliceGradient(g, whole, part) {
    if (part.w <= 0 || part.h <= 0)
        return g;
    const px = (g.cx ?? 0.5) * whole.w + whole.x - part.x;
    const py = (g.cy ?? 0.5) * whole.h + whole.y - part.y;
    if (g.kind === "conic")
        return { ...g, cx: px / part.w, cy: py / part.h };
    if (g.kind === "radial") {
        const far = (w, h, x, y) => Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
        const reach = far(whole.w, whole.h, (g.cx ?? 0.5) * whole.w, (g.cy ?? 0.5) * whole.h) * (g.r ?? 1);
        return { ...g, cx: px / part.w, cy: py / part.h, r: reach / Math.max(0.001, far(part.w, part.h, px, py)) };
    }
    const rad = (g.angle * Math.PI) / 180;
    const dx = Math.sin(rad), dy = -Math.cos(rad);
    const L = Math.abs(whole.w * dx) + Math.abs(whole.h * dy);
    const Lp = Math.abs(part.w * dx) + Math.abs(part.h * dy);
    if (L <= 0 || Lp <= 0)
        return g;
    const shift = (part.x + part.w / 2 - whole.x - whole.w / 2) * dx + (part.y + part.h / 2 - whole.y - whole.h / 2) * dy;
    const offs = resolveStopOffsets(g);
    const at = offs.map((t, i) => ({ t: ((t - 0.5) * L - shift) / Lp + 0.5, c: g.stops[i].color }));
    const colorAt = (t) => {
        if (t <= at[0].t)
            return at[0].c;
        for (let i = 1; i < at.length; i++) {
            if (t <= at[i].t) {
                const span = at[i].t - at[i - 1].t;
                return mixColor(at[i - 1].c, at[i].c, span <= 0 ? 1 : (t - at[i - 1].t) / span);
            }
        }
        return at[at.length - 1].c;
    };
    const stops = [{ offset: 0, color: colorAt(0) }, ...at.filter((s) => s.t > 0 && s.t < 1).map((s) => ({ offset: s.t, color: s.c })), { offset: 1, color: colorAt(1) }];
    return { ...g, stops };
}
/** Two colours mixed channel by channel, alpha included; null reads as clear. */
function mixColor(a, b, k) {
    const parts = (c) => {
        if (c === null)
            return [0, 0, 0, 0];
        const alpha = c >= 0x100000000;
        const v = alpha ? c - 0x100000000 : c;
        const rgb = alpha ? Math.floor(v / 0x100) : v;
        return [(rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff, alpha ? v % 0x100 : 0xff];
    };
    const [p, q] = [parts(a), parts(b)];
    const m = p.map((x, i) => Math.round(x + (q[i] - x) * k));
    return colorWithAlpha((m[0] << 16) | (m[1] << 8) | m[2], m[3]);
}
/** The conservative pixel bounds of the box paint — the box plus its
 *  shadow's reach (offset + blur) — what sizes the DOM backend's per-view
 *  raster (the drawing-bounds discipline, applied to decoration). */
export function boxBounds(b) {
    let x0 = 0;
    let y0 = 0;
    let x1 = b.width;
    let y1 = b.height;
    const sh = b.shadow;
    if (sh !== null) {
        x0 = Math.min(x0, sh.dx - sh.blur);
        y0 = Math.min(y0, sh.dy - sh.blur);
        x1 = Math.max(x1, b.width + sh.dx + sh.blur);
        y1 = Math.max(y1, b.height + sh.dy + sh.blur);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
//# sourceMappingURL=boxpaint.js.map