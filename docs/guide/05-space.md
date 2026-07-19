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
    tags: View [ x = 16, y = 16, width = 228,
        layout: WrappingLayout [ spacing = 8, lineSpacing = 8 ],
        View [ width = 70, height = 26, cornerRadius = 13, fill = 0xE6ECF2 ],
        View [ width = 96, height = 26, cornerRadius = 13, fill = 0xE6ECF2 ],
        View [ width = 60, height = 26, cornerRadius = 13, fill = 0xE6ECF2 ],
        View [ width = 104, height = 26, cornerRadius = 13, fill = 0xE6ECF2 ],
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

## The app fills its host

An `App` with no size fills its host and resizes with it — which is why responsive
code reads `app.width` (a filling app's width *is* the host's). Give an app explicit
dimensions only to make a fixed-size widget. And when a design degrades below some
width instead of adapting, say so as *policy*, not clamp math: `App [ minWidth = 360 ]`
holds the floor, and in a narrower host the stage pans natively.

## Responsiveness, honestly

`axis` takes a literal — you do not write `axis = { app.width < 480 ? y : x }`. A
wide-to-narrow reflow has two honest forms. The direct one: per-child constraints
keying off `app.width` —

```declare
App [ fill = white, textColor = black, minWidth = 360,
    col: View [ x = { app.width < 480 ? 16 : 40 }, y = 24,
        width = { app.width - (app.width < 480 ? 32 : 80) },
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        Text [ fontSize = { app.width < 480 ? 20 : 30 }, fontWeight = bold, text = "Responsive" ],
        Text [ textColor = slategray, text = "gutters and sizes key off app.width" ],
        ],
    ]
```

The other form swaps a whole arrangement at once — a job for a `State` gated on
`app.width`, which arrives in [chapter 9](declare-docs:guide:motion-and-modes). And
often the cleanest answer is neither: set the `minWidth` floor and let the stage pan,
rather than reflowing a design below the width where it works.

---

**What you can now say:** you can size and place anything — automatic, fixed, or
derived — arrange children without a layout system's ceremony, and make a design
respond to its window with constraints you can read.

[Next: **Style is state** →](declare-docs:guide:style)
