/**
 * Every displayed statistic is recomputed here from the records it describes.
 * Nothing is incrementally maintained, so no stat can drift out of sync with
 * the data (Guarantee 19).
 */
import type { Issue, Status } from "../data/types";
import { UNASSIGNED } from "../data/types";

export const DAY_MS = 86_400_000;
export const CLOSED_HISTORY_DAYS = 14;

export interface AssigneeLoad {
  assignee: string;
  open: number;
}

export interface ClosedDay {
  day: number;
  count: number;
}

export interface Stats {
  total: number;
  byStatus: Record<Status, number>;
  /** Non-closed work per assignee, busiest first; unassigned included. */
  byAssignee: AssigneeLoad[];
  /** Issues closed on each of the last 14 days of dataset time, oldest first. */
  closedPerDay: ClosedDay[];
  peakClosed: number;
}

/**
 * "Today" for the dataset: the newest `updated` anywhere in it. The data is
 * synthetic and has no relation to the wall clock, so the wall clock is never
 * consulted.
 */
export function datasetHorizon(issues: readonly Issue[]): number {
  let max = 0;
  for (const issue of issues) if (issue.updated > max) max = issue.updated;
  return max;
}

/** Midnight UTC of the day containing `t`. */
const startOfDay = (t: number): number => Math.floor(t / DAY_MS) * DAY_MS;

export function computeStats(issues: readonly Issue[], horizon: number): Stats {
  const byStatus: Record<Status, number> = { open: 0, "in-progress": 0, blocked: 0, closed: 0 };
  const openByAssignee = new Map<string, number>();

  const today = startOfDay(horizon);
  const firstDay = today - (CLOSED_HISTORY_DAYS - 1) * DAY_MS;
  const closedCounts = new Array<number>(CLOSED_HISTORY_DAYS).fill(0);

  for (const issue of issues) {
    byStatus[issue.status]++;

    if (issue.status !== "closed") {
      const key = issue.assignee ?? UNASSIGNED;
      openByAssignee.set(key, (openByAssignee.get(key) ?? 0) + 1);
    }

    if (issue.closedAt !== null) {
      const bucket = (startOfDay(issue.closedAt) - firstDay) / DAY_MS;
      if (bucket >= 0 && bucket < CLOSED_HISTORY_DAYS) closedCounts[bucket]++;
    }
  }

  const byAssignee = [...openByAssignee]
    .map(([assignee, open]) => ({ assignee, open }))
    .sort((a, b) => b.open - a.open || a.assignee.localeCompare(b.assignee));

  const closedPerDay = closedCounts.map((count, i) => ({ day: firstDay + i * DAY_MS, count }));

  return {
    total: issues.length,
    byStatus,
    byAssignee,
    closedPerDay,
    peakClosed: Math.max(1, ...closedCounts),
  };
}

/** Facet vocabularies for the filter menus, derived from the live dataset. */
export function collectFacetValues(issues: readonly Issue[]): {
  assignees: string[];
  labels: string[];
} {
  const assignees = new Set<string>();
  const labels = new Set<string>();
  for (const issue of issues) {
    assignees.add(issue.assignee ?? UNASSIGNED);
    for (const label of issue.labels) labels.add(label);
  }
  return {
    // "Unassigned" leads the list; it is the one facet value that is not a name.
    assignees: [...assignees].sort((a, b) =>
      a === UNASSIGNED ? -1 : b === UNASSIGNED ? 1 : a.localeCompare(b),
    ),
    labels: [...labels].sort(),
  };
}
