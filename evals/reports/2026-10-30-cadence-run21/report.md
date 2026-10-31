# Cadence run 21: Declare f62e9876, Opus 5.5

**Run:** 2026-10-30, launched with
`evals/craft/launch.sh cadence ~/Code/eval-cadence-21 claude-opus-5-5 f62e9876` against GitHub main, alongside
Venue run 16. It validates the `npx` fix: the repo's `.npmrc` turns off npm's registry audit, which ran on every
`declare-help` and `declare-verify` call.

**Files beside this report:**
- the app's two files and its assert script (`tests/flow.mjs`);
- the agent's account (`account.md`, asked with `impressions.txt`), filed word for word.

## The comparison

| | Cadence 20 | **Cadence 21** |
|---|---|---|
| time | 18.8 min | **16.6 min** |
| turns | 66 | **70** |
| code, raw lines (files) | 1,275 (2) | **1,169 (2)** |
| code, excluding blanks and `//` lines | 964 | **886** |
| output tokens | 69.8k | **79.9k** |
| cached input re-read | 9.6M | **10.9M** |
| first app write at | 8.5 min | **7.3 min** |
| tool time · model time | 6.9 · 11.8 min | **2.8 · 13.7 min** |
| thinking (reading · writing · checking) | 2.8 · 1.1 · 1.2 = 5.1 min | **4.3 · 0.0 · 2.3 = 6.6 min** |
| `declare-help` per lookup | ~11 s | **0.9 s** |
| verify calls · their time | 13 · 2.2 min | **13 · 1.3 min** |
| library or runtime source read | | **0** |
| correctness | both flows pass | **its flow passes**, phone and desk (31 steps, 18 assertions) |

Writing thinking is 0.0 because the agent wrote both files and then went straight to verify.

## What the fix did

**Tool time fell from 6.9 to 2.8 minutes.** The run was 2.2 minutes faster in total. Model time rose by about as
much as tool time fell, mostly in reading: thinking while reading went from 2.8 to 4.3 minutes. As in Venue 16, the
remaining time is the model's.

## Correctness

Its own story flow was run from main against a fresh copy of its private service, on phone and desk:
- log yesterday's ride, and see the week and the streak take it in;
- delete it, and see them give it back;
- undo, correct, pan, pinch, and zoom presets.

It passes on both: 31 steps, 18 assertions.

## What the agent said (`account.md`)

It praised constraints and springs as the whole update model, computed defaults the person can take over, the
`draw()`-plus-gesture idiom for the year surface, and diagnostics that "read like a reviewer who knows the domain".
It worked around these:
- **A touch pinch did nothing at first.** It bisected with a minimal program over six or seven runs. It believes
  the second finger's `onPointerDown`, and single-finger moves, arrive after `onPinchStart`, but it inferred that
  order from symptoms. It was right: the second finger's `pointerDown` came after `pinchStart`, and the first
  finger's moves kept arriving as `onPointerMove` during the pinch, so a view that pans and zooms wrote the same
  numbers twice (the guide's own snippet included). Fixed after this run: each finger's `onPointerDown` comes
  first, and a pinch takes its press, so no `onPointerMove` follows until every finger lifts.
- **A no-break space in `HTMLText` still broke the line.** Fixed in 585c768d: the parser collapsed U+00A0 with
  JavaScript's `\s`.
- **A line of mixed sizes** ("4 sessions · 3h 40m") had to become an `HTMLText` with `textStyles` assembled by
  string concatenation.
- **Blending colors** needed a `mix()` of its own in `script`.
- **A `Segmented`'s selected look** didn't match the theme; it didn't look up its tokens.
- **Verify's boot check fed a sample to a source that writes.** Cadence 20 asked about this too.
