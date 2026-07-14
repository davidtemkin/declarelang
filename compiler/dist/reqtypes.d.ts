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
    /** The reader's DATA on its own: the compiler's `highlight()` segments as
     *  JSON, for tooling, tests, and a static build (the `--highlight` artifact). */
    readonly SEGMENTS: "segments";
};
export type ReqType = (typeof REQ)[keyof typeof REQ];
/** The request type a URL asks for. `?view=<type>` is the canonical spelling;
 *  `?source` / `?reader` / `?segments` are bare shorthands (the common
 *  ones, like OL's `?source`). An unknown or absent `view` means RUN — the safe default, so an
 *  ordinary app URL is unaffected. */
export declare function requestType(params: FlagParams): ReqType;
