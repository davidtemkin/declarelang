# The dev server

`npm start` runs `server/index.mjs` and serves the whole tree at
**http://127.0.0.1:8200/**, compiling each program on request. There is no build step while
you work: edit a `.declare` file, reload, and the change is live. (Set `PORT` or pass a port
argument to move it: `node server/index.mjs 8300`.)

## The program URL is the address

A program's address is its source file — navigate to it and it is compiled and run.
Directories carry no behavior; there is no per-example index page. One query parameter
selects what the URL returns; exactly one applies, and their absence runs the app.

| request | URL | returns |
|---|---|---|
| run | *(none)* | the running app (default) |
| build | `?build` → `/build/<program-dir>/` | the standalone `declarec` artifact (built once, cached) |
| reader | `?viewer=reader` | the code viewer, reader tab — highlighted source, block comments as Markdown |
| source | `?viewer=source` | the code viewer, verbatim-source tab |
| edit | `?viewer=edit` | the code viewer, live-edit tab |
| file | `?file` | the exact source bytes, `text/plain` (curl, an `include`) |
| segments | `?segments` | the highlighter's segments as JSON |
| extract | `?extract` | the static-extraction document — semantic HTML for crawlers |

## Modifiers

Two modifiers change *how* a program compiles, and compose onto a run or a build:

- `?render=canvas` — render through a single `<canvas>` instead of managed DOM (`?render=dom`
  is the default).
- `?crawler` — embed the extracted static document in the run page (the client clears it at boot).

Booleans accept `?crawler`, `?crawler=1`, `?crawler=true` (on) and `?crawler=0`/`false` (off).

A third is not about compiling but about forgetting — **`?clear`**, on an **entry page**
(`/`, or any `…/index.html`): drop every compiled-program cache in this browser, and on the
dev server the server's cache too, then run. Ignored on a program URL, because it is a
host-wide verb and a program URL names one program. You should not normally need it — see
[When you would need `?clear`](#when-you-would-need-clear) for why, and for the one case
that does.

## Sharing a link to a program

A program URL is an address, so it is shareable as it stands — on the dev server, and on
a static deploy once the visitor's browser has the service worker. The awkward case is the
one that matters for sharing: **a first visit, on a static host, with no worker installed
yet.** A bare `…/name.declare` URL arriving cold has nothing to turn it into a running app,
and the browser downloads the source file instead of rendering it.

The **launcher URL** is the form that always works:

```
https://…/index.html?apps/desktop/
```

The whole query is read as a path when it looks like one — a `/` with no `=` before it — so
`?render=canvas` and `?crawler` can never be mistaken for a target. The entry page installs
the service worker **first** and only then navigates, so the real URL arrives with the worker
in control and becomes a run page. Under the dev server it simply redirects, since the server
answers the target directly. A fragment is carried through, so
`index.html?apps/docs/docs.declare#guide/05-space` lands where you meant.

The target must be same-origin and inside the entry page's own directory; anything else is
refused, which rules out absolute URLs and `..` escapes.

Two shorter forms work once you know their limits, and both are fine to share:

| form | works cold? | notes |
|---|---|---|
| `index.html?apps/desktop/` | **always** | the launcher — the one to use when you don't want to think about it |
| `apps/desktop/` | yes, if the program directory has a committed stub | prettier; `bake-app-stubs.mjs` writes those stubs for exactly this |
| `apps/desktop/desktop.declare` | only with the worker already installed | the canonical address, not the best thing to paste to someone |

The path stays `index.html` in the launcher form, so a shared link can never 404 and needs no
host 404/rewrite configuration — it behaves the same on GitHub Pages, Firebase, S3, nginx, or
`python -m http.server`.

## The fragment is the app's own layer

The URL has three layers, and they do not overlap: the **path** picks the program, the **query**
(the requests and modifiers above) picks what the host does with it, and the **fragment**
(`#…`) is `app.location` — *where in the app*. A running app owns its
fragment: it seeds `app.location` from `#…` before the first paint, pushes one history entry per
navigation, and writes it back on back/forward. So `foo.declare#why` deep-links into the app's
`why` location, `foo.declare?viewer=reader` opens the reader — and `foo.declare?viewer=reader#why` is
both at once, because the query and the fragment answer different questions. The `?extract`
document follows these fragment links too: it crawls each reachable location and emits ONE
document — the default page, then each location's content as a `<section>` whose `id` is that
location — so the whole app is in the crawler view at the one program URL, and the fragment
links resolve right there in the static page.

## How a program gets rendered — the two requests

Navigating to a `.declare` returns a tiny run shell that boots the platform, which then has to
turn that program into something running. It asks one of **two** questions, and it knows which
one before it asks anything:

**1. Load a build.** A small curated set of programs ships precompiled under `bundles/cache/`.
Whether *this* program is one of them is answered from a list compiled into the boot bundle
(`browser/prewarm-manifest.js`), so the answer costs no request: a program that is not on the
list never asks, and one that is fetches its artifact and renders it — **no compiler, no
compile, and no validation round trips**. It is not a production build and it does not replace
compilation; it is the deployment asserting "this is what these sources compile to."

That assertion is what `derive` and pre-push exist to keep true: `npm run derive` regenerates
every artifact from current sources, and a push is refused if the derived artifacts are stale
on disk or fresh but uncommitted. So a deploy cannot carry a build that disagrees with the
source shipped beside it.

**Not on the dev server.** There the file on disk is the truth and an edit must show on the
next reload, so the dev loop always asks the second question. This is the one place the two
hosts differ, and they differ in *which question is asked* — not in what either answer means.

**2. Resolve a source.** Compile it, unless a previous compile is still good. "Still good" is
the dependency closure: the main file plus every `include` and component the compile actually
read, each with a validator. If nothing in it moved, the previous compile is reused.

- **On the dev server the compile runs on the server** (`POST /compile`), and so does the
  cache. The server holds the compiled program with its closure and checks freshness against
  the **disk** — no dependency probing over the network, so a reload costs one request. Edit
  the program, or any file it includes, and the next reload recompiles. Measured on the
  calendar: 0.75 s cold, 0.01 s when nothing moved, and back to ~0.3 s the moment a library
  file it reads is touched. The cache is dropped whole whenever the toolchain itself is
  rebuilt.
- **On a static host there is no server, so the compile runs in the browser** and the result
  is written to CacheStorage, keyed by the platform's build id and the app's identity. A
  repeat visit re-checks the closure and reuses it. The compiler bundle is pulled once and
  cached by build id thereafter.

Same request surface either way; the cache and the compiler simply live where the host can put
them. This is why the dev loop stays light for a large app — the server does the work and
remembers it — and why a static deployment can serve a flagship app compiler-free.

### When you would need `?clear`

Almost never, and it is worth knowing why. Both caches are keyed to a platform identity and
drop themselves when it moves; every reuse re-checks the closure first. The gap neither covers
is a closure that is **incomplete** — a compile that read a file nothing recorded stays "fresh"
forever against an edit to that file, and no identity moved to dislodge it. If a change refuses
to show up and you have ruled out your own code, that is the shape of it: `?clear` on an entry
page forgets everything and recompiles, and the underlying omission is worth reporting.

## Editing and reload

The dev server pushes nothing to open pages — there is no hot-reload socket, and a page holds
no connection to the server once it has loaded. So a change on disk does **not** refresh the
browser on its own. **Reload the page** and the change is picked up: the prewarm and cache tiers
re-fetch and re-hash the files with `no-cache`, the edit fails their freshness check, and the
compile tier runs against the current source (on the server, on the dev server). A reload
always reflects the file on disk.

Editing a program *in the browser* — the "Edit this page" surface — is a separate path: each
change recompiles the edited source directly (on the server under the dev server, in the
in-browser compiler on a static host) and re-renders, no reload involved.

## `POST /compile`

`POST /compile` is that server-side compile as a plain endpoint: source in, the full compile
result out — source, dependencies, structured diagnostics, and the rendered report. The dev
server's run pages use it (that is how server-side compilation above works), as do the
playground and the "Edit this page" editors. Pass `?main=<program-url>` so the server resolves
the program's `include`s and bare-tag library files against the right directory. Like every
surface it **always typechecks**; that is a mandatory phase of the one compile, not a flag. See
[flags](declare-docs:operational:flags) for the modifier surface and
[building](declare-docs:operational:building) for `declarec`.

## Serving another project

The server serves the distro by default, but it can serve *your* project instead, with the
platform mounted alongside from the installation. Run it from a directory with a
`declare.json` and it prints a mount table: your project at `/`, the platform at `/declare/`,
and any proxied prefixes forwarded to your back end. Your programs are at their own paths
(`frontend/shop.declare` → `/shop.declare`); the platform and the distro's example apps are
under `/declare/`. Every request type above works unchanged. That is how a Declare front end
lives in a product's own repo — see [Embedding Declare](declare-docs:operational:embedding).
