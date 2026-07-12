Renders rich content authored in **Markdown** — point it at a string and it parses
(headings, lists, tables, inline code, links) into a stack of real, wrapped, prose-styled
**views**, not a foreign HTML blob (so it lays out, sizes, and renders identically on both
backends). Literal or computed: `text = { article.body }` re-parses and re-renders
reactively, so it handles streamed or live-edited Markdown. A `View` subclass — give it a
`width` and it wraps within it; its height grows to the content.

```declare
Markdown [ width = { parent.width }, text = { :body } ]
```

## text
The Markdown source — a literal, or a `{ }` constraint that re-parses whenever it changes
(a streamed response, an editor's live text).

## lineHeight
Leading multiplier on the natural line height — `1` (the default) is tight, `1.5` airy.
Tune prose density without touching the font size.

## bodyColor
Overrides the built-in body-text colour (`null` = the default). Headings and inline code
keep their own tokens, so this dims **running text only** — the hierarchy stays crisp.

## onLink
A link (`[text](url)`) was activated — you get its `href`, and you decide what it means:
scroll to an anchor, set an in-app route, or open externally. The runtime only delivers the
click. Left unhandled, a link falls back to `app.navigate` (so external links work with no
wiring); declaring `onLink` overrides that. Modifier/middle clicks still open a new tab
natively. Same on both backends.
