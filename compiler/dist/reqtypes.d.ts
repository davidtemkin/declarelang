import type { FlagParams } from "./flags.js";
export declare const REQ: {
    /** Boot and run the app — the default for a program-URL navigation. Rides the
     *  browser's prewarm → cache → compile ladder. */
    readonly RUN: "run";
    /** The standalone, minified, self-contained deployable (the declarec artifact) — a
     *  DIRECTORY of files, so it is served at a directory address, not inlined at the
     *  .declare URL (design/requests.md §"Transport notes"). Was the old `?prod`. */
    readonly BUILD: "build";
    /** The READER: the viewer app's default tab — highlighted source with block-comment
     *  prose rendered as Markdown (the code-viewer app, rendered by the runtime). */
    readonly READER: "reader";
    /** The viewer app's SOURCE tab: the verbatim source shown IN the viewer. Distinct
     *  from FILE (the raw bytes) — this is the viewer displaying the source, reachable by
     *  URL for the first time under this scheme. */
    readonly SOURCE: "source";
    /** The viewer app's live-EDIT tab: source in an editor, the running program below,
     *  compile errors between. The same app as READER/SOURCE (the viewer owns the tabs);
     *  this is the deep link to the workbench. */
    readonly EDIT: "edit";
    /** The raw source FILE — the bytes, `text/plain`. What an `include`, the compiler, or
     *  `curl` reads; the explicit spelling of a plain fetch. Was the old `?view=source`. */
    readonly FILE: "file";
    /** The reader's DATA on its own: the compiler's `highlight()` segments as JSON, for
     *  tooling, tests, and a static build (the `declarec --highlight` artifact). */
    readonly SEGMENTS: "segments";
    /** The STATIC EXTRACTION document ALONE (`text/html`): the program's content as
     *  semantic HTML at its t=0 snapshot (design/capabilities.md §5) — the crawler-facing
     *  artifact, inspectable by URL. The dev server extracts in Node; the static host's
     *  service worker extracts in-browser (the same extractor) — full parity. Was the old
     *  `?view=seo`. Distinct from the `seo` FLAG (flags.ts), which EMBEDS this document in
     *  a run/build page rather than returning it alone. */
    readonly EXTRACT: "extract";
};
export type ReqType = (typeof REQ)[keyof typeof REQ];
/** The request type a URL asks for. `?view=reader|source|edit` opens the viewer app on
 *  that tab; a bare `?build` / `?file` / `?segments` / `?extract` asks for that
 *  artifact; anything else (including an absent or unknown request) is RUN — the safe
 *  default, so an ordinary app URL is unaffected. */
export declare function requestType(params: FlagParams): ReqType;
