<!-- nav: Size, position, layout -->
<!-- part: Building -->

# Size, position and layout

Where CSS gives you several layout systems — flow, flexbox, grid — each with its own
vocabulary and its own negotiations, Declare gives you one idea: **a view's
[`layout`](declare-docs:View.layout) attribute arranges its children**, and a view with no
size set takes its size from what it holds. Numbers and arithmetic are always available
underneath, for the surfaces where you place things yourself.

A view's place and size come down to four values — `x` and `width`, `y` and `height` —
and each one has a single decider:

> **Each of `x`, `y`, `width` and `height` is decided by exactly one thing: the view's
> content, the view itself, or the layout of its parent.**

To learn why a view is where it is, find the one thing that decided it.

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

[`SimpleLayout`](declare-docs:SimpleLayout) stacks children along an axis, `spacing` apart,
in the order they are written. Neither view gives a size: each is as large as what it
holds. Because layout is an attribute and not a type, it can be swapped, nested, driven by
a constraint, or animated.

The library ships two more arrangements, also written in Declare (`library/`):
[`WrappingLayout`](declare-docs:WrappingLayout) flows children onto new rows when the width
runs out, and [`ResponsiveLayout`](declare-docs:ResponsiveLayout) changes arrangement with
the view's width (below). When the arrangement you need is genuinely your own — masonry, a
radial menu, a timeline — you write a layout class with one method;
[Your own views](declare-docs:guide:your-own-views@writing-a-layout) shows how.

## What a layout decides

A layout always decides its children's positions along its flow: a row places each
child's [`x`](declare-docs:View.x), a column each child's [`y`](declare-docs:View.y).
Across the flow it decides them only when you set its `align` — `start`, `center`, `end`,
`baseline` to sit a row of text and controls on one line, or `stretch` (below). Without
one, each child places itself across, with `y = center` for instance.

What a layout decides, the child does not also state — in any spelling, a number,
`center`, or a `{ }`. Declaring it anyway is a compile error at that line, and the message
names what to write instead. The rule is what keeps an arrangement predictable: one
value, one decider.

A child that must stand apart says so itself. `ignoreLayout = true` takes it out of the
arrangement: it keeps its own position while its siblings are arranged around it — a
badge pinned to a corner of a stacked card. `ignoreClip = true` lets a child paint and
receive clicks outside a parent that clips — a window's resize border living just
outside the box it resizes.

## Sizes

A view that states no size is as large as its content: the text a
[`Text`](declare-docs:Text) lays out, the bitmap an [`Image`](declare-docs:Image) shows, or
the boxes of its visible children. A size it does state is a constant, `width = 300`, or a
constraint, `width = { parent.width - 40 }`.

Sizes travel in two directions. A size can be **passed down**: `width = 100%` is the room
the parent gives. Or it can be **gathered up** from the children, when the view states
none. On any one axis a size goes one way, not both — a child sized from its parent does
not count toward the parent's content size on that axis. So a card given a width hands it
down to its wrapping text, and the text's height comes back up to size the card.

Two read-only facts, [`contentWidth`](declare-docs:View.contentWidth) and
[`contentHeight`](declare-docs:View.contentHeight), give what the content wants, so a limit
is ordinary arithmetic rather than a special attribute:

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

### A child asks its layout

Some sizes depend on the siblings: the room left over, or the room there isn't. A child
never works those out itself. It states a fact about itself, and the layout, which sees
every child, sizes it.

- [`flexes = true`](declare-docs:View.flexes) asks for a share of the room left along the
  flow. The children that do not flex keep their own sizes, and the flexing ones share
  what remains, equally; a number weights the share, so `flexes = 2` takes twice what
  `true` takes.
- [`shrinks = true`](declare-docs:View.shrinks) lets a child give some of its size up when
  the run is too long for the view.
- [`minWidth`](declare-docs:View.minWidth) and `maxWidth` (and the heights) bound what the
  layout gives it.

The layout sizes everything else first, then shrinks or shares, each child within its
range. It is how a page frame is written:

```declare
App [ width = 320, height = 200, fill = white, textColor = black,
    layout: SimpleLayout [ axis = y ],
    header: View [ width = 100%, height = 36, fill = steelblue ],
    body: View [ width = 100%, flexes = true,
        layout: SimpleLayout [ axis = x ],
        list: View [ height = 100%, flexes = true, fill = whitesmoke,
            Text [ x = 12, y = 12, text = "the list takes what is left" ]
            ],
        rail: View [ width = 90, height = 100%, fill = gainsboro ]
        ],
    footer: View [ width = 100%, height = 28, fill = lightsteelblue ]
    ]
```

Resize the window and only `body` and `list` change size; nothing computes a height by
subtracting the others. An empty flexing view is a [`Spacer`](declare-docs:Spacer): one
between two groups in a row pushes them apart, and one on each side centers the run.

Across the flow, the same holds. Only the layout sees all its children, so "as tall as the
tallest" is asked of it: `align = stretch` makes every child whose size comes from its
content as large as the largest — a row as tall as its tallest child, a menu's items as
wide as its widest. A child that states its own size keeps it.

A size a class sets is a default, like anything else a class sets, and a default gives way
to the layout. A class that fills its column with `width = 100%` still flexes when a use
site puts it in a row with `flexes = true`.

## Padding and Card

An inset is an attribute of the **view**: [`padding`](declare-docs:View.padding), one
number for all four sides or `[top, right, bottom, left]`. A padded view has an inside,
and every child is measured from it — one a layout arranged, one that placed itself, one
that opted out of the layout. A layout does not need to know; it arranges within the room
it is given.

Two spellings answer two questions:

- **`width = 100%`** means *the room I am given*: the parent's width less its padding.
  `x = center` and `x = end` resolve against the same room.
- **`width = { parent.width }`** means *the parent's own box*, padding and all. Paired
  with a negative `x` it gives a band that runs edge to edge inside a padded card.

Paint does not move with padding: [`fill`](declare-docs:View.fill),
[`stroke`](declare-docs:View.stroke) and [`cornerRadius`](declare-docs:View.cornerRadius)
belong to the view's own box, so a card's background still covers its inset. And an
unset size counts the padding, so a padded view grows and shrinks with what it holds,
insets included.

That arrangement is common enough that the library ships it. **[`Card`](declare-docs:Card)**
is a view whose fill, corner radius, hairline edge, padding and stacking layout come from
the theme, so its children are a plain list. **[`Divider`](declare-docs:Divider)** is the
rule between them — a painted view, not a border, spanning the parent's content width:

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

Everything is a default: `stroke = null` drops the edge, and a `layout:` of your own
replaces the stack (the padding stays; `padding = 0` removes it).

## Placing by hand

Position is `x` and `y`, measured from the parent's content origin. Two named literals
cover the common cases: `x = center` and `x = end` (and the same on `y`) center a view in
its parent, or push it flush to the far edge, and follow as sizes change.

Hand placement is the right tool on free-form surfaces — a diagram, a canvas of cards,
an overlay, the cells of a calendar whose geometry is a formula. For anything that is a
row, a column, a flow or a grid of parts, use a layout: a ladder of hand-set `y` values is
a layout written out by hand, and it breaks the first time a size changes.

Siblings that overlap paint in the order they are written: **later members draw on
top**. There is no z-index; you restack by reordering, so reading order is paint order.
Floating chrome, such as a toolbar over content, is declared last.

## Responsiveness

`ResponsiveLayout` takes a list of **plans**, each saying "from this width up, arrange
the children like this", and keeps the right plan applied as the view's width changes:

```declare
App [ width = 520, height = 120, fill = white, textColor = black,
    bar: View [ x = 20, y = 20, width = { app.width - 40 },
        layout: ResponsiveLayout [ plan = { [
            ({ from: 480, flow: "row", share: ({ menu: 30, body: 70 }) }),
            ({ from: 0, flow: "stack", share: ({ menu: 100, body: 100 }) })
            ] } ],
        menu: View [ height = 60, fill = gainsboro ],
        body: View [ height = 60, fill = whitesmoke ]
        ]
    ]
```

Wide, it is a 30/70 row; narrow, a stack of two full-width bands. `share` is width in
both flows: in a row the shares divide the run, in a stack each one sets its band's width
on its own — so the narrow plan names `menu` and `body` at 100. A plan watches its **own**
view's width, not the window's, so plans nest: a parent decides how much room a child
gets, and the child's own layout decides what to do with it. The reference entry for
`ResponsiveLayout` has the full plan vocabulary.

Smaller adjustments are ordinary constraints: `spacing = { app.width < 480 ? 6 : 12 }`,
`flexes = { app.wide }`, or `axis = { app.narrow ? "y" : "x" }` on a `SimpleLayout` when
only the direction changes. A configuration that holds at some widths, with attributes
that differ and children only those widths have, is a [`State`](declare-docs:State)
([Program structure](declare-docs:guide:structure@a-view-in-each-of-the-user-s-places)).

When what changes is **where the room goes** — a panel beside the main view on a wide
screen, a strip under it on a narrow one, the main view taking what is left either way —
the arrangement is a layout of your own. Its one method returns a box for each child, and
a box can carry a size as well as a place, so neither child states a size or a place: the
layout divides the room it has one way or the other, and follows the room as it changes.
Written without it, each child carries the division itself, `width = { app.wide ? … : … }`,
worked out again in each — a layout done by hand
([Your own views](declare-docs:guide:your-own-views@writing-a-layout)).

An `App` with no size fills its host — the window, or the element it is embedded in —
and resizes with it, which is why responsive code reads `app.width`. And often the
cleanest answer is a floor: [`App [ minWidth = 360 ]`](declare-docs:App) holds the design
at that width and lets a narrower window pan, instead of reflowing a layout below the
width where it works.

## Scale and rotation

[`scale`](declare-docs:View.scale), [`rotation`](declare-docs:View.rotation) (degrees,
clockwise) and their pivot, [`pivotX`](declare-docs:View.pivotX)/[`pivotY`](declare-docs:View.pivotY),
transform a view and its subtree. Every part of the system agrees on the transformed
geometry: painting, clicking, a layout packing the view, and a parent sizing to its
content all see the same box, so a view at `scale = 0.5` really takes half the room.

---

**What you can now do:** arrange children with layouts, size views from content or by
rule, let a child ask its layout for room, pad them, respond to width without media
queries, and place things by hand where a surface is genuinely free-form.

[Next: **Scrolling** →](declare-docs:guide:scrolling)
