# Composition — the tree is the brackets

Most of what you write in Declare is not class authoring; it is **composition**:
take built-in components, nest and configure them, bind them to data. The bracket
nesting *is* the view tree, so you read an app's shape by scanning its indentation
— a view's children sit inside its `[ ]`, and the brackets mirror the visual
nesting on screen.

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

Three children stacked inside one parent. Nothing about arrangement is implicit:
the `layout:` line says *how* they stack (see [Layout](25-layout.md)); without it
they would sit at their own `x`/`y`.

## Members: the four shapes inside `[ ]`

Everything inside a `[ ]` is a **member**, and each is one of a few shapes, told
apart *by shape*, not by keyword. By convention attributes come first as a
readable header, but ordering is stylistic. (The full member grammar is in the
[language spec](../../design/declare-language.md#4-members); here is the working
subset.)

```declare
class Card extends View [
    width = 300, cornerRadius = 10, fill = white,   // SET an attribute: name = value

    title: string = "",                               // DECLARE an attribute: name: Type = default

    dismiss() { classroot.detach() },                 // a METHOD: a named field of function type

    label: Text [ text = { classroot.title } ],       // a CHILD instance: Type [ … ] (named here)
    ]
```

The distinction that trips people first: **`name = value` *sets* an attribute
that already exists; `name: Type = value` *declares* a new one.** `fill = white`
sets the inherited `fill`; `title: string = ""` introduces a new reactive
attribute on this component, like a field. A method is just a member whose type is
a function type and whose value is a `{ }` block — `dismiss() { … }` is shorthand
for `dismiss: () { … }`.

A child instance is `Type [ … ]`, or `name: Type [ … ]` to name it so other
members can reach it (`this.label`, or bare `label`). A leaf — attributes only —
goes on one line; with no attributes at all, a bare `View` will do.

## Components are classes

A component *is* a class. You instantiate one by naming its type with a `[ ]`
body; you define one with `class Name extends Base [ … ]`. Defining your own is
meant to be everyday, not advanced:

```declare
class StatRow extends View [
    label: string = "",
    value: string = "",
    layout: SimpleLayout [ axis = x, spacing = -10 ],
    labelText: Text [ width = 90,  text = { classroot.label } ],
    valueText: Text [ width = 160, text = { classroot.value } ],
    ]
```

Now `StatRow [ label = "Humidity:", value = "62%" ]` is a leaf you can drop
anywhere a `View` fits, because your class *is* a `View` plus the members you
added. (`classroot` is how a child binding reaches the enclosing class instance —
see [Scope nouns](27-scope-nouns.md); for now read it as "this `StatRow`.")

A runnable program is the **`App` singleton** — one per program, and its instance
is the entire visible tree. There is no `class App`; `App [ … ]` is an instance
that carries its own declarations directly.

## One-off structure needs no class

Here is the part that keeps most Declare code flat: **any instance can declare
its own members inline** — attributes, methods, handlers, states — exactly as a
class body does. The compiler synthesizes an anonymous subclass to hold them. So a
one-off gets encapsulation with zero scaffolding:

```declare
clock: View [
    now: string = "",                          // its own attribute
    tick() <- Clock { now = currentTime() },   // its own subscription
    Text [ text = { now } ],
    ]
```

`App` itself is exactly this — a one-off instance that declares `count`, `zip`,
and so on with no class. **Promote a one-off to a named `class` only when you
instantiate it more than once, or when you need to *name* its type** (to declare a
parameter of it, or to `extend` it). That is the clean boundary: the moment the
type needs a name, you have outgrown the one-off.

## Where does a piece of code live?

The language keeps reinforcing one small decision tree. Follow it and code lands
in the right shape by default:

- structure that **repeats** → a **class**;
- a single **computed attribute** → bind it inline with a small **function**,
  *not* a wrapper class;
- behavior that operates on a component's own state (`this`) → a **method**;
- **stateless** logic, especially shared across unrelated parts of the tree → a
  free **function** in a `script { }` block.

So the weather icon is a helper, bound inline — not a `class WeatherIcon`:

```declare
script {
    function weatherIcon(code: number): string {
        return `resources/icons/${code}.gif`
    }
}

Image [ source = { weatherIcon(:code) } ]     // a stateless formatter, bound in place
```

A `class WeatherIcon extends Image` here would bundle a function in a class's
clothing — more ceremony, no more capability. (`script { }` is also where ES
`import`s live; a `{ }` value body can call anything a `script` block defines. See
the [`script` reference].)

## Reuse across files: `include`

When reusable classes outgrow one file, `include` merges another file's
*declarations* into your program — a parse-time source merge, not a linked binary:

```declare
include [ "components.declare" ]

App [ … ]                                     // now uses TabSlider, WeatherTab, … from that file
```

An included file is a library of definitions; it does **not** declare its own
`App`. Includes are deduped by path (diamonds and cycles are fine) and
order-inert (a class may extend one from a later include). Some bundled components
go one step tighter — a bare `Bar [ … ]` tag *auto-includes* its library with no
`include` line at all. (For the module story — ES `import` for JS modules vs.
`include` for Declare declarations — see [composition.md](../../design/composition.md).)

---

**Next:** attributes are only half the story until they can be *live*. That is
[Constraints](21-constraints.md).
