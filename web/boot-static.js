// web/boot-static.js — boot a Declare page on a DUMB static host (GitHub Pages)
// from a committed precompiled artifact, with the "load the fast thing, verify in
// the background" model:
//
//   1. RENDER NOW from the artifact — no compiler, no network round-trip.
//   2. FRESHNESS (pure, no TypeScript): re-probe the compile's dependency CLOSURE
//      (closure.js — 4.6 KB, zero-dependency). Each dep is re-fetched and hashed;
//      isUpToDate() compares against the validators baked at prebuild. This is the
//      whole "is the source newer than the artifact" question, and it needs the
//      compiler for NONE of it.
//   3. WARM-LOAD the in-browser compiler (~1 MB) in the background — even if never
//      used. It is needed ONLY to (a) recompile when step 2 says the source moved,
//      or (b) serve live edits ("Edit this page", the demo editors). Off the
//      critical path by construction.
//
// All sibling assets import RELATIVE to THIS module's URL (…/web/), so the whole
// tree is subpath-portable — a project page under /<repo>/ resolves them the same.
import { bootHost } from "./host-client.js";
import { registerServiceWorker } from "./register-sw.js";
import { fnv1a, isUpToDate } from "../compiler/dist/closure.js";

// Repo root as an absolute URL, derived from this module's own location (…/web/ →
// one up). Closure entry ids are root-relative, so this makes the freshness fetch
// work identically for the root homepage and a per-example page deeper in the tree.
const ROOT = new URL("../", import.meta.url);

// Lazy, memoized import of the 1 MB compiler bundle — the background warm-load and
// a stale recompile share the one download.
let compilerPromise = null;
const loadCompiler = () => (compilerPromise ??= import("../dist-browser/declare-compiler.js"));

/** Re-probe every dependency in the baked closure and report whether the artifact
 *  is still current. Pure: fetch + FNV-1a + closure.isUpToDate — no compiler. */
async function isArtifactFresh(closure) {
  const current = {};
  await Promise.all(closure.entries.map(async (e) => {
    try {
      const res = await fetch(new URL(e.id, ROOT), { cache: "no-cache" });
      current[e.id] = res.ok ? { hash: fnv1a(await res.text()) } : { missing: true };
    } catch {
      current[e.id] = { missing: true };
    }
  }));
  return isUpToDate(closure, closure.props, (e) => current[e.id] ?? { missing: true });
}

/**
 * @param artifact the default export of examples/<name>/prebuilt/<name>.js
 * @param artifact.library {{manifest,files}} prefetched auto-include set for in-browser compiles
 * @param artifact.closure the dependency closure for the freshness check
 * @param artifact.mainId  root-relative URL of the page's own .declare (recompiled if stale)
 */
export default async function boot(artifact) {
  // Register the distro Service Worker (cache-busting + browse-to-`.declare`). Fire-and-forget:
  // it must not gate first render, and a failure (e.g. plain-http LAN IP) is non-fatal.
  registerServiceWorker();

  const lib = artifact.library ?? {};

  // 1 — render immediately from the artifact; edits keep the last render until (2) swaps the compiler in.
  let app = await bootHost({ ...artifact, compile: async () => null });

  // 2 — warm-load the compiler in the background, then hot-swap it in so edits go live.
  loadCompiler()
    .then(({ compile }) =>
      app.__setCompile(async (src) => { try { return compile(src, lib).source ?? null; } catch { return null; } }))
    .catch(() => {});

  // 3 — freshness: if a dependency moved since prebuild, recompile the page in-browser
  //     and re-boot from the fresh output. (In production the artifact ships WITH its
  //     sources, so this only fires in local dev between an edit and the next prebuild.)
  if (artifact.closure && artifact.mainId) {
    isArtifactFresh(artifact.closure).then(async (fresh) => {
      if (fresh) return;
      console.warn("[Declare] source changed since prebuild — recompiling in-browser (run `node tools/prebuild.mjs` to refresh the committed artifact).");
      try {
        const [{ compile }, pageSource] = await Promise.all([
          loadCompiler(),
          fetch(new URL(artifact.mainId, ROOT), { cache: "no-cache" }).then((r) => r.text()),
        ]);
        const out = compile(pageSource, { ...lib, originDir: dirOf(artifact.mainId) });
        if (!out.source) { console.warn("[Declare] in-browser recompile failed:", out.errors?.map((e) => e.message)); return; }
        app.__teardown?.();                                   // stop the stale boot's rAF loops + listeners
        document.getElementById("host").innerHTML = "";
        app = await bootHost({
          ...artifact, source: out.source,
          seeds: { ...(artifact.seeds ?? {}), __page__: pageSource }, // editor shows the fresh source
          compile: async () => null,
        });
        loadCompiler().then(({ compile }) =>
          app.__setCompile(async (src) => { try { return compile(src, lib).source ?? null; } catch { return null; } }));
      } catch (e) { console.warn("[Declare] recompile error:", e); }
    }).catch(() => {});
  }

  return app;
}

/** Directory of a root-relative file id, for originDir on a recompile. */
function dirOf(id) {
  const i = id.lastIndexOf("/");
  return i < 0 ? "" : id.slice(0, i);
}
