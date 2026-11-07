# Cadence run 30: Opus 5.5, Declare, at 2b643e5f (tagStyles, ChoiceControl)

Built on 2e1ebaca (the `tagStyles` and `ChoiceControl` commits, f96c08b1 and 2b643e5f, and
the reworded choice warnings). **16.4 min, 73 turns, clean**: the agent delivered a working
app, and the audit found no refusal of correct code. Cadence has no hidden acceptance; the
app was checked by the agent's own two assert scripts (a phone flow and a desk flow).

## Figures

| | Run 27 | Run 28 | Run 29 | **Run 30** | React 1 |
|---|---|---|---|---|---|
| time | 16.3 min | 15.0 min | 19.0 min | **16.4 min** | 15.4 min |
| turns | 87 | 74 | 96 | **73** | 63 |
| lines of code | 1,105 non-blank | 1,118 non-blank | 1,176 non-blank | **1,359 all · 1,174 non-blank · 972 without comments** | 2,943 (TS and CSS in `src/`) |
| output tokens (thinking) | 81.6k (30.8k) | 76.1k (26.6k) | 98.8k (41.9k) | **89.0k (36.2k)** | 89k |
| phases: reading · writing · checking | 4.7 · 3.3 · 8.3 | 4.8 · 2.0 · 8.2 | 5.3 · 4.4 · 9.3 | **6.6 · 2.3 · 7.5** | |
| tool · model time | 2.9 · 13.4 | 2.6 · 12.4 | 3.0 · 16.0 | **2.2 · 14.2** | |
| lines removed after the first write | 155 | 96 | 139 | **180** | |
| diagnostic codes met | 11 | 9 | 9 | **9** | |

Cadence's best is 15.0 min (run 28); the clean runs since run 26 range from 15.0 to 19.4.

### Where the time went

| What | Minutes |
|---|---|
| Reading: the required docs, the to-do app, then about twenty reference lookups (5.3 min of model time after `declare-help` alone) | 6.6 |
| Writing the first draft, two files | 2.3 |
| First checks: baseline and syntax refusals, the choice warnings, converting to `ChoiceControl` | 1.3 |
| Looking and layout polish: screenshots of desktop, phone, session page and forms; two wiring bugs of its own | 3.4 |
| The phone behaviour script: add, totals move, correct, delete | 0.7 |
| Gestures, the desktop form with typed fields, formatting, the final check | 2.1 |

## What it built

A paper-and-ink design with a condensed web display face (fetched from Google Fonts) for the
figures, heat-coloured bars by effort, a drawn year surface that pans and pinches with two
springs, a sheet-based log form whose defaults follow the sport, and a desk form with typed
fields. Choices are `ChoiceItem`s inside `ChoiceControl`s, drawn as its own tiles.
Screenshots: `desk.png`, `phone.png`. On the phone the floating "Log session" button covers
the foot of the live card.

## The audit: every refusal and wrong-looking result

| Minute | What it met | Verdict |
|---|---|---|
| 8.9 | `align = baseline` on rows holding a `TextInput` and a plain dot `View`: "declares no baseline" | Correct refusal of what was written. **Gap:** a `TextInput` has text and so a baseline, but it draws through a native field and declares none, so a field cannot sit on a row's baseline beside a label. Recorded, not fixed (needs the native text's metrics). |
| 9.1 | DECLARE4026 / 4032 on its sport and effort toggles; 4035 on the labelled surface | Correct. It converted to `ChoiceControl`/`ChoiceItem` in about half a minute, keeping its drawing. |
| 9.7 | `if … app.showAll() else …` with no `;` | Its TypeScript. The message is right but bare. |
| 9.8 | `class Pick` collides with TypeScript's `Pick` (DECLARE4015) | Correct. |
| 10.0 | an unparseable `textStyles` record | Its syntax. |
| R4 | a `Choice` with `x = center` content in a content-sized box; Spacers in a content-sized box | Correct findings, both taught in guide 06. It went `x = center` → Spacers → widths from outside. |
| — | Effort cells at width 0 in `WrappingLayout [ columns = 5 ]`, **no finding** | Documented ("a child with `flexes = true` takes its cell's width"), but silent, and the **second run in a row** to hit it (run 29 item 17). Candidate for a layout finding; recorded for a decision. |
| — | `fontFamily = { big ? app.display : null }` rendered **Times** | **Platform defect, confirmed:** `Text.fontFamily` is typed `Font`, which doesn't include `null`, yet the `{ }` passes R1–R3 and renders in the browser's default serif. Whether `null` should mean the provided face or be refused is a question of meaning, recorded for the user with this program. |
| 13.9 | R5: no node at `app.detail.0.actions.0` | Its path: the sheet's content is placed into its body (`defaultPlacement`). |

## Is it idiomatic Declare?

`idiom.py`: 972 lines without comments (the to-do app 843), 0 colour literals outside a
theme (to-do 1), 55 theme reads (69), 1 `State` (7), 23 width or phone branches (38),
24 `flexes` (7), no browser scripts or page lookups. The structure follows the to-do app:
a `Log` DataSource that owns its writes, computed defaults on the form, a Sheet keyed on
state. Its drift is the one it names: a sprung copy and `arrive()` per figure, fetches
chained so the figures don't count up when two sources land in either order, and
`liveAt` captured in `onLoad`.

## Findings for the platform

1. **`fontFamily = null` renders Times** (above). Defect; ruling needed on what `null` means.
2. **Zero-width cells under `columns`**, silent, two runs running. Candidate finding.
3. **`TextInput` has no baseline.** Gap.
4. **Source read:** `library/sheet.declare`, to learn whether a sheet's content scrolls. The
   reference says so since b00b895d, but in the class's full prose, which `declare-help Sheet`
   without `--all` does not print.
5. **Asked for again:** a `drive.read` in assert scripts (runs 29 and 30); a footer pinned in a
   Sheet; keeping a figure together in rich text (it didn't try an inline view or a no-break space).

## Its account, word for word

# Building Cadence in Declare: an account for the Declare team

## (a) Getting up to speed

**What I read, in order**

1. `README.md`, then the brief and `API.md`.
2. `skill/SKILL.md` and `AGENTS.md`.
3. `docs/declare.md`, the whole file.
4. Guide chapters `01-what-declare-is`, `04-structure`, `05-run-and-check` and `06-layout`, each in full.
5. `apps/todo/todo.declare` and `todo-parts.declare`, both in full.

That is the reading the skill prescribes, and I followed it exactly. After that I read by need:

- `10-touch.md` in full, for pan and zoom.
- `14-data.md` from line 160 on: Node classes, DataSource, writes, forms, sheets.
- `21-motion.md`, the Springs section, which includes `arrive()` and "write the value and its target together".
- `18-overlays.md`, Sheets and Toasts.
- `17-your-own-views.md`, Custom drawing.
- `12-text.md`, Fonts.
- The header and `declare-help map` of `apps/weather/weather.declare`.
- Many `npx declare-help` lookups: Sheet, Segmented, Stepper, DatePicker, TextInput, Spring, Time, DataSource, Toast, PinchEvent, WheelEvent, DrawContext, Shortcuts, ResponsiveLayout, HTMLText, RichText.textStyles, ChoiceControl, ChoiceItem, WrappingLayout.align, DatePicker.display, and others.

**What I skipped**

- Guide chapters `02` notation, `03` constraints, `07` scrolling, `08` controls, `11` themes, `15` schemas, `16` collections, `22` time and `23` animated arrangements.
- The calendar and marketmap apps, even though the skill points to the calendar for "a surface over time".

I skipped them because `declare.md` together with the touch chapter's "Pan and zoom about the fingers" fragment gave me enough to write the year surface, and I wanted to start building. In hindsight, reading `08-controls` would have spared me the ChoiceControl detour in (d). Reading the calendar might have changed how I drew the axis. I can't say whether it would have.

**What taught me the most**

- **The to-do app, read whole.** It gave me the program's shape: a dataset class that makes every write, the user's place on the App, computed defaults in a form that exists only while its sheet is open, `afterSettle(() => Focus.focus(...))`, and a dock with `pointerEvents = "none"` holding the phone button. I copied those patterns almost directly.
- **The 21-motion paragraph on `arrive()`**, and the hand-writes-value-and-target pattern. Both went straight into the code.
- **The pan-and-zoom fragment in `10-touch.md`.** My `YearSurface` handlers are close to verbatim adaptations of it.

**What was missing or misleading**

- Nothing was outright misleading.
- `declare-help Sheet` (without `--all`) didn't say that a sheet's content scrolls when it is taller than the sheet. That is why I opened the source (section (i)).
- `WrappingLayout [ columns = N ]` doesn't say that its children must flex to get a width (see (d), item 12).
- Where `arrive()` sits relative to when a value lands was clear enough in the guide. What I couldn't predict was how two sources landing in either order would interact, so I avoided the question (see (g)).

## (b) Expressing what I wanted

**Where it fit**

- **The year surface.** It is one view with a `draw()` that reads `app.vStart` and `app.vSpan`, two springs on those numbers, and `hold()` / `glide()` methods. This is exactly the model the touch chapter describes. Drag, pinch, trackpad and the zoom buttons all became a few lines each, and I wrote no redraw or update code at all.
- **"Numbers travel."** A sprung copy of each figure (`shownCount` and its Spring), with `arrive()` called on load. That is very little code for a real design requirement.
- **"Most likely meaning is already there."** Computed defaults on `SessionForm` (`minutes = { classroot.base?.minutes ?? app.log.usualMinutes(classroot.sport) }`) did this almost for free. A duration follows the sport until the person touches it, and no flag is needed.
- **"Everything derived is immediately true."** Writing the service's reply into the `Log` DataSource (`put` / `drop`) and letting `week`, `streak` and `yearDays` re-derive meant no refetching and no invalidation logic.
- **Controls and sheets.** `Sheet`, `Toast`, `Shortcuts`, `DatePicker` and `ChoiceControl` covered what I needed without building overlays by hand.

**Where I worked around it**

- **Text that breaks between figures but never inside one** (see (g)).
- **A Save button pinned to the foot of a sheet** (see (g)).
- **Keeping the session page's content alive while its sheet animates closed.** I kept two attributes, `openId` and `pageId`. That worked but was clumsy, and the clumsiness caused a bug (see (d), item 11).

## (c) The first time it ran

Once R4 passed, I took two screenshots, desktop and phone. What was wrong:

- **"4h 11m" broke across lines inside the figure** ("4h" / "11m") in the HTMLText hero line. I saw it in the screenshot.
- **The 2W / 3M / All labels were in a serif face and sat above their boxes.** Also seen in the screenshot.
- **"AUG 2(" was clipped at the chart's right edge.** Seen, and I left it largely as is.
- **The effort colours were too muted.** An effort-8 session read as salmon. Seen, so I changed the curve.

When I then opened the session page and the phone form:

- **The session page showed "0m" and "0/10".** I ran `declare-look --read app.pageId`, got `""`, and found that `LastSession.press` set `openId` but not `pageId`. My bug.
- **The effort cells had no fill.** `--read …cells.0.width` gave `0` (see (d), item 12).
- **The day chips ran past the phone's edge, and "1h 50m" overflowed its box.** These came as layout findings from `declare-look` after the tap.

## (d) Every refusal and surprise

1. **`align = baseline` on rows containing a TextInput, and on a row with a dot View.**
   - Platform: R1, DECLARE2000, "TextInput declares no baseline…".
   - Change: `align = center`.
   - Judgement: my error, and an excellent message.
2. **The Save button built as a fake icon** (an invisible `Nudge`). I removed that hack before the first compile, out of my own second thoughts; it was never refused.
3. **`Choice` as a Control with a `TextLabel [ x = center ]` and content width.**
   - Platform: R4, "Choice.width … is only its padding … TextLabel places itself in it (x = center or end), which counts it out." It suggested Spacers.
   - Change: Spacers first, then (item 7) back to `x = center` with the width given from outside.
   - Judgement: my error. `06-layout` explains this rule and I had read it. Good diagnostic.
4. **Accessibility warnings:**
   - DECLARE4026: four Choices are "one choice among several" but heard as toggles.
   - DECLARE4032: an EffortCell radio outside a RadioGroup.
   - DECLARE4035: the surface has a label but no role.
   - Change: ChoiceControl / ChoiceItem for the choices, and `accessibilityRole = image` on the surface.
   - Judgement: the platform was right, and these warnings improved the program. They taught me ChoiceControl exists, which I would otherwise have found only by reading `08-controls`.
5. **`commit(v: string) { if (v == "all") app.showAll() else app.zoomTo(Number(v)) }`.**
   - Platform: R1, "not a valid method body — ';' expected".
   - Judgement: my TypeScript was invalid (no `;` before `else`). The message was accurate but bare; naming the `else` would have helped.
6. **`class Pick`.**
   - Platform: R2, DECLARE4015, it collides with TypeScript's built-in `Pick`.
   - Judgement: a real surprise, and a good catch. I would never have guessed this one. My first rename failed only because macOS `sed -E` has no `\b`; that was my tooling, not Declare.
7. **Spacers inside content-sized Choices.**
   - Platform: R4 layout findings, "flexes, but … is as wide as its children, so there is no room left over".
   - Change: removed the Spacers and gave each Choice a width from outside (flex, or `width = 56`).
   - Judgement: my error. Correctly flagged.
8. **`zoomName` written as three nested `? :`.**
   - Platform: DECLARE4025 lint.
   - Change: a method with `if` statements. The method reads better.
9. **Phone boot findings:**
   - "app.page.body.year.4 runs past the window's right edge". The hint Text had no width, so it didn't wrap.
   - Four day bars at 43.1 × 124, below 44.
   - Change: `width = 100%` on the hint, and bar spacing from 8 to 5.
   - Judgement: both were mine, and both are things I wouldn't have noticed in a screenshot.
10. **`accessibilityLabel` on the hero lines' wrapper Views.** DECLARE4035 again; I removed the labels. Unsure whether a screen reader now hears "4", "sessions ·", "4h 11m" as one phrase. I didn't check `--semantics`.
11. **Session page showing zeros.** This was not a platform message. My code set `openId` without `pageId`, and `--read` found it. My bug.
12. **Effort cells at width 0 inside `WrappingLayout [ columns = 5 ]`.**
    - Platform: no message. R4 never built the form, and the findings `declare-look` printed after opening it didn't mention it either.
    - Change: `flexes = true` on each cell, which I copied from the to-do sidebar's `SmartTile`.
    - Judgement: docs unclear, and possibly a platform gap. A cell at zero width under a `columns` layout deserves a finding the way the Spacer case got one.
13. **The serif labels on the zoom buttons.** I wrote `fontFamily = { classroot.big ? app.display : null }`, expecting `null` to mean "inherit". The text fell to a serif face. Change: pass `app.uiFace` explicitly. Judgement: unsure. Either `null` means something other than "provided", or the default face is serif. I would have liked a warning, or a sentence in the reference saying what `null` does.
14. **Assert script: "no node at 'app.detail.0.actions.0'".** The sheet's content goes into its body (`defaultPlacement`), so the index path didn't resolve. Change: I named the child `page:`, after which `app.detail.page` worked. Judgement: partly my unfamiliarity. The path rules for content placed into a `defaultPlacement` body weren't obvious to me.
15. **Test data left on the service.** The first assert run failed partway and left session `s0249` behind. Verify's own note said so and pointed to `--fixtures`. I deleted the session by hand with curl. Judgement: the tool was right to warn me. I should have used fixtures, or made cleanup robust to failure.
16. **Toast past the right edge at 390, and the hardest-session text needing 284 px with 263** (`wrap = false`). Both were findings after taps; I shortened the toast copy and let the text wrap. Mine.
17. **Things I saw running that weren't what I wrote them to do:**
    - Month labels overlapped ("JAN 2026" over "FEB", and over day "2"). I rewrote the axis code.
    - "Harder than 0% of all sessions" read badly for an easy session. I added "Easier than…".
    - 2W pressed from the All view zoomed to the middle of the history. That is exactly what I wrote; I kept it and disclosed it.

## (e) Verifying it

- **`declare-verify`** (R1–R4, with `--phone --desktop`) ran after nearly every edit. It took seconds and caught items 1, 3–9 and 10.
- **`declare-look --shot` / `--shot-of`** at milestones caught the serif labels, the broken figure, the muted colours, the axis overlaps and the copy problems. Its layout findings after `--click` caught the overflows.
- **`declare-look --read`** answered "why is it zero?" twice, in one run each. This was the most valuable debugging tool I had.
- **`--drag`, `--pinch` and `--click-at` on the surface** confirmed that pan, zoom and tap-to-open work. `vStart` and `vSpan` changed, and `openId` was set.
- **Two R5 assert scripts.**
  - Phone: log in two taps and Save, check the totals, correct, delete.
  - Desk: `n`, type 40, Return, then delete.
  - Both pass, with 12 and 6 assertions.
  - `expect.request` with a `body` check was very useful.
  - I wrote my own `read` helper through `page.evaluate(__declare.find(...))` to get starting values. A first-class `drive.read(path, attr)` would have been nicer, unless one exists and I missed it.
  - I opened the session page by `drive.set`-ing `openId` and `pageId` rather than tapping a drawn bar. That means the tap path itself is tested only by the `declare-look --click-at` run.

**How well the tools served me:** very well. The one blind spot I hit: classes not built at boot get no checks until a script reaches them. Verify says so, which is honest, but the zero-width effort cells slipped through anyway.

**What I didn't use:** `--semantics`, `declare-profile` and dark mode.

## (f) Confidence, part by part

- **Today copy ("4 sessions · 3h 40m", "12 days" / "no streak"): high.**
  - Risk: the line is three Text views. A tester who reads text content may get different spacing than expected, because the words carry leading and trailing spaces.
  - Risk: "This week" is the last seven days, not the calendar week. That was my choice, made for the brief's Monday-morning story.
- **The week's shape: high.**
- **Live session: medium.** It was always present during my testing, so the no-live state and a session finishing were never seen. The elapsed clock interpolates from the last poll.
- **The year surface: medium-high in a desktop browser, unproven on a real phone.** The drag/scroll and pinch arbitration follow the docs. I didn't profile per-frame cost: the drawing re-records about 430 rectangles per frame, and the period summary re-runs on every pan frame.
- **The session page: high.**
- **Adding, correcting, deleting: high**, from the asserts.
  - Undo after delete (it re-POSTs, so the session gets a new id) was not tested.
  - The service-refusal toast was not tested.
- **Phone add flow: fairly high.** It fits one 844 px screen with Save visible. On a shorter phone the sheet would scroll and Save would leave the screen.
- **The six-times type rule: high** on the screens I looked at.
- **Where a tester would find problems:**
  - Short phones.
  - The "Yesterday" chip text is tight.
  - The default sport is guessed from weekday, not hour.
  - The axis label is clipped at the right edge.
  - Focus moving into the note field on a phone was never checked.

## (g) Gaps I worked around

1. **A figure that never breaks inside a line of rich text.**
   - I wanted something like a no-wrap span.
   - I looked at the `HTMLText` and `RichText.textStyles` reference and found no wrap control for spans.
   - Instead I built a `WrappingLayout [ align = baseline ]` of `Figure` and `Word` Texts with `wrap = false`.
   - Judgement: possibly present. The HTMLText reference says your own view classes are inline tags flowed as boxes, so `<Fig text='4h 11m'/>` might have done it. I didn't try.
2. **A footer pinned inside a Sheet.**
   - I wanted Save to stay on screen while the form scrolls.
   - I didn't find a footer slot in `declare-help Sheet`.
   - Instead I compacted the form, moving the note behind "+ Add a note" and shrinking the duration figure to 80.
   - Judgement: unsure. I didn't search hard (`Sheet --all`, `ignoreScroll` inside a sheet).
3. **Mixing colours.**
   - I wanted to interpolate between two theme colours.
   - I didn't look in the reference; I wrote `mix()` in script.
   - Judgement: unsure whether a built-in exists.
4. **Date formatting.**
   - I hand-wrote the month and day tables instead of using `Intl`, which the docs say is allowed.
   - Judgement: my choice, not a gap.
5. **Making sure the figures appear on first load rather than counting up when two sources land in either order.**
   - I chained the fetches: `/api/today`'s `onLoad` fetches the log, and the log's `onLoad` calls `arrive()`.
   - Judgement: unsure whether it was needed. It does read as choreography, which the docs discourage.
6. **Elapsed live time between polls.**
   - I stored `liveAt = clock.now` in `onLoad`. That is close to the "flag set when data arrives" drift pattern, though I think a timestamp is legitimate.
   - Judgement: unsure.
7. **Font URLs.**
   - The face needed a woff2 URL, so I curled Google's CSS to get one.
   - Judgement: not a platform gap.

## (h) Changes of direction

1. **Hero lines:** HTMLText with `textStyles`, then Text runs in a WrappingLayout. Changed early, at the first screenshot, when "4h 11m" broke.
2. **Choices:**
   - They started as a Control with `on` and `press()`, and became ChoiceItems inside ChoiceControls, after DECLARE4026/4032. The zoom buttons followed, with a derived `zoomName`.
   - The class was renamed Pick, then back to Choice after DECLARE4015.
3. **Choice label centering:** `x = center`, then Spacers, then `x = center` with widths given from outside. Driven by two successive findings.
4. **Day picker:** four chips plus a DatePicker on a wrapping row, then three flexing chips plus a narrow DatePicker showing "Earlier" through an overridden `display`. Driven by the overflow finding and the need to fit on a phone.
5. **The note:** first always shown, then behind a press on phones, so the form fits one screen. My own second thoughts after the phone screenshot.
6. **Heat curve:** `((e−1)/9)^1.6`, then `((e−2)/7)^1.3`, after seeing muted colours.
7. **Axis labels:** rewritten after seeing them overlap.
8. **The `standing()` sentences, the toast copy, and the hardest-session text wrapping:** all from screenshots or findings.
9. **At planning only:** a list of the period's sessions under the year, dropped in favour of "hardest in this stretch".

## Surprises

- DECLARE4015 (the TypeScript lib collision).
- The accessibility lint being both right and educational.
- `fontFamily = null` falling back to serif.
- How much of the to-do app's structure carried over unchanged.

## What was good and what was bad

**Good**

- Diagnostics that name the fix.
- Fast verify.
- `--read` against a running program.
- Springs and computed defaults.
- A drawn surface with no redraw plumbing.
- The library's sheet, toast, shortcuts and choice controls.

**Bad**

- **The sharpest edge was a pattern, not one obstacle: who decides a size.** Content-sized parents not counting `x = center` children, flexing children in content-sized parents, and `columns` cells needing `flexes`. Roughly five or six iterations, perhaps 15% of the build. The rule is in `06-layout`, and I'd read it. What I needed was the rule restated at the point of use: in the `Control`/`TextLabel` and `WrappingLayout.columns` reference entries, and a finding for zero-width cells.
- **Paths into `defaultPlacement` content were the second friction.**

## How it compares

- **QML** most of all: property bindings, states, a declarative tree with script inside it.
- **SwiftUI** a little, for springs and the "describe the destination" model.
- **OpenLaszlo**, the stated lineage.
- **Unlike React**, there is no rendering model to reason about at all.
- **Static checking of constraint reads** is the part with no real analogue in the frameworks I know.

## Where I'd most want improvement

1. Layout findings for zero-sized children under any library layout.
2. Clearer reference prose on how `null` behaves for provided attributes.
3. A documented way to pin a footer in a sheet, or to keep words together in rich text.
4. A `drive.read` in assert scripts.

## What I'd use it for

Touch-first data apps and dashboards where motion carries meaning, and prototypes that need to feel finished. I'd be more hesitant for document-heavy or SEO-critical sites until I'd tried the crawl output.

## (i) Source reads

**`library/sheet.declare`, its first 60 lines** (the header doc comment and the per-member docs).

- **What I wanted:** whether a sheet's content scrolls when it is taller than the sheet, and how `edge = "end"` behaves on a phone.
- **Where I looked first:** `declare-help Sheet` and `declare-help Sheet.edge`. The edge answer was there. The scrolling answer wasn't in the short form, and I didn't run `Sheet --all`, so it may well have been in the reference prose.
- **What the docs should say:** the one sentence "What it holds stands in a column and scrolls inside the sheet when it is taller than the sheet" belongs in the short `declare-help Sheet` summary or in the guide's Sheets section, which shows a sheet but doesn't mention it.

**A grep of `library/*.declare` for the SanFrancisco theme's tokens**, to know which names the library reads. It returned nothing useful. I relied on the "theme tokens it reads" lines in `declare-help` output instead, and those were sufficient.

## Names

```
NAMES — eval-cadence-30.noindex: 0 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)

SUMMARY: 0 of 0 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
