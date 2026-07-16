# Dashboard: canvas kernel vs DHTML — HiDPI (dpr=2 / Retina) only

**Question.** The calendar's Retina benchmark (`RESULTS-canvas-vs-dhtml-dpr2.md`) put the own-pixels
canvas kernel **−19.7 ms / −13.4 %** ahead of DHTML at ready-for-input. The dashboard is the
**heavier** DoD app — 5 windows, the **~146-image chrome burst**, window tinting, more text, embedded
Vera fonts. Does that heavier image/text/tint load **grow, hold, or shrink** the canvas win, and
**where does the 146-image burst land** (paint/decode, on- or off-thread)?

**Policy (2026-07-01):** we benchmark at **dpr=2 (Retina) only**; dpr=1 / low-res is dropped. So this
is a single-resolution canvas-vs-dhtml comparison, not a dpr-sweep.

**Measurement only** — no kernel/app/runtime was modified. The canvas side is a **frozen snapshot** of
the current dpr-aware `LFCcanvas.js` so the result is isolated from ongoing kernel work; the DHTML side
is the pristine distro `lfc.js`.

---

## Method

- **Same harness as the calendar:** `timeline.mjs` (PRIMARY, ×5 each kernel) + `browserprof.mjs`
  (CDP trace incl. `cc`/`gpu`, ×3 each), run at **`CAP_DPR=2`** on **both** kernels. dpr=1 was **not**
  run (policy). Medians + [min..max] reported.
- **Canvas (frozen):** current dpr-aware `LFCcanvas.js` snapshotted to
  `benchmarks/apps/dashboard/LFCcanvas-bench.js` (**md5 `da8b501e383ce4422225b8bf2673aeb6`, 376 250 B**;
  3 `devicePixelRatio` refs — byte-identical to the calendar's frozen dpr-aware kernel). Driven by
  `dash-canvas-bench.html`. **DHTML** side = `dash-dhtml.html` → distro `/runtime/lfc/lfc.js`
  (434 651 B), pristine.
- **App:** `dashboard-bench.lzx.js` (440 169 B) — the skip-login **eager** bench build; both kernels
  run the identical app JS. Viewport **1000×720** (→ 2000×1440 backing at 2×). Milestones:
  `app-oninit` → `dashboard-shown` → harness `canvas-init` → trace-derived first-paint / fully-rendered
  / ready-for-input.
- **Chrome:** pinned Chrome-for-Testing `mac_arm-146.0.7680.31`, headless, `--no-sandbox`,
  `--force-device-scale-factor=2` + `deviceScaleFactor:2`, fresh `userDataDir` per run. Served by a
  dedicated `serve-static.mjs` on **:8242** (precompiled bytes; no compiler in the loop; :8200/:8201
  and other 82xx ports were in use and avoided).
- **Contention:** no other agents active. Both clusters came in **tight** — canvas ready-for-input
  [497.0..502.4] (spread 5.4 ms), dhtml [531.2..535.9] (spread 4.7 ms). **No outliers**; nothing
  re-run.
- **Visual parity at Retina confirmed:** both kernels render the full dashboard — all 5 windows
  (Daily Content, Planner, People, Media, Communications), window tinting, the contact list, embedded
  fonts, images — **pixel-identical at 2000×1440 (1000×720 @2×)**. Canvas draws it all as own-pixels
  (`document.querySelectorAll('canvas').length === 1`, `img === 0`); DHTML uses **343 DOM `<img>`
  nodes**, `canvas === 0`. Screenshots: `screenshots/dash-canvas-dpr2.png`, `dash-dhtml-dpr2.png`.

---

## 1. PRIMARY — ready-for-input (`timeline.mjs`, median of 5, [min..max] ms)

| kernel | ready-for-input @ dpr=2 |
|---|--:|
| **CANVAS** | **500.1** [497.0..502.4] |
| **DHTML**  | **533.6** [531.2..535.9] |
| **Δ (canvas − dhtml)** | **−33.5 ms  (−6.3 %)** |

The milestone ladder (median ms) shows the win is **entirely built before the image burst**:

| milestone | canvas | dhtml | Δ (cv − dh) |
|---|--:|--:|--:|
| first paint (splash) | **56** | **216** | **−160** |
| app-oninit | 140.0 | 169.8 | −29.8 |
| dashboard-shown | 140.8 | 170.8 | −30.0 |
| **canvas-init** (logical tree done) | **152.4** | **195.4** | **−43.0** |
| fully rendered / **ready for input** | **500.1** | **533.6** | **−33.5** |

Two things jump out versus the calendar: (a) the canvas **splash paints ~160 ms earlier** (56 vs
216 ms) — the DHTML dashboard builds a large DOM before Chrome flushes its first paint, whereas the
canvas kernel blits its splash immediately; (b) **ready-for-input is ~500 ms on both**, i.e. **~350 ms
of the startup is the shared 146-image chrome burst that lands after `canvas-init`** — a cost neither
kernel avoids.

---

## 2. Category split (`timeline.mjs`, main-thread totals, median ms)

| column | CANVAS | DHTML |
|---|--:|--:|
| **JS (Laszlo/app)** | **260.3** | 207.3 |
| style | 2.0 | 10.6 |
| layout | 0.5 | 13.7 |
| paint | 0.4 | 15.8 |
| composite (main-thread) | 1.0 | 9.9 |
| idle/wait | 232.8 | 277.6 |

The **DOM-pipeline collapse is intact at Retina**: canvas style+layout+paint+composite ≈ **3.9 ms**
vs DHTML ≈ **50 ms**. But note the canvas **JS is +53 ms higher** — the opposite of the calendar,
where canvas JS was *lower*. Splitting by phase shows exactly why.

### Where the time goes — build phase vs the 146-image burst (median ms)

| | dur | JS | style | layout | paint | composite | idle |
|---|--:|--:|--:|--:|--:|--:|--:|
| **BUILD (nav → canvas-init)** | | | | | | | |
| canvas | 152.4 | 119.4 | 1.5 | 0.1 | 0.1 | 0.2 | 31.0 |
| dhtml | 195.4 | 141.7 | 7.2 | 7.6 | 1.1 | 1.1 | 36.6 |
| **BURST (canvas-init → ready; the 146-image chrome)** | | | | | | | |
| canvas | 346.5 | **142.1** | 0.5 | 0.4 | 0.3 | 0.9 | 203.6 |
| dhtml | 338.6 | 66.6 | 3.4 | 6.0 | **14.7** | 8.8 | 239.1 |

**The whole net win is the BUILD phase (−43 ms)** — DOM-pipeline elimination (~15 ms) plus lower JS
(the DHTML build also creates a DOM shadow per view). **The BURST phase is a near-wash, and slightly
FAVORS DHTML (canvas 346.5 vs dhtml 338.6, +7.9 ms).** In the burst the canvas kernel spends
**142 ms of main-thread JS** while DHTML spends only 67 — because the **M1 kernel has no dirty-rects,
so every one of the 146 image-load completions triggers a full-scene repaint of the 2000×1440 backing
store on the main thread.** DHTML instead pays that back in the browser pipeline (paint 14.7,
composite 8.8, layout 6.0). So the 146-image burst **converts DHTML's off-path browser paint into
on-path canvas JS redraws.** Image *decode* itself is off-thread on both sides (the ~200–240 ms idle).

---

## 3. Off-thread confirmation — `browserprof.mjs` (CDP trace incl. `cc`/`gpu`, median of 3)

| metric (ms unless noted) | CANVAS | DHTML |
|---|--:|--:|
| first-paint | 60 | 220 |
| trace style | 2.1 | 11.3 |
| trace layout | 0.5 | 14.1 |
| trace paint | 0.3 | 16.5 |
| **trace composite (incl. cc/gpu)** | **16.2** | 5.2 |
| `ScriptDuration` | **193.5** | 121.7 |
| **`TaskDuration` (total main-thread)** | **248.8** | 210.3 |
| Layout count | **11** | 155 |
| RecalcStyle count | **15** | 156 |

This **quantifies the M1 tax the calendar never exposed.** The structural wins hold — DOM style/layout/
paint ~2.9 ms (canvas) vs ~42 ms (dhtml); layout passes **155 → 11**, style recalcs **156 → 15**. But:

- **`ScriptDuration` +72 ms** (193.5 vs 121.7) — the 146 full-scene redraws, on-thread. (Matches the
  burst-phase +75 ms JS from §2.)
- **composite +11 ms** (16.2 vs 5.2) — the GPU/`cc` composite of the whole 2000×1440 surface, repainted
  through the burst. Larger than the calendar's dpr=2 composite margin (+5.2 ms): a bigger surface,
  repainted 146× as images stream in.
- **`TaskDuration` +38 ms** (248.8 vs 210.3) — **the canvas kernel now does MORE total main-thread work
  than DHTML.** On the calendar `TaskDuration` was flat/canvas-lower and the win was "clean." Here the
  146-image burst makes the own-pixels kernel work *harder* per frame; it still reaches interactive
  first only because the build-phase DOM elimination and the 160 ms-earlier splash outweigh it.

---

## Comparison to the calendar (the headline question)

| app @ dpr=2 | ready-for-input Δ (cv − dh) | Δ% | canvas TaskDuration vs dhtml |
|---|--:|--:|--:|
| **Calendar** (light: ~30 img, mostly pre-init) | **−19.7 ms** | **−13.4 %** | flat / canvas-lower (clean win) |
| **Dashboard** (heavy: 146-image burst, tint, fonts) | **−33.5 ms** | **−6.3 %** | **+38 ms (canvas does MORE)** |

**Does the heavier load grow, hold, or shrink the win? Both — split the axes:**

- **In absolute ms the win GROWS** (−19.7 → −33.5 ms). But that is mostly clock arithmetic: the
  dashboard's build phase is bigger, so DOM-pipeline elimination saves more absolute ms there (−43 ms
  at canvas-init), and the canvas splash lands 160 ms earlier.
- **In relative terms the win SHRINKS by half** (−13.4 % → −6.3 %). The shared ~350 ms 146-image burst
  inflates *both* kernels' totals to ~500 ms, so the same structural lead is a smaller fraction.
- **The heavier load exposes a canvas-side cost the calendar hid.** The 146-image burst is where the
  **M1 full-scene-repaint baseline** bites: each image completion repaints the whole surface on the
  **main thread** (ScriptDuration +72 ms, composite +11 ms, TaskDuration +38 ms). The burst phase alone
  slightly favors DHTML (+7.9 ms). The net stays positive purely on the build-phase win.

**Where does the image burst land?**
- **Canvas:** the *redraws* are **on the main thread** (the +72 ms `ScriptDuration` / +142 ms burst-JS —
  M1 has no dirty-rects), plus **off-thread** GPU/`cc` composite of the big surface (+11 ms). The
  *decode* is off-thread (the ~200 ms burst idle).
- **DHTML:** in the **browser pipeline** — paint 14.7 ms + composite 8.8 ms + layout 6.0 ms for 146 DOM
  `<img>` nodes (155 layout passes), largely off the JS path; decode off-thread.
- **On both:** image **decode is off-thread** and shows up as idle/network-wait, not main-thread time.

---

## Honest interpretation

- **The startup win holds at Retina for the heavy app, but it is thinner and less "free" than the
  calendar's.** Canvas is ready-for-input **−33.5 ms / −6.3 %** ahead. The advantage is real and comes
  from the build phase (DOM-pipeline elimination + a 160 ms-earlier splash), not from the image burst.
- **The dashboard is the app that makes the M1 caveat visible.** With 146 images streaming in and no
  dirty-rects, the own-pixels kernel repaints the full 2000×1440 surface on every image completion, so
  it does **+38 ms more total main-thread work than DHTML** during the burst. On the light calendar
  this was invisible (canvas did *less* work); here it nearly cancels the burst-phase advantage. This
  is the expected signature of the un-optimized M1 kernel and is the **ceiling that dirty-rects + layer
  caching are meant to cut** — the burst redraws would collapse to just the newly-arrived image tiles.
- **Net for the second DoD app:** the own-pixels kernel still wins dashboard startup at Retina, and
  renders it pixel-identically, but the margin is carried by the build phase while the 146-image burst
  is a wash — a clear, quantified pointer at the next optimization.

## Standing caveats

- **This is STARTUP, not sustained animation.** The 146-image burst here is a one-time startup event;
  the full-scene-repaint cost it triggers is a *floor* — during scrolling/animation the M1
  repaint-everything cost recurs every frame and would dominate.
- **M1 full-scene-repaint baseline (no dirty-rects, no layer caching).** Every frame repaints the whole
  2000×1440 surface. The dashboard's 146-image burst turns that into 146 on-thread full repaints
  (ScriptDuration +72 ms) — the single biggest canvas-side cost measured, and the primary target for
  the optimized design.
- **Localhost + fast Apple-silicon desktop, headless, eager build.** Absolute ms are this-machine.
  Portable findings: the **direction** (canvas wins dashboard startup −6.3 % at Retina) and the
  **shape** (build-phase DOM elimination wins it; the 146-image burst is a wash where canvas trades
  off-thread DHTML paint for on-thread full-scene redraws).

---

## Files

- Frozen dpr-aware kernel: `benchmarks/apps/dashboard/LFCcanvas-bench.js`
  (md5 `da8b501e383ce4422225b8bf2673aeb6`, 376 250 B)
- Canvas bench wrapper: `benchmarks/apps/dashboard/dash-canvas-bench.html` (→ frozen kernel)
- Shareable URLs (confirmed rendering @2×): `dash-canvas.html` (→ live `LFCcanvas.js`),
  `dash-dhtml.html` (→ distro `lfc.js`)
- App JS (both kernels): `benchmarks/apps/dashboard/dashboard-bench.lzx.js` (440 169 B)
- Retina screenshots (2000×1440): `benchmarks/screenshots/dash-canvas-dpr2.png`,
  `benchmarks/screenshots/dash-dhtml-dpr2.png`
- Raw run JSON: `/tmp/tl-dash-{cv,dh}-d2-{1..5}.json` (timeline ×5),
  `/tmp/bp-dash-{cv,dh}-d2-{1..3}.json` (browserprof ×3)
- Served via `benchmarks/tools/serve-static.mjs ../apps 8242`
- Calendar dpr=2 result compared against: `benchmarks/RESULTS-canvas-vs-dhtml-dpr2.md`
- Methodology: `benchmarks/METHODOLOGY.md`
</content>
</invoke>
