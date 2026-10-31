import type { SeatMap } from "../api/types";

/*
 * The Grand Hall drawn as a room: every row is an arc around the stage, so the
 * seats fan out and face it. Distances are in "seat units" — one seat's width —
 * and are scaled to pixels by whoever draws them.
 */

const FRONT_ROW_RADIUS = 14;
const ROW_DEPTH = 1.2;
const SEAT_PITCH = 1.08;
/** The aisle between sections, wide enough for the section's name. */
const SECTION_GAP = 2.8;
const STAGE_FRONT = FRONT_ROW_RADIUS - 2.8;
const STAGE_DEPTH = 4.2;
const MARGIN = 0.9;

export type SeatPlacement = {
  x: number;
  y: number;
  /** Degrees; the seat turned to face the stage. */
  angle: number;
  sectionIndex: number;
  rowIndex: number;
};

export type SectionBand = {
  key: string;
  name: string;
  priceCents: number;
  /** An SVG path for the floor the section sits on. */
  path: string;
  /** Where the section's name is written, in the aisle in front of it. */
  label: { x: number; y: number };
  /** The front edge of a raised tier: its rail. */
  rail: string | null;
};

export type RowLabel = { key: string; name: string; x: number; y: number };

export type NavRow = { seatIds: string[]; xs: number[] };

export type HallLayout = {
  width: number;
  height: number;
  seats: Map<string, SeatPlacement>;
  bands: SectionBand[];
  rowLabels: RowLabel[];
  stage: { path: string; label: { x: number; y: number } };
  /** Rows front to back across the whole house, for moving with the keyboard. */
  navRows: NavRow[];
};

const point = (radius: number, theta: number) => ({
  x: radius * Math.sin(theta),
  y: radius * Math.cos(theta),
});

function annulus(inner: number, outer: number, halfAngle: number) {
  const a = point(outer, -halfAngle);
  const b = point(outer, halfAngle);
  const c = point(inner, halfAngle);
  const d = point(inner, -halfAngle);
  return { a, b, c, d, inner, outer };
}

export function layoutHall(map: SeatMap): HallLayout {
  const seats = new Map<string, SeatPlacement>();
  const rowLabels: RowLabel[] = [];
  const navRows: NavRow[] = [];
  const rawBands: {
    key: string;
    name: string;
    priceCents: number;
    inner: number;
    outer: number;
    /** Each row's radius and the half-angle its seats and labels reach to. */
    edges: { radius: number; angle: number }[];
    raised: boolean;
  }[] = [];

  let radius = FRONT_ROW_RADIUS;
  map.sections.forEach((section, sectionIndex) => {
    const front = radius;
    const edges: { radius: number; angle: number }[] = [];
    section.rows.forEach((row, rowIndex) => {
      const step = SEAT_PITCH / radius;
      const middle = (row.seats.length - 1) / 2;
      const nav: NavRow = { seatIds: [], xs: [] };
      row.seats.forEach((seat, i) => {
        const theta = (i - middle) * step;
        const { x, y } = point(radius, theta);
        seats.set(seat.id, { x, y, angle: (-theta * 180) / Math.PI, sectionIndex, rowIndex });
        nav.seatIds.push(seat.id);
        nav.xs.push(x);
      });
      navRows.push(nav);
      const edge = (middle + 1.15) * step;
      edges.push({ radius, angle: edge + 0.55 / radius });
      for (const side of [-1, 1]) {
        const { x, y } = point(radius, side * edge);
        rowLabels.push({ key: `${section.key}-${row.name}-${side}`, name: row.name, x, y });
      }
      radius += ROW_DEPTH;
    });
    const back = radius - ROW_DEPTH;
    rawBands.push({
      key: section.key,
      name: section.name,
      priceCents: section.priceCents,
      inner: front - 0.6,
      outer: back + 0.6,
      edges,
      raised: sectionIndex > 0,
    });
    radius = back + SECTION_GAP;
  });

  // Bounds of everything drawn, so the room can be shifted to start at 0,0.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const include = (x: number, y: number) => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  for (const s of seats.values()) {
    include(s.x - 0.6, s.y - 0.6);
    include(s.x + 0.6, s.y + 0.6);
  }
  for (const l of rowLabels) include(l.x, l.y);
  for (const band of rawBands) {
    for (const { radius: r, angle } of band.edges) {
      const p = point(r, angle);
      include(-p.x, p.y);
      include(p.x, p.y);
    }
    include(0, band.outer);
  }
  const stageHalf = 0.62;
  const stageBack = STAGE_FRONT - STAGE_DEPTH;
  include(0, stageBack);

  minX -= MARGIN; maxX += MARGIN; minY -= MARGIN; maxY += MARGIN;
  const dx = -minX, dy = -minY;
  const f = (n: number) => n.toFixed(3);

  for (const s of seats.values()) { s.x += dx; s.y += dy; }
  for (const l of rowLabels) { l.x += dx; l.y += dy; }
  for (const row of navRows) row.xs = row.xs.map((x) => x + dx);

  // A section's floor follows its rows: a curved front and back, and sides
  // that step out as the rows lengthen.
  const outline = (band: (typeof rawBands)[number]) => {
    const first = band.edges[0];
    const last = band.edges[band.edges.length - 1];
    const at = (r: number, theta: number) => {
      const p = point(r, theta);
      return `${f(p.x + dx)} ${f(p.y + dy)}`;
    };
    const frontAngle = (first.angle * first.radius) / band.inner;
    const backAngle = (last.angle * last.radius) / band.outer;
    return [
      `M${at(band.inner, -frontAngle)}`,
      `A${f(band.inner)} ${f(band.inner)} 0 0 0 ${at(band.inner, frontAngle)}`,
      ...band.edges.map((e) => `L${at(e.radius, e.angle)}`),
      `L${at(band.outer, backAngle)}`,
      `A${f(band.outer)} ${f(band.outer)} 0 0 1 ${at(band.outer, -backAngle)}`,
      ...[...band.edges].reverse().map((e) => `L${at(e.radius, -e.angle)}`),
      "Z",
    ].join(" ");
  };

  const bands: SectionBand[] = rawBands.map((band) => {
    const first = band.edges[0];
    const g = annulus(band.inner, band.inner, (first.angle * first.radius) / band.inner);
    return {
      key: band.key,
      name: band.name,
      priceCents: band.priceCents,
      path: outline(band),
      label: { x: dx, y: band.inner - 0.8 + dy },
      rail: band.raised
        ? `M${f(g.d.x + dx)} ${f(g.d.y + dy)} A${f(band.inner)} ${f(band.inner)} 0 0 0 ${f(g.c.x + dx)} ${f(g.c.y + dy)}`
        : null,
    };
  });

  // The stage: a lit apron whose curved front edge the front rows follow.
  const front = annulus(STAGE_FRONT, STAGE_FRONT, stageHalf);
  const stagePath = [
    `M${f(front.d.x + dx)} ${f(stageBack + dy)}`,
    `L${f(front.c.x + dx)} ${f(stageBack + dy)}`,
    `L${f(front.c.x + dx)} ${f(front.c.y + dy)}`,
    `A${f(STAGE_FRONT)} ${f(STAGE_FRONT)} 0 0 1 ${f(front.d.x + dx)} ${f(front.d.y + dy)}`,
    "Z",
  ].join(" ");

  return {
    width: maxX - minX,
    height: maxY - minY,
    seats,
    bands,
    rowLabels,
    stage: { path: stagePath, label: { x: dx, y: (stageBack + STAGE_FRONT) / 2 + dy } },
    navRows,
  };
}
