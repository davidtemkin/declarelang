<!-- nav: Data -->
<!-- part: Building -->

# Data is a place, not an event

In the stacks you know, data arrives as *events* — a fetch resolves, a callback fires,
you copy values into state and schedule the update. Declare inverts this. Data is a
**place**: you point part of the tree at it, and the tree derives — and when the data
changes, the same derivation holds. Nothing arrives; things *are*, and views follow.
And a place has a **shape**. You will read freely first — exploration is free here by
design — and then declare the shape you rely on, once, so the compiler and the runtime
hold every read and every write to it. That is this chapter's arc: point, read, trust,
write.

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

A real API usually wants a header — an API key, a bearer token — and that is an
ordinary attribute: `headers = { ({ "x-api-key": app.key }) }`. It is a record,
merged over the `Content-Type` a JSON `body` sets for itself, and **reactive like
any other slot**, which is what makes the authenticated case declarative rather
than imperative:

```declare-fragment
api: DataSource [ url = "/graphql", method = "POST", auto = true,
    headers = { ({ "x-api-key": app.key,
                   Authorization: app.token != "" ? "Bearer " + app.token : "" }) },
    body = { ({ query: app.query }) } ]
```

A header whose value is empty is not sent, so the ternary above *is* the whole
"only when signed in" story — no branch, no second source, and when the token
lands the header re-derives and (with `auto`) the request follows.

Not everything is structure. `format = "text"` delivers the fetched bytes as one
string — how an authored Markdown file becomes an app's material directly, no JSON
wrapping, no generated copy:

```declare-fragment
article: DataSource [ url = "notes.md", format = "text" ],
doc: Markdown [ visible = { article.loaded }, text = { article.value || "" } ]
```

(That is how this site serves its FAQ and the language document — `.md` files,
fetched as text, rendered by the native `Markdown` component.) Identity needs no
marking anywhere: a record's `id` field **is** its identity, by convention —
selection, reconciliation, and windowed retention all key by it with nothing
declared (`key = :field` remains only for an unconventionally-named one).

Notice, though, what a source hands you: whatever was there. The embedded body you
wrote yourself; the fetched one you did not. Dynamic reads are built for exactly
that — and where an application comes to *rely* on part of a payload's shape,
that reliance is worth declaring.

## Schemas — the shape you rely on, declared once

An application relies on a shape. The server renames `label` and three screens go
blank; a field you assumed was a number arrives as a string; the `undefined`
surfaces four bindings away from the fetch that caused it. Every stack meets this;
most answer with a validation library on one side and type annotations on the
other, glued by hand. Declare answers with one declaration — a **schema**:

```declare-fragment
schema Task [ id: string, title: string, done: boolean, born: number, note?: string ]
```

Before reading further, notice what vocabulary this is. Declare has **one type
system, and you already know it: TypeScript.** Attribute declarations state TS
types (`count: number = 0`); `{ }` bodies are TS expressions; method signatures
are TS signatures. A schema brings *data* into that same system — squint past the
brackets and you have written a TypeScript interface, and that is not a
resemblance but the fact: `Task` is a real type name everywhere TypeScript
reaches — declarations, method signatures, `script` function signatures, every
`{ }`. (Two reading notes: a schema's brackets hold *fields*, never members —
shape, not behavior, not defaults. And the one spelling that is not TS: the
array marker rides the field's *name* — `tags[]: string` — because it rhymes
with the path that reads it, `:tags[]`; type the TS form and the error names
the rewrite.) And what the grammar holds back from full
TypeScript is deliberate. A schema states facts about the *documents you will
accept* — strings, numbers, booleans, literal unions (`"open" | "closed"`,
`0 | 1 | 2`), records, arrays, `?` for a field the data may omit — exactly the
facts that can be checked against each document as it arrives. It is where an
API contract's prose — "`col` is 0, 1, or 2" — stops being something someone
read once and becomes a wall. **A schema is the part of the type system that
can be checked against live data**, so the one declaration is enforced twice:
by the compiler at every read it can see, and by the runtime at every boundary
data crosses.

Point a dataset at it and both walls are up:

```declare
schema Task [ id: string, title: string, done: boolean, born: number, note?: string ]

App [ width = 420, height = 240, fill = black, textColor = whitesmoke,
    nest: Dataset [ schema = [ tasks[]: Task ] ] {
        { "tasks": [ { "id": "t1", "title": "post the reading list", "done": false, "born": 1756700000000 },
                     { "id": "t2", "title": "clear the gutters",     "done": true,  "born": 1756400000000 } ] }
        },

    sel: Task = null,
    pick(id: string) { app.sel = (app.nest.value?.tasks ?? []).find(t => t.id == id) ?? null },

    open: Text [ x = 20, y = 20, text = { (app.nest.value?.tasks ?? []).filter(t => !t.done).length + " open" } ],
    list: View [ x = 20, y = 50, datapath = { nest.value },
        layout: SimpleLayout [ axis = y, spacing = 6 ],
        View [ height = 22, datapath = :tasks[],
            onClick() { app.pick(:id) },
            t: Text [ text = :title ]
            ]
        ],
    detail: Text [ x = 20, y = 200, text = { app.sel ? app.sel.title + (app.sel.done ? " — done" : "") : "nothing selected" } ]
    ]
```

**The compiler checks every read it can see.** `text = :titel` dies at compile
time with the schema's fields named — on attributes, on `key =`, on the
replication path itself (`datapath = :task[]` when the schema says `tasks[]`).
And because the dataset's *value* is typed, the plain-TS chain is typed too:
`app.nest.value.tasks` is `Task[]` to every constraint and method — the `filter`
above knows `t` is a `Task`, and misspelling `t.don` is a compile error with the
field named. There is no `as Task[]` anywhere in that program, and nothing for
one to do: the declaration made the shape the compiler's business.

**The runtime validates at every boundary.** A fetched response that does not
match lands in `.failed` with the exact pointer path — never `undefined` three
bindings deep. An embedded body that does not match fails at build. And a
mutation is held to the same shape: `set(["tasks", 0, "done"], "yes")` refuses
*at the write*, naming the path and the expectation, instead of a view quietly
deriving from a string (the mutation verbs themselves are the editing
section's subject, below). Validation is deliberately **permissive about extras** —
a schema declares what you *rely on*; keys it does not mention pass through
untouched, because real data is ragged.

**Your own state speaks the same names.** `sel: Task = null` is an ordinary
declaration whose type is the schema — record-shaped program state says what it
holds, instead of `object` and a cast at every read. A record slot may be null
before anything feeds it, exactly like a component slot, so reads are
`app.sel!.title` behind a null test — or total with `??`. And the slot is
**live past its identity**: `detail`'s binding above re-derives not only when
`sel` points at a different record but when the record's own field changes
underneath it — a `set(["tasks", 0, "title"], …)` wakes it — so a record slot
never shows a value that has since moved on. Methods too: `advance(t: Task)`
and `pick() -> Task` are checked signatures, not documentation. (If your TS
instinct was to write `interface Task` in a `script { }` block instead: the
compiler will point you here — a schema is that interface, plus the runtime
half.)

Two things complete the picture. First, **schemas are optional — everywhere,
permanently.** Nothing above changed the dynamic layer: a dataset with no schema
reads, replicates, and mutates exactly as before, and plenty of real payloads —
mixed-kind feeds, ragged converted trees, maps keyed by dates — have no regular
shape to declare. A *partial* schema is the normal case, not a compromise:
declare the two fields you rely on and let the rest flow (`meta: any` is the
sanctioned door for an irregular subtree). Reliance is the test; where you have
none, the dynamic reads above remain the right tool. (Two boundary notes: `?`
means the data may *omit* the field or send null — JSON APIs rarely honor the
difference, so the schema doesn't either; and a tagged union of record kinds —
an activity feed's `{"type": "push", …} | {"type": "issue", …}` — is regular
shape the grammar cannot yet say: today those fields are `any`, and the
register carries the increment.)

Second, **a schema is not a parser.** No transforms, no coerced dates, no
renamed keys — a schema checks what arrives; it never rewrites it. When a
payload needs reshaping — string ids to numbers, a ragged feed filtered to the
records you keep — that work is ordinary code in a **derived dataset**: declare
the *wire* shape on the raw source, project with a method or script function,
and declare the *model* shape on the projection — the same wire/domain split a
Codable or GraphQL hand already knows, with both ends checked. Type the
projection's signature (`normalize() -> Board`) and the chain is verified end
to end (the board at the end of this chapter runs the derived-dataset half of
this pattern).

A schema field can hold another schema, an array (`tags[]: string`), or a
**literal union** — JSON can say those, so the subset can. A *string* literal
union is not special to schemas, though: it is an ordinary type, sayable in
every type position the language has — an attribute declaration (`phase:
"idle" | "loading" = "idle"`), a parameter, a return. The closed set you can
state about *data* is the same one you can state about the state derived from
it. (A *number* union — `col: 0 | 1 | 2` — is a schema-field type only, for
now.)

```declare-fragment
schema Person [ id: string, name: string ]
schema Card [ id: string, title: string, status: "open" | "doing" | "closed", owner: Person, tags[]: string ]
```

…and `schema = Card[]` on a `DataSource` declares a response that is a bare
array of records — validated on arrival and typed through `.value`. (One
caveat rides that form: a `:path` cannot yet *begin* at an array, so to
replicate over a bare-array response, derive a wrapper first —
`rows: Dataset [ contents = { ({ rows: src.value ?? [] }) } ]` — and replicate
`:rows[]`.) A schema also does not have to be named: the document's shape
can be written inline at the dataset — `schema = [ city: string, rows[]: [ id:
string ] ]` — the anonymous form, right for a one-off remote shape nothing else
mentions. Name it the moment a second declaration would repeat it.

> **From React:** compare the ritual this replaces — an `interface` for the
> compiler, a zod/io-ts schema for the runtime, glue to keep the two agreeing,
> and `as` casts where they don't reach. Here there is one declaration, and it
> serves both sides *because* it is constrained to the subset both sides can
> enforce. The constraint is not a limitation of the type system; it is the
> definition of data.


One map remains — who enforces what, where — and it belongs at the end of the
chapter, once you have met every crossing it names.

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
dataset is record-shaped: navigable state, paths, mutation, a schema to hold it.
They stay separate on purpose, and the bridge between them is one line of app
code: parse the message, write into the dataset, and everything downstream
re-derives — with the dataset's schema, if it declares one, refusing a malformed
message at the bridge instead of on screen.

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
And on a schema'd dataset, the session knows the field's declared type: a
`number` field commits the *parsed* number (`"42"` lands as `42`), a literal
union commits only a member, and a draft that cannot be read as the type simply
leaves the session invalid — `valid` false, the reason in `error` — and never
reaches the data. (A boolean or record field refuses `<->` at compile, naming
the right tool.) `<->` is for editors only (`TextInput.text`, a slider's value)
— everywhere else, one-way `:path`, and app-owned control state uses the
derive-down/deliver-up pair from [chapter 8](declare-docs:guide:controls).
Mutating from code is just as
direct: `data.set(["rows", 0, "name"], "Ada L.")` writes one place and wakes exactly
what derives from it; `insert`, `removeAt`, and `move` reshape collections the same
way. A path is a segments array — numbers welcome, no escaping ever — or an RFC 6901
pointer string (`"/rows/0/name"`; `set("/rows/-", v)` appends), so any key a JSON
document can hold is addressable. And on a dataset that declares a schema, every
one of these writes is held to it — a wrong type, a broken record, or a value
outside a declared union refuses at the write, with the path named. Two honest
edges of that wall: a refusal is a **thrown error** — it stops the handler
where it stands, so route user-typed values through an editor's session (which
validates *before* writing, above) and keep the verbs for values the program
vouches for; and a *misspelled field name* is not a refusal — undeclared keys
pass, by the permissive rule, so `set(["tasks", 0, "donee"], true)` lands as a
new key no read will find. The schema holds types on the fields it names; the
names themselves are yours to spell.

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
sits in the session waiting to be shown. Note the division of labor with the previous
section: the *schema* holds structure — types, presence, unions — at every write, no
session needed; `validate` holds *judgment* — what counts as acceptable input for this
field, in this form.

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
at scale: **keep the raw data flat and typed, derive the view model from it, and let
every edit be a data write.** A task board — three columns, click a card to advance
it, add cards at the bottom:

```declare
schema Card [ id: number, col: 0 | 1 | 2, t: string ]

class BCard extends View [ width = { parent.width }, height = 30, cornerRadius = 10, fill = darkslategray,
    onClick() { app.advance(:id) },
    t: Text [ x = 10, y = 10, fontSize = 12, wrap = false, text = :t ]
    ]


class Column extends View [ width = 130,
    layout: SimpleLayout [ axis = y, spacing = 8 ],
    name: Text [ fontSize = 12, fontWeight = bold, textColor = lightslategray, text = :name ],
    BCard [ datapath = :cards[] ]
    ]


App [ width = 470, height = 250, fill = black, textColor = whitesmoke,
    raw: Dataset [ schema = [ cards[]: Card ] ] {
        { "cards": [ { "id": 1, "col": 0, "t": "Outline the guide" },
                     { "id": 2, "col": 0, "t": "Fix the rail" },
                     { "id": 3, "col": 1, "t": "Draft the data chapter" },
                     { "id": 4, "col": 2, "t": "Set up the sandbox" } ] }
        },
    nextId: number = 5,

    colNames() { return ["To do", "Doing", "Done"] },
    buildCols() {
        const cards = this.raw.value?.cards ?? []
        return { cols: this.colNames().map((n, i) => ({ name: n, cards: cards.filter(c => c.col == i) })) }
        },
    board: Dataset [ contents = { app.buildCols() } ],

    advance(id: number) {
        const cards = this.raw.value?.cards ?? []
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
*is*. `raw` is the truth — a flat list, each card knowing only its column number —
and the truth is **typed**: the schema holds every write that follows (`add`'s
record must be a whole `Card`; `advance` cannot move a card to a column that
does not exist — `col` is `0 | 1 | 2`, not merely a number), and in
`buildCols` the compiler knows `cards` is `Card[]`, so `c.col` is a number it
vouches for. `board` is a **derived dataset**: `contents = { app.buildCols() }`
recomputes when anything it reads changes, because the compiler read *through*
`buildCols` and wired its dependencies
([chapter 3](declare-docs:guide:relationships), paying off) — and it carries no
schema, deliberately: a projection the program computes is not a boundary, and
schemas guard boundaries. Columns and cards are nested replication over the
derived shape. And both user actions are *one data write each*: `advance` sets a
single field; `add` inserts a record. No view is ever touched by the handlers —
the writes wake the derivation, the derivation reshapes the board, keyed
replication rebuilds only what changed.

That division — typed raw truth, derived model, edits as writes — is the
deepest habit this chapter can leave you with; it is the same raw/derived/writes
shape that makes "navigation," in the calendar, three assignments.

## The enforcement map

Every place data moves has exactly one answer for who holds it to the schema,
and when — the chapter's walls, in one look back:

| Data crosses… | Held by | When | A violation… |
|---|---|---|---|
| a fetched response | runtime | on arrival | lands in `.failed` with the pointer path; `.value` keeps the last good document |
| an embedded `{ json }` body | runtime | at build | fails the build, path named |
| a mutation verb — `set`, `insert` | runtime | at the write | refuses, path and expectation named |
| a `<->` editor's draft | the edit session | at commit | an unreadable draft is an invalid session (`valid` false), never a write |
| a `:path` on an attribute — `text = :title`, `key =`, `datapath = :rows[]` | compiler | at compile | error with the schema's fields named |
| the typed `.value` chain, in any `{ }` or method | compiler | at compile | type error, near name suggested |
| a declaration or signature — `sel: Task`, `advance(t: Task)` | compiler | at compile | type error |
| `contents` of a derived dataset | compiler | at compile | type error against the document type |
| a `:path` *inside* a `{ }` body | no one yet | — | reads null; the attribute falls to its default |
| a subtree under a computed cursor — `datapath = { cond ? a : b }` | no one, by design | — | beyond the static horizon; unchecked, never refused |

The second column carries the principle: **the runtime stands where data the
program didn't construct comes in; the compiler stands where the program
constructs it.** The last two rows are the honest edge — one a known gap the
register carries, one a horizon no static checker can cross. The runtime walls
stand either way: validation reads the declaration, not the compiler's reach.

---

**What you can now say:** you can bind any tree to any data, select and slice within
it, declare the shape you rely on — once, as a type the compiler checks and the
runtime enforces — let the data decide the count, derive screens from a source's
lifecycle instead of choreographing fetches, and structure a real app as typed raw
truth + derived model + edits-as-writes.

[Next: **Virtualization is one word** →](declare-docs:guide:scale)
