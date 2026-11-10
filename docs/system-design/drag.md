# Drag as a resolved gesture — a proposal

**Status: PROPOSAL, revision 10, REVIEWED CLEAN (tenth review, 2026-11-09; its should-fixes applied). Nothing built; awaiting the user's decision to build.**
The user's direction: "The resolved event sounds like the right path" (2026-11-08); "this is
worth trying. I think it's right at least" — provided it is clean, consistent with the
model, and removes no control (2026-11-09); a clean review before building; and no treatment
that "looks like a drag" and is then taken back. Revisions 2–10 answer nine reviews (§11).

## 1. The bug that raised it

`onPointerMove` does not fire on hover; the runtime drops moves while nothing is pressed
(`runtime/src/input.ts:651`). Everything else says it does:

- the reference: "the pointer moved over the view — and, once pressed on it, every move while
  captured" (`tools/internal/doc/prose/View.md`, `onPointerMove`);
- App's reference: `app.pointerX` is "present even between elements, unlike a view's
  `pointerMove` (which needs the pointer over it)" (`App.md:57`);
- the docs' own demo, `apps/docs/demos/form-handler.declare`, which shows "pointer at x, y"
  from a pad's `onPointerMove` on hover — and shows nothing today until the pad is pressed;
- the 7GUIs run's Circle Drawer, which tracked hover with it and never selected a circle.

The runtime is the outlier. It is not simply corrected because declaring `onPointerMove` is
today how a view says *I drag*, and every drag in the corpus assumes moves arrive only while
pressed. The window's title bar:

```declare-fragment
onPointerMove(e: PointerEvent) { classroot._moveBy(e.deltaX, e.deltaY) },
```

delivered on hover, would move the window under a passing pointer. Making the event mean
what it says is a breaking change however it is done; this proposal makes it once, with names
that say what they mean.

Position as state stays as it is: `app.pointerX`/`pointerY` follow the pointer everywhere, in
viewport space, for a constraint to read. `onPointerMove` is the event, in the view's own
coordinates, for a handler.

## 2. What `onPointerMove` carries today

Declaring it is how a view says *I drag* (`view.ts:1979-1986`: `drags = typeof
self.onPointerMove === "function"`), and the runtime hangs drag behaviour on that fact:

- **the claim**: on touch, a finger moving on the view is the view's, not a scroller's
  (`wantsDrag`, realized as touch-action in the DOM backend and by `claimAt` in the canvas
  backend); with `onHold`, only after a hold; `claim = x | y` keeps the other axis scrolling;
- **capture**: moves and the release keep coming outside the view until release;
- **handoff**: a press on a child that does not drag is handed to the nearest ancestor that
  does — a finger or pen once it travels past the threshold, a mouse once it leaves the
  control; not when the press began on selectable text (a mouse's drag selects), not across
  the owner's axis (`input.ts:323-350`). The owner hears a synthesized `onPointerDown`, the
  child a canceled `onPointerUp`;
- **the home freeze** (`$pressHome`, `$freezeHome`): the view's place is held for the drag;
- **autoscroll** (`drag-autoscroll.ts`): near the edge of the dragged view's nearest scroller,
  the scroller moves and the move is heard again each frame;
- **the payload**: `deltaX`/`deltaY` since the press, `rootX`/`rootY` (`view.ts:265`,
  `pointerPayload`; `compiler/src/scaffold.ts` declares the type).

A raw event's name carries a resolved gesture's meaning. The guide's model says otherwise:
raw events are *what the pointer did*; resolved ones (`onClick`, `onDblClick`, `onHold`) are
*what the person meant*, judged over the gesture.

## 3. The model

A drag is not a kind of input. It is a view's response to a press that moves (a press-drag)
or to a press held still and then moved (a long-press-drag). **A press is a click or a drag,
never both, and never first one and then the other**: nothing is reported as a drag until it
is one, so nothing that looked like a drag is ever taken back.

**How it looks is the app's.** The runtime decides that a press has become a drag, reports
where the pointer has gone, captures it, and scrolls a pane at its edge. Everything drawn — a
lifted item, a ghost left behind, a copy that moves only to places it can be dropped — is the
program's, from the three events. Apple Calendar on the Mac (observed 2026-11-09) is such a
drag: nothing moves for the first 6–10 px; then a faded ghost stays in the original slot while
a solid copy moves in 15-minute steps and whole days, its time label following; release
commits. In Declare that is `onDragStart` drawing the ghost, `onDrag` snapping
(`slot = Math.round((startY + e.deltaY) / quarter)`), `onDragEnd` committing or, if
`e.canceled`, removing the ghost.

**The claim.** With a mouse, a press-and-move is unambiguous: scrolling comes from the wheel
or trackpad. On a touch screen — and with a pen where the platform pans with one — a moving
contact is either a view's drag or the scroll of what it sits in, and the platform decides at
once so that scrolling stays smooth; once it scrolls, the page cannot take the gesture back.
Taps and holds never compete with scrolling; only movement does. So a view that drags says so
in advance, and that declaration is its **claim** on a moving contact, settled by what the view
declares. `View.claim = x | y | both` scopes it to an axis — and, as today, also scopes a
declared `onWheel` to an axis; those are its two meanings.

## 4. The rules

Terms. The **pressed view** is the deepest view under the press that takes input (as today).
A view **takes clicks** if it declares `onClick`, `onDblClick` or `onHold`, has a `link`, or is
`selectable` or editable text. The **drag owner** is the pressed view if it declares a drag
event, else its nearest ancestor that does. The **threshold** is 4 px for a mouse or pen, 10 px
for a finger, measured from the press point.

**R1. The drag events.** `onDragStart(e)`, `onDrag(e)`, `onDragEnd(e)`. Declaring any of them
makes the view a drag owner, and is its claim. `onPointerDown/Move/Up` are raw and claim
nothing. Drags are the primary button's (a mouse's left button, a finger, a pen tip); another
button's press delivers raw events only. Every `onDragStart` is followed by exactly one
`onDragEnd` — unless the owner is discarded mid-drag, when the drag ends silently (a discarded
view hears nothing).

**R2. When a drag starts, and what the press is.** A press is a click or a drag, never both,
and nothing is reported as a drag until it is one.

- **The pressed view takes no clicks:** the drag starts **at the press** (subject to R3 for
  touch and pen). The window's title bar, a Sheet's handle, a drawing surface, a window's
  resize grips follow from the first pixel.
- **The pressed view takes clicks:** the press is a click candidate. Once it travels past the
  threshold it is no longer a click — and if it has a drag owner, the drag starts there and
  then (R3 still applies on touch and pen). If it lifts first, it is a click and never a drag.
  This holds for a mouse as for a finger: a mouse press that wanders inside a big button is
  not a click (the guide's rule today) and, if the button sits on a draggable card, it drags
  the card. Slider, Switch and Splitter take clicks (Control's `onClick`), so they drag past
  the threshold; what must happen at the press itself stays in their raw `onPointerDown`.
- **A press under the mouse rules (R3) on selectable or editable text** selects: it neither clicks a drag owner nor
  starts a drag — whether the text is the owner itself or inside it. (Selectability is the
  pressed view's own `selectable`/editable fact, not the DOM target.)
- **When the drag owner is an ancestor and the drag starts,** the pressed view's press ends:
  `onPointerUp` with `canceled: true`, delivered just before the owner's `onDragStart`.

**R3. Touch, pen, mouse.**

- **Touch** competes with scrolling. An owner scoped by `claim = x` (or `y`) starts only if,
  at the moment the contact passes the threshold, its travel is along that axis
  (`|dx| > |dy|` for `x`) — the **one moment and the one test** for both backends; travel along
  the other axis goes to the nearest owner of that axis outward (handoff), else to the
  scrollers. If the platform starts a scroll before that moment, no drag starts. **Before
  that moment, the platform may not pan along a claimed axis:** the DOM backend says so
  natively (`claim = x` gives `pan-y`); the canvas backend does the same by cancelling each
  `touchmove` whose travel since the press runs along a claimed axis, a tie included
  (`|dx| ≥ |dy|` for `x`), and letting the other axis through — and it keeps cancelling
  claimed-axis moves until release (while the event can still be cancelled), whatever the
  verdict, as `pan-y` does. So on both
  backends a swipe along the claimed axis reaches the threshold as a drag, not a page scroll.
  **A pane on canvas** scrolls by the runtime's own touch session, not the browser's: before
  the moment the canvas also cancels moves along the axes of any runtime-scrolled pane between
  the press and the owner, **the owner included** when it scrolls, and **at the moment R3's one
  test chooses the pane's session or the drag, never both** (travel along the pane's axis scrolls it; along the claimed axis, drags).
  The owner-walk (`claimAt`) does not stop at a scroller: for the owner if it scrolls, and for
  owners outside a scroller, it leaves out only the axes that scroller scrolls, so an `x`-claimed owner around a `y` pane keeps `x`; an
  owner claiming both axes around a `y` pane claims `x` for that press, and outer owners widen
  the claim. If every axis is left out for a press, no drag can start from it and a pane's
  session starts by its own slop, as today. **From the
  moment any touch or pen drag starts** — at the press, at the threshold, after a handoff, on
  any axis; for a hold-gated owner from the hold — **until release, the backend refuses every
  `touchmove`**, pinch and multi-finger pan included (a `preventDefault` acts per event, so it
  is every event while the drag lives; `fingerHeldByDrag()` is true for the whole drag). The
  refusing listener is non-passive and in place on every drag owner **before `touchstart`**
  (the browser decides at `touchstart` whether a sequence's moves can be canceled): today's
  hold-gate condition becomes `wantsDrag`. The refusal also holds after Escape or a focus loss
  ends the drag, and after a pinch ends it (R6), until release. So neither the platform nor the router takes a started drag
  back; only a system interruption can (R4). A pinch on a pinch-declaring subtree runs on
  pointer events and is unaffected (R6).
- **Touch with `onHold` on the owner:** a contact that travels past the threshold before the
  hold scrolls (no drag). At the hold, `onHold` fires and the contact becomes the owner's — no
  scroll can take it now; the drag starts at the first move after the hold, with no second
  threshold. A hold released without moving is a click if the hold was the pressed view's
  own; if the pressed view is a child and the hold was the owner's (`heldAbove`), the child
  does not click (as today, `10-touch.md:97-103`) — its press ends with `onPointerUp(canceled)`
  at the hold.
- **Pen** follows the touch rules on platforms whose pen contacts deliver touch events
  (iPadOS and Android do; the refusal acts on them), otherwise the mouse rules (a Mac; the Mac
  host, which reports every press as a mouse). It is settled **per platform, once at boot**,
  not per contact (a contact's `pointerdown` arrives before its `touchstart`); Windows is
  settled by the build's tests.
- **Mouse** competes with nothing: `onHold` does not gate a drag, and `claim` does not limit
  one — an `x`-scoped drag hears both axes of a mouse. A mouse held still fires `onHold` as
  today; if it then travels past the threshold, the drag starts.

**R4. What a drag hears.**

- `onDragStart(e)`: `e.x`/`e.y` the press point in the owner's own units; `rootX`/`rootY` the
  press point in root space; `deltaX`/`deltaY` the travel so far (per below).
- `onDrag(e)`: `e.x`/`e.y` the pointer now, in the owner's own units; `rootX`/`rootY` the
  pointer now, in root space. **`deltaX`/`deltaY`** are the pointer's travel since the press,
  measured in **the owner's parent's coordinates as they stood at the press** (so a handle
  that moves its own window, or a parent that is scaled or rotated, does not feed its own
  motion back), **plus the scroll since the press of every scroller that contains the
  owner** (so `x = startX + e.deltaX` keeps an item under the pointer while a pane scrolls).
  `onDrag` fires whenever these change — a move, an autoscroll, a wheel turned during the
  drag, a program scrolling — not only when the pointer moves.
- `onDragEnd(e)`: release; or `e.canceled` on a **system interruption** — a real
  `pointercancel` from an OS gesture (a call, the system's edge swipe) — on **Escape** during the drag (the abort a drag owes
  the person), or when the window **loses focus** mid-drag. A scroll is never one: the backend
  refuses it once a drag has started (R3). `DragEndEvent extends PointerUpEvent`, whose `canceled` stays for
  plain presses too.

**R5. Handoff.** When the drag owner is an ancestor, the drag starts for it under R2's second
case — at the threshold, for every pointer type (today a mouse hands off only on leaving the
pressed view; that rule goes, as a wandered press is no longer a click). On touch and pen it
never starts across the owner's claimed axis (R3). The owner hears `onDragStart` — never a
synthesized raw press. A drag owner is always the owner of its own presses. Before a drag
starts, the platform's scroll takeover is watched as today (a scroll of a pane containing the
press ends the press, `input.ts:813-831`); once it has started, the backend refuses the pan
(R3), so the takeover detector no longer applies to that contact — and a program scrolling a
pane during the drag is not a takeover.

**R6. Other contacts.** While a press is held, another contact is not a press: it clicks
nothing and starts no drag; the view under it still hears its raw `onPointerDown/Move/Up` (as
today). If it makes a pinch on a pinch-declaring subtree, the drag ends — `onDragEnd` without
`canceled`, before `onPinchStart` — and no drag starts while the pinch lasts. Over a subtree
that declares no pinch, a second finger is only a raw contact: the browser's own pinch-zoom is
refused while the drag lives (R3). The multi-finger
stream (`onTouchStart/Move/End`) hears every finger.

**R7. `onPointerMove` is every move.**

- **Hovering**, it goes to the nearest view up the hit chain from the view under the pointer
  that declares it, so a circle with its own `onClick` does not starve the canvas under it.
- **During a press**, the receiver is fixed at the press — the nearest view up from the
  pressed view that declares `onPointerMove` — and gets every move until release, captured,
  whether a drag starts or not. That is how a click-taking control gives feedback inside the
  threshold.
- It fires only when the pointer moves, and not during a pinch (as today).
- `onPointerOver`/`onPointerOut` stay in step with `hovered`, during a press as at rest (as
  today: menu rows open submenus from `onPointerOver`, `menu.declare:629`) — including when
  `hovered` re-derives because content scrolled under a still pointer (today they wait for the
  next move, §8).
- Its payload gains **`down: boolean`**, named so it is not read as the view's own `pressed`
  fact, which differs after a handoff.

**R8. Keyboard and single pointer.** A drag that changes data needs both a keyboard path
(WCAG 2.1.1) and a path that needs no drag (WCAG 2.5.7): a button, a menu command, a
tap-to-select-then-tap-to-place; and it can be abandoned (Escape, R4). No new mechanism: the
guide's Dragging section says so. Of the library's drags, Slider and Splitter have keyboard
paths and Sheet closes on Escape and on a press on the dimmed area; window move and resize,
Carousel paging by drag, and DataGrid column reorder and resize have none (§7).

**R9. Scrollers and autoscroll.** A **scroller** here is a view with `scrolls` on an axis
**that has range on that axis at the press** (a pane with nothing to scroll is not one).

- **A scroller between the press and the owner** — including the pressed view if it scrolls —
  keeps a touch or pen contact's travel along its axes: no drag starts at the press and no
  handoff happens on those axes, in both backends alike. A mouse moves a pane only by its
  wheel or its scrollbar, so for a mouse a scroller in between changes nothing — except:
- **A press on a scroller's bar belongs to the scroller** — no drag, no click, no raw events
  to the views below. The canvas backend (`canvas-backend.ts:944-946`) and the Mac host
  (`barDrag`) keep bar presses from the router already. **The DOM test:** the press's target is
  the scroller element (in both branches below), and the point is outside its client box but
  inside the border's inner edge — the border box less the border widths (a classic bar, which
  takes space and sits there; a press on the border itself is not one) — or, only where bars overlay the content (`offsetWidth − clientWidth − borders == 0`
  on that axis), and the press is under the mouse rules, within the 20 px band of an axis that
  has range and whose bar is not hidden (`hideScrollbar`, `scrollbar-width: none`), on the side
  the bar is drawn (the left in right-to-left). A press on the pane's background anywhere else
  is the pane's. (Today's `ScrollWatch.barHeld`, `dom-backend.ts:3093-3106`, counts any press
  in a 20 px edge band; it is narrowed to this. A press on the page's own scrollbar lands on
  `<html>`, outside every input sink, and needs no test.)
- **An owner that is itself a scroller** keeps its scroll axes for touch and pen: its drag
  starts only on travel along an axis it does not scroll.
- **Autoscroll** moves a scroller on an axis only once the drag has travelled toward that edge
  along that axis (the pointer moved into the edge band; it did not start there), and, for
  touch and pen, only on the owner's claimed axes. The scroller moved is, first, the pane
  under the pointer if the drag has been carried into one (never the owner or a pane inside
  it), else the nearest scroller that contains the owner — then the next one out, once the nearer has reached the end of its range.
  The band is measured on the scroller's visible part. It keeps scrolling while the pointer is
  past the edge.

**The order of events**, for one press:

1. `onPointerDown` — the pressed view (a Control takes focus here).
2. For a drag that starts at the press: `onPointerUp(canceled)` to the pressed view if the
   owner is an ancestor, then `onDragStart` — the owner.
3. Per move while held: `onPointerMove` — R7's receiver; then, if the drag starts on this move,
   `onPointerUp(canceled)` to the pressed view when the owner is an ancestor (R2) and
   `onDragStart` to the owner; then `onDrag` — the owner, if a drag has started.
4. On touch, a hold: `onHold`; if the hold is an ancestor owner's, `onPointerUp(canceled)` to
   the pressed view; the drag, if any, starts on the next move (R3).
5. **Escape or loss of focus during a drag**: `onDragEnd` with `canceled` — the owner; Escape
   is consumed (nothing else hears it: an open Sheet does not also close). Raw moves continue
   to R7's receiver until release; the release then delivers `onPointerUp` with `canceled` to
   the pressed view unless its press already ended, and no click and no second `onDragEnd`.
   After a focus loss the release may never arrive: the press ends, and the refusal (R3)
   lifts, at the first event showing the contact gone — a new press, an up or cancel, or a
   move with no buttons down.
6. At release: `onPointerUp` — the pressed view, unless its press already ended; then
   `onDragEnd` — the owner, if a drag started and has not already ended (Escape, focus loss,
   a pinch); else `onClick` (and `onDblClick` on a second)
   — the pressed view, if the press is a click.

## 5. The lifecycle — as the guide would teach it

A press either stays put or wanders. If it stays put and lifts, it is a click. If it wanders,
it is a drag, and the view hears it in three moments:

- **`onDragStart(e)`**: the press has become a drag. `e.x`/`e.y` are where the press began. The
  place to note where things stood, and to draw what a drag looks like — lift the item, leave a
  ghost.
- **`onDrag(e)`**: every move until release, even outside the view's box. `e.deltaX`/
  `e.deltaY` are the distance since the press, so the usual handler is one line:
  `x = startX + e.deltaX` — or a snap, if the item may only sit in certain places. Near the edge
  of a scrolling pane, the pane moves and `onDrag` keeps arriving.
- **`onDragEnd(e)`**: released, or taken back by the platform (`e.canceled`). The place to
  commit, or to put things back.

```declare-fragment
card: View [ startX: number = 0,
    onDragStart() { startX = x },
    onDrag(e: PointerEvent) { x = startX + e.deltaX },
    onDragEnd(e: DragEndEvent) { if (e.canceled) x = startX } ]
```

A view that takes no clicks drags from the moment it is pressed — on a phone, from the first
move along an axis it drags on, when it scrolls or drags on one axis only. A view that also takes clicks
waits until the press has wandered a few pixels, so a tap stays a tap: the press is one or the
other, never both. On a phone, a finger moving on a view that drags drags it instead of
scrolling the list it sits in — so a draggable row in a scrolling list declares `onHold` (scroll,
or hold to pick up) or `claim = x` (drag across, scroll along). Every drag that changes data
also needs a keyboard way and a no-drag way to make the same change.

**Why three events, not one.** With `onDragStart` alone, the motion would come through the
raw `onPointerMove`, which fires on hover, and the end through `onPointerUp`, which follows
clicks too: every drag handler would need an `if (dragging)` guard, and forgetting it is §1's
bug. The names carry the guard, as `onClick` does beside the raw press and release.

## 6. Control: what stays possible

| A drag that starts… | How |
|---|---|
| on a press, from the first pixel (a window, a sheet handle, drawing) | `onDrag` on a view that takes no clicks (R2) |
| on a view that is also tapped (a card, a slider) | `onClick` + `onDrag`: a tap is a click, a wandering press a drag; press-time effects in `onPointerDown` |
| on a long press on a phone (a reorder list) | `onHold` + `onDrag` (R3) |
| on one axis inside a scroller on the other (a carousel in a page) | `onDrag` + `claim = x` (R3) |
| across inside an owner along (swipe-to-delete in a draggable sheet) | inner `claim = x`, outer `claim = y` (R3, R5); with a mouse the row hears both axes, so the sheet drags from its own surface, not from rows |
| snapped to slots, with a ghost at the origin (a calendar event) | `onDragStart`/`onDrag`/`onDragEnd`, drawn by the program (§3) |
| from a handle only | the drag events on the handle view |
| over children that take taps (a list in a draggable sheet) | `onDrag` on the ancestor: taps stay the children's, a wandering press hands off (R5) |
| with two fingers (one draws, two pan) | raw `onTouchStart/Move/End`; `onPinch` |
| from a command, the item following the pointer until a click | `onPointerMove` on hover (R7), or `app.pointerX` |
| beyond a larger threshold of the app's own | `onDrag`, acting once `deltaX`/`deltaY` pass it |
| tracked while hovering and while pressed (a brush outline, then a stroke) | `onPointerMove` (`e.down`) + `onDrag` |
| with a secondary button | raw events only (R1) |
| abandoned mid-way (Escape) | `onDragEnd` with `canceled` (R4) |

Not available, and not caused by this: a firmer press (iOS replaced 3D Touch with a long
press, which `onHold` is; a Mac Force Touch trackpad's pressure and force click, and a pen's
pressure and tilt, are not exposed — §10); two drags at once (one press is tracked, as today).

## 7. What it touches

**Corpus — every file declaring `onPointerMove`**, each read and placed, not renamed blindly:
apps — calendar, desktop, lzx-calendar, lzx-dashboard (applets, chrome), todo; library —
carousel, datagrid (column resize), sheet, slider, splitter, switch, window, the inspector and
viewer apps; guide — chapters 07, 09, 10, 13, 17, 21; the docs demos `seg_ch_09/17/21` and
`form-handler`; `test/soak/rows-edit.declare`; `gpu/test/calendar-busy`;
`tools/internal/sim/touchlab*.declare`; the live eval seeds
`evals/modes/seeds/venue/declare/venue.declare:664`,
`evals/modes/seeds/cadence/declare/cadence-parts.declare:297`,
`evals/modes/seeds/murmur/declare/murmur-lines.declare:356`. Drags become drag events, hover trackers stay
`onPointerMove`. Slider, Carousel, Switch and DataGrid read `app.pointerX` in their drags;
they move to `e.x` (own units, scale-proof — a Slider's value) or `deltaX`/`deltaY` (R4).
DataGrid's header click lives in `onPointerUp` (`datagrid.declare:490-494`) and becomes
`onClick`. Also: `control.declare:272`, `table.declare:481`, `contextmenu.declare:41` (`onHold`
on a card).

**Feel.** Views that take no clicks keep first-pixel drags. Slider, Switch and Splitter
(Control's `onClick`) and any draggable card that is also tapped start past the threshold;
Slider's and Switch's value follows the pointer's position, so after the threshold they catch
up with no lasting offset. Listed in the change, per the corpus-adoption rule.

**The library's override points.** Slider, Carousel, Switch and Splitter document
`onPointerMove`/`onPointerUp` as overridable; they become the drag events, and a subclass's
override is a breaking change to list.

**Keyboard and no-drag paths (R8)** for window move and resize, Carousel paging, DataGrid
column reorder and resize — each gets them, or the gap is recorded per class.

**Runtime:** `input.ts` (R2's ownership and start; R3; R5 without a synthesized press and
without muting takeover; R6's second contact; R7's hover and press routing; `down`; primary
button; selectable/editable from the hit view's facts, not `e.target`); `scene-walk.ts:126`
(drag-owner resolution for canvas and the Mac); `backend.ts` (and its comments at `:174`),
`dom-backend.ts` (the claim from the drag events alone; the refusal of R3 on every drag owner;
`ScrollWatch.onPress`/`barHeld` narrowed per R9; a drag owner that itself scrolls gets
`pan-<its scroll axes> pinch-zoom` (plain `pan-<axes>` only if it declares `onPinch`), not
`manipulation`; while the page is pinch-zoomed, the `html.declare-zoomed … touch-action:auto
!important` rule (`dom-backend.ts:264`) excludes drag owners and the panes inside them, so a
claim holds when zoomed (`refreshTouchAction` returns early for a scroll
pane today, `dom-backend.ts:2206`); a pane inside an owner gets
`pan-<its axes>`, not `manipulation`, so its cross-axis pan does not chain past the owner),
`canvas-backend.ts` (`claimAt` stops at scrollers, and is widened by an outer owner of the
other axis instead of keeping only the innermost, `:2138`; the axis settled by R3's one test,
not `dx+dy ≥ 4`, `:804-808`; the touch scroll session (`scrollLoop.touchMove` `:465`) of a pane
between the press and an owner — the owner included when it scrolls — starts by R3's one test,
and never alongside a drag — today's guard opening a session only when `claim.drag === false`
(`:779`) goes; other panes keep their own slop), `mac-backend.ts`; the user-select row of `claim-surface.md` must not apply to a view
that only tracks hover; `view.ts` (the drag behaviours under the drag events; `pointerPayload`
with R4's deltas); `drag-autoscroll.ts` (R9); `events.ts` (`DragEndEvent extends
PointerUpEvent`, `down`, its stale comments); `interaction.ts` (over/out on re-derive);
`boot-check.ts:88` (its out-of-reach check reads the drag events); `schema.ts:480, 1516`;
`compiler/src/scaffold.ts`.

**Focus loss:** the runtime has no window-`blur` handling today, and the Mac host has no route
for its window losing focus to reach the runtime; both are needed for R4.

**Mac host:** right-click sends `pointerdown` with `button: 0` and no up or dragged events
(`App.swift:257`, `browser/mac-env.js:995`), and `otherMouseDown` is ignored; the host chooses
whether a press starts a text selection by geometry (`richFlow`, `LayerTree.swift:2146-2163`),
ignoring what covers the text — it must start one only when the runtime's pressed view is
selectable (R2) — fixed first (§8). Hover arrives only in the key window (`App.swift:82`); Chrome delivers it to background
windows — to decide whether to match. `mac-host/profile/build-runtime.mjs:251`.

**Driver and tests:** `drive.drag` and the swipe paths; test files `gesture`,
`drag-edge-scroll`, `look-touch`, `touch-workout`, `overlays`, `reader-overlay-semantics`,
`silent-failures`, `kernel-extent`, `unit`, `verify-boot` (`:39`); `test/soak/rows-edit.assert.mjs`,
`tools/internal/sim/scrollcheck.mjs`, `regress.mjs`. New device tests (iOS Safari, Android
Chrome): a canvas page that scrolls with an `x`-claimed owner and a horizontal swipe, with a
first move of 0–1 px; on iOS, a vertical swipe on an `x`-claimed canvas owner whose first
move ties at 1×1 px (WebKit may settle its scroll on the first move — if it does, ties pass);
a `y` pane inside an `x`-claimed owner on canvas, swiped each way, near-diagonal included;
an owner that itself scrolls, on both backends; a
pinch whose second finger lands off the owner; a router threshold crossed before the
platform's slop; a pen on iPadOS; a Windows pen. The hidden eval drives use
real input.

**Docs:** `declare.md` §8 and `:143`; the guide's raw-and-resolved section and Dragging
(`09-pointer-and-keyboard.md:94-150`, with R8, and when to read `app.pointerX` versus handle
`onPointerMove`); chapters 10 and 13; the reference for the drag events, `onPointerMove`,
`PointerEvent.down`, `DragEndEvent`, `View.claim`; `gestures.md` (`:37`, `:83`, the routing
table with a hover row) and `claim-surface.md` (its `:39-40` "selectable content under a drag
view yields" is stale today); `tools/internal/doc/forms.md:452`; the site,
`index.html:237, 382`.

**A silent change to guard:** a program whose drag is `onPointerMove` would move on hover on a
desktop and scroll instead of drag on a phone — a `## Breaking changes` entry with a `Find:`
for `onPointerMove` beside `onPointerDown` or `onPointerUp`. (No checker warning: legitimate
raw trackers declare the same.)

## 8. Bugs the reviews found that stand on their own

True today, not caused by this proposal, fixed whether or not it is built (items 1, 2, 4, 5
and 7 before it, as the build leans on them):

1. Mac host: right-click delivers a left press with no release (`mac-env.js:995`); the middle
   button is ignored; every press clears the selection (`App.swift:216`), and one over a rich
   flow starts one by geometry alone, ignoring what covers the text (`LayerTree.swift:2146-2163`).
   Hover is gated at `App.swift:82`.
2. Canvas backend: a scrolling pane inside a drag owner never scrolls by touch (`claimAt`,
   `canvas-backend.ts:2128-2141`, does not stop at scrollers).
3. Canvas backend: a `claim = x` drag in a `scrolls = y` pane in a `scrolls = x` pane sends a
   vertical swipe to the browser (`:776`).
4. After a handoff, iOS scroll takeover is no longer detected (`dragFinger`, `input.ts:336`),
   and in the DOM backend only hold-gated drags refuse the platform's pan
   (`dom-backend.ts:2113-2120`; the canvas backend also refuses for an unscoped claim and once
   its own axis decision favours the drag, `canvas-backend.ts:796-808`): an axis-scoped touch
   drag the router has started can still be panned away. Fixed by building R3's refusal (first, as §9.5 says).
5. A second contact during a press takes the capture: it clicks another view mid-drag, and
   the dragged view hears no more moves (`held = t` for every finger, `input.ts:473`).
6. `onPointerOver`/`onPointerOut` go stale when content scrolls under a still pointer.
7. Autoscroll: a Slider dragged sideways in a pane's bottom band scrolls the pane and carries
   the slider away; only the nearest scroller ever moves; the band ignores an outer clip.
8. DOM: a pane inside a drag owner gets `manipulation`, so its cross-axis pan chains past the
   owner to an outer scroller.
9. Selectable-text detection reads `e.target`, so on canvas and the Mac it never fires.
10. To confirm against the docs: a child that declares only `onPointerOver` is the pressed
    view and swallows its parent's `onClick` (a press on it clicks nothing). The guide's
    "a click is a press and release on the same view" allows it; whether a view that takes
    only hover should take presses at all is a question for the input layer.
11. DOM: a mouse press on a pane's native scrollbar resolves to the pane's sink; inside a drag
    owner it would start the owner's drag (masked today by mouse handoff on leaving the view).

## 9. Settled questions

1. A press is a click or a drag, never both, and nothing is reported as a drag and then taken
   back (R2; §3) — the user, 2026-11-09.
2. `onDragStart` reports the press point; deltas run from it, in the parent's coordinates,
   scroll included (R4).
3. A drag cannot be refused once started by the program (a handle view is the answer); the
   person can abandon one with Escape (R4).
4. `onHold` + `onDrag` on touch: the hold makes the contact the owner's; the drag starts at
   the first move after it; a hold released still is a click (R3). A mouse is not gated.
5. One release; the corpus moved in the same change; a breaking-changes entry; §8's items 1,
   2, 4, 5 and 7 first.

## 10. Recorded, not part of this

Pen pressure and tilt, a Mac trackpad's pressure and force click; two simultaneous drags.

## 11. The reviews, and what changed

**First review** (direction sound): hover following already existed; the raw pair as a claim
was a trap; spurious touch drags; cancellation is not drag-only; hover routing; handoff
inventing a press; pinch; `claim`'s users; Mac right-click; missed files; first-pixel feel;
`e.pressed`; force touch; accessibility. Answered in revision 2.

**Second review** (NOT YET, five blocking): first-pixel loss for Control-derived drags; R2's
"between"; touch/pen/mouse; moves during a press; a pane inside an owner. Answered in revision
3.

**Third review** (NOT YET, four blocking), and the user's ruling that nothing may look like a
drag and then be taken back:

| Finding | Answer |
|---|---|
| A still press on an owner with `onClick` reported a drag and a click | The user's ruling: R2's second case — a press is one or the other |
| Deltas lag a pane that autoscrolls | R4: deltas in the parent's coordinates, scroll included |
| Which drags autoscroll; sideways Slider scrolls its pane | R9: only toward the edge, along that axis; §8 item 7 |
| R2 vs R7; the pressed view's down/up unbalanced | R2: a canceled `onPointerUp`; R7 names the move receiver |
| A second contact steals the press | R6; R1's one-end rule; §8 item 5 |
| Event order | §4, the order of events |
| "One test both backends use" untrue | R3: the platform's verdict, `canceled` on disagreement |
| Cross-axis owner inside an owner of the other axis | R3, R5, §6 |
| A pane inside an owner chains its pan | §7 DOM; §8 item 8 |
| Pen hold gate not buildable everywhere | R3: pen as touch only where the platform pans with it |
| Selectable text from `e.target`; Mac selection on every press | R2 from the view's facts; §7, §8 items 1 and 9 |
| A mouse and a scroller in between | R9 |
| Pinch ending a pan `canceled` | R6: not canceled, before `onPinchStart` |
| Over/out vs `hovered` | R7 |
| Minor: `pointerPayload` location, missed files, Sheet's keyboard, R2 vs R3, R5 for a mouse, the migration warning | §2, §7, R8, R2, R5, §7 |

**Fourth review** (NOT YET, four blocking):

| Finding | Answer |
|---|---|
| Deltas in the parent's frame fed a moving handle's own motion back (a window moved 50 px for 100) | R4: the parent's frame as it stood at the press, plus containing scrollers' scroll since the press |
| R2 vs R5 for a mouse; a click-taker between, not pressed; a small icon in a button | R2 judges the pressed view only; R5 hands off at the threshold for every pointer; the guide's click rule already makes a wandered mouse press no click |
| The platform's verdict had no moment; canceling a started drag; nested x-in-y owners; canvas `claimAt` | R3: one moment, one test, never canceled by the router; §7 canvas |
| Hold-then-drag read two ways; hold in the event order; mouse with `onHold` | R3: the drag starts at the first move after the hold; a still hold is a click; order step 4 |
| `onDrag` when a wheel or a program scrolls | R4: fires whenever the deltas change |
| Selectable owner; whose selectability; `claim-surface.md` stale | R2's third case; §7 |
| An owner that scrolls; what counts as a scroller | R9 |
| Escape | R4, R8, §6 |
| Raw events for a second contact | R6 |
| Which pens follow touch | R3 (revised again in revision 8: by whether the pen's contact delivers touch events) |
| The canceled up's place; over/out during capture | the order of events; R7 |
| Autoscroll precedence; touch axis | R9 |
| Minor: missed files, Mac lines, a discarded owner, Slider's `e.x`, Splitter's empty `onClick`, a hover-only child swallowing a click | §7, §8, R1 |

**Fifth review** (NOT YET, two blocking; the dozen walked cases otherwise consistent):

| Finding | Answer |
|---|---|
| A started touch drag could still be panned away (browser slop vs router; only hold-gated drags block the pan); takeover after handoff would cancel a drag whose program scrolls | R3: the backend refuses the pan from the moment any drag starts; R4 narrows cancellation to system interruptions; R5 restated; §8 item 4 |
| A mouse on a DOM pane's scrollbar would drag the owner | R9: a bar press belongs to the scroller; §8 item 11 |
| Hold on a child of a hold-drag owner, then release | R3; order step 4 |
| Escape and focus loss not in the order; focus loss has no route | order step 5; §7 Focus loss |
| R7 suppressing over/out during capture out of step with `hovered` | R7: in step with `hovered` |
| Splitter's empty `onClick` claim false | removed from §7 |
| Mac selection by geometry | §7, §8 item 1 |
| Live eval seeds | §7 |
| Pen under mouse rules on selectable text | R2's third case |
| Minor: step 2's canceled up, Mac line numbers, mouse and `claim = x` rows | order step 2, §8, §6 |

**Sixth review** (NOT YET, two blocking; the six hardest cases otherwise sound, the refusal shown realizable):

| Finding | Answer |
|---|---|
| A refused pan also refuses browser pinch-zoom, so "pinch-zoom cancels" could never happen — and dropping the refusal on a second finger lets a pan take a drag back | R3: every `touchmove` refused while the drag lives; R4 and R6 no longer treat browser pinch-zoom as an interruption |
| The DOM scrollbar test misstated; overlay bars; false positives on a pane's background | R9: the test defined (classic outside the client box; overlay only within a shown bar's band, right-to-left aware); `barHeld` narrowed; `PAGE_WATCH` too |
| The listener must exist before `touchstart`; refusal from the hold for hold-gated owners | R3 |
| Canvas pane scroll sessions start without an axis test | §7 |
| Keep refusing after Escape or focus loss until release | R3 |
| Windows pens | R3: mouse rules until tested |
| "Superseded" vs "fix first" for §8 item 4 | §8 item 4 |

**Seventh review** (NOT YET, one blocking; revision 7's refusal confirmed buildable and consistent):

| Finding | Answer |
|---|---|
| Canvas: an axis-scoped drag would lose a swipe to the page's scroll before the 10 px moment (Android pans at ~8 px), while the DOM drags | R3: before the moment, the platform may not pan along a claimed axis — native `pan-*` in the DOM, per-move cancelling along the claimed axis on canvas |
| "Whose bar is shown", the band's width; the page scrollbar sentence | R9 |
| A pen test the runtime can run; the stale §11 row | R3; §11 |
| A second finger off the owner | §7 device tests |
| Minor: §8 item 4 on canvas; a second `onDragEnd` after a pinch; refusal after a pinch; touch presses in the overlay band | §8, order step 6, R3, R9 (mouse rules only) |

**Eighth review** (NOT YET, one blocking; revision 8's pre-decision rule confirmed buildable):

| Finding | Answer |
|---|---|
| Canvas: a runtime-scrolled pane inside an axis-scoped owner had no rule before the moment, and §7 read two ways (the page takes the swipe, or the pane scrolls then the owner drags); `claimAt` "stops at scrollers" read as dropping the outer claim | R3: the canvas also cancels moves on an intervening pane's axes before the moment; at the moment, the one test picks the pane's session or the drag, never both; the owner-walk leaves out only the scroller's axes |
| After an other-axis verdict the canvas stopped cancelling claimed-axis moves | R3: claimed-axis moves are cancelled until release, as `pan-*` |
| A zero or tied first move let through | R3: ties cancelled; §7 device test |
| When the pen rule is settled | R3: per platform, at boot |
| The bar test's target in the overlay branch | R9 |
| Minor: step 5's canceled up | order step 5 |

**Ninth review** (NOT YET, one blocking; revision 9's pane rule confirmed buildable and the two backends' outcomes matched):

| Finding | Answer |
|---|---|
| An owner that itself scrolls had no backend rule (canvas: page pans or pane never scrolls; DOM: `manipulation` chains past it) | R3: "the owner included"; the owner-walk; §7 DOM `pan-<axes>`, canvas session |
| Tie-cancelling on iOS's first move | §7 device test, with the fallback |
| "Until release" while the event can be cancelled | R3 |
| Near-diagonal swipes | §7 device test |
| Minor: which panes' sessions move to the one test; all axes left out; the bar test and the border; focus loss with no release; a line number | §7; R3; R9; order step 5; §7 |

**Tenth review: CLEAN** — no blocking issues; the scrolling card walked through both backends
on every swipe direction, from children that take clicks and that do not, sound. Its
should-fixes, applied: the zoomed page's `touch-action:auto` rule no longer overrides a claim;
a scrolling owner keeps pinch-zoom; the bar test says the border's inner edge (a padding-box
test is empty by the CSSOM definition); autoscroll never picks the dragged owner or a pane
inside it; focus loss lifts the refusal at the first event showing the contact gone; the
guide's sentence on touch; the canvas session guard to remove.
