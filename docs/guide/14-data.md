<!-- nav: Data -->
<!-- part: Building -->

# Data

In most stacks, data arrives as *events*: a fetch resolves, a callback fires, you copy
values into state and schedule an update. Declare treats data as a **place**. You point
part of the tree at a place in a dataset, and that part of the tree derives from it —
and keeps deriving from it when the data changes. Nothing is copied, so nothing goes
stale.

> **Point the tree at the data. Repeated structure comes from data, not from a loop.
> Edits are writes to the data.**

This chapter covers where data lives, how views read and repeat over it, how handlers
write it, how a class stands on a record, how a dataset carries its own logic, how data
arrives from a server or a stream, and how text fields edit it. [Typed data](declare-docs:guide:schemas) adds the
schemas that make the compiler check all of it.

## Datasets, cursors and paths

A [`Dataset`](declare-docs:Dataset) holds data, as JSON, in the tree. A view's [`datapath`](declare-docs:Node.datapath) attribute points it
at a place in that data — its **cursor** — and every descendant reads fields
relative to it with a `:path`. A path ending in `[]` **replicates** its view: one
instance per record.

```declare
App [ width = 300, height = 150, fill = midnightblue, textColor = gainsboro,
    people: Dataset {
        { "rows": [ { "id": 1, "name": "Ada", "score": 92 },
                    { "id": 2, "name": "Grace", "score": 87 },
                    { "id": 3, "name": "Alan", "score": 74 } ] }
        },
    list: View [ x = 20, y = 20, datapath = { app.people.value },
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        View [ datapath = :rows[],
            layout: SimpleLayout [ axis = x, spacing = 12 ],
            Text [ width = 120, text = :name ],
            Text [ text = :score ]
            ]
        ]
    ]
```

The inner view is written once, against an abstract record, and instantiated per row.
Add a record to the data and a row appears; delete one and its row leaves. There is no
`.map()`, no loop to maintain, no list view — replication is simply what a path
that matches many does. Replicated rows are anonymous; you reach them through their
data, not by name.

Rows are matched to records by the record's **`id`** field, with nothing declared. Sort
the data and the rows *move* rather than being rebuilt, and any state a row holds
travels with its record. When identity lives under another name, `key = :field` on the
replicated view says which.

> **From React:** this retires `rows.map((r) => <Row key={r.id}/>)`. Identity is the
> data's, not a render hint you remember to pass, and never an array index.

A `:path` reaches through structure the way you would expect: `:owner.name` reads a
nested field, `:images[0]` an element, `:images[-1]` the last one. Paths also support
slices and wildcards (`:rows[1:4]`, `:rows[*].label`) and quoted names for keys with
dashes; the reference page for `:path` lists them. A `:path` works inside a `{ }` too —
`text = { :done ? "✓ " + :title : :title }` — and a non-visual child such as a
[`Spring`](declare-docs:Spring) or a [`DataSource`](declare-docs:DataSource) reads the cursor of the view it belongs to.

One current limit: when an array holds bare values (`"tags": ["new", "sale"]`),
replicating over it works, but there is no `:path` naming the string itself. Give the
values a field (`[{ "label": "new" }, …]`) and read `:label`.

## Writing a record

A handler or method writes a field of the record its view is attached to with the same
spelling it reads it by:

```declare
App [ width = 320, height = 170, fill = white, textColor = #172530,
    todo: Dataset { { "items": [ { "id": 1, "title": "Water the plants", "done": false, "stars": 0 },
                                 { "id": 2, "title": "Call the bank", "done": true, "stars": 2 } ] } },
    left: number = { app.todo.value.items.filter((t) => !t.done).length },
    col: View [ x = 20, y = 20, width = 280, datapath = { app.todo.value },
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        Text [ fontWeight = semibold, text = { app.left + " left to do" } ],
        View [ datapath = :items[], width = 100%, height = 30,
            layout: SimpleLayout [ axis = x, spacing = 10, align = center ],
            Checkbox [ checked = :done, input(v: boolean) { :done = v } ],
            Text [ width = 150, text = :title ],
            Button [ label = { "★ " + :stars }, height = 26, onClick() { :stars += 1 } ]
            ]
        ]
    ]
```

`:done = v` writes the `done` field of *this row's* record — the row does not need to
know where in the list it sits. `:stars += 1` reads and writes the same field. The
write lands in the dataset, so everything reading that data follows in the same step:
the count at the top, the checkbox, any other screen showing the same record. The value
pattern of [Controls](declare-docs:guide:controls@the-value-pattern) applies unchanged: the checkbox shows
`:done` and delivers its edit through `input`.

A write names one place — a field, a nested field, or a non-negative index. Changes to
the *shape* of a collection go through the dataset's verbs:

- `d.set(path, value)` writes one place; `d.set([], value)` replaces all of it;
- `d.insert(path, index, value)` and `d.removeAt(path, index)` add and remove elements,
  and `d.set("/rows/-", value)` appends;
- `d.move(path, from, to)` reorders, and the rows move with their records.

A path is a list of segments (`["rows", 0, "name"]`) or a pointer string
(`"/rows/0/name"`). A dataset's `value` is read-only — data changes through these verbs,
never by assigning `value`.

### The record itself, and a field chosen at run time

A `:path` names a field of the record under the cursor. **`:@` names the record itself**
— JSONPath's "current node". The common case is a list of plain values, where the
record *is* the value and there is no field to name:

```declare
App [ width = 300, height = 60, fill = white, textColor = #172530,
    d: Dataset { { "tags": ["design", "draft", "urgent"] } },
    row: View [ x = 20, y = 20, datapath = { app.d.value },
        layout: SimpleLayout [ axis = x, spacing = 8 ],
        Text [ datapath = :tags[], text = :@ ]
        ]
    ]
```

When the records are objects, `:@` is the object — rarely needed for reading, since
`:title` reads a field, but it is how a row hands its whole record to a method:
`onClick() { app.open(:@) }`. Under a schema the record is typed, so a row can hold it as
one — `rec: Task = { :@ }` — and pass it on, instead of looking it up again by id.

**`[( … )]` is a key computed by TypeScript.** Inside `[ ]` a path takes JSONPath's
selectors — `[0]`, `['name']`, `[1:3]`; inside `[( )]` it takes an expression, and the
field (or index) is whatever the expression gives. It is for the field you do not know
when you write the code — a grid cell whose column names the field it shows:

```declare-fragment
Text [ text = { "" + :@[(classroot.field)] } ],                // the field this column shows
TextInput [ text = { "" + :@[(classroot.field)] },
    onInput(v: string) { :@[(classroot.field)] = v } ]         // and writes it back
```

It works anywhere in a path — `:rows[(app.pick)].title` is the title of the record
`pick` indexes — and follows the expression as well as the data: change `pick` and the
read follows. Like any `:path`, both forms are read in a `{ }` and written in a handler:
`:@[(f)] = v` writes one field, and `:@ = r` replaces the record.

## A Node class on a record

A class with no view ([Program structure](declare-docs:guide:structure@when-a-class-earns-its-place)) can stand on a
record of its own. Give it a `datapath`, and its declarations derive from the record
and its methods write back to it — with no view involved:

```declare
class TaskModel extends Node [
    title: string = { "" + :title },
    overdue: boolean = { :due < app.today },
    finish() { :done = true }
    ]

App [ width = 340, height = 150, fill = white, textColor = #172530,
    today: number = 5,
    pick: number = 0,
    d: Dataset { { "tasks": [ { "id": 1, "title": "File the report", "due": 3, "done": false },
                              { "id": 2, "title": "Plan the offsite", "due": 9, "done": false } ] } },
    sel: TaskModel [ datapath = { app.d.value.tasks[app.pick] } ],
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        Text [ fontWeight = semibold,
            text = { app.sel.title + (app.sel.overdue ? " — overdue" : "") } ],
        row: View [ layout: SimpleLayout [ axis = x, spacing = 8 ],
            Button [ label = "Next task", onClick() { app.pick = (app.pick + 1) % 2 } ],
            Button [ label = "Finish", primary = true, onClick() { app.sel.finish() } ]
            ],
        Text [ textColor = slategray,
            text = { app.d.value.tasks.filter((t) => t.done).length + " finished" } ]
        ]
    ]
```

`sel` is a `TaskModel` pointed at whichever task `pick` names. `title` and `overdue` are
constraints on the record; `finish()` writes `:done`. Change `pick` and the whole model
moves to the other record. Views read the model; the model reads and writes the data.
A model that owns the rules for a kind of record — what "overdue" means, what finishing
does — keeps those rules in one place instead of scattered across the views that show
it.

(A class like this stands on *one* record. Replicating it over a collection, the way rows
replicate, is not supported; only views replicate.)

### Deriving summaries: methods, and a typed result

Most apps also compute things *from* the whole collection — a category's total, a
running balance, the largest item. They are **methods**, on the App while there are a few of
them; when the logic of one dataset's records grows into a thing in its own right, the dataset
becomes a class that extends `Dataset` (or `DataSource`, when it arrives from a server), carrying its
derivations, its queries and the few writes that are more than a field. The compiler reads through a method, so what a constraint
depends on is known and `explain` can show it; through a `script` function it traces nothing,
so a constraint depends only on the arguments it passes. Give a result a `schema` and it arrives typed, with no casts:

```declare
schema Expense [ id: number, category: string, amount: number ]
schema Totals [ count: number, amount: number ]

class Ledger extends Dataset [ schema = [ rows[]: Expense ],
    food: Dataset [ schema = Totals, contents = { classroot.totalFor("food") } ],
    totalFor(category: string) -> Totals {
        const rows = this.value.rows.filter((e) => e.category == category)
        return ({ count: rows.length, amount: rows.reduce((n, e) => n + e.amount, 0) })
        },
    add(category: string, amount: number) {
        this.set(["rows", "-"], ({ id: this.value.rows.length + 1, category: category, amount: amount }))
        }
    ]

App [ width = 320, height = 110, fill = white, textColor = #172530,
    ledger: Ledger [ ] { { "rows": [ { "id": 1, "category": "food", "amount": 12 }, { "id": 2, "category": "travel", "amount": 45 } ] } },
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        Text [ text = { app.ledger.food.value.count + " food expenses, $" + app.ledger.food.value.amount } ],
        Button [ label = "Add a $20 lunch", onClick() { app.ledger.add("food", 20) } ]
        ]
    ]
```

`app.ledger` *is* the expenses: a view binds to it directly (`datapath = { app.ledger.value }`)
and a row writes its own expense as it would in any dataset. `food` is a derived dataset
declared on it: its contents are whatever `totalFor("food")` returns, re-derived when the
expenses change, and its `schema` makes `app.ledger.food.value.count` a `number` to every
body. A dataset class holds members that paint nothing — a derived dataset, a `Time` — and
never views. [Data in a whole app](declare-docs:guide:data@data-in-a-whole-app), below,
binds views to a dataset class and its derived dataset together.

When logic moves out of the App, where it goes follows what it is about: the logic of one
dataset's records — its derivations, queries over them, how a record is created, the rules a
write must keep — moves onto the dataset, as its class; other logic with no view — a
service, a connection feeding several datasets, an undo history — moves into a class that
extends `Node`, of which a dataset class is the special case that holds data. What the user is looking at — the selection, the page, the mode — is never
on the data.
What stays in `script` is code that knows nothing about your model — date arithmetic,
formatting — functions of their arguments alone.

## Where data comes from

A **`Dataset`** holds embedded or computed data. Its literal body is strict JSON —
quoted keys, no trailing commas. A derived dataset computes its data with
`contents = { … }` and recomputes when what it reads changes.

Views bind to every kind the same way, and write them the same way: data fetched from a
server, a working copy or excerpt of it (the page of records on screen), a derived
dataset, or data the app creates for itself. An app that only manages its own data writes
it directly — there is no server to imitate and nothing to buffer.

A **`DataSource`** is a dataset whose data arrives over HTTP, and its lifecycle is
reactive state:

```declare-fragment
weather: DataSource [ url = { `/data/weather/${app.zip}.json` }, auto = true ],

splash: View [ visible = { !app.weather.loaded } ],       // nothing has arrived yet
report: View [ visible = { app.weather.loaded } ],        // stays up while a refresh runs
spinner: View [ visible = { app.weather.loading } ],      // a request is in flight
notice: Text [ visible = { app.weather.failed }, text = { app.weather.error } ]
```

`loaded` is about the *value*: true from the first arrival until [`clear()`](declare-docs:DataSource.method.clear) empties the
source, and still true while a refresh runs. [`loading`](declare-docs:DataSource.loading) and `failed` are about the
*request*. The two are independent — `loaded && loading` is a refresh, the old data
showing and the new on its way. When a request fails, `value` keeps the last good
data, `error` says why, and [`statusCode`](declare-docs:DataSource.statusCode) and [`errorBody`](declare-docs:DataSource.errorBody) carry what the server said.

**Loading is explicit.** A `DataSource` does not fetch because it was declared. Call
[`fetch()`](declare-docs:DataSource.method.fetch) — in `onInit`, or on a user action — or set `auto = true` when the address
*is* the reactive thing, so a change of `url` means "load it". [`method`](declare-docs:DataSource.method), [`body`](declare-docs:DataSource.body) and
[`headers`](declare-docs:DataSource.headers) are ordinary attributes, so an authenticated request is declarative: a header
whose value is empty is not sent, which makes `Authorization: app.token != "" ? "Bearer
" + app.token : ""` the whole "only when signed in" story. `format = "text"` delivers the
bytes as one string — how a Markdown file becomes an app's material directly.

**Screens derive from data state.** There is no `isLoading` flag to set and no navigation
code that shows the report when the fetch returns. The zip changes, the URL re-derives,
the source fetches, and the screens follow. The fetch-then-set-state choreography is
deleted, not abstracted.

**Logic about one feed belongs on it.** A dataset with rules of its own becomes a class
that extends `Dataset` (below); one whose data arrives from a server becomes a class
that extends `DataSource`, carrying its address, its queries over what arrived, and
whatever its arrival must do. The class is declared at the top level, beside its schema:

```declare-fragment
schema Quote [ sym: string, price: number ]

class Quotes extends DataSource [ url = "/api/quotes", auto = true, schema = [ rows[]: Quote ],
    priceOf(sym: string) -> number { return this.value?.rows.find((q) => q.sym == sym)?.price ?? 0 },
    expensive: Dataset [ contents = { { rows: (classroot.value?.rows ?? []).filter((q) => q.price > 100) } } ]
    ]
```

and the App holds an instance, which views read and bind to exactly as to any dataset — its
records, its queries, and its derived datasets:

```declare-fragment
quotes: Quotes [ ],
Text [ text = { "ACME " + app.quotes.priceOf("ACME") } ],
pricey: View [ datapath = { app.quotes.expensive.value },
    layout: SimpleLayout [ axis = y ],
    Text [ datapath = :rows[], text = :sym ]
    ]
```

The marketmap's `Market` is one at full size.

## Talking to a server

Sending is a `DataSource` too. A write is a source whose `method` is not GET: it has a
`url`, a `body` and `headers` like any other, a handler calls its `fetch()`, and the
screen derives from its `loading` and `failed` exactly as it does for a read. Here a list
is read from one source and new items are posted through a second:

```declare-fragment
draft: string = "",
tasks: DataSource [ url = "/api/tasks" ],
create: DataSource [ url = "/api/tasks", method = "POST",
    body = { { title: app.draft, done: false } },
    onLoad() { app.draft = ""; app.tasks.fetch() }
    ],
TextInput [ width = 220, text = { app.draft }, onInput(v: string) { app.draft = v } ],
Button [ label = { app.create.loading ? "Saving…" : "Add" },
    disabled = { app.create.loading || app.draft == "" },
    onClick() { app.create.fetch() }
    ],
Text [ visible = { app.create.failed }, text = { "Not saved: " + app.create.error } ]
```

Four facts make this work without choreography:

- **`fetch()` settles first.** A handler that changes what the request is built from and
  then calls `fetch()` sends the new request, never the old one. That is how an update or
  a delete addresses one record (below).
- **`onLoad()` is what follows the reply.** It runs once the response has landed in the
  source's `value`. Refetch the list there, as above, or merge the reply into your own
  data. A `body` that is an object is sent as JSON.
- **`fetch()` never throws.** A refusal lands in `failed` and `error`, with the status in
  `statusCode` and whatever the server said in `errorBody` — its JSON parsed, if it sent
  JSON, so a validation message can be shown next to the field it names. `fetch()` does
  return a promise, but the flags and `onLoad` are the idiom; a later `fetch()` on the
  same source supersedes an earlier one, whose reply is dropped.
- **A source's value is the server's.** Each successful `fetch()` replaces it. When the
  user edits what was loaded and the source fetches again — on a timer, a changing `url`,
  `auto` — copy it into a `Dataset` in `onLoad` and edit that — the working copy — so a
  refresh does not overwrite work in progress. A source that loads once and is kept
  current by the app (a `Socket` writing into it, say) has nothing to overwrite, and its
  own value can be edited directly.

**Writing to one record** takes an attribute that says which record, and a source whose `url`
reads it:

```declare-fragment
target: string = "",                     // the record the next write is aimed at
finish: DataSource [ url = { "/api/tasks/" + app.target }, method = "PATCH",
    body = { { done: true } },
    onLoad() { app.tasks.fetch() }
    ],
remove: DataSource [ url = { "/api/tasks/" + app.target }, method = "DELETE",
    onLoad() { app.tasks.fetch() }
    ],
```

A row aims and sends in one handler — `onClick() { app.target = :id; app.remove.fetch() }`
— and because `fetch()` settles first, the request carries this row's id.

**Several sources, one screen.** A screen that needs two sources derives from both:
`ready: boolean = { app.people.loaded && app.rooms.loaded }`. There is no join to write
and no order to wait in.

**Refreshing on a schedule** is a [`Time`](declare-docs:Time) with a period in milliseconds, calling the
source:

```declare-fragment
poll: Time [ tick = 30000, running = { app.tasks.loaded }, onTick() { app.tasks.fetch() } ]
```

A refresh keeps `loaded` true and the old data showing until the new data lands, so
nothing flashes. The period counts from when the `Time` starts, and a hidden page pauses
it.

**Reacting once to a failure** — logging it, moving focus — is a change event on the
source, since `failed` is an ordinary attribute:
`trackChanges = ["failed"], onChange(e: ChangeEvent) { … }` on the `DataSource`. Showing
the failure is not that case; a constraint on `failed` does it.

The host's `fetch` is not available in a `{ }` body; the compiler names `DataSource`
instead. A request a `DataSource` genuinely cannot express belongs in a
`script [ "file.ts" ]` module, which is plain TypeScript
([Program structure](declare-docs:guide:structure@what-script-is-for)).

## Streams

Some data arrives while you watch: a job reporting its progress, prices ticking, a log
following itself. [`EventStream`](declare-docs:EventStream) (server-sent events) and [`Socket`](declare-docs:Socket) (a WebSocket, plus
[`send()`](declare-docs:Socket.method.send)) are sources for that; both extend the abstract [`Stream`](declare-docs:Stream):

```declare-fragment
output: string = "",
progress: EventStream [ url = { `/api/jobs/${app.jobId}/events` },
    active = { app.jobId != "" },
    onMessage(e: StreamMessage) { app.output = app.output + e.data }
    ],
out: Text [ width = 100%, text = { app.output } ]
```

There is no `connect()` and no cleanup. A stream is connected exactly while `active` is
true and `url` is not empty; a new URL closes and reopens; a removed node takes its
connection with it. Messages are strings and nothing accumulates unless a handler writes
it somewhere; [`last`](declare-docs:Stream.last) holds the most recent message, so `text = { feed.last }` is a
complete ticker. [`status`](declare-docs:Stream.status) reports the connection (`"connecting"`, `"open"`, `"retrying"`,
`"failed"`, `"closed"`), and `retry = 2` re-dials two seconds after a loss the platform
will not repair — the whole policy is that one number. A stream that labels its events
(most AI APIs do) must list them: `listenTo = ["delta", "done"]`.

To keep streamed records, parse each message in the handler and write it into a dataset;
everything downstream follows.

## Editing text, and forms

A text field can edit a record directly, both ways, with `<->`:
[`TextInput [ text <-> :name ]`](declare-docs:TextInput). Type and the record follows; change the record and the
field follows. Under a schema, a number field commits the parsed number, and a draft that
cannot be read as the field's type never reaches the data.

A form usually wants more: a **draft** the user is editing, validated, that lands only
when it is good and only when they say so. That is a text field's edit session — it
belongs to [`Editor`](declare-docs:Editor), the base class `TextInput` extends:

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

Empty a field and Save disables itself; fix it and Save returns. **[`commitOn`](declare-docs:Editor.commitOn)** decides
when a valid draft lands: `"input"` (live, the default), `"blur"`, `"enter"`, or
`"manual"` — only on [`commit()`](declare-docs:Editor.method.commit). **`validate(v)`** returns `""` for valid or the message
otherwise. From those, three facts follow — [`valid`](declare-docs:Editor.valid), `error` and [`dirty`](declare-docs:Editor.dirty) — and an invalid
draft never reaches the dataset. `canSave` is an ordinary constraint over them: no form
object, no submit handler.

Drafts belong to text fields because an in-progress value can be unrepresentable in the
data (`"12/3"` is not a date). A checkbox or slider writes immediately. When *nothing*
should be written until Save, move the buffer into the data instead: point the form at a
working copy — a plain `draft: Dataset { { } }`, filled when editing starts with
`app.draft.set([], structuredClone(app.record.value))` — let every control write to it
freely, and copy it across on Save with `app.record.set([], structuredClone(app.draft.value))`.
The copy is what makes it a draft: a derived dataset would hold the record itself, and
its writes would land in the record at once. Validate the model, not the widgets: a
`canSave` computed over the draft covers controls that have no `valid` of their own.

## Data in a whole app

Here is the pattern that carries real applications, and the one the calendar runs at
scale: **keep the raw data flat and typed, derive the view model from it, and make every
edit a write to the raw data.** A task board — click a card to move it along, add cards
at the bottom:

```declare
schema Task [ id: number, col: 0 | 1 | 2, t: string ]

class Board extends Dataset [ schema = [ cards[]: Task ],
    lanes: Dataset [ contents = { classroot.byColumn() } ],
    byColumn() {
        const cards = this.value?.cards ?? []
        return { lanes: ["To do", "Doing", "Done"].map((n, i) => ({ name: n, cards: cards.filter((c) => c.col == i) })) }
        },
    add(t: string) {
        const cards = this.value?.cards ?? []
        this.set("/cards/-", ({ id: cards.reduce((m, c) => Math.max(m, c.id), 0) + 1, col: 0, t: t }))
        }
    ]


class BCard extends Control [ width = 100%, height = 30, cornerRadius = 10,
    fill = { pressed ? 0x3E5C66 : hovered ? 0x36525B : 0x2F4F4F },
    press() { :col = Math.min(:col + 1, 2) },
    TextLabel [ x = 10, fontSize = 12, wrap = false, textColor = whitesmoke, text = :t ]
    ]


class Lane [ width = 130,
    layout: SimpleLayout [ axis = y, spacing = 8 ],
    name: Text [ fontSize = 12, fontWeight = bold, textColor = lightslategray, text = :name ],
    BCard [ datapath = :cards[] ]
    ]


App [ width = 470, height = 250, fill = black, textColor = whitesmoke,
    board: Board [ ] {
        { "cards": [ { "id": 1, "col": 0, "t": "Outline the guide" },
                     { "id": 2, "col": 0, "t": "Fix the rail" },
                     { "id": 3, "col": 1, "t": "Draft a chapter" },
                     { "id": 4, "col": 2, "t": "Set up the sandbox" } ] }
        },

    lanes: View [ x = 20, y = 20, datapath = { app.board.lanes.value },
        layout: SimpleLayout [ axis = x, spacing = 10 ],
        Lane [ datapath = :lanes[] ]
        ],
    entryRow: View [ x = 20, y = { app.height - 50 },
        layout: SimpleLayout [ axis = x, spacing = 8 ],
        entry: TextInput [ width = 250, height = 40, padding = 10, cornerRadius = 10,
            fill = darkslategray, placeholder = "Add a task" ],
        Button [ label = "Add", primary = true,
            onClick() {
                if (parent.entry.text == "") return
                app.board.add(parent.entry.text)
                parent.entry.text = ""
                }
            ]
        ]
    ]
```

Read it top to bottom. `Board` is the dataset, and its records are the truth: a flat
list, each card knowing only its column number, typed by a schema that holds every write
that follows ([Typed data](declare-docs:guide:schemas)). The dataset carries its own
logic: `lanes`, a **derived dataset** whose `contents = { classroot.byColumn() }`
recomputes when anything `byColumn` reads changes (the compiler reads through the
method), and `add`, the one write that is more than a field. The App holds an instance
and the views. Lanes and cards replicate over `app.board.lanes.value`; a view that
wanted the flat list would bind to `app.board.value` the same way. Both user actions are
one write each, and the dataset never touches a view.

Note where the card's click writes: `:col = :col + 1`, on the card itself, although the
card is attached to the *derived* lanes. `byColumn` groups the cards — it does not copy
them — so `lanes` holds the board's own records, and writing one writes the board. The
lanes re-derive from that write and the card moves to its new column. **A derived
dataset that selects records — filter, sort, group — holds its source's records, and a
row writes its record as it would anywhere.** Nothing in between is needed to make that
happen: no attribute that mirrors the data or counts its changes so the lanes notice.
Whatever a `{ }` reads, it follows.

What a derived dataset *makes* is its own, and read-only: the column objects here, a copy
(`{ ...c }`), a summary. A write to one is refused, with an error saying to write the
source, because the next recompute would replace it. So what a row needs beyond its
record comes one of four ways:

- **Computed in the row**, when it follows from the record alone: a label, a colour —
  a constraint on the row.
- **`rowIndex`**, when it is the row's position: stripes, ranks, "3 of 12"
  ([Large collections](declare-docs:guide:collections@row-position-rowindex)).
- **Provided from above**, when it is the list's own geometry or setting — a column
  width every row shares. Declare it on the list (`colW: number = { this.width / 7 }`) and
  read `provided("colW")` in the row ([Paint and themes](declare-docs:guide:paint-and-themes@provided-values)),
  rather than reaching up with a long `app.…` path.
- **A wrapper**, when it depends on the other records, like a lane that avoids
  overlapping events. Wrap the record, don't copy it:

```declare-fragment
lanes() -> array { return app.laneOf(raw.value.events).map((e, n) => ({ ev: e, lane: n })) },
laid: Dataset [ contents = { { blocks: app.lanes() } } ],

Block [ datapath = :blocks[], x = { :lane * 80 },
    t: Text [ datapath = :ev, text = :title ]    // :ev is raw's own record — edits land there
    ]
```

The wrapper is made, so `:lane` is read-only; the record inside it is still the source's.

That division — typed raw truth, a derived model, edits as writes — is the deepest habit
this chapter can leave you with. In the calendar it is what makes navigation three
assignments.

---

**What you can now do:** point views at data and repeat over it, write records from
handlers, stand a model on a record, derive screens from a source's lifecycle, follow a
stream, build forms with drafts and validation, and structure an app as truth, derivation
and writes.

[Next: **Typed data: schemas** →](declare-docs:guide:schemas)
