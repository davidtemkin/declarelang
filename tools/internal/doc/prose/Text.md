A run of text, sized by native browser metrics when you don't give it a width or
height — so a bare `Text [ text = "hi" ]` is exactly as wide and tall as its glyphs.
Its **style** is not on `Text`: `textColor`, `fontSize`, `fontFamily`, and
`fontWeight` are `prevailing` slots on `View`, so any ancestor provides them and this
run renders with the effective values. That is why restyling a region's text means
setting those on the container, not on each `Text`.

```declare
View [ textColor = royalblue, fontSize = 15,
    Text [ text = "inherits the panel's style" ]
    ]
```

A `Text` is **one uniform run** — it cannot bold a single word. For inline emphasis
inside a label ("FEAT: **the rest bold**"), reach for `HTMLText`: it flows styled
runs in one wrapped line at label scale (`html = "FEAT: <b>the rest bold</b>"`),
and `accents` can carry a gradient word. `Markdown` is the same machinery at
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


## ascent
The effective font's **ascent** above the baseline (the font bounding box — a property
of the font, not of this run's characters), in px at the effective size. Read-only and
**reactive**: it re-derives when the effective font changes, a prevailing provider
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
