# Part A — answers

**1.** The child is only as wide as "hi". If a view has no size on an axis, it takes its size from its content: here that is the `Text`'s run. A `SimpleLayout` with `axis = y` only places `y` and leaves width alone, so the parent being 300 wide doesn't change anything. To make the child as wide as the column, write `width = 100%` on the child. The parent has a fixed width (300), so 100% resolves to 300. To do the same for every child at once, write it on the layout instead: `layout: SimpleLayout [ axis = y, align = stretch ]`.

**2.** Write `align = stretch` on the layout:
`layout: SimpleLayout [ axis = y, align = stretch ]`. Don't use `width = 100%` on the children. A child sized from its parent doesn't count toward the parent's content size, so if both children were `100%` the parent would have no content width to measure. `align = stretch` leaves each child content-sized, so both still count toward the parent's width, which becomes the width of the wider one. The layout then stretches each child to fill that width.

**3.** I expect the compiler to refuse it. A child doesn't declare what the layout places. `flexes = true` is a request for the layout to set the child's size along the run, which in a row is `width`. Writing `width = 200` as well puts two owners on the same attribute, so I expect the compiler to reject it at that line and name the fix: keep one of the two. Use `flexes` to take the leftover room, or a fixed `width` (or a `minWidth`/`maxWidth` range together with `flexes`) for a size the child chooses. I'm less sure of the exact outcome here than for the other answers. The docs say directly that a child declaring a placed `x` is refused "in any spelling", and I'm assuming the same rule applies to a flexed size.

**4.**
```declare-fragment
panel: View [ width = { app.wide ? 300 : contentWidth },
    Text [ text = "Panel content" ]
    ]
```
`contentWidth` is the read-only intrinsic that holds what the content wants. The constraint gives 300 when `app.wide` is true and the content width otherwise, and it re-evaluates whenever `app.wide` changes.

**5.** Write `flexes = true` on the first child. It asks the layout for the leftover room along the run, which is width when the axis is `x` and height when it is `y`, so it works in both arrangements. Don't write the size along either axis on that child: no `width` and no `height`. Each one is the run's dimension in one of the two arrangements, so it would conflict with the flex. Also don't write `x` or `y`, because the layout places those. For the cross dimension, put `align = stretch` on the layout instead of setting a size on the child.

**6.** The second child is 120 wide. The parent has no width, so its width comes from its content. A child sized from its parent doesn't count toward the parent's content size on that axis, so the `100%` child is left out. The parent's width comes only from the 120-wide child, so the parent is 120. The `100%` child then resolves against that and is also 120.
