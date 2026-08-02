import { Inbox, SearchX } from "lucide-react";
import { useTrackerStore } from "../../store/trackerStore";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  kind: "no-matches" | "no-issues";
  filtered: boolean;
}

/** Two distinct dead ends: nothing matches the query, vs. nothing exists. */
export function EmptyState({ kind, filtered }: EmptyStateProps) {
  const clearAllFilters = useTrackerStore((s) => s.clearAllFilters);
  const createIssue = useTrackerStore((s) => s.createIssue);

  if (kind === "no-issues") {
    return (
      <div className={styles.empty}>
        <Inbox size={30} aria-hidden />
        <h2>No issues exist</h2>
        <p>The backlog is empty. Create the first issue, or switch dataset scale.</p>
        <button type="button" className="btn btn--primary" onClick={() => createIssue()}>
          New issue
        </button>
      </div>
    );
  }

  return (
    <div className={styles.empty}>
      <SearchX size={30} aria-hidden />
      <h2>Nothing matches</h2>
      <p>No issue matches the current search and filters.</p>
      {filtered && (
        <button type="button" className="btn btn--primary" onClick={clearAllFilters}>
          Clear search &amp; filters
        </button>
      )}
    </div>
  );
}
