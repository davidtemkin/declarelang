The animated-reflow base you **extend** to glide children between two whole layouts
through one scalar `t`. Your subclass supplies a `place()` and its own state; drive `t`
from `0`→`1` with a constraint or an `Animator` and the children slide *between*
arrangements rather than snapping. The case for an author-written layout —
a grid that becomes a list, a fan that collapses to a stack.

**Its boxes are whole.** A `Layout`'s `place()` may give a box any subset of `x`, `y`, `w`,
`h` and `vis`, leaving the rest to the child; a `TweenLayout` blends every child between two
complete boxes, so each box its `place()` returns gives all five —
`{ x, y, w: c.width, h: c.height, vis: true }` where the size is the child's own. A box
without `h` gives the child no height, and one without `vis` hides it.

## t
The interpolation scalar, `0`…`1` — `0` is the "from" arrangement, `1` the "to". Constrain it
to a state or animate it; the layout places each child at the blended position, so the
transition is continuous.

## duration
The duration, in ms, of the built-in retarget animation the base runs when the layout
switches its `from`/`to` targets.

## laid()
The children this layout manages — `Layout.laid()`, restated here because a tweening
strategy reads it while animating between arrangements.

## retarget()
Re-aims the in-flight tween at the current arrangement, so a change mid-animation becomes
a new destination rather than a restart — the same interruption model a `Spring` has.
