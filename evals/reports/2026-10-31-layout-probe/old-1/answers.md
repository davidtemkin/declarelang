# Part A — answers

**1.** The child is only as wide as its text "hi" (plus whatever offset the `Text` has). Its
width is unset, so it comes from its content: its visible children's boxes, which here is one
short `Text` run. A column (`axis = y`) only places the child's `y`. It does not size the child
across, so the parent's 300 has no effect on it. To make it as wide as the column, write
`width = 100%` on the child (100% of the parent's content box, which is 300 here). The other way
is `align = stretch` on the `SimpleLayout`, which makes a content-sized child fill the view
across.

**2.** Put `align = stretch` on the parent's layout:
`layout: SimpleLayout [ axis = y, align = stretch ]`. Don't write anything on the children. The
parent has no width, so it takes its width from its content: the wider child, which is sized by
its longer `Text`. Stretch then makes each content-sized child fill that width across. Writing
`width = 100%` on the children would not work. A child sized *from* its parent doesn't count
toward the parent's content size, so the parent would have no content width left to take, and
the children would be 100% of nothing.

**3.** It's a conflict, and the docs say it is refused. In a row, the layout places the child
along x, and `flexes = true` asks the layout to *give* the child its width (the remaining room
along the run). A layout places what it decides, and a child that also declares that value "is
refused at its line, in any spelling", so the `width = 200` line should be a compile error. If
you meant "flex, but never narrower than 200", state that as a fact the layout can respect:
`flexes = true, minWidth = 200`. If you meant a fixed 200, drop `flexes`.

**4.** Leave `width` unset in the base, so it is content-sized, and override it with a state
while `app.wide` holds. When the state lifts, the override reverts and the width goes back to
coming from the content:

```declare-fragment
panel: View [
    wideMode: State [ applied = { app.wide }, width = 300 ],
    Text [ text = "Panel content" ]
    ]
```

(An equivalent constraint form is `width = { app.wide ? 300 : contentWidth }`, using the
read-only `contentWidth` intrinsic.)

**5.** Write `flexes = true` on that child. It's a fact about the child, and the layout
interprets it along whichever axis the run currently has: width in the row, height in the
column. Don't write `width` or `height` on it, and don't write `x` or `y` either. Whichever one
is the run axis at that moment is placed by the layout, and since the axis flips, a written
`width` would be refused in the row arrangement and a written `height` in the column one. If the
child should also fill the cross direction, get that from the layout (`align = stretch`), not
from a size on the child.

**6.** It is 120 wide. The parent has no width, so its width comes from its content. The
`100%` child is sized *from* its parent, so it doesn't count toward that content width. Only
the `width = 120` child does, which makes the parent 120 wide. The second child is then 100% of
that, so 120.
