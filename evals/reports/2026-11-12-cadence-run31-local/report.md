# Cadence run 31: Opus 5.5, Declare, on the local tree

Built on the local working tree at 3bc519f9, plus the uncommitted rename release (batches
A–C2, `identityKey`) and the fixes from Venue 31/32, Ledger 5 and 7GUIs 2. **11.3 min, 63
turns, clean**: the agent delivered a working app, and the deep audit found no refusal of
correct code and nothing laid out wrong by the platform. Cadence has no hidden acceptance.
The app was checked by the agent's own two assert scripts, and by the audit's use of it on
desktop and phone. Timing record: `evals/timings/2026-11-12-cadence-run31-local.txt`.

## Figures

| | Run 28 | Run 29 | Run 30 | **Run 31** | React 1 |
|---|---|---|---|---|---|
| time | 15.0 min | 19.0 min | 16.4 min | **11.3 min** | 15.4 min |
| turns | 74 | 96 | 73 | **63** | 63 |
| lines of code | 1,118 non-blank | 1,176 non-blank | 1,174 non-blank · 972 without comments | **1,007 non-blank · 845 without comments** | 2,943 |
| output tokens (thinking) | 76.1k (26.6k) | 98.8k (41.9k) | 89.0k (36.2k) | **62.3k (19.1k)** | 89k |
| phases: reading · writing · checking | 4.8 · 2.0 · 8.2 | 5.3 · 4.4 · 9.3 | 6.6 · 2.3 · 7.5 | **3.8 · 2.4 · 5.1** | |
| tool · model time | 2.6 · 12.4 | 3.0 · 16.0 | 2.2 · 14.2 | **1.8 · 9.6** | |
| looks · verifies | | | 9 · | **5 · 13** | |

This is the fastest Cadence run so far, by 3.7 min over run 28. It is one run, though. A second
run on the same tree would show whether the gain is the platform or variance.

**Where the time went.** Most of the 2.8 min saved in reading went on the model's turns after
`declare-help`: 5.30 → 2.44 min (median 33 s → 4 s). The checking phase saved 2.4 min for
three reasons:
- the zero-width `columns` cell, silent in run 30, is now a named finding that one look fixed;
- there was no platform detour (run 30's `fontFamily = null` rendered Times);
- each assert script passed R5 on its first run.

## What it built

A year-of-training log in two files:
- a drawn year surface that pans and pinches, with a range switch;
- a Today view with figures;
- a one-tap phone entry form;
- a session sheet showing where the session stands and a scatter of similar sessions.

The effort and sport choices are `ChoiceItem`s in `ChoiceControl`s, which the 4032 warning
led it to. Screenshots are in `audit/use-*.png`.

Defects a person would hit:
- **The figures count up from 0 on load.** That breaks the brief's §6 restraint ("moves for no
  reason"). Run 30 used `arrive()` and avoided it. The agent didn't read guide 21, which
  teaches it. This is an agent choice, not a doc gap.
- **Colliding axis labels.** On the desktop "All" range the month labels run together
  ("JAN 2026FEB"; `audit/use-desk-all.png`).

## The deep audit

The repros are in `audit/` and were run against the local tree.

| min | What it met | Verdict | Repro |
|---|---|---|---|
| 6.3 | `draft: object = ({})`, DECLARE1000, which suggests `{ ({}) }` | Its code. **Message defect M1**, see 6.4. | `r1-bare-paren` |
| 6.3 | `padding = [0, 0, { … }, 0]`: rewritten before the compiler reported it | Not met. **Latent message defect M3**: "an inset is four numbers" when the list *is* four. | `r1-brace-in-array*` |
| 6.3 | `accessibilityRole = img`, DECLARE2000, listing the roles | An ARIA habit; correct refusal. | `role-img` |
| 6.3 | `App.scale is an attribute`, DECLARE2000 | A fair collision (N1). | `scale-child` |
| 6.4 | DECLARE1002 "redundant parentheses … `{ {} }`" on the `{ ({}) }` that DECLARE1000 had just prescribed | **M1: the two messages contradict each other.** | `parens-hint` |
| 6.4 | R4: "InkButton/Choice.width is only its padding … (a Spacer on each side centers it in a row)" | Its code; correct finding. | `center-label-1` |
| 6.9 | Five "flexes, but … is as wide as its children" findings after following the Spacer advice | **M2: the suggested fix cannot work in the content-sized box the finding names.** It is the second Cadence run in a row with this loop. | `center-label-2-spacers`, `-3-plain` |
| 6.4 | DECLARE4035, 4032, 3005, 4025 | Correct. 4032 → ChoiceControl in one pass. | `warnings` |
| 7.2, 10.8 | The `stats` row overflowing on the phone (376 or 360 px in 350) | Its layout; correct findings. | — |
| 7.6 | 10 controls under 44 × 44 | Correct; it moved them to a grid of columns. | — |
| 8.3 | `class Field`, DECLARE5000, suggesting `CadenceField` | A fair collision (N2). It renamed the class `Scatter`. | `field-class` |
| 8.5 | "feel.0 (and 9 more) is 0 wide: in a `columns` layout a child takes its cell's width only with `flexes = true`" | Its own deletion of `flexes`. Run 30's silent zero width is now an exact finding. | `columns-cell` |
| 11.1 | Port 8200 taken | Environment (the user's main tree is on 8200). The message was right. | — |

DECLARE7001 appears in the stream only inside docs it read. The dev server's "death" in the
account was `finish.sh` stopping it after the build ended (`dev.log`: "stopped on SIGTERM").

**Platform bugs: none.**

**Message defects:**
- **M1.** DECLARE1000's suggestion (`runtime/src/parser.ts:1353`) is then flagged by
  DECLARE1002. Fix: build the suggestion from what was written, with the outer parentheses
  dropped, and pin it so the suggestion is free of DECLARE1002.
- **M2.** The centred-label finding (`placedFromParentMessage`, `runtime/src/errors.ts:213`)
  offers Spacers in a box sized by its content, where they have no room to share. The fix
  that works goes unmentioned: drop `x = center`, and equal padding centres the label. Fix:
  reword it to "give X a width; or, to stay as wide as its content, remove `x = center` —
  its padding places the label". Drop the Spacer clause.
- **M3 (latent).** The inset/radius shape check (`runtime/src/check.ts:763`,
  `insetOrRadiusShape`) gives the wrong count for a list of the right length that holds a `{ }`.
  It should give the "write the whole list as a `{ }`" sentence that an `array` slot gives.

**Tool friction (minor).** The verify verdict line says only "FAILED at R1", with no cause.
The agent had filtered the output with `grep`, cut off the DECLARE5000 line, and needed one
more verify call (about 6 s). Putting the first error's code and line on the verdict line
would make that habit harmless.

**The driver** is clean: no false passes and no impossible inputs. This is the third Cadence
run in a row (29–31) to reach for a value read or comparison helper. It got there through
`page.evaluate(() => __declare.find(…))`, the documented route. That's a gap, not a defect.

**Reference (latent).** The `WrappingLayout.columns` reference example names a view `scale:`.
Every View holds `scale`, so the example doesn't compile. The fix is to rename the view in
`library/wrappinglayout.declare:79` and re-derive. The docs test doesn't compile library
reference prose, which is how it slipped through.

**Source reads.** There was one, `grep "theme SanFrancisco" library/*.declare`. It found
nothing (the themes live in `library/themes/`), and the next call, `declare-help
SanFrancisco`, answered fully. It was fair, not a doc gap.

### Clean bill

| Count | Verdict |
|---|---|
| Platform | **Clean.** Whether a `columns` cell should take its cell's width by default stays a design question: runs 29–31 all reached for it. |
| Tools, incl. the driver | **Not clean.** M1 and M2 were met (M2 recurring), and M3 is latent. The driver is clean. |
| Names | **Not clean by convention.** There were two fair collisions (N1, N2) and no silent misses. `scale` gives no suggested rename, while DECLARE5000 gives one. `names.py` doesn't count enum values, so `img` was missed by the ledger. |
| Reference | **Not clean:** one latent defect, the `scale:` example. No doc-gap reads. |

**Friction cost: about 1.5k output tokens and 0.3 min of 11.3 (≈2.5%)**, almost all of it the
Spacer loop. That compares with 7GUIs 2's 6.2k (8%), Ledger 5's 9.5k and Venue 32's 4.4k.
The account says layout loops cost "perhaps 15 minutes". The stream shows about 0.6 min for
both together.

## Fixed on the local tree after this run

Each fix was checked against the audit's repros. The targeted tests pass: unit,
diagnostics-hints, docs, library, eval-references, declare-help and verify-apps.

- **M1:** DECLARE1000's example is now `{ {} }`, which DECLARE1002 accepts (`runtime/src/parser.ts`).
- **M2:** the centred-label finding now says "give X a width; or, to keep it as big as its
  content, remove Y's x — its layout places it then, and X's padding sets where (equal
  padding centers it)". The Spacer clause is gone (`runtime/src/errors.ts`).
- **M3:** a four-item inset or radius list holding a computed item now gets the "write the
  whole list as a `{ }` constraint" sentence, at the item (`runtime/src/check.ts`).
- **N1:** a child named for an attribute now gets a suggested rename (`scaleView`), like DECLARE5000.
- **ARIA role spellings** (`img`, `textbox`, `progressbar`, `gridcell`, …) are answered with
  Declare's word: "'img' — ARIA's word; Declare's is image" (`VALUE_INSTINCTS`,
  `runtime/src/literal-parse.ts`).
- **The verify verdict line** names the first cause: "FAILED at R1: DECLARE2000 at line 2,
  col 5"; for R4–R6, the first message (`tools/verify.mjs`).
- **Reference:** the `WrappingLayout.columns` example's view is renamed `levels:`, and "at a
  desk" became "at desktop width" (`library/wrappinglayout.declare`). Derived files regenerated.
- **Ledger:** `names.py` now counts a refused keyword value as a miss, and an "ARIA's word"
  answer as a foreign hint.

Not fixed, queued: library reference fences are not compiled by any test.

## Is it idiomatic Declare?

`idiom.py`:

| | Run 30 | Run 31 | To-do |
|---|---|---|---|
| code | 972 lines | 845 lines | 843 lines |
| colour literals outside a theme | 0 | 0 | 1 |
| theme reads | 55 | 50 | 69 |
| States | 1 | 2 | 7 |
| branches on width or phone | 23 | 17 | 38 |
| flexes | 24 | 11 | 7 |
| browser scripts · page lookups | 0 · 0 | 0 · 0 | 0 · 0 |

Fewer `flexes` (24 → 11) and fewer width branches put it closer to the to-do app's shape. The
line-by-line idiom read wasn't done for this run. The audit covered behaviour and the
platform, not style.

## Names

The ledger (`names.py`) is below the account. It found 0 misses and 2 collisions (`scale`,
`Field`), both fair.

## The agent's account

Asked after the build, by resuming the finished session with read-only tools and the
standard questions (`impressions.txt`). It is pasted whole. Where the audit contradicts it, the
audit's reading is above.

# Building Cadence in Declare: an account for the people who make it

**First, a correction to my last message.** I said Cadence was running at `http://127.0.0.1:8201/...`. That was wrong as a lasting claim. The server did return 200 for the program once. After that, the background task that started it reported that it **exited with code 1**. I tried to read its log, but shell access is now disabled in this session, so I can't tell why it stopped or whether anything is serving. You asked me not to change anything, so I haven't restarted it. `PORT=8201 npm start` in `declarelang/` should bring it back. Port 8200 was already taken by another Declare dev server serving a different tree.

---

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`, then `task/brief.md` and `task/api/API.md`.
2. `skill/SKILL.md` and `AGENTS.md`.
3. `docs/declare.md`, all of it.
4. The four chapters the skill names, all of each: `01-what-declare-is`, `04-structure`, `05-run-and-check`, `06-layout`.
5. `apps/todo/todo.declare` and `todo-parts.declare`, all of both.

After that I only read what a part of the plan needed:
- `10-touch.md`: § Gesture claims and § Pan and zoom about the fingers.
- `14-data.md`: § Where data comes from, § Talking to a server, and § A form in a sheet.
- `18-overlays.md`: § Open as state, § Sheets and § Toasts.
- `12-text.md`: § Text through § Reusing a text style.
- A grep of `09-pointer-and-keyboard.md` for `keyBindings`, and a grep of `docs/operational/verify.md` for the `drive`/`expect` API table.
- `declare-help` for about twenty names: Sheet, Segmented, Stepper, App.touchFirst, App.safeTop, App.safeBottom, DrawContext, Toast, DatePicker, HTMLText, PinchEvent, WheelEvent, Time, View.claim, RichText.textStyles, "theme tokens", SanFrancisco, `ResponsiveLayout --all`, `ChoiceControl --all`, ChoiceItem.
- `declare-help map` on `marketmap.declare`, its `StageTile.draw` (about 100 lines), and a grep of `calendar.declare` for Spring and drag handlers.

**What I skipped, and why.** The skill says "Then stop reading", so I did. I never read:
- `02-notation` or `03-constraints`.
- `11-paint-and-themes`; I copied the theme pattern from the to-do app instead.
- `15-schemas`, `16-collections`, `17-your-own-views`, `21-motion`, `22-time`.
- The tracker, or the calendar as a whole.

Some of these would have helped:
- **`21-motion`** may cover sprung display numbers; see (g).
- **`17-your-own-views` § Custom drawing** would probably have told me how text in `draw()` is meant to get its font.
- **`11-paint-and-themes`** probably covers whether `draw()` can read a font from the theme.

**What taught me the most:**
1. **The to-do app**, by a wide margin. It showed me several things I then used:
   - a theme spread over a preset;
   - `Control` with `press()` at the use site;
   - a `State` for looks;
   - a Spring per row;
   - a `Sheet` with `shown`/`commit` and contents built on `exists = { … present }`;
   - a `fabDock` with `ignoreScroll`, `y = end` and `pointerEvents = "none"`;
   - computed defaults in `AddForm`.

   Cadence's structure is largely the to-do app's structure.
2. **The `zoomAbout` fragment in `10-touch.md`**, which I adapted almost line for line.
3. **The "fetch() settles first" and "writing to one record" passages in `14-data.md`**, which gave me the shape of the `Sessions` write sources.

**What was missing or misleading.** Nothing I read was wrong. Three things were absent from the reading list:
- **How to make a number travel.** I invented the pattern myself.
- **How text drawn in `draw()` should pick up the app's font.**
- **That `Field` is a library class name.** I only learned it from a refusal.

The skill's "read first" set was the right size. I could hold it, and it was enough to write a program that compiled after five rounds of small fixes.

---

## (b) Expressing what I wanted

**Where Declare fit my intent closely:**
- **Derived state.**
  - This week's sessions, count and minutes, the streak, the week's shape, the period on the year chart and its hardest session are all attributes with `{ }` defaults, or methods on `Sessions`.
  - Adding or deleting a session changed all of them with no code of mine. The first flow script proved it: the count went 2→3→2 and the streak 2→3→2.
  - This is the part that felt most unlike React, and the brief's "nothing is stale" came for free.
- **Pan and zoom.** Two numbers (`back`, `span`), each with a Spring, and a `draw()` that reads them.
  - The hand writes the value and its target together; a range button writes only the target.
  - It was short and it worked the first time it ran.
  - Choosing `back` (days before tomorrow) rather than an absolute start was my own call made before writing. A computed default like `start = { todayNum - 55 }` with a Spring on it worried me: when the data arrived, the spring might sweep from day 0. I never tested whether it would, so I'm unsure whether that worry was real.
- **`ResponsiveLayout`.** One plan for a row on a desk, another stacked on a phone. Two lines for the whole arrangement.
- **`Sheet` with `edge = { app.wide ? "end" : "bottom" }`**: one form, two presentations.
- **`ChoiceControl`/`ChoiceItem`** replicated over a dataset, once the accessibility warning sent me there.
- **Request sources inside a `DataSource` subclass**, aimed with `draft`/`target` attributes, with replies placed into the local records.

**Where I worked around it:**
- **A line mixing huge figures with small words** ("4 sessions · 3h 40m"): HTMLText with a `textStyles` map, the HTML built by string concatenation inside constraints. It works, and `expect.text` read it back exactly. But writing `"<span class='Fig'>" + n + "</span>"` inside a reactive language felt like going backwards.
- **Numbers that travel**: a declared shadow attribute plus a Spring for each figure. That is six extra attributes and six Springs on the App.
- **Text inside `draw()`**: a hard-coded `d.font = "600 12px -apple-system, system-ui, sans-serif"`, which duplicates the App's `fontFamily`.

---

## (c) The first time it ran

These are from the first desktop and phone screenshots (`declare-look … --shot`):
1. **Phone: the period stats ran past the right edge.** The `declare-look` run reported it as a layout finding, and the screenshot confirmed it.
2. **Desktop chart: a month label collided with a week number** ("AUG" and "3" fused as "AUG3"). I saw it in the screenshot.
3. **Session sheet: "Harder than 0% of them"**, which reads badly. I saw it in the screenshot.
4. **Log form: the effort cells were 31.8 px wide**, which `declare-look` reported as too small for a finger. In the screenshot, the effort bar's partial fills also overlapped the numerals.
5. **At the one-year span, the chart was hundreds of hairlines.** You couldn't see a season, which is the whole point of the year view. I saw it when I pressed 1Y.
6. **The live session block used the hot colour.** I noticed it while looking at the desktop picture: it broke the brief's "colour is earned", because hot was meant to mean effort.

Nothing failed to boot after R4 passed, and nothing crashed at runtime. Every problem was visual or about copy, and each one came from a picture or a layout finding, not from reading the source.

---

## (d) Every refusal and surprise

Each item gives what I wrote → what the platform said → what I changed → my judgement now.

1. **A record default written bare.**
   - Wrote `draft: object = ({}),`.
   - R1 said `DECLARE1000`, "expected a value, got '('".
   - Changed to `{ ({}) }`. A later hint (`DECLARE1002`, redundant parentheses) led to `{ {} }`.
   - **My code was wrong.** `declare.md` §2 says it plainly. The message names the fix.

2. **A brace inside a bare list.**
   - Wrote `padding = [0, 0, { app.wide ? 36 : 24 }, 0]`.
   - I fixed it in the same edit as item 1, before the compiler reported it. R1 showed only the first error.
   - **Unsure.** I don't know whether it is an error, or whether R1 would have listed it with the other. `declare.md` §12 says "all independent errors in a phase are reported together"; a parse error may be the exception.

3. **An HTML role name.**
   - Wrote `accessibilityRole = img`.
   - `DECLARE2000` listed every allowed role.
   - Changed to `image`.
   - **An HTML habit; my fault.** The message was excellent.

4. **A dataset named `scale`.**
   - Wrote a dataset `scale: Dataset { … }` on the App.
   - "App.scale is an attribute — a child may not take an attribute's name" [DECLARE2000].
   - Renamed it `levels`.
   - **My fault.** It's easy to hit, because `scale` is a natural data name. The message was clear.

5. **A centred label in a pill sized by its content.**
   - `InkButton` and `Choice` each held a `TextLabel [ x = center, … ]` with padding and no width.
   - R4 said "InkButton.width … is only its padding — … TextLabel places itself in it (x = center or end), which counts it out … Give InkButton a width, or let its layout place TextLabel (a Spacer on each side centers it in a row)."
   - I switched to `SimpleLayout` with Spacers.
   - **My fault**, and the message explained exactly why, consistent with `06-layout`. See item 6.

6. **Spacers in a pill with no room to share.**
   - After the Spacers went in, five findings said "app.page.bar.2.0 flexes, but app.page.bar.2 is as wide as its children, so there is no room left over to share".
   - I gave the button `width = 220`, and made the range and day choices `flexes = true` inside full-width `ChoiceControl`s.
   - **A small circle**: the first message's suggested fix led straight to the second finding.
   - For a content-sized pill, the right answer was simply dropping `x = center`. For a pill that flexes, Spacers are right. The first message offered "give it a width" or "Spacers" but not "drop `x = center`" — which, for my content-sized pills, would have been the simpler fix.
   - It cost two verify rounds.

7. **Radios outside a group.**
   - `Choice extends Control` with `accessibilityRole = radio`, each use site writing its own `on` and `press()`.
   - Warning `DECLARE4032`: "Choice is a radio outside a RadioGroup … make them ChoiceItems, the direct children of a ChoiceControl."
   - I rewrote all four choice groups onto `ChoiceControl`/`ChoiceItem`. The effort cells became `ChoiceItem` with `choice = { "" + level }`.
   - **The platform was right, and taught me a class I hadn't met.** The result is shorter and better.

8. **A label with no role.** The week shape had `accessibilityLabel` but no role: `DECLARE4035`. Added `accessibilityRole = image`. **Fine.**

9. **A small text field.** A `TextInput` at `fontSize = 14` drew `DECLARE3005` about iOS zooming the page. Changed it to 16. **A useful warning I wouldn't have thought of.**

10. **Nested choices.**
    - `rangeId` written as four nested `? :`.
    - `DECLARE4025`.
    - Replaced it with `spanOf(id)` and a `.find` over the ranges dataset.
    - **The lint was right**: a lookup in data reads better.

11. **A library class name.**
    - Wrote `class Field [ … ]` for the scatter plot.
    - `DECLARE5000`: "'Field' is a library class — a class of the program can't take its name; rename yours, as 'CadenceField'".
    - Renamed it `Scatter`.
    - **Neither side was wrong.** But the global class namespace is a trap: names like `Field`, `Card` and `Window` are natural app names.

12. **Effort cells too small for a finger.**
    - 10 effort cells, each `flexes = true`, in a `SimpleLayout` row.
    - Finding: "10 control(s) smaller than 44 × 44 … feel.0 31.8×60".
    - Moved to `WrappingLayout [ columns = { app.touchFirst ? 5 : 10 } ]`. At the same time I removed `flexes` from `EffortCell`, which was **my mistake**.
    - The next finding: "feel.0 (and 9 more) is 0 wide: in a `columns` layout a child takes its cell's width only with `flexes = true`." Restored it.
    - **The message was precise.** That `columns` needs `flexes` on each child wasn't obvious to me, but the to-do app does the same (`SmartTile [ … flexes = true ]`), so it was there to see.

13. **Period stats overflowing on a phone.**
    - A `SimpleLayout` row of three stats at 40 px.
    - "stats's children need 376 across and it has 350".
    - First I shrank the font to 34 px. After a pinch made the duration longer, it came back: "need 360 across and it has 350".
    - Switched to `WrappingLayout`.
    - **My fault** for fitting to one set of data. It's notable that R5 asks the layout questions after every step in the script; that is the only reason I caught the second case.

14. **Behaviour that wasn't what I meant:**
    - **Ghost weekly bars at the default 56-day span.** The cross-fade ramp was `(span - 50) / 90`, so 56 gave 7% opacity. Changed it to start at 70. My arithmetic.
    - **Month and week labels colliding, and a label clipped at the right edge.** Added `dom > 4` and `x > w - 40` guards. My drawing.
    - **The copy "Harder than 0% of them".** Replaced it with `standingLine()` phrases.
    - None of these were the platform's doing.

15. **The dev server.**
    - Port 8200 was taken: "port 8200 is already taken by another Declare dev server, serving a different tree."
    - I started one on 8201. It answered once, then exited with code 1. I don't know why.
    - **Unsure** whether that was the platform or my environment. I reported it as running when it wasn't, which was my error.

---

## (e) Verifying it

**`declare-verify`, rungs R1–R4.** About a dozen runs, each a few seconds. They caught items 1–13, everything except the visual problems. Every message named its fix. Two things were especially useful:
- The note listing classes "not built at boot, so not checked here".
- The R5 note that my script "sent 2 writes to the live service … --fixtures <dir> answers requests from files instead". I hadn't thought about that, and it is why the service's id counter has moved on: the next session saved will be `s0250`, not `s0249`. **I should have used `--fixtures`.**

**`declare-look`.** Ten or so screenshots: desktop, phone, dark, the session sheet, the log form, and the year after a drag, a pinch and a range press. They caught every problem in (c).
- `--read app.back` and `--read app.span` after a drag or pinch let me check the gesture arithmetic numerically. Pinch 0.4 took the span from 56 to 140, as expected.
- One check I ran was meaningless: `--wheel … 0` turns the wheel by nothing.
- I never verified mouse-wheel behaviour on the chart.

**`--assert` scripts (R5):**
- **`log-flow.mjs`** checks:
  - the week line's exact copy, `2 sessions · 1h 24m`;
  - logging a run changes the count and streak;
  - the `POST` was sent, with its body;
  - deleting it reverts everything.
- **`browse-flow.mjs`** checks drag, pinch, a range button, opening a session, Edit prefilling the form, Cancel, and that no writes were sent.

The `drive`/`expect` API was easy to use. Paths by text, such as `'app.entry."Save"'`, worked first time. I fell back to `drive.page.evaluate(() => window.__declare.find("app").back)` because I didn't find an `expect` for "greater than". There may be one I missed.

**Verdict on the tools:** they served me very well. The diagnostic quality is the best I've met in any UI stack. The one weakness is that they are honest about it: rungs 1–4 can't see anything a person sees only after pressing.

---

## (f) Confidence, part by part

- **Today's week line and streak copy: high.** Checked by assertion at rest. While the numbers spring, intermediate values show; at rest they're exact. One caveat: on load every figure counts up from 0. That is motion which doesn't show a change in the data, and a strict reader of §6 ("moves for no reason") could fault it.
- **The week's shape: medium-high.** Bars are on a fixed 120-minute scale with the effort colour. A day over two hours clips at full height.
- **The last session and the live session: medium.**
  - The live block refreshes from the service every 5 s, and the elapsed clock counts between reads. I saw both in screenshots.
  - **Untested:** what happens when the service reports no live session, i.e. that `session?: Live` accepts null or absent and the block hides.
- **The year as a surface: medium.**
  - Drag, pinch, the range buttons and tap-to-open were driven in headless Chrome.
  - **Not tested on a real phone:**
    - whether `claim = x` lets vertical page scrolling coexist with a horizontal drag;
    - whether a tap on the chart is ever eaten as a drag start.
  - **Mouse wheel:** with `claim = x`, a vertical wheel goes to the page, so a mouse user with no trackpad can zoom only with the range buttons, the 1–4 keys, and tap-to-open. I changed the hint copy to stop promising "scroll to zoom".
- **A session: medium-high.** Edit was exercised as far as Cancel. **Never exercised:** saving a correction (`PUT`), and undoing a delete. Undo re-posts the session, so it comes back with a new id.
- **Adding one: medium-high on desk and phone layout; medium on edge cases.** The form saves with one tap. **Untested:**
  - that `DatePicker`'s `max` refuses a future date;
  - that the inline problem line appears;
  - that `Mod+Enter` saves;
  - the toast when the server refuses a session.

  On a phone, focusing the note brings up the keyboard. I haven't seen how the sheet behaves then.
- **Look: high that it reads as intended in screenshots.** The type ratio is about 11× on desktop and 7× on a phone. Hot colour appears only on effort ≥ 7.

**Where I'd expect a tester to find problems:**
1. Touch arbitration on the chart on a real phone.
2. Wheel and zoom expectations on a desktop with a mouse.
3. The count-up animation on load.
4. The empty-live case.
5. A correction that moves a session's date.

---

## (g) Gaps I worked around

1. **Figures that travel.**
   - Wanted: something like `Text [ text = { fmt(app.weekMinutes) } ]` that tweens a number when it changes.
   - Looked: `declare-help Spring`, and the calendar's use of springs. I did not read `21-motion` or search `declare-help` for "tween".
   - Did instead: a shadow attribute plus a Spring per figure.
   - **Judgement: unsure.** The platform may well have a neater idiom I didn't find. If it doesn't, a one-word way to spring the number a text shows would be a real convenience.

2. **Mixed-size runs from live data.**
   - Wanted: styled runs in a `Text`, built from values.
   - Looked: `12-text`, which says "A `Text` cannot bold one word; that is what rich text is for."
   - Did instead: HTMLText with `textStyles`, and HTML strings built in constraints.
   - **Judgement: the platform offers it.** But only through markup strings, and that is the one place my code stopped looking like Declare.

3. **The app's font in `draw()`.**
   - Wanted: text in a drawing set in the provided family.
   - Looked: nowhere beyond `DrawContext`'s member list.
   - Did instead: a hard-coded CSS font string.
   - **Judgement: probably there and missed.** `17-your-own-views` § Custom drawing is where I'd look next.

4. **Elapsed time between live polls.**
   - Wanted: "seconds since this source last loaded" as a fact.
   - Did instead: `onLoad() { app.liveAt = app.clock.now }` plus a `Time [ tick = second ]`.
   - **Judgement:** this is close to the "flag set when data arrives" pattern the drift check warns against. A `DataSource` might expose when it loaded; I didn't check.

5. **"The sport they always do at this hour."** The data has no times of day, so I used the weekday. This is a gap in the data, not the platform.

6. **The live dot's beat.**
   - Did: `opacity = { app.clock.second % 2 == 0 ? 1 : 0.3 }`.
   - **Judgement:** an `Animator` with repeat is probably the intended tool. I didn't look.

---

## (h) Changes of direction

| What it was first | What it became | When | What made me change |
|---|---|---|---|
| A window with an absolute `start` | `back`/`span` relative to today | Before writing the first line | My own second thoughts about a Spring driving a computed default |
| `Choice extends Control` with `on`/`press()` per use site | `ChoiceItem` children of `ChoiceControl` | Second verify run | Warning `DECLARE4032` |
| Labels centred with `x = center` | `SimpleLayout` + Spacers, then fixed widths or flex | Verify runs 2–3 | The R4 boot finding, then the Spacer findings |
| One row of 10 effort cells, filled by height | A 5-column grid on touch, full-height fills | After the first form screenshot | The tap-target finding and the overlap in the picture |
| "Harder than X%, longer than Y%" | Phrases ("One of your easiest, and a usual length") plus the scatter | After the first sheet screenshot | Seeing the copy |
| A bar per session at every span | Cross-fade into a bar per week, with the hard minutes in hot | After the first 1Y screenshot | Seeing it run |
| Tapping the chart always opens the nearest session | Zoomed out, a tap opens a 42-day stretch | Same time | Second thoughts: tapping a week bar should "pull it open", in the brief's words |
| Live block in the hot colour | Reversed out in ink | After the year screenshots | The brief's §6 "one accent that means something" |
| Stats in an x-row | Smaller type, then `WrappingLayout` | Two separate findings | Layout findings at R4, then at R5 |
| Hint "Drag · pinch or scroll to zoom" | "Drag · pinch · tap" | Late | My own realisation that `claim = x` gives the vertical wheel to the page |

---

## (i) The code, quoted

Each snippet is reconstructed from the session, with the exact message it drew.

```
draft: object = ({}),
```
> expected a value, got '(' — a value written bare is a literal; an expression goes in braces: { ({}) }, { (a + b) / 2 } [DECLARE1000] (line 218, col 21)

```
class YearChart [ width = 100%, height = 240, clip = true,
    accessibilityRole = img,
```
> YearChart.accessibilityRole expects an AccessibilityRole (one of none | button | … | complementary), got 'img' [DECLARE2000] (line 366, col 25)

```
App [ …
    scale: Dataset { { "levels": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] } },
```
> App.scale is an attribute — a child may not take an attribute's name [DECLARE2000] (line 808, col 5)

```
class InkButton extends Control [ height = { app.tap + 12 }, cornerRadius = { this.height / 2 },
    padding = [0, 24, 0, 24],
    label: string = "",
    …
    TextLabel [ x = center, fontSize = 17, fontWeight = bold, wrap = false,
        textColor = { provided("theme").paper }, text = { classroot.label } ]
    ]
// used as: InkButton [ visible = { app.wide }, label = "Log a session  N", press() { app.log() } ]
```
> boot: InkButton.width (app.page.bar.2) is only its padding — it takes its width from its children, and TextLabel places itself in it (x = center or end), which counts it out, so it hangs outside InkButton. Give InkButton a width, or let its layout place TextLabel (a Spacer on each side centers it in a row).

The same was reported for `Choice` at `app.page.body.year.ranges.0`.

Then the Spacer version:
```
    layout: SimpleLayout [ axis = x, align = center ],
    Spacer [ ],
    TextLabel [ fontSize = 17, … ],
    Spacer [ ]
```
> layout app.page.bar.2.0 flexes, but app.page.bar.2 is as wide as its children, so there is no room left over to share and it gets none. Give app.page.bar.2 a width (width = 100% is the room its parent gives it).

The same finding appeared four more times, for `ranges.0`–`ranges.3`.

```
class Choice extends Control [ … accessibilityRole = radio, accessibilityChecked = { on }, … ]
    Choice [ datapath = :items[], label = :label, on = { app.rangeId == :id },
        press() { app.showRange(:id) } ]
```
> warning: Choice is a radio outside a RadioGroup — a screen reader hears no "one of N", and the arrows do not move between the choices. … [DECLARE4032] (line 473, col 9)

```
rangeId: string = { Math.abs(app.spanTo - 14) < 1 ? "14" : Math.abs(app.spanTo - 91) < 1 ? "91"
    : Math.abs(app.spanTo - 365) < 1 ? "365" : Math.abs(app.spanTo - (app.totalDays + 4)) < 1 ? "all" : "" },
```
> warning: rangeId decides through 4 nested ? : choices … [DECLARE4025] (line 754, col 23)

```
class Field [ width = 100%, height = 120, rec: Session? = null, … draw(d: DrawContext) { … } ]
```
> 'Field' is a library class — a class of the program can't take its name; rename yours, as 'CadenceField' (the library's is used as 'Field [ … ]') [DECLARE5000] (line 557, col 1)

```
feel: ChoiceControl [ width = 100%, datapath = { app.levels.value }, …
    layout: WrappingLayout [ columns = { app.touchFirst ? 5 : 10 }, spacing = 6, rowSpacing = 6 ],
    EffortCell [ datapath = :levels[], level = :@, chosen = { classroot.effort } ] ]
// with EffortCell's `flexes = true` removed
```
> layout after tap app.dock.0: app.entry._body.0.feel.0 (and 9 more) is 0 wide: in a `columns` layout a child takes its cell's width only with `flexes = true`.

The step before that, with ten cells in an x-row:
> 10 control(s) smaller than 44 × 44, a finger's target: app.entry._body.0.feel.0 31.8×60, …

```
stats: View [ width = 100%, padding = [16, 0, 18, 0],
    layout: SimpleLayout [ axis = x, spacing = { app.wide ? 40 : 24 } ],
    PeriodStat [ … ], PeriodStat [ … ], PeriodStat [ … ] ]
```
> layout at the start: app.page.body.year.stats's children need 376 across and it has 350, so app.page.body.year.stats.2 runs past its end. …

After shrinking the type and spacing, and then a pinch to 0.25:
> layout after pinch app.page.body.year.chart by 0.25: app.page.body.year.stats's children need 360 across and it has 350 …

I went round in a circle twice: the Spacer pair, and the stats pair. Neither was hard; each cost one extra verify round of a few minutes.

---

## Overall

**Surprises:**
- **I never hit `DECLARE7001`, the constraint residue error,** despite heavy use of methods, closures and `reduce` inside constraints. The compiler read through all of it.
- **The accessibility warnings improved the design,** not just its labelling. `ChoiceControl` is better than what I wrote.
- **R5 re-asks the layout questions after every step.** That is what caught the overflow that only appeared after a pinch.
- **The verifier warned me about writes to the live service.**

**Good:**
- Diagnostics that name the fix.
- Derived state that actually stays derived.
- Springs as the whole motion model.
- `ResponsiveLayout`.
- Sheets as state.
- A ten-second loop: verify, then look.
- A to-do app good enough to be a template.

**Bad:**
- **Building HTML strings for mixed type** (pattern; small cost each time).
- **Boilerplate for travelling numbers** (one pattern, about 15 lines).
- **A global class namespace shared with the library** (one obstacle).
- **The dev server dying silently in the background** (one obstacle; cause unknown).
- **No obvious way to give `draw()` the theme's font** (one obstacle; possibly my own miss).

**How it differs from what I know, and what it reminded me of.** It isn't React: no render, no effects, no keys. It is closer to spreadsheet-style reactivity crossed with QML or Flex/MXML. The OpenLaszlo lineage shows, and SwiftUI's `@State` plus `.animation` comes to mind. Layout as a pluggable object with one decider per value is stricter than Flutter and clearer than CSS. Typed `{ }` TypeScript inside a declarative tree felt natural within an hour.

**Where I'd most want improvement:**
1. A first-class way to show a sprung number in a `Text`.
2. Styled runs bound to values without markup strings.
3. Telling the program apart from the library in names; at least, a list of reserved library names in the skill.
4. One more sentence in the content-sized-pill boot message, offering "drop `x = center`".
5. A built-in `expect` comparison for greater or less than, if there isn't one.

**The sharpest edge** was not one obstacle. It was a pattern: layout findings about rows sized by their content, which hit me four times across two problems and cost perhaps 15 minutes in all. Knowing one rule up front would have let me write it right the first time: in a box sized by its content, a child placed by `center` or by flex gets nothing, so give the box a width or let the content alone set it. That rule is in `06-layout`. I read it, but didn't apply it to my own pills.

**What I'd use it for:** dashboards and instrument-like apps, data surfaces that zoom and pan, and phone-and-desk tools like this one, where continuity and derived state matter. I'd also use it for apps an LLM writes and a person reviews, because the source reads as the design. I'd hesitate for content-heavy sites with many rich-text styles, and for anything that depends on mature third-party UI ecosystems.


## The names ledger

```
NAMES — eval-cadence-31: 0 missed name(s), 2 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)

COLLISIONS (min · held by · name)
     6 · attribute      · scale
     8 · library class  · Field

SUMMARY: 0 of 0 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
