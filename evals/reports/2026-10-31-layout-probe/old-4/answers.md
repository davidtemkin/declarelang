# Part A — answers

**1.** The child is only as wide as its content, which is the width of the text "hi". It has no
size set, and an unset size comes from its content (§6). A `SimpleLayout` with `axis = y` places
the child's `y`. It does not give the child a width. To make every content-sized child as wide as
the column, write `align = stretch` on the layout:
`layout: SimpleLayout [ axis = y, align = stretch ]`. That "makes what its content would size fill
the view across" (§4). For this one child you could instead write `width = 100%` on it. The
parent has a width of 300, so `100%` is well defined.

**2.** Write `align = stretch` on the parent's layout:
`layout: SimpleLayout [ axis = y, align = stretch ]`. Do not write `width = 100%` on the children.
A child sized from its parent does not count toward the parent's content size on that axis (§6).
If both children were `100%`, nothing would give the parent a width. Stretch works the other way.
Each child is still content-sized, so the parent takes the width of the wider one. The layout
then makes both children fill that width.

**3.** This is a conflict, and I expect the compiler to refuse it at the child's line. With
`flexes = true` the child asks the layout to set its size along the run, which is `width` in a
row. A layout places things, and a child may not also declare what the layout places (§4).
Writing `width = 200` states a second, competing size. If 200 is meant as a floor, write
`flexes = true, minWidth = 200`. If 200 is meant as the size, drop `flexes`.

**4.** Leave `width` unset in the base, so the panel is content-sized, and apply 300 through a
state. When the state lifts, the width goes back to unset:

```declare-fragment
panel: View [
    wide: State [ applied = { app.wide }, width = 300 ],
    Text [ text = "Panel" ]
    ]
```

A constraint does the same job: `width = { app.wide ? 300 : contentWidth }`.

**5.** Write `flexes = true` on the child and nothing else about its geometry. Do not write
`width` or `height`, because one of them is the run axis in each arrangement. A fixed size there
would compete with the flex in one of the two layouts. Do not write `x` or `y` either, because
the layout places them. If the child must fill across the run as well, write `align = stretch`
on the layout, not a size on the child.

**6.** The second child is 120 wide. The parent has no width, so its width comes from its
content. The `100%` child is sized from its parent, so it does not count toward that content
(§6). The only child that counts is the 120-wide one, which makes the parent 120 wide. The second
child is 100% of that, which is 120. This assumes the parent has no padding. With padding,
`100%` means the parent's content box.
