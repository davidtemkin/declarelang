import { SLIDE_HEIGHT, SLIDE_WIDTH, type SlideElement } from '../api/types'
import { elementBounds } from './elements'
import type { Rect } from './geometry'

/** A line things can snap to: vertical lines have an `x`, horizontal lines a `y`. */
export interface Guide {
  axis: 'x' | 'y'
  at: number
}

export interface SnapTargets {
  xs: number[]
  ys: number[]
}

/** The edges and centre lines of the slide and of everything on it except what is being dragged. */
export function snapTargets(elements: SlideElement[], exclude: Set<string>): SnapTargets {
  const xs = [0, SLIDE_WIDTH / 2, SLIDE_WIDTH]
  const ys = [0, SLIDE_HEIGHT / 2, SLIDE_HEIGHT]
  for (const el of elements) {
    if (exclude.has(el.id)) continue
    const b = elementBounds(el)
    xs.push(b.x, b.x + b.width / 2, b.x + b.width)
    ys.push(b.y, b.y + b.height / 2, b.y + b.height)
  }
  return { xs, ys }
}

function nearest(values: number[], targets: number[], threshold: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null
  for (const v of values) {
    for (const t of targets) {
      const delta = t - v
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: t }
    }
  }
  return best
}

/** How far to nudge a moving box so one of its edges or its centre lands on a guide, and which guides it met. */
export function snapBox(box: Rect, targets: SnapTargets, threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const sx = nearest([box.x, box.x + box.width / 2, box.x + box.width], targets.xs, threshold)
  const sy = nearest([box.y, box.y + box.height / 2, box.y + box.height], targets.ys, threshold)
  const dx = sx?.delta ?? 0
  const dy = sy?.delta ?? 0
  const moved = { ...box, x: box.x + dx, y: box.y + dy }
  return { dx, dy, guides: guidesTouching(moved, targets) }
}

/** Snaps one coordinate (an edge being resized, a line's end) to the nearest guide on its axis. */
export function snapValue(value: number, targets: number[], threshold: number): { value: number; snapped: boolean } {
  const hit = nearest([value], targets, threshold)
  return hit ? { value: hit.at, snapped: true } : { value, snapped: false }
}

/** Every guide that a box's edges or centre lines sit exactly on, for drawing. */
export function guidesTouching(box: Rect, targets: SnapTargets): Guide[] {
  const guides: Guide[] = []
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01
  for (const x of new Set(targets.xs)) {
    if ([box.x, box.x + box.width / 2, box.x + box.width].some((v) => near(v, x))) guides.push({ axis: 'x', at: x })
  }
  for (const y of new Set(targets.ys)) {
    if ([box.y, box.y + box.height / 2, box.y + box.height].some((v) => near(v, y))) guides.push({ axis: 'y', at: y })
  }
  return guides
}
