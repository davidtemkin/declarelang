# benchmarks — OpenLaszlo startup profiling

Reusable, app-agnostic machinery for measuring OpenLaszlo app **startup** — "where the
time goes between navigation and the app being on screen." Tracked as part of the
project so it can be re-run anytime.

## What it measures

The stable **`openlaszlo-5.0`** distro, pinned in one place (`distro.mjs`) so the baseline
doesn't drift as neo's compiler/runtime change — a result shift then means an *app/startup*
change, not a toolchain change. `distro.mjs` auto-locates `openlaszlo-5.0` by walking up to
a sibling of that name (works from here); override the target with:

```sh
BENCH_DISTRO=/path/to/distro  node tools/benchmarks/timeline.mjs ...
```

When neo's runtime is ready to be the target, point `distro.mjs` at it — every tool follows.

## The tools

| tool | what |
|------|------|
| `timeline.mjs` ★ | the primary table — one wall-clock startup timeline (milestone phases) |
| `serve.mjs` | compile + serve one app on demand (`?profile`/`?debug` aware) — dev path |
| `serve-static.mjs` | dumb static server for precompiled `.lzx.js` — prod path |
| `precompile.mjs` | build a production `<name>.lzx.js` + `.html` for `serve-static` |
| `lzprof.mjs` | LZX-runtime profiler — self-time by category × timeline phase |
| `browserprof.mjs` | browser pipeline (CDP trace): style / layout / paint / composite by phase |
| `categories.mjs` | shared classifier: an LZX function → cost category |
| `shot.mjs` | screenshot helper |

Plus assorted probes (`anim-*`, `interact`, `scrolldrag`, `inputleak`, `viewtab`, …).

Full method in [`METHODOLOGY.md`](METHODOLOGY.md); prior findings in the `RESULTS-*.md`.

## What is NOT kept here

Only the machinery. The **bench app variants** (modified copies of the apps — intro removed,
data inlined) and all **captured outputs** (screenshots, LFC snapshots, CDP traces) are
regenerable and were deliberately dropped. To run: build or point at a bench app per
`METHODOLOGY.md`, then invoke the tools above.
