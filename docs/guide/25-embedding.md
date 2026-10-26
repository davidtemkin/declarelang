<!-- nav: Embedding -->
<!-- part: Where it runs -->

# Embedding

Real work has borders: a product page that wants one live Declare widget in the middle of
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
`import`, or `script [ "file.ts" ]` ([Program structure](declare-docs:guide:structure@what-script-is-for)):
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
[`app.hostWidth`](declare-docs:App.hostWidth)/[`app.hostHeight`](declare-docs:App.hostHeight), like any host. Without the marker, the same
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
  const birds = await boot({ main: "/apps/birds/birds.declare", host: document.getElementById("a"),
    provides: { base: "/apps/birds/" } });                 // read in the app with hostProvided("base", "")
  await boot({ main: "/apps/weather/weather.declare", host: document.getElementById("b") });
</script>
```

The tenancy contract is structural: an embedded app's [`appName`](declare-docs:App.appName) never retitles the page,
its [`location`](declare-docs:App.location) moves neither the URL nor the page's history, and an untouched
page books **zero animation frames** — the host is notified when an app
writes; nothing polls.

**The page is a host, in an island's words.** `boot()` resolves to the page's handle on
the app — call it the tenant — and the host element carries it too (`el.__declareTenant`):

- **values in** — `boot({ provides: {…} })`, then `tenant.provide(name, value)` any time
  later; everything reading it with `hostProvided` re-derives (below), and `undefined`
  withdraws it. The page-visibility fact ([`app.pageVisible`](declare-docs:App.pageVisible)) arrives on its own;
- **values out** — `tenant.exposed(name, default)` reads one the App lists in
  [`exposes`](declare-docs:App.exposes), and `observe(() => tenant.exposed("total", 0), v => …)`
  (a runtime export) runs your callback once per settle in which it changed;
- **messages both ways** — `boot({ onPost: ({ topic, payload }) => … })` hears the app's
  [`postToHost`](declare-docs:App.method.postToHost), and `tenant.post(topic, payload)` arrives as its
  [`onHostMessage`](declare-docs:App.event.hostMessage);
- **navigation** — `boot({ onNavigate: ({ to, newWindow }) => router.push(to) })` carries
  out every link the app follows out and every window it opens, synchronously inside the
  click (so it may open a window itself); without it, the browser does.

`tenant.app` is the App itself, for reading and writing its attributes directly.

**A page with a strict Content-Security-Policy.** Two things a Declare app does
fall under a policy that forbids `eval`. Compiling in the browser turns the program's
`{ }` bodies into functions; a production build (`declarec`) ships them already compiled,
so it needs no allowance for that. And the reactive kernel is WebAssembly by default,
which a policy admits with `'wasm-unsafe-eval'` in `script-src` — an allowance for
WebAssembly alone, not for JavaScript `eval`. When the policy is yours, add it; when you
are embedding into a page whose policy you do not control, build with `--kernel=js` and
the app carries a JavaScript kernel instead, a little slower on the heaviest updates
([Packaging and shipping](declare-docs:guide:packaging)).

For where the `/declare/` platform files come from in your project — the
mounts, the dev server, production builds — see
[Embedding Declare in a project](declare-docs:operational:embedding); that
page is the project-level half of this story.

## Your page inside a Declare app

The opposite direction is [`DOMIsland`](declare-docs:DOMIsland): a leaf view whose **box Declare owns
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

[`AppIsland`](declare-docs:AppIsland) (standard library) composes the island into the strongest form:
the tenant is a **whole Declare program**, named by URL, with its own
reactive graph, input router, and stage — sized to the box like any view.

```declare-fragment
App [ fill = #F4F5F7,
    embed: AppIsland [ x = 20, y = 20,
        width = { parent.width - 40 }, height = { parent.height - 40 },
        program = "../homepage/demos/derived" ]
    ]
```

That is a real, second application running above — its own `app`, its own
state, its own settle loop — not a copy of this one's. [`program`](declare-docs:AppIsland.program) is the
program's path without its `.declare`, relative to the program that names it, like
any address in a program — so `"../calendar/calendar"` reaches the real calendar from
an app beside it, with no copy, and `"player"` is `player.declare` beside your own. `""` detaches the island. Input stays honest at the seam, too: a
click inside the tenant belongs to the tenant, while the host hears only *a
press on the island* — which is how a desktop window raises itself when you
click into the app it hosts. On the canvas renderer the tenant mounts by
**surface composition** — its tree becomes a subtree of the sealed surface,
no DOM anywhere — which is also exactly how the native Mac host mounts one.

This is not a corner feature. The desktop demo's windows, the homepage's
live previews, and this documentation's own runnable examples are all
`AppIsland` — the page you are reading is an app hosting apps.

The boundary is transparent where a person would expect it to be. Tab walks
into the tenant at its first stop and out after its last. The tenant's menus,
popovers and dialogs open in the nearest overlay layer above the island — the
window it runs in, in a desktop — so they hang past the island's box and turn
and scale with it ([Menus, dialogs and overlays](declare-docs:guide:overlays@overlays-that-belong-to-a-window));
`containOverlays = true` keeps them inside the box. And a key the tenant has
no shortcut for reaches the host's: a program in a desktop window answers ⌘N
with the desktop's New ([Pointer and keyboard](declare-docs:guide:pointer-and-keyboard@keyboard-shortcuts)).

When you ship a build (`declarec`), the tenants ship with it: every island whose
`program` is a literal is compiled ahead and written beside the app, loaded the
moment the island first names it — no compiler on the page. An island whose
`program` is computed (`program = { app.current }`) can't be read by a build, so
the program says what it may be, in its `ship` block — the declaration that
states what a package carries beyond what the source names:

```declare-fragment
ship [ islands = ["player", "queue", "../settings/settings"] ]
```

Names are spelled exactly as `program` spells them. A name the build did not
produce is a reported error at run time, naming the fix — never a blank box.
[Packaging for production](declare-docs:guide:packaging@what-your-program-says-it-needs-ship) has the whole block, and
[Building for production](declare-docs:operational:building) the layout.

## The boundary: `provides`, `exposes`, and `post`

What crosses the boundary is **named** — and each name says its direction.
Nothing crosses that neither side named, and no value has two owners.

**Down, from host to tenant.** The island lists the names it offers in
[`provides`](declare-docs:DOMIsland.provides), and each resolves *at the island* the way `provided()` does: the
island's own attribute of that name first, then whatever its ancestors
provide. The tenant reads one with `hostProvided(name, default)`.

**Up, from tenant to host.** The tenant's App lists the names it offers in
[`exposes`](declare-docs:App.exposes); the host reads one with `island.exposed(name, default)`.

```declare-fragment
player: AppIsland [ program = "player",
    provides = ["volume"],
    volume: number = { app.masterVolume },            // offered down: the tenant follows it
    onPost(m: IslandMessage) { app.log(m.topic) }        // the tenant's messages arrive here
    ],
scrubber: View [ x = { app.player.exposed("pos", 0) * trackWidth } ]   // full machinery over what it exposes
```

The tenant's side is plain Declare — a read of what the host provides, and a
list of what it offers back:

```declare-fragment
App [ exposes = ["pos"],
    volume: number = { hostProvided("volume", 0) },   // the host's value; 0 when nothing hosts it
    pos: number = 3,                                   // this app writes it; the host reads it
    onHostMessage(m: IslandMessage) { app.pos = app.pos + 1; app.postToHost("ack", m.topic) },
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

**A tenant's own files come through its host, too.** A tenant's relative
`url` resolves in its host's space, not beside the tenant's own file, so a
host can hand it any address to read. A tenant that reads its *own* data asks
where home is, and falls back to beside itself when it runs alone:

```declare-fragment
data: DataSource [ autoFetch = true, url = { hostProvided("base", "") + "data/events.json" } ]
```

That is how the desktop's Calendar, Birds, and Market Map find their data,
with the desktop's windows providing each one's `base`. A package follows the
same addresses, so a tenant written this way reads its data there exactly as
on the site ([Packaging for production](declare-docs:guide:packaging)).

Values vs. verbs is the load-bearing distinction. A provided or exposed value
is continuous — meaningful whenever read, and owned by exactly one side: the
tenant cannot write what the host provides, and the host cannot write what
the tenant exposes. [`postToHost(topic, payload)`](declare-docs:App.method.postToHost) / `onHostMessage(m)` are **verbs** —
consumed once, ordered, never re-readable: "do this", never "this is so".
Only data crosses: numbers, strings, booleans, arrays, plain objects. A
view is an identity in one program's graph and cannot cross.

**The page is the topmost host.** A top-level app reads what its *page*
provides with the same `hostProvided`: pass `boot({ …, provides: { dark: true } })`,
put JSON on the element (`<div data-declare-embed data-declare-provide='{"dark":true}'>`),
or call `tenant.provide("dark", false)` any time later. Reading back out is
`tenant.exposed(name, default)`, over the names the App's `exposes` lists.

**Foreign tenants reach the same boundary.** A raw-JS tenant in a `DOMIsland`
reaches it through the island element's one sanctioned handle, whose verbs keep
the island's own names (`post`, `onPost`):

```js
const h = box.__declareIsland;         // the island's element, after mount
h.provides();                          // ["volume"] — what the host provides here
h.hostProvided("volume");              // read it now
h.watchProvided("volume", v => audio.volume = v);   // now, then on every change
h.expose("pos", 12.5);                 // up — the host reads exposed("pos", 0)
h.post("clicked", id);                 // → the island's onPost
h.onPost(m => { … });                  // ← the island's post()
```

Three handles are sanctioned, and only three: `el.__declareTenant` (the page's handle
on the app it booted into this element, which `boot()` also returns), `el.__declareIsland` (the foreign
tenant's handle, above), and `__childApp` on an island's element — or, on
canvas, its view — (the Declare tenant an island mounted). Everything else a
backend or host plants is internal and may vanish without notice. None of
them is a global: a page's own scripts share no names with Declare.

## Tenants requiring navigation

Most hosted programs need none of what follows: a preview or a widget runs in its
box and the host leaves it alone. This section is for a host that runs a program
the person **browses** — a documentation reader, a field guide, a site with pages
— inside a window or a panel of its own. Such a host wants to open the program
at a particular place, to show where it has gone, to decide what happens when one
of its links leads out of it, and to give it back and forward. Neither program
names anything to make this work: the island carries the tenant's **location**
and its **links** on its own.

**Where it is.** [`location`](declare-docs:AppIsland.location) on an `AppIsland` is
its tenant's [`location`](declare-docs:App.location), carried both ways. Set it and
the tenant starts there, as a page starts at its URL's fragment; set it later and
the tenant goes there, through its own `onFollowLink`. When the tenant moves itself, the
island's `location` follows, so the host can show where its tenant is:

```declare-fragment
docs: AppIsland [ program = "../docs/docs",
    onInit() { this.location = "reference/Button" }    // start on that page
    ],
crumb: Text [ text = { app.docs.location } ]           // and say where it is now
```

Assign it from a handler or `onInit`, not with a constraint: the tenant writes it
too, and a constraint would claim a value two sides move.

**Where it wants to go.** A program's [`navigate(to)`](declare-docs:App.method.navigate)
and [`openWindow(to)`](declare-docs:App.method.openWindow) are its links leaving it.
Inside an island they come to the island first, as
[`onNavigate`](declare-docs:DOMIsland.event.navigate), and the host decides what a
link means; declaring the handler is the claim, and without one the page navigates.
The tenant writes nothing different — it calls `navigate` as it would running alone.

```declare-fragment
viewer: AppIsland [ program = "../viewer/viewer",
    onNavigate(n: IslandNavigation) {
        if (n.program == "") { app.navigate(n.to); return }   // not a Declare program: the page follows it
        app.side.program = n.program                          // a program: open it beside this one,
        app.side.location = n.location                        // at the place the link names
        }
    ]
```

The [`IslandNavigation`](declare-docs:type:IslandNavigation) arrives worked out:
`n.to` is the address made absolute, `n.program` the Declare program it names (a
directory taken as its same-named program; `""` for anything else), `n.location` the
place after its `#`, and `n.newWindow` whether the tenant asked for a window of its
own. That is how the desktop opens a reference page from the Viewer: the Viewer's
link names the docs app, and the desktop opens it in a window at that page.

**Back and forward across a tenant.** The page's Back walks the page, never a
tenant's moves. A host that wants back and forward for its tenant keeps them itself:
the island's `location` reports every move, and setting it steps back. To return the
person to where they were scrolled as well, the island reports
[`departedPlace`](declare-docs:AppIsland.departedPlace) each time the tenant leaves a
location — how far its panes, and the island's own box, were scrolled. Keep it with
the location, and hand it back as [`place`](declare-docs:AppIsland.place) when you
step:

```declare-fragment
schema Stop [ at: string, place: string ]

App [
    stops: Stop[] = [],
    stepping: boolean = false,                          // a step back is not a new stop
    pane: AppIsland [ program = "../docs/docs",
        trackChanges = ["location"],
        onChange(e: ChangeEvent) {
            if (app.stepping) { app.stepping = false; return }
            app.stops = [...app.stops, { at: "" + e.changed[0].previousValue, place: this.departedPlace }]
            }
        ],
    back() {
        const s = app.stops[app.stops.length - 1]
        if (s == null) return
        app.stops = app.stops.slice(0, -1)
        app.stepping = true
        app.pane.place = s.place                          // the place first, then the location it belongs to
        app.pane.location = s.at
        }
    ]
```

The place lands once the move has settled and the content can hold it, and the
person's first scroll cancels a landing still under way — the same landing as the
page's own Back. The desktop's Docs and Birds windows do exactly this, forward
included, with ‹ › in their title bars.

## Loading foreign code at runtime

An island's interior is not Declare's to ship — that is the whole point of the
boundary, and it has a consequence worth stating outright: **a heavy foreign
dependency never has to enter your artifact at all.** Mount a small loader in
the slot, provide what the app knows, and let the loader act on it.

```declare-fragment
signin: DOMIsland [ slot = "auth", width = 320, height = 420,
    provides = ["wanted"],
    wanted: boolean = { app.destinationOf(app.location) == "signin" },
    onPost(m: IslandMessage) { app.signedIn = true }
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

## The one boundary rule

Each direction draws the border in the same place: **a box, owned by the
outside; a world, owned by the inside**. A page gives Declare a sized div
and keeps the rest; Declare gives a page a sized island and keeps the rest;
an app gives another app its box and neither reads the other's tree. When
you find yourself wanting to reach across a boundary — a constraint on the
tenant's internals, a DOM query into an island — the design is telling you
the boundary is in the wrong place: name the value in `provides` or `exposes`,
send the command as `post`, or move the border.

---

**What you can now do:** put a Declare app in any page, host foreign content in a box
Declare sizes, run one Declare program inside another, pass values and messages
across each boundary by name, and follow and steer where a hosted program is — what
its links do, and its back and forward.

[Next: **Packaging for production** →](declare-docs:guide:packaging)
