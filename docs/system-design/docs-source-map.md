# Docs source map — where truth & positioning already live (handoff for the IA/editorial pass)

**Status:** 2026-07-14 (Opus prep). Companion to [`documentation.md`](documentation.md),
[`docs-audit.md`](docs-audit.md), [`docs-constraints.md`](docs-constraints.md). The point:
**mine, don't reinvent.** The positioning, the per-topic truth, and — most valuable — the
empirical record of what actually confuses users all already exist. This maps them so the
editorial/IA pass builds *on* them.

> Paths are provisional (reorg live): `examples/site`→`examples/homepage`; some `design/*`
> docs are being edited right now — treat as authoritative-but-moving.

## 1. Positioning & voice — mine for the persuasive arc (the guide is *also* a soft sell)

| source | what it gives you |
|---|---|
| `examples/homepage/` (the homepage essay, was `site`) | the strongest existing marketing prose — the 3-movement arc (objection → leverage → "what it's actually for"), the "we believe" bet, "an LLM's mistake is a compile error that names the fix." The **voice** to extend. |
| `docs/system-design/designing-a-language-for-llms.md` | the intellectual case: two-leverages thesis, the anti-"languages don't matter" rebuttal, no-near-misses, context economics, prior-art (Anka/FeedbackEval/Hazel). The *why-it's-different* substance. |
| `docs/declare-for-llms.md` §1, §9, §10 | the crisp framings already tested: "to web apps what HTML is to web documents," "a binding is a standing relationship the runtime keeps true," and the negative-knowledge / footgun voice. |
| `site-react/` + calendar2 metrics (memory/bench) | concrete "vs React" evidence — bundle ~53 vs 97 KB gz, ~415 vs 874 LOC, ~8× lower input latency. Show-not-tell ammunition (constraint 13). |

## 2. Per-topic authoritative truth — mine for factual accuracy (fact-check every guide claim)

| guide topic | authoritative source(s) |
|---|---|
| the whole surface | `docs/system-design/declare-language.md` (the ~680-ln spec) → merges into the core doc |
| composition / the tree | `docs/system-design/composition.md`, `docs/system-design/declare-language.md` |
| constraints / reactivity | `docs/system-design/constraints.md`, `docs/system-design/static-dep-extraction.md` |
| states | `docs/system-design/states.md` |
| layout | `docs/system-design/declare-language.md` (layout-as-attribute) |
| data / datapaths / sources | `docs/system-design/declare-language.md` §data, `runtime/src/data.ts` (the mutation API) |
| sizing / host | `docs/system-design/sizing.md` |
| animation / springs | `docs/system-design/animation.md` |
| text / markdown | `docs/system-design/text-and-markdown.md` |
| fonts | `docs/system-design/fonts.md` |
| input / focus | `docs/system-design/input.md` |
| formatting | `docs/system-design/formatting.md` (+ `tools/format.mjs` = the enforced canon) |
| **components / std library** *(write-new)* | `library/*.declare` (+ their `@api`), `docs/system-design/components-baseline.md` (the 4 contracts) |
| **verify / how-to-check** *(write-new)* | `docs/system-design/verify-and-evals.md`, `tools/verify.mjs` |
| **capabilities** *(write-new)* | `docs/system-design/capabilities.md` |
| **SEO / static extraction** *(write-new)* | `docs/system-design/seo-and-semantics.md`, `compiler/src/static-html.ts` |
| diagnostics (reference) | the `Diag` catalog + `docs/system-design/diagnostics.md` §4 (errors name the fix) |
| flags (operational) | `compiler/src/flags.ts` `FLAG_SPECS` (one registry, all surfaces) |
| shipping / production | `tools/declarec.mjs`, `docs/system-design/hosting.md`, `docs/system-design/in-browser-dev.md` |
| per-element detail | `examples/docs/docs-model.json` (the generated reference; 68% prose) |

## 3. Empirical "what confuses users" — mine for ordering & footguns (this is the gold)

The guide's ordering and its "don't do this" moments should be *evidence-driven*, not guessed:

- **`docs/system-design/language-learnings.md`** — the friction log **and the eval E-series** (E-1 CSS
  border ghost → the brief never showed `stroke()`; E-2 well-diagnosed seam/scope errors;
  E-3 responsive-layout-wants-to-constrain-`axis`). This is real evidence of what trips
  people, so the guide can *preempt* it — and it tells you exactly what **not** to front-load
  on page 1 (the marginal gotchas belong late or nowhere).
- **`evals/`** (tasks + `RESULTS.md` + the E-series) — "what a model gets wrong from the docs
  alone" *is* the list of what the guide must teach better. As the editorial pass proceeds,
  new eval failures are new guide backlog.

## 4. Worked idiom at scale — mine for real examples (not toy snippets)

- **`examples/calendar/`** (~500 ln) — the flagship: states, springs, data mutation, drag,
  the "month morphs into week" continuity idiom at full scale. The place to draw *earned*
  examples that show the payoff.
- **`examples/homepage/`** (the literate `.declare` source) — a real app whose source is
  meant to be read; good for the composition/prevailing/theming story.
- **`examples/controls/`** — every standard-library control in its three use forms (the
  components chapter's natural example bank; also the verify reference user).

## 5. Currency caveats

- `design/*` docs are being **actively edited in the live reorg** (`capabilities`,
  `components-baseline`, `diagnostics`, `hosting`, `in-browser-dev`, `verify-and-evals` all
  show local modifications). Read them as authoritative-but-moving; re-confirm against the
  code where it matters.
- Where a design doc and the compiler disagree, **the compiler wins** — run it (`verify`,
  `compile`) as the tiebreaker, exactly as the guide's own examples will be gated later.
