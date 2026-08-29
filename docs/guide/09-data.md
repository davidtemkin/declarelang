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
App [ width = 300, height = 160, fill = midnightblue, textColor = gainsboro,
    people: Dataset {
        { "rows": [ { "name": "Ada", "score": 92 },
                    { "name": "Grace", "score": 87 },
                    { "name": "Alan", "score": 74 } ] }
        },
    list: View [ x = 20, y = 20, datapath = { people.value },
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        View [ height = 20, datapath = :rows[], key = :name,
            n: Text [ width = 160, text = :name ],
            s: Text [ x = 170, text = :score ]
            ]
        ]
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

A `:path` is a real path into the datum, so it reaches through structure the way you
would expect: `:score` reads a field, `:owner.name` a nested field, and `:images[0]`
indexes into a bound array (`[-1]` counts from the end). The selector vocabulary is
RFC 9535's, and it goes further: `:rows[1:4]` reads a **slice**, `:rows[*].label` a
**wildcard projection** (the list of every row's label), and `:rec['my-key']` a
**quoted name** — any key a JSON document can hold, dashes and dots included. A
slice or wildcard yields a list; use it like one (`(:rows[1:4]).map(…)` — a `.name(`
after a path is a method call on the value, never a path segment). And selection
composes with replication: `datapath = :rows[2:8][]` replicates over exactly that
window, each instance cursored at its **true** index. (Filters — `[?…]` — are not
in the subset yet; derive the filtered set in a `Dataset [ contents = { … } ]` and
bind to that.)

The one shape a `:` does **not** name is a *scalar* datum — when a replicated array
holds bare values (`"tags": ["new", "sale"]`), `datapath = :tags[]` instances a node
per string, but there is no `:` that names the string itself (though `:tags[*]` now
reads the whole list as a value). Give the values a field server-side
(`[{ "label": "new" }, …]`) and read `:label`. (A bare-scalar cursor is a known gap.)

And replication scales past what it materializes. A replicated block accepts
a **virtualization policy** — `virtualize = true` (a boolean, default false) —
under which the runtime constructs only the rows in and around the viewport
and everything else exists *logically*: same records, same paths, same
behavior, reconstructed indistinguishably as you scroll (rows you actually
touched are kept alive as-is). The scroll range reads the full logical
extent, a screen reader hears "row N of 100,000," and `onInit` fires once
per *record*, never per reconstruction. It is off by default and opt-in, and
it takes a `{ }` constraint like any other boolean, so a collection can start
fully materialized and virtualize when it grows.

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
**screens derive from data state.** There is no `isLoading` flag you set, no timer
polling `.loaded` (the constraint *is* the notification — [nothing
waits](declare-docs:guide:thinking-in-declare)), no navigation code that shows the
report when the fetch callback lands — and `.clear()`
"navigates" back to the splash because both screens re-derive. This is the
fetch-then-setState choreography from your current stack, deleted rather than
abstracted.

Not everything is structure. `format = "text"` delivers the fetched bytes as one
string — how an authored Markdown file becomes an app's material directly, no JSON
wrapping, no generated copy:

```declare-fragment
article: DataSource [ url = "notes.md", format = "text" ],
doc: Markdown [ visible = { article.loaded }, text = { article.value || "" } ]
```

(That is how this site serves its FAQ and the language document — `.md` files,
fetched as text, rendered by the native `Markdown` component.) And an optional
`schema = [ field: type, rows[]: [ … ] ]` validates a response **at the boundary** —
malformed data yields `.failed` with the exact path, never `undefined` three
bindings deep — and lets every `:path` be checked statically against the shape
(a typo'd `:labell` dies at compile time, with the schema's fields named).
Mark a field `name?:` when the data may omit it. Identity needs no marking
at all: a record's `id` field **is** its identity, by convention — selection,
reconciliation, and windowed retention all key by it with nothing declared
anywhere (`key = :field` remains only for an unconventionally-named one).

## Streams — data that arrives while you watch

Some data does not arrive once; it arrives *while you watch* — an AI answer
composing itself token by token, prices ticking, a log following itself. That is
the third kind of source: a **stream**. `EventStream` is a server-sent event
stream (SSE); `Socket` is a WebSocket, the same surface plus `send()`; both extend
the abstract `Stream`. Like every source, a stream is a non-visual member whose
lifetime is its node's — and the hard half of streaming, getting each arrival onto
the screen, is the language's ordinary job. The handler assigns; every constraint
that reads the state follows. This is the whole consumer for streamed AI text:

```declare-fragment
answer: string = "",
reply: EventStream [ url = { `/api/chat?id=${app.chatId}` },
    active = { app.chatId != "" },
    onMessage(e: StreamMessage) { app.answer = app.answer + e.data },
    ],
out: Text [ width = { parent.width }, text = { app.answer } ]
```

There is no `connect()` and no cleanup. A stream is connected exactly while
`active` is true and `url` is non-empty; a url change closes and reopens at the
new address, and a removed node takes its connection with it. Messages are
**transient** — `e.data` is a string, and nothing accumulates unless a handler
writes it somewhere, because accumulation is app semantics (streamed tokens
concatenate; JSON messages don't). For the show-the-latest case you need no
handler at all: `last` is the most recent message, reactive, so
`text = { feed.last }` is a complete ticker.

Connection state reads exactly like a `DataSource`'s: one read-only `status` fact
(`"closed"` / `"connecting"` / `"open"` / `"retrying"` / `"failed"`), `open` as its
boolean view, `error` as the last failure's reason. And when a connection drops,
the policy is *declared, never invented for you*: SSE reconnects itself — the
platform owns that — and beyond it, `retry = 2` means re-dial two seconds after
any loss the platform won't repair, for as long as `active` holds. No hidden
backoff curve, no give-up count; the whole policy is one number in the
declaration. Two fine points the transports impose: an SSE stream that *names*
its events (`event: delta` — AI APIs do this) must declare the names it listens
for — `listenTo = ["delta", "done"]` — because the platform delivers only what
is asked for; and `Socket.send()` is legal only while `.open` — a send into a
closed socket reports through `error`/`onError` instead of queueing silently.

A stream is event-shaped — ordered arrivals, append-mostly, transient — where a
dataset is record-shaped: navigable state, paths, mutation. They stay separate on
purpose, and the bridge between them is one line of app code: parse the message,
write into the dataset, and everything downstream re-derives.

## Editing: reads are one-way, editors opt in

Reading is one-way everywhere by default. A leaf **editor** — a field that owns an
edit — can bind two-way with `<->`:

```declare
App [ width = 300, height = 120, fill = white, textColor = black,
    people: Dataset { { "rows": [ { "name": "Ada" } ] } },
    list: View [ x = 20, y = 20, datapath = { people.value },
        View [ datapath = :rows[],
            TextInput [ width = 200, height = 30, padding = 6, cornerRadius = 6, fill = gainsboro,
                text <-> :name ]
            ]
        ]
    ]
```

Type in the field and the record follows; change the record and the field follows.
`<->` is for editors only (`TextInput.text`, a slider's value) — everywhere else,
one-way `:path`, and app-owned control state uses the derive-down/deliver-up pair
from [chapter 7](declare-docs:guide:interaction). Mutating from code is just as
direct: `data.set(["rows", 0, "name"], "Ada L.")` writes one place and wakes exactly
what derives from it; `insert`, `removeAt`, and `move` reshape collections the same
way. A path is a segments array — numbers welcome, no escaping ever — or an RFC 6901
pointer string (`"/rows/0/name"`; `set("/rows/-", v)` appends), so any key a JSON
document can hold is addressable.

## Forms: the draft, and when it lands

`<->` above committed on every keystroke. Often that is what you want — but a form usually
is not: you want a **draft** the user is editing, validated, that lands in the data only
when it is good and only when they say so. That is what an editor's *edit session* is, and
it is four attributes and two verbs:

```declare
App [ width = 400, height = 220, fill = white, textColor = black,
    rec: Dataset { { "name": "Ada", "email": "ada@example.com" } },

    canSave: boolean = { app.col.nameF.valid && app.col.mailF.valid
                      && (app.col.nameF.dirty || app.col.mailF.dirty) },

    col: View [ x = 20, y = 20, width = 360, datapath = { rec.value },
        layout: SimpleLayout [ axis = y, spacing = 10 ],

        nameF: TextInput [ width = 250, height = 28, padding = 5, cornerRadius = 6, fill = gainsboro,
            commitOn = "manual", text <-> :name,
            validate(v: string) -> string { return v.length > 0 ? "" : "Name is required" }
            ],
        mailF: TextInput [ width = 250, height = 28, padding = 5, cornerRadius = 6, fill = gainsboro,
            commitOn = "manual", text <-> :email,
            validate(v: string) -> string { return v.includes("@") ? "" : "That is not an address" }
            ],

        msg: Text [ width = 340, textColor = firebrick,
            text = { app.col.nameF.error != "" ? app.col.nameF.error : app.col.mailF.error } ],

        row: View [ height = 30,
            layout: SimpleLayout [ axis = x, spacing = 8 ],
            Button [ label = "Save", primary = true, disabled = { !app.canSave },
                onClick() { app.col.nameF.commit(); app.col.mailF.commit() }
                ],
            Button [ label = "Revert",
                onClick() { app.col.nameF.revert(); app.col.mailF.revert() }
                ]
            ]
        ]
    ]
```

Empty a field and Save disables itself; fix it and Save returns. Nothing was wired to make
that happen.

**`commitOn` decides when a valid draft lands**: `"input"` (live, the default), `"blur"`,
`"enter"`, or `"manual"` — never automatically, only on `commit()`. **`validate(v)` is a
method you declare**, returning `""` for valid or the message otherwise. From those two,
three reactive facts follow — `valid`, `error`, and `dirty` (does the draft differ from
what is committed) — and **an invalid draft never reaches the dataset**; the error just
sits in the session waiting to be shown.

Then note what `canSave` is: an ordinary constraint over the fields' `valid` and `dirty`.
There is no form object, no validation schema, no submit handler. *Submittability derives*,
like everything else.

### The boundary, stated plainly

The edit session belongs to **editors** — it lives on `Editor`, the abstract base, and
`TextInput` is the only class that extends it today. A `Checkbox`, a `Slider`, a
`Segmented` cannot two-way bind at all: the compiler refuses `<->` on them and names the
value pattern as the fix. They use derive-down/deliver-up, and they **write immediately**.

(`Editor` is one of four classes you never write but will meet in the reference — with
`Layout`, `Stream`, and `RichText`. Each exists so its concrete forms inherit one
documented surface; writing the base itself reports "unknown component.")

There is a reason: a draft only means something when the in-progress value is
unrepresentable in the model. `"12/3"` is not a date and `"abc"` is not a number, so those
have to live somewhere outside the data — but there is no half-checked checkbox, and a
slider's value is clamped into range by construction.

That leaves one real question: what if you want *nothing* to be written until Save,
checkboxes included? The answer is not a per-control buffer — it is to **move the buffer
into the data**. Point the form at a working copy, let every control write into it freely,
and copy it across on Save:

```declare-fragment
draft: Dataset [ contents = { app.record.value } ],   // a copy to edit
…
Button [ label = "Save", onClick() { app.record.set([], app.draft.value) } ]
```

Every control works with that, precisely *because* controls know nothing about datasets —
they write wherever you point them. And it generalizes the same way validation does:
**validate the model, not the widgets.** A `canSave` computed over your data covers
checkboxes and sliders that have no `valid` slot of their own — the same move as
[chapter 10](declare-docs:guide:scale)'s *count the data, not the tree*.

## The board — everything at once

Here is the pattern that carries real applications, the same one the calendar runs
at scale: **keep the raw data flat, derive the view model from it, and let every
edit be a data write.** A task board — three columns, click a card to advance it,
add cards at the bottom:

```declare
class BCard extends View [ width = { parent.width }, height = 30, cornerRadius = 10, fill = darkslategray,
    onClick() { app.advance(:id) },
    t: Text [ x = 10, y = 10, fontSize = 12, wrap = false, text = :t ]
    ]


class Column extends View [ width = 130,
    layout: SimpleLayout [ axis = y, spacing = 8 ],
    name: Text [ fontSize = 12, fontWeight = bold, textColor = lightslategray, text = :name ],
    BCard [ datapath = :cards[], key = :id ]
    ]


App [ width = 470, height = 250, fill = black, textColor = whitesmoke,
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

    advance(id: string) {
        const cards = this.raw.read(["cards"])
        const i = cards.findIndex(c => c.id == id)
        if (i >= 0 && cards[i].col < 2) this.raw.set(["cards", i, "col"], cards[i].col + 1)
        },
    add() {
        const t = this.entryRow.entry.text
        if (t == "") return
        this.raw.set("/cards/-", ({ id: this.nextId, col: 0, t: t }))
        this.nextId = this.nextId + 1
        this.entryRow.entry.text = ""
        },

    cols: View [ x = 20, y = 20, datapath = { board.value },
        layout: SimpleLayout [ axis = x, spacing = 10 ],
        Column [ datapath = :cols[] ]
        ],
    entryRow: View [ x = 20, y = { app.height - 50 },
        layout: SimpleLayout [ axis = x, spacing = 8 ],
        entry: TextInput [ width = 250, height = 40, padding = 10, cornerRadius = 10,
            fill = darkslategray, placeholder = "Add a task" ],
        Button [ label = "Add", primary = true,
            onClick() { app.add() }
            ]
        ]
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

**What you can now say:** you can bind any tree to any data, select and slice within
it, declare the shape you rely on, let the data decide the count, derive screens from a
source's lifecycle instead of choreographing fetches, and structure a real app as raw
truth + derived model + edits-as-writes.

[Next: **Virtualization is one word** →](declare-docs:guide:scale)
