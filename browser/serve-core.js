// browser/serve-core.js — the host-agnostic serving core.
//
// A `.declare` navigation is answered the same way by BOTH hosts — the dev server
// (server/index.mjs) and the static-host service worker (service-worker.js): read
// the request TYPE from the query, and for a RUN produce a thin shell that boots
// the ONE platform bundle (boot-uniform) with `main` = the program's own URL.
// boot-uniform then owns prewarm → cache → compile → freshness IN THE BROWSER, for
// both hosts — so the run shell is the last thing the two needed to agree on.
//
// Extracting the classifier + the run wrapper HERE makes the two hosts thin
// ADAPTERS over one core: they can no longer generate divergent run pages, which is
// the drift the dual-mode design set out to make structurally impossible. The
// source/seo views stay host-specific ON PURPOSE — the server has a compiler and
// answers them in Node; the compiler-free SW defers to boot-source.js / boot-seo.js
// in-browser — but they produce the SAME artifact (design/capabilities.md), so the
// invariant there is an output oracle, not one implementation.
//
// Pure + host-agnostic: it imports only reqtypes.js (itself dependency-free — a
// type-only import of FlagParams, erased at compile), templates strings, and touches
// no window / document / fs. So the Node server imports it directly, and the service
// worker imports it as a MODULE worker — one source of truth, tested by
// test/serve-parity.test.mjs.

import { requestType, REQ } from "../compiler/dist/reqtypes.js";
export { requestType, REQ };

/** HTML-escape text and attribute values (the SW's escaping, adopted verbatim). */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/** The program's display name from its URL path — the run page's title. */
export function programName(urlPath) {
  return urlPath.replace(/.*\//, "").replace(/\.declare$/, "");
}

/**
 * The RUN wrapper — the shell both hosts serve for a `.declare` navigation. It boots
 * the platform bundle with `main = location.pathname` (the page IS served at the
 * .declare URL, so this resolves to the program on both hosts), letting boot-uniform
 * take the prewarm → cache → compile path. The only host-specific inputs are
 * PARAMETERS, never branches inside the template:
 *
 * @param cfg {{
 *   name: string,             // page title
 *   bootUrl: string,          // the declare-boot.js module URL (the SW busts it with ?v=BUILD_ID;
 *                             //   the dev server uses the root-relative path it rebuilds on demand)
 *   staticBlock?: string,     // baked #declare-static for a crawler (the server's ?seo flag);
 *                             //   the SW never bakes at request time (crawlers don't install workers)
 *   iconBase?: string|null,   // if set, emit favicon links resolved against it (…/ ending in a slash)
 * }}
 */
export function runWrapper({ name, bootUrl, staticBlock = "", iconBase = null }) {
  const icons = iconBase
    ? `<link rel="icon" type="image/svg+xml" href="${escapeHtml(iconBase + "favicon.svg")}">\n` +
      `<link rel="icon" type="image/png" sizes="256x256" href="${escapeHtml(iconBase + "favicon.png")}">\n`
    : "";
  // When a crawler block is baked in (the ?seo flag), a SYNCHRONOUS classic script
  // immediately after the host removes it BEFORE the first paint — so a human never
  // flashes the bare extraction text while the async app module loads. This is NOT
  // hiding: nothing is ever CSS-hidden (display:none / off-screen / opacity:0 — the
  // signatures a crawler reads as cloaking). A non-JS crawler never runs this script,
  // so it reads the block in the served HTML; a JS crawler runs the app and settles on
  // the SAME mounted DOM a user sees. Same content for every agent — only the
  // presentation swaps, exactly like SSR hydration replacing server markup. And it
  // fails SAFE: if it somehow ran after paint, the worst case is the old flash, never a
  // hidden-text signal. (host-client.js repeats the removal at mount as a fallback.)
  const clearStatic = staticBlock
    ? `\n<script>document.getElementById("declare-static")?.remove()</script>`
    : "";
  return `<!doctype html><meta charset="utf-8">
<title>${escapeHtml(name)} · Declare</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
${icons}<style>html,body{margin:0;padding:0;background:#0B141B}</style>
<div id="host">${staticBlock}</div>${clearStatic}
<script type="module">
  import boot from ${JSON.stringify(bootUrl)};
  const q = new URLSearchParams(location.search);
  boot({ main: location.pathname, backend: q.get("render") === "canvas" ? "CanvasBackend" : undefined });
</script>`;
}
