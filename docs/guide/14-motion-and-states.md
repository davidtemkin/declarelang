<!-- nav: Motion & states -->
<!-- part: Continuity -->

# Motion is a target; a state is a bundle

Before the tools, the argument — because this part of the guide is not about
animation in the sense you're used to. In most stacks, animation is an *effects
layer*: something added after the interface works, to make it feel finished. Declare
treats motion as something else entirely — **the means to a continuous user
experience** — and the reasons to want that have nothing to do with polish:

- **Continuity keeps people oriented.** When a view *becomes* the next view, the
  interface answers "where did that go? where am I now?" before the question forms.
  A hard cut throws away the user's sense of place and makes them rebuild it — real
  cognitive overhead, imposed by the interface, dozens of times a session.
- **Motion carries meaning.** A card that grows into a detail panel *is telling you*
  the panel is that card, seen closer. Done well, motion is information — what came
  from where, what belongs to what — not decoration.
- **Interruptibility respects intent.** A continuous interface stays live mid-motion:
  change your mind halfway and it follows from wherever it is. Nothing to wait out —
  which is the felt difference between software that responds and software that
  performs.
- And it is simply finer craft — the quality you feel in the best native software
  without being able to name it.

Chapter 1 named the claim: this layer of UX has been specialist work, and Declare
moves it into the declarative layer, built from the same standing relationships as
everything else. This chapter and the next are that claim, demonstrated. One
reassurance as we start: none of it is mandatory — continuity is a capability
standing by, not a house style.

## A spring drives an attribute toward a target

A `Spring` is physics on one attribute, toward a **reactive target**. You declare
where the thing belongs; the spring finds the path and settles:

```declare
App [ width = 420, height = 120, fill = black,
    on: boolean = false,
    onClick() { on = !on },
    ball: View [ x = 20, y = 40, width = 40, height = 40, cornerRadius = 20, fill = turquoise,
        slide: Spring [ attribute = x, to = { on ? 340 : 20 }, stiffness = 170, damping = 20 ]
        ]
    ]
```

Click — and click again *mid-flight*. The ball eases from wherever it is toward the
new destination, because `to` is a live constraint and a change of target is just…
a new target. There is no tween to cancel, no animation queue, no completion handler
— **interruption requires no code**, which is why everything built this way stays
interruptible by default. That is the continuity argument's third point, delivered
by construction. (`Animator [ attribute = x, to = 0, duration = 333 ]` is the
time-based sibling for the rare clock-shaped case, and `AnimatorGroup` runs several
in step when a sequence genuinely has to be choreographed rather than derived;
springs are the house idiom.)

When something should happen only once motion has genuinely landed — a detail panel
revealed after its container finishes opening — that is not a completion handler
either; it is a *fact*, and springs and animators expose it: **`atRest`** is true
only at an uninterrupted destination. `visible = { open.atRest }` sequences off the
landing with no bookkeeping, and a mid-flight retarget un-rests it exactly as you'd
hope. (Distinct from *the settle*, the update transaction from
[Relationships](declare-docs:guide:relationships) — a spring comes to rest across
many settles.)

> **From SwiftUI:** `withAnimation` animates the *transaction* — changes made inside
> the block. A `Spring` here is a standing declaration on the attribute itself:
> nothing is wrapped, and any write to the target, from anywhere, moves the ball.
> **From React:** this is the retirement of the motion library — no
> `AnimatePresence`, no variants, no exit choreography. The graph you already have
> is the animation system.

## A state is a reversible bundle of overrides

The other primitive is about *configurations*. A `State` is a named set of attribute
overrides — and even conditional children — applied while a condition holds,
reverted when it lifts:

```declare
App [ width = 360, height = 240, fill = black, textColor = whitesmoke,
    open: boolean = false,
    onClick() { open = !open },
    card: View [ x = 30, y = 30, width = 300, height = 70, cornerRadius = 10, fill = midnightblue,
        Text [ x = 20, y = 20, fontWeight = bold, text = "Summary" ],
        big: State [ applied = { open }, height = 180, fill = steelblue,
            Text [ x = 20, y = 50, width = 260, textColor = gainsboro, wrap = true,
                text = "height, color, and this whole line swap in together" ]
            ]
        ]
    ]
```

While `open` holds, the height, the fill, and the extra `Text` apply *together*;
when it lifts, they all revert. Note what is unwritable here: the "set it on enter,
forget to unset it on exit" bug. An attribute's value is a pure function of its base
plus the active states, so **a state cannot leak** — there is no exit code to forget
because there is no exit code. States compose (two active states each contribute;
on a conflict the later declaration wins), they can target named descendants by
dotted path, and the condition is any constraint — including `app.width < 480`,
which is the "swap the whole arrangement" form of responsiveness promised in
the [Space](declare-docs:guide:space) chapter.

## One mechanism, two faces

Springs and states look like two features. They are one idea seen twice: **a
reversible, interruptible declaration about how things should be.** A state names a
*configuration* that applies and reverts; a spring names a *destination* and makes
the journey continuous. Both are relationships — not commands — which is why neither
can be caught in a broken half-applied middle, and why they compose: a state flips a
value, a spring's target reads it, and the change of configuration *glides*.

What neither does alone is move whole *arrangements* — grids reshaping, one surface
becoming another. That takes the two of them plus one idiom, and it is the next
chapter — the one the language exists for.

## Time

`Time` brings the clock into your program as a member, the way `Keys` brings the
keyboard and `DataSource` brings a server. Declare one, and the current time becomes a
set of reactive facts any constraint can derive from:

```declare
App [ width = 240, height = 80, fill = midnightblue, textColor = whitesmoke,
    clock: Time [ tick = second ],
    face: Text [ x = 20, y = 24, fontSize = 26,
        text = { app.clock.hour + ":" + (app.clock.minute < 10 ? "0" : "") + app.clock.minute + ":" + (app.clock.second < 10 ? "0" : "") + app.clock.second } ]
    ]
```

The facts are `now` — the instant, in milliseconds — and the local-zone components
`year`, `month`, `day`, `hour`, `minute`, `second`, `weekday`: numbers, never strings
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
every `Spring` and `Animator` uses, so there is no second frame loop. `running` is a
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

Before writing an `onTick`, ask which of the other two you are about to re-implement. A
value that should *arrive* somewhere is a `Spring`. A value that should *advance* — a
replay cursor sweeping a day in ninety seconds, a progress running 0→1 — is an
`Animator`: scrubbable, pausable and interruptible for free, with everything derived from
it following. A per-frame `onTick` is right only when the next value depends on the last
in a way no curve states, and in practice one deserves a second look: it is usually one
of the other two in disguise, and its handler is where a program's only imperative state
tends to collect.

**A note on the clock you cannot reach for directly.** `text = { new Date().toLocaleTimeString() }`
compiles and shows the right time once, at boot, and never changes: a constraint re-runs
when something it *read* changes, and the host's clock is not something in the tree. The
compiler warns. Read time through `Time`; `Date.now()` belongs in a handler, which runs
at a moment. And a per-frame `onTick` that ignores `dt` to *check whether something has
happened yet* is polling — the compiler warns there too, and the answer is a constraint
on the thing you were waiting for. Nothing waits.

---

**What you can now say:** you can declare where things belong and let physics take
them there, define states that cannot leak, and interrupt anything mid-flight for
free — and you know *why* an interface built this way is kinder to its user.

[Next: **Arrangement animates** →](declare-docs:guide:arrangement)
