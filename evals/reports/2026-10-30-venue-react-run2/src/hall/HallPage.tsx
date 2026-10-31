import { useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { formatDate, formatMoney, formatTime, plural } from "../format";
import { usePerformance } from "../performances/PerformanceRoute";
import { useSelection } from "../selection";
import { Notices } from "../ui/Notices";
import { BackLink, SiteHeader } from "../ui/SiteHeader";
import { useFocusOnArrival } from "../ui/useFocusOnArrival";
import { Hall } from "./Hall";
import { chosenSeats } from "./seats";
import styles from "./HallPage.module.css";

export function HallPage() {
  const { performanceId = "" } = useParams();
  const { production, performance, seatMap, justTaken } = usePerformance();
  const { seatIdsFor, toggleSeat } = useSelection();
  const navigate = useNavigate();
  const heading = useFocusOnArrival<HTMLHeadingElement>();

  const seatIds = seatIdsFor(performanceId);
  const selected = useMemo(() => new Set(seatIds), [seatIds]);
  const chosen = useMemo(() => chosenSeats(seatMap, seatIds), [seatMap, seatIds]);
  const total = chosen.reduce((sum, { section }) => sum + section.priceCents, 0);
  const left = seatMap.sections.reduce(
    (n, s) => n + s.rows.reduce((m, r) => m + r.seats.filter((x) => x.status === "available").length, 0),
    0,
  );
  const onToggle = useCallback((seatId: string) => toggleSeat(performanceId, seatId), [performanceId, toggleSeat]);

  return (
    <div className={styles.screen}>
      <SiteHeader back={<BackLink to="/">All performances</BackLink>} />
      <main className={styles.main}>
        <header className={styles.head}>
          <h1 ref={heading} tabIndex={-1} className={styles.title}>
            <span className="visually-hidden">{production.title}, </span>
            {formatDate(performance.startsAt)} <span className={styles.dot}>·</span>{" "}
            {formatTime(performance.startsAt)}
          </h1>
          <p className={styles.sub}>
            {plural(left, "seat")} free of {performance.seats}
          </p>
        </header>

        <Notices />

        <div className={styles.hall}>
          <Hall map={seatMap} selected={selected} justTaken={justTaken} onToggle={onToggle} />
        </div>

        <aside className={styles.aside} aria-label="Your choice">
          <Legend />

          <section className={styles.prices} aria-label="Prices">
            <ul>
              {seatMap.sections.map((section, tier) => (
                <li key={section.key}>
                  <span className={styles.swatch} data-tier={tier} aria-hidden="true" />
                  <span>{section.name}</span>
                  <span className="amount">{formatMoney(section.priceCents)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.choice}>
            {chosen.length > 0 ? (
              <ol className={styles.chosenList}>
                {chosen.map(({ seat, section, row }) => (
                  <li key={seat.id}>
                    <span>
                      {section.name}, row {row}, seat {seat.number}
                    </span>
                    <span className="amount">{formatMoney(section.priceCents)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.hint}>Pick a seat to choose it; pick it again to let it go.</p>
            )}

            <div className={styles.bar}>
              <p className={styles.summary} aria-live="polite">
                {chosen.length > 0 && (
                  <span key={`${chosen.length}-${total}`} className={styles.summaryText}>
                    {`${plural(chosen.length, "seat")} · ${formatMoney(total)}`}
                  </span>
                )}
              </p>
              {chosen.length > 0 && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => navigate(`/performances/${performanceId}/checkout`)}
                >
                  Continue
                </button>
              )}
            </div>
          </section>
        </aside>
      </main>
    </div>
  );
}

function Legend() {
  return (
    <ul className={styles.legend} aria-label="Key">
      <li>
        <span className={styles.key} data-state="free" aria-hidden="true" />
        Free
      </li>
      <li>
        <span className={styles.key} data-state="chosen" aria-hidden="true">
          <svg viewBox="0 0 12 12">
            <path d="M2.6 6.4 5 8.6 9.4 3.6" />
          </svg>
        </span>
        Yours
      </li>
      <li>
        <span className={styles.key} data-state="sold" aria-hidden="true" />
        Gone
      </li>
    </ul>
  );
}
