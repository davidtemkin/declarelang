# Calendar: canvas kernel vs DHTML — the HiDPI (dpr=2 / Retina) re-benchmark

**Question.** At **dpr=1** the own-pixels canvas kernel reached ready-for-input **−26 ms / −18 %**
vs DHTML (DOM style/layout/paint eliminated; render cost moved to an OFF-main-thread GPU
composite — see `RESULTS-canvas-vs-dhtml.md`). At **dpr=2** the canvas backing store is **4× the
pixels** to fill + composite, and DHTML also rasterizes its DOM at 2×. So: does the startup win
**hold, shrink, or reverse** at Retina? This measures the high-res cost on **both** kernels and the
net delta.

**Measurement only** — no kernel/app/runtime was modified. Only the two dev harnesses gained a
`CAP_DPR` env knob (see Method). The canvas kernel is a **frozen dpr-aware snapshot** so this result
is isolated from the running kernel work.

---

## Method (reproducible, deltas from the dpr=1 baseline)

- **Same harness as the baseline:** `timeline.mjs` (PRIMARY, ×5 each config) + `browserprof.mjs`
  (CDP trace + `page.metrics`, ×3 each), on **both** `cal-canvas-bench-dpr` + `cal-dhtml`.
- **The four cells:** {canvas, dhtml} × {dpr=1, dpr=2}. The **same frozen code** is run at both
  dpr values, so the dpr=1↔dpr=2 movement isolates the device-pixel-ratio effect on identical code
  (it is *not* the pre-HiDPI baseline vs a new kernel — that would conflate a code change with the
  dpr change).
- **Frozen canvas kernel:** the current **dpr-aware** `LFCcanvas.js` (renders at device resolution:
  backing store scaled by `devicePixelRatio`) was snapshotted to
  `apps/calendar/LFCcanvas-bench-dpr.js` (**md5 `da8b501e383ce4422225b8bf2673aeb6`**, 376 250 B) and
  benchmarked via a dedicated wrapper `cal-canvas-bench-dpr.html`. The old dpr=1-baseline snapshot
  (`LFCcanvas-bench.js`, md5 `3231835e…`) is **pre-HiDPI** (0 `devicePixelRatio` refs) — not used
  here. The DHTML side (`cal-dhtml.html` → distro `lfc.js`) is pristine.
- **dpr knob (the only tool change — noted as required):** the HiDPI work had already added
  `CAP_DPR=N` to `capture.mjs`/`interact.mjs` (→ `--force-device-scale-factor=N` +
  `deviceScaleFactor:N`). This run **extended `timeline.mjs` + `browserprof.mjs` the same way**
  (both previously hardcoded dpr=1); default stays `1`, so the baseline path is byte-unchanged.
- **Chrome:** pinned Chrome-for-Testing `mac_arm-146.0.7680.31`, headless, 1000×700 viewport,
  `--no-sandbox`, fresh `userDataDir` per run. Served by a dedicated `serve-static.mjs` on **:8221**
  (precompiled `.lzx.js` + distro runtime; no compiler in the loop). Medians + [min..max] reported.
- **Contention note:** another agent was running Chrome in parallel; the launch-retry loop absorbed
  it, but **one** canvas-dpr2 timeline run spiked to a 669 ms ready-for-input tail (a stray heavy
  task, ~5× every other run). It was identified as a contention outlier and **replaced with a clean
  re-run** (the replacement matched the cluster: 120.9 ms). All other cells were noise-free.
- **Visual parity at Retina confirmed:** both kernels render the full June-2026 month grid
  **pixel-identical at 1670×1200 (835×600 @2×)** and settle in 2 frames
  (`screenshots/cal-canvas-bench-dpr2.png` vs `screenshots/cal-dhtml-dpr2.png`). The canvas build
  draws text as device-resolution pixels (no DOM text nodes) — sharp at 2×, the whole point of the
  own-pixels design.

---

## 1. PRIMARY — ready-for-input (`timeline.mjs`, median of 5, [min..max] ms)

| kernel | **dpr=1** | **dpr=2** | dpr=2 − dpr=1 (HiDPI cost) |
|---|--:|--:|--:|
| **CANVAS** | **119.1** [118.2..121.8] | **126.8** [120.4..139.0] | **+7.7  (+6.5 %)** |
| **DHTML** | **145.9** [144.3..147.6] | **146.5** [145.6..149.0] | **+0.6  (+0.4 %)** |

**canvas − dhtml delta (the headline win):**

| | ready-for-input Δ (cv − dh) | Δ% |
|---|--:|--:|
| **dpr=1** | **−26.8** | **−18.4 %** |
| **dpr=2** | **−19.7** | **−13.4 %** |
| *change at Retina* | *gap narrows by 7.1 ms* | *−18 % → −13 %* |

**Read: the win HOLDS but SHRINKS.** At Retina the canvas kernel is still ready-for-input **~20 ms /
−13 % ahead** of DHTML — it does **not** reverse. The narrowing is entirely because the **canvas**
side pays a small HiDPI tax (+7.7 ms) while **DHTML pays essentially nothing on the main thread**
(+0.6 ms). Both kernels' 4× rasterization runs **off** the main thread (compositor/raster threads,
uncounted) — which is why DHTML is dpr-flat and why the canvas cost is only single-digit ms rather
than 4×.

Every earlier milestone tracks the same shape (canvas ahead throughout, both dpr-values close):

| milestone (median ms) | cv dpr1 | cv dpr2 | dh dpr1 | dh dpr2 |
|---|--:|--:|--:|--:|
| first paint (splash) | 36 | 36 | 32 | 32 |
| app-oninit | 92.3 | 93.8 | 99.8 | 99.6 |
| data-loaded | 108.5 | 110.9 | 120.1 | 122.0 |
| canvas-init | 110.3 | 113.2 | 123.9 | 124.4 |
| **ready for input** | **119.1** | **126.8** | **145.9** | **146.5** |

First paint is dpr-invariant on both (~32–36 ms): the splash is a handful of pixels.

---

## 2. Where the HiDPI cost lands — category split (`timeline.mjs`, main-thread, median ms)

| column | cv dpr1 | cv dpr2 | dh dpr1 | dh dpr2 |
|---|--:|--:|--:|--:|
| **JS (Laszlo/app)** | 85.8 | **95.4** | 97.6 | 98.6 |
| style | 0.2 | 0.2 | 2.8 | 2.8 |
| layout | 0.1 | 0.1 | 6.8 | 6.9 |
| **paint** | 0.1 | **0.1** | 2.6 | 2.7 |
| **composite (main-thread)** | 0.1 | **0.1** | 1.2 | 1.2 |
| idle/wait | 32.7 | 35.0 | 35.6 | 35.7 |

**The 4× does NOT show up in the canvas main-thread paint/composite columns** — they stay pinned at
**~0.1 ms** at both dpr values. The DOM-pipeline collapse (style/layout/paint → ~0) is unchanged by
Retina. On this main-thread-only view, the canvas HiDPI cost surfaces in the **JS column (+9.6 ms)**:
`timeline.mjs`'s narrower trace category set (no `cc`/`gpu`) does not *name* the extra
paint-record/commit work for the bigger surface, so that on-thread time is charged to JS
(busy − classified-render). It is a modest on-thread margin, not a 4× blow-up — because the actual
fill+composite of the device-resolution surface is off-thread.

---

## 3. The off-thread confirmation — `browserprof.mjs` (CDP trace incl. `cc`/`gpu`, median of 3)

| metric (median ms unless noted) | cv dpr1 | cv dpr2 | dh dpr1 | dh dpr2 |
|---|--:|--:|--:|--:|
| first-paint | 36 | 32 | 32 | 32 |
| trace style | 0.3 | 0.3 | 3.1 | 3.2 |
| trace layout | 0.1 | 0.1 | 7.2 | 7.3 |
| trace paint | 0.1 | 0.1 | 2.4 | 2.2 |
| **trace composite (incl. cc/gpu)** | **8.4** | **8.8** | 3.7 | 3.6 |
| `ScriptDuration` | 74.6 | 74.3 | 70.2 | 70.7 |
| **`TaskDuration` (total main-thread)** | **104.6** | **104.1** | 109.8 | 112.2 |
| Layout count | 2 | 2 | 23 | 23 |
| RecalcStyle count | 5 | 5 | 25 | 25 |

**This is the decisive evidence that the 4× is off the main thread.** For **both** kernels,
`ScriptDuration` and total-main-thread `TaskDuration` are **essentially flat across dpr** (canvas
104.6 → 104.1; dhtml 109.8 → 112.2). Nobody's main-thread budget grows ~4×. The canvas kernel's
distinctive cost — the GPU/cc composite of the whole surface — rises only **+0.4 ms** (8.4 → 8.8) at
2×, and its **canvas−dhtml composite margin widens just slightly**: **+4.7 ms at dpr=1 → +5.2 ms at
dpr=2**. That is the entire visible footprint of quadrupling the pixel count: a fraction of a
millisecond of extra *main-thread* commit, plus off-thread raster that neither tool counts because
it doesn't block.

> `browserprof` (flat `TaskDuration`) and `timeline` (+9.6 ms "JS") disagree by a few ms on the
> canvas HiDPI tax. `TaskDuration` is the cleaner "did total main-thread work grow" signal and says
> **~0**; `timeline`'s JS bump is partly unclassified paint-record time and partly the residual
> run-to-run contention that also widened the canvas-dpr2 spread. Read the honest canvas HiDPI
> main-thread cost as **~0–8 ms** — small either way, and non-reversing.

---

## Honest interpretation

**Does the startup win hold at Retina? Yes — it holds and shrinks, it does not reverse.**
- **canvas ready-for-input:** −18 % (dpr=1) → **−13 % (dpr=2)**, still a clear ~20 ms lead.
- **What Retina costs the canvas side:** a small on-thread margin (**~0–8 ms**, tool-dependent) for
  recording/committing a 4×-larger backing store, plus **off-thread** GPU raster+composite that
  doesn't block (browserprof composite +0.4 ms; main-thread paint/composite unchanged at ~0.1 ms).
  The 4× pixel count is **not** a 4× *time* cost anywhere on the path to interactive — the browser's
  raster/compositor threads absorb it in parallel with the main thread.
- **What Retina costs DHTML:** ~nothing on the main thread (+0.6 ms ready-for-input) — its 2× DOM
  raster is likewise off-thread. So the gap narrows purely because DHTML has *no* on-thread HiDPI
  cost while canvas has a *small* one; the DOM-pipeline elimination (style/layout/paint → ~0, layout
  passes 23→2) that drives the win is completely dpr-invariant.

**Net:** high-resolution rendering is **cheap on the path to first-interactive for both kernels**,
because rasterization is off the main thread. Retina trims the canvas kernel's startup advantage
from ~27 ms to ~20 ms but leaves it firmly ahead.

## Standing caveats (unchanged from the dpr=1 baseline)

- **This is STARTUP, not sustained animation.** Startup is a small number of frames, so the
  full-scene-repaint cost lands mostly off-thread (composite) and doesn't block. That does **not**
  characterize scrolling/animation.
- **M1 full-scene-repaint baseline.** This canvas kernel still has **no dirty rectangles and no
  layer caching** — every frame repaints the whole 835×600 (now 1670×1200) surface. At dpr=2 that
  off-thread composite tail is ~4× the pixels; it is invisible at startup but is the **upper bound**
  the optimized design (dirty-rects + layer caching) is expected to cut, and it **scales with frame
  count** during sustained interaction. Frame these as the *floor* of canvas's advantage.
- **Localhost + fast Apple-silicon desktop, headless, eager/immediate build.** Absolute ms are
  this-machine; the portable findings are the **direction** (win holds, shrinks ~7 ms at Retina) and
  the **shape** (4× pixels → off-thread, main-thread budget dpr-flat on both kernels).

---

## Files

- Frozen dpr-aware kernel: `benchmarks/apps/calendar/LFCcanvas-bench-dpr.js` (md5 `da8b501e383ce4422225b8bf2673aeb6`, 376 250 B)
- Canvas wrapper: `benchmarks/apps/calendar/cal-canvas-bench-dpr.html`
- DHTML wrapper (pristine): `benchmarks/apps/calendar/cal-dhtml.html`
- Retina screenshots (1670×1200): `benchmarks/screenshots/cal-canvas-bench-dpr2.png`, `benchmarks/screenshots/cal-dhtml-dpr2.png`
- Tool change (CAP_DPR added): `benchmarks/tools/timeline.mjs`, `benchmarks/tools/browserprof.mjs` (default dpr=1 unchanged; matches `capture.mjs`/`interact.mjs`)
- Raw run JSON: `/tmp/tl-{cvd1,cvd2,dhd1,dhd2}-*.json` (×5, cvd2 outlier run 5 dropped, run 6 used), `/tmp/bp-{cvd1,cvd2,dhd1,dhd2}-{1..3}.json`; aggregate `/tmp/agg-out.json`
- dpr=1 baseline this extends: `benchmarks/RESULTS-canvas-vs-dhtml.md`
