# Part A — predictions

**1.** The child is only as wide as the text "hi" (its `Text` run), not 300. Its width is
unset, and an unset size comes from the content, inside a layout too. Unlike flexbox,
`SimpleLayout` stretches nothing unless it says `align = stretch`, and the column's 300 does
not pass down to the child. To make it as wide as the column, give that child `width = 100%`.
The parent has a fixed width, so this reads a known box, or the parent's content box if it
has `padding`. To stretch every child instead, write
`layout: SimpleLayout [ axis = y, align = stretch ]` on the parent.

**2.** Write it on the parent's layout: `layout: SimpleLayout [ axis = y, align = stretch ]`.
Write nothing on the children. The parent takes its width from its children, so the children
cannot also take theirs from the parent. `width = 100%` on them would be circular: a child
sized from its parent does not count toward the parent's content width, so the parent would
have nothing to size from. `align = stretch` is the documented way out. The layout sees every
child, sizes the parent to the widest, and makes each child that wide.

**3.** This is a conflict. Each of `x`, `y`, `width` and `height` has exactly one decider.
`flexes = true` hands the width along an x run to the layout, and `width = 200` says the child
decides it. A child should never state what its parent's layout decides. I expect the compiler
to refuse this with a diagnostic naming the rewrite. If it doesn't refuse, the 200 is not
respected as a fixed width. Pick one: drop `flexes` to get a fixed 200, or keep `flexes` and
turn the 200 into a bound the layout respects, such as `minWidth = 200` or `maxWidth = 200`.

**4.** A constraint always decides, so `width = { app.wide ? 300 : … }` can't mean "the
content's width" in one branch. A size that holds only sometimes is a `State`. When the state
lifts, `width` goes back to unset, which means the content decides:

```declare-fragment
panel: View [
    wide: State [ applied = { app.wide }, width = 300 ],
    Text [ text = "panel content" ]
    ]
```

**5.** Write `flexes = true` on the first child. `flexes` is relative to the run, so the same
fact means "take the leftover width" in the row and "take the leftover height" in the column.
Do not write `width` or `height` on it, whether as a constant, a percentage or a constraint.
Whichever axis is the run at the moment is the layout's to decide. A fixed `width` would
conflict in the row and a fixed `height` in the column, and the error would only appear when
`app.wide` flips. If it needs a limit, give it `minWidth`/`maxWidth` (or the heights), which
the layout respects.

**6.** It is 120 wide. The parent has no width, so its width comes from its content. A child
sized from its parent does not count toward the parent's content size on that axis, however it
is written, so the `width = 100%` child is left out. The parent's width therefore comes from
the 120-wide child alone. The `100%` child then resolves against that box and is also 120 wide.
