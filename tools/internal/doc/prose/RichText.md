The abstract family of **flowing, structured, styled text** — the shared base of `Markdown`
and `HTMLText`. You never write `RichText [ ]` directly (like `Layout`, it names no format);
you write one of its two concrete formats, which differ *only* in how they parse their
source. Everything else — how it flows, wraps, stacks, and styles — lives here.

**Styling follows the ordinary text properties.** A rich-text block's **body** obeys the same
inherited slots a `Text` does — `fontSize`, `fontWeight`, `textColor`, `letterSpacing`,
`lineHeight` — so prose is no longer a sealed world: set `fontWeight = semibold` on a
container and the prose body below is semibold. Its **structure** (headings, code, links,
list spacing) comes from a built-in house style that looks right with zero config and follows
light/dark on its own; the parts you commonly re-theme are their own inherited slots —
`headingColor`, `headingWeight`, `linkColor`, `codeColor` — each cascading like `fontSize`.

## lineHeight
Leading multiplier on the natural line height — `1` (the default) is tight, `1.5` airy.
Tune prose density without touching the font size.

## bodyColor
Overrides the running-text color (`null` = the theme-aware house body). Headings and inline
code keep their own tokens, so this dims **body text only** — the hierarchy stays crisp. (Body
weight/size/tracking come from the ambient `fontWeight`/`fontSize`/`letterSpacing`.)

## baseline
The y of the **first line's baseline** in this box — what a baseline-aligning layout
(`align = baseline` on a `SimpleLayout` row or a `WrappingLayout`) sits a `Markdown` or
`HTMLText` on. The flow **claims** it: the first block's first line, when the document
opens with prose (a paragraph or heading), by the same strut-and-growth arithmetic the
canvas flow paints by — so the DOM and canvas renderers agree by construction. `null` when
the document opens with a table, a list, a code fence or a rule: then it declares none,
and a baseline row refuses it by name (placing it at the line's start). Read-only,
reactive — re-claimed on every rebuild and re-width.

## onLink
A link (`[text](url)` in Markdown, `<a href>` in HTMLText) was activated — you get its `href`,
and you decide what it means: scroll to an anchor, set an in-app route, or open externally. The
runtime only delivers the click. Left unhandled, a link falls back to `app.navigate` (so
external links work with no wiring); declaring `onLink` overrides that. Modifier/middle clicks
still open a new tab natively. Same on both backends.
