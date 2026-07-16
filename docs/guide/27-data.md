# Data: cursors, replication, sources

Everything so far has been about one view. This chapter is about many-from-data, and it
rests on one move:

> **Point a cursor at the data; the tree derives — and repeats — from it.**

A **cursor** (set by `datapath`) selects a place in the data; descendants read fields
*relative* to it with `:path`; a path that matches many records **replicates** its node,
one instance per record.

## `:path` reads from the inherited cursor

A leading `:` marks a **datapath** — its own value mode, neither literal nor TypeScript.
`datapath = …` sets the cursor on a node, and every descendant reads `:field` relative to
it. A `:path` is reactive: when the data behind the cursor changes, the reads re-derive. You
can use one bare (`text = :name`) or mixed inside a `{ }` expression
(`{ :city + ", " + :region }`).

## `:arr[]` replicates — one subtree per record

A node whose datapath matches *many* records produces one instance **per record**. This is
the strongest inversion of the JSX habit: there is no `rows.map(r => <Row/>)`, no loop you
maintain. Replication is the *artifact* of the path resolving to many, and the replicated
subtree re-roots the cursor onto each element:

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

The inner `View` is written **once**, against an abstract cursor (`:name`, `:score`), and
instanced per row. Add a record and an instance appears; remove one and its instance leaves.
`key = :name` makes the reconciliation **keyed** — when the data changes, only the rows whose
key changed rebuild. (Replicated children are unnamed; they are addressed by data, not by
name.)

## Two kinds of source: `Dataset` and `DataSource`

A **`Dataset`** holds *embedded* data. Its body is strict JSON — quoted keys — the one place
`{ }` means an embedded-data region rather than a TypeScript expression; read its parsed
content through `.value`.

A **`DataSource`** is a reactive *remote* resource — the declarative replacement for "a
dataset plus a pointer plus a hand-written fetch." It exposes its whole lifecycle as
reactive state, so the UI *derives* from it with ordinary constraints:

```declare-fragment
weather: DataSource [ url = { `/data/weather/${zip}.json` } ],

splash: View [ shown = { !weather.loaded }, … ],   // entry screen — derived
report: View [ shown = {  weather.loaded }, … ],   // report screen — derived
```

- **state:** `.idle` · `.loading` · `.loaded` · `.failed`; **data:** `.value` · `.error`;
  **methods:** `.fetch()` · `.clear()`.
- **`.fetch()` is explicit** — a `DataSource` does *not* auto-load. Declaring it, or
  changing its `url`, kicks off nothing; you call `.fetch()`, typically from a handler.
- Because the resource's *state* drives the tree, even navigation is a function of data:
  `.clear()` returns to the entry screen because both screens re-derive their `shown`.

## Schema: validation at the boundary

An optional `schema = [ field: type, arr[]: [ … ] ]` (brackets, never braces — a shape
*declares*, it doesn't run) does two things: the response is **validated on receipt** —
malformed data yields `.failed`/`.error`, never `undefined` three layers into a binding —
and every `:path` is **checked statically** against the shape. With no schema, paths are
dynamic: an unresolved path yields null and the bound attribute falls back to its default.

## Reading and deriving in code

Inside constraints, `data.read(["events"])` is a tracked read of a region by literal path,
and `data.set("events.3.d", 14)` mutates one — writes wake exactly what derives from them,
and keyed replication rebuilds only the changed rows. A **derived dataset** computes its
content from other reactive state instead of a JSON body:

```declare-fragment
cal: Dataset [ contents = { app.buildModel() } ],   // the model *is* a derivation
```

This is the calendar's pattern: build the whole model as a derivation, and "navigation"
reduces to setting the state it reads. We see it at scale in
[the capstone](declare-docs:guide:calendar).

## Two-way editing: `<->`

Reads are one-way everywhere by default. When a leaf **editor** should write back to the
datum it shows, opt in with `<->`:

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

`<->` is for **editors only** — `TextInput.text`, a `Slider.value` — the value slots that
own an edit. It is the data-owned form of the control value pattern from
[the controls](declare-docs:guide:controls); everywhere else, reads stay one-way `:path`.
(Point `<->` at a non-editor and the compiler stops you — a `Checkbox` is app-owned, not an
editor.)

---

**Next:** the chapter the whole book has been building toward — state and motion as one
mechanism. [Continuity](declare-docs:guide:continuity).
