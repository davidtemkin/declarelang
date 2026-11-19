The animated-reflow base you **extend** to glide children between two whole layouts
through one scalar `t`. Your subclass supplies a `place()` and its own state; drive `t`
from `0`→`1` with a constraint or an `Animator` and the children slide *between*
arrangements rather than snapping. The case for an author-written layout —
a grid that becomes a list, a fan that collapses to a stack.

**Its boxes name what it moves.** As with any `Layout`, a box from `place()` may give any
subset of `x`, `y`, `w`, `h` and `vis`: what it names glides between the two arrangements,
and what it leaves out stays the child's own — a stack that moves only `y` (`{ x: 0, y }`)
leaves each child its own width and height. A box without `vis` shows the child.

## t
The interpolation scalar, `0`…`1` — `0` is the "from" arrangement, `1` the "to". Constrain it
to a state or animate it; the layout places each child at the blended position, so the
transition is continuous.

## duration
The duration, in ms, of the glide to a new arrangement.

## laid()
The children this layout manages — `Layout.laid()`, restated here because a tweening
strategy reads it while animating between arrangements.

## retarget()
Aims the children at the current arrangement now: `retarget(true)` glides, `retarget(false)`
places them at once. A change to anything `place()` reads already glides by itself, from
wherever the children are, so the call is for the exceptions: placing at once rather than
gliding (a new window width), or a change the layout cannot see, made outside any attribute.
