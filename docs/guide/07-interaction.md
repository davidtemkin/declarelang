<!-- nav: Interaction -->
<!-- part: Building -->

# Nothing bubbles

A program hears the user through **handlers** — methods whose names begin with `on`.
There is no `addEventListener`, no listener cleanup, and no bubbling: an event fires on
the one node it happened to, and when something *else* needs to know, the handler
tells it directly. That is the whole routing model, and it fits in a sentence:

> **Handlers fire where they're declared; children deliver by calling methods.**

## Interaction state you never wire

Hover and press are not events you route — they are **read-only attributes every view
already has**. `hovered` is true while the view is on the live *hit chain*: the topmost
visible view under the pointer, plus its ancestors — occlusion-correct, so anything
covering a view suppresses it, and always false on touch. `pressed` is true from a
pointer-down on the chain until release — drag off a button and it lets go, drag back
and it re-arms, the way native buttons behave. You read them; the runtime keeps them
true:

```declare
App [ width = 220, height = 100, fill = white,
    n: number = 0,
    btn: View [ x = 20, y = 20, width = 160, height = 40, cornerRadius = 10,
        fill = { pressed ? 0x2E5BD0 : hovered ? 0x3B74FF : 0x4C8DFF },
        onClick() { app.n = app.n + 1 },
        Text [ x = 40, y = 10, textColor = white, text = { `clicks: ${app.n}` } ]
        ]
    ]
```

No declarations, no `onPointerOver` bookkeeping — the four handlers and two booleans this
took before the intrinsics existed are simply gone, and what remains is the one line
that was ever the point: the `fill` constraint. Everything composes as usual: gate a
State on it (`applied = { hovered }`), read another view's (`visible =
{ parent.parent.hovered }`), or spring from it. Because the chain derives from
geometry too, a view that *moves* under a stationary cursor updates — and because the
chain is occlusion-correct, one transparent view laid over a region silences every
hover beneath it (the "activation glass" idiom: how a desktop declares
click-to-activate windows). Declaring or assigning `hovered`/`pressed` is a compile
error that says so — like `contentWidth`, they are computed for you. For controls, the
library's `Control` derives a styling pair from them (`hot`/`down` — the intrinsics
gated by `disabled`, plus the keyboard flash), which is what its buttons paint with.

## Two layers: what happened, and what it meant

Every pointer handler belongs to one of two layers, and choosing between them is the
whole skill.

The **raw layer** — `onPointerDown`, `onPointerMove`, `onPointerUp` — reports what the
pointer physically did, the instant it did it. No waiting, no interpretation; a press
is a press whether it came from a mouse button or a fingertip. This is the layer for
*manipulation*: dragging a card, tracking a slider, drawing on a canvas.

The **resolved layer** — `onClick`, `onDblClick`, `onHold` — reports that the user
*activated* this view. That is a judgment, not an event: the runtime watches the whole
gesture and decides. This is the layer for *commands*: buttons, links, menu items,
anything where "the user chose this" is the meaning.

> **`onClick` activates, `onPointerDown` manipulates.**

Reach for `onPointerDown` to run a command and it will misfire on a phone, because a
finger landing on your button may be starting a scroll — and only the resolved layer
knows the difference. What the runtime decides, precisely:

- A **click** needs press and release on the same view *and* a pointer that never
  wandered — about 4px for a mouse, 10px for a finger. Past that the gesture was a
  drag or a swipe, whatever it started on, and it activates nothing. (With a mouse,
  movement inside a target is meaningless; you are still pointing at it. With a
  finger, movement is the entire vocabulary of scrolling.)
- A **double-click** is two clicks on the same view, in about the same place, inside
  400ms. A third tap starts a fresh pair rather than making a second double.
- A **hold** is a press that stays in place for half a second. It does not consume the
  gesture: the raw stream keeps flowing and the eventual click still fires, so a hold
  can start a drag, open a menu, or be ignored.

One nicety you get for declaring things rather than configuring them: if a view
declares `onDblClick`, the runtime **holds its single click** for the double window,
so a double-click never performs the single action first. A view with only `onClick`
— nearly all of them — fires immediately, with no added latency. You pay for the
ambiguity exactly where you asked for it.

## The drag pattern

Down, move, up on one node is the entire shape. The pressed view **captures** the
pointer: until release, moves and the release itself come to it even when the pointer
travels far away, so there is no tracking code to write.

```declare
App [ width = 300, height = 160, fill = white,
    card: View [ x = 20, y = 40, width = 120, height = 80, cornerRadius = 10, fill = 0x4C8DFF,
        grabX: number = 0,
        onPointerDown(e: PointerEvent) { grabX = e.x },                    // view-local: where in the card you grabbed
        onPointerMove(e: PointerEvent) { x = Math.max(0, Math.min(180, e.x - grabX)) }   // root-space: minus the grab
        ]
    ]
```

Drag the card. There is no click-versus-drag bookkeeping here, because the runtime's
click rule already covers it: a gesture that moved is a drag and activates nothing, so
an `onClick` on this same card would fire only on a real tap.

Two things worth knowing about the coordinates and the ending:

**`onPointerMove` and `onPointerUp` carry *root-space* coordinates** — measured against the
whole app — while `onPointerDown`, `onClick`, and `onDblClick` carry view-local ones. A
drag needs a frame that does not move with the thing being dragged, which is why the
two differ.

**A gesture can be interrupted.** On a touch screen the browser may reclaim a gesture
mid-flight to scroll the page, which ends your drag without a release. That still
arrives as `onPointerUp`, so state resets — but the event says which it was:

```declare-fragment
onPointerUp(e: PointerUpEvent) {
dragging = false                       // always reset
if (e.canceled) return                 // …but never commit an interrupted drag
classroot.commitMove(this.x, this.y)
    }
```

## Drag and click on one view

The card above only drags. The calendar's event block does more: tap it and a
detail panel opens; drag it and the event moves to another day. Both live on one
view, and declaring the raw handlers does not steal the tap:

```declare-fragment
block: View [
    onPointerDown(e: PointerEvent) { app.startDrag(:id, e.x, e.y) },
    onPointerMove()  { app.dragMove() },
    onPointerUp(e: PointerUpEvent)   { app.dropDrag(e.x, e.y) },
    onClick()      { app.selectEvent(:id) }        // still fires — on a real tap
    ]
```

The two layers are not either/or. They ride the *same* gesture, and the slop rule
from earlier is the one arbiter between them. A press that never wanders is a
tap: the raw stream saw a down and an up, your drag saw nothing worth moving, and
`onClick` fires — the panel opens. A press that wanders is a drag: `onPointerMove`
drives it, and the resolved layer stays silent, so the panel never flashes open
at the end of a drop. There is no `if (moved)` to write on the click side — a
gesture that moved activates nothing, and that was never your rule to enforce.

One habit completes the pattern. Raw moves are raw: they start arriving *before*
the slop is crossed, so a drag that moves its view from the very first move will
wiggle it a few pixels under a slightly sloppy tap. The idiom — the calendar's —
is to keep a small threshold of your own for when the drag becomes *visible* (its
drag ghost appears after ~4px) and to commit on release only if the drag ever
became real. That threshold is presentation, not click suppression; the click
already died of wandering.

On a touch screen there is one more party to the arbitration: declaring the drag
handler claims that finger from the browser over that view — and when the
draggable thing sits on a *scrolling* surface, pairing the drag with `onHold`
moves that claim to the press-and-hold, so a quick swipe still scrolls. The full
ownership story is [the Gestures chapter](declare-docs:guide:gestures).

## Tap and hold

A press held in place fires `onHold` — the touch analog of a right-click, and equally
available to a mouse. What happens next is yours to decide; the runtime only reports
the fact.

```declare-fragment
row: View [ width = 200, height = 40,
    onHold()  { classroot.showActions(this) },     // a menu, a pick-up, a peek…
    onClick() { classroot.open(this) }
    ]
```

Because a hold does not consume the gesture, a view can offer both, as above: hold for
options, tap to open.

## Finding what is under the pointer

A drag that must *land* somewhere needs to know what it is over. Ask the tree:

```declare-fragment
onPointerUp(e: PointerUpEvent) {
if (e.canceled) return
let t = app.viewAt(e.x, e.y)                  // root-space, like the event
while (t != null && t.accept == null) t = t.parent
if (t != null) t.accept(this.payload)
    }
```

`app.viewAt(x, y)` answers with the deepest view under a root-space point, and
`view.containsPoint(x, y)` asks the same question of one view. Both run the *same* walk
the pointer itself is routed by — clip shapes, scale, `pointerEvents`, and overflow all
count exactly as they do for a real press — so what your handler computes and what the
runtime delivers can never disagree.

The idiomatic drop target combines the two layers: the dragger decides with `viewAt`
and writes **one** reactive slot; every target derives its appearance from that slot by
constraint.

```declare-fragment
// on the dragger

onPointerMove(e: PointerEvent) { app.dropTarget = app.viewAt(e.x, e.y) },

// on each target — no handlers, just a standing relationship

hot = { app.dropTarget == this }
```

One writer, many readers, and the highlight is a constraint like everything else.

## Reaching another node: call a method

When a handler must affect something beyond its own node, it does not dispatch an
event upward — it **calls a method** on the node that owns the behavior, reached by a
[scope noun](declare-docs:guide:tree):

```declare-fragment
class Row extends View [
    onClick() { classroot.select(this) }      // tell the list; nothing bubbles
    ]
```

The call *is* the notification, and because the method's assignments are reactive,
one call updates every constraint that read the changed state. Event routing you
can't see — capture phases, propagation stops, a listener three components up — is a
class of bug this model simply doesn't have. ("The whole panel is clickable" is an
`onClick` on the panel itself, not a bubbled child event.)

## The keyboard

A **focused** view receives `onKeyDown`/`onKeyUp` like any other handler — right for
keys that belong to a particular widget. For app-level shortcuts that should work
regardless of focus, put a `Keys` member in the tree. It is a **source**: a non-visual
member, like a `Dataset` or a `Spring`, whose handlers are called by something outside
the tree. Its lifetime is the node's, so there is nothing to unsubscribe:

```declare
App [ width = 240, height = 100, fill = white, textColor = black,
    n: number = 0,
    keys: Keys [
        onKeyUp(e: KeyEvent) {
            if (e.key == "ArrowUp") { app.n = app.n + 1 }
            else if (e.key == "ArrowDown") { app.n = app.n - 1 }
            }
        ],
    Text [ x = 20, y = 30, fontSize = 30, text = { `n = ${n}` } ]
    ]
```

Click the preview once, then use the arrow keys. The payload is a normalized key
event — `e.key` (`"ArrowUp"`, `"Escape"`, `"a"`), `e.code`, modifier flags — never a
numeric code. `Keys` is the *raw* stream: it fires even while a text field has focus,
so gate shortcuts on app state where that matters.

The other sources work the same way: `Focus` (`onFocusChange`, `onGeometry` — how the
library's focus ring follows focus), `Tip` (`onTip` — what the tooltip renders), and
`Frames` (`onFrame(dt)` — the frame heartbeat, in
[the Gestures chapter](declare-docs:guide:gestures)). Fan-out is by instance, which is
the point of their being members: a menu, a dialog, and a menubar each holding a `Keys`
member all hear the keyboard at once.

`Keys` and `Focus` each name one concept that you can either **ask** or **listen to** —
`Keys.isDown("KeyA")` and `Focus.focus(this)` are calls you make; `Keys [ onKeyDown … ]`
and `Focus [ onFocusChange … ]` are members that call you. You cannot listen to another
*view's* events — that is what calling a method is for.

---

**What you can now say:** you can make anything respond — pointer, drag, keyboard —
route behavior without invisible event plumbing, and let one view carry a drag and a
click without writing the arbitration yourself.

[Next: **Derive down, deliver up** →](declare-docs:guide:controls)
