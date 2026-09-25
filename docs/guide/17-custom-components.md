<!-- nav: Custom components and drawing -->
<!-- part: Building -->

# Custom components and drawing

Everything you have used so far — [`Button`](declare-docs:Button), [`Slider`](declare-docs:Slider), [`Table`](declare-docs:Table), [`Menu`](declare-docs:Menu) — is written in
Declare, in `library/`, in the language you have been reading. No library class name
appears anywhere in the compiler or the runtime; the compiler cannot tell a library
component from yours, because it never asks. This chapter is what it takes to build a
piece that behaves like the ones you were given: a control that answers the keyboard, a
mark that draws itself, an arrangement nobody wrote for you.

> **The library is ordinary Declare that happens to ship in the box. Your components are
> its equals.**

## View or Control

One question decides the base class: **does it have a value the user changes, and a
place in the keyboard focus order?**

- **`extends View`** — structure: a card, a badge, a panel. Most of what you write.
- **`extends Control`** — a control: it takes focus, answers Space and Enter, and has
  interaction states that respect `disabled`.

## What `extends Control` gives you

Hover and press states that behave on touch, a disabled state that suppresses both,
focus, keyboard activation: [`Control`](declare-docs:Control) owns all of it, so a class of yours starts from the
same floor `Button` does.

```declare
class Stepper extends Control [ width = 96, height = 28, cornerRadius = 7,
    value: number = 0,
    step:  number = 1,

    input(v: number) { value = v },
    press() { input(value + step) },

    fill = { down ? theme.controlPressed : hot ? theme.controlHover : theme.control },
    t: Text [ x = center, y = center, fontSize = 13, textColor = { theme.text },
        text = { "" + classroot.value } ]
    ]


App [ width = 320, height = 130, theme = { SanFrancisco },
    n: number = 0,
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 12 ],
        Stepper [ value = { app.n }, input(v: number) { app.n = v } ],
        Text [ textColor = { provided("theme").text }, text = { `count: ${app.n}` } ]
        ]
    ]
```

Click it, then press Tab and Space. You wrote no key handling, no focus management and no
hover tracking, and the focus ring that travels to it was declared by nobody.

- **[`hot`](declare-docs:Control.hot) and [`down`](declare-docs:Control.down)** are hover and press, already gated by `disabled`. Style from these,
  not from the raw [`hovered`](declare-docs:View.hovered) and [`pressed`](declare-docs:View.pressed) facts, so a disabled control never lights up.
- **`press()`** is the one activation path: Space, Enter and a click all land there.
  Override `press()` to say what activating your control does; override `onClick` only
  when a click should mean something else.
- **Focus**: the control is a tab stop, a click focuses it, and the app's focus ring finds
  it. Override `focusShape()` to ring only part of it, as a [`Radio`](declare-docs:Radio) rings its dot.
- **`theme`**: `Control` declares an attribute named `theme` that reads the provided theme,
  which is why the body above writes `theme.control` directly. A class that extends
  [`View`](declare-docs:View) reads `provided("theme").control` instead. Either way, read tokens rather than
  literal colors, and the component follows any app's theme and dark mode.

A method you declare in a subclass replaces the base's method of the same name, handlers
included. To keep the base's behavior as well, call it — `super.press()` — before your
work, after it, or only on some paths:

```declare
class Stepper extends Control [ width = 96, height = 28, value: number = 0,
    input(v: number) { value = v },
    press() { input(value + 1) }
    ]

class BoundedStepper extends Stepper [ max: number = 5,
    press() { if (value < max) super.press() }
    ]

App [ width = 320, height = 60, theme = { SanFrancisco },
    BoundedStepper [ x = 20, y = 16, fill = { provided("theme").control } ]
    ]
```

Methods and attributes are what a subclass refines; the base's children are not. A
subclass cannot declare a child the base already has — the compiler refuses it — so
when a subclass needs a child to look or behave differently, the base exposes that as
an attribute the child reads (a color, a label, a size) or as a method to override.

## The contract is the one you already know

`press()` above calls `input()`; it does **not** write `value`. That is the value pattern
of [Controls](declare-docs:guide:controls@contract-one-the-value-pattern) from the other side. The use site constrained
`value = { app.n }` and overrode `input`, so the control's edit lands in `app.n` and comes
back down through the constraint. Had `press` written `value` directly, it would have
been assigning to a constrained attribute, and the runtime would have refused it.

> **A control delivers; it never stores on behalf of its owner.**

Written that way, a control works both standalone and owned by the app, with no branch —
which is why every library control does it.

## Drawing what attributes cannot say

Boxes, rounding, strokes and shadows cover most of an interface. For the rest — a gauge
arc, a sparkline, a mark no font will give you — a view defines a **[`draw`](declare-docs:View.method.draw)** method and
paints itself:

```declare
App [ width = 340, height = 200, fill = white, textColor = black,
    level: number = 62,

    gauge: View [ x = 20, y = 16, width = 160, height = 92,
        draw(d: Draw) {
            const frac = app.level / 100
            d.lineWidth = 12
            d.lineCap = "round"
            d.strokeStyle = 0xD6DCE2
            d.beginPath()
            d.arc(80, 84, 62, Math.PI, Math.PI * 2, false)
            d.stroke()
            d.strokeStyle = frac > 0.8 ? 0xC23528 : 0x2E6FE0
            d.beginPath()
            d.arc(80, 84, 62, Math.PI, Math.PI * (1 + frac), false)
            d.stroke()
            }
        ],

    pct: Text [ x = 20, y = 74, width = 160, textAlign = center, fontSize = 22, fontWeight = bold,
        text = { "" + Math.round(app.level) + "%" } ],

    Slider [ x = 20, y = 130, width = 300, value = { app.level },
        input(v: number) { app.level = v } ]
    ]
```

Drag the slider. The arc follows and turns red past 80%, and you wrote no redraw call,
because:

> **`draw` is an ordinary method, and a constraint calls it. It re-runs when what it read
> changes — never per frame.**

`View` holds a constraint of its own that runs your `draw` through a recorder, so the
body's read of `app.level` is a dependency exactly as it would be in your own `{ }`.
Sitting still, the gauge costs nothing. What it records is a list of plain drawing
operations that every renderer replays, so a drawing is not tied to a canvas: the same
view paints identically as DOM, on a canvas, or in the native Mac host.

- **It pairs with attributes.** The gauge still has a position and size, lays out, and
  takes clicks. Draw the part that is genuinely a shape; leave the box to attributes.
- **`d` is shaped like Canvas2D** — `fillStyle`, `strokeStyle`, `lineWidth`, `beginPath`,
  `moveTo`, `arc`, `bezierCurveTo`, [`fill`](declare-docs:View.fill), [`stroke`](declare-docs:View.stroke), the transforms. `d.w` and `d.h` are
  the view's size; reading one is what makes the drawing re-record on resize. The `Draw`
  type in the reference lists the whole surface.
- **Never animate a drawing's size.** A drawing that reads its size re-records and
  reallocates its backing store every frame an animated size changes. Animate position,
  opacity or color freely.
- **Measure.** Drawing is cached, but a large drawn surface repainting every frame is where
  a smooth app slows down; check the frame rate.

**Pictures in a drawing.** A bitmap comes in through an [`Image`](declare-docs:Image) view, which owns the
loading and the `loaded` fact: `d.drawImage(pic, x, y, w, h)` takes the view (in any of
Canvas2D's argument shapes) and draws nothing until the bitmap arrives. Reading
`pic.loaded` is what re-records the drawing when it does. A hidden
`Image [ visible = false, source = … ]` is the usual holder.

**Text in a drawing.** `d.fillText` and `d.strokeText` take a style after the position — a
`style` bundle ([Text and fonts](declare-docs:guide:text@reusing-a-look-a-class-or-a-named-style)) or an inline record with
[`Text`](declare-docs:Text)'s attribute names — and `measureText` measures with the same record, so a drawing
can size a run before painting it:

```declare
style Caption [ fontSize = 13, smallCaps = true, letterSpacing = 0.5, textColor = #1B2733 ]

App [ width = 240, height = 80, fill = white,
    plate: View [ x = 20, y = 20, width = 200, height = 40,
        draw(d: Draw) {
            const m = measureText("Plate 4", Caption)
            d.fillStyle = 0xE7EBF1
            d.fillRect((d.w - m.width) / 2 - 8, 0, m.width + 16, d.h)
            d.fillText("Plate 4", (d.w - m.width) / 2, (d.h - m.height) / 2 + m.baseline, Caption)
            }
        ]
    ]
```

A style holds exactly what you write: anything left out is the plain default, never an
inherited value, so a measurement means the same wherever it is taken. When a drawn run
should match the text around it, ask for the face in force with
`providedTextStyle(overrides?)`.

## Drawing your own marks: Icon

Small single-color marks are **drawn, not typed**. Font glyphs may be missing, render
differently per platform, and are the wrong shapes — a `✓` sits on the baseline and reads
like a square-root sign. [`Icon`](declare-docs:Icon) is the base for drawn marks, and the set that ships
(chevrons, checks, close, plus and minus, the light/dark/auto triad) is written this way.
Author in a **16×16 box**:

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

One path, three sizes. [`unit`](declare-docs:Icon.unit) scales the 16-box to the requested size, and dividing the
stroke by `unit` keeps its weight constant in real pixels, so the three look like one
family. `ink` follows the provided text color, so an icon beside a muted label goes muted
on its own; where no text color is provided it falls back to black, so state `ink` when
you are not sure. A control names its icons by class — `Button [ iconLeft = "PlusIcon" ]`.

## An arrangement nobody wrote for you

[`SimpleLayout`](declare-docs:SimpleLayout), [`WrappingLayout`](declare-docs:WrappingLayout) and [`ResponsiveLayout`](declare-docs:ResponsiveLayout) are [`Layout`](declare-docs:Layout) subclasses, each
essentially one method. The method is `place()`: return one box per child the layout
manages, and the runtime positions them.

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

`laid()` is the children this layout is responsible for, and the boxes line up with it by
index. A box names only the attributes the layout owns — `{ x, y }` here, so sizes stay
the children's — and `this.contentExtent("width")` is the room to divide, the view's size
less its padding. Note the one permission a layout has that a constraint does not: **a
layout may aggregate over its children** — total their widths, find the longest row —
because arranging children is its job. For an arrangement that glides between two
layouts, extend [`TweenLayout`](declare-docs:TweenLayout) instead
([Animated arrangements](declare-docs:guide:animated-arrangements@a-layout-that-glides)).

## The runtime tools the library uses

When you build something the library has no equivalent for — a popover, a palette, a
window — you reach for the same short list its own overlays use:

| you need | the call |
|---|---|
| paint above your siblings | `this.raise()` |
| a view's position in the app's coordinates | `v.rootOrigin()` |
| move keyboard focus, or save and restore it | [`Focus.focus(v)`](declare-docs:Focus.method.focus) · [`Focus.getFocus()`](declare-docs:Focus.method.getFocus) |
| take the arrow keys from the page while an overlay is open | [`Keys.navClaim(this, true)`](declare-docs:Keys.method.navClaim) |
| build structure that genuinely cannot be declared | `parent.createView("Name", props)` · `v.discard()` |
| decide what Tab reaches inside a container | override [`tabOrder()`](declare-docs:View.method.tabOrder), compose [`tabDefault()`](declare-docs:View.method.tabDefault) |

Two habits keep such a thing well-behaved. **Claim in pairs**: a `navClaim(…, true)` on
open needs its `false` on close, or the page stays unscrollable. **Restore focus a turn
later**: a keystroke still in flight should finish against the old focus, or the key that
closed your panel reopens it.

[`createView`](declare-docs:View.method.createView) is for the rare structure that has no data to drive it; a collection comes
from replication, which reconciles, keys and removes for you. A view you create is yours
to [`discard()`](declare-docs:View.method.discard). A component you only ever name as a string needs `use [ Name ]` at the top
level, or a production build, which drops components nothing names, leaves it out.

---

The proof is readable: open `library/`. [`Checkbox`](declare-docs:Checkbox) is under eighty lines of code,
`SimpleLayout` is one method, and nothing in either is a move you cannot make.

**What you can now do:** build a control on equal terms with the library's, extend a
component and still reach its base, draw what attributes cannot say, author crisp icons,
write a layout, and use the runtime services overlays need.

[Next: **Menus, dialogs and overlays** →](declare-docs:guide:overlays)
