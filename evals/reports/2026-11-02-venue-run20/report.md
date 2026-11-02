# Venue run 20: Opus 5.5, Declare, after the layout chapter rebuild

**Run:** 2026-11-02, `evals/craft/launch.sh venue-checkout`, model `claude-opus-5-5`, on a fresh download of the
distribution at 9ba68242 (evals/, docs/system-design/, test/ removed). That build has the rebuilt layout chapter
(the notes reader, sizes by where they come from, `// new` markers, the comes-from/decided-by table), the scrolling
model stated at the top of declare.md §6 and of the scrolling chapter, `centerX`/`centerY`, the `Form` refusal fix,
and the brief's singular summary. Prompt in `prompt.txt`; the account's questions in `impressions.txt`.

**Files beside this report:** the app and its checks (`app/`); the hidden checks' results at first clean boot and
delivered (`drive/`).

## Figures

| | **Venue 20** (Opus 5.5) | Venue 19 (Opus 5.5) | Codex 3 (GPT-6 Astra, Extra High) |
|---|---|---|---|
| working time | **23.0 min** (102 turns) | 26.8 min | 29.1 min |
| reading, then first write | 6.5 min | — | ~1.3 min |
| first clean boot (verify, R4) | **13.2 min** | — | 8.8 min |
| output tokens | ~115k | — | ~49k |
| hidden checks, first clean boot | **11 of 11** | 11 of 11 | 3 of 11 (7 with "1 seats") |
| hidden checks, delivered | **11 of 11** | 11 of 11 | 5 of 11 (11 with "1 seats") |
| layout cycles, refused deciders | none; one decider conflict at boot, fixed from its message | — | none |

The first run scored strictly on the brief's singular summary ("1 seat · $80.00"): no asterisk.

**Reading:** the whole first read (`declare.md`, guide 01/04/05/06, the to-do app), then 14 (data), 08 (controls),
18 (overlays), 19 (accessibility), 10 (touch), `verify.md`'s assert section, about 40 `declare-help` lookups. It
also read library source — `form.declare`, `field.declare`, the `Combobox` class, the default theme — and found a
release note's card-number example by grep: reference gaps (Form's membership and refusal order, FieldLayout's
widths, Combobox matching, field padding tokens). It skipped 07 (scrolling), and says so was a mistake.

## Layout

The one-decider model held: "This 'one decider' rule is the real model, and once internalized it's good." No
cycle, no refused place; one decider conflict at boot (a `State` setting a `Field`'s width under a layout that
sized it), fixed from the message, which "named the exact fix".

- **It chose panes over the page, against the docs.** Every screen is `App [ scrolls = none ]` with inner panes,
  though declare.md §6 now opens with the model and says an App scrolls by default and its scroller is the page.
  In its words: "Skipping `07-scrolling` was a mistake … That goes against the platform's advice, and it is the
  choice I'm least sure of on a real phone." The same as Codex 3: stating the default is not enough; the first
  read gives no reason to prefer it (the physics, the browser's bars, pinch-zoom only on the page).
- **Conditional sizes.** It reached for `width = { app.phone ? null : 100% }` several times (two refusals,
  DECLARE6001 "computes a null … typed Length"); the answers were a `State` or `align = stretch`. One round trip each.
- **`%` inside a `{ }`** twice (DECLARE2000, the rewrite named).
- **Boot findings, real:** seats under 44 × 44 on a phone (raised to 44); a payment row past a phone's right edge
  (its own); a long confirmation line (its own); a field error message past the edge — `FieldLayout` gave every
  message at least 160 px (the library's).
- **A padded `TextInput` collapsed** without a word: `padding = [0, 96, 0, 12]` replaced the theme's vertical
  padding. It asks for a warning for a field shorter than its text.

## Audit

- **"seats.2 44×44 smaller than 44 × 44". Confirmed, fixed.** The size was 43.6 and the message rounded it.
  Sizes in that message now show a tenth when not whole (`runtime/src/boot-check.ts`).
- **FieldLayout's 160 px message floor overflowing a narrow field. Confirmed, fixed.** The message still spans
  its controls with a 160 floor, but never past the field's own room when it has one (`library/field.declare`).
- **Combobox: a country typed whole by the driver was not picked.** It depends on how many characters arrive per
  event (`t.length - query.length > 1`). Real; not fixed here. Open.
- **`enterMoves` stopping on a "Show password" checkbox.** By the rules (a checkbox is a member); it finds it
  wrong. Open, a judgement.
- **Our own purchase announced as "taken by someone else"** (the seat stream arrives before the order reply). Its
  logic; it says any app on this API would hit it. Not the platform.
- **Reserved names `key`, `scale`, `backdrop`; `classroot` outside a class; named values inside `{ }`;
  shadowing.** Its code; each message served.

## Is it idiomatic Declare?

| | Venue 20 | Venue 19 | Codex 3 |
|---|---|---|---|
| code | 1,368 lines Declare | 1,221 lines Declare | 734 lines Declare, 58 lines TS |
| bytes | 79 KB | 65 KB | 47 KB |
| lines over 150 characters | 7 | 3 | 9 |
| colour literals outside theme declarations | 1 | 2 | 4 |
| theme reads | 95 | 84 | 47 |
| States | 1 | 3 | 1 |
| visible switches (visible = { x == '…' }) | 4 | 2 | 5 |
| branches on width or phone | 32 | 21 | 15 |
| flexes | 25 | 20 | 9 |
| browser scripts (host = browser) | 0 | 0 | 0 |
| page lookups (document.querySelector…) | 0 | 0 | 0 |

Theme-disciplined and flexing more; 32 branches on width or phone is the number that moved, most of them
per-attribute adjustments (`fontSize`, `padding`) rather than divisions of room.

## What changed because of this run

- `runtime/src/boot-check.ts`: a touch-target size is said to a tenth when it is not whole.
- `library/field.declare`: a field's message never runs past the field's own room.

## Its account, word for word

# Building Venue in Declare: an account for the people who make it

I changed nothing for this. Everything below comes from the build session. Where I say "unsure", I mean it.

## (a) Getting up to speed

**What I read, in order.** I followed `skill/SKILL.md` as written:

1. `README.md`, then `skill/SKILL.md`.
2. `docs/declare.md`, whole.
3. The four chapters it names, `docs/guide/01-what-declare-is.md`, `04-structure.md`, `05-run-and-check.md` and `06-layout.md`, all whole.
4. `apps/todo/todo.declare` and `todo-parts.declare`, whole.

After that I read only what the plan needed:

- **Data and forms:** `14-data.md` from "Where data comes from" through "A form in a sheet".
- **Controls:** `08-controls.md` on text fields, choosing one of many, and keyboard focus.
- **Whole chapters:** `18-overlays.md`, `19-accessibility.md` and `10-touch.md`.
- **Checking:** the "Writing an assert script" section of `docs/operational/verify.md`.
- **`declare-help` lookups**, about 40 of them: `Form`, `Field`, `TextInput --all`, `TextInput.purpose`, `DataSource.credentials`, `EventStream`, `RadioGroup --all`, `Carousel --all`, `View.focusScope`, `View.scrolls`, `scrollTo`, `waypoint`, `DrawContext --all`, `Spring`, `ProgressBar` and others.
- **Library source:** I read `library/form.declare`, `library/field.declare` and the `Combobox` class in `library/combobox.declare`.
- **A release note:** grep found `releases/v0.5.3.md`, which had the only worked example of a card-number field that regroups as you type.

**What I skipped, and why.** I skipped `02-notation`, `03-constraints`, `07-scrolling`, `11-paint-and-themes`, `12-text`, `16-collections`, `20-urls`, `21-motion` and `23-animated-arrangements`. The skill said to read on demand, and `declare.md` plus `declare-help` covered what I asked. Skipping `07-scrolling` was a mistake. `10-touch.md` says "When touch matters, primary content belongs on the page's scroll", and the scrolling chapter presumably explains why. I built every screen as a fixed frame with inner panes (`App [ scrolls = none ]`) anyway. That goes against the platform's advice, and it is the choice I'm least sure of on a real phone (see f). I used `location` and `waypoint` from `declare-help` alone, without reading `20-urls`. I suspect the Back-button behaviour has gaps I didn't test.

**What taught me the most:**

- **The to-do app.** Reading it whole made the shape of a program obvious before I wrote a line: a dataset class, user state on the App, `exists` versus `visible`, a Sheet opened as state with `input(open)`, controls with a `press()` written where they're used, and `trackChanges`/`onChange`.
- **`library/form.declare`.** Its header and its code answered questions the guide didn't. A hidden or disabled member doesn't count. `refusedWith` runs before the refusal is laid on the fields. I could override `refusal()` to drop a message. `submit()` does nothing while `pending`, which is the whole double-pay story. The skill says to prefer `declare-help` over reading library source. For Form, the source was more decisive than either the reference entry or the guide.
- **The one snippet in `releases/v0.5.3.md`** for regrouping card digits with `select()` inside `onInput`. Without it I would have guessed at caret handling.

**What was missing or misleading:**

- **No worked checkout example.** There's no checkout, or any form with conditional sections, anywhere in the docs. I had to infer that one `Form` holding both a saved-card section and a new-card section would judge only the visible one. It did, but I learned it from the source.
- **No idiom for a visually hidden heading.** I wanted screen headings that show nothing but are announced when the screen changes. I wrote `width = 1, height = 1, opacity = 0, focusable = quiet`. Only now, writing this, do I remember that `19-accessibility.md` says a view "faded to `opacity = 0`, is passed over". My hidden headings may never be read. Nothing warned me, and I found no documented alternative.
- **Typing an alias loses the use-site members.** `04-structure.md` recommends declaring an alias on the App for a view used from far away. It doesn't say that typing the alias as the class (`payForm: PayForm = { … }`) hides the children and members declared where the instance is used (see d, item 12).
- **The Combobox autofill claim.** "Text that arrives whole and names one item… picks that item" reads as if autofill just works. Browsers often fill a `country` field with a code ("GB"), and the match is on labels only. In my test harness the "arrives whole" path didn't fire at all (d, item 18).

## (b) Expressing what I wanted

**Where it fit:**

- **The data model.** Everything stays derived: seats source → `Hall` dataset class (geometry) → seat views, with `chosen` and `pay` as the only user state. Not one line of my code updates a view.
- **Forms.** `required`, `validate`, field `name`s that match the service's `field` values, `refusedWith`, and `submit()` ignoring presses while `pending` together covered most of §4 in the brief, double-press protection included. The 422 answers landed on the right field with no code of mine.
- **Live seats.** An `EventStream` with a constraint on `url` plus one handler made "the room must not lie" about ten lines.
- **Small motion.** The seat's selection pop is a `Spring` with low damping that `draw()` reads, and the summary bump is a spring written to 1 that settles back to 0. Both were a few lines.
- **Drawing.** `draw(d)` on any view was the right tool for the hall floor, the miniature house and the barcode.
- **Autofill and keyboards.** `TextInput.purpose` and `concealed` gave me autofill, phone keyboards and show-password without touching the DOM.
- **Keyboard in the hall.** `focusScope = stop` plus `focusEntry()` made 648 seats a single Tab stop.

**Where I worked around it:**

- **Conditional sizes.** I reached for `width = { app.phone ? null : 100% }` several times. The working forms were a `State`, or `align = stretch` on the parent's layout. Both are fine once known, but they cost one round trip each time.
- **Arrow keys over geometry.** `focusScope = stop` follows member order, and on screen my seats run right to left. So I handled every arrow key myself in `onKeyDown` and found the target view with `childViews.find(v => v.seatId == id)`. That's a scan of the rendered tree, which the language discourages, but in a handler I saw no other way to get a view from a record id. A documented "view for record" lookup would help.
- **A datapath needs a dataset.** I couldn't point `datapath` at a computed literal (`{ ({ rows: app.chosenPlaces }) }`) and had to declare a derived `basket: Dataset` just to replicate the order lines. That's defensible, but it's ceremony.
- **Country autofill.** I gave the Combobox use site `trackChanges = ["query"]` and an `onChange` that picks a typed name or code. It works, but it's a patch over library behaviour.
- **Keeping a field's height.** To overlay a brand badge in the card field, I wrapped the `TextInput` in a `View` and gave it four-value padding. That replaced the theme's vertical padding and collapsed the field (d, item 16).

## (c) The first time it ran

The first `declare-look` shots of the list and the desk hall were close to right, which surprised me. What was wrong:

- **The Orchestra floor was a wide wedge.** I had drawn each section's floor with the widest half-angle of any of its rows, and the front rows have the widest angles. I saw it in the screenshot and switched to a polygon that follows each row's ends.
- **The Orchestra label touched row A's curve.** Also found by eye. I pushed the front row back (`R0` from 12 to 13) and moved the stage.
- **The card-number field was squashed** to roughly half height. I saw it in the checkout shot. The cause was my padding override.
- **The Combobox was 30 px tall** next to roughly 40 px text fields. Also by eye. I added theme tokens for both (`comboboxHeight`, `fieldPadding`).
- **On the phone, the first view was the stage,** a dark band filling the screen. Found by eye. I changed the opening scroll on phones to centre on the best free seat.
- **The miniature house was tiny** at 96 px tall. I enlarged it and moved it beside the date.
- **A dark bar sat under the first ticket.** I took it for a Carousel clipping bug, but it was a Toast. I only worked that out after taking a second shot 7 s later and printing the live-region text. That text exposed a real bug: our own purchase was being announced as "taken by someone else" (d, item 19).

## (d) Every refusal and surprise

I've numbered these in the order they happened.

1. **Percentage in braces.** I wrote `width = { app.phone ? null : 100% }` in `PerfCard`. The compiler said DECLARE2000, "there are no percentages: read the parent and scale". I moved the desk width into a `State`. *My error.* `declare.md` §2 says it plainly; the CSS habit won anyway.
2. **A child named like an attribute.** I named a child `backdrop:` in `HallView`. DECLARE2000: "is an attribute — a child may not take an attribute's name". I renamed it `plan`. *My error*, though nothing could have told me `backdrop` was taken without asking `declare-help`. Good message.
3. **Declaring an attribute that exists.** I wrote `scale: number` on `MiniHouse`. DECLARE2000: View already has `scale`. I renamed it `k`. *My error.*
4. **`key` is reserved.** I wrote `key: string` on the hall pane. DECLARE2000: "'key' is replication metadata… choose another name". I renamed it `opened`. A surprising reservation, but an excellent message. *Fine.*
5. **Percentage in braces, again**, in `SignInForm`'s width. Same fix pattern. *Mine.*
6. **Bare enum tokens in braces.** I wrote `fontWeight = { classroot.scarce ? semibold : regular }` at three sites. DECLARE4005: inside `{ }`, write it as a string. I quoted them. *My error, and a pattern:* items 1, 5 and 6 are the same "vocabulary stops at the brace" rule hitting me three times. Cheap to fix, a minute each.
7. **`classroot` on the App.** I wrote `text = { classroot.error }` inside the App's tree, on the form's error banner. DECLARE4003. I changed it to `app.payForm.error`. *Mine.*
8. **`rowIndex` read on the wrong view.** DECLARE4023, a warning: `TicketCard` reads its own `rowIndex`, not the row's. I changed it to `parent.rowIndex`. *This was a real bug the warning caught;* every ticket would have said "1 of 3". The warning was valuable.
9. **A radio outside its group.** DECLARE4032: `CardChoice` was a radio outside a `RadioGroup`, because I had wrapped the replicated cards in a `View` holding a datapath. I moved the datapath onto the `RadioGroup` so the choices became its direct children. *A real a11y bug caught.* The direct-children rule is documented in the reference entry, not in the guide section I read.
10. **Unnamed progress bars.** DECLARE4017. I added labels. *Fine.*
11. **Two smaller lint catches.** First, choices nested three deep in `step` (DECLARE4025, lint); I named the facts `booked`, `paying` and `inHall`. That made it more readable. Second, a bare `perf` inside the seats source shadowing the App's `perf` (DECLARE4002); I renamed it `forPerf`. *Good catch:* that one was confusing, though not yet buggy.
12. **A datapath to a fresh literal.** DECLARE3006: "a literal is in none — declare the records as data". I added a derived `basket` dataset. *Platform rule, clearly explained.* I'd call it slightly over-strict for a read-only replication. Unsure.
13. **A typed alias hides members.** I wrote `payForm: PayForm = { … }` and then `f.savedCode.code`. DECLARE6001: `'savedCode' is not a member of PayForm`. I used the full path from `app.payScreen…`. *Docs unclear.* The aliasing advice should say that an alias typed as the class loses what the use site added. Or the platform could infer the instance's own type.
14. **`null` for a Length.** I tried `width = { app.phone ? parent.contentBox("width") : null }` on the City and postal-code fields. DECLARE6001: a null where `width` is typed Length. That pushed me to a `State`. *Mine.*
15. **A width the layout owns.** At boot (R4): `Field.width — View's SimpleLayout sizes its children… 'align = stretch'`. The `State` setting width conflicted with the layout's `flexes`. I made the layout `align = { app.phone ? "stretch" : "start" }`. *My CSS instinct.* The message named the exact fix. This "one decider" rule is the real model, and once internalized it's good.
16. **Padding replaces the field's own padding.** I wrote `padding = [0, 96, 0, 12]` on the card-number `TextInput`. No error; the field rendered short. I changed it to `[12, 96, 12, 12]` plus a theme `fieldPadding`. *My error.* The reference says padding is the content box. A layout warning ("a field shorter than its text") would have caught it.
17. **Layout findings:**
    - **"68 controls smaller than 44 × 44"** at a pitch of 40. A fair catch; I raised the phone pitch to 44.
    - **"seats.2 44×44 smaller than 44 × 44"** after that. *Platform looks wrong,* probably float rounding or the pop scale. Unsure.
    - **Two overflows past the right edge of a 390 px screen.** One was a `Text` missing `width = 100%`, which was mine. The other was `newCard.8.1.msg`: `FieldLayout` gives every error message `Math.max(160, …)` width, which overflows a half-width field on a phone. That second one is a *library quirk*; I stacked the fields instead.
    - **`ticketsScreen.col.2` overflow,** a long confirmation line. Mine.
18. **The Combobox didn't pick a country.** I filled "United States" through the driver; the field showed the text, but `pay.country` stayed empty, so the postal field kept the label "Postal code". I found it with a debug script that dumped every `aria-label=value`. A synthetic single `input` event did pick the country, so the "arrives whole" heuristic (`t.length - query.length > 1`) depends on how the text arrives. I added my `onChange` on `query`. *Platform fragile.* Matching on labels only also misses autofill codes. Unsure what real Chrome autofill sends.
19. **Our own purchase reported as someone else's.** Seats in our own order arrived on the live stream as `seatchanged` before the order's response. My `seatTaken` removed them and toasted. I skipped that while `app.order.loading`. *My logic,* though it's a trap any app with this API would hit. It's worth an example if live streams are ever taught.
20. **A focus call that couldn't land.** At runtime: "Focus.focus(app.hallScreen.heading): it is not focusable". The heading was `visible = false` on phones. I removed the `visible` gate. *Mine;* the note was clear.
21. **Return moved to the checkbox, not submit.** With `enterMoves = true` on the sign-in form, Return in Password went to "Show password" instead of submitting. Seen in a screenshot. I removed `enterMoves` from that form. *Unsure.* It's arguably right by the docs (a Checkbox is a member), but a checkbox as a "Next" stop feels wrong.

## (e) Verifying it

**How I checked:**

- **`declare-verify`** after every batch of edits, each run a few seconds.
- **`declare-look --url … --shot`** at 1280, 1440×900 and `--phone`, using `--set app.location=p17` to jump straight into a hall. That shortcut was very handy.
- **Assert scripts in `my-apps/venue/checks/`:**
  - `desk-guest.mjs`: guest booking, grouping, the ZIP error on leaving the field, a double press, and `expect.request(… count: 1)`.
  - `phone-signin.mjs`: the §10 story, end to end, on a touch device.
  - `keyboard.mjs`: Tab, the arrows and Space in the hall.
  - `seat-taken.mjs`: another buyer posts an order through `page.evaluate(fetch …)`, and the script checks the seat leaves the choice with the right message.

**What each check caught:**

- **The compiler and lint:** items 1–15.
- **Boot:** item 15.
- **Layout findings:** item 17.
- **The asserts:** item 18 (the Combobox) and the Enter behaviour in item 21. They also proved the decline flow, the field refusals and the one-order guarantee.
- **Screenshots:** everything in (c).
- **Reading the live region from a script:** item 19, which nothing else would have found.

**How well the tools served me:** very well. Playwright locators inside `--assert` meant I tested exactly what the brief's grader will: roles, exact accessible names, `getByLabel`. The notes about writes to the live service ("this run failed after talking to … which earlier runs wrote to") were thoughtful. The virtual clock versus `waitReal` took one read to understand, and I used `waitReal` for the 1.5 s order. I wanted, but didn't have, a quick way to see visually hidden but announced content. And I never wrote a states script (R6).

## (f) Confidence, part by part

- **§1 Picking a performance: high.** The "nearly sold out" threshold (15%) is my choice.
- **§2 Choosing seats.**
  - **Desk: high.** Accessible names are tested exactly. Seat states differ by shape. Live updates are tested.
  - **Phone: medium.** Seats are 44 pt, tested with touch, and the miniature works. But I put the hall in an inner pane that scrolls both ways. Pinch-zoom won't upgrade there, and I never watched the miniature's viewport rectangle follow a real drag. I believe it's reactive; unsure.
- **§3 Signing in: medium-high.**
  - **Tested:** the wrong-password sentence, signing in mid-checkout with typed values kept, saved cards, and the expired card disabled.
  - **Not tested:** sign out (`DELETE` returns 204, then `me.clear()`), and staying signed in across a reload.
  - **Minor:** a "Signed in as" toast covers the lower page for 6 s.
- **§4 Paying: medium-high.**
  - **Tested:** grouping, brand, Luhn, expiry, the code length by card kind, postcodes, errors only after leaving a field, the decline clearing only the code, a 422 on the field, and the single order.
  - **Not exercised:** the 409 "seat taken at payment" path. The live stream always got there first.
  - **On a real phone:** keyboard occlusion inside the inner pane is untested.
  - **Autofill:** the country field is fragile, and card autofill needs HTTPS in practice.
- **§5 Tickets: high on content. The barcode is unproven:** it's real Code 128B, and I checked the pattern table's widths and uniqueness, but I never scanned one.
- **§6 Look and motion: medium.** The thumbnail is distinctive. Some copy is mine ("Please be in your seat before curtain up").
- **§6 Accessibility: medium-low**, because of naming:
  - **Hidden headings:** my opacity-0 screen headings may be skipped by screen readers.
  - **Buttons not named by what they say:** I overrode some names. The masthead "Grand Hall" is named "Grand Hall, all performances", the account button shows "Ada" but is named "Account: Ada Lovelace", and "‹ Back" is "Back to performances". That breaks the brief's "buttons by what they say". A tester using exact names will hit these.
  - **A stray field:** when there's no saved card, a hidden field labelled "Security code for  ending " still exists in the tree. It isn't visible, so it should be excluded, but it's untidy.

## Surprises

- How much worked the first time it ran: the decline handling, the refusals landing on fields, the one-payment guarantee, the live seat updates.
- `key`, `scale` and `backdrop` turned out to be reserved names.
- The FieldLayout's 160 px minimum for error messages.
- The Combobox heuristic.
- That the warnings (4023, 4032) found real bugs, not style.

## Good and bad

**Good:**

- The diagnostics name the fix, nearly every time.
- The constraint model removes all update code.
- Form semantics are genuinely thought through.
- `purpose`, and the accessibility contracts checked at compile time.
- `declare-verify` with Playwright locators.
- The to-do app as a teaching text.

**Bad:**

- The brace-vocabulary rule bites repeatedly. It was cheap, but it was a pattern.
- How a typed alias interacts with use-site members.
- No documented idiom for content that is visually hidden but read aloud.
- Library behaviours that decide outcomes (Form's membership, FieldLayout's widths, the Combobox match) are clearer in the source than in the docs.
- A few small layout-checker false positives.

## How it differs, and what it reminded me of

It's closest to QML: property bindings, `State`s, declarative children, JS inside. It's also close to Flex/MXML and, as the README says, OpenLaszlo, with datapath replication that feels like XSLT. Unlike React there's no render function and nothing to reconcile, and unlike SwiftUI the layout is "one decider" rather than a negotiation. The compiler analysing dependencies statically, and refusing what it can't follow, is the real novelty. It made me write narrower expressions, which was mostly a good thing.

## Where I'd most like improvement

1. **A checkout-style worked example** covering conditional sections, saved versus new card, refusals, autofill and a phone layout. It would have saved most of my source reading.
2. **A visually-hidden-but-announced primitive,** or a warning when `focusable` meets `opacity = 0`.
3. **Inferring the instance type for App aliases,** or at least documenting that a typed alias loses use-site members.
4. **Combobox:** match on ids and codes too, and don't rely on how many characters arrive per event.
5. **A lookup from a record's identity to its replicated view,** for keyboard grids.

**The hardest part, judged as asked:** it wasn't the platform. It was the phone seat-picking design: overview-then-zoom versus thumb-scale seats with a miniature. It was one obstacle, costing perhaps 15% of the session in thinking. To get it right the first time I'd have wanted a "surface you pan, with an overview" example in Declare's idiom. The sharpest platform edge was the brace vocabulary: a pattern of about four hits at a minute each, which better habits would remove.

## What I'd use it for

I'd use it for consumer-grade, interaction-rich apps with modest dependencies: booking flows, dashboards, editors and visual tools, especially where an LLM writes most of the code and the compiler has to act as the reviewer. I'd hesitate where a large third-party component ecosystem or an existing React codebase matters, and I'd want a real-device pass before trusting the touch and on-screen-keyboard behaviour.

## The names ledger

```
NAMES — eval-venue-20: 2 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    13 · member    · savedCode            · PayForm                  · —                  · none         · ×1  ·   13 · resolved
         'savedCode' is not a member of PayForm — declare it (savedCode: <type> = …) or fix the name [DECLARE6001] (line 443, col 46)
    13 · member    · newCard              · PayForm                  · —                  · none         · ×1  ·   13 · resolved
         'newCard' is not a member of PayForm — declare it (newCard: <type> = …) or fix the name [DECLARE6001] (line 443, col 65)

SUMMARY: 2 of 2 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
