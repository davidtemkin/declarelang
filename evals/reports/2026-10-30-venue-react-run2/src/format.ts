const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LONG_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** `$240.00` */
export function formatMoney(cents: number) {
  const dollars = Math.floor(Math.abs(cents) / 100).toLocaleString("en-US");
  const rest = String(Math.abs(cents) % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}$${dollars}.${rest}`;
}

/**
 * The service gives times in the hall's own local time ("2026-11-13T19:30").
 * They are read as written, never shifted into the viewer's time zone.
 */
function parseHallTime(value: string) {
  const [date, time = "00:00"] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, weekday };
}

/** `Fri 13 Nov` */
export function formatDate(value: string) {
  const t = parseHallTime(value);
  return `${WEEKDAYS[t.weekday]} ${t.day} ${MONTHS[t.month - 1]}`;
}

/** `Friday 13 November`, for screen readers and the ticket. */
export function formatLongDate(value: string) {
  const t = parseHallTime(value);
  return `${LONG_WEEKDAYS[t.weekday]} ${t.day} ${LONG_MONTHS[t.month - 1]}`;
}

/** `7:30pm` */
export function formatTime(value: string) {
  const { hour, minute } = parseHallTime(value);
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, "0")}${hour < 12 ? "am" : "pm"}`;
}

export function dateParts(value: string) {
  const t = parseHallTime(value);
  return { weekday: WEEKDAYS[t.weekday], day: t.day, month: MONTHS[t.month - 1] };
}

/** `Orchestra, row C, seat 14` — also every seat's accessible name. */
export function seatLabel(sectionName: string, row: string, number: number) {
  return `${sectionName}, row ${row}, seat ${number}`;
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}
