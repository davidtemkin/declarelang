import { memo, type PointerEvent } from "react";
import type { SeatMap } from "../api/types";
import type { HallLayout } from "./layout";
import styles from "./Hall.module.css";

/** The visible part of the room, as fractions of its width and height. */
export type Viewport = { x: number; y: number; w: number; h: number };

type Props = {
  map: SeatMap;
  layout: HallLayout;
  selected: ReadonlySet<string>;
  viewport: Viewport;
  onPan: (x: number, y: number, smooth: boolean) => void;
};

/**
 * The whole house in miniature: how full it is, where the chosen seats are, and
 * which part of it is in view. Touching or dragging it moves the view. It is a
 * picture for the eye and a steering aid for the finger; the seats themselves
 * are reachable directly by keyboard and screen reader, so it is hidden from them.
 */
export function Minimap({ map, layout, selected, viewport, onPan }: Props) {
  const steer = (event: PointerEvent<SVGSVGElement>, smooth: boolean) => {
    const box = event.currentTarget.getBoundingClientRect();
    onPan(
      (event.clientX - box.left) / box.width,
      (event.clientY - box.top) / box.height,
      smooth,
    );
  };

  return (
    <svg
      className={styles.minimap}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      aria-hidden="true"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        steer(event, true);
      }}
      onPointerMove={(event) => {
        if (event.buttons) steer(event, false);
      }}
    >
      <path d={layout.stage.path} className={styles.miniStage} />
      <Dots map={map} layout={layout} selected={selected} />
      <rect
        className={styles.miniView}
        x={viewport.x * layout.width}
        y={viewport.y * layout.height}
        width={viewport.w * layout.width}
        height={viewport.h * layout.height}
        rx={0.6}
      />
    </svg>
  );
}

const Dots = memo(function Dots({
  map,
  layout,
  selected,
}: Pick<Props, "map" | "layout" | "selected">) {
  return (
    <g>
      {map.sections.flatMap((section, tier) =>
        section.rows.flatMap((row) =>
          row.seats.map((seat) => {
            const { x, y } = layout.seats.get(seat.id)!;
            const state = selected.has(seat.id) ? "chosen" : seat.status === "sold" ? "sold" : "free";
            return (
              <circle
                key={seat.id}
                cx={x}
                cy={y}
                r={state === "chosen" ? 0.62 : state === "sold" ? 0.2 : 0.4}
                data-state={state}
                data-tier={tier}
                className={styles.dot}
              />
            );
          }),
        ),
      )}
    </g>
  );
});
