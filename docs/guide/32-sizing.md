# Sizing and the host

A view's size is not a mode you switch on — it is decided, per axis, by *what the
source says*. There are exactly three cases, and there are no hidden "layout modes"
behind them: read a view's `width` and `height` lines and you know how it sizes.

- **unset** → the axis **auto-sizes** to the bounding box of the view's visible
  children (and yields to a later write).
- **a constant** (`width = 300`) → **fixed**; nothing overwrites it.
- **a constraint** (`height = { … }`) → whatever the expression computes, live.

The two axes are independent, so mixing them is the everyday case: `width = 300`
with `height` unset is a fixed-width box that grows as tall as its content. Add
`clip = true` to clip children to the box (unset lets them overflow). Between them,
those choices already cover auto-sizing, fixed sizing, grow-one-axis, and
overflow-versus-clip — most of a real UI, with no special attributes.

## `contentWidth` / `contentHeight` — the extent as a value

The one case the three rules do not yet cover is a **clamp** — "grow to a limit,
then stop" — because that needs to read what the content *wants* to be. Two
**read-only intrinsics** surface exactly that, always live. With them, clamping is
just arithmetic in a constraint; there is no `minHeight`, `maxHeight`, or `overflow`
attribute to learn:

```declare
height = { Math.min(contentHeight, 480) }                 // grow to a cap, then stop
height = { Math.max(200, Math.min(contentHeight, 480)) }  // clamp between a floor and a cap
// pair with clip = true to hide whatever overflows past the cap
```

`contentWidth`/`contentHeight` are **read-only** — setting one is a compile error,
because their value is computed from the children, not stored. Reading one plus a
pure `Math.*` call is a textbook analyzable dependency
([Constraints](21-constraints.md)), and the runtime's cycle guard keeps a
size-constraint that reads its own content from looping. This is the whole "clamped
box" pattern: a card that grows with its text up to a maximum, then scrolls or clips
the rest.

## The App fills its host by default

The root is special. An `App` is sized by its **host** — the browser window, or the
container element when the app is embedded — not by whatever happens to be inside it.
So an unset App `width`/`height` follows the host's extent, exposed as the read-only
`hostWidth` / `hostHeight`:

```declare
App [ … ]                          // fills its host, resizes with it — no size line
App [ width = 480, height = 320 ]  // a fixed widget — an explicit size overrides the default
App [ width  = { Math.min(hostWidth, hostHeight * 1.6) },   // aspect-locked to the host
      height = { width / 1.6 } ]
```

This is why demo apps and the homepage open with a bare `App [ … ]` and no size
line: "the root fills its host" is the *default*, not boilerplate you have to write.

## `app.width` for responsive reads

In the common case you never name the host at all. Because a filling app's `width`
*is* its host width, responsive reads key off **`app.width`** — a breakpoint font
size, a centred column's gutter — reachable from any depth through the `app` noun
([Scope nouns](27-scope-nouns.md)):

```declare
Text [ x = 24, y = 24, fontSize = { app.width < 700 ? 44 : 60 }, text = "Responsive" ]
```

Prefer `app.width` over the raw `hostWidth`/`hostHeight`, which are reserved for the
rare app whose own box is a non-trivial function of the host that `app.width` cannot
express (the aspect-lock above). Most layouts want the app's *actual* width, which is
`app.width`.

## `readonly` — a permanent constraint

The read-only-ness of `contentWidth`/`contentHeight` is not a framework privilege.
`readonly` is a **modifier any class can declare with** (alongside `prevailing`), and
it sharpens the constraint model into two flavours: a *default* constraint a later
write may override, versus a *permanent* one nothing can reassign — a value consumers
bind but no one sets.

```declare
class Gauge extends View [
    value: number = 0,
    max:   number = 100,
    readonly percent: number = { value / max },   // consumers read it; a set is a compile error
    ]
```

`percent` is a derived, always-correct value — the same shape as the built-in
intrinsics, expressed in user code. (See [sizing.md](../../design/sizing.md).)

---

**Next:** the typefaces that text renders in — [Fonts](33-fonts.md).
