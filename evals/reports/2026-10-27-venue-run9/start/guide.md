# For this program: the guide

The guide sections for the needs you chose, each with where it is in the guide.

---

_docs/guide/14-data.md, lines 471–641 (Editing text, and forms) — for: form_

## Editing text, and forms

A text field can edit a record directly, both ways, with `<->`:
[`TextInput [ text <-> :name ]`](declare-docs:TextInput). Type and the record follows; change the record and the
field follows. Under a schema, a number field commits the parsed number, and a draft that
cannot be read as the field's type never reaches the data. **[`commitOn`](declare-docs:TextInput.commitOn)** decides when a
draft lands: `"input"` (live, the default), `"blur"`, `"enter"`, or `"manual"` — only on
[`commit()`](declare-docs:TextInput.method.commit). Drafts belong to text fields because an in-progress value can be unrepresentable
in the data (`"12/3"` is not a date); a checkbox or a slider writes at once.

When *nothing* should be written until the person says so, point the form at a **working
copy** — a plain `draft: Dataset { { } }`, filled when editing starts with
`app.draft.set([], structuredClone(app.record.value))` — let every control write to it, and
copy it across when it is saved. The copy is what makes it a draft: a derived dataset would
hold the record itself, and its writes would land at once. Values can just as well live on
the App or on a model class of their own, as computed defaults that follow an account until
the person types.

### A form

What a field may hold is said **on the field**: `required` (`true`, or the message to say),
and `validate(v)`, a method that returns `""` when the value is fine and otherwise the
sentence that says what is wrong. A [`Form`](declare-docs:Form) gathers the fields inside it — there is
nothing to register — and sends them. The normal case sends to a service: the form's
`source` is the `DataSource` that writes, its `body` built from wherever the values live.

```declare-fragment
email: string = "",
password: string = "",
session: DataSource [ url = "/api/session", method = "POST",
    body = { { email: app.email, password: app.password } },
    onLoad() { app.signedIn() } ],

signIn: Form [ source = { app.session },
    layout: SimpleLayout [ axis = y, spacing = 14 ],
    Field [ label = "Email", stacked = true,
        TextInput [ width = 280, name = "email", purpose = email, required = "Enter your email address.",
            text = { app.email }, onInput(v: string) { app.email = v },
            validate(v: string) -> string { return v.includes("@") ? "" : "Enter an email address like name@example.com." } ] ],
    Field [ label = "Password", stacked = true,
        TextInput [ width = 280, name = "password", purpose = password, required = "Enter your password.",
            text = { app.password }, onInput(v: string) { app.password = v } ] ],
    Text [ visible = { parent.error != "" }, text = { parent.error } ],
    Button [ label = { parent.pending ? "Signing in…" : "Sign in" }, primary = true,
        onClick() { parent.submit() } ]
    ]
```

There is no flag to keep and no handler for failure:

- **A field says what is wrong once it has been left**, and from then on at every edit, so the
  message goes the moment the value is right. Nothing is marked wrong while it is first typed.
- **[`submit()`](declare-docs:Form.method.submit) judges every field at once** — the ones the person never reached and the ones
  autofill filled included — so every problem shows together, each under its own field, and
  the focus goes to the first. Return in a field submits too — or, in a form filled in
  order (a checkout, an address), set [`enterMoves`](declare-docs:Form.enterMoves) and Return takes the person to the
  next field, submitting from the last; a phone's keyboard says "Next" and then "Go". Nothing is sent while anything
  is wrong, and nothing twice while `pending`.
- **Keep Submit enabled.** A button disabled until the form is valid hides the reason, and an
  autofilled form can leave it disabled for good; pressing it is what explains. (`pending` is
  the one time it waits: say so in its label.)
- **The service's refusal lands on the field it names.** A reply such as
  `{ "field": "email", "message": "That address already has an account." }` puts the
  sentence under the email field until the email changes; one that names no field
  (`{ "message": "This account is locked." }`) becomes the form's `error`. Lists of errors,
  RFC 9457 problem details and JSON:API errors are read the same way, matched to each field's
  `name`; [`refusal(body)`](declare-docs:Form.method.refusal) is overridable for a service with its own shape, and
  [`refusedWith(body)`](declare-docs:Form.method.refusedWith) is where the program reacts (clearing a code the service will not accept again).
- **A rule may read other values.** A confirmation field's
  `validate(v: string) -> string { return v == app.password ? "" : "The passwords don't match." }`
  judges again when the password changes. A rule that belongs to no one field is the form's
  own `validate()`.

[`Field`](declare-docs:Field) puts the label beside or above its control and the control's `error` under it
(its arrangement is a [`FieldLayout`](declare-docs:FieldLayout)).
Any control that holds a value is a field: a `Checkbox`, `Switch`, `RadioGroup`, `Combobox`,
`DatePicker`, `Slider` or `Stepper` takes `name`, `required` and `validate` the same way, and a
control of your own does by extending [`ValueControl`](declare-docs:ValueControl).

### A form with no service

A form that saves locally says what sending is: [`send()`](declare-docs:Form.method.send) runs when `submit()` finds
nothing wrong. A check only the program can make — a name already taken — is said on the
field with `refuse(message)`, and holds until the value changes:

```declare
App [ width = 380, height = 220, fill = white, textColor = black,
    names: Dataset { { "rows": [ { "name": "Ada" } ] } },
    draft: string = "",
    add: Form [ x = 20, y = 20, width = 340,
        layout: SimpleLayout [ axis = y, spacing = 12 ],
        Field [ label = "Name", stacked = true,
            entry: TextInput [ width = 240, name = "name", required = "Enter a name.",
                text = { app.draft }, onInput(v: string) { app.draft = v } ] ],
        Button [ label = "Add", primary = true, onClick() { parent.submit() } ],
        send() {
            const taken = (app.names.value?.rows ?? []).some((r) => r.name == app.draft.trim())
            if (taken) { refuse([({ name: "name", message: "That name is taken." })]); return }
            app.names.set("/rows/-", ({ name: app.draft.trim() }))
            app.draft = ""
            }
        ],
    Text [ x = 20, y = 160, text = { (app.names.value?.rows ?? []).map((r) => r.name).join(", ") } ]
    ]
```

Slow work in `send()` sets `pending` itself while it runs.

### Errors shown your own way

The form and its fields hold facts, not a look; `Field` is one way to show them. Each field
has `problem` — what is wrong **now**, whatever has been judged — beside `error`, the default
rule (`problem` once judged). The form has `problems` (every field's, in reading order),
`error`, `submitted` and `valid`. One message in a place of your choosing is
`text = { app.signIn.problems[0]?.message ?? app.signIn.error }`; nothing until a submit and
then everything reads `problem` where `submitted` is true; a summary at the top replicates
over `problems` and overrides [`showProblems()`](declare-docs:Form.method.showProblems) to take the focus there.

### A form in a sheet

A form that opens for each new thing (a sheet that creates a page, a dialog that adds an
entry) is its own view class, and it **exists only while it is open**: `exists` builds it
when the sheet opens and discards it when the sheet closes. Its fields are its own
attributes, so every opening starts from its defaults, with nothing to reset. A sheet is a
boundary for forms: the `Form` goes inside it.

A value the form suggests until the person sets it is a **computed default**: the
address below follows the title, character by character, until the person writes an
address of their own; their write replaces the formula, and from then on it is theirs.
No flag says whether it was edited. The field shows it with `initial`, the editable twin of
`text`, which follows the suggestion until the person types.

```declare
// the page being written: built when the sheet opens and gone when it closes,
// so every opening starts empty, with the address suggested again
class NewPage extends Form [ width = 300,
    title: string = "",
    // the address follows the title until the person writes one
    slug: string = { classroot.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") },
    layout: SimpleLayout [ axis = y, spacing = 10 ],
    TextInput [ width = 300, placeholder = "Title", name = "title", required = "Give the page a title.",
        accessibilityLabel = "Title", onInput(t: string) { classroot.title = t } ],
    TextInput [ width = 300, placeholder = "Address", name = "slug", initial = { classroot.slug },
        accessibilityLabel = "Address", onInput(t: string) { classroot.slug = t } ],
    Button [ label = "Create", primary = true, onClick() { classroot.submit() } ],
    send() { app.create(this) }
    ]

App [ width = 400, height = 300, fill = white, textColor = black,
    pages: Dataset { { "rows": [ { "title": "About", "slug": "about" } ] } },
    adding: boolean = false,
    create(p: NewPage) {
        if ((app.pages.value?.rows ?? []).some((r) => r.slug == p.slug)) {
            p.refuse([({ name: "slug", message: "A page already has that address." })])
            return
            }
        app.pages.set("/rows/-", ({ title: p.title, slug: p.slug }))
        app.adding = false
        },
    col: View [ x = 20, y = 20, layout: SimpleLayout [ axis = y, spacing = 10 ],
        Button [ label = "New page", onClick() { app.adding = true } ],
        Text [ text = { (app.pages.value?.rows ?? []).map((r) => "/" + r.slug).join("  ") } ] ],
    sheet: Sheet [ accessibilityLabel = "New page", shown = { app.adding },
        input(open: boolean) { app.adding = open },
        NewPage [ exists = { app.adding } ] ]
    ]
```

The refusal lands where the person is looking — under the address — and the sheet stays
open; a form that saves to a service does the same with its `source`.

---

_docs/guide/08-controls.md, lines 196–235 (Choosing one of many) — for: form_

### Choosing one of many

Four controls choose one value from a set. Which fits depends on how many choices there
are and how much room they may take:

- [`Segmented`](declare-docs:Segmented) — two to five short choices, all shown at once.
- [`RadioGroup`](declare-docs:RadioGroup) — a handful of choices that need a sentence each,
  shown at once.
- **A pop-up button** — a list of choices that stays closed until pressed, as a `<select>` is
  in HTML. It is a `Button` with a [`menu`](declare-docs:Control.menu) whose rows carry
  `checked`; the row that is checked is the current choice.
- [`Combobox`](declare-docs:Combobox) — a long list the user narrows by typing.

```declare
App [ width = 340, height = 160, theme = { SanFrancisco }, fill = { provided("theme").background },
    sort: string = "name",
    sorts: Menu [
        items = { [ ({ id: "name", label: "Name", checked: app.sort == "name" }),
                    ({ id: "date", label: "Date", checked: app.sort == "date" }),
                    ({ id: "size", label: "Size", checked: app.sort == "size" }) ] },
        picked(id: string) { app.sort = id }
        ],
    Button [ x = 20, y = 20, label = { "Sort by " + app.sort }, menu = { app.sorts } ]
    ]
```

The button shows the current choice and a chevron; pressing it opens the menu under it
with a check beside the current row. [Menus, dialogs and overlays](declare-docs:guide:overlays)
covers menus in full.

You cannot nest rows inside a `Menu` — there is nowhere to put them. That is the
contract, not a gap: a class that owns its arrangement owns how it draws, and can
change either without any use site noticing. A list of cards that *you* position and
style is yours: views, a layout, and data.

> **From React:** this retires the compound-component pattern — no
> `<Select><Option/></Select>`, no walking children, no context for a child to find its
> parent. That machinery lets a container configure children it did not create; here the
> container has the data.

---

_docs/guide/08-controls.md, lines 236–276 (Keyboard focus) — for: form_

## Keyboard focus

Every control is a tab stop. Tab and Shift-Tab move through them in tree order, Space
and Enter activate, and a click moves focus to what was clicked; a click on anything that
can't take focus clears it, and the next Tab starts from where you clicked. A control with members —
a radio group, a segmented control, a list, a menu bar — is one stop: Tab lands on its
chosen member and the arrows move among the rest. A focus ring that
travels to the focused control is added to any app that uses library controls; the
theme can change or turn off how it looks. You declare none of it.

When you need more:

- `focusable = true` makes any view a tab stop; there is no numeric tab index.
- A container reorders or gates what Tab reaches by overriding [`tabOrder()`](declare-docs:View.method.tabOrder) — a closed
  pane returns nothing, so Tab never reaches content the user cannot see.
- [`focusScope`](declare-docs:View.focusScope) says what Tab does at a container's edge:
  `stop` makes it one stop whose arrows move among its members, `region` gives it a cycle of its own that
  Enter enters and F6 leaves (a window, a pane), `modal` keeps Tab inside it (a dialog).
  Some browsers take F6 for themselves, so **Esc then Tab** leaves a region too (Shift-Tab
  goes back), and a program's own command can call
  [`Focus.nextRegion`](declare-docs:Focus.method.nextRegion).
- A member of a `stop` that wants an arrow for itself handles it in `onKeyDown`, and hands
  the keys it doesn't want to `super.onKeyDown(e)`.
- Every view carries [`focused`](declare-docs:View.focused), true while it holds focus — a
  fact a constraint reads (`stroke = { focused ? stroke(2, provided("theme").accent) : null }`).
- [`onFocus`](declare-docs:View.event.focus) and [`onBlur`](declare-docs:View.event.blur)
  run when a view gains and loses focus. `onBlur` is the place to tidy a field once the
  user leaves it, rather than on every keystroke:

  ```declare-fragment
  TextInput [ placeholder = "Tag", text = { app.tag },
      onInput(v: string) { app.tag = v },
      onBlur() { app.tag = app.tag.trim().toLowerCase() } ]
  ```

- [`Focus.focus(view)`](declare-docs:Focus.method.focus) moves focus from code;
  [`Focus.getFocus()`](declare-docs:Focus.method.getFocus) answers which view has it — a
  constraint reading it follows focus — and is what you save before a modal opens and restore
  after. Restore on a later turn, not immediately: a keystroke still in flight should finish
  against the old focus.

---

_docs/guide/14-data.md, lines 244–313 (Where data comes from) — for: service_

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
weather: DataSource [ url = { `/data/weather/${app.zip}.json` }, autoFetch = true ],

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
[`fetch()`](declare-docs:DataSource.method.fetch) — in `onInit`, or on a user action — or set `autoFetch = true` when the address
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

class Quotes extends DataSource [ url = "/api/quotes", autoFetch = true, schema = [ rows[]: Quote ],
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

---

_docs/guide/15-schemas.md, lines 1–134 (the whole chapter) — for: service_

<!-- nav: Typed data: schemas -->
<!-- part: Building -->

# Typed data: schemas

A program relies on the shape of its data. When the server renames `label`, three screens
go blank; when a number arrives as a string, the wrong value surfaces four constraints away
from the fetch that caused it. Most stacks answer with a validation library on one side
and type annotations on the other, glued by hand. Declare answers with one declaration.

> **A schema states the shape you rely on, once. The compiler checks every read it can
> see; the runtime checks every piece of data that crosses into the program.**

## Declaring a shape

```declare-fragment
schema Task [ id: string, title: string, done: boolean, due: number, note?: string ]
```

A schema is a top-level declaration. Squint past the brackets and it is a TypeScript
interface — and it is a real type: `Task` works in any type position, in a declared
attribute (`sel: Task? = null`), a method signature (`advance(t: Task)`), or a field of
another schema. A schema's brackets hold fields only — no defaults, no behavior.

Field types are the ones JSON can say: `string`, `number`, `boolean`, `any`, another
schema's name, a nested `[ … ]` record, or a literal union (`"open" | "closed"`,
`0 | 1 | 2`). `?` marks a field the data may omit or send as null, and `[]` on the field's
name marks an array — `tags[]: string` — the same spelling as the path that reads it,
`:tags[]`. TypeScript's spellings say the same: `tags: string[]`, and `note: string | null`
for a field that may be null. What the grammar leaves out of full TypeScript is deliberate:
a schema states facts that can be checked against the data as it arrives. It is where an API
contract's prose — "`col` is 0, 1, or 2" — becomes a check.

## Attaching a schema

```declare
schema Task [ id: string, title: string, done: boolean, due: number, note?: string ]

App [ width = 360, height = 170, fill = white, textColor = #172530,
    tasks: Dataset [ schema = [ items[]: Task ] ] {
        { "items": [ { "id": "t1", "title": "Post the reading list", "done": false, "due": 3 },
                     { "id": "t2", "title": "Clear the gutters", "done": true, "due": 1 } ] }
        },
    open: number = { (app.tasks.value?.items ?? []).filter((t) => !t.done).length },
    col: View [ x = 20, y = 20, width = 320, datapath = { app.tasks.value },
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        Text [ fontWeight = semibold, text = { app.open + " open" } ],
        View [ datapath = :items[], width = 100%, height = 28,
            layout: SimpleLayout [ axis = x, spacing = 10, align = center ],
            Checkbox [ checked = :done, accessibilityLabel = :title, input(v: boolean) { :done = v } ],
            Text [ text = { :title + " · due in " + :due + " days" } ]
            ]
        ]
    ]
```

A dataset declares the shape of its data with `schema = [ … ]` — here, data whose `items`
is an array of `Task`. From then on:

- **The compiler checks the paths it can see.** `text = :titel` on an attribute, a
  misspelled `key = :…`, or a replication path that does not match the schema is a
  compile error naming the real fields.
- **The typed value is typed everywhere.** `app.tasks.value.items` is `Task[]` to every
  constraint and method, so in the `filter` above `t` is a `Task`, and `t.don` is an error
  that suggests `done`. No `as` cast is needed anywhere.
- **The runtime checks every boundary.** A fetched response that does not match lands in
  `.failed` with the exact path of the mismatch. An embedded body that does not match fails
  the build. And a write is held to the schema: `:done = "yes"` or
  `d.set(["items", 0, "done"], "yes")` is refused at the write, naming the path and what
  was expected. A refusal throws, so route values a person typed through a text field's
  edit session ([Data](declare-docs:guide:data@editing-text-and-forms)), which validates before writing.

Validation is permissive about extra keys: a schema declares what you *rely on*, and keys
it does not mention pass through untouched, because real data is ragged. That has one
consequence to know: a misspelled field name in a *write* (`:donee = true`) is not a type
error, just a new key nothing reads.

Your own state can use the same names. **The `?` says whether it may be empty.**
`sel: Task? = null` may be null until something sets it, so reads say what happens then:
`app.sel?.title ?? ""`. `rec: Task = { :@ }` — written without `?` — is never empty, so
`classroot.rec.title` reads plainly; the checker holds the attribute to that (a `null`
default is refused), and an attribute declared `rec: Task` with no default is one every
use site must supply. The same rule holds for a class (`child: Menu?`) and for `View`. And a record-typed
attribute is live past its identity: a constraint reading `app.sel.title` follows when
that record's title is edited, not only when `sel` points at a different record.

## Optional and partial schemas

Nothing here changes the untyped layer: a dataset with no schema reads, replicates and
writes exactly as before, and plenty of real payloads — mixed feeds, converted trees,
maps keyed by dates — have no regular shape. Declare the fields you rely on and let the
rest flow; `meta: any` is the sanctioned door for an irregular subtree. A shape used once
can be written inline at the dataset — `schema = [ city: string, rows[]: [ id: string ] ]`
— and named the moment a second declaration would repeat it. `schema = Card[]` on a
[`DataSource`](declare-docs:DataSource) declares a response that is a bare array.

**A schema is not a parser.** It checks what arrives; it never converts it. When a
payload needs reshaping — string ids to numbers, a ragged feed filtered to the records you
keep — that is ordinary code in a derived dataset: declare the *wire* shape on the raw
source, project with a method, and declare the *model* shape on the projection. Both ends
are checked.

> **From React:** compare what this replaces — an `interface` for the compiler, a zod or
> io-ts schema for the runtime, glue to keep them agreeing, and `as` casts where they do
> not reach. One declaration serves both sides because it is limited to what both sides
> can enforce.

## Compile-time and runtime checks

| data crosses… | checked by | when | a violation… |
|---|---|---|---|
| a fetched response | runtime | on arrival | lands in `.failed` with the path; `.value` keeps the last good data |
| an embedded `{ json }` body | runtime | at build | fails the build, path named |
| a write — `:field = v`, [`set`](declare-docs:Dataset.method.set), [`insert`](declare-docs:Dataset.method.insert) | runtime | at the write | throws, naming the path and the expectation |
| a text field's `<->` draft | the edit session | at commit | an unreadable draft makes the session invalid; nothing is written |
| a `:path` on an attribute, `key`, or a replication path | compiler | at compile | error with the schema's fields named |
| the typed `.value` chain in any `{ }` or method | compiler | at compile | type error, nearest name suggested |
| a declaration or signature — `sel: Task`, `advance(t: Task)` | compiler | at compile | type error |
| a `:path` *inside* a `{ }` body | nobody yet | — | reads null; the attribute falls back to its default |
| a subtree under a computed cursor — `datapath = { cond ? a : b }` | nobody, by design | — | beyond what a static checker can follow |

The principle behind the table: **the runtime stands where data the program did not
construct comes in; the compiler stands where the program constructs it.** The last two
rows are the honest edge — one a check the compiler does not make, one a horizon no static
checker crosses.

---

**What you can now do:** declare the shape your program relies on, point data at it, and
know which mistakes the compiler catches, which the runtime refuses, and which are still
yours to get right.

[Next: **Large collections** →](declare-docs:guide:collections)

---

_docs/guide/10-touch.md, lines 44–140 (Gesture claims) — for: touch_

## Gesture claims

The same handlers hear mouse and finger, but the browser does not compete for
them equally. A dragged mouse was always yours: the page does nothing with it —
the one thing it would do, select text, Declare has already settled, because
views are painted UI, not a document. A finger is different. Dragging one pans
the page, two pinch to zoom, a double tap zooms to a column — and on the desktop,
the wheel and the trackpad pinch belong to the browser the same way. Those
meanings are good; the physics behind them are the ones your user's thumbs
already know, and Declare's default is to leave every one of them alone.

So when a gesture means something to both sides — the finger that lands on a
draggable card is the same finger that means *scroll* — somebody has to decide
who gets it. You already did, the moment you wrote the handler. There is no
gesture-policy attribute, because the handler is the policy. A claim
takes exactly what the handler needs in order to fire, and not one gesture more:

| you declare | on a touch screen the browser yields | on the desktop it yields |
|---|---|---|
| `onPointerMove` | the single-finger drag over this view | nothing — a mouse drag was always yours |
| `onHold` + the drag handlers | the drag, **from the hold** — a quick swipe still pans | nothing new — the mouse drag was already yours |
| `onDblClick` | the double tap | nothing — a double click was always yours |
| `onWheel` | — | the wheel over this view, trackpad pinch included |
| the `onPinch*` family | the **two-finger** gesture — one finger still pans the page | — |
| the `onTouch*` family | **every finger** | — |
| `claim = x` (or `y`, `both`) | *narrows* a claim to one axis — the page keeps the other | — |

**`onPinchStart` / `onPinch` / `onPinchEnd` is the recognized two-finger gesture** —
declare any of them and two fingers over that subtree are yours, delivered as a
cumulative `e.scale` (the spread now over the spread at start) with the fingers'
midpoint in `e.center`, while a single finger keeps panning the page. You never do
the finger arithmetic; rolling your own over a subtree touch claim is not the
answer. A pinch nearly always drives [`scale`](declare-docs:View.scale) or
[`rotation`](declare-docs:View.rotation) of a sub-surface — `onPinch(e) { zoom = anchor * e.scale }`, latching
`anchor` at `onPinchEnd`. On the desktop the same intent arrives on the wheel
stream as `e.pinch` (trackpad); handle both and every device zooms.

**[`claim`](declare-docs:View.claim) is the knob for "drag horizontally on a page that scrolls vertically."** It
scopes a claim you already have rather than making one: declare the drag handler, then
`claim = x`, and a finger traveling sideways is yours while a finger traveling down
still scrolls the page. A [`DataGrid`](declare-docs:DataGrid) header drags this way, and so does a
[`Carousel`](declare-docs:Carousel): its pages follow the finger sideways and settle on a page
when it lifts, while a vertical drag on them scrolls the page. It cannot help once the
`onTouch*` family has taken **every** finger, because there is nothing left to narrow.

**A long-press or a right-click goes to the nearest view that wants it**, as a pinch does.
Declare `onHold` (or `onContextMenu`) on a message bubble, and a hold anywhere on it —
on its photo, on its time label — reaches the bubble, even where those children take a
tap of their own. Each gesture is answered once, by the one view that declares it, so
nothing bubbles; and once a hold has gone to the bubble, the release does not also tap the
photo.

```declare-fragment
Bubble [ onHold(e: PointerEvent) { app.rowMenu.open(this, e) },
    photo: Image [ onClick() { app.viewPhoto(:photo) } ],    // a tap opens the photo; a hold is the bubble's
    time: Text [ text = :time ]
    ]
```

**A drag goes to the nearest view that claims it, too.** A press on a `Button` that sits
on a carousel's page, or on a map you pan, stays the button's while it stays put: a tap
presses it. Once the finger travels, the drag is the carousel's or the map's, as it would
be a scrolling page's: the button's press ends with `canceled` set and clicks nothing,
and the claimant's drag begins at the point the finger landed, so its `deltaX` counts from
there. A mouse stays the button's while it is inside the button, and is the claimant's once
it leaves. A control that claims a drag of its own, such as a `Slider` on that map, keeps
it, being the nearest; a claim on one axis takes only travel along that axis; and a view
that pairs its drag with `onHold` takes the press at the hold.

`onClick`, `onPointerDown`, and `onHold` alone claim nothing. A tap coexists with every
browser gesture — that is the resolved layer's whole point — and when the browser
does take a gesture back mid-flight, `e.canceled` reports it. Everything a claim
does not name stays with the user: a view that claimed the drag still zooms under
two fingers, a view that claimed the double tap still pans. A `scrolls = y`
view is the opposite move — it *delegates* its panning to the browser — and keeps
pinch-zoom delegated too. Delegation has tiers, and they are measured, not
theoretical: the **page's own scroll** (an app taller than its window — see
[Scrolling](declare-docs:guide:scrolling)) is the only one a browser will
upgrade mid-gesture, a second finger turning the scroll into a pinch-zoom; an
interior pane pans and pinches but never upgrades. When touch matters, primary
content belongs on the page's scroll.

**A claim takes a gesture, not the pointer.** This is the
[drag-and-click rule](declare-docs:guide:pointer-and-keyboard@dragging) from the other side: the
claim decides whether the browser or your app owns the wandering finger; the slop
rule then decides, inside the app, what the gesture meant. Neither arbitration
reaches into the other. Claiming the drag never silences your clicks, and
declaring `onClick` never takes panning from the page.

A claim covers the declaring view and its subtree, and only that. The card
claims the drag over its own few hundred pixels: a finger landing anywhere else
still pans, with no code saying so on either side. And claims run one way — a
child can claim more than its ancestor did, but it cannot hand a claimed gesture
back to the browser — which is why the habit to build is:

> **Claim the least you need, on the smallest view that needs it.**

---

_docs/guide/10-touch.md, lines 141–206 (Pan and zoom about the fingers) — for: touch_

## Pan and zoom about the fingers

A surface a person moves through — a long axis, a large drawing — is one view whose
`draw` reads two numbers: where the window starts, and how much it shows. Every way of
moving it writes those two numbers, and the drawing follows. What makes it feel held is one
rule: **the point under the hand stays under the hand.** A drag moves the window by exactly
the finger's travel; a pinch or a wheel zoom changes the span and moves the start so the
value under the fingers (or the pointer) does not move.

```declare
// a number line from 0 to 10,000: a finger drags and pinches it, a trackpad pinches
// and swipes it, a wheel zooms it — always about the point under the hand
App [ width = 600, height = 200, fill = white, textColor = black,
    start: number = 0,          // the value at the left edge
    span: number = 1000,        // how much of the line the width shows
    clampSpan(s: number) -> number { return Math.max(10, Math.min(10000, s)) },
    clampStart(v: number, s: number) -> number { return Math.max(0, Math.min(10000 - s, v)) },
    // the span becomes s, and the value at x (of a width w) stays at x
    zoomAbout(x: number, w: number, from: number, fromSpan: number, s: number) {
        const at = from + fromSpan * x / w
        const ns = clampSpan(s)
        span = ns
        start = clampStart(at - ns * x / w, ns)
        },
    line: View [ x = 20, y = 20, width = 560, height = 160, fill = #F3F5F8, clip = true,
        accessibilityLabel = "Number line",
        claim = x,            // sideways is the line's; up and down still scroll the page
        grabStart: number = 0,
        grabSpan: number = 0,
        onPointerDown(e: PointerEvent) { grabStart = app.start },
        onPointerMove(e: PointerEvent) { app.start = app.clampStart(grabStart - e.deltaX * app.span / this.width, app.span) },
        onPinchStart(e: PinchEvent) { grabStart = app.start; grabSpan = app.span },
        onPinch(e: PinchEvent) { app.zoomAbout(e.x, this.width, grabStart, grabSpan, grabSpan / e.scale) },
        onWheel(e: WheelEvent) {
            if (e.pinch || Math.abs(e.deltaY) > Math.abs(e.deltaX))
                app.zoomAbout(e.x, this.width, app.start, app.span, app.span * Math.exp(e.deltaY * (e.pinch ? 0.01 : 0.002)))
            else app.start = app.clampStart(app.start + e.deltaX * app.span / this.width, app.span)
            },
        draw(d: DrawContext) {
            const step = Math.pow(10, Math.floor(Math.log10(app.span / 4)))
            d.fillStyle = 0x5A6475
            for (let v = Math.ceil(app.start / step) * step; v <= app.start + app.span; v += step) {
                const x = (v - app.start) / app.span * this.width
                const major = Math.round(v / step) % 10 == 0
                d.fillRect(x, 0, 1, major ? 40 : 16)
                if (major) d.fillText("" + Math.round(v), x + 4, 56)
                }
            }
        ]
    ]
```

- **Drag** reads `deltaX`, the finger's travel since the press, against the start it
  latched at the press — never an accumulation of small moves, which drifts.
- **Pinch** (two fingers on a touch screen) reads `scale` since the pinch began, against
  the start and span it latched then, and keeps the value at `e.x` in place.
- **A trackpad pinch** arrives as a wheel with `e.pinch` true — the same zoom; a wheel turned
  up and down zooms too, and a sideways swipe pans.
- **`claim = x`** takes only sideways movement, so on a phone a finger moving up the line
  still scrolls the page.

A button that jumps the window somewhere ("show all") would rather glide than jump: give
`start` and `span` each a [`Spring`](declare-docs:Spring) whose target the button writes, and have the hand
write the value and its target together, so nothing trails the fingers
([Motion](declare-docs:guide:motion)).

---

_docs/guide/19-accessibility.md, lines 1–169 (the whole chapter) — for: accessibility_

<!-- nav: Accessibility -->
<!-- part: Building -->

# Accessibility — what a screen reader hears, and what you add

A Declare program is usable with a screen reader and with the keyboard alone, and
most of that comes with the classes you already use. Every view that means something
— a button, a checkbox, a menu, a row in a table, a dialog — tells assistive technology
what it is, what it is called, and what state it is in, and keeps telling it as things
change. You add what only you know: the name of a control that shows no words, and what
your own drawn controls are.

This chapter is what you get, what you add, and how you check it.

## What you get

**The library's controls describe themselves.** A `Button` is a button named by its
label; a `Checkbox` says whether it is checked; a `Slider` gives its value and its range
and steps with the arrow keys, as a screen reader's own gestures step it; a `Segmented`
and a `TabBar` are a group of choices with the chosen one marked. The
[Controls](declare-docs:guide:controls) table says what each is to a screen reader.

**Overlays behave.** An open `Dialog` or `Sheet` is announced as a dialog and holds the
focus; what is behind it is out of reach to the keyboard and to a screen reader alike;
when it closes, the focus goes back where it came from. A `Menu` holds the focus while it
is open and names the item the arrow keys are on. A `Toast` is announced when it appears,
without taking the focus. Shift+F10 and the Menu key open a context menu at the focused
view.

**Lists and tables say where you are.** A virtualized list builds only the rows near the
screen, but a screen reader still hears "row 4,012 of 30,500". A `Table` and a `DataGrid`
name the row or cell the keyboard is on, say whether more than one can be selected, and a
`DataGrid`'s column headers are headers that say how they sort.

**Text is text.** A `Text` is read as what it says; a control made of text takes its name
from it, so `Button [ Text [ text = "Send" ] ]` is a button called "Send" with no more
said. Views that are only layout — a row, a column, a padded box — say nothing and cost
nothing.

**What is out of sight is not read.** A view hidden with `visible = false`, or faded to
`opacity = 0`, is passed over. Clipping, a size of 0 and a place off screen are geometry,
not absence: what they hide is still read and still reached by Tab. A view that collapses
to hide what it holds says so with `visible` as well — `visible = { this.height > 0 }` —
and the compiler asks for it where it sees the collapse.

**Focus is one fact.** Tab order is child order. The focus the keyboard sees, the ring
that is drawn, and the focus a screen reader follows are the same focus.

## What you add

**A name where nothing shows one.** An icon-only button, a `Switch`, a `Slider`: nothing
on screen is the name, so give one.

```declare-fragment
Button [ accessibilityLabel = "Close", CloseIcon [ ] ],
Switch [ accessibilityLabel = "Wi-Fi", checked = { app.wifi } ]
```

The compiler warns, with a fix, when a control has no name to give. A field inside a
`Field` is named by the field's label; a field elsewhere takes `accessibilityLabel`. So
does a control whose words are shown apart from it — a checkbox beside the text of its
row has no `label` of its own, and is named with that text:

```declare-fragment
View [ datapath = :items[], layout: SimpleLayout [ axis = x, spacing = 8 ],
    Checkbox [ checked = :done, accessibilityLabel = :title, input(v: boolean) { :done = v } ],
    Text [ text = :title ]
    ]
```

**One control at a time.** A control holds no other control: a checkbox inside a button is
read as part of the button's name, and a screen reader that takes a button as one element
(VoiceOver does) never reaches it. Lay the two side by side in a plain `View`, which says
nothing; the compiler warns where one is written inside another. A list's row is not a
control in this sense: a row that opens into an editor holds its fields and buttons, each
reached on its own, and the row is named by its own words, not theirs.

**A hint, where the name is not enough** — `accessibilityHint` is read after the name and
the value: what pressing will do, or what a field expects. A control with a tooltip uses
the tooltip as its hint.

**What a field holds.** [`purpose`](declare-docs:TextInput.purpose) says it: `email`,
`password`, `cardNumber`, `postalCode` and the rest. The browser's autofill and a password
manager use it to fill the field, a phone to choose its keyboard, and a password is hidden
and never read aloud.

**Pictures that carry meaning.** An `Image` with an `accessibilityLabel` is read; one
without is decoration and is skipped.

**Decoration that is text.** Text that only repeats what the words around it say — a
glyph beside a word that says the same thing — is noise when read aloud. Mark it
[`accessibilityHidden`](declare-docs:View.accessibilityHidden): it is still seen, and a
screen reader skips it and all it holds. Never on a control: the keyboard still reaches it.

**The shape of a page.** A view whose text is a heading says so —
`accessibilityRole = heading, accessibilityLevel = 2` — so a screen reader can move from
heading to heading. The large regions of a screen can be landmarks (`navigation`, `main`,
`search`, `banner`, `complementary`), which a screen reader's user jumps between.

**What changed, when nobody is looking at it.** A view whose changes should be heard —
a status line, a count of results — sets `accessibilityLive = polite`. For a one-off,
with no view to say it from, `Accessibility.announce("Message sent")`.

## Your own controls

A control you draw is pixels to a screen reader until you say what it is. Give it a role,
and the role tells you what else it needs: a `slider` must say its value and range and
know how to step. The compiler checks that it does, by name and type, as it checks the
library's own `Slider` — a missing member is an error that names it.

```declare
class Rating extends Control [ width = 140, height = 28, stars: number = 3,
    accessibilityRole = slider, accessibilityLabel = "Rating",
    accessibilityMin = 0, accessibilityMax = 5, accessibilityValue = { stars },
    accessibilityValueText = { stars + " of 5 stars" },
    accessibilityIncrement() { stars = Math.min(5, stars + 1) },
    accessibilityDecrement() { stars = Math.max(0, stars - 1) },
    draw(d: DrawContext) {
        for (let i = 0; i < 5; i++) {
            d.fillStyle = i < stars ? 0xF2A516 : 0xDCE1E8
            d.beginPath()
            d.arc(14 + i * 28, 14, 10, 0, Math.PI * 2, false)
            d.fill()
            }
        }
    ]
App [ width = 220, height = 80, fill = white,
    Rating [ x = 20, y = 26 ]
    ]
```

A screen reader says "Rating, 3 of 5 stars, slider". Its swipe up sets four stars, and so
does the right arrow: the keyboard and the screen reader call the same method. A control
that is pressed has `press()` already; a `button` role needs nothing more than a name.

The roles are a closed set — `button`, `checkbox`, `slider`, `tab`, `listbox`, `option`,
`dialog`, `heading` and the rest; `declare-help View.accessibilityRole` lists them — and a role
is fixed for a view's lifetime.

## The person's settings

`provided("accessibilitySettings")` holds what the person has asked their system for:
`reduceMotion`, `increaseContrast`, `reduceTransparency`. It is live — it changes when
they change the setting. Nothing in Declare acts on it for you; a program that wants its
motion to stand still, or its theme to raise its contrast, reads it where it decides.

## Checking it

- **The compiler** warns about a role with no name, a control inside a control, content
  clipped to a size of 0 that is still read, and a drawn view that takes the focus and says
  nothing, in the same loop as type errors — in every file of the program, not only the
  one it starts from.
- **`declare-look app.declare --semantics`** prints what a screen reader is given — the
  tree of roles, names, values and states — with no browser and no screen reader. Click,
  type and press keys first to see it in any state.
- **Scripted checks find views by their names**: `find("app.toolbar.Save")` in a
  `declare-verify` script reaches the view a person would call "Save".

## Where it applies

All of this is realized on the DOM renderer, the default: the browser's accessibility tree
is what this chapter describes, and VoiceOver, NVDA and the rest read it. The canvas
renderer draws one opaque element, and does not yet carry the tree; ship the DOM renderer
where accessibility matters, which costs nothing, since the same program runs on both. The
Mac host's text fields are the platform's own; the rest of its tree is still to come.

A program with nothing to say to a screen reader — an arcade game — can leave the layer
out of its build with `accessibility = false` in its `defaultFlags`.

---

_docs/guide/08-controls.md, lines 105–173 (Text fields) — for: accessibility_

### Text fields

`TextInput` follows the same idea with two differences worth knowing. First, it hands
edits back through an **event**, `onInput(v)`, rather than an overridable `input`
method. A field whose text your state owns — so that a reset button or a preset can
change it — looks like this:

```declare
App [ width = 340, height = 120, theme = { SanFrancisco }, fill = { provided("theme").background },
    textColor = { provided("theme").text },
    who: string = "",
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        row: View [
            layout: SimpleLayout [ axis = x, spacing = 8, align = center ],
            TextInput [ width = 200, placeholder = "Your name",
                text = { app.who }, onInput(v: string) { app.who = v } ],
            Button [ label = "Clear", onClick() { app.who = "" } ]
            ],
        Text [ text = { app.who == "" ? "Hello." : "Hello, " + app.who + "." } ]
        ]
    ]
```

Second, a text field editing a record can bind to it both ways with `<->`
(`text <-> :name`). That form runs a *draft*: the typed text is validated before it is
written, and it can wait for Enter or a Save button before it lands.
[Data](declare-docs:guide:data@editing-text-and-forms) covers drafts and forms. `<->` is for text fields only;
the compiler refuses it on a checkbox or a slider and names the value pattern instead.

Every control that holds a value — the ones above, a `Combobox`, a `DatePicker`, and any
of your own that extends [`ValueControl`](declare-docs:ValueControl) — can be **checked like a field**:
`required` (`true` or the message), `validate(v)`, and a `name` a service refuses it by. A
[`Form`](declare-docs:Form) around them judges them all on submit; a [`Field`](declare-docs:Field) around one shows
what is wrong with it under it ([Data](declare-docs:guide:data@a-form)).

Say what a field holds with [`purpose`](declare-docs:TextInput.purpose) —
`email`, `password`, `cardNumber`, `postalCode` and the rest — and the platform helps
with it: the browser's autofill and a password manager recognise the field and offer to
fill it, a phone brings up the keyboard that suits it, and a password is hidden as it is
typed. A "show password" control sets [`concealed`](declare-docs:TextInput.concealed);
the field stays a password to the password manager.

```declare-fragment
TextInput [ purpose = email, accessibilityLabel = "Email" ],
TextInput [ purpose = password, accessibilityLabel = "Password",
    concealed = { !app.showPassword } ]
```

A multi-line field (`multiline = true`) left unsized is as tall as its text. Cap it as you
cap any box — `height = { Math.min(contentHeight, 120) }` — and it grows as the user types,
then scrolls. In a multi-line field Return types a line break; `enterSubmits = true` makes
Return fire `onEnter` and Shift-Return the break, as in a chat composer:

```declare
App [ width = 360, height = 200, theme = { SanFrancisco }, fill = { provided("theme").background },
    textColor = { provided("theme").text }, sent: string = "",
    Text [ x = 20, y = 20, text = { app.sent == "" ? "Return sends; Shift-Return breaks the line" : "sent: " + app.sent } ],
    TextInput [ x = 20, y = 56, width = 300, multiline = true, enterSubmits = true,
        placeholder = "Message", height = { Math.min(contentHeight, 96) },
        onEnter() { app.sent = this.text } ]
    ]
```

Where the user's caret or selection is, a field reports as two read-only facts,
[`selectionStart`](declare-docs:TextInput.selectionStart) and `selectionEnd` — a constraint
can follow them (`canBold = { f.selectionEnd > f.selectionStart }`); to move it, call
[`select()`](declare-docs:TextInput.method.select).

---

_docs/guide/06-layout.md, lines 1–304 (the whole chapter) — for: layout_

<!-- nav: Size, position, layout -->
<!-- part: Building -->

# Size, position and layout

Where CSS gives you several layout systems — flow, flexbox, grid — each with its own
vocabulary and its own negotiations, Declare gives you one idea: **a view's [`layout`](declare-docs:View.layout)
attribute arranges its children**, and a view with no size set takes its size from
what it holds. Numbers and arithmetic are always available underneath, for the
surfaces where you place things yourself.

> **Layouts arrange. Sizes come from content unless you say otherwise. A layout places
> its children, and what it places, the child does not also declare.**

## Layout is an attribute

How a view's children are arranged is a `layout:` member on the view itself — not a
special container type you build the tree around:

```declare
App [ width = 320, height = 170, fill = white, textColor = black,
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        Text [ fontWeight = semibold, text = "A column" ],
        row: View [
            layout: SimpleLayout [ axis = x, spacing = 8, align = center ],
            View [ width = 40, height = 40, cornerRadius = 8, fill = steelblue ],
            View [ width = 40, height = 24, cornerRadius = 8, fill = cadetblue ],
            Text [ text = "a row, centered across" ]
            ],
        Button [ label = "and a button" ]
        ]
    ]
```

[`SimpleLayout`](declare-docs:SimpleLayout) stacks children along an axis, `spacing` apart, in the order they are
written; `align` places them across it — `start`, `center`, `end`, or `baseline` to sit
a row of text and controls on one line. Neither view gives a size: each is as large as
what it holds. Because layout is an attribute and not a type, it can be swapped,
nested, driven by a constraint, or animated.

The library ships these arrangements, all written in Declare (`library/`):

| layout | what it does |
|---|---|
| `SimpleLayout` | stacks children along `axis`, `spacing` apart; `align` places them across it |
| [`WrappingLayout`](declare-docs:WrappingLayout) | flows children onto new rows when the width runs out; [`justify`](declare-docs:WrappingLayout.justify) sets each row along the flow |
| [`ResponsiveLayout`](declare-docs:ResponsiveLayout) | switches arrangement by the view's width, from a list of plans (below) |
| [`Spacer`](declare-docs:Spacer) | not a layout: an empty child that absorbs the leftover space in a row or column (`flexes = true`, below) |

```declare
App [ width = 280, height = 120, fill = white,
    tags: View [ x = 20, y = 20, width = 240,
        layout: WrappingLayout [ spacing = 8, rowSpacing = 8 ],
        View [ width = 70, height = 28, cornerRadius = 14, fill = gainsboro ],
        View [ width = 90, height = 28, cornerRadius = 14, fill = gainsboro ],
        View [ width = 60, height = 28, cornerRadius = 14, fill = gainsboro ],
        View [ width = 100, height = 28, cornerRadius = 14, fill = gainsboro ]
        ]
    ]
```

Narrow the `tags` width and the pills re-wrap. When the arrangement you need is
genuinely your own — masonry, a radial menu, a timeline — you write a layout class with
one method; [Your own views](declare-docs:guide:your-own-views@writing-a-layout) shows how.

> **From CSS:** there is no flexbox, no grid, no document flow and no z-index.
> Children sit at their own `x`/`y` unless a `layout` arranges them; stacking is
> declaration order; "responsive" is a plan or a constraint reading a width, not a
> media query. Your spatial intuitions transfer; the negotiation machinery stays behind.

## What a layout controls

A row places each child's [`x`](declare-docs:View.x); with `align` it places [`y`](declare-docs:View.y) too. What a layout places, the
child must not also set — in any spelling, a number, `center`, or a `{ }`. Declaring it
anyway is a compile error at that line, and the message names what to use instead. The
rule is what keeps an arrangement predictable: one attribute, one owner.

A child that must stand apart says so itself. `ignoreLayout = true` takes it out of the
arrangement: it keeps its own position while its siblings are arranged around it — a
badge pinned to a corner of a stacked card. `ignoreClip = true` lets a child paint and
receive clicks outside a parent that clips — a window's resize border living just
outside the box it resizes.

A child can also ask for the room that is left. [`flexes = true`](declare-docs:View.flexes) hands the
child's size along the flow to the layout: the children that do not flex keep their own
sizes, and the flexing ones share what remains, equally — the height in a column, the
width in a row. Four chips across a row are each `flexes = true`, never
`width = { (parent.width - 24) / 4 }`. Across the flow it is aligned like any other child. It is how a page frame is written:

```declare
App [ width = 320, height = 200, fill = white, textColor = black,
    layout: SimpleLayout [ axis = y ],
    header: View [ width = 100%, height = 36, fill = steelblue,
        Text [ x = 12, y = center, textColor = white, text = "Header" ]
        ],
    body: View [ width = 100%, flexes = true,
        layout: SimpleLayout [ axis = x ],
        list: View [ height = 100%, flexes = true, fill = whitesmoke,
            Text [ x = 12, y = 12, text = "the list takes what is left" ]
            ],
        rail: View [ width = 90, height = 100%, fill = gainsboro ]
        ],
    footer: View [ width = 100%, height = 28, fill = lightsteelblue ]
    ]
```

Resize the window and only `body` and `list` change size; nothing computes a height by
subtracting the others. An empty flexing view is a [`Spacer`](declare-docs:Spacer).

## A view's size, per axis

Each axis — width and height — is one of three things, chosen by what you write:

- **unset** — the view is as large as its content: the text a [`Text`](declare-docs:Text) lays out, the
  bitmap an [`Image`](declare-docs:Image) shows, and the boxes of its visible children;
- **a constant** — `width = 300`;
- **a constraint** — `width = { parent.width - 40 }`, whatever the expression says.

A child sized *from* its parent does not count toward the parent's content size on that
axis, so sizing runs one way per axis: a card given a width hands it down to wrapping
text, and the text's height comes back up to size the card.

Two read-only facts, [`contentWidth`](declare-docs:View.contentWidth) and [`contentHeight`](declare-docs:View.contentHeight), give what the content wants, so
a limit is ordinary arithmetic rather than a special attribute:

```declare
App [ width = 260, height = 150, fill = white, textColor = black,
    box: View [ x = 20, y = 20, width = 200, cornerRadius = 8, fill = whitesmoke, clip = true,
        padding = 10,
        height = { Math.min(contentHeight, 90) },
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        Text [ text = "grows with its content" ],
        Text [ text = "up to 90 pixels" ],
        Text [ text = "then stops" ],
        Text [ text = "and clips the rest" ]
        ]
    ]
```

Change the limit to `scrolls = y` on the box instead, and the extra content scrolls
([Scrolling](declare-docs:guide:scrolling)).

## Padding and Card

An inset is an attribute of the **view**: [`padding`](declare-docs:View.padding), one number for all four sides or
`[top, right, bottom, left]`. A padded view has an inside, and every child is measured
from it — one a layout arranged, one that placed itself, one that opted out of the
layout. A layout does not need to know; it arranges within the room it is given.

Two spellings answer two questions:

- **`width = 100%`** means *the room I am given*: the parent's width less its padding.
  `x = center` and `x = end` resolve against the same room.
- **`width = { parent.width }`** means *the parent's own box*, padding and all. Paired
  with a negative `x` it gives a band that runs edge to edge inside a padded card.

Paint does not move with padding: [`fill`](declare-docs:View.fill), [`stroke`](declare-docs:View.stroke) and [`cornerRadius`](declare-docs:View.cornerRadius) belong to the
view's own box, so a card's background still covers its inset. And an unset size counts
the padding, so a padded view grows and shrinks with what it holds, insets included.

That arrangement is common enough that the library ships it. **[`Card`](declare-docs:Card)** is a view whose
fill, corner radius, hairline edge, padding (16) and stacking layout come from the
theme, so its children are a plain list. **[`Divider`](declare-docs:Divider)** is the rule between them — a
painted view, not a border, spanning the parent's content width:

```declare
App [ width = 320, height = 190, fill = #F4F6FA, textColor = #172530,
    Card [ x = 20, y = 20, width = 280,
        Text [ fontSize = 15, fontWeight = semibold, text = "Storage" ],
        Text [ width = 100%, textColor = slategray,
            text = "Cards size themselves to what they hold, padding included." ],
        Divider [ ],
        Button [ label = "Manage" ]
        ]
    ]
```

Everything is a default: `stroke = null` drops the edge, a `layout:` of your own
replaces the stack (the padding stays; `padding = 0` removes it). A card's direct
children are `Text`, not [`TextLabel`](declare-docs:TextLabel): a `TextLabel` positions itself vertically, and
inside a card the layout owns that position.

## Placing by hand

Position is `x` and `y`, measured from the parent's content origin. Two named literals
cover the common cases: `x = center` and `x = end` (and the same on `y`) center a view in
its parent, or push it flush to the far edge, and follow as sizes change. A scaled or
rotated view is placed by the box it visibly covers, as a layout places it.

Hand placement is the right tool on free-form surfaces — a diagram, a canvas of cards,
an overlay, the cells of a calendar whose geometry is a formula — and in a few small
spots, like the examples in this guide that park one view on a page. For anything
that is a row, a column, a flow or a grid of parts, use a layout: a ladder of hand-set
`y` values is a layout written out by hand, and it breaks the first time a size changes.

## Stacking order

Siblings that overlap paint in the order they are written: **later members draw on
top**. There is no z-index; you restack by reordering, so reading order is paint order.
Floating chrome, such as a toolbar over content or an overlay, is declared last.

## Responsiveness

`ResponsiveLayout` takes a list of **plans**, each saying "from this width up, arrange
the children like this", and keeps the right plan applied as the view's width changes:

```declare
App [ width = 520, height = 120, fill = white, textColor = black, minWidth = 300,
    bar: View [ x = 20, y = 20, width = { app.width - 40 },
        layout: ResponsiveLayout [ plan = { [
            ({ from: 480, flow: "row", share: ({ menu: 30, body: 70 }) }),
            ({ from: 0, flow: "stack", share: ({ menu: 100, body: 100 }) })
            ] } ],
        menu: View [ height = 60, fill = gainsboro ],
        body: View [ height = 60, fill = whitesmoke ]
        ]
    ]
```

Wide, it is a 30/70 row; narrow, a stack of two full-width bands. A plan can flow
children as a `"row"` or a `"stack"`, give named children a percentage of the width
(`share`), and drop one with a share of `0`. `share` is width in **both** flows: in a row
the shares divide the run, in a stack each one sets its band's width on its own — so the
narrow plan names `menu` and `body` at 100. A child a plan does not name keeps the width
it has, which for these two, sized only by the plan, is none. It watches its **own** view's width, not the window's, so plans nest: a
parent decides how much room a child gets, and the child's own layout decides what to do
with it. That nesting, with an ordinary inline child carrying its own `layout:`, is the
answer to most things a single plan cannot say. The reference entry for
`ResponsiveLayout` has the full plan vocabulary.

Smaller adjustments are ordinary constraints: `spacing = { app.width < 480 ? 6 : 12 }`,
or `axis = { app.narrow ? "y" : "x" }` on a `SimpleLayout` when only the direction
changes. In a row whose children keep their natural widths, a `Spacer [ ]` absorbs the
slack: one between two groups pushes them apart, one on each side centers the run.
A configuration that holds at some widths, with attributes that differ and children only
those widths have, is a [`State`](declare-docs:State)
([Program structure](declare-docs:guide:structure@a-view-in-each-of-the-user-s-places)). And often the cleanest answer is a
floor: [`App [ minWidth = 360 ]`](declare-docs:App) holds the design at that width and lets a narrower
window pan, instead of reflowing a layout below the width where it works.

## A layout of your own

When what changes is **where the room goes** — a panel beside the main view on a wide
screen, a strip under it on a narrow one, the main view taking what is left either way —
the arrangement is a layout you write. It is one method, `place()`, that returns a box for
each child, and a box can carry a size as well as a place:

```declare
class SplitLayout extends Layout [
    wide: boolean = true,
    side: number = 160,
    strip: number = 56,
    place() {
        const w = this.contentExtent("width")
        const h = this.contentExtent("height")
        const s = this.side, t = this.strip
        return this.laid().map((c, i) => this.wide
            ? (i == 0 ? ({ x: 0, y: 0, w: w - s, h: h }) : ({ x: w - s, y: 0, w: s, h: h }))
            : (i == 0 ? ({ x: 0, y: 0, w: w, h: h - t }) : ({ x: 0, y: h - t, w: w, h: t })))
        }
    ]

App [ width = 520, height = 200, fill = white, textColor = black,
    frame: View [ width = 100%, height = 100%,
        layout: SplitLayout [ wide = { app.width >= 480 } ],
        main: View [ fill = whitesmoke, Text [ x = center, y = center, text = "main" ] ],
        aside: View [ fill = gainsboro, Text [ x = center, y = center, text = "aside" ] ]
        ]
    ]
```

Neither child states a size or a place: the layout divides the room it has
(`contentExtent`) one way or the other, and follows the room as it changes. Written
without it, each child carries the division itself — `width = { app.wide ? … : … }`,
`y = { app.wide ? … : … }` — and every size that depends on another is worked out again
in each. That arithmetic is a layout done by hand. A layout may also read its children,
total their sizes or find the widest, which a constraint on one child may not; the
whole of what it can do is in
[Your own views](declare-docs:guide:your-own-views@writing-a-layout).

## App size and the host window

An `App` with no size fills its host — the window, or the element it is embedded in —
and resizes with it, which is why responsive code reads `app.width`. Give an app
explicit dimensions only to make a fixed-size widget, as most examples in this guide do.

## Scale and rotation

[`scale`](declare-docs:View.scale), [`rotation`](declare-docs:View.rotation) (degrees, clockwise) and their pivot, [`pivotX`](declare-docs:View.pivotX)/[`pivotY`](declare-docs:View.pivotY), transform a
view and its subtree. Every part of the system agrees on the transformed geometry:
painting, clicking, a layout packing the view, and a parent sizing to its content all
see the same box, so a view at `scale = 0.5` really takes half the room. Per-axis scale,
skew and 3D rotation under a parent's [`perspective`](declare-docs:View.perspective) follow the same rule; the [`View`](declare-docs:View)
reference entry lists them.

---

**What you can now do:** arrange children with layouts, size views from content or by
rule, pad them, respond to width without media queries, and place things by hand where
a surface is genuinely free-form.

[Next: **Scrolling** →](declare-docs:guide:scrolling)

---

_docs/guide/21-motion.md, lines 1–216 (the whole chapter) — for: motion_

<!-- nav: Motion and states -->
<!-- part: Continuity -->

# Motion and states

This part of the guide is not about animation in the sense you are used to. In most stacks, animation is an *effects
layer*: something added after the interface works, to make it feel finished. Declare
treats motion as something else entirely — **the means to a continuous user
experience** — and the reasons to want that have nothing to do with polish:

- **Continuity keeps people oriented.** When a view *becomes* the next view, the
  interface answers "where did that go? where am I now?" before the question forms.
  A hard cut throws away the user's sense of place and makes them rebuild it — real
  cognitive overhead, imposed by the interface, dozens of times a session.
- **Motion carries meaning.** A card that grows into a detail panel *is telling you*
  the panel is that card, seen closer. Done well, motion is information — what came
  from where, what belongs to what — not decoration.
- **Interruptibility respects intent.** A continuous interface stays live mid-motion:
  change your mind halfway and it follows from wherever it is. Nothing to wait out —
  which is the felt difference between software that responds and software that
  performs.
- And it is simply finer craft — the quality you feel in the best native software
  without being able to name it.

This layer of interface quality has been specialist work. Declare builds it from the
same constraints as everything else, and this chapter and
[Animated arrangements](declare-docs:guide:animated-arrangements) show how. None of it is
mandatory: continuity is a capability standing by, not a house style.

> **Motion is a target, not a timeline. A state is a bundle of values you are in or not
> in.**

## Springs

A [`Spring`](declare-docs:Spring) is physics on one attribute, toward a **reactive target**. You declare
where the thing belongs; the spring finds the path and arrives:

```declare
App [ width = 420, height = 120, fill = black,
    on: boolean = false,
    onClick() { on = !on },
    ball: View [ x = 20, y = 40, width = 40, height = 40, cornerRadius = 20, fill = turquoise,
        slide: Spring [ attribute = x, to = { on ? 340 : 20 }, stiffness = 170, damping = 20 ]
        ]
    ]
```

Click — and click again *mid-flight*. The ball eases from wherever it is toward the
new destination, because `to` is a live constraint and a change of target is just…
a new target. There is no tween to cancel, no animation queue, no completion handler
— **interruption requires no code**, which is why everything built this way stays
interruptible by default. That is the continuity argument's third point, delivered
by construction. Springs are the house idiom for anything that should *arrive*
somewhere; the timed sibling, [`Animator`](declare-docs:Animator), is below.

**One spring per motion.** Declare it once, on the thing that moves, and let everything
that must move with it be a constraint on that spring's value: the rows below a growing
panel read the one sprung height, not each carry a spring of their own. A `Spring` inside
a replicated class is one spring *per row* — fine for a dozen, a mistake for a few hundred.

When something should happen only once motion has genuinely landed — a detail panel
revealed after its container finishes opening — that is not a completion handler
either; it is a *fact*, and springs and animators expose two: **`running`** while a
journey is in flight, and **`arrived`**, true only at an uninterrupted destination.
`visible = { open.arrived }` sequences off the landing with no bookkeeping, and a
mid-flight retarget clears it exactly as you would hope. (Arriving is distinct from *the
settle* of [Constraints](declare-docs:guide:constraints@the-settle-when-writes-take-effect): a spring arrives across many
settles.)

**A figure that arrives with its data appears; it does not count up.** A number sprung
toward a value from a `DataSource` starts at its declared value, so when the data lands it
would roll up from zero — a change the reader never lived through. Tell the spring to take
that value outright: [`arrive()`](declare-docs:Spring.method.arrive), called where the data
arrives, makes the next target appear, and every later one animates:

```declare-fragment
stock: number = { app.inventory.value?.count ?? 0 },   // the truth
shown: number = 0,                                     // what the screen reads
counter: Spring [ attribute = shown, to = { app.stock } ],
inventory: DataSource [ url = "/api/inventory", autoFetch = true, onLoad() { app.counter.arrive() } ]
```

A delivery then rolls the count over; opening the app does not.

The same shape opens a *view* on its data: a map that should first show every pin
cannot know where the pins are until they arrive. Derive the fact that says they have
(`ready: boolean = { app.places.loaded }`), track it, and
place the view once when it turns true — `trackChanges = ["ready"]`,
`onChange(e: ChangeEvent) { if (ready) { fitPins() } }`. The flag is derived, not set by a
handler, so it cannot drift from the data; `loaded` stays up through a refresh, so the view
is placed once.

**Under the hand, write the value and its target together.** A surface the user drags — a
strip, a carousel, a map — is also one a button or a released fling moves, and that motion
wants a spring. While the finger drives, set the sprung value *and* the spring's `to` to
the same number: the spring has nowhere to go, so it rests and the surface never lags the
finger. On release, set only the target, and the spring carries the surface there.

```declare
App [ width = 360, height = 140, fill = white,
    offset: number = 0,                   // what the strip shows
    offsetTo: number = 0,                 // where its spring is taking it
    Spring [ attribute = offset, to = { app.offsetTo }, stiffness = 170, damping = 22 ],
    // the hand: the value and its target together, so the spring stays at rest
    handTo(v: number) { offset = v; offsetTo = v },
    // a destination: the spring carries it there
    glideTo(v: number) { offsetTo = Math.max(0, Math.min(720, v)) },
    strip: View [ y = 20, width = 1080, height = 100, x = { -app.offset },
        grab: number = 0,
        onPointerDown(e: PointerEvent) { grab = app.offset },
        onPointerMove(e: PointerEvent) { app.handTo(grab - e.deltaX) },
        onPointerUp(e: PointerUpEvent) { app.glideTo(Math.round(app.offset / 360) * 360) },
        View [ x = 20, width = 320, height = 100, cornerRadius = 12, fill = #2E6FE0 ],
        View [ x = 380, width = 320, height = 100, cornerRadius = 12, fill = #12A594 ],
        View [ x = 740, width = 320, height = 100, cornerRadius = 12, fill = #E0802E ]
        ]
    ]
```

Drag the strip part-way and let go: it follows the pointer exactly, then springs to the
nearest card. Write only `offsetTo` under the hand and the strip trails behind the
finger. Write only `offset` and the target never moves, so a release that aims back at it
changes nothing a sleeping spring watches — the strip stays where the finger left it.

> **From SwiftUI:** `withAnimation` animates the *transaction* — changes made inside
> the block. A `Spring` here is a standing declaration on the attribute itself:
> nothing is wrapped, and any write to the target, from anywhere, moves the ball.
> **From React:** this is the retirement of the motion library — no
> `AnimatePresence`, no variants, no exit choreography. The graph you already have
> is the animation system.

## States

The other primitive is about *configurations*. A [`State`](declare-docs:State) is a set of a view's own
attributes, and children, applied while a condition holds and reverted when it lifts;
[Program structure](declare-docs:guide:structure@a-view-in-each-of-the-user-s-places)
introduces it. Here is one on its own:

```declare
App [ width = 360, height = 240, fill = black, textColor = whitesmoke,
    open: boolean = false,
    onClick() { open = !open },
    card: View [ x = 30, y = 30, width = 300, height = 70, cornerRadius = 10, fill = midnightblue,
        Text [ x = 20, y = 20, fontWeight = bold, text = "Summary" ],
        big: State [ applied = { open }, height = 180, fill = steelblue,
            Text [ x = 20, y = 50, width = 260, textColor = gainsboro, wrap = true,
                text = "height, color, and this whole line swap in together" ]
            ]
        ]
    ]
```

While `open` holds, the height, the fill, and the extra [`Text`](declare-docs:Text) apply *together*;
when it lifts, they all revert, and **a state cannot leak**: there is no exit code to
forget. States compose (two that hold each contribute; on a conflict the later
declaration wins), and a state overrides its own element's attributes only:
`bg.opacity = 0.5` inside one is a compile error. What a state does not do is move. It
snaps; a spring whose target reads the same flag is what makes the change glide (below).

## Animators

Some motion really is clock-shaped: a progress sweep, a replay cursor moving through a day
in ninety seconds, an entrance that runs once. An `Animator` drives one attribute from
`from` to `to` over `duration` milliseconds on a `motion` curve (`linear`,
`quadOut`, `cubicBoth`, `back`, …):

```declare
App [ width = 360, height = 150, fill = white, textColor = #172530,
    t: number = 0,
    sweep: Animator [ attribute = t, from = 0, to = 1, duration = 1500, motion = linear ],
    col: View [ x = 20, y = 20, width = 320,
        layout: SimpleLayout [ axis = y, spacing = 12 ],
        track: View [ width = 100%, height = 10, cornerRadius = 5, fill = #E6EBF1,
            View [ height = 10, cornerRadius = 5, fill = #2E6FE0, width = { parent.width * app.t } ]
            ],
        row: View [
            layout: SimpleLayout [ axis = x, spacing = 10, align = center ],
            Button [ label = "Run", primary = true, onClick() { app.sweep.start() } ],
            Button [ label = { app.sweep.paused ? "Resume" : "Pause" },
                onClick() { app.sweep.paused = !app.sweep.paused } ],
            Text [ text = { app.sweep.arrived ? "done" : app.sweep.running ? Math.round(app.t * 100) + "%" : "ready" } ]
            ]
        ]
    ]
```

`start()` runs it (or constrain `started` to a condition); `paused` freezes and resumes it
without resetting; `running` and `arrived` are the same facts a spring has. Omit `from`
and it starts from wherever the attribute is. [`AnimatorGroup`](declare-docs:AnimatorGroup) runs several animators in
sequence or together, for the rare sequence that has to be choreographed rather than
derived. Choose by the shape of the motion: a value that should *arrive* somewhere, and
may be redirected on the way, is a `Spring`; a value that should *advance* over a known
time is an `Animator`.

## How springs and states relate

Springs and states look like two features. They are one idea seen twice: **a
reversible, interruptible declaration about how things should be.** A state names a
*configuration* that applies and reverts; a spring names a *destination* and makes
the journey continuous. Both are relationships — not commands — which is why neither
can be caught in a broken half-applied middle, and why they compose: a state flips a
value, a spring's target reads it, and the change of configuration *glides*.

What neither does alone is move whole *arrangements* — grids reshaping, one surface
becoming another. That takes the two of them plus one idiom:
[Animated arrangements](declare-docs:guide:animated-arrangements).

---

**What you can now do:** move attributes toward targets with springs and over time with
animators, sequence off a landing with `arrived`, and define states that apply and revert
together without leaking — and you know why an interface built this way is kinder to the
person using it.

[Next: **Time and change events** →](declare-docs:guide:time)

