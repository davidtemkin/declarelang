# Part A — predictions

**1.** The child is as wide as "hi". It has no width set, so its width comes from its content: the
`Text`'s run. A `SimpleLayout` places children along its axis (`y`) but doesn't stretch them across
it unless it says `align = stretch`. Declare doesn't stretch by default the way flexbox does, and
being inside a layout doesn't change that. To make the child as wide as the column, write
`layout: SimpleLayout [ axis = y, align = stretch ]` on the 300-wide parent. The layout then decides
every child's width. The parent has a fixed width, so `width = 100%` on the child would also work.
`align = stretch` is still the better choice because the layout sizes every child the same way.

**2.** Write `align = stretch` on the parent's layout:
`layout: SimpleLayout [ axis = y, align = stretch ]`. Don't write anything on the children. The
parent's width comes from its children, so it can't also give them a width; that would be
circular. `width = 100%` on the children doesn't work either. A child sized from its parent
doesn't count toward the parent's content width, so the parent loses the measurement it was
sized by. `align = stretch` is the way to fill such a view: each child becomes as wide as the
widest.

**3.** The child gives its width two deciders. `flexes = true` asks the parent's layout to set the
child's size along the run, and in an `axis = x` layout that size is `width`. `width = 200` says the
child sets it itself. The rule is one decider per dimension, and a child never states what its
parent's layout decides. So this is a conflict, and I expect the compiler to refuse it with a
diagnostic naming the fix. Pick one: drop `flexes` to get a fixed 200, or drop `width` to flex. If
you meant "flex, but at least 200", keep `flexes = true` and write `minWidth = 200`. A min/max range
is a fact the child tells the layout.

**4.** A constraint always decides, so a size that holds only some of the time is a `State`. The
panel leaves `width` unset, which makes it content-sized, and a State applies the fixed width
while the condition holds:

```declare-fragment
panel: View [
    wide: State [ applied = { app.wide }, width = 300 ],
    Text [ text = "Panel content" ]
    ]
```

When `app.wide` turns false the override lifts and the width goes back to the content's.

**5.** On the child, write `flexes = true`, and nothing else about its size. The layout then sizes
it along the run in both arrangements: `width` while the axis is `x`, `height` while it is `y`. Do
not write `width` or `height` on it, whether as a constant, a percentage, or a constraint like
`{ app.wide ? … : … }`. Whichever one you write becomes the run dimension in one of the two
arrangements and fights the layout for it. If the child needs to fill the other axis too, put
`align = stretch` on the layout, not on the child.

**6.** The second child is 120 wide. The parent has no width, so its width is its content's. The
second child is sized from the parent (`100%`), and such a child doesn't count toward the parent's
content size on that axis. So the parent's content width comes only from the first child: 120.
`100%` of that is 120. With no layout here, both children sit at `x = 0, y = 0` and overlap. The
idiomatic version of "as wide as my auto-sized parent" is a layout with `align = stretch` rather
than `100%`.
