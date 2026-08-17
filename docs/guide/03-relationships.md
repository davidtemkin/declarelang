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
App [ fill = black, textColor = whitesmoke,
    v: number = 42,
    cool: Color = dodgerblue,
    warm: Color = turquoise,
    onClick() { v = (v + 30) % 100 },
    View [ x = 30, y = 30,
        layout: SimpleLayout [ axis = y, spacing = 20 ],
        Text [ fontSize = 70, fontWeight = bold, text = { `${v}` } ],
        Bar [ width = 300, value = { v },
            tint = { v < 50 ? cool : warm } ]
        ]
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

Two properties of that analysis are worth internalizing, because between them they
explain everything you will ever observe a constraint do.

**It collects *potential* reads, not observed ones.** `{ a ? b : c }` depends on all
three names — including whichever branch didn't run. You saw this in the opening
example: `tint = { v < 50 ? cool : warm }` re-evaluates when `warm` changes even while
`v` is 30 and the bar is showing `cool`; the recompute lands the same color and nothing
paints. That union-over-branches is deliberate, and it errs on the only safe side: an
extra edge costs a no-op recompute, while a missing edge would be a view showing a value
that has since moved on — the bug this chapter opened by abolishing. When the compiler
must choose, it subscribes.

**It follows calls all the way down — and pins what it finds to the receiver.** If
`total()` reads `this.price` and `this.qty`, then `{ card.total() }` depends on
`card.price` and `card.qty`: a method's reads are *re-based* onto the object you called
it on, however deep the call chain runs (recursion is handled; a cycle simply stops
adding). Reads inside callbacks count too — `{ items.filter(x => x.price > app.limit) }`
depends on `app.limit`, while `x`, the callback's own parameter, correctly does not.
And the standard library plays by the same rules: a library method has no Declare body
to read, so it *declares* its reactive effect to the compiler — user methods and
library methods are analyzed on the same footing, and the familiar builtins
(`Math.max`, `.toFixed()`, `.split()`) are known to read nothing reactive at all.

One asymmetry is worth meeting before it meets you. A declaration with a computed
default — `segIndex: number = { … }` — is a **formula, not a slot**: reading it inlines
its expression, so *its* dependencies quietly become yours. A set attribute —
`width = { … }` — is the opposite: a standing constraint that owns its slot, and
reading the slot subscribes to the slot. The practical difference shows up exactly
once: a computed default can make your constraint react to things you never named,
because you inherited its inputs.

Two consequences you will feel. It is **legible** — what a binding reacts to is never a
runtime mystery; the expression *is* the dependency list, and the extracted graph ships
with the program: the Inspector's *explain* view (end of this chapter) shows any
value's wired read-paths live. And it is **fast** — the edges are bound to their cells
once, at link time, so at runtime a tracked read is a plain field read, with no
tracking branch on the hot path.

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

One subtlety carries a real design rule, and the language draws a sharp line through it.

Assign to a slot that a **set constraint** owns — `width = { … }` — and the runtime
refuses the write outright: *"bound by a constraint … change what the constraint reads
instead."* You cannot clobber a standing relationship by accident. (Animators and states
*do* take a slot over, but by a sanctioned path that suspends the constraint and resumes
it, re-evaluated, when they are done.)

A **computed default** is the case to watch: `mode: string = { … }`, a declaration whose
default is an expression. It owns no slot, so there is nothing to protect — the write
simply lands, the formula is gone, and nothing warns you. If `mode` derives from
`app.location`, a handler that assigns `mode` directly works once and quietly
disconnects everything that made `mode` trustworthy.

So the rule, whichever kind of member it is: **derived state is never assigned** — change
its *inputs* instead. It returns with force in
[Where the user is](declare-docs:guide:location), where the state deriving from the URL
is what makes the back button work.

## What reactivity costs

The cost model is worth one paragraph, because it is the whole discipline. Only
**declared reactive attributes** participate: locals, loop counters, and plain objects
in `script { }` code carry zero reactive overhead. Tracked reads are prewired, so they
cost a field access. And writes **batch**: a tight loop that writes a reactive
attribute a thousand times is a thousand cheap sets and *one* cascade at the settle.
The rule that falls out — reactive attributes for UI state you want to propagate,
plain values for hot inner computation — will cover every performance question you
have for a long time.

## The settle — when your writes take effect

That word "settle" names the one timing fact the model asks you to hold. A handler's
writes do not take effect as you make them: while your handler runs, every read
answers with the world as it was when the handler started. When it returns,
everything it changed is applied *together* — constraints re-derive, views appear
and retire where data now says so, layout places, sizes update — one indivisible
step, run to completion, called the **settle**. Nothing paints in the middle of
one, which is why the interface is never half-updated, no matter how many
attributes one handler writes. Animation is not an exception but a user of it: a
spring writes its attribute once per frame, and each frame's writes get a settle
of their own — motion is many small settles, never one long one.

Almost always the right response to "I need to react to my own change" is: don't.
State what should be true with a constraint, and it is true after this settle and
every settle after it. But occasionally the work is irreducibly a *reading* of the
world your write creates — you added a row and need to aim a camera at where it
*landed*, a place only layout knows. For that, hand one step across the boundary:

```declare-fragment
addItem() {
    app.d.set(["items", 0], { label: "new" })
    afterSettle(app.showNewest)              // one step, on the far side of the landing
    },
showNewest() {
    app.frameOn(app.list.first)              // the new row is real, placed, and sized
    },
```

`afterSettle(step)` runs the step exactly once, when the settle your handler
triggered has closed — and before that state reaches the screen, so anything the
step writes lands in the same frame as the change itself; the user never sees the
in-between. It is tied to your change, not to a clock: no interval, no frame
callback, nothing left standing afterward. And if you catch yourself wanting it to
wait for something more — data arriving, motion finishing — stop: those are values
changing (`data.loaded`, `open.atRest`), and values changing is what constraints
are for.

One settle has no handler anywhere inside it: the first, when the program boots.
Its close is *delivered* instead — **`onReady()`**, an event on the App only, fires
once when the tree is standing and measured, before the first paint, so what it
does is in the first frame the user sees. Most apps never need it — readiness is
usually a value some binding derives from — so keep it for the genuinely
once-and-imperative: seed a camera, start a tour, open a socket.

## The one rule constraints obey

A constraint must read *specific, named* things — a named slot, a literal datapath —
so the compiler can wire it. When it can't name every read, that is a **blocking
compile error** (`DECLARE7001`, if you want to search for it) that names the rewrite
rather than a silent surprise. Five instincts trigger it:

- indexing by a runtime key (`this[someString]`) → name the slot, or move the lookup
  into a method the compiler can read through;
- building a datapath at runtime → that is data-binding's job
  ([chapter 9](declare-docs:guide:data));
- aggregating over the live view tree (`children.map(v => v.x)`) → that is what a
  `layout` is for ([chapter 5](declare-docs:guide:space));
- calling something the compiler can't see into (host interop, a function-valued
  attribute) → call an in-program method or a builtin — neither is a compromise,
  since both are read through;
- and the quiet one: **a slot reading itself.** `theme = { { ...theme, accent: red } }`
  looks like a harmless override and is a cycle by construction — the constraint
  invalidates itself on every run. The compiler refuses it and names the fix: derive
  from a *base* (`{ { ...app.theme, accent: red } }` — a different slot), never from
  the slot being defined.

In practice the friction rounds to zero — across every real Declare program in the
repository, all constraints are analyzable — and handler code is unrestricted
TypeScript whenever you genuinely need the dynamic case.

Two narrower binding modes exist beside the always-live `{ }`: `once` (evaluate at
init, keep the snapshot) and `immediate` (evaluate during construction). Reach for
plain `{ }` unless you specifically want a value frozen.

---

**What you can now say:** you can look at any binding and name what it reacts to, you
know why assignment is safe and which members the runtime will not protect, and you
know what reactivity costs
— which is to say, you now hold the whole runtime model. What remains is craft.

[Next: **The tree is the app** →](declare-docs:guide:tree)

---

You can watch this happen rather than take it on faith. Press **⌥⌘D** on any running
page to open the [Inspector](declare-docs:operational:inspector), click a value that a
constraint owns, and it shows you the expression that produced it and every value that
expression just read — updating as you interact. It is the fastest way to check that
your picture of what-depends-on-what matches the program's.
