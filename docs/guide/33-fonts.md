# Fonts

A font in Declare is a small container: a **`font`** names a family and owns its
**`Face`** children, and text picks a face *at the point of use* from the prevailing
weight and italic. `fontFamily` is an ordered fallback list, not a single name. If
you know CSS's `@font-face` / `font-family` split, this is that same shape in a
container form — one a family owns its faces — the model OpenLaszlo, Android, and
Flutter all share.

## Declaring a font

```declare
font Chrome [ family = "Tahoma" ]                  // system font: a family, no faces
font Body   [ family = "Helvetica" ]

font Title [                                        // web font: pinned faces
    Face [ src = "resources/fonts/work-sans-700.woff2", weight = bold ],
    Face [ src = "resources/fonts/work-sans-italic.woff2", italic = true ],
    ]
```

The two kinds fall out of one rule: **no `Face` children → a system font**. A
`family` string names an installed family and needs no faces; add faces and you are
pinning downloadable files instead. `family` defaults to the declaration name, so a
web font rarely writes it — you set `family` precisely to *name a system font*
(`font Chrome [ family = "Tahoma" ]`).

A `Face` carries the file and which slot it fills:

- **`src`** is a URL string (or `url("…")`), `local("Name")` for an installed face,
  or a list — `[local("Work Sans"), "…/work-sans.woff2"]` — meaning prefer the
  installed copy, else download.
- **`weight`** is one of `thin` … `black` (default `regular`), and **`italic =
  true`** marks the italic face.

A font must carry either a `family` or at least one `Face`. (See the [`font`
reference] and [fonts.md](../../design/fonts.md).)

## Using a font

You do not attach a font to text directly; you set **`fontFamily`**, an ordered
**fallback list**, and the weight/italic in effect select the actual face at the use
site. And because `fontFamily`, `fontWeight`, and the rest are **prevailing**
([Prevailing](22-prevailing.md)), you set them on a container and the whole region
below inherits until something overrides:

```declare
App [ fontFamily = [Chrome, "Geneva", "sans-serif"], fontSize = 9, fontWeight = bold,
    topBar: View [ fontFamily = Title, fontWeight = bold, fontSize = 10,
        title: Text [ text = "Rain or Shine?" ],       // renders in Title bold — inherited
        ],
    Text [ text = "12°", fontWeight = bold ],           // picks Chrome's bold at this use site
    ]
```

Each entry in the list is either a declared font **name** (resolved to its `family`)
or a raw string like `"sans-serif"`; a single name or string needs no brackets
(`fontFamily = Title`). End the list with a generic (`"sans-serif"`) so there is
always a floor. Two properties are worth holding onto:

- An **undeclared name is a compile error** — the list catches typos, where CSS
  would silently fall through — while raw strings pass through untouched.
- Web faces load **before first paint**, so text measures against its real metrics
  from the start; there is no fallback-then-reflow flash.

One boundary: semantic type **roles** — a `heading` or `body` that bundles family,
size, and weight together — are the stylesheet's job, not the font primitive's. A
`font` names a family and its faces; composing those into named roles belongs a layer
up.

---

**Next:** entering text and moving focus — [Input & focus](34-input-focus.md).
