# Venue (checkout) run 3: Declare 85a9291a (v0.5.2), Opus 5.5

**Run:** 2026-10-23 14:34 UTC, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-checkout-3 claude-opus-5-5 85a9291a 8351` against GitHub main
`85a9291a`, the v0.5.2 release. It is the first Venue run since the fixes Venue run 2 and Cadence run 16 prompted:

- `declare-verify` boots every program in Chrome at a laptop's size and a phone's;
- the boot checks report text past the window's edge, and a clipped drawing is no longer reported blank;
- a press refuses a point another control covers, and on touch, one within a finger's width of another control;
- shortcuts declared inside an open overlay are in force;
- `declare-help map`, `WrappingLayout.columns`, and the warning for a choice that never reports it is chosen
  (DECLARE4022).

The data service ran on 8351, not the brief's 8350, because Venue run 2's service still held that port at launch. The
agent's copies of the brief and the API notes named 8351, so the agent saw no difference.

It used Opus 5.5 (`claude-opus-5-5`) with web tools available, and the brief included the idiom sentence. One round,
with no intervention. The standard strip removed `evals/`, `docs/system-design/` and `test/`. The service ran from
outside the sandbox (this app has `fixtures/`).

The report is in the three-area form: **reading and docs**, **API and language**, and **debugging and verification**,
each costed, with one list ranking the fixes across all three by their general leverage.

**Try it:** http://127.0.0.1:8210/my-apps/venue/venue.declare. That is the agent's own copy, served by the dev server it
started on 8210 (8200 was taken). The service is on 8351. Use `127.0.0.1`, not `localhost`, or the session cookie
won't stick. The one account is `ada@example.com`, password `correct horse battery`. The app, its three assert scripts
and eight pictures are filed beside this report.

## The comparison

The build figures come from the build's own final record. The account was asked for afterwards, in a separate resume
(1.0 min, 5.8k output tokens), and is counted separately.

| | Venue 1 | Venue 2 | **Venue 3** | Venue React 1 |
|---|---|---|---|---|
| Declare commit | `9444a776` | `a2f8bf3a` | **`85a9291a`** | — |
| time | 44.2 min | 56.0 min | **42.6 min** | 31.4 min |
| turns · tool calls | 184 · 179 | 182 · 173 | **168 · 167** | 101 · 97 |
| code, raw lines | 1,885 | 1,908 | **2,015** (6 Declare + 1 TS) | — |
| code, excluding comments and blanks | 1,499 | 1,449 | **1,437** (TS 180) | 4,861 |
| **Tokens** | | | | |
| output (incl. thinking) | 162k (68k) | 159k (68k) | **186k (88k)** | 147k (51k) |
| fresh input (cache writes) | 399k | 390k | **427k** | 199k |
| cached input re-read | 46.6M | 42.5M | **49.3M** | 9.3M |
| read before first app write | 391 KB | 416 KB | **≈470 KB** | 23 KB |
| context at first write → end | 185k → 405k | 208k → 396k | **239k → 433k** | 42k → 205k |
| first app write at | — | — | **9.5 min** | — |
| **Download (gzip)** | 152.9 KB | 151.8 KB | **166.0 KB** ¹ | 158.5 KB + ~85 KB fonts |
| hidden acceptance (`drive.mjs`) | 11 of 11 | 9 of 11 | **11 of 11** | 11 of 11 |
| runtime source read | 5 files | 1 call | **7 calls** (5 files) | — |
| library source read | 2 files | 11 calls | **7 calls** | — |

¹ `declarec --sizes` from the main tree, built to a scratch directory: program 45.8 KB, runtime 107.4 KB, kernel
12.6 KB. The program is larger than run 2's (32.4 KB) because it bundles the `qrcode-generator` package. The agent added
that package so the tickets carry real, scannable codes.

**Faster and complete, but not cheaper.** It is 13 minutes faster than run 2 and passes all eleven hidden scenarios.
It cost slightly more in tokens: the context was 31k larger at the first write and 37k larger at the end, and every
later turn re-reads it. The extra reading was the guide: eleven chapters, read whole by `cat`, against run 2's seven.

## Where the time and the tokens went

Phases from the build stream, by wall-clock and by the cached input each phase's API calls re-read.

| phase | time | API calls | cached input re-read | share of tokens |
|---|---|---|---|---|
| **Reading and planning** (0–9.5 min) | 9.5 min | 48 | 7.39M | 15% |
| **Writing** the seven files (9.5–19.7) | 10.2 min | 14 | 3.81M | 8% |
| **Debugging and verification** (19.7–42.6) | 22.9 min | 101 | 38.05M | **77%** |

The split is the same as Cadence run 16's (15 / 7 / 78). Within verification, one episode — the phone checkout's taps
landing in the wrong field (E6, below) — is 24% of the whole run's tokens on its own.

`measure.mjs` puts 82% of the wall-clock in the model, 12% in edits (58 calls, almost all Python or `sed` rewrites, not
Edit), and only 2% in rendering. The browser was used from minute 4 (a probe), 36 `declare-look` runs and 27 assert
runs, with 21 pictures read.

## Reading and docs

**The order the SKILL gives, followed exactly:** README, SKILL, `declare.md` whole, chapters 01, 04 and 05 in one `cat`,
the calendar and `28-calendar.md` in another. Then, by need, chapters 14 (whole), 08, 19, 06, 11, 12, 18, 10, 07, part
of 21, 15 and part of 20, two briefs (`editing-records`, `loading-and-saving`) and `verify.md`. It used `declare-help map`
once, on the tracker, and read none of the tracker. It asked `declare-help` 32 times about 27 topics.

**What it says taught it most** (account, (a)): `declare.md` §5 and the "What you can assign" table; the calendar, which
"gave me permission to draw the hall as a positioned scene"; the SKILL's "What Declare handles for you" table, "the
most useful navigation aid in the distro", which sent it to `TextInput.purpose`, `Editor.judgeOn`,
`DataSource.errorBody` and `Sheet` before it could build them by hand.

**Source reads, which count as reference gaps:**

| read | what it wanted | what answers it |
|---|---|---|
| `runtime/src/editor.ts` (4 calls) | whether a field whose text the program owns (`text = { … }` with `onInput`, to group a card number as it is typed) gets `validate`, `error` and `judgeOn` | nothing in the docs: the edit session runs only for a `<->`-bound field (`editor.ts:48`, `isTwoWay`). `Editor.validate` and chapter 14 don't say so (L1) |
| `runtime/src/schema.ts`, grep for `aria-invalid` | how a field's error reaches a screen reader | `View.accessibilityError` exists and `declare-help` has it; the SKILL's table says "its message said to a screen reader too" without naming it (D2) |
| `runtime/src/input.ts`, `dom-backend.ts`, `interaction.ts` (3 calls) | why a tap on Continue put focus in the next screen's field | nothing: it is a platform bug (P1) |
| `library/field.declare` | how `Field` names the input inside it | `declare-help Field --all` |
| `library/control.declare` | what `Control` gives a seat | `declare-help Control --all` |
| `library/icons/core.declare` ×2, `library/themes/sanfrancisco.declare` | the icon classes; the theme's token values | `declare-help` lists the icons and "theme tokens"; the values aren't listed (D3) |

**Not found, though it exists:** nothing major. It found `RadioGroup` for the saved cards, `Sheet` for sign-in, `Menu`
for the country, `Animator` for the chosen seat's swell, and `Time [ tick = day ]` for expiry (the last from a compiler
warning).

## API and language

**What the compiler caught** (about eight `declare-verify` rounds, 1.6 min from first compile to a clean boot, every
message with its fix):

| message | note |
|---|---|
| `expected a value, got '('` (DECLARE1000) | an object literal as a default needs `{ ( … ) }`; fixed in one edit |
| `'scrolling' is a built-in read-only intrinsic of View` | renamed `pans` |
| `schema Pick takes a name TypeScript's standard library already declares` | renamed `ChosenSeat` — the same message Cadence 16 met for a class |
| `Type 'readonly ValueChange[]' has no call signatures` | it wrote `e.changed("perfId")`; `ChangeEvent.changed` is an array (L5) |
| `'semibold' is one of fontWeight's values — inside { } write it as a string` | fixed |
| `FormField.width` — a flexing child declares no width (DECLARE2000) | fixed |
| `Sheet.form is an attribute — a child may not take an attribute's name` | renamed `signInForm` |
| `new Date()` evaluates once | led to `clock: Time [ tick = day ]`; the account calls it "genuinely better code" |

**Where the language fit** (account, (b), and the code agrees):

- **The hall** is `Seat extends Control` replicated over sections, rows and seats, placed from a pure `seatPoint()`
  (`hall.declare:19–85`): 648 named toggles on curved rows "on the first serious try".
- **Other buyers** are one line: the `EventStream`'s `onMessage` calls `markSold`, which writes the seat map's own value
  (`model.declare:74–77`), and every view of the house follows.
- **The screen is derived:** `stage` is one constraint over `location`, `waypoint`, the chosen seats and the order
  (`venue.declare:119–123`). A 409 that removes the last seat falls back to the hall with no navigation code.
- **Refusals are branches:** the order source's `errorSchema = Refusal` types `errorBody`, and `orderRefused`
  (`venue.declare:301–328`) is a plain `if` over its kinds.

**Where it did not:**

- **L1 — Validation needs a two-way field.** A field the program formats as it is typed (the card number, the expiry)
  can't be `<->`-bound, so it gets no `validate`, `error` or `judgeOn`. The agent wrote the whole edit-session machinery
  itself in `PaymentForm` (`model.declare:151–251`): `edited`, `left`, `tried`, `refusalField`, `message(f)`. It is good
  code, and it is what `Editor` exists to provide.
- **L2 — Formatting while typing.** In `onInput`, `selectionStart` still reports the caret from before the keystroke
  (per the account; not checked here). So a caret-preserving reformat put the caret at 0, and the agent dropped it:
  editing the middle of a card number now moves the caret to the end. A format/parse hook on the field, with caret
  mapping, is the natural Declare shape for this.
- **L3 — One screen, two arrangements.** The hall screen is a column on a phone and a row at a desk, with children in
  different places. The agent found `ResponsiveLayout` too narrow and placed the four regions by hand with
  `app.wide ? … : …` (`venue.declare:391–410`), the form the drift check warns against, and said so.
- **L4 — No select with a `purpose`.** The country is a `Button` with a `Menu`, which autofill can't fill, so the agent
  infers the country from a postcode that arrives whole (`checkout.declare:260–266`).
- **L5 — `rowIndex` read from a view that is not replicated** is always 0, silently. It met this twice: the section
  swatches came out `undefined` and every ticket said "Ticket 1 of 3". `declare.md` §3 says built-ins never resolve
  outward, so this was the agent's error, but a warning would catch it every time.

## Debugging and verification

Eight episodes, in order. "Cheapest answer" is the step that would have settled the question soonest, had the platform
offered it.

| # | the question | time · API calls · cached input | outcome | cheapest answer |
|---|---|---|---|---|
| E1 | does it compile and boot? | 1.6 min · 8 · 2.55M | eight errors fixed from their messages; R4 clean at both sizes | — the ladder working |
| E2 | do the list and the hall look right? | 3.6 min · 20 · 6.78M | real fixes: a phone line running into the price, a repeated date, an `undefined` colour (the `rowIndex` trap, found with `explain()` through `--js`), a press refused as reaching a section's box | the press refusal was the tool's error (T2): the sections take no presses |
| E3 | the desk checkout and the keyboard | 2.2 min · 11 · 3.92M | Tab, Space and arrows choose seats; Enter twice sends one order (`expect.request`) | — |
| E4 | why does Pay do nothing? | 1.6 min · 6 · 2.20M | found by bisecting with a probe copy of the file: the pinned side panel draws in one place and takes presses in another. The agent moved it to the App | P2, a platform bug |
| E5 | why does the next screen's field take focus on a phone? | 2.3 min · 12 · 4.57M | runtime source read; screen changes deferred with `afterDelay(0)`, and a heading that wasn't focusable made focusable | P1, a platform bug |
| E6 | why do the phone test's taps land in the wrong field? | 7.1 min · 30 · 12.06M | waits raised twice, a hand-written scroll-then-tap helper, screenshots inside the script. Cause, in the agent's words: a `scrollTo` past the page's end stays pending, so the page moved again after the tap was aimed. It clamped `reveal()` | T1 and P3: a tap aimed at a target still moving, and a smooth reveal that stalls |
| E7 | tickets, sign-in, and the semantic tree | 1.8 min · 7 · 2.95M | `--semantics` printed the hall as empty; the agent checked the DOM and found all 648 seats | T3: the tree was right, and the tool cut it short |
| E8 | cleanup, and does it run from the server? | 2.7 min · 7 · 3.01M | formatter; its own Puppeteer check that the page loads from the dev server (648 seats, one expected 401) | `declare-verify` already boots it in Chrome; the check was redundant |

**Scored from the main tree:** R1–R4 clean, and all three of the agent's assert scripts pass (33, 74 and 86 steps).
**The hidden acceptance passes 11 of 11** (`drive/results.json`), including the two run 2 failed: wrong password, and
paying with a saved card after a reload. Sign-in is in the top bar on every screen.

**What the account says served it** (c): diagnostics that name the rewrite; R4's boot notes ("not built at boot:
Spinner, SignInForm", a 84×40 Sign in button); `--read`, `--call` and `--js` with `explain()`; `drive.requests()` and
`expect.request`; and press refusals that named what a press would reach. **Less well:** "the phone script consumed a
lot of time on harness behaviour rather than app behaviour".

### Each complaint, checked

Every claim in the account about the platform or the tools was reproduced with a probe on main (`85a9291a`):

- **P1 — A tap that changes screens focuses what is under the finger. Confirmed.** A probe with a Continue button and,
  on the next screen, a `TextInput` at the same place: under `--touch` the field is focused after the tap
  (`document.activeElement` is the input); with a mouse it isn't. The browser's compatibility mouse events after a
  touch reach the new screen. On a phone that raises the keyboard.
- **P2 — A nested `ignoreScroll` view draws in one place and takes presses in another. Confirmed, cause found.** The
  DOM backend realizes `ignoreScroll` at any depth as `position: fixed` against the window
  (`dom-backend.ts`, `realizeIgnoreScroll`), so it draws at window coordinates, ignoring its parent's offset. The hit
  walk (`interaction.ts:191`, `toChildLocal`) and the canvas backend (`canvas-backend.ts:3567`) honour `ignoreScroll`
  only on a direct child of the scroller, and place a nested one through its parent. In a probe, a panel at `y = 88`
  inside a screen at `y = 100` draws at window y 88 and its button takes no press there. The docs say the view "stands
  still against its nearest enclosing scroll frame", which only the DOM does.
- **P3 — Smooth `scrollIntoView` on the page stalls. Confirmed.** `scrollIntoView("start", true)` on a view 1,210 px
  down leaves the page at `scrollY = 10`; the same call without `smooth` lands at 1,210, and the browser's own
  `window.scrollTo({ behavior: "smooth" })` works. The DOM backend passes `behavior: "smooth"` to the element's native
  `scrollIntoView`; why it stops there is not yet traced.
- **T1 — A tap is aimed at a target still moving. Plausible, not reproduced.** The agent's own diagnosis was a pending
  `scrollTo` past the page's end, which moved the page after the tap was aimed. `declare-look --shot-of` waits for a box
  to hold still; a press does not.
- **T2 — The driver refuses a press that a view with no handlers is over. Confirmed.** A full-window `View` with no
  handler above a `Button`: `--click app.b` is refused ("would reach 'app.over'"), and a raw browser click at the same
  point presses the button. `declare.md` says "a view takes the pointer when it has declared an interest in it", which
  the runtime honours and the driver's check does not: it asks `viewAt`, which answers with any view. The agent's
  `pointerEvents = "none"` on `HallRow` and `HallSection` (`hall.declare:87, 102`) was forced by this.
- **T3 — `--semantics` cuts the tree at two levels. Confirmed, cause found.** `declare-look` drops every printed line
  indented five or more spaces (`tools/look.mjs:240`), a filter meant for the checker's own continuation lines. The tree
  itself is right: `window.__declare.semantics()` holds 683 lines, with every seat in its section's group.
- **"`drive.click` won't scroll the page to reach a field".** Not reproduced. The driver does scroll the page; the
  message the agent quotes ("is outside the window … and scrolling did not bring it in") is what it says when the
  target can't be brought in. That is what P2 and the pending scroll in T1 would cause.

## What it built

Four screens, with the performance in `location` (`#p05`) and checkout and tickets as `waypoint` steps, so Back undoes
a step (pictures in `shots/`):

- **The list:** a serif title, performances under month headings, each with its date, time, lowest price and how full.
- **The hall:** a stage, and four sections as tiered bands of their own tone under curved rows, the dearer the deeper.
  Free seats are outlined squares, sold ones dots, chosen ones filled with a tick, and a chosen seat swells and
  settles. At a desk the whole room fits beside a panel with the date, a legend, the prices, the chosen seats with
  Remove, the total and "Continue to payment". On a phone the room is a pane at thumb size, with a house map to move
  around in and the total in a bar. A seat someone else buys while you look ripples and leaves your choice with a
  sentence saying which. Tab goes into a section; the arrows move along a row and up and down rows by angle.
- **Checkout:** one column of fields, each with its label above and its problem below once it may be said. The card
  number groups as typed and names its brand. Signed in, the saved cards are radios, the expired one disabled. The
  order and Pay stay beside the form at a desk and under the thumb on a phone. Every refusal lands on its field, in
  the service's words.
- **Tickets:** one at a time, swiped or stepped, with the seat set large and a real QR code.
- **Sign-in** is a bottom `Sheet`, from the top bar on any screen or from the form.

## Is it idiomatic Declare?

Mostly. The data and the hall are among the best any run has written.

### What it gets right

- **One source per thing, with its own rules.** `SeatMap extends DataSource` (`model.declare:51–122`) locates, prices
  and counts seats, measures the room's extent, and is written in place by the stream (`this.set([...], "sold")`).
  `AccountSource` knows which cards are expired against a `Time` clock.
- **The whole screen derived** (`venue.declare:117–123`), with no navigation code anywhere.
- **The payment the form would send is derived** (`model.declare:234–243`), so Pay sends what is on the screen.
- **Schemas everywhere,** for both values and refusals; no `as any` on its own data.
- **Library controls where they fit:** `RadioGroup`/`Radio` for saved cards, `Sheet` with `shown`/`input`, `Menu` with
  `checked` items, `TextInput.purpose` on every field, `concealed` for the password.
- **Accessibility built in, not added:** seats as `toggle`s with `accessibilityPressed` and a hint giving price and
  state, sections as `focusScope = stop` groups, headings with levels, `accessibilityLive` on notices,
  `Accessibility.announce` for a lost seat, and `accessibilityError` on every field.
- **A swipe that writes the value and its target together** (`tickets.declare:130–135`), as chapter 21 teaches.
- **A theme as the design's tokens** (`venue.declare:43–54`), with no colours in script.

### Missteps, and how they should have been written

1. **The hall screen placed by hand** (`venue.declare:391–410`): `x`, `y`, `width` and `height` as arithmetic over
   `app.wide` and the siblings' heights. Two `State`s on `app.wide`, each with its own layout (the weather app's
   `desk: State [ applied = { !app.phone } ]`), would say the two arrangements directly (L3).
2. **The checkout column's geometry written twice:** `payScreen.col.x` and `width` (`:415–416`) and `paySide.x`
   (`:452`) repeat the same expression, so the panel only lines up while both are edited together. Forced in part by
   P2: the panel had to leave the screen it belongs to.
3. **A form draft built by hand** (`model.declare:151–251`), forced by L1.
4. **Screen changes behind `afterDelay(0)`** (`venue.declare:139, 236`), forced by P1.
5. **`focusField` reveals with `rootOrigin()` and `app.scrollTo`** (`:336–347`) instead of `scrollIntoView`, forced by
   P3.
6. **`pointerEvents = "none"` on the hall's rows and sections**, forced by T2.
7. **Month headings as a flag on each row** (`venue.declare:153–156`, `firstOfMonth`). It works, but a heading is a
   second row class picked by `classFor`, as the tracker does it (`16-collections.md` § Records of different kinds).
8. **The legend's three entries written out** (`hall.declare:287–302`), where one child replicated over three records
   would do. Small.

### Workarounds the platform forced

P1, P2, P3, L1 and T2 above. Each is marked by a comment in the code, and the agent's final message listed the first
three.

## Findings, by area

### Reading and docs
- **D1 — Chapters read whole by `cat`.** Eleven guide chapters went into context whole, most of them for a section or
  two, and every later turn re-read them: the context at the first write was 239k, against Cadence 16's 212k.
  `declare-help map` exists for programs; chapters have no such map, and the SKILL could say to read chapters by
  section.
- **D2 — `accessibilityError` unnamed** in the SKILL's table row for forms; the agent grepped the runtime for
  `aria-invalid` to find it.
- **D3 — Theme token values** aren't in `declare-help "theme tokens"`, so the agent read a theme's source.

### API and language
- **L1 — Validation for any field,** not only a `<->`-bound one: `validate`, `error` and `judgeOn` on a field whose
  text the program owns. At least, the `Editor` docs must say they need `<->`.
- **L2 — A format/parse hook on `TextInput`,** with the caret mapped, for card numbers, dates and phone numbers.
- **L3 — One screen, two arrangements:** a documented pattern (states with their own layouts), or a
  `ResponsiveLayout` that rearranges children, not only resizes them.
- **L4 — A select-like control with a `purpose`,** so a country fills from autofill.
- **L5 — A warning for `rowIndex` on a view that is not replicated.**

### Debugging and verification
- **P1 — A tap's compatibility mouse events must not reach a tree the tap just changed.** Swallow them after a touch
  that the runtime handled.
- **P2 — `ignoreScroll` at depth:** make hit testing and the canvas backend agree with the DOM (or the DOM with them),
  and say in the reference which it is.
- **P3 — Smooth `scrollIntoView` on the page stalls.** Trace and fix; until then, the reveal path should not use the
  native smooth scroll.
- **T1 — A press should wait for its target to hold still,** as `--shot-of` does, and say so if it never does.
- **T2 — The driver's cover check must use the pointer's hit test,** which passes views with no interest in the
  pointer, not `viewAt`.
- **T3 — `--semantics` must print the whole tree:** the continuation-line filter in `look.mjs` should apply to the
  checker's output only.

## What changes next

Ranked by general leverage: how much each helps agents across apps and runs, not what it cost here. The user's
direction after this run is a touch audit (below), which takes in P1, P3, T1 and T2.

1. **T2 — False press refusals.** Any app with a container over its controls meets it, and the advice it implies
   (`pointerEvents = "none"`) is a workaround for the tool. Small fix.
2. **P1 — Touch focus after a screen change.** Every app with a tap that navigates onto a form meets it on a real
   phone.
3. **T3 — `--semantics` cut short.** A one-line fix; today it makes every accessible program look broken.
4. **P2 — `ignoreScroll` at depth.** Pinned panels inside screens are common, and the failure is silent.
5. **T1 — Presses aimed at moving targets.** The dearest episode in this run (24% of its tokens).
6. **P3 — Smooth `scrollIntoView` on the page.**
7. **L1 — Validation without `<->`**, with **L2**, the format hook. Every checkout, sign-up and settings form.
8. **D1 — Chapters by section.** Reading volume multiplies the cost of all the verification after it.
9. **L3, L4, L5, D2, D3.**

### The touch audit

This run's dearest stretch, and three of its six platform and tool bugs, were about touch, and touch's apparatus is
two days old: real touch events arrived with Venue run 2's fixes, the finger ring in v0.5.2. Each run has found its next
hole. Rather than fix them one at a time, the next step is a matrix of probe programs, one per situation — a tap that
swaps screens, a pinned bar at depth, a field under the on-screen keyboard, a tap during a glide, a drag in a scroller,
hold and pinch, a tap near another control, a smooth reveal — each checked three ways: through the driver, in plain
headless Chrome, and on a real phone or iPad. Where two disagree there is a bug in the platform or the tool. What a CDP
touch cannot imitate (the browser's chrome hiding, the keyboard shrinking the viewport, iOS scrolling a focused field
into view) needs the real device.

## The agent's account, verbatim

Asked after the build by resuming the session with read-only tools (`impressions.txt`); 1.0 min, 5.8k output tokens,
counted separately from the build.

### Building The Venue in Declare: an account for the people who make it

#### (a) Getting up to speed

**What I read.** I followed `skill/SKILL.md` closely. That meant `docs/declare.md` whole, then guide chapters 01, 04 and 05, then `apps/calendar/calendar.declare` with `28-calendar.md` beside it. After that I read only when I reached a need: `14-data.md` (whole), `08-controls.md`, `19-accessibility.md`, `06-layout.md`, `11-paint-and-themes.md`, `12-text.md`, `18-overlays.md`, `10-touch.md`, `07-scrolling.md`, part of `21-motion.md`, `15-schemas.md`, part of `20-urls.md`, and `docs/operational/verify.md`. I skimmed two briefs (`editing-records.md`, `loading-and-saving.md`). I made about 30 `npx declare-help` lookups: `TextInput --all`, `Editor --all`, `DataSource.credentials`, `View.accessibilityRole`, `View.focusScope`, `Motion`, `ChangeEvent`, and others.

**What taught me the most:**
- **`declare.md` §5 (constraints) and the "What you can assign" table.** The difference between *setting* an attribute with `{}`, which the constraint owns, and *declaring* one with a `{}` default, which is a formula I can take over, mattered constantly. Without it I'd have been confused by refusals.
- **The calendar.** Its focus-rectangle springs, and its use of `x`/`y` constraints for a scene's geometry, gave me permission to draw the hall as a positioned scene. That is the single biggest design decision in Venue. The skill's drift check says "hand-written x and y belong" in a scene like that, and it was right to.
- **The "What Declare handles for you" table in SKILL.md.** It was the most useful navigation aid in the distro. It sent me to `TextInput.purpose`, `Editor.judgeOn`, `DataSource.errorBody` and `Sheet` before I could hand-roll any of them.
- **`declare-help`.** Fast and precise. `TextInput.purpose` answered "how do I get autofill and phone keyboards" in one table, which would take an hour of MDN in the web world.

**What was missing or misleading:**
- **Form validation outside `<->`.** `14-data.md` presents `validate` / `judgeOn` / `error` as how a form checks itself. Only by reading `runtime/src/editor.ts` did I learn that the edit session exists only for `<->`-bound fields. A field whose text the program owns (`text = {…}` + `onInput`) gets no `valid` or `error`. I needed that for the card number, which is reformatted as it's typed. The docs never say so, and I'd have guessed wrong without reading the runtime. As a result I wrote my own `left`/`tried`/`message` machinery in `PaymentForm`. I'm fairly sure that's what a maintainer would also have had to do, but I'm not certain there isn't a sanctioned path I missed.
- **`accessibilityError`.** I only found that I could set it directly by grepping the runtime for `aria-invalid`. The SKILL table mentions "its message said to a screen reader too", but it doesn't name the attribute.
- **`Spring` with a constant `to`.** `21-motion.md` and the strip example show writing to a sprung attribute by hand. I assumed that writing `popT = 0` with `to = 1` would make it spring back. It doesn't: the seat stayed swollen. In hindsight the strip example says to write the value *and* the target, but a sentence like "a spring re-engages only when `to` changes" would have saved a round trip. I switched to an `Animator` with `start()`, which was the right tool.
- **`scrollIntoView` on the page.** `07-scrolling.md` lists `view.scrollIntoView()` among the ways to move a scroller. On the App's page scroll it silently did nothing (`scrollY` stayed 0). I worked around it with `rootOrigin().y` and `app.scrollTo`. This may be a bug rather than a documentation gap; I can't tell which.
- **`ignoreScroll` on a nested view.** The guide's examples put it on direct children of the App. Nothing says it must be one. I put the desktop order summary deep in the checkout screen with `ignoreScroll = true`, and it rendered pinned correctly, but its Pay button silently received no presses. I found the cause by bisecting with a probe copy of the file. Of everything in this build, this one cost the most time relative to how simple it was.

#### (b) Expressing what I wanted

**Where it fit well:**
- **The hall.** `Seat extends Control` replicated over `:sections[]` → `:rows[]` → `:seats[]`, with `x`/`y` constraints from a pure `seatPoint()` in `venue.ts`. It produced 648 accessible toggle buttons on curved rows on the first serious try. The "Seats will be taken while this person is looking" requirement was one line in an `EventStream`'s `onMessage` (`markSold`), and every view of the house followed: seats, minimap, free counts, the summary. That is the reactive model paying off exactly as advertised.
- **Deriving the whole screen.** `stage` is one constraint over `location`, `waypoint`, `chosen` and `order.loaded`. A 409 handled by "remove the seat, set `waypoint = ""`" lands back in the hall with no navigation code. When the stream removed the last chosen seat during checkout, the app fell back to the hall on its own.
- **`location` / `waypoint`.** The stranger test ("would you hand it to a stranger?") put the performance in the URL and checkout and tickets in the history steps. It was a clarifying rule, not just an API.
- **`DataSource` as both read and write.** `order` with `body = { … }`, `errorSchema = Refusal`, and `trackChanges = ["failed"]` → `onChange` made each refusal kind an ordinary branch. Typed `errorBody` meant `r?.field` and `r?.conflicts` were checked.
- **`TextInput.purpose`, `concealed`, and `Sheet [ shown, input ]`.** These were all as advertised, and the Sheet's focus handling was free.
- **The compiler's refusals were mostly right and actionable.** Each one named the fix:
  - `'scrolling' is a built-in read-only intrinsic of View`
  - the `flexes` + `width` conflict ("Remove the width to let it flex…")
  - `'semibold' is one of fontWeight's values — inside { } write it as a string`
  - `schema Pick takes a name TypeScript's standard library already declares`
  - the `new Date()` warning ("this evaluates once and never again"), which made me introduce `clock: Time [ tick = day ]` for card expiry — genuinely better code
  - "nothing starts this Animator".

  I applied each fix and moved on; none needed thought.

**Where I worked around it:**
- **Two arrangements of one screen.** The hall is a column on a phone and a row at a desk, with different children in different places. `ResponsiveLayout` shares widths only, and `flexes` conflicts with a declared size on the cross axis. So I hand-placed the hall screen's four regions with `wide ? … : …` constraints. It works and reads fine, but it's exactly the "placing everything by hand" smell the drift check warns about. I didn't find the idiomatic answer; maybe there is one.
- **Container boxes swallowing presses.** `HallRow` and `HallSection` size themselves from origin (0,0) to their content, so the Balcony's box covered the Orchestra's seats and `declare-look` reported the press "would reach app.hallScreen.pane.hall.secs.3.2". The fix, `pointerEvents = "none"` on the containers, is documented and small. But it surprised me that a view with no handlers takes presses at all, given §8's "A view takes the pointer when it has declared an interest". I'm not sure the documented rule and the behaviour agree here.
- **The tap that changes screen.** On touch, tapping Continue navigated within the same settle. The runtime's focus-on-press then landed on the new screen's "Name on card" input under the finger, which on a real phone would pop the keyboard up. I wrapped navigation in `afterDelay(0, …)` and moved focus a turn later. It feels like a platform responsibility, and I'm not confident my fix is robust on real devices.
- **The card number caret.** Inside `onInput`, `selectionStart` still reports the caret from *before* the keystroke. My caret-preserving reformat put the caret at 0 and produced "2424 2424…", and I removed it. So now editing the middle of the number moves the caret to the end. A field-level formatting hook (format/parse with caret mapping) would have been the natural Declare shape.
- **The country menu and autofill.** A `Button` + `Menu` can't be autofilled, so I infer the country from a pasted or autofilled postcode. That's a heuristic patch over a missing select-like control with a `purpose`.
- **Replicated `rowIndex` gotchas.** I wrote bare `rowIndex` in a child of a replicated view twice: the section swatch, and `TicketCard` inside a replicated wrapper. It resolved silently to the child's own index of 0, giving an `undefined` colour and "Ticket 1 of 3" on every ticket. §3 does say built-ins never resolve outward, so this was my error. But a lint ("`rowIndex` on a view that is not replicated is always 0") would catch it every time.

#### (c) Verifying it

**What I used:**
- **`declare-verify` rungs 1–4.** I ran them after every edit. About eight compile cycles took me from first draft to a clean boot, each finding one or a few real problems. Two notes were valuable on their own: "not built at boot: Spinner, SignInForm", and the phone note about the 84×40 Sign in button being under 44×44.
- **`declare-look`.** Use the app, read values, take a screenshot: this did most of the visual iteration. `--read`, `--call` and `--js` let me debug without a harness. `explain()` via `--js` instantly showed why the swatch fill was null (`deps: ["this.rowIndex", …]`).
- **Assert scripts.** I wrote three (`desk-guest`, `desk-refusals`, `phone-story`) against the live service. `drive.requests()` and `expect.request` let me assert "Enter twice sent exactly one order". The press refusals ("covered… would reach X") found the container-box bug immediately rather than silently clicking something else.
- **A puppeteer check of my own**, to confirm the app runs from the dev server URL, outside the harness.

**How well the tools served me.** The tools were excellent at finding problems, but the phone script consumed a lot of time on harness behaviour rather than app behaviour:
- **Page scrolling in the driver.** It wouldn't scroll the App's *page* to reach a field ("is outside the window … and scrolling did not bring it in"), though the docs say presses scroll their target into view first. I wrote a `tapField` helper.
- **Stale tap positions.** A tap after a programmatic scroll sometimes landed at the field's old position. The cause turned out to be a `scrollTo` past the end of the page staying pending ("follows the content as it grows"). That pending request plausibly affects real users too, so clamping it in `reveal()` was a genuine fix. But it was hard to diagnose; I only got there by screenshotting inside the script.
- **The virtual clock.** It made `afterDelay(0)` need an explicit `drive.wait(50)`. That's documented, and fine once known.
- **`--semantics`.** It printed the hall region as empty, while the DOM had 648 correct `button[aria-pressed]` seats inside groups. For a few minutes I believed my accessibility tree was broken. I'd want that printer to be trustworthy, or to say what it elides.

**Uncertainty.** I could not verify real autofill, real password-manager save prompts, real on-screen keyboards, or VoiceOver. I built those parts to the documented contracts and haven't proven them.

#### Surprises
- **The hall reading as a room on the first screenshot.** Curved rows, tiered bands and a dark stage, from about 150 lines of Declare plus a 15-line geometry function.
- **`npm` imports in `script ["venue.ts"]` just worked.** I added `qrcode-generator` in a local `package.json` and got real, scannable codes, with no configuration.
- **Validation only exists for two-way-bound fields.** This was the biggest conceptual surprise.
- **How much of the remaining difficulty was input, focus and scroll at the edges** (ghost focus, pending scrolls, nested `ignoreScroll`), rather than the language itself.

#### Good and bad

**Good:**
- Constraints as the only update mechanism; I never wrote a single "refresh the view" line.
- Diagnostics that name the rewrite.
- `declare-help` as a reference.
- Schemas that type both `value` and `errorBody`.
- Accessibility facts as attributes (`accessibilityRole = toggle`, `accessibilityPressed`, `focusScope = stop`), which together made keyboard and screen-reader seat picking possible at all.
- Library overlays that are genuinely finished.

**Bad:**
- Silent failures: nested `ignoreScroll`, `scrollIntoView` on the page, a spring not re-engaging, bare `rowIndex`. Each cost more time than a loud error would have.
- Form validation tied to `<->`.
- No formatted-input or select-with-autofill primitive, for a shop form.
- Some test-harness behaviour that looks like app bugs.

#### Differences from what I'm used to
- **No render function.** There's nothing like React's re-render, no hook dependency arrays and no keys. Identity by `id` made the seat map trivially stable.
- **No CSS.** `stroke` rather than border, stacking order is declaration order, and layout is an attribute. I never missed flexbox, except for the two-arrangement problem above.
- **Handlers are synchronous and requests are members.** No `async`/`await` in the app: everything a request produces is a reactive fact like `loading`, `failed` and `errorBody`. That's cleaner than fetch-then-setState, though it takes a moment to stop reaching for promises.
- **Assignment to a derived value is refused at runtime.** That forces the "change its inputs" discipline that React only encourages.

#### What it reminded me of
- **OpenLaszlo/LZX**, obviously (constraints, datapaths, replication), and Flex/MXML bindings.
- **SwiftUI**, in its environment values (`provided`), states and springs.
- **Elm**, in its "the screen is a function of the model" stance, though Declare is less ceremonious.
- **Spreadsheets**, in that the dependency graph *is* the program.
- **Svelte**, in having a compiler that extracts dependencies.

#### Where I'd most want improvement
1. **Silent no-ops should be errors or warnings.** That covers nested `ignoreScroll` presses, `scrollIntoView` on the page scroller, a write to a sprung attribute whose `to` didn't change, and bare `rowIndex` on non-replicated views.
2. **Edit sessions (`validate`, `judgeOn`, `error`) for program-owned fields**, plus a format/parse hook with caret mapping for inputs like card numbers and expiry dates.
3. **A select-like control with `purpose = country`** (or a native `<select>` realization), so address autofill works end to end.
4. **Touch press-through prevention.** A press that changes the tree shouldn't deliver focus to whatever appears under the finger.
5. **A documented pattern for "one screen, two arrangements"** (column on a phone, row at a desk, with children moving between regions).
6. **Driver parity.** Have `drive.click` scroll the page scroller, and make `--semantics` show what the DOM actually exposes.

#### What I'd use it for
I'd reach for Declare for:
- interfaces built around one rich, live surface (seat maps, schedules, boards, dashboards, map-like explorers);
- apps where continuity and keyboard and screen-reader access must both be good;
- apps an LLM will maintain, because the compiler and `declare-verify` catch so much.

I'd hesitate on form-heavy commerce until items 2–4 above exist; the checkout was the part where I fought the platform most. And I'd hesitate on anything needing a large third-party UI ecosystem, though `DOMIsland` suggests a path there that I didn't try.

My overall judgment, with the caveat that it rests on one build of about a day: the core model is the strongest I've used for this kind of app. The rough edges are mostly at the boundary with the browser, plus a handful of silent failures that diagnostics this good otherwise wouldn't tolerate.
