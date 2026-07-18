// JSON data — datasets, the region-precise reactive store, and cursors
// (language §9). The doc is JSON-native by design: a Dataset holds an
// embedded JSON value, a DataSource is a reactive remote resource, and a
// `:path` read is a standing computation over a *region* of that data — the
// R4 core's promise cashed for data.
//
// Wake granularity (the rung's design center — every choice below serves "a
// one-field update wakes exactly the bindings that read that region"):
//
//   - A region cell is (container, key): one Cell per data slot, keyed by the
//     container's IDENTITY (a WeakMap), created on first tracked read —
//     pay-per-use, and identity-anchored so reordering an array never touches
//     the cells of the items themselves.
//   - A read of `:a.b.c` registers exactly ONE cell — the deepest slot the
//     walk reached (`(b, "c")` when resolved; the first missing/primitive
//     step's slot when not, so the read re-runs the moment that region gains
//     shape). Every read also rides the dataset's `value` attribute, so a
//     whole-value replacement (arrival, clear) wakes every data reader
//     through the ordinary attribute machinery — no tree walk needed.
//   - A write at a path wakes: the target's cell, the cells of every ANCESTOR
//     slot on the path (a binding that read `:item` as an object can observe
//     a deep change inside it), and — when a container is replaced or removed
//     — every cell under the OLD value (readers registered inside the region
//     being swapped out). Sibling regions never wake. Writes are
//     equality-gated (===) like attribute writes.
//   - Structural array edits (insert/remove/move) additionally wake every
//     cell registered ON the array container itself (order, membership,
//     length readers — the replicator's read) and nothing per surviving item:
//     an item's cells are anchored to the item, which moved but did not
//     change.
//
// A Cursor is an interned (dataset, path) handle — the `datapath` attribute's
// value. Interning makes re-derived cursors `===`-equal, so the attribute
// layer's equality gate stops cascades whose cursor came out the same.
//
// The LZX data machinery (LzDataset/LzDataElement/LzDatapointer, xpath) was
// read for intent only — what data binding feels like; its XML node model,
// datapointer objects, and string-event plumbing are exactly what this
// module's plain-JSON + region-cells design sheds (APPROACH §2/§6).

import { Node } from "./node.js";
import { Cell, isTracking } from "./reactive.js";
import { DeclareError } from "./errors.js";
import { defineAttributes, setBound } from "./attributes.js";
import type { AttrType } from "./value.js";
import { splitPath } from "./datapath.js";

/** A place in a dataset: the `datapath` attribute's value. Interned per
 *  dataset (see Dataset.cursorAt), so equal places are equal values. */
export interface Cursor {
  readonly data: Dataset;
  readonly path: readonly string[];
}

// container → per-key region cells. Module-level (identity-keyed, so datasets
// can never collide) and weak: cells live exactly as long as their data.
const CELLS = new WeakMap<object, Map<string, Cell>>();

// container → its current location. Written when a dataset adopts a value
// (arrival, embedded parse, an inserted subtree); healed lazily by toCursor
// when structure has shifted underneath it. This is what lets the doc's
// `datapath = { weatherData.value.rss.channel }` — plain TS dereferences —
// come back out as a place: the value itself knows where it lives.
const TAGS = new WeakMap<object, { data: Dataset; path: string[] }>();

const isContainer = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

function cellAt(container: object, key: string): Cell {
  let cells = CELLS.get(container);
  if (cells === undefined) CELLS.set(container, (cells = new Map()));
  let cell = cells.get(key);
  if (cell === undefined) cells.set(key, (cell = new Cell()));
  return cell;
}

const wake = (container: object, key: string): void => {
  CELLS.get(container)?.get(key)?.changed();
};

const wakeAll = (container: object): void => {
  const cells = CELLS.get(container);
  if (cells !== undefined) for (const c of cells.values()) c.changed();
};

/** Wake every cell registered inside `v` — the readers of a region being
 *  replaced or removed. Proportional to the OLD subtree, which is exactly
 *  the region that changed. */
function wakeTree(v: unknown): void {
  if (!isContainer(v)) return;
  wakeAll(v);
  for (const k of Object.keys(v)) wakeTree(v[k]);
}

function tagTree(data: Dataset, v: unknown, path: string[]): void {
  if (!isContainer(v)) return;
  TAGS.set(v, { data, path });
  for (const k of Object.keys(v)) tagTree(data, v[k], [...path, k]);
}

/** Own-key read — data lookups must never climb prototypes (the R2 own-key
 *  discipline: a field named "constructor" is data, not Object.prototype). */
const getOwn = (container: object, key: string): unknown =>
  Object.hasOwn(container, key) ? (container as Record<string, unknown>)[key] : undefined;

/** A Dataset holds embedded JSON (language §9: `events: Dataset { … }` — the
 *  `{ }` carries its JSON meaning there) and is the data half every source
 *  shares: the reactive `value` slot, region reads, and the mutation API.
 *  A Node, not a View — it sits in the tree (a named member, so bindings
 *  reach it by name) with no visual incarnation. */
export class Dataset extends Node {
  /** The data itself. Replacing it wholesale is one reactive write: every
   *  `:path` read tracks this slot too, so arrival/clear wakes them all. */
  declare value: unknown;

  /** A derived Dataset's write slot: `contents = { … }` binds here and its
   *  push mirrors the computed value into `value` (see defineAttributes). */
  declare contents: unknown;

  private readonly cursors = new Map<string, Cursor>();

  /** The interned cursor for `path` — one object per distinct place, so a
   *  re-derived cursor is `===` the old one and the equality gate holds. */
  cursorAt(path: readonly string[]): Cursor {
    const key = path.join(".");
    let c = this.cursors.get(key);
    if (c === undefined) this.cursors.set(key, (c = { data: this, path: [...path] }));
    return c;
  }

  /** Tracked read of the region at `path` (root-relative). Registers exactly
   *  one region cell — the deepest slot the walk reaches (see the header) —
   *  plus the `value` attribute read the first line makes. `undefined` means
   *  unresolved (a missing region); consumers surface it as null. */
  read(path: readonly string[]): unknown {
    let cur: unknown = this.value; // tracked: whole-value replacement wakes every reader
    let container: object | null = null;
    let key = "";
    for (const seg of path) {
      if (!isContainer(cur)) { cur = undefined; break; }
      container = cur;
      key = seg;
      cur = getOwn(cur, seg);
    }
    if (isTracking() && container !== null) cellAt(container, key).track();
    return cur;
  }

  // ── The mutation API — imperative edits that drive bindings and
  //    replication through the ordinary settle. Language §13 lists the
  //    authoring surface for structural mutation as an open design; these
  //    methods are the runtime layer it will bind to (recorded in HANDOFF).
  //    Paths are dot-strings, root-relative; array indices are ordinary
  //    segments ("rows.2.label"). ─────────────────────────────────────────

  /** Set the field at `path`. The path's containers must exist (a pointed
   *  error names the first missing step); the final field may be new.
   *  Equality-gated: writing the value already there wakes nothing. */
  set(path: string, v: unknown): void {
    const segs = this.segs(path);
    const { chain, container, key } = this.locate(segs);
    const old = getOwn(container, key);
    if (old === v) return;
    (container as Record<string, unknown>)[key] = v;
    tagTree(this, v, segs);
    this.wakeChain(chain);
    wakeTree(old);
  }

  /** Insert `v` at `index` of the array at `path`. */
  insert(path: string, index: number, v: unknown): void {
    const { arr, chain, segs } = this.array(path);
    arr.splice(index, 0, v);
    tagTree(this, v, [...segs, String(index)]);
    wakeAll(arr);
    this.wakeChain(chain);
  }

  /** Remove (and return) the element at `index` of the array at `path`. */
  removeAt(path: string, index: number): unknown {
    const { arr, chain } = this.array(path);
    const [removed] = arr.splice(index, 1);
    wakeAll(arr);
    this.wakeChain(chain);
    wakeTree(removed);
    return removed;
  }

  /** Move the element at `from` to `to` within the array at `path` — a pure
   *  reorder: item regions are identity-anchored, so only order readers (the
   *  array's own cells, the ancestors) wake; no item REGION cell stirs (the
   *  replicator's re-pointed cursors are the only item-side wake, and their
   *  equal re-reads die at the equality gate — replicate.ts). */
  move(path: string, from: number, to: number): void {
    if (from === to) return;
    const { arr, chain } = this.array(path);
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    wakeAll(arr);
    this.wakeChain(chain);
  }

  private segs(path: string): string[] {
    const segs = splitPath(path);
    if (segs.length === 0) {
      throw new DeclareError(`an empty path addresses the whole dataset — assign .value to replace it`);
    }
    return segs;
  }

  /** Walk `segs` from the root, collecting the (container, key) step chain —
   *  which is exactly the ancestor set a write must wake. */
  private locate(segs: string[]): { chain: [object, string][]; container: object; key: string } {
    let cur: unknown = this.value;
    const chain: [object, string][] = [];
    for (let i = 0; ; i++) {
      if (!isContainer(cur)) {
        const at = i === 0 ? "the dataset has no value" : `'${segs.slice(0, i).join(".")}' is ${cur === undefined ? "missing" : "not a container"}`;
        throw new DeclareError(`'${segs.join(".")}' addresses nothing — ${at}`);
      }
      chain.push([cur, segs[i]]);
      if (i === segs.length - 1) return { chain, container: cur, key: segs[i] };
      cur = getOwn(cur, segs[i]);
    }
  }

  private array(path: string): { arr: unknown[]; chain: [object, string][]; segs: string[] } {
    const segs = this.segs(path);
    const { chain, container, key } = this.locate(segs);
    const arr = getOwn(container, key);
    if (!Array.isArray(arr)) {
      throw new DeclareError(`'${segs.join(".")}' is not an array — structural edits need one`);
    }
    return { arr, chain, segs };
  }

  private wakeChain(chain: readonly [object, string][]): void {
    for (const [container, key] of chain) wake(container, key);
  }
}

defineAttributes(Dataset, {
  // Adopting a value tags its containers with their locations, which is what
  // lets `datapath = { … }` expressions turn dereferenced values back into
  // places. The write itself is ordinary reactive machinery: every data read
  // tracked this slot, so replacement wakes them all.
  value: { def: null, push: (d, v) => tagTree(d, v, []) },
  // A derived Dataset's `contents = { … }` binds here; its push mirrors the
  // computed value into `value` through value's own reactive setter — so a
  // recompute tags the new tree and wakes every `:path` reader and replicator,
  // exactly as a wholesale `.value` replacement does. `contents` itself is
  // never read back (nothing tracks it); it is the author-facing write slot.
  contents: { def: null, push: (d: Dataset, v: unknown) => { d.value = v; } },
});

/** The injected transport — the network's entry seam, like the measurer's
 *  (measure.ts provideMeasurer). Default = the platform fetch; HEADLESS
 *  execution installs a REFUSING transport (capabilities.md §3: network is
 *  "fixtures, or honestly absent") so extraction/verify can never initiate a
 *  request — the source lands in `failed` with the reason, by construction. */
type Transport = (url: string) => Promise<Response>;
let transport: Transport = (url) => globalThis.fetch(url);

/** Swap the transport (headless installs a refuser; tests install stubs).
 *  Returns the PREVIOUS transport so a scoped caller can restore it. */
export function provideTransport(fn: Transport): Transport {
  const prev = transport;
  transport = fn;
  return prev;
}

/** A DataSource is a Dataset whose value arrives over HTTP (language §9): a
 *  reactive remote resource whose LIFECYCLE is reactive state — screens
 *  derive from `.loading`/`.loaded`/`.failed` with ordinary constraints
 *  instead of imperative show/hide. One arrival is one write burst in one
 *  turn: value + status settle together, ahead of one frame. */
export class DataSource extends Dataset {
  declare url: string;
  /** What the bytes ARE: "json" (the default — parsed, `:path` navigable) or
   *  "text" (the raw string as `value` — a Markdown article, a source file).
   *  Text is a first-class material: an authored .md is fetched directly, no
   *  JSON-wrapping projection beside it. */
  declare format: "json" | "text";
  /** The lifecycle, as one fact; the four doc-named booleans derive below. */
  declare status: "idle" | "loading" | "loaded" | "failed";
  declare error: string | null;

  // Tracked reads of `status`, so a constraint on `.loaded` wakes exactly
  // when the lifecycle moves (all four share the one status cell — they are
  // four views of one fact and can never disagree).
  get idle(): boolean { return this.status === "idle"; }
  get loading(): boolean { return this.status === "loading"; }
  get loaded(): boolean { return this.status === "loaded"; }
  get failed(): boolean { return this.status === "failed"; }

  /** Discards a superseded request: only the latest fetch/clear may land
   *  (the Image loader's sequence discipline). */
  private seq = 0;

  /** Fetch `url` (JSON over HTTP). Explicit by design — the weather app's
   *  entry screen decides when (`doEnterDown() { weatherData.fetch() }`);
   *  whether a source should ever auto-fetch is a recorded open question. */
  async fetch(): Promise<void> {
    const seq = ++this.seq;
    setBound(this, "status", "loading");
    setBound(this, "error", null);
    try {
      const res = await transport(this.url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${this.url}`);
      const value: unknown = this.format === "text" ? await res.text() : await res.json();
      if (seq !== this.seq) return; // superseded
      setBound(this, "value", value);
      setBound(this, "status", "loaded");
    } catch (e) {
      if (seq !== this.seq) return;
      setBound(this, "error", e instanceof Error ? e.message : String(e));
      setBound(this, "status", "failed");
    }
  }

  /** Reset to idle (the doc's "back to the entry screen — declaratively"). */
  clear(): void {
    this.seq++;
    setBound(this, "value", null);
    setBound(this, "error", null);
    setBound(this, "status", "idle");
  }
}

defineAttributes(DataSource, {
  url: { def: "" },
  format: { def: "json" },
  status: { def: "idle" },
  error: { def: null },
});

/** Turn a `datapath = { expr }` result into a place. The value must be a
 *  container that belongs to a dataset (its adoption tag says which, and
 *  where); the location is re-verified by navigation — registering a tracked
 *  read of every step, so a structural change anywhere on the chain re-runs
 *  the cursor — and healed by an identity search when the structure shifted
 *  underneath the tag. null/undefined mean "no cursor yet" (a source that
 *  has not loaded). */
export function toCursor(v: unknown, context: string): Cursor | null {
  if (v === null || v === undefined) return null;
  if (!isContainer(v)) {
    throw new DeclareError(
      `${context}: a datapath is a place in a dataset — got ${typeof v} (point at an object or array; read leaf fields with :path)`
    );
  }
  const tag = TAGS.get(v);
  if (tag === undefined) {
    throw new DeclareError(
      `${context}: this value belongs to no Dataset/DataSource — a cursor can only point into declared data`
    );
  }
  if (resolveTracked(tag.data, tag.path) !== v) {
    const healed = locateByIdentity(tag.data.value, v, []);
    if (healed === null) {
      throw new DeclareError(`${context}: this value is no longer anywhere in its dataset`);
    }
    tag.path = healed;
    resolveTracked(tag.data, tag.path); // track the healed chain
  }
  return tag.data.cursorAt(tag.path);
}

/** Navigate `path`, registering a tracked read at EVERY step (unlike
 *  Dataset.read's deepest-slot rule): a cursor stands on its whole chain. */
function resolveTracked(data: Dataset, path: readonly string[]): unknown {
  let cur: unknown = data.value; // tracked
  for (const seg of path) {
    if (!isContainer(cur)) return undefined;
    if (isTracking()) cellAt(cur, seg).track();
    cur = getOwn(cur, seg);
  }
  return cur;
}

function locateByIdentity(cur: unknown, target: object, path: string[]): string[] | null {
  if (cur === target) return path;
  if (!isContainer(cur)) return null;
  for (const k of Object.keys(cur)) {
    const found = locateByIdentity(getOwn(cur, k), target, [...path, k]);
    if (found !== null) return found;
  }
  return null;
}

/** Coerce a data value into a typed attribute slot (the dynamic mode's
 *  boundary: no schema yet, so shape arrives at runtime). Unresolved (null)
 *  falls back to `def` — the slot's declared default, per the doc ("an
 *  unresolved path yields null, and the bound attribute falls back to its
 *  default"). Numbers and booleans render into string slots (the doc binds
 *  `text = :item.condition.temp`, an int); anything else must match the
 *  slot's type or it reads as unresolved. Recorded as an open question —
 *  these rules are language surface. */
export function coerceData(type: AttrType, v: unknown, def: unknown): unknown {
  if (v === null || v === undefined) return def;
  switch (type.kind) {
    case "string":
      return typeof v === "string" ? v
        : typeof v === "number" || typeof v === "boolean" ? String(v)
        : def;
    case "number":
    case "length":
      return typeof v === "number" ? v : def;
    case "boolean":
      return typeof v === "boolean" ? v : def;
    case "color":
      return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : def;
    case "fill":
      // Dynamic-mode data can carry a solid color (an opaque number); the
      // structured decoration forms are source-side values, not data.
      return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : def;
    case "shape":
      return typeof v === "string" ? v : def;
    case "enum":
      return typeof v === "string" && type.tokens.includes(v) ? v : def;
    case "cursor":
    case "component":
    case "record":
    case "stroke":
    case "shadow":
    case "motion":
    case "styles":
    case "stylesheet":
    case "font":
    case "slotref":
      return def; // never data-bound in a useful form; total for safety
  }
}
