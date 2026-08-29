# `verify` — the checking CLI

`verify` checks a program by climbing a ladder of rungs, cheapest first, stopping at the first
failure. The concept is [Run it, check it, ship it](declare-docs:guide:run-check-ship); this page is the command.

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
| `--states <script.mjs>` · `--baselines <dir>` | rung-6 named states and their baseline images (default: `baselines/` beside the states script) |
| `--bless` | write current renders as the baselines |
| `--wrap` | wrap a bare `class … extends` in a probe app, so a library component verifies standalone |
| `--only <file>` | verify the whole program, print only the diagnostics positioned in that one file (an include, by the path you would write it). The others are counted, and still fail the rung |

Positions name their file: an error in the program file reads `(line 12, col 7)`;
one in an included file reads `(rooms/pulse.declare:118:23)` — relative to the
program's directory, editor-clickable. An include-only file (classes, no `App`) is not
a program: `verify` says so and points at `--only` and `--wrap` rather than parsing it
to `eof`.

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

## Writing a states script

`--states` takes a module whose default export is an **array of named states** —
each one page-state to capture and compare against its baseline. The full key
vocabulary (anything else warns and is ignored — `width`/`height` at the top
level is the classic mistake; they belong inside `viewport`):

| key | shape | what it does |
|---|---|---|
| `name` | `string` | the baseline's file name — stable across runs |
| `viewport` | `{ width, height }` | the captured window, in CSS pixels |
| `clock` | ISO date `string` | pin the WALL clock (`Date`) so a rendered time reads the same every run — the driven animation clock is separate and untouched |
| `scheme` | `"light"` \| `"dark"` | the color scheme the capture renders under (default light) |
| `dpr` | `number` | device pixel ratio of the capture (default 1) |
| `route` | `async ({ drive, expect, page })` | drive the app INTO this state before capturing — clicks, settles, anything an assert script can do |
| `mask` | `[{ x, y, w, h }, …]` | rectangles **excluded from comparison** |

`mask` is what makes rung 6 usable over **live data** at all: mask the clock, the
feed, the avatar — assert everything else to the pixel. Without it, one moving
region forces the whole state off the ladder.

```js
export default [
  { name: "phone-dark", viewport: { width: 390, height: 720 }, scheme: "dark",
    mask: [{ x: 12, y: 40, w: 120, h: 24 }] },
];
```

Three facts assert scripts learn the hard way, recorded here instead:
**`drive.find(path).attr("name")` is the real read** for any attribute — including
formula-valued ones (`inspect().attrs` carries only *written* slots, so a formula
attribute reads as absent there); `evaluate()` returns an Inspector **transcript
object** that serializes to `{}` — read values with `find(path).attr`, not by
JSON-ing a transcript; and a `drive.page.evaluate` callback must **`return null`,
never `undefined`** — an undefined return fails the rung as an anonymous page
error indistinguishable from a crash.

## Running the ladder across the corpus

Two suites, split at the browser boundary — and one more split by *subject*, below:

| command | what it climbs | cost |
|---|---|---|
| `npm test` | everything that tests the SOURCES, plus rungs **1–4** for every app and component | seconds for the first two dozen files, no derive needed |
| `npm run test:derived` | the suites whose subject IS a derived artifact — run it straight after `npm run derive` | seconds |
| `npm run test:ladder` | rungs **5–6** for every app that ships one of the scripts below | minutes, headless Chromium |
| `npm run test:all` | `npm test` + the ladder | |

**The derived tier** (`docs`, `schema-completeness`, `declare-help`, `prewarm`,
`ops`) tests committed artifacts against the tree that produced them, so
it answers nothing on a tree that has not been derived — it would be reporting on
yesterday's artifact. That is why it is a separate command and not a slower part of
`npm test`, and why the rule is *derive immediately before*.
→ [`derive.md`](declare-docs:operational:derive)

The slow suite works by **discovery**, and the discovery rule is the repo's
convention for where an app's checks live — **the `tests/` folder**:

```
apps/<name>/
  <name>.declare        the program (named after its directory)
  tests/
    assert.mjs          rung-5 behavior (optional)
    states.mjs          rung-6 named states (optional)
    baselines/          the blessed captures states.mjs compares against
```

Give an app a `tests/` folder holding either script and it is climbed to the top
of the ladder from then on — nothing to register, so a new script cannot be
forgotten by a future run. The folder pairs with the `.declare` named after its
directory, so sibling includes (`viewer/tour.declare`) don't confuse it, and the
scripts need no name prefix — the folder scopes them.

The folder is not just tidiness; it is the **packaging boundary**. Placement is
the declaration ([`system-design/app-packaging.md`](../system-design/app-packaging.md)): a
deploy or package sweeps everything in the app's directory, and `tests/` is the
one subtree that never ships. Test scripts and baseline PNGs stay out of every
deploy by one rule instead of a per-file exception list.

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
