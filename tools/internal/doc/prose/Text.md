A run of text, sized by native browser metrics when you don't give it a width or
height — so a bare `Text [ text = "hi" ]` is exactly as wide and tall as its glyphs.
Its **face** lives with `Text`: `textColor`, `fontSize`, `fontFamily`, `fontWeight`,
and `letterSpacing` each **default to a provided value** — `fontFamily =
provided("fontFamily", "sans-serif")` and its kin — so a bare run inherits its
region's style, and setting one on a container **provides** it to every `Text`
beneath. That is why restyling a region's text means setting those on the container:
the container provides the value, each run reads it. (A `View` carries none of them:
a container draws no glyphs, it only **provides** the value the runs beneath read.)
`fontWeight` takes the nine keywords (`thin` … `black`, plus `normal`/`bold`)
or a number 1–1000 — the same line, since the keywords are CSS's names for the
hundreds — so a variable font's `wght` axis is reachable at any point:
`fontWeight = 350`. `fontFamily` takes a family string, a `Font` object, or a list of
them — a list holding a font is written in a `{ }`: `fontFamily = { [app.brand,
"sans-serif"] }`.

```declare
View [ textColor = royalblue, fontSize = 15,
    Text [ text = "inherits the panel's style" ]
    ]
```

A `Text` is **one uniform run** — it cannot bold a single word. For inline emphasis
inside a label ("FEAT: **the rest bold**"), reach for `HTMLText`: it flows styled
runs in one wrapped line at label scale (`html = "FEAT: <b>the rest bold</b>"`),
and `textStyles` can carry a bigger, differently-faced, or gradient word. `Markdown` is the same machinery at
document scale.

## lineHeight
Leading, as a **multiplier of `fontSize`** — the same convention as
`RichText.lineHeight`: each line advances `round(fontSize × lineHeight)` pixels.
`0` (the default) keeps the font's natural line box, so a single-line label is
untouched. Wrapped height, `contentHeight`, and the `y = center` ink band all
follow the declared leading, on both backends and in the measurer alike —
`lineHeight = 1.5` on a wrapped paragraph is the measured-prose-density knob.

## text
The string to display. Literal, or a `{ }` constraint that recomputes as its
dependencies change — `text = { classroot.label }` re-renders the moment `label` does,
with no subscription to wire.

## wrap
Whether a width-bounded run wraps to multiple lines (default `true`). Set `wrap = false`
to force a single line that overflows instead. Wrapping is reactive: narrow the
bounding width and the run re-flows in the same frame. Pairs with `textAlign`.

## maxLines
A line limit (default `0`, no limit). The run keeps at most this many lines — wrapped
lines and hard newlines alike — and the last line kept ends in an ellipsis that fits
within the width. The height derive, `contentHeight` and every renderer honor it, so a
clamped preview measures exactly as tall as it draws.

## truncated
`true` when `maxLines` actually dropped something. Read-only and reactive — the fact a
"Show more" reads: `more: Text [ visible = { app.summary.truncated }, … ]`.

## textAlign
Horizontal alignment of wrapped lines within the run's width — `left` (default),
`center`, or `right`. Only meaningful once the run has a width to align within.

## italic
Renders the glyphs italic (default `false`) — the one slanted-style toggle, separate
from `fontWeight`.

## textFill
Fills the **glyphs** with a gradient (or solid `Fill`), like the box `fill` but for the
letters; overrides `textColor` when set. `textFill = { gradient("90deg", 0xFFFFFF, 0x88AAFF) }`.

## textShadow
A drop shadow on the glyphs — the same `shadow(dx, dy, blur, color)` value as the box
`shadow` slot, applied to the text instead of the box.

## outline
Strokes the glyph **edges** in `outline(width, color)` — outlined letters, **not** a box
around the run. The stroke rides *under* the fill, so a filled letter shows a thin ring
and a `textColor`-less one reads hollow. Per-`Text`, **not** a provided value — set it
here, or wear it through a `style` bundle / a `<span class>`. In a `[ ]` literal the color
is `#RRGGBB`; inside a `{ }` body it is `0xRRGGBB`.
```declare
App [ fill = #1E293B,
    Text [ x = 20, y = 20, fontSize = 28, textColor = white, fontWeight = bold, outline = outline(1, #C0392B), text = "ringed" ]
    ]
```

## textTransform
Reshapes the painted glyphs — `uppercase`, `lowercase`, `capitalize`, `none` — **without
changing `text`**: selection, find-in-page and `$data` see the original string, exactly
like CSS `text-transform`. The measurer shapes the transformed glyphs, so an `uppercase`
run still fits its width and wraps correctly on every renderer.

## smallCaps
Renders lowercase letters as small capitals — **synthesized from the current font**, not a
separate face, so it composes with any `fontFamily`/`fontWeight`. Measured with the caps,
so widths agree across DOM, canvas and native.

## numerals
The **shape** of the digits, when the face carries more than one set: `lining` sit on the
baseline at cap height (the modern default in most faces); `oldstyle` have ascenders and
descenders and sit in running prose like lowercase letters. `normal` — the default — is
whatever the face does by itself, which differs by face: Baskerville is lining, Hoefler
Text is oldstyle. A face with only one set ignores this, silently and correctly.

## numeralWidth
The **advance** of the digits: `tabular` gives every digit the same width, so figures line
up in a column and a counter does not jitter as it counts; `proportional` lets each digit
take its natural width, which reads better in prose. `normal` is the face's own default —
and both values are worth saying, because faces differ on which one that is (Helvetica is
tabular by default, the system font proportional).

## slashedZero
A slash through the zero, where the face has one — for serial numbers, codes and anywhere
`0` and `O` must not be confused.

## underline
A rule under the baseline. A **decoration**, drawn in the text colour and independent of
`textFill` — a gradient-filled word still underlines in its base colour. (Rich-text links
underline via `RichText.linkUnderline`; this is the plain per-`Text` slot.)

## strike
A rule through the x-height — a struck run. Same decoration contract as `underline`.


## ascent
The effective font's **ascent** above the baseline (the font bounding box — a property
of the font, not of this run's characters), in px at the effective size. Read-only and
**reactive**: it re-derives when the effective font changes, a provider
re-rooting above included. Measured from the rendering engine, never read from font
tables — the tables are unreachable for system fonts and carry three competing metric
sets; what you get is what this engine actually renders. `ascent + descent` is the
natural line box.

## descent
The effective font's **descent** below the baseline — `ascent`'s partner, same
measured-and-reactive contract.

## capHeight
The **capital ink band** above the baseline (probed from "H") — the band `y = center`
optically centers. Read-only, reactive, measured.

## xHeight
The **lowercase ink band** above the baseline (probed from "x"). Read-only, reactive,
measured.

## baseline
The y of the **first baseline** inside this view — the fact cross-font, cross-size
baseline alignment needs: `y = { title.y + title.baseline - this.baseline }` sits two
different runs on one line, no hand arithmetic. Both renderers place the first line's
baseline at the font ascent; a declared `lineHeight` changes the stride between lines,
never where the first baseline sits. Read-only, reactive.

## textColor
The colour of the glyphs. Like the rest of the face it defaults to the nearest
**provided** value, so a bare run inherits its region's colour and setting it on a
container recolours every run beneath. `textFill` takes a gradient where a flat colour
is not enough.

## fontSize
The size of the run, defaulting to the provided value. It is also the unit the
rest of the face is expressed against: `lineHeight` multiplies it, and a font's natural
line box is derived from it.

## fontFamily
The face this run renders in: a family string, a `Font` object, or a list of
them to fall back through. Defaults to the provided value, so a container's choice reaches
every run below. A list holding a `Font` is a value, so it is written in a `{ }`.

## fontWeight
The weight of the run — one of the nine keywords, or a number from 1 to 1000,
which is the same line since the keywords are the hundreds' names. A variable font's
weight axis is therefore reachable at any point. Defaults to the provided value.

## letterSpacing
Tracking, in the run's own units, added between characters. Negative
tightens. Defaults to the provided value, and it is part of what `measureText` must be
told about when measuring a run that should match this one.

## selectable
Whether this run's text can be selected by the reader. It is a **provided**
value as much as a slot: setting it on a container opts a whole subtree in, and a leaf
declares it so one run can opt back out. A caption you never want dragged over sets it
false; a code block sets it true on the container above it.
