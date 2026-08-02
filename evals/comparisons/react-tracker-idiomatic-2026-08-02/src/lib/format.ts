import { DAY_MS } from "../domain/stats";

const numberFormat = new Intl.NumberFormat();
export const formatCount = (n: number): string => numberFormat.format(n);

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const dayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const fullFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/**
 * Ages are relative to the dataset's own horizon, never to the wall clock —
 * the fixtures live in synthetic time.
 */
export function formatAge(at: number, horizon: number): string {
  const days = Math.round((at - horizon) / DAY_MS);
  if (Math.abs(days) < 30) return relativeFormat.format(days, "day");
  const months = Math.round(days / 30);
  if (Math.abs(months) < 18) return relativeFormat.format(months, "month");
  return relativeFormat.format(Math.round(days / 365), "year");
}

export const formatDay = (t: number): string => dayFormat.format(t);
export const formatTimestamp = (t: number): string => fullFormat.format(t);

export const formatMs = (ms: number | null): string => (ms === null ? "—" : `${ms.toFixed(ms < 10 ? 1 : 0)}ms`);
