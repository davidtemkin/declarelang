# Data — datapaths, replication, and sources

Nearly every app binds views to data. The model is small: a **cursor** (set by
`datapath`) selects a place in the data, and descendants read fields *relative* to
it. **Replication** — one view per record — falls out for free when a path matches
many records, with no loop to write.

## `:path` reads from the inherited cursor

A leading `:` marks a **datapath** — its own value mode, neither literal nor
TypeScript. `datapath = …` sets the cursor on a node; every descendant reads
`:field` relative to it:

```declare
report: View [ datapath = { weatherData.value.rss.channel },     // set the cursor here
    where: Text [ text = { :location.city + ", " + :location.region } ],
    temp:  Text [ text = :item.condition.temp ],
    ]
```

A `:path` is reactive like any bound value: when the data behind the cursor
changes, the reads re-derive. You can use one bare (`text = :item.condition.temp`)
or inside a `{ }` expression mixed with anything else
(`{ :location.city + ", " + :location.region }`).

## `:arr[]` replicates — one subtree per record

A node whose datapath matches *many* records produces one instance **per record**.
This is not an imperative loop; replication is the *artifact* of the path resolving
to many, and the replicated subtree re-roots the cursor onto each element:

```declare
forecastData: View [ layout: SimpleLayout [ axis = y, spacing = 10 ],
    WeatherSummary [ datapath = :item.forecast[] ],     // one WeatherSummary per forecast entry
    ]
```

`WeatherSummary` is written **once**, against an abstract cursor (`:day`, `:high`,
`:low`), and reused for every element. Add a record to the data and a new instance
appears; remove one and its instance leaves — no keys, no reconciliation, no list
component. The homepage's data demo is the whole pattern in eight lines:

```declare
App [ facts: Dataset { { "rows": [
        { "label": "reactive", "n": 92 },
        { "label": "compiled", "n": 78 },
        { "label": "small",    "n": 64 } ] } },
    View [ x = 28, y = 26, datapath = { parent.facts.value },
           layout: SimpleLayout [ axis = y, spacing = 16 ],
        Bar [ width = 300, datapath = :rows[], label = :label, value = :n ] ],
    ]
```

One `Bar`, instanced once per row. Edit a number or add a row and the list rebuilds
itself.

## Two kinds of source: `Dataset` and `DataSource`

A **`Dataset`** holds *embedded* data — its body is JSON (this is the one place
`{ }` carries its JSON meaning, an embedded-data region, not a TypeScript
expression). Read its parsed content through `.value`:

```declare
events: Dataset { [ { time: "9:00", title: "Standup" },
                    { time: "14:00", title: "Design review" } ] },
```

A **`DataSource`** is a reactive *remote* resource — the declarative replacement
for "a dataset plus a data-pointer plus a hand-written fetch." It exposes its whole
lifecycle as reactive state, so the UI *derives* from it with ordinary constraints
instead of an imperative show/hide:

```declare
weatherData: DataSource [ url = { `/data/weather/${zip}.json` } ],

splash: Screen [ shown = { !weatherData.loaded }, … ],   // entry screen — derived
report: Screen [ shown = {  weatherData.loaded }, … ],   // report screen — derived
```

Its reactive surface:

- **state:** `.idle` · `.loading` · `.loaded` · `.failed`
- **data:** `.value` (the response) · `.error`
- **methods:** `.fetch()` · `.clear()`

Because the resource's *state* drives the tree, even navigation is a function of
data. `onMouseUp() { weatherData.clear() }` returns to the entry screen — it resets
the resource and lets both screens re-derive their `shown`. And because `url` is a
`{ }` constraint over `zip`, changing `zip` retargets the resource.

### The gotcha: `.fetch()` is explicit

A `DataSource` does **not** auto-load. Declaring it, or changing its `url`, does
not kick off a request; nothing is fetched until you call `.fetch()` — typically
from a handler:

```declare
ok: Text [ text = "OK",
    onClick() {
        weatherData.fetch().then(() => {
            if (weatherData.failed) slideIn.start()
            else app.report.topBar.slideDown.start()
            })
        } ],
```

`.fetch()` returns a promise you can chain (here, to branch on success vs.
failure). The lifecycle flags update reactively as it runs, so most of the UI just
reads `.loading` / `.loaded` / `.failed` and never touches the promise.

## Schema — typing and validation, optional

A `Dataset` or `DataSource` may carry a **`schema`** describing the shape of the
data it returns. It is a `[ … ]` tree of `field: Type` declarations — brackets, not
braces, because a shape is *declarations*, not something that runs. An array field
is marked on the name (`forecast[]:`), echoing the `:forecast[]` read:

```declare
weatherData: DataSource [ url = { `/data/weather/${zip}.json` },
    schema = [
        rss: [ channel: [
            location: [ city: string, region: string ],
            item: [
                condition:  [ code: int, temp: int, text: string ],
                forecast[]: [ day: string, high: int, low: int ],
                ],
            ] ],
        ],
    ]
```

When a schema is present the compiler does two things: it **validates the response
on receipt** (malformed data yields `.failed`/`.error`, never `undefined` three
layers into a binding), and it **statically checks every `:path`** against the
shape (`:item.condition.tempp` is a compile error — with no change to the `:path`
syntax). With **no** schema, `:path` is fully legal and dynamic: it resolves at
runtime, an unresolved path yields null, and the bound attribute falls back to its
default. Schema presence is the only switch; the surface never changes.

## Editing a record: `text <-> :path`

Reads flow data → view; that covers most of a UI. The one place a value must also
flow **back** is a *leaf input* editing a piece of data — and the direct way to
say so is the two-way arrow **`<->`**:

```declare
App [
    contact: Dataset { { "person": { "name": "Ada", "zip": "94110" } } },
    form: View [ datapath = { app.contact.value.person },
        name: TextInput [ y = 20, text <-> :name ],          // shows :name AND commits edits back to it
        zip:  TextInput [ y = 80, text <-> :zip,             // a domain rule beyond the type
              validate(v) { return /^[0-9]{5}$/.test(v) ? null : "must be 5 digits" } ],
        note: Text [ y = 120, textColor = #cc5b47, text = { app.form.zip.error } ],  // the field owns its error
        echo: Text [ y = 160, text = { "saved → " + app.contact.value.person.name + " / " + app.contact.value.person.zip } ],
    ],
]
```

`name <-> :name` does three things you would otherwise wire by hand: it **seeds**
the field from the datapath, **commits** each edit back into the dataset, and
**reseeds** when the cursor moves to a new record — no `onInit`, no write-back
handler, no staging copy.

Two layers own the value, which is what keeps this clean. The **dataset** owns the
*committed* value (what's saved); the **editor** owns the *edit session* — the
in-progress draft and its validity. So an edit never corrupts the record until the
draft is valid.

**Validation is the field's own job**, with the schema type as only a floor. Add a
`validate(v)` method returning an error message (or `null` when valid); an invalid
draft is held with its `error` showing and is **never** written to the dataset. The
field also publishes `valid` and `dirty` as ordinary reactive slots — so a Save
button is just a constraint over them, no form object required:

```declare
App [
    doc: Dataset { { "row": { "title": "" } } },
    form: View [ datapath = { app.doc.value.row },
        title: TextInput [ text <-> :title, commitOn = "manual",   // hold edits until Save
            validate(v) { return v.length > 0 ? null : "required" } ],
        save: Text [ y = 40, text = "Save",
            opacity = { app.form.title.dirty && app.form.title.valid ? 1 : 0.4 },
            onClick() { app.form.title.commit() } ],
    ],
]
```

`commitOn` chooses *when* a valid draft lands — `"input"` (live, the default),
`"blur"`, `"enter"`, or `"manual"` (only on `commit()`). And "save vs. autosave" is
just *where* you point the datapath: at the real record (edits reflect at once) or
at a working copy you commit on Save. One primitive covers both.

For a **generic** editor — one component that edits a field named at runtime — the
target can be a `{ }` that *names* the field: `text <-> { classroot.field }`. A
reusable `Field [ field = "email" ]` then binds two-way to whichever property its
`field` names, reseeding if that changes.

For a field that is **not** editing a dataset record, two lower-level shapes remain.
**Controlled** — `text = { app.zip }` — makes the field a pure view of a model
value; a stray edit reverts. **Uncontrolled** — `initial = "94110"` — seeds `text`
once and lets the field own it thereafter, republished via `onInput` (the split is
exactly React's `value` vs. `defaultValue`). Prefer `<->` whenever the truth lives
in a dataset; the [Input & focus](34-input-focus.md) chapter covers the rest of the
field surface.

Imperative record mutation (adding, removing, reordering records in a dataset) is
still being designed; for now, structural data comes from the source and
replication follows it. (Lineage and the JSONPath/JSON-Pointer surface are in the
[language spec](../../design/declare-language.md#9-data-datapaths-replication-and-sources).)

---

**Next:** the four words that name *which* node you mean —
[Scope nouns](27-scope-nouns.md).
