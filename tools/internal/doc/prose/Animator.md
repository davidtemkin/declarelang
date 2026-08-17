Drives one numeric attribute from `from` to `to` over `duration`, on a motion curve — the
**timed** half of the animation family. A non-visual node you place *inside* the view it
animates, naming the target slot with `attribute`. For motion toward a **live, reactive**
target (one that keeps moving), reach for `Spring` instead — an Animator runs a fixed
`from`→`to` and stops.

```declare
box: View [ opacity = 0,
    fadeIn: Animator [ attribute = opacity, to = 1, duration = 300, started = true ]
    ]
```

## attribute
The target slot this animator drives — a **bare attribute name** of the enclosing view
(`attribute = opacity`), checked to be numeric. Not a string, not a path; the raw slot
reference.

## to
The value to animate **to**.

## from
The value to start **from** — **omit it to sample the target's current value** at start, so
an animation begins wherever the view already is (the usual case).

## duration
The run time, in ms.

## repeat
How many times to repeat; `0`/absent runs once.

## motion
The easing curve — a motion token (`quad`, `back`, …) naming the shape of the interpolation
between `from` and `to`.

## relative
When true, `to`/`from` are **offsets** from the current value rather than absolute targets —
"move by", not "move to".

## started
Set true to run it — the declarative `start()`. Drive it from a constraint to gate playback
on state: every change drives the run — true starts, false stops in place, and a fresh true
is a fresh run from the top. `started` is the **request**, not a status readback: a run that
completes (or is `stop()`ed) leaves it reading whatever was asked, so ask `atRest` or
`onStop` for arrival, never `started`.

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
Runs the animation from the current attribute value toward `to` — the imperative trigger,
equivalent to setting `started = true`. Prefer binding `started` to a condition when the run
is state-driven; call `start()` for a one-shot fired from a handler (`onClick() { fx.start() }`).

## stop()
Halts the run where it is and leaves the attribute at its current value — it does **not**
snap back to `from`. Pair with `start()` for handler-driven control, or drive `started`
reactively instead.

## atRest
**Read-only.** Motion at rest, as a reactive fact: true only at an uninterrupted
destination — the animation twin of a `DataSource`'s `.loaded`. The animator computes it;
`start()` and `stop()` are what move it. Read it to sequence what should happen *after*
motion (revealing a detail panel once its container has finished opening) instead of
guessing with a timer that a retarget would invalidate. (Not to be confused with **the
settle**, the update transaction — a spring comes to rest across many settles.)
