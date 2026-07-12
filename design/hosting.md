# Running & hosting

Declare turns source into a running app **three ways** — the dev server compiles on
request, `declarec` precompiles ahead of time, and the browser compiles in-page. All
three share **one compiler** (the parser/checker/schema in `runtime/`) and **one flag
model** (`compiler/src/flags.ts`, §Compile flags); only the surface differs.

## Dynamic (dev server)

`npm start` runs `server/index.mjs`. It serves the tree and compiles each example's
`.declare` on request (`/examples/<name>/` for DOM, `/examples/<name>/canvas` for
Canvas). Compile-on-request means an edit + reload shows immediately. That is the
server's entire job — no chat, no persistent connection, no data API.

The server also exposes the **production** artifact at `/examples/<name>/prod` (and
`/prod-canvas`): the same `declarec` output (below), built once and cached on disk.
`ensureProdBuild` keys the cache by a hash of the source + toolchain fingerprint and
partitions it per backend and per slim/full (`.prod-cache`, `.prod-cache-canvas`,
`.prod-cache-full`), so each flag combination is a distinct artifact and a repeat
request is a straight cache hit. URL query flags (`?slim=0`, `?backend=canvas`) steer
it. And `POST /compile` is the live delegate the playground/editors hit — source in,
app JS out, no typecheck.

## Production build (declarec)

`tools/declarec.mjs` is the ahead-of-time build — the analogue of `lzc`. It
precompiles the app once (`compiler/dist/declarec.js`: parse + resolve + typecheck →
a serializable program), embeds it as a JSON string (parsed at boot; far faster than
re-parsing source, and position-stripped by default), and bundles the runtime's
**run-path only** with esbuild — the parser and typechecker are tree-shaken out. The
output is a self-contained `dist/` (an `index.html`, a content-hashed `app.<hash>.js`,
copied data assets) deployable to any dumb static host. `buildProduction()` is
exported so the dev server produces (and caches) the identical artifact on demand.

**Registry slimming** rides on this build: only the component classes the app can
instantiate are bundled; the rest — most importantly the whole rich-text engine
(`markdown.ts`/`md.ts`/`html.ts`) — are dropped. See §Slimming.

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

### Browse-to-run (service worker)

A **service worker** generalizes this to *arbitrary* `.declare` files: it intercepts a
top-level navigation to a `.declare`, serves a tiny host page, and `web/boot-declare.js`
fetches the source, compiles it with the in-browser compiler bundle, and renders — no
server, no build step. It's the same `compile()` as `POST /compile`, over a prefetched
in-memory host, without typecheck. Cache-busting is content-hash driven (`BUILD_ID`,
`tools/stamp-version.mjs`). This is the third compilation surface; because nothing is
bundled ahead of time, the production-only flags (`slim`, `prod`) don't apply — only
the render backend does (`?backend=canvas`).

## Compile flags

`compiler/src/flags.ts` is the single `CompileFlags` model — `backend` (dom/canvas),
`prod`, `slim`, `stripPos`, `typecheck` — with `DEFAULT_FLAGS` and two parsers:
`parseFlags(URLSearchParams-like)` for the server and browser URL queries, and
`parseArgvFlags(argv)` for the CLI. So `?slim=0` on the server, `--no-slim` on the CLI,
and the browser's `?backend=canvas` all resolve through one place — no per-entry-point
drift. Booleans read `?f`/`?f=1`/`?f=true` (on) and `?f=0`/`false` (off); the CLI spells
them `--f`/`--no-f`, with `--canvas`/`--dom`, `--full` (= `--no-slim`), and `--keep-pos`
aliases.

## Slimming

The production registry (`runtime/src/registry.ts`) is the name→class tables extracted
out of `instantiate.ts` — extracting them is what lets esbuild drop an unused class,
since the old static tables hard-referenced every one. `declarec` substitutes a **slim**
`registry.js` (only the used classes) via an esbuild `onLoad` plugin, so the modules
reachable only through a dropped class fall away with it.

The **used-set** (`usedComponentNames`, `compiler/src/declarec.ts`) is: static tree refs
(`referencedTags`, including component-valued members) ∪ class bases ∪ the root's own tag
∪ `{ }`-body `new X()` (a free-identifier scan) ∪ the `use` list. It is sound because
Declare has no reflective construct-by-value — every construction path is a compile-time
literal. `use [ … ]` is the top-level keep-list escape hatch for the one thing static
analysis can't see: a component built by name / from data with no static reference (see
[instantiation.md](instantiation.md) §8). On the flagship calendar, slimming drops the
rich-text engine for ~7.9 KB gzipped (9 of 18 runtime components kept). Rich text is the
only class large-and-optional enough to matter today; the mechanism is general for any
future one.

## Why the parser lives in `runtime/`, not `compiler/`

In OpenLaszlo the parser was compiler-only (server-side Java); the runtime just ran
precompiled JS. neo differs fundamentally: it instantiates and compiles in the
browser, so the parser/checker/schema are part of the runtime foundation. `compiler/`
is only the Node-side orchestration layered on top, with a one-way dependency on
`runtime/`.
