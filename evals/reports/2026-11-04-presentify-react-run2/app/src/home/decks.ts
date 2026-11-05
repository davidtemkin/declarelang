/** The query holding the list of presentations. */
export const decksKey = ['decks'] as const

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000
  const abs = Math.abs(seconds)
  if (abs < 45) return 'Edited just now'
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['minute', 60],
    ['hour', 3600],
    ['day', 86400],
    ['week', 604800],
  ]
  for (let i = units.length - 1; i >= 0; i--) {
    const [unit, size] = units[i]
    if (abs >= size || unit === 'minute') {
      if (unit === 'week' && abs > 604800 * 4) break
      return `Edited ${rtf.format(Math.round(seconds / size), unit)}`
    }
  }
  return `Edited ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
}
