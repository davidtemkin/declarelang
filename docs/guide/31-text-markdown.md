# Text and Markdown

Declare draws text with two primitives and keeps them explicitly distinct: `Text` is
a plain string in one style; `Markdown` is rich, structured content. The line
between them is deliberate — `Text` is never *secretly* formatted, and `Markdown` is
the choice you make on purpose when you want structure. No component guesses which
you meant.

## `Text` — one style, wraps within a bounded width

A `Text` renders a single run in one style, and the only behaviour you have to reason
about is when it wraps — which follows one rule, no new attribute for the common
case:

- `Text` with **no bounded width** → a single, auto-sized run (labels, headings,
  most UI chrome).
- `Text` with a **bounded width** — a literal or a `{ }` constraint — → it **wraps**
  within that width, and its height **auto-extends** to the wrapped lines unless you
  set one.

```declare
Text [ x = 24, y = 24, width = { parent.width - 48 },      // bounded → wraps and reflows on resize
       text = "A declarative language for real, dynamic web apps — reactive by construction." ]
```

The wrapping is itself **reactive**. When the width changes — because the container
or the viewport resized — the run re-wraps and the surrounding layout reflows. It is
a standing relationship, not a one-time measure, so a paragraph in a resizable panel
just works. Two companions cover the rest: `wrap = false` forces a single line (pair
it with `clip = true` to truncate cleanly), and `textAlign = left | center | right`.
(The full surface — `textFill` gradients, `textShadow`, `italic`, `selectable` — is
in the [`Text` reference].)

## `Markdown` — a native, full-featured content type

Point `Markdown` at any string and it renders — **without your having to think about
which subset is supported**. It is full CommonMark + GFM: headings, lists, tables,
code, blockquotes, strikethrough, autolinks, and the complete inline set. Crucially,
it renders *through Declare's own* `Text` / `View` / stack / grid components, styled
by a default `prose` stylesheet — not an HTML blob dropped into the page.

```declare
Markdown [ x = 24, y = 24, width = 320,
           text = "## Forecast\n\n- **Hi** 72°\n- **Lo** 58°\n\nPartly *cloudy*." ]
```

The one deliberate deviation from a browser: raw HTML in the source renders as
**escaped literal text** (safe and predictable), though character entities like
`&copy;` still decode. Prose colour and leading tune with `bodyColor` and
`lineHeight` when you want a denser or airier body. (See the [`Markdown` reference]
and [text-and-markdown.md](../../design/text-and-markdown.md).)

## Static vs. dynamic — the compiler routes it

You always write the same thing — `Markdown [ text = … ]` — and the compiler routes
literal versus computed automatically, exactly the way a `:path` routes with or
without a schema:

```declare
Markdown [ text = "## Literal" ]        // literal → expanded to a subtree at build; zero runtime MD
Markdown [ text = :article.body ]       // from data → parsed at render, reactively
Markdown [ text = { chat.reply } ]      // a reactive string → re-renders as the value changes
```

The reactive dynamic path is the keystone. Because `text` is an ordinary constraint,
a Markdown value bound to a **streaming string** re-renders live as the string grows
— a model's response formats itself token by token, for free, with no diffing code
and no manual parse. That is the content-layer expression of a language built for
apps whose text arrives at runtime rather than at build.

---

**Next:** how a view decides its own size — [Sizing & the host](32-sizing.md).
