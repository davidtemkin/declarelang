export const STATUSES = ["open", "in-progress", "blocked", "closed"] as const;
export const PRIORITIES = ["P0", "P1", "P2", "P3"] as const;

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export interface Issue {
  id: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  labels: string[];
  assignee: string | null;
  created: number;
  updated: number;
  closedAt: number | null;
  comments: number;
}

/**
 * Sentinel used wherever an assignee facet needs to name "nobody". Assignees
 * are capitalised first names, so this can never collide with a real one.
 */
export const UNASSIGNED = "__unassigned__";

export const STATUS_LABEL: Record<Status, string> = {
  open: "Open",
  "in-progress": "In progress",
  blocked: "Blocked",
  closed: "Closed",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  P0: "P0 · Urgent",
  P1: "P1 · High",
  P2: "P2 · Normal",
  P3: "P3 · Low",
};
