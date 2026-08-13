The root of every Declare program, and its reactive **environment**. There is exactly
one, at the top of the tree; reach it from any depth with the **`app` noun**
(`app.hostWidth`, `app.scrollY`) rather than a fragile `parent` chain. It extends `View`,
so it is also the outermost box — and it **fills its host by default** (its `width`/`height`
default to `hostWidth`/`hostHeight`), so a plain app is full-window and an aspect-locked
one reads the host extent. Two rules distinguish it from a plain View (ruled 2026-07-29):
an App is **clipped by definition** — a program owns its rectangle, so `clip = false` is a
compile error (a Shape clip keeps its meaning) — and it **scrolls by default**
(`scrolls = y`), with its scroller being **the page itself**: content taller than the
window makes the browser's own page scroll, and an app whose content fits simply has
nothing to scroll (the "fixed window" is that default, idle). Chrome that must not scroll
away declares `ignoreScroll`. The environment attributes below are fed by the runtime from
the window (or the embedding element): you **read** them, you never set them.

```declare
App [ fill = white,
    header: View [ width = { app.hostWidth }, opacity = { 1 - app.scrollY / 200 } ]
    ]
```

## hostWidth
**Read-only.** The width of the App's host — the window at top level, the embedding
element when embedded. The App's own `width` defaults to it, so read `app.hostWidth` for
responsive layout at any depth. Assigning it is a compile error.

## hostHeight
**Read-only.** The host's height — at top level, the REAL visible height: the layout
viewport, widened to the unzoomed visual viewport where that is larger. The distinction is
iOS: the browser lets content occupy zones the layout viewport excludes (behind collapsed
bar chrome, the home-indicator band), and flow content paints there on its own — so a
pinned overlay sized to the layout viewport alone would cut off above the true bottom.
Neither a pinch nor the software keyboard ever changes it. Size full-height panes to
`app.hostHeight`.

## scrollY
**Read-only.** The App's own scroll offset — which **is the page's**, since the App's
scroller is the page (an interior `scrolls` container exposes its own `scrollY` the same
way, writable there for now). The user's scrolling writes it; read it for scroll-driven
chrome — a fading header, a parallax hero: `opacity = { 1 - app.scrollY / 200 }`. To land
the page somewhere, call the target view's `scrollIntoView()` — assigning this slot never
moved the page anyway (the write was dead), which is why it is now refused.

## pointerX
**Read-only.** The pointer's horizontal position in **viewport space**, live and
continuous — present even between elements, unlike a view's `pointerMove` (which needs the
pointer over it). The runtime feeds it from the free pointer. For cursor effects and
hover-at-a-distance: a `Spring` following `app.pointerX` trails the cursor.

## pointerY
**Read-only.** The pointer's vertical position in viewport space — the twin of `pointerX`.

## hovering
**Read-only.** Whether a **hovering** pointer is present — true for mouse/trackpad,
**false for touch**. Gate hover-only chrome (a cursor dot, a rollover) on it so a phone
never shows it, yet an iPad trackpad — which reports a mouse pointer — still does.

## pointerOverText
**Read-only.** True while the pointer is over an editable or selectable text field. Yield
a custom cursor to the native I-beam by gating on `!app.pointerOverText`, so text stays
comfortably selectable.

## dark
**Read-only.** The OS color-scheme flag — `true` under `prefers-color-scheme: dark`, kept
live as the system theme flips. Theme off it: `theme = { app.dark ? darkTokens() : lightTokens() }`.
It is only the OS signal; when you offer a Light/Dark/Auto control, keep your own mode
attribute and read `app.dark` as the "auto" case.

## minWidth
The width below which the app **stops adapting** — in a narrower host it holds this width and
the stage pans natively (the browser scrolls it), rather than reflowing into an unusable shape.
Declare a floor instead of writing `Math.max` clamps into size constraints.

## minHeight
The height floor — the twin of `minWidth`. Below it the app holds its size and the stage pans.

## navigate()
Navigate the host **out** of the app: `app.navigate("https://…")` for an external link, or
`app.navigate("some/app.declare")` for another program (resolved against the distro root). It
is a service **method**, not an attribute — call it from a handler; `app.navigate = …` is an
error.

## follow()
The **one operation behind every arrival** (docs/system-design/location.md §0.5): a linked
view's activation, an authored href in rendered prose, a pasted URL, and back/forward all
reduce to `app.follow(ref)`. The reference passes through `onFollow` once; an external
reference leaves through `navigate`; a `#…` reference writes `location` — a bare anchor
name (`"#story"`) first derives its destination from the tree, so the author never writes
a compound. An anchored arrival is not finished until the target is rendered, **measured**,
and in the viewport (`revealInset` honored); an anchorless one starts at the top. You
rarely call this yourself — `link` calls it for you — but a handler that computes its
destination may: `app.follow(picked)`. `follow(ref, true)` replaces the current history
entry instead of pushing (the `replace` attribute's path).

## destinationOf()
The destination part of a location: strips the runtime's own trailing `@name` —
`app.destinationOf("why@story")` is `"why"`. The one string rule the runtime owns (§6);
apps never hand-write that split. This is the comparison `shows` lowers to, exposed so
your own grammar code can agree with it.

## location
The app's slice of the URL — the **fragment**, as one two-way reactive string
(docs/system-design/location.md). The host seeds it from the URL *before first settle* (a deep link
is just an initial value), mirrors app writes outward (one history entry per changed
settle), and writes it back on back/forward — so navigation, deep links, and the back
button are all the same thing: a `location` write your constraints re-derive from. The
app owns the grammar: read it (`mode = { app.location.split("/")[0] }`), write it to
navigate (`app.location = "why"`). The declared initial is the **default location** —
the URL stays clean while the app is at it. A trailing `@name` reveals the named view
or heading after the settle it causes.

The contract: location is the app's **shareable coordinates** — what a recipient
should see when handed the URL. A draft, a hover, a mid-gesture selection are
ordinary attributes: they never reach the URL (a fragment is never sent to the
server either — location stays client-side), and Back does not traverse them.
A step that Back *should* traverse without ever touching the URL is the
third kind — that is `waypoint`.

## waypoint
The **step** — the half of the history coordinate the Back button retraces and the
URL never shows. `location`'s twin with the opposite visibility: one two-way
reactive string the app owns the grammar of, carried in the History entry itself
rather than in the URL. A history entry is the pair (location, waypoint); one entry
is minted per settle in which either changed — both changing together is one entry,
restored atomically by one Back. Both halves are coordinates on the entry, never
storage, so a **traversal** brings the step back while an **arrival** rebuilds the
app from the URL alone: a reload starts at the declared initial step, exactly as a
pasted URL does — which is the dividing test: *would you hand the value to
a stranger?* Yes → `location`. No, but Back should undo it → `waypoint`. Neither
→ an ordinary attribute. Waypoints are coordinates, never data — derive the data
from the step, keep it under a few kilobytes, and put data that must outlive the
document where data goes, since no coordinate survives an arrival. Because it can never arrive
from outside the app, a waypoint passes no `onFollow`; your own parsing is the
gate, and an unrecognized value degrades wherever that parsing sends it. The
crawl never sees waypoints: content that should be indexed derives from
`location` — crawlable and shareable are the same property.

```declare
App [ location = "", waypoint = "",
    query: string = { app.waypoint },
    submit(text: string) {
        app.waypoint = text                      // Back undoes this turn…
        app.location = "results"                 // …and this move, in ONE entry
        }
    ]
```

```declare
App [ location = "home",
    why: View [ visible = { app.location == "why" } ]
    ]
```

## pointerDown
**Read-only.** True while a pointer is held anywhere in the app, alongside `pointerX`/
`pointerY`. It is the app-wide fact, not a per-view one: use `View.pressed` to style the
thing being pressed, and this to suppress something globally for the duration of a drag.

## touchDevice
Whether touch is the **primary** input, live — so it re-settles if the input changes rather
than being sampled once at boot. This is the one to size from: hit targets, spacing,
whether a hover reveal exists at all (`visible = { !app.touchDevice }`). Distinct from
`hasTouch`: a touch laptop *has* touch while its primary input is still the pointer.

## hasTouch
Whether the device **has** a touch input at all (`any-pointer`), regardless of which is
primary. Use it for a hit-target *floor* on hybrids — a machine someone might reach out and
tap even though they are mostly using a trackpad. Size from `touchDevice`; raise the floor
from this.

## hasPointer
Whether the device has a fine pointer at all, the mirror of `hasTouch`. Both can be true at
once; neither tells you which the user is holding right now — `lastPointerType` does.

## lastPointerType
What the user *just* used: `"mouse"`, `"touch"`, or `"pen"`, live. On a hybrid the honest
answer changes per gesture, which is exactly what makes this the right input for hover-only
affordances — and the wrong one for layout, which must not reflow because someone reached
past their trackpad.

## edges
How the app meets the device's **own** chrome — a phone's notch and home-indicator bar.
`safe` (the default) letterboxes the app inside the safe region: the browser keeps the box
clear of the system chrome, the letterbox bars wear the app's own `fill`, and every
`safe*` inset reads 0 — there is nothing to handle. `edges = cover` is the edge-to-edge
opt-in: the runtime patches `viewport-fit=cover` into the page's viewport meta at mount,
the box extends under the system chrome, and the `safeTop`…`safeRight` facts carry the
real insets for pinned chrome to place itself with. Cover also declares the standalone
intent: the runtime stamps the home-screen web-app metas (`mobile-web-app-capable`,
`apple-mobile-web-app-capable`, status-bar `black-translucent`), so an added-to-Home-Screen
app launches truly full screen. A fact about the app, read at mount — not a runtime
toggle. Desktop browsers are unaffected either way.

In a browser TAB the top chrome region is always the browser's; what a covered app
controls there is its COLOR — the page behind a top-level app wears the app's `fill`
(live, following a constraint fill), and a `theme-color` meta rides the same path, which
is the channel the browser honors for its own chrome. An app whose fill tracks its content
(the weather app's sky tone) keeps the browser bands reading as part of the app.

## safeTop
**Read-only.** The top safe-area inset in pixels — the notch/status-bar band. `0` while
letterboxed (`edges = safe`) and on any desktop; the device's real number under
`edges = cover`, live across rotation. Pinned top chrome offsets itself with it:
`y = { app.safeTop }`.

## safeBottom
**Read-only.** The bottom safe-area inset — the home-indicator band. A pinned bottom bar
reserves it *below* its buttons: `height = { 56 + app.safeBottom }` with the content
anchored to the bar's top, so the swipe band is the bar's fill rather than dead space.

## underlapBottom
**Read-only.** How much of the bottom of `hostHeight` is the browser's own *retractable*
chrome — `0` while its bars are shown, their height once they retract (and always `0` on
a desktop or the native host).

`hostHeight` reaches the true bottom, including the zones a collapsed toolbar has
vacated, which is the number a full-bleed background wants. Anything a finger must
*reach* wants this one alongside it, because `hostHeight` reads the same whether that
bottom band is the app's to use or the browser's to take back — and while the bars are
retracted, a tap down there summons them instead of landing on the app.

So floating chrome clears the device's band and the browser's in one expression:

```declare-fragment
pill: GlassChip [ ignoreScroll = true,
    y = { app.hostHeight - 60 - Math.max(app.safeBottom, app.underlapBottom) } ]
```

which keeps the control at one place on screen through the collapse, instead of the
constant guess — a fixed 40 of clearance is wasted while the bars are up, and may be too
little once they aren't.

## safeLeft
**Read-only.** The side safe-area insets: `0` in portrait; in landscape the sensor
housing claims one side and rotation re-feeds all four facts. Full-width pinned chrome
insets both edges: `x = { app.safeLeft }`,
`width = { app.width - app.safeLeft - app.safeRight }`.

## safeRight
**Read-only.** The right-side counterpart of `safeLeft` — see it for the landscape story
and the full-width idiom.

## env
**Read-only.** Whatever the host passed in, as a record — the clean pass-through for a
desktop hosting a child app and pushing appearance or configuration down. `{}` when
top-level or when the host passes nothing, so a read never null-crashes. It is the host's
channel (the host writes it live through the island's `env` string), and `app.dark` is the
ready-made one most apps want.

## appName
What this app calls itself — the host reflects it into the window or document title. An
ordinary reactive attribute, so a title that tracks the open document is a binding rather
than a mechanism: `appName = { "Viewer — " + app.fileName }`. `""` (the default) means no
opinion, and the host keeps whatever title it served.

## createView()
Instantiates a component **by tag name** and inserts it as a live child of `parent`,
returning it — the imperative door, for structure that genuinely cannot be declared.
Reach for replication over a datapath first: it reconciles, keys, and tears down for you.

**The build drops components nothing statically references**, so a component you only ever
name as a *string* needs `use [ Name ]` at the top level to survive. That is the one
non-obvious requirement, and forgetting it fails at runtime, not compile time. The
returned view is yours: `discard()` it when done.

```declare-fragment
use [ Menu ]
…
onInit() { this.list = app.createView("Menu", app, ({ })) }
```

The library builds its own overlays exactly this way — a `Menu` cannot declare a `Menu`
child without recursing, so the cascade is created by name at first use.

## openWindow()
Opens a URL in a new window or tab — the service action, so a `{ }` body never touches the
document. `navigate` is the same-window form.

## inspect()
Opens the Inspector on this app, or on an embedded child app when given its slot
(`app.inspect("run:preview")`). Dev tooling: a production build ships a stub unless you
pass `declarec --debug`.
