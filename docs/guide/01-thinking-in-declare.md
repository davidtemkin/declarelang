<!-- nav: Start here -->
<!-- part: The idea -->

# Thinking in Declare

You build user interfaces, so you already have a working theory of what that costs:
one language for structure, another for style, a third for logic, a framework to keep
the three agreeing, and a build pipeline to hold it all together. This guide is about
a language built on a different theory — that an interface is *one thing*, and should
be written as one thing: an artifact you can hold whole, check whole, and carry whole
to wherever it runs. **Declare is a language for user interfaces the way SQL is a
language for queries**: not a general-purpose language that UI code happens to be
written in, but a notation for the thing itself. You describe an interface — a tree
of components, the state they hold, how they respond and relate — and the runtime
keeps every relationship you declared true while the program runs.

This chapter makes the case and shows you the idea running. The rest of the guide
teaches you to think in it — and "think in it" is the right phrase, because the
language asks for one genuine shift in how you picture an interface, and then pays
that shift back everywhere. By the end you will open a real calendar application —
four views, continuous zoom, drag-to-reschedule; 480 lines of code, about seven
hundred with its detailed comments — and understand all of it. That is the promise
this guide is structured around; hold it to it.

## Sixty seconds of proof

Here is a complete Declare program. It is running right now, just below its source —
click the button.

```declare
App [ width = 400, height = 140, fill = darkslategray, textColor = whitesmoke,

    count: number = 0,                               // reactive state

    add: View [ x = 20, y = 20, width = 120, height = 40, cornerRadius = 10, fill = royalblue,
        onClick() { count = count + 1 },
        Text [ x = 20, y = 10, text = "Add one" ]
        ],

    Text [ y = 80, x = { (parent.width - this.width) / 2 },
        text = { `Clicked ${count} times` }         // re-runs whenever count changes
        ]
    ]
```

Now edit it. Change `royalblue` to `tomato`. Change `"Add one"` to something else.
Change `width = 400` to `300` and watch the label re-center — nobody wrote
re-centering logic; the label's `x` is an *expression*, and expressions stay true.
Every example in this guide is like this one: live, editable, and running the real
compiler in your browser. Break one badly and the compiler answers with a
precise, positioned error naming the rule you broke; **Revert** puts any
example back the way it was. You are encouraged
to break things. It is the fastest way to learn where the edges are.

One idea carries this whole program, and the whole language:

> **A binding is a standing relationship the runtime keeps true.**

The two `{ … }` values are ordinary TypeScript expressions — but they are not run
once and forgotten. The label reads `count`, so when the click handler assigns
`count`, the label follows. The centering expression reads the widths, so when a
width changes, the position follows. You never subscribed to anything, never
requested a re-render, never told the interface what to update when. You said what
should be *true*; staying true is the runtime's job.

If you come from React, notice the shape of what you just didn't do. There is no
hook, no dependency array, nothing memoized, no stale value to chase. Not because
Declare hides that machinery — because in this model the machinery has no job to do.
A re-render exists to reconcile a UI that drifted from its state. Here, nothing
drifts.

## Nothing waits

The same fact has a second face, and it is the one imperative habit that survives
longest in people arriving from other tools: **a Declare program never checks
whether something has happened yet.** There is nothing to check. If a value depends
on another value, you write the dependency as a constraint, and the runtime
re-evaluates it the moment the other value changes — *the constraint is the
notification*. If you need to act when something finishes — a request landing, a
view arriving, layout settling — there is an event for it, delivered once, at the
moment it is true.

So any loop or timer that repeatedly *looks* at the program is a constraint or an
event written by hand, and it will be late, racy, and invisible to `explain`. Every
such loop is waiting for something specific; ask what, and depend on that instead:

| the reflex | what it was waiting for | the Declare form |
|---|---|---|
| poll until a fetch lands | the request's state | `visible = { data.loaded }`, or `onLoad` |
| poll until a view exists, or has a size | the tree settling | `onInit`, `onReady`, `afterSettle`, `onArrive` |
| poll a value until it changes | the value | a constraint on it |
| "wait 100ms, then read the geometry" | layout | `afterSettle(() => …)` — same frame, geometry real |
| tick to advance a cursor or a progress | time itself | an `Animator` (time → value) |
| tick to move something toward a target | a target | a `Spring` |
| tick to step a simulation | the previous value | a `Heartbeat` — the one legitimate per-frame handler |
| a timer to debounce input, or time out a request | a timing rule | `setTimeout` — legitimate, as a host chore |

Time, then, is only ever an *input*: a duration to animate over, a frame step to
integrate by, a timing rule to apply. The test for a `Heartbeat` in particular is
whether its handler uses the `dt` it was given — one that doesn't is not integrating
anything; it is polling, and the condition inside it names what it was really waiting
for. [Motion and states](declare-docs:guide:motion-and-states) has the three
time-based members and when each is the honest choice.

## Why a new language? Why now?

A framework lives inside a general-purpose language, so the things it cares about —
components, state, what depends on what — are invisible to that language's compiler.
They exist by convention, checked by nothing, reconstructed at runtime. Making the
interface's structure *the language itself* is what Declare is for: the compiler can
see the tree, see every binding's dependencies, type-check every expression against
every component's real interface — and reject, before anything runs, most of what
would have been a quiet bug. What the compiler can see, it can also keep small and
fast. And what it can see, *you* can see: a Declare program reads as what it is — a
tree of named things and stated relationships — not as instructions for building one.

Count what isn't in the stack anymore. No hooks, no dependency arrays, no
memoization. No stylesheet: styling is attributes on the tree, and though style
still flows downward — set a font once, everything beneath follows — there is no
CSS cascade riding along with it: no specificity arithmetic, no selector debugging.
No router object. No fetch-then-set-state choreography. No motion library. No
virtual DOM. No build pipeline between an edit and the running result — the
compiler is in the browser, which is why this page can run its own examples. None of that is
minimalism for its own sake. Each of those systems exists to bridge a gap between
languages that were never designed to describe an interface together. One language,
no gaps, nothing to bridge.

There is also a newer reason, and it is worth stating plainly: a growing share of
code is now written by machines, and Declare was designed in that light. The entire
language fits in [one file](declare-docs:spec:core) of about ten thousand tokens —
small enough to hand to an LLM whole, so it never has to guess from training-data
resemblance. The compiler answers mistakes with the rule and the exact position —
and, for the instincts it anticipates, the fix by name — so an LLM's
write-check-revise loop actually converges. But here is the part that matters even
if you never let an LLM near your code: **every property that makes the language
workable for a machine is a property you benefit from first.** Small enough to hold
in your head. Regular enough to read with confidence. Checked strictly enough that
what compiles is, far more often than you are used to, what you meant. The machine
story and the human story are the same story — the workflow, and what was built to
make it trustworthy, is [Writing with an LLM](declare-docs:guide:with-an-llm).

One more consequence of "one thing," and it lands a tier out. A re-render exists to
reconcile a UI that drifted from its state; **hydration** is the same reconciliation
one level up — between a server's render of your interface and the browser's second
render of the same thing. Both exist because the interface was assembled from parts
that have to be made to agree. When the interface is one expressible unit, small
enough to ship whole, there is nothing to reconcile at either scale: the compiler runs
the program at build time and serializes what it renders, so crawlers read that and
people get the app. You will still want a server for anything real — data, accounts,
the things a browser has no business owning — but not one whose job is your front end.
[Run, check, ship](declare-docs:guide:run-check-ship) shows the mechanism.

Two more consequences of "one thing," stated here because each gets a part of this
guide. A program with no substrate assumptions leaking in is not welded to the
browser: the same file renders as DOM elements, as pixels on a canvas, or inside a
**native Mac application** — real menus, a real window, no WebView anywhere. *Look
ma, no browser.* A conformance suite holds all three renderings to the same picture
and the same behavior; [Where it runs](declare-docs:guide:renderers) is that story.
And because the language owns navigation and history the way it owns style, a
finished app is a **citizen of the web** — real addresses you can hand to anyone, a
Back button that tells the truth, pages a crawler can read from a static host — with
no router and no server anywhere. That arrives where Building ends, in
[Where the user is](declare-docs:guide:location).

## What it opens

Everything above is about cost — the same interfaces, for less. The more interesting
claim is about *reach*. Watch what three of those standing relationships do when one
of the values they read starts moving:

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

Click it — then click again *before it finishes*. The card doesn't switch between a
closed layout and an open one; it **becomes** the other one, from wherever it is,
and it never ignores you mid-flight. Look at the source: there is no animation code.
One scalar `t` is driven by a spring, and the width, height, and text are
relationships that read it. Motion here isn't an effects layer painted over the
interface — it is the interface, continuing to be true while one of its inputs
moves.

That distinction is the door to the most prized layer of modern UX — the continuity
you feel in the best native software, where a view becomes the next view, motion
tells you what came from where, and everything stays interruptible. It matters for
unglamorous reasons: continuity keeps people oriented (a hard cut throws away the
user's sense of place and makes them rebuild it), motion carries real information,
and an interface that responds mid-gesture respects intent. That layer has always
been specialist work — bespoke motion code, one interaction at a time, locked to a
platform. In Declare it is what the declarations already do.

So the language makes two promises, and it is worth keeping them distinct. First:
**today's mainstream UX is the easy case.** Forms, settings screens, dashboards,
admin tools — Declare is built for them, with less machinery than you carry now,
and nothing about continuity is required to build them. Second: **today's
high-craft UX is within reach** — of one person, not a motion team. One honest
caveat keeps that second promise real: the language lowers the implementation
barrier, not the design bar. Deciding what should persist, what should morph, what
an in-between frame *means* — that is design thinking, and Declare makes it cheap
to express, not unnecessary to do. [Motion & states](declare-docs:guide:motion-and-states)
takes up both the thinking and the tools.

## What it costs

Declare is young, and this guide will not pretend otherwise. The first cold visit
to a live-editing page like this one downloads the compiler — production builds are
precompiled and pay no such cost, but the very first load of an editable page is
slower than a framework site's. Accessibility has a strong baseline on the default
renderer — real text, native input fields, built-in keyboard focus — but its depth,
ARIA roles and announcements, is still growing. There is no npm package; the
repository is the distribution, and the checkout is the toolchain. And the
ecosystem is one repository deep: the component library is small and actively
growing, and the language is still being shaped — in part by the people who show up
early and say what they found. If you need a decade of Stack Overflow answers,
that resource doesn't exist yet. What compensates is that the whole surface is
small enough to actually know, and the compiler answers most questions the corpus
would have.

## The road from here

The page you are reading is a Declare app. So is the [homepage](declare-docs:essay:why-declare),
and so is the calendar you'll finish on. Everything this guide claims, it
demonstrates on itself.

The guide has five parts and an appendix. **The idea** — this chapter and the two after it — gives
you the whole mental model: the two-bracket shape of every program, and the standing
relationships at its core. **Building** covers the craft of real interfaces — the
tree, space, style, interaction, data — and ends with your app becoming a citizen of
the web: addresses, history, and a Back button that tells the truth. **Continuity**
is the differentiator — motion, states, and the composed idiom where whole
arrangements move as one, on screens and under fingers. **Where it runs** is the
payoff of the portable artifact: three renderers, two hosts, and the boundaries
where apps embed in pages and in each other. **Working** is the working life: run
it, check it, ship it — then doing all of that with an LLM in hand, and finally the
calendar, read end to end.

Read it in order — each chapter stands on the ones before it, every chapter's
examples are live, and none of it is long. The one thing to bring is a willingness
to let go of the machinery you're used to compensating for. The machinery isn't
here. What's here is the interface, written down.

[Next: **Two brackets** →](declare-docs:guide:two-brackets)
