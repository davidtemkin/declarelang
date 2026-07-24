# Continuity by default — steering the writing model toward the experience ceiling

**Status:** direction proposal, 2026-07-24. Background, not truth. This records a
direction we expect to add to over time; nothing here is ratified, and the declare.md
edits in the appendix are deliberately **deferred** (see Sequencing).

## The thesis

Declare's claim to prove is not that a model can write valid Declare — verifiability
and the diagnostic loop get us that, and a skeptic will grant it while remaining
unmoved. The claim to prove is that **a model using Declare ships a better
application** — better as *experienced by a user*: continuous, motion carrying
meaning, the user's visual orientation preserved across state changes.

The structural argument for why this should be true:

- **Corpus leverage drags a model toward corpus-median output.** The corpus-median
  React app has no continuity, no interruptibility, no motion that carries meaning —
  because in that world those are bespoke, expensive, senior-engineer work. A model
  *can* write a springy, interruptible view transition in React; it almost never
  *does*, because the billion training examples mostly don't.
- **Declare moves the prized UX layer inside the declarative surface** (TENET-3:
  continuity is the grain). The continuous version of an interface is often *less*
  code than the discrete one — which means it sits inside a model's easy reach
  rather than at the end of its longest tail.
- Therefore the differentiating measurement is a **ceiling** claim, not a floor
  claim: same model, same brief, same budget — the Declare artifact should be the
  better application, and the gap should be widest exactly where the corpus is
  thinnest: motion, continuity, orientation.

## The catch that motivates this document

The spec is part of the treatment condition. A model handed today's declare.md cold
writes *correct* Declare — and mostly discrete UIs in Declare syntax, because the
document teaches the language's rules, not its register. If the docs don't set
continuity as the default posture, the ceiling advantage never shows up in an eval,
even though the language could have delivered it. Closing that gap is a
documentation problem before it is an evaluation problem.

## Sequencing (the decision recorded here)

1. **Baseline first.** Run the structured eval on *everyday* application briefs —
   forms, lists, settings, dashboards — with the docs as they stand. Declare must
   first demonstrably be a good tool for ordinary work; that is also the FAQ's
   stated positioning ("designed for everyday apps with everyday needs"), and
   declare.md §1 was brought into line with it on 2026-07-24 (the "everyday
   applications … polish that is specialist craft elsewhere is ordinary expression
   here" wording).
2. **Then feather in the steering.** Pending baseline success, land the
   ambition-steering material (appendix) in declare.md, and re-run the same eval to
   measure what the steering itself is worth. Landing both at once would conflate
   "can the model use the language" with "does the doc steer the model" — keep the
   conditions separable.

## What the eval needs to look like (sketch)

To persuade people who run evals for a living (the intended audience includes
model-tooling teams), the design must survive their standard objections:

- **Paired tasks, UX-judged.** Same brief, same model, same budget: Declare with
  the spec in context vs. a strong incumbent baseline (React or Svelte, *allowed
  its best tooling* — framer-motion and friends; a hobbled baseline persuades no
  one). Judge the running artifacts, blind, on outcome rubrics: is motion present
  and interruptible; do modes leak; does resize hold; does deep-linking work; does
  the frame stay stable while data loads. Screen recordings, human raters or model
  raters with a published rubric.
- **One-shot and iterated conditions.** AREPO-5 predicts the Declare delta *grows*
  with iterations (diagnostics steer the retry). Measure repair rate per
  diagnostic and attempts-to-working, both stacks.
- **Across model tiers — the existential chart.** If the Declare advantage shrinks
  as models improve, the no-corpus objection wins the long run. If it holds or
  grows (verification and reach compound with capability rather than substitute
  for it), that chart *is* the counterargument, in the only language the
  objection's holders accept.
- **The clean-instrument framing.** A language with zero training-data
  contamination separates "reasons from spec" from "recalls from corpus" — of
  independent interest to eval teams regardless of Declare adoption. Lead with
  that; it is the door-opener.

The existing `evals/` harness is the one-sided version of this (can models build in
Declare at all). This is the two-sided, UX-judged version.

## Articulation beyond declare.md

declare.md can only set the default posture; the full articulation spans the doc
system. Candidates, roughly in dependency order:

- **declare.md §1 + §8**: the deferred edits (appendix) — default posture, the
  blend idiom, the verify-the-feel loop step.
- **The guide**: a chapter that *designs* an interaction continuously from the
  first sketch, rather than presenting motion as a topic (currently ch. 9's
  domain). The calendar walkthrough (ch. 13) already gestures at this; the earlier
  chapters could plant the posture before the tools.
- **The skill / SKILL.md**: whatever agents load when writing Declare should carry
  the design rules ("never teleport what the user is watching," "things arrive
  from their cause") as working instructions, not reference material.
- **Eval task briefs**: briefs should *withhold* explicit motion asks ("make it
  animated") — the measurement is whether the docs produce the continuous version
  unprompted, because that is what "default" means.
- **Reference prose**: Spring/State/Animator pages currently describe mechanism;
  each could close with one sentence of *when* — the register in which the
  mechanism is the house answer.
- **Homepage/FAQ**: once measured, the claims should cite the eval the way perf
  claims cite stats.json today — "the homepage reports the live figures" extended
  to experience.

## Design rules (draft canon, to refine over time)

The candidate rules the steering material teaches. Kept here so they can be argued
with before they are taught:

1. **Never teleport what the user is watching.** Open/close/move/resize should
   travel — geometry derived from a sprung scalar. A discrete jump is a decision,
   not a default.
2. **Things arrive from their cause.** A detail grows from the row that was
   clicked; a window returns to the icon that launched it. Anchor motion's origin
   in its trigger and the user keeps their place.
3. **One blend parameter, many followers.** The house idiom for a two-state
   change: one scalar sprung 0↔1, all affected properties derived from it —
   coherent at every intermediate value, reversible from anywhere (the calendar's
   four scalars; the desktop's `miniT`).
4. **Everything stays live mid-flight.** Interruption is the target changing.
   `isAnimating` guards are a smell that the state model is wrong.
5. **The frame holds still while data arrives.** Reserve the space, swap the
   content; screens derive from data state.
6. **Motion is causality made visible, never decoration.** A quickly-settling,
   always-interruptible spring reads as the interface responding; anything slower
   reads as the interface performing. When in doubt, shorten it.

## Open questions

- Rubric authorship: who defines "orientation preserved" operationally, and can a
  model-rater apply it reproducibly enough to gate anything?
- Does the steering material belong in declare.md at all, or in the skill layer —
  keeping the spec register purely definitional? (Current lean: a compact §1
  posture in declare.md, the full canon in guide + skill.)
- How much steering is too much — at what point does default-continuity produce
  motion where stillness served better, and how does the canon teach restraint
  without dulling the default?
- Whether rule 3 (the blend idiom) should eventually be a language affordance
  rather than an idiom — a named construct the compiler knows — or whether naming
  it in prose is exactly enough.

## Appendix — the deferred declare.md edits (drafted 2026-07-24, not applied)

Held here verbatim so the eventual application is a paste, not a reconstruction.
Both preserve the TENET-3-quoted phrases ("continuity is the grain, not the
garnish"; "often less code than the discrete one"). Fragments must pass the doc
compile gate before commit.

### A1 — §1 "What the language is for," full steering version

> **What the language is for.** Everyday applications — forms, lists, dashboards,
> settings, calendars, editors. What changes in Declare is the standard an everyday
> application can hold. Layout, states, springs, and data all derive from the same
> constraints, so **continuity is the grain, not the garnish** — a view doesn't switch
> so much as *become* the next one, and the continuous version of an interface is often
> *less* code than the discrete one. In other stacks that finish — motion that carries
> meaning, changes that keep the user oriented — is specialist craft, added late or never,
> so most software ships without it. Here it is the cheapest way to write the interface.
> **Write the continuous version first**; verifiable, analyzable, concise programs are
> the floor, and this is what the floor buys.
>
> The standing rules of a Declare interface — the defaults, not the ambitions:
>
> - **Never teleport what the user is watching.** When a thing opens, closes, moves, or
>   resizes, its geometry should *travel* from where it was to where it belongs — derive
>   it from a sprung scalar (§8). A discrete jump is a decision, not a default.
> - **Things arrive from their cause.** A detail grows out of the row that was clicked;
>   a window returns to the icon that launched it. Anchor the start of a motion in the
>   thing that triggered it, and the user never loses their place.
> - **Arrangement animates.** Spring a few scalars and every constraint derived from them
>   moves in lock-step — this is how a calendar's month morphs into its week and folds into
>   its year (`apps/calendar/calendar.declare`, ~700 lines, the idiom at full scale).
> - **A mode is a reversible bundle** (§8) — it cannot leak, so modes compose and interrupt.
> - **Everything stays live mid-flight.** Interruption is just the target changing (§8);
>   never gate input on an animation finishing — there is no `isAnimating`, and writing
>   one is a sign the state model is wrong.
> - **Screens derive from data state** (§7) — `shown = { data.loaded }`, not navigation
>   code — and the frame holds still while data arrives: reserve the space, swap the content.
>
> Motion here is causality made visible — where a thing came from, where it went — never
> decoration. A spring that settles quickly and can always be interrupted reads as the
> interface *responding*; anything slower reads as the interface performing. When in doubt,
> shorten it.

### A2 — §8 addition: the blend idiom

> **The blend idiom.** The house pattern for any two-state change: one scalar, sprung
> 0↔1, with every affected property *derived* from it — so position, size, opacity, and
> corner radius travel together, stay consistent at every intermediate value, and reverse
> cleanly from anywhere:
>
> ```declare-fragment
> open: boolean = false,
> t: number = 0,
> blend: Spring [ attribute = t, to = { open ? 1 : 0 }, stiffness = 170, damping = 24 ],
>
> height       = { 72 + (240 - 72) * t },        // collapsed → expanded
> cornerRadius = { 10 - 4 * t },
> detail: View [ opacity = { t }, visible = { t > 0.01 },
>     // the expanded content, present but transparent until the blend brings it in
>     ],
> ```
>
> The card is never "the closed one" or "the open one" — it is one card at a blend value,
> which is why a half-open card is coherent and a mid-flight reversal needs no code. This
> scales: the desktop sample's minimize-to-dock is this exact idiom (`miniT`), and the
> parked window keeps running because it was never a second object.

### A3 — §16 step 4, appended sentence

> And verify the feel, not just the behavior: for each state change, ask whether something
> visible traveled from the old state to the new one. If the answer is "it swapped," the
> continuous version is usually available and usually shorter — §1's rules name it.
