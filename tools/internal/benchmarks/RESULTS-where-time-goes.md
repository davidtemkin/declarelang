# Where the startup time goes — 3 apps × 2 runtimes, dpr=2 (Retina)

**Question.** Across three eager OpenLaszlo apps of increasing weight — **Dashboard**, **month
Calendar**, and the new **year Calendar** (`calendar-stress`) — where does the startup time actually
go, DHTML vs the own-pixels **canvas** kernel, at **dpr=2**? This is a **unified, measurement-only**
profile: one sweep, one machine, one clock, so the pattern is legible — where canvas **wins** (the DOM
style/layout/paint/composite pipeline collapses to ~0) and where it **pays** (the M1 full-scene repaint,
i.e. the Dashboard's 146-image burst).

**Measurement only** — no kernel/app/runtime logic was modified. The canvas side is the **frozen
dpr-aware snapshot** `LFCcanvas.js` (md5 `da8b501e383ce4422225b8bf2673aeb6`, 376 250 B — byte-identical
copy in all three app dirs), so the result is isolated from ongoing kernel work; the DHTML side is the
**pristine** distro `lfc.js` (434 651 B). The only additive artifact is a **no-events data variant** of
the year calendar, used to isolate its structure/events phases by subtraction (see §5) — it changes no
app logic, only strips `<event>` nodes from the seeded dataset.

---

## Method

- **Harness:** `tools/timeline.mjs` (PRIMARY — wall-clock milestone timeline, main-thread JS + browser
  pipeline on one clock) and `tools/browserprof.mjs` (CDP trace incl. `cc`/`gpu`, + `page.metrics`),
  both at **`CAP_DPR=2`**. Timeline **×5** per config (**×10** for the DHTML configs + `yr-cv`, whose
  "ready" tail is contention-sensitive — see caveats); browserprof **×3**. Medians reported, `[min..max]`
  where it matters.
- **Served** by `tools/serve-static.mjs ../apps 8301` — a dumb static file server on a **free port
  (8301)**, precompiled `.lzx.js` bytes, **no compiler in the loop**.
- **Chrome:** pinned Chrome-for-Testing `mac_arm-146.0.7680.31`, headless, `--no-sandbox`,
  `--force-device-scale-factor=2` + `deviceScaleFactor:2`, fresh `userDataDir` per run.
- **Targets** (canvas → per-dir frozen `LFCcanvas.js`; dhtml → distro `lfc.js`):
  - dashboard `apps/dashboard/dash-{canvas,dhtml}.html` (1000×720)
  - month calendar `apps/calendar/cal-{canvas,dhtml}.html` (835×600)
  - year calendar `apps/calendar-stress/cal-stress-{canvas,dhtml}.html` (900×640)
- **Milestones:** `first-paint` (paint-timing API) → `app-oninit` (canvas `oninit`) → `canvas-init`
  (harness-polled `canvas.isinited` = logical view tree finalized) → `fully-rendered` / `ready-for-input`
  (trace-derived: last paint / end of the last heavy main-thread task in the startup burst).
- **Visual parity confirmed at 2×** for all three apps: canvas and DHTML render pixel-identically. Canvas
  draws the whole scene as own-pixels (`canvas`=1, `img`=0); DHTML uses a DOM shadow per view. Screenshots
  under `screenshots/probe-*-dpr2.png`.

### App scale (measured, dpr=2 — identical view tree on both runtimes)

| app | LzViews (both) | canvas DOM nodes | **DHTML DOM nodes** | DHTML `<img>` | event bars |
|---|--:|--:|--:|--:|--:|
| **month Calendar** | 696 | 21 | 1 163 | 120 | — |
| **Dashboard** | 1 026 | 16 | 2 093 | **343** (146-img chrome burst) | — |
| **year Calendar** | **6 932** | 13 | **15 509** | **0** | **1 483** |

The year calendar is ~7× the Dashboard's view count and builds a **15 509-node DOM** on DHTML — and,
crucially, has **zero images**. That combination (huge DOM, no image burst) is what makes it the cleanest
demonstration of DOM-pipeline elimination in the set.

---

## 1. PRIMARY — the unified milestone ladder (timeline, median ms)

| milestone | **Month cv** | **Month dh** | **Dash cv** | **Dash dh** | **Year cv** | **Year dh** |
|---|--:|--:|--:|--:|--:|--:|
| first paint (splash) | 32 | 36 | **56** | **212** | 32 | 36 |
| app-oninit | 91.8 | 101.1 | 142.3 | 166.3 | 209.0 | 292.1 |
| **canvas-init** (logical tree done) | **109.5** | **127.1** | **157.0** | **193.1** | **227.5** | **362.8** |
| fully rendered | 39.7¹ | 141.2 | 499.8 | 531.7 | 32.5¹ | 354.7 |
| **ready for input** | **117.8** | **142.5** | **499.8** | **532.1** | **242.8** | **362.8** |
| — range [min..max] | [115..137] | [136..478] | [498..501] | [530..689] | [227..691] | [355..688] |

**canvas − dhtml delta at ready-for-input (the headline):**

| app @ dpr=2 | canvas | dhtml | **Δ (cv−dh)** | **Δ%** |
|---|--:|--:|--:|--:|
| **month Calendar** | 117.8 | 142.5 | **−24.7 ms** | **−17.3 %** |
| **Dashboard** | 499.8 | 532.1 | **−32.3 ms** | **−6.1 %** |
| **year Calendar** | 242.8 | 362.8 | **−120.0 ms** | **−33.1 %** |

¹ For the canvas builds "fully rendered" (last *paint* event) lands at the splash (~33–40 ms) because the
whole scene is one own-pixels blit with no later DOM paints; "ready for input" is the true build-done point.
The Dashboard's `ready` = ~500 ms on **both** runtimes is the shared **146-image chrome burst** that lands
after `canvas-init` (a cost neither kernel avoids). The two calendars have **no** post-`canvas-init` burst
(inline data, no image stream), so their `ready` ≈ `canvas-init`.

**Read:** the canvas win **grows with DOM size when there is no image burst** — month −17 %, year −33 % —
and is **thinnest on the Dashboard (−6 %)**, the one app whose startup is dominated by the image burst
rather than the tree build. The Dashboard's earlier cross-benchmark result reproduces exactly (prior
−33.5 ms / −6.3 %; here −32.3 ms / −6.1 %), validating the sweep's consistency.

---

## 2. Category split — main-thread ms (timeline, whole startup, median)

| column | **Month cv** | **Month dh** | **Dash cv** | **Dash dh** | **Year cv** | **Year dh** |
|---|--:|--:|--:|--:|--:|--:|
| **JS (Laszlo/app)** | 81.4 | 93.4 | 267.7 | 202.9 | 206.3 | 239.9 |
| style | 0.2 | 2.8 | 2.0 | 9.7 | 0.2 | **29.8** |
| layout | 0.1 | 6.9 | 0.5 | 12.7 | 0.1 | **35.0** |
| paint | 0.1 | 2.5 | 0.3 | 13.7 | 0.1 | **29.1** |
| composite (main-thread) | 0.1 | 1.0 | 0.9 | 8.9 | 0.1 | 10.5 |
| **DOM pipeline (Σ style+layout+paint+comp)** | **~0.5** | **13.2** | **~3.7** | **45.0** | **~0.5** | **104.4** |
| idle / wait | 34.2 | 36.6 | 228.4 | 293.5 | 29.7 | 31.8 |

**The DOM-pipeline collapse is total and dpr-invariant.** On canvas, style+layout+paint+composite is
**~0.5 ms** for every app, from a 696-view calendar to a 6 932-view year grid — because there is no DOM to
style/lay-out/paint; the runtime draws pixels directly. On DHTML that pipeline **scales with node count**:
**13 → 45 → 104 ms** as the DOM grows 1.2k → 2.1k → 15.5k nodes. That growing pipeline cost is the engine
of the widening canvas win.

The **JS column tells the second half of the story** — and it splits by app:
- **Month & Year calendars: canvas JS is LOWER** (81 vs 93; 206 vs 240). DHTML's extra JS is the
  **DOM-shadow construction** — every view runs `createElement`/`appendChild`/style on top of the shared
  instantiation+constraint work. No image burst, so canvas never has to redraw.
- **Dashboard: canvas JS is HIGHER** (268 vs 203). That inversion is the **146-image burst** (§3): with no
  dirty-rects, each image completion repaints the whole 2000×1440 surface **on the main thread as JS**.

## 2b. Browser-pipeline confirmation (browserprof, CDP trace incl. cc/gpu, median of 3)

| metric | **Month cv** | **Month dh** | **Dash cv** | **Dash dh** | **Year cv** | **Year dh** |
|---|--:|--:|--:|--:|--:|--:|
| first-paint (ms) | 32 | 32 | 60 | 216 | 36 | 36 |
| trace style | 0.3 | 3.0 | 2.0 | 10.5 | 0.2 | 29.7 |
| trace layout | 0.1 | 7.0 | 0.4 | 13.1 | 0.1 | 40.3 |
| trace paint | 0.1 | 2.1 | 0.3 | 14.4 | 0.1 | 19.5 |
| trace composite (incl cc/gpu) | **8.2** | 3.4 | **15.8** | 4.6 | **9.7** | 3.4 |
| `ScriptDuration` | 72.9 | 68.7 | **178.3** | 117.3 | 171.9 | **248.2** |
| **`TaskDuration` (total main-thread)** | **102.3** | 107.8 | **233.7** | 201.4 | **212.4** | **364.4** |
| Layout count | **2** | 23 | **11** | **155** | **2** | 9 |
| RecalcStyle count | **5** | 26 | **15** | **156** | **3** | 11 |

`TaskDuration` (**total** main-thread work) is the cleanest "who did more" signal, and it makes the pattern
unmistakable:
- **Month:** canvas 102 < dhtml 108 — canvas does **less** total work (clean win).
- **Year:** canvas 212 **≪** dhtml 364 — canvas does **−152 ms** less work. The DHTML side burns 93 ms in
  the style/layout/paint pipeline (Script 248 + pipeline) that canvas simply doesn't have. **Clean, large win.**
- **Dashboard:** canvas 234 **>** dhtml 201 — canvas does **+32 ms MORE** total work. This is the *only*
  app where the own-pixels kernel loses on total main-thread work, and the reason is entirely §3.

Note the **canvas composite line (8–16 ms)** — that is the one place canvas spends more than DHTML: the
GPU/`cc` commit of the whole backing surface. It is the mirror image of DHTML's paint/layout cost, and it
does not grow the way DHTML's pipeline does (year 9.7 vs dhtml 92.9 total render).

---

## 3. Where canvas WINS and where it PAYS — the Dashboard build-vs-burst split

The Dashboard is the app that exposes the M1 caveat. Splitting its timeline at `canvas-init` (median ms):

| phase | dur | JS | style | layout | paint | composite | idle |
|---|--:|--:|--:|--:|--:|--:|--:|
| **BUILD (nav → canvas-init)** | | | | | | | |
| canvas | 157.0 | 121.4 | 1.6 | 0.1 | 0.1 | 0.2 | 32.6 |
| dhtml | 193.1 | 139.4 | 6.8 | 7.3 | 1.1 | 1.1 | 38.5 |
| **BURST (canvas-init → ready — the 146-image chrome)** | | | | | | | |
| canvas | 343.4 | **145.0** | 0.4 | 0.3 | 0.2 | 0.7 | 195.7 |
| dhtml | 339.9 | 63.3 | 2.9 | 5.5 | **12.5** | 7.8 | 254.0 |

- **The whole net win is the BUILD phase (−36 ms)** — DOM-pipeline elimination (~15 ms) + lower JS (no DOM
  shadow) + a **160 ms-earlier splash** (first paint 56 vs 212 ms: DHTML must build a large DOM before Chrome
  flushes; canvas blits its splash immediately).
- **The BURST phase is a near-wash and slightly favors DHTML** (canvas 343.4 vs dhtml 339.9). Here the M1
  kernel has **no dirty-rects**, so each of the 146 image completions triggers a **full-scene repaint of the
  2000×1440 surface on the main thread** → canvas burns **145 ms of JS** vs DHTML's 63. DHTML instead pays it
  in the off-path browser pipeline (paint 12.5 + composite 7.8 + layout 5.5). **The burst converts DHTML's
  off-thread browser paint into on-thread canvas JS redraws.** Image *decode* is off-thread on both (the
  ~200–250 ms idle). The **year calendar has no images, so this tax never fires** — which is exactly why its
  win is clean and large.

---

## 4. The unified picture — one sentence per app

| app @ dpr=2 | ready Δ (cv−dh) | canvas TaskDuration vs dhtml | what dominates startup | why canvas wins / how much |
|---|--:|--:|---|---|
| **month Calendar** (696 views, light) | **−24.7 ms (−17 %)** | −5 ms (canvas lower) | the tree build | DOM-pipeline elimination (13→0.5 ms) + no DOM shadow; clean |
| **Dashboard** (1 026 views, **146-img burst**) | **−32.3 ms (−6 %)** | **+32 ms (canvas HIGHER)** | the image burst, post-init | build-phase win only; burst is a wash (M1 repaint tax) |
| **year Calendar** (**6 932 views, 15.5k DOM, 0 img**) | **−120.0 ms (−33 %)** | **−152 ms (canvas lower)** | the tree build (huge) | DOM-pipeline elimination at scale (104→0.5 ms); **cleanest & largest win** |

**The axis is DOM size vs image burst.** Canvas eliminates the DOM pipeline (style/layout/paint/composite),
whose DHTML cost **grows with node count** — so the more DOM an app builds, the more canvas saves (month → year:
−17 % → −33 %). The one thing that *reverses* the advantage is a **streaming image burst** with no dirty-rects
(Dashboard): each image forces a full-scene on-thread repaint, so canvas trades DHTML's cheap off-path browser
paint for expensive on-path JS. The year calendar — big scene, no images — is canvas at its best.

---

## 5. SPECIAL — the year calendar's two-phase startup split

The lead wants startup split into **(A) "the views are all in place and rendered"** (structural scaffold +
first render) and **(B) "the data load that brings init to the end"** (the 1 483 events hydrating/binding, the
datapath replication that creates the event bars).

**How the boundary was drawn (note).** The scene is built by **nested datapath replication** —
`s_monthgrid` → `s_day` → `s_event` — which is depth-first and **interleaves** structure and events per day
(grid[0] → its 42 days → each day's events → grid[1] …). There is therefore **no single temporal instant**
in the live app where "all structure is done, events begin," so a pair of `__olmark('structure-rendered')` /
`__olmark('events-hydrated')` marks could not cleanly separate them. Instead I used the **methodology-blessed
delta method** (the same technique RESULTS-calendar used to price deferred event hydration): measure a
**structure-only** build (the year calendar with every `<event>` stripped from the seeded dataset —
`cal-stress-noev`, an additive data-only variant) and take **events = full − structure-only**. This isolates
the entire event subtree's cost — create *and* bind — which is exactly phase B ("the datapath replication that
creates the event bars"). Structure-only = **3 578 views** (12 grids + 504 day cells + their bg/day-number/
events-container children + chrome); events add **+3 354 views** (1 483 bars + their two text children each) →
**6 932** total.

### Phase A — structure ("views in place & rendered"), build to canvas-init (median ms)

| | dur | JS | style | layout | paint | composite | idle |
|---|--:|--:|--:|--:|--:|--:|--:|
| **canvas** | **163.6** | 130.3 | 0.2 | 0.1 | 0.1 | 0.1 | 27.5 |
| **dhtml** | **208.6** | 144.7 | 11.7 | 13.8 | 5.7 | 2.5 | 32.9 |
| **Δ (cv−dh)** | **−45.0** | −14.4 | −11.5 | −13.7 | −5.6 | −2.4 | −5.4 |

### Phase B — events ("the data load that ends init"), = full − structure (median ms, delta)

| | dur | JS | style | layout | paint | composite | idle |
|---|--:|--:|--:|--:|--:|--:|--:|
| **canvas** | **+63.9** | **+67.7** | 0 | 0 | 0 | 0 | +2.2 |
| **dhtml** | **+154.2** | **+95.2** | +18.0 | +21.2 | +23.4 | +8.0 | −1.9 |
| **Δ (cv−dh)** | **−90.3** | −27.5 | −18.0 | −21.2 | −23.4 | −8.0 | — |

*(Delta of medians is not perfectly additive — idle varies run-to-run — so the phase-B columns carry ~±10 ms;
the durations and the JS/render shares are the load-bearing signal.)*

### What each phase costs, on each runtime, and WHY

- **Phase A (structure) — instantiation cost.** Both runtimes spend most of it in **JS**: constructing 3 578
  `LzView`/`LzNode`s and wiring the grid geometry constraints (`homeX`/`homeY`/`cellW`/`cellH`, each day cell's
  `x`/`y`/`width`/`height` constraints against its grid). Canvas 130 ms JS; DHTML 145 ms JS — the extra ~15 ms
  is DHTML building a **DOM shadow per view**. DHTML then adds **~34 ms of browser pipeline** (style 12 +
  layout 14 + paint 6 + composite 3) to lay out and paint ~7 700 DOM nodes; canvas pays **~0.5 ms** (own
  pixels, one render). **Net phase-A: canvas −45 ms** — instantiation is comparable, the whole margin is
  DHTML's DOM-shadow JS + DOM pipeline.

- **Phase B (events) — replication + binding cost, and this is where the runtimes diverge sharply.** Each of
  the 1 483 events is a datapath clone that must be **created** (an `s_event` bar view + 2 text children) and
  **bound** (three data attributes `@cat`/`@title`/`@start`, then the derived `barColor`/`textColor` color
  constraints and the `width`/`bgcolor` constraints, plus `simplelayout` in each day's event stack). That
  replication/binding machinery is the JS both runtimes share: **canvas +68 ms, DHTML +95 ms** — DHTML's extra
  ~27 ms is again the DOM shadow for the +3 354 event views. But DHTML **additionally** pays **+71 ms of DOM
  pipeline** (style +18, layout +21, paint +23, composite +8) to style/lay-out/paint those 3 354 new nodes;
  canvas pays **~0**. **Net phase-B: canvas +64 ms vs DHTML +154 ms — canvas hydrates the events 2.4× faster,
  entirely by not touching a DOM pipeline.** Phase B is what carries the year calendar's −120 ms total win.

**Summary — the year calendar's init, decomposed (median ms):**

| | phase A: structure | phase B: events | **total (canvas-init)** |
|---|--:|--:|--:|
| **canvas** | 163.6 (≈all JS) | +63.9 (≈all JS) | **227.5** |
| **dhtml** | 208.6 (145 JS + 34 pipe) | +154.2 (95 JS + 71 pipe) | **362.8** |
| **Δ (cv−dh)** | −45.0 | −90.3 | **−135.3**¹ |

¹ The canvas-init delta (−135 ms) exceeds the ready delta (−120 ms) because the canvas build carries a small
(~15 ms) heavy-task tail past canvas-init while DHTML's ready ≈ canvas-init; both are within the DHTML tail
noise band. Either way, **the events phase (B) is where most of the win is created** — structure is instantiation
(comparable JS + DHTML's DOM overhead), while events are replication+binding **multiplied across 1 483 nodes**,
and the DOM pipeline that multiplier drives on DHTML is exactly what canvas erases.

---

## Honest interpretation

- **This is still the M1 full-repaint baseline.** The canvas kernel has **no dirty-rects and no layer
  caching**; every frame repaints the whole surface. At **startup** that mostly lands off-thread (composite)
  and doesn't block, so the DOM-pipeline elimination wins cleanly on the two calendars. The Dashboard's
  146-image burst is the one place it bites on-thread (§3) — 146 full-scene repaints as JS — and it is the
  reason the Dashboard win is thin and canvas's total work there exceeds DHTML's. That burst cost is a
  *startup floor*; during sustained scroll/animation the repaint-everything cost recurs every frame and would
  dominate — **the target for dirty-rects + layer caching**, which would collapse the burst redraws to the
  newly-arrived tiles.
- **The direction is robust and scales:** canvas wins startup on all three apps at Retina, and the win **grows
  with DOM size in the absence of an image burst** (month −17 % → year −33 %). The mechanism is the same every
  time — DHTML's style/layout/paint/composite pipeline (13 → 45 → 104 ms) collapses to ~0.5 ms on canvas — plus
  a per-view DOM-shadow JS cost DHTML always pays and canvas never does.
- **The year calendar is the clean, extreme case** (6 932 views, 15.5k DOM, zero images): DHTML does **+152 ms
  more total main-thread work** with nothing to offset it. Its startup is **all build, no burst**, and canvas
  erases the DOM half of that build.
- **HiDPI is not the story here.** As the calendar/dashboard dpr sweeps established, 4× pixels are absorbed
  off-thread (raster/compositor) on both kernels; the dpr=2 numbers above are driven by DOM-node count and the
  image burst, not by resolution.

## Standing caveats

- **Localhost + fast Apple-silicon desktop, headless, eager builds.** Absolute ms are this-machine; the
  portable findings are the **direction** and the **shape** (DOM-pipeline elimination wins; the image burst is
  the one canvas-side tax). A mid-tier phone is ~4–6× slower.
- **DHTML "ready-for-input" has a contention-sensitive tail.** The harness defines ready as the end of the last
  heavy main-thread task within `canvas-init+800 ms`; on DHTML a late image/layout task occasionally extends
  that window (the [.. 478/689/688] maxima). Canvas clusters tightly ([498..501] etc.). DHTML configs were run
  ×10 and medians used; the tails are noted, not hidden.
- **Phase A/B split is a subtractive derivation** (full − structure-only), not a temporal mark — because nested
  datapath replication interleaves structure and events. It correctly isolates the event subtree's create+bind
  cost; per-column values carry ~±10 ms of median-subtraction noise (durations and JS/pipeline shares are solid).
- **Startup, not sustained animation** — the M1 repaint cost measured here is a floor.

---

## Files

- Report: `benchmarks/RESULTS-where-time-goes.md` (this file)
- Frozen dpr-aware canvas kernel (all three apps): `apps/{calendar,dashboard,calendar-stress}/LFCcanvas.js`
  (md5 `da8b501e383ce4422225b8bf2673aeb6`, 376 250 B) · DHTML: distro `runtime/lfc/lfc.js` (434 651 B)
- Targets: `apps/dashboard/dash-{canvas,dhtml}.html`, `apps/calendar/cal-{canvas,dhtml}.html`,
  `apps/calendar-stress/cal-stress-{canvas,dhtml}.html`
- Phase-split variant (additive, data-only): `apps/calendar-stress/cal-stress-noev.lzx.js` +
  `cal-stress-noev-{canvas,dhtml}.html` (events stripped from the dataset); source `cal-stress-noev.lzx` /
  `stress-data-noev.lzx`
- Screenshots (2×): `screenshots/probe-{cal,dash,cal-stress}-{canvas,dhtml}-dpr2.png`
- Raw run JSON: `/tmp/tl-<label>-<1..10>.json` (timeline), `/tmp/bp-<label>-<1..3>.json` (browserprof);
  labels `mo-{cv,dh}`, `dash-{cv,dh}`, `yr-{cv,dh}`, `yrnoev-{cv,dh}`
- Served via `tools/serve-static.mjs ../apps 8301`
- Prior single-app dpr=2 results reproduced/extended: `RESULTS-canvas-vs-dhtml-dpr2.md` (calendar),
  `RESULTS-dashboard-canvas-vs-dhtml.md` (dashboard) · Methodology: `METHODOLOGY.md`
