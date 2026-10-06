# Text and themes
<!-- index: theme tokens, dark mode, fonts, rich text, named styles -->

**Use when** setting type, colour and look: fonts, rich text, a palette, dark mode.

```declare
theme Brand [ accent = #CC3333, surface = #FFF7F5, text = #2B1D1B, muted = #9A7F7B ]
theme BrandDark [ accent = #FF7A6B, surface = #1A1413, text = #F3E9E7, muted = #A8938F ]

style Warm [ textColor = #CC3333, fontWeight = bold ]

class Heading extends Text [ fontSize = 18, fontWeight = bold, textColor = { provided("theme").text } ]

App [ width = 380, height = 240, textStyles = { { Warm } },
    theme = { app.dark ? BrandDark : Brand },          // app.dark follows the OS
    fill = { provided("theme").surface },
    fontFamily = { ["-apple-system", "Helvetica Neue", app.inter, "sans-serif"] },
    inter: Font [ FontFace [ src = "fonts/inter.woff2", weight = range(100, 900) ] ],
    col: View [ x = 20, y = 20, width = 340,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        Heading [ text = "Tokens, not hex" ],
        Text [ width = 100%, textColor = { provided("theme").muted },
            text = "A repeated colour is a theme token, read where it's used." ],
        Markdown [ width = 100%, text = "Rich text is **structure**, with <span class='Warm'>styled runs</span>." ]
        ]
    ]
```

**Rules**
- A colour, size or font list that appears twice is a **token** in a `theme`, read with
  `provided("theme").x` (or `theme.x` inside a `Control`). Hex literals repeated in views
  and `script` constants can't be re-skinned or darkened.
- With library controls, start from a preset (`SanFrancisco`, `Cupertino`,
  `MountainView`, `Redmond`, each with a `…Dark`) and change what you need:
  `{ { ...provided("theme"), accent: 0xCC3333 } }`.
- Dark mode is opt-in: `theme = { app.dark ? BrandDark : Brand }` follows the OS.
- A font is an object (`Font [ FontFace [ src ] ]`); `fontFamily` is a list tried in order,
  written in `{ }` when it holds a font. Put the platform face first: a web font loads
  only when text reaches it.
- Inside `{ }` a colour is a number (`0x336699`); `#336699` and names like `navy` are
  bare values only.
- Structured text (headings, lists, links) is `Markdown` or `HTMLText`, not a pile of
  `Text` views. A styled run is a `style` bundle named by `<span class>`, registered in
  `textStyles`. Links call `onLink(href)`.
- A repeated whole-view look is a class (`class Heading extends Text [ … ]`).
- A token can be a list (`inks = [#A8445E, #3F6E8C]`, read `provided("theme").inks[i]`); a
  `script` function takes the theme typed as `Theme`.
- Wrapped text as wide as its longest line (a caption, a label in a box):
  `width = { Math.ceil(measureText(words, providedTextStyle(), 320).width) }`.

**Look up** `theme` (and the *Theme tokens* page), `provided`, `App.dark`, `Font`,
`FontFace`, `Text.fontFamily`, `Markdown`, `HTMLText`, `RichText.textStyles`,
`measureText`, `providedTextStyle`.

**Examples** `apps/swatchbook/swatchbook.declare`: presets, `style` bundles, every text
treatment · `apps/weather/weather.declare`: a system face with a web fallback ·
`apps/docs/docs.declare`: `theme` records for light and dark.

**Guide** Paint and themes · Text and fonts.
