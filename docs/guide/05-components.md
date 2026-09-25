<!-- nav: Components and the tree -->
<!-- part: Building -->

# Components and the tree

Most of what you write in Declare is composition: taking components, nesting and
configuring them, and naming your own when a part of the design deserves a name. This
chapter covers how components are defined and used, how code refers to other parts of
the tree, which things in the tree have no pixels at all, and how a program is split
into files.

> **The brackets are the tree.** A component's children sit inside its `[ ]`, and the
> nesting in the source is the nesting on screen.

## Components are classes

You use a component by naming its type with a `[ ]` body. You define one with
`class Name extends Base [ … ]`:

```declare
class StatRow extends View [ width = 260, height = 22,
    label: string = "",
    value: string = "",
    layout: SimpleLayout [ axis = x, spacing = 8 ],
    Text [ width = 100, textColor = slategray, text = { classroot.label } ],
    Text [ text = { classroot.value } ]
    ]

App [ width = 320, height = 120, fill = white, textColor = black,
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 6 ],
        StatRow [ label = "Humidity", value = "62%" ],
        StatRow [ label = "Wind", value = "8 mph" ]
        ]
    ]
```

`StatRow` declares two attributes, `label` and `value`, and its children read them. Now
`StatRow [ … ]` can go anywhere a [`View`](declare-docs:View) fits: the class *is* a `View` plus the members
it adds. Add a third row to the example and the column grows.

The children reach the component through **`classroot`**, which means "the instance of
the class being defined" from any depth inside it. `this` inside a child is that child,
so `classroot` is how a nested handler or constraint reaches the component's own state.
A bare name such as `label` also resolves outward to the class's attribute;
`classroot.label` is the explicit spelling, and the one to use when a nearer child has
an attribute of the same name.

Anything a class sets is a default. A use site may set any attribute again —
`StatRow [ label = "Wind", height = 30 ]` — and may add members of its own.

> **From React:** a class is the component, its props and its state in one
> declaration. `label: string = ""` is settable from outside like a prop and reactive
> inside like state, with no constructor, no destructuring and no render boundary.

## Any instance can have members of its own

You do not need a class to give one component some state or a handler. Any instance may
declare members inline, and the compiler gives it an anonymous subclass:

```declare
App [ width = 260, height = 90, fill = white,
    Button [ x = 20, y = 20,
        taps: number = 0,
        label = { "taps: " + taps },
        onClick() { taps = taps + 1 }
        ]
    ]
```

[`App`](declare-docs:App) itself is an instance of this kind — a one-off that carries its own declarations.

## When to name a class

There are two good reasons to make a class, and they are different.

- **Reuse.** The same structure appears more than once, or you need to name its type —
  to extend it, or to declare an attribute that holds one.
- **Readability.** A long instance declaration is making its parent hard to read. Pull
  it out as a class named for its role — `Toolbar`, `WeekColumn`, `DetailPanel` — and
  the parent reads as the design instead of a wall of brackets. A class can then live
  in its own file.

The second reason is not a compromise of the first. The point of naming things is to
keep the structure of the app visible; a class used once is often the clearest way to
do that. What does *not* earn a class is a single computed value: a URL built from a
record is a function call in a constraint, [`Image [ source = { iconFor(:code) } ]`](declare-docs:Image),
not a `class Icon` wrapped around it.

## Components that take content

Some components own all of their children. Others are handed their children by the use
site — a figure with a caption, a panel with whatever goes in it. An instance may carry
anonymous children, and they arrive as the class's children, arranged by the class's
layout:

```declare
class Figure extends View [ width = 100%, height = { contentHeight },
    layout: SimpleLayout [ axis = y, spacing = 8 ]
    ]

App [ width = 340, height = 220, fill = white, textColor = black,
    col: View [ x = 20, y = 20, width = 300,
        layout: SimpleLayout [ axis = y, spacing = 16 ],
        Figure [
            View [ width = 100%, height = 60, cornerRadius = 6, fill = #DCE6F0 ],
            Text [ width = 100%, fontSize = 13, text = "the caption sits under the picture" ]
            ],
        Figure [
            View [ width = 100%, height = 40, cornerRadius = 6, fill = #E7E0F0 ],
            Text [ width = 100%, fontSize = 13, text = "the next one is the same class" ]
            ]
        ]
    ]
```

`height = { contentHeight }` is what makes it work: the class cannot know what it will
be handed, so it measures. (A view with no height set does the same thing on its own;
the explicit form says it out loud.)

Configuration goes the other way. A use site does **not** reach into a class's own
named children: writing `StatRow [ Text [ … ] ]` adds a *new* child, and redeclaring a
child the class already names is an error. What a component exposes is attributes, and
its children read them.

> **A class owns its members. A use site speaks to it through attributes and content.**

## Models: classes with no view

Not everything in an app is visible. A cart, a selection, a session, a coordinator —
state and behavior that belong together but paint nothing. That is a **model class**,
and it is simply a class that does not extend `View`. A class with no `extends` at all
is a [`Node`](declare-docs:Node), the base of everything in the tree:

```declare
class Cart [
    count: number = 0,
    add() { count = count + 1 },
    clear() { count = 0 }
    ]

App [ width = 340, height = 90, fill = white, textColor = black,
    cart: Cart [ ],
    row: View [ x = 20, y = 24,
        layout: SimpleLayout [ axis = x, spacing = 10, align = center ],
        Button [ label = "Add", primary = true, onClick() { app.cart.add() } ],
        Button [ label = "Clear", onClick() { app.cart.clear() } ],
        Text [ text = { app.cart.count + " in the cart" } ]
        ]
    ]
```

The model lives in the tree as a named member, so it has the same reach and lifetime as
anything else, and views read it and call it like any component. Prefer a model class to
a pile of attributes on `App`: an app whose every value hangs off the root has a data
model; it just has not been allowed to say so. A model can also stand on a record of its
own — [Data](declare-docs:guide:data@models-on-a-record) shows how.

Because a class with no `extends` is a `Node`, a class meant to be a box needs
`extends View`: `class Box [ width = 40 ]` is an error ("Box has no attribute
'width'").

## Members with no pixels

The same idea covers the platform's own non-visual pieces. A [`Dataset`](declare-docs:Dataset) holding data, a
[`Spring`](declare-docs:Spring) driving an attribute, a [`Time`](declare-docs:Time) giving the clock, [`Keys`](declare-docs:Keys) hearing the keyboard,
a [`DataSource`](declare-docs:DataSource) fetching from a server — each is a child member of some node. It is
created with that node and removed with it, so there is nothing to subscribe to and
nothing to clean up. Where you declare one says who owns it.

## Arriving and leaving

Every node fires `onInit` once, when it and its subtree exist. That is the place for
setup that needs the built tree. A view fires `onRetire` once when its presence ends —
its record leaves the data, or it is discarded — with everything still alive, so the
handler can read what it needs. The App alone fires `onReady` when the first settle has
closed ([Constraints](declare-docs:guide:constraints@the-settle-when-writes-take-effect)).

Most programs need none of these: a value that should be true is a constraint, and a
view that should exist comes from data.

## Stacking is declaration order

Siblings that overlap paint in the order they are written — **later members draw on
top**. There is no z-index; you restack by reordering, so reading order is paint order.
Floating chrome — a toolbar over content, an overlay — is declared last.

## Reaching other parts of the tree

A bare name resolves outward through the enclosing brackets, innermost first: the
brackets are the scope exactly as they are the tree. Four reserved words say it
explicitly:

- **`this`** — the node the code is written on;
- **`parent`** — its parent in the tree;
- **`classroot`** — the instance of the class being defined, from any depth inside it;
- **`app`** — the running app, from anywhere.

Named children are reached by name: `app.card.list`, `parent.title`. `App`, capitalized,
is the class; the running instance is always `app`.

## Where a piece of code lives

- A value that should stay true → a **constraint** on the attribute.
- A computed value used in several places → a **declared attribute** with a `{ }`
  default.
- Behavior on a component's own state → a **method** on the component.
- State and behavior with no view → a **model class**.
- Structure that repeats, or that makes its parent hard to read → a **class**.
- Logic that is not about the tree at all → a **`script`** block.

A `script { … }` block is plain TypeScript outside the reactive system: functions of
their arguments — date arithmetic, formatting, parsing — and imported libraries. It is
not where the app's model or its look lives: a derivation over your data is a method
([Data](declare-docs:guide:data@models-on-a-record)), and a repeated color or size is a
theme token. A program may have several blocks, inline or
loaded from files with `script [ "helpers.ts" ]`; they share one scope, in source order.
A block may `import` a relative file or an npm package when a Node host compiles the
program (the dev server, `declarec`, `declare-verify`); the in-browser compiler refuses
package imports. A constraint that calls a script function depends only on the values
it passes — the function body is opaque to the compiler — and a script variable is not
reactive, so state that changes belongs in an attribute. Script is for code that
*computes*; foreign code that *draws* goes in an island
([Embedding](declare-docs:guide:embedding)).

Script is also where the host's own APIs are usable. A `{ }` body reaches the world
through members — a `DataSource` for a request, a `Time` for a repeating call,
`afterDelay` for a single later one — and the compiler refuses `fetch`, the timers and
`globalThis` there. A script block is not a body: when a program genuinely needs a host
API the language does not cover, a script function wraps it and a handler calls that.

## Growing past one file

`include [ "components.declare" ]` merges another file's declarations — its classes,
schemas, themes, styles and scripts — into the program, once, however many times it is
named. It is not a module system: there are no exports and no namespaces, just one
program. An included file declares no `App` of its own. Declarations can appear above
or below the `App`, and a class may extend one declared later. The standard library
needs no include; a bare [`Button [ … ]`](declare-docs:Button) finds it.

Use `include` to partition your own program, not only to share libraries: the theme in
one file, the components in another, the model in a third, and the `App` left holding
the tree it shows.

---

**What you can now do:** define components and models, decide when a part of the
design deserves a class, build components that take content, reach any node from any
code, and split a program into files.

[Next: **Size, position and layout** →](declare-docs:guide:layout)
