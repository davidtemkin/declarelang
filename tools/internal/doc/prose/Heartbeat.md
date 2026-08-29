The **frame heartbeat** as a member: calls your `onFrame(dt)` once per animation frame,
with `dt` the real elapsed time in seconds. `Spring` and `Animator` are the declarative
half of motion — say where a thing belongs and the runtime finds the path; `Heartbeat` is the
raw tick an app that integrates something *itself* needs: custom gesture physics, a
simulation, a game loop. Reach for it only when you are doing the integration; for "move
this there, smoothly," a `Spring` is less code and better behaved.

**Before a Heartbeat, ask which of the other two you are about to re-implement.** A value that
should *arrive* somewhere is a `Spring` (target → value). A value that should *advance* — a
replay cursor sweeping a day in ninety seconds, a progress that runs 0→1 — is an `Animator`
(time → value): it is scrubbable, pausable, and interruptible for free, and everything that
derives from it (seventy glyph opacities, a rule) follows with no per-frame code. A Heartbeat
is right only when the next value depends on the last in a way no curve states — a body under
forces, a particle system, a gesture you integrate yourself. In practice a `Heartbeat` in a
program is worth a second look: it is usually one of the other two in disguise, and the
per-frame handler it carries is where the program's only imperative state tends to collect.

It rides the one shared clock every animator uses, so it costs nothing until it runs and
never starts a second frame loop, and its lifetime is the node's — a discarded subtree
cannot leave a loop running behind it. `dt` is clamped (a backgrounded tab resumes with a
plausible step, not one enormous jump that would launch any integrator into the weeds).

```declare
App [ width = 240, height = 120, fill = midnightblue, textColor = whitesmoke,
    x0: number = 20,
    v: number = 60,
    physics: Heartbeat [ onFrame(dt: number) { app.x0 = (app.x0 + app.v * dt) % 200 }
        ],
    dot: View [ x = { app.x0 }, y = 40, width = 40, height = 40, cornerRadius = 20,
        fill = turquoise ]
    ]
```

## running
Is the heartbeat live? A plain reactive slot, so the usual idiom is a constraint —
`running = { app.simulating }` — which starts and stops the loop as the app's own state
changes. The first frame after a start establishes the time baseline and reports no step.

## frame
`onFrame(dt)` — one call per animation frame while `running`, with the seconds elapsed
since the previous frame.
