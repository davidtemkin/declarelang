The animated-reflow base you **extend** to glide children between two whole layouts
through one scalar `t`. Your subclass supplies a `place()` and its own state; drive `t`
from `0`→`1` with a constraint or an `Animator` and the children slide *between*
arrangements rather than snapping. This is the forcing case for author-written layouts —
a grid that becomes a list, a fan that collapses to a stack.

## t
The interpolation scalar, `0`…`1` — `0` is the "from" arrangement, `1` the "to". Bind it
to a state or animate it; the layout places each child at the blended position, so the
transition is continuous.

## duration
The duration, in ms, of the built-in retarget animation the base runs when the layout
switches its `from`/`to` targets.
