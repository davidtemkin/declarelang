# Cadence run 36: Opus 5.5, Declare at 3bc519f9, standard level (the control)

The control for the round: the same brief on `main` as it stood before the round's push
(`3bc519f9`, downloaded from GitHub), to tell whether the round made building slower after
Cadence 34 took 23.2 min against Cadence 33's 11.6. **19.2 min, 83 turns, 98k output tokens**
(42k thinking): reading 5.1, writing 5.0, checking 9.0 min; tool time 3.9, model time 15.3.
Timing record: `evals/timings/2026-11-14-cadence-run36-3bc519f9.txt`.

## Hidden checks

**9 of 9**, scored with its own toolchain. Today's compiler refuses the program: it opens its
sheets with `input(…)`, which the round renamed `commit(…)` (DECLARE2000 names the rename).

## The answer

| run | tree | time | turns | output (thinking) |
|---|---|---|---|---|
| 33 | before the round, with work in progress | 11.6 min | 64 | 63k (21k) |
| **36** | **3bc519f9, before the round** | **19.2 min** | 83 | 98k (42k) |
| 34 | the round's final tree | 23.2 min | 99 | 118k (52k) |
| 35 | the round's final tree | 17.5 min | 91 | 92k (35k) |

The control is as slow as the runs on the new tree. The round did not make building slower;
Cadence 33 was the fast one, and the same brief ranges from 12 to 23 min on one model.

The tools did not get slower either: the same app and the same 15-click script take 0.20 s a
click under both toolchains (3.00 s for 15, twice each). Cadence 35's 0.42 s average was its
app's own motion settling after each press.

## Friction

No runtime errors. Source reads: `library/choicecontrol.declare` (a control of its own, modelled
on the library's). The verify spans show `drive.waitReal` at 0.61 min: the agent's own waits in
real time.
