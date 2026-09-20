import { type Kernel, type KernelCaps } from "./kernel-loader.js";
/** The slot table, as a LIVE binding: attributes.ts reads numeric slots
 *  straight off it (`table[cell]`), no call in between. Empty until load. */
export declare let table: Float64Array;
/** The kernel's active-rule word (−1 = no DYNAMIC rule running) and the
 *  probe collector, exported so a getter's tracking check is two reads and
 *  no call: `S.collecting !== null || ACTIVE[0] >= 0`. */
export declare let ACTIVE: Int32Array;
export declare const S: {
    collecting: Set<number> | null;
};
/** A cell changed (the host stored the value itself): queue its wake. The
 *  kernel drains the ring before it runs anything; outside a settle we arm
 *  the microtask ourselves, exactly as a kernel write would have. */
export declare function touchCell(cell: number): void;
/** Is a settle running now (a rule body, a step, a change handler)? */
export declare function isSettling(): boolean;
/** Is there work the table does not yet reflect — a settle scheduled, writes
 *  or reads in the rings, or a settle mid-flight? Answered without a call
 *  (the kernel's flag and counts are views): a declared default's untracked
 *  read evaluates live while this holds (attributes.ts declStale). */
export declare function workPending(): boolean;
export declare function loadJsKernel(): Promise<void>;
export declare function kernelReady(caps?: KernelCaps): Promise<void>;
/** The synchronous form, where the engine allows it (JavaScriptCore, node). */
export declare function kernelReadySync(caps?: KernelCaps): void;
export declare function kernelLoaded(): boolean;
/** Tooling: the kernel's occupancy — cells and rules allocated (high-water,
 *  since freed ids are reused) and the live constraints by label. What a
 *  leak looks like: a count that climbs across a churn (a location flip, a
 *  filter change) and never comes back. */
export declare function kernelStats(top?: number): {
    cells: number;
    rules: number;
    live: number;
    byLabel: Array<[string, number]>;
};
/** The kernel, for the modules that hold cells directly (attributes.ts's
 *  slot table access in the next phase). */
export declare function kernel(): Kernel;
/** Is a computation currently recording reads? Callers (attributes.ts) check
 *  this before materializing a Cell, so unobserved slots never allocate one. */
export declare function isTracking(): boolean;
export declare function trackCell(cell: number): void;
/** One observable slot's dependency node. The value itself lives wherever it
 *  lives (a view field); a Cell exists only once something tracked a read of
 *  the slot — pay-per-use by construction — and its kernel id only once it is
 *  tracked or changed. */
export declare class Cell {
    /** @internal the kernel cell, or -1 until first use. */
    id: number;
    /** @internal The cell belongs to an instance's numeric BLOCK (attributes.ts
     *  escape): the block's clear retires it; free() must not return it alone. */
    owned: boolean;
    /** A STRUCTURAL cell (a Node's child-list — node.ts): waking through one
     *  means the dependency SHAPE may have changed, so a statically-wired
     *  subscriber re-probes its edges on the next run instead of trusting the
     *  fixed set (extentOf over children that did not exist at wire time). */
    structural: boolean;
    /** The kernel cell id (allocated on first need) — for a native rule's edge. */
    cellId(): number;
    private ensure;
    /** Record that the running computation read this slot (no-op untracked). */
    track(): void;
    /** The write half: invalidate every subscriber. Subscribers only get
     *  queued here — re-evaluation is the scheduler's, in batch. */
    changed(): void;
    /** Return the kernel cell (a retiring view's slots — node.ts teardown). A
     *  freed cell drops its subscribers; the Cell may be tracked again later
     *  and takes a fresh id. */
    free(): void;
}
/** Which flush pass a constraint runs in: values first, then draw
 *  re-records — so a draw body always records against settled attributes. */
export type Phase = 0 | 1;
/** A standing computation: `compute` runs with read-tracking on, `apply`
 *  lands the result with tracking off (its writes *invalidate* dependents;
 *  they must never register as dependencies). On the tracking path the
 *  dependencies are rebuilt from scratch every run, so they are precise even
 *  under conditional reads — a branch not taken this run is not a dependency
 *  this run. */
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
    /** @internal the kernel rule, or -1 until first run/wire. */
    id: number;
    private dead;
    private suspended;
    /** The body's SOURCE TEXT and position, when this constraint came from a
     *  `{ }` in a program (bind.ts sets them). The Inspector's "why" answer is
     *  this string; null for constraints the runtime builds itself (extent
     *  derives, percent/align bindings) and for live-bound ones typed at
     *  runtime, which are marked separately by `isStatic` being false. */
    source: string | null;
    /** @internal Is this the view's AUTO-EXTENT — the rule that measures its
     *  children? The native form reads them through the kernel's slot blocks, not
     *  through JS cells, so `readsAny` cannot see the edge: a layout asking for
     *  the cycle-safe band (layout.ts viewExtent) tests this instead. */
    isAutoExtent: boolean;
    /** Where the author wrote it — `file` present only for an INCLUDED file, so
     *  a diagnostic in a multi-file program names the file it belongs to. */
    sourcePos: {
        line: number;
        col: number;
        file?: string;
    } | null;
    /** Installed at RUNTIME by the Inspector's evaluate strip rather than compiled
     *  from source — so the UI can say "temporary" honestly instead of implying it
     *  has the same standing as a compiled constraint. */
    live: boolean;
    /** When this constraint is a LAYOUT's claim on a child's geometry slot, the
     *  layout's own phrase for itself (`app.col's SimpleLayout`) — set by
     *  layout.ts. Message-only: the one-owner guard and the setter read it so a
     *  conflict names the LAYOUT and the resolution, not a bare constraint. */
    arrangedBy: string | null;
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
    /** A DECLARED slot's `{ }` default, standing as a yielding rule (bind.ts
     *  bindDeclDefault): a RUNTIME write (setBound — a tenant push, an
     *  animator, a natural size) displaces it too, as it displaced the live
     *  fallback this replaces (attributes.ts: storage wins). */
    declDefault: boolean;
    /** A percent binding (attributes.ts markPercent): the kernel's auto-extent
     *  skips the child slot it owns, as view.ts extentOf does. Set before wire. */
    percent: boolean;
    /** A kernel-native built-in declined its case: the host takes over. */
    onDecline: (() => void) | null;
    /** The numeric cell this constraint OWNS (attributes.ts own()), registered
     *  with the kernel so its pull can run this rule for a reader's first value. */
    ownsCell: number;
    ownCell(cell: number): void;
    releaseCell(): void;
    /** Is a recompute of this rule queued (its inputs moved; the table lags)?
     *  Pending ring writes are flushed first so the answer reflects them. */
    isQueued(): boolean;
    /** KERNEL-NATIVE: the rule is evaluated entirely by the kernel (an EXPR
     *  body, bind.ts); this object is its handle for ownership, labels and
     *  disposal. The kernel never calls back into it. */
    private native;
    /** @internal Adopt a rule the kernel created (EXPR): edges and code are
     *  already in place; landing is `run()`. */
    adoptRule(id: number): void;
    /** @internal Is this a kernel-evaluated rule? */
    get isNative(): boolean;
    /** @internal Whether this constraint runs on the static path (test/observe). */
    get isStatic(): boolean;
    /** The compiler's extracted read-paths, retained verbatim for tooling —
     *  `explain()` (inspect.ts) answers "why does this slot have this value"
     *  by LOOKUP because these ride along (verify-and-evals.md §2.2). Null on
     *  the tracking path. */
    wiredPaths: readonly string[] | null;
    /** The wired probe, retained for structural RE-WIRING (see runBody). */
    private probe;
    /** @internal The cells this constraint currently depends on (kernel cell
     *  ids) — tooling and tests; a rule that never ran has none. */
    get deps(): number[];
    /** @internal Does this constraint read any of `cells`? Dependency edges are
     *  rebuilt from scratch every run, so the answer is about the LAST run's
     *  reads — which is exactly what the cycle question needs ("would consuming
     *  this constraint's output close a loop back through those slots?"). The
     *  kernel holds the edges as cell ids, so the set is mapped through the ids
     *  the cells were allocated (a cell with no id was never read by anyone). */
    readsAny(cells: ReadonlySet<Cell>): boolean;
    private flags;
    /** The rule, created on first use: DYNAMIC (edges rediscovered per run)
     *  unless wire() made it a BODY with fixed edges. */
    private ensure;
    /** Collect the cells `probe` reads, without the kernel: the read set of a
     *  wired rule, taken once here and again on a structural re-probe. */
    private collect;
    /** Wire the supplied edges once, then land the initial value. `probe` reads the
     *  compiler's extracted read-paths under collection — the same Cell.track path
     *  a full run would use, but over just the (branch-union) dependency set — so
     *  the edges are exact and permanent. The value itself is computed with
     *  tracking OFF (edges already fixed). This is the link-time prewiring. */
    wire(probe: () => void, paths?: readonly string[]): void;
    /** @internal The kernel's callback: evaluate and land. On the static path a
     *  structural wake (a child list changed under a read) re-probes the edges
     *  first — same read-paths, current cells. */
    runBody(): void;
    /** Evaluate now. A tracking run REPLACES the active tracker for its
     *  duration (the JS core set `active = this`): a wire() probe that
     *  transitively runs one — the visibility feed arming on a first tracked
     *  read — must not collect the inner body's reads as its own. A wired run
     *  leaves the outer tracker in place, as before. */
    run(): void;
    /** Queue for the next settle. Coalesces: already-queued, disposed, or
     *  suspended constraints are a no-op, so N invalidations cost one run. */
    invalidate(): void;
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
}
/** Evaluate `fn` with NO tracker listening — neither the dynamic collector
 *  nor the kernel's active rule sees its reads (a declared default refreshed
 *  at displacement, attributes.ts own(): a read made on the newcomer's behalf
 *  must not become an edge of whatever rule happens to be running). */
export declare function untracked<T>(fn: () => T): T;
/** Run `step` exactly once, at the close of the current settle — constraints
 *  quiescent, replication reconciled, layout placed, sizes derived, nothing
 *  painted yet (language §7: the settle is a microtask, ahead of the
 *  backends' paint). The far side of the landing: a handler's writes take
 *  effect at the settle, so a step registered inside a handler reads the
 *  world *after* that handler's change. Writes made in a step fold into the
 *  same settle (the drain loops back to quiescence), so a correction lands
 *  in the same frame as the change it corrects. Registered outside any
 *  pending settle, the step gets a settle of its own. */
export declare function afterSettle(step: () => void): void;
export declare function settle(): void;
/** attributes.ts installs the push sweep (it knows cell → view, slot). */
export declare function setPushHook(fn: (cells: Uint32Array) => void): void;
export declare function observe<T>(read: () => T, onChange: (value: T) => void, label?: string): () => void;
