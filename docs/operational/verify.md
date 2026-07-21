# `verify` — the checking CLI

`verify` checks a program by climbing a ladder of rungs, cheapest first, stopping at the first
failure. The concept is [Run it, check it, ship it](declare-docs:guide:loop); this page is the command.

```bash
node tools/verify.mjs app.declare
```

## The rungs

| # | rung | catches | needs |
|---|---|---|---|
| 1 | structure | parse errors | — |
| 2 | resolution | unresolved names, tags, datapaths | — |
| 3 | analysis | type errors, constraint reads without a known target | — |
| 4 | boot | fails to construct / settle headlessly | — |
| 5 | behavior | drive/expect mismatch | `--assert <script.mjs>` |
| 6 | visual | mismatch against named baselines | `--states <script.mjs>` `--baselines <dir>` |

Rungs 1–4 run in a **synthetic environment** — Node, the runtime's own backend,
approximated text metrics (the run prints `synthetic metrics`) — which is why they need
no browser and stay sub-second. Rungs 5 and 6 run the app in **headless Chromium**,
drive it with real input, and assert through the
[introspection bridge](declare-docs:operational:introspection) with motion made
deterministic by the driven clock.

## Flags

| flag | effect |
|---|---|
| `--rung=N` | stop after rung N (default 6) |
| `--json` | machine-readable result (used by the eval harness and editors) |
| `--no-typecheck` | skip the rung-3 typecheck (on by default) |
| `--assert <script.mjs>` | the drive/expect script for rung 5 |
| `--fixtures <dir>` | data fixtures the app consumes |
| `--states <script.mjs>` · `--baselines <dir>` | rung-6 named states and their baseline images |
| `--bless` | write current renders as the baselines |
| `--wrap` | wrap a bare `class … extends` in a probe app, so a library component verifies standalone |

## What a rung cannot see

A rung passing means *that rung* found nothing, and the first four never run a browser
engine. Layout against real fonts, paint, CSS, input routing, and anything that only
exists in a bundled or minified build are structurally invisible below rung 5 — a
transparent view swallowing presses, or a class name minified out from under code that
compared it, both settle cleanly at rung 4. When a bug survives a green rung 4, the next
question is a live page, not a re-run. The tiers and their blind spots are tabulated in
[Introspection](declare-docs:operational:introspection).

## Writing an assert script

`--assert` takes a module whose default export receives `{ drive, expect }` and drives the
app by **view path**, never by DOM selector:

```js
export default async ({ drive, expect }) => {
  await drive.click("app.dock.row.calIcon");
  await drive.settleMotion();
  await expect.visible("app.wins.0");
  await expect.approx("app.dock.row.calIcon", "width", 72, 1);
};
```

The full `drive` / `expect` vocabulary, and the `explain()` call that lets an assertion
be structural rather than numeric, are in
[Introspection](declare-docs:operational:introspection).

## Running the ladder across the corpus

Two suites, split at the browser boundary:

| command | what it climbs | cost |
|---|---|---|
| `npm test` | the 21 test files, plus rungs **1–4** for every app and component | seconds, no browser |
| `npm run test:ladder` | rungs **5–6** for every app that ships one of the scripts below | minutes, headless Chromium |
| `npm run test:all` | both | |

The slow suite works by **discovery**: name a script after its program and put it
alongside — `controls.declare` → `controls.assert.mjs` (R5), `controls.states.mjs`
(R6) — and the app is climbed to the top of the ladder from then on. Nothing to
register, so a new script cannot be forgotten by a future run.

Keep this split in mind when a green suite and a broken program disagree: `npm test`
alone never opens a browser, so pointer routing, real text metrics, CSS and paint are
all still unproven. That is the blind spot the tier table above describes, and
`test:ladder` is how you close it.

**When a baseline legitimately moves** — a deliberate visual change, or engine drift
after a Chromium upgrade — re-record with `--bless` and read the diff before you commit
it. `--bless` overwrites the baseline with whatever renders *now*; that is only correct
once you have confirmed the difference is the one you intended.

Exit codes: **0** every requested rung passed · **1** a rung failed · **2** usage/toolchain
error. The diagnostics name the fix and report every independent error in a rung at once — read
them, apply them, re-run.
