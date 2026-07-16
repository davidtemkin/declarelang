# The shape of Declare

You have decided to learn the language, so this guide skips the sales pitch — the
homepage and its [*Why* essay](declare-docs:essay:why-declare) make the case that
the web's application surface deserves its own language. This chapter gives you the
mental model instead, and it starts with proof.

## One program, whole

Here is a complete app — run it, click the button, then change a value and watch
what follows. In the docs it runs right here and you can edit it in place; on disk,
save it to `my-apps/` and browse to its URL.

```declare
App [ width = 400, height = 140, fill = #1E3A49, textColor = whitesmoke,

    count: number = 0,                               // reactive state

    add: View [ x = 20, y = 20, width = 108, height = 34, cornerRadius = 8, fill = #2E6BE6,
        onClick() { classroot.count = classroot.count + 1 },
        Text [ x = 16, y = 8, text = "Add one" ],
        ],

    Text [ y = 74, x = { (parent.width - this.width) / 2 },
        text = { `Clicked ${count} times` },         // re-runs whenever count changes
        ],
    ]
```

Click the button and the label updates. Resize the window and the label re-centers.
You wrote no code to make either happen — and that is the one idea the whole
language turns on:

> **A binding is a standing relationship the runtime keeps true.**

The two `{ … }` lines are **constraints**. They do not run once and freeze; the
runtime re-runs each one whenever a value it reads changes. The label reads `count`,
so `count = count + 1` in the handler is all it takes — you change the value, and
everything that shows it changes with it. You never subscribed anything, never called
`setState`, never asked for a re-render. The everyday bug where you read a value once
and it quietly goes stale is not something you guard against here; there is no way to
write it.

The button here is hand-built — a `View` with a fill and an `onClick` — not because
you have to build your own. The standard library ships a themed
[`Button`](declare-docs:guide:controls) you would normally reach for. The point is
what that `Button` *is*: an ordinary Declare class, the same kind of thing as the
view above. There is no separate widget layer and no component language off to the
side — a control is only ever a view someone composed, whether that someone is you
or the library.

## Two delimiters carry the whole model

Everything you read in a Declare program is one of two things, and you can tell
which at a glance, with no editor coloring:

```declare-fragment
Text [ text = "OK",        color = navy,   x = { parent.x }, label = :title ]
//    └─ [ ] holds members ─┘  └ literal ┘  └ { } is TypeScript ┘  └ :path from data ┘
```

- **`[ … ]` holds a component's members** — its attributes, its children, and (in a
  class) its declarations. The bracket nesting *is* the view tree; you read an app's
  structure by scanning it.
- **`{ … }` is TypeScript** — a value expression, a method body, a `script` block.
  When you see `{`, you have stepped into ordinary TypeScript until the matching `}`.

And there is exactly one rule for values:

| you write | it is | example |
|---|---|---|
| a **bare** value | a literal, set once | `width = 100%`, `fill = navy`, `count = 12` |
| a **`{ … }`** value | a live TypeScript expression (a **constraint**) | `width = { parent.width - 10 }` |
| a **`:`-prefixed** path | a read from bound data (a **datapath**) | `text = :title` |

Bare means it does not re-evaluate; braces mean it does; a leading `:` means it
comes from data. That seam is a contract both ways. In a bare slot the compiler owns
a small literal vocabulary — `100%` is a `Length`, `#1E3A49` is a `Color`, `navy` is
a named color. Inside `{ }` that freedom **stops**: you are in plain TypeScript, an
identifier means exactly what TypeScript says, and nothing is silently reinterpreted.

## What this buys — the promise of this guide

You have just run one Declare app. The reason a whole language is worth building
around that one idea is what it makes *sayable* once things move. Because layout,
modes, motion, and data all derive from the same constraints, **continuity becomes
the grain, not the garnish** — a view doesn't switch to the next screen so much as
*become* it.

The far end of that is `apps/calendar/calendar.declare` — about 700 lines —
whose month view folds into its week and its year as one continuous surface, every
mid-flight frame a real layout rather than a crossfade. Don't take the claim on the
page; run it yourself — open `apps/calendar/calendar.declare` in your running
distro and drag it between its views. By the end of this guide you can read — and
write — the program that does that, built from the same handful of ideas the counter
already showed you.

## The defaults Declare inverts

Coming from React, SwiftUI, or the DOM, these are the defaults that flip. Each has
its own chapter; this is the map.

- **Reactivity is by construction, not by hooks.** A constraint's dependencies are
  extracted *statically, by the compiler*, from the text of the expression. Reading
  `parent.width` or `count` inside the braces *is* the subscription — no dependency
  arrays, no `useEffect`. → [Constraints](declare-docs:guide:constraints)
- **`=` is the reactive setter.** `count = count + 1` notifies everything bound to
  `count`; there is no raw-write escape hatch that skips the cascade, and a bare read
  is the tracked read. → [Constraints](declare-docs:guide:constraints)
- **Composition is the hierarchy; components are classes.** You write one-off
  structure inline and extract a `class` only for real reuse. → [The tree](declare-docs:guide:tree)
- **Reach is four nouns.** `this`, `parent`, `classroot`, `app` — and
  `this`-vs-`classroot` is the mistake worth learning early. → [Reach](declare-docs:guide:reach)
- **Layout is a swappable *attribute*, not a container type.** Every view is generic;
  *how* its children arrange is a reactive slot you set, swap, or animate — not a
  `VStack` type. → [Space](declare-docs:guide:space)
- **Modes are declarative override bundles.** A `State` is a named, reversible bundle
  of overrides, switched by one boolean, reverting cleanly when the condition lifts.
  "Set on enter, forget to unset on exit" can't be written. → [Continuity](declare-docs:guide:continuity)
- **Data drives the tree.** A datapath sets a cursor; descendants read `:path` fields
  relative to it; a path matching many records *replicates* one subtree per record.
  → [Data](declare-docs:guide:data)
- **Styling is inherited through prevailing slots.** Set a `theme` record or
  `fontFamily` high in the tree; every descendant follows until one overrides.
  → [Appearance](declare-docs:guide:appearance)

## How this guide is organized

The [tutorial](declare-docs:guide:tutorial) is next: hands on the keyboard, one small
app end to end, before any theory. (If you have not cloned and started the server yet,
that chapter's first step is the [getting-started](declare-docs:operational:getting-started)
page.) Part II then takes the ideas above one chapter each, in the order they build on
one another. Part III goes in depth — animation, text, sizing, fonts, input — and Part
IV is the loop: checking, shipping, and a guided tour of the calendar.

Throughout, the guide teaches the *idiom*. When you need the exhaustive fact — every
attribute, type, and default — that is the [reference](declare-docs:reference:index);
when you want the whole language stated once, terse, it is [`declare.md`](declare-docs:spec:core).
