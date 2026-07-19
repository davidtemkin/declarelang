<!-- nav: The loop -->
<!-- part: In practice -->

# Run it, check it, ship it

A program is not finished when it runs — it has an address, gets found, gets checked,
gets shipped. In the stacks you know, each of those is its own subsystem with its own
configuration. Here they hang off one fact:

> **The program URL is the app's address — for running it, editing it, reading it,
> crawling it, and building it.**

With the dev server up, navigating to `…/my-apps/hello.declare` compiles and renders
it. The *same address* answers `?viewer=edit` (a live editor beside the running result),
`?viewer=reader` (the source as an annotated, highlighted document), `?render=canvas`
(the own-pixels renderer from [chapter 6](declare-docs:guide:style)), and `?extract`
(what a crawler sees — below). No project scaffold, no route config, no build step
between an edit and a reload.

## The URL is an attribute

Inside the app, "where the user is" was always just state — a `tab`, a `chapter`, a
`selectedId` — with `visible` deriving from it. Deep linking, then, needs exactly one
new thing: that state, reflected in the URL. That is `location`, a built-in two-way
reactive App attribute holding the fragment:

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

Writing it navigates — one history entry per change. The back button writes it back,
and your state re-derives; you never handle a history event. A deep link is nothing
special — just an initial value, arriving before first paint. The declared initial
*is* the default, so the bare URL stays clean. And the app owns the grammar: it is
just a string you `split`, so `mode` and `chapter` derive from it — this
documentation's entire navigation is three lines of exactly that.

One discipline makes all of it free, and you already know it from
[chapter 3](declare-docs:guide:relationships): **derived state is never assigned.**
Every click writes `location`; `mode` and `chapter` only derive. Assign `chapter`
directly in a handler and the write displaces its constraint — works once, and the
back button silently dies. One writer; everything else derives. (A trailing `@name`
in the fragment scrolls a named view or a rendered heading into view once it exists —
deep links into *content*, with the loading race handled for you.)

> **From React:** this paragraph replaced the router. No route table, no `<Link>`
> component, no navigation API, no history listener — and the "router state vs app
> state" question dissolves, because location *is* app state.

## Crawlers, without a server

The deeper surprise: this also replaces server-side rendering. A Declare program is
not an empty `<div>` waiting for JavaScript — **static extraction**, built into the
compiler, boots the program headlessly to its settled state and serializes its real
content as semantic HTML: actual headings, paragraphs, links. The crawl follows your
app's own links — literal fragments and handler writes alike — and emits one document
at the program URL: the default location's content, plus a section per reachable
location. Discoverable = linked, exactly like the web. Append `?extract` to any
program URL and read what a crawler gets; ship it baked into the page with one flag.

Two honest rules. Crawlable data is **build-time data** — a relative `DataSource`
URL is your app's own material and extracts fine; an absolute URL is the network,
and the crawl refuses *loudly*, naming the fix, rather than emit a silently thinner
document. And the location is your app's **shareable coordinates** — what a
recipient should see when handed the URL. Draft text and selection are ordinary
attributes, never location.

> **From React:** compare the apparatus this retires — SSR, hydration, the
> server/client component split, the rendering service that runs it. Extraction is
> a *compile step*, not a runtime: this site, its live-editing pages included, is
> crawlable from GitHub Pages with no server at all. The simplification isn't a
> missing feature. It's a whole layer the architecture never needed.

## Check it

You have been living the loop all guide: edit, run, read the error, apply the named
fix. The `verify` command is that loop as an oracle — it climbs a ladder, cheapest
rung first, and reports the *first real problem*, not a cascade of downstream noise:

1. **structure** — does it parse?
2. **resolution** — does every name, tag, and datapath resolve?
3. **analysis** — does it typecheck, with every constraint's reads known?
4. **boot** — does it construct and settle, headlessly?
5. **behavior** — does it do what a drive-and-assert script says?
6. **visual** — does it match its named baselines?

Rungs 1–4 need no browser and no flags — typechecking every `{ }` body is part of
every compile, always. Within a rung you get every independent error at once, in
source order, each with its code, its position, and — where the mistake is one the
compiler anticipates — the fix by name. The diagnostics
are the same ones you've been meeting when you break this guide's examples — trust
them, apply them, recompile. That habit is worth more than any chapter of this book.

## Ship it

Three ways to run, one compiler, and the choice is only *where the compile happens*:

- **The dev server** compiles on request — `npm start`, browse to the program URL.
  This is also how you host the whole distro, live.
- **A static host + the service worker**: the compiler runs in the page; the program
  URL is still the address, with no Node anywhere. Cache-aware, so revisits skip the
  compiler entirely.
- **A production build** moves the compile ahead of time: `declarec` (or `?build` on
  any program URL) emits a self-contained artifact — the app and its runtime, about
  54 KB gzipped for the flagship calendar, the same figure the homepage reports
  live from the deployed artifacts — deployable to any static host, no compiler
  aboard. `--crawler` bakes the extracted document into the built page.

## Islands: the deliberate escape

When you need the platform's own content — a chart library, a map, arbitrary markup
— a `DOMIsland [ … ]` hands one view's box to foreign DOM: a leaf to Declare's
layout, sized by constraints, interior yours. Its most powerful case is an **embedded
child app** — a Declare program running inside another program's island, no iframe —
which is exactly how every live example in this guide runs. The boundary is always
an island, always deliberate; everything native stays in the tree.

---

**What you can now say:** you can give an app's insides addresses, make its content
crawlable with no server, prove a program correct from parse to pixels, and ship it
as a small static artifact — all from the one URL where it lives.

[Next: **Writing with an LLM** →](declare-docs:guide:with-an-llm)
