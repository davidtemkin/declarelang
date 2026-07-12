A run of text, sized by native browser metrics when you don't give it a width or
height — so a bare `Text [ text = "hi" ]` is exactly as wide and tall as its glyphs.
Its **style** is not on `Text`: `textColor`, `fontSize`, `fontFamily`, and
`fontWeight` are `prevailing` slots on `View`, so any ancestor provides them and this
run renders with the effective values. That is why restyling a region's text means
setting those on the container, not on each `Text`.

```declare
View [ textColor = #CAD0EC, fontSize = 14,
  Text [ text = "inherits the panel's style" ]
]
```

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

## selectable
Opt this run back into native text selection / copy (default `false`). Off by default
so an app doesn't feel like a document; turn it on for content a user should be able to
select and copy.
