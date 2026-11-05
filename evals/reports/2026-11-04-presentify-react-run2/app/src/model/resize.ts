import type { Point, Rect } from './geometry'

/** The eight handles around a selection, by compass direction. */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export const HANDLE_CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}

export function handlePosition(handle: Handle, r: Rect): Point {
  const x = handle.includes('w') ? r.x : handle.includes('e') ? r.x + r.width : r.x + r.width / 2
  const y = handle.includes('n') ? r.y : handle.includes('s') ? r.y + r.height : r.y + r.height / 2
  return { x, y }
}

const MIN_SIZE = 1

/**
 * The box a selection becomes when `handle` is dragged to `pointer`. The opposite edge or corner
 * stays where it was. With `keepRatio`, the box keeps its width-to-height ratio: a corner follows
 * whichever of the two directions moved further, and a side grows the other dimension evenly about
 * its centre. A box is never turned inside out; it stops at its smallest size.
 */
export function resizeBox(handle: Handle, start: Rect, pointer: Point, keepRatio: boolean): Rect {
  const left = start.x
  const top = start.y
  const right = start.x + start.width
  const bottom = start.y + start.height

  const movesW = handle.includes('w')
  const movesE = handle.includes('e')
  const movesN = handle.includes('n')
  const movesS = handle.includes('s')

  let x1 = left
  let x2 = right
  let y1 = top
  let y2 = bottom
  if (movesW) x1 = Math.min(pointer.x, right - MIN_SIZE)
  if (movesE) x2 = Math.max(pointer.x, left + MIN_SIZE)
  if (movesN) y1 = Math.min(pointer.y, bottom - MIN_SIZE)
  if (movesS) y2 = Math.max(pointer.y, top + MIN_SIZE)

  if (!keepRatio || start.width === 0 || start.height === 0) {
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
  }

  const ratio = start.width / start.height
  const horizontal = movesW || movesE
  const vertical = movesN || movesS
  let width = x2 - x1
  let height = y2 - y1

  if (horizontal && vertical) {
    // A corner: follow the direction that moved further, relative to the box's shape.
    if (width / start.width > height / start.height) height = width / ratio
    else width = height * ratio
    return {
      x: movesW ? right - width : left,
      y: movesN ? bottom - height : top,
      width,
      height,
    }
  }
  if (horizontal) {
    height = width / ratio
    return { x: movesW ? right - width : left, y: top + start.height / 2 - height / 2, width, height }
  }
  width = height * ratio
  return { x: left + start.width / 2 - width / 2, y: movesN ? bottom - height : top, width, height }
}

/** Which edges a handle moves, so that only those snap. */
export function movingEdges(handle: Handle): { x: 'left' | 'right' | null; y: 'top' | 'bottom' | null } {
  return {
    x: handle.includes('w') ? 'left' : handle.includes('e') ? 'right' : null,
    y: handle.includes('n') ? 'top' : handle.includes('s') ? 'bottom' : null,
  }
}
