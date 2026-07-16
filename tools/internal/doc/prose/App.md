The root of every Declare program, and its reactive **environment**. There is exactly
one, at the top of the tree; reach it from any depth with the **`app` noun**
(`app.hostWidth`, `app.scrollY`) rather than a fragile `parent` chain. It extends `View`,
so it is also the outermost box — and it **fills its host by default** (its `width`/`height`
default to `hostWidth`/`hostHeight`), so a plain app is full-window and an aspect-locked
one reads the host extent. The attributes below are fed by the runtime from the window (or
the embedding element): you **read** them, you never set them.

```declare
App [ fill = white,
    header: View [ width = { app.hostWidth }, opacity = { 1 - app.scrollY / 200 } ],
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
The **page's** current scroll offset in pixels — the whole document, **not** a `scrolls`
container's (which exposes its own `scrollY`). Fed by the runtime; read it for scroll-driven
chrome — a fading header, a parallax hero: `opacity = { 1 - app.scrollY / 200 }`.

## pointerX
The pointer's horizontal position in **viewport space**, live and continuous — present
even between elements, unlike a view's `mouseMove` (which needs the pointer over it). For
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

## location
The app's slice of the URL — the **fragment**, as one two-way reactive string
(docs/system-design/location.md). The host seeds it from the URL *before first settle* (a deep link
is just an initial state), mirrors app writes outward (one history entry per changed
settle), and writes it back on back/forward — so navigation, deep links, and the back
button are all the same thing: a `location` write your constraints re-derive from. The
app owns the grammar: read it (`mode = { app.location.split("/")[0] }`), write it to
navigate (`app.location = "why"`). The declared initial is the **default location** —
the URL stays clean while the app is at it. A trailing `@name` reveals the named view
or heading after the settle it causes.

```declare
App [ location = "home",
    why: View [ visible = { app.location == "why" } ],
]
```
