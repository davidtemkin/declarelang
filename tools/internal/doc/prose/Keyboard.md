The keyboard, as a service you ask from any `{ }` body: whether a key is down, which keys are
held, which keys are in force where focus is. Nothing to declare — it is no member (a
`KeyListener` is the keyboard's member, which hears every key as it goes down and up), and a
tag or a base naming it is refused.

```declare
App [ width = 260, height = 100, fill = white, textColor = black,
    Text [ x = 20, y = 30, fontSize = 20,
        text = { Keyboard.isDown("ShiftLeft") ? "Shift is down" : "Hold Shift" } ] ]
```

## isDown()
Whether a key is physically down right now, by `code` (`"ShiftLeft"`, `"MetaLeft"`) — for
**modifier state at the moment of a gesture**, which is not carried on a pointer event.
How a table decides whether a click extends a range or toggles one member.

```declare-fragment
onClick() { (parent as Table).rowClick(this.tableIndex(), this.item(),
    Keyboard.isDown("MetaLeft") || Keyboard.isDown("ControlLeft"),
    Keyboard.isDown("ShiftLeft")) }
```

It answers for the program whose body asks: a key counts as down in a program only if it
went down while that program had the keyboard. The modifiers — Shift, Control, Option,
Command — are the keyboard's state and read the same in every program.

Polling a key also **claims** it: while the asking view is shown and its program has the
keyboard, the browser's own use of the key stands down — Space and the arrows don't scroll
the page, a letter doesn't open the browser's find. A key pressed with Command, Control or
Option held, or typed into a text field, stays the browser's. A game reads its keys this
way and needs nothing else.

## held()
Every key currently down in the asking program, as `code` strings.

## navClaim()
Claims the navigation keys — arrows, Space, Home/End, Page — away from the browser's
scroll defaults while an overlay is roving, and releases them when passed `false`. **An
open menu owns the arrow keys**; without the claim the page scrolls underneath it. Claim
on open, release on close, always in pairs — a claim that outlives its overlay leaves the
page unscrollable. While an overlay holds the claim, the keys it uses — Esc, Enter, the
arrows — reach only the `KeyListener` members inside it, not the program's others. A claim made
by an overlay that opened in a `Window` holds only while focus is in that window.

## _claimant()
**Internal.** The overlay the keys go to now: the latest claim that holds, or null — what the
library's overlays and focus ring read. With focus outside it, its keys start at it.

## _declareShortcuts()
**Internal.** How a `Shortcuts` set registers itself when it starts. A program declares a
`Shortcuts` member instead.

## shortcutsInForce()
The keys in force where focus is now — every labelled `keyBindings` record with a key and
every `Shortcuts` record, each key once, from the nearest view that binds it, walking from
the focused view out through its program and, for chords, on into the program that hosts it:
records `{ id, key, label, enabled, origin, group }`. For a binding, `id` is its command and
`group` its `group`; for a shortcut, `origin` is the declaring set's `title` and `group` the
menu a menu bar's shortcut sits in (else the origin). What a panel of the available keys
lists (hold ⌘ in the desktop).
