# Scrolling
<!-- index: scrollers, fixed chrome, keeping the reader's place, following the end, scrollTo -->

**Use when** content is taller or wider than its room: a page, a pane, a log that
follows its newest line, a header that stays put.

```declare
class Line [ width = 100%, height = 30, t: Text [ x = 12, y = 6, text = :text ] ]

App [ width = 360, height = 400, fill = white,
    d: Dataset { { "entries": [ { "id": 1, "text": "build started" }, { "id": 2, "text": "compiling 14 files" } ] } },

    // fixed chrome: opts out of the page's scroll
    bar: View [ ignoreScroll = true, width = 100%, height = 48, fill = #10202C,
        title: Text [ x = 12, y = 14, textColor = white, text = "Build output" ] ],

    // a pane read from the bottom: at the end it follows new lines; scrolled back,
    // the reader's place holds
    log: View [ y = 48, width = 100%, height = { app.height - 48 }, scrolls = y, scrollAnchor = end,
        rows: View [ width = 100%, datapath = { app.d.value },
            layout: SimpleLayout [ axis = y ],
            Line [ datapath = :entries[] ]
            ]
        ]
    ]
```

**Rules**
- An App scrolls by default, and its scroller is the page (`app.scrollY`). Any view can
  scroll its own content: `scrolls = y | x | both`.
- `scrollY`/`scrollX` are facts the platform reports; assigning one is a compile error.
  Move a scroller by request: `scrollTo(y[, { duration }])`, `scrollBy`,
  `view.scrollIntoView()`, and `scrollStartY` for where it starts.
- Chrome that must not scroll away is a child with `ignoreScroll = true`.
- A scroller takes the pointer over its whole box: anything clickable goes in front of
  it (later in the body) or outside it.
- A pane keeps the reader's place by itself as content changes size (`scrollAnchor =
  content`, the default); `scrollAnchor = end` follows the end while the reader is there.
  Never read `scrollY` and write it back to hold a place — that is `scrollAnchor`'s job.
- `scrolling` is the user's scroll only; a request made during it waits until it is over.
- A long list: `virtualize = true` on the replicated row — the place holds there too.
- A drag that reaches a scroller's edge scrolls it; `onPointerMove` keeps hearing moves.
  The dragged view sizes its container from where it was picked up, so scrolling stops at
  the real end; clamp what you write to keep it in range, or spring it home on release.
- Inside `{ }` the axis is a string: `scrolls == "y"`.

**Look up** `View.scrolls`, `View.scrollY`, `View.scrolling`, `View.scrollAnchor`,
`View.scrollTo`, `View.scrollIntoView`, `View.ignoreScroll`, `View.scrollStartY`,
`View.virtualize`.

**Examples** `apps/weather/weather.declare`: the page as the scroller, the pager pinned
with `ignoreScroll` · `apps/desktop/desktop.declare`: the Files strip revealing a column
with `scrollToX`.

**Guide** Scrolling · Touch and gestures § Dragging on a scrolling surface.
