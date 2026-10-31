# Part A — answers

**1.** The child is only as wide as the text "hi" (plus any padding it has). A size you don't set comes from the content, and that's still true inside a layout. `SimpleLayout` doesn't stretch anything unless it says `align = stretch`. To make the child as wide as the column, put the stretch on the layout: `layout: SimpleLayout [ axis = y, align = stretch ]`. Every child is then as wide as the column, and the child itself doesn't state a width. The parent has a fixed width (300), so `width = 100%` on that one child would also work. Use it when only that child should be full width.

**2.** On the parent's layout, write `layout: SimpleLayout [ axis = y, align = stretch ]` and leave both children without a width. The parent has no width, so it takes its width from its children, which means it can't also size them. `align = stretch` is the one way to make children "as wide as the widest." Writing `width = 100%` on the children doesn't work, because a child sized from its parent doesn't count toward the parent's content width. The parent would then have nothing to measure.

**3.** The two settings conflict. A child's width along an x run has one decider. `flexes = true` hands that decision to the parent's layout, and `width = 200` makes the child the decider. A child never states what its parent's layout decides. I expect the compiler to reject this with a diagnostic that names the fix: either drop `width` and keep `flexes`, using `minWidth`/`maxWidth` to bound the flex if needed, or drop `flexes` and keep the fixed 200. I couldn't run the compiler, so I can't say exactly what message it gives.

**4.** A size that holds only some of the time is a `State`. It's not a ternary constraint, because a constraint always decides the value and there's no way to write "content width" as its other branch:

```declare-fragment
panel: View [
    wide: State [ applied = { app.wide }, width = 300 ],
    Text [ text = "Panel" ]
    ]
```

When `app.wide` is false the state lifts, `width` goes back to unset, and the panel is as wide as its content again.

**5.** Write only `flexes = true` on the first child. That is a fact about the child, and the layout applies it along whichever axis is the run right now. Don't write `width` or `height` on it, not even as a constraint or inside a `State`. Each of those is the run-axis size in one of the two arrangements, so setting either one competes with the layout's flex in that arrangement. If you want the child to fill the cross axis, use `align = stretch` on the layout, not a size on the child.

**6.** The second child is 120 wide. The parent has no width, so its width comes from its content. A child sized from its parent (`width = 100%`) doesn't count toward that content width. The only child that counts is the 120-wide one, so the parent is 120 wide, and `100%` of that is 120. This assumes no padding: with padding, `100%` means the content box, which is still 120.
