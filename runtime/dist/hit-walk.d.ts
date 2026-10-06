/** One step of a narrated walk: the node, why it was taken or passed over, and
 *  the point in its own frame — usually the tell. */
export interface HitNote<N> {
    view: N;
    why: string;
    x: number;
    y: number;
}
/** How the walk reads one tree. */
export interface HitAdapter<N> {
    /** Whether a child entry is a node of this tree (a view's children list also
     *  holds non-view nodes). */
    isNode(c: unknown): c is N;
    children(n: N): readonly unknown[];
    visible(n: N): boolean;
    width(n: N): number;
    height(n: N): number;
    scroller(n: N): boolean;
    ignoresScroll(n: N): boolean;
    ignoresClip(n: N): boolean;
    clips(n: N): boolean;
    /** Whether a point in `n`'s frame is inside its clip; asked only when it clips. */
    insideClip(n: N, lx: number, ly: number): boolean;
    /** A point in `parent`'s frame, in `child`'s frame. */
    toChild(parent: N, child: N, lx: number, ly: number): [number, number];
}
/** What a walk is looking for: null when `n` is a target, else why it is not
 *  (said in a narrated walk). Asked only for a node whose box holds the point. */
export type HitAccept<N> = (n: N) => string | null;
/** Where the last hit was, in the hit node's own frame. */
export declare const hitPoint: {
    x: number;
    y: number;
};
/** The deepest node under (lx, ly) — a point in `n`'s own frame — that
 *  `accept` takes, or null. A `trace` collects the narration. */
export declare function walkHit<N>(n: N, lx: number, ly: number, A: HitAdapter<N>, accept: HitAccept<N>, trace?: HitNote<N>[]): N | null;
