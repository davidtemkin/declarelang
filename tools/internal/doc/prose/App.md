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
**Read-only.** The host's height — the viewport height at top level; the twin of
`hostWidth`. Size full-height panes to `app.hostHeight`.

## scrollY
The App's own scroll offset — which **is the page's**, since the App's scroller is the
page (an interior `scrolls` container exposes its own `scrollY` the same way). Read it for
scroll-driven chrome — a fading header, a parallax hero: `opacity = { 1 - app.scrollY / 200 }`.

## pointerX
The pointer's horizontal position in **viewport space**, live and continuous — present
even between elements, unlike a view's `pointerMove` (which needs the pointer over it). For
cursor effects and hover-at-a-distance: a `Spring` following `app.pointerX` trails the
cursor.

## pointerY
The pointer's vertical position in viewport space — the twin of `pointerX`.

## hovering
Whether a **hovering** pointer is present — true for mouse/trackpad, **false for touch**.
Gate hover-only chrome (a cursor dot, a rollover) on it so a phone never shows it, yet an
iPad trackpad — which reports a mouse pointer — still does.

## pointerOverText
True while the pointer is over an editable or selectable text field. Yield a custom cursor
to the native I-beam by gating on `!app.pointerOverText`, so text stays comfortably
selectable.

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
should see when handed the URL, and the only value that rides browser history. A
draft, a selection, a session's working values are ordinary attributes: they never
reach the URL (a fragment is never sent to the server either — location stays
client-side), and Back does not traverse them.

```declare
App [ location = "home",
    why: View [ visible = { app.location == "why" } ]
    ]
```

## pointerDown
True while a pointer is held anywhere in the app — read-only, alongside `pointerX`/
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

## env
Whatever the host passed in, as a record — the clean pass-through for a desktop hosting a
child app and pushing appearance or configuration down. `{}` when top-level or when the
host passes nothing, so a read never null-crashes. Read-only: it is the host's channel, and
`app.dark` is the ready-made one most apps want.

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
