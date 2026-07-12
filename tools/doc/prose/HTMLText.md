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
  html = "<h3>Notice</h3><p>Loaded content with <b>bold</b>, <i>italic</i>, and a <a href='#'>link</a>.</p>" ]
```

## html
The HTML source — a literal, or a `{ }` constraint that re-parses whenever it changes (a
fetched document, a live-edited field). Only `<a href>` and `<span class>` (see `accents`)
are read; every other attribute is ignored.

## accents
The one styling hook, and the only attribute read besides `href`: a map of **name → Fill**
that a `<span class="name">` in the HTML can reference to paint its glyphs — a gradient or a
solid — so an accent word can flow *inside* a sentence. The content only *names* a fill the
app defines; it never carries CSS itself, so this stays safe for loaded HTML (an unknown
class just renders as plain text). This is how one flowing string carries a gradient word:

```declare
HTMLText [ width = { parent.width }, scale = 1.6,
  accents = { { accent: gradient("90deg", 0x4C8DFF, 0x37E0C8) } },
  html = "<h2><span class='accent'>Declare</span> is the UI language for the AI era.</h2>" ]
```

Size follows the prose stylesheet (heading level × `scale`), not a `fontSize` — the accent
is about *which* run is painted, not how big it is.

## unsupported
What a tag **outside the whitelist** does — the reason this is safe for loaded content:

- `strip` (the default) — the unknown tag is **unwrapped**: it is dropped but its text is
  kept, so `<marquee>hi</marquee>` renders as `hi`. `<script>` / `<style>` are dropped whole
  (content and all).
- `error` — the first unsupported tag **throws**, naming it. Use this when unexpected markup
  should be a hard failure rather than silently pruned.

## lineHeight
Leading multiplier on the natural line height — `1` (the default) is tight, `1.5` airy.
Tune prose density without touching the font size.

## bodyColor
Overrides the built-in body-text colour (`null` = the default). Headings and inline code
keep their own tokens, so this dims **running text only** — the hierarchy stays crisp.

## onLink
An `<a href>` was activated — you get its `href`, and you decide what it means: scroll to an
anchor, set an in-app route, or open externally. The runtime only delivers the click. Left
unhandled, a link falls back to `app.navigate` (so external links work with no wiring);
declaring `onLink` overrides that. It stays a real `<a>` on the DOM, so modifier/middle
clicks open a new tab natively. Same on both backends.
