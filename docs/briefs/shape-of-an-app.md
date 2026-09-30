# The shape of an app
<!-- index: starting a program; where state, views and classes go -->

**Use when** starting a program, or deciding where something goes.

```declare
schema Task [ id: number, title: string, done: boolean ]

class TaskRow [ width = 100%, height = 32,
    layout: SimpleLayout [ axis = x, spacing = 10, align = center ],
    Checkbox [ checked = :done, input(v: boolean) { :done = v } ],
    Text [ text = :title, textColor = { :done ? 0x8A96A0 : 0x172530 } ]
    ]

App [ width = 360, height = 260, fill = #F4F6FA, textColor = #172530,
    tasks: Dataset [ schema = [ items[]: Task ] ] {
        { "items": [ { "id": 1, "title": "Read the guide", "done": true },
                     { "id": 2, "title": "Write a program", "done": false },
                     { "id": 3, "title": "Ship it", "done": false } ] }
        },
    open: number = { (app.tasks.value?.items ?? []).filter((t) => !t.done).length },
    nextId: number = 4,
    add() {
        app.tasks.set("/items/-", ({ id: app.nextId, title: "Task " + app.nextId, done: false }))
        app.nextId = app.nextId + 1
        },

    card: Card [ x = 20, y = 20, width = 320,
        Text [ fontWeight = semibold, text = { app.open + " open" } ],
        list: View [ width = 100%, datapath = { app.tasks.value },
            layout: SimpleLayout [ axis = y ],
            TaskRow [ datapath = :items[] ]
            ],
        Button [ label = "Add a task", onClick() { app.add() } ]
        ]
    ]
```

**Rules**
- **State has one home.** Records live in a `Dataset` (embedded, or loaded by a
  `DataSource`); a `schema` states their shape. State that is not a record is a declared
  attribute (`nextId`). Nothing keeps a copy.
- **Everything visible derives from it.** `open` is a constraint over the data; the
  heading reads it. Change the data and every reader follows.
- **Repeated structure comes from data**: `TaskRow [ datapath = :items[] ]`.
- **Layouts arrange; you rarely place.** A `SimpleLayout` stacks; hand-set `x`/`y` is for
  free-form surfaces.
- **Controls come from the library** and hand edits back: `checked = :done` down,
  `input(v)` up. Your own control extends `Control`.
- **Handlers write facts, not consequences**: the record field, the attribute, and stop.
- **Classes when they pay.** State and logic may live on the App. Name a class when a
  piece repeats or the App gets unwieldy: a view class, a document class
  (`extends Dataset`), or a job with no view (`extends Node`).

**Look up** `Dataset`, `Dataset.schema`, `DataSource`, `SimpleLayout`, `Card`,
`Checkbox`, `Button`, `Control`.

**Examples** `apps/tracker/tracker.declare`: a whole app of this shape, at scale ·
`apps/lzx-calendar/lzx-calendar.declare`: a derived month over one events source.

**Guide** Core concepts § A whole app · Data § Data in a whole app · Classes and the tree § When to name a class.
