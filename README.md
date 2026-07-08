# neolzx

A clean-slate successor to OpenLaszlo: write declarative `.neolzx`, compile it to
JavaScript, render to the DOM or an own-pixels Canvas backend.

One self-contained tree — everything needed to build from source, run, and host is here.

## Layout

| dir | what |
|-----|------|
| `compiler/` | the `.neolzx` → JS compiler (Node-side build orchestration) — `src/` (TypeScript) + committed `dist/` (built JS) |
| `runtime/`  | the browser framework — parser, reactive core, layout, animation, DOM/Canvas backends (`src/` + committed `dist/`). Zero external deps; the compiler builds on it |
| `library/`  | bundled components authored in `.neolzx` (built on the runtime) |
| `examples/` | runnable sample apps — `neoweather`, `neocalendar` |
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

- **Dynamic (dev):** `npm start`. The server compiles each example's `.neolzx` on
  request — edit and reload. Nothing else runs (no chat, no persistent connection,
  no data API).
- **Static hosting:** serve the whole tree from any static host. The built `.js` are
  committed (in each area's `dist/`), so the tree runs as-is; the compiler and
  runtime are plain ES modules, so apps can compile in the browser. See
  [`design/hosting.md`](design/hosting.md).

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
