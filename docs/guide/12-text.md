<!-- nav: Text and fonts -->
<!-- part: Building -->

# Text and fonts

Text comes in two kinds. A [`Text`](declare-docs:Text) is one run in one style — a label, a heading, a number.
[`Markdown`](declare-docs:Markdown) and [`HTMLText`](declare-docs:HTMLText) are flowing, structured prose — headings, paragraphs, lists,
links — parsed from a string. Both read the text face their container provides
([Paint and themes](declare-docs:guide:paint-and-themes@provided-values-set-once-read-below)), and both render identically
on every renderer.

> **A `Text` is one run. Structured prose is rich text. A look reused across views is a
> class; a look for words inside prose is a named style.**

## A run of text

A `Text` with no size is exactly as wide and tall as its glyphs. Give it a width and it
wraps (`wrap = true` is the default), aligned by [`textAlign`](declare-docs:Text.textAlign). [`maxLines`](declare-docs:Text.maxLines) limits it and
ends the last line with an ellipsis, and the read-only [`truncated`](declare-docs:Text.truncated) says whether anything
was cut — what a "Show more" link reads. [`lineHeight`](declare-docs:Text.lineHeight) sets leading as a multiple of the
font size. `selectable = true` lets the reader select it; set on a container, it applies
to everything below.

A `Text` cannot bold one word; that is what rich text is for (below).

**Labels in controls: [`TextLabel`](declare-docs:TextLabel).** `y = center` centers a view's box, and for a `Text`
that is the box of the font, whose leading is uneven — the words look a hair low. A
label inside a button, chip or row wants its *letters* centered instead. That is what
the library's `TextLabel` is: a `Text` whose `y` centers its capital letters in its
parent's height. Use `TextLabel` inside controls and rows; use `Text` for flowing copy
and inside layouts that place `y` themselves.

## Treatments

Beyond color and size, each run can carry per-run paint, set on the `Text` itself:

- [`textFill`](declare-docs:Text.textFill) fills the glyphs with a gradient (or a color), overriding [`textColor`](declare-docs:Text.textColor).
- [`textShadow`](declare-docs:Text.textShadow) drops a [`shadow(dx, dy, blur, color)`](declare-docs:type:Shadow) under the letters.
- [`outline`](declare-docs:Text.outline) strokes the glyph edges with `outline(width, color)` — outlined letters, not a
  box.
- [`italic`](declare-docs:Text.italic), [`underline`](declare-docs:Text.underline), [`strike`](declare-docs:Text.strike).
- [`smallCaps`](declare-docs:Text.smallCaps), and [`textTransform`](declare-docs:Text.textTransform) (`uppercase`, `lowercase`, `capitalize`), which change
  what is drawn without changing the string, so selection and find-in-page still see what
  you wrote.
- [`numerals`](declare-docs:Text.numerals) (`lining`, `oldstyle`) and [`numeralWidth`](declare-docs:Text.numeralWidth) (`tabular`, `proportional`) choose
  the figures a font offers — `tabular` keeps a counting number from jittering.

```declare
App [ width = 320, height = 84, fill = #0B141B,
    Text [ x = 20, y = 24, fontSize = 26, textColor = white, fontWeight = bold,
        outline = outline(1, #C0392B), text = "OUTLINED" ]
    ]
```

Unlike the text face, treatments are not provided down the tree: they live on the run.

## Fonts are objects

A typeface is an object in the tree, like an [`Image`](declare-docs:Image). Create it where it belongs —
usually on the App, so it lives as long as the program — and use it wherever a font
family goes:

```declare-fragment
App [ fontFamily = { [brand, "Helvetica", "sans-serif"] },
    brand: Font [
        Face [ src = "brand-400.woff2" ],
        Face [ src = "brand-700.woff2", weight = bold ],
        Face [ src = "brand-400i.woff2", italic = true ]
        ],
    serif: Font [ Face [ src = "serif-var.woff2", weight = range(200, 900) ] ],
    ui: Font [ family = "Helvetica Neue" ]
    ]
```

A [`Font`](declare-docs:Font) owns its [`Face`](declare-docs:Face) children, one file each. [`src`](declare-docs:Face.src) is a URL, an installed face
(`local("Work Sans")`), or a list tried in order; `weight` is a name, a number from 1 to
1000, or `range(lo, hi)` for a variable font. A `Font` with no faces is a **system
font**: it names a [`family`](declare-docs:Font.family) the machine already has, and there is nothing to load.
[`fontFamily`](declare-docs:Text.fontFamily) takes a font, a family string, or a list tried in order; a list that holds a
font object is written in `{ }`.

Because a font is a value, switching fonts is an assignment:

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

**While a font loads,** the font decides what waiting is worth. [`wait`](declare-docs:Font.wait) (milliseconds,
default 500) is how long text about to change to this font keeps its current look — at
startup, how long the first paint waits. [`late`](declare-docs:Font.late) decides what a face arriving after that
does: `swap` (the default) changes to it once; `keep` leaves the fallback for the rest of
the run. A font reports `loaded` and `failed` as facts, for the rare design that depends
on them. A font inside a view unloads its faces when the view goes away.

> **From CSS:** no `@font-face` rules, no `document.fonts.ready`, no loading classes.
> `wait` and `late` cover what `font-display` does, with a time you choose.

## Rich text: Markdown and HTMLText

Once content has structure — headings, paragraphs, lists, code, links — use rich text.
`Markdown` and `HTMLText` parse their source into the same flowing, wrapped views; they
differ only in the format they read.

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

A document can be your app's material directly: fetch a `.md` file with
[`DataSource [ url = "notes.md", format = "text" ]`](declare-docs:DataSource) and bind its value to `text`
([Data](declare-docs:guide:data@where-data-comes-from)). `text` is an ordinary attribute, so Markdown streaming
in piece by piece renders as it arrives.

The body follows the provided text face; headings, links and code have their own tokens
([`headingColor`](declare-docs:RichText.headingColor), [`headingWeight`](declare-docs:RichText.headingWeight), [`linkColor`](declare-docs:RichText.linkColor), [`codeColor`](declare-docs:RichText.codeColor), [`codeFamily`](declare-docs:RichText.codeFamily)), and
`lineHeight`, [`bodyColor`](declare-docs:RichText.bodyColor), [`fontScale`](declare-docs:RichText.fontScale) (a reader-facing type zoom) and [`richTextLayout`](declare-docs:RichText.richTextLayout) (a
comfortable line length per block type) tune the flow.

**Links are raised, not followed.** A link in rich text calls `onLink(href)`, because
whether it scrolls, changes the app's location or leaves the site is the app's decision.
Left unhandled, it navigates:

```declare-fragment
doc: Markdown [ text = { app.article.value || "" },
    onLink(href: string) {
        if (href.startsWith("#")) app.location = href.slice(1)
        else app.navigate(href)
        }
    ]
```

`HTMLText` reads HTML against a fixed list of text tags. [`unsupported`](declare-docs:HTMLText.unsupported) decides what
anything else does: `"strip"` (the default) keeps the text and drops the tag; `"error"`
throws. So loaded content is never silently mangled, and never runs.

## Reusing a look: a class, or a named style

For a whole **view**, a reusable look is a subclass — the language you already have:

```declare-fragment
class Hero extends Text [ fontSize = 40, textFill = { gradient("90deg", 0x4C8DFF, 0x37E0C8) } ]
```

For words **inside prose**, there is no view to subclass. A top-level `style` declaration
names the look, and a `<span class='Name'>` in the content wears it:

```declare
class Hero extends Text [ fontSize = 40, textFill = { gradient("90deg", 0x4C8DFF, 0x37E0C8) } ]
style Keyword [ textColor = #C678DD, fontWeight = bold ]

App [ width = 380, height = 130, fill = white,
    Hero [ x = 20, y = 16, text = "Big, gradient-filled" ],
    HTMLText [ x = 20, y = 84, fontSize = 15, bodyColor = 0x33424E,
        html = "<span class='Keyword'>class</span> Board [ ]" ]
    ]
```

A `style` holds literal values only — it has no place in the tree, so nothing in it can
depend on where it is used. A look that should follow the theme — or a size that follows
the layout — is written where it is
used, as a [`textStyles`](declare-docs:RichText.textStyles) map on the rich text, built in a `{ }`:

```declare-fragment
HTMLText [ html = "<span class='Keyword'>class</span> Board [ ]",
    textStyles = { { Keyword: { ...Keyword, textColor: provided("theme").accent } } } ]
```

`textStyles` is provided like the text face, so a palette set high reaches every rich
text below.

**A run is one thing.** A number and its unit, a word and its punctuation, are one run of
text, set together — the font spaces each pair of letters correctly. `"1h 24m"` is one
`Text`. When the parts want different sizes — a large figure with small unit letters —
it is still one run, with the sizes as a named style on a span:

```declare-fragment
style Unit [ fontSize = 40, fontWeight = medium ]

HTMLText [ fontSize = 96, fontWeight = bold,
    html = "1<span class='Unit'>h</span> 24<span class='Unit'>m</span>" ]
```

Separate views are for things that are separate: a figure beside the caption that names
it.

## Views inside a sentence

Prose sometimes carries small pieces of interface — a status chip, an avatar, a keycap.
Inside rich text, **a self-closing tag naming one of your own view classes builds one
real view of that class**, placed in the line as a box the words wrap around:

```declare
class Chip extends View [
    label: string = "",
    height = 19, width = { this.t.width + 18 }, cornerRadius = 9, fill = #DDF4E4,
    t: TextLabel [ x = 9, fontSize = 12, textColor = #1A5B2E, text = { classroot.label } ]
    ]

App [ width = 380, height = 96, fill = white,
    HTMLText [ x = 20, y = 20, width = 340, fontSize = 15, bodyColor = 0x33424E,
        html = "Filed under <Chip label='docs'/> and <Chip label='runtime'/> this morning." ]
    ]
```

Both formats read these tags. The tag's attributes are the class's attributes, converted
by each attribute's declared type (`count='3'` is a number in a `number` attribute); the
flow places the view, so `x` and `y` are refused. The view is real — it has state,
handlers and motion — and when the content changes, a tag still present keeps its view.
Markup carries no expressions: build the content string in a `{ }`, wrap every
interpolated value in `escapeHtml`, or put an identity in the tag and let the class derive
the rest. A class named only from a computed string needs `use [ Chip ]` to survive a
production build. The [`RichText`](declare-docs:RichText) reference entry has the complete rules.

---

**What you can now do:** set runs of text and labels, load and switch fonts, render
structured prose from a string or a file, reuse a look as a class or a named style, and
put real views in the middle of a sentence.

[Next: **Images, video and audio** →](declare-docs:guide:media)
