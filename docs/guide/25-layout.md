# Layout — a swappable attribute

Here is a design choice that puts Declare between two camps. *How* a view arranges
its children is a reactive **`layout:` attribute you set on the view** — not a
child element (OpenLaszlo's `<simplelayout>`), and not the container's *type*
(SwiftUI's `VStack`, Flutter's `Column`). The view stays generic; the arrangement
is a slot.

```declare
App [ fill = white, textColor = black,
    View [ x = 28, y = 26,
        layout: SimpleLayout [ axis = y, spacing = 16 ],
        Text [ text = "Humidity" ],
        Text [ text = "Wind" ],
        Text [ text = "Sunrise" ],
        ],
    ]
```

## Why an attribute, and what it buys you

Because `layout` is an ordinary reactive attribute, you can do to it everything
you can do to any attribute: **swap it, constrain it, or animate it.** A view that
stacks vertically can become a grid by changing one member; a layout's `spacing`
can be a `{ }` constraint that reacts to the viewport; an arrangement can
*transition* continuously rather than jump when it changes. None of that is
possible when the arrangement is baked into the container's type or hidden in a
child element.

Every view *has* a layout, defaulting to **none** — absolute positioning by `x`
and `y`. That is not a lesser mode; much of a real UI is leaves placed at explicit
coordinates, and a layout is what you add when you want the container to place
children *for* you.

## `SimpleLayout` — a row or a column

The workhorse: lay children along one `axis` with `spacing` between them. Nest two
of them for a row-of-columns:

```declare
App [ fill = white, textColor = black,
    moreData: View [ x = 15, y = 24,
        layout: SimpleLayout [ axis = x, spacing = -10 ],   // two columns side by side

        labels: View [ layout: SimpleLayout [ axis = y, spacing = 1 ],
            Text [ text = "Humidity:" ],
            Text [ text = "Wind:" ],
            ],
        fields: View [ layout: SimpleLayout [ axis = y, spacing = 1 ],
            Text [ text = "62%" ],
            Text [ text = "8 mph" ],
            ],
        ],
    ]
```

`spacing` may be negative (as here) to pull columns tighter. The children keep
their own cross-axis position — a vertical `SimpleLayout` sets each child's `y`
and leaves `x` to you. (See the [`SimpleLayout` reference] for the full attribute
set.)

## `WrappingLayout` — flow that reflows

When items should flow and wrap to the next line as width shrinks — cards on a
page, chips in a field — use `WrappingLayout` with `spacing` (between items) and
`lineSpacing` (between rows). It re-wraps reactively as its container resizes, so a
grid of cards restacks on a phone with no breakpoint code:

```declare
cards: View [ width = { parent.width },
    layout: WrappingLayout [ spacing = 24, lineSpacing = 24 ],
    Card [ title = "Analyzable", body = "The compiler reads the data-flow statically." ],
    Card [ title = "Generable",  body = "No ceremony, no magic." ],
    Card [ title = "Runnable",   body = "It compiles in the browser." ],
    ]
```

Other strategies exist for other jobs — `GridLayout` for fixed rows and columns,
`ResizeLayout` for children that share out a fixed extent — and because layouts are
just `Layout` subclasses, you can write your own. Reach for the reference for the
full set.

## Layout and sizing work together

A container with a layout usually wants to *size to* what it laid out. That falls
out of the sizing model: leave a container's `width`/`height` unset and it
auto-sizes to the bounding box of its children (a vertical stack grows as tall as
its content). Set a dimension to a constant to fix it, or to a `{ }` constraint —
including one that reads `contentWidth`/`contentHeight` — to clamp it ("grow to a
cap, then stop"). Layout arranges; sizing measures; they compose. The full matrix
is in [Sizing](32-sizing.md).

## The gotcha, restated

If you come from SwiftUI or Flutter, the reflex is to reach for a *stack type*. In
Declare there is no stack type — there is `View` with a `layout` attribute. If you
come from OpenLaszlo, the reflex is to nest a `<simplelayout>` *child*. In Declare
it is a member with `:` — `layout: SimpleLayout [ … ]` — because it is an
attribute whose value is a layout strategy, not a child in the visual tree. Once
that clicks, swapping and animating layouts stops being a special feature and
becomes just "setting an attribute."

---

**Next:** binding the tree to data — [Datapaths and sources](26-data.md).


<!-- demo: SimpleLayout -->
