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

`fill` paints the box, `cornerRadius` rounds it (one number for all four corners, or
`[topLeft, topRight, bottomRight, bottomLeft]` to round only some — a tab joined to its
pane is `[8, 8, 0, 0]`), `opacity` fades it; `stroke` and
`shadow` take small constructor calls — `stroke(width, color)`,
`shadow(dx, dy, blur, color)`. There is no CSS `border` and no `box-shadow` string:
a border *is* a stroke. (`scale` and `rotation` — degrees, clockwise — share
`pivotX`/`pivotY` and, with `visible`, round out the set.) Because `stroke`/`shadow` values are `{ }` bodies, their colors are `0x…` — the
seam rule from [chapter 2](declare-docs:guide:two-brackets), holding steady.

One more compositing dial: `blend = multiply` (or `screen`, `colorDodge`, … — the
usual blend modes, camelCased) changes the *operator* a view lands with, so it mixes
with whatever has already painted beneath it instead of covering it. The view blends
as a unit, children included, and every renderer realizes the same operator natively.
Blending stops at the nearest isolating boundary — the app root, a faded
(`opacity < 1`) group, a scroller's content; a plain container is transparent to it.

And the material one: `backdrop = frost(20)` samples whatever lies beneath the view,
blurs it, and lets the view's own translucent `fill` wash over the result — the
frosted-panel look every platform's menus and sheets wear. `frost(radius, saturation)`
takes an optional saturation multiplier (frosted materials read best around 1.4–1.8);
the sample keeps to the view's own painted shape, so a rounded panel frosts a rounded
region.

## Drawing what attributes cannot say

Boxes, rounding, strokes and shadows cover most of an interface. For the rest — a gauge
arc, a tick, a sparkline, a mark no font will give you — a view can define a **`draw`**
method and paint itself:

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

> **`draw` is an ordinary method, and a constraint calls it. It re-runs when what it
> *read* changes — never per frame.**

That is the whole idea, and it is why drawing *composes* here instead of escaping. `View`
holds a constraint of its own, `drawing = { record(draw) }`, that runs your method through
a recorder; a method called from a constraint has its reads tracked, so the body's read of
`app.level` is a wired dependency exactly as it would be inside your own `{ }`
([chapter 3](declare-docs:guide:relationships)). Nothing about `draw` is special beyond
whose constraint calls it. Sitting still, this gauge costs nothing; there is no animation
loop and nothing to invalidate.

What it records is a **display list** of plain operations, which every renderer replays —
so a drawing is not a canvas dependency, and the same view paints identically through DOM
elements, on a canvas, or on a native layer tree ([Where it runs](declare-docs:guide:renderers)).

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

## Type, and provided values

Text style is four attributes — `textColor`, `fontSize`, `fontFamily` (a fallback
list), `fontWeight` — and they are **provided values**: each lives on `Text`, and its
default *reads the nearest ancestor that provides it*. So setting one on a container
**provides** it to every `Text` beneath, and an unset `Text` inherits it, live, until a
descendant overrides. (Slant is separate: `italic = true` on a `Text` renders the italic
face, per-`Text` — it is not provided.) Set them once, high:

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
kind: a value flows down the tree from where you provide it until a descendant
overrides. What it is not is CSS's cascade — no selectors, no specificity contest, no
`!important`, no rule fighting another rule from a different file. One mechanism —
nearest provider wins, reactively — instead of an arbitration system. You never write
the *read*; `Text` does that for you. You only ever type `provided("…")` when your own
code reaches up the tree for a value — which the theme, next, shows.

## The `theme` record

`theme` is a **provided value** whose value is a *record* of named tokens. You provide it
once — a plain set on the App — and read a role out of it with `provided("theme")`:

```declare
class Heading extends Text [ fontWeight = bold, textColor = { provided("theme").text } ]

App [ fill = { provided("theme").surface }, theme = { { text: 0xE7EEF2, muted: 0x8A9BA6, accent: 0x4C8DFF, surface: 0x101E28 } },
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        Heading [ text = "Signals" ],
        Text [ textColor = { provided("theme").muted }, text = "muted subtitle" ]
        ]
    ]
```

Two forms sit side by side, and the split is the whole idea. `theme = { … }` on the App
**provides** the record — a plain set, no keyword. `provided("theme").surface` **reads**
it — the explicit up-the-tree read, shown because it reaches past this view for a value.
The library components read it *for* you (a `Button` styles off `provided("theme")` inside
`Control`), so an app that only sets `theme` and drops widgets on the page never writes
`provided(…)` at all; you write it only where your *own* code wants a token.

Edit a token in the running example — the accent, the surface — and the reskin is one
edit, everywhere. Because `theme` is an ordinary reactive value, the two moves you'd
want are plain TypeScript: `theme = { { ...provided("theme"), accent: 0xE05252 } }`
re-skins a subtree partially (provide a modified record lower down), and
`theme = { app.dark ? app.darkTheme() : app.lightTheme() }` swaps the whole record —
which is all dark mode *is*. **Style is state.** The title of this chapter is not a
metaphor.

### Your tokens are free; the library's are a vocabulary

The record above invents its own names, and for your own components that is exactly
right — `theme.muted` means whatever your components read it to mean. But the standard
library reads **specific token names**, so the moment a `Button` or a `Menu` is on screen,
the record has a contract to meet:

> **An empty record is not a theme.** Start from a preset and spread to change a token;
> do not build one from scratch.

```declare-fragment
theme = { app.dark ? SanFranciscoDark : SanFrancisco },       // a preset, light or dark
theme = { { ...provided("theme"), accent: 0xCC3333 } }        // one token changed, below
```

The four presets — **SanFrancisco**, **Cupertino**, **MountainView**, **Redmond** —
each come as a light record and a `…Dark` companion (`SanFranciscoDark`,
`CupertinoDark`, …), in scope by name with no include: you name the pair you want.
You can declare your own the same way — `theme Brand [ accent = #E05252, … ]` is a
top-level named record, the same shape as `font Name [ … ]` and `schema Name [ … ]`.
The library's vocabulary splits in two, and the split is worth knowing:

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
it is a provided value, a subtree can provide its own: a dialog, a preview pane, or an
embedded app can `theme = { … }` a different record from the page around it, and every
`provided("theme")` below reads the nearer one, without either knowing.

## Dark mode is an opt-in, deliberately

An app that never mentions a theme renders the default — San Francisco light,
*always*, even on a dark-mode machine. That is a deliberate contract: the
zero-declaration look never varies by the viewer's OS, because dark mode done
honestly is a design decision, and you should never ship a rendition you have never
seen. Following the system is one line of stated intent:

```declare-fragment
theme = { app.dark ? SanFranciscoDark : SanFrancisco }   // follow the system, live
```

`app.dark` is reactive, so the flip is immediate when the OS setting changes — no
listener, no reload. Each preset is a light record with a `…Dark` companion, so
following the system is one reactive choice between the pair — platform-fidelity
looks, authored in Declare itself, in the library's own source.

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
loaded or untrusted content is never silently mangled. Its styling hook is a **named
style**, never CSS: a run marked `<span class='hero'>` takes whatever `hero` is defined to
be — a top-level `style` bundle your app declares once (the next section). For a one-off, a
local `textStyles = { … }` map on the element is the inline alternative.

**Media is the same shape.** `Image`, `Video` and `Audio` are leaves whose lifecycle is
reactive state, like every source in the language: `loaded` and `failed` are read-only
facts you derive from rather than callbacks you wire. `Video` and `Audio` share one
transport (the `Media` base): `playing` is a boolean you constrain, not a method you
call, so "stop decoding when this is off-screen" is `playing = { app.visible }` and
nothing else — and a progress bar is a `width` derived from `position` and `duration`,
not a widget. `Audio` is the same transport with nothing to look at: it draws nothing,
and where you declare it says who owns the sound.

## Text, styled by name

Colour and size are only the start of what a run can carry. The **treatments** are
per-run paint, each a plain attribute on a `Text` (and on every rich-text run):

- `textFill` fills the glyphs themselves — a `gradient(…)` or solid — overriding `textColor`.
- `textShadow` drops a `shadow(dx, dy, blur, color)` under the letters.
- `outline` strokes their **edges** with `outline(width, color)` — outlined type, not a box;
  the stroke rides under the fill, so a filled letter shows a ring and an unfilled one reads hollow.
- `smallCaps` sets the lowercase as small capitals, synthesized from the current font.
- `textTransform` reshapes the glyphs — `uppercase`, `lowercase`, `capitalize` — **without**
  touching the underlying string, so selection and find-in-page still see what you wrote.
- `underline` and `strike` rule the run.

```declare
App [ width = 320, height = 84, fill = #0B141B,
    Text [ x = 20, y = 24, fontSize = 26, textColor = white, fontWeight = bold,
        outline = outline(1, #C0392B), text = "OUTLINED" ]
    ]
```

Unlike `textColor` and `fontSize` — the provided values an ancestor hands down — a
treatment lives on the run itself and does not cascade. Which raises two questions: how do
you reuse a look across whole `Text` views, and how do you reach *inside* parsed prose to
colour one word?

For a **view**, the answer is the language you already have — a **subclass**. A named look is
a `class` extending `Text`, and every geometry-and-style trick in this guide is available to
it; a theme-following field is a `{ }` reading `provided("theme")`:

```declare-fragment
class Kw   extends Text [ textColor = #C678DD ]
class Hero extends Text [ fontSize = 40, textFill = { gradient("90deg", 0x4C8DFF, 0x37E0C8) } ]
```

For a **run inside parsed prose**, a subclass has nothing to attach to — there is no view at
"the third word of a paragraph". So a `<span class='…'>` names a top-level **`style` bundle**
instead, the one place a look is addressed by name rather than by class:

```declare
class Hero extends Text [ fontSize = 40, textFill = { gradient("90deg", 0x4C8DFF, 0x37E0C8) } ]
style kw  [ textColor = { provided("theme").accent } ]     // fields may read provided values

App [ width = 380, height = 130, fill = white,
    Hero [ x = 20, y = 16, text = "Big, gradient-filled" ],
    HTMLText [ x = 20, y = 84, fontSize = 15, bodyColor = 0x33424E,
        html = "<span class='kw'>class</span> Board [ ]" ]
    ]
```

`Hero` is a view you drop in; `<span class='kw'>class</span>` resolves the `kw` bundle for a
run of prose. A bundle field is an ordinary attribute, so it can be a `{ }` body:
`style kw [ textColor = { provided("theme").accent } ]` re-derives when the theme changes,
and every highlighted keyword follows in the same settle — so one definition colours a live
code panel and a documentation snippet alike, and both track dark mode. The same three
renderers draw all of it: the treatments and the bundles render identically on DOM, canvas
and the native Mac host.

## Same program, no DOM — try it

Here is what "styling is part of the language" buys beyond convenience. Because a
view's look is entirely attributes — no stylesheet the browser owns, no cascade to
consult — the renderer is swappable: the same program paints to DOM elements or
directly to pixels on a canvas. Open any Declare app and append `?render=canvas` to
its URL: same tree, same layout, same input, drawn by a different hand. (The renderers are
held pixel-for-pixel against each other in the platform's test suite — and the same
program runs in a native Mac host too, which is [Where it runs](declare-docs:guide:renderers)'s story.)
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
