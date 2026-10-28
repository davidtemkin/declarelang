# Venue run 8: Declare 496944cf (library hygiene, State scope, driven layout checks), Opus 5.5

**Run:** 2026-10-27, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-8 claude-opus-5-5 496944cf 8350` against GitHub main.

The same brief, service, port, model, tools and prompt as run 7. What changed between them (`496944cf`):
- **Library:** each overridable method's reference says whether an override calls `super`. Floating, Form, TableRow,
  Toast and Sheet keep their own change work private. The overlays chapter teaches `closed()`.
- **Language and runtime:**
  - a State's overrides resolve as the view's;
  - a disabled view takes no click;
  - `accessibilityHidden`;
  - focus a press gives is not revealed;
  - `bounds()`/`footprint()`/`contentBox()` constraints stay live.
- **Verification:**
  - rungs 5 and 6 ask rung 4's layout questions wherever a script settles and in each state, after the browser's
    scroll comes to rest;
  - `verify --url` and `look --url`;
  - `drive.waitReal`.
- **Eval hygiene:** auto-memory off for the agent, and `finish.sh` ends the run.

The point of the run was to validate those changes, and above all run 7's one failure: the phone seat map.

**Try it:** the app's six files, its five check scripts (`tests/`), fourteen pictures from the build (`shots/`) and
the acceptance results (`drive/`) are filed beside this report. The files are as the agent left them, except one blank line the formatter
adds to `venue-hall.declare` (line 273), so the corpus stays canonical.

## The comparison

Build figures come from the build's own final record. The account was asked for afterwards in a read-only resume
(1.6 min, 8.9k output tokens) and is counted separately.

| | Venue 6 | Venue 7 | **Venue 8** | Venue React 1 |
|---|---|---|---|---|
| Declare commit | `1b3064f2` | `a1edccb3` (forms) | **`496944cf`** | — |
| time | 26.7 min | 25.6 min | **32.6 min** | 31.4 min |
| turns · tool calls | 117 · 116 | 108 · 110 | **129 · 128** | 101 · 97 |
| code, raw lines | 2,095 (5 files) | 1,814 (4 files) | **1,746** (6 files) | — |
| code, excluding comments and blanks | 1,606 | 1,390 | **1,264** | 4,861 |
| **Tokens** | | | | |
| output (incl. thinking) | 129k | 115k | **148k** | 147k |
| fresh input (cache writes) | 326k | 291k | **333k** | 199k |
| cached input re-read | 23.9M | 19.6M | **30.4M** | 9.3M |
| read before first app write | 400 KB | 387 KB | **394 KB** | 23 KB |
| context at first write → end | 189k → 332k | 191k → 299k | **183k → 339k** | 42k → 205k |
| first app write at | 6.6 min | 7.6 min | **7.3 min** | — |
| **Download (gzip)** | 174.3 KB | 170.3 KB | **176.0 KB** ¹ | 158.5 KB + ~85 KB fonts |
| hidden acceptance (`drive.mjs`) | 11 of 11 | 10 of 11 | **11 of 11** | 11 of 11 |
| runtime source read | 1 call | 0 | **4 calls** (how a TextInput is judged on leave) | — |
| library source read | 5 calls | 4 calls | **3 calls** (`form`/`field`, `radiogroup`, `combobox`) | — |
| tool source read | — | 2 calls | **0** | — |
| names refused by a check | 4 | 2 | **1** (resolved by the hint) | — |

¹ `declarec --sizes` from main: program 40.7 KB, runtime 122.5 KB, kernel 12.6 KB.

**The headline: 11 of 11, with the least code yet, but the slowest Declare Venue since run 5.**
- **Acceptance:** every scenario passes, including `phone_guest_pays`, run 7's one failure.
- **Code:** 1,264 lines, 126 fewer than run 7.
- **Forms:** better used than in run 7. `enterMoves` replaces run 7's hack, `refusedWith` is used, and the country is
  a `Combobox` with `purpose = country`.
- **Cost:** 7 minutes longer than run 7, and 55% more cached input. Almost all of it went to debugging and
  verification (below). About 5 to 6 of those minutes went to two platform bugs, a tool gap, and the live service's
  state between reruns.

## Where the time and the tokens went

| phase | time | API calls | cached input re-read | share |
|---|---|---|---|---|
| **Reading and planning** (0–7.3 min) | 7.3 min | 29 | 3.23M | 11% |
| **Writing** the six files (7.3–13.3) | 6.0 min | 6 | 1.20M | 4% |
| **Debugging and verification** (13.3–32.6) | 19.3 min | 90 | 25.99M | **85%** |

The debugging and verification phase ran 31 `declare-verify` runs (23 with its own scripts), 31 `declare-look` runs
and 15 pictures read. The tools themselves were not the cost:
- **Waiting on tools:** about 8 of the 19 minutes. A flow script takes about 14 s, a `look` about 4 s.
- **The model's own turns:** the rest. Each of the 90 calls re-reads a context of about 300k tokens.

So the lever is fewer fix-and-check cycles, not faster tools.

| minutes | what | cause |
|---|---|---|
| 1.0 | compile fixes | normal |
| 3.1 | layout pass; phone tap-to-zoom; taken seats swallowing taps | design work |
| 0.6 | checkout layout | normal |
| ~5.5 | four flow scripts (desk guest, phone signed-in, keyboard only, live seat-taking with a 409) | more thorough than run 7. About 1 min of it was mistakes in its own scripts (an index path, assertion syntax) |
| **~2.0** | a page error after the 409 path | **platform bug:** `Form`'s deferred `showProblems()` runs after the form is discarded. **Tool gap:** verify printed only `page error: Cannot read properties of undefined (reading 'length')`; the agent added its own `pageerror` listener and got minified bundle frames and anonymous `eval` lines |
| **~1.4** | the sign-in sheet saying "Enter your email address." before anyone typed, on touch | **platform bug:** a sheet opened by a finger leaves focus on the page and its first field judged. The agent read `runtime/src/text-input.ts` and patched it with an `Entry.onBlur` override |
| 1.3 | regression run; a driven layout finding | normal |
| 1.9 | visual polish | normal |
| **~1.5** | the keyboard flow failing at the end | **live-service state:** its earlier runs had bought those seats |

One noise item in the tools is this session's own bug: the new "writes to the live service" note counted the dev
server's own `POST /compile` requests.

## The driven layout checks

This was the first run with rung 4's layout questions asked wherever a script settles. The agent saw a dozen findings
during the build. What became of each is in the idiom read below:
- **The seat map's size on a phone:** 648 seats too small for a finger at whole-hall scale. Left deliberately, which
  is reasonable at that scale.
- **A heading overflowing the phone's edge:** fixed.
- **A misplaced `ignoreScroll`:** fixed.
- **A 24-px checkbox:** fixed at the use site. The library's fixed height is the real bug.
- **Four covered controls:** ignored. This is a real defect, run 7's failure in a new place: "Whole hall" covers two
  seats.

The checks found what they were built to find, and named it during the build. They don't force a fix.

## Is it idiomatic Declare?

Mostly yes. The forms are better than run 7's, and the overlays are as good: the sheet is written exactly as the
guide writes one. The two missteps that matter are both about where the person *is*. The phone's seat map decides
what a press means from `app.lastPointerType`, so the first tap on a seat with a finger, or a screen reader's
activation of it on a phone, zooms instead of choosing. And the checkout step is a plain attribute, not a
`waypoint`, so Back from checkout leaves the performance and clears the seats.

Files are `my-apps/venue/`; `venue.declare` is the App, and the others are cited by their suffix (`-hall`,
`-checkout`, `-model`, `-tickets`, `-theme`). "Call N" is the agent's Nth tool call in `logs/agent.stream.jsonl`,
and "min" is minutes from its start (19:27:39).

### What it gets right

- **One `Form` class per form, each with a `source`.** `CheckoutForm` sends `app.pay.request`
  (`-checkout:152–171`) with a `failedMessage` in the box office's voice. Its `refusedWith` reacts to a decline
  (empties the codes), a lost seat (`app.seatsTakenAtPayment`) and a lost session (`app.me.fetch()`). `SignInForm`
  owns its `session` DataSource and sends it (`-checkout:310–314`). A wrong password lands in the form's `error`,
  which an `Alert` shows (`:338`). The Sign in button says "Signing in…" while `pending` (`:339`), as
  `Form.pending` asks.
- **`enterMoves = true`** (`-checkout:154`). Run 7's hand-built `advance()`, which reached into `_counts` (L2), is gone
  with no code in its place. Return moves through the fields in reading order and pays from the last one.
- **Field names that match the service's keys:** `cvc`, `number`, `expiry`, `email`, `postalCode`
  (`-checkout:187, 221, 242, 250, 291`). Each 422 lands on its field with no mapping code. The two security-code
  fields share `name = "cvc"` and are switched by `exists` (`:186`, `:200`), so only the shown one counts. The agent
  made that switch itself at call 119, so that tests matching by label find one field.
- **Specific `required` messages on every field, and `validate` rules that read the model.** The code length follows
  the card's brand (`codeProblem(v, app.pay.codeBrand)`, `:191`, `:255`). The postal code follows the country
  (`:296`). The expiry reads `app.clock` (`:246`). All of them re-judge reactively, as `TextInput.validate` says.
- **ValueControls as fields.** The saved cards are a `RadioGroup` (`-checkout:178–185`) of `CardChoice extends Radio`
  rows replicated from `:cards[]`, and an expired card is a `disabled` radio (`:132`). The country is a `Combobox`
  with `purpose = country` and `required` (`:262–268`). Run 7 had to guess the country from an autofilled postal code
  (L6); here the combobox's autofill answers it, which the reference describes (`Combobox.purpose`).
- **The values live on a model.** `Payment extends Node` (`-checkout:14–71`) holds them, with computed defaults that
  follow the account until typed over. This is the run 6 and run 7 idiom, unchanged, so signing in partway through
  loses nothing.
- **Overlays.** The sign-in sheet is the guide's "Open as state" pattern word for word:
  `shown = { app.signingIn }, input(open: boolean) { app.signingIn = open }` (`venue.declare:604–605`). It has no
  hand-built scrim, no Esc chain and no focus code; the Sheet's `takesFocus` does the focusing. The tickets are a
  `Carousel` driven by the value pattern (`page`/`input`, `:581–585`).
- **States that mean what the author meant.** There are three: `applied = { pressed }` on `PerfCard`
  (`venue.declare:49`), and `applied = { app.wide }` / `{ !app.wide }` on the hall's two boxes (`:431–432`, `:446`).
  The overrides (`height = 100%`, `fill`) are the view's. The bare `pressed` resolves State → PerfCard, the card's
  own press: renamed in a copy, it fails with "not a member of State → PerfCard". None of the run 8 State-scope traps
  are present.
- **Overrides that call `super` where the reference says to.**
  - `SeatDot.onKeyDown` handles its arrows and passes the rest on with `super.onKeyDown(e)` (`-hall:56`).
  - `CheckoutForm.send` ends in `super.send()` (`-checkout:161`).
  - `Entry.onBlur` has no base method, and the compiler taught that (DECLARE4000, call 108).
  - Every Button acts through `onClick`; every Control subclass (`PerfCard`, `LinkButton`, `SeatDot`) acts through
    `press()`.
  - `Hall.onPointerDown` is on a plain View, so it has no base to call.
- **Data.**
  - `ProductionSource` and `SeatMapSource` are DataSource classes with logic of their own (`-model:225–318`). The
    seat map's single write, `markSold`, goes through `set` (`:314–317`).
  - An `EventStream` with `listenTo`, `retry` and `active` writes into the seat map (`venue.declare:212–220`).
  - The performance is `location` (`:224–225`).
  - Focus after a change of screen uses `afterSettle(() => Focus.focus(...))`, wrapped as `focusSoon` (`:345–347`).
    That is the to-do app's own idiom (`apps/todo/todo.declare:708`).
- **The hall follows `10-touch.md` § Pan and zoom about the fingers closely.**
  - Three Springs carry zoom and pan (`-hall:167–169`), and a finger writes the value and its target together
    (`jump`, `:193–197`).
  - A drag reads `deltaX` against the pan it latched at the press (`:204–208`); a pinch uses `onPinch*` (`:212–219`).
  - Choosing a seat is felt through Spring impulses (`grow`, `-hall:61`; `bump`, `venue.declare:261–262`).
  - The spinner's rotation is a `Time` fact (`:152–162`), which `22-time.md`'s table prescribes for a value that is
    a function of the time.
  - The row letters, section labels and bars are `accessibilityHidden` (`-hall:98, 131`; `venue.declare:62`). That
    closes run 7's L5, where 52 row letters had to move into `draw()`.
- **The theme** is merged over SanFrancisco (`venue.declare:181`). It sets `buttonHeight = 44` once
  (`-theme:28`) rather than per button.

### Missteps

1. **The phone seat map keys what a press means on `app.lastPointerType`** (`venue.declare:275–283`).
   - **What it does.** At the whole-hall scale, a seat pressed while `lastPointerType == "touch"` zooms the hall
     about itself instead of choosing. A mouse press or a keyboard activation chooses. Taken seats pass presses
     through to the room (`pointerEvents`, `-hall:49`), and a tap on the empty room zooms (`Hall.onClick`,
     `:189–192`).
   - **What is better than run 7.** Nothing covers the seats now, so a press reaches the seat itself.
   - **What is still wrong.**
     - `lastPointerType` is, in the reference's words, for "revealing hover-only chrome"
       (`10-touch.md`: "reveal from `lastPointerType`").
     - A `toggle` whose first activation does not toggle is a lie to a screen reader. VoiceOver on a phone activates
       with a tap at the control's centre, so it reads as "touch" and zooms.
     - The brief's "pick the exact seat they mean, first time, with a thumb" becomes tap, then tap again.
     - A driver that taps seats by role and name with a finger meets the same first press that does something else.
       That is run 7's phone failure, reached by another road. The agent's own phone script never tapped a seat:
       `phone-saved.mjs:15` sets `app.chosen` directly.
   - **Even zoomed, a seat is under a finger's size.** `near` makes the pitch 40 px (`-hall:159`). That makes a
     27-unit seat 27 × 40/28 ≈ 38.6 px square.
   - **How it should have been written:** at the whole-hall scale on a phone, the *sections* are the controls.
     - Make `SectionView` a `Control` whose `press()` zooms into it, named "Orchestra, $80.00, 112 left".
     - Make the seats controls only once zoomed (`exists`, or `disabled` plus `accessibilityHidden`, while
       `zoomable && !zoomed`).
     - Then every press means one thing for a finger, a mouse and a screen reader alike, with no pointer-type test.
     - Zoom to a pitch of at least 46 px.
     - Keep "Whole hall" off the seats (see finding 2 under the driven layout findings).
2. **The checkout step is an ordinary attribute, not a `waypoint`** (`venue.declare:227`, `:314–323`).
   - Back (the browser's, or a phone's back gesture) from checkout goes back to the performance list, because the
     only history entry is `location`.
   - The `perfId` change then empties `chosen` (`:237–241`), so every seat is lost.
   - Run 7 split this exactly right: `location` for the performance, `waypoint` for "gone to checkout".
   - **Written as:** `waypoint = ""`,
     `step: "seats" | "checkout" = { app.waypoint == "checkout" ? "checkout" : "seats" }`, with `toCheckout()`
     writing `app.waypoint = "checkout"` and `backToSeats()` writing `""`.
   - **Why the agent missed it:** it did ask (call 25, min 3), but `declare-help waypoint` answered only
     "waypoint — an attribute on: App (string) · scoped entry: declare-help <Class>.waypoint". A bare name with one
     owner should print that owner's entry; `App.waypoint`'s prose says exactly when to use it.
3. **The sign-in form is reset by `exists`, not by `closed()`.**
   - **What it does:** `signIn: SignInForm [ exists = { app.signingIn } ]` (`venue.declare:607`), with the email and
     password as the form's own attributes (`-checkout:307–308`).
   - **Why it is wrong:** when the sheet closes, the form is torn out at once, so the sheet slides away empty. The
     reference puts this work elsewhere: "Work for every closing belongs in `closed()`" (`Floating.close`;
     `18-overlays.md` § Open as state). A `Form` "holds no values" (`Form`), so the values belong elsewhere too.
   - **Written as:** keep the form, and keep its values where the program keeps the rest (the App, or a small
     sign-in model). Add
     `closed() { app.signInPassword = ""; app.showPassword = false }` to the Sheet. The overlay is then idiomatic end
     to end.
4. **A send guard that duplicates `pending`** (`-checkout:160–163`).
   - **What it does:** `sending` is set in an overridden `send()` and cleared by `trackChanges = ["pending"]`.
   - **Why it is redundant:** `Form.pending` says "`submit()` does nothing meanwhile". Its source turns `pending` on
     in `send()`, one settle after `submit()` (`library/form.declare:256–291`). A handler's settle closes before the
     next event, so there is no second-press window for the guard to close.
   - **Related:** `paying` reads `app.pay.request.loading` (`venue.declare:267`) instead of the form's own word.
   - **Written as:** delete the guard; `paying: boolean = { app.checkoutForm?.pending ?? false }`.
   - This is run 7's redundant guard in `pay()`, moved into the form.
5. **The security code, emptied after a decline, is left judged.**
   - **What happens:** `refusedWith` calls `app.pay.forgetCodes()` (`-checkout:168`, `:65`). The field was judged by
     the submit, so as the decline lands it turns red with "Enter the card's security code." beside the bank's
     sentence. The person has done nothing wrong yet.
   - **The reference names this exact case:** `TextInput.judged` says to set it back to `false` "for a fresh try (a
     security code emptied after a decline)".
   - **Written as:** in `refusedWith`, after `forgetCodes()`, set `judged = false` on the shown code field
     (`newPart.pair.codeRow.field` or `savedPart.savedCode.code`). `showProblems()` still moves the focus there,
     because the field's `problem` still counts.
6. **`tabOrder()` rebuilds the list** (`venue.declare:428`): `[side.head, stageBox, side.noticeBox, side.tally]`.
   - `View.tabOrder` says to "compose with `tabDefault()` rather than rebuilding the list". This list silently
     leaves out anything later added to `side`.
   - Reordering is a fair use; written as a reorder of `tabDefault()`'s result, it would have kept up with changes.
7. **Hand-written day and month tables** (`-model:20–46`).
   - `12-text.md` (Numbers, money and dates) says to use `Intl.DateTimeFormat` with a locale and a `timeZone`. The
     program already builds `Date.UTC(...)`, so `Intl` with `timeZone: "UTC"` writes "Fri 13 Nov" with no tables.
   - Money uses `toLocaleString` (`:49–51`), as the guide says.
8. **`as any` on the refusal body** (`-checkout:166`). This is the drift check's own example.
   - Written as: `schema Refusal [ error: string, message: string, field?: string, conflicts?[]: string ]` and
     `body as Refusal`.
   - The same applies to the `(this.form as Form | null)` cast in `Entry` (`:106`).

### Workarounds the platform forced

1. **A sheet opened by a finger loses its first field's focus, and the field is then judged empty**
   (`Entry.onBlur`, `-checkout:104–107`; calls 99–109, min 25–27).
   - **What the agent saw:** opening the sign-in sheet with a mouse leaves the focus in Email. With a tap, the focus
     ends on `BODY`, and the Email field reads "Enter your email address." before anyone has typed (call 101:
     `Email judged=false` with a mouse, `BODY judged=true` with a tap).
   - **The workaround it wrote:** every field un-judges itself after a blur while it is empty, unrefused and not
     yet submitted. That works, but it changes the rule app-wide: leaving an empty required field never marks it.
   - **The platform should:**
     - not let a tap's trailing compatibility events take the focus that the tap's own action just gave (the Sheet's
       `focusFirst` runs in `afterSettle`, `library/floating.declare:326–328`);
     - not count a blur to nothing as the person leaving the field.
   - **The reference should:** say, under `TextInput.onBlur` (which today answers with `View.event.blur` alone), that
     leaving judges the field, and in what order relative to a use site's `onBlur`. The agent wrapped its reset in
     `afterSettle` because it could not tell.
2. **Leaving the screen from `refusedWith` crashes the form** (`venue.declare:305–312`; calls 94–96, min 24–25).
   - **The reaction the reference teaches:** `Form.refusedWith` is documented as the place to "undo a reservation the
     refusal names". The natural reaction to a 409 is to drop the lost seat and go back to the hall. Back in the hall,
     the form no longer `exists`.
   - **The crash:** the form's deferred `showProblems()` (`afterSettle`, `library/form.declare:361`) then runs on the
     discarded form: `TypeError: Cannot read properties of undefined (reading 'length')`.
   - **The workaround:** the agent defers its own work with `afterSettle`, so the form finishes first.
   - **Library:** skip the deferred `showProblems` when the form has been discarded.
3. **No "sticky": a summary in the flow that holds at the top once scrolled to.**
   - **What it built:** a desk summary that is level with the form and then held at the top. It is an App child with
     `ignoreScroll` and `ignoreLayout`, with
     `y = { Math.max(app.barH - 36, app.barH + 28 + head.height + 20 - app.scrollY) }` and an `x` computed from a
     duplicated `checkoutWidth` (`venue.declare:550–558`, `:232`). The form's column leaves a hole for it by
     arithmetic: `width = { app.wide ? parent.width - 56 - 380 : parent.width }` (`:527`), which is the drift check's
     own tell.
   - **The doc trap:** `declare-help sticky` maps the word to `ignoreScroll`, which pins from the start and is not
     sticky.
   - **The platform should:** offer an in-flow child that pins at an edge once it reaches it, or, failing that, give
     `07-scrolling.md` a recipe and stop mapping "sticky" to `ignoreScroll`.
4. **A pinned foot bar does not reserve its height in the scroll range.**
   - The phone's checkout pads its foot by a guessed `200` (`venue.declare:506`), so that the last field clears the
     pay dock (`:562–567`).
   - A bar pinned against an edge already "counts as a bar" for keyboard reveal (`07-scrolling.md`). It could add its
     height to the end of the scroll range as well.
5. **Formatting as the person types, and an accessory inside a field.**
   - **The formatting:** card-number grouping with the caret kept after the same digit (`-checkout:224–231`,
     `caretAfter` in `-model:92–100`) and expiry formatting (`:245`) are written by hand in `onInput`.
   - **The accessory:** the card's kind sits over the field through `padding = [0, 150, 0, 12]` and an `x` computed
     from `parent.width` (`:221`, `:234`).
   - **The platform should offer:** a `TextInput` display formatter that keeps the caret, and a trailing slot inside
     the field. Every checkout needs both, and the brief asks for the first.
6. **A radio with content of its own.**
   - **What it did:** `CardChoice extends Radio` places a brand mark, the last four and the expiry by `x` beside the
     dot (`-checkout:125–142`; `BrandMark [ x = 30 ]`). It learned the dot's geometry from the source (see the reads
     below).
   - **The platform should:** give `Radio` a content slot laid after its dot. The reference should say that radios
     may be replicated from data inside the group, because "direct children" (`RadioGroup`) reads as if they may not.
7. **A spatial grid's arrow keys** (`-hall:224–255`; run 7's L4).
   - **What is documented now:** `View.focusScope` says to answer the arrows yourself in such a grid, which the
     program does.
   - **What it costs:** it walks `surface.children` three deep with `instanceof` to find the seats (`:226`).
   - **Still open:** a spatial arrow mode for a `focusScope = stop` view.
8. **A disabled control still takes the press** from what is beneath it.
   - **What it did:** taken seats get `pointerEvents = { gone ? "none" : "auto" }` (`-hall:49`) so that a tap on one
     reaches the hall (call 60: "disabled controls … silently swallow the tap").
   - **`Control.disabled` should say so:** inert, but it still occludes, and `pointerEvents = "none"` lets the press
     through.
9. **The library `Checkbox` is 24 px high on every device** (`library/checkbox.declare:83`).
   - It fails the platform's own finger check in any phone form. The agent fixed it at the use site
     (`-checkout:335`).
   - The library should size its controls from `touchFirst`, or from a theme token, as `buttonHeight` already does.
10. **Computed lists still need a `Dataset`** to replicate over (`chosenSet`, `tickets`, `venue.declare:253`, `:271`).
    This is the language's rule (L7, run 7), unchanged.
11. **No `alert` role.**
    - `Alert` uses `accessibilityRole = status` with `accessibilityLive = assertive` (`-checkout:89`).
    - The reference says a `status` is polite. An assertive status is the nearest thing to ARIA's `alert`, which the
      role list lacks.

**On the country control:** `08-controls.md` § Choosing one of many offers `Combobox` for "a long list the user
narrows by typing", and three countries is not a long list. The program chose it for autofill, and that was right.
The guide should say that a choice the browser's autofill must fill is a `Combobox` with `purpose`.

### The driven layout findings

| finding (when the agent saw it) | in the final program | judgement |
|---|---|---|
| **648 controls under 44 × 44**, `…surface.1.1.2 27×27 …` (call 51, min 15, and every phone run after) | **left, deliberately.** Its final report: "That's deliberate: at that scale a tap zooms instead of choosing." | Reasonable for the whole-hall scale only. Zoomed, a seat is still ≈38.6 px (`-hall:159`), and "a tap zooms" holds only through `lastPointerType` (misstep 1). **Tool:** the finding gives the unscaled box (27 × 27); on screen a seat at the whole-hall scale is ≈10 px (`fit` ≈ 0.39), and the zoomed size is never checked separately. |
| **4 controls another view takes the presses of**, after a tap on the hall at (20, 600): two seats under a top-bar link (`app.topBar.4`) and two under `stageBox.zoomOut` (call 57, min 16) | **ignored.** The next turn reads "Tap-to-zoom works" and moves on. `zoomOut` still sits over the hall at its top right (`venue.declare:437`), and nothing brings a seat into view when it is focused. | A real defect, not noise. Zoomed in, seats panned outside the hall's clip are still in the accessibility tree. A screen reader's activation of one lands on whatever is on screen at its centre, which is the top bar: run 7's failure, in a new place. Two seats can't be tapped under "Whole hall". **Fix:** put the button in the side panel or reserve its strip in the pan range, and call `hall.reveal(this)` from `SeatDot.onFocus`. `reveal` exists, `-hall:256–262`, but runs only on the arrow keys. |
| **`app.hallScreen.side.head.4` runs past the window's right edge at 390** (call 51, min 15) | **fixed.** The phone's `Legend` moved out of the head row onto its own line (`venue.declare:463`, call 53). | Right fix. |
| **`summaryDesk` has `ignoreScroll`, but its parent does not scroll** (call 72, min 18) | **fixed as the message said:** made a child of the App (`venue.declare:550–558`, call 73). | Fixed as the message said, but the stickiness is now hand-computed from `app.scrollY` (workaround 3). |
| **1 control under 44 × 44: `app.signInSheet.body.box.signIn.6` 142×24**, the Show password checkbox (call 77, min 20) | **fixed:** `reveal: Checkbox [ height = 44 … ]` (`-checkout:335`). | Right at the use site. The library default is the real bug (workaround 9). |

### Reading the library and runtime (reference gaps)

| read (min) | what it was after | in the reference? |
|---|---|---|
| `library/form.declare` + `field.declare`, whole (call 16, min 1) | It came right after `declare-help Form --all` and `TextInput --all`. It needed how the form maps a refusal's body to fields, when `pending` turns on (the `sending` guard came from this read) and how a Field shows a nested control's error. | **Partly.** The refusal shapes are in `Form.refusal`, and `enterMoves`, `send` and `refusedWith`'s order are in their own entries. `--all` prints only the class prose (64 lines for `Form`) and none of the member entries, so the "full reference" omits exactly what it needed. **Fix:** `--all` should include member entries, or end by listing them. `pending`'s timing relative to `submit()` is in no entry. |
| `library/radiogroup.declare` from `class` on (call 21, min 2) | It came after `RadioGroup --all` and `Radio`. It needed whether `Radio`s replicated from `:cards[]` count as the group's direct children, and where a radio's dot and label sit, so that a saved card's mark could sit beside the dot (`BrandMark [ x = 30 ]` against the source's `cap: TextLabel [ x = 26 ]`). | **No.** `Radio` offers only `label`. Nothing covers a choice with content of its own, or radios from data. |
| `library/combobox.declare`, `class Combobox` on, two reads (calls 23–24, min 2) | Its stated aim: "check how the Combobox handles autofilled text for the country field". | **Yes, but not where it looked.** `Combobox.purpose` says "Text that arrives whole and names exactly one item, as autofill's does, picks that item". `Combobox --all` doesn't print it (the same `--all` gap). What the source adds: the match is against the item's `label` only, so an autofill that writes "US" against "United States" picks nothing. |
| `runtime/src/text-input.ts` (calls 102–106, min 26) | Where a `TextInput` is judged on leaving, so it could un-judge a field the person never typed in, after the touch-focus bug above. It grepped for `onBlur`, `judged = true` and `judgeOn`, then read lines 150–185. | **No.** `TextInput.onBlur` answers with `View.event.blur` ("lost keyboard focus") and says nothing about judging. `judgeOn` and `judged` say "left" but not how leaving is detected, or in what order it runs relative to an `onBlur` override. The bug itself is the platform's (workaround 1). |

### Silent misses (for the names section)

Each is a real name that the compiler accepted, used for something other than what it is.

- **`app.lastPointerType`** decides what a press does (`venue.declare:278`). It is for revealing hover-only chrome;
  what a press means should not depend on it (misstep 1).
- **`exists`** on the sign-in form, used to reset it on every opening (`venue.declare:607`). The hook was the Sheet's
  `closed()` (misstep 3).
- **`accessibilityHint`** carries a seat's state and price: "Taken", "Free, $80.00" (`-hall:53`). The reference
  defines a hint as "what pressing it does". The brief fixes the name, so the hint (`aria-description`) is the only
  slot left, and the reference should say where a control's status goes when its name is fixed. Borderline.
- **The `hover` theme token used for a pressed fill**: `State [ applied = { pressed }, fill = { provided("theme").hover } ]`
  (`venue.declare:49`). The theme declares `controlPressed` for that (`-theme:16`). Minor.
- A near miss that did not land: `declare-help TextInput.mask` answers with `View.mask`, a paint mask. A
  formatter-hunting author could take it for an input mask. The program didn't use it.

## Names

From `names.py` (the names ledger, at the end): **one** name refused in the whole build. At minute 0 it wrote `color` on a Text, and
the CSS-instinct hint answered "the CSS instinct: text color is 'textColor'"; it was resolved at once. There were no
collisions, no `declare-help` misses and no empty searches. The silent misses are in the idiom read's last section.

## Findings, ranked by leverage

### Platform bugs
1. **`Form`'s deferred `showProblems()` throws when the form has gone.** The handler leaves the screen on a 409 and
   discards the form; the deferred call then reads its members. Guard a discarded form.
2. **A sheet opened by a finger judges its first field.** Focus stays on the page, and the field is marked judged
   without being visited, so its error shows at once. Judging on leave should follow a leave the person made.
3. **`Checkbox`'s fixed `height = 24`** (`library/checkbox.declare`) is under a finger's target on touch.

### Verification
4. **A page error should name the program's line.** verify and look print the message only, and the agent's own
   listener got minified frames. Label each compiled body with its source (development builds only), so a stack
   says "in `Form.showProblems` (form.declare:…), from `venue.declare:…`".
5. **The "writes to the live service" note counts the dev server's own `/compile` posts.** Count only requests to
   another origin.
6. **Live-service state between reruns.** A script that buys seats changes the service its next run meets. verify
   should say so when a script fails after earlier writes to the same service. The docs should show scripts that
   pick from what is available now, which the agent ended up writing.
7. **Short, complete failure output:** the failing step, the program line and the stack. That saves the follow-up
   calls the agent made after piping output through `grep` and `head`.

### Reference
8. **`declare-help X --all` prints only the class prose, never the member entries.** That is why `Form.refusal` and
   `Combobox.purpose` were read from library source.
9. **`declare-help waypoint` returned only an owner line,** not `App.waypoint`'s prose. The checkout step then
   became a plain attribute, and going back from checkout clears the chosen seats.
10. **`TextInput.onBlur`** says nothing about judging on leave, or about its order relative to an override.

## The agent's account, verbatim

Asked after the build in a read-only resume (`impressions.txt`); pasted as written, with its headings two levels down.

### Building Venue in Declare: an account for the people who make it

I haven't changed anything. This is written from the build session, and where I'm unsure I say so.

#### (a) Getting up to speed

**What I read, in order.** I started with `README.md`, which sent me to `skill/SKILL.md`. Following the skill, I read `docs/declare.md` whole, then guide chapters 01, 04 and 05, then `apps/todo/todo.declare` with `todo-parts.declare`. After that I read only what the plan needed:
- `14-data.md`: *Talking to a server*, *Streams*, and *A form* through *A form in a sheet*
- `08-controls.md`: *Text fields*, *Choosing one of many*, *Keyboard focus*
- `10-touch.md`: *Gesture claims* and *Pan and zoom*
- `19-accessibility.md`, first half

I also made about thirty `declare-help` lookups, and read the library source for `form.declare`, `radiogroup.declare` and `combobox.declare`.

**What taught me the most:**
- **The skill's "What Declare handles for you" table.** It is the most useful page in the distribution. Nearly every need in the brief had a row: a form that checks itself, a service's refusal on the field it names, sending once while pending, `TextInput.purpose`, `EventStream`. Without it I would have hand-built at least the refusal mapping and the double-submit guard.
- **The `Form` reference prose.** I read it as `declare-help Form --all`, which printed the doc comment in `library/form.declare`. It told me `refusal(body)` understands `{ "field", "message" }`, and the Venue API's 422 body is exactly that shape. Naming my fields `cvc`, `postalCode`, `number`, `expiry` and `email` was the whole integration. The test run confirmed it: "The postal code doesn't match the card's billing address" landed under the postal field and took the focus.
- **`TextInput --all` on regrouping.** One paragraph says a field that regroups as it is typed should write its text from `onInput`, then call `select()` using `selectionStart`. That was precisely the card-number problem. I wish more reference entries anticipated a real use that concretely.
- **The to-do app.** It gave me the house shape: a `DataSource` subclass for the model, user state on the App, `exists` for transient forms, computed defaults. I copied its idioms almost directly: `focusSoon`-style `afterSettle(() => Focus.focus(...))`, `ignoreScroll` bars, the `Fraunces` `Font` with fallbacks.

**What was missing or misleading:**
- **`declare.md` §10 repeats a paragraph.** "Inside a state, an override is the view's…" appears twice, word for word. It's small, but in the one file meant to be read whole, it made me reread to see whether something differed.
- **`declare-help Accessibility.announce` returns "no entry".** `declare-help Accessibility` has the answer. Dotted lookups on namespaces (as opposed to classes) don't resolve, and the miss message doesn't suggest the parent.
- **Combobox and autofill.** The behaviour I most needed was "text that arrives whole (autofill, a paste) and names exactly one item picks it". As far as I found, it's documented only in a comment inside `combobox.declare`. It decided whether a Combobox could be the country field at all, so it belongs in the reference entry.
- **RadioGroup's direct-child rule.** The `RadioGroup` doc says radios are direct children. It doesn't say that index 0 of `children`, and so of a view path like `methods.0`, is something else. In practice `methods.0` was not a radio, and I lost a debugging round when `methods.2` turned out to be the expired Mastercard rather than "A new card". This is partly my fault for using indices, but the path docs present `app.list.3` as the normal way to name a row.
- **Cross-axis sizing under `SimpleLayout` with `flexes`.** I didn't find this stated plainly. My first desk hall had `stageBox.height = 0` and an empty screen. I solved it with `State [ applied = { app.wide }, height = 100% ]` and a twin State for width. I'm not sure that's the intended idiom. A `ResponsiveLayout` might have been the answer, but I didn't read its entry, and the guide didn't push me to it for this case.
- **`PinchEvent`.** The guide's example uses `e.x`, while the `onPinch` reference says `e.center` is in root space. I used `e.x`, and I never tested a real pinch. I'm unsure that code is right.

#### (b) Expressing what I meant

**Where the language fit my intent closely:**
- **The seat map as nested replication.** `SectionView [ datapath = :sections[] ]` contains `SeatRowView [ datapath = :rows[] ]`, which contains `SeatDot [ datapath = :seats[] ]`. Each seat computes its position on an arc from `rowIndex` and its row's radius. A screen-reader structure (section group, then seats) fell out for free. The service's own data drove the geometry, and the event stream's one write (`markSold` → `set([... "status"], "sold")`) updated exactly the seat that changed.
- **Computed defaults for "signing in loses nothing".** This was the best fit in the whole build. `email: string = { this.account?.email ?? "" }` follows the account until the person types, and then the value is theirs. "Their name and email fill in, and nothing typed is lost" became one line per field, with no "dirty" flags. The phone test confirmed a name typed before sign-in survived it.
- **`method: string = { this.number == "" && this.firstUsable != null ? this.firstUsable.id : "new" }`.** This offers the saved card on sign-in unless the person had already started typing a new one. It's another computed default, and it would have been fiddly state-machine code elsewhere.
- **`Spring` for the seat "pop".** `Spring [ attribute = grow, to = { mine ? 1 : 0 }, stiffness = 560, damping = 16 ]` gives an overshoot that registers the commitment. For the summary pulse I wrote `bump = 1` against a spring whose target is 0, a trick I inferred from the swipe example in the to-do app. It's idiomatic enough, but I'm not certain it's the intended way to do a one-shot pulse.
- **The hall's Springs for tap-to-zoom.** Three springs (`zoom`, `panX`, `panY`) carry it, and a finger writes value and target together. The guide's "the point under the hand stays under the hand" framing was exactly right.
- **`DataSource [ credentials = include ]` and `EventStream [ listenTo = ["seatchanged"] ]`.** Both worked first time against a cross-origin cookie service.
- **`exists` versus `visible`.** Having two words for presence and visibility was the right distinction, and I used both deliberately. Late on I switched the unused half of the payment form to `exists`, so only one "Security code" input is ever in the page.

**Where I worked around the language or library:**
1. **A sticky summary panel.** On desk I wanted the order summary to sit level with the form and then hold at the top as the form scrolls. `ignoreScroll` inside the layout produced a precise diagnostic: "has ignoreScroll, but its parent … does not scroll … To stand still against the window, make it a child of the App". So I moved it to the App and hand-placed it with `y = { Math.max(app.barH - 36, app.barH + 28 + (app.checkoutScreen?.col.head.height ?? 100) + 20 - app.scrollY) }` and `x = { (app.width + app.checkoutWidth) / 2 - 380 }`. This is the "placing everything by hand" smell the skill warns against, and it duplicates layout knowledge. A sticky placement would remove it.
2. **Grid keyboard navigation.** `focusScope = stop` gives linear arrows, and the reference says so honestly: "in a grid where Up means the row above, the view answers the arrows itself". So `Hall.arrow()` walks `surface.children → children → children`, filters by `radius`, and sorts by `cx`. It works, but it's 30 lines of handler code reconstructing spatial adjacency the runtime already knows from geometry. A "spatial" arrow mode for stops would be valuable.
3. **The form discarded during its own refusal.** On a 409 my `refusedWith` set `step = "seats"`, which discards the checkout and so the form. The page then threw `TypeError: Cannot read properties of undefined (reading 'length')` from an `afterSettle` callback, with a stack pointing only at `eval (:6:16)`. Deferring my step change with another `afterSettle` fixed it. I believe the library's `Form` assumes it outlives its own `_heard` → `refuse` → `showProblems` sequence. "Leave the screen when the order is refused" is a natural thing to do from `refusedWith`, so this should be robust, or documented.
4. **A double-submit guard I may not have needed.** I added `sending` with `send() { if (sending) return; … }` because I reasoned two presses could each reach `_proceed` before `pending` re-derived. I never proved that race exists. The `expect.request("POST", "/api/orders", { count: 1 })` check passed, but it would probably have passed without my guard too.
5. **Taken seats swallowed taps.** A disabled `Control` still takes the pointer and does nothing. So on a phone, a tap that happened to land on a taken seat at full-hall scale neither zoomed nor chose. I fixed it with `pointerEvents = { gone ? "none" : "auto" }`. That's defensible, but I'd have expected a disabled control either to pass presses through or for the docs to say it doesn't.
6. **Judging an untouched empty field on blur.** Under touch emulation, opening the sign-in sheet left focus on `BODY` and the Email field immediately said "Enter your email address.", which is exactly what the brief forbids. I overrode `onBlur` in `Entry` with an `afterSettle` that un-judges an empty, untouched field. My first attempt called `super.onBlur()`, and DECLARE4000 told me clearly that a built-in has no handler body to call. I'm uncertain whether the lost focus is real on phones or an artifact of the tool's synthesized compatibility mouse events (with the mouse, focus landed in Email). Either way, judging an empty field the person never typed in, on leave, is a stricter default than most consumer forms use.
7. **Small frictions:**
   - `let to: SeatDot? = null` inside a method body fails as TypeScript (DECLARE6001 / TS17019), though `T?` is legal in declarations. That inconsistency is easy to trip on.
   - Bare tokens like `semibold` are legal as a whole value but not inside `{ }` (DECLARE4005). The message was clear, but I hit it four times.
   - `Carousel` refused `datapath = { app.order }` with a runtime `DeclareError` ("belongs to no Dataset/DataSource"). It only surfaced when I set `order` from outside; in the real flow `order` came from a `DataSource` value. Wrapping it in `tickets: Dataset [ contents = { … } ]` fixed it. A compile-time check would have been nicer, though I see why it's hard.
   - DECLARE4025, the nested-ternary warning, nudged me into `columns: number = { [560, 820, 1180].filter((w) => app.width >= w).length + 1 }`. That's arguably *less* readable than the chain it replaced. The warning is good in general, but a breakpoint ladder may be a case for an exemption, or for a responsive primitive.

**Diagnostics worth praising specifically:**
- **DECLARE4013** (`press()` on a `Button` replaces its activation path; put the action in `onClick`) caught a real bug in five places. I'd note that it exists *because* `Button` inverts the `Control` convention, and that inversion is itself a trap.
- **DECLARE4023** ("Text reads rowIndex, but Text is not replicated … the index is parent.rowIndex") saw a subtle bug in the ticket numbering and named the fix.
- **DECLARE4002** (my `brandName` child shadowing the script function) would have been a confusing runtime bug.

#### (c) Verifying it

**The ladder.** `declare-verify` was fast: R1–R4 in a few seconds, and it fed sample data shaped by each schema so the boot exercised replicated views. "clean through R4 (514 of 653 constraints statically wired)" was reassuring. I didn't investigate the unwired third, and I don't know whether any of it mattered.

**`declare-look` was the workhorse.** `--set app.location=p06 --set 'app.chosen=[…]' --call 'app.toCheckout()' --shot` let me reach any screen in one command, and `--read` answered geometry questions faster than a screenshot. The `--outline`/`--read` habit the skill recommends paid off. `stageBox.height = 0` diagnosed the empty desk hall in one call.

**The tool understood fingers.** It refused my `--click` on a full-scale seat under `--touch`: "a tap … lands within 6 px of … surface.1.6.9, and a finger there is taken by it — a browser moves a tap onto a control that close." That's not noise; it's the brief's own "hard case", stated by the checker. It pushed me to make a tap anywhere on the room zoom in, which is better design. The standing finding "648 control(s) smaller than 44 × 44" then became noise I couldn't acknowledge. I'd like a way to mark a finding as understood (for example, "these targets are reached through zoom").

**Assert scripts against the live service** (`--no-boot --url http://127.0.0.1:8200/…`) gave real cookies and a real SSE stream. I wrote four flows and all four pass. `drive.requests()` and `expect.request(…, { count })` let me assert "one payment, not two", and naming views by accessible name (`methods."A new card"`) was sturdier than indices.

**Where verification hurt:**
- **`page` is not full Playwright.** `page.route` "is not a function", so I couldn't stub out the event stream to force the 409 race. I reached the 409 path by putting an already-sold seat in `chosen` instead. It's a weaker test of the real race, since the stream beat my click in the honest version.
- **Live mutation.** The note says so ("what they made stays there; --fixtures … leaves nothing behind"), and I ignored it for realism. My runs bought seats, which later broke my own keyboard script: the seats it assumed were free had been sold. I should have used fixtures for repeatable checks and kept a single live smoke test. That was my call, not a tool failure.
- **Runtime errors have no source position.** The 409 crash stack was `eval (:6:16)` inside `declare-boot.js`. I found the cause by reasoning, not by the stack. For a language whose diagnostics are otherwise this good, a runtime error that names the `.declare` line would be a big step.
- **`expect.attr("app.chosen", "length", 2)` fails as `undefined`.** I fell back to `page.evaluate`. Either attribute paths or a small `expect.value(fn)` would help.
- **Things I couldn't verify at all:**
  - real phone keyboards and autofill (as the brief anticipated)
  - a real pinch
  - performance of 648 `Control`s, each with a `Spring`, on an actual phone
  - VoiceOver's actual reading

  `--semantics` showed the tree (`toggle "Orchestra, row A, seat 4" hint "Free, $80.00" [not pressed]`), which is good evidence but not the experience.

#### Surprises

- **`scale` carries hit-testing and the parent's footprint**, not just paint ("every reader agrees on the one geometry"). Scaling one surface for the zoom was safe because of this. I expected CSS-transform semantics and was braced to fight them.
- **The finger-proximity check** in the driver, described above.
- **How directly the library's conventions matched a hand-written REST API I'd never seen**: `{ field, message }` refusals, `purpose` tokens mapping to `cc-number`/`cc-exp`/`postal-code`. I confirmed the attributes on the real inputs.
- **`location` as a plain attribute.** Opening a performance is `app.location = :id`, Back works, and a `trackChanges = ["perfId"]` handler resets the choice and moves focus. No router.
- **The formatter rewrote six files**, including the theme's comment spacing, without breaking anything.

#### Good and bad, plainly

**Good:**
- The compiler is a genuine collaborator. Its errors name the fix, and applying exactly that fix almost always worked.
- Computed defaults, Springs and `exists` are small ideas that carry a lot.
- The skill's routing table saves real time.
- The forms stack is unusually complete: judging on leave, a service's refusal on the field it names, `enterMoves`, `purpose`.
- The checking tools understand input modality.

**Bad:**
- Layout was the area I most often reached past the idiom: a breakpoint swap, a sticky panel, and cross-axis sizing under a flexed layout.
- Spatial keyboard navigation has to be built by hand.
- A runtime error inside the library gave me no Declare position.
- Two library behaviours (disabled controls eating presses, judging untouched fields on blur) went against what I expected, and I had to discover both by testing.
- Some docs live only in library source comments.

#### Compared with what I'm used to

The biggest difference is that there is no render function. I never once thought about re-rendering, memoisation or effect dependencies. Instead I thought about "who owns this value": a set constraint versus a declared computed default. The §5 table on that is the single most important page for a React-trained writer.

The second difference is that events don't bubble, and children report up by calling methods. That was cleaner than I expected. The first-class `press()` versus `onClick` split on `Button` was the one place the model leaked.

Styling without CSS was easy, and theme tokens via `provided("theme")` read like design tokens done properly.

#### What it reminded me of

**QML** most of all: property bindings as constraints, `State`s with automatic revert, Springs as Behaviors, a tree with ids, and imperative JavaScript in handlers. Also **Flex/MXML** and, by its own account, **OpenLaszlo**. The reactivity feels like Svelte's or Solid's fine-grained signals, but compile-time-wired and stricter. The `location`/`waypoint` split has an Elm-like clarity about what state is.

#### Where I'd most want improvement

1. **Responsive arrangement primitives.** Swapping a row for a column and sizing the cross axis without `State` pairs, plus sticky placement within a scroller.
2. **Spatial focus navigation** for `focusScope = stop`, or a grid helper that uses view geometry.
3. **Runtime errors mapped to `.declare` source**, and `Form` robust to being discarded inside `refusedWith`.
4. **Driver capabilities:** network interception in assert scripts, `expect` over expressions, and a way to acknowledge known layout findings.
5. **Docs:** move behaviour now documented only in source comments (Combobox autofill picking, `RadioGroup` children indices) into the reference; fix the duplicated §10 paragraph; let namespace member lookups resolve.
6. **Default judging:** reconsider judging an untouched, empty field on blur, and say what a disabled control does with a press.

#### Would I use it again?

Yes, for interaction-heavy consumer surfaces: checkout and booking flows, seat maps and other spatial pickers, dashboards with live data, anything where continuity of motion matters. Venue's hall, forms and live-seat handling took noticeably less glue than I'd expect in React. The parts that stayed hard were layout and spatial keyboard navigation, not reactivity.

I'd be more hesitant, with genuine uncertainty, about a large team codebase today. The ecosystem is young and real-device performance is unproven to me; I didn't measure 650 sprung controls on a mid-range phone. For long text-heavy sites I'd want to see the crawler output and accessibility hold up under real screen readers before committing.

## The names ledger

From `evals/craft/names.py`, run on the build's logs when the report was filed: every name a check refused, what the platform answered, and how it ended.

```
NAMES — 2026-10-27-venue-run8: 1 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
     0 · attribute · color                · Text                     · CSS                · foreign hint · ×1  ·    0 · resolved
         Text has no attribute 'color' — the CSS instinct: text color is 'textColor'

SUMMARY: 0 of 1 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
