<!-- nav: Scrolling -->
<!-- part: Building -->

# Scrolling

Scrolling looks like several features — a page that scrolls, panes that scroll inside
it, chrome that stays put — but it is one model, and it starts from a fact about
quality: **the browser's own page scroll is the best scroller you will ever be
offered.** It has the physics your user's hands already know, it remembers its position
across Back and Forward, the browser's toolbar collapses for it, and it is the only
scroll a browser lets a second finger turn into a pinch-zoom. So the model gives your
content that scroller first.

> **An app scrolls by default, and its scroller is the page.**

## The page scroll

An [`App`](declare-docs:App) fills its window. When its content is taller than the window, the page itself
scrolls, and [`app.scrollY`](declare-docs:App.scrollY) reports where it is — the same fact every scroller reports.
An app whose content fits, like the calendar, simply has nothing to scroll: a "fixed
window" is not a mode you declare, it is scrolling with nothing to do.

Every scroller, the App included, **keeps to its frame**. Overflow along a scrolling
axis becomes scroll range; overflow along any other axis is out of frame — not drawn,
not reachable, contributing nothing. That is why nothing can hand the page a sideways
scrollbar by accident.

## Scrolling panes

Any view can scroll its own content: [`scrolls`](declare-docs:View.scrolls) is an axis — `y`, `x`, or `both`
(`none` is a view's default; an App's is `y`).

```declare-fragment
log: View [ width = 100%, height = 320, scrolls = y,
    rows: View [ layout: SimpleLayout [ axis = y ] ]
    ]
```

A finger or wheel on the pane scrolls the pane; elsewhere it scrolls the page. The
nearest scroller wins, with native momentum and its own edge bounce, and panes nest to
any depth. Inside a `{ }` body the axis is a string, so compare it explicitly
(`scrolls == "y"`); `"none"` is a truthy string.

**A scroller takes the pointer over its whole box**, whether or not it declares a
handler, because answering drags and wheels is what scrolling is. So a scrolling pane
laid over other content hides that content from clicks as well as from the eye.
Anything that must stay clickable goes in front of the pane — later in the body — or
outside it.

## Fixed headers: `ignoreScroll`

A header that must not scroll away is a child that opts out of its scroller's scroll:

```declare-fragment
App [
    bar: View [ ignoreScroll = true, width = 100%, height = 56, fill = #10202C ],
    column: View [ y = 56, width = { Math.min(680, app.width - 48) }, x = center,
        layout: SimpleLayout [ axis = y, spacing = 24 ]
        ]
    ]
```

`ignoreScroll = true` makes a child stand still against its scroller's frame — the
window when the page is the scroller, the pane's own frame inside a `scrolls` view —
and contribute nothing to the scroll range. It is the third of the opt-outs a child
declares for itself, with [`ignoreLayout`](declare-docs:View.ignoreLayout) and [`ignoreClip`](declare-docs:View.ignoreClip)
([Size, position and layout](declare-docs:guide:layout)).

A view may extend past a non-scrolling edge; it is simply not drawn there. On a
scrolling axis, though, past-the-edge *is* scroll range. So a panel that waits offstage
on a scrolling page is staged inside a frame-sized layer that ignores the scroll, and
parked beyond *the layer's* edge:

```declare-fragment
overlay: View [ ignoreScroll = true, width = { app.hostWidth }, height = { app.hostHeight },
    detail: View [ width = 360, height = { parent.height },
        away: number = 360,                     // how far past the edge it sits
        x = { parent.width - 360 + away },
        slide: Spring [ attribute = away, to = { app.open ? 0 : 360 } ]
        ]
    ]
```

The page sees one frame-sized layer; the panel sliding in and out of it adds no scroll
range. The [`Spring`](declare-docs:Spring) drives `away`, a number of the panel's own,
rather than `x`: a spring owns the attribute it moves, so that attribute carries no
constraint, while `x` stays one and keeps the panel against the edge as the window
resizes. `away` starts at its closed value, so the panel waits offstage from the first
frame ([Motion and states](declare-docs:guide:motion)).

## Moving a scroller

[`scrollY`](declare-docs:View.scrollY) and [`scrollX`](declare-docs:View.scrollX) are **facts**: the platform writes them as the user scrolls, and
you read them — a header that fades as the page scrolls is
`opacity = { 1 - app.scrollY / 200 }`. Assigning one is a compile error. To move a
scroller, ask:

- `pane.scrollTo(y)` — go to an offset; [`scrollTo(Infinity)`](declare-docs:View.method.scrollTo) means the far end.
  Add a glide with `scrollTo(y, { duration: 300 })`.
- `pane.scrollBy(dx, dy)` — move relative to where it is.
- `view.scrollIntoView()` — bring a view into its nearest scroller's visible area.
- `scrollStartY = …` — where a pane starts, applied once.

A request is clamped to the real range, and a pane that cannot take it yet (hidden, not
laid out) holds it until it can.

## Keeping the reader's place

Content changes size while people read it. An image finishes loading and takes
its real height, a row expands to show its details, earlier entries load in above.
If nothing compensated, each of those would move the text the reader is looking at.

So a scroller compensates. Before anything in it changes size, it notes which view
sits at the top edge of its visible area, and how far below that edge the view
starts. After the change, it adjusts its own `scrollY` so that the same view starts
the same distance below the top edge. It does this before the next frame is drawn,
so the reader never sees the content move and come back. Nothing on screen moves.

What that means, case by case:

| What changed | What the reader sees | What happens to `scrollY` |
|---|---|---|
| Something **above** the visible area grew or shrank (an image loaded, earlier rows were inserted) | nothing moves | changes by the same amount |
| Something **on screen** grew (the row being read expanded) | the text at the top stays put; what's below it moves down | unchanged |
| Something **below** the visible area changed | nothing moves | unchanged |
| The pane is **at its very start** (`scrollY` is 0) and something above the old first view appears | the new content comes into view at the top | stays 0 |

The last row is deliberate. A pane at its start shows its beginning, and while a page
is still loading, its beginning is where things arrive: a heading image, a banner. If
the pane held on to the text instead, it would scroll away from the page's top as it
loaded.

This is [`scrollAnchor`](declare-docs:View.scrollAnchor), and its default value,
`content`, is everything above. The view that stays put is the one crossing the top
edge. Inside a long view the scroller looks for the smallest view that crosses the
edge, so in a long post it's the paragraph being read that stays put, not the top of
the post.

`scrollAnchor = none` turns it off, for a pane whose contents are meant to move under
the reader, such as a list the reader is reordering by hand.

A [virtualized](declare-docs:guide:collections@virtualization) list works the same
way. Rows that haven't been built yet stand in with an estimated height. When a row
above the reader is built and turns out taller or shorter than its estimate, that's
a size change above the visible area, the first row of the table, and nothing on
screen moves.

## Following the end

A terminal, a build's output or an event log is read from the bottom. When a line is
appended, a reader who is at the bottom wants to see it, and a reader who has scrolled
back to something from an hour ago wants to stay there. Set `scrollAnchor = end`:

```declare-fragment
log: View [ scrolls = y, height = 100%, scrollAnchor = end,
    lines: View [ width = 100%, layout: SimpleLayout [ axis = y ],
        Line [ datapath = :entries[], virtualize = true ]
        ]
    ]
```

- **When the pane is scrolled to the bottom** (within a few pixels), it stays at the
  bottom as content grows or shrinks: a new entry comes into view, and so does the
  full height of the last entry when it expands.
- **When the reader has scrolled up**, the pane keeps their place as described above,
  and new entries arrive below, out of sight. To tell the reader something is there,
  use a constraint:
  `newBelow: boolean = { log.contentHeight - log.scrollY - log.height > 48 }`.
- **A pane with `scrollAnchor = end` opens at the bottom.**
- **The top is just history here.** In a pane read from the bottom, the "very start"
  row of the table doesn't apply: when earlier entries load in above a reader at the
  top, the reader's place is kept like anywhere else.

To take the reader to the bottom, ask for it: `log.scrollTo(Infinity, { duration: 250 })`.
The pane takes a moment to get there, and entries may arrive in that moment. A pane
that isn't at the bottom yet would normally treat them as arriving below a reader who
has scrolled up, and stop following. Because the pane knows this movement is your
request and that it's heading for the bottom, it keeps following, and it arrives at
the true bottom.

## Scrolling while the user scrolls

Scrolling is something the platform does, and the user's hand is part of it. The
fact [`scrolling`](declare-docs:View.scrolling) reports it: it becomes true when the
pane starts moving, and becomes false only when the user's scroll is completely
over. That means the finger has lifted or the scrollbar thumb has been let go,
and any momentum afterwards has come to rest. A finger resting on the pane partway
through a scroll, not moving, is still scrolling.

**Your requests wait for the user.** A `scrollTo`, `scrollBy` or `scrollIntoView`
made while the user is scrolling isn't carried out straight away. It's kept, and
carried out when `scrolling` becomes false. If you make another request in the
meantime, it replaces the one waiting. Your own glides don't make requests wait: a
new request replaces a glide in flight.

**Keeping the reader's place doesn't wait,** because it isn't a request. The content
under the reader has moved, so putting it back is what the reader expects, mid-scroll
included.

In a browser, a finger's scroll is the one exception: the browser moves the pane itself,
and an offset written while the finger drives it would stop its momentum. So while a finger
is scrolling a pane in a browser, a change above the reader is not corrected; when the
scroll is over, the pane simply takes the reader's place as it now is. The reader sees one
shift, never a jump back. A wheel, a trackpad or the scrollbar is corrected at once, and so
is everything in the Mac app and on canvas, where Declare moves the scroller itself.

What never works is doing this yourself: reading `scrollY` when something changes and
writing a new position back with `scrollTo`. That runs a settle late, it can't tell
a new entry from a row whose estimated height was corrected, and it argues with
the hand holding the pane. If you find yourself writing it, set `scrollAnchor`.

## Dragging to an edge

When something being dragged — a card, a row being reordered — reaches the edge of a
scroller it sits in, the scroller scrolls to reveal more, faster the deeper the pointer goes
into the edge. You write nothing: while the pointer rests there, your `onPointerMove` hears
the move again every frame at the same root point, so its local `x`/`y` follow the content
and the dragged thing (or a `viewAt` drop test) keeps up. It stops when the pointer leaves
the edge, the scroller reaches its end, or the press ends. This scrolling is not the user's
scroll: `scrolling` stays false, and the dragged view is never the one kept still.

While it is dragged, a view counts toward the size of what holds it from where it was
picked up, not from where the hand has taken it, so the range ends at the real content: a
card dragged past the last row reaches the end and the scrolling stops there, and a box
sized by the card it holds does not collapse when the card is lifted. Where the release puts
it counts from then on. To keep a dragged thing inside the rows, clamp what `onPointerMove`
writes; to let it stray a little past them and come back, write a resisting value under the
hand and spring it home on release ([Motion and states](declare-docs:guide:motion)).

Which gesture a draggable thing on a scrolling surface gets — and how press-and-hold
lets a quick swipe still scroll — is [Touch and gestures](declare-docs:guide:touch@dragging-on-a-scrolling-surface).

---

**What you can now do:** decide where scrolling lives (the page, a pane, both), keep
chrome on screen with [`ignoreScroll`](declare-docs:View.ignoreScroll), let a pane keep the
reader's place or follow the bottom with [`scrollAnchor`](declare-docs:View.scrollAnchor),
move a scroller by request without fighting the person scrolling it, and let a drag reveal
more by reaching an edge.

[Next: **Controls** →](declare-docs:guide:controls)
