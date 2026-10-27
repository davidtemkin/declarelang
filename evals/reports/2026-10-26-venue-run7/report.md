# Venue run 7: Declare a1edccb3 (forms), Opus 5.5

**Run:** 2026-10-26, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-7 claude-opus-5-5 a1edccb3 8350` against GitHub main.

The same brief, service, port, model, tools and prompt as run 6. The one change is **forms** (`209fffda`): `Form`,
`Field` with its message line, `ValueControl`, and on every field `name`, `required`, `validate`, `refuse`, `problem`,
`judged`, with `judgeOn = leave` as the default. The commit also carries a fix for a pinch on a drawing beside a
virtualized list (`2fd3b004`), which nothing in Venue exercises. The point of the run was to see whether an agent
finds and uses the forms, and what it still builds by hand.

**Try it:** the app's four files, its seven scripts (`tests/`), twenty pictures from the build (`shots/`) and the
acceptance results (`drive/`) are filed beside this report.

## The comparison

Build figures come from the build's own final record. The account was asked for afterwards in a read-only resume
(1.2 min, 6.4k output tokens) and is counted separately.

| | Venue 5 | Venue 6 | **Venue 7** | Venue React 1 |
|---|---|---|---|---|
| Declare commit | `d7e80f80` | `1b3064f2` | **`a1edccb3`** (forms) | — |
| time | 36.0 min | 26.7 min | **25.6 min** | 31.4 min |
| turns · tool calls | 155 · 154 | 117 · 116 | **108 · 110** | 101 · 97 |
| code, raw lines | 1,948 + 292 script | 2,095 (5 files) | **1,814** (4 files) | — |
| code, excluding comments and blanks | 1,522 + 227 script | 1,606 | **1,390** | 4,861 |
| **Tokens** | | | | |
| output (incl. thinking) | 161k | 129k | **115k** (48k) | 147k |
| fresh input (cache writes) | 353k | 326k | **291k** | 199k |
| cached input re-read | 36.9M | 23.9M | **19.6M** | 9.3M |
| read before first app write | 350 KB | 400 KB | **387 KB** | 23 KB |
| context at first write → end | 174k → 359k | 189k → 332k | **191k → 299k** | 42k → 205k |
| first app write at | 6.6 min | 6.6 min | **7.6 min** | — |
| **Download (gzip)** | 173.3 KB | 174.3 KB | **170.3 KB** ¹ | 158.5 KB + ~85 KB fonts |
| hidden acceptance (`drive.mjs`) | 10 of 11 | 11 of 11 | **10 of 11** ² | 11 of 11 |
| runtime source read | 2 calls | 1 call | **0** | — |
| library source read | 7 calls | 5 calls | **4 calls** (`form`, `field`, `radiogroup`, a theme) | — |
| tool source read | — | — | **2 calls** (`look.mjs`, `crossrender.mjs`) | — |
| names refused by a check | — | 4 | **2** (both resolved) | — |

¹ `declarec --sizes` from main: program 35.1 KB, runtime 122.4 KB, kernel 12.6 KB.
² `phone_guest_pays` fails: see *The phone purchase*, below. Run 6 passed it.

**The headline: the forms were found and used, and the form code that run 6 hand-built is gone.**
- **Code:** 216 fewer lines than run 6 (1,390 against 1,606). The checkout file alone is 319 lines; run 6's was 384
  with ~150 of them its own form layer.
- **Cost:** cached input down a further 18% (19.6M against 23.9M); output down 11%.
- **Time:** 25.6 minutes, level with run 6 and still faster than React.
- **Acceptance:** 10 of 11. The one failure is the phone seat map, not the forms; every form scenario passes
  (declined card and retry, wrong security code, wrong password, a bad postcode kept home, signing in midway).

## Where the time and the tokens went

| phase | time | API calls | cached input re-read | share |
|---|---|---|---|---|
| **Reading and planning** (0–7.6 min) | 7.6 min | 29 | 3.28M | 16% |
| **Writing** the four files (7.6–13.4) | 5.8 min | 4 | 0.79M | 4% |
| **Debugging and verification** (13.4–25.6) | 12.2 min | 61 | 16.13M | **80%** |

27 `declare-verify` runs (19 with `--assert`), 5 `declare-look` runs, 14 pictures read, and **one browser script of its
own** (`tests/real.mjs`, puppeteer against the dev server at its real address). To write it the agent grepped
Declare's tool source for how the tools launch Chrome. Run 6 wrote none.

## Reading and docs

**The order the SKILL gives, followed:** README, SKILL, `declare.md` whole, chapters 01, 04 and 05, the to-do app whole.
Then by need: the forms half of `14-data.md`, `08-controls.md` § Text fields, most of `19-accessibility.md`, and many
`declare-help` lookups (`Form --all`, `Field`, `TextInput --all`, `DataSource`, `EventStream`, `RadioGroup`, `Sheet`,
theme tokens).

**The forms were found at once.** In its first five minutes it looked up `Form` and `Field` in full and read the new
§ A form. Its account: "§ A form in `14-data.md` was the most valuable single page. It matched my brief almost line
for line … That fit is useful but slightly unsettling. Either the docs were tuned on tasks like this one, or I got
lucky." (The guide's examples — a postal code that reads the country, `refusedWith` releasing seats a conflict names —
are close to Venue's; see finding D1.)

**Library source reads, and what each wanted:**

| read | what it wanted | what answers it |
|---|---|---|
| `library/form.declare` whole (twice) and `field.declare` | "when `_sending` flips, and that `refusedWith` runs before `showProblems`" | the `Form` reference states the order of `submit()` but not of a refusal's handling. One sentence in `refusedWith`'s entry would answer it (D2) |
| `library/radiogroup.declare` | how a radio group holds its choice and focus | `declare-help RadioGroup --all` has it; read alongside |
| `library/themes/sanfrancisco.declare` | the theme tokens' values | `declare-help "theme tokens"`, also used |
| `tools/look.mjs`, `tools/crossrender.mjs` (grep) | how the tools find Chrome, for its own puppeteer script | nothing should need to: see T1 |

## Names

From `names.txt`: **2 misses, 0 collisions, 0 `declare-help` misses, 0 empty searches.**

| min | name | on | the platform's answer | what was right |
|---|---|---|---|---|
| 14 | `intro` | this View | DECLARE6001, no hint | its own child, reached from a sibling class; the path, not a foreign name |
| 14 | `heading` | this View | DECLARE6001, no hint | the same: its own `heading` child, named in two classes |

Neither is a name carried over from another framework. A third collision did not show as a miss: the agent named a
child `form` inside its sign-in `Sheet`, which collided with **`Sheet.form`**, the sheet's own attribute for how it
presents itself (`end`, `bottom`, `center`). Its account: "That `Sheet.form` is an attribute only surfaced when I named
a child `form`." With `Form` now a class every form is built from, a sheet attribute called `form` is a trap (L1).

## The forms

**What it used, and how** (`venue-checkout.declare`, `venue.declare`):

- **Two forms, each a class of its own.** `PaymentForm extends Form` with `source = { app.order }`, a `failedMessage`
  in the box office's voice, and `refusedWith` reacting to a decline (empties the codes), a seat conflict (releases the
  taken seats, back to the hall) and a lost session (`app.me.clear()`). `SignInForm extends Form` with
  `source = { app.session }`; a wrong password lands in the form's `error` with no code.
- **Thirteen `Field`s, all `stacked`,** each with a specific `required` message ("Enter the security code from the back
  of your card.") and `validate` where a rule applies. The postal code's rule reads the country
  (`postalProblem(v, classroot.co.country)`); the expiry reads the clock. Names match the service's keys (`cvc`,
  `postalCode`, `line1`), so the service's 422s land on their fields with focus moved there (`shots/p-postal.png`).
- **The values stayed on a model** (`Checkout extends Node`, computed defaults that follow the account until typed) —
  the run 6 idiom the account calls "the best moment of the build", unchanged by the forms.
- **The saved card and the new card are `visible`-switched branches**, and only the shown one counts: the
  saved-card payment (`signed_in_saved_card`) passes with the new-card fields empty and hidden.
- **The country is a `RadioGroup` with `required`,** a `ValueControl` field like the text ones.

**What it still built by hand:**

1. **Return to the next field** (`PaymentForm.advance()`, `venue-checkout.declare:71–82`): every field declares
   `onEnter() { classroot.advance(this) }`, and `advance` sorts the form's members in reading order using the internal
   `_counts` and a copy of `_collect`'s sort. The brief asks for it, and the design has nothing: Return in a field
   submits its form. The account: "Reaching into an underscore member feels wrong." (L2)
2. **The Pay button outside the form** reaches it by path: `payForm: PaymentForm = { app.checkoutScreen.main.form }`,
   and `pay()` calls `payForm.submit()`. This is the shape the design review predicted; it works.
3. **A redundant guard:** `pay()` returns when `order.loading || payForm.pending`; `submit()` already does nothing
   while pending. Harmless.
4. **Its own field edge** (`Entry`, a `TextInput` subclass, restyles the stroke with the error colour) duplicating what
   TextInput now does by default — a design choice of the app's, consistent with its look.

**Against run 6:** gone are `FormField` (~55 lines), the refusal bookkeeping (`refusedField/Value/Message`,
`refusal()`, `refuse()`, `fieldValue()`), `fresh`, `problems()`, `fieldFor()`/`takeTo()`, the judge loop in `pay()`,
the `paying` flag and the `trackChanges = ["loading"]` refusal handler.

## API and language

**What the compiler caught,** three compile rounds before it booted:
- bare `semibold` inside braces (DECLARE4005) — the token-versus-string spelling, again;
- a literal `datapath = { { cards: app.cards } }` (DECLARE3006) — it declared `cardData` and `chosenData` instead;
- a wrong argument count on `Toast.say`;
- `super.onFocus()` refused: a handler has no base method there;
- the two name misses above;
- **DECLARE4013**, overriding `press()` on a `Button`: "No other toolchain I know catches that."

**Where it worked around something** (account, (b)):
- **Zoom about a point in a scrolling pane:** on a phone the hall is an overview, and a tap zooms; the pitch switches
  and `scrollTo` runs in `afterSettle`, with no animation. "The part of the app I'm least satisfied with." (L3)
- **A spatial grid's arrow keys:** `focusScope = stop` walks tree order; it wrote a neighbour search. (L4)
- **Decorative views:** no way to hide 52 row letters from screen readers; it moved them into `draw()`. (L5)
- **No select:** the country is a `RadioGroup`, which browser autofill can't fill; it infers the country from an
  autofilled postal code. (L6)
- **`parent.width` ignores padding:** a ticket card ran edge to edge on the phone until a picture showed it.

## Debugging and verification

| # | the question | steps | outcome |
|---|---|---|---|
| E1 | does it compile and boot? | 3 × `declare-verify` | the spelling, datapath and `Toast.say` errors, each fixed from its message |
| E2 | does it look right? | `declare-look` at desk and phone, `--semantics` | the ticket card edge to edge on a phone (`parent.width` and padding) |
| E3 | does the brief's §10 story hold, at a desk and on a phone? | `flow.mjs`, `keyboard.mjs`, `conflict.mjs`, `phone.mjs`, `signin-phone.mjs`, `phone-buy.mjs` | all pass; `expect.request` with a partial body asserts one declined order then one accepted |
| E4 | retyping a password in a test | `drive.selectAll`, then `Meta+a`, then End + Backspace | neither select-all worked; the retyped text went in front of the old (T2) |
| E5 | addressing fields in tests | `"Security code"` matched the hidden saved-card field first; `"Password"` resolved to something without `select()` | worked around by path (T3) |
| E6 | does it work at its real address? | its own puppeteer script, after grepping the tools for Chrome's path | it does; the dev server it started later exited with code 1 and no message (T4) |

**The phone purchase.** `drive.mjs` fails `phone_guest_pays`: "never shown: 2 seats · $160.00". In the phone
overview an invisible `zoomer` view covers the hall (`venue-hall.declare:350`), and a tap anywhere zooms in rather than
choosing a seat. The driver presses each seat found by its accessible name, which is the path a screen reader's
activation takes; the first press zoomed, the second chose one seat (`drive/phone_guest_pays.png`). A screen-reader user
on a phone meets the same thing. The agent's own phone script chose seats after zooming, so it never saw this. The
platform could have caught it: a control whose accessible activation point is covered by another view's press
target is detectable (T5).

## Is it idiomatic Declare?

Yes, and the forms are the clearest part of it. Classes for the two forms; `source` and `refusedWith` instead of a
refusal handler; specific messages on every field; rules that read the model; values on a model of computed defaults;
`location` and `waypoint` for Back; an `EventStream` writing into the seat map; springs read by `draw()`.

### Missteps
1. **`advance()` through `_counts`** — reaching into the form's internals for a need the design lacks (L2).
2. **The zoom layer over the hall** — a pressable overlay that takes the seats' activations (the phone failure).
3. **The redundant pending guard** in `pay()`.
4. **`Dataset`s minted for computed lists** (`cardData`, `chosenData`) — the language's rule, again (L7).

## Findings, ranked by leverage

### Forms
- **L2 — Return moves to the next field.** A checkout's fields step forward on Return and submit on the last; the
  design submits on any. Give `Form` a `next(from)` (the next counted member in reading order) and let a field say
  `enterMoves = true` (or make it the default for a single-line field that is not the form's last), with the phone's
  keyboard key reading "Next".
- **L1 — `Sheet.form` collides with `Form`.** Rename the sheet's attribute (`presentation`, as `Dialog` already says).
- **D1 — The guide's form examples are close to Venue.** A postal code that reads a country and seats a conflict names
  are this brief's. Make them generic (a username and a display name; a promo code refused) per the standing rule.
- **D2 — `refusedWith`'s order.** Say in the reference that the refusal is laid on the fields first, then
  `refusedWith` runs, then `showProblems()`.

### Verification
- **T5 — A press target over a control's activation point.** Rung 4 could flag a control whose centre another view's
  handler covers — the phone failure here, and a screen-reader trap generally.
- **T2 — `drive.selectAll` and a select-all key don't select a field's text.** Reproduce and fix.
- **T3 — Test paths by name prefer the first match, hidden or not.** Prefer a shown view, or fail on ambiguity.
- **T1 — A browser script of its own.** It wanted the app at its real address; `declare-look --url` (or verify
  against a served page) would cover it, and Chrome's path shouldn't need finding in tool source.
- **T4 — The dev server exited with code 1 and no message.** Investigate.

### Language and library (from the account; not the forms)
- **L3 — A zoomable scroll pane** about a point, with motion.
- **L4 — A spatial focus scope** for grids.
- **L5 — A decorative flag** for screen readers, and a documented role-to-DOM table.
- **L6 — A select** that autofill fills (country above all).
- **L7 — A computed array as a replication source** (Cadence 17, Murmur 11, and here).

## The agent's account, verbatim

Asked after the build by resuming the finished session with read-only tools (Read, Glob, Grep), with the standard
questions (`impressions.txt`). 1.2 minutes, 6.4k output tokens, counted apart from the build. Also filed alone as
`account.md`.

### Building Venue in Declare: an account for the people who make Declare

I haven't changed anything for this. One housekeeping note: when the last session ended, the dev server I'd restarted may have stopped with it. If http://127.0.0.1:8200/my-apps/venue/venue.declare doesn't answer, run `npm start` in `declarelang/`.

#### (a) Getting up to speed

**What I read, in order:** `README.md`, then `skill/SKILL.md` (the skill file for agents), then `docs/declare.md` whole, then guide chapters 01, 04 and 05. Then the to-do app whole (`todo.declare` plus `todo-parts.declare`, about 1,350 lines). After that I read only what I needed:
- the forms half of `14-data.md` (§ Talking to a server, § Streams, § A form)
- `08-controls.md` § Text fields
- most of `19-accessibility.md`
- `library/form.declare` and `library/radiogroup.declare`, as source
- many `npx declare-help` lookups

**What taught me the most:**
- **`declare.md` gave me the model.** "Seven differences" and the table of set attribute versus declared computed default were the two passages I used most. The computed-default idea became the backbone of checkout.
- **The to-do app showed me the shape of a whole program.** Where state lives, `classFor`, `exists`, a Spring on a control. It was expensive in context, and I'm not certain all of it paid off. About a third of it (Glide, swipe rows, menus) never applied to Venue.
- **§ A form in `14-data.md` was the most valuable single page.** It matched my brief almost line for line: judging a field on leave, `submit()` judging everything, focus going to the first problem, `pending`, refusals landing by `name`. It even uses a `postalProblem(v, app.country)` example and mentions `refusedWith` "releasing seats a conflict names." That fit is useful but slightly unsettling. Either the docs were tuned on tasks like this one, or I got lucky, and I can't judge how well they generalise.
- **Reading `form.declare` as source answered timing questions the prose didn't.** For example: when `_sending` flips, and that `refusedWith` runs before `showProblems`. Library source was more trustworthy than my guesses.
- **`declare-help` was excellent.** The `TextInput.purpose` table, and the note under TextInput about regrouping a card number and restoring the caret with `select()`, were exactly what I needed, exactly where I looked.

**What was missing or misleading:**
- **No way to mark a view as decorative (hidden from screen readers).** I wanted 52 row letters to be decorative and found no attribute for it. I moved them into a `draw()` call instead, which works but is a dodge.
- **No documented mapping from roles to the DOM.** I couldn't tell from the docs what `accessibilityRole = toggle` becomes. I found out with `--js` that it's `role="button"` plus `aria-pressed`. That mattered because the brief's test looks things up by role.
- **`accessibilityDescription` doesn't exist; `accessibilityHint` does.** That's fine, but I only found it by elimination.
- **Cross-file child paths took trial and error.** That `Sheet.form` is an attribute only surfaced when I named a child `form`, and the path into a sheet's body was trial and error too.
- **`parent.width` ignores padding, and it bit me.** It is documented ("the escape hatch that still names the parent's literal box"), but `width = { Math.min(420, parent.width) }` inside a padded view reads naturally and is wrong. The ticket card ran edge to edge on the phone until I noticed it in a screenshot.

#### (b) Expressing what I wanted

**Where it fit my intent well:**
- **Signing in without losing anything.** `email: string = { app.account?.email ?? "" }` on a `Checkout extends Node` follows the account until the person types, and assigning replaces the formula. "Sign in halfway, keep what you typed, fill what's empty" took zero lines of merge logic. That was the best moment of the build.
- **The Form contract.** Server 422s landed on fields by `name` with focus moved there, with no code from me. The double-submit guard came mostly free.
- **Navigation state.** `location` held the performance, so it can be linked; `waypoint` held "gone to checkout", so Back undoes it but a stranger never sees it. That split was exactly right.
- **Live seats.** An `EventStream` with `listenTo = ["seatchanged"]` and `onOpen() { house.fetch() }`, writing into the seat-map DataSource, meant every seat view followed with no extra code.
- **Motion.** The seat pop is a Spring on a number that `draw()` reads. The summary's kick sets the value to 1 and springs it home to 0. Each took about three lines.
- **Placement.** Seats as `Control`s placed by `x`/`y` from one pitch number felt legitimate, because the skill explicitly allows hand placement for a scene.

**Where I worked around it:**
- **Replicating a computed array.** I wanted `datapath = { { rows: app.chosenSeats } }`. DECLARE3006 refused it and told me to declare a Dataset, so I added `chosenData` and `cardData`. The diagnostic was clear, but it is ceremony for a common case.
- **Phone zoom.** There's no notion of "zoom this scrolling pane about a point." I switched the pitch and called `scrollTo` in `afterSettle`, with no animation, because springing the pitch would fight the scroll position. This is the part of the app I'm least satisfied with.
- **Tap-to-zoom.** It is a plain `View` with `onClick(e)`, because I needed coordinates. The drift check says a pressable thing should be a `Control`, but a `Control`'s `press()` has no point.
- **Arrow keys in the seat map.** `focusScope = stop` walks the tree's order, and the docs say plainly that a spatial grid needs its own `onKeyDown`. I wrote a neighbour search. A spatial-grid focus scope would have saved this.
- **"Return moves to the next field."** I wrote `advance()` on my Form subclass using the internal `_counts`. Reaching into an underscore member feels wrong.
- **Country.** There's no native select, so it's a `RadioGroup`, and browser autofill can't fill a country. I compensated by inferring the country from an autofilled postal code.
- **Small compile-time corrections.** None cost much; all are listed under (c).

#### (c) Verifying it

**The `declare-verify` ladder** (rungs R1 structure through R4 boot) ran in seconds and named the fix every time. Examples:
- the `align = baseline` error told me the exact `baseline:` line to declare
- DECLARE4005: bare `semibold` isn't allowed inside braces; write it as a string
- `super.onFocus()` refused: a handler has no base method to call
- a wrong argument count on `Toast.say`
- hints about redundant parentheses

The most valuable was **DECLARE4013**: overriding `press()` on a `Button` means pointer clicks never reach the action. My "Whole house" button would have looked fine and done nothing when clicked. No other toolchain I know catches that.

**`declare-look`** screenshots, `--semantics` and `--js` covered looking and probing. **Assert scripts (rung R5)** carried the real verification: the brief's §10 story, a keyboard-only booking, a seat bought from outside mid-choice, sign-in with reload and sign-out, a phone purchase with an Amex card. `expect.request` with a partial body and `drive.requests()` let me assert exactly one declined order and then one accepted order. That is the brief's "checks what the service is asked", directly.

**Where the tools hurt:**
- **Paths by accessible name are ambiguous.** `"Security code"` matched the hidden saved-card field before the visible one, and `"Password"` resolved to something without `select()`.
- **Retyping a field was unreliable.** Neither `drive.selectAll` nor `Meta+a` selected the text, so my retyped password went in front of the old one ("correct horse batterywrong"). I fell back to End plus Backspace.
- **Paths into screens that aren't built at boot were hard to discover.** `--outline` couldn't see the sign-in form.
- **Some messages left me unsure whether to act.** "662 timers still waiting" on every failure was noise. "392 of 538 constraints statically wired": I don't know whether I should care.
- **The dev server exited with code 1 and no message**, right after rebuilding one of its bundled files. A later check I ran also died with exit 137; that may have been my script, I'm not sure.
- **I couldn't verify autofill, password-manager behaviour, real on-screen keyboards, Safari, or a real screen reader.**

#### Surprises

- How directly the docs anticipated this exact domain.
- That the settle model, plus `afterSettle` and `trackChanges`/`onChange`, removed every timing bug I'd normally expect in a checkout.
- That a write to a constrained attribute is refused at runtime rather than silently ignored.
- That 648 controls, each drawing itself with a Spring, ran without complaint.

#### Good and bad

**Good:**
- diagnostics that prescribe the fix
- forms that match how people actually make mistakes
- computed defaults
- `location` and `waypoint`
- live data with no subscription code
- springs and drawing that are cheap enough to use casually
- tests that assert on what was sent to the service

**Bad:**
- a large up-front reading cost
- no decorative flag for accessibility
- no native select
- no zoom or camera for scroll panes
- ambiguous test paths
- reaching into Form internals to step between fields
- a silent server crash

#### Compared with what I'm used to

Coming from React or Vue: there's no render step and no `.map()`, since lists come from replicating over data. There's no CSS cascade, since theme values pass down by `provided()`. Events don't bubble, and layout is an attribute. The nearest relatives:
- **QML** is the strongest resemblance: property bindings, States, and animation attached to a property.
- **Flex/MXML** (and OpenLaszlo, its stated ancestor) for binding plus declarative trees.
- **SwiftUI** for `shown` with an `input` handler, like `isPresented`.
- **Spreadsheets** for the reactivity itself.

Compared with React, I wrote much less state-synchronisation code and more geometry code.

#### Where I'd most want improvement

1. A zoomable scroll pane with a focal point and continuous motion.
2. A spatial focus scope for grids.
3. A decorative flag for screen readers, and a documented role-to-DOM table.
4. A select-like control that browser autofill fills, especially for country.
5. Built-in "next field on Return" with the matching keyboard key hint.
6. Test paths that prefer visible matches or fail on ambiguity, and a working `selectAll`.
7. Allowing a computed literal as a datapath.
8. Crash diagnostics from the dev server.

#### Would I use it again?

For flows like this one (forms, checkouts, dashboards, interactive diagrams with live data), yes, if I had the choice. Validation, live data and motion were where it most clearly beat my usual stack.

I'm uncertain about:
- large teams and the library ecosystem
- performance well beyond a few thousand views
- how far beyond the DOM renderer the accessibility support holds up
- whether my code is truly idiomatic, rather than idiomatic-looking
