The abstract family of **flowing, structured, styled text** — the shared base of `Markdown`
and `HTMLText`. You never write `RichText [ ]` directly (like `Layout`, it names no format);
you write one of its two concrete formats, which differ *only* in how they parse their
source. Everything else — how it flows, wraps, stacks, and styles — lives here.

**Its width is the line length.** A width you set, or a layout assigns, is where lines wrap.
With neither, the text wraps at a 640 px reading measure and the box then takes the width of
the widest line laid out — a short line of rich text is as wide as its words, as a `Text` is.
A document holding a list, table, quote or code keeps the full measure.

**Styling follows the ordinary text properties.** A rich-text block's **body** reads the same
face values a `Text` does — `fontSize`, `fontWeight`, `textColor`, `letterSpacing`,
`lineHeight` — each a **provided value**, so prose takes the ambient face like any other run:
set `fontWeight = semibold` on a container and the prose body below is semibold (the container
provides it, the block reads it). Its **structure** (headings, code, links, list spacing)
comes from a built-in house style that looks right with zero config, coloured by the text's
ink and the provided theme — so a document follows the app's light or dark theme on its own;
the parts you commonly re-theme are their own provided values —
`headingColor`, `headingWeight`, `linkColor`, `codeColor` — each defaulting to the nearest
provided value, exactly like `fontSize`.

**Content may name your own view classes — an inline view.** A self-closing tag whose name is
a view class the program declares (`<Chip label='docs'/>`) is **one real view of that class**,
placed in the flowing line as an atomic box the words wrap around — not a styled run. Nothing
declares the capability: the class existing is what makes the tag mean it, matched by the name
exactly as written, and a tag naming no class of yours keeps the meaning it already had. The
tag's attributes are the class's, converted from their strings by each slot's **declared** type
(`id='142'` is the number in a `number` slot, `width='50%'` a percent of the width the text
flows in) — **the tag is the use site**, so an attribute beats what the class body sets for
that slot, a `{ }` constraint included, and only the winner installs; a slot the tag does not
mention keeps the class's own behaviour. `x`/`y` are refused, because the flow places the
view as a layout places its children; an unknown attribute, a value that will not convert, a
read-only slot, or a percent with no axis to resolve against goes to `unsupported` — nothing
a tag says is quietly ignored. The view owns its `width`/`height` and the flow owns its `x`/`y` (real
values, readable); it never splits across a line, sits on the line by the first baseline inside
it — or by its bottom edge when nothing in it claims one — grows the line
when it is taller, re-flows the text when its size changes, and reads the surrounding run's
face as provided values. Content is reactive, and a tag still present **keeps its view** — its hover,
its focus, a running spring — with only changed attributes rewritten and a dropped attribute
handing that slot back to the class (a tag that gains or loses one is built again, since what
the tag claims is settled at build); `key='…'` is the identity (never passed to the class), else the
class name plus that tag's ordinal. **Only view classes, only self-closing tags**, and no
expression inside markup: build content in a `{ }` and `escapeHtml` every interpolated value.
A `<span class>` stays a style and is never a view. The guide's Style chapter ("Views in a
sentence") teaches the whole of it.

```declare
class Chip extends View [ label: string = "",
    height = 19, width = { this.t.width + 18 }, cornerRadius = 9,
    fill = 0xDDF4E4,
    t: TextLabel [ x = 9, fontSize = 11.5, text = { classroot.label } ]
    ]

App [ width = 430, height = 96,
    HTMLText [ x = 16, y = 16, width = 398, fontSize = 15,
        html = "Filed under <Chip label='docs'/> and <Chip label='runtime'/> — each one a real view, sitting on the line's baseline." ]
    ]
```

## textStyles
The **named-style palette**: a map of name → a bundle of `Text`'s own style attributes —
`fontSize`, `fontFamily`, `fontWeight`, `textColor`, `textFill`, `letterSpacing`, and the
treatments (`italic`, `textShadow`, `outline`, `smallCaps`, `textTransform`, `underline`,
`strike`) — that a `<span class="name">` in the content references. The field names are
exactly the ones you set on a `Text`, so there is nothing new to learn, and the keys are
yours: content names a style the app defines and never carries CSS itself, so this stays safe
for loaded HTML (an unknown class renders as plain text).

**It is inherited**, like the rest of the text face: set it on a container and every rich text
below takes it, until a nearer one overrides. So a palette lives in one place.

```declare
style Keyword  [ textColor = #C678DD, fontWeight = bold ]
style TypeName [ textColor = #2E6FE0 ]

App [ width = 400, height = 90, textStyles = { { Keyword, TypeName } },   // the whole app's palette, once
    doc: Markdown [ width = { parent.width },
        text = "A <span class='Keyword'>class</span> declares a <span class='TypeName'>View</span>." ]
    ]
```

That `{ { Keyword, TypeName } }` is the shorthand: a top-level `style` declaration is a
value, and `{ Keyword }` means `{ Keyword: Keyword }`, so a bundle drops into the map under
its own name. Declare palettes with `style` — attribute syntax, and every field checked
against `Text` — and compose them here.

A top-level `style` is also worn **by its own name with no palette at all**: `style brand [ … ]`
and `<span class='brand'>` is the whole arrangement, program-wide. A `<span class>` resolves
the nearest `textStyles` entry first, then the top-level bundle of that name, else renders as
plain text. So the palette is for what a bare bundle cannot be — a style computed from where
it is used, a one-off written inline, or a local name that shadows the program's.

The map is also an ordinary `{ }` value, so it can be written inline for a one-off, or
computed. Written inline it is an object: `fontSize: 40` (a colon, not `=`), a color as
`0x…`, a weight as `"black"`. The value side is typed, so a misspelled field is refused here
exactly as it is in a bundle.

```declare
HTMLText [ width = { parent.width },
    textStyles = { { lead: { fontSize: 40, fontFamily: "Georgia", textFill: gradient("90deg", 0x4C8DFF, 0x37E0C8) } } },
    html = "The <span class='lead'>headline</span> word sits big and on the baseline."
    ]
```

A style that depends on where it is used is built where that context exists — in this `{ }`,
or in a palette an ancestor provides — because a top-level `style` bundle holds literals
only: it has no place in the tree, so nothing in it could read one.

A style may set any of those attributes. A `fontSize` larger than the surrounding text grows
that line's box while the run stays on the shared baseline — the line box is content-derived,
like CSS. A fill is simply the `textFill` field, one attribute among many, not a special case.

## lineHeight
Leading multiplier on the natural line height — `1` (the default) is tight, `1.5` airy.
Tune prose density without touching the font size.

## maxLines
A line limit over the **whole document** (default `0`, no limit), counted in order:
headings, paragraphs, list items, table rows and code lines all spend it, and a list's
bullets spend nothing. A block that starts after the limit is not shown at all. An
ellipsis marks a line that was cut short, so when the limit falls exactly between two
blocks no ellipsis appears — read `truncated` to show that more exists. A width change
re-spends the budget from the top.

## truncated
`true` when `maxLines` dropped something. Read-only and reactive.

## bodyColor
Overrides the running-text color (`null` = `textColor`). Headings and inline code keep their
own colours, so this dims **body text only** — the hierarchy stays crisp. (Body
weight/size/tracking come from the ambient `fontWeight`/`fontSize`/`letterSpacing`.)

## baseline
The y of the **first line's baseline** in this box — what a baseline-aligning layout
(`align = baseline` on a `SimpleLayout` row or a `WrappingLayout`) sits a `Markdown` or
`HTMLText` on. The flow **claims** it: the first block's first line, when the document
opens with prose (a paragraph or heading), by the same strut-and-growth arithmetic the
canvas flow paints by — so the DOM and canvas renderers agree by construction. `null` when
the document opens with a table, a list, a code fence or a rule: then it declares none,
and a baseline row refuses it by name (placing it at the line's start). Read-only,
reactive — re-claimed on every rebuild and re-width.

## onLink
A link (`[text](url)` in Markdown, `<a href>` in HTMLText) was activated — you get its `href`,
and you decide what it means: scroll to an anchor, set an in-app route, or open externally. The
runtime only delivers the click. Left unhandled, a link falls back to `app.navigate` (so
external links work with no wiring); declaring `onLink` overrides that. Modifier/middle clicks
still open a new tab natively. Same on every renderer.

## textColor
The ink of the running text and of the headings, defaulting to the provided value — so prose
takes its region's ink like any other text — and, where nothing provides one, to the theme's
`text` token, so a document reads on a light or a dark theme alike. Links, code, quotes and rules take the provided
theme's tokens instead, and each part has its own slot below. `bodyColor` overrides the
running text alone when the flow should differ from what it provides onward.

## fontScale
A multiplier on every type size in the flow — the body, the headings, the code
— for a reader-facing zoom. It changes the TYPE, not the box: the sizes are
scaled into the runs, so the flow re-wraps at its new size and the view's
measured height is what it paints.

This is deliberately not `scale`. A view's `scale` is a transform, honoured
alike by paint, the hit walk, `rootTransform` and auto-extent; a flow set 10%
smaller is not a transformed view, and saying so would put a box on screen that
does not match the one every reader of the geometry measures. A rich text that
really is transformed sets `scale`, like any view.

```declare-fragment
Markdown [ fontScale = { app.readerZoom }, text = { app.doc } ]
```

## fontSize
The body size for the flow, defaulting to the provided value. The house
structure sizes — headings, code — are derived from it and scaled by
`fontScale`.

## fontFamily
The face the prose renders in — a family string, a `Font`, or a list of them
— defaulting to the provided value. Code spans and fences take `codeFamily` instead.

## fontWeight
The body weight for the flow, defaulting to the provided value. Headings take
`headingWeight`.

## letterSpacing
Tracking for the flow's running text, defaulting to the provided value.

## headingColor
The colour of headings, at every level. `null`, the default, is `textColor`: headings are set
apart by size and weight, and take the prose's ink.

## headingWeight
The weight headings render at — the nine keywords or a number, as anywhere
else. Unset, headings take the house weight, which is heavier than the body. Set it when a
brand face needs a different level of emphasis than the default picks.

## linkColor
The colour of links in the prose. `null` is the theme's accent, which is the
answer you want almost always: a link that follows the theme needs no line here.

## linkUnderline
Whether links are underlined. The house default underlines them, because a
link distinguished by colour alone is invisible to a reader who cannot see the colour. Turn
it off only when something else in the design carries that job.

## codeColor
The ink of inline code and fenced blocks. `null` is the provided theme's `code` token when the
theme names one, else `textColor` — the monospace face sets code apart.

## codeSize
The size of code, in the flow's own units. Unset, code takes a size derived from
the body — slightly smaller, since a monospace face at the body's size reads larger than
the prose around it.

## codeFamily
The face code renders in — the one place a flow does **not** follow
`fontFamily`, because prose and code want different faces. Unset, it is the house monospace
stack.

## codeBackground
The fill behind a fenced block (and a highlighted `<pre>`). `null` is the provided theme's
`codeBg` token when the theme names one, else its neutral `control` tint.

## codeRule
The colour of the rule down the left of a fenced block. `null` is the house
tone; unset it to nothing and a fence keeps its box without the bar.

## richTextLayout
**The per-block-type measure**: block name → that block's geometry, as a
`RichTextLayout`. A reading measure with full-bleed code is two entries — the `default`
entry caps every block, and `code` opts out with a zero (meaning the full track):

```declare-fragment
richTextLayout = { { default: { maxWidth: 560 }, code: { maxWidth: 0 } } }
```

Each entry may also set a `[left, right]` `margin` and an `align`, and what a block does
not state it takes from `default`, field by field. A `pre` with no entry of its own follows
`code`. This is how a document gets a comfortable line length without its code samples and
images being narrowed to match.
