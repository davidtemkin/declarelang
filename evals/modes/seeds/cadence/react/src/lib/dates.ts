// Calendar days as plain integers (days since 1970-01-01), so arithmetic is
// exact and no timezone ever gets involved. Dates are the person's own.

const MS_PER_DAY = 86_400_000;

export type Day = number;

export function toDay(iso: string): Day {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

export function toIso(day: Day): string {
  return new Date(Math.round(day) * MS_PER_DAY).toISOString().slice(0, 10);
}

function utc(day: Day): Date {
  return new Date(Math.floor(day) * MS_PER_DAY);
}

/** Monday = 0 … Sunday = 6 */
export function weekday(day: Day): number {
  return (utc(day).getUTCDay() + 6) % 7;
}

export function startOfWeek(day: Day): Day {
  return day - weekday(day);
}

export function startOfMonth(day: Day): Day {
  const d = utc(day);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / MS_PER_DAY;
}

export function addMonths(day: Day, n: number): Day {
  const d = utc(day);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()) / MS_PER_DAY;
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function parts(day: Day) {
  const d = utc(day);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate() };
}

/** "Wednesday 5 August" */
export function longDate(day: Day): string {
  const { month, date } = parts(day);
  return `${WEEKDAYS[weekday(day)]} ${date} ${MONTHS_LONG[month]}`;
}

/** "Sat 18 Oct 2025" */
export function fullDate(day: Day): string {
  const { year, month, date } = parts(day);
  return `${WEEKDAYS[weekday(day)].slice(0, 3)} ${date} ${MONTHS[month]} ${year}`;
}

/** "18 Oct", with the year only when it isn't the current one */
export function shortDate(day: Day, today: Day): string {
  const { year, month, date } = parts(day);
  return year === parts(today).year ? `${date} ${MONTHS[month]}` : `${date} ${MONTHS[month]} ${year}`;
}

/** "today", "yesterday", "Monday", or a date, for how people talk about recent days */
export function relativeDay(day: Day, today: Day): string {
  const ago = today - day;
  if (ago === 0) return "today";
  if (ago === 1) return "yesterday";
  if (ago > 1 && ago < 7) return WEEKDAYS[weekday(day)];
  return shortDate(day, today);
}

/** "3 – 16 Oct 2025", "28 Sep – 11 Oct 2025", "Oct 2025 – Jan 2026" */
export function rangeLabel(from: Day, to: Day): string {
  const a = parts(from), b = parts(to);
  if (to - from > 75) {
    const left = `${MONTHS[a.month]}${a.year === b.year ? "" : ` ${a.year}`}`;
    return a.year === b.year && a.month === b.month ? `${MONTHS_LONG[a.month]} ${a.year}` : `${left} – ${MONTHS[b.month]} ${b.year}`;
  }
  if (a.year !== b.year) return `${a.date} ${MONTHS[a.month]} ${a.year} – ${b.date} ${MONTHS[b.month]} ${b.year}`;
  if (a.month !== b.month) return `${a.date} ${MONTHS[a.month]} – ${b.date} ${MONTHS[b.month]} ${b.year}`;
  return `${a.date} – ${b.date} ${MONTHS[b.month]} ${b.year}`;
}
