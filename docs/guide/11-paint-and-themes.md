<!-- nav: Paint and themes -->
<!-- part: Building -->

# Paint and themes

Everything about how a program looks is an attribute — the same kind of value as
`width`, set the same way, bindable by the same constraints. There is no second system
for appearance, which is why restyling is ordinary programming and why the palette of a
whole app can live in one place.

> **Styling is attributes. Values flow down the tree from where you set them. The
> palette lives once, in a theme.**

## Painting a view

A view's paint is a handful of attributes:

```declare
App [ width = 320, height = 170, fill = whitesmoke, textColor = #172530,
    card: View [ x = 30, y = 30, width = 260, padding = 20, cornerRadius = 12,
        fill = white,
        stroke = { stroke(1, 0xD6DCE2) },
        shadow = { shadow(0, 10, 20, 0x00000033) },
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        Text [ fontSize = 16, fontWeight = bold, text = "Painting" ],
        Text [ textColor = slategray, text = "fill · stroke · shadow · radius" ]
        ]
    ]
```

- [`fill`](declare-docs:View.fill) paints the box: a color or a gradient. `null`, the default, paints nothing, but
  the box still takes space and clicks.
- [`cornerRadius`](declare-docs:View.cornerRadius) rounds it: one number, or four for `[topLeft, topRight, bottomRight,
  bottomLeft]` — a tab joined to its pane is `[8, 8, 0, 0]`.
- [`stroke`](declare-docs:View.stroke) is a border drawn *inside* the box, so it never changes the layout:
  `stroke(width, color)`, or four of them, `[top, right, bottom, left]` with `null` for a
  bare side — a rule under a row is `[null, null, stroke(1, #DBE1E9), null]`.
- [`shadow`](declare-docs:View.shadow) is `shadow(dx, dy, blur, color)`, cast outside the box.
- [`opacity`](declare-docs:View.opacity) fades the view and its subtree together; `visible = false` removes it from
  paint and input but keeps it built.
- `clip = true` clips children to the box.

There is no CSS `border` and no `box-shadow` string; the constructors are the only call
forms a bare slot accepts. Inside `{ }` they are ordinary functions, so their colors are
numbers (`0x…`).

Past the basics, each compositing stage is an attribute too, and every renderer realizes
them natively:

```declare-fragment
card: View [ filter = { [blur(d * 1.15), brightness(1 - d * 0.13)] } ],  // the view's own paint, as a group
glass: View [ backdrop = frost(20, 1.4), fill = #F9F9FBDB ],             // blur what lies beneath: frosted glass
chip: View [ blend = multiply ],                                         // mix with what is already painted
fade: Image [ mask = gradient("180deg", #00000000, #000000FF) ],         // a soft alpha mask
glow: View [ fill = radialGradient(0.5, 0.38, 0.3, #FFFFFF60, #FFFFFF00) ],
dial: View [ fill = conicGradient(0.5, 0.5, 0, #FF5A36, #FFD23F, #FF5A36) ]
```

`filter` takes one function or a list — `blur`, `brightness`, `contrast`, `saturate`,
`grayscale`, `invert`, `sepia`, `hueRotate`, `colorize`, `shadow` — and applies it to the
view and its children as a group. [`backdrop`](declare-docs:View.backdrop) applies the same list to what lies beneath
the view, inside its own shape, which is how menus and sheets get their frosted look.
[`blend`](declare-docs:View.blend) sets the compositing operator (the usual blend modes, camelCased). All of it is
paint: clicks and focus are unaffected. The [`View`](declare-docs:View) reference entry has the details.

## Provided values: set once, read below

Text attributes do not need repeating on every [`Text`](declare-docs:Text). The **text face** — [`textColor`](declare-docs:Text.textColor),
[`fontSize`](declare-docs:Text.fontSize), [`fontFamily`](declare-docs:Text.fontFamily), [`fontWeight`](declare-docs:Text.fontWeight), [`letterSpacing`](declare-docs:Text.letterSpacing) — is made of **provided values**:
set one on a container and it is provided to every `Text` below, until a descendant
sets its own.

```declare
App [ width = 320, height = 130, fill = white,
    fontFamily = ["Helvetica Neue", "sans-serif"], fontSize = 15, textColor = #172530,
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 6 ],
        Text [ fontWeight = bold, text = "Rain or Shine?" ],
        Text [ text = "94110" ],
        Text [ textColor = royalblue, text = "overrides only the color" ]
        ]
    ]
```

This is a cascade of a kind — a value flows down from where it is set — but it is not
CSS's: no selectors, no specificity, no `!important`, no rule from another file fighting
this one. The nearest provider wins, and the value stays live.

You can provide your own values the same way. Declare a typed attribute on an ancestor,
and any descendant reads it with `provided("name")`:

```declare
class Row extends View [ width = 100%, height = { 16 + 12 * provided("density") }, cornerRadius = 6, fill = white,
    label: string = "",
    Text [ x = 12, y = center, text = { classroot.label } ]
    ]

App [ width = 340, height = 170, fill = #F0F3F6, fontSize = 13, textColor = #172530,
    density: number = 2,
    onClick() { density = density == 2 ? 1 : 2 },
    list: View [ x = 20, y = 20, width = 300,
        layout: SimpleLayout [ axis = y, spacing = 6 ],
        Row [ label = "each row reads provided(\"density\")" ],
        Row [ label = "the App declares it — click to flip" ],
        Row [ label = "fontSize 13 is provided the same way" ]
        ]
    ]
```

`provided(…)` is explicit on purpose: the read reaches past this node, and a dependency
from far away is worth seeing. `provided("name", fallback)` supplies a default when no
ancestor provides one; without one, a read with no provider fails at boot, naming the
value.

## Themes

`theme` is a provided value whose value is a **record of design tokens** — colors,
radii, sizes. You provide it once, on the App, and read a token with
`provided("theme")`:

```declare
theme Brand [ accent = #CC3333, surface = #FFF7F5, text = #2B1D1B, muted = #9A7F7B ]

theme Night [ accent = #4C8DFF, surface = #101E28, text = #E7EEF2, muted = #8A9BA6 ]

class Heading extends Text [ fontWeight = bold, fontSize = 18, textColor = { provided("theme").text } ]

App [ width = 340, height = 150, theme = { app.night ? Night : Brand }, fill = { provided("theme").surface },
    night: boolean = false,
    onClick() { night = !night },
    col: View [ x = 20, y = 20, width = 300,
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        Heading [ text = { app.night ? "Night" : "Brand" } ],
        Text [ textColor = { provided("theme").muted }, text = "click anywhere to switch themes" ],
        View [ width = 120, height = 24, cornerRadius = 6, fill = { provided("theme").accent } ]
        ]
    ]
```

`theme Brand [ … ]` declares a named token record at the top level. `theme = …` on the
App provides one — a plain set, no keyword — and every reader below follows when it
changes, in one step. Because a theme is an ordinary value, two moves come for free:
`theme = { { ...provided("theme"), accent: 0xE05252 } }` on a subtree re-skins part of
the app, and `theme = { app.dark ? BrandDark : Brand }` swaps the whole record, which is
all dark mode is.

**A palette is a theme.** When a color, a size or a font list appears in more than one
place, it is a token: declare it in a `theme`, read it with `provided("theme")`, and
the app can be re-skinned, darkened or varied for one subtree without touching a view.
The same values written as `script` constants, or repeated as hex literals, can do
none of that — nothing above them can provide a different value. A repeated *text* look
— a caption, a label voice — is a `style` or a small class
([Text and fonts](declare-docs:guide:text@reusing-a-look-a-class-or-a-named-style)).

**Your tokens are yours; the library's are a contract.** Your own components can read
whatever token names you invent. The library's components read specific names —
`accent`, `control`, `surface`, `text`, `line` and a few more — so a theme used with
library controls should start from a preset and change what it needs, never from an
empty record:

```declare-fragment
theme = { app.dark ? SanFranciscoDark : SanFrancisco },       // a preset, light or dark
theme = { { ...provided("theme"), accent: 0xCC3333 } }        // one token changed, lower down
```

Four presets ship, each as a light record and a `…Dark` companion: **SanFrancisco**
(the house look), **Cupertino**, **MountainView** and **Redmond**, with
[`SanFranciscoDark`](declare-docs:SanFranciscoDark), [`CupertinoDark`](declare-docs:CupertinoDark), [`MountainViewDark`](declare-docs:MountainViewDark) and [`RedmondDark`](declare-docs:RedmondDark). The reference
page *Theme tokens* lists which tokens are required, which are optional, and which
components read each one, generated from the library's own source.

**Reading tokens in your own components.** Library controls and a few library views
declare an attribute named `theme`, so inside a class that extends [`Control`](declare-docs:Control) you can
write `theme.accent` directly. Anywhere else, read `provided("theme").accent`. Either
way, read tokens rather than writing literal colors: that is what lets a component drop
into someone else's app and follow its theme and dark mode without being edited.

## Dark mode is opt-in

An app that never mentions a theme renders the house look — [`SanFrancisco`](declare-docs:SanFrancisco), light —
always, even on a machine set to dark mode. That is deliberate: dark mode done well is a
design decision, and you should never ship a rendition you have not looked at. Following
the system is one line:

```declare-fragment
theme = { app.dark ? SanFranciscoDark : SanFrancisco }       // app.dark follows the OS, live
```

To let the reader choose, keep your own mode attribute that starts by following the
system, and use [`AppearanceSwitch`](declare-docs:AppearanceSwitch):

```declare-fragment
App [ themeMode: string = "auto",
    isDark: boolean = { app.themeMode == "auto" ? app.dark : app.themeMode == "dark" },
    theme = { app.isDark ? SanFranciscoDark : SanFrancisco },
    AppearanceSwitch [ dark = { app.isDark },
        input(v: boolean) { app.themeMode = v ? "dark" : "light" } ]
    ]
```

---

**What you can now do:** paint and composite views, provide values to a subtree — the
built-in text face and your own — theme an app from one record, re-skin a subtree, and
offer dark mode deliberately.

[Next: **Text and fonts** →](declare-docs:guide:text)
