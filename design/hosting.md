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

The model is **compile-in-the-browser, cache the output, closure-check freshness**
(`web/boot-uniform.js` — the deployed `.declare` source is the single source of
truth; there is no per-app precompiled artifact to fall stale):

1. **Fast path.** The compiled program is cached in CacheStorage, keyed by the
   platform `BUILD_ID` + the app's identity. On load, the cached compile's
   **dependency closure** is re-probed (a cheap headers-first revalidation of the
   app's own sources; `closure.js isUpToDate()`) — still fresh → render at once,
   no compiler, no compile. ~130 ms to a painted app on a real CDN.
2. **Slow path** (first visit, or the source moved): download the in-browser
   compiler, compile — **the full compile, typecheck included, identical to every
   other surface** — render, and cache the result with its closure. The compile
   runs in a module **worker** (`web/compile-worker.js` behind
   `web/compiler-client.js`), off the main thread, byte-identical by construction.
3. **Live edits** ("Edit this page", the demo previews) ride the same compiler
   client, warm-loaded in the background off the paint path.

### The platform bundles — one path, freshness by construction

The page loads the platform as **one file**: `dist-browser/declare-boot.js`
(~58 KB gz, `tools/build-boot.mjs`) — the whole boot graph (web client +
compiler client + the runtime run-path, ~50 modules) bundled, so a load makes one
platform request instead of fifty. The in-browser compiler
(`dist-browser/declare-compiler.js`, ~1 MB gz, `tools/build-compiler.mjs` — the
Declare core + TypeScript + the embedded `lib.d.ts` closure) stays a separate,
**lazily** fetched artifact — slow path and live edits only.

Every `index.html` imports the boot bundle — dev and deploy, **one path, no
mode**. What makes that viable is that bundle staleness is structurally
impossible rather than remembered about (`tools/bundle-freshness.mjs`, one rule:
any input newer than the artifact → rebuild):

- **at commit** — the pre-commit hook (`tools/hooks/pre-commit` →
  `stamp-version.mjs`) rebuilds any stale bundle *before* hashing the
  `BUILD_ID`, then stages it: a commit cannot ship a bundle older than its
  inputs;
- **in dev** — the dev server rebuilds a stale bundle **on demand** when the
  artifact is requested, so an edit to the runtime or web client is live on the
  next refresh with no manual step.

Those two are the only serving paths — the dev server locally, the committed
tree deployed — so there is no manual rebuild case at all.

The unbundled `web/*.js` + `runtime/dist/*.js` modules remain in the tree (the
bundles are a *transport*, not a fork): tests, the dev server's own pages, and
tooling import them directly.

Nothing in the platform is ever *probed* for freshness at load: the runtime,
the bundles, and the library are fixed at platform build time and gated
wholesale by `BUILD_ID` (the OL5 LFC model) — an app's closure records **its own
sources only**.

`compile()` is parameterized by an `IncludeHost`; the browser front-end
(`compiler/compile-browser.ts`) injects a **synchronous in-memory host** over a
prefetched file map (fetch is async, the include seam is sync — so the fixed
library set is prefetched up front and registered once as the compiler's
default, `setDefaultLibrary`).

### Browse-to-run (service worker)

A **service worker** generalizes this to *arbitrary* `.declare` files: it intercepts a
top-level navigation to a `.declare`, serves a tiny host page, and `web/boot-declare.js`
fetches the source, compiles it with the one compiler client (worker when available),
and renders — no server, no build step. It's the same full `compile()` as every other
surface, typecheck included. Cache-busting is content-hash driven (`BUILD_ID`,
`tools/stamp-version.mjs`). This is the third compilation surface; because nothing is
bundled ahead of time, the production-only flags (`slim`, `prod`) don't apply — the
render backend (`?backend=canvas`) and `?typecheck=0` do.

## Compile flags

`compiler/src/flags.ts` is the single `CompileFlags` model — `backend` (dom/canvas),
`prod`, `slim`, `stripPos`, `typecheck` — with `DEFAULT_FLAGS` and two parsers:
`parseFlags(URLSearchParams-like)` for the server and browser URL queries, and
`parseArgvFlags(argv)` for the CLI. So `?slim=0` on the server, `--no-slim` on the CLI,
and the browser's `?backend=canvas` all resolve through one place — no per-entry-point
drift. Every flag is named the same way on all three surfaces (the canonical
`CompileFlags` field): booleans read `?f`/`?f=1`/`?f=true` (on) and `?f=0`/`false`
(off) and the CLI spells them `--f`/`--no-f` (so `stripPos` is `?stripPos=0` /
`--no-strip-pos`); `--canvas`/`--dom` and `--full` (= `--no-slim`) are kept aliases.
A single `FLAG_SPECS` registry is the source both parsers derive from.

## Request types

Orthogonal to *how* a source compiles (the flags above) is *what* a URL returns for
it — the **request type** (`compiler/src/reqtypes.ts`), modeled on OpenLaszlo's `lzt`.
`requestType(URLSearchParams-like)` reads `?view=…`: `run` (the app, the default),
`source` (the syntax-highlighted source with block comments as Markdown), or
`segments` (that view's JSON on its own). `?source`/`?segments` are bare shorthands.
The server (`server/index.mjs`) applies it on both the `examples/<name>/` route and any
`.declare` file path; `SOURCE` boots the code viewer (`examples/codeviewer`) seeded
with the segments, `SEGMENTS` returns them as JSON.

The highlighter is `compiler/src/highlight.ts` — a source-faithful scan that reuses the
language's own lexical shape (strings, `{ }` bodies captured whole, triple-quotes,
datapaths, comments), so it classifies exactly what the compiler tokenizes and a `{ }`
body's contents (regex included) never corrupt the scan. It splits a file into prose
segments (Markdown lifted from `/* */` comments) and code segments (`<pre>` HTML with a
role class per token, coloured by the viewer's theme-aware `accents`). It runs live on
the server route and ahead of time via `declarec --highlight` (→ a `.highlight.json`).
Block comments are lexer trivia (`parser.ts`), so literate `.declare` files — prose in
comments, code between — both compile and view.

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
