# Venue run 11: Declare b7bfd01b (the builder's own assert scripts, a brief check last), Opus 5.5

**Run:** 2026-10-27/28, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-11 claude-opus-5-5 b7bfd01b 8350` against GitHub main.

The same brief, service, port, model, tools and prompt as run 9. What changed since run 9 (`fee8fb2f` and `b7bfd01b`;
run 10, on `fee8fb2f`, was stopped at 24 minutes and not filed):
- **Checking.** The builder checks as it builds with its own assert scripts, each ending on an expectation; `declare-look`
  is for reaching a state to see it. A whole program built to a brief gets one checker before handover:
  `declare-check --brief <file>` reads the brief, checks each requirement it can in the brief's order, and reports each
  as passed, failed or unchecked. R5 now says when a script asserted nothing; "no node at" names what is nearest.
- **Platform:** Tab from a start point inside a hidden view; warnings when `Focus.focus` does nothing or focus is
  dropped, printed beside verify's verdict; `textAlign = start | end`; `App.accessibilitySettings` typed and its
  "read it anywhere" removed; `Button` and `Combobox` at least 44 on touch; hints for `alert` and a class without
  `extends`.
- **The pre-read (`declare-start`) is gone;** the reading is as in run 9's predecessor.

**Try it:** the app's five files, the builder's own Playwright scripts (`tests/builder/`), the checker's scripts
(`tests/checker/`) and report (`checker-report.txt`), the nine pictures the builder read (`shots/`) and the acceptance
results (`drive/`) are filed beside this report. The files are as the agent left them; the formatter's `--check` passes.

## The comparison

Build figures come from the build's own final record. The checker's come from its ledger line and are counted beside
the build's, not in it. The account was asked for afterwards (1.0 min, 5.5k output tokens) and is counted separately.

| | Venue 8 | Venue 9 | **Venue 11** |
|---|---|---|---|
| Declare commit | `496944cf` | `7dd3360c` | **`b7bfd01b`** |
| time | 32.6 min | 29.5 min | **37.7 min** (of which 9 min waiting on the checker) |
| turns · tool calls | 129 · 128 | 79 · 78 | **112 · 107** |
| code, raw lines | 1,746 (6 files) | 1,655 (4 files) | **1,823** (5 files) |
| code, excluding comments and blanks | 1,264 | 1,223 | **1,388** |
| **Build tokens** | | | |
| output (incl. thinking) | 148k | 127k | **125.5k** (55.0k thinking) |
| fresh input (cache writes) | 333k | 332k | **313k** |
| cached input re-read | 30.4M | 17.2M | **21.8M** |
| read before first app write | 394 KB | 446 KB | **376 KB** |
| context at first write → end | 183k → 339k | 220k → 340k | **183k → 321k** |
| first app write at | 7.3 min | 7.9 min | **6.8 min** |
| **The checker** | — | — | **1 run: 529 s, 40 turns; 86k fresh input, 2.25M cached re-read, 26k output** |
| **Download (gzip)** | 176.0 KB | 176.0 KB | **172.5 KB** ¹ |
| hidden acceptance (`drive.mjs`) | 11 of 11 | 11 of 11 | **11 of 11** |
| runtime source read | 4 calls | 0 | **0** |
| library source read | 3 calls | 2 calls | **4 calls** (Combobox ×3, Form) |
| names refused by a check | 1 | 6 | **0**, and one collision (`Card`) |

¹ `declarec --sizes` from main: program 36.5 KB, runtime 123.2 KB, kernel 12.6 KB.

**The headline: 11 of 11, the brief check used as designed and worth it, but the builder left Declare's checking tools
for a Playwright harness of its own.**
- **The brief check** ran once, unprompted, as the last step. It found three real bugs the builder had missed and the
  acceptance does not test: the buyer told their own seats were "taken by someone else", the desk total and Pay
  scrolling away, and a guest's postal code not judged on leaving. The builder fixed all three.
- **The builder's own checking** moved off Declare's tools at minute 17.6, after two failures in a row: `declare-look`
  placed a seat outside the window that the page had on screen (a driver bug), and the one assert script failed on
  `page.getByRole is not a function` (`page` is Puppeteer, and the docs don't say so). It installed Playwright and drove
  every flow from its own scripts, which "find things by role and name as the brief's test will".
- **What that cost:** verify's layout checks never ran past boot. The phone's seats stayed 34 × 34 for 14 minutes,
  until the checker reported them.
- **Cost:** 21.8M cached input re-read, against run 9's 17.2M, plus the checker's 2.25M. 9 of the 37.7 minutes were the
  builder waiting on the checker.

## Where the time and the tokens went

| phase | time | API calls | cached input re-read | share |
|---|---|---|---|---|
| **Reading and planning** (0–6.8 min) | 6.8 min | 28 | 3.24M | 15% |
| **Writing** the five files (6.8–15.0) | 8.2 min | 7 | 1.39M | 6% |
| **Debugging and verification** (15.0–37.7) | 22.7 min | 62 | 17.15M | **79%** |

In the last phase the builder's tools ran for 15.5 of its 22.7 minutes: the checker 8.7 minutes (the builder waiting),
its own Playwright scripts 5.1, `declare-verify` 0.9, `declare-look` 0.4.

| minutes | what | cause |
|---|---|---|
| 0.9 | compile fixes, ten rounds | normal. A `schema Card` collided with the library's `Card`; the builder's blanket rename then rewrote "Card number" in the page's words, found and undone at min 20.5 |
| 1.5 | first looks at the list and the hall | design work |
| **~1.1** | `declare-look --click` on a seat refused: "outside the window at (−152, 233)", though the page had it at x 470 | **tool bug:** the driver's position for a seat in a centred canvas inside a two-way scroller is wrong. The live-service note that followed blamed the service's state, wrongly |
| **~0.6** | the one assert script failing on `page.getByRole` | **doc gap:** `page` is Puppeteer; `verify.md` doesn't say |
| 0.4 | installing Playwright | the builder's choice, against the skill |
| 7.0 | desk purchase, phone story, keyboard-only, 409 and 422 cases in its own scripts; fixes | normal, outside Declare's tools. The Country Combobox was swapped for radios because the script couldn't drive it (see the idiom read) |
| 0.4 | the brief check, started | |
| **9.0** | waiting on the checker, in a loop of `--wait` calls; the dev server it had started in the background was stopped by the shell's limit meanwhile | the check itself; the server's death made the checker fall back to verify's own hosted copy |
| 2.5 | fixing the checker's findings, rerunning its own scripts | normal |

## The brief check

**Used as the skill says.** At minute 26.0, after its own flows passed: `npx declare-check --brief ../task/brief.md
--program my-apps/venue/venue.declare --url … --service …`. It waited with `--wait`, then with a shell loop of up to five
`--wait` calls (each up to 100 s), which only works because the agent's shell allowed long commands.

**What it found** (`checker-report.txt`): 22 requirements checked, in the brief's order; 20 passed.
- **Failed:** on a successful payment, the service's event for the buyer's own seats arrived while they were still
  chosen, so the buyer was told, assertively, that their seat "was just taken by someone else", and in one run of four
  the screen fell back to the hall. The desk order summary and Pay scrolled away (`ignoreScroll` on a view whose parent
  doesn't scroll, which verify's boot check had said).
- **Failed, outside the 22:** a guest's mistyped postal code wasn't judged on leaving until a country was pressed.
- **Layout and runtime notes:** the phone's seats at 34 × 34; the sign-in sheet 10 px past a phone's edge; a truncated
  chosen-seat row; two `Focus.focus` calls on views that couldn't take focus.
- **Unchecked, and said so:** the 409 path (the stream removed the seat first), "Nearly sold out" (no performance under
  the threshold today), the phone keyboard, autofill, a screen reader's speech, and what only a person can judge.

**What the builder did with it:** fixed every failure and layout note, and the two focus notes with timed delays (the
idiom read's misstep 1); confirmed with its own scripts; did not ask the checker again.

**Cost beside the build's:** 529 s and 40 turns; 86k fresh input, 2.25M cached input re-read and 26k output, against
the build's 313k, 21.8M and 125.5k.

**One tool gap it exposed:** the checker was given the builder's dev-server address, and the server died while it ran;
the checker coped by using verify's own copy, but a check of "the app the builder is running" can't rely on a
background server the shell may stop.

## Is it idiomatic Declare?

Mostly. The places that matter most are idiomatic. Where the person is lives in `location` and `waypoint`. The values live on the App as computed defaults. One `Form` owns sending, refusals and the send guard. Four of run 9's eight missteps are gone. `PayForm.error` is now shown, the sign-in form is keyed on `present`, there is no `tabOrder()`, and the reason for per-site button heights went away when the library changed. Three recur unchanged: the performance row writes `location` from `press()`, dates are hand-written tables, and the overview map aims on hover. The double announcement recurs in a new place, the form errors. There are new slips too. Focus after sign-in and sign-out is timed by guessed delays. The country `Combobox` was swapped for radios because the agent's own Playwright script could not open it. The ticket pager and the spinner are hand-built, though the library has `Carousel` and `ProgressBar`. Money is formatted by hand. Nothing reads `reduceMotion`. The biggest process gap: verify never asked its layout questions past boot. The phone's seats stayed 34 × 34 until the brief checker found them.

Files are in `my-apps/venue/`. `venue.declare` is the App. The others are cited by suffix (`-hall`, `-checkout`, `-helpers`, `-tickets`). "Call N" is the agent's Nth tool call in `logs/agent.stream.jsonl`. "Min" is minutes from its first record (03:09:47Z). The build took 107 calls and 37.7 minutes, with 125.5k output tokens (55.0k of them thinking). The hidden acceptance passed 11/11.

### What it gets right

- **Where the person is.** The performance is `location` and checkout is `waypoint` (`venue.declare:250–253`). `screen` is derived in one method (`:257–263`). Moving between screens only writes those two (`:331–341`). It read `20-urls.md` before writing (call 29, min 3.4).
- **Values on the App, as computed defaults.** Email, name and the billing fields follow the account until the person types (`venue.declare:368–378`). That is the "computed default" of `14-data.md:599–604`. Signing in halfway through loses nothing; the brief checker confirmed it (call 101).
- **One Form, and the form's own facts.**
  - `PaymentForm extends Form` with `source`, `enterMoves` and `failedMessage` (`-checkout:67–70`). Its `refusedWith` empties only the codes after a decline, and resets their `judged` (`-checkout:84–95`). That matches `Form.refusedWith`: "empty a field the service will not take again" (`library/form.declare:128–133`).
  - The send guard is the form's `pending`. `app.paying` reads it (`venue.declare:416`). There is no flag of its own. Two clicks and Enter sent one order (calls 74, 104).
  - Each way of paying is built only while chosen (`exists`, `-checkout:99, 114, 125, 138`), so the form counts only the fields it sends.
  - `showProblems()` is overridden with `super` first, to scroll the focused field clear of the pay dock (`-checkout:76–82`). `Form.showProblems` invites exactly that: "Override it to focus a summary of your own, scroll, or stay silent." It reveals through `app.reveal` with `revealInset` (`venue.declare:252`), which it looked up (calls 90–92, min 24.6).
- **Run 9's misstep 1 is fixed.** `Form.error` is shown. `payError` reads `app.payForm.error` (`venue.declare:417`), and the pay box shows it (`-checkout:248–250`). So `failedMessage` reaches the person.
- **Run 9's misstep 3 is fixed.** `SignInForm [ exists = { app.signInSheet.present } ]` (`venue.declare:752`). The sheet is `shown` plus `input` (`:748–749`). The docs that misled run 9 are fixed: `14-data.md:593–595` and its example at `:637` now key on `present`.
- **The records.** `Hall extends DataSource` holds the seat map's rules: find, free, neighbour, and the one write, through `set` (`-hall:66–139`, `:106`). An `EventStream` with `listenTo` reports other buyers (`venue.declare:234–241`).
- **A seat is a drawn control.** It is a `Control` with role `toggle` and `accessibilityPressed` (`-hall:179–181`). A taken seat is `disabled` (`:183`). The three states differ in shape: a disc, a larger accent disc with a tick, a small ring (`-hall:209–245`). The plan is one Tab stop (`focusScope = stop`, `venue.declare:503`). The seats answer the arrows themselves and move focus with `Focus.focus` (`-hall:188–197`). That is the grid case that `View.focusScope` names: "in a grid where Up means the row above, the view answers the arrows itself (`onKeyDown`) and moves focus with `Focus.focus`."
- **The phone hall.** It is a close-up in a pane that `scrolls = both` (`venue.declare:492–494`), with an overview that shows the pane's window (`-hall:355–397`). There is no `lastPointerType` and no `tabOrder()` anywhere.
- **Buttons answer through `onClick`.** The first compile warned that `press()` on a `Button` replaces its activation path (call 45, min 15.3). The agent moved every Button to `onClick` and kept `press()` on its own `TextButton` (calls 46–47).
- **The desk summary stands still the way the reference says.** Verify's boot check said the nested `ignoreScroll` view moved with its parent (call 101). `View.ignoreScroll` says "make it a child of the App, shown with its screen's condition". The final `deskSummary` is exactly that (`venue.declare:630–638`).
- **The keyboard on a phone.** The pay dock rises by `app.keyboardHeight` (`venue.declare:734`), as `App.keyboardHeight` describes: "a composer bar rises by it".
- **Saved cards.** They are `Radio`s from `:cards[]` in a `RadioGroup`, and an expired card is `disabled` (`-checkout:114–123`).

### Missteps

1. **Focus after sign-in and sign-out is timed by guessed delays.**
   - **What it does.** After sign-in it waits 400 ms and then focuses the sign-out button or a checkout field (`venue.declare:362`). After sign-out it waits 120 ms and then focuses the sign-in button (`:224`). The sign-out button only shows once `me` has loaded again (`:213`, `:725`). So the 400 ms is a bet on how fast the network is.
   - **How it got there.** The probe at call 83 (min 21.7) found focus on `<body>` after sign-in, and the agent added the 400 ms wait (call 84). The checker then reported "Focus.focus(app.bar.signInButton) is not focusable" after sign-out (call 101). The fix was to change `afterSettle` to `afterDelay(120)` (call 103).
   - **Why it is wrong.** `afterDelay`: "Rarely the tool: a value that should change when something happens is a constraint on that something." `afterSettle`: "never for waiting". `Focus.focus`: "Focusing a view that is not focusable is a no-op." On a slow reply, the focus is silently lost again.
   - **Written as:** move focus when the fact changes. Add `"signedIn"` to the App's `trackChanges` (`venue.declare:271`), and in `onChange` focus the button that `signedIn` has just made visible, with `afterSettle` so it is real.
2. **The country `Combobox` was dropped because the agent's own script could not drive it** (`-checkout:221–235`; `venue.declare:378`).
   - **What happened.** The first checkout used a `Combobox` for the country. The Playwright script failed twice. First `getByLabel("Country")` found two elements (call 70, min 18.6). Then a click on the combobox listed no options (call 72, min 19.1). The agent's reasoning at call 73: "The library combobox fails to open on a plain click and duplicates its label, so I'll switch to a radio group." The country is now three `Radio`s. Until one is pressed, the country is guessed from the postal code (`venue.declare:378`, `-helpers:141–145`).
   - **Why it is wrong.** The reference made the combobox the autofill path. `Combobox.purpose`: "Text that arrives whole and names exactly one item, as autofill's does, picks that item" (`library/combobox.declare:57–60`). The agent had read that (call 26, min 3.2). The two names are by design: the combobox and its entry both carry the field's name, "so a screen reader edits" the entry (`library/combobox.declare:140–141`, `:250–252`). Neither failure was shown to be the program's. The brief says the browser's address autofill must work. A filled country is now ignored, and a postal code that fits no format leaves the country blank (`-checkout:214–215`).
   - **Written as:** keep `Combobox [ purpose = country, items = { app.countries }, … ]` inside its `Field`, and drive it in a check by typing into the entry (the textbox named "Country").
3. **Form errors are announced twice.**
   - **What it does.** `Form.showProblems` already announces the form's `error` assertively (`library/form.declare:297`). It runs after every refusal (`:360–362`).
     - The pay box's problem line also has `accessibilityRole = status` (`-checkout:250`). So a decline is heard at once, then again at the next pause.
     - The sign-in error line does the same (`-checkout:310–311`). The probe at call 83 found both the form's assertive region and the line.
     - For a seat lost at payment, `refuse()` puts the service's sentence in `error` (`library/form.declare:315`). `seatsWentAtCheckout` then calls `Accessibility.announce(message, "assertive")` itself (`venue.declare:316`). So the sentence is announced assertively twice.
   - **Why it is wrong.** `View.accessibilityLive`: "A `status` role is polite without saying so." `Form.showProblems`: "a form-level `error` is announced." `19-accessibility.md:100–102` keeps `announce` for "a one-off, with no view to say it from".
   - **Written as:** drop `accessibilityRole = status` from the two error lines, and drop the `announce` at `venue.declare:316`. The seat taken while browsing (`:305`) is fine as is, because its notice views are not live (`:552–553`, `:572–573`).
   - Run 9's misstep 6, moved: the seat notice is no longer doubled, but the form errors are.
4. **A performance row writes `location` from `press()` instead of being a link** (`venue.declare:66`, `:79`, `:331`).
   - `PerfRow extends Control` and `press()` calls `openPerformance`, which sets `location`. To a screen reader it is a button; the agent's own scripts find it by role `button` (calls 78, 85).
   - **Why it is wrong.** `20-urls.md:140`: "Links write `location`; everything else derives." `View.link`: "The view realizes a real `<a href>`, so ⌘-click, copy-link and the build's crawler all work." The App's header calls the performance "in the URL, so it can be shared" (`venue.declare:13–14`).
   - **Written as:** `class PerfRow [ link = { "#" + (:id ?? "") }, … ]`. Clearing `waypoint` on arrival can stay in an `onClick` beside the link (`20-urls.md:143–144`).
   - Run 9's misstep 2, unchanged.
5. **A hand-built ticket pager and spinner, where the library has both.**
   - **The pager** (`venue.declare:657–675`) has its own offset, drag, `Spring`, `claim = x`, and a 60-point threshold in `onPointerUp`. `Carousel` is "pages side by side, one in view at a time. A finger drags the row of pages and it follows 1:1; on release it settles on a page on a spring". Its `page` and `input` carry the destination. `10-touch.md:84–86` names it. The agent read `10-touch.md` from line 141 only (call 23), so it missed that passage.
   - **The spinner** (`-checkout:271–282`) turns on a `Time` every frame. `declare-help Spinner` answers "the Declare concept is ProgressBar", and `ProgressBar.indeterminate` says "Set it from the state that is under way: `indeterminate = { app.saving.loading }`."
   - **Written as:** `pager: Carousel [ width = 100%, height = …, page = { app.ticketAt }, input(p: number) { app.ticketAt = p }, TicketCard [ datapath = :tickets[] ] ]`, and `ProgressBar [ indeterminate = { app.paying } ]`.
6. **Money, days and months are hand-written** (`-helpers:15–37`).
   - `money()` groups thousands with a regular expression (`:15–19`). `DAYS` and `MONTHS` are tables (`:21–22`), and `timeLabel` builds "7:30pm" by hand (`:33–37`).
   - `12-text.md:29–34`: "**Numbers, money and dates** are formatted by the host's `Intl` … `new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })` … `Intl.DateTimeFormat` writes weekdays and months in the language it is given. Name the locale, and a `timeZone` for a date."
   - Run 9 used `Intl.NumberFormat` for money, so that part has gone backwards. The day and month tables are run 8's misstep 7 and run 9's misstep 7, unchanged.
   - **Written as:** one `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })`. Use `Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })` over `Date.UTC(…)` of the parsed parts. Lower-casing a `formatToParts` day period gives "7:30pm".
7. **The overview map aims on every pointer move, pressed or not** (`-hall:366–367`).
   - `onPointerMove(e) { this.aim(e) }`. `View.event.pointerMove`: "The pointer moved over the view — and, once pressed on it, every move while captured." The map shows whenever `app.close` is true (`venue.declare:478`), and that includes a mouse window under about 574 points wide, where `fitPitch < 15` (`:195–203`). There, merely passing over the map scrolls the hall. The brief says nothing may depend on hovering.
   - **Written as:** latch at the press and move by `deltaX`/`deltaY`, as `09-pointer-and-keyboard.md:101–106` does. Or check that the pointer is down before aiming.
   - Run 9's misstep 8, unchanged.
8. **Nothing reads `reduceMotion`.** Grep finds no `accessibilitySettings` in the program. Seats pop and shrink on springs (`-hall:204–207`). The total lifts (`venue.declare:286–287`, `:557`, `:579`). The spinner turns every frame (`-checkout:273–275`).
   - `App.accessibilitySettings`: "The motion system does not act on it by itself." `19-accessibility.md:141–146` says the same: "a program that wants its motion to stand still … reads it where it decides." Run 9 read it (its `venue.declare:356–358`). This run does not.
   - **Written as:** `still: boolean = { app.accessibilitySettings.reduceMotion }` on the App. Each `Spring` then reads it: `to = { app.still ? 0 : … }`, or an instant `stiffness`.

**Run 9's missteps, one by one.**
1. `PayForm.error` never shown: **gone** (`venue.declare:417`, `-checkout:248–250`).
2. Performance row writes `location` from `press()`: **recurs** (misstep 4).
3. Sign-in form keyed on the opening flag: **gone** (`venue.declare:752`). Run 9's note that an Esc leaves the password in the App still holds. See silent misses.
4. `tabOrder()` rebuilt: **gone**. The program has no override.
5. Hand-written day and month tables: **recur**, and money joins them (misstep 6).
6. Button heights per use site: **the cause is gone.** `Button` and `Combobox` now follow `touchFirst` (`library/button.declare:142`, `library/combobox.declare:148`), so no height is a touch fix any more. Five Buttons still set their own height, all 46 to 50 (`venue.declare:559`, `:582`, `:694`; `-checkout:251`, `:312`). A `buttonHeight` in `theme Venue` (`venue.declare:45–57`) would say it once. This is minor and not counted.
7. Double announcement: **recurs, moved** to the form errors (misstep 3).
8. Overview map aiming on hover: **recurs** (misstep 7).

### Workarounds the platform forced

1. **Verify's `page` is not Playwright, and the docs don't say what it is.**
   - The one `--assert` script (call 64, min 17.6) was written against Playwright's API. It failed with "page.getByRole is not a function". The agent then installed Playwright 1.57 in `work/checks` (calls 65–67, min 17.7–18.1). It drove every flow from its own node scripts after that.
   - `docs/operational/verify.md:136–139` says `page` "is the browser page the app is loaded in", and `:225` says "`page` is there for anything else". Neither names the library. The distribution ships `puppeteer-core` (call 65).
   - **The docs should** name the API that `page` has, and the error should say "this is a Puppeteer page". Better still, `expect`/`drive` could find by role and name, as the brief's checker does.
2. **`declare-look` could not press a seat on the desk plan.**
   - `--click 'app."Orchestra, row C, seat 14"'` reported the seat "outside the window at (-152, 233), and swiping did not bring it in" (calls 56 and 61, min 16.5–17.1).
   - The DOM put the same seat at x 470, inside the 1440-wide window (call 59). The view tree agreed with the DOM: the lens's canvas is at x 178 and the seat at x 232, so 410 for row F seat 18, as the DOM said (call 62).
   - The program places seats by `x`/`y` in a canvas centred inside a `scrolls = both` pane (`venue.declare:497–500`, `-hall:174–175`). The tool's own position for it was wrong. After this, the agent stopped driving with `declare-look`.
3. **A heading has to be a Tab stop to take the focus after a change of screen** (`venue.declare:598`, `:648`). `Focus.focus` is a no-op on a view that is not focusable. `View.focusable` "makes the view a keyboard tab stop". This is run 9's workaround 3, unchanged.
4. **An accessory inside a field.** The card's kind sits over the number field through `padding = [0, 110, 0, 12]` and a placed `Text` (`-checkout:147–162`). The zero top and bottom padding made the field collapse (the agent's note at min 20.5, "the card-number field collapsed in height"). It was fixed with a hand-set `height = 38` (`-checkout:149`, call 77). Grouping as the person types is still done by hand in `onInput` (`-checkout:151–156`; `-helpers:68–98`). This is run 8's workaround 5 and run 9's workaround 6, now with a fixed height.
5. **Radios from data.** `Radio`'s entry says "a direct child of the group" (call 25). The program replicates them from `:cards[]` (`-checkout:120–121`). It works (call 82: three radios, the expired one disabled), but the reference still does not say it may. Run 9's workaround 7, unchanged. This time the agent did not read the source to find out.
6. **A computed list needs a `Dataset` to replicate over** (`chosenSet`, `cardsSet`: `venue.declare:280`, `:387`). This is the language's rule, unchanged.
7. **First-compile diagnostics** (calls 42–51, min 15.0–15.9). There were ten rounds, and each message named its fix: `Card` is a library class (DECLARE5000), `key` is replication metadata, `View?` for a null default, no `%` inside `{ }`, `fontWeight` words as strings inside `{ }`, `axis` words as strings, `ChangeEvent.changed` is a list, and a width that reads itself (DECLARE7001). Two rounds were the shell's fault, not the compiler's: macOS `sed` ignores `\b` (call 43).
8. **Fixed since run 9.** `App.accessibilitySettings` now says "on the App itself, as `accessibilitySettings`" (run 9's workaround 1). `14-data.md`'s sheet example keys on `present` (workaround 2). `Button` and `Combobox` follow `touchFirst` (workaround 5). There is still no `alert` role, but this build did not reach for one.

### The driven layout findings

During the build, verify never asked a layout question past boot. R4 ran clean every time. R5 ran once and failed before its first settle. R6 never ran. The phone was never driven through verify or `declare-look --touch`.

| finding (when) | in the final program | judgement |
|---|---|---|
| **R4 note: "not built at boot, so not checked here: OrderLine, Spinner, SignInForm, ChosenRow"** (call 51, min 15.9, and every R4 after) | never followed up by verify. They were built only inside the Playwright scripts, which ask no layout questions. | The note said what to do ("an assert script (R5) … that reaches them has them checked there"). The harness made that impossible. |
| **`declare-look --click` on a seat: "outside the window … swiping did not bring it in"** (calls 56, 61, min 16.5–17.1) | the program was not changed. The DOM and the view tree both put the seat on screen (calls 59, 62). | A tool fault (workaround 2). It pushed the agent off `declare-look` for driving. |
| **R5 `--assert`: "page.getByRole is not a function", and "never built … so never checked for layout: OrderLine, Spinner, SignInForm, ChosenRow"** (call 64, min 17.6) | the agent rewrote the script as plain Playwright (calls 66–67) and never ran `--assert` again | The decisive turn. From here on the layout rungs were out of the loop (workaround 1). |
| **Checker, LAYOUT: "648 seats are 34×34, under 44×44"** on the phone (call 101, min 29.5) | **fixed**: `pitch = { app.close ? 44 : … }` (`venue.declare:204`, call 103) | Right. This is the brief's hard case, and it was wrong for 14 minutes. The first write had 34 (call 41). The agent's own look at the phone hall said "thumb-sized seats" (min 20.9). Run 9's `declare-look --touch` found the same miss in its build, at min 15.7. |
| **Checker, LAYOUT: the sign-in sheet's body "runs past the right edge at 390 wide (ends at 400)"** | **fixed**: `width = { app.wide ? 380 : parent.contentBox("width") }` (`venue.declare:751`) | Right. `contentBox` is the documented room inside the padding. |
| **Checker, LAYOUT: the desk panel's chosen-seat row "cut off as 'Orchestra, row…'"** | **fixed**: `wrap = true` and padding in place of a fixed height (`venue.declare:154–157`, calls 103–104) | Right. |
| **Checker, from verify's boot check: "summaryCol has ignoreScroll, but its parent … does not scroll"**; the desk total and Pay scrolled away | **fixed**: `deskSummary` became an App child with `ignoreScroll` and `ignoreLayout` (`venue.declare:630–638`), with a 1-point stand-in keeping the column's room (`:622`) | Right, as `View.ignoreScroll` prescribes. The x is computed from `checkoutW` by hand (`:631`), which ties it to the column's geometry. |
| **Checker, "runtime said": `Focus.focus(app.bar.signInButton) is not focusable`**, and the same for the checkout's sign-in button after signing in | **worked around** with `afterDelay` (`venue.declare:224`, `:362`) | Wrong fix (misstep 1). |

**What the checks hid.** The Playwright scripts printed what they asserted and nothing else. So no layout line could have reached the agent between min 17.6 and the checker's report at min 29.5. After the fixes, the last runs were the agent's own scripts (calls 104–107). The final program was never put through verify past R4 (call 104).

### Reading the library and runtime

| read (min) | what it was after | in the reference? |
|---|---|---|
| `grep -n -i "autofill\|purpose\|country" library/combobox.declare` (call 26, min 3.2) | whether a `Combobox` takes the browser's autofilled country | **Yes.** `Combobox.purpose` holds the same prose (`library/combobox.declare:57–60`). `declare-help Combobox.purpose` would have printed it. |
| `sed -n 1,120p; 230,300p library/combobox.declare` (call 27, min 3.3) | how the combobox's entry carries `purpose` and shows a value set from outside (a saved country) | **Mostly.** The header prose is the reference's. The comment that a saved address's country "shows as surely as one picked here" (`:241–243`) is source only. |
| `grep -n "accessibilityRole\|accessibilityLabel" library/combobox.declare` (call 71, min 18.8) | why Playwright's `getByLabel("Country")` found two elements | **No.** The two-name design is in source comments only (`:137–138`, `:250–252`). This read served the harness, not the program, and it ended in dropping the control (misstep 2). |
| `grep -n "reveal\|scrollIntoView" library/form.declare` (call 91, min 24.7) | whether `Form` already scrolls a refused field into view | **Yes.** `Form.showProblems` says it focuses and invites an override "to … scroll". The grep found nothing, and the override it then wrote is right. |

There were no reads of `runtime/`. That makes four library reads and none of `runtime/`, against run 9's three library reads. Two were reference gaps or harness questions; two were answerable from `declare-help`.

### Silent misses

Each compiled, and each means something other than what was meant.

- **The arrow keys can get stuck.** An arrow writes `app.keySeat`, and a seat focuses itself when `wanted` changes (`-hall:193–197`). Nothing writes `keySeat` when focus arrives another way: a click, or Tab back into the plan. Arrow to seat X, click seat Y, then press the arrow that leads back to X. `keySeat` is already X, nothing changes, and focus stays on Y. Writing `app.keySeat = seatId` in the seat's `onFocus` closes it.
- **`accessibilityHint` carries state and price.** A seat's hint is "$80.00, taken" (`-hall:182`; call 59 shows `aria-description="$80.00, taken"`). A performance's hint is its price and how full it is (`venue.declare:78`). `View.accessibilityHint` is "what pressing it does, when the name alone does not say". The brief fixes the seat's name, so the hint is the only slot left. The reference should say where a control's status goes when its name is fixed. Borderline, as in runs 8 and 9.
- **A dismissed password stays.** The sign-in values live on the App (`venue.declare:353–355`), and only `signedInNow` clears them (`:356–359`). Close the sheet with Esc and reopen it: the password is still in the field. `18-overlays.md:190–192` names the hook: `closed()`.
- **The ticket pager reacts to hover.** `onPointerMove` sets `shift = offset + e.deltaX` on every move (`venue.declare:664`). With no press, `deltaX` is 0 (`PointerEvent`). So a mouse passing over the pager snaps `shift` to the destination, mid-glide. A `Carousel` would not (misstep 5).
- **`PerfRow`'s role.** A `Control` whose press navigates is a `button` to a screen reader (misstep 4).
- **Smaller ones:**
  - `session.value as { name?: string }` (`venue.declare:363`) is a cast that `schema = Account` on `session` (`:215`) would make unnecessary.
  - `seatParts` (`-helpers:44`) and `stageUnits` (`-hall:54`) are never called.
  - `payError` hides `Form.error` whenever the last refusal was `unavailable` (`venue.declare:417`). So the form keeps a stale sentence that only that test hides.

## Names

From `names.py` (the names ledger, at the end): **no misses**, **one collision**. At minute 15 a `schema Card` was
refused because `Card` is a library class (DECLARE5000, which offered `VenueCard`). The builder renamed it `SavedCard`
with a blanket text replacement that also rewrote the page's words, "Card number" became "SavedCard number", which it
caught in a picture five minutes later. The collision itself was answered well; `Card` is still the obvious name for
a payment card. No `declare-help` misses and no empty searches.

## Findings, ranked by leverage

### Verification
1. **The driver misplaces a view in a centred canvas inside a two-way scroller.** `declare-look --click` and `drive`
   reported a seat "outside the window at (−152, 233)" that the page and the view tree both put at x 410–470. It is the
   one wrong answer that sent the builder to its own harness. Reproduce with the filed `venue.declare` and the service.
2. **Make `page` Playwright, and give `drive`/`expect` finding by role and name.** The builder wrote Playwright first
   (`getByRole`), got "not a function", and installed Playwright, because the brief's test finds things that way and
   so does every accessibility tool. With Playwright's `page` under Declare's settling, program lines and layout checks,
   an agent writing what it knows would keep Declare's checks in the loop. At the least, `verify.md` names the API.
3. **The live-service note fired on a tool failure.** "This run failed after talking to …, which earlier runs wrote to"
   followed the driver's misplacement, pointing the builder at the service. It should fire only on a failure an
   expectation or a request made, not a driver refusal.
4. **A check against "the app the builder runs" needs a server that outlives the shell.** The builder's `npm start` was
   stopped by its shell's limit during the check.

### Platform
5. **`Combobox` labels two elements with one name.** The wrapper carries `role="combobox"` and `aria-label`, and its
   input carries the same label. The library's comments say this is by design, so a screen reader edits the entry; but
   ARIA's combobox pattern puts the role on the input itself, and a lookup by label finds two. The builder dropped the
   control, and with it the autofill path the brief asks for.
6. **No way to focus "the view for this record".** Arrow keys over replicated seats needed a broadcast attribute, 648
   constraints listening to one string (the account, and the idiom read's silent miss on stuck arrows).
7. **Focus after an overlay closes onto something that isn't there yet** (sign-in's opener gone, sign-out's button not
   yet shown) has no documented form; the builder used timed delays.
8. **A heading must become a Tab stop to take focus after a change of screen** (run 9's finding, unchanged).

### Reference
9. **`page`'s API** (finding 2).
10. **Library pieces missed:** the hand-built ticket pager and spinner where `Carousel` and `ProgressBar indeterminate`
    exist; hand-written money and dates where `12-text.md` teaches `Intl`. The `10-touch.md` passage naming `Carousel`
    was outside the section the builder read.
11. **Radios replicated from data** — documented after run 9, but the builder read `Radio`'s "a direct child of the
    group" and didn't see the new sentence on `RadioGroup`.

## The agent's account, verbatim

Asked after the build in a read-only resume (`impressions.txt`); pasted as written, with its headings two levels down.

### Building Venue in Declare: an account for the people who make Declare

One housekeeping note first: the dev server I restarted has stopped (exit 143), so the app's URL won't answer until someone runs `npm start` again. I haven't touched anything since your request. The program files show as changed on disk since I last read them, and I've left them alone.

#### (a) Getting up to speed

**What I read.** I followed `skill/SKILL.md` almost exactly:
- `docs/declare.md`, in full;
- guide chapters 01, 04 and 05;
- `apps/todo/todo.declare` and `todo-parts.declare`, both whole.

After that I read only for specific needs:
- `14-data.md` on servers, streams and forms;
- `08-controls.md` on text fields and focus;
- `18-overlays.md`, the start of `19-accessibility.md`, and the pan/zoom section of `10-touch.md`;
- `20-urls.md` on `waypoint`;
- `verify.md` on assert scripts;
- many `npx declare-help` lookups.

**What taught me the most:**
- **The to-do app.** It showed me things I'd never have guessed from the spec: constants placed in `script`, view aliases on the App (`list: View = { app.main.col.list }`), `trackChanges` with `onChange`, `exists` versus `visible`, and that a phone-sized App simply scrolls. I copied its Fraunces `Font` declaration outright.
- **"A form" in `14-data.md` and `declare-help Form --all`.** This was the best-designed part of the platform I touched. `required` and `validate` sit on the field. `judgeOn = leave` is the default. `submit()` judges everything and focuses the first problem. `pending` is the double-submit guard. `refusedWith(body)` is the hook for my own reaction, and the service's `{field, message}` lands on the field whose `name` matches. Almost every validation sentence in the brief matched a documented behaviour. I wrote no state machine for errors, and that is rare.
- **Small lookups that settled real decisions.** `declare-help TextInput.purpose` gave me `cardNumber` → `cc-number`, the `inputmode` hints, and `concealed` for show-password. `declare-help View.accessibilityRole` told me `toggle` becomes `button` with `aria-pressed`, which decided how seats would look to a test.

**What was missing or misleading:**
- **The assert script's `page`.** `verify.md` says `page` is "the browser page" for "the rare question", so I assumed Playwright. I called `page.getByRole` and got "not a function" (it appears to be Puppeteer). One sentence naming the library would have saved a round trip.
- **The "no harness of your own" advice cost me in one place.** The doc says there's "no reason to build a browser harness of your own". But the brief's test finds things by role and accessible name, and the `drive` vocabulary finds them by view path or by name. I needed `getByRole(..., {exact: true})` and Playwright's strict-mode behaviour, which only a real Playwright run shows. That's how I learned that a field hidden with `visible = false` still trips `getByLabel` strict mode. I think the advice is right for most programs, and wrong for a brief whose tests are written in Playwright.
- **The rename trap was mine, but the message pointed the way.** The compiler refused my `schema Card` because `Card` is a library class. The message was clear and offered `VenueCard`. My first rename used BSD `sed` with `\b`, which silently did nothing. My second, with `perl`, also rewrote the user-facing strings "Card number" and "Card details" into "SavedCard number" and "SavedCard details". Neither is Declare's fault. A class name colliding with a common English noun is still a sharp edge, though: `Card` is the obvious name for a payment card.
- **What I never found:** how a stroke could be dashed (I drew the ticket's tear line by hand in `draw()`); whether `Spring` animates after a direct write when its target is constant (I used it for the summary's small lift but never checked it frame by frame); and why some focus calls fail (more under (c)).

#### (b) Expressing what I wanted

**Where it fit well:**
- **Values that follow the account until the person types.** A *computed default* is a declared attribute with a formula, such as `email: string = { app.me.value?.email ?? "" }`. The person's first edit replaces the formula. That is exactly "sign in halfway through and lose nothing typed", in about twelve lines, with no "dirty" flags. This is the strongest single fit between language and brief that I noticed.
- **Screens as derived state.** `screen` is computed from `placeOrder.loaded`, `perfId` (which is `location`) and `waypoint`. Back from checkout returns to the hall because `waypoint` holds the step. After the 409 handler wrote `waypoint = ""`, the hall reappeared without any navigation code.
- **Data from the service.** Each request is a `DataSource` with `credentials = include`. Signed-in is just `me.loaded && !me.failed`. Sign-out is a DELETE with `format = "text"` (so the empty 204 isn't parsed as JSON) followed by `me.clear()`. Live sales are an `EventStream` whose `active` is a constraint. It all read naturally.
- **Seats as data.** Each seat is replicated from its record, three levels deep (`:sections[]` → `:rows[]` → `:seats[]`). Each `SeatMark` places itself from helper geometry and draws itself in `draw()`. A sale written into the dataset with `hall.set(...)` immediately redraws the seat, shrinks it on its spring, and updates the summary, the overview and the "N of 648 left" count. I wrote nothing to make that happen.
- **Two families and one accent.** This was just a `theme` record spread over `SanFrancisco`, plus custom tokens (`tones`, `seatGone`, `stage`) read with `provided("theme")`.

**Where I worked around the language or library:**
- **Arrow keys on the seat plan.** `focusScope = stop` moves focus in tree order. My seat 1 sits on the screen's right, because the API numbers seats as seen from the stage, so Right Arrow went left. The docs had foreseen this ("in a grid … answers the arrows itself"). But moving focus to a computed seat had no direct form. I used an App attribute, `keySeat`, plus a `wanted` constraint on every seat with `trackChanges` and an `onChange` that calls `Focus.focus(this)`. That's 648 constraints listening to one string so that one view can take focus. It works, but it feels like a workaround for a missing "find the replicated view for this record" call. I may simply not have found one.
- **Country.** `Combobox` with `purpose = country` looked purpose-built: its source even picks an item when autofill pastes a whole name. But a Playwright click on it didn't open the list, and both the wrapper and the inner input carried the label "Country", so `getByLabel` matched twice. I switched to a `RadioGroup` and inferred the country from the postal code's format. That was arguably better design for three options, but it was chosen to get around the library.
- **Laying out the hall screen.** I wrote `flexes = true` on the lens together with `width = { app.wide ? this.width : … }`. The compiler refused it with DECLARE7001 ("'width' reads itself"), so I computed both sizes by hand. Later, `summaryCol` with `ignoreScroll = true` inside a layout looked fine at first; the checker found it scrolled away. Its explanation was the key fact: `ignoreScroll` only means something on a direct child of the scroller. I moved the summary to the App and placed it with arithmetic `x`/`y`, which the skill's own drift check calls "placing by hand". I believe it was the right call for fixed chrome, but I'm not certain there wasn't a better form.
- **Hidden versus absent.** I first used `visible` to hide the fields of whichever payment mode wasn't in use, plus the phone or desk copy of each panel. Playwright's strict mode then saw two "Security code" fields. Switching to `exists` fixed it, but every alias path then became nullable (`app.payForm.card?.pair.codeField.entry ?? null`). The docs do say a `visible = false` view stays in the DOM. They don't say that it still counts for label lookups, and that matters to anyone testing against ARIA.
- **Smaller frictions:**
  - Inside `{ }`, enum words must be strings (`fontWeight = { … ? "semibold" : "regular" }`). The error (DECLARE4005) was excellent.
  - `axis = { app.wide ? x : y }` failed the type check, with a clear message.
  - `width = { … 100% }` is refused, as documented.
  - `ChangeEvent.changed` is an array, not a function. I guessed wrong; TypeScript caught it.
  - My regex to change `press()` to `onClick()` on `Button` (prompted by warning DECLARE4013) also hit `TextButton`, because the name contains `Button [`. Again my fault, but the Button/Control difference — `onClick` for one, `press()` for the other — is a trap. The warning explaining it was excellent.

#### (c) Verifying it

**The verify ladder.** `npx declare-verify` was fast and gave good messages. R1–R3 caught every syntax and type mistake, each with a precise fix (DECLARE5000, 2000, 4005, 6001, 7001), plus useful warnings: DECLARE4023 caught a `rowIndex` read on a view that isn't replicated, and DECLARE4013 caught `press()` on a `Button`. R4 booting at both laptop and phone size gave me confidence early.

**`declare-look`.** The screenshots were indispensable. Two judgements about the hall ("does it read as a room?") and the tickets came straight from them. But `--click 'app."Orchestra, row F, seat 18"'` said the seat was "outside the window at (-212, 286)", while its DOM rectangle was at x = 410. It failed again on a free seat. Reading up the parent chain showed consistent `x` values (232 + 178 = 410), so the tool's own geometry seemed wrong for views nested inside a centred canvas within a two-way scroller. I never found the cause. I switched to Playwright, so I'm unsure whether this is a real tool bug or something about how I structured the hall.

**Playwright, my own harness.** Contrary to the advice, this was where I verified behaviour. I installed it in a separate `checks/` folder outside the repo. It confirmed:
- each seat's name and pressed state;
- the summary line, card-number grouping, expiry formatting and Luhn timing;
- one POST despite a double click plus Enter;
- sign-in mid-checkout keeping a typed email;
- the decline sentence and the cleared security code;
- the 422 focus move, and the 409 path (with the event stream blocked via `page.route`);
- that the session survives a reload.

It also caught focus landing on `<body>` after sign-in. The Sheet tries to give focus back to the button that opened it, which had vanished by then.

**`declare-check`.** The independent checker was the most valuable single step. It caught two real bugs I had missed:
- My own purchase came back on the event stream before the order's 201 and was reported to the buyer as "taken by someone else". In one of its four runs the screen even fell back to the hall.
- The desk summary's `ignoreScroll` did nothing.

It also caught postcode validation that only ran once a country was chosen, plus 34-point seats, a sign-in sheet 10px too wide, a truncated row, and two `Focus.focus` calls on views not yet focusable. Its report named program lines and causes. Two problems: my dev server had died mid-run, so it fell back to its own hosted copy; and `--wait` had to be polled several times over about nine minutes. Still worth it.

**What I couldn't verify, and said so:** the phone's keyboard types, autofill, the password manager, and whether a real thumb hits the intended seat. I built these to be right, not proven.

#### Surprises
- **How much of the brief's form behaviour was already in `Form`/`TextInput`.** "Not marked wrong while first typing", "taken to the field the service names", "nothing sent twice" — each was a default, not something I had to build.
- **`TextInput.select()` inside `onInput` for regrouping a card number.** The reference describes this case almost word for word ("a card number in fours").
- **The checker found a race between the service and the UI.** I wouldn't have expected a "check against the brief" tool to surface that.
- **`Focus.focus` fails quietly when the target isn't focusable yet.** The checker saw "runtime said: … is not focusable"; I didn't, until then. My fix was `afterDelay(120/400, …)`, which is timing-based and fragile. `afterSettle` wasn't late enough, presumably because the Sheet's restore runs "one turn late".

#### Good and bad

**Good:**
- error messages written for the reader who has to fix them;
- computed defaults;
- `Form`;
- the platform's handling of `purpose`;
- `Spring` per seat costing nothing at rest;
- `draw()` for anything drawn;
- derived screens;
- the skill's insistence on reading a whole real app first.

**Bad, or at least rough:**
- **Testing by role.** There's a mismatch between "drive by view path" and how outside tests find things: duplicated labels in library controls (Combobox), and hidden-but-present views that still count for label lookups.
- **Focus.** Restoring it after the opener disappears, and the quiet failures above.
- **`declare-look` path clicks** that disagreed with the DOM.
- **Name collisions** with library classes (`Card`).
- **Seat-grid keyboard navigation** needing a broadcast attribute.
- **Fixed chrome inside a layout.** "Sticky" isn't a concept; `ignoreScroll` only works on a direct child of the scroller.

#### Differences from what I'm used to

There's no component render. `{ }` is TypeScript and `[ ]` is the tree, which kept "logic" and "structure" cleanly apart. Children come from data, never from `.map()`; once I accepted that, the three-level seat replication was easier than its JSX equivalent. There's no CSS. Spacing and type come from layout attributes, which is pleasant until you need sticky positioning or dashes. Handlers can't be `async`; requests are members. This removed a whole class of "fetch then set state" bugs I'd normally write.

#### What it reminded me of
- QML (attributes bound to expressions, `States`, `Behavior`-like springs);
- SwiftUI's environment, in the role of `provided`;
- OpenLaszlo, the lineage the README names;
- spreadsheet-style constraint systems such as MobX computed values;
- for `location`/`waypoint`, a more principled version of Elm-style URL-as-state.

These are impressions, not careful comparisons.

#### Where I'd most want improvement
1. **A by-role, by-name vocabulary in `drive`/`expect`**, plus documentation of `page`'s library. Keep `getByLabel` from matching both a Combobox's wrapper and its input.
2. **Focus that holds up:** a documented way to say "after this overlay closes, focus X", and a loud error when `Focus.focus` fails.
3. **Reaching the view for a replicated record** (for focus, and for scrolling one into view), so grid keyboard navigation doesn't need a broadcast attribute.
4. **Sticky or fixed positioning** that composes with layouts.
5. **`declare-look` path geometry inside scrollers.** If it's a bug, fix it; if it's my misuse, explain it in the message.

#### What I'd use it for

Form-heavy, stateful apps that run on both phone and desktop — checkout, booking, settings, internal tools. `Form` and computed defaults made the hardest part of this brief nearly free. I'd also use it for drawn, data-driven surfaces like the seat map. I'm less sure about apps that depend on rich third-party widgets, or on test suites written against the DOM. I'm also unsure how it performs well beyond the roughly 650 seat controls here; I didn't measure it.

## The names ledger

From `evals/craft/names.py`, run on the build's logs when the report was filed: every name a check refused, what the platform answered, and how it ended.

```
NAMES — eval-venue-11: 0 missed name(s), 1 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)

COLLISIONS (min · held by · name)
    15 · library class  · Card

SUMMARY: 0 of 0 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
