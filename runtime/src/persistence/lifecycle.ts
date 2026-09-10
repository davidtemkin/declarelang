import { decodeSnapshot, encodeSnapshot, freezeCandidate, portableCopy } from "./codec.js";
import { inStorageLane } from "./coordinator.js";
import { normalizeError, persistenceError } from "./errors.js";
import { SnapshotQueue } from "./queue.js";
import { validatePolicy, validateScope } from "./records.js";
import type { PersistenceJob } from "./queue.js";
import type { Expectation, PersistenceBinding, PersistenceClock, PersistenceEngine,
  PersistenceError, PersistenceErrorCode, PersistenceOperation, PersistencePolicy,
  PersistenceProvider, PersistenceResult, PersistenceState, ReadReceipt, Scope, WriteReceipt } from "./types.js";

const operation = (job: PersistenceJob): PersistenceOperation => job.kind === "replace" ? "commit" : job.kind;
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
const initialState = (): Mutable<PersistenceState> => ({
  loadStatus: "loading", writeStatus: "idle", recovery: "none", candidate: null,
  candidateSavedAt: null, exists: false, revision: 0, savedRevision: -1, savedAt: null,
  autosavePaused: false, error: null, pending: false, dirty: false, saved: false, failed: false,
});

/** All lifecycle coordination lives here; the binding translates real runtime settles and events. */
export class DocumentPersistence implements PersistenceEngine {
  private s = initialState();
  private readonly queue = new SnapshotQueue();
  private active: PersistenceJob | null = null;
  private alive = true;
  private started = false;
  private modified = false;
  private localIntent = false;
  private adopting = false;
  private halted = false;
  private configured = true;
  private serial = 0;
  private stored: string | null = null;
  private failedJob: PersistenceJob | null = null;
  private autoDue: number | null = null;
  private autoFirst: number | null = null;
  private cancelAuto: (() => void) | null = null;
  private cancelStall: (() => void) | null = null;
  private errorVersion = 0;
  readonly policy: PersistencePolicy;
  readonly scope: Scope;
  constructor(private readonly provider: PersistenceProvider, scope: Scope,
    policy: Partial<PersistencePolicy>, private readonly binding: PersistenceBinding,
    private readonly clock: PersistenceClock) {
    this.scope = Object.freeze({ ...scope }); validateScope(this.scope);
    this.policy = validatePolicy(policy);
    this.publish();
  }
  start(): void {
    if (!this.alive || this.started || !this.configured) return;
    this.started = true; this.run({ id: 0, kind: "load" });
  }
  acceptedMutation(): void {
    if (!this.alive || this.adopting) return;
    this.modified = true; this.localIntent = true; this.binding.requestSettle();
  }
  settled(success: boolean): void {
    if (!this.alive) return;
    const changed = this.modified;
    if (changed) { this.s.revision++; this.s.dirty = true; this.modified = false; }
    if (!success) {
      const error = persistenceError("settle_failed", "commit");
      this.stopAuto(); this.halted = true; this.setError(error);
      for (const job of [...this.queue.jobs]) if (!job.snapshot && job.kind !== "erase") {
        this.queue.remove(job); this.result(job, error);
      }
      this.publish(); return;
    }
    for (const job of [...this.queue.jobs]) {
      if (job.kind === "erase" || job.snapshot) continue;
      try {
        const value = portableCopy(this.binding.capture()); this.binding.validate(value);
        const snapshot = encodeSnapshot(value);
        if (!this.queue.canCapture(snapshot, this.active)) throw persistenceError("busy", "commit");
        job.snapshot = snapshot; job.revision = this.s.revision;
        this.stopAuto();
      } catch (error) {
        this.queue.remove(job); this.captureFailure(job, error);
      }
    }
    if (changed) this.scheduleAuto();
    this.pump(true); this.publish();
  }
  commit(): number { return this.saveCommand(false); }
  replace(): number { return this.saveCommand(true); }
  private saveCommand(replace: boolean): number {
    const job: PersistenceJob = { id: ++this.serial, kind: replace ? "replace" : "commit", errorVersion: this.errorVersion };
    const refusal = this.refusal() ?? (this.s.loadStatus === "failed" ? "not_ready" :
      replace ? (this.s.recovery === "none" ? "not_ready" : null) :
      this.s.recovery !== "none" ? "recovery_pending" : null);
    if (refusal) return this.reject(job, refusal);
    if (this.queue.full) return this.reject(job, "busy");
    this.localIntent = true;
    this.queue.jobs.push(job); this.binding.requestSettle(); this.publish();
    return job.id;
  }
  restore(): boolean {
    if (!this.alive || !this.configured || this.active || this.queue.jobs.length || this.s.recovery !== "available") return false;
    const value = portableCopy(this.s.candidate, "load");
    this.adopting = true;
    try { this.binding.adopt(value); } finally { this.adopting = false; }
    this.modified = false; this.s.revision++; this.s.savedRevision = this.s.revision;
    this.s.savedAt = this.s.candidateSavedAt; this.s.dirty = false;
    this.clearRecovery(); this.resume(); this.publish(); return true;
  }
  erase(): number {
    const job: PersistenceJob = { id: ++this.serial, kind: "erase" };
    const refusal = this.refusal() ?? (this.s.loadStatus !== "loaded" || this.stored === null ? "not_ready" : null);
    if (refusal) return this.reject(job, refusal);
    this.stopAuto(); this.s.autosavePaused = true;
    for (const old of this.queue.clear()) this.result(old, persistenceError("aborted", operation(old)));
    this.queue.jobs.push(job); this.pump(); this.publish(); return job.id;
  }
  retry(): number {
    if (!this.failedJob || !this.s.error?.retryable || this.failedJob.kind === "replace")
      return this.reject({ id: ++this.serial, kind: "commit" }, "aborted");
    const failed = this.failedJob;
    if (failed.kind === "commit") return this.commit();
    if (failed.kind === "load") return this.readCommand(failed.manualRead ?? false);
    const job: PersistenceJob = { ...failed, id: ++this.serial };
    const refusal = this.refusal();
    if (refusal) return this.reject(job, refusal);
    this.queue.jobs.push(job); this.pump(); this.publish(); return job.id;
  }
  reload(): number { return this.readCommand(true); }
  private readCommand(manualRead: boolean): number {
    const job: PersistenceJob = { id: ++this.serial, kind: "load", manualRead };
    const refusal = this.refusal() ?? (this.active || this.queue.jobs.length || this.autoDue !== null ? "busy" : null);
    if (refusal) return this.reject(job, refusal);
    this.failedJob = null; this.clearError(); this.run(job); return job.id;
  }
  configurationFailed(): void {
    this.configured = false; this.stopAuto(); this.halted = true;
    const error = persistenceError("configuration", "load"); this.setError(error);
    for (const job of this.queue.clear()) this.result(job, error);
    this.publish();
  }
  retire(): void {
    this.alive = false; this.stopAuto(); this.cancelStall?.(); this.queue.clear();
  }
  private refusal(): PersistenceErrorCode | null {
    if (!this.alive) return "aborted";
    if (!this.configured) return "configuration";
    if (this.active?.kind === "erase" || this.queue.jobs.some(j => j.kind === "erase")) return "busy";
    return null;
  }
  private reject(job: PersistenceJob, code: PersistenceErrorCode): number {
    this.result(job, persistenceError(code, operation(job))); return job.id;
  }
  private eligibleAuto(): boolean {
    return this.configured && !this.halted && !this.s.autosavePaused && this.s.recovery === "none" &&
      this.s.loadStatus === "loaded" && this.policy.save === "auto" && this.s.dirty;
  }
  private scheduleAuto(): void {
    if (!this.eligibleAuto()) return;
    const now = this.clock.now(); this.autoFirst ??= now;
    this.autoDue = Math.min(now + this.policy.delay, this.autoFirst + this.policy.maxDelay);
    this.cancelAuto?.();
    this.cancelAuto = this.clock.schedule(Math.max(0, this.autoDue - now), () => {
      this.cancelAuto = null; this.binding.requestSettle();
    });
  }
  private stopAuto(): void {
    this.cancelAuto?.(); this.cancelAuto = null; this.autoDue = this.autoFirst = null;
  }
  private pump(canCapture = false): void {
    if (!this.alive || !this.configured || this.active || this.s.loadStatus !== "loaded") return;
    const next = this.queue.jobs[0];
    if (next) {
      if (next.kind !== "erase" && !next.snapshot) return;
      this.queue.take(); this.run(next); return;
    }
    if (!this.eligibleAuto() || this.autoDue === null || this.autoDue > this.clock.now()) return;
    if (!canCapture) { this.binding.requestSettle(); return; }
    const job: PersistenceJob = { id: 0, kind: "commit" };
    try {
      const value = portableCopy(this.binding.capture()); this.binding.validate(value);
      job.snapshot = encodeSnapshot(value); job.revision = this.s.revision;
      this.stopAuto(); this.run(job);
    } catch (error) { this.stopAuto(); this.captureFailure(job, error); }
  }
  private captureFailure(job: PersistenceJob, error: unknown): void {
    const failure = normalizeError(error, "commit");
    if (job.id === 0 || failure.code !== "busy") {
      this.halted = true; this.failedJob = { id: job.id, kind: job.kind };
      this.setError(failure);
    }
    this.result(job, failure);
  }
  private expectation(): Expectation {
    return this.policy.conflict === "overwrite" ? { overwrite: true } : { revision: this.stored! };
  }
  private run(job: PersistenceJob): void {
    this.active = job;
    const canResolveError = !this.s.error || job.kind === "erase" || job.kind === "load" ||
      job.errorVersion === this.errorVersion;
    if (job.kind === "load") this.s.loadStatus = "loading";
    else {
      job.expected ??= this.expectation();
      if (this.s.recovery === "none" && canResolveError) this.clearError();
    }
    const errorVersion = canResolveError ? this.errorVersion : -1;
    this.publish();
    void inStorageLane(this.provider, this.scope, async () => {
      if (!this.alive) throw persistenceError("aborted", operation(job));
      this.cancelStall = this.clock.schedule(10_000, () => {
        if (this.alive && this.configured && this.active === job && !this.s.error) {
          this.setError(persistenceError("stalled", operation(job))); this.publish();
        }
      });
      if (job.kind === "load") return this.provider.read(this.scope);
      if (job.kind === "erase") return this.provider.erase(this.scope, job.expected!);
      return this.provider.write(this.scope, job.expected!, { format: 1, json: job.snapshot!.json });
    }).then(receipt => {
      if (!this.alive) return;
      this.cancelStall?.(); this.cancelStall = null; this.active = null;
      if (job.kind === "load") this.loaded(job, receipt as ReadReceipt);
      else this.written(job, receipt as WriteReceipt, errorVersion);
      this.pump(); this.publish();
    }, error => {
      if (!this.alive) return;
      this.cancelStall?.(); this.cancelStall = null; this.active = null;
      this.failed(job, normalizeError(error, operation(job))); this.pump(); this.publish();
    });
  }
  private loaded(job: PersistenceJob, receipt: ReadReceipt): void {
    if (this.s.error?.code === "stalled") this.clearError();
    this.stored = receipt.revision; this.s.loadStatus = "loaded";
    this.s.exists = receipt.kind !== "absent";
    if (receipt.kind === "absent") {
      this.clearRecovery(); this.s.savedRevision = -1; this.s.savedAt = null;
      if (this.configured) { this.clearError(); this.halted = false; }
      this.scheduleAuto(); this.result(job); return;
    }
    try {
      if (receipt.kind === "invalid") throw receipt.error;
      const value = decodeSnapshot(receipt.json); this.binding.validate(value);
      this.s.candidate = freezeCandidate(value); this.s.candidateSavedAt = receipt.savedAt;
      this.s.recovery = "available";
      const adopt = !job.manualRead && this.policy.restoreOn === "load" && !this.localIntent && this.configured;
      if (adopt) this.restore();
      else for (const queued of this.queue.clear()) this.result(queued, persistenceError("recovery_pending", "commit"));
      this.result(job, null, adopt ? this.s.revision : null, receipt.revision, receipt.savedAt);
    } catch (error) {
      const failure = normalizeError(error, "load");
      this.s.recovery = "invalid"; this.s.candidate = null; this.s.candidateSavedAt = null;
      if (this.configured) this.setError(failure);
      this.stopAuto(); this.halted = true;
      for (const queued of this.queue.clear()) this.result(queued, failure);
      this.result(job, failure);
    }
  }
  private written(job: PersistenceJob, receipt: WriteReceipt, errorVersion: number): void {
    this.stored = receipt.revision;
    if (job.kind === "erase") {
      this.s.exists = false; this.s.savedRevision = -1; this.s.savedAt = null;
      this.s.dirty = true; this.clearRecovery();
      if (this.configured) { this.clearError(); this.failedJob = null; }
    } else {
      this.s.exists = true; this.s.savedRevision = job.revision!; this.s.savedAt = receipt.savedAt;
      this.s.dirty = this.modified || this.s.revision !== job.revision;
      if (!this.s.dirty) this.stopAuto();
      if (job.kind === "replace") this.clearRecovery();
      if (this.configured && (this.errorVersion === errorVersion || this.s.error?.code === "stalled")) {
        if (!this.queue.jobs.some(queued => queued.kind === "erase")) this.resume();
      }
    }
    this.result(job, null, job.kind === "erase" ? null : job.revision!, receipt.revision,
      job.kind === "erase" ? null : receipt.savedAt);
  }
  private failed(job: PersistenceJob, error: PersistenceError): void {
    if (job.kind === "load") this.s.loadStatus = "failed";
    if (this.configured) this.setError(error);
    this.failedJob = { id: job.id, kind: job.kind, expected: job.expected, manualRead: job.manualRead };
    this.halted = true; this.stopAuto(); this.result(job, error);
    for (const queued of [...this.queue.jobs]) if (queued.kind !== "erase") {
      this.queue.remove(queued);
      this.result(queued, job.kind === "load" ? error : persistenceError("aborted", operation(queued)));
    }
  }
  private resume(): void {
    this.s.autosavePaused = false; this.halted = false; this.failedJob = null; this.clearError(); this.scheduleAuto();
  }
  private clearRecovery(): void { this.s.recovery = "none"; this.s.candidate = null; this.s.candidateSavedAt = null; }
  private setError(error: PersistenceError): void { this.s.error = error; this.errorVersion++; }
  private clearError(): void { this.s.error = null; this.errorVersion++; }
  private publish(): void {
    if (!this.alive) return;
    this.s.pending = !!this.active || this.queue.jobs.length > 0 || this.autoDue !== null;
    this.s.writeStatus = this.active && this.active.kind !== "load" ?
      (this.active.kind === "erase" ? "erasing" : "committing") :
      this.queue.jobs.length || this.autoDue !== null ? "queued" :
      this.s.error && this.s.error.operation !== "load" ? "failed" : "idle";
    this.s.failed = this.s.error !== null;
    this.s.saved = this.s.loadStatus === "loaded" && this.s.exists && this.s.revision === this.s.savedRevision &&
      this.s.recovery === "none" && !this.s.pending && !this.s.error && !this.s.autosavePaused && !this.modified;
    this.binding.publish(Object.freeze({ ...this.s }));
  }
  private result(job: PersistenceJob, error: PersistenceError | null = null, revision: number | null = null,
    storedRevision: string | null = this.stored, savedAt: string | null = null): void {
    const result: PersistenceResult = Object.freeze({ requestId: job.id, operation: operation(job), ok: !error,
      revision: error ? null : revision, storedRevision: error ? null : storedRevision,
      savedAt: error ? null : savedAt, error });
    this.binding.defer(() => { if (this.alive) this.binding.deliver(result); });
  }
}
