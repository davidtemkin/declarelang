A horizontal flow that **wraps** to a new row when the view runs out of width — a row
while there's room, rows when there isn't. For tag lists, chip clouds, a toolbar that
reflows. It re-wraps reactively as the view resizes, so binding the view's `width` to its
parent is all it takes to make the flow responsive.

```declare
View [ width = { parent.width }, layout: WrappingLayout [ spacing = 8, lineSpacing = 8 ] ]
```

## spacing
The horizontal gap between items within a row, in px.

## lineSpacing
The vertical gap between wrapped rows, in px — **defaults to `spacing`** when unset, so a
single value gives even gaps in both directions and you only set this to make the rows
tighter or looser than the columns.
