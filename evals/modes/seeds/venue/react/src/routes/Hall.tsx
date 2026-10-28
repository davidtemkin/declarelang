import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useBooking } from '../booking'
import { formatDate, formatMoney, formatPriceShort, formatTime, seatCount } from '../format'
import { useLiveSeats } from '../hall/LiveSeats'
import { SeatMap } from '../hall/SeatMap'
import { useProduction } from '../queries'
import { useMediaQuery } from '../useMediaQuery'
import { usePageTitle } from './usePageTitle'
import styles from './Hall.module.css'

export function Hall() {
  const { performance, seatMap, sold, seats } = useLiveSeats()
  const { selected, toggle, notice } = useBooking()
  const production = useProduction()
  const when = `${formatDate(performance.startsAt)}, ${formatTime(performance.startsAt)}`
  const headingRef = usePageTitle<HTMLHeadingElement>(`Choose seats · ${when}`)

  const total = seatMap.sections.reduce(
    (n, s) => n + s.rows.reduce((m, r) => m + r.seats.length, 0),
    0,
  )
  const free = total - sold.size
  const lost = useMemo(() => new Set(notice?.seatIds ?? []), [notice])

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <Link to="/" className={styles.back}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m10 3-5 5 5 5" />
          </svg>
          All performances
        </Link>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          {formatDate(performance.startsAt)}
          <span className={styles.time}>{formatTime(performance.startsAt)}</span>
        </h1>
        <p className={styles.meta}>
          {production.data?.title} · {production.data?.hall} ·{' '}
          <span className="amount">{free}</span> of {total} seats free
        </p>
      </header>

      <div className={styles.layout}>
        <section className={styles.map} aria-label="Seating plan">
          <p className="visually-hidden">
            The stage is at the front. Use the arrow keys to move between seats, and Enter or Space
            to choose or unchoose one.
          </p>
          <SeatMap
            seatMap={seatMap}
            sold={sold}
            selected={selected}
            lost={lost}
            onToggle={toggle}
          />
        </section>

        <aside className={styles.key} aria-label="Key and prices">
          <ul className={styles.legend}>
            <li>
              <span className={styles.chair} data-state="free" aria-hidden="true" /> Free
            </li>
            <li>
              <span className={styles.chair} data-state="mine" aria-hidden="true">
                <svg viewBox="0 0 12 12">
                  <path d="M2.5 6.2 5 8.6 9.6 3.6" />
                </svg>
              </span>{' '}
              Yours
            </li>
            <li>
              <span className={styles.chair} data-state="sold" aria-hidden="true" /> Sold
            </li>
          </ul>
          <table className={styles.prices}>
            <caption className="visually-hidden">Prices by section</caption>
            <thead className="visually-hidden">
              <tr>
                <th scope="col">Section</th>
                <th scope="col">Price</th>
                <th scope="col">Free seats</th>
              </tr>
            </thead>
            <tbody>
              {seatMap.sections.map((s) => {
                const ids = s.rows.flatMap((r) => r.seats.map((seat) => seat.id))
                const left = ids.filter((id) => !sold.has(id)).length
                return (
                  <tr key={s.key}>
                    <th scope="row">
                      <span className={styles.swatch} data-section={s.key} aria-hidden="true" />
                      {s.name}
                    </th>
                    <td className="amount">{formatPriceShort(s.priceCents)}</td>
                    <td className={styles.left}>
                      <span className="amount">{left}</span> free
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </aside>

        <Selection seats={seats} selected={selected} onRemove={toggle} />
      </div>
    </div>
  )
}

function Selection({
  seats,
  selected,
  onRemove,
}: {
  seats: ReturnType<typeof useLiveSeats>['seats']
  selected: string[]
  onRemove: (id: string) => void
}) {
  const { notice, dismissNotice } = useBooking()
  // At a desk the list is always shown; on a phone it folds away behind the summary.
  const wide = useMediaQuery('(min-width: 60rem)')
  const [open, setOpen] = useState(false)
  const listHeadingRef = useRef<HTMLHeadingElement>(null)
  const chosen = selected.map((id) => seats.get(id)!).filter(Boolean)
  const subtotal = chosen.reduce((n, s) => n + s.priceCents, 0)
  const fees = chosen.reduce((n, s) => n + s.feeCents, 0)
  const has = chosen.length > 0

  function remove(id: string, index: number) {
    onRemove(id)
    // Keep focus in the list: on the next seat's button, or the heading if it was the last.
    requestAnimationFrame(() => {
      const buttons = document.querySelectorAll<HTMLButtonElement>('[data-remove-seat]')
      const next = buttons[Math.min(index, buttons.length - 1)]
      ;(next ?? listHeadingRef.current)?.focus()
    })
  }

  return (
    <section
      className={styles.selection}
      data-open={open || undefined}
      aria-labelledby="your-seats"
    >
      <div className={styles.notice} data-visible={notice ? true : undefined}>
        <p role="status" className={styles.noticeText}>
          {notice?.text}
        </p>
        {notice && (
          <button type="button" className={styles.dismiss} onClick={dismissNotice}>
            <span className="visually-hidden">Dismiss</span>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
      </div>

      <h2 id="your-seats" ref={listHeadingRef} tabIndex={-1} className={styles.selectionTitle}>
        Your seats
      </h2>

      {has && (wide || open) && (
        <ul className={styles.chosen} id="chosen-seats">
          {chosen.map((s, i) => (
            <li key={s.id}>
              <span className={styles.chosenName}>
                <span className={styles.chosenSection}>{s.sectionName}</span>
                Row {s.row}, seat {s.number}
              </span>
              <span className="amount">{formatMoney(s.priceCents)}</span>
              <button
                type="button"
                className={styles.remove}
                data-remove-seat
                onClick={() => remove(s.id, i)}
              >
                <span className="visually-hidden">Remove {s.name}</span>
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="m4 4 8 8M12 4l-8 8" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.bar}>
        <div className={styles.summary} aria-live="polite" aria-atomic="true">
          {has ? (
            <>
              {wide ? (
                <SummaryLine count={chosen.length} subtotal={subtotal} />
              ) : (
                <button
                  type="button"
                  className={styles.summaryToggle}
                  aria-expanded={open}
                  aria-controls="chosen-seats"
                  onClick={() => setOpen((o) => !o)}
                >
                  <SummaryLine count={chosen.length} subtotal={subtotal} />
                  <svg viewBox="0 0 16 16" aria-hidden="true" className={styles.caret}>
                    <path d="m4 10 4-4 4 4" />
                  </svg>
                </button>
              )}
              <span className={styles.fees}>
                plus <span className="amount">{formatMoney(fees)}</span> booking fees
              </span>
            </>
          ) : (
            <span className={styles.empty}>
              <span className={styles.touchOnly}>Tap the plan to zoom in, then tap your seats</span>
              <span className={styles.pointerOnly}>Choose your seats in the plan</span>
            </span>
          )}
        </div>
        {has && (
          <Link to="checkout" className={`button button-primary ${styles.continue}`}>
            Continue
          </Link>
        )}
      </div>
    </section>
  )
}

/** Reads exactly "3 seats · $240.00"; re-keyed so each change registers. */
function SummaryLine({ count, subtotal }: { count: number; subtotal: number }) {
  return (
    <strong key={`${count}-${subtotal}`} className={`${styles.count} amount`}>
      {seatCount(count)} · {formatMoney(subtotal)}
    </strong>
  )
}
