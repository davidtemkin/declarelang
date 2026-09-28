import { isHard } from "../lib/stats";

/** Effort is the one thing that gets colour: hard sessions take the accent, the rest are ink. */
export function effortFill(effort: number): string {
  return isHard(effort) ? "var(--accent)" : "var(--ink-bar)";
}

/** Ten ticks, filled up to the effort. */
export function EffortMeter({ effort, className = "" }: { effort: number; className?: string }) {
  return (
    <span className={`meter ${className}`} role="img" aria-label={`Effort ${effort} of 10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className="meter__tick"
          style={{ background: i < effort ? effortFill(effort) : undefined }}
        />
      ))}
    </span>
  );
}
