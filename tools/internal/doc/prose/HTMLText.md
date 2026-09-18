Renders rich content authored — or **loaded** — as a small, whitelisted subset of **HTML**.
The sibling of `Markdown`: it parses the string at render time into the same stack of real,
wrapped, prose-styled **views** (identical on both backends), so paragraphs and headings get
native, contiguous text selection for free. Supported tags are the text-shaped ones —
`p`, `h1`–`h6`, `b`/`strong`, `i`/`em`, `code`, `s`/`del`, `a`, `br`, `ul`/`ol`/`li`,
`blockquote`, `pre`, `hr`, `span`, `div` — and nothing else.

This is **not** a `DOMIsland` (that mounts arbitrary host DOM you manage yourself):
`HTMLText` is *sanitized rich text*, with defined, safe behaviour on anything outside the
whitelist — so it is the right choice for content that arrives from data. `html = { post.body }`
re-parses and re-renders reactively.

**Your own view classes are tags here too.** Alongside the whitelist, a self-closing tag naming
a view class the program declares is one real **inline view** of that class, flowed in the line
as a box the words wrap around (the family's `RichText` entry states the whole of it). A name is
resolved against your classes first and the whitelist second, so a class named exactly like a
supported tag takes that tag over inside content — the compiler warns when one does. Unlike
every other tag, whose attributes are ignored but for `href` and `class`, an inline view's
attributes are **read and converted** by the class's declared types, and anything that will not
apply goes to `unsupported` along with the unknown tags. Since content may name any view class
the program declares, a document loaded from elsewhere can place any of them — the classes your
program contains are the boundary.

```declare
class Chip extends View [ label: string = "",
    height = 19, width = { this.t.width + 18 }, cornerRadius = 9,
    fill = 0xDDF4E4,
    t: TextLabel [ x = 9, fontSize = 11.5, text = { classroot.label } ]
    ]

App [ width = 430, height = 90,
    HTMLText [ x = 16, y = 16, width = 398, fontSize = 15,
        html = "<b>Bold</b> is a tag the whitelist knows; <Chip label='docs'/> is a view you declared." ]
    ]
```

```declare
HTMLText [ width = { parent.width },
    html = "<h3>Notice</h3><p>Loaded content with <b>bold</b>, <i>italic</i>, and a <a href='#'>link</a>.</p>"
    ]
```

## html
The HTML source — a literal, or a `{ }` constraint that re-parses whenever it changes (a
fetched document, a live-edited field). Only `<a href>` and `<span class>` (see `textStyles`)
are read; every other attribute is ignored — except on a tag naming one of your view classes,
whose attributes are the view's (above).

## unsupported
What a tag **outside the whitelist** does — the reason this is safe for loaded content:

- `strip` (the default) — the unknown tag is **unwrapped**: it is dropped but its text is
  kept, so `<marquee>hi</marquee>` renders as `hi`. `<script>` / `<style>` are dropped whole
  (content and all).
- `error` — the first unsupported tag **throws**, naming it. Use this when unexpected markup
  should be a hard failure rather than silently pruned.

(`textStyles`, `lineHeight`, `bodyColor`, and `onLink` — the named-style palette, the shared prose styling and the link event — come
from the `RichText` base.)
