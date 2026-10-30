The keyboard, as a member. `Keys` names one concept that a program can either **ask** or
**listen to**: `Keys.isDown("KeyA")` is a call you make from any `{ }` body; a `Keys [ … ]`
member is how the keyboard calls you.

It is the **raw stream** — it fires even while a text field has focus, so gate app-level
shortcuts on app state where that matters. A *focused* view's own `onKeyDown`/`onKeyUp`
handlers are the other half of the story, and usually the right one for keys that belong to
a particular widget. Lifetime is the node's: subscribed at init, dropped when the node is
discarded, nothing to clean up. Fan-out is by instance — a menu, a dialog, and a menubar
each holding a `Keys` member all hear the keyboard at once.

A page can run more than one program: a desktop runs one in each window's
[`AppIsland`](declare-docs:AppIsland). The keyboard goes to one of them at a time — the
program holding the focused view, the program inside a focused island, or, with nothing
focused, the outer program — and only that program's `Keys` members hear keys. A key
held as the keyboard moves on gets its `onKeyUp` in the program that had it.

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

## keyDown
`onKeyDown(e)` — a key went down. `e` is a normalized KeyEvent: `e.key` (`"ArrowUp"`,
`"Escape"`, `"a"`), `e.code`, and modifier flags — never a numeric code.

## keyUp
`onKeyUp(e)` — a key came up, same payload.

## isDown()
Whether a key is physically down right now, by `code` (`"ShiftLeft"`, `"MetaLeft"`) — for
**modifier state at the moment of a gesture**, which is not carried on a pointer event.
How a table decides whether a click extends a range or toggles one member.

```declare-fragment
onClick() { (parent as Table).rowClick(this.tableIndex(), this.item(),
    Keys.isDown("MetaLeft") || Keys.isDown("ControlLeft"),
    Keys.isDown("ShiftLeft")) }
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

## onCommandHeld
The command key (⌘ on a Mac, Ctrl elsewhere) has been held **alone** for a moment: `true`;
then `false` when it is let go, or another key joins it. Every program hears it, wherever
the keyboard is — what a panel of the shortcuts in force (`Keys.shortcutsInForce()`) shows
and hides on, as iPadOS shows its own while ⌘ is held.

## onNavClaim
The navigation keys changed hands: `true` when something claimed them (an overlay opened
and its arrows now rove it), `false` when the last claim released. It fires on the
**transition only**, not per claim, so nested overlays that each claim do not chatter.

This is how a focus ring stands down while a menu owns the arrows: the library's own ring
subscribes to it, because during that time the menu's rover *is* the focus and a second
indicator would be a lie.

## navClaim()
Claims the navigation keys — arrows, Space, Home/End, Page — away from the browser's
scroll defaults while an overlay is roving, and releases them when passed `false`. **An
open menu owns the arrow keys**; without the claim the page scrolls underneath it. Claim
on open, release on close, always in pairs — a claim that outlives its overlay leaves the
page unscrollable. While an overlay holds the claim, the keys it uses — Esc, Enter, the
arrows — reach only the `Keys` members inside it, not the program's others. A claim made
by an overlay that opened in a `Window` holds only while focus is in that window.

## _claimant()
**Internal.** The overlay the keys go to now: the latest claim that holds, or null — what the
library's overlays and focus ring read. Esc closes this one.

## _declareShortcuts()
**Internal.** How a `Shortcuts` set registers itself when it starts. A program declares a
`Shortcuts` member instead.

## shortcutsInForce()
The shortcuts in force where focus is now — the nearest declaration of each key, walking
from the focused view up through its program and on into the program that hosts it:
records `{ id, key, label, enabled, origin, group }`, `origin` being the declaring set's
`title` and `group` the menu a menu bar's shortcut sits in (else the origin).
What a panel of the available shortcuts lists (hold ⌘ in the desktop).
