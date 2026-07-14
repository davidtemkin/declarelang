# Events

A node responds to **its own** events with handler methods — no `addEventListener`,
no listener to remove, no dependency array. A handler is just a method whose name
begins with `on`, and its body is ordinary code whose assignments are reactive.

## Handlers — `on<Event>` for a node's own events

A handler is a method whose name begins with `on`. The prefix marks it as a
response to *this node's own* event, and keeps it out of the plain-method
namespace (a handler never collides with a same-named attribute):

```declare
NavLink [
    onMouseOver() { hovered = true },
    onMouseOut()  { hovered = false; pressed = false },
    onMouseDown() { pressed = true },
    onMouseUp()   { pressed = false },
    onClick()     { app.navigate = "/docs" },
    ]
```

The body is ordinary TypeScript, and the assignments inside it are reactive
setters (see [Constraints](21-constraints.md)) — so flipping `hovered` here
updates every constraint that reads it, with no further wiring. Common handlers
are `onClick`, `onMouseDown`/`onMouseUp`/`onMouseOver`/`onMouseOut`/`onMouseMove`,
`onInit`, `onFocus`/`onBlur`, `onInput`. A method *without* `on` is just a method
— `select`, `open`, `dismiss` — not a handler.

Handlers can take the event as a parameter when they need it — for a pointer
position, for instance:

```declare
grip: View [ dragging: boolean = false, split: number = 240,
    onMouseDown()  { dragging = true },
    onMouseMove(e) { if (dragging) split = Math.max(240, e.x) },
    onMouseUp()    { dragging = false },
    ]
```

`onInit` deserves a note: it fires when the node is **attached** to the live
tree, not when it is constructed — because an init handler typically reads parent
context (a datapath, an inherited font, resolved geometry) that only exists once
the node is in place. For a subtree, `onInit` fires bottom-up, so a parent's
`onInit` sees ready children. (Full lifecycle in
[instantiation.md](../../design/instantiation.md).)

## Reaching another node — call a method

An event fires on **one** node: the one it happened to. There is no bubbling and
no capture phase (a deliberate choice — event routing you can't see is a class of
bug Declare doesn't have). So when a handler needs to affect something *else*, it
doesn't dispatch an event upward; it **calls a method** on the node that owns the
behaviour, reached by a [scope noun](27-scope-nouns.md):

```declare
class Row [ selected: boolean = false,
    onClick() { classroot.select(this) },      // tell the list; don't emit upward
    ]
```

`classroot` resolves to the enclosing component instance (the list), `app` reaches
the root, a named member reaches a sibling. The call *is* the notification — and
because the method's assignments are reactive, one call updates every constraint
that read the changed state. This is the whole cross-node story today: a handler
answers its own event, then calls whoever needs to know.

## Subscribing to a service — `<-`

Some events come from *outside* the tree — the keyboard, most usefully, without
needing focus. A **subscription** is a member with the `<-` arrow: the same shape
as a method, plus the source it registers with. It is lifetime-managed —
subscribed at construction, unsubscribed when the node is torn down, nothing to
clean up:

```declare
nav: Node [
    onKeyUp(e) <- Keys {
        if (e.key == "ArrowLeft") app.step(-1);
        else if (e.key == "ArrowRight") app.step(1);
        },
    ]
```

The payload is the normalized key event — `e.key` (`"ArrowLeft"`, `"Escape"`,
`"a"`), `e.code`, and modifier flags. The member's name matches the source's
member *literally* — `Keys` calls `onKeyDown` and `onKeyUp` — and the `on`
prefix is the same naming convention handlers use (an event is just a
function-typed member that gets called; there is no `event` keyword).
Subscribing to an unknown source, or to a member the source doesn't call, is a
compile error that names the alternatives.

The sources are the runtime *services* — `Keys` today. You cannot subscribe to
another **view's** events: to hear a child, have it call a method (above). And
mind that `Keys` is the *raw* keyboard — it fires while the user types in a
`TextInput` too, so gate a shortcut body on your app's state where that matters
(focused-field keyboard input belongs to [Input & focus](34-input-focus.md)).

## A note on text input

`TextInput` is the concrete case where events and data meet. Its `text` attribute
is the **source of truth** — the user's edits mutate it, other slots bind to it —
and it fires `onInput` on each edit and `onEnter` on submit. See
[Input & focus](34-input-focus.md) and the `TextInput` reference for the full
attribute surface.

---

**Next:** whole configurations that swap in and out together —
[States](24-states.md).
