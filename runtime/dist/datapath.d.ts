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
/** One `:path` occurrence in a body, offsets in body-source coordinates.
 *  `many` marks the replication form `:items[]`. `plan` is present exactly
 *  when the spelling used anything beyond dot-idents (selectors, quoted
 *  names) — absent means `splitPath(path)` IS the plan. `trouble` carries a
 *  malformed-selector refusal found during the scan. */
export interface PathIsland {
    start: number;
    end: number;
    path: string;
    many: boolean;
    plan?: PathSeg[];
    trouble?: string | null;
}
/** Parse one bracket selector's interior (trimmed). The refusals are the D4
 *  ruling's named gates — filters, functions, unions — each pointing at the
 *  living idiom. */
export declare function parsePathSpec(raw: string): {
    seg: PathSeg;
    text: string;
} | {
    error: string;
};
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
/** The first place the path grammar STOPPED where the author plainly meant to
 *  continue — the silent-truncation trap (data-paths.md §2): ':my-key' would
 *  compile to a SUBTRACTION, ':$.store' reads a key literally named '$'.
 *  Each refusal names the rewrite that works today (post-B3, the selector
 *  spellings). A malformed selector arrives as the island's own `trouble`
 *  (gated features refuse there: filters, unions — jsonpath-spelling.md §5). */
export declare function datapathTrouble(src: string, islands: readonly PathIsland[]): string | null;
export declare function rewriteDatapaths(src: string): {
    src: string;
} | {
    error: string;
};
/** Replace each island with a same-length, identifier-free TS expression
 *  (`0` + padding), so the TypeScript parser can consume the body for
 *  free-identifier analysis (compile.ts) with every source offset intact.
 *  Since the emitted-plans change (data-paths.md §5) the RESOLVED output no
 *  longer keeps the `:path` spelling — compile.ts lowers each island to
 *  `this.$data([…])` at emission, so this filler serves only the passes that
 *  run on the pre-lowered text. */
export declare function fillDatapaths(src: string): string;
