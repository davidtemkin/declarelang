# Part A — answers

**1.** The child is only as wide as its content: the width of the "hi" text run, nothing
wider. A size you leave unset comes from the content, and that is still true inside a layout.
Unlike flexbox, nothing stretches unless the layout says `align = stretch`, and
`SimpleLayout [ axis = y ]` alone doesn't say it. To make that one child as wide as the column,
write `width = 100%` on it. This works because the parent is a fixed 300, so the child can be
sized from it. To make every child as wide as the column, write
`layout: SimpleLayout [ axis = y, align = stretch ]` instead.

**2.** Write `align = stretch` on the parent's layout:
`layout: SimpleLayout [ axis = y, align = stretch ]`. Don't give the children any width. The
parent has no size, so its width comes from its children. That means the children can't size
themselves from it with `width = 100%`. That would be circular, and a child sized from its
parent doesn't count toward the parent's content width. `align = stretch` is the one-way route
the docs give: the parent becomes as wide as its widest child, and the layout then stretches
every child to that width.

**3.** This is a conflict. The docs say each of `x`, `y`, `width` and `height` has exactly one
decider. `flexes = true` asks the parent's layout to decide the width along the x run, and
`width = 200` makes the view decide its own width. A child never states what its parent's
layout decides. I expect the compiler to reject it with a diagnostic telling you to drop one of
the two. My guess is that it won't quietly pick a winner, but I couldn't run it to check. If you
meant "at least 200", tell the layout that fact instead: `flexes = true, minWidth = 200`. If you
meant exactly 200, drop `flexes`.

**4.** A size that only applies some of the time is a `State`. Don't use a ternary constraint,
because a constraint always decides the value and would take the width away from the content.
Leave `width` unset (so the content decides it) and override it while the condition holds:

```declare-fragment
panel: View [
    wideSize: State [ applied = { app.wide }, width = 300 ],
    Text [ text = "panel content" ]
    ]
```

When `app.wide` turns false, the state lifts and the width goes back to the content's.
(`app.wide` must be declared on the App, e.g. `wide: boolean = { width >= 600 }`.)

**5.** Write `flexes = true` on the child, and nothing else about its size. Don't write `width`
or `height` on it, whether as a constant, a `%` or a constraint. The run axis flips between x
and y, so in one of the two arrangements each of those is the size the layout decides when the
child flexes, and stating it would give that size a second decider. If the child should also
fill across the run, ask the layout with `align = stretch` rather than writing a size on the
child.

**6.** It is 120 wide. The parent has no width, so its width comes from its content: its
children's boxes. The `100%` child is sized from the parent, and a child sized from its parent
doesn't count toward the parent's content size on that axis. So only the 120-wide child counts,
the parent is 120 wide, and `100%` of that (of its content box, with no padding) is 120.
