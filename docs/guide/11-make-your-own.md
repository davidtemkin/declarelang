<!-- nav: Make your own -->
<!-- part: Building -->

# Your components are the library's equals

Everything you have used so far — `Button`, `Slider`, `Table`, `Menu` — is written in
Declare, in `library/`, in the language you have been reading. There is no privileged
component layer underneath it, and that is not a slogan: no library class name appears
anywhere in the compiler or the runtime. The compiler cannot tell a library component
from yours, because it never asks.

> **The library is not a special kind of thing. It is ordinary Declare that happens to
> ship in the box.**

So this chapter is the payoff of the last seven: what it takes to build a piece that
behaves like the ones you have been handed — a control that answers the keyboard, a mark
that draws itself, an arrangement nobody wrote for you.

## Two bases, one decision

[Chapter 4](declare-docs:guide:tree) gave the promotion rule — write a class when you
instantiate it twice, or when you need to name its type. This chapter adds the only other
question worth asking up front: **does it have a value and a place in the focus order?**

- **`extends View`** — structure. A card, a badge, a panel. It arranges things.
- **`extends Control`** — a *control*. It has a value the user changes, it takes focus, it
  answers Space and Enter.

That is the whole decision, and it is not architecture. Most of what you write extends
`View` and needs nothing from this chapter.

## What `extends Control` hands you

A control is where hand-rolling gets expensive: hover and press states that behave on
touch, a disabled state that suppresses both, focus, keyboard activation. `Control` owns
all of it, so your class starts from the same floor `Button` does.

```declare
class Stepper extends Control [ width = 96, height = 28, cornerRadius = 7,
    value: number = 0,
    step:  number = 1,

    input(v: number) { value = v },
    press() { input(value + step) },
    onClick() { if (!disabled) press() },

    fill = { down ? theme.controlPressed : hot ? theme.controlHover : theme.control },
    t: Text [ x = center, y = center, fontSize = 13, textColor = { theme.text },
        text = { "" + classroot.value } ]
    ]


App [ width = 320, height = 130,
    n: number = 0,
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 12 ],
        Stepper [ value = { app.n }, input(v: number) { app.n = v } ],
        Text [ textColor = { theme.text }, text = { `count: ${app.n}` } ]
        ]
    ]
```

Click it — then **press Tab, and press Space**. You wrote no key handling, no focus
management, and no hover tracking, and the focus ring that travels to it was never
declared by anyone.

Three things arrived without being asked for:

- **`hot` and `down`** — hover and press, already gated by `disabled`, so a disabled
  control cannot light up. Style against these, never the raw `hovered`/`pressed`
  intrinsics from [chapter 7](declare-docs:guide:interaction); that gate is the whole
  difference.
- **Keyboard activation** — Space and Enter call `press()`, the same path the pointer
  takes. One override, both input methods.
- **Focus** — the control is in the tab order, a click claims focus, and the app-level
  focus ring finds it.

## The contract is the one you already know

Look at what `press()` does: it calls `input()`. It does **not** write `value`.

That is [chapter 8](declare-docs:guide:controls)'s value pattern, seen from the other
side. The use site above constrained `value = { app.n }` and overrode `input` — so the
control's own edit lands in `app.n`, and the constraint carries it back down. Had `press`
written `value` directly, it would have been assigning to a constrained slot, and the
runtime would have refused it.

> **A control delivers; it never stores on behalf of its owner.**

Write it that way and your class works standalone *and* app-owned, with no branch — which
is exactly why every library control does.

## Drawing your own marks

Small monochrome marks are **drawn, not typed**. Fonts are not UI objects: their glyphs
may be absent, they rasterize differently per platform, and the shapes are wrong — a `✓`
sits on the text baseline and reads like a square-root sign. `Icon` is the base for the
alternative, and the set that ships (chevrons, checks, the appearance triad) is written
exactly this way.

Author in a **16×16 box** and override `draw`:

```declare
class BoltIcon extends Icon [
    draw(d: Draw) {
        d.scale(unit, unit)
        d.strokeStyle = ink
        d.lineWidth = weight / unit
        d.lineCap = "round"
        d.lineJoin = "round"
        d.beginPath()
        d.moveTo(9.5, 1.5)
        d.lineTo(4.5, 8.5)
        d.lineTo(8, 8.5)
        d.lineTo(6.5, 14.5)
        d.lineTo(11.5, 7.5)
        d.lineTo(8, 7.5)
        d.closePath()
        d.stroke()
        }
    ]


App [ width = 320, height = 120, fill = white, textColor = black,
    row: View [ x = 20, y = 24,
        layout: SimpleLayout [ axis = x, spacing = 18 ],
        BoltIcon [ iconSize = 16 ],
        BoltIcon [ iconSize = 24 ],
        BoltIcon [ iconSize = 44 ]
        ]
    ]
```

One path, three sizes, no variants. Two details carry that:

- **`unit` scales the box** to whatever size the host asked for, so a 44px icon is the
  16px icon at 2.75×, exactly.
- **`weight / unit` cancels the scale**, so the stroke lands at a constant width in real
  pixels at every size. That is why the three above look like one family instead of the
  large one looking fat.

`ink` follows the prevailing text colour, so an icon beside a muted label goes muted on
its own — with one trap worth knowing: that slot falls back to black platform-wide, so an
icon in a context that never sets a text colour renders black and vanishes on a dark
surface. State `ink` when you are not sure.

## An arrangement nobody wrote for you

`SimpleLayout`, `WrappingLayout` and `ResponsiveLayout` are not built in either — they are
`Layout` subclasses, each one essentially a single method. The seam is `place()`: return
one box per laid child, and the runtime positions them.

```declare
class DiagonalLayout extends Layout [
    step: number = 16,
    place() {
        let i = 0
        return this.laid().map((c) => {
            const box = ({ x: i * this.step, y: i * this.step })
            if (c.visible) i = i + 1
            return box
            })
        }
    ]


App [ width = 340, height = 170, fill = white,
    deck: View [ x = 20, y = 20,
        layout: DiagonalLayout [ step = 20 ],
        View [ width = 140, height = 44, cornerRadius = 8, fill = steelblue ],
        View [ width = 140, height = 44, cornerRadius = 8, fill = cadetblue ],
        View [ width = 140, height = 44, cornerRadius = 8, fill = slategray ]
        ]
    ]
```

`laid()` is the children this strategy is responsible for, and boxes align with it by
index. Note the one genuinely surprising permission: **a layout may aggregate over its
children, where a constraint may not.** `place()` can total widths, measure the longest
row, divide remaining space — the thing [chapter 3](declare-docs:guide:relationships)
refuses in a `{ }` body. That is not an inconsistency; arranging children is precisely a
layout's job, and it is the reason the aggregation you sometimes want belongs here rather
than in a binding.

## The same tools the library uses

When you build something the library has no equivalent for — a popover, a palette, a
window — you reach for the same short list its own overlays do, and none of it is
reserved:

| you need | the call |
|---|---|
| paint above your siblings | `this.raise()` |
| position against a view in another coordinate space | `v.rootOrigin()` |
| move keyboard focus, or save and restore it | `Focus.focus(v)` · `Focus.getFocus()` |
| take the arrow keys from the page while an overlay roves | `Keys.navClaim(this, true)` |
| build structure that genuinely cannot be declared | `parent.createView(tag, props)` · `v.discard()` |
| gate what Tab descends into | override `tabOrder()`, compose `tabDefault()` |

Two habits keep such a thing well-behaved: **claim in pairs** — a `navClaim(…, true)` on
open needs its `false` on close, or the page stays unscrollable — and **restore focus one
turn later**, because an in-flight keystroke has to finish against the old focus or the
key that closed your panel reopens it.

## Reskin, don't hardcode

Read `theme` tokens rather than literal colours — `theme.control`, `theme.text`,
`theme.accent`, `theme.line` — and your component follows the app's theme and its dark
mode without knowing either exists. That is the only thing standing between a component
that drops into someone else's app and one that has to be edited first, and it is the
same discipline [chapter 6](declare-docs:guide:style) taught for the app itself.

---

The proof of all this is readable: open `library/`. `Checkbox` is forty lines,
`SimpleLayout` is one method, `Segmented` derives its sliding pill from the same
constraint arithmetic you have been writing since chapter 3. They are worth reading not
because you need to know their internals, but because they are the answer to *what does
good Declare look like at component scale* — and nothing in them is a move you cannot
make.

**What you can now say:** you can build a control that answers the pointer, the keyboard
and the focus system on equal terms with the library's, draw a mark that stays crisp at
any size, invent an arrangement, and reach the handful of runtime services that overlays
need — knowing the whole time that you are writing the same kind of thing the box ships.

[Next: **A layer is a member you open, not a view you show** →](declare-docs:guide:above-the-flow)
