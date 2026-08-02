import { ArrowDownWideNarrow, ArrowUpNarrowWide, Plus, Rows3 } from "lucide-react";
import type { SortKey } from "../../domain/query";
import { formatCount } from "../../lib/format";
import { useTrackerStore } from "../../store/trackerStore";
import { useViewModel } from "../../state/viewModel";
import { SelectionBar } from "./SelectionBar";
import styles from "./ListToolbar.module.css";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "updated", label: "Last updated" },
  { value: "priority", label: "Priority" },
  { value: "title", label: "Title" },
];

export function ListToolbar() {
  const { visible, total, filtering } = useViewModel();
  const sort = useTrackerStore((s) => s.sort);
  const grouped = useTrackerStore((s) => s.grouped);
  const setSortKey = useTrackerStore((s) => s.setSortKey);
  const toggleSortDir = useTrackerStore((s) => s.toggleSortDir);
  const setGrouped = useTrackerStore((s) => s.setGrouped);
  const createIssue = useTrackerStore((s) => s.createIssue);

  return (
    <div className={styles.toolbar}>
      <div className={styles.row}>
        <p className={styles.counts} aria-live="polite" data-pending={filtering || undefined}>
          <strong>{formatCount(visible.length)}</strong>
          <span> shown of </span>
          <strong>{formatCount(total)}</strong>
          <span> issues</span>
        </p>

        <div className={styles.controls}>
          <label className={styles.sort}>
            <span className={styles.sortLabel}>Sort</span>
            <select
              className="field"
              aria-label="Sort field"
              value={sort.key}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn btn--icon"
            onClick={toggleSortDir}
            title={sort.dir === "asc" ? "Ascending" : "Descending"}
            aria-label={`Sort direction: ${sort.dir === "asc" ? "ascending" : "descending"}`}
          >
            {sort.dir === "asc" ? (
              <ArrowUpNarrowWide size={15} aria-hidden />
            ) : (
              <ArrowDownWideNarrow size={15} aria-hidden />
            )}
          </button>

          <button
            type="button"
            className="btn"
            aria-label="Group by status"
            aria-pressed={grouped}
            onClick={() => setGrouped(!grouped)}
          >
            <Rows3 size={15} aria-hidden />
            <span className={styles.wide}>Group by status</span>
            <span className={styles.narrow}>Group</span>
          </button>

          <button
            type="button"
            className="btn btn--primary"
            aria-label="New issue"
            onClick={() => createIssue()}
          >
            <Plus size={15} aria-hidden />
            <span className={styles.wide}>New issue</span>
          </button>
        </div>
      </div>

      <SelectionBar />
    </div>
  );
}
