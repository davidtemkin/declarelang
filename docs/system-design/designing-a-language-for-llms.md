# Designing a Language for LLMs

*Principles for maximizing LLM utility in a new UI language*

---

## Preface: what this document is

This document states what matters — and why — when designing a programming language and toolchain whose primary author is expected to be a large language model with **no training corpus for the language**. It is written deliberately blind: the author has not examined the language it is meant to inform. That is not a limitation to apologize for; it is the point. Written this way, the document can serve later as an independent yardstick — the actual language can be audited against it, and every divergence becomes either a work item or a deliberate, documented exception. Convergences are evidence too: if a principle derived here from first principles turns out to be already embodied in the design, that is a form of confirmation neither document could provide alone.

One more note on epistemic position: this document is written by an LLM that has never seen the language in question — which is exactly the position of the language's intended user. Where this document's reasoning has blind spots, those blind spots are themselves data about what the language's documentation will have to work against.

A note on register: this is a document of principles and approaches, not an implementation spec. It argues; it does not legislate. A separate implementation-facing document will follow it.

---

## 1. Two kinds of leverage

When an LLM writes a React application today, its effectiveness comes almost entirely from **corpus leverage**: it has absorbed millions of examples, and it produces code by informed resemblance. This works — often impressively — but it is worth being precise about what kind of capability it is. Corpus leverage is broad and shallow. The model knows ten ways to write everything and has no principled means of choosing among them; its knowledge is a compression of a corpus that is internally contradictory, full of deprecated APIs, workarounds for browser bugs that no longer exist, and idioms that were fashionable in different years. Most importantly, corpus leverage provides no way to *verify* anything. The model's confidence that code is correct is a measure of resemblance, not of truth.

The alternative is **comprehension leverage**: the model works from a complete, current, internally consistent specification held in its context window, writes in a language whose programs can be statically analyzed, and iterates against a compiler and toolchain that act as a fast, precise oracle. Comprehension leverage is narrow — it applies to exactly one language — but it is deep: every claim the model makes about a program can, in principle, be checked.

The bet under evaluation is that for a bounded domain — interactive applications with dynamic data and substantial visual dynamism — comprehension leverage can beat corpus leverage. Not immediately, and not on every metric, but on the metrics that matter: total cost (tokens and wall time) to a *working, correct* application, and the reliability of the loop that gets there.

This bet is only winnable if the language is designed for it. A language acquires corpus leverage by accident, just by existing long enough. Comprehension leverage has to be engineered: the spec must be small, the semantics regular, the programs analyzable, the toolchain a genuine oracle, and the diagnostics a genuine teacher. In this sense, **the language is the prompt**. Language design, for an LLM-first language, is prompt engineering carried out at the deepest available layer — and everything downstream (the docs, the brief, the error messages) inherits its quality ceiling from decisions made in the grammar and semantics.

---

## 2. Taking the conventional wisdom head-on

The conventional wisdom deserves a fair statement before a rebuttal: *LLMs write the code now. Developers increasingly don't read it and soon won't need to. Therefore the properties of programming languages — readability, elegance, analyzability — are legacy concerns. Whatever language has the largest corpus wins, permanently, and designing new languages is the most pointless activity in software.*

This is wrong in an instructive way. Each of its steps fails:

**It confuses generating code with trusting code.** The cost of *producing* code is collapsing toward zero. The cost of *knowing the code is right* has not moved. Software's expense was never typing; it was always verification, integration, and maintenance — and generating code faster, from a probabilistic process, with less human review, makes the verification problem strictly harder, not obsolete. A language is not primarily a code-production tool. It is a verification substrate: it determines which errors are inexpressible, which are caught mechanically, and which survive to runtime. That role grows as human review shrinks.

**It assumes the LLM can be trusted the way a compiler is trusted.** "You won't need to care what the code does" treats the LLM as a reliable translator of intent, like a compiler translating C to machine code. But compilers earned that trust through determinism and specification — the same input produces the same output, and the translation is (in principle and increasingly in practice) verifiable. An LLM is a probabilistic process with a long, fat tail of confident error. When the generator is probabilistic, reliability has to be recovered *somewhere*, and the only deterministic layers available are the language and its toolchain. The less the human reads the code, the more load-bearing the language's guarantees become. Historically this pattern is familiar: when programmers stopped reading assembly, we did not stop caring about the properties of the layers beneath us — we transferred that care into compiler correctness, calling conventions, and memory models, and made the machine enforce them. Moving application code below routine human attention demands the same move, one level up.

**Its economics are wrong even on its own terms.** Grant, for argument's sake, that the model always gets there eventually. In a corpus language it gets there through iterations — each one burning tokens and minutes re-reading sprawling files, chasing errors that a stricter substrate would have made impossible, and re-verifying what cannot be statically known. A language that halves iterations-to-correct halves the cost and latency of every feature forever. "The LLM will figure it out" is not a refutation of language design; it is an unpriced bill for it.

**The corpus advantage decays at the margin.** Frameworks churn, and yesterday's corpus teaches yesterday's framework. The corpus is self-contradictory, so more of it sharpens fluency without sharpening truth. And an increasing share of new corpus is itself LLM-generated, which regresses the distribution toward its own median. A spec-grounded language does not rot this way: its ground truth is a maintained artifact, not a fossil record.

**And the human does not actually leave.** Intent, taste, and accountability remain human even in the most automated loop. Someone must be able to audit what was built — for correctness, for security, for whether it does what was meant. A human-readable language is the audit interface. This is why human readability appears throughout this document not as a concession to tradition but as a load-bearing requirement of the LLM loop itself: a loop no human can efficiently inspect is a loop no one can responsibly trust.

The honest concession: the conventional wisdom is right that humans will read less code, and right that raw corpus mass is a formidable moat in the near term. The error is the inferred direction. When the author of code is a machine, a language stops being mainly an interface between human and machine and becomes a **contract between two machines — the generator and the verifier — that must remain legible to the human who arbitrates**. That is a harder design problem than classical language design, not an obsolete one.

---

## 3. Transfer: borrow honestly, diverge loudly

"No training corpus" never means a blank slate. The model arrives with enormous priors: general programming semantics, every mainstream language, and — crucially for this domain — deep knowledge of user interfaces. Transfer from these priors is the single largest free resource available to a new language, and also its most insidious failure mode. The two faces have names:

- **Transfer**: the model correctly applies knowledge from elsewhere. If the language's expression syntax genuinely is a familiar language's expression syntax, the model gets operator precedence, string semantics, and arithmetic for free — an enormous, unearnable-in-one-page capability.
- **Interference**: the model confidently applies knowledge that *looks* applicable but isn't. It hallucinates a lifecycle method that doesn't exist, a CSS property the layout system doesn't have, an event-bubbling behavior the language deliberately rejected — not because the spec said so, but because everything nearby resembled the ecosystem where those things are true.

The governing principle is **no near-misses**: the danger zone is not the exotic parts of a language but the 95%-similar parts, because a model's confidence tracks familiarity, and familiarity is exactly what a near-miss provides. Two corollaries:

**Where you borrow, borrow wholesale.** If a construct looks like something the model knows, it must behave the way the model expects, all the way down. Half-adopting a familiar syntax with altered semantics is the worst of both worlds: full interference, partial transfer. The strongest version of this move is to embed an existing language outright for some layer (e.g., expressions), inherit its semantics completely, and say so in one sentence — one line of spec purchasing years of training.

**Where you diverge, diverge visibly.** Novel syntax is not a cost to be minimized; it is a *signal*. Distinctive surface form tells the model "you are on spec territory now — consult the document, don't autocomplete from memory." Models modulate between recall and in-context reasoning based on familiarity cues, so the syntax of the novel parts should be designed to trigger the latter. A language that is uniformly 90% familiar is more dangerous to an LLM than one that is 60% familiar with sharp, legible boundaries. The empirical record adds a sobering rider (§12): studies find models leaning on training priors *even against semantics explicitly declared in context*, and performing poorly on formal novelty with no familiar scaffolding at all. Two conclusions follow, not one: familiar shape is load-bearing and gratuitous novelty is taxed — but divergence-signaling alone cannot be trusted to fully suppress interference, so the verification ladder (§7) must be designed on the assumption that some interference always gets through to the compiler.

There is a third corollary that human-oriented documentation almost never needs: **negative knowledge is a first-class documentation category.** Human docs describe what exists; a human who doesn't find a feature assumes it isn't there. A model that doesn't find a feature *invents it from priors*. The spec and the brief must therefore explicitly enumerate the attractive nonexistents — the features from adjacent ecosystems that the model will reach for and that deliberately do not exist here, each with the language's actual answer. ("There is no z-order property; occlusion is determined by X." "There is no cascade; styles are resolved by Y.") This list is empirical, not speculative: the evals of Section 9 will reveal exactly which ghosts the models chase, and the list should be maintained from that evidence.

---

## 4. The language as a context artifact

It is natural to focus on making the *spec* fit in a context window. That's necessary but it is the smaller half of the token economics. The quieter, larger cost is that the model reads and writes *program text* on every turn of every loop, forever. The language's surface form is a recurring tax or a recurring rebate, and several classical design virtues turn out to be, for an LLM, hard economics:

**Edit locality.** Can the model correctly understand and modify line 200 without holding lines 1–199 in mind? Every piece of action-at-a-distance — mutable state threaded invisibly, ambient context that changes meaning, effects at a distance — forces the model to load more of the program to make any safe change, and multiplies both token cost and error rate. Declarative structure is the strongest known lever here: when a region of program text *is* the complete truth about a region of the interface, the model can operate on it surgically. Edit locality should be treated as a named, testable design requirement (Section 9's modification evals measure it directly), not an emergent nicety.

**Canonical form.** There should be one way to write any given thing, and a formatter should enforce it. For human teams this is a style nicety; for LLMs it is structural. It collapses a whole genre of model uncertainty ("is this variant legal? preferred?") to zero. It makes independently generated code converge, which makes diffs minimal and reviewable. It makes output byte-stable across attempts, which snapshot testing and caching then exploit. And it means every example the model ever sees — spec, library source, its own prior output — reinforces one form instead of diluting across variants. Canonicalization is how a small corpus punches above its weight.

**Verbosity in the right places only.** It is tempting to say verbosity is fine because models don't get tired. Half true: models don't resent typing, but tokens cost money and context, and — less obviously — **boilerplate is a defect surface**. Models make errors *inside* ceremony (the wrong re-statement of a name, the subtly mismatched wrapper), and ceremony that doesn't exist can't be wrong. The right rule is not "verbose" or "terse" but: **explicit where explicitness lets the toolchain check something** (redundancy as cross-check is cheap insurance), **absent where it's pure ceremony** (ceremony is unpriced risk). Cleverness-terseness — the code-golf register humans sometimes enjoy — serves neither reader and should be excluded by the canonical form.

**The library is written in the language.** This single decision restructures the entire context budget. If components are self-hosted, then the spec that teaches the language has already taught the library's *notation*; component source is simultaneously documentation (that cannot drift from behavior, because it *is* the behavior), exemplar (every component read is a worked example in canonical form), and evidence (the model can verify a claim about a component by reading it, rather than trusting prose). Contrast the corpus-stack alternative: understanding a React component's actual behavior means reading TypeScript plus hooks plus a styling system plus a bundler's opinions, at enormous token cost and with no guarantee the README agrees. The residency rule that falls out: the **catalog** — what exists, one line each — must be in the always-loaded budget, because a model can only fetch what it knows to name; **bodies** are retrieved on demand. A plausible target: brief plus catalog plus semantic core comfortably under ~10–15K tokens, leaving the vast majority of any context window for the actual task.

---

## 5. Truth maintenance

A human developer treats documentation with ambient skepticism; when the docs and the code disagree, the human notices, sighs, and trusts the code. A model extends no such skepticism by default: **the model believes the documents it is given.** This inverts the status of documentation drift. In a human-oriented project, stale docs are a chore. In an LLM-first project, any divergence among spec, compiler, and library is a **correctness bug in the system itself**, with the same severity as a compiler bug — because the spec is not *about* the product, it is a functioning component of the product's authoring loop.

The consequences are mechanical and non-negotiable:

- **Every example in the spec and the brief compiles, in CI, forever.** An example that stops compiling fails the build.
- **Every documented behavior is asserted by a test.** Defaults, semantic rules, the negative-knowledge list ("X does not exist" should fail to compile, verifiably) — all mechanically tied to the implementation.
- **Generated where possible, verified where not.** Catalogs, attribute tables, and signatures should be extracted from source, not hand-maintained.

**Versioning** follows the same logic. The spec carries a version; the brief pins it; the language never changes semantics silently under a document that still describes the old behavior. A model must never be in the position of writing against last year's grammar without being told — because unlike a human, it will not feel the era mismatch.

Finally, the **corpus endgame**. If the language succeeds, a corpus will accrete — examples, blog posts, and above all LLM-generated code, some of it wrong, all of it eventually stale. Two standing rules prepare for that day. First, an explicit authority ordering, stated in the brief itself: *spec beats examples beats your priors*. Second: **every published example is future training data and should be treated as a teaching artifact.** The exemplar gallery, the library source, the flagship applications — these are being written today for scrapers that will arrive later. Curating them in canonical form, exercising the language's actual idioms, is the one chance to seed the eventual corpus deliberately rather than letting it precipitate out of whatever escaped into the world.

---

## 6. Diagnostics: the compiler as teacher

For a human, an error message is an interruption — the philosophy of humane diagnostics (Elm and Rust are the exemplars) is to soften the interruption and speed the exit. For an LLM in an authoring loop, a diagnostic is something else entirely: it is **the curriculum, delivered at the moment of maximum relevance**. The model has just demonstrated, concretely, a specific gap between its understanding and the language's reality. The diagnostic is targeted retrieval from the spec, arriving precisely when that fragment of spec is the most important text in the world — and it is simultaneously the *reward signal* that steers the repair loop. No other channel teaches the model as efficiently, because no other channel gets to pick its moment.

This is not merely a pleasing frame; the repair literature has put numbers on it (§12). Self-repair success is bounded by the *quality of the feedback*, not the model's raw capability — substituting expert feedback for a model's self-assessment multiplies repair rates — and in controlled comparison, raw stock compiler messages underperform expert prose explanation as repair input by roughly fourteen percentage points. The gap between *detecting* an error and *explaining* it is real and measurable, and closing it is the compiler's job, once, rather than every model's job, every time.

That framing generates the design philosophy:

**Teach the rule, not just the violation.** The diagnostic should restate the violated rule as a rule — a sentence of spec, quoted or paraphrased, general enough to prevent the *class* of error, not merely flag the instance. A model given only "unexpected token" learns nothing transferable; a model given the rule writes the next hundred occurrences correctly. Every diagnostic is a chance to place one paragraph of spec into context for free.

**Name the fix — with calibrated confidence.** When the correct repair is knowable, state it, ideally as literal replacement text. But here is a genuine LLM/human divergence: humans treat "did you mean...?" as a hint and discount it; **models comply with suggestions literally**. A wrong suggestion derails a model far harder than a human. So suggestions must be calibrated: offer literal fixes only at high confidence; below that, name the rule and the relevant options and stop. A diagnostic system for LLMs needs an internal honesty policy about what it actually knows.

**Complete over incremental.** Humans fix one error and recompile; the currency of the LLM loop is *iterations*, so a compile pass should report **all independent errors at once**, with cascade suppression doing real work — one root cause must not spray twenty downstream ghosts, because the model will dutifully "fix" the ghosts. The ideal report enables a single edit that fixes everything real.

**Deterministic and dual-register.** Same input, same diagnostics, same order — loop stability, caching, and evals all depend on it. And every diagnostic should exist in one artifact readable both ways: a stable, machine-parsable shape (for tooling and evals) whose content is precise prose (for the model and the human). Not two messages; one message with discipline.

**Say what was understood, not just what failed.** "Expected an attribute here; you appear to be declaring a child node; child nodes are declared by X" grounds the repair in the compiler's actual parse. A model recovering from an error benefits enormously from knowing which part of its output the compiler *did* accept.

**Never cute.** Humor and personality in diagnostics are noise to the machine reader and — worse — style-imitation bait for a model that infers register from context. The right voice is the spec's voice.

**Warnings need a stricter philosophy than errors.** A warning channel is one that models either over-obey (burning tokens appeasing lint noise) or learn to ignore (killing the channel for the cases that mattered). The policy: a warning exists only if it is *actionable* and *probably indicates a real defect*. Style enforcement belongs to the formatter (silently), and "legal but suspicious" analyses belong in a separate advisory tool invoked deliberately — not sprayed into every compile. Every warning the toolchain emits is spending the credibility of all the others.

Most of this philosophy would improve human-facing diagnostics too — precision, rules, fixes are universal virtues, which is why the best human-oriented compilers already approximate them. The genuinely LLM-specific extensions are: completeness-over-brevity, calibration of literal suggestions, determinism as a guarantee rather than an accident, negative-knowledge diagnostics ("there is no such attribute; the nearest real concepts are...") — and one more that closes the loop with Section 9: **diagnostics are the first responders of the eval-tuning process.** When evals reveal a recurring model confusion, the cheapest effective interventions, in order, are: a better diagnostic, then a better spec paragraph, then — only with evidence — a language change.

---

## 7. The verifiability ladder

Verification is not one thing; it is a ladder of oracles, ordered by cost and by fidelity to intent. The cheap rungs are fast, deterministic, and answer narrow questions perfectly; the expensive rungs are slow, fuzzy, and address what actually matters. The strategic principle for an LLM-first toolchain: **catch every defect class at the cheapest rung capable of expressing it, and design the language to push defect classes downward.** Every class moved down-ladder compounds across every iteration of every task forever. Full verifiability is unreachable and not the goal; the goal is that what survives to the expensive rungs is only what genuinely requires them.

From worst to ideal:

**Rung 0 — Resemblance.** The code looks like code that tends to work. This is the *only* pre-runtime verification the corpus stack's default loop provides, and naming it makes the baseline honest: an LLM writing React verifies its output, statically, by vibes.

**Rung 1 — Structure.** It parses; the document is well-formed. Trivial, but note that even this rung rewards design: a grammar with strong local structure lets a parser produce the precise, resumable errors that Section 6 demands, instead of "unexpected token at line 400."

**Rung 2 — Resolution and types.** Every name refers to something real; expressions typecheck; attributes exist on the things that carry them and receive values of the right shape. This rung is where a huge fraction of LLM error naturally lands — hallucinated attributes, misremembered names, interference ghosts from Section 3 — and it is the rung that converts them from runtime mysteries into instant, teachable diagnostics. A language whose static form declares its intent richly makes this rung disproportionately powerful.

**Rung 3 — Domain semantics.** This is the rung that justifies building a DSL at all. Because the language's syntax carries domain intent — this is a view hierarchy, these are reactive relationships, this is layout — the compiler can check things no general-purpose language could ever see: dependency cycles in reactive constraints, contradictory or unsatisfiable layout, bindings to paths that cannot exist, unreachable states, dead relationships. In a general-purpose stack, these truths are buried in imperative code and recoverable only at runtime, if ever. In a declarative language they are static properties. **Every semantic the language expresses declaratively rather than imperatively is a defect class moved from runtime observation (expensive, fuzzy) to compile-time proof (cheap, exact).** This is the deepest coupling between language design and the ladder, and a standing test for future language decisions: *which rung will catch a mistake in this feature?*

**Rung 4 — Deterministic instantiation.** Headless boot: the program constructs, initial values compute, layout solves, no runtime errors, and a machine-readable description of the initial scene comes back. Cheap, fully automatable, sub-second — and it catches the large class of programs that are statically clean but dynamically incoherent. This rung should be part of the default verify action, not a separate ceremony.

**Rung 5 — Behavioral verification.** Drive the application and check what it does. This is where today's mainstream tooling is actively hostile to LLM authorship — DOM selectors, flaky waits, screenshot-scraping — and where an owned runtime can most differentiate. The requirements fall on the *runtime*, not just the test harness:

- **Queryable.** The tree, the computed values, the current state — exposed as structured data. The model cannot glance at a screen; give it a structured act of looking.
- **Explainable.** Not just *what* is the value but *why*: which relationship produced this position, which rule won, what this value depends on. Provenance queries turn debugging from ritual re-runs with print statements into direct interrogation — and a language whose semantics are declarative can answer them, because the reasons are reified in the program. The repair literature (§12) says this is exactly where to invest: models fix syntax and naming errors nearly for free, but repair *semantic* failures less than half the time — provenance is aimed at the hard half.
- **Drivable.** Synthetic input — pointer, keys, time — injected deterministically, with time itself schedulable (animation and motion become testable by stepping the clock, not by waiting and hoping).
- **Assertable at the language's altitude.** Checks written in terms of the language's own concepts — *this view is visible; after this drag, this item's date changed* — not in terms of rendering internals. Assertions should read like the language, and their failures should be reported in exactly the diagnostic register of Section 6: located, rule-stating, fix-suggesting. The compiler and the test harness should feel like one teacher.

**Rung 6 — Visual verification.** Pixels, at last. Two fundamentally different uses, which must not be conflated:

- **Regression** — perceptual diff against an approved baseline. Answers only "did it change," but answers it perfectly. A language that renders its own pixels holds a rare luxury here: deterministic rasterization can make baselines byte-stable, eliminating the tolerance-tuning misery of browser screenshot testing. Cheap enough to run constantly once a baseline is blessed.
- **Judgment** — a multimodal model examines a screenshot against stated intent. This is real but weak, and the toolchain should be designed around its true failure profile: reliable for gross failures (blank regions, overlap, clipping, unreadable contrast, obviously broken layout), unreliable for fine polish (is this spacing *right*) — and, per the evidence (§12), markedly worse at judging *interaction* than static layout, which is why behavior must be verified at rung 5 with interaction traces rather than inferred from pixels here. Three design moves raise its value considerably: **scripted states** (named application states with deterministic routes to them, so screenshots are reproducible artifacts, not lucky captures); **falsifiable questions** ("does any text overlap another element?" outperforms "does this look right?" — the rubric is a checklist of specific failure modes, not an aesthetic verdict); and **instrumented rendering** (debug overlays — bounds, baselines, hit regions — that convert judgment calls into geometric reading, which models do far more reliably).

**Rung 7 — Intent.** Does the application do what the user *meant*? This rung is the ceiling; no toolchain reaches it, and the honest design goal is different: **narrow what this rung has to arbitrate.** When rungs 1–6 have discharged mechanics — it compiles, references resolve, semantics cohere, it boots, it behaves as asserted, it looks unbroken — what remains for human judgment is taste and fitness of intent. That is the correct division of labor between machine verification and human review, and reaching it would already be a different world from the current one, where human review is the first line of defense against typos.

**The toolchain that falls out.** One command — call it *verify* — that climbs the ladder as far as it can and reports everything in the unified diagnostic register. Deterministic end to end. Local-first: compiler, headless runtime, deterministic renderer, screenshot and diff all on the developer's machine, because a dev loop with zero cloud dependencies is faster, private, permanently available, and — decisive for this project — *reproducible by the eval harness of Section 9 at any scale*. Fast enough to live inside the model's loop: sub-second through rung 4, seconds through rung 6. The single-command shape matters more than it looks: every additional decision about *how* to verify is a decision the model can get wrong, and "run verify, read the output, fix, repeat" is a loop so simple it cannot be misassembled.

---

## 8. The brief: a language in one page

Somewhere a model that has never seen this language must read one artifact and begin working competently. That artifact — call it the **brief** — is the most leveraged document in the entire system, and it deserves to be engineered, measured, and versioned like the compiler. Its philosophy: the brief is not a summary of the spec; it is a **bootstrap** — the minimum text that makes the model *productive and correctly calibrated*, including calibrated about what it doesn't know.

The contents, in the order they should appear (order matters; models weight early framing heavily):

1. **Identity and mental model.** What kind of language this is, what the execution model is, and one small-but-real canonical example — before any rules. Models, like humans, parse rules far better once a concrete instance exists to hang them on.
2. **The grammar's spine, by example.** The recurring structural forms shown as minimal canonical examples with one-line glosses — not BNF. The strongest in-context language-acquisition study found that nearly *all* of the gain from a grammar book in context came from its worked examples, not its prose grammatical explanations (§12) — so the brief should be example-dense by design, with rules as glosses on examples rather than the reverse. Examples also smuggle in the canonical form for free.
3. **The semantic core.** The five-to-ten laws that generate correct predictions about everything else: how reactivity works, how layout composes, how scope resolves, what happens on failure. These are the highest-value tokens in the document — each one prevents an entire genre of wrong guesses.
4. **Negative knowledge and footguns.** What does not exist (the interference list from Section 3, each entry with the language's real answer), and the empirically-maintained top mistakes models actually make (from Section 9's evals). This section is unusual by human-documentation standards and indispensable here.
5. **Epistemic instructions.** Explicitly: *this language is not in your training data; this spec overrides your priors; when uncertain, look it up — do not extrapolate from other languages.* Models follow explicit epistemic framing measurably better than implied framing, and this paragraph is the cheapest interference-suppressor available.
6. **The tool contract.** The commands (compile, verify, query, screenshot), what their outputs mean, and the expected loop: write → verify → read diagnostics → fix → repeat. The model should never have to infer the workflow.
7. **The escalation map.** Where the full spec lives, how to consult the library catalog, the fact that component source is readable and *is* the ground truth, where the exemplar gallery is. The brief's job is not to contain everything; it is to make everything findable and to establish what's authoritative.

Budget: the brief proper in the low single-digit thousands of tokens; brief + catalog + semantic core resident within ~10–15K (Section 4). Everything else is retrieval.

**Packaging as a skill** — in the current AI-tooling sense — is not just appropriate; it is the natural container, because the skill pattern *is* this design: a compact always-loaded instruction file, deeper references loaded on demand, and executable tools alongside. Brief = the skill's core; spec chapters, catalog, and exemplars = its references; compile/verify/query = its tools. Two cautions. First, the skill format is a container, not the design — the layered bundle should be harness-agnostic, portable to any agent system, with the skill packaging as one thin wrapper. Second, and more important: **the brief is an empirical artifact.** It is tuned against evals, versioned with the language, and regression-tested when it changes. A brief that has never been measured is a guess wearing the costume of documentation.

A skeleton, to make the shape concrete:

> **[Language] in one page** *(spec vX.Y — this document is authoritative over your training priors)*
> 1. What this is — two sentences + one 15-line canonical example.
> 2. Forms — the structural patterns, one minimal example each.
> 3. Laws — the semantic core, numbered.
> 4. What does not exist — the interference list, with real alternatives.
> 5. How you'll get it wrong — top observed model mistakes, with corrections.
> 6. Your tools — commands, outputs, the loop.
> 7. Going deeper — spec, catalog, library source (readable, authoritative), exemplars.

---

## 9. Evals: measuring, tuning, and finding the footguns

The eval strategy has three jobs, and conflating them wastes all three: **measure** the language's effectiveness against the incumbent honestly; **tune** the mutable surfaces (brief, spec, diagnostics) against evidence; and **indict** — identify language features that empirically remain LLM footguns after the documentation has done its best, producing the "change this, it's too confusing" list with receipts.

**The task suite.** A fixed set of application briefs spanning the domain's archetypes: static composition and layout; a form with validation; a data-bound collection with dynamic updates; direct-manipulation interaction (drag, selection); motion and animated transitions; and at least one small complete application combining several. Each task ships with machine-checkable acceptance: behavioral assertions (rung 5) plus a visual rubric of falsifiable questions (rung 6). Tasks are versioned and frozen; changing a task forks its history.

**Four tracks**, each isolating a different capability:

- **One-shot.** Single attempt, no iteration: compile rate, acceptance pass rate, tokens, wall time. One-shotting matters even though the language should expect to lose it early — because time-to-working and token cost are salient regardless, and because *where* one-shot attempts fail is the highest-signal data in the entire program. Every failure is classified into a defect taxonomy: syntax, resolution, semantic-core misunderstanding, interference ghost, library misuse, logic. The taxonomy's distribution, tracked over time, is the language's health chart.
- **Iterated.** The real loop, with the toolchain: iterations-to-green, total tokens, and above all **self-recovery rate** — the fraction of failures the model fixes with no human hint. This is the metric the whole thesis stands on. A companion metric, **diagnostic efficacy** — when the model recovers, did the fix follow the diagnostic's guidance? — measures Section 6 directly and tells you which errors are teaching and which are merely gesturing.
- **Comprehension.** Given a program, answer questions: predict behavior, locate what controls X, explain why Y is positioned there. Cheap to run, no generation confound — this isolates *analyzability*, the read half of the language's claim, and doubles as the honest test of "human readability" since the questions are exactly what a human auditor asks.
- **Modification.** Given a working application, make a specified change: correctness of result, size and cleanliness of the diff, whether unrelated code was disturbed. This is edit locality (Section 4) measured directly, and it is closest to real usage — most of software is modification.

**Baseline.** Same tasks, same models, same harness, same budgets: React + TypeScript as the incumbent (optionally one more point of comparison, e.g. SwiftUI, to separate "corpus effect" from "web effect"). The comparison must be honest about the baseline's strengths: it will win early one-shot rates, and the interesting result is the full curve — cost, iterations, self-recovery, and defect classes — not a single scalar. One task shape to keep *out* of the headline measures: translating existing React applications into the language. The evidence (§12) is that code-to-code translation into a new language underperforms generating from intent directly — the model drags source-language idioms along — so translation belongs, at most, in a stretch track, and briefs should state intent, not incumbent code.

**Scoring.** Mechanical oracles first (compile, assertions, perceptual diff); a judge model only for the visual-rubric and quality dimensions, constrained to the falsifiable-question checklist; periodic human audit of the judge. Run every track across at least two model tiers — a frontier model and a smaller one. The smaller model is the canary: **a language simple enough for the small model is robustly simple**, and small-model scores are a leading indicator that "it works" is coming from comprehension rather than from the frontier model's brute capability.

**The tuning loop** — where evals stop being a scoreboard and become the engine. Every failure is triaged into exactly one of:

1. **Documentation gap** — the model couldn't have known. Fix the brief or spec; rerun.
2. **Diagnostic gap** — the model erred, and the toolchain's response failed to teach the repair. Fix the diagnostic; rerun.
3. **Language footgun** — the model keeps failing *despite* accurate docs and good diagnostics.

The escalation order is deliberate: docs and diagnostics are cheap and safe to change, so they absorb the churn while the language stays stable — and only failures that *survive* improved docs and improved diagnostics, across multiple models, earn a place on the language-change list. That standard makes the indictment credible: a feature convicted this way isn't "confusing in someone's opinion," it is measurably unteachable in context, which is the definition of an LLM footgun. The same suite then serves as the regression harness: every change to the brief, the spec, a diagnostic, or the language reruns the affected tracks, so the system's teachability is under version control along with its code.

---

## 10. UX knowledge: inherit the vocabulary, steer past the median

A distinction the whole section rests on: models hold two different bodies of UI knowledge. **Implementation idioms** — how React structures a modal, what a `div`-soup dropdown looks like — and **interaction concepts** — what a master-detail *is*, what affordances are, why direct manipulation feels immediate, how motion conveys continuity and spatial persistence, what platform conventions users expect. A corpus-free language sheds the first body of knowledge automatically (there is no React idiom to transliterate into it) while the second transfers fully, because it lives at the level of *design*, not code. This is quietly one of the best trades available: the model's design education arrives intact, with its `div`-soup habits confiscated at the border.

**Inheriting the vocabulary.** The mechanism is naming. Every name in the language — primitives, components, attributes, events — is a retrieval key into the model's concept space. When the language's word for a thing is the interaction-design literature's word for that thing, the model attaches correct expectations for free; when the word is an implementation-flavored neologism, those expectations stay unretrieved. The naming layer of the language should be audited as an interface to the model's prior knowledge: concepts should be named at the *perceptual and interaction* level wherever one exists.

**Steering past the median.** Left to itself, a model regresses to the median artifact of its corpus — the median web app, with the median web app's compromises, many of which exist only because the web platform made better things hard. A language designed to make better things easy faces a subtle problem: **the model will not reach for capabilities it doesn't know it has.** Capability defaults are corpus defaults. Three mechanisms counter this:

1. **Name the capabilities.** The brief and spec should contain an explicit "what this language makes easy that the web makes hard" section — continuous zoom, constraint-driven fluid layout, pervasive physical motion, whatever the language's actual superpowers turn out to be — each named as a capability with a one-line exemplar. An unnamed capability effectively does not exist for an in-context author.
2. **Exemplars are the steering mechanism.** Models imitate artifacts, not adjectives. A prose exhortation to "use motion meaningfully" does almost nothing; a small curated gallery of applications that *actually exceed* the median — readable in full, in canonical form, exercising the novel capabilities — does almost everything. The flagship applications are not demos; they are pedagogy, and they will also be the most-scraped artifacts when the corpus endgame of Section 5 arrives. They deserve to be written with that double audience in mind.
3. **Ship a design point of view.** The strongest platforms have always encoded design opinion (the Mac's HIG being the canonical case), and the skill is the natural place for this language's: guidance about when to animate, how to use space, what responsiveness means here. This is a layer above the language — but for an LLM author it is *executable* design opinion, because the model actually follows it.

And one guardrail, enforced by the eval rubric rather than by hope: **novelty is not the goal; fitness is.** A model over-steered toward the language's special capabilities will produce gratuitous zooming the way over-prompted image models produce gratuitous lens flare. The design-quality rubric should reward *appropriateness* — including knowing when the boring, conventional pattern is exactly right.

---

## 11. Anti-goals

What this effort deliberately does not optimize for — stated so the requirements stay falsifiable and the scope stays honest:

- **One-shot parity with the incumbent, early.** Corpus leverage is real; the incumbent wins the first scoreboard. The claim under test is about cost-to-correct, self-recovery, and the trend line — not day-one familiarity.
- **Corpus-free operation forever.** A corpus will accrete, partly wrong. The design target is a language whose ground truth remains the maintained spec even after a corpus exists — not a language that only works in a corpus vacuum.
- **Expressiveness maximalism.** This is a domain language. Every addition is measured against the ladder (which rung catches its misuse?) and the budget (what does it cost in the brief?). Features that verify poorly or document expensively are net-negative even when individually appealing.
- **Human-typing ergonomics maximalism.** Terseness for the pleasure of the fingers — cleverness, code golf, optional-everything — serves neither the machine author nor the human auditor. Human *readability* is load-bearing; human *typing convenience* is not.
- **Verification completeness.** The ladder has a ceiling and rung 7 belongs to humans. The goal is that only taste and intent survive to reach them.

---

## 12. Prior art

*Based on a dedicated sweep of academic and industry work through mid-2026. The one-line summary: every individual pillar of this document's position has been validated somewhere; the composition — all of them, in a UI language — has not been attempted anywhere published.*

**The core bet has direct evidence.** The strongest single datapoint is **Anka** (2025), a DSL designed specifically for LLM generation (data pipelines): with *zero* training exposure and only an in-context spec, a mid-tier model achieved 95.8% task accuracy versus 91.2% writing Python — its best-trained language — with a forty-point advantage on multi-step tasks. A purpose-built, corpus-free DSL beating the incumbent on the incumbent's home turf is exactly the thesis of Section 1, proven in a neighboring domain. **AIDL** (2025) shows the same division of labor in CAD — the LLM declares intent, a constraint solver guarantees the geometry — structurally identical to a constraint-based UI layout system. And **UICoder** (Apple, 2024) is the closest UI-domain precedent: a model with essentially no SwiftUI in its training data, improved to near-GPT-4 compile rates using *only* the compiler and a vision scorer as supervision — the compiler and a visual critic as the sole teachers of a declarative UI DSL. That was done at training time; this project internalizes the same loop at authoring time.

**Specs-in-context work — and examples beat prose.** The grammar-prompting line (NeurIPS 2023) showed that compact grammars in context substantially lift unseen-DSL generation; the "learn a language from one grammar book" benchmark (MTOB) showed long-context models *exceeding a human baseline* given a full grammar book in context. But the sharpest finding is the ICLR 2025 follow-up: nearly all of that gain traces to the book's **worked examples, not its prose grammar explanations**. This directly shapes Section 8: the brief must be example-dense, with rules as glosses on examples rather than the reverse.

**Static analyzability pays most exactly where the corpus is absent.** The Hazel typed-holes work (OOPSLA 2024) found that supplying expected types and statically-retrieved relevant definitions improved error-correction about **four times more in the low-resource language than in TypeScript** — and that principled static retrieval beat RAG. The gains from analyzability are largest precisely for the language nobody trained on, which is the quantitative footing under Sections 4 and 7. Adjacent work shows syntax and even well-typedness can be *guaranteed* at generation time via constrained decoding (SynCode; monitor-guided decoding; PLDI 2025 type-constrained generation) — with the caveat that heavy-handed grammar masking degrades output quality, another argument for a small, regular grammar that rarely fights the model's natural continuations.

**Diagnostics: the target is quantified; the discipline is unoccupied.** The repair literature establishes that self-repair success is bounded by feedback quality (expert feedback multiplied repair rates by ~1.6× over self-assessment), that **raw compiler messages underperform expert prose explanation by ~14 percentage points** as repair input, and that models repair syntax/naming errors nearly for free while fixing semantic failures less than half the time. Rich, structured diagnostics (Rust-grade, with spans, notes, and suggestions) measurably beat terse ones for machine repair. Yet **no published work treats compiler-diagnostic design as the independent variable** — nobody has designed and evaluated diagnostics *for* machine repair from day one. A couple of 2026 languages gesture at it (Vercel Labs' Zero ships structured JSON diagnostics with typed repair IDs; MoonBit's toolchain feeds structured diagnostics to an integrated agent), but as shipped intuition, not evaluated design. Section 6 is describing open ground.

**Priors are stubborn — the transfer picture is confirmed with an edge.** Studies find models leaning on training priors even against semantics explicitly declared in context, and performing poorly on arbitrary formal novelty with no familiar scaffolding; a 2026 benchmark on a genuinely post-cutoff language (Cangjie) additionally found that **code-to-code translation into a new language underperforms generating from intent** — negative transfer of source idioms — which informed Section 9's eval design. Together these confirm Section 3's "borrow honestly, diverge loudly" while sharpening it: divergence-signaling helps but cannot be fully trusted, so interference suppression is ultimately the verification ladder's job.

**Visual feedback is a crowded subfield with one important caution.** Screenshot-revision loops for UI generation are now abundant (Design2Code and successors; compiler-in-the-loop generation for existing declarative frameworks reaches ~98% compile rates). The caution: multimodal models are markedly worse at judging *interaction* than static layout — screenshots under-specify behavior — which is why this document places behavioral verification (rung 5, with interaction traces) below and before visual judgment (rung 6), not the other way around.

**Adjacent but distinct — worth naming to avoid confusion.** The industrial "generative UI" wave (A2UI, Flutter GenUI, Vercel's generative UI, v0) is *JSON component catalogs*: deliberately Turing-incomplete wire formats with no expressions, no layout semantics, and no compiler, achieving reliability by narrowing the vocabulary to prebuilt components. That is a legitimate strategy and the opposite of this one — it buys safety by abandoning expressiveness, where this project buys safety with a compiler. "AI-native" languages (MoonBit foremost) validate the claim that toolchain can compensate for corpus, though mostly for general-purpose programming. And the practitioner playbook is emerging in miniature: at least one new DSL ships an agent-facing brief *generated from the language binary itself* — Section 5's no-drift principle, independently arrived at.

**The open ground, stated precisely.** No published artifact combines: a full UI language (expressions, reactive/constraint semantics, type system, compiler) + zero training corpus + an example-dense in-context spec + statically-analyzable-by-construction semantics + diagnostics engineered as the primary repair signal + behavioral and visual verification in the loop. Each element is proven separately, several in other domains; the composition is unattempted in the one domain — UI — where the render-and-interact feedback channel is uniquely available. Even the position-paper slot at PL venues is, as of this writing, unoccupied. This project is the experiment, and the surrounding evidence says the experiment is well-posed.

---

## 13. How this document is used

Three ways, in order:

1. **As a yardstick.** The existing language and toolchain are audited against it, section by section. Divergences become work items or documented exceptions; convergences are logged as independent confirmation.
2. **As the parent of the implementation spec.** A separate document will translate these principles into concrete requirements for this language — that document inherits its *why* from this one.
3. **As a living record.** The evals of Section 9 will prove some of this document's reasoning wrong. When that happens, this document is revised with the evidence cited — which is, after all, exactly the discipline it prescribes for everything else.
