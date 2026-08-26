# The raster policy — how a drawing reaches pixels on each renderer

A `draw()` body records a display list; a renderer turns that list into pixels.
This document is the policy for that step: what every renderer promises, the
vocabulary they share, what each does differently and why, the engine facts
those differences answer to, and the instruments that keep all of it measured.
It describes the platform as built. Lineage is at the end, in a paragraph.

## 1. The promise

Uniform across renderers, and the part an author can rely on:

- **No author manages rasters.** Not resolution, not caching, not when a raster
  is regenerated. The obvious way to write a drawing is the fast way.
- **Content is exact at rest.** A transformed, resized, or newly-shown drawing
  may be approximate — stretched, or coarsely blurred — for at most one
  **beat**: `RASTER_GRACE_MS` = 120 ms, the same beat the visibility facts flush
  on, so the platform has one notion of "quiet for a beat". After it, exact.
  This is a tolerance the platform *states*, not a condition it detects:
  "animation is over" is undetectable in this language (a spring, a pointer
  constraint and a stream are all just writers), so the runtime declares the
  tolerance instead of guessing at motion.
- **Memory is bounded and failure is honest.** A raster the platform refuses is
  a slow frame, never a wrong one; a raster the platform silently blanks is
  detected and recovered from.
- **Culling is invisible.** Skipping work that cannot reach the screen changes
  no pixel, ever — pinned by equality, not tolerance.

## 2. The shared vocabulary (`runtime/src/draw.ts`)

Everything here is pure over the recording, so every backend prices and
bounds the same thing:

| | what it is |
|---|---|
| `DisplayList` | `ops` (plain Canvas2D data), `bounds` (conservative union of painted extent, mapped through the recording's own CTM), `exact` (false once text, shadow or filter paints past what the recorder can bound), **`extents`** (per-op painted box, parallel to `ops`, null for anything that paints nothing) |
| text bounds | the recorder mirrors `font`/`textAlign`/`textBaseline`/`letterSpacing` and bounds a run through the shared measurer (`measure.ts`), padded for glyph overhang; with no measurer it falls back to the anchor |
| `rasterPad(list)` | the overscan a blur or shadow paints past the bounds — from the ops' own radii, clamped at 128 |
| `replayArea(list)` | covered area in recording units², **overdraw counted**, weighted per kind — `fill 1 · stroke 0.6 · shadow 4.3 · text 8.5 · gradient 30`, measured (§6); `Infinity` under a filter, which is superlinear in radius and not area-driven |
| `replay(ctx, list, clip?)` | the one interpreter every backend uses; with a clip, paint ops entirely outside it are skipped (never under `copy`, `source-in/out`, `destination-in/out/atop`, whose effect reaches past the source) |
| `rasterLooksBlank(...)` | samples a fresh raster at a few op centres; a large raster that painted nothing is the platform's silent failure |
| caps | `RASTER_MAX_DIM` 8192, `RASTER_MAX_AREA` 16.7 MP (Safari's per-canvas floor), `rasterEntryCap` 3 viewports, `rasterTotalCap` 32–96 MB — **policy in viewport units**, because the platform ceiling is unknowable from a tab (§5) |
| `canvas-filter.ts` | `ctx.filter` for engines that accept it and paint unfiltered (Safari): a calibrated three-pass box blur plus a colour matrix on a downsampled buffer, and an **approximate** resample-only path with no readback for a caller in motion |

## 3. Per renderer

The mechanism differs because the renderers do; the promise does not.

### 3.1 Canvas backend — a memo over replay

One shared `<canvas>`; every paint replays every visible recording under the
composed transform, so a drawing is exact at any scale by construction. The
memo makes the expensive ones cheap:

- **Admission**: `ops × 1 µs + weightedCoveredDevicePx × 50 µs/Mpx ≥ 1 ms`.
  The quantities are the recording's (§2); the constants are this backend's,
  measured under Chrome tracing at two mark sizes (§6). A full-viewport solid
  fill prices at ~0.1 ms and stays vectors; a full-viewport gradient wash at
  ~3 ms promotes.
- **Promotion by stability**: the same (list, scale) on two consecutive paints.
  A recording re-recorded every frame never qualifies and never pays.
- **Under a transform**: the raster's key includes the scale. A scale change
  blits the prior raster stretched for the beat and books the one exact frame
  after it (a settled scene stops compositing, so rest must schedule its own
  repaint).
- **Culling**: the vector path replays against the canvas mapped back through
  the live transform; ops outside it are skipped, byte-identically.
- **Eviction** by relevance, then value: an entry not painted last compositor
  generation is off-screen and worthless at any recency (largest first); among
  live entries, the lowest `rasterMs × hits / bytes`. A static scene does not
  advance the generation, so idling evicts nothing.
- **Discovered ceilings**: a null context, a throw, or a raster past 8 MB that
  samples blank halves the session budget — and never raises it.
- **Frost** (`backdrop`): samples what is beneath the view at paint time and
  redraws it through the filter. In motion — a paint within a beat of the last —
  the filter runs the approximate, readback-free path and books the exact frame
  at rest; that one readback per frosted view was the difference between p95
  48 ms and 26 ms scrolling weather on Safari (§6).

### 3.2 DOM backend — obligatory pixels

Each drawing is its own `<canvas>` element, and that canvas *is* the content.
There is no admission and nothing to evict; the policy is about density and
about not holding what cannot be seen.

- **Density**: the element's CSS box is the recording's bounds in view units
  and never changes; what changes is the device pixels behind it. The view
  arms its visibility feed on `bindDraw()` and, where the `apparentScale` fact
  lands at rest, hands the composed scale to `Surface.setRasterScale`; the
  backend re-rasterizes at that density. Stretched for the beat, exact at rest.
- **Hidden views** hold no backing store: hiding releases the canvas, the
  raster is owed, showing pays it — byte-identical across the round trip. (A
  fresh `<canvas>` is 300×150, 180 KB before anything draws; it is created 0×0.)
- **Ceilings**: the entry cap is honoured by clamping density back to dpr,
  never by refusing to draw. A large raster that samples blank is remade at
  half the density, down to a quarter of dpr, and counted. The ledger is
  `__declareDomRasterStats` (bytes, clamps, blanks).
- **Text-only drawings render.** They did not: `fillText` bounded to its anchor
  point, the canvas was sized to those bounds, and the glyphs were gone.

### 3.3 Mac host — describe first

`LayerDescribe` expresses a recording as CALayers — compound paths for fills
and strokes, gradient layers, and **shadows** on the shape layer — and the render
server rasterizes those under any transform, exact at every scale with nothing
to cache. What it cannot express (text, focal radials, filters) goes to a Core
Graphics raster, and that bitmap is made at the **composed density** the runtime
hands over at rest (`RASTERSCALE`), so it too is exact under a view scale.
Filters run through Core Image with the radius carried across unscaled; shadow
offsets are negated into CA's y-up space; conic gradients are swept without
antialiasing between tiling wedges. Per-op conformance against Chrome is 30 of
30 cells within budget (§7).

### 3.4 What each renderer does, side by side

| | holds a drawing as | under a transform | admission | release | ceiling |
|---|---|---|---|---|---|
| canvas | memo raster, discardable | stretch for the beat, exact at rest | measured formula | relevance → value | discovered, budget halves |
| DOM | per-view canvas, obligatory | re-raster at the at-rest composed density | none | hidden view releases | clamp density; blank → halve |
| mac | described layers; CG bitmap for the remainder | described: always exact; bitmap: composed density at rest | expressibility | n/a | n/a |

## 4. Per engine

The renderer decides mechanism; the engine decides what that mechanism costs.
Measured (§6), and the reason "uniform" was never the goal:

| | when it rasters | where the bill lands | its cliff | `ctx.filter` | failure past budget |
|---|---|---|---|---|---|
| Chrome / Blink | eagerly, GPU, raster threads | the renderer **main thread at commit** (`LayerTreeHost::DoUpdateLayers`), proportional to what we hand it | none found — 1 ms of paint under every shape run | yes | software fallback, slow but correct |
| Safari / WebKit | deferred to first pixel read, GPU (IOSurface) | the flush | extreme overdraw only; a per-frost readback stalls the pipeline | **no** — accepted and ignored | **transparent canvases** |
| Firefox / Gecko | eagerly, CPU | frame cadence | **gradient fills** (256 marks → p50 55 ms on DOM; the canvas memo hides it at 8) | yes | blanks a DOM canvas at ~130 MB |
| iOS WebKit (Simulator) | as Safari | as Safari | strokes and text at volume, indicative | no | 889 MB canvas paints nothing |
| Core Graphics / CA | at the call, CPU (bitmap) or render server (layers) | the draw call; per-op for described kinds | **shadows through CG** (~4.7 ms per mark) — now described | Core Image | memory growth |

Engine differences are handled by **capability detection where a capability is
the question** (`ctxFilterSupported` draws and looks for bleed, because
Safari's `"filter" in ctx` is false but the assignment reads back verbatim) and
by **the shared mechanisms where cost is the question** (the memo covers
Firefox's gradient cliff without knowing Firefox exists). The constants are
Chrome-calibrated and applied everywhere; that is stated in §8.

## 5. Decisions, with their evidence

Each of these is the policy, stated as what the platform does.

**A size-dependent recording re-records on resize.** A drawing that reads
`d.w`/`d.h` is re-recorded and re-rasterized each resize step, on every
renderer. Measured on the size probe: Safari flat at 60 Hz to six times the
desktop wallpaper's load, live against a fixed reference box alike, both
renderers; Chrome 1 ms of main-thread paint either way; Firefox no dropped
frames. So the platform does not hold a stale raster across a size change, and
the reference-box authoring pattern (draw once at a fixed size, paint-scale)
buys nothing measurable — the desktop's two instances of it are workarounds for
a cost that is not there.

**A drawing is rasterized at the size it is authored, and the caps are
viewport policy.** A recording larger than the viewport gets a raster the size
of its bounds on DOM, a refused memo on canvas, a bounds-sized bitmap on mac; a
document-tall backdrop is authored viewport-sized (the homepage does). The caps
are ours, in viewport units: a ceiling measured on one machine under one set of
applications is an anecdote, and a boot-time probe costs the memory it
measures. The platform is not asked its limit; it is allowed to say when one was
hit, and the session lives under it from then on.

**Frost is approximate in motion and exact at rest** (§3.1) — the same
tolerance as a stretched raster, applied to a blur.

**`ctx.filter` is provided where the engine lacks it**, and shipped only where a
program can reach it: the production build carries the fallback when a body sets
`d.filter` or the build targets the canvas renderer (frost needs it with no
`d.filter` anywhere), and stubs it otherwise — 1.8 KB gzip returned to programs
that never use it.

## 6. The measurements

**Cost constants**, Chrome tracing, two mark sizes, `tools/rasterfit.mjs`:

| kind | DOM: per op | DOM: per Mpx | canvas: per op | canvas: per Mpx | vs fill |
|---|---|---|---|---|---|
| fill | 1.6 µs | 0.10 ms | 0.3 µs | 0.05 ms | 1× |
| stroke | 1.6 | 0.06 | 0.8 | 0.03 | 0.6× |
| shadow | 3.0 | 0.43 | 0.7 | 0.22 | 4.3× |
| text | ~0 | 0.85 | ~0 | 0.42 | 8.5× |
| gradient | 6.1 | **3.01** | 2.6 | **1.53** | **30×** |

Op count alone had classified every one of those rows the same way; at identical
op counts, covered area separates them 205×.

**Mac host, per re-record** (`mac-host/kindsbench.mjs`, the host's own timer):
described kinds cost per op and not per pixel (fill 7 µs, gradient 19, stroke
9 — layer construction); rasterized text scales with area (79 ms at 1024 marks);
shadows through CG cost 4785 ms at 1024 marks and **13.9 ms once described**.

**Weather, scrolling, Safari canvas** (`rasterbench --app`): p95 48 ms with the
calibrated frost each frame, 29 with the approximate blur, 26 with frost off;
**26 with the frost grace** — the remaining 26 against DOM's 17 is the full
viewport repaint the canvas backend does per scroll frame (§8).

**Exact at rest**: a 1 px ring under scale 4 ramps over the same device pixels
on DOM as on canvas; the pin failed on the unchanged backend and passed with the
change. The desktop's visual states were unmoved by it (39/39).

## 7. The instruments

Nothing above is believed without one of these, and each says what it cannot see.

| instrument | measures | cannot see |
|---|---|---|
| `test/probe/drawops.declare` + `mac-host/drawconform.mjs` | per-op conformance, cell by cell, chrome-canvas as reference; the web pair is 0% on all 30 cells so a Mac divergence is the renderer | text shape (budgeted separately — Core Text ≠ Skia) |
| `tools/rasterbench.mjs` | probes or a real app (`--app`) across `chrome` (headed; `--trace` for the paint breakdown), `safari`, `webkit` (off-screen), `firefox`, `ios`; cadence, allocation, `ink`, `drive`, `filter`; `--pre` sets a lever on any engine | raster cost on any engine but Chrome |
| `tools/rasterfit.mjs` | the constants, from traced rows | — |
| `mac-host/kindsbench.mjs` | the host's raster timer per kind, through `ctl eval` | the render server's cost for described kinds |
| `mac-host/webkitprobe.swift` | WebKit with no window — allocation, ink, capability | cadence, presentation, the canvas backend, Safari's feature flags; **its canvas is software-backed** |
| `mac-host/textbounds-check.mjs`, `scaled-check.mjs` | one native fact each | — |

Levers, for an A/B rather than an argument: `__declareNoRasterMemo`,
`__declareNoCull`, `__declareForceFilterFallback`, `__declareFilterGpuOnly`,
`__declareNoFrost`, `__declareForceBlank`, `DECLARE_NO_LAYERS`.

Traps the instruments were built to dodge, each learned by measuring something
false first: a drive that touches what it measures (a `tick` the recording
reads); a readback inside a trace window; headless Chrome rasterizing on
SwiftShader; a 1×1 readback that forces a flush only on a software canvas; a
WKWebView number labelled "Safari"; point-sampling a lattice; opaque marks that
both engines cull; Chrome under contention timing out a byte-identical capture.

## 8. Open

- The canvas backend repaints the whole viewport per scroll frame (Safari p95
  26 against DOM's 17). Stacked canvases, letting the compositor blend strata,
  is the lever, reached for only if that ever misses budget.
- The constants are Chrome-calibrated; Safari and Firefox have no raster meter
  from inside a page. Firefox's gradient cost is above the shared weight and is
  covered by the memo rather than by a number.
- Mac: culling in `DrawReplay`; memory awareness (`os_proc_available_memory`).
- The desktop's reference-box workarounds (wallpaper, dock `face`) — §5 says why
  they can go; the file is the desktop owner's.
- `prod-parity`'s settings-panel capture is load-sensitive (a fixed settle
  against a spring); run it alone.

## Lineage

A 2026-07-20 proposal framed this as JIT-style tiering — promote a hot draw to a
high-water raster and scale it. Measured on 2026-08-16, that could not work:
downscaling a raster resamples an image already antialiased against the wrong
grid, and a hot drawing is hot because it re-records every frame, which no
size-keyed cache can hit. What survived was the analysis — the dependency
graph's partition of a draw's reads into size and content — and the rule that
followed from it: exact at rest, approximate only in transit, declared rather
than detected. The canvas memo landed on 2026-08-21 under that rule; Mac
conformance, the Safari filter fallback, the cost model, culling, the DOM's
density and hidden-view policy, and described shadows followed on 2026-08-24
through 26, each on a measurement recorded in the commits.
