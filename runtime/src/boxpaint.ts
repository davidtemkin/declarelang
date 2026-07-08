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
//     corner pixel — the styling rung's measurement). That is the ruled
//     fallback landing: CSS as a paint primitive only while it proves
//     pixel-stable, per-view rasterization where it does not.
//
// Semantics (mirroring CSS's, which the DOM backend's stable cases share):
// the drop shadow is cast by the border box and never painted beneath it (a
// translucent box does not show its own shadow through itself); the border
// paints INSIDE the box (never layout); the corner radius shapes the PAINT
// only — children are not clipped (the recorded lean). A plain solid box
// stays the single-fillRect fast path.

import { colorToCss, type Gradient, type Shadow, type Stroke } from "./value.js";

/** The box's retained paint state — the shape both surfaces keep. The solid
 *  fill is pre-resolved to a canvas fillStyle at set time (the R1 fast
 *  path); a gradient stays data (its geometry depends on the box). */
export interface BoxState {
  width: number;
  height: number;
  fill: string | null;
  gradient: Gradient | null;
  cornerRadius: number;
  stroke: Stroke | null;
  shadow: Shadow | null;
}

/** Paint `b` into `ctx` at the current transform's origin. `box` is the
 *  caller's cached Path2D for the box shape (invalidated on geometry/radius
 *  change); the possibly-rebuilt path is returned for re-caching. */
export function paintBox(
  ctx: CanvasRenderingContext2D,
  b: BoxState,
  box: Path2D | null
): Path2D | null {
  const w = b.width;
  const h = b.height;
  if (w <= 0 || h <= 0) return box;
  const r = b.cornerRadius;
  const st = b.stroke;
  const sh = b.shadow;
  if (r <= 0 && st === null && sh === null && b.gradient === null) {
    if (b.fill !== null) {
      ctx.fillStyle = b.fill;
      ctx.fillRect(0, 0, w, h);
    }
    return box;
  }
  if (box === null) {
    box = new Path2D();
    if (r > 0) box.roundRect(0, 0, w, h, r);
    else box.rect(0, 0, w, h);
  }
  if (sh !== null) paintBoxShadow(ctx, box, sh);
  if (b.gradient !== null) {
    ctx.fillStyle = realizeGradient(ctx, b.gradient, w, h);
    ctx.fill(box);
  } else if (b.fill !== null) {
    ctx.fillStyle = b.fill;
    ctx.fill(box);
  }
  if (st !== null && st.width > 0) {
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

/** The drop shadow, CSS box-shadow semantics: cast by the border box, never
 *  painted inside it. Canvas shadow state is DEVICE-space (untransformed),
 *  so offsets scale by the walk's transform; the shape itself is drawn far
 *  off-canvas with a compensating offset so only its shadow lands. */
function paintBoxShadow(ctx: CanvasRenderingContext2D, box: Path2D, sh: Shadow): void {
  const K = 1e5;
  const m = ctx.getTransform();
  ctx.save();
  // Clip to the COMPLEMENT of the box (evenodd over an enclosing rect).
  const outside = new Path2D();
  outside.rect(-K, -K, 2 * K, 2 * K);
  outside.addPath(box);
  ctx.clip(outside, "evenodd");
  ctx.shadowColor = colorToCss(sh.color);
  ctx.shadowOffsetX = (sh.dx + K) * m.a;
  ctx.shadowOffsetY = sh.dy * m.d;
  ctx.shadowBlur = sh.blur * m.a;
  ctx.translate(-K, 0);
  ctx.fillStyle = "#000";
  ctx.fill(box);
  ctx.restore();
}

/** A Gradient realized against a box, per CSS `linear-gradient` geometry:
 *  the angle is compass-style (0 up, clockwise), the line is centered and
 *  sized so the first/last stops touch the box's corners, and unplaced stops
 *  space evenly between their placed neighbors (first 0, last 1), offsets
 *  monotonic. */
export function realizeGradient(
  ctx: CanvasRenderingContext2D,
  g: Gradient,
  w: number,
  h: number
): CanvasGradient {
  const rad = (g.angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = w / 2;
  const cy = h / 2;
  const grad = ctx.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
  const offs = resolveStopOffsets(g);
  g.stops.forEach((s, i) => grad.addColorStop(offs[i], colorToCss(s.color)));
  return grad;
}

function resolveStopOffsets(g: Gradient): number[] {
  const n = g.stops.length;
  const offs: (number | null)[] = g.stops.map((s) => s.offset);
  if (offs[0] === null) offs[0] = 0;
  if (offs[n - 1] === null) offs[n - 1] = 1;
  for (let i = 1; i < n - 1; i++) {
    if (offs[i] !== null) continue;
    let j = i + 1;
    while (offs[j] === null) j++;
    const from = offs[i - 1]!;
    const to = offs[j]!;
    for (let k = i; k < j; k++) offs[k] = from + ((to - from) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  // CSS: a stop before its predecessor clamps up to it; canvas requires 0…1.
  let prev = 0;
  return offs.map((o) => (prev = Math.min(1, Math.max(prev, o!))));
}

/** The conservative pixel bounds of the box paint — the box plus its
 *  shadow's reach (offset + blur) — what sizes the DOM backend's per-view
 *  raster (the drawing-bounds discipline, applied to decoration). */
export function boxBounds(b: BoxState): { x: number; y: number; w: number; h: number } {
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
