<!-- nav: Size, position and layout -->
<!-- part: Building -->

# Size, position and layout

Where CSS gives you several layout systems — flow, flexbox, grid — each with its own
vocabulary and its own negotiations, Declare gives you one idea: **a view's [`layout`](declare-docs:View.layout)
attribute arranges its children**, and a view with no size set takes its size from
what it holds. Numbers and arithmetic are always available underneath, for the
surfaces where you place things yourself.

> **Layouts arrange. Sizes come from content unless you say otherwise. A layout places
> its children, and what it places, the child does not also declare.**

## Layout is an attribute

How a view's children are arranged is a `layout:` member on the view itself — not a
special container type you build the tree around:

```declare
App [ width = 320, height = 170, fill = white, textColor = black,
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        Text [ fontWeight = semibold, text = "A column" ],
        row: View [
            layout: SimpleLayout [ axis = x, spacing = 8, align = center ],
            View [ width = 40, height = 40, cornerRadius = 8, fill = steelblue ],
            View [ width = 40, height = 24, cornerRadius = 8, fill = cadetblue ],
            Text [ text = "a row, centered across" ]
            ],
        Button [ label = "and a button" ]
        ]
    ]
```

[`SimpleLayout`](declare-docs:SimpleLayout) stacks children along an axis, `spacing` apart, in the order they are
written; `align` places them across it — `start`, `center`, `end`, or `baseline` to sit
a row of text and controls on one line. Neither view gives a size: each is as large as
what it holds. Because layout is an attribute and not a type, it can be swapped,
nested, driven by a constraint, or animated.

The library ships these arrangements, all written in Declare (`library/`):

| layout | what it does |
|---|---|
| `SimpleLayout` | stacks children along `axis`, `spacing` apart; `align` places them across it |
| [`WrappingLayout`](declare-docs:WrappingLayout) | flows children onto new rows when the width runs out; [`justify`](declare-docs:WrappingLayout.justify) sets each row along the flow |
| [`ResponsiveLayout`](declare-docs:ResponsiveLayout) | switches arrangement by the view's width, from a list of plans (below) |
| [`Spacer`](declare-docs:Spacer) | not a layout: a child that absorbs the leftover space in a row or column |

```declare
App [ width = 280, height = 120, fill = white,
    tags: View [ x = 20, y = 20, width = 240,
        layout: WrappingLayout [ spacing = 8, rowSpacing = 8 ],
        View [ width = 70, height = 28, cornerRadius = 14, fill = gainsboro ],
        View [ width = 90, height = 28, cornerRadius = 14, fill = gainsboro ],
        View [ width = 60, height = 28, cornerRadius = 14, fill = gainsboro ],
        View [ width = 100, height = 28, cornerRadius = 14, fill = gainsboro ]
        ]
    ]
```

Narrow the `tags` width and the pills re-wrap. When the arrangement you need is
genuinely your own — masonry, a radial menu, a timeline — you write a layout class with
one method; [Custom components](declare-docs:guide:custom-components@an-arrangement-nobody-wrote-for-you) shows how.

> **From CSS:** there is no flexbox, no grid, no document flow and no z-index.
> Children sit at their own `x`/`y` unless a `layout` arranges them; stacking is
> declaration order; "responsive" is a plan or a constraint reading a width, not a
> media query. Your spatial intuitions transfer; the negotiation machinery stays behind.

## What a layout places belongs to the layout

A row places each child's [`x`](declare-docs:View.x); with `align` it places [`y`](declare-docs:View.y) too. What a layout places, the
child must not also set — in any spelling, a number, `center`, or a `{ }`. Declaring it
anyway is a compile error at that line, and the message names what to use instead. The
rule is what keeps an arrangement predictable: one attribute, one owner.

A child that must stand apart says so itself. `ignoreLayout = true` takes it out of the
arrangement: it keeps its own position while its siblings are arranged around it — a
badge pinned to a corner of a stacked card. `ignoreClip = true` lets a child paint and
receive clicks outside a parent that clips — a window's resize border living just
outside the box it resizes.

## A view's size, per axis

Each axis — width and height — is one of three things, chosen by what you write:

- **unset** — the view is as large as its content: the text a [`Text`](declare-docs:Text) lays out, the
  bitmap an [`Image`](declare-docs:Image) shows, and the boxes of its visible children;
- **a constant** — `width = 300`;
- **a constraint** — `width = { parent.width - 40 }`, whatever the expression says.

A child sized *from* its parent does not count toward the parent's content size on that
axis, so sizing runs one way per axis: a card given a width hands it down to wrapping
text, and the text's height comes back up to size the card.

Two read-only facts, [`contentWidth`](declare-docs:View.contentWidth) and [`contentHeight`](declare-docs:View.contentHeight), give what the content wants, so
a limit is ordinary arithmetic rather than a special attribute:

```declare
App [ width = 260, height = 150, fill = white, textColor = black,
    box: View [ x = 20, y = 20, width = 200, cornerRadius = 8, fill = whitesmoke, clip = true,
        padding = 10,
        height = { Math.min(contentHeight, 90) },
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        Text [ text = "grows with its content" ],
        Text [ text = "up to 90 pixels" ],
        Text [ text = "then stops" ],
        Text [ text = "and clips the rest" ]
        ]
    ]
```

Change the limit to `scrolls = y` on the box instead, and the extra content scrolls
([Scrolling](declare-docs:guide:scrolling)).

## Padding, and the card it makes

An inset is an attribute of the **view**: [`padding`](declare-docs:View.padding), one number for all four sides or
`[top, right, bottom, left]`. A padded view has an inside, and every child is measured
from it — one a layout arranged, one that placed itself, one that opted out of the
layout. A layout does not need to know; it arranges within the room it is given.

Two spellings answer two questions:

- **`width = 100%`** means *the room I am given*: the parent's width less its padding.
  `x = center` and `x = end` resolve against the same room.
- **`width = { parent.width }`** means *the parent's own box*, padding and all. Paired
  with a negative `x` it gives a band that runs edge to edge inside a padded card.

Paint does not move with padding: [`fill`](declare-docs:View.fill), [`stroke`](declare-docs:View.stroke) and [`cornerRadius`](declare-docs:View.cornerRadius) belong to the
view's own box, so a card's background still covers its inset. And an unset size counts
the padding, so a padded view grows and shrinks with what it holds, insets included.

That arrangement is common enough that the library ships it. **[`Card`](declare-docs:Card)** is a view whose
fill, corner radius, hairline edge, padding (16) and stacking layout come from the
theme, so its children are a plain list. **[`Divider`](declare-docs:Divider)** is the rule between them — a
painted view, not a border, spanning the parent's content width:

```declare
App [ width = 320, height = 190, fill = #F4F6FA, textColor = #172530,
    Card [ x = 20, y = 20, width = 280,
        Text [ fontSize = 15, fontWeight = semibold, text = "Storage" ],
        Text [ width = 100%, textColor = slategray,
            text = "Cards size themselves to what they hold, padding included." ],
        Divider [ ],
        Button [ label = "Manage" ]
        ]
    ]
```

Everything is a default: `stroke = null` drops the edge, a `layout:` of your own
replaces the stack (the padding stays; `padding = 0` removes it). A card's direct
children are `Text`, not [`TextLabel`](declare-docs:TextLabel): a `TextLabel` positions itself vertically, and
inside a card the layout owns that position.

## Placing by hand

Position is `x` and `y`, measured from the parent's content origin. Two named literals
cover the common cases: `x = center` and `x = end` (and the same on `y`) center a view in
its parent, or push it flush to the far edge, and follow as sizes change.

Hand placement is the right tool on free-form surfaces — a diagram, a canvas of cards,
an overlay, the cells of a calendar whose geometry is a formula — and in a few small
spots, like the examples in this guide that park one component on a page. For anything
that is a row, a column, a flow or a grid of parts, use a layout: a ladder of hand-set
`y` values is a layout written out by hand, and it breaks the first time a size changes.

## Responsiveness

`ResponsiveLayout` takes a list of **plans**, each saying "from this width up, arrange
the children like this", and keeps the right plan applied as the view's width changes:

```declare
App [ width = 520, height = 120, fill = white, textColor = black, minWidth = 300,
    bar: View [ x = 20, y = 20, width = { app.width - 40 },
        layout: ResponsiveLayout [ plan = { [
            ({ from: 480, flow: "row", share: ({ menu: 30, body: 70 }) }),
            ({ from: 0, flow: "stack" })
            ] } ],
        menu: View [ height = 60, fill = gainsboro ],
        body: View [ height = 60, fill = whitesmoke ]
        ]
    ]
```

Wide, it is a 30/70 row; narrow, a stack. A plan can flow children as a `"row"` or a
`"stack"`, give named children a percentage of the width (`share`), and drop one with a
share of `0`. It watches its **own** view's width, not the window's, so plans nest: a
parent decides how much room a child gets, and the child's own layout decides what to do
with it. That nesting, with an ordinary inline child carrying its own `layout:`, is the
answer to most things a single plan cannot say. The reference entry for
`ResponsiveLayout` has the full plan vocabulary.

Smaller adjustments are ordinary constraints: `spacing = { app.width < 480 ? 6 : 12 }`,
or `axis = { app.narrow ? "y" : "x" }` on a `SimpleLayout` when only the direction
changes. In a row whose children keep their natural widths, a `Spacer [ ]` absorbs the
slack: one between two groups pushes them apart, one on each side centers the run. A
wholly different configuration at a width is a [`State`](declare-docs:State)
([Motion and states](declare-docs:guide:motion@a-state-is-a-reversible-bundle-of-overrides)). And often the cleanest answer is a
floor: [`App [ minWidth = 360 ]`](declare-docs:App) holds the design at that width and lets a narrower
window pan, instead of reflowing a layout below the width where it works.

## The app fills its host

An `App` with no size fills its host — the window, or the element it is embedded in —
and resizes with it, which is why responsive code reads `app.width`. Give an app
explicit dimensions only to make a fixed-size widget, as most examples in this guide do.

## Scale and rotation

[`scale`](declare-docs:View.scale), [`rotation`](declare-docs:View.rotation) (degrees, clockwise) and their pivot, [`pivotX`](declare-docs:View.pivotX)/[`pivotY`](declare-docs:View.pivotY), transform a
view and its subtree. Every part of the system agrees on the transformed geometry:
painting, clicking, a layout packing the view, and a parent sizing to its content all
see the same box, so a view at `scale = 0.5` really takes half the room. Per-axis scale,
skew and 3D rotation under a parent's [`perspective`](declare-docs:View.perspective) follow the same rule; the [`View`](declare-docs:View)
reference entry lists them.

---

**What you can now do:** arrange children with layouts, size views from content or by
rule, pad them, respond to width without media queries, and place things by hand where
a surface is genuinely free-form.

[Next: **Scrolling** →](declare-docs:guide:scrolling)
