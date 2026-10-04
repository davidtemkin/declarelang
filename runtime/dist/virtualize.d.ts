import { View } from "./view.js";
import type { Dataset } from "./data.js";
import { type Match, type Materialize, type MaterializationDiag } from "./replicate.js";
/** What a windowed block needs from its Replicator. */
export interface WindowHost {
    readonly parent: View;
    readonly inited: Set<unknown>;
    idOf(item: unknown): unknown;
    kindAt(m: Match, i: number): string;
    kindOf(v: View): string;
    build(kind: string): ReturnType<Materialize>;
    /** The child index where the block starts. */
    start(): number;
    /** The last visible View before the block: its rows start below it. */
    leadingAnchor(): View | null;
}
export type WindowingFactory = (host: WindowHost) => Windowing;
export declare function createWindowing(host: WindowHost): Windowing;
/** A windowed block: the mounted rows, the ledger, and the reader's place. */
export declare class Windowing {
    private readonly host;
    /** Mounted rows by record identity. */
    private readonly rows;
    /** Parked rows: clean, hidden, waiting to be re-pointed. */
    private readonly pool;
    /** Every child the block owns, mounted and parked, in child order. */
    private owned;
    private readonly ledger;
    private ledgerIds;
    private items;
    private arrayPath;
    private data;
    active: boolean;
    private unit;
    private measured;
    private gap;
    private leading;
    /** The deviation: every row sits at its ledger offset plus this. */
    private dev;
    /** A held thumb's mapping: the physical and ledger positions it last paired. */
    private hand;
    /** The ledger position of the viewport's top at the last pass, and the way it went. */
    private lastL;
    /** When the viewport last jumped by more than a screenful. */
    private jumpedAt;
    /** Where the reader's member sat below the viewport's top when the reader
     *  last moved, and the offset a correction last wrote (its echo is not a move). */
    private anchorVis;
    private wrote;
    /** The reader is at the end (the last record in view): held there exactly. */
    private atEnd;
    private endBooked;
    private lastViewH;
    private endRuns;
    /** How far past the viewport's edge, in the direction of travel, rows count as in view (px). */
    private lead;
    /** The physical position the last pass saw (a jump is told from a scroll by it). */
    private lastP;
    private travel;
    /** The member the reader's place is kept by: a correction above it is absorbed. */
    private anchor;
    /** The build range the match chose (logical indices, inclusive start, exclusive end). */
    private from;
    private to;
    private keepRows;
    /** The rows in view at the last match. */
    private inViewFrom;
    private inViewTo;
    /** Rows from this index on lie past a held thumb's frozen range, which
     *  ends at `reach` in ledger coordinates (Infinity when no thumb is held). */
    private limit;
    private reach;
    private bar;
    private heightOwner;
    private published;
    /** Wakes the pass when rows it built can be measured. */
    private readonly measureCell;
    constructor(host: WindowHost);
    realized(): {
        view: View;
        index: number;
    }[];
    /** Scroll so the record at `index` is at the top of the viewport. */
    navigateTo(index: number): void;
    info(logical: number): Pick<MaterializationDiag, "materialized" | "retained" | "unit" | "extent">;
    /** The block's last child — the next block's anchor. */
    last(): View | null;
    /** Engaging from full replication: its instances become mounted rows. */
    adopt(views: readonly View[], items: readonly unknown[]): void;
    /** Disengaging: give the geometry back, discard the parked rows, and hand
     *  the mounted rows (in record order) to full replication. */
    release(): {
        views: View[];
        items: unknown[];
    };
    findScroller(): View | null;
    /** Where the rows' own coordinates start in the scroller's content: the
     *  parent's top padding and each box's place up the chain (the scroll
     *  anchor's topIn, the same sum). */
    private offsetTo;
    private rowsLead;
    /** The room below the last row: what follows the rows in their parent
     *  (`trailing`), then the parent's bottom padding. */
    private rowsTrail;
    /** What the parent stacks after the rows (a "writing…" line under a chat):
     *  the stack's pass stands down while windowing places the block, so these
     *  are placed here, after the last row, and their room joins the extent.
     *  Tracked: their sizes, their visibility, and the parent's child list (one
     *  arriving or leaving) wake the match. */
    private trailing;
    private trailingSiblings;
    /** The rows' whole extent: each row's span carries the gap after it, and
     *  the last row has none (a stack spaces between its children). */
    private span;
    /** Move the rows by `d` without moving them on screen (see the header). */
    private absorb;
    match(data: Dataset, arr: readonly unknown[], arrayPath: readonly string[], dataChanged: boolean, scroller: View, gap: number): Match;
    /** A new membership: each mounted row's record finds its index; a row whose
     *  record left is retired. The init set keeps only members. One scan. */
    private reindex;
    reconcile(m: Match): void;
    private busy;
    private again;
    private pass;
    private framePending;
    private jumping;
    private jumpTimer;
    private afterJumps;
    private ariaCount;
    /** Rows of the range are still to build (the next frame builds more). */
    private unfilled;
    private urgentRuns;
    private nextFrame;
    /** The block owns the parent's content extent — or, when the parent's
     *  height is the author's (rows directly in a scrolling Table: its height
     *  is the frame), the scroller's surface range. */
    private publish;
    /** Give the parent's height back: the slot's owner entry goes with the
     *  derive, or a dead rule would keep the auto-extent from returning. */
    private dropHeightOwner;
    private park;
    private unpark;
    private drop;
}
