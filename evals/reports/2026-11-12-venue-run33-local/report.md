# Venue run 33: Opus 5.5, Declare, on the local tree

Built on the local working tree, the same subject as RealWorld run 2 plus that run's fixes.
**21.3 min, 91 turns, 107.7k output tokens. 11 of 11 hidden checks delivered; 1 of 11 at first
boot (10.1 min).** Run 32 took 25.0 min and passed 11/11 both ways. The whole first-boot loss
is one line of the agent's code; with that line fixed the first-boot copy passes 11/11. A
schema check the docs promise should have refused that line at compile time. Not clean on
platform, tools or reference; clean on names. Timing record:
`evals/timings/2026-11-12-venue-run33-local.txt`.

## Figures

| | Run 32 | **Run 33** |
|---|---|---|
| time, turns | 25.0 min, 90 | **21.3 min, 91** |
| output tokens | 119.6k | **107.7k (41.7k thinking)** |
| phases: reading · writing · checking | | **6.3 · 3.3 · 11.7** |
| first clean boot | 13.4 min, 11/11 | **10.1 min, 1/11** (11/11 with the one-line fix, `audit/fb-fixed/`) |
| delivered | 11/11 | **11/11** |

## The first-boot failure

At first boot, every seat was named "A, row A, seat 4" with the hint "$0.00, free", where the
drive expects "Orchestra, row A, seat 4". The cause is this line in `HallSection`:

```declare
HallRow [ datapath = :rows[], section = { :name ?? "" }, price = { :priceCents ?? 0 }, … ]
```

An attribute written on a repeated instance reads that instance's own record, here the row.
So `:name` read the row letter, and `:priceCents` read nothing. The agent's own test found it
at 12.1–12.5 min (no seat named `^Orchestra, row`), and one `declare-look --semantics` showed
the cause. It passed the values down through class members instead.

**Verdict: the agent's code, but the platform should have refused it.** The seat map
declares `schema = SeatPlan`, and `SeatRow` has no `priceCents`. declare.md §7 promises that
every `:path` is checked against the shape at compile time, and the same mistake written inline
is refused. The agent's shape gets past the check three ways (P1). The docs also never state
that an instance's own attributes read its own record (D2).

## The deep audit

Repros are in `audit/`; `audit/run.sh` replays them.

| min | What | Verdict | Repro |
|---|---|---|---|
| 9.6 | 2000 ×3 (`View = null` without `?`, baseline on a plain View, `100%` inside `{ }`) | Agent; good messages | — |
| 9.7 | 3006, 4023, 4025, 1002 | Agent; correct | — |
| 9.8 | 6001: `head` through an unnamed wrapper | Agent; the message doesn't say where `head` is (**M2**) | `anon-head` |
| 9.8 | 6001: `?.` gives undefined where `View?` holds null | Correct; the wording "a this View \| undefined" is garbled (**M1**) | `optional-chain` |
| 10.0 | 7001: `width` reads itself | Agent | — |
| 12.4 | Seats named "A, row A" | Agent; should have been refused (**P1**) | `shadow-*` |
| 12.8 | 1000: "expected end of input" after a stray `],` | Agent; the message could name the bracket (**M3**) | `extra-close` |
| 15.2 | Strictness refusal listing `<span> ""`, `<div> ""` | Correct refusal; empty descriptions (**T2**) | `toast-two.*` |
| 16.0 | Press refused: "would land on …payButton, which covers it" | **False refusal (T1)** | `dock-*` |
| 16.1 | declare-help misses on `scrollPadding`, `scrollInset`, `scrollMargin`, `scrollInsetBottom`, `insets` | **T3** + **D1** | `run.sh` |

**Platform:**
- **P1.** `:path` checking (`compiler/src/schema-check.ts`) misses three shapes:
  - `schema` set in a class body (`SeatMap extends DataSource [ schema = … ]`);
  - a class cursor that starts at `app.seatMap.value`;
  - a class body whose use sites all give it the same record (`HallSection [ datapath = :sections[] ]`).

**Tools:**
- **T1.** `aim()` scrolls with DOM `scrollIntoView`, which knows nothing of pinned bars, then
  refuses because the dock covers the target. The platform's own reveal (Tab) lands the field
  clear. This is the same cause as run 32's T4. It pushed the agent into restructuring checkout.
- **T2.** Strictness refusals describe matches with empty text.
- **T3.** declare-help doesn't split camelCase (`scrollPadding`), and an `Owner.member` miss
  answers less than the bare name would (`View.focusEntry`, `App.phone`).

**Messages:**
- **M1.** The synthetic name of an unnamed view leaks into the sentence.
- **M2.** A member miss through an unnamed wrapper doesn't name where the member is.
- **M3.** "Expected end of input" doesn't say where the App's body closed.

**Reference:**
- **D1.** That a reveal lands clear of pinned `ignoreScroll` bars (CSS's scroll-padding, read
  from the tree) is in no doc. Concept-table entries are also missing for scroll padding,
  `viewport`, `compact`/size class and `accessibilityDisabled`.
- **D2.** "Its descendants read fields relative to it" leaves out the view itself.
- **D3.** `focusEntry()` has no signature in the reference; the agent grepped the library for it.
- **Not met in the run:** `library/button.declare:110` says `press()` is called by a click. It
  isn't; `Control.onClick` documents the reversed routing.

**Source reads:**
- `library/combobox.declare`: fair, already in the reference.
- `library/control.declare`: fair; declare-help answered it in the same call.
- `library/*.declare` for `focusEntry`: **a doc gap (D3)**.

### Clean bill

| Count | Verdict |
|---|---|
| Platform | **Not clean.** P1 cost the first boot 10 of 11 checks |
| Tools, incl. the driver | **Not clean.** T1 (false refusal), T2, T3 |
| Names | **Clean.** One miss (`head`, its own path), no collisions, no old names |
| Reference | **Not clean.** D1, D2, D3 |

**Friction cost:**
- Platform and tools: about 7.5k tokens and 2.3 min (T1 1.5 min; P1 0.5 min, whose real
  cost is the first-boot score; T2 and T3 0.3 min).
- Docs and messages: about 2.6k tokens and 0.5 min.

### Against run 32

It was faster and leaner, with a first boot three minutes earlier. Run 32's T1/T2 fixes held.
This run's T1 shares its cause with run 32's T4: locators scroll the DOM instead of using the
platform's reveal.

## Fixed on the local tree after this run

The full suite passes (`scroll-loop` failed once under load and passes 3 of 3 alone). The
delivered app re-drives 11/11.

- **P1** (`compiler/src/schema-check.ts`):
  - `schema` is found along the class chain;
  - class cursors may start at `app.x.value`;
  - a class body is walked with the record its use sites give it, when all of them agree.

  The agent's first-boot line is now refused: "'priceCents' is not in the schema here …
  an element's own attributes read its own record; 'priceCents' is in the record above. To
  pass it down, declare it as a member of HallSection … and read it here as
  classroot.priceCents". No correct program among 586 `.declare` files in the corpus is refused.
  Regression test in `dataschema.test.mjs`.
- **T1:** `aim()` reveals through the platform (`__declare.reveal`), which clears pinned bars.
  Regression test in `scroll-reach.test.mjs`.
- **T2:** a strictness refusal describes each match by its path, text and `aria-live`.
- **T3:** declare-help splits camelCase, and an `Owner.member` miss falls back to the bare
  name's answer. Test added.
- **M1, M2, M3:**
  - no synthetic name in the sentence;
  - a member miss through an unnamed wrapper names its path;
  - "end of input" says where the App's body ended.
- **D1:** `ignoreScroll` says a reveal lands clear of it; ten concept-table entries.
  **D2:** declare.md §7 states the own-record rule, with a `classroot` example (declare.md is
  9,971 words). **D3:** `focusEntry() -> View?` is in the focusScope prose. **Button:** `press()`
  is the Space/Enter path, and a click runs `onClick`.

## Deferred: design

1. Mixed use sites: when a class's use sites give it different record types, what should the
   schema check do? Check per use site, skip, or let a class declare its record type?
2. Should `getByText` skip the platform's live-announcement region?
3. A cross-axis "text runs past its column" finding (a new check; account item 17).
4. Should `scrollIntoView(inset)` use the pinned-edge clearing below the view, as focus does?
5. Should `T?` accept `?.`'s `undefined`?

## Is it idiomatic Declare?

`idiom.py`: 1,142 lines without comments (to-do: 843); 0 colour literals outside a theme; 77
theme reads; 0 States; 39 width branches (to-do: 38); 14 `flexes`. The line-by-line read wasn't
done.

## The agent's account

Pasted whole. Where the audit contradicts it, the audit's reading is above.

# Building Venue in Declare: an account for the people who make it

I wrote this from memory of the session, so it may be wrong in places. I've quoted code as it stood when each problem happened, rebuilt from my edits; diagnostic text is copied from the tool output. Nothing in the app was changed for this write-up.

---

## (a) Getting up to speed

**What I read, in order**

1. `README.md`, then `task/brief.md` and `task/api/API.md`.
2. `skill/SKILL.md` and `AGENTS.md`.
3. `docs/declare.md`, whole.
4. Guide chapters `01-what-declare-is`, `04-structure`, `05-run-and-check` and `06-layout`, each whole.
5. `apps/todo/todo.declare` and `todo-parts.declare`, whole.
6. Then, as I needed it:
   - `14-data.md`, whole.
   - `08-controls.md`, whole.
   - The `SignUp` class in `apps/sampler/sampler.declare` (lines 120–229), which I found with `declare-help map`.
   - `19-accessibility.md`, `18-overlays.md` and `10-touch.md`, each whole.
   - `docs/operational/verify.md`, read from the saved-output file because the Bash output was too large.

**Reference lookups.** I used `npx declare-help` for roughly 45 names. Among them:
- `Form --all`, `TextInput.purpose`, `TextInput.concealed`, `DataSource.credentials`, `EventStream`, `Field`.
- `View.focusScope`, `View.scrolls`, `View.accessibilityRole`, `View.accessibilityHint`, `Accessibility`.
- `App.safeBottom`, `App.keyboardHeight`, `View.scrollTo`, `View.scrollIntoView`.
- `"theme tokens"`, `Carousel`, `Combobox`, `Text.numeralWidth`, `ChoiceControl`, `ChoiceItem`, `Sheet`, `Dialog`, `Toast`, `Button`.
- `ValueControl.judged`, `Control.focusShape`, `SanFrancisco`, `View.childViews`, `View.keyBindings`, `Focus.getFocus`, `Text.maxLines`.

I also grepped `library/combobox.declare` to learn how it treats autofill.

**What I skipped, and why**
- Guide chapters 02, 03, 07, 09, 11, 12, 13, 15, 16, 17 and 20–31. The skill said to stop reading after the core set and look things up as needed, and it worked well enough that I never went back.
- The calendar and the tracker. I didn't read them as models.

Skipping `07-scrolling.md` probably cost me. I hit a scrolling problem later (§g) and only searched that chapter for keywords rather than reading it.

**What taught me the most**
- **`declare.md`**, for the model. Its "Seven differences" list and the table of what you can assign to stopped me making most React-shaped mistakes.
- **The to-do app**, for the *shape* of an App: where state lives, the alias lines like `searchField: TextInput? = { … }`, `afterSettle(() => Focus.focus(…))`, and `exists` over `visible`.
- **`declare-help Form --all`** was the single most valuable page. It read like the library had been written against this brief:
  - `refusedWith`, including the remark about emptying the security code after a decline and setting `judged = false`.
  - `refusal` reading `{ field, message }`.
  - `pending` making sure something is sent only once.
  - `enterMoves`.

  I built checkout almost straight from that page.

**What was missing or misleading**
- **Page scroll versus pinned bars.** `10-touch.md` says "When touch matters, primary content belongs on the page's scroll", and `declare.md` §6 says a view that must stay on screen opts out with `ignoreScroll` (`y = end` at the foot). I followed both for the phone checkout, and they collide: a field scrolled into view lands under the pinned bar. Nothing I read says what to do about the content beneath a pinned bar.
- **Which record `:` reads at a replicated use site.** The rule surprised me (§c, §d). The to-do app's `TaskCard` comment ("The task is out of `:` reach in there, so the card captured what it needs above") is the only place I saw it stated, and it's phrased for a different case.

---

## (b) Expressing what I wanted

**Where it fit well**

- **The service as `DataSource`s:**
  - `credentials = include` and an `EventStream` with `listenTo = ["seatchanged"]` took a few lines each.
  - `signedIn: boolean = { app.me.loaded && !app.me.failed }` was the whole account state. Sign-out is just `me.clear()`.
- **Computed defaults for "signing in loses nothing".** `email: string = { app.account?.email ?? "" }` follows the account until the person types; their write replaces the formula. That is exactly the brief's requirement, with no "dirty" flags. This was the nicest fit of the build.
- **The checkout form:**
  - `Form [ source = { app.order } ]`, with refusals landing on fields by `name` and the form-level `error` for a 402.
  - `refusedWith` for the 409 and for the decline.
  - `Combobox [ purpose = country ]`, which settles text that arrives whole, as autofill's does.
- **Small things that were already there:** `TextInput.admit` for grouping the card number, `concealed` for "Show password", and `ProgressBar.indeterminate` (I asked for `Spinner`, and `declare-help` redirected me to it).
- **Seat states as drawing plus springs:** `fillT` and `goneT` springs read in `draw()`. Choosing pops the disc in, and a sale shrinks the ring to a dot, with no animation code.
- **The hall as one keyboard stop:** `focusScope = stop`, `keyBindings` for Up/Down, and a `focusEntry()` method.

**Where I worked around it**

- **Hall geometry.** I wrote the layout's arithmetic out again in a `script` block (`hallHeight`, `fitPitch`, `rowPitchOf`, `hallBow`, `bandPadTop`, …) so I could:
  - choose the largest seat size that fits the window, and
  - draw the phone's map of the house.

  The same numbers now live in three places: the views' constraints, the fitting function, and `HallMap.draw()`. This is the part of the code I trust least.
- **Seat lookup for arrow keys.** I walked `childViews` recursively with `instanceof SeatButton` to find seats by row. It works, but it is the "search the tree" pattern the guide warns against.
- **Checkout as a frame.** On a phone the whole checkout became a fixed-height frame instead of page scroll (§g1).
- **The ticket barcode** is a drawn, stable pattern, not a real symbology.

---

## (c) The first time it ran

The first full verify after the compile errors was clean through boot: "R4 ✓ boot (293 nodes, in Chrome, real text, a laptop)". Then I looked at it against the live service with `declare-look --url`.

1. **The house didn't fit a laptop window.** I saw it in a screenshot. Seats were 26px; the Orchestra filled the screen and the other three sections were below the fold. The brief says the house should be readable at a glance, so I added height-fitting.
2. **After fitting, it still overflowed** at the 16px floor. The screenshot showed the cause: each section's heading above its band cost about 44px. I moved the headings into a side column at a desk.
3. **The first test script crashed:** `Cannot read properties of undefined (reading 'click')`. My `freeSeats()` found no seat named `^Orchestra, row`. `declare-look … --semantics` showed why in one call: `toggle "A, row A, seat 1" hint "$0.00, free"`. Section name and price were both wrong. (Detail in §d9.)
4. **Checkout:**
   - The Card number field was a thin sliver (screenshot).
   - The order panel's `ignoreScroll` had no effect (a layout finding).
5. **After a successful purchase,** a toast said my own seat "has just been taken by someone else". The stream's sale event arrived before the order reply.
6. **Tickets:** the next card peeked against the current one with no gap, under a block of empty space.
7. **Phone:**
   - The hall started scrolled to its left edge.
   - The map was a smudge.
   - Each section's name was off-screen to the left.
   - "Wed 18 Nov" overran its column.
   - The pinned pay bar covered a field (a refusal from the press check).

Every one of these came from a screenshot, the semantics tree, or a layout line in a verify run. None came from reading the source.

---

## (d) Every refusal and surprise

The codes are as printed. "Mine" means my code was wrong.

| # | What I wrote | What the platform said or did | What I changed | Judgement |
|---|---|---|---|---|
| 1 | `pane: View = null,` on `HallMap` | DECLARE2000 "HallMap.pane's default expects a View — declared without '?', so never empty; write 'View?' to let it be null, got 'null'" | `View?` | Mine; `declare.md` §3 states it. Excellent message. |
| 2 | `layout: SimpleLayout [ axis = x, spacing = 12, align = baseline ]` in `OrderLine`, whose first child is a plain `View` holding two `Text`s | DECLARE2000 "View declares no baseline — SimpleLayout [ align = baseline ] aligns children by the baseline each declares; declare 'baseline: number = { <label>.y + <label>.baseline }' on View, or align by start \| center \| end." | `align = start` | Mine. The guide says `baseline` sits "a row of text and controls on one line" and doesn't say a plain container has none, but the message taught it. |
| 3 | `SignInForm [ …, width = { app.wide ? 380 : 100% } ]` | DECLARE2000 "SignInForm.width = { … } is not a valid expression — there are no percentages: read the parent and scale, so 100% is { parent.width * 1 }" | `parent.width - 40` (the 40 is a guess at the sheet's padding) | Mine; it is the first rule `declare.md` teaches. I'm unsure the `- 40` is right — I never looked at the sheet on a phone. |
| 4 | `lines: View [ datapath = { ({ rows: app.lines }) }, … OrderLine [ datapath = :rows[] ] ]`, twice | DECLARE3006 "a datapath is a place in declared data, and a literal is in none — the value is fresh, so no Dataset holds it… 'items: Dataset [ contents = { … } ]' … — 2 sites, also on line 653" | `chosenLines: Dataset [ schema = [ rows[]: Chosen ], contents = { { rows: app.lines } } ]` | Mine. The message is ideal: it gave the exact rewrite. |
| 5 | Warning in `TicketCard`: `TextLabel [ … text = { "GRAND HALL · TICKET " + (rowIndex + 1) + … } ]` | DECLARE4023 "TextLabel reads rowIndex, but TextLabel is not replicated — that is its own rowIndex, never the row's…" | `classroot.rowIndex` | A real bug, caught before it ran. Very good. |
| 6 | `heading: View? = { app.step == "done" ? app.tickets?.head : app.step == "pay" ? … : … }` | DECLARE4025, three nested choices | A `??` chain over whichever screen exists | Fair lint. My rewrite depends on only one screen existing at a time — subtle, but true here. |
| 7 | `theme = { ({ ...SanFrancisco, ...Venue }) }` | DECLARE1002 hint, redundant parentheses | Removed them | I copied `({ … })` from the to-do app. Harmless. |
| 8 | `heading: View? = { app.tickets?.head ?? app.checkout?.formCol.head ?? app.hallScreen?.top.head ?? … }` | DECLARE6001 "'head' is not a member of this View … — 2 sites on this line", plus TS2322 "computes a this View \| undefined, but 'hallPane' is typed View \| null" on `hallPane`, `hall` and `checkoutForm` | Named the anonymous wrappers (`intro: View`, `titles: View`); added `?? null` | Mine: `head` sat inside an anonymous `View`. It took two rounds, because I fixed one path and missed `top.head`. "this View" didn't say *which* path segment was anonymous; naming it would have saved a round. The `undefined`-versus-`null` rule from `?.` is TypeScript being TypeScript. |
| 9 | Country and postal row: `Field [ flexes = { app.width >= 400 }, width = { app.width < 400 ? parent.width : this.width }, … ]` | DECLARE7001 "'width' reads itself — a { } cannot depend on the attribute it defines… — 2 sites" | `narrow: boolean`; the layout switches `axis` and `align = stretch`; `flexes = { !parent.narrow }` | Mine, and confused besides: I was stating a size the layout should decide. |
| 10 | `HallRow [ datapath = :rows[], section = { :name ?? "" }, price = { :priceCents ?? 0 }, … ]` inside `HallSection` | No diagnostic. Seats named "A, row A, seat 1", priced $0.00 | Captured on the section first: `sectionName: string = { :name ?? "" }`, then `section = { classroot.sectionName }` | My misreading of scope. **But** the seat map had `schema = SeatPlan`, and `:priceCents` doesn't exist on a `SeatRow`, yet nothing warned. Unsure whether the `?? 0` hid it or nested-replication cursors aren't schema-checked. A warning here would have made it a compile error instead of a semantics-tree discovery. |
| 11 | `side: View [ visible = { app.wide }, ignoreLayout = true, ignoreScroll = true, … ]` inside `checkout: View` | Layout finding: "app.checkout.side has ignoreScroll, but its parent app.checkout does not scroll, so it moves with app.checkout… To stand still against the window, make it a child of the App" | Moved it to the App; later, to a sibling of a scrolling pane | Mine (`declare.md` says it), but the finding is exactly what I needed. |
| 12 | `TextInput [ width = 100%, name = "number", purpose = cardNumber, padding = [0, 58, 0, 12], … ]` with no height | No diagnostic; the field rendered about 18px tall | `class Entry extends TextInput [ height = { app.wide ? 42 : 48 }, fontSize = 16 ]` everywhere | Unsure. My four-value padding probably replaced the field's vertical padding, so the field shrank to its text. That is reasonable, but nothing flagged a text field shorter than a finger at desk size. |
| 13 | Order of the feed handler versus the order reply | Toast after my own purchase: "Grand Tier, row A, seat 5 has just been taken by someone else." | `if (app.order.loading \|\| !app.chosen.includes(id) \|\| d == null) return` | Mine, a real race. Good that I saw it. |
| 14 | `Text [ width = 100%, fontSize = 13, wrap = false, … text = { app.shortList } ]` | Finding: "app.hallScreen.choice.0.1's text needs 274 wide and has 241 — it runs past its box (wrap is off)." | `maxLines = 1` | Mine; good finding. |
| 15 | Phone checkout using page scroll and a pinned `payDock` with `ignoreScroll = true`, `y = end` | Script refusal: "page.getByLabel(\"Expiry date\"): a press at its centre (105, 742) would land on app.payDock.1.payButton (Button) (\"Pay $197.00\"), which covers it there…" | Restructured checkout into a frame (§h3) | This is the brief's "field hidden behind the keyboard and bar" problem, caught by the press check. The tool was excellent; the guidance was missing. Unsure whether the platform has a scroll inset for pinned chrome (§g1). |
| 16 | `arrive()` calling `centerHall()`, which returns early when `app.hall` is null | Phone hall opened at its left edge | Also called from `seatMap.onLoad() { …; afterSettle(() => app.centerHall()) }` | Mine. `scrollTo` would have held the request; I never made one. |
| 17 | `PerfRow`'s date column at `width = { app.wide ? 150 : 104 }` with a 20px serif | "Wed 18 Nov" overran on the phone (screenshot). Not reported by `--phone` boot | 112 wide, 18px | Mine; unsure why boot's text-overflow check didn't catch it. |

**Surprises that weren't errors**
- The port-8200 clash with another dev server was handled clearly; it named 8201.
- `getByText(...)` matched two elements (the toast and, I believe, an announcement span), so I scoped by role.
- My script failed on "Pay $159.00": my arithmetic was wrong; the app was right ($145 + $13 = $158).

---

## (e) Verifying it

| Check | What it caught |
|---|---|
| Compile rungs R1–R3 | Items 1–9 above, mostly with exact rewrites. The fastest loop. |
| R4 boot, `--phone --desktop --all` | Nothing, once data-dependent screens existed. It honestly listed the classes it never built. It fed sample data to `seatMap` and `me`, so the real-data layout problems slipped past it (item 17). |
| `declare-look --url … --shot` | Screenshots against the live service and real cookies. This found most real problems: the hall's size, the field height, the carousel, the phone map, the column overflow. |
| `--semantics` | The section-name bug, instantly. |
| Assert scripts (`tests/pay-desk.mjs`, `keyboard-desk.mjs`, `phone-story.mjs`, `refusals.mjs`) | Playwright locators by role and name, `drive.tab` / `drive.key`, `drive.waitReal` for the stream, `drive.set` to force a sold seat into the choice for the 409, `expect.request(… { count })` for the single send. Layout findings during these runs caught items 11, 14 and 15. |

All four scripts passed on the final run, against the live service.

**Where the tools served me less well**
- When a click waits for a request, the screen has moved on by the next step. The failure then said "motion is still in flight… (Spring on x, y, width of app.2, a FocusRing)", which pointed the wrong way: the real reason was that the Pay button no longer existed. `click({ clickCount: 2 })` was the right way to test a double press.
- Each verify run took 30–90 seconds. That's fine, but it added up over about 20 runs.
- The scripts write real orders to the service. The tool warned about this, fairly.

---

## (f) Confidence, part by part

**High (driven end to end and passed)**
- §1 the list.
- §2 choosing, unchoosing, the summary text, and live sales leaving your choice with a message.
- §3 sign in (wrong password shows the service's sentence), reload, sign out.
- §4 a new card with grouping and brand, decline keeping everything but the code, a code refusal focusing its field, a 409 back to the hall, a single send.
- §5 tickets, and "Sent to …".
- Keyboard-only booking at a desk.

**Medium**
- **Phone hall:** thumb accuracy is plausible at 44pt, and the 44pt check passed. But only taps were driven. Panning, momentum and dragging on the map never were.
- **The 422 postal-code refusal:** same code path as the security-code one, but never triggered on its own.
- **Signed-out (401) during payment:** never triggered.
- **Seat accessible names:** exact, but the description (price and state) goes in `accessibilityHint`. I also set `tooltipLabel` on desk seats, and the accessibility guide says a tooltip becomes the hint. I'm unsure which wins in every browser.

**Low (built to be right, unproven)**
- Autofill.
- The phone keyboard, and the dock rising by `app.keyboardHeight`.
- Screen reader announcements in practice.
- Reduced motion; dark mode, which I didn't build at all.
- Very small desk windows: `fitPitch` floors at 15px seats.

**Where a tester will likely find problems**
1. **Desk hall slightly taller than the window.** The fit leaves no room for the choice bar, so the pane scrolls a little once seats are chosen (visible in the keyboard-run screenshot).
2. **The Pay button keeps its label while paying.** Progress shows as a bar and a line below it. Some testers would expect the button itself to change or disable.
3. **After a 409, focus goes to the hall heading, not to the notice,** even though the notice is focusable.
4. **Browser Back from checkout.** `step` isn't in history, so Back from checkout goes to the list, not the hall.
5. **Phone hall seat rows lose their letters mid-pan.** Row letters are only drawn at each end, so a person panned to the middle can't see which row they're in.
6. **The phone map's geometry** is a hand copy of the layout and could drift from it.

---

## (g) Gaps I worked around

1. **Keeping a focused field clear of a pinned bar** (scroll-padding).
   - **Looked:** `declare-help` for `scrollPadding`, `View.scrollInset`, `scrollMargin`, `App.scrollInsetBottom` and `insets` (all misses), and a grep of `07-scrolling.md`. `scrollIntoView` has an `inset` parameter, but only for the top.
   - **Did instead:** a frame with a scrolling pane and the dock in the layout flow.
   - **Judgement:** unsure. It might exist under a name I didn't guess, and I never read `07-scrolling.md` whole. If it truly doesn't exist, the touch chapter's advice to use the page's scroll needs a caveat for pinned bars.

2. **Fitting content to a room.** I wanted "the largest seat size at which the hall fits".
   - **Did instead:** re-derived the height in script.
   - **Judgement:** probably my blind spot. Rendering at a fixed size and setting `scale = { Math.min(1, pane.height / hall.contentHeight) }` might well have worked, since layout honours `scale`, and it would have removed the duplicated geometry. I thought of this only while writing this account.

3. **A thumbnail of a subtree** (the phone's map).
   - **Did instead:** re-drew all 648 seats in `draw()`.
   - **Judgement:** I didn't look. A second scaled, hidden, non-interactive `Hall` might have done it, at the cost of 648 more views.

4. **Reading the enclosing record from inside replication** (a parent path).
   - **Did instead:** captured values on the section through `classroot`.
   - **Judgement:** that is the documented idiom. The gap is the missing warning in item 10.

5. **A 2-D grid for the keyboard.**
   - **Did instead:** walked `childViews`, used `instanceof`, called `Focus.focus`.
   - **Judgement:** the `focusScope` docs anticipate exactly this. The `grid`/`row`/`cell` roles might have been more correct than groups of toggles. Unsure.

6. **A real barcode or QR code.**
   - **Did instead:** a drawn, stable fake pattern.
   - **Judgement:** I never asked `declare-help`. Unknown.

7. **"Is this a phone?"** `App.phone` and `App.compact` don't exist; I computed `wide` myself. That is fine, and the to-do app does the same.

---

## (h) Changes of direction

1. **Hall sizing:**
   - First, seat size from width only (26px).
   - Then height-fitting with a 16px floor, after the first screenshot.
   - Then section names moved to a side column, rows tightened to 0.84 of the seat width, and flatter arcs, after the second screenshot.
   - All of it reflected in `HallMap`.
2. **Section labels:** above each band, then beside it at a desk and centred above it on a phone (screenshots).
3. **Checkout layout** went through three versions:
   - Page scroll, with an `ignoreScroll` side panel inside `checkout` and an `ignoreScroll` dock.
   - The side panel moved to the App, after the layout finding.
   - Then the whole checkout became a frame: a scrolling pane, the side panel overlaid, the dock in the flow. This came from the "press would land on … payButton" refusal, late in the build.
4. **Seat height:** equal to the seat width, then a separate row pitch, which equals the seat width on a phone so taps stay at 44pt (my own second thoughts while fitting).
5. **Text fields:** per-field settings, then an `Entry` subclass (the thin-field screenshot).
6. **Country and postal row:** a width constraint, then switching axis and align (DECLARE7001).
7. **Keyboard:** every seat a Tab stop, then the hall as one stop with arrows. This was my own second thought before testing; hundreds of Tab stops would have failed the brief's keyboard-alone case.
8. **The phone map:** a full-width strip, then a 140×128 box beside the title (screenshot).
9. **Tickets:** the card as the carousel page, then a padded page holding a card (screenshot).
10. **Rejected before writing:**
    - A tap-to-zoom overview on the phone. A tap that sometimes zooms and sometimes chooses seemed risky for a test that clicks seats by name.
    - Putting the checkout step in `waypoint`. I kept it a plain attribute to limit unknowns.

---

## (i) The code, quoted (reconstructed)

**Section names lost through replication** (no diagnostic; found with `--semantics`)
```declare
class HallSection [ …
    HallRow [ datapath = :rows[], section = { :name ?? "" }, price = { :priceCents ?? 0 }, widest = { app.seatMap.widest } ]
    ]
```
Semantics output: `toggle "A, row A, seat 4" hint "$0.00, free" [not pressed] {press}`. The schema was `SeatPlan` → `Section` → `rows[]: SeatRow [ name, seats[] ]`, so `:priceCents` on a `SeatRow` should arguably warn.

**Card number field collapsed** (no diagnostic)
```declare
Field [ width = 100%, label = "Card number", stacked = true,
    TextInput [ width = 100%, name = "number", purpose = cardNumber, padding = [0, 58, 0, 12],
        numeralWidth = tabular, required = "Enter the card number.", placeholder = "1234 1234 1234 1234",
        value <-> app.pay.number,
        admit(t: string) -> string { return groupCard(digitsOf(t)) },
        BrandMark [ x = { parent.width - 50 }, y = center, visible = { app.pay.brand != "" }, brand = { app.pay.brand } ] ] ]
```
It rendered about 18px tall at 1280×800, while sibling `TextInput`s without `padding` rendered about 38px.

**Pinned dock over a field** (phone, 390×844, touch)
```declare
payDock: View [ exists = { !app.wide && app.step == "pay" }, ignoreScroll = true, ignoreLayout = true,
    y = end, width = { app.width },
    padding = { [12, 20, 12 + Math.max(app.safeBottom, app.keyboardHeight), 20] }, …
    AmountLine [ … ], PayBlock [ width = 100% ] ],
```
The form column had a bottom padding of `132 + app.safeBottom + app.keyboardHeight`. The message was: "page.getByLabel("Expiry date"): a press at its centre (105, 742) would land on app.payDock.1.payButton (Button) ("Pay $197.00"), which covers it there — what a person would touch. Close or move what covers it; force: true presses there anyway". The bottom padding gives room at the end of the page, but a field mid-page that is scrolled *just* into view still sits under the dock.

**Misleading failure hint**
```js
await page.getByRole("button", { name: "Pay $158.00" }).click();
await page.getByRole("button", { name: "Pay $158.00" }).click();
```
The message was: "found nothing within 5 s — motion is still in flight on the program's clock, which the script holds (Spring on x, y, width, height, _rad of app.2, a FocusRing; Spring on openT of app.toast)…". The real reason was that the first click had waited for the order and moved the app to the tickets screen.

**Self-read width**
```declare
Field [ flexes = { app.width >= 400 }, width = { app.width < 400 ? parent.width : this.width }, label = "Country", stacked = true, … ]
```
DECLARE7001 "'width' reads itself — … — 2 sites".

**Alias through an anonymous view**
```declare
heading: View? = { app.tickets?.intro.head ?? app.checkout?.formCol.head ?? app.hallScreen?.top.head ?? app.list?.col.intro.head ?? null },
```
`top` contained `View [ flexes = true, … head: Text [ … ] ]`. DECLARE6001 "'head' is not a member of this View — declare it (head: <type> = …) or fix the name [DECLARE6001] (line 496, col 101)". Going round twice here was my own doing.

---

## Overall

**Surprises**
- How much of the brief the library already knew: `Form.refusedWith` with the security-code example, autofill-aware `Combobox`, `purpose`, `concealed`, `judged = false`.
- The press check refusing a covered target. It found a real usability bug that I would otherwise have shipped.
- That a clean compile with a schema still let `:priceCents` read nothing.

**Good**
- Diagnostics that state the rewrite.
- The semantics printout.
- Assert scripts that combine Playwright locators with view paths and request expectations.
- Computed defaults.
- Springs read inside `draw`.
- One App holding where the person is.

**Bad**
- Hand-placed scene geometry had to be repeated wherever else it was needed.
- No clear story for content under pinned chrome.
- Boot checks on sample data hide real-data layout problems.
- Some failure hints pointed at the wrong cause.

**Compared with what I know**
- Closest to QML: bindings, states, anchors-as-constraints.
- `provided` feels like SwiftUI's environment, and `<->` like a SwiftUI binding.
- Replication over a datapath recalls Knockout's `foreach` and XSLT.
- Its lineage, OpenLaszlo, shows.
- Unlike React, there is no render-reconcile thinking at all. The cost is learning which values are owned by a constraint and which are yours to assign; the payoff is that I wrote almost no update code.

**Where I'd most want improvement**
1. **Fitting and measuring.** A sanctioned way to ask "how big would this be" or "make it fit", so geometry isn't re-derived in script. (I'm unsure whether `scale` already covers it.)
2. **Pinned chrome and safe scroll insets** for focused fields.
3. **Schema-checked `:` reads at nested replicated use sites.**
4. **Real or realistic data at boot**, or a flag to boot against the live service.

**The sharpest edge** was the hall's geometry: fitting it to the window and redrawing it as a map. It was a pattern, not a single obstacle. It cost four or five rounds of screenshot, adjust, re-run — I'd guess a quarter of the build — and it left fragile duplicated code behind. To get it right the first time I would have needed one of two things: a documented "scale this subtree to fit its room" idiom (it may exist; see g2), or a thumbnail facility that shows the same subtree smaller.

The second edge was the pinned pay bar over the form: one obstacle, one late restructure, perhaps a tenth of the effort. A sentence in `07-scrolling.md` or `10-touch.md` about content under pinned bars would have prevented it.

**What I'd use it for**
- **Transactional consumer flows** like this one: forms, accounts, payments, live data. Here the library's opinions save real work and the checking tools catch real bugs.
- **Interactive diagrams with motion.**

I'd hesitate on large teams that depend on an ecosystem of third-party components, and I can't judge long-term maintenance from one build.


## The names ledger

```
NAMES — eval-venue-33: 1 missed name(s), 0 collision(s), 11 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    10 · member    · head                 · this View                · —                  · none         · ×2  ·   10 · resolved
         'head' is not a member of this View — declare it (head: <type> = …) or fix the name — 2 sites on this line [DECLARE6001] (line 496, col 37)

DECLARE-HELP MISSES (min · asked for · answered)
     1 · accessibilityDisabled · View has no member 'accessibilityDisabled' — related: accessibilityRole, accessibilityLabel, accessibilityHint, accessibilityHidden, accessibilityError (declare
     1 · viewport · App has no member 'viewport' and nothing near it — the member table: declare-help App
     2 · Spinner · 'Spinner' is not a Declare name — the Declare concept is ProgressBar.indeterminate:
     5 · focusEntry · View has no member 'focusEntry' — related: focused, focusable, focusScope (declare-help View.<name>)
     5 · phone · App has no member 'phone' and nothing near it — the member table: declare-help App
     5 · compact · App has no member 'compact' and nothing near it — the member table: declare-help App
    16 · scrollPadding · no entry for 'scrollPadding' — searched reference (1973 entries), classes (112), enums, diagnostics, the hint tables, and the concept table.
    16 · scrollInset · View has no member 'scrollInset' — related: scrolls, scrollY, scrollX, scrollStartY, scrollStartX (declare-help View.<name>)
    16 · scrollMargin · no entry for 'scrollMargin' — searched reference (1973 entries), classes (112), enums, diagnostics, the hint tables, and the concept table.
    16 · scrollInsetBottom · App has no member 'scrollInsetBottom' — related: scrollY, scrolls, scrollX, scrollStartY, scrollStartX (declare-help App.<name>)
    16 · insets · no 'insets' — did you mean 'inset'? (owners: declare-help inset)

SUMMARY: 1 of 1 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
