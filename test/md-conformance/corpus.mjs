// The conformance corpus — one Markdown document that exercises the CommonMark
// + GFM surface Declare's reader supports, plus (at the end) a section naming
// the features it deliberately does NOT support. Shared by the structural gate
// (md-conformance.test.mjs) and the rendered visual check (render.mjs).

export const DOC = `# Heading one

## Heading two

### Heading three with **bold** and *italic*

A plain paragraph with a soft
line break inside it, then a hard break here\\
and the line after the hard break.

Emphasis: *italic*, _italic too_, **bold**, __bold too__, ***bold italic***,
and the tricky ones: an intraword a*b*c star, an intraword foo_bar_baz underscore
(stays literal), *a **b** c* nesting, **a *b* c** the other way, *a **b*** trailing,
and \`inline code\` plus \`code with **stars**\` and ~~strikethrough~~.

The three-item list that started this whole thing:

1. ***this file*** *— the **language**: every form the grammar accepts;*
2. ***the map*** *— where the rest lives: components and their attributes;*
3. ***the compiler*** *— every error carries a code and a position.*

- a bullet item
- another, with a [link](https://example.com/docs) and \`code\`
  - a nested bullet
  - another nested one
- back to the top level

Ordered, starting at three:

3. three
4. four
5. five

Task list:

- [x] done
- [ ] not done

> A blockquote paragraph, with **bold** inside it.
>
> > A nested blockquote.

| Name  | Score |
|:------|------:|
| Ada   | 99    |
| Linus | 88    |

A fenced code block:

\`\`\`js
const x = 1;
function f(a, b) { return a + b; }
\`\`\`

An autolink <https://example.com> and an email <hi@example.com>.

Entities: A &amp; B &mdash; C &copy; 2026.

A link with a [title](https://example.com/x "hover me"), a URL that itself
contains [parentheses](https://en.wikipedia.org/wiki/Foo_(bar)), and an inline
image ![a small square](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAIAAABL1vtsAAAAHUlEQVR4nGPQz39AIWIYNWLUiFEjRo0YNWIgjAAAZBjSV/AyyMcAAAAASUVORK5CYII=) mid-sentence.

Reference links resolve against definitions gathered anywhere: the full form
[the docs][docs], the collapsed [docs][], and the shortcut [docs] all point to
one place; a reference image ![the mark][mark] works the same way.

[docs]: https://example.com/docs "Documentation"
[mark]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAIAAABL1vtsAAAAHUlEQVR4nGO45upKIWIYNWLUiFEjRo0YNWIgjAAAcbmZn9kr0toAAAAASUVORK5CYII= "The mark"

A loose list (blank lines between items) renders with more air:

- first, with room to breathe
- second

- third, after a gap

Setext heading (underlined)
===========================

And a second-level one
----------------------

---

The end.`;

// What Declare's Markdown reader still renders differently — grouped by WHY.
// The target is CommonMark + the two GFM features we opt into (tables,
// strikethrough), which is exactly this file's reference renderer. Two of these
// are DELIBERATE design deviations; the rest are simply OUTSIDE that baseline —
// GitHub/extension features that markdown-it in our own conformance config
// (commonmark + strike + table) also leaves literal, so there is no divergence
// from the reference to fix. (The former GAPS — images, reference links, link
// titles, setext headings, list tightness, indented code in lists — are now
// supported and exercised in DOC above; inline images render as real bitmaps on
// the DOM and Canvas backends and degrade to their `alt` text on the mac flow,
// pending a host-side NSTextAttachment change.)
export const GAPS = [
  // — deliberate design deviations (a declarative, multi-backend renderer) —
  ["raw inline HTML", "`<b>`/`<span>` render as LITERAL text — a declarative renderer does not execute embedded HTML, and the Canvas/mac flows have no HTML engine to run it. Deliberate."],
  ["HTML block passthrough", "a leading `<div>…</div>` block is not passed through as HTML — same design reason as inline raw HTML."],
  // — outside the CommonMark + tables/strike baseline (the reference also leaves these literal) —
  ["footnotes", "`[^1]` / `[^1]: …` — a GitHub extension, not CommonMark; markdown-it renders it literal too under our config."],
  ["autolink of bare URLs (linkify)", "a bare `https://x` (no angle brackets) — the GFM linkify extension, not enabled on either side; `<https://x>` autolinks."],
  ["single tilde subscript", "`~x~` — a markdown-it extension, not CommonMark/GFM; only `~~x~~` strikethrough is read, on both sides."],
  ["multi-line table cells (`<br>` in a cell)", "GFM table cells beyond simple inline content are not modelled; escaped pipes (`\\|`) already work."],
];
