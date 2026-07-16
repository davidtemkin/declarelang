# Living values: constraints

This is the heart of the language. A `{ }` in a value slot is a **constraint** — a live
expression the runtime keeps true by re-evaluating it when, and only when, its inputs
change. You never declare the inputs:

> **Reading subscribes; assigning notifies.**

One value, several views that follow it, and no update code between them:

```declare
App [ fill = white, textColor = black,
    v: number = 42,
    cool: Color = dodgerblue,
    warm: Color = turquoise,
    onMouseDown() { v = (v + 17) % 100 },
    View [ x = 28, y = 26,
        layout: SimpleLayout [ axis = y, spacing = 18 ],
        Text [ fontSize = 72, fontWeight = bold, text = { v + "" } ],
        Bar  [ width = 300, value = { v },
            tint  = { v < 50 ? cool : warm } ],
        ],
    ]
```

One `onMouseDown` bumps `v`. The big number, the bar's length, and its color all update
together — three edges of one dependency graph, and you wrote no update logic for any of
them. Reading `v` (or `cool`, `warm`) inside the braces *is* the subscription; there is
**no dependency array, no `useEffect`, no re-render**. Where a React or Solid file would
need a hook plus a dependency list plus a memo, Declare has one `{ }` expression, and the
list of dependencies is the expression itself.

## The compiler reads the dependencies

Most reactive systems discover dependencies by *running* your code under read-tracking
(Solid, Vue, MobX, Signals). Declare does not. **A constraint's dependencies are extracted
statically, by the compiler, from the text of the expression** — the wiring happens at
build time, and at runtime the read inside the constraint is a plain field read. Two things
follow that you will feel:

- **It is legible.** The dependencies of `{ a ? b : c }` are exactly `a`, `b`, `c`, read
  straight off the source. Where a constraint calls a method, the compiler reads *through*
  the call — so `{ app.buildModel() }` is a real dependency on whatever `buildModel` reads
  (`this.year`, the events data, …), extracted for you, not hand-threaded. Calling methods
  from a constraint is idiomatic, not cheating.
- **It is fast.** No per-run dependency rebuild, no per-read tracking branch on the hot
  path. A constraint re-running across many nodes at 60 fps just recomputes and applies.

## The one rule, and what it teaches

Every reactive read must have a **statically-known target** — a named slot or a literal
datapath. That is the whole rule, and the three things it rules out are the compiler
teaching you where a different tool fits, each rejection naming its rewrite:

- an index by an unbounded runtime key (`this[someString]`) → name the slot, or move the
  lookup into a method the compiler can read through;
- a datapath built at runtime (`data.read([key])`) → that is data-binding's job, not a
  constraint's;
- an aggregation over the live *node* tree (`children.map(v => v.x)`) → that is what a
  `layout` is for.

Each is a compile error pointing at the expression, never a silent surprise. In practice
the friction is near zero: measured across every real Declare program, **100% of
constraints are analyzable**.

## `=` is the setter

Inside a `{ }` body, **assigning to a reactive attribute *is* the setter.** It fires the
cascade — there is no separate notify call, and no raw write that skips it:

```declare-fragment
onClick() { count = count + 1 },   // not a local write — everything bound to count updates
```

The compiler knows `count` is reactive and makes `=` itself the setter — one way to write,
always correct, no `setAttribute` to remember and no bypass to forget. Reads are symmetric:
a bare `.x` is the tracked read; there is no `getAttribute` either.

The discipline that falls out is the whole cost model. Use **reactive attributes** for UI
state you want to propagate, and **plain locals** — loop counters, temporaries, objects in
`script { }` — for hot inner computation, which carry zero reactive overhead. Reads are
prewired at compile time, so a tracked read costs a field access. And writes **batch**: a
tight loop writing a reactive attribute is N cheap sets and **one** cascade at the flush,
not N cascades.

## Colors cross the `[ ]` / `{ }` seam

A constraint often produces one of Declare's value types, same as a bare literal does — a
dimension is `50` or `50%`, a color is `navy` or `#354D5B`. The one place spelling changes
is that seam. In a bare literal slot a color is `#RRGGBB` or a CSS name; inside a `{ }` body
it is `0xRRGGBB`, because there you are in plain TypeScript and it is just a number:

```declare-fragment
NavLink [
    fill = { pressed ? 0x24384A : hovered ? 0x1C2D39 : null },   // TS body → 0x
    lbl: Text [ textColor = #6A7885,                             // literal slot → #
        textColor = { hovered ? theme.text : theme.muted } ],    // body again → tokens/0x
    ]
```

`null` is a legal color and means *paint nothing* — an unfilled box is invisible but still
lays out and still catches clicks.

## Binding timing, briefly

`{ }` is **always** — reactive, and the common case that covers the overwhelming majority.
Two narrower modes exist for when you need them: **`once`** (evaluate a single time at init,
then detach and keep the snapshot) and **`immediate`** (evaluate during construction).
Reach for plain `{ }` unless you specifically want a value frozen after first evaluation.

---

**Next:** those constraints kept reaching for `classroot` and `app`. Four little words
name everything a binding can reach — [Reach](declare-docs:guide:reach).
