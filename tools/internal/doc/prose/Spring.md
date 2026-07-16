The **follow** half of the animation family: drives its `attribute` toward a **live,
reactive `to`** with spring physics — re-settling whenever `to` changes, and **sleeping at
rest** (zero cost while idle). Use it wherever the target keeps moving: a cursor trail, a
header that springs in on scroll, a value that chases wherever data puts it. Contrast
`Animator`, which runs a fixed `from`→`to` and stops. It descends from `Animator`, so it
inherits `attribute` and `to`; its own knobs are the spring constants.

```declare
dot: View [ width = 10, height = 10, cornerRadius = 5, fill = turquoise,
    followX: Spring [ attribute = x, to = { app.pointerX - 5 },
                      stiffness = 120, damping = 14, mass = 0.6 ] ]
```

## stiffness
Spring stiffness — higher pulls to the target faster (and can overshoot). The "how eager"
knob.

## damping
Damping — higher settles with less bounce. Low damping + high stiffness gives a springy
overshoot; high damping gives a smooth glide with none.

## mass
The moving mass — heavier trails more slowly, for a looser, longer follow (a lagging cursor
dot).

## epsilon
The rest threshold: how close to `to` counts as settled, at which point the spring **sleeps**
(and stops costing anything). Larger = sleeps sooner, at the price of stopping a hair short.
