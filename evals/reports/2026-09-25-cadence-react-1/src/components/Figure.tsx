// A number that travels to its new value instead of cutting to it, so a change
// is seen happening. Retargets mid-flight, so a figure that follows the hand
// (the year's totals while it is being dragged) never jumps.

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../hooks/useReducedMotion";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export function useTween(target: number, ms = 600): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    if (prefersReducedMotion()) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / ms);
      shownRef.current = from + (target - from) * easeOut(t);
      setShown(shownRef.current);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);

  return shown;
}

interface FigureProps {
  value: number;
  format?: (n: number) => string;
  className?: string;
}

/** Renders a tweened number. Integers by default. */
export function Figure({ value, format = (n) => String(Math.round(n)), className }: FigureProps) {
  const shown = useTween(value);
  return <span className={className}>{format(shown)}</span>;
}

/**
 * A tweened duration, "3h 40m", with the figures and the units separately
 * styleable so the figures can be set large and the letters small.
 */
export function Duration({ minutes, className }: { minutes: number; className?: string }) {
  const m = Math.max(0, Math.round(useTween(minutes)));
  const h = Math.floor(m / 60);
  return (
    <span className={className}>
      {h > 0 && (
        <>
          {h}
          <span className="unit">h</span>{" "}
        </>
      )}
      {h > 0 ? m % 60 : m}
      <span className="unit">m</span>
    </span>
  );
}
