# Overlays
<!-- index: menus, context menus, dialogs, tooltips -->

**Use when** something appears above the page: a menu, a context menu, a dialog, a
popover, a tooltip.

```declare
class Row [ width = 100%, height = 30,
    t: Text [ x = 10, y = 7, text = :name ],
    onContextMenu(e: PointerEvent) { app.rowMenu.open(this, e) },   // right-click, two-finger
    onHold(e: PointerEvent) { app.rowMenu.open(this, e) }            // touch long-press
    ]

App [ width = 360, height = 220, theme = { SanFrancisco }, fill = { provided("theme").bg },
    said: string = "",
    d: Dataset { { "files": [ { "id": 1, "name": "notes.md" }, { "id": 2, "name": "plan.md" } ] } },

    // declared once, opened by many: items are records, the choice comes back through picked
    rowMenu: ContextMenu [ items = { [ ({ id: "rename", label: "Rename" }), ({ divider: true }),
                                       ({ id: "delete", label: "Delete…" }) ] },
        picked(id: string) { if (id == "delete") app.dlg.ask("Delete this file?", "This cannot be undone.", (a) => { app.said = a }) }
        ],
    dlg: Dialog [ ],
    view: Menu [ items = { [ ({ id: "list", label: "As list" }), ({ id: "grid", label: "As grid" }) ] },
        picked(id: string) { app.said = id } ],

    bar: View [ x = 10, y = 10, width = 340, height = 32,
        Button [ label = "View", menu = { app.view } ] ],
    list: View [ y = 50, width = 100%, datapath = { app.d.value },
        layout: SimpleLayout [ axis = y ],
        Row [ datapath = :files[] ]
        ],
    note: Text [ x = 10, y = 180, textColor = { provided("theme").text }, text = { "said: " + app.said } ]
    ]
```

**Rules**
- An overlay is a **member you open with a verb**, not a view you toggle: no `visible`,
  no z-index, no dismissal handler.
- Items are records (`{ id, label, key?, icon?, enabled?, checked?, divider?, submenu? }`);
  the choice comes back through `picked(id)`. A menu's `items` may read `opener` to serve
  many rows from one instance.
- `menu = { app.x }` on a control is the whole wiring for a dropdown. `openFor(v)`
  anchors below a view; `openAt(v, e)` / `ContextMenu.open(v, e)` opens at the pointer,
  wired on the served view with `onContextMenu` and `onHold`.
- Menus light-dismiss: an outside press closes the layer and is swallowed. Dialogs are
  modal: a scrim, no light dismiss, focus trapped inside, focus restored after.
- Dismiss first, deliver second: the layer is gone before `picked` runs; don't read its
  state there.
- `tip = "…"` on any view gives a tooltip; you never declare the service.
- Building your own modal: restore focus one turn late, or the Return that closed it
  reopens it.

**Look up** `Menu`, `Menu.picked`, `Menu.opener`, `Menu.openFor`, `ContextMenu`,
`Dialog.ask`, `Dialog.notice`, `View.tip`, `Control.menu`.

**Examples** `apps/tracker/tracker.declare`: `IssueRow`, a menu on right-click and on hold ·
`apps/desktop/desktop.declare`: the menu bar as records, with a live Window menu ·
`library/combobox.declare`: a control that opens a layer.

**Guide** Menus, dialogs and overlays.
