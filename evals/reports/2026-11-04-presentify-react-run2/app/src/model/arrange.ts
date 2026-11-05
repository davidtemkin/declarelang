import type { GroupElement, SlideElement } from '../api/types'
import { SLIDE_HEIGHT, SLIDE_WIDTH } from '../api/types'
import { boundsOf, elementBounds, parentIdOf, translate, updateById } from './elements'
import type { Rect } from './geometry'

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type DistributeAxis = 'horizontal' | 'vertical'
export type OrderMove = 'forward' | 'backward' | 'front' | 'back'

/** Replaces the list that `parentId` holds (or the slide's own list, for null) with `change(list)`. */
function withSiblings(elements: SlideElement[], parentId: string | null, change: (list: SlideElement[]) => SlideElement[]): SlideElement[] {
  if (parentId === null) return change(elements)
  return updateById(elements, parentId, (group) => (group.kind === 'group' ? { ...group, children: change(group.children) } : group))
}

/** Whether every id sits in the same list, so they can be grouped or reordered together. */
export function shareParent(elements: SlideElement[], ids: string[]): boolean {
  if (ids.length === 0) return false
  const parent = parentIdOf(elements, ids[0])
  return ids.every((id) => parentIdOf(elements, id) === parent)
}

export function group(elements: SlideElement[], ids: string[], groupId: string): SlideElement[] {
  if (ids.length < 2 || !shareParent(elements, ids)) return elements
  const parentId = parentIdOf(elements, ids[0])
  const chosen = new Set(ids)
  return withSiblings(elements, parentId, (list) => {
    const members = list.filter((el) => chosen.has(el.id))
    const topIndex = Math.max(...members.map((m) => list.indexOf(m)))
    const groupEl: GroupElement = { id: groupId, kind: 'group', children: members }
    const out: SlideElement[] = []
    list.forEach((el, index) => {
      if (index === topIndex) out.push(groupEl)
      else if (!chosen.has(el.id)) out.push(el)
    })
    return out
  })
}

/** Opens each group in `ids` back into its parts, in place. Returns the new tree and the parts. */
export function ungroup(elements: SlideElement[], ids: string[]): { elements: SlideElement[]; parts: string[] } {
  const parts: string[] = []
  let out = elements
  for (const id of ids) {
    const parentId = parentIdOf(out, id)
    out = withSiblings(out, parentId, (list) =>
      list.flatMap((el) => {
        if (el.id !== id || el.kind !== 'group') return [el]
        parts.push(...el.children.map((c) => c.id))
        return el.children
      }),
    )
  }
  return { elements: out, parts }
}

const SLIDE_RECT: Rect = { x: 0, y: 0, width: SLIDE_WIDTH, height: SLIDE_HEIGHT }

/**
 * Lines things up along one edge or centre line. Two or more align to each other; one on its own
 * aligns to the slide.
 */
export function align(elements: SlideElement[], ids: string[], mode: AlignMode): SlideElement[] {
  const chosen = ids.map((id) => findTop(elements, id)).filter((el): el is SlideElement => el !== null)
  if (chosen.length === 0) return elements
  const frame = chosen.length === 1 ? SLIDE_RECT : boundsOf(chosen)!
  let out = elements
  for (const el of chosen) {
    const b = elementBounds(el)
    let dx = 0
    let dy = 0
    switch (mode) {
      case 'left': dx = frame.x - b.x; break
      case 'center': dx = frame.x + frame.width / 2 - (b.x + b.width / 2); break
      case 'right': dx = frame.x + frame.width - (b.x + b.width); break
      case 'top': dy = frame.y - b.y; break
      case 'middle': dy = frame.y + frame.height / 2 - (b.y + b.height / 2); break
      case 'bottom': dy = frame.y + frame.height - (b.y + b.height); break
    }
    if (dx !== 0 || dy !== 0) out = updateById(out, el.id, (e) => translate(e, dx, dy))
  }
  return out
}

/** Spaces three or more things so the gaps between them are equal; the outermost two stay put. */
export function distribute(elements: SlideElement[], ids: string[], axis: DistributeAxis): SlideElement[] {
  const chosen = ids.map((id) => findTop(elements, id)).filter((el): el is SlideElement => el !== null)
  if (chosen.length < 3) return elements
  const start = (r: Rect) => (axis === 'horizontal' ? r.x : r.y)
  const size = (r: Rect) => (axis === 'horizontal' ? r.width : r.height)
  const items = chosen.map((el) => ({ el, b: elementBounds(el) })).sort((a, b) => start(a.b) - start(b.b))
  const first = items[0].b
  const last = items[items.length - 1].b
  const span = start(last) + size(last) - start(first)
  const occupied = items.reduce((sum, i) => sum + size(i.b), 0)
  const gap = (span - occupied) / (items.length - 1)
  let cursor = start(first)
  let out = elements
  for (const { el, b } of items) {
    const delta = cursor - start(b)
    if (Math.abs(delta) > 0.001) {
      out = updateById(out, el.id, (e) => (axis === 'horizontal' ? translate(e, delta, 0) : translate(e, 0, delta)))
    }
    cursor += size(b) + gap
  }
  return out
}

export function reorder(elements: SlideElement[], ids: string[], move: OrderMove): SlideElement[] {
  if (ids.length === 0 || !shareParent(elements, ids)) return elements
  const chosen = new Set(ids)
  return withSiblings(elements, parentIdOf(elements, ids[0]), (list) => {
    const picked = list.filter((el) => chosen.has(el.id))
    const rest = list.filter((el) => !chosen.has(el.id))
    if (move === 'front') return [...rest, ...picked]
    if (move === 'back') return [...picked, ...rest]
    const out = [...list]
    if (move === 'forward') {
      for (let i = out.length - 2; i >= 0; i--) {
        if (chosen.has(out[i].id) && !chosen.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]]
      }
    } else {
      for (let i = 1; i < out.length; i++) {
        if (chosen.has(out[i].id) && !chosen.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]]
      }
    }
    return out
  })
}

/** Whether a move would change anything, so that a control can say it has nothing to do. */
export function canReorder(elements: SlideElement[], ids: string[], move: OrderMove): boolean {
  const next = reorder(elements, ids, move)
  return next !== elements && JSON.stringify(next) !== JSON.stringify(elements)
}

function findTop(elements: SlideElement[], id: string): SlideElement | null {
  const stack = [...elements]
  while (stack.length) {
    const el = stack.pop()!
    if (el.id === id) return el
    if (el.kind === 'group') stack.push(...el.children)
  }
  return null
}
