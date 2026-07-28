<!-- nav: Gestures -->
<!-- part: Continuity -->

# The browser owns a gesture until you claim it

On the desktop, this guide could treat the pointer as yours, and it nearly was. A
touch screen is different terrain: the browser arrives holding the deed to most of
what a finger can do — pan, pinch, double tap — and an app that wants any of it must
take it deliberately. This chapter is the ownership story: what a finger changes
about design, how a gesture changes hands, and what it costs to take all of it.

## Designing for fingers

The same handlers fire for mouse and finger, and the runtime absorbs most of the
difference: a finger that moves does not click, a tap never leaves a view stuck in a
hover state, and an interrupted gesture reports itself. Two differences remain yours
to design for.

**A finger doesn't hover.** `hovered` is always false on a touch device, so anything
that only appears on hover is invisible on a phone unless you give it another way in
— let `pressed` carry the feedback, or keep the affordance visible when
`app.touchDevice` is true.

**Targets want to be bigger.** Ask the device, and design accordingly:

| you ask | it answers | use it for |
|---|---|---|
| `app.touchDevice` | is the *primary* pointer a finger? | sizing and layout density |
| `app.hasTouch` | is there a touch digitizer *at all*? | a hit-target floor |
| `app.hasPointer` | is there a mouse, trackpad, or stylus? | offering precise affordances |
| `app.lastPointerType` | what did the user *just* use — `"mouse"`, `"touch"`, `"pen"`? | revealing hover-only chrome |

The last two exist for the awkward middle: a Windows touch laptop reports
`touchDevice = false`, because its trackpad really is primary, yet a finger may arrive
at any moment. The rule that follows is worth stating plainly — **size from
`touchDevice`, floor from `hasTouch`, and reveal from `lastPointerType`.** Never drive
layout from the live pointer type: targets that resize as the user alternates trackpad
and finger are worse than either size. And a hit region need not match a visual one, so
a hybrid can keep compact chrome and generous touch targets at the same time.

## Who owns a gesture

The same handlers hear mouse and finger, but the browser does not compete for
them equally. A dragged mouse was always yours: the page does nothing with it —
the one thing it would do, select text, Declare has already settled, because
views are painted UI, not a document. A finger is different. Dragging one pans
the page, two pinch to zoom, a double tap zooms to a column — and on the desktop,
the wheel and the trackpad pinch belong to the browser the same way. Those
meanings are good; the physics behind them are the ones your user's thumbs
already know, and Declare's default is to leave every one of them alone.

So when a gesture means something to both sides — the finger that lands on a
draggable card is the same finger that means *scroll* — somebody has to decide
who gets it. You already did, the moment you wrote the handler:

> **The browser owns every gesture until a view claims it — and declaring the
> handler *is* the claim.**

There is no gesture-policy attribute, because the handler is the policy. A claim
takes exactly what the handler needs in order to fire, and not one gesture more:

| you declare | on a touch screen the browser yields | on the desktop it yields |
|---|---|---|
| `onMouseMove` | the single-finger drag over this view | nothing — a mouse drag was always yours |
| `onDblClick` | the double tap | nothing — a double click was always yours |
| `onWheel` | — | the wheel over this view, trackpad pinch included |
| the `onTouch*` family | **every finger** | — |

`onClick`, `onMouseDown`, and `onHold` claim nothing. A tap coexists with every
browser gesture — that is the resolved layer's whole point — and when the browser
does take a gesture back mid-flight, `e.canceled` reports it. Everything a claim
does not name stays with the user: a view that claimed the drag still zooms under
two fingers, a view that claimed the double tap still pans. A `scrolls = true`
view is the opposite move — it *delegates* its panning to the browser — and keeps
pinch-zoom delegated too.

**A claim takes a gesture, not the pointer.** This is the
[drag-and-click rule](declare-docs:guide:interaction) from the other side: the
claim decides whether the browser or your app owns the wandering finger; the slop
rule then decides, inside the app, what the gesture meant. Neither arbitration
reaches into the other. Claiming the drag never silences your clicks, and
declaring `onClick` never takes panning from the page.

A claim covers the declaring view and its subtree, and only that. The card
claims the drag over its own few hundred pixels: a finger landing anywhere else
still pans, with no code saying so on either side. And claims run one way — a
child can claim more than its ancestor did, but it cannot hand a claimed gesture
back to the browser — which is why the habit to build is:

> **Claim the least you need, on the smallest view that needs it.**

## Full gesture control

Some apps need it all. A map, a drawing canvas, a game — an app that requires
full gesture control, because no browser primitive exists for its pan and its
zoom. It takes that control the same way every claim is made — by declaring the
handlers: the raw touch family and `onWheel`, on the App itself, which for once
really is the smallest view that needs it.

```declare-fragment
App [ clip = true,                                   // a fixed window: the frame never scrolls
    onTouchStart(e)  { engine.begin(e.touches) },
    onTouchMove(e)   { engine.track(e.touches) },
    onTouchEnd(e)    { engine.release(e.touches) },
    onTouchCancel(e) { engine.abort() },
    onWheel(e)       { engine.wheel(e) },            // the desktop half: trackpad pan and pinch
    ]
```

Every finger now arrives with a stable `id` for the life of its contact;
`e.touches` is every finger currently down, `e.changed` the one this event is
about, and coordinates are root-space throughout — a gesture engine wants one
fixed frame. `onWheel` is the desktop half of the same ownership: a trackpad
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

## The heartbeat

The other half is time — the heartbeat that integrates what the fingers report.
`Frames` is a member, like a `Spring` or a `Dataset`, that calls `onFrame(dt)`
once per animation frame with the real elapsed time in seconds:

```declare
App [ width = 240, height = 120, fill = midnightblue, textColor = whitesmoke,
    x0: number = 20,
    v: number = 60,
    physics: Frames [ onFrame(dt) { app.x0 = (app.x0 + app.v * dt) % 200 } ],
    dot: View [ x = { app.x0 }, y = 40, width = 40, height = 40, cornerRadius = 20, fill = turquoise ],
    ]
```

`running` gates it (`running = { app.simulating }`), `dt` is clamped so a backgrounded
tab does not resume with one enormous step, and it rides the same clock every `Spring`
and `Animator` uses — so it costs nothing until it runs, and there is no second frame
loop. Reach for it when you are integrating something yourself; for "move this there,
smoothly," a `Spring` is less code and better behaved.

---

**What you can now say:** you can design an interface fingers can actually use, you
can name who owns any gesture over any view — and change the answer by declaring a
handler — and you know exactly what an app that takes full gesture control owes its
user in return.

[Next: **Run it, check it, ship it** →](declare-docs:guide:loop)
