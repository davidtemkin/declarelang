# Venue run 9: Declare 7dd3360c (run 8's fixes, declare-start, the checker), Opus 5.5

**Run:** 2026-10-27, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-9 claude-opus-5-5 7dd3360c 8350` against GitHub main.

The same brief, service, port, model and prompt as run 8. The tools add `Agent`, which is harness capability and
allowed for every stack. What changed between them (`7dd3360c`):
- **Run 8's platform bugs:**
  - a `Form`'s deferred work is dropped when the form is discarded (`afterSettle` owned by the node);
  - a sheet opened by a finger no longer judges its first field;
  - `Checkbox` and `Radio` are 44 high on touch.
- **Verification:**
  - a page error or a handler's throw names the program's lines ("in Panel.count (line 2), from Panel.go (line 3)");
  - a run that fails after talking to a service earlier runs wrote to says so;
  - the dev server's own `/compile` posts are no longer counted as writes.
- **Reference:** `declare-help X --all` lists each member's entry, and a bare member name with one owner answers with
  its entry (`declare-help waypoint`).
- **Two new tools, both new to the skill:**
  - **`declare-start`.** The skill's table of needs gained a Pick column. Its "Read first" step now says to read
    the brief, choose needs and at most one whole program, run `npx declare-start --pick … --program …`, and read
    what it writes whole, once.
  - **The checker** (`docs/operational/checking.md`, `npx declare-check`). One bullet in "Checking and looking"
    says to hand a check of more than one command to a checker, a second agent started fresh, through the Agent
    tool.

The point of the run was to see whether the curated pre-read and the checker cut the cost of building. Run 8 spent 85%
of its cached input in debugging and verification.

**Try it:** the app's four files, its six check scripts (`tests/`), the eleven pictures the agent read (`shots/`), the
reading `declare-start` wrote for it (`start/`) and the acceptance results (`drive/`) are filed beside this report.
The files are as the agent left them; the formatter's `--check` passes on all four.

## The comparison

Build figures come from the build's own final record. The account was asked for afterwards in a read-only resume
(1.2 min, 6.3k output tokens, $8.86, because the resume re-reads the build's context) and is counted separately.

| | Venue 7 | Venue 8 | **Venue 9** | Venue React 1 |
|---|---|---|---|---|
| Declare commit | `a1edccb3` (forms) | `496944cf` | **`7dd3360c`** | — |
| time | 25.6 min | 32.6 min | **29.5 min** | 31.4 min |
| turns · tool calls | 108 · 110 | 129 · 128 | **79 · 78** | 101 · 97 |
| code, raw lines | 1,814 (4 files) | 1,746 (6 files) | **1,655** (4 files) | — |
| code, excluding comments and blanks | 1,390 | 1,264 | **1,223** | 4,861 |
| **Tokens** | | | | |
| output (incl. thinking) | 115k | 148k | **127k** (62k thinking) | 147k |
| fresh input (cache writes) | 291k | 333k | **332k** | 199k |
| cached input re-read | 19.6M | 30.4M | **17.2M** | 9.3M |
| cost (list price) | — | $11.71 | **$8.64** | — |
| read before first app write | 387 KB | 394 KB | **446 KB** | 23 KB |
| context at first write → end | 191k → 299k | 183k → 339k | **220k → 340k** | 42k → 205k |
| first app write at | 7.6 min | 7.3 min | **7.9 min** | — |
| **Download (gzip)** | 170.3 KB | 176.0 KB | **176.0 KB** ¹ | 158.5 KB + ~85 KB fonts |
| hidden acceptance (`drive.mjs`) | 10 of 11 | 11 of 11 | **11 of 11** | 11 of 11 |
| runtime source read | 0 | 4 calls | **0** | — |
| library source read | 4 calls | 3 calls | **2 calls** (`radiogroup` for the direct-child rule; `tabOrder()` overrides) | — |
| tool source read | 2 calls | 0 | **0** | — |
| names refused by a check | 2 | 1 | **6**, one cause (below) | — |
| checkers started | — | — | **0** | — |

¹ `declarec --sizes` from main: program 38.7 KB, runtime 124.5 KB, kernel 12.6 KB.

**The headline: 11 of 11 in 79 turns, with the least cached input of any Declare Venue, but the checker was never
used.**
- **Acceptance:** every scenario passes, as in run 8.
- **Cost:** 43% less cached input than run 8 and 12% less than run 7; $8.64 against $11.71. 50 fewer turns than run 8.
- **Time:** 3 minutes faster than run 8, but 4 slower than run 7. Fewer turns did not mean less waiting: the six flow
  scripts were rerun as a set twice at the end, and each set takes about 1.6 min.
- **Code:** 1,223 lines, the least yet.
- **Idiom:** better than run 8. Both of run 8's big missteps are gone: the phone hall has 44-point seats and never
  reads `lastPointerType`, and checkout is a `waypoint`. The new missteps are smaller (a form `error` never shown, a
  performance row that should be a link).
- **One check proved nothing:** the keyboard-only script typed every value one field off and passed R5 because it
  asserted nothing. The brief’s keyboard-only purchase was never shown to pay, and the acceptance has no keyboard scenario to catch it.
- **Where the saving came from:** the debugging and verification phase, which took 45 calls against run 8's 90. No
  bug from run 8 recurred. One new one cost about 2 minutes (`provided()` on the App, below).
- **The pre-read cost more up front:** 446 KB read and 220k context at the first write, against 394 KB and 183k. It
  did not shorten the reading phase (7.9 min). The agent's account credits what it taught; it is not separable from
  the run 8 fixes in one run.

## Where the time and the tokens went

| phase | time | API calls | cached input re-read | share |
|---|---|---|---|---|
| **Reading and planning** (0–7.9 min) | 7.9 min | 23 | 2.44M | 14% |
| **Writing** the four files (7.9–14.3) | 6.4 min | 5 | 1.13M | 7% |
| **Debugging and verification** (14.3–29.5) | 15.2 min | 45 | 13.66M | **79%** |

The build ran 25 `declare-verify` runs (14 with its own scripts), 5 `declare-look` runs, and read 11 pictures,
two of them contact sheets the agent stitched with PIL from four screenshots each. Tools ran for 8.4 of its 15.2
minutes, as in run 8 (8 of 19.3). The model's own turns fell from about 11 minutes to 7.

| minutes | what | cause |
|---|---|---|
| 0.8 | compile fixes | normal: a schema and a class both named `Seat`; `class Amount [` with no base; `textAlign = end`; a path through an unnamed `Field` |
| 1.6 | first look at the hall on a desk and a phone; seats made a thumb's size | design work |
| 1.9 | two flow scripts, desk and phone | normal. About 0.3 min was its own wrong prices in the scripts. Found a real gap: a seat taken during checkout was announced only in the hall |
| 2.2 | contact sheets of the phone flow; checkout layout, tickets | visual polish |
| **~2.0** | the keyboard path | Tab order in the hall. **Silent platform behaviour:** after a `tabOrder()` override left a heading out, `Focus.focus(heading)` did nothing and focus fell to the page. `Focus.apply` returns without a word when `canFocus` refuses (`runtime/src/focus.ts`) |
| 2.5 | session, reload, double press and 409 scripts; reduce motion added | normal |
| **~2.0** | every script failing at R5 | **doc/platform bug:** `stillness = { provided("accessibilitySettings").reduceMotion == true }` on the App throws "no ancestor provides". `App.accessibilitySettings`'s entry says "Read it anywhere as `provided("accessibilitySettings")`"; on the App itself there is nothing above to provide it. Boot passed because the value is read only when a seat is picked |
| 2.4 | fix, the six scripts again, the summary | normal |

## declare-start and the checker

**declare-start was used as the skill says.** In its first minute, straight after the brief and the skill and
before `docs/declare.md`, the agent ran `npx declare-start --help`, then
`npx declare-start --pick form,service,touch,accessibility,layout,motion --program tracker`. It read the three
files once, whole (guide 79 KB, reference 21 KB, the tracker's outline 5 KB), alongside the core chapters and the
to-do app. After that its reading was `declare-help` lookups only, and two library reads. Its account: "Reading it
once was right, but much of the guide text (pan-and-zoom, the whole accessibility chapter) I used only lightly. That
was my choice of picks, not the tool's fault."
- **Six picks gave 79 KB of guide.** `touch` brought all of § Pan and zoom about the fingers; `accessibility` the
  whole chapter. A pick is a whole row, so the size follows the rows' citations. Tighter citations in the table would
  shrink it.
- **The program pick was the tracker**, not the calendar or the to-do app. The outline was read and no part of the
  tracker was read after it.
- **No effect on the reading phase's time.** The first write came at 7.9 min, as in runs 6–8 (6.6–7.6).

**The checker was never used.** The skill's bullet was read (it is in the skill the agent read at minute 1), and
nothing in the agent's text or thinking mentions a checker, a sub-agent or delegating until its account: "I didn't
use a checker sub-agent (`docs/operational/checking.md`) despite the skill recommending it. Assert scripts plus a few
screenshots were enough; I can't say whether a checker would have caught more." The causes, from the skill as it
stands:
- **It was advice, and the agent judged its case out of it.** "Hand a check of more than one command to a checker"
  invites a judgment; its final regression of six scripts was one Bash command.
- **The rest of the section teaches doing it yourself,** in detail: assert scripts, looks, `--shot`.
- **It is read at minute 1 and needed at minute 16,** with nothing at that point to bring it back.
- **The saving is not the agent's.** It does not feel its context growing.

`declare-start` was a concrete command at a fixed step, and it was followed. That is the model for the checker:
one way to check, named at the step where checking starts, with the tools pointing to it.

**What a checker could have taken.** Context grew from 220k to 340k after the first write. About 46k of that was tool
text, two-thirds of it the agent's own edits (which carry the code). The rest was the agent's own writing and the
eleven pictures. A checker would have taken the six scripts' writing and output and all eleven pictures. Each of
the 45 later calls re-read the context, so every 10k kept out saves about 0.45M cached input.

## Is it idiomatic Declare?

Yes, more than run 8. Both of run 8's big missteps are gone. The phone hall is a 44-point scene in a pane that
scrolls both ways, with an overview map. It never reads `lastPointerType`, so every press on a seat means one thing.
Checkout is a `waypoint`, so Back from checkout returns to the hall with the seats kept. The two slips that matter
now are smaller, and both are about the payment form's own words. First, `PayForm.error` is never shown, so its
`failedMessage` never reaches the person. Second, a performance row writes `location` from `press()` instead of
being a `link`. Three of run 8's smaller missteps recur: the sign-in form is keyed on the opening flag, `tabOrder()`
rebuilds its list, and day and month names are hand-written tables. One of the three is the docs' fault: the guide
the agent read teaches the flag.

Files are `my-apps/venue/`. `venue.declare` is the App; the others are cited by their suffix (`-hall`, `-checkout`,
`-parts`). "Call N" is the agent's Nth tool call in `logs/agent.stream.jsonl`. "Min" is minutes from its first
record (23:38:45Z). The build took 78 calls and 29.5 minutes. The hidden acceptance passed 11/11.

### What it gets right

- **Where the person is.** The performance is `location` and checkout is `waypoint` (`venue.declare:295–297`).
  `screen` is derived through named facts (`paying`, `atPerformance`, `:304–306`). The compiler's DECLARE4025 asked
  for those names (call 35), and the agent took the advice. Run 8 missed `waypoint` because `declare-help waypoint`
  printed only a pointer. This time it printed `App.waypoint`'s full entry (call 19, min 2.6), and the agent used it.
- **The phone hall.** The pitch is 44 on a phone and the row depth is a full pitch (`venue.declare:398–402`), so a
  seat is 44 × 44 (`-hall:59–61`). The hall pane `scrolls = both` (`-hall:359`). The overview map shows the whole
  house and moves the pane (`-hall:214–261`). There is no pointer-type test anywhere in the program. Run 8's
  misstep 1 is gone.
- **Its own layout for its own arrangement.** `PanelLayout extends Layout` (`-hall:312–327`) divides the hall screen
  and the checkout screen. Wide, the panel sits beside the content. Narrow, there is a head, the content, then a
  foot. It reads `contentExtent` and the children's `contentHeight`, as `Layout` teaches. This replaces run 8's
  hand-computed sticky summary and its guessed 200-pixel foot pad.
- **A row is one Tab stop, and the arrows move along it.** `RowLine` has `focusScope = stop`, with role `group` and a
  row name (`-hall:89–91`). That is `FocusScope`'s `stop` as documented ("it is one Tab stop and the arrows move
  inside"). Run 8 walked `surface.children` three deep to answer the arrows by hand. Here the platform does it, and the
  keyboard script shows it working (call 67: "right → Orchestra, row A, seat 15").
- **A seat is a drawn control that says what it is.** It is a `Control` with role `checkbox`, and
  `accessibilityChecked` is bound to `mine` (`-hall:64–67`). The name is exactly the brief's. The three states differ
  in shape through two `State`s (`-hall:31–36`). Row letters, the stage, the legend and the map are
  `accessibilityHidden` (`-hall:93, 98, 165, 214, 266`).
- **Forms.** `PayForm` sends `app.order` with `enterMoves` (`-checkout:88`). `refusedWith` reads the body through a
  declared `Refusal` schema (`venue.declare:171`, `-checkout:98`). That closes run 8's `as any` (misstep 8).
  - After a decline it sets `judged = false` on the shown code field and focuses it (`-checkout:104`). That is the
    case `TextInput.judged` names, and it closes run 8's misstep 5.
  - There is no hand-made send guard. The Pay label reads `app.payForm.pending` (`-checkout:365`), which closes run 8's
    misstep 4. The session script's click, click and Enter sent one order (call 71).
  - Each way of paying is built only while it is chosen (`exists`, `-checkout:145, 165, 180, 252`), so the form
    counts only the fields it sends.
  - The values live on the App as computed defaults that follow the account (`venue.declare:435–447`).
- **ValueControls as fields.** Saved cards are `Radio`s replicated from `:cards[]` inside a `RadioGroup`, with an
  expired card `disabled` (`-checkout:129–138`). The country is a `Combobox` with `purpose = country`
  (`-checkout:282–287`).
- **Data.** `House extends DataSource` holds the seat map's logic, and its one write goes through `set`
  (`venue.declare:187–234`, `:213`). An `EventStream` with `listenTo` re-fetches the map in `onOpen`, so nothing sold
  while it connected is missed (`:332–339`). Money uses `Intl.NumberFormat` (`:46–48`).
- **The overlay's frame.** The sign-in `Sheet` is the "Open as state" pattern: `shown` plus `input`
  (`venue.declare:514–515`).
- **Motion that does a job.** One `Animator` drives the pick burst and the total's lift (`venue.declare:355`,
  `-hall:200–205`, `:433`). It stands still under reduced motion (`venue.declare:356–358`).
- **Focus after a change of screen.** `afterSettle(() => app.focusScreen())` runs from `onChange` on `screen`
  (`venue.declare:311`). That is the to-do app's idiom.

### Missteps

1. **The payment form's `error` is never shown, so `failedMessage` is dead.**
   - **What it does.** `PayForm` sets `failedMessage` (`-checkout:89`). For a refusal that names no field, its
     `refusedWith` copies the message into an App attribute, `app.payProblem` (`-checkout:100`,
     `venue.declare:468`, `:486`). The pay panel shows `payProblem` (`-checkout:352–354`). Nothing reads
     `app.payForm.error`. The grep finds `classroot.error` only in `SignInForm` (`-checkout:409`).
   - **Why it is wrong.** `Form.error` is "the message that belongs to no field: a refusal that names none … or
     `failedMessage` when the request failed without a readable reply. Shown wherever the program places it." The
     form already puts a decline's sentence there (`library/form.declare:315`) and clears it on submit (`:260`,
     `:288`). The guide the agent read shows exactly this: `text = { app.signIn.problems[0]?.message ?? app.signIn.error }`
     (`docs/guide/14-data.md:585`). As written, a pay request that gets no reply leaves the screen silent. The
     button stops saying "Paying…", and that is all.
   - **Written as:** `problem: Text [ visible = { app.payForm.error != "" }, text = { app.payForm.error } ]`. Delete
     `payProblem`, the `submit()` override that clears it (`-checkout:92`), and the copy in `refusedWith`.
     `declined()` keeps only the code reset.
2. **A performance row writes `location` from `press()` instead of being a link** (`-parts:82–92`).
   - **What it does.** `PerfRow extends Control` and its `press()` does `app.location = classroot.perfId`. To a
     screen reader it is a button. Call 69 lists all twenty rows among the `button` elements.
   - **Why it is wrong.** `20-urls.md:136–140`: "Links write `location`; everything else derives." `View.link`: "The
     view realizes a real `<a href>`, so ⌘-click, copy-link and the build's crawler all work." The App's own comment
     calls the performance "a link someone could share" (`venue.declare:291–292`). As written, nobody can copy it or
     open it in a new tab.
   - **Written as:** `class PerfRow [ link = { "#" + (:id ?? "") }, … ]`, with the hover fill kept.
3. **The sign-in form is built on the opening flag, so it vanishes while the sheet slides away**
   (`venue.declare:516`: `SignInForm [ exists = { app.signingIn } ]`).
   - **Why it is wrong.** `18-overlays.md:191–197` says to key it "on `present`, they stay through the closing motion,
     where keyed on the flag that opens it they vanish while the panel is still sliding away". `Floating.present`
     says the same. A password typed and then dismissed with Esc also stays in `app.password`, because only
     `signedIn()` clears it (`venue.declare:416–421`). The hook for that is `closed()`.
   - **Written as:** `SignInForm [ exists = { app.signInSheet.present } ]`, plus
     `closed() { app.password = ""; app.showPassword = false }` on the Sheet.
   - **Not the agent's fault.** It copied the docs. `14-data.md:589–635` ("A form in a sheet"), which its start
     bundle included, writes `NewPage [ exists = { app.adding } ]`. The two chapters disagree (see the workarounds).
     Run 8's half of this misstep, the values held on the form, is fixed: they are on the App.
4. **`tabOrder()` rebuilds the list** (`-hall:339`: `[this.overview, this.side, this.hallPane]`).
   - At call 64 (min 21.0) the agent read `View.tabOrder` ("Compose with `tabDefault()` rather than rebuilding the
     list"). Its grep printed `birds` and `calendar` composing that way. It wrote one composed override on `HallSide`
     (call 65), removed it (call 67), and then rebuilt the screen's list (call 68).
   - The list names every child, so it works today. A view added to `HallScreen` later would be left out of Tab with
     no warning.
   - **Written as:** `tabOrder() { return [this.overview, this.side, ...this.tabDefault().filter((v) => v != this.overview && v != this.side)] }`.
   - This is run 8's misstep 6, unchanged.
5. **Button heights set at each use site instead of through the theme.**
   - **What it does.** It sets `height = { app.tap }` or `{ app.touchFirst ? 44 : 36 }` on seven Buttons
     (`-parts:68, 71, 267, 274, 280`; `-hall:435`; `-checkout:114`). `app.tap` (`venue.declare:277`) is that same
     formula, written out again at `-parts:68, 71`. These were the fixes for the R4 and R5 target findings (calls
     38, 49).
   - **Why it is wrong.** `Button.height`: "The theme decides … `provided("theme").buttonHeight` sets it." The theme
     is already a constraint (`venue.declare:263`). Run 8 set `buttonHeight` once.
   - **Written as:** `theme = { { ...SanFrancisco, ...Venue, buttonHeight: app.tap, comboboxHeight: app.touchFirst ? 48 : 42 } }`.
     Keep the per-site heights only where a button really differs (`Pay`, 52, `-checkout:364`).
6. **A seat lost to another buyer is announced twice.**
   - **What it does.** `seatTaken` and `seatsLost` call `Accessibility.announce(…, "assertive")`
     (`venue.declare:382`, `:395`). The text also lands in a notice view with `accessibilityRole = status`
     (`-hall:397–399`, `-checkout:339–340`).
   - **Why it is wrong.** `View.accessibilityLive`: "A `status` role is polite without saying so." The `Accessibility`
     entry says `announce` is for text "with no view to say it from — … A view whose own changes should be heard
     sets `accessibilityLive` instead." `19-accessibility.md:100–102` draws the same line. Here there is a view, so a
     screen reader hears the sentence twice: once at once, then again at the next pause.
   - **Written as:** drop the two `announce` calls and give the notice `accessibilityLive = assertive` beside its
     `status` role, as the pay problem line already does (`-checkout:353`).
7. **Hand-written day and month tables** (`venue.declare:44–45`, `:56–67`).
   - `12-text.md:29–34`: "`Intl.DateTimeFormat` writes weekdays and months in the language it is given. Name the
     locale, and a `timeZone` for a date."
   - The service's times are hall-local wall-clock strings, and the program reads them "never through a time zone"
     (`:50–51`). `Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })`
     over `Date.UTC(…)` of the parsed parts does that with no tables.
   - This is run 8's misstep 7, unchanged.
8. **The overview map aims on every pointer move, pressed or not** (`-hall:227–228`).
   - `onPointerMove(e) { aim(e.x, e.y) }`. `View.event.pointerMove` fires when "the pointer moved over the view —
     and, once pressed on it, every move while captured". With a mouse, in a window under 860 points wide
     (`venue.declare:276`), merely passing over the map scrolls the hall. The brief says nothing may depend on
     hovering.
   - **Written as:** latch at the press and move by `deltaX`/`deltaY`, as `09-pointer-and-keyboard.md:101–106` does,
     or set a `dragging` flag in `onPointerDown` and clear it in `onPointerUp`.

Run 8's missteps, one by one: 1 (`lastPointerType`) gone; 2 (checkout not a waypoint) gone; 3 (sign-in reset by
`exists`) half recurs (misstep 3); 4 (send guard) gone; 5 (code left judged) gone; 6 (`tabOrder`) recurs (misstep
4); 7 (date tables) recurs (misstep 7); 8 (`as any`) gone.

### Workarounds the platform forced

1. **`provided("accessibilitySettings")` throws on the App** (`venue.declare:356`; calls 75–78, min 25.0–27.0).
   - **What happened.** `App.accessibilitySettings` says "Read it anywhere as `provided("accessibilitySettings")`".
     `19-accessibility.md:142` says the same. The agent read that entry at call 75 and wrote it on the App (call 76).
     All six scripts then failed at R5 with "no ancestor provides 'accessibilitySettings'" (call 77).
   - **The workaround** reads the App's own attribute and has to cast it, because its type is `object`:
     `(app.accessibilitySettings as { reduceMotion?: boolean }).reduceMotion`.
   - **The platform should** let `provided` find the App's own built-in provided names, or the entry should say
     "below the App". The attribute should be typed, so no cast is needed.
2. **The two guides disagree on a form in a sheet.** `14-data.md:589–635` builds the form on the opening flag;
   `18-overlays.md:191–197` says that empties the panel mid-slide and keys it on `present`. The agent read only the
   first (it was in its `declare-start` bundle, `work/start/guide.md:127–180`). Fix `14-data.md`'s example to
   `exists = { app.sheet.present }`.
3. **A heading has to be a Tab stop to take the focus after a change of screen.** Every screen heading is
   `focusable = true` (`-parts:133, 249`; `-hall:349, 382`; `-checkout:308`).
   - `Focus.focus`: "Focusing a view that is not focusable is a no-op." `View.focusable`: "Makes the view a keyboard
     tab stop."
   - So each heading is also an extra Tab stop. The keyboard script shows it: "tab → Sign in, tab → The Marriage of
     Figaro" (call 63).
   - No guide chapter says where focus should go after a change of screen. A focus target that is not a Tab stop (the
     web's `tabindex=-1`) would fix both problems.
4. **No `alert` role.** The first compile tried `accessibilityRole = alert` twice (call 32, min 14.4). The compiler
   listed the roles, and the agent fell back to `status` plus `accessibilityLive = assertive` (`-checkout:353`,
   `:409`). This is run 8's workaround 11, unchanged.
5. **`Button` and `Combobox` ignore `touchFirst`, though `Checkbox` and `Radio` follow it.**
   - `Checkbox.height` is now "44 on a touch-first device", so run 8's workaround 9 is fixed in the library. So is
     `Radio` (`library/radiogroup.declare`, the `height` entry).
   - `Button.height` comes from `buttonHeight` (40), and `Combobox.height` from `comboboxHeight` (30), on every device.
     R4 and R5 flagged both (see the next section).
   - The library should size them from `touchFirst`, as it does the other two.
6. **Formatting as the person types, and an accessory inside a field** (run 8's workaround 5, unchanged).
   - Grouping the card number and keeping the caret are done by hand in `onInput` (`-checkout:193–200`;
     `venue.declare:86–100`).
   - The card's kind sits over the field through `padding = [0, 120, 0, 12]` and an `ignoreLayout` label placed from
     `parent.width` (`-checkout:189`, `:211`).
7. **Radios from data.** It read `library/radiogroup.declare` (see below) to learn whether `Radio`s replicated from
   `:cards[]` count as the group's radios. `RadioGroup` says "Radios are written as the group's direct children".
   This is run 8's workaround 6, unchanged.
8. **A computed list still needs a `Dataset` to replicate over** (`lines`, `venue.declare:342`). This is the
   language's rule, unchanged.
9. **First-compile diagnostics** (call 32, min 14.4).
   - `class Amount [` without `extends Text` produced four DECLARE2000 misses: "no attribute 'textAlign'",
     "'numeralWidth'", "declares no baseline", "'text'". `FormHeading` produced the same miss, at four sites.
   - None of the messages says that a class with no `extends` is a plain View. "Did you mean `extends Text`?" would
     have named the fix. It cost one call.
   - The schema `Seat` and the class `Seat` collided (DECLARE5001, call 31). The message was plain, and a rename
     fixed it.

### The driven layout findings

R6 never ran: no states script was written. Layout findings came from R4 (boot), from R5 (the assert scripts) and
from `declare-look --touch`.

| finding (when) | in the final program | judgement |
|---|---|---|
| **R4, phone: 4 controls under 44 × 44**: `app.bar.4` 95×36 (Sign in), `tickets.col.pager.0` 98×40, `pager.2` 68×40, `tickets.col.5` 236×40 (call 37, min 15.0) | **fixed**, with a height on each Button (call 38; `-parts:68, 71, 267, 274, 280`) | Right size, wrong place: `buttonHeight` in the theme (misstep 5). The root cause is that `Button` ignores `touchFirst` (workaround 5). |
| **`declare-look --touch`: 649 controls under 44 × 44**: `app.bar.back` 32×44, and every seat 36×31 (call 42, min 15.7) | **fixed**: pitch 44 and row depth 1 on a phone (calls 45, 49; `venue.declare:401–402`); the back control `width = { Math.max(app.tap, this.contentWidth) }` (`-parts:49`) | The right fix, and the one that matters most. The agent's note: "seats are 36×31 — below a thumb's 44" (min 16.0). |
| **R5 `flow-phone`: 2 controls under 44 × 44**: `form.who.1` 84×32 (the form's Sign in, `height = 32`) and `billing.4.1.2` 173×30 (the country `Combobox`) (call 48, min 17.6) | **fixed** at the use site (call 49; `-checkout:114`, `:282`) | Right for now. `comboboxHeight` in the theme would cover every combobox. The library default is the real gap. |
| **"never built … so never checked for layout: SignInForm"** (desk scripts, calls 47 and 60) | covered: `flow-phone` and `session` open the sheet, and no finding came back (calls 49, 71) | Fine. |

**What the checks hid.** The final runs filter verify's output to `R5 |no node|expected|error` (calls 77–78), as do
the keyboard runs (calls 66–68). A layout line would not have been printed, so the last word on layout is call 49's
`flow-phone`.

**A pass that proved nothing.** The last keyboard script (call 68) typed one field off. Its first `tab + type` landed
on "Sign in", so every value went into the field after the one meant. It ended with "enter → Country, screen pay".
R5 reported ✓ because the script asserts nothing, and the agent moved on. The desk keyboard-only purchase, which
brief §10 asks for, was never shown to pay.

### Reading the library and runtime

| read (min) | what it was after | in the reference? |
|---|---|---|
| `grep -rl "cardNumber" apps library` (call 17, min 0.9) | An example card form. It found none. | No example, but `TextInput.purpose` lists `cardNumber`, and the agent used it. |
| `cat library/radiogroup.declare \| head -150` (call 20, min 2.7) | It came straight after `RadioGroup --all` (call 19). It needed to know whether radios can come from data. The source's `radios()` walks `this.children` for anything with a `choice`, so replicated `Radio`s count. The final code relies on that (`-checkout:129–136`). | **No.** `RadioGroup` and `Radio` say "direct children" and never mention replication. The same gap as run 8. |
| `grep -rn "tabOrder()" library/*.declare apps/*/*.declare` (call 64, min 21.0) | Examples of `tabOrder` overrides, after reading `View.tabOrder`. | **Yes**: the entry and the examples both compose with `tabDefault()`. The program still rebuilt the list (misstep 4). |

There were no reads of `runtime/`. That is down from run 8's four library and runtime reads.

### Silent misses

Each compiled, and each means something other than what was meant.

- **`failedMessage`** (`-checkout:89`) is set and never seen, because `PayForm.error` is not placed anywhere
  (misstep 1). `app.payProblem` (`venue.declare:468`) is a second copy of `Form.error`.
- **`accessibilityHint`** carries a seat's state and price: "Sold", "$80.00, free" (`-hall:68`). It reaches the page
  as `aria-description="Sold"` (call 69). `View.accessibilityHint` says a hint is "what pressing it does".
  `accessibilityValueText` is for a spoken value. The brief fixes the name, so the hint is the only slot left. The
  reference should say where a control's status goes when its name is fixed. Borderline, as in run 8.
- **`PerfRow`'s role.** A `Control` whose press navigates is a `button` to a screen reader (misstep 2).
- **`exists = { app.signingIn }`** reads as "built while open", but it means "torn out the moment it starts closing"
  (misstep 3).
- **Two smaller ones:**
  - The hall's header comment says a phone draws seats "at a pitch a thumb can hit (36 points a seat)"
    (`-hall:15`). The pitch is 44 (`venue.declare:401`).
  - `Barcode` counts `run` and never reads it (`-parts:167–169`).

## Names

From `names.py` (`names.txt`): **six** names refused, all at minute 14 on the first full compile, all resolved
within a minute, none with a hint. Four have one cause: `class Amount [ width = 96, textAlign = end, … ]` and `class FormHeading [`
were declared with no base, so each is a View, and `textAlign`, `numeralWidth` and `text` are not a View's. The
compiler said "has no attribute" four times. A hint
naming the cause ("Amount extends View; `textAlign` is Text's: `class Amount extends Text`") would have answered all
four at once. The other two were paths through an unnamed child (`this.saved.code`, `heading`). There were no
collisions, no `declare-help` misses and no empty searches. `textAlign = end` was refused as a value, not a name;
`textAlign` takes `left | center | right` while layouts take `start | end`.

## Findings, ranked by leverage

### Verification
1. **Make checking one way, chosen by the tools, not by the builder.** The builder keeps `declare-verify app.declare`
   (compile, boot and layout). Every other check becomes a question to `npx declare-check`, which starts the checker
   itself, detached, with `--wait` to collect its report under the Bash tool's limit. `declare-look --shot` hands the
   picture to a vision sub-agent and returns words. A clean verify ends by naming `declare-check`. The how-to for
   scripts and pictures moves to the checker's page. A ledger of each check's time and tokens makes the eval's totals
   honest.
2. **`provided()` with no possible provider is knowable at compile time.** On the App, nothing is above; R3 can
   refuse a `provided(…)` read there with no default, before a script meets it at R5.
3. **A script that asserts nothing passes R5.** The last keyboard script typed every value one field off and ended
   on the pay screen with nothing paid; R5 said ✓ (idiom read, "A pass that proved nothing"). R5 should say when a
   script made no assertion, and a flow script should end on an `expect` of its outcome. A checker reporting in a
   fixed form ("VERDICT … expected:") would not have let it through.
4. **"no node at …" in R5 should give the nearest names,** and the visible labels of the siblings. Twice it was the
   agent's own wrong price in a path (`Pay $246.00` for `Pay $245.00`).

### Platform
5. **`Focus.focus` on a view it cannot focus is silent.** A development warning ("not in any Tab order; ignored")
   would have saved about a minute and a probe. The brief's own warning is about lost focus. Better still, a focus
   target that is not a Tab stop (the web's `tabindex=-1`): every screen heading here became an extra Tab stop to
   take focus after a change of screen.
6. **`provided("accessibilitySettings")` on the App throws,** though the entry says "read it anywhere". Either the
   App's `provided` reads its own provides, or the entry says to read `app.accessibilitySettings` on the App. Its
   type is a bare `object`, so the agent needed a cast to read `.reduceMotion`.
7. **`Button` and `Combobox` ignore `touchFirst`,** where `Checkbox` and `Radio` now follow it. Their R4/R5 findings
   were fixed with a height at seven use sites.

### Reference
8. **`14-data.md` § A form in a sheet keys the form on the opening flag** (`NewPage [ exists = { app.adding } ]`),
   which `18-overlays.md` now says empties the panel mid-slide. The agent copied the first; it was in its
   `declare-start` bundle. Key the example on `present`.
9. **`docs/declare.md` §10 still repeats a paragraph word for word** ("Inside a state, an override is the view's…",
   lines 856 and 864). Run 8's account reported it too.
10. **A class with no base is a View.** Four refusals came from forgetting `extends Text`; a hint should say so.
11. **Radios replicated from data** are what `RadioGroup` supports and its reference never says (a library read,
    as in run 8).
12. **`textAlign`'s values against `start`/`end` elsewhere.**
13. **`declare-start`'s size follows the table's citations.** `touch` and `accessibility` cite whole sections or a
    whole chapter. Tighter citations make a smaller pre-read.

## The agent's account, verbatim

Asked after the build in a read-only resume (`impressions.txt`); pasted as written, with its headings two levels down.

### Building Venue in Declare: an account for the people who make it

This covers one build of a few hours: a ticketing app with a 648-seat live map, a checkout form, sign-in and tickets, for phone and desk. I'd never seen Declare before. Everything below comes from that one session, and I say so where the evidence is thin.

#### (a) Getting up to speed

**What I read, in order:**
1. `README.md`, which pointed me to `skill/SKILL.md`.
2. `docs/declare.md`, whole.
3. Guide chapters 01, 04 and 05.
4. `apps/todo/todo.declare` and `todo-parts.declare`, whole.
5. The bundle from `npx declare-start --pick form,service,touch,accessibility,layout,motion --program tracker`: about 79 KB of guide sections, 21 KB of reference and a 5 KB outline of the tracker.

After that, only targeted `npx declare-help` lookups: EventStream, Stream, TextInput, Form, Field, Sheet, RadioGroup, Combobox, Carousel, Layout, focusScope, waypoint, scrollX, tabOrder, accessibilitySettings and a few more.

**What taught me the most:**
- **The todo app.** Its comments explain *why* things live where they do. Patterns I copied almost directly:
  - state on the App, with aliases like `list: View = { app.main.col.list }` for views used from far away;
  - computed defaults that become the user's once they type;
  - `exists` for a form that should start fresh;
  - one Spring per motion.
- **The Form reference** (`declare-help Form --all`) was the single most valuable page. It told me, before I wrote anything:
  - that `refusal(body)` already understands `{ field, message }`;
  - the order `refusedWith` runs in;
  - that `pending` already blocks a double submit;
  - that `judged = false` exists for a security code emptied after a decline.

  That last item matched the brief so closely it felt written for it. I built almost no form machinery myself. The 422 → field → focus behaviour, which would have been an afternoon in React, came free.
- **`docs/declare.md` §5** on settled versus computed defaults, and the "what you can assign" table. This is the one idea you must hold to avoid fighting the runtime, and the table states it well.
- **The SKILL's drift check.** It stopped me hand-building a scrim overlay, and pushed me to write a `Layout` subclass (`PanelLayout`) instead of `width = { app.wide ? … }` arithmetic on siblings. Its sentence "a layout of your own: one `place()` that divides the room" was exactly right for my case.

**What was missing or misleading:**
- **`declare.md` §10 repeats a paragraph verbatim** ("Inside a state, an override is the view's…" appears twice). This is harmless, but in a document that sells itself as compact and authoritative it made me briefly wonder whether I'd misread.
- **`provided(…)` on the App.** The docs say `provided("accessibilitySettings")` is how to read it "anywhere". On the App itself it throws at runtime: "no ancestor provides 'accessibilitySettings'". §9 does say `provided` "walks up, never to itself". But the `App.accessibilitySettings` entry says "read it anywhere as `provided(...)`", and the App is the obvious place to put an app-wide `stillness` flag. The compiler didn't catch it; I found it only because every assert script failed at R5.
- **Copying an Animator's value into a Spring.** I didn't know whether writing a sprung attribute directly would wake its Spring. The motion chapter answers it, but only in passing inside the carousel example ("Write only `offset` … changes nothing a sleeping spring watches"). I used an `Animator` instead. A one-line statement in the `Spring` reference would help.
- **Two facts I found only by trying:**
  - A `Radio` must be a direct child of its `RadioGroup` (only the source comment says so). Replicated Radios via `datapath = :cards[]` did work, which I wasn't sure of.
  - A `Button` can't flex in a row, because it owns its width. The error told me; nothing earlier warned me.
- **Generic arrow-key movement inside `focusScope = stop`.** I couldn't tell from the docs whether a `stop` works for arbitrary Controls or only for ones that implement `onKeyDown`, like Radio. It does work generically: arrows moved along a row of seats. I'd have liked to know that before relying on it.
- **The size of the starting bundle.** The `declare-start` output is large. Reading it once was right, but much of the guide text (pan-and-zoom, the whole accessibility chapter) I used only lightly. That was my choice of picks, not the tool's fault.

#### (b) Expressing what I wanted to express

**Where it fit well:**
- **Data from the service.** Each `DataSource` with a `schema` was one declaration: production, seat map, `me` and order. Typed `.value` everywhere and no casts. `credentials = include` and an absolute URL just worked cross-origin.
- **The live stream.** `EventStream [ listenTo = ["seatchanged"], url = { … } ]` connects and disconnects with the performance. "Refetch the map once the stream opens" was a single `onOpen() { app.house.fetch() }`, which closes the gap between the first fetch and the stream opening. The reference warned about `listenTo` for named events. Without that sentence I'd have lost time to a silent stream.
- **Screens.** `location` for the performance and `waypoint = "pay"` for checkout gave a Back button that does the right thing, with no router. `screen` is a derived string; screens are `visible = { app.screen == … }`.
- **Signing in mid-checkout without losing anything.** This came from where I put the state. Checkout values live on the App as computed defaults (`email: string = { app.account?.email ?? "" }`), so signing in fills empty fields and leaves typed ones alone. That's the brief's exact requirement, met by the semantics of declaring versus setting an attribute, not by code.
- **Field-level behaviour.** `purpose = cardNumber | cardExpiry | cardCode | postalCode | …` produced correct `autocomplete` and `inputmode` attributes, which I confirmed in the DOM. `concealed` gave show-password while keeping it a password field. Card grouping with caret repair (`onInput` + `select(caretAfterDigits(…))`) is described in the TextInput prose, almost for exactly this case.
- **The hall as a scene.** Pure geometry functions in `script` (`seatDX`, `seatLift`, `sectionTops`) drove seat `x`/`y` constraints, the tier plates (`draw`), the minimap (`draw`) and the burst position. One source of truth and no layout fighting. The guide's framing ("hand-written x/y belong on a diagram's scene") gave me permission to do this without feeling I'd drifted.
- **States for the three seat looks.** `SeatMark` with two `State`s, including a `CheckIcon` child only while chosen, read cleanly.

**Where I worked around it:**
- **Paths into nested, unnamed children.** `refusedWith` had to reach the security-code field. My first try, `this.saved.code`, failed (DECLARE6001) because the `Field` in between was unnamed. I named the Fields (`cvcField`). Later I switched the blocks to `exists`, which made the paths nullable (`this.saved?.cvcField.code`). The rule is fine; I hit it three times.
- **Name collisions between schemas and classes.** `schema Seat` and `class Seat` collided (DECLARE5001), so I renamed the schema `SeatRecord`. Reasonable, but it's a shared namespace that a newcomer from TypeScript (where types and values are separate) won't expect.
- **Pitch tuning and row depth.** For thumb-sized seats I made the row depth a parameter, which meant threading `app.rowDepth` through every geometry call. That came from my own design choice, not the language.
- **Tab order in the hall.** By default, Tab reached the 26 rows before the side panel, and my first `tabOrder()` override broke `Focus.focus(heading)` (more under Surprises). The final `tabOrder() { return [overview, side, hallPane] }` is one line, but finding it took three iterations.
- **Countries.** For country I used `Combobox [ purpose = country ]` to give autofill a chance. Whether browser autofill selects a member of a Combobox is undocumented, and I couldn't test it.
- **Nested ternaries.** `screen` hit DECLARE4025. The fix (naming `paying` and `atPerformance`) genuinely read better.

#### (c) Verifying it

**The ladder** (`npx declare-verify`) was the best part of the experience.
- R1–R3 errors arrived together, each with a fix I could apply mechanically:
  - `View already has an attribute 'scale' — … write 'scale = …'`;
  - `Amount has no attribute 'textAlign'`, because a class with no base is a View, not a Text;
  - `'semibold' … inside { } write it as a string`;
  - `Text.accessibilityRole … got 'alert'` (the list of valid roles was right there);
  - the Button-flexes message, which named both possible fixes.
- R4 booted at laptop and phone sizes and gave layout findings I acted on: 36×31 seats, a 32×44 back button and a 30px Combobox, all flagged against 44×44.

**Assert scripts at R5** carried the real verification. I wrote six:
- desk guest checkout;
- the phone version of the brief's §10 story;
- phone guest;
- keyboard only;
- session, reload and double press;
- the 409 conflict.

What helped:
- Naming views by accessible name, as in `app.screens.pay.formPane.col.form."Card number"` or `app.signInSheet."Password"`, made the scripts read like the brief. It also checked naming as a side effect: if the click worked, the label was right.
- `expect.request("POST", "/api/orders", { count: 0 })` proved that nothing reached the service from an invalid form.
- `drive.requests()` let me count orders after a click, a second click and Enter.
- `drive.waitReal` was necessary because the order takes 1.5 s against a live service. The distinction between virtual and real time is well explained.
- `page` gave the escape hatches I needed: `page.screenshot`, `page.reload()`, `page.evaluate(() => fetch(...))` to buy a seat as "someone else", and `drive.set("app.live", "active", false)` to force the 409 path by silencing the stream.

**`declare-look --js`** answered "what does the DOM actually expose" in one command. That is how I confirmed `role="checkbox" aria-label="Orchestra, row C, seat 14"` with `aria-description="Sold"`, and the `autocomplete`/`inputmode` attributes per field. It is also how I spotted the duplicate hidden "Security code" input that could make a by-label lookup ambiguous.

**Where the tools served me less well:**
- **R5 failure messages for missing paths** say only "no node at …". Twice the cause was my own wrong price in the script (`Pay $246.00` instead of `$245.00`; `$139` instead of `$142`). A hint like "views with similar names: `Pay $245.00`" would have saved a round trip.
- **The `provided()` error surfaced only at R5,** as a runtime throw in every script. R3 could, I think, know statically that a `{ }` default on the App reads `provided(…)` with no default and no ancestor.
- **Writes to the live service.** The scripts placed real orders and sign-ins. `verify` says so in a note and points at `--fixtures`, which is fair. I chose the live service deliberately, and the service's state is now different (sold seats on several performances).
- **What I couldn't verify:** a phone's on-screen keyboard (`app.keyboardHeight` is 0 headless), browser autofill, and a real screen reader. The tools say this honestly. I used `--js` and the semantics rather than `--semantics` itself; I didn't try `--semantics` and can't judge it.
- **I didn't use a checker sub-agent** (`docs/operational/checking.md`) despite the skill recommending it. Assert scripts plus a few screenshots were enough; I can't say whether a checker would have caught more.

#### Surprises

- **Changing Tab order broke programmatic focus.** I overrode `HallSide.tabOrder()` to leave out its heading, so `HallScreen.tabOrder()` could list the heading first. After that, `Focus.focus(app.hallScreen.side.heading)` silently did nothing and focus fell to `<body>`. My keyboard probe printed the whole page's text as the "focused element". Putting the heading back in its parent's `tabOrder` fixed it. I infer that `Focus.focus` refuses a view that isn't reachable in traversal, but that's an inference, not something I read. Either way it was silent, and it's exactly the "focus is never lost after an action" failure the brief warns about. A dev-mode warning ("focus() target is not in any tab order; ignored") would have saved real time.
- **R4 builds sample rows from schemas** ("3 data source(s) fed a sample of their schema"). So the hall was layout-checked at boot without the live service. I didn't expect that, and it's clever.
- **Most of the form came free.** Building a checkout with refusals mapped to fields, focus moved to the first problem, a single send while pending, and judging deferred until a field is left, with no form code of my own.
- **Performance at this size never came up.** 648 seat Controls, each with several constraints, plus a minimap `draw()` reading every seat on each scroll. Picks felt instant in the screenshots, but I didn't profile, so treat that as unmeasured.

#### Good and bad

**Good:**
- The compiler's errors. Each one named its fix, and I never had to guess.
- The rule of state on the App versus records in datasets, and the computed-default idiom.
- Form, Field and TextInput as a complete, well-thought-through contract.
- `purpose` as one attribute serving autofill, phone keyboards and screen readers.
- `EventStream` and `DataSource` as declarations rather than effects.
- Accessibility as a first-class attribute set that `declare-look --js` could confirm.
- `declare-verify` R5 with accessible-name paths.

**Bad, or at least rough:**
- Silent failures: the `Focus.focus` case above, and `provided()` on the App reaching runtime.
- Small documentation gaps listed in (a).
- Path depth. Unnamed intermediate views make deep paths brittle (`app.screens.pay.formPane.col.form`). I compensated with App-level aliases, as the docs advise, but it's a recurring tax.
- The shared namespace for schemas and classes.
- `textAlign` takes `left | center | right`, while layouts and positions use `start | end`. I wrote `end`, it failed, and I used `right`. Minor, but inconsistent within one language.

#### Differences from what I usually use

- **No render cycle and no hooks.** Assignments, constraints and settles replace them. After an hour this felt simpler than React. The one real adjustment was "inside a handler you read the world before your writes land", which `afterSettle` handles. I used it for focus after a screen change and after a decline.
- **Children come from data, never from code.** `datapath = :sections[]` replaces `.map()`. This fit the seat map perfectly: sections → rows → seats nested three levels deep with nothing written by hand. It's less natural for one-off lists derived from App state; I had to wrap `picks` in a `Dataset [ contents = { { lines: app.picks } } ]` just to replicate order lines.
- **No CSS.** Paint lives on the view, `padding` belongs to the view not the layout, and stacking is declaration order. Nothing here cost me anything.
- **Layout is a class you can write.** `PanelLayout` was about 15 lines and replaced what would have been media queries plus flex rules in CSS.

#### What it reminded me of

- **OpenLaszlo/LZX**, which the README cites as its ancestor: constraints, datapaths, states, and classes defined in markup.
- **SwiftUI**, for State-as-configuration and springs as declarations.
- **QML**, more than anything: property bindings, states, a tree of typed elements, and JavaScript in braces. QML is the closest living relative of my experience here.
- **Elm**, a little, in how strongly the guidance discourages imperative escape.

#### Where I'd most want improvement

1. **No silent failures in focus and providers.** Warn when `Focus.focus` ignores its target. Catch `provided()` reads with no possible provider at compile time.
2. **Better R5 diagnostics for missing paths:** nearest names, and the visible labels of the siblings.
3. **A short "known edges" section in the reference:**
   - Radio must be a direct child of its group;
   - Button can't flex;
   - writing a sprung value doesn't wake its Spring;
   - Combobox and browser autofill;
   - arrow keys under `focusScope = stop` work for any Control.
4. **Consistent alignment vocabulary** (`start`/`end` for `textAlign`).
5. **Replicating from a derived array without wrapping it in a Dataset**, or the docs should say plainly that the wrapper is the intended idiom. I'm unsure which is right.

#### What I'd use it for

On this evidence, I'd choose Declare for:
- **Form-heavy consumer flows** that must be accessible and work on phones: checkout, booking, onboarding. The Form/Field/TextInput contract is the strongest part of what I used.
- **Live, data-driven visual surfaces:** seat maps, schedules, dashboards fed by streams. Its "scene from geometry functions plus constraints" handled the hall with almost no friction.
- **Work written mostly by an agent and checked by tools,** because the compiler and verifier gave me a tight, trustworthy loop.

I'd hesitate:
- where a team needs the npm UI ecosystem;
- where hosting must be server-rendered in a conventional stack;
- for very large teams. The library is small and the community knowledge is thin, though the docs are good enough that this mattered less than I expected.

My judgment rests on one build of moderate size. I didn't stress performance, the canvas renderer, dark mode, or long-term maintenance.
