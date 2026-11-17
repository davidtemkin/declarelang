# Cadence run 37: Opus 5.5, Declare, on the local tree, standard level

The first Cadence run on the global-names tree. **13.6 min, 72 turns, 76k output tokens**
(26k thinking). Not scored: the audit is the result. Timing record:
`evals/timings/2026-11-15-cadence-run37-local.txt`.

Launched before the focus-ring fix found in Murmur 18 (its tree did not have it); the
warning did not appear in this run.

## 1. The comparison

Against the standard-level Cadence runs:

| | 34 | 35 | 36 | **37** |
|---|---|---|---|---|
| total | 23.2 | 17.5 | 19.2 | **13.6 min** |
| turns | 99 | 91 | 83 | 72 |
| output tokens (thinking) | 118k (52k) | 92k (35k) | 98k (42k) | 76k (26k) |
| reading · writing · checking | 7.0 · 3.7 · 12.5 | 5.7 · 2.9 · 8.9 | 5.1 · 5.0 · 9.0 | 3.4 · 3.9 · 6.2 |
| tool time · model time | 4.9 · 18.4 | 3.0 · 14.5 | 3.9 · 15.3 | 1.9 · 11.6 |
| verify calls | 26 | 13 | 13 | 13 |
| output per model-minute | 6427 | 6334 | 6423 | 6548 |

- **The fastest standard-level Cadence**, at the same pace: fewer turns and less of every
  phase. It read less (3.4 min) and wrote the program in two files.
- **Code:** 1,280 lines in two Declare files, 927 without comments and blank lines (run 36:
  1,037 lines of Declare by `idiom.py`'s count).
- **Download:** 229 KB gzip as a production build, first load.
- **Checks:** two kept assert scripts, `desk.mjs` (24 assertions: log, correct, delete, the
  year by drag and pinch, the keyboard) and `phone.mjs`.

Murmur 18's audit ran beside this run, so the machine was shared throughout; tool time is
still the lowest of the four.

## 2. What it built, and findings for the platform

All of the brief: Today (this week, the streak, the week's shape on springs, the last
session, a session running now with a live clock), the Year (a drawn surface dragged and
pinched about the fingers, zoom presets, the hardest session in view, every session in view,
virtualized), a session's card with where it sits among its sport, and the form, where every
field starts at what the person most likely means, so the common case is one press. One
program: side by side on a desk, two screens behind a thumb bar on a phone.

1. **The new names, in use and unremarked:**
   - **`Color.mix`** makes the one accent: `effortColor(e)` mixes the theme's `effortCool`
     toward `effortHot` by effort (cadence.declare:741). Run 36 had no color operation to use.
   - **`errorSchema = Refusal`** types the writer's refusal, read as
     `app.writer.errorBody?.message` with no cast (cadence.declare:789, 703) — the finding of
     Presentify 10 and 11, used here as the reference says.
   - **`Stroke(…)`** throughout, with no refusal.
2. **ADDED after the audit: `Toast.clearance`.** On a phone the toast must sit above the
   app's own thumb bar. Nothing said how, so the agent read `library/toast.declare` and
   rewrote the toast's `y` using its private `_hostH` (cadence.declare:1034). Now `clearance`
   (24 by default) is how far above the bottom of its layer the toast sits:
   `clearance = { app.wide ? 24 : 100 + app.safeBottom }`.
3. **Two spellings of the face.** The drawn surfaces set `d.font = "600 12px " + app.faceCss`,
   a CSS font string kept beside the `uiFace` list the text uses (cadence.declare:215, 530,
   724). A drawing's `fillText` takes a style record (`{ fontSize: 12, fontWeight: 600 }`) and
   the face then follows the program's `fontFamily`. The guide's drawing section could show
   text drawn with a style record first.

4. **A test can't find content a library overlay placed.** `app.detail.0.actions.0` found
   nothing: the `Sheet`'s own chrome comes first and its `defaultPlacement` moves the content
   into its body (`app.detail.3.0`). Naming the child (`card: SessionCard`) and addressing it
   by name (`app.detail.card`) works, as for any placed child, but nothing in `verify.md` says
   so (account, d6). **Proposal:** a paragraph there on placed children: address them by
   their name, which follows them wherever their class places them.
5. **Large and small type in one line** ("4 sessions · 3h 40m", figures large, words small)
   took `HTMLText` with spans, a `textStyles` map built in `{ }`, and a no-break space inside
   the duration (account, b and g2). A request for styled runs in a plain `Text`, with sizes
   that can follow the width; not a defect.

## 3. Is it idiomatic Declare?

| | Run 36 | Run 37 | To-do |
|---|---|---|---|
| code | 1,037 lines Declare | 927 lines Declare | 844 lines Declare |
| bytes | 57 KB | 53 KB | 48 KB |
| lines over 150 characters | 1 | 7 | 3 |
| colour literals outside theme declarations | 0 | 0 | 1 |
| theme reads | 68 | 76 | 69 |
| States | 0 | 10 | 7 |
| visible switches | 0 | 0 | 0 |
| branches on width or phone | 24 | 20 | 38 |
| flexes | 9 | 11 | 7 |
| browser scripts | 0 | 0 | 0 |
| page lookups | 0 | 0 | 0 |

**What it gets right.**
- **The records and what is true of them in one class.** `Sessions extends DataSource` loads
  the history and answers every question about it — totals, the streak, the week's shape,
  what is usual for a sport, where a session sits — and makes every write
  (cadence.declare:59–167).
- **Where the user is, on the App:** `location` for the phone's screen, the year's window as
  `start` and `span`, the open session, whether the form is up (cadence.declare:799–815).
- **The year's surface is one drawing over a window**, moved by the hand directly and by
  buttons through springs (`hand` against `glideTo`, cadence.declare:866–871). It claims only
  the sideways drag (`claim = x`), so the page still scrolls under a finger.
- **Defaults that follow until changed.** The form's fields are declared attributes with `{ }`
  defaults — the usual sport for the day, a usual duration, a distance at the usual pace — so
  each starts right and stops following once the person sets it (cadence.declare:559–567).
- **Figures arrive whole and then travel.** Springs carry the week's figures and the period's
  totals, and the history's `onLoad` lands them (`arrive()`) so the first view doesn't count up
  from zero (cadence.declare:758–761).
- **`States` for interaction looks** (ten of them) rather than nested `? :`, after the lint's
  advice.
- **The library where it fits:** `Sheet` for the card and the form (built only while present),
  `Toast` with Undo and View, `DatePicker`, `ChoiceControl` with items of its own, `Shortcuts`.

**Missteps, with how each should be written.**
- **Reaching into the toast** (finding 2): `y = { this._hostH - … }` is now `clearance`.
- **The face as a CSS string for drawing** (finding 3).
- **The service's live session is polled** every five seconds (`livePoll: Time [ tick = 5000 ]`,
  cadence.declare:772). The brief's service offers only a snapshot, so a `Time` is the
  documented form; noted only so a later brief with a stream is not read the same way.
- **A focus mark of its own on the year chart** (`stroke = { focused ? … }`,
  cadence.declare:184) beside the platform's focus ring, which already marks it.

**Workarounds the platform forced:** the toast's place (finding 2).

## 4. Names

**Misses:** one. `chart` read from the App, declared on the year panel; resolved in the same
minute, from "declare it or fix the name".

**Silent misses:** none found.

**Collisions:** none.

**Lookups that missed:** none.

## 5. The agent's account

Asked after the build by resuming the session read-only (`impressions.txt`); 13k output tokens,
297k cache reads, counted apart from the build's.

# Building Cadence in Declare: an account for the people who make it

First, a correction to my handover. The dev server I started for you was killed when the session's background task ended (exit 143), so the address I gave you (`http://127.0.0.1:8600/my-apps/cadence/cadence.declare`) is almost certainly down. Running `npm start` in `declarelang/` brings it back; it prints its port. I haven't changed anything since the handover.

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`, then `skill/SKILL.md` and `AGENTS.md`. The skill set the reading order.
2. `docs/declare.md`, whole.
3. Guide chapters `01-what-declare-is`, `04-structure`, `05-run-and-check` and `06-layout`, whole.
4. `apps/todo/todo.declare` and `todo-parts.declare`, whole.
5. Then, as the plan needed them:
   - `14-data.md` from "A Node class on a record" to the end. I skipped the first 170 lines.
   - `10-touch.md`, whole.
   - `18-overlays.md`, whole.
   - `21-motion.md`, whole.
   - `22-time.md`, the first 130 lines.
   - `08-controls.md`, lines 18–357.
   - `12-text.md`, the first 150 lines.
   - `operational/verify.md`, whole.
   - The key-bindings section of `09`.
6. About twenty `declare-help` lookups: Sheet, App, Spring, Stepper, ChoiceControl/ChoiceItem, DatePicker, DrawContext, HTMLText, RichText.textStyles, DataSource, Text.numeralWidth, Text.fontWeight, Color.mix, View.draw, ResponsiveLayout, PinchEvent, WheelEvent, Toast, and "theme tokens".

**What I skipped, and why:**
- I never opened `apps/calendar/calendar.declare` or `28-calendar.md`, though the skill points there for "a surface over time". The pan-and-zoom fragment in `10-touch.md` was nearly the whole answer for a one-dimensional strip. I judged the calendar's two-dimensional camera to be more than I needed. Unsure whether reading it would have changed anything.
- I skipped guides `02` (notation) and `03` (constraints). `declare.md` seemed to cover them.
- I skipped the first part of `14-data` (cursors, writing a record), because the to-do app had shown me that.

**What taught me the most:**
- The to-do app. Its shape mapped almost one-to-one onto mine:
  - a dataset class that owns its records and writes;
  - "where the user is" kept on the App;
  - a form that exists only while its sheet is present, with computed defaults;
  - the phone and desk split read from `app.wide`;
  - a `Toast` with Undo.
- `14-data`'s "Talking to a server" section: write sources, "`fetch()` settles first", and editing a source's own value when it loads once.
- `10-touch`'s `zoomAbout` fragment, which I adapted almost directly.
- `verify.md`. Without it I wouldn't have known that time is held, that presses are routed like real ones, or how paths work.

**What was missing or misleading:**
- Nothing I read was actively misleading.
- Missing, or not found:
  - how to offset a `Toast` (see g);
  - how to address children that a library overlay's `defaultPlacement` moved (see d6);
  - whether a `DataSource` whose `url` is `""` never fetches. I relied on it and never confirmed it.
  - what `Spring.arrive()` does if the next change of target never comes.
- `declare-look` has no `--reveal`, though `drive.reveal` exists. I assumed parity.

## (b) Expressing what I wanted

**Where it fit well:**
- **Derived state.** Week totals, streak, the period in view and the hardest session in it are all `{ }` attributes over `app.sessions`. When a POST reply landed via `sessions.put(s)`, everything followed with zero update code. This is the part of the brief ("nothing is stale and nothing needs a refresh") that the language made free.
- **Springs for figures that travel.** One `Spring` per figure. The "hand writes value and target together" idiom in `21-motion` was exactly right for a drag that buttons also move.
- **The form's defaults.** Writing `minutes: number = { classroot.editing?.minutes ?? app.sessions.usualMinutes(classroot.sport) }` gave "follows the sport until you touch it" for free. That was the brief's "confirm rather than fill in".
- **Sheets.** One `Sheet [ edge = "end" ]` became a side panel on desk and a bottom sheet on phone, with no code.
- **Gesture claims.** `claim = x` plus drag and pinch handlers on the chart, and the page still scrolled vertically.

**Where I had to work around it:**
- **Mixed-size type in one string.** The brief needs "4 sessions · 3h 40m" to read exactly, with figures large and words small. I used `HTMLText` with `<span class='fig'>` and a `textStyles` map built in `{ }` on the App, because a `style` record can't hold a size that depends on width. It works. But the sprung figures re-parse HTML every frame while they move, and I had to put a no-break space inside the duration so "1h 24m" wouldn't split across lines.
- **Canvas text.** `draw` takes a CSS font string, so I kept a second copy of the font list (`faceCss`) beside the `uiFace` array.
- **The toast** (see g).

## (c) The first time it ran

The first `declare-look` screenshots (1440×900 and 390×844) showed:

1. **The hero duration broke inside itself:** "1h" on one line, "24m" on the next. I found it in the screenshot.
2. **The live panel was enormous.** A 72–88px clock in a 190px block pushed the streak below the fold on desktop. Screenshot.
3. **Effort colour was everywhere.** With `Math.pow((e-1)/9, 1.3)`, middling efforts were already salmon, and the chart read as an orange wall, against the brief's "one thing shouting". Screenshot.
4. **A large empty band above the week's bars.** This comes from the fixed 150-minute scale with a 150–190px column. Screenshot. I shrank it, but some of it remains by design.
5. **On the phone Year screen, the preset row wrapped** and put "+" on a line of its own. Screenshot.

I found the form's and the detail sheet's problems later, through layout findings and screenshots after taps (d5, d9).

## (d) Every refusal and surprise

**1. `DECLARE4005`.**
- Wrote: `fontWeight = { classroot.isToday ? black : semibold }`
- Platform said: `'black' is one of fontWeight's values — bare only as the whole value (fontWeight = black); inside { } write it as a string: "black"`
- Changed: to `"black"` and `"semibold"`.
- Judgement: my code was wrong. `declare.md` §2 says exactly this, and the message was perfect.

**2. Accessibility warnings at R2** (not errors):
- `DECLARE4022`: Pressable "shows whether it is the one chosen ('on'), but tells a screen reader nothing".
- `DECLARE4035`: DayBar "has an accessibilityLabel but no role" (four such places).
- `DECLARE4026`: "these 2 Pressables are one choice among several".
- Changed:
  - added `ChoiceControl` + `ChoiceItem` for the zoom presets and the phone tabs;
  - renamed `on` to `strong` for the one emphasised button;
  - added roles: `image`, `group`, `status`.
- Judgement: my design was wrong, and these were excellent. 4026 noticed that two buttons compared the same value to different constants. That's an impressive inference.

**3. `DECLARE1002`** (a lint hint about redundant parentheses).
- Wrote: `theme = { ({ ...SanFrancisco, ...Paper }) }`
- Changed: removed the parentheses.
- Judgement: harmless. I added them because the to-do app wraps record literals as `({ … })`, and I didn't know where that's needed.

**4. `DECLARE6001`.**
- Wrote, inside `YearPanel`: `Nudge [ sign = -1, press() { app.chart.pan(-1) } ]`
- Platform said: `'chart' is not a member of this App — declare it … or fix the name — 2 sites, also on line 424`
- Changed: to `classroot.chart.pan(-1)`.
- Judgement: my error. The message was clear.

**5. `DECLARE4025`** (nested choices).
- Wrote:
  - the Choice's fill as `classroot.on ? … : pressed ? … : hovered ? … : …`
  - the preset value as `Math.round(app.spanTo) == 14 ? "14" : … == 91 ? "91" : … == app.nDays ? "all" : ""`
- Changed: `State`s for the fills, and a method `presetOf(sp)` for the value.
- Judgement: the advice to use States was right. Turning the value into a method moved the same ifs elsewhere; it doesn't seem clearer to me. Unsure the lint earns that case.

**6. R5: `no node at 'app.detail.0.actions.0'`.**
- I had guessed that the sheet's first child is the card. In fact the Sheet's own chrome comes first, and its `defaultPlacement` puts my content at `app.detail.3.0`. I found that by walking `childViews` with `declare-look --js`.
- Changed: named it `card: SessionCard [...]` and used `app.detail.card`.
- Judgement: partly my error (indexes are fragile). Partly a gap: nothing told me how to reach content placed into a library overlay. A sentence in `verify.md` would fix it.

**7. R5: `no node at 'app.weekTotals' — 'app' holds nothing called weekTotals`.**
- Wrote: `drive.read("app.weekTotals.count")`, where `weekTotals` is a record attribute.
- Changed: to read `app.weekLine`.
- Judgement: my error; `verify.md` says the last dot names the attribute. The "nearest there" list in the message made it quick to fix.

**8. R5, phone: `a press on 'app.thumb.log' — (322, 802) in the window — would reach 'app.toast._row.act': it is covered there`.**
- A real bug: the default Toast sits 24px from the bottom, over my thumb bar's Log button.
- Changed: overrode `y = { this._hostH - this.height - (app.wide ? 24 : 100 + app.safeBottom) + 16 * (1 - this.openT) }`, copied from `library/toast.declare`.
- Judgement: the tool was excellent. A test with a mouse would have passed. The fix reaches into an underscore member, which looks like it isn't meant for me (see g).

**9. Layout finding after a tap: `app.form.entry.long.1.figure's text needs 267 wide and has 222 — it runs past its box (wrap is off)`.**
- Same run: `10 control(s) smaller than 44 × 44 … app.form.entry.felt.1.0 31.8×52 …`
- Changed: the duration figure moved onto its own full-width row, with four Step buttons under it; effort became `WrappingLayout [ columns = { app.wide ? 10 : 5 } ]`.
- Judgement: my design was wrong. Both findings were precise and actionable.

**10. Layout finding: `app.detail.card.facts's children need 400 across and it has 372 … facts.2 runs past the window's right edge at 1425 wide`.**
- Changed: `SimpleLayout [ axis = x ]` to `WrappingLayout`.
- Judgement: my error.

**11. Layout finding: `app.body.today.shape.1's children need 123 down and it has 120, so … shape.1.3 runs past its end`.**
- Wrote: `height = { … Math.max(4, classroot.grown * (parent.height - 46)) … }`
- Changed: `46` to `58`.
- Judgement: my code was wrong in kind, not just in number. It's arithmetic over sibling sizes, which the drift check warns against. A flexing track holding the bar would have been right. I patched the constant instead.

**12. `declare-look: --reveal is not an option`.**
- Judgement: my assumption. The message was clear.

**13. Not the platform:**
- `L="npx declare-look …"; $L` failed in zsh.
- I curled port 8200 while the server was on 8600.

**Results that weren't what I wrote them to do:**
- the duration wrapping inside itself (c1);
- the scatter crowding to the right, because I scaled from 0 rather than from the shortest session;
- the month label "Au" clipped at the chart's right edge;
- an expression for a label's y position I wrote while tired (`base + 30 - 32 - (base - top) + 6`), caught before it ran.

All four were my own errors.

## (e) Verifying it

- **Static checks** (`declare-verify --rung=3`): about 2 seconds a run, and every message named its fix.
- **Boot** at both sizes (`--phone --desktop`). Clean from the first run, but it only sees the first screen. It honestly listed the classes it never built: EffortStep, SportTile, DayChip, SessionCard, SessionForm.
- **`declare-look` screenshots** at 1440, 1280, 1024 and 390, after taps. These caught every visual problem in (c).
- **`tests/desk.mjs`**: 41 steps, 24 assertions.
- **`tests/phone.mjs`**: 40 steps, 16 assertions, with touch.
  - Both send real requests and check them with `expect.request`.
  - They caught d6–d11, including the toast bug, which only a routed press would catch.
  - Layout checks at every resting point were the most valuable thing in the toolchain.
- **Weaker spots:**
  - Finding paths for scripts took the most fiddling (d6, d7). An `--outline` after actions would have helped. I tried `--outline` at `--rung=3`, where it printed nothing (it needs a boot), and that was my mistake.
  - The scripts reset the service through its undocumented `/api/_reset`. The tool's notes about writes left on the live service were useful.

## (f) Confidence, part by part

**High:**
- Today's figures and their exact wording at rest.
- The week and the streak updating after a log; this is tested.
- POST, PUT and DELETE, and Undo re-posting; tested.
- The two-tap phone log; tested with touch.
- Year drag and pinch; tested by finger and by simulated trackpad pinch.

**Medium:**
- The live session: the clock ticking and the 5-second refresh. I only saw it in screenshots, never asserted.
- Figures rolling up from 0 on first open. Screenshots settle motion, so I never saw the first frames. Unsure.
- Real-device gestures: a vertical scroll that starts on the chart, and pinching on iOS.

**Likely tester findings:**
1. **880px wide.** `ResponsiveLayout` switches to two columns from 860, but `app.wide` is `>= 900`. Between them you get two columns *with* the phone's top and thumb bars and phone padding. That's an inconsistency I introduced and never tested.
2. **The session sheet blanking while it closes after a delete.** The card reads `app.openSession`, which becomes null once the record is dropped. Not observed; inferred.
3. **Values typed at the desk aren't limited.** Typed minutes go up to 999 and kilometres aren't bounded, and PUT isn't validated by the server.
4. **Undo gives the session a new id.**
5. **The week section's empty band** may read as a layout error, not as "light week".
6. **"Usual sport for this weekday"** is my reading of "the sport they always do at this hour". The data has no time of day.

## (g) Gaps I worked around

1. **Moving the toast.**
   - Wanted: an inset or "keep above this view" setting on Toast.
   - Looked: `Toast --all` and `library/toast.declare`. Found only `y` built from `_hostH`.
   - Did: overrode `y` with a copy of the library's formula.
   - Judgement: probably a real gap. The to-do app solves the same clash from the other side, lifting its add button when a toast shows. That suggests the platform expects that approach rather than offering an offset.
2. **Mixed sizes in one line.**
   - Wanted: large figures and small words in one run that wraps only at chosen points.
   - Did: `HTMLText` + `textStyles` + a no-break space.
   - Judgement: unsure. Rich text may be the intended answer, but the reparse on every spring frame and the no-break space feel improvised.
3. **Large steppers.**
   - `Stepper` reads the segmented control's height tokens, too small for the thumb design.
   - Did: wrote `Nudge` and `Step` controls.
   - Judgement: probably fine, since the library expects you to compose your own. Theming the Stepper's height might have worked, but I didn't try.
4. **Fonts on a canvas.**
   - Wanted: to pass a `Font` to `DrawContext.font`.
   - Did: kept a duplicate CSS string.
   - Judgement: unsure. I didn't search.
5. **Clipping chart labels to their width.**
   - Did: hard-coded edge margins.
   - Judgement: `DrawContext` probably has `measureText` among its "26 more" members; I didn't look.
6. **A save button pinned to the bottom of a phone sheet.**
   - Did: designed the form to fit 844px.
   - Judgement: unsure whether `Sheet` has a footer slot. I didn't look. A smaller phone may push Save below the fold.
7. **Loading sessions only after today.**
   - Did: `url = { app.today == "" ? "" : … }`, assuming an empty url means no fetch.
   - Judgement: unconfirmed.

## (h) Changes of direction

Changed because of what I saw running (screenshots):
- **The live panel:** a tall card with a 72–88px clock became a compact row with a 48–56px clock.
- **Hero sizes:** 120px, then 104px, then 92 (or 76 below 1360px), plus the no-break space. Each step followed a screenshot where the hero broke badly.
- **The effort curve:** exponent 1.3 became 2.
- **The day picker:** three chips plus a DatePicker on its own row became Today/Yesterday with the DatePicker beside them. This was to fit the phone sheet's height.

Changed because of layout findings:
- **The duration control:** `−` figure `+` became a full-width figure with four step buttons under it, and the typed-minutes field moved into that row.
- **The effort row:** one row of 10 became 2 rows of 5 on the phone.

Changed because of warnings or a failed test:
- **Toggle-look buttons:** `Pressable [ on ]` became `strong` for the one emphasised button, plus a ChoiceItem class (`Choice`) for one-of-several (d2).
- **Nested-ternary fills became States** (d5).
- **The Toast:** the default placement became my overridden `y` (d8).

Decided before writing any code:
- The card reads an attribute rather than a `datapath` to a computed record, per `declare.md` §7.
- Closing the sheet uses a `detailOpen` flag rather than clearing `openId`, so the card doesn't empty mid-slide. (d-f2 suggests this is only half solved for deletes.)
- Delete got a toast with Undo rather than a confirm dialog.
- A one-tap "use the session in progress" chip, rather than making the live session the form's defaults. My own second thought: the brief's defaults are "usual".

## (i) Code and messages, quoted

These are reconstructed from this session.

**DECLARE4005**, `DayBar`:
```
Text [ fontSize = 13, fontWeight = { classroot.isToday ? black : semibold }, … ]
```
> 'black' is one of fontWeight's values — bare only as the whole value (fontWeight = black); inside { } write it as a string: "black" [DECLARE4005] (line 279, col 62)

**DECLARE6001**, inside `class YearPanel`:
```
tools: View [ …, Nudge [ sign = -1, accessibilityLabel = "Earlier", press() { app.chart.pan(-1) } ], … ]
```
> 'chart' is not a member of this App — declare it (chart: <type> = …) or fix the name — 2 sites, also on line 424 [DECLARE6001] (line 415, col 74)

**DECLARE4025**, `Choice` (in `cadence-parts.declare`):
```
fill = { classroot.on ? provided("theme").text : pressed ? provided("theme").controlPressed : hovered ? provided("theme").controlHovered : provided("theme").control },
```
> warning: fill decides through 3 nested ? : choices — give the facts it decides on names of their own … [DECLARE4025] (cadence-parts.declare:149:12)

**The R5 path miss** (`tests/desk.mjs`):
```
await drive.click("app.body.today.lastBox.last"); await drive.settleMotion();
await drive.click("app.detail.0.actions.0");
```
with `detail: Sheet [ …, SessionCard [ exists = { app.detail.present } ] ]`
> no node at 'app.detail.0.actions.0' (4 timers still waiting — drive.wait(ms) runs them)

**The toast covering Log** (`tests/phone.mjs`, after the first save showed "Logged: …" with a View action):
```
toast: Toast [ duration = 6000, picked(id: string) { … } ],
thumb: View [ visible = { !app.wide }, ignoreScroll = true, ignoreLayout = true, y = end, … log: Control [ height = 60, … ] ]
```
> a press on 'app.thumb.log' — (322, 802) in the window — would reach 'app.toast._row.act': it is covered there, or takes no presses

**The DayBar overflow:**
```
class DayBar [ flexes = true, height = { app.wide ? 140 : 120 }, …
    layout: SimpleLayout [ axis = y, spacing = 6, align = center ],
    Spacer [ ], Text [ fontSize = 12, … ],
    bar: View [ height = { classroot.minutes > 0 ? Math.max(4, classroot.grown * (parent.height - 46)) : 3 }, … ],
    Text [ fontSize = 13, … ] ]
```
> app.body.today.shape.1's children need 123 down and it has 120, so app.body.today.shape.1.3 runs past its end.

**The form figure** (first version):
```
View [ layout: SimpleLayout [ axis = x, spacing = 10, align = center ],
    Nudge [ sign = -1 ], figure: Text [ flexes = true, fontSize = { app.wide ? 80 : 76 }, wrap = false, … ], Nudge [ sign = 1 ] ]
```
> app.form.entry.long.1.figure's text needs 267 wide and has 222 — it runs past its box (wrap is off).

I didn't go round in a circle on anything. The closest was path discovery for test scripts (d6, d7): two failed runs and one `--js` walk.

## Overall

**Surprises:**
- How much the checker infers. 4026 spotted a hand-built radio group from two constants.
- That the phone test refused a press a person couldn't make.
- That the first boot was clean. Every real problem showed up only after a tap or in a screenshot.

**Good:**
- The update model: writes land and everything is true.
- Diagnostics that name the fix.
- Sheets that adapt to the room on their own.
- Springs, and the hand idiom.
- The driver's held time and routed presses.
- Layout checks wherever a script settles.

**Bad:**
- Addressing library internals from tests.
- Placement of library overlays is fixed unless you copy their private formulas.
- Mixed-size text needs HTML.
- Fonts on a canvas are a separate world from Font objects.

**Compared with what I know:**
- It feels like a cleaner OpenLaszlo or Flex: constraints, states, a layout object.
- It's closest to SwiftUI in intent, but without view re-evaluation.
- Coming from React, the absence of effects and memos was a relief.
- Coming from CSS, sizing is far more predictable, though it was odd not to get a free "fill and wrap" for type.

**Where I'd most want improvement:**
1. Overlay placement hooks: insets for toasts, a footer area for sheets.
2. A documented way to address children an overlay placed, and `--outline` usable after actions.
3. Styled spans inside a plain `Text`, with sizes that can be reactive.

None of these was one big obstacle. Each was a pattern of small detours, together perhaps 10–15% of the build.

**The sharpest edge:** discovering paths for test scripts. It was a pattern, cost two or three failed runs, and the only thing I'd have needed to get it right the first time is one paragraph in `verify.md` on overlays and placed children.

**What I'd use it for:** exactly this kind of app. A data-backed tool with real phone and desk use and motion that carries meaning: dashboards, logs, schedulers. I'd hesitate for content-heavy, text-styled pages, where HTML is still the easier medium.

## 6. The names ledger

```
NAMES — eval-cadence-37: 1 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
     8 · member    · chart                · this App                 · —                  · none         · ×1  ·    8 · resolved
         'chart' is not a member of this App — declare it (chart: <type> = …) or fix the name — 2 sites, also on line 424 [DECLARE6001] (line 415, col 74)

SUMMARY: 1 of 1 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
