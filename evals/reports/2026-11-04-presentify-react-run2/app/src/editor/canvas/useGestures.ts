import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import { SLIDE_HEIGHT, SLIDE_WIDTH, type LineElement, type SlideElement } from '../../api/types'
import { textColorOn } from '../../model/colors'
import { DEFAULT_TEXT_WIDTH, newEllipse, newLine, newRect, newText, type ShapeTool } from '../../model/defaults'
import {
  allIds,
  boundsOf,
  elementBounds,
  findElement,
  findPath,
  keepsProportions,
  makeId,
  mapIntoFrame,
  translate,
  updateById,
  updateMany,
} from '../../model/elements'
import { clamp, rectFromPoints, rectsTouch, roundPoint, snapAngle, type Point, type Rect } from '../../model/geometry'
import { handlePosition, movingEdges, resizeBox, type Handle } from '../../model/resize'
import { guidesTouching, snapBox, snapTargets, snapValue, type Guide, type SnapTargets } from '../../model/snapping'
import { LINE_HEIGHT } from '../../model/textLayout'
import { isMod } from '../../ui/shortcuts'
import { withElements } from '../doc'
import { currentElements, type EditorState } from '../store'
import type { StageLayout } from './useStageLayout'

/** How far, in screen pixels, the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD_PX = 3
/** How close, in screen pixels, an edge must come to a guide to snap to it. */
const SNAP_PX = 6
/** The size of a shape placed with a single click rather than dragged out. */
const CLICK_SHAPE_SIZE = 200

type Gesture =
  | {
      kind: 'move'
      start: Point
      origin: SlideElement[]
      ids: string[]
      bounds: Rect
      targets: SnapTargets
      moved: boolean
      clickedId: string | null
      collapseOnClick: boolean
    }
  | { kind: 'resize'; handle: Handle; offset: Point; origin: SlideElement[]; ids: string[]; bounds: Rect; keep: boolean; targets: SnapTargets }
  | { kind: 'endpoint'; end: 1 | 2; id: string; offset: Point; origin: SlideElement[]; targets: SnapTargets }
  | { kind: 'radius'; id: string; start: Point; origin: SlideElement[]; r0: number; max: number }
  | { kind: 'draw'; tool: ShapeTool; start: Point; id: string; created: boolean; targets: SnapTargets; background: string; over: Hit | null }
  | { kind: 'marquee'; start: Point; base: string[]; additive: boolean; moved: boolean }

/** What a press landed on, resolved to the thing a click there would select. */
interface Hit {
  /** The element to select: a whole group from outside it, a part from inside an opened group. */
  id: string
  /** The group that `id` is a part of, when that group is open; null on the slide itself. */
  scope: string | null
  /** The innermost element under the pointer. */
  leaf: string
}

export function resolveHit(target: Element | null, elements: SlideElement[], scope: string | null): Hit | null {
  const node = target?.closest('[data-element-id]')
  const leaf = node?.getAttribute('data-element-id')
  if (!leaf) return null
  const path = findPath(elements, leaf)
  if (!path) return null
  if (scope) {
    const i = path.findIndex((el) => el.id === scope)
    if (i >= 0 && i < path.length - 1) return { id: path[i + 1].id, scope, leaf }
  }
  return { id: path[0].id, scope: null, leaf }
}

/** The things a marquee or snap considers: the open group's parts, or everything on the slide. */
function scopeElements(elements: SlideElement[], scope: string | null): SlideElement[] {
  if (!scope) return elements
  const group = findElement(elements, scope)
  return group && group.kind === 'group' ? group.children : elements
}

export interface StageFeedback {
  marquee: Rect | null
  guides: Guide[]
  hoverId: string | null
  /** The kind of drag under way, so the overlay can show the right thing (and the cursor stay put). */
  activeGesture: Gesture['kind'] | null
  activeHandle: Handle | null
}

export function useGestures(store: StoreApi<EditorState>, layout: StageLayout, containerRef: RefObject<HTMLDivElement | null>) {
  const gesture = useRef<Gesture | null>(null)
  const [feedback, setFeedback] = useState<StageFeedback>({ marquee: null, guides: [], hoverId: null, activeGesture: null, activeHandle: null })
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const toSlide = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const rect = containerRef.current!.getBoundingClientRect()
      const { scale, originX, originY } = layoutRef.current
      return { x: (e.clientX - rect.left - originX) / scale, y: (e.clientY - rect.top - originY) / scale }
    },
    [containerRef],
  )

  const patch = (next: Partial<StageFeedback>) => setFeedback((f) => ({ ...f, ...next }))

  const previewElements = (make: (elements: SlideElement[]) => SlideElement[]) => {
    const s = store.getState()
    s.actions.preview((doc) => withElements(doc, s.currentSlide, make))
  }

  /** Snap targets for dragging `ids`: the slide, and everything else in the same scope or above it. */
  const targetsFor = (s: EditorState, ids: string[]) => {
    const elements = currentElements(s)
    const exclude = new Set<string>(ids)
    // The top-level things that contain what is dragged are not targets either.
    for (const id of ids) {
      const path = findPath(elements, id)
      if (path) exclude.add(path[0].id)
    }
    const targets = snapTargets(elements, exclude)
    if (s.scope) {
      const inner = snapTargets(scopeElements(elements, s.scope), exclude)
      targets.xs.push(...inner.xs)
      targets.ys.push(...inner.ys)
    }
    return targets
  }

  const startTextAt = (point: Point, over: Hit | null, width = DEFAULT_TEXT_WIDTH, height = 0) => {
    const s = store.getState()
    const elements = currentElements(s)
    const id = makeId(allIds(elements))
    const background = s.doc.slides[s.currentSlide].background
    const shape = over ? findElement(elements, over.leaf) : null
    let el
    if (shape && (shape.kind === 'rect' || shape.kind === 'ellipse') && height === 0) {
      // Clicked on a shape: the text goes inside it, across it and centred, readable on its fill.
      const inset = Math.min(24, shape.width / 8)
      const on = shape.fill ?? background
      const probe = newText(id, { x: 0, y: 0, width: 10, height: 0 }, false, on)
      const lineHeight = probe.text.size * LINE_HEIGHT
      el = newText(
        id,
        { x: shape.x + inset, y: roundPoint(shape.y + shape.height / 2 - lineHeight / 2), width: Math.max(40, shape.width - inset * 2), height: 0 },
        false,
        on,
        { align: 'center', color: textColorOn(on) },
      )
    } else {
      const probe = newText(id, { x: 0, y: 0, width, height: 0 }, false, background)
      el = newText(id, { x: roundPoint(point.x), y: roundPoint(height ? point.y : point.y - probe.height / 2), width, height }, false, background)
    }
    s.actions.begin()
    previewElements((els) => [...els, el])
    s.actions.beginTextEditing(id)
  }

  /** A double-click opens a group, edits a text box's words, or starts text inside a shape. */
  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const s = store.getState()
      // Pointer capture sends the click to the stage itself, so look at what is really under the pointer.
      const under = document.elementFromPoint(e.clientX, e.clientY)
      if (s.tool !== 'select' || under?.closest('[data-text-editor]')) return
      const elements = currentElements(s)
      const hit = resolveHit(under, elements, s.scope)
      if (!hit) return
      const el = findElement(elements, hit.id)
      if (!el) return
      if (el.kind === 'group') {
        // Open the group and select the part that was double-clicked.
        const path = findPath(elements, hit.leaf)!
        const i = path.findIndex((p) => p.id === el.id)
        s.actions.select([path[i + 1].id], el.id)
        return
      }
      if (el.kind === 'text') s.actions.beginTextEditing(el.id)
      else if (el.kind === 'rect' || el.kind === 'ellipse') startTextAt(toSlide(e), { ...hit, leaf: el.id })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, toSlide],
  )

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.button !== 2) return
      const target = e.target as Element
      if (target.closest('[data-text-editor]')) return
      const s = store.getState()
      const { actions } = s
      if (s.editingTextId) actions.endTextEditing()
      const state = store.getState()
      const elements = currentElements(state)
      const point = toSlide(e)
      const hit = resolveHit(target, elements, state.scope)

      if (e.button === 2) {
        // A right-click selects what it is on, so the menu that opens acts on it.
        if (hit && !state.selection.includes(hit.id)) actions.select([hit.id], hit.scope)
        if (!hit && !insideSelection(state, point)) actions.select([], null)
        return
      }

      containerRef.current?.setPointerCapture(e.pointerId)
      const handle = target.closest('[data-handle]')?.getAttribute('data-handle')

      if (handle) {
        const selected = state.selection.map((id) => findElement(elements, id)).filter((x): x is SlideElement => !!x)
        if (handle === 'radius') {
          const rect = selected[0]
          if (rect?.kind !== 'rect') return
          actions.begin()
          gesture.current = {
            kind: 'radius',
            id: rect.id,
            start: point,
            origin: elements,
            r0: Math.min(rect.cornerRadius, Math.min(rect.width, rect.height) / 2),
            max: Math.min(rect.width, rect.height) / 2,
          }
        } else if (handle === 'p1' || handle === 'p2') {
          const line = selected[0] as LineElement
          const end = handle === 'p1' ? 1 : 2
          const at = end === 1 ? { x: line.x1, y: line.y1 } : { x: line.x2, y: line.y2 }
          actions.begin()
          gesture.current = {
            kind: 'endpoint',
            end,
            id: line.id,
            offset: { x: at.x - point.x, y: at.y - point.y },
            origin: elements,
            targets: targetsFor(state, [line.id]),
          }
        } else {
          const bounds = boundsOf(selected)
          if (!bounds) return
          const at = handlePosition(handle as Handle, bounds)
          actions.begin()
          gesture.current = {
            kind: 'resize',
            handle: handle as Handle,
            offset: { x: at.x - point.x, y: at.y - point.y },
            origin: elements,
            ids: state.selection,
            bounds,
            keep: selected.some(keepsProportions),
            targets: targetsFor(state, state.selection),
          }
        }
        patch({ activeGesture: gesture.current.kind, activeHandle: handle in HANDLE_SET ? (handle as Handle) : null, hoverId: null })
        return
      }

      if (state.tool !== 'select') {
        gesture.current = {
          kind: 'draw',
          tool: state.tool,
          start: clampToSlide(point),
          id: makeId(allIds(elements)),
          created: false,
          targets: targetsFor(state, []),
          background: state.doc.slides[state.currentSlide].background,
          over: state.tool === 'text' ? resolveHit(target, elements, null) : null,
        }
        const snapped = snapPoint(gesture.current.start, gesture.current.targets, SNAP_PX / layoutRef.current.scale, isMod(e))
        gesture.current.start = snapped.point
        patch({ activeGesture: 'draw', hoverId: null })
        return
      }

      if (hit || insideSelection(state, point)) {
        let ids = state.selection
        let collapseOnClick = false
        if (hit) {
          const selected = state.selection.includes(hit.id) && state.scope === hit.scope
          if (e.shiftKey) {
            ids = hit.scope !== state.scope ? [hit.id] : selected ? state.selection.filter((id) => id !== hit.id) : [...state.selection, hit.id]
            actions.select(ids, hit.scope)
            if (selected) return // Shift-click took it out of the selection: nothing to drag.
          } else if (!selected) {
            ids = [hit.id]
            actions.select(ids, hit.scope)
          } else {
            collapseOnClick = state.selection.length > 1
          }
        }
        const now = store.getState()
        const chosen = ids.map((id) => findElement(currentElements(now), id)).filter((x): x is SlideElement => !!x)
        const bounds = boundsOf(chosen)
        if (!bounds) return
        gesture.current = {
          kind: 'move',
          start: point,
          origin: currentElements(now),
          ids,
          bounds,
          targets: targetsFor(now, ids),
          moved: false,
          clickedId: hit?.id ?? null,
          collapseOnClick,
        }
        return
      }

      // Empty slide (or the space around it): start a selection box.
      const additive = e.shiftKey
      if (!additive) actions.select([], null)
      gesture.current = { kind: 'marquee', start: point, base: additive ? state.selection : [], additive, moved: false }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, toSlide, containerRef],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const g = gesture.current
      const s = store.getState()
      const { scale } = layoutRef.current
      const point = toSlide(e)
      const free = isMod(e) // Holding ⌘ (Ctrl) turns snapping off.
      const threshold = SNAP_PX / scale

      if (!g) {
        if (s.tool !== 'select' || e.buttons) return
        const hit = resolveHit(e.target as Element, currentElements(s), s.scope)
        const hoverId = hit && !s.selection.includes(hit.id) ? hit.id : null
        if (hoverId !== feedback.hoverId) patch({ hoverId })
        return
      }

      switch (g.kind) {
        case 'move': {
          let dx = point.x - g.start.x
          let dy = point.y - g.start.y
          if (!g.moved) {
            if (Math.hypot(dx, dy) * scale < DRAG_THRESHOLD_PX) return
            g.moved = true
            s.actions.begin()
            patch({ activeGesture: 'move', hoverId: null })
          }
          if (e.shiftKey) {
            // Shift keeps a drag to one axis.
            if (Math.abs(dx) > Math.abs(dy)) dy = 0
            else dx = 0
          }
          let guides: Guide[] = []
          if (!free) {
            const snap = snapBox({ ...g.bounds, x: g.bounds.x + dx, y: g.bounds.y + dy }, g.targets, threshold)
            if (!(e.shiftKey && dx === 0)) dx += snap.dx
            if (!(e.shiftKey && dy === 0)) dy += snap.dy
            guides = guidesTouching({ ...g.bounds, x: g.bounds.x + dx, y: g.bounds.y + dy }, g.targets)
          }
          const ddx = roundPoint(dx)
          const ddy = roundPoint(dy)
          previewElements(() => updateMany(g.origin, g.ids, (el) => translate(el, ddx, ddy)))
          patch({ guides })
          return
        }
        case 'resize': {
          let pointer = { x: point.x + g.offset.x, y: point.y + g.offset.y }
          const keepRatio = g.keep !== e.shiftKey
          if (!free) {
            const edges = movingEdges(g.handle)
            pointer = {
              x: edges.x ? snapValue(pointer.x, g.targets.xs, threshold).value : pointer.x,
              y: edges.y ? snapValue(pointer.y, g.targets.ys, threshold).value : pointer.y,
            }
          }
          const next = roundRect(resizeBox(g.handle, g.bounds, pointer, keepRatio))
          previewElements(() => updateMany(g.origin, g.ids, (el) => mapIntoFrame(el, g.bounds, next)))
          patch({ guides: free ? [] : guidesTouching(next, g.targets) })
          return
        }
        case 'endpoint': {
          const line = findElement(g.origin, g.id) as LineElement
          const fixed = g.end === 1 ? { x: line.x2, y: line.y2 } : { x: line.x1, y: line.y1 }
          let at = { x: point.x + g.offset.x, y: point.y + g.offset.y }
          if (e.shiftKey) at = snapAngle(fixed, at)
          else if (!free) at = snapPoint(at, g.targets, threshold, false).point
          const p = { x: roundPoint(at.x), y: roundPoint(at.y) }
          previewElements(() =>
            updateById(g.origin, g.id, (el) => (g.end === 1 ? { ...el, x1: p.x, y1: p.y } : { ...el, x2: p.x, y2: p.y }) as SlideElement),
          )
          patch({ guides: e.shiftKey || free ? [] : guidesTouching({ x: p.x, y: p.y, width: 0, height: 0 }, g.targets) })
          return
        }
        case 'radius': {
          const delta = (point.x - g.start.x + (point.y - g.start.y)) / 2
          const r = Math.round(clamp(g.r0 + delta, 0, g.max))
          previewElements(() => updateById(g.origin, g.id, (el) => (el.kind === 'rect' ? { ...el, cornerRadius: r } : el)))
          return
        }
        case 'draw': {
          const end = snapPoint(point, g.targets, threshold, free || e.shiftKey)
          if (!g.created) {
            if (Math.hypot(point.x - g.start.x, point.y - g.start.y) * scale < DRAG_THRESHOLD_PX) return
            g.created = true
            s.actions.begin()
          }
          const el = shapeFromDrag(g, end.point, e.shiftKey)
          previewElements((els) => (findElement(els, g.id) ? updateById(els, g.id, () => el) : [...els, el]))
          if (store.getState().selection[0] !== g.id) store.setState({ selection: [g.id], scope: null })
          patch({ guides: e.shiftKey || free ? [] : guidesTouching({ ...elementBounds(el) }, g.targets).filter((gd) => gd.at === (gd.axis === 'x' ? end.point.x : end.point.y)) })
          return
        }
        case 'marquee': {
          const box = rectFromPoints(g.start, point)
          if (!g.moved && Math.hypot(box.width, box.height) * scale < DRAG_THRESHOLD_PX) return
          g.moved = true
          const candidates = scopeElements(currentElements(s), s.scope)
          const touched = candidates.filter((el) => rectsTouch(elementBounds(el), box)).map((el) => el.id)
          const ids = g.additive ? [...new Set([...g.base, ...touched])] : touched
          if (ids.join() !== s.selection.join()) s.actions.select(ids)
          patch({ marquee: box })
          return
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, toSlide, feedback.hoverId],
  )

  const finish = useCallback(
    (cancelled: boolean) => {
      const g = gesture.current
      gesture.current = null
      const s = store.getState()
      setFeedback({ marquee: null, guides: [], hoverId: null, activeGesture: null, activeHandle: null })
      if (!g) return
      if (cancelled) {
        s.actions.cancel()
        return
      }
      switch (g.kind) {
        case 'move':
          if (g.moved) s.actions.commit()
          else if (g.collapseOnClick && g.clickedId) s.actions.select([g.clickedId])
          return
        case 'resize':
        case 'endpoint':
        case 'radius':
          s.actions.commit()
          return
        case 'draw': {
          if (!g.created) {
            // A click with a tool places a shape of a pleasant size there, or starts a text box.
            if (g.tool === 'text') {
              startTextAt(g.start, g.over)
            } else {
              const half = CLICK_SHAPE_SIZE / 2
              const el =
                g.tool === 'line'
                  ? newLine(g.id, roundPoint(g.start.x - half), roundPoint(g.start.y), roundPoint(g.start.x + half), roundPoint(g.start.y))
                  : (g.tool === 'rect' ? newRect : newEllipse)(
                      g.id,
                      { x: roundPoint(g.start.x - half), y: roundPoint(g.start.y - half), width: CLICK_SHAPE_SIZE, height: CLICK_SHAPE_SIZE },
                      false,
                    )
              s.actions.addElement(el)
            }
          } else if (g.tool === 'text') {
            // Typing into a box just dragged out is part of making it.
            s.actions.beginTextEditing(g.id)
          } else {
            s.actions.commit()
          }
          store.setState({ tool: 'select' })
          return
        }
        case 'marquee':
          return
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store],
  )

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (containerRef.current?.hasPointerCapture(e.pointerId)) containerRef.current.releasePointerCapture(e.pointerId)
      finish(false)
    },
    [finish, containerRef],
  )

  // Escape during a drag puts everything back where it was.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && gesture.current) {
        e.preventDefault()
        e.stopImmediatePropagation()
        finish(true)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [finish])

  return {
    feedback,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: () => finish(true),
      onDoubleClick,
      onPointerLeave: () => {
        if (!gesture.current && feedback.hoverId) patch({ hoverId: null })
      },
    },
  }
}

const HANDLE_SET = new Set(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'])

function insideSelection(s: EditorState, p: Point): boolean {
  const elements = currentElements(s)
  const bounds = boundsOf(s.selection.map((id) => findElement(elements, id)).filter((x): x is SlideElement => !!x))
  return !!bounds && p.x >= bounds.x && p.x <= bounds.x + bounds.width && p.y >= bounds.y && p.y <= bounds.y + bounds.height
}

function clampToSlide(p: Point): Point {
  return { x: clamp(p.x, -SLIDE_WIDTH, SLIDE_WIDTH * 2), y: clamp(p.y, -SLIDE_HEIGHT, SLIDE_HEIGHT * 2) }
}

function snapPoint(p: Point, targets: SnapTargets, threshold: number, off: boolean): { point: Point } {
  if (off) return { point: p }
  return { point: { x: snapValue(p.x, targets.xs, threshold).value, y: snapValue(p.y, targets.ys, threshold).value } }
}

function roundRect(r: Rect): Rect {
  return { x: roundPoint(r.x), y: roundPoint(r.y), width: roundPoint(r.width), height: roundPoint(r.height) }
}

/** The shape a drawing drag describes. Shift makes it a square or circle, or keeps a line to 45° steps. */
function shapeFromDrag(g: Extract<Gesture, { kind: 'draw' }>, end: Point, shift: boolean): SlideElement {
  if (g.tool === 'line') {
    const to = shift ? snapAngle(g.start, end) : end
    return newLine(g.id, roundPoint(g.start.x), roundPoint(g.start.y), roundPoint(to.x), roundPoint(to.y))
  }
  let corner = end
  if (shift) {
    const side = Math.max(Math.abs(end.x - g.start.x), Math.abs(end.y - g.start.y))
    corner = { x: g.start.x + Math.sign(end.x - g.start.x || 1) * side, y: g.start.y + Math.sign(end.y - g.start.y || 1) * side }
  }
  const box = roundRect(rectFromPoints(g.start, corner))
  box.width = Math.max(1, box.width)
  box.height = Math.max(1, box.height)
  if (g.tool === 'rect') return newRect(g.id, box, shift)
  if (g.tool === 'ellipse') return newEllipse(g.id, box, shift)
  return newText(g.id, { ...box, width: Math.max(40, box.width) }, shift, g.background)
}
