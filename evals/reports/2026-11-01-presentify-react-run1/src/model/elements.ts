/**
 * Pure functions over a slide's element tree. Nothing here mutates its input.
 */
import type { LeafElement, Rect, SlideElement, TextElement } from './types';

// ---------------------------------------------------------------- ids

export function newId(prefix = 'e'): string {
  return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

/** Every id in the tree, groups included. */
export function collectIds(elements: SlideElement[], into = new Set<string>()): Set<string> {
  for (const el of elements) {
    into.add(el.id);
    if (el.kind === 'group') collectIds(el.children, into);
  }
  return into;
}

/** A deep copy with fresh ids throughout. */
export function cloneWithNewIds<T extends SlideElement>(el: T): T {
  if (el.kind === 'group') return { ...el, id: newId(), children: el.children.map(cloneWithNewIds) };
  return { ...structuredClone(el), id: newId() };
}

// ---------------------------------------------------------------- tree walking

/** The path of ids from the top level down to `id`, or null if it isn't there. */
export function pathTo(elements: SlideElement[], id: string): string[] | null {
  for (const el of elements) {
    if (el.id === id) return [el.id];
    if (el.kind === 'group') {
      const rest = pathTo(el.children, id);
      if (rest) return [el.id, ...rest];
    }
  }
  return null;
}

export function findElement(elements: SlideElement[], id: string): SlideElement | null {
  for (const el of elements) {
    if (el.id === id) return el;
    if (el.kind === 'group') {
      const found = findElement(el.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** The id of the group directly containing `id`, or null at the top level. */
export function parentOf(elements: SlideElement[], id: string): string | null {
  const path = pathTo(elements, id);
  return path && path.length > 1 ? path[path.length - 2] : null;
}

/** The array that holds the children of `parentId` (the top level when null). */
export function childrenOf(elements: SlideElement[], parentId: string | null): SlideElement[] {
  if (parentId === null) return elements;
  const parent = findElement(elements, parentId);
  return parent?.kind === 'group' ? parent.children : [];
}

/** Replace the children of `parentId` (or the top level) with `fn(children)`. */
export function updateChildren(
  elements: SlideElement[],
  parentId: string | null,
  fn: (children: SlideElement[]) => SlideElement[],
): SlideElement[] {
  if (parentId === null) return fn(elements);
  return elements.map((el) => {
    if (el.kind !== 'group') return el;
    if (el.id === parentId) return { ...el, children: fn(el.children) };
    return { ...el, children: updateChildren(el.children, parentId, fn) };
  });
}

export function leaves(el: SlideElement): LeafElement[] {
  return el.kind === 'group' ? el.children.flatMap(leaves) : [el];
}

/** Apply `fn` to every leaf inside the elements whose ids are in `ids` (or all of them). */
export function mapLeaves(
  elements: SlideElement[],
  ids: ReadonlySet<string> | null,
  fn: (leaf: LeafElement) => LeafElement,
  inside = false,
): SlideElement[] {
  return elements.map((el) => {
    const hit = inside || ids === null || ids.has(el.id);
    if (el.kind === 'group') return { ...el, children: mapLeaves(el.children, ids, fn, hit) };
    return hit ? fn(el) : el;
  });
}

/** Remove elements by id at any depth; groups left with fewer than two children dissolve. */
export function removeElements(elements: SlideElement[], ids: ReadonlySet<string>): SlideElement[] {
  const out: SlideElement[] = [];
  for (const el of elements) {
    if (ids.has(el.id)) continue;
    if (el.kind === 'group') {
      const children = removeElements(el.children, ids);
      if (children.length >= 2) out.push({ ...el, children });
      else out.push(...children);
    } else {
      out.push(el);
    }
  }
  return out;
}

/** Reduce a selection to its outermost members (drop anything inside another selected group). */
export function outermost(elements: SlideElement[], ids: Iterable<string>): string[] {
  const set = new Set(ids);
  return [...set].filter((id) => {
    const path = pathTo(elements, id);
    return path !== null && !path.slice(0, -1).some((p) => set.has(p));
  });
}

// ---------------------------------------------------------------- geometry

export function boundsOf(el: SlideElement): Rect {
  switch (el.kind) {
    case 'line':
      return {
        x: Math.min(el.x1, el.x2),
        y: Math.min(el.y1, el.y2),
        width: Math.abs(el.x2 - el.x1),
        height: Math.abs(el.y2 - el.y1),
      };
    case 'group':
      return unionRects(el.children.map(boundsOf));
    default:
      return { x: el.x, y: el.y, width: el.width, height: el.height };
  }
}

export function unionRects(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

/** Points are kept to two decimals so documents stay readable and diffs stay quiet. */
export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function translate<T extends SlideElement>(el: T, dx: number, dy: number): T {
  if (el.kind === 'group') return { ...el, children: el.children.map((c) => translate(c, dx, dy)) };
  if (el.kind === 'line') {
    return { ...el, x1: round(el.x1 + dx), y1: round(el.y1 + dy), x2: round(el.x2 + dx), y2: round(el.y2 + dy) };
  }
  return { ...el, x: round(el.x + dx), y: round(el.y + dy) };
}

/**
 * Map an element from one box onto another. Every point scales; lengths that aren't
 * proportions (corner radius, stroke width, type size) stay as they are.
 */
export function transformInto<T extends SlideElement>(el: T, from: Rect, to: Rect): T {
  const sx = from.width === 0 ? 1 : to.width / from.width;
  const sy = from.height === 0 ? 1 : to.height / from.height;
  const mx = (x: number) => round(to.x + (x - from.x) * sx);
  const my = (y: number) => round(to.y + (y - from.y) * sy);
  if (el.kind === 'group') return { ...el, children: el.children.map((c) => transformInto(c, from, to)) };
  if (el.kind === 'line') return { ...el, x1: mx(el.x1), y1: my(el.y1), x2: mx(el.x2), y2: my(el.y2) };
  return {
    ...el,
    x: mx(el.x),
    y: my(el.y),
    width: Math.max(1, round(el.width * sx)),
    height: Math.max(1, round(el.height * sy)),
  };
}

// ---------------------------------------------------------------- hit testing

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Does the point land on this element? `tolerance` is in slide points. */
export function hitsElement(el: SlideElement, px: number, py: number, tolerance: number): boolean {
  switch (el.kind) {
    case 'group':
      return el.children.some((c) => hitsElement(c, px, py, tolerance));
    case 'line':
      return distanceToSegment(px, py, el.x1, el.y1, el.x2, el.y2) <= Math.max(tolerance, el.stroke.width / 2);
    case 'ellipse': {
      const pad = tolerance + (el.stroke?.width ?? 0) / 2;
      const rx = el.width / 2 + pad;
      const ry = el.height / 2 + pad;
      const nx = (px - (el.x + el.width / 2)) / rx;
      const ny = (py - (el.y + el.height / 2)) / ry;
      return nx * nx + ny * ny <= 1;
    }
    default: {
      const pad = tolerance / 2 + (el.kind === 'rect' ? (el.stroke?.width ?? 0) / 2 : 0);
      return px >= el.x - pad && px <= el.x + el.width + pad && py >= el.y - pad && py <= el.y + el.height + pad;
    }
  }
}

/** The path (outermost first) of the frontmost element under the point. */
export function hitTest(elements: SlideElement[], px: number, py: number, tolerance: number): string[] | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.kind === 'group') {
      const inner = hitTest(el.children, px, py, tolerance);
      if (inner) return [el.id, ...inner];
    } else if (hitsElement(el, px, py, tolerance)) {
      return [el.id];
    }
  }
  return null;
}

export function isText(el: SlideElement | null | undefined): el is TextElement {
  return el?.kind === 'text';
}

/** Whether resizing should keep proportions by default. */
export function locksProportions(el: SlideElement): boolean {
  if (el.kind === 'group') return el.children.some(locksProportions);
  return el.kind !== 'line' && el.keepProportions;
}
