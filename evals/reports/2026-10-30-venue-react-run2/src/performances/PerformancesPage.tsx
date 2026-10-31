import type { CSSProperties } from "react";
import { Link } from "react-router";
import { useProduction } from "../api/queries";
import type { Performance } from "../api/types";
import { dateParts, formatLongDate, formatMoney, formatTime } from "../format";
import { PageMessage } from "../ui/PageMessage";
import { SiteHeader } from "../ui/SiteHeader";
import { useFocusOnArrival } from "../ui/useFocusOnArrival";
import styles from "./PerformancesPage.module.css";

const NEARLY_SOLD_OUT = 0.15;

export function PerformancesPage() {
  const production = useProduction();
  const heading = useFocusOnArrival<HTMLHeadingElement>();

  if (production.isError)
    return (
      <PageMessage
        title="The box office isn't answering"
        body={production.error.message}
        onRetry={() => void production.refetch()}
      />
    );
  if (!production.data) return <PageMessage title="Opening the box office…" busy />;

  const { title, hall, runningTime, performances } = production.data;
  const months = groupByMonth(performances);

  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <header className={styles.hero}>
          <p className={styles.kicker}>
            {hall} · this season · {performances.length} performances
          </p>
          <h1 ref={heading} tabIndex={-1} className={styles.title}>
            {title}
          </h1>
          <p className={styles.meta}>Running time {runningTime}, with one interval</p>
        </header>

        <h2 className="visually-hidden">Choose a performance</h2>
        {months.map(({ month, items }) => (
          <section key={month} className={styles.month} aria-labelledby={`month-${month}`}>
            <h3 id={`month-${month}`} className={styles.monthName}>
              {month}
            </h3>
            <ul className={styles.list}>
              {items.map((performance) => (
                <li key={performance.id}>
                  <PerformanceRow performance={performance} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </>
  );
}

function PerformanceRow({ performance }: { performance: Performance }) {
  const { weekday, day, month } = dateParts(performance.startsAt);
  const left = performance.seatsLeft;
  const fullness = 1 - left / performance.seats;
  const soldOut = left <= 0;
  const nearlyGone = !soldOut && left / performance.seats <= NEARLY_SOLD_OUT;
  const matinee = Number(performance.startsAt.slice(11, 13)) < 17;

  const availability = soldOut
    ? "Sold out"
    : nearlyGone
      ? `Nearly sold out · ${left} left`
      : `${left} of ${performance.seats} seats left`;

  const content = (
    <>
      <span className={styles.date} aria-hidden="true">
        <span className={styles.weekday}>{weekday}</span>
        <span className={styles.day}>{day}</span>
        <span className={styles.monthShort}>{month}</span>
      </span>
      <span className="visually-hidden">{formatLongDate(performance.startsAt)}, </span>
      <span className={styles.when}>
        <span className={styles.time}>{formatTime(performance.startsAt)}</span>
        {matinee && <span className={styles.matinee}>Matinee</span>}
      </span>
      <span className={styles.fill}>
        <span
          className={styles.meter}
          style={{ "--full": fullness } as CSSProperties}
          aria-hidden="true"
        />
        <span className={styles.left}>
          <span className="visually-hidden">, </span>
          {availability}
        </span>
      </span>
      <span className={styles.price}>
        <span className="visually-hidden">, </span>
        <span className={styles.from}>from</span> {formatMoney(performance.priceFromCents)}
      </span>
    </>
  );

  if (soldOut) {
    return (
      <div className={styles.row} data-sold-out>
        {content}
      </div>
    );
  }
  return (
    <Link
      to={`/performances/${performance.id}`}
      className={styles.row}
      data-nearly-gone={nearlyGone || undefined}
    >
      {content}
    </Link>
  );
}

function groupByMonth(performances: Performance[]) {
  const months: { month: string; items: Performance[] }[] = [];
  for (const performance of performances) {
    const month = new Date(`${performance.startsAt.slice(0, 7)}-01T12:00`).toLocaleString("en-GB", {
      month: "long",
    });
    const last = months[months.length - 1];
    if (last?.month === month) last.items.push(performance);
    else months.push({ month, items: [performance] });
  }
  return months;
}
