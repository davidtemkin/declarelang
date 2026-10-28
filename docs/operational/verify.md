# `verify` — the checking CLI

`verify` checks a program by climbing a ladder of rungs, cheapest first, stopping at the first
failure. The concept is [Running and checking a program](declare-docs:guide:run-and-check); this page is the command.

```bash
npx declare-verify app.declare
```

## The rungs

| # | rung | catches | needs |
|---|---|---|---|
| 1 | structure | parse errors | — |
| 2 | resolution | unresolved names, tags, datapaths | — |
| 3 | analysis | type errors, constraint reads without a known target | — |
| 4 | boot | fails to construct or settle, or never settles; notes a control nobody can reach, a child spilling out of a box sized by its content, text running past its box or the window, a target too small for a finger | — |
| 5 | behavior | drive/expect mismatch; notes rung 4's layout findings wherever the script settles | `--assert <script.mjs>` |
| 6 | visual | mismatch against named baselines; notes rung 4's layout findings in each state | `--states <script.mjs>` `--baselines <dir>` |

Rungs 1–3 read the program and need nothing else. Rung 4 **boots** it, in the Chrome the
tools keep running between calls (a page of its own each time, so it costs about a second):
in a laptop's window (1280×800) — or, with `--phone`, a phone's held upright (390×844,
touch), and with `--phone --desk`, both; `--size WxH [--touch]` names any other. It
hands each `DataSource` with a `schema` a sample of it, and notes what it can see wrong in
the layout: a control outside a view which clips and does not scroll, or above a scroller's
origin; a child spilling out of a box sized by its content because its own size is taken
from that box; text that runs past its box or past the window's edge; on the phone,
controls smaller than 44 × 44. It lists the program's classes the boot never built —
screens that appear only after data or a change of state — which it could not check.
Rungs 5 and 6 run the app in the same Chrome, drive it with real input, and assert through
the [introspection bridge](declare-docs:operational:introspection) with motion made
deterministic by the driven clock.

Where no Chrome can be found (or with `DECLARE_HEADLESS_BOOT=1`), rung 4 boots in Node
instead: the layout is the runtime's own, but text is measured by a stand-in, so the
checks that rest on text do not run — the run says so.

**A program that never finishes** — a loop whose exit never comes, as it boots or under a
click a script makes — is stopped at any browser rung once its page has gone the budget
(`--boot-budget`, 15 s) without answering, and the line it was running is quoted:

```
R5 ✗ behavior
     during click app.go: the program stopped answering for 15 s — something it ran does not finish (…)
       it was running  {  let s = ""; while (s != "ready") { app.n = app.n + 1 }  }
```

A clean run ends with a count — `clean through R4 (351 of 460 constraints statically
wired)`. It says how many constraints the compiler wired ahead of time; the rest find their
reads as they run, which is correct and costs a little at run time. It is information, not
a task: a program with a lower count is not wrong.

## Flags

| flag | effect |
|---|---|
| `--rung=N` | stop after rung N (default 6) |
| `--json` | machine-readable result (used by the eval harness and editors) |
| `--assert <script.mjs>` | the drive/expect script for rung 5 |
| `--fixtures <dir>` | data fixtures the app consumes |
| `--states <script.mjs>` · `--baselines <dir>` | rung-6 named states and their baseline images (default: `baselines/` beside the states script) |
| `--bless` | write current renders as the baselines |
| `--wrap` | wrap a bare `class … extends` in a probe app, so a library class verifies standalone |
| `--boot-budget=ms` | how long a page may go without answering before the program is stopped and its line quoted, at rungs 4–6 (default 15000) |
| `--samples` | print the sample each `DataSource` was handed at rung 4 |
| `--size WxH` · `--touch` | boot rung 4 in that window only (a touch device with `--touch`) |
| `--read PATH.ATTR` | print a value from the booted program; repeatable |
| `--outline [PATH]` | print every view under PATH (the App by default) with its place and size, as indented text — "is it where I meant?" without a picture |
| `--semantics [PATH]` | print what a screen reader is given, from the booted program |
| `--no-boot` | skip rung 4 and go to the browser rungs (`declare-look` does) |
| `--url <address>` | rung 5 drives the app where it is served — a dev server's address — instead of a copy hosted for the check: its own origin, its own service |
| `--only <file>` | verify the whole program, print only the diagnostics positioned in that one file (an include, by the path you would write it). The others are counted, and still fail the rung |

Positions name their file: an error in the program file reads `(line 12, col 7)`;
one in an included file reads `(rooms/pulse.declare:118:23)` — relative to the
program's directory, editor-clickable. An include-only file (classes, no `App`) is not
a program: `verify` says so and points at `--only` and `--wrap` rather than parsing it
to `eof`.

## What a rung cannot see

A rung passing means *that rung* found nothing. Rung 4 boots the program and looks at it,
but presses nothing: input routing, a screen reached only after a press, and anything that
only exists in a bundled or minified build are invisible to it — a transparent view
swallowing presses, or a class name minified out from under code that compared it, both
settle cleanly at rung 4. A rung-5 script that drives the program there is the check for
those, and when a bug survives every rung, the next question is a live page, not a re-run.

**Rungs 5 and 6 ask rung 4's layout questions where they drive.** Wherever a script lets
the program come to rest — `drive.settleMotion()`, `drive.settleData()`, its end — and in
each named state, the program is asked what the boot was: a target too small for a finger
(on a touch device), a control another view takes the presses of, text or a child running
past its box. A finding is a `layout` line naming where it was seen (`after tap app.go:`,
`in state 'open':`) and the views by path; a view already reported is not reported again.
What an open overlay or pinned chrome lies over is behind it by design, and not reported.
The verdict also names the program's own classes built nowhere — at boot or in any state a
script reached — so never checked: a screen no script visits is a screen nothing looked at. The tiers and their blind spots are tabulated in
[Introspection](declare-docs:operational:introspection).

## Looking at it, in one call

The usual check — open the program at a size, use it a little, read some values, take a
picture — needs no script:

```bash
npx declare-look app.declare --size 390x844 --touch --dark \
    --click app.toolbar.add --type "Buy milk" --key Enter \
    --wheel app.list 600 --read app.list.scrollY --shot phone.png
```

To look at the app **where it is served** — the dev server's page, with its own address,
cookies and service — give its address instead of (or as well as) the file:
`npx declare-look --url http://127.0.0.1:8200/my-apps/shop/shop.declare --shot served.png`.
Every action works the same there; no browser script of your own is needed.

The actions — `--click PATH`, `--click-at PATH X,Y` (a point inside it, from its top-left: a
step of a drawn scale), `--drag PATH DX,DY`, a drag a step at a time — `--press PATH [X,Y]`,
`--move DX,DY`, `--release`, with `--shot` and `--read` between them seeing it in progress —
`--wheel PATH DY`, `--pinch PATH SCALE` (two
fingers spread to SCALE, or drawn together below 1), `--type TEXT`,
`--key NAME`, `--wait MS`, `--read PATH.ATTR` (printed as `path.attr = value`; any property
past the view reads too, `app.col.childViews.length`), `--call 'PATH.METHOD(ARGS)'`
(arguments as JSON) and `--set PATH.ATTR=VALUE` to set up a state, and `--shot FILE` — run
in the order written, and each may repeat; a run that goes well prints only what it was asked
for; `--console` prints what the
page writes to its console, and `--help` says it all with examples. It runs as rung 5 — the
same browser and reporting. Motion is run to rest once the page opens and after each action,
so a read or a picture shows where things land rather than a spring mid-flight;
`--no-settle` takes them as they are. A picture shows no scrollbars, as on a Mac or a phone;
`--scrollbars` draws the classic ones. Anything more (polling a live feed, a check to keep)
is an assert script, below — and it stays behind as a test.

## Writing an assert script

`--assert` takes a module whose default export receives `{ drive, expect, page }` (throw to
fail the rung). `drive` and `expect` are the vocabulary: everything a check of a flow needs
is in them, and there is no reason to build a browser harness of your own. `page` is the
browser page the app is loaded in, for the rare question they do not ask — a computed style,
what holds the browser's focus; `declare-look --js` is the same door for a one-off question.
Its scrollbars are real ones, the classic bar Windows and Linux draw, so a script can grab a
thumb with the page's mouse and drag it as a person would.

**A live service remembers.** A script that talks to a running service changes it: the seats
it bought are sold the next time it runs, and a script that picks a fixed seat then fails for
reasons that are not the program's. Write a script to take what is available now, reset the
service if it offers a way, or answer from files with `--fixtures <dir>`. A run reports the writes
it sent, and a run that fails after earlier runs wrote to the same service says so.

A script runs on a laptop-sized window by default. To run it on another device, export one:
`export const device = { width: 390, height: 844, touch: true }` — the app loads once, on it.
`drive` and `expect` drive the app by **view path**, never by DOM selector. A path names
members (`app.toolbar.add`), a replicated row by its index (`app.list.3`), or a view by what
it says — its label, accessible name or text (`app.tabs.Settings`, quoted when it holds a dot
or a space: `app.menu."Save As…"`). A press is a person's: a view below the fold is scrolled
into sight first, and a press on a view something else covers fails, naming what it would
have reached, rather than landing elsewhere in silence.

```js
export default async ({ drive, expect }) => {
  await drive.click("app.dock.row.calIcon");
  await drive.settleMotion();
  await expect.visible("app.wins.0");
  await expect.approx("app.dock.row.calIcon", "width", 72, 1);
};
```

**Time in a check is the check's.** The page's timers run on a virtual clock: a delay in
the program (`afterDelay`, a tooltip's wait, a press-and-hold's half second) passes only when
the script says time passes — `drive.wait(ms)` advances it by exactly `ms`, a frame at a
time, **without waiting `ms` of real time** (a 6-second wait takes a fraction of a second),
and `drive.settleMotion()` runs motion to rest frame by frame, carrying the timers with it.
What runs on the **world's** clock is untouched by both: a service whose own schedule sends
a message in six seconds, a socket's timed frames. To wait for one of those, wait in real
time — `drive.waitReal(ms)` — and the page catches up on its clock after. Holding the mouse down for 800 ms of real time fires no
hold; `drive.hold(path, 800)` does. What a press hands to the next frame (`afterDelay(0, …)` — a
`Menu` passing on its choice) has run before the next step, as it has for a person; and a
native scroll the program starts (a smooth `scrollIntoView`) lands within a `drive.wait`. A
failed `expect` says when timers are still waiting, and `drive.wait(ms)` is what runs them.

**On a touch device the press is a finger.** After `drive.device({ …, touch: true })` (or
`declare-look --touch`, or a state's `touch: true`), every `click`, `clickAt`, `drag` and
`hold` sends touch events: there is no hover, a drag inside a scrolling pane scrolls it
unless the view claims the gesture, and a tap is what a finger's tap is. A mouse in a
phone-sized window is not a phone, and a check made with one passes what a finger fails.
A finger is also not a point: a browser moves a tap onto a control within a finger's reach,
so a tap a few pixels from a pinned button is the button's. A press whose point another
control covers — or, on touch, sits within a finger's width of — is refused, naming that
control, rather than made. It is asked as a real press is routed: a view that takes no
presses (no handler, link, tip or scroll axis) is not in the way, so a row's box over the
controls it holds blocks nothing. And a press waits for its target to hold still — a view
still moving (a native smooth scroll, a scroll landing a frame late) is pressed where it
comes to rest, and one that never settles is said.

**A view out of reach is scrolled to as a person scrolls to it.** A press on a view off the
window, below its pane's fold, or under a bar pinned to the window's foot first swipes —
a finger on a touch device, the wheel otherwise — through the browser's own gesture
input, so the page scrolls natively and asynchronously, as it does for a hand. The swipe
starts where the scroller meant is under the finger (on the page, not on a list inside
it); after each one the driver waits until the platform says the scroll is over, then
looks again. A view no swipe brings in is said with what the swipes did. Nothing writes a
scroll offset or asks the program to scroll. (The platform's own processes, such as the
user's scroll coming to rest, keep real time; only the program's time is the driver's.)

| call | what it does |
|---|---|
| `drive.click(path)`, `drive.drag(path, dx, dy)`, `drive.wheel(path, dy, dx?)` | a press, a drag, a wheel turn on the view, as a person makes them |
| `drive.press(path, x?, y?)`, `drive.moveBy(dx, dy)`, `drive.release()` | a drag a step at a time: the pointer goes down on the view (at a point inside it, else its centre) and stays down while `moveBy` moves it, so `expect` and pictures can look at the drag in progress — the ghost, the target lit — before `release` drops it |
| `drive.clickAt(path, x, y)`, `drive.hold(path, ms?)` | a press at a point inside the view (from its top-left); a press held `ms` (default 600) of the program's time, then released — what `onHold` answers |
| `drive.pinch(path, scale)` | a pinch about the view's centre to `scale`: two fingers on a touch device (`onPinch…` runs), a trackpad pinch otherwise (`onWheel` runs with `e.pinch`) |
| `drive.reveal(path)` | the view swiped into sight, as above, and nothing pressed — for a picture or a read of something below the fold |
| `drive.device({ width, height, touch })` | the page becomes that device and the app loads again on it — a phone is `{ width: 390, height: 844, touch: true }` (to start on it, export `device` instead) |
| `drive.requests()` | the requests the program has sent so far — its data sources and streams, not the page's own files: `{ method, url, path, body, status }` each, the body parsed when it is JSON |
| `expect.request(method, path, { count?, body? })` | the program sent that request: `path` a prefix or a RegExp, `count` how many times, `body` the fields it must carry — failing, it lists what was sent |
| `drive.key(name)`, `drive.type(text)`, `drive.tab(n?)` | keys, to whatever has the focus; a chord is written with `+`: `"Shift+Tab"`, `"Meta+Z"` |
| `drive.selectAll(path)` | focus the text field and select everything in it, as select-all does before typing over a value |
| `drive.set(path, attr, value)` | an assignment, as a handler's write |
| `drive.wait(ms)` | exactly `ms` of the program's time, run frame by frame — not `ms` of real time; what the program asked for in the meantime (a request, a frame) is waited for as it lands |
| `drive.waitReal(ms)` | `ms` of **real** time, then the program's clock catches up — for what runs on the world's clock: a service's timed messages, a socket's schedule |
| `drive.settleMotion(maxMs?)` | motion run to rest, frame by frame; loops that never end (`repeat = { Infinity }`, a `Time`) do not hold it |
| `drive.settleData()` | the network gone quiet |
| `expect.attr(path, attr, expected)`, `expect.approx(path, attr, expected, tol?)`, `expect.text(path, contains)` (the view's text, or a row's or card's: all its visible descendants' together), `expect.visible(path)` (shown: its own `visible` and every view's above it, with a size — failing, it names what hides it), `expect.hidden(path)` (a path that names nothing fails), `expect.exists(path)`, `expect.count(path, kind, n)`, `expect.equal(a, b)` | assertions: each fails the rung with what it found |
| `expect.explain(path, attr)` | why an attribute holds its value — an assertion about structure, not a number |
| `expect.traceStart(n?)`, `expect.trace()`, `expect.traceText()` | the runtime's own record of what it did |

`page` is there for anything else. More on `explain()` and the trace is in
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
| `touch` | `boolean` | a touch device: the route's presses are fingers (see above) |
| `route` | `async ({ drive, expect, page })` | drive the app INTO this state before capturing — clicks, settles, anything an assert script can do; a route that scrolls the page is captured where it scrolled to |
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
**`drive.attr(path, name, expected)` is the real check** for any attribute —
including formula-valued ones. It reads `find(path)[name]` live inside the page
and falls back to `explain()`, where `inspect().attrs` carries only *written*
attributes and reports a formula attribute as absent. To take a value **into** the
script rather than assert one, go through the page yourself:
`drive.page.evaluate((p, a) => window.__declare.find(p)[a], path, name)`.
`evaluate()` returns an Inspector **transcript object** that serializes to `{}`,
so read values that way too, never by JSON-ing a transcript; and a
`drive.page.evaluate` callback must **`return null`, never `undefined`** — an
undefined return fails the rung as an anonymous page error indistinguishable
from a crash.

## Running the ladder across the corpus

Two suites, split at the browser boundary — and one more split by *subject*, below:

| command | what it climbs | cost |
|---|---|---|
| `npm test` | everything that tests the SOURCES, plus rungs **1–4** for every app and library class | seconds for the first two dozen files, no derive needed |
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
