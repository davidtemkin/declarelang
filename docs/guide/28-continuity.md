# Continuity: states and springs

This is the chapter the book has been building toward. States and springs look like two
features, but they are one mechanism — a state supplies the end-states, a spring moves the
surface between them, and the reactive core makes every in-between frame a coherent layout.
The whole thing rests on one idea:

> **Declare where things belong; motion is the runtime keeping it true.**

## A state is a reversible bundle of overrides

A `State` is a named set of attribute overrides — and conditional children — applied while a
condition holds, and reverted when it lifts:

```declare
App [ width = 360, height = 240, fill = #0B141B, textColor = whitesmoke,
    open: boolean = false,
    onMouseDown() { open = !open },
    card: View [ x = 28, y = 26, width = 300, height = 72, cornerRadius = 10, fill = midnightblue,
        Text [ x = 16, y = 16, fontWeight = bold, text = "Summary" ],
        big: State [ applied = { open }, height = 184, fill = steelblue,
            Text [ x = 16, y = 54, width = 268, textColor = gainsboro, wrap = true,
                text = "height, color, and this whole line swap in together" ],
            ],
        ],
    ]
```

While `open` holds, the height, the fill, and the extra `Text` all apply together; when it
lifts, they all revert. An attribute's value is a pure function of its base plus the active
states, so **a mode cannot leak** — the "set it on enter, forget to unset it on exit" bug is
unrepresentable. Overrides can target named descendants by dotted path (`top.bg.opacity =
0.33`), and when two active states set the same slot, the later declaration wins.

## A spring is physics on an attribute

A `Spring` drives one attribute toward a **reactive target** by physics — you declare where
the thing belongs, and the spring finds the path and settles. A change of target mid-flight
is just a new destination; interruption needs no code:

```declare
App [ width = 420, height = 120, fill = #0B141B,
    on: boolean = false,
    onClick() { on = !on },
    ball: View [ x = 20, y = 40, width = 40, height = 40, cornerRadius = 20, fill = #37E0C8,
        slide: Spring [ attribute = x, to = { on ? 340 : 20 }, stiffness = 170, damping = 22 ],
        ],
    ]
```

Because `to` is a live constraint, clicking again mid-slide simply retargets — the ball
eases from wherever it is toward the new destination, no tween to cancel. (`Animator [
attribute = x, to = 0, duration = 333 ]` is the time-based sibling for the rare case that
wants a clock instead of physics; springs are the house idiom.)

## The idiom: spring the scalars the geometry derives from

Here is where it becomes a new way to build interfaces. Layout, states, and springs all sit
on one reactive core, so *arrangement* animates for free: spring a handful of scalars, and
**every constraint derived from them moves in lock-step**. One sprung number, and a card
becomes a row:

```declare
App [ width = 360, height = 200, fill = white, textColor = black,
    open: boolean = false,
    t: number = 0,
    onClick() { open = !open },
    grow: Spring [ attribute = t, to = { open ? 1 : 0 }, stiffness = 150, damping = 22 ],
    card: View [ x = 24, y = 24, cornerRadius = 12, fill = #1E3A49,
        width  = { 200 + (1 - t) * 120 },
        height = { 44 + t * 110 },
        title: Text [ x = 16, y = 14, textColor = white, fontWeight = bold, text = "Signal" ],
        body: Text [ x = 16, textColor = #9FB4C2,
            y = { 44 + t * 20 },
            opacity = { t },
            text = "one sprung scalar; the geometry derives" ],
        ],
    ]
```

Nothing here animates a width or a height. One scalar `t` is sprung between 0 and 1, and the
width, the height, the body's position, and its opacity are all *constraints that read `t`*.
The morph is the reactive graph doing what it always does — keeping constraints true — while
one of their inputs is in motion. There is no keyframe list and no transition to define.

This is the §1 claim in mechanism form, and it is exactly how the calendar works at scale:
its month-to-week zoom is **four sprung scalars** (`c0, r0, nc, nr`) that every cell's
position and size derives from. A view there doesn't switch to the week view so much as
*become* it, because the same constraints that lay out the month are still true frame by
frame as those four numbers move. That is continuity as the grain of the language, not an
effect layered on top — [the capstone](declare-docs:guide:calendar) is the whole of it.

---

That closes the fundamentals. **Next:** Part III fills in the rest of the surface — text and
Markdown, the environment, and the house style — then Part IV is the loop:
[checking](declare-docs:guide:checking) and [shipping](declare-docs:guide:shipping).
