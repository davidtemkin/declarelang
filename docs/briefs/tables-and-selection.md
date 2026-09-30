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
    g: DataGrid [ x = 20, y = 40, width = 420, height = 200, datapath = { app.sorted.value },
        selects = "multi",
        input(sel: object) { app.chosen = (sel ?? []) as object[] },
        Column [ title = "ID",    field = "id",    width = 60 ],
        Column [ title = "Title", field = "title", width = 220, kind = "edit" ],
        Column [ title = "State", field = "state", width = 120 ],
        GridRow [ datapath = :rows[], virtualize = true ]
        ]
    ]
```

**Rules**
- `Table` gives a collection selection and keyboard travel; `DataGrid` adds sortable,
  reorderable, resizable columns declared as `Column` members. Both replicate a row over
  data like any list (`TableRow`/`GridRow [ datapath = :rows[] ]`), and `virtualize`
  still works.
- The selection holds **items** (the records themselves), so it survives sorting,
  filtering and scrolling. The table owns `selected`/`selection` and hands them out
  through `input(sel)`; don't write into them.
- `selects = "none" | "single" | "multi"`. Counts you show are full-dataset counts, not
  what's on screen.
- Sorting names a derivation: a header click sets `sortOn`/`sortDir`, and **you** derive
  the sorted dataset (or send the sort to a server by overriding `sortInput`).
- Cells come from the column model (`record[field]`); `kind` picks `"text"`, `"edit"`,
  `"check"` or `"select"`. An edit writes the record, through a derived dataset too.
- Column `order` and `widths` are the value pattern (`arrangeInput`, `resizeInput`);
  a width of `0` drops a column, so a responsive table is a constraint.

**Look up** `Table`, `Table.selection`, `Table.selects`, `TableRow.item`, `DataGrid`,
`Column`, `Column.kind`, `DataGrid.sortOn`, `DataGrid.sortInput`.

**Examples** `apps/tracker/tracker.declare`: a `Table` of issues, multi-select, a derived
sort · `apps/sampler/sampler.declare`: an editable `DataGrid`.

**Guide** Large collections § Selection · § DataGrid columns.
