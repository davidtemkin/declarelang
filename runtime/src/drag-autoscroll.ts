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
//
// Which scroller, and when (docs/system-design/drag.md R9): an edge scrolls only
// once the drag has travelled toward it, along its axis, by TOWARD px — a slider
// low in a pane, dragged sideways, never scrolls the pane; a card near the bottom,
// dragged down, does. The pane
// the pointer has been carried into scrolls first (never the dragged view or one
// inside it), else the nearest scroller holding the dragged view, and the next
// one out once the nearer has reached the end of its range. The band is measured
// on the part of a scroller that can be seen, inside every scroller around it.
// The scroll is the program's motion, not the user's scroll: `userScrolling` stays
// false, and the anchor never holds the dragged view still (scroll-anchor.ts).

import { View } from "./view.js";

const BAND = 48;          // px from a scroller's edge where scrolling begins
const MAX_STEP = 20;      // px per frame at the very edge (and beyond it)
const TOWARD = 12;        // px a drag must travel toward an edge, along its axis, before it scrolls

interface Drag {
  view: View;
  sx: number; sy: number;                       // the root point the drag began at
  x: number; y: number;                         // the root point, as last delivered
  extra: Record<string, unknown> | undefined;
  redeliver: (x: number, y: number, extra: Record<string, unknown> | undefined) => void;
  frame: number | null;
}

let drag: Drag | null = null;
/** The edge scrolling is moving a scroller now (its last step moved it). */
let scrolling = false;

/** The view being dragged right now, if any (the anchor skips it). */
export function draggingView(): View | null { return drag?.view ?? null; }

/** Is a drag's edge scrolling moving a scroller now? A scroll under the drag's
 *  finger is then the program's, not the user's (dom-backend watchScrolling)
 *  and not the browser taking the gesture (input.ts takeover). */
export function dragScrolling(): boolean { return scrolling; }

/** The scrollers around `v`, nearest first. */
function scrollersAround(v: View): View[] {
  const out: View[] = [];
  for (let n: unknown = v.parent; n instanceof View; n = n.parent) if (n.scrolls !== "none") out.push(n);
  return out;
}

/** Is `v` the dragged view or inside it? */
function within(v: View, dragged: View): boolean {
  for (let n: unknown = v; n instanceof View; n = n.parent) if (n === dragged) return true;
  return false;
}

/** The part of scroller `s` that can be seen: its box, inside every scroller around it. */
function visible(s: View): { x0: number; y0: number; x1: number; y1: number } {
  const b = s.rootBounds();
  let x0 = b.x, y0 = b.y, x1 = b.x + b.width, y1 = b.y + b.height;
  for (const o of scrollersAround(s)) {
    const c = o.rootBounds();
    x0 = Math.max(x0, c.x); y0 = Math.max(y0, c.y); x1 = Math.min(x1, c.x + c.width); y1 = Math.min(y1, c.y + c.height);
  }
  return { x0, y0, x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}

/** The candidates, in order: the pane the pointer is over (not the dragged view
 *  or inside it) and its scrollers outward, then the scrollers holding the
 *  dragged view, nearest first — each once. */
function candidates(d: Drag): View[] {
  const out: View[] = [];
  const add = (v: View): void => { if (!out.includes(v) && !within(v, d.view)) out.push(v); };
  const app = d.view.$root as unknown as View | null;
  const under = app !== null && typeof (app as View).viewAt === "function" ? (app as View).viewAt(d.x, d.y, d.view) : null;
  if (under !== null) {
    if (under.scrolls !== "none") add(under);
    for (const s of scrollersAround(under)) add(s);
  }
  for (const s of scrollersAround(d.view)) add(s);
  return out;
}

/** How far into an edge band `p` is, signed: negative toward the start — and 0
 *  for an edge the drag has not travelled toward from `from`, along this axis. */
function depth(p: number, lo: number, hi: number, from: number): number {
  const band = Math.min(BAND, (hi - lo) / 4);
  if (p < lo + band && from - p >= TOWARD) return -(lo + band - p) / band;
  if (p > hi - band && p - from >= TOWARD) return (p - (hi - band)) / band;
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

const speed = (v: number): number => Math.sign(v) * Math.ceil(MAX_STEP * Math.min(1, Math.abs(v)) ** 2);

function step(): void {
  const d = drag;
  if (d === null) return;
  d.frame = null;
  scrolling = false;
  if (d.view.parent === null) return;
  let movedY = false, movedX = false;
  for (const s of candidates(d)) {
    const b = visible(s);
    if (!movedY && (s.scrolls === "y" || s.scrolls === "both")) {
      const v = depth(d.y, b.y0, b.y1, d.sy);
      if (v !== 0) {
        const next = Math.min(Math.max(0, s.contentHeight - s.height), Math.max(0, s.scrollY + speed(v)));
        if (next !== s.scrollY) { s.scrollTo(next); movedY = true; }
      }
    }
    if (!movedX && (s.scrolls === "x" || s.scrolls === "both")) {
      const v = depth(d.x, b.x0, b.x1, d.sx);
      if (v !== 0) {
        const next = Math.min(Math.max(0, s.contentWidth - s.width), Math.max(0, s.scrollX + speed(v)));
        if (next !== s.scrollX) { s.scrollToX(next); movedX = true; }
      }
    }
    if (movedX && movedY) break;
  }
  if (!movedX && !movedY) return;              // nothing to reveal in reach
  scrolling = true;
  d.redeliver(d.x, d.y, d.extra);              // the content moved under a still pointer
  d.frame = raf(step);
}

/** A drag move reached `view` at root point (x, y). */
export function dragMoved(view: View, x: number, y: number, extra: Record<string, unknown> | undefined,
  redeliver: (x: number, y: number, extra: Record<string, unknown> | undefined) => void): void {
  if (drag !== null && drag.view !== view) dragEnded();
  if (drag === null) {
    // the drag began where the press did: the root point less the travel so far
    const dx = typeof extra?.deltaX === "number" ? extra.deltaX : 0;
    const dy = typeof extra?.deltaY === "number" ? extra.deltaY : 0;
    drag = { view, sx: x - dx, sy: y - dy, x, y, extra, redeliver, frame: null };
  }
  drag.x = x; drag.y = y; drag.extra = extra;
  if (drag.frame === null) drag.frame = raf(step);
}

/** The press ended (released or canceled): stop. */
export function dragEnded(): void {
  if (drag !== null && drag.frame !== null) caf(drag.frame);
  drag = null;
  scrolling = false;
}
