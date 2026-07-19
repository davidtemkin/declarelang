# Requests & modifiers

What you can ask for at a Declare **program URL** (`…/<name>.declare`), and how it
compiles. This is the normative surface; `compiler/src/reqtypes.ts` (the requests) and
`compiler/src/flags.ts` (the modifiers) are the code that enforces it, and every host —
the dev server (`server/index.mjs`), the static-host service worker
(`service-worker.js`), and the `declarec` CLI — derives from those two files so the
surface **cannot drift** between them.

Two orthogonal axes:

- **Request** — *what artifact you get back*. Exactly one per URL.
- **Modifier** — *how the app compiles*. Composes onto the app-producing requests
  (`run`, `build`) only.

The program URL is the app's canonical address (OpenLaszlo's `…/app.lzx?lzt=…` model).
A **directory carries no behavior** — `…/<name>/` is a 404; the `.declare` file is the
address.

## Requests

One key selects the artifact. `?viewer=` is the one key that takes a value, because the
viewer is a single app with tabs; everything else is a bare presence key, and the
absence of all of them is `run`. Every name is lowercase — there is no camelCase in the
URL surface.

| Request | URL | What you get back |
|---|---|---|
| **run** | *(none)* — the default | the running app, in a generated wrapper. Rides prewarm → cache → compile in the browser. |
| **build** | `?build` | the standalone, minified, self-contained deployable (the `declarec` artifact). A *directory* of files — see the transport note below. |
| **reader** | `?viewer=reader` | the **viewer** app, reader tab: highlighted source with `/* */` prose rendered as Markdown. |
| **source** | `?viewer=source` | the **viewer** app, **Source** tab: the verbatim source shown *in the viewer*. (Distinct from `?file`.) |
| **edit** | `?viewer=edit` | the **viewer** app, live-edit tab: source in an editor, the running program below, compile errors between. |
| **file** | `?file` | the raw source **bytes** (`text/plain`) — what an `include`, the compiler, or `curl` reads. |
| **segments** | `?segments` | the highlighter's output as **JSON** (`highlight()` segments — the reader's data alone). |
| **extract** | `?extract` | the **static-extraction** document alone (`text/html`) — the program's content as semantic HTML at its t=0 snapshot, for crawlers and AI readers (capabilities.md §5). |

`source` vs `file` is the split that removes the old collision: `?viewer=source` is the
viewer *showing* you the source; `?file` is the actual file. Before this scheme,
`?viewer=source` returned raw bytes and the viewer's Source tab was unreachable by URL.

## Modifiers

Two, and they compose onto `run` and `build` (nothing else):

| Modifier | URL | Meaning |
|---|---|---|
| **render** | `?render=canvas` | which renderer: managed DOM (default) or one `<canvas>`. |
| **crawler** | `?crawler` | embed the crawler DOM (`#declare-static`) in the run/build wrapper — "the running app **with** the crawler content." Removed before first paint (never CSS-hidden; see serve-core.js). Distinct from the `extract` *request*, which returns that document alone. |

## Removed knobs

Three former flags are gone from the URL/CLI surface, because they were never real
per-request choices:

- **`slim`**, **`stripPos`** — folded into `build`. A production build always slims the
  registry and strips source positions; there is no coherent "prod but keep dead
  components / keep positions" a deployer asks for. The one caller who wants an
  un-stripped build to debug the *emitter* uses `declarec --debug` (not a public URL
  param), not a flag.
- **`typecheck`** — always on. It is a mandatory, structural phase of the one compile;
  the former `?typecheck=0` opt-out only existed for a hypothetical lighter in-browser
  compiler, which we've ruled out. If we ever want one, that's a separate compiler
  build, not a per-request flag.

The compiler's *internal* options still carry `stripPos`/`typecheck` (the `build` act
sets them); only the externally-named FLAG surface shrinks — to `render` and `seo`.

## Two precompiled tiers, kept distinct

"Precompiled" means two different things; they are not merged:

- **prewarm** — an *automatic optimization of `run`*. The commit hook writes a
  validated, serialized program to `bundles/cache/`; on `run`, the browser finds it,
  closure-checks it against the *live* source, and renders compiler-free if fresh, else
  falls through to cache, else compiles. Transparent — the caller never asks for it. It
  boots on the shared runtime (small per-app payload). This is the "request run and it
  finds the committed asset" mechanism.
- **build** — an *explicit eject*. A standalone minified bundle (runtime + program
  fused, tree-shaken) for shipping the app *away* from the distro. Requested as a build;
  served as plain static files, independent of the SW, the compiler, and the closure.

They optimize different targets: prewarm makes cold-loading a curated app in the hosted
distro compiler-free; build is the minimal single-app shippable.

## Uniformity — every surface, every artifact

The compiler core produces every non-interactive artifact, and each surface invokes it.
The **only** genuine exception is the interactive viewer on `declarec` (no browser at
build time).

| Request | declarec | dev server | static host (service worker) |
|---|---|---|---|
| run | — *(build-time, no live serve)* | ✓ | ✓ (prewarm → cache → compile) |
| build | ✓ *(its job)* | ✓ *(builds on demand, serves `/build/<name>/`)* | gap → build in-browser |
| view=reader | ✗ *(interactive — no build-time browser)* | ✓ | ✓ |
| view=source | ✗ | ✓ | ✓ |
| view=edit | ✗ | ✓ | ✓ |
| file | ✓ *(trivial — it's the input)* | ✓ | ✓ |
| segments | ✓ `--highlight` | ✓ | gap → highlight in-browser |
| extract | ✓ `--extract` | ✓ | ✓ (`boot-extract.js`, in-browser) |

Blanks marked "gap" are implementation debt, not rules: the SW carries the full
compiler, so it *can* build a bundle and emit segments — those are follow-ups.

## Transport notes

- **`build` is a directory.** The standalone artifact is `index.html` +
  `app.<hash>.js` + copied data assets, with relative asset links. So it is served at a
  **directory** address, not inlined at the `.declare?build` URL: the dev server builds
  on demand and serves it under `/build/<name>/` (a `?build` request redirects there);
  `declarec` writes it to an output dir; a static host serves the committed directory as
  plain files. This is the one place a real multi-file transport constraint outranks
  query-uniformity — honest about `build` being a discrete deployable, not a view.
- **`extract` on `declarec`** emits the extraction document as an *additional* output
  file alongside the build — a build may legitimately produce more than one file.
- **`?crawler` on a static host** is a *build-time* affair: crawlers don't install service
  workers, so the block is baked by `declarec --crawler`, the homepage bake
  (`tools/internal/bake-homepage-crawler.mjs`), or the prewarm seo tier — not embedded at request
  time by the SW.

## The navigate/fetch discrimination

`run` and the `view=` requests are **navigations** (a person browsing); `file` and a
plain subresource fetch (an `include`, the compiler, `curl`) want the **bytes**. Both
hosts read this the same way (the SW's navigate-vs-subresource signal; the dev server's
`Sec-Fetch-Mode`), so one URL serves a person and a program each the representation they
mean.

---

See also: `compiler/src/reqtypes.ts`, `compiler/src/flags.ts`, `docs/system-design/hosting.md`
(the narrative), `docs/system-design/capabilities.md` §5 (static extraction).
