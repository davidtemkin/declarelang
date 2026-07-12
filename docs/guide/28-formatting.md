# Formatting — the house style

Members are order-inert: nothing in the grammar forces a particular layout, so two
authors can write the same tree and have it look nothing alike. Declare's readability
bet — that a UI tree reads like the picture it draws — only pays off if every file is
laid out the same way. Hence one house style. The rules are few, and mechanical enough
that a formatter enforces them; [`design/formatting.md`](../../design/formatting.md) is
the full canon this chapter summarizes.

## Indentation and commas

Four-space indentation, everywhere. Members are comma-separated at every level, with a
**trailing comma always** — including the last member before a closing bracket. The
trailing comma is what makes reordering or adding a member a one-line diff.

## The header line

A parent's plain literal configuration — `name = value` pairs with no child structure —
rides the opening line, so a component announces its shape up front:

```declare
class Counter extends View [ width = 200, height = 40,
```

Declarations (`n: number = 0`), methods, `layout:`, and child instances each drop to
their own line — they never share the header line with plain config.

## Two closing styles

The one rule worth memorizing. A **leaf** body holds attributes only — literal config
and bindings, no child instance, method, state, or declaration — and closes **inline**,
its `]` riding the last line (even when the attributes wrapped):

```declare
label: Text [ fontSize = 22, fontWeight = semibold, textColor = 0x2E6FE0,
    text = { "count: " + this.n } ],
```

Any body that holds a child, a method, a state, or a nested declaration closes
**hanging** — the `],` alone on its own line, at the body's own indent:

```declare
plus: View [ x = 150, width = 40, height = 40, fill = 0x2E6FE0,
    onClick() { classroot.n = classroot.n + 1 },
    Text [ text = "+", textAlign = center, width = 40, fontSize = 22 ],
    ],
```

The test is the *kind* of member a body holds, not how many source lines it spans:
`plus` above hangs because it holds a method and a child, even though each fits on one
line. Top-level `class` and `App` **always** close hanging.

## Breathing room

Class and `App` bodies breathe — a blank line after the header, and blank lines between
member *groups* (declarations, then layout, then each multi-line child) — so the body
reads as an outline rather than a wall. Deep composition where every member is a
one-line leaf stays tight, with no interior blanks; a run of similar leaves is one
visual unit:

```declare
StatRow [ label = "Humidity:",  value = :humidity ],
StatRow [ label = "Barometer:", value = :pressure ],
StatRow [ label = "Windspeed:", value = :windspeed ],
```

## No column alignment

Values are single-spaced; columns are **not** padded into a table across sibling rows
(the run above is aligned only for illustration — the house style writes it
single-spaced). Aligned columns re-flow every sibling when the longest item changes and
force a regex where a literal search would do; single space is what a machine and a
human both produce with zero effort.

## Comments

`// ` — two slashes, one space, then text. A comment sits at the indent of what it
annotates, blank-padded above and below (except the first line of a file or body). A
trailing inline comment rides the line it annotates:

```declare
onClick() { data.clear() },   // back to the entry screen — declaratively
```

A **block comment** `/* … */` is valid anywhere a line comment is, and it is the home of
*literate Markdown*: prose that documents the code around it. The code viewer
(`?view=source`) renders each block comment as Markdown and the code between them
syntax-highlighted — so a source file can read as its own annotated document while still
compiling and running. See [Compiling and shipping](35-shipping.md) for the source view.

---

**Next:** with the house style in hand, Part III goes in depth — animation, text, sizing,
fonts, input, and shipping.
