/** Is a computation currently recording reads? Callers (attributes.ts) check
 *  this before materializing a Cell, so unobserved slots never allocate one. */
export declare function isTracking(): boolean;
/** One observable slot's dependency node: just its subscribers. The value
 *  itself lives wherever it lives (a view field); a Cell exists only once
 *  something tracked a read of the slot — pay-per-use by construction. */
export declare class Cell {
    private readonly subs;
    /** A STRUCTURAL cell (a Node's child-list — node.ts): waking through one
     *  means the dependency SHAPE may have changed, so a statically-wired
     *  subscriber re-probes its edges on the next run instead of trusting the
     *  fixed set (extentOf over children that did not exist at wire time). */
    structural: boolean;
    /** Record that the running computation read this slot (no-op untracked). */
    track(): void;
    /** The write half: invalidate every subscriber. Subscribers only get
     *  queued here — re-evaluation is the scheduler's, in batch. */
    changed(): void;
    /** @internal Constraint.run re-tracks from scratch each run. */
    unlink(c: Constraint): void;
}
/** Which flush pass a constraint runs in: values first, then draw
 *  re-records — so a draw body always records against settled attributes. */
export type Phase = 0 | 1;
/** A standing computation: `compute` runs with read-tracking on, `apply`
 *  lands the result with tracking off (its writes *invalidate* dependents;
 *  they must never register as dependencies). Dependencies are rebuilt from
 *  scratch every run, so they are precise even under conditional reads —
 *  a branch not taken this run is not a dependency this run. */
export declare class Constraint {
    /** For error messages: "View.width", "Text.draw", … */
    readonly label: string;
    private readonly compute;
    private readonly apply;
    readonly phase: Phase;
    /** A yielding constraint is runtime-supplied (auto-size): a direct write
     *  to its slot quietly replaces it. A non-yielding one is author-declared
     *  (`{ }`, a percent): a direct write is an error (see attributes.ts). */
    readonly yielding: boolean;
    private deps;
    private queued;
    private dead;
    /** Suspended: inert but alive — dependency edges dropped and waking
     *  refused, so an animator can drive this constraint's slot without it
     *  fighting back, then resume() re-runs it against current state
     *  (animation.md §2 rules 2–4, the supersede/restore kernel service). */
    private suspended;
    private stamp;
    private runs;
    constructor(
    /** For error messages: "View.width", "Text.draw", … */
    label: string, compute: () => unknown, apply: (value: unknown) => void, phase?: Phase, 
    /** A yielding constraint is runtime-supplied (auto-size): a direct write
     *  to its slot quietly replaces it. A non-yielding one is author-declared
     *  (`{ }`, a percent): a direct write is an error (see attributes.ts). */
    yielding?: boolean);
    /** Static-edge mode (docs/system-design/constraints.md §5): the compiler extracted this
     *  constraint's dependency set, so its edges are wired ONCE — thereafter run()
     *  recomputes and applies with no per-run unlink/re-track. */
    private wired;
    /** @internal Whether this constraint runs on the static path (test/observe). */
    get isStatic(): boolean;
    /** The compiler's extracted read-paths, retained verbatim for tooling —
     *  `explain()` (inspect.ts) answers "why does this slot have this value"
     *  by LOOKUP because these ride along (verify-and-evals.md §2.2). Null on
     *  the tracking path. */
    wiredPaths: readonly string[] | null;
    /** Wire the supplied edges once, then land the initial value. `probe` reads the
     *  compiler's extracted read-paths under tracking — the same Cell.track path a
     *  full run would use, but over just the (branch-union) dependency set — so the
     *  edges are exact and permanent. The value itself is computed with tracking
     *  OFF (edges already fixed). This is the link-time prewiring. */
    wire(probe: () => void, paths?: readonly string[]): void;
    /** The wired probe, retained for structural RE-WIRING (see invalidate). */
    private probe;
    /** Set when a STRUCTURAL cell woke this constraint: the child-list under
     *  one of its reads changed shape, so the fixed edge set may be stale —
     *  the next run re-probes (unlink + re-track over the same read-paths). */
    private needsRewire;
    /** Evaluate now. On the static path (wired) the edges are fixed: just
     *  recompute and apply — no unlink, no re-track, no `active` branch on reads.
     *  Otherwise drop last run's edges and rediscover them under tracking. */
    run(): void;
    /** @internal Called by Cell.track for the active computation. */
    reads(cell: Cell): void;
    /** Queue for the next settle. Coalesces: already-queued, disposed, or
     *  suspended constraints are a no-op, so N invalidations cost one run. */
    invalidate(from?: Cell): void;
    /** Permanently retire (a yielding owner displaced by a direct write). */
    dispose(): void;
    /** Displace this constraint without killing it: drop its dependency edges
     *  and refuse to wake, so an animator may drive its slot every tick while
     *  the constraint sits inert (animation.md §2 rule 2). It keeps owning the
     *  slot (the ownership diagnostic still protects it from author writes) but
     *  writes nothing until resumed. Idempotent. */
    suspend(): void;
    /** Resume from suspension and re-evaluate against current state now — the
     *  displaced driver taking its slot back on the animator's completion
     *  (animation.md §2 rule 4: resumed, not reinstated with a stale output). */
    resume(): void;
    /** @internal The scheduler's entry: un-queue, count against the cycle
     *  guard, re-run. Clearing `queued` *before* running is what lets a run
     *  that dirties itself (via another constraint) re-enter the queue. */
    runQueued(settleStamp: number): void;
    /** @internal An aborted settle clears flags so later writes can requeue. */
    abandon(): void;
}
/** Re-evaluate everything invalidated, to quiescence: all value constraints
 *  (phase 0), then draw re-records (phase 1) — looping back if a draw body
 *  wrote reactive state. Runs automatically as a microtask after any write;
 *  exported so tests (and later, tooling) can force a deterministic settle.
 *  Throws DeclareError on a constraint cycle. */
export declare function settle(): void;
