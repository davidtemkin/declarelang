import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import type { Performance } from '../api'
import { dateParts, formatDate, formatMoney, formatTime, isMatinee } from '../format'
import { useProduction } from '../queries'
import { LoadError, Loading } from './Status'
import { usePageTitle } from './usePageTitle'
import styles from './Performances.module.css'

/** Under this share of seats left, a performance is called nearly sold out. */
const NEARLY_SOLD_OUT = 0.15

export function Performances() {
  const production = useProduction()
  const headingRef = usePageTitle<HTMLHeadingElement>(production.data?.title ?? 'Performances')

  if (production.isPending) return <Loading label="Finding performances…" />
  if (production.error) return <LoadError error={production.error} retry={production.refetch} />

  const { title, hall, runningTime, performances } = production.data
  const months = groupByMonth(performances)

  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <p className={styles.kicker}>{hall} · This season</p>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          {title}
        </h1>
        <p className={styles.meta}>
          Mozart’s comedy in four acts · {runningTime} · {performances.length} performances
        </p>
      </header>

      <h2 className={styles.prompt}>Choose a performance</h2>

      {months.map(({ month, items }) => (
        <section key={month} className={styles.month} aria-labelledby={`month-${month}`}>
          <h3 id={`month-${month}`} className={styles.monthName}>
            {month}
          </h3>
          <ul className={styles.list}>
            {items.map((p) => (
              <li key={p.id}>
                <PerformanceRow performance={p} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function PerformanceRow({ performance: p }: { performance: Performance }) {
  const { weekday, day, month } = dateParts(p.startsAt)
  const left = p.seatsLeft / p.seats
  const soldOut = p.seatsLeft === 0
  const nearly = !soldOut && left <= NEARLY_SOLD_OUT
  const matinee = isMatinee(p.startsAt)
  const availability = soldOut
    ? 'Sold out'
    : nearly
      ? `Nearly sold out · ${p.seatsLeft} left`
      : `${p.seatsLeft} of ${p.seats} seats left`

  const content = (
    <>
      <span className={styles.date} aria-hidden="true">
        <span className={styles.weekday}>{weekday}</span>
        <span className={styles.day}>{day}</span>
        <span className={styles.monthShort}>{month}</span>
      </span>
      <span className={styles.when}>
        <span className={styles.time}>
          {formatTime(p.startsAt)}
          {matinee && <span className={styles.matinee}>Matinee</span>}
        </span>
        <span className={styles.availability} data-nearly={nearly || undefined}>
          {availability}
        </span>
      </span>
      <span
        className={styles.fill}
        aria-hidden="true"
        style={{ '--sold': 1 - left } as CSSProperties}
        data-nearly={nearly || undefined}
      />
      <span className={styles.price}>
        <span className={styles.from}>from</span>{' '}
        <span className="amount">{formatMoney(p.priceFromCents)}</span>
      </span>
      <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true">
        <path d="m6 3 5 5-5 5" />
      </svg>
    </>
  )

  const label = `${formatDate(p.startsAt)}, ${formatTime(p.startsAt)}${matinee ? ', matinee' : ''}`
  const description = `${availability}. From ${formatMoney(p.priceFromCents)}.`

  if (soldOut) {
    return (
      <div className={styles.row} data-sold-out aria-label={`${label}. Sold out.`} role="group">
        {content}
      </div>
    )
  }
  return (
    <Link
      to={`/performances/${p.id}`}
      className={styles.row}
      data-nearly={nearly || undefined}
      aria-label={`${label}. ${description}`}
    >
      {content}
    </Link>
  )
}

function groupByMonth(performances: Performance[]) {
  const groups: { month: string; items: Performance[] }[] = []
  for (const p of performances) {
    const { monthLong } = dateParts(p.startsAt)
    const last = groups[groups.length - 1]
    if (last?.month === monthLong) last.items.push(p)
    else groups.push({ month: monthLong, items: [p] })
  }
  return groups
}
