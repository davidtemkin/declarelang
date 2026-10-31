# Part A — predictions

**1.** The child is as wide as the text "hi". A view with no size takes it from its content,
meaning its own run and its visible children's boxes. Its only content is the `Text`, so it is
as wide as that run. The column being 300 wide has no effect, because a `SimpleLayout` on `y`
only places `y` and does not size the child across. To make it as wide as the column, write
`width = 100%` on the child. That resolves against the parent's content box, which is 300 here.
Another way is to write `align = stretch` on the layout. That makes every content-sized child
fill the view across.

**2.** Write `align = stretch` on the layout:
`layout: SimpleLayout [ axis = y, align = stretch ]`. Write nothing on the children. Each child
still gives its natural width to the parent's content size. The parent becomes as wide as the
wider child, and stretch then widens the narrower child to match. `width = 100%` on the children
would not work here. A child sized from its parent does not count toward the parent's content
size. If both children were sized that way, nothing would size the parent.

**3.** It is refused at compile time, on that child's line. `flexes` asks the row to give the
child its length along the run, which in an `x` row is `width`. A layout places its children,
and a child may not also declare what the layout places. So `flexes = true` and `width = 200`
contradict each other. To keep the intent, drop `width` and state a range instead:
`minWidth = 200` for a floor or `maxWidth = 200` for a cap. If you want a fixed width, drop
`flexes`.

**4.** `panel: View [ width = { app.wide ? 300 : contentWidth }, … ]`. `contentWidth` is the
read-only intrinsic for what the content wants, so the narrow case is just the content size. An
equivalent form leaves `width` unset and adds a state that overrides it:
`wide: State [ applied = { app.wide }, width = 300 ]`. When the state lifts, the width goes back
to being sized by the content.

**5.** Write `flexes = true` on the child and nothing else about its size. Do not write `width`
or `height`. Both are the run-axis size in one of the two arrangements (`width` in the row,
`height` in the column), and the layout owns that size there. Writing either one breaks the
other arrangement. Also do not write `x` or `y`, because the row places `x` and the column
places `y`. To make the child fill across in both arrangements, put `align = stretch` on the
layout rather than a size on the child.

**6.** It is 120 wide. `100%` resolves against the parent's width. A child sized from its parent
does not count toward the parent's content size, so the parent's width comes only from the first
child, which is 120. The second child is then 100% of 120.
