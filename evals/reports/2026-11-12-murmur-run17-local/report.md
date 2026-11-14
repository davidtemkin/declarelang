# Murmur run 17: Opus 5.5, Declare, on the local tree

Built on the local working tree after the fixes from nine earlier runs. **31.3 min, 143 turns,
116k output tokens**, against run 16's 17.8 min. It verifies clean; there is no hidden drive.
**About 10.8 min (≈34%) was friction:**
- two derived-Dataset platform bugs: 6.65 min;
- an `Image.loaded` trap: 2.0 min;
- habitual fixed waits: 1.85 min;
- other: 0.3 min.

The keychain prompt from the Chrome switch caused **no stall**. Without the friction the run is
about 20.5 min. The rest of the gap to run 16 is investigation style: 36 `declare-look` calls,
against 4. Not clean on any count. Timing record:
`evals/timings/2026-11-12-murmur-run17-local.txt`.

**The agent's account is missing.** The resume answered "Not logged in · Please run /login": the
CLI's login on this machine had lapsed when the account step ran.

## Where the time went

| Minutes | Segment | Class |
|---|---|---|
| 0–4.3 | Reading, probing the service, planning | Legitimate |
| 4.3–6.6 | A scale probe of a 30.5k-row thread, plus planning | Agent choice, reasonable |
| 6.6–10.1 | Writing 3 files | Legitimate |
| 10.1–10.9 | Compile fixes (4005, 2000, 3006, 6001 ×4) | Its code; fair messages |
| 11.2–15.2 | **Inbox unread count stale (P1)** | **Platform, 4.0** |
| 15.2–22.2 | Phone fixes, flow and phone scripts, looks | Legitimate |
| 22.3–24.9 | **Inbox rows cross-wired after a re-sort (P2)** | **Platform, 2.65** |
| 24.9–27.2 | Live and thumb scripts, phone photo look | Legitimate |
| 27.2–29.2 | **Photo ratio cache empty (I1)** | Documented trap and doc gap, 2.0 |
| 29.2–31.3 | Reaction fix, re-verify, dark mode, DESIGN.md | Legitimate |

`drive.waitReal` took 6.04 min in 163 calls:
- about 2.3 min was needed for the service's real-time arrivals;
- about 1.85 min was habit: opening waits that `verify.md` says aren't needed, in a line the agent
  never reached (D2);
- the rest was round-trips, image loads and glides.

## The deep audit

Repros are in `audit/`.

**Platform, both in `runtime/src/data.ts`, neither caused by the copy-on-adopt change** (records are
held by reference):
- **P1.** A read through a derived Dataset that stops at a source record doesn't wake for writes
  beneath that record. `Dataset.read` tracks only the derived dataset's own slot, never the record's
  home slot in its source. Through the source, the same read stays live, because every write wakes
  its ancestors. Fix: when a derived read enters a foreign container, also track the container's
  home slot. Repros: `derived-deref`, `derived-row-record`, `derived-variants`.
- **P2.** A re-sorting derived list lands its new array without bumping `$shape`
  (`mergeRows`/`mergeTree`). `rowPlace`'s fast path then trusts old positional cursors: view `c`
  shows `b`'s count, permanently. Fix: bump `data.$shape` wherever a merge lands a structural change.
  Repros: `derived-reorder*`.
- **P3 (latent; cause not established).** `scrollAnchor = end` + `virtualize`, in an App smaller
  than the window, gives scroll fact 49096 against DOM `scrollTop` 0. The first wheel jumps to the
  top (`anchor-end-virtualized-small-app.*`).
- **I1.** `Image.loaded` latches across a `source` change (documented as "one honest edge"), so
  `onChange` on `loaded` never fires on a recycled row. After a 404 it reads `loaded` and `failed`
  together, and keeps the previous bitmap: a row can show another message's photo. Guide 13 doesn't
  mention it.

**Tools and messages:**
- **T1.** `__declare.explain` reports `deps: null, live: false` for working tracked rules, which sent
  the agent chasing closures.
- **M1.** TS2550 (`findLast`) says "change the lib option"; it should say `{ }` is ES2022.
- **M2.** DECLARE1000 at a class with a `{ }` data body should say embedded data goes on an instance.
- **N1.** A `parent.X` miss doesn't say where X is.
- **N2.** `ValueControl.onEnter` should point to `TextInput.onEnter`; a bare `declare-help onEnter`
  dumps 99 entries.
- **D2.** The "no opening wait" sentence isn't where the agent looked: `look --help` or the
  `drive.waitReal` row.

All other refusals were correct; the `backdrop` collision was fair, with a good rename hint. Run
16's fixes held.

### Clean bill

| Count | Verdict |
|---|---|
| Platform | **Not clean.** P1, P2 met (6.65 min; the app works around both with summary records); I1 met; P3 latent |
| Tools, incl. driver and harness | **Not clean.** T1, M1, M2; D2 out of sight; the account step failed (CLI login) |
| Names | **Not clean.** N1, N2 |
| Reference | **Not clean.** I1 untaught in the guide; D2 out of sight |

**Friction cost: about 10.8 min (≈34%) and about 23k output tokens (≈20%, ±50%).**

## Deferred: design

1. Should `Image.loaded` reset when a load starts, as `failed` does?
2. Should `:path`/`:@` hand a tracked view to `{ }` code, as `.value` does (a broader P1)?
3. A "wait until" primitive for real-time arrivals (`drive.waitRealUntil(fn, max)`).
4. ES2022 as the `{ }` language, or ship the ES2023 array methods?
