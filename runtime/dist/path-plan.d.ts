/** One segment of a compiled path PLAN (data-paths.md §5 emitted plans;
 *  jsonpath-spelling.md — RULED 2026-07-30). A plain string is a NAME
 *  (quoted-name selectors collapse to strings — `['my-key']` is the name
 *  "my-key"); the tagged forms are the RFC 9535 v1 selectors. */
export type PathSeg = string | {
    i: number;
} | {
    s: [number | null, number | null, number | null];
} | {
    w: 1;
} | {
    c: number;
};
/** Does this plan select MANY (slice/wildcard present)? Names and indices are
 *  singular; a selective path is legal in reads and `:path[]` replication,
 *  refused on `<->` and bare `datapath =` (the D4 §4 table). */
export declare const isSelective: (plan: readonly PathSeg[]) => boolean;
/** A singular plan's STATIC segments — names pass, a non-negative index is
 *  its string key. Null when the place needs the data to resolve (a negative
 *  index reads the array's length) or the plan selects many — the cases a
 *  cursor or write target refuses with a pointed error. */
export declare function staticSegs(plan: readonly PathSeg[]): string[] | null;
/** Split a dot-path into segments ("" → the cursor itself: no segments).
 *  Array indices are ordinary string segments — JS containers index
 *  identically with "2" and 2, so the path currency stays one type. */
export declare const splitPath: (path: string) => string[];
