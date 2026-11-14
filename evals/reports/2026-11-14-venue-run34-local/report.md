# Venue run 34: Opus 5.5, Declare, on the local tree, standard level

The validation round after the 2026-11-13/14 fixes, run alone. **25.5 min, 100 turns, 135k output
tokens** (64k thinking): reading 7.4, writing 7.5, checking 10.6 min; tool time 4.6 min. Timing
record: `evals/timings/2026-11-14-venue-run34-local.txt`.

## Hidden checks

| | first clean boot (16 min in) | as delivered |
|---|---|---|
| Score, on today's tree | **11/11** | **11/11** |

The first attempt was right: everything after the first boot was the agent's own checking and
polish (keyboard-only purchase, phone sizes, a shorter ticket).

## Friction

No library or runtime source read. Every compile refusal was one step on its message: a
baseline alignment with no `baseline` declared, `bold` bare inside `{ }`, a `datapath` on a
literal, a member reached through an unnamed child.

One runtime error, one step: a `Carousel` whose `datapath` was a plain computed object ("this
value belongs to no Dataset/DataSource"); the agent derived a `Dataset`. This is the third app
this round to point a `datapath` at a computed value (Presentify 8's `errorBody`, Ledger 9's
list) — see the round note in the Ledger 9 report.

## Idiom

1,273 lines of Declare (Venue 33: 1,142), no script, two color literals outside the theme, 98
theme reads, 28 branches on width or phone (39 in run 33). Reviewed against every item on the SKILL's drift list: no casts, no timers, no hand-made
controls or overlays; every request is a `DataSource`. Hand placement is the seat map's own
geometry (a scene, where it belongs), plus four pieces of ticket and panel chrome that
spell `x = { parent.width - this.width - 12 }` where `x = end` with a margin says it.
