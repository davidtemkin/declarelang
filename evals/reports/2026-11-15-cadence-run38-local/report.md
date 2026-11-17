# Cadence run 38: Opus 5.5, Declare, on the local tree, minimal

The second run of the minimal round ("it must build and start with no errors. Check that and
nothing more: do not drive it, script it, take screenshots of it or look at it in a browser").
**9.8 min, 48 turns, 60k output tokens** (26k thinking). Timing record:
`evals/timings/2026-11-15-cadence-run38-local.txt`.

## 1. The score

> **Rescored 2026-11-16: 9 of 9** (`drive-results-rescored.json`). DT ruled the reading of "this
> week" should not decide the score — the brief does not define it — and the drive now accepts
> Monday to today or the seven days ending today. The original score and its analysis follow.


**The hidden drive: 4 of 9**, as handed over (`drive-results.json`). The five failures are one
thing: "this week" never read as the drive expects (`never shown: 2 sessions · 1h 24m`). The
app shows "4 sessions · 4h 11m" (`drive-today_desk.png`): it counts **a rolling seven days**
(`between(todayN - 6, todayN)`, cadence.declare:764), where the drive counts Monday to today.

- **An audit probe, not a score:** with only those two lines changed to count from Monday
  (`todayN - weekdayOf(todayN)`), the same app passes **9 of 9**. Nothing else is wrong that
  the drive tests.
- **The brief** never defines the week in words; its scenario does ("opens it on a Monday
  morning, sees in one glance that last week was four sessions"), and every earlier Cadence
  run (33–37, light and standard) counted Monday to Sunday. The agent first intended Monday
  to Sunday and switched to a rolling week *on rereading that same sentence* (account, h4). A
  reading of the brief, not a platform matter, and not one the minimal level obviously causes:
  no check the agent could run would have told it which week the brief meant. Its account
  flags the choice itself (f): "A tester expecting calendar weeks will see different numbers."

**Seen running (added after the audit, at DT's request).** Both sheets overflow. The session
panel on a desk (`seen-desk-session.png`) runs past the sheet's right edge: the band, the
distribution strip and Delete are cut. The log form on a phone (`seen-phone-log.png`) runs past
the screen: Swim, every + button and effort 10 are cut. Both `SessionCard` and `Entry` set
`width = { app.wide ? 440 : parent.width }` inside a `Sheet`. On a desk the sheet is 420 wide
(the shot: it starts at x = 860 of 1280), so 440 cannot fit; why `parent.width` overflows on a
phone was not checked. Neither sheet is open at boot, so R4 never laid them out, and
the drive reads the accessibility tree, which the clipping does not change. Cadence 37
(standard) in the same states fits both screens. **This is the polish the minimal level gave
up.**

## 2. The comparison

| | 33 (light) | 35 | 36 | 37 (standard) | **38 (minimal)** |
|---|---|---|---|---|---|
| total | 11.6 | 17.5 | 19.2 | 13.6 | **9.8 min** |
| turns | 64 | 91 | 83 | 72 | 48 |
| output tokens (thinking) | 63k (21k) | 92k (35k) | 98k (42k) | 76k (26k) | 60k (26k) |
| reading · writing · checking | 4.1 · 2.4 · 5.1 | 5.7 · 2.9 · 8.9 | 5.1 · 5.0 · 9.0 | 3.4 · 3.9 · 6.2 | 5.5 · 2.4 · 1.8 |
| drive | 9/9 | 9/9 | 9/9 | – | 4/9 (9/9 with the week from Monday) |

- **Tokens:** 60k output, 76 fresh input, 214k cache writes, 5.7M cache reads; context
  **180k at the first app write, 221k at the end**.
- **Code:** 1,091 lines in 2 files, 785 without comments and blank lines (Cadence 37: 1,280 and
  927). **Download:** 217 KB gzip as a production build (Cadence 37, built today: 229 KB).
- **Source reads:** none. Verify ran 6 times (0.2 min), `declare-help` 7 times.

## 3. The refusals and warnings (each read in the stream; all named their fix)

1. **First verify, R1:** `'Stepper' is a library class — … rename yours, as 'CadenceStepper'
   (the library's is used as 'Stepper [ … ]')` [DECLARE5000]; the same for a schema `Window`;
   `accessibilityRole = img` → "ARIA's word; Declare's is image"; `anchor` declared anew →
   "View already has an attribute 'anchor'". All correct, all exact.
2. **Second verify:** `Stepper has no attribute 'what'` — the agent's `sed` rename missed a use
   site (`distanceStep: Stepper [`). Correct; its own slip.
3. **Warnings, each a real improvement:** DECLARE4026 — three `Choice`s that were one choice
   among several, with no "one of 3" and no arrows → rebuilt as `ChoiceItem`s under a
   `ChoiceControl` (four groups). DECLARE4032 — `EffortCell` a radio outside a group → the
   same. DECLARE4035 ×4 — labels with no role. DECLARE1002 — parentheses.

## 4. Findings for the platform (each reproduced)

1. **Guide 10's pinch example breaks its own rule.** § Pan and zoom about the fingers says
   "the point under the hand stays under the hand", and its `onPinch` computes the anchor from
   the *current* `e.x` against the start latched at the pinch's beginning. With the fingers
   moving from x = 400 to 600 at an unchanged span, the value under them goes from 120 to 130:
   the content stays while the hand travels. Latching the value under the fingers at
   `onPinchStart` (`grabAt = app.start + app.span * e.x / this.width`) and placing it under
   the current `e.x` keeps it there (120 → 120). The agent found this by reading and wrote the
   latched form. **A doc fix.**
2. **The collision with `Stepper` sent the agent round the library's own control.** DECLARE5000
   named the library class and suggested renaming the program's; the agent renamed, and built
   `Nudger` (a figure between − and + buttons, with `down()`/`up()` pass-throughs). The
   library's `Stepper` is that control — `value`, `min`, `max`, `step`, `format(v)`, the
   spin-button role — and the agent never asked about it. The message could say what the
   library's class is ("'Stepper' is a library class — a number changed a step at a time; use
   it, or rename yours"), so a collision becomes a lookup.
3. **A `ChoiceControl` over replicated `ChoiceItem`s works** (the agent was unsure): in a
   scratch program, a press on the fourth cell commits "4" and ArrowLeft moves to "3". Its
   screen-reader roles were not inspected here.
4. Its wish: a note in SKILL that library names are taken (run `declare-help <Name>` before
   naming a class). DECLARE5000 already catches each one, in one round.

## 5. Is it idiomatic Declare?

| | Cadence 37 | Cadence 38 |
|---|---|---|
| code | 927 lines Declare | 785 lines Declare |
| lines over 150 characters | 7 | 2 |
| colour literals outside theme declarations | 0 | 0 |
| theme reads | 76 | 60 |
| States | 10 | 1 |
| branches on width or phone | 20 | 22 |
| flexes | 11 | 14 |
| browser scripts · page lookups | 0 · 0 | 0 · 0 |

**Read line by line.** The shape is the one the standard runs have:

- **Data:** `Sessions extends DataSource` holds the history and makes every write through three
  child `DataSource`s (`create`, `update`, `remove`), each reply placed into the records, so the
  week, the streak and the year follow it. Typed: `Session`, `Draft`, `Live`, an `errorSchema`.
- **Place:** the year's window is two numbers (`start`, `span`) with springs on their targets;
  the hand writes value and target together, a chip only the target — exactly guide 10's
  advice. The detail and the editor are `Sheet`s bound two-way (`shown`/`commit`).
- **The editor** starts every field from a *computed default* (`sport`, `minutes`, `distance`,
  `effort` from what this person usually does) that the person's choice then overwrites — the
  language's own "a literal is a base, a binding is a claim".
- **Choices** are `ChoiceControl`s of `ChoiceItem`s (after DECLARE4026); delete has an undo
  `Toast`; shortcuts are `Shortcuts` records; one `ResponsiveLayout` for desk and phone.

Where it drifts:

1. **The week** (§1): a rolling seven days, and the week's shape too ("The last seven days").
2. **`Nudger` rebuilds `Stepper`** (§4.2), with pass-through `down()`/`up()` methods the drift
   check names — the agent's own doubt (b).
3. **Dates by hand** — `MONTHS`, `LONG_MONTHS`, `WEEKDAYS`, `pad` — where `Intl` would write them.
4. **Six springs and an `arrive()` list** for figures that count up (`weekCountShown` …
   `periodKmShown`): taught, but six copies of one pattern where a class of its own (a
   counting figure) would hold it once.
5. **`HTMLText` with classed spans** for "4 sessions · 3h 40m" with large figures — guide 12's
   rich text, a fair use; the agent was unsure of it and did not look at views in text.

## 6. The agent's account

Asked after the build by resuming the session read-only; answered on the first request
(4,610 words). Its correction about the dev server: `npm start` exited 1 after the hand-over —
`finish.sh` ending what the run left behind (its log names `node server/dev.mjs`).

# Building Cadence in Declare: an account for the people who make it

**First, a correction to my handover.** I said the dev server was "still running in the background". After I handed over, the harness reported that `npm start` (`node server/dev.mjs`, on port 8600) exited with code 1. I don't know why. I tried to read its final output just now, but shell access is disabled in this session, and you asked me not to change anything, so I haven't restarted it. What I can still stand behind: it started cleanly, and it served the program with a 200 and no errors in its log. I can't say that it stayed up.

**A second caveat that shapes the rest.** I was told not to drive, script, screenshot or browse the app. So I have never seen Cadence running. The only time it ran under my eyes was `declare-verify`'s headless boot (check R4). Section (c) is short for that reason, and section (f) carries most of the weight.

---

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`. It sent me to `skill/SKILL.md` under "Agents start here".
2. `skill/SKILL.md`, all of it. It reached me as a saved tool output because it was too long to show inline, and I read the whole file.
3. `docs/declare.md`, all 943 lines.
4. `docs/guide/01-what-declare-is.md`, `04-structure.md`, `05-run-and-check.md` and `06-layout.md`, each whole.
5. `apps/todo/todo.declare` and `todo-parts.declare`, both whole.
6. Then I stopped reading in full, as the skill tells you to, and looked things up for specific needs:
   - `14-data.md`, lines 86–415: writing records, Node classes, derived summaries, where data comes from, talking to a server.
   - `10-touch.md`, lines 49–248: gesture claims, pan and zoom about the fingers, bounding a scale, dragging on a scrolling surface.
   - `18-overlays.md`: open-as-state, sheets, toasts.
   - `17-your-own-views.md`: custom drawing.
   - `12-text.md`: Text, treatments, rich text, reusing a text style.
   - `npx declare-help` for Time, Sheet, PinchEvent, WheelEvent, `App.touchFirst`, `App.phone` (a miss), Spring (with `--all`), App, `HTMLText.textStyles`, Segmented, TextInput, `DataSource.body`, `Sheet.edge`, Toast, the theme tokens, `Text.fontWeight`, HTMLText, `Control.press`, `View.keyBindings`, `View.claim`, `DataSource.errorSchema`, Color, ResponsiveLayout (with `--all`), Shortcuts, ChoiceControl and ChoiceItem.

**What I skipped, and why:**
- **Guide chapters I never opened:** 02 notation, 03 constraints, 07 scrolling, 08 controls, 09 pointer and keyboard, 11 paint and themes, 15 schemas, 16 collections, 19 accessibility, 21 motion, 22 time and 23 animated arrangements. `declare.md` and the todo app covered enough, and `declare-help` answered the specific questions.
- **`calendar.declare` and `28-calendar.md`.** SKILL.md points at these for "a surface over time… zoom from years to a day". That is very close to my year view, and I didn't read them. I took the pan/zoom pattern from `10-touch.md` instead. In hindsight this is the skip I'd most want back. Its zoom-on-springs design is probably what I should have copied, and I'd guess it would have changed how I drew the timeline and laid views over it.
- **`apps/tracker` and the `SignUp` form in `apps/sampler`.** My form deliberately avoided typing and validation, so I judged them less relevant.
- **`docs/operational/verify.md`.** I wasn't writing assert scripts.

**What taught me the most:**
- **The todo app, by a wide margin.** I copied shapes from it directly:
  - a dataset class that makes every write;
  - the `fabDock` pattern (`pointerEvents = "none"` on the dock, `"auto"` on the button, `y = end`, `ignoreScroll`);
  - `Sheet [ shown = { … }, commit(open: boolean) { … } ]`;
  - `exists = { … }` on sheet contents so each opening starts fresh;
  - `theme = { { ...SanFrancisco, ...Mine } }`;
  - the `app.tap` sizing idiom.
- **The `Spring.arrive` entry in `declare-help`.** It answered "how do figures travel without counting up from zero on first load" almost word for word.
- **`10-touch.md` § Pan and zoom about the fingers**, which is the timeline's interaction model.

**What was missing or misleading:**
- **Sizes of the reading.** SKILL.md says to read everything whole, but it doesn't say how long each file is. That's around 10k lines of guide plus 943 plus about 1,350 lines of todo. A size estimate up front would help an agent plan its context budget.
- **A subtle gap in the pinch example in `10-touch.md`.** It uses `zoomAbout(e.x, …, grabStart, grabSpan, …)`. That computes the anchor from the *current* `e.x` against the *latched* start, so if the fingers' midpoint drifts during a pinch, the content doesn't pan with it. I changed it to latch the day under the fingers at `onPinchStart`. I'm fairly sure, not certain, that the doc's version doesn't keep "the point under the hand under the hand" when the hand translates.
- **Library class names.** Nothing I read warned that names like `Stepper` and `Window` are taken. A list of reserved names, or a note in SKILL.md to run `declare-help <Name>` before naming your own classes, would have saved one round of errors.

## (b) Expressing what I wanted

**Where the language fit well:**
- **Derived state everywhere.**
  - `weekCount`, `weekMinutes`, `streak`, `inView`, `periodLabel`, `rangeChoice` and the rest are one-line constraints on the App.
  - A save is "insert the server's reply into the source's records", and every figure follows. The brief's "Nothing is stale and nothing needs a refresh" came almost for free.
- **Computed defaults that become yours once you write them** (`declare.md` §5's ownership table). This was the best fit in the build. The Entry form's
  ```
  minutes: number = { classroot.base?.minutes ?? app.sessions.usualMinutes(classroot.sport) },
  ```
  follows the chosen sport until the person nudges it, then keeps their value. That is exactly what the brief's "what they are most likely to mean should already be there" asks for, with no code saying so.
- **Springs on shown copies, with `arrive()` on first load**, for "numbers travel".
- **The window on the year as two numbers** (`start`, `span`). The hand writes value and target together; the range buttons write only targets and glide. `10-touch.md` describes exactly this.
- **Writes as `DataSource` members** with `body = { classroot.pending }` and the "fetch() settles first" rule. Aiming a write in one handler felt natural.

**Where I worked around something:**
- **Large figures inside a line of words.** "**4** sessions · **3h 40m**", with the figures six times the size of the words, wrapping on a phone. A `Text` can't style runs, so I used `HTMLText` with `<span class='fig'>` and a computed `textStyles` record on the App. It typechecked; I never saw it render. See (g).
- **The pass-through methods on `Nudger`** (`down() { }` / `up() { }` on the class, overridden at the use site, called from inner `StepButton.press()`). SKILL.md's drift check lists "a method per control that only passes the press on". I decided mine was different because the stepper wraps two controls, but I'm not sure the authors would agree.
- **The live session's ticking clock.** Its elapsed time comes from a `Time [ tick = second ]` plus a timestamp latched in the live source's `onLoad`. See (f): I now suspect that has a bug.

## (c) The first time it ran

I never saw it run. Its first and only runs were `declare-verify` R4 boots, headless, at laptop size and then at laptop and phone size. Those boots reported no layout faults. The tool also reported, accurately, that `StepButton, Nudger, EffortCell, Fact, SessionCard, Entry` were "not built at boot, so not checked here". The whole add/correct form and the session detail were never built in a browser during this session. Anything wrong with them was not found by me.

## (d) Every refusal and surprise

**First verify: R1 structure failed with four errors at once.**

1. **`Stepper` is taken.** I had written `class Stepper [ width = 100%, shown: string = "", … ]` in `cadence-parts.declare`.
   - The platform said: `'Stepper' is a library class — a class of the program can't take its name; rename yours, as 'CadenceStepper' … [DECLARE5000] (cadence-parts.declare:77:1)`.
   - I renamed it to `Nudger`.
   - My code was wrong, but avoidably so. Nothing I read mentioned a library `Stepper`; I should have run `declare-help Stepper`. The message itself is excellent.
2. **`Window` is taken.** I had written `schema Window [ start: number, span: number ]`.
   - The platform said: `'Window' is a library class — a schema of the program can't take its name; rename yours, as 'CadenceWindow' … [DECLARE5000] (line 124, col 1)`.
   - I renamed it to `Span`.
   - Same judgement as above. `Window` does appear in SKILL.md's overlay row, so this one I could have known.
3. **The ARIA word for an image role.** On `Timeline` I had written `accessibilityRole = img`.
   - The platform said: `Timeline.accessibilityRole expects an AccessibilityRole (one of none | button | … | image | …), got 'img' — ARIA's word; Declare's is image [DECLARE2000] (line 362, col 25)`.
   - I changed it to `image`.
   - That was a carried-over habit, which is the exact failure the docs warn about. The diagnostic anticipated it.
4. **An attribute name clash.** On `Timeline` I had written `anchor: number = 0,` (the day under the pinch).
   - The platform said: `View already has an attribute 'anchor' — a declaration introduces a new one; write 'anchor = …' to set the existing one, or, for one of your own, name it otherwise, e.g. 'timelineAnchor' [DECLARE2000] (line 367, col 5)`.
   - I renamed it to `grabAt`.
   - My code was wrong. I had read about `anchor` in `declare.md` §7 (links) and didn't connect it.

**Second verify: an error of my own making.** I did the renames with `sed`. The pattern `s/    Stepper \[/    Nudger [/g` missed `distanceStep: Stepper [`, because a name precedes the tag.
- The platform said: `Stepper has no attribute 'what' [DECLARE2000] (line 648, col 60)` and `Stepper has no attribute 'canDown' [DECLARE2000] (line 649, col 9)`.
- I fixed that line.
- Entirely my fault. The message named the real cause clearly enough.

**Third verify: clean through R4, with warnings.**

1. **A label with no role, four of these.** The first was `DayBar` with `accessibilityLabel = { (:name ?? "") + ", " + … }` and no role.
   - `DayBar has an accessibilityLabel but no role, so nothing reads it … Give it the role it is: accessibilityRole = image … [DECLARE4035] (line 247, col 7)`. The others were at lines 269, 341 and 556.
   - I added `accessibilityRole = image` to `DayBar`.
   - Correct and useful. I didn't know a label without a role was inert.
2. **One choice drawn as separate toggles.** My range buttons were three `Choice [ label = "Fortnight", on = { Math.round(app.spanTo) == 14 }, press() { app.zoomCentre(14) } ]`, each a `Control` with `accessibilityRole = toggle`.
   - `these 3 Choices are one choice among several — each is 'on' when Math.round(app.spanTo) equals its own value — but a screen reader hears 3 separate toggles … make them ChoiceItems … the direct children of a ChoiceControl [DECLARE4026] (line 497, col 9)`. Also flagged at lines 622 (sports) and 641 (quick durations).
   - I restructured all three as `ChoiceControl [ value = { … }, commit(v: string) { … }, Option [ choice = "…", label = "…" ], … ]`. I split my `Choice` class into `Option extends ChoiceItem` and a plain `Action extends Control` for "Now", "Correct it" and "Delete".
   - This is the most impressive diagnostic I've seen from a compiler. It inferred from my `on` expressions that the toggles were one choice in disguise. My code was wrong, but SKILL.md's controls row lists `Segmented` and `RadioGroup`, not `ChoiceControl`. A "your own look for one-of-many → `ChoiceControl`" pointer there would have got this right the first time.
3. **A radio outside a group.** `EffortCell extends Control` had `accessibilityRole = radio, accessibilityChecked = { level == chosen }`, inside a plain `View [ accessibilityRole = radioGroup, … ]`.
   - `EffortCell is a radio outside a RadioGroup … make them ChoiceItems, the direct children of a ChoiceControl [DECLARE4032] (line 657, col 9)`.
   - I made `EffortCell extends ChoiceItem [ choice = { "" + level }, … ]` and replicated it with `datapath = :n[]` inside a `ChoiceControl [ value = { "" + classroot.effort }, commit(v: string) { classroot.effort = Number(v) } ]`.
   - Same judgement. **Unsure:** whether replicated children count as "direct children" for `ChoiceControl`. It compiled and booted, but the form was never built at boot, so this is unverified.
4. **Redundant parentheses, five of these** (lint hint DECLARE1002). The first was `draft: Draft = { ({ sport: classroot.sport, … }) }`; the others were `theme = { ({ ...SanFrancisco, ...Paper }) }`, `textStyles = { ({ … }) }` and the two derived datasets' `contents`.
   - I removed the outer parentheses.
   - A small point: the todo app, which is the model program, uses `({ … })` throughout (for example `insert(["tasks"], 0, ({ id: …}))`). That is inside method bodies, though, where they may be needed. Harmless, but the model and the lint pull in slightly different directions.

**Fourth verify: three more of DECLARE4035.** `LiveCard`, the week-shape `View` and the drawn distribution strip each had labels without roles. I gave them `status`, `group` and `image`. Clean after that.

**After formatting.** `declare-format --write` rewrote both files, and verify stayed clean.

**Behaviour that wasn't what I wrote it to do:** none that I observed, because I observed no behaviour.

## (e) Verifying it

- **`npx declare-verify` was my only check.** I ran it five times.
  - It caught: two name collisions with the library, one ARIA spelling, one attribute clash, my own rename slip, seven roleless labels, the misuse of toggles as one choice, the radio outside its group, and five lint hints.
  - It caught **no** runtime or layout problems on the screens it built.
  - It took a few seconds each time, and every message named the fix. That was the best part of the experience.
- **`--phone --desktop`** booted both sizes with no layout faults.
- **`declare-format`** ran with no issue.
- **The dev server, checked with `curl`.** The program URL returned 200 at 47,984 bytes and the server log showed no errors. The server later exited (see the top of this account).

**What I did not do.**
- I wrote no `--assert` flows (R5), so the editor, the detail sheet, saving, deleting and the year's gestures were never exercised.
- The skill's own definition of "standard" requires every reachable screen to work, and I did not establish that.
- You asked for build-and-start only, which is the skill's "light" level, and that's what I achieved.

**How well the tools served me.** Very well, for what I asked of them. The one unease: verify's "clean" plus its honest "not built at boot" note leaves a lot unchecked by construction, in an app whose main screens open from taps. That isn't the tool's fault.

## (f) Confidence, part by part

- **Builds and starts: high,** though the server is no longer up (see the top).
- **The Today copy, "N sessions · 3h 40m" and "12 days" / "no streak": medium.**
  - The HTML string is right once the springs settle.
  - Two risks:
    - It's one `HTMLText` with spans, so a tester's locator or text query may see the text differently from a plain `Text`. I set `accessibilityLabel` to the exact string as a hedge.
    - I chose "this week" to mean a rolling seven days (today and the six before it), not Monday to Sunday. A tester expecting calendar weeks will see different numbers. On the service's frozen date, 2026-08-05 (a Wednesday), the two definitions differ.
  - My streak counts back from yesterday when today is empty. With this data that gives 2 (4 and 3 August; 2 August is empty).
- **The six-times type rule: probably fails on the editor screen.** Rereading my code:
  - The largest figure in the Entry sheet is the `Nudger` figure, at `fontSize = { app.wide ? 40 : 48 }`.
  - The smallest text there is the `Kicker`, at 12 (and the save button's summary at 13).
  - That's 4×, not 6×. Whether the dimmed page behind the sheet counts as part of "that screen" is debatable, but I'd expect a tester to flag it.
  - The session sheet (84–96 against 12) and Today (80–112 against 12) pass.
- **Colour contrast: likely flaws.**
  - `EffortCell` switches to paper-coloured text when `lit && level >= 5`. But `effortInk(5)` mixes only about 32% toward the accent (the ramp is `((e-1)/9) ** 1.4`), so that's pale text on a pale fill.
  - The session band at effort 7 puts paper text on about a 67% mix.
  - I didn't compute either contrast. Unsure, but suspicious.
- **The live session: medium-low.**
  - The `clock: Time [ tick = second, running = { app.liveSession != null } ]` isn't running when the first live reply lands. Yet its `onLoad` sets `app.liveAt = app.clock.now`.
  - If a stopped `Time`'s `now` is stale or 0, the first five seconds could show a large wrong elapsed time, which corrects itself on the next poll.
  - I don't know `Time.now`'s semantics when not running. `Date.now()` in the handler would have been safer.
  - The service's live session starts when the server process starts, so it is always present, and that path matters.
- **The year view: medium.**
  - The pan and pinch maths is right on paper.
  - `claim = x` should keep vertical page scrolling on a phone.
  - A mouse's vertical wheel goes to the page by design, so mouse users zoom only with the buttons and the +/− keys. A tester may call that a gap.
  - A tap selects the nearest session within about 10 pixels. Selection on a zoomed-out view on a phone will be finicky.
  - The drawing re-records all ~250 bars every frame of a pan. Probably fine, but unmeasured.
- **The session detail: medium-low,** because it was never built. The "where it sits" lines and the drawn strip are unverified.
- **Adding, correcting, deleting: medium-low,** never built or run.
  - The request shapes match `API.md`: lift sends `distanceKm: null` and an empty note sends `null`.
  - Ordering on insert compares ISO date strings, newest first.
  - Undo after delete re-POSTs, so the session comes back with a new id.
  - The editor never needs the keyboard except for the note, and everything it offers is valid, so "saving never tells you you're wrong" holds by construction. That's assuming the `ChoiceControl` value/commit pairing works with replicated children.
- **Phone versus desk: medium.**
  - One `ResponsiveLayout` with a single plan chosen by `app.wide` (900 pixels or more).
  - The desk "Log session" button is placed by hand (`x = { app.width - this.width - 56 }`) and may collide with the year column's heading. Unchecked.
- **"Recognisable from a thumbnail": unknown.** I never looked.

## (g) Gaps I worked around

1. **Mixed-size figures inside one line of words.**
   - I wanted: one string, the figures large and the words small, wrapping on a phone.
   - I looked in `12-text.md` (Text; Text treatments; Rich text; Reusing a text style). "A `Text` cannot bold one word; that is what rich text is for."
   - I used `HTMLText [ html = { "<span class='fig'>" + … + "</span> sessions · …" } ]` with an App-level `textStyles = { { fig: { fontSize: app.wide ? 112 : 80, fontWeight: 800, letterSpacing: -4, textColor: … }, … } }`.
   - Judgement: probably the intended way. I'm unsure how baselines and line height behave with an 80-pixel span in a 20-pixel paragraph, and I didn't check "Views inside text" (`tagViews`), which might have been cleaner.
2. **Picking a session in the drawn year.**
   - I wanted: tap a bar to open it.
   - The guide prefers a view per pressable shape (`17-your-own-views.md`, "A chart: a view for each shape a person presses"). It also says reading a position along a drawing is not hit-testing by hand.
   - I mapped `e.x` to a day and took the nearest session (`pickAt`), mostly to avoid 250 sub-44-pixel targets that verify would flag.
   - Judgement: defensible under the guide's own exception, but the bars aren't focusable or announced. `calendar.declare` may show a better pattern; I didn't read it.
3. **A live clock between polls.**
   - I wanted: elapsed time ticking every second while the service is asked every five.
   - I looked in the reference for `Time` and in `14-data.md` § Refreshing on a schedule.
   - I used a second `Time` plus a latched timestamp.
   - Judgement: the platform has the pieces, and my use of them may be buggy (see (f)).
4. **Typed refusals in a shared helper.**
   - I wanted: one `refusal(src)` for three write sources.
   - I typed the parameter as `DataSource` and cast: `src.errorBody as Problem | null`.
   - SKILL.md's drift check says `as` on your own data means it is missing a schema. Here the sources each declare `errorSchema = Problem`, but the parameter type loses it.
   - Judgement: unsure. A generic or typed source class might exist.
5. **A two-control stepper.** See (b).

## (h) Changes of direction

1. **Range, sport and duration buttons; effort cells.**
   - They started as a `Choice extends Control` with `on`/`accessibilityRole = toggle`, and `EffortCell extends Control` with `role = radio`.
   - They became `ChoiceControl` with `Option extends ChoiceItem`, `EffortCell extends ChoiceItem`, and a separate `Action` class.
   - This happened late, on the third verify, prompted by refusals DECLARE4026 and DECLARE4032.
   - The sports change also removed the `pickSport(s)` method.
2. **The `Stepper` and `Window` names became `Nudger` and `Span`,** on the first verify, prompted by DECLARE5000.
3. **The pinch anchor.**
   - I planned to follow `10-touch.md`'s `zoomAbout(e.x, …)` literally.
   - Before writing, I changed my mind and latched the day under the fingers at `onPinchStart`.
   - My own second thoughts, on reading the example.
4. **The meaning of "this week".**
   - I first intended Monday to Sunday.
   - I switched to a rolling seven days while planning, after rereading brief §9 ("Someone opens it on a Monday morning, sees … that last week was four sessions").
   - The brief.

## (i) The code, quoted

The things I couldn't explain or went round on were few. Everything refused is quoted in (d), and those lines are the exact code as it stood then. Two items need more context to reproduce.

**The rename slip, as it stood:**
```
    distanceHead: Kicker [ visible = { classroot.hasKm }, text = "How far" ],
    distanceStep: Stepper [ visible = { classroot.hasKm }, what = "distance", shown = { km(classroot.distance) },
        canDown = { classroot.distance > classroot.step },
```
After the class had become `Nudger`, this produced: `Stepper has no attribute 'what' [DECLARE2000] (line 648, col 60)`. That is a fair report, since the library's `Stepper` has no `what`. A hint such as "you declared a class Nudger with these attributes — did you mean it?" would have been a nice touch, but this was my error.

**The unverified live clock, as it stands:**
```
    live: DataSource [ url = { app.api + "/api/live" }, schema = LiveReply, autoFetch = true,
        onLoad() { app.liveAt = app.clock.now } ],
    poll: Time [ tick = 5000, running = { app.live.loaded }, onTick() { app.live.fetch() } ],
    clock: Time [ tick = second, running = { app.liveSession != null } ],
    liveSecs: number = { (app.liveSession?.startedSecondsAgo ?? 0) + Math.max(0, Math.floor((app.clock.now - app.liveAt) / 1000)) },
```
Question for the authors: what does `clock.now` read while `running` is false?

---

## Surprises, good and bad

**Good:**
- **The diagnostics.** DECLARE4026 deduced from my `on = { Math.round(app.spanTo) == 14 }` expressions that three toggles were one choice. DECLARE2000 recognised `img` as "ARIA's word". DECLARE5000 proposed a specific new name. All six errors arrived in one pass. I never had to guess at a fix.
- **The ownership table** for declared-with-default versus set attributes. It made "smart defaults the person can override" a one-liner.
- **`Spring.arrive()`.** Someone had already thought about "figures shouldn't count up from zero on first load".
- **The todo app as a teaching artifact.** It is dense with patterns and its comments explain why, not just what.
- **The speed of `declare-verify`.**

**Bad, or rough:**
- **Library name collisions are discoverable only by trial.** This was one obstacle that cost one round, but it's a pattern risk: the library is big and names like `Stepper`, `Window`, `Fact` or `Card` are natural choices.
- **The `View.anchor` clash.** Same pattern, with built-in attributes instead of classes.
- **The reading load.** About 2,700 lines of mandatory reading before writing a line. It was worth it, but heavy.
- **Verify's boot check doesn't build anything behind a tap.** In an app built mostly of sheets, the real risk sits exactly where a clean verify can't see. The note saying so is honest, though.

## How it compares, and what it reminded me of

- **OpenLaszlo/LZX**, the README's stated ancestor.
- **QML**, for constraints-as-bindings, states and springs.
- **SwiftUI**, for the declare-the-destination model and the motion.
- **Excel**, a little, in its "every value has one formula" feel.

It differs from React in that there is genuinely no render: the constraint graph is the program. Its treatment of input is more principled than any web framework I know, with "the handler is the claim" for gestures, and `onClick` activates while `onPointerDown` manipulates. Its strictness, with typed schemas checked at both compile time and on receipt, feels like Elm.

## What I'd most want improved

1. **One reference of reserved names** (library classes plus built-in attributes), or a compiler hint offered on first use, before the collision.
2. **SKILL.md's "What Declare handles for you" table should name `ChoiceControl` in the controls row,** for one-of-many choices drawn your own way. I hit this four times across one pattern, and it cost a restructuring pass of roughly a quarter of my edit time.
3. **A cheap way for verify to build the screens behind taps**, short of writing an assert script. For example, a flag that builds every `exists`-gated child or opens every sheet once for layout checks.
4. **A size budget at the top of SKILL.md's reading list.**

## What I'd use it for

Interactive, data-shaped interfaces where continuity matters: dashboards, timelines, editors with a lot of derived state, apps that should feel native on a phone and on a desk from one source. I'd use it more readily for that than React plus a motion library, because so many problems I'd usually hand-manage (stale derived values, open/close state, gesture arbitration, interrupted animation) are structural here. I'd hesitate for content-heavy sites with existing CSS design systems, or where a team needs a large outside ecosystem.

## The sharpest edge, sized

Not one obstacle but a pattern: **names and idioms the platform already owns, which I reinvented and was then refused.** That covered `Stepper`, `Window` and `anchor`, toggles where `ChoiceControl` belonged, and `img` for `image`. Together that was about three verify rounds and one structural rewrite of four control groups, perhaps 20–25% of the build's editing effort. All of it was caught, cheaply and with clear fixes. To write it right first time I'd have needed:
- a reserved-name list;
- a SKILL.md row pointing at `ChoiceControl`;
- the discipline to `declare-help` every class name before using it as my own.

The larger unknown remains the parts I never saw run: the editor, the detail sheet, the live clock and the year's gestures. That's where I'd send a tester first. I'd expect findings there: the 4× type ratio on the editor screen, contrast on mid-effort cells, possibly the first live reading, and anything about how `HTMLText` sets the big figures.
## 7. The names ledger

```
NAMES — eval-cadence-38: 3 missed name(s), 3 collision(s), 1 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
     8 · value     · img                  · Timeline.accessibilityRo · —                  · foreign hint · ×1  ·    8 · resolved
         Timeline.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | grid | r
     8 · attribute · what                 · Stepper                  · —                  · none         · ×1  ·    8 · resolved
         Stepper has no attribute 'what' [DECLARE2000] (line 648, col 60)
     8 · attribute · canDown              · Stepper                  · —                  · none         · ×1  ·    8 · resolved
         Stepper has no attribute 'canDown' [DECLARE2000] (line 649, col 9)

COLLISIONS (min · held by · name)
     8 · library class  · Stepper
     8 · library class  · Window
     8 · attribute      · anchor

DECLARE-HELP MISSES (min · asked for · answered)
     1 · phone · App has no member 'phone' and nothing near it — the member table: declare-help App

SUMMARY: 2 of 3 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
