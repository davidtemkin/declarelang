<!-- nav: Embedding -->
<!-- part: In practice -->

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
background — which is what a dedicated app page wants. One app per page this
way; for several, give each an iframe, or make the page itself Declare and
read on.

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
no copy; `""` detaches the island. Two reactive channels cross the boundary and
nothing else: `env` (a query string — `"dark=1&unit=C"` — delivered to the
tenant's `app.env` at mount and on every change) downward, and `childName`
(the tenant's `appName`, for a host that titles itself by what it shows)
upward. Input stays honest at the seam, too: a click inside the tenant
belongs to the tenant, while the host hears only *a press on the island* —
which is how a desktop window raises itself when you click into the app it
hosts.

This is not a corner feature. The desktop demo's windows, the homepage's
live previews, and this documentation's own runnable examples are all
`AppIsland` — the page you are reading is an app hosting apps.

## The same rule, three ways

Each direction draws the border in the same place: **a box, owned by the
outside; a world, owned by the inside**. A page gives Declare a sized div
and keeps the rest; Declare gives a page a sized island and keeps the rest;
an app gives another app its box and neither reads the other's tree. When
you find yourself wanting to reach across a boundary — a constraint on the
tenant's internals, a DOM query into an island — the design is telling you
the boundary is in the wrong place: pass data through `env`, or move the
border.
