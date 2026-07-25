The abstract base every layout strategy **extends** — never used directly
(`layout: Layout [ ]` names no arrangement and is a pointed error). A strategy
IS its `place()`: pure geometry from the strategy's own attributes and its
view's box, one box per managed child. The standard library's strategies are
ordinary Declare classes over this base — `SimpleLayout`, `WrappingLayout`,
`ResponsiveLayout` — and yours is written the same way:

```declare
class Rail extends Layout [
    gap: number = 8,

    place() {
        let x = 0
        return this.laid().map((c) => {
            const box = ({ x })
            if (c.visible) x = x + (c as any).width + this.gap
            return box
            })
        },
    ]

App [
    layout: Rail [ gap = 12 ],
    View [ width = 40, height = 40, fill = tomato ],
    View [ width = 60, height = 40, fill = royalblue ],
    View [ width = 30, height = 40, fill = seagreen ],
]
```

**`place()`** is the whole contract — no time, no side effects. `this.laid()`
answers the managed children (the view's children minus any with
`ignorelayout = true`), in child order; return one box per laid child,
aligned by index — a plain object naming any of `x`, `y`, `w`, `h`, `vis`.
The boxes' shape declares ownership: carry exactly the slots the strategy
manages, uniformly across children — a `{ x }` box owns each child's
horizontal position and nothing else, so sizes, fills, and the cross axis
stay the children's own (a child centers itself across a row with the
ordinary `y = center`). Invisible children keep their slot in the array (skip
them inside `place()`), so a re-shown child needs no special case. Read the
view's extent through `this.view` — a strategy that answers its own view's
size (as `ResponsiveLayout` does) participates in the same reactive pass.

Assign a strategy to a view's `layout` slot as a member (`layout: Rail [ gap
= 12 ]`). The runtime re-runs `place()` whenever anything it read changes —
the child set, their sizes, your knobs — and claims exactly the slots the
returned boxes name, restoring any authored value when the layout detaches or
stops naming them (one slot, one owner: arranging a child whose `x` is
already bound is a pointed error, not a silent fight).

For animated reflow, extend `TweenLayout` instead — the same `place()`
contract, interpolated through its scalar `t`.
