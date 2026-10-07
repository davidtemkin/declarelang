# Derived values
<!-- index: computed values: constraint vs formula, summaries as methods -->

**Use when** a value follows from other values: a total, a label, a size, a filtered
view of data.

```declare
App [ width = 360, height = 200, fill = white,
    d: Dataset { { "items": [ { "id": 1, "name": "Tea", "price": 4, "qty": 2 },
                              { "id": 2, "name": "Cake", "price": 6, "qty": 1 } ] } },
    taxRate: number = 0.08,

    // a formula: reads its inputs, re-evaluates when they change — and may be taken over
    subtotal: number = { app.sum(app.d.value.items) },
    total: number = { app.subtotal * (1 + app.taxRate) },

    // a summary is a method the compiler reads through
    sum(items: array) -> number { return items.reduce((s, i) => s + i.price * i.qty, 0) },

    line: Text [ x = 12, y = 12, text = { "Total " + app.total.toFixed(2) } ],
    // a set attribute with { } is owned by its constraint: assigning it is refused
    bar: View [ x = 12, y = 40, height = 8, fill = 0x2E6FE0, width = { app.total * 10 } ]
    ]
```

**Rules**
- A `{ }` has two forms. **Setting** an attribute (`width = { … }`) makes it owned by
  its constraint: it stays derived, and assigning it is refused. **Declaring** one with a
  `{ }` default (`total: number = { … }`) makes a formula: reading it inlines the
  expression, and an assignment replaces it. Use the second for a value you may take
  over later.
- Derived state is never assigned; change its inputs instead.
- A summary over data is a **method** (the compiler reads through it); through a `script`
  function it traces nothing. Many summaries about one dataset's records → a dataset class
  (`extends Dataset`).
- A derived collection is a `Dataset` with `contents = { … }`; give it a `schema` and its
  `.value` is typed.
- Count the data, never the rendered children. Don't index attributes by a runtime key
  (`this[k]`), and don't derive an attribute from itself (`total = { total + tax }`):
  each is a compile error that names the rewrite.
- Don't add an in-between attribute just to force a re-derivation: whatever a `{ }`
  reads, it follows.

**Look up** `Dataset.contents`, `Dataset.schema` (and in declare.md: What you can assign).

**Examples** `apps/tracker/tracker.declare`: counts and workload derived on the App ·
`apps/desktop/desktop.declare`: `Window.wx`, `wy`, formulas seeded from the record and
taken over by dragging · `apps/architecture/parts/ships.declare`: `ShipsFig`, sizes from
a `Dataset` through methods.

**Guide** Constraints · Data § Deriving summaries: methods, and a
typed result.
