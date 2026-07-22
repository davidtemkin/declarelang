// declarelang/service-worker.js — the Declare distro Service Worker.
//
// Two jobs on a PLAIN static host (GitHub Pages, S3, nginx, `python3 -m http.server`):
//
//   1. CACHE-BUSTING — guarantee a client always runs the freshly-DEPLOYED platform
//      (the in-browser compiler bundle, the runtime, the web client). Two layers, the
//      same shape OpenLaszlo 5.0's worker uses:
//        • every same-origin asset is fetched `no-cache` → a conditional GET, so a
//          changed file is re-fetched immediately and an unchanged one is a cheap 304.
//          This defeats a static host's max-age heuristic caching, which is what let a
//          rebuilt `bundles/declare-compiler.js` serve STALE (the whole-page editor
//          preview bug). No file can silently lag a deploy.
//        • a stamped BUILD_ID rides in this file. When the platform changes, the stamp
//          rewrites BUILD_ID → THIS worker's bytes change → the browser installs a fresh
//          worker whose `activate` drops the old cache bucket. Open tabs are NOT reloaded;
//          a new deploy is picked up on the next manual load/navigation (no auto-reload).
//
//   2. BROWSE-TO-RUN — a top-level navigation to any `…/<name>.declare` returns a host
//      page that fetches, compiles IN-BROWSER, and renders that program. So on the SAME
//      domain that serves the static homepage, you can browse straight to a `.declare`
//      and see it run — no dynamic server, nothing precompiled.
//
// Host-agnostic and build-step-free: every path resolves against THIS worker's own
// location, so the distro works at the origin root or under a project subpath (a GitHub
// Pages `/<repo>/` page) identically. Re-run `node tools/internal/stamp-version.mjs` before you
// deploy to refresh BUILD_ID. A MODULE worker (registered { type: "module" } in
// register-sw.js): it imports the host-agnostic serving core so the run page it serves
// and the dev server's are ONE function (browser/serve-core.js) — needs a modern browser
// (Chrome 91+ / Safari 16.4+ / Firefox 111+).

import { requestType, REQ, runWrapper, programName, escapeHtml, directoryProgram } from "./browser/serve-core.js";
import { prewarmKey, relativize } from "./browser/prewarm-cache.js";
import { fnv1a } from "./compiler/dist/closure.js";

// BUILD_ID — a content hash of the platform (runtime + compiler bundle + web client +
// this worker + index.html), stamped by tools/internal/stamp-version.mjs. Left "dev" when unstamped
// (local serving); a real deploy stamps it so cache-busting + the SW self-update engage.
const BUILD_ID = "8cb3eb5b9e56";

const ROOT = new URL("./", self.location);            // <origin>/…/  (this worker's dir == the distro root)
const ORIGIN = ROOT.origin;
// Per-build cache bucket: a new BUILD_ID → a new bucket → the old one is dropped on
// activate, so nothing survives a platform change.
const ASSET_CACHE = "declare-assets-" + BUILD_ID;

// ── Lifecycle ────────────────────────────────────────────────────────────────
// Take control ASAP so a freshly-registered worker starts intercepting this run's
// navigations (the homepage's, and any `.declare` browsed from it) without a reload.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  // A new worker means a new BUILD_ID: drop every cache that isn't this build's bucket, then
  // claim open clients so fresh navigations hit the new build. Open pages are NOT reloaded —
  // a running program keeps the platform it booted with (loaded once, held in memory) and
  // picks up the new build only on a manual reload/navigation. No auto-reload, in any config.
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== ASSET_CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
})()));

// ── Fetch routing ────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;                   // POST /compile etc. → straight to network
  const url = new URL(req.url);
  if (url.origin !== ORIGIN) return;                  // cross-origin → default network

  // BROWSE-TO-RUN — a NAVIGATION to `…/<name>.declare` becomes a generated page, from
  // the SHARED classifier (serve-core → reqtypes.ts), so one URL model spans both hosts:
  //   RUN (default)            → the run page (host wrapper booting the platform bundle);
  //   ?viewer=reader|source|edit → the viewer app on that tab (boot-source.js, highlight
  //                              in-browser — Declare Viewer — its Source/Edit tabs);
  //   ?extract                 → the STATIC-EXTRACTION document (boot-extract.js compiles +
  //                              executes headlessly IN-BROWSER — the extractor the dev
  //                              server runs in Node);
  //   ?file / a plain fetch    → the EXACT source bytes (falls through to revalidate(),
  //                              same as an `include` the compiler reads, or curl).
  // BUILD remains a GAP on this compiler-free host (no bundler in the SW): it falls
  // through to the source bytes rather than erroring — a uniformity follow-up
  // (design/requests.md). (The `?seo` FLAG — embed the crawler block in a run
  // page — is a BUILD-time affair here: crawlers don't install service workers, so
  // declarec/committed pages carry it, not this worker.)

  // SEGMENTS — the viewer's reader artifacts, PREBAKED: every prewarmed program
  // ships { path, segments, metrics } in bundles/cache/ (tools/internal/prewarm.mjs),
  // validated here against the deployed source's hash. Any GET qualifies (the
  // embedded viewer FETCHES this; the address bar navigates to it) — a miss or a
  // stale artifact falls through to the raw bytes, the viewer's plain-code fallback.
  if (url.pathname.endsWith(".declare") && requestType(url.searchParams) === REQ.SEGMENTS) {
    event.respondWith(segmentsResponse(url, req));
    return;
  }

  if (req.mode === "navigate" && url.pathname.endsWith(".declare")) {
    const view = requestType(url.searchParams);
    if (view === REQ.RUN) { event.respondWith(hostPageResponse(url)); return; }
    if (view === REQ.READER || view === REQ.SOURCE || view === REQ.EDIT) {
      event.respondWith(sourcePageResponse(url, view)); return;   // view === the tab
    }
    if (view === REQ.EXTRACT) { event.respondWith(extractPageResponse(url)); return; }
    // FILE / SEGMENTS / BUILD → fall through to revalidate() below (the raw bytes).
  }

  // The DIRECTORY-PROGRAM rule, mirrored from the dev server (serve-core.
  // directoryProgram): …/name/ is a program URL for …/name/name.declare when that
  // source exists. The candidate is probed over the network, so the rule never
  // shadows a real asset — a miss falls through to plain revalidation. The
  // no-slash form redirects to the slash form (the host's own behavior for a
  // real directory), keeping relative resolution uniform.
  if (req.mode === "navigate" && !url.pathname.endsWith(".declare")) {
    const cand = directoryProgram(url.pathname);
    if (cand !== null) {
      event.respondWith((async () => {
        const probe = await fetch(new URL(cand, url.origin).href, { method: "HEAD", cache: "no-cache" }).catch(() => null);
        if (probe === null || !probe.ok) return revalidate(req);
        if (!url.pathname.endsWith("/")) return Response.redirect(url.pathname + "/" + url.search, 301);
        const purl = new URL(url.href);
        purl.pathname = cand;
        const view = requestType(url.searchParams);
        if (view === REQ.READER || view === REQ.SOURCE || view === REQ.EDIT) return sourcePageResponse(purl, view);
        if (view === REQ.EXTRACT) return extractPageResponse(purl);
        if (view === REQ.RUN) return hostPageResponse(purl);
        return revalidate(new Request(purl.href));   // FILE / SEGMENTS / BUILD → the candidate's bytes
      })());
      return;
    }
  }

  // Everything else → revalidate against the host (fresh-on-deploy, cache as offline fallback).
  event.respondWith(revalidate(req));
});

// SEGMENTS: serve the prebaked viewer artifact for this program — the same
// { path, segments, metrics } JSON the dev server computes — after proving it
// still matches the deployed source (one content-hash check against the one
// file segments derive from). Any failure falls through to the raw bytes.
async function segmentsResponse(url, req) {
  try {
    const mainUrl = new URL(url.pathname, url.origin);
    const rel = relativize(mainUrl.href, ROOT.href);
    const art = await (await revalidate(new Request(new URL("bundles/cache/" + prewarmKey(rel, "segments", {}) + ".json", ROOT).href))).json();
    const src = await (await revalidate(new Request(mainUrl.href))).text();
    const want = art?.closure?.entries?.[0]?.v?.hash;
    if (art?.payload == null || want == null || fnv1a(src) !== want) return revalidate(req);
    return new Response(JSON.stringify(art.payload), { headers: { "content-type": "application/json" } });
  } catch {
    return revalidate(req);
  }
}

// Always ask the host whether the asset changed (`no-cache` = conditional GET). A changed
// file comes back 200 and re-populates the cache; an unchanged one validates cheaply. The
// cached copy is only a fallback for when the network is unreachable (offline).
async function revalidate(req) {
  const cache = await caches.open(ASSET_CACHE);
  try {
    const res = await fetch(req, { cache: "no-cache" });
    if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    return hit || Response.error();
  }
}

// The RUN host page for a `…/<name>.declare` navigation — the SHARED run shell
// (browser/serve-core.js runWrapper), identical to what the dev server serves
// (server/index.mjs declareRunPage) — one function, not two kept in step. It boots
// the ONE platform bundle with `main` = the program's own URL; boot-uniform then
// gives it the prewarm → cache → compile path — a revisit renders from cache, no
// compiler. The bundle is imported by ABSOLUTE URL with ?v=BUILD_ID, busting per deploy.
async function hostPageResponse(url) {
  const html = runWrapper({
    name: programName(url.pathname),
    bootUrl: new URL("bundles/declare-boot.js", ROOT).href + "?v=" + BUILD_ID,
    iconBase: new URL("assets/", ROOT).href,
    // explicit, so the shell also works at a directory-program URL (the caller
    // passes the CANDIDATE pathname there, not the page's own)
    main: url.pathname,
  });
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-cache" } });
}

// The VIEWER page for a `…/<name>.declare?viewer=reader|source|edit` navigation. It boots
// browser/boot-source.js, which highlights the target IN-BROWSER and renders the Viewer
// app (apps/viewer) on the requested tab (`tab` → ?mode= → the viewer's __mode__:
// reader = highlighted + Markdown, source = verbatim, edit = live workbench). No `<base>`:
// the boot module resolves the viewer + runtime against its own ABSOLUTE URL, and takes the
// target only as the ?src= param, so nothing relative on this page needs diverting. ?v busts.
async function sourcePageResponse(url, tab) {
  const appUrl = url.origin + url.pathname;           // the .declare (query dropped)
  const bootUrl = new URL("browser/boot-source.js", ROOT).href;
  const icon = new URL("assets/favicon.svg", ROOT).href;
  const iconPng = new URL("assets/favicon.png", ROOT).href;
  const name = programName(url.pathname);
  const html = `<!doctype html><meta charset="utf-8">
<title>${escapeHtml(name)} — ${escapeHtml(tab)} · Declare</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<link rel="icon" type="image/svg+xml" href="${escapeHtml(icon)}">
<link rel="icon" type="image/png" sizes="256x256" href="${escapeHtml(iconPng)}">
<style>html,body{margin:0;padding:0;background:#0B141B}</style>
<div id="host"></div>
<script type="module" src="${escapeHtml(bootUrl)}?src=${encodeURIComponent(appUrl)}&mode=${escapeHtml(tab)}&v=${BUILD_ID}"></script>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-cache" } });
}

// The STATIC-EXTRACTION page for `…/<name>.declare?extract`. It boots
// browser/boot-extract.js, which compiles the target in-browser, executes it headlessly
// (no mount) and REWRITES this page as the extracted semantic-HTML document —
// the same artifact the dev server's serveExtract() sends, via the browser path.
async function extractPageResponse(url) {
  const appUrl = url.origin + url.pathname;           // the .declare (query dropped)
  const bootUrl = new URL("browser/boot-extract.js", ROOT).href;
  const name = programName(url.pathname);
  const html = `<!doctype html><meta charset="utf-8">
<title>${escapeHtml(name)} — static extraction · Declare</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script type="module" src="${escapeHtml(bootUrl)}?src=${encodeURIComponent(appUrl)}&v=${BUILD_ID}"></script>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-cache" } });
}
