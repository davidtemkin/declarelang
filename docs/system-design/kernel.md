# The kernel — the runtime's stable core as one C source, on every host

**Status: LANDED and MERGED into main (2026-09-19/20).** This note is the kernel's design —
what it is and why it is shaped this way. What it turned out to be WORTH, measured against the
released tree that has none of it on five runtime configurations, is a separate note:
[optimization-arc.md](optimization-arc.md). Design from the 2026-09-16 profile
(`mac-host/profile/REPORT.md`). Nothing here changes the language: no developer-visible surface
moves, and no host gets semantics the others lack.

Two limits the merge established, both deliberate and both invisible to a program: a view with
a non-zero `padding` keeps the JavaScript extent derive (the kernel's auto-extent rule is a
maximum over child boxes and cannot carry insets), and percent/centring derives carry a
content-box opcode sequence rather than reading a padded extent directly.

## As built — 2026-09-16

| landed | where | proof |
|---|---|---|
| kernel core (tables, edges, two-phase settle, gates, one-owner, cycle guard, close, EXPR/BODY/DYNAMIC, cell blocks, write ring) | `kernel/src/kernel.c` (C11, ~900 lines) → static lib + WASM 14.7 KB raw / 6.2 KB gz | `kernel/test/kernel-test.c` 46 checks; `kernel/test/kernel.test.mjs` incl. 60 random-graph settle traces ≡ main's JS core |
| C0 — `reactive.ts` on the kernel | Cell = cell id, Constraint = rule id; DYNAMIC tracked / BODY wired | unit 455/0 = main |
| C1 — numeric slots in the table | per-class layouts, contiguous blocks per instance, `$esc` escape for union-typed slots, values snapshotted on teardown | unit, materialization, tracker, dep-extract, crawl |
| steps 1–2 — call-free reads and writes | `table[base+i]`, `S.collecting`/`ACTIVE` live bindings, the write ring | micro: reads at main's cost, tracked reads 2× faster |
| C2b — the native visibility rule | `DK_VIS`: the ancestor walk in C (affine.ts term for term), 3D hands back to JS | `test/kernel-vis.test.mjs`: 40 trees × 8 perturbations ≡ `readVisibilityJS` |
| the browser | same WASM in Chrome (async instantiate), `mac-host/profile/web.mjs` | serve-browser, perceptual green |
| B2 — EXPR bodies | `compiler/src/expr-emit.ts` emits kernel bytecode for pure-numeric `{ }` bodies; rides in the deps list as `=E…`; `bind.ts bindKernelExpr` resolves paths to cells at bind, JS body otherwise | `test/kernel-expr.test.mjs`: 6 apps × (boot + 3 perturbations) bit-identical, 59–600 bodies/app |
| declared defaults as rules | `name: number = { … }` was a LIVE fallback re-evaluated on every read (260–612 ns/read) and invisible to EXPR; now a standing YIELDING rule in the table (`AttrSpec.defRule`, `bindDeclDefault`), displaced by an author write, a newer owner (refreshed to its live value first) or a runtime write; a throwing default stays unapplied; an untracked read while work is pending, or a tracked read while the rule's recompute is queued, evaluates live | unit 455/0, tracker 15/0, inspect (explain still says "declaration"); reads 47–60 ns |
| the kernel pull | `own()` registers the slot's owner with the kernel (`Rule.owns`); a host-initiated run (`kernel_run`, a rule's first evaluation at bind) first runs the queued owners of its inputs, in dependency order — a reader's FIRST value (a spring primes from `to = { app.targetDay }`) equals what the world settles to | kernel-expr marketmap/calendar ≡ JS |
| `:field` data cells | a numeric cell per (view, field) that follows the record (one tracking bridge rule making the body's own `$data` read); EXPR bodies read the cell; a field that is or becomes non-numeric sends its readers back to their JS bodies | kernel-expr calendar (Cell.x/y, Ev.y/height) ≡ JS |
| the auto-extent rule | `DK_EXTENT` (`kernel_extent_add/rewire`): a container's unset width/height as the max over its children's footprints, evaluated over the table by block base; edges = the children's geometry cells + the child-list cell (re-listed by `childrenMutated`); percent-owned child slots skipped via the owning rule's `DK_PERCENT` flag; a 3D child DECLINES to the JS derive through the new `dk_host.decline` callback | `test/kernel-extent.test.mjs`: 40 containers × 8 perturbations ≡ `extentOf`; decline path |
| the track ring | a tracked read appends its cell to a shared ring (no call); the kernel links a run's reads to the active rule when the body returns, at the next entry and at flush; the runtime drains before every active-rule switch (apply under the outer tracker, `untracked()`); rule states and the pending flag are viewed, not fetched | unit 455/0, kernel traces ≡; Mac: −16% |
| Phase D — native on the Mac | `kernel/src/kernel_jsc.c` (JavaScriptCore C API: the ABI as JS functions, pointers as doubles, zero-copy typed-array views, host callbacks via `setHost`), SwiftPM target `DeclareKernel` (sources mirrored by build-app.mjs), `declare_kernel_install` in Bridge.swift, the loader's `bindWith(x, Mem, …)` over either memory; `DECLARE_NO_NATIVE_KERNEL=1` = WASM for A/B | interpreter, same build: calendar 1328 → 726 ms, desktop seed 208 → 93, weather resize 854 → 634 (native vs WASM); JIT −5% |
| pure method inlining | `app.lerp(a, b, t)` → the method's `return` expression with arguments substituted, for statically known receivers (`app`; `classroot`/`this` when no subclass or use site overrides the name) | kernel-expr calendar 385 → 600 bodies in the kernel |

Measured across four targets (`mac-host/profile/results/MATRIX.md`, the in-page stimuli, main → opt
JS settle): desktop seed −86% Chrome / −83% Mac JIT / −80% Mac interp / −88% iOS sim; desktop
minimize (genie) −50 / −73 / −39 / −49%; weather resize −28 / −69 / −51 / −41%; weather city −46 /
−51 / −15 / −32%; tracker filter −27 / −31 / −27 / −30%; calendar mode −18 / −13 / +2 / −23%. The
interpreter targets gain as the JIT ones do. Frames that did not improve are applier-bound (the
Mac's real-window resize: frost compositing; the iPhone's resize: DOM paint).

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
instantiate+replicate 12.8, scroll physics 2.8); a tight kernel (`-Os`, no libc, `wasm-opt`)
should land near that. **The target is size-neutral, measured at every step**; a build option
would reintroduce the two-implementation drift this design removes, so it is the last resort.

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
