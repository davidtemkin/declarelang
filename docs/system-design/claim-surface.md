# The claim surface — every site that can take a gesture, audited

The touch bugs of 2026-07 were one bug wearing different clothes: **a local
realization claimed a gesture that belonged to an enclosing regime.** On
touch, ownership is hierarchical and the browser arbitrates it with
mid-gesture handoffs (gestures.md, the measured facts); any eager claim at a
leaf — a CSS property, a `preventDefault`, a selection attribute — severs the
outer tier. The fix each time moved the same direction: claim less, later,
more locally. This file makes that direction a standing rule and audits every
site against it, so the next claim is checked at review time instead of found
on a device.

> **The rule.** No realization may claim a finger unless the claim derives
> from a declaration; every default defers to the enclosing regime. A claim
> may engage *late* (the hold gate) and must *release* when a measured fact
> says the outer tier needs the finger back (the zoomed-containment
> relaxation). Consume-then-claim beats claim-then-consume wherever the
> platform allows asking first.

The claim surface is finite: writes of `touch-action`, `user-select`,
`overscroll-behavior`, the viewport meta, and `preventDefault` on
pointer/touch/wheel streams. (`pointer-events` is *targeting*, not gesture
arbitration — it decides who hears an event, never what the browser does
with the finger — and keyboard `preventDefault` in keys.ts is another
modality.) Everything below is the complete inventory as of 2026-07-29.

## DOM backend

| site | writes | derives from | deference |
|---|---|---|---|
| `refreshTouchAction` | `none` | the raw touch family declared on the view (full gesture control) | the strongest claim there is — and it exists only by declaration |
| `refreshTouchAction` | `pinch-zoom` | drag handlers declared without `onHold` | second finger's pinch stays the user's; with `onHold` the claim vanishes here and engages at the hold instead |
| `refreshTouchAction` | `pan-x pan-y` | the onPinch family declared on the view (compositing.md §II.2, 2026-08-06) | the RECOGNIZED two-finger gesture is the app's; single-finger pan stays the enclosing regime's — the same narrowing `claim = x` performs for drags. Composed with an unheld drag claim: the drag keeps its pan axis, the pinch retires pinch-zoom, and the written value is the cross-axis pan (`pan-y` / `pan-x`) or `none` |
| `refreshTouchAction` (top-level root) | `manipulation` / `pinch-zoom` | the App's page-scrollability **fact** (realized box vs live viewport), never an attribute | pan stays with the user whenever the page has anywhere to go; double-tap zoom retires always (a painted UI never concedes it) |
| `refreshTouchAction` (embedded root) | `manipulation` | attachRoot's embedded fact (stamped — the element is not yet in the host when the attach-time refresh runs, so ancestry can't answer) | pan and pinch chain to the HOST page's regime; the geometry read is never consulted. **Fixed 2026-07-29** — the audit's motivating find |
| `applyScrollStyle` (pane) | `manipulation`, `overscroll-behavior-<axis>: contain` on the declared axes only | the `scrolls` axis declaration | **the cross axis belongs to the enclosing regime (ruled 2026-07-31).** A pane declares which axis IT scrolls, never that the other is forbidden — but both properties were written as if the declared axis were the only one. `pan-<axis> pinch-zoom` forbade panning on the undeclared axis outright (measured: a `scrolls = y` Files column inside an 800px desktop stage on a 402px phone forbade the horizontal pan that was the only way to reach the rest of the stage — the same mistake this row's old note already named for pinch, "a claim nobody made"), and blanket `contain` severed chaining on an axis the pane has no scroll of its own to contain. Now: both pans delegated, so the browser routes each axis to the nearest ancestor that scrolls it; containment stays exactly where the keeps-to-its-frame ruling applies. Double-tap zoom stays retired, matching the root |
| `watchPinchZoom` rule | `touch-action:auto; overscroll-behavior:auto` on panes while zoomed | the measured iOS chain trap (a contained pane strands a zoomed viewport) | a pure **release** — claims stand down while the outer tier (viewport panning) needs the finger |
| `attachRoot` | *(no `user-select` at all)* | the subtractive realization (ruled 2026-07-30, superseding the COARSE stance): selection is realized at the LEAVES, so the root has nothing to claim | the root's one write is `-webkit-tap-highlight-color: transparent` — feedback, not gesture arbitration (a painted UI draws its own `pressed`), listed for completeness |
| `setTextStyle` / `setRichContent` | `user-select: none` on exactly the text leaves whose **effective** `selectable` is false; selectable leaves get NO explicit value plus the `data-declare-selectable` stamp | the `selectable` declaration (prevailing; the RichText family carries a species default of true, vetoable by any provision) | `text` is **never written on painted content**, so the iOS pan-theft shape (a `text` island inside a `none` page) is unconstructible — which is what retired the per-pointer-kind split: one realization, both pointer kinds, and `selectable` governs touch at last |
| `setInput` (drag views) | `user-select: none`, `-webkit-touch-callout: none` on the view | the declared drag pair (immediate or hold-gated) | the platform's long-press-over-text defaults fire on the same stationary press as the hold and win the race (measured: a title-bar hold-drag became a 570-char selection, simulator 2026-07-29) — the claim suppresses them on exactly the claiming element. `user-select` inherits, so the claim covers the drag view's SUBTREE: selectable content under a drag view yields to the declared drag, by design |
| `setEmbed` (island box) | *(no selection write)* | the subtractive realization: boxes are never written, so an island's interior selects by platform default with nothing to opt back out of | the `pointer-events` opt-in stays (targeting) |
| `setEditable` overlay | `user-select: text`, `touch-action: auto` | the `editable` declaration | a **release** — inside a declared field the browser owns everything (caret, loupe, field scroll) |
| `attachRoot` | `overscroll-behavior-x: none` on html/body (top-level only) | a horizontal swipe at the page's edge otherwise becomes the browser's **history navigation**, which destroys the running app | deliberate exception, x only, page level only: the one browser gesture whose default action is losing the app. Cost accepted: no x edge-bounce. Vertical rubber-band untouched |
| wheel listener (`onWheel`) | `preventDefault` after delivery | the `onWheel` declaration | the delegation walk defers first: an intervening native scroller, island, editable, or nearer claim keeps its wheel |
| `wheelXListener` | `preventDefault` **iff consumed** | `scrollX` mirroring | consume-then-claim: the pane must have actually moved |
| `holdGateListener` (touchmove) | `preventDefault` while hold-capture is live | `onHold` + drag pair | claims nothing at touchdown; the finger was stationary through the hold, so no pan was latched |
| rich-content link click | `preventDefault` on plain left-click | link activation | modified clicks and non-primary buttons pass through; not a gesture site |
| input.ts selection anchor | `preventDefault` on pointerdown | painted-UI mouse-drag fact | **mouse/pen only** (Chrome cancels the whole touch sequence otherwise — fixed 2026-07-29); stands down on editables and on `data-declare-selectable` content (the realization's stamp — under the subtractive realization selectable text wears no explicit `user-select`, so the stamp, not a computed-style probe, is the fact) |
| viewport-lock | `maximum-scale=1` while an editable holds focus | the raw touch family on the App (full gesture control) + the measured 16px focus-zoom fact | top-level apps only; restored on blur; the one meta write in the system |

## Canvas backend

| site | writes | derives from | deference |
|---|---|---|---|
| `attach` | canvas `user-select: none` | a canvas has no text nodes — nothing for a selection gesture to bind to | editable overlays opt back in; no COARSE hazard (the iOS quirk needs selectable content) |
| `rootTouchAction` | same three root defaults + embedded `manipulation` | mirrors `refreshTouchAction` exactly, one shared element | same deference table; embedded fact stored at attach |
| touchstart | `preventDefault` iff `claimAt(...)` says touch — or says **pinch** with two fingers down | declared claims on the hit chain (hold-gated drags excluded; the onPinch family joins 2026-08-06) | per-gesture arbitration standing in for per-element CSS; the pinch claim engages at the SECOND finger, so one finger stays the enclosing regime's pan — the canvas twin of `pan-x pan-y` |
| touchmove | `preventDefault` for hold-capture, touch claim, **two-finger pinch claim**, or **single-finger** drag claim | declarations, as above | an unclaimed second finger's pinch is explicitly left to the browser |
| wheel | `preventDefault` iff `wheelTo` claimed or `scrollBy` consumed | `onWheel` / `scrolls` declarations | consume-then-claim; unclaimed unconsumed wheels reach the page |

## Mac host (2026-08-07)

The native host has no browser to defer to, so its claim surface has no CSS
writes and no `preventDefault` — there is no enclosing regime beyond the
window. What it must still honor is the DELIVERY contract: the same wheel
walk, the same pinch spelling, so a program hears one stream on all three
renderers. The conformance oracle, not `gesture.test.mjs`, holds these rows
(the wheel-claim probe's three cases run three-way).

| site | routes | derives from | deference |
|---|---|---|---|
| `scrollWheel` (App.swift) | `__declareWheel(x, y, dx, dy, pinch)` — pinch iff ctrl is held (the browser's own trackpad-pinch spelling, kept deliberately) | the `onWheel` / `scrolls` declarations, consulted by the walk on the far side | `MacSurface.wheelTo` mirrors the canvas walk exactly: a nearer scroller beats a farther claimant, rotated subtrees inverted, pinned chrome (`ignoresScroll`, retained JS-side for this walk) read in frame coordinates. Unclaimed wheels fall back to the scroller walk (`scrollBy`/`scrollByX`) |
| `magnify(with:)` (App.swift) | `__declareWheel(x, y, 0, -magnification × 100, 1)` — a trackpad pinch IS a wheel with the `pinch` flag, zoom-in negative, scaled to Chrome's per-event range | the same declarations; no separate pinch channel exists to diverge | nothing native consumes magnification first; an unclaimed pinch simply does nothing, exactly as an unclaimed ctrl+wheel does in a painted browser UI |
| ctl `scroll` verb (Control.swift) | `__declareWheel` with an optional 5th arg = pinch | the conformance driver's scroll step | the test transport rides the production path — the verb proves the walk, not a parallel one |

## Standing contracts (the residue the audit can't close)

- **Embedding is a marked channel.** The embedded fact reads
  `data-declare-app` / `data-declare-embed` ancestry. The sanctioned paths
  (AppIsland → DOMIsland, boot.ts `isEmbedded`) stamp it. A raw `render()`
  into an unmarked div of a foreign scrolling page will read as top-level and
  claim the geometry default — out of contract, by design.
- **The COARSE stance is superseded (2026-07-30) by the subtractive
  realization, which keeps its promise by construction.** The old stance
  ("touch stays at web defaults, `selectable` governs fine pointers only")
  existed because the additive realization needed `text` islands and iOS
  punishes them. The subtractive realization never writes `text` on painted
  content at all — `none` on unselectable text leaves is its ONLY selection
  write — so the pan-theft shape cannot be built, `selectable` governs both
  pointer kinds, and there is no per-pointer split left to defend. The
  invariant to hold at review time is now: **no realization writes
  `user-select: text` on painted content, and no realization writes any
  `user-select` on a box.** (setEditable's `text` on a NATIVE editable
  element is the one standing exception: already a text-interaction surface
  to the platform, no island semantics.)
- **New claims enter through this file.** A change that writes any property
  in the inventory above — or adds a non-passive pointer/touch/wheel
  listener — adds a row here and a pin in `test/gesture.test.mjs`, or it
  doesn't merge.

## The axis-scoped drag claim — RULED 2026-07-30 (D8), LANDED same day

The forcing cases are the DataGrid header drag and edge-resize on touch
(component-briefs.md §5; Tracker acceptance criterion 13): a horizontal
column drag must own the finger's x while the page keeps vertical pan —
today's drag pair claims the whole gesture (`pinch-zoom`), which steals the
scroll.

**Spelling: `claim = x | y | both` on the drag-declaring view.** Default
`both` — exactly today's semantics, so nothing existing changes. The claim
stays derived from a declaration (the rule above): `claim` scopes a drag
pair that is already declared; it never creates one.

| site | writes | derives from | deference |
|---|---|---|---|
| `refreshTouchAction` (drag pair + `claim = x`) | `pan-y pinch-zoom` | the declared drag pair, scoped by the declared axis | the CROSS axis stays the enclosing regime's — the browser's own arbitration runs it natively (a mostly-vertical finger pans the page; a mostly-horizontal one is ours). Composes with `onHold` unchanged (the hold engages the scoped claim) |
| canvas touchmove | `preventDefault` iff the drag claim's axis matches the gesture's dominant axis (the slope test the hold gate already practices) | same declaration | mirrors the DOM's native arbitration; second finger's pinch stays the browser's, as ever |

Landed: the `claim` enum on View (schema.ts), `claimAxis` on InputWants,
the DOM realization in `refreshTouchAction` (`pan-y pinch-zoom` for
`claim = x`), the canvas dominant-axis latch in its touchmove arbitration
(decide once per gesture at ≥4px of travel, then hold — the one-way rule
every claim follows), and the pin in `test/gesture.test.mjs` ("the
AXIS-SCOPED claim keeps vertical pan").

## The iOS rule for new claims — RULED 2026-08-06 (David)

**Any change to input declarations or gesture claims requires iOS-simulator
validation and a regression case.** Headless Chrome replays what a spec says a
browser does; iOS does what iOS does (the 2026-08-06 session found the missing
pane-tier cancel, the ignored `touch-action: manipulation`, and the stale
EventRegion this way — none visible in emulation). Mechanism, not memory: the
rig is `tools/internal/sim/` (drive.mjs header has the session recipe), the
suite is `regress.mjs` — extend it with a case for the new claim, run it green
(23+ checks), and its stamp quiets the run-gates advisory that fires whenever
the touch-input sources move.

## Held true by

`test/gesture.test.mjs`: the claims table per view (none / pinch-zoom /
delegation), both root defaults and the geometry flip, the embedded-island
default (both backends), hold-gate engagement + quick-swipe control (which
also pins the touch-exempt selection anchor — an unscoped preventDefault
kills the touch sequence on Chrome and fails it), the zoomed-containment
release, the subtractive selection realization (leaf `none` / stamp / never
`text` / the RichText species default and its veto), the scroll-aware hit
walk (page scroll, pane scroll, ignoreScroll chrome, the viewAt content-space
contract), and the focus-zoom lock. `test/unit.test.mjs` pins the same walk
headlessly, including scroll-under-a-stationary-pointer as a dependency.
