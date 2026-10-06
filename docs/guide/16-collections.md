<!-- nav: Large collections -->
<!-- part: Building -->

# Large collections

A path that matches many records **replicates** its view, one instance per record
([Data](declare-docs:guide:data@datasets-cursors-and-paths)). This chapter is what happens when "many" stops being
three and becomes a hundred thousand — the point where other stacks ask you to install
something — and what the library's collection controls, [`Table`](declare-docs:Table) and [`DataGrid`](declare-docs:DataGrid), add on
top.

> **A record that matches has an instance. Whether that instance is physically built
> right now is the runtime's business.**

```declare
class Row [ width = 288, height = 24,
    t: Text [ y = 4, width = 260, text = :task ]
    ]

App [ width = 320, height = 240, fill = white,
    d: Dataset [ contents = { { rows: app.make(50000) } } ],
    make(n: number) -> array {
        const out = []
        for (let i = 0; i < n; i++) out.push({ id: i, task: "Task " + i })
        return out
        },
    head: Text [ x = 16, y = 12, width = 288, textColor = 0x666666,
        text = { (d.value.rows).length + " records, ~20 views" } ],
    list: View [ x = 16, y = 36, width = 288, height = 190, scrolls = y,
        inner: View [ width = 288, datapath = { d.value },
            Row [ datapath = :rows[], virtualize = true ]
            ]
        ]
    ]

```

Fifty thousand records; **eighteen views** in that viewport. Scroll it — the rows you
can see are built, the rest are logical, and nothing in the source says how. Take
`virtualize = true` away and the same program tries to build fifty thousand views.
That one word is this chapter's subject.

Two other things happened here that you did not write, and the next two sections are
about them: the records reconciled by their `id` field, inferred with nothing declared;
and each instance's lifetime is tied to its record, not to the scroll position.

This chapter says "row" a lot, but replication has nothing to do with rows: the view a
path replicates can be cards in a gallery, pins on a map, bars in a chart. Identity,
lifecycle and selection below are about *records and instances*, whatever shape they
take. Virtualization is the one exception — it is vertical-list shaped — so there,
"row" is meant literally.

## Record identity

When the data changes, the runtime must decide which instance belongs to which record —
otherwise a sort would rebuild every instance, and an instance's own state would follow
the wrong record. That decision is **identity**, and you almost never declare it.

The ladder, in order:

1. **A record's `id` field**, by convention. Nothing to write.
2. **`key = :field`**, when identity lives under an unconventional name.
3. **Structural matching**, beneath both — for records derived fresh on every
   recompute, where nothing is stable to key on.

So the example above already reconciles correctly: the records carry `id`. Reorder
them and the instances *move* — they are not rebuilt, no lifecycle re-fires, and any
state an instance is holding travels with its record. That is the payoff for identity being
a first-class idea rather than a prop you remember to pass.

Reach for `key` only when the convention does not fit:

```declare-fragment
View [ datapath = :people[], key = :email ]
```

## Row position: rowIndex

An instance reads its record's index in the array through **`rowIndex`**: 0 for the
first record, following the record as others arrive, leave or reorder. It is a fact,
so it is never assigned, and a constraint that reads it re-runs when the place changes.
Stripes, ranks and "3 of 12" come from it; the records carry no position fields.

```declare-fragment
class Row [ height = 24,
    fill = { rowIndex % 2 == 0 ? 0xFFFFFF : 0xF4F4F4 },
    rank: Text [ text = { (rowIndex + 1) + "." } ],
    name: Text [ x = 32, text = :name ]
    ]
```

The index is within the array the row presents: a group's own array for a nested list,
the logical index under `virtualize` (never a position in the window). A view that no replication
made reads `-1`.

## Records of different kinds

A catalogue mixes section headings, items and pictures in one list. They are different things, so each
is its own class, and **`classFor`** picks the class for each record from the record. The
class written on the replicated view is the **base** — what every kind shares, and what
the rest of the line is checked against — and `classFor` names it or a subclass:

```declare
class Entry [ width = 288, height = 28,
    t: Text [ y = 5, width = 288, text = :text ]
    ]
class Item extends Entry [ ]
class Heading extends Entry [ height = 40,
    rule: View [ y = 38, width = 288, height = 1, fill = #D5DCE3 ]
    ]
class Picture extends Entry [ height = 92,
    pic: View [ y = 28, width = 120, height = 60, cornerRadius = 6, fill = #9FB8CC ]
    ]

App [ width = 320, height = 300, fill = white, textColor = #1B2733,
    d: Dataset [ contents = { { items: [
        { id: 1, kind: "heading", text: "Kitchen" },
        { id: 2, kind: "item",    text: "Cast-iron pan" },
        { id: 3, kind: "picture", text: "The pan, seasoned" },
        { id: 4, kind: "item",    text: "Chef's knife" }
        ] } } ],
    list: View [ x = 16, y = 12, width = 288, datapath = { d.value },
        layout: SimpleLayout [ axis = y, spacing = 4 ],
        Entry [ datapath = :items[],
            classFor = { :kind == "heading" ? Heading : :kind == "picture" ? Picture : Item } ]
        ]
    ]
```

Each record builds exactly its own class: an item has no rule and no picture — nothing
hidden, nothing built and never shown. `classFor` reads only the record, so the choice is
the record's own; a record whose `kind` changes is rebuilt as its new class in place, and
under `virtualize` each class keeps its own recycled rows.

**What a row *is* is its class; what state it is *in* is a [`State`](declare-docs:State).**
A heading that is merely bold is an item in a different state, not a different thing — a
state on the one class, whose children exist only while it applies:

```declare-fragment
t: Text [ y = 5, width = 288, text = :text,
    State [ applied = { :pinned }, fontWeight = bold ]
    ]
```

A value that changes while you watch — draft to published, in stock to sold out — is
always a state: the row keeps its instance, and a motion can carry it from one look to the
other. The two nest. A catalogue is a class per kind of entry — heading, item, picture —
and each class has states for "selected", "on sale", and "sold out".

**A part only some rows have exists only on those rows.** A sale badge, a stock warning,
an attachment icon: give that child `exists = { … }`, and it is built while the value is
true and discarded while it is false, in its place in the row's order — three hundred
items with a discount on a dozen build a dozen badges, not three hundred hidden ones. The
value is decided before the child exists, so it reads the row (`:discount`, `classroot`),
never the child's own attributes; and anything that reads the child by name says what
happens when it is not there (`classroot.badge?.height ?? 0`):

```declare-fragment
badge: SaleBadge [ exists = { (:discount ?? 0) > 0 }, discount = { :discount } ]
```

**What sits between records belongs to the row after it.** A section heading over the
first item of each aisle, a divider where the price band changes: the row decides from its
neighbour whether it carries one. The list provides its records, the row reads the one
before it by [`rowIndex`](declare-docs:View.rowIndex), and the heading is a part that
exists only on the rows that start a section:

```declare
class Item [ width = 100%,
    rows: array = { provided("rows") },
    starts: boolean = { rowIndex == 0 || rows[rowIndex - 1]?.aisle != :aisle },
    layout: SimpleLayout [ axis = y ],
    head: Text [ exists = { classroot.starts }, fontWeight = bold, text = :aisle ],
    name: Text [ text = :name ]
    ]

App [ width = 260, height = 220, fill = white, textColor = black,
    shop: Dataset { { "items": [
        { "id": 1, "aisle": "Bakery", "name": "Bread" },
        { "id": 2, "aisle": "Bakery", "name": "Rolls" },
        { "id": 3, "aisle": "Dairy", "name": "Milk" },
        { "id": 4, "aisle": "Dairy", "name": "Butter" },
        { "id": 5, "aisle": "Produce", "name": "Apples" } ] } },
    list: View [ x = 20, y = 16, width = 220, datapath = { app.shop.value },
        rows: array = { :items ?? [] },
        layout: SimpleLayout [ axis = y, spacing = 4 ],
        Item [ datapath = :items[], virtualize = true ]
        ]
    ]
```

`list` provides its records as `rows`; each `Item` reads the one before it and builds its
heading only where the aisle changes.

The records stay the records: no derived list of headings and items to keep in step, and
a record that moves to another aisle re-decides its own heading and its neighbour's.

**Kinds that share a frame put their content into it.** When every kind has the same frame
around it — the title above, the actions below — the base class draws the frame and names
where the kind's own views go, `defaultplacement = body`; each subclass's children then go
into `body`, laid out in the frame's order
([Your own views](declare-docs:guide:your-own-views@a-frame-around-content)).

## Virtualization

Here is the part that is a library in every other stack. A large collection should
**materialize a window** — build the rows near the viewport, leave the rest logical
until they are needed. In React that is TanStack Virtual or react-window, plus row-height
measurement, plus a scroll container you wire, plus keys, plus memoization discipline. It
is routinely a fifth of an app's code and the source of its worst bugs.

Here it is one word on the row template:

```declare-fragment
IssueRow [ datapath = :rows[], virtualize = true ]
```

That is the whole windowing story — the same line the Tracker uses to hold a million
records. It is a boolean, off by default, and like any other boolean it takes a
constraint: `virtualize = { app.rows.length > 500 }` starts a collection fully
materialized and virtualizes it when it grows, engaging and disengaging as the answer
changes.

It is off by default, so you turn it on deliberately. What you never write is everything
*around* the word: no row heights, no scroll plumbing, no keys, no overscan tuning, no
memoization.

**What the reader sees.** Scrolling stays the browser's own: rows that have been built
stay where they are and move with the page, and rows ahead of the viewport are built
and measured before they come into view. A row whose real height differs from the
estimate changes the list only where the reader can't see it, so content never jumps
under a finger, a wheel, or a held scrollbar. A held scrollbar keeps its range while
it is held, and its two ends are the first and last record exactly.

This works because the runtime owns the pieces a windowing library never gets: the
scroll box, live scroll position, every instance's geometry, layout itself, focus, and
the reactive graph. A React virtualizer must ask the developer for all of that, which
is why its ergonomics are what they are. The burden is structural to the ownership
boundary, not to the problem.

**The window is legible, not hidden.** [`childViews`](declare-docs:View.childViews) on a virtualized block answers with
the instances that exist — a subset, changing as you scroll — and [`virtualized`](declare-docs:View.virtualized) tells you
that is what you are looking at. Note where each one lives: you *declare* [`virtualize`](declare-docs:View.virtualize) on
the replicated child, beside its [`datapath`](declare-docs:Node.datapath), but you *read* `virtualized` on the container
holding the instances — the block belongs to the parent, so the parent is what answers. Nothing is abstracted away; you turned virtualization on,
so you can see it.

What you should not do is mistake the instances for the collection. Counts and aggregates
come from the data, which is complete by definition:

```declare-fragment
total:  number  = { (app.d.value.rows).length },   // the collection
onNow:  number  = { app.list.childViews.length },  // what is built right now
subset: boolean = { app.list.virtualized }
```

**What virtualization needs, and what it does when it cannot get it.** This is the one
part of the chapter that really is row-shaped. A block virtualizes only when it has a
scrolling ancestor (`scrolls = y`, or `both`) and — if its parent runs a layout — that
layout stacks on `y`. A wrapping gallery of cards, a horizontal strip, a scatter of pins:
none of those virtualize. They **fully materialize**, deliberately, because the
alternative is degrading semantics to fit an arrangement the runtime cannot predict. The
same is true of slice replication (`:rows[2:8][]`), which materializes its selection
whole. Nothing fails silently — the fallback and its reason are inspectable, and the
program stays correct, just unwindowed. Replication itself carries none of these
constraints; only the windowing of it does.

**When to turn it on.** Any collection whose size you do not control — a search result,
a feed, a table over a real dataset. Leave it off for a menu, a palette, a form, where
every record is going to be built anyway. Virtualizing a small collection is not harmful,
just unnecessary; the cost of not virtualizing a large one is a stall at construction.

## Row lifecycle

A replicated instance has a lifetime tied to its record's **membership**, not to any
scroll position. `onInit` fires once when a record joins; `onRetire` fires once when it
leaves — children first, before unlinking, so a handler still sees live state.

```declare-fragment
View [ datapath = :rows[],
    onInit() { app.seen = app.seen + 1 },
    onRetire() { app.seen = app.seen - 1 }
    ]
```

The pairing is exact and it is *presence in the data*, not materialization: scrolling a row out
of the window does not retire it, because the record is still there. An instance that was
never built does not fire either hook until it is — lazily, the symmetric of lazy init.
This is the law again, in lifecycle form: presence in the data is what is real.

## Selection

A collection control's selection holds **items** — the records themselves, not the
views showing them. Which is why selection survives everything that rearranges the
presentation.

```declare-fragment
Table [ width = 300, height = 400, datapath = { app.d.value },
    selects = "multi", input(sel: object) { app.chosen = sel },
    TableRow [ datapath = :rows[] ]
    ]
```

Note the shape: the table *owns* `selected` and [`selection`](declare-docs:Table.selection), and hands them out through
`input` — the derive-down/deliver-up pair from
[Controls](declare-docs:guide:controls@the-value-pattern). You do not write into its attributes.

Sort the table, flip the direction, apply a filter, scroll a selected record out of the
window — the selection is unchanged, because it was never a set of views. A selected
record that a filter has hidden is still selected, and any count you show the user must
be the full-dataset count, not the visible one.

Three facts travel together in a collection: the **selection**, the **anchor** a range
extends from, and `active`, the keyboard position. [`selects`](declare-docs:Table.selects) declares the mode —
`none`, `single` (the default), or `multi`.

## DataGrid columns

`Table` gives a collection selection and keyboard travel. `DataGrid` adds the other half a
real data table needs — headers that sort, columns you can drag to reorder and resize —
and it does it by making **columns members of the tree** rather than a configuration
object:

```declare
App [ width = 460, height = 240, fill = white, textColor = black,
    d: Dataset [ contents = { { rows: app.make(2000) } } ],
    make(n: number) -> array {
        const out = []
        const st = ["open", "done", "held"]
        for (let i = 0; i < n; i++) out.push({ id: i, title: "Issue " + i, state: st[i % 3] })
        return out
        },
    chosen: number = 0,
    head: Text [ x = 20, y = 12, textColor = 0x666666,
        text = { app.chosen + " selected of " + (d.value.rows).length } ],
    g: DataGrid [ x = 20, y = 66, width = 420, height = 150, datapath = { d.value },
        selects = "multi",
        input(sel: object) { app.chosen = (sel ?? []).length },
        Column [ title = "ID",    field = "id",    width = 60 ],
        Column [ title = "Title", field = "title", width = 220 ],
        Column [ title = "State", field = "state", width = 120 ],
        GridRow [ datapath = :rows[], virtualize = true ]
        ]
    ]
```

Two thousand records, three column declarations, one bare [`GridRow`](declare-docs:GridRow). **Drag a header
sideways to reorder; drag the divider between two headers to resize; click a header to
sort.** Then select a range and scroll — selection holds, because it is records.

The row template is empty on purpose: **cells generate from the column model**, each
showing `record[field]`. A column's `kind` chooses what a cell *is* — `"text"`, `"edit"`
(a field that commits into the record as you type), `"check"`, or `"select"` — so an
editable grid is a word per column, not a cell renderer per column.

Two things here are worth carrying to your own work.

**Sorting names a derivation; it does not reorder anything.** Clicking a header delivers
through [`sortInput(on, dir)`](declare-docs:DataGrid.method.sortInput), whose default writes [`sortOn`](declare-docs:DataGrid.sortOn)/[`sortDir`](declare-docs:DataGrid.sortDir) and stops. The grid
displays the order its collection already has, and *you* derive the sorted dataset —
overriding `sortInput` when the sort belongs to a server query — which is why sorting a
virtualized million rows is a data operation, not a view operation, and why a server-side
sort needs no special case.

**Order and widths are the value pattern again.** [`order`](declare-docs:DataGrid.order) and [`widths`](declare-docs:DataGrid.widths) are the grid's
state, delivered through [`arrangeInput`](declare-docs:DataGrid.method.arrangeInput) and [`resizeInput`](declare-docs:DataGrid.method.resizeInput) — override those and you own the
column layout, which is how you persist a user's arrangement. Widths are plain values;
nothing measures cells. And a width of `0` **drops** a column, so a responsive table is a
constraint: `widths = { app.narrow ? ({ notes: 0 }) : null }` — priority, not squish.

## What the runtime handles

Worth naming, because the absence is the point. No list view to install. No `key` prop
discipline. No virtualizer to install, no row-height measurement, no scroll listener, no
overscan tuning. No memoization to stop siblings re-rendering. No selection state
machine, and no bug where sorting scrambles what was selected.

One template — of any shape — a path that matches many, one word when it gets big, and a
runtime that owns enough of the stack to keep the rest invisible.

---

**What you can now do:** show collections of any size with one word, rely on identity
and lifecycle that follow records rather than scroll position, keep selections that
survive sorting and filtering, and give a data table sortable, resizable columns.

[Next: **Your own views and drawing** →](declare-docs:guide:your-own-views)
