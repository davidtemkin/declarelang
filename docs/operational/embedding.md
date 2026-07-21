# Embedding Declare in a project

`my-apps/` is fine for a first program, but it puts your code inside Declare's tree.
Real work is the other way around: the app lives in *your* project, next to the back end
it talks to, in your git — and Declare is a tool the project uses, updated on your
schedule. This page is how.

The whole thing is one idea: the server serves **two directories**, and which one answers
a URL is decided by the front of the URL. Your project is one; the Declare installation is
the other. Nothing merges, nothing is copied.

## The two directories

Run the dev server from inside your project and it prints exactly what it is serving:

```
Declare dev server → http://127.0.0.1:8200/

  mounts
    /          →  .                                   (your project)
    /declare/  →  node_modules/declarelang            (platform)
  proxy
    /intent  /data   →  http://127.0.0.1:8000
  build cache
    ~/.cache/declare/builds

  config: declare.json
```

Read the mounts top to bottom. A URL that starts with `/declare/` is served from the
Declare installation; everything else is served from your project. That is the entire
rule — a URL belongs to exactly one line, and the banner shows you which.

- **Your app** is at its own path. `frontend/shop.declare` is `/shop.declare`, and a
  program in a subdirectory, `frontend/admin/admin.declare`, is `/admin/admin.declare`
  (or `/admin/`). Take the file's path in your project, put a slash in front.
- **The platform** — the runtime, the component library, the boot bundle — is under
  `/declare/`, served straight from the installation. Your app boots it from there without
  your project holding a copy. The distro's own example apps are there too, so
  `/declare/apps/calendar/` runs the calendar for reference.

There is no separate URL syntax for "my code" versus "the platform." Both are ordinary
program URLs; the prefix is the only difference, and it names a directory, nothing more.
Every request type — [`?viewer=`, `?extract`, `?build`](declare-docs:operational:dev-server) —
works the same in either.

## `declare.json` — its location is your project

The config file marks the project root the way `tsconfig.json` or a `vite.config` does: you
do not tell the server where your project is, you put a file in it. The server walks up
from where you run it, finds `declare.json`, and mounts that directory at `/`.

```json
{
  "proxy": {
    "/intent": "http://127.0.0.1:8000",
    "/data":   "http://127.0.0.1:8000"
  }
}
```

That is a complete, useful config. With no `declare.json` anywhere above you, the server
runs in **distro mode** — the root and the platform are both the Declare installation,
which is what `npm start` in the distro has always done. Embedding is the same server with
the root pointed somewhere else.

Fields, all optional:

| field | default | what |
|---|---|---|
| `proxy` | none | `{ "/prefix": "http://host:port" }` — forward these prefixes to a back end |
| `root` | the config's own directory | serve a subdirectory as the root instead |
| `platformPrefix` | `/declare/` | rename the platform prefix if your project already uses `declare/` |
| `mounts` | none | extra `{ "/prefix": "dir" }` mounts, e.g. a shared design system |
| `port` | `8200` | the port |
| `buildCache` | `~/.cache/declare/builds` | where `?build` artifacts are cached |

Flags override the file, so `--root`, `--proxy /p=URL` (repeatable), and `--port` work for a
one-off without editing anything.

## Getting the platform into your project

The installation under `/declare/` is an ordinary dependency — the Declare distribution,
fetched, not copied by hand. Because the distro ships its build outputs committed, there is
no build step on install.

```json
{
  "devDependencies": { "declarelang": "github:davidtemkin/declarelang#v0.1.0" },
  "scripts": {
    "dev":   "declare dev",
    "build": "declare build shop.declare -o ../server/static/shop"
  }
}
```

`npm install` pulls it into `node_modules/declarelang`; `npm run dev` starts the server.
The version is pinned per project, so updating Declare is a one-line bump and an install —
your project decides when, and a teammate gets the same version from the lockfile. The
installed copy is never edited; treat it exactly like any other dependency.

## Running it — two processes

The standard back-end-plus-front-end local stack. Your API on its own port, the Declare
server proxying to it:

```bash
# terminal 1 — your back end
uvicorn server.app:app --port 8000

# terminal 2 — the front end, from your project dir
declare dev
```

Edit a `.declare` file, reload, the change is live — [the dev loop](declare-docs:operational:dev-server)
is identical to the distro's. `declare dev` is `node_modules/declarelang`'s CLI; without the
package on PATH the long form is `node node_modules/declarelang/server/index.mjs`.

## The proxy, and why it is not about CORS

The proxy forwards chosen URL prefixes to your back end, so `/intent` and `/data` are served
by uvicorn while everything else is served by Declare. A back end can already send CORS
headers, so this is not what the proxy is for. The point is that **your app's source holds
relative URLs**:

```
data: DataSource [ url = "/data/v8/catalog.jsonl" ]
```

In dev the proxy forwards that to the back end; in production, where the UI and the API
really are one origin, the identical compiled app fetches the identical URL. No
environment-specific addresses in source, no build-time rewriting. It also keeps
[static extraction](declare-docs:operational:dev-server) working — the crawl path refuses an
absolute cross-origin `DataSource` by design, so same-origin data is what an app can be
extracted from.

The forward is a stream, so Server-Sent Events and other streaming responses pass through
untouched — relevant when an endpoint grows a streaming variant. WebSocket upgrades are
proxied too.

## Building for production

The dev server compiles on request; for deployment you ship a build instead, so no compiler
is on the critical path. [`declare build`](declare-docs:operational:building) precompiles one
app to a self-contained static directory — an `index.html`, a content-hashed `app.<hash>.js`,
and your data assets — with the runtime bundled in and everything else tree-shaken out.

```bash
declare build shop.declare -o ../server/static/shop
```

Nothing named `declarelang` appears in that output: Declare is a build-time tool, like a
compiler, and the deployable is just static bytes. A small deployment mounts the directory
with the back end's own static file serving; a larger one moves it to nginx or a CDN with no
change to the app or the API. The `?build` request serves the same artifact live during dev,
addressed by the program's own URL (`shop.declare?build` → `/build/shop/`), cached per source
so a rebuild only pays for what changed.

## Where next

- [The dev server](declare-docs:operational:dev-server) — the full request surface, the same
  in embedded mode.
- [Building for production](declare-docs:operational:building) — `declarec` flags and the
  deploy shapes.
- [Getting started](declare-docs:operational:getting-started) — if you have not run the
  distro itself yet, start there.
