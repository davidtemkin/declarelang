# Running & hosting

neolzx runs the same build two ways.

## Dynamic (dev server)

`npm start` runs `server/index.mjs`. It serves the tree and compiles each example's
`.neolzx` on request (`/examples/<name>/` for DOM, `/examples/<name>/canvas` for
Canvas). Compile-on-request means an edit + reload shows immediately. That is the
server's entire job — no chat, no persistent connection, no data API.

## Static hosting (in-browser compilation)

The compiler and runtime are plain ES modules (`compiler/dist/*.js`,
`runtime/dist/*.js`, no bundler) and are committed, so the whole tree can be served
from any dumb static host as-is and apps can compile in the browser.

`compile()` is already parameterized by an `IncludeHost` (defaulting to the
Node/filesystem host). The remaining work to make in-browser compilation turnkey:

1. **A fetch-based `IncludeHost`** — resolve `<include>`s over HTTP instead of `fs`.
2. **Make the `node:` imports lazy.** `compiler/include-node.ts` (`node:fs`) and
   `compiler/typecheck.ts` (`node:path`, `node:module`) are pulled in by static
   import today, which stops `compiler/dist/compile.js` from loading in a browser.
   Move them behind the host seam / dynamic `import()` so the browser build is
   Node-free.
3. **A service worker** (`service-worker.js`) that intercepts `/examples/<name>/`,
   compiles with the browser build, serves the host page, and caches static assets
   for offline use.

Until then, static deployment uses **precompilation**: compile each example at
build time and ship the JS (see `examples/neoweather/deploy-build.mjs`).

## Why the parser lives in `runtime/`, not `compiler/`

In OpenLaszlo the parser was compiler-only (server-side Java); the runtime just ran
precompiled JS. neo differs fundamentally: it instantiates and compiles in the
browser, so the parser/checker/schema are part of the runtime foundation. `compiler/`
is only the Node-side orchestration layered on top, with a one-way dependency on
`runtime/`.
