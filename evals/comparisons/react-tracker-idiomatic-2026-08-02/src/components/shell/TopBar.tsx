import { PanelLeft, Search, X } from "lucide-react";
import { formatCount } from "../../lib/format";
import { SCALES, useTrackerStore, type Scale } from "../../store/trackerStore";
import { ThemeToggle } from "./ThemeToggle";
import { SEARCH_INPUT_ID } from "../../hooks/useKeyboardShortcuts";
import styles from "./TopBar.module.css";

const SCALE_LABEL: Record<Scale, string> = {
  10000: "10K",
  100000: "100K",
  1000000: "1M",
};

export function TopBar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const query = useTrackerStore((s) => s.query);
  const setQuery = useTrackerStore((s) => s.setQuery);
  const scale = useTrackerStore((s) => s.scale);
  const loading = useTrackerStore((s) => s.loading);
  const loadScale = useTrackerStore((s) => s.loadScale);

  return (
    <header className={styles.bar}>
      <button
        type="button"
        className={`btn btn--icon btn--ghost ${styles.panelToggle}`}
        onClick={onToggleSidebar}
        aria-label="Toggle filters and statistics"
      >
        <PanelLeft size={16} aria-hidden />
      </button>

      <span className={styles.brand}>Tracker</span>

      <div className={styles.searchWrap}>
        <Search size={15} className={styles.searchIcon} aria-hidden />
        <input
          id={SEARCH_INPUT_ID}
          className={styles.search}
          type="search"
          role="searchbox"
          placeholder="Search titles, descriptions, labels, people…"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query !== "" && (
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear search"
            onClick={() => setQuery("")}
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>

      <div className={styles.scale} role="group" aria-label="Dataset scale">
        {SCALES.map((value) => (
          <button
            key={value}
            type="button"
            className={styles.scaleButton}
            aria-pressed={scale === value}
            disabled={loading}
            onClick={() => void loadScale(value)}
            title={`${formatCount(value)} issues`}
          >
            {SCALE_LABEL[value]}
          </button>
        ))}
      </div>

      <ThemeToggle />
    </header>
  );
}
