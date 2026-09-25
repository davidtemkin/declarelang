Rich content authored in **Markdown** — point it at a string and it parses (headings, lists,
tables, inline code, links) into a stack of real, wrapped, prose-styled **views**, not a
foreign HTML blob (so it lays out, sizes, and renders identically on every renderer). Literal
or computed: `text = { article.body }` re-parses and re-renders reactively, so it handles
streamed or live-edited Markdown. A `RichText`, so it carries all the shared prose styling
(`lineHeight`, `bodyColor`, `onLink`, and the ambient text properties).

```declare-fragment
Markdown [ width = { parent.width }, text = { :body } ]
```

**The one markup a Markdown document does read.** Raw HTML is not interpreted here — `<b>bold</b>`
stays the characters you typed — with a single exception: a self-closing tag naming a view class
the program declares is one real **inline view** of that class, flowed in the line (the family's
`RichText` entry states the whole of it). So a document keeps Markdown's promise that markup is
text, while still carrying the components your program defines. Its attributes are read and
converted by the class's declared types; Markdown has no `unsupported` attribute, so an attribute
that will not apply is dropped and the document renders on.

```declare
class Chip extends View [ label: string = "",
    height = 19, width = { this.t.width + 18 }, cornerRadius = 9,
    fill = 0xDDF4E4,
    t: TextLabel [ x = 9, fontSize = 11.5, text = { classroot.label } ]
    ]

App [ width = 430, height = 90,
    Markdown [ x = 16, y = 16, width = 398, fontSize = 15,
        text = "**Bold** is Markdown's, `<b>` stays text, and <Chip label='docs'/> is yours." ]
    ]
```

## text
The Markdown source — a literal, or a `{ }` constraint that re-parses whenever it changes
(a streamed response, an editor's live text). Raw markup stays the text it is, but for the one
exception above: a tag naming one of your view classes.
