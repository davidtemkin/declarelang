<!-- nav: Two brackets -->
<!-- part: The idea -->

# Two brackets

Chapter 1 promised one genuine shift in how you picture an interface. Before that shift
can land, you need the shape of the language — and the shape is small enough to state
in a sentence:

> **`[ ]` holds structure; `{ }` holds TypeScript. Everything you will ever read in a
> Declare program is one of those two worlds, and you can always tell which you're in.**

`[ … ]` holds a component's **members** — its attributes, its children, its methods.
The bracket nesting *is* the view tree: you read an app's structure by scanning its
indentation, the way you read an outline. And from any `{` to its matching `}` you are
writing ordinary TypeScript — a value expression, a handler body. There is no third
world and no new expression language to learn. If you know TypeScript, you already
know everything inside the braces; this guide's job is only the brackets.

## Three ways to give an attribute a value

This is the one table to internalize — everything else in the language builds on it:

| you write | it is | example |
|---|---|---|
| a **bare** value | a literal, set once | `width = 300`, `fill = navy` |
| a **`{ … }`** value | a live TypeScript expression | `width = { parent.width - 40 }` |
| a **`:`-prefixed** path | a read from bound data | `text = :title` |

Bare means it never changes. Braces mean it stays true — the standing relationship
from chapter 1, which the next chapter is entirely about. A leading `:` means the
value comes from data, which is [chapter 8](declare-docs:guide:data)'s subject. Here
are all three in one running program:

```declare
App [ width = 340, height = 120, fill = #10202B, textColor = whitesmoke,
    person: Dataset { { "name": "Ada Lovelace", "role": "analyst" } },
    card: View [ x = 20, y = 20, width = 300, height = 80, cornerRadius = 10,
        fill = #1C3A4F,                                     // bare: a literal color
        datapath = { person.value },
        name: Text [ x = 16, y = 16, fontWeight = bold, text = :name ],    // from data
        role: Text [ x = 16, y = 44, textColor = #9DB0BC, text = :role ],
        badge: View [ y = 16, width = 10, height = 10, cornerRadius = 5, fill = mediumseagreen,
            x = { parent.width - 26 },                      // braces: stays true
            ],
        ],
    ]
```

Edit the `"name"` in the data and the card follows. Change the card's `width` and the
badge re-places itself — its `x` is a relationship, not a number that was computed
once.

## The seam has rules

The `[ ]` world and the `{ }` world each own their own vocabulary, and the boundary
between them is exact. In a **bare slot**, the compiler owns a small literal language:
`#1C3A4F` is a color, `navy` is a named color, `100%` is a length, `bold` is a font
weight. Inside **braces** that vocabulary stops — you are in plain TypeScript, where
`#` means nothing and a color is just a number, written `0x1C3A4F`. The compiler never
silently reinterprets an identifier inside braces.

Try crossing the seam the wrong way. In the example above, change the badge's fill to
a computed value the way instinct suggests:

```declare-fragment
badge: View [ fill = { :role == "analyst" ? #2E6BE6 : #556673 } ],   // ✗ won't compile
```

The compiler stops at the `#` and tells you why — inside braces, colors are `0x2E6BE6`.
The lesson generalizes: when Declare looks like something you know, it behaves the way
you'd assume; where it's genuinely different, it *looks* different, and the compiler
holds the line rather than guessing. Two more edges of the seam worth knowing now:
percentages exist only as bare literals (`width = 100%` ✓, `width = { 100% }` ✗ —
compute from `parent.width` instead), and a `{ }` body takes TypeScript *expressions
and statements*, not type syntax — no `as`, no generics; coerce structurally
(`String(x)`, `x || ""`) when you must.

## Everything in `[ ]` is a member, told apart by shape

No keywords distinguish the member kinds — their shape does:

```declare-fragment
width = 100%,                          // SET an attribute that exists
label: string = "",                    // DECLARE a new reactive attribute (name: Type = default)
select() { classroot.pick(this) },     // a METHOD — a named block
onClick() { count = count + 1 },       // a HANDLER — a method named `on` + its event
bg: View [ fill = #101E28 ],           // a CHILD, named `bg` so others can reach it
Text [ text = "OK" ],                  // an anonymous child
```

The line that matters most: **`name = value` sets an attribute that already exists;
`name: Type = value` declares a new one.** Declaring is how a component grows reactive
state — `count: number = 0` in chapter 1's counter is what made `count` a value the
whole tree could bind to. And a handler is nothing special: it is a method whose name
is `on` plus an event, called when the event fires. There is no `addEventListener`,
and events do not bubble — [chapter 7](declare-docs:guide:interaction) covers what
happens instead.

> **From React:** the mapping is close but not one-to-one. A member like
> `label: string = ""` is a prop *and* state at once — settable from outside, reactive
> inside, no `useState` distinction. Children are members too, not a special
> `props.children` channel. And there are no expressions-as-children: `{ }` produces
> a *value*, never a subtree — collections come from data replication, not `.map()`.

One punctuation rule, borrowed from Go: **the comma is a terminator, not a
separator.** Every member on its own line ends with one — including the last, and
including a child's closing `],`. You never special-case the final line, and
reordering members never breaks punctuation. (The single exception: no comma before a
closing bracket on the *same* line — `Text [ x = 42, text = :day ]`.)

## Multi-line strings

A `"…"` string may not contain a newline. Prose and Markdown bodies use `"""` blocks:

```declare-fragment
note: Text [ width = 300, wrap = true,
    text = """
        Triple-quoted blocks hold paragraphs; the surrounding
        indentation is stripped.
        """ ],
```

---

That is the entire notation: two brackets, three value forms, members told apart by
shape, one comma rule. You will not meet new syntax again in this guide — everything
from here on is *meaning*. **What you can now say:** you can read any Declare program's
structure — which world each character belongs to, what each member is, which values
are alive.

[Next: **Standing relationships** →](declare-docs:guide:relationships)
