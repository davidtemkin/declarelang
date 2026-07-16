# The tree: composition and classes

Most of what you write in Declare is not class authoring; it is **composition**: take
components, nest and configure them, bind them to data. You read an app's shape by
scanning its indentation, because the one rule this whole chapter rests on is literal:

> **The brackets are the tree.**

A view's children sit inside its `[ ]`, and the nesting on the page mirrors the nesting
on screen.

```declare
App [ fill = white, textColor = black,
    View [ x = 28, y = 26,
        layout: SimpleLayout [ axis = y, spacing = 16 ],
        Text [ text = "Today", fontWeight = bold ],
        Text [ text = "Partly cloudy" ],
        View [ height = 1, width = 200, fill = gainsboro ],   // a hairline rule
        ],
    ]
```

Three children stacked inside one parent. Nothing about arrangement is implicit: the
`layout:` line says *how* they stack ([Space](declare-docs:guide:space)); without it
they would each sit at their own `x`/`y`.

## Members: the shapes inside `[ ]`

Everything inside a `[ ]` is a **member**, and each is one of a few shapes, told apart
*by shape*, not by keyword. By convention attributes come first as a readable header, but
ordering is stylistic.

```declare-fragment
class Card extends View [
    width = 300, cornerRadius = 10, fill = white,   // SET an attribute: name = value

    title: string = "",                             // DECLARE an attribute: name: Type = default

    dismiss() { classroot.detach() },               // a METHOD: a named field of function type

    label: Text [ text = { classroot.title } ],     // a CHILD instance: Type [ … ] (named here)
    ]
```

The distinction that trips people first: **`name = value` *sets* an attribute that
already exists; `name: Type = value` *declares* a new one.** `fill = white` sets the
inherited `fill`; `title: string = ""` introduces a new reactive attribute on this
component. A method is just a member whose type is a function type and whose value is a
`{ }` block. A child instance is `Type [ … ]`, or `name: Type [ … ]` to name it so other
members can reach it (`this.label`, or bare `label`).

## Components are classes

A component *is* a class. You instantiate one by naming its type with a `[ ]` body; you
define one with `class Name extends Base [ … ]`. Defining your own is meant to be everyday
work, not architecture:

```declare
class StatRow extends View [ width = 250, height = 22,
    label: string = "",
    value: string = "",
    layout: SimpleLayout [ axis = x, spacing = 8 ],
    labelText: Text [ width = 90, text = { classroot.label } ],
    valueText: Text [ width = 152, text = { classroot.value } ],
    ]


App [ fill = white, textColor = black,
    col: View [ x = 24, y = 24,
        layout: SimpleLayout [ axis = y, spacing = 6 ],
        StatRow [ label = "Humidity", value = "62%" ],
        StatRow [ label = "Wind", value = "8 mph" ],
        ],
    ]
```

Now `StatRow [ … ]` is a leaf you can drop anywhere a `View` fits, because your class *is*
a `View` plus the members you added. (`classroot` is how a child binding reaches the
enclosing class instance — [Reach](declare-docs:guide:reach); for now read it as "this
`StatRow`.") A runnable program is the **`App` singleton** — one per program, its instance
the entire visible tree. There is no `class App`; `App [ … ]` is an instance that carries
its own declarations directly.

## One-off structure needs no class

Here is the part that keeps most Declare code flat: **any instance can declare its own
members inline** — attributes, methods, handlers, states — exactly as a class body does.
The compiler synthesizes an anonymous subclass to hold them, so a one-off gets
encapsulation with zero scaffolding:

```declare
App [ width = 200, height = 90, fill = white, textColor = black,
    tally: View [ x = 20, y = 20,
        n: number = 0,                         // its own attribute
        onClick() { n = n + 1 },               // its own handler
        Text [ text = { `taps: ${n}` } ],
        ],
    ]
```

`App` itself is exactly this — a one-off instance that declares its own state with no
class. **Promote a one-off to a named `class` only when you instantiate it more than once,
or when you need to *name* its type** (to declare a parameter of it, or to `extend` it).
That is the clean boundary: the moment the type needs a name, you have outgrown the
one-off.

## Stacking order is declaration order

Siblings that overlap paint in the order they are written — **later members draw on top.**
There is no `z-index`; you restack by reordering, and reading order *is* paint order.

```declare
App [ width = 200, height = 120, fill = white,
    View [ x = 20, y = 20, width = 80, height = 60, cornerRadius = 8, fill = royalblue ],
    View [ x = 50, y = 40, width = 80, height = 60, cornerRadius = 8, fill = tomato ],
    ]
```

The tomato square is declared second, so it sits over the royalblue one. Swap the two
lines and the overlap flips.

## Where does a piece of code live?

The language keeps reinforcing one small decision tree. Follow it and code lands in the
right shape by default:

- structure that **repeats** → a **class**;
- a single **computed attribute** → bind it inline with a small **function**, *not* a
  wrapper class;
- behavior that operates on a component's own state (`this`) → a **method**;
- **stateless** logic, especially shared across unrelated parts of the tree → a free
  **function** in a `script { }` block.

So a weather icon is a helper, bound inline — not a `class WeatherIcon`:

```declare-fragment
script {
    function weatherIcon(code: number): string {
        return `resources/icons/${code}.gif`
    }
}

Image [ source = { weatherIcon(:code) } ]     // a stateless formatter, bound in place
```

A `class WeatherIcon extends Image` here would bundle a function in a class's clothing —
more ceremony, no more capability. (`script { }` is also where ES `import`s live; a `{ }`
value body can call anything a `script` block defines.)

## Growing past one file

An app is one file until it isn't. When reusable classes outgrow that file, `include`
merges another file's *declarations* into your program — a parse-time source merge, not a
linked binary:

```declare-fragment
include [ "components.declare" ]

App [ … ]                                     // now uses TabSlider, WeatherTab, … from that file
```

An included file is a library of definitions; it does **not** declare its own `App`.
Includes are deduped by path (diamonds and cycles are fine) and order-inert (a class may
extend one from a later include). The seams fall where the shapes do: a reusable component
becomes its own class file; a body of stateless model logic becomes a `script { }` file of
functions. Library components need no `include` at all — a bare `Button [ … ]` tag
*auto-includes* the standard library for you.

---

**Next:** attributes are only half the story until they can be *live*. That is
[Constraints](declare-docs:guide:constraints).
