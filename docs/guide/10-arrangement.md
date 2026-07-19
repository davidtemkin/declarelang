<!-- nav: Arrangement -->
<!-- part: Continuity -->

# Arrangement animates

Chapter 1 showed a card that becomes a panel: one sprung scalar, three constraints
reading it. This chapter is that idea grown up — the signature idiom of the language,
and the one that separates it from every stack where animation is a layer:

> **Spring a few scalars; derive all geometry from them; and every arrangement
> change glides, in lock-step, interruptibly, for free.**

The reasoning is direct. Constraints stay true
([chapter 3](declare-docs:guide:relationships)). A spring moves a value continuously
([chapter 9](declare-docs:guide:motion-and-modes)). So if every position and size in
an arrangement is a constraint reading a handful of sprung values, then moving those
values *is* rearranging the interface — and every in-between frame is a real layout,
because the same constraints hold at every instant. Nothing "transitions." The truth
just moves, and the interface stays true to it.

## A month becomes a week

Here is the calendar's signature view-morph, at toy scale so you can see the whole
mechanism at once. Twenty-one cells, and exactly **two sprung scalars**: `r0` (which
row the focus starts at) and `nr` (how many rows are in view). Click a cell to zoom
its row into a "week"; click again to fall back to the "month" — and, as always,
interrupt it mid-flight:

```declare
class Cell extends View [ cornerRadius = 6, fill = #18242F, clip = true,
    x = { :col * app.colW + 2 },
    y = { (:row - app.r0) * app.rowH + 2 },
    width = { app.colW - 4 },
    height = { app.rowH - 4 },
    onClick() { app.pick(:row) },
    n: Text [ x = 8, y = 6, fontSize = 12, textColor = #C7D3DC, text = { "" + :n } ],
    ]

App [ width = 420, height = 240, fill = #0D151E,
    mode: string = "month",
    anchorRow: number = 0,

    r0To: number = { app.mode == "week" ? app.anchorRow : 0 },
    nrTo: number = { app.mode == "week" ? 1 : 3 },
    r0: number = 0,
    nr: number = 3,
    Spring [ attribute = r0, to = { app.r0To }, stiffness = 150, damping = 24 ],
    Spring [ attribute = nr, to = { app.nrTo }, stiffness = 150, damping = 24 ],

    colW: number = { (app.width - 32) / 7 },
    rowH: number = { (app.height - 32) / app.nr },

    pick(r) { if (this.mode == "month") { this.anchorRow = r; this.mode = "week" } else this.mode = "month" },
    cells() {
        const out = []
        for (let i = 0; i < 21; i++) out.push({ n: i + 1, col: i % 7, row: Math.floor(i / 7) })
        return { cells: out }
        },
    grid: Dataset [ contents = { app.cells() } ],

    board: View [ x = 16, y = 16, width = { app.width - 32 }, height = { app.height - 32 }, clip = true,
        datapath = { grid.value },
        Cell [ datapath = :cells[], key = :n ],
        ],
    ]
```

Read the mechanism off the source, because it is all there. A view switch is **one
assignment** — `pick` sets `mode`, nothing else. The spring *targets* (`r0To`,
`nrTo`) derive from the mode; the springs chase them; and every cell's `y` and
`height` are constraints reading `r0` and `nr` — so as two numbers glide, twenty-one
cells rearrange in perfect lock-step, the focused row swelling to fill the board
while the others slide out past the clip. The month doesn't cut to the week. It
*becomes* it — and mid-morph, every frame is a coherent layout, because no frame is
anything other than the constraints, holding.

This is precisely how the real calendar works — four sprung scalars instead of two
(columns too), forty-two cells instead of twenty-one, and events that reshape from
chips into time-blocks as their row grows. Not a different technique at scale; the
same one, with more constraints reading the same few moving numbers.

## Deriving character, not just geometry

The idiom's second power: *qualities* can derive from the same scalars. The calendar
never stores "are we in a time view?" — it derives a continuous `blockness` from the
sprung row height, and everything that distinguishes a time view (the hour gutter,
an event's shape) reads it. So those qualities morph *with* the motion instead of
snapping at a threshold. A managed flag flips; a derived scalar flows. When you find
yourself about to declare `isExpanded: boolean` next to a spring, ask whether the
truth you want is already a function of the motion.

## Designing for continuity

Now the honest part, promised in chapter 1: the language lowers the implementation
barrier, not the design bar. The mechanism is three declarations; the *thinking* is
where the craft lives, and it has a discipline:

- **Choose the scalars.** What should the user see persist through the change? The
  focus rectangle answers "these same cells, framed differently." Your scalars are
  that answer, made numeric — and if you can't say what persists, no spring will
  say it for you.
- **Derive; never duplicate.** The moment two constraints encode the same fact
  independently, they can disagree mid-motion. One source, everything reading it —
  the discipline of [chapter 3](declare-docs:guide:relationships), now load-bearing
  at 120 frames a second.
- **Design the endpoints; audit the middle.** You declare the end states, but users
  *live* in the in-betweens — drag the toy above halfway and look. Because every
  frame is a real layout, the middle is inspectable, and worth inspecting.

None of this is a burden unique to Declare — it is the same design thinking the best
native software required all along. What's different is that here, expressing the
answer costs a handful of declarations instead of a specialist's month.

---

**What you can now say:** you can make an interface's *arrangement* — not just its
attributes — move as one continuous, interruptible whole, and you know the
discipline that makes such motion mean something. That is the capability this
language was built to make ordinary.

[Next: **Run it, check it, ship it** →](declare-docs:guide:loop)
