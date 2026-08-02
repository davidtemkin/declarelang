import { useShallow } from "zustand/react/shallow";
import { formatCount, formatDay, formatMs } from "../../lib/format";
import { useHorizon, useTrackerStore } from "../../store/trackerStore";
import { useViewModel } from "../../state/viewModel";
import styles from "./MetricsBar.module.css";

/** The app's own measurements — taken at runtime, never hardcoded (Noun 14). */
export function MetricsBar() {
  const metrics = useTrackerStore(useShallow((s) => s.metrics));
  const horizon = useHorizon();
  const { visible, total } = useViewModel();

  return (
    <footer className={styles.bar}>
      <span className={styles.item} title="fetch + parse of the dataset, or its in-memory regeneration">
        load <b>{formatMs(metrics.loadMs)}</b>
      </span>
      <span className={styles.item} title="records in hand → store populated and first list render committed">
        ingest <b>{formatMs(metrics.ingestMs)}</b>
      </span>
      <span className={styles.item} title="last filter recompute over the full dataset">
        search <b>{formatMs(metrics.searchMs)}</b>
      </span>
      <span className={styles.spacer} />
      <span className={styles.item}>
        {formatCount(visible.length)} / {formatCount(total)} rows
      </span>
      <span className={styles.item} title="the newest timestamp in the dataset; all ages are relative to it">
        dataset today <b>{horizon > 0 ? formatDay(horizon) : "—"}</b>
      </span>
    </footer>
  );
}
