# The embeddable server — mounts, one build cache, a proxy

**Status:** BUILT, 2026-07-21 (David + Claude). This is the concrete successor to
`packaging-options.md` §3–§5, which recorded the direction (two-root dev server with a
proxy, npm as the delivery vehicle) and left the surface open. It replaces "two roots"
with a **mount table**, because two roots turned out to be a special case of one, and it
opens with a bug that had to be fixed first.

Shipped: `server/mounts.mjs`, `server/proxy.mjs`, `server/config.mjs`, `server/create.mjs`
(the factory), a rewritten thin `server/index.mjs`, `bin/declare`, and the operational
guide at `docs/operational/embedding.md`. The `?build` collision (§1) is fixed and
regression-tested; distro mode is byte-identical (serve-parity 8/0, full suite 0 failed);
workspace mode is proven end to end including a live browser render and a proxied back end.
The user-facing teaching lives in [Embedding Declare](declare-docs:operational:embedding);
this file is the design record.

## 1. The bug that comes first

`?build` is the one request type that does not honor the program URL as the address. It
round-trips through the basename and re-derives a path under `apps/`:

```
server/index.mjs:418   REQ.BUILD  →  302 to `/build/${programName(p)}/`   // directory discarded
server/index.mjs:251   ensureProdBuild:  dir = path.join(EXAMPLES, name)  // re-derived under apps/
server/index.mjs:362   route gated on apps().includes(name)
```

Reproduced 2026-07-21 against a running server, with `my-apps/weather/` a copy of
`apps/weather/`:

```
/my-apps/weather/weather.declare?build   →  302  /build/weather/     ← same address
/apps/weather/weather.declare?build      →  302  /build/weather/     ← as each other
GET /build/weather/                      →  200

apps/weather/.prod-cache/       written 14:49:27   ← the build that answered
my-apps/weather/.prod-cache/    never created
```

Requesting a build of the `my-apps` program served a build of the `apps` program. It is
not a 404; it is a silent wrong answer, and it looked right only because the two sources
were byte-identical copies. Edit the `my-apps` one and `?build` keeps serving the other,
with no diagnostic.

Three consequences, in ascending order of importance:

- `my-apps/` — the directory the README and the guide tell newcomers to use — has never
  had a working `?build`.
- The uniformity table in `requests.md` claims dev server ✓ for `build`. That is true for
  `apps/` and wrong everywhere else.
- `requests.md:16` states the invariant this violates: *"The program URL is the app's
  canonical address."*

Inside the distro this is a latent collision needing two same-named programs. Under
mounts it becomes the common case, since every project's main program is going to be
called something like `shop.declare`. **Fix it first, on its own merits**, and the rest
of this document becomes a small diff rather than an inheritance of the defect.

The fix has two halves, and both are needed:

- **The address** becomes path-shaped: `/build/my-apps/weather/`, derived from the
  program's own URL, which is unique by construction.
- **The cache key** becomes the program's resolved absolute path (§5), not its basename.

Note where the identity is lost. It is not lost in the compiler: `declarec.mjs:74`
already computes `mainId = join(originDir, name + ".declare")`, the absolute disk path.
The server discards it one layer above, then reconstructs a guess. The fix deletes a
lossy round-trip; it does not add machinery.

## 2. What must not break

Two properties are load-bearing and neither survives by promise.

**Static deployment.** Mount mode never involves the service worker. It cannot: SW scope
is pinned to the worker's own directory (`service-worker.js:40`, `register-sw.js:24`), so
a program in another tree is unreachable by it — a browser constraint, not a code one.
No file the SW reads changes.

**Distro-is-the-server, with `my-apps/`.** The distro is the mount table where every
mount points at the same directory (§3). `npm start` is not a preserved special case; it
is the degenerate configuration. The acceptance test is that distro mode is
**byte-identical**, not merely equivalent.

**The one shared seam.** `runWrapper()` in `browser/serve-core.js` is shared by both
hosts, and `serve-parity.test.mjs:85-100` asserts their output is byte-identical after
normalizing exactly two things: the `import boot from "…"` URL and the favicon `href`.
Those are already parameters. A third host is therefore conformant by construction so
long as it differs only in `bootUrl` and `iconBase`. A design that made `runWrapper`
branch on host type would fail that test structurally, which is the point of it. **Do not
touch `serve-core.js`.**

## 3. Mounts

A mount is one line: *URLs beginning with this prefix are files under this directory.*
The server holds a short ordered-irrelevant list, and every request is answered by
exactly one line.

```
DISTRO MODE                          WORKSPACE MODE
  /declare/  →  <distro>               /declare/  →  frontend/node_modules/declarelang
  /          →  <distro>               /          →  frontend/

  both point at one directory,         the platform is read-only and updatable;
  so every URL resolves as today       the sources are the product team's
```

The resolution rule, stated completely:

> A URL beginning with a declared prefix is served from that prefix's directory.
> Everything else is served from the root mount. Declared prefixes may not nest, and the
> server refuses to start if they do.

No precedence, no longest-match, no significant ordering. Because prefixes cannot nest,
at most one can ever match, so the ambiguity that would require a precedence rule is
illegal rather than resolved. A configuration that would have been ambiguous is a startup
error instead of a surprise at request time.

**Resolution is strict, never an overlay.** A URL belongs to exactly one mount. There is
no falling through from the workspace to the distro when a file is missing; that would
make *which file am I serving* depend on what happens to exist on disk, which is the same
class of defect as §1 and harder to see.

**A mount is structure-preserving.** It maps a URL subtree onto a disk subtree with no
rewriting and no flattening. This is what keeps `data/weather.json` resolving beside
`weather.declare` in all three compile hosts at once — the browser resolves it against the
page URL (`boot-uniform.js:231`), Node against `originDir`, `declarec` copies it as a
sibling (`declarec.mjs:189-203`) — and all three agree because the URL shape and the disk
shape are the same shape. `hosting.md:135` already depends on this; mounts must not break
it.

### 3.1 The platform prefix

`/declare/` is a **declared mount with a default, not a reserved word**. The server knows
where it mounted the platform and emits `bootUrl` / `iconBase` accordingly; nothing else
in the system needs to know the name. If a project already has a `declare/` directory,
change the prefix.

The `_`-prefixed spelling (`/_next/`, `/_ah/`) was considered and dropped. Its only
function is probabilistic collision avoidance, and startup validation (§3.3) is the
deterministic version of the same protection.

### 3.2 Addressing — there is no second URL form

There is no syntax meaning "inside" or "outside" the distro. Take the file's path under
its mount and put the prefix in front:

```
WORKSPACE MODE
  frontend/shop.declare              →  /shop.declare        (or /shop/)
  frontend/admin/admin.declare       →  /admin/admin.declare (or /admin/)
  <distro>/apps/weather/weather.declare  →  /declare/apps/weather/weather.declare
  <distro>/bundles/declare-boot.js       →  /declare/bundles/declare-boot.js
```

Same grammar, same modifiers, same directory-program rule. The mount table decides which
disk; the URL never encodes it. This is required, not stylistic:

- `requests.md:16` — a root-carrying URL would make the address a function of server
  configuration rather than app identity.
- **SW parity** — the static host has one root and no mounts. A distinct URL shape for
  workspace apps would force `runWrapper` to branch (§2).
- **Relative resources** — any prefix that is not structure-preserving breaks
  page-relative data silently, in the browser only.

### 3.3 Startup validation and the banner

Fail loudly, never degrade:

- two declared prefixes nest → refuse to start
- a declared prefix shadows an existing directory in the root mount → refuse to start
- a mount points at a directory that does not exist → refuse to start

And print the table every start, because most of the "forgotten magic" failure mode is
really "the server knew and did not say":

```
Declare dev server → http://127.0.0.1:8200/

  mounts
    /declare/   →  frontend/node_modules/declarelang     (platform)
    /           →  frontend/                             (workspace)
  proxy
    /intent  /data  /schema   →  http://127.0.0.1:8000
  build cache
    ~/.cache/declare/builds/
```

A 404 should name the mount it used and the disk path it tried:
`not found: /shop.declare → frontend/shop.declare (root mount)`.

## 4. What each compile host needs

The compiler needs no changes. All three invocations already accept an arbitrary source
location; only the server's routing layer assumes otherwise.

| invocation | reaches source by | mount-mode status |
|---|---|---|
| browser (`run`, SW) | fetching the program URL | **free** — serve the workspace at that URL |
| Node (`viewer`, `extract`, `build`, `POST /compile`) | server `readFileSync` + `originDir` | needs the URL→disk mapping |
| `declarec` | `resolve(input)` on any CLI path | **already works** |

The library resolves from the distro in both front-ends, and neither needs touching:

```
compile-node.js:43     LIBRARY_ROOT   ← resolved from the module's own file path
compiler-client.js:24  DISTRO = new URL("..", import.meta.url)
```

That second line is why the platform prefix is free on the browser side. The browser's
platform base derives from **the URL the module was served at**, so serving the platform
under `/declare/` makes `library/autoincludes.json` fetch from
`/declare/library/autoincludes.json` (`compiler-client.js:137,142`) with no code change.
Likewise `boot-uniform.js:42` and the compile worker.

### 4.1 The browser compiler is unaffected

Its cache keys on the full URL and its version gate is unchanged:

```
boot-uniform.js:223   const mainId = mainUrl.href;
boot-uniform.js:237   const key = lookupKey(mainId, props, build);
```

This is also why §1 stayed hidden: the run path was never vulnerable, because it fetches
from the same URL it keys on. `?build` is the only request type that round-trips through
a basename.

**One designed-for consequence.** A workspace program is not under the platform ROOT, so
`relativize()` returns its URL unchanged and the **prewarm** lookup misses
(`prewarm-cache.js:52-56`, already commented as "a key nothing was committed under →
miss"). It then falls through to the CacheStorage tier and the in-browser compile. This is
correct: prewarm artifacts are curated and committed in the distro, and a workspace app
has none. Graceful, existing contract, no change.

## 5. One build cache, keyed by identity

Today `.prod-cache/` is written **beside each source** under `apps/`, keyed by basename
(`index.mjs:251,258-259`). Under mounts that would scatter build scratch into a product
team's repo and require a gitignore line they did not ask for.

It becomes one server-owned store. The key is **not** the path alone — the same file
produces different artifacts under `?render=canvas`, which today's code already knows
(`key = \`${name}:${backend}\``, a separate `.prod-cache-canvas`). The key is:

```
fnv1a( resolved absolute program path + build props + toolchain fingerprint )
        └ replaces the basename          └ render, slim, stripPos, crawler, typecheck
```

The validating machinery already exists and is reused unchanged: `isUpToDate(closure,
props, diskProbe)` over the full closure — main file, every `include`, every auto-included
library file — plus `toolchainFingerprint()` (`index.mjs:272-280`). Only the identity
component changes.

Keying on the **disk** path rather than the URL has a useful consequence: in distro mode,
where `/` and `/declare/` point at one directory,
`/apps/weather/x.declare?build` and `/declare/apps/weather/x.declare?build` resolve to a
single absolute path and share one cache entry. Keying on URL would silently produce two
identical copies.

Home: user-level (`~/.cache/declare/builds/`). A build cache belongs to the machine, not
to a project; putting it under `node_modules/` means `npm ci` discards it, and putting it
in the workspace makes it per-root, which is the thing being removed. An entry keeps a
manifest recording its closure and source path so the store stays debuggable.

Loose end: **eviction**. `.prod-cache` was self-limiting by living beside each source; a
machine-level store grows without bound and nothing prunes it. Not a blocker, recorded so
it is not discovered later.

## 6. The proxy

Per `packaging-options.md` §5: ~50 lines of core Node, no dependency. Longest-prefix
match against the proxy table, `http.request` to the target, pipe both ways, rewrite
`Host`, append `X-Forwarded-For`, never buffer a whole response (so SSE and streaming work
for free). The `upgrade` event carries WebSocket as a dumb socket pipe below the protocol.
Proxied prefixes are matched **after** mounts and may not shadow a declared mount prefix
— another startup check.

**The proxy is not for CORS.** Aperture's backend already sends
`allow_origins=["*"]`, so a Declare app could call it cross-origin today. The reasons it
exists anyway:

- App source contains **relative** URLs (`/intent`, `/data/v8/catalog.jsonl`), so the
  identical compiled app works in production where it really is one origin. No
  environment-specific URLs, no build-time substitution.
- The **static-extraction path survives**. `crawl.ts` refuses an absolute DataSource URL
  during extraction — a 422, by design, since network-fetched data is never indexed. An
  app whose data is cross-origin cannot be crawled; one whose data is same-origin can.

## 7. The factory

`server/index.mjs` splits into a factory plus a thin CLI. Exporting the bare handler —
not just a listening server — is what makes topology 4b (backend in front) fall out for
free, since the handler can be mounted inside another Node server.

```js
// server/create.mjs
export function createDeclareHandler({
  mounts,          // [{ prefix, dir }] — exactly one with prefix "/"
  proxy = {},      // { "/intent": "http://127.0.0.1:8000", … }
  buildCache,      // default ~/.cache/declare/builds
  watch = false,
}) → { handler, upgrade }
```

`server/index.mjs` becomes its first caller with every mount pointing at the distro.

**Config file.** `declare.json` in the workspace, and **its location is the root mount** —
which answers "where does the root default come from" the way `tsconfig.json` and
`vite.config` do. Discovery walks up from cwd; flags override. JSON first; a `.mjs` form
can come later if computed targets are wanted, since JSON is a strict subset of it.

### 7.1 Required sub-change: `POST /compile` has no `originDir`

`index.mjs:327` calls `compile(body, {})`. The live-edit path therefore cannot resolve
`include`s or relative data against the file being edited. Survivable in the distro, where
the editor mostly drives self-contained demos; wrong as soon as real workspace apps with
`include`s are the common case. The caller knows the path. This is a behavior change to a
shared endpoint, so it is recorded here rather than slipped in.

### 7.2 Sequencing

Each step ships independently, and the first two are the structural work.

1. **`?build` by path** (§1). Standalone bug fix, no embedding concepts. Verifiable in
   thirty seconds against `my-apps/weather/`.
2. **Extract the factory**, all mounts at the distro. Pure refactor; the test is
   byte-identical distro behavior.
3. **Mounts + the platform prefix** (§3). Small, because 1 and 2 did the work.
4. **The proxy** (§6).
5. **The CLI** (`bin/declare`, `packaging-options.md` §7).

### 7.3 Conformance

The `requests.md` uniformity table is the acceptance criterion. Every request type marked
✓ for the dev server must work for a program in **any** mount — including `?build`, which
does not today.

## 8. Delivery

`npm pack` on the current tree emits **6.6 MB / 18.2 MB unpacked, 826 files**, with
`dist/` committed and therefore no build step on install. So a git dependency works today,
with no registry publish:

```json
{ "devDependencies": { "declarelang": "github:davidtemkin/declarelang#v0.1.0" } }
```

`npm install && npm run dev`, pinned per project, updated by bumping one line. A `files`
manifest would trim the tarball to roughly the ~9 MB platform subset, but that is an
optimization, not a prerequisite.

`declare vendor` (`packaging-options.md` §7) remains the alternative for teams that want
no npm at all, and it is the only path that would also give an embedded project the
static/SW hosting story — with the known wrinkle that the SW assumes the distro root *is*
the platform root, which vendoring beside an app breaks. Out of scope here.

## 9. Open questions

- **Delivery**: npm git dependency (§8) or `declare vendor` first? Node is required either
  way, since the dev loop is the server.
- **Aperture's layout**: `frontend/` inside the product repo, versus a sibling repo. Its
  `CLAUDE.md` declares a fixed layout, so either way it is a documented-layout change that
  its owner must agree to.
- **Does `declare dev` serve the distro's docs/guide apps?** Under mounts this stops being
  policy and becomes a line: `{"/declare/apps/" → <distro>/apps}`. Default on or off?
- **Build cache eviction** (§5).
- **`declare.json` vs `declare.config.mjs`** (§7).
- **CLI now or later** (§7.2 step 5).
- Inherited from `packaging-options.md` §9: `declare verify` through the CLI; package
  versioning cadence and its relation to `BUILD_ID`.
