# Cadence run 20: Declare 3cc1d76c, Opus 5.5

**Run:** 2026-10-30, launched with
`evals/craft/launch.sh cadence ~/Code/eval-cadence-20 claude-opus-5-5 3cc1d76c` against GitHub main, alongside
Venue run 15.

**Files beside this report:**
- the app's two files and its two assert scripts (`tests/`);
- the agent's account (`account.md`, asked with `impressions.txt`), filed word for word.

## The comparison

| | **Cadence 20** | Cadence 21 |
|---|---|---|
| time | **18.8 min** | 16.6 min |
| turns | **66** | 70 |
| code, excluding blanks and `//` lines | **964** (2 files) | 886 (2 files) |
| output tokens | **69.8k** | 79.9k |
| cached input re-read | **9.6M** | 10.9M |
| first app write at | **8.5 min** | 7.3 min |
| tool time · model time | **6.9 · 11.8 min** | 2.8 · 13.7 min |
| thinking (reading · writing · checking) | **2.8 · 1.1 · 1.2 = 5.1 min** | 4.3 · 0.0 · 2.3 = 6.6 min |
| `declare-help` calls · their time | **10 · 3.9 min** | 6 · 0.2 min |
| verify calls · their time | **13 · 2.2 min** | 13 · 1.3 min |
| its own flows, from main | **both pass**, phone and desk | passes, phone and desk |

## Where the time went

**`declare-help` took 3.9 minutes over 10 calls (24 lookups).** One loop of nine lookups took 98 s. The tool itself
answers in 0.1 s; the time went to `npx`:
- Every call reinstalled the Declare package into npm's exec cache and sent an audit request to the registry.
- Under the load of two parallel runs, that averaged about 11 s a lookup.
- The repo's `.npmrc` now turns the audit off (f62e9876). In Cadence 21 a lookup took 0.9 s.

## Correctness

Its own two assert scripts were run from main against its own service, on phone and desk:
- `flow`: 24 steps, 13 assertions;
- `pan`: 37 steps, 1 assertion.

Both pass on both.

## What the agent said (`account.md`)

Its improvement list, in its order:
1. Documentation of `DrawContext` text (baseline, measurement), and of how App padding and overlays interact.
2. Stable addresses for tests: a warning when a numeric path crosses a library class's own children.
3. A write verb on `DataSource`, or a documented pattern for per-call bodies.
4. What verify's sample at boot does to sources that write (Cadence 21 asked the same).
5. A way to see which constraints fell back to runtime tracking, and why.
