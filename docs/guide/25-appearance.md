# Appearance: drawing and theming

Everything about how a program looks is an **attribute** — no stylesheets, no selectors, no
cascade to reason about. And the colors that make up a design are named once, in one record,
that the whole tree reads from:

> **Styling is attributes; the palette lives once.**

## Drawing a view

A view's paint is a handful of attributes you set like any other:

```declare
App [ width = 260, height = 160, fill = whitesmoke,
    card: View [ x = 30, y = 30, width = 200, height = 100, cornerRadius = 12,
        fill = white,
        stroke = { stroke(1, 0xD6DCE2) },
        shadow = { shadow(0, 6, 18, 0x1A2A3833) },
        Text [ x = 20, y = 20, fontSize = 16, fontWeight = bold, text = "Drawing" ],
        Text [ x = 20, y = 48, textColor = slategray, opacity = 0.9,
            text = "fill · stroke · shadow · radius" ],
        ],
    ]
```

`fill` paints the box; `cornerRadius` rounds it; `opacity` fades it; `stroke` and `shadow`
take small constructor calls — `stroke(width, color)` and `shadow(dx, dy, blur, color)`.
There is no CSS `border` and no `box-shadow` string: **a border is a stroke** and a drop
shadow is a `shadow`. (`scale`, with `pivotX`/`pivotY`, and `visible` round out the set;
`visible = false` removes a view from paint and layout but keeps its instance.) Because
`stroke`/`shadow` values are `{ }` bodies, their colors are `0x…`, the plain-TypeScript
spelling from [Constraints](declare-docs:guide:constraints).

## Type

Text style is four attributes — `textColor`, `fontSize`, `fontFamily`, `fontWeight` (plus
`letterSpacing`). `fontFamily` is a fallback list, the first available face winning:
`fontFamily = ["Helvetica Neue", "sans-serif"]`. There is one text-color slot, `textColor`;
there is no separate `color`.

## Prevailing: set it once, high

Those type attributes are **prevailing** — an unset prevailing slot follows the nearest
ancestor that sets it, and keeps following live, until a descendant overrides it. Set them
once at a container and the whole region below follows:

```declare
App [ fill = white, fontFamily = ["Helvetica Neue", "sans-serif"], fontSize = 15, fontWeight = bold, textColor = black,
    topBar: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 6 ],
        Text [ text = "Rain or Shine?" ],
        Text [ text = "94110", textColor = royalblue ],   // overrides only the color
        ],
    ]
```

Neither `Text` repeats the family, size, or weight — they inherit the App's, and the second
overrides just `textColor`. This is what keeps a real UI free of style repetition, and why
**reskinning a subtree is one edit at its root**, not a sweep through every leaf.

## The `theme` record

`theme` is a prevailing record of design tokens. Provide it once and every descendant reads
tokens out of it inside `{ }` bodies — so the whole palette lives in one place:

```declare
class Heading extends Text [ fontWeight = bold, textColor = { theme.text } ]

App [ fill = { theme.surface }, theme = { ({ text: 0xE7EEF2, muted: 0x8A9BA6, accent: 0x4C8DFF, surface: 0x101E28 }) },
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 8 ],
        Heading [ text = "Signals" ],
        Text [ textColor = { theme.muted }, text = "muted subtitle" ],
        ],
    ]
```

The theme literal is `{ ({ … }) }` — a `{ }` body returning a TypeScript object, so its
colors are `0x…`. Two moves follow for free, both plain TypeScript:

```declare-fragment
theme = { { ...app.theme, accent: 0xE05252 } },              // partial override for a subtree
theme = { app.dark ? app.darkTheme() : app.lightTheme() },   // light/dark: swap the record
```

Because `theme` is prevailing, a subtree can provide its own to re-skin just that region,
and swapping the record on `app.dark` flips the whole app between light and dark in one
place. (Prevailing is not a framework privilege — a `prevailing accent: Color = …`
declaration lets any class of your own inherit down the same way.)

## There is no CSS

Now the relief: no selectors, no cascade, no specificity wars, no `!important`, no media
queries. A view's look is the attributes on it; what should flow down is a prevailing slot;
the palette is one record. Responsiveness is constraints on `app.width`
([Space](declare-docs:guide:space)), not breakpoints. The whole surface is the language
you have already been reading.

---

**Next:** where a view gets its size, and how its children get their places —
[Space](declare-docs:guide:space).
