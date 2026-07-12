// reqtypes — the request-TYPE vocabulary: what a URL should RETURN for a source,
// as distinct from the compile FLAGS (flags.ts) that decide HOW it compiles. The
// two are orthogonal — `?view=source&backend=canvas` asks for the source view of
// the canvas build — and both are read the same way from a URL query, so a single
// documented model spans the dev server and a future static host.
//
// Modeled on OpenLaszlo's `lzt` request types (run / view-source / compiled),
// which let the caller tell the server what artifact to produce for one `.lzx`.
// Kept deliberately small and extensible: new artifacts (the compiled program
// JSON, a raw-text pane, a print view) slot in as new REQ values without a second
// scheme. See design/hosting.md and docs/guide/35-shipping.md.
export const REQ = {
    /** Boot and run the app — the default for an example URL. */
    RUN: "run",
    /** The syntax-highlighted source, with block comments rendered as Markdown
     *  (the code viewer app, rendered by the runtime). */
    SOURCE: "source",
    /** That view's DATA on its own: the compiler's `highlight()` segments as JSON,
     *  for tooling, tests, and a static build (the `--highlight` artifact). */
    SEGMENTS: "segments",
};
const VALUES = new Set(Object.values(REQ));
/** The request type a URL asks for. `?view=<type>` is the canonical spelling;
 *  `?source` / `?segments` are bare shorthands (the common ones, like OL's
 *  `?source`). An unknown or absent `view` means RUN — the safe default, so an
 *  ordinary app URL is unaffected. */
export function requestType(params) {
    const v = params.get("view");
    if (v !== null && VALUES.has(v))
        return v;
    if (params.has("source"))
        return REQ.SOURCE;
    if (params.has("segments"))
        return REQ.SEGMENTS;
    return REQ.RUN;
}
//# sourceMappingURL=reqtypes.js.map