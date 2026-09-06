Renders rich content authored — or **loaded** — as a small, whitelisted subset of **HTML**.
The sibling of `Markdown`: it parses the string at render time into the same stack of real,
wrapped, prose-styled **views** (identical on both backends), so paragraphs and headings get
native, contiguous text selection for free. Supported tags are the text-shaped ones —
`p`, `h1`–`h6`, `b`/`strong`, `i`/`em`, `code`, `s`/`del`, `a`, `br`, `ul`/`ol`/`li`,
`blockquote`, `pre`, `hr`, `span`, `div` — and nothing else.

This is **not** the `HTML[ ]` island (that mounts arbitrary host DOM you manage yourself):
`HTMLText` is *sanitized rich text*, with defined, safe behaviour on anything outside the
whitelist — so it is the right choice for content that arrives from data. `html = { post.body }`
re-parses and re-renders reactively.

```declare
HTMLText [ width = { parent.width },
    html = "<h3>Notice</h3><p>Loaded content with <b>bold</b>, <i>italic</i>, and a <a href='#'>link</a>.</p>"
    ]
```

## html
The HTML source — a literal, or a `{ }` constraint that re-parses whenever it changes (a
fetched document, a live-edited field). Only `<a href>` and `<span class>` (see `textStyles`)
are read; every other attribute is ignored.

## textStyles
The one styling hook, and the only attribute read besides `href`: a map of **name → a bundle
of Text's own style attributes** — `fontSize`, `fontFamily`, `fontWeight`, `italic`,
`textColor`, `textFill`, `letterSpacing` — that a `<span class="name">` in the HTML can
reference. The field names are exactly the ones you set on a `Text`; a named style is just a
`Text`'s worth of styling, applied to a run, so there is nothing new to learn. The content
only *names* a style the app defines; it never carries CSS itself, so this stays safe for
loaded HTML (an unknown class renders as plain text). One flowing string can carry a bigger,
differently-faced, gradient word, correctly baseline-aligned with the prose around it:

```declare
HTMLText [ width = { parent.width },
    textStyles = { { lead: { fontSize: 40, fontFamily: "Georgia", textFill: gradient("90deg", 0x4C8DFF, 0x37E0C8) } } },
    html = "The <span class='lead'>headline</span> word sits big and on the baseline."
    ]
```

The map is a `{ }` value, so it is written as an object — `fontSize: 40` (a colon, not
`=`), a color as `0x…`, a weight as `"black"`. A `<span class="lead">` then wears the whole
bundle.

A style may set any of those attributes. A `fontSize` larger than the surrounding text grows
that line's box while the run stays on the shared baseline — the line box is content-derived,
like CSS. (`accents`, the old fill-only version of this hook, folded in: a fill is now just
the `textFill` field, one attribute among many.)

## unsupported
What a tag **outside the whitelist** does — the reason this is safe for loaded content:

- `strip` (the default) — the unknown tag is **unwrapped**: it is dropped but its text is
  kept, so `<marquee>hi</marquee>` renders as `hi`. `<script>` / `<style>` are dropped whole
  (content and all).
- `error` — the first unsupported tag **throws**, naming it. Use this when unexpected markup
  should be a hard failure rather than silently pruned.

(`lineHeight`, `bodyColor`, and `onLink` — the shared prose styling and the link event — come
from the `RichText` base.)
