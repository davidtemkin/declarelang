<!-- nav: Constraints -->
<!-- part: Start here -->

# Constraints

A constraint is an attribute value written in braces: `width = { parent.width - 40 }`.
It is re-evaluated when, and only when, something it reads changes, and it stays true
from then on. This chapter is how that works: what a constraint depends on, what
happens when you assign, when your writes take effect, and the one rule a constraint
has to obey. Together they are the whole runtime model.

> **Reading subscribes; assigning notifies.**

Read a reactive value inside `{ }` and the constraint depends on it. Assign one with
plain `=` and everything that read it follows.

## Predict, then click

Read this program before you run it. One handler changes `v`. **Which of the three
things below it change when you click — the number, the bar's length, the bar's
color?**

```declare
App [ width = 360, height = 170, fill = black, textColor = whitesmoke,
    v: number = 42,
    cool: Color = dodgerblue,
    warm: Color = tomato,
    onClick() { v = (v + 30) % 100 },
    col: View [ x = 30, y = 24,
        layout: SimpleLayout [ axis = y, spacing = 16 ],
        Text [ fontSize = 56, fontWeight = bold, text = { `${v}` } ],
        View [ height = 14, cornerRadius = 7, width = { 30 + v * 2.7 },
            fill = { v < 50 ? cool : warm } ]
        ]
    ]
```

Click anywhere in the preview. All three follow: three constraints read `v`, one
assignment moved it. The color only sometimes changes value, but it always tracks the
relationship `v < 50`. You wrote no update logic, and there is nothing you could have
forgotten to write: a view showing a value that has since moved on is not something
you guard against here, because there is no way to express it.

## The compiler reads the dependencies

Most reactive systems discover dependencies by *running* your code and watching what
it reads. Declare does not. **A constraint's dependencies are read from its text by
the compiler.** The dependencies of `{ a ? b : c }` are exactly `a`, `b` and `c`, and
you can see that as well as the compiler can.

Three properties follow.

- **It collects every read the expression could make, not just the ones it made
  last time.** `fill = { v < 50 ? cool : warm }` depends on `warm` even while `v` is 30.
  If `warm` changes then, the constraint re-runs, lands on the same color, and nothing
  repaints. An extra dependency costs a harmless re-run; a missing one would be a stale
  view, so the compiler errs on the safe side.
- **It reads through method calls.** Bind `{ app.buildModel() }` and the constraint
  depends on whatever `buildModel` reads, however deep the calls go. Calling methods
  from constraints is normal. Reads inside callbacks count too:
  `{ items.filter((x) => x.price > app.limit) }` depends on `app.limit`.
- **It is fast.** Each dependency is wired once, when the program links, so at run
  time a read is a plain field read.

Because the dependency list is the expression, the graph is also something you can
inspect in a running program: the Inspector, at the end of this chapter, shows what
any value read.

> **From SwiftUI:** the model is close — declarative values the framework keeps
> current — but there is no `body` being recomputed and diffed, and no family of
> property wrappers. `count: number = 0` is `@State`; an attribute set from outside is
> a binding in SwiftUI's sense; a computed value is `{ }`.

## `=` is the setter

Inside any `{ }` body, assigning an attribute is the reactive write: `count = count + 1`
updates the value and notifies everything that read it. There is no `setState`, no
separate notify call, and no raw write that skips the notification. A bare `count` is
the tracked read; there is no getter to call either.

Assignment meets constraints in two ways, and both come down to one rule.

**An attribute set with a constraint refuses a direct write.** If a view says
`width = { … }`, a handler that assigns `width` is refused at run time: "bound by a
constraint — a direct write would be silently overwritten; change what the constraint
reads instead." You cannot clobber a standing relationship by accident. (Springs,
animators and states can take an attribute over, but through a sanctioned path that
suspends the constraint and hands the attribute back when they finish.)

**A declaration with a computed default is a formula, not a guard.** A declared
attribute whose default is an expression — `mode: string = { … }` — reads as that
expression until something assigns it. An assignment replaces the formula, silently,
and from then on the attribute no longer follows its inputs. That is occasionally what
you want (a value that starts derived and becomes the user's), and usually a bug.

The rule, for either kind: **derived state is never assigned. Change its inputs
instead.** It matters most in [URLs, links and history](declare-docs:guide:urls),
where state derived from the URL is what makes the Back button work.

## What reactivity costs

Only declared reactive attributes take part. Local variables, loop counters and plain
objects inside a method or a `script` block carry no reactive overhead. A tracked
read costs a field access. Writes are batched: a loop that writes an attribute a
thousand times is a thousand cheap assignments and one round of updates at the end.
The practical rule — reactive attributes for state you want to propagate, plain values
for hot inner computation — covers almost every performance question.

## The settle: when writes take effect

A handler's writes do not take effect one at a time. While a handler runs, every read
sees the world as it was when the handler started, except that an attribute you wrote
reads back as written. When the handler returns, everything it changed is applied
together: constraints re-evaluate, views that data added appear and views it removed
leave, layouts place, sizes update. That single step is called the **settle**. Nothing
paints in the middle of one, which is why an interface is never half-updated however
many attributes one handler writes. Animation works the same way: a spring writes its
attribute once per frame, and each frame's writes get a settle of their own.

Almost always, the right response to "I need to react to my own change" is not to.
State what should be true as a constraint, and it is true after this settle and every
one after it. Occasionally, though, the work really is a *reading* of the world your
write creates — you added a row and want to bring it into view, which depends on where
layout put it. For that, hand one function across the boundary:

```declare-fragment
addItem() {
    app.log.set("/rows/-", ({ text: "new" }))
    afterSettle(app.showNewest)               // runs once, after this change has landed
    },
showNewest() {
    app.list.scrollTo(Infinity)               // the new row is placed and sized by now
    },
```

`afterSettle(fn)` runs `fn` once, when the settle your handler caused has
closed, and before that state reaches the screen, so whatever it writes lands in
the same frame. It is tied to your change, not to a clock. (Work that genuinely is about
the clock — dismiss a notice after eight seconds — is `afterDelay(ms, fn)`, in
[Time and change events](declare-docs:guide:time@later-once-afterdelay).) If you find yourself
wanting it to wait for something else — data arriving, motion finishing — those are
values changing (`source.loaded`, `spring.arrived`), and a value changing is what a
constraint is for.

One settle has no handler inside it: the first, when the program boots. The App's
**`onReady()`** handler runs once when that settle closes, with the tree standing and
measured, before the first paint. Most apps never need it; keep it for things that are
genuinely once-and-imperative, like opening a socket or starting a tour.

## The one rule constraints obey

A constraint must read *named* things — an attribute, a record field written as a
path — so the compiler can wire it. When it cannot name what an expression reads,
that is a compile error (`DECLARE7001`) that names the rewrite. The common cases:

- **Indexing by a runtime key**, `this[someName]` — name the attribute, or move the
  lookup into a method the compiler can read through.
- **Aggregating over the live view tree**, `children.map((c) => c.width)` — arranging
  children is a layout's job ([Size, position and layout](declare-docs:guide:layout@what-a-layout-places-belongs-to-the-layout)),
  and counts come from data, not from views.
- **Passing a node into a `script` function** — script is outside the reactive
  system, so a constraint depends only on the values it passes. Pass the values
  (`fmt(this.width)`), or make it a method.
- **A value reading itself**, `theme = { { ...theme, accent: red } }` — a cycle by
  construction. Derive from a different source, such as `app.theme`.

Across every program in the repository, all constraints are analyzable; in practice
the rule rarely bites. Handler and method bodies are unrestricted TypeScript.

---

**What you can now say:** you can look at any constraint and name what it reacts to,
you know why assignment is safe and which values it must never touch, and you know when
a handler's writes take effect. That is the whole runtime model.

You can watch it happen instead of taking it on faith. Press **⌥⌘D** on any running page
to open the [Inspector](declare-docs:operational:inspector), click a value that a
constraint owns, and it shows the expression that produced it and every value that
expression read, updating as you interact.

[Next: **Running and checking a program** →](declare-docs:guide:run-and-check)
