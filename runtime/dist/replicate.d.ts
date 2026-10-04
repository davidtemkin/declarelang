import type { Element } from "./parser.js";
import { Node } from "./node.js";
import { View } from "./view.js";
import { type PathSeg } from "./path-plan.js";
import { type PathNode } from "./select.js";
import type { Dataset } from "./data.js";
import type { WindowingFactory } from "./virtualize.js";
/** What the Replicator needs from instantiate.ts (which imports this module;
 *  the interface keeps the dependency one-way): construct one instance of
 *  the template — tree only — and hand back `finish` (installs bindings,
 *  fires init once linked and attached) and `suppressInit` (pre-marks the
 *  subtree inited — the membership-anchored lifecycle, D5). */
export interface Materialize {
    (template: Element, classroot: View): {
        view: View;
        provide: () => void;
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
 *  word for Window-the-class. Both options named the thing from the
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
export interface Match {
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
    start: number;
    unit: number;
    windowed: boolean;
    /** Did the logical membership change shape since the last match (array
     *  identity or length) — as opposed to a scroll-driven window move? The
     *  O(N) bookkeeping passes run only when this is true. */
    dataChanged: boolean;
    /** The y where the block STARTS inside its parent — the bottom of the
     *  preceding sibling (a grid's header) plus one gap; 0 with no leader. */
    leading: number;
    /** Each node's class (`classFor`), read inside the match so a record whose
     *  kind changes re-matches; null when the block has one class. */
    classes?: readonly string[] | null;
}
export declare class Replicator {
    private readonly parent;
    private readonly path;
    protected readonly classroot: View;
    protected readonly make: Materialize;
    /** The block's position anchor: the sibling just before it — a Node, a
     *  preceding Replicator (possibly empty), or null at the front. */
    private readonly prev;
    /** The pre-parsed plan when the path used selectors (B3) — null means
     *  `splitPath(path)` is the plan (pure names, today's fast path). */
    private readonly plan;
    /** The virtualization policy (`virtualize = …`; D5). */
    private readonly policy;
    /** Windowing (virtualize.ts) — present only when the program can ask for it. */
    private readonly windowing;
    private views;
    private items;
    /** Member identities whose init has fired — the membership-anchored
     *  lifecycle (D5): an identity in this set never refires onInit while its
     *  membership lasts; intersected with the live membership on data change,
     *  so leave-and-return is a NEW membership and fires again. */
    readonly inited: Set<unknown>;
    private fallback;
    private logical;
    /** The windowed half (virtualize.ts), made the first time the policy asks
     *  for it; null for a block that replicates fully. */
    private win;
    private lastArr;
    private lastLen;
    protected readonly template: Element;
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
    policy?: VirtualizePolicy, 
    /** Windowing (virtualize.ts) — present only when the program can ask for it. */
    windowing?: WindowingFactory | null);
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
     *  API never collides with Window-the-class. */
    realized(): readonly {
        view: View;
        index: number;
    }[];
    /** Navigate-to-logical-record (materialization.md §3.5 — required by the
     *  observer boundary): scroll so the record at `index` materializes —
     *  app-level search's landing and the AT-traversal path. Imperative (a
     *  handler's verb), so reads here are untracked by design. Writing the
     *  scroll offset is the whole move: the windowed match tracks it. */
    navigateTo(index: number): void;
    /** The inspector diagnostic (§3.6). */
    info(): MaterializationDiag;
    /** The nearest scrolling ancestor (scrolls = y | both), or null. Tracked
     *  when called from match(). */
    private findScroller;
    /** The tracked half: the inherited cursor chain + the matched region — and
     *  in windowed mode also the scroll box (scrollY, viewport extent, the
     *  offset chain, the first row's measured height): the windowed match is
     *  the SAME standing computation with more tracked dependencies
     *  (materialization.md §3.1). A non-array (unresolved, or scalar) matches
     *  nothing — zero instances, re-matched the moment the region becomes an
     *  array. A SELECTIVE plan (`:rows[2:8][]`) replicates the selection
     *  itself — windowing over selections is a later increment. */
    /** Tag the matched nodes with their classes (runs inside the match). */
    protected classify(m: Match): Match;
    /** The class matched node `i` is built as. */
    protected kindAt(_m: Match, _i: number): string;
    /** The class a live instance was built as. */
    protected kindOf(_v: View): string;
    /** Build an instance of class `kind`. */
    protected build(_kind: string): ReturnType<Materialize>;
    private match;
    /** What the windowed half needs from this block. */
    private windowHost;
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
    /** Where the block starts right now: after its anchor. */
    private start;
    /** The last VISIBLE View before the block — the GEOMETRY anchor the
     *  window's leading offset builds on. Distinct from the structural anchor
     *  (`lastNodeOf(this.prev)`): an invisible sibling (a DataGrid Column, a
     *  hidden control) occupies no space — the SimpleLayout rule — so the
     *  walk skips it rather than offsetting below a phantom. */
    private leadingAnchor;
    /** The first live surface after the block — the `before` reference the
     *  re-inserted surfaces stack up against (null = the parent's end). */
    private surfaceAfter;
    /** @internal The block's last instance — the next block's anchor. */
    last(): Node | null;
}
/** A replicated instance's construction threw — surface it once, loudly,
 *  with the node's path (the field-report contract), and let reconcile keep
 *  going: the defect belongs to the instance whose member threw, and the
 *  siblings' cursors and finishes must land regardless. */
export declare function reportInstanceThrow(v: View, phase: string, e: unknown): void;
/** Does the keyboard focus live inside this instance's subtree? A focused
 *  row is TOUCHED by definition (focus-as-touched — the D5 deferral, forced
 *  the day a recycled select cell dragged the focus ring to an arbitrary
 *  record): it must never be re-pointed, parked, or discarded under the
 *  user's cursor. */
export declare function focusedWithin(root: Node): boolean;
/** Has any node in this instance's subtree received a direct write since it
 *  was armed — the §2 divergence probe (attributes.ts). Walked only at
 *  discard decisions; proportional to one instance's subtree. */
export declare function subtreeDiverged(root: Node): boolean;
/** Arm divergence tracking over a finished instance's subtree —
 *  construct-phase writes (literals, bindings, init) never count as touch. */
export declare function armTree(root: Node): void;
