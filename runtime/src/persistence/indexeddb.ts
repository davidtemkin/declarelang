import { classifyRow, checkExpectation, validateScope } from "./records.js";
import { decodeSnapshot } from "./codec.js";
import { normalizeError, persistenceError } from "./errors.js";
import type { Expectation, PersistenceClock, PersistenceOperation, PersistenceProvider,
  ReadReceipt, Scope, StoredDocument, WriteReceipt } from "./types.js";

export const PERSISTENCE_DATABASE = "declare-persistence";
export const PERSISTENCE_STORE = "documents";
export const STORAGE_DEADLINE = 10_000;
export const systemClock: PersistenceClock = {
  now: () => Date.now(),
  schedule: (delay, callback) => {
    const id = setTimeout(callback, delay);
    return () => clearTimeout(id);
  },
};
export interface IndexedDBOptions {
  readonly factory: IDBFactory;
  readonly clock?: PersistenceClock;
  readonly token?: () => string;
  readonly diagnostic?: (entry: { operation: PersistenceOperation; durability: string }) => void;
}

/** Browser adapter only. The policy engine owns batching, deadlines for issued
 *  transactions, and result delivery; request success is never a storage receipt. */
export class IndexedDBProvider implements PersistenceProvider {
  private connection: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase> | null = null;
  private readonly clock: PersistenceClock;
  private readonly token: () => string;
  constructor(private readonly options: IndexedDBOptions) {
    this.clock = options.clock ?? systemClock;
    this.token = options.token ?? (() => Array.from(crypto.getRandomValues(new Uint8Array(16)),
      b => b.toString(16).padStart(2, "0")).join(""));
  }

  private open(): Promise<IDBDatabase> {
    if (this.connection) return Promise.resolve(this.connection);
    if (this.opening) return this.opening;
    let request: IDBOpenDBRequest;
    try { request = this.options.factory.open(PERSISTENCE_DATABASE, 1); }
    catch (error) { return Promise.reject(normalizeError(error, "load")); }
    this.opening = new Promise((resolve, reject) => {
      let expired = false, blocked = false;
      const cancel = this.clock.schedule(STORAGE_DEADLINE, () => {
        expired = true;
        reject(persistenceError(blocked ? "blocked" : "unavailable", "load"));
        // Keep the rejected attempt until IDB reports terminal state: open cannot be canceled.
      });
      request.onblocked = () => { blocked = true; };
      request.onupgradeneeded = () => {
        if (expired) { request.transaction?.abort(); return; }
        if (!request.result.objectStoreNames.contains(PERSISTENCE_STORE))
          request.result.createObjectStore(PERSISTENCE_STORE);
      };
      request.onerror = () => {
        cancel(); this.opening = null;
        reject(normalizeError(request.error, "load"));
      };
      request.onsuccess = () => {
        cancel(); this.opening = null;
        const db = request.result;
        if (expired) { db.close(); return; }
        this.connection = db;
        db.onversionchange = () => {
          if (this.connection === db) this.connection = null;
          // close() prevents new transactions and drains issued transactions before closing.
          db.close();
        };
        db.onclose = () => { if (this.connection === db) this.connection = null; };
        resolve(db);
      };
    });
    return this.opening;
  }

  private transaction(db: IDBDatabase, operation: PersistenceOperation): IDBTransaction {
    if (operation === "load") return db.transaction(PERSISTENCE_STORE, "readonly");
    let tx: IDBTransaction;
    try { tx = db.transaction(PERSISTENCE_STORE, "readwrite", { durability: "strict" }); }
    catch (error) {
      if (!(error instanceof TypeError)) throw error;
      tx = db.transaction(PERSISTENCE_STORE, "readwrite");
    }
    this.options.diagnostic?.({ operation, durability: tx.durability ?? "default" });
    return tx;
  }

  private async run<T>(scope: Scope, operation: PersistenceOperation,
    action: (store: IDBObjectStore, current: ReadReceipt, done: (receipt: T) => void) => void): Promise<T> {
    validateScope(scope);
    let db: IDBDatabase;
    try { db = await this.open(); }
    catch (error) { throw normalizeError(error, operation); }
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = this.transaction(db, operation); }
      catch (error) { reject(normalizeError(error, operation)); return; }
      let result: T, ready = false, failure: unknown;
      tx.oncomplete = () => {
        if (ready) resolve(result);
        else reject(persistenceError("io", operation));
      };
      tx.onabort = () => reject(normalizeError(failure ?? tx.error, operation));
      tx.onerror = () => { failure ??= tx.error; };
      const store = tx.objectStore(PERSISTENCE_STORE);
      const request = store.get([scope.appId, scope.namespace, scope.key]);
      request.onsuccess = () => {
        try { action(store, classifyRow(request.result), receipt => { result = receipt; ready = true; }); }
        catch (error) { failure = error; tx.abort(); }
      };
    });
  }

  read(scope: Scope): Promise<ReadReceipt> {
    return this.run({ ...scope }, "load", (_store, current, done) => done(current));
  }
  write(scope: Scope, expected: Expectation, document: StoredDocument): Promise<WriteReceipt> {
    // Capture caller arguments before the asynchronous open. The provider never retains a live document.
    const captured = { ...document }, authority = { ...expected }, target = { ...scope };
    return this.run(target, "commit", (store, current, done) => {
      checkExpectation(current, authority);
      if (captured.format !== 1) throw persistenceError("unsupported_format", "commit");
      decodeSnapshot(captured.json);
      const revision = this.newRevision(), savedAt = new Date(this.clock.now()).toISOString();
      store.put({ control: 1, revision, document: { ...captured, savedAt } },
        [target.appId, target.namespace, target.key]);
      done(Object.freeze({ revision, savedAt }));
    });
  }
  erase(scope: Scope, expected: Expectation): Promise<{ revision: string }> {
    const captured = { ...scope }, authority = { ...expected };
    return this.run(captured, "erase", (store, current, done) => {
      checkExpectation(current, authority);
      const revision = this.newRevision();
      store.put({ control: 1, revision, document: null }, [captured.appId, captured.namespace, captured.key]);
      done(Object.freeze({ revision }));
    });
  }
  private newRevision(): string {
    const token = this.token();
    if (!/^[0-9a-f]{32}$/.test(token)) throw persistenceError("io", "commit");
    return token;
  }
  /** Host shutdown; close drains already issued transactions. */
  close(): void { this.connection?.close(); this.connection = null; }
}
