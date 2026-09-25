All eight are fixed and verified — visually at four widths plus dark mode, numerically, and through the full `verify` ladder (R1–R5 green, service back at 248 sessions).

## The fixes, measured

| | before | after |
|---|---|---|
| Add button vs. live band | edges touching at y=72, shadow bleeding over | 22px gap; button now in fixed chrome, overlaps nothing at any scroll |
| Live band margins | right margin **0**, clock overflowing the bottom by **14px** | 24px on both sides, 25.7px of bottom slack; height derived from content |
| Hero kerning | unit runs kerned −8.8px into a bearing that is 3px after a "4" | one text run; the font owns the spacing |
| Hero contrast | 104px figure vs 15px word | 97px vs 21px, one baseline (all four runs at 97.0) |
| "Lift · Yesterday" card | content ending **11px past** the card's bottom edge | 20px inside it; card height derived |
| "3" disc | ink centre 4.5px below the disc centre | `TextLabel`, cap-centred |
| Left rail | figures' ink hanging 3.8px left of the panels | every ink edge on x=40 |
| Whole-screen flash | one blank frame every 5s | gone (screencast: no frame-size outliers over 12s) |
| Running clock | repeated a second, then skipped one | exactly one second per second |

## What led to each, and which were easy in Declare

**The flash and the clock were the same mistake, and both were mine, not the language's.** I gated the live band's presence on `liveSrc.loaded`, and `loaded` is false for the *whole duration of every re-fetch* — so the band left the layout five times a minute and the column under it reflowed. One character class of fix: read `.value != null`, which survives a re-fetch. The clock stuttered because I re-derived the session's start from each refreshed `startedSecondsAgo`, re-seating the phase every 5 seconds. Anchoring the start once made a plain one-second tick exact. **Straightforward in Declare** — three lines — but *invisible* below rung 5: both boot clean synthetically. I'd trusted a green ladder where I should have watched the page.

**The Add button overlapping the band was a design error, not a placement error.** I had put a floating `ignoreScroll` button over a scrolling page, which is over *something* by definition; nudging its coordinates could never fix it. The real answer was chrome: a fixed bar carrying the page's own background, with the page reserving its height. **Easy in Declare** — `ignoreScroll` plus a padding constant — and the language pushed me the right way, since there's no z-index to paper over it with.

**The live band's margins and the card's overflow were both fixed heights I'd guessed.** `height = 104` was true for the type I had at the time and stopped being true when the type changed. Replacing both with `height = { contentHeight }` and a `padding` box is the idiomatic answer and it can't go stale. **Easy — but it bit back**: a child that reads `parent.contentWidth` *while contributing to it* is a cycle, and the compiler doesn't catch it (rung 4 was green; the browser threw "re-evaluated 100 times"). I had to name the inset once and measure against `parent.width` instead.

**The "3" off-centre was a language feature I'd skipped.** I'd hand-written `y = 14` inside a 52px disc. The library ships `TextLabel` precisely for this — it cap-centres over the Text's own live metrics, so it follows the font and the size. **Easiest fix of the set**, and a straight case of me rebuilding badly what the box already had. I swapped every centred label in the app over.

**The kerning was the one Declare genuinely could not solve.** I'd tucked small unit letters into each figure's right bearing with a fixed negative spacing. In Avenir Next Condensed that bearing is **15.1px after a "1" and 3.0px after a "4"** at 104px — so one kern either yawns or collides, and mine collided. The correct fix is to measure the ink; `measureText` returns advance width only (`TextMeasure` is width/height/baseline/capHeight/lines), so *nothing inside the program can tell those two cases apart*. I stopped fighting it and set the whole duration as one run — the font does the spacing, `3h 40m` can't break across a line, and a whole class of risk disappears. That also forced the second-order fix: one run is wider, so the hero now sizes itself to the room it has (`clamp(colW × 0.071, 70, 104)`) instead of a fixed 104 — verified not to wrap from 820px to 1600px.

**The left-rail misalignment was optical, and only half-solvable.** Panels paint at exactly x=40; a 97px digit's ink starts 3.6px left of its origin. Same root cause as the kerning — no ink measurement — so I carried the face's bearing as one named constant (`DISPLAY_BEARING = 0.036`) and added it back on the blocks that share a rail with a painted edge. It's honest but it is a font constant in the source; if the face changes it wants re-measuring, and I said so in a comment where it's declared.

**Two things I did not change, deliberately.** The phone's floating + still overlaps paper as you scroll — that's what a FAB is, and thumb reach is a stated requirement; I moved the last card's effort disc to the card's left on phone so it never covers *ink*. And the breathing ring on the live band is the one thing in the app writing every frame (~300 DOM attribute writes/sec) — it runs only while a session actually is.