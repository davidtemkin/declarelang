import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { QRCodeSVG } from "qrcode.react";
import { useProduction } from "../api/queries";
import type { Order, Performance, Ticket } from "../api/types";
import { BRAND_NAMES } from "../checkout/card";
import { formatDate, formatLongDate, formatMoney, formatTime, plural } from "../format";
import { useSelection } from "../selection";
import { SiteHeader } from "../ui/SiteHeader";
import { useFocusOnArrival } from "../ui/useFocusOnArrival";
import styles from "./Tickets.module.css";

export function TicketsPage() {
  const { order, reset } = useSelection();
  const production = useProduction();
  const navigate = useNavigate();
  const heading = useFocusOnArrival<HTMLHeadingElement>();

  if (!order) return <Navigate to="/" replace />;
  const performance = production.data?.performances.find((p) => p.id === order.performanceId);

  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <header className={styles.head}>
          <p className={styles.kicker}>Paid · {plural(order.tickets.length, "ticket")}</p>
          <h1 ref={heading} tabIndex={-1} className={styles.title}>
            You’re going to the opera.
          </h1>
          <dl className={styles.facts}>
            <div>
              <dt>Confirmation</dt>
              <dd className={styles.code}>{order.code}</dd>
            </div>
            <div>
              <dt>Paid</dt>
              <dd>
                {formatMoney(order.totalCents)} · {BRAND_NAMES[order.brand]} ending {order.last4}
              </dd>
            </div>
          </dl>
          <p className={styles.sent}>Sent to {order.email}</p>
        </header>

        {performance && (
          <Wallet order={order} performance={performance} title={production.data!.title} hall={production.data!.hall} />
        )}

        <div className={styles.again}>
          <button
            type="button"
            className="button button-quiet"
            onClick={() => {
              reset();
              navigate("/");
            }}
          >
            Book another performance
          </button>
        </div>
      </main>
    </>
  );
}

/** The tickets, one at a time, each one the thing to hold up at the door. */
function Wallet({ order, performance, title, hall }: { order: Order; performance: Performance; title: string; hall: string }) {
  const track = useRef<HTMLOListElement>(null);
  const [current, setCurrent] = useState(0);
  const count = order.tickets.length;

  useEffect(() => {
    const element = track.current!;
    const onScroll = () => setCurrent(Math.round(element.scrollLeft / element.clientWidth));
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, []);

  const show = (index: number) => {
    const element = track.current!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({ left: index * element.clientWidth, behavior: reduced ? "auto" : "smooth" });
    setCurrent(index);
  };

  return (
    <section className={styles.wallet} aria-roledescription="carousel" aria-label="Your tickets">
      <ol ref={track} className={styles.track}>
        {order.tickets.map((ticket, i) => (
          <li
            key={ticket.barcode}
            className={styles.slot}
            aria-roledescription="slide"
            aria-label={`Ticket ${i + 1} of ${count}`}
            inert={i !== current || undefined}
          >
            <TicketCard ticket={ticket} performance={performance} title={title} hall={hall} index={i} count={count} />
          </li>
        ))}
      </ol>

      {count > 1 && (
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.step}
            onClick={() => current > 0 && show(current - 1)}
            aria-disabled={current === 0}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
            Previous ticket
          </button>
          <p className={styles.position} aria-live="polite">
            {current + 1} of {count}
          </p>
          <button
            type="button"
            className={styles.step}
            onClick={() => current < count - 1 && show(current + 1)}
            aria-disabled={current === count - 1}
          >
            Next ticket
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
          </button>
        </div>
      )}
    </section>
  );
}

function TicketCard({
  ticket, performance, title, hall, index, count,
}: { ticket: Ticket; performance: Performance; title: string; hall: string; index: number; count: number }) {
  return (
    <article className={styles.ticket}>
      <header className={styles.ticketHead}>
        <p className={styles.ticketHall}>{hall}</p>
        <h2 className={styles.ticketTitle}>{title}</h2>
        <p className={styles.ticketWhen}>
          <span aria-hidden="true">{formatDate(performance.startsAt)}</span>
          <span className="visually-hidden">{formatLongDate(performance.startsAt)}</span>
          <span className={styles.sep} aria-hidden="true"> · </span>
          <span className="visually-hidden">, at </span>
          {formatTime(performance.startsAt)}
        </p>
      </header>

      <dl className={styles.seat}>
        <div>
          <dt>Section</dt>
          <dd className={styles.sectionName}>{ticket.section}</dd>
        </div>
        <div>
          <dt>Row</dt>
          <dd>{ticket.row}</dd>
        </div>
        <div>
          <dt>Seat</dt>
          <dd>{ticket.number}</dd>
        </div>
      </dl>

      <p className={styles.doors}>
        Arrive by <strong>{formatTime(performance.doorsAt)}</strong> — doors open then
      </p>

      <div className={styles.stub}>
        <QRCodeSVG
          value={ticket.barcode}
          size={176}
          level="M"
          marginSize={0}
          className={styles.qr}
          role="img"
          aria-label={`Scannable code ${ticket.barcode}`}
        />
        <p className={styles.barcode}>{ticket.barcode}</p>
        <p className={styles.count}>
          Ticket {index + 1} of {count}
        </p>
      </div>
    </article>
  );
}
