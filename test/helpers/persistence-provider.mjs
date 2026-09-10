// Test-only provider: callers explicitly settle operations; no production memory fallback.
import { classifyRow, checkExpectation, scopeKey } from "../../runtime/dist/persistence/records.js";
import { normalizeError, persistenceError } from "../../runtime/dist/persistence/errors.js";
import { decodeSnapshot, utf8Bytes } from "../../runtime/dist/persistence/codec.js";

export class ControlledClock {
  time = 0;
  next = 0;
  tasks = new Map();
  now = () => this.time;
  schedule = (delay, callback) => {
    const id = ++this.next;
    this.tasks.set(id, { at: this.time + delay, callback });
    return () => this.tasks.delete(id);
  };
  advance(ms) {
    const end = this.time + ms;
    for (;;) {
      const next = [...this.tasks].filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      this.time = next[1].at;
      this.tasks.delete(next[0]); next[1].callback();
    }
    this.time = end;
  }
}

export class ControlledProvider {
  rows = new Map();
  pending = [];
  log = [];
  serial = 0;
  tokens = 0;
  constructor({ now = () => 0, token } = {}) {
    this.now = now;
    this.token = token ?? (() => (++this.tokens).toString(16).padStart(32, "0"));
  }
  read = scope => this.enqueue("load", scope);
  write = (scope, expected, document) => this.enqueue("commit", scope, expected, document);
  erase = (scope, expected) => this.enqueue("erase", scope, expected);
  enqueue(operation, scope, expected, document) {
    const key = scopeKey(scope);
    return new Promise((resolve, reject) => {
      const id = ++this.serial;
      const entry = { id, operation, scope: { ...scope }, key, expected: expected && { ...expected },
        document: document && { ...document }, resolve, reject };
      this.pending.push(entry);
      this.log.push({ id, operation, scope: { ...scope }, bytes: document ? utf8Bytes(document.json) : 0,
        outcome: "pending" });
    });
  }
  /** Select by operation ID to exercise out-of-order completions across independent keys. */
  complete(id = this.pending[0]?.id, failure) {
    const index = this.pending.findIndex(p => p.id === id);
    if (index < 0) throw new Error("No pending storage operation");
    const [op] = this.pending.splice(index, 1);
    const log = this.log.find(e => e.id === id);
    try {
      if (failure) throw typeof failure === "string" ? persistenceError(failure, op.operation) : failure;
      const read = classifyRow(this.rows.get(op.key));
      let receipt;
      if (op.operation === "load") receipt = read;
      else {
        checkExpectation(read, op.expected);
        const revision = this.token();
        if (op.operation === "erase") {
          this.rows.set(op.key, { control: 1, revision, document: null });
          receipt = { revision };
        } else {
          if (op.document.format !== 1) throw persistenceError("unsupported_format", "commit");
          decodeSnapshot(op.document.json);
          const savedAt = new Date(this.now()).toISOString();
          this.rows.set(op.key, { control: 1, revision, document: { ...op.document, savedAt } });
          receipt = { revision, savedAt };
        }
      }
      log.outcome = "success"; log.revision = receipt.revision;
      op.resolve(Object.freeze(receipt));
    } catch (error) {
      const normalized = normalizeError(error, op.operation);
      log.outcome = normalized.code; op.reject(normalized);
    }
  }
  inject(scope, row) { this.rows.set(scopeKey(scope), structuredClone(row)); }
  inspect(scope) { return structuredClone(this.rows.get(scopeKey(scope))); }
  cleanup(appId, namespace) {
    for (const key of this.rows.keys()) {
      const parts = JSON.parse(key);
      if (parts[0] === appId && parts[1] === namespace) this.rows.delete(key);
    }
  }
}

/** Drain promise continuations without changing controlled time. */
export async function microtasks() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
