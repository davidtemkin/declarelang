<!-- nav: Start here -->
<!-- part: The idea -->

# Thinking in Declare

You build user interfaces, so you already have a working theory of what that costs:
one language for structure, another for style, a third for logic, a framework to keep
the three agreeing, and a build pipeline to hold it all together. This guide is about
a language built on a different theory — that an interface is *one thing*, and should
be written as one thing. **Declare is a language for user interfaces the way SQL is a
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

    add: View [ x = 20, y = 20, width = 108, height = 34, cornerRadius = 8, fill = royalblue,
        onClick() { count = count + 1 },
        Text [ x = 16, y = 8, text = "Add one" ],
        ],

    Text [ y = 74, x = { (parent.width - this.width) / 2 },
        text = { `Clicked ${count} times` },         // re-runs whenever count changes
        ],
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
make it trustworthy, is [chapter 12](declare-docs:guide:with-an-llm).

## What it opens

Everything above is about cost — the same interfaces, for less. The more interesting
claim is about *reach*. Watch what three of those standing relationships do when one
of the values they read starts moving:

```declare
App [ width = 360, height = 200, fill = white, textColor = black,
    open: boolean = false,
    t: number = 0,
    onClick() { open = !open },
    grow: Spring [ attribute = t, to = { open ? 1 : 0 }, stiffness = 150, damping = 22 ],
    card: View [ x = 24, y = 24, cornerRadius = 12, fill = darkslategray,
        width  = { 230 + (1 - t) * 90 },
        height = { 44 + t * 110 },
        title: Text [ x = 16, y = 14, textColor = white, fontWeight = bold, text = "Details" ],
        body: Text [ x = 16, textColor = darkgray,
            y = { 44 + t * 20 },
            opacity = { t },
            text = "the same card, seen closer" ],
        ],
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
to express, not unnecessary to do. [Chapter 9](declare-docs:guide:motion-and-modes)
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

The guide has four parts. **The idea** — this chapter and the two after it — gives
you the whole mental model: the two-bracket shape of every program, and the standing
relationships at its core. **Building** covers the craft of real interfaces: the
tree, space, style, interaction, and data. **Continuity** is the differentiator —
motion, modes, and the composed idiom where whole arrangements move as one.
**In practice** is the working life: the loop —
run it, check it, ship it — then doing all of that with an LLM in hand, and finally
the calendar, read end to end.

Read it in order — each chapter stands on the ones before it, every chapter's
examples are live, and none of it is long. The one thing to bring is a willingness
to let go of the machinery you're used to compensating for. The machinery isn't
here. What's here is the interface, written down.

[Next: **Two brackets** →](declare-docs:guide:two-brackets)
