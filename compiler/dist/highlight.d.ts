/** One rendered piece of a source file: a Markdown block lifted from a
 *  `/* … *\/` comment, or a run of syntax-highlighted code as `<pre>` HTML. */
export type Segment = {
    kind: "prose";
    md: string;
} | {
    kind: "code";
    html: string;
};
/** Preprocess a .declare source into renderable segments. Pure and
 *  dependency-free, so it runs at build time (the `--highlight` flag), on the
 *  dev server (`GET /highlight/…`), or in the browser alike. */
export declare function highlight(src: string): Segment[];
