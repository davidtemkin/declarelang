# Murmur — run 2 · 2026-09-12

**Subject:** the Declare distribution downloaded fresh into `declarelang/`, `evals/` stripped; brief and service docs staged at `task/`.
**Model:** Opus (`claude -p --model opus`), headless, `--output-format stream-json --verbose`, tools Read/Glob/Grep/Bash/Write/Edit.
**Prompt:** `prompt.txt` — the standardized four sentences: the language is not in training data, the repo is the only source of truth, start at its README, build what the brief says, the service is already running on :8330.
**Brief:** the Murmur craft brief as committed (`evals/apps/murmur/brief.md`), unedited for this run.

## Headline

**1,892 lines across seven files** plus a design note · **80.3 min** · **274 turns** · **$57.16** list · clean through R4.

| usage | tokens |
|---|---|
| output | 268,158 |
| fresh input written to cache | 553,848 |
| cache reads, summed over turns | 89,830,201 |
| uncached input | 528 |

| file | lines |
|---|---|
| `murmur.declare` | 568 |
| `thread.declare` | 554 |
| `marks.declare` | 205 |
| `voice.declare` | 178 |
| `rail.declare` | 173 |
| `composer.declare` | 129 |
| `photo.declare` | 85 |

It split the program across files unprompted, wrote a `DESIGN.md` of its own accord, and wrote
every file through the shell rather than the Write tool — 209 Bash calls against 54 Read calls,
and no Write or Edit call at all. That is worth knowing for any rig that watches for file writes:
polling the file system saw the program appear, and the tool stream alone would not have.

## Reading

The same shape as the Cadence runs. It read the README first, then the skill, then the language
file in four ranged slices after a whole-file `cat` came back as a 2 KB preview against the tool's
output cap. The heaviest reads after that were the data chapter, the motion and arrangement
chapters, and the calendar app as a worked example.

## The craft result

The design it chose is the strongest an agent has produced against any of our briefs: a rail whose
rows travel to their new rank rather than re-sort, a conversation column that grows from the
composer, voice notes with a scrubber, and a photo lightbox. Two panes at 1440, one at 390, with
the thread sliding over the list.

## What it got wrong, and why it matters

Three findings, each of which pointed at a platform gap rather than carelessness.

**No way to hear a value cross into a new state.** It wanted to act once when something became
true — mark a conversation read on reaching the end of it, open the busiest conversation once the
history landed, re-anchor after a send. With no event for a crossing it reached for a frame clock
gated on a fact, four separate times, each one a `Time [ tick = frame, running = { … } ]` whose
handler did the work and closed its own gate. The idiom is inventive and it works, and it costs a
clock per concern. This is what drove `trackChanges` + `onChange`.

**Virtualized rows trailed their own height.** It virtualized the thread on the assumption that a
few thousand views would not hold up, and the virtualization is what made the column's height lag
behind its content during fast scrolling. The count was never the problem: a later rebuild of the
same app with one leaf per message ran the same thread with 4,921 nodes against 13,153, and no
virtualization at all.

**Follow-after-send ordering.** After sending, the program asked the column to scroll before the
new row had a height, so the ask landed short. The general subject is a scroll request racing the
platform's own scroll process, which now has its own passage in the Space chapter.

## Artifacts

`*.declare` and `DESIGN.md` are the agent's own, verbatim. `shots/` holds the three screenshots
taken at the end of the run: the two-pane 1440 layout, and the list and thread at 390.
