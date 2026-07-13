# Compiling and shipping

An `.declare` file is source; something has to turn it into a running app. Declare
does that **three ways**, and they share one compiler — the parser, checker, and
schema live in `runtime/`, so the *same* code compiles on a Node server, on the
command line, and inside the browser. Which one you reach for depends on where you
are in the lifecycle: editing, deploying a static build, or serving with no build
step at all.

All three read the **same compile flags** (backend, production, slimming, …); only
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

The third path runs the compiler *in the page*. A service worker intercepts a
top-level navigation to any `.declare` file, serves a tiny host page, and
`web/boot-declare.js` fetches the source, compiles it with the in-browser compiler
bundle (`dist-browser/declare-compiler.js`), and renders — no Node, no build step.
This is how "browse to a `.declare` on a static host and watch it run" works.

It's the same `compile()` as the server's `POST /compile`, given a synchronous
in-memory include host over a prefetched file map — **including the typecheck**:
the bundle embeds the TypeScript standard library's declarations, so the browser
checks exactly what Node checks (and produces byte-identical results — a tested
invariant). Because nothing is bundled ahead of time, the production-only flags
(`slim`, `prod`) don't apply here; `backend` and `typecheck` do.

## Compile flags — one set, three surfaces

Every option is defined once (`compiler/src/flags.ts`) and read the same way
everywhere. A flag means the same thing whether it arrives as a CLI switch, a server
URL query, or a browser URL query.

| Flag | What it does | CLI (`declarec`) | URL (`?…`) | Default |
|---|---|---|---|---|
| **backend** | render through managed DOM or one `<canvas>` | `--canvas` / `--dom` | `?backend=canvas` | `dom` |
| **prod** | production build (precompile + bundle run-path) | *always* | the `/prod` route | dev |
| **slim** | ship only the components the app can instantiate | `--no-slim` (or `--full`) turns it off | `?slim=0` | on |
| **stripPos** | drop source positions from the shipped program | `--no-strip-pos` keeps them | `?stripPos=0` | stripped |
| **typecheck** | the tsc-over-`{ }`-bodies pass — a phase of the compile | `--no-typecheck` turns it off | `?typecheck=0` | on |

So `?backend=canvas&slim=0` on the server, `--canvas --no-slim` on the CLI, and
`?backend=canvas` in the browser all mean exactly what they read. Booleans accept
`?f`, `?f=1`, `?f=true` (on) and `?f=0`/`false` (off); the CLI negates with `--no-f`.

## Request types — what a URL returns

Compile flags decide *how* a source compiles. A **request type** decides *what* a
URL hands back for it — the running app, or a view of the source. It's a separate,
orthogonal choice (`compiler/src/reqtypes.ts`), read from the same URL query with
`?view=…`, and modeled on OpenLaszlo's `lzt` request types.

| `?view=` | Returns |
|---|---|
| *(absent)* / `run` | the running app (the default) |
| `source` | a live, syntax-highlighted view of the source, with block comments rendered as Markdown |
| `segments` | that view's data on its own — the highlighter's segments as JSON |

So `examples/calendar/?view=source` shows the calendar's source, coloured, in the
code viewer (`examples/codeviewer`); the same works on any `.declare` file path,
e.g. `some/app.declare?view=source`. `?source` and `?segments` are accepted as bare
shorthands.

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
