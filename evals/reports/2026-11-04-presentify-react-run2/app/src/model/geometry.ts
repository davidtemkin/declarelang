export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const r of rects) {
    left = Math.min(left, r.x)
    top = Math.min(top, r.y)
    right = Math.max(right, r.x + r.width)
    bottom = Math.max(bottom, r.y + r.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** True when two rectangles touch or overlap (a zero-size rectangle still counts, so lines can be hit). */
export function rectsTouch(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
}

export function rectsEqual(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Rounds to a hundredth of a point: precise enough to be invisible, tidy enough to read in the format. */
export const roundPoint = (value: number) => Math.round(value * 100) / 100

/**
 * Keeps a dragged vector on the nearest multiple of 45°, for lines drawn or adjusted with shift.
 */
export function snapAngle(from: Point, to: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  const step = Math.PI / 4
  const angle = Math.round(Math.atan2(dy, dx) / step) * step
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length }
}
