import { Node } from "./node.js";
import type { AttrType } from "./value.js";
/** A place in a dataset: the `datapath` attribute's value. Interned per
 *  dataset (see Dataset.cursorAt), so equal places are equal values. */
export interface Cursor {
    readonly data: Dataset;
    readonly path: readonly string[];
}
/** A Dataset holds embedded JSON (language §9: `events: Dataset { … }` — the
 *  `{ }` carries its JSON meaning there) and is the data half every source
 *  shares: the reactive `value` slot, region reads, and the mutation API.
 *  A Node, not a View — it sits in the tree (a named member, so bindings
 *  reach it by name) with no visual incarnation. */
export declare class Dataset extends Node {
    /** The data itself. Replacing it wholesale is one reactive write: every
     *  `:path` read tracks this slot too, so arrival/clear wakes them all. */
    value: unknown;
    /** A derived Dataset's write slot: `contents = { … }` binds here and its
     *  push mirrors the computed value into `value` (see defineAttributes). */
    contents: unknown;
    private readonly cursors;
    /** The interned cursor for `path` — one object per distinct place, so a
     *  re-derived cursor is `===` the old one and the equality gate holds. */
    cursorAt(path: readonly string[]): Cursor;
    /** Tracked read of the region at `path` (root-relative). Registers exactly
     *  one region cell — the deepest slot the walk reaches (see the header) —
     *  plus the `value` attribute read the first line makes. `undefined` means
     *  unresolved (a missing region); consumers surface it as null. */
    read(path: readonly string[]): unknown;
    /** Set the field at `path`. The path's containers must exist (a pointed
     *  error names the first missing step); the final field may be new.
     *  Equality-gated: writing the value already there wakes nothing. */
    set(path: string, v: unknown): void;
    /** Insert `v` at `index` of the array at `path`. */
    insert(path: string, index: number, v: unknown): void;
    /** Remove (and return) the element at `index` of the array at `path`. */
    removeAt(path: string, index: number): unknown;
    /** Move the element at `from` to `to` within the array at `path` — a pure
     *  reorder: item regions are identity-anchored, so only order readers (the
     *  array's own cells, the ancestors) wake; no item REGION cell stirs (the
     *  replicator's re-pointed cursors are the only item-side wake, and their
     *  equal re-reads die at the equality gate — replicate.ts). */
    move(path: string, from: number, to: number): void;
    private segs;
    /** Walk `segs` from the root, collecting the (container, key) step chain —
     *  which is exactly the ancestor set a write must wake. */
    private locate;
    private array;
    private wakeChain;
}
/** The injected transport — the network's entry seam, like the measurer's
 *  (measure.ts provideMeasurer). Default = the platform fetch; HEADLESS
 *  execution installs a REFUSING transport (capabilities.md §3: network is
 *  "fixtures, or honestly absent") so extraction/verify can never initiate a
 *  request — the source lands in `failed` with the reason, by construction. */
type Transport = (url: string) => Promise<Response>;
/** Swap the transport (headless installs a refuser; tests install stubs).
 *  Returns the PREVIOUS transport so a scoped caller can restore it. */
export declare function provideTransport(fn: Transport): Transport;
/** A DataSource is a Dataset whose value arrives over HTTP (language §9): a
 *  reactive remote resource whose LIFECYCLE is reactive state — screens
 *  derive from `.loading`/`.loaded`/`.failed` with ordinary constraints
 *  instead of imperative show/hide. One arrival is one write burst in one
 *  turn: value + status settle together, ahead of one frame. */
export declare class DataSource extends Dataset {
    url: string;
    /** The lifecycle, as one fact; the four doc-named booleans derive below. */
    status: "idle" | "loading" | "loaded" | "failed";
    error: string | null;
    get idle(): boolean;
    get loading(): boolean;
    get loaded(): boolean;
    get failed(): boolean;
    /** Discards a superseded request: only the latest fetch/clear may land
     *  (the Image loader's sequence discipline). */
    private seq;
    /** Fetch `url` (JSON over HTTP). Explicit by design — the weather app's
     *  entry screen decides when (`doEnterDown() { weatherData.fetch() }`);
     *  whether a source should ever auto-fetch is a recorded open question. */
    fetch(): Promise<void>;
    /** Reset to idle (the doc's "back to the entry screen — declaratively"). */
    clear(): void;
}
/** Turn a `datapath = { expr }` result into a place. The value must be a
 *  container that belongs to a dataset (its adoption tag says which, and
 *  where); the location is re-verified by navigation — registering a tracked
 *  read of every step, so a structural change anywhere on the chain re-runs
 *  the cursor — and healed by an identity search when the structure shifted
 *  underneath the tag. null/undefined mean "no cursor yet" (a source that
 *  has not loaded). */
export declare function toCursor(v: unknown, context: string): Cursor | null;
/** Coerce a data value into a typed attribute slot (the dynamic mode's
 *  boundary: no schema yet, so shape arrives at runtime). Unresolved (null)
 *  falls back to `def` — the slot's declared default, per the doc ("an
 *  unresolved path yields null, and the bound attribute falls back to its
 *  default"). Numbers and booleans render into string slots (the doc binds
 *  `text = :item.condition.temp`, an int); anything else must match the
 *  slot's type or it reads as unresolved. Recorded as an open question —
 *  these rules are language surface. */
export declare function coerceData(type: AttrType, v: unknown, def: unknown): unknown;
export {};
