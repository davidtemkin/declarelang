# Adaptive draw caching — hot `draw()` views without manual bitmaps

> **Status: SUPERSEDED TWICE, 2026-08-24. Read this block first — the one below
> it is history, and on its own it misleads.** The 08-16 rejection says "the
> caching mechanism does not survive". A cache DID ship, four days later, and a
> reader who stops at that line concludes caching was refused.

## A. What shipped after the rejection (c979645f, 2026-08-20)

The **raster memo**, canvas half — `canvas-backend.ts`, policy shared in
`draw.ts`. It is not the mechanism rejected below, and the difference is the
whole point:

- **Exact-scale only.** An entry is keyed on (display list identity, effective
  device scale). No high-water mark, no downsampling, so no double-filtered
  edges. The rejection's fidelity objection does not apply.
- **Promotion by STABILITY, not by hotness.** The same key must appear on two
  consecutive paints. A continuously-scaled drawing never satisfies that and so
  never pays — which is exactly the case the rejection showed a cache cannot
  help.
- **Cheap lists stay vectors forever** (`replayCost`), so the memo only ever
  covers recordings that were expensive to replay.
- **Every allocation is deniable**: caps denominated in viewports
  (`rasterEntryCap`, `rasterTotalCap`), LRU eviction, and a refused raster
  degrades to vector replay. A miss is slow, never wrong.

And **the stretch grace** (`RASTER_GRACE_MS = 120`, DT's rule): a drawn view
whose scale just changed may render as its stretched prior raster for up to a
beat; once the scale has been quiet for that beat, the next frame is exact. It
is a **declared tolerance, not an inferred state** — "animation is over" is
undetectable in this language, since a spring, a pointer constraint and a stream
are all just writers, so the platform states the tolerance instead of guessing
at motion. The constant matches the visibility facts' at-rest flush, so there is
one platform notion of "quiet for a beat".

⚠ The grace covers **scale** change of an unchanged list only. It is gated on
list identity, so a recording that re-records — anything reading `d.w`/`d.h` —
gets neither memo nor grace. That is the wallpaper's case and it remains open;
see §E.

## B. The instruments (2026-08-23/24) — and what each cannot see

Built this cycle, because the corpus cannot answer these questions: its drawings
carry workarounds, so every measurement on them moves four variables at once.

- `test/probe/raster-{coverage,size,extent}.declare` — each states the naive
  shape an author would write first and carries the workaround as a **knob**, so
  the A/B is inside the probe.
- `tools/rasterbench.mjs` — the driver. Headed Chrome by default, `--trace`,
  `--brief`, `--yield-focus`, `--engines chrome|safari|webkit`.
- `mac-host/webkitprobe.swift` — WebKit with no browser on screen (an accessory
  app; never activates, never takes focus or the pointer).

**What is trustworthy, and what is not.** This cost four wrong answers in two
days; the record is the useful part:

| instrument | measures honestly | CANNOT see |
|---|---|---|
| Chrome `--trace` (headed) | raster/paint cost, calibrated | anything on other engines |
| off-screen WKWebView | allocation, ink, capability | cadence, presentation, canvas backend, Safari's feature flags |
| real Safari | cadence, presentation, feature flags | (needs the screen; ask first) |
| mac host stats | raster ms and px per node | — |

1. **`flushMs` is not a raster meter.** The 1x1-readback trick (Mesa) forces a
   flush on a SOFTWARE canvas. On a GPU-backed one it forces nothing: real
   Safari reads 0-5ms flat across an 89x range of painted pixels, and 0ms on a
   395MB canvas. Worse, it fails its own calibration even where it scales —
   4096x the work read as 52x the time on marks that cannot legally be culled.
   Withdrawn as a cost measure entirely.
2. **Headless Chrome rasterizes on SwiftShader.** A software number wearing
   Blink's name. `rasterbench` is headed by default and says so when it is not.
3. **A bare WKWebView gets a software canvas backing**; Safari.app does not. Do
   not put Safari's name on a WKWebView number.
4. **Point-sampling a regular scene ALIASES.** A 64-mark lattice on a 122px
   pitch fell entirely between four evenly spaced probes and reported a working
   sweep as inert. Both the `ink` and `drive` checks now hash blocks at offsets
   sharing no factor with the scene.
5. **Opaque marks are culled by both engines**, so an overdraw probe built from
   them measures nothing. Marks must be composited (translucent) to be real.

The rig therefore carries its own falsifiers: `drive` (did the sweep change any
pixels?), `ink` (did anything paint at all?), and an `ops = 1` calibration point
on every coverage sweep. **`ink` exists because Safari's documented failure past
its canvas budget is to draw TRANSPARENT canvases — fast, and blank, and
indistinguishable from cheap by every timing column.**

## C. What they measured

**Where a DOM canvas actually costs — not where anyone would guess.** Chrome
tracing, headed, real GPU: the cost is `LayerTreeHost::DoUpdateLayers`, the
renderer's MAIN THREAD updating layers at commit, with the GPU process a distant
second. `RasterTask` — cc's tile rasterization — reads **0-1ms no matter how
much is painted**. Main-thread work at commit blocks everything, and it was
invisible to every metric this rig had before tracing.

**`replayCost` prices the wrong quantity.** `paintMs` over 6 steps, DOM
renderer, at IDENTICAL op counts per row:

| ops | tile (span 0.05) | cover (span 1.00) | ratio |
|---|---|---|---|
| 1 | 1 | 9 | 9x |
| 64 | 7 | 124 | 18x |
| 256 | 7 | 402 | 57x |
| 1024 | 14 | 1475 | 105x |
| 4096 | **30** | **6152** | **205x** |

The meter passes calibration where `flushMs` failed it: 256→4096 ops is 16x the
work and 15.3x the time; 64→4096 is 64x and 49.6x — linear once past fixed
overhead, reproducible run to run. `replayCost` classifies every row here
"expensive" (all past its 48-op threshold) and cannot tell 30ms from 6152ms.
**Covered area predicts; op count does not.** Cadence corroborates: p95 169.7ms
(DOM) / 50.4ms (canvas) on the top row against 8.4ms flat elsewhere.

Our canvas backend runs the same shape cheaper but not differently — 3654ms
against DOM's 6152 at the top, same linearity, same event. One shared canvas
versus a per-view element, not a different cost model.

**Extent.** A document-tall backdrop at 48 viewports allocates **395.5MB in one
1800x57602 canvas**, takes headed Chrome's p95 to 58.4ms — and reads **ink 0%**:
it allocates, costs time, and paints nothing. Pinned to the viewport it is
8.7MB and flat at every extent. The canvas backend is flat at 8.2MB in both,
having refused the raster and replayed vectors. Three positions, one authored
shape. (This is homepage.declare's workaround, isolated — it measured ~385MB
before pinning.)

**⚠ Safari IGNORES `ctx.filter` — FOUND, AND FIXED (2026-08-24).** Confirmed on
real Safari, not just the harness: `"filter" in ctx` is false, the assignment is
accepted as a plain expando and reads back verbatim, and a blurred rect does not
bleed past its own edge. It is not a feature that throws or reports absence; it
is one that lies.

A capability sweep over the whole recorded surface says that is the ONLY gap —
`filter` (blur and saturate) plus a bare `fontKerning` property. shadowBlur,
letterSpacing, wordSpacing, direction, roundRect, ellipse, conicGradient,
setLineDash and all thirteen blend modes already agree across engines.

**Two things depended on it, and they needed different mechanisms.** FROST
(`canvas-backend` paintFrost) filters a finished snapshot of what is underneath,
so one post-hoc pass covers it; weather's entire glass treatment was flat on that
engine, for as long as the canvas backend has had frost. An author's `d.filter`
applies to everything drawn AFTER it, with no snapshot to work from, so `replay`
interprets it instead. Both live in `runtime/src/canvas-filter.ts`: a PYRAMID
blur (repeated halving down, then up — the GPU's bilinear sampler does the
averaging, each halving roughly doubles the radius, O(pixels) rather than a
gaussian's O(radius²)), with the colour matrix run on the SMALLEST buffer in the
pyramid, a sixteenth of the pixels at two halvings.

⚠ Canvas2D filters PER DRAWING OPERATION, not per group — measured on Chrome,
the conformance reference: two adjacent rects under one blur show a seam at alpha
191 where their union is a solid 255. The Mac host **already does this** and its
source says so; an earlier reading of one comment here claimed otherwise and was
wrong. Measured on the `filterTwoMarks` cell: the seam dips 55.7 on Chrome and
56.0 on Mac.

Measured after the fix, against the frost and blur probes: WebKit's output
matches Chrome's NATIVE filter at meanΔ 1.91 and 2.80 of 255 — about as closely
as Chrome's own fallback does, and inside the band this project already accepts
between renderers.

Two consequences remain open: `replayCost`'s "filter ⇒ expensive outright" prices
a cost that on that engine was never incurred, and `rasterPad` reserves bleed for
spread that did not happen. Both are now wrong in the other direction, since the
fallback really does blur.

**Why nothing caught it, and the lever that closes the class.** The conformance
suite compares DOM against canvas — on Chrome, where both blur correctly. DOM
uses CSS `backdrop-filter`, which Safari implements properly, and DOM is the
default (islands are always DOM), so shipped apps were never affected; the
exposure was Safari plus the canvas renderer, which nothing in the suite covers.
That is the standing "Chrome cannot see Safari canvas problems" trap with a name
on it. The durable answer is `__declareForceFilterFallback`, which makes an
engine that HAS `ctx.filter` take the path built for engines that do not — so a
SAFARI bug is pinned from a Chrome-only suite (`test/canvas-filter.test.mjs`).
Reach for that shape for the next engine gap, rather than for a Safari gate.

## C.1 Mac drawing conformance — measured per op, and closed (2026-08-24)

Bringing a renderer into spec needs an instrument that names the OP, which
neither existing visual rig does: `fidelity.mjs` scores a whole app over 160px
tiles and the perceptual suite holds DOM and canvas to each other. So
`test/probe/drawops.declare` states one drawing feature per cell on a fixed grid
and `mac-host/drawconform.mjs` scores cell by cell. Validated on the web pair
first — chrome canvas against chrome DOM is **0% on all 30 cells** — so a
non-zero Mac column is the renderer, not the rig.

Five cells diverged. All five are now within budget, and none of the fixes was
what the first guess said:

| cell | before | after | what it actually was |
|---|---|---|---|
| `filterTwoMarks` | 28.01% | 0% | the blur radius, not group-vs-per-op |
| `filterBlur` | 25.82% | 0% | `r * geom.scale` — the radius was scaled by the backing scale, which the comment directly above it already said not to do |
| `shadowBlur` | 8.70% | 0% | `shadowBlur / 2` — CG's `blur` behaves like the full extent, not the sigma |
| `shadowOffset` | 3.20% | 0% | the SIGN of y only: CG places shadows in its own y-UP device space |
| `conicGradient` | 2.92% | 0.05% | antialiased seams between TILING wedges, plus a fixed 180-wedge sweep |

Two of those had to be measured rather than reasoned about, because the obvious
theory was wrong both times. **Canvas shadow offsets and filter lengths are
DEVICE space and ignore the CTM** — `blur(10px)` ramps over the same 32 device px
at scale 1, 2 and 4, and a `shadowOffsetX` of 12 lands 12 device px out at either
dpr. So the expected "divide by the CTM scale" correction on the Mac side was not
needed for the shadow OFFSET at all (CG does not put the CTM through it, measured
— the x cell had always passed), and the y fix is a bare negation. Conversely the
filter radius WAS being scaled and should not have been.

⚠ The remaining Mac gap is text, and it is expected: `textFill` reads 3.11%
against a 22% budget, because Core Text will never match Skia glyph for glyph.
That cell is there to catch placement and size, not shape.

Regression check after the fixes: the native gate is 16 programs, 0 failing, with
`blur` IMPROVED 0.27pt and `desktop` 0.07pt; behavioural conformance passes 14/14
with dom, canvas and mac agreeing.

## C.2 The batch on that ground (2026-08-25) — bounds, cost, culling, eviction

Started from one question: *is the size of a drawing always known?* It was not,
and the answer was a shipped bug. `fillText` marked only its **anchor point**, so
a `draw()` whose only ink was text bounded to a degenerate box, and the DOM
backend — which sizes a per-view canvas to the bounds — allocated **1×1 and
rendered nothing**. Measured on `test/probe/textbounds.declare`: 0 white pixels
on DOM against 3597 on the canvas backend, whose bounds only gate the memo.
The recorder now mirrors font/align/baseline/letterSpacing and bounds a run via
the **shared measurer** (`measure.ts`, the one Text layout already uses), so it
stays context-free; bare Node with no measurer falls back to the anchor. Mac
receives the fix through the display-list JSON (`mac-host/textbounds-check.mjs`).

What was built on the way, all in `runtime/src/draw.ts` and `canvas-backend.ts`:

- **Per-op extents** (`DisplayList.extents`, parallel to `ops`, null for
  non-paint ops). The recorder already mapped each painted extent through the
  CTM before unioning it into `bounds`; keeping them costs an array slot.
- **`replayArea` replaces `replayCost`.** Area in recording units², overdraw
  counted, gradients weighted, filter ⇒ ∞. The *quantity* is the recording's and
  shared; the *threshold* is each backend's — the canvas backend promotes at
  `ops × 20µs + coveredDevicePx × 0.5ms/Mpx ≥ 1ms`, which keeps the old 48-op
  rule as a bound and **adds** area to it, so a four-op full-screen wash now
  promotes where op count alone called it cheap.
- **Viewport culling** in `replay(ctx, list, clip?)`: paint ops entirely outside
  the visible region are skipped. **Byte-identical** — pinned two ways in
  `test/draw-bounds.test.mjs`, the scrolled extent probe and every drawops cell,
  comparing data URLs for equality rather than tolerance. Refused for lists using
  a composite operator whose effect reaches past its source (`copy`,
  `source-in/out`, `destination-in/out/atop`). Only the vector path culls; a memo
  raster is always the whole recording, since a memo must not depend on the
  viewport.
- **Eviction by relevance, then value.** An entry not painted last compositor
  generation is off-screen and worthless at any recency — largest first; among
  live ones, lowest `rasterMs × hits / bytes`. Both terms are exact per-entry
  facts; only the absolute budget was ever fuzzy.
- **Discovered ceilings, not calibrated ones.** A null context, a throw, or a
  large raster that samples blank halves the session's budget scale and never
  raises it. DT ruled out a measured cap sweep: a ceiling found on one machine
  under one set of apps is an anecdote, and boot-time preflight costs the memory
  it measures.

⚠ **Placeholders, named as such in the code:** `OP_US = 20` is a stroke's worst
case standing in for every op kind; `GRADIENT_WEIGHT = 3` is a guess; the
Safari and mac thresholds are unmeasured. The op-kind sweep on `rasterbench`
(solid / gradient / stroke / text / `shadowBlur` — not `filter`, which Safari
ignores) is what turns them into numbers.

Verified: JS suite green; native gate 16/0 (`blur` still −0.27pt, `desktop`
−0.06pt); behavioural conformance 14/14; all 30 drawops cells within budget on
Mac after the change.

## C.3 The measurement pass (2026-08-25) — every engine, and the constants

DT's go: "do all of the measurement required so we can proceed to build." One
pass, serialized (a Chrome trace and a Safari cadence run cannot share the GPU):
Chrome traced on both renderers at two mark sizes, real Safari on the size and
op-kind sweeps with focus yielded, Firefox on everything, the Mac host on its own
meter, and the iOS Simulator for caps. The rig grew an op-kind axis on the
coverage probe (`kind` = fill · gradient · stroke · text · shadow — `shadowBlur`,
not `filter`, so the blur arm exists on Safari), a weight axis on the size probe
(the axis that loads an engine that ignores `ctx.filter`), a Firefox engine, a
Simulator engine, and `tools/rasterfit.mjs`, which turns the traced rows into
the cost model's constants.

**The constants — calibrated, two spans, Chrome tracing.** `slope(span) = OP +
PX·area(span)`; two mark sizes, two equations:

| kind | DOM: OP µs/op | DOM: PX ms/Mpx | canvas: OP | canvas: PX | PX relative to fill |
|---|---|---|---|---|---|
| fill | 1.6 | 0.10 | 0.3 | 0.05 | 1× |
| stroke | 1.6 | 0.06 | 0.8 | 0.03 | 0.6× |
| shadow | 3.0 | 0.43 | 0.7 | 0.22 | 4.3× |
| text | ~0 | 0.85 | ~0 | 0.42 | 8.5× |
| gradient | 6.1 | **3.01** | 2.6 | **1.53** | **30×** |

Two things the placeholders got wrong by an order of magnitude each way. The
per-op floor is 1–3 µs on DOM and under 1 µs on canvas — `OP_US = 20` was ten
times high, so the old 48-op rule was promoting recordings that cost 50 µs to
replay. And a gradient's per-pixel cost is **30× a solid fill's**, not 3× —
`GRADIENT_WEIGHT = 3` was ten times low, so a two-wash sky priced as cheap.
Canvas is ~0.5× DOM on every row, the same ratio as before; the kind ratios
are identical on both renderers. So: one shared set of per-kind AREA weights
(draw.ts), one per-backend pair of base constants (canvas-backend.ts), which is
the split the ruling asked for.

**Size grace — decided: not built, because no measured engine needs it.**
Safari, the engine the wallpaper's workaround was written against, on the
weight axis (five full-surface radial washes is the wallpaper; weight 32 is six
times that), 30-step resize, focus yielded:

| Safari, both renderers | weight 3 | 8 | 16 | 32 |
|---|---|---|---|---|
| live — re-records every step, p50/p95 | 17/18 | 17/17 | 17/17 | 17/17 |
| ref — fixed box + CSS scale | 17/18 | 17/17 | 17/18 | 17/17 |

Flat at the 60 Hz cap to six times the wallpaper's load, live and ref alike,
DOM and canvas alike. Chrome: 1 ms of main-thread paint either way (§E.2).
Firefox: live p95 11–20 against ref 9–10 at 120 Hz — a few ms, no drops. The
"~24 ms per flush" the workaround cites does not reproduce on any engine at
any load run here; whatever it measured in 2026-08, it is not what these
engines do now. A grace that stretches a stale raster for the beat would buy
nothing measurable and would carry the two-mechanism complexity (scale grace
and size grace are different gates) for it. Not built. The consequence for the
corpus: the wallpaper's reference box, and the dock icon's `face`, are
workarounds for a cost that is not there, and can be retired on this evidence
— that is DT's file and DT's call.

**Firefox, in full** (Gecko rasterizes eagerly on the CPU, so its cost is in
cadence; 120 Hz display, p50 8 ms):
- Gradient fills are its cliff: 256 gradient marks p50 **55 ms**, 1024 → **234
  ms**, on the DOM renderer. On the canvas renderer the same rows read p50 8 /
  p95 238 — the memo promoting the stable list and blitting it, the first
  raster paid once. That is the memo doing on Gecko exactly what it was built
  for, and the clearest evidence in the whole pass that it earns its bytes.
- Shadows: 1024 shadowed marks re-record at ~110 ms each (DOM); canvas hides it
  behind the memo again.
- Extent: a document-tall DOM canvas goes **blank at 131.8 MB** (ink 0 at
  k ≥ 16, where Chrome still rendered) — a discovered ceiling lower than
  Safari's. The canvas backend is flat, having refused the raster.
- Everything else at 120 Hz.

**Safari, op kinds:** 60 Hz on every row; only 4096 full-surface translucent
covers drop (p50 28 ms).

**The Mac host, on its own meter** (`mac-host/kindsbench.mjs` — `ctl eval`
turns the probe's knobs, `statsreset`/`stats` read LayerTree's raster timer;
ms per re-record, 30 re-records per row):

| kind | 256 ops | 1024 ops | small mark, 1024 | path |
|---|---|---|---|---|
| fill | 3.1 | 7.3 | 8.6 | described (CALayers) |
| gradient | 6.8 | 19.0 | 16.0 | described |
| stroke | 3.2 | 9.5 | 9.0 | described |
| text | 25 | 79 | 19.7 | rasterized (Core Text) |
| **shadow** | **722** → 5.5 | **4785** → 13.9 | 85 | rasterized (CG) → **described** (2026-08-26) |

Two shapes in that table. The DESCRIBED kinds cost per op and not per pixel —
the same at both mark sizes — because what is being paid is CALayer
construction (~7–19 µs per mark), and the pixels are the render server's. That
is the Mac's version of "the cost lands where the compositor is fed", and it
sits between Chrome DOM's 15 µs/op and canvas's 8. The RASTERIZED kinds scale
with area (text 4× between the spans) and, for shadows, with radius²: **a
shadowed mark costs ~4.7 ms on the Mac host against 61 µs on Chrome** — a 75×
cliff, because Core Graphics blurs each shadow on the CPU in the per-node
raster path. That is the largest per-engine divergence this pass found, and it
is specific: `CAShapeLayer` carries `shadowRadius`/`shadowOpacity`/`shadowOffset`
natively, so shadows could be DESCRIBED like fills are and never reach CG.

**Built, 2026-08-26.** `LayerDescribe` now parses the shadow state it used to
refuse, carries it in the run key, and sets it on the solid-paint
`CAShapeLayer`. Two things had to be right and were verified by instrument
rather than reasoned: a shadowed mark is its OWN layer, never merged into a
run — canvas shadows each drawing operation separately, so a later mark's
shadow falls on an earlier mark's fill, which a compound path's single shadow
cannot say — and canvas shadow geometry is device-space where the layer's is
points, so offset and blur divide by the backing scale and the offset's y is
negated into the layer's y-up space. A shadowed gradient keeps the raster path
(its shape is a mask over a gradient layer, and a mask draws no shadow).
`drawconform`: `shadowOffset` 0%, `shadowBlur` 0% at meanΔ 0.38 — identical to
the rasterized path's numbers, so the described shadow matches CG and Chrome
alike. The meter: **256 shadowed marks 722 → 5.5 ms; 1024 marks 4785 → 13.9
ms** per re-record, every row described. Gate 16/0, desktop −0.62 pt.

**iOS Simulator** (iPhone 16 Pro, iOS WebKit at dpr 3; timings Mac-hosted and
indicative): `ctx.filter` NOT honoured, the same as desktop Safari. The
document-tall extent at k=48 is an **889.9 MB, 2700×86403 canvas that paints
nothing** (ink 0%) — the per-canvas cap, exactly where draw.ts's
RASTER_MAX_AREA keeps the memo from going. Strokes and text at 1024 marks read
p50 30 and 61 ms where desktop Safari was flat, a WebKit-configuration
difference worth a real-device run before it is called a number.

## D. Canvas, per runtime — the platform attributes

Same recording throughout (`artSunnySky`, two full-surface gradient fills at
1190x1024 @2x = 4.87 Mpx, M2 Max):

| path | ms/paint | Mpx/s |
|---|---|---|
| `CGBitmapContext` (CPU) | 34.5 | 141 |
| `CGContext` over IOSurface *memory* | 34.8 | 140 |
| Skia CPU (`chrome --disable-gpu`) | 36.0 | 135 |
| Chrome canvas (GPU, ANGLE/Metal) | 1.67 | 2,919 |
| Safari canvas | 0.95 | 5,131 |
| `CGIOSurfaceContext` (SPI) | 0.63–0.77 | 6,300–7,710 |
| Metal fragment shader | 0.77 | 6,350 |

CG's CPU rasterizer is within 4% of Skia's, so the 20-50x gap is *GPU vs CPU
rasterization*, not API quality — and zero-copy is not the win, since a
CGContext over `IOSurfaceGetBaseAddress` still measures 140 Mpx/s. What matters
is the context TYPE routing drawing to the GPU.

| | Blink | WebKit | Core Graphics / CA |
|---|---|---|---|
| when it rasters | eagerly, as issued | deferred to first pixel read | at the call, synchronously |
| where | GPU, raster threads, off main thread | GPU (IOSurface) unless `willReadFrequently` | whatever the context type says — CPU by default |
| the bill attaches to | layer update at commit (measured) | the flush — whoever touches a pixel | the draw call |
| overdraw | pays at paint, not raster | pays fully | pays fully |
| under a transform | bitmap resamples; composited *content* re-rasters at rest | same | bitmaps resample; **procedural layers re-rasterize the path** |
| caps | 32,767/dim; tile eviction | 16.7MP/canvas (pre-iOS 18); 224–384MB total | none in that sense; IOSurface memory is real |
| failure mode | slow but correct (software fallback) | **silently transparent** | memory growth |

Four things generalize: covered pixels x overdraw predicts cost and op count
does not; filters break that rule (superlinear in radius, geometry-independent);
**only description survives a transform** — a bitmap is correct at exactly the
size it was made, on every runtime, and CA is the only one of the three offering
a first-class procedural alternative; and the failure modes are asymmetric, with
Safari's the dangerous one because it goes quiet rather than slow.

On the Mac side the compositor is not the bottleneck (p95 4.8ms/commit on a
40-step resize against Chrome's 94ms wall), but **each CATransaction pays a
window-server round trip**: measured `commit total=1084ms, CPU=4ms,
WAITING=1080ms`. Ops are already maximally chunked — JavaScriptCore is
in-process and one settle is one JSON blob inside one transaction — so the lever
is commit COUNT (one transaction per display tick), never op batching.

## E. What is open now

1. ~~Per-op bounds, the area predictor, culling~~ — DONE, §C.2.
2. ~~Size grace~~ — DECIDED 2026-08-25, not built: no measured engine drops a
   frame under the naive shape at up to six times the wallpaper's load. §C.3
   carries the table and the corpus consequence. (The first Chrome reading that
   said the workaround regressed Chrome 2× was two instrument artifacts and was
   withdrawn — the drive perturbed the recording, and readbacks sat inside the
   trace window; `will-change` on the view and then the canvas moved nothing,
   which is what pointed at the rig.)
3. **DOM extent** — a raster window (a band-sized backing store re-imaged as the
   visible rect moves). SVG would solve extent structurally, being the one DOM
   primitive the browser rasterizes under the transform, but it adds a THIRD
   rendering semantics to a conformance oracle that has canvas as its reference
   — and `LayerDescribe`'s focal-radial mismatch (0.01% → 7.33% differing on the
   `vignette` probe) is what that costs per primitive. Parked, not killed.
4. **The `ctx.filter` bug**, which is the one confirmed shipped user-visible
   defect this cycle turned up.

**The ruling that reorganizes all of it (DT, 2026-08-23): the goal is not
uniformity.** What must be uniform is the PROMISE — no author manages rasters on
any renderer, content is exact at rest, transitional frames may be approximate,
memory never blows up — and the shared vocabulary (the size/content dep
partition, `rasterPad`, the 120ms beat). The MECHANISM should vary with what
each renderer needs. The Mac host is the proof: its best answer is not a variant
of the shared cache but re-description, which caches nothing and is exact at
every scale. `replayCost` is demoted accordingly — a dispatch function over a
recording, not a shared promotion gate, since the DOM backend has no
whether-to-raster choice to make.


> **Status: REJECTED, 2026-08-16, on measurement.** The caching mechanism below
> does not survive; the *analysis* it rests on does, and is reused by what
> replaces it. Superseded by re-description (see "What replaces it").
>
> **Why it fails, in one line: a drawing is hot precisely because it re-records
> every frame, and it re-records because it reads its own size — so every frame
> is a new size and a cache keyed on size can never hit.**
>
> Only an EXACT-SIZE cache is pixel-accurate. Downscaling from a high-water
> cache is not: rendering at size B computes antialias coverage against B's
> pixel grid, whereas downsampling from A resamples an image already
> antialiased against A's grid — double-filtered edges, and features that would
> land on a pixel boundary at B get smeared. So this document's claim that
> cache-and-scale is "exact and permanent — no quality loss ever" is wrong, and
> the motion-time approximation for the size-dependent class is a torn frame:
> it shows pixels the program never described.
>
> Measured hit rates for an exact-size memo (hash of display list + backing
> scale), Mac host, 2026-08-16:
>
> | workload | rasters | memo hits | time saved |
> |---|---|---|---|
> | weather, 40-step resize | 888 | ~9% | negligible |
> | weather, scroll + view switches | 64 | 64% | **6ms of 46ms (13%)** |
> | desktop, dock magnification | 242 | **0%** | 0 of 311ms |
>
> The 64% is the trap: it hits often and saves nothing, because the hits are all
> CHEAP recordings. The expensive pair never repeats.
>
> ## What replaces it: re-describe, don't resample
>
> Hand the compositor a DESCRIPTION rather than pixels — `CAGradientLayer` for
> gradient fills, `CAShapeLayer` for paths. Nothing is cached, nothing goes
> stale, and a size change is re-rendered exactly at the new size instead of
> resampled. Critically, a transform on a CAShapeLayer is **not** a bitmap
> resample: the render server rasterizes the path under the transform, so vector
> art stays crisp at any scale — which is an exact answer to dock magnification,
> the very case this document was written for.
>
> The cardinality worry (one layer per mark) is unfounded. A CAShapeLayer holds
> a COMPOUND path, so consecutive marks sharing paint state merge. Measured:
>
> | recording | marks | layers needed |
> |---|---|---|
> | desktop dock strip (97% of its app's raster time) | 242 strokes | **2** |
> | weather sky (96%) | 2 gradient fills | **2** |
> | weather's most ornate icon | 160 | 14 |
>
> ## What survives from this document
>
> The dep-graph partition of a draw's reads into **size** vs **content** (below)
> is the durable insight and the precondition for re-description: it is what
> lets the runtime know that only the size changed. This document spent that
> knowledge on resampling; re-description spends it better and trades no
> fidelity at all. The settle invariant then becomes unnecessary rather than
> load-bearing, because there is no approximation to settle out of.
>
> Also still true: a cache would help where an identical (recording, size) pair
> recurs — a remount, a reveal after hiding, an animation returning to a size it
> already visited. Measured at 13% of raster time in a churn workload. Real, but
> not what costs.
>
> ## Where the ruling is not yet kept: the DOM backend
>
> Three backends, three positions. **Canvas** keeps the ruling for free — a
> drawing replays directly into the shared ctx under the composed transform
> (`canvas-backend.ts:1387`), so a scaled view's recording rasterizes at the size
> it is seen, carrying no resolution state. **The Mac host** keeps it by
> description (`LayerDescribe.swift`, landed with this rejection). **The DOM
> backend does not keep it.** A drawing there replays into its own `<canvas>`
> element sized to `bounds × devicePixelRatio` (`dom-backend.ts:2118`). Nothing is
> cached — every invalidation re-replays the whole list — but a *transform* change
> is not an invalidation, so the element's last-rendered pixels are what CSS then
> scales. Under a declare `scale` a DOM drawing is stretched, and DOM is the only
> backend where that is true.
>
> One attempt was made and abandoned (2026-08-14, never landed): compose the
> ancestors' declare scale into the replay factor — quantized UP to quarter steps,
> the sweep coalesced to one rAF, floored at dpr and capped at 3× over it. It
> works, and it is this document's rejected bargain in a different costume: between
> step crossings, and past the 3× cap, CSS stretches the canvas and the view shows
> pixels the program never described. The quantization was the concession to
> per-frame replay cost under a springing scale (the desktop zoom egg), which is
> exactly the concession the ruling above says not to make. The other two backends
> reach exactness carrying no resolution state at all; a DOM answer that needs a
> factor to track and a step size to tune is the wrong shape.
>
> What a DOM answer must clear: replay at the resolution the view is SEEN at with
> no quantization, or express the recording as something the browser rasterizes
> under the transform itself (SVG is the only DOM primitive that does). Open — see
> `compositing.md` II.1.

**Status:** proposal, 2026-07-20. Nothing built. Motivated by the dock-magnification
paint cost (a hot `draw()` re-rasterizing 9 illustrations per frame dragged Safari's
rAF from 60 → ~25fps; see the
manual fix in `apps/desktop/desktop.declare`). This spec is how the runtime would do
that fix automatically, for any hot draw, with no developer awareness of rasters.

## The principle

A developer should be able to custom-draw the contents of a view *freely* and never
think about bitmap caching, GPU texture memory, or when a raster is regenerated. Those
live below the surface a UI developer should have to touch. The obvious way to write a
magnifying icon — scale the drawing to the live size inside `draw()` — should be fast.
Today it is the performance trap: reading `this.width` in the body makes the recording
size-dependent, so every magnification frame re-records and re-rasterizes.

The retained-mode drawing model is what makes an automatic fix possible. Because a
`draw()` body **records a plain-data display list** rather than painting live pixels
(see the ruling in `runtime/src/draw.ts`), the runtime — not user code — owns the pixel
pipeline, and is free to cache, scale, re-tier, and re-render a drawing without ever
re-entering the body. This proposal spends that freedom.

## Mental model: JIT tiering for drawing

The default stays exactly as it is: a `draw()` re-executes on invalidation and
rasterizes into its view — cheap and exact, correct for the ~95% of draws that are
static or change rarely. On top of that, the runtime **tiers up a hot draw** to a
cached raster, the way a JIT promotes a hot loop from interpreted to compiled, and
**re-tiers** when conditions change. No `will-change`, no manual bitmap. The runtime
observes and promotes.

## The enabling asymmetry: the dep graph already knows what a draw reads

The reactive graph records exactly which cells a `draw()` body reads. That lets the
runtime **partition a draw's inputs for free**:

- **size reads** — `this.width` / `height` / `scale`
- **content reads** — everything else (a calendar's day, the theme, a hover colour)

A content read changing means the *picture* changed → the cache is stale, re-render. A
size read changing means only the *scale* changed → keep the picture, re-composite it.
No other framework gets this handed to it; they guess, or make the developer annotate.

## Two correctness classes (compiler-assisted)

Static analysis — the same dataflow machinery behind dep-extraction — classifies each
`draw()` body:

- **Uniformly scalable.** Size appears *only* as a uniform pre-transform (the
  `d.scale(this.width / K, …)` shape, or provably-linear geometry). A resize is then
  *mathematically* a pure scale of the recording, so cache-and-scale is **exact and
  permanent** — no quality loss ever, in motion or at rest. This is the class the dock
  icons fall into; the runtime would apply the manual fix automatically.
- **Size-dependent shape.** The body uses size non-linearly — a fixed 2px border that
  should *not* thin as the icon grows. Scaling a bitmap is then slightly wrong for those
  features. Policy: GPU-scale the cached raster **during motion** (imperceptible on a
  moving element) and **re-render exactly the instant it settles**. Bounded, temporary,
  invisible — the bargain a browser layer already strikes.

The compiler tags the class; the runtime acts on the tag. That mirrors the existing
split (compiler analyzes bodies → runtime executes), as with the effects table. The
analysis is conservative: *can't prove uniform* → treat as size-dependent, whose path
is still correct, just not always-exact.

## Resolution — and the animation-target shortcut

At what size to hold the cache is the resolution question.

- **Baseline:** high-water mark — cache at `observed_max_size × dpr × headroom`,
  ratcheting up and staying. The first hover may re-render a couple of times as the size
  climbs; then it locks at the peak and every later frame is a cheap downscale. `dpr` is
  already watched so a drawing stays crisp across displays.
- **The Declare shortcut:** magnification is driven by a Spring/Animator whose target
  (`to`) is a *readable* value. The runtime can look at the driver's target and
  **pre-render the cache at the known peak resolution up front**, skipping the ramp-up
  entirely. An imperative rAF loop has no idea what size it is heading toward; a
  declarative, introspectable animation system does. This is a genuine structural
  advantage, not a trick.

## The settle invariant

The rule that makes aggressive motion-time caching safe to ship automatically: **when a
draw goes cold, re-rasterize it exactly at its final size.** Whatever approximation
happened mid-motion evaporates; the resting frame is always pixel-perfect. There is no
permanent quality debt, which is what lets the runtime be bold during motion without the
developer ever opting in.

## Backends are not symmetric — this shapes everything

The single most important structural fact: **how much of this the runtime must build
depends on the backend, because the browser only helps one of them.**

### DOM backend — lean on the compositor

Once the runtime hands the browser a **stable canvas + a CSS `transform`**, the browser
promotes it to a compositor layer and manages the GPU texture — allocation, upload,
eviction, re-raster under pressure — *itself*. The compositor accelerates a stable layer
under a transform; it can do nothing for content that regenerates every frame (that is
precisely why the old dock code got no help — it resized and redrew the canvas, it never
presented a transform). So on the DOM backend the runtime's whole job is to **create the
precondition**: stabilize the content (draw once at a fixed base size) and drive the
`scale` attribute. After that, GPU memory and eviction are the browser's problem, and
the elaborate budget machinery below is largely unnecessary.

### Canvas backend — we own it end to end

The unified single-canvas backend has no per-element layers, so the browser gives us
**nothing** automatic. Here the runtime must hold explicit offscreen cached bitmaps,
blit them during the composite walk, and manage their lifecycle itself. This is where
the memory management is real.

So: **DOM backend = arrange the precondition, then delegate. Canvas backend = full
cache ownership.** The promotion decision (which draws to stabilize, at what base
resolution) is ours on *both* — the browser will neither refuse a canvas we allocate nor
choose our reference size.

## Managing a cache whose ceiling you cannot measure (Canvas backend)

The runtime has no direct view of GPU, browser, or system memory. The design does not
try to measure the ceiling; it measures whether the cache is still *paying off* —
because the thing the cache exists to protect, frame time, is itself the pressure signal.

- **The relative is precise; only the absolute is fuzzy.** We know exactly the bytes per
  surface (`w × h × 4 × dpr²`), total allocated, each entry's hit rate, hotness, and
  raster cost — so each entry's **value density** (frames-saved-per-second per byte) is
  computable, and eviction *ordering* is never in doubt. The one unknown is the single
  scalar total budget. The problem collapses to: adaptively find one number.
- **Find it with congestion control (AIMD).** This is the TCP problem — manage a
  resource you cannot observe by inferring pressure from a symptom. While frames are
  healthy, grow the budget *additively* (promote one more hot draw, ratchet a resolution
  up). On a pressure signal, cut *multiplicatively* (evict hard, drop the budget a
  third). Grow slow, shrink fast — GPU pressure arrives as a cliff (texture-eviction
  thrash), so hysteresis matters. **The pressure signal is frame time itself:** if
  promoting more rasters stops improving, or starts regressing, frame time, back off
  regardless of the true memory number. The cache's own objective function is the sensor.
- **Hard signals are discovered ceilings.** A null `getContext`, a blank canvas past the
  texture budget, a `webglcontextlost`, the canvas max-area cap — treat each as the
  device telling you its real limit; evict, lower the soft budget beneath it, and
  remember it.
- **The initial prior:** seed the soft budget from `viewport area × dpr² × a device
  tier` (folding in `deviceMemory` / `hardwareConcurrency` where present) — a starting
  guess only, corrected by the loop within a second or two. Screen size is a fair prior
  because it loosely tracks how much the device was built to push; it is not trusted as
  an answer.

Two properties make a wrong guess cheap, which is what makes the whole scheme safe:

1. **Graceful degradation, not failure.** An evicted-but-still-hot draw falls back to
   today's behaviour — re-raster every frame. Slower, still pixel-correct. An
   under-estimate costs a little performance; an over-estimate self-corrects. The failure
   mode is never "broken," only "slower," so the runtime can be conservative at no risk.
2. **Resolution is a middle gear.** Before fully evicting a hot entry, *halve its cache
   resolution* — 4× less memory for a small, motion-only softness that settle-re-render
   erases anyway. Dim the lights before turning them off.

## Compiler / runtime split

- **Compiler (static):** classify each `draw()` — uniformly scalable vs size-dependent;
  partition its reads into size vs content. Emit the tag.
- **Runtime (dynamic):** hotness detection (invalidations per window, or "re-recorded
  every frame while the Clock is live"), promotion/demotion, resolution high-water and
  animation-target lookahead, the settle re-render, and — Canvas backend only — the
  cache budget, eviction, and congestion loop.

## Open questions

- The uniform-scalability analysis is the real work: a dataflow question over a small,
  structured op-recording body, with a conservative fallback. Tractable, but the crux.
- A rare class — size-dependent *and* animated *and* quality-critical in motion — where
  even motion-time softness is unacceptable. Safety valve: don't promote it; keep
  re-rastering every frame (today's behaviour). Possibly a one-line opt-out attribute,
  though it should never be needed for ordinary work.
- Interaction with the worker-boundary plan: a display list is structured-cloneable, so
  rasterization could move off the main thread. A cached-bitmap tier and an off-thread
  rasterization tier are complementary; the promotion policy should eventually reason
  about both together.
- Whether hotness detection should ever be *predictive* (an active Spring on a size slot
  is a near-certain signal a draw is about to be hot) rather than purely reactive.
