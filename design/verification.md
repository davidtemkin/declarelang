# Verification — the whole system, layer by layer

Status: **DESCRIPTIVE MAP** (2026-07-16). This document describes every gate that
keeps Declare's code, docs, and claims consistent as the system evolves — what
runs when, what each layer costs, which steps involve a model, and the known
gaps. It is a map, not a spec: the detailed contracts live in the documents it
points to, and on any disagreement those documents win.

Companions: verify-and-evals.md (the ladder + eval design — the normative
spec), documentation.md (docs governance + its gate ramp), diagnostics.md (the
message contract), language-learnings.md (the E-series register + run history).

## 0. The principle

**Mechanical oracles decide everything they can; models are consulted only
where the question is inherently about model behavior.** Consistency between
code and docs is enforced deterministically. *Teachability* of the docs — can a
model learn the language from them — is measured empirically by the eval
tracks, on a schedule, never per-commit. Verify's JSON report IS the score for
rungs 1–5; no judgment enters below the rung-6/editorial line.

## 1. Layer one — per-change deterministic gates (`npm test`, ~6–8 min)

| gate | enforces | ~time | LLM |
|---|---|---|---|
| `tsc -b` | types; a renamed key breaks every stale read site | 5–15s | no |
| unit (347) | language semantics; diagnostic TEXTS pinned verbatim (E-series messages); location seed/write/derive | 20s | no |
| docs (8) | every ```declare fence in the brief compiles against the LIVE compiler; the `declare-docs:` link gate — every symbolic link resolves and links.json matches the corpus byte-for-byte | 5s | no |
| format (174) | every `.declare` is canon; formatter idempotence | 5s | no |
| verify-examples (18) | all example apps + library components climb R1–R4 (compile → resolve → typecheck → headless boot) | 40s | no |
| prewarm (12) | COMMITTED generated artifacts self-validate against the tree (closure hash-probe); stale artifacts fail naming the fix | 10s | no |
| crawl (7) | the crawl model: BFS over location links, dedup rules, one-document shape, loud network refusal | 5s | no |
| serve-parity (8) | Node server and static+SW host produce identical output through the one shared core | 10s | no |
| perceptual (111) | rendered behavior/pixels, BOTH backends, real Chromium (caught the dataset.neoApp emitter/selector split) | 3–4 min | no |
| declarec / slim / dep-extract / static-constraint / highlight / md / html / richtext / inspect / databinding / scaffold | builds, tree-shaking, dep extraction superset-of-runtime, renderers, inspect bridge | ~1 min total | no |

## 2. Layer two — the regeneration chain (~60–90s; partly pre-commit)

Order is load-bearing: `tsc → build-compiler → build-boot → doc extract →
links --emit → prewarm → bake-homepage-crawler`. Doc-relevant properties:

- **extract** re-ingests every guide chapter; runnable fences recompile and
  HEADLESS-BOOT (island stage heights are measured from the settled tree);
  reference prose re-joins the schema. The **documented / structural-only
  counter is a coverage tripwire** — new user-facing surface without prose
  moves the number (how App.location/View.anchor were caught undocumented).
- **links --emit --check** regenerates the symbolic-ID registry from the
  corpus; any dangling reference or stale manifest fails.
- **prewarm** re-crawls the exemplar apps cold at every reachable location; a
  doc or app change that breaks the crawl fails here.
- The pre-commit hook runs bake + prewarm + BUILD_ID stamp — a commit cannot
  ship stale baked artifacts. (Hooks have no file extension: repo-wide renames
  must not filter greps by extension — learned 2026-07-16.)

## 3. Layer three — live-behavior gates (on demand; before merges; ~4 min)

`tools/checks/loc-*.mjs` — five Chromium scripts against a real server: cold
deep links, back/forward with clean URLs, `@`-anchor reveal on both backends,
the DataSource-race deep link, and crawl byte-parity (browser ↔ Node identical
crawled documents). Deterministic; no LLM.

## 4. Layer four — the LLM layers (scheduled, never per-commit)

| track | measures | cost | LLM |
|---|---|---|---|
| reference-solver shakedown | the harness pipeline itself (replays the reference solution) | ~6s | **no** |
| comprehension | READ-analyzability: questions GENERATED with the compiler as answer key (settled geometry, dep-extractor provenance, replication counts); accuracy per topic | ~40s / ~40K tok per program | yes |
| generation (standard config: skill-v2 kernel × iterated ≤8, ruled 2026-07-16) | teachability: can a model write working programs from the docs; failures triage into the E-series | 10–60 min / 2–16M tok per 9-cell run | yes |
| bootstrap (DESIGNED, not built) | the operational docs: an agent given only the distro follows getting-started; milestones scored separately (server up → verify run → green) so failures attribute to the layer that owns them | — | yes |
| defect-taxonomy judging (DESIGNED §3.5, not standing) | labeling failure transcripts; scoring today is fully mechanical | — | would be |

The loop that ties layer 4 back to 1: eval failure → E-series entry (with the
escalation order docs → diagnostics → language) → fix on the mutable surface →
the DETERMINISTIC layers pin the fix (message texts in unit tests, fences
re-verified) → a re-run measures the delta. Closed end-to-end multiple times
(E-1 border-ghost; E-9 oscillation → recognition layer → 3/9 → 9/9 across the
model matrix).

## 5. How docs stay grounded — the four tiers

1. **Derived (the reference).** Structure from the runtime's own schema chain
   (cannot disagree with the checker); defaults read from source; prose keyed
   per member. Tripwire: the documented/structural-only counter.
2. **Registry-backed operational facts.** Flags (FLAG_SPECS), request types
   (reqtypes.ts), diagnostic codes (Diag catalog + CODE_PREFIX), the library
   (autoincludes + schemas). The INVARIANT: no operational fact exists only in
   prose — every checkable claim has a registry to be checked against.
   (Enforcement is partial — see gaps.)
3. **The guide.** Four instruments: fences are COMPILED CLAIMS (re-attested
   forever); the link gate pins cross-references; surface cross-checks
   (designed) validate every name prose mentions against the registries; and
   the EVALS are the semantic gate — the compiler grounds what docs SAY, the
   evals ground what docs TEACH, and a false sentence becomes a located,
   falsifiable failure within one cycle.
4. **Coverage and order — editorial, but instrumented.** No oracle proves an
   ordering right; the system constrains and measures instead. Constrained: the
   IA and outline are RATIFIED documents — order is versioned judgment, and
   changes are reviewed diffs. Measured: failure taxonomy by topic (E-11 =
   "Dataset mutation under-taught", found empirically), comprehension accuracy
   per chapter, routing-table traffic (a chapter never consulted is a smell; a
   task with no destination is a hole), and one-shot-vs-iterated deltas (topics
   learnable through the loop but never right first = not front-loaded).
   Accuracy is gated; coverage is tripwired; order is hypothesized and
   falsified. Voice and taste remain a human gate (David's chapter approval).

## 6. The gap register (known, tracked, costed)

1. **Guide fences are not a hard `npm test` gate.** They verify at extraction
   and were R4-swept at authoring, but a fence that stops compiling downgrades
   to a static block instead of failing the suite. (~10-line test; tracked in
   verify-and-evals.md.)
2. **Quoted-output agreement is spot-checked, not gated.** Docs display
   compiler output (the tutorial's deliberate break); nothing standing compares
   those bytes to the live renderer. Part of the surface-cross-check ramp.
3. **Surface cross-checks not built** (documentation.md §4): names in prose —
   attributes, components, flags, codes — validated against schema/registry/
   catalog. Bit twice in review before the gate was designed.
4. **Registry-generated tables are aspirational.** flags.md SAYS it is
   generated from FLAG_SPECS; today it is hand-written-and-checked. Make it
   literally true (~20 lines), then request types the same way.
5. **No executable getting-started smoke test.** The deterministic version of
   the bootstrap track: perform the doc's steps, expect a running app.
6. **The bootstrap eval track is designed, not built** — gated behind packaging
   stability (now achieved); the strongest attestation the operational docs can
   get.
7. **compile()'s error objects carry `code` but not `rendered` on one path** —
   every user surface goes through the renderer, but the API asymmetry exists
   (found 2026-07-16, cosmetic-internal).

Items 1–5 total roughly a day of work; 6 is its own arc.

## 7. What is NOT verified, on purpose

Editorial voice, chapter pacing, and pedagogical taste — human judgment,
exercised through ratified IA documents and per-chapter approval. The
instruments in §5.4 will contradict a wrong judgment with located evidence,
usually within one eval cycle; they do not replace the judgment.
