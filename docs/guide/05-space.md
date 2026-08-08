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

- **unset** → the view auto-sizes to the bounding box of its visible children;
- **a constant** (`width = 300`) → fixed;
- **a constraint** (`width = { parent.width - 40 }`) → whatever the expression says.

Two read-only intrinsics, `contentWidth` and `contentHeight`, expose what the content
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
remains the no-magic spelling; the literal is just its name. (On a `Text`,
`y = center` centers the *ink* — the cap-to-baseline band — so labels read centered
regardless of font metrics. That makes `Text` the one place the two spellings
differ: the brace rewrite centers the *box*, so a label that switches to a
computed `y` sits a couple of pixels off its `y = center` position — center the
box knowingly, or keep the literal and move the parent.)

## Layout is a swappable attribute

*How* a view's children arrange is a `layout:` attribute set on a perfectly generic
view — not a container type you must build the tree around. `SimpleLayout` stacks
along an axis; `WrappingLayout` flows onto new lines:

```declare
App [ width = 260, height = 120, fill = white,
    tags: View [ x = 20, y = 20, width = 220,
        layout: WrappingLayout [ spacing = 8, lineSpacing = 8 ],
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
| `SimpleLayout` | `axis`, `spacing` | stacks children along `x` or `y` |
| `WrappingLayout` | `spacing`, `lineSpacing`, `align` | flows onto new lines when the row runs out |
| `ResponsiveLayout` | `plan`, `gap` | switches arrangement by available width |
| `Spacer` | `flexes` | not a layout — a child that absorbs a run's slack |

Two more are built in rather than shipped in `library/`, and you meet them only when
writing your own: **`Layout`** is the base every arrangement extends, and
**`TweenLayout`** is the animated-reflow base — extend it and your layout *glides*
children to their new places instead of snapping, which is how a re-arrangement becomes
motion for free.

> **From CSS:** there is no flexbox, no grid, no document flow, and no z-index —
> children sit at their `x`/`y` unless a `layout` arranges them, stacking is
> declaration order, and "responsive" is not a media query but an ordinary constraint
> reading `app.width`. Your spatial *intuitions* transfer; the negotiation machinery
> stays behind.

A child can opt **out** of a parent regime, and the opt-out is declared on the child —
the one who differs is the one who says so. `ignoreLayout = true` makes the parent's
layout skip it: it keeps its own `x`/`y` while its siblings are arranged around it (a
badge pinned to a corner of a stacked card). `ignoreClip = true` makes the parent's
`clip` not cut it: outside the frame it still paints *and* still hits, and it stops
counting toward the parent's content size — the idiom for frame chrome that straddles
the frame, like a window's resize border living just outside the box it resizes.
The family has a third member, `ignoreScroll` — it belongs to the scrolling story
below.

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
the window makes the page itself scroll, with `app.scrollY` live — the same slot
every scroller has. Which also explains the app that *doesn't* scroll: the
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

The page scrolls past the log; a finger or wheel *on* the log scrolls the log —
the nearest scroller wins — with native momentum and its own edge bounce, never
dragging the page along. Panes nest to any depth, and a native text field is the
smallest case, handling itself. In a `{ }` body the axis is a token string:
compare it explicitly (`scrolls == "y"`), never truthily.

Which leaves the chrome — the header that must not scroll away. A scroll is a
*regime* a container imposes on its children, and Declare's regimes come with
opt-outs declared on the child — you just met `ignoreLayout` and `ignoreClip`.
Scrolling completes the family:

> **`ignoreScroll` — the scroll carries everyone but me. I ride the frame.**

A child that opts out stands still against its scroller's frame — the window when
the page is the regime, the pane's own frame inside a `scrolls` view — and
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

Layout attributes are reactive like any others — `spacing = { app.width < 480 ? 6 : 12 }`
is an ordinary constraint — and per-child constraints keying off `app.width` remain
the direct form for gutters and type sizes. Swapping a whole *configuration* beyond
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
