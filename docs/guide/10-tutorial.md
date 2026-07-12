# Tutorial — build one small app

The fastest way to feel how Declare thinks is to grow one small app until it has
touched every fundamental idea. We will build a **stats panel** — a titled column
of labelled bars, each bound to data, that light on hover, expand on click, and
animate their length into place. It ends at about forty lines.

Each step adds exactly **one** new idea and links to the Fundamentals chapter that
covers it in depth. Paste each version into the playground and run it; you will see
the app change under your hands, and the change is always small. Read the prose for
*why*, not just *what* — the point is the mental model, not the pixels.

---

## Step 1 — the empty App

```declare
App [ fill = #0B141B, textColor = whitesmoke,
    fontFamily = ["system-ui", "sans-serif"], fontSize = 15,
    ]
```

An `App` is the whole program — one singleton whose instance *is* the visible tree.
Notice there is no `width`/`height`: an App **fills its host** by default, resizing
with the window, so a size line is something you add only for a fixed widget
([Sizing](32-sizing.md)). The text style set here — family, size, colour — is
**prevailing**: it flows down to every descendant until one overrides it, so we set
it once at the root and never repeat it ([Prevailing](22-prevailing.md)).

## Step 2 — reactive state and a constraint

```declare
App [ fill = #0B141B, textColor = whitesmoke,
    total: number = 234,
    Text [ x = 24, y = 24, fontSize = 28, fontWeight = bold,
           text = { `${total} events` } ],       // recomputes whenever total changes
    ]
```

Two new things, and they are the whole language in miniature. `total: number = 234`
**declares** a reactive attribute — state with a name, a type, and a default. And
`text = { … }` is a **constraint**: a live TypeScript expression the runtime keeps
true. Reading `total` inside the braces *is* the subscription — no dependency
array, no `useEffect`. Assign `total` anywhere and the text re-derives itself; you
will never write the update ([Constraints](21-constraints.md)).

## Step 3 — extract a reusable component

We are going to show several bars, so the bar becomes a **class**. In Declare a
component *is* a class, and defining one is everyday work, not architecture: name
the type, `extends` a base, and add members ([Composition](20-composition.md)).

```declare
class StatBar extends View [ width = 240, height = 22,
    label: string = "", value: number = 0,          // declared attributes; value is 0..100
    caption: Text [ x = 0, y = 3, width = 90, text = { classroot.label } ],
    track: View [ x = 96, width = 144, height = 22, cornerRadius = 4, fill = #101E28,
        bar: View [ height = 22, cornerRadius = 4, fill = #4C8DFF,
                    width = { classroot.value / 100 * 144 } ],   // length tracks value
        ],
    ]
```

`StatBar` declares two attributes of its own and lays out a caption beside a track
whose inner `bar` widens with `value`. The `classroot` in those constraints is how
a child binding reaches the component instance it belongs to — read it as "this
`StatBar`" for now; [Scope nouns](27-scope-nouns.md) has the full story. Because
your class *is* a `View` plus these members, `StatBar [ … ]` is now a leaf you can
drop anywhere a view fits.

## Step 4 — lay several out

```declare
App [ fill = #0B141B, textColor = whitesmoke,
    panel: View [ x = 24, y = 24,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        StatBar [ label = "reactive", value = 92 ],
        StatBar [ label = "compiled", value = 78 ],
        StatBar [ label = "small",    value = 64 ],
        ],
    ]
```

Three bars stacked. The stacking is not baked into a container *type* (no `VStack`,
no `<column>`) — it is a **`layout:` attribute** you set on a generic `View`, which
means you could later swap it, constrain its `spacing`, or animate it
([Layout](25-layout.md)). Without that line the bars would sit at their own `y`;
`SimpleLayout` places them for you.

## Step 5 — drive it from data

Three hand-written bars want to be data. Replace them with **one** bar bound to a
`Dataset` — the shape written once, the data deciding how many
([Data](26-data.md)):

```declare
App [ fill = #0B141B, textColor = whitesmoke,
    facts: Dataset { { "rows": [
        { "label": "reactive", "n": 92 },
        { "label": "compiled", "n": 78 },
        { "label": "small",    "n": 64 } ] } },
    panel: View [ x = 24, y = 24, datapath = { parent.facts.value },
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        StatBar [ datapath = :rows[], label = :label, value = :n ],   // one per row
        ],
    ]
```

`datapath` sets a **cursor** into the data; the `:rows[]` on the `StatBar`
**replicates** it — one instance per row — and inside each, `:label` and `:n` read
that row's fields. There is no loop, no list component, and no keys: add a row to
the dataset and a bar appears; remove one and its bar leaves. Replication is the
*artifact* of a path matching many records, not an instruction you wrote.

## Step 6 — interaction and a hover state

Now make a bar respond. Two `on…` **handlers** flip a `hovered` boolean, and a
**`State`** — a named, reversible bundle of overrides — brightens the row while it
holds ([Events](23-events.md), [States](24-states.md)):

```declare
class StatBar extends View [ width = 240, height = 22,
    label: string = "", value: number = 0,
    hovered: boolean = false,
    onMouseOver() { hovered = true },
    onMouseOut()  { hovered = false },
    caption: Text [ … ],  track: View [ … ],       // unchanged
    lit: State [ applied = { hovered }, fill = #16273A ],   // tints the row while hovered
    ]
```

The handler bodies are ordinary code, and their assignments are reactive setters —
flipping `hovered` updates everything that reads it, here the state's `applied`
gate. When `hovered` goes false the override **reverts** on its own; you wrote no
exit code, and the "forgot to un-highlight it" bug is unrepresentable.

## Step 7 — an expand toggle

A state can do something a ternary cannot: bring a whole **subtree** in and out. Add
an `onClick` that toggles `open`, and a second state — gated on `open` — that both
grows the row *and* adds a detail line that exists only while expanded:

```declare
    onClick() { open = !open },                    // toggles a new `open: boolean`
    …
    opened: State [ applied = { open }, height = 40,
        note: Text [ x = 0, y = 24, fontSize = 12, textColor = #8A9BA6,
                     text = { `${classroot.value}% and climbing` } ],
        ],
```

The `note` is instantiated fresh when `open` turns true and destroyed when it turns
false, and because the layout reflows around its presence, the panel below makes
room. This is the *structural* half of states — presence, not just values — and
it reverts as cleanly as the hover tint.

## Step 8 — motion

Finally, give the bar physics. Instead of the length *snapping* to `value`, let a
**`Spring`** ease it there. Replace the bar's `width` constraint with a spring that
follows the same target ([Animation](30-animation.md)):

```declare
    bar: View [ height = 22, cornerRadius = 4, fill = #4C8DFF, width = 0,
        grow: Spring [ attribute = width, to = { classroot.value / 100 * 144 },
                       stiffness = 190, damping = 20 ] ],
```

A `Spring` is a *standing relationship*, not a scheduled tween: its `to` is a live
constraint, so the bar always eases toward wherever `value` points, waking when the
target moves and sleeping at rest. You declared *where* the bar belongs; the spring
found the path there.

## The whole thing

Assembled, every idea from Part II and one from Part III fits in about forty lines —
a class, some state, constraints, a dataset with replication, two states, and a
spring, and not one line of update logic:

```declare
class StatBar extends View [ width = 240, height = 22,
    label: string = "", value: number = 0,
    hovered: boolean = false, open: boolean = false,
    onMouseOver() { hovered = true },
    onMouseOut()  { hovered = false },
    onClick()     { open = !open },

    caption: Text [ x = 0, y = 3, width = 90, text = { classroot.label } ],
    track: View [ x = 96, width = 144, height = 22, cornerRadius = 4, fill = #101E28,
        bar: View [ height = 22, cornerRadius = 4, fill = #4C8DFF, width = 0,
            grow: Spring [ attribute = width, to = { classroot.value / 100 * 144 },
                           stiffness = 190, damping = 20 ] ],
        ],

    lit:    State [ applied = { hovered }, fill = #16273A ],
    opened: State [ applied = { open }, height = 40,
        note: Text [ x = 0, y = 24, fontSize = 12, textColor = #8A9BA6,
                     text = { `${classroot.value}% and climbing` } ],
        ],
    ]

App [ fill = #0B141B, textColor = whitesmoke,
      fontFamily = ["system-ui", "sans-serif"], fontSize = 15,
    facts: Dataset { { "rows": [
        { "label": "reactive", "n": 92 },
        { "label": "compiled", "n": 78 },
        { "label": "small",    "n": 64 } ] } },
    panel: View [ x = 24, y = 24, datapath = { parent.facts.value },
        layout: SimpleLayout [ axis = y, spacing = 12 ],
        StatBar [ datapath = :rows[], label = :label, value = :n ],
        ],
    ]
```

---

**Where to go next.** You have now touched every Fundamental idea — composition,
constraints, prevailing style, events, states, layout, data, and scope nouns. Read
[Part II](20-composition.md) in order for the depth behind each, then Part III for
[animation](30-animation.md), [text](31-text-markdown.md), [sizing](32-sizing.md),
[fonts](33-fonts.md), and [input](34-input-focus.md).
