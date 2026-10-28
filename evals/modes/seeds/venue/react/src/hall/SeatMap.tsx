import {
  memo,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import type { SeatMap as SeatMapData } from '../api'
import { formatMoney, formatPriceShort } from '../format'
import { useMediaQuery } from '../useMediaQuery'
import { layoutHall, type HallLayout } from './layout'
import styles from './SeatMap.module.css'

type SeatState = 'free' | 'mine' | 'sold'

type Props = {
  seatMap: SeatMapData
  sold: ReadonlySet<string>
  selected: readonly string[]
  /** Seats just taken from this person's choice, briefly marked so they see them go. */
  lost: ReadonlySet<string>
  onToggle: (seatId: string) => void
}

/** Below this many pixels per seat the whole house can't be tapped accurately. */
const MIN_TAPPABLE_PITCH = 16
/** Pixels per seat when zoomed in on a phone: a thumb-sized target. */
const ZOOM_PITCH = 38
const MAX_PITCH = 24

export function SeatMap({ seatMap, sold, selected, lost, onToggle }: Props) {
  const layout = useMemo(() => layoutHall(seatMap), [seatMap])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    // Height available below the map's top edge, with the page scrolled to the top.
    const update = () =>
      setSize({
        width: el.clientWidth,
        height: window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - 24,
      })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  const fitWidth = size.width / layout.width
  // At a desk, fit the house to the window so it can be read at a glance.
  const fitHeight = size.height / layout.height
  const compact = size.width > 0 && fitWidth < MIN_TAPPABLE_PITCH
  const [zoomed, setZoomed] = useState(false)
  const pitch = !size.width
    ? 0
    : compact
      ? zoomed
        ? ZOOM_PITCH
        : fitWidth
      : Math.max(MIN_TAPPABLE_PITCH, Math.min(fitWidth, fitHeight, MAX_PITCH))
  const overview = compact && !zoomed

  // What part of the house is in view, in seat units, for the mini-map.
  const [view, setView] = useState({ x: 0, y: 0, width: 0, height: 0 })

  // Where to centre the view after zooming in, in seat units.
  const zoomTarget = useRef<{ x: number; y: number; from: number } | null>(null)

  useLayoutEffect(() => {
    const target = zoomTarget.current
    const viewport = viewportRef.current
    const layer = layerRef.current
    if (!target || !viewport || !layer || !zoomed) return
    zoomTarget.current = null
    // Give the house the screen: bring its top up under the page header.
    const header = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0
    window.scrollBy({ top: viewport.getBoundingClientRect().top - header - 8 })
    viewport.scrollLeft = target.x * pitch - viewport.clientWidth / 2
    viewport.scrollTop = target.y * pitch - viewport.clientHeight / 2
    setView(viewOf(viewport, pitch))
    if (!reduceMotion) {
      // Grow out of the point that was tapped, so it's clear where we are. (The layer
      // inside the canvas is what scales, so the scrollable area keeps its size.)
      layer.style.transformOrigin = `${target.x * pitch}px ${target.y * pitch}px`
      layer.animate(
        [
          { transform: `scale(${target.from / pitch})`, opacity: 0.6 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' },
      )
    }
  }, [zoomed, pitch, reduceMotion])

  const zoomTo = useCallback(
    (x: number, y: number) => {
      zoomTarget.current = { x, y, from: pitch }
      setZoomed(true)
    },
    [pitch],
  )

  const viewFrame = useRef(0)
  function handleScroll() {
    if (!compact || !zoomed) return
    cancelAnimationFrame(viewFrame.current)
    viewFrame.current = requestAnimationFrame(() => {
      if (viewportRef.current) setView(viewOf(viewportRef.current, pitch))
    })
  }

  // Remember how the last click began: a thumb on the whole-house view zooms in
  // rather than choosing, because at that size it can't be sure which seat it meant.
  const pointerType = useRef<string | null>(null)

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const touch = pointerType.current === 'touch' || pointerType.current === 'pen'
    pointerType.current = null
    if (overview && touch) {
      const rect = event.currentTarget.getBoundingClientRect()
      zoomTo((event.clientX - rect.left) / pitch, (event.clientY - rect.top) / pitch)
      return
    }
    const seat = (event.target as HTMLElement).closest<HTMLElement>('[data-seat]')
    if (!seat || seat.getAttribute('aria-disabled') === 'true') return
    onToggle(seat.dataset.seat!)
  }

  // Keyboard: the house is one tab stop; arrows move seat to seat as they sit.
  const [focusId, setFocusId] = useState<string | null>(null)
  const tabbableId = focusId ?? defaultFocus(layout, sold)

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = (event.target as HTMLElement).dataset?.seat
    if (!current) return
    const next = neighbour(layout, current, event.key)
    if (!next) return
    event.preventDefault()
    setFocusId(next)
    canvasRef.current?.querySelector<HTMLElement>(`[data-seat="${CSS.escape(next)}"]`)?.focus()
  }

  const descId = useId()

  return (
    <div className={styles.house} data-overview={overview || undefined}>
      <div
        ref={viewportRef}
        className={styles.viewport}
        data-compact={compact || undefined}
        data-zoomed={(compact && zoomed) || undefined}
        onScroll={handleScroll}
      >
        <div
          ref={canvasRef}
          className={styles.canvas}
          style={
            {
              '--pitch': `${pitch}px`,
              width: layout.width * pitch,
              height: layout.height * pitch,
            } as CSSProperties
          }
          onPointerDown={(e) => (pointerType.current = e.pointerType)}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            const id = (e.target as HTMLElement).dataset?.seat
            if (id) setFocusId(id)
          }}
        >
          <div ref={layerRef} className={styles.layer}>
            <Room layout={layout} seatMap={seatMap} />
            {seatMap.sections.map((section) => (
              <div
                key={section.key}
                role="group"
                aria-label={`${section.name}, ${formatMoney(section.priceCents)} a seat`}
              >
                {section.rows.map((row) => (
                  <div key={row.name} role="group" aria-label={`${section.name}, row ${row.name}`}>
                    {row.seats.map((seat) => {
                      const placed = layout.seats.get(seat.id)!
                      const state: SeatState = sold.has(seat.id)
                        ? 'sold'
                        : selectedSet.has(seat.id)
                          ? 'mine'
                          : 'free'
                      return (
                        <SeatButton
                          key={seat.id}
                          id={seat.id}
                          name={`${section.name}, row ${row.name}, seat ${seat.number}`}
                          sectionKey={section.key}
                          x={placed.x}
                          y={placed.y}
                          angle={placed.angle}
                          state={state}
                          lost={lost.has(seat.id)}
                          tabbable={seat.id === tabbableId}
                          describedBy={`${descId}-${section.key}-${state}`}
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Shared descriptions: what each seat costs and whether it's free. */}
      <div hidden>
        {seatMap.sections.map((s) => {
          const cost = `${formatMoney(s.priceCents)} plus ${formatMoney(s.feeCents)} booking fee`
          return (
            <span key={s.key}>
              <span id={`${descId}-${s.key}-free`}>{cost}. Free.</span>
              <span id={`${descId}-${s.key}-mine`}>{cost}. In your choice.</span>
              <span id={`${descId}-${s.key}-sold`}>Sold.</span>
            </span>
          )
        })}
      </div>

      {compact && (
        <div className={styles.zoomBar}>
          {zoomed ? (
            <button
              type="button"
              className={`${styles.zoomButton} ${styles.miniMapButton}`}
              onClick={() => setZoomed(false)}
            >
              <MiniMap layout={layout} view={view} />
              <span className={styles.miniMapLabel}>
                <ZoomOutIcon /> Whole house
              </span>
            </button>
          ) : (
            <button
              type="button"
              className={styles.zoomButton}
              onClick={() => zoomTo(layout.width / 2, layout.height * 0.3)}
            >
              <ZoomInIcon /> Zoom in
            </button>
          )}
        </div>
      )}
    </div>
  )
}

type SeatButtonProps = {
  id: string
  name: string
  sectionKey: string
  x: number
  y: number
  angle: number
  state: SeatState
  lost: boolean
  tabbable: boolean
  describedBy: string
}

const SeatButton = memo(function SeatButton(props: SeatButtonProps) {
  const { id, name, sectionKey, x, y, angle, state, lost, tabbable, describedBy } = props
  return (
    <button
      type="button"
      className={styles.seat}
      data-seat={id}
      data-state={state}
      data-section={sectionKey}
      data-lost={lost || undefined}
      style={{ '--x': x, '--y': y, '--a': `${angle}deg` } as CSSProperties}
      aria-label={name}
      aria-pressed={state === 'mine'}
      aria-disabled={state === 'sold' || undefined}
      aria-describedby={describedBy}
      tabIndex={tabbable ? 0 : -1}
    >
      <span className={styles.chair} aria-hidden="true">
        {state === 'mine' && (
          <svg viewBox="0 0 12 12" className={styles.check}>
            <path d="M2.5 6.2 5 8.6 9.6 3.6" />
          </svg>
        )}
      </span>
    </button>
  )
})

/** The room itself: stage, the raised tiers, their names and prices, row letters. */
const Room = memo(function Room({ layout, seatMap }: { layout: HallLayout; seatMap: SeatMapData }) {
  const sections = new Map(seatMap.sections.map((s) => [s.key, s]))
  return (
    <svg
      className={styles.room}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      aria-hidden="true"
      focusable="false"
    >
      <g transform={`translate(${layout.offset.x} ${layout.offset.y})`}>
        <path d={layout.stage.path} className={styles.stage} />
        <text x={layout.stage.label.x} y={layout.stage.label.y} className={styles.stageLabel}>
          STAGE
        </text>
        {layout.platforms.map((p) => {
          const section = sections.get(p.sectionKey)!
          return (
            <g key={p.sectionKey}>
              <path d={p.path} className={styles.platform} data-level={p.level} />
              <text x={p.label.x} y={p.label.y} className={styles.sectionLabel}>
                <tspan className={styles.sectionName}>{section.name.toUpperCase()}</tspan>
                <tspan
                  className={styles.sectionPrice}
                >{`  ${formatPriceShort(section.priceCents)}`}</tspan>
              </text>
            </g>
          )
        })}
        {layout.rows.map((row) =>
          row.labels.map((label, i) => (
            <text
              key={`${row.sectionKey}-${row.name}-${i}`}
              x={label.x}
              y={label.y}
              transform={`rotate(${label.angle} ${label.x} ${label.y})`}
              className={styles.rowLabel}
            >
              {row.name}
            </text>
          )),
        )}
      </g>
    </svg>
  )
})

function viewOf(viewport: HTMLElement, pitch: number) {
  return {
    x: viewport.scrollLeft / pitch,
    y: viewport.scrollTop / pitch,
    width: viewport.clientWidth / pitch,
    height: viewport.clientHeight / pitch,
  }
}

/** The whole house in miniature, with the part in view outlined. */
function MiniMap({
  layout,
  view,
}: {
  layout: HallLayout
  view: { x: number; y: number; width: number; height: number }
}) {
  return (
    <svg
      className={styles.miniMap}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      aria-hidden="true"
    >
      <g transform={`translate(${layout.offset.x} ${layout.offset.y})`}>
        <path d={layout.stage.path} className={styles.stage} />
        {layout.platforms.map((p) => (
          <path key={p.sectionKey} d={p.path} className={styles.miniPlatform} />
        ))}
      </g>
      <rect
        x={Math.max(0, view.x)}
        y={Math.max(0, view.y)}
        width={Math.min(view.width, layout.width)}
        height={Math.min(view.height, layout.height)}
        rx={0.8}
        className={styles.miniView}
      />
    </svg>
  )
}

function defaultFocus(layout: HallLayout, sold: ReadonlySet<string>): string {
  // The best free seat: front-most row with one, nearest the centre.
  for (const row of layout.rows) {
    const free = row.seatIds.filter((id) => !sold.has(id))
    if (free.length) {
      const mid = layout.width / 2
      return free.reduce((a, b) =>
        Math.abs(layout.seats.get(a)!.x - mid) <= Math.abs(layout.seats.get(b)!.x - mid) ? a : b,
      )
    }
  }
  return layout.rows[0].seatIds[0]
}

function neighbour(layout: HallLayout, seatId: string, key: string): string | null {
  const seat = layout.seats.get(seatId)
  if (!seat) return null
  const row = layout.rows[seat.rowIndex]
  const i = row.seatIds.indexOf(seatId)
  switch (key) {
    case 'ArrowLeft':
      return row.seatIds[i - 1] ?? null
    case 'ArrowRight':
      return row.seatIds[i + 1] ?? null
    case 'Home':
      return row.seatIds[0]
    case 'End':
      return row.seatIds[row.seatIds.length - 1]
    case 'ArrowUp':
    case 'ArrowDown': {
      const other = layout.rows[seat.rowIndex + (key === 'ArrowUp' ? -1 : 1)]
      if (!other) return null
      return other.seatIds.reduce((a, b) =>
        Math.abs(layout.seats.get(a)!.x - seat.x) <= Math.abs(layout.seats.get(b)!.x - seat.x)
          ? a
          : b,
      )
    }
    default:
      return null
  }
}

function ZoomInIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.icon}>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.5 12.5 17 17M6 8.5h5M8.5 6v5" />
    </svg>
  )
}

function ZoomOutIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.icon}>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M12.5 12.5 17 17M6 8.5h5" />
    </svg>
  )
}
