# Space: sizing and layout

How a box gets its size and how its children get their places are one subject. Both come
down to the same short rule:

> **Unset is automatic, a constant is fixed, a constraint is anything — and layout is just
> an attribute.**

## A view's size, per axis

Each axis — width and height — is one of three things, chosen by what you write:

- **unset** → the view auto-sizes to the bounding box of its visible children;
- **a constant** (`width = 300`) → fixed;
- **a constraint** (`width = { parent.width - 40 }`) → whatever the expression computes.

Two read-only intrinsics, `contentWidth` and `contentHeight`, expose what the content
*wants* to be, so any clamp is plain arithmetic. A view has no `minHeight`/`maxHeight`/
`overflow` attributes — you write the min/max yourself:

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

The box grows to its content up to 90 pixels, then stops; `clip = true` hides what passes
the cap (`scrolls = true` would let the extra scroll natively instead).

## The app fills its host

An `App` with no size fills its host and resizes with the window — which is why responsive
layout reads `app.width` (a filling app's width *is* the host width). The one deliberate
size floor is the app's own: `App [ minWidth = 360 ]` sets the width below which the app
stops adapting — in a narrower host it holds the floor and the stage pans natively.

## Layout is a swappable attribute

*How* a view's children arrange is a `layout:` attribute you set on a generic view — not a
container type. `SimpleLayout` stacks along an axis; `WrappingLayout` flows onto new lines:

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

Because layout is a slot and not a type, you can *swap* it, nest axes, or animate it — the
seed of continuity we pay off in [chapter 28](declare-docs:guide:continuity).

## Responsiveness, honestly

`axis` takes a literal, so you do not write `axis = { app.width < 480 ? y : x }`. A
wide→narrow reflow has two honest forms. The direct one is **per-child constraints on
`app.width`** — gutters, sizes, and font sizes that key off the root:

```declare
App [ fill = white, textColor = black, minWidth = 360,
    col: View [ x = { app.width < 480 ? 16 : 40 }, y = 24,
        width = { app.width - (app.width < 480 ? 32 : 80) },
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        Text [ fontSize = { app.width < 480 ? 20 : 30 }, fontWeight = bold, text = "Responsive" ],
        Text [ textColor = slategray, text = "gutters and size key off app.width" ],
        ],
    ]
```

The other form swaps the whole `layout` for a wide vs. narrow arrangement — a job for a
`State` gated on `app.width`, which [chapter 28](declare-docs:guide:continuity) covers. And
often the cleanest answer is neither: set a `minWidth` floor and let the stage pan below it,
rather than reflow at all.

---

**Next:** everything so far has been about one view. Now, many views from data —
[Data](declare-docs:guide:data).
