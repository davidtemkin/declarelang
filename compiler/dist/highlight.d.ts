/** One rendered piece of a source file: a Markdown block lifted from a
 *  `/* … *\/` comment, or a run of syntax-highlighted code as `<pre>` HTML. */
export type Segment = {
    kind: "prose";
    md: string;
} | {
    kind: "code";
    html: string;
};
/** Honest line counts for a .declare source — computed, never claimed (the
 *  homepage's "lines of Declare" figures). `total` physical lines; `code`
 *  lines carrying at least one non-comment token (a trailing `//` after code
 *  counts the line as code); `comment` lines whose only content is comment;
 *  `blank` whitespace-only lines. The same lexical walk as highlight() below —
 *  strings, `"""` blocks, and `{ }` bodies can hide `/*` and `//` from a
 *  regex, never from this scan. One granularity note: a `{ }` TypeScript body
 *  is a single expression token to this layer, so comment lines INSIDE one
 *  count as code. */
export interface LineMetrics {
    total: number;
    code: number;
    comment: number;
    blank: number;
}
export declare function lineMetrics(src: string): LineMetrics;
/** Preprocess a .declare source into renderable segments. Pure and
 *  dependency-free, so it runs at build time (the `--highlight` flag), on the
 *  dev server (`GET /highlight/…`), or in the browser alike. */
export declare function highlight(src: string): Segment[];
