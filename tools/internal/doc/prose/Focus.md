The focus service, as a member. Like `Keys`, `Focus` names one concept a program can
**ask** (`Focus.focus(this)`, `Focus.byKeyboard()` — calls from any `{ }` body) or
**listen to** (a `Focus [ … ]` member).

Listening is what a focus indicator does: the library's `FocusRing` follows focus with
exactly these two handlers, tracking where focus went and the live silhouette of whatever
holds it. Most apps never need it — focus rings, tab order, and activation are provided —
but replacing the indicator is a supported thing to do, and this is how.

```declare-fragment
watch: Focus [
    onFocusChange(v: View) { classroot.target = v },
    onGeometry(g: FocusGeometry)    { classroot.tx = g.x; classroot.ty = g.y }
    ]
```

## focusChange
`onFocusChange(v)` — focus moved to view `v` (or `null` when nothing is focused).

## geometry
`onGeometry(g)` — the focused control's live root-space silhouette: `g.x`, `g.y`, `g.w`,
`g.h`, `g.rad` (its corner radius), `g.view`, and `g.root` (the app that owns it — an
embedded app's ring ignores a target belonging to another).

## focus()
Moves keyboard focus to a view — **the only way to move it**; assigning a control's
`focused` does not. The call every control makes on pointer-down, so that the keyboard
picks up where the pointer left off. Focusing a view that can't take focus leaves focus where it is, and says so once in the console. A `quiet` view can take it.

```declare-fragment
onPointerDown() { Focus.focus(this) }
```

## blur()
Clears focus entirely, so nothing holds it.

## next()
Moves focus to the next view in traversal order — what Tab does, callable directly when a
control wants to advance focus itself (a field that moves on Enter).

## prev()
Moves focus to the previous view in traversal order — Shift-Tab's action.

## byKeyboard()
Whether the current focus **arrived by keyboard** rather than by pointer — the web's
`:focus-visible` rule, as a **reactive read**. This is what lets a clicked control show no
focus edge while a tabbed one does, and what a focus indicator keys off to decide whether
to appear at all.

## getFocus()
The view that currently holds focus, or `null`. A **tracked read**: a constraint that reads
it re-runs when focus moves (`hint = { Focus.getFocus()?.tooltipLabel ?? "" }`), and every
view also carries its own `focused` fact. Also for saving focus before opening a modal
and restoring it after. **Restore on a later turn, not immediately**: an in-flight
keystroke must finish against the old focus, or the key that closed a dialog is delivered
to the opener, which reopens it.

## focusIn()
Moves focus **into** a view that holds focusable views — to what last had focus inside it,
else its first stop — and answers whether anything took it. What an overlay that takes
focus does on opening; a scope remembers where focus was, so reopening returns there.

## holds()
Whether focus is on a view or anywhere inside it — a program hosted in an island inside it
included. A `Window` answers whether it has the keyboard with it.

## _giveBack()
**Internal.** An overlay closing gives focus back: to what had it when it opened, or, when
that is gone, to the next Tab stop after its place.

## nextRegion()
Moves focus to the next (`1`) or previous (`-1`) region of the context around the one
focus is in — what F6 and Shift-F6 do. A program's own command for cycling its windows
calls it.
