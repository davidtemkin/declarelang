Rich content authored in **Markdown** — point it at a string and it parses (headings, lists,
tables, inline code, links) into a stack of real, wrapped, prose-styled **views**, not a
foreign HTML blob (so it lays out, sizes, and renders identically on both backends). Literal
or computed: `text = { article.body }` re-parses and re-renders reactively, so it handles
streamed or live-edited Markdown. A `RichText`, so it carries all the shared prose styling
(`lineHeight`, `bodyColor`, `onLink`, and the ambient text properties).

```declare
Markdown [ width = { parent.width }, text = { :body } ]
```

## text
The Markdown source — a literal, or a `{ }` constraint that re-parses whenever it changes
(a streamed response, an editor's live text).
