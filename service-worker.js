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
//          rebuilt `dist-browser/declare-compiler.js` serve STALE (the whole-page editor
//          preview bug). No file can silently lag a deploy.
//        • a stamped BUILD_ID rides in this file. When the platform changes, the stamp
//          rewrites BUILD_ID → THIS worker's bytes change → the browser installs a fresh
//          worker whose `activate` drops the old cache bucket and RELOADS open clients.
//          So even an already-open tab picks up a new deploy.
//
//   2. BROWSE-TO-RUN — a top-level navigation to any `…/<name>.declare` returns a host
//      page that fetches, compiles IN-BROWSER, and renders that program. So on the SAME
//      domain that serves the static homepage, you can browse straight to a `.declare`
//      and see it run — no dynamic server, nothing precompiled.
//
// Host-agnostic and build-step-free: every path resolves against THIS worker's own
// location, so the distro works at the origin root or under a project subpath (a GitHub
// Pages `/<repo>/` page) identically. Re-run `node tools/stamp-version.mjs` before you
// deploy to refresh BUILD_ID. Self-contained (no imports) → a CLASSIC worker, for the
// widest browser support.

// BUILD_ID — a content hash of the platform (runtime + compiler bundle + web client +
// this worker + index.html), stamped by tools/stamp-version.mjs. Left "dev" when unstamped
// (local serving); a real deploy stamps it so cache-busting + the SW self-update engage.
const BUILD_ID = "dd2c279454e5";

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
  // A new worker means a new BUILD_ID: drop every cache that isn't this build's bucket,
  // then claim open clients and tell them the build changed. register-sw.js reloads once
  // when the build it booted with differs (guarded against loops by sessionStorage).
  const keys = await caches.keys();
  await Promise.all(keys.filter((k) => k !== ASSET_CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
  for (const client of await self.clients.matchAll({ type: "window" }))
    client.postMessage({ type: "declare-updated", build: BUILD_ID });
})()));

// ── Fetch routing ────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;                   // POST /compile etc. → straight to network
  const url = new URL(req.url);
  if (url.origin !== ORIGIN) return;                  // cross-origin → default network

  // BROWSE-TO-RUN — a NAVIGATION to `…/<name>.declare` becomes a generated host page.
  // `?view=source` gets the SOURCE VIEWER page instead (highlight in-browser, render
  // the code viewer); anything else RUNS the program. A non-navigation `.declare` fetch
  // (an `include`/`dataset` the compiler reads, or the raw text a source view re-fetches)
  // is NOT a navigation, so it falls through to revalidate() and the raw source is served.
  if (req.mode === "navigate" && url.pathname.endsWith(".declare")) {
    event.respondWith(url.searchParams.get("view") === "source"
      ? sourcePageResponse(url)
      : hostPageResponse(url));
    return;
  }

  // Everything else → revalidate against the host (fresh-on-deploy, cache as offline fallback).
  event.respondWith(revalidate(req));
});

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

// The host page for a `…/<name>.declare` navigation. It carries NO program itself — a tiny
// module (web/boot-declare.js) fetches the source + the auto-include library, compiles them
// in-browser, and renders the result into #host. `<base>` is the program's own directory so
// the app's RELATIVE resources (data files, images) resolve; the boot module is imported by
// ABSOLUTE URL so `<base>` never diverts it. ?v=BUILD_ID busts the boot module across deploys.
async function hostPageResponse(url) {
  const appUrl = url.origin + url.pathname;           // the .declare (query dropped)
  const dir = appUrl.replace(/[^/]*$/, "");           // its directory, for <base href>
  const bootUrl = new URL("web/boot-declare.js", ROOT).href;
  const icon = new URL("assets/favicon.svg", ROOT).href;   // absolute so <base> doesn't divert it
  const iconPng = new URL("assets/favicon.png", ROOT).href;
  const name = appUrl.replace(/.*\//, "").replace(/\.declare$/, "");
  const html = `<!doctype html><meta charset="utf-8">
<title>${escapeHtml(name)} · Declare</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<link rel="icon" type="image/svg+xml" href="${escapeHtml(icon)}">
<link rel="icon" type="image/png" sizes="256x256" href="${escapeHtml(iconPng)}">
<base href="${escapeHtml(dir)}">
<style>html,body{margin:0;padding:0;background:#0B141B}</style>
<div id="host"></div>
<script type="module" src="${escapeHtml(bootUrl)}?app=${encodeURIComponent(appUrl)}&v=${BUILD_ID}"></script>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-cache" } });
}

// The SOURCE-VIEWER host page for a `…/<name>.declare?view=source` navigation. It boots
// web/boot-source.js, which highlights the target IN-BROWSER and renders the code-viewer
// app (examples/codeviewer) seeded with the segments. No `<base>`: the boot module resolves
// the viewer + runtime against its own ABSOLUTE URL, and takes the target only as the ?src=
// param, so nothing relative on this page needs diverting. ?v=BUILD_ID busts it per deploy.
async function sourcePageResponse(url) {
  const appUrl = url.origin + url.pathname;           // the .declare (query dropped)
  const bootUrl = new URL("web/boot-source.js", ROOT).href;
  const icon = new URL("assets/favicon.svg", ROOT).href;
  const iconPng = new URL("assets/favicon.png", ROOT).href;
  const name = appUrl.replace(/.*\//, "").replace(/\.declare$/, "");
  const html = `<!doctype html><meta charset="utf-8">
<title>${escapeHtml(name)} — source · Declare</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<link rel="icon" type="image/svg+xml" href="${escapeHtml(icon)}">
<link rel="icon" type="image/png" sizes="256x256" href="${escapeHtml(iconPng)}">
<style>html,body{margin:0;padding:0;background:#0B141B}</style>
<div id="host"></div>
<script type="module" src="${escapeHtml(bootUrl)}?src=${encodeURIComponent(appUrl)}&v=${BUILD_ID}"></script>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-cache" } });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
