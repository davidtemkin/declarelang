# Layout probe — the answer key

Score each answer and program against what the runtime does, and check the runtime too: a
program refused or mis-sized when the key says it is right is a platform bug, not a miss.

## Part A

1. As wide as its text: an unset size is the content's, in a layout too, and a column does
   not size its children across. To fill: `align = stretch` on the layout (or `width = 100%`
   on the child — the parent has a width of its own).
2. `align = stretch` on the parent's layout, nothing on the children: the parent is as wide
   as the wider child, and stretch makes the other as wide. `width = 100%` on the children
   would not count toward the parent's width.
3. Refused at that line: `flexes` asks the layout for the width along the run, and a child
   does not state what its layout decides. A floor or a cap is `minWidth` / `maxWidth`.
4. A `State`: `State [ applied = { app.wide }, width = 300 ]` on a panel with no width, so the
   width is the content's when it lifts. `width = { app.wide ? 300 : contentWidth }` is also
   correct; note which the agent chose and whether it said the other cannot be written.
5. `flexes = true`, and neither `width` nor `height`: under a computed axis each is the
   run's size in one arrangement. Filling across is `align = stretch` on the layout.
6. 120: the `100%` child is sized from its parent, so it does not count toward the parent's
   content width; the parent is the other child's 120, and `100%` of it is 120.

## Part B — geometry, read with `verify --size <w>x<h> --outline app`

- `frame.declare` at 1280×800: header 48 tall at the top, footer 32 at the foot, the list
  1040 wide and the side panel 240 wide, **both as tall as the space between** (720). At
  390×844: the list 390 wide above, the side panel 390 wide and 120 tall under it.
- `form.declare`: the three stacked fields 360 wide; the two in the row equal, filling 360
  less the spacing between them.
- `menu.declare`: every item the same width, the widest label's (plus any padding), with no
  width stated anywhere in the menu.

A program counts as correct only on its geometry: one that compiles and boots with the
wrong sizes is wrong (the side panel as tall as its text, not the space, is the miss to
look for).
