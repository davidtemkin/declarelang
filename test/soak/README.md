# Soaks: trying to break memory and lifecycle

Adversarial programs and drivers that build and tear down views, overlays, motion,
islands and whole programs over and over, and report what grows per cycle after
warm-up. Nothing here passes or fails; each prints `flat` or `GROWS` with the
numbers. None of it is part of `npm test`.

## Headless (Node)

Run every one with `node --expose-gc test/soak/<name>.mjs`. A reading (`lib.mjs`) is
the kernel's high-water marks (`cells`, `rules`, `code`, `consts`), the live rule
count (`live`), the JS heap after forced GC (`heapKB`), live runtime `Node`/`View`
objects (`v8.queryObjects`, exact), animation-clock `tickers` and pending `timers`.
`lib.mjs` installs a setTimeout frame source so the clock runs as in a browser
(`--no-raf` turns it off); `--loud` shows the runtime's console.

| file | what it does |
|---|---|
| `basic.mjs` | control: keyless rows rebuilt; a small program built and discarded |
| `lifecycle.mjs` | the matrix: one feature per victim class, put in its active state, discarded by row rebuild and by `exists`. `--only=a,b` `--mode=rows\|exists` `--n=` |
| `overlays.mjs` | Popover/Menu/ContextMenu/Dialog/Sheet/Toast opened in rows, rows discarded while open; prints `OverlayStrata.stack` and Keys' nav claims |
| `overlays-control.mjs`, `overlays-census.mjs` | the controls (closed first, rows kept) and the heap census + retaining path (`--kind=`, `--close`) |
| `menu-cells.mjs` | which kernel cells a Menu in a rebuilt row never gives back (`--gc`, `--keep-rows`, `--no-open`) |
| `scroll-anchor.mjs` | a scrolled list with keyless rows rebuilt: cells allocated by the scroll anchor's reads of a dead row |
| `virtual-cells.mjs`, `virtual-heap.mjs` | virtualized lists: the windowing's cells; the extent ledger keeping replaced records (`--keyed`) |
| `spring-dead.mjs` | a Spring / Animator moving when its view is discarded: does it leave the clock |
| `layout-swap.mjs` | a view's `layout` replaced at run time (fresh objects vs two alternated) |
| `structure.mjs` | nested replication, classFor, wholesale data, long expressions, wide lists, 150-deep nesting, theme switching, a shared record, createView |
| `wholesale-cells.mjs` | `d.set([], …)` every step: cells with and without GC |
| `dead.mjs` | what a program can do to a discarded view through a reference (read, write, show, focus, createView, discard again) |
| `programs.mjs` | every corpus app built and discarded (`--only=todo,calendar`) |
| `program-min.mjs` | the smallest programs that stay alive after `app.discard()`, one feature each |
| `program-why.mjs <app>`, `program-rules.mjs <app>` | for one program: retaining path to the discarded App, cells never freed by site, rules left standing by site |
| `lib.mjs`, `retainers.mjs`, `why-alive.mjs` | the harness: readings, `trackCells()` / `trackRules()` (allocation sites still held), heap census and retaining paths (tag victims with `v.__soakDead = {}`) |

## Browser (real Chrome, real input)

`node tools/verify.mjs test/soak/<name>.declare --assert test/soak/<name>.assert.mjs`.
A reading (`browser-lib.mjs`) is the JS heap after `HeapProfiler.collectGarbage`, DOM
nodes and JS event listeners (Chrome's `Performance.getMetrics`, which count detached
nodes still held), live `View` objects (`Runtime.queryObjects`), plus page counters.
The heap moves 3–15 KB a cycle under verify's own logging even in the controls; `views`,
`dom` and `listeners` are the exact signals. verify serves the DOM renderer
(`defaultFlags [ render = canvas ]` is not honoured there), so the canvas island path is
untested in a browser.

| program | script | what it does |
|---|---|---|
| `rows-input.declare` | `rows-input.assert.mjs` | hover, tooltip, press-that-discards, popover open, then rows rebuilt |
| `rows-edit.declare` | `rows-edit.assert.mjs` | a focused TextInput rebuilt by a key, a drag that rebuilds mid-drag, a modal Dialog open when its row goes, Markdown/HTMLText/drawings rebuilt |
| `hidden-pane.declare` | `hidden-pane.assert.mjs` | rows rebuilt in a hidden pane; a Toast and a right-click ContextMenu in rows that are rebuilt |
| `virtual-scroll.declare` | `virtual-scroll.assert.mjs` | wheel-scrolling a virtualized list while its records are replaced; do discarded rows' Keys still hear keys |
| `island-host.declare` (+ `island-tenant.declare`) | `island-host.assert.mjs` | AppIsland `program` set to `""` and back |
| `island-swap.declare` (+ `island-tenant-b.declare`) | `island-swap.assert.mjs` | AppIsland `program` changed between two programs |
| `island-exists.declare` | `island-exists.assert.mjs` | an AppIsland built and discarded with its tenant inside |
| `island-each.declare` (+ `tenants/`) | `island-each.assert.mjs`, `island-why.assert.mjs` | per tenant kind; and the retaining path of a discarded tenant (`SOAK_KIND=button` to pick one) |
| `apps/desktop/desktop.declare` | `desktop-windows.assert.mjs`, `desktop-why.assert.mjs` | the corpus desktop: open 50 Birds from the dock, close it, repeat; and what holds the closed window's program |
