/**
 * The geometry of resizing a box by one of its eight handles.
 */
import type { Rect } from '../model/types';

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export const HANDLE_CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};

/** Where the handle sits on the box. */
export function handlePosition(handle: Handle, b: Rect): { x: number; y: number } {
  const x = handle.includes('w') ? b.x : handle.includes('e') ? b.x + b.width : b.x + b.width / 2;
  const y = handle.includes('n') ? b.y : handle.includes('s') ? b.y + b.height : b.y + b.height / 2;
  return { x, y };
}

const MIN_SIZE = 1;

/**
 * The box after dragging `handle` to (px, py). The opposite side stays put. With `keepRatio`,
 * corners scale evenly and sides scale the other dimension about the box's centre.
 */
export function resizeBox(start: Rect, handle: Handle, px: number, py: number, keepRatio: boolean): Rect {
  let x1 = start.x;
  let y1 = start.y;
  let x2 = start.x + start.width;
  let y2 = start.y + start.height;
  const movesW = handle.includes('w');
  const movesE = handle.includes('e');
  const movesN = handle.includes('n');
  const movesS = handle.includes('s');
  if (movesW) x1 = Math.min(px, x2 - MIN_SIZE);
  if (movesE) x2 = Math.max(px, x1 + MIN_SIZE);
  if (movesN) y1 = Math.min(py, y2 - MIN_SIZE);
  if (movesS) y2 = Math.max(py, y1 + MIN_SIZE);

  if (!keepRatio || start.width === 0 || start.height === 0) {
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }

  const ratio = start.width / start.height;
  let w = x2 - x1;
  let h = y2 - y1;
  const corner = (movesW || movesE) && (movesN || movesS);
  if (corner) {
    const scale = Math.max(w / start.width, h / start.height);
    w = start.width * scale;
    h = start.height * scale;
    if (movesW) x1 = x2 - w;
    else x2 = x1 + w;
    if (movesN) y1 = y2 - h;
    else y2 = y1 + h;
  } else if (movesW || movesE) {
    h = w / ratio;
    const cy = start.y + start.height / 2;
    y1 = cy - h / 2;
    y2 = cy + h / 2;
  } else {
    w = h * ratio;
    const cx = start.x + start.width / 2;
    x1 = cx - w / 2;
    x2 = cx + w / 2;
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
