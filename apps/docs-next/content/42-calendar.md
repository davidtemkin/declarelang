# Anatomy of the calendar

The whole book's claims, cashed against one real program you can run, read, and edit. This is
**not** a line-by-line read — the calendar is about 700 lines, and most of them are ordinary.
Instead, four load-bearing mechanisms carry the parts that look impossible, and each is a
small idea you have already met. Open the live source alongside this chapter
(`apps/calendar/calendar.declare` at `?view=reader`) and read the excerpts against it.

Frame it honestly: this is the language's **ceiling, not its floor**. You will not write code
this dense often. But nothing here is a trick — it is the same reactive graph from
[chapter 21](declare-docs:guide:constraints), pushed.

## 1. The focus rectangle: four sprung scalars

Month, week, and day are not three layouts. They are one grid seen through a **focus
rectangle** — where it starts (`c0`, `r0`) and how many columns and rows it spans (`nc`, `nr`).
Those four numbers are sprung; everything else is a constraint that reads them:

```declare-fragment
c0To: number = { app.mode == "day" ? app.anchorCol : 0 },
ncTo: number = { app.mode == "day" ? 1 : 7 },
nrTo: number = { app.mode == "week" || app.mode == "day" ? 1 : app.monthRows },
c0: number = 0,  nc: number = 7,  nr: number = 6,
Spring [ attribute = c0, to = { app.c0To }, stiffness = 150, damping = 24 ],
Spring [ attribute = nc, to = { app.ncTo }, stiffness = 150, damping = 24 ],
Spring [ attribute = nr, to = { app.nrTo }, stiffness = 150, damping = 24 ],
colW: number = { (app.bodyW - 2 * app.pad - app.gutter) / app.nc },
rowH: number = { (app.bodyH - app.headH) / app.nr },
```

Switching to week sets `nrTo` to 1; the spring eases `nr` from 6 to 1; `rowH` — a constraint
reading `nr` — grows in lock-step, and every cell's position, which reads `colW`/`rowH`,
follows. The month doesn't cut to the week; it *becomes* it, because the same constraints stay
true frame by frame as four numbers move. This is [chapter 28](declare-docs:guide:continuity)'s
"spring the scalars the geometry derives from," at full scale.

## 2. A mode is a number you derive, not a flag you manage

There is no `isTimeView` boolean anywhere. Whether the calendar shows month-style chips or
day/week time-blocks is itself *derived* from the sprung geometry:

```declare-fragment
blockness: number = { app.clamp((app.rowH - 240) / 300, 0, 1) },   // 0 = month chips, 1 = time blocks
gutter:    number = { app.blockness * 52 },                        // the hour gutter opens in time views
```

`blockness` reads `rowH`, which reads `nr`, which is sprung — so as the view zooms, `blockness`
slides continuously from 0 to 1, and everything keyed off it (the gutter, an event's shape, its
label) morphs *with* the motion instead of snapping at a threshold. A managed flag would flip;
a derived scalar flows. That is why the transition has no seams.

## 3. The model is derived; navigation just sets state

The grid's data is not built and rebuilt by navigation code. It is a **derived dataset** that
recomputes from the visible month, with keyed replication so a recompute costs only the days
that changed:

```declare-fragment
cal: Dataset [ contents = { app.buildModel() } ],
// consumed by:  View [ datapath = :cells[], key = :key, … ]   and   Ev [ datapath = :events[], key = :id ]
```

Paging to next month sets one number; `buildModel` re-derives; keyed replication reconciles.
There is no "rebuild the grid" function to call and no list to diff — navigation is
[chapter 27](declare-docs:guide:data)'s "point a cursor at the data; the tree derives," and
"navigation is a function of state" made literal.

## 4. A drop is just an edit

Drag-to-reschedule looks like the most imperative thing in the app. It isn't: a drop inverts
the screen point to a grid cell and writes the new date through `data.set` — and because the
model is derived, that write wakes it like any other edit:

```declare-fragment
commitDrop(px, py) {
    const idx = app.data.value.events.findIndex(e => e.id == this.dragId)
    const p = "events." + idx + "."
    const d = app.parseKey(this.cellAt(px, py).key)        // invert the span mapping: point → cell
    app.data.set(p + "y", d.getFullYear())                 // one write per field…
    app.data.set(p + "m", d.getMonth() + 1)
    app.data.set(p + "d", d.getDate())                     // …and the derived grid re-lays itself
    },
```

No code moves the event view. The `data.set` writes wake exactly the constraints that read
those fields; keyed replication rebuilds the one changed day; the event reappears in its new
cell. The [drag mechanics](declare-docs:guide:interaction) are down/move/up with a threshold;
the *reschedule* is one edit to derived data.

## What to take from it

Four ideas — sprung scalars, derived modes, a derived model, edits through `data.set` — carry
the parts of the calendar that look hard, and every one is a Part II concept under load. Read
the rest of the source at `?view=reader`; it is written to be read. What makes the calendar
possible is not a special calendar feature. It is that layout, motion, state, and data all sit
on one reactive graph — so continuity is the grain of the language, and a real application is
the reward for having built on it.
