The stacking layout: arranges a view's children in a line along `axis`, `spacing` px
apart, skipping invisible ones. You set it as the view's `layout` **attribute** — not a
child (OpenLaszlo's form), not the container's type (SwiftUI/Flutter's) — which is what
lets you **swap or animate it** so an arrangement *transitions* instead of jumping. While
it's active it drives the children's positions, so any `x`/`y` you set on them is
overwritten.

```declare
View [ layout: SimpleLayout [ axis = y, spacing = 10 ],
    Text [ text = "one" ],
    Text [ text = "two" ],
]
```

## axis
The stacking direction — `x` lays children left-to-right (a row), `y` top-to-bottom (a
column). You always name it; there is no "obvious" default for a stack.

## spacing
The gap between adjacent children, in px. **Negative values overlap them** — stacked
cards, an avatar pile. Invisible children are skipped, so the gap closes automatically
when one hides rather than leaving a hole.
