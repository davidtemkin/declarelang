<!-- nav: Size, position, layout -->
<!-- part: Building -->

# Size, position and layout

Layout in Declare is a small model that goes a long way. Where CSS gives you several
layout systems, each with its own vocabulary and its own negotiations, Declare gives you a
handful of ideas — a view that is as large as its content unless it says otherwise, a
`layout` that places a view's children, a size that comes from the parent or from what a
view holds — and they cover a page frame, a scrolling list, a responsive split and a grid
of squares. Nothing in it is special to the platform: the layouts the library ships are
written in Declare, in a few lines each, and when none of them says what you mean, you
write your own with one method and it is exactly as capable as theirs. A layout is an
attribute, so it can be swapped, driven by a constraint, or animated. And because every
size and place has a single decider, you can always ask why a view is where it is, and get
one answer.

This chapter builds it up a step at a time. It starts with a single box and ends with a
small notes reader: a list of notes beside the one that is open, an action bar that comes
and goes, and a phone arrangement where the list and the note take turns. Each step adds
one idea, and by the end the rule that holds them together will be something you have
already watched happen.

## A view and its size

A view's place is its [`x`](declare-docs:View.x) and [`y`](declare-docs:View.y), and its
size its [`width`](declare-docs:View.width) and [`height`](declare-docs:View.height). Here
are two views, one that says how large it is and one that doesn't:

```declare
App [ width = 320, height = 110, fill = white, textColor = black,
    box: View [ x = 20, y = 24, width = 120, height = 60, cornerRadius = 8, fill = steelblue ],
    label: Text [ x = 160, y = 44, text = "as large as its words" ]
    ]
```

The box states its size, 120 by 60. The label states none, so it is as large as what it
holds: the words of its text, in its font. That is true of every view. A view that states
no size takes it from its content: the lines a [`Text`](declare-docs:Text) lays out, the
bitmap an [`Image`](declare-docs:Image) shows, or the boxes of its children. A `Text` with
no width is one line, as long as its words; given a width, it wraps to it (unless
`wrap = false`). Both views here state their places, `x` and `y`, measured from the parent's
top left.

What a view's content wants is available as two read-only facts,
[`contentWidth`](declare-docs:View.contentWidth) and
[`contentHeight`](declare-docs:View.contentHeight), so a limit is ordinary arithmetic rather
than a special attribute: `height = { Math.min(contentHeight, 90) }` grows with the content
up to 90.

An inset is an attribute of the **view**: [`padding`](declare-docs:View.padding), one number
for all four sides or `[top, right, bottom, left]`. A padded view has an inside, and every
child is measured from it; `width = 100%` means *the room I am given*, the parent's width
less its padding, and `x = center` and `x = end` resolve against the same room. Inside a
`{ }`, `parent.width` is the parent's whole box, padding included; the room inside it is
[`parent.contentBox("width")`](declare-docs:View.method.contentBox). Paint does not move:
[`fill`](declare-docs:View.fill), [`stroke`](declare-docs:View.stroke) and
[`cornerRadius`](declare-docs:View.cornerRadius) belong to the view's own box, and an unset
size counts the padding. The library's [`Card`](declare-docs:Card) is that arrangement made
once: a padded, rounded, stacking view whose look comes from the theme.

## A column

Placing every view by hand gets tedious, and brittle: change one size and the views
below it are in the wrong place. So a view can be given a **layout**, which places its
children for it. A layout is not a special container type you build the tree around. It
is a `layout:` member on the view itself:

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

[`SimpleLayout`](declare-docs:SimpleLayout) stacks children along an axis, `spacing`
apart, in the order they are written. The column stacks its three children down the page;
the row inside it lines its three up across. Neither the column nor the row states a size,
so each is as large as what it holds, and the children state no `x` or `y` of their own:
the layout gives them their places. The library also ships
[`WrappingLayout`](declare-docs:WrappingLayout), which flows children onto new rows when
the width runs out, and [`ResponsiveLayout`](declare-docs:ResponsiveLayout), which the notes
reader uses below.

A layout always decides its children's positions **along** its flow: a row places each
child's `x`, a column each child's `y`. Across the flow it decides them only when you set
its `align`: `start`, `center`, `end`, `baseline` to sit a row of text and controls on one
line, or `stretch` (below). Without one, each child places itself across: at the start,
unless it says otherwise, with `y = center` for instance.

What a layout decides, its child does not also state, in any spelling: a number, `center`,
or a `{ }`. Give the button `y = 40` and the program refuses the second decider, saying
what to write instead:

> Button.y — View's SimpleLayout places its children, so this child does not declare its y.
> Remove it and let the layout place the child, or set 'ignoreLayout = true' on the child
> to place it yourself.

`ignoreLayout = true` is for a child that genuinely stands apart, a badge pinned to a corner
of a stacked card: it keeps its own position while its siblings are arranged around it.

## The frame

Now the notes reader. From here on, each example is the one before it with one thing
added, its lines marked `// new` or `// changed`. It starts as a frame: a header and a body,
filling the window.

```declare
App [ width = 360, height = 240, fill = white, textColor = black,
    layout: SimpleLayout [ axis = y ],
    header: View [ width = 100%, height = 40, fill = steelblue,
        Text [ x = 12, y = center, textColor = white, fontWeight = semibold, text = "Notes" ]
        ],
    body: View [ width = 100%, flexes = true, fill = whitesmoke ]
    ]
```

The App's layout stacks the two bands. Each band's width is `100%`, the room the App gives
it. The header states its height. The body states none: it `flexes`, which asks the layout
for a share of the room left over.

That is how a size that depends on the siblings is written. A child never works it out
itself, as the window's height minus the others. It states a fact about itself, and the
layout, which sees every child, sizes it:

- [`flexes = true`](declare-docs:View.flexes) asks for a share of the room left along the
  flow. The children that don't flex keep their sizes, and the flexing ones share what
  remains, equally; `flexes = 2` takes twice what `true` takes. Along the flow,
  `width = 100%` is not what remains: it is the view's whole room, so the siblings run past
  the end.
- [`shrinks = true`](declare-docs:View.shrinks) lets a child give some of its size up when
  the run is too long for the view. When nothing shrinks, the run goes on past the view's
  end, and the view's `clip` or `scrolls` decides what shows.
- [`minWidth`](declare-docs:View.minWidth) and `maxWidth`, and the heights, bound what
  the layout gives it.

In a real program the App states no size: it fills the window, and when the window
changes, only the body's height changes with it. An empty flexing view is a
[`Spacer`](declare-docs:Spacer): one between two groups in a row pushes them apart. Room is
left over only in a view that has a size of its own along the flow, a stated one or one its
parent gives it; a row as long as its children has none to share, and a `Spacer` in it gets
nothing.

## A list that fills and scrolls

The body becomes a row: a list of notes beside a pane where an open note will show. Each
note is a row with a title and a wrapped preview, as wide as the list.

```declare
class NoteRow extends View [ width = 100%, padding = 8,   // new: a row for each note
    layout: SimpleLayout [ axis = y, spacing = 2 ],
    Text [ fontWeight = semibold, text = { :title } ],
    Text [ width = 100%, fontSize = 12, textColor = slategray, text = { :text } ]
    ]


App [ width = 360, height = 240, fill = white, textColor = black,
    notes: Dataset { { "items": [
        { "title": "Groceries", "text": "Oat milk, lemons, the good bread." },
        { "title": "Garden", "text": "Move the rosemary out of the shade before the frost." },
        { "title": "Plumber", "text": "The kitchen tap again. Ask about the boiler." },
        { "title": "Books", "text": "Return the two library books by Friday." }
        ] } },
    layout: SimpleLayout [ axis = y ],
    header: View [ width = 100%, height = 40, fill = steelblue,
        Text [ x = 12, y = center, textColor = white, fontWeight = semibold, text = "Notes" ]
        ],
    body: View [ width = 100%, flexes = true,
        layout: SimpleLayout [ axis = x, align = stretch ],   // new: the body is a row
        list: View [ width = 160, scrolls = y, fill = whitesmoke,   // new
            datapath = { app.notes.value },
            layout: SimpleLayout [ axis = y ],
            NoteRow [ datapath = :items[] ]
            ],
        pane: View [ flexes = true,   // new
            Text [ x = 16, y = 16, textColor = slategray, text = "No note open" ]
            ]
        ]
    ]
```

Each value here comes from somewhere, and something decides it:

| value | comes from | decided by |
|---|---|---|
| the list's width | stated, 160 | the list |
| the list's height | its parent, `align = stretch` | the body's layout |
| a row's width | its parent, `100%` | the row |
| a preview's width | its parent, `100%`, which is how it knows where to wrap | the preview |
| a row's and a preview's height | what each holds: its lines, its title and preview | what it holds |

The list's rows add up to more than its height, and because it `scrolls = y`, the rest
scrolls. The list is a **pane**: a region that scrolls on its own inside a frame that does
not. **A pane needs room it is given** — here, the stretch — since one whose height came from
its rows would be as tall as they are and have nothing to scroll. The frame is this reader's
choice, not the template for every app: an app whose content is one column lets the App
itself scroll, the browser's page, and what must stay on screen opts out with
`ignoreScroll = true` ([Scrolling](declare-docs:guide:scrolling)).

A child whose size comes from its parent is not counted when the parent's size comes from
what it holds, however the child writes it: `100%`, a `{ }` that reads `parent.width`, or a
place by `center` or `end`. This is where an intuition from CSS misleads, because there a
width can be worked out from the content and given back to the children in the same pass.
The tempting mistake is to leave the list's width out, as if it could take the width of its
widest row while each row takes the width of the list. Each size would wait on the other,
and the program says so when it starts:

> View.width (app.list) is 0 — it takes its width from its children, and every one of them (NoteRow)
> takes its width from it, so nothing decides it. To make them as wide as the widest, remove
> their own width and use align = stretch on View's layout; or give View a width.

Either answer works. A width the list states is the room its rows share. Or the rows drop
their `width = 100%`, and `align = stretch` on the list's own layout makes them as wide as
the widest of them: on a view sized by its children, stretch means "as large as the
largest", a menu's items as wide as its widest item. A child that states its own size
keeps it.

## Something that comes and goes

Open a note, and an action bar appears at the foot while it is open:

```declare
class NoteRow extends View [ width = 100%, padding = 8,
    fill = { app.open == rowIndex ? 0xE6E6FA : null },   // new: the open row is lit
    onClick() { app.open = rowIndex },
    layout: SimpleLayout [ axis = y, spacing = 2 ],
    Text [ fontWeight = semibold, text = { :title } ],
    Text [ width = 100%, fontSize = 12, textColor = slategray, text = { :text } ]
    ]


App [ width = 360, height = 260, fill = white, textColor = black,
    notes: Dataset { { "items": [
        { "title": "Groceries", "text": "Oat milk, lemons, the good bread." },
        { "title": "Garden", "text": "Move the rosemary out of the shade before the frost." },
        { "title": "Plumber", "text": "The kitchen tap again. Ask about the boiler." },
        { "title": "Books", "text": "Return the two library books by Friday." }
        ] } },
    open: number = -1,   // new
    layout: SimpleLayout [ axis = y ],
    header: View [ width = 100%, height = 40, fill = steelblue,
        Text [ x = 12, y = center, textColor = white, fontWeight = semibold, text = "Notes" ]
        ],
    body: View [ width = 100%, flexes = true,
        layout: SimpleLayout [ axis = x, align = stretch ],
        list: View [ width = 160, scrolls = y, fill = whitesmoke,
            datapath = { app.notes.value },
            layout: SimpleLayout [ axis = y ],
            NoteRow [ datapath = :items[] ]
            ],
        pane: View [ flexes = true,
            Text [ x = 16, y = 16, width = { parent.width - 32 },   // changed: the open note
                text = { app.open < 0 ? "No note open" : app.notes.value.items[app.open].text } ]
            ]
        ],
    actions: View [ width = 100%, height = 40, visible = { app.open >= 0 }, fill = lavender,   // new: the bar
        padding = [0, 12, 0, 12],
        layout: SimpleLayout [ axis = x, align = center ],
        Button [ label = "Close",
            onClick() { app.open = -1 }
            ]
        ]
    ]
```

The bar is a band like the others, placed by the App's layout, not by arithmetic on the
others' heights. It is shown only while a note is open, `visible = { app.open >= 0 }`, and a
hidden child leaves the flow: it takes no room and leaves no gap. The body is still the one
that flexes, so when the bar appears the body gives up exactly the bar's 40, and when it
goes, takes it back.

A hidden child that flexes keeps the size it was last given. The layout has nothing new to
say about it until it shows again, so a whole screen hidden this way keeps its room, and
what inside it is sized from that room stays as it was.

## A desktop and a phone

On a desktop the list sits beside the open note. On a phone there is room for only one, so
the reader shows the list until a note is open, and then the note. The note itself becomes a
reading column, centered and never wider than is comfortable:

```declare
class NoteRow extends View [ width = 100%, padding = 8,
    fill = { app.open == rowIndex ? 0xE6E6FA : null },
    onClick() { app.open = rowIndex },
    layout: SimpleLayout [ axis = y, spacing = 2 ],
    Text [ fontWeight = semibold, text = { :title } ],
    Text [ width = 100%, fontSize = 12, textColor = slategray, text = { :text } ]
    ]


App [ width = 640, height = 260, fill = white, textColor = black,
    notes: Dataset { { "items": [
        { "title": "Groceries", "text": "Oat milk, lemons, the good bread." },
        { "title": "Garden", "text": "Move the rosemary out of the shade before the frost." },
        { "title": "Plumber", "text": "The kitchen tap again. Ask about the boiler." },
        { "title": "Books", "text": "Return the two library books by Friday." }
        ] } },
    open: number = -1,
    layout: SimpleLayout [ axis = y ],
    header: View [ width = 100%, height = 40, fill = steelblue,
        Text [ x = 12, y = center, textColor = white, fontWeight = semibold, text = "Notes" ]
        ],
    body: View [ width = 100%, flexes = true,
        layout: ResponsiveLayout [ align = stretch, plan = { [   // changed: plans
            ({ from: 480, flow: "row", share: ({ list: 35, pane: 65 }) }),
            ({ from: 0, flow: "row",
               share: app.open < 0 ? ({ list: 100, pane: 0 }) : ({ list: 0, pane: 100 }) })
            ] } ],
        list: View [ scrolls = y, fill = whitesmoke,   // changed: no width, the plan gives it
            datapath = { app.notes.value },
            layout: SimpleLayout [ axis = y ],
            NoteRow [ datapath = :items[] ]
            ],
        pane: View [ scrolls = y,   // changed: no flexes, the plan gives its width
            page: View [ x = center, y = 20, width = { Math.min(parent.width - 40, 420) },   // new: the reading column
                layout: SimpleLayout [ axis = y, spacing = 8 ],
                Text [ fontSize = 18, fontWeight = semibold,
                    text = { app.open < 0 ? "No note open" : app.notes.value.items[app.open].title } ],
                Text [ width = 100%, textColor = slategray,
                    text = { app.open < 0 ? "" : app.notes.value.items[app.open].text } ]
                ]
            ]
        ],
    actions: View [ width = 100%, height = 40, visible = { app.open >= 0 }, fill = lavender,
        padding = [0, 12, 0, 12],
        layout: SimpleLayout [ axis = x, align = center ],
        Button [ label = "Close",
            onClick() { app.open = -1 }
            ]
        ]
    ]
```

The body's layout is now a `ResponsiveLayout`. It takes a list of **plans**, each saying
"from this width up, arrange the children like this", and keeps the right plan applied as
the view's width changes. From 480 up, the list and the pane share a row, 35 and 65. Below
that, one of them gets all of the width and the other none: a share of 0 takes a child out
of the flow entirely. A plan is a constraint like any other, so it can read the app's state
as well as its width: which child gets the room is `app.open < 0 ? …`. Nothing in the list
or the pane knows how wide the window is. Where the room goes is decided once, in the body's
layout, and both follow it. The Close button is also the phone's way back to the list. A plan
watches its **own** view's width, not the window's, so plans nest; the reference entry for
`ResponsiveLayout` has the full plan vocabulary.

Smaller adjustments are ordinary constraints: `spacing = { app.width < 480 ? 6 : 12 }`, or
`axis = { app.narrow ? "y" : "x" }` on a `SimpleLayout` when only the direction changes. A
configuration that holds at some widths, with attributes that differ and children only those
widths have, is a [`State`](declare-docs:State)
([Program structure](declare-docs:guide:structure@a-view-in-each-of-the-user-s-places)). An
`App` with no size fills its host and resizes with it, which is why responsive code reads
`app.width`; and often the cleanest answer is a floor: [`App [ minWidth = 360 ]`](declare-docs:App)
holds the design at that width and lets a narrower window pan.

The reading column is placed by hand. The pane has no layout, so the page states its own
width, `Math.min(parent.width - 40, 420)`, never more than 420 and never wider than the
pane, and its own place, `x = center`. Placing by hand is the right tool on a free surface
like this, a diagram, an overlay, the cells of a calendar whose geometry is a formula; for a
row, a column, a flow or a grid of parts, use a layout — a ladder of hand-set `y` values is a
layout written out by hand. Siblings that overlap paint in the order they are written,
**later members on top**.

The tempting mistake there is the CSS habit, `width = 100%, maxWidth = 420`. A range like
`maxWidth` bounds what a **layout** gives a view: a share, a shrink, a stretch. The page
states its own width, so the range has nothing to bound, and the compiler says so:

> View.maxWidth has no effect here — a range bounds the width a layout gives a view (a
> share, a shrink, a stretch), and View states its own width. To cap a stated width, write
> it: width = { Math.min(420, parent.width) }

A view as wide as what it holds, up to a cap, reads its own content instead: a `Text` with
`width = { Math.min(contentWidth, 280) }` keeps a short line short and wraps a long one at
280, the shape of a chat bubble or a tag.

## A layout of your own

A layout decides where the room goes: **the library's when one states the arrangement, your
own when none does.** No library layout says "square", so a grid of square thumbnails, as
many across as fit, is written, as a class with one method:

```declare
class Squares extends Layout [
    cell: number = 96,
    gap: number = 8,
    place() {
        const w = this.contentExtent("width")
        const across = Math.max(1, Math.floor((w + this.gap) / (this.cell + this.gap)))
        const side = (w - (across - 1) * this.gap) / across
        return this.laid().map((c, i) => ({ x: (i % across) * (side + this.gap),
            y: Math.floor(i / across) * (side + this.gap), w: side, h: side }))
        }
    ]


App [ width = 360, height = 260, fill = white,
    photos: View [ x = 20, y = 20, width = 320,
        layout: Squares [ cell = 96 ],
        View [ cornerRadius = 6, fill = 0xC8D6E5 ],
        View [ cornerRadius = 6, fill = 0xB8D8C8 ],
        View [ cornerRadius = 6, fill = 0xE8D2B0 ],
        View [ cornerRadius = 6, fill = 0xB8D8C8 ],
        View [ cornerRadius = 6, fill = 0xC8D6E5 ]
        ]
    ]
```

`place()` reads the width it has, works out how many cells fit across, and returns a box for
each child: its place and its size, a square. The grid's width comes from its parent; its
height comes from what it holds, the boxes it returned. The two meet inside one layout: the
width decides the size of the cells, and the cells decide the height, so a narrower grid has
smaller cells, then fewer across, and grows taller, with no number written for any of it.

A box names only what the layout decides. One with just `x` and `y` leaves each child its own
size; `Squares` returns `w` and `h` too, so it sizes every child, and a child that also
stated a `width` would be refused, as anywhere a layout decides. Writing the division into
each child instead, `width = { app.wide ? … : … }` worked out again in every sibling, is a
layout done by hand. [Your own views](declare-docs:guide:your-own-views@writing-a-layout) has
the whole of the `Layout` class.

## One decider for each value

Every value in the notes reader was decided by exactly one thing:

> **A view's place has one decider: the view itself, or its parent's layout.**
> **Its size has one decider: the view itself, its parent's layout, or what it holds.**

"The view itself" includes every way a view states a value, `width = 300`, `x = center`, a
`{ }`, and `width = 100%`, the view choosing to take its size from its parent. Where a value
comes from and who decides it are different questions, as the list's table showed: with
`align = stretch`, the parent's layout decides. To learn why a view is where it is, or the
size it is, find the one thing that decided it.

## Scale and rotation

[`scale`](declare-docs:View.scale), [`rotation`](declare-docs:View.rotation) (degrees,
clockwise) and their pivot, [`pivotX`](declare-docs:View.pivotX)/[`pivotY`](declare-docs:View.pivotY),
transform a view and its subtree. Every part of the system agrees on the transformed
geometry: painting, clicking, a layout packing the view, and a parent sizing to its
content all see the same box, so a view at `scale = 0.5` really takes half the room.

---

**What you can now do:** give views sizes or let their content size them, arrange children
with layouts, let a child ask its layout for room, size a view from its parent or from what
it holds, pad views, give a pane room to scroll in, respond to width without media queries,
place things by hand on free surfaces, write a layout of your own, and name the one thing
that decides any value.

[Next: **Scrolling** →](declare-docs:guide:scrolling)
