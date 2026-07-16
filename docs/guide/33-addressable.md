# Addressable: location, anchors, and what crawlers see

Every app you have built so far had exactly one address: its program URL. This
chapter gives its *insides* addresses — so a place in your app can be linked,
shared, deep-linked, walked with the browser's back button, and read by a
crawler — using one attribute and no new concepts.

## Where you are is state you already have

Think about what "navigation" meant in the apps you've written: the docs viewer
is `mode` and `chapter`; a store would be `product`; a settings screen is a
`tab`. In Declare, *where the user is* was always just attribute values, with
`visible` deriving from them. Nothing about that changes. What's missing is one
binding: those values, reflected in the URL.

That binding is the built-in App attribute **`location`** — the app's slice of
the URL, the part after `#`. It is a plain two-way reactive string:

- **At boot** the host seeds it from the URL *before first settle* — so a deep
  link is nothing special: it is an initial state, and every constraint derives
  from it exactly as if the user had clicked their way there.
- **Writing it is navigating.** Each settle that changes it becomes one browser
  history entry.
- **Back and forward write it back** — like `app.dark` flipping, the world
  pushes and your state re-derives. You never handle a history event.

```declare
App [ width = 420, height = 200, fill = whitesmoke, location = "home",

    home: View [ visible = { app.location == "home" }, x = 20, y = 20,
        Text [ text = "Home — click to visit the detail view" ],
        onClick() { app.location = "detail" },
        ],

    detail: View [ visible = { app.location == "detail" }, x = 20, y = 20,
        Text [ text = "Detail — the URL now ends in #detail. Back returns." ],
        onClick() { app.location = "home" },
        ],
    ]
```

Run at top level, clicking writes `#detail` into the address bar; the back
button returns to a clean URL. (Inside a docs island there is no address bar to
mirror — the attribute still works; the URL wiring belongs to the top-level
host.)

## The default is the clean URL

The declared initial of `location` **is** the default location, and the
fragment is omitted whenever the app is at it. `App [ location = "home" ]`
means: a bare URL *is* home, `#detail` is the departure, and backing out of
every navigation restores the clean URL. You never write `|| "home"` fallbacks
— the declaration already said it.

## One writer, everything else derives

The discipline that makes history integration free: **derived state is never
assigned**. The docs app is the working exemplar — its whole navigation is:

```declare-fragment
location = "guide/00-shape",
mode:    string = { app.location.split("@")[0].split("/")[0] },
chapter: string = { app.location.split("@")[0].split("/")[1] || "00-shape" },
```

Every click — a rail tab, a prose link, a mode switch — writes `location`;
`mode` and `chapter` only ever *derive*. The app owns its grammar (it is just a
string you `split`), and because there is a single writable thing, the back
button, deep links, and in-app clicks are all literally the same code path. If
a handler assigned `chapter` directly, that write would displace the constraint
— and back/forward would silently stop working. The setter rule (guide 21) is
what enforces the discipline.

A location is a **request, not a guarantee**: any string is navigable, and your
parsing decides where unrecognized state lands — the constraint above sends it
to the default chapter. That constraint is your 404 handler.

## `@name` — addressing a place inside the content

A location may end with `@name`: the state before the `@` selects what exists,
the anchor selects what is *brought into view* within it.

- **A heading is its own anchor.** Every heading in rendered `Markdown` gets a
  deterministic slug — `## The default rule` answers `@the-default-rule`.
  Authors write nothing.
- **A view opts in with `anchor`**: `View [ anchor = "pricing" ]` answers
  `@pricing`. (Named views before heading slugs, first in tree order, wins.)

```declare-fragment
[the classroot rule](#guide/22-reach@it-resolves-by-where-the-code-is-written)
```

A fragment link in prose is a **real anchor element** — the browser performs
the navigation natively (history, hover URL, ⌘-click all work), the host feeds
`app.location`, state re-derives, and then the reveal happens. The reveal is a
*retained intent*, not an event: on a cold deep link the target may not exist
yet — the docs app's chapters arrive by `DataSource` — so the runtime holds the
anchor until the name appears in a settled tree, then scrolls once. You get the
loading-race correctness without writing any loading code.

## What crawlers see

A Declare program is not an empty `<div>` waiting for JavaScript — its settled
content extracts as real HTML. Locations extend that to *all* of your content,
including what is invisible at the default state:

- **The crawl follows your links.** Extraction boots your app cold at its
  default location, reads every location it links to — literal fragments in
  prose *and* handler writes like `app.location = "guide/" + cid`, evaluated
  per replicated instance — and boots each of those cold too, to closure.
  **Discoverable = linked**: a location nothing links to is not crawlable, on
  the web or here. If you want content found, render a link to it — an index
  view is a sitemap in your app's own material.
- **One document at your one address.** The program URL stays the sole address;
  the crawled document carries the default location's content first, then each
  reachable location's content as its own section, whose id *is* the location
  string — so a fragment link that survives into a search result opens the
  live app at that exact location.
- **Crawlable data is build-time data — loudly.** A `DataSource` with a
  relative url is your app's own material, read from beside the program during
  the crawl (the same bytes a deployed copy serves). An absolute url is the
  network, and the crawl **refuses with a named fix** — inline the data, ship
  it as a file beside the app, or accept that content unindexed — never a
  silently thinner document.

See it yourself: append `?extract` to any program URL and read the document a
crawler gets. The docs app's own crawled document runs to ~190 KB — every
chapter, every reference page, from data — and the browser and the Node server
produce it byte-identically.

## The mistakes

- **Assigning derived state.** `chapter = "20-tree"` in a handler instead of
  `app.location = "guide/20-tree"` — works once, kills back/forward (the write
  displaced the constraint). Navigation writes `location`, nothing else.
- **Session state in the location.** The location is the *shareable
  coordinates* of your app — what you'd want a recipient to see when you hand
  them the URL. Draft text, selection, login state: ordinary attributes, never
  location.
- **Network data under extraction.** If crawlers matter to the app, its
  indexable data ships beside it. The loud refusal at `?extract` is the design
  telling you which content is at stake.

**Next**: [checking your program](declare-docs:guide:checking), then
[shipping](declare-docs:guide:shipping) — where the crawled document gets baked
into your built page.
