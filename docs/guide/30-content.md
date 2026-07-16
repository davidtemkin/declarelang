# Content: text, Markdown, images

The content types are one family — what fills views. Declare keeps them explicitly distinct:
a `Text` is never *secretly* formatted, `Markdown` is the choice you make when you want
structure, and an `HTML` island is the deliberate escape when you need the platform.

## `Text` — one style, wraps within a bounded width

A `Text` renders a single run in one style, and the only behavior to reason about is when it
wraps, which follows one rule:

- `Text` with **no bounded width** → a single auto-sized run (labels, headings, chrome);
- `Text` with a **bounded width** (a literal or a `{ }` constraint) → it **wraps** within
  that width and auto-extends its height, unless you set one.

```declare
App [ fill = white, textColor = black,
    Text [ x = 24, y = 24, width = { parent.width - 48 },      // bounded → wraps and reflows on resize
        text = "A declarative language for real, dynamic web apps — reactive by construction." ],
    ]
```

The wrapping is reactive: change the width and the run re-wraps, the layout reflows. Two
companions cover the rest — `wrap = false` forces a single line (pair with `clip = true` to
truncate), and `textAlign = left | center | right`.

## `Markdown` — a native content type

Point `Markdown` at any string and it renders — full CommonMark + GFM, through Declare's own
`Text`/`View` components styled by a `prose` stylesheet, not an HTML blob:

```declare
App [ fill = white, textColor = black,
    Markdown [ x = 24, y = 24, width = 320,
        text = "## Forecast\n\n- **Hi** 72°\n- **Lo** 58°\n\nPartly *cloudy*." ],
    ]
```

You always write the same `Markdown [ text = … ]`, and the compiler routes it: a literal is
expanded to a subtree at build (zero runtime Markdown); a `:path` or `{ }` value is parsed
at render, reactively. That last case is the keystone — a Markdown value bound to a
**streaming** string re-renders live as the string grows, so a model's response formats
itself token by token, with no diffing code. (Raw HTML in the source renders as escaped
literal text — safe and predictable.)

## `TextInput` — a native field whose `text` you own

`TextInput` renders a real editable element, so caret, selection, clipboard, and IME are the
platform's. What Declare adds is the binding model, and how you connect `text` decides which
side is the source of truth:

```declare
App [ fill = white, textColor = black,
    zip: string = "94110",
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        seed: TextInput [ width = 220, height = 30, padding = 6, cornerRadius = 6, fill = gainsboro,
            initial = { app.zip } ],
        bound: TextInput [ width = 220, height = 30, padding = 6, cornerRadius = 6, fill = gainsboro,
            text = { app.zip } ],
        ],
    ]
```

- **`initial = { … }`** seeds the field once and then lets it own its text — the field is
  the source of truth; read `field.text` and publish edits with `onInput(v)`.
- **`text = { … }`** makes the field **controlled** — it always shows the bound value, and a
  divergent edit reverts. Reach for this when other state is authoritative.

Do not one-way-bind `text` *and* also expect the field to hold edits — a controlled field
reverts, by design. If the field should write back to a datum, that is two-way `<->`
([Data](declare-docs:guide:data)). `placeholder`, `multiline = true`, and `wrap = true`
round out the common surface; edits fire `onInput(v)` and single-line submit fires
`onEnter()`.

## `Image`

`Image` draws a bitmap from a `source` path, resolved relative to the program URL; `stretches`
controls fit:

```declare
App [ width = 160, height = 120, fill = white,
    logo: Image [ x = 20, y = 20, width = 120, height = 80, stretches = both,
        source = "resources/logo.png" ],
    ]
```

## `HTML` islands — the deliberate escape

When you need the platform's own content — a chart library, a map, arbitrary markup — an
`HTML [ … ]` island hands a view's box to host-managed DOM. It is a leaf as far as Declare's
layout is concerned, sized by constraints like any view, with the interior yours to fill.
The most powerful case is an **embedded child app**: a Declare program running inside another
program's island — no iframe — which is exactly how this documentation and the homepage run
their live, editable demos. Reach for an island deliberately; everything native to Declare
stays in the tree.

---

**Next:** the app meeting the world outside the tree — [The environment](declare-docs:guide:environment).
