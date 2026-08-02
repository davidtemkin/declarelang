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
            Row [ datapath = :rows[], materialize = auto ]
            ]
        ]
    ]

```

Fifty thousand records; **eighteen views** in that viewport. Scroll it — the rows you
can see are built, the rest are logical, and nothing in the source says how. Take
`materialize = auto` away and the same program tries to build fifty thousand views.
That one word is this chapter's subject.

Two other things happened here that you did not write, and the next two sections are
about them: the records reconciled by their `id` field, inferred with nothing declared;
and each row's lifetime is tied to its record, not to the scroll position.

## Identity is inferred, not declared

When the data changes, the runtime must decide which instance belongs to which record —
otherwise a sort would rebuild every row and a row's own state would follow the wrong
record. That decision is **identity**, and you almost never declare it.

The ladder, in order:

1. **A record's `id` field**, by convention. Nothing to write.
2. **`key = :field`**, when identity lives under an unconventional name.
3. **Structural matching**, beneath both — for records derived fresh on every
   recompute, where nothing is stable to key on.

So the example above already reconciles correctly: the records carry `id`. Reorder
them and the instances *move* — they are not rebuilt, no lifecycle re-fires, and any
state a row is holding travels with its record. That is the payoff for identity being
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
IssueRow [ datapath = :rows[], materialize = auto ]
```

That is the whole windowing story — the same line the Tracker uses to hold a million
records. `auto` lets the platform's threshold decide; `window` always windows; a bare
number windows above that many records; `all` is the default and fully materializes.

**Be precise about the claim: it is one word, not zero.** The default is full
materialization, so you opt into scale deliberately — which is right, because below the
threshold a fully materialized list scrolls on the compositor with no JS at all, and
windowing would only add work. What you never write is everything *around* the word: no
row heights, no scroll plumbing, no keys, no overscan tuning, no memoization.

This works because the runtime owns the pieces a windowing library never gets: the
scroll box, live scroll position, every instance's geometry, layout itself, focus, and
the reactive graph. A React virtualizer must ask the developer for all of that, which
is why its ergonomics are what they are. The burden is structural to the ownership
boundary, not to the problem.

What it costs you to know: **nothing about the window is observable from the app
language.** `childViews` on a windowed block refuses rather than answering with
whichever rows happen to be built — a scroll-dependent lie. Counts and aggregates come
from the data, which is complete by definition:

```declare-fragment
// the data is always whole; the instances are not the truth
total: number = { (app.d.value.rows).length }
```

**Which to write.** `auto` is the answer for a collection whose size you do not control
— a search result, a feed, a table over a real dataset. Leave it off for a menu, a
palette, a form: a handful of rows materialize faster than any window can be computed.
Reach for `window` or an explicit count only when you have measured something `auto`
got wrong. It is the only knob in this chapter, and one word is the whole of it.

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
the window does not retire it, because the record is still a member. A row that was
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

Sort the table, flip the direction, apply a filter, scroll a selected row out of the
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

One template, a path that matches many, one word when it gets big — and a runtime that
owns enough of the stack to keep the rest invisible.

---

Next: [motion and modes](declare-docs:guide:motion-and-modes) — how a value gets from
one number to another, and how a set of them moves together.
