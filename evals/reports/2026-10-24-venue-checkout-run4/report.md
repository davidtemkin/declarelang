# Venue (checkout) run 4: Declare 613f8875 (v0.5.3), Opus 5.5

**Run:** 2026-10-24 05:22 UTC, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-checkout-4 claude-opus-5-5 613f8875 8350` against GitHub main
`613f8875`, the v0.5.3 release. It is the first Venue run since the fixes Venue run 3 prompted:

- `validate`, `error` and `judgeOn` work on any `TextInput`, bound with `<->` or not;
- inside `onInput`, `selectionStart` is the caret after the keystroke, and a `select()` lands in the handler's text;
- a `Combobox` takes a `purpose`, and autofill's whole text picks its item;
- a tap's trailing mouse events no longer reach the screen it opened;
- a nested `ignoreScroll` is noted at boot;
- the driver waits for a press's target to hold still, and passes over views that take no presses;
- `--semantics` prints the whole tree;
- `rowIndex` read on a view that is not replicated is warned of (DECLARE4023);
- the touch work: `Carousel`, a sliding `Switch`, pinch without page pan, and a pinned bottom bar held by the browser.

It used Opus 5.5 (`claude-opus-5-5`) with web tools available, and the brief included the idiom sentence. One round,
with no intervention. The standard strip removed `evals/`, `docs/system-design/` and `test/`. The service ran from
outside the sandbox on 8350.

The report is in the three-area form: **reading and docs**, **API and language**, and **debugging and verification**,
each costed, with one list ranking the fixes across all three by their general leverage.

The app, its three assert scripts and seven pictures are filed beside this report. The agent's dev server has stopped,
so there is no live copy to try.

## The comparison

The build figures come from the build's own final record. Two turns are counted separately:

- **The account**, asked for afterwards in a read-only resume (1.0 min, 4.9k output tokens).
- **A wake-up.** Two hours after the build, the agent's background dev server hit its time limit, and the finished
  session woke for one turn to say so (0.1 min). That turn wrote the 362k context back to the cache.

| | Venue 1 | Venue 2 | Venue 3 | **Venue 4** | Venue React 1 |
|---|---|---|---|---|---|
| Declare commit | `9444a776` | `a2f8bf3a` | `85a9291a` | **`613f8875`** | — |
| time | 44.2 min | 56.0 min | 42.6 min | **34.7 min** | 31.4 min |
| turns · tool calls | 184 · 179 | 182 · 173 | 168 · 167 | **160 · 159** | 101 · 97 |
| code, raw lines | 1,885 | 1,908 | 2,015 | **1,860** (4 Declare files) | — |
| code, excluding comments and blanks | 1,499 | 1,449 | 1,437 | **1,351** | 4,861 |
| **Tokens** | | | | | |
| output (incl. thinking) | 162k (68k) | 159k (68k) | 186k (88k) | **145k (55k)** | 147k (51k) |
| fresh input (cache writes) | 399k | 390k | 427k | **360k** | 199k |
| cached input re-read | 46.6M | 42.5M | 49.3M | **37.1M** | 9.3M |
| read before first app write | 391 KB | 416 KB | ≈470 KB | **400 KB** | 23 KB |
| context at first write → end | 185k → 405k | 208k → 396k | 239k → 433k | **197k → 366k** | 42k → 205k |
| first app write at | — | — | 9.5 min | **7.6 min** | — |
| **Download (gzip)** | 152.9 KB | 151.8 KB | 166.0 KB | **157.9 KB** ¹ | 158.5 KB + ~85 KB fonts |
| hidden acceptance (`drive.mjs`) | 11 of 11 | 9 of 11 | 11 of 11 | **11 of 11** | 11 of 11 |
| runtime source read | 5 files | 1 call | 7 calls (5 files) | **3 calls** (1 file) | — |
| library source read | 2 files | 11 calls | 7 calls | **8 calls** (2 files) | — |

¹ `declarec --sizes` from the main tree, built to a scratch directory: program 36.2 KB, runtime 108.9 KB, kernel
12.6 KB. Run 3's program bundled a QR-code package; this one draws its own barcode.

**The cheapest and fastest Declare Venue so far.** It took 8 minutes less than run 3, re-read 25% less cached input,
and still passes all eleven hidden scenarios. Its context was 42k smaller at the first write, because it read three
chapters by section rather than whole. It wrote less code.

It is still slower than the React baseline, by 3.3 minutes, and re-reads four times as much cached input. Nearly all
of the extra is the debugging stretch below, and two thirds of that is the tools.

## Where the time and the tokens went

Phases from the build stream, by wall-clock and by the cached input each phase's API calls re-read.

| phase | time | API calls | cached input re-read | share of tokens |
|---|---|---|---|---|
| **Reading and planning** (0–7.6 min) | 7.6 min | 38 | 4.86M | 13% |
| **Writing** the four files (7.6–15.8) | 8.2 min | 13 | 2.91M | 8% |
| **Debugging and verification** (15.8–34.7) | 18.9 min | 94 | 29.30M | **79%** |

The split is the same as runs 3 and Cadence 16 (15 / 8 / 77 and 15 / 7 / 78). Most of the run's cost is still in
debugging and verification, and most of that is the phone.

The browser was used from minute 2.8, for a probe of panning over controls. In all, the build made 32 `declare-look`
runs and 20 assert runs, and read 20 pictures. The agent also wrote **four browser scripts of its own** in `/tmp`, each
for something the tools hid:

- the console at boot;
- a paid order;
- the card-name field;
- the sign-in sheet.

`measure.mjs` counts one of the four, since the other three were written by `cat` heredoc.

Its time breakdown is wrong for this run: it divides by the wake-up turn's duration, the stream's last result, rather
than the build's.

## Reading and docs

**The SKILL's order, followed:**

- README and SKILL, then `declare.md` whole.
- Chapters 01, 04 and 05.
- The calendar beside `28-calendar.md`.
- Then by need: chapter 14 from its forms section on, 08, 19 and 06 whole, 07, part of 18, the first 220 lines of 21 and
  of 10, and `verify.md` in two parts.

It used `declare-help map` once, on the tracker, and asked `declare-help` about 27 topics.

**What it says taught it most** (account, (a)):

- **The SKILL's "What Declare handles for you" table.** In its words: "Nearly every need I had was already a row in
  it". It named `purpose`, `judgeOn`, `accessibilityError`, `DataSource.errorBody` and `EventStream`.
- **`declare.md` §5's computed defaults.** "Signing in fills what's empty but keeps what you typed" became
  `email: string = { app.account.email }`, which it calls "the most elegant moment of the build". It learned that from
  the docs, not by experiment.
- **`declare-help`.**

**What it says was missing:** the calendar taught it little for a form-heavy app, and it asks for a small "commerce
and forms" reference program. The tracker is the forms model the SKILL names, and the agent mapped it but read none of
it.

**Source reads, which count as reference gaps:**

| read | what it wanted | what answers it |
|---|---|---|
| `runtime/src/purpose.ts` (80 lines) | the `purpose` tokens and their autocomplete names | `declare-help TextInput.purpose` prints the table; it had already asked |
| `grep country` over `library/` and `runtime/src` (2 calls) | how to make the country field autofill | `declare-help country` and `declare-help autofill` both name `Combobox.purpose`; it never asked |
| `library/combobox.declare` (3 calls) | whether a whole autofilled text picks an item | `declare-help Combobox.purpose` says so in its last sentence; it never asked |
| `library/carousel.declare` (first 80 lines) | how a Carousel is used | `declare-help Carousel --all`; its answer to `declare-help Carousel` ends by naming that, and the agent didn't follow it |
| `library/themes/sanfrancisco.declare`, `library/icons/` (3 calls) | the theme's token values; the icon class names | `declare-help SanFrancisco` prints the values, and `declare-help "theme tokens"`, which it asked, names that; the icons are listed by `declare-help icons`, and by `declare-help Icon` only after ninety lines of prose, past the `head -30` it read (D2) |

**Not found, though it exists:** where a font stack belongs. The agent put the display face's font list on the App
(`display: string[]`), "because I wasn't sure a theme record could hold a font list". Chapter 11 says it does ("A
palette is a theme. When a color, a size or a font list appears in more than one…"); it read chapter 11 in run 3 but
not in this run.

## API and language

**What the compiler caught.** There were about eight `declare-verify` rounds, 1.3 min from the first compile to R4.
Every message named its fix:

| message | note |
|---|---|
| `App.display's default expects an object — a { } constraint` | a list as a default needs `{ [ … ] }` |
| `Animator.motion … got 'back'` | `backOut` |
| `Control.press(…) is not a valid method body` | a typo |
| `PerfRow.perf's default … got the datapath :perf — write { :perf }` | fixed as written |
| `Control declares no baseline` | `align = center` |
| `FormField.width — … it flexes` (2 sites) | the account calls repeating `width` at six use sites the price |
| `TextInput.judgeOn expects an EditorJudgeOn … got the string "leave"` | in a probe; the bare-token rule, "seconds, not minutes" |
| `Object is possibly 'null'` (5 sites), an undeclared `countries` | ordinary type checking |
| `Sheet.form is an attribute — a child may not take an attribute's name` | renamed `signInForm`, as in run 3 |

**What the compiler did not catch:** a method named `valueOf`. It compiled clean through R3, and the program then
failed at boot with "Checkout.valueOf: 'valueOf' is a member of every object — choose another name"
(`runtime/src/instantiate.ts:948`). That check belongs in the compiler, beside the one that refuses `scrolling` (L1).
How the tools then hid it is T1.

**Where the language fit** (account, (b), and the code agrees):

- **v0.5.3's additions, used as intended.** The card number is a program-filled field with `validate` and
  `judgeOn = leave` (`venue.declare:785–796`, `venue-checkout.declare:140–152`). It is regrouped as typed, with the caret
  put back from `selectionStart`. The country is a `Combobox [ purpose = country ]` (`venue.declare:821`). The tickets
  are a `Carousel` (`:495`). There is none of run 3's hand-built edit session, and no `afterDelay(0)` around screen
  changes.
- **A form whose defaults are the account's** (`venue-checkout.declare:16–28`). Signing in fills what is empty and
  keeps what was typed, with no merge code.
- **Live seats** written into the seat map's own records by the `EventStream`. A derived `hall` dataset wraps each
  record rather than copying it, so every view of a seat follows one write.
- **Validators read app state.** The service's refusal for a field is shown by that field's `validate`, and it clears
  when the field's text changes (`serverError`, `venue-checkout.declare:46`).
- **648 seats as one Tab stop** with `focusScope = stop`, each a toggle named as the brief requires.

**Where it did not:**

- **L2 — A drag that starts on a control can't move what holds it.** The agent's first phone design was a pan surface
  of seat `Control`s. Its probe at minute 2.8 found that a drag beginning on a seat never reaches the surface's
  `onPointerMove`. It moved to a native `scrolls = both` pane, which does pan from a seat. That pane is a sound design
  in its own right, with native momentum, and the brief asks for no animated zoom, so the program lost nothing it
  needed. The gap is real all the same, and it reaches further than the agent's case: a `Carousel` whose page holds a
  `Button` can't be swiped from the button (a probe: `--drag` from the button, `page` stays 0, and a tap on it still
  presses). **Confirmed on main.** Native scrolling hands a travelling touch from the control to the scroller.
  Declare's pointer routing doesn't hand it to an ancestor that declared `onPointerMove`.
- **One screen, two arrangements**, again. The hall screen is frame arithmetic over `app.wide`, with 21
  `app.wide ? … : …` expressions in `venue.declare`. The account says that flipping a `SimpleLayout`'s axis "collided
  with the layout owns the size along the flow", and that is so for a child that flexes. What says two arrangements of
  one screen is a layout of its own: a `place()` of a dozen lines that divides the room one way or the other, which
  the agent didn't consider (D3).
- **A field registry by hand.** `PayForm.fieldView(name)` (`venue.declare:729–733`) is a nine-way conditional from a
  field's name to its view, so the service's `field` can focus it. The account says it is "the kind of registry I'd
  hoped the language would give me". The fields could be one class replicated over field records, or carry their name
  and be found by it.
- **Forwarding through a wrapper.** `FormField` wraps a `TextInput` and forwards `onInput` to an `edit(v)` that use
  sites override. The account asks for "a way for a wrapping class to expose an inner child's handlers". Overriding a
  method of the wrapper is that way, and the code is idiomatic. The complaint is about the indirection, and is
  noted, not ranked.

## Debugging and verification

Seven episodes, in order. "Cheapest answer" is the step that would have settled the question soonest, had the platform
offered it.

| # | the question | time · API calls · cached input | outcome | cheapest answer |
|---|---|---|---|---|
| E1 | does it compile? | 1.3 min · 10 · 2.63M (7%) | the messages above, each fixed from its text | — the ladder working |
| E2 | why does it never come up? | 2.0 min · 6 · 1.62M (4%) | R5 and `declare-look` both said only "Waiting failed: 10000ms exceeded", even with `--console`. The agent grepped `tools/` for `waitForFunction`, found `puppeteer-core`, and wrote its own console script, which printed the `valueOf` boot error | T1: the boot error, said by the tool; L1: refused at compile time |
| E3 | do the list and the hall look right? | 1.5 min · 12 · 3.36M (9%) | real fixes: a month heading overlap, the tier labels' gap, arrow keys in screen order. On the phone, `scrollStartX` gave 0 for a pane built after the data; replaced by `onInit` with `afterSettle(scrollTo)` | `scrollStartX` is applied "once, at first layout", when the room was still its default size; a note when a start offset is clamped would have said so |
| E4 | the desk flow, end to end | 3.1 min · 12 · 3.56M (10%) | `drive.selectAll` left focus where it was, so the card number was typed into the name field. Then R5 said "page error: Cannot read properties of undefined (reading 'hall')" with no place, so it added `page.on("pageerror")` for the stack and wrote a second script of its own. It guarded the drawing with `?.` | T2 (`selectAll`); T3 (a page error with no place); P1 (the drawing) |
| E5 | the phone story, end to end | 5.8 min · 25 · 7.98M (**22%**) | `Sheet.form` renamed. A seat off the pane's edge "is outside the window … and scrolling did not bring it in", so the test picks seats in view. Then each field below the fold failed the same way. The agent found that the DOM's own `scrollIntoView` reaches them and wrote a `reach()` helper that scrolls by accessible name, "as a person would" | T4 |
| E6 | a look at every screen | 3.7 min · 24 · 8.33M (**22%**) | real fixes: a toast over the Pay bar, the tickets' pager below the fold, the phone list's "79 left" over the price. A `declare-look` picture after sign-in showed the page still dimmed; a third script of its own, in real time, showed it wasn't | the dim: not reproduced (below) |
| E7 | format, all three scripts, cleanup | 1.3 min · 5 · 1.82M (5%) | all pass; its scratch probes removed | — |

**Scored from the main tree:** all three of the agent's assert scripts pass. **The hidden acceptance passes 11 of 11**
(`drive/results.json`), served from the run's own tree.

**What the account says served it** (c): diagnostics that name the fix; R4's layout notes ("concrete and right"); the
honest "not built at boot" note. It called `declare-look` with `--set` and `--call` "the best tooling in the build".
It also named `drive.requests` and `expect.request({ count })`.

**Less well:** its five "where the tools hurt" items are checked below.

### Each complaint, checked

Every claim in the account about the platform or the tools was probed on main (`613f8875`).

- **T1 — A boot failure reported as a timeout. Confirmed.** A two-line program with a `valueOf` method:
  - R1–R3 pass.
  - R4 says only `boot: Waiting failed: 10000ms exceeded`.

  The page had logged "boot failed" with the reason. The tool waits for a ready signal the failed boot never gives,
  and reports the wait rather than the console. In the agent's program R4 passed and R5 timed out instead, because the
  class that threw was built only after data arrived. The account calls this "the costliest moment of the build".
- **L1 — `valueOf` accepted by the compiler. Confirmed** (the same probe). The runtime's check (`instantiate.ts:948`)
  covers every `Object.prototype` member. The compiler has no matching check.
- **P1 — A view taken out by `exists` draws once more against an emptied `app`. Confirmed, cause not traced.** A
  probe: a screen with `exists = { app.show }` holds a drawn view whose `draw` reads `app.holder.n`. Setting `show`
  to false runs that `draw` again, in which `app.holder` and `app.show` are both `undefined`, and it throws. The
  agent's harness and virtual clock aren't involved: the probe fails the same way in the assert run. It reproduces in
  the agent's own program with its `?.` guard removed (`HouseMap`, on the hall screen, drawn during the switch to
  checkout). Any program with a drawing on a screen that `exists` switches is exposed.
- **T2 — `drive.selectAll(path)` doesn't focus the field. Confirmed.** After typing in field A, `selectAll("…b")`
  leaves the focus in A, and the next `type` appends to A. `selectAll` is new in v0.5.3.
- **T3 — A page error in an assert run has no place.** R5 printed only the message. The stack (the agent's
  `page.on("pageerror")`) named `draw.js` and the program's draw body. A boot error names its class and member; a
  page error should name the view and the member that threw.
- **T4 — The driver can't reach a text field below the fold. Confirmed, cause found.** The
  agent's own phone flow, with its `reach()` helper made a no-op, fails at the card number: "outside the window at
  (195, 1040) and scrolling did not bring it in". The cause is in the runtime, not the driver. The flow's first tap,
  on a performance row, changes the screen under the finger: the row's element leaves the page, and the page's
  scroll is clamped to the top while the finger is down. The touch's end goes to the departed element and never
  reaches the page, so the page holds itself scrolled by the user from then on, and every scroll the program asks
  for waits for that scroll to end. On a phone the same thing holds program scrolls until the next touch. Past that,
  the driver refused a field that "nearest" had scrolled to rest against the pinned Pay bar, where a finger would be
  taken by the bar. A first probe of a plain field 1,500 px down was reached fine (an earlier version of this report
  said otherwise, from a probe whose field was covered by another of its views). This is the third Venue run whose
  phone test scrolls by hand.
- **A seat off a both-ways pane's edge. Not reproduced.** In a probe, the driver scrolls a `scrolls = both` pane to a
  button 1,300 px to the right and back to one at the origin. The agent's pane is scaled (`app.unit`), which the probe
  didn't do.
- **A false "out of reach" note for a `Carousel`'s pages. Found while probing.** R4 notes each control on a page past
  the first: "a control may be out of reach — app.col.deck.2.0 (Button) lies outside app.col.deck, which clips and does
  not scroll". A swipe brings those pages in. The check counts a scroller as reaching what it clips, but not a view
  that takes a drag, so every program with controls on a carousel or a pan surface is told they may be unreachable
  (T6).
- **A `--drag` on a plain view to scroll the page is refused under `--touch`. Found while probing.** "would reach
  'app'". A finger dragging over content that takes no presses is how a phone scrolls, so the press-cover check
  shouldn't apply to a drag (T5).
- **The dim after sign-in. Not reproduced.** A `Sheet` closed by a button and shot at once shows no scrim. The agent's
  sheet closed from a `DataSource`'s `onLoad`, which the probe didn't do.
- **"`scrolls = { app.wide ? "y" : "none" }` might make Tab-into-view fail".** The agent restructured instead and
  says it is unsure. Not probed.

## What it built

Four screens, with checkout and tickets as steps. Pictures are in `shots/`.

- **The list:** performances under month headings, each with its date in a large serif, time, lowest price, and how
  full ("Nearly sold out · 79 left").
- **The hall:** a stage, and four tiers as bands of curved rows, each a shade deeper the nearer the stage, with the
  tier's name and price in the gap where it rises. Free seats are outlined squares, sold ones dots, and chosen ones
  filled with a tick; a chosen seat pops on a `backOut` curve.
  - **At a desk** the whole room fits beside a panel with the date, a legend, the prices, the chosen seats with ×, the
    total and Continue.
  - **On a phone** the room is a pane at thumb size that pans both ways, with a map of the whole house above it showing
    where you are; tapping the map moves there.
  - **A seat someone else buys** while you look is crossed out and leaves your choice with a sentence naming it.
- **Checkout:**
  - **Fields:** one column, each with its label above and its problem below once you leave it. The card number groups
    as typed, keeps the caret where you were, and names its brand. The country is a combobox that autofill fills.
  - **Signed in:** the saved cards are radios, the expired one disabled.
  - **The order** is beside the form at a desk, and on a phone the Pay button is pinned at the bottom.
  - **Refusals:** every one lands on its field in the service's words.
- **Tickets:** a carousel of ticket cards, one at a time with Previous and Next, each with the seat set large and a
  drawn barcode.
- **Sign-in** is a `Sheet`, from the top bar or the form.

## Is it idiomatic Declare?

Yes, more than run 3. The data, the form and the hall are as good as any run's.

### What it gets right

- **The form as one `Node`** (`Checkout`, `venue-checkout.declare:16–121`): every field's value with the account's as
  its default, the rules as `errorOf(field)`, the service's refusal held while the field keeps the refused text, and
  the payment derived. The account puts it at "about 100 lines and readable".
- **v0.5.3's form additions where they belong:** `validate` on program-filled fields, the caret mapped from
  `selectionStart`, `Combobox [ purpose = country ]`.
- **One source per thing:** the seat map, the account and the order are `DataSource`s, and the stream writes into
  the seat map in place.
- **The screen derived from `stage`**, with no navigation code in the views.
- **A theme with the design's tokens**, with every colour named, including the tiers and floors.
- **Accessibility built in:** seats as toggles with `accessibilityPressed`, a single Tab stop for the hall, headings
  with levels, `Accessibility.announce` on sign-in and on a lost seat, and `accessibilityError` through `validate`.

### Missteps, and how they should have been written

1. **The hall screen placed by hand** (`venue.declare:358–359` and on): widths and heights as arithmetic over
   `app.wide`. A layout of its own divides the room between the stage and the order, beside it or under it, and the
   panel and the footer that each arrangement has alone go in `State`s on `app.wide`, as the weather app's
   `desk: State [ applied = { !app.phone } ]` carries its grid (D3).
2. **The font stack on the App** (`venue.declare:44`), read as `fontFamily = { app.display }` at nine sites. It is a
   theme token, as chapter 11 says.
3. **The field registry** (`venue.declare:729–733`). Replicate `FormField` over records naming each field, or name the
   views by field and look them up, so a new field is one record.
4. **`afterDelay(150, () => app.focusAfterSignIn())`** (`:139`): a guessed delay, to land after the sheet "has handed
   focus back". A sheet that has finished closing should say so: an `onClosed`, or focus restored to a named view.
5. **`afterSettle` around `select()`** in the card number's `edit` (`:794`). Since v0.5.3 a `select()` made inside
   `onInput` lands in the text the handler wrote, so the deferral isn't needed. It works either way.
6. **The seat-to-seat arrow handler** finds its target by `accessibilityLabel` through `as any`
   (`venue.declare:229`). It could find it through the seat's record instead.

### Workarounds the platform forced

- **P1**: the `?.` guards in `HallFloor` and `HouseMap`.
- **T4**: the `reach()` helper in `tests/flow-phone.mjs`.
- **T2**: click instead of `selectAll` in the tests.
- **The order panel and the Pay bar moved out of the checkout screen to the App** (`payAside`, `payBar`), because
  `ignoreScroll` pins only a direct child. The boot note said so, which is v0.5.3's fix for run 3's P2, and the agent
  followed it. The account calls this the one thing it missed from CSS (`position: sticky`).

## Findings, by area

### Reading and docs
- **Every library read had a `declare-help` answer.** Four of the eight were questions it never asked, or an answer
  it didn't follow to `--all`. They count as reference gaps all the same, but no prose is missing.
- **D2 — The icons a class ships, listed first.** `declare-help Icon` lists the shipped marks after its prose on
  writing one.
- **D3 — Room divided differently at two widths is a layout of one's own**, and nothing on the way to that question
  says so. Chapter 06 sent "a wholly different configuration at a width" to a `State`; the only teaching example of a
  layout, chapter 17's, places children without sizing them. A probe `SplitLayout` (two boxes from `contentExtent`,
  side by side or stacked) lays the hall's frame at both sizes and through live resizes, with no size on any child.

### API and language
- **L1 — Refuse `Object.prototype` member names at compile time** (`valueOf`, `toString`, `constructor`, …), as the
  runtime already does at boot.
- **L2 — A drag that starts on a control should reach an ancestor that takes the drag**, once it travels, with the
  press cancelled, as native scrolling does: a finger or a pen at the slop, a mouse when it leaves the control. Today
  `Carousel` can't be swiped from a control on its page, and a pan surface of controls can't be built.

### Debugging and verification
- **P1 — A view removed by `exists` must not draw again.** Dispose its drawing before the tree it reads is taken down.
- **T1 — Say why a boot failed.** When the page logs a boot failure, R4, R5 and `declare-look` should print it, not
  the wait that timed out.
- **T2 — `drive.selectAll` must focus the field.**
- **T3 — A page error in an assert run should name the view and member that threw**, as a boot error does.
- **T4 — A touch that begins on an element the screen change removes must still end**, and the driver must scroll a
  field clear of a pinned bar before it gives up on it.
- **T5 — A touch `--drag` over a view that takes no presses is a scroll**, not a refused press.
- **T6 — A control a drag brings into view is in reach.** R4's out-of-reach note should treat a clip that takes a
  drag, or holds the view that does, as it treats a scroller.
- **`measure.mjs`** should take a run's time from the build's result, not the last one in the stream.

## What changes next

Ranked by general leverage: how much each helps agents across apps and runs, not what it cost here.

1. **T1 with L1 — Boot failures said, and `valueOf` refused at compile time.** Every program that throws at boot meets
   T1, and the only way past it today is a browser script of one's own. Both are small fixes.
2. **P1 — The drawing after `exists`.** Any program with a drawn view on a switched screen. Silent until the drawing
   reads through `app`, then a page error.
3. **T4 — A touch that never ends.** Every phone program whose tap changes the screen. Three runs have each written
   their own scroll helper.
4. **L2 — Drags from controls.** The Carousel shipped in v0.5.3 can't be swiped from a button on its page, and a map
   or board of controls can't be panned. The agent's own program didn't need it: its native pane was the better
   design.
5. **T2 — `selectAll`.** New, small, and it silently types into the wrong field.
6. **T3 — Page errors with a place.**
7. **D3 — A layout of one's own, taught where arrangement is decided.** Agents don't think of it; no other framework
   has it.
8. **T5, T6, D2.**

All of them are built since the run, with `measure.mjs`, and are not yet released.

## The agent's account, verbatim

Asked after the build by resuming the session with read-only tools, with the questions in `impressions.txt`; 1.0 min,
4.9k output tokens, counted separately from the build.

### Building Venue in Declare: an account for the Declare team

This covers one build of about 1,860 lines across four files: a seat picker over a live seat map, checkout, sign-in, and tickets, against a service I didn't control. Everything below comes from that one build, so treat the generalisations accordingly.

#### (a) Getting up to speed

**What I read.** I followed `skill/SKILL.md` as written:
- `docs/declare.md` in full.
- Guide chapters 01, 04 and 05.
- The calendar (`apps/calendar/calendar.declare`) with `28-calendar.md` beside it.
- Later, chosen by need: chapter 14 (Talking to a server, Streams, Editing text and forms, A form in a sheet), 08 (Controls), 19 (Accessibility), 06 (Layout), 07 (Scrolling), 10 (Touch), 21 (Motion), parts of 18 (Overlays), and `docs/operational/verify.md`.

**What taught the most:**

- **The skill's "What Declare handles for you" table.** It was the most useful single page. Nearly every need I had was already a row in it, pointing to the right attribute:
  - `purpose` for autofill and the phone keyboard
  - `judgeOn` for "don't mark it wrong while they're typing"
  - `accessibilityError`
  - `DataSource.errorBody` and `errorSchema`
  - `EventStream`

  The brief's form requirements mapped almost one-to-one onto it. That was striking; it felt as if the library had been designed against a brief like this one.
- **`declare.md` §5 on computed defaults versus set constraints.** This paid off directly. "Signing in fills what's empty but keeps what you typed" became `email: string = { app.account.email }`: a formula that the person's first keystroke replaces. I'd have built a dirty-flag in React. This was the most elegant moment of the build, and I learned it from the docs, not by experiment.
- **`npx declare-help`.** It answered quickly and precisely. `TextInput.purpose` printed the full table of autofill tokens and keyboards, and `Editor.judgeOn` described exactly the behaviour the brief asked for.
- **Reading library source.** `library/combobox.declare` revealed that `purpose = country` plus a whole-text exact match is how autofill selects an item. I'd only have found that by reading the source.

**What was missing or misleading:**

- **The calendar's lessons didn't transfer much.** It's a beautiful program, but its lessons (sprung focus rectangles, a hand-placed scene) mostly didn't apply to a form-heavy commerce app. Reading it whole cost a lot of context for little direct return here. A smaller "commerce/form" reference program would have taught me more. I'm not sure that's a fault, since the skill does say to pick the nearest app.
- **Bare tokens versus strings.** The rule (`judgeOn = leave`, not `"leave"`; but `{ x ? "semibold" : "regular" }` inside braces) is stated, but I still tripped on it twice. The diagnostics fixed both immediately, so this cost seconds, not minutes.
- **Names the compiler accepted that broke at boot.**
  - `valueOf` was accepted as a method name and then failed at boot with "a member of every object". That should be a compile-time error.
  - Likewise `form` as a child name on a `Sheet` ("Sheet.form is an attribute"). That one was caught at compile time.
- **Scrolling and focus.** Nothing told me that a view with `scrolls = { app.wide ? "y" : "none" }` might make Tab-into-view fail. I'm genuinely unsure that was the cause; I restructured rather than isolate it. The docs do warn that `"none"` is a truthy string, which may be related.

#### (b) Expressing what I wanted

**Where it fit well:**

- **Live seat state.** An `EventStream` writes `status = "sold"` into the seat map's own record. A derived `hall` dataset wraps each record rather than copying it (`seat: Seat` inside `PlacedSeat`), so every seat view, the house map, the free count and the "taken" notice all followed one write. "Wrap it, don't copy it" from chapter 14 was exactly right.
- **The form contract.**
  - `validate()` is reactive. A validator reading app state (the service's rejected-field message) re-evaluated on its own. I verified that early with a probe and relied on it heavily.
  - `judgeOn = leave` covered "not wrong until left".
  - `DataSource` with `trackChanges = ["failed"]` and `onChange` gave one place to route 402, 409 and 422 to the right part of the screen.
- **Fetch semantics.** "`fetch()` settles first" meant I never worried about stale request bodies.
- **Double-submit.** `if (app.order.loading) return` was sufficient; Enter twice and click twice each sent one request.
- **Accessibility.** `accessibilityRole = toggle` with `accessibilityPressed` gave an ARIA button with `aria-pressed`, named exactly as the brief required. `--semantics` confirmed it.
- **Arrow keys in the hall.** `focusScope = stop` made 648 seats a single Tab stop with arrow navigation, with almost no code.
- **Overlays.** `Sheet` with `shown`/`input` handled modality, focus trapping and restoration.

**Where I had to work around it:**

- **Pan-and-zoom on a phone.** My first design was a custom pan surface (`onPointerMove`) with seat `Control`s on it. A probe showed a drag that starts on a Control doesn't reach the parent's handler: events don't bubble, and the Control takes the pointer. That's consistent with the documented model, but it rules out the most natural "map with buttons on it" design. I fell back to a native `scrolls = both` pane with a hand-drawn minimap. That is arguably better (native momentum), but I lost animated zoom. Scale plus scroll position can't easily move together, since a horizontal `scrollTo` "stops at the end the content has when it is made". I'd like a sanctioned way to pan a surface whose children are controls.
- **`scrollStartX` didn't take effect** when the pane was built after data arrived; it read 0. I replaced it with `onInit() { afterSettle(() => this.scrollTo(...)) }`. Possibly my misuse, possibly a bug.
- **A wrapped `FormField`.** To give every field a label, an error line and shared styling, I wrapped `TextInput` in a view class and forwarded `edit(v)`/`judge()`, with use sites overriding `edit`. That's close to the "method that only passes the press on" drift pattern the skill warns about. I didn't find a cleaner way to override a nested child's handler from a use site.
- **Field lookups by name.** `PayForm.fieldView(name)` is a hand-written switch from name to view path, needed for "focus the field the service named". It works, but it's the kind of registry I'd hoped the language would give me.
- **Layout ownership versus responsive axes.** Switching a `SimpleLayout`'s axis between x and y while a child `flexes` collided with "the layout owns the size along the flow". For the hall screen I fell back to frame arithmetic (`width = { app.wide ? app.width - app.sideW : app.width }`), which the drift check flags as a smell.
- **`flexes` conflicts with a class's `width = 100%`.** The diagnostic was clear, but it meant removing `width` from the class and repeating it at six use sites.
- **Font stacks.** Fonts went on the App (`display: string[]`) because I wasn't sure a `theme` record could hold a font list. The skill says font constants are a theme's job, so this is probably wrong; I didn't check.
- **A teardown crash.** A draw method ran during screen teardown and crashed on `app.seatMap` being undefined, but only under the test harness's virtual clock. I patched it with `?.`. That's a guard against something I don't understand.

#### (c) Verifying it

**`declare-verify`.** The ladder worked well:
- Rungs 1–3 caught everything quickly, often several errors in one pass, each with an applicable fix.
- Rung 4's layout notes were concrete and right: the carousel ran past the window at 1280, text was 2 px over at 390, and the brand link was 84×29, under 44×44.
- The "classes not built at boot" note was honest about its blind spot.

**`declare-look`.** This was the workhorse: `--click`, `--set`, `--call`, `--read`, `--shot`, `--js`, `--semantics`. `--set app.chosen=[...] --call 'app.go("checkout")'` got me to any state in one line. The best tooling in the build.

**Assert scripts.** `drive.requests` and `expect.request(..., { count })` were exactly what proving "no second payment" needed. Writing the brief's §10 scenario as `flow-phone.mjs`, with a real second buyer posting to the service mid-test, worked end to end.

**Where the tools hurt:**

1. **When `R5 ✗ behavior: Waiting failed: 10000ms exceeded` appeared, the real error was invisible.** The actual failure was a boot exception (`valueOf`). I found it only by writing my own puppeteer script to print console output. `declare-look --console` didn't surface it either, because the harness failed before printing. The skill says not to build your own harness; I had to. This was the costliest moment of the build.
2. **`drive.selectAll(path)` didn't focus my fields** (`document.activeElement` was null). I replaced it with click, then DOM `select()`.
3. **Off-screen views.** The harness couldn't scroll to them in a horizontally scrolled pane, nor to fields below the page fold on the phone after the page had been scrolled by touch. Declare's `view.scrollIntoView()` left `window.scrollY` at 0 under the harness. DOM `scrollIntoView` worked, and Tab-driven focus scrolled correctly in `declare-look`. So I believe the app is fine and the harness has a gap, but I'm not certain which side is wrong.
4. **The virtual clock made a screenshot misleading.** After sign-in, a `declare-look` picture showed the page still dimmed, as if the sheet's scrim were stuck. A real-time puppeteer run showed no dim. That cost me a detour chasing a non-bug.
5. **The scripts mutate shared state.** Each test buys real seats on the service, so state drifts between runs. That's the service's nature, not Declare's, but fixtures for an external service would help.

#### Surprises

- **How much of the brief was already a named attribute.** `purpose = cardNumber` gives `autocomplete=cc-number` plus a numeric keyboard; `concealed` keeps a field a password to password managers while showing its text.
- **Validators are reactive** to anything they read.
- **The settle model removed a whole class of bugs** I'd normally fight in checkout code, such as a stale body on a double click.
- **In the other direction:** non-bubbling events made "a scrollable map of buttons" harder than in any DOM framework.

#### Good and bad

**Good:**
- Diagnostics that name the fix.
- Computed defaults.
- Data-path replication with wrapping.
- Reactive `DataSource` lifecycle.
- First-class accessibility facts.
- `declare-look` as a one-line probe.
- Compactness: the whole checkout logic (`Checkout extends Node`) is about 100 lines and readable.

**Bad:**
- Boot errors hidden behind harness timeouts.
- Harness scrolling gaps.
- A few names that are legal at compile time but fatal at boot.
- No clean way to wrap a library control and let use sites override its inner handlers.
- Responsive layout switches fighting layout ownership.

#### Compared with what I'm used to

Against React, Vue and SwiftUI:
- **No render function, no hooks, no effect dependencies.** I never thought about re-render cost or stale closures.
- **Styling is attributes, not CSS.** I didn't miss CSS, except for `position: sticky`; pinning needed `ignoreScroll` on App-level children, which forced me to move the checkout panel out of the screen that owns it.
- **No event bubbling.** This is the biggest mental shift, and the one that cost a design.
- **Forms are closer to native than React's,** because of `purpose` and the `Editor` draft model.

#### What it reminded me of

- **OpenLaszlo**, as the README says: constraints in attributes, datapaths, `classroot`.
- **SwiftUI**, for states and springs as declarations.
- **Elm, loosely:** one settle per event, though Declare is mutable rather than message-passing.
- **Spreadsheets:** most of the app is cells that read other cells.
- **QML/Qt Quick,** strongly: property bindings, anchors-like `x = center`, states.

#### Where I'd most want improvement

1. **Surface boot exceptions in `declare-verify`/`declare-look` output** instead of a generic timeout.
2. **Fix the harness gaps:** `drive.selectAll`, and scrolling targets into view inside `scrolls = both` panes and after touch-scrolling the page.
3. **A documented pattern for a pannable surface whose children are controls,** so a drag starting on a child pans the parent and a tap still presses the child.
4. **Compile-time rejection of reserved member names** such as `valueOf`.
5. **A way for a wrapping class to expose an inner child's handlers** for use-site override, so wrapped controls don't need forwarding methods.
6. **A small reference app for forms and commerce,** alongside the tracker and calendar.

#### What I'd use it for

- **Yes, readily:** app-like interfaces with rich state, live data and accessibility requirements, such as booking flows, dashboards and internal tools. The data-and-form model genuinely fits these.
- **With care:** heavily gestural surfaces until the pan-over-controls story is clearer.
- **Not yet:** for teams that need a mature ecosystem and corpus. When something odd happened (the dim screenshot, the scrolling gap), I couldn't search for it and had to probe.

**Biggest uncertainty:** I can't tell how much of my friction was the platform versus my week-one mental model. The pan, `scrollStartX` and Tab-scroll issues might each have an idiomatic answer I didn't find.
