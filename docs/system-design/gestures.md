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
