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

## The heartbeat

One member completes the motion family. `Heartbeat` calls `onFrame(dt)` once per
animation frame with the real elapsed seconds — for the rare case where you are
integrating something yourself (a physics engine, a simulation) rather than
declaring a destination:

```declare
App [ width = 240, height = 120, fill = midnightblue, textColor = whitesmoke,
    x0: number = 20,
    v: number = 60,
    physics: Heartbeat [ onFrame(dt: number) { app.x0 = (app.x0 + app.v * dt) % 200 }
        ],
    dot: View [ x = { app.x0 }, y = 40, width = 40, height = 40, cornerRadius = 20, fill = turquoise ]
    ]
```

`running` gates it (`running = { app.simulating }`), `dt` is clamped so a backgrounded
tab does not resume with one enormous step, and it rides the same clock every `Spring`
and `Animator` uses — so it costs nothing until it runs, and there is no second frame
loop. Reach for it when you are integrating; for "move this there, smoothly," a
`Spring` is less code and better behaved.

Before you write one, ask which of the other two you are about to re-implement. A value
that should *arrive* somewhere is a `Spring`. A value that should *advance* — a replay
cursor sweeping a day in ninety seconds, a progress running 0→1 — is an `Animator`: it is
scrubbable, pausable and interruptible for free, and everything derived from it follows
with no per-frame code at all. A `Heartbeat` is right only when the next value depends
on the last in a way no curve states. In practice a `Heartbeat` in a program deserves a
second look: it is usually one of the other two in disguise, and its per-frame handler
is where a program's only imperative state tends to collect.

---

**What you can now say:** you can declare where things belong and let physics take
them there, define states that cannot leak, and interrupt anything mid-flight for
free — and you know *why* an interface built this way is kinder to its user.

[Next: **Arrangement animates** →](declare-docs:guide:arrangement)
