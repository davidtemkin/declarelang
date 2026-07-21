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

## The fragment is the app's own layer

The URL has three layers, and they do not overlap: the **path** picks the program, the **query**
(the requests and modifiers above) picks what the host does with it, and the **fragment**
(`#…`) is `app.location` — *where in the app* (docs/system-design/location.md). A running app owns its
fragment: it seeds `app.location` from `#…` before the first paint, pushes one history entry per
navigation, and writes it back on back/forward. So `foo.declare#why` deep-links into the app's
`why` location, `foo.declare?viewer=reader` opens the reader — and `foo.declare?viewer=reader#why` is
both at once, because the query and the fragment answer different questions. The `?extract`
document follows these fragment links too: it crawls each reachable location and emits ONE
document — the default page, then each location's content as a `<section>` whose `id` is that
location — so the whole app is in the crawler view at the one program URL, and the fragment
links resolve right there in the static page.

## `POST /compile`

The playground and the "Edit this page" editors use `POST /compile`: source in, the full
compile result out — source, dependencies, structured diagnostics, and the rendered report.
Like every surface it **always typechecks**; that is a mandatory phase of the one compile, not
a flag. See [flags](declare-docs:operational:flags) for the modifier surface and
[building](declare-docs:operational:building) for `declarec`.

## Serving another project

The server serves the distro by default, but it can serve *your* project instead, with the
platform mounted alongside from the installation. Run it from a directory with a
`declare.json` and it prints a mount table: your project at `/`, the platform at `/declare/`,
and any proxied prefixes forwarded to your back end. Your programs are at their own paths
(`frontend/shop.declare` → `/shop.declare`); the platform and the distro's example apps are
under `/declare/`. Every request type above works unchanged. That is how a Declare front end
lives in a product's own repo — see [Embedding Declare](declare-docs:operational:embedding).
