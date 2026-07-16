# Interaction: events and input

A program hears the user through **handlers** — methods whose names begin with `on`. No
`addEventListener`, no listener to remove, no dependency array: a handler is a member that
gets called when its event fires, and its body is ordinary code whose assignments are
reactive. One rule governs where they land:

> **Handlers fire where they're declared; children deliver by calling methods.**

## Handlers answer a node's own events

A handler responds to *this node's own* event. Here a view tracks hover and press with two
booleans, and a constraint paints from them — the everyday pointer-state pattern:

```declare
App [ width = 220, height = 100, fill = white,
    btn: View [ x = 20, y = 20, width = 160, height = 44, cornerRadius = 8,
        hovered: boolean = false,
        pressed: boolean = false,
        onMouseOver() { hovered = true },
        onMouseOut()  { hovered = false; pressed = false },
        onMouseDown() { pressed = true },
        onMouseUp()   { pressed = false },
        fill = { pressed ? 0x2E5BD0 : hovered ? 0x3B74FF : 0x4C8DFF },
        Text [ x = 44, y = 14, textColor = white, text = "Press me" ],
        ],
    ]
```

The assignments are reactive setters, so flipping `hovered` repaints the `fill` with no
further wiring. Common handlers are `onClick`, the pointer set
(`onMouseDown`/`Up`/`Over`/`Out`/`Move`), `onInit`, `onFocus`/`onBlur`, and `onInput`. A
method *without* `on` — `select`, `open`, `dismiss` — is just a method, not a handler.

Two notes. Touch devices have no hover: `app.hovering` is `false` there, so gate
hover-only affordances on it and let the pressed state carry the feedback. And `onInit`
fires when a node is **attached** to the live tree (bottom-up through a subtree), not when
it is constructed — because init work usually reads parent context that exists only once
the node is in place.

## The drag pattern

A pointer handler takes the event when it needs the position. Down/move/up on one node,
with a small movement threshold that tells a click from a drag, is the whole shape — the
same `startDrag`/`dragMove`/`dropDrag` idea the calendar uses at scale:

```declare
App [ width = 300, height = 160, fill = white,
    card: View [ x = 20, y = 40, width = 120, height = 80, cornerRadius = 10, fill = 0x4C8DFF,
        downX: number = 0,
        startX: number = 0,
        dragging: boolean = false,
        onMouseDown(e) { downX = e.x; startX = this.x; dragging = false },
        onMouseMove(e) {
            if (Math.abs(e.x - downX) > 4) { dragging = true }
            if (dragging) { x = startX + (e.x - downX) }
            },
        onMouseUp() { dragging = false },
        ],
    ]
```

`onMouseDown` records where the press began; `onMouseMove` starts dragging only once the
pointer has moved past four pixels — under that, it stays a click. The move is a plain `x`
assignment, so it is reactive: anything bound to the card's position follows it live.

## Reaching another node: call a method

An event fires on **one** node — the one it happened to. There is no bubbling and no
capture phase (event routing you can't see is a class of bug Declare doesn't have). So when
a handler must affect something *else*, it doesn't dispatch upward; it **calls a method** on
the node that owns the behavior, reached by a [scope noun](declare-docs:guide:reach):

```declare-fragment
class Row extends View [ selected: boolean = false,
    onClick() { classroot.select(this) },      // tell the list; don't emit upward
    ]
```

`classroot` reaches the enclosing component (the list), `app` reaches the root, a named
member reaches a sibling. The call *is* the notification — and because the method's
assignments are reactive, one call updates every constraint that read the changed state.
"The whole panel is clickable" is likewise just an `onClick` on the panel's own background,
not a bubbled event from a child.

## The keyboard

A **focused** view receives `onKeyDown`/`onKeyUp` directly, like any other handler — that
is the right tool for keys that belong to a particular field or widget. For keys that should
work *regardless* of focus — app-level shortcuts — subscribe to the `Keys` service with the
`<-` arrow. A subscription is a handler-shaped member plus the source it registers with, and
it is lifetime-managed: subscribed at construction, unsubscribed at teardown, nothing to
clean up:

```declare
App [ width = 240, height = 100, fill = white, textColor = black,
    n: number = 0,
    onKeyUp(e) <- Keys {
        if (e.key == "ArrowUp") { n = n + 1 }
        else if (e.key == "ArrowDown") { n = n - 1 }
        },
    Text [ x = 20, y = 34, fontSize = 28, text = { `n = ${n}` } ],
    ]
```

The payload is the normalized key event — `e.key` (`"ArrowUp"`, `"Escape"`, `"a"`),
`e.code`, and modifier flags. The member name matches the source's member *literally*:
`Keys` calls `onKeyDown` and `onKeyUp`, `Focus` calls `onFocusChange` — those two services
are the whole subscribable set today, and subscribing to anything else (including another
view's events — call a method for that) is a compile error that names the alternatives.
`Keys` is the *raw* keyboard and fires even while a `TextInput` has focus, so gate a
shortcut on your app's state where that matters.

Don't confuse `<-` (event subscription, this chapter) with `<->` (two-way data binding for
editors — [Data](declare-docs:guide:data)). One hears a service; the other keeps a field and
a datum in sync.

Text entry, controlled vs. seeded fields, and `onInput`/`onEnter` are the
[Content](declare-docs:guide:content) chapter; deep focus management — tab order, focus
traps — is [The environment](declare-docs:guide:environment).

---

**Next:** the controls that already have all of this built in —
[The standard library](declare-docs:guide:controls).
