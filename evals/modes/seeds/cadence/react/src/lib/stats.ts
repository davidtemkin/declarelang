// Everything derived from the history. All of it is pure, and all of it is
// recomputed from the sessions held in memory, so nothing can go stale.

import type { Session, Sport } from "../api";
import { SPORTS } from "../api";
import { toDay, weekday, type Day } from "./dates";

/** Effort at or above this is a hard session, and gets the accent. */
export const HARD_EFFORT = 7;
export const isHard = (effort: number) => effort >= HARD_EFFORT;

export interface Totals {
  count: number;
  minutes: number;
  km: number;
  avgEffort: number;
}

export function totals(sessions: readonly Session[]): Totals {
  let minutes = 0, km = 0, effort = 0;
  for (const s of sessions) {
    minutes += s.minutes;
    km += s.distanceKm ?? 0;
    effort += s.effort;
  }
  return { count: sessions.length, minutes, km, avgEffort: sessions.length ? effort / sessions.length : 0 };
}

export function between(sessions: readonly Session[], from: Day, to: Day): Session[] {
  return sessions.filter((s) => {
    const d = toDay(s.date);
    return d >= from && d <= to;
  });
}

/** Consecutive days with a session, ending today — or yesterday, if today is still open. */
export function streak(sessions: readonly Session[], today: Day): number {
  const days = new Set(sessions.map((s) => toDay(s.date)));
  let day = days.has(today) ? today : today - 1;
  let n = 0;
  while (days.has(day)) {
    n++;
    day--;
  }
  return n;
}

export interface DayLoad {
  day: Day;
  minutes: number;
  hardest: number; // highest effort that day, 0 if none
  sessions: Session[];
}

export function dayLoads(sessions: readonly Session[], from: Day, count: number): DayLoad[] {
  const out: DayLoad[] = Array.from({ length: count }, (_, i) => ({ day: from + i, minutes: 0, hardest: 0, sessions: [] }));
  for (const s of sessions) {
    const slot = out[toDay(s.date) - from];
    if (!slot) continue;
    slot.minutes += s.minutes;
    slot.hardest = Math.max(slot.hardest, s.effort);
    slot.sessions.push(s);
  }
  return out;
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export interface SportHabit {
  minutes: number; // typical duration, rounded to 5
  effort: number;
  kmPerMinute: number | null;
  durationChoices: number[]; // a short, typical-first set of durations to offer
}

const FALLBACK_MINUTES: Record<Sport, number> = { run: 45, ride: 90, lift: 50, swim: 40 };

export function sportHabit(sessions: readonly Session[], sport: Sport): SportHabit {
  const mine = sessions.filter((s) => s.sport === sport);
  const mins = mine.map((s) => s.minutes);
  const typical = mine.length ? roundTo(quantile(mins, 0.5), 5) : FALLBACK_MINUTES[sport];
  const paced = mine.filter((s) => s.distanceKm);
  const choices = mine.length
    ? [quantile(mins, 0.2), quantile(mins, 0.5), quantile(mins, 0.8)].map((m) => Math.max(5, roundTo(m, 5)))
    : [typical];
  return {
    minutes: typical,
    effort: mine.length ? Math.round(quantile(mine.map((s) => s.effort), 0.5)) : 5,
    kmPerMinute: paced.length ? quantile(paced.map((s) => s.distanceKm! / s.minutes), 0.5) : null,
    durationChoices: [...new Set(choices)],
  };
}

/**
 * The sport this person is most likely to be logging now. The history has no
 * clock times, so "this hour" becomes "this day of the week": whatever they
 * have done most on this weekday lately, falling back to what they do most.
 */
export function likelySport(sessions: readonly Session[], today: Day): Sport {
  const recent = sessions.filter((s) => today - toDay(s.date) <= 16 * 7);
  const tally = (list: readonly Session[]) => {
    const counts = new Map<Sport, number>(SPORTS.map((s) => [s, 0]));
    for (const s of list) counts.set(s.sport, counts.get(s.sport)! + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  };
  const sameWeekday = tally(recent.filter((s) => weekday(toDay(s.date)) === weekday(today)));
  if (sameWeekday[0][1] > 0 && sameWeekday[0][1] > sameWeekday[1][1]) return sameWeekday[0][0];
  return tally(recent.length ? recent : sessions)[0][0];
}

export function estimateKm(habit: SportHabit, sport: Sport, minutes: number): number | null {
  if (!habit.kmPerMinute) return null;
  const step = sport === "swim" ? 0.1 : 0.5;
  return Math.max(step, roundTo(habit.kmPerMinute * minutes, step));
}

export interface Standing {
  /** share of all sessions that were easier than this one, 0–1 */
  harderThan: number;
  /** share of sessions of the same sport that were shorter, 0–1 */
  longerThan: number;
  /** most recent earlier session at least as hard, if any */
  hardestSince: Session | null;
  /** most recent earlier same-sport session at least as far (or long, for lifting) */
  furthestSince: Session | null;
  sameSport: Session[];
}

export function standing(session: Session, sessions: readonly Session[]): Standing {
  const others = sessions.filter((s) => s.id !== session.id);
  const sameSport = others.filter((s) => s.sport === session.sport);
  const share = (list: Session[], pred: (s: Session) => boolean) =>
    list.length ? list.filter(pred).length / list.length : 0;
  const earlier = (list: Session[]) =>
    list.filter((s) => s.date < session.date).sort((a, b) => (a.date < b.date ? 1 : -1));
  const reach = (s: Session) => (s.distanceKm ?? s.minutes);
  return {
    harderThan: share(others, (s) => s.effort < session.effort),
    longerThan: share(sameSport, (s) => s.minutes < session.minutes),
    hardestSince: earlier(others).find((s) => s.effort >= session.effort) ?? null,
    furthestSince: earlier(sameSport).find((s) => reach(s) >= reach(session)) ?? null,
    sameSport,
  };
}
