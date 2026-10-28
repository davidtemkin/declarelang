import type { Sport } from "../api";

/** 220 → "3h 40m", 45 → "45m", 120 → "2h 0m" */
export function duration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/** 12.4 → "12.4 km" */
export function distance(km: number): string {
  return `${km.toFixed(1)} km`;
}

export function heart(bpm: number): string {
  return `${Math.round(bpm)} bpm`;
}

/** Seconds as a running clock: "6:52", "1:04:09" */
export function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Minutes per km (run) or per 100 m (swim) or km/h (ride); null for lifting. */
export function pace(sport: Sport, minutes: number, km: number | null): string | null {
  if (!km || km <= 0) return null;
  if (sport === "ride") return `${((km / minutes) * 60).toFixed(1)} km/h`;
  if (sport === "swim") return `${clock((minutes * 60) / (km * 10))} /100 m`;
  if (sport === "run") return `${clock((minutes * 60) / km)} /km`;
  return null;
}

export const SPORT_NAME: Record<Sport, string> = { run: "Run", ride: "Ride", lift: "Lift", swim: "Swim" };

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}
