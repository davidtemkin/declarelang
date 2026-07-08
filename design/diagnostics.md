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

## 2. Typecheck (tsc over `{ }` bodies)

APPROACH §5: hand `{ }` bodies to the TypeScript compiler *as a library*, against the typed scaffolding `scaffold.ts` already generates. `typecheck.ts` is the "next slice" that file named — emit a check-block per resolved body, run stock tsc, map diagnostics back to `.neolzx`. Node-only (imports `typescript`, reads real `lib.d.ts` from disk); it lives on the compile front-end, never in the zero-dependency runtime. **Opt-in** via `compile(src, { typecheck: true })` — a type error blocks emission like any other, reported as NEO6001 at its `.neolzx` line.

**The check-block SHAPE** (per `scaffold.ts`), for a resolved body whose bare names are already `this.slot` / `parent.…` / `classroot.…`:

```
const _cN: <SlotTsType> = (function (this: <Self>, parent: <Parent>, classroot: <Root>) {
  return ( <resolved expression body> );
}).call(inst, inst, inst);
```

- `this: <Self>` — the element the body is on: its whole inherited slot set is in scope, so `this.openHeightX` is a TS2339.
- `: <SlotTsType>` — the slot's declared type, via `attrType` + the AttrType→TS map (`tsType`): a boolean flowing into a `Length` slot is a TS2322 across the `[ ]`/`{ }` seam. **This is the whole point.**
- `parent` / `classroot` — the enclosing element and the body root, typed from the tree (immediate parent precise; deeper `parent.parent` rides `View`). A method (statement) body drops the `return (…)` and slot type.
- `.call(inst, …)` — relies on `strictBindCallApply` (tsconfig `strict`) to type the return against the slot and check the pronouns.

**Line mapping.** Scope resolution splices identifiers *inline* only — never adding/removing a newline — so a resolved body has the same line structure as the source. Each block reproduces the body's lines verbatim; a TS diagnostic's line maps to (block's source start line + its offset within the body), **clamped** into the body's range so an assignment error that tsc reports on the wrapper line lands on the body's first line. v1 reports at **line** granularity (what APPROACH asks).

**v1 scope:** attribute-expression bodies, declaration-default bindings, and method statement bodies are checked. Bodies that embed a **datapath island** (`:path`) are skipped — `:path` is neo surface the runtime rewrites (expr.ts), not TypeScript; typechecking data reads (declare `$data`, neutralize islands to a typed read) is a later slice. Column-accurate positions and typed methods (`name: (p: T) -> R`) are also later.

## 3. Open / deferred
- Migrate the remaining `NeoError` sites to specific catalog codes (universality already holds via phase fallback).
- Typecheck datapath-bearing bodies (island → typed data read).
- Column granularity; typed method signatures.
- The in-browser compile path needs the lib.d.ts bundled (today they're read from disk).
