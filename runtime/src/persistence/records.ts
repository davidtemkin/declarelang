import { decodeSnapshot, utf8Bytes } from "./codec.js";
import { normalizeError, persistenceError } from "./errors.js";
import type { Expectation, PersistencePolicy, ReadReceipt, Scope } from "./types.js";

export const ABSENT_REVISION = "absent";
export interface StorageRow {
  readonly control: 1;
  readonly revision: string;
  readonly document: null | { readonly format: number; readonly savedAt: string; readonly json: string };
}
function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && utf8Bytes(value) <= 1024;
}
export function validateScope(scope: Scope): void {
  if (![scope.appId, scope.namespace, scope.key].every(identifier))
    throw persistenceError("configuration", "load");
}
export function resolveScope(entryURL: string, key: string, appId?: string, namespace = "default"): Scope {
  const url = new URL(entryURL);
  url.hash = ""; url.search = "";
  const scope = Object.freeze({ appId: appId ?? url.href, namespace, key });
  validateScope(scope);
  return scope;
}
export function scopeKey(scope: Scope): string {
  validateScope(scope);
  return JSON.stringify([scope.appId, scope.namespace, scope.key]);
}
export function validatePolicy(input: Partial<PersistencePolicy>): PersistencePolicy {
  const policy = { restoreOn: "load", save: "auto", delay: 250, maxDelay: 1000,
    conflict: "fail", ...input } as PersistencePolicy;
  if (!identifier(policy.key) || !["load", "manual"].includes(policy.restoreOn) ||
      !["auto", "manual"].includes(policy.save) || !["fail", "overwrite"].includes(policy.conflict) ||
      !Number.isFinite(policy.delay) || !Number.isFinite(policy.maxDelay) ||
      policy.delay < 0 || policy.maxDelay < policy.delay)
    throw persistenceError("configuration", "load");
  return Object.freeze(policy);
}
function field(value: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}
/** Unknown control metadata is a rejected read; a bad payload retains its revision. */
export function classifyRow(row: unknown): ReadReceipt {
  if (row === undefined) return { revision: ABSENT_REVISION, kind: "absent" };
  if (!row || typeof row !== "object" || field(row, "control") !== 1)
    throw persistenceError("store_corrupt", "load");
  const revision = field(row, "revision");
  if (typeof revision !== "string" || !/^[0-9a-f]{32}$/.test(revision))
    throw persistenceError("store_corrupt", "load");
  const document = field(row, "document");
  if (document === null) return { revision, kind: "absent" };
  try {
    if (!document || typeof document !== "object") throw persistenceError("invalid_record", "load");
    const format = field(document, "format"), savedAt = field(document, "savedAt"), json = field(document, "json");
    if (typeof format !== "number" || !Number.isInteger(format) || format < 1)
      throw persistenceError("invalid_record", "load");
    if (format !== 1) throw persistenceError("unsupported_format", "load");
    if (typeof savedAt !== "string" || !Number.isFinite(Date.parse(savedAt)) ||
        new Date(savedAt).toISOString() !== savedAt || typeof json !== "string")
      throw persistenceError("invalid_record", "load");
    decodeSnapshot(json);
    return { revision, kind: "document", format, savedAt, json };
  } catch (error) { return { revision, kind: "invalid", error: normalizeError(error, "load") }; }
}
export function checkExpectation(receipt: ReadReceipt, expected: Expectation): void {
  if (!("overwrite" in expected && expected.overwrite === true) &&
      (!("revision" in expected) || expected.revision !== receipt.revision))
    throw persistenceError("conflict", "commit");
}
