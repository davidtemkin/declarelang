The keyboard, as a member. `Keys` names one concept that a program can either **ask** or
**listen to**: `Keys.isDown("KeyA")` is a call you make from any `{ }` body; a `Keys [ … ]`
member is how the keyboard calls you.

It is the RAW stream — it fires even while a text field has focus, so gate app-level
shortcuts on app state where that matters. A *focused* view's own `onKeyDown`/`onKeyUp`
handlers are the other half of the story, and usually the right one for keys that belong to
a particular widget. Lifetime is the node's: subscribed at init, dropped when the node is
discarded, nothing to clean up. Fan-out is by instance — a menu, a dialog, and a menubar
each holding a `Keys` member all hear the keyboard at once.

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
