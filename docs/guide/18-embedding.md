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

Two of the three need a browser: a page hosting an app, and an app hosting
foreign DOM, each want a document to put an element in — on the canvas renderer a
foreign island is realized as an overlay above the sealed surface, and the
native Mac host embeds no web engine at all. An app inside an app needs no
element, and runs on every renderer.

One boundary this chapter does *not* own: bringing foreign **code** into a
program, rather than a foreign **rendering** into a box. A JS/TS library —
date math, a physics engine, a parser — enters through `script { }` and its
`import`, or `script [ "file.ts" ]` ([chapter 4](declare-docs:guide:tree)):
it computes for the program, opaquely, and renders nothing. Reach for an
island or a hosted box only when the foreign thing *draws*; reach for script
when it *computes*.

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

The tenancy contract is structural: an embedded app's `appName` never retitles the page,
its `location` moves neither the URL nor the page's history, and an untouched
page books **zero animation frames** — the host is notified when an app
writes; nothing polls. `boot()` returns the app, and the host element carries
it too (`el.__declareApp`), which is the embedder's way in:

- **watch state out** — `observe(() => app.total, v => …)` (a runtime export)
  runs your callback once per settle in which the value changed;
- **feed values in** — pass `boot({ provides: {…} })`, or call `app.provide(name, value)`
  any time later, and everything reading it with `hostProvided` re-derives (below); the
  page-visibility fact (`app.pageVisible`) arrives on its own;
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

```declare-fragment
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
click into the app it hosts. On the canvas renderer the tenant mounts by
**surface composition** — its tree becomes a subtree of the sealed surface,
no DOM anywhere — which is also exactly how the native Mac host mounts one.

This is not a corner feature. The desktop demo's windows, the homepage's
live previews, and this documentation's own runnable examples are all
`AppIsland` — the page you are reading is an app hosting apps.

When you ship a build (`declarec`), the tenants ship with it: every island whose
`program` is a literal is compiled ahead and written beside the app, loaded the
moment the island first names it — no compiler on the page. An island whose
`program` is computed (`program = { app.current }`) can't be read by a build, so
the program says what it may be, in its `ship` block — the declaration that
states what a package carries beyond what the source names:

```declare-fragment
ship [ islands = ["player", "queue", "../../settings/settings"] ]
```

Names are spelled exactly as `program` spells them. A name the build did not
produce is a reported error at run time, naming the fix — never a blank box.
[Run, check, ship](declare-docs:guide:run-check-ship) has the whole block, and
[Building for production](declare-docs:operational:building) the layout.

## The boundary: `provides`, `exposed`, and `post`

What crosses the boundary is **named** — and each name says its direction.
Nothing crosses that neither side named, and no value has two owners.

**Down, from host to tenant.** The island lists the names it offers in
`provides`, and each resolves *at the island* the way `provided()` does: the
island's own attribute of that name first, then whatever its ancestors
provide. The tenant reads one with `hostProvided(name, default)`.

**Up, from tenant to host.** The tenant's App lists the names it offers in
`exposes`; the host reads one with `island.exposed(name, default)`.

```declare-fragment
player: AppIsland [ program = "player",
    provides = ["volume"],
    volume: number = { app.masterVolume },            // offered down: the tenant follows it
    onPost(m: IslandPost) { app.log(m.topic) }        // the tenant's messages arrive here
    ],
scrubber: View [ x = { app.player.exposed("pos", 0) * trackWidth } ]   // full machinery over what it exposes
```

The tenant's side is plain Declare — a read of what the host provides, and a
list of what it offers back:

```declare-fragment
App [ exposes = ["pos"],
    volume: number = { hostProvided("volume", 0) },   // the host's value; 0 when nothing hosts it
    pos: number = 3,                                   // this app writes it; the host reads it
    onPost(m: IslandPost) { app.pos = app.pos + 1; app.post("ack", m.topic) },
    ]
```

Both reads are reactive — a constraint over one re-derives when the other
side changes it — and both are present from the tenant's first frame. **The
default does real work.** It is what an unhosted run sees (the same program
runs standalone, reading its defaults), and it types the read: a value of
another kind answers the default instead, with a console warning naming it —
two separately compiled programs can't share a static proof, so the check
happens where the value arrives, the way a DataSource checks arriving bytes.
With no default, a read of a value nothing provides is an error that names
it.

Values vs. verbs is the load-bearing distinction. A provided or exposed value
is continuous — meaningful whenever read, and owned by exactly one side: the
tenant cannot write what the host provides, and the host cannot write what
the tenant exposes. `post(topic, payload)` / `onPost(m)` are **verbs** —
consumed once, ordered, never re-readable: "do this", never "this is so".
Only data crosses: numbers, strings, booleans, arrays, plain objects. A
component is an identity in one program's graph and cannot cross.

**The page is the topmost host.** A top-level app reads what its *page*
provides with the same `hostProvided`: pass `boot({ …, provides: { dark: true } })`,
put JSON on the element (`<div data-declare-embed data-declare-provide='{"dark":true}'>`),
or call `el.__declareApp.provide("dark", false)` any time later. Reading back
out is `app.exposed(name)` and `app.watchExposed(name, cb)`, over the names
the App's `exposes` lists.

**Foreign tenants speak the same words.** A raw-JS tenant in a `DOMIsland`
reaches the boundary through the island element's one sanctioned handle:

```js
const h = box.__declareIsland;         // the island's element, after mount
h.provides();                          // ["volume"] — what the host provides here
h.hostProvided("volume");              // read it now
h.watchProvided("volume", v => audio.volume = v);   // now, then on every change
h.expose("pos", 12.5);                 // up — the host reads exposed("pos", 0)
h.post("clicked", id);                 // → the island's onPost
h.onPost(m => { … });                  // ← the island's post()
```

Three handles are sanctioned, and only three: `el.__declareApp` (the app an
embedding page booted into this element), `el.__declareIsland` (the foreign
tenant's handle, above), and `__childApp` on an island's element — or, on
canvas, its view — (the Declare tenant an island mounted). Everything else a
backend or host plants is internal and may vanish without notice. None of
them is a global: a page's own scripts share no names with Declare.

## A tenant that loads itself

An island's interior is not Declare's to ship — that is the whole point of the
boundary, and it has a consequence worth stating outright: **a heavy foreign
dependency never has to enter your artifact at all.** Mount a small loader in
the slot, provide what the app knows, and let the loader act on it.

```declare-fragment
signin: DOMIsland [ slot = "auth", width = 320, height = 420,
    provides = ["wanted"],
    wanted: boolean = { app.destinationOf(app.location) == "signin" },
    onPost(m: IslandPost) { app.signedIn = true }
    ]
```

```js
const h = box.__declareIsland;
let started = false;
h.watchProvided("wanted", async (want) => {              // the constraint IS the cue
  if (!want || started) return;
  started = true;
  const sdk = await import("https://cdn.example/auth.js");   // fetched now, not at boot
  sdk.mount(box, { onToken: (t) => h.post("token", t) });
  h.expose("ready", true);
});
```

Nothing in the Declare program names the SDK, so nothing in the build can
bundle it. The app states a **value** — *this screen is showing* — and the
tenant decides what that costs; the answer comes back the same way, as a
value the loader `expose`s (`app.signin.exposed("ready", false)`) or a verb
it `post`s. Use `post()` for the outbound cue instead when it is genuinely an
event rather than a state ("re-authenticate now") — the values-vs-verbs rule
above, applied to loading.

This is the shape to reach for whenever a dependency is large and only some
screens need it. A `script { }` block can also `import()` on demand, which is
simpler when the thing loaded is small and draws nothing — but note which
specifier defers: a **URL** stays external and is genuinely fetched later,
while a **bare** specifier (`import("some-package")`) resolves from
`node_modules` and is bundled whole at build time, deferred in appearance only.

## The same rule, three ways

Each direction draws the border in the same place: **a box, owned by the
outside; a world, owned by the inside**. A page gives Declare a sized div
and keeps the rest; Declare gives a page a sized island and keeps the rest;
an app gives another app its box and neither reads the other's tree. When
you find yourself wanting to reach across a boundary — a constraint on the
tenant's internals, a DOM query into an island — the design is telling you
the boundary is in the wrong place: name the value in `provides` or `exposes`,
send the command as `post`, or move the border.

[Next: **Run it, check it, ship it** →](declare-docs:guide:run-check-ship)
