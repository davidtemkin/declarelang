import { ChevronRight } from "lucide-react";
import type { GroupHeader } from "../../domain/query";
import { STATUS_LABEL } from "../../data/types";
import { formatCount } from "../../lib/format";
import { useTrackerStore } from "../../store/trackerStore";
import styles from "./GroupHeaderRow.module.css";

export function GroupHeaderRow({ header }: { header: GroupHeader }) {
  const toggleGroupCollapsed = useTrackerStore((s) => s.toggleGroupCollapsed);
  return (
    <button
      type="button"
      className={styles.header}
      data-group={header.group}
      data-status={header.group}
      data-count={header.count}
      aria-expanded={!header.collapsed}
      onClick={() => toggleGroupCollapsed(header.group)}
    >
      <ChevronRight size={14} className={styles.chevron} aria-hidden />
      <span className={styles.name}>{STATUS_LABEL[header.group]}</span>
      <span className={styles.count}>{formatCount(header.count)}</span>
    </button>
  );
}
