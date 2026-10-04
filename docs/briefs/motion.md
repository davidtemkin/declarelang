# Motion
<!-- index: springs toward a target, animators, states, arrival -->

**Use when** something should move rather than jump: a panel opening, a value easing,
a card changing configuration, a progress sweep.

```declare
App [ width = 360, height = 240, fill = white, textColor = #172530,
    open: boolean = false,
    onClick() { open = !open },

    // a spring: where it belongs, as a live target; a retarget mid-flight needs no code
    card: View [ x = 30, y = 30, width = 300, height = 70, cornerRadius = 10, fill = 0xE6EEF8,
        grow: Spring [ attribute = height, to = { app.open ? 180 : 70 }, stiffness = 210, damping = 24 ],
        head: Text [ x = 20, y = 24, fontWeight = semibold, text = "Summary" ],
        // a state: a configuration that applies while its condition holds, and reverts
        wide: State [ applied = { app.open }, fill = 0xD3E2FC ],
        // a fact of the motion: shown only once the card has landed open
        more: Text [ x = 20, y = 60, width = 260, visible = { app.open && parent.grow.arrived },
            text = "revealed after the card arrives" ]
        ]
    ]
```

**Rules**
- Something that should **arrive** somewhere is a `Spring` on one attribute, toward a
  live `to`. A change of target mid-flight is just a new target: no tween to cancel, no
  completion handler.
- Something that should **advance** over a known time is an `Animator` (`from`, `to`,
  `duration`, `motion`); `start()` runs it.
- A **configuration** is a `State`: overrides and children that apply while `applied`
  holds and revert exactly when it lifts. Nothing to undo; states compose.
- Sequence off the landing with the facts `running` and `arrived`, not a timer or a
  callback: `visible = { grow.arrived }`.
- One spring per motion: things that move with it are constraints on its value. A spring
  inside a replicated class is one per row.
- A value that arrives with its data should appear, not count up: call the spring's
  `arrive()` in the source's `onLoad`, and later changes animate.
- Under the hand, write the value and the spring's target together, so the spring rests;
  on release set only the target.

**Look up** `Spring`, `Spring.to`, `Spring.arrived`, `Spring.arrive`, `Animator`, `Animator.start`,
`State`, `State.applied`, `AnimatorGroup`.

**Examples** `apps/weather/weather.declare`: `openSpring` and `openT`, the row-to-page
open · `apps/tracker/tracker.declare`: `ListRow`, a height spring that reveals the editor
on arrival · `apps/desktop/desktop.declare`: `Window`, the dock-park journey on `miniT`.

**Guide** Motion and states · Animated arrangements.
