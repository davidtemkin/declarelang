# Verify & Evals — the machine-checkable loop

**Status:** BUILT through phase 5 (2026-07-14); phase 6 (the first real triage cycle across the model matrix) and phase 7 (steady-state tracks) remain. Companion to [`docs/system-design/designing-a-language-for-llms.md`](../docs/system-design/designing-a-language-for-llms.md) (the *why*, esp. §7 verifiability ladder and §9 evals) and [`diagnostics.md`](diagnostics.md) §4 (the diagnostic contract this system extends past the compiler).

**What's built (2026-07-14):**
- **Part A — `verify`** (`tools/verify.mjs` + `tools/verify-behave.mjs`): the whole ladder, rungs 1–6. Typecheck on by default (rung 3); headless boot under a synthetic measurer (rung 4); `drive`/`expect` over the `__declare` bridge with the driven clock (rung 5); named states vs. blessed baselines (rung 6). `runtime/src/inspect.ts` (inspect/find/explain/stats + clock) is the introspection substrate. `examples/controls/` is the full reference user (assert + states + baselines).
- **Component-probe mode** (`verify --wrap`): a bare component-library file (classes, no `App`) is wrapped in a probe App so it climbs the ladder standalone — closes the "library/src/*.declare can't verify" gap. All 10 components clean through R4.
- **CI truth-maintenance** (§2.10): `test/docs.test.mjs` (every doc fence compiles) and `test/verify-examples.test.mjs` (all 8 examples + 10 components clean through R4, per commit, no browser), both in `npm test`.
- **Part B — the eval harness** (`evals/`): hermetic sandbox runner (`harness/run.mjs`), the solver seam (`reference` = zero-budget shakedown/CI, `claude` = `claude -p` with harness-owned verify loop), mechanical scorer over the ladder (`harness/score.mjs`), `metrics.jsonl` + generated `RESULTS.md`. Three shakedown tasks (compose, collection, modes), each with a canon reference that self-tests green through R5. See `evals/README.md`.
- **Two toolchain fixes surfaced by building the tasks** (the harness earning its keep before running a model): the typecheck scaffold's `Dataset` type was missing `insert`/`removeAt`/`move` (any dataset-append program failed typecheck with a misleading "not a member"); and `inspect()`'s `attrs`/`explain().value` weren't transport-safe — a datapath cursor cycles through the tree, so puppeteer's clone yielded `undefined` and broke driving any data-bound view. Both fixed at the source (`compiler/src/scaffold.ts`, `runtime/src/inspect.ts`).

**Rulings landed** (from the design's open questions §6): model matrix = frontier corpus-author + one small canary; evals in-repo with `runs/` gitignored; budgets set post-shakedown (deliberately deferred to observed data, not a blocker for phase 5).

_Original design follows._

**The one-sentence goal:** a single local command that tells an author — human or model — *how right* a Declare program is, as far up the ladder as machines can check; and a harness that measures how well models actually write Declare, so the brief, the diagnostics, and ultimately the language are tuned on evidence instead of taste.

---

## 1. What exists to build on (inventory)

| capability | where | state |
|---|---|---|
| compile: parse → include → check → resolve, all-errors-per-phase, DECLARE#### codes | `compiler/src/compile.ts`, `runtime/src/check.ts`, `diagnostics.ts` | shipped |
| typecheck (tsc over `{ }` bodies vs generated scaffold) | `compiler/src/typecheck.ts` | shipped, **on by default** |
| static dep extraction (per-constraint reads, interprocedural) | `compiler/src/dep-extract.ts`, emitted in `compile()` result | shipped |
| headless instantiation, no DOM (`build()`), reactive `settle()` | `runtime/src/index.ts`, `reactive.ts` | shipped (tests use it) |
| real-Chrome pixel harness: launch, render both backends, AA-tolerant compare | `test/perceptual.test.mjs` (78 cases) | shipped, test-only |
| behavioral driving (puppeteer synthetic input, post-mutation pixel checks) | `test/perceptual.test.mjs` R5/R7 | shipped, test-only |
| production build (esbuild bundle, slim registry) | `tools/declarec.mjs` | shipped |
| dev server: `POST /compile`, `?render=canvas`, build cache | `server/index.mjs` | shipped |
| framework-neutral app brief format | `docs/system-design/site-spec.md` | exemplar exists |
| LLM brief with compile-validated examples | `docs/declare-for-llms.md` | shipped (validation script ad hoc) |

Missing, and designed below: runtime **introspection**, an **assertion surface**, **deterministic time**, the **verify** command that composes it all, and the **eval harness** that consumes it.

---

## 2. Part A — `verify`: one command, the whole ladder

### 2.1 The command

```
node tools/verify.mjs <app.declare> [flags]
```

Climbs as far as it can; stops at the first rung that fails; reports **everything at the failed rung** in the unified diagnostic register (code, position, message-naming-the-fix — the same voice as the compiler, per diagnostics.md §4). Exit code = highest rung passed. Rungs:

| rung | check | cost | new work |
|---|---|---|---|
| 1–2 | parse, include, check, resolve | ~16 ms | none — `compile()` |
| 3 | typecheck (tsc over bodies) + dep extraction | ~80 ms | **on by default** (as on every surface — typecheck is always on) |
| 4 | headless boot: `build()` the tree in Node, `settle()`, catch runtime errors, constraint-cycle check, report tree stats **and real geometry** | ~ms | thin wrapper + an injected text measurer (§2.8) |
| 5 | behavioral: launch headless Chrome, run the app, execute an **assert script** (§2.4) with synthetic input and stepped time | ~2–5 s | the bulk of Part A |
| 6 | visual: capture **named states** (§2.5), perceptual-diff against blessed baselines | ~2–5 s | reuse test compare fns; add baseline bless/update flow |

Flags: `--rung N` (stop early), `--assert <file>`, `--states <file>`, `--baseline <dir>`, `--bless` (accept current pixels as baseline), `--backend dom|canvas|both` (both = also enforce cross-backend pixel parity, the invariant the test suite already owns), `--json` (machine-readable report — the shape evals consume).

**Design rule:** verify's output is a teaching surface. A rung-5 assertion failure reads like a compiler error — located (which assertion, which step), rule-stating (what was expected and why), fix-suggesting where knowable. No raw stack traces, no puppeteer noise.

### 2.2 Runtime introspection (`runtime/src/inspect.ts`) — a language feature, not a test hack

The model cannot glance at the screen; give it a structured act of looking. New runtime module, zero-dependency, shipped in the normal runtime (it is the reactive inspector's foundation, promised in constraints.md §4 and language spec §13-Tooling — this is that commitment landing):

- **`inspect(node?) → InspectNode`** — JSON tree: class, name, path (`app.scroller.page.hero`), geometry (x/y/w/h, computed), visibility/opacity, text content, declared-attribute values, replication info (source path, key, count).
- **`find(path | predicate) → node`** — resolve by dotted name path (names are already the language's addressing scheme; this is why assertions never need DOM selectors).
- **`explain(node, attr) → Provenance`** — *why* does this attribute have this value: literal | constraint (source text + its dep list — **already emitted by the compiler**, just carried to runtime) | state override (which state) | spring (target, velocity, settled?). This is the payoff of static deps: provenance is a lookup, not a trace.
- **`stats() → { nodes, constraints, cells, pendingFlush }`** — leak/perf canaries (the animator-leak class of bug becomes assertable).

Exposure: in-page as `window.__declare.inspect` etc. (dev/verify builds; stripped by `declarec` prod unless `--inspect`); in Node headless via direct import. The JSON schema is versioned and documented — it is API, consumed by verify, the future reactive inspector UI, and any agent.

### 2.3 Deterministic time

Motion must be assertable and screenshots reproducible, so the clock must be drivable:

- Runtime already centralizes frame scheduling; add a **test clock**: `__declare.clock.mode("manual")`, `.step(ms)`, `.settleMotion(maxMs)` (run springs/animators to rest, error if not settled by maxMs).
- Verify drives it: "click, step 120 ms, snapshot mid-flight, settleMotion, assert" — the calendar's zoom becomes a *deterministic* sequence of assertable frames. This is the difference between our screenshots-during-transitions (timing-lucky) and a real oracle.

### 2.4 Assertions — at the language's altitude

An assert script is a small JS module run by the harness (JS, not a bespoke format: the authors are us and LLMs, both fluent; no parser to build or teach):

```js
export default async ({ app, drive, expect }) => {
  expect.visible("app.entry");                       // named views, never DOM selectors
  await drive.click("app.entry.zipBtn.zipcode");
  await drive.type("94403");
  await drive.key("Enter");
  await drive.settleData();                          // network fixtures resolved (§2.6)
  await drive.settleMotion();
  expect.hidden("app.entry");
  expect.attr("app.report.topBar", "opacity", 1);
  expect.count("app.report", { class: "WeatherSummary" }, 5);
  expect.explain("app.report.topBar", "y").isState("shown");   // provenance as an assertion
};
```

`drive.*` = puppeteer under the hood (real input paths — the same events a user causes) + the test clock. `expect.*` = inspect() reads. Failures render in the diagnostic register with the step trace.

### 2.5 Named states & visual checks

A states file lists `{ name, route: assert-script steps, viewport(s) }`. Verify captures each state on the chosen backend(s). **Capture is an app-level API on the canvas backend**: `__declare.capture() → PNG/ImageData` reads the app's own raster (`toDataURL`/OffscreenCanvas) — no compositor, no device-pixel-ratio ambiguity, byte-stable because the app inked those pixels itself, and cheap enough to diff *in-page*. The DOM backend is captured via CDP screenshot as today (it has no raster of its own — this asymmetry is itself a small argument for the own-pixels substrate). Then:
- **Regression mode** (default): perceptual-diff vs `baselines/<state>@<viewport>.png` (AA tolerance from the perceptual suite); `--bless` to accept.
- **Parity mode** (`--backend both`): DOM vs canvas within tolerance — extends the CI invariant to *your app*, not just the test corpus.
- **Judge mode** (evals only, §3.5): screenshots handed to a multimodal judge with a falsifiable-question rubric — never "does it look right", always "does any text overlap / clip / render off-canvas; is the described element present".

### 2.6 Data fixtures

Verify serves the app from a temp static host with `fixtures/` mapped over network paths (the relay/fixture pattern already proven in this repo's history). `drive.settleData()` awaits DataSource resolution. No live network in verify, ever — determinism is the product.

### 2.7 The warm verify host — where in-browser compilation earns its keep

Raw compile speed is not the argument (Node compiles in ~16 ms); **process churn is**. A naive rung-5/6 loop pays browser launch + page load + font load on every iteration — seconds per attempt. Instead, verify keeps **one persistent "verify host" page**: the in-browser compiler in a Worker (in-browser-dev.md, identical-output invariant), the runtime, the `__declare` bridge, fonts loaded, baselines in memory. The CLI drives it over CDP: *set source → compile in Worker → boot → drive/assert → capture* — all in-page, no navigation, ~100 ms per full iteration after the first. The browser is launched once per verify session (or per eval task), not per attempt. Consequences worth naming:

- The **iterated eval track** (§3.4) runs at in-page speed — the model's think time becomes the bottleneck, which is exactly where the cost should live.
- The same host, served instead of driven, is **client-side verify for the playground**: the homepage editor can run rungs 1–5 (and 6-canvas, via self-capture) with no dev machine at all — the whole toolchain becomes a URL, which is the in-browser-compilation story completing itself.
- Node-side rungs 1–4 remain for CI and quick checks; the host is the substrate for anything needing a live app.

### 2.8 Text metrics off-DOM (resolved — revised 2026-07-13)

All text measurement already flows through one shared offscreen-canvas measurer (`measure.ts`: `textWidth` / `fontMetrics` / `wrapLines` — both backends consume it, "so they cannot disagree about which font they mean"). The Node seam is that single `measurer()` function.

**Ruling: no native canvas dependency.** A Node canvas package measures with its own font stack (FreeType, different `system-ui` resolution, different hinting) — approximately-Chrome numbers that don't match what users see, the worst kind of oracle (David hit exactly this rendering/metrics mismatch on a prior project). Instead:

- **Node rung 4 injects a synthetic, deterministic measurer** — fixed advance tables, clearly labeled — valid for structure, reactivity, settle, and non-typographic geometry assertions; typography-sensitive assertions are out of scope at Node rung 4 by definition.
- **Real metrics come free where the real measurer lives:** the warm verify host (§2.7) runs rungs 4+ in the browser, where `measure.ts` works natively — typography-accurate verification uses Chrome's own metrics, not an imitation. The toolchain stays pure JS.

### 2.9 The formatter — canon enforcement is part of the loop

Declare has a strong, opinionated style canon ([`formatting.md`](formatting.md) — which already specifies the prettyprinter contract) and **no prettyprinter**; conformance is currently by hand. That gap becomes load-bearing the moment models write Declare at volume, for three reasons:

1. **The canon fights the corpus — by design, and that's survivable only with tooling.** Models' priors want JS-shaped closers, JSX-shaped attribute stacking; the canon wants header-line packing, leaf-on-one-line, hanging `],`. Without a formatter, every model either burns iterations on whitespace or accretes ugly sources — and ugly sources are ruled a no-go. A formatter converts the aesthetic position from a *generation-time tax* into a *free post-pass*: the model emits semantically-correct code in whatever shape its priors produce; the canon is applied mechanically. The model never argues with the canon because it never has to comply with it — the toolchain does.
2. **Canonical form is what makes a small corpus compound.** Every Declare source a model ever reads — spec examples, library components, its own formatted output — reinforces one shape instead of diluting across variants. Byte-stable output also makes diffs minimal and snapshot comparisons meaningful (the modification track's diff-quality metric presumes it).
3. **Code appearance is product surface here.** The literate `/* */`-Markdown convention and the source viewer render source as its own visual hierarchy — sources are *read* in-product. So the formatter's job includes faithful comment preservation (the canon's never-reorder / never-retoken rule), and generated code that will be published (exemplars, eval artifacts — future training data, per the corpus-endgame rule) is always formatted first.

**Integration:** `verify --format` = check mode (CI: canon-conformance is a failure); the iterated eval loop auto-formats after green (models don't spend iterations on whitespace); `declare fmt` (or the formatter inside prebuild) as the standalone entry. **One extra eval metric falls out free: format distance** — the diff size between a model's raw output and its canonicalized form, per task. That number answers empirically whether the canon's fight with the corpus costs anything real (it shouldn't, once the formatter exists — and if models' *semantic* error rate correlates with format distance, that's a finding worth knowing).

**Placement:** parallel track like the component baseline — not blocking phases 1–4, required **before phase 5** (the harness formats everything it archives; RESULTS artifacts and any published eval output are canon or they don't ship). The build is bounded: the parser is position-preserving and `formatting.md` §prettyprinter-contract already rules the hard calls (header packing width, leaf-inline vs hanging close, comment placement).

### 2.10 Also in Part A (cheap, high-leverage)

- **CI truth-maintenance**: promote the ad-hoc brief-validation script into `test/docs.test.mjs` — every ```declare fence in `docs/declare-for-llms.md`, the guide, and `docs/system-design/declare-language.md` must compile (known offender to fix on landing: spec §9's unquoted-JSON Dataset example). This is the no-drift invariant, mechanized.
- **`verify` on the examples in CI**: rungs 1–4 for every example on every commit (fast); rungs 5–6 for calendar + site nightly or pre-release.

---

## 3. Part B — the eval harness

### 3.1 Layout

```
evals/
  tasks/<task-id>/
    brief.md           # framework-neutral, site-spec style: intent, copy, behavior, NO tech
    fixtures/          # data the app consumes
    assert.mjs         # rung-5 acceptance (written against the brief, not an implementation)
    states.json        # rung-6 capture states
    rubric.json        # falsifiable visual questions for the judge
    budget.json        # max iterations, max tokens
  harness/             # runner, metrics, report generator
  runs/<timestamp>/    # per-run: transcript, artifacts, metrics.jsonl  (gitignored except summaries)
  RESULTS.md           # generated scoreboard, committed
```

### 3.2 Hermetic sessions

Each eval run gets a sandbox dir containing **only**: `docs/declare-for-llms.md`, the task brief + fixtures, and a `run.md` tool contract ("write app.declare; run `verify` (wrapped); read errors; repeat"). No repo access, no guide, no spec (v1 measures the brief *alone* — the artifact we claim suffices; a later arm adds spec-on-request to measure the escalation path). Driver: `claude -p` headless (Agent SDK later if we need finer control), which also reports token usage for free. Model matrix: one frontier + one small model — **the small model is the canary**; if it can't learn the language from the brief, the brief (or the language) is too clever.

### 3.3 Task suite v1 (eight, spanning the domain)

1. **compose** — static layout: header/columns/footer, responsive at two widths (composition, constraints)
2. **form** — inputs + validation + derived enable/disable (two-way binding, derived state)
3. **collection** — data-bound list with add/edit, keyed replication (Dataset, `:path`, mutation)
4. **fetch** — remote resource with loading/error/loaded screens (DataSource, derived visibility)
5. **modes** — a panel with three exclusive states, animated transitions (states, springs)
6. **manipulate** — drag-to-reorder with drop feedback (pointer handlers, hit math, ghost)
7. **continuous** — a master-detail where detail *grows out of* its list item and back (the continuity idiom — the one task where the language should shine and corpus stacks suffer)
8. **mini-app** — a small complete app combining 4+ of the above (the integration test)

Each brief is written like `site-spec.md`: precise intent, no technology named — reusable verbatim for the React baseline arm (phase 2), and immune to the code-to-code-translation trap (models generate from intent, never from incumbent code).

### 3.4 Tracks and metrics

| track | protocol | primary metrics |
|---|---|---|
| **one-shot** | brief + task → one program, no tools | compile rate; rungs passed; defect taxonomy; tokens |
| **iterated** | + verify loop, budget from `budget.json` (default 8 iterations) | iterations-to-green; **self-recovery rate** (failures fixed with no human hint); **diagnostic efficacy** (fix followed the message's named fix — judged); total tokens; wall time |
| **comprehension** | given a program (calendar excerpts, brief examples), answer behavior/provenance questions vs answer key | accuracy — isolates *read* analyzability, no generation confound; cheapest track, run most often |
| **modification** | given a green solution from another run, apply a change request | correctness; diff size/locality; unrelated-code disturbance |

Defect taxonomy (every failure labeled, by a judge pass over the transcript): `syntax | structure | seam (bare-vs-brace) | scope (this/classroot) | reactivity | data | interference-ghost (invented feature) | logic | toolchain`. The taxonomy time-series is the language's health chart.

### 3.5 Scoring

Mechanical oracles decide everything they can (verify's JSON report **is** the score for rungs 1–5). The judge model touches only: rubric questions over rung-6 screenshots, diagnostic-efficacy classification, and defect labeling. Judge prompts are frozen per suite version; a human (David) spot-audits a sample each cycle.

### 3.6 The triage loop — where evals become the engine

Every failure gets exactly one label, with a mandated escalation order:

1. **docs gap** — the model couldn't have known → patch `declare-for-llms.md` (usually §9/§10) → rerun the task.
2. **diagnostic gap** — it erred and the error failed to teach the repair → patch the `Diag` catalog message → rerun. (Feeds diagnostics.md §4's standard directly; a diagnostic whose named fix models don't follow is a bug by definition.)
3. **language footgun** — persists across models *after* 1 and 2 → an entry in the footgun register (extend `docs/system-design/language-learnings.md` with an `E-series`: evidence, tasks affected, models affected, docs/diagnostic attempts). Only E-series entries with ≥2 models and ≥2 cycles of evidence earn a language-change discussion — the language stays stable while the mutable surfaces absorb the churn, and changes that do happen arrive with receipts.

Regression rule: any edit to the brief, a diagnostic, or the language reruns the affected tasks before merging. The suite is CI for teachability.

### 3.7 Baseline (phase 2, explicitly deferred)

Same briefs, same models, same budgets, React+TS+Vite; acceptance rewritten against the DOM (Playwright-style) with the same rubric. Deferred because v1's job is the *tuning loop*, which needs no comparison to run — but the briefs are baseline-ready by construction, and the headline numbers (cost-to-green, self-recovery, defect classes vs. the incumbent) come from this arm when we want them.

---

## 4. Implementation plan

**Sequencing dependency (ruled 2026-07-13):** the full TS-typecheck integration is in flight separately. It gates **rung-3-on-by-default and the eval phases (5–6)** — running evals against a checker that's about to change would invalidate the baseline metrics, and defaulting on a false-positive-prone pass would burn the trust-the-message contract verify exists to uphold. It does **not** gate phases 0–4 (headless boot, inspect, clock, behavioral/visual harness, verify host), which are runtime/harness work behind a stable interface (`compile(src, { typecheck })` → DECLARE6xxx `Diagnostic[]`). Rung 3 ships flag-gated, default-off, and flips on when that work lands. Coordination note for the typecheck workstream: its messages will be *scored* on diagnostic efficacy by this harness — the diagnostics.md §4 contract (name the fix, one canonical rewrite) applies to every DECLARE6xxx from day one.

Ordered so every phase lands something usable alone; estimates are working-session scale, not calendar promises.

| phase | delivers | est |
|---|---|---|
| **0. enablers** | docs-examples-compile CI test (incl. fixing spec §9's JSON example); verify skeleton = compile+typecheck with unified output (rungs 1–3) | ~half day |
| **1. headless boot** | rung 4: Node `build()`+`settle()` wrapper, runtime-error mapping to diagnostic register, tree stats | ~half day |
| **2. inspect + clock** | `runtime/src/inspect.ts` (inspect/find/explain/stats, versioned schema); manual clock + `settleMotion`; `window.__declare` bridge | ~2 days — the heart of Part A |
| **3. behavioral** | `drive`/`expect` API over puppeteer + bridge; fixture static host; assert-script runner; rung-5 reporting | ~2 days |
| **4. visual** | named states, capture, perceptual-diff + bless flow, `--backend both` parity; calendar + site get states+baselines as the reference users | ~1 day |
| **5. harness** | evals/ layout, hermetic sandbox runner over `claude -p`, metrics.jsonl, RESULTS.md generator; 3 tasks (compose, collection, modes) to shake it down | ~2 days |
| **6. suite + first cycle** | remaining 5 tasks; one-shot + iterated across 2 models; first triage; first patches to brief/diagnostics; RESULTS.md v1 | ~2–3 days |
| **7. steady state** | comprehension + modification tracks; judge rubrics frozen; (phase 2 baseline when wanted) | ongoing |

Sequencing note: phases 0–1 are useful the day they land (CI + a real `verify` for every current example). Phase 2 unblocks both 3 and the promised reactive-inspector tooling. Phase 5 can start in parallel with 3–4 if we accept rung-1–4-only scoring for the shakedown.

## 5. The operating cadence (once built)

A cycle = run suite → triage every failure (§3.6) → patch docs/diagnostics → rerun patched tasks → commit RESULTS.md + patches. First cycles will be dominated by docs-gap labels (cheap, fast burn-down); the interesting residue — the E-series — accumulates slowly and is the input to language design sessions. Comprehension track runs on every brief/spec edit (it's near-free). Full suite: weekly-ish, or before any language-surface change.

## 6. Open questions (for discussion before building)

1. ~~Verify in the browser too?~~ **Ruled in**: the warm verify host (§2.7) is the rung-5/6 substrate *and* the playground's client-side verify — one build, two uses.
2. **Assert scripts sit wholly OUTSIDE the Declare language boundary** — ruled. They never appear in `.declare` source and add nothing to the language spec (which must stay small enough to hold whole); a test is not part of a UI's structure, and test choreography is imperative by nature. They do live inside the language's *vocabulary* — they address named views and attributes through `inspect`/`drive`, never render internals. Format: plain JS modules against a published `.d.ts` (typed for editors and agents, no build step); `.mts`/TS accepted transparently via esbuild since the toolchain carries it anyway. Remaining sub-question: none — considered ruled unless objected to.
3. **Model matrix v1** — proposal: the frontier model that authored the corpus so far + one small/fast model as canary. Add a second vendor when the baseline arm lands?
4. **Where evals live** — in-repo (proposed: keeps briefs/asserts versioned with the language they test) vs. separate repo (keeps the tree lean). In-repo with `runs/` gitignored is the proposal.
5. ~~Text metrics off-DOM~~ **Resolved** (§2.8): inject a real measurer at the existing `measure.ts` seam; rung 4 asserts real geometry, typography included.
6. **`inspect` in production builds** — strip by default, `--inspect` to keep? Proposal: yes (size), but the *schema* is stable either way.
7. **Budget defaults** — 8 iterations / task, token cap per track? Numbers to set after the shakedown run rather than guessed now.
