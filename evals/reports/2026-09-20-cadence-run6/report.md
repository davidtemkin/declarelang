# Cadence — run 6 · 2026-09-20

**Subject:** GitHub `63b240f` (v0.4.6), downloaded fresh — `evals/` stripped, brief and fixture staged beside it.
**Model:** Opus 5 (`claude-opus-5`), headless, `--output-format stream-json --verbose`.
**Tools:** Read, Glob, Grep, Bash, Write, Edit; accept-edits; no MCP servers; permission prompts refused.
**Prompt:** the four standard sentences. The agent's working directory was inside the clone (the standard, recorded later in `evals/craft/`, starts it in the run directory).
**Brief:** as committed; unchanged since run 5.

This report was filed after run 7, from the run's own logs, as the baseline run 7 is read against.

## Headline

**Clean through R5 on its own 25-step assert** · **1,788 lines** in one file + a 130-line assert · build round **58.6 min** across two invocations (the first stopped on the account's usage limit at 11.1 min and was resumed) · **$43.27** for the build round.

Two further steps followed, both labelled separately below: a fix pass on eight defects the reviewer found (**24.7 min**, to $68.39 cumulative) and a written appendix on the experience (**1.8 min**, to $74.46).

## Where the time went (build round, from the event stream)

| | |
|---|---|
| tool calls | 233 |
| tool calls before the first write to the app | 44 |
| files read before writing | 19, plus 12 `declare-help` queries |
| `verify` runs | 53, 15 of them at rung 5 |
| writes and patches to the app | 66 |
| screenshots viewed | 26 |
| output tokens | 226k (43k first invocation, 183k resumed) |

## What it built

A log that owns the three sources and one writer (`Log extends Node`): a POST, PUT or DELETE through a `DataSource`, then the server's returned record inserted into the history, so every figure follows. The year as two sprung scalars, `center` and `span`, written directly by the hand and through springs by buttons and keys; 250 bars in `draw()`; `claim = x` so a vertical swipe still scrolls. Figures that spring to new values; a detail card that flies out of what was touched.

## The eight defects, and the fix pass

Found by the reviewer in the running app, all past a green R1–R5 ladder; fixed in the labelled fix pass (`reply-fixpass.md` has its table):

- the Add button touching the live band; the live band's right margin at 0 and its clock overflowing by 14px;
- hero figures kerned by hand across separate text runs (−8.8px into a bearing that is 3px after a "4");
- a 104px figure against a 15px word;
- a card's content ending 11px past its bottom edge;
- a disc's digit 4.5px below centre (a hand-rolled label where `TextLabel` existed);
- figures' ink hanging 3.8px left of the panels;
- a one-frame whole-screen flash every five seconds — presence gated on `DataSource.loaded`, then false for the duration of every re-fetch;
- a running clock that repeated a second, then skipped one.

## What it reported costing it (`reply-appendix.md`)

- **Write-then-act read stale values, silently**: setting `url`/`body` then calling `fetch()` in the same handler sent the old request.
- **Layout ownership learned by collision**: a child reading `parent.contentWidth` while contributing to it — a runtime cycle rung 4 did not see.
- **`WrappingLayout.lineSpacing`'s negative sentinel** turned −21 into +7.
- **No ink metrics** from `measureText`.
- **Green R1–R4 gave false confidence**, with nothing between R4 and a hand-written R5 assert.

These drove the changes in `05932487`: `rowSpacing` in place of the sentinel; `DataSource.loaded` meaning "has a value" and surviving a re-fetch, with `loading`/`failed` as the request facts; the layout ownership rule and its content-size cases; the `afterSettle` paragraph and the wake trace. Ink metrics and the R4–R5 gap remain open.

## Evidence

Here: `app.declare` (the one-round result), `app-after-fixpass.declare`, `app.assert.mjs`, `reply-build.md`, `reply-fixpass.md`, `reply-appendix.md`, `shots/`.
