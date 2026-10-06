<!-- nav: Reading the calendar -->
<!-- part: Shipping and working -->

# Reading the calendar

[Core concepts](declare-docs:guide:what-declare-is) made a promise: that you would end this guide by opening a real calendar
application — four views, continuous zoom, drag-to-reschedule; <!--stat:calendar.code-->491<!--/stat--> lines of code, about <!--stat:calendar.total-->834<!--/stat--> with its detailed comments — and understanding all of it. This is that chapter. Run the app first:
`apps/calendar/calendar.declare` in your running distro, or the **Run Declare
Calendar** button on the homepage. Switch Month to Week to Day to Year. Drag an
event somewhere else. Click one open and edit it. Interrupt every transition
halfway. Then open the source beside this chapter — `?viewer=reader` on the same URL
gives you the annotated reading view.

This is not a line-by-line walk, because you don't need one — most of the file is
composition covered in the Building part: bar chrome, theme records, a
detail panel, replicated cells. What the walk covers is the four load-bearing
mechanisms that make the parts that *look impossible* — and each one is a chapter of
this guide, under load. Framed honestly: this program is the language's **ceiling,
not its floor**. You will not write code this dense often. But nothing here is a
trick.

## 1. The focus rectangle: four sprung scalars

Month, week, and day are not three layouts. They are **one grid seen through a focus
rectangle** — where it starts (`c0`, `r0`), how many columns and rows it spans
(`nc`, `nr`). Those four numbers are sprung; everything else derives:

```declare-fragment
c0To: number = { app.mode == "day" ? app.anchorCol : 0 },
r0To: number = { app.mode == "week" || app.mode == "day" ? app.anchorRow : 0 },
ncTo: number = { app.mode == "day" ? 1 : 7 },
nrTo: number = { app.mode == "week" || app.mode == "day" ? 1 : app.monthRows },
Spring [ attribute = c0, to = { app.c0To }, stiffness = 150, damping = 24, mass = 0.9, epsilon = 0.002 ],
Spring [ attribute = r0, to = { app.r0To }, stiffness = 150, damping = 24, mass = 0.9, epsilon = 0.002 ],
Spring [ attribute = nc, to = { app.ncTo }, stiffness = 150, damping = 24, mass = 0.9, epsilon = 0.002 ],
Spring [ attribute = nr, to = { app.nrTo }, stiffness = 150, damping = 24, mass = 0.9, epsilon = 0.002 ],
colW: number = { (app.bodyW - 2 * app.pad - app.gutter) / app.nc },
rowH: number = { (app.bodyH - app.headH) / app.nr }
```

You built exactly this in [Animated arrangements](declare-docs:guide:animated-arrangements@sprung-scalars-driving-a-layout), with two
scalars and twenty-one cells. Here it is with four and forty-two. Switching views is
one assignment to `mode`; the targets re-derive, the springs chase, and every cell's
geometry — a constraint reading `colW`/`rowH` — follows in lock-step. Now connect it
to the argument in [Motion and states](declare-docs:guide:motion), in the running app:
when you click **Week**, watch what your eyes do. Nothing. You never lose the day
you were looking at, because it never ceases to exist — *that* is continuity keeping
the user oriented, delivered by a mechanism you can now write from memory.

## 2. The view mode

There is no `isTimeView` boolean anywhere in the file. Whether the calendar shows
month-style chips or day/week time-blocks is itself *derived from the sprung
geometry*:

```declare-fragment
blockness: number = { app.clamp(2 - app.nr, 0, 1) },   // 0 = month chips, 1 = time blocks
gutter:    number = { app.blockness * 52 }              // the hour gutter opens in time views
```

`blockness` reads `nr`, the number of rows in focus, which is sprung. It is keyed on
that span and never on pixel height: one focused row *is* a time view, on a short
landscape screen as on a tall monitor. As the view zooms from two rows in focus to one,
"how much of a time view is this?" slides continuously from 0 to 1, and everything
keyed off it (the hour gutter, each event's shape, its label) morphs *with* the
motion instead of snapping at a threshold. This is [Animated arrangements](declare-docs:guide:animated-arrangements@deriving-appearance-from-the-scalars)' "derive character,
not just geometry," and it is why the transitions have no seams — and why an event
mid-morph is *telling you what it's becoming*: motion carrying meaning, not
decoration.

## 3. The derived model

The grid's data is never built and rebuilt by navigation code. It is a **derived
dataset** recomputing from the visible month, with keyed replication so a recompute
costs only the days that changed:

```declare-fragment
cal: Dataset [ contents = { app.buildModel() } ]

// consumed by:  Cell [ datapath = :grid[], key = :key ]   and   Ev [ datapath = :events[], key = :id ]
```

Paging to the next month sets one number; `buildModel` re-derives; keyed replication
reconciles. This is [Data](declare-docs:guide:data@data-in-a-whole-app)'s board — raw truth,
derived model, edits as writes — at full scale. "Navigation," which in your current
stack is a subsystem, is here three assignments and a derivation.

## 4. Drag and drop

Drag-to-reschedule looks like the most imperative thing in the app. It is the drag
pattern from [Pointer and keyboard](declare-docs:guide:pointer-and-keyboard@dragging) — down, move past a
threshold, up — and then a drop is *one edit to the data*:

```declare-fragment
commitDrop(px: number, py: number) {
    const events = app.data.value != null ? app.data.value.events : []
    const idx = events.findIndex(e => e.id == this.dragId)
    if (idx < 0) return
    const ev = events[idx], p = ["events", idx]
    const cell = this.cellAt(px, py)                       // invert the mapping: point → cell
    if (cell != null) { const d = app.parseKey(cell.key); app.data.set([...p, "y"], d.getFullYear()); app.data.set([...p, "m"], d.getMonth() + 1); app.data.set([...p, "d"], d.getDate()) }
    if (this.blockness > 0.5) {                            // a time view: the drop height is the new start
        const dur = ev.end - ev.start
        let s = Math.round(((py - this.barH - this.headH - this.grabDY) / this.rowH * 1440) / 15) * 15
        s = app.clamp(s, 0, 1440 - dur); app.data.set([...p, "start"], s); app.data.set([...p, "end"], s + dur)
        }
    }
```

In a time view the same drop also moves the event's hours, read off the drop height
with the same mapping run backwards. No code moves the event's view. The writes wake exactly the constraints that read
those fields; keyed replication rebuilds the one changed day; the event appears in
its new cell. And because the whole surface stays live through it, you can grab an
event *during* a view transition and the app never stumbles — interruptibility
respecting intent, all the way down, because nothing anywhere is a scheduled
sequence that could be caught halfway.

## Summary

Read the rest of the file at `?viewer=reader`; it is written to be read, and none of
it will surprise you now. Then sit with what happened here. Four mechanisms — sprung
scalars, derived character, a derived model, edits as writes — carry everything that
looks impossible, and every one is a concept from this guide doing its ordinary job
at scale. The calendar has no calendar feature. It has the language.

That is the claim the whole guide has been cashing — here as a few hundred readable
lines, written by an LLM under a person's direction, verified by the toolchain, and
understood by you in a sitting. The floor of this language is ordinary interfaces
with less machinery. This was the ceiling.

## Where next

Write something. `my-apps/` is yours, [Running and checking](declare-docs:guide:run-and-check)
has the setup, and the board from [Data](declare-docs:guide:data@data-in-a-whole-app) is a good skeleton to grow. Keep
[`declare.md`](declare-docs:spec:core) at hand — the whole language, one file, for
you and your LLM both. The [reference](declare-docs:reference:index) has every
attribute of every class. And when you hit something rough or wrong — the
language is young, and shaped by exactly this — [say
so](https://github.com/davidtemkin/declarelang/issues). The corpus will come. You're
early. That's the fun of it.
