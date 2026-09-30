# URLs and navigation
<!-- index: location, shows, links, deep links, back and forward -->

**Use when** the app has places: pages, tabs, a selected item a link should reach,
Back and Forward.

```declare
App [ width = 420, height = 200, fill = whitesmoke, location = "home",
    // each destination declares the place it shows; the URL fragment is `location`
    home: View [ shows = "home", x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        Text [ text = "Home" ],
        Text [ text = "Open the detail view", link = "#detail" ]      // a real link, no handler
        ],
    detail: View [ shows = "detail", x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        Text [ text = "Detail — the URL ends in #detail, and Back returns." ],
        Button [ label = "Home", link = "#home" ]                         // any view can be a link
        ]
    ]
```

**Rules**
- The place is `app.location`, a two-way attribute holding the URL fragment. Views that
  manifest a place say `shows = "name"`; that registers the destination, so a misspelled
  link is a compile error.
- Navigate with `link = "#name"` on any view: a real link (preview, ⌘-click, keyboard,
  crawler) with no handler. A handler that writes `location` works but is invisible to
  the crawler, and the compiler says so.
- Writing `location` makes one history entry; Back writes it back and everything
  re-derives. You never handle a history event. `replace = true` beside a link
  overwrites instead.
- A place inside a destination is `anchor = "name"`; link to it as `#name`, and the URL
  carries it as `#dest@name`.
- Steps that deserve Back but must never show in the URL (search turns, a wizard page)
  go in `app.waypoint`, `location`'s hidden twin.
- The declared initial of `location` is the default, so the bare URL stays clean. A
  deep link is just an initial value.

**Look up** `App.location`, `View.shows`, `View.link`, `View.anchor`, `App.waypoint`,
`App.onFollow`.

**Examples** `apps/birds/birds.declare`: `location` parsed into a destination and a
bird, prev/next as links · `apps/docs/docs.declare`: `guide/<chapter>@<heading>`
addresses.

**Guide** URLs, links and history.
