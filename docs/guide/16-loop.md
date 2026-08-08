<!-- nav: The loop -->
<!-- part: In practice -->

# Run it, check it, ship it

A program is not finished when it runs — it has an address, gets found, gets checked,
gets shipped. In the stacks you know, each of those is its own subsystem with its own
configuration. Here they hang off one fact:

> **The program URL is the app's address — for running it, editing it, reading it,
> crawling it, and building it.**

With the dev server up, navigating to `…/my-apps/hello.declare` compiles and renders
it — and a directory URL is the same address in short form: `…/apps/calendar/` means
`…/apps/calendar/calendar.declare`, because a directory containing a program that
matches its name *is* that program's address. The *same address* answers
`?viewer=edit` (a live editor beside the running result),
`?viewer=reader` (the source as an annotated, highlighted document), `?render=canvas`
(the own-pixels renderer from [chapter 6](declare-docs:guide:style)), and `?extract`
(what a crawler sees — below). No project scaffold, no route config, no build step
between an edit and a reload.

## The URL is an attribute; links are declared

Inside the app, "where the user is" was always just an attribute — a `tab`, a
`chapter`, a `selectedId` — with views deriving from it. Deep linking needs exactly
one new thing: the *place*, reflected in the URL. That is `location`, a built-in
two-way reactive App attribute holding the fragment — and the views that manifest
its values declare so with `shows`:

```declare
App [ width = 420, height = 200, fill = whitesmoke, location = "home",

    home: View [ shows = "home", x = 20, y = 20,
        Text [ text = "Home — visit the detail view", link = "#detail" ]
        ],

    detail: View [ shows = "detail", x = 20, y = 20,
        Text [ text = "Detail — the URL ends in #detail. Back returns.", link = "#home" ]
        ]
    ]
```

`shows = "home"` is the visibility you would have written by hand (`visible` still
composes on top for further gating — an auth check, say), and it registers the name:
the compiler now knows every destination, so `link = "#detial"` is a **compile error**
naming the real names, and the crawler knows where to go without guessing. `link`
makes any view a link — no handler: following, the real `<a>` (hover preview,
⌘-click, copy-link), the keyboard stop, and the crawler's edge all come from the one
attribute. The same references work in authored Markdown — `[the detail](#detail)` in
a rendered `.md` follows identically, with no wiring.

A place *inside* a destination is named with `anchor = "story"` — and linked as bare
`#story`, from anywhere: the compiler (and the runtime) derive which destination
holds it, so the link survives the content moving. The landing waits for rendered
prose to finish measuring before it scrolls, and `App.revealInset = 56` keeps it
clear of your fixed header. Writing `location` navigates — one history entry per
change; `replace = true` beside a link overwrites instead (a slide deck's arrows must
not bury the Back button). The back button writes `location` back and your state
re-derives; you never handle a history event. A deep link is nothing special — an
initial value, arriving before first paint. The declared initial *is* the default, so
the bare URL stays clean.

One boundary keeps all of this healthy, and it's a test you can apply in five
seconds: **would you hand this value to a stranger?** If yes, it's an address — it
belongs in `location`, and copy-the-URL sharing is the reward. If no, but the Back
button should still undo it, it's a *step* — it belongs in `waypoint`, below. If
neither, it's an ordinary attribute, and none of this section applies to it.

## The step: `waypoint`

Some of what an interface remembers fails the stranger test but still deserves the
Back button. The turns of a search session. A wizard's half-finished page. When a
user presses Back after a refinement they mean *undo that step* — but the words
they typed must never appear in the URL bar, the history dropdown, or
autocomplete. `waypoint` is `location`'s twin with the opposite visibility: one
two-way reactive string, grammar your own, whose writes make history entries **the
URL never shows**. The browser carries the value inside the entry itself; Back and
Forward write it back and your constraints re-derive — the same loop, minus the
address bar.

```declare
App [ location = "", waypoint = "",

    query: string = { app.waypoint },

    submit(text: string) {
        app.waypoint = text          // Back will undo this turn
        app.location = "results"     // …and this move, together
        }
    ]
```

A history entry is the pair — the address and the step. **One entry per settle in
which either changed**: if one settle changes both, as above, that's one entry and
one Back restores both atomically. If a turn refines results in place, the URL
holds still and Back still undoes the turn — back/forward that work, over a URL
that never moves, which is the combination neither attribute could deliver alone.
`replace = true` on a link overwrites the current entry's whole pair.

Every way a user can arrive resolves the pair honestly. A **link or handler**
writes it. A **pasted URL** carries the address and *no waypoint* — a stranger
gets the place and none of the session, which is the whole contract. A **reload
or session restore** resumes both halves, because the entry survives. A
**traversal** (Back/Forward) restores the pair — the address passes through
`onFollow` exactly as any arrival does; the step is written directly, and
deliberately has no hook: a waypoint can never arrive from outside your app, so
every restored value is one your own code wrote earlier. Your parser is the gate —
an unrecognized step degrades wherever your parsing sends it, same as an
unrecognized fragment. Traversals also land at the scroll position the user left
that entry at; an `@name` arrival reveals its anchor instead.

Two disciplines keep waypoints healthy. **Coordinates, never data**: a waypoint
names the step, and the data derives from it — entries are copied per history
entry, so a result set stuffed into one is both a leak of the model and a real
cost (the host warns loudly past 64KB). And **if you catch yourself wanting a
waypoint to survive a paste, it was an address all along** — promote it to
`location`.

| the value | lives in | URL bar | Back undoes it | survives reload | shareable | crawled |
|---|---|---|---|---|---|---|
| which chapter, which product, map position | `location` | yes | yes | yes | yes | yes |
| a session's turns, a wizard's page | `waypoint` | no | yes | yes | no | no |
| a draft, a hover, a mid-drag selection | ordinary attribute | no | no | no | no | no |

For computed families the grammar after `#` is the app's own — `#deck/q3/47` is a
string you `split`, and `deckId`/`page` derive from it; this documentation's entire
navigation is three lines of exactly that. One discipline makes all of it free, and
you already know it from [chapter 3](declare-docs:guide:relationships): **derived
state is never assigned.** Links write `location`; everything else derives.

When you need code in the path, it's there: `onClick` beside a `link` runs first
(close the menu, then go); a handler may compute and call `app.follow(ref)` itself;
and one app-scoped hook sees every arrival — click, prose, pasted URL, back/forward:

```declare-fragment
onFollow(ref: string) -> string {
    if (ref == "#pricing") return "#plans"   // moved pages
    return ref                                // "" vetoes
    }
```

On a cold arrival it runs before any data loads — so don't gate access here. Gate at
the destination, where a raw URL cannot walk around it: two views sharing one `shows`
name, split on `visible = { app.authed }`, and the login screen renders with the
location preserved — finishing auth lands the user where they aimed.

> **From React:** this section replaced the router. No route table, no `<Link>`
> component, no guards, no history listener — and the "router state vs app state"
> question dissolves: the place is one reactive attribute your views derive from
> like any other, and links are attributes the compiler can check.

### Five minutes with a real one

`apps/birds/birds.declare` — a field guide of Audubon's plates with an
identification quiz over it — is this whole section as a working app. Run it and
do five things in order:

1. **Click a plate.** The URL becomes `#b/roseate-spoonbill`: an address, and one
   you could paste to anybody.
2. **Press Back.** The plate flies home to its slot on the shelf. (The return is
   armed inside `onFollow` — Back runs no handler, and the hook is the one door
   every arrival comes through, which is what makes a motion answerable to it.)
3. **Open the quiz and answer a few questions.** Watch the address bar: it says
   `#quiz` and then never moves again, however long you play.
4. **Press Back mid-round.** The last question un-asks itself. That is the step
   moving, not the address — one history entry per turn, none of them a place.
5. **Paste that `#quiz` URL into a new tab.** You get a *fresh* quiz, because the
   session was never in the URL to copy.

Each of those is one row of the table above, and the source names which is which:
its header comment sorts every value in the program into address, step, or
ordinary attribute — including the flight animations, which are the third kind
(nobody shares a zoom, so history never hears of them).

One thing you cannot try in this page: the live demos in this guide are embedded
child apps, and an embedded app owns neither the page's URL nor its history —
both belong to the page it sits in ([chapter 19](declare-docs:guide:embedding)).
That is why this is a link rather than a frame.

## Crawlers, without a server

The deeper surprise: this also replaces server-side rendering. A Declare program is
not an empty `<div>` waiting for JavaScript — **static extraction**, built into the
compiler, boots the program headlessly to its settled state and serializes its real
content as semantic HTML: actual headings, paragraphs, links. The crawl follows your
app's own links — literal fragments and handler writes alike — and emits one document
at the program URL: the default location's content, plus a section per reachable
location. Discoverable = linked, exactly like the web. Append `?extract` to any
program URL and read what a crawler gets; ship it baked into the page with one flag.
(Try it on the birds guide. Because every tile is a `link`, the crawl walks the
shelf to all fifty bird pages, prose and all. It also finds the quiz *room* —
that is an address — but not a single question, score, or answer, because a
round lives in a waypoint and the crawl boots every location at its declared
initial. What is crawled is exactly what is shareable, which is exactly what a
stranger would see.)

Two honest rules. Crawlable data is **build-time data** — a relative `DataSource`
URL is your app's own material and extracts fine; an absolute URL is the network,
and the crawl refuses *loudly*, naming the fix, rather than emit a silently thinner
document. And the crawl walks **locations only, at the declared initial waypoint**:
content you want indexed must derive from `location`, never from `waypoint` — which
is the stranger test again, because crawlable and shareable are the same property
wearing different hats.

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

The last two rungs are worth reaching for once a program does something. Rung 5 opens
the app in a real browser, drives it with real input, and asserts by **view path**
rather than DOM selectors, so a check survives any change to how a view is realized:

```js
export default async ({ drive, expect }) => {
  await drive.click("app.dock.calendar");
  await drive.settleMotion();                       // motion runs to rest, frame-exact
  await expect.visible("app.wins.0");
  await expect.approx("app.dock.calendar", "width", 72, 1);
};
```

`settleMotion` is the interesting one: it takes the app's clock and runs animation to
rest deterministically, so a spring can be asserted at all — otherwise its value at any
instant depends on frame timing.

### When it passes and still misbehaves

A green rung means *that rung* found nothing. The first four run with no browser at
all — approximated text metrics, no CSS, no layout engine, no input routing — so a
whole class of problem is invisible to them: a transparent view swallowing presses, a
size that only goes wrong against real fonts, anything that appears only in a bundled
build. When the checker is happy and the program is not, stop re-reading the source and
**ask the running program**:

```js
__declare.explain("app.dock.calendar", "width")
// → the expression, every read-path it was wired to, and their live values
```

The same answers have a face: press **⌥⌘D** on any page, or add `?inspector` to a program
URL, and the [Inspector](declare-docs:operational:inspector) opens over the running app.
Click a value to see what produced it; click *select* and click the app to find out
which view a press actually reaches; type a new expression at it and watch the program
change. Someone has told you about Smalltalk. They were insufferable about it. They
were also right about one specific thing: the program is a live thing you can ask
questions of, not a file you re-run — and that is what this is for.

Both the assert vocabulary and the bridge are documented in
[Introspection](declare-docs:operational:introspection).

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
