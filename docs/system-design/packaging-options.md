# Packaging — how Declare should ship

**Status:** options recorded 2026-07-19 from design discussion (David + Claude); nothing
built. Direction is leaning, not ruled: the npm package with a `declare` CLI as the
delivery vehicle, and the **two-root dev server with a proxy flag** as the first
artifact. The in-browser compiler is set aside for this design — today it is a learning
and demo vehicle, not a real development environment ("someday there will be a more real
browser dev environment... but even that will need a server").

## 1. The problem, reframed

Today the repo **is** the package: clone declarelang, `npm start`, write to `my-apps/`.
That shape is not an accident — it's what makes the static deployment work (the whole
tree serves from a dumb host), and it should survive. The actual flaw is the **direction
of containment**: a user's app must live *inside Declare's tree*. It cannot live inside
its own project's repo, next to the backend it talks to, owned and versioned by the team
that owns the product.

The motivating case: a new front end for **Aperture** (`~/Code/Aperture`) — a Python
project, FastAPI + uvicorn on :8000, static workbench mounted at `/`, precomputed data
under `/data`, one live LLM endpoint (`POST /intent`). The Declare sources belong in
Aperture's git. `my-apps/` cannot express that. The packaging answer is to make
containment invertible: **Declare inside your project**, not your project inside Declare.

Generalized goal: enable a **team** to use Declare — possibly alongside other front-end
tech in the same tree — together with ordinary back-end development, with the toolchain
version pinned per project rather than "whatever clone you have on disk."

## 2. What the ecosystem does (research)

Four established models, all confirmed current:

1. **npm CLI** (Vite, Tailwind): `npx tool dev`, `tool build`. The
   expectation-conforming face. `npx` runs the project-local, lockfile-pinned version —
   the property teams actually need.
2. **Standalone binary** (Tailwind standalone, Bun `--compile`): for the no-Node crowd.
   Heavier to maintain; deferred.
3. **Vendored asset** (htmx: one file you copy in and serve yourself): no npm, no
   build. Declare's twist below (§5).
4. **Backend integration** (Vite's documented mode; the Django/Rails convention): the
   backend owns the origin; the frontend toolchain either proxies to it in dev or hands
   it a built manifest in prod.

Two measured repo facts make any of these cheap:

- The **platform-essential subset** — `bundles/` (5.0M), `runtime/dist` (1.8M),
  `browser/` (92K), `library/` (128K), `assets/` (140K), `service-worker.js` — is
  **~7 MB on disk**. Everything else (apps 6.2M, evals 5.4M, docs, tests, node_modules
  77M, .git 125M) is workspace, not platform.
- The tree is **already subpath-portable**: every path derives from module URLs, the SW
  scopes itself to its own directory, and the GitHub Pages deploy at `/declarelang/`
  proves the distro runs unchanged from any mount point.

## 3. The missing primitive: the two-root server

Both dev topologies (§4) reduce to one change. `server/index.mjs` has a single `ROOT`
(the declarelang checkout); program URLs, includes, and the raw-file fallback all
resolve under it. The change is **two roots**: platform files (bundles, runtime,
library, browser modules) resolve from the Declare installation; everything else from
`--root <dir>` — e.g. `Aperture/frontend/`. The run wrapper's root-relative
`/bundles/…` becomes prefix-aware (a reserved path such as `/_declare/…`).

The server stays what it is: **bare `node:http`, zero runtime dependencies** (the
package depends only on TypeScript). No Express — and note proxying isn't built into
Express either; its users pull in `http-proxy-middleware`.

## 4. Dev topologies — both fall out of two-root + one flag each

### 4a. Declare in front (the default)

The Declare server serves the UI on its own port and takes
`--proxy /api=localhost:8000`, forwarding API routes to the backend — the Vite
convention. The proxy matters more than it looks: app code then fetches **relative**
URLs (`/data/v8/catalog.jsonl`, `/intent`), so the same compiled app works unchanged in
production where everything really is one origin. No CORS, no environment-specific URLs
in source, **zero backend changes** — the backend team doesn't need to know Declare
exists. The server already serves non-`.declare` files generically, so a mixed frontend
directory (Declare next to other tech) works without special handling.

### 4b. Backend in front (the option)

For when the backend owns what the UI must ride through — session cookies, auth
redirects, server-side routing. The backend proxies UI paths to the Declare server
during dev (a few lines of middleware; every framework has the recipe — Vite's
"backend integration" mode). More coupling (a snippet per framework), so documented as
the option, not the default.

### Team workflow (either topology)

The product repo (e.g. Aperture) gains `frontend/` — Declare sources in the *product's*
git — and a devDependency on the Declare package. A teammate runs the backend plus
`npx declare dev --root frontend --proxy /api=:8000` (or one `make dev` starting both).
The standard two-process local stack every backend+frontend team already runs.

## 5. Proxy implementation notes (HTTP, streaming, WebSocket)

- **HTTP**: ~30 lines of core Node — `http.request` to the target with the same
  method/path/headers (rewrite `Host`, append `X-Forwarded-For`), pipe request body in,
  pipe status/headers/body back. Because it's stream piping, **SSE and streaming
  responses work for free** (relevant: LLM-backed endpoints like Aperture's `/intent`
  grow streaming variants). Care point: never buffer whole responses.
- **WebSocket**: WS starts as an HTTP request that mutates (`Connection: Upgrade`);
  core Node emits the `upgrade` event for it. Proxying is ~20 more lines: open a socket
  to the target, replay the handshake, and on `101 Switching Protocols` pipe the two
  raw sockets both ways — a dumb pipe below the protocol, no frame parsing (what
  `http-proxy`'s `ws: true` does under the hood).
- Declare's own dev loop needs **no WS today** (live recompile is `POST /compile`; no
  HMR socket). All WS traffic through the dev server is backend traffic passing through
  untouched. When the "more real" browser dev environment arrives and Declare wants a
  socket of its own, the same `upgrade` plumbing serves it on a reserved local path
  (`/_declare/ws`), routed apart from the proxied paths. Building the proxy now leaves
  that socket pre-wired.

Total: `--proxy` ≈ 50 lines of core Node. No new dependency.

## 6. Production packaging

The ahead-of-time step is the **universal rule**, not a Declare peculiarity: every
serious frontend stack has one (`vite build`, `elm make`, `tsc`+bundler), and the
output is always a directory of static assets. Declare conforms exactly — `declarec`
already emits the self-contained `dist/` (index.html, hashed `app.<hash>.js`, copied
data). Production is `declare build frontend/shop.declare -o <static dir>`, run in CI,
served as dumb files. Declare's only oddity among peers is *also* having the no-build
in-browser path (set aside here).

Backend fit: Python is very common in production **backends** (Django, FastAPI), but at
scale it rarely serves static assets — nginx/CDN in front does that, Python serves only
the API. That standard topology is exactly the shape the build output fits. Small
deployments mount `dist/` with FastAPI's `StaticFiles`; growing up means moving the
directory to nginx/CDN with zero changes to app or backend.

## 7. The models, composed

Three verbs on one npm package (`declarelang`, bin `declare`):

- **`declare dev`** — the two-root server (§3) with `--proxy` (§5). **First artifact.**
- **`declare build`** — declarec, already built; gains only the CLI face and `-o`.
- **`declare vendor <dir>`** — emit the ~7 MB platform-only distro into a host project
  for the static/self-hosting story. Because subpath portability and SW scoping already
  work, this is mostly a manifest (platform vs. workspace) plus a prune script.
  **Demoted to second priority** by the in-browser ruling: the vendored distro's live
  no-toolchain dev loop is a learning/demo vehicle today, not the team dev environment.
  Still valuable for demos, teaching, and static deployment parity.

Also plausible later, not designed here: `declare init` (scaffold a `frontend/`),
standalone binary, a pip wrapper shipping the vendored distro as package data.

## 8. Non-goals

- **`@declare/runtime` as an importable bundler library.** Declare is a self-hosting
  platform, not a React dependency; contorting it into that expectation would break the
  one-compiler / one-path discipline everything above relies on.
- **Throwing out repo-as-distro.** The declarelang repo remains the reference
  workspace and showcase (apps/, docs/, evals/); the packaged forms are projections of
  it, produced by the same freshness machinery (pre-commit bundle rules, BUILD_ID).

## 9. Open questions

- The reserved platform prefix (`/_declare/…`) vs. keeping root-relative `/bundles/…`
  in two-root mode — collision policy when the workspace has its own `bundles/`.
- Proxy config surface: repeatable `--proxy` flags vs. a small config file (Vite uses
  `vite.config`); a config file also answers "where does `--root` default come from."
- How `verify.mjs` / the skill / agent workflows surface through the CLI
  (`declare verify` seems obviously wanted for LLM-driven teams).
- Whether `declare dev` should serve the docs/guide apps from the platform install
  (nice for onboarding a team) or stay workspace-only.
- Versioning/release cadence for the npm package; relation of package version to
  BUILD_ID.
