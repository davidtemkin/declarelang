# Where the runtime's time goes on the Mac host — measured 2026-09-16

Test host: `mac-host-test/Declare Host Test.app`, profile runtime (`profile/build-runtime.mjs`),
JIT vs `--nojit` (interpreter-only JavaScriptCore — the iOS configuration). Apple Silicon, macOS 26.
Raw results: `profile/results/*.json`; rig: `profile/run.mjs`.

## The stimuli

| app | stimulus | what it exercises |
|---|---|---|
| weather | `liveresize` 1280×828 → 1000×640, 60 frames | full relayout every frame: layouts, percent lengths, text re-wrap, 585 layers moved |
| desktop | two extra Files windows, then `scaleSeed = i` × 60 | springs on window scale → visibility walk on every icon, every frame |
| tracker | 24 `query` changes | dataset re-projection + row rematerialization (replication, layout, text) |

Wheel scrolling was tried on tracker and produced **no JS work at all**: the Mac host scrolls
natively and the runtime only hears facts. That is already the partition working.

## Per frame / per change

| | settle per unit | body | tracking + apply | residue | stringify + decode | host apply (main) | frame gap |
|---|---|---|---|---|---|---|---|
| weather resize, JIT | **9.7 ms**/frame | 23% | 47% | 30% | 0.8 ms, 44 KB | **12.5 ms** | 20 ms |
| weather resize, no JIT | **33 ms**/frame | 46% | 50% | 4% | 0.9 ms | 14 ms | 51 ms |
| desktop seed, JIT | **2.0 ms**/settle | 19% | 69% | 13% | ~0 | 0.14 ms | — |
| desktop seed, no JIT | **7.6 ms**/settle | 36% | 66% | −3% | ~0 | 0.15 ms | — |
| tracker filter, JIT | **41 ms**/change (max 93) | 10% | 14% | 76% | 4 ms, 101 KB | 1.7 ms | 134 ms |
| tracker filter, no JIT | **133 ms**/change (max 298) | 10% | 26% | 64% | 4 ms | 1.6 ms | 158 ms |

*body* = re-running each constraint's `compute()` with tracking off, weighted by how often it ran
in the window. *tracking + apply* = `run()` minus body. *residue* = settle time not explained by
re-running constraints: scheduling, and — in tracker — instantiating new rows, which a re-run
cannot reproduce.

## What the numbers say

1. **Tracked constraints cost 2–4× their body.** `FolderIcon.visibility`: body 13 µs, run 55 µs
   (JIT); 88 µs / 249 µs (no JIT). The difference is the getter path under tracking — `cellFor`,
   `Set.add`, `deps.push` per read, unlink/relink per run — plus the equality-gated apply.
   This is the cost the compiler already removes for `{ }` bodies it prewires (`wired`), and it
   is the largest per-frame cost in desktop (visibility = 86% of the settle).
2. **The hot constraints are all runtime-built, and all numeric.** Visibility (ancestor walk:
   root-frame intersection × scale over x/y/scroll slots), layout passes, `Text.height`,
   `Roll.width/height`, `CityRow.y`. None of them get static edges today — only compiled bodies
   do. Wired share: weather 30%, desktop 51%, tracker 54% of live constraints. Compiled bodies
   (`pivotX`, `Spring.to`) barely register in the hot lists.
3. **The JSON crossing is not the problem.** Stringify + decode ≤ 1 ms/frame at 44 KB. Shared
   memory would save that, but it is not where the time is.
4. **Under a full relayout, the main-thread CALayer apply is the biggest single cost on the Mac**
   — 12.5 ms/frame p50, and the host's own meters (GEOM 1.1 ms, TEXTSTYLE 0.5, raster 0.6,
   CATransaction 0.1) account for only ~15% of it. Orthogonal to the partition (the applier stays
   native either way) and worth its own Instruments pass.
5. **Replication is the second cost centre.** A tracker filter change costs 41 ms in JS (JIT),
   three quarters of it instantiating the new rows, not running constraints. `Dataset.contents`
   itself is 3.4 ms body + 4 ms apply per change.
6. **`new Function` is cheap**: 806–1462 bodies compile in 6–13 ms at boot (~8 µs each), the
   same with or without the JIT. Boot is dominated by the first settles (weather 112 ms, tracker
   250 ms JIT / 700 ms no JIT) and, uncached, the compile (535–742 ms, absent in a packaged app).
7. **No JIT multiplies every JS number by 3.2–3.8×**, taking weather's resize from 50 to 20 fps
   and a tracker filter change to 130–300 ms. Nothing else changes.

## What it means for the design

- **First win, JS-only: static edges for the runtime-built constraints.** The tracking overhead
  is the largest term in motion frames and the runtime already has the wired path; visibility,
  layout passes and text sizing have fixed, knowable read sets. This is the slot-table half of
  the design applied where the profile says the time is, before any native code.
- **The native numeric settle captures the rest of the motion frame.** Everything hot in
  weather/desktop is class (A): pure arithmetic over geometry slots. With those native, the
  JIT-less frame drops from 33 ms toward the applier's cost — the iOS case.
- **Instantiation is the separate second target** (tracker): table rows instead of dictionaries,
  `defineProperty` and per-instance closures; bodies themselves are already memoized.
- **Shared memory is a later refinement**, not the lead: the crossing is ≤ 1 ms/frame today.
- **The applier needs its own investigation** on the Mac; on iOS the same question will arise
  with UIKit.

---

# C0 + C1 measured — 2026-09-16, same rig, same stimuli

The kernel (kernel/src/kernel.c as WebAssembly inside JavaScriptCore) under the runtime:
`reactive.ts` on kernel cells and rules (C0), numeric slots in the kernel table (C1),
O(1) edge unlink and track dedupe. Nothing else changed. Baseline = the section above.

| | baseline JIT | **C0+C1 JIT** | baseline no JIT | **C0+C1 no JIT** |
|---|---|---|---|---|
| weather resize, settle per frame | 9.7 ms | **5.2 ms (−46%)** | 33 ms | 36 ms (+7%) |
| desktop seed, settle per settle | 2.0 ms | **1.0 ms (−50%)** | 7.6 ms | 6.7 ms (−12%) |
| tracker filter, settle per change | 41 ms | 38 ms (−7%) | 133 ms | 149 ms (+12%) |
| weather boot settles | 112 ms | 105 ms | 222 ms | 258 ms |
| host apply (main thread), resize | 12.5 ms | 12.5 ms | 14 ms | 13 ms |

Where it went (weather resize, JIT): scheduling/tracking residue 152 → 113 ms is still
there (the JS→WASM→JS crossing per body, `RULES` lookup, `runBody`), but the tracked
path's run − body fell from 237 ms to 28 ms: tracking is no longer 2–4× the body.

What did not move:
- **Bodies got slower** (FolderIcon.visibility 64 → 95 ms): the numeric getter — `$k`
  lookup, escape check, `table[c]` — costs more per read than the old `$attrs` chain
  under the JIT. To micro-benchmark and tighten.
- **No JIT is neutral to slightly worse**: every kernel call is interpreted WASM entered
  from interpreted JS; the per-read `track` and per-write `set` crossings are exactly
  the cost. The iOS win needs (a) static edges for the runtime-built rules (no track
  calls), (b) writes BATCHED into a shared ring drained by the settle (one crossing per
  settle), (c) the numeric rules native. This is the design as planned; C0/C1 alone was
  never going to show it on the interpreter.
- **The Mac frame is now applier-bound on resize**: 5 ms of JS against 12.5 ms of
  main-thread CALayer apply (unchanged). Separate investigation.
- **Replication** (tracker) is untouched until Phase E.

Size at this point: calendar production bundle 88.5 → 97.3 KB gz (+8.8).

## The same in Chrome (V8, JIT) — `mac-host/profile/web.mjs`, 2026-09-16

Headless Chrome, `--disable-frame-rate-limit`, the served `declare-boot.js` swapped for the
metered bundle of each tree (`build-runtime.mjs --web [--root main]`). Settle ms per window.

| | main | **Optimize (C0+C1)** |
|---|---|---|
| weather resize, DOM (raster in apply) | 982 ms / 64 settles = 15.3 ms | **751 / 58 = 12.9 ms (−16%)** |
| weather resize, canvas | 436 / 63 = 6.9 ms | **222 / 53 = 4.2 ms (−40%)** |
| desktop seed, DOM | 546 / 609 = 0.90 ms | **337 / 637 = 0.53 ms (−41%)** |
| tracker filter, DOM | 1214 ms | 1162 ms (−4%) |

Same shape as the Mac: the tracked path's overhead is gone, the bodies themselves are
dearer (desktop bench body 124 → 263 ms — the numeric getter under V8), replication is
untouched. The kernel runs as WASM in the page (Chrome's async instantiate at boot).

## The applier, profiled — 2026-09-16 (xctrace Time Profiler, live resize, weather)

Main thread during three 60-frame live resizes (2.6 s sampled), inclusive:

| | share |
|---|---|
| `LayerTree.apply(ops:)` | 76% |
| ↳ `refreshFrosts` / `compositeFrosts` (software frost compositing: `rgba32_sample_rgba32`, `rgba32_image_mark`, vImage lookups) | **57%** |
| ↳ `blurJobsOnGPU` | 15% |
| ↳ `drawOwnPaint` / `renderMaybeCached` | 14% / 10% |
| ↳ `applyOne` (the ops themselves) | 9% |
| `TextLayer.fit` / `buildLines` | 2% |

So the 12.5 ms/frame is frost: every frame of a resize re-composites the translucent
panels' backdrops in software. Not property churn, not the kernel's business — the
"Mac frost is broken" item (reference-mac-frost-broken.md), now with a number. Fix
directions: GPU-composited frost, or re-composite only frosts whose backdrop changed,
or a lower-resolution frost during live resize.

## Steps 1–4 landed — 2026-09-16 (later)

Per-class slot layouts with contiguous blocks (reads `table[base+i]`, no dictionary),
a call-free tracking check, batched writes through a shared ring (no kernel call per
write), and the **native visibility rule** (the ancestor walk in C over the table, JS
delivery kept; 3D chains hand back to the JS walk; `test/kernel-vis.test.mjs` proves
equality on 40 random trees × 8 perturbations).

| settle per unit | baseline | C0+C1 | **steps 1–4** |
|---|---|---|---|
| Mac JIT · weather resize, per frame | 9.7 ms | 5.2 ms | **3.4 ms (−65%)** |
| Mac JIT · desktop seed, per settle | 2.0 ms | 1.0 ms | **0.15 ms (−92%)** |
| Chrome · desktop seed, per settle | 0.90 ms | 0.53 ms | **0.09 ms (−90%)** |

Costs: the kernel WASM is 14.7 KB raw / 6.2 KB gz (the rule added ~2 KB gz); a
registered view carries its class's whole numeric layout (View 40, Text 49, App 62
slots ≈ 0.3–0.5 KB of table plus ~27 B/cell of bookkeeping), so the tracker suite's
peak is 2.8 M cells and the default capacity is now 4 M. The compiler-emitted layout
(Phase B) is what makes blocks program-sized.

**No JIT, re-measured with steps 1–4** (the earlier "neutral" predates call-free reads/writes and
the native rule): weather resize 33 → **15.3 ms/frame (−54%)**, desktop seed 7.6 → **1.4 ms/settle
(−81%)**. Frame gap on the resize 51 → 35 ms — the frost applier is now the larger half there too.

Full suite at this point: 62 of 65 files pass; the three are the size gate (< 90 KB; 97 KB),
and two `git`-dependent checks (release notes, the format canon's `git ls-files`) that cannot run
in an untracked tree.

## Phase B2 — kernel-evaluated `{ }` bodies — 2026-09-16 (later)

The compiler emits bytecode for every pure-numeric body (`compiler/src/expr-emit.ts`; 38% of
the corpus certainly, 27% more syntactically); the binder resolves each read path to a table
cell when the views exist and keeps the JS body otherwise; the kernel writes the target slot
itself and a post-settle sweep runs the Surface pushes for kernel-written cells.
`test/kernel-expr.test.mjs`: six apps, boot + three perturbations, every numeric slot
bit-identical with the JS bodies; 33–358 bodies per app run in the kernel.

| settle per unit (Mac JIT) | baseline | steps 1–4 | **+ B2** |
|---|---|---|---|
| weather resize, per frame | 9.7 ms | 3.4 ms | **3.5 ms** (its JS-body share was already small) |
| desktop seed, per settle | 2.0 ms | 0.15 ms | **0.08 ms** |
| tracker filter, per change | 41 ms | 38 ms | **31 ms** |

Kernel WASM 15.5 KB raw / 6.5 KB gz.

# The matrix — before / after on four targets, 2026-09-16 (evening)

Every case is the same in-page stimulus (`build-runtime.mjs` `__profDrive`, in the metered
bundle) driven on: headless Chrome (`web.mjs --inpage`, vsync on), the Mac host with the JIT
entitlement and without it (`run.mjs --inpage`, window kept rendering with `occlusion ignore`),
and iOS Safari in the simulator (`ios.mjs`: iPhone 16 Pro for weather, iPad Pro 13" for the
rest; the device runs headless — this Xcode has no Simulator app — and renders regardless).
"main" is `/Users/temkin/Code/Declare`'s runtime, "opt" this tree's, both metered the same way.
JS settle = the reactive core's time over the whole window; rAF p95 and the >33 ms count are the
page's own frame clock. The `desktop:minimize` driver waits for the calendar to be UP (launcher
done, window front, island linked to its mounted tenant) before the six genie cycles.

`node mac-host/profile/matrix.mjs run --targets chrome,mac,ios` → `report` → `results/MATRIX.md`:

| case | target | JS settle ms, main → opt | rAF p95 ms, main → opt | frames > 33 ms, main → opt |
|---|---|---|---|---|
| weather:resize-window † | mac JIT | 510 → **174** (−66%) | 32.6 → **22.7** | 42 → **40** of 57 |
| weather:resize-window † | mac interp | 903 → **593** (−34%) | 58.9 → **38.8** | 28 → **31** of 43 |
| weather:resize | chrome | 1332 → **956** (−28%) | 33.4 → **16.8** | 22 → **4** of 97 |
| weather:resize | mac JIT | 687 → **213** (−69%) | 24.7 → **24.1** | 2 → **2** of 129 |
| weather:resize | mac interp | 2294 → **1117** (−51%) | 53.1 → **27.6** | 52 → **5** of 131 |
| weather:resize | iOS sim | 943 → **558** (−41%) | 68.0 → **60.0** | 61 → **61** of 92 |
| weather:city | chrome | 2220 → **1202** (−46%) | 16.7 → **16.8** | 1 → **2** of 664 |
| weather:city | mac JIT | 3415 → **1660** (−51%) | 8.3 → **8.3** | 1 → **1** of 1274 |
| weather:city | mac interp | 5323 → **4547** (−15%) | 41.7 → **25.0** | 124 → **4** of 1023 |
| weather:city | iOS sim | 1464 → **1001** (−32%) | 57.0 → **54.0** | 95 → **94** of 480 |
| desktop:seed | chrome | 132 → **19** (−86%) | 16.7 → **16.7** | 0 → **0** of 96 |
| desktop:seed | mac JIT | 341 → **59** (−83%) | 8.3 → **8.3** | 0 → **0** of 132 |
| desktop:seed | mac interp | 818 → **162** (−80%) | 8.3 → **8.3** | 0 → **0** of 132 |
| desktop:seed | iOS sim | 227 → **28** (−88%) | 18.0 → **17.0** | 0 → **0** of 96 |
| desktop:minimize | chrome | 403 → **201** (−50%) | 16.7 → **16.8** | 0 → **1** of 515 |
| desktop:minimize | mac JIT | 1036 → **280** (−73%) | 8.3 → **8.3** | 0 → **0** of 1020 |
| desktop:minimize | mac interp | 2764 → **1683** (−39%) | 8.3 → **8.3** | 0 → **0** of 1028 |
| desktop:minimize | iOS sim | 508 → **260** (−49%) | 33.0 → **30.0** | 23 → **6** of 484 |
| tracker:filter | chrome | 1250 → **917** (−27%) | 33.4 → **16.8** | 16 → **10** of 230 |
| tracker:filter | mac JIT | 963 → **662** (−31%) | 25.0 → **21.5** | 17 → **11** of 386 |
| tracker:filter | mac interp | 3186 → **2329** (−27%) | 75.0 → **41.7** | 42 → **29** of 397 |
| tracker:filter | iOS sim | 1863 → **1312** (−30%) | 88.0 → **57.0** | 25 → **18** of 193 |
| calendar:mode | chrome | 800 → **655** (−18%) | 16.7 → **16.7** | 0 → **0** of 329 |
| calendar:mode | mac JIT | 1243 → **1077** (−13%) | 8.3 → **8.3** | 0 → **0** of 653 |
| calendar:mode | mac interp | 3630 → **3692** (+2%) | 8.3 → **8.3** | 0 → **0** of 652 |
| calendar:mode | iOS sim | 1091 → **842** (−23%) | 17.0 → **17.0** | 0 → **0** of 328 |

† the Mac host's own liveresize (AppKit → layer tree → frost applier), not the in-page stimulus: frames are the host's display-link gaps and the last column counts frames over the 8.3 ms (120 Hz) budget, not over 33 ms.

What the table says:

- **The geometry-bound cases moved the most, everywhere.** Desktop seed (the visibility walk
  under the dock's magnification) is −80…−88% on all four targets; the genie (minimize) −39…−73%;
  the weather resize −28…−69% in JS. That is the native visibility rule and the kernel-evaluated
  `{ }` bodies doing the same work under V8, JSC-JIT, the JSC interpreter and iOS Safari.
- **The interpreter targets (Mac no-JIT, iOS) gain as much as the JIT ones** — the point of the
  partition: work that moved into the kernel costs the same whether or not the JS engine has a
  JIT. Mac interp weather resize: 52 → 5 frames over 33 ms; iOS iPad minimize: 23 → 6.
- **Where frames did not improve, JS was not the bound.** Weather resize on the Mac's REAL
  window (†): JS 510 → 174 ms, frames p50 19 → 18 ms — the host's software frost compositing
  (57% of the main thread in the xctrace profile) sets the frame there, the applier item. On the
  iPhone the resize frame is 53–60 ms with 9 ms of settle in it — DOM paint on the simulator.
- **Tracker filter is −27…−31%**: E1/E2 (validation memo, parent-linked tags) — row
  instantiation itself is the deferred Phase E (kernel template stamping).
- **Calendar mode is the floor** (−13…−23%, Mac interp +2%): its settle is Text/rich layout and
  the calendar's own JS bodies, which the kernel does not touch; it reads as the no-regression
  check.
- One thing to look at: during spring-driven motion (weather city) opt runs 2–3× the SETTLES of
  main in the same window (Mac JIT 1033 vs 491; iOS 484 vs 154) — each cheaper, but the count
  suggests the deferred visibility wake (`afterSettle → refreshVisibility`) schedules a follow-on
  settle per frame. Folding it would take a few more percent off the motion rows.

# Round 2 — declared defaults as rules, `:field` cells, method inlining, blank-check throttle — 2026-09-16 (night)

Same rigs, Chrome + Mac re-measured (iOS held, per DT). `results/MATRIX.md` is the live table. Main → opt, JS settle:

| case | chrome | mac JIT | mac interp |
|---|---|---|---|
| weather:resize | 1332 → 402 (−70%) | 687 → 178 (−74%) | 2294 → 972 (−58%) |
| weather:city | 2220 → 720 (−68%) | 3415 → 1020 (−70%) | 5323 → 3727 (−30%) |
| desktop:seed | 132 → 12 (−91%) | 341 → 29 (−91%) | 818 → 136 (−83%) |
| desktop:minimize | 403 → 105 (−74%) | 1036 → 290 (−72%) | 2764 → 955 (−65%) |
| tracker:filter | 1250 → 736 (−41%) | 963 → 688 (−29%) | 3186 → 2356 (−26%) |
| calendar:mode | 800 → 323 (−60%) | 1243 → 288 (−77%) | 3630 → 2102 (−42%) |

What moved it: a declared `name: number = { … }` was a live fallback re-evaluated on EVERY read
(260–612 ns vs 22 ns for a stored slot) and invisible to the EXPR binder — it is now a standing
yielding rule in the table (freshness rules and the kernel's pull keep first-computed values and
handler reads equal to main's); `:field` reads bind to per-row data cells; `app.lerp(…)` and the
like inline into EXPR bytecode; the DOM blank-raster readback runs at most once per 250 ms during
motion (Chrome weather resize: frames over 33 ms 22 → 1). Calendar on the Mac JIT: JS body runs
148K → 26K per window; its settle (288 ms) is now smaller than the op stream's stringify+commit
(50 + 297 ms) — the applier is the larger half there. On the interpreter the kernel itself runs as
interpreted WASM (calendar: 600 EXPR rules per frame), which is what Phase D (native link) changes.
Unmoved, as expected: tracker filter (row instantiation — next) and the Mac's real-window resize
frames (the frost applier). Found on the way: the extractor never followed `super` calls
(`$base` did not root a chain) — a main bug, fixed here.

## Round 2b — rows recycled across departures; the frost throttle — 2026-09-16 (night)

- **Tracker filter**: the windowed block's recycling (leavers re-pointed at arrivers) applied only to
  window shifts; a filter change, where most records LEAVE the projection, discarded and constructed
  every row (~55% of the change). A clean leaver whose record left now retires (parented, cursored
  — the hook's contract) and serves an arriver. Node: 18.6 → 7.6 ms per change; Chrome: 736 → 499 ms
  (main 1250, −60%), worst frame 100 → 33 ms. Tracker/materialization/unit suites green.
- **Mac frost under motion**: the re-sample (capture + blur per radius, 57% of the main thread under a
  live resize) runs at most every 50 ms during a commit burst, with one deferred landing after it
  (`Frost.swift`). Real-window resize (JIT): commit p50 15 → 3 ms, frame gap p50 19.3 → 13.6 ms;
  p95 22.7 unchanged — a landed pass still costs ~15 ms on the main thread. Next for that row:
  sample and blur off the main thread.

# The quiet pass — 2026-09-16 (late night), main and opt back-to-back, machine idle

`results/MATRIX.md` (Chrome + Mac rows refreshed; iOS rows are the earlier pass, held per DT). Main → opt, JS settle:

| case | chrome | mac JIT | mac interp |
|---|---|---|---|
| weather:resize | 1218 → 372 (−69%) | 645 → 169 (−74%) | 2251 → 905 (−60%) |
| weather:city | 2079 → 863 (−58%) | 3547 → 1021 (−71%) | 5110 → 3565 (−30%; 5× the settles land) |
| desktop:seed | 134 → 14 (−90%) | 218 → 32 (−85%) | 812 → 237 (−71%) |
| desktop:minimize | 379 → 150 (−61%) | 591 → 284 (−52%) | 2755 → 1159 (−58%) |
| tracker:filter | 1139 → 482 (−58%) | 992 → 393 (−60%) | 3141 → 1083 (−66%) |
| calendar:mode | 731 → 443 (−39%) | 1193 → 202 (−83%) | 3500 → 1379 (−61%) |
| real-window resize † | — | 522 → 172; host frame p50 24.0 → 13.9 ms | 932 → 668; p50 40.1 → 22.9 ms |

Frames over 33 ms: Chrome weather resize 16 → 2, tracker 12 → 3; Mac interp weather resize 34 → 2,
city 118 → 1, tracker 40 → 9; Mac JIT tracker 18 → 0. The Mac's real-window resize is the one row
still short of budget (120 Hz): the frost pass that lands every 50 ms costs ~15 ms on the main
thread — the off-main-thread sample is the remaining item there.

# Phase D — the kernel linked natively into the Mac host — 2026-09-16 (late night)

The C kernel is now a SwiftPM target in the app (`kernel/src/kernel_jsc.c` exposes the ABI as
JavaScriptCore functions; the table, rings and rule states are zero-copy typed-array views over
native memory; `DECLARE_NO_NATIVE_KERNEL=1` falls back to the WASM build for A/B). Two things had to
change to make it pay, and both help the WASM build too: a TRACK RING (a tracked read appends a
cell; the kernel links a run's reads when its body returns — no call per read) and call-free state
checks (a rule's state bytes and the pending flag viewed, not fetched). A JavaScriptCore crossing
measured 306 ns native vs 94 ns for a WASM export; a table read 7.7 ns native vs 15 ns WASM.

Same build, same session, WASM → native (JS settle over the window):

| case | mac JIT | mac interpreter |
|---|---|---|
| calendar:mode | 430 → 411 (−5%) | 1328 → 726 (−45%) |
| desktop:seed | 62 → 58 (−6%) | 208 → 93 (−55%) |
| weather:resize | — | 854 → 634 (−26%) |
| desktop:minimize | — | 1150 → 936 (−19%) |
| tracker:filter | — | 1043 → 989 (−5%) |

Against main on the interpreter (quiet pass): calendar 3500 → 726 (−79%), seed 812 → 93 (−89%),
resize 2251 → 634 (−72%), minimize 2755 → 936 (−66%), tracker 3141 → 989 (−69%). On the JIT the
kernel's own work was already small; the interpreter is where native pays, as designed. The
applier still consumes the op stream; reading geometry straight from the table is the second half.

Rig lesson worth its own line: a sleeping display stops CADisplayLink, so every in-page driver
waited on requestAnimationFrame forever; `run.mjs` now wakes and holds the display.

# The final pass — 2026-09-17, 00:xx — Chrome DOM and canvas complete; Mac and Safari pending the screen

Main → opt (JS settle over the window), one pass, main and opt back-to-back:

| case | chrome DOM | chrome canvas |
|---|---|---|
| weather:resize | 1196 → 341 (−72%) | 575 → 159 (−72%) |
| weather:city | 2094 → 855 (−59%) | 2010 → 507 (−75%) |
| desktop:seed | 156 → 11 (−93%) | 137 → 9 (−93%) |
| desktop:minimize | 416 → 154 (−63%) | 336 → 102 (−70%) |
| tracker:filter | 1208 → 526 (−56%) | 1011 → 419 (−59%) |
| calendar:mode | 821 → 512 (−38%) | 412 → 74 (−82%) |

Frames over 33 ms (DOM): weather resize 15 → 1, tracker 16 → 5; canvas weather city 10 → 0, tracker 14 → 1.
The canvas renderer moves more than the DOM one on every row — its applier is JS the runtime feeds
directly, so what the kernel takes off the settle is the whole per-frame cost there; on the DOM the
engine's own layout and paint stay.

Mac (native kernel) and desktop Safari rows are NOT in this pass yet: the screen was locked while it
ran, and both the Mac host's display link and Safari's frame clock went intermittent under the lock
(the in-page driver waits on a frame). The Mac JIT rows that did land: weather resize main 584 →
opt 138, desktop seed 306 → 45. The Phase D section above has the interpreter A/B from the same
build. `matrix.mjs run --targets safari,mac` reruns both stages once the screen is unlocked.

# Round 3 — the final perf block, measured — 2026-09-17, Chrome DOM + Mac only (DT's scoping)

The block: the DOM root-element WeakSet (no `dataset` read in the size setters), the blank-raster
throttle + proven-size skip, the measure memo, one `place()` per layout wave, the track ring and
call-free state views, DK_EXTENT, declared numeric defaults through the kernel, binary GEOM, frost
capture off the main thread, and the native kernel in the Mac host (Phase D). Both trees run their
own metered bundle in the SAME host build; `matrix.mjs run --targets chrome,mac`, machine idle,
`caffeinate` held. Main → opt, JS settle over the stimulus window:

| case | chrome DOM | mac JIT | mac interpreter |
|---|---|---|---|
| weather:resize | 1318 → 259 (−80%) | 689 → 126 (−82%) | 2285 → 443 (−81%) |
| weather:city | 3204 → 1188 (−63%) | 3739 → 1053 (−72%) | 5293 → 2423 (−54%; 2.7× the settles land) |
| desktop:seed | 174 → 17 (−90%) | 303 → 32 (−89%) | 789 → 81 (−90%) |
| desktop:minimize | 707 → 225 (−68%) | 1081 → 328 (−70%) | 2914 → 1298 (−55%) |
| tracker:filter | 1251 → 556 (−56%) | 1008 → 380 (−62%) | 3206 → 930 (−71%) |
| calendar:mode | 1064 → 174 (−84%) | 1270 → 312 (−75%) | 3610 → 1526 (−58%) |
| marketmap:slider | 2319 → 1997 (−14%) | 2239 → 1798 (−20%) | 3402 → 2974 (−13%) |
| real-window resize † | — | 398 → 139 (−65%) | 804 → 360 (−55%) |

Frames over 33 ms: Chrome tracker 13 → 2, weather resize 3 → 1, marketmap 71 → 1; mac JIT tracker
17 → 0, marketmap 10 → 14; mac interp weather resize 61 → 2, city 129 → 2, tracker 41 → 4,
calendar 0 → 0, marketmap 37 → 39. Real-window resize † (host display-link gaps, 60 Hz input):
JIT 38 → 63 frames, p50 27.8 → 13.7 ms; interpreter 23 → 56 frames, p50 45.1 → 14.2 ms — the Mac
window now draws a frame per mouse step in BOTH engines. Calendar in Chrome is the round's biggest
move (−39% in the quiet pass → −84%): the WeakSet retires the `dataset` read that forced a
style-attribute serialization on every size write.

MARKETMAP IS THE ONE CASE THE BLOCK DID NOT FIX. Per settle it is 43–49% cheaper (JIT 21.3 → 12.2 ms,
Chrome 14.6 → 7.5 ms, interp 89.5 → 69.2 ms) and more steps land per drag (JIT 93 → 130, Chrome
75 → 125, interp 27 → 36), but a settle still overruns a frame: mac JIT drops MORE frames than main
(10 → 14) because it attempts more steps, and the interpreter trails the hand by 124 days (main 164).
Next round's first item: profile what one slider step computes.

## Per-switch A/B — same build, same session, switch ON vs OFF (`ab.mjs`)

| switch | case | on | off | reading |
|---|---|---|---|---|
| binary GEOM (serialize) | mac JIT calendar:mode | 5.0 ms | 85.9 ms | −94% |
| binary GEOM (commit) | mac JIT calendar:mode | 60.7 ms | 525.6 ms | −88%; 7.17 vs 8.65 MB crossed |
| binary GEOM (serialize) | mac interp calendar:mode | 4.4 ms | 73.9 ms | −94% |
| binary GEOM (commit) | mac interp calendar:mode | 47.5 ms | 436.3 ms | −89%; 7.14 vs 8.65 MB |
| one `place()` per wave | mac JIT weather:city | 1184 | 1285 | −7.9% |
| one `place()` per wave | mac interp weather:city | 2400 | 2787 | −13.9%; 4 runs, almost no spread — the round's firmest settle-time switch |
| measure memo | mac JIT weather:city | 1101 | 1184 | −7.0%, but see below |
| measure memo | mac interp weather:city | 2362 | 2397 | −1.5%, ranges OVERLAP (2356,2367 vs 2443,2351) |
| skip empty settles | mac JIT weather:city | 1182 | 1125 | no gain measurable on this case |
| skip empty settles | mac interp weather:city | 2345 | 2349 | none (0.2% apart) |
| frost capture off main | mac JIT resize-window | 67/64 frames, gap p95 14.8/15.2, commit p95 4.9/5.0 | 59/61 frames, gap p95 24.3/23.4, commit p95 10.5/10.0 | +9% frames, −37% gap p95, −52% commit p95; both pairs agree |
| one `place()` per wave | chrome weather:city | 752 | 781 | −3.6% |
| skip empty settles | chrome weather:city | 738 | 752 | −1.9%, at the noise floor |
| measure memo | chrome weather:city | 746 | 746 | none (the animation's font sizes never repeat) |

TRAP: `ab.mjs` reports `win.settleMs`, which is the WRONG measure for binary GEOM — ops are
serialized and cross AFTER a settle ends (its settle row reads +1.4%, noise). Read `win.stringifyMs`
and `win.commitMs` from the saved results for that switch, as the two rows above do.

THE MEASURE MEMO IS UNPROVEN ON THESE CASES. Chrome: none. Mac interpreter: ranges overlap. The
−7.0% with the JIT on is inside its own run spread (1043,1159) and should not be quoted as a gain.
It is kept because it is correct and cheap, and because a program that re-measures the SAME text
(static labels, a re-rendered list) is the case it exists for — no case in this round does that.
`weather:city` animates font size every frame, so every lookup misses. Same for "skip empty
settles": VERIFIED 0 empty settles of 553 in this case (`win.settleEmpty`), so it cannot measure
the switch at all. Both need a case built
for them before a number is claimed.

The scaling reads cleanly on `place()`: −3.6% Chrome, −7.9% mac JIT, −13.9% mac interpreter. It
removes JS work, and JS work costs most where the engine is slowest.

None of the switchable items explains the round's big Chrome numbers; those come from the
switch-free changes (the kernel core, the WeakSet). Binary GEOM is worth ~0.7–0.8 ms per frame and
frost ~5 ms per commit; `place()` is worth 4–14% of a settle; the other two are unproven here.

# Marketmap, profiled — 2026-09-17: the cost is NOT text measurement

Per DT's order (perf before packaging), the one case round 3 did not fix. One 2.5 s drag, Chrome DOM,
in-page driver. Weighted body over the window (mac JIT in brackets): Text.height 269 [261], the
MarketLayout shape 353 [246] over 141 runs, Text.width 139 [137], Text.textStyle 116 [89] ms —
text is ~45% of 1050 ms. ~950k constraint runs over 265 settles = ~3,600 per slider step, for 682
texts; every tile resizes each step, so everything re-derives.

TWO HYPOTHESES TESTED, BOTH NEGATIVE — recorded so they are not retried:

1. **Wrap-loop prefix widths (BUILT, MEASURED, REVERTED).** `wrapBy` measures a growing prefix per
   break opportunity via `m.measureText` directly, bypassing the memo, and `wrapMemo` is keyed by the
   exact width (a resizing tile misses every frame). Routing those prefixes through the WIDTHS map
   gave NOTHING: chrome 1986/1974 on vs 1965/1981 off; mac JIT 1781/1786 vs 1771/1774; lag 77-78 d
   either way. Text suites stayed green. Reverted (size is a constraint; dead switches are drift).
2. **Why it could not pay:** the driver now records the text counters (`text:` in the result JSON —
   `measureCalls`, `distinctPairs`, `memoHits/Misses/Clears`). One drag: **1,819 real measureText
   calls, 463,529 memo HITS, 3,372 misses — a 99.3% hit rate.** Text measurement is ALREADY cached.
   What the 269 ms buys is the LOOKUPS, not the measuring.

WHERE THE LOOKUP TIME GOES (`profile/keybench.mjs`, Node/V8, 463,529 lookups = one drag):

| key strategy | total | per lookup |
|---|---|---|
| flat `font NUL width NUL text` (today) | 126.8 ms | 274 ns |
| two-level map, concatenated head | 105.6 ms | 228 ns |
| two-level, font string as the only key | 24.6 ms | 53 ns |

So interning the key (font -> text -> value, no concat per lookup) is worth ~100 ms of a ~1970 ms
drag: 5%, more in the interpreter, and it helps every text-heavy program. NOT BUILT — a real item,
but not the one marketmap needs.

WHAT MARKETMAP ACTUALLY NEEDS (for DT's ruling, not built): the settle is ~3,600 runs per slider step
because every tile's box changes, so each of 682 texts re-derives height, width, style, x, y and
visibility. The kernel already makes a run cheap (~1.5 us); the COUNT is the cost. The candidates are
design-level, not micro: (a) skip a text's re-derive when its font and available width are unchanged
after rounding (many tiles move sub-pixel) — changes nothing visible but needs a freshness rule;
(b) quantize the animated font size (e.g. to 1/4 px) so the memo keys repeat — VISIBLE, needs DT's
ruling; (c) native text measurement/wrapping in the kernel, the original Phase-C idea and the only
one that attacks the 45%.

# Packaging, round 1 — the kernel's delivery and the switches — 2026-09-17

DT's order: perf first, then packaging. Three items ran; the measured facts changed two of them.

## What the runtime carries, and what it no longer carries

**Runtime-development switches are out of every shipping build.** `__declareNoTrackRing`,
`__declareSettleEmpty`, `__declareNoKernelExtent`, `__declareLayoutPlacePerSize`,
`__declareNoMeasureMemo`, `__declareExprTrace`, `__declareSettleTrace` and the measure-memo counters
now sit behind `__DECLARE_DEV_SWITCHES__` (runtime/src/build-flags.d.ts), which esbuild defines false
in build-boot.mjs, declarec.mjs and build-mac.mjs, and TRUE only in mac-host/profile/build-runtime.mjs
— the profiling bundles, which ab.mjs drives. DT's ruling: these develop the RUNTIME, not an app, so
they do not belong in a dev build either. ⚠ TRAP, cost an hour: the guard must name the DEFINED
identifier at the site. A module-local `const DEV_SWITCHES = …` does NOT fold — esbuild substitutes
the define but does not inline a const across statements, so `Jc&&globalThis.__declareNoTrackRing`
survived minification with its strings. The shape that works is
`typeof __DECLARE_DEV_SWITCHES__ !== "undefined" && __DECLARE_DEV_SWITCHES__ && …` written at each
site (the `typeof` half keeps a plain `tsc` build safe). Worth 0.4 KB gz — hygiene, not bytes.

**The kernel now rides ALONGSIDE the bundle, and that is the only form.** `buildProduction` emits
`index.html` + `app.<hash>.js` + `declare-kernel.<hash>.wasm.txt`; build-boot.mjs writes
`bundles/declare-kernel.wasm.txt` next to the boot bundle. The Mac bundle keeps the bytes inline
(`__DECLARE_INLINE_KERNEL__` absent = inline), which is right: the Mac host uses the NATIVE kernel and
size is irrelevant inside a local app.

| calendar, gzipped | inline (was) | alongside (now) |
|---|---|---|
| app bundle | 108.0 | 97.8 |
| kernel | — | 7.3 |
| first load | 108.2 | 105.4 |
| second visit | 108.2 | 97.8 |

main is 89.8 KB, so this tree is +15.6 KB gz on a first load. THE SIZE GATE STILL FAILS: 98.1 KB
against its 20–90 KB band (test/declarec.test.mjs). The band needs to move to ~100 KB and that is
DT's number to set; the remaining ~8 KB over main is the loader and the kernel bridge, which is
load-bearing.

## Why .wasm.txt, and not .wasm

COMPRESSION IS CHOSEN BY CONTENT TYPE, and a static host will not compress `application/wasm`.
Measured against real GitHub Pages responses (curl, 2026-09-17): text/html, text/markdown and
application/json come back `content-encoding: gzip`; `.wat` (application/octet-stream) does not; and
Pages cannot serve a pre-compressed file (`cache-control: max-age=600` + ETag on everything). So the
same 17,489 bytes arrive as 7.3 KB gzipped under a text extension, or 17.1 KB raw as `.wasm`. Nothing
parses the extension: the runtime fetches the bytes and checks the module's magic AND its length.

Browser-side, measured (profile/preloadprobe.mjs): Chrome compiles those bytes under text/plain,
text/plain+charset, application/json, application/octet-stream, text/html and application/wasm alike —
the content type cannot matter, because the bytes are compiled, never streamed by type. Real Safari
26.6.2 boots the same delivery (safari.mjs, desktop:seed, kernel fetched as text/plain).

⚠ THE MAGIC NUMBER IS NOT ENOUGH on its own: a text normalizer that appends one newline
(17489 → 17490) and a lossy UTF-8 transcode (→ 18787) both leave `\0asm` intact and still break the
module. The LENGTH catches all three (a BOM shifts the magic too). `__DECLARE_KERNEL_BYTES__` carries
the built size and the loader names the cause in the error.

## Prewarming the fetch

The emitted HTML carries `<link rel="preload" href="./declare-kernel.<hash>.wasm.txt" as="fetch"
crossorigin="anonymous">`. ⚠ `crossorigin` IS REQUIRED and the runtime's fetch must stay PLAIN.
Measured per combination by counting what the server actually sent: crossorigin + plain fetch = 1
request; crossorigin + `credentials: "omit"` = 2; no crossorigin attribute = 2 either way.

## Deployment, verified rather than assumed

| path | result |
|---|---|
| dumb static server, no config (the Pages case) | mounts, 464 nodes, kernel sent once |
| dev server, shipped boot bundle | mounts, 599 nodes, fetches /bundles/declare-kernel.wasm.txt |
| Mac host (inline + native kernel) | runs; desktop:seed 33.9 ms, as measured in round 3 |
| `file://`, double-clicked | fails — and fails on MAIN too: the module script itself is blocked |
| Chrome via the profiling rig with the external kernel | boots |
| real Safari 26.6.2 | boots |

The service worker needs nothing: it has no precache list and fetches every same-origin asset with a
conditional GET. tools/internal/stamp-version.mjs already hashes the whole `bundles` directory, so a
kernel-only change rolls BUILD_ID.

## Tests: the static-host path was already covered, and now covers the rest

test/static-host.test.mjs (IN the default suite; it predates this work, 2026-08-13) serves the tree as
a dumb static host and asserts apps render, which is the in-browser compile path. Extended here, with
NO extra page loads (each app boots once, every assertion reads that visit, and the fixture counts what
the SERVER sent — a worker-cached response never reaches it): the kernel is fetched once, served as
text, and live; a pre-warmed program boots from the committed build (`window.__declarePerf.path ===
"prewarm"`); a program that is not pre-warmed fetches the compiler and compiles in-page; the service
worker activates and controls the page. 7/7. ⚠ A pre-warmed boot STILL FETCHES the compiler bundle —
asserting "no compiler download" fails, which is why the assertion reads the recorded tier.

Two harnesses (richtext, slim) used to paste a production bundle into a blank page with setContent.
A page with no origin cannot fetch a sibling AT ALL, so they now serve the built directory over http
(`serveBuild`/`serveDir` in test/harness.mjs — the first shared serving helper; each browser test had
its own). richtext 11/11, slim 35/35. This is also simply a truer test: nobody deploys a pasted bundle.

## The compiler was being downloaded onto every pre-compiled page — 2026-09-17

Found while writing the static-host assertions: a PRE-WARMED boot still fetched the compiler bundle,
so "a pre-warmed program downloads no compiler" failed. Not a bug in the pre-warm tier — a deliberate
speculative warm at the end of boot-uniform.js, on by default, `?warm=0` to disable:

    if (!window.__declareServer && warm !== "0" && warm !== "false") loadCompiler().then(ensureLibrary)

DT's ruling: "It really should happen on demand. the homepage itself uses the compiler — if the user
edits the samples. Otherwise the pre-compiled versions load and that's it." So the knob is INVERTED:
off by default, `?warm=1` opts in. Nothing else changes, because the live-edit path already loads the
compiler itself (`liveCompile` → `loadCompiler().then(ensureLibrary)`, awaited by host-client's
`watchLive`); a first edit now pays the fetch at the moment the bytes are wanted.

WHAT IT COST, measured on the wire (profile/warmcost.mjs — the tree served as a dumb static host,
gzip applied to the types a static host compresses, one visit, everything the server sent):

| page | default (warm off) | ?warm=1 | the warm's share |
|---|---|---|---|
| apps/weather/ | 573.6 KB | 1762.9 KB | 1237.9 KB (+207%) |
| apps/calendar/ | 451.3 KB | 1697.3 KB | 1237.9 KB (+276%) |
| homepage (/) | 795.3 KB | 2033.8 KB | 1237.9 KB (+156%) |

`bundles/declare-compiler.js` is 4,494 KB raw / 1,234 KB gzipped — on every visit to a page whose
program is precompiled precisely so that no compiler is needed. Removing it from the default cuts
roughly two thirds to three quarters of what such a page downloads, which dwarfs every byte this
packaging round has been chasing (the kernel's whole delivery is 7.3 KB).

Both pages still report `path=prewarm` and render the same node count with the warm off, so nothing
about what loads changed — only when the compiler does.

# The second kernel, the conformance battery, and the recorder — 2026-09-17

DT's ruling on sequencing, after I proposed recording the C kernel's behavior as the baseline:
"that seems iffy. It's had far less of a workout than the JS code". Right, and the code settles it:
main's core is constraint objects on a queue, with NO rule kinds and NO compiled expressions, so it
is not the same shape — it is the tested implementation of the SHARED half (queue, coalescing,
structural wakes, after-steps then change events, cycle limits) and knows nothing of ownership,
decline, the track ring or EXPR. Neither implementation is a source of truth alone. The oracle with
the most mileage is the SUITE, which is written against main's semantics and passes there.

## What was built

**test/runtime-parity.test.mjs** — this tree's platform against main's, same app source, same scripted
interaction. ⚠ Two traps, both of which produced a FALSE PASS before they were found: (1) serving each
tree whole compares different PROGRAMS (main's desktop.declare had moved 549 lines ahead), so the
harness serves /apps/** from one tree and the platform from the other; (2) a probe written as a
TEMPLATE STRING makes page.evaluate return the function itself, which serializes to {} — and {} equals
{}, so every scenario passed no matter what the runtime did. Probes are real functions now and the
harness fails if one returns nothing. Verified by restoring the bug and watching it fail.

**runtime/src/kernel-js.ts** — the kernel ABI in JavaScript, ~430 lines, written from the contract
rather than transcribed from the C. Passes the 455-case unit suite and the whole node-side suite
(45 of the 68 files; the other 23 drive a browser, where the shipped bundle deliberately carries no
JS kernel). It DECLINES the built-in view rules (visAdd/extentAdd return -1) and the runtime falls
back to deriving visibility and auto-extent in JavaScript — the same path a host with no kernel takes.
Dropped from shipping bundles by `__DECLARE_JS_KERNEL__` (measured: 3.9 KB gzipped if it rides).

**test/kernel-conformance.test.mjs** — 13 scenarios driven through BOTH kernels in one process,
comparing returns, the whole table, and the exact sequence of host callbacks: every arithmetic opcode
(NaN in min/max, -0 through NOT, round at -0.5, mod of a negative, sqrt of a negative, div by zero),
ownership and yielding, a DYNAMIC rule re-discovering its reads, the two-phase queue, the cycle limit,
after-steps/change looping, suspend/resume, dispose, rewire, the write ring, freeCell, REF cells.

**runtime/src/kernel-trace.ts** — every crossing, both directions, with a table fingerprint per
settle; off unless asked (`DECLARE_KERNEL_TRACE=<file>` or `globalThis.__declareKernelTrace`), written
at exit so a crash still leaves the steps that led to it. A trace is a REPRO, never a definition of
correct — the header says so, because that is exactly the mistake DT caught.

## The one disagreement the battery found

`deps()` order. The C prepends each discovered edge (newest first); the JavaScript one appends
(oldest first). Nothing documented promises an order and `deps` is a diagnostic, so the test compares
them as sets — BUT the same lists drive THE PULL, so the two kernels visit a rule's queued owners in
opposite orders. That is a semantic difference hiding behind a diagnostic one. NEEDS DT'S RULING:
either the order is part of the contract (and one of them changes), or the pull must be order-free.

## Round 4 — the full before/after, all targets, with STARTUP — 2026-09-17 (evening)

`mac-host/profile/round4.mjs`; the report DT asked for streams to `~/Desktop/Declare-perf-before-after.md`
as rows land. Startup, as DT defined it: start of program EXECUTION → first paint; compile and fetch
excluded. Browser = `first-frame.end − render.start` from the boot marks both trees stamp; Mac = the
host's boot log, compile done → FIRST COMMIT. Seven cases × five targets (Chrome DOM, Chrome canvas,
Mac JIT, Mac interpreter, iPad Pro simulator DOM), main vs this tree.

**Interactive.** JS settle down on every one of the 35 cells: −60% to −95% on the propagation-heavy
cases (desktop:seed −90/−95/−90/−93/−92 across the five targets), −10% to −25% total on marketmap's
slider where the optimized page kept up with 50–80% more input events in the same window (per-settle
−41% to −58%). Frame p95 at the one-frame floor wherever it was not already; tracker:filter's 15
long frames on Chrome DOM → 0, Mac interpreter weather:resize 61 → 1.

**Startup.** Flat within noise on Chrome (±3 ms on six of seven apps), −7% to −16% on both Mac
configurations for every app but desktop/marketmap (flat), **−13% to −23% on iOS** for every app but
marketmap (weather 502→387, desktop 780→634, tracker 892→683). CORRECTION 2026-09-18: iOS Safari HAS a JIT
(WebContent process; the simulator too) — the no-JIT case is an in-process JSContext host, which the Mac
interpreter section stands for. Read the iOS and Mac-JIT startup gains together as JSC-vs-V8: a short boot
runs largely in JSC's lower tiers, so native kernel code pays at boot where V8's fast tiers already had it
covered (hypothesis, not measured).

**The one flagged regression was the app, not the runtime.** marketmap Chrome DOM 49→68 / canvas
49→70 (+38/+44%): the Optimize tree's copy of marketmap draws its close box with `✕` (U+2715, Dingbats)
in Helvetica Neue, which lacks the glyph; Chrome's first measurement of it walks system font fallback —
17.5 ms once per page, paid before first paint because the Text's auto-width derive runs at attach even
inside the invisible stage overlay. Main's marketmap has since moved to a drawn `CloseIcon`. Same source
on both runtimes: 48.9 → 53.4 ms. Found with `bootprof.mjs` (V8 samples aligned to the boot marks →
25.8 ms self in the raw measure → per-call log → the one 17.5 ms call → `--stackfor "✕"`).

**All apps, startup, same source (Chrome DOM, median of 5):** homepage 154→38 (−75%, the compiler
prefetch), textsampler −13%, weather −7%, sampler/calendar −5%, three lzx apps −2..3%, tracker/birds/
desktop/docs flat, controls +3 ms and marketmap +4 ms (the kernel's fixed setup cost, visible only on
the two ~45 ms boots). `bootprof.mjs --apps … --n 5 --apps-from main`.

**Still open from round 4:** canvas weather:city over-33 frames 1 → 7 (Mac stays 0 → 0, so it is in the
browser canvas path — raster cache replay suspected); the ~4 ms fixed kernel setup on tiny apps.

**Rig fixes.** `ios.mjs` did not exit after its result landed (Safari holds connections to the rig's
server): ~2:50 idle per run against ~10 s of work — fixed, exit on result. `bootprof.mjs` is the boot
profiler: `--cpu` (render-stage self/inclusive time, V8 clock bridged to wall time at Profiler.stop),
`--measure` (every measureText in the render stage, slowest first), `--trace` (Blink events clipped to
the window), `--stackfor <text>`, `--apps-from main` (one app source for both runtimes; mounted at
`/apps-from/`, since a mount may not shadow the tree's own `apps/`).

**The deps-order ruling** (section above): closed — the JavaScript kernel now matches the C (fixed
edges in order, discovered edges newest first), and the battery compares the lists as lists.

## Round 5 — the real iPad, and the kernel goes back inside the bundle — 2026-09-18

A physical iPad Pro (M5), wired, Safari, this Mac serving over Wi-Fi: `ios.mjs --real <udid>`
(devicectl `--payload-url` opens the page; the rig binds the LAN address), `round4.mjs --targets
device`, and `coldload.mjs` for the production cold first load (fresh origin per run).

**Interactive** matches every other target. **Startup was slower on every app** (+8..+77%), and the
cause was the sidecar kernel file: fetched when the runtime first needed it — inside the render
stage — one Wi-Fi round trip before first paint (loopback had hidden it everywhere else). A page
preload did not fix it: Safari fetched the preload and re-requested the file for the runtime's
plain fetch (14–19 ms wait remained; the simulator on loopback waited 3–4).

**Ruling (DT): inline.** `__DECLARE_INLINE_KERNEL__` true in declarec, build-boot and the profiling
build; no sidecar, no preload; index.html + one module. +3.0 KB gzipped (calendar 105.6 → 108.6;
main 89.8). Measured on the iPad: base64 decode 1–2 ms, WebAssembly compile+instantiate 6–10 ms.
And the runtime now starts loading its kernel when the bundle EVALUATES (reactive.ts, browser
only), so both run ~1 s before the render stage. Calendar startup on the device: main 107/114/121,
sidecar 179/157/148, inline+eager 98/97. Cold first load: execution→paint level (68 vs 78 median);
totals are the Wi-Fi's.

**Simulator column corrected:** quiet-machine re-run, calendar startup flat (163–174 vs 163–172);
round 4's iOS startup gains were batch-load noise; the JSC-tiers explanation is withdrawn.

Tests moved with the ruling: declarec.test (2 files, base64 present, no preload), static-host
(no kernel request, bundle carries the bytes), serve-parity (stubs re-baked). Rig fixes: ios.mjs
exits on result; `--real`; kernel request count; `bootprof.mjs`; `exprcensus.mjs` (52% of `{ }`
bodies lower to kernel bytecode; declines: strings 861, bare identifiers 221 (165 live bodies that
merely contain a constant), non-Math calls 171, &&/|| as value 38; bind-time declines are
dominated by "target not numeric" — colors, text — so COLOR SLOTS AS CELLS is the big lever).
zsh trap: an unquoted `$var` holding "--root /path" is ONE argument — two rig runs were mislabeled
by it before the results were discarded.

**A bug the eager load introduced, and the suite caught (2026-09-18):** with the kernel loading at
module evaluation, a page that instantiates a program before that promise resolves takes the
synchronous fallback (reactive.ts `kernel()` → kernelReadySync) and gets a kernel — then the async
instance landed and REPLACED it, an empty kernel under a program whose rules lived in the first
(perceptual R3–R7: wrong text widths, dead click cascades, both renderers). Fix: the first kernel
installed is the kernel; a late async instance is dropped. perceptual 129/129, gesture 52/52 after.
Device re-check after the fix: calendar startup 90 / 100 ms.

## Round 6 — the boot itself: what precedes first paint, and what need not — 2026-09-18 (afternoon)

**Wall clock on the iPad** (production build, `coldload.mjs`, ms from navigation start, calendar):
HTML 182→219 · bundle 245→416 · evaluated 422 · base64 decode 422→424 · WASM compile+instantiate
424→426 (boot waits exactly these 2 ms) · program instantiate 426→452 · fonts 452→453 · mount
453→475 · first contentful paint 481. Bundle-end→paint: main 65, optimized 65 (4 runs: 68/66/87/83 vs
64/95/66/96 — the device's own ±15 ms jitter is 3× the kernel's cost). On the COLD production path
there is nothing to overlap the kernel with: decode + compile are ~4–6 ms, serial, absorbed by the
faster instantiate/settles that follow. The eager kick earns its keep only where work precedes boot
(the dev server's in-page compile, a cache read). Desktop cold: main 289 vs optimized 314 median —
`app.attach` (the detached tree build) is 240–254 of the 314; the split needs marks in main's boot.

**Rig lessons.** A session per run on iPadOS leaves a Safari WINDOW behind (53 hidden windows before
it was noticed — every one a live page); the rig now uses ONE window per invocation, parked on
about:blank between runs and closed at the end. Consequence: the page process stays warm across runs
(exec→paint ~48–55 on calendar vs 65–70 with a fresh window) — fine for A/B, not for absolute
first-visit numbers. Remote Automation flipped OFF on the device after all windows were closed;
the rig's error names it. `declarec` (the library call) returns only index.html + module — the CLI
copies the app's siblings (weather.json, art/, …); the rig serves the app directory itself now.
Not a declarec bug (verified: the CLI emits the assets).

**Boot deferrals** (`runtime/src/boot-deferrals.ts`; switch `__declareNoBootDeferral` in profiling
builds; `bootprof.mjs --profile --flag …` and `coldload.mjs --marks --flag …` A/B them):
- KEPT: blank-raster readbacks wait for the first frame (dom-backend); dependency probes for plain
  dotted paths are walked, not `new Function`-compiled (bind.ts; desktop: 372 of 404 distinct paths).
  Chrome (profiling bundle, n=5): desktop 117 vs 121, weather 110 vs 115, calendar 77 vs 79.
  iPad (n=4, warm window): desktop 208 vs 222, weather 67 vs 69, calendar 55 vs 60.
- REVERTED: deferring the canvas-filter capability probe. Answering "no" until first paint sent every
  boot-time raster with a shadow down the software-blur fallback: desktop 133 → 260 ms on Chrome
  (~170 ms in replayFiltered) against the 10 ms probe. And the first A/B of it was invalid — the plain
  boot bundle folds the switch out (ON regardless); bootprof now has `--profile` for that reason.
- Item "compile only on decline" was already true: bodies the kernel takes never reach compileExpr.

**Chrome startup now, same source (n=5):** desktop 124 → 116, weather 128 → 110, calendar 88 → 77 —
the optimized tree boots faster than main on all three since the inline + eager kernel.

**Still open:** desktop cold +25 ms on the iPad (inside attach; needs main marked to split); the
rasterize-at-boot cost (18–25 ms Chrome, more on device) — deferral of off-screen rasters is the
remaining large boot item, judged fragile as first stated; reconcile/instantiate (~25 ms each) are
object-graph work the partition left in JS by design.

## Round 7 — interactive + startup on the CURRENT build (inline kernel, deferrals on) — 2026-09-18 (late afternoon)

`round4.mjs --targets chrome,device`. Chrome DOM: settle −14% (marketmap) to −89% (desktop seed) on all
seven; every hitching case smoothed (weather resize 10 → 2 long frames, tracker 13 → 1, marketmap 67 → 1);
startup weather 156 → 130 (−17%), desktop 139 → 131 (−6%), calendar 113 → 77 (−32%), tracker level,
marketmap +32% (the ✕ glyph in this tree's copy of the app). iPad Safari (dev-server rig, warm engine):
settle −17% (marketmap) to −90% (desktop seed); tracker p95 46 → 26, marketmap 48 → 23 with 65 → 1 long
frames; startup weather 225 → 169 (−25%), desktop 433 → 353 (−18%), tracker 124 → 129, calendar 89 → 100
(single samples; cold-load medians had calendar level), marketmap +10 ms (the glyph). With the sidecar
(round 4) every iPad startup was slower; with the kernel inline none is, outside the glyph and jitter.

The twin as a stand-in for main: NO — it carries the optimized architecture with a JS kernel (tracker filter
541 ms vs main 1174, WASM 469; desktop seed 112 vs 141 vs 15; startup 5–22% slower than main). A third arm,
not a baseline. Main is now instrumented directly (uncommitted): boot marks in main's runtime/src/boot.ts
(unconditional — main has no build flags), main's dist rebuilt with tsc; discard at merge time.

Desktop on the iPad, split (4 runs each): attach 267 vs 270 ms median, instantiate ~25 vs ~29, kernel 4–8;
execution → paint 329 vs 341 — the earlier +25 was mostly the device's jitter. (7) rasterize-only-on-screen:
hidden views' rasters are ALREADY deferred (dom-backend "owe the raster"); boot rasters are all visible and
in the viewport on desktop — nothing deterministic left; off-thread rasterization would change the first
frame (a product call). (8) lazy text measurement: semantics-preserving only as measure-on-first-read; deferred.

⚠ round4.mjs used to OVERWRITE the Desktop report on every run — it now appends a dated section; the file
was rebuilt from the logs + restored notes on 2026-09-18.

**All-apps startup on the current build (2026-09-18 evening; table on the Desktop report):** Chrome −5..−76%
on ten apps, level on two, +3.6/+6.8 ms on controls/lzx-weather. iPad cold: level or better on twelve;
controls and lzx-weather +10–25 ms — split: kernel decode 2–6 + compile 2–7 + ~8 ms of first-call
instantiate cost, on 40 ms boots. The fixed kernel setup is the remaining startup cost, visible only on tiny
apps; the no-decode (Latin-1) encoding would take 2–6 ms of it.

## Round 8 — pure compute, the graphics survey, and the wallpaper — 2026-09-18/19

- **Phase timer** (runtime/src/phase-timer.ts, dev builds only, folds out of production): exclusive ms per
  category over instantiate + attach; kernel methods wrapped only while timing. iPad: kernel registration +
  settle 1–4 ms per boot (3–8k rules) — batching registration is not worth it; `new Function` 0–3 ms on JSC but
  12–29 ms on V8 (bodies-as-code is the Chrome compute win); JS rule bodies + applies 15–33 ms.
- **Kernel derives**: position literals (center/end) and percents registered as kernel EXPR rules (bind.ts;
  `__declareNoKernelDerives`). −6% boot JS body runs across 8 apps; startup unchanged, interaction −1.5..−4%.
  LESSON: the body census must be TIME-weighted — the cheapest bodies moved, so little time did.
- **Font-string memo** (face-table names(), font-features featureFamily plain case): the font path was ~30% of
  all bytes allocated; weather city switch 227 → 147 MB (−35%).
- **boxBlur** restructured, bit-identical (blurcheck.mjs, 168 cases), 1.7–1.8×.
- **Graphics survey (Chrome)**: per-pixel work exists only in canvas-filter.ts (Safari fallback). The canvas
  renderer's own JS is small, but it drives the GPU at 3–5× the DOM renderer (weather city: GPU main 84% busy)
  and ~8× the background major GC (canvas-object churn; JS allocation only +24%). Rendering strategy, not C.
  Hit testing not a hotspot. web.mjs gained --trace per-thread busy time and --alloc.
- **Wallpaper blur removed** (DT): desktop on iPhone 15 Pro 901 → 153 ms execution → paint.
- iPhone 15 Pro UDID 00008130-001C39C12883401C (Developer Mode on; must be UNLOCKED, not just awake).
- **Font-string memo, timing (Chrome DOM, 2 runs each vs the night before):** marketmap slider settle 1,979 →
  1,771 ms while completing 15% more settles (−22% per settle), frame p95 33.3 → 16.7 ms, frames 220 → 241;
  weather resize 287 → 263 ms (−8%). The largest pure-compute win of the round.
- **Time-weighted rule census (bodycensus.mjs, now times each body; Chrome, 8 apps' boots):** JS rule bodies
  total 124 ms (~15 ms/app, warm re-run timing). By TIME: Text's style/height/width 35%, layout shapes ~28%,
  non-Math calls 15% (mostly tracker's Dataset.contents: 15 ms in 13 runs), strings 4%; everything the kernel
  could still take (&&/||, colors, constants) ~2%. CONCLUSION: further kernel lowering is not worth it for speed;
  the remaining rule cost is text, layout and data parsing.
- **Bodies as compiled code, size:** +0.6–1.4 KB gz per app (calendar, desktop, tracker, weather), minified
  functions vs today's JSON strings — under 1% of the bundle.
- **Canvas renderer repaints the WHOLE canvas every frame** (canvas-backend.ts: clearRect(0,0,w,h) + root.paint).
  Dirty regions discussed with DT: the safety net would be a checking mode (partial repaint vs full repaint,
  pixel-compared, in the suites) + a full-repaint bailout + staged coverage. Canvas pooling hypothesis
  (external-memory GC) to be confirmed by counting canvases created per frame.

## Round 9 — precompiled bodies and the style gate — 2026-09-19

**Precompiled bodies** (declarec precompileBodies; runtime expr.ts "PRECOMPILED BODIES"; opts.precompile false
ships text). Every { } body, method body and script block ships as a function built exactly as the runtime would
build it (same datapath rewrite, parameters, helper and script names, unpacked once by a factory rather than per
call); the program carries a token (NUL + slot index; methods reaching super keep "$base" in theirs). Two text
dependencies found and fixed: orderProvisions matched provided("x") in provision TEXT (now also the compiler's
deps: tracker's textColor had installed before theme), and instantiate decides $base by looking for "$base" in the
method text. The runtime's own small expressions (receivers, dependency probes) are now WALKED, not compiled
(pathFn: a root name, names, calls with JSON-literal arguments; lone literals as constants; anything else compiles
as before). Result: ZERO text-to-code at boot on all 13 apps; they boot under script-src 'self'
'wasm-unsafe-eval' (test/precompiled.test.mjs: 4 apps, a super program, and a text-build control).
- Size: bundles SMALLER (desktop -6.6 KB gz, tracker -4.8, marketmap -3.3, calendar -2.1; lzx-weather +0.3).
- Chrome production startup (prodboot.mjs, median of 7 fresh loads): -4 to -12 ms (3-12%); tracker -12.1.
- iPhone 15 Pro: neutral (JavaScriptCore's new Function is cheap). On Safari the value is CSP, Hermes, size.
- CSP requirement to document: 'wasm-unsafe-eval' (for the kernel), not 'unsafe-eval'.

**Text style gate** (text.ts): the style record is pushed only when a field changed, the surface changed, or a
face landed (faceGenerationNow). Chrome: marketmap slider settle -11% (style rule 294 -> 132 ms), weather -7%.

**iPhone 15 Pro, main vs optimized:** marketmap slider 118 -> 293 steps processed, p95 53 -> 20 ms, long frames
60 -> 1; weather resize settle -69%, long frames 12 -> 2, startup -25%; tracker filter settle -28% but long
frames 15 -> 21 in one run (the iPad had 14 -> 4), to re-run; tracker startup -14%.

## Round 10 — the filter fallback: WebAssembly loops and bounded regions — 2026-09-19

The canvas `filter` fallback (Safari's canvas accepts ctx.filter and paints unfiltered) — exercised by no shipped app
since the wallpaper blur went, but by every high-polish app that blurs or colours in draw(), filters a view, or
wears frost on the canvas renderer.
- **kernel/filter/filter.c → filter.wasm** (6.5 KB raw, 2.4 KB gz; SIMD128): the box blur (doubles in f64x2, two
  channels per vector, so every rounding matches the JS) and the colour matrix (scalar, same expression order).
  BIT-IDENTICAL to the JS (mac-host/profile/filtercheck.mjs: 168 blur cases, 19 matrix combinations); blur 6.6×
  the plain JS, 3.5× the restructured JS; matrix 1.5×. Built by `node kernel/build.mjs filter` into
  runtime/src/filter-wasm.ts, imported ONLY by canvas-filter.ts — so declarec's existing stub (no filter fact, not
  a canvas build) removes it with the module. Verified: DOM builds without filters embed 1 wasm (the kernel),
  canvas builds and filter-using programs 2. Compiled SYNCHRONOUSLY at the first real need (a boot's rasters are
  the first users); no SIMD → the JS loops stay. Switch: __declareNoWasmFilter.
- **Bounded regions** (draw.ts filterRegion): on the canvas renderer every filtered draw op was processed over the
  WHOLE shared canvas (a 150×110 swatch read back and blurred 3.8 M pixels). Now: the op's recorded extent through
  the transform, grown by the filter's reach, ∩ the visible region (cull — dirty regions will tighten it for free).
  Output unchanged vs native (testbed mean Δ 2.24 canvas / 2.35 DOM before and after). Switch:
  __declareNoFilterRegion.
- **Testbeds:** test/probe/filterbed.declare (every road; now pinned in canvas-filter.test, 6/6) and a temporary
  desktop with the wallpaper blur restored (deleted after measuring).
- **Chrome, fallback forced:** filterbed canvas first frame 2,441 ms → 154 ms (JS/whole 2,441, WASM/whole 1,599,
  JS/bounded 193, WASM/bounded 154; native 44). filterbed DOM 198 → 145 ms; blurred desktop 236 → 197 ms.
- **iPhone 15 Pro (real fallback), both orders:** filterbed canvas 5,285/5,155 → 583/567 ms (−89%); filterbed DOM
  572/593 → 358/288 (−44%); blurred desktop 588/584 → 532/511 (−11%: a wallpaper-sized blur is bound by the
  full-resolution scratch draw, downscale and readback, not the arithmetic — the next lever would be drawing a
  wide-blur op straight at the reduced resolution, gated on the native comparison).

## (2) What a frame is made of — and what native code could take (2026-09-19)

web.mjs `--cpuprofile --categorize` sorts EVERY sampled main-thread ms of an interaction into categories (the
profiling bundle keeps real names). Chrome, 8 interactions:
- the BROWSER's own style/layout/paint ("(program)" + trace events): 33–81% of busy time on the DOM renderer
  (calendar mode 81%, desktop minimize 63%, weather 43–47%, marketmap 33%);
- canvas renderer: painting 14–35%, garbage collection up to 21% (weather city);
- text measurement 1–11%; the KERNEL 1–8%; rule bodies + applies 1–8%; layout strategies 0–4%; reactive core ≤1%.
- inside "other runtime JS": the PROVIDED-VALUE LOOKUP (providedDefault → providedRead: an ancestor walk on every
  read of a face slot) — 257 ms of marketmap's 3.8 s slider window (~7%), ~2% of weather's city switch. A pointer
  walk over the JS object graph: not a native target; an algorithmic one (cache the provider per view per name,
  invalidated by provision install/remove above it). Noted as a small design task, not built.
- inside "anonymous": the author's bodies and app script (marketmap's mapPartition 42 ms) — the program's own work.
CONCLUSION: no remaining per-frame compute worth moving to WebAssembly; the frame is the renderers' requests to the
browser. That is what dirty regions (3) attack.

## Round 11 — dirty regions on the canvas renderer — 2026-09-19

The canvas renderer repainted the WHOLE canvas for every change (a hover, a caret, a dragged window). Now a frame
repaints only what changed. Canvas renderer only: the DOM renderer gets this from the browser, and the Mac host's
layer tree from Core Animation.

**How it tracks.** Each surface records the device box its subtree last PAINTED (own ink ∪ children, a clipping
surface's children cut to its box; a plain container with no fill/stroke/text/etc. owns no ink). Every setter that
changes pixels names its surface (`invalidate(this)`); a frame's damage is, per changed surface, where it WAS (its
painted box) ∪ where it IS NOW (its subtree's box under the current ancestor transforms), plus the old box of
anything removed or re-homed, plus a scroller's bar strip when its extent changes or a child moves, plus — fixed
point — the whole box of any frost whose blur reach touches the damage. Up to 8 rectangles (merged only when the
merge wastes little); over half the canvas → a plain full repaint. The frame clips to the rectangles, clears them,
and repaints the tree culling every subtree whose painted box misses them (a changed subtree always paints). Full
repaint whenever the answer is unknowable: a surface-less request (page scroll, dpr, resize), a 3D ancestor.
Switch: `__declareNoDamage`.

**Proof, not faith: the checking mode** (`__declareDamageCheck`, profiling builds). After every partial frame it
repaints everything offscreen and compares pixels: INSIDE the damage exactly, against a repaint under the same clip
without culling (any difference = a subtree wrongly culled); OUTSIDE against the unclipped repaint, past a 24/255
tolerance (a missed invalidation shows far above it). Two lessons it taught: Chrome picks GPU or software per
canvas (by size, and after readbacks) and they antialias differently; and Chrome's SOFTWARE raster antialiases a
curve differently within ~9 rows of a clip or canvas edge (≤18/255) — the GPU raster doesn't (verified in
isolation). The check therefore runs Chrome with GPU canvas off (the rig adds --disable-accelerated-2d-canvas;
no runtime code). Final sweep, 10 interactions
(desktop drag / open-close / menu scrub / hover / minimize, tracker hover / filter, calendar mode, weather city,
marketmap slider): **0 mismatched frames**, also with the canvas pool on.

**Fixed on the way** (each found by the check or by the reason meter): scroll-loop motion, scroll-bar hover/drag
and frost rest frames asked for a full repaint; a child insert damaged its whole parent; an extent change damaged
the whole scroller; a transparent full-screen container (a menu's dismiss layer) counted as ink over the window;
one bounding box turned a row + a scroll-bar strip into the whole list.

**Canvas pool.** Group layers, masks, tint passes and frost snapshots now come from a pool keyed by exact size
(≤ 6 Mpx held, released after a second idle) instead of a new canvas per paint.

**Chrome (M-series Mac), mean of 2 runs, canvas renderer:**

| interaction | full repaint: paint JS / GPU ms | dirty regions + pool: paint JS / GPU ms | area repainted |
|---|---|---|---|
| desktop window drag | 140 / 605 | 47 / 336 | 28% |
| desktop open/close | 122 / 554 | 61 / 459 | 28% |
| desktop menu scrub | 43 / 178 | 32 / 156 | 8% |
| desktop hover | 33 / 174 | 32 / 110 | 9% |
| desktop minimize | 477 / 1,987 | 382 / 1,622 | 42% (a 920×600 window is 64% of the canvas) |
| tracker hover | 66 / 122 | 14 / 70 | 4–5% |
| tracker filter | 368 / 490 | 112 / 214 | 9% |

Frame pacing on this Mac was already 60 fps both ways; the win here is work (and battery), and should show as
frames on a slower device. calendar mode / weather city / marketmap slider change most of the screen per frame and
stay full repaints by rule.

**Bytes.** Canvas production builds +2.6 KB gz (desktop 155,450 → 158,072; tracker 142,126 → 144,877) — the
tracking, the rectangles, the bar strips and the pool. DOM builds: none of it (the canvas backend is not in them).
Every dev-only piece — the checking mode, the reason meter, the paint meter, the invalidation census — lives in
top-level functions reached only from sites that name the build flag in place: a production canvas bundle
contains none of their strings (verified by search), and the paint meter's own old `let u=!1` leftover went with it.

**The raster memo seam (found by raster-memo.test, fixed).** When the memo switched a drawing between vector
replay and its raster (a promotion, a fall-back) during a PARTIAL frame, only the damaged part showed the switch —
and for a blurred drawing the two differ by up to 52/255 (the memo's known blur hole), so a seam crossed the
drawing until something repainted it whole. Now a partial frame that switches a drawing's representation books the
whole drawing for the next frame (paintDrawing wrapper, one flag per op). The probe's caption also moved inside the
drawing's box: the test promotes by moving it, and with dirty regions a move that doesn't overlap the drawing
(correctly) no longer repaints it. raster-memo 5/5 on GPU and software canvases. The checking mode's outside
tolerance (24/255) is why the sweep didn't catch this; the memo test did.

**Tests.** Full suite green except release/format, which shell out to git (this tree has none).

**iPad Pro 11" (M5), Safari, canvas renderer, dirty regions off → on** (mac-host/profile/damage-device.mjs: one
server for the round, a new tab per run, run-prefixed page URLs so a restored tab can't run; 2 reps per mode,
alternating order; viewport 1210×702 @2x; Safari paces rAF at 60 Hz here). Paint JS = the JS that issues the
canvas commands; Safari's own raster/composite work runs off the page's thread and isn't visible to the page.

| interaction | paint JS ms | frames over 20 ms | frame p95 ms | share repainted |
|---|---|---|---|---|
| desktop window drag | 269 → 204 | 0 → 0 | 17 → 17 | 35% |
| desktop open/close | 114 → 88 | 0.5 → 0.5 | 17 → 17 | 36% |
| desktop menu scrub | 138 → 81 | 2 → 1.5 | 17 → 17 | 10% |
| desktop hover | 42 → 46 | 0 → 0 | 17 → 17 | 11% |
| desktop minimize | 475 → 412 | 13.5 → 9 | 18.5 → 17 | 42% |
| tracker hover | 112 → 29 | 0 → 0 | 17 → 17 | 5% |
| tracker filter | 583 → 159 | 10.5 → 8 | 19.5 → 19 | 9% |

The M5 already holds 60 fps on the light interactions both ways; the heavy ones (minimize, tracker filter) drop
fewer long frames. Paint JS falls most where little of the screen changes (tracker hover −74%, tracker filter
−73%, menus −41%); desktop hover is flat (its hover changes are small boxes over a cheap scene).

**iPhone 15 Pro, Safari, same rig.** The wins hold where little changes — tracker hover 101 → 25 ms of paint JS,
tracker filter 421 → 141, menu scrub 229 → 152 with long frames 14.5 → 7. But a PHONE-sized canvas makes a desktop
window cover most of the screen, so the "over half the canvas → full repaint" rule fired on nearly every drag and
open/close frame: the tracking was paid for and nothing saved (drag 234 → 260 ms). The threshold was an assumption;
measured on the phone (one run each, drag / open-close / minimize):

| threshold | drag paint JS | open/close paint JS | minimize paint JS | minimize frames > 20 ms |
|---|---|---|---|---|
| off (full repaints) | 239 | 149 | 573 | 106 |
| 0.5 | 256 | 151 | 482 | 102 |
| **0.8 (now the default)** | 245 | 139 | 470 | **69** |
| 0.98 | 293 | 143 | 456 | 74 |

DAMAGE_MAX is now 0.8: past that share a full repaint still wins (0.98 costs again — a clip over nearly the whole
canvas), below it the partial frame does. Re-checked the two interactions that newly stay partial: open/close 0
mismatches; minimize 2 pixels (worst 38/255) at one spot on the dock, out of damage, in every flagged frame — the
software raster's clip-edge antialiasing, which the check's 24/255 outside tolerance doesn't cover and the GPU
raster doesn't produce. raster-memo still 5/5.

**The device rig now runs a round in ONE tab** (DT, 2026-09-19): each run reports, the rig answers with the next
run's URL, and the page navigates itself there — so a round leaves one tab, not thirty, and no earlier run's
canvases and caches sit alongside the measured one. `--new-tab` restores the old behaviour.

## Round 12 — the provided-value walk — 2026-09-19

`provided("fontSize")` and friends resolve by walking up the tree until a node provides the name (or a node's
declared slot answers it), and every text leaf does five such reads. The census (dev switch
`__declareProvidedCensus`, profiling builds) measured the walk before touching it:

| interaction | reads in the window | ancestors per read | answer same as last read | answer ever changed |
|---|---|---|---|---|
| marketmap slider | 1,533,347 | 3.00 | 99.6% | 0 |
| tracker filter | 109,689 | 3.21 | 93.9% | 42 |
| weather city | 92,186 | 6.51 | 97.7% | 0 |

61% of marketmap's reads walked to the ROOT and returned the default — the most expensive outcome, and the most
cacheable. So: **memoize the ANSWER, never the value.** Each node keeps a small map from name to the node that
answered it (`$providedFrom`), and the value is still read through that provider's cell or accessor, so
reactivity is untouched.

**Invalidation — the whole design risk.** An answer changes only when (1) a node gains a provision NAME it did not
have (a global generation bump, rare; a provision's VALUE changing is not this — the reader tracks its cell), or
(2) a node moves to a DIFFERENT parent, which changes that subtree's chains and nothing else's (clear that
subtree's memos, `providedChainMoved`). Replication's re-link removes and re-inserts every row of a block under
the SAME parent on any change: `Node.removeChild` now records the ex-parent, so a re-link is not a move and does
not flush the memo — the one mistake that would have emptied the cache exactly where the reads are hottest.

**Chrome, marketmap slider, 6 runs with the memo vs 2 without** (the memo's own counters are identical to the
digit across all six: 5,680 walks, 2 generation bumps, 2,182 subtree clears, ~1.59 M hits — no invalidation
storm):

| | settle JS | frames over 33 ms | providedRead self time |
|---|---|---|---|
| without the memo | 1,866 / 1,874 ms | 6 / 7 | 222 ms |
| with the memo | 1,700–1,730 ms | 0–4 | 81 ms |

weather city: providedRead 29 → 5 ms; busy 1,778 → ~1,500 ms. **Bytes: +274 B gz** on a canvas build (desktop
158,072 → 158,346); the census and the counters are dev-only and absent from production (verified by search).
Switch: `__declareNoProvidedMemo`. Suite green (66/68, the two that shell out to git).

**Heap** (estimated, not measured — DT: good enough): one small map per reading node, one entry per name it
reads. The census's first-read counts ARE the entry counts: marketmap 5,660, tracker 6,602, weather 2,119 — about
half a megabyte at marketmap's scale, against 4.6 M walk steps removed.

## Replication: measured, and NOT worth optimizing now (2026-09-19)

DT's item (4). Where it was left: round 2b (09-16) fixed windowed recycling (tracker filter −60% on Chrome, worst
frame 100 → 33 ms); "phase E", making row construction itself cheap, was deferred and never built; marketmap was
recorded as the case the block did not fix.

What the code does badly in principle: a fully materialized block has no recycler (the harvest is gated on the
windowed path), and any change unlinks and re-inserts every child of the block, which is quadratic through
`indexOf` + `splice`. What that costs in practice, measured headless (one row changed, full materialization):

| rows | build all | insert at head | remove head | per row (insert) |
|---|---|---|---|---|
| 250 | 11 ms | 1.2 ms | 1.2 ms | 4.7 µs |
| 1,000 | 16 ms | 2.2 ms | 2.0 ms | 2.2 µs |
| 4,000 | 36 ms | 10.0 ms | 7.6 ms | 2.5 µs |

Per-row cost is FLAT: the quadratic term has a tiny constant (splices are memory moves), so it does not bite below
several thousand fully materialized rows — which is what `virtualize` is for. The profiles agree: reconcile
appears nowhere in the top entries of any Chrome profile, and marketmap's slider is not a replication case at all
(its tile set never changes; the cost is text measurement, layout and attribute writes). CLOSED as a performance
target; reopen only if an app materializes thousands of rows without virtualizing.

# THE MERGE ROUND — no optimizations vs all on, one build, one session — 2026-09-19

The arc is merged into main. This is the before/after DT asked for: "not on a per optimization
basis but on a before after basis (no optimizations vs all on), one test round, that's it."

**The rig.** One metered web build (`build-runtime.mjs --web`), headless Chrome, each case driven
twice back to back in the same session — every A/B lever off, then every one on:

```
node mac-host/profile/web.mjs <app> --stim <stim> --render <render> --inpage \
  --flag __declareNoDamage=true --flag __declareNoCull=true --flag __declareNoRasterMemo=true \
  --flag __declareNoWasmFilter=true --flag __declareNoKernelDerives=true --flag __declareNoKernelExtent=true \
  --flag __declareNoTrackRing=true --flag __declareNoFilterRegion=true --flag __declareNoRasterWorker=true \
  --flag __declareNoBootDeferral=true --flag __declareNoMeasureMemo=true
```

## What it measured

| case | metric | off | on | |
|---|---|---|---|---|
| tracker:filter (canvas) | paint JS | 403 ms | **112 ms** | **−72%** |
| tracker:filter | painted area | 100% (297 full) | **8%** (283 of 295 partial) | |
| desktop:seed (canvas) | paint JS | 113 ms | **95 ms** | **−16%** |
| desktop:seed | painted area | 100% (121 full) | **53%** (122 of 124 partial) | |
| tracker:filter | settle | 618.9 ms | 655.0 ms | +6%, see below |
| desktop:seed | settle | 13.3 ms | 13.9 ms | +5%, see below |
| tracker boot | constraints WIRED | 7016 | 8215 | +17% statically wired |
| desktop boot | constraints wired | 600 | 787 | +31% |
| weather boot | constraints wired | 40 | 75 | +88% |

Frame pacing is identical in both arms on this machine (rAF p50 16.7, p95 16.8): a 1280×828
viewport on an idle Mac has the headroom to absorb a full repaint, which is exactly why the
device rounds exist — the phone did not (round 5, iPhone).

## THE SETTLE ROWS DO NOT SAY WHAT THEY APPEAR TO SAY

Settle comes out flat-to-slightly-worse, and quoting that as "the optimizations cost settle time"
would be wrong. THE BIGGEST SETTLE WORK OF THE ARC HAS NO SWITCH AND IS THEREFORE ON IN BOTH ARMS:
the kernel's core evaluation and its visibility rule, the provided-value memo, and (on the Mac) the
binary geometry channel. The levers that DO exist are paint-side and boot-side. So this round
measures the paint partition honestly and UNDER-REPORTS the arc as a whole; the +5/6% on settle is
run spread on top of an unchanged core, not a regression the switches caused.

The boot rows are the one place the kernel shows through the switches: `__declareNoKernelDerives`
and `__declareNoKernelExtent` off, and a third to nearly twice as many constraints end up STATICALLY
WIRED rather than tracked — fewer edges rebuilt on every run, which is the mechanism the settle
numbers of rounds 3 and 4 measured.

**A case that measured nothing, reported rather than dropped:** `weather:resize` returned 0 settles
in both arms. `apps/weather` no longer exists in main (`apps/lzx-weather` is a different app whose
layout does not respond to a viewport resize), so the stimulus drove nothing. Its boot row above is
still real; its window row is not a number and is not quoted.

**What a TRUE pre-arc number would take:** a second working copy of the last released tree, built
and driven through the same rig. Not done here — every figure above is one build with levers
flipped, which is what the question asked for and is the honest limit of what it answers.
