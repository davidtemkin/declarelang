# Why Declare

The web has two surfaces. One is a **document** surface — content, pages, search
— which the DOM owns and always will. The other is an **application** surface,
which has spent two decades contorted onto that same document model, a framework
layered over it each time to supply the missing pieces and fight the substrate.

Declare is a language for the second surface — what HTML is to documents. You
compose a tree of components — views, text, buttons, lists, forms — set their
attributes, bind them to data, and handle events. The declarative layer is
small; **all real logic is ordinary TypeScript.** The one idea that changes how
you write everything:

> A binding is not a function you remember to re-run, but a standing
> relationship the runtime keeps true.

If you have written a UI before, you have fought the bug where you read a value
once and it goes stale. In Declare that bug is *unrepresentable*, because a
binding is an edge in a dependency graph, not a one-shot computation.

## The whole thing in one program

Read this top to bottom. It is a complete, runnable app.

```declare
App [ width = 400, height = 140, fill = white, textColor = black,

    count: number = 0,                                  // declared, reactive state

    add: View [ x = 20, y = 20, width = 108, height = 34, cornerRadius = 8, fill = royalblue,
        onClick() { classroot.count = classroot.count + 1 },   // a handler; the body is TypeScript
        Text [ x = 16, y = 8, text = "Add one", textColor = white ],   // white on the accent button
        ],

    Text [ y = 74,
        x    = { (parent.width - this.width) / 2 },     // re-centers as the window resizes
        text = { `Clicked ${count} times` },            // re-runs whenever count changes
        ],
    ]
```

There is no built-in `Button` — a button *is* a `View` with a fill and an
`onClick`, which is the point: you compose from a few primitives rather than reach
for a widget per case. Click it and the text updates itself; resize the window and
it re-centers. You wrote no update logic for either. Both `{ }` lines are
**constraints** — standing relationships the runtime keeps true. Nobody wired a
subscription; nobody called `setState`; nothing re-rendered a tree and diffed
it. `count = count + 1` *is* the setter — assigning to a reactive attribute fires
the cascade, and everything bound to `count` recomputes.

That is the whole feel of the language. The rest is detail.

## Two delimiters carry the entire model

```declare
Text [ text = "OK",        color = navy,   x = { parent.x }, label = :title ]
//    └── [ ] holds members ──┘  └ literal ┘  └ { } is TypeScript ┘  └ :path from data ┘
```

- **`[ … ]` holds a component's members** — its attributes, its children, and
  (in a class) its declarations. The bracket nesting *is* the view tree; you read
  an app's structure by scanning it.
- **`{ … }` is TypeScript** — a value expression, a method body, a `script`
  block. When you see `{`, you have stepped into TypeScript until the matching
  `}`.

And there is exactly one rule for values, visible at a glance with no editor
coloring:

| you write | it is | example |
|---|---|---|
| a **bare** value | a literal | `width = 100%`, `fill = navy`, `count = 12` |
| a **`{ … }`** value | a live TypeScript expression (a *constraint*) | `width = { parent.width - 10 }` |
| a **`:`-prefixed** path | a read from bound data | `text = :title` |

Bare means it doesn't re-evaluate; braces mean it does; a leading `:` means it
comes from data. That seam is a contract both ways. In a bare slot the compiler
is free to read `100%` as a `Length`, `#1E3A49` as a `Color`, `navy` as a named
colour. Inside `{ }` that freedom **stops** — you are in plain TypeScript, an
identifier means exactly what TypeScript says, and the compiler never silently
reinterprets one.

## What is genuinely different here

Coming from React, Flutter, SwiftUI, or the DOM, these are the defaults Declare
inverts. Each has its own chapter; here is the map.

- **Reactivity is by construction, not by hooks.** A `{ }` constraint's
  dependencies are extracted **statically, by the compiler**, from the text of the
  expression. There are no dependency arrays to keep in sync, no `useEffect`, no
  re-render pass. Reading `parent.width` or `count` inside the braces *is* the
  subscription. → [Constraints](21-constraints.md)

- **`=` is the reactive setter.** `count = count + 1` in a handler notifies
  everything bound to `count`. There is no `setState`, no `setAttribute`, and no
  raw-write escape hatch that silently skips the cascade. Reads are symmetric —
  a bare `.x` is the tracked read. → [Constraints](21-constraints.md)

- **Composition is the hierarchy, and components are classes.** You write
  one-off structure inline; you extract a `class` only for genuine reuse. A single
  computed attribute is a small function, not a wrapper class. → [Composition](20-composition.md)

- **Layout is a swappable *attribute*, not a container type.** Every view is
  generic; *how* its children arrange is a reactive `layout:` slot you set — and
  can swap, constrain, or animate. Not a `<simplelayout>` child (OpenLaszlo), not
  a `VStack` type (SwiftUI/Flutter). → [Layout](25-layout.md)

- **Modes are declarative override bundles.** A `State` is a named, reversible
  bundle of overrides plus conditional children, switched by one boolean —
  reverting cleanly when the condition lifts. The "set it on enter, forget to
  unset it on exit" bug can't be written. → [States](24-states.md)

- **Data drives the tree.** A `datapath` sets a cursor; descendants read `:path`
  fields relative to it; a path that matches many records *replicates* one subtree
  per record. A `DataSource` exposes its own `.loading` / `.loaded` / `.failed`
  lifecycle as reactive state — but its `.fetch()` is **explicit** (no auto-load).
  → [Data](26-data.md)

- **Styling is inherited through `prevailing` slots.** Set `fontFamily` or a
  `theme` record high in the tree; every descendant follows it until one
  overrides. → [Prevailing](22-prevailing.md)

## How this guide is organized

Read Part I for orientation, then the [tutorial](10-tutorial.md) builds one
small app end to end. Part II is the Fundamental Concepts — the eight ideas above,
one chapter each, in the order they build on one another. Part III goes In Depth
on animation, text and Markdown, sizing, fonts, and input. Throughout, the guide
teaches the *idiom*; the generated reference carries every attribute, type, and
default.
