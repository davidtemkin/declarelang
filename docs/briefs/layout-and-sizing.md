# Layout and sizing
<!-- index: layouts first, size per axis, padding and Card, reflow -->

**Use when** placing and sizing views: stacks, rows, cards, a page that reflows.

```declare
App [ width = 560, height = 260, fill = #F4F6FA, textColor = #172530, minWidth = 320,
    page: View [ x = 20, y = 20, width = { app.width - 40 },
        layout: ResponsiveLayout [ plan = { [
            ({ from: 480, flow: "row", gap: 16, share: ({ side: 30, main: 70 }) }),
            ({ from: 0, flow: "stack", gap: 12, share: ({ side: 100, main: 100 }) })
            ] } ],
        side: Card [
            Text [ fontWeight = semibold, text = "Filters" ],
            Text [ width = 100%, textColor = slategray, text = "A card stacks what it holds." ]
            ],
        main: Card [
            head: View [ width = 100%,
                layout: SimpleLayout [ axis = x, spacing = 8, align = center ],
                Text [ fontWeight = semibold, text = "Results" ],
                Spacer [ ],
                Button [ label = "Refresh" ]
                ],
            Divider [ ],
            Text [ width = 100%, text = "Sizes come from content unless you say otherwise." ]
            ]
        ]
    ]
```

**Rules**
- Layouts arrange; you rarely place. `layout: SimpleLayout [ axis = y, spacing = 8 ]` is
  a member of the view it arranges. Hand-set `x`/`y` is for free-form surfaces (a
  diagram, an overlay).
- What a layout places belongs to it: a child must not also set that `x`/`y` (the
  compiler refuses it, naming the fix). A child that must stand apart says
  `ignoreLayout = true`.
- Each axis is unset (as large as its content), a constant, or a constraint. A child
  sized from its parent doesn't count toward the parent's content size.
- `width = 100%` is the room you're given (the parent's width less its padding);
  `{ parent.width }` is the parent's own box.
- `padding` is the view's inside; paint covers the whole box. `Card` is the padded,
  stacked, themed surface; `Divider` the rule between items; `Spacer` absorbs slack in a
  row.
- Reflow: `ResponsiveLayout` plans by the view's own width, so plans nest. Small changes
  are constraints (`spacing = { app.narrow ? 6 : 12 }`); often the best answer is a
  floor, `App [ minWidth = 360 ]`.
- Limits are arithmetic on `contentWidth`/`contentHeight`: `height = { Math.min(contentHeight, 90) }`.

**Look up** `SimpleLayout`, `WrappingLayout`, `ResponsiveLayout`, `View.padding`,
`View.ignoreLayout`, `Card`, `Divider`, `Spacer`, `View.contentHeight`.

**Examples** `apps/homepage/homepage.declare`: sections flowing with `ResponsiveLayout` ·
`apps/tracker/tracker.declare`: toolbar rows with `Spacer` · `apps/weather/weather.declare`:
`MasonryLayout`, a layout written in Declare.

**Guide** Size, position and layout (all of it is short) · Your own
views and drawing § Writing a layout.
