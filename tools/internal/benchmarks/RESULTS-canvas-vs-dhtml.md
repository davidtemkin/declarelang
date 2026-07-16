# Calendar: canvas kernel vs DHTML kernel — baseline perf comparison

**Same app (`cal-bench-eager.lzx.js`, eager/immediate, inline-data), two runtimes:**
- **CANVAS (Declare):** own-pixels kernel `LFCcanvas-bench.js` (a frozen snapshot of `LFCcanvas.js`).
- **DHTML (oracle):** the original kernel `runtime/lfc/lfc.js` (per-view DOM-shadow tree).

Measurement only — no kernel/app/runtime was modified. This is the "all the existing metrics
first" baseline.

---

## Method (reproducible)

- **Serve:** `node serve-static.mjs ../apps 8211` — my own dumb static instance on **port 8211**
  (the pre-existing :8200 instance was left alone). Precompiled `.lzx.js` + the distro runtime;
  no compiler in the loop.
- **Isolation from the parallel HiDPI kernel edits:** copied the live `LFCcanvas.js`
  → `LFCcanvas-bench.js` (md5 `3231835e…`, frozen) and benchmarked a wrapper
  (`cal-canvas-bench.html`) pointed at the snapshot. The DHTML side (`cal-dhtml.html`) is pristine.
- **Chrome:** pinned Chrome-for-Testing `mac_arm-146.0.7680.31`, headless, 1000×700, **dpr=1**
  (harness default), `--no-sandbox`, fresh `userDataDir` per run.
- **Tools:** `timeline.mjs` (PRIMARY, ×5 each) · `browserprof.mjs` (CDP trace + `page.metrics`, ×3 each)
  · `shot.mjs` (visual parity). Both kernels reach `canvas.isinited`; the trace is clock-aligned via
  the app's `OL:` user-timing marks. Medians + [min..max] reported.
- **Visual parity confirmed:** both render the full June-2026 month grid pixel-for-pixel
  (`screenshots/cal-canvas-bench.png` vs `screenshots/cal-dhtml-bench.png`). The canvas build draws
  text as pixels (no DOM text nodes) — this is why `shot.mjs` extracts `text:""` for it, and is the
  whole point of the own-pixels design, not a render failure.

---

## 1. PRIMARY — wall-clock startup timeline (`timeline.mjs`, median of 5, [min..max])

The headline question: nav → ready-for-input, and where the time goes.

| metric | CANVAS | DHTML | Δ (cv − dh) | Δ% |
|---|--:|--:|--:|--:|
| first paint (splash) | 32 [28..36] | 36 [32..40] | −4 | −11% |
| app-oninit (static tree built) | 91.9 [89.9..93.3] | 99.3 [95.8..101.4] | −7.4 | −7% |
| data-loaded | 108.3 [106.5..109.2] | 120.8 [115.3..124.2] | −12.5 | −10% |
| canvas-init (logical tree final) | 110.3 [107.9..111.2] | 123.8 [118.6..126.6] | −13.5 | −11% |
| **ready for input** ★ | **118.5 [116..119.3]** | **144.7 [138.1..147.3]** | **−26.2** | **−18%** |

**Category split (summed over the whole startup, median-of-5 ms, main-thread):**

| column | CANVAS | DHTML | Δ (cv − dh) | Δ% |
|---|--:|--:|--:|--:|
| JS (Laszlo/app) | 83.0 | 95.5 | −12.5 | −13% |
| style | 0.2 | 2.6 | −2.4 | −92% |
| layout | 0.1 | 6.6 | −6.5 | −98% |
| paint | 0.1 | 2.6 | −2.5 | −96% |
| composite (main-thread) | 0.1 | 1.2 | −1.1 | −92% |
| idle/wait | 34.8 | 37.1 | −2.3 | −6% |

**Read:** the canvas kernel reaches **ready-for-input ~26 ms sooner (−18%)** and is lower on every
milestone. The DOM-pipeline columns (style/layout/paint) **collapse to near-zero** because there is
no per-view DOM tree to style, reflow, or DOM-paint — exactly the structural prediction. JS is also
~12 ms lower, because the canvas kernel skips the per-view DOM-shadow creation that the DHTML
`sprite-dom` layer does in JS.

> **`fully rendered` is unreliable for the canvas build and is deliberately not used as the headline.**
> `timeline.mjs` derives "fully rendered" from the *last DOM Paint event*. The own-pixels kernel emits
> almost no DOM Paint events (it draws into one `<canvas>`), so that milestone collapses onto the splash
> paint (~40 ms) — an artifact, not a real "done at 40 ms." **`ready-for-input`** (end of the last heavy
> main-thread task) is the robust, apples-to-apples milestone, and is what the table leads with.

---

## 2. Browser pipeline + `page.metrics` (`browserprof.mjs`, median of 3)

| metric (median ms unless noted) | CANVAS | DHTML | Δ (cv − dh) |
|---|--:|--:|--:|
| first-paint | 36 | 36 | 0.0 |
| trace style | 0.3 | 3.0 | −2.7 |
| trace layout | 0.1 | 7.2 | −7.1 |
| trace paint | 0.1 | 2.4 | −2.3 |
| trace composite (incl. cc/gpu) | **8.7** | 3.9 | **+4.8** |
| `ScriptDuration` | 74.5 | 72.2 | +2.3 |
| `RecalcStyleDuration` | 0.3 | 3.0 | −2.7 |
| `LayoutDuration` | 0.1 | 7.3 | −7.2 |
| `TaskDuration` (total main-thread) | 102.9 | 111.4 | −8.5 |
| Layout count | **2** | 23 | −21 |
| RecalcStyle count | 5 | 25 | −20 |

**Per-phase, where the pipeline cost lands (representative run):**

```
CANVAS   start→first-paint        style 0.3 layout 0.1 paint 0.1 composite 1.3
         …every later phase…      style ~0  layout ~0  paint ~0  composite rising
         events-hydrated→(end)    style 0.0 layout 0.0 paint 0.0 composite 5.2   ← intro-anim frames

DHTML    first-paint→app-oninit   style 1.2 layout 5.1 paint 0.0 composite 0.9   ← DOM-tree reflow
         canvas-init→data-loaded  style 0.3 layout 0.5 paint 2.5 composite 0.0   ← DOM paint
         events-hydrated→(end)    style 0.2 layout 0.3 paint 1.1 composite 1.3
```

**Read:** the two kernels spend the browser's time in completely different places.
- **DHTML** pays **layout** (5.1 ms reflow while the per-view DOM tree is built; 23 layout passes /
  25 style recalcs) and **DOM paint** (2.5 ms). This is the classic build-the-DOM-then-the-browser-
  reflows-it cost.
- **CANVAS** pays essentially **no style/layout/paint** (2 layout passes — just the single canvas
  element; 5 style recalcs). Its rendering cost reappears as (a) JS draw calls — `ScriptDuration` is
  *slightly higher*, +2.3 ms, the `ctx` drawing folded into JS — and (b) **composite, +4.8 ms**, the
  GPU commit of the full canvas surface. Crucially that composite is largely **off the main thread**
  (it shows up in `browserprof`'s broader cc/gpu trace categories but **not** in `timeline.mjs`'s
  main-thread-only composite column, which stays ~0.1 ms) — so it does **not** block interactivity,
  which is why main-thread `TaskDuration` is still −8.5 ms and ready-for-input is −26 ms.

---

## 3. `lzprof.mjs` / `categories.mjs` (LZX-runtime category × phase) — DHTML-only, not a comparison metric

`lzprof.mjs` measures the `?profile` **instrumented** build (`lfc-profile.js` + a function-metered
app), reconstructing self-time/calls per category (instantiate / constraint / sprite-dom / …) per
phase. **It is inherently one-sided here:** that instrumented build is produced only by the original
oracle compiler/runtime. The Declare canvas kernel (`LFCcanvas.js`) has **no `?profile` variant**, and the
precompiled static `.lzx.js` both builds share carries no `window.Profiler` buffers — so `lzprof`
yields a breakdown for the **DHTML** kernel only and **cannot** produce a canvas counterpart. It is
therefore reported as context, not as a canvas-vs-dhtml delta.

For the DHTML kernel the LZX-runtime breakdown to `canvas.init` is (from `RESULTS-calendar.md` /
METHODOLOGY baseline): **view instantiation 40.8% · constraint resolution 25.7% · sprite-dom (JS DOM
shadow) 13.1% · attr-set 6.6% · font/color/data/layout/other 13.8%**, ~64.8k calls. The
**sprite-dom 13.1%** slice is precisely the per-view DOM-shadow work the canvas kernel removes — and
it is the largest single chunk of the −12.5 ms JS / −13% Script delta observed above.

---

## Honest interpretation + caveats

**What the deltas mean.** On this harness (localhost, fast Apple-silicon desktop, dpr=1, eager build),
the own-pixels canvas kernel is **measurably faster to interactive for Calendar startup: −26 ms /
−18% ready-for-input**, with a **near-total elimination of DOM style+layout (layout −98%, 23→2
passes)** and a **−13% main-thread JS** reduction (no per-view DOM-shadow creation). DHTML's cost is
DOM-tree reflow + DOM paint; canvas trades those for JS draw calls (≈ Script-neutral, +2.3 ms) and an
**off-main-thread** GPU composite of the full surface (+4.8 ms, non-blocking).

**Do not over-claim — the M1 pessimistic-baseline caveat.** This canvas kernel is the **M1 baseline**:
**a single main canvas, full-scene repaint every frame, NO dirty rectangles and NO layer caching.**
The startup numbers here look favorable *because startup is a small number of frames* and the
repaint cost lands off-thread (composite) rather than on the main thread. That same full-scene-repaint
is visible as the **composite tail (5.2 ms in the events-hydrated→end phase = the intro-animation
frames committing the whole 835×600 surface)**, and it **scales with frame count** — sustained
animation, scrolling, or interaction will redraw the entire scene each frame, so the paint/composite
side is an **upper bound** that dirty-rects + layer caching are expected to cut substantially. Frame
these canvas numbers as the **lower bound of the optimized design's headroom**, not a finished verdict;
the honest single-frame-startup win shown here is the *floor* of canvas's advantage, while the
sustained-render cost is the part the M1 baseline has not yet optimized.

**Conditions.** dpr=1 (the canvas kernel's per-frame cost rises with device pixel ratio — a HiDPI
agent is tuning exactly that in parallel, which is why this snapshot is frozen); eager/immediate build
(deferred work pulled inside the measurement window); localhost (≈ zero network); single fast desktop.
Spreads are tight (ready-for-input min..max: canvas 116–119, DHTML 138–147), so the −26 ms gap is well
outside run-to-run noise. Treat absolute ms as this-machine; treat the **direction and the per-category
shape** (DOM-pipeline → ~0, cost moves to JS-draw + off-thread composite) as the portable finding.

---

## Files

- Snapshot kernel: `benchmarks/apps/calendar/LFCcanvas-bench.js` (frozen md5 `3231835e615eca0e83495e05b92af42e`)
- Canvas wrapper: `benchmarks/apps/calendar/cal-canvas-bench.html`
- DHTML wrapper (pristine): `benchmarks/apps/calendar/cal-dhtml.html`
- Screenshots: `screenshots/cal-canvas-bench.png`, `screenshots/cal-dhtml-bench.png`
- Raw run JSON: `/tmp/tl-canvas-{1..5}.json`, `/tmp/tl-dhtml-{1..5}.json`, `/tmp/bp-{canvas,dhtml}-{1..3}.json`
