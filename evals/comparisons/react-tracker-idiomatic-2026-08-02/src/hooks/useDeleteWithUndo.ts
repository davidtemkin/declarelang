import { useCallback } from "react";
import { toast } from "sonner";
import { useTrackerStore } from "../store/trackerStore";

/** Seconds the undo affordance stays on screen. */
export const UNDO_WINDOW_MS = 8000;

/**
 * Delete is optimistic and reversible: the removed records (and the slots they
 * came from) are captured up front, so undo restores them exactly rather than
 * re-creating look-alikes.
 */
export function useDeleteWithUndo() {
  const deleteIssues = useTrackerStore((s) => s.deleteIssues);
  const restoreIssues = useTrackerStore((s) => s.restoreIssues);

  return useCallback(
    (ids: Iterable<number>) => {
      const removals = deleteIssues(ids);
      if (removals.length === 0) return;
      toast(`Deleted ${removals.length} issue${removals.length === 1 ? "" : "s"}`, {
        duration: UNDO_WINDOW_MS,
        action: { label: "Undo", onClick: () => restoreIssues(removals) },
      });
    },
    [deleteIssues, restoreIssues],
  );
}
