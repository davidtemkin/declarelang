<!-- nav: Pointer and keyboard -->
<!-- part: Building -->

# Pointer and keyboard

A program hears the user through **handlers** — methods whose names begin with `on`.
There is no `addEventListener`, no listener cleanup, and no bubbling: an event fires on
the one node it happened to, and when something else needs to know, the handler tells it
directly by calling a method.

> **Handlers fire where they are declared. A child tells its owner by calling a method.**

## Hover and press

Every view carries two read-only facts, [`hovered`](declare-docs:View.hovered) and [`pressed`](declare-docs:View.pressed), and the runtime keeps
them true. `hovered` is true while the pointer is over the view and nothing covers it;
it is always false on a touch screen. `pressed` is true from a press on the view until
release — slide off and it lets go, slide back and it re-arms, the way native buttons
behave. You read them in constraints; you never assign them (the compiler says so).

On a control the same two facts answer under its policy: both are false while it is
`disabled`, and `pressed` is also true while a keyboard press (Space or Enter) activates
it. So a control styles from `hovered` and `pressed` too, and a disabled one never lights up:

```declare
class Tile extends Control [ width = 90, height = 70, cornerRadius = 10,
    label: string = "",
    picked: boolean = { app.choice == label },
    fill = { pressed ? 0xC9D6E8 : hovered ? 0xDDE6F2 : 0xEEF2F7 },
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
keyboard ([Your own views](declare-docs:guide:your-own-views@what-extends-control-gives-you) covers what
`Control` provides). On a plain view, `hovered` and `pressed` are there for
non-interactive effects — a card that lifts under the pointer, a hover reveal.

## Calling another node

When a handler must affect something beyond its own node, it does not dispatch an event
upward. It **calls a method** on the node that owns the behavior. In the example, each
tile calls `app.choose(label)`, and `picked` on every tile is a constraint on
`app.choice`. The call is the notification, and because the method's assignments are
reactive, one call updates everything that read the changed state. Invisible event
routing — capture phases, propagation stops, a listener three levels up — is a
class of bug this model does not have.

## Raw and resolved events

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
  400 ms. The first click arrives at once, as on every platform, and a view that declares
  `onDblClick` hears the second as `onDblClick` rather than a second `onClick`. So make the
  single click something the double builds on: select on one click, open on two.
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
        startX: number = 0,
        onPointerDown(e: PointerEvent) { startX = x },
        onPointerMove(e: PointerEvent) { x = Math.max(0, Math.min(180, startX + e.deltaX)) }
        ]
    ]
```

Two details matter. **Coordinates:** every pointer event carries its point both ways —
`x`/`y` in the view's own coordinates, and `rootX`/`rootY` in the app's root coordinates —
plus `deltaX`/`deltaY`, how far the pointer has moved since the press. A drag reads the
root frame, because it does not move with the thing being dragged; `deltaX` is that frame
already subtracted, which is why the card above needs only where it started.
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

A drag handler claims the drag over the view's whole subtree, so a press that lands on a
control inside it and then travels is the view's drag, not the control's; the control
keeps a press that stays put. On a touch screen, declaring a drag handler also takes that
finger from the browser over the view — and pairing it with `onHold` moves that to the
press-and-hold, so a quick swipe still scrolls.
[Touch and gestures](declare-docs:guide:touch@gesture-claims) is the full story.

## Finding what is under the pointer

A drag that must land somewhere needs to know what it is over. Ask the tree:
`app.viewAt(x, y)` answers with the deepest view under a root-space point, and
`view.containsPoint(x, y)` asks the same of one view. Both use the same walk the pointer
itself is routed by — clipping, scale, scrolling and [`pointerEvents`](declare-docs:View.pointerEvents) all count — so what
your handler computes and what a press would hit never disagree.

**A drag that rearranges is a change to the data.** What the person moves by hand, a row up a
list or a card to another column, is a record changing its place. Move the record as the
drag crosses a place, and let the arrangement show it: the views follow their records, and
[a layout that animates](declare-docs:guide:animated-arrangements) glides the rest. Only the
dragged view is the pointer's.

The idiomatic drop target: the dragger decides with [`viewAt`](declare-docs:View.method.viewAt) and writes **one**
attribute; every target derives its look from it.

```declare-fragment
// on the dragger
onPointerMove(e: PointerEvent) { app.dropTarget = app.viewAt(e.rootX, e.rootY) },

// on each target — no handler, just a fact of its own and a look that reads it
under: boolean = { app.dropTarget == this },
fill = { under ? 0xDCE8F8 : null }
```

`hovered` is the pointer's own fact and nothing may set it; a target names its own
(`under` here) and derives from that.

`viewAt` answers what a press would hit, and the dragged view is under the pointer: pass it
as the third argument, `app.viewAt(e.rootX, e.rootY, ghost)`, and the walk skips it.

## Keyboard events

A focused view receives `onKeyDown` and `onKeyUp` — right for keys that belong to one
widget. For keys the whole app hears regardless of focus, add a [`Keys`](declare-docs:Keys) member (a
command with a label — Save, Find — is a [shortcut](#keyboard-shortcuts), below). Like
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
field has focus, so gate single-key handling on app state where that matters. A pointer
event carries the keys held with it, by the same names — `e.shift`, `e.meta`, `e.ctrl`,
`e.alt` — so a click decides from its own event whether it extends a selection (Shift) or
adds to one (⌘, Ctrl off the Mac). [`Keys.isDown("ShiftLeft")`](declare-docs:Keys.method.isDown)
asks about any key at any moment. Several `Keys` members all hear the keyboard; each lives
with its owner.
Keyboard focus itself is in [Controls](declare-docs:guide:controls@keyboard-focus).

A key a view polls with `Keys.isDown` is the program's while that view is shown: the
browser's own use of the key stands down — Space and the arrows don't scroll the page, a
letter doesn't start the browser's find — unless Command, Control or Option is held, or a
text field has focus. A game reads its keys with `Keys.isDown` and gets exactly this.

When a page runs more than one program — another program in an
[`AppIsland`](declare-docs:AppIsland), as a desktop runs one in each window — the
keyboard goes where focus is. Focus on a view gives it to that view's program; focus on
an island gives it to the program inside; with nothing focused, the outer program has it.
Only that program's `Keys` members hear keys, and its `Keys.isDown` alone answers yes. A
host hands a program the keyboard by focusing its island (a focusable island, and
`onPointerDown() { Focus.focus(this) }`), and a program can take it by focusing one of
its own views. A key held as the keyboard moves on is released, for the program that
had it.

### Keyboard shortcuts

A command a person can also pick — Save, New, Find — is a shortcut, and a shortcut is
**data**: a [`Shortcuts`](declare-docs:Shortcuts) member holds records with the key, the
label a person reads, and the id its `picked` receives.

```declare
App [ width = 520, height = 240,
    saved: number = 0,
    keys: Shortcuts [ title = "Notes",
        items = { [ ({ id: "save", key: "⌘S", label: "Save" }), ({ id: "clear", key: "⇧⌘K", label: "Clear" }) ] },
        picked(id: string) { if (id == "save") app.saved = app.saved + 1 }
        ],
    Text [ x = 20, y = 20, text = { "Saved " + app.saved + " times — press ⌘S" } ]
    ]
```

A set covers the view it is declared on. A press is looked up from the focused view outward,
and the nearest set that declares the key takes it — so a pane can give ⌘F a meaning of its
own while the rest of the program keeps the App's. The walk goes on past the program: a
program in an island reaches its host's shortcuts. A shortcut that fires is not also a
`Keys` event, and not also the browser's (⌘S does not save the page). A plain key (`"?"`)
stands down while a text field has focus. While an open menu, dialog or sheet holds the
keyboard, its keys are its own: the shortcuts declared inside it are in force — a form in a
sheet declares its own `Shortcuts`, and they work while it is open — and every set outside it
stands down, as do the keys the overlay itself uses (Esc, and a menu's arrows).

A [`MenuBar`](declare-docs:MenuBar)'s items carry their keys already (`key: "⌘N"`), and
those are its program's shortcuts, so a program with a menu bar declares them once.
[`Keys.shortcutsInForce()`](declare-docs:Keys.method.shortcutsInForce) lists what is in force
where focus is, for a panel of them, and a `Keys` member hears ⌘ held alone as
[`onCommandHeld`](declare-docs:Keys.event.commandHeld).

`Keys` stays the channel for keys that are not commands: a game's arrows, a key held to
extend a selection.

## Files dropped on a view

A view that declares [`onFilesDrop`](declare-docs:View.event.filesDrop) takes the person's files dragged onto it — the
deepest such view under the drag, as with a press — with `onFilesOver` and `onFilesOut` to
light it while they are over it. What a file is, and what to do with one, is in
[Data](declare-docs:guide:data@files).

---

**What you can now do:** style from hover and press, route behavior by calling methods,
choose between the raw and resolved layers, let one view carry a drag and a click, find
what is under the pointer, handle keys, declare shortcuts, and take the person's files.

[Next: **Touch and gestures** →](declare-docs:guide:touch)
