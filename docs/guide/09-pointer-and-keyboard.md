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
pointer physically did, the moment it did it: a press, every move (hovering too), a
release.

The **resolved layer** — `onClick`, `onDblClick`, `onHold`, and the drag: `onDragStart`,
`onDrag`, `onDragEnd` — reports what the person *meant*. That is a judgment the runtime
makes by watching the whole gesture: a click is for *commands* (buttons, links, menu
items), a drag for *manipulation* (moving a card, sliding a thumb, drawing).

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
- A **drag** is a press that wandered — the click's mirror, never both: it begins at the
  press on a view that takes no clicks, otherwise once the pointer passes the click
  threshold. The next section.

## Dragging

A press either stays put or wanders. If it stays put and lifts, it is a click. If it
wanders, it is a drag, and the view hears it in three moments:

- **`onDragStart(e)`**: the press has become a drag. `e.x`/`e.y` are where the press began.
  The place to note where things stood — the card's position, the item's index — and to
  draw what a drag looks like: lift the item, leave a ghost where it was.
- **`onDrag(e)`**: every move until release, even outside the view's box — the view
  **captures** the pointer, so there is no tracking code to write. `e.deltaX`/`e.deltaY` are
  how far the pointer has gone since the press, so the usual handler is one line. Near the
  edge of a scrolling pane, the pane moves and `onDrag` keeps arriving.
- **`onDragEnd(e)`**: released — or taken back, with `canceled` set: Escape pressed, the
  window losing focus, the system interrupting a touch. The place to commit, or to put
  things back.

```declare
App [ width = 320, height = 160, fill = white,
    card: View [ x = 20, y = 40, width = 120, height = 80, cornerRadius = 10, fill = 0x4C8DFF,
        startX: number = 0,
        onDragStart(e: PointerEvent) { startX = x },
        onDrag(e: PointerEvent) { x = Math.max(0, Math.min(180, startX + e.deltaX)) },
        onDragEnd(e: DragEndEvent) { if (e.canceled) x = startX }
        ]
    ]
```

How it looks is yours: a drag that follows the pointer, one that moves only in steps
(`x = Math.round((startX + e.deltaX) / 40) * 40`), a ghost left at the origin while a copy
moves — the three moments are where you draw it.

**Drag and click on one view** need no arbitration code: a press is one or the other,
never both. A view that takes no clicks drags from the moment it is pressed, so it
follows the pointer from the first pixel. A view that also takes clicks — `onClick`,
`onDblClick`, `onHold`, a `link` — waits until the press has wandered a few pixels (about 4
for a mouse, 10 for a finger), so a tap stays a tap, and a press that wandered never clicks.
Whatever must happen at the press itself — a slider's thumb jumping to the point pressed —
belongs in `onPointerDown`.

A drag claims the gesture over the view's whole subtree, so a press that lands on a control
inside it is the control's while it stays put, and the view's drag once it wanders. On a
touch screen, a finger moving on a view that drags drags it instead of scrolling the list
it sits in — so a draggable row in a scrolling list declares `onHold` (a quick swipe still
scrolls; a press-and-hold picks the row up) or `claim = x` (it drags across, the list
scrolls along). [Touch and gestures](declare-docs:guide:touch@gesture-claims) is the full
story.

**Give every drag that changes data another way in.** Someone using a keyboard, or a switch,
or who cannot hold a press while moving, needs to make the same change: arrow keys on the
focused item, a button or a menu command ("Move to…"), or tap-to-select then tap-to-place.

**Following the pointer without a press** is `onPointerMove`: it hears every move over the
view, hovering included (`e.down` says whether a press is under way), in the view's own
coordinates. For the pointer's position as state — a spotlight that trails the cursor
anywhere on the page — read `app.pointerX`/`pointerY` in a constraint instead.

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
onDrag(e: PointerEvent) { app.dropTarget = app.viewAt(e.rootX, e.rootY) },

// on each target — no handler, just a fact of its own and a look that reads it
under: boolean = { app.dropTarget == this },
fill = { under ? 0xDCE8F8 : null }
```

`hovered` is the pointer's own fact and nothing may set it; a target names its own
(`under` here) and derives from that.

`viewAt` answers what a press would hit, and the dragged view is under the pointer: pass it
as the third argument, `app.viewAt(e.rootX, e.rootY, ghost)`, and the walk skips it.

## Keyboard events

A key goes to the view that has keyboard focus (how focus moves is in
[Controls](declare-docs:guide:controls@keyboard-focus)) and from there outward — the view,
its container, that one's container, out to the App — and the first view that binds the key
takes it. After the App come the standard keys: Tab and Shift-Tab move focus, and F6 moves
between regions (Esc then Tab too, where a browser keeps F6 for itself). A key nothing takes
is left to the browser, which may scroll the page with it. So:

- **The nearest view wins.** A focused slider's arrows come before an arrow the App binds;
  a pane can give ⌘F a meaning of its own while the rest of the program keeps the App's.
- **A text field keeps its typing** and its editing keys — ⌘A, ⌘C, ⌘X, ⌘V, ⌘Z and the
  caret's moves — as text fields do everywhere. Tab, Escape and Enter go on from it.
- **An open sheet or dialog holds the page's keys back.** With focus inside one, the walk
  ends at it: the page's ⌘S doesn't save behind a sheet, while Tab still moves within it.
  An open menu or list takes its own keys — the arrows, Enter, Escape.
- **A key with Ctrl, Alt or a function key** reaches the bindings before any `onKeyDown`,
  below, so a handler can't swallow ⌘S by mistake.
- **A program in an [`AppIsland`](declare-docs:AppIsland)** — one in each of a desktop's
  windows — keeps its plain keys, while a chord it doesn't take goes on to the program around
  it: the desktop's ⌘W closes the window.

### Key bindings

A view says which keys it answers with `keyBindings`: records naming a key and the method
it runs.

```declare
App [ width = 320, height = 140, fill = white, textColor = black,
    n: number = 0,
    counter: View [ x = 20, y = 20, width = 280, height = 60, focusable = true,
        keyBindings = { [ ({ key: "ArrowUp", command: "bump", args: [1] }),
            ({ key: "ArrowDown", command: "bump", args: [-1] }),
            ({ key: "Escape", command: "reset" }) ] },
        bump(d: number) { app.n = app.n + d },
        reset() { app.n = 0 },
        Text [ x = 10, y = 18, fontSize = 20, text = { `n = ${app.n}` } ] ]
    ]
```

Click the counter, then use the arrows and Escape. `command` names a method of the view the
table is on; `args`, when there are any, come before the key event it is given. The library's
controls answer their keys the same way — a `Button`'s Space and Enter are bindings — and a
class's table and a use site's add up: a use site's bindings come first, the class's are
still there, and a binding with `command: null` takes an inherited key away.

A command that does its part and returns `false` hands the key on to whatever would have
had it next — a search field that clears on Escape, then lets Escape close the sheet it is
in. When the next step is one you know, call it: a cell whose Tab saves the cell, then calls
`Focus.next()`.

Keys are spelled the Windows way — `"Ctrl+S"`, `"Ctrl+Shift+Z"`, `"Alt+ArrowLeft"`,
`"Enter"`, `"Space"` — and on a Mac Ctrl is ⌘ and Alt is ⌥ (`MacCtrl` is its Control key);
the Mac's glyphs, `"⌘S"`, are accepted too. A typed symbol is written as it is typed:
`"Ctrl+}"`, not `"Ctrl+Shift+]"`. A binding can also say:

- `code: "KeyW"` — the physical key, whatever the layout (a game's WASD);
- `when: "methodName"` — the binding is there only while that method says so;
- `enabled: false` (or a method's name) — shown greyed, it takes the key and does nothing;
- `repeat: false` — a held key's repeats are taken but don't run it again;
- `label` and `group` — what the [hold-⌘ panel](#keyboard-shortcuts) shows;
- `everywhere: true` — an App binding that still reaches past an open sheet or dialog;
- `command: "native"` — the platform's own use of the key, as a text field's typing is.

`"Escape Tab"` is a sequence: a view that binds it takes Esc then Tab, the way out of a
region, for itself — a terminal does.

### Handling a key in code

A focused view also receives `onKeyDown` and `onKeyUp`, for keys that need code rather than a
name. The base `onKeyDown` is the walk itself, so an override takes the keys it wants and
hands the rest on — Tab included:

```declare-fragment
grid: View [ focusable = true,
    rows: number = 0,
    onKeyDown(e: KeyEvent) {
        if (e.key == "ArrowUp" && e.shift) rows = rows + 1
        else super.onKeyDown(e)
        } ]
```

The event carries `key` (`"ArrowUp"`, `"Escape"`, `"a"`), `code`, and the modifier flags. A
key neither taken nor handed on stops at the view, so an `onKeyDown` without `super` draws a
warning. A view that really takes every key — a game, a terminal — says so with
`takesAllKeys = true`.

### Commands: menus and buttons

A menu item or a button can run a **command** instead of an action of its own: a name,
looked up the way a key is. `({ label: "Bold", key: "Ctrl+B", command: "bold" })` in a
menu, or `Button [ label = "B", command = "bold" ]`, walks from where the person was
working — the last view focused that isn't a menu bar, a menu or a command button — outward,
and the first view whose `keyBindings` bind `bold` runs it. A binding with no key, `({
command: "bold" })`, says a view answers the command without a key of its own.

```declare
App [ width = 420, height = 200, fill = white, textColor = black,
    bolded: boolean = false,
    bar: View [ x = 20, y = 20, width = 380, height = 36,
        layout: SimpleLayout [ axis = x, spacing = 8 ],
        Button [ label = "Bold", command = "bold" ],
        Button [ label = "Clear", command = "clear" ] ],
    editor: View [ x = 20, y = 70, width = 380, height = 100, focusable = true, fill = 0xF4F4F4,
        keyBindings = { [ ({ key: "Ctrl+B", command: "bold" }), ({ command: "clear" }) ] },
        bold() { app.bolded = !app.bolded },
        clear() { app.bolded = false },
        Text [ x = 10, y = 10, text = { app.bolded ? "Bold is on — click here, then a button" : "Bold is off — click here, then a button" } ] ]
    ]
```

So a menu's Bold and Ctrl+B reach the same view, and a button doesn't take the focus from
what it acts on. As a menu opens, an item whose command no view answers is greyed. A
context menu's commands act on the view it was opened on. `copy`, `cut` and `paste` reach a
view's `onClipboardCopy`, `onClipboardCut` and `onClipboardPaste`, as the keys do
([Copy, cut and paste](#copy-cut-and-paste)); a Paste picked with the mouse can't read the
clipboard in a browser, so it is greyed there. Code can run one too: `Commands.run("bold")`.

### Keyboard shortcuts

A [`Shortcuts`](declare-docs:Shortcuts) member is the same kind of table spelled as data
delivered by id: records with the key, the label a person reads, and the id its `picked`
receives — useful when the commands are themselves data.

```declare
App [ width = 520, height = 240,
    saved: number = 0,
    keys: Shortcuts [ title = "Notes",
        items = { [ ({ id: "save", key: "Ctrl+S", label: "Save" }), ({ id: "clear", key: "Ctrl+Shift+K", label: "Clear" }) ] },
        picked(id: string) { if (id == "save") app.saved = app.saved + 1 }
        ],
    Text [ x = 20, y = 20, text = { "Saved " + app.saved + " times — press ⌘S" } ]
    ]
```

A set covers the view it is declared on and is read in the same walk, after that view's own
`keyBindings`. A shortcut that fires is not also a `KeyListener` event, and not also the browser's
(⌘S does not save the page). A [`MenuBar`](declare-docs:MenuBar)'s items carry their keys
already (`key: "Ctrl+N"`), and those are its program's shortcuts, so a program with a menu
bar declares them once.

Holding ⌘ alone (Ctrl elsewhere) shows the keys in force where focus is: every labelled
binding and every shortcut, each key once, from the nearest view that binds it.
[`Keyboard.shortcutsInForce()`](declare-docs:Keyboard.method.shortcutsInForce) lists the same, for a
panel of your own, and a `KeyListener` hears ⌘ held alone as
[`onCommandHeld`](declare-docs:KeyListener.event.commandHeld).

### Keys the program polls

A game reads the keyboard rather than answering keys: a [`KeyListener`](declare-docs:KeyListener)
member hears every key down and up wherever focus is, and
[`Keyboard.isDown("ShiftLeft")`](declare-docs:Keyboard.method.isDown) asks about any key at any
moment. Like a [`Dataset`](declare-docs:Dataset) or a [`Spring`](declare-docs:Spring), a
`KeyListener` is a child with no pixels, and it lives as long as the node that declares it:

```declare
App [ width = 240, height = 100, fill = white, textColor = black,
    n: number = 0,
    keys: KeyListener [
        onKeyUp(e: KeyEvent) {
            if (e.key == "ArrowUp") { app.n = app.n + 1 }
            else if (e.key == "ArrowDown") { app.n = app.n - 1 }
            }
        ],
    Text [ x = 20, y = 30, fontSize = 30, text = { `n = ${n}` } ]
    ]
```

Click the preview, then use the arrow keys. A `KeyListener` hears every key, even while a text field
has focus, so gate single-key handling on app state where that matters; it is not part of
the walk, and takes nothing from it. A key a view polls with `Keyboard.isDown` is the program's
while that view is shown: the browser's own use of it stands down — Space and the arrows
don't scroll the page, a letter doesn't start the browser's find — unless Command, Control or
Option is held, or a text field has focus. A pointer event carries the keys held with it, by
the same names — `e.shift`, `e.meta`, `e.ctrl`, `e.alt` — so a click decides from its own
event whether it extends a selection (Shift) or adds to one (⌘, Ctrl off the Mac).

When a page runs more than one program, the keyboard goes where focus is: focus on a view
gives it to that view's program, focus on an island to the program inside, and with nothing
focused the outer program has it. Only that program's `KeyListener` members hear keys, and its
`Keyboard.isDown` alone answers yes. A host hands a program the keyboard by focusing its island (a
focusable island, and `onPointerDown() { Focus.focus(this) }`), and a program can take it by
focusing one of its own views. A key held as the keyboard moves on is released, for the
program that had it.

## Files dropped on a view

A view that declares [`onFilesDrop`](declare-docs:View.event.filesDrop) takes the person's files dragged onto it — the
deepest such view under the drag, as with a press — with `onFilesOver` and `onFilesOut` to
light it while they are over it. What a file is, and what to do with one, is in
[Data](declare-docs:guide:data@files).

## Copy, cut and paste

⌘C, ⌘X and ⌘V — and an Edit menu's `copy`, `cut` and `paste` commands — go to the focused view if it declares
[`onClipboardCopy`](declare-docs:View.event.clipboardCopy), [`onClipboardCut`](declare-docs:View.event.clipboardCut) or
[`onClipboardPaste`](declare-docs:View.event.clipboardPaste), or else to its nearest ancestor that does; with
nothing focused, to the App. A text field keeps them for itself, as text fields do everywhere.

The clipboard holds one thing in several representations, by MIME type, and each app
that pastes takes the best one it understands. A copy puts as many as it likes:
`e.put(text)` is plain text, which every app reads; `e.put("text/html", …)` keeps
formatting for a mail or a document; a type of the program's own (`"application/x-…"`)
carries the whole thing to another of its windows. A paste looks at `e.types` and reads
with `e.get(type)`, `e.text`, or `e.files` for pasted images and files:

```declare
App [ width = 320, height = 120, fill = white, textColor = black,
    word: string = "tomato",
    chip: View [ x = 20, y = 40, padding = 10, cornerRadius = 8, fill = gainsboro, focusable = true,
        onClipboardCopy(e: ClipboardEvent) { e.put(app.word) },
        onClipboardPaste(e: ClipboardEvent) { if (e.text.trim() != "") { app.word = e.text.trim() } },
        Text [ text = { app.word } ] ],
    Text [ x = 20, y = 90, text = "Click the chip, then ⌘C or ⌘V" ]
    ]
```

A button writes with `Clipboard.copy` — `Clipboard.copy(link)`,
or a record of representations — from the press, as a browser allows the write only then.
There is no reading the clipboard from code: pasting is the person's act, and `onClipboardPaste` is
where it arrives.

---

**What you can now do:** style from hover and press, route behavior by calling methods,
choose between the raw and resolved layers, let one view carry a drag and a click, find
what is under the pointer, bind keys and run commands from menus and buttons, declare
shortcuts, read the keyboard for a game, take the person's files, and copy and paste.

[Next: **Touch and gestures** →](declare-docs:guide:touch)
