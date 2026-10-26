Drives one numeric attribute from `from` to `to` over `duration`, on a motion curve — the
**timed** half of the animation family. A non-visual node you place *inside* the view it
animates, naming the target attribute with `attribute`. For motion toward a **live, reactive**
target (one that keeps moving), reach for `Spring` instead — an Animator runs a fixed
`from`→`to` and stops.

```declare
App [
    box: View [ x = 20, y = 20, width = 140, height = 60, cornerRadius = 8, fill = #2E6FE0, opacity = 0,
        fadeIn: Animator [ attribute = opacity, to = 1, duration = 900, started = true ],
        Text [ x = 12, y = 20, textColor = white, text = "fading in" ]
        ]
    ]
```

## attribute
The target attribute this animator drives — a **bare attribute name** of the enclosing view
(`attribute = opacity`), checked to be numeric. Not a string, not a path; the attribute itself.

## to
The value to animate **to**.

## from
The value to start **from** — **omit it to sample the target's current value** at start, so
an animation begins wherever the view already is (the usual case).

## duration
The run time, in ms.

## repeat
How many times to repeat; `0`/absent runs once. `repeat = { Infinity }` loops for good:
a spinner, a typing indicator. A loop like that is never "about to finish", so a check's
`settleMotion` runs every other motion to rest without waiting for it (a large finite count
is a motion that ends, and holds it).

## motion
The easing curve — a motion token (`quad`, `back`, …) naming the shape of the interpolation
between `from` and `to`.

## relative
When true, `to`/`from` are **offsets** from the current value rather than absolute targets —
"move by", not "move to".

## started
The **request** to run: true starts it, false stops it in place. Drive it from a constraint
to gate playback on state, or call `start()` and `stop()`, which write it too — so it reads
what was last asked for either way. (When a `{ }` owns it, the constraint is the request and
the verbs leave its value alone.) A run that lands on its own does not withdraw the request:
`started` stays true, so a constraint must go false and back to true to run it again. It is
not a report — read `running` for flight and `arrived` or `onStop` for arrival.

## paused
Freeze a running animation and resume it without resetting — distinct from `started`, which
runs it from the top. A paused animation costs nothing: it holds no frame loop, and resuming
continues from the freeze as if no time had passed.

## onStart
Fires when the run begins (answered by `onStart`).

## onStop
Fires when the run ends (answered by `onStop`) — the hook for chaining or cleanup.

## onRepeat
Fires at each loop of a repeating run (answered by `onRepeat`).

## start()
Runs the animation from the current attribute value toward `to`, and sets `started = true`
(unless a constraint owns it). A no-op while already running. Prefer constraining `started` to a condition when the run
is state-driven; call `start()` for a one-shot fired from a handler (`onClick() { fx.start() }`).

## stop()
Halts the run where it is and leaves the attribute at its current value — it does **not**
snap back to `from` — and sets `started = false` (unless a constraint owns it). Pair with `start()` for handler-driven control, or drive `started`
reactively instead.

## running
**Read-only.** A journey is in flight: false at birth, true from `start()` (a spring: from
the moment its target moves away from its value) until it stops for any reason — a landing
or a `stop()`. The fact to gate a clock or a follow on: `Time [ running = { fit.running } ]`
runs for exactly the length of the motion. `started` is the request; this is the report.

## arrived
**Read-only.** The run reached its destination on its own: false at birth, false after a
mid-flight `stop()`, cleared by a new start, true only at natural completion — the animation
twin of a `DataSource`'s `.loaded`. For a spring: true once it has landed on its target
after travelling — exact target, velocity zero. Read it to sequence what should happen *after* motion
(revealing a detail panel once its container has finished opening) instead of guessing with
a timer that a retarget would invalidate: `visible = { open.arrived }`. (Not to be confused
with **the settle**, the update transaction — a spring arrives across many settles.)
