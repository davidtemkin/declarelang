<!-- nav: Notation -->
<!-- part: Start here -->

# Notation

A Declare program is made of two kinds of text, and you can always tell which one you
are reading:

> **`[ ]` holds structure. `{ }` holds TypeScript.**

Square brackets hold a component's **members**: its attributes, its children, its
methods. Nesting the brackets nests the components, so the indentation of a program is
the shape of its interface, and you read it the way you read an outline. From any `{`
to its matching `}` you are writing ordinary TypeScript: an expression, or a method's
statements. There is no third language and no new expression syntax. If you know
TypeScript, you already know what goes inside the braces; this chapter is about the
brackets.

## Three ways to give an attribute a value

| you write | it is | example |
|---|---|---|
| a **bare** value | a literal, set once | `width = 300`, `fill = navy` |
| a **`{ … }`** value | a constraint: TypeScript that stays true | `width = { parent.width - 40 }` |
| a **`:`** path | a read from the data the view is attached to | `text = :title` |

A bare value never changes on its own. A braced value is re-evaluated whenever
something it reads changes — [Constraints](declare-docs:guide:constraints) is the
chapter on that. A value starting with `:` reads a field of the record the view is
attached to; [Data](declare-docs:guide:data@datasets-cursors-and-paths) covers where that record comes from. All
three in one program:

```declare
App [ width = 340, height = 130, fill = midnightblue, textColor = whitesmoke,
    person: Dataset { { "name": "Ada Lovelace", "role": "analyst" } },
    card: View [ x = 20, y = 20, width = 300, cornerRadius = 10, padding = 16,
        fill = #1C3A4F,                                          // bare: a literal color
        datapath = { app.person.value },
        layout: SimpleLayout [ axis = y, spacing = 4 ],
        Text [ fontWeight = bold, text = :name ],                // :path — read from data
        Text [ textColor = lightsteelblue, text = :role ],
        Text [ fontSize = 12, textColor = lightsteelblue,
            text = { "card is " + parent.width + " wide" } ]    // { } — stays true
        ]
    ]
```

Edit the `"name"` in the data and the card follows. Change the card's `width` and the
last line follows, because its text is a constraint on the width, not a number
computed once.

## Where the two worlds meet

Each world has its own vocabulary, and the boundary between them is exact.

- **In a bare slot** the compiler owns a small literal language: `#1C3A4F` and `navy`
  are colors, `100%` is a length, `center` is a position, `bold` is a font weight,
  `x` or `y` is an axis. A string in `"…"` ends at its line; a longer one is a
  `"""` block.
- **Inside braces** that vocabulary stops, because you are in TypeScript. A color is a
  number, `0x1C3A4F`; there are no percentages, so a fraction of the parent is
  arithmetic on `parent.width`. The compiler never reinterprets an identifier inside
  braces.
- **A value `{ }` is one expression.** Ternaries, template literals, array methods,
  closures and casts (`x as T`) are all fine; a `let` or a second statement is not. Move
  that logic into a method and call it: `width = { classroot.measure() }`.
- **A method's `{ }` holds statements**, like any function body.
- **Types are written on declarations, not in bodies.** `count: number = 0` states a
  type; `(x: number) => …` or `type K = …` inside a body is an error that says where
  the type belongs.

Crossing the boundary the wrong way is one of the first mistakes everyone makes, and
the compiler catches it. In the example above, change the last [`textColor`](declare-docs:Text.textColor) to
`{ :role == "analyst" ? #2E6BE6 : #556673 }` and read the error: inside braces a color
is written `0x2E6BE6`. The general rule shows here too. Where Declare looks like
something you know, it behaves the way you would expect; where it is different, it
looks different, and the compiler holds the line instead of guessing.

## Members, told apart by shape

No keywords separate the kinds of member. Their shape does:

```declare-fragment
width = 100%,                          // SET an attribute the component already has
label: string = "",                    // DECLARE a new attribute (name: Type = default)
select() { classroot.pick(this) },     // a METHOD
total(n: number) -> number { return n * 2 },   // a method that returns a value
onClick() { count = count + 1 },       // a HANDLER — a method named on + an event
bg: View [ fill = midnightblue ],      // a named CHILD, reachable as bg
Text [ text = "OK" ]                   // an anonymous child
```

The distinction to hold onto: **`name = value` sets an attribute that already exists;
`name: Type = value` declares a new one.** Declaring is how a component gets state of
its own. A method's parameters are typed name-first, and `-> R` states what it
returns. A handler is an ordinary method whose name is `on` plus an event; there is no
`addEventListener`, and events do not bubble.

Inside a handler or method, a `:field` can be written as well as read: `:done = true`
writes that field of the record the node is attached to.
[Data](declare-docs:guide:data) shows where that matters.

> **From React:** a declared attribute is a prop and state at once — settable from
> outside, reactive inside. Children are members, not a `props.children` channel. And
> there are no expressions that produce children: `{ }` produces a value, never a
> subtree. Repeated children come from data.

Members are separated by commas, and the separator is required; leave one out and the
compiler names the spot. A comma before a closing `]` is accepted, and the formatter
removes it. Comments are `//` and `/* … */`.

## The top-level declarations

Outside the [`App`](declare-docs:App), a program may declare a few other things. Each one gets a chapter
where it is used, but here is the whole list so nothing later looks like new syntax:

| declaration | what it is | taught in |
|---|---|---|
| `class Name extends Base [ … ]` | a component of your own | [Components](declare-docs:guide:components) |
| `schema Name [ field: type, … ]` | the shape of data you rely on | [Typed data](declare-docs:guide:schemas) |
| `theme Name [ token = value, … ]` | a named set of design tokens | [Paint and themes](declare-docs:guide:paint-and-themes) |
| `style Name [ … ]` | a named text style for runs of prose | [Text and fonts](declare-docs:guide:text) |
| `include [ "file.declare" ]` | another file's declarations, merged in | [Components](declare-docs:guide:components) |
| `script { … }` / `script [ "file.ts" ]` | plain TypeScript outside the tree | [Components](declare-docs:guide:components) |
| `use [ Name ]` | keep a component the build would drop | [Custom components](declare-docs:guide:custom-components) |
| `ship [ … ]` | what a production package must carry | [Packaging](declare-docs:guide:packaging) |

One construct breaks the "braces are TypeScript" rule, and it is easy to recognize: a
[`Dataset`](declare-docs:Dataset) written with a literal body, `Dataset { { "rows": [ … ] } }`, holds **strict
JSON** — quoted keys, no trailing commas — because it is data, not code.

---

**What you can now read:** any Declare program's structure — which world each piece of
text belongs to, what each member is, and which values are live.

[Next: **Constraints** →](declare-docs:guide:constraints)
