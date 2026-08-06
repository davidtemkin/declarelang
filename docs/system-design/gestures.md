# Gestures — who owns them, and how the claim is realized

The language rule is one sentence (declare.md §8, guide ch. 12): **the browser
owns every gesture until a view claims one, and declaring the handler is the
claim** — a claim takes exactly what that handler needs in order to fire,
nothing more. There is no gesture-policy attribute; the handler is the policy.
This file is the renderer side of that sentence: what each claim compiles down
to, per backend, and the measured browser facts the design leans on. The
language docs never name these mechanisms (a `touch-action` in declare.md would
be a renderer leak); this is where they live. The complete audited inventory
of realization sites that can claim a gesture — and the rule new ones must
pass — is `claim-surface.md`.

The model is three rules:

1. **Size decides scrolling.** An App scrolls by default AS THE PAGE
   (`scrolls = y`; scrolling.md is the realization spec): content taller than
   the window, or a floored frame larger than it, makes the browser's own
   page scroll. An app whose content fits has nothing to scroll — the fixed
   window is that default, idle, never a declaration (Apps are clipped by
   definition; the boolean `clip` is absorbed).
2. **Claims by declaration.** Declaring a raw-family handler claims the
   matching gesture over that view and its subtree; everything unclaimed stays
   with the user.
3. **Browser-initiated zoom.** iOS's focus auto-zoom is left alone for ordinary
   apps (a compile warning names the 16px rule instead); an app with full
   gesture control gets it suspended while a field holds focus.

## The realization table (DOM backend)

Per-element `touch-action`, written by `dom-backend.ts refreshTouchAction` on
every `setInput`; CSS's own chain rule gives subtree coverage (an ancestor's
value is consulted for every touch that starts below it).

| declared | claims | user keeps | realized as |
|---|---|---|---|
| `onPointerMove` | single-finger drag | pinch-zoom | `touch-action: pinch-zoom` |
| `onHold` + drag handlers | the drag, FROM THE HOLD | pan until the hold; pinch always | no touch-action; hold-capture + non-passive touchmove (scrolling.md) |
| `onTouchStart/Move/End/Cancel` | every finger | nothing (app owes its own zoom) | `touch-action: none` |
| `onWheel` | wheel + trackpad pinch | ⌘ +/− only | non-passive `wheel` listener + `preventDefault` |
| `onDblClick` | double tap | pan + pinch | nothing extra — the root default already retires double-tap zoom |
| App, page scrollable | — | pan + pinch | root `touch-action: manipulation` |
| App, nothing to scroll | — | pinch | root `touch-action: pinch-zoom` |
| a `scrolls` pane | — (delegates) | declared-axis pan + pinch | `touch-action: pan-x/pan-y (per axis) pinch-zoom` |
| a native editable | — | everything | `touch-action: auto` |

The root rows key on the App's REACTIVE page-scrollability fact (geometry —
content overflow on a declared axis, or a floored frame beyond the host;
`bindPageScroll` → `setPageScrollable`), never on any attribute: the same app
is pannable on a phone and fixed on a desktop, and the default follows.

Notes, each load-bearing:

- **This rung REPEALED a policy.** The root used to set `touch-action: none`
  unconditionally — no Declare app could be pinch-zoomed, by anyone. The root
  defaults above give pan back to browser-scrolled apps and pinch back to all
  of them. Double-tap zoom is the one gesture a painted UI never concedes: two
  quick taps on a control must not lurch the page (both root values retire it,
  and `manipulation` also kills the legacy 300 ms tap delay).
- **`pinch-zoom` on a drag claimant is the MINIMUM suppression** for
  `onPointerMove` to fire at all on touch — without it the browser pans and
  cancels the pointer stream. It is not a policy choice stacked on the claim;
  it *is* the claim.
- **The scroller value changed** from `pan-y` (which silently forbade pinch —
  a claim nobody made) to `pan-y pinch-zoom`.
- **The wheel listener arbitrates nearest-wins, delegation-beats-claim**: a
  wheel bubbling up from an intervening `scrolls` pane, a nearer `onWheel`
  view, an editable, or an island is left alone. Payload: view-local `x`/`y`
  (the positional rule of `onPointerDown`), `deltaX`/`deltaY`, and `pinch` — a
  trackpad pinch arrives as a ctrlKey wheel, and a mouse user's ctrl+wheel
  zoom reports the same way.

## The canvas backend — same contract, one element

One shared `<canvas>` cannot carry per-subtree CSS, so (`canvas-backend.ts`):

- the root default rides the canvas element (`rootTouchAction()` — same table);
- per-view claims are arbitrated **per gesture**: at `touchstart` the first
  finger's landing point is hit-tested and the claims of the view under it and
  its ancestors are unioned (`claimAt` — a claim covers its subtree; a
  hold-gated view counts as no drag claim at touchdown); a touch claim
  suppresses at `touchstart`, a drag claim suppresses single-finger
  `touchmove` only, so a second finger's pinch stays the browser's — and a
  live hold-capture suppresses regardless (the hold-gated claim's engaged
  half, scrolling.md);
- wheels route by positional descent (`wheelTo`, the same walk as `scrollBy` —
  NOT the hit chain, because a scroller has no input sink and the hit walk
  would step straight past it): nearest `onWheel` view wins unless a scrolling
  pane sits nearer the pointer.

## The focus-zoom lock (`viewport-lock.ts`)

iOS zooms the page toward a focused field whose text is under 16px — factor =
16 ÷ fontSize, measured — and back on blur. Ordinary apps keep that behavior;
the compiler flags the field instead (DECLARE3005, a warning: literal-derived
sizes only, main source only, exempt when the App claims the raw touch family).
An app with **full gesture control** (raw touch on the App) gets the runtime
treatment: while an editable inside it holds focus, the viewport meta is
rewritten live to carry `maximum-scale=1`, and restored on blur. Top-level
apps only — an embedded island never rewrites its host page's viewport.

## Measured browser facts (2026-07-27 — durable, do not re-derive)

Chrome via real two-finger `Input.dispatchTouchEvent`; iOS 18.2 Simulator
driven by hand, logged in `tools/internal/measure/results.jsonl`.

- **The `touch-action` asymmetry holds on BOTH engines.** *Scrolling*: an
  ancestor's `none` does not block a nested scroll container — the walk stops
  at the container handling the gesture, so islands keep their own scrolling.
  *Pinch-zoom*: an ancestor's `none` blocks it and **no descendant can restore
  it** (viewport-handled; the whole chain is consulted). The one-way ratchet is
  why the guide says a child cannot hand a claimed gesture back — and why a
  restatable gesture attribute was rejected: it would promise a release the
  renderer cannot deliver.
- **iOS focus auto-zoom factor = 16 ÷ fontSize** (an 11px field zooms ×1.455;
  at 16px, ×1.0), transient — blur returns to 1.0 by itself.
- **`maximum-scale=1` suppresses the focus auto-zoom, and rewriting the
  viewport meta works live**, no reload.
- **The user's own pinch SURVIVES `maximum-scale=1`** — under the lock, focus
  zoom stayed pinned at 1.0 (keyboard confirmed up) while a deliberate pinch
  broke through to 1.51. The lock stills the zoom nobody asked for and never
  disarms the user. (Quirk: iOS eats the first small pinch attempts under the
  lock.)
- **A desktop trackpad pinch arrives as `wheel` with `ctrlKey: true`. ⌘ +/−
  dispatches no event** and cannot be intercepted by anyone, in Declare or raw
  JS — the honesty line the guide states next to full gesture control.
- **iOS's pan latch eats spreads whose first finger moves before the second
  lands** (measured on iPad, 2026-07-28, six-for-six in the session logs): the
  first finger crosses Safari's slop in ~12–26 ms, a `pointercancel` marks the
  commit to scrolling, and a second finger arriving after the commit is
  absorbed into the scroll — never dispatched, no recognizer, no zoom. A
  spread is recognized only when both fingers land before the pan commits
  (every success in the logs: second finger within 8–66 ms, no pointercancel
  between). Independent of touch-action (observed under `pan-y pinch-zoom`
  AND `auto`, three sessions).
- **CONFIRMED by controlled A/B (2026-07-28, `tools/internal/measure/`
  latch-doc vs latch-pane, ~100 labeled gestures): a DOCUMENT scroll upgrades
  to pinch-zoom mid-gesture; an OVERFLOW pane never does.** A spread whose
  second finger lands after the pan commit (123–700 ms late, 11–60 px of drag)
  zoomed every time on the document and 0-for-5 on the pane — with both
  fingers dispatched and `gesturestart` fired: the recognizer runs and then
  refuses to hand a latched pane-scroll to the viewport zoom. Clean-landed
  spreads (both fingers within ~50 ms) zoom on both, though only the pane
  ever refused one. Touch-action irrelevant throughout. Separate and global:
  a spread landing on a DECELERATING scroll is eaten on both page shapes
  (the touch becomes the scroll-stopper; the second finger is absorbed).
  **Design rule: a touch-first surface should prefer EXTERIOR scrolling
  (Rule 1 — app taller than host, the browser scrolls the document) over a
  full-height inner pane; the pane forfeits the scroll→pinch upgrade.**
- **iOS pinch-zoom has inertia** — finger scale ~1.05 can coast the viewport
  to 1.5–1.8 (and back to 1.0 on a small pinch-in). Not a bug anywhere; it
  reads as "overshoot" in logs and to users.
- **iOS Safari restores a page's zoom+pan per tab across reloads** (see the
  restoration entry above) — sessions can begin zoomed.
- **On iOS/iPadOS, `window.innerWidth/innerHeight` track the VISUAL viewport,
  and a pinch-zoom fires `resize`** (measured on iPad, 2026-07-28). A top-level
  app's `hostWidth`/`hostHeight` therefore come from the layout viewport —
  `documentElement.clientWidth/clientHeight`, stable under pinch (boot.ts
  wireEnvironment). Sizing from `inner*` re-laid the app out under the user's
  fingers at the zoomed size, and the mid-gesture re-layout kept canceling the
  zoom itself.
- **iOS Safari RESTORES the previous visit's pinch zoom asynchronously after
  load** (measured: scale 1 at `load`, snapped to the prior session's 1.87
  ~40 ms later, zero touches) — a page can simply *begin* zoomed. Not ours to
  fight; the entry below is what makes that state livable.
- **While pinch-zoomed, iOS implements viewport panning as scroll chaining —
  so a full-height scroller with `overscroll-behavior: contain` makes the
  app's bottom band unreachable at any zoom > 1** (the pane eats the pan,
  `contain` cuts the chain at its edge, and content below the visual viewport
  shows only during the elastic stretch; measured — the scroller's extent
  itself was byte-exact). The runtime therefore relaxes every scroller's
  containment and touch-action exactly while `visualViewport.scale > 1.02`,
  via a document-level class (dom-backend watchPinchZoom); at scale 1 the
  contain semantics return untouched.

- **iOS sends NO cancel of any kind when an interior pane takes a live
  gesture** (measured 2026-08-06, iPhone 16 Pro sim / iOS 18.2, Appium
  XCUITest + `?probe`, `tools/internal/sim/touchlab.declare`): a flick
  starting on a hold-gated draggable inside a `scrolls = y` pane began
  native panning ~170 ms in, **with the finger still down — and the page got
  no `pointercancel`, no `touchcancel`, then a CLEAN `pointerup` at lift**
  (probe listens for both; zero across the session). Chrome announces the
  same takeover with `pointercancel`, which is what the `e.canceled` contract
  rode on — so on iOS the contract silently failed. The takeover fact is
  still observable: a scroll event arriving from a container of the pressed
  element while a finger's press is live and unclaimed. input.ts's
  scroll-takeover detector synthesizes the canceled release from exactly that
  fact and swallows the finger's trailing clean `pointerup`; validated
  closed-loop on the simulator (the same flick now reaches the chip as
  `e.canceled`). The rest of the contract measured true on the same rig: the
  hold-gated claim's post-hold drag kept the pane still (holdCapture's
  non-passive touchmove preventDefault holds on real WebKit), and a
  two-finger spread with staggered lifts on a full-claim app delivered
  balanced books — starts == ends, `down` back to 0, `visualViewport.scale`
  pinned at 1.0.
- **A long-press on app background (the gaps between views) started iOS text
  selection** — FIXED 2026-08-06 (David's selection-edges ruling): the page
  baseline is now an inherited `user-select: none` on `<html>`, and stamped
  selectable leaves wear explicit `text` (the subtractive clause AMENDED —
  the stamp remains the fact input.ts reads). Inside a selectable region the
  normal-page mechanics stand whole: native anchoring, native painting,
  document-order ranges, cross-block sweeps; outside, painted UI offers the
  long-press nothing. Phase 2 (recorded, not built): a press on the gaps
  BETWEEN blocks inside a `selectable = true` container should anchor like a
  normal page — needs a container-level realization (surface method + seam
  rows); rides the next selection touch.

- **SOLVED iOS BUG (2026-08-06, found on the homepage, sim iOS 18.2): a pan
  starting on a freshly-stamped selectable leaf was REFUSED outright.**
  WebKit received the full unprevented touch stream (verified: 15 touchmoves,
  none defaultPrevented, no pointercancel) and simply never scrolled — and
  never selected either. Effective touch-action was `manipulation` along the
  verified chain. MECHANISM: WebKit paints its touch EventRegions (the
  selectability bit included) per composited layer at paint time, and iOS's
  text-interaction recognizers arbitrate every touch-down against that
  snapshot; a leaf stamped selectable while boot is still laying text out
  gets its region painted at pre-settle geometry, and the pan recognizer
  then waits forever on a text gesture that never resolves. Pinned by: a
  static transplant of the identical DOM+CSS panning fine; a same-node
  detach/reinsert (same listeners, same observers) curing it permanently;
  any later repaint of the leaf (one-frame visibility toggle, or a
  user-select none→default flip) curing it equally. Exonerated on the way,
  so nobody re-walks the hunt: touch-action, gradient-ink spans and sibling
  structure (both layout-shift artifacts — ALWAYS re-verify the press point
  with elementFromPoint before believing a pan result), stylesheets,
  editables, video, canvas, fixed chrome, every listener class (census DIAG
  now in probe.js: ?skiptype/?noptr/?noio/?noro/?forcepassivewheel), and
  Intersection/ResizeObserver. "What changed": the subtractive selection
  realization (c6feb60) made selectable leaves pointer-hittable — before it
  text was pointer-events:none, presses fell through to body, and the
  arbitration path never engaged (production, which predates nothing —
  measured equally dead — confirmed the trigger is that realization, not a
  recent commit). External corroboration: WebKit Bug 183870 (pointer-events
  none/auto nesting breaks iOS scroll arbitration, open since 2018) and the
  acknowledged stale-EventRegion bug class (overlay regions stuck; Twitch
  fix 261950). THE FIX (dom-backend refreshSelectableRegion): a selectable
  leaf is stamped wearing inline `user-select: none`, cleared two frames
  later, coalesced page-wide — clearing the property forces WebKit to
  rebuild the region at settled geometry. Selection is merely unavailable
  for two frames after a leaf appears; the subtractive at-rest invariant
  (no explicit user-select on selectable leaves) still holds. Validated
  closed-loop: homepage paragraph and 40px hero headline both pan on the
  sim; long-press selection on flow content still selects.
- **The page-tier takeover DOES announce itself**: during document scrolls
  the probe heard `ts → pointercancel → te` (the working homepage pans) —
  unlike the interior-pane tier, which cancels nothing (the entry above).
  The scroll-takeover detector covers both tiers regardless; on the page
  tier it merely beats the pointercancel that was coming anyway.
- **iOS smart-zoom ignores `touch-action: manipulation` — root AND element**
  (measured: double-tap zoomed to 1.6 with both set). What the heuristic
  consults is whether the tap lands on/under an element with a CLICK
  LISTENER — and Declare wires input at the window, so every element read
  as dead content and the whole painted UI conceded double-tap zoom on iOS.
  attachRoot now registers a no-op click listener on the app root: measured
  on the homepage — dblClick delivered at scale 1, a click-only view's
  double tap becomes two clicks (no zoom), the user's pinch survives
  (2.63), and a tap on selectable text places only a caret.

Measurement lore, so nobody repeats the lost hours: WebDriver/safaridriver
cannot measure focus zoom (the software keyboard never rises under automation,
and a live safaridriver process keeps suppressing it even after its session
ends — kill it before manual testing). CDP's `Input.synthesizePinchGesture`
ignores `touch-action` entirely (compositor-level); use two-finger
`dispatchTouchEvent`, which respects the real pipeline. What worked: permutation
pages + a beacon server (`tools/internal/measure/`), a human driving the
Simulator (⌥-drag pinches; Hardware-Keyboard-Connect must be OFF or focus zoom
never fires).

## Held true by

`test/gesture.test.mjs` — both backends in a real browser: the realization
table's values, the repeal, the clip↔root-default coupling, wheel delivery and
its arbitration, canvas per-gesture claims, the lock/release cycle of the
viewport rewrite, and the scroll-takeover detector (synthesis, trailing-up
swallow, mouse immunity, containment — Chrome replaying iOS's event order).
The 16px warning is pinned in `test/unit.test.mjs`. The iOS ground truth
itself is DELIBERATELY not part of routine gates (David, 2026-08-06 — a booted
simulator is too heavy to demand per-commit): run-gates instead prints an
advisory when the touch-input sources have moved since the last green stamped
run (.derive/ios-regress.json — regress.mjs stamps it on 23/23). Re-runnable
any time as ONE command: `tools/internal/sim/regress.mjs`
— 23 checks covering every contract above (the labs plus the homepage pack:
text pans, pinned navbar, double-tap, link navigation), run twice green
2026-08-06 against iOS 18.2; drive.mjs's header has the session recipe, and
regress.mjs's header records the synthesis quirks (humanized double-taps, the
clearing tap after holds) that cost hours to learn.
