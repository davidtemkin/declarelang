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
| `refreshTouchAction` (top-level root) | `manipulation` / `pinch-zoom` | the App's page-scrollability **fact** (realized box vs live viewport), never an attribute | pan stays with the user whenever the page has anywhere to go; double-tap zoom retires always (a painted UI never concedes it) |
| `refreshTouchAction` (embedded root) | `manipulation` | attachRoot's embedded fact (stamped — the element is not yet in the host when the attach-time refresh runs, so ancestry can't answer) | pan and pinch chain to the HOST page's regime; the geometry read is never consulted. **Fixed 2026-07-29** — the audit's motivating find |
| `applyScrollStyle` (pane) | `pan-x/pan-y pinch-zoom`, `overscroll-behavior: contain` | the `scrolls` axis declaration | delegates exactly the declared axes; pinch never claimed; contain keeps edge-bounce local by the keeps-to-its-frame ruling |
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
| touchstart | `preventDefault` iff `claimAt(...)` says touch | declared claims on the hit chain (hold-gated drags excluded) | per-gesture arbitration standing in for per-element CSS |
| touchmove | `preventDefault` for hold-capture, touch claim, or **single-finger** drag claim | declarations, as above | a second finger's pinch is explicitly left to the browser |
| wheel | `preventDefault` iff `wheelTo` claimed or `scrollBy` consumed | `onWheel` / `scrolls` declarations | consume-then-claim; unclaimed unconsumed wheels reach the page |

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
