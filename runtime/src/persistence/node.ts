import { Node } from "../node.js";
import { defineAttributes, setBound } from "../attributes.js";
import { DeclareError } from "../errors.js";
import { preparePolicy } from "./integration.js";
import type { PersistenceHostOptions } from "./context.js";
import type { PersistenceEngine, PersistenceError, PersistencePolicy, PersistenceState,
  ReadonlyJson } from "./types.js";

const engines = new WeakMap<Persistence, PersistenceEngine>();
/** Installed by the runtime's persistence wiring, never an authored attribute. */
export function bindPersistence(node: Persistence, engine: PersistenceEngine): void { engines.set(node, engine); }
export function publishPersistence(node: Persistence, state: PersistenceState): void {
  for (const [key, value] of Object.entries(state)) setBound(node, key, value);
}

/** A Dataset's storage policy. Runtime binding owns all scheduling and owner lifetime. */
export class Persistence extends Node {
  /** @internal Runtime construction hook, not an authored command. */
  _preparePersistence(options: PersistenceHostOptions): (() => void) | null { return preparePolicy(this, options); }
  declare key: string;
  declare restoreOn: PersistencePolicy["restoreOn"];
  declare save: PersistencePolicy["save"];
  declare delay: number;
  declare maxDelay: number;
  declare conflict: PersistencePolicy["conflict"];
  declare readonly loadStatus: PersistenceState["loadStatus"];
  declare readonly writeStatus: PersistenceState["writeStatus"];
  declare readonly recovery: PersistenceState["recovery"];
  declare readonly candidate: ReadonlyJson;
  declare readonly candidateSavedAt: string | null;
  declare readonly exists: boolean;
  declare readonly revision: number;
  declare readonly savedRevision: number;
  declare readonly savedAt: string | null;
  declare readonly autosavePaused: boolean;
  declare readonly error: PersistenceError | null;
  declare readonly pending: boolean;
  declare readonly dirty: boolean;
  declare readonly saved: boolean;
  declare readonly failed: boolean;
  private engine(): PersistenceEngine {
    const engine = engines.get(this);
    if (!engine) throw new DeclareError("Persistence is not bound to an initialized Dataset owner");
    return engine;
  }
  commit(): number { return this.engine().commit(); }
  replace(): number { return this.engine().replace(); }
  restore(): boolean { return this.engine().restore(); }
  erase(): number { return this.engine().erase(); }
  retry(): number { return this.engine().retry(); }
  reload(): number { return this.engine().reload(); }
}
defineAttributes(Persistence, {
  key: { def: "", push: n => engines.get(n)?.configurationFailed() },
  restoreOn: { def: "load", push: n => engines.get(n)?.configurationFailed() },
  save: { def: "auto", push: n => engines.get(n)?.configurationFailed() },
  delay: { def: 250, push: n => engines.get(n)?.configurationFailed() },
  maxDelay: { def: 1000, push: n => engines.get(n)?.configurationFailed() },
  conflict: { def: "fail", push: n => engines.get(n)?.configurationFailed() },
  loadStatus: { def: "loading", readOnly: true }, writeStatus: { def: "idle", readOnly: true },
  recovery: { def: "none", readOnly: true }, candidate: { def: null, readOnly: true },
  candidateSavedAt: { def: null, readOnly: true }, exists: { def: false, readOnly: true },
  revision: { def: 0, readOnly: true }, savedRevision: { def: -1, readOnly: true },
  savedAt: { def: null, readOnly: true }, autosavePaused: { def: false, readOnly: true },
  error: { def: null, readOnly: true }, pending: { def: false, readOnly: true },
  dirty: { def: false, readOnly: true }, saved: { def: false, readOnly: true },
  failed: { def: false, readOnly: true },
});
