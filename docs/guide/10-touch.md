<!-- nav: Touch and gestures -->
<!-- part: Building -->

# Touch and gestures

With a mouse, the pointer is almost entirely yours. A touch screen is different: the
browser arrives owning most of what a finger can do — pan, pinch, double tap — and an
app that wants any of it takes it deliberately. This chapter covers what a finger
changes about design, how a gesture passes from the browser to your app, and what it
costs to take all of it.

> **The browser owns every gesture until a view claims it — and declaring the handler
> is the claim.**

## Mouse and touch differences

The same handlers fire for mouse and finger, and the runtime absorbs most of the
difference: a finger that moves does not click, a tap never leaves a view stuck in a
hover state, and an interrupted gesture reports itself. Two differences remain yours
to design for.

**A finger doesn't hover.** [`hovered`](declare-docs:View.hovered) is always false on a touch device, so anything
that only appears on hover is invisible on a phone unless you give it another way in
— let [`pressed`](declare-docs:View.pressed) carry the feedback, or keep the affordance visible when
[`app.touchFirst`](declare-docs:App.touchFirst) is true.

**Targets want to be bigger.** Ask the device, and design accordingly:

| you ask | it answers | use it for |
|---|---|---|
| `app.touchFirst` | is this device built for touch — a phone or tablet, keyboard or not? | sizing and layout density |
| [`app.hasTouch`](declare-docs:App.hasTouch) | is there a touch digitizer *at all*? | a hit-target floor |
| [`app.hasMouse`](declare-docs:App.hasMouse) | is there a mouse, trackpad, or stylus? | offering precise affordances |
| [`app.lastPointerType`](declare-docs:App.lastPointerType) | what did the user *just* use — `"mouse"`, `"touch"`, `"pen"`? | revealing hover-only chrome |

The last two exist for the awkward middle: a Windows touch laptop reports
`touchFirst = false`, because its trackpad really is primary, yet a finger may arrive
at any moment. The rule that follows is worth stating plainly — **size from
`touchFirst`, floor from `hasTouch`, and reveal from `lastPointerType`.** Never drive
layout from the live pointer type: targets that resize as the user alternates trackpad
and finger are worse than either size. And a hit region need not match a visual one, so
a hybrid can keep compact chrome and generous touch targets at the same time.

**Many small targets close together belong in a scroller, at a finger's size** — each at
least 44 points, in a pane that `scrolls`, rather than fitted to the screen and zoomed into.
A finger near two targets is taken by the nearer, and a person, a screen reader and a test all
reach a target by scrolling to it.

## Pan and zoom about the fingers

A surface a person moves through — a long axis, a large drawing — is one view whose
`draw` reads two numbers: where the window starts, and how much it shows. Every way of
moving it writes those two numbers, and the drawing follows. What makes it feel held is one
rule: **the point under the hand stays under the hand.** A drag moves the window by exactly
the finger's travel, read as `deltaX` against the start latched at the press — never as an
accumulation of small moves, which drifts. A pinch reads `scale` against the start and span
latched when it began, and moves the start so the value under the fingers does not move:

```declare-fragment
// on the App: the value at x stays at x while the span becomes s
zoomAbout(x: number, w: number, from: number, fromSpan: number, s: number) {
    const at = from + fromSpan * x / w
    span = s
    start = at - s * x / w
    },

line: View [ claim = x,            // sideways is the line's; up and down still scroll the page
    grabStart: number = 0,
    grabSpan: number = 0,
    onPointerDown(e: PointerEvent) { grabStart = app.start },
    onPointerMove(e: PointerEvent) { app.start = grabStart - e.deltaX * app.span / this.width },
    onPinchStart(e: PinchEvent) { grabStart = app.start; grabSpan = app.span },
    onPinch(e: PinchEvent) { app.zoomAbout(e.x, this.width, grabStart, grabSpan, grabSpan / e.scale) },
    // a trackpad pinch zooms; a sideways scroll pans
    onWheel(e: WheelEvent) {
        if (e.pinch) app.zoomAbout(e.x, this.width, app.start, app.span, app.span * Math.exp(e.deltaY * 0.01))
        else app.start = app.start + e.deltaX * app.span / this.width
        }
    ]
```

A trackpad pinch is the same zoom arriving on `onWheel` with `e.pinch` true. A button that
jumps the window somewhere ("show all") would rather glide than jump: give `start` and
`span` each a [`Spring`](declare-docs:Spring) whose target the button writes, and have the
hand write the value and its target together, so nothing trails the fingers
([Motion](declare-docs:guide:motion@springs)).

## Dragging on a scrolling surface

One row of the table deserves its own telling, because it resolves a conflict the
others never face. A slider claims the finger from its first movement, and
rightly — its surface never scrolls, so nothing competes. But a calendar event
sits *on* a scrolling surface, and the finger that could drag it is the same
finger that means *pan*. The platforms settled this long ago, and their answer is
the right one: **press and hold to pick it up.** In Declare you state it with two
handlers you already know — declare `onHold` alongside the drag handlers, and the
claim engages *at the hold*:

```declare-fragment
block: View [
    onHold(e: PointerEvent)        { app.liftEvent(:id) },          // the pick-up moment
    onPointerDown(e: PointerEvent) { app.startDrag(:id, e.x, e.y) },
    onPointerMove(e: PointerEvent) { app.dragMove() },
    onPointerUp(e: PointerUpEvent) { app.dropDrag(e.rootX, e.rootY) },
    ]
```

A quick swipe scrolls, exactly as the user expects, and reaches you as
`e.canceled` — the contract drags already honor. A finger that presses and waits
picks the thing up, and every move after the hold is yours. Notice that nothing
about delivery changed: pre-hold, the finger is either *stationary* (there are no
moves to deliver) or *moving* (the browser owns it, and you get the cancel). The
hold only decides who owns the wandering finger — which was always the claim's
one question. This is the least-claim rule read precisely: the pair needs nothing
until the hold fires, so nothing is taken before it. A mouse ignores all of this;
a mouse drag was never the browser's, so on desktop the same handlers drag
immediately — hold your visible pick-up until `onHold` if you want the two to
feel alike.

## Raw touch events

Some apps need it all. A map, a drawing canvas, a game — an app that requires
full gesture control, because no browser primitive exists for its pan and its
zoom. It takes that control the same way every claim is made — by declaring the
handlers: the raw touch family and `onWheel`, on the App itself, which for once
really is the smallest view that needs it.

```declare-fragment
App [
    onTouchStart(e: TouchEvent)  { engine.begin(e.touches) },
    onTouchMove(e: TouchEvent)   { engine.track(e.touches) },
    onTouchEnd(e: TouchEvent)    { engine.release(e.touches) },
    onTouchCancel(e: TouchEvent) { engine.abort() },
    onWheel(e: WheelEvent)       { engine.wheel(e) }            // the desktop half: trackpad pan and pinch
    ]
```

Every finger now arrives with a stable `id` for the life of its contact;
`e.touches` is every finger currently down, `e.changed` the one this event is
about, and **the touch family's coordinates are root-space throughout** — a gesture
engine wants one fixed frame. (`onWheel` is the exception to keep straight: its
coordinates are **view-local**, like `onPointerDown`'s. Only the multi-finger stream is
root-space.) `onWheel` is the desktop half of the same ownership: a trackpad
pinch arrives on the wheel stream (with `e.pinch` true), so the app that
integrates its own zoom hears mouse wheels, trackpad scrolls, and trackpad
pinches through one handler.

Full gesture control is a trade, and both sides of it should be said plainly.

**You now owe the user zoom.** Claiming every finger took pinch-zoom with it —
the only rung of the ladder that does — so an app with full gesture control must
be its own magnifier: the pinch you now receive should do what the browser's
pinch used to, in your coordinates and your physics. Two escapes survive any
claim: ⌘ +/− dispatches no event to any page and cannot be intercepted, and the
operating system's accessibility zoom is beyond a page's reach entirely. They
are the fire exit, not the accommodation.

**The viewport holds still for you.** iOS has one zoom nobody asks for: focus a
text field whose text is smaller than 16px and the browser zooms the page toward
it, then zooms back on blur. Under an app running its own gesture arithmetic, a
browser zoom arriving mid-gesture would shear every coordinate the engine is
integrating — so while an app with full gesture control holds focus, the runtime
suspends that auto-zoom, and lets go on blur. In every other app the browser's
behavior stands untouched; instead, the compiler flags a focusable field that
sits below the 16px line and names the fix.

## Checking it with a finger

A touch interface is checked with touch, not with a mouse in a small window: a mouse
hovers, never claims a gesture, and passes what a finger fails. `declare-look --touch`
makes the window a touch device, and from then on every press is a finger:

```sh
npx declare-look app.declare --touch --size 390x844 \
  --drag app.list 0,-400 --read app.list.scrollY \
  --hold app.list.3 --read app.rowMenu.shown \
  --pinch app.map 2 --read app.zoom
```

`--drag` is a finger's drag (in a scrolling pane, the scroll, unless the view claims
it), `--hold` a press-and-hold, `--pinch` two fingers. Without `--touch`, `--pinch` is a
trackpad's pinch, which reaches the program as `onWheel` with `e.pinch` — handle both if
both should zoom. A whole flow is an assert script for `declare-verify --assert`, which
starts with `drive.device({ width: 390, height: 844, touch: true })`
([Verify](declare-docs:operational:verify)).

---

**What you can now say:** you can design an interface fingers can actually use, you
can name who owns any gesture over any view — and change the answer by declaring a
handler — and you know exactly what an app that takes full gesture control owes its
user in return.

[Next: **Paint and themes** →](declare-docs:guide:paint-and-themes)
