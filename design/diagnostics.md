# Diagnostics & typecheck

**Status:** mechanism + typecheck v1 **implemented + tested** 2026-07-05. The general compile-time diagnostic system (`src/diagnostics.ts`) and the tsc-over-`{ }`-bodies phase (`src/typecheck.ts`) that rides on it.

## 1. The mechanism (all compile-time errors, one system)

Every compile-time error — syntax, structure, type, name resolution, module/include, and the tsc typecheck — is a `Diagnostic`: a stable **code** (`NEO####`), a **severity**, a **phase**, the message, a source **position**, and an optional fix **hint**. One formatter renders them (`formatDiagnostic`). Codes group by phase so a reader (and tooling) classifies at a glance:

| range | phase | covers |
|---|---|---|
| NEO1xxx | syntax | the parser rejects a token/shape |
| NEO2xxx | structure | unknown/duplicate name, a member placed where its node-kind forbids, bad namespace |
| NEO3xxx | type | a value that doesn't fit its slot (coercion), a percent with no axis, a malformed datapath |
| NEO4xxx | name | bare-name resolution (unresolved = error; shadowing = warning) |
| NEO5xxx | module | include resolution (collision, missing, stray root) |
| NEO6xxx | typecheck | a tsc diagnostic over a `{ }` body, mapped to neo |

**Non-breaking interop.** The compiler keeps collecting `NeoError[]` internally (throw + aggregate). A `NeoError` now carries the catalog `code`/`hint` as **additive** metadata (`errors.ts`) — `.message` is unchanged, so the ~180 message-asserting tests keep passing. The catalog factories (`Diag.*`) build *coded* NeoErrors, so a site migrates by swapping `new NeoError(msg, pos)` → `Diag.<kind>(…)` with **no wording change**. `compile()` turns each phase's `NeoError[]` into `Diagnostic[]` at the boundary (`toDiagnostic`), assigning the phase's base code to any error a site hasn't yet given a specific one — so **every** compile error flows through the mechanism and carries a code *today*; migrating a site to a *specific* code is incremental polish.

**The template catalog** is `Diag` (the factory namespace) + `DIAGNOSTIC_CATALOG` (the browsable code→phase→summary table — the data form, for docs / a future `neo explain NEO3001`). Recurring families get a parameterized factory (`unknownComponent`, `unresolved`, `missingInclude`, `typeError`, …); the one-off long tail gets a per-phase family wrapper (`structure`/`type`/`module`/`syntax`) that attaches the family code to a site-composed message.

**Migrated so far:** unknown-component (NEO2001), unresolved-name (NEO4001), shadowing (NEO4002), include collision/missing/stray-root (NEO5001–3), and the whole typecheck phase (NEO6001). The rest fall back to their correct phase code and migrate opportunistically.

**`compile()` output** gained `diagnostics: Diagnostic[]` (the unified, coded view of everything); `errors`/`warnings` remain the raw `NeoError` lists for existing callers.

> **Revision, 2026-07-13 — dual form, one record (ruled).** Every `Diagnostic` now carries its **`rendered`** form — computed ONCE by the producer (definitionally `formatDiagnostic(d)`) — and the result carries **`report`**, the whole compile rendered (a count summary + each diagnostic's `rendered`; `""` when clean). Two rules: **the structure is the truth and `rendered` is a pure function of it** (no information may exist only in the string; a warning renders `warning: `-marked so severity survives); and **rendered text is deterministic plain text** — no color, no terminal-isms; ANSI is a caller-side decoration, never a second format. Consequence, enforced by tests: the CLI, the dev server's `POST /compile` (which now returns the ONE result — `{ source, deps, diagnostics, report }` — and honors `?typecheck`), the browser boots, and the compile Worker all print the **same bytes**; the identical-output invariant covers error text. This is the Rust model (rendered-inside-structured): a dumb consumer shows `rendered` verbatim and cannot drift; a rich consumer reads the fields; when the record grows (related positions, fix-its), dumb consumers inherit the improved rendering with no code change.

## 2. Typecheck (tsc over `{ }` bodies)

APPROACH §5: hand `{ }` bodies to the TypeScript compiler *as a library*, against the typed scaffolding `scaffold.ts` already generates. `typecheck.ts` is the "next slice" that file named — emit a check-block per resolved body, run stock tsc, map diagnostics back to `.declare`. A type error blocks emission like any other, reported as NEO6001 at its `.declare` line.

> **Revision, 2026-07-13 — MANDATORY, and structurally so (ruled).** The checker is no longer an injectable option a front-end could forget to wire (which is exactly how the browser shipped a silent `typecheck` no-op): `compile.ts` imports `typecheckBodies` directly, so the phase exists on every surface **by construction** — there is no compiler entry point without it. It runs **by default**; `typecheck: false` / `?typecheck=0` / `--no-typecheck` is the *explicit* opt-out for a latency-critical loop (a debounced keystroke compile — ~124 ms vs ~15 ms on the flagship until TS-program reuse lands), never a wiring accident. The only host seam left is where the `lib.*.d.ts` texts come from (`provideLib`): Node registers a disk reader, the browser bundle embeds the es2022 closure (~54 KB gz) and registers it at init — and an unregistered provider **throws**, never silently skips. The identical-output invariant now covers the checked compile: Node, the in-browser compiler, and the compile worker produce byte-identical results with typecheck on (tested). The opt-out path keeps its own soundness: constraint-residue analysis (NEO7001) still blocks unanalyzable bodies even when the type phase is skipped.

**The check-block SHAPE** (per `scaffold.ts`), for a resolved body whose bare names are already `this.slot` / `parent.…` / `classroot.…`:

```
const _cN: <SlotTsType> = (function (this: <Self>, parent: <Parent>, classroot: <Root>) {
  return ( <resolved expression body> );
}).call(inst, inst, inst);
```

- `this: <Self>` — the element the body is on: its whole inherited slot set is in scope, so `this.openHeightX` is a TS2339.
- `: <SlotTsType>` — the slot's declared type, via `attrType` + the AttrType→TS map (`tsType`): a boolean flowing into a `Length` slot is a TS2322 across the `[ ]`/`{ }` seam. **This is the whole point.**
- `parent` / `classroot` — the enclosing element and the body root, typed from the tree (immediate parent precise; deeper `parent.parent` rides `View`). A method (statement) body drops the `return (…)` and slot type.
- `.call(inst, …)` — relies on `strictBindCallApply` (tsconfig `strict`) to type the return against the slot and check the scope nouns.

**Line mapping.** Scope resolution splices identifiers *inline* only — never adding/removing a newline — so a resolved body has the same line structure as the source. Each block reproduces the body's lines verbatim; a TS diagnostic's line maps to (block's source start line + its offset within the body), **clamped** into the body's range so an assignment error that tsc reports on the wrapper line lands on the body's first line. v1 reports at **line** granularity (what APPROACH asks).

**v1 scope:** attribute-expression bodies, declaration-default bindings, and method statement bodies are checked. Bodies that embed a **datapath island** (`:path`) are skipped — `:path` is neo surface the runtime rewrites (expr.ts), not TypeScript; typechecking data reads (declare `$data`, neutralize islands to a typed read) is a later slice. Column-accurate positions and typed methods (`name: (p: T) -> R`) are also later.

> **Revision, 2026-07-13 — the zero-false-positive pass (typecheck is now corpus-clean).** The scaffold was upgraded to model what the runtime actually is, and the report to say what §4 demands. Measured: **1470 → 0** typecheck diagnostics across the whole known-good corpus (7 apps + demos + library + the LLM-brief fences), with the catch power *verified* (seam, typo, scope, arity all still block). The pieces:
> 1. **Element instance types.** Every element gets its language-§5 anonymous-subclass type (`_E<n> extends <tag>`, internal-only): inline decls (length decls as accessor pairs), named children, element methods, and a `children` override that is exact when the static child list is homogeneous. Class bodies contribute their named children to the class's own `declare class`; a State's named children hoist to its owner (they reparent when it applies); the root's instance type backs `app` program-wide.
> 2. **The LANGUAGE-API table** (scaffold.ts): the runtime surface a body may READ or CALL that schemas deliberately omit (schemas model the `[ ]`-settable surface) — `Dataset.value/read/set`, `DataSource` lifecycle, `Animator.start`, `Layout.view`, `TweenLayout.laid/retarget`, `Editor.commit/revert`, `View.scrollIntoView`. The type half of effects.ts: declared for language members, derived for user members, no privilege tier.
> 3. **Modeled asymmetries, not suppressions**: length reads are the resolved `number` while writes accept `Length` (divergent accessors); method params are optional (no required-marker exists) but excess args still error; the `parent` MEMBER is `any` (cross-instance hops are unknowable) while the `parent` PARAM stays precise, skipping non-View wrappers (a State's child's parent is the state's host view). Deliberate `any` under-reports (documented in scaffold.ts): record/theme reads, method returns/params, heterogeneous `children`.
> 4. **The message layer** (typecheck.ts `explainTs`): tsc detects, the compiler explains — top families re-said per §4 (the seam error names the canonical ternary rewrite; member misses keep tsc's now-grounded suggestion; internal `_E` names never leak). Unmatched codes fall back to tsc's text, upgraded family-by-family as evals surface what models trip on. TS's implicit-`any` family is suppressed at the report (a demand for annotations the language forbids is unsatisfiable — a guaranteed false positive), NOT via `noImplicitAny:false`, which would change inference.
> 5. **Loop guarantees**: all independent errors in one compile, deterministic order (position, then text), no cascade ghosts; ~+107 ms on the flagship (fresh TS program; program-reuse is the known lever). The `NEO` prefix is now a single constant (`CODE_PREFIX`, diagnostics.ts) ahead of the rename; NEO2001 gained a **calibrated** near-miss suggestion (Damerau distance 1, unique best, case-aware; far names get the rule, not a guess).
> The gate surfaced **8 true positives** in 6 docs demos (members referenced that existed nowhere — `select`, `value`, `split`, `n`, `zip`, `weather`) — real latent errors of exactly the "runs but unsound" class (one *threw* on click, one rendered "count: undefined"). All fixed at their source fences and the demos regenerated; the corpus now typechecks clean end to end. Known gap, deliberate: the docs extractor's island gate (`compilesOK`) runs compile-only — an unsound-but-compiling fence still becomes an island, and the corpus gate is what catches it.

## 3. Open / deferred
- Migrate the remaining `NeoError` sites to specific catalog codes (universality already holds via phase fallback).
- Typecheck datapath-bearing bodies (island → typed data read).
- Column granularity; typed method signatures.
- The in-browser compile path needs the lib.d.ts bundled (today they're read from disk) — see `in-browser-dev.md`.

## 4. Errors are for an LLM (the diagnostic contract)

**Ruled 2026-07-13.** Declare's primary author is a language model, and a model does not read the spec — it reads the **compiler's error and reacts, in a loop**. So error quality *is* language usability, and the diagnostic surface is a first-class design surface, not an afterthought. Four rules every `Diag.*` factory (and every message it wraps) must satisfy:

1. **Name the fix, not just the diagnosis.** The message states the concrete rewrite that resolves it. "cannot statically determine dependencies" is a bug; "`app.days[i]` indexes by a runtime value — read `app.calendar.read([i])` from the Dataset instead" is a diagnostic. A model can apply the second and cannot act on the first.
2. **One canonical fix, not a menu.** When several rewrites would work, the message names *the* one the language prefers. Determinism is what lets a model converge in a single step instead of guessing; a list of options invites thrashing.
3. **The rule is quotable in the message.** The policy each error enforces is tight enough (e.g. constraints.md's two-sentence residue rule) to restate inline, so the model re-learns the rule every time it trips — the error *is* the teaching surface, since nothing else will be read.
4. **Precise position + the offending sub-expression**, so the edit lands on the right token, not the whole body.

This is why the residue policy (constraints.md §3) is a *pointed error naming the rewrite* rather than a silent fallback: a fallback teaches the model nothing and hides the very thing it must learn. The same bar applies to the seam type errors (NEO6001) and everything in the catalog — a diagnostic that only describes the problem has failed its primary reader.
