<!-- nav: Time and change events -->
<!-- part: Continuity -->

# Time and change events

Almost everything in a Declare program *follows*: a value reads another, the other
changes, and the first is already right. This chapter covers the tools for the cases
where following is not the whole story: the clock, as a member you can read; a single
call some time from now, `afterDelay`; and the change event, for the rare moment a
program must *act* because something crossed into a new state.

> **Time is an input, never a loop. A value that should follow is a constraint; only an
> action that must happen once is a change event.**

## The clock as a member

[`Time`](declare-docs:Time) brings the clock into your program as a member, the way [`Keys`](declare-docs:Keys) brings the
keyboard and [`DataSource`](declare-docs:DataSource) brings a server. Declare one, and the current time becomes a
set of reactive facts any constraint can derive from:

```declare
App [ width = 240, height = 80, fill = midnightblue, textColor = whitesmoke,
    clock: Time [ tick = second ],
    face: Text [ x = 20, y = 24, fontSize = 26,
        text = { app.clock.hour + ":" + (app.clock.minute < 10 ? "0" : "") + app.clock.minute + ":" + (app.clock.second < 10 ? "0" : "") + app.clock.second } ]
    ]
```

The facts are [`now`](declare-docs:Time.now) — the instant, in milliseconds — and the local-zone components
[`year`](declare-docs:Time.year), [`month`](declare-docs:Time.month), [`day`](declare-docs:Time.day), [`hour`](declare-docs:Time.hour), [`minute`](declare-docs:Time.minute), [`second`](declare-docs:Time.second), [`weekday`](declare-docs:Time.weekday): numbers, never strings
(`month` runs 1–12, `weekday` 1–7 with Monday first). Reading one is an ordinary
dependency, exactly like reading `app.width`, so a label bound to `clock.minute`
updates when the minute turns and nothing else about it needs writing. Like every
member, it lives and dies with the node that declares it; there is nothing to start,
stop, or unsubscribe. Formatting is yours: a subclass attribute over the facts
(`class Wall extends Time [ tick = minute, text: string = { … } ]`), or
`new Date(this.now)` and `Intl` when you want "Wednesday" in the reader's language.

### `tick` — the resolution

`tick` names how finely this instance ticks: `frame | second | minute | hour | day`.
Choose the coarsest tier your derivations need — a wall clock wants `second`, a "3
hours ago" label wants `minute`, a dateline wants `day`. The calendar tiers are
**aligned**: `tick = minute` fires when the minute *turns*, not sixty seconds after you
happened to boot, so a clock built on it is right at the flip, and a page that was
asleep for an hour gets one tick on return, not sixty. Inside a `{ }` the facts are as
of the last tick — the resolution you declared; in a handler they are live, sampled at
that moment. Nothing ticks until something reads a fact or handles a tick, and a hidden
page pauses it; `running` is the live gate when you want one of your own.

`tick` may also be a **number of milliseconds**: `tick = 30000` fires every thirty
seconds, counted from when the `Time` starts rather than aligned to the clock. That is
the repeating job that is not about the time of day — refreshing a source, advancing a
slideshow:

```declare-fragment
poll: Time [ tick = 30000, running = { app.feed.loaded }, onTick() { app.feed.fetch() } ]
```

A late wake — a sleeping laptop, a throttled tab — is still one tick, with `dt` clamped
to one period.

`tick = frame` is for things that move continuously. It updates `now` once per display
frame, and anything that is a **pure function of the current time** becomes a one-line
constraint:

```declare-fragment
stopwatch: Time [ tick = frame ],
startedAt: number = 0,
readout: Text [ text = { ((app.stopwatch.now - app.startedAt) / 1000).toFixed(1) + " s" } ],
```

No accumulator, no timer to clear: the readout *is* a formula over now.

### `onTick` — when the next value depends on the previous

Some work is not a function of now but of *what came before* — physics, a custom scroll
engine, a simulation. That is integration, and it belongs in `Time`'s handler:

```declare
App [ width = 240, height = 120, fill = midnightblue, textColor = whitesmoke,
    x0: number = 20,
    v: number = 60,
    physics: Time [ tick = frame, onTick(dt: number) { app.x0 = (app.x0 + app.v * dt) % 200 }
        ],
    dot: View [ x = { app.x0 }, y = 40, width = 40, height = 40, cornerRadius = 20, fill = turquoise ]
    ]
```

`dt` is the elapsed step in seconds, clamped — a tab returning from the background
resumes with a plausible step, not a sixty-second leap — and it rides the same clock
every [`Spring`](declare-docs:Spring) and [`Animator`](declare-docs:Animator) uses, so there is no second frame loop. `running` is a
live slot (`running = { app.simulating }`), so the loop pauses and resumes
declaratively. `onTick` exists on every tier: at `tick = minute` it means "when the
minute turns" — an event, not a loop.

### Choosing among a fact, `onTick`, and a Spring

The choice is about the *shape of the dependence*, not about speed:

| the value is… | reach for |
|---|---|
| a pure function of the current time — a readout, a countdown, progress toward a deadline | a **`Time` fact** |
| dependent on its own previous value — integration | **`onTick(dt)`** at `tick = frame` |
| something that should move *toward* a destination — anything that reads as animation | **`Spring` / `Animator`**: say where it belongs; never compute the path |
| an *action* the program takes once, when a value crosses into a new state | **[`trackChanges`](declare-docs:Node.trackChanges) + `onChange`** (below) — never a clock checking whether it has happened yet |
| an action to take once, some time from now — dismiss a notice, settle a debounce | **`afterDelay(ms, fn)`** (below) |
| a job that repeats on a period — refresh a source | **`onTick`** at `tick = 30000` |

Before writing an `onTick`, ask which of the other two you are about to re-implement. A
value that should *arrive* somewhere is a `Spring`. A value that should *advance* — a
replay cursor sweeping a day in ninety seconds, a progress running 0→1 — is an
`Animator`: scrubbable, pausable and interruptible for free, with everything derived from
it following. A per-frame `onTick` is right only when the next value depends on the last
in a way no curve states, and in practice one deserves a second look: it is usually one
of the other two in disguise, and its handler is where a program's only imperative state
tends to collect.

**The clock you cannot reach for directly.** `text = { new Date().toLocaleTimeString() }`
compiles and shows the right time once, at boot, and never changes: a constraint re-runs
when something it *read* changes, and the host's clock is not something in the tree. The
compiler warns. Read time through `Time`; `Date.now()` belongs in a handler, which runs
at a moment. And a per-frame `onTick` that ignores `dt` to *check whether something has
happened yet* is polling — the compiler warns there too, and the answer is a constraint
on the thing you were waiting for, or — when there is genuinely something to *do* at
that moment — the change event below. **Nothing in a Declare program waits or polls**: every loop that
checks whether something has happened is waiting for a specific value, and depending on
that value directly is both simpler and exact.

## Later, once: `afterDelay`

`afterDelay(ms, fn)` runs `fn` once, `ms` milliseconds from now. It is for the few
things that really are timing rules — a notice that dismisses itself after eight
seconds, a search that waits until typing pauses:

```declare-fragment
query: string = "",
searched: string = "",
TextInput [ width = 240, placeholder = "Search",
    onInput(v: string) {
        app.query = v
        afterDelay(300, () => { if (app.query == v) app.searched = v })
        }
    ],
results: DataSource [ auto = true, url = { "/api/search?q=" + encodeURIComponent(app.searched) } ]
```

Each keystroke schedules a check; only the one whose text is still current when its
300 ms are up writes `searched`, and the source follows `searched`. Three properties
make it safe to use:

- **The wait belongs to a node.** It is cancelled when the node whose handler asked is
  discarded, so a row that leaves the screen takes its pending waits with it.
- **It never runs in the frame that asked.** The frame is shown first, so
  `afterDelay(0, fn)` means "on the next frame" — how a menu lets itself disappear
  before the chosen command runs.
- **It can be dropped.** It returns a handle; `cancel()` drops the wait if it has not
  run.

It is a handler tool: a `{ }` value computes and never waits, so the compiler refuses
`afterDelay` there. And it is rarely the right one. Before writing it, ask what you are
waiting *for*: data arriving is `source.loaded`, a view being placed is `afterSettle`,
motion finishing is `spring.arrived`, and all of those are values a constraint can read.
The host's `setTimeout` and `setInterval` are not available in a `{ }` body; the
compiler names `afterDelay` and `Time` instead.

## When a change must cause an action: `onChange`

Almost everything in a Declare program *follows*. A value reads another, the other changes,
and the first one is already right — the constraint is the notification. That is why the
language has so few events: there is usually nothing to tell anyone.

A few things are not followings. A conversation is marked read when the reader reaches the
end of it. The busiest conversation opens once, when the history lands. A fetch starts when
the selection changes. Those are **actions**: something crossed into a new state, and the
program does one thing about it, once. There is no value to write that would mean "I did
this" — the doing is the point.

For those, a node names the values it wants to hear about, and answers `onChange`:

```declare
class Thread extends View [ scrolls = y, fill = #F2F5F8,
    atEnd: boolean = { scrollY >= contentHeight - height - 1 },
    trackChanges = [ "atEnd" ],
    onChange(e: ChangeEvent) {
        for (const c of e.changed) {
            if (c.name == "atEnd" && c.currentValue) app.markRead()
            }
        }
    ]

App [ width = 320, height = 250, fill = white, textColor = #172530, fontSize = 14,
    unread: number = 3,
    markRead() { unread = 0 },
    thread: Thread [ x = 12, y = 12, width = 296, height = 190, cornerRadius = 8,
        column: View [ width = { parent.width }, height = 900, fill = #DCE6F0 ]
        ],
    status: Text [ x = 12, y = 214,
        text = { app.unread > 0 ? app.unread + " unread — scroll to the end" : "all read" } ]
    ]
```

`trackChanges` names this node's own reactive values — attributes you declared, facts it
carries like [`scrollY`](declare-docs:View.scrollY) or `loaded`, attributes bound to data — and nothing else is tracked,
so a node that names nothing costs nothing. A name that is not one of the node's values is a
compile error, not a handler that silently never fires. To hear a record's field, declare an
attribute over the path (`kind: string = { :kind }`) and name that.

### When it fires

**At the close of the settle** — after every constraint has re-run and every reader already
holds the new value. Never in the middle, where half the tree would still be stale. This is
also why `currentValue` is simply what the attribute holds: by the time your handler runs,
the change is everywhere it belongs, and `previousValue` is history that nothing in the tree
is still carrying.

**Once per settle, carrying everything that moved.** `e.changed` is a list, in the order you
named them, so a node whose two subjects change together acts once rather than twice. A
value that changes and changes back inside one settle did not change; one that changes twice
reports the first value and the last.

**Not at boot.** First values are not changes. Setup that must run once belongs in `onInit`,
or — when it needs the whole tree standing and measured — in the App's `onReady`.

Your handler's writes are the next settle, so a change may cause a change, and the rules are
the ones you would want. A handler may not assign a value it was told about, which is a loop
with a name, and it is refused. A ring — mine moves yours, yours moves mine — ends on its
own, because a value is delivered at most once per settle chain.

### Declare the condition; handle only the action

Notice that `atEnd` is an attribute, not a test written inside the handler. That is the same
discipline a state's condition follows, for the same reason: the *what* stays readable, other
things can depend on it, and the handler is left holding only the *do*.

The shape to aim for is an action that **closes its own gate**. Marking the conversation read
makes `atEnd`'s consequence — the unread count — zero, so nothing is left to do if the
handler runs again. When an action cannot be written that way, because it posts a message or
appends to a log, give that concern its own node rather than letting one handler carry two.

### Only when you really need a state change

This is the one place a Declare program acts instead of describing, and the bar is that high.
A value that should follow another is a constraint. A value that should arrive somewhere is a
`Spring`. A look that depends on a condition is a state. None of them needs a handler, and
every one of them is interruptible and impossible to leave half-applied, which a handler's
aftermath is not.

It is **not** meant for use in conjunction with animation. A spring's `running` and `arrived`
are facts for constraints to read, not moments to catch. The same caution covers the other
moment-to-moment facts: [`scrolling`](declare-docs:View.scrolling), [`hot`](declare-docs:Control.hot) and [`down`](declare-docs:Control.down) flicker by nature — a trackpad's
momentum has pauses, a mouse wheel's notches are pauses — and a handler on that edge fires on
every stop and every restart, which is rarely what the program meant.

The test is one line: if the handler's body could have been written as `x = { … }`, write
that instead.

---

**What you can now do:** read the clock as facts at the resolution you need, integrate
physics in `onTick`, repeat a job on a period, run one call later with `afterDelay`,
choose between a fact, a spring, an animator and a tick by the shape of the dependence,
and — rarely — act once when a value crosses into a new state.

[Next: **Animated arrangements** →](declare-docs:guide:animated-arrangements)
