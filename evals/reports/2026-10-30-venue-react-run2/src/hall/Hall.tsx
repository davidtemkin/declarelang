import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SeatMap as SeatMapData } from "../api/types";
import { layoutHall } from "./layout";
import { Minimap, type Viewport } from "./Minimap";
import { SeatMap } from "./SeatMap";
import styles from "./Hall.module.css";

/** Below this many pixels a seat cannot be hit reliably by a finger, nor read as a seat. */
const SMALLEST_FIT = 17;
const LARGEST_FIT = 27;
/** The size seats are drawn at when the room is too wide to fit: a thumb's width. */
const THUMB_UNIT = 38;

type Props = {
  map: SeatMapData;
  selected: ReadonlySet<string>;
  justTaken: ReadonlySet<string>;
  onToggle: (seatId: string) => void;
};

/**
 * The room at a size people can use. Where the whole house fits it is drawn
 * whole; where it doesn't (a phone), the seats are drawn thumb-sized in a
 * pannable window, with the whole house in miniature above to read at a glance
 * and to steer by.
 */
export function Hall({ map, selected, justTaken, onToggle }: Props) {
  // The room's shape doesn't change as seats sell, so it is laid out again only
  // when the rows themselves differ, not on every sale.
  const shapeKey = map.sections
    .map((s) => s.rows.map((r) => `${r.name}${r.seats.length}`).join())
    .join("|");
  const layout = useMemo(() => layoutHall(map), [shapeKey]);

  const frame = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  useLayoutEffect(() => {
    const element = frame.current!;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(element);
    setAvailable(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  // At a desk the whole house should be in view at once, so the room is also
  // kept within the height of the window — but never so small as to be fiddly.
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  useEffect(() => {
    const onResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const fitWidth = available / layout.width;
  const fit = fitWidth < SMALLEST_FIT ? fitWidth : Math.min(fitWidth, Math.max(SMALLEST_FIT, (windowHeight - 170) / layout.height));
  const panning = available > 0 && fit < SMALLEST_FIT;
  const unit = panning ? THUMB_UNIT : Math.min(fit, LARGEST_FIT);

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const measure = useCallback(() => {
    const el = frame.current;
    if (!el) return;
    const total = { w: layout.width * unit, h: layout.height * unit };
    setViewport({
      x: el.scrollLeft / total.w,
      y: el.scrollTop / total.h,
      w: Math.min(1, el.clientWidth / total.w),
      h: Math.min(1, el.clientHeight / total.h),
    });
  }, [layout, unit]);

  // Open on the middle of the house, the stage's edge at the top and the best seats in view.
  const centred = useRef(false);
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el || !panning) return;
    if (!centred.current) {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      const row = layout.navRows[0]?.seatIds ?? [];
      const frontRow = layout.seats.get(row[Math.floor(row.length / 2)] ?? "");
      el.scrollTop = frontRow ? (frontRow.y - 3.2) * unit : 0;
      centred.current = true;
    }
    measure();
  }, [panning, measure, layout, unit]);

  useEffect(() => {
    const el = frame.current;
    if (!el || !panning) return;
    let pending = 0;
    const onScroll = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(measure);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(onScroll);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
      cancelAnimationFrame(pending);
    };
  }, [panning, measure]);

  const panTo = useCallback(
    (cx: number, cy: number, smooth: boolean) => {
      const el = frame.current;
      if (!el) return;
      el.scrollTo({
        left: cx * layout.width * unit - el.clientWidth / 2,
        top: cy * layout.height * unit - el.clientHeight / 2,
        behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto",
      });
    },
    [layout, unit],
  );

  return (
    <div className={styles.hall} data-panning={panning || undefined}>
      {panning && viewport && (
        <Minimap map={map} layout={layout} selected={selected} viewport={viewport} onPan={panTo} />
      )}
      <div ref={frame} className={styles.frame}>
        {available > 0 && (
          <SeatMap
            map={map}
            layout={layout}
            selected={selected}
            justTaken={justTaken}
            unit={unit}
            onToggle={onToggle}
          />
        )}
      </div>
    </div>
  );
}
