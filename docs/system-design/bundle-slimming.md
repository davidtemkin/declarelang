# What ships, and why it is not worth shrinking further

**Status: audited 2026-08-02, with one defect found and fixed. The headline is
a NEGATIVE result** — the obvious next move on bundle size does not pay, and
this file exists so nobody spends a fortnight rediscovering that.

A production build already drops what a program cannot reach. The question
asked here was whether it should drop more — specifically whether the data
capabilities added in the 2026-07/08 arc (replication, windowing, datasets,
selectors, schemas) could be gated per app, the way components already are. The
answer is that the machinery would work, and it would buy almost nothing,
because the runtime's floor is not made of unused features. It is made of
kernel.

---

## 1. How slimming actually works today

Two mechanisms, both in `tools/declarec.mjs`, both exact rather than heuristic
in principle:

**The generated registry.** `slimRegistrySource()` writes a replacement
`registry.js` carrying only the component classes the program can construct,
and esbuild's ordinary tree-shaking drops the rest — along with everything
reachable only through them (the Markdown and HTML parsers, the stream
classes). The used-set comes from `usedComponentNames()`
(`compiler/src/declarec.ts`), which is a real scope analysis over the bodies
via `freeIdentifiers`, honouring shadowing, plus the `use [ … ]` keep-list for
anything constructed dynamically. This is the good mechanism: a generated
table, no hand-written stand-ins, nothing to drift.

**Eleven fact-gated substitutions.** Whole modules replaced with stand-ins when
a program fact says they are unreachable: the checker, the inspector bridge and
service, the datapath scanner, and — conditionally — themes, draw, focus/keys,
tips, the viewport lock, the selector evaluator, and the data-shape validator.
These are hand-written, and their facts are computed by REGEXES over body
source (`/\bThemes\b/`, `/\bKeys\b|\bFocus\b/`). That is a heuristic, despite
the comment above it claiming otherwise. It over-approximates, so it is safe,
but it is not the same instrument as the used-set analysis sitting one module
away — and the stubs' export lists are hand-maintained with nothing guarding
them. A missing export fails loudly at build; a stub whose *semantics* drift
from the real module fails silently.

**Module granularity is forced, not chosen.** Most runtime modules call
`defineAttributes` at top level. A module with a top-level side effect cannot
be partially shaken, so the unit of elimination is the whole file. Any future
gating must split modules along capability lines rather than gate within them.

---

## 2. The measurements (2026-08-02)

Whole corpus, production builds, gzipped, runtime share only (program JSON
excluded):

- **Floor: 47 KB.** `App [ Text [ text = "hello" ] ]`, whole platform aboard.
- **Ceiling: 62 KB.** The desktop app, the heaviest in the tree.

**The entire dynamic range of the runtime across every app we have is ~15 KB.**
The eleven existing gates plus registry slimming are what produce that range,
and they operate on roughly the top fifth of the bundle. The other four fifths
are unconditional.

An aggressive-stub experiment — crudely stubbing every plausibly-conditional
module on a hello-world, ignoring whether the result would run — put the
theoretical floor at **~31 KB**, a 36% cut. That is the ceiling of the
opportunity, not a shippable number.

**But the 36% is a cut to hello-world, not to a real app.** Re-run against the
Tracker, the largest program in the corpus, the available levers come to about
**2 KB**: it genuinely uses replication, windowing, datasets, state, animation,
text editing, pointer input, stylesheets and fonts. The capabilities are not
unused. They are near-universal, and the one real exception is discussed in §4.

---

## 3. Why that settles it: the competitive floor

From the React control arm
([evals/comparisons/react-tracker-idiomatic-2026-08-02](../../evals/comparisons/react-tracker-idiomatic-2026-08-02/comparison.md),
measured 2026-08-02), the same Tracker built clean-room in idiomatic React with
nine ecosystem dependencies:

| | Declare | React |
|---|---:|---:|
| Wire, gzipped | **85 KB** | 108 KB |
| Platform floor, gzipped | **47 KB** (hello world, everything aboard) | 61.5 KB (react + react-dom + scheduler, before any app code) |
| App's own share of its bundle | 32 of 85 KB | 12.2 of 108 KB (**89% framework**) |

**We are ~14 KB under React's floor before either app writes a line**, and we
ship 21% less in total on the real app. Spending weeks to widen a lead that is
already there, on a dimension we already win, against a competitor whose floor
is higher than ours, is the wrong use of the time. That is the whole argument.

A note for the record, since it circulated the other way for a day: an earlier
control arm measured 60 KB, and our bundle was described as "un-tree-shaken, a
real cost to own". Both are withdrawn. That arm hand-rolled its virtualizer off
the ecosystem's paved road and bounds a ceiling, not a cost; and the bundle is
tree-shaken, as §1 describes.

---

## 4. Data virtualization — the one real exception, and its tension

Windowing is the only capability a substantial app can plausibly not want.
Calendar and desktop replicate but never virtualize, and `materialize` defaults
to `all`, so today the fact is available for free and purely syntactically:
*does any element declare `materialize` as anything other than `all`?*

Two things stop it being worth doing:

1. **It is not a stub away.** Windowing is interleaved through `Replicator`
   rather than sitting behind the policy slot — the `ExtentLedger`, the
   `windowedActive`/`positioned` state, retention, overscan, logical placement,
   the parent-extent derive. It needs a file split, not a substitution. Worth
   ~4.6 KB gz.
2. **It fights the invisibility ruling.** [materialization.md](materialization.md)
   §1 rules that whether an instance is physically constructed is the runtime's
   business. The doc's stated direction is to flip the default from `all` to
   `auto` once the semantic differ proves invisibility — and **the moment that
   happens, every replicating app carries the virtualizer statically**, because
   `auto` means "decide at runtime". The fact evaporates.

**Flag for whoever flips that default:** doing so forecloses static elimination
of the windowing path. That may well be the right trade — invisibility is the
stronger promise — but it should be a decision, not a side effect.

---

## 5. The one defect found, and fixed

The production entry imported `index.js` — the barrel — for the nine lines that
inject the `{ }`-body services (`Focus`, `Keys`, `Themes`, `Inspect`). esbuild
can only drop a re-export when the module behind it is side-effect-free, and
most of this runtime is not, so the barrel **pinned modules the program could
never reach**: `image.js` and `text-input.js` shipped in a hello-world whose
used-set had correctly excluded Image and TextInput. The registry did its job
and a second door undid it.

Fixed by splitting the wiring into `runtime/src/services.ts`, a side-effect-only
module the production entry imports instead. `index.ts` imports it too, so the
dev path and every embedder are unchanged, and no language surface moves. Worth
~1.1 KB gz on apps that use neither component — but it was worth fixing as a
correctness matter regardless, because a mechanism we rely on had a hole in it.

Guarded by `test/slim.test.mjs` — *"registry exclusion holds through the entry
(no barrel import)"* — which asserts the absence of `image.js`, `text-input.js`
and `index.js` from a hello-world bundle. The guard was verified to fail when
the barrel import is restored. **This failure mode is invisible without a
test**: the bundle is correct, merely larger, and every other test stays green.

---

## 6. If this is ever revisited

Not recommended, but if the constraint changes, the shape is known. Do not add
a twelfth hand-written stub — generalize the mechanism that already works:

- A capability manifest in the runtime, parallel to `REGISTRY_MANIFEST`:
  `{ id, module, install }` per optional capability.
- `instantiate.ts` reaches optional constructs (Replicator, State, Spring, the
  animators, two-way binding, shape validation, stylesheets, fonts) through
  that table instead of hard imports — the same indirection `TAGS` already
  gives components. Its hard imports are why they are all unconditional today.
- declarec generates the manifest subset, exactly as it generates the registry.
  **Zero hand-written stubs.**
- The needed set comes from one `programCapabilities(program)` in the compiler
  sharing `usedComponentNames`'s `freeIdentifiers` walk — retiring the regexes
  for the analysis that is already right there.
- Absence must be LOUD: an unregistered capability throws naming itself and the
  `use [ … ]` escape, the way the selector stub already does, rather than
  silently no-opping the way most of the current stubs do.

The prize is the ~15 KB between floor and ceiling, most of which the biggest
apps genuinely use. Read §2 and §3 again before starting.
