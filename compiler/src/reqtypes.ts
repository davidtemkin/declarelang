// reqtypes — the request-TYPE vocabulary: what a URL should RETURN for a source,
// as distinct from the compile FLAGS (flags.ts) that decide HOW it compiles. The
// two are orthogonal — `?view=reader&render=canvas` asks for the reader view of
// the canvas build — and both are read the same way from a URL query, so a single
// documented model spans the dev server and the service-worker static host.
//
// Modeled on OpenLaszlo's `lzt` request types (run / view-source / compiled),
// which let the caller tell the server what artifact to produce for one `.lzx`.
// Kept deliberately small and extensible: new artifacts (the compiled program
// JSON, a raw-text pane, a print view) slot in as new REQ values without a second
// scheme. See design/hosting.md and docs/guide/35-shipping.md.

import type { FlagParams } from "./flags.js";

export const REQ = {
  /** Boot and run the app — the default for a program URL navigation. */
  RUN: "run",
  /** The EXACT source file — the bytes, text/plain. What a plain fetch of the
   *  URL returns anyway; the explicit spelling of the browser's own
   *  view-source idiom. */
  SOURCE: "source",
  /** The READER: syntax-highlighted source with block comments rendered as
   *  Markdown (the code-viewer app, rendered by the runtime). */
  READER: "reader",
  /** The reader opened on its LIVE-EDIT tab: the source in an editor, the
   *  running program below, compile errors sandwiched between. The same page
   *  as READER (the viewer app owns the tabs) — this is the deep link to the
   *  workbench. */
  EDIT: "edit",
  /** The reader's DATA on its own: the compiler's `highlight()` segments as
   *  JSON, for tooling, tests, and a static build (the `--highlight` artifact). */
  SEGMENTS: "segments",
  /** The STATIC EXTRACTION document alone (`text/html`): the program's content
   *  as semantic HTML at its t=0 snapshot (design/capabilities.md §5) — the
   *  crawler-facing artifact, inspectable by URL. The dev server extracts in
   *  Node; the static host's service worker extracts in-browser (the same
   *  extractor module) — full parity. NO bare shorthand: `?seo` is the FLAG
   *  (embed the block in the run page, flags.ts), `?view=seo` the request. */
  SEO: "seo",
} as const;

export type ReqType = (typeof REQ)[keyof typeof REQ];

const VALUES = new Set<string>(Object.values(REQ));

/** The request type a URL asks for. `?view=<type>` is the canonical spelling;
 *  `?source` / `?reader` / `?segments` are bare shorthands (the common
 *  ones, like OL's `?source`). An unknown or absent `view` means RUN — the safe default, so an
 *  ordinary app URL is unaffected. */
export function requestType(params: FlagParams): ReqType {
  const v = params.get("view");
  if (v !== null && VALUES.has(v)) return v as ReqType;
  if (params.has("source")) return REQ.SOURCE;
  if (params.has("reader")) return REQ.READER;
  if (params.has("segments")) return REQ.SEGMENTS;
  return REQ.RUN;
}
