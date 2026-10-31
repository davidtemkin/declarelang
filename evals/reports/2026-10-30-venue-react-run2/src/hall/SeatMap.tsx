import { memo, useCallback, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { SeatMap as SeatMapData, SeatStatus } from "../api/types";
import { formatMoney, seatLabel } from "../format";
import type { HallLayout } from "./layout";
import styles from "./SeatMap.module.css";

type Props = {
  map: SeatMapData;
  layout: HallLayout;
  selected: ReadonlySet<string>;
  /** Seats someone else has just taken, drawn going for a moment. */
  justTaken: ReadonlySet<string>;
  /** Pixels per seat unit. */
  unit: number;
  onToggle: (seatId: string) => void;
};

/**
 * Every seat in the house as a button, laid out as the room is. The whole map is
 * one stop in the tab order; arrow keys move from seat to seat.
 */
export function SeatMap({ map, layout, selected, justTaken, unit, onToggle }: Props) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  const firstChoice = useMemo(() => {
    const middleRow = layout.navRows[Math.min(4, layout.navRows.length - 1)];
    return middleRow?.seatIds[Math.floor(middleRow.seatIds.length / 2)];
  }, [layout]);
  const [focusId, setFocusId] = useState<string | undefined>(undefined);
  const tabStop = focusId ?? [...selected][0] ?? firstChoice;

  const moveFocus = useCallback((seatId: string | undefined) => {
    if (!seatId) return;
    setFocusId(seatId);
    buttons.current.get(seatId)?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = (event.target as HTMLElement).dataset.seat;
    const at = current ? layout.seats.get(current) : undefined;
    if (!current || !at) return;
    const rowIndex = layout.navRows.findIndex((r) => r.seatIds.includes(current));
    const row = layout.navRows[rowIndex];
    const i = row.seatIds.indexOf(current);
    const nearestIn = (target: number) => {
      const other = layout.navRows[target];
      if (!other) return undefined;
      let best = 0;
      other.xs.forEach((x, j) => {
        if (Math.abs(x - at.x) < Math.abs(other.xs[best] - at.x)) best = j;
      });
      return other.seatIds[best];
    };
    const next: Record<string, string | undefined> = {
      ArrowLeft: row.seatIds[i - 1],
      ArrowRight: row.seatIds[i + 1],
      ArrowUp: nearestIn(rowIndex - 1),
      ArrowDown: nearestIn(rowIndex + 1),
      Home: row.seatIds[0],
      End: row.seatIds[row.seatIds.length - 1],
    };
    if (!(event.key in next)) return;
    event.preventDefault();
    moveFocus(next[event.key]);
  };

  const register = useCallback((seatId: string, element: HTMLButtonElement | null) => {
    if (element) buttons.current.set(seatId, element);
    else buttons.current.delete(seatId);
  }, []);

  const onPick = useCallback(
    (seatId: string, status: SeatStatus) => {
      setFocusId(seatId);
      if (status === "available") onToggle(seatId);
    },
    [onToggle],
  );

  const style = {
    "--u": `${unit}px`,
    width: layout.width * unit,
    height: layout.height * unit,
  } as CSSProperties;

  return (
    <div className={styles.room} style={style} onKeyDown={onKeyDown}>
      <svg
        className={styles.floor}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="stage-light" cx="50%" cy="100%" r="90%">
            <stop offset="0%" stopColor="#fff4dc" />
            <stop offset="100%" stopColor="#e9cf9b" />
          </radialGradient>
        </defs>
        <path d={layout.stage.path} fill="url(#stage-light)" />
        <text
          x={layout.stage.label.x}
          y={layout.stage.label.y}
          className={styles.stageLabel}
          textAnchor="middle"
          dominantBaseline="middle"
        >
          Stage
        </text>
        {layout.bands.map((band, i) => (
          <g key={band.key}>
            <path d={band.path} className={styles.band} data-tier={i} />
            {band.rail && <path d={band.rail} className={styles.rail} />}
            <text
              x={band.label.x}
              y={band.label.y}
              className={styles.sectionLabel}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {band.name.toUpperCase()} · {formatMoney(band.priceCents)}
            </text>
          </g>
        ))}
        {layout.rowLabels.map((label) => (
          <text
            key={label.key}
            x={label.x}
            y={label.y}
            className={styles.rowLabel}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {label.name}
          </text>
        ))}
      </svg>

      {map.sections.map((section, sectionIndex) => (
        <div
          key={section.key}
          role="group"
          aria-label={`${section.name}, ${formatMoney(section.priceCents)} a seat`}
        >
          {section.rows.map((row) =>
            row.seats.map((seat) => {
              const place = layout.seats.get(seat.id)!;
              return (
                <SeatButton
                  key={seat.id}
                  id={seat.id}
                  label={seatLabel(section.name, row.name, seat.number)}
                  price={section.priceCents}
                  tier={sectionIndex}
                  status={seat.status}
                  chosen={selected.has(seat.id)}
                  going={justTaken.has(seat.id)}
                  tabbable={seat.id === tabStop}
                  x={place.x}
                  y={place.y}
                  angle={place.angle}
                  register={register}
                  onPick={onPick}
                />
              );
            }),
          )}
        </div>
      ))}
    </div>
  );
}

type SeatButtonProps = {
  id: string;
  label: string;
  price: number;
  tier: number;
  status: SeatStatus;
  chosen: boolean;
  going: boolean;
  tabbable: boolean;
  x: number;
  y: number;
  angle: number;
  register: (id: string, element: HTMLButtonElement | null) => void;
  onPick: (id: string, status: SeatStatus) => void;
};

const SeatButton = memo(function SeatButton({
  id, label, price, tier, status, chosen, going, tabbable, x, y, angle, register, onPick,
}: SeatButtonProps) {
  const sold = status === "sold";
  const state = chosen ? "chosen" : sold ? "sold" : "free";
  const description = `${formatMoney(price)}, ${chosen ? "chosen by you" : sold ? "sold" : "available"}`;
  return (
    <button
      ref={(element) => register(id, element)}
      type="button"
      className={styles.seat}
      data-seat={id}
      data-state={state}
      data-tier={tier}
      data-going={going || undefined}
      style={{ "--x": x, "--y": y, "--a": `${angle}deg` } as CSSProperties}
      tabIndex={tabbable ? 0 : -1}
      aria-label={label}
      aria-pressed={chosen}
      aria-disabled={sold || undefined}
      aria-description={description}
      onClick={() => onPick(id, status)}
    >
      <span className={styles.shape} aria-hidden="true">
        {chosen && (
          <svg viewBox="0 0 12 12" className={styles.tick}>
            <path d="M2.6 6.4 5 8.6 9.4 3.6" />
          </svg>
        )}
      </span>
    </button>
  );
});
