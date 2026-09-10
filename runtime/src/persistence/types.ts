/** Internal persistence contracts; authored programs use the policy node, not providers. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ReadonlyJson = null | boolean | number | string | readonly ReadonlyJson[] |
  { readonly [key: string]: ReadonlyJson };
export type PersistenceOperation = "load" | "commit" | "erase";
export type PersistenceErrorCode = "unsupported" | "configuration" | "blocked" | "unavailable" |
  "quota" | "io" | "stalled" | "conflict" | "store_corrupt" | "unsupported_format" |
  "invalid_record" | "schema_mismatch" | "settle_failed" | "too_large" | "busy" |
  "not_ready" | "recovery_pending" | "aborted";
export interface PersistenceError {
  readonly code: PersistenceErrorCode;
  readonly message: string;
  readonly operation: PersistenceOperation;
  readonly retryable: boolean;
}
export interface Scope { readonly appId: string; readonly namespace: string; readonly key: string }
export type Expectation = { readonly revision: string } | { readonly overwrite: true };
export type ReadReceipt = { readonly revision: string } & (
  { readonly kind: "absent" } |
  { readonly kind: "document"; readonly format: number; readonly savedAt: string; readonly json: string } |
  { readonly kind: "invalid"; readonly error: PersistenceError }
);
export interface WriteReceipt { readonly revision: string; readonly savedAt: string }
export interface StoredDocument { readonly format: 1; readonly json: string }
export interface PersistenceProvider {
  read(scope: Scope): Promise<ReadReceipt>;
  write(scope: Scope, expected: Expectation, document: StoredDocument): Promise<WriteReceipt>;
  erase(scope: Scope, expected: Expectation): Promise<{ readonly revision: string }>;
}
export interface PersistencePolicy {
  readonly key: string;
  readonly restoreOn: "load" | "manual";
  readonly save: "auto" | "manual";
  readonly delay: number;
  readonly maxDelay: number;
  readonly conflict: "fail" | "overwrite";
}
export interface PersistenceState {
  readonly loadStatus: "loading" | "loaded" | "failed";
  readonly writeStatus: "idle" | "queued" | "committing" | "erasing" | "failed";
  readonly recovery: "none" | "available" | "invalid";
  readonly candidate: ReadonlyJson;
  readonly candidateSavedAt: string | null;
  readonly exists: boolean;
  readonly revision: number;
  readonly savedRevision: number;
  readonly savedAt: string | null;
  readonly autosavePaused: boolean;
  readonly error: PersistenceError | null;
  readonly pending: boolean;
  readonly dirty: boolean;
  readonly saved: boolean;
  readonly failed: boolean;
}
export interface PersistenceResult {
  readonly requestId: number;
  readonly operation: PersistenceOperation;
  readonly ok: boolean;
  readonly revision: number | null;
  readonly storedRevision: string | null;
  readonly savedAt: string | null;
  readonly error: PersistenceError | null;
}
export interface Snapshot { readonly json: string; readonly bytes: number }
/** Timer cancellation is an opaque closure so hosts and controlled clocks share a seam. */
export interface PersistenceClock {
  now(): number;
  schedule(delay: number, callback: () => void): () => void;
}
/** Runtime supplies these; engine never imports Dataset, reactive scheduler, or a renderer. */
export interface PersistenceBinding {
  capture(): unknown;
  validate(value: JsonValue): void;
  adopt(value: JsonValue): void;
  publish(state: PersistenceState): void;
  deliver(result: PersistenceResult): void;
  requestSettle(): void;
  /** Defer until published state has settled; the engine also checks owner lifetime. */
  defer(callback: () => void): void;
}
export interface PersistenceEngine {
  start(): void;
  acceptedMutation(): void;
  settled(success: boolean): void;
  configurationFailed(): void;
  retire(): void;
  commit(): number;
  replace(): number;
  restore(): boolean;
  erase(): number;
  retry(): number;
  reload(): number;
}
