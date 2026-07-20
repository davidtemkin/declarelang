# LZX Source Layer — Design

*Design doc for an LZX (OpenLaszlo 4.9 / "OL5") source layer that transpiles to
Declare. Status: approved for planning, 2026-07-20.*

## Goal

Add LZX as a permanent, in-sync **second input surface** for Declare, and use the
real OpenLaszlo corpus as a **completeness oracle** for the language.

Two intents, mutually reinforcing:

- **B — a living second syntax.** LZX is a first-class input language you author
  and run directly. Someone who knows OpenLaszlo never has to learn the bracket
  surface; the toolchain translates `.lzx` to Declare and runs it. Because the
  translation targets Declare's *documented* surface (Appendix B of
  `design/declare-language.md`), the layer stays in sync with the language by
  construction.
- **C — a completeness oracle.** Running the ~1,816-program corpus through the
  layer tells us exactly which LZX constructs Declare cannot yet express. Every
  untranslatable construct becomes a prioritized, frequency-ranked gap against
  `design/declare-language.md` §13 ("What is not settled").

These compose: because LZX is a real front-end, the corpus *is* the completeness
test.

## Fidelity boundary — Tier 1 (declarative fidelity)

Real OpenLaszlo 4.9 has two halves: a **declarative skeleton** (canvas, class,
view, attribute, handler, state, datapath, layout) and a **dynamic runtime**
(untyped JavaScript bodies, `setAttribute`, runtime coercion, Flash/DHTML APIs).
Declare's thesis is static typing over the first half.

This project targets **Tier 1**: translate the LZX *structure* faithfully; pass
script/constraint bodies through as TypeScript best-effort. An app "runs" when
its declarative skeleton runs. Legacy-JS/Flash idioms in bodies are *flagged*,
not emulated. This is the cleanest oracle — untranslatable structure is a real
language gap, not runtime archaeology.

Explicitly out of scope: emulating LZX's dynamic-script semantics (Tier 2) and
Flash/DHTML runtime parity (Tier 3).

## Architecture — source-to-source, upstream of `compile()`

The existing compiler is already source-to-source: `compile()` parses Declare
text, resolves scope, typechecks, strips types, and emits *resolved Declare
text* that the zero-dependency runtime consumes. `Program`/`Element` (from
`runtime/dist/parser.js`) is the shared AST.

The LZX layer is a **pure front-end that emits `.declare` text**, sitting
upstream of the unchanged `compile()`:

```
.lzx ──lzxToDeclare──▶ .declare text ──compile()──▶ resolved JS
        │                              │
        └─ first-order gaps            └─ second-order gaps
           (no Declare surface)           (maps but won't typecheck/run)
```

This two-stage pipeline serves C for free: a construct with **no mapping** is a
first-order gap reported at transpile time; a construct that **maps but does not
typecheck or run** is a second-order gap the real compiler catches downstream.

Two architectures were rejected:

- **Parallel front-end into the shared `Program` AST** (LZX → `Program`
  directly, skipping Declare text). Faster and marginally more faithful, but it
  destroys the readable `.declare` artifact — which is exactly what makes B
  (eject to Declare) and C (inspect the translation) work — and couples LZX to
  an internal AST less stable than the published surface.
- **LZX as an alternate skin inside the existing parser.** XML (namespaces,
  entity refs, attr-vs-child ambiguity, CDATA) is different enough from the
  bracket grammar that fusing them makes the clean parser fragile for little
  gain.

### Why the readable `.declare` artifact matters

It is the single feature that serves both goals: B can *eject* to it (author
`.lzx`, print Declare at any time, or walk away from LZX entirely) and C can
*inspect* it and *re-run it through the real compiler* for the second-order
gap pass.

## Area layout

A new `lzx/` area, peer to `runtime/` and `compiler/`, co-locating `src/` +
committed `dist/` like the other areas:

```
lzx/
  src/
    parse.ts      # .lzx XML text → LzxDoc (the LZX AST)
    naming.ts     # lowercase LZX names → Declare identifiers (tag & member maps)
    map.ts        # LzxDoc → Declare AST fragments; the Appendix-B core
    gaps.ts       # the gap registry — unmapped constructs → structured diagnostics
    emit.ts       # Declare AST fragments → house-style .declare text
    transpile.ts  # the one entry: lzxToDeclare(src, opts) → { declare, gaps, diagnostics }
  dist/           # committed, like every area
  test/           # unit + golden + corpus-sweep harness
```

`transpile.ts` is a **pure function**, no I/O. It depends one-way on `runtime/`
(reuses `parser.ts` types, `errors.ts`, and the canon formatter) and knows
nothing about `compiler/`. The CLI/harness wires `lzxToDeclare` → existing
`compile()`.

## Components

### `parse.ts` — the LZX AST

A deliberately **thin, XML-faithful** tree — *not* Declare-shaped (that is
`map.ts`'s job). One node type carrying: tag, ordered attributes (name → raw
string + the LZX `type` hint), children, and text/CDATA content, each with a
source `Pos`. The parser records what the XML *says*; every semantic decision
lives in `map.ts` where it is testable in isolation.

`LzxDoc` is the **stable seam** of the whole design (see In-DOM, below).

Parser is a **hand-written, tolerant XML reader** (not a strict validator):
real corpus LZX has HTML-ish entities, comments, CDATA, and namespace prefixes.
Lenient in, structured errors out. No external XML dependency — the tree stays
zero-dep and browser-loadable.

### `naming.ts` — identifier mapping

Load-bearing and fiddly, so its own unit; two pure, table-driven mappings:

- **Built-in tag map** — `canvas→App`, `view→View`, `text→Text`,
  `button→Button`, `simplelayout→SimpleLayout`, `class→class`,
  `dataset→Dataset`, `state→state`, … (Appendix B, extended). A tag neither in
  the map nor a user `<class name=...>` is a library component or a genuine gap.
- **Identifier casing** — user class names and tags lowercase→PascalCase
  (`weathertab→WeatherTab`, `basetabelement→BaseTabElement`); member/attribute
  names normalize to camelCase via an explicit alias table
  (`bgcolor→backgroundColor`, `minheight→minHeight`, `onclick→onClick`,
  `valign→…`). Explicit data, not scattered casing heuristics.

### `map.ts` — the mapping core (Appendix B, made executable)

A dispatch over `LzxDoc` nodes producing Declare AST fragments. Each rule is
small and independently testable. Confirmed against real corpus LZX:

- **Attribute value typing.** LZX carries a `type` hint: `type="expression"` →
  `{ expr }`; `type="string"` → literal string; `type="number"`; absent →
  infer from the *target attribute's* declared type via the runtime schema,
  falling back to a literal. `bgcolor="#EAEAEA"` → `backgroundColor = #EAEAEA`;
  `applied="${demo.maximized}"` → `when { demo.maximized }`.
- **`setAttribute('x', v)` → `x = v`** and `getAttribute('x')` → `x`, rewritten
  inside `${…}` / handler / method bodies (Appendix B's "no bypass" rule). A
  scoped source-rewrite in body text, not a full JS parse — regex-guarded and
  flagged when ambiguous.
- **Handlers.** `<handler name="onclick">…</handler>` → `onClick() { … }`;
  `onclick="…"` attribute form → same; `reference="src"` → `onX() <- src { … }`.
- **Text content → the natural attribute.** `<button>Move me</button>` →
  `text = "Move me"` (per-tag rule: button/text take content as `text`).
- **`id` vs `name`.** LZX `id` (global handle) and `name` (data/child handle)
  both → a named child `foo: Type [ … ]`. A table notes where `id` implied
  global reach so the gap registry can flag a scope difference.

### `gaps.ts` — the completeness oracle (C)

Every construct with no settled Declare surface produces a structured
`Gap { kind, pos, s13Ref, severity, note }`:

- **`blocking`** — cannot emit valid Declare (e.g. `<mixin>` / `with=`). Emit a
  commented stub + record the gap; the file is marked non-transpilable.
- **`degraded`** — emits runnable Declare minus fidelity (e.g. `<animatorgroup>`
  → state end-states without the timeline; `<resource><frame>` sprites → a flat
  resource). Runs, but lossy.

Each gap carries its **§13 reference** (`animation-choreography`,
`resources-and-fonts`, `slots-placement`, `modules`, …). The harness aggregates
these into a frequency-ranked report — *that is the oracle output* — which
directly re-prioritizes §13.

### `emit.ts`

Emit correctness-first Declare (valid, parseable, possibly ugly), then pipe
through `formatSource` (the pure canon formatter exported by
`tools/format.mjs`, the one behind the pre-commit hook). Small emitter surface,
guaranteed house style, zero style drift.

### `transpile.ts`

The one entry point: `lzxToDeclare(src, opts) → { declare, gaps, diagnostics }`.
Pure, no I/O, browser-safe.

## Testing & the corpus harness

TDD, pure functions throughout. Three graduated tiers, matching fixtures already
present in `../openlaszlo-5.0`:

1. **Reference ladder** — the 119 single-construct
   `docs/reference/programs/*.lzx`, each a focused golden test (`button-1.lzx` →
   expected `.declare`). One construct, one assertion.
2. **Golden app** — `examples/weather/weather.lzx` → its `.declare`, diffed
   against the hand-written `weather.declare` in Appendix A as the fidelity
   north star.
3. **Corpus sweep** — all 1,816 files through `lzxToDeclare` → `compile()`,
   producing the coverage report (transpiled / degraded / blocked, with the
   ranked gap table). **A reported metric, not a pass/fail gate**: a regression
   is "coverage dropped," tracked over time.

Unit tests per mapping rule (`map.ts`) and per naming entry; golden tests for
the reference ladder.

## Phasing

- **Phase 1 — settled-construct MVP.** `parse.ts` + `naming.ts` + `map.ts`
  (settled constructs) + `gaps.ts` + `emit.ts` + reference-ladder & weather
  goldens. Deliverable: `.lzx` files transpile and run; the oracle reports.
- **Phase 2 — corpus scale + gap-driven iteration.** Corpus sweep across all
  1,816 files; each high-frequency gap becomes a language-design ticket against
  §13.
- **Phase 3 — in-DOM LZX (the "html layer").** A second front-end,
  `parse-dom.ts`, walks a live DOM subtree (inline `<canvas>` markup, or a
  `<script type="application/lzx">` block) into the *same* `LzxDoc`; bundle
  `lzxToDeclare` into the browser boot path next to `declare-compiler.js`, so
  inline LZX transforms and runs client-side. Everything downstream
  (`map`/`gaps`/`emit`) is unchanged — the thin `LzxDoc` seam is what makes this
  a small addition rather than a rewrite.

## Corpus location

`../openlaszlo-5.0` (i.e. `/Users/maxcarlsonold/openlaszlo-5.0`) — a full
OpenLaszlo 5.0 distribution: 1,816 unique `.lzx` programs (excluding git
worktrees), the golden `examples/weather/weather.lzx`, and 119 single-construct
`docs/reference/programs/*.lzx`.

## Open questions for planning

- Whether the emitter builds Declare-shaped `Element` structures and serializes,
  or emits text templates directly before `formatSource`. (Leaning text
  templates — smaller surface — but confirm against the formatter's tolerance
  for un-canon input.)
- The `bgcolor→backgroundColor` alias table's initial coverage — seed from
  Appendix B + the reference-ladder tags, grow from corpus gaps.
- Exact `formatSource` reuse path for the browser bundle (factor its pure core
  out of the `node:fs` import in `tools/format.mjs`, or rely on tree-shaking).
