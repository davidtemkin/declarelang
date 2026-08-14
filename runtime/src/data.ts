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
import { Cell, isTracking, settle } from "./reactive.js";
import { DeclareError } from "./errors.js";
import { defineAttributes, setBound } from "./attributes.js";
import type { AttrType } from "./value.js";
import { validateShape, type ShapeField } from "./data-schema.js";

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

// ── The path currency (B2, data-paths.md §11 — RULED 2026-07-30) ──────────
//
// The mutation/read API takes SEGMENTS (the documented form — an array of
// strings/numbers, no escaping anywhere) or an RFC 6901 POINTER STRING (the
// interop spelling: "/events/3/y", "~0"/"~1" escapes honored — the testable
// conformance claim). The dot-string form is RETIRED: it is the one spelling
// that can never address a dotted key, and its silent ambiguity was the §2
// hole. Diagnostics SPEAK pointer (authors never have to write one).

/** The path a diagnostic shows: the pointer rendering of `segs` — exact for
 *  every key, including dotted, slashed, and empty ones. */
const showPath = (segs: readonly string[]): string =>
  "/" + segs.map((t) => t.replace(/~/g, "~0").replace(/\//g, "~1")).join("/");

/** RFC 6901 §4: a pointer is "" (the whole document) or "/"-led tokens;
 *  unescape ~1 → "/" then ~0 → "~" (that order — "~01" must yield "~1", not
 *  "/"). A "~" before anything but 0/1 is malformed and refused. */
function parsePointer(p: string): string[] {
  const out: string[] = [];
  for (const raw of p.slice(1).split("/")) {
    const bad = raw.match(/~(?![01])/);
    if (bad !== null) {
      throw new DeclareError(`'${p}' is not an RFC 6901 pointer — '~' escapes only as ~0 ('~') or ~1 ('/')`);
    }
    out.push(raw.replace(/~1/g, "/").replace(/~0/g, "~"));
  }
  return out;
}

/** Normalize a path argument to segments. Arrays pass through (numbers become
 *  the string keys JS indexing already treats them as); a string must be a
 *  pointer. Any other string — the retired dot-string form included — is a
 *  pointed refusal naming both living spellings. */
function toSegs(path: string | readonly (string | number)[]): string[] {
  if (typeof path !== "string") return path.map(String);
  if (path.startsWith("/")) return parsePointer(path);
  if (path === "") return []; // the whole dataset — each verb refuses it with its own message
  throw new DeclareError(
    `'${path}' — paths are segments (["${path.split(".").join('", "')}"]) or an RFC 6901 pointer ("/${path.split(".").join("/")}"); the dot-string form retired with Pointer writes (data-paths.md §11)`
  );
}

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

  /** The optional data shape (B4, language §9): parsed ShapeField
   *  declarations, or null. Presence is the only switch — arrival validates
   *  against it, the compiler checks `:path`s against it, and its declared
   *  identity field keys records (D6 ladder rung 1). */
  declare schema: readonly ShapeField[] | null;

  private readonly cursors = new Map<string, Cursor>();

  /** The interned cursor for `path` — one object per distinct place, so a
   *  re-derived cursor is `===` the old one and the equality gate holds.
   *  The intern key joins on NUL, not "." — a key containing a dot must not
   *  collide with the path that spells it as two segments. */
  cursorAt(path: readonly string[]): Cursor {
    const key = path.join("\u0000");
    let c = this.cursors.get(key);
    if (c === undefined) this.cursors.set(key, (c = { data: this, path: [...path] }));
    return c;
  }

  /** Tracked read of the region at `path` (root-relative). Registers exactly
   *  one region cell — the deepest slot the walk reaches (see the header) —
   *  plus the `value` attribute read the first line makes. `undefined` means
   *  unresolved (a missing region); consumers surface it as null. Takes the
   *  path currency: segments, or an RFC 6901 pointer string. */
  read(path: string | readonly (string | number)[]): unknown {
    let cur: unknown = this.value; // tracked: whole-value replacement wakes every reader
    let container: object | null = null;
    let key = "";
    for (const seg of toSegs(path)) {
      if (!isContainer(cur)) { cur = undefined; break; }
      container = cur;
      key = seg;
      cur = getOwn(cur, seg);
    }
    if (isTracking() && container !== null) cellAt(container, key).track();
    return cur;
  }

  // ── The mutation API — THE structural-mutation authoring surface (D7,
  //    ratified 2026-07-30 with data-paths.md §11: handler-called dataset
  //    methods plus `<->` for leaf edits close language §13's open design).
  //    Paths are the currency above: segments (documented) or an RFC 6901
  //    pointer (interop); leaf writes address the slot, structural verbs
  //    address the ARRAY and take indices as arguments (the §11.2 ruling —
  //    a structural edit is an operation on the array, which is literally
  //    the wake model below). ────────────────────────────────────────────

  /** Set the field at `path`. The path's containers must exist (a pointed
   *  error names the first missing step); the final field may be new.
   *  Against an array, the final token `-` (RFC 6901's after-last) APPENDS —
   *  `set("/rows/-", v)` / `set(["rows", "-"], v)`; against an object, "-"
   *  is just the key "-". Equality-gated: writing the value already there
   *  wakes nothing. */
  set(path: string | readonly (string | number)[], v: unknown): void {
    const segs = this.segs(path);
    const { chain, container, key: at } = this.locate(segs);
    // `/-` append: resolve to the real index so the tag, the wake, and the
    // write all speak the element's actual location.
    const key = at === "-" && Array.isArray(container) ? String(container.length) : at;
    if (key !== at) { segs[segs.length - 1] = key; chain[chain.length - 1] = [container, key]; }
    const old = getOwn(container, key);
    if (old === v) return;
    (container as Record<string, unknown>)[key] = v;
    tagTree(this, v, segs);
    this.wakeChain(chain);
    if (key !== at) wakeAll(container); // an append is structural: length/order readers wake
    wakeTree(old);
  }

  /** Insert `v` at `index` of the array at `path`. */
  insert(path: string | readonly (string | number)[], index: number, v: unknown): void {
    const { arr, chain, segs } = this.array(path);
    arr.splice(index, 0, v);
    tagTree(this, v, [...segs, String(index)]);
    wakeAll(arr);
    this.wakeChain(chain);
  }

  /** Remove (and return) the element at `index` of the array at `path`. */
  removeAt(path: string | readonly (string | number)[], index: number): unknown {
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
  move(path: string | readonly (string | number)[], from: number, to: number): void {
    if (from === to) return;
    const { arr, chain } = this.array(path);
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    wakeAll(arr);
    this.wakeChain(chain);
  }

  private segs(path: string | readonly (string | number)[]): string[] {
    const segs = toSegs(path);
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
        const at = i === 0 ? "the dataset has no value" : `'${showPath(segs.slice(0, i))}' is ${cur === undefined ? "missing" : "not a container"}`;
        throw new DeclareError(`'${showPath(segs)}' addresses nothing — ${at}`);
      }
      chain.push([cur, segs[i]]);
      if (i === segs.length - 1) return { chain, container: cur, key: segs[i] };
      cur = getOwn(cur, segs[i]);
    }
  }

  private array(path: string | readonly (string | number)[]): { arr: unknown[]; chain: [object, string][]; segs: string[] } {
    const segs = this.segs(path);
    const { chain, container, key } = this.locate(segs);
    const arr = getOwn(container, key);
    if (!Array.isArray(arr)) {
      throw new DeclareError(`'${showPath(segs)}' is not an array — structural edits need one`);
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
  schema: { def: null },
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
type Transport = (url: string, init?: RequestInit) => Promise<Response>;
let transport: Transport = (url, init) => globalThis.fetch(url, init);

/** A refusal's body, made readable. JSON is the common shape (RFC 7807 and
 *  every hand-rolled `{ "error": … }`), so it is parsed when it parses —
 *  otherwise the raw text is handed back untouched rather than swallowed. An
 *  empty body is null: nothing was said, and "" would read as if it had been. */
function parseProblem(raw: string): unknown {
  if (raw === "") return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

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
  /** The HTTP method — "GET" (the default) or a body-carrying verb. A non-GET
   *  request sends `body`, so a Declare app can POST to a real REST API without
   *  a backend-for-frontend shim (field report A9). */
  declare method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** The request payload for a non-GET `method`: an object or array is
   *  JSON-encoded (with a JSON `Content-Type`); a string is sent verbatim (the
   *  caller's own encoding); null = no body. Ignored for a GET. */
  declare body: unknown;
  /** How the browser handles cookies, TLS client certificates and HTTP auth
   *  headers on this request — the Fetch API's three modes, as tokens:
   *    `sameOrigin` — the default; send only when `url` shares the page's origin
   *    `include`    — send cross-origin too, so the app can carry a session
   *                   cookie/header/cert to a separately-hosted authenticated
   *                   API. Takes effect only if that origin's CORS response
   *                   allows credentials explicitly.
   *    `omit`       — never send credentials
   *  `sameOrigin` is the camelCase spelling of the wire's `same-origin` (a
   *  hyphen is subtraction, so it cannot be a token); FETCH_CREDENTIALS maps it
   *  back, as `blend` does for CSS's color-dodge. */
  declare credentials: "omit" | "sameOrigin" | "include";
  /** The lifecycle, as one fact; the four doc-named booleans derive below. */
  declare status: "idle" | "loading" | "loaded" | "failed";
  declare error: string | null;
  /** What the server ANSWERED, kept apart from whether it worked. `statusCode`
   *  is the HTTP status (0 before a reply, or when the request never reached
   *  one); `errorBody` is the refusal's payload — parsed when it is JSON, the
   *  raw text otherwise. `error` stays the one-line message, `value` stays the
   *  success value: a failed fetch never writes `value`, so a retry-vs-report
   *  decision can read the code without any of the three fighting. */
  declare statusCode: number;
  declare errorBody: unknown;

  // Tracked reads of `status`, so a constraint on `.loaded` wakes exactly
  // when the lifecycle moves (all four share the one status cell — they are
  // four views of one fact and can never disagree).
  get idle(): boolean { return this.status === "idle"; }
  get loading(): boolean { return this.status === "loading"; }
  get loaded(): boolean { return this.status === "loaded"; }
  get failed(): boolean { return this.status === "failed"; }

  /** `auto = true`: fetch whenever a NON-EMPTY url arrives or changes — the
   *  reactive-address case, where the url derives from late-landing state
   *  (`url = { app.env.program ? … : "" }`) and no handler exists to call
   *  fetch() at the right moment. Push-driven off the url/auto slots; a
   *  re-derive to the SAME address never refetches. Resolves the recorded
   *  auto-fetch question: explicit fetch() stays the default, auto is opt-in. */
  declare auto: boolean;
  private autoUrl = "";

  maybeAuto(): void {
    if (!this.auto) return;
    if (this.url === "") {
      // Going empty RESETS the memo: the contract is "fetch whenever a
      // non-empty url arrives or changes", and A → "" → A is an arrival.
      // Keeping the memo across the empty state made the second visit to a
      // screen show the first visit's data — silently, on the most ordinary
      // navigation shape there is.
      this.autoUrl = "";
      return;
    }
    if (this.url === this.autoUrl) return;
    this.autoUrl = this.url;
    void this.fetch();
  }

  /** Discards a superseded request: only the latest fetch/clear may land
   *  (the Image loader's sequence discipline). */
  private seq = 0;

  /** The fetch init from `method`/`body`/`credentials`. A GET with
   *  `credentials` unset (or "same-origin", its own default) sends neither —
   *  a bare url, unchanged from before `credentials` existed. A non-GET
   *  carries `body`: an object/array is JSON-encoded with a JSON
   *  `Content-Type`; a string is sent verbatim. `credentials` is added
   *  whenever it differs from the fetch-default "same-origin", GET or not,
   *  since it's independent of the verb. */
  private requestInit(): RequestInit | undefined {
    const method = (this.method || "GET").toUpperCase();
    const init: RequestInit = {};
    if (method !== "GET") {
      init.method = method;
      const body = this.body;
      if (body != null) {
        if (typeof body === "string") init.body = body;
        else { init.body = JSON.stringify(body); init.headers = { "Content-Type": "application/json" }; }
      }
    }
    if (this.credentials && this.credentials !== "sameOrigin") init.credentials = FETCH_CREDENTIALS[this.credentials];
    return Object.keys(init).length > 0 ? init : undefined;
  }

  /** Fetch `url` over HTTP. Explicit by design — the weather app's entry screen
   *  decides when (`doEnterDown() { weatherData.fetch() }`); `auto = true` is the
   *  opt-in for reactive addresses (above). A non-GET `method` sends `body`. */
  async fetch(): Promise<void> {
    const seq = ++this.seq;
    // Settle FIRST (P1-2, field report 2026-08-05, three independent runs):
    // constraint settle is a microtask, and a handler that writes a slot this
    // source's `url`/`body` derives from and then calls fetch() in the same
    // breath would otherwise read the OLD address — the wrong resource loads,
    // silently. One synchronous settle makes "set, then fetch" mean what it
    // says; idempotent when nothing is pending.
    settle();
    // The address is read ONCE and carried: `url` is a slot like any other, so a
    // constraint may re-settle it while this request is in flight, and a message
    // that re-read `this.url` after the await named an address that was never
    // requested — the failure reports a different server than it talked to.
    const url = this.url;
    setBound(this, "status", "loading");
    setBound(this, "error", null);
    setBound(this, "statusCode", 0);
    setBound(this, "errorBody", null);
    try {
      const res = await transport(url, this.requestInit());
      if (seq === this.seq) setBound(this, "statusCode", res.status);
      if (!res.ok) {
        // The BODY of a refusal is the part that says why — the field that
        // failed, the rate-limit reset, the validation list. Throwing on the
        // status line alone discarded it, leaving `.error` with a number and
        // the author with nothing to act on. Read it before raising.
        // Reading the body is best-effort: it may be absent, already consumed,
        // or truncated mid-flight, and none of that may be allowed to replace
        // the real failure — an unreadable body must still report `HTTP 404`,
        // never `res.text is not a function`.
        let raw = "";
        try { raw = typeof res.text === "function" ? await res.text() : ""; } catch { raw = ""; }
        if (seq === this.seq) setBound(this, "errorBody", parseProblem(raw));
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      const value: unknown = this.format === "text" ? await res.text() : await res.json();
      if (seq !== this.seq) return; // superseded
      // Validate on receipt (B4, language §9): malformed data lands in
      // `.failed`/`.error` with the pointed path — never `undefined` three
      // layers into a binding. Schema presence is the only switch.
      if (this.schema !== null && this.format === "json") {
        const err = validateShape(value, this.schema);
        if (err !== null) throw new Error(`the response does not match the schema — ${err}`);
      }
      setBound(this, "value", value);
      setBound(this, "status", "loaded");
      // the arrival EVENT (`onLoad`), after value+status settle: the hook for
      // work a constraint must not do — publish, chain a dependent fetch. The
      // status booleans stay the constraint-facing surface.
      const h = (this as unknown as Record<string, unknown>)["onLoad"];
      if (typeof h === "function") h.call(this);
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
    setBound(this, "statusCode", 0);
    setBound(this, "errorBody", null);
    setBound(this, "status", "idle");
  }
}

defineAttributes(DataSource, {
  // both pushes route through maybeAuto, so `auto = true` + a url that lands
  // later (or the reverse order) fetches exactly once per distinct address
  url: { def: "", push: (d, _v) => (d as DataSource).maybeAuto() },
  auto: { def: false, push: (d, _v) => (d as DataSource).maybeAuto() },
  format: { def: "json" },
  method: { def: "GET" },
  body: { def: null },
  status: { def: "idle" },
  error: { def: null },
  // 0 = no reply yet (or none ever arrived) — distinct from every real HTTP
  // code, so a constraint can tell "not asked" from "asked and refused".
  statusCode: { def: 0 },
  errorBody: { def: null },
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
    case "dataschema":
      return def; // a shape is declaration surface, never a data read
    case "enum":
      return typeof v === "string" && type.tokens.includes(v) ? v : def;
    // the records door: a data-borne array/record binds as itself
    case "array":
      return Array.isArray(v) ? v : def;
    case "object":
      return typeof v === "object" ? v : def;
    case "view":
      return def; // a View reference never arrives from data
    case "cursor":
    case "component":
    case "fn":
    case "record":
    case "stroke":
    case "shadow":
    case "backdrop":
    case "motion":
    case "styles":
    case "stylesheet":
    case "font":
    case "slotref":
      return def; // never data-bound in a useful form; total for safety
  }
}
