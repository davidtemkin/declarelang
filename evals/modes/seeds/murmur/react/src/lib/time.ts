const DAY = 24 * 60 * 60 * 1000

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const dayMonthFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const fullDayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const fullDayYearFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const stampFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Whole calendar days between two instants, in local time. */
export function daysBetween(earlier: number, later: number): number {
  return Math.round((startOfDay(later) - startOfDay(earlier)) / DAY)
}

export function formatTime(t: number): string {
  return timeFormat.format(t)
}

/** Compact, for the conversation list. */
export function formatListTime(t: number, now = Date.now()): string {
  const days = daysBetween(t, now)
  if (days <= 0) return timeFormat.format(t)
  if (days === 1) return 'Yesterday'
  if (days < 7) return weekdayFormat.format(t)
  return dayMonthFormat.format(t)
}

/** For the heading over a day of conversation. */
export function formatDay(t: number, now = Date.now()): string {
  const days = daysBetween(t, now)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  const sameYear = new Date(t).getFullYear() === new Date(now).getFullYear()
  return (sameYear ? fullDayFormat : fullDayYearFormat).format(t)
}

export function formatStamp(t: number): string {
  return stampFormat.format(t)
}

/** "0:07", "12:40" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** "40 minutes", "3 hours" — the length of a pause in conversation. */
export function formatPause(ms: number): string {
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  return hours === 1 ? '1 hour' : `${hours} hours`
}
