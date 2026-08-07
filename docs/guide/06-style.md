<!-- nav: Style -->
<!-- part: Building -->

# Style is state

Everything about how a program looks is an attribute — the same kind of value as
`width`, bindable by the same constraints, flowing through the same graph. There is no
second system for appearance. That one decision is why restyling is ordinary
programming here, and why the palette of a whole app can live in one place:

> **Styling is attributes; the palette lives once.**

## Painting a view

A view's paint is a handful of attributes you set like any others:

```declare
App [ width = 300, height = 160, fill = whitesmoke,
    card: View [ x = 30, y = 30, width = 240, height = 100, cornerRadius = 12,
        fill = white,
        stroke = { stroke(1, 0xD6DCE2) },
        shadow = { shadow(0, 10, 20, 0x00000033) },
        Text [ x = 20, y = 20, fontSize = 16, fontWeight = bold, text = "Drawing" ],
        Text [ x = 20, y = 50, textColor = slategray, opacity = 0.9,
            text = "fill · stroke · shadow · radius" ]
        ]
    ]
```

`fill` paints the box, `cornerRadius` rounds it, `opacity` fades it; `stroke` and
`shadow` take small constructor calls — `stroke(width, color)`,
`shadow(dx, dy, blur, color)`. There is no CSS `border` and no `box-shadow` string:
a border *is* a stroke. (`scale` with `pivotX`/`pivotY`, and `visible`, round out the
set.) Because `stroke`/`shadow` values are `{ }` bodies, their colors are `0x…` — the
seam rule from [chapter 2](declare-docs:guide:two-brackets), holding steady.

One more compositing dial: `blend = multiply` (or `screen`, `colorDodge`, … — the
usual blend modes, camelCased) changes the *operator* a view lands with, so it mixes
with whatever has already painted beneath it instead of covering it. The view blends
as a unit, children included, and every renderer realizes the same operator natively.
Blending stops at the nearest isolating boundary — the app root, a faded
(`opacity < 1`) group, a scroller's content; a plain container is transparent to it.

## Drawing what attributes cannot say

Boxes, rounding, strokes and shadows cover most of an interface. For the rest — a gauge
arc, a tick, a sparkline, a mark no font will give you — a view can declare a **`draw`**
member, and it is a first-class member kind, not an escape hatch:

```declare
App [ width = 340, height = 200, fill = white, textColor = black,
    level: number = 62,

    gauge: View [ x = 20, y = 16, width = 160, height = 92,
        draw(d: Draw) {
            const frac = app.level / 100
            d.lineWidth = 12
            d.lineCap = "round"
            d.strokeStyle = 0xD6DCE2
            d.beginPath()
            d.arc(80, 84, 62, Math.PI, Math.PI * 2, false)
            d.stroke()
            d.strokeStyle = frac > 0.8 ? 0xC23528 : 0x2E6FE0
            d.beginPath()
            d.arc(80, 84, 62, Math.PI, Math.PI * (1 + frac), false)
            d.stroke()
            }
        ],

    pct: Text [ x = 20, y = 74, width = 160, textAlign = center, fontSize = 22, fontWeight = bold,
        text = { "" + Math.round(app.level) + "%" } ],

    Slider [ x = 20, y = 130, width = 300, value = { app.level },
        input(v: number) { app.level = v } ]
    ]
```

Drag the slider. The arc follows, the label follows, and the colour crosses to red past
80% — and **you wrote no redraw call**, because:

> **A drawing is a tracked computation, not a paint callback. It re-runs when what it
> *read* changes — never per frame.**

That is the whole idea, and it is why drawing *composes* here instead of escaping. The
body read `app.level`, so `app.level` is a wired dependency exactly as it would be inside
a `{ }` constraint ([chapter 3](declare-docs:guide:relationships)). Sitting still, this
gauge costs nothing; there is no animation loop and nothing to invalidate.

What it records is a **display list** of plain operations, which both renderers replay —
so a drawing is not a canvas dependency, and the same view paints identically through DOM
elements or on a canvas ([chapter 20](declare-docs:guide:renderers)).

Three things worth knowing before you reach for it:

- **It pairs with attributes rather than replacing them.** The view above still has `x`,
  `y`, `width` and `height`, still lays out, still takes clicks. Draw the part that is
  genuinely a shape; leave the box, the rounding and the shadow as attributes.
- **`d` is Canvas2D-shaped** — `fillStyle`, `strokeStyle`, `lineWidth`, `beginPath`,
  `moveTo`, `arc`, `bezierCurveTo`, `fill`, `stroke`, the transforms — and `d.w` / `d.h`
  are the view's own size, for a drawing that sizes itself (reading one is what opts that
  drawing into re-recording on resize). The full surface is in the reference under
  **Types and functions**.
- **Never animate a drawing's size.** Reading `width` inside the body makes the recording
  size-dependent, so an animated width re-records *and* reallocates its backing store every
  frame. Animate position, opacity or colour freely; leave the extent alone.

This is how the standard library draws every mark a font cannot be trusted with — a
`Checkbox`'s tick, the whole icon set. [Chapter 11](declare-docs:guide:make-your-own)
shows the `Icon` base and the 16-box convention that keeps a drawn mark crisp at any size.

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
        Text [ text = "94110", textColor = royalblue ]   // overrides only the color
        ]
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
        Text [ textColor = { theme.muted }, text = "muted subtitle" ]
        ]
    ]
```

Edit a token in the running example — the accent, the surface — and the reskin is one
edit, everywhere. Because `theme` is an ordinary reactive value, the two moves you'd
want are plain TypeScript: `theme = { { ...app.theme, accent: 0xE05252 } }` re-skins a
subtree partially, and `theme = { app.dark ? app.darkTheme() : app.lightTheme() }`
swaps the whole record — which is all dark mode *is*. **Style is state.** The title of
this chapter is not a metaphor.

### Your tokens are free; the library's are a vocabulary

The record above invents its own names, and for your own components that is exactly
right — `theme.muted` means whatever your components read it to mean. But the standard
library reads **specific token names**, so the moment a `Button` or a `Menu` is on screen,
the record has a contract to meet:

> **An empty record is not a theme.** Start from a preset and spread to change a token;
> do not build one from scratch.

```declare-fragment
theme = { Themes.sanFrancisco(app.dark) },                // a preset, light or dark
theme = { { ...app.theme, accent: 0xCC3333 } }           // one token changed, below
```

`Themes.sanFrancisco` / `.cupertino` / `.mountainView` / `.redmond` each take a dark
flag and are available with no include. The vocabulary splits in two, and the split is
worth knowing:

- **12 required tokens**, read bare with no fallback — `accent`, `accentText`, `control`,
  `controlHover`, `controlPressed`, `controlRadius`, `controlSelected`, `focusRing`,
  `line`, `surface`, `text`, `textMuted`. Omit one and the components that read it break.
  This is the actual contract, and it is small.
- **37 optional tokens**, each read behind a guard with a built-in default — button
  geometry, menu material, focus-ring behaviour, dialog arrangement, tooltip placement.
  These are the tuning surface: set what you care about, ignore the rest.

The reference's **Theme tokens** page lists both sets with the components that read each
one, generated from the library sources — so it states what the components actually
consult rather than what someone remembered to write down.

Two consequences worth internalizing. A theme is a **plain record**, so composing one is
ordinary TypeScript — spread a preset, override, and hand the result down. And because
the slot is prevailing, a subtree can carry its own: a dialog, a preview pane, or an
embedded app can run a different theme from the page around it without either knowing.

## Dark mode is an opt-in, deliberately

An app that never mentions a theme renders the default — San Francisco light,
*always*, even on a dark-mode machine. That is a deliberate contract: the
zero-declaration look never varies by the viewer's OS, because dark mode done
honestly is a design decision, and you should never ship a rendition you have never
seen. Following the system is one line of stated intent:

```declare-fragment
theme = { Themes.sanFrancisco(app.dark) }   // follow the system, live
```

`app.dark` is reactive, so the flip is immediate when the OS setting changes — no
listener, no reload. The named presets (`Themes.sanFrancisco`, `Themes.cupertino`,
`Themes.mountainView`, `Themes.redmond`) are each a function of that one boolean —
platform-fidelity looks, authored in Declare itself, in the library's own source.

## When text stops being a label

`Text` is a styled run. Once content has *structure* — headings, paragraphs, lists, code,
links — you want the other family: `Markdown` and `HTMLText`. Both parse their source into
the same block engine and render it as real flowing prose; they differ **only** in the
format they read. (They share an abstract base, `RichText`, which holds the prose tuning
and the link event. You never write `RichText` itself — like `Layout`, it exists so its
two concrete forms inherit one documented surface.)

```declare
App [ width = 380, height = 210, fill = white,
    note: Markdown [ x = 20, y = 16, width = 340, lineHeight = 1.35,
        text = """
            ## Rich text, from a string

            Headings, **bold**, `code`, and lists arrive as *structure* —
            not as a pile of styled `Text` views:

            - one source string
            - one component
            """
        ]
    ]
```

The reason this matters beyond convenience: **a document can be your app's material**.
Fetch a `.md` file with `format = "text"` and bind it — that is how this site serves its
FAQ and the language reference, with no JSON wrapper and no generated copy to drift
([chapter 9](declare-docs:guide:data)). `text` is an ordinary reactive attribute, so
Markdown streaming in token by token renders as it arrives.

Three tuning attributes carry across both: `lineHeight` (a leading multiplier),
`bodyColor` (the running-text colour), and `scale` (a font-size zoom a reader control can
drive). Body size and weight follow the ambient text style, exactly like a `Text`.

Links are the one thing rich text will not decide for you. **It raises the href rather
than navigating** — `onLink(href)` — because whether a link scrolls, switches an in-app
location, or leaves the site is app policy:

```declare-fragment
doc: Markdown [ text = { app.article.value || "" },
    onLink(href: string) {
        if (href.startsWith("#")) app.location = href.slice(1)
        else app.navigate(href)
        }
    ]
```

`HTMLText` is the sibling for content authored — or loaded — as HTML. It parses against a
**fixed whitelist** rather than trusting the input, and `unsupported` decides what a tag
outside the set does: `"strip"` unwraps it and keeps the text, `"error"` throws. So
loaded or untrusted content is never silently mangled. Its `accents` map is the one
styling hook — content names a fill (`<span class='g'>`) that your app defines, and never
carries CSS itself.

**Media is the same shape.** `Image` and `Video` are leaves whose lifecycle is reactive
state, like every source in the language: `loaded` and `failed` are read-only facts you
derive from rather than callbacks you wire. `Video` adds `playing` — a boolean you
constrain, not a method you call, so "stop decoding when this is off-screen" is
`playing = { app.visible }` and nothing else.

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

[Next: **Nothing bubbles** →](declare-docs:guide:interaction)
