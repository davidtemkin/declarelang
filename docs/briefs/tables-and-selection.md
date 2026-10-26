# Tables and selection
<!-- index: Table and DataGrid: selection as items, sorting, editable columns -->

**Use when** records need a real table: selecting one or many, keyboard travel, columns
that sort, reorder, resize or edit.

```declare
App [ width = 460, height = 260, fill = white,
    d: Dataset [ contents = { { rows: app.make(2000) } } ],
    make(n: number) -> array {
        const out = []
        const st = ["open", "done", "held"]
        for (let i = 0; i < n; i++) out.push({ id: i, title: "Issue " + i, state: st[i % 3] })
        return out
        },
    // the grid names the sort; you derive the sorted collection
    sorted: Dataset [ contents = { { rows: app.sortRows(app.d.value.rows, app.g.sortOn, app.g.sortDir) } } ],
    sortRows(rows: array, on: string, dir: string) -> array {
        if (on == "") return rows
        const k = dir == "desc" ? -1 : 1
        return [...rows].sort((a, b) => (a[on] < b[on] ? -1 : a[on] > b[on] ? 1 : 0) * k)
        },
    chosen: object[] = [],
    head: Text [ x = 20, y = 12, text = { app.chosen.length + " selected of " + app.d.value.rows.length } ],
    g: DataGrid [ x = 20, y = 40, width = 420, height = 200, selects = "multi",
        items = { app.sorted.value.rows },
        columns = { [ { id: "id",    title: "ID",    width: 60 },
                      { id: "title", title: "Title", width: 220, edit: true },
                      { id: "state", title: "State", width: 120 } ] },
        input(sel: object) { app.chosen = (sel ?? []) as object[] }
        ]
    ]
```

**Rules**
- `Table` gives a collection selection and keyboard travel over rows you replicate
  (`TableRow [ datapath = :rows[] ]`, `virtualize` still works). `DataGrid` is driven
  from records: `items` are the rows and `columns` are column records, and it adds
  sortable, reorderable, resizable columns.
- The selection holds **items** (the records themselves), so it survives sorting,
  filtering and scrolling. The table owns `selected`/`selection` and hands them out
  through `input(sel)`; don't write into them.
- `selects = "none" | "single" | "multi"`. Counts you show are full-dataset counts, not
  what's on screen.
- Sorting names a derivation: a header click sets `sortOn`/`sortDir`, and **you** derive
  the sorted dataset (or send the sort to a server by overriding `sortInput`).
- A cell shows `record[id]` as text; `edit: true` makes it editable, and `cell:
  "ClassName"` names a class of your own bound to the row's record. An edit writes the
  record, through a derived dataset too. A record with a `heading` field is a heading row.
- Column `order` and `widths` are the value pattern (`arrangeInput`, `resizeInput`);
  a width of `0` drops a column, so a responsive table is a constraint.

**Look up** `Table`, `Table.selection`, `Table.selects`, `TableRow.item`, `DataGrid`,
`DataGrid.columns`, `DataGrid.items`, `DataGrid.sortOn`, `DataGrid.sortInput`.

**Examples** `apps/tracker/tracker.declare`: a `Table` of issues, multi-select, a derived
sort · `apps/sampler/sampler.declare`: an editable `DataGrid`.

**Guide** Large collections § Selection · § DataGrid columns.
