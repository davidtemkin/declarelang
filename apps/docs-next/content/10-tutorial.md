# Tutorial: build one small app

The fastest way to feel how Declare thinks is to grow one small app until it has
touched every fundamental idea. We will build **Signals** — a little dashboard: a
slider that sets a goal, a row of metric cards driven from data, each card lighting
on hover, expanding on click, and springing its bar into place. It ends at about
fifty lines, and no line of it is update logic.

Each step adds exactly **one** idea and links to the chapter that covers it in depth.
Save the program to `my-apps/signals.declare` and browse to its URL (if you have not
started the server yet, do the [getting-started](declare-docs:operational:getting-started)
page first); then keep the tab open and reload after each step. That rhythm is the
whole method:

> **Edit, reload, read the error — the compiler is the teammate.**

## Step 1 — one file, running

```declare
App [ fill = white, textColor = #1A1A1E,
    fontFamily = ["system-ui", "sans-serif"], fontSize = 15,
    ]
```

An `App` is the whole program — one root whose instance *is* the visible tree.
There is no `width`/`height`: an app **fills its host** and resizes with the window,
so you add a size only for a fixed widget ([Space](declare-docs:guide:space)). The
text style set here — family, size, color — is **prevailing**: it flows down to every
descendant until one overrides it, so you set it once at the root and never repeat it
([Appearance](declare-docs:guide:appearance)).

## Step 2 — structure with views

```declare
App [ fill = white, textColor = #1A1A1E,
    fontFamily = ["system-ui", "sans-serif"], fontSize = 15,

    Text [ x = 24, y = 20, fontSize = 22, fontWeight = bold, text = "Signals" ],

    panel: View [ x = 24, y = 96, width = 280, height = 180 ],
    ]
```

You build structure by nesting components in brackets. A `Text` for the title and a
named `View` to hold what's coming — the bracket nesting *is* the tree
([The tree](declare-docs:guide:tree)). Naming the view `panel:` lets other members
refer to it later.

## Step 3 — two controls, zero configuration

```declare
App [ fill = white, textColor = #1A1A1E,
    fontFamily = ["system-ui", "sans-serif"], fontSize = 15,

    Text [ x = 24, y = 20, fontSize = 22, fontWeight = bold, text = "Signals" ],

    controls: View [ x = 24, y = 56,
        layout: SimpleLayout [ axis = y, spacing = 14 ],
        Slider [ min = 0, max = 100 ],
        Button [ label = "Reset", primary = true ],
        ],
    ]
```

A `Slider` and a `Button`, straight from the [standard library](declare-docs:guide:controls)
— no import, and already styled by the prevailing theme. Drag the slider; press the
button with the mouse or the keyboard. You wrote no widget code and no CSS; a control
is just a component you drop in like any other. The `layout:` line stacks them — layout
is an *attribute* you set on a generic view, not a container type
([Space](declare-docs:guide:space)).

## Step 4 — state, and constraints that follow it

```declare
App [ fill = white, textColor = #1A1A1E,
    fontFamily = ["system-ui", "sans-serif"], fontSize = 15,

    goal: number = 50,

    Text [ x = 24, y = 20, fontSize = 22, fontWeight = bold, text = "Signals" ],
    Text [ x = 24, y = 52, textColor = slategray, text = { `Goal: ${goal}%` } ],

    controls: View [ x = 24, y = 84,
        layout: SimpleLayout [ axis = y, spacing = 14 ],
        Slider [ min = 0, max = 100, value = { app.goal },
            input(v) { app.goal = v },
            ],
        Button [ label = "Reset", primary = true,
            onClick() { app.goal = 50 },
            ],
        ],
    ]
```

`goal: number = 50` declares a piece of reactive state. The second `Text` reads it
inside `{ }` — a **constraint** — so the label re-derives itself whenever `goal`
changes ([Constraints](declare-docs:guide:constraints)). The slider is wired to that
same state with the value pattern every control shares: **derive down** with
`value = { app.goal }`, **deliver up** with `input(v) { app.goal = v }`. Drag the
slider and the label moves with it; press Reset and both snap back. One value, several
views, no wiring in between.

## Step 5 — extract a card

A metric is a label, a number, and a bar — worth its own component. In Declare a
component *is* a class: name the type, `extends` a base, add members
([The tree](declare-docs:guide:tree)).

```declare
class Card extends View [ width = 280, height = 40,
    label: string = "",
    value: number = 0,

    name: Text [ x = 0, y = 0, text = { classroot.label } ],
    pct:  Text [ x = 244, y = 0, width = 36, text = { `${classroot.value}%` } ],
    track: View [ x = 0, y = 24, width = 280, height = 10, cornerRadius = 5, fill = whitesmoke,
        bar: View [ height = 10, cornerRadius = 5,
            width = { classroot.value / 100 * 280 },
            fill = { classroot.value >= app.goal ? 0x4169E1 : 0xC0C0C0 } ],
        ],
    ]


App [ fill = white, textColor = #1A1A1E,
    fontFamily = ["system-ui", "sans-serif"], fontSize = 15,
    goal: number = 50,
    Card [ x = 24, y = 24, label = "Reactive", value = 92 ],
    ]
```

`Card` declares two attributes of its own and lays out a name, a percentage, and a
track whose inner `bar` widens with `value`. `classroot` in those constraints is how a
child binding reaches the card instance it belongs to — read it as "this `Card`"
([Reach](declare-docs:guide:reach)). Note the bar's color: inside `{ }` you are in
TypeScript, where a color is a number (`0x4169E1`), not a bare name like `royalblue` —
bare color names live only in bare slots ([Constraints](declare-docs:guide:constraints)).
Because the class *is* a `View` plus these members, `Card [ … ]` is now a leaf you can
drop anywhere, and its bar already reacts to the goal from step 4.

## Step 6 — drive it from data

One hand-placed card wants to be many. Bind a `Dataset` and let the data decide how
many there are ([Data](declare-docs:guide:data)):

```declare
class Card extends View [ width = 280, height = 40,
    label: string = "",
    value: number = 0,

    name: Text [ x = 0, y = 0, text = { classroot.label } ],
    pct:  Text [ x = 244, y = 0, width = 36, text = { `${classroot.value}%` } ],
    track: View [ x = 0, y = 24, width = 280, height = 10, cornerRadius = 5, fill = whitesmoke,
        bar: View [ height = 10, cornerRadius = 5,
            width = { classroot.value / 100 * 280 },
            fill = { classroot.value >= app.goal ? 0x4169E1 : 0xC0C0C0 } ],
        ],
    ]


App [ fill = white, textColor = #1A1A1E,
    fontFamily = ["system-ui", "sans-serif"], fontSize = 15,
    goal: number = 50,
    metrics: Dataset { { "rows": [
        { "label": "Reactive", "n": 92 },
        { "label": "Compiled", "n": 78 },
        { "label": "Small",    "n": 64 } ] } },

    Text [ x = 24, y = 20, fontSize = 22, fontWeight = bold, text = "Signals" ],
    Text [ x = 24, y = 52, textColor = slategray, text = { `Goal: ${goal}%` } ],
    controls: View [ x = 24, y = 84,
        layout: SimpleLayout [ axis = y, spacing = 14 ],
        Slider [ min = 0, max = 100, value = { app.goal },
            input(v) { app.goal = v },
            ],
        Button [ label = "Reset", primary = true,
            onClick() { app.goal = 50 },
            ],
        ],
    panel: View [ x = 24, y = 176, datapath = { parent.metrics.value },
        layout: SimpleLayout [ axis = y, spacing = 16 ],
        Card [ datapath = :rows[], label = :label, value = :n ],
        ],
    ]
```

`datapath` sets a **cursor** into the data; the `:rows[]` on the `Card` **replicates**
it — one card per row — and inside each, `:label` and `:n` read that row's fields.
There is no loop and no list component: add a row to the dataset and a card appears;
remove one and its card leaves. Drag the goal slider now and every bar repaints at
once, because each reads `app.goal` through the same constraint.

## Step 7 — hover and expand, with states

Make a card respond. Two handlers flip a `hovered` boolean and one flips `open`; a
`State` — a named, reversible bundle of overrides — reacts to each. Add these members
to the `Card` class ([Events](declare-docs:guide:interaction),
[Continuity](declare-docs:guide:continuity)):

```declare-fragment
    hovered: boolean = false,
    open:    boolean = false,
    onMouseOver() { hovered = true },
    onMouseOut()  { hovered = false },
    onClick()     { open = !open },

    lit:    State [ applied = { hovered }, fill = aliceblue ],
    opened: State [ applied = { open }, height = 64,
        note: Text [ x = 0, y = 40, fontSize = 12, textColor = slategray,
            text = { classroot.value >= app.goal ? "Meeting goal" : "Below goal" } ],
        ],
```

`lit` tints the card while `hovered` holds; when the pointer leaves, the override
**reverts on its own** — you wrote no exit code, and the "forgot to un-highlight it"
bug cannot be written. `opened` does something a ternary cannot: its `note` child is
instantiated when `open` turns true and destroyed when it turns false, and the panel
below reflows to make room. That is the structural half of states — presence, not just
values.

## Step 8 — motion

Finally, give the bar physics. Instead of its length *snapping* to `value`, let a
`Spring` ease it there. Change the `bar` to start collapsed and follow a spring
([Animation](declare-docs:guide:continuity)):

```declare-fragment
    bar: View [ height = 10, cornerRadius = 5, width = 0,
        fill = { classroot.value >= app.goal ? 0x4169E1 : 0xC0C0C0 },
        grow: Spring [ attribute = width, to = { classroot.value / 100 * 280 },
            stiffness = 190, damping = 22 ],
        ],
```

A `Spring` is a *standing relationship*, not a scheduled tween: its `to` is a live
constraint, so the bar always eases toward wherever `value` points — waking when the
target moves, settling at rest. You declared *where* the bar belongs; the spring found
the path there.

## The whole thing

Assembled, every idea fits in about fifty lines — a class, some state, constraints, a
themed slider and button, a dataset with replication, two states, and a spring, and not
one line of update logic:

```declare
class Card extends View [ width = 280, height = 40,
    label: string = "",
    value: number = 0,
    hovered: boolean = false,
    open: boolean = false,
    onMouseOver() { hovered = true },
    onMouseOut()  { hovered = false },
    onClick()     { open = !open },

    name: Text [ x = 0, y = 0, text = { classroot.label } ],
    pct:  Text [ x = 244, y = 0, width = 36, text = { `${classroot.value}%` } ],
    track: View [ x = 0, y = 24, width = 280, height = 10, cornerRadius = 5, fill = whitesmoke,
        bar: View [ height = 10, cornerRadius = 5, width = 0,
            fill = { classroot.value >= app.goal ? 0x4169E1 : 0xC0C0C0 },
            grow: Spring [ attribute = width, to = { classroot.value / 100 * 280 },
                stiffness = 190, damping = 22 ],
            ],
        ],

    lit:    State [ applied = { hovered }, fill = aliceblue ],
    opened: State [ applied = { open }, height = 64,
        note: Text [ x = 0, y = 40, fontSize = 12, textColor = slategray,
            text = { classroot.value >= app.goal ? "Meeting goal" : "Below goal" } ],
        ],
    ]


App [ fill = white, textColor = #1A1A1E,
    fontFamily = ["system-ui", "sans-serif"], fontSize = 15,
    goal: number = 50,
    metrics: Dataset { { "rows": [
        { "label": "Reactive", "n": 92 },
        { "label": "Compiled", "n": 78 },
        { "label": "Small",    "n": 64 } ] } },

    Text [ x = 24, y = 20, fontSize = 22, fontWeight = bold, text = "Signals" ],
    Text [ x = 24, y = 52, textColor = slategray, text = { `Goal: ${goal}%` } ],
    controls: View [ x = 24, y = 84,
        layout: SimpleLayout [ axis = y, spacing = 14 ],
        Slider [ min = 0, max = 100, value = { app.goal },
            input(v) { app.goal = v },
            ],
        Button [ label = "Reset", primary = true,
            onClick() { app.goal = 50 },
            ],
        ],
    panel: View [ x = 24, y = 176, datapath = { parent.metrics.value },
        layout: SimpleLayout [ axis = y, spacing = 16 ],
        Card [ datapath = :rows[], label = :label, value = :n ],
        ],
    ]
```

## The loop is part of the language

Before you move on, break it on purpose. In the panel, misspell `Card` as `Crad` and
reload:

```
unknown component 'Crad' — did you mean 'Card'? [DECLARE2001]
  hint: a tag names a built-in component or a class declared in the program
```

The compiler catches it before anything runs, names the likely fix, and points at the
line. This is the loop the whole toolchain is built around — edit, reload, read the
error, apply it. You will lean on it constantly; the diagnostics are written to be
trusted ([Check it](declare-docs:guide:checking)).

## Where next

You have now met every Fundamental idea — composition, constraints, prevailing style,
the standard library, events, states, layout, data, and scope. Read
[Part II](declare-docs:guide:tree) in order for the depth behind each, then Part III
for [animation](declare-docs:guide:continuity), text, sizing, and the rest.
