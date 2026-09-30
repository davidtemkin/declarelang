# Time
<!-- index: clocks, repeating jobs, afterDelay, one-time actions on change -->

**Use when** something depends on the clock or on waiting: a clock face, "3 minutes
ago", a refresh every 30 seconds, a debounce, a notice that dismisses itself.

```declare
App [ width = 320, height = 180, fill = white,
    // the clock as a member: its facts are reactive, at the resolution you ask for
    clock: Time [ tick = minute ],
    face: Text [ x = 20, y = 20, fontSize = 24,
        text = { app.clock.hour + ":" + (app.clock.minute < 10 ? "0" : "") + app.clock.minute } ],

    // a repeating job: a period in milliseconds, gated on a fact
    feed: DataSource [ url = "/api/news" ],
    poll: Time [ tick = 30000, running = { app.feed.loaded }, onTick() { app.feed.fetch() } ],

    // later, once: wait for typing to pause
    query: string = "",
    searched: string = "",
    field: TextInput [ x = 20, y = 70, width = 240, placeholder = "Search",
        onInput(v: string) {
            app.query = v
            afterDelay(300, () => { if (app.query == v) app.searched = v })
            } ],
    onInit() { app.feed.fetch() }
    ]
```

**Rules**
- The clock is a member: `Time [ tick = … ]`. Its facts (`now`, `year` … `second`,
  `weekday`) are numbers any constraint reads. Choose the coarsest `tick` you need:
  `frame`, `second`, `minute`, `hour`, `day` (aligned to the clock), or milliseconds for
  a repeating job.
- `new Date()` in a `{ }` is a stopped clock: it reads nothing that changes, so it
  evaluates once. Read a `Time` fact instead.
- A pure function of now is a constraint on `now` (a stopwatch readout); a value whose
  next step depends on the last (physics) integrates in `onTick(dt)`, `dt` in seconds.
- Once, later: `afterDelay(ms, fn)`, from a handler. The wait belongs to the node and is
  cancelled with it. `setTimeout`, `setInterval` and `Date`-polling loops are refused.
- Before waiting, ask what you're waiting for: data is `source.loaded`, placement is
  `afterSettle`, motion is `spring.arrived`. All are values a constraint can read.
- A change that must cause a one-time action (mark read, fetch on selection) is
  `trackChanges = [ … ]` with `onChange(e)`; everything that merely follows is a
  constraint.

**Look up** `Time`, `Time.tick`, `Time.now`, `Time.onTick`, `afterDelay`,
`Node.trackChanges`, `Node.onChange`.

**Examples** `apps/weather/weather.declare`: `clock: Time [ tick = minute ]`, every
row's local time · `apps/lzx-dashboard/lzx-dashboard.declare`: timed presence flashes ·
`apps/docs/demos/Node.declare`: a stopwatch integrating `onTick`.

**Guide** Time and change events.
