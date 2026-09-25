The abstract base every layout strategy **extends** — never used directly
(`layout: Layout [ ]` names no arrangement and is a pointed error). A strategy
**is** its `place()`: pure geometry from the strategy's own attributes and its
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
            if (c.visible) x = x + c.width + this.gap
            return box
            })
        }
    ]


App [
    layout: Rail [ gap = 12 ],
    View [ width = 40, height = 40, fill = tomato ],
    View [ width = 60, height = 40, fill = royalblue ],
    View [ width = 30, height = 40, fill = seagreen ]
    ]
```

**`place()`** is the whole contract — no time, no side effects. `this.laid()`
answers the managed children (the view's children minus any with
`ignoreLayout = true`), in child order — **replicated instances included**: a
layout composes with datapath replication, arranging one box per record's
instance exactly as it would hand-written children, and re-placing as records
come and go. And the boxes it returns land as the children's ordinary
`x`/`y`/`width`/`height` — readable by any handler or constraint, hit-tested by
`viewAt`, like geometry from any other source. Return one box per laid child,
aligned by index — a plain object naming any of `x`, `y`, `w`, `h`, `vis`.
The boxes' shape declares ownership: carry exactly the slots the strategy
manages, uniformly across children — a `{ x }` box owns each child's
horizontal position and nothing else, so sizes, fills, and the cross axis
stay the children's own (a child centers itself across a row with the
ordinary `y = center`) — until the strategy's `align` claims the cross axis,
when its boxes carry that slot too and own it the same way. Invisible children keep their slot in the array (skip
them inside `place()`), so a re-shown child needs no special case. Read the
room to divide through `contentExtent` — the arranged view's **content box**,
its extent less its own `View.padding` — and a strategy that answers its own
view's size (as `ResponsiveLayout` does) participates in the same reactive pass.

**Padding is not a layout's business.** The content box belongs to the view
(`View.padding`): `x = 0` in a box you return means the view's *content*
origin, exactly as it does for a child that places itself, so an arrangement
written before padding existed honours it by doing nothing at all. Divide
`contentExtent(size)`, never `this.view.width`, and the inset costs you
nothing to respect.

Assign a strategy to a view's `layout` slot as a member (`layout: Rail [ gap
= 12 ]`). The runtime re-runs `place()` whenever anything it read changes —
the child set, their sizes, your knobs — and claims exactly the slots the
returned boxes name, restoring any authored value when the layout detaches or
stops naming them (one slot, one owner: arranging a child whose `x` is
already bound is a pointed error, not a silent fight).

**Replication composes.** A layout is not only for children you write out by
hand: views stamped by a `datapath` are ordinary members of `laid()`, so a
data-driven list under a layout is arranged exactly like hand-written
siblings — the count may change with every reconcile, and the next pass
simply arranges the new set. A `Dataset` shapes the records; the layout owns
the geometry; neither needs to know the other exists.

For animated reflow, extend `TweenLayout` instead — the same `place()`
contract, interpolated through its scalar `t`.

## place()
**The method a strategy is.** Declare it in your subclass and the runtime calls it
whenever anything it read changes: return one box per child of `laid()`, aligned by index,
computed from your own attributes, the children's sizes, and the room `contentExtent(size)`
reports. Nothing else — no time, no side effects, no writing a child's slots by hand.

**A box says only what you decide.** Give it `x`, `y`, `w`, `h`, or any subset, and the
slots you name are the slots this strategy owns for that child: a box of `{ y }` alone
positions a stack and leaves every width to the children, which is how a child sizes itself
inside an arrangement. What you omit stays the author's.

The base takes your boxes from there and installs them as claims, so `place()` never
mentions ownership — and never mentions padding either, since the coordinates it returns
are already the view's content coordinates.

## laid()
The children this layout manages, in order — **the one definition of what a strategy is
responsible for**, and the list your `place()` must return boxes for, aligned by index.
Invisible children are included so a skipped child still gets the slot it would occupy;
that is what makes re-showing one need no special case. Replicated children are included
too: a `datapath` stamp is an ordinary child here, so a custom layout arranges a
data-driven list with no extra wiring.

**This is the method a custom layout is written against.** A `Layout` subclass overriding
`place()` is the sanctioned extension point, and `laid()` is how it reaches the children —
notably, a layout strategy *may* aggregate over them, which constraints may not. The other
half is the room the view gives it, `this.contentExtent("width")` — the arranged view's
extent less its padding — because **a layout answers to the view it is attached to, never to
the window**, which is what makes nested responsive layouts compose.

```declare-fragment
place() {
    let pos = 0
    return this.laid().map((c) => {
        const box = ({ y: pos })
        if (c.visible) pos = pos + c.height + this.spacing
        return box
        })
    }
```

## refuseBaseline()
For a strategy that aligns by `baseline`: the laid child `refuseBaseline(child)` names
declares none. The arrangement never waits on it — place the child at the line's start
and call this — and the kernel speaks the refusal **once per child, at the close of the
settle, and only if the child is attached and still declares none then**: a flow
(`Markdown`, `HTMLText`) claims its baseline when it renders, which can be a moment after
a parent's first pass, and a `null` seen mid-flight may be a claim still on its way. The
checker refuses the same shapes before anything runs wherever the tree is static; this
holds the line for a bound `align` and for children created at run time. The message
names the child's class and the rewrite (declare `baseline: number = { … }`, or align by
`start | center | end`).

## refuseStackBaseline()
`align = baseline` on a **stack** — a y-axis `SimpleLayout`, whose cross axis is x — has no
line to sit on. A strategy calls this once from `place()` and falls back to `start`; the
kernel reports it once per layout. The checker refuses the literal form outright.

## contentExtent()
**The room this arrangement has**, and what a `place()` divides: the arranged view's
**content box** on `size` — its extent less its own `View.padding` on that axis, never
below 0. The number is the view's, not this layout's; a layout simply arranges inside the
room it is given. **Read this, not `this.view.width`** — a strategy that reads the view's
own extent wraps, shares or spaces at the wrong number the moment anyone pads that view,
and one that reads `contentExtent` honors it for free. It is the plain measurement: unlike
`viewExtent` it does not ask whether the view derives that extent from these very children,
so an *alignment band* wants `viewExtent` (which is the content box too). A `place()` in a
`.declare` class calls it directly: `this.contentExtent("width")`.

## viewExtent()
The **band an alignment places children in**: the arranged view's own content extent on
`size` (`"width"` or `"height"`) — or **0 when that extent is measured from the very children this
strategy lays**, where reading it would close the one-pass discipline's forbidden cycle.
Fold it in with `Math.max(line, this.viewExtent(size))`: on a view that sizes itself from
its children the answer is 0 and the line stands (and the two agree anyway — an aligned
run's extent *is* its widest child); on a view that was told its size the band is the box
the author drew, which is what `align = center` has always meant. The read is tracked, so a
parent that resizes re-places its aligned children.

## attachTo()
Attaches this strategy to a view. Setting a `layout:` member does it for you; a strategy
swapped in at runtime is attached by the slot assignment, not by hand.

## rearm()
Requests a fresh arrangement pass. The layout re-runs on its own when anything `place()`
read changes — call this only when a strategy depends on something outside the reactive
graph.
