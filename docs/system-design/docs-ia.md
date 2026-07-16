# Docs IA, guide outline & editorial approach

**Status:** PROPOSED, 2026-07-14 (Fable IA/editorial pass); §2 and the guide rulings below
are RULED (David, 2026-07-14) and in execution: **the core doc lands now** (written directly,
compiler as the truth oracle — the guide does NOT wait for the reference); the guide gets a
**fresh top-to-bottom TOC** written as a narrative outline with per-chapter rationale (see
`guide-outline.md`), fleshed out later by another agent; **`declare-docs:` linking is a
secondary pass** — "derivative of the reference" means linked-and-accurate, not
written-after; prose salvage from the old guide only where it's a great fit for the new
structure, which may not be much. §5's chapter table is superseded by `guide-outline.md`. Companion to [`documentation.md`](documentation.md) (the contract),
[`docs-audit.md`](docs-audit.md) (inventory), [`docs-constraints.md`](docs-constraints.md)
(guardrails), [`docs-source-map.md`](docs-source-map.md) (sources). This is the judgment
half the contract's §8 bootstrap hands to the editorial pass: the information architecture,
the on-disk layout, the guide's shape, and the voice. Once ratified, the alignment pass
executes against it (core-doc-first → reference → guide).

---

## 1. The `docs/` tree (target, post-reorg)

```
docs/
  README.md              the router — who you are → where you go (see §6)
  declare.md             THE CORE DOC: spec + usable rationale + LLM brief, one artifact (§2)
  guide/                 the narrative path — hand-authored, derivative, linked (§5)
  reference/             GENERATED per-element pages + diagnostics; never hand-edited (§3)
  operational/           getting started, dev server, build, the CLIs, flags (§4)
  system-design/         category A — the design record (already in place)
```

Two categories by location (constraint 8), one documentation root, and the extractor gets a
predictable emit target (constraint 1). All internal links are `declare-docs:` symbolic
(constraint 3), so every file/heading below can move without breakage once adopted.

## 2. The core doc — `docs/declare.md`

**Name.** `declare.md`: the file *is* the language, stated once. The existing
`docs/system-design/declare.md` (the product vision, category A) renames to
`system-design/product-vision.md` in the same triage pass — its own title is "Product
Vision," so the rename is a correction, not a cost.

**What merges in.** `declare-for-llms.md` (all of it) + the authoritative content of
`docs/system-design/declare-language.md`. What does *not* come along: the design-goals essay, §13
"what is not settled," and Appendix B (the OpenLaszlo correspondence) — category A, they
stay in the spec's residue in `system-design/`; the core doc keeps one-line pointers.

**Structure: the brief's engineered order, at spec completeness.** The brief's shape is the
one already proven by evals (identity → example → forms → laws → negative knowledge →
observed mistakes → tool loop → escalation), and `designing-a-language-for-llms.md` §8 says
order matters — models weight early framing heavily, and the same order serves a human
read-through. So the merged doc keeps the brief's spine and deepens each section to the
spec's level of authority:

1. Identity + epistemic header (authority ordering: *compiler > this doc > examples > priors*)
2. A whole program, first
3. The two delimiters
4. Members, by shape
5. Classes and composition
6. The value model (the spec's full treatment)
7. Reactivity: constraints and the `=` setter (incl. the one rule + cost)
8. Events and subscriptions
9. Data: datapaths, replication, sources, schema, two-way
10. States and motion
11. Scope: the four nouns
12. Sizing and the host (incl. embedded apps)
13. The standard library — the catalog + the value pattern
14. What does not exist (negative knowledge — empirically maintained)
15. The mistakes actually observed (fed by the E-series)
16. Style canon
17. The loop: write → compile → read the diagnostic → fix → ship
18. Going deeper (the escalation map: guide, reference, exemplars)

Budget: ~900 lines / low-five-figure tokens — spec (682) + brief (303) minus their overlap,
which is large by design. Constraint 6 (fits in head/context) is the standing check; if it
bloats, the usable-why/deep-why line has slipped.

## 3. Reference — `docs/reference/`

Generated from `@api` doc-comments via the extractor; the model (`docs-model.json`) is the
truth the docs app consumes directly, and `docs/reference/` is where per-element **markdown
pages are emitted** for the file-nav and LLM-retrieval packagings: one page per class
(`View.md`, `Slider.md`, …) carrying its attributes/methods/events, plus `diagnostics.md`
(the `DECLARE####` catalog — it is a registry, so it lives here per the contract §2). A
generated header on every page says "generated — edit the `@api` comment at the source."
IDs are the source symbols; nothing here is ever hand-edited. The 67-entry prose backlog
(audit §2) is `@api` writing at the code, not work in this directory.

## 4. Operational — `docs/operational/`

The missing front door (audit §4) plus the run-the-toolchain surface:

- `getting-started.md` — **write-new**: the bootstrap front door, linked from the homepage
  and from guide 00/10 (David, 2026-07-14). Deliberately short — the distro model does the
  work (`dist/` is committed; a clone runs as-is, no build step). The page, in order:
  1. **Get it** — `git clone`, `npm install`, `npm start` → `http://127.0.0.1:8200/`
     (the homepage, running locally).
  2. **Make a home for your apps** — `mkdir my-apps` **at the repo root**: it must live
     under the served tree (the program URL resolves against the root), and it is
     gitignored, so your work rides across every `git pull`. One file per small app
     (`my-apps/hello.declare`); graduate to the examples' `<name>/<name>.declare`
     directory convention when an app grows resources (relative `data/` etc. resolve
     against the program URL for free).
  3. **First program** — a tiny app (one constraint + one handler, the payoff visible);
     browse to `http://127.0.0.1:8200/my-apps/hello.declare` — the URL *is* the app.
  4. **The loop** — edit on disk, reload (compile-on-request); then break it on purpose
     and read the diagnostic: it names the fix. The loop *is* the first lesson.
  5. **The address does more** — `?view=source|edit`, `?render=canvas`, `?build`; one
     line each, linking to `dev-server.md` / the guide.
  *Riders on the main repo (flagged, not done from this copy):* add `my-apps/` to
  `.gitignore`; link the page from the homepage header and root README.
- `dev-server.md` — the dev loop, request surface, `?typecheck=1`, `render=`.
- `building.md` — `declarec`, the production bundle, hosting.
- `verify.md`, `format.md` — the CLI pages (commands and output; the *concept* is guide §5).
- `flags.md` — generated from `FLAG_SPECS` (registry-derived, per the contract §2).

## 5. The guide — outline

**What the guide is.** The read-in-order narrative that teaches you to *think in Declare*
and carries the intent discrete reference pages can't. It is also the honest soft sell: each
chapter opens with the payoff — a runnable example that visibly does in five lines what the
reader knows costs thirty elsewhere — and the argument is carried by the example, never by
adjectives (constraint 13).

**Evidence-driven ordering.** Three changes to the current shape come straight from the
empirical record (`language-learnings.md`, the E-series, brief §10):

- **Scope moves up** (27 → 22): `classroot` appears in the guide's very first example, and
  this-vs-classroot is the top observed mistake — it can't wait until after data.
- **The standard library gets a first-class chapter, early** (24): the confirmed grievance —
  mentioned in 5 chapters, taught in none — and a headline feature. Placed right after
  events, the first point the reader can wire a control to state.
- **Styling gets one home** (27, broadened from *prevailing*): E-1 (the CSS-border ghost)
  happened because `stroke()`/`shadow()` were taught nowhere. One chapter owns the drawing
  attributes, prevailing inheritance, and the `theme` record; "there is no CSS" lands there
  as relief, after the positive model — never page 1.

### Part I — Orientation

| ch | title | disposition | notes |
|---|---|---|---|
| 00 | Why Declare | **update** | Keeps the two-surface thesis, the counter, the "what's different" map; adds the stdlib to that map; links go symbolic. The hand-built button stays (it teaches composition) with the brief's one-line "a themed `Button` also ships" note. |
| 10 | Tutorial — build one small app | **update** | The stat-card build; revised so a real `Button`/`Slider` appears early (themed, zero config, no import — the stdlib payoff shown, not told). |

### Part II — Fundamentals (read in order; each builds on the last)

| ch | title | disposition | notes |
|---|---|---|---|
| 20 | Composition — the tree is the brackets | update | |
| 21 | Constraints — reactive by construction | update | |
| 22 | Scope — the four nouns | **update + move up** (was 27) | `this`/`parent`/`classroot`/`app`; the top-mistake chapter, taught before handlers multiply. |
| 23 | Events and subscriptions | update | Target-only events stated plainly (learnings §4); "a child delivers to its owner by calling a method." |
| 24 | The standard library | **write-new** | The catalog, the value pattern (standalone / app-owned / data-owned), focus-for-free, themed-by-default. Example bank: `apps/controls/`. Data-owned form forward-links to 28. |
| 25 | States — modes as override bundles | update | |
| 26 | Layout — a swappable attribute | update | Adds the honest responsive idiom (E-3): swap whole layouts by assignment / per-child constraints on `app.width` / `minWidth` floor — taught, since `axis` isn't constrainable. |
| 27 | Styling and theming | **broaden** (was 22 *prevailing*) | fill / `stroke()` / `shadow()` / `cornerRadius` / opacity + prevailing slots + `theme` + `app.dark`. The E-1 fix made structural. |
| 28 | Data — datapaths, replication, sources | update | Absorbs two-way/editors as its closing section (no separate chapter — `<->` is one rule plus the editor list). |
| 29 | Formatting — the house style | update (renumber) | |

### Part III — In depth

| ch | title | disposition |
|---|---|---|
| 30 | Animation — springs and animators | update |
| 31 | Text and Markdown | update |
| 32 | Sizing and the host | update (embedded-app stage, `hostWidth`, `minWidth` panning) |
| 33 | Fonts | update |
| 34 | Input and focus | update |
| 35 | Capabilities — the environment contract | **write-new** (`docs/system-design/capabilities.md`) |
| 36 | SEO and static extraction | **write-new** (`docs/system-design/seo-and-semantics.md`) |

### Part IV — The loop

| ch | title | disposition | notes |
|---|---|---|---|
| 40 | Checking your program | **write-new** | The verify ladder as a user concept; "the diagnostic names the fix — trust it, apply it, recompile." The CLI page is operational. |
| 41 | Shipping | update | Narrative + concepts; command detail thins out to `operational/building.md`. |
| 42 | Anatomy of the calendar | **write-new, capstone (rescoped 2026-07-14)** | NOT a front-to-back read — a source inspection showed the morphing core is nested-lerp virtuoso code, states/layout/stdlib barely appear, and ~100 lines are inert TS helpers. Instead: an excerpt-driven tour of the four load-bearing mechanisms — the focus rectangle (four sprung scalars all geometry derives from), derived-scalar modes (`blockness`), the derived model + keyed replication, drag-through-`data.set` — ~10 quoted lines each, with the live `?view=reader` page as the full-source companion. Framed honestly as the language's ceiling, not its floor. |

**Moves out:** getting-started material → `operational/` (00 and 10 link to it);
`90-docs-internals.md` → `system-design/` (category A, per the audit).
**Numbering:** decade-gapped numeric filenames stay — a guide's reading order is real, and
gaps absorb insertions; IDs are pinned slugs, so renumbering is free forever after.

## 6. Access packagings (one corpus, four doors)

Same words everywhere (constraint 9); only access differs. `docs/README.md` is the router:
*build something now* → operational/getting-started · *hold the whole language* →
`declare.md` · *learn it properly* → guide, in order · *look something up* → reference.
The LLM packaging injects `declare.md` (it is the brief — no separate LLM fork exists
anymore); retrieval resolves `declare-docs:` handles into guide/reference nodes. The docs
app navigates the same IDs; a future editor resolves them as hover/go-to-definition.

## 7. Editorial voice & approach

**The positioning hierarchy (David, 2026-07-14 — the buried lede leads).** Declare is not
primarily a defensive, "better-verified same apps" product. The headline claim is
*offensive*: the language makes a new visual language for applications sayable — continuity
as the grain, not the garnish; "a view doesn't switch so much as become the next one" — and
so opens territory for genuinely **better** UI/UX. Verifiability, conciseness, and speed are
first-order too, but they are consequences of the same design, and they are *the floor, not
the point* (the homepage essay's own close: "What it's actually for"). Verified directly
(2026-07-14, calendar screenshots mid-transition): the month→week→day→year morphs are one
surface, every mid-flight frame a coherent layout. The core doc's identity section, the
guide's arc, and the capstone all lead with this; correctness claims support, never headline.
Corollary from the LLM-design doc §10: an unnamed capability doesn't exist for a model —
the docs must *name* continuity as a capability and exemplify it, or authors (human and
model) will regress to the median discrete UI.

- **The register: declarative, present-tense, certain.** State what the language does as
  fact — "The bracket nesting *is* the view tree." Short sentences carrying one idea each.
  Never cute, never exclamatory: one register serves the human and the model alike, and
  every doc is future training data. The homepage essay and the brief already speak this
  way; the guide extends that voice rather than inventing one.
- **The method: show, then gloss.** Every concept opens with a small, runnable, compiled
  program, and the prose explains *that example* — rules are glosses on examples, not the
  reverse (the in-context-learning evidence and our own E-1 both say the example carries
  the teaching). Each chapter distills to one memorable law — "a binding is a standing
  relationship the runtime keeps true" — and those lines become the `concept:` IDs.
- **The sell: payoff first, precision always.** Front-load what the construct buys; the
  five-lines-vs-thirty comparison is *shown* in running code. Other frameworks are named
  precisely and respectfully, to orient by contrast ("not a `VStack` type"), never to
  sneer. Negative knowledge — no z-index, no hooks, no CSS — is framed as weight removed,
  and placed after the positive model is established; caveats appear where they're earned,
  and marginal gotchas late or nowhere (constraint 12).
- **The evidence rule.** Ordering, footgun placement, and the "don't do this" moments
  follow the friction log and E-series, not intuition; new eval failures are new guide
  backlog. Every guide fact carries its `declare-docs:` backing link; every example
  compiles under `verify`; where any doc and the compiler disagree, the compiler wins.

## 8. Decisions taken here + what needs David's eyes

Decided (revisit if wrong): core doc named `declare.md` with the vision doc renamed
`product-vision.md` · brief's order as the merged spine · scope to 22, stdlib at 24,
styling broadened at 27 · two-way folded into data · diagnostics in reference, flags in
operational · numeric filenames kept · getting-started to operational.

Flagged for review before drafting starts:
1. **The capstone (42, reading the calendar)** — highest-effort new chapter; cut it if the
   budget wants the fundamentals deeper instead. (Recommend: keep — it's the exemplar-as-
   pedagogy move the LLM-design doc argues for, aimed at humans too.)
2. **Part IV as a separate part** vs. folding verify/shipping into Part III. (Recommend:
   separate — "how to work" is a different kind of knowledge than "what the language is.")
3. **The core-doc merge really does retire `declare-for-llms.md`** as a file (redirect
   stub only) — confirm nothing external hard-links it that we can't fix.

Agreed riders on the examples (David, 2026-07-14): the calendar predates the standard
library and hand-rolls its bar controls (four classes repeating hover/press boilerplate) —
it gets a stdlib-adoption/justification pass **before** the capstone chapter (42) ships,
since the flagship must not contradict the stdlib chapter (24) and exemplars are future
training data. David will come back to this; it's example-code work, outside this pass.

## 9. Handoff — state of the editorial pass and what remains (2026-07-14)

**Done and approved (David):** this plan; the core doc `docs/declare.md` (all six complete
programs verify clean through R4; two stale-absolute claims caught in review and fixed —
subscription sources, App size floor); the fresh guide TOC `guide-outline.md`; the
reference-prose voice `reference-prose-template.md`. The editorial/judgment layer is
complete; what remains is the systematic build, in this order:

1. **Validate the core doc as the working brief — before anything retires.** The eval
   harness reads `docs/declare-for-llms.md` **by path** (`evals/harness/run.mjs:29`,
   `sandbox.mjs:42`). Repoint it at `docs/declare.md`, rerun the shakedown cycle, and
   compare against the Run-0/after-docsfix results — **including token cost and wall
   time**, since the core doc is ~8.9K tokens where the old brief was ~5.8K (inside the
   design's 10–15K residency budget, but that's arithmetic, not evidence). The old brief
   was eval-tuned; the core doc is *unmeasured* — it earns the retirement of
   `declare-for-llms.md` (→ redirect stub) only by measuring at least as well. Any
   regression is a core-doc bug with a location. If length itself measures as the
   problem, the remedy is packaging (inject the resident kernel — identity/forms/laws/
   negative-knowledge/mistakes — and retrieve the rest; same file, marked sections),
   never a re-fork into two documents.
2. **Operational docs** (§4): getting-started first (the shape is specified above).
3. **Guide chapters** per `guide-outline.md`, in its execution-note order (00 and 10 set
   the voice — worth one human checkpoint on 00 before the rest proceed). Chapter 42 is
   gated on the calendar stdlib pass.
4. **Reference fill**: the ~67 missing prose entries in `tools/internal/doc/prose/`, per the
   ratified template.
5. **Mechanical passes, after the reorg settles:** the `design/`→`system-design/` moves +
   the 17 link re-points (to `declare-docs:` symbolic targets, not new paths); the
   `declare-docs:` linking pass over the new corpus; then the gate ramp (§9.2 of the
   contract).

**Small riders collected along the way:** add `my-apps/` to the main repo's `.gitignore` +
link getting-started from the homepage (§4); one-line scoping fix in `docs/system-design/sizing.md`
("no min/max attributes" is true *of views* — the App floor exists); when the gate's
surface cross-checks are built, cover subscription-source names and no-such-attribute
claims — both bit us in review.
