# Cadence run 35: Opus 5.5, Declare, on the local tree, standard level

A second sample on the round's final tree (`ab1dfad6`), after Cadence 34 took twice Cadence 33's
time. **17.5 min, 91 turns, 92k output tokens** (35k thinking): reading 5.7, writing 2.9,
checking 8.9 min; tool time 3.0, model time 14.5. Timing record:
`evals/timings/2026-11-14-cadence-run35-local.txt`.

## Hidden checks

**9 of 9**, after a fix to the drive. The first score was 8 of 9: `delete_session` found no
DELETE. The app deletes with two taps, "Delete" then "Tap again to delete", and offers Undo
after; the drive looked for a confirmation whose name *starts* with delete / remove / yes /
confirm, so it never tapped the second time. `evals/apps/cadence/drive.mjs` now matches the
word anywhere; Cadence 34 still passes it.

## Time, against Cadence 33 and 34

| | 33 | 34 | 35 |
|---|---|---|---|
| total | 11.6 | 23.2 | 17.5 min |
| turns | 64 | 99 | 91 |
| output tokens (thinking) | 63k (21k) | 118k (52k) | 92k (35k) |
| reading · writing · checking | 4.1 · 2.4 · 5.1 | 7.0 · 3.7 · 12.5 | 5.7 · 2.9 · 8.9 |
| tool time · model time | 1.9 · 9.7 | 4.9 · 18.4 | 3.0 · 14.5 |
| verify calls (median) | 10 (2.5 s) | 26 (4.6 s) | 13 (7.7 s) |
| screenshots looked at | 8 | 10 | 16 |
| R5 per run | 3.2 s | 5.3 s | 3.7 s |
| `drive.click` each | 0.24 s | 0.24 s | 0.42 s |

Where the time went in this run (its full stream is kept): required reading and lookups to about
5 min; one turn of about 3.5 min writing the app; then about 9 min of checking, most of it
screenshots at several sizes and passes on type and layout. Two refusals, both one step (`if
(c) f() else g()` on one line, which JavaScript refuses too; `bold` bare in `{ }`), two R5
failures of its own script's expectations, no runtime errors.

What this run does and does not say:
- **Required reading grew about 1%** since `3bc519f9` (SKILL +157 words, declare.md +162, guide
  04 +62; 01, 05, 06 and the to-do app unchanged). Guides 08 and 09 grew 13% but this run read
  only a few lines of 09.
- **The checking scripts are larger, and the agent looks more:** more screenshots and more steps
  per script. That is the agent's choice of how far to go at the standard level.
- **One number points at the tools:** a `drive.click` took 0.42 s against 0.24 s in 33. To be
  measured with both toolchains on the same app and script, after the control run.
- The control (Cadence 36, on `3bc519f9`) decides whether the round made building slower.

## Source reads

`library/slider.declare`, read as a model for a control of its own (an effort scale with
drag, keys and accessibility increment), which the SKILL asks for.
