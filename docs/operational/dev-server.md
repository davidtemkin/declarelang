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

## How a program gets rendered — the three tiers

Navigating to a `.declare` returns a tiny run shell that boots the platform, which then has to
turn that program into something running. It tries three tiers in order, and stops at the
first that produces a program. The tiers are the same on the dev server and on a static host;
only the last one — the compile — runs in a different place.

**1. Prewarm — a committed, precompiled artifact.** A build step can commit a compiled program
under `bundles/cache/`. Boot tries it first. It is **not a production build** and it does not
replace compilation — it merely *skips* it when nothing has changed. The artifact carries the
compile's dependency closure (the main file plus every `include`d file, each with a content
hash). Boot re-fetches every file in that closure and re-hashes it; the artifact is used only
if all of them still match. So **editing the program, or any file it includes, invalidates the
prewarm** — the changed hash fails the check and boot falls through to compile. Prewarm is
deployment-independent: it works identically on the dev server and a static host. When it hits,
the program renders with **no compiler and no compile at all**.

**2. Cache — a previous in-browser compile.** On a static host, a compile's result is written to
CacheStorage keyed by its closure, so a repeat visit re-validates and reuses it without
recompiling. The dev server does not use this tier — it recompiles instead (see below), which
is what keeps the edit loop honest.

**3. Compile — the fallback, and the one place the two hosts differ.** Nothing precompiled was
usable, so the program is compiled now.

- **On the dev server the compile runs on the server**, via `POST /compile`. The browser sends
  the source and receives the finished program. It never downloads the compiler and never
  fetches the component library — the server has both and resolves only what the program
  actually uses. Every reload recompiles on the server (a localhost round trip is a few
  milliseconds), so what you see is always current with the file on disk. No client cache is
  written; the server is the source of truth.
- **On a static host there is no server, so the compile runs in the browser.** The page pulls
  the compiler bundle once (cached by the platform's build id thereafter) and compiles
  client-side, then writes the result to the cache tier above.

Same request surface either way; only where the compile runs changes. This is why the dev loop
stays light even for a large app with no prewarm — the server does the work — and why a static
deployment can serve a flagship app compiler-free when its prewarm is committed.

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
