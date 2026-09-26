# Devon Okafor — design engineer (SwiftUI), 33 (raw report, verbatim)

Scores: makes-sense 9 · interesting 9 · compelling 8 · credible 8 · persuasive 7

---

# DEVON'S NOTES — DECLARE (declarelang), visited 2026-07-18

## PART 1 — The visit

**Homepage.** First headline: "Declare is the UI language for the AI era." Ugh. Every landing page this year says that; I came for the continuity claim and they lead with the LLM claim. "This page is written in it. By an LLM." is either a flex or a confession, undecided. But the second section is aimed straight at me: "a view doesn't switch so much as *become* the next one, where motion carries meaning, and everything is fast and interruptible." That's my whole religion in one sentence, and my prior is that web frameworks that say this are lying by the third paragraph. Also noted: "That's always been specialist craft: bespoke motion code, one interaction at a time, locked to a platform." Correct, and I've been that specialist, so — prove it.

**Calendar, month view.** Clean. Suspiciously native-looking: light chrome, Today/Day/Week/Month/Year segmented control, theme toggle. One tell before I even clicked: my DOM probe of the *month* view found hour labels (12 AM…11 PM) already in the tree. The week view's skeleton isn't mounted on demand — it's the same persistent layout, parked. That's not how crossfade cheats are built. Interest piqued.

**Month → Week, mid-transition frames (90ms / 180ms / 300ms).** This is the thing. At 90ms the title has already committed to "July 12–18," the segmented-control highlight pill is *sliding* between Week and Month (they animated the control too — someone cares), and the month grid is coherently re-composing. At 180ms it's undeniable: the focused week row is expanding into the hour grid while the other weeks are still on screen, sliding off the bottom — and the event chips are the same objects, growing into their time-positioned blocks. "Sarah's Birthday Party" goes from a chip to a 2a–4a block without ever not existing. Every frame I captured is a layout you could ship. No opacity crossfade anywhere. This is matchedGeometryEffect behavior, except applied to the *entire surface*, and SwiftUI cannot actually do this across a whole NavigationStack transition without heroics.

**The interruption test.** Clicked Month, waited 120ms, clicked Week mid-collapse. The frames show it retargeting from its current mid-flight geometry — blocks that were shrinking back into chips reverse and grow again, from wherever they were. No snap, no restart-from-endpoint, no queued second animation. I have written the UIViewPropertyAnimator plumbing to get this on iOS and I know exactly how much code "no code" replaces here. This was the moment the site earned the rest of my afternoon.

**Year and Day.** Year→Day mid-frame is wilder — the whole month grid dissolving while the day column materializes, everything tracked. Frame is busy, borderline washy, but coherent. **First real blemish:** in settled Day view, the *previous day's* event blocks sit half-clipped at the viewport edge — off-screen neighbors parked just past the clip, visibly peeking. Honest layout, sloppy culling. Second blemish: clicking empty space in Day view once teleported me from July 21 to July 16 — some hit-target under there I couldn't see. Disorienting.

**Drag.** Grabbed "Project Review" from the 21st. Lifted with a shadow, source slot ghosted in place, target day outlined as I hovered, dropped on the 24th, chip settled in. Proper drag affordances, all three phases. No complaints.

**Event editing.** Third blemish: clicking a chip in Month view *zooms to Day* — I hunted for the editor. Found it in Week view: click a block and an inspector slides in from the right, and the grid *re-negotiates its width* rather than being overlaid — a real layout change, very NavigationSplitView. Typed into the title field and watched the event block update **per keystroke** ("Sarah's 34th — bring" mid-type). Closed the panel; grid expanded back; title persisted. The binding story, demonstrated on my own edit. The affordance is undiscoverable; the mechanism underneath is the real thing.

**Docs, breaking things.** In chapter 10's toy I changed the cell fill and slackened a spring (stiffness 150→40) — recompiled live, all 21 cells brick red. Then I broke the class declaration on purpose. Result: a red banner — "1 error / expected a member name, got '[' [DECLARE1000] (line 1, col 27)" — and, the part that matters, **the last good render kept running below**. Not a white screen, not a stack trace. That's a better broken-state than most production toolchains.

## PART 2 — The guide

Experienced 9 and 10 live, then read all thirteen chapters as markdown.

**Chapter 9 speaks my language, not a tourist's version.** The chapter opens with the argument, not the API: continuity keeps people oriented, motion carries meaning, "Interruptibility respects intent… the felt difference between software that responds and software that performs." I have given that speech to product managers. And the SwiftUI aside is *accurate at the level that counts*: "`withAnimation` animates the *transaction* — a `Spring` here is a standing declaration on the attribute itself: nothing is wrapped, and any write to the target, from anywhere, moves the ball." That's exactly the distinction, and most people who invoke SwiftUI in docs don't understand it. "A mode cannot leak — there is no exit code to forget because there is no exit code" is a sentence I will reuse.

**Chapter 10 is the best chapter.** The toy is 21 cells and *two sprung scalars*, whole mechanism on one screen, and the text tells you to "drag the toy above halfway and look" because "users *live* in the in-betweens." Then `blockness` — the calendar never stores "am I a time view?"; it derives a continuous 0..1 from the sprung row height and everything (hour gutter, event shape) reads it. "When you find yourself about to declare `isExpanded: boolean` next to a spring, ask whether the truth you want is already a function of the motion." That is a genuinely good design idea I intend to steal regardless of what happens to this language.

**The React asides assume a reader I'm not.** Nearly every chapter has a "From React:" block about retiring hooks/`useState`/`AnimatePresence`/routers. Clearly labeled, easily skipped, but the guide's default reader is a React defector and I felt it — chapter 1's "notice the shape of what you just didn't do. There is no hook, no dependency array…" lands as an applause line for someone else's trauma. The SwiftUI asides (ch 3, ch 9), by contrast, served me precisely. Net: I was excluded maybe 15% of the time, never confused, because the core model is explained from zero.

**Where web assumptions did bite me:** chapter 2's seam rules (`#1C3A4F` bare vs `0x1C3A4F` in braces) and the strict-JSON Dataset exception are the kind of thing a TypeScript-comfortable outsider absorbs fine. What I *missed* was never explained anywhere: the touch story. Chapter 7's drag is plain coordinate assignment — nothing about gesture velocity handing off into a spring, the thing every good iOS interaction does and the thing I'd need on day two of the habit tracker. For a motion-first language, projectile-handoff being absent from all thirteen chapters is a real hole in the story's depth.

**Honesty audit:** better than average. Chapter 1 has a real "What it costs" section (cold-load compiler hit, ARIA depth "still growing", "the ecosystem is one repository deep"). Chapter 13 calls the calendar "the language's ceiling, not its floor." Against that: the prose grades itself a bit much — "the calendar's *celebrated* view-morph," "the chapter the language exists for," "You have just stood on the ceiling." And chapter 12 leans on evidence I can't see from here: "held to zero false positives across the repository's entire corpus," an eval harness, "recent research (cited on the homepage) shows LLMs… outperforming the same LLM writing Python." Cited rather than fabricated, fine — but it's the one chapter whose claims aren't demonstrated under my cursor, in a guide whose superpower is demonstrating claims under my cursor.

## PART 3 — Assessment

**Scores (5 = median new-framework site/docs):**
1. **Makes sense: 9.** Two brackets → standing relationships → springs/states → sprung scalars with derived geometry → the calendar. Each chapter builds, none is long, and the final chapter is four mechanisms I'd already touched. As pedagogy this is top-decile.
2. **Interesting: 9.** Two ideas I'll keep thinking about: whole-arrangement continuity as derived geometry over sprung scalars, and `blockness` (character derived from motion, not flagged).
3. **Compelling: 8.** Earning moment: the 180ms frame of month→week with chips mid-morph into time blocks, and the interrupt that retargeted from mid-flight. I tried to catch it cheating and couldn't.
4. **Credible: 8.** The core claims were all cashed live in my browser, including the error experience. Deductions for the self-grading prose and the off-page evidence in ch 12 — not dishonest, just unproven here.
5. **Persuasive: 7.** It moved me from "probably nonsense" to "I'll prototype in it." Held back by the AI-era-first framing, the absolute-coordinate idiom (`x = 28, y = 26` everywhere — I lived through frame-based layout once, and chapter 5 selling arithmetic as liberation reads a little like nostalgia for the thing autolayout replaced), and no touch/velocity story.

**Calibration.** SwiftUI at WWDC 2019 was a 10 on intrigue and, in hindsight, about a 6 on delivered continuity — `withAnimation` was real, but whole-view-hierarchy morphs still mean matchedGeometryEffect fights, non-interruptible navigation transitions, and AnimatablePair hacks; the promise outran the delivery for years. Flutter (my other reference) was a 7 on intrigue and its motion model — AnimationController, tweens, explicit vsync — is *exactly* the "effects layer" this guide dunks on; correct dunk. **Declare's continuity story, on the narrow axis it chose, demonstrates today what SwiftUI promised in 2019 and still hasn't fully shipped.** On breadth — gestures, scroll physics, platform depth — it's nowhere near SwiftUI and doesn't claim to be. That's the honest placement: narrower promise, actually kept.

**Weakest chapter and what I'd cut.** Chapter 12, "Writing with an LLM." Well-argued, but it's the only chapter arguing from evidence I can't poke, and it's where the prose is most self-satisfied. Cut the "recent research… outperforming Python" sentence and halve "Tested, not assumed"; let the calendar's "zero lines written by hand" stat do the work, quietly. Runner-up cut: the homepage headline. The calendar is the argument; "the AI era" is a costume.

**Criticisms (specific):**
1. Day view leaks its implementation: neighboring days' event blocks sit visibly half-clipped at the viewport edges. The one place "every frame is a coherent layout" becomes "you can see backstage."
2. Event-editing affordance is undiscoverable: chip-click in Month zooms to Day instead of opening the event; I found the inspector only via Week view. Also got mystery-teleported July 21 → July 16 clicking empty day-view space.
3. The "From React" asides set the guide's default reader as a hooks refugee — "notice the shape of what you just didn't do" (ch 1) is an applause line I had no context to clap for.
4. No gesture-velocity → spring handoff anywhere in a motion-first language's documentation. Chapter 7's drag is `x = clamp(...)` assignment; iOS-quality flicks need the release velocity to become the spring's initial condition, and the story is silent.
5. Self-grading prose accumulates: "celebrated view-morph," "almost embarrassingly direct," "You have just stood on the ceiling" (ch 13). The demos are strong enough that the adjectives are a tax.
6. Absolute coordinates as the house idiom (`x = 28, y = 26`) — chapter 5 frames the absence of a layout system as purity; at app scale I suspect it's how designs drift.

**Strengths (specific):**
1. The interruption behavior is real and free: mid-flight retarget from current geometry, verified frame-by-frame, and chapter 9 explains *why* it's free — "a change of target is just… a new target. There is no tween to cancel."
2. "A mode cannot leak — there is no exit code to forget because there is no exit code" (ch 9) — the set-on-enter/forget-on-exit bug made unwritable, stated exactly.
3. `blockness` (ch 13): "There is no `isTimeView` boolean anywhere in the file" — character derived from sprung geometry, so qualities morph with the motion. Best idea in the building.
4. "Design the endpoints; audit the middle. …users *live* in the in-betweens" (ch 10) — a design discipline stated as well as I've seen it stated anywhere, including inside Apple.
5. The error experience: break a live example and you get "expected a member name, got '[' [DECLARE1000] (line 1, col 27)" while the last good render keeps running. Teaching through breakage is explicit policy ("You are encouraged to break things") and it works.
6. The chapter-10 toy: the flagship's signature move reduced to 21 cells, two springs, one screen of source, sitting above prose that says "read the mechanism off the source, because it is all there." It was.

**Day-later test.** What I'll actually remember tomorrow: the 180ms frame where a month is half-week and every pixel still belongs somewhere; the interrupt that didn't snap; "a mode cannot leak"; `blockness`; the compiler error that kept the last good frame alive. What I'll have forgotten: everything about datapaths, the URL/location chapter, all of chapter 12.

**Reply to my friend:**
"Okay — the continuity thing is real. I screenshotted the calendar mid-transition trying to catch a crossfade and instead found event chips morphing into time-blocks with every frame a legit layout, and it retargets cleanly when you interrupt it, which SwiftUI still can't do across a whole screen. The docs oversell the AI angle and there's no touch/velocity story yet, but this is the first web thing that didn't insult either of us — give it 20 minutes, chapter 10 specifically."

**Does the habit tracker get prototyped in this?** Yes — grudgingly, then not grudgingly. A calendar-heavy UI is literally this language's flagship domain, and the month↔week morph is the exact interaction I'd sketched and dreaded building in rAF. I'd start from the chapter-10 toy this weekend. What would tip me from prototype to committing: (1) a real touch story — drag release velocity feeding the spring, tested on a phone; (2) evidence the DOM renderer holds frame rate on mobile Safari with a year's worth of data; (3) Modal/Select-grade widgets so I'm not composing every control from rectangles. Two of those are engineering time, none are architecture. That's the most positive thing I can say about a web framework: my objections are about missing muscle, not wrong bones.
