import type { CardBrand } from './api'

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** 24000 → "$240.00" */
export function formatMoney(cents: number): string {
  return money.format(cents / 100)
}

/** "$80" for whole dollars, used where space is tight and the amount is a price tier. */
export function formatPriceShort(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : formatMoney(cents)
}

// Performance times are the hall's local wall-clock time ("2026-11-13T19:30"),
// so they are parsed by hand rather than through Date, which would apply the
// viewer's time zone.
function parts(local: string) {
  const [date, time = '00:00'] = local.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return { y, m, d, hh, mm }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function weekdayIndex(y: number, m: number, d: number) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** "2026-11-13T19:30" → "Fri 13 Nov" */
export function formatDate(local: string): string {
  const { y, m, d } = parts(local)
  return `${WEEKDAYS[weekdayIndex(y, m, d)]} ${d} ${MONTHS[m - 1]}`
}

export function dateParts(local: string) {
  const { y, m, d } = parts(local)
  return {
    weekday: WEEKDAYS[weekdayIndex(y, m, d)],
    day: d,
    month: MONTHS[m - 1],
    monthLong: MONTHS_LONG[m - 1],
    year: y,
  }
}

/** "2026-11-13T19:30" → "7:30pm" */
export function formatTime(local: string): string {
  const { hh, mm } = parts(local)
  const suffix = hh >= 12 ? 'pm' : 'am'
  const h = hh % 12 === 0 ? 12 : hh % 12
  return `${h}:${String(mm).padStart(2, '0')}${suffix}`
}

export function isMatinee(local: string): boolean {
  return parts(local).hh < 17
}

/** "3 seats", "1 seat" */
export function seatCount(n: number): string {
  return `${n} ${n === 1 ? 'seat' : 'seats'}`
}

export const BRAND_NAMES: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
}

/** "Orchestra, row C, seat 14" — also each seat's accessible name. */
export function seatName(section: string, row: string, number: number): string {
  return `${section}, row ${row}, seat ${number}`
}

/** "A, B and C" */
export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
