# New-guide drafting progress

COMPLETE (2026-07-18): all 13 chapters drafted, verified, and assembled in apps/docs-next.
Plan: docs/system-design/guide-proposal.md §5. Old guide (docs/guide/) and apps/docs untouched.

- content/ holds 01-thinking-in-declare … 13-calendar with nav/part markers
  (parts: The idea / Building / Continuity / The system).
- Every ```declare fence verified clean through R4 (drafts/checkfences.sh); 40 live islands extracted.
- docs.declare: default location → guide/01-thinking-in-declare; one-line Declare Docs brand;
  island error strip + Revert (with the approved browser/boot-uniform.js report pass-through).
- Board example (ch 8) and focus-rectangle toy (ch 10) run live; verified in headless Chrome.

Deferred / open for review discussion:
- predict-then-run gate: chapters use behavioral predictions (preview doesn't spoil them), so no
  gate was needed; appearance-prediction gating remains possible extractor work if wanted.
- "From React/SwiftUI" asides render as plain bold-prefixed blockquotes; chip styling is future
  extractor+Segment polish.
- Reference coverage of library controls still pending (extractor capability, ties to library push).
- Known pre-existing bugs (not this work): /library/[object Object] 404 on every load;
  #reference/<unknown> blank pane; calendar day-view gutter artifact.

Full audit 2026-07-18 (headless click-through of all 13 chapters, overflow sweep over all 40 islands):
- FIXED: ch3 reactivity demo had no fill (whitesmoke on light stage — unreadable); now #0B141B.
- FIXED: ch7 drag card could escape its app box; clamped (0..180) + prose notes the clamp.
- FIXED: extractor measureStage ignored declared App height (contentHeight only) → ch9 states
  demo clipped 40px when opened; now max(contentHeight, app.height). Stage 264, opens clean.
- PLATFORM BUG — FIXED (2026-07-18, David-approved): the outer app's window-level input router
  double-dispatched mouseDown/mouseUp/click into embedded child apps whenever the hit target was
  itself a sinked element (the app-root boundary guard sat inside the sink walk, which broke at
  the sink before reaching the boundary). Every non-idempotent island click ran twice: Checkbox
  toggled on+off per click, toy Cell picked month→week→month, counter counted by 2. Fix:
  runtime/src/dom-backend.ts — ownership precheck (`el.closest('[data-declare-app]') !== rootEl
  → return null`) before the sink walk. Verified post-fix: counter +1, checkbox toggles both ways,
  toy zooms (65→204px), board hops one column per click twice (310→456→602), homepage reactivity
  +17 single-fire, calendar month/week regression clean.
- Verified interactive in-island: counter, morph card, reactivity, board (card advanced), ball,
  states card, location demo, slider/reset, keyboard delivery.

Visual-polish round 2 (David's review, 2026-07-18):
- FIXED ch6 drawing card: text overflowed the white card (200w) — card 240 / app 300; measured 22px clear.
- FIXED ch1 morph card: open-state body text overflowed (open width 200) — now opens to 230; 21px clear.
- FIXED ch8 board add: `raw.insert(["cards"], …)` threw (runtime insert takes a STRING path; read takes
  an array) — now `insert("cards", …)`; add works standalone + in-island. Upstream doc bug FIXED
  (David-approved): the array-path claim was hand-written prose inside the generator
  (tools/internal/doc/assemble.mjs:165); corrected to dotted-string verbs / array read, projections
  regenerated (both SKILL.md files), docs gate green. The read-vs-verbs API asymmetry itself is left
  as-is — David expects the next eval round to surface whether it needs a language-level ruling.
- FIXED ch8 board entry field: 30px vs 40px Button — field now 40px, aligned.

Persona-test response round (2026-07-18, David-approved):
- Numbers: ch1/ch13 now "480 lines of code, about seven hundred with its detailed comments"
  (both stats.json metrics, basis stated); ch11 build size 45→54 KB with basis (wireGzip is
  mechanically validated by the pre-commit prewarm hook; 45 was stale hand prose — FAQ still says
  45, left for homepage fresh pass).
- Sermon dedupe: ch9 opening tightened to point at ch1; ch12 "one design two beneficiaries"
  paragraph cut; ch13 "most prized layer"/"stood on the ceiling" reworked; ch10 "celebrated"/
  "almost embarrassingly" toned; motion-team-quarter echo de-duplicated.
- Error-claim truth-up (ch1/11/12): "the fix by name" now scoped to "for the instincts it
  anticipates" — matches shipped diagnostics. Did-you-mean for attribute typos is BLOCKED
  upstream: emitter is runtime/src/check.ts, which is in David's app-pronoun-wip stash.
- Error strip + Revert parity across ALL live-edit surfaces, behaviorally verified:
  docs-next (had both) · codeviewer (already had both) · apps/docs (added both) ·
  homepage SourcePanel (strip added; had Revert) · homepage FullPageEditor (both added).
- HEAD inconsistency surfaced by the runtime rebuild: schema gained a `cursor` attribute
  (Menu/Tooltip work) colliding with homepage's `cursor` child → renamed to `pointerDot`;
  homepage verifies clean again. Homepage marketing copy ("names the fix") not touched —
  fresh-pass territory.
