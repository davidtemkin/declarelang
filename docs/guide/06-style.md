<!-- nav: Style -->
<!-- part: Building -->

# Style is state

Everything about how a program looks is an attribute — the same kind of value as
`width`, bindable by the same constraints, flowing through the same graph. There is no
second system for appearance. That one decision is why restyling is ordinary
programming here, and why the palette of a whole app can live in one place:

> **Styling is attributes; the palette lives once.**

## Drawing a view

A view's paint is a handful of attributes you set like any others:

```declare
App [ width = 300, height = 160, fill = whitesmoke,
    card: View [ x = 30, y = 30, width = 240, height = 100, cornerRadius = 12,
        fill = white,
        stroke = { stroke(1, 0xD6DCE2) },
        shadow = { shadow(0, 6, 18, 0x1A2A3833) },
        Text [ x = 20, y = 20, fontSize = 16, fontWeight = bold, text = "Drawing" ],
        Text [ x = 20, y = 48, textColor = slategray, opacity = 0.9,
            text = "fill · stroke · shadow · radius" ],
        ],
    ]
```

`fill` paints the box, `cornerRadius` rounds it, `opacity` fades it; `stroke` and
`shadow` take small constructor calls — `stroke(width, color)`,
`shadow(dx, dy, blur, color)`. There is no CSS `border` and no `box-shadow` string:
a border *is* a stroke. (`scale` with `pivotX`/`pivotY`, and `visible`, round out the
set.) Because `stroke`/`shadow` values are `{ }` bodies, their colors are `0x…` — the
seam rule from [chapter 2](declare-docs:guide:two-brackets), holding steady.

## Type, and the prevailing rule

Text style is four attributes — `textColor`, `fontSize`, `fontFamily` (a fallback
list), `fontWeight` — and they are **prevailing**: an unset slot follows the nearest
ancestor that sets it, live, until a descendant overrides it. (Slant is separate:
`italic = true` on a `Text` renders the italic face, per-`Text` — it does not
prevail.) Set them once, high:

```declare
App [ fill = white, fontFamily = ["Helvetica Neue", "sans-serif"], fontSize = 15, fontWeight = bold, textColor = black,
    topBar: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 6 ],
        Text [ text = "Rain or Shine?" ],
        Text [ text = "94110", textColor = royalblue ],   // overrides only the color
        ],
    ]
```

Neither `Text` repeats family, size, or weight; the second overrides one thing. This
is what keeps a real interface free of style repetition — and it *is* a cascade of a
kind: values flow down the tree until overridden. What it is not is CSS's cascade —
no selectors, no specificity contest, no `!important`, no rule fighting another rule
from a different file. One mechanism — nearest ancestor wins, reactively — instead of
an arbitration system.

## The `theme` record

`theme` is a prevailing *record* of named tokens. Provide it once; every descendant
reads roles out of it:

```declare
class Heading extends Text [ fontWeight = bold, textColor = { theme.text } ]

App [ fill = { theme.surface }, theme = { ({ text: 0xE7EEF2, muted: 0x8A9BA6, accent: 0x4C8DFF, surface: 0x101E28 }) },
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        Heading [ text = "Signals" ],
        Text [ textColor = { theme.muted }, text = "muted subtitle" ],
        ],
    ]
```

Edit a token in the running example — the accent, the surface — and the reskin is one
edit, everywhere. Because `theme` is an ordinary reactive value, the two moves you'd
want are plain TypeScript: `theme = { { ...app.theme, accent: 0xE05252 } }` re-skins a
subtree partially, and `theme = { app.dark ? app.darkTheme() : app.lightTheme() }`
swaps the whole record — which is all dark mode *is*. **Style is state.** The title of
this chapter is not a metaphor.

## Dark mode is an opt-in, deliberately

An app that never mentions a theme renders the default — San Francisco light,
*always*, even on a dark-mode machine. That is a deliberate contract: the
zero-declaration look never varies by the viewer's OS, because dark mode done
honestly is a design decision, and you should never ship a rendition you have never
seen. Following the system is one line of stated intent:

```declare-fragment
theme = { Themes.sanFrancisco(app.dark) },   // follow the system, live
```

`app.dark` is reactive, so the flip is immediate when the OS setting changes — no
listener, no reload. The named presets (`Themes.sanFrancisco`, `Themes.cupertino`,
`Themes.mountainView`, `Themes.redmond`) are each a function of that one boolean —
platform-fidelity looks, authored in Declare itself, in the library's own source.

## Same program, no DOM — try it

Here is what "styling is part of the language" buys beyond convenience. Because a
view's look is entirely attributes — no stylesheet the browser owns, no cascade to
consult — the renderer is swappable: the same program paints to DOM elements or
directly to pixels on a canvas. Open any Declare app and append `?render=canvas` to
its URL: same tree, same layout, same input, drawn by a different hand. (The two
renderers are held pixel-for-pixel against each other in the platform's test suite.)
And note what this is *not*: on the default DOM renderer, the browser remains the
browser — text is real text, selection and find-in-page are native, fields are
native fields, and a scrolling view is ordinary native `overflow` with the
platform's own scrollbars and physics. Renderer independence is an option held in
reserve, not a canvas takeover you're already paying for. A language that owns its
whole semantics, with no substrate assumptions leaking in, can retarget — that
property costs you nothing today and is the door to renderers that don't exist yet.

---

**What you can now say:** you can paint, type, and theme an interface with the same
constraints you use for everything else; reskin a subtree or the whole app in one
edit; and opt into the system's dark mode with a line — no stylesheet anywhere.

[Next: **Interaction is delivery** →](declare-docs:guide:interaction)
