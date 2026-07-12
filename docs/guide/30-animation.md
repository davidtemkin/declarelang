# Animation — motion you declare

Motion in Declare rides the same reactive core as everything else. There is no
separate animation loop bolted onto a re-render pass and no timeline to keep in sync
with your state — a value change, a [state](24-states.md) change, or a layout change
*is* the thing that animates. Two shapes cover the field, and they divide cleanly by
a single question: **is the motion an act you trigger, or a target you follow?**

## `Animator` / `AnimatorGroup` — imperative, triggered

An `Animator` is an ordinary component member that drives one numeric `attribute` of
its target through a curve when you call **`.start()`**. Most real motion is
triggered by an action — a tab opening, a panel sliding off — so `start()` is
explicit; auto-running at construction is the opt-in (`started = true`).

```declare
class WeatherTab extends View [
    label: string = "", selected: boolean = false, openHeight: number = 255,
    height = { selected ? openHeight : 25 },                       // the rest value, a constraint
    slide: Animator [ attribute = height, duration = 300, motion = laszloBoth ],
    setSelected(on) {
        slide.to = on ? openHeight : 25
        slide.start()          // displaces the height constraint for the run…
        selected = on          // …so flipping `selected` doesn't jump; the constraint
        },                     //    resumes, re-evaluated, on completion — landing exactly
    ]
```

The detail that makes this robust is in the comments: the driven slot, `height`, is
still a **constraint**. The animator *displaces* it for the duration of the run and
then lets it *resume* on completion, re-evaluated against the new `selected`. So
motion and rest state never disagree — you animate toward a value the constraint
would have computed anyway, and land exactly on it.

A few things worth knowing:

- **`attribute` is a bare token**, checked at compile time against the target's
  numeric slots — a typo (`heigth`) is a build error, not a silent no-op.
- **`to` is sampled once** at `start()` — an `Animator` does not live-retarget
  (that is the `Spring`'s job, below).
- **`motion`** is a named curve token (`laszloBoth`, `quartOut`, `easeBoth`, …) or a
  constructor (`cubicBezier(…)`).
- **`AnimatorGroup [ process = simultaneous | sequential ]`** coordinates several
  animators — a group whose members omit an attribute inherit the group's, so a
  staggered reveal is a few lines:

```declare
reveal: AnimatorGroup [ process = simultaneous,
    Animator [ attribute = opacity, to = 1, duration = 200 ],
    Animator [ attribute = y,       to = 20, duration = 200 ],
    ],
```

(Full surface in the [`Animator` reference] and
[animation.md](../../design/animation.md).)

## `Spring` — declarative, follows a reactive target

Where an `Animator` is a triggered act, a `Spring` is a **standing relationship**:
it follows a *reactive* `to` target and settles by physics, waking when the target
changes and sleeping at rest. This is the "motion you declare, not schedule" form —
you say *where* a thing belongs, and the spring finds the path there and re-finds it
whenever the destination moves.

```declare
App [ on: boolean = false,
    onMouseDown() { on = !on },
    View [ x = 28, y = 26, width = 64, height = 64, cornerRadius = 32, fill = dodgerblue,
        Spring [ attribute = x, to = { on ? 240 : 0 },      // to is a LIVE constraint
                 stiffness = 190, damping = 17 ] ],
    ]
```

The difference from `Animator.to` is the whole point: `Spring.to` is a `{ }`
constraint, so the spring **retargets** the instant it changes — flip `on` mid-flight
and the box reverses smoothly toward the new goal, no restart, no snap. Tune the feel
with `stiffness` / `damping` / `mass` / `epsilon`. Springs compose freely: the
homepage trails the cursor with two position springs and reveals its header with a
spring on opacity and one on `y`. Like any inline member, a `Spring` reaches its
enclosing class through `classroot`, and its default target points *outward*, so on
the root `App` a bare target is null — bind `to` explicitly there. (See the
[`Spring` reference].)

## States supply the end-states

A [`State`](24-states.md) declares *where* a slot goes — an end-state — while the
runtime or an animator owns *how* it gets there. An animator sits **above** states in
precedence, so a tween wins while it runs and resumes to the active state's value on
stop. Animating toward a state-driven target therefore just works, with no
coordination code: the state names the destination, the animator draws the line to
it.

## Choosing

- A one-shot, **triggered** move (a tab opening, a panel sliding off, a staggered
  reveal) → **`Animator` / `AnimatorGroup`**, driven with `start()`.
- A value that should **always arrive smoothly** at wherever a reactive expression
  points (a cursor trail, a scroll-driven reveal, a draggable target) → **`Spring`**.

---

**Next:** rich content, wrapped and reactive — [Text & Markdown](31-text-markdown.md).
