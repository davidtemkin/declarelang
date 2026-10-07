<!-- nav: Structure -->
<!-- part: Start here -->

# Program structure

The chapters before this one taught the pieces: values, members, constraints. This one is
about where they go. The same shape holds from a twenty-line example to a whole app, and it
comes from three questions: what data the program holds, where the user is in it, and what
the screen shows. Each answer has a home.

> **Records live in datasets. Where the user is lives on the App. The views are the tree,
> derived from both.**

## Classes and instances

You use a class by naming it with a `[ ]` body, which makes an instance. You define one with
`class Name extends Base [ … ]`:

```declare
class StatRow [ width = 260, height = 22,
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

The children reach the instance through **`classroot`**, which means "the instance of
the class being defined" from any depth inside it. `this` inside a child is that child,
so `classroot` is how a nested handler or constraint reaches the instance's own state.
A bare name such as `label` also resolves outward to the class's attribute;
`classroot.label` is the explicit spelling, and the one to use when a nearer child has
an attribute of the same name.

Anything a class sets is a default. A use site may set any attribute again —
`StatRow [ label = "Wind", height = 30 ]` — and may add members of its own.

> **From React:** a class is the component, its props and its state in one
> declaration. `label: string = ""` is settable from outside like a prop and reactive
> inside like state, with no constructor, no destructuring and no render boundary.

### Members of one instance

You do not need a class to give one instance some state or a handler. Any instance may
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

[`App`](declare-docs:App) itself is an instance of this kind: a one-off that carries its own declarations.

### Reaching other parts of the tree

A bare name resolves outward through the enclosing brackets, innermost first: the
brackets are the scope exactly as they are the tree. Four reserved words say it
explicitly:

- **`this`** — the node the code is written on;
- **`parent`** — its parent in the tree;
- **`classroot`** — the instance of the class being defined, from any depth inside it;
- **`app`** — the running app, from anywhere.

Named children are reached by name: `app.card.list`, `parent.title`. `App`, capitalized,
is the class; the running instance is always `app`.

**A part does not reach up to its owner.** The class that places a part knows what the
part is for, so it wires it: it sets the part's attributes from its own state, and
supplies what the part does. Inside that class's body, `classroot` is the owner:

```declare
class Swatch extends Control [ width = 40, height = 40, cornerRadius = 20,
    tint: Color = gray,
    fill = { tint },
    picked() { },
    press() { this.picked() }
    ]

class Palette [
    chosen: Color = navy,
    layout: SimpleLayout [ axis = x, spacing = 10 ],
    Swatch [ tint = navy, picked() { classroot.chosen = this.tint } ],
    Swatch [ tint = seagreen, picked() { classroot.chosen = this.tint } ],
    Swatch [ tint = tomato, picked() { classroot.chosen = this.tint } ]
    ]

App [ width = 320, height = 130, fill = white,
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 14 ],
        palette: Palette [ ],
        preview: View [ width = 150, height = 40, cornerRadius = 8, fill = { app.col.palette.chosen } ]
        ]
    ]
```

`Swatch` knows nothing about palettes. It declares `picked()` and calls it when pressed;
each placement inside `Palette` says what picking means, with `classroot` as the palette.
A part that climbs to its owner instead — through `parent.parent`, or by searching the
tree — is tied to one arrangement of the tree, and breaks when that arrangement changes.

**A view used from far away gets one name on the App.** A path such as
`app.bar.tools.search` is checked by the compiler, so a change in the tree that breaks it
is a compile error, not a silent bug, but every use has to change with it. When a view
that exists once is used from several distant places, declare an alias on the App:

```declare-fragment
search: TextInput = { app.bar.tools.search },     // the one line that knows where it lives
```

Everything else says `app.search`.

## Where things go

- **The records** go in a [`Dataset`](declare-docs:Dataset), in the tree where its scope is — usually on the App.
  [Data](declare-docs:guide:data) is the chapter on datasets.
- **Where the user is** goes on the App, as declared attributes: the selection, the mode,
  the filters, what is open. There are few of these. They are what a person would name if
  you asked what they were looking at.
- **What the screen shows** is the App's tree of views, derived from the two above. A part
  of the design with a name of its own is a view class.
- **Logic with no view of its own** — a service that answers queries, a piece of state
  several views drive — is a class with no view, which extends [`Node`](declare-docs:Node). When that logic is about
  one dataset's records (what they derive, the rules every write must keep), the class is
  the dataset itself: it extends `Dataset`, which is a `Node` that holds data, and the App
  holds an instance.

The platform's own non-visual pieces follow the same rule. A [`Spring`](declare-docs:Spring) driving an
attribute, a [`Time`](declare-docs:Time) giving the clock, [`Keys`](declare-docs:Keys) hearing the keyboard, a [`DataSource`](declare-docs:DataSource)
fetching from a server: each is a member of the node that uses it, created with that
node and removed with it, so there is nothing to subscribe to and nothing to clean up.

Here is the skeleton of the tracker in `apps/tracker`, a list of issues searched,
filtered, sorted and edited in place, with most of each body left out:

```
schema Issue [ id: number, title: string, status: …, assignee?: string, … ]

class Issues extends DataSource [ url = "issues.json", auto = true, schema = [ issues[]: Issue ],
    statuses: string[] = [ … ],                    // what an issue can be
    statusLabel(s: string) -> string { … },
    all() -> Issue[] { … },
    byStatus: Dataset [ contents = { … } ],        // summaries derived from them
    workload: Dataset [ contents = { … } ],
    save(d: Issue) { … },                          // every write to them
    setEach(ids: number[], field: string, v: object) { … },
    removeEach(ids: number[]) -> array { … },
    restore(removed: array) { … }
    ]

class IssueRow extends ListRow [ … ]                 // the parts it has many of
class Chip extends Control [ … ]
class EditorCard [ … ]

App [
    issues: Issues [ … ],                          // the records

    query: string = "",                            // where the user is
    fStatus: string = "",
    sortOn: "updated" | "priority" | "title" = "updated",
    selection: Issue[] = [],
    editing: boolean = false,

    shown: Dataset [ contents = { app.project(…) } ],   // what the list shows
    draft: Dataset [ … ],                          // the editor's working copy

    performDelete() { … },                         // the verbs on the selection
    undoDelete() { … },

    bar: View [ … ],                               // the views
    tools: View [ … ],
    body: View [ … ]
    ]
```

The `Issues` class is where the records come from (`issues.json`) and everything that is
true of them whoever is looking: what statuses there are, the counts by status, who holds
the open work, what a save must also change. It extends `DataSource`, the dataset whose
data arrives from a server, and its writes go into the same records the fetch filled. The App holds
everything about this person's view of them: the query, the sort, the selection, the
draft. The list's `shown` dataset sits on the App, not on `Issues`, because it is derived
from the user's filters as much as from the records. A delete is one call to
`issues.removeEach`, and the App's `performDelete` adds what the user sees around it: the
selection clears and a toast offers Undo.

Inside any one node, the same question has smaller answers:

- A value that should stay true → a **constraint** on the attribute.
- A computed value used in several places → a **declared attribute** with a `{ }` default.
- Behavior on a node's own state → a **method** on it.

## When a class earns its place

There are two good reasons to make a class, and they are different.

- **Reuse.** The same structure appears more than once, or you need to name its type —
  to extend it, or to declare an attribute that holds one.
- **Readability.** A long declaration is making its parent hard to read. Pull it out as a
  class named for its role — `Toolbar`, `WeekColumn`, `DetailPanel`, `Issues` — and the
  parent reads as the design instead of a wall of brackets. A class can then live in its
  own file.

The second reason is not a compromise of the first. The point of naming things is to
keep the structure of the program visible; a class used once is often the clearest way to
do that. What does *not* earn a class is a single computed value: a URL built from a
record is a function call in a constraint, [`Image [ source = { iconFor(:code) } ]`](declare-docs:Image),
not a `class Icon` wrapped around it.

A class with no `extends` is a view. A class with no view extends `Node`, or `Dataset`
when it holds data, since a `Dataset` is a `Node` that holds data. Such classes are not a requirement. Many
programs have none, and an App holding a dozen facts and the methods that change them
reads well as it is. A class made only so that one exists moves the same lines somewhere
else and adds a name to look up. Promote a group of state and logic when it is a thing in
its own right: the rules for a kind of record, a service, state shared across the app with
rules it must keep, machinery several views drive. The App reads better without it.

```declare
class Die extends Node [
    sides: number = 6,
    last: number = 0,
    rolls: number = 0,
    roll() { last = 1 + Math.floor(Math.random() * sides); rolls = rolls + 1 },
    reset() { last = 0; rolls = 0 }
    ]

App [ width = 340, height = 90, fill = white, textColor = black,
    die: Die [ ],
    row: View [ x = 20, y = 24,
        layout: SimpleLayout [ axis = x, spacing = 10, align = center ],
        Button [ label = "Roll", primary = true, onClick() { app.die.roll() } ],
        Button [ label = "Reset", onClick() { app.die.reset() } ],
        Text [ text = { app.die.rolls == 0 ? "not rolled" : `${app.die.last} (roll ${app.die.rolls})` } ]
        ]
    ]
```

The die lives in the tree as a named member, so it has the same reach and lifetime as
anything else, and views read it and call it like any other member. What a `Node` class is
*not* is a wrapper around data: a list of records does not hide behind a class's getters
and verbs. It sits in a dataset that views bind to, and when the logic about those
records outgrows the App, the dataset itself becomes the class. A class with no view can also
stand on a record; [Data](declare-docs:guide:data@a-node-class-on-a-record) shows how.

## What script is for

A `script { … }` block is plain TypeScript outside the tree. It has three uses:

- **Functions of their arguments**: formatting, parsing, date arithmetic.
- **Code that is not yours**: an imported library.
- **The host's own APIs**, where the language does not cover one.

```declare
script {
    function fileSize(n: number): string {
        const units = ["B", "KB", "MB", "GB"]
        let i = 0
        while (n >= 1024 && i < units.length - 1) { n = n / 1024; i = i + 1 }
        return (i == 0 ? n : n.toFixed(1)) + " " + units[i]
    }
}

App [ width = 300, height = 100, fill = white, textColor = black,
    bytes: number = 1536000,
    col: View [ x = 20, y = 20,
        layout: SimpleLayout [ axis = y, spacing = 10 ],
        Text [ text = { fileSize(app.bytes) } ],
        Button [ label = "Double it", onClick() { app.bytes = app.bytes * 2 } ]
        ]
    ]
```

Script is outside the reactive system, and that decides what belongs there. The compiler
type-checks a script body but does not trace what it reads, so a constraint that calls
`fileSize(app.bytes)` depends on `app.bytes`, the value it passes, and never on anything
the function reads inside. A script
variable is not reactive, so state that changes belongs in an attribute. The app's model is
not script either: a derivation over your data is a method, on the App or on the
dataset's class, where the compiler can read through it. Nor is its look: a repeated
color or size is a theme token.

The host's APIs are where script differs from a `{ }` body. A body reaches the world through
members — a `DataSource` for a request, a `Time` for a repeating call, `afterDelay` for a
single later one — and the compiler refuses `fetch`, the timers and `globalThis` there. A
script block is not a body: when a program needs a host API the language does not cover, a
script function wraps it and a handler calls that.

A program may have several blocks, inline or loaded from files with
`script [ "helpers.ts" ]`; they share one scope, in source order. A block may `import` a
relative file or an npm package when a Node host compiles the program (the dev server,
`declarec`, `declare-verify`); the in-browser compiler refuses package imports. Script is
for code that *computes*; foreign code that *draws* goes in an island
([Embedding](declare-docs:guide:embedding)).

## Splitting a program into files

`include [ "parts.declare" ]` merges another file's declarations — its classes,
schemas, themes, styles and scripts — into the program, once, however many times it is
named. It is not a module system: there are no exports and no namespaces, just one
program. An included file declares no `App` of its own. Declarations can appear above
or below the `App`, and a class may extend one declared later. The standard library
needs no include; a bare [`Button [ … ]`](declare-docs:Button) finds it.

Use `include` to partition your own program, not only to share libraries: the theme in
one file, the classes in another, the dataset classes in a third, and the `App` left
holding where the user is and the tree it shows.

### An ordinary order

The top level takes its declarations in any order, and a class may extend one declared
further down, so order never changes what a program means. Most programs read well in
one ordinary order, top to bottom: `include` and `use`; `script`; the `schema`s; the
classes with no view, dataset classes first; the `theme` and `style` records; the view
classes, each part before the classes that place it; and the `App` last. A reader then
meets the data before the views that show it, and reaches the App knowing every class it
names.

It is a convention, not a rule. A program built around one large class may read better
with that class first, and a program split into files follows its files instead.

---

**What you can now do:** define classes with a view or without, put the records, the
user's place and the views each where they belong, decide when a part of the program
deserves a class and when script is the right tool, and split a program into files.

[Next: **Running and checking a program** →](declare-docs:guide:run-and-check)
