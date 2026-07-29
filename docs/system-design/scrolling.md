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
