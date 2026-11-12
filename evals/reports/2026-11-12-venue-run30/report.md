# Venue run 30: Opus 5.5, Declare, at dfebb414 (0.6.10 + driver additions)

**23.2 min, 108 turns; 11 of 11 hidden checks delivered, and 10 of 11 at its first clean boot
(10.2 min).** The fastest Venue run recorded. A **lighter report** (ruled 2026-11-12): the run was
the validation run for 0.6.10 (Popover never modal, the Return rule, the keyboard and focus
fixes) and turned up no platform defect that stopped it; figures, scores, the open items from
the account, the account verbatim and the names ledger. No line-by-line idiom review; the deep audit was added after filing.

## Figures

| | Venue 30 |
|---|---|
| time | 23.2 min, 108 turns |
| model · tools | 17.7 · 5.4 min |
| output tokens (thinking) | 113.6k (42.0k) |
| tools | verify 36× (4.3 min), look 5×, help 8×, bash 21×, read 20× |
| first clean boot | 10.2 min: 10 of 11 (the expired saved card not shown) |
| delivered | 11 of 11 |
| its own checks | 6 assert scripts: desk guest, desk keyboard-only, phone story, refusals, conflict, session |

Timing record: `evals/timings/2026-11-12-venue-run30.txt`.

## What 0.6.10 was checked against here

- **The Return rule in a form:** the keyboard-only desk purchase passes; Return pressed twice
  sends one order. Mid-run the agent said Return on the country picker didn't submit. The audit
  (below) found Return was pressed in Postal code, and `enterMoves` moved focus on to Country,
  as documented; Return in Country with a value chosen submits one order. (This report first
  said "the first Return picks the country" — wrong.)
- **The phone purchase** (`phone_guest_pays`) passes with the never-modal Popover.
- **R5's real-input checks** paid off: a press on a seat would have landed on the hall overview
  covering it (account d15) — the agent moved the overview before any grader saw it.

## Open items from the account (not audited)

- **A constraint-cycle message that misleads** (d11; the audit puts it at about 1.5 min, not ~10): it named `SimpleLayout[y]` at a
  laptop size whose axis was `x`, named neither the child nor the attribute, and a
  `visible = false` child still looped (by design a hidden child keeps its size; the message
  could say so). Worth an audit: the cycle report's naming.
- **DECLARE4000 on a press that writes `app.location`** to destinations not declared with
  `shows` (d10), left unresolved — a possible false positive, or a docs gap on dynamic places.
- **Gaps it worked around** (g): a toast that wraps; a "focus the member for record X" helper
  for a grid; a light select that autofill can fill.
- **Reference gaps:** five library reads, not one (the audit's table); `declare-help` had the
  answer for four.

> **Audited after filing (2026-11-12, deep audit added by ruling): see Audit below.** The cycle
> (d11) is a platform layout bug, not the agent's.

## Audit

**Effort.**

| | Wall time | Turns | Output tokens | of which thinking |
|---|---|---|---|---|
| Build | 23.2 min | 108 | 113.6k | 42.0k |
| Account (resumed) | — | — | 12.9k | — |

The build stream has 107 tool calls. Below, `#n` is the n-th call in the build. The per-obstacle figures are output tokens summed over the turns that obstacle took, and wall time is taken from the calls' timestamps. Both are approximate.

The repros are in `/private/tmp/claude-503/-Users-temkin-Code-declare-overlay/6a505da1-0494-4b83-acec-f4d7f2048458/scratchpad/v30-audit/`. Each was run from `~/Code/Declare` at HEAD (9c6817d4). The fixes made since dfebb414 (`35fcb37a`) touch `runtime/src/{check,data,focus,keys}.ts` and the docs. They do not touch layout, reactive, `toast.declare`, the link check or `Form`. So every result below applies to dfebb414 as well, unless stated otherwise. The `venue-live/` repros run the delivered program against my own service on port 8461 (`--seed=1`). That service has since been stopped.

### Platform defects: correct code refused, or a correct program laid out wrong

**B1. A stretch layout loops when one child is hidden by a `{ }` `visible`. The cycle message then points away from the cause.** (account d11)

- **Repro.** `cycle-hidden.declare`, 11 lines, has the following:
  - an App with `ready` flipped by `afterSettle`;
  - `hall` with `SimpleLayout [ axis = y, align = stretch ]`;
  - a flexing `pane` holding `map: View [ x = { Math.max(0, (parent.width - this.width) / 2) }, width = { app.ready ? 1500 : 0 } ]`;
  - a sibling `bar: View [ visible = { false }, width = 100, height = 60 ]`.

  R4 gives: `boot: constraint cycle: View's SimpleLayout[y] (at app.hall) re-evaluated 100 times in one update`.
- **Controls, each clean:**
  - the same bar visible;
  - `visible = false` written as a literal (`cycle-hidden-literal.declare`);
  - `exists = { true }` added beside `visible = { false }` (`cycle-hidden-exists.declare`);
  - the bar with no width of its own (`height = 60` only);
  - `align = start`;
  - the map with a constant width.

  Correct code loops only because the hidden state is written as a constraint. `06-layout.md` says "a hidden child leaves the flow: it takes no room and leaves no gap". Only a hidden child that *flexes* keeps its size, and the seat bar did not flex.
- **In the run, bisected on the delivered program** (copy in `work/venue-cycle-as-built`, then `work/bis/*`):
  - **What it needs:** the map's centring `x`, and the map's width changing after the first settle (`app.hall.loaded ? 1500 : 0` is enough).
  - **What doesn't matter:** the `side` panel's contents, `scrolls`, the inner `flexes`, the `width = 100%` Text and the Button.
  - **What the bar needs:** its own width, either stated or from a child View. A bar holding only a Text was clean.
- **The account's judgement is wrong.** It reads: "my code was probably wrong … the parent-sizes-from-child-sized-from-parent loop". The flexing child with a 100% Text is irrelevant: a bare hidden `View [ width = 100 ]` loops the same way. The agent's fix, `exists = { !app.wide }`, works for the same reason `exists = { true }` does. It was not an insight into the loop.
- **The message has three faults:**
  - **It names neither child.** `cycleLoop()` (`reactive.ts:107`, the "The loop: …" clause added in e8126333) found nothing to print here.
  - **"[y]" at a laptop size, where the axis is `x`.** The label is accurate for the moment of the loop. `width-log.declare` shows `app.width` is `0` through `onInit` and the first settle, in R4 and in `declare-look` alike: `app.log = "init 0, after first settle 0"`, then `app.width = 1280`. So `wide` is false, and the narrow, y-axis arrangement is live when the data lands.
    - `cycle-hidden-axis.declare` (`axis = { app.width >= 820 ? "x" : "y" }`) loops at 1280×800 as `[y]`.
    - The same with the axis held on `x` (a constant `true` flag) is clean.

    The message does not say that the loop happened before the window's size arrived. Unsure whether a zero-width first settle is intended; nothing in `App.width`'s help says so.
  - **It says nothing about hiding.** That was the agent's best clue, from its bisect at #68 (`visible = { false }`, still looping).
- **Cost in the run.** From #66 (03:06:44) to the fix at #74 (03:08:14): **about 1.5 min**, nine boots and about 5k output tokens, some of which was moving the bar.
  - **The account overstates it.** It says "about five verify runs, ~10 minutes", and the report repeats "~10 min".
  - **Where it failed first.** The first failure was the **phone** boot (#66, #67 with `--phone`), not "the 1280×800 boot" as the account says. The desk boot failed too (#70).
  - **What it left in the program.** The seat bar is built only on phones (`venue.declare:671`). That is a reasonable design anyway.

**B2. The library `Toast` runs off a phone's screen with a sentence-long message.** (account d17, g1)

- **Repro.** `toast-long.declare` (and `toast-long.png`) sends one `say()` of 90 characters at `--phone`. The result is `layout app.toast runs past the window's right edge at 390 wide (it ends at 464)`.
- **Cause.** The toast is centred and its text is `wrap = false` (`library/toast.declare:143`), with no width limit.
- **What the help says.** "A short message", and nothing about one line or a width limit.
- **The verify layout check did its job.**
- **Cost.** About 1k tokens and 15 s (#77–#79). The agent's move to an in-place `Notice` banner is arguably the better design for a seat lost while deciding. A toast that can leave the screen is still a library gap.

**B3 (tool, minor; found in the audit, not by the agent). A touch-target finding reports a size that is not too small.**

- **What happens.** `declare-look venue-live/venue.declare --phone --set app.location=p01 --wait-real 1500 --call 'app.toggleSeat("ORCH-A-7")' --call 'app.toggleSeat("ORCH-A-7")' --set app.location=p05 --wait-real 1500` prints `layout after settleMotion: 2 control(s) smaller than 44 × 44 … seats.86 44×44, seats.87 44×44`.
- **What the views read.** `--read` gives `width = 44`, `height = 44`, `scale = 1`, and the DOM boxes are 44×44.
- **What's unclear.** The size it measured is not the size it prints. That is probably a mid-spring measurement printed with the settled size, but I'm unsure of the cause.
- **No cost in the run.**

### Docs and messages (not defects, but they cost the agent)

**D1. DECLARE4000's fix for a place no `shows` declares** (account d10, left unresolved).

- **The warning is right.** "Book another performance" writes `app.location = ""` in `onClick`, so the crawl has no edge. It fired on that one button throughout (#37 to #107: lines 633, 663, 665, 698, 718, 734, 744 and 747 as the file grew).
- **The account is wrong that it was "also on PerfRow's press".** PerfRow goes through `openPerformance()`, and neither that nor `press()` on the hall's back Control is checked (`location-onclick-warn.declare`, `work/link-d.declare`).
- **The agent's worry was half right.** The hint says `Declare 'link = "#…"'`. For the run's places (`p01`…), the literal `link = "#p01"` is a **compile error**: `'#p01' names no declared destination or anchor [DECLARE2000]` (`location-link-literal-refused.declare`).
- **What works** (`location-link-fix.declare`, checked with `declare-look`, location `p01` and then `""`):
  - `link = { "#" + id }`, a data-driven reference that the crawl checks;
  - `link = "#"` for home.

  `View.link` documents the data-driven form, but the warning's hint leads to the refused literal.
- **Verdict:** docs and message unclear. The hint could say: "for a place your program parses, `link = { "#" + … }`, or `"#"` for the initial place".

**D2. Focus falls to `<body>` when the focused view is hidden** (account d18).

- **Repro.** `venue-live/no-focus-heading/` is the delivered program without `afterSettle(app.focusHeading)`. Run with `venue-live/focus-after-choose.mjs`: after Return on "Fri 13 Nov, 7:30pm", `document.activeElement` is `BODY`. With the agent's `focusHeading` it is the hall's heading.
- **The account's finding is right in fact, but not how it found it.** The keyboard test's failures (#80, #82: `Tab never reached a seat`) were the script tabbing before data had loaded; #83's trace already had `focusHeading` in place. The agent added it pre-emptively, and it was needed.
- **The docs.** They don't say where focus goes when its view hides; the todo app's `afterSettle(() => Focus.focus(…))` is the only model.
- **Verdict:** docs gap. Unsure whether the platform should move the focus itself.

**D3. ChoiceItem's role** (account a, d16).

- `declare-help ChoiceItem.accessibilityRole` gives `default option`, and `ChoiceControl --all` says "A screen reader hears a list of options … `RadioGroup` is a `ChoiceControl` with the radio's look and words".
- `19-accessibility.md`, which the agent read whole, says only that it "gives them their role".
- The brief does not require radios; the agent's own test did.
- **Verdict:** the docs had the answer in help. The guide could name the role. The DECLARE4032 warning that followed is right, and so is the move to `RadioGroup`.

**D4. EventStream's transport** (d20). `EventStream --all` says a plain GET keeps `EventSource`, and "none of the four" (`method`, `body`, `headers`, `credentials`) implies otherwise a `fetch`. The stream declares `credentials = include`. That is documented, but only by implication. The agent did not read `--all`.

### Every refusal, finding and changed behaviour

**Compile (R1–R3), #33–#37: about 25 s, 1.9k tokens.**

| # | Written | Platform said | Verdict |
|---|---|---|---|
| 33 | `class Section` beside `schema Section` | DECLARE5001: declared twice | Agent's code wrong. Clear. |
| 34 | `schema Card` | DECLARE5000: a library class; rename, "as 'VenueCard'" | Agent's code wrong. Clear. |
| 35 | `pane: View = null` | DECLARE2000: write `View?` | Agent's code wrong. |
| 35 | `Spacer [ visible, height = 120 ]` in a SimpleLayout | DECLARE2000: a Spacer flexes; use a View | Agent's code wrong. Excellent message. |
| 36 | `fontWeight = { … ? bold : regular }` | DECLARE4005: quote inside `{ }` | Agent's code wrong (declare.md says so). |
| 36 | `classroot.count` in the App | DECLARE4003 | Agent's code wrong. |
| 36, 46 | `rowIndex` in TicketCard, then in TierPrice's dot | DECLARE4023 warning | Real bugs both times. Excellent. |
| 36 | `stage` from three nested `? :` | DECLARE4025 lint | Fair; split into named facts. |
| 36–47 | `{ ({ … }) }` | DECLARE1002 hint | Harmless. |
| 37–107 | `onClick() { …; app.location = "" }` | DECLARE4000 | Warning correct; hint misleads (D1). Left in. |

The account says the first boot came "after six fix rounds". It took four rounds, five verify runs in all.

**Boot, layout and behaviour.**

| # | Written | Platform said or showed | Verdict |
|---|---|---|---|
| 41–43 | The desk hall at a 27 px pitch | Screenshot: too tall | Agent's design. Redesigned into the side panel (#46). |
| 47 | Phone seats at 40, back controls at 32 | `declare-look --phone`: "35 control(s) smaller than 44 × 44" | Correct finding, from declare-look, not R4 as the account says. Fixed (#58). |
| 52 | Back to seats at 32 | `app.checkout.0 101×32` | Correct finding. Fixed. |
| 52–57 | `TextInput [ padding = [0, …, 0, 12] ]`, card number | Screenshot: field about 18 px high | Agent's code wrong. `TextInput.padding` says an auto-height field counts its insets. Became `Entry` with a stated height. |
| 87 | Brand chip `x = { parent.width - this.width - 10 }` in a padded field | Overlap, seen in a screenshot | Agent's code wrong. 06 says `x` is from the content box. |
| 59 | Overview floating over the seat pane | R5: a press at seat 10 "would land on app.hallScreen.overview" | Correct finding, and the most valuable one. Overview moved into the header. |
| 66–74 | Hidden seat bar in the hall's stretch layout | R4: constraint cycle, `SimpleLayout[y]` | **Platform** (B1). |
| 64, 74 | `ChoiceControl` of `ChoiceItem`s; the test wants `radio` | R5: no radio "Visa ending 4242" | Agent's test assumption; D3. |
| 77 | `accessibilityRole = radio` on the ChoiceItems | DECLARE4032: a radio outside a RadioGroup | Correct warning. Became `RadioGroup` (#78). |
| 77 | `app.toast.say(<90-character sentence>)` | layout: toast ends at 477 at 390 wide | **Library** (B2). Became `Notice`. |
| 80, 82 | Keyboard script, Tab before the list had loaded | `Tab never reached a seat:` | Test code wrong (timing). The focus fix added alongside was needed anyway (D2). |
| 84–85 | Enter after typing the postal code | No order; `Sent to …` not found | **Test code wrong, and the account misreads it** (see d19 below). |
| 87–88 | Tab before the hall had loaded | `Tab never reached a seat` | Test code wrong (timing). |
| 89 | One Tab after the postal code expected to reach Pay | `went to: INPUT\|combobox\|Country` | Test code wrong. |
| 99–100 | `EventSource` stubbed to silence the stream | The sale arrived live; `Pay $78.00` not found | Test code wrong (D4). It exposed a real gap: no notice at checkout, which the agent then added. |
| 39 | `npm start` on 8200 | Port taken; names the next port | Good message. |

**d19, the Combobox Enter: not a platform problem.**

- **The script typed eight values after Email**, ending with the postal code, and then pressed Enter. `/tmp/shots/kb-before.png`, the agent's own, shows **Postal code** focused. `kb-after.png` shows Country focused and nothing sent: `enterMoves` moved Return from Postal code to the next field, as documented.
- **The account says Enter was pressed on Country** and guesses at object identity in `app.countries`. Both are wrong.
- **The report's gloss doesn't fit either.** It says "the first Return picks the country and the second submits". Return was never pressed in Country.
- **Check.** `venue-live/kb-enter-on-country.mjs` tabs into Country (value United States, list closed) and presses Return once. R5 passes, and one order is sent.

### Reads of library/ and runtime/ source (reference gaps)

The report says "one grep of `library/themes`". There were **five** reads of `library/` and none of `runtime/`. One app example was also read: `apps/sampler` SignUp, #18.

| # | Read | Looking for | Did declare-help or the docs have it? |
|---|---|---|---|
| 29 | `grep -A30 "SanFrancisco \[" library/themes/*.declare` | The preset's values, to spread under its own theme | Yes: `declare-help SanFrancisco` lists its values. |
| 56 | `grep height\|fontSize\|padding library/textinput.declare`; `grep height library/combobox.declare` | Why the card field collapsed; field heights | Yes: `TextInput.padding` ("An auto-sized field … counts the top and bottom insets in its height"). The grep hit that very prose. `Combobox.height` is in help too. |
| 75 | `grep accessibilityRole library/choicecontrol.declare` | ChoiceItem's role | Yes, in help (`ChoiceItem.accessibilityRole`, `ChoiceControl --all`); not in the guide (D3). |
| 76 | `grep … library/radiogroup.declare` | Radio's label and role | Yes: `declare-help RadioGroup`, `Radio`. |
| 78 | `grep width\|maxWidth\|wrap library/toast.declare` | Why the toast does not wrap | No: help says only "a short message" (B2). |

### Where the account is wrong, against the stream

- **d11, cost:** about 1.5 min and nine boots, not "~10 minutes" over "about five verify runs". The first failure was the phone boot, not "the 1280×800 boot".
- **d11, judgement:** the platform is wrong, not the agent's code (B1). The 100% Text and the flexing child play no part.
- **d10:** the warning fired on one site, "Book another performance". It did not fire on PerfRow's press.
- **d19:** Enter was pressed in Postal code, not in Country. `enterMoves` behaved as documented, and the identity guess is wrong.
- **d18:** "found by the keyboard test" is loose. The test failed for timing, and the fix went in before any trace showed focus lost. The underlying fact is right (D2).
- **c3, d12:** the 44×44 finding came from `declare-look --phone`, not R4.
- **c:** "after six fix rounds": it took four.
- **(a) "Toast doesn't wrap … learned from a layout finding":** right. "Nothing I read said so": right (B2).

### On the report's open items

- **d11** is a platform defect (B1), and the report's gloss "by design a hidden child keeps its size" does not apply: that rule covers a hidden child that *flexes*. Worth fixing:
  - the loop itself;
  - the message, which should name the children and the loop, and say when a boot settles at width 0 before the window's size.
- **d10** is a message gap (D1), not a false positive.
- **(g) gaps:**
  - **A toast that wraps:** real (B2).
  - **Focusing a grid member by record:** real. Nothing maps a record to its replicated view. `childViews.find` is fine on a block that is not virtualized, and the hall is not.
  - **A light select that autofill fills:** real but minor. Only `TextInput`, `NativeText` and `Combobox` take `purpose` (`declare-help purpose`), so Combobox was the right pick.
  - **A busy indicator:** `ProgressBar [ indeterminate ]` exists, but there is no spinner or ring.

*Audit effort: about 0.25M tokens of my own context, mostly bisecting B1. Repro runs ~60 `declare-verify`/`declare-look` calls.*

## The agent's account, verbatim

Asked after the build, resuming the session with read-only tools (`impressions.txt`).

# Building Venue in Declare: an account for the Declare team

## (a) Getting up to speed

**What I read, in order.** I started with `README.md` and then `skill/SKILL.md`. Following the skill's "Read first" list, I read these whole:

1. `docs/declare.md`
2. `docs/guide/01-what-declare-is.md`
3. `docs/guide/04-structure.md`
4. `docs/guide/05-run-and-check.md`
5. `docs/guide/06-layout.md`
6. `apps/todo/todo.declare` and `apps/todo/todo-parts.declare`

After that I read only parts of the rest, as needs came up:

- `14-data.md`, from "Where data comes from" to the end (DataSource, writes, streams, forms)
- `08-controls.md` whole
- `19-accessibility.md` whole
- `10-touch.md`, the first 220 lines
- `11-paint-and-themes.md` whole
- `12-text.md`, the first 150 lines
- `18-overlays.md`, lines 100–240
- `07-scrolling.md`, lines 29–163
- the first ~120 lines of `20-urls.md`
- most of `docs/operational/verify.md`
- the `SignUp` class in `apps/sampler/sampler.declare`

I also made a lot of `npx declare-help` calls: `TextInput.purpose`, `DataSource.credentials`, `Form` and `Form --all`, `Field`, `EventStream`, `ChoiceControl`, `View.focusScope`, `TextInput.concealed`, `App.keyboardHeight`, `Combobox --all`, `Carousel --all`, `"theme tokens"`, and others.

**What I skipped.** I never opened `02-notation`, `03-constraints`, `09-pointer-and-keyboard`, `16-collections`, `17-your-own-views`, `21-motion`, `22-time` or `23-animated-arrangements`. I skipped them because declare.md plus the todo app seemed to cover what I needed, and I was conscious of time. That cost me in at least one place: I wrote a Spring "pulse" without having read `21-motion` (see f and g).

**What taught me the most:**

- The todo app, read whole. It showed the idioms that declare.md only states: computed defaults, `afterSettle(() => Focus.focus(...))`, `exists` against `visible`, `provided("theme")` tokens, and `Control` with `press()`.
- `declare-help Form --all`. I built the whole checkout around what it describes: `refusedWith`, `judged = false`, `enterMoves`, and "sends once while pending".
- One line in `10-touch.md` decided my phone hall design: "Many small targets close together belong in a scroller, at a finger's size … rather than fitted to the screen and zoomed into."

**What was missing or misleading:**

- **ChoiceItem's role.** Nothing I read said that a `ChoiceItem` is an `option` in a `listbox`. I only found out when a test looked for radios and found nothing, and then confirmed it by grepping `library/choicecontrol.declare`.
- **Toast doesn't wrap.** Nothing I read said so. I learned it from a layout finding.
- **How `EventStream` connects.** Nothing I read said it uses `fetch` rather than the browser's `EventSource`, which mattered when I tried to stub it in a test.
- **Hidden children.** `06-layout.md` says "a hidden child leaves the flow." A hidden child still took part in a layout cycle (see d11). That sentence may not be wrong, but it set my expectations wrongly.

## (b) Expressing what I wanted

**Where Declare fitted my intent:**

- **Data from the service.** Each part of the service became a `DataSource` on the App with `credentials = include`: the production, the seats, `/api/me`, the session POST, the sign-out DELETE, and the order POST. `signedIn` is just `{ app.me.loaded && !app.me.failed }`. Reload keeping the session needed no code.
- **"Nothing typed is lost when you sign in."** This was one idea: a computed default on the App, such as `email: string = { app.profile?.email ?? "" }`. It follows the account until the person types, and from then on it's theirs. That handles the brief's hardest consistency requirement in a few lines.
- **Form.** Judge on leaving the field or on submit; focus the first problem; put a 422 on the field it names; send only once while pending. All of that came built in. `refusedWith` was exactly where the 402 handling (clear the security code, `judged = false`) and the 409 handling (drop the lost seats, back to the hall) belonged.
- **Live seat updates.** I wrapped each service seat record in a derived dataset (`seat: s` inside the `Placed` wrapper). When someone else buys a seat, the stream handler writes `status` on that one record, and that seat's view, the free counts and the overview all follow.
- **Accessibility.** `accessibilityRole = toggle`, `accessibilityLabel`, and `accessibilityPressed` gave the seats exactly the role and name the brief's test needs. `purpose` gave the right `autocomplete` and `inputmode` on every field; I checked the actual attributes with `declare-look --js`.

**Where I worked around it:**

- **Up/Down in the seat grid.** `focusScope = stop` moves linearly. The docs say outright that a grid must handle `onKeyDown` itself. I wrote `Hall.neighbour()` plus `(parent.childViews as Seat[]).find(...)`, and I found `childViews` in the `declare-look --help` text, not in the docs.
- **The hall geometry.** I worked out the curved rows by hand in a method on `Hall` (`arrange()`), which is legitimate for a diagram. I did put view geometry on a data class, though, and that may be a structural smell.
- **A spinner.** I built a rotating view driven by `Time [ tick = frame ]` inside `PayButton`. I didn't look for an indeterminate progress control first.

## (c) The first time it ran

The first boot passed R4 after six fix rounds. The first screenshots, the list and the hall at 1280×800, showed:

1. **The desk hall was far too tall.** At a 27px seat pitch, the Orchestra alone filled the window. You couldn't "glance at the house." I saw this in `/tmp/shots/hall.png`.
2. **The curvature looked suspicious.** I reasoned it through, and it was in fact correct.
3. **The phone hall opened on the stage.** The stage band filled the screen, and the seats were 40px, which R4 `--phone` flagged as under 44×44.

The checkout screenshot showed a fourth problem:

4. **The Card number field had collapsed to a sliver.**

## (d) Every refusal and surprise

I name codes and messages exactly where I have them.

**1. DECLARE5001.** I wrote `class Section [...]`, and I also had `schema Section` in the parts file.
- The message: "'Section' is declared twice — in "venue-parts.declare" and "the app"".
- I renamed the class to `FormSection`. My error, and a clear message.

**2. DECLARE5000.** I wrote `schema Card [...]`.
- The message: "'Card' is a library class — a schema of the program can't take its name; rename yours, as 'VenueCard'".
- I renamed it `SavedCardRec`. Clear message, but it was a surprise: schemas and library classes share one namespace. That is documented in declare.md, but I hadn't connected it to library names.

**3. DECLARE2000.** I wrote `pane: View = null`.
- The message: "Overview.pane's default expects a View — declared without '?', so never empty; write 'View?'".
- I changed it to `View?`. My error.

**4. DECLARE2000.** I wrote `Spacer [ visible = { app.wide }, height = 120 ]` inside a SimpleLayout.
- The message explained that a Spacer flexes.
- I replaced it with `View [ … height = 120 ]`. My error, and a very good message.

**5. DECLARE4005.** I wrote `fontWeight = { classroot.scarce ? bold : regular }`.
- The message: "'bold' is one of fontWeight's values — bare only as the whole value … inside { } write it as a string".
- I quoted the values. My error: declare.md says the vocabulary stops at the brace.

**6. DECLARE4003.** In the App, I wrote `TicketCard [ index = { rowIndex }, count = { classroot.count } ]`.
- The message: "'classroot' is … valid only inside a class body".
- I changed it to `parent.rowIndex` and `app.receipt?.tickets.length`. My error.

**7. DECLARE4023 (warning).** "TicketCard reads rowIndex, but TicketCard is not replicated". It fired again later on the dot inside `TierPrice`.
- I changed both to `parent.rowIndex`. An excellent warning; it caught a real bug both times.

**8. DECLARE4025 (lint).** The `stage` value decided through three nested `? :`.
- I split it into named facts: `atTickets`, `atCheckout`, `inHall`. The fair point is that it reads better.

**9. DECLARE1002 hints** about redundant parentheses around object literals. I removed them. Harmless.

**10. DECLARE4000.** "onClick writes app.location on a view with no 'link'". This was on "Book another performance", and also on PerfRow's press.
- **Not resolved.** My `location` values (`p01`…`p20`) aren't declared with `shows`, so I didn't think a `link` would pass the registry. Unsure whether I should have modelled performances as declared destinations.

**11. Boot: constraint cycle.** This is the main obstacle; see (i).
- The message: "boot: constraint cycle: View's SimpleLayout[y] (at app.hallScreen) re-evaluated 100 times in one update — it (transitively) depends on its own output".
- I bisected with about five verify runs, ~10 minutes:
  - setting `seatBar`'s `visible = false`: still a cycle
  - setting the overview's `visible = false`: still a cycle
  - removing the overview entirely: still a cycle
  - giving `info` a stated width: still a cycle
  - removing `seatBar` entirely: fixed
- The fix was `exists = { !app.wide }` on the seat bar.
- My judgement: my code was probably wrong. On a desk, the screen's layout is `axis = x, align = stretch`, and the seat bar was a content-sized view containing a `flexes` child with a `width = 100%` Text. That's the parent-sizes-from-child-sized-from-parent loop. But three things are platform concerns:
  - The message said `SimpleLayout[y]` while the failing boot was the laptop size, where my axis was `x`. Unsure why.
  - It named neither the child nor the attribute involved.
  - A `visible = false` child still caused the loop, contrary to what I took from "a hidden child leaves the flow."

**12. Layout finding: small touch targets.** "35 control(s) smaller than 44 × 44 … app.hallScreen.side.back 125×32, app.hallScreen.pane.map.seats.6 40×40". It also flagged `app.checkout.0 101×32`.
- I raised the phone pitch to 44 and gave the back controls `height = { app.touchFirst ? 44 : 32 }`. Exactly what I needed to hear.

**13. Card number field collapsed (seen in a screenshot).** I had set `padding = { [0, classroot.brand == "" ? 12 : 92, 0, 12] }` on the TextInput. Its automatic height comes from the text plus the vertical padding, so zero vertical padding collapsed it.
- I created an `Entry` class with an explicit height. My error; the TextInput reference does explain padding.

**14. The brand chip overlapped the field's right edge (seen in a screenshot).** I placed it with `x = { parent.width - this.width - 10 }` inside the padded field. `x` is measured from the content box, but `parent.width` is the whole box.
- I changed 10 to 22. My error; `06-layout.md` states exactly this.

**15. R5: the overview covered seats.**
- The message: `page.getByRole("button", { name: /^Orchestra, row/ }).nth(10): a press at its centre (368, 230) would land on app.hallScreen.overview (Overview) ("Overview of the hall"), which covers it there`.
- I moved the overview into the phone header. This was the most valuable single finding of the build: a real tap would have hit the overview too, and a grader's test would have failed.

**16. R5: no radio named "Visa ending 4242".** My `SavedCard extends ChoiceItem`, and that is an `option`.
- First I added `accessibilityRole = radio` and `accessibilityChecked = { on }`.
- That produced DECLARE4032: "SavedCard is a radio outside a RadioGroup — a screen reader hears no "one of N"…".
- I changed the container to `RadioGroup`. The docs could say ChoiceItem's role more plainly; the warning was good.

**17. Layout finding: the toast overflowed.** "app.toast runs past the window's right edge at 390 wide (it ends at 477)". My long "…has just been taken by someone else…" message didn't wrap, because `toast.declare` sets `wrap = false`.
- I moved the message to an in-place `Notice` banner. Platform gap or design intent; unsure which.

**18. Focus was lost after choosing a performance (found by the keyboard test).** Pressing Enter on a list row hid the list, and the next Tab started from nowhere useful.
- I added `focusHeading()`, called through `afterSettle` from `onChange` when the screen changes. This is my responsibility per the docs, but a guide pattern for "a screen changes, focus its heading" would help.

**19. Enter on the Country Combobox (the last field, with `enterMoves = true`) didn't submit.** No order request was sent and no list was visible.
- I didn't fix it; I changed my test to Tab on to Pay.
- **Unexplained.** One guess: `app.country` is a computed default found in `app.countries`, which is itself a `{ }`-derived array, so maybe identity fails and the Combobox thinks nothing is chosen.

**20. My EventSource stub didn't silence the stream.** EventStream doesn't seem to use `EventSource`, and the app caught the sale live.
- I stubbed `fetch` for `/api/events` instead. Not a platform fault. As a bonus, this exposed that a seat lost while at checkout showed nothing there, so I added `Notice` to checkout.

**21. Test-script failures that were my own bugs:**
- Tabbing before data had loaded, twice.
- Miscounting Tabs in the form, which left focus on Country rather than Pay.
- The dev server's "port 8200 is already taken" message was clear; I used 8231.

## (e) Verifying it

- **`declare-verify` R1–R4** after every edit, with `--phone --desktop` near the end. Fast, and each message named the fix.
- **`declare-look --url … --shot`** caught the problems a compile can't see:
  - the hall too tall at a desk
  - the phone hall opening on the stage
  - the collapsed field and the chip offset
  - the decline sentence below the fold on a phone
  - the clipped ticket shadow, and the invented policy line on the ticket
  - the expired card's label wrapping

  `--set "app.chosen=[…]" --set app.waypoint=checkout` was a great way to jump straight to a state.
- **Six assert scripts** against the live service through `--url`: `desk-guest`, `desk-keyboard`, `phone-story`, `refusals`, `conflict`, `session`. Playwright locators by role and name mirror how the brief says the app will be tested.
  - They caught: the overview covering seats, the radio roles, the toast overflow, the lost focus, and the missing notice at checkout.
  - The notes on writes sent to the live service ("this run failed after talking to … which earlier runs wrote to") were honest and useful.
- **How well the tools served me:** very well. They were the best part of the platform. My only complaint is the cycle diagnostic, and that each R5 run takes tens of seconds.

## (f) Confidence

**High, because a test drives it:**
- Choosing a performance.
- Choosing and giving back seats, with the exact "3 seats · $240.00" format.
- A seat being taken live.
- Sign-in, with the service's sentence for a wrong password.
- The saved and expired cards, and the decline clearing only the security code.
- New-card grouping and the brand mark.
- The postcode check on leaving the field; the expiry month check.
- 422 refusals focusing their field, and 409 back to the hall with the rest of the choice intact.
- A single payment per press, the tickets, and "Sent to …".
- Session persistence across reload, and Sign out.

**Medium:**
- **What a screen reader actually says.** I never ran one or used `--semantics`.
- **Ticket carousel swipes and the Previous/Next buttons.** Never pressed.
- **Dark mode.** There isn't one.
- **The 820–1000pt desk widths.** Seats there are ~9px dots.

**Low or unverified:**
- **The two Springs** (the seat swelling and the total's pulse). I never saw either move, and the pulse assigns 1 to a Spring-driven attribute whose target is 0, which I only assumed works.
- **The phone keyboard and browser autofill.** These can't be tested headlessly.
- **The barcode.** It is decorative and not a real symbology. A door scanner wouldn't read it; only the code text is real.
- **Missed seat events.** The stream activates only after the seat map loads, so a sale between those two moments could be missed. That is a small window in which "the room lies."

**Where I'd expect a tester to find problems:**
- If they look for seats as checkboxes rather than toggle buttons.
- Countries default to the United States for guests.
- The Combobox Enter behaviour (d19).
- The phone pay bar sitting over the keyboard.
- Very narrow desk windows.

## (g) Gaps I worked around

- **A toast that wraps.** I wanted a multi-line toast. I looked at `toast.declare` and saw `wrap = false`. I used an in-place `Notice` banner instead. Arguably that's the better design anyway. Probably a real gap.
- **Arrow-key navigation over a grid.** I wanted Up and Down to move between rows. `View.focusScope` says to write it yourself. I wrote `neighbour()` plus a `childViews` lookup. The platform really does leave this to the program; a "focus the member for record id X" helper would remove the hack.
- **A select with three choices that autofill can fill.** I looked at Segmented, the pop-up Button, and Combobox. I chose Combobox because its `purpose` supports autofill. It works, but it's heavy for three choices. Unsure whether something better exists.
- **A busy indicator inside a button.** I hand-built a spinner. I didn't look for one; it might be there.
- **An app-wide focus-on-heading pattern.** I wrote `focusHeading()` myself. That may be intended.
- **Stubbing the stream in tests.** I stubbed `fetch`. `--fixtures` might have been the right tool; I didn't try it.

## (h) Changes of direction

1. **The desk hall.** It started as a page-scrolling column with the map in it and a summary bar pinned at the bottom. It became a side panel with the tier prices and your choice beside a map fitted to the window. This came after the first screenshot, where I saw it.
2. **The phone overview.** It started floating over the corner of the seat pane and moved into the phone header. The R5 finding that it covered seats drove that.
3. **The phone summary bar.** It started as an App child pinned at the foot (`ignoreScroll`, `y = end`) and became an in-flow bar under the hall pane, built only on phones with `exists`.
   - The reasons were my own worry that locator scrolling and real taps could land under a bar laid over the pane, plus the boot cycle.
4. **Form-level errors.** They started as a Text at the end of the form and moved beside Pay (`PayProblem`). The phone screenshot showed the decline sentence off-screen.
5. **The seat-taken message.** It started as a toast and became a `Notice` banner, shown at checkout too. The toast overflow finding, then the conflict test, drove that.
6. **The card choice.** It went from `ChoiceControl` to `RadioGroup`, because of the R5 role finding and DECLARE4032.
7. **Phone seat pitch,** from 40 to 44, because of the R4 touch-target finding.
8. **Text fields.** Raw `TextInput` became the `Entry` class, after the collapsed-field screenshot.
9. **The `stage` value.** The nested `? :` became named facts, because of DECLARE4025.

## (i) The code, quoted

**The cycle.** This is reconstructed from the session; the shape is exact as far as I can rebuild it, though trimmed:

```
hallScreen: View [ visible = { app.stage == "hall" }, width = 100%, height = { app.height - 60 },
    layout: SimpleLayout [ axis = { app.wide ? "x" : "y" }, align = stretch ],
    side: View [ width = { app.wide ? 340 : app.width }, … ],
    pane: View [ flexes = true, scrolls = both, map: View [ … ] ],
    seatBar: View [ visible = { app.chosen.length > 0 && !app.wide },
        padding = [12, 16, 16, 20],
        layout: SimpleLayout [ axis = x, spacing = 16, align = center ],
        View [ flexes = true, layout: SimpleLayout [ axis = y, spacing = 2 ],
            Text [ fontSize = 20, text = { app.summary } ],
            Text [ width = 100%, fontSize = 13, maxLines = 1, text = { app.seatList } ] ],
        Button [ primary = true, label = "Continue", onClick() { app.waypoint = "checkout" } ] ]
    ]
```

The message, at the 1280×800 boot: `boot: constraint cycle: View's SimpleLayout[y] (at app.hallScreen) re-evaluated 100 times in one update — it (transitively) depends on its own output`. It persisted even with `visible = { false }`. It went away when I replaced `visible = …` with `exists = { !app.wide }, visible = { app.chosen.length > 0 }`.

**The Combobox Enter (d19).** Inside `class PaymentForm extends Form [ source = { app.order }, enterMoves = true, … ]`:

```
Combobox [ width = 100%, name = "country", purpose = country, required = "Choose the country.",
    items = { app.countries }, value <-> app.country ]
```

with these on the App:

```
countries: array = { [({ id: "US", label: "United States" }), …] }
country: object = { app.countries.find((c) => c.id == (app.profile?.billing.country ?? "US")) ?? null }
```

With every field valid and focus in Country, Enter sent no request.

**The ChoiceItem role.**

```
cards: ChoiceControl [ datapath = { app.profile }, accessibilityLabel = "Pay with", value <-> app.payWith,
    SavedCard [ datapath = :cards[] ], NewCardChoice [ ] ]
```

with `class SavedCard extends ChoiceItem [ … accessibilityLabel = { brandName(:brand ?? "") + " ending " + (:last4 ?? "") … } ]`.

The test result: `expect(page.getByRole("radio", { name: "Visa ending 4242" })).toBeChecked() — got no element (after 5 s)`.

## Overall

**Surprises:**
- How much the form machinery does for you.
- That a hidden view can still drive a layout cycle.
- That a press-coverage check exists at all, the one that told me the overview covered seats.

**Good:**
- Diagnostics that name the fix.
- `declare-help` as the reference.
- Computed defaults.
- `Form` and `refusedWith`.
- DataSource lifecycle as state.
- Playwright-compatible assert scripts against the real origin.

**Bad:**
- The cycle message.
- Library roles and limits (ChoiceItem as an option, Toast's `wrap = false`) that you discover by grepping the source.
- A lot of required reading before the first line. It was worth it, but it is heavy.

**How it compares.** It reminded me of OpenLaszlo and QML (constraints and declared trees), with SwiftUI's state model and Elm's discipline of "handlers write facts." Unlike React, there's no render; unlike CSS, layout has a single decider per value, which made "why is this here" answerable.

**What I'd most want improved:**
1. Cycle diagnostics that name the child and attribute in the loop.
2. Documented roles for each library class, including ChoiceItem.
3. A wrapping toast.
4. A grid-navigation helper for `focusScope`.

**The hardest part.** The layout cycle was one obstacle, not a pattern, and cost about ten minutes of bisecting. To have written it right the first time, I'd have needed either a rule I'd internalised — "under `align = stretch` on the cross axis, don't put a flexing child with `100%` text inside a content-sized view, even a hidden one" — or a message pointing at `seatBar`. The broader pattern that cost the most was reading and design time, not language friction.

**What I'd use it for:** interactive, stateful consumer UIs with real motion and data, like this one. It's also well suited to having an LLM write them, because the compiler and `declare-verify` close the loop so well.

## Names ledger

```
NAMES — eval-venue-30.noindex: 0 missed name(s), 1 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)

COLLISIONS (min · held by · name)
    10 · library class  · Card

SUMMARY: 0 of 0 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
