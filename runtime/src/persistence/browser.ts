import { IndexedDBProvider } from "./indexeddb.js";
import { normalizeError } from "./errors.js";
import type { PersistenceHostOptions } from "./context.js";
import type { PersistenceProvider } from "./types.js";

const providers = new WeakMap<IDBFactory, PersistenceProvider>();

/** Host-only installation. No database is opened until a policy reads it. */
export function browserPersistence(entryURL: string, options: PersistenceHostOptions = {}): PersistenceHostOptions {
  const configured = { ...options, entryURL: options.entryURL ?? entryURL };
  if (options.provider) return configured;
  try {
    if (typeof indexedDB === "undefined") return configured;
    const factory = indexedDB;
    let provider = providers.get(factory);
    if (!provider) { provider = new IndexedDBProvider({ factory }); providers.set(factory, provider); }
    return { ...configured, provider };
  } catch (error) {
    // Access itself can throw in a sandboxed/denied browser. Do not relabel a
    // refusal as an absent record or silently switch to volatile storage.
    return { ...configured, provider: {
      read: () => Promise.reject(normalizeError(error, "load")),
      write: () => Promise.reject(normalizeError(error, "commit")),
      erase: () => Promise.reject(normalizeError(error, "erase")),
    } };
  }
}
