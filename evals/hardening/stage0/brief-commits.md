# Stage 0 brief: the commit reader

One agent, the window's commits. Many eval runs were fixed and rerun without keeping a
report, so the commit log is the other record of what evals found. Fill in `{SINCE}` and
`{OUT}`.

---

You are building part of an inventory of PLATFORM bugs in Declare, a UI language (repo:
/Users/temkin/Code/Declare — runtime/, compiler/, library/, tools/, docs/, apps/).
Read-only: do not edit the repo.

Many eval runs were fixed and rerun without keeping a report, so the commit log is the
other record of what evals found. Go through every commit since {SINCE} (`git log
--since={SINCE} --format='%h %ad %s%n%b' --date=short`; use `git show --stat <h>` and read
the diff where the message is unclear). Many messages bundle several fixes ("Venue run
29's three tool gaps: …") — split them into individual items.

For each individual DEFECT FIX (skip pure features, docs restructures, renames, eval-report
filing, releases, derived artifacts, refactors with no behaviour fix), record:
{"commit": "<hash>", "date": "...", "item": "<what was wrong, concrete>", "area": one of
["compiler/checker","reactive/data","layout","text","input/events/gestures",
"focus/keyboard","scrolling","motion","forms/text-fields","renderer","library:<ClassName>",
"docs","tools:verify","tools:look","tools:help","tools:driver","harness","mac-host","other"],
"kind": one of ["platform-bug","docs-wrong","tool-gap","new-diagnostic" (a check added, not
a defect fix)], "found_by": "<eval name+run if the message or body names one, else 'own
testing' / 'user report' / 'unknown'>", "severity": one of ["crash/hang","wrong-output",
"false-refusal (correct code rejected)","misleading-message","missing-capability",
"cosmetic"]}

Write JSON Lines to {OUT}.

Return a short summary (under 250 words): counts by area and kind, how many were found by
evals vs other means, the areas with the most platform-bug fixes, and any area where fixes
keep recurring (a sign of a weak spot).
