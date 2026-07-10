# OpenLaszlo startup benchmarking — methodology

This directory holds everything related to benchmarking OpenLaszlo app **startup** —
"where does the time go between navigation and the app being on screen."

> **Note (2026-07-08):** now lives at **`declarelang/tools/benchmarks/`** as tracked, reusable
> machinery — the tools are flattened into this dir; the `apps/` bench variants and captured
> outputs (screenshots, snapshots) below are regenerable and are **not** kept. See `README.md`
> for the current layout. The methodology itself is unchanged.

**Location & toolchain pin.** It **measures the
stable `openlaszlo-5.0` distro**, not neo — pinned in one place (`distro.mjs`) so the
baseline does NOT drift as neo's compiler/runtime change. A result shift therefore means an
*app/startup* change, never a toolchain change. Neither distro is modified by this work. When
neo's runtime is ready to be the target, point `distro.mjs` at it (set `BENCH_DISTRO`, or edit
its one fallback) — every tool follows.

```
openlaszlo-neo/benchmarks/
  METHODOLOGY.md      ← this file
  tools/              ← reusable, app-agnostic measurement harnesses
    distro.mjs          ← THE pin: which toolchain to measure (default: stable openlaszlo-5.0)
    timeline.mjs        ★ unified wall-clock milestone timeline (the primary table — see §5)
    serve.mjs           compile+serve one bench app on demand (?profile/?debug aware) — dev path
    serve-static.mjs    dumb static file server: serves PRECOMPILED .lzx.js, no compiler — prod path
    precompile.mjs      build production <name>.lzx.js + static <name>.html for serve-static
    lzprof.mjs          LZX-runtime profiler (?profile), self-time by category × timeline phase
    browserprof.mjs     browser pipeline (CDP trace): style/layout/paint/composite by phase
    categories.mjs      shared classifier: an LZX function → cost category
    shot.mjs            screenshot helper
  apps/               ← modified, self-contained bench variants of the apps
    calendar/           cal-bench.lzx (deferred) + cal-bench-eager.lzx (immediate, inline data) [+ .lzx.js/.html]
    dashboard/          dashboard-bench.lzx (skip-login, eager) [+ .lzx.js/.html]
  RESULTS-calendar.md   deferred vs. immediate instantiation, phased + categorized
  RESULTS-dashboard.md  eager skip-login, phased + categorized + resource-load order
```

All measurements are **desktop / headless Chrome for Testing on this machine**. See the
caveats at the end before quoting numbers as absolutes.

---

## What we measure, and where the boundary is

A startup has two halves, on one main thread:

1. **The LZX runtime + app JS** — parsing the compiled app, building the view tree,
   wiring constraints, creating the DOM "shadows." This is directly instrumentable.
2. **The browser's own work** — Recalculate Style, Layout (reflow), Paint, Composite. This
   is C++ inside Chrome, *not* visible to any JS profiler, but Chrome accounts for it via
   the DevTools tracing / `Performance.getMetrics` interfaces.

We measure both, on the same clock, and split each by category and by **timeline phase**.

### `canvas.init` vs first paint
`canvas.init` is when the runtime finishes the **logical** view tree (end of the JS build).
First paint is when pixels appear. They are close but not identical; we mark both.

---

## 1. The LZX-runtime profiler (`lzprof.mjs`)

The `?profile` build (`lfc-profile.js`) wraps **every** LFC/app function with a meter that,
on entry/exit, records the function name into `$lzprofiler` buffers keyed by `Date.now()`.
Its **call counts are exact**, but its timer is **1 ms-grain** — far too coarse for
per-function self-time (hundreds of calls land in each millisecond).

So the harness:
1. Replaces the meter's buffers with a `Proxy` and stamps **`performance.now()`** on every
   call/return write → the full ordered call/return stream at sub-ms resolution.
2. Reconstructs a call stack → **self-time per function** (the interval between consecutive
   events is charged to whoever is on top of the stack).
3. Classifies each function (`categories.mjs`) and sums self-time + calls per category,
   **per timeline phase** (phases delimited by the app's `__olmark()` calls + `canvas-init`
   + `first-paint`).

### Categories (`categories.mjs`)
- **instantiate** — building the *logical* `LzView`/`LzNode` tree: constructors, `init`,
  `__LZapplyArgs`, `makeChild`, `Class.make`/`Instance`, `mergeAttributes`.
- **constraint** — the dependency/constraint machinery: `LzDelegate` (create/register/
  execute), `LzEvent`/`LzDeclaredEvent` (the `on<attr>` events constraints ride on),
  `applyConstraintExpr`/`Method`, `LzAlwaysExpr`/`OnceExpr`, `… dependencies`.
- **attr-set** — `setAttribute` + generated `$lzc$set_*` value setters (the boundary where
  a constraint's computed value is written).
- **sprite-dom** — the `LzSprite` kernel layer: the **JS that creates and styles the DOM
  shadow** (`createElement`/`appendChild`, `setHeight`, `__setZ`, `setClickable`). This is
  *not* in "instantiate" — every view has a separate DOM shadow, counted here.
- **font / color / data / layout / other** — remaining subsystems.

> **Important — instrumented time tracks call frequency.** The per-call meter overhead
> dominates the instrumented self-time, so each category's **%time ≈ its %calls** (verified:
> they match within ~1 pt). Treat **call counts as the exact, reliable signal**; treat ms as
> "this share of work" projected onto the real (un-instrumented) startup budget.

---

## 2. The browser-pipeline profiler (`browserprof.mjs`)

Runs the **production** build (no instrumentation) and captures a DevTools trace, summing
the `dur` of the rendering-pipeline events per phase:

- **style** — `RecalculateStyles` / `UpdateLayoutTree` (applying CSS to compute styles)
- **layout** — `Layout` (reflow: positions/sizes)
- **paint** — `Paint` / `PaintImage` (record paint ops)
- **composite** — `CompositeLayers` / `Commit` / `UpdateLayerTree`

Also reads `page.metrics()` (`Performance.getMetrics`) for clean cumulative
`RecalcStyleDuration` / `LayoutDuration` / `ScriptDuration`, and the paint-timing API for
first paint. Trace events are aligned to the app timeline via the `performance.mark('OL:…')`
events the app emits (matched to the `performance.now()` values in `window.__olmarks`).

> "DOM instantiation" is **not** a separate browser event — DOM nodes are created
> synchronously inside JS (the `sprite-dom` category of the LZX profile). The browser's
> involvement *begins* at style recalc. Off-thread rasterization runs in parallel and is
> **not** counted (it doesn't block the main thread).

---

## 3. Timeline phases (`__olmark`)

A bench app calls `window.__olmark('name')` at lifecycle points. The harness injects
`__olmark` (records `performance.now()` and emits `performance.mark('OL:name')`). Both
profilers segment their measurements by these boundaries, e.g. for the calendar:

```
start → data-loaded → events-hydrated → first-paint → (end)
```

so you get "time to" each phase, broken down by category, across LFC + app code.

---

## 5. The unified wall-clock timeline (`timeline.mjs`) — the primary table

This is the headline table for every benchmark going forward. It answers one question on **one
wall clock**: between navigation and "fully rendered & ready for input," what happened at each
milestone, and how long did each step take — counting **all** activity, the Laszlo/runtime/app
layer *and* the browser pipeline.

```
node timeline.mjs <url> <label> [outJson] [lzprof-<label>.json]
```

Each **row is a sequential milestone**, carrying `t=` (ms from navigation start) and the **step
duration** (gap since the previous milestone). The step's wall-clock time is decomposed so the
columns **sum to the duration**:

| column | what it is |
|---|---|
| **JS (Laszlo/app)** | main-thread time in the LZX runtime + app code (= main-thread busy − browser rendering) |
| **style / layout / paint / composite** | the browser pipeline, from the DevTools trace |
| **idle/wait** | main thread not busy — network/data wait, image-decode wait, timer gaps |

Milestones are gathered from a **single production (un-instrumented) run** so they share one
clock: navigation + resource timing (runtime/app JS fetched), the app's `window.__olmark()`s
(`app-oninit`, `data-loaded`, `dashboard-shown`, …), a harness-marked `canvas-init`
(polls `canvas.isinited`), and trace-derived **first-paint**, **fully-rendered** (last paint of
the startup burst), and **ready-for-input** (end of the last heavy main-thread task near
`canvas-init` — a running framerate timer means the thread never goes *fully* quiet, so we use
heavy-task-end, not total silence).

How the split is computed from the trace: main-thread **busy** = the union of
`ThreadControllerImpl::RunTask` intervals (union-merged, since nested run-loops overlap; the
off-main-thread `ThreadPool_RunTask` is excluded); **rendering** = the summed
style/layout/paint/composite sub-events; **JS** = busy − rendering; **idle** = duration − busy.
If the matching `lzprof-<label>.json` is passed, each milestone that lines up with a `?profile`
phase also shows that phase's category **mix** (instantiate/constraint/…) as an italic hint —
proportions only (the `?profile` clock is separate and its ms are meter-inflated; the wall-clock
JS column is the truth). The hint is attached by exact mark-name match only, so it never appears
on post-`canvas.init` rows (where `?profile` is blind — see §4).

> This table **supersedes** the older per-phase "each Laszlo step / browser activity" split
> tables: it carries the same phase structure but adds the absolute `t=`, the per-step duration,
> the wall-clock JS/idle split, and "fully rendered / ready for input" — all on one clock.
> Numbers are a single representative run; treat ±10–15 % as noise (see Caveats).

---

## 4. Measuring *deferred* work — the meter boundary, and how to cross it

`?profile` **auto-stops at `canvas.init`** (the first logical render). Any work OpenLaszlo
defers past that point — idle-queue instantiation (`initstage="late"`, the
`LzInstantiator` make-queue), or views gated on an **async** data fetch — is therefore
**invisible to `?profile`** (the browser profiler still sees it; it's clock-based).

To measure that deferred work on the LZX side, the bench variants pull it *back inside* the
meter window by removing both sources of deferral:

- **Instantiation queue** → `lz.Instantiator.isimmediate = true` (set in a top-of-canvas
  `<script>`, before the tree builds). `requestInstantiation()` then builds synchronously
  instead of queuing, which also overrides `initstage="late"`. (Flipping the `initstage`
  attribute to `"immediate"` does the same for a specific class.)
- **Async data gate** → pre-bake the data **inline** so it is present at parse time. For the
  calendar, `cal-data-eager.lzx` inlines the displayed month into the `eventdata` dataset;
  `loadData()`'s own `datatester.hasNode()` guard then finds it and issues no fetch, so the
  event views replicate **synchronously during the static build**.

The result is a one-stage "immediate" variant whose `?profile` numbers include the normally
deferred work, directly comparable to the stock two-stage "deferred" variant. The **delta**
between them is the cost of the deferred stage (see RESULTS-calendar.md: +8,153 calls for the
calendar's event hydration). Finding across both apps: **deferral re-phases work off the path
to first render; it does not make the work cheaper, and the browser-rendering cost is
identical either way.**

See **RESULTS-calendar.md** (deferred vs. immediate) and **RESULTS-dashboard.md** (eager
skip-login + resource-load order) for the full per-phase, per-category tables.

---

## Baseline results (un-segmented, current distro apps)

Captured before the bench variants existed, as the reference picture.

### LZX runtime — work breakdown to `canvas.init`

| subsystem | CALENDAR calls | % | DASHBOARD calls | % |
|---|--:|--:|--:|--:|
| **view instantiation** | 26,451 | **40.8%** | 8,678 | **30.3%** |
| **constraint resolution** | 16,651 | **25.7%** | 7,433 | **26.0%** |
| attribute set/calc | 4,290 | 6.6% | 1,718 | 6.0% |
| sprite/DOM (JS side) | 8,521 | 13.1% | 5,528 | 19.3% |
| font / color / data / layout / other | 8,938 | 13.8% | 5,284 | 18.4% |
| **total fn calls** | **64,851** | | **28,641** | |

Real (un-instrumented) time to `canvas.init`: **calendar ≈ 96 ms, dashboard ≈ 91 ms**.

### Browser pipeline — main thread, nav → settled

| | CALENDAR | DASHBOARD |
|---|--:|--:|
| first paint | 40 ms | 32 ms |
| Recalculate Style (style application) | 7.9 ms | 7.5 ms |
| Layout (reflow) | 9.1 ms | 6.4 ms |
| Paint | 13.1 ms¹ | 1.4 ms |
| Composite + layer | 8.0 ms | 5.3 ms |
| **rendering pipeline total** | **~38 ms** | **~21 ms** |
| JS (`ScriptDuration`, comparison) | ~85 ms | ~39 ms → init |

¹ Calendar's high paint is the **intro animation** (~90 frames). The static initial render
is ~17 ms (style+layout). **JS dominates startup ~2–4× over rendering.**

### Versus web norms — precompiled-static, immediate (non-deferred) builds

Measured **precompiled-static** (production `.lzx.js` on a dumb file server — no compile, no
source-mtime check; `serve-static.mjs`). Confirmed equal to the compile-harness within noise
(calendar 151 vs 147 ms, dashboard 534 vs 536 ms — the dev server's per-request "compile" is a
disk-cache hit, < 2 ms). Numbers below are **localhost + fast desktop** (≈ zero network).

| metric | Calendar | Dashboard | Google "Good" (CWV) | Median web page¹ | Typical SPA² |
|---|--:|--:|---|--:|---|
| First Contentful Paint (splash) | **36 ms** | **32 ms** | ≤ 1.8 s | ~2.0 s | 1–3 s |
| Largest Contentful Paint (app on screen) | **151 ms** | **534 ms** | ≤ 2.5 s | ~2.8 s | 2.5–5 s |
| Total Blocking Time (lab) | **~0–20 ms** | **~60–100 ms** | ≤ 200 ms | ~250 ms | 0.3–2 s |
| Time to Interactive | **151 ms** | **534 ms** | ≤ 3.8 s | ~5 s | 3–8 s |
| JS transferred (gzip) | **~149 KB** | **~152 KB** | — | 500 KB–1 MB | 0.3–1 MB+ |
| HTTP requests → fully painted | ~6 + ~30 img | ~6 + **146 img** | — | ~70 | 30–100 |

¹ HTTP Archive median, 2024.  ² React/Vue/Angular app, rough band.  JS payload = embed 8 KB +
runtime `lfc.js` **96 KB** (fixed, amortized across apps) + the app itself (calendar 45 KB,
dashboard 48 KB gzip). Leaner than a typical SPA bundle even though `lfc.js` is a whole app
platform; the distinctive cost is the **per-node reactive constraint graph** built at
instantiation (≈ 25 % of the build) — a fine-grained-reactivity tax (cf. Solid/MobX).

On localhost/desktop both apps sit **10–50× under** every "good" threshold. The honest read,
though, requires projecting off localhost:

### Real-world projection (localhost numbers × network × CPU)

Localhost hides the two things that dominate the field: **network** (localhost transfer ≈ 0;
real visitors download ~150 KB of JS over a *serial* embed→lfc→app chain, plus the dashboard's
146-image burst) and **CPU** (this desktop is ~4–6× a mid-tier phone; the synchronous tree
build is one long task that scales with CPU).

| environment | Calendar "app on screen" | Dashboard "app on screen" |
|---|--:|--:|
| **measured: localhost + fast desktop** | **0.15 s** | **0.53 s** |
| desktop + good broadband (50–100 Mbps) | ~0.3–0.5 s | ~0.8–1.2 s |
| mid-tier mobile + 4G | ~1.0–1.6 s | ~2–3 s |
| low-end mobile + slow 3G (Lighthouse worst case) | ~3–4 s | ~5–7 s |

So: **still "good" on desktop/broadband and mid-tier-mobile/4G** (LCP under 2.5 s), but the
**dashboard slips toward "needs improvement / poor" on poor mobile networks** — driven by the
146-image burst (network) and the ~140 ms synchronous build (CPU → TBT) — exactly the two
levers flagged in RESULTS-dashboard.md. The calendar stays green almost everywhere.

---

## Caveats

- **Desktop, fast machine, headless.** Core Web Vitals is field data weighted toward mobile;
  a mid-tier phone is ~4–6× slower (scale the numbers accordingly — TBT/INP would approach
  "needs improvement" there).
- **Instrumented ms ≈ call-share** in the LZX profile (per-call meter overhead). Counts are
  exact; ms are best read as a *share of the real budget*.
- The browser numbers are **main-thread**; off-thread raster runs in parallel and isn't
  counted (it doesn't block).
- The "settled" window in `browserprof` includes any intro animation / background work.

## Running

From `openlaszlo-neo/benchmarks/tools/`. Two serving paths — both measure the same pinned
`openlaszlo-5.0` toolchain (`distro.mjs`); pick by what you're testing.

**Production / precompiled-static** (what the headline web-norms numbers use):

```sh
node precompile.mjs                                       # build .lzx.js + .html for the bench apps
node serve-static.mjs ../apps 8090                        # dumb file server, NO compiler
#   http://localhost:8090/calendar/cal-bench-eager.html
#   http://localhost:8090/dashboard/dashboard-bench.html
node timeline.mjs "http://localhost:8090/calendar/cal-bench-eager.html" cal-static \
     /tmp/timeline-cal-static.json /tmp/lzprof-cal-eager.json            # ★ wall-clock timeline
```

**Dev / compile-on-demand** (needed for `?profile`, since lzprof needs the instrumented build):

```sh
node serve.mjs ../apps/<app> <main>.lzx 8096             # compiles per request (disk-cached)
node lzprof.mjs   "http://localhost:8096/<main>.lzx?profile=true" <label> /tmp/lzprof-<label>.json
node browserprof.mjs "http://localhost:8096/<main>.lzx"           <label>   # browser pipeline (detail)
node shot.mjs        "http://localhost:8096/<main>.lzx" 1000 700 out.png
```

Run `lzprof.mjs` first (it writes the JSON that `timeline.mjs` reads for its category hints).
To measure a different toolchain (e.g. neo's own runtime once it's ready): `BENCH_DISTRO=../..
node serve.mjs …`, or edit the fallback in `tools/distro.mjs`.
