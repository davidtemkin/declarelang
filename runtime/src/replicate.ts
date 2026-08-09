// Replication (language §9): "a node whose path matches many records
// produces one instance per record — replication is the ARTIFACT of the
// match resolving to many, not an imperative loop." A child element with
// `datapath = :items[]` is a template; the parent carries a Replicator — a
// standing computation on the R4 core whose inputs are the inherited cursor
// chain and the matched array region, and whose output is the reconciled set
// of child instances, in DATA ORDER (child order is semantic — the ruled
// exception — and replicated children take their data's order).
//
// Reconciliation is by item IDENTITY (===), first-fit for duplicates: the
// instance bound to a record follows that record. An insert makes exactly
// one new instance; a removal discards exactly one (its whole standing
// machinery retired via View.discard); a pure reorder MOVES live subtrees —
// no instance is rebuilt, no lifecycle re-fires, no item REGION cell wakes
// (cells are identity-anchored, data.ts). What a move does cost: each moved
// instance's cursor re-points (a different interned place), waking its
// `:path` reads once — they read the same record and the equality gate
// stops everything downstream (no push, no paint work). Unmoved instances'
// cursors intern to the same object and don't even do that.
// LZX's LzReplicationManager pooled clones by POSITION and re-bound their
// data — read for intent (the pool idea survives as instance reuse); the
// positional re-binding is what identity matching sheds: instance state
// stays with its record.
//
// Instances are full citizens: the whole construct pipeline runs per
// instance (methods, literals, bindings, classroot = the template's use-site
// scope, onInit — fired once, after the instance is linked and attached), so
// a replicated WeatherSummary behaves exactly like a written one.
//
// The block occupies the template's slot among its siblings: instances
// splice in at the position where the element was written. `prev` anchors it
// — the sibling Node constructed just before the template, or the previous
// Replicator when two blocks are adjacent (its last instance is the anchor,
// recursively, so empty blocks cost nothing).
//
// One reconcile per settle wave, one frame per mutation burst: the
// Replicator is an ordinary Constraint, so N data edits in a turn coalesce
// into one reconcile, whose Surface work lands in the backends' single rAF.

import type { Element } from "./parser.js";
import { Node } from "./node.js";
import { View, inheritedCursor, onDiscard, markWindowedBlock, markEvicting, fireRetireTree, fireInitTree } from "./view.js";
import { Constraint, Cell } from "./reactive.js";
import { setBound, bindDerived, isSet, ownerOf, armDivergence, nodeDiverged } from "./attributes.js";
import { splitPath, isSelective, type PathSeg } from "./datapath.js";
import { Focus } from "./focus.js";
import { arriveSubtree } from "./spring.js";
import { selectNodes, type PathNode } from "./select.js";
import type { Dataset } from "./data.js";
import type { Surface } from "./backend.js";

/** What the Replicator needs from instantiate.ts (which imports this module;
 *  the interface keeps the dependency one-way): construct one instance of
 *  the template — tree only — and hand back `finish` (installs bindings,
 *  fires init once linked and attached) and `suppressInit` (pre-marks the
 *  subtree inited — the membership-anchored lifecycle, D5). */
export interface Materialize {
  (template: Element, classroot: View): { view: View; finish: () => void; suppressInit: () => void };
}

/** The virtualization policy — `virtualize` on the replicated element. A
 *  BOOLEAN (default false: full materialization), or a thunk when the author
 *  wrote a `{ }` constraint, called inside the match so its reads are tracked
 *  and the block engages or disengages when the answer changes.
 *
 *  It was an enum — `all | auto | window | <count>` — until 2026-08-02. The
 *  three-plus values existed to carry `auto`, a threshold on the RECORD COUNT
 *  (64, tuned on one interaction). Measurement retired it: a windowed block
 *  costs a flat ~0.03–0.09 ms per scroll tick regardless of N — 0.5% of a
 *  frame — so there is no performance cliff for a threshold to guard. What
 *  full materialization actually costs is O(N) CONSTRUCTION, up front, and
 *  that is N × per-instance cost, which varies ~100× between a bare row and a
 *  rich one. A record count cannot see the variable that matters, so `auto`
 *  was answering a question it could not answer, and `<count>` was `auto` with
 *  the number made honest — leaving nothing for either to do. The choice that
 *  remains is semantic, and the author is the one who can make it: full
 *  materialization keeps `childViews` answerable and browser find-in-page over
 *  every record; virtualizing bounds construction.
 *
 *  NAMING (2026-08-02, superseding the 07-30 ruling's spelling). The slot was
 *  ruled as `windowed`, renamed the same day to `materialize` to clear the
 *  word for Window-the-component. Both options named the thing from the
 *  RUNTIME's side — which is right for the mechanism and wrong for a knob.
 *  `virtualize` is the word an author arrives with, and a knob should be
 *  spelled in its audience's vocabulary even when the mechanism is not:
 *  the concept stays MATERIALIZATION (this file, materialization.md, the
 *  kernel's `materializationInfo`), because that is the honest description of
 *  what the runtime does; the authored slot is `virtualize`, because that is
 *  the decision the author is making. §1's doctrine is untouched — a matched
 *  record HAS an instance either way; the policy only governs construction. */
export type VirtualizePolicy = boolean | (() => boolean);

const DEFAULT_UNIT = 24;     // pre-measurement row-extent estimate (corrected by the first real row)
const BUFFER_ROWS = 5;       // rows materialized beyond each viewport edge (reconcile-latency hiding)

// ── EXTENT COMPRESSION (the 2²⁵ layout ceiling) ──────────────────────────────
// Browsers saturate element layout at ~2²⁵ px, and they do it SILENTLY: past
// the ceiling a strut stops growing and an absolutely-positioned row stops
// moving. Both halves bite a windowed block — the scroll range would clamp
// (1M × 44px rows reaches 76% of itself) and the rows past the cap would pile
// at one y. Measured 2026-08-02: Chrome clamps `scrollHeight` at 33,554,428
// and `top` at 33,554,432; Firefox's ceiling is lower still (~17.9M).
//
// So the block keeps TWO coordinate spaces once its content outgrows the cap:
// LOGICAL (the ledger's — real row extents, what the app and the AT reason in)
// and PHYSICAL (what the browser is told). The scroll range is compressed into
// the physical space and mapped back; rows are placed relative to the physical
// viewport so their own coordinates never leave it. Rows keep their REAL size
// — only the scroll range is scaled, never a row.
//
// CAP is 2²⁴, comfortably under every engine's ceiling including Firefox's.
// The mapping is proportional, which costs scroll GRANULARITY: one physical
// pixel becomes `scale` logical pixels. That stays sub-row until scale exceeds
// a row's height — ~16M rows at 44px, far past anything this is for. If a
// collection ever needs finer control than that, the answer is the
// anchor-plus-offset scheme (keep deltas 1:1, map only absolute positions),
// not a bigger cap.
const EXTENT_CAP = 16_777_216; // 2²⁴

/** The physical extent to publish for a logical one — identity below the cap. */
const physicalExtent = (logical: number): number => Math.min(logical, EXTENT_CAP);

/** Logical-per-physical scroll ratio for a block of `logical` extent in a
 *  `viewH` viewport. Exactly 1 whenever the content fits under the cap, so
 *  every expression below reduces to its pre-compression form and an
 *  uncompressed block is bit-for-bit unaffected. */
function extentScale(logical: number, viewH: number): number {
  if (logical <= EXTENT_CAP) return 1;
  const logicalRange = logical - viewH;
  const physicalRange = EXTENT_CAP - viewH;
  return physicalRange > 0 ? logicalRange / physicalRange : 1;
}

// parent view → its replication blocks: the KERNEL WINDOW API's registry
// (D5: the live window — realized instances + logical positions — is
// first-class runtime/library API; the app-language childViews read refuses
// instead, view.ts).
const BLOCKS = new WeakMap<View, Replicator[]>();

/** The replication blocks under `view` — the kernel door for layout
 *  strategies, AT traversal, the inspector, and navigate-to-record. */
export function blocksOf(view: View): readonly Replicator[] {
  return BLOCKS.get(view) ?? [];
}

/** The inspector's diagnostic payload (materialization.md §3.6 — the trust
 *  requirement): is it windowed, the logical and materialized counts, the
 *  retained set, and whether extent is measured or predicted. */
export function materializationInfo(view: View): MaterializationDiag | null {
  const b = BLOCKS.get(view)?.[0];
  return b === undefined ? null : b.info();
}

export interface MaterializationDiag {
  windowed: boolean;
  logical: number;
  materialized: number;
  retained: number;
  unit: number;
  extent: "measured" | "predicted" | null;
  fallback: string | null;
  /** Which identity rule keys these records (the revised ladder): the
   *  explicit `key =`, the inferred `id` convention, or object identity —
   *  with the structural fallback beneath the keyless modes. */
  identity: "key" | "id" | "object";
}

interface Match {
  data: Dataset | null;
  /** The nodes to MATERIALIZE — value + real location (select.ts): the whole
   *  match in full mode, the window slice (+ buffer) in windowed mode; a
   *  selective `:rows[2:8][]` yields the selected elements at their TRUE
   *  indices, so each instance's cursor points at the record's actual place. */
  nodes: readonly PathNode[];
  /** The LOGICAL membership values (the full array in windowed mode — what
   *  membership-anchored init and retained-index bookkeeping read). */
  items: readonly unknown[];
  /** The array region's path (windowed bookkeeping: retained cursors). */
  arrayPath: readonly string[] | null;
  logical: number;
  start: number;   // first materialized logical index (0 in full mode)
  unit: number;    // per-row extent in use (0 in full mode)
  windowed: boolean;
  /** Did the logical membership change shape since the last match (array
   *  identity or length) — as opposed to a scroll-driven window move? The
   *  O(N) bookkeeping passes run only when this is true. */
  dataChanged: boolean;
  /** The y where the block STARTS inside its parent — the bottom of the
   *  preceding sibling (a grid's header) plus one gap; 0 with no leader. */
  leading: number;
}

/** THE EXTENT LEDGER (variable-height windowing — the measured ladder the
 *  B5 record deferred, forced by the Tracker's criterion 1): per-row
 *  extents as an ESTIMATE baseline plus a Fenwick tree of corrections for
 *  rows whose real height has been measured. offset(i) and indexAt(y) are
 *  O(log n); a uniform collection never populates corrections and degrades
 *  to exactly the old i×unit math. Heights are remembered by MEMBER
 *  IDENTITY (indices shift under insert/remove), and the index-keyed tree
 *  rebuilds on data change — O(n) beside the bookkeeping the reconciler
 *  already does there; scroll frames never rebuild. */
class ExtentLedger {
  est = 0;                                  // the per-row estimate (includes the gap)
  private estMeasured = false;              // has est ever come from real rows?
  private n = 0;
  private fen: Float64Array | null = null;  // Fenwick over (h_i − est); 1-based
  private fenTotal = 0;
  private readonly known = new Map<unknown, number>(); // member id → measured h
  private knownSum = 0;                     // Σ known — shouldRebaseline is per-match, keep it O(1)

  /** Remember a measured height (by identity). Returns the CHANGE at that
   *  index (0 when already current) so callers can anchor-compensate. */
  measure(index: number, id: unknown, h: number): number {
    const prev = this.known.get(id);
    if (prev === h) return 0;
    this.known.set(id, h);
    this.knownSum += h - (prev ?? 0);
    const before = prev ?? this.est;
    this.update(index, h - before);
    return h - before;
  }

  measuredCount(): number { return this.known.size; }

  /** Has the measured mean drifted far enough from the estimate that the
   *  unmeasured majority is being mis-sized? (Checked per match; a rebuild
   *  is O(n) and happens only when this fires or membership changes.) */
  shouldRebaseline(): boolean {
    if (this.known.size === 0) return false;
    // a GUESSED estimate (never measured) yields to the first real rows
    // unconditionally; a measured one re-baselines only on real drift
    if (!this.estMeasured) return true;
    const mean = this.knownSum / this.known.size;
    return Math.abs(mean - this.est) > Math.max(1, this.est * 0.2);
  }

  /** Rebuild the index-keyed corrections for a NEW membership (data change).
   *  `est` re-baselines to the measured mean when it has drifted. */
  rebuild(ids: readonly unknown[], fallbackEst: number): void {
    this.n = ids.length;
    if (this.known.size > 0) {
      const mean = this.knownSum / this.known.size;
      if (!this.estMeasured || Math.abs(mean - this.est) > this.est * 0.2) this.est = mean;
      this.estMeasured = true;
    }
    if (this.est === 0) this.est = fallbackEst;
    this.fen = null;
    this.fenTotal = 0;
    for (let i = 0; i < ids.length; i++) {
      const h = this.known.get(ids[i]);
      if (h !== undefined && h !== this.est) this.update(i, h - this.est);
    }
  }

  private update(index: number, delta: number): void {
    if (delta === 0 || index < 0 || index >= this.n) return;
    if (this.fen === null) this.fen = new Float64Array(this.n + 1);
    for (let i = index + 1; i <= this.n; i += i & -i) this.fen[i] += delta;
    this.fenTotal += delta;
  }

  /** Sum of corrections for rows [0, index). */
  private prefix(index: number): number {
    if (this.fen === null) return 0;
    let s = 0;
    for (let i = Math.min(index, this.n); i > 0; i -= i & -i) s += this.fen[i];
    return s;
  }

  /** The top of row `index`, block-local (no leading). */
  offset(index: number): number {
    return index * this.est + this.prefix(index);
  }

  /** One row's span (measured, else the estimate) — the incremental
   *  placement walk's step, O(1). */
  span(id: unknown): number {
    return this.known.get(id) ?? this.est;
  }

  /** Total extent of all n rows. */
  total(): number {
    return this.n * this.est + this.fenTotal;
  }

  /** The row whose span contains block-local `y` (clamped). O(log n): a
   *  Fenwick walk over est·i + corrections, exact because spans are
   *  positive. Uniform fast path: plain division. */
  indexAt(y: number): number {
    if (this.n === 0) return 0;
    if (this.fen === null) {
      return Math.max(0, Math.min(this.n - 1, Math.floor(y / this.est)));
    }
    // binary search over offset(i) ≤ y (offsets strictly increase)
    let lo = 0;
    let hi = this.n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.offset(mid) <= y) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
}

export class Replicator {
  private views: View[] = [];
  private items: unknown[] = [];
  /** Every child this block currently owns: the window instances plus the
   *  RETAINED (touched, off-window) instances — what linking and discard
   *  operate over. Equal to `views` when nothing is retained. */
  private allViews: View[] = [];
  /** Touched instances kept alive off-window (keep-alive, D5): member
   *  identity → instance. Bounded by rows a human actually touched. */
  private readonly retained = new Map<unknown, View>();
  /** PARKED spares (recycling's idle pool): clean instances the window no
   *  longer needs, kept hidden instead of discarded so the next growth —
   *  an oscillating overscan lead, a direction flip, a viewport resize —
   *  re-points an existing row instead of constructing one (the thumb-drag
   *  bench's spikes were exactly these discard-then-rebuild bursts). */
  private readonly spares: View[] = [];
  /** Member identities whose init has fired — the membership-anchored
   *  lifecycle (D5): an identity in this set never refires onInit while its
   *  membership lasts; intersected with the live membership on data change,
   *  so leave-and-return is a NEW membership and fires again. */
  private readonly inited = new Set<unknown>();
  private unit = 0;                       // measured row extent (0 = none yet)
  private measuredUnit = false;
  private windowedActive = false;
  private fallback: string | null = null; // why windowing disengaged (diagnostic)
  private winStart = 0;
  private logical = 0;
  private positioned = false;             // we own instance y's (windowed placement)
  // Extent compression (the 2²⁵ ceiling): the live logical↔physical ratio and
  // the physical scroll offset into this block, both published by the match so
  // placement can re-base against them. `scale === 1` is the uncompressed case
  // and every consumer reduces to its old form there.
  private scale = 1;
  private pRel = 0;
  private relLogical = 0;
  private heightOwner: Constraint | null = null; // the parent-extent derive
  private lastLeading = 0;                // the block-start offset (see Match.leading)
  private lastRel: number | null = null;  // last window offset — the overscan's velocity probe
  private readonly ledger = new ExtentLedger();
  private rowGap = 0;
  /** The membership signature the ledger was last rebuilt for. */
  private ledgerShape: unknown[] | null = null;
  /** The viewport-stability anchor: the first in-view member and where its
   *  top sat relative to the scroll, captured each match — a data change
   *  that moves it (a prepend, a measured correction above) compensates the
   *  scroll so the user's view holds still (Tracker criterion 2). */
  private anchorId: unknown = undefined;
  private anchorDelta = 0;
  private lastArr: unknown = null;        // membership-change detection
  private lastLen = -1;
  /** Wakes the match when the FIRST instances exist to measure — the
   *  estimate-then-correct loop's trigger (a plain cell; reconcile pings it
   *  after creating rows while the unit is still predicted). */
  private readonly measureCell = new Cell();
  private indexCache: Map<unknown, number> | null = null; // identity → logical index (retained bookkeeping)
  private readonly template: Element;
  private readonly constraint: Constraint;

  /** The record field that identifies an instance across re-derivations
   *  (`key = :field`), split into segments — or null to reconcile by object
   *  identity (===), the default. A derived collection produces FRESH record
   *  objects every recompute, so identity would rebuild all of them; a key
   *  pools by a stable field, so only genuinely changed records rebuild. */
  private readonly keyPath: readonly string[] | null;


  constructor(
    private readonly parent: View,
    element: Element,
    private readonly path: string,
    private readonly classroot: View,
    private readonly make: Materialize,
    /** The block's position anchor: the sibling just before it — a Node, a
     *  preceding Replicator (possibly empty), or null at the front. */
    private readonly prev: Node | Replicator | null,
    key: string | null = null,
    /** The pre-parsed plan when the path used selectors (B3) — null means
     *  `splitPath(path)` is the plan (pure names, today's fast path). */
    private readonly plan: readonly PathSeg[] | null = null,
    /** The virtualization policy (`virtualize = …`; D5). */
    private readonly policy: VirtualizePolicy = false
  ) {
    this.keyPath = key === null ? null : splitPath(key);
    // The instances' element is the template MINUS its many-path attribute
    // (each instance gets its record's cursor instead, written by reconcile)
    // and its replication-metadata attributes (`key`, `windowed`), consumed
    // here.
    this.template = {
      ...element,
      attrs: element.attrs.filter(
        (a) =>
          !(a.name === "datapath" && a.value.kind === "path" && a.value.many) &&
          !(a.name === "key" && a.value.kind === "path") &&
          a.name !== "virtualize"
      ),
    };
    this.constraint = new Constraint(
      `${parent.constructor.name}'s replication (:${path}[])`,
      () => this.match(),
      (m) => this.reconcile(m as Match)
    );
  }

  /** The live policy answer. A literal is itself; a `{ }` constraint is called
   *  — and callers must only do that from inside match(), so the read lands in
   *  the Constraint's dependency set. A throwing expression is NOT caught: every
   *  other `{ }` in the language propagates, and swallowing this one would make
   *  a broken policy look like a deliberate `false`. */
  private wantsVirtual(): boolean {
    return typeof this.policy === "function" ? !!this.policy() : this.policy;
  }

  /** First run (instantiate pass two — the tree is linked) + retire with the
   *  parent, so a discarded subtree's replicators can never wake again. */
  arm(): void {
    const list = BLOCKS.get(this.parent);
    if (list !== undefined) list.push(this);
    else BLOCKS.set(this.parent, [this]);
    onDiscard(this.parent, () => this.constraint.dispose());
    this.constraint.run();
  }

  // ── The kernel window API (D5: the live window is runtime/library
  //    surface — layout, AT, the inspector, navigate-to-record) ───────────

  /** The block's logical member count. */
  logicalCount(): number {
    return this.logical;
  }

  /** The realized instances, each with its LOGICAL index — the live
   *  window under the mechanism's name-of-art, spoken as `realized` so the
   *  API never collides with Window-the-component. */
  realized(): readonly { view: View; index: number }[] {
    const out: { view: View; index: number }[] = [];
    this.views.forEach((view, i) => out.push({ view, index: this.winStart + i }));
    for (const [id, view] of this.retained) {
      const idx = this.indexCache?.get(id);
      if (idx !== undefined) out.push({ view, index: idx });
    }
    return out;
  }

  /** Navigate-to-logical-record (materialization.md §3.5 — required by the
   *  observer boundary): scroll so the record at `index` materializes —
   *  app-level search's landing and the AT-traversal path. Imperative (a
   *  handler's verb), so reads here are untracked by design. */
  navigateTo(index: number): void {
    if (!this.windowedActive) {
      // Fully materialized: the instance exists; use the ordinary path.
      this.views[index]?.scrollIntoView("nearest");
      return;
    }
    const scroller = this.findScroller();
    if (scroller === null) return;
    // The row's place is LOGICAL; scrollY is PHYSICAL, so a compressed block
    // divides through the scale on the way out (identity below the cap).
    const into = this.lastLeading + index * (this.unit > 0 ? this.unit : DEFAULT_UNIT);
    const target = this.offsetTo(scroller) + into / extentScale(this.ledger.total(), scroller.height);
    // Writing the reactive slot is the whole move: the surface pans
    // (scrollY's pusher) and the windowed match — which tracks scrollY —
    // rematerializes the destination in the same settle.
    scroller.scrollY = Math.max(0, target);
  }

  /** The inspector diagnostic (§3.6). */
  info(): MaterializationDiag {
    return {
      windowed: this.windowedActive,
      logical: this.logical,
      materialized: this.views.length,
      retained: this.retained.size,
      unit: this.unit,
      extent: this.windowedActive ? (this.measuredUnit ? "measured" : "predicted") : null,
      fallback: this.fallback,
      identity: this.identityMode(),
    };
  }

  /** The nearest scrolling ancestor (scrolls = y | both), or null. Tracked
   *  when called from match(), plain when called imperatively. */
  private findScroller(): View | null {
    for (let v: unknown = this.parent; v instanceof View; v = v.parent) {
      const ax = v.scrolls;
      if (ax === "y" || ax === "both") return v;
    }
    return null;
  }

  /** This block's y offset within the scroller's CONTENT coordinates: the
   *  sum of `y` from the block's parent up to (excluding) the scroller. */
  private offsetTo(scroller: View): number {
    let off = 0;
    for (let v: unknown = this.parent; v instanceof View && v !== scroller; v = v.parent) off += v.y;
    return off;
  }

  /** The tracked half: the inherited cursor chain + the matched region — and
   *  in windowed mode also the scroll box (scrollY, viewport extent, the
   *  offset chain, the first row's measured height): the windowed match is
   *  the SAME standing computation with more tracked dependencies
   *  (materialization.md §3.1). A non-array (unresolved, or scalar) matches
   *  nothing — zero instances, re-matched the moment the region becomes an
   *  array. A SELECTIVE plan (`:rows[2:8][]`) replicates the selection
   *  itself — windowing over selections is a later increment. */
  private match(): Match {
    const none: Match = { data: null, nodes: [], items: [], arrayPath: null, logical: 0, start: 0, unit: 0, windowed: false, dataChanged: true, leading: 0 };
    const base = inheritedCursor(this.parent);
    if (base === null) return none;
    if (this.plan !== null && isSelective(this.plan)) {
      if (this.wantsVirtual()) this.fallback = "a selective path replicates its selection fully (windowing over selections is a later increment)";
      const nodes = selectNodes(base.data, base.path, this.plan);
      return { data: base.data, nodes, items: nodes.map((n) => n.value), arrayPath: null, logical: nodes.length, start: 0, unit: 0, windowed: false, dataChanged: true, leading: 0 };
    }
    const at = this.plan === null ? splitPath(this.path) : selectNodes(base.data, base.path, this.plan)[0]?.path;
    if (at === undefined) return { ...none, data: base.data };
    const arrayPath = this.plan === null ? [...base.path, ...at] : at;
    const arr = base.data.read(arrayPath);
    if (!Array.isArray(arr)) return { ...none, data: base.data };
    const logical = arr.length;
    const dataChanged = arr !== this.lastArr || logical !== this.lastLen;
    this.lastArr = arr;
    this.lastLen = logical;
    // Reading the policy HERE is what makes `virtualize = { … }` reactive:
    // match() is the Constraint's compute, so the thunk's reads are tracked
    // and a changed answer re-runs this — engaging, or disengaging through
    // the branch that returns rows to their declared placement.
    const wants = this.wantsVirtual();
    const full = (): Match => ({
      data: base.data,
      nodes: arr.map((value, i) => ({ path: [...arrayPath, String(i)], value })),
      items: arr,
      arrayPath,
      logical,
      start: 0,
      unit: 0,
      windowed: false,
      dataChanged,
      leading: 0,
    });
    if (!wants) {
      this.fallback = null;
      return full();
    }
    // Engage checks (§3.2: when the arrangement is not one the runtime can
    // predict, FALL BACK TO FULL MATERIALIZATION rather than degrade
    // semantics). Both reads are tracked — a layout arriving or a scroller
    // appearing re-decides.
    const scroller = this.findScroller();
    if (scroller === null) {
      this.fallback = "no scrolling ancestor (scrolls = y) to window against";
      return full();
    }
    // A VERTICAL stacking layout COMPOSES (the layout-aware window's first
    // case): the pass suspends while windowing owns placement (layout.ts),
    // its spacing folds into the row unit, and any other arrangement falls
    // back to full materialization (never degrade semantics).
    const lay = this.parent.layout as unknown as { axis?: unknown; spacing?: unknown } | null;
    let gap = 0;
    if (lay !== null) {
      if (lay.axis === "y") {
        gap = typeof lay.spacing === "number" ? lay.spacing : 0;
        this.rowGap = gap;
      } else {
        this.fallback = "the block's parent runs a layout windowing cannot predict (a vertical SimpleLayout composes; others fall back) — set virtualize = false or drop the layout";
        return full();
      }
    }
    this.fallback = null;
    // The window: tracked reads of the scroll offset, the viewport extent,
    // the offset chain, and the first materialized row's height (the
    // measured-extent correction — estimate, then correct, the
    // content-visibility precedent).
    let y = scroller.scrollY;
    const viewH = scroller.height;
    const offset = this.offsetTo(scroller);
    this.measureCell.track(); // re-measure as rows materialize (the ladder's ping)
    // TRACK the live window's heights: reconcile's measurement pass is the
    // constraint's APPLY (untracked by design), so without these reads an
    // ANIMATED height — a row springing open into an in-place editor — would
    // never re-drive the ladder and the rows below would sit still. Reading
    // them here makes the estimate-then-correct loop follow motion: height
    // changes re-run match, reconcile re-measures, placement glides.
    for (const v of this.views) void v.height;
    const probe = this.views[0];
    const measured = probe !== undefined ? probe.height + gap : 0;
    if (measured > gap) this.measuredUnit = true;
    const unit = measured > gap ? measured : this.unit > 0 ? this.unit : DEFAULT_UNIT + gap;
    this.unit = unit;
    // The LEDGER (variable extents): rebuilt when the membership changes —
    // identity-keyed heights survive, index corrections re-seat. The
    // rebuild also computes the PREPEND-ANCHOR compensation: if the member
    // the viewport was resting on moved (rows inserted/removed above it, a
    // baseline re-estimate), the scroll shifts by the same amount, so the
    // view never yanks (criterion 2).
    let membershipRebuilt = false;
    if (dataChanged || this.ledgerShape === null || this.ledger.shouldRebaseline()) {
      const ids = dataChanged || this.ledgerShape === null ? arr.map((v) => this.idOf(v)) : this.ledgerShape;
      const oldOffset = this.anchorId !== undefined ? this.anchorFind(this.anchorId) : null;
      this.ledger.rebuild(ids, unit);
      this.ledgerShape = ids;
      membershipRebuilt = dataChanged;
      if (oldOffset !== null) {
        const at = ids.indexOf(this.anchorId);
        if (at >= 0) {
          // The anchor moved by a LOGICAL amount; the scroller travels in
          // PHYSICAL pixels, so a compressed block converts before it nudges.
          // (Uncompressed the scale is 1 and this is the original line.)
          const shift = (this.ledger.offset(at) - oldOffset) / extentScale(this.ledger.total(), scroller.height);
          if (shift !== 0) {
            y = Math.max(0, y + shift);
            setBound(scroller, "scrollY", y);
          }
        }
      }
    }
    if (this.ledger.est === 0) this.ledger.rebuild(arr.map((v) => this.idOf(v)), unit);
    // The block's own start: below the preceding sibling (a header above a
    // windowed grid), tracked so a resizing leader reflows the window.
    const anchor = this.leadingAnchor();
    const leading = anchor !== null ? anchor.y + anchor.height + gap : 0;
    // A membership COLLAPSE can strand the scroll far past the new extent.
    // A real scroller clamps at its box; the kernel's abstract scroll must
    // agree, or headless state (and anything derived from scrollY) lives in
    // NaN-land the browser never shows (criterion 4: position lands sane).
    if (membershipRebuilt) {
      // The clamp is against the PHYSICAL end — what the scroller can actually
      // reach — so a compressed block lands sane instead of parking scrollY
      // out past a range the browser will never honour.
      const end = Math.max(0, offset + leading + physicalExtent(this.ledger.total()) - viewH);
      if (y > end) {
        y = end;
        setBound(scroller, "scrollY", y);
      }
    }
    // PHYSICAL → LOGICAL. `pRel` is how far the real scroller has travelled
    // into this block; `rel` is where that lands in the ledger's coordinates.
    // Below the cap the scale is 1 and the two are the same number.
    const pRel = Math.max(0, y - offset - leading);
    this.scale = extentScale(this.ledger.total(), viewH);
    this.pRel = pRel;
    const rel = this.scale === 1
      ? pRel
      : Math.min(Math.max(0, this.ledger.total() - viewH), pRel * this.scale);
    this.relLogical = rel;
    // VELOCITY-ADAPTIVE OVERSCAN (the momentum-flick answer — the recycler
    // prefetch shape): the compositor scrolls ASYNCHRONOUSLY, painting
    // frames before any JS runs, so a flick can outrun a fixed buffer and
    // expose blank track. The window therefore leads in the DIRECTION of
    // travel by ~3 frames of the observed per-frame delta (decaying to the
    // base buffer at rest), so the compositor finds rows already painted.
    const delta = this.lastRel === null ? 0 : rel - this.lastRel;
    this.lastRel = rel;
    // capped: a momentum flick moves a few rows per frame (lead ≈ 3 frames
    // of that); a scrollbar TELEPORT is one giant delta overscan can't help
    // with (the next frame's window is simply correct) — don't materialize
    // four viewports for it.
    const estRow = this.ledger.est > 0 ? this.ledger.est : unit;
    const deltaRows = Math.ceil(Math.abs(delta) / estRow);
    const viewRows = Math.ceil(viewH / estRow);
    // a TELEPORT (a thumb jump past the whole viewport) gets no lead:
    // prefetch can't help a discontinuity — the next frame's window is
    // simply correct — and a wide window would only make each jump dearer
    const lead = deltaRows > viewRows ? BUFFER_ROWS : Math.min(30, BUFFER_ROWS + 3 * deltaRows);
    const before = delta >= 0 ? BUFFER_ROWS : lead;
    const after = delta >= 0 ? lead : BUFFER_ROWS;
    const firstIdx = this.ledger.indexAt(rel);
    const lastIdx = this.ledger.indexAt(rel + viewH);
    const start = Math.max(0, Math.min(logical, firstIdx - before));
    const count = Math.max(0, Math.min(logical - start, lastIdx - firstIdx + 1 + before + after));
    // capture the viewport-stability anchor: the first fully-in-view member
    this.anchorId = arr.length > 0 ? this.idOf(arr[Math.min(arr.length - 1, firstIdx)]) : undefined;
    this.anchorDelta = rel - this.ledger.offset(Math.min(Math.max(0, arr.length - 1), firstIdx));
    const nodes: PathNode[] = [];
    for (let i = 0; i < count; i++) {
      nodes.push({ path: [...arrayPath, String(start + i)], value: arr[start + i] });
    }
    return { data: base.data, nodes, items: arr, arrayPath, logical, start, unit, windowed: true, dataChanged, leading };
  }

  /** A record's pooling identity, per the REVISED ladder (ruled 2026-07-30,
   *  the invisible version): the explicit `key = :field` override first,
   *  then the INFERRED convention — a record's own scalar `id` field IS its
   *  identity, no declaration anywhere — then the record object itself
   *  (===; the structural-equality fallback catches misses beneath that). */
  private idOf(item: unknown): unknown {
    if (this.keyPath !== null) {
      let cur: unknown = item;
      for (const seg of this.keyPath) {
        if (cur === null || typeof cur !== "object") return undefined;
        cur = (cur as Record<string, unknown>)[seg];
      }
      return cur;
    }
    if (item !== null && typeof item === "object" && !Array.isArray(item) && Object.hasOwn(item, "id")) {
      const v = (item as Record<string, unknown>).id;
      if (v !== null && v !== undefined && typeof v !== "object") return v;
    }
    return item;
  }

  /** The identity mode in force — the inspector's honesty about an invisible
   *  rule (key | id | object; structural fallback applies on misses either
   *  way when keyless). */
  private identityMode(): "key" | "id" | "object" {
    if (this.keyPath !== null) return "key";
    const first = this.items[0];
    if (first !== null && typeof first === "object" && !Array.isArray(first) && Object.hasOwn(first, "id")) return "id";
    return "object";
  }

  private reconcile(m: Match): void {
    const { data, nodes, windowed, dataChanged } = m;
    this.logical = m.logical;
    this.winStart = m.start;
    this.lastLeading = m.leading;
    const items = nodes.map((n) => n.value);

    // Membership bookkeeping runs only on DATA-shaped changes, never on a
    // scroll-driven window move: the identity → index map (retained rows'
    // logical positions) and the membership-init intersection (an identity
    // that LEFT the match starts a fresh membership if it returns).
    const droppedRetained: View[] = [];
    if (dataChanged) {
      this.indexCache = null;
      if (this.retained.size > 0 || this.inited.size > 0) {
        const idx = new Map<unknown, number>();
        m.items.forEach((item, i) => {
          const id = this.idOf(item);
          if (!idx.has(id)) idx.set(id, i);
        });
        this.indexCache = idx;
        for (const id of this.inited) if (!idx.has(id)) this.inited.delete(id);
        for (const [id, view] of this.retained) {
          if (!idx.has(id)) {
            // The retained row's record left the data — its membership ended;
            // the instance goes with it (unlinked and discarded below, with
            // the ordinary removed set).
            this.retained.delete(id);
            droppedRetained.push(view);
          }
        }
      }
    }

    // Match records to existing instances by identity, first-fit in order;
    // the RETAINED (touched, off-window) set is part of the pool — a
    // retained row scrolling back in is the SAME instance returning.
    interface Pooled { item: unknown; view: View; used: boolean }
    const pool = new Map<unknown, Pooled[]>();
    const entries: Pooled[] = [];
    this.items.forEach((item, i) => {
      const e: Pooled = { item, view: this.views[i], used: false };
      entries.push(e);
      const id = this.idOf(item);
      const q = pool.get(id);
      if (q !== undefined) q.push(e);
      else pool.set(id, [e]);
    });
    const take = (q: Pooled[] | undefined): View | undefined => {
      const e = q?.find((p) => !p.used);
      if (e === undefined) return undefined;
      e.used = true;
      return e.view;
    };
    // The STRUCTURAL-EQUALITY fallback (materialization.md §4 move 2 — the
    // key-retirement robustness piece): on a KEYLESS block, an identity miss
    // (a transform-derived collection manufacturing fresh record objects)
    // falls back to matching by CONTENT, so unchanged rows survive a
    // recompute without rebuild. Built lazily — the map exists only when a
    // miss happens, and costs only the miss set. A declared `key` IS the
    // identity, so keyed blocks never consult it.
    let byContent: Map<string, Pooled[]> | null = null;
    const contentMatch = (value: unknown): View | undefined => {
      if (this.keyPath !== null || typeof value !== "object" || value === null) return undefined;
      if (byContent === null) {
        byContent = new Map();
        for (const e of entries) {
          if (e.used || typeof e.item !== "object" || e.item === null) continue;
          const k = safeStringify(e.item);
          if (k === null) continue;
          const q = byContent.get(k);
          if (q !== undefined) q.push(e);
          else byContent.set(k, [e]);
        }
      }
      const k = safeStringify(value);
      return k === null ? undefined : take(byContent.get(k));
    };
    const next: View[] = [];
    const fresh = new Map<View, () => void>();
    const misses: { slot: number; id: unknown }[] = [];
    for (const node of nodes) {
      const id = this.idOf(node.value);
      let v = take(pool.get(id));
      if (v === undefined) {
        const kept = this.retained.get(id);
        if (kept !== undefined) {
          this.retained.delete(id);
          v = kept;
        }
      }
      if (v === undefined) v = contentMatch(node.value);
      if (v !== undefined) {
        next.push(v);
      } else {
        next.push(null as unknown as View);
        misses.push({ slot: next.length - 1, id });
      }
    }
    // RECYCLING (the §5 deferred move, forced by the scrub bench: a fast
    // scrollbar drag was rebuilding ~2,000 DOM nodes — ~70ms/frame): a
    // window shift's LEAVERS re-point at its ARRIVERS instead of a
    // discard+construct round trip. The cursor setBound below re-derives
    // everything downstream; eligibility is exactly eviction-eligibility
    // (still a member, subtree clean — a touched row retains as before, so
    // user state never leaks across records). A recycled instance serving
    // a member whose presence episode is NEW fires that member's init
    // (fireInitTree — the mirror of suppressInit on reconstruction).
    const recycled: View[] = [];
    const recycledNewMember: View[] = [];
    if (windowed && misses.length > 0) {
      const harvest: View[] = [];
      for (const [id, q] of pool) {
        if (harvest.length >= misses.length) break;
        for (const e of q) {
          if (e.used || harvest.length >= misses.length) continue;
          const stillMember = !dataChanged || this.indexCache?.has(id) === true;
          if (stillMember && !subtreeDiverged(e.view) && !focusedWithin(e.view)) {
            e.used = true;
            harvest.push(e.view);
          }
        }
      }
      // ORDER-PRESERVING: the harvest is collected in current-window order and
      // the misses are in slot order, so handing the k-th leaver to the k-th
      // arriver leaves every instance at the child index it already holds. A
      // window that misses ENTIRELY (a dragged scrollbar) is then a pure
      // re-point — the re-link below sees an unchanged set and moves nothing.
      let hAt = 0;
      for (const miss of misses) {
        const r = hAt < harvest.length ? harvest[hAt++] : this.unpark();
        if (r === undefined) break;
        next[miss.slot] = r;
        recycled.push(r);
        if (!this.inited.has(miss.id)) recycledNewMember.push(r);
      }
    }
    for (const miss of misses) {
      if (next[miss.slot] !== null) continue;
      const made = this.make(this.template, this.classroot);
      // The membership-anchored lifecycle (D5): a member whose init
      // already fired gets a silent reconstruction — onInit is once per
      // record-membership, never per physical construct.
      if (this.inited.has(miss.id)) made.suppressInit();
      fresh.set(made.view, made.finish);
      next[miss.slot] = made.view;
    }
    // Leftovers: instances whose record left the WINDOW. A clean instance
    // discards freely (reconstruction is unobservable — §2); a TOUCHED one
    // (the divergence bit, or one still holding cells the user typed into)
    // is retained alive at its logical place (keep-alive, D5).
    const removed: View[] = [...droppedRetained];
    const evictions = new Set<View>();
    for (const [id, q] of pool) {
      for (const e of q) {
        if (e.used) continue;
        const stillMember = windowed && (!dataChanged || this.indexCache?.has(id) === true);
        if (stillMember && (subtreeDiverged(e.view) || focusedWithin(e.view))) {
          this.retained.set(id, e.view);
        } else {
          // A leftover whose record REMAINS a member is a window EVICTION —
          // its presence continues, so no onRetire fires; clean evictions
          // PARK as spares (capped) rather than discarding, so the next
          // window growth re-points instead of constructing.
          if (stillMember) {
            if (windowed && this.spares.length < 60) {
              this.park(e.view);
              continue;
            }
            evictions.add(e.view);
            markEvicting(e.view);
          }
          removed.push(e.view);
        }
      }
    }

    // Departures fire their onRetire NOW — still parented, cursored, and
    // live (the hook's contract); discard's own fire is a no-op after this
    // (once per lifetime). Evictions stay silent.
    for (const v of removed) if (!evictions.has(v)) fireRetireTree(v);
    const retainedViews = [...this.retained.values()];
    const nextAll = [...next, ...retainedViews, ...this.spares];
    const changed =
      fresh.size > 0 || removed.length > 0 ||
      nextAll.length !== this.allViews.length ||
      nextAll.some((v, i) => this.allViews[i] !== v);
    if (changed) {
      // Re-link the block in data order at its slot among the siblings
      // (retained rows ride after the window — placement is absolute in
      // windowed mode, so child order is stacking only).
      for (const v of this.allViews) this.parent.removeChild(v);
      let at = this.start();
      const end = at + nextAll.length;
      for (const v of nextAll) this.parent.insertChild(v, at++);
      for (const v of removed) v.discard();
      // Mirror the order across the seam: walk backwards so each surface
      // lands before its successor's (fresh attach and kept move alike).
      // SKIPPED when windowed recycling only REORDERED an unchanged set:
      // placement is absolute and rows never overlap, so surface order is
      // invisible — and moving ~34 elements per scroll tick was half the
      // scrub bench's remaining frame cost.
      const sameSet = windowed && fresh.size === 0 && removed.length === 0;
      const ps = this.parent.surface;
      if (ps !== null && this.parent.backend !== null && !sameSet) {
        let before = this.surfaceAfter(end);
        for (let i = nextAll.length - 1; i >= 0; i--) {
          const v = nextAll[i];
          if (v.surface === null) v.attach(this.parent.backend, ps, before);
          else ps.insertChild(v.surface, before);
          before = v.surface;
        }
      }
    }
    // Cursors, uniformly: the interned handle equality-gates every instance
    // whose place is unchanged; a moved instance's bindings re-read equal
    // values and the wave dies at the attribute layer's gate.
    next.forEach((v, i) => {
      setBound(v, "datapath", data === null ? null : data.cursorAt(nodes[i].path));
    });
    // Recycled and freshly built instances are presenting a record they were
    // not presenting before: their springs take the arriving target outright
    // instead of sliding from the departed record's geometry (Spring.arrive).
    // Armed, not snapped — the cursor write above invalidates lazily, so the
    // new target is not readable yet.
    for (const v of recycled) arriveSubtree(v);
    for (const v of fresh.keys()) arriveSubtree(v);
    // Retained rows re-point on data change (their logical index may shift).
    if (m.arrayPath !== null && this.retained.size > 0) {
      for (const [id, v] of this.retained) {
        const idx = this.indexCache?.get(id);
        if (idx !== undefined && data !== null) {
          setBound(v, "datapath", data.cursorAt([...m.arrayPath, String(idx)]));
        }
      }
    }

    // WINDOWED PLACEMENT + EXTENT (§3.2, uniform extents v1): the block owns
    // its rows' y and the parent's height while windowing is engaged — the
    // runtime arranging what the runtime materializes.
    if (windowed) {
      // incremental placement: one O(log n) offset for the window's first
      // row, then O(1) spans — the scrub bench's ledger overhead reclaimed.
      //
      // Placement is LOGICAL-relative-to-the-viewport, then re-based into
      // physical space: a row's distance from the top of the viewport is
      // logical (`ledger.offset(i) - rel`), and where the viewport itself sits
      // is physical (`pRel`). Below the cap `pRel === rel` and `base` collapses
      // to `m.leading`, leaving the original `leading + offset(i)` exactly.
      // Above it, rows track the physical viewport instead of running off past
      // 2²⁵ where the browser would stop moving them.
      const base = m.leading + this.pRel - this.relLogical;
      let yy = base + this.ledger.offset(m.start);
      next.forEach((v, i) => {
        setBound(v, "y", yy);
        yy += this.ledger.span(this.idOf(m.items[m.start + i]));
      });
      for (const [id, v] of this.retained) {
        const idx = this.indexCache?.get(id);
        if (idx !== undefined) setBound(v, "y", base + this.ledger.offset(idx));
      }
      this.positioned = true;
      const total = m.leading + this.ledger.total();
      // The block owns the parent's content extent — the same yielding
      // discipline as auto-extent (which it displaces): an author-set or
      // author-bound height is respected and left alone. When the authored
      // parent IS the scroller (rows as direct children of a scrolling
      // Table — its height is the FRAME), the logical extent publishes to
      // the SURFACE instead: the scroll range spans all N logical rows from
      // the first frame, so the scrollbar thumb maps the whole collection
      // (without this the range grew only as rows materialized — the
      // treadmill: dragging the thumb "to the end" landed mid-sequence).
      // What the browser is told is the PHYSICAL extent — capped under the
      // 2²⁵ ceiling. Both publication paths cap: a strut of 44M px and a
      // parent `height` of 44M px saturate identically. Below the cap this is
      // `total` unchanged.
      const published = physicalExtent(total);
      const heightAuthored = isSet(this.parent, "height") || ownerOf(this.parent, "height")?.yielding === false;
      if (heightAuthored) {
        this.heightOwner?.dispose();
        this.heightOwner = null;
        if (this.parent.scrolls !== "none") this.parent.surface?.setVirtualExtent?.(published);
      } else if (this.heightOwner === null) {
        this.totalExtent = published;
        this.heightOwner = bindDerived(this.parent, "height", () => this.totalExtent);
      } else if (this.totalExtent !== published) {
        this.totalExtent = published;
        this.heightOwner.run();
      }
    } else if (this.windowedActive) {
      // Windowing DISENGAGED (policy/data shrink/layout arrival): release
      // the geometry we owned; surviving rows return to declared placement,
      // and the spare pool (windowed-only machinery) drains.
      this.heightOwner?.dispose();
      this.heightOwner = null;
      this.parent.surface?.setVirtualExtent?.(null);
      for (const v of this.spares.splice(0)) { markEvicting(v); this.parent.removeChild(v); v.discard(); }
      if (this.positioned) {
        for (const v of nextAll) setBound(v, "y", 0);
        this.positioned = false;
      }
    }

    // Windowing-aware AT (§2, ruled): logical extent on the container,
    // logical position per materialized row — "row N of 100,000" with only
    // the window existing. Cleared when windowing disengages.
    this.parent.surface?.setRowCount?.(windowed ? m.logical : null);
    next.forEach((v, i) => v.surface?.setRowIndex?.(windowed ? m.start + i + 1 : null));
    if (windowed) {
      for (const [id, v] of this.retained) {
        const idx = this.indexCache?.get(id);
        v.surface?.setRowIndex?.(idx !== undefined ? idx + 1 : null);
      }
    }

    if (this.windowedActive !== windowed) {
      this.windowedActive = windowed;
      markWindowedBlock(this.parent, windowed);
    }

    this.views = next;
    this.items = items;
    this.allViews = nextAll;
    // New instances finish (bindings + init) linked, attached, and cursored;
    // then their init is RECORDED against the membership, and divergence
    // tracking arms (construct-phase writes never count as touch).
    for (const finish of fresh.values()) finish();
    // recycled instances presenting a NEW member fire that member's init on
    // the live subtree (cursored and placed by now), then re-arm divergence
    // exactly like fresh construction (init-handler writes never count).
    for (const v of recycledNewMember) fireInitTree(v);
    for (const node of nodes) {
      const id = this.idOf(node.value);
      if (!this.inited.has(id)) this.inited.add(id);
    }
    for (const view of fresh.keys()) armTree(view);
    for (const view of recycled) armTree(view);
    // The measured ladder: read each window row's REAL extent (text-driven
    // heights settle with their constraints); corrections update the ledger,
    // and a correction ABOVE the viewport's anchor compensates the scroll so
    // the view holds still while estimates converge. Any change re-pings the
    // match (the estimate-then-correct loop, generalized per-row).
    if (windowed && next.length > 0) {
      // A row materialized or re-pointed THIS pass has not resolved its
      // height yet: its constraints (and any spring's arriving target) settle
      // after this reconcile returns, so what it reads right now is the
      // TEMPLATE's default. Recording that would tell the ledger a 356px
      // expanded row is 44px — dropping its correction, shifting every offset
      // below it, and moving the index the viewport maps to (a visible jump of
      // several rows). It is measured on the next pass instead, which the
      // measure ping already schedules; a row whose default happens to be
      // right loses nothing by waiting one frame.
      const justPointed = new Set<View>(recycled);
      for (const v of fresh.keys()) justPointed.add(v);
      let changed2 = false;
      let aboveShift = 0;
      const anchorIdx = this.anchorId !== undefined ? this.indexCache?.get(this.anchorId) : undefined;
      for (let i = 0; i < next.length; i++) {
        const idx = m.start + i;
        if (justPointed.has(next[i])) { changed2 = true; continue; }
        const h = next[i].height + this.rowGap;
        if (h <= this.rowGap) continue;
        const d = this.ledger.measure(idx, this.idOf(m.items[idx]), h);
        if (d !== 0) {
          changed2 = true;
          if (anchorIdx !== undefined && idx < anchorIdx) aboveShift += d;
        }
      }
      if (aboveShift !== 0) {
        const sc = this.findScroller();
        if (sc !== null) setBound(sc, "scrollY", Math.max(0, sc.scrollY + aboveShift));
      }
      if (changed2 || !this.measuredUnit) this.measureCell.changed();
    }
    if (changed) {
      this.parent.childrenMutated(); // one re-arm per burst
      // instances were created or re-pointed THIS pass — match's height
      // tracking only covers the window it last saw, so ping one more run to
      // adopt the newborns: a row materialized by the final reconcile of a
      // burst must still hear an animating height.
      this.measureCell.changed();
    }
  }

  /** The parent-extent the height derive publishes (windowed mode). */
  private totalExtent = 0;

  /** Where the block starts right now: after its anchor. */
  private start(): number {
    const anchor = lastNodeOf(this.prev);
    return anchor === null ? 0 : this.parent.children.indexOf(anchor) + 1;
  }

  /** The last VISIBLE View before the block — the GEOMETRY anchor the
   *  window's leading offset builds on. Distinct from the structural anchor
   *  (`lastNodeOf(this.prev)`): an invisible sibling (a DataGrid Column, a
   *  hidden control) occupies no space — the SimpleLayout rule — so the
   *  walk skips it rather than offsetting below a phantom. */
  /** The anchor member's offset under the CURRENT (pre-rebuild) ledger,
   *  or null when it is no longer known. */
  private anchorFind(id: unknown): number | null {
    const shape = this.ledgerShape;
    if (shape === null) return null;
    const at = shape.indexOf(id);
    return at < 0 ? null : this.ledger.offset(at) - this.anchorDelta + this.anchorDelta;
  }

  /** Hide and shelve a clean evicted instance for reuse. */
  private park(v: View): void {
    setBound(v, "visible", false);
    this.spares.push(v);
  }

  /** Take a spare back into service (visible again; the caller re-points). */
  private unpark(): View | undefined {
    const v = this.spares.pop();
    if (v !== undefined) setBound(v, "visible", true);
    return v;
  }

  private leadingAnchor(): View | null {
    for (let i = this.start() - 1; i >= 0; i--) {
      const sib = this.parent.children[i];
      if (sib instanceof View && sib.visible && sib.ignoreLayout !== true) return sib;
    }
    return null;
  }

  /** The first live surface after the block — the `before` reference the
   *  re-inserted surfaces stack up against (null = the parent's end). */
  private surfaceAfter(index: number): Surface | null {
    for (let i = index; i < this.parent.children.length; i++) {
      const sib = this.parent.children[i];
      if (sib instanceof View && sib.surface !== null) return sib.surface;
    }
    return null;
  }

  /** @internal The block's last instance — the next block's anchor. */
  last(): Node | null {
    return this.allViews.length > 0 ? this.allViews[this.allViews.length - 1] : lastNodeOf(this.prev);
  }
}

function lastNodeOf(prev: Node | Replicator | null): Node | null {
  if (prev === null) return null;
  return prev instanceof Replicator ? prev.last() : prev;
}

/** Does the keyboard focus live inside this instance's subtree? A focused
 *  row is TOUCHED by definition (focus-as-touched — the D5 deferral, forced
 *  the day a recycled select cell dragged the focus ring to an arbitrary
 *  record): it must never be re-pointed, parked, or discarded under the
 *  user's cursor. */
function focusedWithin(root: Node): boolean {
  const f = Focus.getFocus();
  if (f === null) return false;
  for (let n: Node | null = f; n !== null; n = n.parent as Node | null) {
    if (n === root) return true;
  }
  return false;
}

/** Has any node in this instance's subtree received a direct write since it
 *  was armed — the §2 divergence probe (attributes.ts). Walked only at
 *  discard decisions; proportional to one instance's subtree. */
function subtreeDiverged(root: Node): boolean {
  if (nodeDiverged(root)) return true;
  for (const c of (root as { children?: readonly Node[] }).children ?? []) {
    if (subtreeDiverged(c)) return true;
  }
  return false;
}

/** Arm divergence tracking over a finished instance's subtree —
 *  construct-phase writes (literals, bindings, init) never count as touch. */
function armTree(root: Node): void {
  armDivergence(root);
  for (const c of (root as { children?: readonly Node[] }).children ?? []) armTree(c);
}

/** A record's content key for the structural fallback — JSON text, null on
 *  anything JSON can't say (cycles). Key-order-sensitive by design: the safe
 *  side of a miss is a rebuild, which §2 already prices as unobservable. */
function safeStringify(v: unknown): string | null {
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}
