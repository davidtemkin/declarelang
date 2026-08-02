/**
 * Pure derivation of the visible list: order → select → rows.
 *
 * Sorting depends only on the dataset and the sort spec, so it is computed once
 * and reused across keystrokes. Selection (search + facets) is the per-keystroke
 * pass, and is the one that has to stay cheap at 100K.
 */
import type { Issue, Priority, Status } from "../data/types";
import { STATUSES, UNASSIGNED } from "../data/types";

export type SortKey = "updated" | "priority" | "title";
export type SortDir = "asc" | "desc";

export interface Sort {
  key: SortKey;
  dir: SortDir;
}

/**
 * Selected facet values, OR-ed inside a facet and AND-ed across facets. All
 * three are `Set<string>` so one generic facet component can drive any of them.
 */
export interface Facets {
  statuses: ReadonlySet<string>;
  assignees: ReadonlySet<string>;
  labels: ReadonlySet<string>;
}

export const EMPTY_FACETS: Facets = {
  statuses: new Set(),
  assignees: new Set(),
  labels: new Set(),
};

export const facetsAreEmpty = (f: Facets): boolean =>
  f.statuses.size === 0 && f.assignees.size === 0 && f.labels.size === 0;

const PRIORITY_RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

// One collator for the whole app: correct ordering for the dataset's mixed
// Latin/CJK/emoji titles, and ~3x cheaper than per-call `localeCompare`.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const COMPARATORS: Record<SortKey, (a: Issue, b: Issue) => number> = {
  // `id` breaks every tie so the order is total, and therefore stable across
  // direction flips and re-sorts of a mutated dataset.
  updated: (a, b) => a.updated - b.updated || a.id - b.id,
  priority: (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || a.updated - b.updated || a.id - b.id,
  title: (a, b) => collator.compare(a.title, b.title) || a.id - b.id,
};

/**
 * The sort order as a permutation: `order[i]` is the index, within the store's
 * insertion-ordered array, of the row that belongs at position `i`.
 *
 * Returning a permutation rather than a re-ordered copy is what makes
 * {@link selectVisible} cheap. Walking a shuffled array of object references
 * means a cache miss per record; at 100K that measured ~48ms per keystroke in
 * headless Chrome versus ~28ms for the same filter walking the records in
 * allocation order. So the filter runs in memory order and the permutation puts
 * the survivors back in sort order afterwards.
 *
 * Ascending means "least interesting first" for every key.
 */
export function sortOrder(issues: readonly Issue[], sort: Sort): Uint32Array {
  const order = new Uint32Array(issues.length);
  for (let i = 0; i < order.length; i++) order[i] = i;

  const compare = COMPARATORS[sort.key];
  const sign = sort.dir === "asc" ? 1 : -1;
  order.sort((a, b) => sign * compare(issues[a], issues[b]));
  return order;
}

function matchesQuery(issue: Issue, needle: string): boolean {
  if (issue.title.toLowerCase().includes(needle)) return true;
  if (issue.description.toLowerCase().includes(needle)) return true;
  if (issue.assignee !== null && issue.assignee.toLowerCase().includes(needle)) return true;
  for (const label of issue.labels) if (label.toLowerCase().includes(needle)) return true;
  return false;
}

function matchesFacets(issue: Issue, facets: Facets): boolean {
  if (facets.statuses.size > 0 && !facets.statuses.has(issue.status)) return false;
  if (facets.assignees.size > 0 && !facets.assignees.has(issue.assignee ?? UNASSIGNED)) return false;
  if (facets.labels.size > 0) {
    let hit = false;
    for (const label of issue.labels) {
      if (facets.labels.has(label)) {
        hit = true;
        break;
      }
    }
    if (!hit) return false;
  }
  return true;
}

/**
 * The rows the user is looking at: everything matching `query` and `facets`, in
 * the order described by `order`.
 *
 * Two passes. The first marks survivors while walking the dataset in memory
 * order; the second projects them through the permutation. The mark array is
 * one byte per record — 100KB at 100K rows — so the projection pass is a pair
 * of cache-resident lookups per row.
 */
export function selectVisible(
  issues: readonly Issue[],
  order: Uint32Array,
  query: string,
  facets: Facets,
): Issue[] {
  const needle = query.trim().toLowerCase();

  if (needle === "" && facetsAreEmpty(facets)) {
    const all = new Array<Issue>(order.length);
    for (let i = 0; i < order.length; i++) all[i] = issues[order[i]];
    return all;
  }

  const kept = new Uint8Array(issues.length);
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    if (needle !== "" && !matchesQuery(issue, needle)) continue;
    if (!matchesFacets(issue, facets)) continue;
    kept[i] = 1;
  }

  const visible: Issue[] = [];
  for (let i = 0; i < order.length; i++) {
    const index = order[i];
    if (kept[index] === 1) visible.push(issues[index]);
  }
  return visible;
}

export interface GroupHeader {
  readonly group: Status;
  readonly count: number;
  readonly collapsed: boolean;
}

/** A virtualised list item: either an issue or a group header above one. */
export type Row = Issue | GroupHeader;

/** `Issue` has no `group` field, so this discriminates the union safely. */
export const isGroupHeader = (row: Row): row is GroupHeader => "group" in row;

/**
 * Flattens the filtered issues into the row list the virtualiser renders.
 * Ungrouped, this is the identity — no per-row allocation on the hot path.
 */
export function buildRows(
  visible: Issue[],
  grouped: boolean,
  collapsed: ReadonlySet<Status>,
): Row[] {
  if (!grouped) return visible;

  const buckets = new Map<Status, Issue[]>(STATUSES.map((s) => [s, []]));
  for (const issue of visible) buckets.get(issue.status)!.push(issue);

  const rows: Row[] = [];
  for (const status of STATUSES) {
    const bucket = buckets.get(status)!;
    if (bucket.length === 0) continue;
    const isCollapsed = collapsed.has(status);
    rows.push({ group: status, count: bucket.length, collapsed: isCollapsed });
    if (!isCollapsed) for (const issue of bucket) rows.push(issue);
  }
  return rows;
}
