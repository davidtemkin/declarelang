# A new guide: the outside-in proposal

*Status: proposal, 2026-07. Written from a fresh survey of the language, the apps, the
library, the evals, and the live system — deliberately without reading the current
`docs/guide/`. This is the plan to react to, not the guide itself.*

---

## 1. What the guide is for

Three objectives, in priority order:

1. **Reframe.** Move a reader from time-sliced thinking (renders, effects, lifecycles,
   "when does this run?") to relationship thinking ("what derives from what?"). This is
   the actual meaning of *think in Declare* — everything else in the language is a
   corollary of it.
2. **Equip.** By the end, the reader can hand-write a real app, drive the toolchain
   (dev server → errors → verify → ship), and direct a model to do the writing while
   staying the reviewer who decides.
3. **Persuade.** The guide is the long-form landing surface behind the homepage's
   claims. It persuades by *demonstration* — every claim is a live example the reader
   can break and repair — never by adjectives.

A useful test for all three: **the capstone is comprehension.** Reading and writing
aren't separate skills to teach — understanding is the goal, and prediction is how you
measure it. If a person who started the guide as a React developer can open
`calendar.declare` at the end and say what it does — a continuously-animated four-view
calendar, understood in one sitting — every positioning claim (legible, small,
continuity as the grain) has been *experienced* rather than asserted. That is the
guide's finish line, and its structure works backward from it.

### Audience

- **Primary: the React reader** — meaning the whole bundle: React idioms, HTML/CSS
  instincts, JS/TS fluency, and the surrounding ecosystem reflexes (npm, routers,
  fetch-libraries, motion libraries). This reader's default failure mode is carrying a
  rule over from something Declare resembles. The guide must intercept those instincts
  *at the moment they fire*, not in a appendix they'll never read.
- **Secondary: the SwiftUI reader** — already comfortable with declarative trees and
  value-derived UI; their questions are different (where's my `@State`? how does this
  reach the web? what replaces modifiers?). Served by lighter, parallel notes on the
  same rails as the React interceptions — never a second narrative.
- **Both modes of use**: hand-writing and LLM-directed. The guide teaches both, in that
  order — you can't review what you don't understand, and you can't direct well what
  you've never written at all.

### What the guide is *not*

- Not the contract — `declare.md` is, for humans and models both. The guide narrates
  and motivates; it links to `declare.md` and the generated reference for normative
  edge detail, and never duplicates them (duplication is drift waiting to happen).
- Not a reference tour of the component library (generated reference's job), and not
  operational documentation (install/build pages exist).
- Not co-written for an LLM audience. Other documents hold that line; the guide is for
  people. It can be *about* working with models without being *for* them.

---

## 2. The central reframe, named

The one-sentence thesis the whole guide teaches:

> **In Declare, everything is a standing relationship — you declare what should be
> true, and the runtime keeps it true.**

Every major feature is that sentence at a different scale, which gives the guide its
through-line and the reader one idea to hang everything on:

| feature | the relationship it declares |
|---|---|
| a constraint | value ↔ the values it reads |
| layout | children ↔ space |
| a state | mode ↔ a bundle of overrides (reversible, so it cannot leak) |
| a spring | attribute ↔ its target, through time |
| a datapath | view ↔ a place in the data |
| replication | subtree ↔ each record |
| `location` | app state ↔ the URL |
| theme | look ↔ one prevailing record |

The React contrast writes itself and should be stated once, early, plainly: React
re-runs a function and reconciles the output; the machinery you manage (hooks, deps,
memo, effects) exists to make the re-running affordable and its timing survivable.
Declare has no re-running to manage. The comparison is *structural*, made a handful of
times at load-bearing moments — never code golf, never a dunk.

The "less is more" positioning gets the same treatment: the React bundle is five-plus
surfaces (JSX, CSS, JS/TS, the hooks model, the ecosystem's routers/fetchers/motion
libraries) with the hard problems living in the seams *between* them. Declare is one
surface where those seams don't exist — which is why there is simultaneously less to
learn and more you can say without contortion. The guide should make this point by
*count* (here is everything you now don't need) exactly once, and by *experience*
(chapters keep ending sooner than a React reader expects) everywhere else.

### The case for continuity — the user-facing "why"

The mechanics of Part Three need an argument in front of them, because the deeper
claim isn't that Declare animates well — it's that **animation in Declare isn't an
effects layer; it's the means to a continuous user experience.** The guide states
the why in plain human terms before any spring is tuned:

- **Continuity keeps the user oriented.** When a view *becomes* the next one, the
  interface answers "where did that go? where am I now?" before the question forms.
  A discrete cut discards the user's spatial context and makes them rebuild it —
  that rebuilding is cognitive overhead the interface chose to impose.
- **Motion carries meaning.** The month folding into its slot in the year *is* the
  data relationship, made visible. Good continuous motion is information, not
  decoration.
- **Interruptibility respects intent.** A continuous interface stays live
  mid-motion — change your mind halfway and it follows, nothing to wait out. (In
  Declare this is free: interruption is just the target changing.)
- **And it is simply finer craft** — the quality people feel in the best native
  software without being able to name it. It reads as care.

Paired with the horizon claim: this level of UX has been specialist, bespoke,
platform-locked work — Declare moves it into the declarative layer, which opens
territory past today's carefully-crafted references. And always with the
reassurance, stated plainly: **none of this is mandatory.** Declare is built for
thoroughly conventional UIs — forms, settings, dashboards, admin tools — and does
them with less machinery than the incumbents. Continuity is a capability standing
by when you want it, not a house style you must adopt. The floor is ordinary; the
ceiling is open.

Placement: a compact version of this (horizons + reassurance) is part of chapter 1's
appeal; the full argument opens chapter 9 as Part Three's first movement, before any
mechanics; chapter 13 closes the loop by reading the calendar as the argument made
real.

---

## 3. The LLM thesis: braided, not boxed

The thesis has three layers — the **claim** (a small, closed, verifiable language is
the one kind of leverage a new language can compete on), the **machinery** (mandatory
typechecking, fix-naming diagnostics, the verify ladder, one-way-to-say-things, the
one-file contract, the packaged skill), and the **method** (the eval harness that
tests the claim instead of assuming it). The guide weaves them differently:

**The claim lands in chapter 1**, as part of "why now" — one honest page, including
the pivot that makes it matter to *this* reader: everything that makes the language
legible to a model is what's about to make it learnable in an afternoon by them. The
reader is the beneficiary of the LLM design brief before they ever involve an LLM.

**The machinery is experienced before it is explained.** This is the key move: the
LLM infrastructure *is* the reader's own developer experience, so they meet it as
theirs first. Break-and-repair moments have them deliberately triggering diagnostics
from chapter 2 on — they feel messages that name the fix long before chapter 12 tells
them those messages were written to steer a model's next attempt. Verify appears as
*their* oracle in the loop chapter before it appears as the model's leash. The
in-browser compiler is running their edits on page one — quiet evidence throughout
that gets named when the loop chapter arrives. A handful of one-sentence "with a
model" asides in Part Two (two or three, no more) connect specific regularities to
why generation rarely goes wrong there — e.g. the value pattern, the closed layout
vocabulary.

**The model chapter (Part Four) is a synthesis, not an introduction.** By the time
the reader reaches it, every mechanism in it is already familiar — the chapter's job
is to reveal the design intent connecting them, then teach the practice: hand your
model `declare.md` or install the skill; describe intent; review by reading the tree
(which Part One made natural); let verify close the loop. And it explains **the
method**, FAQ-register, because the method is the credibility: an eval harness gives
models the brief and the reference *alone*, one-shot and iterated, scored mechanically
by the same verify ladder the reader just used; failures feed back into the language,
the diagnostics, and the docs — several language changes exist because evals showed
models tripping. *Tested, not assumed* is the sentence that separates this from every
"AI-ready" claim the reader has learned to discount. The calendar's "0 lines by hand"
is the case study, told straight: what the person did (product work), what the model
did (every line), what the toolchain did (kept it honest).

**The organically-placed evidence.** Three "interesting bits" are woven into the
narrative where they're *felt*, each tied back to the same root — a language that
owns its whole semantics, with no substrate assumptions leaking in, is what makes the
spec self-contained enough to hand a model, and it's also what makes these possible:

- **The canvas renderer** — appears in the appearance chapter (no cascade is *why*
  renderer independence is possible), with a try-it: append `?render=canvas` to the
  example you're looking at — same program, same pixels. Clean abstraction, made
  visible in one click.
- **The in-browser compiler** — present from page one (it's what makes the guide's
  own examples live), named in the loop chapter as the reason view-source culture
  works here: the page can edit and re-run itself.
- **SSR, dispensed with** — in the system chapter: static extraction replaces the
  entire server-rendering apparatus a React reader has paid for (hydration, the
  server/client component split); a Declare site is crawlable from a static host
  with no server at all. The simplification isn't a missing feature — it's a whole
  layer the architecture never needed.

---

## 4. Form: how it teaches

**Live examples are the spine, not the garnish.** Every concept lands inside the first
screenful of its chapter as an embedded, editable, running program. Three interaction
patterns, used deliberately:

1. **Run and poke** — the example runs; the prose points at one line; the reader edits
   it and watches. (The default.)
2. **Predict, then run** — show short source, ask "what happens when you click?", then
   reveal. Prediction is how understanding is measured — and it quietly proves the
   legibility claim every time it works.
3. **Break and repair** — instruct the reader to introduce a specific mistake and read
   the diagnostic. The compiler's fix-naming messages are a headline feature; the guide
   should *cause* the reader to meet them on purpose, early, so errors register as
   steering rather than failure. (No other framework's guide can do this move.)

**Exercises are one-line edit prompts** under examples ("make the bar turn warm at 30
instead of 50"), not project homework. The medium makes them nearly free.

**A running build project** threads Part Two: one small app grown chapter by chapter,
chosen so a React reader has built its equivalent and felt the pain (candidate: a
kanban-style task board — lists from data, editing, drag, filtering, and a
continuity payoff when columns collapse/expand and cards glide on reorder. Alternates
considered: a settings screen (too small to earn Part Three), a music player (weaker
data story)). Hard constraint: **entirely client-side** — a `Dataset` (or a bundled
static JSON beside the guide) is the whole backend; edits live in the session, like
the calendar's. No dynamic server, no persistence layer, nothing to deploy to follow
along. The board is *guide-owned*, so it can't drift when the showcase apps get their
post-library refresh.

**Coming-from interceptions ride in marked sidebars** on the main narrative — "From
React:" and "From SwiftUI:" — so the chapters stay self-contained (readable by someone
from neither world) while the target reader gets their instinct caught exactly where
it fires (e.g. the layout chapter is where "where's my flexbox?" gets answered; the
data chapter is where `.map()`/keys/`useEffect` get retired). Two compact
**phrasebook appendices** (React→Declare, SwiftUI→Declare) collect the mappings for
the reader who wants the table up front.

**Chapter titles are theses.** Declarative sentences that state the claim the chapter
demonstrates — they double as the persuasion and as memory hooks (see the outline).
The guide's own title should probably be the reframe itself: ***Thinking in Declare***
— the deliberate echo of "Thinking in React" is honest (same genre of document) and
instantly orienting for the primary audience.

**Voice:** the calibration target is the homepage's register — written to appeal *and*
be credible — as distinct from `declare.md`'s deliberate just-the-facts. The reader is
a human developer; appeal is as important as anything else. Confident, concrete,
first-person-plural sparingly, zero marketing adjectives — the appeal comes from the
material moving fast and the demos being real. Honesty is load-bearing for this
audience: the honest trades (cold-load compile cost, accessibility depth, no npm
package yet, young ecosystem) appear in chapter 1, not buried — the FAQ's candor is
the right register for those. Contrasts with the React bundle are welcome where they're
*instructive* — especially the reduction in layers (five surfaces and their seams
become one; a whole SSR apparatus becomes a compile step) — and always land as "here's
what you no longer carry," never as a smackdown. Terminology discipline: the language's
own nouns (constraint, state, spring, datapath, replication, prevailing), each defined
once at first use and never paraphrased after.

**Every code fence compiles under CI**, like the rest of the docs. Non-negotiable
inheritance from the house rules.

---

## 5. The outline

Four parts, thirteen chapters — compact as it can be and no more: each chapter is one
genuine mental-model shift; none is padding, and none can merge without burying a
shift a React reader actually has to make. The whole guide is an afternoon (matching
the FAQ's promise), with Part One alone delivering "I get it" in ~30 minutes.

### Part One — The idea *(read-first; ~30 minutes to "I get it")*

**1. A language, not a framework.** What Declare is; why now (the AI-era claim in
brief, with its pivot to the reader — what's legible to a model is what you're about
to learn in an afternoon); the counter demo, live and editable in the first minute —
the in-browser compiler at work before it's ever named. The horizons paragraph:
continuity as what the language newly opens (and why a user should care), with the
floor-is-ordinary reassurance in the same breath (§2). The honest trades, stated up
front. Ends with the map of the guide and the promise: *by the end you will open a
real calendar app and understand all of it.*

**2. Two brackets.** The entire syntax model: `[ ]` structure, `{ }` TypeScript, the
three value forms (bare literal / constraint / datapath), comma-as-terminator, and
the seam's edges (`#hex` vs `0xhex` — the canonical instinct-trap, met via
break-and-repair). Short, complete, and the last time syntax is ever the topic.

**3. Standing relationships.** The heart. Constraints; assignment as the setter; the
compiler extracting dependencies statically; what that retires (the hooks sidebar
lives here); the one rule (name what you read) and the displacement rule (never
assign derived state) — taught here as *principles*, revisited later as habits.

### Part Two — Building *(write-along; the board project starts)*

**4. The tree is the app.** Instances, anonymous subclasses, promoting to `class`;
the where-does-code-live decision rule; the four scope nouns with `classroot` given
the respect its trap deserves. *(From React: components/props/children map here.)*

**5. Space is arithmetic.** The three sizing modes; positions (`center`/`end`);
layout as a reactive attribute; `contentWidth`/`contentHeight`; responsiveness as
constraints on `app.width`; stacking is declaration order. *(From React/CSS: flexbox,
grid, z-index, media queries — all intercepted here.)*

**6. Style is state.** Paint attributes; the text quartet; prevailing `theme` as
just another reactive record — so restyling and dark mode are the same move as any
other derivation; the city presets as evidence styling is *in* the language. The
canvas renderer appears here, organically: no cascade is *why* one program can render
to DOM or its own pixels — try `?render=canvas` on the example you're editing.
*(From CSS: cascade/specificity retired; your color-and-shadow knowledge transfers.)*

**7. Interaction is delivery.** Handlers; no bubbling — a child calls a method;
focus and keyboard for free; the standard library through its *contracts* — the
`Control` base and the three-form value pattern (standalone / app-owned / data-owned)
— then build a small control by hand to prove the library components are ordinary
Declare. Explicitly framed: *the library is growing; the contracts are what to learn;
per-control detail lives in the reference.*

**8. Data is a place, not an event.** `Dataset` / `DataSource` lifecycle; screens
derive from data state; `datapath`, replication, keyed reconciliation; two-way for
leaf editors only; the derived-dataset idiom (build the model as a derivation and
navigation reduces to setting state — the calendar's trick, met here in miniature).
*(From React: `useEffect`+fetch, loading-state choreography, `.map()`+keys retired.)*

### Part Three — Continuity *(the differentiator; the board gets its glide)*

**9. Motion is a target; a mode is a bundle.** Opens with the case for continuity
(§2 above) — why it matters to the *user*: orientation kept, meaning carried,
intent respected, and the reassurance that it's a capability, not an obligation.
Then the two primitives in one chapter, because they share a moral — both are
*reversible, interruptible declarations*: a Spring drives an attribute toward a
target (interruption is just the target changing; `Animator` is the clock-shaped
exception), and a State applies a bundle of overrides while a condition holds (the
leak bug made unrepresentable). *(From React: transition/motion libraries and mode
bookkeeping retired; From SwiftUI: `withAnimation` mapped.)*

**10. Arrangement animates.** The composed idiom that is the language's signature:
spring a few scalars, derive all geometry from them, and layout changes glide in
lock-step. Built as a miniature (a focus-rectangle over a grid — the calendar's
mechanism at toy scale), then applied to the board. This chapter is the pitch's
"continuity is the grain" made manual skill.

### Part Four — The system *(hands-on with the machinery, with and without a model)*

**11. The system around the program.** The program URL as the app's address;
`location` as an attribute (deep links and the back button for free, no router);
static extraction — the whole SSR apparatus a React reader has paid for, replaced by
a compile step: crawlable from a static host with no server at all. Then the loop:
`?view=edit` / `?view=reader`, diagnostics as steering (now named as such), the
verify ladder as the oracle, `declarec` and what actually ships. The in-browser
compiler gets its explicit due here — it's what made every page of this guide work.

**12. Writing with a model.** The synthesis chapter (§3 above): the workflow — human
owns intent, model owns text, toolchain keeps it honest; the practice — hand your
model `declare.md` or install the skill, describe intent, review the tree, let
verify close the loop; and the method — the eval harness, briefs given to models
cold, scored by the same ladder, failures feeding the language. Tested, not assumed.
The calendar's "0 lines by hand" as case study, told straight.

**13. Open the flagship.** The capstone: a guided comprehension of
`calendar.declare` — structure first (the focus rectangle, the derived model, the
springs), then a walk through each idiom the guide taught, now at full scale — and
read explicitly as the continuity argument made real: every "why" from chapter 9
(orientation, meaning, interruptibility) pointed at in the running app. Ends where
chapter 1 promised: you understand all of it. *(Written at arm's length from the
current source — organized around the mechanisms, not line numbers — so the app's
post-library refresh doesn't strand it.)*

**Appendices:** React→Declare phrasebook · SwiftUI→Declare phrasebook · "What does
not exist" (the §13 list, linked not duplicated) · where to go next (reference,
declare.md, FAQ, GitHub).

### Rejected structures, for the record

- **Tutorial-first (one big build, concepts en route)** — rejected: buries the
  reframe under logistics, and page-one persuasion needs the idea, not a scaffold.
- **Concepts-only (no running project)** — rejected: the audience learns by building,
  and the continuity payoff needs an artifact the reader has invested in.
- **LLM-mode woven throughout as the primary lens** — rejected: hand-skill must come
  first for review to mean anything; model-mode lands harder as a synthesis chapter
  whose every mechanism the reader has already used (§3), with only light "with a
  model" asides earlier.

---

## 6. Guardrails

1. **Never read like a React apology.** Interceptions answer the instinct and move
   on. The language is presented on its own terms; comparisons serve the reader's
   transition, not the argument.
2. **Demonstrate, don't assert.** Any sentence of the form "Declare makes X easy"
   must be adjacent to a live example of X or it gets cut.
3. **Honesty placed early.** Trades and immaturity acknowledged in chapter 1 and at
   point of relevance (e.g. accessibility in the interaction chapter), never
   discovered by the reader on their own.
4. **Flux discipline.** The component library is under active development: teach its
   *contracts* (Control, the value pattern, theming) as stable; route per-control
   detail to the generated reference; mark arriving surfaces plainly ("the library
   is growing — this is the part that won't change under you"). No chapter depends
   on homepage/calendar internals except the capstone, which binds to mechanisms,
   not lines. Nothing in-flight ($provide authoring, layers/planes work) appears.
5. **One source of normative truth.** Where the guide and `declare.md` would say the
   same thing, the guide says it *narratively* and links; it never restates contract
   detail that could drift.
6. **Guide-owned examples.** Every embedded example (including the board) lives with
   the guide and compiles in CI; showcase apps are linked and read, not vendored.
   No example — and no exercise — requires a dynamic server or a persistence layer:
   data is a `Dataset` or a static file beside the guide, edits live in the session.
7. **Each chapter closes with "what you can now say"** — two or three sentences of
   capability, cumulative, so progress is felt and the reframe compounds.

---

## 7. Success criteria

- A React developer with no prior exposure reads Part One in ~30 minutes and can
  correctly predict the behavior of a 30-line Declare program they've never seen.
- After Part Two they can hand-write the board (or its sibling) without consulting
  anything but the guide and the reference.
- After Part Four they can direct a model to build a small app, review the result,
  and use verify as the oracle — and they know *why* the loop converges.
- The capstone read of the calendar takes under an hour and produces "I understood
  all of it" — the sentence the whole positioning stands on.
- Every code fence compiles; every claim has a demo within one screenful.

## 8. Addendum (2026-07-18): the current guide and the reader, assessed

*Written after the plan above was locked, per the agreed sequence.*

### 8.1 The current guide, honestly

It is considerably better than "product of accretion" suggests, and I'd be a poor
reviewer not to say so. The register is already in the target zone (chapter-opening
thesis blockquotes; "the compiler is the teammate"); several chapters are excellent —
`28-continuity` ("spring the scalars the geometry derives from") and `42-calendar`
(four mechanisms, honest "ceiling, not floor" framing, arm's-length from line numbers)
are close to what §5 of this proposal specifies for those topics. And the plan and the
current guide converged independently on several structures: counter-first opening,
a defaults-inverted map, a client-side tutorial app (Signals), one deliberate
break-on-purpose moment, and a mechanisms-not-lines calendar capstone. Same source
material, same conclusions.

The real deltas between what exists and what this proposal specifies:

1. **The LLM story is entirely absent.** No chapter, no aside, no mention — the
   guide predates the thesis's promotion to the front of the positioning. The whole
   §3 braid (claim in ch. 1 → machinery experienced as the reader's own DX →
   synthesis chapter with the eval method → organically-placed evidence) is net-new.
2. **Persuasion is explicitly waived** — the current opener says "this guide skips
   the sales pitch" and points at the homepage. This proposal reverses that: the
   guide *is* the long-form landing surface; chapter 1 carries the appeal.
3. **Interceptions are front-loaded, not in-place.** The current ch. 00 maps the
   inverted defaults in one block; the plan places "From React / From SwiftUI"
   asides at the moment each instinct fires, chapter by chapter.
4. **The pedagogy patterns are embryonic.** Run-and-poke is everywhere (the medium
   provides it); predict-then-run doesn't exist; break-and-repair happens once.
   The plan makes all three systematic.
5. **Structure**: 18 chapters/4 parts vs. this plan's 13/4; the thin tail
   (`40-checking` + `41-shipping`, ~50 lines each) merges naturally; the "In depth"
   part dissolves into the narrative (content/environment/addressable material
   redistributes into the system chapter and the building chapters).

Consequence for "new, not derivative": the rewrite should be a **new structure and
new front/back matter that absorbs the strongest existing middles** (rewritten to
carry the braid and the interception pattern) rather than a from-ash rewrite that
re-derives prose the repo already has at target quality. The non-derivative mandate
holds where it matters — the shape, the persuasion, the LLM braid, the pedagogy
patterns are all new — without discarding pages that already say the right thing in
the right voice. (Signals stays a candidate for the build thread: it already spans
slider→data→states→spring in 50 lines; extending it through the continuity chapters
may beat introducing a second artifact. To be decided at drafting.)

### 8.2 The reader app, assessed against the plan

The reader (`apps/docs/docs.declare`, 766 lines, itself exemplary Declare) supports
more of this plan than expected — **run-and-poke and prose exercises work today with
zero changes**:

- Every compiling ```` ```declare ```` fence becomes a live island: editable source
  (amber LIVE·EDITABLE grammar), fitted preview below, recompile-on-keystroke, with
  compilation gated to the visible page only.
- Per-chapter streamed JSON (instant switches, eager background load); an optional
  flagship demo per chapter (`<!-- demo: Class -->`).
- Parts + chapters rail driven by data (`guideParts`) — **restructuring to 13
  chapters is a content/extractor change; the app needs nothing.**
- Deep links (`guide/<id>@heading`) with back/forward; the `declare-docs:` link
  scheme (guide/reference/operational/spec targets); crawlable; light/dark; font
  zoom; selectable prose.

Enhancements the plan needs, smallest first — all modest, none architectural:

1. **Surface compile errors on islands** *(the critical one)*. The host already
   publishes the rendered report to `app.liveReport`; the docs app never declares or
   renders it — today a broken edit leaves a silently stale preview. Break-and-repair
   *requires* the diagnostic visible at the island (a strip under the editor; amber
   bar turns red). This is also just good editing UX, guide or no guide.
2. **A Revert affordance on islands.** The homepage demos have one; RunBlocks don't.
   A guide that tells readers to break things must offer the way back. Pristine
   source is already in the model.
3. **A predict-then-run gate.** A fence marker (e.g. `<!-- predict -->`) that mounts
   the island with the preview withheld behind a "Run it" button — the per-island
   `live` gate already exists; this is one more boolean ANDed into the slot
   constraint, plus the extractor passing the flag through.
4. **A styled aside grammar** for "From React:" / "From SwiftUI:" (and honest-trade
   notes) — an extractor convention (marked blockquote → chip-labeled aside in
   `Segment`). Fallback that works today with zero changes: bold-prefixed
   blockquotes, visually plainer.
5. **Reference coverage of the standard library.** The model's `tree` holds the 19
   built-ins only — no `Button`/`Slider`/etc., so the controls chapter can't link
   `declare-docs:Slider` meaningfully yet (and `#reference/Slider` today renders a
   blank detail pane — worth a graceful fallback regardless). Presumably lands with
   the library push; noting the guide's dependency on it.

## 9. Open questions (deliberately deferred)

- **Presentation layer**: answered in §8.2 — the reader serves the plan mostly
  as-is; five modest enhancements listed there (error surfacing on islands first).
- **The board vs an alternate project** — I hold the kanban choice loosely; the
  decision criterion is "React reader has felt this pain + continuity payoff."
- **Chapter granularity vs reader navigation** — thirteen chapters could flex by one
  or two either way depending on how the reader app paginates and deep-links.
- **Title** — *Thinking in Declare* is my recommendation; alternatives welcome.
