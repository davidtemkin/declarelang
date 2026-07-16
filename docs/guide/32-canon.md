# The canon: formatting and house style

Members are order-inert: nothing in the grammar forces a layout, so two authors can write
the same tree and have it look nothing alike. Declare's readability bet — that a UI tree
reads like the picture it draws — only pays off if every file is laid out the same way. So
there is one house style, mechanical enough that a formatter enforces it. And it is not
cosmetic: every published Declare file is training data for the next model, so **one way to
write each thing** is infrastructure, not taste.

## Indentation and commas

Four-space indentation, everywhere. Members are comma-separated at every level, with a
**trailing comma always** — including the last member before a closing bracket. That trailing
comma is what makes adding or reordering a member a one-line diff.

## The header line

A parent's plain literal configuration — `name = value` pairs with no child structure — rides
the opening line, so a component announces its shape up front:

```declare-fragment
class Counter extends View [ width = 200, height = 40,
```

Declarations (`n: number = 0`), methods, `layout:`, and child instances each drop to their
own line — they never share the header line with plain config.

## Two closing styles

The one rule worth memorizing. A **leaf** body holds attributes only — config and bindings,
no child, method, state, or declaration — and closes **inline**, its `]` riding the last line
even when the attributes wrapped:

```declare-fragment
label: Text [ fontSize = 22, fontWeight = semibold, textColor = royalblue,
    text = { "width: " + app.width } ],
```

Any body that holds a child, a method, a state, or a nested declaration closes **hanging** —
the `],` alone on its own line at the body's indent:

```declare-fragment
plus: View [ x = 150, width = 40, height = 40, fill = royalblue,
    onClick() { width = width + 8 },
    Text [ text = "+", textAlign = center, width = 40, fontSize = 22, textColor = white ],
    ],
```

The test is the *kind* of member a body holds, not how many lines it spans: `plus` hangs
because it holds a method and a child, even though each fits on one line. Top-level `class`
and `App` always close hanging.

## Breathing room, and no column alignment

Class and `App` bodies breathe — a blank line after the header, and blank lines between member
*groups* — so the body reads as an outline. Deep composition where every member is a one-line
leaf stays tight, a run of similar leaves reading as one visual unit. Values are single-spaced;
columns are **not** padded into a table across sibling rows — aligned columns re-flow every
sibling when the longest item changes and force a regex where a literal search would do.

## Comments, and literate Markdown

`// ` — two slashes, one space, then text — at the indent of what it annotates, blank-padded
above and below, or trailing the line it annotates. A **block comment** `/* … */` is valid
anywhere a line comment is, and it is the home of *literate Markdown*: the code viewer
(`?view=reader`) renders each block comment as Markdown and the code between them
syntax-highlighted, so a source file reads as its own annotated document while still compiling
and running. The calendar and homepage are written to be read this way.

## The formatter enforces it

None of this is yours to remember line by line. `tools/format.mjs` *is* the canon:
`--check` fails a file that has drifted, `--write` rewrites it to canon. Format on save, and
your files match every other file — including the exemplars, the docs, and whatever a model
last read. Canon is a build gate alongside verify, for the same reason: a corpus that reads
one way stays legible to humans and models both.

---

That is the surface. **Next**, Part IV is the loop — [checking your program](declare-docs:guide:checking)
and [shipping it](declare-docs:guide:shipping).
