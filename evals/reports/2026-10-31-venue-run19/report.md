# Venue run 19: Declare ea75213a, Opus 5.5, recorded, run alone

**Run:** 2026-10-31, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-19 claude-opus-5-5 ea75213a`. This is the clean run: alone on
the machine, after the two verify bugs that slowed Venue 18 were fixed (the 8.4-second role query, and settles
stuck on a request that had already answered). Builds outside this run (a Swift compile and a Rust compile of
`declare-gpu`) twice raised the load to about 8 for a few minutes; it was otherwise 3–5.

**Files beside this report:**
- the app's five files and its assert scripts (`tests/`, 361 lines);
- the hidden acceptance results, delivered and at first boot (`drive/`);
- the questions it was asked (`impressions.txt`).

Its account is at the end, word for word.

## Figures

| | Venue 17 | Venue 18 | **Venue 19** |
|---|---|---|---|
| Declare commit | 585c768d | 0727e630 | **ea75213a** |
| time | 23.4 min | 33.8 min | **26.8 min** |
| model · tool time | 17.0 · 6.5 min | 20.5 · 13.3 min | **19.8 · 6.9 min** |
| thinking (reading · writing · checking) | 3.2 · 1.8 · 2.5 = 7.5 | 5.4 · 0.1 · 5.1 = 10.6 | **5.3 · 1.4 · 4.1 = 10.8 min** |
| turns · output tokens | 109 · 108k | 113 · 132k | **105 · 128k** |
| cached input re-read | 21.5M | 21.9M | **20.0M** |
| first app write · first compile · first boot | 6.1 · 11.9 · 12.6 | 7.1 · 10.6 · 11.6 | **6.8 · 11.9 · 12.5 min** |
| failing compile rounds before clean | 4 | 6 | **4 (0.6 min)** |
| verify calls · their time | 22 · 3.5 min | 33 · 12.2 min | **34 · 6.1 min (11 s each)** |
| hidden acceptance at first boot | 2 of 11 | 8 of 11 | **11 of 11** |
| hidden acceptance as delivered | 10 of 11 | 11 of 11 | **11 of 11** |
| code, excluding blanks and `//` lines | 1,394 | 1,298 | **1,279** |

## What it shows

- **The first version that compiled was correct on all eleven hidden flows.** Across three runs, first boot went
  2 → 8 → 11. Everything after first boot (14 minutes) went on the agent's own checks: four scripts, screenshots,
  and the phone seat picker, which its account calls the hardest part.
- **Tool time is back to Venue 17's level** (6.9 min), with verify at 11 s a run. No settle waited out its time,
  and no Playwright call was refused.
- **Model time, about 20 minutes, is now the larger share and looks steady for this brief.** Thinking was 10.8 min,
  the same as Venue 18. Its longest pauses again come before the first write: 85 s at 3.0 min, 85 s at 4.6 min,
  90 s at 6.1 min.
- **The computed-axis compile rule fired again** (round 1, on `HallMap`), each size refused at its line.

## The audit

| Check | What was refused or wrong | Verdict |
|---|---|---|
| R1 | sizes on a flexing child under a computed axis | correct refusal (the new rule) |
| R2 | `semibold`/`regular` bare inside `{ }` | agent's error |
| R3 | misnamed members; `ChangeEvent.changed` called as a function | agent's errors. The `changed` slip has now appeared in four runs: the message could say "`changed` is the list of changes: `e.changed.some((c) => c.name == "…")`". |
| R4 | a `datapath` pointed at a computed record | agent's error; the message names the fix |
| R2 | **a bare `scrollTo(0)` inside a view's own method refused:** "not a member of HallMap" | **platform bug** (since fixed): your own methods resolved bare but a built-in method did not, though `declare.md` §3 says a level's "whole member set" is in scope; `this.scrollTo` compiled. Reproduced in three lines. |
| R5 ×5 | its own scripts' expectations while it built the phone picker and checkout | the app's behaviour, fixed by the agent |

Two entries in its account are judged "platform looks wrong, but unsure". Neither reproduced:
- **Its item 17,** a pinned column "roughly 90 pt too low" at 1024 pt. A first attempt seemed to reproduce it: a
  pinned `y = end` bar read y 692 while a screenshot showed it at 592. But the reading was taken in an 800-tall
  window and the screenshot in a 700-tall one. Read at the same sizes, the bar sits exactly at the window's foot
  (592 at 700, 660 at 768, 692 at 800). Not a bug; item 17 is unexplained.
- **Its item 16,** a pinned bar whose children all sat at y = 0, did not reproduce in a minimal program; the bar's own
  layout ran. Unconfirmed.

**Fixed after this run (not yet committed):**
- **A bare built-in method resolves to the node it is written on,** as a bare built-in attribute does: each level's
  member set now includes its runtime methods. A test covers bare `fetch()` and `scrollTo(0)`.
- **Calling `ChangeEvent.changed` as a function** now says: "'changed' is the list of what changed, not a
  question: e.changed.some((c) => c.name == "seat") asks whether seat did".
- **A drift already on main in the layout's runtime-fields table** (`extentRead` and `stretching`, added in the
  layout-facts work) was corrected; its pin test had been failing.

## The agent's account, verbatim

Asked with `account-declare.txt` (`impressions.txt`).

Before the account, a correction to what I last told you. After my final message, the background dev server I restarted **exited with an error (code 1)**. I had reported the app as running because `curl` returned 200 just before that. My best guess is that the earlier server was still holding port 8200 and the restart failed against it, but I haven't checked and I haven't changed anything since. If the address doesn't load, run `npm start` in `declarelang/`.

---

# Building Venue in Declare: an account for the people who make it

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`, then `skill/SKILL.md` and `AGENTS.md`. The skill told me what to read first, and I did what it said.
2. `docs/declare.md`, the whole file.
3. Guide chapters `01-what-declare-is.md`, `04-structure.md` and `05-run-and-check.md`.
4. `apps/todo/todo.declare` and `todo-parts.declare`, both read whole.
5. After that, reading followed what I needed to build:
   - `14-data.md` from "Where data comes from" through "A form in a sheet"
   - `08-controls.md` and `19-accessibility.md`, whole
   - the "Gesture claims" and "Pan and zoom" sections of `10-touch.md`
   - `06-layout.md`, whole
   - the "Writing an assert script" section of `operational/verify.md`
6. Many `declare-help` lookups: `Form --all`, `TextInput --all`, `DataSource --all`, `EventStream`, `RadioGroup`, `Radio`, `Combobox`, `Select`, `View.focusScope`, `Accessibility`, `Dialog`, `Sheet`, `App.waypoint`, `Carousel`, `App`, `View.scrollTo`, `App.keyboardHeight`, `"theme tokens"`, `SanFranciscoDark`, `View.pointerEvents`, `View.accessibilityRole`, `Spring`, `ChangeEvent`, `KeyEvent`, `StreamMessage`, `Toast`, `Text.numeralWidth`, `Control.press`, `Control.focusVisible`, `App.lastPointerType`, `View.scrolls`.
7. Three pieces of library source:
   - `library/field.declare`, to learn how a Field finds the control inside it
   - a grep of `library/combobox.declare`, to see what happens when autofill types into it
   - a grep of `library/focusring.declare`, to find which colour it uses

**What I skipped, and why.** Guide chapters 02, 03, 07, 09, 11–13, 15–18 and 20–31. I also skipped the tracker and calendar apps and `operational/intake.md`. The skill says to stop after the first read and look things up as needed. That worked: the reference answered most questions faster than a chapter would have. Two of those skips cost me:
- I never read `18-overlays.md` or `21-motion.md`. Sheet and Spring worked from their reference entries and the todo app alone.
- I never read `07-scrolling.md`. Had I read it, I might have chosen native scrolling for the phone map from the start instead of panning by hand (see (d)).

**What taught me the most.** The todo app, then the `Form` and `TextInput` reference entries.
- From the todo app I took the shape of my program: records in a DataSource, "where the user is" as attributes on the App, and computed defaults.
- The two reference entries describe almost exactly what the brief asks of checkout:
  - a field isn't marked wrong until it has been left
  - `submit()` judges every field and focuses the first problem
  - the service's refusal lands on the field it names
  - nothing is sent twice while `pending`
  - `judged = false` after a decline (the docs even use the security-code case as the example)
  - `purpose` covers autofill and the phone keyboard
  - `concealed` gives a show-password control

  I built the payment form almost directly from those two pages.

**What was missing or misleading:**
- **`focusRingColor`** doesn't appear in `declare-help "theme tokens" --all`. I found it only by grepping `focusring.declare` line 414 (`t.focusRingColor ?? t.accent`). If you don't know it, the focus ring takes the accent colour, which in this app meant "yours".
- **An empty reply from a `DataSource`.** Nothing told me that a `DELETE` answered with `204` and no body would never reach `onLoad` under the default JSON format.
- **`ChangeEvent`.** From the prose ("carrying each name with its previous and current value") I guessed `e.changed("perfId")` was a function. It's an array. My fault for guessing, but a one-line example in the `onChange` docs would have prevented it.
- **`App.lastPointerType`.** Its entry is the best piece of documentation I met, because it says outright: "a `press()` that branches on it does something else for some of those people — a first tap that zooms where a click chooses." But I only found it because I looked it up to build exactly that mistake. The advice belongs in `10-touch.md`, or in the skill's phone paragraph, where you'd read it while planning.

## (b) Expressing what I wanted

**Where it fit well:**
- **Data from the service.** Five `DataSource`s and one `EventStream`, each with `credentials = include`, covered everything. `autoFetch` with a URL that depends on the performance id meant choosing a performance was the same act as loading its seat map.
- **Live seat sales.** "Other people are buying" turned into one `onMessage` that writes `"sold"` into the seat-map dataset. Each seat's look, its disabled state, the free-seat count and the overview drawing all followed from that write with no further code.
- **What's typed at checkout.** I kept it in a `Payment` class (it extends `Node`) on the App, with computed defaults such as `email: string = { classroot.account?.email ?? "" }`. That alone satisfied "sign in at any time … nothing typed is lost". Signing in fills the fields the person left empty, and leaves alone the ones they typed in. I wrote no merge logic.
- **Refusals.** `Form.source` plus `refusedWith` handled all of them:
  - for a decline: forget the security code and set its `judged` back to false
  - for a seat taken before payment (409): remove the lost seats, return to the hall, and show the service's sentence
  - everything else landed on its field automatically
- **Navigation.** The performance lives in `location` and checkout in `waypoint`, so the browser's Back button returns from checkout to the hall without routing code.
- **Seats as controls.** A seat is a `Control` with `accessibilityRole = toggle`, `draw()` for its shape and a `Spring` for the pop when chosen. It came out with the right role, name, pressed and disabled states for free.

**Where I worked around it:**
- **Constants written twice.** The hall geometry lives in a `script` block (`seatLeft`, `bowAt`, `tierTop`). But I also wrote the literals `1000`, `26` and `27` directly in the view tree, because I wasn't sure a `{ }` value could read a script `const`. The docs refuse script `let`s and say nothing either way about `const`s. I never tested it, so the drawing's size is now stated in two places.
- **Reaching a field inside a `Field`.** To reach the security-code fields from `refusedWith`, I had to name the anonymous `Field` wrappers (`savedField`, `codeField`) so a path could go through them.
- **Reaching the form from outside.** The phone's pay bar lives on the App while the form lives inside an `exists`-gated screen, so the bar reaches the form by a long optional path: `app.checkout?.pane.main.form ?? null`. It works, but it reads like plumbing.
- **Up and Down arrows between rows.** `focusScope = stop` gives arrows in member order only. Moving to the seat in the row above would mean finding a sibling view by index in a handler, and I didn't attempt it. Each section is one Tab stop and the arrows step seat by seat.
- **Country.** There's no `<select>`. A `Combobox` with `purpose = country` was the only choice that browser autofill can fill (its source handles text that arrives whole and names exactly one item). For a list of three it's heavier than it should be.

## (c) The first time it ran

The first `declare-verify` that booted was clean through R4. My first screenshots were the performance list (essentially right first time) and the desk hall. In the hall:
- Rows bowed toward the stage, three blocks with aisles, the four sections stepped back, and sold seats as dots. It read as a room.
- The hall looked slightly off-centre in its pane. I noted it and didn't pursue it, so I'm unsure whether it was real.
- The heading at the top of the list duplicated the hero title (fixed at the end).

The surprise was the first assert script: the whole guest flow at a desk passed first try. Pick a performance, three seats, undo one, checkout, declined card, retry, tickets: 9 assertions. The real problems surfaced only when I ran the same pictures at phone size, and the layout findings found them before my eyes did (see (d)).

## (d) Every refusal and surprise

**Compile-time and boot errors**

1. **Size on a child whose layout axis is computed (R1, `DECLARE2000`).**
   - *I wrote:* `HallMap [ flexes = true, width = {…}, height = {…} ]` inside a `SimpleLayout` whose axis is `{ app.narrow ? "y" : "x" }`.
   - *It said:* the layout sizes this child; remove the size; or give it "only in the arrangement where the run goes the other way, with a State."
   - *I changed:* added `align = stretch` to the layout and left only `flexes`.
   - *Judgement:* my code was wrong, and the message was excellent. It knew the axis was computed.

2. **`fontWeight = { scarce ? semibold : regular }` (R2, `DECLARE4005`).**
   - *It said:* write it as a string inside `{ }`.
   - *Judgement:* my code. `declare.md` §2 says it plainly ("the vocabulary stops at the brace"); the habit beat the reading.

3. **Nested ternary for `screen` (warning `DECLARE4025`).** I split it into named facts (`paying`, `inHouse`). Fair, and it does read better.

4. **Redundant parentheses (hint `DECLARE1002`).** On `theme = { ({ … }) }`. I copied the `({ … })` style from the todo app's array literals; that habit doesn't carry over to a whole-value object. Harmless.

5. **Paths through anonymous children (R3, `DECLARE6001`).** `this.saved.savedCode` is "not a member of this FormPart". My code; I named the `Field`s.

6. **`e.changed("perfId")` (R3).** "Type 'readonly ValueChange[]' has no call signatures." My guess was wrong, and the TypeScript wording is less friendly than Declare's own messages. I changed it to `e.changed.map((c) => c.name)`.

7. **Replicating over a computed array (R4).** `PerformanceCard [ datapath = { app.performances } ]` failed to boot: "this value belongs to no Dataset/DataSource … derive a Dataset beside the view."
   - *I changed:* point at `production.value` and replicate `:performances[]`.
   - *Judgement:* my code. The rule is reasonable, but it caught me because `declare.md` §7's examples all start from a Dataset and never say "never a plain array".

8. **Calling `scrollTo(...)` bare inside a `HallMap` method (R2, `DECLARE4001`).** "Not a member of HallMap." `this.scrollTo` worked.
   - *Judgement:* unsure. Bare attribute names such as `width` and `zoomed` resolved to the instance in the same methods, so a built-in method behaving differently surprised me. It may be intended ("built-ins never resolve outward"), but the message wrongly said `scrollTo` isn't a member, when it is one on `this`.

**Layout findings**

9. **The tap-catcher covered the seats.** "79 control(s) another view takes the presses of … a screen reader's activation — reaches the other view instead … app.hallScreen.map.catcher."
   - *What I'd built:* an invisible full-size view over the phone's whole-house map. A first tap zoomed in, and only then could a seat be pressed.
   - *Judgement:* the most valuable finding of the build. It started the redesign in item 14.

10. **Seats too small for a finger.** First "648 control(s) smaller than 44 × 44" (the whole house at 11 pt); after the redesign, "118 … 42×44". I raised the close scale to 1.72.
    - *Judgement:* both findings correct, and the second caught me cutting it fine.

11. **Paired fields collapsing.** "`card.codes` is 0 tall … `codeField` takes its height from it … spills out", plus the expiry field "covered" by the security code.
    - *Cause:* my `Pair` switched to a vertical axis below 400 pt wide, and at 390 its `flexes` children took their *height* from it.
    - *I changed:* `Pair` is always horizontal. My code.

12. **A pinned bar that wasn't pinned.** "app.checkout.bar has ignoreScroll, but its parent app.checkout does not scroll … To stand still against the window, make it a child of the App." Correct, and it named the fix. I moved the bar.

13. **The notice's OK button** at 36×32. Enlarged to 44 high.

**Results that weren't what I wrote them to do**

14. **The phone seat-picking design (three iterations).**
    - *First:* tap to zoom, via the catcher. The layout finding (item 9) and the `lastPointerType` documentation together showed it would break screen readers.
    - *Second:* the main map always shown close, panned by hand with `onPointerMove` and springs, steered from a drawn overview. Scripted presses on seats outside the window then landed off-screen ("press at (-191, 322)"). A person can drag; a press by role and name can't.
    - *Third:* `scrolls = both` with the platform's native touch scrolling. The driver could then swipe a seat into view.
    - *Judgement:* the platform behaved correctly every time; the design was mine. The scrolling chapter I skipped would probably have pointed me at native scrolling first.

15. **The first tap after a scroll was lost.** Seats chosen 1 of 3.
    - *Found by:* logging `aria-pressed` after each press. A second press on the same seat worked.
    - *Cause:* my seat's `onFocus` called `scrollIntoView()`. A finger press focuses the seat, the seat scrolls out from under the finger, and the click is cancelled.
    - *I changed:* only reveal when `focusVisible` (keyboard focus), inside `afterSettle`. My bug, nicely explained by `Control.focusVisible`.

16. **The phone pay bar laid out nothing.** Its children all sat at y = 0: status, total line and Pay button on top of each other, so only the button showed.
    - *Found by:* a screenshot that was missing the total line, then reading `childViews` positions through `page.evaluate`.
    - *What it was:* a class with `ignoreScroll`, `ignoreLayout`, `y = end` and its own `layout:`, as an `exists`-gated child of the App.
    - *I changed:* wrapped the content in an inner `View` that carries the layout. That fixed it.
    - *Judgement:* **platform looks wrong, but unsure.** I didn't isolate which attribute triggers it, no check flagged it, and the todo app's `fabDock` does something similar without the problem.

17. **The desk checkout's still column was misplaced at 1024 pt.** It sat as an `ignoreScroll` child inside a checkout screen that scrolls only through a `State`, and came out roughly 90 pt too low and cut off on the right.
    - *I changed:* replaced the arrangement with a plain row: a scrolling form pane beside a still aside.
    - *Judgement:* unsure. Possibly the classic scrollbar in the verify browser counts in `contentBox("width")`, or something about `scrolls` arriving through a `State`. I replaced the arrangement rather than diagnose it.

18. **A progress sweep under the Pay button never appeared.** It was driven by `Time [ tick = frame, running = … ]`, and nothing showed in a screenshot taken mid-payment. I removed it and kept the dimmed button plus a "Paying…" line.
    - *Judgement:* unsure. It may be how the virtual clock and `Time` interact; it may be my code.

19. **Sign-out did nothing on screen.** The `DELETE` (204, no body) never ran `onLoad`. `format = "text"` fixed it.
    - *Judgement:* I'd call this a platform edge. A 2xx with an empty body is a success, and needing a different format to hear about it is surprising. At minimum it should be in the `DataSource.format` documentation.

20. **The focus ring was vermilion** (the theme's accent). It looked like an error outline on a focused field. Found by eye; fixed with `focusRingColor` once I'd found that token in library source. Documentation gap (see (a)).

21. **My test scripts' own mistakes, all caught by the tools:**
    - **Password.** `getByLabel("Password")` matched both the field and my "Show password" toggle; strict mode reported it. I renamed the toggle "Show"/"Hide". This was a real problem for any automated tester, not just my script.
    - **Country.** The combobox kept "United States", so typed text appended to it. I added select-all to the script; the app's behaviour is the normal one for a text field.
    - **The 409 test raced the stream.** The live stream removed the taken seat before payment could be pressed, which was correct behaviour. I tested the 409 path instead by putting an already-sold seat into the choice with `drive.set`.

## (e) Verifying it

**What I used and what each caught:**
- **`declare-verify` R1–R4 after almost every edit.** Caught items 1–8, in one or two seconds each.
- **`declare-look --url … --shot` early on, then `page.screenshot` inside assert scripts.** That combination was what really let me look. Caught items 16, 17 and 20, the missing desk payment status, and the duplicated title.
- **Assert scripts** (R5, Playwright locators by role and label, against the live service), seven of them:
  - five flows: `desk-flow`, `desk-keyboard`, `phone-story`, `phone-pick`, `session`
  - two helpers: `shots` (pictures at each step) and a throwaway that read the pay bar's positions
  - Caught items 14, 15, 16, 19 and 21.
- **The layout findings printed after each press in R5.** Caught items 9–13, unprompted. This is the best feature of the toolchain.
- **`expect.request("POST", "/api/orders", { count: 1 })`.** Proved the double Enter sent only one payment. Exactly the right tool.
- **`--semantics`.** Confirmed seat names, hints and pressed/disabled states with no screen reader.

**What I didn't use:** R6 visual baselines, `declare-profile`, the Inspector, or `--fixtures`. In particular I never profiled the hall: 668 `Control`s, each with two springs and a constraint reading `app.chosen.includes(...)`.

**How well the tools served me:** very well.
- The virtual clock plus `waitReal` was the right model for a server-sent event stream.
- The notes ("the script sent 5 writes to the live service", "this run failed after talking to … which earlier runs wrote to") were honest and useful.
- **Weak spot:** the "never built, so never checked" list had no follow-up. `CardChoice` and `SignInForm` stayed unchecked until the phone story reached them.
- **Small oddity:** `/tmp/venue-shots` already held pictures I hadn't taken, which suggests leftovers from an earlier session. I can't say where they came from.

## (f) Confidence, part by part

- **§1 Performances:** high. Date, time, from-price, a fullness bar, "Nearly sold out · 79 left". The list is fetched again every time it's shown.
- **§2 Hall:** high for the shape, the three states, the exact summary string and live sales. Medium on readability on a phone: the whole-house drawing is only 150 pt tall. Keyboard users get Left/Right only, and a tester will likely press Up and expect the row above.
- **§3 Sign-in:** high for the flow, the service's sentence, keeping what was typed, expired card disabled, reload and sign-out. **Untested:** whether a password manager offers to save the login. The page has no real `<form>` element, and I relied on `purpose` alone.
- **§4 Paying:** high for:
  - the field rules and when they speak
  - the 402, 422 and 409 paths
  - single submission
  - the exact pay-button label

  Medium for real browser card and address autofill (especially country through the combobox), and for the phone keyboard. I hide the pay bar while `keyboardHeight > 0` and rely on Return moving to the next field, none of which has run on a real phone. On a desk, Enter in a field submits the form; that's intended, but a tester may not expect it.
- **§5 Tickets:** high. One at a time in a `Carousel` with arrows and "Ticket 2 of 3", large row and seat, door time, barcode. The barcode is decorative, not a real symbology.
- **§6 Look and motion:** I think it holds up: a dark house, ivory seats brighter toward the stage, one accent, a serif ticket. Judging that is the reviewer's job, not mine.

## Overall

**Surprises:**
- **Good:** the guest flow passed whole on the first run.
- **Bad:** the pay bar's collapsed layout (16) and the empty-reply sign-out (19).

**What was good:**
- computed defaults
- `Form` with `source`, `refusedWith` and `judged`
- reactive data writes driving every view that depends on them
- diagnostics that name the fix
- layout findings that think about fingers and screen readers
- documentation that warns at the point of decision (`lastPointerType`)

**What was bad:**
- a few ignore/pin arrangements that misplace views silently, with no diagnostic
- theme tokens found only in library source
- unsure scope rules for built-in methods
- `exists`-gated views reachable only by long optional paths

**How it compares.** It feels like SwiftUI's declarations plus MobX-style tracking of what each value depends on, written in brackets. The model of "a state is a reversible bundle of overrides" goes back to Flex/OpenLaszlo, and the README says so. Compared with React, I wrote no effects, no memoisation and no form library. What I got instead was a compiler that is genuinely strict about where each size or position is decided.

**The hardest part, and what it cost:** the phone seat picker. It was one obstacle, not a pattern, and it took three designs and roughly a quarter of the build. To get it right first time I'd have needed a guide section on "a dense field of pressable things on a phone" with one recommendation: native scroll at finger size, an overview to steer by, and never a press that means two things. I'd also have needed to know that a scripted press can't reach content a transform has moved off screen.

**Where I'd most want improvement:**
1. Diagnose the pinned and ignored layouts (16, 17) instead of misplacing them silently.
2. List every theme token in `declare-help`.
3. Treat an empty 2xx reply as success.
4. Allow Up/Down grid movement in `focusScope = stop` (seat maps, calendars).

**What I'd use it for:** form-heavy consumer flows and live dashboards. The form and data model would save the most work there. I'd be cautious about anything needing a very large interactive surface on low-end phones until I'd profiled it.
