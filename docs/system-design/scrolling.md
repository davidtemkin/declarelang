# Scrolling — the model and its realization

The language story lives in the guide (Space ch. "Scrolling"; the gesture
interplay in the Gestures chapter); `gestures.md` carries the measured Safari
facts that motivated the design. This file is the renderer side: what each
declaration compiles down to, per backend, and the invariants tests pin.

The model, in the guide's five sentences: an App **fills its window** and
**scrolls by default, as the page itself**; **minimums are floors** (below
them the browser pans the held frame); every scroller **keeps to its frame**
(declared-axis overflow = scroll range, any other axis = out of frame); any
view opens its own regime with the **`scrolls` axis enum**; and a child rides
its scroller's frame with **`ignoreScroll`**. Ruled 2026-07-29; the ratifying
arguments are recorded in the session memory and the guide prose itself.

## The App altitude

- **Clipped by definition.** `clip = false` on an App is a compile error
  naming the rule (check.ts); the boolean form is absorbed (`App.applyClip`
  keeps only the Shape clip); the box-clip realization is per-axis, composed
  with `scrolls` — see below. A program owns its rectangle.
- **`scrolls = "y"` by default** (`defineAttributes(App)`), same pusher as
  View. The identity — the App's scroller IS the page — is realization, not
  inference: the App is the outermost view, so its enclosing scroll authority
  is the browser.
- **Floors**: `width`/`height` default to `max(host, min)` (App.bindExtent).
  A box larger than the viewport page-pans natively on whichever axis
  exceeds — that is the window being smaller than the app, not a scroll
  anyone declares.
- **The root gesture default is reactive geometry**: the App feeds its
  content extent to the root surface (App.bindPageScroll →
  `Surface.setPageExtent`), and the backend compares the REALIZED root box
  against the live viewport — somewhere to go → `touch-action: manipulation`
  (pan stays with the user); nothing to scroll → `pinch-zoom` (pan retires,
  stilling the rubber-band; pinch stays). Never keyed on any attribute — the
  same app is pannable on a phone and fixed on a desktop. TOP-LEVEL only:
  an **embedded** island fits its box, so the geometry read would retire pan
  and eat every swipe starting over it when the finger belongs to the host
  page — its default is `manipulation` (pan and pinch chain to the host;
  double-tap zoom retires; declared claims still stand), both backends.

## The scroll process — facts, requests, arbitration (ruled 2026-09-10)

Scrolling is an **external process** that produces a fact. It is never a
slot Declare controls — which is exactly what makes it unlike every other
geometry in the language, and why the surface is drawn the way it is:

- **Facts** (read-only, schema `readOnly`): `scrollY`, `scrollX` — the
  offset, clamped to the range; `scrolling` — a gesture or momentum is in
  flight. The platform (or the runtime provider) writes them; a program
  reads them. Sampled once per settle, like pointer position: the program's
  view may lag the visual by up to a frame, and the visual never waits on a
  settle. Nothing writes a fact — not an assignment, not an Animator (an
  animator drives a slot; a fact is not one). The checker refuses both,
  naming the verb.
- **Requests** (verbs): `scrollTo(y[, glide])`, `scrollToX(x[, glide])`,
  `scrollBy(dx, dy[, glide])`, `reveal(target)`. A request asks the process
  to move; the process clamps, and may glide. `scrollStartY`/`scrollStartX`
  declare a starting offset, applied once at first layout.
- **The glide** (`{ duration, motion }`) is the platform's own motion — the
  browser's smooth scroll, an `NSAnimationContext`, the runtime provider's
  tween — not a Declare Animator: the provider's curve, no Animator
  semantics, cancelled by a gesture. Where a provider can honor a Declare
  motion curve it does (mac, runtime); the DOM uses its own.
- **Claims**: `onWheel` (with `pinch`) and the drag claims take a stream
  for the program; otherwise the process gets it.

**Two providers, one contract.** A viewport's scroll process is either the
platform's — a DOM scroll container, an `NSScrollView` — or the runtime
provider (a Mesa-derived engine, ruled 2026-09-10: physics on **touch**
only; on desktop the wheel stream already carries the platform's momentum,
so deltas apply as delivered and rubber-band overscroll is forgone). A
program cannot tell which it has. The backend chooses; a program only states
**needs** (a claimed gesture, snap points) that force the runtime provider.
The asymmetry is performance, never semantics: a platform provider rides a
compositor thread and survives a slow settle; the runtime provider shares
the thread and is smooth exactly when scrolling is a translate of cached
rasters — so platform is the default wherever it exists.

**Arbitration — the same rules in every provider:**

1. A gesture or momentum in flight owns the offset. A request during it is
   dropped; `reveal` defers to idle.
2. An interior scroller **contains** its gesture: at its limit it stops, and
   does not chain to the page (the DOM's `overscroll-behavior: contain`, the
   canvas's own edge stop — ruled 2026-07-29; a pane that hands a finger to
   the page mid-gesture is the scroll trap, not a courtesy).
3. A request clamps to the range. Overscroll is *presentation* (a rubber
   band) — never a negative or over-range fact.
4. `ignoreScroll` children do not ride; everything else does. Chrome that
   must stay glued to scrolled content is a **member** of the scrolled
   subtree (`View.travelWith`), never positioned from the offset fact — a
   spring aimed at a scroll-varying target trails by construction.

## DOM realization

- **Root (the page)** — v3, forced by measurement: the spec'd per-axis
  `clip`+`visible` overflow pair collapsed on WebKit (both axes clipped, the
  page lost its scroll entirely — iPad, 2026-07-29), so the realization uses
  no overflow pairs at all. The root ELEMENT sizes itself to
  `max(frame, content extent)` along each declared scroll axis
  (`applyRootSize`; the extent arrives reactively from the App's own
  `contentWidth`/`contentHeight` via `setPageExtent`) — the box itself is
  the scroll range, and the document scrolls a plain tall element natively.
  `overflow: clip` stays on ALWAYS: the App's definitional containment,
  exact at the frame on every non-scroll axis, uniformly supported; fixed
  chrome escapes ancestor clipping by the platform's containing-block rule.
  The view MODEL's width/height stay the frame — the stretch is realization
  only. The root gesture default derives from the realized box against the
  live viewport (`manipulation` when the page has somewhere to go,
  `pinch-zoom` otherwise), refreshed on frame writes and extent changes.
  attachRoot re-applies the root styling after stamping root-ness, since
  attach ran before the element knew it was the root.
- **Panes**: per-axis `overflow auto/hidden`, `overscroll-behavior: contain`
  (own edge bounce, no chain to the page — relaxed only while pinch-zoomed,
  the `declare-zoomed` rung in gestures.md), touch-action delegating exactly
  the declared axes + `pinch-zoom`, and a scroll listener mirroring
  `scrollTop`/`scrollLeft` into `scrollY`/`scrollX`.
- **`ignoreScroll`**: realized from the element's ancestry
  (`realizeIgnoreScroll`, re-run at insert and at attachRoot): under the
  page regime → `position: fixed` (viewport-anchored; adds no document
  extent by the platform's own definition); under a pane → the element moves
  into the pane's **sticky frame** (`ensureScrollFrame`: a zero-size,
  in-flow `position: sticky` first child of the scroller, `z-index: 1`) —
  compositor-held at the pane's frame origin, no per-frame JS, no lag.
  Known v1 bounds: the fixed arm is top-level only (an embedded island's
  root sits offset in a host page where viewport coordinates would be
  wrong); frame chrome paints above pane content (the sticky frame's
  z-index), regardless of declaration order.

## The runtime provider (canvas) — built 2026-09-10

An interior pane on canvas has no platform scroller, so the runtime IS the
process: `canvas-backend`'s **ScrollLoop**, one per compositor, running FIRST
in every animation frame (`Compositor.frameTick`: loop → paint → facts).

- **Desktop**: a wheel delta over a pane is QUEUED (`scrollBy` → `enqueue`),
  applied once per frame — batched — painted, and only then reported. The
  wheel handler consumes the event and books the frame; it never writes the
  model. The platform's wheel stream already carries momentum, so deltas
  apply as delivered — no physics, no rubber band (ruled). `scrolling` rises
  with the first delta and settles 120 ms after the stream goes quiet.
- **Touch**: an unclaimed finger landing on an interior pane (`scrollerAt` —
  scrollBy's walk without a delta; never the page root, whose scroll is the
  browser's) opens a physics session (`scroll-physics.ts`, Mesa's engine
  lifted verbatim, parameters as-is until the conformance pass): the session
  owns the finger only past a 4 px tap slop, then `preventDefault`s every
  move; drag, momentum after the lift, and the rubber-band spring step on the
  loop. The FACT stays clamped to the range throughout — the rubber band is
  `scrollVisualY/X`, a presentation offset the paint translate reads and that
  retires to `null` at rest (arbitration rule 3). A request during a session
  is dropped (rule 1); a tap moves nothing.
- **Glides**: `scrollToY/X(v, glide)` tween on the loop
  (`motionToken(glide.motion) ?? DEFAULT_MOTION`, `sample`) and land exactly
  on the clamped target; a wheel delta or a touch on the same pane cancels
  them; a plain request cancels and jumps. **Equal is inert**: the fact's own
  echo through the attribute push (view.ts `scrollY`'s push → `scrollToY`)
  must never cancel a glide — the surface checks equality BEFORE cancelling.
- Facts (`reportOffsets`) are written once per frame after paint, so the
  settle they trigger paints a frame later (the documented ≤1-frame lag);
  `scrolling` (`reportScrolling`) flips on begin/settle only.

Held true by `test/scroll-loop.test.mjs` (wheel next-frame + batching,
containment at the limit, glide landing and cancellation, touch drag +
momentum + clamped fact, dropped request mid-session, tap, rubber-band
presentation) and the unit pin in `unit.test.mjs` (x-scroll steps the loop by
hand). The physics module rides in the DOM bundle today because the canvas
backend imports it unconditionally — stripping it when a program has no
canvas scroller is a noted follow-up.

## The native host (mac) — built 2026-09-10

The mac host's scroll process is the HOST's, over the layer tree
(`LayerTree.swift`, "THE SCROLL PROCESS"): the platform provider, realized
without an `NSScrollView` per scroller. Every surface is a CALayer under one
view, composed through its ancestors' clips, opacity, transforms and frosts;
an `NSScrollView` is an AppKit subview that draws above the whole layer tree
and escapes all of that (the overlays' `visibleRect` is the hand-made
workaround for exactly this). The property an `NSScrollView` would have
bought — scrolling that survives a slow settle — comes instead from **the
runtime thread** (`Bridge.swift`, "THE RUNTIME THREAD", ruled by DT
2026-09-10: "the DOM version in any browser is a Mac app; the mac version must
not be deficient"): the runtime's JSContext lives on its own THREAD with a
real run loop (created there, so JavaScriptCore's own timers — GC activity,
the sweeper — fire there too), the main thread owns AppKit, the layer tree
and this scroll process — the split a browser makes between its page thread
and its compositor. Every Swift → JS call is an async post; JS → Swift
primitives are thread-safe (CoreText, CGPath, disk; the TextEngine caches
under one lock), hop to main asynchronously (UI, media, the frame request),
or hop synchronously only where the settle needs the answer (`richLayout`,
TextKit being main-only) — deadlock-free because main never waits on the
runtime after init and never takes the JS lock (eval and bench answer by
callback). Two traps met on the way: a context created on MAIN deadlocked
(JSC's run-loop timer on main waiting for the JS lock the runtime held while
waiting on main), and a static Swift dictionary reached from both threads
segfaulted. MEASURED: with the runtime thread blocked for 1.5 s, three wheel
ticks moved the host's offset 600 → 300 and the fact caught up when the
block ended. So:

- **The wheel never crosses to JS for scrolling.** `scrollWheel`/`magnify`
  (and `ctl scroll`) enter `LayerTree.wheel`: the runtime's descent
  (`wheelWalk` — reverse paint order, innermost claimant-or-scroller under the
  point, a scroller-containing subtree ending the sibling search) in Swift
  over `layer.convert`, which carries transforms and scroll translations. A
  CLAIMANT (`WHEELCLAIM` op, from `onWheel`) gets its stream through
  `__declareWheel` → `wheelTo` → the sink — the program's to hear. A
  scroller takes the delta on the host: nearest ancestor-or-self with range
  on that axis (`axisScroller`), clamped, CONTAINED; the trackpad's phases
  (`momentumPhase`) are the stream, applied as delivered.
- **The frame**: `Bridge.onFrame` runs `tickScroll` FIRST (glides advance,
  every moved offset commits as one CATransaction — translate, bars, bands,
  overlays), then `flushScrollFacts` (`__declareScrollFacts`: rows of
  `[id, y|null, x|null, scrolling, gesture]`, once per frame, after the frame
  that showed them — the runtime settles on them and flushes its ops), then
  the runtime's own frame. A live glide re-arms the link after `pump()`.
- **Requests** still cross as `SCROLLPOS`/`SCROLLXPOS` (offset + range); an
  extent-only re-publish carries a `null` offset so a frame-old number never
  drags a live scroll back, and the host re-clamps and reports if the range
  shrank under the offset. A request during a GESTURE (a trackpad stream
  through its momentum, a bar drag — never a legacy mouse wheel) is dropped;
  a plain request cancels a glide. `SCROLLGLIDE` (axis, to, duration, cubic
  bezier) runs the host's own display-link tween on the program's curve
  (`GLIDE_BEZIERS` maps the motion tokens to their CSS approximations).
- **The scrollbar drag** is host-local now (`dragScrollbar` → offset → the
  frame → a fact); `__declareScrollTo`, `__declareScroll`, the JS `scrollBy`/
  `scrollByX` walks and the JS rAF glide are gone.
- **The page root's viewport is the WINDOW**, not the root's box
  (`LayerTree.viewport`/`pageExtentY`; `MacSurface.viewportH`/`pageExtentY`).
  The DOM's document scroll has this by construction — the root element is
  the page, the window is what it scrolls in — and the host clamped the page
  against the root's own box: weather's phone dialect declares its App 2652
  tall, so the page had a 40 px range (2026-09-10). The page's extent is the
  larger of its box and its content, and it pans on x whenever it is wider
  than the window, declared or not — the browser's own behaviour for a
  floored app. The window itself has a floor of 400×300 content
  (`contentMinSize`, the browser's own kind of floor); an App's declared
  minimums are floors beneath that, and the page pans.
- `travelWith` on mac re-homes the surface in the model tree (an INSERT
  under the scroller, last = above the rows) — the host's translate carries it.
- `ctl wheelat X Y` narrates the walk; `DECLARE_DEBUG_SCROLL=1` traces the
  process. TRAP: CADisplayLink does not fire while the display is asleep —
  `ctl stats` shows `linkTicks=0`, nothing moves, and every frame-driven gate
  fails; `caffeinate -u -d` before a mac gate on an idle machine.

## Canvas realization

The same contract at one element (`canvas-backend`): the canvas rides
**`position: fixed`** at the viewport (it never scrolls away and never grows
with content); an inert 1px-wide **strut** in the host carries the content
extent (fed by the same `setPageExtent` numbers the DOM realization uses),
giving the document its scroll range; and the root becomes a
**`pageRoot`** pane whose `scrollOffset` mirrors `window.scrollY` (a passive
scroll listener invalidates). The existing pane walks then paint and hit the
right slice unchanged. `scrollBy`/`wheelTo` never *consume* for a pageRoot —
the page's scroll is the browser's; `scrollIntoView` asks `window.scrollTo`.
`ignoreScroll` children are painted and hit **unshifted** (above the scrolled
content, mirroring the sticky frame) and excluded from every extent loop.
Parked as before: pane x-scroll is a no-op on canvas, editable overlays
inside `ignoreScroll` subtrees don't compensate, and an embedded canvas app
keeps its box realization.

## The hold-gated drag claim

`onHold` + the raw drag handlers on one view claim the finger **at the
hold** (the least-claim rule read precisely — the pair needs nothing until
the hold fires, and a hold requires a stationary finger, which never
competes with panning). Realization: such a view carries **no touch-action
claim** at touchdown (`refreshTouchAction` exempts it; canvas `claimAt`
likewise); when the router's hold fires with a touch finger down on a
dragging view, `input.ts` raises the module-level **hold capture**
(`holdCaptureActive`), and both backends' non-passive `touchmove` listeners
`preventDefault` exactly while it is up — the finger was stationary through
the hold, so no pan is latched to un-take. Cleared at pointerup/cancel.
Delivery is untouched: pre-hold the finger is still (nothing to deliver) or
the browser took it (`e.canceled`).

Found under this rung and fixed with it: the selection-anchor
`preventDefault` on `pointerdown` (a Safari **mouse**-drag fix) is now
mouse/pen only — Chrome cancels the whole touch sequence's default actions
on a canceled pointerdown (no pan ever, and `touchmove` stops dispatching),
while Safari ignores it. Touch ownership belongs to the claims on both
engines.

## Diagnostics

- `clip = false` on an App → error naming clipped-by-definition.
- `scrolls = true|false`, `scrollsX`, and the pre-rename spellings
  (`ignorelayout`/`ignoreclip`/`focustrap`) → errors naming the exact
  rewrite (check.ts RENAMED_ATTRIBUTES + the Scrolls enum carve-out).
- The `scrolls` value is a token **string** at runtime — `"none"` is truthy;
  the reference prose states the explicit-comparison idiom.

## Held true by

`test/gesture.test.mjs` — the page shape end to end on both backends
(document extent from content, cross-axis parked child adding nothing,
fixed chrome through a real page scroll, the pane's sticky frame, the canvas
strut + mirrored offset, the size-keyed root default, hold-gate engagement
and its quick-swipe control). `test/perceptual.test.mjs` — the canvas
shape pin (canvas + strut). `test/unit.test.mjs` — the enum/rename/clip
diagnostics, floors, and the router. The `/frame-clip` and `/frame-tall`
perceptual fixtures pin containment and exterior scrolling as before.
