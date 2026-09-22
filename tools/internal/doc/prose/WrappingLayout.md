A horizontal flow that **wraps** to a new row when the view runs out of width — a row
while there's room, rows when there isn't. For tag lists, chip clouds, a toolbar that
reflows. It re-wraps reactively as the view resizes, so binding the view's `width` to its
parent is all it takes to make the flow responsive.

```declare
View [ width = { parent.width },
    layout: WrappingLayout [ spacing = 8, rowSpacing = 8 ]
    ]
```

## spacing
The horizontal gap between items within a row, in px.

## rowSpacing
The vertical gap between wrapped rows, in px. Independent of `spacing`: a uniform grid
writes the same number for both, and a negative value pulls rows into each other.
