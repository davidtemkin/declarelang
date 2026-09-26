# Synthesis — fresh-eyes persona test, 2026-07-18

Three blind agents (Maya: staff eng / language-lover · Devon: SwiftUI design engineer ·
Priya: indie LLM-native builder). All browsed live with vision, edited demos, broke examples,
drove the calendar, read all 13 chapters. Raw reports beside this file.

## Headline

The package lands. Scores are remarkably tight across three very different lenses:

|              | Maya | Devon | Priya |
|--------------|------|-------|-------|
| Makes sense  | 9    | 9     | 9     |
| Interesting  | 9    | 9     | 9     |
| Compelling   | 8    | 8     | 8     |
| Credible     | 8    | 8     | 7     |
| Persuasive   | 7    | 7     | 8     |

All three ended with the behavior the site exists to produce: a committed intention to
build something in it (Maya's site "probably yes, within one Saturday"; Devon's habit
tracker "yes — grudgingly, then not grudgingly"; Priya "I'm giving it a Saturday").
All three independently verified the continuity claim frame-by-frame and failed to
catch it cheating. Devon's calibration line is the quote of the test: *"Declare's
continuity story, on the narrow axis it chose, demonstrates today what SwiftUI
promised in 2019 and still hasn't fully shipped."* Maya kept the guide's chapter-1
promise measurably: she predicted `commitDrop`'s cascade before the prose explained it.

## Convergent findings (3/3 or 2/3 — near-certain signal, ranked)

1. **The continuity sermon repeats too often (3/3).** The "specialist craft, locked to
   a platform" paragraph appears ~4–6× across homepage / Why / ch 1 / 9 / 10 / 13.
   Priya: "six deliveries of one paragraph." Maya: "once is a thesis, four times is
   jingle." → Guide edit: keep it whole in ch 1; gut ch 9's opening to a short
   paragraph; cut ch 12's five-bullet restatement to a sentence + link.
2. **Self-grading prose is a tax (3/3).** "You have just stood on the ceiling,"
   "celebrated view-morph," "That is not a figure of speech." Devon: "the demos are
   strong enough that the adjectives are a tax." → Tone pass across chapters 1, 10, 13.
3. **The error-message claim is oversold by ~15% (3/3 observed, 2/3 dinged).**
   Copy promises "names the fix / the rewrite"; an attribute typo yields a precise,
   coded, positioned error with NO "did you mean." (Component typos DO suggest —
   'Crad' → 'Card'.) → Either add did-you-mean to DECLARE2000-class attribute errors
   (upstream, small) or soften the guide/homepage claim. Fixing the compiler is the
   Declare-shaped answer.
4. **Number drift (2/3).** Homepage "480 lines" vs guide "about seven hundred" vs the
   697-line file; homepage "54 KB" vs ch 11 "45 KB." Each number is honest under its
   own metric; no surface states its metric. "On a trust-pitch site, small sloppiness
   costs double." → Align guide numbers with stats.json's metric and state the basis;
   consider the homepage metric label ("source lines excl. prose" or similar).
5. **Ch 12 is the weakest chapter (2/3 named it; Priya named ch 9's opening).** Root
   cause is #1 plus: it's "the only chapter arguing from evidence I can't poke, in a
   guide whose superpower is demonstrating claims under my cursor" (Devon). → Dedupe;
   keep "The practice" and the eval anecdote; consider surfacing one eval artifact
   (e.g. RESULTS.md numbers) as a linked, poke-able thing.
6. **Absolute-positioning grain worries two of three (Maya, Devon).** Maya: "the guide
   never shows a long, wrapping, content-driven page holding up" (her adoption
   blocker!). Devon: frame-layout nostalgia risk. → Add a content-flow example to ch 5
   (a wrapping prose page — the docs app itself is the proof) — cheap, high-leverage.
7. **"The site eats the browser" (2/3) — CORRECTED after investigation: mis-attributed.**
   Declare's DOM scrolling is native (`scrolls = true` → `overflow: auto`; scroll panes
   re-enable `touch-action: pan-y` against the root's gesture-ownership `none`; zero JS
   physics in the runtime). What the personas measured is the HOMEPAGE's app-shell
   design (viewport-filling inner scroller so fixed chrome can be siblings → document
   never scrolls, body.scrollHeight == viewport) — identical probing results on any
   app-shell SPA — plus their own automation (synthetic wheel deltas accumulating
   native macOS inertia) and native scroll chaining into nested scrollables. The
   legitimate residue: app-shell pages trade away document-level affordances (mobile
   URL-bar collapse, window scrollbar); a homepage fresh-pass could weigh exterior
   scrolling against the fixed-chrome trick. Fragment-only routes are `location` by
   design.
8. **Missing Select/Modal/table (2/3)** — known roadmap; both framed it as "missing
   muscle, not wrong bones." Ch 7's "not a gap" framing grated on Priya → soften.

## Divergent / persona-specific finds

- **Maya:** homepage demo panels swallow compile errors SILENTLY (docs islands show the
  red strip; homepage has no error surface — on the page claiming "the compiler kept it
  honest"). Real bug; the liveReport channel now exists, homepage just never renders it.
  Also: ch 2 discloses the no-TS-type-syntax amputation "at whisper volume"; the value
  pattern is controlled components and should say so ("a guide this precise about what
  it retired should be equally precise about what it kept").
- **Devon:** Day view leaks backstage (neighbor days' blocks half-clipped at the
  viewport edge — matches the artifact seen in this project's first calendar audit);
  chip-click in Month zooms to Day instead of editing (undiscoverable editor); empty
  day-space click teleported him; NO touch/velocity story anywhere ("gesture release
  velocity becoming the spring's initial condition" — absent from all 13 chapters, his
  day-two need). React asides excluded him ~15% ("applause line for someone else's
  trauma") — the SwiftUI asides "served me precisely."
- **Priya:** "zero false positives across the repository's own corpus" reads as
  self-referential; the smallest thing that would fully tip her: "one afternoon where
  Claude one-shots a CRUD screen from the spec and verify passes before I've read a
  line" — i.e., the repo's own eval, run by the prospect. Consider making that a
  packaged, runnable experience.

## Calibration summary

- vs Svelte: more intriguing ("changes what interfaces are made of, not where the work
  happens"); equal idea-credibility, docked for demoing "hermetically" against itself.
- vs Elm: below Elm's formal-credibility ceiling, above it on intrigue-as-delivered.
- vs Meteor: "the structural anti-Meteor" — honesty as the differentiator.
- vs SwiftUI 2019: narrower promise, actually kept.
- vs HTMX/PocketBase: intrigue higher than both; credibility lower — Declare asks you
  to believe a language+runtime+compiler+workflow at once, one repo deep.

## Action list

Guide (sandbox, mine to do): dedupe sermon (ch 9 opening, ch 12 bullets, ch 13 closer);
tone pass on self-grading lines; state number bases / align with stats; soften "names
the fix" to match shipped behavior (or wait for did-you-mean upstream); ch 5 content-
flow example; ch 7 "controlled components, kept" honesty + soften "not a gap"; consider
trimming "What you can now say" closers after ch ~8.

Upstream (David's call): did-you-mean for attribute-name errors; homepage island error
strip (homepage refresh pass); calendar polish — day-view neighbor culling, month
chip-click → editor affordance, day empty-space hit target; stats metric labels;
touch/velocity→spring roadmap item (Devon's #1 ask); Select/Modal (already planned).
