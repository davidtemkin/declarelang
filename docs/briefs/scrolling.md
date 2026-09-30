# Scrolling
<!-- index: scrollers, fixed chrome, following new content, scrollTo -->

**Use when** content is taller or wider than its room: a page, a pane, a log that
follows its newest line, a header that stays put.

```declare
class Msg [ width = 100%, height = 30, t: Text [ x = 12, y = 6, text = :text ] ]

App [ width = 360, height = 400, fill = white,
    d: Dataset { { "msgs": [ { "id": 1, "text": "Hello" }, { "id": 2, "text": "Anyone there?" } ] } },

    // fixed chrome: opts out of the page's scroll
    bar: View [ ignoreScroll = true, width = 100%, height = 48, fill = #10202C,
        title: Text [ x = 12, y = 14, textColor = white, text = "Chat" ] ],

    // a pane that scrolls on its own, and follows the conversation only when it grew
    log: View [ y = 48, width = 100%, height = { app.height - 48 }, scrolls = y,
        trackChanges = ["contentHeight"],
        onChange() { if (!scrolling) this.scrollTo(Infinity, { duration: 200 }) },
        rows: View [ width = 100%, datapath = { app.d.value },
            layout: SimpleLayout [ axis = y ],
            Msg [ datapath = :msgs[] ]
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
- Ask because something *grew* (a change on `contentHeight`), not because the offset
  looks right, and not while `scrolling` is true. Never re-assert a position every frame:
  the user's hand wins.
- Inside `{ }` the axis is a string: `scrolls == "y"`.

**Look up** `View.scrolls`, `View.scrollY`, `View.scrolling`, `View.scrollTo`,
`View.scrollIntoView`, `View.ignoreScroll`, `View.scrollStartY`.

**Examples** `apps/weather/weather.declare`: the page as the scroller, the pager pinned
with `ignoreScroll` · `apps/desktop/desktop.declare`: the Files strip revealing a column
with `scrollToX`.

**Guide** Scrolling · Touch and gestures § Dragging on a scrolling surface.
