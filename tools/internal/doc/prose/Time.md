The **clock as a member**: declare one and the current time becomes reactive facts any
`{ }` derives from — `now` (the instant, epoch milliseconds) and the local-zone
components `year month day hour minute second weekday` — plus `onTick(dt)`, the one
per-frame handler, for integration. The world outside the program comes in as a member
(`Keys`, `DataSource`, a `Stream`), and so does the clock: a `{ }` that reads
`new Date()` is a stopped clock — nothing it read has a cell behind it, so it evaluates
once and never again (the compiler warns) — while a `{ }` that reads `clock.minute`
wakes when the minute turns.

`tick` names the resolution — `frame | second | minute | hour | day`. The calendar tiers
are **aligned** alarms: `minute` fires when the minute turns, not sixty seconds after
boot, so a clock built on it is right at the flip; a page asleep for an hour gets one
tick on return. `frame` rides the one shared clock every animator uses (no second frame
loop) and updates `now` per frame, for anything that is a pure function of the current
time — a stopwatch readout, a countdown, progress toward a deadline.

Two doors, keyed to the *shape* of the dependence: a value that is a pure function of
now derives from a fact; a value whose next step depends on its previous — physics, a
custom scroll engine, a simulation — integrates in `onTick(dt)`. Motion toward a
destination is neither: that is a `Spring` or an `Animator`. A per-frame `onTick` that
ignores `dt` to check whether something has happened yet is polling, and the compiler
says so.

Facts are **numbers, never strings** — `month` 1–12, `weekday` 1–7 with Monday first
(Temporal's conventions). Formatting and localization are the app's: a subclass
attribute over the facts, or `new Date(this.now)` and `Intl`. Inside a `{ }` the facts
are as of the last tick — the resolution you declared; in a handler they are live,
sampled at that moment. Idle-zero: nothing ticks until a fact is tracked or an `onTick`
exists, and a hidden page (`app.pageVisible`) pauses it — a merely hidden view does not
(visibility gates layout and input, never derivation; write `running = { this.visible }`
for that). Lifetime is the node's: a discarded subtree leaves no alarm and no frame loop
behind.

Subclassable, like any Node — `class DesktopClock extends Time [ tick = minute,
text: string = { … this.hour … this.minute … } ]` is the intended way to make it yours.

```declare
App [ width = 240, height = 120, fill = midnightblue, textColor = whitesmoke,
    clock: Time [ tick = second ],
    face: Text [ x = 20, y = 16, fontSize = 22,
        text = { app.clock.hour + ":" + (app.clock.minute < 10 ? "0" : "") + app.clock.minute + ":" + (app.clock.second < 10 ? "0" : "") + app.clock.second } ],
    x0: number = 20,
    physics: Time [ tick = frame, onTick(dt: number) { app.x0 = (app.x0 + 60 * dt) % 200 }
        ],
    dot: View [ x = { app.x0 }, y = 70, width = 30, height = 30, cornerRadius = 15,
        fill = turquoise ]
    ]
```

## tick
The resolution: `frame | second | minute | hour | day`; default `second`. The calendar
tiers aim at the boundary (aligned, drift-free); `frame` follows the display. Changing
it re-arms.

## running
The live gate — `running = { app.simulating }` is the idiom; default true. The first
frame after a start is the baseline and reports no step.

## now
The instant, epoch milliseconds — per frame at `tick = frame`, at the flip otherwise.

## year
The local-zone year.

## month
The local-zone month, 1–12.

## day
The day of the month, 1–31.

## hour
The local-zone hour, 0–23.

## minute
0–59.

## second
0–59.

## weekday
1–7, Monday = 1 (ISO, as Temporal).

## onTick
`onTick(dt)` — one call per tick while `running`, with the seconds elapsed since the
previous tick, clamped to about one tick (≈1/15 s at `frame`; one period on the
calendar tiers, so a page returning from an hour hidden gets 60, not 3600). Three
consecutive throws stop the Time, loudly, naming the node; `running = true` restarts it.
