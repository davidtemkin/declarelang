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
    for (const c of this.subs) c.invalidate();
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

  /** Static-edge mode (design/constraints.md §5): the compiler extracted this
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
    const prev = active;
    active = this;
    try { probe(); } finally { active = prev; }
    this.wired = true;
    if (paths !== undefined) this.wiredPaths = paths;
    this.apply(this.compute());
  }

  /** Evaluate now. On the static path (wired) the edges are fixed: just
   *  recompute and apply — no unlink, no re-track, no `active` branch on reads.
   *  Otherwise drop last run's edges and rediscover them under tracking. */
  run(): void {
    if (this.wired) { this.apply(this.compute()); return; }
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
  invalidate(): void {
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

/** Re-evaluate everything invalidated, to quiescence: all value constraints
 *  (phase 0), then draw re-records (phase 1) — looping back if a draw body
 *  wrote reactive state. Runs automatically as a microtask after any write;
 *  exported so tests (and later, tooling) can force a deterministic settle.
 *  Throws DeclareError on a constraint cycle. */
export function settle(): void {
  scheduled = false;
  if (flushing) return;
  flushing = true;
  stamp++;
  try {
    for (;;) {
      const phase = heads[0] < queues[0].length ? 0 : heads[1] < queues[1].length ? 1 : null;
      if (phase === null) break;
      queues[phase][heads[phase]++].runQueued(stamp);
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
  }
}
