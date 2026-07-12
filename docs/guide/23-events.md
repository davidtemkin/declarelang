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
grip: View [ dragging: boolean = false,
    onMouseDown()  { dragging = true },
    onMouseMove(e) { if (dragging) classroot.split = Math.max(240, e.x) },
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

> **Partly landed.** The two-way `<->` data binding now compiles — a leaf input
> editing a dataset record is `text <-> :path` (see
> [Data → Editing a record](26-data.md)). Still designed but **not yet in the
> compiler** (`design/declare-language.md` §8): a self-marking `<-` form for
> subscribing to an *external* source (the keyboard, a window, a connection) with
> node-lifetime cleanup, and a firable `event` declaration. Until those land,
> reach across nodes with a method call (above), and take keyboard input through a
> focused [`TextInput`](34-input-focus.md).

## A note on text input

`TextInput` is the concrete case where events and data meet. Its `text` attribute
is the **source of truth** — the user's edits mutate it, other slots bind to it —
and it fires `onInput` on each edit and `onEnter` on submit. See
[Input & focus](34-input-focus.md) and the `TextInput` reference for the full
attribute surface.

---

**Next:** whole configurations that swap in and out together —
[States](24-states.md).
