# Moving arrangements
<!-- index: a few sprung scalars driving a whole layout; TweenLayout -->

**Use when** a whole layout changes and should glide rather than cut: a month becoming a
week, a row becoming a stack, a list making room for an opened item.

```declare
class Cell [ cornerRadius = 10, fill = darkslategray, clip = true,
    col: number = { rowIndex % 7 },
    row: number = { Math.floor(rowIndex / 7) },
    x = { col * app.colW + 2 },
    y = { (row - app.r0) * app.rowH + 2 },
    width = { app.colW - 4 },
    height = { app.rowH - 4 },
    onClick() { app.pick(row) },
    n: Text [ x = 10, y = 5, fontSize = 12, textColor = gainsboro, text = { "" + (rowIndex + 1) } ]
    ]

App [ width = 420, height = 240, fill = black,
    mode: string = "month",
    anchorRow: number = 0,

    // the targets derive from the mode; two springs chase them; every cell reads the two
    r0To: number = { app.mode == "week" ? app.anchorRow : 0 },
    nrTo: number = { app.mode == "week" ? 1 : 3 },
    r0: number = 0,
    nr: number = 3,
    Spring [ attribute = r0, to = { app.r0To }, stiffness = 150, damping = 20 ],
    Spring [ attribute = nr, to = { app.nrTo }, stiffness = 150, damping = 20 ],

    colW: number = { (app.width - 32) / 7 },
    rowH: number = { (app.height - 32) / app.nr },

    // a view switch is one assignment
    pick(r: number) { if (app.mode == "month") { app.anchorRow = r; app.mode = "week" } else app.mode = "month" },
    grid: Dataset [ contents = { { cells: Array.from({ length: 21 }, (_, i) => ({ id: i })) } } ],

    board: View [ x = 20, y = 20, width = { app.width - 40 }, height = { app.height - 40 }, clip = true,
        datapath = { app.grid.value },
        Cell [ datapath = :cells[] ]
        ]
    ]
```

**Rules**
- Drive the arrangement with a few **sprung scalars**, not a spring per view. Every view's
  geometry is a constraint on those numbers, so each frame is a coherent layout and an
  interruption just re-aims the springs.
- A view switch is **one assignment** (`mode = "week"`); the spring targets derive from
  it.
- When the arrangement is a layout rather than a formula, extend `TweenLayout`: change its
  state and call `retarget(true)`; the children glide from where they are to where
  `place()` now puts them.
- Derive character from the same scalars (opacity, corner radius, which form a view
  shows), not just geometry, so things reshape as they move.
- A view that must hand over to another at the end of a motion should be congruent with
  it at the switch point (same box, same seats), read off one shared fact.

**Look up** `Spring`, `TweenLayout`, `TweenLayout.retarget`, `Layout.place`.

**Examples** `apps/calendar/calendar.declare`: four sprung scalars morph month, week and
day · `apps/weather/weather.declare`: `openT`, a row growing into the page ·
`apps/architecture/parts/ships.declare`: `Floorplan`, a `TweenLayout`.

**Guide** Animated arrangements (all four sections) · Reading the
calendar.
