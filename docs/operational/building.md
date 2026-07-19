# Building for production

For deployment you do not want a compiler on the critical path. `declarec` precompiles an app
at build time and emits a self-contained, static directory — the Declare analogue of a
bundler's production build.

```bash
node tools/declarec.mjs apps/calendar/calendar.declare -o dist
```

## What it emits, and why it's small

The output is a directory with an `index.html`, a content-hashed `app.<hash>.js`, and your
data assets copied alongside — deployable to any static host. On the flagship calendar it lands
around **45 KB gzipped**. Four things keep it small:

- **Precompile.** Parse, resolve, and typecheck happen once, now; the program ships as a JSON
  string parsed at boot, with source positions stripped.
- **Run-path only.** esbuild bundles the runtime's render path and tree-shakes the rest — the
  parser, checker, and typechecker never ship.
- **One backend.** DOM by default, or `--canvas` for the single-`<canvas>` renderer; only the
  chosen one is bundled.
- **Slim registry.** Only the components the app can actually instantiate are included. If a
  component appears *nowhere* statically (built by name from loaded data), keep it with a
  top-level `use [ Name ]` list, or slimming will drop it.

## Flags

| flag | effect |
|---|---|
| `-o <dir>` | output directory (default `dist`) |
| `--canvas` | canvas backend instead of DOM |
| `--crawler` | bake the extracted static document into `index.html` (crawlers read it; the client clears it at boot) |
| `--extract` | also write the static document standalone as `<name>.extract.html` |
| `--debug` | keep source positions and skip slimming (for debugging a build) |
| `--quiet` | suppress progress output |

## Two ways to deploy

- **Host the distro** — serve the repo as-is; every app compiles on request (Node) or in the
  browser (static host + service worker). This is what runs the docs and homepage.
- **Ship a build** — run `declarec`, deploy the `dist/`. One app, no compiler at run time.

**Prewarm** is a third, separate thing: a *validated* cache for curated apps, precompiled and
checked against a closure hash so a warm start skips compilation without trusting a stale
artifact. It keeps the compile-on-request model fast; it is not a `declarec` build. Keeping
those two "precompiled" senses distinct avoids confusion. The concepts are
[Ship it](declare-docs:guide:loop); this page is the commands.
