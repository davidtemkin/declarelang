// Pure formatting: how names, durations and times are said. No state, no data.

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

/** "Priya", "Priya and Dana", "Priya, Dana and Kwame" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

/** seconds as m:ss */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

/** the local calendar day of an instant, as a sortable key */
export function dayKey(at: string | number): string {
  const d = new Date(at);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(toKey + "T12:00:00") - Date.parse(fromKey + "T12:00:00")) / 86400000);
}

/** 14:02 */
export function timeOfDay(at: string): string {
  const d = new Date(at);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

/** "Today", "Yesterday", "Tuesday", or "Tuesday 4 August" — the heading a day opens with */
export function dayLabel(at: string, today: string): string {
  const d = new Date(at);
  const ago = daysBetween(dayKey(at), today);
  if (ago == 0) return "Today";
  if (ago == 1) return "Yesterday";
  if (ago < 7) return DAYS[d.getDay()];
  const sameYear = dayKey(at).slice(0, 4) == today.slice(0, 4);
  return DAYS[d.getDay()] + " " + d.getDate() + " " + MONTHS[d.getMonth()] + (sameYear ? "" : " " + d.getFullYear());
}

/** the silence between two messages on one day, told as distance: "3 hours later · 14:02" */
export function gapLabel(ms: number, at: string): string {
  const h = Math.round(ms / 3600000);
  const span = ms < 90 * 60000 ? "An hour later" : h + " hours later";
  return span + " · " + timeOfDay(at);
}

/** the list's timestamp: a time today, a weekday this week, a date before that */
export function listTime(at: string, today: string): string {
  if (at == "") return "";
  const d = new Date(at);
  const ago = daysBetween(dayKey(at), today);
  if (ago == 0) return timeOfDay(at);
  if (ago == 1) return "Yesterday";
  if (ago < 7) return DAYS[d.getDay()].slice(0, 3);
  return d.getDate() + " " + MONTHS[d.getMonth()].slice(0, 3);
}

/** initials for a face that has no picture */
export function initials(name: string): string {
  const parts = name.split(/[\s-]+/).filter((p) => p != "");
  return ((parts[0] ?? "").charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "")).toUpperCase();
}

/** a stable small integer for a person, to choose their colour */
export function hueIndex(id: string, count: number): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % count;
}

/** the reactions on a message, grouped: "❤️ 2  😂" */
export function reactionSummary(emojis: string[]): string {
  const counts = new Map<string, number>();
  for (const e of emojis) counts.set(e, (counts.get(e) ?? 0) + 1);
  return [...counts].map(([e, n]) => (n > 1 ? e + " " + n : e)).join("  ");
}
