# The kernel — the runtime's stable core as one C source, on every host

**Status: LANDED and MERGED into main (2026-09-19/20).** This note is the kernel's design —
what it is and why it is shaped this way. What it turned out to be WORTH, measured against the
released tree that has none of it on five runtime configurations, is a separate note:
[optimization-arc.md](optimization-arc.md). Design from the 2026-09-16 profile
(`mac-host/profile/REPORT.md`). Nothing here changes the language: no developer-visible surface
moves, and no host gets semantics the others lack.

One limit, deliberate and invisible to a program: percent/centring derives carry a content-box
opcode sequence rather than reading a padded extent directly.

## As built — 2026-09-16

| landed | where | proof |
|---|---|---|
| kernel core (tables, edges, two-phase settle, gates, one-owner, cycle guard, close, EXPR/BODY/DYNAMIC, cell blocks, write ring) | `kernel/src/kernel.c` (C11, ~900 lines) → static lib + WASM 14.7 KB raw / 6.2 KB gz | `kernel/test/kernel-test.c` 46 checks; `kernel/test/kernel.test.mjs` incl. 60 random-graph settle traces ≡ main's JS core |
| C0 — `reactive.ts` on the kernel | Cell = cell id, Constraint = rule id; DYNAMIC tracked / BODY wired | unit 455/0 = main |
| C1 — numeric slots in the table | per-class layouts, contiguous blocks per instance, `$esc` escape for union-typed slots, values snapshotted on teardown | unit, materialization, tracker, dep-extract, crawl |
| steps 1–2 — call-free reads and writes | `table[base+i]`, `S.collecting`/`ACTIVE` live bindings, the write ring | micro: reads at main's cost, tracked reads 2× faster |
| C2b — the native visibility rule | `DK_VIS`: the ancestor walk in C (affine.ts term for term), 3D hands back to JS | `test/kernel-vis.test.mjs`: 40 trees × 8 perturbations ≡ `readVisibilityJS` |
| the browser | same WASM in Chrome (async instantiate), `mac-host/profile/web.mjs` | serve-browser, perceptual green |
| B2 — EXPR bodies | `compiler/src/expr-emit.ts` emits kernel bytecode for pure-numeric `{ }` bodies; carried as the code value's `expr` (in the walk-order deps list of the text path, an `=E…` entry); `bind.ts bindKernelExpr` resolves paths to cells at bind, JS body otherwise | `test/kernel-expr.test.mjs`: 6 apps × (boot + 3 perturbations) bit-identical, 59–600 bodies/app |
| declared defaults as rules | a `{ }` default (`name: T = { … }`) stands as a YIELDING rule on each instance — one evaluation per input change, not one per read (a live default re-evaluated on every read: 260–612 ns for a number, ~1 µs for marketmap's tile `slot` record); numeric ones in the table (and EXPR where the body allows), others over the JS store (`AttrSpec.defRule`, `DeclRecord.rule`, installed per instance after its attributes — `bindDeclDefault`); not for `readonly` (its contract is the live value) or schema-typed slots; displaced by an author write, a newer owner (refreshed to its live value first) or a runtime write; a throwing default stays unapplied; a read by a rule — tracked, or any read inside a settle — evaluates live while the default's own recompute is queued, a read outside one while any work is pending | unit 467/0, kernel-expr 6/0; reads ~68 ns |
| kernel-landed JS rules | a JS rule whose slot is a numeric table cell returns its number and the KERNEL lands it (`Constraint.landInKernel`, rule target = the cell: set_value gates, stores, wakes; the surface push follows at the close, and before any phase-1 rule) — the JS write path only for a value the table cannot take (a union slot's list, an escaped slot); no ABI change | unit 467/0; marketmap settle −6% on both kernels |
| more bodies as EXPR | `&&`/`\|\|` as VALUES lower to SELECT (`a && b` → `a ? b : a` — the operand JS yields, JS truthiness in both kernels); `as`/`!`/`satisfies` are seen through; a bare name that is a numeric `const` of the program's script scope folds to its value | kernel-expr 6/0 (bit-identical) |
| the kernel pull | `own()` registers the slot's owner with the kernel (`Rule.owns`); a host-initiated run (`kernel_run`, a rule's first evaluation at bind) first runs the queued owners of its inputs, in dependency order — a reader's FIRST value (a spring primes from `to = { app.targetDay }`) equals what the world settles to | kernel-expr marketmap/calendar ≡ JS |
| `:field` data cells | a numeric cell per (view, field) that follows the record (one tracking bridge rule making the body's own `$data` read); EXPR bodies read the cell; a field that is or becomes non-numeric sends its readers back to their JS bodies | kernel-expr calendar (Cell.x/y, Ev.y/height) ≡ JS |
| the auto-extent rule | `DK_EXTENT` (`kernel_extent_add/rewire`): a container's unset width/height as the max over its children's footprints, evaluated over the table by block base; edges = the children's geometry cells + the child-list cell (re-listed by `childrenMutated`); percent-owned child slots skipped via the owning rule's `DK_PERCENT` flag; a 3D child DECLINES to the JS derive through the new `dk_host.decline` callback | `test/kernel-extent.test.mjs`: 40 containers × 8 perturbations ≡ `extentOf`; decline path |
| padded auto-extent | `DK_EXTENT` words carry the container's inset cell on the axis (`insetX`/`insetY`, which `padding` maintains) after the child-list cell; the rule adds it, as `extentOf` adds both insets — a padded container's size is the kernel's, and a padding change wakes it through that cell | `test/kernel-extent.test.mjs`: padded and unpadded containers, padding perturbed |
| the stack layout | `DK_LAYOUT` (`kernel_layout_add`): an unmodified `SimpleLayout` (the library class, no subclass, only attribute values at the use site — `Layout.$canon`) with `align = none` and no spacer writes each laid child's flow position — the run of footprints and spacing `place()` computes — with the child's footprint cells as edges, never its position; a child whose slot an author owns stays in the run unwritten (`DK_LAYOUT_NOWRITE`); claims, conflict and discard reports stay `Layout`'s; alignment, spacers, a windowed block, a 3D child (declined) and hosts with no such binding (the Mac's JSC kernel) keep the JavaScript pass. The shape watcher reads an unmodified SimpleLayout's shape from its inputs rather than running `place()` | `test/kernel-layout.test.mjs`: 40 random trees × 10 perturbations, native ≡ the pass; circular trees refused by both (the report may name a different rule of the loop) |
| the track ring | a tracked read appends its cell to a shared ring (no call); the kernel links a run's reads to the active rule when the body returns, at the next entry and at flush; where the runtime hands the active rule to another (apply under the outer tracker, `untracked()`) it appends an OWNER MARK (`DK_TRACK_OWNER | rule`, or `| DK_TRACK_NOBODY` to drop them) that closes the reads before it under that rule — a store, not a call; it flushes only when writes are waiting, so their wakes keep their place; rule states and the pending flag are viewed, not fetched | unit 455/0, kernel traces ≡; Mac: −16% |
| Phase D — native on the Mac | `kernel/src/kernel_jsc.c` (JavaScriptCore C API: the ABI as JS functions, pointers as doubles, arguments through shared `args`/`io` blocks rather than JS values — a converted JSValue takes the API lock — zero-copy typed-array views, host callbacks via `setHost`), SwiftPM target `DeclareKernel` (sources mirrored by build-app.mjs), `declare_kernel_install` in Bridge.swift, the loader's `bindWith(x, Mem, …)` over either memory; `DECLARE_NO_NATIVE_KERNEL=1` = WASM for A/B | interpreter, same build: calendar 1328 → 726 ms, desktop seed 208 → 93, weather resize 854 → 634 (native vs WASM); JIT −5% |
| pure method inlining | `app.lerp(a, b, t)` → the method's `return` expression with arguments substituted, for statically known receivers (`app`; `classroot`/`this` when no subclass or use site overrides the name) | kernel-expr calendar 385 → 600 bodies in the kernel |

Measured across four targets (`mac-host/profile/results/MATRIX.md`, the in-page stimuli, main → opt
JS settle): desktop seed −86% Chrome / −83% Mac JIT / −80% Mac interp / −88% iOS sim; desktop
minimize (genie) −50 / −73 / −39 / −49%; weather resize −28 / −69 / −51 / −41%; weather city −46 /
−51 / −15 / −32%; tracker filter −27 / −31 / −27 / −30%; calendar mode −18 / −13 / +2 / −23%. The
interpreter targets gain as the JIT ones do. Frames that did not improve are applier-bound (the
Mac's real-window resize: frost compositing; the iPhone's resize: DOM paint).

The declared-defaults, kernel-landed and more-EXPR rows, measured together against the build
before them (kernel settle time, two rounds averaged, 2026-09-27): Mac native calendar mode −70%,
desktop minimize −54%, weather city −37%, marketmap slider −33%; Mac WASM about the same; Chrome
WASM −7 to −31%. No case measurably slower. Download: +0.8–1.0 KB gzipped per app, of which the
WASM kernel is 73 bytes. Held: batching rule-body callbacks, and the remaining ~5% native
crossing cost.

Earlier (settle time; `mac-host/profile/REPORT.md`): Mac JIT weather resize 9.7 → 3.4 ms/frame,
desktop seed 2.0 → 0.15 ms/settle; Chrome desktop seed 0.90 → 0.09 ms/settle, weather canvas
6.9 → 0.65 ms/settle. Not moved: replication (tracker filter −7%), no-JIT (neutral: each read/write
crossing was the cost; now that reads and writes make no call, to be re-measured), the Mac applier
(57% of the main thread under resize is software frost compositing — its own item).

Decided along the way: static edges for runtime-built rules (C2a) skipped — per-run overhead is
~0.8 µs after the O(1) edges, so the upside is under 10% for real soundness risk. Size: +8.8 KB gz
on the calendar bundle (kernel 6.2 + loader 2.6), before any JS is removed.

Open, in order: **Phase B before Phase E** — stamping rows in the kernel needs the compiler's
templates (class layouts, edge lists, bodies by id); the tracker profile puts a filter change in
the dataset merge (~8 ms) and row reconcile/instantiate, which only table-row instantiation
removes. Then the per-view block cost (View 40, Text 49 slots; the compiler sizes them per program).

## 0. Why

The profile put the runtime's per-frame time in three places: the **tracking machinery around
constraints** (2–4× the body it wraps: `cellFor`, `Set.add`, `deps.push` per read, unlink/relink
per run, the gated apply), the **runtime-built numeric constraints** that no compiler edge
reaches today (the visibility walk, layout passes, text sizing, springs — 86% of desktop's
settle, all of them pure arithmetic over geometry slots), and **row instantiation**
(dictionaries, `defineProperty`, a closure per method per row — three quarters of a tracker
filter change). Without a JIT (iOS) every one of those is 3–4× worse.

None of that is language semantics; it is how the model happens to be held in JS objects. The
compiler already knows what would let it be held in tables instead: every element's attribute
set (closed at compile time), every constraint's static read set (700/700 in the corpus), every
declared type.

## 1. The three layers

| layer | contents | where it runs |
|---|---|---|
| **kernel** | slot tables, edges, the settle (phases, equality gates, one-owner, cycle guard, afterSettle and change-event ordering), built-in rule kinds (layout strategies, percent lengths, text sizing, visibility feed, springs/animators), row instantiation from templates | one C11 source → static library (Mac, iOS, later Windows/Android) and WebAssembly (browser) |
| **bodies** | class (B) constraints, methods, handlers, scripts | the host's JS engine |
| **applier** | CALayer · DOM · canvas | per host, as today |

Keeping the kernel in sync across hosts is not a process; it is the same object file. The
browser instantiates it once at boot (async, cached by the browser) and calls it synchronously
on the main thread thereafter; a (B) body is a synchronous callback from inside the settle.
Measured on this machine: a settle with one JS callback round-trips in 0.12 µs under V8.

## 2. The program image (what the compiler emits)

A versioned binary blob plus a JS module. The compiler's existing knowledge, laid out:

- **Classes** — for each built-in, program and per-element anonymous class: parent class,
  slot list in declaration order: `{ name, index, type: f64|bool|ref|str, default, equality }`.
  Numbers (including bool) live in the kernel's f64 table; refs and strings live in a JS-side
  array indexed by the same slot id (they change rarely and never in the numeric settle).
- **Elements** — id, class, parent, initial literals (f64 written into the table, refs into
  the JS array), the rules that arm on it.
- **Rules** — `{ id, target: (element, slot), kind, phase, yielding, edges: [(element, slot)…],
  payload }` where kind is
  - `EXPR` — class (A): a small expression tree over slot reads (opcodes: load slot, const,
    + − × ÷, min/max/abs/floor/round, compare, select, and the few functions the corpus
    uses in geometry bodies). Evaluated by the kernel.
  - `BODY` — class (B): a JS function id; the kernel calls back.
  - built-ins: `LAYOUT(strategy, view)`, `PERCENT(slot, of)`, `TEXT_HEIGHT(view)`,
    `VISIBILITY(view)`, `SPRING(slot)`, … — parameterized by slots, read sets known to the
    kernel, so they get edges without the compiler analysing them.
  - `DYNAMIC` — a (B) body whose read set the analysis could not close: runs under a tracking
    shim and rewires its edges after each run (the runtime's `needsRewire` path, moved in).
- **Templates** — a replicated subtree as a shape: element rows and rules relative to a
  template origin; the kernel stamps a row with no JS. `createView` uses the same path.
- **Bodies module** — the (B) bodies, methods and handlers as **function literals** keyed by
  id, in one JS module (also what an AOT engine such as Hermes would consume).
- **Version** — bumped with any change to the kernel's contract; stamped like `BUILD_ID`.

Arming that is pay-per-use at runtime today (a visibility feed arms on the first tracked read
of `visibleRect`) becomes compile-time: static deps say who reads it.

## 3. The settle

Unchanged in meaning; moved: two phases (values, then draw re-records), invalidate through
edges, run in dependency order, equality-gated writes, one-owner enforcement, the cycle guard
(100), afterSettle steps and change events at the close, looping to quiescence. Pass ordering
is precomputed from the static edges (a topological order per phase), with `DYNAMIC` rules
re-sorted when they rewire. Springs, animators and the visibility feed are rules the kernel
advances on the host's frame clock, so a frame that touches only numeric rules never enters JS.

## 4. The ABI

One header, C calling convention, numbers and integers only across it; no allocation during a
settle (the image sizes the arena; rows come from a free list inside it).

    kernel_load(image, bytes, arena, arena_bytes)   → handle
    kernel_table(handle)                            → double*   (the slot table; JS takes a Float64Array view)
    kernel_write(handle, elem, slot, value)         (the author write: one-owner check, divergence bit, invalidate)
    kernel_settle(handle)                           → runs      (calls back: body(id, elem) → value; measure(text, font) → width)
    kernel_tick(handle, now_ms)                     → moved     (springs, animators, visibility flush)
    kernel_stamp(handle, template, parent, index)   → elem      (replication row / createView)
    kernel_retire(handle, elem)
    kernel_dirty(handle, out, cap)                  → n         (the elements whose geometry changed since last call — the applier's list)

Callbacks are function pointers on the native side and imports on the WASM side.

## 5. The hosts

- **Mac / iOS**: the kernel is a static library in the host process. The applier reads geometry
  straight from the table for the elements `kernel_dirty` names; the JSON op stream shrinks to
  what is not numeric (text, styles, structure). Bodies stay in JSC.
- **Browser**: the same source as WASM; `Float64Array` over its memory; DOM and canvas appliers
  read the table. `reactive.ts`, `attributes.ts`'s getters, `layout.ts`'s pass machinery and
  the instantiate dictionaries retire; the JS that remains is the applier half of each backend,
  text measurement, host glue.
- **Elsewhere** (Windows, Android; V8 or Hermes): native kernel, JIT'd bodies, a new applier.

Text is the one host dependency inside the kernel: `measure(text, font) → width`, memoized,
with the greedy line-breaking rule in the kernel so line counts agree everywhere. Renderers
keep their own breaks, as today.

## 6. What guards the seam

- The three-way conformance oracle (dom, canvas, mac) as it stands.
- The reactive-core unit tests, rehosted over the C ABI and run natively **and** under WASM.
- **Settle traces** (new): a scripted stimulus, per-settle slot values, compared host to host,
  and during the transition against the current JS core as the oracle.

## 7. Size

The kernel replaces 27 KB gz of JS on the web (reactive core 5.7, layout+springs 5.6,
instantiate+replicate 12.8, scroll physics 2.8). The C kernel as WebAssembly is about 8.2 KB
gzipped with its loader beside it; the JavaScript kernel (`runtime/src/kernel-js.ts`) is about
5.3 KB and needs no loader, which is what `--kernel js` (§10) trades on: a production build on the
JavaScript kernel is about 9 KB gzipped smaller.

## 8. Phases, each with its measurement

| # | lands | proves |
|---|---|---|
| A | the kernel core: tables, edges, settle, EXPR, BODY callback, native + WASM builds, unit tests | semantics reproduced against the JS core's tests; settle traces equal |
| B | the compiler emits the image: slot layouts, classification, edges, bodies module | corpus compiles; image sizes vs. program JSON |
| C | the runtime on the kernel: attributes over the table, rules replace Constraints, built-in rule kinds (visibility, layout, text height, springs) | profile rig: weather/desktop settle per frame, JIT and no-JIT |
| D | the Mac host links the kernel; the applier reads the table; `kernel_dirty` replaces GEOM ops | commit path bytes and ms; frame gap |
| E | templates: replication and createView stamp rows in the kernel | tracker filter change ms; boot instantiate ms |
| F | the browser on WASM; DOM and canvas appliers over the table | web gates green; bundle size delta |

Baselines to beat are in `mac-host/profile/REPORT.md` (Mac, JIT and no-JIT) and the tree's
web gates.

## 9. Capacity and growth

The capacities a kernel opens with (`reactive.ts` `DEFAULT_CAPS`: 1M cells, 128K rules, 512K
read edges, 64K views, 256K code words, 16K constants) are an **opening size, not a ceiling**,
and they are the same for every kernel. Opening large costs nothing: no kernel writes a table
until it hands that part out, so reserved capacity is address space, not memory (measured:
a page's footprint is the same on either kernel, and within a megabyte of the pre-kernel runtime).

Every table doubles when it would be more than half full:

- **The C kernel** (WebAssembly and the Mac's native build) moves its **tables** into a larger
  arena — `kernel_grow`, sized with `kernel_arena_size` for the new capacities — and keeps its
  own struct where it is, so its address and every pointer into its fields stay valid. Nothing
  in the kernel holds a table address across a call to the host, so a grow may happen at any
  time, including from inside a rule body during a settle. The loader (`kernel-loader.ts`
  `reserve`) grows after every settle when a table is past half full; on `DK_ERR_FULL` from an
  allocating call, for what that call needs, then retries it; and when the kernel asks — before
  draining a rule's reads into edges, the one place the kernel allocates on its own, it calls
  the host's `reserve` so that no read is ever dropped. A read that still finds no room is
  reported (`DK_ERR_FULL` through `error`), never lost. The old tables stay behind: WebAssembly
  memory cannot shrink, and on the Mac the first arena also holds the kernel.
- **The JavaScript kernel** doubles each typed array as it fills, with no ceiling.

A grow copies the used part of every table: measured on the Mac at about 5–8 ms for 4M cells,
and about 3 ms on an M5 iPad; `memory.grow` itself costs nothing measurable. `kernel-growth.test`
boots whole programs on kernels opened a few dozen entries wide, so they grow many times while
building, and requires the same settled tree as a normal boot on both kernels;
`kernel-conformance.test` drives both kernels past tiny capacities and compares everything.

## 10. Two kernels, one contract

`runtime/src/kernel-js.ts` implements the same ABI as `kernel.c`, written from this document
rather than transcribed, with the same layout: rules as columns of typed arrays, every read a
node on its cell's list (subscription order) and its rule's list (newest first), the view table
and both built-in view rules with the same arithmetic. `kernel-conformance.test` drives both
through identical scenarios — values, host calls in order, each rule's reads in order, the
visibility and auto-extent rules over random view trees, growth — and requires them equal.

A production build chooses its kernel with the `kernel` modifier (`compiler/src/flags.ts`):
`declarec --kernel js`, or `?build&kernel=js` on the dev server. The default is `wasm`. A
`js` build imports the JavaScript kernel with the bundle, and the WebAssembly bytes and loader
fold out of it (`reactive.ts` `kernelReady`). The trade, measured on the corpus (Chrome, and an
iPhone 15 Pro in Safari): the JavaScript kernel matches on memory and correctness and is about
9 KB gzipped smaller; interaction is level to 35% slower (the view-heaviest settles), and
startup on the iPhone is 12–59% slower on the larger apps (JavaScriptCore runs the kernel's
first settle before it has optimized it), level on small ones. Hence the default. The Mac host
always runs its native kernel — no WebAssembly in any scenario. Development bundles run the
compiled kernel and keep the JavaScript one as a PLATFORM developer's switch, for debugging the
kernel itself (breakpoints in its settle): a page sets `globalThis.__declareKernelJS`; the Mac
app is launched with `DECLARE_KERNEL=js`. It is not a program author's switch — no program's
behavior depends on which kernel runs, and author-facing docs name only the web build's
`--kernel` choice.

## 10a. What the kernel must not change: the language's meaning

The kernel is an implementation of the reactive model, not a part of the language. Two of its
optimizations move work that used to happen elsewhere into it, and each keeps a meaning the
language documents. Reviewed 2026-09-27, when they merged into main; the evidence is a set of
scenarios run against the tree before the merge and after it, with identical results.

**Declared defaults stand as rules — the formula's meaning is unchanged.** The language says a
declared attribute with a `{ }` default *reads as that expression until something assigns it,
and an assignment replaces the formula* (guide ch. 3; declare.md §4). Before, that was a lazy
fallback evaluated on read (`defBinding`); now it is a yielding constraint installed at
construction on a slot nothing set (`bind.ts` `bindDeclDefault`), so it is evaluated once per
input change rather than once per read. The same meaning, checked in each case: a Spring or an
Animator taking the slot over (it keeps the value it drove); a State overriding it and lifting;
a default that would throw but is never read (the program still boots); a read in `onInit`, and
in a handler right after an input changed but before the settle (both see the live value — a
stale default-owned slot is evaluated live, `attributes.ts`); an assignment (the formula is
gone); per-instance class defaults reading `classroot`. Two slots keep the lazy form: a
`readonly` one (its contract is the live value, never overridable) and a schema-typed one (its
record crosses the push and tracked hooks).

**The kernel lands rule values — the write path's meaning is unchanged.** A rule whose target
is a numeric or boolean table cell returns its value and the kernel stores it; the surface push
follows at the settle's close, and before any phase-1 rule (a `draw`), so a drawing reads the
landed value. What stays on the JavaScript write path: any value the table cannot hold (a union
slot's list, a slot that has escaped to `$attrs`) and any slot whose change handler is running,
so `onChange` and `trackChanges` see exactly what they did. The table is `Float64` (a `double`
on the Mac): no precision is lost. The kernel's equality gate is JavaScript's `===` in both
kernels — `NaN` is never "unchanged", `-0` equals `0` — and it is the gate a JavaScript write to
a table slot already went through. Checked: a change event on a bound number, a bound boolean, a
union slot switching between a number and a list, `NaN`, and a chain of constraints.

**Found while checking, and fixed: a take-over's hand-back lost its inputs.** A constraint a
State or an Animator took over must be *resumed*, not reinstated with a stale output
(animation.md §2 rule 4). On a table slot (a number or a boolean) it came back with the right
value and then never woke again — a State lifting from `width = { app.t * 2 }`, or an Animator
finishing over it, left `width` deaf to `t`; so did a State over a declared `{ }` default. It
predated the merge. Two causes: `kernel_suspend` unlinked every suspended rule's edges and only a
probe-bearing body ever re-linked them, so a static rule's edges — the compile's — were simply
gone (now only a dynamic rule, which re-tracks on every run, is unlinked); and a State taking
over a slot left the suspended base still claiming the kernel cell, so the State's claim made
the kernel dispose a yielding base (a declared default) outright (the base now gives up its
claim while suspended and re-claims it on restore). Pinned in `test/unit.test.mjs` ("a
constraint a State or an Animator took over follows its inputs again once handed back").

## 11. Closed: choosing the kernel automatically

Considered and closed, 2026-09-27 (DT): no build-time heuristic reads the thing that decides
which kernel is faster — the shape of the program's interaction at run time (how many views a
settle touches, how often) — and program size, views or rules do not predict it. The only
honest signal would be timing each app's own interactions under both kernels, which is costly
and noisy, for a prize of about 9 KB gzipped that measures near noise on most interactions.
`wasm` stays the default; `--kernel js` is chosen by hand, and the one situation that calls for
it is an embed in a page whose Content-Security-Policy does not admit WebAssembly
(guide ch. 24).
