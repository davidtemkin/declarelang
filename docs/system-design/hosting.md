# Running & hosting

Declare turns source into a running app **three ways** — the dev server compiles on
request, `declarec` precompiles ahead of time, and the browser compiles in-page. All
three share **one compiler** (the parser/checker/schema in `runtime/`) and **one flag
model** (`compiler/src/flags.ts`, §Compile flags); only the surface differs.

## Dynamic (dev server)

`npm start` runs `server/index.mjs`. It serves the tree and compiles each example's
`.declare` on request — the program URL is the address (`…/<name>.declare`), with
`?render=canvas` for the Canvas backend. Compile-on-request means an edit + reload shows
immediately. That is the server's entire job — no chat, no persistent connection, no
data API.

The server also builds the standalone **build** artifact on demand and serves it at
`/build/<name>/` (a `?build` request redirects there): the same `declarec` output
(below), built once and cached on disk. `ensureProdBuild` keys the cache by a hash of
the source + toolchain fingerprint, partitioned per render backend (`.prod-cache`,
`.prod-cache-canvas`), so a repeat request is a straight cache hit. The `?render=canvas`
modifier selects the backend (the old `/prod-canvas` address is gone — canvas is a
modifier now, not a second path). And `POST /compile` is the live delegate the
playground/editors hit — source in, app JS out, typechecked like every other compile.

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
(`browser/boot-uniform.js` — the deployed `.declare` source is the single source of
truth; there is no per-app precompiled artifact to fall stale):

1. **Fast path.** The compiled program is cached in CacheStorage, keyed by the
   platform `BUILD_ID` + the app's identity. On load, the cached compile's
   **dependency closure** is re-probed (a cheap headers-first revalidation of the
   app's own sources; `closure.js isUpToDate()`) — still fresh → render at once,
   no compiler, no compile. ~130 ms to a painted app on a real CDN.
2. **Slow path** (first visit, or the source moved): download the in-browser
   compiler, compile — **the full compile, typecheck included, identical to every
   other surface** — render, and cache the result with its closure. The compile
   runs in a module **worker** (`browser/compile-worker.js` behind
   `browser/compiler-client.js`), off the main thread, byte-identical by construction.
3. **Live edits** ("Edit this page", the demo previews) ride the same compiler
   client, warm-loaded in the background off the paint path.

### The platform bundles — one path, freshness by construction

The page loads the platform as **one file**: `bundles/declare-boot.js`
(~58 KB gz, `tools/internal/build-boot.mjs`) — the whole boot graph (web client +
compiler client + the runtime run-path, ~50 modules) bundled, so a load makes one
platform request instead of fifty. The in-browser compiler
(`bundles/declare-compiler.js`, ~1 MB gz, `tools/internal/build-compiler.mjs` — the
Declare core + TypeScript + the embedded `lib.d.ts` closure) stays a separate,
**lazily** fetched artifact — slow path and live edits only.

Every `index.html` imports the boot bundle — dev and deploy, **one path, no
mode**. What makes that viable is that bundle staleness is structurally
impossible rather than remembered about (`tools/internal/bundle-freshness.mjs`, one rule:
any input newer than the artifact → rebuild):

- **at commit** — the pre-commit hook (`tools/internal/hooks/pre-commit` →
  `stamp-version.mjs`) rebuilds any stale bundle *before* hashing the
  `BUILD_ID`, then stages it: a commit cannot ship a bundle older than its
  inputs;
- **in dev** — the dev server rebuilds a stale bundle **on demand** when the
  artifact is requested, so an edit to the runtime or web client is live on the
  next refresh with no manual step.

Those two are the only serving paths — the dev server locally, the committed
tree deployed — so there is no manual rebuild case at all.

The unbundled `browser/*.js` + `runtime/dist/*.js` modules remain in the tree (the
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

**The program URL is the app's canonical address** — the OpenLaszlo model
(`…/calendar.lzx?lzt=…`), identical on the dev server and on a static host once
the service worker is installed:

| request on `…/app.declare` | you get |
|---|---|
| a top-level **navigation** (no params) | the RUNNING app, in a generated wrapper |
| `?view=reader` / `?view=source` / `?view=edit` | the **viewer** app on that tab (literate reader / verbatim source / live edit) |
| `?segments` | the reader's highlight data as JSON |
| `?extract` | the **static extraction** document — content as semantic HTML (`text/html`) |
| `?file` | the EXACT source file (the bytes, `text/plain`) |
| `?render=canvas`, `?crawler` | the same orthogonal modifiers as everywhere |
| a **fetch** of the same URL (an include, the viewer, `curl`) | the source bytes (`text/plain`) |

The navigate/fetch discrimination is the service worker's own (a top-level
navigation vs a subresource request); the dev server applies the identical rule
(`Sec-Fetch-Mode`), so a person and a program each get the representation they
mean at one URL. Both hosts serve the SAME wrapper — a tiny shell booting the
platform bundle with `main` = the program's own URL (the page's address IS the
`.declare`, so the program's relative resources resolve against its directory
for free) — which means browse-to-run rides the same **cached-output +
closure-freshness** path as the app index pages: a revisit renders from cache
after a HEAD re-probe of the source, no compiler, no recompile. The one
irreducible gap is the very first visit to a bare static host, before the SW
exists — a dumb host can serve only bytes, which is why the directory URL
remains the address you publish.

Cache-busting is content-hash driven (`BUILD_ID`, `tools/internal/stamp-version.mjs`).
Because nothing is bundled ahead of time on this path, the `build` request doesn't
apply here — this path only *runs* — while the `render` modifier does, and typecheck
is always on.

## Compile flags

`compiler/src/flags.ts` is the single `CompileFlags` model — exactly **two modifiers**,
`render` (dom/canvas) and `seo` — with `DEFAULT_FLAGS` and two parsers:
`parseFlags(URLSearchParams-like)` for the server and browser URL queries, and
`parseArgvFlags(argv)` for the CLI. So `?render=canvas` on the server, `--render canvas`
(or `--canvas`) on the CLI, and the browser's `?render=canvas` all resolve through one
place — no per-entry-point drift. Every modifier is named the same way on all three
surfaces (the canonical `CompileFlags` field): booleans read `?f`/`?f=1`/`?f=true` (on)
and `?f=0`/`false` (off) and the CLI spells them `--f`/`--no-f`; `--canvas`/`--dom` are
kept aliases. A single `FLAG_SPECS` registry is the source both parsers derive from.

The former knobs `slim`, `stripPos`, `prod`, and `typecheck` are **not** modifiers
(docs/system-design/requests.md §"Removed knobs"): a `build` always slims and strips positions (the
escape hatch is `declarec --debug`, which keeps the full registry and source positions);
`prod` became the `build` request (§Request types); and typecheck is a mandatory phase
of the one compile — always on, no URL/CLI flag. The compiler's *internal* options still
carry `stripPos`/`typecheck` (the `build` act sets them, and tooling can still pass
`{ typecheck: false }` in a JS `compile()` call); only the externally-named FLAG surface
is the two modifiers.

## Request types

Orthogonal to *how* a source compiles (the modifiers above) is *what* a URL returns
for it — the **request type** (`compiler/src/reqtypes.ts`), modeled on OpenLaszlo's
`lzt`, exactly one per URL. `requestType(URLSearchParams-like)` reads them: `run` (the
app, the default, no param); `build` (`?build` → the standalone deployable, served at a
directory address); the three viewer tabs `?view=reader` / `?view=source` / `?view=edit`
(the literate reader; the verbatim source shown *in* the viewer; the live-edit
workbench); `file` (`?file` → the exact source bytes, `text/plain`); `segments`
(`?segments` → the reader's highlight JSON on its own); and `extract` (`?extract` → the
static-extraction document alone, content as semantic HTML). `?view=` is the one key
that takes a value (its three tabs); everything else is a bare presence key, and the
absence of all is `run`. `?extract` is distinct from the bare `?crawler` *modifier*, which
embeds the same document in the run page rather than returning it alone. The server
(`server/index.mjs`) applies it on both the `apps/<name>/` route and any `.declare`
file path; the viewer requests boot the code viewer (`apps/codeviewer`) on the named
tab, `segments` returns the highlight JSON, `file` answers a plain fetch with the exact
bytes, and `extract` compiles through the front-end and serves the extracted document.
The static host's service worker mirrors these, extracting `extract` **in the browser**
(`browser/boot-extract.js`) so the capability is at full parity without a Node server. See
`docs/system-design/capabilities.md` §5.

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
precompiled JS. Declare differs fundamentally: it instantiates and compiles in the
browser, so the parser/checker/schema are part of the runtime foundation. `compiler/`
is only the Node-side orchestration layered on top, with a one-way dependency on
`runtime/`.
