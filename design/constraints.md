# neo-LZX constraints — static dependency analysis

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
- **calls to compiler-verified-pure functions** — a function that reads **no
  reactive state** (only its parameters). The call contributes no deps; the deps
  come entirely from the **argument expressions**, which are themselves
  analyzable. `{ iconUrl(:item.condition.code) }` depends on
  `:item.condition.code` — read at the call site, in plain sight — and `iconUrl`
  is a pure formatter of that argument. Purity is a property the compiler
  **verifies** by analyzing the callee's body, not a developer assertion.

Dependency extraction is the **union** of the reactive reads across the whole
expression, argument sub-expressions included. Ternary / `||` / `&&` take the
union of **all** branches (slight over-subscription — a branch not taken this run
is still a subscribed dep — exactly as LZX did; §6 on the trade). The compiler
emits this dep set; the runtime wires the edges once, at construction.


## 3. What it may not be — and where those cases go

A constraint the compiler cannot fully analyze is a **compile error pointing at
the offending expression**, never a silent runtime fallback:

- **Hidden-dep calls** — a call whose callee reads reactive state it was *not*
  handed as an argument (reaches into `this` / a slot). The dependency is
  invisible at the call site → refused. (Pass the reactive value as an argument,
  per §2, or move the logic imperative.)
- **Dynamic-unbounded indexing** — `this[k]` where `k`'s type does not bound the
  key set. The dependency edge's endpoint is a runtime value, and it *moves* as
  `k` changes — unrepresentable statically. **The typechecker draws this line**:
  `k: "width" | "height"` → analyzable (the union of those two slots' deps);
  `k: string` → refused. `this["width"]` (a constant) is just `this.width`.
- **Aggregations over a dynamic collection** — `{ items.reduce(…) }`, "max over
  children." The dep set is dynamic (unknown element count) → not a static
  constraint.

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
can't-see-through-a-call limitation. We are choosing the path a major framework
walked away from — deliberately.

It is right **for neo** because neo differs where it matters:

- **Bounded expression constraints**, not reactive *general statements* (Svelte
  3's overreach). A far smaller, tractable analysis.
- **A clean two-surface split** with a first-class imperative escape — the wall
  Svelte 3 lacked.
- **A proven precedent** — LZX ran this model across the whole OpenLaszlo corpus.
- **Different values** — neo prizes analyzability, predictability, and speed over
  composability-of-reactive-logic. Choosing the less-trendy path *because the
  objective function differs* is coherent.

The primary reason is **analyzability / predictability**: a constraint's
dependencies are legible (readable off the text, or off its typed arguments),
tooling can answer "what depends on this?", and the silent-illegible-dep class of
bug is structurally impossible. Types are a **secondary, precise** synergy — not
"it's one pass" (tsc checks any body regardless), but the concrete fact that a
key's **type bounds the analyzability** of a dynamic read (§3). Performance is a
**strong third** (§6).

The risk is Svelte 3's risk — **getting walled in**, hitting the analyzability
limit with a bad escape. The whole bet rides on keeping the declarative surface
small and the imperative / primitive escape genuinely clean.


## 5. The seam — compiler and runtime impact

- **Compiler**: extracts each constraint's dep set (identifier / datapath
  resolution, argument recursion, branch-union, pure-callee verification) and
  emits it. This is the **same analysis and infrastructure as the typecheck
  slice** — do them as one piece of work. Unanalyzable constraints are rejected
  with a positioned error.
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

Across every neo source today (44 constraints): **42 are pure analyzable
expressions**, and the landed app (`neoweather.neolzx` + `components.neolzx`) is
**100 % analyzable**. The only two constraints with a call —
`{ iconUrl(:code) }` and `{ iconUrl(:item.condition.code) }`, both in the *design
sketch* `weather.neolzx` — are the §2 pure-formatter-with-dep-as-argument
pattern, which **is** analyzable. **Zero aggregations, zero dynamic indexing**
appear in any real program. So the rule is near-zero-churn to adopt, and the
dynamic cases §3 legislates for are — today — entirely theoretical, which is the
right time to draw the line.


## 8. Status

- **Ruled:** the model (this note). **Landed:** nothing yet — the runtime is
  still pure read-discovery (`reactive.ts`); constraints work, via runtime
  tracking.
- **To build:**
  1. compiler dep-extraction over the analyzable grammar (§2), rejecting §3 cases
     with positioned errors — shared with the typecheck slice;
  2. the runtime static-constraint path (§5): a `Constraint` constructed with an
     explicit edge set;
  3. pure-callee verification (a function reads no reactive state) for §2 calls;
  4. the dynamic-escape audit — confirm `layout` / auto-extent / data-binding
     cover the primitive cases, and that imperative handlers are ergonomic for
     the rest.
- **Deferred:** author-facing reactive aggregations (a reactive-collection
  primitive vs. imperative) — no program needs one yet (§7).
