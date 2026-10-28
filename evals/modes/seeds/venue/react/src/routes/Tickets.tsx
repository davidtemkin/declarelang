import { QRCodeSVG } from 'qrcode.react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { Order, Performance, Ticket } from '../api'
import { useBooking } from '../booking'
import { BRAND_NAMES, dateParts, formatMoney, formatTime } from '../format'
import { useProduction } from '../queries'
import { Gone } from './Status'
import { usePageTitle } from './usePageTitle'
import styles from './Tickets.module.css'

export function Tickets() {
  const { order, reset } = useBooking()
  const production = useProduction()
  const navigate = useNavigate()
  const headingRef = usePageTitle<HTMLHeadingElement>('Your tickets')

  if (!order) {
    return (
      <Gone title="Your tickets are in your email">
        Each booking’s tickets are sent to the email address it was paid with.
      </Gone>
    )
  }

  const performance = production.data?.performances.find((p) => p.id === order.performanceId)

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <p className={styles.kicker}>Booking confirmed</p>
        <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
          {order.tickets.length === 1 ? 'Your ticket' : 'Your tickets'}
        </h1>
        <dl className={styles.facts}>
          <div>
            <dt>Confirmation</dt>
            <dd className={styles.code}>{order.code}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            <dd>
              <span className="amount">{formatMoney(order.totalCents)}</span> with{' '}
              {BRAND_NAMES[order.brand]} ending {order.last4}
            </dd>
          </div>
        </dl>
        <p className={styles.sent}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.5" />
            <path d="m2.5 4.5 5.5 4 5.5-4" />
          </svg>
          Sent to {order.email}
        </p>
      </header>

      {performance && production.data && (
        <TicketCarousel
          order={order}
          performance={performance}
          title={production.data.title}
          hall={production.data.hall}
        />
      )}

      <div className={styles.again}>
        <button
          type="button"
          className="button button-quiet"
          onClick={() => {
            reset()
            navigate('/')
          }}
        >
          Start a new booking
        </button>
      </div>
    </div>
  )
}

function TicketCarousel({
  order,
  performance,
  title,
  hall,
}: {
  order: Order
  performance: Performance
  title: string
  hall: string
}) {
  const trackRef = useRef<HTMLOListElement>(null)
  const [index, setIndex] = useState(0)
  const count = order.tickets.length

  function go(to: number) {
    const track = trackRef.current
    const slide = track?.children[to] as HTMLElement | undefined
    if (!track || !slide || to === index) return
    track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: 'smooth' })
    setIndex(to)
  }

  return (
    <section className={styles.carousel} aria-roledescription="carousel" aria-label="Tickets">
      <ol
        ref={trackRef}
        className={styles.track}
        onScroll={(e) => {
          const track = e.currentTarget
          const width = (track.children[0] as HTMLElement | undefined)?.offsetWidth ?? 1
          setIndex(Math.max(0, Math.min(count - 1, Math.round(track.scrollLeft / width))))
        }}
      >
        {order.tickets.map((ticket, i) => (
          <li
            key={ticket.barcode}
            className={styles.slide}
            aria-roledescription="slide"
            aria-label={`Ticket ${i + 1} of ${count}`}
          >
            <TicketCard ticket={ticket} performance={performance} title={title} hall={hall} />
          </li>
        ))}
      </ol>

      {count > 1 && (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.step}
            onClick={() => go(index - 1)}
            // Not `disabled`: that would drop focus from the button just pressed.
            aria-disabled={index === 0 || undefined}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m10 3-5 5 5 5" />
            </svg>
            <span className="visually-hidden">Previous ticket</span>
          </button>
          <p className={styles.position} aria-live="polite">
            Ticket <span className="amount">{index + 1}</span> of {count}
          </p>
          <button
            type="button"
            className={styles.step}
            onClick={() => go(index + 1)}
            aria-disabled={index === count - 1 || undefined}
          >
            <span className="visually-hidden">Next ticket</span>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m6 3 5 5-5 5" />
            </svg>
          </button>
        </div>
      )}
    </section>
  )
}

/** One ticket, made to be held up at the door: the seat first, big; the code to scan, clear. */
function TicketCard({
  ticket,
  performance,
  title,
  hall,
}: {
  ticket: Ticket
  performance: Performance
  title: string
  hall: string
}) {
  const { weekday, day, month } = dateParts(performance.startsAt)
  return (
    <article className={styles.ticket}>
      <div className={styles.stub}>
        <p className={styles.show}>{title}</p>
        <p className={styles.venue}>{hall}</p>
        <p className={styles.when}>
          <span>
            {weekday} {day} {month}
          </span>
          <span>{formatTime(performance.startsAt)}</span>
        </p>
      </div>

      <dl className={styles.seat}>
        <div className={styles.section}>
          <dt>Section</dt>
          <dd>{ticket.section}</dd>
        </div>
        <div>
          <dt>Row</dt>
          <dd className={styles.big}>{ticket.row}</dd>
        </div>
        <div>
          <dt>Seat</dt>
          <dd className={styles.big}>{ticket.number}</dd>
        </div>
      </dl>

      <div className={styles.tear} aria-hidden="true" />

      <div className={styles.scan}>
        <QRCodeSVG
          value={ticket.barcode}
          size={176}
          level="M"
          marginSize={0}
          className={styles.qr}
          title={`Scannable code ${ticket.barcode}`}
        />
        <p className={styles.barcode}>{ticket.barcode}</p>
        <p className={styles.doors}>
          Doors open <strong>{formatTime(performance.doorsAt)}</strong> — please arrive by then.
        </p>
      </div>
    </article>
  )
}
