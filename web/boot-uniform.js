// web/boot-uniform.js — UNIFORM browser-compile boot for a dumb static host
// (GitHub Pages). The deployed `.declare` SOURCE is the single source of truth:
// there is no committed precompiled artifact. This is the browser counterpart
// closure.ts calls "deferred" — it does what the OL5 static-deploy client does
// (compiler/src/browser.ts + cache-browser.ts): compile once, cache the compiled
// program in the browser, and on every later load REUSE the cache unless a
// dependency changed.
//
//   FAST PATH  (cache hit + closure still fresh): render the cached compiled
//              program immediately — NO compiler download, NO recompile, one
//              cheap conditional HEAD to revalidate. As fast as the old
//              precompiled-artifact path.
//   SLOW PATH  (no cache, or the source changed): fetch source (+ the auto-
//              include library), compile IN-BROWSER, render, and write the
//              compiled program + its dependency CLOSURE back to the cache.
//
// Two independent freshness gates, exactly mirroring OL5:
//   • PLATFORM — BUILD_ID (web/version.json), the content hash the commit hook
//     (tools/stamp-version.mjs) stamps over runtime + compiler bundle + web
//     client + library. It NAMES the cache bucket AND salts the key, so any
//     platform/runtime/library change drops every cached compile at once (old
//     buckets pruned on boot). The runtime is gated ONLY here — never in a
//     per-app closure — just as OL5 keeps the LFC out of the closure.
//   • APP SOURCE — the compile's dependency CLOSURE, each entry an ETag /
//     Last-Modified / FNV-1a-hash validator (closure.ts). isUpToDate() re-probes
//     it; an edit busts just that program's cache, no re-stamp needed.
//
// Relative imports resolve against THIS module's URL (…/web/) → subpath-portable.
import { bootHost } from "./host-client.js";
import { registerServiceWorker } from "./register-sw.js";
import { fnv1a, isUpToDate, lookupKey } from "../compiler/dist/closure.js";

const ROOT = new URL("../", import.meta.url);

// Lazy, memoized ~1 MB compiler — a SLOW-path compile and the background warm-load
// (for live edits) share the one download.
let compilerPromise = null;
const loadCompiler = () => (compilerPromise ??= import("../dist-browser/declare-compiler.js"));

// Platform version the commit hook stamps. Absent (un-stamped dev tree) → "dev":
// the closure check alone still gates freshness. Salts the key + names the bucket.
async function platformBuild() {
  try {
    const r = await fetch(new URL("web/version.json", ROOT), { cache: "no-cache" });
    if (r.ok) return (await r.json()).build || "dev";
  } catch {}
  return "dev";
}

// The auto-include library, prefetched for a SLOW-path compile: the manifest (bare
// tag → file) plus EVERY src file listed in library/index.json — so both bare tags
// (`Bar [ ]`) and bare includes (`include [ "x.declare" ]`, resolved along the
// search path's library root) work in-browser, mirroring the Node fs host. Falls
// back to the manifest's files if the index is absent. NOT recorded in the closure —
// the whole library is under BUILD_ID, so a bucket change already covers it.
async function loadLibrary() {
  try {
    const [manifest, index] = await Promise.all([
      fetch(new URL("library/autoincludes.json", ROOT), { cache: "no-cache" }).then((r) => r.json()),
      fetch(new URL("library/index.json", ROOT), { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const names = Array.isArray(index) ? index : Object.values(manifest);
    const files = {};
    await Promise.all(names.map(async (rel) => {
      const res = await fetch(new URL("library/src/" + rel, ROOT), { cache: "no-cache" });
      if (res.ok) files["library/src/" + rel] = await res.text();
    }));
    return { manifest, files };
  } catch { return { manifest: {}, files: {} }; }
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

/**
 * @param cfg {{
 *   main: string,                  // page's .declare, relative to the page (e.g. "./calendar.declare")
 *   backend?: "DomBackend"|"CanvasBackend",
 *   pageWeight?: number, sourceLines?: number,
 *   demos?: string[],              // (site) demo names under <main-dir>/demos/<name>.declare to seed
 * }}
 */
export default async function boot(cfg) {
  registerServiceWorker();

  const mainUrl = new URL(cfg.main, location.href);
  const mainId = mainUrl.href;
  const mainDir = new URL(".", mainUrl);                          // app-relative assets (demos) live here
  const props = { backend: cfg.backend === "CanvasBackend" ? "canvas" : "dom" };
  const build = await platformBuild();
  pruneBuckets(build);
  const key = lookupKey(mainId, props, build);

  let program = null, pageSource = null, path = "slow", toCache = null;

  // FAST PATH — a cached compile whose closure still validates.
  const cached = await readCache(build, key);
  if (cached && (await closureFresh(cached.closure))) {
    program = cached.program;
    pageSource = cached.source;
    path = "fast";
  }

  // SLOW PATH — compile in-browser and cache the result + its closure.
  if (program === null) {
    const [{ compile }, res, lib] = await Promise.all([
      loadCompiler(),
      fetch(mainUrl, { cache: "no-cache" }),
      loadLibrary(),
    ]);
    const source = await res.text();
    const out = compile(source, { files: lib.files, manifest: lib.manifest });
    if (!out.source) {
      return showError((out.errors || []).map((e) => (e.pos?.line != null ? `line ${e.pos.line}: ` : "") + e.message).join("\n") || "compile failed");
    }
    program = out.source;
    pageSource = source;
    // Closure = the main source only (every current example is single-file; its
    // library/runtime deps are gated by BUILD_ID, like OL5's LFC). A future app that
    // `include`s another app-source file needs a browser compileTracked to record it.
    const closure = { entries: [{ id: mainId, kind: "file", v: validatorFromResponse(res, source) }], props };
    toCache = { program, source, closure };                        // written AFTER render, below (off the paint path)
  }

  // Live-edit compile ("Edit this page" + demo previews). Warm-loaded in the
  // background so it never gates first paint, whichever path we took above.
  const liveCompile = async (src) => {
    try { const { compile } = await loadCompiler(); return compile(src, {}).source ?? null; }
    catch { return null; }
  };

  const seeds = { __page__: pageSource };
  if (Array.isArray(cfg.demos) && cfg.demos.length) {              // (site) seed demo editors; previews compile in-browser
    await Promise.all(cfg.demos.map(async (name) => {
      try { seeds[name] = await (await fetch(new URL("demos/" + name + ".declare", mainDir), { cache: "no-cache" })).text(); } catch {}
    }));
  }

  const app = await bootHost({                                     // render first — nothing below delays first paint
    source: program, backend: cfg.backend,
    pageWeight: cfg.pageWeight, sourceLines: cfg.sourceLines,
    seeds, compile: liveCompile,
  });
  if (toCache) await writeCache(build, key, toCache);              // durable before we signal readiness
  window.__declareBoot = { path, build, key };                     // freshness/debug signal (also aids the SW)
  loadCompiler().catch(() => {});                                  // warm the compiler for the first live edit
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
