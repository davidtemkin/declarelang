# Venue run 36: Opus 5.5, Declare, on the local tree, standard level

The first Venue run on the global-names tree, with the focus-ring fix from Murmur 18.
**31.9 min, 119 turns, 163k output tokens** (84k thinking). Not scored: the audit is the
result. Timing record: `evals/timings/2026-11-15-venue-run36-local.txt`.

## 1. The comparison

| | 34 | 35 | **36** |
|---|---|---|---|
| total | 25.5 | 23.5 | **31.9 min** |
| turns | 100 | 98 | 119 |
| output tokens (thinking) | 135k (64k) | 120k (52k) | 163k (84k) |
| reading · writing · checking | 7.4 · 7.5 · 10.6 | 5.2 · 6.0 · 12.3 | 10.8 · 6.5 · 14.6 |
| tool time · model time | 4.6 · 20.9 | 4.5 · 19.0 | 6.1 · 25.8 |
| verify calls | 17 | 24 | 26 |
| output per model-minute | 6444 | 6334 | 6325 |

- **Slower than runs 34 and 35, at the same pace.** The extra 8–9 minutes are mostly model
  time spent reading and planning: 10.8 minutes before the first write (twice run 35's) and
  84k thinking tokens (run 35: 52k). It read more of the guide and more library source
  (`combobox.declare` four times, `icons/core.declare`, `valuecontrol.declare`,
  `textinput.declare`) before writing, and wrote a larger program.
- **Code:** 1,973 lines in four Declare files, 1,448 without comments and blank lines (run 35:
  1,274 lines of Declare by `idiom.py`'s count).
- **Download:** 205 KB gzip as a production build, first load.
- **Checks:** three kept assert scripts — `phone-journey`, `desk-keyboard` (the brief's desk
  journey with no account, by keyboard) and `edges` (a seat lost at the till, focus after
  closing, the service's sentences) — and screenshots at 1366, 1440 and a phone.

Cadence 37's audit ran beside this run.

## 2. What it built, and findings for the platform

All of the brief: the list of performances (availability in words and a bar), the hall drawn
as a room (four sections fanning from the stage, each seat a `Control` turned to face it, three
looks by shape), a phone's overview map that steers the pane, seats lost to other buyers
arriving on an `EventStream`, a checkout `Form` whose fields start from the account and whose
refusals land on the field they name, saved cards, sign-in in a sheet, and tickets with
scannable barcodes in a `Carousel`.

1. **The new names, in use and unremarked:**
   - **`Color.mix`** fades a seat from free to sold as it shrinks
     (`Color.mix(surface, sold, goneT)`, venue-hall.declare:199).
   - **`errorSchema = Refusal`** on every write and the seat map; the checkout's `refusedWith`
     reads `body.conflicts` and `body.error` typed (venue-checkout.declare:174–189).
   - **`Stroke(…)`** throughout; no refusal.
2. **A runtime read the reference answers.** The agent grepped `runtime/src/purpose.ts` for the
   field purposes. `declare-help TextInput.purpose` lists all of them in a table. Nothing to
   change in the platform; recorded because source reads are audited.
3. **`DataSource.cache` was asked for and doesn't exist.** The answer named the member table,
   which was right; the agent wanted caching of a fetched value, which a `DataSource` keeps
   anyway (`value` stays between fetches). A concept entry for `cache` pointing there would
   answer the question the agent was asking.

4. **OPEN: the focus ring still misses a second move in one settle chain.** With Murmur 18's
   fix in this tree, the runtime still said `onChange on app.5._focus: 'g' changed again in the
   same settle chain` and the same for `_focusMove: 'at'` (account, d11) — now with the node
   named. These are real second moves, not repeats: focus moves, and an `afterSettle` step moves
   it again (here, to the new screen's heading). A tracked value is delivered once per settle
   chain, which stops handler rings; the ring's watchers are the case where a second change in
   the chain is legitimate, and the ring is left marking the first place. **To decide** (a change
   to `onChange`'s delivery rule): deliver a value up to a small number of times per chain and
   warn only past it — a ring changes a value without end, a chain changes it a few times.
5. **The "motion is still in flight" note appears on unrelated failures.** A locator that found
   nothing was reported with "motion is still in flight … (Spring on lift of
   app.hallScreen.foot.0)", a spring on another, hidden screen; it misled the agent twice
   (account, d9). **Proposal:** name motion only when it is on the path or the view the step
   was looking for.
6. **Where focus goes when the view holding it vanishes** cost the agent four fixes, about 15% of
   its checking (account, d13–d16): `restoresFocusTo` naming a focus-stop container left focus on
   the page body; after `me.clear()` hid the Sign out button, `Focus.getFocus()` still reported
   it inside the `afterSettle`. **To check** both; and a short guide section on focus after a
   removal, and when the loss is visible.
7. **Smaller:**
   - `Spring.arrive`'s entry ("takes the **next** target outright") led the agent to call it in
     `onInit`; the class entry says a spring starts where it is going. The `arrive` entry should
     say so too.
   - `Combobox` with `purpose = country` picks the item autofill names; only the library source
     said so. The `purpose` entry's `country` row could.
   - `'Section' is declared twice — in "venue-checkout.declare" and "the app" (line 132)`: the
     main file named by its name, and the line given with its file (as in Murmur 18).
   - A field covered by pinned chrome passed `toBeVisible`; only a screenshot showed it. A layout
     finding for a focused or messaged field under pinned chrome is a candidate.
   - Requests: a bottom inset for `scrollIntoView` (above a pay bar or keyboard), and a lookup of
     a replicated view by its record's id.

No platform bug found beyond finding 4.

## 3. Is it idiomatic Declare?

| | Run 35 | Run 36 | To-do |
|---|---|---|---|
| code | 1,274 lines Declare | 1,448 lines Declare | 844 lines Declare |
| bytes | 68 KB | 81 KB | 48 KB |
| lines over 150 characters | 8 | 15 | 3 |
| colour literals outside theme declarations | 2 | 2 | 1 |
| theme reads | 82 | 116 | 69 |
| States | 6 | 6 | 7 |
| visible switches | 5 | 7 | 0 |
| branches on width or phone | 16 | 34 | 38 |
| flexes | 17 | 26 | 7 |
| browser scripts | 0 | 0 | 0 |
| page lookups | 0 | 0 | 0 |

**What it gets right.**
- **The seat map is a `DataSource` class** that knows where a seat is and what it costs, and
  writes a seat sold where it lives so the seat's view follows (venue.declare:187–239). Other
  buyers arrive on an `EventStream` member gated by `active`.
- **Where the person is:** the performance is `location` (linkable), paying is `waypoint` (Back
  returns to the hall), and `screen` is one constraint over both and the order
  (venue.declare:338–346).
- **The checkout is one `Form`** whose `source` is the order, with `refusal` and `refusedWith`
  overridden so seats taken first go back to the hall and everything else lands on its field.
  The fields write App attributes whose `{ }` defaults come from the account, so signing in
  halfway fills them and typing makes them the person's (venue.declare:422–431).
- **Fields that help as they're typed:** `admit` groups a card number as printed and writes the
  expiry `MM / YY`; `validate` judges on leaving; `purpose` on every field for autofill.
- **The hall's seats are one Tab stop** (`focusScope = stop`) with arrow bindings and a chosen
  entry seat (`focusEntry`); after a screen change, focus goes to the screen's heading, and
  `restoresFocusTo` says where focus goes back when something closes.
- **Announcements** for a seat taken and for signing in and out (`Accessibility.announce`).
- **Every color a theme token**, including arrays for the sections' tints and inks.

**Missteps, with how each should be written.**
- **Walking the rendered tree for the seats.** `Hall.allSeats()` loops `childViews` three levels
  deep, and `entrySeat` and `stepRow` search it (venue-hall.declare:327–365). The seats are data:
  pick the entry seat and the next row's nearest seat from `app.seats`' records (row, angle are
  computable there), then find that one view.
- **A field climbing to its `Field`.** `Entry.holder()` walks `parent` until it finds a `Field`
  (venue-checkout.declare:158–162), the "part reaching up to its owner" guide 04 warns against.
  The `Field` can bring itself into sight when its own message appears.
- **The form reaching into its fields' internals:** `classroot.main.saved.code.field.judged =
  false` and `….cvc.judged = false` after a decline (venue-checkout.declare:187–188). Clearing
  the value is the fact; whether a field shows its judgement should follow from it, or be the
  field's own method.
- **Two hard-coded white inks** on the ticket's stub (`textColor = #FFFFFF`,
  venue-parts.declare:358–359) beside the theme's `stageInk`.

**Workarounds the platform forced:** none found.

## 4. Names

**Misses:** one. `heading` on `PayForm`, a child's (`main.top.heading`), answered with the path;
resolved in the same minute.

**Silent misses:** none found.

**Collisions:** none recorded. (A class first named `Section` was renamed `FormSection` while
its schema `Section` stood; the compile refused the pair as one name declared twice.)

**Lookups that missed:** `DataSource.cache` (finding 3).

## 5. The agent's account

Asked after the build by resuming the session read-only (`impressions.txt`); 14k output tokens,
413k cache reads, counted apart from the build's.

# Building Venue in Declare: an account for the people who make it

Nothing in the project was changed for this account. I've reconstructed the code quotes below from the session; where I'm unsure of exact wording, I say so.

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`, the brief and `API.md`.
2. `skill/SKILL.md` and `AGENTS.md`.
3. `docs/declare.md`, whole.
4. Guide chapters 01 (what Declare is), 04 (structure), 05 (run and check) and 06 (layout), whole.
5. `apps/todo/todo.declare` and `todo-parts.declare`, whole.

That is exactly the reading list the skill prescribes. After that I read only what the plan needed:
- `14-data.md`: the second half first (sources, forms), then the first half.
- `08-controls.md` and `19-accessibility.md`, whole.
- The `SignUp` class in `apps/sampler`, found with grep.
- `declare-help Form --all`, plus the reference entries for `TextInput.purpose` and `TextInput.concealed`.
- `Field --all`, `Carousel`, `ChoiceControl`, `Spring.arrive` and a batch of others.
- The top of `library/combobox.declare`, read as source.
- `10-touch.md` up to "Dragging on a scrolling surface".
- The Dialogs-through-Toasts sections of `18-overlays.md`.
- `docs/operational/verify.md`, whole.

**What I skipped:** chapters 02, 03, 07, 09, 11, 12, 13, 15, 16, 17, 20, 21, 22 and 23, plus the tracker and calendar apps. The skill says to stop reading after the first set and look things up when needed, and I took it at its word. In hindsight, two skips probably cost me:
- **07 Scrolling.** I never checked it for a sticky element or a scroll-into-view with room left at the bottom. That is exactly what I worked around twice (see g).
- **21 Motion.** I never checked whether `Animator` gives a one-shot pulse, and I improvised one with a Spring and `afterDelay`.

I also used `location` and `waypoint` from their reference entries alone, without reading 20 URLs. It worked, but I never tested the Back button.

**What taught me the most:**
- **The to-do app.** It is the only place I saw computed defaults that become the person's once they type, `trackChanges` with `onChange`, the `afterSettle(() => Focus.focus(...))` pattern, and aliases on the App (`list: View = { app.main.col.list }`). I used all four.
- **The `Form` reference prose.** It is unusually concrete. The `refusedWith` entry even names "the security code after a declined card", which is precisely the brief's case.
- **One sentence in `10-touch.md`:** "Many small targets close together belong in a scroller, at a finger's size — each at least 44 points … rather than fitted to the screen and zoomed into." That decided the phone hall's design before I wrote a line.

**What was missing or misleading:**
- **`Spring.arrive`.** Its entry says it takes "the **next** target outright". I read that as "call it so a seat doesn't animate on creation", and wrote `onInit() { pickSpring.arrive(); goneSpring.arrive() }`. The `Spring --all` prose then said "It starts where it is going", which made the call unnecessary. That isn't wrong, but the `arrive` entry alone sent me the wrong way.
- **The to-do app uses a form the linter flags.** It writes `theme = { app.isDark ? ({ ...SanFranciscoDark, ...PaperDark }) : … }`. I copied that shape, and the linter then flagged mine as redundant parentheses (DECLARE1002).
- **Country autofill.** The reference for `TextInput.purpose` lists `country`, but a country with three choices wants a picker. Nothing in the guide I read said that `Combobox` with `purpose = country` picks an item when autofill's text names one. I found it by grepping the library for "country" and reading `combobox.declare`'s header comment.

## (b) Expressing what I wanted

**Where Declare fit naturally:**
- **The data model.** `SeatMap extends DataSource` holds the "where is this seat / what does it cost / mark it sold" logic. The `EventStream` writes into it with `markSold`, and 648 seats follow, with no code connecting them.
- **Nested replication** (`sections[] → rows[] → seats[]`), with each level a class that captures its record's fields for the level below, as `declare.md` §7 shows with `Team`.
- **Computed defaults for checkout:** `email: string = { app.account?.email ?? "" }`. This made "sign in halfway and lose nothing" almost free, which is the best fit in the whole build.
- **`Form`:**
  - `source = { app.orderReq }` handles pending state and refusals by itself.
  - A 422 lands on the field with the matching `name`, and the form focuses it.
  - `refusedWith` and `refusal` overrides handle the 409 and decline cases.
  - `enterMoves`.
  - One send per press, with no flag of my own.
- **Purposes on fields.** `purpose = cardNumber`, `postalCode` and the rest produced the right `autocomplete` attributes, which I asserted directly.
- **A `ChoiceControl` with a replicated `CardOption` and one static option as direct children** worked first time, disabled expired card included.

**Where I worked around the language:**
- **The hall itself.** Positions computed by hand from radius and angle in script functions, with the pitch provided down the tree. The docs bless hand placement for a scene, so this felt legitimate rather than a fight.
- **Keyboard movement among seats** (see g).
- **Keeping things in view on a phone** (see g).

## (c) The first time it ran

The first boot (`declare-verify --phone --desktop`) was clean apart from two layout findings. It also listed "not built at boot: … PayBar …", which is how I learned I had **written the `PayBar` class and never placed it in the tree**.

The first screenshots, from `declare-look --url`, showed:
- the phone list's date column was too narrow ("20 Nov" collided with the time);
- the hall rendered correctly, but on a phone it opened scrolled to the stage, not the seats;
- on a phone zoomed into the middle of the house, nothing said which row or seat you were looking at;
- the front rows wrapped very far around the stage.

Every one of those was found by looking at a picture, not by a check.

## (d) Every refusal and surprise

1. **DECLARE5001: "'Section' is declared twice — in "venue-checkout.declare" and "the app" (line 132, col 1)".**
   - *What I wrote:* `schema Section [...]` in `venue.declare` and `class Section [...]` in the checkout file.
   - *Fix:* renamed the class to `FormSection`.
   - *Judgement:* my error. The message was a little ambiguous: "the app" for `venue.declare`, and a bare line number without saying which file.
2. **DECLARE2000: "MiniMap.hall's default expects a Hall — declared without '?' … write 'Hall?'".**
   - *What I wrote:* `hall: Hall = null` (and the same for `pane`).
   - *Fix:* `Hall?`.
   - *Judgement:* my error; an excellent message.
3. **DECLARE4005: "'semibold' is one of fontWeight's values — bare only as the whole value … inside { } write it as a string".**
   - *What I wrote:* `fontWeight = { classroot.strong ? semibold : regular }`, with `bold` in the same shape. Three sites.
   - *Fix:* quoted the strings.
   - *Judgement:* my error. `declare.md` §2 says this, and I'd read it.
4. **DECLARE4023 (warning, bugs): "Text reads rowIndex, but Text is not replicated — that is its own rowIndex, never the row's …".**
   - *What I wrote:* `Text [ text = { "Ticket " + (rowIndex + 1) + … } ]` inside `TicketCard`, and `fill = { provided("theme").tiers[rowIndex] }` inside `PriceKey`'s replicated row.
   - *Fix:* `classroot.rowIndex` and `parent.rowIndex`.
   - *Judgement:* my error. This one would have been a silent bug in any other framework, so it was a very good catch.
5. **DECLARE4025 (lint): nested choices three deep.**
   - *What I wrote:* `cols` (4/3/2/1 by width) and `screen`.
   - *Fix:* `cols: number = { [620, 900, 1200].filter((w) => app.width >= w).length + 1 }`, and named booleans (`booked`, `paying`, `inHall`) for `screen`.
   - *Judgement:* fair; the code reads better.
6. **DECLARE1002 (hint): redundant parentheses** on `theme = { ({ ...SanFrancisco, ...Venue }) }` and on two `body` and `contents` literals. Fixed. As noted in (a), the to-do app models this shape.
7. **DECLARE6001: "'heading' is not a member of PayForm — a child's is: 'main.top.heading'".**
   - *What I wrote:* `app.checkout.heading`.
   - *Judgement:* my error; the message gave the exact fix.
8. **R4 layout: "app.listScreen.col.grid.5's children need 153 down and it has 140, so …avail runs past its end".**
   - *Cause:* a fixed card height, while "Nearly sold out" cards carry an extra line.
   - *Fix:* raised the height from 176 to 196.
   - *Judgement:* correct finding, with good naming of the views involved.
9. **R5: `getByRole("button", { name: "Pay $246.00" })` got no element.**
   - *Cause:* my arithmetic; the total was $245.
   - *What the platform said:* the failure added "motion is still in flight … (Spring on lift of app.hallScreen.foot.0, a ChoiceBar)". That was a red herring. The same hint appeared on two later failures that had nothing to do with motion.
   - *Judgement:* my error. The hint is well meant, but it shows up whenever any spring anywhere is moving, including on a hidden screen.
10. **Layout after a press: "app.checkoutScreen.form.main.saved.cards.1.2's text needs 185 wide and has 83 — it runs past its box (wrap is off)".**
    - *Cause:* "Mastercard ending 4444" on a phone.
    - *Fix:* stacked the title over the expiry.
    - *Judgement:* a correct finding I wouldn't have spotted myself.
11. **Notes I never explained:** "the runtime said: onChange on app.5._focus: 'g' changed again in the same settle chain — a ring of change handlers". The same appeared for `_focusMove: 'at'`. These names aren't mine; they look like the library's focus ring. I ignored them. **Unsure** whether my code provoked them.
12. **Seen running, not reported by any check: the phone postcode message hidden under the pay bar.**
    - *What I'd built:* `PayBar` pinned with `ignoreScroll = true, ignoreLayout = true, y = end`.
    - *What happened:* Playwright's `toBeVisible` passed, but the screenshot showed the message under the bar.
    - *Fix:* first a scrolling pane that ends at the bar. That still hid it when focus moved to Country in the same row, so I then made each field bring itself into view when a message arrives under it.
    - *Judgement:* my design. But the occlusion of a field by pinned chrome is something a layout check could plausibly report. The verify docs do say pinned chrome is "behind it by design", so this is deliberate on your side.
13. **Tab from the hall heading went to the side panel, not the seats.** `document.activeElement` was the scrolling side pane itself; its text was the whole panel's content.
    - *Cause:* tree order. The heading was in the side panel, which comes after the hall.
    - *Fix:* a `tabOrder()` override.
    - *Judgement:* my structure was the cause of the ordering. **Unsure** why the scrolling pane itself became a focus target: Chrome's own keyboard-focusable scrollers, or the platform?
14. **After the service refused the postcode (422), focus went to "Security code", not "Postal code".**
    - *Cause:* my `refusedWith` cleared the code whenever `body.field != "cvc"`, meant for declines. That left an empty required field, which then came first.
    - *How I found it:* I added `console.log` of `drive.requests()` and the focused element to the script.
    - *Judgement:* entirely my bug.
15. **`restoresFocusTo` pointing at the seat group (a `focusScope = stop` View) left focus on the page body after removing a seat from the list.**
    - *Fix:* point it at the Continue button, or the heading when the choice is empty.
    - *Judgement:* **unsure.** The docs say a stop container "that answers nothing takes focus itself, at its entry". I named the container as the target rather than letting it answer nothing, and perhaps that is the difference.
16. **Sign-out focus didn't move.**
    - *What I wrote:* `focusAfterSignOut() { if (Focus.getFocus() != null) return; … }` inside an `afterSettle` after `me.clear()`.
    - *What happened:* focus still reported the now-hidden Sign out button.
    - *Fix:* also treat focus on that button as "lost".
    - *Judgement:* **unsure.** The docs say focus is cleared when its view is hidden; it may happen a turn later than `afterSettle`.
17. **`format = "text"` on the DELETE session source.** I set it pre-emptively, fearing a 204 with no body would count as "unreadable". I never tested without it, so I don't know whether it was needed.

## (e) Verifying it

- **Rungs 1–3** (`declare-verify --rung=3`) ran after every edit. They take seconds and their messages name the fix.
- **Rung 4** (`--phone --desktop`) gave the layout findings, and its "not built" list caught the missing `PayBar`.
- **`declare-look --url … --click 'app."Orchestra, row B, seat 14"' --shot`** was the fastest way to see a state. Clicking a view by its accessible name is excellent.
- **Three assert scripts** against the dev server, using `--url` because the session cookie needs `127.0.0.1`:
  - the phone journey: 31 assertions;
  - the desk keyboard journey: 33;
  - the edges: 17.

  `drive.hold({ path: "/api/events" })` made the 409 race reproducible by holding the live feed back. `expect.request(…, { count })` proved the double-Enter case sends once. I added screenshots through `page.screenshot` behind an environment variable, and **those pictures caught three things no assertion did**: the hidden postcode message, the decline banner far from Pay, and the ticket's dead space.
- **`declare-look --semantics`** printed the screen-reader tree, and confirmed the seats as toggles named "Orchestra, row A, seat 13" with the price as the hint.

**How well the tools served me:** very well overall. The gaps were:
- `toBeVisible` doesn't account for occlusion by pinned chrome;
- the motion hint on unrelated failures misled me twice;
- live-service state accumulates, and the tool warns about this honestly;
- I never used the Inspector or `__declare.explain`, because nothing mysterious enough came up.

## (f) Confidence

**High:**
- The list.
- Seat choice and its summary copy ("3 seats · $240.00").
- Live updates and the "taken" notice.
- Sign-in mid-checkout with nothing lost.
- Saved cards, including the expired one shown and disabled.
- The decline, the field-level 422, the 409 race, one send per press, and the tickets.
- The session across a reload, and signing out.

**Medium:**
- **Phone keyboard behaviour.** Built on `App.keyboardHeight`; never seen with a real keyboard.
- **Autofill of card and address,** including the country Combobox picking from autofilled text.
- **Real screen-reader use.** There are 648 toggles in one group, and the hall comes before the heading in reading order.

**Where I'd expect a tester to find problems:**
- **Duplicate accessible names.** While the sign-in sheet is open at checkout, two "Sign in" buttons and two "Email" fields exist. My own tests scoped to the dialog or used `.first()`. I never checked whether the background is hidden from role queries.
- **The caret in the card-number field** when editing mid-string. Regrouping probably sends the caret to the end.
- **Mid widths (900–1100px).** I never checked them.
- **Seat size on a desk.** Seats are about 17px at 1280×800. That's fine for a mouse, small for unsteady hands.
- **The amber notice fill** arguably bends "one accent colour".
- **Past performances.** 13–14 Nov are bookable because the service sells them.
- **Performance.** 648 seats, each with two Springs, were never profiled.

## (g) Gaps I worked around

1. **Keeping the order summary in sight while the form scrolls.**
   - *Wanted:* something like `position: sticky`.
   - *Where I looked:* nowhere; I didn't read 07 Scrolling.
   - *Did instead:* split the desk checkout into a scrolling fields column beside a fixed summary column.
   - *Judgement:* it may exist and I didn't look.
2. **Bringing a field and the message under it into view above pinned chrome.**
   - *Wanted:* a bottom inset on scrolling into view.
   - *Where I looked:* `scrollIntoView`'s entry says its inset is top-only and to "reveal the view that holds both".
   - *Did instead:* made the phone checkout's pane end at the pay bar, and had each field reveal its enclosing `Field` when an error arrives, walking up with `instanceof Field`.
   - *Judgement:* a genuine small lack, I think. Unsure.
3. **Arrow keys in two dimensions over seats.**
   - *Where I looked:* the docs say to bind the arrows yourself, and I did: `keyBindings` for Up and Down plus `focusEntry()`.
   - *The awkward part:* finding the seat view to focus meant walking `childViews` three levels and casting with `(v as SeatMark).seatId != null`.
   - *Judgement:* I'd want a lookup of a replicated view by its record's id. The guide's advice ("look among the replicating parent's children") suggests no such lookup exists.
4. **A one-shot "kick" on change** (the summary lifting when the count changes).
   - *Did instead:* `liftTo = 1; afterDelay(120, () => { this.liftTo = 0 })` with a Spring following.
   - *Judgement:* `Animator` might do it properly; I didn't read 21 Motion.
5. **Formatting the card number with a sane caret.**
   - *What I used:* `admit` returns regrouped text. I added a hack: if a deletion removed only a space, I also remove the preceding digit, using `this.text` as the previous value.
   - *Judgement:* `select()` exists, and I could probably have placed the caret myself. I didn't try.
6. **Country with autofill:** found `Combobox purpose = country` in the library source. The platform has it; I only failed to find it through the docs.
7. **A pending indicator inside the Pay button.** I kept the label constant (the brief fixes the copy) and added a status line under it. There may be a progress control I didn't check.

## (h) Changes of direction

1. **Phone pay bar.**
   - *First:* an App-level overlay (`ignoreScroll`, `y = end`, padding raised by `keyboardHeight`).
   - *Became:* an in-flow bar under a scrolling pane, with the whole screen's height reduced by `keyboardHeight`.
   - *When and why:* late, after a screenshot showed an error hidden under the bar.
2. **Desk checkout.**
   - *First:* the whole page scrolled.
   - *Became:* a scrolling fields column beside a fixed summary.
   - *Why:* my second look, against the brief's "never out of sight".
3. **The hall's side panel.**
   - *First:* one scroll pane that included the summary and Continue.
   - *Became:* an info pane plus a pinned foot.
   - *Why:* the brief says the summary is "always visible".
4. **The decline banner.**
   - *First:* at the bottom of the form.
   - *Became:* just above the payment choice, scrolled into view when it appears.
   - *Why:* a screenshot.
5. **Where the phone hall opens.**
   - *First:* scrolled to the top, which showed the stage.
   - *Then:* the front rows.
   - *Finally:* the best free seat.
   - *Why:* screenshots, the last one of a near-full house.
6. **Reading the hall on a phone.** I added seat numbers inside seats and row letters in the aisle when zoomed in, after a phone screenshot.
7. **Front-row radius** went from 10.5 to 13 seat-widths, because the front rows wrapped too far around the stage.
8. **Duplicate "Sign in" buttons.** The top bar's button is hidden at checkout so its name isn't duplicated. This was my own worry about strict locators.
9. **Saved-card rows** went from one line to two, after the layout finding.
10. **Where focus goes after removing a seat:** first the seat group, then Continue or the heading (see d15).
11. **Clearing the security code** in `refusedWith`: first on any refusal not about the code, then only on a decline (see d14).
12. **Before writing code**, I chose to draw seats from Views rather than `draw()`, and to open the phone hall zoomed in with an overview map rather than open on an overview that you tap to zoom. The second was a test-friendliness and safety judgement.

## (i) The code, quoted

These are reconstructed from the session, with exact messages where I have them.

- **d1:**
  ```
  schema Section [ key: string, name: string, priceCents: number, feeCents: number, rows[]: SeatRow ]   // venue.declare
  class Section [ width = 100%, title: string = "", layout: SimpleLayout [ axis = y, spacing = 14 ], Text [ … text = { classroot.title } ] ]   // venue-checkout.declare
  ```
  → `'Section' is declared twice — in "venue-checkout.declare" and "the app" [DECLARE5001] (line 132, col 1)`
- **d2:**
  ```
  class MiniMap [ hall: Hall = null, pane: View = null, … ]
  ```
  → `MiniMap.hall's default expects a Hall — declared without '?', so never empty; write 'Hall?' to let it be null, got 'null' [DECLARE2000] (venue-hall.declare:352:18)`
- **d3:**
  ```
  Text [ fontWeight = { classroot.strong ? semibold : regular }, … ]
  ```
  → `'semibold' is one of fontWeight's values — bare only as the whole value (fontWeight = semibold); inside { } write it as a string: "semibold" — 3 sites … [DECLARE4005] (venue-parts.declare:121:108)`
- **d4:**
  ```
  class TicketCard [ …, code: View [ …, Text [ fontSize = 13, text = { "Ticket " + (rowIndex + 1) + " of " + classroot.count + " · Order " + classroot.order } ] ] ]
  ```
  → `warning: Text reads rowIndex, but Text is not replicated — that is its own rowIndex, never the row's … parent.rowIndex (one level up), or classroot.rowIndex … [DECLARE4023] (venue-parts.declare:351:13)`
- **d7:**
  ```
  focusHeading() { const h = … : app.screen == "checkout" ? app.checkout.heading : … }
  ```
  → `'heading' is not a member of PayForm — a child's is: 'main.top.heading' (reached through the child that holds it) [DECLARE6001] (line 346, col 55)`
- **d9:**
  ```js
  await expect(page.getByRole("button", { name: "Pay $246.00" })).toBeVisible();
  ```
  → `got no element (after 5 s) — motion is still in flight on the program's clock … (Spring on lift of app.hallScreen.foot.0, a ChoiceBar)`
- **d13:** `HallScreen` children in this order: `phoneHead`, `stage` (holding the hall and its seats), `side` (holding `title: PerfTitle` with the heading). After the heading had focus, `drive.tab()` focused the side pane itself. The script's `toMatch` failed with that pane's entire text content.
- **d14:**
  ```
  refusedWith(body: Refusal) {
      if (body.error == "unavailable") { app.seatsLost(body.conflicts ?? [], body.message); return }
      if (body.error == "signed_out") app.me.clear()
      if (body.field != "cvc") { app.cvc = ""; app.savedCvc = ""; …judged = false }
  }
  ```
  After a `422 postalCode`, `document.activeElement` was "Security code".
- **d15:**
  ```
  side: View [ …, restoresFocusTo = { classroot.stage.hall.seats }, … ]
  ```
  `seats` is a View with `focusScope = stop` and `focusEntry()`. After clicking a `Control` labelled "Remove Dress Circle, row A, seat N", the focused element was the page body.
- **d16:**
  ```
  endSession: DataSource [ …, onLoad() { app.me.clear(); …; afterSettle(app.focusAfterSignOut) } ]
  focusAfterSignOut() { if (Focus.getFocus() != null) return; Focus.focus(app.bar.signIn) }
  ```
  → `expect(page.getByRole("button", { name: "Sign in" })).toBeFocused() — got not focused`

## Overall

**Surprises:**
- How much the compiler catches, `rowIndex` above all.
- That `Form` absorbed nearly all the checkout's hard parts.
- That replicated children inside a `ChoiceControl` just worked.
- That the "not built" list doubles as a check that every class you wrote is actually in the tree.

**Good:**
- Error messages that name the fix.
- Computed defaults.
- Datasets as the model.
- `purpose`.
- The verify ladder: `--url`, `drive.hold` and `expect.request`.
- Clicking views by accessible name.

**Bad:**
- Focus restoration after things disappear was the costliest pattern. It needed four separate fixes over perhaps five verification runs, about 15% of the checking time. To get it right the first time I'd have needed a short doc on "where focus goes when the thing that had it vanishes, and when it is reported as gone".
- Keeping things visible on a phone with pinned chrome took two rounds.
- The misleading motion hint on unrelated failures.

**What it resembles:** OpenLaszlo and Flex/MXML most of all, as its lineage says, and QML's bindings and states. Spreadsheet-style constraints rather than React's re-render. It differs from everything I know in that children come from data paths, never from loops, and every size has exactly one decider. Once that clicked, the layout was predictable.

**What I'd most want improved:**
1. A documented, testable account of focus after removal.
2. A bottom inset on scroll-into-view, or a sticky primitive if one doesn't exist.
3. A lookup of a replicated view by its record's id.
4. Layout findings that notice a field covered by pinned chrome.

**What I'd use it for:** dense, stateful, interactive interfaces like this one, such as booking, dashboards and editors, where the data model and continuity matter. I'd do so with some caution until the focus behaviour is better documented.

## 6. The names ledger

```
NAMES — eval-venue-36: 1 missed name(s), 0 collision(s), 1 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    18 · member    · heading              · PayForm                  · —                  · none         · ×1  ·   18 · resolved
         'heading' is not a member of PayForm — a child's is: 'main.top.heading' (reached through the child that holds it) [DECLARE6001] (line 346, col 55)

DECLARE-HELP MISSES (min · asked for · answered)
     2 · cache · DataSource has no member 'cache' and nothing near it — the member table: declare-help DataSource

SUMMARY: 1 of 1 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
