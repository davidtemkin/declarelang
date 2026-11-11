# Keyboard and focus
<!-- index: keys, shortcuts, focus order, focus traps -->

**Use when** keys do something: shortcuts, arrow navigation, Enter to open, Escape to
close, focus order.

```declare
class Item [ width = 100%, height = 28, focusable = true,
    fill = { app.sel == rowIndex ? 0xDDE6F2 : 0xFFFFFF },
    t: Text [ x = 10, y = 6, text = :name ],
    onFocus() { app.sel = rowIndex },
    onKeyDown(e: KeyEvent) {                                    // keys that belong to this row
        if (e.key == "Enter") app.opened = "" + :name
        }
    ]

App [ width = 320, height = 220, fill = white,
    sel: number = 0,
    opened: string = "",
    d: Dataset { { "items": [ { "id": 1, "name": "Inbox" }, { "id": 2, "name": "Archive" } ] } },
    keys: KeyListener [                                                // app-wide shortcuts, whatever has focus
        onKeyDown(e: KeyEvent) {
            if (e.key == "Escape") app.opened = ""
            if (e.code == "KeyN" && e.meta) app.opened = "new"
            }
        ],
    list: View [ width = 100%, datapath = { app.d.value },
        layout: SimpleLayout [ axis = y ],
        Item [ datapath = :items[] ]
        ],
    note: Text [ x = 10, y = 180, text = { "opened: " + app.opened } ]
    ]
```

**Rules**
- A key walks from the focused view outward to the App, and the nearest `keyBindings`
  record takes it: a widget binds its own keys, and app-wide keys are bindings on the App —
  a text field keeps its typing, so a single-letter key never fires while one has focus. A
  `KeyListener` member hears every raw key whatever has focus, for a game.
- The event is `KeyEvent`: `key` is the character typed, `code` the physical key (what a
  shortcut wants: `"KeyN"`), and the modifiers are `shift`, `ctrl`, `alt`, `meta`.
  `Keyboard.isDown("ShiftLeft")` asks whether a key is held now.
- Every control is a tab stop already; Tab order is tree order. `focusable = true` makes
  any view one; there is no numeric tab index. A container reorders or gates what Tab
  reaches by overriding `tabOrder()`. A control with members — a radio group, a list — is
  one stop with arrows inside.
- `focusScope` says what Tab does at a container's edge: `stop` (one stop, arrows inside),
  `region` (a cycle of its own, left with F6), `modal` (Tab stays inside, as a dialog
  needs). `Focus.focus(view)` moves focus,
  `Focus.getFocus()` reads it; restore a saved focus on a later turn, not immediately.
- The focus ring comes with the library controls; you declare none of it.

**Look up** `View.keyBindings`, `KeyListener`, `KeyEvent`, `Keyboard.isDown`, `View.focusable`, `View.tabOrder`,
`View.focusScope`, `Focus.focus`.

**Examples** `library/table.declare`: arrow-key travel, Shift ranges, ⌘ toggles ·
`apps/desktop/desktop.declare`: menu shortcuts dispatched from the menu records ·
`apps/docs/docs.declare`: `SearchHit`, ↑/↓ through results.

**Guide** Pointer and keyboard § Keyboard events · Controls § Keyboard
focus.
