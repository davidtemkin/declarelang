// The whole history as one surface the hand can push through and pull open.
// Bar height is time spent; colour is effort, with hard sessions in the accent.
// Squeezed shut it reads by week; pulled open, every session is its own bar.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Session } from "../api";
import { MONTHS, parts, rangeLabel, startOfMonth, addMonths, startOfWeek, toDay, type Day } from "../lib/dates";
import { plural } from "../lib/format";
import { between, isHard, totals } from "../lib/stats";
import { useSurfaceGestures } from "../hooks/useSurfaceGestures";
import { prefersReducedMotion } from "../hooks/useReducedMotion";
import { Figure, Duration } from "./Figure";
import { effortFill } from "./EffortMeter";
import "./Year.css";

interface Viewport {
  start: Day; // left edge, fractional days
  span: number; // days across the width
}

const MIN_SPAN = 10;
const AXIS_H = 28;
const LABEL_H = 22; // room above the tallest bar for month names
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface YearProps {
  sessions: Session[];
  today: Day;
  selectedId: string | null;
  onSelect(session: Session): void;
}

export function Year({ sessions, today, selectedId, onSelect }: YearProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // The domain is fixed by the history itself: its first day to the end of today.
  const first = useMemo(
    () => (sessions.length ? toDay(sessions[sessions.length - 1].date) : today - 425),
    [sessions, today],
  );
  const last = today + 1;
  const full = last - first;

  const clamp = useCallback(
    ({ start, span }: Viewport): Viewport => {
      const s = Math.min(full, Math.max(MIN_SPAN, span));
      return { span: s, start: Math.min(last - s, Math.max(first, start)) };
    },
    [first, last, full],
  );

  const [view, setViewState] = useState<Viewport>({ start: first, span: full });
  const viewRef = useRef(view);
  const setView = useCallback(
    (next: Viewport) => {
      viewRef.current = clamp(next);
      setViewState(viewRef.current);
    },
    [clamp],
  );

  // Glide to a viewport (buttons, keys, tapping into a week). Any touch cancels it.
  const glide = useRef(0);
  const animateTo = useCallback(
    (target: Viewport) => {
      cancelAnimationFrame(glide.current);
      const to = clamp(target);
      if (prefersReducedMotion()) return setView(to);
      const from = viewRef.current;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / 420);
        const k = 1 - Math.pow(1 - t, 3);
        // Interpolate span geometrically so zooming feels even at every scale.
        const span = from.span * Math.pow(to.span / from.span, k);
        const centre = from.start + from.span / 2 + (to.start + to.span / 2 - (from.start + from.span / 2)) * k;
        setView({ start: centre - span / 2, span });
        if (t < 1) glide.current = requestAnimationFrame(step);
      };
      glide.current = requestAnimationFrame(step);
    },
    [clamp, setView],
  );
  useEffect(() => () => cancelAnimationFrame(glide.current), []);

  useLayoutEffect(() => {
    const el = surfaceRef.current!;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { width, height } = size;
  const ppd = width / view.span; // pixels per day
  const chartH = Math.max(0, height - AXIS_H);
  const xOf = (day: number) => (day - view.start) * ppd;

  // Squeezed shut, bars are weeks; pulled open, they are sessions.
  const dailyness = smoothstep(3.6, 4.6, ppd);

  const layout = useMemo(() => {
    const byDay = new Map<Day, Session[]>();
    const byWeek = new Map<Day, Session[]>();
    for (const s of [...sessions].reverse()) {
      const d = toDay(s.date);
      byDay.set(d, [...(byDay.get(d) ?? []), s]);
      const w = startOfWeek(d);
      byWeek.set(w, [...(byWeek.get(w) ?? []), s]);
    }
    const sum = (list: Session[]) => list.reduce((n, s) => n + s.minutes, 0);
    // Fixed scales, so height means the same thing wherever you are.
    const dayMax = Math.max(120, ...[...byDay.values()].map(sum));
    const weekMax = Math.max(300, ...[...byWeek.values()].map(sum));
    return { byDay, byWeek, dayMax, weekMax };
  }, [sessions]);

  useSurfaceGestures(surfaceRef, {
    grab: () => cancelAnimationFrame(glide.current),
    pan: (dx) => {
      const v = viewRef.current;
      setView({ ...v, start: v.start - dx / (width / v.span) });
    },
    zoom: (factor, anchorX) => {
      const v = viewRef.current;
      const anchorDay = v.start + anchorX / (width / v.span);
      const span = Math.min(full, Math.max(MIN_SPAN, v.span / factor));
      setView({ span, start: anchorDay - (anchorX / width) * span });
    },
    tap: (x, y) => {
      const v = viewRef.current;
      const day = v.start + x / (width / v.span);
      if (dailyness < 0.5) {
        // Tapping a week opens it up.
        const week = startOfWeek(Math.floor(day));
        animateTo({ start: week - 7, span: 21 });
        return;
      }
      const hit = nearestSession(layout.byDay, day, x, y, width / v.span, v, chartH, layout.dayMax * chartH / (chartH - LABEL_H));
      if (hit) onSelect(hit);
    },
  });

  const zoomAroundCentre = (span: number) => {
    const v = viewRef.current;
    const centre = Math.min(last - span / 2, v.start + v.span / 2);
    animateTo({ start: centre - span / 2, span });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const v = viewRef.current;
    const moves: Record<string, () => void> = {
      ArrowLeft: () => animateTo({ ...v, start: v.start - v.span * 0.25 }),
      ArrowRight: () => animateTo({ ...v, start: v.start + v.span * 0.25 }),
      "+": () => zoomAroundCentre(v.span / 1.6),
      "=": () => zoomAroundCentre(v.span / 1.6),
      "-": () => zoomAroundCentre(v.span * 1.6),
      Home: () => animateTo({ start: first, span: full }),
      End: () => animateTo({ start: last - v.span, span: v.span }),
    };
    if (moves[e.key]) {
      e.preventDefault();
      moves[e.key]();
    }
  };

  // What's on screen, and what happened in it.
  const visibleFrom = Math.max(first, Math.ceil(view.start - 0.5));
  const visibleTo = Math.min(today, Math.floor(view.start + view.span - 0.5));
  const period = useMemo(
    () => totals(between(sessions, visibleFrom, visibleTo)),
    [sessions, visibleFrom, visibleTo],
  );

  return (
    <section className="year" aria-labelledby="year-title">
      <header className="year__head">
        <h2 id="year-title" className="label">The year</h2>
        <p className="year__range">{rangeLabel(visibleFrom, visibleTo)}</p>
        <dl className="year__stats">
          <div>
            <dt className="label">{plural(period.count, "Session")}</dt>
            <dd><Figure value={period.count} /></dd>
          </div>
          <div>
            <dt className="label">Time</dt>
            <dd><Duration minutes={period.minutes} /></dd>
          </div>
          <div>
            <dt className="label">Distance</dt>
            <dd>
              <Figure value={period.km} format={(n) => String(Math.round(n))} />
              <span className="unit">km</span>
            </dd>
          </div>
          <div>
            <dt className="label">Avg effort</dt>
            <dd><Figure value={period.avgEffort} format={(n) => n.toFixed(1)} /></dd>
          </div>
        </dl>
      </header>

      <div
        ref={surfaceRef}
        className="year__surface"
        tabIndex={0}
        role="application"
        aria-roledescription="timeline"
        aria-label={`Training from ${rangeLabel(visibleFrom, visibleTo)}. Arrow keys move, plus and minus zoom.`}
        onKeyDown={onKeyDown}
      >
        {width > 0 && (
          <svg width={width} height={height} aria-hidden="true">
            <Axis view={view} width={width} ppd={ppd} chartH={chartH} today={today} />
            {dailyness < 1 && (
              <g opacity={1 - dailyness}>
                {[...layout.byWeek].map(([week, list]) => {
                  const x = xOf(week);
                  if (x > width || x + 7 * ppd < 0) return null;
                  const w = Math.max(2, 7 * ppd * 0.78);
                  // A week reads as two amounts: hard time in the accent, the rest in ink.
                  const hard = list.filter((s) => isHard(s.effort)).reduce((n, s) => n + s.minutes, 0);
                  const rest = list.reduce((n, s) => n + s.minutes, 0) - hard;
                  return (
                    <Stack
                      key={week}
                      segments={[
                        { key: "hard", minutes: hard, fill: effortFill(10) },
                        { key: "rest", minutes: rest, fill: effortFill(1) },
                      ]}
                      x={x + 7 * ppd * 0.11}
                      w={w}
                      base={chartH}
                      scale={(chartH - LABEL_H) / layout.weekMax}
                    />
                  );
                })}
              </g>
            )}
            {dailyness > 0 && (
              <g opacity={dailyness}>
                {[...layout.byDay].map(([day, list]) => {
                  const x = xOf(day);
                  if (x > width || x + ppd < 0) return null;
                  const w = Math.min(36, Math.max(1.5, ppd * 0.7));
                  return (
                    <Stack
                      key={day}
                      segments={list.map((s) => ({
                        key: s.id, minutes: s.minutes, fill: effortFill(s.effort), selected: s.id === selectedId,
                      }))}
                      x={x + (ppd - w) / 2}
                      w={w}
                      base={chartH}
                      scale={(chartH - LABEL_H) / layout.dayMax}
                    />
                  );
                })}
              </g>
            )}
          </svg>
        )}
      </div>

      <div className="year__controls">
        <p className="year__hint">
          {dailyness < 0.5 ? "Each bar is a week." : "Each bar is a session."} Drag to move, pinch or scroll to zoom
          {dailyness < 0.5 ? ", tap a week to open it" : ", tap a bar for the session"}.
        </p>
        <div className="year__zoom" role="group" aria-label="Zoom">
          <button type="button" onClick={() => zoomAroundCentre(14)}>2 wk</button>
          <button type="button" onClick={() => zoomAroundCentre(91)}>3 mo</button>
          <button type="button" onClick={() => animateTo({ start: first, span: full })}>All</button>
        </div>
      </div>
    </section>
  );
}

interface Segment {
  key: string;
  minutes: number;
  fill: string;
  selected?: boolean;
}

/** Segments stacked up from the baseline, a hairline apart. */
function Stack({ segments, x, w, base, scale }: { segments: Segment[]; x: number; w: number; base: number; scale: number }) {
  let y = base;
  const shown = segments.filter((s) => s.minutes > 0);
  return (
    <g>
      {shown.map((s) => {
        const h = Math.max(1, s.minutes * scale);
        y -= h;
        return (
          <rect
            key={s.key}
            x={x}
            y={y}
            width={w}
            height={h - (shown.length > 1 ? 1 : 0)}
            fill={s.fill}
            className={s.selected ? "year__bar year__bar--selected" : "year__bar"}
          />
        );
      })}
    </g>
  );
}

function Axis({ view, width, ppd, chartH, today }: { view: Viewport; width: number; ppd: number; chartH: number; today: Day }) {
  const ticks: { x: number; label: string }[] = [];
  const monthW = ppd * 30;
  const every = monthW < 36 ? 3 : 1;
  for (let m = startOfMonth(view.start); m < view.start + view.span; m = addMonths(m, 1)) {
    const { month, year } = parts(m);
    if (month % every !== 0) continue;
    ticks.push({ x: (m - view.start) * ppd, label: month === 0 ? `${MONTHS[month]} ${year}` : MONTHS[month] });
  }
  const visible = ticks.filter((t) => t.x >= 0 && t.x < width - 44);
  ticks.length = 0;
  ticks.push(...visible);
  // Name the month the view opens in, pinned to the left edge, unless a real
  // month boundary is about to take its place.
  const opening = parts(view.start);
  if (!ticks.length || ticks[0].x > 70) {
    ticks.unshift({ x: 0, label: `${MONTHS[opening.month]} ${opening.year}` });
  }
  const weekTicks: { x: number; label: string }[] = [];
  if (ppd >= 9) {
    for (let w = startOfWeek(Math.floor(view.start)); w < view.start + view.span; w += 7) {
      weekTicks.push({ x: (w - view.start) * ppd, label: String(parts(w).date) });
    }
  }
  const todayX = (today + 1 - view.start) * ppd;
  return (
    <g className="year__axis">
      <line x1={0} x2={width} y1={chartH + 0.5} y2={chartH + 0.5} className="year__baseline" />
      {weekTicks.map((t) => (
        <g key={`w${t.label}${t.x}`}>
          <line x1={t.x} x2={t.x} y1={chartH} y2={chartH + 6} className="year__tick" />
          <text x={t.x + 3} y={chartH + 22} className="year__weeklabel">{t.label}</text>
        </g>
      ))}
      {ticks.map((t) => (
        <g key={`m${t.label}${t.x}`}>
          {t.x > 0 && <line x1={t.x} x2={t.x} y1={0} y2={chartH + 8} className="year__monthline" />}
          <text x={t.x + (t.x > 0 ? 4 : 0)} y={12} className="year__monthlabel">{t.label}</text>
        </g>
      ))}
      {todayX <= width + 1 && (
        <text x={Math.min(todayX, width) - 4} y={chartH + 22} textAnchor="end" className="year__today">Today</text>
      )}
    </g>
  );
}

/** The session under a tap, forgiving enough for a thumb. */
function nearestSession(
  byDay: Map<Day, Session[]>, day: number, x: number, y: number,
  ppd: number, view: Viewport, chartH: number, dayMax: number,
): Session | null {
  const reach = Math.max(1, Math.ceil(22 / ppd));
  let best: Session | null = null;
  let bestDist = Infinity;
  for (let d = Math.floor(day) - reach; d <= Math.floor(day) + reach; d++) {
    const list = byDay.get(d);
    if (!list) continue;
    const dist = Math.abs((d + 0.5 - view.start) * ppd - x);
    if (dist > Math.max(22, ppd / 2) || dist >= bestDist) continue;
    // Within a stacked day, pick the segment under the finger, else the top one.
    let top = chartH;
    let pick = list[list.length - 1];
    for (const s of list) {
      const h = (s.minutes * chartH) / dayMax;
      if (y <= top && y >= top - h) pick = s;
      top -= h;
    }
    best = pick;
    bestDist = dist;
  }
  return best;
}
