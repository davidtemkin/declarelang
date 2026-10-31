# Venue run 17: Declare 585c768d, Opus 5.5, recorded

**Run:** 2026-10-30, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-17 claude-opus-5-5 585c768d`. It ran alone on the machine.
It is the first Declare run recorded with `evals/craft/record.sh`, for comparison with React Venue run 2, scored at
first boot as well as as delivered. The side-by-side page is the Artifact
https://claude.ai/artifact/EjUbFsLNTsBq3pXhzRLFJ1.

**Files beside this report:**
- the app's five files and its five assert scripts (`tests/`);
- the hidden acceptance results, as delivered and at first boot (`drive/`).

No account was asked for.

## Figures

| | Venue 16 | **Venue 17** | React Venue 2 |
|---|---|---|---|
| time | 25.2 min | **23.4 min** | 30.9 min |
| model · tool time | 19.5 · 5.7 min | **17.0 · 6.5 min** | 20.3 · 10.6 min |
| thinking | 9.8 min | **7.5 min** | 9.7 min |
| turns · output tokens | 110 · 120.5k | **109 · 108.4k** | 108 · 135.5k |
| cached input re-read | 23.7M | **21.5M** | 9.8M |
| first app write · first compile | 8.2 · 13.2 min | **6.1 · 11.9 min** | 3.9 · 15.7 min |
| failing compile rounds before clean | 7 | **4 (40 s)** | 1 (6 type errors) |
| first boot | 14.1 min | **12.6 min** | 16.1 min |
| hidden acceptance at first boot | — | **2 of 11** | 6 of 11 |
| hidden acceptance as delivered | 11 of 11 | **10 of 11** | 11 of 11 |
| code, excluding blanks and `//` lines | 1,407 | **1,394** | 2,666 |

## First boot

The recorder missed the app's own files: the Declare download is a git checkout, which git stored as a single
pointer. The fix in `record.sh` mirrors the work tree before each snapshot. The first-boot app was rebuilt by
replaying the agent's writes from its stream up to 12.6 min; the rebuild is clean through R4, as the agent saw it.

**Its failures were mostly layout:**
- the checkout's fields were sized to their content;
- the side column holding the summary and Pay wasn't on screen;
- `width = { app.wide ? 380 : NaN }` used `NaN` to mean "unset";
- the card-number field and the phone bar were mis-sized.

There were also two logic slips: operator precedence in "expired", and a Carousel's datapath.

The boot check's fourth-round message offered `align = stretch`, and the agent only removed the width. It added
stretch four minutes later, after a screenshot. It listed `06-layout.md`'s headings at 0.3 min and never read the
chapter, as in Venue 16.

## As delivered

10 of 11. `security_code_wrong` fails because the service's "The security code doesn't match this card." is
erased:
- `refusedWith` empties the code, as `Form.refusedWith`'s docs suggest;
- a refusal counts only "while the value is the one refused";
- the code is set `judged = false`, as `TextInput.judged` suggests, which hides it too.

Two documented patterns cancel each other. This is a design question for the forms library.
