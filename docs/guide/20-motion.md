<!-- nav: Motion and states -->
<!-- part: Continuity -->

# Motion and states

This part of the guide is not about animation in the sense you are used to. In most stacks, animation is an *effects
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

This layer of interface quality has been specialist work. Declare builds it from the
same constraints as everything else, and this chapter and
[Animated arrangements](declare-docs:guide:animated-arrangements) show how. None of it is
mandatory: continuity is a capability standing by, not a house style.

> **Motion is a target, not a timeline. A state is a bundle of values you are in or not
> in.**

## A spring drives an attribute toward a target

A [`Spring`](declare-docs:Spring) is physics on one attribute, toward a **reactive target**. You declare
where the thing belongs; the spring finds the path and arrives:

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
by construction. Springs are the house idiom for anything that should *arrive*
somewhere; the timed sibling, [`Animator`](declare-docs:Animator), is below.

**One spring per motion.** Declare it once, on the thing that moves, and let everything
that must move with it be a constraint on that spring's value: the rows below a growing
message read the one sprung height, not each carry a spring of their own. A `Spring` inside
a replicated class is one spring *per row* — fine for a dozen, a mistake for a few hundred.

When something should happen only once motion has genuinely landed — a detail panel
revealed after its container finishes opening — that is not a completion handler
either; it is a *fact*, and springs and animators expose two: **`running`** while a
journey is in flight, and **`arrived`**, true only at an uninterrupted destination.
`visible = { open.arrived }` sequences off the landing with no bookkeeping, and a
mid-flight retarget clears it exactly as you would hope. (Arriving is distinct from *the
settle* of [Constraints](declare-docs:guide:constraints@the-settle-when-writes-take-effect): a spring arrives across many
settles.)

> **From SwiftUI:** `withAnimation` animates the *transaction* — changes made inside
> the block. A `Spring` here is a standing declaration on the attribute itself:
> nothing is wrapped, and any write to the target, from anywhere, moves the ball.
> **From React:** this is the retirement of the motion library — no
> `AnimatePresence`, no variants, no exit choreography. The graph you already have
> is the animation system.

## A state is a reversible bundle of overrides

The other primitive is about *configurations*. A [`State`](declare-docs:State) is a named set of attribute
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

While `open` holds, the height, the fill, and the extra [`Text`](declare-docs:Text) apply *together*;
when it lifts, they all revert. Note what is unwritable here: the "set it on enter,
forget to unset it on exit" bug. An attribute's value is a pure function of its base
plus the active states, so **a state cannot leak** — there is no exit code to forget
because there is no exit code. States compose (two active states each contribute;
on a conflict the later declaration wins), and the condition is any constraint —
including `app.width < 480`, which is the "swap the whole arrangement" form of
responsiveness mentioned in [Size, position and layout](declare-docs:guide:layout@responsiveness). A state
overrides its own element's attributes only: `bg.opacity = 0.5` inside one is a
compile error. A child that should follow the same condition declares its own state
on it, or a constraint that reads the flag.

## Animator: motion on a clock

Some motion really is clock-shaped: a progress sweep, a replay cursor moving through a day
in ninety seconds, an entrance that runs once. An `Animator` drives one attribute from
`from` to `to` over `duration` milliseconds on a `motion` curve (`linear`,
`quadOut`, `cubicBoth`, `back`, …):

```declare
App [ width = 360, height = 150, fill = white, textColor = #172530,
    t: number = 0,
    sweep: Animator [ attribute = t, from = 0, to = 1, duration = 1500, motion = linear ],
    col: View [ x = 20, y = 20, width = 320,
        layout: SimpleLayout [ axis = y, spacing = 12 ],
        track: View [ width = 100%, height = 10, cornerRadius = 5, fill = #E6EBF1,
            View [ height = 10, cornerRadius = 5, fill = #2E6FE0, width = { parent.width * app.t } ]
            ],
        row: View [
            layout: SimpleLayout [ axis = x, spacing = 10, align = center ],
            Button [ label = "Run", primary = true, onClick() { app.sweep.start() } ],
            Button [ label = { app.sweep.paused ? "Resume" : "Pause" },
                onClick() { app.sweep.paused = !app.sweep.paused } ],
            Text [ text = { app.sweep.arrived ? "done" : app.sweep.running ? Math.round(app.t * 100) + "%" : "ready" } ]
            ]
        ]
    ]
```

`start()` runs it (or constrain `started` to a condition); `paused` freezes and resumes it
without resetting; `running` and `arrived` are the same facts a spring has. Omit `from`
and it starts from wherever the attribute is. [`AnimatorGroup`](declare-docs:AnimatorGroup) runs several animators in
sequence or together, for the rare sequence that has to be choreographed rather than
derived. Choose by the shape of the motion: a value that should *arrive* somewhere, and
may be redirected on the way, is a `Spring`; a value that should *advance* over a known
time is an `Animator`.

## One mechanism, two faces

Springs and states look like two features. They are one idea seen twice: **a
reversible, interruptible declaration about how things should be.** A state names a
*configuration* that applies and reverts; a spring names a *destination* and makes
the journey continuous. Both are relationships — not commands — which is why neither
can be caught in a broken half-applied middle, and why they compose: a state flips a
value, a spring's target reads it, and the change of configuration *glides*.

What neither does alone is move whole *arrangements* — grids reshaping, one surface
becoming another. That takes the two of them plus one idiom:
[Animated arrangements](declare-docs:guide:animated-arrangements).

---

**What you can now do:** move attributes toward targets with springs and over time with
animators, sequence off a landing with `arrived`, and define states that apply and revert
together without leaking — and you know why an interface built this way is kinder to the
person using it.

[Next: **Time and change events** →](declare-docs:guide:time)
