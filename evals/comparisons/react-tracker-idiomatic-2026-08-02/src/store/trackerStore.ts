import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { Issue, Status } from "../data/types";
import { generate } from "../data/generate";
import { datasetHorizon } from "../domain/stats";
import type { Facets, Sort, SortKey } from "../domain/query";
import { EMPTY_FACETS } from "../domain/query";

export const SCALES = [10_000, 100_000, 1_000_000] as const;
export type Scale = (typeof SCALES)[number];

export type FacetKey = keyof Facets;

/** A deleted record plus where it sat, so undo restores the array exactly. */
export interface Removal {
  index: number;
  issue: Issue;
}

/** The fields the in-row editor can stage into a draft. */
export type IssueDraft = Pick<
  Issue,
  "title" | "description" | "status" | "priority" | "assignee" | "labels"
>;

export interface Metrics {
  /** Fetch + parse (10K) or in-memory regeneration (100K / 1M), ms. */
  loadMs: number | null;
  /** Records in hand → store populated and the first list render committed, ms. */
  ingestMs: number | null;
  /** Last filter recompute over the full dataset, ms. */
  searchMs: number | null;
}

interface TrackerState {
  // ---- data ----
  issues: Issue[];
  horizon: number;
  scale: Scale;
  loading: boolean;
  metrics: Metrics;

  // ---- view ----
  query: string;
  facets: Facets;
  sort: Sort;
  grouped: boolean;
  collapsed: ReadonlySet<Status>;

  // ---- interaction ----
  selection: ReadonlySet<number>;
  editingId: number | null;
  /** One-shot request for the list to scroll a given record into view. */
  revealId: number | null;

  // ---- actions ----
  loadScale: (scale: Scale) => Promise<void>;
  reportSearchMs: (ms: number) => void;

  setQuery: (query: string) => void;
  toggleFacet: (key: FacetKey, value: string) => void;
  clearFacet: (key: FacetKey) => void;
  clearAllFilters: () => void;
  setSortKey: (key: SortKey) => void;
  toggleSortDir: () => void;
  setGrouped: (grouped: boolean) => void;
  toggleGroupCollapsed: (status: Status) => void;

  setSelection: (ids: Iterable<number>) => void;
  toggleSelected: (id: number) => void;
  clearSelection: () => void;

  openEditor: (id: number) => void;
  closeEditor: () => void;
  reveal: (id: number) => void;
  consumeReveal: () => void;

  createIssue: () => number;
  saveIssue: (id: number, draft: IssueDraft) => void;
  setStatusFor: (ids: Iterable<number>, status: Status) => void;
  deleteIssues: (ids: Iterable<number>) => Removal[];
  restoreIssues: (removals: readonly Removal[]) => void;
}

const EMPTY_SELECTION: ReadonlySet<number> = new Set();
const NO_COLLAPSE: ReadonlySet<Status> = new Set();

const withToggled = <T>(set: ReadonlySet<T>, value: T): Set<T> => {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
};

/** Yields to the browser so a pending "loading" paint lands before we block. */
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function readDataset(scale: Scale): Promise<{ issues: Issue[]; loadMs: number }> {
  const started = performance.now();
  if (scale === SCALES[0]) {
    const response = await fetch("issues.json");
    const payload = (await response.json()) as { issues: Issue[] };
    return { issues: payload.issues, loadMs: performance.now() - started };
  }
  const issues = generate(scale);
  return { issues, loadMs: performance.now() - started };
}

export const useTrackerStore = create<TrackerState>()((set, get) => ({
  issues: [],
  horizon: 0,
  scale: SCALES[0],
  loading: true,
  metrics: { loadMs: null, ingestMs: null, searchMs: null },

  query: "",
  facets: EMPTY_FACETS,
  sort: { key: "updated", dir: "desc" },
  grouped: false,
  collapsed: NO_COLLAPSE,

  selection: EMPTY_SELECTION,
  editingId: null,
  revealId: null,

  async loadScale(scale) {
    set({ loading: true, scale });
    await nextFrame();

    const { issues, loadMs } = await readDataset(scale);

    const ingestStart = performance.now();
    set({
      issues,
      horizon: datasetHorizon(issues),
      loading: false,
      selection: EMPTY_SELECTION,
      editingId: null,
      collapsed: NO_COLLAPSE,
      metrics: { loadMs, ingestMs: null, searchMs: null },
    });
    // The next frame runs after React has rendered and committed the new list.
    await nextFrame();
    const ingestMs = performance.now() - ingestStart;
    set((s) => ({ metrics: { ...s.metrics, ingestMs } }));
  },

  reportSearchMs: (searchMs) => set((s) => ({ metrics: { ...s.metrics, searchMs } })),

  setQuery: (query) => set({ query }),

  toggleFacet: (key, value) =>
    set((s) => ({ facets: { ...s.facets, [key]: withToggled(s.facets[key], value) } })),

  clearFacet: (key) => set((s) => ({ facets: { ...s.facets, [key]: new Set<string>() } })),

  clearAllFilters: () => set({ query: "", facets: EMPTY_FACETS }),

  setSortKey: (key) => set((s) => ({ sort: { ...s.sort, key } })),

  toggleSortDir: () => set((s) => ({ sort: { ...s.sort, dir: s.sort.dir === "asc" ? "desc" : "asc" } })),

  setGrouped: (grouped) => set({ grouped }),

  toggleGroupCollapsed: (status) => set((s) => ({ collapsed: withToggled(s.collapsed, status) })),

  // A multi-selection and an open editor are mutually exclusive, in both
  // directions — enforced here rather than at each call site.
  setSelection: (ids) => set({ selection: new Set(ids), editingId: null }),

  toggleSelected: (id) => set((s) => ({ selection: withToggled(s.selection, id), editingId: null })),

  clearSelection: () => set({ selection: EMPTY_SELECTION }),

  openEditor: (id) => set({ editingId: id, selection: EMPTY_SELECTION }),

  closeEditor: () => set({ editingId: null }),

  reveal: (id) => set({ revealId: id }),

  consumeReveal: () => set({ revealId: null }),

  createIssue() {
    const { issues, horizon } = get();
    let maxId = 0;
    for (const issue of issues) if (issue.id > maxId) maxId = issue.id;
    const id = maxId + 1;
    const issue: Issue = {
      id,
      title: "Untitled issue",
      description: "",
      status: "open",
      priority: "P2",
      labels: [],
      assignee: null,
      created: horizon,
      updated: horizon,
      closedAt: null,
      comments: 0,
    };
    set({ issues: [...issues, issue], selection: new Set([id]), editingId: null, revealId: id });
    return id;
  },

  saveIssue(id, draft) {
    set((s) => ({
      issues: s.issues.map((issue) => (issue.id === id ? applyDraft(issue, draft, s.horizon) : issue)),
      editingId: null,
    }));
  },

  setStatusFor(ids, status) {
    const target = new Set(ids);
    if (target.size === 0) return;
    set((s) => ({
      issues: s.issues.map((issue) =>
        target.has(issue.id) ? applyStatus(issue, status, s.horizon) : issue,
      ),
    }));
  },

  deleteIssues(ids) {
    const target = new Set(ids);
    if (target.size === 0) return [];
    const removals: Removal[] = [];
    const remaining: Issue[] = [];
    const { issues } = get();
    for (let index = 0; index < issues.length; index++) {
      const issue = issues[index];
      if (target.has(issue.id)) removals.push({ index, issue });
      else remaining.push(issue);
    }
    set({ issues: remaining, selection: EMPTY_SELECTION, editingId: null });
    return removals;
  },

  restoreIssues(removals) {
    if (removals.length === 0) return;
    const issues = get().issues.slice();
    // Ascending index order, so each splice targets the slot it came from.
    for (const { index, issue } of [...removals].sort((a, b) => a.index - b.index)) {
      issues.splice(index, 0, issue);
    }
    set({ issues, selection: new Set(removals.map((r) => r.issue.id)) });
  },
}));

/** `updated` moves with any edit; `closedAt` is truth, not inferred from status. */
function applyStatus(issue: Issue, status: Status, now: number): Issue {
  if (issue.status === status) return issue;
  return {
    ...issue,
    status,
    updated: now,
    closedAt: status === "closed" ? now : null,
  };
}

function applyDraft(issue: Issue, draft: IssueDraft, now: number): Issue {
  const next: Issue = { ...issue, ...draft, updated: now };
  if (draft.status !== issue.status) {
    next.closedAt = draft.status === "closed" ? now : null;
  }
  return next;
}

// ---- selector hooks -------------------------------------------------------
// Components subscribe to the narrowest slice they need, so a keystroke in the
// search box never re-renders the stats panel or the list rows.

export const useIssues = () => useTrackerStore((s) => s.issues);
export const useHorizon = () => useTrackerStore((s) => s.horizon);
export const useSelection = () => useTrackerStore((s) => s.selection);
export const useEditingId = () => useTrackerStore((s) => s.editingId);

export const useViewSpec = () =>
  useTrackerStore(
    useShallow((s) => ({
      query: s.query,
      facets: s.facets,
      sort: s.sort,
      grouped: s.grouped,
      collapsed: s.collapsed,
    })),
  );