# murmur — the craft task

A conversation app, briefed as ends and constraints with **no design specified**
and no technology named. Built to be run as a two-arm comparison: the same
brief, the same service, the same seeded events, one implementation in Declare
and one in whatever an agent chooses.

Where the earlier `evals/comparisons/react-tracker-idiomatic-2026-08-02` round
compared *data density and performance* — LOC, dependencies, wire weight,
ms/frame — this one compares **experience**: continuity between states, motion,
custom controls, typographic and spatial judgement, and two genuinely different
layouts rather than one stretched.

The guarantees (`brief.md` §4) are the floor; **§7, "The standard", is the
bar** — it says outright that satisfying every guarantee and still reading as
unfinished is a failure, and names the two tells (motion that snaps rather than
travels; uniform weight where there should be hierarchy). Both arms are held to
it, and it is what the design statement is checked against.

The brief separates **scope from finish** deliberately and says so twice: it
asks for *the first version of a consumer application — small on purpose, and
finished on purpose*, then states that size and standard are independent and
only size is relaxed. It deliberately avoids "prototype", "first cut" and
"MVP", each of which licenses roughness in a brief where roughness is the thing
being measured. The scope is the eight verbs of §3
and reaching past them counts *against* an arm; production hardening —
reconnection, offline, persistence, telemetry — is explicitly not asked for.
Without that split, "consumer-grade" reads as "ship-ready" and an arm spends
its budget on breadth, which is the one thing this task must not measure.

Three things are judged, not two: that it works (§6), how it feels (§7), and
the source read as a work sample (§8) — including whether a program reached the
bar by hand-building machinery around the language it is written in, which is a
finding about the language rather than about the arm.

## Why messaging

Every craft demand is load-bearing on the functionality, so none of it can be
designed around:

| the demand | where it is unavoidable |
|---|---|
| continuity | opening a conversation from the list; a photograph opening to full size |
| motion with meaning | a reaction landing and the message reflowing around it |
| custom controls | a voice message's scrubber — nothing supplies one |
| unforgiving layout | photographs from 9:16 to 3:1, one 40-second voice note, a 400-word message |
| two architectures | at 390 the list is a screen you leave; at 1440 it is a pane you keep |
| live state | messages arriving in conversations that are not open |

## Run it

```
node api/build-fixture.mjs        # once — writes fixtures/ (~7 MB)
node api/server.mjs --port=8330 --seed=1
node api/selftest.mjs --port=8330 # 2293 checks
```

`build-fixture.mjs` needs macOS (`say`, `afconvert`, `sips`), `ffmpeg`, and a
photo corpus (`--photos <dir>`, default `~/Code/Mesa/sample-files/originals/jpeg`).
**`fixtures/` is the artifact of record** — build it once and ship it. See the
reproducibility note at the head of `build-fixture.mjs`: everything is
deterministic except the speech synthesiser, which moves durations by tens of
milliseconds between builds. Both arms must read the same shipped bytes.

## What the fixture contains

8 people (one with no picture, names from 3 to 20 characters) · 6 conversations,
2 of them groups · 443 messages, 305 of them in one conversation · 18
photographs spanning aspect 0.56 to 3.00 · 8 sendable photographs · 4 voice
clips from 6.9s to 40.3s with peaks computed from the shipped audio · reactions
including one mark carried by two people · 2 conversations with unread messages.

## The seeded feed

`--seed` fixes everything: 24 unbidden events at fixed offsets from connect —
messages, reactions, composing, read receipts, across four conversations —
plus a fixed answer delay per conversation when you send.

`t4` answers slowly **on purpose** (9.2s against ~2.2s elsewhere). It is also
the 305-message conversation, so it is the one you can scroll back into and
still be there when something arrives. That is the G4 case, and without a slow
conversation there is no way to reach it deliberately.

`GET /schedule.json` publishes the whole plan so an acceptance driver can wait
for a known event instead of sleeping. **The application must not read it.**

`--live` randomises the schedule. Never measure against `--live`.

## Sandbox rule

Unchanged from `evals/apps/README.md`, and it applies with full force here —
this directory contains the brief, and a clean clone contains every other
task's answer key:

```bash
git clone <repo> run-murmur
cd run-murmur
rm -rf evals                                    # unconditionally
mkdir -p task/api my-apps
cp <source>/evals/apps/murmur/brief.md    task/
cp <source>/evals/apps/murmur/api/API.md  task/api/
npm install && npm run build
```

The service runs **outside** the sandbox, from a tree that still has `evals/`.
The agent gets a port, not a copy — so `fixtures/` and `schedule.json` cannot
be read off disk, and there is no reference solution within reach.

## What is still to build

- **The capture rig.** One Puppeteer script driving the canonical path at
  390×844 and 1440×900, capturing named stills and video across the four
  transitions. It is evidence production, not scoring, and it doubles as a
  smoke test. The same script must drive both arms — which means addressing by
  visible text and coordinates, since the runtime emits almost no ARIA
  (`dom-backend.ts` sets `aria-label` on links and `aria-rowcount`/`rowindex`
  on collection rows, and nothing else).
- **The read.** Four pre-specified questions, not a general review: is the
  conversation transition one view moving or two cross-fading; is motion
  declared or timer-driven (reuse `evals/tasks/shelf/idiom.json`'s
  anti-markers); is responsiveness constraints or hard-coded breakpoints; and
  for a non-Declare arm, ecosystem or hand-rolled.
- **`DESIGN.md` as the thing judged against.** The brief requires each arm to
  state its intent in 300 words. The artifact is checked against that claim,
  which is what makes free design falsifiable without anyone pre-specifying it.

## Arm-specific instructions do not live in the brief

`brief.md` names no technology, so the clause that keeps a non-Declare arm on
the paved road — *use the animation and layout libraries the community would
reach for, named* — is delivered in the run contract, not here. Without it the
agent hand-rolls its motion and the comparison is worthless; that is precisely
how the 2026-08-01 tracker arm had to be discarded.
