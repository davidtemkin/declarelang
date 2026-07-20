# LZX Source Layer — Design

*Design doc for an LZX (OpenLaszlo 4.9 / "OL5") source layer that transpiles to
Declare. Status: approved for planning, 2026-07-20. Revised after spec review
round 1 (three grounded reviews; findings folded in below and marked where they
changed a decision).*

## Goal

Add LZX as a permanent, in-sync **second input surface** for Declare, and use the
real OpenLaszlo corpus as a **completeness oracle** for the language.

Two intents, mutually reinforcing:

- **B — a living second syntax.** LZX is a first-class input language you author
  and run directly. Someone who knows OpenLaszlo never has to learn the bracket
  surface; the toolchain translates `.lzx` to Declare and runs it. The layer
  stays in sync with the language by construction because it targets the
  **implemented surface** — the actual `runtime/src/parser.ts` grammar,
  `runtime/src/check.ts` semantics, and `runtime/src/schema.ts` attribute tables
  — **not** the prose of Appendix A/B of `design/declare-language.md`. (See
  "Emit contract" below: Appendix B is correspondence *intent*; where it and the
  parser disagree, the parser wins, and the disagreement is itself oracle
  signal.)
- **C — a completeness oracle.** Running the corpus through the layer tells us
  exactly which LZX constructs Declare cannot yet express. Every untranslatable
  construct becomes a prioritized, frequency-ranked gap. There are **two kinds**
  of gap, both valuable (review round 2):
  - **not-yet-designed** — LZX constructs with no Declare surface at all
    (`design/declare-language.md` §13's list: mixins, slots, RPC, …).
  - **designed-but-not-built** — LZX constructs Declare has *documented* (Appendix
    A/B) but whose surface the parser/checker does not yet accept — the
    `state … when { }` sugar, typed methods `m: (a: T) -> R`, path-valued `<-`
    sources. The layer targets the *implemented* surface, so these fall out as
    gaps automatically, quantifying the doc-vs-implementation delta.

These compose: because LZX is a real front-end, the corpus *is* the completeness
test.

## Fidelity boundary — Tier 1 (declarative fidelity)

Real OpenLaszlo 4.9 has two halves: a **declarative skeleton** (canvas, class,
view, attribute, handler, state, datapath, layout) and a **dynamic runtime**
(untyped ActionScript-flavored bodies, `setAttribute`, runtime coercion,
`lz.*`/Flash/DHTML APIs). Declare's thesis is static typing over the first half.

This project targets **Tier 1**: translate the LZX *structure* faithfully; pass
script/constraint bodies through **verbatim** as TypeScript best-effort. An app
"runs" when its declarative skeleton runs. Legacy-JS/Flash idioms in bodies are
*flagged*, not emulated.

Explicitly out of scope: emulating LZX's dynamic-script semantics (Tier 2) and
Flash/DHTML runtime parity (Tier 3).

### The Tier-1 line inside bodies (review round 1, finding 2/C1)

Bodies pass through **verbatim** by default. There is exactly **one** in-body
transform in Phase 1: `setAttribute`/`getAttribute` normalization (Appendix B's
"no bypass" rule, `declare-language.md:672`). It is performed by a
**paren/string-balanced scanner** — not a regex, not a full JS parse — and only
when the call parses unambiguously as `receiver.setAttribute('literalName', expr)`
/ `receiver.getAttribute('literalName')`, where `receiver` is a member path,
the name is a single string literal, and the argument list balances:

- match → rewrite to `receiver.literalName = expr` / `receiver.literalName`
  (the receiver path is preserved verbatim; `this.top.titlebox.setAttribute('fgcolor', 0xFFFFFF)`
  → `this.top.titlebox.fgcolor = 0xFFFFFF`);
- any other form (computed name, spread, unbalanced/nested-beyond-scan,
  non-literal name, a setter on a `degraded` sprite attribute like
  `bkgnd.setAttribute('frame', 2)`) → **pass through verbatim** and record a
  **body-level gap** (`severity: degraded`, `s13Ref: dynamic-body`).

This keeps the transform inside Tier 1: the common, safe case is normalized; the
tail is left as honest, flagged pass-through rather than mis-rewritten. A file
whose bodies are heavily AS-flavored (real corpus: `lz.*` 1,225×, `super.` 410×,
`new lz.*`, `for each`) transpiles its **skeleton** and reports its bodies as
degraded — which is the correct oracle signal, not a failure.

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

### Source-position fidelity (review round 1, finding I3)

`compile()` positions every diagnostic against offsets in the *emitted* Declare
text, and `formatSource` re-flows lines — so **second-order (compile-stage) gaps
are Declare-positioned, not `.lzx`-positioned**. Phase 1 accepts this and
mitigates with a **coarse line-origin map** (`LzxDoc` node `Pos` → emitted line),
built by the emitter *before* formatting, so a second-order diagnostic can be
traced back to its originating `.lzx` element best-effort. A byte-accurate source
map is out of scope for Phase 1. First-order gaps (from `map.ts`/`gaps.ts`)
always carry the true `.lzx` `Pos`.

### Why the readable `.declare` artifact matters

It is the single feature that serves both goals: B can *eject* to it (author
`.lzx`, print Declare at any time, or walk away from LZX entirely) and C can
*inspect* it and *re-run it through the real compiler* for the second-order gap
pass. (Note: `compile()` may auto-include libraries and inject `FocusRing`
(`compile.ts:228`); the emitted artifact is therefore the *pre-compile* Declare,
and the harness diffs that, not the compiler's internal merged text — review
round 1, finding M6.)

## Area layout

A new `lzx/` area, peer to `runtime/` and `compiler/`, co-locating `src/` +
committed `dist/` like the other areas:

```
lzx/
  src/
    parse.ts      # .lzx XML text → LzxDoc (the LZX AST)
    naming.ts     # LZX names → Declare identifiers (schema-derived tables + collision handling)
    map.ts        # LzxDoc → Declare Element fragments; the Appendix-B core
    gaps.ts       # the gap registry — unmapped constructs → structured diagnostics
    emit.ts       # Declare Element fragments → house-style .declare text (+ origin map)
    transpile.ts  # the one entry: lzxToDeclare(src, opts) → { declare, gaps, diagnostics, originMap }
  dist/           # committed, like every area
  test/           # unit + golden + corpus-sweep harness
tools/
  lzx-transpile.mjs  # CLI/harness driver: lzxToDeclare → compile() → run/report (review finding #7)
```

`transpile.ts` is a **pure function**, no I/O. It depends one-way on `runtime/`
(reuses `parser.ts` types + `Element` builders, `errors.ts`, the static
`schema.ts` tables, and the canon formatter) and knows nothing about
`compiler/`. The `tools/lzx-transpile.mjs` driver — the only impure piece — wires
`lzxToDeclare` → existing `compile()` for the "run"/report path.

## Components

### `parse.ts` — the LZX AST

A deliberately **thin, XML-faithful** tree — *not* Declare-shaped (that is
`map.ts`'s job). One node type carrying: tag (with any namespace prefix intact),
ordered attributes (name → raw string + the LZX `type` hint), children, and
text/CDATA content, each with a source `Pos`. The parser records what the XML
*says*; every semantic decision lives in `map.ts` where it is testable in
isolation. `LzxDoc` is the **stable seam** of the whole design (see In-DOM).

Parser is a **hand-written, tolerant XML reader** (not a strict validator). It
**must** (review round 1, finding 3, grounded in corpus counts):

- treat **CDATA** sections as **opaque raw text** (~20% of files wrap script
  bodies in CDATA precisely because they contain `<`, `>`, `&&`);
- **decode the five XML entities** (`&lt;` `&gt;` `&amp;` `&quot;` `&apos;`) in
  text and attribute values (`&lt;` appears in ~2,000 files — bodies that escape
  operators instead of using CDATA);
- **preserve body text byte-faithfully** so the balanced scanner (Tier-1 line)
  operates on true source;
- carry **namespace-prefixed tags** (`ns:tag`, e.g. WSDL/SOAP fixtures) through
  as opaque tags (no built-in mapping → gap);
- skip comments, `<?pi?>`, and `<!DOCTYPE>`.

No external XML dependency — the tree stays zero-dep and browser-loadable.

### `naming.ts` — identifier mapping (schema-derived, collision-aware)

Load-bearing and fiddly, so its own unit. **Not a pure casing function** (review
round 1, finding 4). Three parts:

- **Built-in tag/attribute tables, generated from `runtime/src/schema.ts`, not
  from Appendix B prose** (review round 1, finding M5 — `backgroundColor` was
  retired; the slot is `fill`). `canvas→App`, `view→View`, `text→Text`,
  `button→Button`, `simplelayout→SimpleLayout`, `dataset→Dataset`; attribute
  aliases `bgcolor→fill`, `minheight→minHeight`, `onclick→onClick`, `valign`,
  `fgcolor`, … derived by matching LZX names against the schema's real attribute
  keys. A tag neither in the table nor a user `<class name=...>` is a library
  component or a gap. The table is **schema-anchored**: every alias *target* is
  validated against a real `schema.ts` attribute key, but the aliases themselves
  are explicit semantic overrides (`bgcolor→fill`, `fgcolor→textColor`), not
  literal name matches (review round 2 nit).
- **User-class name normalization with case-insensitive identity.** LZX
  resolves tags/classes **case-insensitively**, so `weatherSummary`,
  `WeatherSummary`, and `weathersummary` are **one** class — canonicalize to the
  declared form and reuse it at every reference site. Names already carrying
  case (82/675 corpus classes: `conditionIcon`, `BackendService`,
  `_componentmanager`) are **preserved**, not force-PascalCased.
- **Collision detection.** When two distinct LZX names would map to the same
  Declare identifier (`BorderedBox`/`borderedbox`), emit a **diagnostic** rather
  than silently collapsing. Leading underscores / hyphens / digits go through an
  explicit override entry, not a lossy transform.

### Emit contract — the parser grammar, not Appendix B prose (review round 2)

`map.ts` emits only surfaces the committed `runtime/src/parser.ts` +
`runtime/src/check.ts` actually accept. Verified conflicts where Appendix A/B
document a surface the parser rejects today — each becomes a
**designed-but-not-built** gap rather than an emit target:

- **States.** `state … when { }` is **not** a parser production; a state is a
  `State`-descended **child element** (`check.ts:677`, `checkStateNode`), and
  user-subclassing `State` "isn't wired yet" (`check.ts:161`). `map.ts` emits the
  parser-accepted state-element form; the `when {}` sugar is not a target
  (`s13Ref: state-when-sugar`).
- **Methods** are emitted **untyped** (`m(a) { }`) — the typed `m: (a: T) -> R`
  form of Appendix B does not parse (parser header, lines 5–9); dropped AS3
  `:Type` annotations on `args=` note `s13Ref: typed-method`.
- **`<-` subscription sources** accept a **bare identifier only** (parser.ts:631);
  a path source (`classroot.ms`, `lz.GlobalMouse`) is a gap (below).

Where the parser is *ahead of* the intent, or simply differs, the parser is
authoritative. The delta feeds goal C.

### `map.ts` — the parser-surface mapping core

A dispatch over `LzxDoc` nodes producing **Declare `Element` fragments** (the
runtime's AST shape — see emit interface, below). Each rule is small and
independently testable. Confirmed against real corpus LZX:

- **Constraint / liveness prefixes** (review round 1, finding 2, grounded:
  `${}` 3,362×, `$once{}` 591×, `$path{}` 181×, `$always`/`$immediately`
  present): `attr="${expr}"` and `type="expression"` → `{ expr }` (live);
  `$path{'…'}` → a datapath constraint; **`$once{}` → first-order gap**
  (`s13Ref: constraint-timing` — `once { }` is only *proposed* in §13, not
  settled); `$always`/`$immediately` → gaps likewise.
- **Attribute value typing — explicit precedence** (review round 1, finding 1/I2
  — the transpiler runs *before* `compile()`, so no resolved user-schema chain
  exists; user-schema resolution pre-compile is a non-goal): (1) LZX `type=`
  hint if present (present on ~50% of `<attribute>`s: string/number/boolean/
  color/expression); (2) the **built-in** static schema from `schema.ts` keyed
  by Declare tag+attr; (3) an in-file `<attribute type=…>` declaration the
  transpiler has itself seen on the enclosing class; (4) **literal fallback**.
  This is `map.ts`'s one sanctioned reach outside `LzxDoc`, into the static
  `schema.ts` tables (allowed by the one-way `runtime/` dependency).
- **`setAttribute`/`getAttribute`** — normalized by the balanced scanner per the
  Tier-1 line above (verbatim + gap on the ambiguous tail).
- **Handlers.** `<handler name="onclick">…</handler>` → `onClick() { … }`;
  `onclick="…"` attribute form → same. `reference="src"` → `onX() <- src { … }`
  **only when `src` is a bare identifier**; a path source (`classroot.ms`,
  `lz.GlobalMouse`; `reference=` used ~1,026×, mostly paths) → `degraded` gap
  (`s13Ref: subscription-source`). **`on<attribute>` change-handlers**
  (`onwidth` 150×, `onvalue`, `ontext`) are LZX attribute-change events with no
  Declare handler surface (Declare models these as reactive constraints, not
  handlers) → `degraded` gap (`s13Ref: attr-change-handler`), distinct from
  DOM-style `onclick`.
- **Datapaths — the largest first-order gap (review round 2), only the trivial
  tail maps.** Declare's `:path` grammar is dotted-identifier + optional `[]`
  (`parser.ts parsePath`) and lands on **JSONPath**; real LZX `datapath=`/`$path{}`
  is **XPath** (4,602 `datapath=` attrs; **~63% non-trivial**: predicates `[1]`,
  `text()`, dataset-qualified `ds:/a/b`, functions `position()`). The trivial
  single-field / `@attr` forms map (`$path{'@day'}` → `:day`,
  `datapath="item/@code"` → `:item.code`); every predicate/`text()`/qualified/
  function form is a `degraded`-or-`blocking` gap (`s13Ref: datapath-xpath`).
  This hits the weather fixture directly (its `@code`/`@day` map; its `item[1]`
  indexed paths do not).
- **States are not a blanket 1:1** (review round 2; 726 uses, **0** `when=`, 366
  `applied=`). `<state applied="${expr}">` → the reactive gate form with
  `{ expr }` (recoverable); `applied="literal"` or code-driven `apply()`/
  `remove()` → the code-driven state form (§10 supports both) or `degraded`.
  A `<state>` containing `<animatorgroup>`/`<animator>` → state end-states
  without the timeline (`s13Ref: animation-choreography`). Any `<state>` form
  that does not reduce to a parser-accepted state element (e.g. dynamic
  `apply()`/`remove()` with no recoverable predicate) → `s13Ref: state-form`.
- **Text content → the natural attribute.** `<button>Move me</button>` →
  `text = "Move me"` (per-tag rule).
- **Canvas-level knobs with no App slot** (`debug=` 672×, `proxied=`, `history=`,
  `compileroptions=`) → dropped with an `info`-level note, not emitted.
- **`id` vs `name`.** Both → a named child `foo: Type [ … ]`. A **cross-subtree
  reference to an LZX `id`** (a global handle reached from a sibling subtree) has
  **no Declare lexical-scope surface** (§11) and is a **`blocking` gap**, not a
  silent broken emit (review round 1, finding 3/I3-consistency).

### `gaps.ts` — the completeness oracle (C)

Every construct with no settled Declare surface produces a structured
`Gap { kind, pos, s13Ref, severity, note }`:

- **`blocking`** — cannot emit valid Declare (e.g. `<mixin>` / `with=`;
  cross-subtree `id`). Emit a commented stub + record the gap; the file is marked
  non-transpilable.
- **`degraded`** — emits runnable Declare minus fidelity (e.g. `<animatorgroup>`
  → state end-states without the timeline; `<resource><frame>` sprites → a flat
  resource; the ambiguous `setAttribute` tail; AS-flavored bodies).

Each gap carries its **§13 reference** or a designed-but-not-built category:
`animation-choreography`, `resources-and-fonts`, `slots-placement`, `modules`,
`constraint-timing`, `imperative-data-mutation`, `dynamic-body`,
`datapath-xpath`, `subscription-source`, `attr-change-handler`, `state-form`,
`typed-method`, `state-when-sugar`, …. The harness aggregates these into
a frequency-ranked report — *that is the oracle output* — which directly
re-prioritizes §13. Counts use the **deduplicated 1,816-file set**, not §13's
worktree-inflated numbers (review round 1, finding 7/8).

### `emit.ts` — AST fragments → text (interface pinned)

**Resolves open question #1** (review round 1, findings 4/5, and I4): `map.ts`
produces Declare **`Element` fragments** and `emit.ts` **serializes** them, *not*
free-form text templates. Reason: `formatSource` is **not** a forgiving cleanup
pass — it runs a full structural `analyze()` + a `verify()` gate that **throws
`FormatError` on structurally-invalid or token-changed input** (`format.mjs`).
Serializing from a well-formed `Element` tree guarantees bracket/brace balance;
free-form templates do not. Bodies are opaque strings placed into `{ }` / method
slots — their *internal* validity is the compile stage's concern, but the
serializer guarantees the surrounding structure balances. After serialization,
pipe through `formatSource` for house style. The emitter also produces the coarse
origin map (above).

**Class ordering (review round 2, I3).** `check.ts:138` requires a base class to
be declared **above** its subclass within the single emitted file (`compile.ts`'s
dependency-first ordering applies only to *separate* included libraries). The
emitter therefore **topologically sorts user classes base-first** by `extends`
before serializing. Rare in the corpus (in-file forward refs found in ~2 files),
but a correctness requirement with a trivial fix.

### `transpile.ts`

The one entry point:
`lzxToDeclare(src, opts) → { declare, gaps, diagnostics, originMap }`. Pure, no
I/O, browser-safe.

## Testing & the corpus harness

TDD, pure functions throughout. Fixtures from `../openlaszlo-5.0`:

1. **Reference ladder (the Phase-1 pass/fail set)** — the single-construct
   `docs/reference/programs/*.lzx` that fall **within settled constructs**, each
   a focused golden test (`button-1.lzx` → expected `.declare`). One construct,
   one assertion. Reference programs exercising unsettled constructs
   (`animator-1.lzx`, …) are asserted only to **produce the expected gap**, not a
   golden translation.
2. **Golden app — oracle fixture, NOT a diff target** (review round 1, finding
   1, grounded): `examples/weather/weather.lzx` is a hand-idealization away from
   Appendix A's `weather.declare` (`<datapointer>`→`DataSource` is a
   re-architecture with *no* LZX predecessor; undefined library components;
   `<animatorgroup>`→states; indexed XPath datapaths). It is asserted to
   **transpile without crashing and produce the expected gap set + coverage
   report**, not to equal `weather.declare`. Appendix A remains the *aspirational*
   target reachable only once the relevant §13 gaps are filled.
3. **Corpus sweep** — all 1,816 files through `lzxToDeclare` → `compile()`,
   producing the coverage report (transpiled / degraded / blocked, with the
   ranked gap table). **A reported metric, not a pass/fail gate**: a regression is
   "coverage dropped," tracked over time.

Unit tests per mapping rule (`map.ts`), per naming entry + each collision case,
per parser concern (CDATA opacity, entity decode, scanner balance).

## Phasing

- **Phase 1 — settled-construct MVP.** `parse.ts` + `naming.ts` + `map.ts`
  (settled constructs) + `gaps.ts` + `emit.ts` + `tools/lzx-transpile.mjs` +
  reference-ladder goldens + weather-as-oracle-fixture. Deliverable: settled-
  construct `.lzx` transpiles and runs; the oracle reports; weather transpiles
  (skeleton) and reports its gaps.
- **Phase 2 — corpus scale + gap-driven iteration.** Corpus sweep across all
  1,816 files; each high-frequency gap becomes a language-design ticket against
  §13.
- **Phase 3 — in-DOM LZX (the "html layer").** A second front-end,
  `parse-dom.ts`, walks a live DOM subtree (inline `<canvas>` markup, or a
  `<script type="application/lzx">` block) into the *same* `LzxDoc`; bundle
  `lzxToDeclare` into the browser boot path next to `declare-compiler.js`, so
  inline LZX transforms and runs client-side. Everything downstream
  (`map`/`gaps`/`emit`) is unchanged — the thin `LzxDoc` seam is what makes this
  a small addition rather than a rewrite. (Requires factoring `formatSource`'s
  pure core out of the `node:fs` top-import in `tools/format.mjs`, or relying on
  tree-shaking — `formatSource` itself is pure; review round 1, finding I4/#9.)

## Corpus location

`../openlaszlo-5.0` (i.e. `/Users/maxcarlsonold/openlaszlo-5.0`) — a full
OpenLaszlo 5.0 distribution: **1,816 unique `.lzx` programs** (excluding the
`.claude/worktrees/` duplicates that inflate a raw count to 10,899, and `.git`),
the golden `examples/weather/weather.lzx`, and 119 single-construct
`docs/reference/programs/*.lzx`. (§13 of `declare-language.md` cites "~2,000"
from the pre-dedup count; the 1,816 dedup figure is the one the gap ranking
uses — reconcile as a footnote when §13 is next touched.)

## Resolved review questions

- **Emit interface** — pinned to `Element`-fragments-and-serialize (not text
  templates); component descriptions updated to match.
- **Attribute-type inference** — explicit 4-step precedence; no pre-compile
  user-schema resolution.
- **`setAttribute` rewrite** — balanced scanner, `this`-and-path receivers,
  verbatim+gap on the ambiguous tail.
- **`id` global reach** — `blocking` gap.
- **Naming** — schema-derived tables + case-insensitive identity + collision
  diagnostics.
- **weather golden** — demoted to oracle fixture.
- **Name/alias table source** — `runtime/src/schema.ts`.

## Remaining open questions for planning

- Exact `formatSource` browser-bundle reuse path (Phase 3): factor the pure core
  out of the `node:fs` import, or rely on tree-shaking.
- The precise `s13Ref` enum (the closed set of gap categories) — the list in
  `gaps.ts` above is the seed (each entry now has a producer site in map.ts / the
  Emit contract); finalize the closed set during `gaps.ts` implementation.
- Whether the coarse origin map is line-granular or element-granular (Phase 1
  leans line-granular; confirm when wiring the harness).
