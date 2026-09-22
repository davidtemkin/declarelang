<!-- nav: Space -->
<!-- part: Building -->

# Space is arithmetic

Where CSS gives you a layout *system* — flow, flexbox, grid, each with its own
vocabulary and its own negotiations — Declare gives you numbers and relationships. A
view's position is its `x` and `y`. Its size is three possibilities. Arrangement is an
attribute. Everything else is arithmetic you can read:

> **Unset is automatic, a constant is fixed, a constraint is anything — and layout is
> just an attribute.**

## A view's size, per axis

Each axis — width and height — is one of three things, chosen by what you write:

- **unset** → the view takes its size from its **content**: its own — the run a `Text`
  lays out, the image an `Image` shows — and the boxes of its visible children;
- **a constant** (`width = 300`) → fixed;
- **a constraint** (`width = { parent.width - 40 }`) → whatever the expression says.

A child sized *from* its parent does not count toward the parent's content size on that
axis, however it is written — `width = 100%`, `width = { parent.width }` and
`width = { parent.contentWidth - 40 }` alike. Each axis runs one way: a card given a
width hands it down to a wrapping `Text`, and the text's height comes back up to size
the card. A child sized from a parent that takes its size from its content has nothing
to follow on that axis — the parent has no size to give — and when its arithmetic lands
below zero that is reported, naming both views. (Ordinary arithmetic that runs below zero
is not: a field sized `{ parent.height - 60 }` in a section closed to 46 is simply
hidden, and a negative size draws nothing.)

Two read-only facts, `contentWidth` and `contentHeight`, expose what the content
*wants* to be — so a clamp is not a `maxHeight` attribute but plain arithmetic:

```declare
App [ fill = white, textColor = black,
    box: View [ x = 20, y = 20, width = 200, cornerRadius = 8, fill = whitesmoke, clip = true,
        height = { Math.min(contentHeight, 90) },
        col: View [ layout: SimpleLayout [ axis = y, spacing = 8 ],
            Text [ text = "auto-height, capped at 90" ],
            Text [ text = "line two" ],
            Text [ text = "line three" ],
            Text [ text = "line four (clipped)" ]
            ]
        ]
    ]
```

The box grows with its content to 90 pixels, then stops; `clip = true` hides the
overflow. Change the clamp to `scrolls = y` on the box instead and the extra
scrolls natively. Delete a `Text` line and watch the height re-derive — the size is a
relationship like any other.

## Placing a view

Position is `x`/`y` against the parent, and two named literals cover the everyday
cases the arithmetic would otherwise spell out: `x = center` and `x = end` (likewise
on `y`) place a view centered in, or flush against, its parent — resolved reactively,
exactly like `100%`. The written-out form `x = { (parent.width - this.width) / 2 }`
remains the no-magic spelling; the literal is just its name. `y = center` centers
the geometric *box* — for a `Text` as for any view, the ordinary meaning. A label
sitting in a control usually wants its *ink* centered instead — the cap band, not
the font box with its asymmetric leading, which otherwise reads a hair low. That is
what the library's **`TextLabel`** is: a `Text` whose `y` is a cap-centering
constraint over its own `baseline` and `capHeight` facts. Use `TextLabel` for the
text inside a button, chip, or cell; plain `Text` for flowing copy.

## Layout is a swappable attribute

*How* a view's children arrange is a `layout:` attribute set on a perfectly generic
view — not a container type you must build the tree around. `SimpleLayout` stacks
along an axis; `WrappingLayout` flows onto new lines:

```declare
App [ width = 260, height = 120, fill = white,
    tags: View [ x = 20, y = 20, width = 220,
        layout: WrappingLayout [ spacing = 8, rowSpacing = 8 ],
        View [ width = 70, height = 30, cornerRadius = 15, fill = gainsboro ],
        View [ width = 90, height = 30, cornerRadius = 15, fill = gainsboro ],
        View [ width = 60, height = 30, cornerRadius = 15, fill = gainsboro ],
        View [ width = 100, height = 30, cornerRadius = 15, fill = gainsboro ]
        ]
    ]
```

Narrow the `tags` width and the pills re-wrap. Because layout is a *slot* and not a
type, it can be swapped, nested, or driven — the seed of what
[Arrangement](declare-docs:guide:arrangement) grows into whole moving arrangements.

These are the arrangements the library ships, and they are ordinary Declare components
you can read in `library/`:

| layout | attributes | what it does |
|---|---|---|
| `SimpleLayout` | `axis`, `spacing`, `align` | stacks children along `x` or `y`; `align` places them across it — `center`, `end`, or a shared `baseline` |
| `WrappingLayout` | `spacing`, `rowSpacing`, `justify`, `align`, `indent`, `hangingIndent` | flows onto new lines when the row runs out; `justify` sets a row along the flow (`start`, `center`, `end`, or `fill`), `align` places children within it, the indents inset the first row and the rest |
| `ResponsiveLayout` | `plan`, `gap`, `align` | switches arrangement by available width; `align` places children across the flow, and a plan entry may override it and `offset` one child |
| `Spacer` | `flexes` | not a layout — a child that absorbs a run's slack |

Two more are built in rather than shipped in `library/`, and you meet them only when
writing your own: **`Layout`** is the base every arrangement extends — and
**`TweenLayout`** is the animated-reflow base — extend it and your layout *glides*
children to their new places instead of snapping, which is how a re-arrangement becomes
motion for free.

> **From CSS:** there is no flexbox, no grid, no document flow, and no z-index —
> children sit at their `x`/`y` unless a `layout` arranges them, stacking is
> declaration order, and "responsive" is not a media query but an ordinary constraint
> reading `app.width`. Your spatial *intuitions* transfer; the negotiation machinery
> stays behind.

**A layout places its children, and what it places a child does not declare.** A row
places each child's `x`; with `align` it places `y` too — so a child in a plain row
still sets its own `y`, and a child in an aligned one does not. A `ResponsiveLayout`
places both in every plan, since in one flow or the other it writes each. What a layout
places is read from the layout itself, so a child that declares it anyway — in any
spelling: a number, `center`, a `{ }` — is an error at that line before anything runs,
and the error names what to use instead. A handler that writes it while the layout is
arranging the child is refused the same way.

A child can opt **out** of what its parent imposes, and the opt-out is declared on the child —
the one who differs is the one who says so. `ignoreLayout = true` makes the parent's
layout skip it: it keeps its own `x`/`y` while its siblings are arranged around it (a
badge pinned to a corner of a stacked card). `ignoreClip = true` makes the parent's
`clip` not cut it: outside the frame it still paints *and* still hits, and it stops
counting toward the parent's content size — the idiom for frame chrome that straddles
the frame, like a window's resize border living just outside the box it resizes.
The family has a third member, `ignoreScroll` — it belongs to the scrolling story
below.

## Padding, and the card it makes

An inset is not arithmetic you repeat on every child. `padding` is an attribute of the
**view** — one number for all four sides, or `[top, right, bottom, left]` clockwise from
the top. A padded view has an *inside*, and `x = 0` and `y = 0` mean that inside's origin
for **every** child: one a layout arranged, one that placed itself, one that opted out
with `ignoreLayout`. A layout is not involved — it simply arranges within the room it is
given, so a view with no `layout:` at all is padded just the same, and a `place()` you
write yourself obeys the inset without ever mentioning it:

```declare
App [ fill = #F4F6FA, textColor = black,
    panel: View [ x = 20, y = 20, width = 260, fill = white, cornerRadius = 10,
        stroke = { stroke(1, 0xDBE1E9) },
        padding = 16,
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        Text [ fontWeight = semibold, text = "Storage" ],
        Text [ width = 100%, wrap = true, textColor = slategray,
            text = "No height: the panel takes the one its content needs, both insets counted in." ],
        Divider [ ],
        Button [ label = "Manage" ]
        ]
    ]
```

The panel has no `height`, and that still holds with padding in play: an unset size
auto-derives from `contentHeight`, which counts the top inset (the children are placed
below it) and the bottom one (the room that must exist under the last child). So the box
grows and shrinks with what it holds, insets included, and nothing is kept in step by
hand. Clamp it the way this chapter opened — `height = { Math.min(contentHeight, 240) }`
— and the padding is inside the clamp. The same arithmetic is what makes a padded
scroller stop a full bottom inset past its last row rather than flush against it.

**`100%` means the room you are given; `{ parent.width }` means the parent's own box.**
That `width = 100%` above is 260 less both insets — a percent resolves against the content
box, and so do `x = center` and `x = end`, which is what makes `100%` the right spelling
for "as wide as there is room for". `{ parent.width }` is the deliberate other answer, the
escape hatch for a child that means to span the inset: pair it with a negative `x`
(`x = -16, width = { parent.width }`) for a band that runs edge to edge inside a padded
card. Ask for the room you are given, or ask for the parent's own width — they are
different questions, and the spelling says which one you mean.

Paint never moves either way. `fill`, `stroke`, `cornerRadius` and a `draw()` member are
all the view's own box, so the panel's background still covers its padding and its hairline
edge still runs around the outside of it. The inset lives in the panel's own coordinate
space too, so it scales and rotates with the box like any other geometry.

That whole panel is common enough that the library ships it: **`Card`** is a view whose
fill, corner radius, hairline edge, `padding` and stacking layout are already the theme's,
so the children are a plain list. **`Divider`** is the rule between them — a painted view, not
a border, spanning the parent's *content* width, so it stops where the padding does:

```declare
App [ fill = #F4F6FA,
    Card [ x = 20, y = 20, width = 280,
        Text [ fontSize = 15, fontWeight = semibold, text = "Storage" ],
        Text [ width = 100%, wrap = true,
            text = "Cards size themselves to what they hold, padding included." ],
        Divider [ ],
        Button [ label = "Manage" ]
        ]
    ]
```

Both are ordinary defaults: `stroke = null` drops the card's edge, and naming your own
`layout:` replaces the stack — though not the inset, which is the view's and not the
arrangement's (`padding = 0` is what takes that away). Note the children are `Text`, not
`TextLabel` — a `TextLabel` owns its own `y` to cap-center itself, which is exactly the
slot the card's layout places, and one slot has one owner.

## The transform, in two and three dimensions

`scale` and `rotation` about `pivotX`/`pivotY` sit in the middle of one family, and every
member obeys the same **one-geometry rule** — paint,
hit-testing (`hovered`, `pressed`, `viewAt`), `rootTransform()` and the parent's auto-size
all read the same matrix:

```declare-fragment
sliver: View [ scaleY = 0.2, pivotX = 80, pivotY = 100 ],         // per-axis scale (× the uniform `scale`)
lean:   View [ skewX = 20 ],                                        // a shear, in degrees
stage:  View [ perspective = 700,                                   // the eye, for the children below
    tipped: View [ rotateX = 60, pivotY = 110 ],                    // out of the plane
    turned: View [ rotateY = -45, backface = hidden ],              // its back hides past 90°
    nearer: View [ translateZ = 120 ] ]                             // toward the viewer, so it grows
```

`perspective` sits on the **parent**, CSS's model: the eye's distance in pixels, the
vanishing point at that box's center; with none, a rotated child simply foreshortens.
A view out of its plane is hit through the projected geometry — a press on the tipped
card lands where the card is drawn, and a hidden back face takes nothing.

## The app fills its host

An `App` with no size fills its host and resizes with it — which is why responsive
code reads `app.width` (a filling app's width *is* the host's). Give an app explicit
dimensions only to make a fixed-size widget. And when a design degrades below some
width instead of adapting, say so as *policy*, not clamp math: `App [ minWidth = 360 ]`
holds the floor, and in a narrower host the stage pans natively.

## Scrolling

Scrolling looks like several features — a page that scrolls, panes that scroll
inside it, chrome that doesn't — but it is one model, and it starts from a fact
about quality: **the browser's own page scroll is the best scroller you will ever
be offered.** It has the physics your user's thumbs already know, it remembers its
position across back and forward, the browser's toolbar collapses for it, and it
is the only scroll a browser lets a gesture *grow* — a second finger landing
mid-scroll becomes a pinch-zoom there and nowhere else ([the Gestures
chapter](declare-docs:guide:gestures) owns that story). So the model's first move
is to hand your content the best one:

> **An app scrolls by default, and its scroller is the page.**

This falls out of what an App *is*, rather than being a feature. The App is the
outermost view, and the outermost thing that can scroll it is the browser;
identifying the App's scroll with the page's is naming a fact, not adding a
mechanism. An app fills its window (the section above), and content taller than
the window makes the page itself scroll, with `app.scrollY` live — the same fact
every scroller reports (read it; to move a scroller, ask with `scrollTo`). Which also explains the app that *doesn't* scroll: the
calendar fills its window and everything fits, so its scroller has nothing to do.
A "fixed window" is not a mode you declare; it is scrolling, idle. And when a
floored app meets a window below its minimum, the panning you get is this same
page scroll, over a frame that held its size.

Every scroller — the App included — **keeps to its frame**: overflow along a
scrolling axis becomes scroll range, and overflow along any other axis is out of
frame — invisible, unreachable, contributing nothing. One rule for the page and
every pane, and the reason nothing can hand the page a scrollbar by accident.

Inside all of this, any view can open its own scroll: `scrolls` is an **axis** —
`y`, `x`, or `both` (`none` is the View default; the App's default is `y`):

```declare-fragment
log: View [ width = { parent.width }, height = 320, scrolls = y,
    rows: View [ layout: SimpleLayout [ axis = y ] /* …hundreds of rows… */ ],
    ]
```

A scroller takes the pointer over its box, whether or not it declares a handler, because
answering drags and wheels is what scrolling is. So a scrolling pane laid over other content
hides that content from the pointer as well as from the eye: anything that must stay
clickable goes in front of the pane, later in the body, or outside it.

The page scrolls past the log; a finger or wheel *on* the log scrolls the log —
the nearest scroller wins — with native momentum and its own edge bounce, never
dragging the page along. Panes nest to any depth, and a native text field is the
smallest case, handling itself. In a `{ }` body the axis is a token string:
compare it explicitly (`scrolls == "y"`), never truthily.

Which leaves the chrome — the header that must not scroll away. A scroll is
something a container imposes on its children, and what a container imposes comes
with an opt-out declared on the child — you just met `ignoreLayout` and `ignoreClip`.
Scrolling completes the family:

> **`ignoreScroll` — the scroll carries everyone but me. I ride the frame.**

A child that opts out stands still against its scroller's frame — the window when
the page is the scroller, the pane's own frame inside a `scrolls` view — and
contributes nothing to the scroll range:

```declare-fragment
App [
    bar: View [ ignoreScroll = true, width = { app.width }, height = 56, fill = #10202C ],
    column: View [ y = 56, width = { Math.min(680, app.width - 48) }, x = center,
        layout: SimpleLayout [ axis = y, spacing = 24 ],
        // …the sections — taller than the window, so the page scrolls…
        ],
    ]
```

A view *may* extend past the app's edge — out of frame is a supported place to
be. Whatever crosses a non-scrolling edge is simply not drawn: a wallpaper
oversized past every side, a window dragged half below a fixed stage — clipped
at the frame, contributing nothing. But on a **scrolling axis** the same
geometry changes meaning: past-the-edge *is* the scroll range, by definition.
So the panel that waits offstage on a scrolling page needs one idiom — stage
it inside a frame-sized **layer**, and park it beyond *the layer's* edge:

```declare-fragment
overlay: View [ ignoreScroll = true, width = { app.hostWidth }, height = { app.hostHeight },
    detail: View [ width = 360, height = { parent.height },
        x = { app.open ? parent.width - 360 : parent.width },   // parked in the layer's world
        slide: Spring [ attribute = x ],
        ],
    ]
```

The app sees one thing: a layer exactly frame-sized, riding the frame. What the
panel does inside it is the layer's private business — nothing off the edge, no
scrollbar conjured by parked furniture, and the sheet slides in from the edge the
user can actually see.

### Your scroll and theirs

Scrolling is a process the platform runs, and `scrollTo` is a request into it, not an
assignment. The user's hand is in the same process at the same time, and it does not pause
for your program, so a request made mid-gesture can be ignored, clamped, overtaken by
momentum — or worse, honored, so that the surface fights the finger holding it.

Two habits keep the two of you out of each other's way.

**Ask because something grew, not because the offset looks right.** A conversation that
follows the newest message should re-anchor when the column *gained* height, and only then.
The version that asks "is the offset near the bottom" also asks it while the user is reading
something from an hour ago, and drags them away from it. Growth is a fact about your content;
a position is a fact about their hand.

**Read `scrolling` before you ask.** It is true while the platform is moving the pane — a
wheel stream, its momentum, a drag, a glide — and a request that waits for it to fall quiet
never lands on a moving surface. Read it in a constraint, as a condition on *whether* to ask;
do not try to catch the moment it flips, because the fact flickers by nature: a trackpad's
momentum has pauses in it, and a mouse wheel's notches are pauses.

What never works is re-asserting a position every frame. The gesture will win, and the
program will spend the whole gesture losing.

Who owns a *finger* over all of this — and how a draggable thing on a scrolling
surface takes the finger only on a press-and-hold — is gesture territory:
[the Gestures chapter](declare-docs:guide:gestures). Everything here behaves
identically on every renderer; what differences remain are the platform's
ceiling, not yours.

## Responsiveness, honestly

The named tool is `ResponsiveLayout`: you give it **plans** — each one says *"from
this width up, arrange the children like this"* — and it keeps the right plan
applied as its view's width changes. A plan can flow the children as a row or a
stack, divide the width among the children it names (`share`), and hide one
outright (`share: 0`). It watches its **own view's** width, not the window's, so
plans nest: the parent decides how much room a child gets, the child's own plan
decides what to do with it.

```declare
App [ fill = white, textColor = black, minWidth = 300,
    bar: View [ x = 20, y = 20, width = { app.width - 40 },
        layout: ResponsiveLayout [ plan = { [
            ({ from: 480, flow: "row", share: ({ menu: 30, body: 70 }) }),
            ({ from: 0, flow: "stack" }),
        ] } ],
        menu: View [ height = 60, fill = gainsboro ],
        body: View [ height = 60, fill = whitesmoke ]
        ]
    ]
```

Wide, it is a 30/70 row; narrow, a stack at natural widths — and the crossing is
just the plan re-applying. When a row's children keep natural widths, the leftover
space is placed with **structure**, not a knob: a `Spacer [ ]` child absorbs the
slack (between two groups it pushes them apart; one on each side centers the run).
Across the flow the plan places every child as well — `y` in a row, `x` in a stack — and
where each one sits is `align`: `start` unless the layout says `align = center`, or one
plan entry says `align: "center"` for its own tier. A plan entry's `offset` shifts a
named child from there, so `offset: { icon: 2 }` sets an icon two pixels lower in the
row — and only in the row, since the nudge belongs to that arrangement.

Layout attributes are reactive like any others — `spacing = { app.width < 480 ? 6 : 12 }`
is an ordinary constraint — and per-child constraints keying off `app.width` remain
the direct form for gutters and type sizes. The same goes for a row that becomes a
column: `axis = { app.narrow ? "y" : "x" }` on a `SimpleLayout` is the whole story when only
the direction changes. When the children's room changes too — two columns side by side,
full width when stacked — that is a plan: its shares say each column's width, so no child
restates the breakpoint in arithmetic of its own. Swapping a whole *configuration* beyond
geometry is a job for a `State` gated on width, which arrives in
[Motion & states](declare-docs:guide:motion-and-states). And often the cleanest answer is
none of these: set the `minWidth` floor and let the stage pan, rather than reflowing
a design below the width where it works.

---

**What you can now say:** you can size and place anything — automatic, fixed, or
derived — arrange children without a layout system's ceremony, decide where
scrolling lives (the page, a pane, both) and what rides the frame instead, and
make a design respond to its window with constraints you can read.

[Next: **Style is state** →](declare-docs:guide:style)
