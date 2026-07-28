# Gestures — who owns them, and how the claim is realized

The language rule is one sentence (declare.md §8, guide ch. 12): **the browser
owns every gesture until a view claims one, and declaring the handler is the
claim** — a claim takes exactly what that handler needs in order to fire,
nothing more. There is no gesture-policy attribute; the handler is the policy.
This file is the renderer side of that sentence: what each claim compiles down
to, per backend, and the measured browser facts the design leans on. The
language docs never name these mechanisms (a `touch-action` in declare.md would
be a renderer leak); this is where they live.

The model is three rules:

1. **Size decides scrolling.** An app larger than its host scrolls natively —
   the browser over the app object ("exterior" scrolling). `clip = true` on the
   App is the fixed-window opt-in (containment, dom-backend `setBoxClip`).
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
| `onMouseMove` | single-finger drag | pinch-zoom | `touch-action: pinch-zoom` |
| `onTouchStart/Move/End/Cancel` | every finger | nothing (app owes its own zoom) | `touch-action: none` |
| `onWheel` | wheel + trackpad pinch | ⌘ +/− only | non-passive `wheel` listener + `preventDefault` |
| `onDblClick` | double tap | pan + pinch | nothing extra — the root default already retires double-tap zoom |
| App, `clip = true` | — | pinch | root `touch-action: pinch-zoom` |
| App, unclipped | — | pan + pinch | root `touch-action: manipulation` |
| a `scrolls` pane | — (delegates) | pan + pinch | `touch-action: pan-y pinch-zoom` |
| a native editable | — | everything | `touch-action: auto` |

Notes, each load-bearing:

- **This rung REPEALED a policy.** The root used to set `touch-action: none`
  unconditionally — no Declare app could be pinch-zoomed, by anyone. The root
  defaults above give pan back to browser-scrolled apps and pinch back to all
  of them. Double-tap zoom is the one gesture a painted UI never concedes: two
  quick taps on a control must not lurch the page (both root values retire it,
  and `manipulation` also kills the legacy 300 ms tap delay).
- **`pinch-zoom` on a drag claimant is the MINIMUM suppression** for
  `onMouseMove` to fire at all on touch — without it the browser pans and
  cancels the pointer stream. It is not a policy choice stacked on the claim;
  it *is* the claim.
- **The scroller value changed** from `pan-y` (which silently forbade pinch —
  a claim nobody made) to `pan-y pinch-zoom`.
- **The wheel listener arbitrates nearest-wins, delegation-beats-claim**: a
  wheel bubbling up from an intervening `scrolls` pane, a nearer `onWheel`
  view, an editable, or an island is left alone. Payload: view-local `x`/`y`
  (the positional rule of `onMouseDown`), `deltaX`/`deltaY`, and `pinch` — a
  trackpad pinch arrives as a ctrlKey wheel, and a mouse user's ctrl+wheel
  zoom reports the same way.

## The canvas backend — same contract, one element

One shared `<canvas>` cannot carry per-subtree CSS, so (`canvas-backend.ts`):

- the root default rides the canvas element (`rootTouchAction()` — same table);
- per-view claims are arbitrated **per gesture**: at `touchstart` the first
  finger's landing point is hit-tested and the claims of the view under it and
  its ancestors are unioned (`claimAt` — a claim covers its subtree); a touch
  claim suppresses at `touchstart`, a drag claim suppresses single-finger
  `touchmove` only, so a second finger's pinch stays the browser's;
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
its arbitration, canvas per-gesture claims, and the lock/release cycle of the
viewport rewrite. The 16px warning is pinned in `test/unit.test.mjs`.
