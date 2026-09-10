import { scopeKey } from "./records.js";
import type { PersistenceProvider, Scope } from "./types.js";

// A lane outlives its policy. A replacement owner cannot read ahead of an issued write.
const lanes = new WeakMap<PersistenceProvider, Map<string, Promise<void>>>();
export function inStorageLane<T>(provider: PersistenceProvider, scope: Scope, work: () => Promise<T>): Promise<T> {
  let map = lanes.get(provider);
  if (!map) lanes.set(provider, map = new Map());
  const key = scopeKey(scope), prior = map.get(key) ?? Promise.resolve();
  const result = prior.then(work);
  const tail = result.then(() => {}, () => {});
  map.set(key, tail);
  void tail.then(() => { if (map!.get(key) === tail) map!.delete(key); });
  return result;
}
