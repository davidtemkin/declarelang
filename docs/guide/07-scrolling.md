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

## The page is the app's scroller

An [`App`](declare-docs:App) fills its window. When its content is taller than the window, the page itself
scrolls, and [`app.scrollY`](declare-docs:App.scrollY) reports where it is — the same fact every scroller reports.
An app whose content fits, like the calendar, simply has nothing to scroll: a "fixed
window" is not a mode you declare, it is scrolling with nothing to do.

Every scroller, the App included, **keeps to its frame**. Overflow along a scrolling
axis becomes scroll range; overflow along any other axis is out of frame — not drawn,
not reachable, contributing nothing. That is why nothing can hand the page a sideways
scrollbar by accident.

## Panes that scroll

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

## Chrome that stays put: `ignoreScroll`

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
        x = { app.open ? parent.width - 360 : parent.width },
        slide: Spring [ attribute = x ]
        ]
    ]
```

The page sees one frame-sized layer; the panel sliding in and out of it adds no scroll
range. (The [`Spring`](declare-docs:Spring) makes the slide continuous — [Motion and
states](declare-docs:guide:motion).)

## Moving a scroller: requests, not assignments

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

## Your scroll and theirs

Scrolling is a process the platform runs, and the user's hand is in it at the same time
as your program. A request made mid-gesture can be overtaken by momentum or, worse,
honored, so the surface fights the finger holding it. Two habits keep you out of each
other's way.

**Ask because something grew, not because the offset looks right.** A conversation that
follows its newest message should move when the column *gained* height, and only then.
The version that asks "is the offset near the bottom" also asks while the user is
reading something from an hour ago, and drags them away from it.

**Read [`scrolling`](declare-docs:View.scrolling) before you ask.** It is true while the platform is moving the pane —
a wheel, its momentum, a drag, a glide. Read it as a condition on whether to ask, not as
a moment to catch: it flickers by nature, because trackpad momentum and wheel notches
both pause.

What never works is re-asserting a position every frame. The gesture wins, and the
program spends the whole gesture losing.

Which gesture a draggable thing on a scrolling surface gets — and how press-and-hold
lets a quick swipe still scroll — is [Touch and gestures](declare-docs:guide:touch@taking-a-drag-from-a-scroll).

---

**What you can now do:** decide where scrolling lives — the page, a pane, both — keep
chrome on screen with [`ignoreScroll`](declare-docs:View.ignoreScroll), and move a scroller by request without fighting
the person scrolling it.

[Next: **Controls** →](declare-docs:guide:controls)
