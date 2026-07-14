# Compiling and shipping

An `.declare` file is source; something has to turn it into a running app. Declare
does that **three ways**, and they share one compiler — the parser, checker, and
schema live in `runtime/`, so the *same* code compiles on a Node server, on the
command line, and inside the browser. Which one you reach for depends on where you
are in the lifecycle: editing, deploying a static build, or serving with no build
step at all.

All three read the **same compile flags** (render, production, slimming, …); only
the spelling differs — a CLI switch, a URL query, or a default. Those are collected
at the end.

## The dev server — compile on request

`npm start` runs `server/index.mjs`. It serves the tree and compiles each example on
demand, so an edit-and-reload shows immediately — there is no build to run while you
work.

```text
/examples/<name>/          compile + render (DOM backend)
/examples/<name>/canvas    same, Canvas backend
/examples/<name>/prod      the cached PRODUCTION build (see declarec below)
POST /compile              live compile — returns the app JS for an editor
```

`POST /compile` is the fast path the playground and the "Edit this page" editors use:
source in, the full compile result out (source + deps + structured diagnostics +
the rendered report). Like every surface it **typechecks by default**; a
latency-critical loop can opt out explicitly with `?typecheck=0`.

The `/prod` route is the same production artifact `declarec` produces, built once and
then cached on disk (keyed by a hash of the source + toolchain, partitioned per
backend and per slim/full). The first request builds; the rest are served from the
cache.

## `declarec` — an ahead-of-time production build

For deployment you don't want a compiler on the critical path at all. `declarec`
(`tools/declarec.mjs`) precompiles the app at **build time** and emits a
self-contained, static `dist/` — the Declare analogue of a bundler's production
build.

```bash
node tools/declarec.mjs examples/calendar/calendar.declare -o dist
```

What it does, and why it's small:

- **Precompile.** Parse + resolve + typecheck happen now, once. The output embeds the
  finished program as a JSON string (parsed at boot — far faster than re-parsing
  source), with source positions stripped.
- **Bundle the run-path only.** esbuild bundles the runtime's *render* path and
  tree-shakes the rest — the parser, the checker, and the typechecker never ship.
- **Ship one backend.** DOM by default, or `--canvas` for the single-`<canvas>`
  renderer; only the chosen one is bundled.
- **Slim the component registry.** Only the components the app can actually
  instantiate are included; everything else — most of all the rich-text engine — is
  dropped (see [`use`](#) below).

The result is a directory with an `index.html`, a content-hashed `app.<hash>.js`, and
your data assets copied alongside — deployable to any static host. On the flagship
calendar that lands around 45 KB gzipped over the wire.

## In the browser — compile with no server

The third path runs the compiler *in the page*, and it makes the **program URL
the app's canonical address**: navigate to any `…/app.declare` — on the dev
server or on a static host with the service worker installed — and you get the
running app in a generated wrapper; `?view=reader` gets the reader view; a
plain *fetch* of the same URL gets the source bytes. Compiles are cache-aware:
the compiled output is cached and revalidated by the compile's dependency
closure, so a revisit renders without the compiler even loading. No Node
required on the static side, no build step anywhere.

It's the same `compile()` as the server's `POST /compile`, given a synchronous
in-memory include host over a prefetched file map — **including the typecheck**:
the bundle embeds the TypeScript standard library's declarations, so the browser
checks exactly what Node checks (and produces byte-identical results — a tested
invariant). Because nothing is bundled ahead of time, the production-only flags
(`slim`, `prod`) don't apply here; `render` and `typecheck` do.

The platform itself loads as **two committed bundles**: every host page imports
`bundles/declare-boot.js` (~58 KB gz — the web client + the runtime's run
path, one request instead of fifty modules), and the compiler
(`bundles/declare-compiler.js`, ~1 MB gz) is fetched **lazily**, only when
something actually compiles. You never rebuild these by hand: the pre-commit
hook rebuilds a stale bundle before stamping the build id, and the dev server
rebuilds one on demand when it's requested — an edit to the runtime is live on
your next refresh, and a commit can't ship a stale artifact
(`tools/bundle-freshness.mjs`).

## Compile flags — one set, three surfaces

Every option is defined once (`compiler/src/flags.ts`) and read the same way
everywhere. A flag means the same thing whether it arrives as a CLI switch, a server
URL query, or a browser URL query.

| Flag | What it does | CLI (`declarec`) | URL (`?…`) | Default |
|---|---|---|---|---|
| **render** | render through managed DOM or one `<canvas>` | `--canvas` / `--dom` | `?render=canvas` | `dom` |
| **prod** | production build (precompile + bundle run-path) | *always* | the `/prod` route | dev |
| **slim** | ship only the components the app can instantiate | `--no-slim` (or `--full`) turns it off | `?slim=0` | on |
| **stripPos** | drop source positions from the shipped program | `--no-strip-pos` keeps them | `?stripPos=0` | stripped |
| **typecheck** | the tsc-over-`{ }`-bodies pass — a phase of the compile | `--no-typecheck` turns it off | `?typecheck=0` | on |
| **seo** | embed the extracted static document in the host element, for crawlers | `--seo` | `?seo` | off |

So `?render=canvas&slim=0` on the server, `--canvas --no-slim` on the CLI, and
`?render=canvas` in the browser all mean exactly what they read. Booleans accept
`?f`, `?f=1`, `?f=true` (on) and `?f=0`/`false` (off); the CLI negates with `--no-f`.

## Request types — what a URL returns

Compile flags decide *how* a source compiles. A **request type** decides *what* a
URL hands back for it — the running app, or a view of the source. It's a separate,
orthogonal choice (`compiler/src/reqtypes.ts`), read from the same URL query with
`?view=…`, and modeled on OpenLaszlo's `lzt` request types.

| `?view=` | Returns |
|---|---|
| *(absent)* / `run` | the running app (the default) |
| `source` | the EXACT source file — the bytes, `text/plain` |
| `reader` | a live, syntax-highlighted "reader mode" view, with block comments rendered as Markdown |
| `segments` | the reader's data on its own — the highlighter's segments as JSON |
| `seo` | the **static extraction** document — the program's content as semantic HTML, `text/html` |

So `examples/calendar/?view=reader` shows the calendar's source, coloured, in the
code viewer (`examples/codeviewer`); the same works on any `.declare` file path,
e.g. `some/app.declare?view=reader`; `?view=source` is the exact file. `?source`,
`?reader`, and `?segments` are accepted as bare
shorthands. `?view=seo` returns the extracted document alone — note the **flag**
`?seo` (embed the document *in the run page*, for crawlers) and the **request type**
`?view=seo` (return the document *by itself*) are distinct, which is why `seo` has
no bare shorthand.

## Static extraction (SEO)

A search crawler or an AI chatbot reads a page before — or without — running its
JavaScript. The `seo` surface gives them the program's **content** as semantic
HTML: headings, paragraphs, lists, tables, images, links, carried over from the
text the program actually renders. It is emphatically *not* an accessibility layer
and *not* a language feature — no new syntax, nothing DOM-shaped in Declare source.

It works by **executing the program**, not analysing it. The compiler runs the
compiled program headlessly to its initial (t=0) snapshot — the real runtime, no
pixels — then serializes the settled tree by **class semantics**: a `Markdown`
emits its block tree as HTML, a `Text` a `<p>`, an `Image` an `<img>`, an invisible
subtree nothing. No heuristics (a heading is a heading because Markdown said `#`,
never because it looks large). Because it *runs* the program, computed content is
the real value — `text = { "n = " + count }` extracts as `n = 3` — and replicated
rows all appear. See `design/capabilities.md` for the full model, including the
environment contract that makes headless execution deterministic.

The whole capability lives in the compiler, so it is **available on every host,
identically** — `declarec --seo` bakes the document into the built `index.html`; the
dev server serves `?view=seo` from Node; a static host's service worker serves it by
extracting *in the browser*. Same extractor module, same bytes.

The highlighting is done by the **compiler**, not a separate tokenizer — a file the
compiler accepts highlights faithfully by construction, and `{ }` bodies, datapaths,
strings, and comments are classified exactly as the language sees them. The same
`highlight()` also runs ahead of time:

```
declarec --highlight app.declare        # → app.highlight.json (the segments)
```

**Literate Declare.** A `/* … */` block comment is valid anywhere — it's trivia to
the compiler, like a `//` line comment. The code viewer renders each one as
Markdown, so a source file can document itself: prose in block comments, real code
between them. (`examples/codeviewer/tour.declare` is written this way.)

## `use` — keeping the bundle small

Slimming works by finding every component an app *can* construct — the tags in the
tree, the base classes they extend, and any built from a `{ }` body — and shipping
only those. It is sound because there is no construct-by-value in Declare: every
component that can appear is written down somewhere the compiler can see.

The one gap is a component your app creates that appears **nowhere statically** — you
build it from loaded data, or by name at runtime. Static analysis can't see that, so
slimming would drop the class. The escape hatch is a top-level **`use`** list — the
keep-list, spelled like `include`:

```declare
use [ Markdown ]
```

`use` names components to keep regardless of whether they're referenced in the tree.
It's one declaration for every kind of component — a built-in runtime class
(`Markdown`, `HTMLText`), an auto-included library component, or one of your own — and
the checker rejects a name that isn't a real, concrete component, so a typo fails the
build rather than silently keeping nothing. In the ordinary case, where every
component *is* used somewhere visible, you never write `use` at all.

---

**Next:** that closes Part III. The generated reference carries every component's
full attribute surface; reach back into a chapter here whenever a concept bites.
