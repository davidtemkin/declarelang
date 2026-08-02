import { createContext, useContext, useDeferredValue, useEffect, useMemo, type ReactNode } from "react";
import type { Issue } from "../data/types";
import { buildRows, facetsAreEmpty, selectVisible, sortOrder, type Row } from "../domain/query";
import { collectFacetValues, computeStats, type Stats } from "../domain/stats";
import { useHorizon, useIssues, useTrackerStore, useViewSpec } from "../store/trackerStore";

export interface ViewModel {
  /** The dataset, sorted and filtered — the list the user is looking at. */
  visible: Issue[];
  /** `visible` flattened for the virtualiser, with group headers interleaved. */
  rows: Row[];
  /** Recomputed from `visible` on every change; never incrementally patched. */
  stats: Stats;
  facetValues: { assignees: string[]; labels: string[] };
  total: number;
  filtering: boolean;
  hasNarrowing: boolean;
}

const ViewModelContext = createContext<ViewModel | null>(null);

/**
 * The single place the visible list is derived. Computing it once here (rather
 * than in each consumer) keeps the toolbar counts, the stats panel and the list
 * provably in agreement, and keeps the O(n) work to one pass per change.
 */
export function ViewModelProvider({ children }: { children: ReactNode }) {
  const issues = useIssues();
  const horizon = useHorizon();
  const { query, facets, sort, grouped, collapsed } = useViewSpec();
  const reportSearchMs = useTrackerStore((s) => s.reportSearchMs);

  // Keystrokes update the input at high priority and the 100K-row derivation at
  // low priority, so typing never waits on filtering.
  const deferredQuery = useDeferredValue(query);

  const order = useMemo(() => sortOrder(issues, sort), [issues, sort]);

  const [visible, searchMs] = useMemo(() => {
    const started = performance.now();
    const result = selectVisible(issues, order, deferredQuery, facets);
    return [result, performance.now() - started] as const;
  }, [issues, order, deferredQuery, facets]);

  useEffect(() => reportSearchMs(searchMs), [searchMs, reportSearchMs]);

  const rows = useMemo(() => buildRows(visible, grouped, collapsed), [visible, grouped, collapsed]);
  const stats = useMemo(() => computeStats(visible, horizon), [visible, horizon]);
  const facetValues = useMemo(() => collectFacetValues(issues), [issues]);

  const value = useMemo<ViewModel>(
    () => ({
      visible,
      rows,
      stats,
      facetValues,
      total: issues.length,
      filtering: query !== deferredQuery,
      hasNarrowing: deferredQuery.trim() !== "" || !facetsAreEmpty(facets),
    }),
    [visible, rows, stats, facetValues, issues.length, query, deferredQuery, facets],
  );

  return <ViewModelContext value={value}>{children}</ViewModelContext>;
}

export function useViewModel(): ViewModel {
  const value = useContext(ViewModelContext);
  if (value === null) throw new Error("useViewModel must be used inside <ViewModelProvider>");
  return value;
}
