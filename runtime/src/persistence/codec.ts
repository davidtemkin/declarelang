import { persistenceError } from "./errors.js";
import type { JsonValue, ReadonlyJson, Snapshot, PersistenceOperation } from "./types.js";

export const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_SNAPSHOT_BYTES = 16 * 1024 * 1024;
export const MAX_QUEUED_COMMANDS = 4;
const encoder = new TextEncoder();
export const utf8Bytes = (value: string): number => encoder.encode(value).byteLength;

/** Descriptor traversal rejects getters without executing them and detects ancestor cycles. */
export function portableCopy(value: unknown, operation: PersistenceOperation = "commit"): JsonValue {
  const fail = () => { throw persistenceError("invalid_record", operation); };
  const root: { value: JsonValue } = { value: null };
  const ancestors = new Set<object>();
  type Step = { input: unknown; assign: (value: JsonValue) => void } | { leave: object };
  const stack: Step[] = [{ input: value, assign: v => { root.value = v; } }];
  while (stack.length) {
    const step = stack.pop()!;
    if ("leave" in step) { ancestors.delete(step.leave); continue; }
    const input = step.input;
    if (input === null || typeof input === "boolean" || typeof input === "string") {
      step.assign(input); continue;
    }
    if (typeof input === "number") {
      if (!Number.isFinite(input)) fail();
      step.assign(input === 0 ? 0 : input); continue;
    }
    if (typeof input !== "object" || input === null) { fail(); continue; }
    const array = Array.isArray(input);
    const proto = Object.getPrototypeOf(input);
    if ((!array && proto !== Object.prototype && proto !== null) || ancestors.has(input)) fail();
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(descriptors);
    const length = array ? descriptors.length?.value : undefined;
    const out: JsonValue[] | { [key: string]: JsonValue } = array ? [] : Object.create(null);
    if (array && keys.length !== length + 1) fail();
    ancestors.add(input);
    stack.push({ leave: input });
    step.assign(out);
    for (const key of keys) {
      if (array && key === "length") continue;
      if (typeof key !== "string") { fail(); continue; }
      const d = descriptors[key];
      if (!d.enumerable || !("value" in d)) fail();
      if (array && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)) fail();
      Object.defineProperty(out, key, { value: null, enumerable: true, writable: true, configurable: true });
      stack.push({ input: d.value, assign: v => {
        Object.defineProperty(out, key, { value: v, enumerable: true, writable: true, configurable: true });
      } });
    }
  }
  return root.value;
}

export function encodeSnapshot(value: unknown): Snapshot {
  const copy = portableCopy(value);
  let json: string;
  try { json = JSON.stringify(copy); }
  catch { throw persistenceError("invalid_record", "commit"); }
  const bytes = utf8Bytes(json);
  if (bytes > MAX_PAYLOAD_BYTES) throw persistenceError("too_large", "commit");
  return Object.freeze({ json, bytes });
}

export function decodeSnapshot(json: string): JsonValue {
  if (utf8Bytes(json) > MAX_PAYLOAD_BYTES) throw persistenceError("too_large", "load");
  let value: unknown;
  try { value = JSON.parse(json); }
  catch { throw persistenceError("invalid_record", "load"); }
  return portableCopy(value, "load");
}

export function freezeCandidate(value: JsonValue): ReadonlyJson {
  const copy = portableCopy(value, "load");
  const stack: JsonValue[] = [copy];
  while (stack.length) {
    const item = stack.pop();
    if (item && typeof item === "object") {
      for (const child of Object.values(item)) stack.push(child);
      Object.freeze(item);
    }
  }
  return copy;
}
