import { SLIDE_HEIGHT, SLIDE_WIDTH, type SlideElement } from '../../api/types'
import { boundsOf, elementBounds, findElement } from '../../model/elements'
import type { Rect } from '../../model/geometry'
import { HANDLE_CURSORS, HANDLES, handlePosition, type Handle } from '../../model/resize'
import { currentElements, useEditor } from '../store'
import type { StageFeedback } from './useGestures'
import type { StageLayout } from './useStageLayout'
import styles from './Stage.module.css'

/** Visible size of a handle, and the larger square that catches the pointer, in screen pixels. */
const HANDLE_SIZE = 10
const HANDLE_HIT = 22

/**
 * Everything drawn over the slide that isn't part of it: the selection with its handles, the hover
 * outline, snapping guides, the selection box and the size readout. It is drawn in screen pixels so
 * handles stay the same comfortable size at any zoom, and every outline is doubled (white beneath,
 * violet above) so it reads on a slide of any colour.
 */
export function SelectionOverlay({ layout, feedback }: { layout: StageLayout; feedback: StageFeedback }) {
  const elements = useEditor(currentElements)
  const selection = useEditor((s) => s.selection)
  const scope = useEditor((s) => s.scope)
  const editing = useEditor((s) => s.editingTextId)
  const { scale, originX, originY } = layout

  const toScreen = (r: Rect): Rect => ({
    x: originX + r.x * scale,
    y: originY + r.y * scale,
    width: r.width * scale,
    height: r.height * scale,
  })
  const px = (x: number) => originX + x * scale
  const py = (y: number) => originY + y * scale

  const selected = selection.map((id) => findElement(elements, id)).filter((el): el is SlideElement => !!el)
  const bounds = boundsOf(selected)
  const single = selected.length === 1 ? selected[0] : null
  const scopeEl = scope ? findElement(elements, scope) : null
  const hover = feedback.hoverId ? findElement(elements, feedback.hoverId) : null
  const moving = feedback.activeGesture === 'move'
  const showHandles = !!bounds && !editing && !moving && feedback.activeGesture !== 'draw' && feedback.activeGesture !== 'marquee'

  return (
    <svg className={styles.overlay} width={layout.width} height={layout.height} aria-hidden="true">
      {scopeEl ? <Outline rect={toScreen(elementBounds(scopeEl))} dashed /> : null}

      {hover && !moving ? <ElementOutline el={hover} toScreen={toScreen} px={px} py={py} faint /> : null}

      {selected.map((el) => (
        <ElementOutline key={el.id} el={el} toScreen={toScreen} px={px} py={py} />
      ))}
      {bounds && selected.length > 1 ? <Outline rect={toScreen(bounds)} /> : null}

      {feedback.guides.map((g, i) =>
        g.axis === 'x' ? (
          <line key={i} className={styles.guide} x1={px(g.at)} x2={px(g.at)} y1={py(0) - 12} y2={py(SLIDE_HEIGHT) + 12} />
        ) : (
          <line key={i} className={styles.guide} x1={px(0) - 12} x2={px(SLIDE_WIDTH) + 12} y1={py(g.at)} y2={py(g.at)} />
        ),
      )}

      {showHandles && single?.kind === 'line' ? (
        <>
          <PointHandle id="p1" x={px(single.x1)} y={py(single.y1)} />
          <PointHandle id="p2" x={px(single.x2)} y={py(single.y2)} />
        </>
      ) : showHandles && bounds ? (
        <BoxHandles rect={toScreen(bounds)} active={feedback.activeHandle} />
      ) : null}

      {showHandles && single?.kind === 'rect' ? <RadiusHandle el={single} px={px} py={py} scale={scale} /> : null}

      {feedback.marquee ? <rect className={styles.marquee} {...toScreen(feedback.marquee)} /> : null}

      {bounds && (feedback.activeGesture === 'resize' || feedback.activeGesture === 'draw' || feedback.activeGesture === 'radius') ? (
        <SizeReadout
          rect={toScreen(bounds)}
          text={
            feedback.activeGesture === 'radius' && single?.kind === 'rect'
              ? `Radius ${Math.round(Math.min(single.cornerRadius, single.width / 2, single.height / 2))}`
              : single?.kind === 'line'
                ? `${Math.round(Math.hypot(single.x2 - single.x1, single.y2 - single.y1))} pt`
                : `${Math.round(bounds.width)} × ${Math.round(bounds.height)}`
          }
        />
      ) : null}
    </svg>
  )
}

function Outline({ rect, dashed, faint }: { rect: Rect; dashed?: boolean; faint?: boolean }) {
  return (
    <g className={faint ? styles.faint : undefined}>
      <rect className={styles.outlineUnder} x={rect.x} y={rect.y} width={rect.width} height={rect.height} />
      <rect
        className={dashed ? styles.outlineDashed : styles.outline}
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
      />
    </g>
  )
}

function ElementOutline({
  el,
  toScreen,
  px,
  py,
  faint,
}: {
  el: SlideElement
  toScreen: (r: Rect) => Rect
  px: (x: number) => number
  py: (y: number) => number
  faint?: boolean
}) {
  if (el.kind === 'line') {
    return (
      <g className={faint ? styles.faint : undefined}>
        <line className={styles.outlineUnder} x1={px(el.x1)} y1={py(el.y1)} x2={px(el.x2)} y2={py(el.y2)} />
        <line className={styles.outline} x1={px(el.x1)} y1={py(el.y1)} x2={px(el.x2)} y2={py(el.y2)} />
      </g>
    )
  }
  return <Outline rect={toScreen(elementBounds(el))} faint={faint} />
}

function BoxHandles({ rect, active }: { rect: Rect; active: Handle | null }) {
  // Side handles crowd a small box; below this size only the corners are offered.
  const roomy = rect.width > 40 && rect.height > 40
  const handles = HANDLES.filter((h) => h.length === 2 || roomy || (h === 'e' || h === 'w' ? rect.width > 40 : rect.height > 40))
  return (
    <>
      {handles.map((h) => {
        const p = handlePosition(h, rect)
        return (
          <g key={h} data-handle={h} className={styles.handle} style={{ cursor: HANDLE_CURSORS[h] }} data-active={active === h ? '' : undefined}>
            <rect className={styles.handleHit} x={p.x - HANDLE_HIT / 2} y={p.y - HANDLE_HIT / 2} width={HANDLE_HIT} height={HANDLE_HIT} />
            <rect
              className={styles.handleBox}
              x={p.x - HANDLE_SIZE / 2}
              y={p.y - HANDLE_SIZE / 2}
              width={HANDLE_SIZE}
              height={HANDLE_SIZE}
              rx={2.5}
            />
          </g>
        )
      })}
    </>
  )
}

function PointHandle({ id, x, y }: { id: string; x: number; y: number }) {
  return (
    <g data-handle={id} className={styles.handle} style={{ cursor: 'crosshair' }}>
      <circle className={styles.handleHit} cx={x} cy={y} r={HANDLE_HIT / 2} />
      <circle className={styles.handleBox} cx={x} cy={y} r={HANDLE_SIZE / 2 + 0.5} />
    </g>
  )
}

/**
 * The corner-rounding handle, inside the top-left corner. It sits at the radius, but never closer
 * to the corner than it can be grabbed, so square corners can still be rounded by dragging.
 */
function RadiusHandle({
  el,
  px,
  py,
  scale,
}: {
  el: Extract<SlideElement, { kind: 'rect' }>
  px: (x: number) => number
  py: (y: number) => number
  scale: number
}) {
  const max = Math.min(el.width, el.height) / 2
  if (max * scale < 28) return null
  const r = Math.min(el.cornerRadius, max)
  // At the centre of the corner's arc, so it travels with the pointer as the radius changes.
  const at = Math.min(Math.max(r, 14 / scale), max)
  const x = px(el.x + at)
  const y = py(el.y + at)
  return (
    <g data-handle="radius" className={styles.handle} style={{ cursor: 'pointer' }}>
      <title>Drag to round the corners</title>
      <circle className={styles.handleHit} cx={x} cy={y} r={HANDLE_HIT / 2} />
      <circle className={styles.radiusHandle} cx={x} cy={y} r={4.5} />
    </g>
  )
}

function SizeReadout({ rect, text }: { rect: Rect; text: string }) {
  const width = text.length * 7 + 16
  const x = rect.x + rect.width / 2 - width / 2
  const y = rect.y + rect.height + 12
  return (
    <g className={styles.readout}>
      <rect x={x} y={y} width={width} height={22} rx={11} />
      <text x={x + width / 2} y={y + 15} textAnchor="middle">
        {text}
      </text>
    </g>
  )
}
