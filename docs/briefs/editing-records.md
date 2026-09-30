# Editing a record
<!-- index: toggles, renames, forms, working copies -->

**Use when** the user changes data: toggles a row, renames an item, fills in a form.

```declare
class TaskRow [ width = 100%, height = 32,
    box: Checkbox [ x = 8, y = 6, checked = :done, input(v: boolean) { :done = v } ],
    t: Text [ x = 36, y = 8, text = :title ],
    onClick() { app.pick = :id }
    ]

App [ width = 360, height = 260, fill = white,
    d: Dataset { { "rows": [ { "id": 1, "title": "Write the brief", "done": false } ] } },
    pick: number = 1,
    draft: Dataset { { } },                      // the working copy the form edits
    list: View [ width = 100%, datapath = { app.d.value },
        layout: SimpleLayout [ axis = y ],
        TaskRow [ datapath = :rows[] ]
        ],
    editor: View [ y = 90, x = 8, width = 340, height = 80, datapath = { app.draft.value },
        field: TextInput [ width = 240, height = 30, text <-> :title ],
        save: Button [ x = 250, label = "Save", onClick() { app.save() } ]
        ],
    edit() {
        const r = app.d.value.rows.find((x) => x.id == app.pick)
        if (r != null) app.draft.set([], { title: r.title })
        },
    save() {
        const i = app.d.value.rows.findIndex((x) => x.id == app.pick)
        if (i >= 0) app.d.set(["rows", i, "title"], app.draft.value.title)
        },
    onInit() { app.edit() }
    ]
```

**Rules**
- A handler writes the record under its cursor: `:done = v`. Elsewhere, `d.set(path, v)`,
  with `insert`, `removeAt` and `move` for arrays. `d.value` itself is read-only.
- A control shows a value and hands edits back: `checked = :done` down, `input(v)` up.
  Without the `input` override, the control's edit is refused.
- `<->` is for editors only (`TextInput`), and needs a `datapath` above it.
- Edits that should wait for Save go into a working copy (`draft`), filled when editing
  starts and written back on Save.
- A row of a derived dataset that *selects* writes through to the source. What the
  derivation *made* (a copy, a wrapper, a summary) is read-only and refuses the write.

**Look up** `Dataset.set`, `Dataset.insert`, `Dataset.removeAt`, `Checkbox.input`,
`TextInput.text`, `Editor`.

**Examples** `apps/lzx-calendar/lzx-calendar.declare`: `draft`, `startDraft()`, `apply()`,
and the steppers writing the record live · `apps/tracker/tracker.declare`: the editor
card over `draft`.

**Guide** Data § Writing a record · § Editing text, and forms ·
Controls § The value pattern.
