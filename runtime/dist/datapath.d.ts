/** One `:path` occurrence in a body, offsets in body-source coordinates.
 *  `many` marks the replication form `:items[]`. */
export interface PathIsland {
    start: number;
    end: number;
    path: string;
    many: boolean;
}
/** Split a dot-path into segments ("" → the cursor itself: no segments).
 *  Array indices are ordinary string segments — JS containers index
 *  identically with "2" and 2, so the path currency stays one type. */
export declare const splitPath: (path: string) => string[];
/** Every datapath island in a `{ }` body, in source order. Pure lexical scan,
 *  honoring the same TS islands as the parser's brace scan (strings,
 *  templates — whose `${ }` substitutions are scanned recursively, since a
 *  datapath is legal inside them — and comments). */
export declare function scanDatapaths(src: string): PathIsland[];
/** Rewrite a body's datapath islands to their explicit runtime form —
 *  `:location.city` → `this.$data("location.city")` — the R6 rewrite
 *  discipline extended to the data mode (`$` is not in the language's
 *  identifier grammar, so no member can ever collide with `$data`). A
 *  many-path is refused: `:items[]` replicates, which is a datapath
 *  attribute's meaning, not a value a body can hold. */
export declare function rewriteDatapaths(src: string): {
    src: string;
} | {
    error: string;
};
/** Replace each island with a same-length, identifier-free TS expression
 *  (`0` + padding), so the TypeScript parser can consume the body for
 *  free-identifier analysis (compile.ts) with every source offset intact —
 *  the resolved output keeps the `:path` spelling (it is language surface;
 *  the runtime performs the final rewrite). */
export declare function fillDatapaths(src: string): string;
