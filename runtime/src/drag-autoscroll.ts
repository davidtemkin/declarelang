// drag-autoscroll — a drag near a scroller's edge scrolls it.
//
// The platforms do this for every drag (the browser for native drag and drop,
// AppKit's autoscroll, UIKit's collection views); written by hand it takes a
// per-frame clock, a speed curve, clamping and — the part that goes wrong — the
// moves a still pointer never sends. So the runtime does it: while a view that
// answers `onPointerMove` is being dragged and the pointer rests in the edge
// band of a scroller it sits in, that scroller scrolls, faster the deeper the
// pointer is into the band, and the drag hears `onPointerMove` again every
// frame at the same root point — its local coordinates follow the content, so
// the dragged thing and a `viewAt` drop test keep up with no code of their own.
// It stops when the pointer leaves the band, the range ends, or the press ends.
// The scroll is the program's motion, not the user's scroll: `scrolling` stays
// false, and the anchor never holds the dragged view still (scroll-anchor.ts).

import { View } from "./view.js";

const BAND = 48;          // px from a scroller's edge where scrolling begins
const MAX_STEP = 20;      // px per frame at the very edge (and beyond it)

interface Drag {
  view: View;
  x: number; y: number;                         // the root point, as last delivered
  extra: Record<string, unknown> | undefined;
  redeliver: (x: number, y: number, extra: Record<string, unknown> | undefined) => void;
  frame: number | null;
}

let drag: Drag | null = null;

/** The view being dragged right now, if any (the anchor skips it). */
export function draggingView(): View | null { return drag?.view ?? null; }

function scrollerOf(v: View): View | null {
  for (let n: unknown = v.parent; n instanceof View; n = n.parent) if (n.scrolls !== "none") return n;
  return null;
}

/** How far into an edge band `p` is, signed: negative toward the start. */
function depth(p: number, lo: number, hi: number): number {
  const band = Math.min(BAND, (hi - lo) / 4);
  if (p < lo + band) return -(lo + band - p) / band;
  if (p > hi - band) return (p - (hi - band)) / band;
  return 0;
}

const raf = (cb: () => void): number => {
  const r = (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame;
  return typeof r === "function" ? r(cb) : (setTimeout(cb, 16) as unknown as number);
};
const caf = (id: number): void => {
  const c = (globalThis as { cancelAnimationFrame?: (id: number) => void }).cancelAnimationFrame;
  if (typeof c === "function") c(id); else clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
};

function step(): void {
  const d = drag;
  if (d === null) return;
  d.frame = null;
  const s = scrollerOf(d.view);
  if (s === null || d.view.parent === null) return;
  const b = s.rootBounds();
  const vy = s.scrolls === "y" || s.scrolls === "both" ? depth(d.y, b.y, b.y + b.height) : 0;
  const vx = s.scrolls === "x" || s.scrolls === "both" ? depth(d.x, b.x, b.x + b.width) : 0;
  if (vy === 0 && vx === 0) return;
  let moved = false;
  if (vy !== 0) {
    const max = Math.max(0, s.contentHeight - s.height);
    const next = Math.min(max, Math.max(0, s.scrollY + Math.sign(vy) * Math.ceil(MAX_STEP * Math.min(1, Math.abs(vy)) ** 2)));
    if (next !== s.scrollY) { s.scrollTo(next); moved = true; }
  }
  if (vx !== 0) {
    const max = Math.max(0, s.contentWidth - s.width);
    const next = Math.min(max, Math.max(0, s.scrollX + Math.sign(vx) * Math.ceil(MAX_STEP * Math.min(1, Math.abs(vx)) ** 2)));
    if (next !== s.scrollX) { s.scrollToX(next); moved = true; }
  }
  if (!moved) return;                          // the range ended: nothing more to reveal
  d.redeliver(d.x, d.y, d.extra);              // the content moved under a still pointer
  d.frame = raf(step);
}

/** A drag move reached `view` at root point (x, y). */
export function dragMoved(view: View, x: number, y: number, extra: Record<string, unknown> | undefined,
  redeliver: (x: number, y: number, extra: Record<string, unknown> | undefined) => void): void {
  if (drag !== null && drag.view !== view) dragEnded();
  if (drag === null) drag = { view, x, y, extra, redeliver, frame: null };
  drag.x = x; drag.y = y; drag.extra = extra;
  if (drag.frame === null) drag.frame = raf(step);
}

/** The press ended (released or canceled): stop. */
export function dragEnded(): void {
  if (drag !== null && drag.frame !== null) caf(drag.frame);
  drag = null;
}
