# Declare constraints — static dependency analysis

A `{ }` constraint is a **statically-analyzable expression**. The compiler reads
it, extracts the exact set of reactive slots it depends on, and *prewires* those
subscriptions — dependency discovery happens at **compile time**, not by running
the body under read-tracking. This note rules that model and draws the line it
implies: what a constraint may be, what it may not be, and where the
genuinely-dynamic cases go instead.

Ruled by the human, 2026-07-04. This **supersedes runtime read-discovery as the
user-facing model** — `reactive.ts`'s `active`/`Cell.track()` is demoted to an
internal mechanism (§5). It is a deliberate divergence from the modern
mainstream, made with eyes open (§4).

> **Revision, 2026-07-11 — the analysis follows into method bodies (interprocedural).**
> The original §2–§3 refused a "hidden-dep call" (a callee that reads `this`/a slot
> it was not handed as an argument), on the assumption that call bodies were opaque
> to the analysis. A measurement across the whole app corpus
> (`tools/analysis/dep-classify.mjs`, 700 constraints) falsifies that assumption:
> because the reactive read-surface is a small, syntactically-marked set and the
> whole program is in source, the compiler can follow a call into its body — and
> everything *it* calls — and extract the transitive reactive reads **completely**
> (100% of constraints; still 100% under the sound rule that treats every unknown
> target as unanalyzable). So the restriction is lifted: **calls are followed, not
> refused.** Dependencies stay statically known and tooling-surfaced — they are no
> longer required to be readable *at the call site by eye*. §2, §3, §4, §7 below are
> revised to this model; the deleted "hidden-dep" rule is preserved struck-through
> in §3 for the record.


## 1. The decision

neo's reactive core today discovers a constraint's dependencies by *running* it
and recording tracked reads (`reactive.ts`: "a standing computation whose
dependencies are exactly what it read last time it ran"). That is how
MobX / Solid / Vue / Signals work, and it is what LZX shed the event/delegate
machinery to avoid re-implementing.

We are reversing that stance **for the author-facing declarative surface**: a
`{ }` constraint's dependencies are extracted **statically, by the compiler**,
from the expression text — LZX's model (parse the ref, wire it), rebuilt on a
real compiler. Runtime read-tracking remains, but only as an **internal**
mechanism of the few framework primitives that genuinely need it (§5); it is
never a property of an author's constraint.

Why this is tractable for neo when Svelte 3 abandoned it (§4): neo **owns a
bounded constraint sub-language** with a hard `[ ]` (declarative) / `{ }`
(imperative) split. The embedded-DSL frameworks analyze *arbitrary user
JavaScript* in their reactive slots; neo *defines* what a constraint may be and
refuses the rest. Language ownership is the enabler — not the mere existence of
a compiler (they all have one).


## 2. What a constraint may be — and how its deps are found

A constraint body is an **expression** over:

- **reactive reads** — slot references (`sel`, `parent.width`, `App.zip`) and
  datapath reads (`:item.condition.temp`). Each is one dependency, resolved by
  name to a slot or a data-cursor path.
- **operators, ternaries, literals, value constructors** (`shadow(…)`,
  `stroke(…)`) — no dependencies of their own.
- **calls — followed interprocedurally.** A call's dependencies are the reactive
  reads of its *callee*, extracted by analyzing the callee's body and everything
  *it* calls, transitively (a call-graph closure; cycles reach a fixpoint). Two
  cases, found the same way and unioned in:
  - a **pure formatter** reads only its parameters — `{ iconUrl(:code) }` depends
    on `:code`, and `iconUrl` contributes nothing of its own. (Still the most
    legible form — encouraged where natural.)
  - a method that reads reactive state **directly** — `{ app.buildModel() }`,
    where `buildModel` reads `this.year`, `this.month`, `app.data.read(["events"])`
    internally — contributes `year`, `month`, and the events region. The compiler
    reads *through* the call to find them.
  Callback closures (`.map(e => … app.n …)`) are analyzed the same way, with the
  closure's parameters bound as locals. This is tractable — where Svelte 3's
  see-through-a-call was not (§4) — because a reactive read is only ever a
  scope-noun attribute, a `:path`, or a `.read([…])`: a small, marked surface to
  hunt, not arbitrary dataflow. **Soundness:** a call whose target cannot be
  resolved to an in-program definition (host/JS interop) is treated as reading
  the unknown → it falls to the §3 residue, never silently assumed pure.

Dependency extraction is the **union** of the reactive reads across the whole
expression — argument sub-expressions, called method bodies, and callback bodies
included. Ternary / `||` / `&&` take the union of **all** branches (slight
over-subscription — a branch not taken this run is still a subscribed dep —
exactly as LZX did; §6 on the trade). The compiler emits this dep set; the
runtime wires the edges once, at construction.

**Legibility, restated.** Under this model a constraint's dependencies are not
always readable at the call site by eye — `{ app.buildModel() }` hides them behind
the call. They remain **statically known and tooling-surfaced**: the compiler holds
the full extracted graph, so "what depends on this slot?" is answerable
mechanically (an editor can show it), and the silent-illegible-dep class of bug is
still structurally impossible. This is a *stronger* guarantee than runtime-tracked
systems (where the graph exists only at runtime) — the earlier call-site-readable
framing was one way to get legibility, not the only one.


## 3. What it may not be — and where those cases go

A constraint the compiler cannot fully analyze is a **compile error pointing at
the offending expression**, never a silent runtime fallback. The line is now drawn
by one principle: **every reactive read must have a statically-determined target.**
The read is fine; the *target cell* may not be a runtime value. Three forms cross
it:

- **Dynamic-unbounded indexing** — `this[k]` where `k`'s type does not bound the
  key set. The dependency edge's endpoint is a runtime value, and it *moves* as
  `k` changes — unrepresentable statically. **The typechecker draws this line**:
  `k: "width" | "height"` → analyzable (the union of those two slots' deps);
  `k: string` → refused. `this["width"]` (a constant) is just `this.width`.
- **Dynamic datapaths** — `data.read([<expr>])` where the region path is computed
  at runtime, or a read off a runtime-*chosen node* (`pickNode().width`). A literal
  `:path` or `.read(["events"])` is fine — the path is fixed.
- **Aggregations over a reactive *node* collection** — "max over `children`",
  `{ this.children.map(v => v.x) }`: a data-dependent *number* of reactive slots.
  Note this is only the **node** case. Aggregating **data** is analyzable and
  common — `{ app.data.value.rows.reduce(…) }` reads one cell (`data.value`) and
  walks it untracked; `.map`/`.find`/`.reduce` over a `.value` array contribute no
  per-element deps (§2's "reads *through* a call" applies to traversal too).

> ~~**Hidden-dep calls** — a call whose callee reads reactive state it was not
> handed as an argument (reaches into `this` / a slot) → refused.~~ **Struck
> 2026-07-11:** the analysis now follows the call and extracts those reads (§2).
> This was the model's biggest restriction, and the measurement retired it.

The genuinely-dynamic reactivity these represent does not vanish; it moves **off
the constraint surface**:

- **Framework reactive primitives** own their dynamic, per-element subscriptions
  internally: `layout` (re-lay on child add / remove / resize), auto-extent
  (content size over children), data-binding (`:path` over a live tree). An
  author *uses* these; they never write the dynamic constraint.
- **Imperative `{ }` handlers** cover anything custom: compute on a state change,
  write the slot. The imperative surface is unrestricted TS — this is the escape,
  and it is first-class, not a failure mode.

So the seam is clean: **declarative constraint ⇒ analyzable & prewired; anything
dynamic ⇒ a provided primitive or imperative code.**


## 4. Why — honestly, against the current

The modern mainstream is runtime-tracked (Solid, Vue 3, MobX, Signals), and the
most relevant precedent cuts against us: **Svelte *had* compile-time dependency
analysis (`$:`) and retreated to runtime signals (runes)** over exactly the
can't-see-through-a-call limitation. We keep the compile-time model — and, per the
2026-07-11 revision, we **do** see through the call, which Svelte 3 could not. The
difference is not nerve; it is that neo's problem is a *different, smaller* one:

- **A marked, bounded reactive surface.** In Svelte 3 a reactive statement read
  arbitrary component/module scope — mutable, aliased, closed-over — so "what does
  this call read?" was general mutable-dataflow analysis (intractable). In neo a
  reactive read is *only* a scope-noun attribute, a `:path`, or a `.read([…])` —
  three syntactic forms over a controlled scope (`this`/`parent`/`classroot`/`app`
  + parameters + locals; no free mutable module state). Following a call is
  hunting those marks in the callee, transitively — a small, decidable pass.
- **Whole program in source.** Every method and component the analysis might follow
  is compiled together, so a callee is never opaque (the residue is host/JS
  interop, which constraints don't touch — §2 soundness).
- **A clean two-surface split** with a first-class imperative escape — the wall
  Svelte 3 lacked.
- **A proven precedent** — LZX ran a static model across the whole OpenLaszlo
  corpus (though even LZX did not read through method bodies as this does).
- **Different values** — neo prizes analyzability, predictability, and speed over
  composability-of-reactive-logic. Choosing the less-trendy path *because the
  objective function differs* is coherent.

The primary reason is **analyzability / predictability**: a constraint's
dependencies are statically known and **tooling-surfaced** — the compiler holds the
full graph, answers "what depends on this?", and the silent-illegible-dep class of
bug is structurally impossible — even though, reading through calls, the deps are
not always legible at the call site by eye (§2). Types are a **secondary, precise**
synergy — the concrete fact that a key's **type bounds the analyzability** of a
dynamic read (§3). Performance is a **strong third** (§6).

The risk is Svelte 3's risk — **getting walled in**, hitting the analyzability
limit with a bad escape. The whole bet rides on keeping the declarative surface
small and the imperative / primitive escape genuinely clean.


## 5. The seam — compiler and runtime impact

- **Compiler**: extracts each constraint's dep set (identifier / datapath
  resolution, argument recursion, branch-union, and **interprocedural summaries** —
  per-method reactive-read sets, closed over the call graph to a fixpoint) and
  emits it. This is the **same analysis and infrastructure as the typecheck
  slice** — do them as one piece of work. Unanalyzable constraints (the §3 residue,
  and any unresolved-target call) are rejected with a positioned error.
- **Runtime**: gains a **static-constraint path** — a `Constraint` whose edges
  are *supplied* (wired once at construction), so `run()` just
  recomputes-and-applies with no per-run `unlink`/re-track and no per-read
  `active` branch. `reactive.ts` already anticipated exactly this ("the compiler
  will … prewire static dependencies … the seam is exactly: who calls
  `reads()`"). Read-tracking survives only inside the framework primitives (§3).


## 6. Performance

Static is **faster** on the metric that matters — the animation / layout hot
path. Today `Constraint.run()` tears down and rebuilds its dependency edges every
run, and every tracked read pays an `active` branch; static prewiring makes a
re-run recompute-and-apply with fixed edges and plain reads. For a slide
re-running reader constraints across many nodes at 60 fps, that per-frame rebuild
is gone on every scalar constraint.

The one honest trade is **conditional precision**: runtime tracking subscribes
only to the branch it took; static takes the branch-union (§2), so `{ a ? b : c }`
may re-run when `c` changes uselessly. A wasted recompute is cheap; a per-frame
tree-wide dep-rebuild is not — net win, but this is the specific way "faster per
run" is not "strictly fewer runs."


## 7. Grounding — the audit

**2026-07-04 (original):** across every neo source then (44 constraints), 42 were
pure analyzable expressions and the landed app was 100% analyzable.

**2026-07-11 (re-audit, `tools/analysis/dep-classify.mjs`):** across the whole
current corpus — calendar, neocalendar, neoweather, site, docs — **700 constraints
(attribute bindings + computed decl defaults), 100% analyzable** under the
interprocedural model, and **still 100% under the sound rule** (unknown call target
→ residue). The §3 residue — dynamic indexing, dynamic datapaths, node-collection
aggregation — appears **zero** times (grep-corroborated: 0 computed-member reads on
scope nouns, 0 node-collection iterations, the sole `.read()` uses a literal path).
Under the *old* hidden-dep rule, 17 of the 700 (2%) would have been refused —
`{ app.buildModel() }`, `{ app.catText(:category) }`, `computeMonthRows()`, etc.,
the calendar's state-reading helpers; following the call absorbs all 17. So the
revision is strictly *less* churn than the original rule, not more.


## 8. Status

- **Ruled:** the model (this note). **Landed:** nothing yet — the runtime is
  still pure read-discovery (`reactive.ts`); constraints work, via runtime
  tracking.
- **To build:**
  1. compiler dep-extraction over the analyzable grammar (§2), rejecting §3 cases
     with positioned errors — shared with the typecheck slice;
  2. the runtime static-constraint path (§5): a `Constraint` constructed with an
     explicit edge set;
  3. **interprocedural summaries** (§2/§5): per-method reactive-read sets closed
     over the call graph (fixpoint for cycles), with unresolved-target calls sunk
     to the §3 residue — the prototype is `tools/analysis/dep-classify.mjs`;
  4. the dynamic-escape audit — confirm `layout` / auto-extent / data-binding
     cover the primitive cases, and that imperative handlers are ergonomic for
     the rest.
- **Deferred:** author-facing reactive aggregations (a reactive-collection
  primitive vs. imperative) — no program needs one yet (§7).
