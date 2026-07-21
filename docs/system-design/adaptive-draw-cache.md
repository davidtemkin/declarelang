# Adaptive draw caching — hot `draw()` views without manual bitmaps

**Status:** proposal, 2026-07-20. Nothing built. Motivated by the dock-magnification
paint cost (a hot `draw()` re-rasterizing 9 illustrations per frame dragged Safari's
rAF from 60 → ~25fps; see [desktop-vs-macos-web.md](desktop-vs-macos-web.md) and the
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
