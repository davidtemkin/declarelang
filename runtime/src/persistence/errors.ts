import type { PersistenceError, PersistenceErrorCode, PersistenceOperation } from "./types.js";

const messages: Record<PersistenceErrorCode, string> = {
  unsupported: "This host does not support local persistence.",
  configuration: "Persistence configuration is invalid; reconstruct the owner with valid settings.",
  blocked: "Another connection is blocking local storage. Close it and retry.",
  unavailable: "Local storage is unavailable. Your current work remains in memory.",
  quota: "Local storage is full or restricted. Free space and retry.",
  io: "Local storage did not complete the operation. Your current work remains in memory.",
  stalled: "Local storage has not confirmed the outcome. Waiting for completion.",
  conflict: "The stored document changed. Reload and inspect it before replacing it.",
  store_corrupt: "Local storage metadata cannot be read safely. Host storage repair is required.",
  unsupported_format: "The saved document uses an unsupported format.",
  invalid_record: "The document contains data that cannot be stored as portable JSON.",
  schema_mismatch: "The document does not match the Dataset schema.",
  settle_failed: "The reactive update failed. Correct it and commit after a successful settle.",
  too_large: "The document exceeds the 8 MiB persistence payload limit.",
  busy: "Persistence has outstanding work or has reached its queue limit.",
  not_ready: "A successful storage read is required before this operation.",
  recovery_pending: "Resolve the saved candidate before saving current work.",
  aborted: "This operation was canceled or is no longer eligible.",
};
const retryable = new Set<PersistenceErrorCode>(["blocked", "unavailable", "quota", "io"]);

export function persistenceError(code: PersistenceErrorCode, operation: PersistenceOperation): PersistenceError {
  return Object.freeze({ code, operation, message: messages[code], retryable: retryable.has(code) });
}

/** Never leak exception messages: they may include serialized application data. */
export function normalizeError(error: unknown, operation: PersistenceOperation): PersistenceError {
  if (error && typeof error === "object") {
    const code = Object.getOwnPropertyDescriptor(error, "code")?.value;
    if (typeof code === "string" && Object.hasOwn(messages, code))
      return persistenceError(code as PersistenceErrorCode, operation);
    const name = error instanceof Error ? error.name : Object.getOwnPropertyDescriptor(error, "name")?.value;
    if (name === "QuotaExceededError") return persistenceError("quota", operation);
    if (name === "SecurityError") return persistenceError("unavailable", operation);
  }
  return persistenceError("io", operation);
}
