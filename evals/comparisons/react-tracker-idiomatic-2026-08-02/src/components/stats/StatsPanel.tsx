import { STATUSES, STATUS_LABEL } from "../../data/types";
import { formatCount, formatDay } from "../../lib/format";
import { useViewModel } from "../../state/viewModel";
import { displayAssignee } from "../ui/Avatar";
import styles from "./StatsPanel.module.css";

/**
 * Every number here is recomputed from the currently visible records by
 * `computeStats`; nothing is cached or hand-maintained, so filters, edits and
 * deletions are reflected on the same commit that changes the data.
 */
export function StatsPanel() {
  const { stats } = useViewModel();
  const shown = stats.total;

  return (
    <section className={styles.panel} aria-label="Statistics">
      <h2 className={styles.heading}>By status</h2>
      <ul className={styles.statuses}>
        {STATUSES.map((status) => {
          const count = stats.byStatus[status];
          return (
            <li key={status} className={styles.status} data-status={status}>
              <span className={styles.statusName}>{STATUS_LABEL[status]}</span>
              <span className={styles.track} aria-hidden>
                <span
                  className={styles.fill}
                  style={{ inlineSize: `${shown === 0 ? 0 : (count / shown) * 100}%` }}
                />
              </span>
              <span className={styles.statusCount}>{formatCount(count)}</span>
            </li>
          );
        })}
      </ul>

      <h2 className={styles.heading}>Open work by assignee</h2>
      {stats.byAssignee.length === 0 ? (
        <p className={styles.none}>No open work.</p>
      ) : (
        <ul className={styles.people}>
          {stats.byAssignee.map(({ assignee, open }) => {
            const peak = stats.byAssignee[0].open;
            return (
              <li key={assignee} className={styles.person} data-assignee={assignee}>
                <span className={styles.personName}>{displayAssignee(assignee)}</span>
                <span className={styles.track} aria-hidden>
                  <span className={styles.fillAlt} style={{ inlineSize: `${(open / peak) * 100}%` }} />
                </span>
                <span className={styles.personCount}>{formatCount(open)}</span>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className={styles.heading}>Closed per day · last 14 days</h2>
      <div className={styles.chart} role="img" aria-label={closedSummary(stats.closedPerDay)}>
        {stats.closedPerDay.map(({ day, count }) => (
          <div key={day} className={styles.bar} title={`${formatDay(day)}: ${count} closed`}>
            <div
              className={styles.barFill}
              style={{ blockSize: `${(count / stats.peakClosed) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className={styles.axis}>
        <span>{formatDay(stats.closedPerDay[0].day)}</span>
        <span>{formatDay(stats.closedPerDay.at(-1)!.day)}</span>
      </div>
    </section>
  );
}

const closedSummary = (days: { day: number; count: number }[]): string =>
  `Issues closed per day: ${days.map((d) => `${formatDay(d.day)} ${d.count}`).join(", ")}`;
