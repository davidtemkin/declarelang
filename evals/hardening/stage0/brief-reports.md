# Stage 0 brief: a report reader

One agent per group of about 14 reports (round 1: four groups, in date order, of the 53
reports from 2026-10-17 to 2026-11-08). Fill in `{REPORTS}`, `{GROUP}` and `{OUT}`, and in
`{KNOWN}` any status facts already established for that group (round 1 gave group 3 the
DECLARE7001 replay results). The agent is a general-purpose one; it edits nothing in the
repository.

---

You are building part of an inventory of PLATFORM problems that Declare evals ran into.
Declare is a UI language (repo: /Users/temkin/Code/Declare — runtime/, compiler/,
library/, tools/, docs/). Eval reports live in evals/reports/<dir>/ (report.md, sometimes
followup-*.md, account-*.md). Read-only on the repo except where stated below.

YOUR REPORTS (read each report.md and any followup/account files in the dir fully):
{REPORTS}
(React/SwiftUI-only runs: only record items about Declare, usually none — skim them.
Codex runs that aren't "react" are Declare runs by a different agent — include them.)

GOAL: list every problem a Declare agent met that someone has attributed (or could
attribute) to the platform — runtime, library, compiler/checker, tools (declare-verify /
declare-look / declare-help / the driver), docs, or the eval harness — and classify it
honestly. Two things matter most:

1. Many things that looked like platform problems were NOT bugs: the agent's own mistake,
   a misdiagnosis, or the platform working as designed. Reports often already say so ("My
   code was wrong", "Not so:", audits, strikethroughs). Classify those as not-a-bug, don't
   count them as bugs.
2. The platform has changed since. Many problems were fixed (reports often say "Fixed
   (date)" / a commit; followups too), or the feature changed so the condition no longer
   exists in that form. Determine CURRENT status with evidence: `git log --oneline
   --grep=...` or `-S`, and/or reading current source/docs. Do not guess; use "unknown"
   when you can't establish it in reasonable effort.

{KNOWN}

OUTPUT: write JSON Lines to {OUT}, one object per distinct problem:
{"report": "<dir>", "item": "<short description, concrete>", "area": one of
["compiler/checker","reactive/data","layout","text","input/events/gestures",
"focus/keyboard","scrolling","motion","forms/text-fields","renderer","library:<ClassName>",
"docs","tools:verify","tools:look","tools:help","tools:driver","harness","other"],
"kind": one of ["platform-bug" (runtime/library/compiler behaves wrongly), "docs-wrong"
(docs contradict behaviour or are missing something an agent needed), "tool-gap" (a tool
misreports, crashes, or lacks something it should have), "design-limit" (an intended
restriction that cost the agent time, no defect), "not-a-bug" (agent error,
misdiagnosis, works as designed)], "cost": "<time cost as the report states, prefer
timestamp-based figures; note if it's the agent's own estimate (those are ~10x
overstated)>", "status": one of ["fixed","changed","still-present","unknown","n/a"],
"evidence": "<commit hash / report line / source file:line that establishes kind and
status>"}
Merge duplicates within your group (same problem in several runs → one line, list the
reports in "report" comma-separated).

Rules: do not edit anything in the repo. If you need to test whether something still
happens, you may create tiny programs ONLY under my-apps/stage0-g{GROUP}/ (gitignored) and
run `npx declare-verify <file>` or `npx declare-look <file> ...` from the repo root; keep
such checks few and cheap, delete that dir when done. Don't start servers or run evals.

Return a short summary (under 250 words): counts by kind and status, the areas with the
most still-present or fixed platform bugs, and anything you were unsure how to classify.
