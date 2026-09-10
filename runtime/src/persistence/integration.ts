import { Dataset, observeDatasetMutation, unwrapValue } from "../data.js";
import { validateDoc } from "../data-schema.js";
import { onDiscard } from "../node.js";
import type { Node } from "../node.js";
import { afterSettle, onSettleCompletion, settle } from "../reactive.js";
import { fireEvent } from "../view.js";
import { bindPersistence, publishPersistence } from "./node.js";
import type { Persistence } from "./node.js";
import type { PersistenceHostOptions } from "./context.js";
import { DocumentPersistence } from "./lifecycle.js";
import { systemClock } from "./indexeddb.js";
import { persistenceError } from "./errors.js";
import { resolveScope, scopeKey, validatePolicy } from "./records.js";
import type { PersistenceEngine, PersistenceOperation, PersistenceProvider } from "./types.js";

const prepared = new WeakSet<Persistence>();
const owners = new WeakMap<Node, Map<string, Persistence>>();
const unsupported: PersistenceProvider = {
  read: () => Promise.reject(persistenceError("unsupported", "load")),
  write: () => Promise.reject(persistenceError("unsupported", "commit")),
  erase: () => Promise.reject(persistenceError("unsupported", "erase")),
};

/** Observe before any authored init; latch/bind after construction has settled. */
export function preparePolicy(node: Persistence, options: PersistenceHostOptions = {}): (() => void) | null {
  if (prepared.has(node)) return null;
  prepared.add(node);
  const data = node.parent;
  if (!(data instanceof Dataset)) return () => refuse(node);
  let engine: PersistenceEngine | null = null, earlyEdit = false, alive = true;
  const unobserve = observeDatasetMutation(data, () => {
    if (engine) engine.acceptedMutation(); else earlyEdit = true;
  });
  let unlisten: (() => void) | null = null;
  let release: (() => void) | null = null;
  onDiscard(node, () => { alive = false; unobserve(); unlisten?.(); release?.(); engine?.retire(); });
  return () => {
    if (!alive) return;
    try {
      const policy = validatePolicy({ key: node.key, restoreOn: node.restoreOn, save: node.save,
        delay: node.delay, maxDelay: node.maxDelay, conflict: node.conflict });
      const scope = resolveScope(options.entryURL ?? "declare:hostless", policy.key, options.appId, options.namespace);
      const root = node.root, key = scopeKey(scope);
      let map = owners.get(root);
      if (!map) owners.set(root, map = new Map());
      if (map.has(key)) throw persistenceError("configuration", "load");
      map.set(key, node);
      release = () => { if (map!.get(key) === node) map!.delete(key); };
      engine = new DocumentPersistence(options.provider ?? unsupported, scope, policy, {
        capture: () => unwrapValue(data.value),
        validate: value => {
          if (data.schema !== null && validateDoc(value, data.schema) !== null)
            throw persistenceError("schema_mismatch", "load");
        },
        adopt: value => data.set([], value),
        publish: state => publishPersistence(node, state),
        deliver: result => fireEvent(node, "result", result),
        requestSettle: () => afterSettle(() => {}),
        defer: callback => queueMicrotask(() => {
          if (!alive) return;
          try { settle(); } finally { callback(); }
        }),
      }, options.clock ?? systemClock);
      bindPersistence(node, engine);
      unlisten = onSettleCompletion(success => engine?.settled(success));
      if (earlyEdit) engine.acceptedMutation();
      // onInit edits and explicit commit intents settle before the asynchronous read arrives.
      afterSettle(() => { if (alive) engine?.start(); });
    } catch { unobserve(); release?.(); refuse(node); }
  };
}

/** Invalid dynamic configuration is readable state, not a host-boot exception. */
function refuse(node: Persistence): void {
  const error = persistenceError("configuration", "load");
  publishPersistence(node, { loadStatus: "failed", writeStatus: "idle", recovery: "none", candidate: null,
    candidateSavedAt: null, exists: false, revision: 0, savedRevision: -1, savedAt: null,
    autosavePaused: false, error, pending: false, dirty: false, saved: false, failed: true });
  let id = 0, alive = true;
  onDiscard(node, () => { alive = false; });
  const reject = (operation: PersistenceOperation) => {
    const requestId = ++id;
    queueMicrotask(() => { if (alive) fireEvent(node, "result", Object.freeze({
      requestId, operation, ok: false, revision: null, storedRevision: null, savedAt: null,
      error: persistenceError("configuration", operation),
    })); });
    return requestId;
  };
  bindPersistence(node, {
    start() {}, acceptedMutation() {}, settled() {}, configurationFailed() {}, retire() { alive = false; },
    commit: () => reject("commit"), replace: () => reject("commit"), restore: () => false,
    erase: () => reject("erase"), retry: () => reject("load"), reload: () => reject("load"),
  });
}
