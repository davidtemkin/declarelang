# Engagement evals — an agent working with a person, the ways people really work

The craft runs (`evals/craft/`) measure one way of working: a long brief, built
unattended, to the end. That is real, but it is the minority mode. Most sessions are
short and steered by a person who looks at the result after every turn: a one-line idea
and then a string of small requests, a picture to match, a change to an app that already
exists, a quick spike to see whether something can work (research:
`docs/operational/` has none of this; the evidence is summarized at the end of this file).

These evals put an agent in each of those situations, on any platform. Each eval is one
of a few **kinds**, and every kind is framework-independent: what the agent is told, what
the person asks for and how the result is judged never name a technology, so the same
eval runs on Declare and on React (or anything else), and the numbers compare.

## The kinds

| Kind | Starts from | The person | Measures |
|---|---|---|---|
| **brief** | nothing | none: one long brief, built unattended | the craft runs, unchanged (`evals/craft/`) |
| **riff** | nothing | a one-line idea, then short requests, one at a time, after looking | time to the first thing worth seeing; each request done; nothing broken by a later one; how it ends up |
| **mockup** | a picture | "build this", then what still differs, after comparing | likeness (proportion, spacing, type, colour, copy); then one behaviour asked for |
| **change** | an app built earlier, on the same platform | one significant enhancement, then what is wrong with it | the enhancement done; the rest still working; the change made in the program's own grain, and only where it needed to be |
| **tweak** | an app built earlier, on the same platform | one small request | done, quickly, with a small diff and nothing else touched |
| **spike** | nothing | "can this work? just enough to see" | how fast an honest answer arrives, and whether the thing shown really works |

**change** and **tweak** build on the brief evals' own apps — Cadence, Murmur and Venue.
Each platform starts from **its own** earlier build of the app (a seed, `seeds/`), so the
second step runs on any framework exactly as the first does. Two variants:

- **cold** — a fresh session is handed the existing app (the common case: you come back
  to a project, or open someone else's). The seed is put where that platform's apps live,
  with its own tests if it had any, and the app's service running.
- **warm** — the change is the next turn of the session that built the app (a brief run
  with a second phase; `evals/craft/README.md` § a run with a second phase). Same request
  text.

## The person: a simulated user

Every kind but **brief** is a conversation. The person is a second agent (the **user**)
that never sees the code. It has:

- **a persona** — who they are, what they use the app for, and the device they use it on;
- **the intents** — the eval's requests, in order, written as ends, never as techniques.
  The user phrases each one in its own words, the way that person would, from what it
  sees on screen;
- **eyes** — `bin/see.mjs`, a plain browser that loads a URL at a laptop's or a phone's
  size, can click or tap what a person would (by its name or its words), type, press keys
  and scroll, and returns a picture, the visible text and any errors the page logged. It
  knows nothing about how the app is built, so it treats every platform alike.

Before each message the user looks at the app as that person would. If what it asked for
last isn't there, or something that worked has broken, its next message says so in a
person's words ("the streak doesn't show anywhere", "it went blank when I added one") —
**at most two such follow-ups per intent**, then it moves on and records that intent as
not done. When the agent's reply doesn't say where the app is, the user asks, as a person
would; that costs a turn. It never mentions intents it hasn't reached.

The user records, for each turn: what it asked, what it saw, and a verdict on the request
— **done**, **partly** or **not done** — with the picture it judged by. That record is the
eval's main score: it is what the person experienced.

The rules that keep it a fair instrument:

- The intents and persona are fixed per eval; only the phrasing and the follow-ups vary,
  and follow-ups are bounded. Two platforms see the same requests in the same order.
- Messages are one to three sentences, plain words, no code, no names of technologies or
  framework terms. An error is pasted only if the page showed one.
- The user looks at the device its persona uses. It moves to a phone only when an intent
  says the person does (a riff's "I mostly use this on my phone"). It never asks for
  checks of its own; it is not a tester, it is a person using the app.
- The user's model is named per run (by default the builder's).

## What is recorded and reported

For each turn: the message, wall time until the agent's reply, the agent's tool calls
and tokens (fresh input, cached input re-read, output), the user's verdict and picture.
For the whole run: the totals; for **change** and **tweak**, the diff against the seed
(files and lines touched, and how many lie outside what the request needed) and, for
Venue, the brief's own acceptance (`evals/apps/venue-checkout/drive.mjs`) run again — the
enhancement must not cost what already worked. A Declare run also gets the idiom read and
names ledger of a craft report, over the program as it stands at the end.

Pictures are taken two ways: the person's own, as they look (`logs/user/shots/`), and
the harness's — a **frame** of the app as each turn leaves it, at the address the person
last looked at, in their browser profile, on the device they are on by then
(`logs/frames/`). Pictures are never filed.

`bin/transcript.mjs <run-dir>` writes the conversation two ways:

- `logs/conversation.html` — a page to look at, published as a private artifact: each
  turn's message, the agent's reply, the frame and the person's pictures, the verdict,
  and what each side spent (time, tool uses, tokens). For looking at, not keeping.
- `logs/turns.md` — the same conversation as text, no pictures.

The report is filed in `evals/reports/<date>-<eval>-<stack>-<n>/`, **text only**: the
analysis, `turns.md`, and the final program. As with craft runs, **filing ends the
logs**: every analysis is run at filing and goes into the report, then the run directory
is deleted, pictures and all.

## Running one

```bash
evals/modes/bin/converse.mjs <eval> <run-dir> --stack Declare|React --model <id> \
    [--commit <sha> | --local] [--user-model <id>]
```

- `<eval>` is a folder under `evals/modes/evals/` (below); `<run-dir>` is created fresh,
  outside every repo, as for craft runs.
- `--local` gives the agent the Declare working tree as it stands (tracked files plus
  uncommitted changes), not a GitHub commit — to try a change to the skill or the docs
  before it is pushed. The run's record says so.
- The builder is a headless session that stays open for the whole conversation (one
  process, one message at a time), with the craft runs' tools and permissions, so a dev
  server it starts stays up between turns as it would for a person.
- The driver reports each turn as it ends (`logs/turns.jsonl`); `evals/craft/report.py`
  and `tail.py` read the builder's stream as for a craft run.

## An eval's folder

```
evals/modes/evals/<name>/
  eval.json      kind, app and seed (change/tweak), service, persona, device, intents,
                 max turns
  opening.md     the first message, exactly as the person types it ({{…}} fill-ins below)
  assets/        anything the person hands over (a mockup picture), copied to task/
```

The opening is the person's own message, so it carries no onboarding. For Declare, the
craft runs' framing sentence goes before it — the distribution is in `declarelang/`, the
language is not in the model's training data, start at its README — because that is what
having Declare installed means. For React, "as a React application" where the platform
must be named. `{{app}}` is the path of the app the person points at, `{{port}}` the
service's port.

## The set

| Eval | Kind | App | Persona's device |
|---|---|---|---|
| `riff-habits` | riff | — | laptop, then phone |
| `riff-reading` | riff | — | laptop |
| `mockup-listening` | mockup | — | phone (the picture is a phone's) |
| `spike-timeline` | spike | — | laptop |
| `change-venue` | change | Venue | laptop, then phone |
| `change-cadence` | change | Cadence | phone |
| `change-murmur` | change | Murmur | laptop |
| `tweak-venue` | tweak | Venue | laptop |
| `tweak-cadence` | tweak | Cadence | laptop |
| `tweak-murmur` | tweak | Murmur | laptop |

Still to come: a **fix** kind — a person's bug report against a seed — needs bugs that
every platform's seed shares, and the seeds' known defects differ; it waits for a
catalogue of each seed's own defects (from its report) or for planted ones.

## The evidence behind the kinds (summary)

From the research of 2026-10-27 (Anthropic's Claude Code usage studies; the Stack Overflow
2025–26 surveys; practitioner write-ups):

- A typical session has about four user turns; the person decides what to build and what
  counts as done, and looks at the running result after each turn.
- Fixing and changing existing code is at least as common as writing new code.
- Screenshots are in a large share of practitioners' prompts; a mockup is the form-factor
  spec.
- Specs and long unattended runs are real but used for the larger jobs.
- The complaints run both ways: process out of proportion to the request (specs for a
  one-line fix, tests nobody asked for, slow self-testing), and checking that never
  happened (never opened the page, claimed done on a broken build). What people want is
  one real look at the result, scaled to the change.
- Phones come from the app's purpose, not from a requirement; people expect what already
  works on a phone to keep working.
