# Venue (checkout) run 5: Declare d7e80f80, Opus 5.5

**Run:** 2026-10-25 22:42 UTC, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-checkout-5 claude-opus-5-5 d7e80f80 8350` against GitHub main
`d7e80f80`. It is the first run whose skill names **the to-do app** (`apps/todo/todo.declare` with
`todo-parts.declare`, about 19.4k tokens together) as the program to read first, in place of the calendar. It is
also the first since these changes:
- the phone fixes: `App.keyboardHeight` and a `Sheet` above the keyboard; a press inside an open overlay on a scrolled page;
- paint order for views `exists` brings in;
- focus cleared when its view is torn down, and a press ending keyboard modality;
- `View.hideScrollbars`;
- DECLARE4025, the warning on tangled constraints.

It used Opus 5.5 (`claude-opus-5-5`) with web tools available, and the brief included the idiom sentence. One round,
with no intervention. The standard strip removed `evals/`, `docs/system-design/` and `test/`. The service ran from
outside the sandbox on 8350.

The report follows run 4's form. The app, its three assert scripts and nine of the agent's own pictures are filed beside
this report.

## The comparison

The build figures come from the build's own final record, 36.0 minutes in. Two turns are counted separately:

- **The account**, asked for afterwards in a read-only resume (1.0 min, 4.8k output tokens).
- **A wake-up.** About 15 minutes after the build, the agent's background dev server hit its time limit, and the
  finished session woke for one turn to restart it. That is why the stream's last line is at 51 minutes.

| | Venue 3 | Venue 4 | **Venue 5** | Venue React 1 |
|---|---|---|---|---|
| Declare commit | `85a9291a` | `613f8875` | **`d7e80f80`** | — |
| first read | calendar | calendar | **to-do** | — |
| time | 42.6 min | 34.7 min | **36.0 min** | 31.4 min |
| turns · tool calls | 168 · 167 | 160 · 159 | **155 · 154** | 101 · 97 |
| code, raw lines | 2,015 | 1,860 (4 files) | **1,948 + 292 script** (4 Declare files, 1 TypeScript) | — |
| code, excluding comments and blanks | 1,437 | 1,351 | **1,522 + 227 script** | 4,861 |
| **Tokens** | | | | |
| output (incl. thinking) | 186k (88k) | 145k (55k) | **161k (69k)** | 147k (51k) |
| fresh input (cache writes) | 427k | 360k | **353k** | 199k |
| cached input re-read | 49.3M | 37.1M | **36.9M** | 9.3M |
| read before first app write | ≈470 KB | 400 KB | **350 KB** | 23 KB |
| context at first write → end | 239k → 433k | 197k → 366k | **174k → 359k** | 42k → 205k |
| first app write at | 9.5 min | 7.6 min | **6.6 min** | — |
| **Download (gzip)** | 166.0 KB | 157.9 KB | **173.3 KB** ¹ | 158.5 KB + ~85 KB fonts |
| hidden acceptance (`drive.mjs`) | 11 of 11 | 11 of 11 | **10 of 11** | 11 of 11 |
| runtime source read | 7 calls | 3 calls | **2 calls** (1 file, `focus.ts`) | — |
| library source read | 7 calls | 8 calls | **7 calls** (7 files) | — |

¹ `declarec --sizes` from the main tree (now at `0d37f47e`), built to a scratch directory: program 41.1 KB, runtime
119.4 KB, kernel 12.6 KB. The runtime is 10.5 KB more than run 4's. The day's phone fixes are part of that, and so
are the modules this program pulls in.

**About as cheap as run 4, with less reading and a larger program.**
- **Cost:** cached input re-read is level with run 4 (36.9M against 37.1M); output is 11% higher.
- **Reading:** the reading phase was shorter, and its context at the first write was 23k smaller, though the new
  first read is larger than the calendar it replaced. The agent read guide chapters by section, as run 4 did.
- **Size:** the program is 13% larger in code lines, plus a 227-line TypeScript helper file that run 4 didn't have.
- **Acceptance:** one hidden scenario fails, the phone purchase. It comes from a design choice in the seat map, below.

**Did the to-do first read help? Not measurably.** Cost is level with run 4, the program is larger, and one fewer
hidden scenario passes. The agent's praise for the to-do app is one opinion, and one run can't separate the first
read's effect from the run-to-run spread, which across Venue runs 1–4 was 34.7 to 56.0 minutes. What the run does show is
that the first read was taken up: the agent read it whole, never opened the calendar, and used its forms (computed
defaults, `trackChanges`, `classFor` lines), down to placing its font lists on the App as the to-do app does.

It is still slower than the React baseline, by 4.6 minutes, and re-reads four times as much cached input. All of the
extra is again in debugging and verification.

## Where the time and the tokens went

Phases from the build stream, by wall-clock and by the cached input each phase's API calls re-read (API calls
de-duplicated by message).

| phase | time | API calls | cached input re-read | share of tokens |
|---|---|---|---|---|
| **Reading and planning** (0–6.6 min) | 6.6 min | 28 | 3.03M | 8% |
| **Writing** the five files (6.6–16.4) | 9.8 min | 10 | 1.96M | 5% |
| **Debugging and verification** (16.4–36.0) | 19.6 min | 104 | 31.89M | **86%** |

Run 4 split 13 / 8 / 79. Reading cost less and debugging more. The program's first compile came 16.4 minutes in,
after all five files were written; the first `declare-look` came at turn 94.

In all, the build made 31 `declare-look` runs and 21 assert runs, read 14 pictures, and wrote **five browser scripts
of its own** in `/tmp`. The largest was a puppeteer session that checks a signed-in cookie survives a reload, which no
Declare tool covers. Its dev server took four tries to find a free port, because ours held 8200 and 8201; that's the
environment, not the product.

## Reading and docs

**The skill's order, followed:**
- README and SKILL, then `declare.md` whole;
- chapters 01, 04 and 05;
- then **`todo.declare` whole, and `todo-parts.declare` whole** in two reads. It never opened the calendar.
- Then by need: chapter 14 from its forms section on, parts of 08, 19, 18, 06 and 07, and 39 `declare-help` questions
  on 36 topics.
- Five of the dormant `docs/briefs/` files, which nothing routes to: editing records, loading and saving, URLs,
  keyboard and focus, and motion. It found them by listing `docs/`.

**What it says taught it most** (account, (a)):
- **`declare.md`**: "'Seven differences' and the set-versus-declare table in §5 predicted most of my mistakes before I
  made them."
- **The to-do app**: "taught me the idiom better than any prose. I learned the computed-default pattern from
  `AddForm`, the `Line`/`classFor` structure, and above all `trackChanges` + `onChange` as the place to react to a state
  change." This is the first run to name the first read as its best teacher of idiom.
- **`declare-help`**, "because it answered exactly the thing I was stuck on".

**Source reads, which count as reference gaps:**

| read | what it wanted | what answers it |
|---|---|---|
| `library/field.declare`, `combobox.declare` | how a labelled field and the country picker take a value | `declare-help Field --all` and `Combobox --all` do; it had asked, then read the source as well |
| `library/table.declare` (a grep) | how focus and arrows work inside a list | chapter 16 and `declare-help Table`; a gap only in "what is a Tab stop" |
| `library/radiogroup.declare`, `segmented.declare`, `button.declare` | how a choice and a button look and take focus | the reference; these were confirmations |
| `library/themes/sanfrancisco.declare` | the theme's tokens and colours | `declare-help "theme tokens"` lists the names, not the values; **a gap** |
| `runtime/src/focus.ts`, two ranges | why focus could not land on a heading after paying | **a gap**: nothing says how to move focus to something that is not a Tab stop |

## API and language

**Name collisions: four, each costing a compile.** This is the rename pass's subject, met in practice:
- **`Card`**, its saved-payment-card schema, against the library's panel class. It renamed it `SavedCard` with a
  sweeping `sed` that also turned a label into "SavedCard number"; it fixed that in a second pass. The message
  (DECLARE5000) was met on two compiles.
- **`schema Seat`**, which it had declared in `hall.declare` and in the App (DECLARE5001), renamed `SeatRecord`.
- **`FormField`**, its own class name. Ironically, that's the rename the review proposes for the library's `Field`.
- **`scrollToX` / `scrollToY`**, its own methods on the seat map, against View's built-in scroll methods, renamed
  `panX` / `panY`. The member side of the naming problem, as you raised about View and App members.

**`scrollToX` doesn't wait for content.** Zooming the phone seat map to the tapped point asked the map to scroll before
the zoomed content had its extent. The vertical `scrollTo` holds a request past the end until the content arrives;
`scrollToX` doesn't, and its reference says so. The agent worked round it by carrying the point through the zoom
itself. The two axes should behave the same.

**Focus onto a heading.** After paying, it wanted focus on the "Your 2 tickets" heading, for a screen reader.
`Focus.focus` ignores a view that isn't focusable, and nothing teaches the web's `tabindex = -1` idea: focusable by
code, but not a Tab stop. It read `focus.ts` and made the headings Tab stops. That works, but adds stops a keyboard user
must pass. The platform needs the idea and a sentence in chapter 19.

**Disabling the focused control drops focus.** On the last ticket, Next disables itself, and focus, cleared as the web
does, went nowhere. The agent moved it to Previous by hand. That is today's rule, and the agent's fix is the right one,
but the guide doesn't mention the case.

**Other compile messages it met:**
- a `?` on a type, which the message corrected;
- `provided` on a non-container;
- one DECLARE4025, the new tangled-constraint warning, which it fixed in the next edit.

## Debugging and verification

Debugging and verification took 19.6 minutes and 86% of the tokens. The stretches:

- **The phone seat map's zoom** (18.5–19.9 min): the `scrollToX` gap above.
- **The phone checkout that wouldn't scroll under the assert script** (22.1–29.0 min, the run's longest stretch).
  - After the driver tapped the saved Visa card, the App's `scrolling` fact turned true and stayed true for the rest of
    the script. While it is true, scroll requests wait by design, so every later "scroll this field into view" waited
    forever.
  - The driver said only "scrolling did not bring it in", not why.
  - The agent added a diagnostic after every step, found the stuck fact, blamed the driver's synthetic gesture, and
    scrolled the window itself.
  - Whether the stuck fact comes from the driver's touch emulation or from the runtime's scroll tracking isn't settled
    yet. **It should be, before a real phone hits it.**
- **Focus after paying, and after the last ticket** (26.3–27.2, 34.9–35.4): above.
- **A session that survives a reload** (32.2–33.6): its own puppeteer script, since no tool spans page loads.

## What it built

Four screens, plus a sign-in dialog. Pictures are in `shots/`.

- **The list:** performances by date, each with time, lowest price and seats left.
- **The hall:**
  - a stage, and four tiers as bands of curved rows, each a shade lighter the further from the stage, labelled
    with tier and price;
  - free seats are filled squares, sold ones rings, and a chosen one a red disc with a tick;
  - **at a desk** the whole room sits beside a panel with prices, the chosen seats, the total and Continue;
  - **on a phone** the room is fitted to the width, and a tap zooms toward the tapped point; once zoomed, a tap
    chooses, and a "Whole house" button zooms back out. While zoomed out, a view laid over the whole map catches
    every tap, **so a tap on a seat zooms instead of choosing it** (misstep 1, below).
- **Checkout:**
  - the order summary in a card;
  - a note that no account is needed;
  - email, then card fields with autofill tokens, and a country;
  - saved cards as radios when signed in, the expired one disabled;
  - a Pay bar pinned at the bottom on a phone;
  - every refusal (declined, wrong code, seat gone at payment, a field the service rejects) shown in the service's
    words.
- **Tickets:** "Booking confirmed", then one ticket at a time with Previous and Next: tier, row and seat set large,
  doors time, and a drawn barcode.

**Two visual flaws on a phone:**
- the checkout has no side margin, so its heading, labels and fields run against the screen's left edge;
- on the tickets screen the confirmation line runs off the right edge.

**The failed scenario:** `phone_guest_pays` presses seat A4, then A5, by their accessible names. The first press
zooms instead of choosing, so only A5 is chosen, and the expected "2 seats · $160.00" never appears. It isn't the
driver's pace: a copy of the driver waiting 1.2 seconds between seats fails the same way. Activating the control named
"Orchestra, row A, seat 4" does not choose seat 4, so a screen reader user meets the same failure. The cause is the
tap-catcher (misstep 1).

## Is it idiomatic Declare?

Mostly. The data, the screens' arrangement and the controls are better than run 4's. The faults are in three places:
the phone map's tap-catcher, copies made when data arrives, and a script file in which a fifth of the code redoes what
the host already does.

### What it gets right

- **The seat map as the service's own record, with its own logic**: `class Hall extends DataSource`, with `section`,
  `isFree`, `label` and the derived `freeCount` (`venue.declare:61–88`).
  - `markSold` writes by path into the loaded value (`:86`).
  - The map is replicated three deep (`hall.declare:217, 240, 341`), so one `seatchanged` event redraws one seat.
  - `live` is an `EventStream` whose `active` is a constraint (`venue.declare:206–213`).
- **The person's place derived, not navigated**: the performance is `location` and the step is `waypoint`, and `screen`
  comes from both (`venue.declare:147–163`). `signedIn` derives from `me` (`:311`).
- **The form as one `Node`** (`Checkout`, `checkout.declare:16–117`):
  - `judgeOn = leave` and `validate` (`:166, 170`);
  - the `purpose` tokens throughout, and `Combobox [ purpose = country ]` (`:209`);
  - the field's name provided as `fieldLabel` (`:135`).
- **Everything pressable is a `Control` with `press()`**: `Seat` (`hall.declare:133–161`), `CardOption` with role
  `radio` inside a `radioGroup` scope (`checkout.declare:244–259, 349–350`), the remove button (`venue.declare:767`)
  and `PerfRow.open` (`:618`). The overlays are the library's: `SignInDialog extends Dialog` (`:502`), `accountMenu:
  Menu` (`:430`), and the tickets in a `Carousel` (`tickets.declare:138`).
- **Screens arranged by layouts**: `HallScreen` and `CheckoutScreen` are a `SimpleLayout` on x, with a flexing main pane
  and a side panel shown on `app.wide` (`venue.declare:669–714`, `checkout.declare:538–557`). Run 4's hand-divided
  hall screen is gone.
- **Motion on springs**: each seat has `chosenT` and `goneT` springs feeding its `draw()` (`hall.declare:165–166`). The
  one-shot pulse is an `Animator` (`venue.declare:783`).
- **A theme with the design's tokens**, including `tiers`, `seatGone` and `stage` (`venue.declare:97–111`).
- **Accessibility built in**:
  - Seats are toggles with a label, `accessibilityPressed` and a price hint (`hall.declare:155–160`).
  - The map is one Tab stop with a `focusEntry` (`:255–273`).
  - Headings carry levels, `Notice` is an assertive live region (`venue.declare:543–544`), and Pay is announced
    (`:365, 369`).
  - There is no `as any` anywhere, no `Keys` chain, and no hand-built overlay.

### Missteps, and how they should have been written

1. **The overview's tap-catcher** (`venue.declare:695–698`) is a plain `View` with `onClick`, laid over the whole map
   while `zoomable && !zoomed`.
   - On a phone, every tap on a seat lands on the catcher, so `zoomAt` runs and the seat's `press()` never does. The
     seats stay in the accessibility tree as enabled toggles named "Orchestra, row A, seat 4", and nothing says they
     are covered.
   - **What a screen reader user meets:** VoiceOver's double-tap is delivered as a tap at the seat's centre. The first
     activation zooms instead of choosing, says nothing (`zoomAt` announces nothing), and leaves focus on a seat that
     has just moved.
   - **What a keyboard user meets:** Space reaches `press()` and does choose the seat, so the map behaves differently
     depending on the input.
   - **The hidden check** failed exactly here (`phone_guest_pays`).
   - **How it should have been written:** this is the drift item "something a person presses, built from a View".
     Delete the catcher. Give `HallMap` the `onClick` that zooms instead: presses don't bubble, so a tap on a seat
     reaches the seat and chooses it, and only a tap in an aisle or on the floor zooms. Add pinch (`onPinch`) for the
     gesture.
2. **The account copied into the form when it arrives** (`me.onLoad` calling `prefill`, `venue.declare:309`,
   `checkout.declare:83–99`), plus the `signedOut()` reset (`:100`). This is a flag-on-data-arrival pattern.
   - Computed defaults do it, as `AddForm` does in the to-do app (`todo.declare:524–525`):
     `email: string = { app.account?.email ?? "" }`, and
     `method: string = { app.cards.find((c) => !expired(c))?.id ?? "new" }`.
   - Typing replaces the formula, so "fill only what is still empty" comes free (`declare.md` §5, set versus declare).
3. **The receipt as a copy plus a flag**: `bought` is a `Dataset` seeded with a placeholder `Order`
   (`venue.declare:154`), filled in `settled()` (`:376`), and gated by `hasTickets` (`:155, 377`).
   - It should be `receipt = { app.order.loaded && !app.order.failed ? app.order.value : null }`, with `startAgain`
     calling `app.order.clear()`.
   - Likewise `paying` (`:349`) is a second copy of `app.order.loading`, which `submit` checks alongside it (`:360`).
4. **The map's box size repeats the layout's numbers.**
   - `mapW` restates `HallScreen`'s padding and the 340-wide side panel (`venue.declare:250` against `:668, 714`).
   - `fit` and `mapH` subtract guessed heights of 190 and 250 (`:251, 253`). `fit` should read the box's own width.
   - `Math.min(360, app.width - 80)` is repeated on three views of the dialog (`:505, 508, 512`) and belongs on one
     column.
   - `Pair`'s comment promises "stacked on a narrow one", but it is always a row on x (`checkout.declare:228–232`).
     That needs a `State` on `app.phone`. This is also why the phone checkout has no side margin.
5. **Field registries.** The field names appear in three switches or lists: `fieldValue` (`checkout.declare:42–52`),
   `shownFields` (`:314–318`) and `fieldFor` (`:326–337`). A new field means editing all three. This is run 4's misstep
   3 again: name each field's views by its record and look them up. `check()` also casts a `CountryField` to
   `FormField` (`:321–323`) and relies on duck typing.
6. **Marks the library already has**: `Cross` (`venue.declare:792–802`) is `CloseIcon`, and `Spinner`, a per-frame `Time`
   turning an arc (`checkout.declare:515–529`), could be `ProgressBar [ indeterminate = true ]`.

### The script file

`venue-helpers.ts` is 292 lines, and its header claims "functions of their arguments only" (`:1–2`). That is true: it
holds no state. Measured against the "long script block" item:

- **Legitimate pure helpers, about 200 lines**:
  - card brand, grouping and caret (`:83–141`);
  - Luhn (`:143–152`);
  - the expiry parser and formatter (`:168–191`);
  - the field validators (`:154–247`);
  - Code 128 (`:252–279`).

  This is what `04-structure.md` § What script is for describes.
- **Rebuilding the host, about 55 lines**: `money`, `dayLabel`, `weekdayLong`, `monthLabel` and `timeLabel` (`:6–55`)
  hand-parse timestamps and hand-group thousands. `12-text.md` says money and dates are `Intl.NumberFormat` and
  `Intl.DateTimeFormat`.
- **Data held in script**: the three countries are split across `countryName`, `postalLabel` and `postalExample`
  (`:223–229, 289–291`) and the `choices` array in `CountryField` (`checkout.declare:196`). They should be one set of
  records that the form reads.
- **Dead code**: `isMatinee` (`:57`), `postalLabel` (`:227`) and `code128Modules` (`:281`) are never called.

### Workarounds the platform forced

- **The zoom-and-pan handoff** (`venue.declare:246–299`).
  - The first attempt sprang `scale` and then called `scrollTo({x, y})`, which didn't land on x because the range
    didn't exist yet. `View.scrollToX` documents the asymmetry.
  - So the agent carries the plan by hand towards the target offset, then hands the offset to the scroller.
  - The platform should hold x requests as it holds y requests. Better still, it should offer a zoomable scroller,
    which the account says would delete about 40 lines.
- **Name collisions:**
  - The schema `Card` became `SavedCard` (`venue.declare:39`; DECLARE5000 suggested `VenueCard`).
  - The schema `Seat` became `SeatRecord` (`venue.declare:34`; DECLARE5001), so the view class could keep `Seat`
    (`hall.declare:133`). Schemas and classes share one namespace, and `declare.md` §7 should say so.
  - The App's own `scrollToX`/`scrollToY` became `panX`/`panY` (`venue.declare:273–274`; DECLARE2000).
  - `FormField` (`checkout.declare:126–183`) never collided at compile time, but the path `app."Password"` resolved to
    the wrapper, not its input, so the scripts fell back to structural paths.
  - The wrapper exists at all because `Field` only puts its label on the left; the library should have a stacked field
    (label above, hint or error below).
- **The service's refusal held on a field** (`refusedField`, `refusedValue` and `refusedMessage`;
  `checkout.declare:39–66`). It works, but the need is common: a `TextInput` should take a named external error that
  holds until the text changes.
- **A `Combobox` doesn't show the label of a value set from outside**, so `CountryField` writes `combo.entry.text` and
  `combo.query`, which are the library's internals (`checkout.declare:200–205`).
- **Focus from code needs a Tab stop.** Every heading is `focusable = true` (`venue.declare:581, 675`;
  `checkout.declare:542`; `tickets.declare:130`) only so that `Focus.focus` will take it, which adds four Tab stops.
- **`DataSource` has only `onLoad`**, so the order's outcome is caught by watching `loading` through `trackChanges`
  (`venue.declare:354–355`). It needs an event that fires on failure, or `onLoad` documented as firing on both.
- **Font stacks on the App** (`venue.declare:124–125`, with `app.serif` read on 11 lines). This copies
  `todo.declare:598–600`, which seemed to contradict `11-paint-and-themes.md` ("a font list … is a token"). Checked
  after the run: a theme can't hold a web `Font` (a token record has no children, and a web font registers under a
  generated name a theme can't spell), so the App is the only place for a list that includes one. The agent was
  right; the chapter overstated the rule, and now says so, and the to-do app says why its fonts are on the App.


## Findings, ranked by leverage

Across reading, language and tools:

1. **The stuck `scrolling` fact under the driver's touch.** It cost the run's longest stretch. Find whether the cause
   is the driver or the runtime; then make the driver's failure say "a scroll is in progress (scrolling = true), so the
   request is waiting", rather than "did not bring it in".
2. **The rename pass.** Four collisions in one build, two of them (`Card`, `scrollToX`) names any app might use. This
   is next.
3. **Focus to something that isn't a Tab stop.** The web's `tabindex = -1`, as a view attribute, and a sentence in
   chapter 19 on where focus goes after a screen changes.
4. **`scrollToX` waits for content as `scrollTo` does.**
5. **Chapter 11's font rule, corrected.** It said a font list is a theme token; a list that includes a web `Font`
   can't be. Fixed in the chapter, with a comment in the to-do app. Whether a theme should be able to name a web font
   is a design question for the font system.
6. **A zoomable, pannable surface in the library** (pinch, and zoom to a point from code). The agent asks for it
   first, and a seat map, a floor plan or a map all want one. Its own zoom was the source of the failed scenario.
7. **`"Label"` paths in assert scripts should find the editable control,** not the labelled row: `app."Password"`
   found the `FormField`, so the agent switched to structural paths.
8. **A worked form with server-side field errors** in `apps/`, which this run and run 4 both ask for.
9. **A tool for a session across page loads,** so the agent doesn't write puppeteer for it.
10. **Theme token values in `declare-help "theme tokens"`.**
11. **The dormant briefs:** five read, none routed to. Either route them or move them out of the agent's path.

## The agent's account, verbatim

Asked after the build by resuming the session with read-only tools, with the questions in `impressions.txt`; 1.0 min,
4.8k output tokens, counted separately from the build.

### Building Venue in Declare: an account for the people who make it

One thing first: the background dev server from the build has stopped. That was the background-task time limit, not something in Declare. I haven't restarted it, because you asked me not to change anything. The app files and the check scripts are as I left them.

#### (a) Getting up to speed

**What I read, in order:** `README.md`, then `skill/SKILL.md`, which pointed me to `docs/declare.md`. Then guide chapters 01, 04 and 05, and the whole of `apps/todo/todo.declare` with `todo-parts.declare`. After that I read selectively: parts of guide chapters 14 (data, talking to a server, forms), 08 (controls and text fields), 19 (accessibility), 18 (overlays), 06 (layout) and 07 (scrolling). I also read several `docs/briefs/` files (editing-records, loading-and-saving, urls-and-navigation, keyboard-and-focus, motion), and many `npx declare-help` lookups.

**What taught me the most:**
- **`docs/declare.md`** is the single best document. "Seven differences" and the set-versus-declare table in §5 predicted most of my mistakes before I made them.
- **The todo app** taught me the idiom better than any prose. I learned the computed-default pattern from `AddForm`, the `Line`/`classFor` structure, and above all `trackChanges` + `onChange` as the place to react to a state change.
- **`declare-help`** was the most useful tool overall, because it answered exactly the thing I was stuck on. `TextInput.purpose` (a table of autofill tokens and keyboards), `Editor.judgeOn` (exactly "don't mark wrong while still typing", which the brief asked for), `View.focusScope` and `View.accessibilityRole` all mapped directly onto requirements in the brief. Several times the library already had the very thing the brief described. The SKILL's warning to "ask before guessing — the widget you are about to build is often already in the library" was correct.
- **The `docs/briefs/` cards** are good: short, rules first, and they name the examples to look at.

**What was missing or misleading:**
- **No complete form example with validation.** I grepped for `judgeOn`/`validate(v` across `apps/` and found no real app that uses them. The guide's form example uses `<->` and drafts, and a payment form fits that badly: a card number has to be regrouped as it's typed, so it needs `text = {…}` plus `onInput`. I had to design my own `FormField` wrapper: label above, error below, and the service's error injected back into a field. I'm not sure the result is the intended idiom.
- **Several real constraints surfaced only at compile or run time, not in the docs:**
  - A schema can't share a name with a view class (`Seat`), or with a library class (`Card`). DECLARE5000 named the rename, which was good, but it's unexpected.
  - `valueOf` and `scrollToX` are reserved member names.
  - A `Dataset` needs a body. A typed, initially empty dataset needed a fake placeholder record.
  - `{ parent.width }` is the parent's whole box, not its content box. The spec says so, but I still forgot. Then `parent.contentBox("width")` was refused in a constraint (DECLARE7001), although `declare-help` describes it as what a class spanning its parent "reads".
- **`Field` labels to the left.** For labels above, I had to discover that I could provide `fieldLabel` myself by declaring the attribute. The `Field` source comment told me this; no guide did.
- **Nowhere did I find that `Focus.focus` refuses a view that `tabOrder()` filters out.** I found it by reading `runtime/src/focus.ts` (`reachable()`). The web's `tabindex=-1` pattern — focusable from code, not a Tab stop — seems to have no counterpart, at least none I found.

#### (b) Expressing what I wanted

**Where it fit very well:**
- **The seat map.** Three-deep replication (`SectionGroup [ datapath = :sections[] ]` → `RowLine` → `Seat`) over the service's own JSON. A `Plan` node holds the geometry; each seat's `x`, `y` and `rotation` are constraints over its record's index. The live stream writes `"sold"` into one record, and exactly one seat redraws. That's the "children come from data" model working as advertised, and it was the most satisfying part of the build. It also means the brief's "the room must not lie" is structural rather than something I had to remember to keep true.
- **Seat motion.** Two springs per seat (`chosenT`, `goneT`) feed a `SeatGlyph`'s `draw()`. Choosing a seat swells it with overshoot; a seat taken live shrinks away. I wrote no transition logic.
- **Accessibility mostly fell out of the system:**
  - `accessibilityRole = toggle` gives a button with `aria-pressed`.
  - `disabled` gives `aria-disabled`, and the field label comes from the provided `fieldLabel`.
  - `focusScope = stop` makes 648 seats one Tab stop.
  - `declare-look --semantics` showed `toggle "Orchestra, row A, seat 1" hint "Sold" [disabled]` with no extra work.
- **Data sources.** `credentials = include`, `errorSchema = Refusal`, `statusCode` and a typed `errorBody` made the 402/422/409 branches easy to write. `signedIn: boolean = { app.me.loaded && !app.me.failed }` made the session state a derivation, not a flag.
- **The browser's own behaviour.** `purpose = cardNumber` and friends produced the correct `autocomplete` and `inputmode` attributes, confirmed in a real browser. `Combobox [ purpose = country ]` with its exact-match-on-paste path quietly handles autofill.

**Where I worked around it:**
- **The phone zoom.** This was the largest one. I wanted "tap to zoom into that spot, then pan natively". The first attempt, which spring-animated `scale` and called `scrollTo({x,y})`, didn't land on x: the scroll range didn't exist yet. The docs say a request past the end "waits", but that apparently applies to growing content on y.
  - I ended up hand-writing a handoff. The map is carried from its overview position toward the target scroll offset in proportion to zoom progress (`mapX`, `mapY` from `zoomP`). When the spring's `arrived` fact flips, I switch to the native scroller (`landed`, `land()`, `scrollTo`).
  - It works and reads well, but it's exactly the kind of choreography the language says shouldn't be needed. A "scroll this pane so point P stays under point Q while its content scales" primitive, or a pinch-zoom scroller, would have deleted about 40 lines.
- **Restarting a spring.** Writing a value to a spring-driven attribute (to pulse the summary line) did nothing: the spring stays asleep because its target hasn't changed. I switched to an `Animator` with `start()`. That's defensible semantically, but nothing told me, and the "Motion" brief's advice ("write the value and the target together") points the other way.
- **Running code once after a state change.** For "after the screen changes, focus the heading", I used `trackChanges = ["screen"]`, `onChange` and then `afterSettle`. `ChangeEvent.changed` is an array; I guessed `e.changed("perfId")` first and was told otherwise.
- **The service's field errors.** These had to be threaded through `validate()` by keeping `refusedField`/`refusedValue`/`refusedMessage` and comparing against the current value. `validate` re-running when the things it reads change (as `declare-help Editor` says) is what made this work, and it's elegant once found. But "set an external error on a field until it changes" is common enough to deserve a named attribute.
- **Smaller ones:**
  - `x = center` is refused (correctly) inside a layout. Then `width = 100%` in a class's defaults conflicted with being placed in a horizontal `SimpleLayout` (a boot error), so widths moved to each use site.
  - The `DECLARE4025` warning on nested ternaries pushed me to name helpers (`brandShort`, `postalExample`, `screenFor`). That was mildly annoying but did improve the code.

#### (c) Verifying it

**What I used:**
- **`npx declare-verify` at each edit.** It's fast, and its messages almost always named the fix. Examples: "inside { } write it as a string: "bold"", "Pair's SimpleLayout sizes its children, so this child does not declare its width", "'?' at the end of a type is not valid TypeScript syntax" in method bodies, and a reminder that `SeatGlyph` reads its own `rowIndex`. The phone check also caught an 84×36 target below 44×44. I'd rate the diagnostics as the best part of the toolchain.
- **`declare-look` for screenshots and probing.** `--call`, `--set`, `--read`, `--js` and `--semantics` let me get to any state cheaply, without writing a harness. Naming views by accessible name (`app."Orchestra, row A, seat 10"`) was very handy.
- **Assert scripts (rung 5)** for three flows against the live service: the brief's phone story, a desk purchase by keyboard alone, and the refusals. They found real bugs:
  - The overview's tap-catcher was covering seats on desk.
  - Focus was being dropped after screen changes.
  - The "seat taken" notice was missing from checkout.
- **A small puppeteer script of my own** against the served URL, for the cookie session across reloads and to dump the inputs' `autocomplete` values.

**Where the tools let me down:**
- **The test driver's synthetic scrolling left `app.scrolling` stuck `true`.** After that, every scroll request was held, including the driver's own attempts to bring a field into view: "outside the window and scrolling did not bring it in". It took a long bisect with diagnostic prints to find. I worked around it by having the script call `window.scrollBy`. I believe this is a harness bug, not an app bug, but I'm not certain a real-device edge case doesn't exist.
- **Paths are fragile.** In the scripts, `app."Password"` resolved to something without `select()` (the `FormField` rather than its input). I switched to structural paths (`app.form.newCard.numberF.box.input`), which are brittle.
- **`page` in assert scripts isn't Playwright.** There's no `page.route`, so faking a 409 meant stubbing `window.EventSource` and buying the seat for real. That's arguably a better test, but I spent time finding out.
- **No convenient way to keep the dev server running.** Ports 8200 and 8201 were taken by other trees, which the server explained well, and the background-task time limit eventually stopped mine.

#### Surprises

- **Accessibility arrived almost free**, including role contracts the compiler checks.
- **The compiler refuses some reasonable-looking code.** Examples: `contentBox()` in a constraint, a `{ }` on `scrolls`/`axis` (where I had to write string literals), and bare enum tokens inside braces.
- **The service I built against also sells seats on its own.** Declare's live stream meant this simply worked, and the first 409 test "failed" because the app had already reacted correctly to the event.

#### Good and bad

**Good:**
- Constraints over data, with replication, are a strong model for a seat map.
- `purpose`, `judgeOn`, `focusScope`, overlays with `shown`/`input`, `Carousel` and `Combobox` all fit the brief.
- Every diagnostic names its fix.
- Typed schemas on data sources.

**Bad:**
- The camera/scroll story for zooming.
- Spring restart semantics.
- Focus-only-from-code isn't possible.
- Reserved-name collisions.
- Forms with server-side field errors lack a worked example.
- The scroll-state bug in the test driver.

#### Differences from what I'm used to

There are no components that re-render and no effects. "Derived, never assigned" is enforced (DECLARE7001 and the refused write) rather than being a lint rule. Events don't bubble, and that took some getting used to: a press-catcher over a scroller had to be a separate sibling view. Layout is an attribute with strict ownership of `x`/`width`, which is stricter than flexbox and occasionally more verbose. The `classroot`/`parent` scoping is unusual but clear once learned.

#### What it reminded me of

- **OpenLaszlo**, as its lineage says.
- **Spreadsheets and MobX** for the reactivity.
- **SwiftUI** for `State` and the overlay-as-state pattern (`shown`/`input` looks a lot like SwiftUI's `isPresented`).
- **QML** for constraint-bound geometry, plus a little of **Elm** in "handlers write facts only".

#### Where I'd most want improvement

1. A zoomable, pannable scroller (pinch plus programmatic focus-point zoom) as a library class.
2. A way to make a view focusable from code without being a Tab stop.
3. A documented, named way to put an external (server) error on a field.
4. Fix the test driver's stuck `scrolling` state, and make `"Label"` paths prefer the editable control.
5. A real form example (checkout or signup) in `apps/`.
6. Clearer guidance on Spring versus Animator for one-shot pulses.

#### What I'd use it for

Data-driven, stateful interfaces: dashboards, booking and selection surfaces like this seat map, internal tools, and anything where views are a function of live records and motion helps people keep track. The compile-time checking made me unusually confident in the branches I couldn't easily exercise. I'm less sure about heavy custom-gesture surfaces until there's a better zoom/pan primitive.

One caveat on all of this: it's one build. Some of my workarounds may already have idiomatic answers I didn't find.
