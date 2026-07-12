# Constraints — reactive by construction

This is the heart of the language. A `{ }` in a value slot is a **constraint** —
a live expression the runtime keeps true by re-evaluating it when, and *only*
when, its inputs change. You never declare the inputs; reading them *is* the
subscription.

```declare
Text [ x     = { (parent.width - this.width) / 2 },   // re-centers on resize
       color = { selected ? #FFFFFF : #AAAAAA },       // recolors on select
       text  = { `Clicked ${count} times` } ]          // reruns whenever count changes
```

Reading `parent.width`, `selected`, or `count` inside the braces makes the
constraint depend on it. There is **no dependency array, no `useEffect`, no
re-render.** If a sentence in a React or Solid file would be a hook plus a
dependency list plus a memo, in Declare it is one `{ }` expression, and the list
of dependencies is the expression itself.

## What makes this different: the compiler reads the dependencies

Most reactive systems discover dependencies by *running* your code under
read-tracking (Solid, Vue, MobX, Signals). Declare does not. **A constraint's
dependencies are extracted statically, by the compiler, from the text of the
expression** — the wiring happens at build time, and at runtime the read inside
the constraint is a plain field read. (The full model — what counts as an
analyzable expression, and why this is tractable when Svelte retreated from it —
is in [constraints.md](../../design/constraints.md).)

Two things follow that you will feel:

- **It is legible.** The dependencies of `{ a ? b : c }` are exactly `a`, `b`,
  `c` — read straight off the source; and where a constraint calls a method, the
  compiler extracts the deps *through* the call, so the full set is always
  **answerable by tooling** ("what depends on this?"). Statically known either way,
  the silent-illegible-dependency class of bug is structurally impossible.
- **It is fast.** No per-run dependency rebuild, no per-read tracking branch on
  the hot path. A constraint re-running across many nodes at 60fps just
  recomputes and applies.

The trade, stated honestly: a constraint may only be an **analyzable
expression**. It can read reactive slots and datapaths, use operators and
ternaries, and **call methods** — the compiler reads *through* the call, into the
method's body and everything it calls, to find the reactive state it touches. So
`{ app.buildModel() }` is a real dependency on whatever `buildModel` reads
(`this.year`, the events data, …), extracted for you; you don't hand-thread it. The
one rule is that every reactive read must have a **statically-known target** — a
named slot or a literal datapath. What a constraint may *not* do is read through a
target the compiler can't name: an index by an unbounded runtime key
(`this[someString]`), a datapath built at runtime (`data.read([key])`), or an
aggregation over the live *node* tree (`children.map(v => v.x)`). Those are a
compile error pointing at the expression, and their genuinely-dynamic reactivity
moves off the constraint surface onto a framework primitive (`layout`,
data-binding) or an imperative handler. In practice this is near-zero friction:
measured across every real Declare program, **100% of constraints are analyzable**.

## `=` is the setter — writing is symmetric

Inside a `{ }` body, **assigning to a reactive attribute *is* the setter.** It
fires the cascade. There is no separate notify call, and — crucially — no raw
write that skips it:

```declare
onClick() { count = count + 1 },   // not a local write — everything bound to count updates
```

This is a real departure from Declare's ancestor and from most of the DOM world.
OpenLaszlo needed an explicit `setAttribute('count', v)`; a bare `count = v`
silently bypassed reactivity (its own docs called such a button *"evil"*).
Because Declare is statically typed and compiled, the compiler *knows* `count` is
reactive and makes `=` itself the setter. One way to write, always correct — no
`setAttribute` to remember, no bypass to forget. Reads are symmetric: a bare `.x`
is the tracked read; there is no `getAttribute` either.

The discipline that falls out: use **reactive attributes** for UI state where you
want the propagation, and **plain locals** (loop counters, temporaries, ordinary
objects in `script { }`) for hot inner computation — those are not reactive and
carry zero overhead. Writes also batch: a tight loop writing a reactive attribute
is N cheap sets and **one** cascade at the flush, not N cascades.

## The value model: what a bare slot accepts

A constraint often produces one of Declare's polymorphic value types, and so does
a bare literal. A dimension is `50` *or* `50%`; a colour is `navy` *or*
`#354D5B`. As an author you just write them and they work — the coercion lives in
the compiler, never in your code:

```declare
View [ width  = 100%,          // a Length — percent
       height = 60,            // a Length — pixels
       fill   = navy,          // a Color — named
       opacity = 0.5 ]
```

### The `#` vs `0x` gotcha

The one place a colour's spelling changes is the `[ ]` / `{ }` seam. In a bare
literal slot a colour is `#RRGGBB` (or a CSS name like `navy`); inside a `{ }`
body it is `0xRRGGBB`, because there you are in plain TypeScript and it is just a
number:

```declare
NavLink [
    fill = { pressed ? 0x24384A : hovered ? 0x1C2D39 : null },   // TS body → 0x
    lbl: Text [ textColor = #8A9BA6,                             // literal slot → #
                textColor = { hovered ? theme.text : theme.muted } ],  // body again → tokens/0x
    ]
```

`null` is a legal colour and means *paint nothing* — an unfilled box is invisible
but still lays out and still catches clicks. (This and the rest of the colour
vocabulary are in the [`Color` reference].)

## A worked example: one value, many bindings

This is the whole model in eight lines — three independent constraints tracking
one number:

```declare
App [ textColor = whitesmoke,
    v: number = 42,
    cool: Color = dodgerblue,
    warm: Color = turquoise,
    onMouseDown() { v = (v + 17) % 100 },
    View [ x = 28, y = 26, layout: SimpleLayout [ axis = y, spacing = 18 ],
        Text [ fontSize = 72, fontWeight = bold, text = { v + "" } ],       // the number
        Bar  [ width = 300, value = { v },                                  // the bar length
               tint  = { v < 50 ? cool : warm } ],                         // the colour, crossing at 50
        ],
    ]
```

One `onMouseDown` bumps `v`. The big number, the bar's length, and its colour all
update together — three edges of one dependency graph, no update logic written for
any of them. The `+ ""` is ordinary TypeScript string coercion; the ternary reads
two more reactive slots (`cool`, `warm`) and the runtime tracks all three.

## Binding timing (briefly)

`{ }` is **always** — reactive, and the common case that covers the overwhelming
majority. Two narrower modes exist for when you need them: **`once`** (evaluate a
single time at init, then detach and keep the snapshot) and **`immediate`**
(evaluate during construction). Their exact surface is still settling; reach for
plain `{ }` unless you specifically want a value frozen after first evaluation.

---

**Next:** styling that flows down the tree without repeating itself —
[Prevailing](22-prevailing.md).


<!-- demo: View -->
