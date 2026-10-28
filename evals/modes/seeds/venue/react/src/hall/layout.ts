import type { SeatMap } from '../api'

/**
 * Lays the hall out as a room: every row is an arc around a point behind the
 * stage, so the seats fan out and turn to face it. Units are seat pitches; the
 * map scales them to pixels.
 *
 * Seats arrive "left to right as seen from the stage". The stage is drawn at
 * the top, facing down the screen, so the stage's left is the screen's right.
 */

const FOCUS = 16 // distance from the stage front to the point rows curve around
const FIRST_ROW = 2.8 // stage front to the first row of the orchestra
const ROW_STEP = 1.14
const SECTION_GAP = 2.1 // room for a section's name between tiers
const MARGIN = 1.2

export type PlacedSeat = {
  id: string
  x: number
  y: number
  /** Degrees; turns the seat to face the stage. */
  angle: number
  rowIndex: number
}

export type PlacedRow = {
  sectionKey: string
  name: string
  /** Seat ids in screen order, left to right. */
  seatIds: string[]
  labels: { x: number; y: number; angle: number }[]
}

export type Platform = {
  sectionKey: string
  level: number
  path: string
  label: { x: number; y: number }
}

export type HallLayout = {
  width: number
  height: number
  seats: Map<string, PlacedSeat>
  rows: PlacedRow[]
  platforms: Platform[]
  stage: { path: string; label: { x: number; y: number } }
  /** Seats are placed from the top-left corner; the room's drawing (platforms, stage, row
   *  letters) keeps its own coordinates and is translated by this. */
  offset: { x: number; y: number }
}

type Point = { x: number; y: number }

// Polar → cartesian around the focus. phi = 0 points straight down the hall.
function polar(r: number, phi: number): Point {
  return { x: r * Math.sin(phi), y: -FOCUS + r * Math.cos(phi) }
}

const f = (n: number) => n.toFixed(3)

/**
 * A tier's floor: an arc in front of its first row and behind its last, joined
 * down each side by the ends of its rows, so it follows the rows' real lengths.
 */
function platformPath(rows: { r: number; half: number }[], pad: number): string {
  const first = rows[0]
  const last = rows[rows.length - 1]
  const r0 = first.r - pad
  const r1 = last.r + pad
  const side = (sign: number) => rows.map(({ r, half }) => polar(r, sign * (half + pad / r)))
  const right = side(1)
  const left = side(-1).reverse()
  const frontL = polar(r0, -(first.half + pad / first.r))
  const frontR = polar(r0, first.half + pad / first.r)
  const backR = polar(r1, last.half + pad / last.r)
  const backL = polar(r1, -(last.half + pad / last.r))
  return [
    `M${f(frontL.x)} ${f(frontL.y)}`,
    `A${f(r0)} ${f(r0)} 0 0 0 ${f(frontR.x)} ${f(frontR.y)}`,
    ...right.map((p) => `L${f(p.x)} ${f(p.y)}`),
    `L${f(backR.x)} ${f(backR.y)}`,
    `A${f(r1)} ${f(r1)} 0 0 1 ${f(backL.x)} ${f(backL.y)}`,
    ...left.map((p) => `L${f(p.x)} ${f(p.y)}`),
    'Z',
  ].join(' ')
}

export function layoutHall(map: SeatMap): HallLayout {
  const seats = new Map<string, PlacedSeat>()
  const rows: PlacedRow[] = []
  const platforms: Platform[] = []
  const points: Point[] = []

  let r = FOCUS + FIRST_ROW
  map.sections.forEach((section, level) => {
    if (level > 0) r += SECTION_GAP
    const rFirst = r
    const extents: { r: number; half: number }[] = []

    section.rows.forEach((row, i) => {
      if (i > 0) r += ROW_STEP
      const n = row.seats.length
      const step = 1 / r // one pitch of arc length

      const placed = row.seats.map((seat, j) => {
        const phi = ((n - 1) / 2 - j) * step
        const p = polar(r, phi)
        points.push(p)
        const s: PlacedSeat = {
          id: seat.id,
          x: p.x,
          y: p.y,
          angle: (-phi * 180) / Math.PI,
          rowIndex: rows.length,
        }
        seats.set(seat.id, s)
        return s
      })

      // Row letters sit just beyond each end of the row.
      extents.push({ r, half: ((n - 1) / 2) * step + 1.1 / r })
      const endPhi = ((n - 1) / 2) * step + 1.05 / r
      const labels = [-endPhi, endPhi].map((phi) => {
        const p = polar(r, phi)
        points.push(p)
        return { ...p, angle: (-phi * 180) / Math.PI }
      })

      rows.push({
        sectionKey: section.key,
        name: row.name,
        seatIds: [...placed].sort((a, b) => a.x - b.x).map((s) => s.id),
        labels,
      })
    })

    const pad = 0.7
    platforms.push({
      sectionKey: section.key,
      level,
      path: platformPath(extents, pad),
      label: polar(rFirst - SECTION_GAP / 2 - 0.15, 0),
    })
    for (const { r: er, half } of extents)
      points.push(polar(er, half + pad / er), polar(er, -(half + pad / er)))
    points.push(polar(r + pad, 0))
  })

  // The stage: a deep apron whose curved front faces the house.
  const stageHalf = 0.62
  const front = FOCUS
  const back = -3.2
  const l = polar(front, -stageHalf)
  const rt = polar(front, stageHalf)
  const stagePath = `M${l.x} ${back} L${l.x} ${l.y} A${front} ${front} 0 0 0 ${rt.x} ${rt.y} L${rt.x} ${back} Z`
  points.push({ x: l.x, y: back }, { x: rt.x, y: back })

  const minX = Math.min(...points.map((p) => p.x)) - MARGIN
  const maxX = Math.max(...points.map((p) => p.x)) + MARGIN
  const minY = back // the stage runs off the top edge
  const maxY = Math.max(...points.map((p) => p.y)) + MARGIN

  // Shift everything so the origin is the top-left corner.
  const dx = -minX
  const dy = -minY
  for (const s of seats.values()) {
    s.x += dx
    s.y += dy
  }

  return {
    width: maxX - minX,
    height: maxY - minY,
    seats,
    rows,
    platforms,
    stage: { path: stagePath, label: { x: 0, y: back / 2 } },
    offset: { x: dx, y: dy },
  }
}
