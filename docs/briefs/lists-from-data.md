# Lists from data
<!-- index: many of something from records; rowIndex, identity, derived lists -->

**Use when** a screen shows many of something — rows, cards, pins, bars — that come
from records.

```declare
class TaskRow [ width = 100%, height = 28,
    fill = { rowIndex % 2 == 0 ? 0xFFFFFF : 0xF4F6F8 },
    t: Text [ x = 10, y = 6, text = { (rowIndex + 1) + ". " + :title } ]
    ]

App [ width = 320, height = 200, fill = white,
    d: Dataset { { "rows": [ { "id": 1, "title": "Write the brief", "done": false },
                             { "id": 2, "title": "Ship it", "done": true } ] } },
    open: Dataset [ contents = { { rows: app.d.value.rows.filter((r) => !r.done) } } ],
    list: View [ width = 100%, datapath = { app.open.value },
        layout: SimpleLayout [ axis = y ],
        TaskRow [ datapath = :rows[] ]
        ],
    count: Text [ x = 10, y = 170, text = { app.open.value.rows.length + " open" } ]
    ]
```

**Rules**
- The `[]` at the end of a `datapath` is what replicates: one instance per record. There
  is no loop, `.map()` or `createView` for a list.
- Filter, sort or group in a **derived** `Dataset` (`contents = { … }`). It holds the
  source's own records, so a row bound to it writes the real record.
- A row's position is `rowIndex`. Don't stamp index fields into the records.
- Identity is a record's `id`; name another field with `key = :field`.
- Count the data (`.value.rows.length`), never the rendered children.
- Long lists: `virtualize = true` on the replicated row, nothing else.

**Look up** `Dataset`, `Dataset.contents`, `View.datapath`, `View.rowIndex`,
`View.virtualize` (declare-help, or the reference).

**Examples** `apps/tracker/tracker.declare`: the issue list over the derived `shown`
dataset, virtualized · `apps/weather/weather.declare`: `CityRow` places itself by
`rowIndex`.

**Guide** Data § Datasets, cursors and paths · Large collections § Record identity · § Row position: rowIndex · § Virtualization.
