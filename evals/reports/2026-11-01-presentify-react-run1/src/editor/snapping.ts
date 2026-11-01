/**
 * Snapping while dragging: edges and centres line up with the slide's edges and centre
 * and with the other things on the slide. Every result says which guides to draw.
 */
import { boundsOf } from '../model/elements';
import type { Rect, SlideElement } from '../model/types';
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../model/types';

export interface Guides {
  /** x positions of vertical guides. */
  x: number[];
  /** y positions of horizontal guides. */
  y: number[];
}

export interface SnapTargets {
  x: number[];
  y: number[];
}

export const NO_GUIDES: Guides = { x: [], y: [] };

/** Lines worth snapping to: the slide's edges and centre, and every other element's. */
export function snapTargets(elements: SlideElement[], exclude: ReadonlySet<string>): SnapTargets {
  const x = [0, SLIDE_WIDTH / 2, SLIDE_WIDTH];
  const y = [0, SLIDE_HEIGHT / 2, SLIDE_HEIGHT];
  for (const el of elements) {
    if (exclude.has(el.id)) continue;
    const b = boundsOf(el);
    x.push(b.x, b.x + b.width / 2, b.x + b.width);
    y.push(b.y, b.y + b.height / 2, b.y + b.height);
  }
  return { x, y };
}

/** The nearest target to any of `values` within `threshold`, as the shift to get there. */
function nearest(values: number[], targets: number[], threshold: number): { delta: number; at: number[] } | null {
  let best: { delta: number; at: number[] } | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) > threshold) continue;
      if (!best || Math.abs(d) < Math.abs(best.delta) - 0.001) best = { delta: d, at: [t] };
      else if (Math.abs(d - best.delta) < 0.001 && !best.at.includes(t)) best.at.push(t);
    }
  }
  return best;
}

/** Snap a moving box: its left, centre and right (and top, middle, bottom) are all candidates. */
export function snapBox(box: Rect, targets: SnapTargets, threshold: number): { dx: number; dy: number; guides: Guides } {
  const sx = nearest([box.x, box.x + box.width / 2, box.x + box.width], targets.x, threshold);
  const sy = nearest([box.y, box.y + box.height / 2, box.y + box.height], targets.y, threshold);
  const dx = sx?.delta ?? 0;
  const dy = sy?.delta ?? 0;
  // Draw every guide the snapped box now lies on, not just the one that won.
  const moved = { ...box, x: box.x + dx, y: box.y + dy };
  return { dx, dy, guides: guidesFor(moved, targets, !!sx, !!sy) };
}

function guidesFor(box: Rect, targets: SnapTargets, withX: boolean, withY: boolean): Guides {
  const on = (v: number, list: number[]) => list.filter((t) => Math.abs(t - v) < 0.01);
  const xs = withX ? [box.x, box.x + box.width / 2, box.x + box.width].flatMap((v) => on(v, targets.x)) : [];
  const ys = withY ? [box.y, box.y + box.height / 2, box.y + box.height].flatMap((v) => on(v, targets.y)) : [];
  return { x: [...new Set(xs)], y: [...new Set(ys)] };
}

/** Snap one point (an edge being dragged, a line's end, where drawing starts). */
export function snapPoint(
  px: number,
  py: number,
  targets: SnapTargets,
  threshold: number,
): { x: number; y: number; guides: Guides } {
  const sx = nearest([px], targets.x, threshold);
  const sy = nearest([py], targets.y, threshold);
  return {
    x: px + (sx?.delta ?? 0),
    y: py + (sy?.delta ?? 0),
    guides: { x: sx ? sx.at : [], y: sy ? sy.at : [] },
  };
}
