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
/** The materialization policy (`materialize = …` on the replicated element —
 *  D5 RULED 2026-07-30 as the permanent policy slot; renamed from
 *  `windowed` in the 2026-07-30 naming ruling, clearing the word out of
 *  Window-the-component's neighborhood): `all` (full materialization — the
 *  v1 default), `auto` (window above the platform threshold), `window`
 *  (always window), or a count (window above that many records). Only the
 *  DEFAULT is scheduled to change (all → auto, once the semantic differ
 *  proves invisibility); the vocabulary is forever. */
export type MaterializePolicy = "all" | "auto" | "window" | number;
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
    /** The materialization policy (`materialize = …`; D5). */
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
    /** The materialization policy (`materialize = …`; D5). */
    policy?: MaterializePolicy);
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
