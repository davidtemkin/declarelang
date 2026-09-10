import type { PersistenceClock, PersistenceProvider } from "./types.js";

/** Host-only options, supplied before construction/init. Never an authored attribute. */
export interface PersistenceHostOptions {
  readonly provider?: PersistenceProvider;
  readonly entryURL?: string;
  readonly appId?: string;
  readonly namespace?: string;
  readonly clock?: PersistenceClock;
}
