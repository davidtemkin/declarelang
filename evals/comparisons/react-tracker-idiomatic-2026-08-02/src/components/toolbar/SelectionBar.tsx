import { Trash2, X } from "lucide-react";
import { STATUSES, STATUS_LABEL, type Status } from "../../data/types";
import { formatCount } from "../../lib/format";
import { useSelection, useTrackerStore } from "../../store/trackerStore";
import { useDeleteWithUndo } from "../../hooks/useDeleteWithUndo";
import styles from "./SelectionBar.module.css";

/** Bulk actions for a multi-selection; hidden entirely when nothing is selected. */
export function SelectionBar() {
  const selection = useSelection();
  const clearSelection = useTrackerStore((s) => s.clearSelection);
  const setStatusFor = useTrackerStore((s) => s.setStatusFor);
  const deleteWithUndo = useDeleteWithUndo();

  if (selection.size === 0) return null;

  return (
    <div className={styles.bar} role="toolbar" aria-label="Bulk actions">
      <strong className={styles.count}>{formatCount(selection.size)} selected</strong>

      <label className={styles.action}>
        <span className={styles.label}>Set status</span>
        <select
          className="field"
          aria-label="Set status for selection"
          value=""
          onChange={(event) => {
            setStatusFor(selection, event.target.value as Status);
            event.target.value = "";
          }}
        >
          <option value="" disabled>
            Choose…
          </option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </label>

      <button type="button" className="btn btn--danger" onClick={() => deleteWithUndo(selection)}>
        <Trash2 size={14} aria-hidden /> Delete
      </button>

      <button type="button" className="btn btn--ghost" onClick={clearSelection}>
        <X size={14} aria-hidden /> Clear
      </button>
    </div>
  );
}
