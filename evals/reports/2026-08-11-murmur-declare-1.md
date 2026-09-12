# Murmur, arm 1 (Declare) — eval report

**2026-08-11.** First run of the craft task: a consumer conversation app, briefed
as ends and constraints, no design specified, no technology named. One arm,
Declare, Opus, clean-room sandbox from `bb59697b`.

Detailed findings with evidence: `evals/apps/murmur/FINDINGS.md`.
The short actionable list: `~/Desktop/murmur-bugs-2026-08-11.md`.

---

## 1. What this task measures, and why messaging

The tracker comparison (2026-08-02) measured *data density and performance* —
LOC, dependencies, wire weight, ms/frame. It could not measure craft, and craft
is the claim the platform actually rests on.

Messaging was chosen because every craft demand is load-bearing on the
functionality, so none can be designed around: continuity (opening a
conversation, a photograph opening to full size), motion with meaning (a
reaction landing and the message reflowing), a control nothing supplies (a voice
scrubber), unforgiving layout (photographs 9:16 to 3:1, a 40-second voice note,
a 400-word message), two genuinely different architectures at 390 and 1440, and
live state arriving unbidden.

The brief separates **scope from finish** explicitly — the eight verbs of §3 and
no more, with reaching past them counting *against* an arm — because
"consumer-grade" otherwise reads as "ship-ready" and an arm spends its budget on
breadth, which is the one axis this task must not measure.

## 2. The run

| | |
|---|---|
| wall | **88.4 min** |
| output tokens | **274,144** |
| cache creation / read | 558,728 / 92,089,437 |
| fresh input | 486 |
| model | Opus |
| exit | 0, replied `DONE` |

Build cost is captured because the tracker round could not capture it — that arm
was driven by hand. `evals/apps/murmur/run-arm.mjs` now records tokens, wall,
and the produced-file inventory identically for every arm that follows.

**Delivered:** 1,675 lines of Declare across 5 files (`murmur` 39 KB, `talk`,
`marks`, `compose`, `list`), plus `DESIGN.md`. Clean through R4 — 104 nodes,
43.4 ms settle, 418 constraints statically wired.

For scale, the Declare tracker was ~1,125 lines; this is 1,675 for an app with
two architectures, three message kinds, a live feed, and four continuity moments.

## 3. How it worked

Reading order: `README.md` → `task/brief.md` → `task/api/API.md` →
`skill/SKILL.md` → `docs/declare.md` → `intake.md` → guide chapters as needed
(space, data, motion-and-states, arrangement, interaction, house-style).

**`declare-help`: 36 calls, 29 distinct queries** — aimed at exactly the surfaces
this task stresses: `Image.stretches`, `Image.naturalWidth`, `Media.position`,
`Media.playing`, `Socket.send`, `Stream.onMessage`, `Spring`, `Animator.repeat`,
`View.claim`, `Text.lineHeight`. It also wrote a loop to batch queries. This is a
working habit, not a token gesture.

**It built its own instrument.** A screenshot harness (`shot.mjs`) combining
puppeteer with `window.__declare.inspect` — pixels *and* state — then ten drivers
over a shared `lib.mjs`, several named directly after the brief's scenarios
(`drive-s2`, `drive-s8`, `drive-s10`, `drive-g4`, `drive-guar`), plus a
`probe.declare` for isolating language questions. It ran the harness 18 times and
took ~108 screenshots at both viewports. It deleted all of it before finishing,
leaving a clean deliverable; the harness was reconstructed from the transcript
and now lives at `run-murmur-declare-1/harness/`.

**Caveat on attribution:** the contract explicitly told it to read `skill/SKILL.md`
and explicitly handed it puppeteer and Chrome. Neither discovery is to its credit
or the documentation's. `declare-help` was *not* mentioned in the contract, so
that habit is its own.

## 4. Against the brief

Sampled by driving the app, not by reading its claims.

| | |
|---|---|
| G1 authorship | **met, well.** Groups get avatar + per-person coloured name + a coloured rail down each sender's run; pairs get none, because side already says who spoke |
| G2 list order | met — ordered by activity, unread rows raised and badged |
| G3 return to position | met (`ui.set(["scroll", openId], …)`) |
| G8 photographs | **met.** Aspect preserved to three decimals across 0.56 and 0.67 sources, via `naturalWidth`/`naturalHeight` with a height cap |
| G9 voice | met — a real waveform (203×30 of per-peak bars from fixture data), play/pause, `Audio` node |
| G10 two shapes | **met, properly.** `narrow: boolean = { app.width < 760 }` is the only switch; mobile slides the conversation over a receding, dimming list, desktop is a centred 700-wide reading column |
| S3 dates | met — letterspaced day separators with a rule, per-message timestamps |
| unread | exceeded — a "2 NEW MESSAGES" divider, and "185 earlier messages" windowing the 305-message thread |

Not driven this pass: **G4/G5** (arrival while scrolled back vs at the bottom).
The agent wrote `drive-g4` and `drive-s8` for exactly these; running them is the
first thing the next pass should do.

## 5. Idiom

Clean. **18 `Spring`s, 1 `Animator`, zero timers driving motion.** Every animated
quantity is a spring chasing a derived target —
`Spring [ attribute = push, to = { app.narrow && app.openId != "" ? 1 : 0 } ]` —
the same shape the shelf eval scored 10/10 on. Responsiveness is one constraint
over one tree, not a duplicated layout. It built its own component vocabulary
(`ListRow`, `Avatar`, `Composer`, `PhotoTile`, `TypingDots`, `EmojiKey`,
`Earlier`, `ChevronIcon`), which §11 of the language invites.

The single `setTimeout` in 1,675 lines is not motion — it is a paint-order fix
after a settle, and it is finding 3.

## 6. The design-statement instrument works

`DESIGN.md` (300-word cap, trimmed on a second pass to respect it) made six
checkable claims. **All six verified against the artifact**: the six named
springs exist and are named correctly, the type scale is as stated, the 3/13/46
spacing scale is real, the 700-wide column is real, "the accent is *me*" is
applied consistently, and the group-vs-pair gutter rule is real — a distinction
this reviewer had noticed and mistaken for inconsistency before reading the
statement.

That is the mechanism doing its job: it made free design falsifiable without
anyone pre-specifying the design, and it corrected a reviewer error. Keep it in
every future arm.

## 7. Findings

Eight, detailed in `evals/apps/murmur/FINDINGS.md`, summarised on the Desktop
list. The pattern across them is the report's main conclusion:

> **The capability is nearly always present. The path to it is what fails.**

Three instances in one run — `declare-help` documented but absent from the front
door (fixed this morning, `5ae4c2c5`); the visual tier of the ladder reachable
only if you already know it; and the asynchronous scroll contract described in no
document at all. Each produces an app that works well enough to ship, with a
defect nobody was warned about. That is the expensive failure mode, because
nothing surfaces it.

Two platform items stand out: **no settle-completion hook** (independently
reproducing Max Carlson's PR #2 from a clean-room direction — the strongest
corroboration a feature request can get), and the **scroll contract**, which is
the one defect a user can actually see.

## 8. What the eval method learned

- **Pre-checks earned their keep.** The audio pre-check found that the fixture
  service returned whole files with no `Accept-Ranges`, so a browser would report
  duration, fire `seeked`, and silently refuse to move `currentTime`. Both arms
  would have failed G9/S13 for a reason belonging to neither. Fixed before the
  run; six range checks now guard it.
- **A disk-only watch has blind spots that read as findings.** The screenshot
  counter looked only inside the sandbox while `shot.mjs` wrote to `/tmp`, and a
  `find` predicate failed silently under `2>/dev/null`. That produced a confident,
  wrong "the agent never looked at its own screen" across several reports. The
  transcript is authoritative; check it before drawing a conclusion, not after.
- **The agent's harness is reusable.** Recovering it cost minutes and produced a
  better rig than writing one — built against this app by something that had just
  read the whole language. It addresses views by Declare path, so a React arm
  needs a text/coordinate variant.
- **Measure the right quantity.** A `scrollY` reversal is not a visual jump;
  content inserted above with the position correctly preserved looks identical to
  a fault. The honest metric is residual = `Δ(node screen y) + Δ(scrollY)`.

## 9. Open

- **Motion is verified in source, not in frames.** "Things travel, nothing
  switches" holds by reading; nobody has captured the transitions as frame
  sequences. That is the remaining half of the capture rig.
- **G4/G5 undriven** — the agent's own drivers exist for it.
- **The comparative arm has not been run.** The brief, service, seeded feed, and
  cost harness are all arm-neutral and ready. What a React arm needs is the
  paved-road clause delivered in its run contract (use the ecosystem's animation
  and layout libraries, named) — without it, that arm hand-rolls its motion and
  the comparison is worthless, exactly as the 2026-08-01 tracker arm was.
- **n = 1.** Cost, LOC, and frame timing are near-deterministic and fine at this
  n. Craft is not. Nothing here should enter `RESULTS.md` as a scoreboard number.
