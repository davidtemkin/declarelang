import { MAX_QUEUED_COMMANDS, MAX_SNAPSHOT_BYTES } from "./codec.js";
import type { Expectation, Snapshot } from "./types.js";

export interface PersistenceJob {
  id: number;
  kind: "load" | "commit" | "replace" | "erase";
  snapshot?: Snapshot;
  revision?: number;
  expected?: Expectation;
  manualRead?: boolean;
  errorVersion?: number;
}

/** Bounded pinned snapshots; autosave remains an unencoded intent until the lane is free. */
export class SnapshotQueue {
  readonly jobs: PersistenceJob[] = [];
  get full(): boolean { return this.jobs.length >= MAX_QUEUED_COMMANDS; }
  canCapture(snapshot: Snapshot, active: PersistenceJob | null): boolean {
    const retained = new Map<string, number>();
    for (const job of [...this.jobs, ...(active ? [active] : [])])
      if (job.snapshot) retained.set(job.snapshot.json, job.snapshot.bytes);
    retained.set(snapshot.json, snapshot.bytes);
    return [...retained.values()].reduce((a, b) => a + b, 0) <= MAX_SNAPSHOT_BYTES;
  }
  take(): PersistenceJob | undefined { return this.jobs.shift(); }
  remove(job: PersistenceJob): void {
    const i = this.jobs.indexOf(job);
    if (i >= 0) this.jobs.splice(i, 1);
  }
  clear(): PersistenceJob[] { return this.jobs.splice(0); }
}
