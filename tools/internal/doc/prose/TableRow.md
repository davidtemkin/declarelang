One row of a `Table` — replicated over data (`datapath = :rows[]`) or written by
hand. A row **presents** the selection facts, it never stores them: `selected` and
`active` derive from the table's value, the default look tints against the theme, and a
click delivers through the table's protocol with the live modifier facts. The row
template needs no selection wiring at all.

## selected
Derived: is this row's item in the table's selection? Style against it.

## active
Derived: is the keyboard standing here? The default draws a hairline when the table's
focus is keyboard-visible.

## item()
The item this row presents: its record when replicated (the whole region at its
cursor), the row view itself when written.

## tableIndex()
The row's logical index — its `rowIndex` when replicated (true data order, windowing
included); a written row's position among its table's rows.
