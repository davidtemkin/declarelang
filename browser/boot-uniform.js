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
//     (tools/internal/stamp-version.mjs) stamps over the runtime + compiler bundle +
//     web client. It NAMES the cache bucket AND salts the key, so a runtime/compiler
//     change drops every cached compile at once (old buckets pruned on boot). The
//     runtime/compiler BUNDLE is gated ONLY here — never in a per-app closure — just
//     as OL5 keeps the LFC out of the closure: it is a load-time artifact, not a
//     compiled-in source dep.
//   • APP SOURCE — the compile's dependency CLOSURE: the main source AND every file
//     it read (its includes and the auto-included component SOURCES it resolved —
//     the referenced set only), each an ETag / Last-Modified / FNV-1a-hash validator
//     (closure.ts). isUpToDate() re-probes it; an edit to the app OR to a component
//     it uses busts just that program's cache, no re-stamp needed. A component is
//     compile-time source, so it lives here — the same gate on both hosts.
//
// Relative imports resolve against THIS module's URL (…/browser/) → subpath-portable.
import { bootHost } from "./host-client.js";
import { registerServiceWorker } from "./register-sw.js";
import { loadCompiler, ensureLibrary } from "./compiler-client.js";
import { loadBuild, relativize } from "./prewarm-cache.js";
import { prewarmedEntry } from "./prewarm-manifest.js";
import { isEntryPage, launchTarget } from "./serve-core.js";
import { fnv1a, isUpToDate, lookupKey } from "../compiler/dist/closure.js";
import { provideTransport, provideAssetBase } from "../runtime/dist/index.js";

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
  // The page ALREADY carries the build id: every host shell loads this bundle
  // as `declare-boot.js?v=BUILD_ID` — the cache-buster the SW sets on its
  // synthesized pages (service-worker.js hostPageResponse) and stamp-version
  // writes into index.html. Reading it off our own module URL is free.
  //
  // The fetch below is the fallback, and it is not cheap: `no-cache` forces a
  // network revalidation on EVERY boot, warm or cold, and it is SERIAL in front
  // of the prewarm lookup — the key can't be computed until the build is known.
  // On a host with ~200ms TTFB that is a round trip before anything can paint.
  //
  // Getting it wrong cannot ship a wrong program: the build id is a cache
  // NAMESPACE, never a correctness gate. The prewarm key is content-addressed
  // (prewarmKey = main + kind + props, no build) and the artifact is validated
  // by content hash besides, so prewarm is unaffected by a stale stamp. What a
  // stale one costs is CacheStorage reuse — reads and writes land in
  // `declare-compiled-<wrong>`, and pruneBuckets drops the real bucket, so the
  // next boot recompiles once. Slower, never wrong. (Verified: a deliberately
  // bogus `?v` still renders the calendar from prewarm.)
  const stamped = new URL(import.meta.url).searchParams.get("v");
  if (stamped) return stamped;
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

/** A closure entry's id back to a FETCHABLE url. The closure speaks two
 *  namespaces and they resolve against different bases — the reason a cached
 *  compile could never validate. Fetching every id as DOCUMENT-relative 404s
 *  the library entries, so `probe` reported them missing, every entry failed
 *  `isUpToDate`, and the fast path recompiled forever while writing a cache it
 *  would never accept.
 *
 *  ONE RULE now, because closure ids are deploy-relative on both producers —
 *  the browser compile (compiler-client passes the program's deploy-relative
 *  `originDir`) and `tools/internal/prewarm.mjs` (`path.relative(ROOT, id)`).
 *  Before 2026-08-13 the browser keyed an app's own includes relative to the
 *  PROGRAM and only library ids to the distro, so this needed a prefix test to
 *  tell them apart — and `library/simplelayout.declare` under a program at
 *  `/apps/weather/` had to be talked out of meaning `/apps/weather/library/…`.
 *  The main entry is still an absolute URL (boot passes `mainId`), which needs
 *  no resolving at all. */
function closureUrl(id) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(id)) return id;                 // already absolute
  return new URL(id, ROOT).href;
}

/** Re-probe one dependency, ANSWERING IN THE CURRENCY THE STORED VALIDATOR
 *  SPEAKS. A cheap HEAD reads ETag/Last-Modified with no body, and that is
 *  enough only when the stored validator carries one of them too: freshness is
 *  proven by a SHARED field, and `validatorsEqual` treats "no comparable field"
 *  as stale rather than guess. Only the main entry is recorded from an HTTP
 *  response (boot's `validatorFromResponse`); every include and library
 *  component is recorded as a content hash by the compiler, which no headers-
 *  only probe can ever match — so for those we must GET and re-hash. Skipping
 *  that is why a cached compile could never validate: the cache was written on
 *  every load and refused on every load. */
async function probe(url, stored) {
  const canHead = stored !== undefined
    && (stored.etag !== undefined || stored.lastModified !== undefined);
  try {
    if (canHead) {
      const head = await fetch(url, { method: "HEAD", cache: "no-cache" });
      if (!head.ok) return { missing: true };
      const etag = head.headers.get("etag"), lm = head.headers.get("last-modified");
      if (etag || lm) return { ...(etag ? { etag } : {}), ...(lm ? { lastModified: lm } : {}) };
    }
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) return { missing: true };
    const text = await res.text();
    const etag = res.headers.get("etag"), lm = res.headers.get("last-modified");
    // carry every field this response can answer with — the hash is the floor
    // that a hash-only stored validator needs, the headers are free alongside
    return { hash: fnv1a(text), ...(etag ? { etag } : {}), ...(lm ? { lastModified: lm } : {}) };
  } catch { return { missing: true }; }
}

async function closureFresh(closure) {
  if (!closure || !Array.isArray(closure.entries)) return false;
  const current = {};
  await Promise.all(closure.entries.map(async (e) => {
    current[e.id] = await probe(closureUrl(e.id), e.v);
  }));
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

/** `?clear` — drop EVERY Declare cache in this browser, then run.
 *
 *  Honored on an ENTRY PAGE only: `/`, or any `…/index.html`. This is a GLOBAL verb,
 *  and every program address in Declare names one program — so a flag on
 *  `calendar.declare` could not honestly mean "and every other program too." An entry
 *  page is the one address in the system that is about the HOST rather than about a
 *  program, which makes it the only honest place to put one. (Clearing a single
 *  program was tried and removed: it is not worth a URL surface.)
 *
 *  Why it exists at all. Every cache here is keyed to a platform identity and drops
 *  itself when that identity moves — the browser's buckets on BUILD_ID, the dev
 *  server's on its toolchain fingerprint — and every read re-checks the stored
 *  closure, so an ordinary stale entry is found and recompiled with nobody asking.
 *  What none of that covers is a closure that is INCOMPLETE: a compile that read a
 *  file the tracker did not record stays "fresh" forever against an edit to that
 *  file, the platform identity has not moved, and on a deployed host the only
 *  recovery was DevTools → Application → Clear storage.
 *
 *  It does NOT touch a committed BUILD (bundles/cache): a deployment artifact, not a
 *  cache. Nothing about it goes stale behind your back, and dropping it would only
 *  mean fetching the compiler to rebuild what was already correct. */

async function clearAllCaches() {
  let dropped = 0;
  try {
    for (const n of await caches.keys()) {
      if (n.startsWith("declare-compiled-") || n.startsWith("declare-assets-")) {
        await caches.delete(n);
        dropped++;
      }
    }
  } catch {}
  console.log(`[Declare] ?clear — dropped ${dropped} cache bucket(s); this load recompiles`);
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

// The grammar itself lives in serve-core.js (launchTarget), pure and therefore
// testable without a browser — test/serve-parity.test.mjs pins it.


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

// Compile ON THE SERVER, via POST /compile. The dev server stamps
// window.__declareServer on every page it emits (browser/register-sw.js); when it
// is set, the Node compiler is right there — already demand-driven over the
// component library and closure-tracking (compiler/src/include-node.ts) — so the
// browser hands it the source and gets back the compiled program without ever
// downloading the ~1 MB compiler bundle or preloading the library. A static host
// has no server, so it keeps the in-browser compile path. This is the ONE point
// where .declare handling deliberately differs between the two hosts: same request
// surface, only WHERE the compile runs. `?main=` names the program so the server
// resolves its `include`s and bare-tag library files against the right directory.
// The returned shape ({ source, deps, report }) is exactly what compileTracked
// yields for `source`/`deps`, so callers are agnostic to which path produced it.
async function serverCompile(mainUrl, source) {
  const r = await fetch("/compile?main=" + encodeURIComponent(mainUrl.pathname),
    { method: "POST", body: source, headers: { "content-type": "text/plain" } });
  return r.json();
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
    const target = launchTarget(location.href);
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
  // Resolve relative data urls against the PROGRAM's directory — and pass
  // `init` through: the transport contract is (url, init), and dropping the
  // second argument silently degraded every DataSource POST/PUT to a bare
  // GET (found 2026-07-30 by the network-browser transport tests).
  provideTransport((url, init) => fetch(new URL(url, mainDir), init));
  // The same correction for BITMAPS: an <img src> resolves against the
  // document, so a relative `source` meant the entry page's directory while
  // the app's DataSources already meant the program's. One base, both.
  provideAssetBase(mainDir.href);
  const props = { render: cfg.backend === "CanvasBackend" ? "canvas" : "dom" };
  const sVersion = perfStage("version");
  const build = await platformBuild();
  sVersion.end();
  if (isEntryPage(location.pathname) && new URLSearchParams(location.search).has("clear")) await clearAllCaches();
  pruneBuckets(build);
  const key = lookupKey(mainId, props, build);

  let program = null, deps = undefined, pageSource = null, path = "slow", toCache = null, stamp = null;

  // LOAD A BUILD — the first of the two requests this boot can make, and a
  // different question from the one below it (docs/system-design/hosting.md).
  // The manifest says whether this program ships precompiled, from a list bundled
  // into this very file — so the answer costs NO request, and a program that is
  // not on the list never asks. If it is on the list, the artifact is fetched and
  // rendered: no compiler download, no recompile, and no validation round trips.
  //
  // NOT on the dev server. There the source on disk is the truth and an edit must
  // show on the next reload, so the dev loop always resolves the source (below) —
  // the one place the two hosts genuinely differ, and they differ in WHICH REQUEST
  // IS MADE, not in what either request means.
  const relMain = relativize(mainUrl, ROOT);
  const built = window.__declareServer ? null : prewarmedEntry(relMain, props);
  if (built !== null) {
    const sPrewarm = perfStage("prewarm");
    const warm = await loadBuild({ root: ROOT, relMain, kind: "run", props, fetchImpl: fetch });
    sPrewarm.end();
    if (warm) {
      program = warm.program;
      deps = warm.deps;
      pageSource = warm.source;
      path = "prewarm";
    }
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

  // SLOW PATH — nothing precompiled to render, so compile now. TWO hosts:
  //   • dev server (window.__declareServer): POST the source to /compile and let
  //     the SERVER compile it — no compiler download, no library preload. The
  //     server recompiles on every reload (localhost round trip is sub-100ms and
  //     always fresh), so no client cache is written; the dev loop wants exactly
  //     that. This is where the two hosts diverge (serverCompile, above).
  //   • static host: compile IN-BROWSER in a module worker (off the main thread;
  //     identical output by construction), inline otherwise, and cache the result
  //     + its closure for the fast path. The auto-include library is registered as
  //     the compiler's default (ensureLibrary) so bare tags resolve with no
  //     per-call ceremony. compileTracked records the REAL closure (the main source
  //     plus every include AND every component SOURCE the host resolved — the
  //     referenced set); only the runtime/compiler bundle stays out, gated by
  //     BUILD_ID. The main entry carries the RESPONSE's validators (ETag /
  //     Last-Modified + content hash) for the cheap headers-only re-probe.
  if (program === null) {
    const onServer = !!window.__declareServer;
    const sSource = perfStage("source-fetch");
    const sCompiler = onServer ? null : perfStage("compiler+library");
    const [client, { res, source }] = await Promise.all([
      onServer ? Promise.resolve(null)
               : loadCompiler().then(ensureLibrary).then((c) => { sCompiler.end(); return c; }),
      fetch(mainUrl, { cache: "no-cache" })
        .then(async (r) => ({ res: r, source: await r.text() }))
        .then((x) => { sSource.end(); return x; }),
    ]);
    pageSource = source;
    const sCompile = perfStage("compile");
    const out = onServer
      ? await serverCompile(mainUrl, source)
      : await client.compileTracked(source, { mainId, mainValidator: validatorFromResponse(res, source), props });
    sCompile.end();
    if (!out.source) {
      // The compile's own rendered report — the ONE renderer's output (code,
      // line/col, hint), identical bytes whether the CLI, the server, or the
      // in-browser worker produced it.
      return showError(out.report || "compile failed");
    }
    program = out.source;
    deps = out.deps;                                               // static-constraint deps ride in the ONE compile result
    // Only the in-browser compile has a closure to cache; a server compile is
    // re-run each reload, so there is nothing (and no reason) to persist.
    if (!onServer) toCache = { program, deps, source, closure: out.closure };
    // The BUILD STAMP (server/create.mjs): when, from which files, by which
    // server. One console line on every load, so "is this my edit?" is
    // answered by reading, not by clearing caches — and the same record is
    // __declare.build once the app is up.
    if (out.build) {
      stamp = out.build;
      const when = new Date(stamp.at).toLocaleTimeString();
      const n = stamp.files.length;
      console.log(`[Declare] built ${when} from ${stamp.main ?? "(source)"}${n > 0 ? ` + ${n} included file${n === 1 ? "" : "s"}` : ""} · dev server pid ${stamp.server.pid} · root ${stamp.server.root}`);
    }
  }

  // Live-edit compile ("Edit this page" + demo previews). Warm-loaded in the
  // background so it never gates first paint, whichever path we took above.
  // The library default (ensureLibrary) makes a bare-tag preview (`Bar [ ]`)
  // compile with no per-call ceremony — the old "MUST feed the library or
  // previews render blank" obligation is gone by construction.
  const liveCompile = async (src) => {
    try {
      // Under the dev server, live edits compile on the server too (no compiler in
      // the browser at all); on a static host, in the in-browser worker.
      const out = window.__declareServer
        ? await serverCompile(mainUrl, src)
        : await loadCompiler().then(ensureLibrary).then((c) => c.compile(src));  // idempotent; covers the fast path, where the slow-path registration never ran
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
  // The page NAMES its demos when its producer could know them — the dev server and
  // the stub baker both read the filesystem, so they always answer, and an EMPTY
  // array is an answer: "this program has none to seed." Only a producer that
  // genuinely cannot know omits the key — the SW's browse-to-run wrapper for a bare
  // `<name>.declare` URL — and only then do we probe for the committed demos.json
  // beside the program (bake-app-stubs writes it for exactly that case).
  //
  // Reading `!demos.length` as "unknown" was the bug: it conflated "none" with "not
  // told", so every program without demo panels — every app in apps/, every program
  // an author writes in my-apps/ — probed for a file that by design would never be
  // there, and opened its console with a 404. Only apps/homepage has a demos.json.
  let demos = Array.isArray(cfg.demos) ? cfg.demos : null;
  if (demos === null) {
    try { const j = await (await fetch(new URL("demos.json", mainDir), { cache: "no-cache" })).json(); demos = Array.isArray(j) ? j : []; } catch { demos = []; }
  }
  if (demos.length) {
    const sDemos = perfStage("demo-seeds");
    await Promise.all(demos.map(async (name) => {
      try { seeds[name] = await (await fetch(new URL("demos/" + name + ".declare", mainDir), { cache: "no-cache" })).text(); } catch {}
    }));
    sDemos.end();
  }
  const demoBase = new URL("demos/", mainDir).href;              // where mountPreviews fetches unseeded previews

  // LOAD A BUILD, for ISLANDS — the page boot's first request, offered to the
  // host's preview mounts: a slot path naming a program that ships precompiled
  // mounts with NO compiler and NO compile, so the app-in-a-window case (a
  // desktop window hosting apps/calendar) opens instantly even on a cold static
  // visit where the compiler bundle hasn't landed. The manifest answers "is
  // there a build?" with no request, so a preview of an ordinary program — the
  // common case — costs nothing here and goes straight to live-compile. Islands
  // always render on the DOM backend (renderChild), so the key uses render:dom
  // regardless of the page's own backend; on the dev server there is no build
  // request at all, for the same reason the page boot makes none.
  const ISLAND_PROPS = { render: "dom" };
  const prewarmChild = async (name) => {
    try {
      const u = new URL(name + ".declare", demoBase);
      const rel = relativize(u, ROOT);
      if (!rel) return null;
      if (window.__declareServer || prewarmedEntry(rel, ISLAND_PROPS) === null) return null;
      const warm = await loadBuild({ root: ROOT, relMain: rel, kind: "run", props: ISLAND_PROPS, fetchImpl: fetch });
      return warm ? { source: warm.program, deps: warm.deps } : null;
    } catch { return null; }
  };

  const sRender = perfStage("render");
  let app;
  try {
    app = await bootHost({                                         // render first — nothing below delays first paint
      source: program, deps, backend: cfg.backend,
      host: cfg.host,                                              // an explicit mount element — several apps per page, each in its own marked div
      location: cfg.location,
      mainAssetBase: mainDir.href,                                 // per-app asset AND data base — N tenants, each its own program dir
      pageWeight: cfg.pageWeight, sourceLines: cfg.sourceLines,
      seeds, demoBase, compile: liveCompile, prewarm: prewarmChild,
    });
  } catch (e) {
    // A RUNTIME boot failure gets the same banner a compile error does — a
    // blank page with an empty console is the one outcome this page must
    // never produce (field report 2026-08-21: all five builders saw it).
    console.error("[Declare] boot failed:", e);
    return showError("boot failed — the program compiled but did not come up:\n\n" + ((e && e.stack) || e));
  }
  sRender.end();
  // The stamp lands on the bridge (runtime/src/inspect.ts declares the slot;
  // only a host that compiled can fill it).
  if (stamp !== null && window.__declare) window.__declare.build = stamp;
  // The number every stage leads to: the first frame the compositor PAINTS
  // after render (double-rAF — the second callback runs after the first
  // frame's paint has been committed).
  const sFrame = perfStage("first-frame");
  requestAnimationFrame(() => requestAnimationFrame(() => { sFrame.end(); perfDone(path); }));
  if (toCache) await writeCache(build, key, toCache);              // durable before we signal readiness
  window.__declareBoot = { path, build, key };                     // freshness/debug signal (also aids the SW)
  // Warm the compiler + library for the first live edit — but ONLY on a static
  // host. Under the dev server, live edits compile on the server (serverCompile),
  // so pulling the compiler bundle here would defeat the whole point.
  //
  // `?warm=0` turns it off, so the cost can be MEASURED rather than argued about.
  // What it costs is real and was not visible until it was instrumented: the
  // fetch starts at the first frame (measured on the live site: first-frame and
  // compiler-worker both at 628 ms on the homepage, 319 ms on the calendar), so it
  // is not deferred behind the page's own content — it beat the hero video by 5 ms
  // — and it pulls 1.21 MB of compiler plus 78 KB of library onto pages whose
  // programs are precompiled precisely so that no compiler is needed. Against that,
  // it buys a first edit that answers in ~322 ms instead of ~700+.
  //
  // The switch exists because those two numbers are the whole argument and neither
  // was measurable before. It is a boot knob, not a compile modifier: it changes
  // WHEN the compiler is fetched, never what a compile produces.
  const warm = new URLSearchParams(location.search).get("warm");
  if (!window.__declareServer && warm !== "0" && warm !== "false") {
    loadCompiler().then(ensureLibrary).catch(() => {});
  }
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
