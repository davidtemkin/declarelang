# Running & hosting

Declare runs the same build two ways.

## Dynamic (dev server)

`npm start` runs `server/index.mjs`. It serves the tree and compiles each example's
`.declare` on request (`/examples/<name>/` for DOM, `/examples/<name>/canvas` for
Canvas). Compile-on-request means an edit + reload shows immediately. That is the
server's entire job — no chat, no persistent connection, no data API.

## Static hosting (GitHub Pages)

The whole tree is served from a dumb static host (GitHub Pages, `.nojekyll`) with no
Node and no compiler on the critical path. Every path is relative, so it is
subpath-portable — a project page under `/<repo>/` resolves everything the same.

The model is **precompile-by-default, verify-in-the-background**:

1. **Render now.** `tools/prebuild.mjs` compiles each `examples/<name>/<name>.declare`
   into a committed artifact (`examples/<name>/prebuilt/<name>.js`) — the compiled
   program, the demo previews (site), the auto-include library, and the compile's
   **dependency closure**. The page (`index.html` for the site; a generated
   `examples/<name>/index.html` for the rest) loads it via `web/boot-static.js` and
   renders instantly. Previews are present and running at load time.
2. **Freshness — no compiler needed.** `boot-static.js` re-probes the baked closure:
   each dependency is re-fetched and hashed, and `closure.js`'s `isUpToDate()`
   compares against the validators baked at prebuild. This is a pure ~4.6 KB module
   (BigInt only) — it answers "is the source newer than the artifact?" without
   TypeScript. On a static host there is no mtime, so the validator is a content
   hash (the universal floor); the same closure model degrades to ETag/Last-Modified
   where a host supplies them.
3. **Warm-load the compiler in the background.** The in-browser compiler
   (`dist-browser/declare-compiler.js`, ~1 MB gzipped — the Declare core plus the
   TypeScript expression parser `free-idents` needs, bundled by
   `tools/build-compiler.mjs`) is `import()`ed lazily, even if never used. It is
   needed only to (a) recompile when step 2 reports the source moved, or (b) serve a
   live edit ("Edit this page", the demo editors). In the common case it is never
   touched.

`compile()` is parameterized by an `IncludeHost`; the browser front-end
(`compiler/compile-browser.ts`) injects a **synchronous in-memory host** over a
prefetched file map (fetch is async, the include seam is sync — so the fixed library
set is prefetched up front). It runs **without typecheck**, exactly like the dev
server's `POST /compile`, so tsc's program/checker never enters the bundle — only the
parser does.

### Remaining (Phase 3)

A **service worker** that lets you browse *arbitrary* `/examples/<name>/` — and any
`.declare` — offline: intercept the request, compile in-browser, serve the host page,
cache for offline. The precompiled artifacts already cover the shipped examples; the
SW generalizes it to anything and adds an offline cache.

## Why the parser lives in `runtime/`, not `compiler/`

In OpenLaszlo the parser was compiler-only (server-side Java); the runtime just ran
precompiled JS. neo differs fundamentally: it instantiates and compiles in the
browser, so the parser/checker/schema are part of the runtime foundation. `compiler/`
is only the Node-side orchestration layered on top, with a one-way dependency on
`runtime/`.
