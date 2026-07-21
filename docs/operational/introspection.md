# Introspection — asking a running program about itself

A running Declare app can be **queried as data**: its tree, each node's geometry, every
slot's live value, and — the payoff of static dependency extraction — *why* a slot has
the value it has. One vocabulary serves three consumers: [`verify`](declare-docs:operational:verify)'s
behavior rung, the Inspector, and any program or agent driving a browser.

This is a language feature, not a test hack. A model cannot glance at a screen; a person
cannot see a dependency graph. Both need the same answers, so both ask the same questions.

## The bridge

Every **top-level** app installs `window.__declare` at mount. An app embedded in an
island does not — it would fight the page's owner for the name — but it is still
inspectable: the island hands its child app to the Inspector directly, along with a live
page origin for the island's box, so picking and highlighting land on the child's own
coordinates.

```js
window.__declare.inspect("app.dock.row.calIcon")
window.__declare.explain("app.dock.row.calIcon", "width")
```

| call | returns |
|---|---|
| `inspect(path?)` | the subtree as data — see **InspectNode** below. No path = the root. |
| `find(path)` | the live node, or `null` |
| `explain(path, attr)` | **why** a slot holds its value — see **Provenance** |
| `slots(path)` | every slot with its live value and origin (`constraint` / `set` / `default`) |
| `expand(path, attr, trail?)` | one level of a record/array/`Dataset` value — lazy, for deep data |
| `at(x, y)` | `{ path, kind }` of the topmost visible view at a root-space point |
| `dependents(attr)` | every `(path, attr)` whose constraint reads that name |
| `evaluate(path, src)` | evaluate Declare in a node's scope — read, set, bind, or add a view |
| `stats()` | `{ nodes, ownedSlots, motionBusy }` — leak and perf canaries |
| `clock` | deterministic time — see **Motion** |

**Addressing** is by dotted path from the root: named members where they exist, child
index where they don't — `app.bar.brand`, `app.board.grid.3.4`. The same strings appear
in `inspect().path`, so a result can be fed straight back as a query.

### InspectNode

```
{ kind, name, path,
  x, y, width, height,        // local
  rootX, rootY,               // root-space — what you click
  visible, text?,
  attrs,                      // own values, JSON-reduced
  children[] }
```

`kind` is the authored component name (`DockIcon`, `App`) — resolved so it survives
minification, which a bare `constructor.name` does not.

### Provenance — the `explain` answer

```js
> __declare.explain("app.dock.row.calIcon", "width")
{ attr: "width", value: 146.58, set: false,
  constraint: {
    label:  "DockIcon.width",
    static: true,          // wired by the compiler, not re-tracked per run
    live:   false,         // true = typed in at runtime; temporary
    source: "this.rest * (1 + 0.5 * Math.pow(Math.max(0, this.near * this.env), 2))",
    pos:    { line: 1125, col: 14 },
    deps:   ["this.rest", "this.near", "this.env", …]   // the exact read-paths
  },
  spring: null }
```

`deps` is the compile-time dependency graph, shipped to runtime and queryable by name.
That is what makes "why is this value what it is" answerable at all: `set: true` means a
handler wrote it, a `constraint` means it is derived and names its inputs, `spring`
means an animator is driving it right now, and all three absent means it is riding its
class default.

### Motion — the driven clock

Animation is otherwise unassertable: real frame timing varies, so a spring's value at
any instant is a coin flip.

| call | effect |
|---|---|
| `clock.manual()` | take the clock — motion advances only when you say so |
| `clock.step(ms)` | advance exactly that far |
| `clock.settleMotion(maxMs)` | run in-flight motion to rest, frame-exact; `false` if it never settles |
| `clock.auto()` | hand the clock back to the browser |

## Assert scripts — `verify` rung 5

Rung 5 runs the compiled app **in a real browser**, drives it with real input, and
asserts through this bridge — never through DOM selectors, so an assertion is written at
the language's altitude and survives any change to how a view is realized.

```js
// checks.mjs — node tools/verify.mjs app.declare --assert checks.mjs
export default async ({ drive, expect }) => {
  await drive.click("app.dock.row.calIcon");
  await drive.settleMotion();

  await expect.visible("app.wins.0");
  await expect.text("app.bar.mb.0", "Calendar");
  await expect.approx("app.dock.row.calIcon", "width", 72, 1);
}
```

**`drive`** — `click(path)` · `drag(path, dx, dy, steps?)` · `key(name)` · `type(text)` ·
`tab(n?)` · `wait(ms)` · `settleMotion(maxMs?)` · `settleData()` · `page` (the raw
puppeteer page, for what the vocabulary doesn't cover).

Note `click(path)` computes the point from `inspect()` and dispatches a **real** press
there — so it exercises the actual hit-test. It reaches what a user would reach, not
what you meant; that is the point.

**`expect`** — `exists(path)` · `visible(path)` · `hidden(path)` ·
`attr(path, name, value)` · `approx(path, name, value, tol?)` · `text(path, contains)` ·
`count(path, kind, n)` · `explain(path, name)` · `fail(msg)`.

Because `explain` is available, an assertion can be **structural** rather than only
about a value — "this slot is owned by a constraint that reads `hot`" is checkable, and
stays true when the number changes.

## Fidelity — what each tier can and cannot see

Introspection is available at every tier, but the tiers do not observe the same world.
Choosing wrongly is the most common way to conclude a bug does not exist.

The distinction is **not** headless vs. headful — most of this is headless either way.
It is whether a **browser engine** runs the program at all. In a *synthetic
environment* the runtime renders through its own backend in Node, with approximated
text metrics and no DOM, CSS or layout engine; `verify` prints `synthetic metrics` on
those rungs. Everything else runs in **headless Chromium**, which is fully real.

| tier | how it runs | sees | **blind to** |
|---|---|---|---|
| **Extraction** (`?extract`, the crawl) | synthetic environment, cold boot, settle at t=0, fixed env | content, structure, reachable locations | everything below — by design: it is an oracle, deliberately environment-free |
| **`verify` rungs 1–4** | synthetic environment, **synthetic metrics** | parse, resolution, types, construction, settle, logic | real text measurement, layout, paint, input routing, CSS, the bundle |
| **`verify` rungs 5–6** | **headless Chromium**, real input, driven clock, fixtures | behavior, geometry, motion, visual baselines | production-only artifacts (a minified or AOT bundle) |
| **A live page** (the Inspector, an agent over CDP) | a browser, the shipped app as a user gets it | everything above, plus accumulated state and real interaction | nothing — but it is the slowest and least repeatable |

Rungs 1–4 are the cheap gate: sub-second, no browser engine at all, run them constantly. But a class
of bug is *structurally invisible* to them — anything that only exists once pixels, CSS,
real fonts, or a bundler do. Real cases: a transparent overlay swallowing presses; an
element with `pointer-events: none` starving an app's pointer environment; a component
name minified out from under code that compared `constructor.name`. Each looked fine at
rung 4 and failed on a live page.

The rule of thumb: **state and causality through the bridge** (exact, cheap, no
ambiguity); **appearance through pixels** (rung 6 baselines, or a screenshot) — no query
will tell you the palette is wrong.

## From a Declare program — the `Inspect` service

A Declare program that is *about* another program (the Inspector itself) reads the same
surface as a body service, alongside `Themes`, `Keys` and `Focus` — a `{ }` body cannot
reach `window`, and should not have to:

```declare
rows: array = { Inspect.ready() ? Inspect.rows(app.open) : [] },
why:  object = { Inspect.explain(app.sel, app.selAttr) },
```

The host names the subject once (`setInspectionTarget`); everything else is a query.

## Cost

`inspect()` on a large tree is a big object — the desktop is ~600 nodes and ~1,950
constraint-owned slots. Ask narrowly: `inspect(path)` on a subtree, `slots(path)` for one
object, `expand()` one level at a time. `stats()` is cheap and is usually the right first
question.
