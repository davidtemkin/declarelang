<!-- nav: Location -->
<!-- part: Building -->

# Where the user is

Everything you have built so far lives inside its own window. This chapter is
where your app becomes a **citizen of the web**: a thing with real addresses you
can hand to anyone, a Back button that tells the truth, and pages a crawler can
read — with no router, no history listener, and no server. The browser gives
your user three instruments they already trust — the URL bar, the Back button,
and copy-the-link — and Declare splits the work across two attributes, divided
by a single test:

> **Would you hand this value to a stranger?** If yes, it belongs in `location`
> — it is an *address*. If no, but the Back button should still undo it, it
> belongs in `waypoint` — it is a *step*. If neither, it is an ordinary
> attribute, and none of this chapter applies to it.

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
you already know it from [Relationships](declare-docs:guide:relationships): **derived
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
both belong to the page it sits in (the [Embedding](declare-docs:guide:embedding) chapter).
That is why this is a link rather than a frame.

## What the crawler sees is what a stranger sees

The crawl rule falls straight out of the stranger test, because **crawlable and
shareable are the same property**: the build walks your app's *locations* —
every destination, every link — and boots each one at its declared initial
waypoint. Bird pages index; quiz rounds cannot, because a round was never an
address. Content you want found must derive from `location`. That single rule
is most of what "citizen of the web" means, and the machinery behind it —
static extraction, `?extract`, shipping the crawl baked into the page — is the
[Run, check, ship](declare-docs:guide:run-check-ship) chapter's story.

---

**What you can now say:** you can give an app's places addresses and its
sessions a working Back button, decide exactly what the URL bar shows —
including nothing — hand anyone a link that carries the place and none of the
person, and know that what a crawler reads is precisely what a stranger would
see. Your app is a citizen of the web, and nothing about it needed a server.

[Next: **Motion is a target; a state is a bundle** →](declare-docs:guide:motion-and-states)
