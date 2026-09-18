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

## Bitmaps inside a drawing

A drawing can paint a picture too. The bitmap belongs to an `Image` view — it owns the
loading, the natural size and the `loaded` fact — and `d.drawImage` takes that view, in
any of Canvas2D's three argument shapes:

```declare-fragment
art: Image [ visible = false, source = "resources/badge.png" ],     // the holder
plate: View [ width = 300, height = 200,
    draw(d: Draw) {
        if (!art.loaded) return
        d.filter = "blur(3px)"
        d.drawImage(art, 20, 10, 260, 180)                         // scaled into a box
        d.drawImage(art, 0, 0, 100, 100, 200, 120, 50, 50)         // a crop
        }
    ]
```

Reading `art.loaded` is what makes this reactive: the body records nothing until the
bitmap lands, then records again on its own. The picture rides through every filter,
alpha and composite the drawing sets, on all three renderers.

## Filters, masks, and the gradients

Every renderer composites a view through one pipeline — **paint → filter → clip →
mask → opacity → blend**, with `backdrop` sampled beneath before the paint — and each
stage is an attribute:

```declare-fragment
card:  View  [ filter = { [blur(d * 1.15), brightness(1 - d * 0.13)] } ]   // its own paint, as a group
badge: Image [ filter = shadow(0, 26, 52, 0x00000047) ]                    // a shadow of the alpha, not the box
glass: View  [ backdrop = [blur(20), saturate(1.4)], fill = #F9F9FBDB ]     // what lies beneath (frost(20, 1.4) is the same)
fade:  Image [ mask = gradient("180deg", #00000000, #000000FF) ]            // a soft mask: the gradient's alpha
logo:  View  [ mask = { stencil }, stencil: Image [ visible = false, … ] ]  // or another view's painted alpha
glow:  View  [ fill = radialGradient(0.5, 0.38, 0.3, #FFFFFF60, #FFFFFF00) ]
dial:  View  [ fill = conicGradient(0.5, 0.5, 0, #FF5A36, #FFD23F, #FF5A36) ]
```

`filter` takes one function or a list — `blur`, `brightness`, `contrast`, `saturate`,
`grayscale`, `invert`, `sepia`, `hueRotate`, `colorize` (the alpha in one color, what
`Image.tint` is sugar for) and `shadow` — applied to the view's **clipped subtree as a
group**, children included. Lengths are view units and follow the view's transform; the
output may bleed past the box, and layout ignores the bleed. `backdrop` takes the same
list and applies it to what has already painted beneath the view's own shape; `frost(…)`
builds the material pair. A filtered or masked view isolates blends and backdrops inside
it. All of it is paint: hit-testing, focus and the crawl never change.

One `shadow(dx, dy, blur, color)` value, three sites: the box's own `shadow`, a `Text`'s
`textShadow`, and inside a `filter` list the painted alpha's — the same blur radius means
the same look at each. Gradients are three: `gradient` along a line, `radialGradient` out
from a center (fractions of the box; the reach a fraction of the farthest corner), and
`conicGradient` around one — as a `fill`, a `textFill`, or a `mask`.

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

Drag the slider. The arc follows, the label follows, and the color crosses to red past
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
  frame. Animate position, opacity or color freely; leave the extent alone.

### Text in a drawing

`d.fillText` and `d.strokeText` take a **style** after the position — a `style` bundle, or
an inline record with `Text`'s own attribute names — and `measureText` measures with the
same record, so a drawing can size and place a run before it paints it:

```declare
style Caption [ fontSize = 13, smallCaps = true, letterSpacing = 0.5, textColor = #1B2733 ]

App [ width = 240, height = 80, fill = white,
    plate: View [ x = 20, y = 20, width = 200, height = 40,
        draw(d: Draw) {
            const m = measureText("Plate 4", Caption)
            d.fillStyle = 0xE7EBF1
            d.fillRect((d.w - m.width) / 2 - 8, 0, m.width + 16, d.h)
            d.fillText("Plate 4", (d.w - m.width) / 2, (d.h - m.height) / 2 + m.baseline, Caption)
            }
        ]
    ]
```

A style holds **exactly what you write**: a field left out takes its plain default
(`sans-serif`, 16, normal, no treatments), never an inherited value, so a measurement means
the same wherever it is called. That is also why the style is not optional — silence would
otherwise mean two different things, and the wrong one returns a plausible number instead of
an error.

A `Text` is the other way round: it sets a size and **inherits** the rest of its face from
whatever provides it. So a drawn or measured run that should match the text around it asks
for that face by name — **`providedTextStyle(overrides?)`** is the `TextStyle` in force where
you write it, with your own fields on top:

```declare-fragment
panel: View [ fontFamily = { app.brand },
    caption: Text [ fontSize = 20, text = "Chapter one" ],          // inherits app.brand
    plate: View [
        pad: number = { measureText("Chapter one", providedTextStyle({ fontSize: 20 })).width + 24 },
        draw(d: Draw) {
            d.fillText("Chapter one", 0, 22, providedTextStyle({ fontSize: 20 }))
            }
        ]
    ]
```

Both of those measure and paint in exactly the face `caption` renders in. Without it they
would fall to plain `sans-serif`, and a panel under a brand font would be measured in a face
it never shows — a mistake with no symptom but a wrong number.

It is a property of the node, not of where you read it: a value body and that same view's
`draw()` get the same record, and a drawing's own `d.font` state is a separate thing that
does not affect it. When you genuinely want a face the tree does not provide, write the
record yourself, as the `Caption` bundle above does.

Reading a font in the style — directly, or through `providedTextStyle(…)` — is a dependency like any
other: the drawing records again when you switch fonts or when the font's faces land. A
style draws its face, its treatments, `textColor` and `textShadow`; `textFill`, `outline`,
`underline` and `strike` are refused in a drawing — paint those with the drawing's own
calls. Outside a drawing `measureText(text, style, width?)` is an ordinary function: in a
constraint it re-runs when anything it measured with changes, in a handler it measures now,
and given a width it wraps exactly as a `Text` of that width would, reporting `lines` and
the block's `height`.

This is how the standard library draws every mark a font cannot be trusted with — a
`Checkbox`'s tick, the whole icon set. [Chapter 11](declare-docs:guide:make-your-own)
shows the `Icon` base and the 16-box convention that keeps a drawn mark crisp at any size.

## Type, and provided values

The **text face** is five attributes — `textColor`, `fontSize`, `fontFamily` (a family string,
a `Font`, or a fallback list), `fontWeight`, `letterSpacing` — and they are **provided
values**: each lives on `Text`, and its
default *reads the nearest ancestor that provides it*. So setting one on a container
**provides** it to every `Text` beneath, and an unset `Text` inherits it, live, until a
descendant overrides. (Slant is separate: `italic = true` on a `Text` renders the italic
face, per-`Text` — it is not provided.) `fontWeight` is a keyword or a number 1–1000 —
`bold` and `700` are the same weight, and `350` reaches a variable font's axis between
the names. Set them once, high:

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
code reaches up the tree for a value — which the theme, below, shows.

## Fonts

A typeface is an object, like an `Image`. You create it where it belongs — usually on the
App, so it lives as long as the program — and use it anywhere a family goes:

```declare-fragment
App [ fontFamily = { [brand, "Helvetica", "sans-serif"] },

    brand: Font [
        Face [ src = "brand-400.woff2" ],
        Face [ src = "brand-700.woff2", weight = bold ],
        Face [ src = "brand-400i.woff2", italic = true ]
        ],
    serif: Font [ Face [ src = "serif-var.woff2", weight = range(200, 900) ] ],
    ui:    Font [ family = "Helvetica Neue" ],

    Text [ text = "Set in brand, provided by the App" ],
    Text [ fontFamily = { app.ui }, fontWeight = bold, text = "Set in the system face" ]
    ]
```

A `Font` owns its faces. Each `Face` is one file: `src` is a URL, an installed face
(`local("Work Sans")`), or a list tried in order; `weight` is a name from `thin` to `black`,
a number from 1 to 1000, or `range(lo, hi)` for a variable font; `italic` marks the slanted
face. A font with no faces is a **system font**: it names a `family` the machine already
has, and there is nothing to load. Web fonts and system fonts are the same kind of object,
so anything that takes one takes the other.

`fontFamily` takes a font, a family string, or a list tried in order. A family string needs
no object — `fontFamily = "Georgia"` — and a list of strings stays a bare literal. A list
that holds a font is a value, so it is written in a `{ }`, as on the App above.

### Switching fonts

A font is a value, so switching is assignment — click this one:

```declare
App [ width = 360, height = 110, fill = white, textColor = black,
    serif: Font [ family = "Georgia" ],
    sans: Font [ family = "Helvetica" ],
    reading: Font = { app.serif },
    onClick() { app.reading = app.reading == app.serif ? app.sans : app.serif },
    Text [ x = 20, y = 20, width = 320, fontSize = 20, fontFamily = { app.reading },
        text = "Click to switch the face; the run re-measures." ]
    ]
```

Every `Text` reading the slot re-measures in the new face, and the layout follows in the
same settle. A web font becomes a system font this way, and back.

### While a font loads

A face is a file, and a file takes time to arrive. Whenever something is about to be drawn
in a font that hasn't arrived, Declare asks that font two questions:

> **How long is it worth waiting for? And if it arrives after that, should text change to it?**

```declare-fragment
brand: Font [ wait = 800, … ]                  // hold up to 0.8 s, then swap when it arrives
icons: Font [ wait = 3000, … ]                 // the wrong glyphs are worse than a delay
body:  Font [ wait = 0, late = keep, … ]       // never hold, never redraw for it
```

**`wait`** (milliseconds, default 500) is how long whatever is about to change to this font
keeps its current look:

- **When the app starts**, that is the first paint: the app appears once every font it
  starts with has arrived, failed, or used up its wait.
- **When a slot switches to a font that is still loading**, the slot holds the new font at
  once — `app.reading` *is* the new font — but the text it drives keeps drawing in the family
  it had, and changes once, when the font arrives.
- **When a face's `src` changes**, text keeps the face it had until the new one is ready.

A face that fails ends the wait at once. **`late`** decides what an arrival after the wait
does: `swap` (the default) changes text to the font when it lands — one redraw; `keep` leaves
the fallback for the rest of the run, and nothing redraws. Most fonts need neither attribute,
and a system font has nothing to wait for.

### A font's facts

Like an `Image`, a font reports its state as read-only facts: `loaded` once every face has
arrived (a system font is loaded from the start), `failed` when a face could not be fetched —
text then uses the next family in its list. While a font loads, both are `false`, and with
`late = keep` a face that arrives too late leaves `loaded` false for the run. You rarely read
them — text, layout and drawings follow a face landing on their own — but they are there
when a design depends on them:

```declare-fragment
notice: Text [ visible = { app.brand.failed }, text = "Showing a substitute font" ]
```

### Fonts that change while the app runs

A face's `src` can be a `{ }` value like any other attribute, so a font chosen at runtime
needs nothing new:

```declare-fragment
fontUrl: string = "",
preview: Font [ wait = 300, Face [ src = { app.fontUrl } ] ],
sample: Text [ fontFamily = { [app.preview, "Georgia"] }, text = "The quick brown fox" ]
```

Set `fontUrl`, and the sample keeps its current face for up to 300 ms, then changes when the
new face lands. **Lifetime is placement**: a font on the App lives for the program, and a
font inside a view unloads its faces when the view retires.

Compiling never reads a font file, so a font can never fail a compile. A relative `src` is a
file beside the program, shipped with a build; a remote URL is fetched from its host, which
in a browser must allow cross-origin font requests.

> **From CSS:** no `@font-face` rules, no `document.fonts.ready`, no loading classes to
> toggle. `wait` and `late` cover what `font-display` does, with a time you choose instead of
> fixed periods — and no invisible text: something always stays drawn.

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
top-level named record, the same shape as a `style Name [ … ]` bundle and `schema Name [ … ]`.
The library's vocabulary splits in two, and the split is worth knowing:

- **12 required tokens**, read bare with no fallback — `accent`, `accentText`, `control`,
  `controlHover`, `controlPressed`, `controlRadius`, `controlSelected`, `focusRing`,
  `line`, `surface`, `text`, `textMuted`. Omit one and the components that read it break.
  This is the actual contract, and it is small.
- **37 optional tokens**, each read behind a guard with a built-in default — button
  geometry, menu material, focus-ring behavior, dialog arrangement, tooltip placement.
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

An app that never mentions a theme renders the house look — `SanFrancisco`, light,
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
`bodyColor` (the running-text color), and `scale` (a font-size zoom a reader control can
drive). Body size and weight follow the provided text face, exactly like a `Text`.

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
style**, never CSS: a run marked `<span class='Hero'>` takes whatever `Hero` is defined to
be — a top-level `style` bundle your app declares once (the next section). The palette the
content draws from is `textStyles`, and it is **inherited like the rest of the text face**:
set it high and every rich text below takes it.

```declare-fragment
App [ textStyles = { { Keyword, TypeName } }, … ]
```

A `style` declaration is a value, and `{ Keyword }` is shorthand for `{ Keyword: Keyword }`,
so a bundle drops into the map under the name the content uses. For a one-off, or a look that
depends on where it is used, write the map inline on the element instead — that one is an
ordinary `{ }`, so it can read the theme, or be computed.

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
- `numerals` and `numeralWidth` choose the **figures** a face offers — `lining` or `oldstyle`
  shapes, `tabular` or `proportional` widths — and `slashedZero` slashes the zero. `normal`
  on either axis is the face's own default, which is why both values are sayable.
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
color one word?

For a **view**, the answer is the language you already have — a **subclass**. A named look is
a `class` extending `Text`, and every geometry-and-style trick in this guide is available to
it; a theme-following field is a `{ }` reading `provided("theme")`:

```declare-fragment
class Kw   extends Text [ textColor = #C678DD ]
class Hero extends Text [ fontSize = 40, textFill = { gradient("90deg", 0x4C8DFF, 0x37E0C8) } ]
```

For a **run of text that has no view** — a word inside parsed prose, a label a drawing
paints — a subclass has nothing to attach to. So a top-level **`style` bundle** names the look
instead, the one place a look is addressed by name rather than by class:

```declare
class Hero extends Text [ fontSize = 40, textFill = { gradient("90deg", 0x4C8DFF, 0x37E0C8) } ]
style Keyword [ textColor = #C678DD, fontWeight = bold ]

App [ width = 380, height = 130, fill = white,
    Hero [ x = 20, y = 16, text = "Big, gradient-filled" ],
    HTMLText [ x = 20, y = 84, fontSize = 15, bodyColor = 0x33424E,
        html = "<span class='Keyword'>class</span> Board [ ]" ]
    ]
```

`Hero` is a view you drop in; `<span class='Keyword'>class</span>` resolves the `Keyword`
bundle for a run of prose, and a drawing's `fillText` or `measureText` takes the same record
(above). A bundle is a **plain record of literal values**, exactly like a theme: it is
declared at the top, has no place in the tree, and so nothing in it can depend on where it is
used. Its name is a value in any `{ }` — `Keyword.textColor` — typed by the fields it sets, and
top-level names are capitalized by convention. A look that should *follow* something — the
theme, dark mode — is written where it is used: on the rich text, a `textStyles` map built in
a `{ }`, or a spread in a drawing:

```declare-fragment
HTMLText [ html = "<span class='Keyword'>class</span> Board [ ]",
    textStyles = { { Keyword: { ...Keyword, textColor: provided("theme").accent } } } ],

plate: View [ draw(d: Draw) { d.fillText("class", 0, 20, { ...Keyword, textColor: provided("theme").accent }) } ]
```

The same three renderers draw all of it: the treatments and the bundles render identically
on DOM, canvas and the native Mac host.

## Views in a sentence

Prose carries things that are not words. An issue with its status dot, a person with their
avatar, a keycap, a tag on a filing — each sits mid-sentence and each is a small piece of
interface, not a run of characters. A style cannot make one: a style is paint on glyphs,
and these have a shape, a size of their own, and sometimes a response.

So inside rich text, **a tag whose name is one of your own view classes builds one real
view of that class**, placed in the flowing line as an atomic box the words wrap around.
There is nothing to switch on and no attribute to set — declaring the class is what makes
the tag mean it.

```declare
class Chip extends View [
    label: string = "",
    height = 19, width = { this.t.width + 18 }, cornerRadius = 9, fill = #DDF4E4,
    t: TextLabel [ x = 9, y = center, fontSize = 12, textColor = #1A5B2E, text = { classroot.label } ]
    ]

App [ width = 380, height = 96, fill = white,
    HTMLText [ x = 20, y = 20, width = 340, fontSize = 15, bodyColor = 0x33424E,
        html = "Filed under <Chip label='docs'/> and <Chip label='runtime'/> this morning." ]
    ]
```

Both formats read the tag — `HTMLText`'s `html` and `Markdown`'s `text`. The name is matched
exactly as written, so `<Chip/>` finds `Chip` and nothing else finds it; a tag naming no class
of yours keeps the meaning it already had, which is the HTML whitelist, an autolink, or a
literal `<`. (A class named exactly like a whitelisted tag therefore wins inside content, and
the compiler warns you at the class declaration.)

**A style and a view do not overlap.** `<span class='Keyword'>` is the named style of the
last section and can never be a view; a tag is never a style. One recolours the characters of
a run, the other is a node in the tree with its own box — and you reach for the second only
when the first cannot do it.

### Passing values

A tag's attributes are the class's attributes: `<Chip label='docs'/>` means
`Chip [ label = "docs" ]` — the tag is the use site, and the whole of that sentence holds.
Each value arrives as a string and converts by the attribute's **declared type**, exactly as
a literal written in source does — `count='3'` is the number `3` in a `number` slot and the
string `"3"` in a `string` one, `tint='#DDF4E4'` is a `Color`, `align='center'` an enum
member by name, `width='50%'` a percent of the width the text flows in, and a bare `hot` is
`true`. And it takes the use site's precedence: a tag attribute beats what the class body
sets for that slot — a literal or a `{ }` constraint — and, as everywhere else, only the
winner is installed, so nothing is left recomputing over it. A slot the tag does not mention
keeps the class's own behaviour, constraint and all.

`x` and `y` are refused: the flow places an inline view, the way a layout places its children.
An attribute the class does not have, a value that will not convert, a read-only slot, or a
percent on a slot with no axis to resolve against goes to the `unsupported` policy — `strip`
drops that attribute and says so once, `error` throws naming the offence. Nothing a tag says
is quietly ignored. (`Markdown` strips; `HTMLText` uses whatever you set, and strips by
default.)

### Values that change

`html` and `text` are ordinary reactive attributes, so there are two ways to feed a tag live
data, and the second is usually the better one. You can compute the content and let the tag
ride along in the string:

```declare-fragment
html = { "Now in <Chip label='" + escapeHtml(app.stage) + "'/>." }
```

or you can put an **identity** in the content — `"Fixed by <Issue id='142'/>."` — and derive
everything else inside the class, which needs no re-parse at all when the data moves:

```declare-fragment
class Issue extends View [ id: number = 0,
    status: string = { app.statusOf(id) },                    // the class watches the data
    fill = { status == "open" ? 0xDDF4E4 : 0xEDE7F6 }
    ]
```

What you cannot do is write an expression inside the markup — `label='{ app.stage }'` is the
literal characters, not a constraint. Content is a string, and a read inside a string is
invisible to the dependency analysis that makes everything else in Declare re-derive, so the
string is where a computed value is assembled. Two consequences worth knowing: `escapeHtml(s)`
is how you make a value safe to concatenate in, because a name carrying `'` or `<` would
otherwise close an attribute or open an element of its own; and a document that is computed or
fetched rather than written out literally names its classes only at run time, so list them in
`use [ Chip ]` to keep them in a production build.

### The same view across a change

New content re-parses, and a tag that is still there **keeps its view** — its hover, its
focus, a spring still in flight — while only the attributes that actually changed are written
to it. A tag that arrived gets a new view, a tag that vanished has its view discarded, and an
attribute dropped from a tag hands that slot back to the class — its literal, its constraint,
whatever the class says — because the tag is the statement of what that view is. Which slots
a tag claims is settled when the view is built, so a tag that gains or loses one is built
again; a tag whose values change keeps its view.

A view's identity is its class name plus the tag's ordinal, which is right until the order
moves. `key='…'` names it instead — the same word replication uses for the same reason — and
a `key` is identity only: it is never passed to the class.

### It is a real view

Everything else in this guide applies to it. It owns its `width` and `height`; the flow owns
its `x` and `y`, as real values you can read. It never splits across a line break, it sits on
the line by the first baseline inside it — or by its bottom edge when nothing in it claims one
— a taller one grows its line, and when it changes size the text flows again around the new box. It reads the surrounding run's text face as provided
values, so a chip in a heading is heading-sized unless it says otherwise, and
`providedTextStyle()` inside it answers the run's style. And it has state, handlers and
motion, which is the whole reason to want one:

```declare
class Tag extends View [
    label: string = "",
    height = 20, width = { this.t.width + 20 }, cornerRadius = 10,
    fill = { this.hovered ? 0x4C8DFF : 0xE6ECF2 },
    t: TextLabel [ x = 10, y = center, fontSize = 12, text = { classroot.label },
        textColor = { classroot.hovered ? 0xFFFFFF : 0x33424E } ]
    ]

App [ width = 380, height = 96, fill = white,
    HTMLText [ x = 20, y = 20, width = 340, fontSize = 15, bodyColor = 0x33424E,
        html = "Hover <Tag label='either'/> or <Tag label='this one'/> — each is its own view." ]
    ]
```

Two limits. A tag must be **self-closing** — `<Chip label='docs'/>`; a tag with content
between an opening and a closing tag is not this. And only **view classes** may be named: a
Layout, a data node, or a built-in component name in prose is not a view, and stays the text
it was.

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
