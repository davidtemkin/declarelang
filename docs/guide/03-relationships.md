<!-- nav: Relationships -->
<!-- part: The idea -->

# Standing relationships

Here is the shift this part of the guide exists to make. In the stacks you know, an
interface is a *sequence of moments*: something changes, code runs, views update — and
your job is to orchestrate the moments so nothing shows stale. In Declare an interface
is a *set of relationships*: each `{ }` value states something that should be true, and
the runtime's whole job is keeping every one of them true while values move. You stop
asking "when does this run?" — the question that spawns effects, dependency arrays, and
render timing — and start asking "what does this depend on?", which the source answers
at a glance.

> **Reading subscribes; assigning notifies.**

That sentence is the entire runtime model. Read a reactive value inside braces and you
are subscribed to it. Assign to one — plain `=` — and everything that read it follows.

## Predict, then click

Read this program before you run it. One handler bumps `v`. **Which of the three
things below it change when you click — the number, the bar's length, the bar's
color?**

```declare
App [ fill = #0B141B, textColor = whitesmoke,
    v: number = 42,
    cool: Color = dodgerblue,
    warm: Color = turquoise,
    onMouseDown() { v = (v + 17) % 100 },
    View [ x = 28, y = 26,
        layout: SimpleLayout [ axis = y, spacing = 18 ],
        Text [ fontSize = 72, fontWeight = bold, text = { v + "" } ],
        Bar [ width = 300, value = { v },
            tint = { v < 50 ? cool : warm } ],
        ],
    ]
```

Now click anywhere in the preview. If you said all three — including the color, which
only *sometimes* changes value but always tracks the relationship `v < 50` — you are
already thinking in Declare. Three constraints read `v`; one assignment moved it; three
edges of one dependency graph fired. You wrote no update logic for any of them, and
there is nothing you could have forgotten to write: the everyday bug where a view shows
a value that has since moved on is not something you guard against here. There is no
way to express it.

## The compiler reads your dependencies

Most reactive systems discover dependencies by *running* your code under read-tracking.
Declare does not. **A constraint's dependencies are extracted statically, by the
compiler, from the text of the expression.** The dependencies of `{ a ? b : c }` are
exactly `a`, `b`, `c` — read straight off the source, by the compiler and by you. Where
a constraint calls a method, the compiler reads *through* the call: bind
`{ app.buildModel() }` and you depend on whatever `buildModel` reads, transitively,
extracted for you. Calling methods from constraints is idiomatic, not cheating.

Two consequences you will feel. It is **legible** — what a binding reacts to is never a
runtime mystery; the expression *is* the dependency list. And it is **fast** — the
wiring happens at compile time, so at runtime a tracked read is a plain field read, with
no tracking branch on the hot path.

> **From SwiftUI:** the mental model is close — declarative values the framework keeps
> current — but there is no `body` being recomputed and diffed, and no property-wrapper
> taxonomy. `count: number = 0` is `@State`, a plain attribute set from outside is a
> binding, and a computed attribute is `{ }` — one mechanism where SwiftUI has several,
> and updates flow through the graph without re-evaluating the tree around it.

## `=` is the setter — and assignment wins

Inside any `{ }` body, assigning to a reactive attribute *is* the reactive setter:
`count = count + 1` updates the value and notifies every binding that read it. There
is no `setState`, no separate notify call, and — just as important — **no raw write
that skips the cascade**. One way to write, always correct. Reads are symmetric: a
bare `count` is the tracked read; there is no `getAttribute` either.

One subtlety carries a real design rule. Assigning to a slot that *has* a constraint
**displaces the constraint** — the slot holds your written value from then on, and the
relationship is gone. That is occasionally what you want (seed a value, then take over
by hand). But it means **derived state should never be assigned** — change its
*inputs* instead. If `mode` derives from `app.location`, a handler that assigns `mode`
directly works once and quietly disconnects everything that made `mode` trustworthy —
the derivation is dead from that write on. This rule returns with force in
[chapter 11](declare-docs:guide:loop), where the state deriving from the URL is what
makes the back button work.

## What reactivity costs

The cost model is worth one paragraph, because it is the whole discipline. Only
**declared reactive attributes** participate: locals, loop counters, and plain objects
in `script { }` code carry zero reactive overhead. Tracked reads are prewired, so they
cost a field access. And writes **batch**: a tight loop that writes a reactive
attribute a thousand times is a thousand cheap sets and *one* cascade at the flush.
The rule that falls out — reactive attributes for UI state you want to propagate,
plain values for hot inner computation — will cover every performance question you
have for a long time.

## The one rule constraints obey

A constraint must read *specific, named* things — a named slot, a literal datapath —
so the compiler can wire it. Three instincts violate that, and each is a compile
error that names the rewrite rather than a silent surprise:

- indexing by a runtime key (`this[someString]`) → name the slot, or move the lookup
  into a method the compiler can read through;
- building a datapath at runtime → that is data-binding's job
  ([chapter 8](declare-docs:guide:data));
- aggregating over the live view tree (`children.map(v => v.x)`) → that is what a
  `layout` is for ([chapter 5](declare-docs:guide:space)).

In practice the friction rounds to zero — across every real Declare program in the
repository, all constraints are analyzable — and handler code is unrestricted
TypeScript whenever you genuinely need the dynamic case.

Two narrower binding modes exist beside the always-live `{ }`: `once` (evaluate at
init, keep the snapshot) and `immediate` (evaluate during construction). Reach for
plain `{ }` unless you specifically want a value frozen.

---

**What you can now say:** you can look at any binding and name what it reacts to, you
know why assignment is safe and when it displaces, and you know what reactivity costs
— which is to say, you now hold the whole runtime model. What remains is craft.

[Next: **The tree is the app** →](declare-docs:guide:tree)

---

You can watch this happen rather than take it on faith. Press **⌥⌘D** on any running
page to open the [Inspector](declare-docs:operational:inspector), click a value that a
constraint owns, and it shows you the expression that produced it and every value that
expression just read — updating as you interact. It is the fastest way to check that
your picture of what-depends-on-what matches the program's.
