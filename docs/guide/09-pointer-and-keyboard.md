<!-- nav: Pointer and keyboard -->
<!-- part: Building -->

# Pointer and keyboard

A program hears the user through **handlers** — methods whose names begin with `on`.
There is no `addEventListener`, no listener cleanup, and no bubbling: an event fires on
the one node it happened to, and when something else needs to know, the handler tells it
directly by calling a method.

> **Handlers fire where they are declared. A child tells its owner by calling a method.**

## Hover and press are facts

Every view carries two read-only facts, [`hovered`](declare-docs:View.hovered) and [`pressed`](declare-docs:View.pressed), and the runtime keeps
them true. `hovered` is true while the pointer is over the view and nothing covers it;
it is always false on a touch screen. `pressed` is true from a press on the view until
release — slide off and it lets go, slide back and it re-arms, the way native buttons
behave. You read them in constraints; you never assign them (the compiler says so).

A control adds a pair derived from those facts, [`hot`](declare-docs:Control.hot) and [`down`](declare-docs:Control.down): the same facts, gated
by `disabled`, with keyboard activation folded into `down`. Style a control from `hot`
and `down`, so a disabled control never lights up:

```declare
class Tile extends Control [ width = 90, height = 70, cornerRadius = 10,
    label: string = "",
    picked: boolean = { app.choice == label },
    fill = { down ? 0xC9D6E8 : hot ? 0xDDE6F2 : 0xEEF2F7 },
    stroke = { picked ? stroke(2, 0x2E6FE0) : null },
    press() { app.choose(label) },
    Text [ x = center, y = center, text = { classroot.label } ]
    ]

App [ width = 340, height = 150, fill = white, textColor = #172530,
    choice: string = "",
    choose(v: string) { choice = v },
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 12 ],
        row: View [ layout: SimpleLayout [ axis = x, spacing = 10 ],
            Tile [ label = "North" ], Tile [ label = "South" ], Tile [ label = "East" ]
            ],
        Text [ text = { app.choice == "" ? "pick a tile — or Tab to one and press Space" : "picked " + app.choice } ]
        ]
    ]
```

Hover, press, click, then Tab to a tile and press Space. The keyboard reaches each tile
because it is a [`Control`](declare-docs:Control): `press()` is the one activation path, shared by click and
keyboard ([Custom components](declare-docs:guide:custom-components@what-extends-control-gives-you) covers what
`Control` provides). On a plain view, `hovered` and `pressed` are there for
non-interactive effects — a card that lifts under the pointer, a hover reveal.

## Telling another node: call a method

When a handler must affect something beyond its own node, it does not dispatch an event
upward. It **calls a method** on the node that owns the behavior. In the example, each
tile calls `app.choose(label)`, and `picked` on every tile is a constraint on
`app.choice`. The call is the notification, and because the method's assignments are
reactive, one call updates everything that read the changed state. Invisible event
routing — capture phases, propagation stops, a listener three components up — is a
class of bug this model does not have.

## Two layers: what happened, and what it meant

Every pointer handler belongs to one of two layers, and choosing between them is the
whole skill.

The **raw layer** — `onPointerDown`, `onPointerMove`, `onPointerUp` — reports what the
pointer physically did, the moment it did it. It is for *manipulation*: dragging a card,
tracking a slider, drawing.

The **resolved layer** — `onClick`, `onDblClick`, `onHold` — reports that the user
*activated* this view. That is a judgment the runtime makes by watching the whole
gesture, and it is for *commands*: buttons, links, menu items.

> **`onClick` activates. `onPointerDown` manipulates.**

Run a command from `onPointerDown` and it will misfire on a phone, because a finger
landing on your button may be starting a scroll; only the resolved layer knows the
difference. What the runtime decides:

- A **click** is a press and release on the same view, with a pointer that never
  wandered far — about 4 pixels for a mouse, 10 for a finger. A gesture that moved
  further was a drag or a swipe, and it activates nothing.
- A **double-click** is two clicks on the same view, in about the same place, within
  400 ms. Declaring `onDblClick` makes a view hold its single click for that window, so
  a double-click never runs the single action first; a view with only `onClick` fires
  immediately.
- A **hold** is a press that stays in place for half a second. It does not consume the
  gesture: the raw stream continues and the eventual click still fires, so a hold can
  open a menu, start a pick-up, or be ignored.

## Dragging

Down, move and up on one view is the whole pattern. The pressed view **captures** the
pointer: until release, moves and the release come to it even when the pointer travels
away, so there is no tracking code to write.

```declare
App [ width = 320, height = 160, fill = white,
    card: View [ x = 20, y = 40, width = 120, height = 80, cornerRadius = 10, fill = 0x4C8DFF,
        grabX: number = 0,
        onPointerDown(e: PointerEvent) { grabX = e.x },
        onPointerMove(e: PointerEvent) { x = Math.max(0, Math.min(180, e.x - grabX)) }
        ]
    ]
```

Two details matter. **Coordinates:** `onPointerDown` and `onClick` carry positions in the
view's own coordinates, while `onPointerMove` and `onPointerUp` carry them in the app's
root coordinates — a drag needs a frame that does not move with the thing being dragged.
**Interruptions:** on a touch screen the browser may take a gesture back mid-drag to
scroll. That still arrives as `onPointerUp`, with `canceled` set, so reset your state and
do not commit:

```declare-fragment
onPointerUp(e: PointerUpEvent) {
    dragging = false                          // always reset
    if (e.canceled) return                    // but never commit an interrupted drag
    classroot.commitMove(this.x, this.y)
    }
```

**Drag and click on one view** need no arbitration code. A press that never wanders is a
tap, and `onClick` fires; a press that wanders is a drag, and `onClick` stays silent. The
calendar's event blocks open on a tap and move on a drag with exactly this. One habit
completes it: raw moves start arriving before the click threshold is crossed, so a drag
that moves its view from the first move will wiggle a few pixels under a sloppy tap.
Keep a small threshold of your own before the drag becomes visible, and commit on
release only if it did.

On a touch screen, declaring a drag handler also takes that finger from the browser over
the view — and pairing it with `onHold` moves that to the press-and-hold, so a quick
swipe still scrolls. [Touch and gestures](declare-docs:guide:touch) is the full story.

## Finding what is under the pointer

A drag that must land somewhere needs to know what it is over. Ask the tree:
`app.viewAt(x, y)` answers with the deepest view under a root-space point, and
`view.containsPoint(x, y)` asks the same of one view. Both use the same walk the pointer
itself is routed by — clipping, scale, scrolling and [`pointerEvents`](declare-docs:View.pointerEvents) all count — so what
your handler computes and what a press would hit never disagree.

The idiomatic drop target: the dragger decides with [`viewAt`](declare-docs:View.method.viewAt) and writes **one**
attribute; every target derives its look from it.

```declare-fragment
// on the dragger
onPointerMove(e: PointerEvent) { app.dropTarget = app.viewAt(e.x, e.y) },

// on each target — no handler, just a constraint
hot = { app.dropTarget == this }
```

One thing to get right: `viewAt` answers *what a press would hit*, and your drag ghost is
under the pointer. Give the ghost `pointerEvents = "none"` — and any container it sits
in — or the ghost is always the answer. A container with no size set grows with a ghost
that follows the pointer, becoming an invisible box over the very targets you are
dragging onto. If a target never highlights, `__declare.explainHit(x, y)` in the console
names what actually takes the press.

## The keyboard

A focused view receives `onKeyDown` and `onKeyUp` — right for keys that belong to one
widget. For app-wide shortcuts that work regardless of focus, add a [`Keys`](declare-docs:Keys) member. Like
a [`Dataset`](declare-docs:Dataset) or a [`Spring`](declare-docs:Spring), it is a child with no pixels, and it lives as long as the node
that declares it:

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

Click the preview, then use the arrow keys. The event carries `key` (`"ArrowUp"`,
`"Escape"`, `"a"`), `code`, and modifier flags. `Keys` hears every key, even while a text
field has focus, so gate shortcuts on app state where that matters. [`Keys.isDown("ShiftLeft")`](declare-docs:Keys.method.isDown)
asks whether a key is held right now — how a click decides whether it extends a
selection. Several `Keys` members all hear the keyboard; each lives with its owner.
Keyboard focus itself is in [Controls](declare-docs:guide:controls@keyboard-focus).

---

**What you can now do:** style from hover and press, route behavior by calling methods,
choose between the raw and resolved layers, let one view carry a drag and a click, find
what is under the pointer, and handle keys.

[Next: **Touch and gestures** →](declare-docs:guide:touch)
