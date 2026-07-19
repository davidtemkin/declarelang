<!-- nav: Data -->
<!-- part: Building -->

# Data is a place, not an event

In the stacks you know, data arrives as *events* — a fetch resolves, a callback fires,
you copy values into state and schedule the update. Declare inverts this. Data is a
**place**: you point part of the tree at it, and the tree derives — and when the data
changes, the same derivation holds. Nothing arrives; things *are*, and views follow.

> **Point a cursor at the data; the tree derives — and repeats — from it.**

## `:path` reads from a cursor

`datapath = …` sets a **cursor** on a node; every descendant reads `:field` relative
to it, reactively. And the strongest move follows from one rule: a path that matches
*many* records **replicates** its node — one instance per record:

```declare
App [ width = 300, height = 160, fill = #0B141B, textColor = gainsboro,
    people: Dataset {
        { "rows": [ { "name": "Ada", "score": 92 },
                    { "name": "Grace", "score": 87 },
                    { "name": "Alan", "score": 74 } ] }
        },
    list: View [ x = 20, y = 20, datapath = { people.value },
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        View [ height = 22, datapath = :rows[], key = :name,
            n: Text [ width = 160, text = :name ],
            s: Text [ x = 170, text = :score ],
            ],
        ],
    ]
```

The inner view is written **once**, against an abstract cursor, and instanced per
row. Add a record to the running example and an instance appears; delete one and its
instance leaves. There is no `.map()`, no loop to maintain, no list component —
replication is the *artifact of the path resolving to many*. `key = :name` makes
reconciliation **keyed**: when data changes, only rows whose key changed rebuild.
(Replicated children are unnamed — you address them by their data, not by name.)

> **From React:** this retires the `rows.map(r => <Row key={r.id}/>)` idiom whole.
> Note what `key` is here: *data identity* for reconciliation — not a render hint
> you must remember, and never an array index. The shape is declared; the data
> decides the count.

## Two kinds of source

A **`Dataset`** holds embedded or computed data. Its literal body is **strict JSON**
— quoted keys, no trailing commas — the one place in the language where a `{ }` is
not TypeScript. A **`DataSource`** is a remote resource whose *lifecycle is reactive
state*:

```declare-fragment
weather: DataSource [ url = { `/data/weather/${zip}.json` } ],

splash: View [ visible = { !weather.loaded }, … ],   // entry screen — derived
report: View [ visible = {  weather.loaded }, … ],   // report screen — derived
```

The lifecycle is `.idle` → `.loading` → `.loaded` / `.failed`, with `.value` and
`.error`, and two methods: **`.fetch()`** — explicit, always; nothing loads because
it was declared — and `.clear()`. The screens above are the pattern to internalize:
**screens derive from data state.** There is no `isLoading` flag you set, no
navigation code that shows the report when the fetch callback lands — and `.clear()`
"navigates" back to the splash because both screens re-derive. This is the
fetch-then-setState choreography from your current stack, deleted rather than
abstracted.

Not everything is structure. `format = "text"` delivers the fetched bytes as one
string — how an authored Markdown file becomes an app's material directly, no JSON
wrapping, no generated copy:

```declare-fragment
article: DataSource [ url = "notes.md", format = "text" ],
doc: Markdown [ visible = { article.loaded }, text = { article.value || "" } ],
```

(That is how this site serves its FAQ and the language document — `.md` files,
fetched as text, rendered by the native `Markdown` component.) And an optional
`schema = [ field: type, rows[]: [ … ] ]` validates a response **at the boundary** —
malformed data yields `.failed`, never `undefined` three bindings deep — and lets
every `:path` be checked statically against the shape.

## Editing: reads are one-way, editors opt in

Reading is one-way everywhere by default. A leaf **editor** — a field that owns an
edit — can bind two-way with `<->`:

```declare
App [ width = 300, height = 120, fill = white, textColor = black,
    people: Dataset { { "rows": [ { "name": "Ada" } ] } },
    list: View [ x = 20, y = 20, datapath = { people.value },
        View [ datapath = :rows[],
            TextInput [ width = 200, height = 30, padding = 6, cornerRadius = 6, fill = gainsboro,
                text <-> :name ],
            ],
        ],
    ]
```

Type in the field and the record follows; change the record and the field follows.
`<->` is for editors only (`TextInput.text`, a slider's value) — everywhere else,
one-way `:path`, and app-owned control state uses the derive-down/deliver-up pair
from [chapter 7](declare-docs:guide:interaction). Mutating from code is just as
direct: `data.set("rows.0.name", "Ada L.")` writes one place and wakes exactly what
derives from it; `insert`, `removeAt`, and `move` reshape collections the same way.

## The board — everything at once

Here is the pattern that carries real applications, the same one the calendar runs
at scale: **keep the raw data flat, derive the view model from it, and let every
edit be a data write.** A task board — three columns, click a card to advance it,
add cards at the bottom:

```declare
class BCard extends View [ width = { parent.width }, height = 32, cornerRadius = 7, fill = #1C3A4F,
    onClick() { app.advance(:id) },
    t: Text [ x = 10, y = 8, fontSize = 12, wrap = false, text = :t ],
    ]

class Column extends View [ width = 132,
    layout: SimpleLayout [ axis = y, spacing = 8 ],
    name: Text [ fontSize = 11, fontWeight = bold, textColor = #8A9BA6, text = :name ],
    BCard [ datapath = :cards[], key = :id ],
    ]

App [ width = 470, height = 250, fill = #0D151E, textColor = whitesmoke,
    raw: Dataset {
        { "cards": [ { "id": 1, "col": 0, "t": "Outline the guide" },
                     { "id": 2, "col": 0, "t": "Fix the rail" },
                     { "id": 3, "col": 1, "t": "Draft the data chapter" },
                     { "id": 4, "col": 2, "t": "Set up the sandbox" } ] }
        },
    nextId: number = 5,

    colNames() { return ["To do", "Doing", "Done"] },
    buildCols() {
        const cards = this.raw.read(["cards"]) ?? []
        return { cols: this.colNames().map((n, i) => ({ name: n, cards: cards.filter(c => c.col == i) })) }
        },
    board: Dataset [ contents = { app.buildCols() } ],

    advance(id) {
        const cards = this.raw.read(["cards"])
        const i = cards.findIndex(c => c.id == id)
        if (i >= 0 && cards[i].col < 2) this.raw.set("cards." + i + ".col", cards[i].col + 1)
        },
    add() {
        const t = this.entryRow.entry.text
        if (t == "") return
        this.raw.insert("cards", this.raw.read(["cards"]).length, ({ id: this.nextId, col: 0, t: t }))
        this.nextId = this.nextId + 1
        this.entryRow.entry.text = ""
        },

    cols: View [ x = 16, y = 16, datapath = { board.value },
        layout: SimpleLayout [ axis = x, spacing = 14 ],
        Column [ datapath = :cols[] ],
        ],
    entryRow: View [ x = 16, y = { app.height - 54 },
        layout: SimpleLayout [ axis = x, spacing = 8 ],
        entry: TextInput [ width = 250, height = 40, padding = 10, cornerRadius = 8,
            fill = #16222E, placeholder = "Add a task" ],
        Button [ label = "Add", primary = true, onClick() { app.add() } ],
        ],
    ]
```

Click cards; add a few. Now read the source top to bottom and notice what each part
*is*. `raw` is the truth — a flat list, each card knowing only its column number.
`board` is a **derived dataset**: `contents = { app.buildCols() }` recomputes when
anything it reads changes, because the compiler read *through* `buildCols` and wired
its dependencies ([chapter 3](declare-docs:guide:relationships), paying off).
Columns and cards are nested replication over the derived shape. And both user
actions are *one data write each*: `advance` sets a single field; `add` inserts a
record. No view is ever touched by the handlers — the writes wake the derivation,
the derivation reshapes the board, keyed replication rebuilds only what changed.

That division — raw truth, derived model, edits as writes — is how "navigation," in
the calendar, is three assignments. It is the deepest habit this chapter can leave
you with.

---

**What you can now say:** you can bind any tree to any data, let the data decide the
count, derive screens from a source's lifecycle instead of choreographing fetches,
and structure a real app as raw truth + derived model + edits-as-writes.

[Next: **Motion is a target; a mode is a bundle** →](declare-docs:guide:motion-and-modes)
