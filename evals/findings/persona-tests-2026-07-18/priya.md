# Priya Raman — indie builder, 36 (raw report, verbatim)

Scores: makes-sense 9 · interesting 9 · compelling 8 · credible 7 · persuasive 8

---

# DECLARE — field notes, priya, jul 18
(private. discord verdict at the bottom.)

## PART 1 — THE VISIT

**Homepage, first 90 seconds.** Expected: another "AI-native framework" landing page with a gradient and a waitlist. Got: "Declare is the UI language for the AI era" — eye-roll headline — but the subhead is actually a thesis: *"Just as SQL is a domain-specific language for database queries, Declare is a DSL for user interfaces. Its whole surface fits in your head — and inside an LLM's context window."* Then the line that made me sit up: *"This page is written in it. By an LLM."* That's a falsifiable claim with a "View & Edit Source" link at the bottom of the page. Checked — the whole homepage is one editable textarea of Declare source. Okay. You have my Saturday morning.

**The stats block.** "480 lines of Declare — four views, continuous zoom, drag, and edit." "54 KB over the wire." "0 lines written by hand." I checked the shipping file later: `calendar.declare` is **697 raw lines, 565 excluding blanks and comments**. The guide itself says "about seven hundred lines" — twice. And chapter 11 says the built calendar is "about 45 KB gzipped" where the homepage says 54. Nobody's lying by much, but the homepage's numbers don't agree with the docs' numbers, on a site whose entire pitch is *precision you can trust*. DRAG POINT, and an ironic one.

**Live demos on the homepage.** Every code block has a LIVE·EDITABLE badge and a Revert button. I edited the spring demo — `dodgerblue` → `hotpink`, `stiffness = 190` → `30` — and within ~2 seconds the ball was pink and lazy. No build step, no iframe reload flash. PULL POINT: the demos aren't videos of the thing, they're the thing.

**The calendar.** This is the demo the Discord post called wild, and — annoyingly — it is. Month view is clean, event chips in the right places. But the thing that got me was clicking Week and screenshotting *mid-transition*: the month grid doesn't crossfade into a week, it **morphs** — the focused row's cells stretch into the hour timeline while the other weeks slide out, and the in-between frame is a fully coherent layout, not a blur. I've built this kind of transition in React exactly once, with Framer Motion, and it took me a full weekend and it broke when you clicked during the animation. Here I interrupted it and it just… retargeted.

Then the practical tests: dragged "Dinner with Eric" from 7a to 1p with raw synthetic mouse events in headless Chrome — landed cleanly on the hour, chip re-labeled `1p`. Double-clicked it: an edit panel slid in and the week grid *reflowed* to make room rather than overlaying. Typed "Ramen with Eric" in the title field; the chip in the grid updated live per keystroke. Escape closed it. Everything worked the first time, blind, driven by coordinates. That's a robustness signal no landing page can fake.

**The docs break test.** The claim I care about most: compiler errors written for LLM loops. I broke chapter 1's counter example three ways:

- Misspelled `width` → `wdith`: red banner, `App has no attribute 'wdith' [DECLARE2000] (line 1, col 7)`. The badge flips amber, and — nice touch — **the last-good program keeps running below** instead of white-screening.
- Deleted the final `]`: `expected ']', got 'eof' [DECLARE1000] (line 13, col 5)`.
- `count: number = "zero"`: `App.count's default expects a number, got the string "zero" [DECLARE2000] (line 3, col 21)`.

All three: named, coded, positioned, in ~1–2s, and Revert restored everything. This is genuinely the error UX an agent loop wants. One ding: the docs claim the compiler "answers mistakes with the fix, by name" — for `wdith` it did *not* say "did you mean `width`?" The chapter 4 example error does name a fix (`declare it (dark: <type> = …) or fix the name`), so the capability exists, but the simplest typo case didn't cash the full claim. Small gap between promise and delivery.

**Friction, honestly.** The homepage scrolls inside its own runtime with its own momentum physics — my scripted scrolling overshot constantly, and I had to write a feedback loop to land on a section. As a human that just means the page feels slightly "not the browser." Cold loads of live-editing pages take 3–4s while the compiler downloads (they admit this). And the site's prose register — more below — is a lot.

## PART 2 — THE GUIDE

Read all 13 chapters. Total is ~1,800 lines of markdown, dense, obviously written by (or with) an LLM in the best sense — every chapter opens with a thesis in bold, closes with "What you can now say." Highlights and gripes:

**Ch 2–3 are the core and they're excellent.** The whole syntax is one table: bare value = literal, `{ }` = live TypeScript expression, `:path` = data read. And the runtime model is one sentence: *"Reading subscribes; assigning notifies."* The genuinely novel technical claim is in ch 3: **dependencies are extracted statically by the compiler from the expression text** — including reading *through* method calls — not discovered at runtime via read-tracking. If that holds at scale it's a real differentiator: the dependency list is literally visible in the source, which is exactly what makes generated code reviewable.

**Ch 8 (Data) has the best mental model in the guide:** *"raw truth, derived model, edits as writes."* The task-board example is a complete little app where both user actions are one data write each and no handler ever touches a view. This is the pattern I'd actually steal even if I never use Declare.

**Ch 10 (Arrangement) is the best pedagogy.** It rebuilds the calendar's famous morph at toy scale — 21 cells, two sprung scalars — so you can see the entire trick: spring a few numbers, derive all geometry from them, and every in-between frame is a real layout. After reading it I understood the calendar transition I'd screenshotted. Docs that make the magic trick *legible* are rare.

**Ch 12 (Writing with an LLM) — the pitch aimed at me.** Is it real or hoped-for? Mostly real, and I say that grudgingly. The argument structure is right: LLMs writing React verify by resemblance; Declare competes on a spec that fits in context (~10K tokens — I measured, 40KB/6.5K words, checks out), mandatory typechecking with no opt-out, and errors that steer the next attempt — which I verified myself in the break test. The strongest sentence: *"'Designed for LLMs' is a marketing sentence anyone can type. Declare's version is a measured claim, and the measuring instrument ships in the repository"* — and the `evals/` directory actually exists, with harness, tasks, runs, and a RESULTS.md. The claim that *"several language changes exist specifically because evals showed LLMs tripping"* is the difference between a hope and a feedback system. What I can't verify from here: the eval *numbers*, and whether "zero false positives across the repository's entire corpus" means anything beyond "we fixed the ones we found in our own code" — that's a self-referential guarantee. The cited studies (zero-corpus DSL beating Python; feedback quality vs repair) are linked from the essay, used with reasonable hedging ("in recent studies"), not fabricated-sounding. I didn't chase them; the use is honest in form.

**The spec (`docs/declare.md`) is the artifact I'd actually paste into Claude tonight.** Sections 13 and 14 are the tell that someone has really run this loop: **"What does NOT exist (do not invent it)"** — no z-index, no hooks, no `.map()` children, no addEventListener — and **"The mistakes actually observed"**, an empirically maintained list of 13 failure modes *"each entry earned its place by a model (or a person) actually making it."* Nobody writes that section speculatively. It's negative-space documentation, and it's precisely what stops a model from autocompleting React reflexes.

**The recurring gripe:** the same continuity sermon — "specialist craft, bespoke motion code, one interaction at a time, locked to a platform" — appears nearly verbatim on the homepage, in ch 1, ch 9, ch 10, ch 13, and the Why essay. Six deliveries of one paragraph. The writing is good; the writing also *knows* it's good, and by chapter 13 ("You have just stood on the ceiling") I wanted a straight sentence.

## PART 3 — ASSESSMENT

**Scores (5 = median new-framework site/docs):**

1. **Makes sense? 9.** The two-bracket model + "reading subscribes, assigning notifies" is the cleanest core model I've seen since... honestly since SQL, which is the comparison they chose, cheekily, and roughly earn. I never once hit a concept I couldn't place.
2. **Interesting? 9.** Static dependency extraction, arrangement-as-sprung-scalars, static extraction instead of SSR, URL-as-reactive-attribute. Four ideas I'll think about regardless of adoption.
3. **Compelling? 8.** The calendar demo cashes the claim. The break test cashes the error claim. Live-editable docs cash the tooling claim. 8 not 9 because "compelling for my SaaS" needs a Select, a Modal, a data table, and an auth story, and those are all "compose it yourself."
4. **Credible? 7.** Openly young, honest cost sections ("no npm package; the checkout is the toolchain"), evals directory real, self-hosted site as proof. Docked for the number drift (480 vs 697 lines, 54 vs 45 KB), the "did you mean" gap, and the self-referential zero-false-positive claim. When your pitch is trust, small sloppiness costs double.
5. **Persuasive? 8.** I ended the day wanting to hand the spec to Claude and build something, which is the only persuasion metric that matters.

**Calibration.** First HTMX readme encounter: intrigue 7, credibility 9 — a small honest idea that obviously worked, no cathedral. PocketBase (the last tool that won a full weekend from me): intrigue 8, credibility 8 — one binary, my whole backend. Declare is intrigue **9** — higher than both, because the morph demo showed me something I *couldn't* already do cheaply — but credibility **7**, below both, because HTMX and PocketBase asked me to believe small things and Declare asks me to believe a language, a runtime, a compiler, and a workflow all at once, maintained by roughly one person and a model.

**Weakest section, what I'd cut:** Chapter 9's opening manifesto (the four-bullet continuity argument), which restates chapter 1's version, which restates the homepage's, which the Why essay restates again. Keep the argument once, in ch 1. Ch 9 should open at "A spring drives an attribute toward a target" — the code teaches the philosophy better than the philosophy does. Runner-up cut: "What you can now say" closers on every chapter; charming once, liturgical by ch 7.

**≥5 criticisms, pinned:**
1. **Numbers that don't reconcile:** homepage "480 lines" vs the 697-line shipping file and the guide's own "about seven hundred"; "54 KB" vs ch 11's "45 KB." On a trust-pitch site, this is the exact class of drift the compiler supposedly prevents in code.
2. **The typo error under-delivers on the "fix by name" promise:** `App has no attribute 'wdith'` with no "did you mean 'width'?" — the loop converges anyway, but the flagship claim deserved the flagship case.
3. **Prose self-satisfaction:** "That is not a figure of speech. It is the promise this guide is structured around, and you can hold it to that" (ch 1); "You have just stood on the ceiling" (ch 13). Multiply by thirteen chapters. The docs are 20% longer than their information content.
4. **Missing table-stakes widgets, framed as virtue:** "There is no `Modal`, `Tabs`, or `Select` yet — and that is the normal case, not a gap" (ch 7). It is a gap. My weekend build has three selects and a modal before lunch.
5. **Distribution friction:** "There is no npm package; the repository is the distribution, and the checkout is the toolchain" (ch 1). Honest, but it means my deploy story starts with cloning someone's monorepo.
6. **The runtime owns scrolling:** the homepage's momentum scroller fought my automation and will fight some humans' expectations (find-in-page, scrollbar behavior). When you abstract the renderer away, you inherit responsibility for everything the browser did well.

**≥5 strengths, pinned:**
1. **The break test:** three error classes, all precise/coded/positioned (`expected ']', got 'eof' [DECLARE1000] (line 13, col 5)`), last-good program keeps running, Revert restores. Best in-docs error experience I've used.
2. **The mid-transition screenshot:** month-becomes-week where the in-between frame is a real layout. The claim *"no frame is anything other than the constraints, holding"* (ch 10) is visibly true.
3. **Spec sections 13 & 14** — "do not invent it" + empirically-earned mistakes. The single most LLM-ready doc artifact I've seen from any project, and at ~10K tokens it fits in context with the whole app beside it.
4. **Blind robustness:** drag-to-reschedule, panel reflow, live title propagation — all worked first try under headless coordinate-driven automation. Demos that survive a robot are real.
5. **"Raw truth, derived model, edits as writes"** (ch 8) and *"derived state is never assigned"* (ch 3/11) — transferable mental models, taught through a working task board and a back-button that dies if you break the rule.
6. **Honesty ballast:** "the language lowers the implementation barrier, not the design bar" (ch 1), and the loud-failure rule for non-crawlable data (ch 11). The hedges are load-bearing and well-placed.

**DAY-LATER TEST.** What I'll remember tomorrow: the week view growing out of the month grid mid-click; `[DECLARE2000] (line 1, col 7)` on a red banner with the old app still running underneath; "reading subscribes, assigning notifies"; the "do not invent it" section; and the itch to know whether Claude + a 10K-token spec can really one-shot a settings panel.

**THE DISCORD POST:**
> Spent today on Declare. The calendar demo is not hype — I drove it blind with puppeteer and the month→week morph is a real constraint-solve mid-frame, drag/edit all worked first try. The actually-important part for us: the whole language spec is ~10K tokens, errors come back as `App has no attribute 'wdith' [DECLARE2000] (line 1, col 7)`, and there's a shipped evals harness where they test LLMs writing it cold from the spec. It's one repo deep, no npm, no Select/Modal, and the docs sniff their own farts a bit — but this is the first "designed for LLM codegen" claim I've seen that's an engineering system instead of a tagline. I'm giving it a Saturday.

**Does next weekend's build happen in this?** The honest answer: the *toy* does; the product doesn't. Next weekend I will hand `declare.md` to Claude and have it build something real-shaped — a settings panel or a habit tracker — specifically to test whether the loop converges without me touching the code, because if it does, the leverage math changes: reviewable 300-line apps beat unreviewable 3,000-line React apps at my scale. The SaaS stays in React until: (1) a Select/Modal/table exist or I've proven composing them is an hour not a day, (2) there's a deploy story that isn't "clone the repo", and (3) my own eval run — not theirs — comes back clean. The smallest thing that would tip me fully: **one afternoon where Claude one-shots a CRUD screen from the spec and `verify` passes before I've read a line.** That's a cheap experiment. That's the tell that they designed this thing well — the test they built for their language is the same test I'd use to judge it.
