import type { Element } from "./parser.js";
import { Node } from "./node.js";
import { View } from "./view.js";
import { type PathSeg } from "./datapath.js";
/** What the Replicator needs from instantiate.ts (which imports this module;
 *  the interface keeps the dependency one-way): construct one instance of
 *  the template — tree only — and hand back `finish` (installs bindings,
 *  fires init once linked and attached) and `suppressInit` (pre-marks the
 *  subtree inited — the membership-anchored lifecycle, D5). */
export interface Materialize {
    (template: Element, classroot: View): {
        view: View;
        finish: () => void;
        suppressInit: () => void;
    };
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
/** The replication blocks under `view` — the kernel door for layout
 *  strategies, AT traversal, the inspector, and navigate-to-record. */
export declare function blocksOf(view: View): readonly Replicator[];
/** The inspector's diagnostic payload (materialization.md §3.6 — the trust
 *  requirement): is it windowed, the logical and materialized counts, the
 *  retained set, and whether extent is measured or predicted. */
export declare function materializationInfo(view: View): MaterializationDiag | null;
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
export declare class Replicator {
    private readonly parent;
    private readonly path;
    private readonly classroot;
    private readonly make;
    /** The block's position anchor: the sibling just before it — a Node, a
     *  preceding Replicator (possibly empty), or null at the front. */
    private readonly prev;
    /** The pre-parsed plan when the path used selectors (B3) — null means
     *  `splitPath(path)` is the plan (pure names, today's fast path). */
    private readonly plan;
    /** The virtualization policy (`virtualize = …`; D5). */
    private readonly policy;
    private views;
    private items;
    /** Every child this block currently owns: the window instances plus the
     *  RETAINED (touched, off-window) instances — what linking and discard
     *  operate over. Equal to `views` when nothing is retained. */
    private allViews;
    /** Touched instances kept alive off-window (keep-alive, D5): member
     *  identity → instance. Bounded by rows a human actually touched. */
    private readonly retained;
    /** PARKED spares (recycling's idle pool): clean instances the window no
     *  longer needs, kept hidden instead of discarded so the next growth —
     *  an oscillating overscan lead, a direction flip, a viewport resize —
     *  re-points an existing row instead of constructing one (the thumb-drag
     *  bench's spikes were exactly these discard-then-rebuild bursts). */
    private readonly spares;
    /** Member identities whose init has fired — the membership-anchored
     *  lifecycle (D5): an identity in this set never refires onInit while its
     *  membership lasts; intersected with the live membership on data change,
     *  so leave-and-return is a NEW membership and fires again. */
    private readonly inited;
    private unit;
    private measuredUnit;
    private windowedActive;
    private fallback;
    private winStart;
    private logical;
    private positioned;
    private scale;
    private pRel;
    private relLogical;
    private heightOwner;
    private lastLeading;
    private lastRel;
    private readonly ledger;
    private rowGap;
    /** The membership signature the ledger was last rebuilt for. */
    private ledgerShape;
    /** The viewport-stability anchor: the first in-view member and where its
     *  top sat relative to the scroll, captured each match — a data change
     *  that moves it (a prepend, a measured correction above) compensates the
     *  scroll so the user's view holds still (Tracker criterion 2). */
    private anchorId;
    private anchorDelta;
    private lastArr;
    private lastLen;
    /** Wakes the match when the FIRST instances exist to measure — the
     *  estimate-then-correct loop's trigger (a plain cell; reconcile pings it
     *  after creating rows while the unit is still predicted). */
    private readonly measureCell;
    private indexCache;
    private readonly template;
    private readonly constraint;
    /** The record field that identifies an instance across re-derivations
     *  (`key = :field`), split into segments — or null to reconcile by object
     *  identity (===), the default. A derived collection produces FRESH record
     *  objects every recompute, so identity would rebuild all of them; a key
     *  pools by a stable field, so only genuinely changed records rebuild. */
    private readonly keyPath;
    constructor(parent: View, element: Element, path: string, classroot: View, make: Materialize, 
    /** The block's position anchor: the sibling just before it — a Node, a
     *  preceding Replicator (possibly empty), or null at the front. */
    prev: Node | Replicator | null, key?: string | null, 
    /** The pre-parsed plan when the path used selectors (B3) — null means
     *  `splitPath(path)` is the plan (pure names, today's fast path). */
    plan?: readonly PathSeg[] | null, 
    /** The virtualization policy (`virtualize = …`; D5). */
    policy?: VirtualizePolicy);
    /** The live policy answer. A literal is itself; a `{ }` constraint is called
     *  — and callers must only do that from inside match(), so the read lands in
     *  the Constraint's dependency set. A throwing expression is NOT caught: every
     *  other `{ }` in the language propagates, and swallowing this one would make
     *  a broken policy look like a deliberate `false`. */
    private wantsVirtual;
    /** First run (instantiate pass two — the tree is linked) + retire with the
     *  parent, so a discarded subtree's replicators can never wake again. */
    arm(): void;
    /** The block's logical member count. */
    logicalCount(): number;
    /** The realized instances, each with its LOGICAL index — the live
     *  window under the mechanism's name-of-art, spoken as `realized` so the
     *  API never collides with Window-the-component. */
    realized(): readonly {
        view: View;
        index: number;
    }[];
    /** Navigate-to-logical-record (materialization.md §3.5 — required by the
     *  observer boundary): scroll so the record at `index` materializes —
     *  app-level search's landing and the AT-traversal path. Imperative (a
     *  handler's verb), so reads here are untracked by design. */
    navigateTo(index: number): void;
    /** The inspector diagnostic (§3.6). */
    info(): MaterializationDiag;
    /** The nearest scrolling ancestor (scrolls = y | both), or null. Tracked
     *  when called from match(), plain when called imperatively. */
    private findScroller;
    /** This block's y offset within the scroller's CONTENT coordinates: the
     *  sum of `y` from the block's parent up to (excluding) the scroller. */
    private offsetTo;
    /** The tracked half: the inherited cursor chain + the matched region — and
     *  in windowed mode also the scroll box (scrollY, viewport extent, the
     *  offset chain, the first row's measured height): the windowed match is
     *  the SAME standing computation with more tracked dependencies
     *  (materialization.md §3.1). A non-array (unresolved, or scalar) matches
     *  nothing — zero instances, re-matched the moment the region becomes an
     *  array. A SELECTIVE plan (`:rows[2:8][]`) replicates the selection
     *  itself — windowing over selections is a later increment. */
    private match;
    /** A record's pooling identity, per the REVISED ladder (ruled 2026-07-30,
     *  the invisible version): the explicit `key = :field` override first,
     *  then the INFERRED convention — a record's own scalar `id` field IS its
     *  identity, no declaration anywhere — then the record object itself
     *  (===; the structural-equality fallback catches misses beneath that). */
    private idOf;
    /** The identity mode in force — the inspector's honesty about an invisible
     *  rule (key | id | object; structural fallback applies on misses either
     *  way when keyless). */
    private identityMode;
    private reconcile;
    /** The parent-extent the height derive publishes (windowed mode). */
    private totalExtent;
    /** Where the block starts right now: after its anchor. */
    private start;
    /** The last VISIBLE View before the block — the GEOMETRY anchor the
     *  window's leading offset builds on. Distinct from the structural anchor
     *  (`lastNodeOf(this.prev)`): an invisible sibling (a DataGrid Column, a
     *  hidden control) occupies no space — the SimpleLayout rule — so the
     *  walk skips it rather than offsetting below a phantom. */
    /** The anchor member's offset under the CURRENT (pre-rebuild) ledger,
     *  or null when it is no longer known. */
    private anchorFind;
    /** Hide and shelve a clean evicted instance for reuse. */
    private park;
    /** Take a spare back into service (visible again; the caller re-points). */
    private unpark;
    private leadingAnchor;
    /** The first live surface after the block — the `before` reference the
     *  re-inserted surfaces stack up against (null = the parent's end). */
    private surfaceAfter;
    /** @internal The block's last instance — the next block's anchor. */
    last(): Node | null;
}
