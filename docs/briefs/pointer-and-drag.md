# Pointer, drag and touch
<!-- index: hover, press, click vs drag, touch claims, drop targets, pinch -->

**Use when** views react to the pointer or a finger: hover and press looks, taps,
drags, drop targets, pinch.

```declare
class Chip [ width = 110, height = 70, cornerRadius = 10,
    label: string = "",
    startX: number = 0,
    moved: boolean = false,
    fill = { pressed ? 0x3A73D9 : hovered ? 0x5C95F0 : 0x4C8DFF },

    onClick() { app.opened = label },                          // a command: the resolved layer
    onHold() { },                                              // on a scrolling surface, pick up on hold
    onPointerDown(e: PointerEvent) { startX = x; moved = false },
    onPointerMove(e: PointerEvent) {                           // manipulation: the raw layer
        if (Math.abs(e.deltaX) > 4) moved = true
        if (moved) x = Math.max(0, Math.min(200, startX + e.deltaX))
        },
    onPointerUp(e: PointerUpEvent) {
        if (e.canceled) { x = startX; return }                 // the browser took it back: never commit
        if (moved) app.dropped = label
        },
    t: Text [ x = center, y = center, textColor = white, text = { classroot.label } ]
    ]

App [ width = 340, height = 180, fill = white,
    opened: string = "",
    dropped: string = "",
    a: Chip [ x = 20, y = 30, label = "Drag me" ],
    note: Text [ x = 20, y = 130, text = { "opened: " + app.opened + " · dropped: " + app.dropped } ]
    ]
```

**Rules**
- `onClick` activates; `onPointerDown` manipulates. A command runs from `onClick`
  (or `onDblClick`, `onHold`): the runtime has watched the whole gesture, so a finger
  starting a scroll never fires it.
- `hovered` and `pressed` are facts to read in constraints, never assigned; `hovered` is
  false on touch. On a control they are false while `disabled`, and `pressed` includes a
  keyboard press.
- A drag is down, move, up on one view; the pressed view captures the pointer. Use
  `deltaX`/`deltaY` (root-frame travel since the press) and keep a small threshold of
  your own before moving.
- `onPointerUp` with `e.canceled` means the browser took the gesture back: reset, don't
  commit.
- **The handler is the gesture policy.** Declaring `onPointerMove` claims the one-finger
  drag over that view; adding `onHold` moves the claim to press-and-hold, so a quick
  swipe still scrolls. `claim = x` narrows it to one axis. `onPinch*` claims two
  fingers; `onTouch*` claims every finger. Claim the least, on the smallest view.
- Drop targets: the dragger writes one attribute from `app.viewAt(x, y)`; each target
  derives its look from it. Give the drag ghost `pointerEvents = "none"`.

**Look up** `View.hovered`, `View.pressed`, `View.onPointerMove`, `PointerEvent`,
`PointerUpEvent`, `View.onHold`, `View.claim`, `View.onPinch`, `View.viewAt`,
`View.pointerEvents`.

**Examples** `apps/calendar/calendar.declare`: `Ev`, tap to open and hold-then-drag to
move, on a scrolling surface · `apps/desktop/desktop.declare`: window drag and resize ·
`library/datagrid.declare`: header drag with `claim = x`.

**Guide** Pointer and keyboard § Raw and resolved events · § Dragging · § Finding
what is under the pointer · Touch and gestures.
