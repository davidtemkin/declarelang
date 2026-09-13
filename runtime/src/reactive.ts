// The reactive core — what a `{ }` constraint *is* at runtime: a standing
// computation whose dependencies are exactly what it read last time it ran,
// and a scheduler that re-runs invalidated computations once per update, in
// batch, before the backends' rAF paint. Percent lengths, Text auto-sizing,
// and draw re-recording all ride this one mechanism; R8's `:path` data will
// too. There is no polling anywhere: an idle graph is inert data.
//
// The LZX LFC expressed this as events + delegates: every attribute owned an
// `onX` event object, constraints were compiler-emitted methods registered
// via delegate lists, and updates fanned out eagerly through method calls
// (LzNode.applyConstraintMethod, LzDelegate). That machinery is read here for
// intent only — the intent (precise, declarative dependency) is kept; the
// delegate/event objects, per-attribute event tables, and eager fan-out are
// the deadweight Declare sheds (APPROACH §2/§6).
//
// Division of labor with the future compiler path (APPROACH §5): the compiler
// will typecheck bodies with tsc and *prewire* static dependencies, replacing
// discovery-by-read for them; invalidation, batching, ordering, and the cycle
// guard — this module — stay. Runtime tracking remains for genuinely dynamic
// reads (language §7 "Cost"), so the seam is exactly: who calls `reads()`.

import { DeclareError } from "./errors.js";

/** The computation currently recording its reads; null almost always —
 *  which is what makes an untracked read one pointer comparison. */
let active: Constraint | null = null;

/** Is a computation currently recording reads? Callers (attributes.ts) check
 *  this before materializing a Cell, so unobserved slots never allocate one. */
export function isTracking(): boolean {
  return active !== null;
}

/** One observable slot's dependency node: just its subscribers. The value
 *  itself lives wherever it lives (a view field); a Cell exists only once
 *  something tracked a read of the slot — pay-per-use by construction. */
export class Cell {
  private readonly subs = new Set<Constraint>();

  /** A STRUCTURAL cell (a Node's child-list — node.ts): waking through one
   *  means the dependency SHAPE may have changed, so a statically-wired
   *  subscriber re-probes its edges on the next run instead of trusting the
   *  fixed set (extentOf over children that did not exist at wire time). */
  structural = false;

  /** Record that the running computation read this slot (no-op untracked). */
  track(): void {
    if (active !== null) {
      this.subs.add(active);
      active.reads(this);
    }
  }

  /** The write half: invalidate every subscriber. Subscribers only get
   *  queued here — re-evaluation is the scheduler's, in batch. */
  changed(): void {
    for (const c of this.subs) c.invalidate(this);
  }

  /** @internal Constraint.run re-tracks from scratch each run. */
  unlink(c: Constraint): void {
    this.subs.delete(c);
  }
}

/** Which flush pass a constraint runs in: values first, then draw
 *  re-records — so a draw body always records against settled attributes. */
export type Phase = 0 | 1;

/** A guard, not a tuning constant: a constraint that re-runs this many times
 *  in one settle can only be reading its own (transitive) output. */
const CYCLE_LIMIT = 100;

/** A standing computation: `compute` runs with read-tracking on, `apply`
 *  lands the result with tracking off (its writes *invalidate* dependents;
 *  they must never register as dependencies). Dependencies are rebuilt from
 *  scratch every run, so they are precise even under conditional reads —
 *  a branch not taken this run is not a dependency this run. */
export class Constraint {
  private deps: Cell[] = [];
  private queued = false;
  private dead = false;
  /** Suspended: inert but alive — dependency edges dropped and waking
   *  refused, so an animator can drive this constraint's slot without it
   *  fighting back, then resume() re-runs it against current state
   *  (animation.md §2 rules 2–4, the supersede/restore kernel service). */
  private suspended = false;
  // Cycle-guard bookkeeping, valid within one settle (stamped by it).
  private stamp = 0;
  private runs = 0;

  /** The body's SOURCE TEXT and position, when this constraint came from a
   *  `{ }` in a program (bind.ts sets them). The Inspector's "why" answer is
   *  this string; null for constraints the runtime builds itself (extent
   *  derives, percent/align bindings) and for live-bound ones typed at
   *  runtime, which are marked separately by `isStatic` being false. */
  source: string | null = null;
  sourcePos: { line: number; col: number } | null = null;
  /** Installed at RUNTIME by the Inspector's evaluate strip rather than compiled
   *  from source — so the UI can say "temporary" honestly instead of implying it
   *  has the same standing as a compiled constraint. */
  live = false;
  /** When this constraint is a LAYOUT's claim on a child's geometry slot, the
   *  layout's own phrase for itself (`app.col's SimpleLayout`) — set by
   *  layout.ts. Message-only: the one-owner guard and the setter read it so a
   *  conflict names the LAYOUT and the resolution, not a bare constraint. */
  arrangedBy: string | null = null;

  constructor(
    /** For error messages: "View.width", "Text.draw", … */
    readonly label: string,
    private readonly compute: () => unknown,
    private readonly apply: (value: unknown) => void,
    readonly phase: Phase = 0,
    /** A yielding constraint is runtime-supplied (auto-size): a direct write
     *  to its slot quietly replaces it. A non-yielding one is author-declared
     *  (`{ }`, a percent): a direct write is an error (see attributes.ts). */
    readonly yielding = false
  ) {}

  /** Static-edge mode (docs/system-design/constraints.md §5): the compiler extracted this
   *  constraint's dependency set, so its edges are wired ONCE — thereafter run()
   *  recomputes and applies with no per-run unlink/re-track. */
  private wired = false;
  /** @internal Whether this constraint runs on the static path (test/observe). */
  get isStatic(): boolean { return this.wired; }

  /** The compiler's extracted read-paths, retained verbatim for tooling —
   *  `explain()` (inspect.ts) answers "why does this slot have this value"
   *  by LOOKUP because these ride along (verify-and-evals.md §2.2). Null on
   *  the tracking path. */
  wiredPaths: readonly string[] | null = null;

  /** Wire the supplied edges once, then land the initial value. `probe` reads the
   *  compiler's extracted read-paths under tracking — the same Cell.track path a
   *  full run would use, but over just the (branch-union) dependency set — so the
   *  edges are exact and permanent. The value itself is computed with tracking
   *  OFF (edges already fixed). This is the link-time prewiring. */
  wire(probe: () => void, paths?: readonly string[]): void {
    this.probe = probe;
    const prev = active;
    active = this;
    try { probe(); } finally { active = prev; }
    this.wired = true;
    if (paths !== undefined) this.wiredPaths = paths;
    this.apply(this.compute());
  }

  /** The wired probe, retained for structural RE-WIRING (see invalidate). */
  private probe: (() => void) | null = null;
  /** Set when a STRUCTURAL cell woke this constraint: the child-list under
   *  one of its reads changed shape, so the fixed edge set may be stale —
   *  the next run re-probes (unlink + re-track over the same read-paths). */
  private needsRewire = false;

  /** Evaluate now. On the static path (wired) the edges are fixed: just
   *  recompute and apply — no unlink, no re-track, no `active` branch on reads.
   *  Otherwise drop last run's edges and rediscover them under tracking. */
  run(): void {
    if (this.wired) {
      if (this.needsRewire && this.probe !== null) {
        // structure changed under a read: refresh the edges (same read-paths,
        // current cells — new children subscribe, removed ones unlink), then
        // land the value. The hot path (attribute wakes) never comes here.
        this.needsRewire = false;
        for (const d of this.deps) d.unlink(this);
        this.deps.length = 0;
        const prev = active;
        active = this;
        try { this.probe(); } finally { active = prev; }
      }
      this.apply(this.compute());
      return;
    }
    for (const d of this.deps) d.unlink(this);
    this.deps.length = 0;
    const prev = active;
    active = this;
    let v: unknown;
    try {
      v = this.compute();
    } finally {
      active = prev;
    }
    this.apply(v);
  }

  /** @internal Called by Cell.track for the active computation. */
  reads(cell: Cell): void {
    this.deps.push(cell);
  }

  /** Queue for the next settle. Coalesces: already-queued, disposed, or
   *  suspended constraints are a no-op, so N invalidations cost one run. */
  invalidate(from?: Cell): void {
    // A STRUCTURAL wake records itself even when already queued — the
    // coalesced run must know to re-probe its edges.
    if (from !== undefined && from.structural) this.needsRewire = true;
    if (this.queued || this.dead || this.suspended) return;
    this.queued = true;
    enqueue(this);
  }

  /** Permanently retire (a yielding owner displaced by a direct write). */
  dispose(): void {
    this.dead = true;
    for (const d of this.deps) d.unlink(this);
    this.deps.length = 0;
  }

  /** Displace this constraint without killing it: drop its dependency edges
   *  and refuse to wake, so an animator may drive its slot every tick while
   *  the constraint sits inert (animation.md §2 rule 2). It keeps owning the
   *  slot (the ownership diagnostic still protects it from author writes) but
   *  writes nothing until resumed. Idempotent. */
  suspend(): void {
    this.suspended = true;
    this.queued = false; // pull out of any pending settle
    for (const d of this.deps) d.unlink(this);
    this.deps.length = 0;
    // Dropping the edges is what makes suspension inert, but on the STATIC path
    // run() does not rediscover edges (that is the whole point of prewiring), so
    // a resumed wired constraint would land its value once and then never wake
    // again. Arm the re-probe here: the next run re-tracks over the compiler's
    // read-paths and the constraint is a live citizen again.
    if (this.wired) this.needsRewire = true;
  }

  /** Resume from suspension and re-evaluate against current state now — the
   *  displaced driver taking its slot back on the animator's completion
   *  (animation.md §2 rule 4: resumed, not reinstated with a stale output). */
  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    this.run();
  }

  /** @internal The scheduler's entry: un-queue, count against the cycle
   *  guard, re-run. Clearing `queued` *before* running is what lets a run
   *  that dirties itself (via another constraint) re-enter the queue. */
  runQueued(settleStamp: number): void {
    this.queued = false;
    if (this.dead || this.suspended) return;
    if (this.stamp !== settleStamp) {
      this.stamp = settleStamp;
      this.runs = 0;
    }
    if (++this.runs > CYCLE_LIMIT) {
      throw new DeclareError(
        `constraint cycle: ${this.label} re-evaluated ${CYCLE_LIMIT} times in one update — it (transitively) depends on its own output`
      );
    }
    this.run();
  }

  /** @internal An aborted settle clears flags so later writes can requeue. */
  abandon(): void {
    this.queued = false;
  }
}

// ── The scheduler ───────────────────────────────────────────────────────────
//
// Writes batch (language §7): a write updates its value immediately, but
// dependents recompute once, at the settle — which runs as a microtask, so a
// whole synchronous turn of writes coalesces and settles *before* the
// browser's next render step (microtasks drain ahead of rAF). Surface pushes
// made during the settle then fold into the backends' existing single-rAF
// paint: many writes, one recompute wave, one frame.
//
// Ordering within a settle is FIFO by invalidation order with fixpoint
// re-queueing: in the common flow (writes propagate "downstream") every
// constraint runs exactly once; a constraint that ran early and was then
// re-dirtied simply runs again. Quiescence — every constraint consistent
// with its inputs — is the semantic guarantee; the visit order is a free
// policy dimension (see the R4 how-to question in HANDOFF.md).

const queues: [Constraint[], Constraint[]] = [[], []];
const heads: [number, number] = [0, 0];
let scheduled = false;
let flushing = false;
let stamp = 0;

function enqueue(c: Constraint): void {
  queues[c.phase].push(c);
  if (!scheduled && !flushing) {
    scheduled = true;
    queueMicrotask(settle);
  }
}

/** Steps registered by `afterSettle`, drained at the close of the settle. */
const after: Array<() => void> = [];

// ── THE CHANGE EVENT ────────────────────────────────────────────────────────
// A node that names values in `trackChanges` gets one CONSTRAINT per name, read
// like any other dependency, so the node wakes only when one of those values
// actually moves — nothing is polled and a node that tracks nothing costs
// nothing. The wake records what moved; delivery waits for the CLOSE of the
// settle, when every constraint has re-run and every afterSettle step is spent,
// so the handler sees a tree that is wholly up to date and never a half-applied
// one. One call per settle carries every value that moved, so a handler whose
// two subjects change together acts once. Boot is silent: the first run of each
// constraint only seeds. A handler's own writes queue more work and the same
// loop runs it as the next pass, which is the "next settle" the guide
// describes; a ring — A's handler moves B, B's moves A — ends on its own,
// because a value is delivered at most ONCE per settle chain.
interface Tracker {
  readonly name: string;
  /** The value at the previous close — what `previousValue` reports. */
  last: unknown;
  /** The newest value this settle produced (a value that moves twice inside
   *  one settle reports the first and the last, once). */
  current: unknown;
  seeded: boolean;
  c: Constraint;
}
export interface ValueChange {
  readonly name: string;
  readonly previousValue: unknown;
  readonly currentValue: unknown;
}
type ChangeDispatch = (node: object, changed: readonly ValueChange[]) => void;
let dispatchChange: ChangeDispatch | null = null;
/** view.ts installs the dispatcher (this module cannot import it). */
export function setChangeDispatcher(fn: ChangeDispatch): void { dispatchChange = fn; }
const tracked = new Map<object, Tracker[]>();
const moved = new Set<object>();
const firedInChain = new WeakMap<object, Set<string>>();
let chainNodes: object[] = [];

/** Arm (or re-arm) `node` on exactly `names`. Called when the node goes live
 *  (view.ts, on `init`) and again whenever its `trackChanges` list is rebound,
 *  so a name added later starts silent rather than firing on arrival. A name
 *  the node does not have is refused HERE as well as by the checker: a computed
 *  list is not visible at compile time, and the alternative is a value that
 *  quietly never reports. */
export function trackNode(node: object, names: readonly string[] | null): void {
  untrackNode(node);
  if (names === null || names.length === 0) return;
  const list: Tracker[] = [];
  for (const name of names) {
    if (!(name in node)) {
      throw new DeclareError(
        `trackChanges: '${name}' is not a value of ${node.constructor.name} — name an attribute this node declares or a fact it carries`
      );
    }
    const t = { name, last: undefined, current: undefined, seeded: false } as Tracker;
    t.c = new Constraint(
      `${node.constructor.name}.trackChanges(${name})`,
      () => (node as Record<string, unknown>)[name],
      (v) => {
        if (!t.seeded) { t.seeded = true; t.last = v; t.current = v; return; }
        t.current = v;
        if (!Object.is(t.last, t.current)) moved.add(node);
      }
    );
    t.c.run();
    list.push(t);
  }
  tracked.set(node, list);
}

/** A retiring node leaves (node.ts runRetire), and its constraints with it. */
export function untrackNode(node: object): void {
  const list = tracked.get(node);
  if (list === undefined) return;
  for (const t of list) t.c.dispose();
  tracked.delete(node);
  moved.delete(node);
}

/** The settle's close: deliver one event per node that moved, in the order the
 *  names were written. Returns whether anything fired, so the loop knows to run
 *  another pass for whatever the handlers wrote. */
function fireChanges(): boolean {
  if (moved.size === 0 || dispatchChange === null) return false;
  const batch = [...moved];
  moved.clear();
  let fired = false;
  for (const node of batch) {
    const list = tracked.get(node);
    if (list === undefined) continue;
    const changed: ValueChange[] = [];
    for (const t of list) {
      if (Object.is(t.last, t.current)) continue;   // moved and moved back inside one settle
      let f = firedInChain.get(node);
      if (f === undefined) { firedInChain.set(node, (f = new Set())); chainNodes.push(node); }
      if (f.has(t.name)) {
        console.warn(`[Declare] onChange: '${t.name}' changed again in the same settle chain — a ring of change handlers; the second change is not delivered`);
        t.last = t.current;
        continue;
      }
      f.add(t.name);
      changed.push({ name: t.name, previousValue: t.last, currentValue: t.current });
      t.last = t.current;
    }
    if (changed.length === 0) continue;
    dispatchChange(node, changed);
    fired = true;
  }
  return fired;
}


/** The outer-loop guard — AFTER_LIMIT passes means a step (transitively)
 *  re-registers itself every pass, the afterSettle spelling of a cycle. */
const AFTER_LIMIT = 100;

/** Run `step` exactly once, at the close of the current settle — constraints
 *  quiescent, replication reconciled, layout placed, sizes derived, nothing
 *  painted yet (language §7: the settle is a microtask, ahead of the
 *  backends' paint). The far side of the landing: a handler's writes take
 *  effect at the settle, so a step registered inside a handler reads the
 *  world *after* that handler's change. Writes made in a step fold into the
 *  same settle (the drain loops back to quiescence), so a correction lands
 *  in the same frame as the change it corrects. Registered outside any
 *  pending settle, the step gets a settle of its own. */
export function afterSettle(step: () => void): void {
  after.push(step);
  if (!scheduled && !flushing) {
    scheduled = true;
    queueMicrotask(settle);
  }
}

/** Re-evaluate everything invalidated, to quiescence: all value constraints
 *  (phase 0), then draw re-records (phase 1) — looping back if a draw body
 *  wrote reactive state. Then drain the afterSettle steps, looping back to
 *  quiescence again if a step wrote (each pass under a fresh cycle stamp, so
 *  CYCLE_LIMIT keeps meaning "within one wave"). Runs automatically as a
 *  microtask after any write; exported so tests (and later, tooling) can
 *  force a deterministic settle. Throws DeclareError on a constraint cycle. */
export function settle(): void {
  scheduled = false;
  if (flushing) return;
  flushing = true;
  try {
    for (let passes = 0; ; ) {
      stamp++;
      for (;;) {
        const phase = heads[0] < queues[0].length ? 0 : heads[1] < queues[1].length ? 1 : null;
        if (phase === null) break;
        queues[phase][heads[phase]++].runQueued(stamp);
      }
      if (after.length === 0) {
        // the close: deliver the changes this settle made; their handlers'
        // writes are the next pass
        if (!fireChanges()) break;
        if (++passes > AFTER_LIMIT) throw new DeclareError(`onChange: handlers re-armed ${AFTER_LIMIT} settles in one chain`);
        continue;
      }
      if (++passes > AFTER_LIMIT) {
        throw new DeclareError(
          `afterSettle: steps re-armed ${AFTER_LIMIT} times in one settle — a step (transitively) registers itself again`
        );
      }
      const batch = after.splice(0);
      for (const step of batch) step();
    }
  } finally {
    flushing = false;
    for (const phase of [0, 1] as const) {
      // On a clean exit both loops are spent and this is a pure reset; after
      // a throw it un-flags survivors so future invalidations still queue.
      for (let i = heads[phase]; i < queues[phase].length; i++) queues[phase][i].abandon();
      queues[phase].length = 0;
      heads[phase] = 0;
    }
    // Steps too: a throw (a cycle, a step that threw) must not leak the
    // remainder into whatever unrelated settle comes next.
    after.length = 0;
    for (const n of chainNodes) firedInChain.delete(n);
    chainNodes = [];
  }
}

// ── observe — the notification half of the app↔host contract ────────────────
//
// A standing watcher over reactive state for JS callers — hosts, shims, a page
// embedding a Declare app. `read` runs under tracking; whenever a settle
// changes what it returns, `onChange` runs ONCE, at the close of that settle
// (constraints quiescent, layout placed, nothing painted — the afterSettle
// vantage). This replaces the hosts' polling loops: the question "did the app
// write X?" is answered at the write, not re-asked per frame. Equal results
// (Object.is; arrays one level shallow, so `() => [app.location, app.waypoint]`
// reads as the pair it means) coalesce to silence.
//
// Not language surface — a `{ }` body needs no subscription because the whole
// language is the subscription. This is for the JS on the far side of an App.
export function observe<T>(read: () => T, onChange: (value: T) => void, label = "observe"): () => void {
  let last: T;
  let first = true;
  let armed = false;
  const c = new Constraint(label, read, (v) => {
    if (first) { first = false; last = v as T; return; }
    if (sameResult(last, v)) return;
    last = v as T;
    if (armed) return;    // one call per settle, with the settle-final value
    armed = true;
    afterSettle(() => { armed = false; onChange(last); });
  });
  c.run();
  return () => c.dispose();
}

/** observe's result equality: Object.is, plus one level of array shallow-compare. */
function sameResult(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
    return true;
  }
  return false;
}
