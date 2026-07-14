import type { FlagParams } from "./flags.js";
export declare const REQ: {
    /** Boot and run the app — the default for a program URL navigation. */
    readonly RUN: "run";
    /** The EXACT source file — the bytes, text/plain. What a plain fetch of the
     *  URL returns anyway; the explicit spelling of the browser's own
     *  view-source idiom. */
    readonly SOURCE: "source";
    /** The READER: syntax-highlighted source with block comments rendered as
     *  Markdown (the code-viewer app, rendered by the runtime). */
    readonly READER: "reader";
    /** The reader opened on its LIVE-EDIT tab: the source in an editor, the
     *  running program below, compile errors sandwiched between. The same page
     *  as READER (the viewer app owns the tabs) — this is the deep link to the
     *  workbench. */
    readonly EDIT: "edit";
    /** The reader's DATA on its own: the compiler's `highlight()` segments as
     *  JSON, for tooling, tests, and a static build (the `--highlight` artifact). */
    readonly SEGMENTS: "segments";
    /** The STATIC EXTRACTION document alone (`text/html`): the program's content
     *  as semantic HTML at its t=0 snapshot (design/capabilities.md §5) — the
     *  crawler-facing artifact, inspectable by URL. The dev server extracts in
     *  Node; the static host's service worker extracts in-browser (the same
     *  extractor module) — full parity. NO bare shorthand: `?seo` is the FLAG
     *  (embed the block in the run page, flags.ts), `?view=seo` the request. */
    readonly SEO: "seo";
};
export type ReqType = (typeof REQ)[keyof typeof REQ];
/** The request type a URL asks for. `?view=<type>` is the canonical spelling;
 *  `?source` / `?reader` / `?segments` are bare shorthands (the common
 *  ones, like OL's `?source`). An unknown or absent `view` means RUN — the safe default, so an
 *  ordinary app URL is unaffected. */
export declare function requestType(params: FlagParams): ReqType;
