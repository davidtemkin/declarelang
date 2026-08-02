import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { isGroupHeader } from "../../domain/query";
import { useEditingId, useHorizon, useSelection, useTrackerStore } from "../../store/trackerStore";
import { useViewModel } from "../../state/viewModel";
import { EmptyState } from "./EmptyState";
import { GroupHeaderRow } from "./GroupHeaderRow";
import { IssueRow } from "./IssueRow";
import styles from "./IssueList.module.css";

/** Must match `--row-h` / `--group-h`; both are fixed so estimates are exact. */
const ROW_HEIGHT = 52;
const GROUP_HEIGHT = 38;
/** Only ever an estimate: the open editor is the one measured element. */
const EDITOR_ESTIMATE = 300;

export function IssueList() {
  const { rows, total, hasNarrowing } = useViewModel();
  const horizon = useHorizon();
  const selection = useSelection();
  const editingId = useEditingId();
  const openEditor = useTrackerStore((s) => s.openEditor);
  const setSelection = useTrackerStore((s) => s.setSelection);
  const toggleSelected = useTrackerStore((s) => s.toggleSelected);
  const revealId = useTrackerStore((s) => s.revealId);
  const consumeReveal = useTrackerStore((s) => s.consumeReveal);

  const scrollerRef = useRef<HTMLDivElement>(null);
  /** Index of the last plainly-clicked row; the pivot for shift-ranges. */
  const anchorRef = useRef<number | null>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: useCallback(
      (index: number) => {
        const row = rows[index];
        if (isGroupHeader(row)) return GROUP_HEIGHT;
        return row.id === editingId ? EDITOR_ESTIMATE : ROW_HEIGHT;
      },
      [rows, editingId],
    ),
    getItemKey: useCallback(
      (index: number) => {
        const row = rows[index];
        return isGroupHeader(row) ? `group:${row.group}` : row.id;
      },
      [rows],
    ),
    overscan: 6,
  });

  // The editor is the only variable-height item, so the measurement cache is
  // dropped whenever the open row changes — otherwise a closed row would keep
  // the expanded height it was last measured at.
  const { measure } = virtualizer;
  useLayoutEffect(() => {
    measure();
  }, [editingId, measure]);

  // Bring a freshly created (or otherwise programmatically chosen) issue into view.
  useEffect(() => {
    if (revealId === null) return;
    const index = rows.findIndex((row) => !isGroupHeader(row) && row.id === revealId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "center" });
    consumeReveal();
  }, [revealId, rows, virtualizer, consumeReveal]);

  const handleRowClick = useCallback(
    (index: number, event: React.MouseEvent) => {
      const row = rows[index];
      if (isGroupHeader(row)) return;

      if (event.shiftKey && anchorRef.current !== null) {
        const [from, to] = [anchorRef.current, index].sort((a, b) => a - b);
        const ids: number[] = [];
        for (let i = from; i <= to; i++) {
          const candidate = rows[i];
          if (!isGroupHeader(candidate)) ids.push(candidate.id);
        }
        setSelection(ids);
        return;
      }

      anchorRef.current = index;
      if (event.metaKey || event.ctrlKey) toggleSelected(row.id);
      else setSelection([row.id]);
    },
    [rows, setSelection, toggleSelected],
  );

  const items = virtualizer.getVirtualItems();

  if (rows.length === 0) {
    return (
      <div className={styles.scroller} ref={scrollerRef}>
        <EmptyState kind={total === 0 ? "no-issues" : "no-matches"} filtered={hasNarrowing} />
      </div>
    );
  }

  return (
    <div className={styles.scroller} ref={scrollerRef} data-testid="list">
      <div className={styles.canvas} style={{ height: virtualizer.getTotalSize() }}>
        <div
          className={styles.window}
          style={{ transform: `translateY(${items[0]?.start ?? 0}px)` }}
        >
          {items.map((item) => {
            const row = rows[item.index];
            if (isGroupHeader(row)) {
              return <GroupHeaderRow key={item.key} header={row} />;
            }
            const editing = row.id === editingId;
            return (
              <IssueRow
                key={item.key}
                index={item.index}
                issue={row}
                horizon={horizon}
                selected={selection.has(row.id)}
                editing={editing}
                measureRef={editing ? virtualizer.measureElement : undefined}
                onClick={handleRowClick}
                onToggle={toggleSelected}
                onOpen={openEditor}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
