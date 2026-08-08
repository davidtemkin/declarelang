# `declare-help` — one help CLI over the whole documentation spine

**Status: DESIGN, ready for implementation handoff. 2026-08-06. Renamed `doc` → `declare-help` 2026-08-07 (ruling: the name follows the behavior — answering in the compiler's register — not the source; and it leaves headroom beyond docs query). Implementation in flight.**
Companion to `doc-system.md` (the spine and its projections) and `diagnostics.md`
§4 (the message register this tool must share).

## 1. Why (evidence, not taste)

Five app-scale eval runs supplied the case:

- Every strong agent **hand-built this tool per run**: "I queried the JSON with
  `node -e` perhaps twenty times" (cadence-3); venue-striking grepped
  `spine.schemas`; lightwell did both. The access pattern is proven; only the
  packaging is missing.
- **The rotation incident** (lightwell): the agent looked "rotation" up *first*,
  found nothing in `reference`, and correctly concluded it impossible — while
  `runtime/src/check.ts:1256` (`CSS_ATTRIBUTE_HINTS`) held a complete answer it
  could only receive by *writing the mistake*. Placement failures (`View.claim`
  absent from the gestures ownership table, `App.scrolls` default absent from the
  schema, the hint table itself) are one disease: knowledge exists in exactly one
  place and the reader must guess which.
- `docs/declare-model.json` is 3.5 MB with a 46 KB longest line — a raw read is a
  context hazard; grep payload depends on file-layout luck.

## 2. The one-sentence design

A node script, `tools/declare-help.mjs` (invoked as `node tools/declare-help.mjs <query>`), that answers
name-shaped and concept-shaped questions from the **existing generated spine** in
the **compiler's diagnostic register** — including calibrated did-you-mean and
first-class negative knowledge — with a hard token budget per answer.

## 3. Query grammar and behavior

| query shape | example | behavior |
|---|---|---|
| dotted, exact | `Slider.value` | the reference entry, scoped: type, default, read-only flag, doc prose, see-also |
| dotted, near-miss | `Text.lineheight` | scope = Text's member set (the compiler's own situation, minus a position): `Text has no 'lineheight' — did you mean 'lineHeight' (a multiplier of fontSize; measurement follows it)?` |
| bare class | `Segmented` | member table (attrs · methods · events, one line each) + its library file path + "ask for any member" |
| bare attribute | `lineHeight` | ranked list of classes carrying it; **no single literal guess** — unscoped sets are large, so thresholds are stricter than the compiler's |
| foreign/retired name | `borderWidth`, `zIndex`, `Segment` | the hint/retired tables verbatim: name the real concept and the rewrite |
| concept keyword | `rotation`, `bold inside a label`, `cover crop` | retrieval over reference prose + guide headings + negative-knowledge entries; answer is the entry or the honest absence (below) |
| enum/token | `fontWeight tokens`, `scrolls` | the token list with one-line glosses |
| diagnostic code | `DECLARE7001` | the rule, the real triggers, the fix — same text the compiler would emit |

**Negative knowledge is a success, not a miss.** `declare-help drawImage` →
*"No `d.drawImage` — `Draw` cannot rasterize a picture. A picture is an `Image`
view (`stretches = cover|contain`, `tint`), and it rotates and scales like any
view (`rotation`, `scale`). What remains unreachable is compositing a decoded
bitmap INSIDE a `draw(d: Draw)` recording."* Exit code 0. A true miss (no entry
anywhere) exits 1 and says what *was* searched, so an agent can trust silence.
(This section's original worked example was `rotation`, back when no View
rotation existed; the compositing arc landed it as a real attribute days later
and the query now answers positively — negative knowledge is curated precisely
so an answer flips the day the platform does.)

**Output contract:** plain text in the diagnostic register (rule-stating,
fix-naming, never cute), ≤ ~40 lines per answer, elision by pointer ("…and 12
more members — `declare-help Slider --all`"). `--json` for tooling. Deterministic:
same query, same bytes.

## 4. Sharing the teacher (the load-bearing constraint)

One corpus, one scoring discipline, two front ends. Concretely:

- **Refactor, don't copy:** extract from `runtime/src/check.ts` into a shared
  module (`runtime/src/teach.ts` or similar): `CSS_ATTRIBUTE_HINTS` (:1256), the
  retired-spelling tables, `nearestName` and its calibration (:1297–1344,
  including the "a suggestion can only name something the very next compile
  would accept" rule — which for the CLI becomes *"only name something a lookup
  of the suggestion would answer"*). The checker and the CLI both import it.
  **Acceptance: zero duplicated hint strings in the tree.**
- Vocabularies come from `declare-model.json` only (it is already a projection
  of the schemas — see `tools/internal/doc/assemble.mjs`). The CLI adds **no new
  truth**; it may add a small curated `concepts` table (synonym → entry) which
  lives in the doc pipeline beside the prose and rides `assemble.mjs` so the
  spine gates cover it.
- Scope provenance is the one real difference (compiler: from the parse; CLI:
  inferred from query shape). Dotted queries converge to the compiler's case
  exactly; bare and concept queries use CLI-only ranking with stricter
  confidence, per §3.

## 5. What must change to point at the tool

1. **`skill/SKILL.md:84`** — replace "go to `docs/declare-model.json` … grep its
   `spine` and `reference` rather than reading it whole" with the CLI as the
   *primary* verb (`node tools/declare-help.mjs <name-or-question>`), keeping grep as the
   named fallback. (The enforced byte-copy at `.claude/skills/declare/SKILL.md`
   follows via `assemble.mjs`.)
2. **`docs/declare.md:21`** — the map's `declare-model.json` row gains the
   command as the way in; the file remains documented as the underlying store.
3. **`docs/guide/17-with-an-llm.md`** — the lookup loop teaches the CLI.
4. **`docs/operational/`** — a short `help.md` (command, query shapes, the
   negative-knowledge contract), linked from `getting-started.md`.
5. **Eval harness tool contract** — `evals/apps/README.md` sandbox procedure and
   the standard run prompt gain one line ("facts about components and
   attributes: `node tools/declare-help.mjs …`"), so the next round measures it.
6. **`runtime/src/check.ts`** — imports the shared teach module (§4); message
   text unchanged.
7. **`test/docs.test.mjs` (or a sibling `test/declare-help.test.mjs`)** — gates:
   every `CSS_ATTRIBUTE_HINTS` key answers; every schema class and attribute
   resolves; the negative-knowledge entries answer their trigger words;
   `Text.lineheight` produces the did-you-mean; deterministic output; budget
   ceiling respected. Wire into `npm test`.

## 6. Implementation plan (half-day-scale steps)

1. Extract the shared teach module; checker green with no text changes.
2. `tools/declare-help.mjs`: exact + dotted-near-miss + class table (reads the model
   once, lazily; never loads `guide`/`tenets` bodies unless asked).
3. Foreign/retired/negative entries via the shared module; concept table +
   keyword retrieval over reference prose and guide headings.
4. Doc pointer edits (§5.1–5.4) + the test gate (§5.7).
5. **Measure**: one packaging-arm eval — same brief, with/without the CLI in the
   tool contract; compare tokens, wall time, and invented-name incidents. The
   tool earns its SKILL.md placement with data or loses it.

## 7. Non-goals

Not a server, not an index build, not embeddings, not a second prose store, no
network. It must run cold in a fresh clone in <300 ms, because the sandboxes it
serves are minted cold.
