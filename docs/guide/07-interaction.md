<!-- nav: Interaction -->
<!-- part: Building -->

# Interaction is delivery

A program hears the user through **handlers** — methods whose names begin with `on`.
There is no `addEventListener`, no listener cleanup, and no bubbling: an event fires on
the one node it happened to, and when something *else* needs to know, the handler
tells it directly. That is the whole routing model, and it fits in a sentence:

> **Handlers fire where they're declared; children deliver by calling methods.**

## The pointer-state pattern

The everyday shape: handlers flip plain booleans, and constraints paint from them —
the assignments are reactive setters, so there is no further wiring:

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

The handler set is small — `onClick`, the pointer five (`onMouseDown/Up/Over/Out/Move`),
`onKeyDown`/`onKeyUp` on the focused view, `onFocus`/`onBlur`, `onInit` — and a method
*without* `on` is just a method. Two field notes: touch devices never hover
(`app.hovering` is `false` there — let the pressed state carry the feedback), and
`onInit` fires when a node is *attached* to the live tree, the right moment for work
that reads parent context.

## The drag pattern

A pointer handler takes the event when it needs coordinates. Down/move/up on one node,
with a small threshold telling a click from a drag, is the entire shape — the same
idea the calendar's drag-to-reschedule uses at scale:

```declare
App [ width = 300, height = 160, fill = white,
    card: View [ x = 20, y = 40, width = 120, height = 80, cornerRadius = 10, fill = 0x4C8DFF,
        downX: number = 0,
        startX: number = 0,
        dragging: boolean = false,
        onMouseDown(e) { downX = e.x; startX = this.x; dragging = false },
        onMouseMove(e) {
            if (Math.abs(e.x - downX) > 4) { dragging = true }
            if (dragging) { x = Math.max(0, Math.min(180, startX + (e.x - downX))) }
            },
        onMouseUp() { dragging = false },
        ],
    ]
```

Drag the card. Under four pixels of travel it stays a click; past it, the move is a
plain `x` assignment — kept inside the box by ordinary clamp arithmetic, no special
"bounds" feature — and reactive, so anything bound to the card's position follows
live.

## Reaching another node: call a method

When a handler must affect something beyond its own node, it does not dispatch an
event upward — it **calls a method** on the node that owns the behavior, reached by a
[scope noun](declare-docs:guide:tree):

```declare-fragment
class Row extends View [
    onClick() { classroot.select(this) },      // tell the list; nothing bubbles
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
regardless of focus, subscribe to the `Keys` service with the `<-` arrow — a
handler-shaped member plus the source it registers with, lifetime-managed, nothing to
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

Click the preview once, then use the arrow keys. The payload is a normalized key
event — `e.key` (`"ArrowUp"`, `"Escape"`, `"a"`), `e.code`, modifier flags — never a
numeric code. `Keys` is the *raw* stream (it fires even while a field has focus —
gate shortcuts on app state where that matters), and the subscribable services are
exactly `Keys` and `Focus`; you cannot subscribe to another view's events — that is
what calling a method is for. Don't confuse `<-` with `<->`, the two-way *data*
arrow from [chapter 8](declare-docs:guide:data).

## The standard library

You do not hand-build buttons outside of tutorials. The library ships a small set of
controls — themed, keyboard-ready, auto-included by bare tag:

| component | value | one line |
|---|---|---|
| `Button [ label, primary?, onClick() ]` | — | the action control; Space/Enter fires it |
| `Checkbox [ label, checked ]` | `checked: boolean` | box + mark + label |
| `Switch [ checked ]` | `checked: boolean` | sliding-thumb boolean |
| `RadioGroup [ value ]` + `Radio [ choice, label ]` | `value: string` on the group | one-of-N |
| `Slider [ value, min, max, step ]` | `value: number` | drag or arrow keys |
| `Field [ label, labelWidth ]` | — | a labeled row; nest your control inside |
| `ProgressBar [ value, min, max ]` | — | display-only |

Every control also takes `disabled` (inert and unfocusable — constrain it). The
library is small and actively growing — more controls are arriving — but what's worth
learning is not the catalog; it's the two contracts every control obeys, because they
are what your *own* components should obey too.

**Contract one: the value pattern.** A control's value is a plain reactive attribute,
used in one of three forms. *Standalone* — the control owns its state; read it by
name (`mute: Checkbox [ label = "Mute" ]` … `visible = { mute.checked }`).
*App-owned* — the truth lives elsewhere: **derive down, deliver up**:

```declare
App [ width = 360, height = 200, fill = { theme.bg },
    volume: number = 25,
    muted:  boolean = false,

    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 14 ],
        Checkbox [ label = "Mute", checked = { app.muted },
            input(v) { app.muted = v },
            ],
        Slider [ value = { app.volume },
            input(v) { app.volume = v },
            disabled = { app.muted },
            ],
        ProgressBar [ value = { app.muted ? 0 : app.volume } ],
        Button [ label = "Reset", primary = true,
            onClick() { app.volume = 25; app.muted = false },
            ],
        ],
    ]
```

`checked = { app.muted }` derives the display; `input(v)` is the edit-delivery
channel, redirecting the control's edits into your state. The pair goes together — a
one-way binding *without* `input` leaves the control's edits fighting your
constraint. *Data-owned* — an editor bound straight to a datum with `<->` — is
[chapter 8](declare-docs:guide:data)'s form, for editors only, and the compiler
holds that line: point `<->` at a `Checkbox` and the error tells you a Checkbox is
not an editor, use `checked = { … }` + `input(v)`.

**Contract two: focus is provided.** Tab and Shift-Tab walk the controls, Space and
Enter activate, a click claims focus, and a traveling focus ring is injected into any
app that uses the library — disable or replace it via the theme. You declared none of
it.

## When there is no widget for it

There is no `Modal`, `Tabs`, or `Select` yet — and that is the normal case, not a
gap: **compose it, or define a class.** A tab bar is a row of views with `onClick`
and a selected state; a modal is a full-bleed view over a dimmed backdrop, shown by a
`State`. The library earns its place only where native behavior (caret, focus,
keyboard) is worth sharing; everything else is the composition you already know from
[chapter 4](declare-docs:guide:tree) — and the library's own source, written in
Declare, is readable proof there's no privileged component layer underneath.

---

**What you can now say:** you can make anything respond — pointer, drag, keyboard —
route behavior without invisible event plumbing, and wire real controls to real state
with the one value pattern that all of them share.

[Next: **Data is a place, not an event** →](declare-docs:guide:data)
