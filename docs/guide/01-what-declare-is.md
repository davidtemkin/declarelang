<!-- nav: Core concepts -->
<!-- part: Start here -->

# Core concepts

Declare is a language for user interfaces, the way SQL is a language for queries. It
is not a general-purpose language that UI code happens to be written in; it is a
notation for the interface itself. You describe a tree of components, the state they
hold, the data they show, and how their values relate to one another, and the runtime
keeps every relationship you stated true while the program runs.

Everything inside `{ }` is ordinary TypeScript. Everything inside `[ ]` is the
interface's structure. There is no stylesheet, no template language and no router
library — the program is the whole interface. Nor is there a build step between an
edit and the running result: save, reload, and the change is there. The examples in
this guide are live programs, each running beneath its source.

This chapter is an overview of the whole language. It shows one small program, names
the one idea the rest depends on, and then walks through a complete app layer by
layer, so that you know what an idiomatic Declare program looks like before you learn
any of its parts. Each layer names the chapter that teaches it.

## A program, running

Here is a complete program. It is running below its source; click the button.

```declare
App [ width = 400, height = 140, fill = darkslategray, textColor = whitesmoke,
    count: number = 0,
    col: View [ x = center, y = center,
        layout: SimpleLayout [ axis = y, spacing = 14, align = center ],
        Button [ label = "Add one", primary = true, onClick() { app.count = app.count + 1 } ],
        Text [ text = { `Clicked ${app.count} times` } ]
        ]
    ]
```

Read it from the top. [`App`](declare-docs:App) is the root. `count: number = 0` declares a piece of state.
The [`View`](declare-docs:View) holds a layout that stacks its two children and centers them. The [`Button`](declare-docs:Button)
comes from the standard library; its click handler assigns `count`. The [`Text`](declare-docs:Text) shows a
sentence built from `count`.

Now edit it. Change `darkslategray` to `midnightblue`, change the label, change
`width = 400` to `300` and watch the pair stay centered. Break something on purpose:
the compiler answers with a positioned error that names the rule and, for common
mistakes, the fix. **Revert** puts any example back.

The line that matters is the last one:

```declare-fragment
Text [ text = { `Clicked ${app.count} times` } ]
```

That `{ }` is a **constraint**:

> **A constraint is a standing relationship the runtime keeps true.**

The expression is not run once and forgotten. It reads `count`, so when the click
handler assigns `count`, the text follows. You did not subscribe to anything, request
a re-render, or tell the interface what to update. You said what the text should be;
keeping it that way is the runtime's job.

## The one shift

In most UI stacks an interface is a *sequence of moments*: something happens, code
runs, views update, and your job is to orchestrate the moments so nothing shows a
stale value. In Declare an interface is a *set of relationships*: each constraint
states something that should be true, and the runtime keeps every one of them true
while values change. The question you ask stops being "when does this run?" and
becomes "what does this depend on?" — and the source answers that at a glance.

Two sentences carry the whole runtime model:

> **Reading subscribes; assigning notifies.**

Read a value inside `{ }` and the constraint depends on it. Assign a value with plain
`=` and everything that read it follows. There is no second way to write state, so
there is nothing to forget. [Constraints](declare-docs:guide:constraints) is the
chapter on this.

If you come from React: there are no hooks, no dependency arrays, and nothing to
memoize. A re-render exists to reconcile an interface that has drifted from its state.
Here nothing drifts, so there is nothing to reconcile.

## A whole app, in Declare terms

The counter shows the idea. This program shows the shape of a real app: typed data, a
list built from it, library controls editing it, a count derived from it, and a
button that adds to it. Tick a box; add a task.

```declare
schema Task [ id: number, title: string, done: boolean ]

class TaskRow extends View [ width = 100%, height = 32,
    layout: SimpleLayout [ axis = x, spacing = 10, align = center ],
    Checkbox [ checked = :done, input(v: boolean) { :done = v } ],
    Text [ text = :title, textColor = { :done ? 0x8A96A0 : 0x172530 } ]
    ]

App [ width = 360, height = 260, fill = #F4F6FA, textColor = #172530,
    tasks: Dataset [ schema = [ items[]: Task ] ] {
        { "items": [ { "id": 1, "title": "Read the guide", "done": true },
                     { "id": 2, "title": "Write a program", "done": false },
                     { "id": 3, "title": "Ship it", "done": false } ] }
        },
    open: number = { (app.tasks.value?.items ?? []).filter((t) => !t.done).length },
    nextId: number = 4,
    add() {
        app.tasks.set("/items/-", ({ id: app.nextId, title: "Task " + app.nextId, done: false }))
        app.nextId = app.nextId + 1
        },

    card: Card [ x = 20, y = 20, width = 320,
        Text [ fontWeight = semibold, text = { app.open + " open" } ],
        list: View [ width = 100%, datapath = { app.tasks.value },
            layout: SimpleLayout [ axis = y ],
            TaskRow [ datapath = :items[] ]
            ],
        Button [ label = "Add a task", onClick() { app.add() } ]
        ]
    ]
```

Nothing in that program updates a view. Every layer of an idiomatic Declare app is
visible in it, and each one is a habit worth taking on from the start.

**Every piece of state has one home.** Records live in a **dataset** — here embedded,
often fetched — and the [`schema`](declare-docs:Dataset.schema) states the shape the program relies on, so the
compiler checks every read and the runtime checks every write. State that is not a
record, such as `nextId`, is a declared attribute. Nothing else holds a copy; everything
else reads it. When a group of state and behavior
is a thing in its own right — a cart, a selection, a session — it becomes a model
class with no view at all, and it can stand on a record of its own. The data chapters
are [Data](declare-docs:guide:data) and [Typed data](declare-docs:guide:schemas).

**Everything visible derives from that state.** `open` is a constraint over the
dataset; the heading reads `open`; each row's text color reads its record. Tick a box
and all of them follow in the same step, because each is a relationship, not a copy.

**Repeated structure comes from data, never from a loop.** `TaskRow [ datapath =
:items[] ]` says "one row per item." Add a record and a row appears; remove one and it
leaves; reorder them and the rows move with their records. There is no `.map()` and no
code that creates views. A `:path` such as `:title` reads a field of the row's own
record.

**Layouts arrange; you rarely place.** The card stacks its contents, the list stacks
its rows, each row lays out its checkbox and title. Positions come from layouts, and
sizes come from content unless you say otherwise. Hand-set `x` and `y` are for
free-form surfaces — a canvas, a diagram, an overlay. The chapter is
[Size, position and layout](declare-docs:guide:layout). The look works the same way:
colors and sizes the app repeats are tokens in a `theme`, read where they are used,
never constants copied into views ([Paint and themes](declare-docs:guide:paint-and-themes@themes)).

**Controls come from the library, and they hand edits back.** The [`Checkbox`](declare-docs:Checkbox) shows a
value it is given (`checked = :done`) and delivers the user's change through `input`,
which writes the record: `:done = v`. Every control follows that one pattern, and the
library ships the usual set, themed and keyboard-ready. A control you build yourself
extends [`Control`](declare-docs:Control) and inherits focus, keyboard activation and interaction states. See
[Controls](declare-docs:guide:controls).

**Handlers write facts, not their consequences.** A click assigns the value that
changed — a record field, an attribute on the app, or a view's own attribute, such as
a dragged window's `x` — and stops there. It never goes on to update what depends on
that value: the heading's count, a row's color and the list's height all follow on
their own. An attribute that is a constraint refuses an assignment, which keeps the
two jobs apart. That is why the program has no update code.

**The source is structured the way the design is.** `TaskRow` is a class because it
is a named part of the design, not because of a rule about reuse: a class makes the
tree read as what it is, and a long program splits into files the same way. See
[Components and the tree](declare-docs:guide:components).

**Time enters as a value, and nothing polls.** A [`Spring`](declare-docs:Spring) moves an attribute toward a
target; a [`Time`](declare-docs:Time) member makes the clock a set of facts constraints can read. There is
never a loop that checks whether something has happened: if a value depends on
another, you write the dependency, and the dependency is the notification. See
[Motion and states](declare-docs:guide:motion) and [Time](declare-docs:guide:time).

**Places have addresses.** An app's location is one attribute tied to the URL. Views
declare which location they show, links are attributes the compiler checks, and the
Back button works because state derives from the location rather than the other way
round. See [URLs, links and history](declare-docs:guide:urls).

## What it opens

Everything so far is about building ordinary interfaces with less machinery. The
larger claim is about what becomes easy. Watch what three constraints do when one of
the values they read starts moving:

```declare
App [ width = 360, height = 200, fill = white, textColor = black,
    open: boolean = false,
    t: number = 0,
    onClick() { open = !open },
    grow: Spring [ attribute = t, to = { open ? 1 : 0 }, stiffness = 150, damping = 20 ],
    card: View [ x = 20, y = 20, cornerRadius = 10, fill = darkslategray,
        width  = { 230 + (1 - t) * 90 },
        height = { 44 + t * 110 },
        title: Text [ x = 20, y = 10, textColor = white, fontWeight = bold, text = "Details" ],
        body: Text [ x = 20, textColor = darkgray,
            y = { 44 + t * 20 },
            opacity = { t },
            text = "the same card, seen closer" ]
        ]
    ]
```

Click it, then click again before it finishes. The card does not switch between a
closed layout and an open one; it *becomes* the other one, from wherever it is, and it
never ignores you mid-flight. There is no animation code. One number, `t`, is driven by
a spring, and the width, height and text are constraints that read it.

That is the door to the layer of interface quality people notice in the best native
software: a view that grows into the next view, motion that shows where things came
from, and everything interruptible. It keeps people oriented, it carries meaning, and
it has usually been specialist work. In Declare it is what the declarations already
do. [Animated arrangements](declare-docs:guide:animated-arrangements) takes it from one
card to whole layouts.

Two promises follow, and they are worth keeping apart. Everyday interfaces — forms,
settings, dashboards, admin tools — are the easy case, and none of this is required
to build them. High-craft interfaces are within reach of one person. The language
lowers the cost of building them; it does not do the design. Deciding what should
persist and what an in-between frame means is still design work.

## Why a language

A framework lives inside a general-purpose language, so the things it cares about —
components, state, what depends on what — are invisible to that language's compiler.
Making the interface's structure the language itself is what Declare is for. The
compiler sees the tree, reads every constraint's dependencies from its text, and
type-checks every expression against every component's real attributes, so most of
what would have been a quiet bug is an error before anything runs. What the compiler
can see, you can see too: a program reads as a tree of named things and stated
relationships.

Because the interface is one thing, several usual subsystems have nothing to do.
Styling is attributes on the tree, so there is no stylesheet and no cascade to debug.
Navigation is an attribute, so there is no router. Data is something views point at,
so there is no fetch-then-set-state choreography. Motion is a spring on an attribute,
so there is no motion library. And the outside world — a server, the clock, a delay —
arrives as members of the tree ([`DataSource`](declare-docs:DataSource), `Time`), not as host globals called from
code; a `{ }` body that names `fetch` or `setTimeout` is refused, with the member named.

It also reaches past the browser tab. The same program renders as DOM elements, as
pixels on a canvas, or in a native Mac application with no web view, held to the same
picture by a conformance suite ([Renderers and hosts](declare-docs:guide:renderers)).
The build runs the program headlessly and bakes what it renders into the page, so
crawlers read real content from a static host with no server-side rendering
([Packaging for production](declare-docs:guide:packaging)).

And it was designed for a time when much code is written by LLMs. The whole language
fits in [one file](declare-docs:spec:core) of about <!--stat:spec.tokens-->12,000<!--/stat--> tokens, small enough
to hand to an LLM whole, and the compiler's errors name the rule and the fix, so an
LLM's write-check-revise loop converges. Every property that makes the language
workable for a machine — small, regular, strictly checked — is a property you benefit
from first. [Writing with an LLM](declare-docs:guide:with-an-llm) is that workflow.

## What it costs

Declare is young, and this guide will not pretend otherwise. The first visit to a
live-editing page downloads the compiler, so it is slower than a framework site's
first load; production builds are precompiled and do not pay that cost. Accessibility
has a strong baseline on the default renderer — real text, native input fields,
keyboard focus — but deeper support such as ARIA roles and announcements is still
growing. The
component library is small and growing, and there is no decade of answers online. What
compensates is that the whole surface is small enough to know, and the compiler
answers most of the questions a corpus would.

## How to read this guide

The guide is written to be read in order, and every chapter's examples are live. It
is also written to be opened anywhere: each chapter says what it assumes and links to
where that is taught.

- **Start here** — this chapter, [the notation](declare-docs:guide:notation),
  [constraints](declare-docs:guide:constraints), and
  [running and checking a program](declare-docs:guide:run-and-check) — is the whole
  model and the working loop.
- **Building** covers real interfaces: components, layout, scrolling, controls,
  input, style, text, media, data, collections, custom components, overlays, and
  addresses.
- **Continuity** is motion, time, and arrangements that move as one.
- **Where it runs** covers renderers, hosts, and embedding.
- **Shipping and working** covers packaging, working with an LLM, and a full reading
  of the calendar app — <!--stat:calendar.code-->494<!--/stat--> lines of code, about
  <!--stat:calendar.total-->826<!--/stat--> with its comments — which you will be able to read end to end.
- **The appendix** holds the formatting rules, a glossary, and
  [a phrasebook for readers coming from React, CSS, SwiftUI and others](declare-docs:guide:coming-from).

If you are an LLM or an agent: the language itself is [one file](declare-docs:spec:core);
`npx declare-help <name>` answers any class, attribute or error code; and
`npx declare-verify <file>` checks a program from parse to boot. The whole-app section
above is the shape to aim for.

The page you are reading is a Declare app, and so is the calendar you will finish
on. Everything this guide claims, it demonstrates on itself.

[Next: **Notation** →](declare-docs:guide:notation)
