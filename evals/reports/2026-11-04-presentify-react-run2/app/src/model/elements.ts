import type { BoxElement, GroupElement, SlideElement, TextElement } from '../api/types'
import { roundPoint, unionRects, type Rect } from './geometry'
import { measureTextHeight } from './textLayout'

/* ---------- Reading the tree ---------- */

export function isBox(el: SlideElement): el is BoxElement {
  return el.kind === 'rect' || el.kind === 'ellipse' || el.kind === 'text'
}

export function elementBounds(el: SlideElement): Rect {
  switch (el.kind) {
    case 'line':
      return {
        x: Math.min(el.x1, el.x2),
        y: Math.min(el.y1, el.y2),
        width: Math.abs(el.x2 - el.x1),
        height: Math.abs(el.y2 - el.y1),
      }
    case 'group':
      return unionRects(el.children.map(elementBounds)) ?? { x: 0, y: 0, width: 0, height: 0 }
    default:
      return { x: el.x, y: el.y, width: el.width, height: el.height }
  }
}

export function boundsOf(elements: SlideElement[]): Rect | null {
  return unionRects(elements.map(elementBounds))
}

/** Visits every element, depth first, back to front. */
export function walk(elements: SlideElement[], visit: (el: SlideElement, parent: GroupElement | null) => void, parent: GroupElement | null = null) {
  for (const el of elements) {
    visit(el, parent)
    if (el.kind === 'group') walk(el.children, visit, el)
  }
}

/** The chain of elements from the top of the slide down to the one with `id`, or null if it isn't there. */
export function findPath(elements: SlideElement[], id: string): SlideElement[] | null {
  for (const el of elements) {
    if (el.id === id) return [el]
    if (el.kind === 'group') {
      const below = findPath(el.children, id)
      if (below) return [el, ...below]
    }
  }
  return null
}

export function findElement(elements: SlideElement[], id: string): SlideElement | null {
  const path = findPath(elements, id)
  return path ? path[path.length - 1] : null
}

/** The id of the group directly holding `id`, or null when it sits on the slide itself. */
export function parentIdOf(elements: SlideElement[], id: string): string | null {
  const path = findPath(elements, id)
  return path && path.length > 1 ? path[path.length - 2].id : null
}

/** The list (the slide's, or a group's children) that holds `id`. */
export function siblingsOf(elements: SlideElement[], id: string): SlideElement[] | null {
  const parentId = parentIdOf(elements, id)
  if (parentId === null) return elements.some((e) => e.id === id) ? elements : null
  const parent = findElement(elements, parentId)
  return parent && parent.kind === 'group' ? parent.children : null
}

export function allIds(elements: SlideElement[]): Set<string> {
  const ids = new Set<string>()
  walk(elements, (el) => ids.add(el.id))
  return ids
}

/** The things in `elements` that aren't groups, with groups opened up. */
export function leaves(elements: SlideElement[]): Exclude<SlideElement, GroupElement>[] {
  const out: Exclude<SlideElement, GroupElement>[] = []
  walk(elements, (el) => {
    if (el.kind !== 'group') out.push(el)
  })
  return out
}

export function keepsProportions(el: SlideElement): boolean {
  if (el.kind === 'group') return el.children.some(keepsProportions)
  if (el.kind === 'line') return false
  return el.keepProportions
}

/* ---------- Making ---------- */

export function makeId(taken: Set<string>): string {
  for (;;) {
    const id = `e${Math.random().toString(36).slice(2, 9)}`
    if (!taken.has(id)) {
      taken.add(id)
      return id
    }
  }
}

/** A copy with every id (its own and its children's) replaced by one not in `taken`. */
export function cloneWithFreshIds(el: SlideElement, taken: Set<string>): SlideElement {
  if (el.kind === 'group') {
    return { ...el, id: makeId(taken), children: el.children.map((c) => cloneWithFreshIds(c, taken)) }
  }
  return { ...structuredClone(el), id: makeId(taken) }
}

/* ---------- Changing (each returns a new element) ---------- */

export function translate(el: SlideElement, dx: number, dy: number): SlideElement {
  switch (el.kind) {
    case 'line':
      return { ...el, x1: roundPoint(el.x1 + dx), y1: roundPoint(el.y1 + dy), x2: roundPoint(el.x2 + dx), y2: roundPoint(el.y2 + dy) }
    case 'group':
      return { ...el, children: el.children.map((c) => translate(c, dx, dy)) }
    default:
      return { ...el, x: roundPoint(el.x + dx), y: roundPoint(el.y + dy) }
  }
}

/**
 * Maps an element from one frame onto another, as when the selection holding it is resized.
 * Positions and sizes scale; a corner radius, an outline width and a text size do not, since they
 * are lengths. A text box never ends up shorter than its text.
 */
export function mapIntoFrame(el: SlideElement, from: Rect, to: Rect): SlideElement {
  const sx = from.width === 0 ? 1 : to.width / from.width
  const sy = from.height === 0 ? 1 : to.height / from.height
  const mapX = (x: number) => roundPoint(to.x + (x - from.x) * sx)
  const mapY = (y: number) => roundPoint(to.y + (y - from.y) * sy)

  switch (el.kind) {
    case 'line':
      return { ...el, x1: mapX(el.x1), y1: mapY(el.y1), x2: mapX(el.x2), y2: mapY(el.y2) }
    case 'group':
      return { ...el, children: el.children.map((c) => mapIntoFrame(c, from, to)) }
    default: {
      const x = mapX(el.x)
      const y = mapY(el.y)
      const width = Math.max(1, roundPoint(mapX(el.x + el.width) - x))
      const height = Math.max(1, roundPoint(mapY(el.y + el.height) - y))
      const moved = { ...el, x, y, width, height }
      return moved.kind === 'text' ? fitTextHeight(moved) : moved
    }
  }
}

/** Grows a text box to hold its text; it never shrinks below the height it was given. */
export function fitTextHeight(el: TextElement, opts: { allowShrink?: boolean } = {}): TextElement {
  const needed = measureTextHeight(el.text, el.width)
  const height = opts.allowShrink ? needed : Math.max(needed, el.height)
  return height === el.height ? el : { ...el, height }
}

/**
 * Lays a text box out again after its text or style changed. A box that fitted its old text
 * snugly keeps fitting the new text, growing or shrinking with it; a box someone made taller than
 * its text keeps that height for as long as the text fits in it.
 */
export function refitText(before: TextElement, after: TextElement): TextElement {
  const wasSnug = before.height <= measureTextHeight(before.text, before.width) + 1
  return fitTextHeight(after, { allowShrink: wasSnug })
}

/** Applies `change` to the element with `id`, wherever it is in the tree. */
export function updateById(elements: SlideElement[], id: string, change: (el: SlideElement) => SlideElement): SlideElement[] {
  let changed = false
  const next = elements.map((el) => {
    if (el.id === id) {
      changed = true
      return change(el)
    }
    if (el.kind === 'group') {
      const children = updateById(el.children, id, change)
      if (children !== el.children) {
        changed = true
        return { ...el, children }
      }
    }
    return el
  })
  return changed ? next : elements
}

export function updateMany(elements: SlideElement[], ids: Iterable<string>, change: (el: SlideElement) => SlideElement): SlideElement[] {
  let out = elements
  for (const id of ids) out = updateById(out, id, change)
  return out
}

/** Removes every element in `ids`; a group left with fewer than two things is dissolved into what remains. */
export function removeByIds(elements: SlideElement[], ids: Set<string>): SlideElement[] {
  const out: SlideElement[] = []
  for (const el of elements) {
    if (ids.has(el.id)) continue
    if (el.kind === 'group') {
      const children = removeByIds(el.children, ids)
      if (children.length === 0) continue
      if (children.length === 1) out.push(children[0])
      else out.push(children === el.children ? el : { ...el, children })
    } else {
      out.push(el)
    }
  }
  return out
}

/**
 * Changes the style of `el` — or of everything inside it, for a group — through `change`, which
 * receives each leaf and returns it as it should be.
 */
export function updateLeaves(
  el: SlideElement,
  change: (leaf: Exclude<SlideElement, GroupElement>) => Exclude<SlideElement, GroupElement>,
): SlideElement {
  if (el.kind === 'group') return { ...el, children: el.children.map((c) => updateLeaves(c, change)) }
  return change(el)
}
