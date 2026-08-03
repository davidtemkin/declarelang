<!-- nav: Scale -->
<!-- part: Building -->

# Virtualization is one word

The previous chapter taught the rule: a path that matches many records **replicates**
its node, one instance per record. This chapter is what happens when "many" stops being
three and starts being a hundred thousand — the point where every other stack asks you
to install something.

> **A record that matches has an instance. Whether that instance is physically built
> right now is the runtime's business.**

```declare
class Row extends View [ width = 288, height = 24,
    t: Text [ y = 4, width = 260, text = :task ]
    ]

App [ width = 320, height = 240, fill = white,
    d: Dataset [ contents = { ({ rows: app.make(50000) }) } ],
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

**A note on vocabulary, because this chapter says "row" a lot.** Replication has nothing
to do with rows: the node a path replicates is any View — cards in a gallery, pins on a
map, bars in a chart, avatars in a stack. Identity, lifecycle and selection below are
about *records and instances*, whatever shape they take. Virtualization is the one
exception — it is vertical-list shaped today, for reasons its own section gives — so
there, "row" is meant literally.

## Identity is inferred, not declared

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

## Virtualization is one word

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

This works because the runtime owns the pieces a windowing library never gets: the
scroll box, live scroll position, every instance's geometry, layout itself, focus, and
the reactive graph. A React virtualizer must ask the developer for all of that, which
is why its ergonomics are what they are. The burden is structural to the ownership
boundary, not to the problem.

**The window is legible, not hidden.** `childViews` on a virtualized block answers with
the instances that exist — a subset, changing as you scroll — and `virtualized` tells you
that is what you are looking at. Note where each one lives: you *declare* `virtualize` on
the replicated child, beside its `datapath`, but you *read* `virtualized` on the container
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
none of those virtualize today. They **fully materialize**, deliberately, because the
alternative is degrading semantics to fit an arrangement the runtime cannot predict. The
same is true of slice replication (`:rows[2:8][]`), which materializes its selection
whole. Nothing fails silently — the fallback and its reason are inspectable, and the
program stays correct, just unwindowed. Replication itself carries none of these
constraints; only the windowing of it does.

**When to turn it on.** Any collection whose size you do not control — a search result,
a feed, a table over a real dataset. Leave it off for a menu, a palette, a form, where
every record is going to be built anyway. Virtualizing a small collection is not harmful,
just unnecessary; the cost of not virtualizing a large one is a stall at construction.

## Arriving and departing

A replicated instance has a lifetime tied to its record's **membership**, not to any
scroll position. `onInit` fires once when a record joins; `onRetire` fires once when it
leaves — children first, before unlinking, so a handler still sees live state.

```declare-fragment
View [ datapath = :rows[],
    onInit() { app.seen = app.seen + 1 },
    onRetire() { app.seen = app.seen - 1 }
    ]
```

The pairing is exact and it is *membership*, not materialization: scrolling a row out of
the window does not retire it, because the record is still a member. An instance that was
never built does not fire either hook until it is — lazily, the symmetric of lazy init.
This is the law again, in lifecycle form: presence in the data is what is real.

## Selection means records

A collection control's selection holds **members** — the records themselves, not the
views showing them. Which is why selection survives everything that rearranges the
presentation.

```declare-fragment
Table [ width = 300, height = 400, datapath = { app.d.value },
    selects = "multi", input(sel: object) { app.chosen = sel },
    TableRow [ datapath = :rows[] ]
    ]
```

Note the shape: the table *owns* `selected` and `selection`, and hands them out through
`input` — the derive-down/deliver-up pair from
[chapter 7](declare-docs:guide:interaction). You do not write into its slots.

Sort the table, flip the direction, apply a filter, scroll a selected record out of the
window — the selection is unchanged, because it was never a set of views. A selected
record that a filter has hidden is still selected, and any count you show the user must
be the full-dataset count, not the visible one.

Three facts travel together in a collection: the **selection**, the **anchor** a range
extends from, and `active`, the keyboard position. `selects` declares the mode —
`none`, `single` (the default), or `multi`.

## What you did not write

Worth naming, because the absence is the point. No list component. No `key` prop
discipline. No virtualizer to install, no row-height measurement, no scroll listener, no
overscan tuning. No memoization to stop siblings re-rendering. No selection state
machine, and no bug where sorting scrambles what was selected.

One template — of any shape — a path that matches many, one word when it gets big, and a
runtime that owns enough of the stack to keep the rest invisible.

---

Next: [motion and modes](declare-docs:guide:motion-and-modes) — how a value gets from
one number to another, and how a set of them moves together.
