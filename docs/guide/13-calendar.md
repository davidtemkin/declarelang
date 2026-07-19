<!-- nav: Declare Calendar -->
<!-- part: In practice -->

# Declare Calendar

Chapter 1 made a promise: that you would end this guide by opening a real calendar
application — four views, continuous zoom, drag-to-reschedule; 480 lines of code,
about seven hundred with its detailed comments — and understanding all of it. This is that chapter. Run the app first:
`apps/calendar/calendar.declare` in your running distro, or the **Run Declare
Calendar** button on the homepage. Switch Month to Week to Day to Year. Drag an
event somewhere else. Click one open and edit it. Interrupt every transition
halfway. Then open the source beside this chapter — `?viewer=reader` on the same URL
gives you the annotated reading view.

This is not a line-by-line walk, because you don't need one — most of the file is
composition you have been writing since Part Two: bar chrome, theme records, a
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
ncTo: number = { app.mode == "day" ? 1 : 7 },
nrTo: number = { app.mode == "week" || app.mode == "day" ? 1 : app.monthRows },
Spring [ attribute = c0, to = { app.c0To }, stiffness = 150, damping = 24 ],
Spring [ attribute = nc, to = { app.ncTo }, stiffness = 150, damping = 24 ],
Spring [ attribute = nr, to = { app.nrTo }, stiffness = 150, damping = 24 ],
colW: number = { (app.bodyW - 2 * app.pad - app.gutter) / app.nc },
rowH: number = { (app.bodyH - app.headH) / app.nr },
```

You built exactly this in [chapter 10](declare-docs:guide:arrangement), with two
scalars and twenty-one cells. Here it is with four and forty-two. Switching views is
one assignment to `mode`; the targets re-derive, the springs chase, and every cell's
geometry — a constraint reading `colW`/`rowH` — follows in lock-step. Now connect it
to [chapter 9](declare-docs:guide:motion-and-modes)'s argument, in the running app:
when you click **Week**, watch what your eyes do. Nothing. You never lose the day
you were looking at, because it never ceases to exist — *that* is continuity keeping
the user oriented, delivered by a mechanism you can now write from memory.

## 2. A mode is a number you derive, not a flag you manage

There is no `isTimeView` boolean anywhere in the file. Whether the calendar shows
month-style chips or day/week time-blocks is itself *derived from the sprung
geometry*:

```declare-fragment
blockness: number = { app.clamp((app.rowH - 240) / 300, 0, 1) },   // 0 = month chips, 1 = time blocks
gutter:    number = { app.blockness * 52 },                        // the hour gutter opens in time views
```

`blockness` reads `rowH`, which reads `nr`, which is sprung — so as the view zooms,
"how much of a time view is this?" slides continuously from 0 to 1, and everything
keyed off it (the hour gutter, each event's shape, its label) morphs *with* the
motion instead of snapping at a threshold. This is chapter 10's "derive character,
not just geometry," and it is why the transitions have no seams — and why an event
mid-morph is *telling you what it's becoming*: motion carrying meaning, not
decoration.

## 3. The model is derived; navigation just sets state

The grid's data is never built and rebuilt by navigation code. It is a **derived
dataset** recomputing from the visible month, with keyed replication so a recompute
costs only the days that changed:

```declare-fragment
cal: Dataset [ contents = { app.buildModel() } ],
// consumed by:  Cell [ datapath = :grid[], key = :key ]   and   Ev [ datapath = :events[], key = :id ]
```

Paging to the next month sets one number; `buildModel` re-derives; keyed replication
reconciles. This is [chapter 8](declare-docs:guide:data)'s board — raw truth,
derived model, edits as writes — at full scale. "Navigation," which in your current
stack is a subsystem, is here three assignments and a derivation.

## 4. A drop is just an edit

Drag-to-reschedule looks like the most imperative thing in the app. It is the drag
pattern from [chapter 7](declare-docs:guide:interaction) — down, move past a
threshold, up — and then a drop is *one edit to the data*:

```declare-fragment
commitDrop(px, py) {
    const idx = app.data.value.events.findIndex(e => e.id == this.dragId)
    const p = "events." + idx + "."
    const d = app.parseKey(this.cellAt(px, py).key)        // invert the mapping: point → cell
    app.data.set(p + "y", d.getFullYear())
    app.data.set(p + "m", d.getMonth() + 1)
    app.data.set(p + "d", d.getDate())                     // …and the derived grid re-lays itself
    },
```

No code moves the event's view. The writes wake exactly the constraints that read
those fields; keyed replication rebuilds the one changed day; the event appears in
its new cell. And because the whole surface stays live through it, you can grab an
event *during* a view transition and the app never stumbles — interruptibility
respecting intent, all the way down, because nothing anywhere is a scheduled
sequence that could be caught halfway.

## What you just did

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

Write something. `my-apps/` is yours, the [getting-started
page](declare-docs:operational:getting-started) is the five-minute setup, and the
board from [chapter 8](declare-docs:guide:data) is a good skeleton to grow. Keep
[`declare.md`](declare-docs:spec:core) at hand — the whole language, one file, for
you and your LLM both. The [reference](declare-docs:reference:index) has every
attribute of every component. And when you hit something rough or wrong — the
language is young, and shaped by exactly this — [say
so](https://github.com/davidtemkin/declarelang/issues). The corpus will come. You're
early. That's the fun of it.
