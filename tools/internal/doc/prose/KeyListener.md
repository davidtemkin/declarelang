The keyboard, as a member: a `KeyListener [ … ]` is how the keyboard calls you, with every
key that goes down and up. Its other half is [`Keyboard`](declare-docs:Keyboard), the
keyboard you ask — `Keyboard.isDown("KeyA")` from any `{ }` body.

It is the **raw stream** — it fires even while a text field has focus, so gate single-key
handling on app state where that matters. It is not part of the walk that answers a key —
the focused view's `keyBindings` and `onKeyDown`, then each container's, out to the App — and
takes nothing from it; a key a view answers is a
[key binding](declare-docs:guide:pointer-and-keyboard@key-bindings). A `KeyListener` is for a game's
keys, a key held while dragging, and anything that reads the keyboard rather than answers it. Lifetime is the node's: subscribed at init, dropped when the node is
discarded, nothing to clean up. Fan-out is by instance — a menu, a dialog, and a menubar
each holding a `KeyListener` member all hear the keyboard at once.

A page can run more than one program: a desktop runs one in each window's
[`AppIsland`](declare-docs:AppIsland). The keyboard goes to one of them at a time — the
program holding the focused view, the program inside a focused island, or, with nothing
focused, the outer program — and only that program's `KeyListener` members hear keys. A key
held as the keyboard moves on gets its `onKeyUp` in the program that had it.

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

## keyDown
`onKeyDown(e)` — a key went down. `e` is a normalized KeyEvent: `e.key` (`"ArrowUp"`,
`"Escape"`, `"a"`), `e.code`, and modifier flags — never a numeric code.

## keyUp
`onKeyUp(e)` — a key came up, same payload.

## onCommandHeld
The command key (⌘ on a Mac, Ctrl elsewhere) has been held **alone** for a moment: `true`;
then `false` when it is let go, or another key joins it. Every program hears it, wherever
the keyboard is — what a panel of the keys in force (`Keyboard.shortcutsInForce()`) shows
and hides on, as iPadOS shows its own while ⌘ is held.

## onNavClaim
The navigation keys changed hands: `true` when something claimed them (an overlay opened
and its arrows now rove it), `false` when the last claim released. It fires on the
**transition only**, not per claim, so nested overlays that each claim do not chatter.

This is how a focus ring stands down while a menu owns the arrows: the library's own ring
subscribes to it, because during that time the menu's rover *is* the focus and a second
indicator would be a lie.

