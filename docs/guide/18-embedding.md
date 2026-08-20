<!-- nav: Embedding -->
<!-- part: Where it runs -->

# Crossing boundaries — a page in an app, an app in a page

Everything so far assumed the Declare program owns its world. Real work has
borders: a product page that wants one live Declare widget in the middle of
ordinary HTML; a Declare app that needs a box of foreign DOM — a video, a map,
your existing React widget; an app that wants a *whole other Declare app*
running inside it. Three directions, one principle each time: **the boundary
is a box**. Declare sizes and positions the box like any view; whatever is
inside keeps its own model, and neither side reaches across.

All three are DOM-renderer stories today — the canvas renderer draws a single
sealed surface, and these seams are exactly the places where two renderings
must interleave.

## A Declare app inside your page

A page embeds a Declare app by giving it a **sized element marked as the
host**. The marker is `data-declare-embed`, and it is the whole contract: with
it, the app fills the *element* (not the window), reads its pointer relative
to that box, and leaves the page's background, scroll, and title alone —
exactly how an island behaves inside a Declare app.

```html
<h1>Our product page</h1>
<p>Ordinary content above the app.</p>

<div id="host" data-declare-embed
     style="width: 420px; height: 240px"></div>

<p>Ordinary content below the app.</p>

<script type="module">
  import boot from "/declare/bundles/declare-boot.js";
  boot({ main: "/widgets/configurator.declare" });
</script>
```

The app compiles in the browser (or boots from a prewarmed artifact — the
same ladder as any Declare page), and the page around it is none of its
business: resize the div and the app tracks it reactively through
`app.hostWidth`/`app.hostHeight`, like any host. Without the marker, the same
boot treats the page as its own — sizing to the window and painting the page
background — which is what a dedicated app page wants.

**Several apps, one page.** Pass each boot its element and the page hosts as
many as it likes — each in its own marked box, each with its own input and
its own asset directory, none with any page-scoped wiring:

```html
<div id="a" data-declare-embed style="width: 390px; height: 700px"></div>
<div id="b" data-declare-embed style="width: 390px; height: 700px"></div>

<script type="module">
  import boot from "/declare/bundles/declare-boot.js";
  const a = await boot({ main: "/apps/birds/birds.declare",   host: document.getElementById("a") });
  await     boot({ main: "/apps/weather/weather.declare",     host: document.getElementById("b") });
  a.env = { base: "/apps/birds/" };     // the env channel: host → app facts, live
</script>
```

The tenancy contract is structural, and it is pinned by test
(test/embed.test.mjs): an embedded app's `appName` never retitles the page,
its `location` moves neither the URL nor the page's history, and an untouched
page books **zero animation frames** — the host is notified when an app
writes; nothing polls. `boot()` returns the app, and the host element carries
it too (`el.__declareApp`), which is the embedder's way in:

- **watch state out** — `observe(() => app.total, v => …)` (a runtime export)
  runs your callback once per settle in which the value changed;
- **feed facts in** — write `app.env = {…}` and everything bound to it
  re-derives; the page-visibility fact (`app.pageVisible`) arrives on its own;
- **intercept the verbs** — replace the app's service table
  (`app.hostServices = { navigate: to => router.push(to) }`) and a link
  inside the widget routes through your SPA router instead of the browser.

For where the `/declare/` platform files come from in your project — the
mounts, the dev server, production builds — see
[Embedding Declare in a project](declare-docs:operational:embedding); that
page is the project-level half of this story.

## Your page inside a Declare app

The opposite direction is `DOMIsland`: a leaf view whose **box Declare owns
and whose interior it refuses to know about**. It is the one sanctioned
escape to raw DOM, kept behind a named view so `{ }` bodies stay DOM-free —
the island renders as an element carrying `data-declare-slot`, and the page
that booted the app mounts whatever it wants into that element.

```declare
App [ fill = #F4F5F7,
    player: DOMIsland [ x = 20, y = 20, slot = "player",
        width = { parent.width - 40 }, height = { parent.height - 40 },
        fill = #10131A, cornerRadius = 10 ]
    ]
```

```html
<script type="module">
  import boot from "/declare/bundles/declare-boot.js";
  const app = await boot({ main: "/media/media.declare" });
  const box = document.querySelector('[data-declare-slot="player"]');
  box.append(myVideoElement);           // yours: video, map, React root…
</script>
```

The division of labor is strict and useful: constraints and layout drive the
box — the island resizes, hides, and moves like any view — while the tenant
manages its own interior with no coordinate sync. Set `slot = ""` and the
island is closed; flip it reactively to swap tenants. (The empty box above
renders as just that — a styled, empty frame — which is the honest preview of
an island whose page hasn't mounted anything.)

## A Declare app inside a Declare app

`AppIsland` (standard library) composes the island into the strongest form:
the tenant is a **whole Declare program**, named by URL, with its own
reactive graph, input router, and stage — sized to the box like any view.

```declare
App [ fill = #F4F5F7,
    embed: AppIsland [ x = 20, y = 20,
        width = { parent.width - 40 }, height = { parent.height - 40 },
        program = "../../homepage/demos/derived" ]
    ]
```

That is a real, second application running above — its own `app`, its own
state, its own settle loop — not a copy of this one's. `program` takes a name
or a relative path, resolved from the host program's `demos/` folder — so
`"../../calendar/calendar"` reaches the real calendar from any app beside it,
no copy; `""` detaches the island. Input stays honest at the seam, too: a
click inside the tenant belongs to the tenant, while the host hears only *a
press on the island* — which is how a desktop window raises itself when you
click into the app it hosts. On the canvas backend the tenant mounts by
**surface composition** — its tree becomes a subtree of the sealed surface,
no DOM anywhere — which is also exactly how the native host has always done it.

This is not a corner feature. The desktop demo's windows, the homepage's
live previews, and this documentation's own runnable examples are all
`AppIsland` — the page you are reading is an app hosting apps.

## The bridge: `external` attributes and `post`

What crosses the boundary is **declared** — a typed surface, not an open door.
An island's `external` attribute declarations are the host's half of a bridge;
a tenant app's `external` declarations are its exports. The runtime pairs the
two by name when the tenant mounts, and **checks the declared types agree** —
two separately compiled programs can't share a static proof, so agreement is
verified the way a linker resolves `extern` symbols: at link time, loudly
("`pos` is `external number` here and `external string` in the tenant — the
island could not be linked").

```declare
player: AppIsland [ program = "player",
    external volume: number = { app.masterVolume },   -- host-fed: the tenant follows it
    external readonly pos: number = 0,                -- tenant-owned: the host reads, never writes
    onPost(m: IslandPost) { app.log(m.topic) }        -- the tenant's messages arrive here
    ],
scrubber: View [ x = { app.player.pos * trackWidth } ]  -- full machinery over tenant facts
```

The tenant's side is plain Declare — it declares the same names and uses them
as ordinary attributes:

```declare
App [ external volume: number = 0,     -- arrives from the host, constraints re-derive
    external pos: number = 3,          -- this app writes it; the host reads it
    onPost(m: IslandPost) { app.pos = app.pos + 1; app.post("ack", m.topic) },
    ]
```

Facts vs. verbs is the load-bearing distinction. An `external` attribute is a
**fact** — continuous, typed, meaningful whenever read; direction is
arbitrated by ownership (a slot the host *binds* refuses tenant writes,
naming the constraint; `readonly external` declares a tenant-owned out-fact
the host provably can't write). `post(topic, payload)` / `onPost(m)` are
**verbs** — consumed once, ordered, never re-readable: "do this", never
"this is so". Data only crosses: an `external` must carry a data type
(number, string, boolean, array, object, Color, an enum) — a component is an
identity in one program's graph and cannot cross.

**Foreign tenants speak the same bridge.** A raw-JS tenant in a `DOMIsland`
reaches it through the island element's one sanctioned handle:

```js
const h = box.__declareIsland;         // the island's element, after mount
h.externals();                         // [{ name, type, readonly }] — discovery
h.get("volume"); h.observe("volume", v => audio.volume = v);
h.set("pos", 12.5);                    // boundary-VALIDATED against the declared type
h.post("clicked", id);                 // → the island's onPost
h.onPost(m => { … });                  // ← the island's post()
```

A mistyped foreign push is refused with the type named — the same trust-edge
rule a DataSource applies to arriving bytes. (`env` and `childName`, the
bridge's untyped ancestors, still work; new code should declare its surface.)

Three handles are sanctioned, and only three: `el.__declareApp` (the app an
embedding page booted into this element), `el.__declareIsland` (the foreign
tenant's bridge, above), and `__childApp` on an island's element — or, on
canvas, its view — (the Declare tenant an island mounted). Everything else a
backend or host plants is internal and may vanish without notice.

## The same rule, three ways

Each direction draws the border in the same place: **a box, owned by the
outside; a world, owned by the inside**. A page gives Declare a sized div
and keeps the rest; Declare gives a page a sized island and keeps the rest;
an app gives another app its box and neither reads the other's tree. When
you find yourself wanting to reach across a boundary — a constraint on the
tenant's internals, a DOM query into an island — the design is telling you
the boundary is in the wrong place: declare the fact as `external`, send the
command as `post`, or move the border.

[Next: **Run it, check it, ship it** →](declare-docs:guide:run-check-ship)
