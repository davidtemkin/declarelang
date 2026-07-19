// browser/boot-uniform.js — UNIFORM browser-compile boot for a dumb static host
// (GitHub Pages). The deployed `.declare` SOURCE is the single source of truth:
// there is no committed precompiled artifact. This is the browser counterpart
// closure.ts calls "deferred" — it does what the OL5 static-deploy client does
// (compiler/src/browser.ts + cache-browser.ts): compile once, cache the compiled
// program in the browser, and on every later load REUSE the cache unless a
// dependency changed.
//
//   PREWARM    (optional, curated): a COMMITTED precompiled artifact shipped in
//              the tree (bundles/cache/, tools/internal/prewarm.mjs). Tried FIRST; if it
//              validates against the deployed source (content-hash re-probe,
//              prewarm-cache.js) it renders with NO compiler and NO recompile.
//              Additive — never required, never trusted; a stale/absent artifact
//              falls through to the tiers below.
//   FAST PATH  (cache hit + closure still fresh): render the cached compiled
//              program immediately — NO compiler download, NO recompile, one
//              cheap conditional HEAD to revalidate. As fast as the old
//              precompiled-artifact path.
//   SLOW PATH  (no cache, or the source changed): fetch source (+ the auto-
//              include library), compile IN-BROWSER, render, and write the
//              compiled program + its dependency CLOSURE back to the cache.
//
// Two independent freshness gates, exactly mirroring OL5:
//   • PLATFORM — BUILD_ID (bundles/version.json), the content hash the commit hook
//     (tools/internal/stamp-version.mjs) stamps over runtime + compiler bundle + web
//     client + library. It NAMES the cache bucket AND salts the key, so any
//     platform/runtime/library change drops every cached compile at once (old
//     buckets pruned on boot). The runtime is gated ONLY here — never in a
//     per-app closure — just as OL5 keeps the LFC out of the closure.
//   • APP SOURCE — the compile's dependency CLOSURE, each entry an ETag /
//     Last-Modified / FNV-1a-hash validator (closure.ts). isUpToDate() re-probes
//     it; an edit busts just that program's cache, no re-stamp needed.
//
// Relative imports resolve against THIS module's URL (…/browser/) → subpath-portable.
import { bootHost } from "./host-client.js";
import { registerServiceWorker } from "./register-sw.js";
import { loadCompiler, ensureLibrary } from "./compiler-client.js";
import { loadPrewarm, relativize } from "./prewarm-cache.js";
import { fnv1a, isUpToDate, lookupKey } from "../compiler/dist/closure.js";
import { provideTransport } from "../runtime/dist/index.js";

const ROOT = new URL("../", import.meta.url);

// ── Stage instrumentation (always on — performance.mark/measure is ~free) ────
// Every boot stage lands on the PERFORMANCE TIMELINE as a `declare:<stage>`
// measure (startTime is relative to navigation start, so overlapping stages —
// the compiler load and the source fetch run in parallel — read as a real
// waterfall in devtools or from a harness). `window.__declarePerf` carries the
// summary: { stages, path, completed } and a `done` promise that resolves at
// the first PAINTED frame after render — the number everything leads to.
const perfStage = (name) => {
  const startMark = `declare:${name}:start`;
  performance.mark(startMark);
  return {
    end() {
      try { performance.measure(`declare:${name}`, startMark); } catch { /* timeline API absent */ }
    },
  };
};
const perfDone = (() => {
  let signal;
  const done = new Promise((r) => { signal = r; });
  window.__declarePerf = { done, completed: false };
  return (path) => {
    const stages = performance.getEntriesByType("measure")
      .filter((m) => m.name.startsWith("declare:"))
      .map((m) => ({ stage: m.name.slice(8), start: +m.startTime.toFixed(1), dur: +m.duration.toFixed(1) }));
    Object.assign(window.__declarePerf, { stages, path, completed: true });
    signal(window.__declarePerf);
  };
})();

// Platform version the commit hook stamps. Absent (un-stamped dev tree) → "dev":
// the closure check alone still gates freshness. Salts the key + names the bucket.
async function platformBuild() {
  try {
    const r = await fetch(new URL("bundles/version.json", ROOT), { cache: "no-cache" });
    if (r.ok) return (await r.json()).build || "dev";
  } catch {}
  return "dev";
}

// ── validators (closure.ts model, OL5 cache-browser.ts::validatorFromResponse) ──
// Prefer the strong HTTP validators; always carry the FNV-1a content hash as the
// universal floor. Size is deliberately omitted — it is the compressed length on a
// gzip host and would fight the decoded-body hash (the ETag-authoritative rule in
// validatorsEqual exists for exactly this).
function validatorFromResponse(res, text) {
  const v = { hash: fnv1a(text) };
  const etag = res.headers.get("etag");
  const lm = res.headers.get("last-modified");
  if (etag) v.etag = etag;
  if (lm) v.lastModified = lm;
  return v;
}

// Re-probe one dependency: a cheap HEAD reads ETag/Last-Modified (no body); only if
// the host offers no strong validator do we GET and re-hash. Mirrors browserProbe.
async function probe(id) {
  try {
    const head = await fetch(id, { method: "HEAD", cache: "no-cache" });
    if (!head.ok) return { missing: true };
    const etag = head.headers.get("etag"), lm = head.headers.get("last-modified");
    if (etag || lm) return { ...(etag ? { etag } : {}), ...(lm ? { lastModified: lm } : {}) };
    const res = await fetch(id, { cache: "no-cache" });
    return res.ok ? { hash: fnv1a(await res.text()) } : { missing: true };
  } catch { return { missing: true }; }
}

async function closureFresh(closure) {
  if (!closure || !Array.isArray(closure.entries)) return false;
  const current = {};
  await Promise.all(closure.entries.map(async (e) => { current[e.id] = await probe(e.id); }));
  return isUpToDate(closure, closure.props, (e) => current[e.id] ?? { missing: true });
}

// ── compiled-output cache (CacheStorage, OL5 cache-browser.ts::CacheStorageKv) ──
const bucketName = (build) => "declare-compiled-" + build;
const cacheKeyUrl = (key) => location.origin + "/__declare-compiled__/" + key;   // synthetic key, never fetched

async function readCache(build, key) {
  try {
    const hit = await (await caches.open(bucketName(build))).match(cacheKeyUrl(key));
    return hit ? await hit.json() : null;                         // { program, source, closure }
  } catch { return null; }
}
async function writeCache(build, key, value) {
  try {
    await (await caches.open(bucketName(build))).put(cacheKeyUrl(key),
      new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } }));
  } catch {}
}
async function pruneBuckets(build) {
  try {
    const keep = bucketName(build);
    for (const n of await caches.keys()) if (n.startsWith("declare-compiled-") && n !== keep) await caches.delete(n);
  } catch {}
}

// ── The LAUNCHER entry URL (`index.html?apps/calendar`) ──────────────────────
// One shareable URL that works COLD on a static host: a bare-path query on an
// entry page names a target program; the page installs the service worker
// FIRST, then navigates — so the `.declare` (or directory-program) URL arrives
// with the SW already in control and becomes a run page instead of raw source.
// The same URL is consistent under the dev server: the server marks its HTML
// (`__declareServer`), no SW is wanted, and the launcher redirects immediately
// (the server answers the target directly). Gated on cfg.launcher so ordinary
// run pages never reinterpret their own query params (?render, ?viewer…).

/** The launch target from a bare-path query, else null. The grammar: the whole
 *  search string is the target when it reads as a relative path (contains "/"
 *  with no "=" before it) — `?apps/calendar`, `?apps/docs/docs.declare?render=canvas`.
 *  Ordinary flag queries (?crawler, ?render=canvas) never match. */
function launchTarget() {
  const raw = location.search.slice(1);
  if (raw === "") return null;
  const slash = raw.indexOf("/"), eq = raw.indexOf("=");
  if (slash < 0 || (eq >= 0 && eq < slash)) return null;
  let url;
  try { url = new URL(decodeURIComponent(raw), location.href); } catch { return null; }
  // Same-origin and inside this entry page's directory — kills absolute URLs,
  // protocol-relative hosts, and `..` escapes (URL normalizes them first).
  const base = new URL("./", location.href);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
  if (url.hash === "" && location.hash !== "") url.hash = location.hash;   // carry the fragment through
  return url;
}

/** Install the SW (static host), then hand the navigation over. Under the dev
 *  server (marker) or with no SW support, redirect at once — the server serves
 *  the target directly. `ready` never rejects, so a bounded race keeps a
 *  broken registration (private mode, plain-http LAN) from hanging the launch:
 *  on timeout we navigate anyway — no worse than today's cold link. */
async function launchTo(url) {
  document.title = "Declare · launching…";
  if (!window.__declareServer && "serviceWorker" in navigator) {
    registerServiceWorker();
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((r) => setTimeout(r, 4000)),
    ]);
  }
  location.replace(url.href);
}

/**
 * @param cfg {{
 *   main: string,                  // page's .declare, relative to the page (e.g. "./calendar.declare")
 *   backend?: "DomBackend"|"CanvasBackend",
 *   pageWeight?: number, sourceLines?: number,
 *   demos?: string[],              // (site) demo names under <main-dir>/demos/<name>.declare to seed
 *   launcher?: boolean,            // entry page: a bare-path query launches that program (see launchTarget)
 * }}
 */
export default async function boot(cfg) {
  if (cfg.launcher) {
    const target = launchTarget();
    if (target !== null) { await launchTo(target); return; }
  }
  registerServiceWorker();

  const mainUrl = new URL(cfg.main, location.href);
  const mainId = mainUrl.href;
  const mainDir = new URL(".", mainUrl);                          // app-relative assets (demos) live here
  // The app-relative data rule (docs/system-design/location.md §9), made true in the
  // LIVE browser: a relative DataSource url resolves against the PROGRAM's directory
  // — the same base diskDataResolver (Node crawl) and boot-extract (browser crawl)
  // already use. The platform default (page-relative fetch) only agrees when the
  // page IS the program URL; the root index.html boots this same app from the repo
  // root, where "language.json" would otherwise resolve a level too high.
  provideTransport((url) => fetch(new URL(url, mainDir)));
  const props = { render: cfg.backend === "CanvasBackend" ? "canvas" : "dom" };
  const sVersion = perfStage("version");
  const build = await platformBuild();
  sVersion.end();
  pruneBuckets(build);
  const key = lookupKey(mainId, props, build);

  let program = null, deps = undefined, pageSource = null, path = "slow", toCache = null;

  // PREWARM TIER — a COMMITTED precompiled artifact (bundles/cache/), tried FIRST.
  // If present AND still validating against the deployed source (its stored closure
  // re-probed by content hash — prewarm-cache.js), the program renders with NO
  // compiler download and NO recompile: the flagship pages' compiler-free first
  // paint. Never trusted, only validated — a stale (un-regenerated edit) or absent
  // artifact falls straight through to the CacheStorage tier / in-browser compile,
  // so this tier can never ship a drifted program (docs/system-design/hosting.md).
  const relMain = relativize(mainUrl, ROOT);
  const sPrewarm = perfStage("prewarm");
  const warm = await loadPrewarm({ root: ROOT, relMain, kind: "run", props, fetchImpl: fetch });
  sPrewarm.end();
  if (warm) {
    program = warm.program;
    deps = warm.deps;
    pageSource = warm.source;
    path = "prewarm";
  }

  // FAST PATH — a cached in-browser compile whose closure still validates.
  if (program === null) {
    const sCache = perfStage("cache-read");
    const cached = await readCache(build, key);
    sCache.end();
    if (cached) {
      const sClosure = perfStage("closure-check");
      const fresh = await closureFresh(cached.closure);
      sClosure.end();
      if (fresh) {
        program = cached.program;
        deps = cached.deps;                                       // the compiler's static-constraint deps, cached alongside
        pageSource = cached.source;
        path = "fast";
      }
    }
  }

  // SLOW PATH — compile in-browser and cache the result + its closure. The
  // client compiles in a module WORKER when the platform has one (off the main
  // thread; identical output by construction), inline otherwise — and the
  // auto-include library is registered as the compiler's DEFAULT
  // (ensureLibrary), so every compile here and below resolves bare tags with
  // no per-call ceremony.
  if (program === null) {
    const sCompiler = perfStage("compiler+library");
    const sSource = perfStage("source-fetch");
    const [client, { res, source }] = await Promise.all([
      loadCompiler().then(ensureLibrary).then((c) => { sCompiler.end(); return c; }),
      fetch(mainUrl, { cache: "no-cache" })
        .then(async (r) => ({ res: r, source: await r.text() }))
        .then((x) => { sSource.end(); return x; }),
    ]);
    // compileTracked records the REAL closure: the main source plus every file
    // the include host served (a multi-file app's `include`s invalidate exactly
    // like the main file). Library reads stay OUT of it — they ship with the
    // distro and are gated by BUILD_ID, like OL5's LFC. The main entry carries
    // the RESPONSE's validators (ETag/Last-Modified + content hash), so the
    // cheap headers-only re-probe can prove freshness.
    const sCompile = perfStage("compile");
    const out = await client.compileTracked(source, { mainId, mainValidator: validatorFromResponse(res, source), props });
    sCompile.end();
    if (!out.source) {
      // The compile's own rendered report — the ONE renderer's output (code,
      // line/col, hint), identical bytes to what the CLI and server print.
      return showError(out.report || "compile failed");
    }
    program = out.source;
    deps = out.deps;                                               // static-constraint deps ride in the ONE compile result
    pageSource = source;
    toCache = { program, deps, source, closure: out.closure };     // written AFTER render, below (off the paint path)
  }

  // Live-edit compile ("Edit this page" + demo previews). Warm-loaded in the
  // background so it never gates first paint, whichever path we took above.
  // The library default (ensureLibrary) makes a bare-tag preview (`Bar [ ]`)
  // compile with no per-call ceremony — the old "MUST feed the library or
  // previews render blank" obligation is gone by construction.
  const liveCompile = async (src) => {
    try {
      const client = await loadCompiler().then(ensureLibrary);    // idempotent; covers the fast path, where the slow-path registration never ran
      const out = await client.compile(src);
      // Success is source + static deps; a compile FAILURE hands back { report } so an
      // editing surface can show the diagnostic (the contract host-client documents and
      // the codeviewer host already honors). null stays "compiler not warm — no change".
      return out.source ? { source: out.source, deps: out.deps }
           : out.report != null ? { report: out.report } : null;
    } catch { return null; }
  };

  // Seed only the demo editors the page NAMES up front (the site's few — whose editors
  // read these seeds directly). Everything else is compiled ON DEMAND: the host fetches
  // a preview's source from `demoBase` the first time that island goes live — the
  // in-process echo of browse-to-run, no manifest, no bulk pre-seed. The docs name none
  // (its ~50 inline examples' editors read their source from the doc model, and their
  // previews are fetched on demand as the reader scrolls to each page).
  const seeds = { __page__: pageSource };
  if (Array.isArray(cfg.demos) && cfg.demos.length) {
    const sDemos = perfStage("demo-seeds");
    await Promise.all(cfg.demos.map(async (name) => {
      try { seeds[name] = await (await fetch(new URL("demos/" + name + ".declare", mainDir), { cache: "no-cache" })).text(); } catch {}
    }));
    sDemos.end();
  }
  const demoBase = new URL("demos/", mainDir).href;              // where mountPreviews fetches unseeded previews

  // Prewarm for ISLANDS — the same VALIDATED tier the page boot rides, offered
  // to the host's preview mounts: a slot path that resolves to a program on the
  // committed prewarm list (bundles/cache/), still validating against the
  // deployed source, mounts with NO compiler and NO compile — the app-in-a-
  // window case (a desktop window hosting apps/calendar) opens instantly even
  // on a static cold visit where the compiler bundle hasn't landed. Never
  // trusted, only validated: a stale or absent artifact returns null and the
  // mount falls through to the live-compile path exactly as before. Islands
  // always render on the DOM backend (renderChild), so the key uses render:dom
  // regardless of the page's own backend.
  const prewarmChild = async (name) => {
    try {
      const u = new URL(name + ".declare", demoBase);
      const rel = relativize(u, ROOT);
      if (!rel) return null;
      const warm = await loadPrewarm({ root: ROOT, relMain: rel, kind: "run", props: { render: "dom" }, fetchImpl: fetch });
      return warm ? { source: warm.program, deps: warm.deps } : null;
    } catch { return null; }
  };

  const sRender = perfStage("render");
  const app = await bootHost({                                     // render first — nothing below delays first paint
    source: program, deps, backend: cfg.backend,
    pageWeight: cfg.pageWeight, sourceLines: cfg.sourceLines,
    seeds, demoBase, compile: liveCompile, prewarm: prewarmChild,
  });
  sRender.end();
  // The number every stage leads to: the first frame the compositor PAINTS
  // after render (double-rAF — the second callback runs after the first
  // frame's paint has been committed).
  const sFrame = perfStage("first-frame");
  requestAnimationFrame(() => requestAnimationFrame(() => { sFrame.end(); perfDone(path); }));
  if (toCache) await writeCache(build, key, toCache);              // durable before we signal readiness
  window.__declareBoot = { path, build, key };                     // freshness/debug signal (also aids the SW)
  loadCompiler().then(ensureLibrary).catch(() => {});              // warm the compiler + library for the first live edit
  return app;
}

function showError(msg) {
  const host = document.getElementById("host");
  const p = document.createElement("div");
  p.setAttribute("role", "alert");
  p.style.cssText = "position:fixed;inset:0;margin:0;padding:24px;background:#0B141B;color:#E7EEF2;overflow:auto;box-sizing:border-box;font:13px/1.55 ui-monospace,Menlo,monospace";
  const h = document.createElement("div");
  h.textContent = "Declare — compile error";
  h.style.cssText = "font:600 15px/1.4 -apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#FF6B6B;margin:0 0 12px";
  const m = document.createElement("div");
  m.style.whiteSpace = "pre-wrap"; m.textContent = String(msg);
  p.appendChild(h); p.appendChild(m);
  (host || document.body).appendChild(p);
  console.error("[Declare] " + msg);
}
