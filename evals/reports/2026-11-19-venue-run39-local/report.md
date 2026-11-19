# Venue run 39: Opus 5.5, Declare, on the local tree, standard

The sanity check before the release: the working tree on 2026-11-19 (`e349b316` with the
round's uncommitted changes — the layout loop, Segmented and Button sizing, Switch's
`label`, the `tint` refusal, the replication fix, `drive.call`, the calendar), at the standard
level. **24.0 min, 96 turns, 117k output tokens** (48k thinking), $9.01. Timing record:
`evals/timings/2026-11-19-venue-run39-local.txt`.

## 1. The score

**The hidden drive: 11 of 11**: a guest pays, on a phone too; a double press sends one order;
a decline then a retry; a wrong security code; a seat taken before paying and while choosing;
a signed-in saved card; a wrong password; a bad postcode; signing in midway keeps the choice.

**Seen running** (the audit's screenshots, `logs/seen/`, not filed). The list, at desk size:
the production's title in a book serif, each performance with its date block, a fill bar and
"from $35.00", "Only 79 seats left" in bold. The desk hall: the whole house in curved tiers,
the stage at the top, each section's name and price in a column at its left, a "Your seats"
panel at the right, and a legend. The phone hall: an overview of the house with a frame over
the part in view, and below it the orchestra at a finger's size in a strip that scrolls
sideways. Nothing cut off or overlapping.

## 2. The comparison

| | 35 | 36 | 37 (standard) | 38 (minimal) | **39 (standard)** |
|---|---|---|---|---|---|
| total | 23.5 | 31.9 | 25.3 | 10.7 | **24.0 min** |
| turns | 98 | 119 | 91 | 39 | **96** |
| output tokens (thinking) | 120k (52k) | 163k (84k) | 125k (58k) | 68k (30k) | **117k (48k)** |
| reading · writing · checking | 5.2 · 6.0 · 12.3 | 10.8 · 6.5 · 14.6 | 7.7 · 5.9 · 11.8 | 5.4 · 4.3 · 1.1 | **8.4 · 3.1 · 12.5** |

- **Tokens:** 117k output, 156 fresh input, 356k cache writes, 19.1M cache reads.
- **Code:** 1,622 lines in 2 files, 1,227 of Declare without comments and blank lines (Venue 37:
  1,151). **Download:** 201 KB gzip (Venue 38: 193 KB).
- **Checks:** verify 27 times (5.0 min), look 5, `declare-help` 12. Four flow scripts of its own
  against the live service (phone, keyboard alone, desk, edge cases), all passing at hand-over.
- **Source reads:** four library files (`combobox`, `form`, `textinput`, a listing), for
  `purpose = country` and the form's refusals: each answered in the reference too.

## 3. The refusals (read in the stream; each named its fix)

1. `schema Card` → "'Card' is a library class — a schema of the program can't take its name;
   rename yours, as 'VenueCard'" [DECLARE5000]. Renamed `SavedCard`.
2. A three-deep choice for the postcode example → DECLARE4025 ("a lookup in data"). Moved into
   the countries' records.
3. `semibold`/`regular` inside braces → DECLARE4005, the string spelling given.
4. **DECLARE4045, new this round, fired as meant:** an App member `codeLength` and a script
   function `codeLength` → "bare 'codeLength' names both App's member and the script { }
   function … rename one of them". Renamed the function.
5. `app.main.hallScreen.heading` → "'heading' is not a member of 'hallScreen' — a child's is:
   'hallScreen.top.heading'" [DECLARE6001]. Took the path given.
6. `iconLeft = "chevronLeft"` → at boot (R4), "no class named 'chevronLeft'". Declared
   `BackChevron extends ChevronIcon`.
7. DECLARE1002 ×2, parentheses around object literals.

## 4. Findings for the platform

Not yet reproduced in scratch programs; each is the agent's report, checked against the stream.

1. **A `tabOrder()` that leaves out an overlay breaks it, silently and far away.** With
   `tabOrder() { return [app.bar, app.main, app.aside, app.foot] }` (the sign-in `Sheet` left
   out), the phone flow's wrong-password step stopped showing the service's sentence in the
   sheet: "got no element (after 5 s)". Composing with `tabDefault()` fixed it. The reference
   says to compose, but nothing warned, and the symptom was in the sheet's form. **To do:**
   reproduce, find the mechanism (the sheet's focus scope, or its submit), and either keep
   overlays in traversal whatever `tabOrder` says or warn.
2. **A focused field under pinned bottom chrome is reported nowhere.** The postcode's error sat
   under the phone's Pay bar; verify exempts what pinned chrome covers, and `revealInset` /
   `scrollIntoView(inset)` only know chrome at the top. The agent wrote `keepFieldInSight()`.
   A focused field, or its message, under chrome deserves a finding, and the guidance a line.
3. **An icon name in a string is checked only at boot.** `iconLeft = "chevronLeft"` failed at
   R4; the compiler could check a literal at R2.
4. **No way to find a record's view across nested replication.** For Up/Down between rows,
   `seatView()` walks `childViews` three levels and casts. A `viewFor(record)`, or the guide's
   answer, is wanted.
5. **Clipped text with no finding:** a one-line `Text` past the edge of a `clip = true` ticket
   card. The new spill check reports text past its view when the parent has a ground; text cut
   by a clipping parent is not reported.
6. **Smaller:** negative `spacing` (to nest the arcs) works with no word on whether it is meant;
   the "never built" notes list library classes the program never used (noise); `names.py`
   counts "a child's is: …" as no hint, though it names the path (the tool's gap, not the
   compiler's).
7. **The keyboard flake** ("Tab never reached 'Next ticket'; ended on 'Sign in'") came while the
   bad `tabOrder` stood. The flow passed four times after the fix, and five more in the audit.

## 5. Is it idiomatic Declare?

Idiom counts (`idiom.py`):

| | Venue 37 | Venue 38 | Venue 39 | To-do |
|---|---|---|---|---|
| code | 1,151 | 1,158 | 1,227 | 841 |
| lines over 150 characters | 9 | 11 | 9 | 3 |
| colour literals outside theme declarations | 7 | 2 | 7 | 1 |
| theme reads | 68 | 86 | 78 | 69 |
| States | 5 | 2 | 0 | 7 |
| visible switches | 20 | 2 | 12 | 0 |
| branches on width or phone | 28 | 15 | 15 | 38 |
| flexes | 18 | 14 | 19 | 7 |
| browser scripts · page lookups | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 |

**In the grain:**
- **The hall is a dataset class** (`Hall`, venue.declare:38–118): the seat map with its
  questions (`freeIn`, `locate`, `describe`, `neighbour`) and its one write (`markSold`). The
  `EventStream` (395) writes into it, and every seat, count and the overview follow.
- **Where the person is:** `location` for the performance, `waypoint` for the step (437–439),
  and `screen` derived from them (441).
- **The checkout is the library's `Form`** (`PayForm extends Form`, 126) with `source =
  { app.order }`, `Field`s with `purpose`, and the service's refusals landing on fields by
  `name`; `errorSchema = Refusal` on the order.
- **Seats are controls:** `SeatButton extends Control` (parts:255), a toggle with a name and
  hint, keyboard and disabled-when-taken built in.
- **Its own layout** for the curved rows: `ArcRow extends Layout` (parts:299), one `place()`.
- **A full theme** laid over SanFrancisco, with the venue's own tokens (seat ink, stage, meter,
  ticket).

**Drift:**
- **Colour literals in views:** the error and lost-seat notes (`fill = #FBEBE2`, 284, 318, 346)
  belong in the theme beside `error`.
- **Faces as arrays:** `display` and `ui` are font-family arrays on the App (365–366), where a
  `Font` object is the form.
- **A spacer view for alignment:** `View [ visible = { app.sideLabels }, width = 96, height = 1 ]`
  (parts:360), holding the section-name column's room. A child with `padding` or the label
  column itself would say it.
- **An overlay laid by hand:** the card brand `Text [ ignoreLayout = true, x = end, y = 2 ]`
  over the card-number field (223), for want of a trailing mark inside a field: the agent
  looked, and found `iconRight` takes icon classes only. A gap worth a look beside §4.
- **The side panel placed by hand** (`x = { app.width - app.asideW }`, `ignoreScroll`) and two
  `PayButton`s with opposite `visible`, where the frame could be a `SimpleLayout` row with the
  panel in it.
- **Sign-in state on the App** (`signInEmail`, `signInPassword`, `showPassword`, 412–415) while a
  `SignInForm` class exists: the form's values belong on the form.
- **Springs nudged from `onChange`** (`fillT = 0.35` for a "pop"), which declare.md §8 warns
  against; the agent was unsure of the intended form.
- **The service's address in script:** `const API = "http://127.0.0.1:8350"` (parts:36). The
  brief names that address, so this is acceptable here, but a real app would take it from the
  host.

## 6. The agent's account

Asked by resuming the session with read-only tools and the standard questions
(`account-declare.txt`); 1 turn, 15k output tokens, counted separately from the build.

Before the account, one correction to my handover: the dev server I said was running has stopped. Its background job ended with exit code 143 after I finished, so `http://127.0.0.1:8604/my-apps/venue/venue.declare` won't answer until someone runs `PORT=8604 npm start` in `declarelang/` again. I haven't restarted it or changed anything, as you asked.

---

# Building Venue in Declare: an account for the people who make Declare

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`, the brief, and `API.md`.
2. `skill/SKILL.md`, whole.
3. `docs/declare.md`, whole.
4. Guide chapters 01, 04, 05 and 06, whole.
5. `apps/todo/todo.declare` and `todo-parts.declare`, whole.

That is everything the skill says to read first. After that I read for the plan:
- `docs/guide/14-data.md`, whole.
- The `SignUp` class in `apps/sampler/sampler.declare`.
- `declare-help Form --all`.
- `19-accessibility.md`, `08-controls.md` and `18-overlays.md`, whole.
- About the first 300 lines of `10-touch.md`.
- `docs/operational/verify.md`, whole.
- `17-your-own-views.md` § Writing a layout.
- Around 40 `declare-help` lookups, including `focusScope`, `scrolls`, `TextInput.purpose`, `TextInput.concealed`, `DataSource.credentials`, `EventStream`, `StreamMessage`, `Combobox` (and its source, for `purpose = country`), `ChoiceItem`, `App` (where I found `keyboardHeight`, `revealInset`, `underlapBottom` and `safeBottom`), `scrollTo`, `tabOrder`, `iconRight` and `Layout`.

**What I skipped, and why:**
- Guide chapters 02, 03, 07, 09, 11, 12, 15, 16, 20, 21, 22 and 23.
- The tracker, calendar and weather apps, and `intake.md`.

The skill says "Then stop reading", and I took it at its word, reading the rest only when a need came up. Three skips cost me something, or could have:
- **20-urls:** I used `location` and `waypoint` from their `declare-help` entries alone. It worked, but I never learned how arrival behaves.
- **09-pointer-and-keyboard:** I wrote my `keyBindings` from the one-line `focusScope` entry. It worked first time, which says the reference is good, but I may have missed idioms.
- **07-scrolling:** I found `scrollToX` only inside the `scrollTo` entry.

**What taught me the most:**
- **The `Form` reference prose.** `refusedWith` describes my exact case: "A field emptied for a fresh try that the refusal does not name (the security code after a declined card) is set back with `judged = false`". The refusal-onto-field-by-`name` behaviour meant the service's 422s needed no code from me.
- **`declare-help TextInput.purpose`**, which maps purposes to autofill names and phone keyboards.
- **The todo app's App-level layout,** whose pinned bars use `ignoreScroll`.
- **This line in `10-touch.md`**, which decided the phone seat-picking design in one sentence: "Many small targets close together belong in a scroller, at a finger's size — each at least 44 points, in a pane that `scrolls`, rather than fitted to the screen and zoomed into."

**What was missing or misleading:**
- **Nothing outright misleading.**
- **Keeping a focused field clear of a pinned bar at the bottom.** `revealInset` and `scrollIntoView(inset)` are both about chrome at the top. I found nothing on chrome at the bottom.
- **`tabOrder`'s warning was easy to skim past.** Its reference says "Compose with `tabDefault()` rather than rebuilding the list", but I read it and still wrote a fixed list (see (d), item 19).

## (b) Expressing what I wanted

**Where it fit well:**
- **Data and live updates.** The `Hall extends DataSource` class is the seat map plus its questions (`freeIn`, `locate`, `describe`, `neighbour`) and its one write (`markSold`). The `EventStream` writes into it, and every seat, count and the overview map follow with no update code. This is the language at its best.
- **Checkout defaults.** Writing `email: string = { app.account?.email ?? "" }` gives exactly "fill from the account unless the person typed". Signing in halfway through came free once all values lived on the App.
- **Each seat as a control.** `SeatButton extends Control` with `accessibilityRole = toggle` and a label/hint gave the exact accessible names the brief requires, plus keyboard activation and disabled-when-taken, in about 20 lines.
- **Library pieces that just fitted.** `Combobox [ purpose = country ]`, `ChoiceControl`/`ChoiceItem` for the cards, `Sheet` with `shown`/`commit`, and `Carousel` with `page <-> app.ticketPage`.
- **The hall's arcs.** A custom `Layout` (`ArcRow`) is one `place()` method.

**Where I worked around it:**
- **Up/Down arrows between rows.** These need finding a seat's view from its id three replication levels down (see (g)).
- **The brand mark beside the card number.** I overlaid it rather than putting it inside the field.
- **A bank's refusal that should go away when the card changes.**
- **The fixed side panel on wide screens.** I placed it by hand (`x = { app.width - app.asideW }`, `ignoreScroll`). That edges toward the skill's "placing everything by hand" warning.
- **One Pay button in two places.** It sits in the side panel on desk and the bottom bar on phone, so I wrote two `PayButton`s with opposite `visible` conditions.

## (c) The first time it ran

The first boot failed (the `chevronLeft` icon, below). Once it booted, `declare-look` against the served URL showed:

1. **The list:** fine at both sizes.
2. **The desk hall:** each row's curve cost a full extra row of height, so on a laptop the house ran well past the bottom of the window.
3. **The phone hall:**
   - The overview map's dots were crushed vertically: I'd set its height to `width * 0.42`.
   - The stage was drawn about 985px wide.
   - The pane of seats opened scrolled to the left of centre.

I found every one of these by looking at screenshots. None was a reported layout finding. After fixing them, the desk flow's screenshots showed the next round: chosen seats not drawn as chosen, the balcony still cut off at 800px tall, and a dead dark band at the foot of the ticket.

## (d) Every refusal and surprise

Verdict key: **mine** means my code was wrong; **docs** means the docs could have prevented it; **platform** means I think the platform could do better. The verdict comes last in each entry.

1. **A schema named `Card`.**
   - What I wrote: `schema Card [ id: string, brand: string, last4: string, expMonth: number, expYear: number ]`
   - What it said: `'Card' is a library class — a schema of the program can't take its name; rename yours, as 'VenueCard' (the library's is used as 'Card [ … ]') [DECLARE5000]`
   - What I changed: renamed it `SavedCard`.
   - Verdict: **mine.** `declare.md` says schemas share the classes' namespace. The message was excellent.

2. **A choice nested three deep.**
   - What I wrote: `placeholder = { app.country == "US" ? "94103" : app.country == "CA" ? "K1A 0B1" : app.country == "GB" ? "EC1A 1BB" : "" }`
   - What it said: DECLARE4025 lint, "a choice keyed by a value … is a lookup in data".
   - What I changed: moved `postalExample` into the countries records.
   - Verdict: **mine.** It was good advice; the code is better for it.

3. **Redundant parentheses.**
   - What I wrote: `theme = { ({ ...SanFrancisco, ...Venue }) }`, and the same around the session body and `contents`.
   - What it said: DECLARE1002 hint, redundant parentheses.
   - What I changed: removed them.
   - Verdict: **mine**, a JavaScript habit (parenthesising an object literal so an arrow function returns it).

4. **A bare token inside braces.**
   - What I wrote: `fontWeight = { classroot.nearlyGone ? semibold : regular }`
   - What it said: `'semibold' is one of fontWeight's values — bare only as the whole value … inside { } write it as a string: "semibold" [DECLARE4005]`
   - What I changed: quoted both.
   - Verdict: **mine.** `declare.md` §2 says exactly this, and I'd read it.

5. **A name meaning two things.**
   - What I wrote: script `function codeLength(b: string)` alongside an App member `codeLength: number = { codeLength(...) }`.
   - What it said: `bare 'codeLength' names both App's member and the script { } function … rename one of them [DECLARE4045]`
   - What I changed: renamed the function `codeLengthFor`.
   - Verdict: **mine.** Good message.

6. **A wrong path to a heading.**
   - What I wrote: `app.main.hallScreen.heading` (and the checkout one).
   - What it said: `'heading' is not a member of 'hallScreen' (a View) — a child's is: 'hallScreen.top.heading' [DECLARE6001]`
   - What I changed: used the path it named.
   - Verdict: **mine.** Suggesting the real path is superb.

7. **A guessed icon name, at boot.**
   - What I wrote: `Button [ label = "All performances", iconLeft = "chevronLeft", … ]`
   - What it said, at R4: `boot: onInit on app.bar.…._run.ico threw: createView: no class named 'chevronLeft' — declare the class, include its library, or keep it with 'use [ chevronLeft ]'`
   - What I changed: added `class BackChevron extends ChevronIcon [ dir = "left" ]`, copied from the `iconLeft` reference.
   - Verdict: **mine** (I guessed a name), but also **platform.** The value is a string literal, so the compiler could have checked it at R2 the way it checks `toolbar["share"]`.

8. **Chosen seats not drawn as chosen.** This came from a screenshot, not a diagnostic.
   - What I wrote: the "yours" fill was drawn only from `fillT`, and the state was `state = { classroot.gone && !classroot.mine ? "gone" : "free" }`, with `Spring [ attribute = fillT, to = { classroot.mine ? 1 : 0 } ]`.
   - What happened: under the script's held clock (no `settleMotion` before the shot) the spring hadn't moved, so a chosen seat looked free. With reduced motion or a slow frame the same would happen to a person.
   - What I changed: `state` now includes `"mine"`; the spring rests at 1, and `onChange` on `mine` sets `fillT = 0.35` so the seat pops in.
   - Verdict: **mine.** The deterministic clock exposed a real design flaw, which I count as a strength. My fix uses `onChange` to kick a spring, which `declare.md` §8 arguably warns against ("never … to move one (a Spring)"). Unsure whether there's a sanctioned way to give a value a nudge.

9. **Each row's curve added height.** Seen in a screenshot.
   - What I wrote: `ArcRow` returned seat boxes with `y = bow * (1 - ((mid - cx)/(full/2))²)`, and rows were stacked with `SimpleLayout [ axis = y, spacing = 1 ]`. Each row's box is `pitch + bow` tall, so the curves didn't nest inside each other.
   - What I changed: `spacing = { (app.touchFirst ? 2 : 1) - app.pitch * 0.45 }`, a negative spacing.
   - Verdict: **mine**, but **unsure** whether negative spacing is supported. It works and nothing warned.

10. **The phone's pane of seats not starting centred.**
    - What I wrote: `hall: Hall [ onLoad() { afterSettle(() => app.centreHall()) } ]`, with `centreHall() { pane.scrollToX(Math.max(0, (pane.contentWidth - pane.width) / 2)) }`.
    - What happened: the overview's frame showed roughly 0.17–0.4 of the house instead of the middle.
    - What I changed: `hallWidth: number = { app.pane.contentWidth }`, plus `trackChanges` on it that calls `centreHall()`.
    - Verdict: **unsure.** My guess is that `contentWidth` wasn't final when `afterSettle` ran after `onLoad`, perhaps because the seats are built over more than one settle. I didn't confirm it.

11. **The overview map cramped.** My own geometry: height `width * 0.42`, and dots sized by horizontal pitch only. Changed to `0.66` and `Math.min(p, rowH)`. **Mine.**

12. **The house still cut off on an 800px-tall laptop.** I had `pitch: number = { app.touchFirst ? 44 : 22 }`, then `24 : 20` by height. It became `deskPitch: number = { app.height >= 900 ? 22 : app.height >= 840 ? 19 : 17 }`, with tighter gaps and the section names moved into a side column. **Mine.**

13. **Dead space at the foot of the ticket.** I had `deck: Carousel [ … height = 500 ]`, with the card content about 386px tall. Changed to height 430, the white barcode panel `flexes = true`, and `TicketCard [ height = 100% ]`. **Mine.** Unsure whether `height = 100%` on a carousel page was needed, since the carousel already sizes its pages.

14. **"6:45pm — arrive by then to be seated" ran off the ticket on a phone.**
    - What I wrote: a `Text` with no `width` inside a `clip = true` card.
    - What happened: the text overflowed and was clipped.
    - Verdict: **mine.** `06-layout.md` is explicit that a `Text` with no width is one line. I'll note that no layout finding fired at R5, I'd guess because the card clips; checking a phone screenshot is what caught it.

15. **A field's error hidden under the phone's Pay bar.**
    - What happened: the postcode's "Enter a postcode like EC1A 1BB." sat under the pinned bar (screenshot `p8`). No finding fired, which `verify.md` says is by design: "What an open overlay or pinned chrome lies over is behind it by design, and not reported."
    - What I changed: added `keepFieldInSight()`. It tracks `focusedView` and, when a `TextInput` inside the pay form takes focus on a phone, calls `v.scrollIntoView("start", true, app.barH + 40)`.
    - Verdict: **platform**, in two ways: a gap in the guidance, and the checker's exemption hides exactly this failure. A field that has focus, with its message under pinned chrome, deserves a finding.

16. **The decline sentence stayed after switching to a new card.** `Form.error` holds until the next submit. I added `refusedCard` and `cardKey`, so `payError` shows only while the refused card is still the one chosen. Verdict: my design gap; the **platform** behaves as documented.

17. **A layout finding I was glad to get.**
    - What it said: `layout after press at (316, 416): 1 control(s) smaller than 44 × 44, a finger's target: app.main.checkoutScreen.phoneOrder.2 136×40.`
    - What I wrote: `Button [ label = "Change seats", height = 40, … ]`.
    - What I changed: height 44.
    - Verdict: **mine.** An excellent catch.

18. **Mistakes in my test scripts.** All **mine**, and the messages were very good:
    - **Wrong amount.** I expected "Pay $232.00"; the real total was $245.00.
    - **Ambiguous text.** `page.getByText("Mastercard")` "matches 2 elements … app.main.checkoutScreen.form.savedCards.1.1.1 (Text) … numberBox.brandTag (Text)".
    - **Pending too short to see.** "Processing your payment…" wasn't visible because a step waits for the reply; I switched to `drive.hold`.
    - **The hold caught my own purchase.** My `page.evaluate(fetch(… /api/orders))` stalled: "an evaluate in the page has not finished in 30 s, though the page answers — it is waiting on something that never comes". I moved that purchase to Node.

19. **The custom tab order broke the sign-in sheet.** This is the sharpest edge of the build; full detail in (i).
    - What I wrote: `tabOrder() -> View[] { return [app.bar, app.main, app.aside, app.foot] }`
    - What happened: the phone flow, which had passed, now failed. `expect(page.getByRole("dialog").getByText("That email and password don't match.")).toBeVisible() — got no element (after 5 s)`. No diagnostic pointed anywhere near `tabOrder`.
    - What I changed: `[app.bar, ...this.tabDefault().filter((v) => v != app.bar)]`.
    - Verdict: **mine**, since the reference said to compose with `tabDefault()`. But the failure was silent and far from its cause, so **platform** too: dropping an overlay from traversal could warn. I never established the mechanism, whether the submit never ran or its result never showed.

20. **The keyboard flow failed once.** `Tab never reached /^Next ticket$/; ended on "Sign in"`. This was while the bad `tabOrder` was in place. After fixing it, the flow passed four times in a row. **Unsure** whether the two are related.

21. **The dev server stopped at its time limit, twice.** That's my environment, not Declare.

## (e) Verifying it

**The checks:**
- `declare-verify --rung=3` after each edit: caught items 1–6.
- `--phone --desktop --rung=4`: caught item 7.
- `declare-look --url … --shot` at 1280×800, 768×1000 and 390×844 with touch: caught (c) and items 8–16, by looking.
- `--semantics`: confirmed `toggle "Orchestra, row A, seat 4" hint "Sold" [not pressed, disabled]`, which led me to change "Sold" to "Taken" to match the legend.
- Four assert scripts using `--url`: desk, keyboard, edges and phone.

**How the tools served me:**
- **Very well overall.** Playwright locators by role and name inside the same harness, `expect.request`, `drive.hold` and `drive.requests()` covered "sends once" and "never reaches the service" directly. The live-service note ("this run failed after talking to … which earlier runs wrote to") was perceptive.
- **Static layout checks missed nearly all my visual problems.** Only one real finding fired (item 17). Screenshots found everything else.
- **One source of noise.** The "never built … ArrowIcon, CheckIcon, … ShortcutsPanelRow" lists name library classes I never used.

## (f) Confidence, part by part

**Overall:** high that the brief's flows work as written, because they ran against the real service; moderate on taste and on real devices.

- **§1 Performances:** high.
- **§2 Seats:**
  - Picking and unpicking, the summary wording, and live seat-taking: high.
  - Distinguishable without colour: high by construction (open seat, solid seat with a check, small ×), but I didn't run a colour-vision simulation.
  - Keyboard: Right from the last free seat in a row jumps to the next row, which a tester may find odd.
- **§3 Signing in:**
  - Flow, the service's sentence, reload and sign-out: high, all tested.
  - The browser's password manager recognising the form: **untested.** I didn't check whether Declare renders a `<form>` element.
- **§4 Paying:**
  - Logic: high.
  - "Required is apparent": moderate. I used one sentence ("Every field is needed unless it says optional") plus the "(optional)" label, with no per-field required marks.
  - Phone keyboards and autofill: I verified the `autocomplete` tokens but not `inputmode`, and nothing on a real device. The field-in-sight fix is unproven against real iOS or Android keyboards.
- **§5 Tickets:** they work. The Code 39 barcode is my own implementation and has never been scanned.

**Where I'd expect a tester to find problems:**
1. **Two "Sign in" buttons on the checkout page** (the bar and the form). A strict `getByRole("button", { name: "Sign in" })` would fail as ambiguous; my own phone script had to scope it to `main`.
2. **Seats are `toggle`s**, which is ARIA `button` with `aria-pressed`. A test looking for `checkbox` would find nothing.
3. **The continue button is named differently by size:** "Continue" on phone, "Continue to checkout" on desk.
4. **The Pay button's label doesn't change while paying.** That goes against the `Form.pending` advice ("say so in its label"). I did it deliberately so locators stay stable; the progress bar and status text carry "under way".
5. **Two hidden "Security code" fields** exist, saved-card and new-card, only one visible at a time.

## (g) Gaps I worked around

1. **Finding a seat's view by its id**, for Up/Down arrows.
   - Where I looked: the `focusScope` reference (bind arrows yourself), and 14-data, which says to look among the replicating parent's children.
   - What I did: `seatView()` walks `house.childViews → section.childViews → row.childViews`, casting `(v as SeatButton).seatId`.
   - Judgement: probably a real gap. Something like `viewFor(record)` would help. Unsure whether kernel API (`blocksOf`) is the intended answer.

2. **A mark inside a text field** (the card brand).
   - Where I looked: `iconRight` takes icon class names only.
   - What I did: a `Text` with `ignoreLayout = true, x = end, y = 2` over the label line.
   - Judgement: unsure. It may exist, and I didn't look at `Field`'s source.

3. **Bottom-aware reveal of a focused field.**
   - Where I looked: `revealInset` and `scrollIntoView` (top inset only), and `keyboardHeight`.
   - What I did: `keepFieldInSight`.
   - Judgement: probably a gap.

4. **Clearing a form's refusal when its cause changes.** I wrote a derived `payError`. Probably fine as is.

5. **Telling the row letters apart from seats in a layout.** `ArcRow` treats `laid()[0]` and `laid()[last]` as the letters, which relies on replicated seats landing where they're declared. It worked; I found nothing documenting that order. Unsure.

6. **A one-off "pop" when something is chosen.** I kicked springs (`pulse = 1`, `fillT = 0.35`). Unsure whether there's an intended form for this.

7. **A side panel that stays put on wide screens.** I placed it by hand. A `ResponsiveLayout` with a fixed child might have been the idiom; I didn't try it.

## (h) Changes of direction

1. **The "yours" seat:** drawn only by a spring → explicit state plus a pop. Prompted by a desk screenshot mid-session.
2. **Hall rows:** stacked full-height → nested with negative spacing. Section names above the seats → in a side column on desk → in a side column only where it fits. Prompted by screenshots at 1280 and then at 768.
3. **The seat glyph:** a cushion with a dash inside, which looked like a drawer icon → a filled back band, so it reads as a chair from above. My own second thoughts, from a screenshot.
4. **Desk seat size:** fixed 22 → by window height in two steps. Prompted by screenshots.
5. **Centring the phone's pane:** `onLoad` plus `afterSettle` → `trackChanges` on the content width. Prompted by a screenshot.
6. **Tab order:** a fixed list → `tabDefault()` composed. Prompted by the regression in the phone flow.
7. **Keeping fields in sight:** keyed on `screen == "checkout"` → `payForm.containsFocus`. Done at the same time as 6; scoping it away from the sign-in sheet was a suspected cause of that regression, but the phone flow still failed until the tab order was fixed.
8. **The ticket:** fixed height with dead space → a flexing barcode panel. Prompted by a screenshot.

## (i) The code, quoted

**The tab-order regression**, reconstructed. The sheet, unchanged throughout:
```declare
signInSheet: Sheet [ accessibilityLabel = "Sign in", shown = { app.signingIn },
    commit(open: boolean) { app.signingIn = open },
    SignInForm [ exists = { app.signInSheet.present }, width = { Math.min(400, app.width - 32) } ] ],
```
The App member I added:
```declare
tabOrder() -> View[] { return [app.bar, app.main, app.aside, app.foot] },
```
The step that failed, in order: tap Sign in in the form, fill email and a wrong password, tap the "Show password" checkbox (`press at (89, 736)`), tap Sign in in the sheet (`press at (197, 796)`). The message:
```
expect(page.getByRole("dialog").getByText("That email and password don't match.")).toBeVisible() — got no element (after 5 s) — at tests/flow-phone.mjs:66
```
The fix: `tabOrder() -> View[] { return [app.bar, ...this.tabDefault().filter((v) => v != app.bar)] }`.

**Centring the pane**, as first written:
```declare
hall: Hall [ onLoad() { afterSettle(() => app.centreHall()) } ],
centreHall() { pane.scrollToX(Math.max(0, (pane.contentWidth - pane.width) / 2)) },
```
At 390×844 with touch, the overview frame drew at about 0.17–0.40 of the house instead of the middle.

**The keyboard flake:**
```
Tab never reached /^Next ticket$/; ended on "Sign in"
```
This came after paying with the keyboard alone. Focus was on the "You're going." heading (`focusable = quiet`), while the bad `tabOrder` above was in place.

**The icon boot error:**
```
iconLeft = "chevronLeft"
boot: onInit on app.bar.…._run.ico threw: createView: no class named 'chevronLeft' — declare the class, include its library, or keep it with 'use [ chevronLeft ]'
```

## Overall

**Surprises:**
- How much of a shop the library already is. `Form` source and refusal mapping, `purpose`, `concealed`, `Combobox` autofill matching and `Sheet` focus handling together took most of §3 and §4 off my hands.
- Clean through R3 within six rounds of fixes, every one named exactly.
- Most of my real problems were visual, and only screenshots caught them.

**Good:**
- The diagnostics, which name the fix and often the right path.
- Derived state and computed defaults.
- `DataSource` plus `EventStream` as data.
- The test harness: Playwright locators, `drive.hold`, `expect.request`, and a deterministic clock.
- `declare-help` answering almost every question in seconds.

**Bad:**
- Silent failures from structural overrides (`tabOrder`).
- Static layout checks that see little of what goes wrong in a real hall, ticket or form.
- Nothing about chrome at the bottom of the screen.
- Icon names checked only at boot.
- Reaching a deeply replicated view is awkward.

**What it reminded me of:**
- **OpenLaszlo/LZX**, plainly: datapaths, replication, states, constraints.
- **QML**: property bindings, `State`, `Behavior`-like springs.
- **SwiftUI**: declarative overlays bound to state.
- **A spreadsheet**, in the way derived values simply hold.

It differs from React in having no render cycle and no hooks: I never once thought about re-rendering. It differs from CSS in that every size has one decider, which made the layout problems I did have easy to reason about once seen.

**Where I'd most want improvement**, with costs:
1. **A finding when focus, or a focused field's message, sits under pinned chrome.** This was one obstacle, about 30 minutes. To get it right the first time I'd have needed a sentence in the guidance plus a bottom-aware `scrollIntoView`.
2. **A warning when `tabOrder` drops an overlay or content that is shown.** This was the sharpest edge: one obstacle, about 20 minutes and a confusing detour, because the symptom appeared in a sheet's form, far from the cause. A diagnostic would have saved all of it.
3. **Checking literal icon names at compile time.**
4. **Finding the view for a record** across nested replication.

The broader pattern, rather than any single obstacle, was the gap between "compiles and boots clean" and "looks right". It cost me roughly a third of the session in screenshot rounds. That's not unreasonable for a seat map, but more layout findings (text clipped by a clipping parent, content past the first screen on a laptop) would shorten it.

**What I'd use it for:** form-heavy consumer flows like this one, internal tools, and interactive diagrams or surfaces such as seat maps, schedules and dashboards, where live data and continuous motion matter. I'm less sure about content-heavy sites, and about anything needing a large third-party ecosystem.

## 7. The names ledger

```
NAMES — eval-venue-39: 2 missed name(s), 1 collision(s), 2 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    12 · member    · heading              · 'hallScreen' (a View)    · —                  · none         · ×1  ·   12 · resolved
         'heading' is not a member of 'hallScreen' (a View) — a child's is: 'hallScreen.top.heading' (reached through the child that holds it) [DECLARE6001] (line 477, col 54)
    12 · member    · heading              · 'checkoutScreen' (a View · —                  · none         · ×1  ·   12 · resolved
         'heading' is not a member of 'checkoutScreen' (a View) — a child's is: 'checkoutScreen.top.heading' (reached through the child that holds it) [DECLARE6001] (line 478, col 62)

COLLISIONS (min · held by · name)
    12 · library class  · Card

DECLARE-HELP MISSES (min · asked for · answered)
     2 · Spinner · 'Spinner' is not a Declare name — the Declare concept is ProgressBar.indeterminate:
     6 · FormProblem · 'FormProblem' is not a Declare name — the Declare concept is Form:

SUMMARY: 2 of 2 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
