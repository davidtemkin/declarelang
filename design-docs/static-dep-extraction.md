# Static dependency extraction — measurement & design

> **Outcome (2026-07-11):** this measurement drove a ruling revision in
> [`design/constraints.md`](../design/constraints.md) — the analysis **follows into
> method bodies** (interprocedural), retiring the earlier "hidden-dep calls
> refused" restriction. See that note for the ratified model; this doc is the
> evidence and method behind it.

**Question.** Can the compiler extract a `{ }` constraint's reactive dependency
set *statically*, including through method calls — or is per-evaluation runtime
tracking (or a call-site-only restriction) irreducible?

**Answer (measured).** Across the real app corpus, **700 / 700 constraints (100%)
have a statically-resolvable dependency set.** The dynamic residue that would need
runtime resolution — `.read([<dynamic>])`, computed attribute `this[<expr>]`,
iteration over a reactive *node* collection — occurs **zero** times.

| app         | constraints | T1 static | T2 dyn-target | T3 unbounded |
|-------------|------------:|----------:|--------------:|-------------:|
| calendar    |         210 |       210 |             0 |            0 |
| neocalendar |          70 |        70 |             0 |            0 |
| neoweather  |          19 |        19 |             0 |            0 |
| site        |         165 |       165 |             0 |            0 |
| docs        |         236 |       236 |             0 |            0 |
| **total**   |     **700** |   **700** |         **0** |        **0** |

Measured by `tools/analysis/dep-classify.mjs` (parses each app, walks every `{ }`
body — attribute bindings *and* computed decl defaults like `bf: number = { … }` —
with the TypeScript AST, following user-method calls interprocedurally). 692/700
carry a non-empty extracted dep set (avg 1.4 cells); the 8 dep-less bodies are
genuinely constant — value constructors (`gradient(…)`, `shadow(…)`) and literal
theme records. Independently corroborated by grep: the corpus contains **0**
computed-member reads on scope nouns, **0** node-collection iterations, and its one
`.read()` uses a literal path.

**The 100% survives the *sound* boundary rule.** By default the tool trusts an
unknown call target as pure; under `SOUND=1` an unknown target (a method neither
defined in-file nor a known-pure builtin) is conservatively pushed to the residue —
what a real, sound compiler must do. Result: **still 700/700 T1, zero escalations.**
Every method call in every constraint resolves to either an in-source user method
(followed transitively) or a known-pure builtin (`toFixed`, `getMonth`, `.map`, …).
There are no genuinely-unknown targets to be conservative *about*. (The `SOUND`
escalation is itself validated against synthetic `app.x.mysteryLib()` /
`unknownFreeFn()` calls, which it correctly flags T2.)

## Why it works — the reactive surface is narrow and syntactically marked

A `{ }` body does **not** become reactive by touching data. A dependency is created
*only* through a small set of tracked accessors:

- a **scope-noun property read** — `app.blockness`, `this.year`, `parent.width`,
  `classroot.field`, or a bare attribute name (the attribute getter calls
  `cellFor(self,name).track()`)
- a literal **`:path`** (region cell + the dataset's `value`)
- **`.read([...])`** on a dataset

Everything else — `Math.*`, string ops, `Array.map/find/filter`, arithmetic,
`Date`, locals, control flow — is **reactively inert**. So the analysis is not
general dataflow; it hunts occurrences of those three forms, followed through
calls. The scary-looking cases collapse:

```declare
// tracked reads: app.data.value and app.selectedId — BOTH static.
// the .find() traversal reads plain (untracked) object fields → contributes nothing.
datapath = { app.data.value != null ? app.data.value.events.find(e => e.id == app.selectedId) : null }
```

Its dep set is `{ data.value, selectedId }` — fully static. This is the crux: **data
traversal off `.value` is untracked**, so it never widens the dep set.

Interprocedural calls resolve the same way. `contents = { app.buildModel() }` →
`buildModel` reads `this.year`, `this.month`, `app.data.read(["events"])` (literal
path) → all static → the whole constraint is T1, even though `buildModel` is a
40-line imperative loop. **Imperative body ≠ unanalyzable**; only the *tracked
reads* matter, and they're a thin, marked surface.

## The genuine residue (0% here, but real in principle)

Three forms need runtime resolution of the *target cell* (not the shape):

1. **`.read([<dynamic>])`** — a region path computed at runtime.
2. **`this[<expr>]` / `app[<expr>]`** — an attribute *slot* chosen at runtime.
3. **Iterating a reactive node collection** — `this.children.map(c => c.x)` reads a
   *data-dependent number* of reactive slots.

None appear in the corpus. Where they would, the design choice is **strict-reject**
(the analyzable-expression discipline is mandatory; offer a sanctioned alternative —
e.g. push the computation into a method / derived dataset read through tracked
accessors) vs. **runtime-fallback** (the runtime tracker still exists; fall back for
these). The measurement says strict-reject is *viable*: the residue is empty in
practice, so mandating the analyzable subset costs real apps nothing today.

## Two models — and which was ruled

The 100% above is **Model Y** — the analysis *follows a call into the callee's
body*. There is a stricter alternative, **Model X** (what `design/constraints.md`
originally ruled): a called function must be *pure of reactive state*; a
"hidden-dep call" that reads `this.year` internally is refused, and you thread the
value through an argument. Measured side by side:

| model | analyzable | note |
|---|--:|---|
| **Y** — follow into method bodies | **700 / 700 (100%)** | ratified 2026-07-11 |
| **X** — call-site-legible, hidden-dep calls refused | 683 / 700 (97.6%) | original ruling |

The 17-constraint gap is the hidden-dep calls — `{ app.buildModel() }`,
`{ app.catText(:category) }`, `computeMonthRows()`, `gridIndexOf()`, … — the
calendar's state-reading helpers. **Y was chosen** (over X) because the original
restriction rested on the assumption that *method bodies were opaque* to the
analysis, and the measurement falsifies that: following the call is a small,
complete pass over the same marked surface. The cost is that a constraint's deps
are no longer always readable at the call site by eye — but they stay statically
known and tooling-surfaced, a stronger guarantee than any runtime-tracked system.
(Under X, those 17 would have been rewritten to thread arguments — including the
derived-collections feature's `contents = { app.buildModel() }`. Under Y it stands
as written.)

## One nuance: link-time, not pure compile-time, for `:path`

A `:path` resolves against the element's *inherited cursor*, known when the element
links (and re-pointed per instance under replication). So the dep *shape* is
compile-time; the concrete *cell* is bound once at **link time**, not per
evaluation. That's still "prewiring" — one resolution per instance at construction,
vs. re-discovery on every settle. Scope-noun reads bind at link time too (the
receiver object is concrete once the tree is built).

## Implications for the build

- The static extractor covers the entire corpus; **the runtime read-tracker becomes
  a fallback, not the primary path.** Prewire the dep graph at compile+link time;
  keep tracking only for a (currently empty) dynamic residue, or reject it.
- **Startup:** today every constraint runs once *under tracking* at instantiate to
  discover its deps. Static extraction removes that discovery pass — deps are wired
  directly from the compiled graph. This is the app-start constraint-resolution win.
- **Not a silver bullet for friction #6:** static extraction makes each re-fire
  cheaper and the graph inspectable, but the *number* of semantically-necessary
  re-fires is set by data flow (when `blockness` changes every frame, everything
  reading it must recompute). The runtime tracker is already branch-sensitive
  per-run — which is *why* the hand-written `bf` gate works. #6's remaining half is
  authoring ergonomics (conditional deps, invariant hoisting), which static analysis
  *enables the compiler to reason about* but doesn't automatically grant.

## Threats to validity

- **Interprocedural heuristics:** node-collection iteration is detected by a
  property-name allow-list; deep recursion assumes T1 within the cycle. The
  unknown-call-target concern is *tested*, not assumed: the `SOUND=1` run treats
  every unknown target as residue and the corpus still lands 100% T1 — so no
  optimistic-purity assumption is load-bearing here. A real extractor should keep
  the sound rule (unknown target → residue), and a whole-program pass makes
  "unknown" rarer still (library-component sources are in the compile, so they're
  followable, not opaque).
- **Corpus scale:** these are small/medium apps. A heavily data-driven app may push
  more into the residue — but the *structural* claim (narrow, marked reactive
  surface ⇒ bounded, identifiable residue) holds regardless, and is exactly what
  lets the language make the residue explicit.

## Talking points

- "Because a constraint's dependencies are analyzable at compile time, the compiler
  prewires the exact reactive graph — **100% of constraints across our apps**, with
  no runtime dependency-discovery pass at startup."
- "Reactivity without a virtual DOM *and* without runtime dependency tracking on the
  hot path — the compiler did that work once, ahead of time."
- "The reactive surface is a thin, syntactically-marked set of reads; everything
  else in a `{ }` is ordinary, inert computation — so even imperative-looking
  constraints have a fully static dependency set."
