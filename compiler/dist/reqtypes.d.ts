import type { FlagParams } from "./flags.js";
export declare const REQ: {
    /** Boot and run the app — the default for an example URL. */
    readonly RUN: "run";
    /** The syntax-highlighted source, with block comments rendered as Markdown
     *  (the code viewer app, rendered by the runtime). */
    readonly SOURCE: "source";
    /** That view's DATA on its own: the compiler's `highlight()` segments as JSON,
     *  for tooling, tests, and a static build (the `--highlight` artifact). */
    readonly SEGMENTS: "segments";
};
export type ReqType = (typeof REQ)[keyof typeof REQ];
/** The request type a URL asks for. `?view=<type>` is the canonical spelling;
 *  `?source` / `?segments` are bare shorthands (the common ones, like OL's
 *  `?source`). An unknown or absent `view` means RUN — the safe default, so an
 *  ordinary app URL is unaffected. */
export declare function requestType(params: FlagParams): ReqType;
