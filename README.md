# Declare

A clean-slate successor to OpenLaszlo: write declarative `.declare`, compile it to
JavaScript, render to the DOM or an own-pixels Canvas backend.

One self-contained tree — everything needed to build from source, run, and host is here.

## Layout

| dir | what |
|-----|------|
| `compiler/` | the `.declare` → JS compiler (Node-side build orchestration) — `src/` (TypeScript) + committed `dist/` (built JS) |
| `runtime/`  | the browser framework — parser, reactive core, layout, animation, DOM/Canvas backends (`src/` + committed `dist/`). Zero external deps; the compiler builds on it |
| `library/`  | bundled components authored in `.declare` (built on the runtime) |
| `examples/` | runnable apps — the `site` homepage, `neoweather`, `neocalendar`; each ships a committed `prebuilt/` artifact for static hosting |
| `docs/`     | browsable documentation: authored `guide/` + generated `reference/` |
| `design/`   | design documentation (language, implementation, constraints, hosting, …) |
| `server/`   | the dev server — dynamic compilation + static serving, nothing else |
| `test/`     | the test suite (unit / perceptual / scaffold) |
| `tools/`    | build & dev tooling |

## Quickstart

```sh
npm install
npm run build          # tsc -b: runtime, then compiler → each area's dist/
npm start              # dev server → http://127.0.0.1:8200/
npm test               # unit + perceptual + scaffold
```

## Two ways to run an app

- **Dynamic (dev):** `npm start`. The server compiles each example's `.declare` on
  request — edit and reload. Nothing else runs (no chat, no persistent connection,
  no data API).
- **Static hosting (GitHub Pages):** serve the whole tree from any static host
  (`.nojekyll` is committed). Each page loads a committed **precompiled artifact**
  (`examples/<name>/prebuilt/<name>.js`) via `web/boot-static.js` and renders
  instantly — no server. At load it re-probes the compile's dependency closure to
  confirm the source hasn't moved, and warm-loads the in-browser compiler in the
  background (`dist-browser/declare-compiler.js`) for live edits. See
  [`design/hosting.md`](design/hosting.md).

> **Project rule — regenerate artifacts after editing an example.** The precompiled
> artifacts under `examples/<name>/prebuilt/` are committed and loaded by default, so
> regenerate them whenever you change an example's `.declare` (or the runtime it
> compiles against): run `node tools/prebuild.mjs` and commit the result **in the same
> commit** as the source change. Skip it and the static site ships a stale render —
> visitors get the old artifact plus a slower in-browser recompile until it catches up
> (the browser console logs a staleness warning when this happens).

## The compiler / runtime seam

`compiler/` is thin — 5 files — and depends **one-way** on `runtime/`. The parser,
type checker, and schema live in `runtime/` on purpose: neo instantiates and
compiles *in the browser*, so the runtime genuinely needs them. `compiler/` adds
only the Node-side build orchestration (file includes, the typecheck driver,
scaffolding, static dependency extraction).

## Building from source

Each area co-locates its source (`src/`) and built output (`dist/`), and the built
`.js` are **committed** — so the whole tree runs and hosts as-is, no build step
required (the OpenLaszlo distribution model). `npm run build` (`tsc -b`) regenerates
them — runtime first, then the compiler that references it. There is no oracle and no
verifier against a previous revision; correctness is the `test/` suite.

## workshop/

Not part of the distro (git-ignored). A local scratch area for the go-forward port
from OpenLaszlo: OL5 reference builds and comparison goldens, copied in as needed
and deleted once each app is fully neo-native.
