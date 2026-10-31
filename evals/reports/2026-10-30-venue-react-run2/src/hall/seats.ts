import type { Seat, SeatMap, Section } from "../api/types";
import { seatLabel } from "../format";

export type SeatInfo = { seat: Seat; section: Section; row: string; label: string };

export function indexSeats(map: SeatMap) {
  const index = new Map<string, SeatInfo>();
  for (const section of map.sections)
    for (const row of section.rows)
      for (const seat of row.seats)
        index.set(seat.id, { seat, section, row: row.name, label: seatLabel(section.name, row.name, seat.number) });
  return index;
}

/** The chosen seats, in the order they sit in the house, front to back and left to right. */
export function chosenSeats(map: SeatMap, seatIds: readonly string[]) {
  const chosen = new Set(seatIds);
  return [...indexSeats(map).values()].filter((info) => chosen.has(info.seat.id));
}

export function listLabels(labels: string[]) {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join("; ")} and ${labels[labels.length - 1]}`;
}
