<!-- nav: Space -->
<!-- part: Building -->

# Space is arithmetic

Where CSS gives you a layout *system* — flow, flexbox, grid, each with its own
vocabulary and its own negotiations — Declare gives you numbers and relationships. A
view's position is its `x` and `y`. Its size is three possibilities. Arrangement is an
attribute. Everything else is arithmetic you can read:

> **Unset is automatic, a constant is fixed, a constraint is anything — and layout is
> just an attribute.**

## A view's size, per axis

Each axis — width and height — is one of three things, chosen by what you write:

- **unset** → the view auto-sizes to the bounding box of its visible children;
- **a constant** (`width = 300`) → fixed;
- **a constraint** (`width = { parent.width - 40 }`) → whatever the expression says.

Two read-only intrinsics, `contentWidth` and `contentHeight`, expose what the content
*wants* to be — so a clamp is not a `maxHeight` attribute but plain arithmetic:

```declare
App [ fill = white, textColor = black,
    box: View [ x = 20, y = 20, width = 200, cornerRadius = 8, fill = whitesmoke, clip = true,
        height = { Math.min(contentHeight, 90) },
        col: View [ layout: SimpleLayout [ axis = y, spacing = 8 ],
            Text [ text = "auto-height, capped at 90" ],
            Text [ text = "line two" ],
            Text [ text = "line three" ],
            Text [ text = "line four (clipped)" ],
            ],
        ],
    ]
```

The box grows with its content to 90 pixels, then stops; `clip = true` hides the
overflow. Change the clamp to `scrolls = true` on the box instead and the extra
scrolls natively. Delete a `Text` line and watch the height re-derive — the size is a
relationship like any other.

## Placing a view

Position is `x`/`y` against the parent, and two named literals cover the everyday
cases the arithmetic would otherwise spell out: `x = center` and `x = end` (likewise
on `y`) place a view centered in, or flush against, its parent — resolved reactively,
exactly like `100%`. The written-out form `x = { (parent.width - this.width) / 2 }`
remains the no-magic spelling; the literal is just its name. (On a `Text`,
`y = center` centers the *ink* — the cap-to-baseline band — so labels read centered
regardless of font metrics.)

## Layout is a swappable attribute

*How* a view's children arrange is a `layout:` attribute set on a perfectly generic
view — not a container type you must build the tree around. `SimpleLayout` stacks
along an axis; `WrappingLayout` flows onto new lines:

```declare
App [ width = 260, height = 120, fill = white,
    tags: View [ x = 20, y = 20, width = 220,
        layout: WrappingLayout [ spacing = 8, lineSpacing = 8 ],
        View [ width = 70, height = 30, cornerRadius = 15, fill = gainsboro ],
        View [ width = 90, height = 30, cornerRadius = 15, fill = gainsboro ],
        View [ width = 60, height = 30, cornerRadius = 15, fill = gainsboro ],
        View [ width = 100, height = 30, cornerRadius = 15, fill = gainsboro ],
        ],
    ]
```

Narrow the `tags` width and the pills re-wrap. Because layout is a *slot* and not a
type, it can be swapped, nested, or driven — the seed of what
[chapter 10](declare-docs:guide:arrangement) grows into whole moving arrangements.

> **From CSS:** there is no flexbox, no grid, no document flow, and no z-index —
> children sit at their `x`/`y` unless a `layout` arranges them, stacking is
> declaration order, and "responsive" is not a media query but an ordinary constraint
> reading `app.width`. Your spatial *intuitions* transfer; the negotiation machinery
> stays behind.

A child can opt **out** of a parent regime, and the opt-out is declared on the child —
the one who differs is the one who says so. `ignorelayout = true` makes the parent's
layout skip it: it keeps its own `x`/`y` while its siblings are arranged around it (a
badge pinned to a corner of a stacked card). `ignoreclip = true` makes the parent's
`clip` not cut it: outside the frame it still paints *and* still hits, and it stops
counting toward the parent's content size — the idiom for frame chrome that straddles
the frame, like a window's resize border living just outside the box it resizes.

## The app fills its host

An `App` with no size fills its host and resizes with it — which is why responsive
code reads `app.width` (a filling app's width *is* the host's). Give an app explicit
dimensions only to make a fixed-size widget. And when a design degrades below some
width instead of adapting, say so as *policy*, not clamp math: `App [ minWidth = 360 ]`
holds the floor, and in a narrower host the stage pans natively.

## Responsiveness, honestly

The named tool is `ResponsiveLayout`: you give it **plans** — each one says *"from
this width up, arrange the children like this"* — and it keeps the right plan
applied as its view's width changes. A plan can flow the children as a row or a
stack, divide the width among the children it names (`share`), and hide one
outright (`share: 0`). It watches its **own view's** width, not the window's, so
plans nest: the parent decides how much room a child gets, the child's own plan
decides what to do with it.

```declare
App [ fill = white, textColor = black, minWidth = 300,
    bar: View [ x = 20, y = 20, width = { app.width - 40 },
        layout: ResponsiveLayout [ plan = { [
            ({ from: 480, flow: "row", share: ({ menu: 30, body: 70 }) }),
            ({ from: 0, flow: "stack" }),
        ] } ],
        menu: View [ height = 60, fill = gainsboro ],
        body: View [ height = 60, fill = whitesmoke ],
        ],
    ]
```

Wide, it is a 30/70 row; narrow, a stack at natural widths — and the crossing is
just the plan re-applying. When a row's children keep natural widths, the leftover
space is placed with **structure**, not a knob: a `Spacer [ ]` child absorbs the
slack (between two groups it pushes them apart; one on each side centers the run).

Layout attributes are reactive like any others — `spacing = { app.width < 480 ? 6 : 12 }`
is an ordinary constraint — and per-child constraints keying off `app.width` remain
the direct form for gutters and type sizes. Swapping a whole *configuration* beyond
geometry is a job for a `State` gated on width, which arrives in
[chapter 9](declare-docs:guide:motion-and-modes). And often the cleanest answer is
none of these: set the `minWidth` floor and let the stage pan, rather than reflowing
a design below the width where it works.

---

**What you can now say:** you can size and place anything — automatic, fixed, or
derived — arrange children without a layout system's ceremony, and make a design
respond to its window with constraints you can read.

[Next: **Style is state** →](declare-docs:guide:style)
