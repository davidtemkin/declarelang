# Venue Codex run 3: GPT-6 Astra (Extra High), Declare

**Run:** 2026-11-02, in the ChatGPT app's Codex (GPT-6 Astra, reasoning Extra High), on a fresh clone of the
distribution at 526c7477 with `evals/`, `docs/system-design/` and `test/` removed. That build has the rebuilt layout
chapter (a notes reader built up step by step; sizes described by where they come from), `centerX`/`centerY`, and
the memory/teardown work. Same brief, API, service (port 8350, seed 1) and prompt as runs 1 and 2 (`prompt.txt`).

**Files beside this report:** the app, its plan, README and its own flow tests (`app/`); the hidden checks' results
(`drive/`: delivered and first boot, each strict and with "1 seats" accepted); the question it was asked
(`impressions.txt`).

Its account is at the end, word for word. (Asked not to change the app, it wrote it to `task/declare-build-account.md`.)

## Figures

| | **Codex 3** (Extra High) | Codex 2 (medium) | Codex 1 (medium) | Venue 19 (Opus 5.5) |
|---|---|---|---|---|
| working time | **29.1 min** (one 50 s usage-limit pause excluded) | 14.1 min | 12.5 min | 26.8 min |
| first clean boot (verify, R4) | **8.8 min** | 4.5 min | 5.2 min | — |
| output tokens | **~49k** (17k reasoning) | ~34k | ~27k | — |
| hidden checks, first boot | **3 of 11** (7 with "1 seats") | 0 of 11 | 5 (10) | 11 of 11 |
| hidden checks, delivered | **5 of 11** (**11** with "1 seats") | 4 (10) | 5 (10) | 11 of 11 |
| layout findings, layout cycles | **none** | a layout cycle | — | — |
| permission pauses | the sandbox: the npm registry, listening on 127.0.0.1 (approved retries) | the sandbox, one test run | several | — |

**The pause:** Codex hit its usage limit at 16:21:58Z after 18.2 min and was resumed at 16:22:48Z. The recorder held
through it (34 snapshots); the time above is the sum of the two working stretches.

**Reading:** the required first read was complete. Codex's tool keeps the start and end of a long output and cuts
the middle; `declare.md` (943 lines) and `todo.declare` (1,076) were each cut, and Codex read the cut middles straight
back (`declare.md` 260–630, `todo.declare` 370–680). The layout chapter came through whole. Then, unprompted:
chapters 14 (data), 19 (accessibility), part of 08 (controls), `verify.md`, later 07 (scrolling) and the `App`
reference, and finally `library/form.declare` to diagnose the form bug below. Reading took about 75 seconds before
it wrote `PLAN.md`.

**First boot (7 of 11 with "1 seats"):** the four failures are one gap, the service's own sentences (declined card,
wrong security code, seat taken, wrong password) not yet shown. Three of the four were its own work in progress; the
wrong-password one was the platform bug below.

**Delivered (11 of 11 with "1 seats"):** every hidden flow passes, the first Codex run to do so. Strictly, 5 of 11:
the summary reads "1 seats · $65.00"; the brief gives only the plural ("reads exactly: **3 seats · $240.00**") and
Codex kept it literally, noting the risk in its account. The brief now gives the singular.

**Its own checks:** seven flow tests against the live service (`app/tests/`): a guest purchase, a member on a phone
(wrong password, mid-checkout sign-in, saved cards, decline, double tap), live seat loss from a second client, a
forced 409, keyboard-only purchase, payment errors, and a usability pass with native wheel, touch and resizing. It
also used `declare-look` screenshots throughout, which caught what the assertions did not (checkout context scrolling
away, ticket height, seat legibility, a wrong season heading).

## Is it idiomatic Declare?

| | Codex 3 | Codex 2 | Codex 1 | Venue 19 |
|---|---|---|---|---|
| code | 734 lines Declare, 58 lines TS | 522 lines Declare, 13 lines TS | 405 lines Declare, 26 lines TS | 1,221 lines Declare |
| bytes | 47 KB | 38 KB | 31 KB | 65 KB |
| lines over 150 characters | 9 | 43 | 28 | 3 |
| colour literals outside theme declarations | 4 | 3 | 34 | 2 |
| theme reads | 47 | 45 | 5 | 84 |
| States | 1 | 0 | 1 | 3 |
| visible switches (visible = { x == '…' }) | 5 | 4 | 16 | 2 |
| branches on width or phone | 15 | 19 | 10 | 21 |
| flexes | 9 | 9 | 3 | 20 |
| browser scripts (host = browser) | 0 | 0 | 1 | 0 |
| page lookups (document.querySelector…) | 0 | 0 | 1 | 0 |

The density that marked run 2 is gone (9 long lines, not 43), with the theme discipline kept. Layout follows the
chapter: `ResponsiveLayout` for each of the three desktop/phone splits, `SimpleLayout` elsewhere (39), caps written
as `Math.min` (no `maxWidth` on a stated width), almost no width arithmetic on `app.width`, `TextLabel` for
control labels. Two npm packages (`card-validator`, `qrcode-generator`) behind a small TS helper, rather than
hand-written card checks or a fake QR code.

## Audit

- **A `Form` with a `source` dropped the service's refusal. Confirmed, fixed.** `submit()` sends from inside a
  settle; a `DataSource.fetch()` asked for there starts its request only once the settle is over, so `loading` is
  still false when `pending` turns true. The form's watcher read that as the request already finished: it cleared
  `_sending` (the "onChange: 'pend' changed again in the same settle chain" warning Codex saw) and took the empty
  result for a success, so the 401 that came after was dropped. Reproduced in a minimal program against the real
  service. The form now ends a send on the promise `fetch()` returns, which resolves once the reply is in the
  flags (`library/form.declare`); a new test fails on the old form and passes on the new (`test/forms.test.mjs`).
  Codex diagnosed this correctly from the outside and worked around it with a `ServiceForm` subclass on the same
  promise; it cost it two failed phone-flow attempts and a library read, perhaps five to ten minutes.
- **R1, `DECLARE5000` comma suggestions for a missing `]`. Confirmed, fixed.** A class closed its nested
  `State` but not itself; the formatter said "expected ']', got 'class'" (right), while the compiler suggested
  commas before every word of the next declaration (a cascade). Codex: "Following all the comma suggestions would
  have made the source worse." A body that runs into `class` or `schema` now gets one error: "Entry (line 1) is
  missing its closing ']' — a class is declared at the top level, so close Entry before it"
  (`runtime/src/parser.ts`).
- **R1, `ResponsiveLayout has no attribute 'spacing'`. Its guess; the message was right.** `ResponsiveLayout` names
  its spacing `gap`. Codex notes the different names for related spacing concepts as friction.
- **R3, `brand` shadowing (`DECLARE4002`) and a possibly-null `value` (`DECLARE6001`). Its code; both messages
  served.** It singles out the shadowing warning as making a TypeScript symptom ("has no call signatures")
  actionable.
- **Readability lints (`DECLARE4025`, a four-part `visible`).** Not defects; it named the predicates, and finds the
  split "a little ceremonial" for small booleans.
- **A settle that waited out its interval on a GET of the app URL during its usability flow. Confirmed, fixed
  (verify).** The request was the page's own document; verify counted a page navigation as an app request, and a
  page another load replaced takes its requests with it without a finish or a failure (with the document skipped,
  a script of the replaced page was next). Verify now waits on neither, forgetting a page's requests when the next
  one commits (`tools/internal/verify-behave.mjs`); Codex's usability flow runs clean with no wait.
- **Chrome's "password field is not contained in a form" warning.** `TextInput.purpose` says managers recognize
  fields without an HTML form; not tested with a real password manager. Left as is: wrapping fields in a native
  `<form>` in the DOM runtime was considered on 2026-11-01 and not pursued (risk for little proven gain). A test
  with a real password manager is what would settle it.
- **No layout finding or layout cycle all run.** Its layout trouble was composition by design (a payment bar and a
  scrolling body, a first selection scrolled out of view), found by screenshots; it asks for a complete
  fixed-chrome/scrolling-body example taught early.

## What changed because of this run

- `library/form.declare`: a form's send ends on its request's promise (the bug above), with a regression test.
- `runtime/src/parser.ts`: a missing `]` before the next `class` or `schema` is one error that says so.
- `tools/internal/verify-behave.mjs`: settles no longer wait on page navigations or a replaced page's requests.
- Scrolling, said once and the same everywhere: declare.md §6 and the scrolling chapter now open with the model —
  scrolling is the platform's; the program reads its facts and makes requests — and the layout chapter's list says
  it is a pane, the exception to the page scrolling (its frame had read as the default). declare.md stays under
  10,000 words by five cuts of restatement.
- The layout chapter, after the follow-up below: each step's lines marked `// new` or `// changed`; a table at the
  list of where each value comes from and who decides it; and one sentence that the two are different questions.
- `skill/SKILL.md`: the first read now says why it must be whole — Declare is not in the reader's training data, so
  what is skipped is got wrong. (Codex read everything this time; the change was already asked for.)
- `evals/apps/venue-checkout/brief.md`: the summary's singular is now given ("1 seat · $80.00"), as the drive already expected.

## Its account, word for word

# Building Venue in Declare: an account for its makers

This is an account of the Venue build, including mistakes I made, behavior I could reproduce, and conclusions that remain uncertain. I have left the app and the data service unchanged while writing it. The retained implementation, plan, tests, and screenshots are in `declarelang/my-apps/venue/`.

My overall experience was that Declare expressed the application’s data dependencies and visual structure well. The first rendered app was substantially intact. Getting from that to a defensible checkout was much harder: a likely bug in the standard `Form` request lifecycle appeared only when I tested a refusal. The language’s unfamiliarity also caused ordinary mistakes, and the visual tools caught important shortcomings that successful compilation and boot checks did not.

I did not keep a stopwatch per issue. Costs below are approximate elapsed effort or counts of editing and checking cycles, not measured performance data. I distinguish observed behavior from my explanation of it.

## (a) Getting up to speed

### What I read, in order

1. I started with `declarelang/README.md`, as requested. I then read `task/brief.md`, `task/api/API.md`, and the applicable repository instructions, including `declarelang/AGENTS.md`.
2. Following those instructions, I read `declarelang/skill/SKILL.md` and adopted its authoring and verification workflow.
3. I requested all of `docs/declare.md`. The tool response was truncated, so I went back for the missing middle in smaller ranges. That distinction matters: requesting a whole document did not mean I had actually received it.
4. I read the required guide chapters in this order: `01-what-declare-is.md`, `04-structure.md`, `05-run-and-check.md`, and `06-layout.md`.
5. I read `apps/todo/todo.declare` and `apps/todo/todo-parts.declare`. The main example also needed follow-up reads because the first output lost its middle.
6. For this application, I turned to `14-data.md`, `19-accessibility.md`, and the opening part of `08-controls.md`. One overly large batch combined these with service output and was truncated. I subsequently read the data chapter’s form sections explicitly. I did not finish every section of the controls chapter.
7. I read `docs/operational/verify.md` to understand the checking ladder and the supported browser assertion harness. I also read `package.json` for the available commands and dependencies.
8. During implementation I used `node tools/declare-help.mjs` for specific surfaces: `Form`, `Form.source`, `Form.refusedWith`, `Form.enterMoves`, `TextInput`, `TextInput.purpose`, `TextInput.concealed`, `EventStream`, `Stream`, `Dialog`, `Field`, `DataSource`, `RadioGroup`, `Image`, `View.scrollTo`, `Focus`, and later `ResponsiveLayout`, `Time.now`, and `App`.
9. After seeing scrolling and persistent-summary problems, I read `07-scrolling.md` and the full `App` reference. After the missing sign-in refusal, I read the implementation in `library/form.declare`, having already consulted its public reference.

I wrote `my-apps/venue/PLAN.md` before the first app source. It fixed the main decisions: service-owned data, typed schemas, selected seat IDs rather than copied inventory, editable account-derived defaults, native fields, reusable controls, and separate phone seat targeting.

### What taught me most

The combination of `docs/declare.md` and the Todo example taught me more than either alone. The language document established the rules; Todo showed what those rules looked like in maintained application code, including composition and the separation between declarations and actions. That prevented me from treating Declare as a different spelling of React.

The data chapter was particularly valuable. The brief asks for a subtle behavior: signing in halfway through checkout should fill useful defaults without replacing anything already typed. An attribute default that follows its dependency until explicitly edited was a direct expression of that requirement. I would otherwise have reached for dirty flags and synchronization effects.

The accessibility material and `TextInput.purpose` reference made native field semantics part of the initial design. The verification documentation was also unusually practical: it gave me a supported way to find controls by role and name, drive native input, inspect requests, and exercise the real app against the separate service.

For local questions, the reference command was the quickest teacher. The `brand` shadowing warning also taught me something concrete about expression scope at exactly the moment I needed it.

### What I skipped, and why

I did not read the guide straight through. I skipped most of the remaining chapters, the other full sample applications, contribution material, most platform internals, and production packaging/derivation instructions. I was building an app in the distribution, not changing the platform or shipping a production bundle. I did not use the web as a source for Declare.

I stopped the broad controls read once I had the field/control material relevant to the brief, then used focused reference lookups. I did not read the scrolling chapter early enough; the first layout revisions made that omission visible. I also did not read the framework-comparison chapter during the build, so the comparisons later in this account are my own impressions.

I would not describe the front-loaded reading as wasted, but it was substantial: roughly the first several minutes, plausibly around ten including planning and tool handling, before a running app. Some of that cost was self-inflicted. Sending several long documents and a 648-seat response through one output budget was poor orchestration. Smaller, purposeful reads would have been faster and more reliable.

### What was missing or misleading

The most consequential mismatch was the documented `Form.source` behavior versus what I observed when the source refused a request. The public API looked like exactly the abstraction this checkout needed. I eventually had to inspect its implementation and replace part of its lifecycle in an app subclass. I describe the evidence below; I think this is a platform problem, but I did not establish a minimal standalone reproduction.

The layout documentation was usable, but the practical recipe for a pane app with a scrolling body and a fixed payment bar was spread across layout, scrolling, and `App` material. I would have benefited from that complete example near the beginning. My initial composition allowed important content to scroll away.

The reference did not support my guesses of `DataSource.onError` or `accessibilityBusy`. It correctly declined those lookups. That was useful, although the first guess reflects how readily prior framework habits leak into unfamiliar APIs.

There was also an unresolved tension around password managers: `TextInput.purpose` documented recognition without an HTML form, while Chrome warned that the password field was not contained in a form. I cannot conclude from that warning that autofill is broken. I also cannot claim the documentation’s practical promise was verified in this build.

## (b) Expressing what I wanted

### Where the language fit

The data model was a good fit. `DataSource` schemas gave the production, hall, account, session operations, and orders explicit shapes. The hall source owned section/row/seat records. Derived seat references supplied the surrounding section and row context, while selection stored IDs. Totals came from selected records and integer cents. I did not need a second inventory store or effects that continually copied server data into view state.

`EventStream` also fit the service directly: listen for the named `seatchanged` event, update the relevant source record, remove a sold seat from selection, and derive the new total. The live-service test eventually demonstrated this with an actual competing purchase.

Account-derived payment defaults were the clearest example of the language matching intent. An untouched name or address could follow the account; a typed email or street remained the buyer’s. The mid-checkout sign-in test exercised that distinction.

Reusable classes worked well for performance rows, seat controls, labeled fields, saved-card choices, and tickets. `SimpleLayout` and `ResponsiveLayout` handled ordinary composition. Scene geometry handled the hall and its miniature overview. I could make an ivory, ink, and vermilion interface with Georgia and system text without importing a CSS framework or using a DOM escape hatch.

The JavaScript/TypeScript boundary was also useful. I used `card-validator` and `qrcode-generator`, rather than inventing card validation or drawing fake QR codes. Pure helpers handled formatting and adaptation; Declare retained ownership of application state and UI behavior.

### Where I worked around it, or around my design

The main platform workaround was `ServiceForm`, described in detail below. It retained Declare’s field membership, validation, refusal mapping, and focus facilities, but used the documented completion promise from `DataSource.fetch()` to own the in-flight interval.

The phone hall required an interaction design, not simply a smaller layout. I kept a whole-house overview and provided section/row controls leading to large, numbered, 48-point seat targets. On a mouse-driven desktop the full map itself is interactive. Later I extended the enlarged picker to touch-first devices at wider widths as well. This was an application-level solution, not evidence that the language lacked responsive layout.

There is a tradeoff: the phone user selects an exact seat in a row view rather than tapping its tiny position in the full room. The overview preserves context, but I did not run a human thumb-targeting study. Also, the API provides section order and row lengths, not architectural coordinates. The curved room is an interpretation of that information, not a surveyed seating plan.

Keeping the payment summary visible required deliberate ownership of scrolling: an app that does not itself scroll, a scrolling body, and a persistent bottom bar. After selecting the first seat, the new bar reduces the body’s height. I eventually added an `afterSettle` call to scroll the selected control back into view. That dependency on settled geometry was understandable, but it was another lifecycle rule to learn.

Navigation remained a small explicit step state. I did not add URL waypoints or browser Back integration. That is an implementation limitation, not a limitation I established in Declare.

## (c) The first time it ran

There were compiler corrections before the first browser view. Once those were fixed, the first boot succeeded and the first programme screenshot looked recognizably like the intended app. It was not a blank screen or a cascade of misplaced controls.

That success was incomplete evidence. The first desktop hall was much taller than the viewport; only its upper portion was initially visible. The first phone programme spent a lot of vertical space on the heading and introduction before reaching the dates. Checkout’s detailed order summary could scroll away while the buyer was entering billing information. Small desktop seats initially read as blank outlined marks rather than clearly numbered places.

I found those through screenshots and browser use, not through compiler errors. For the tall hall and an initially missing header in one capture, I queried runtime geometry: the map was about 1,064 points high, the body content about 1,231, and the available body around 714 within an 800-point app. The header’s reported position was still zero. I did not prove why that particular capture omitted it. Later pane/scrolling changes produced stable header captures, but that does not establish a platform rendering defect as the original cause.

The first successful guest purchase was more misleading than the first screenshot. It passed while the console contained a form change-ring warning. Only the wrong-password branch exposed the missing refusal. In hindsight I should have treated that warning as a reason to test the failure path immediately.

## (d) Refusals, errors, and unexpected results

This is the issue ledger from the build. Some entries are failures observed in a running app; others are design mistakes caught by inspection before a failing test. I have kept those distinct.

### Compiler, formatter, and reference feedback

| What I wrote or attempted | What Declare said | What I changed | My judgment now |
|---|---|---|---|
| An `Entry extends TextInput [...]` class whose nested `State` was closed but whose outer class was not. | The formatter said `expected ']', got 'class'` at line 20. Verification produced `DECLARE5000` comma-separation diagnostics at following declarations and eventually an expected `]` at EOF. | Added the missing closing bracket. In the same correction I changed the state predicate from `this.error` to `parent.error` to address state scope. | My syntax error; the formatter located the cause better than the parser’s cascade. Following all the comma suggestions would have made the source worse. The scope adjustment was my correction, not a separately observed runtime failure. |
| `spacing` on three `ResponsiveLayout` instances, extrapolating from another layout API. | `DECLARE2000`: `ResponsiveLayout has no attribute 'spacing'`. | Read `ResponsiveLayout --all` and used `gap`. | My unsupported guess. The reference was correct. Different names for related spacing concepts add learning friction, but I cannot blame missing documentation here. |
| An attribute named `brand` initialized by calling a helper also named `brand`. | TypeScript 2349 through `DECLARE6001`: `Type 'String' has no call signatures`. `DECLARE4002` also explained that bare `brand` resolved to the `PaymentDraft` member rather than the script helper. | Renamed the helper to `detectBrand`. | My scope collision. The dedicated warning was very good; it made the less intuitive TypeScript symptom actionable. |
| Access to `app.account.value.name` under an `app.account.loaded` condition. | TypeScript 2531 through `DECLARE6001`: the value could be null. | Used optional access and a fallback. | My narrowing assumption was wrong. `loaded` was not a type-level guarantee of non-null `value`. A documented example of that pairing would help, but rejecting it was reasonable. |
| A four-condition text visibility predicate combining size and seat state. | `DECLARE4025`, a readability warning. | Introduced named `unchosen` and `numbered` predicates. | This was not a functional defect. The names improve readability somewhat; for a small predicate the extra declarations also feel a little ceremonial. |
| Reference lookup for `DataSource.onError`. | No such entry, with a hint toward `error`. | Read the actual `DataSource` surface and used its documented state. | My imported expectation from other APIs, not a compiler or platform defect. |
| Reference lookup for `accessibilityBusy`. | No entry. A shell command joined with `&&` consequently did not run the remaining lookups. | Used the documented APIs and later read `App --all` separately. | My API guess and command orchestration. I did not invent an attribute to silence it. |

After the syntax and type corrections, there was no observed application boot exception. Some subsequent checks could not start a local listener because of the execution sandbox; those are listed separately below.

### The form lifecycle issue

What I intended was the standard documented arrangement: a `Form` connected to a request `DataSource`, with a `refusedWith` mapping that displayed the service’s own sentence. A wrong password should leave the sign-in dialog open and display “That email and password don't match.”

The first guest purchase passed, but the console reported:

> `onChange: 'pend' changed again in the same settle chain — a ring of change handlers; the second change is not delivered`

The phone member flow then sent a wrong password, received HTTP 401, and failed because that sentence never appeared. After waiting for the data to settle, inspection showed the source had `failed: true` and the correct refusal JSON, but the form had an empty error, `pending: false`, `_sending: false`, and its watcher's `out` value was false. The backend had done its part.

I read `Form.source` and `Form.refusedWith` again, then `library/form.declare`. In outline, the standard `send` set `_sending`, called `source.fetch()`, and watched source loading and pending state. Its completion handler returned while loading, but otherwise could finish a sending operation and choose success or refusal from the source state.

My explanation is that the pending transition could be observed before the request’s loading transition had become visible. The watcher could therefore decide the operation had finished, clear `_sending`, and fail to process the eventual refusal. This explains both the inspected state and why waiting longer did not reveal the error. It is an inference from the code and behavior, not a scheduler trace or a minimal reproduction.

I added an app-level `ServiceForm` subclass, roughly a couple of dozen lines, which guards submission with `pending` and waits on `DataSource.fetch()`’s documented promise. On failure it uses the normal refusal mapping and schedules error/focus presentation after settling. On success it clears the relevant submission/error state. I did not change the platform library. Wrong-password, card-decline, insufficient-funds, field-refusal, and repeated-payment tests then passed.

This was the hardest single debugging obstacle. It cost two failed phone-flow attempts, runtime state inspection, a library source read, implementation of the workaround, and regression runs—roughly several minutes, perhaps five to ten, with no reliable stopwatch. It was one lifecycle issue with broad consequences, not a collection of unrelated syntax difficulties.

To have written this correctly the first time, I would have needed either the documented standard lifecycle to work for these requests, or an explicit limitation and a supported completion-based pattern. More introductory syntax documentation would not have helped. My current classification is **likely platform bug; exact cause still uncertain**.

The workaround also creates a maintenance obligation. It does not reproduce every internal success/reset operation of the standard form. In particular, I did not prove that every field’s judged state returns to the intended starting state after buying and starting again. A tester should exercise that sequence.

### Layout and interaction findings

1. **The order summary disappeared during billing.** I initially put the detailed summary in the scrolling checkout composition. A screenshot taken lower in the form showed fields without the seat context beside them. I moved the chosen-seat identifiers and fees into the persistent bar and retained the detailed list in the body. This was my failure to express “never out of sight” in the layout, not a layout-engine error. Automated structural checks did not catch the semantic requirement.

2. **The persistent summary initially used the wrong amount convention at checkout.** It emphasized the grand total rather than consistently showing the brief’s exact count/subtotal string. I made the running summary use the seat subtotal everywhere and the Pay button use the fee-inclusive amount. This was my reading/implementation correction. Prices remain integer cents until formatting.

3. **The first seat selection could move the chosen seat out of view.** Showing the bottom bar shrank the phone body. A later usability capture made the selected row difficult to see. I added `afterSettle` followed by the selected control’s `scrollIntoView()`. This was a geometry consequence of my composition. The later phone flow passed, but I did not add a precise assertion that the first chosen seat’s entire bounds remained unobscured.

4. **The desktop map was tall and its seats initially lacked useful visible numbers.** I added small numbers and tooltips while retaining large row targets for touch. The map still needs scrolling. The companion overview makes occupancy readable as a whole, but it does not turn the detailed map into a single-screen plan. This is a design tradeoff, not a verified platform fault.

5. **The first hall capture did not show the header where I expected.** Runtime coordinates did not straightforwardly explain it. I later used `App.scrolls = none` for the pane arrangement and got stable captures. I am **unsure** whether the original symptom was scrolling/focus state, capture framing, or my layout. I did not establish a minimal cause and should not report it as a fixed renderer bug.

6. **My initial desktop composition offered duplicate interactive representations of seats.** I noticed this by inspecting the design, before a locator failure proved it. I changed the secondary full-house view to a decorative overview and limited the enlarged picker to phone/touch arrangements. This reduced duplicate accessible targets. It was my composition mistake.

7. **A wide touch device would still have received the tiny desktop targets.** I initially keyed the row picker only to phone width. I changed the condition to phone width or touch-first input. This was an anticipated usability correction, not a failure observed on a physical tablet.

8. **Miniature seat states relied too much on color.** I revised them to use an outline for free seats, a diagonal treatment for sold seats, and a check for selected seats. I also corrected legend wording that no longer matched the drawing. This was my accessibility/design deficiency. At overview scale those marks remain tiny; I have more confidence in the large picker’s distinguishability than in every miniature mark under impaired vision.

9. **The planned selection spring initially had no visible consumer.** Declaring an animation did not make it affect the control. I connected the pulse to the selected border width. This was my incomplete implementation. I did not separately verify reduced-motion behavior.

10. **The first phone ticket pushed its pager below the fold.** I reduced padding and gaps, adjusted the title, and reduced the phone QR from 204 to 180 points. The later phone capture showed the ticket, pager, and start-again action together. This was visual iteration, not a compiler-detectable problem. Larger text or a shorter viewport may expose it again.

11. **The programme header claimed the wrong season range.** Very late, after the main behavioral tests, the browser’s accessible content showed performances from November into December while my heading said “November 2026.” I had invented a display fact. I replaced it with a range derived from the first and last service dates; the final view read “Nov–Dec 2026.” This was entirely my error and a useful reminder that passing transaction tests says little about editorial accuracy.

12. **“Nearly sold out” initially highlighted none of the dates it should have.** My absolute threshold of fewer than 50 seats did not flag performances with roughly 79 or 82 left out of 648. I changed it to a remaining-seat proportion below 15%, with explicit “Only … left” copy. This was a poor data assumption of mine, discovered by looking at the actual programme.

13. **Returning to the programme could show old availability counts.** I added a production refetch on returning and removed a redundant fetch from the start-again path. This was a freshness issue found in reasoning about navigation, not a demonstrated failure of `EventStream`.

14. **The first phone programme still had a generous introductory area.** I noticed that dates started lower than ideal. I retained much of the typographic presentation. That is an unresolved design judgment, not an invisible platform constraint; a tester may prefer a quicker route to dates.

### Form refinements that were my responsibility

I initially cleared the security code for every checkout refusal. Before relying on that behavior, I realized a postal-code refusal would then create a new empty-CVC problem and could move focus to the wrong field. I restricted clearing to the relevant payment refusals and CVC errors. The later postal refusal test reached the postal field with the service message. This was a correction by reasoning, not a postal test failure that actually occurred.

Likewise, clicking the already-selected saved card originally cleared its code unnecessarily. I guarded the change by card identity. I initially disabled the primary submit controls while pending, then followed the form guidance to keep them focusable and prevent repeats in the submission logic. I added visible processing status. The request-count tests, rather than the button’s appearance, supplied evidence that a double tap did not make a second payment.

The browser also logged a 401 for `/api/me` while signed out. That is an ordinary service outcome, not an app failure. The separate password-field-without-form warning remains unresolved as described above.

### Test assumptions and environment refusals

The first version of `live-seats.mjs` selected available seats and waited about eleven seconds, expecting the service to sell one spontaneously. The assertion expected the selection count to fall from ten to nine; it did not. The API never promised a periodic simulated buyer. My test was wrong. I replaced the wait with a real purchase from a second client, then checked the stream-driven update. That passed.

Installing the app’s two dependencies initially stalled and failed with `ENOTFOUND` for the registry under the network sandbox. An approved retry succeeded. Some verification/look commands failed to listen on `127.0.0.1` with `EPERM`; approved retries worked. These were execution-environment refusals, not Declare compiler or boot failures. One curl-to-JSON inspection also produced an empty/non-JSON result and a decode failure; I did not isolate that command failure, and have no basis for attributing it to the service.

During a later usability run, the driver reported that a settle waited its entire interval for a GET of the app URL which never returned, warning that a permanently open request can hold settling. The flow passed. I did not establish whether navigation/reload bookkeeping, streaming, or something else caused it. Its attribution is **unsure**; I would want a clearer request-lifecycle trace before blaming `EventStream`.

Long tool responses were truncated more than once, including documentation and a large repository status listing. That was a limitation I should have managed with smaller queries. Root dependency installation also changed lockfile metadata; I restored those incidental changes. The downloaded distribution’s pre-existing status noise was not work I had done. No service or platform implementation changes were part of the delivery.

## (e) How I verified it, and what the checks actually proved

I used the distribution’s formatter, compiler/type checks, phone and desktop boot checks, `look.mjs` screenshots, and the supported assertion harness against the running app. I did not build a separate browser-testing stack. Test interactions mostly found controls through visible labels or accessible roles and names; runtime inspection supplemented that for state and geometry.

The early verification stages caught syntax, nonexistent attributes, expression typing, and readability issues. Boot checks established that the app could construct and run at the tested sizes. Their schema-based fixtures were useful for construction but did not substitute for the real cookie-backed service. The missing refusal only appeared in the latter.

The seven retained flows cover the following:

| Retained flow | Evidence it supplied | Important limit |
|---|---|---|
| `guest.mjs` | Twenty performances; a two-seat guest purchase; empty form blocked before an order request; email focus; card grouping; request body; ticket confirmation, QR image, and paging. | The first pass missed the form refusal bug. Seeing a QR image is not decoding it. |
| `member-phone.mjs` | A 390 × 844 touch flow across two sections; hidden/revealed password; wrong-password sentence; mid-checkout sign-in preserving typed values; account defaults; expired card disabled; saved-card decline; double-tap request count; switching cards; Amex grouping and four-digit code; invalid inputs blocked locally; server postal refusal/focus; success; cookie reload and sign-out. | Emulated touch, not a physical phone. I declared a device scale factor in this flow but did not independently establish that the harness applied it. |
| `live-seats.mjs` | A second client really bought a selected seat. The live app’s selection decreased and its notice appeared while its event stream was open. | A short, controlled sale; no sustained stream failure/reconnection test. |
| `conflict.mjs` | With only the test browser’s event stream blocked, another client bought a chosen seat; the stale checkout received a real 409, returned to the hall, removed only the lost seat, kept the other, showed the service sentence, and preserved the draft. | Deliberately induced stale inventory. It does not prove every possible timing race. |
| `keyboard.mjs` | A purchase using Tab, Shift-Tab, Enter, Space, and typing; heading and field focus; Enter progression; one successful order. | I used reverse tabbing to reach Continue without traversing hundreds of seat buttons. This demonstrates a route, not an efficient seat-map keyboard model. |
| `payment-errors.mjs` | Invalid card checksum blocked locally; insufficient-funds sentence; code cleared while address persisted; service CVC mismatch marked and focused its field. | Not every brand, expiry boundary, country, or service/network failure. |
| `usability.mjs` | Desktop wheel and scrollbar input, resizing, phone touch selection, checkout screenshots, and continued visibility under dark system preference. | One “last performance” assertion inspected the final data ID, not proof that the last row was visibly reachable. Screenshots/native input supplied the rest of that evidence. |

These were real-service tests. Successful runs sold seats, and the conflict test did not manufacture a fake 409 or modify the server. The retained scripts choose available seats in particular rows; enough repetitions can exhaust those rows. They are not a hermetic, indefinitely repeatable suite.

Screenshots caught things the assertion flows did not: the disappearing checkout context, ticket height, small seat legibility, and the season heading. The final browser accessibility view helped expose the last two programme-copy/availability issues. No final automatic layout/spill diagnostic reported those as failures. That is not necessarily a defect in the checks; it is a limit on what a clean report means.

The tooling served me well when it kept the app, accessible controls, network, and runtime state connected. The shadowing warning and the native-input harness were especially useful. It served me less well when a broad “settled” operation waited without a clear causal story, or when a parser recovery suggestion pointed at commas rather than the missing bracket. I used direct page/runtime inspection for the form diagnosis; I did not fully explore the inspector, explanation facilities, or profiler.

The full behavioral flows passed after the functional and layout changes. The late season-range/low-availability presentation changes received formatting/type checks and browser inspection; I did not repeat every purchase flow after those display changes. I did not run the platform’s whole test suite, derive a production artifact, establish screenshot regression baselines, or measure performance systematically. None of those should be implied by “verified.”

## (f) Confidence against the brief

“High” below means strong evidence for the exercised behavior, not exhaustive proof or a claim of production readiness.

| Brief area | Confidence | Why, and where I expect problems |
|---|---|---|
| §1: twenty performances, date/time/price/fullness | High for the displayed service data; moderate for browsing polish. | Real data and accessible controls were checked. The wrong month and poor scarcity threshold were caught late. The generous phone introduction and extreme fullness states deserve another human pass. |
| §2: room and exact seat selection | Moderate to high for mechanics; moderate for room legibility. | Direct desktop controls and large phone row targets worked. The map reflects ordered sections and unequal row lengths. The stylized geometry, miniature state symbols, and tall desktop view are the likely design criticisms. |
| §2: truthful live availability and loss notices | High for the tested sale and 409 cases; moderate beyond them. | Both were exercised against real purchases. Disconnection, reconnect, rapid multiple losses, switching performances during an event, and selection changes during payment need more coverage. |
| §3: optional sign-in, saved defaults, session | High for the exercised flow. | Guest purchase, mid-checkout sign-in, preservation, saved cards, reload, and sign-out passed. Session expiry while paying with a saved card and every “sign in at any time” step were not separately tested. |
| §3: password-manager behavior | Unproven in a real manager. | Native password type, purpose, and visibility toggle are present and partly tested. Chrome’s form warning makes an actual fill/save test particularly worthwhile. |
| §4: arithmetic, payloads, local validation | High for checked amounts and common paths; moderate over the full input space. | Integer cents, mixed-section totals, fees, grouped Visa/Amex input, wrong CVC length, invalid month, and postal validation received concrete checks. Canada, all card brands, expiry boundaries, paste/edit caret behavior, and unusual but valid addresses need broader testing. |
| §4: refusal handling and single submission | High for the tested service outcomes; moderate for lifecycle robustness. | Decline, insufficient funds, field refusals, conflict, and a double tap passed after `ServiceForm`. Enter twice, network timeout, every race, and form reuse after success were not all independently exercised. The workaround is the area I would scrutinize first. |
| §4/§6: calm checkout, seats and total visible | Moderate to high for the captured sizes. | The persistent bar fixes the earlier loss of context. A large selection can make that bar too tall; I did not test buying many seats. |
| §5: receipt and individual tickets | High for receipt mapping and paging; moderate for actual door use. | Real barcodes feed `qrcode-generator`, and the ticket is designed and readable in captures. I did not scan or automatically decode a QR. Tickets were paged in a two-seat flow, not the brief’s exact three-ticket scenario. Reload recovery and offline access are not provided. |
| §6: keyboard and screen-reader access | High that the tested keyboard route completes; moderate to low for comprehensive accessibility. | Names, roles, focus assertions, and live/error semantics support the design. I did not use a real screen reader. Hundreds of seat tab stops, announcement timing, contrast under impaired vision, zoom, and reduced motion need expert review. |
| §7: phone and desktop | High for the tested viewport/touch arrangements; unproven for native mobile keyboard/autofill behavior. | Resizing and touch worked in Chrome emulation. App height follows `hostHeight - keyboardHeight`, and field purposes/Enter navigation are configured. A real phone must validate that the focused field and payment bar remain reachable with its keyboard open. |
| §8–§9: service integration and scope | High. | The given service is used with cookie credentials, no replacement server or reload-persistent service cache was added, accessible seat names were exercised, and the app stays within the requested purchasing scope. |

The brief’s final narrative was covered in pieces rather than reproduced literally as one end-to-end run with three seats across two sections, a live loss, a saved-card decline, a replacement card, and three tickets. That is a worthwhile next acceptance test. My earlier handoff’s wording about “scannable tickets” meant genuine QR generation; it was stronger than the direct test evidence, which established image presence and ticket data, not scanner acceptance.

Other likely tester findings are browser Back leaving the app rather than reversing an internal step, a literal “1 seats” summary because I retained the quoted plural pattern, form judgment state after “start again,” and lost in-memory purchase/selection state on reload. Some are outside the explicit minimum, but they affect a consumer-grade assessment. I would not call the app fully proven consumer-grade on the strength of this build alone.

## What surprised me, what worked, and what did not

The pleasant surprise was how little synchronization glue I needed. Editable defaults, derived queries, typed source records, and event-driven changes made several requirements simpler than I expected. The other pleasant surprise was that the first coherent rendering came quickly once I had done the prescribed reading and corrected the compiler errors. I could achieve a distinct visual identity using the platform’s own drawing and layout vocabulary.

The unpleasant surprise was that the standard form abstraction failed at the point where its promised behavior mattered most. A purchase succeeding was not enough to expose it. The readable library source helped me recover, but having to understand its watcher timing during ordinary app development is a significant cost.

The compiler usually earned its strictness. The nonexistent-attribute and shadowing feedback were useful. The missing-bracket cascade was less useful. The readability lint encouraged a consistent style, although I am not convinced every short boolean expression benefits from being split into named attributes.

The most persistent difficulty was not a series of platform crashes. It was a pattern of composing scrolling, focus, responsive targeting, and persistent chrome correctly. That took several screenshot/revision cycles spread across the build—roughly a handful of iterations and several minutes, perhaps comparable in total effort to the form investigation. A complete pane/checkout example, explicit viewport-versus-content sizing guidance, and examples of geometry changes after selection would have prevented more of those mistakes than additional syntax reference material.

## What it reminded me of

Declare reminded me most of QML-style property binding and a retained scene graph, with some of the compositional appeal of SwiftUI and the dependency-oriented feel of Svelte. Those are analogies, not claims of equivalent semantics.

Compared with React, I wrote fewer effects whose job was to keep two representations synchronized. The “follows until edited” default was particularly different from choosing between a one-time state initializer and a continuously controlled value. Conversely, expression scope and settling rules were new sources of mistakes: my `brand` collision and the need to wait for geometry are examples.

Compared with HTML/CSS work, layout felt more explicit and geometric. That helped with the hall, where I wanted a drawn room rather than a table. It also meant that familiar browser layout instincts were not automatically trustworthy. I had to learn the platform’s scroll ownership and sizing rules instead of assuming flexbox behavior.

The integrated formatter, reference, verification ladder, and browser driver made it feel more like an application platform than a syntax package. That is a strength, but it raises expectations: if the platform owns forms, requests, focus, and settling, their interactions need to be exceptionally dependable and explainable.

## What I would improve first

1. **Resolve and regression-test the `Form.source` lifecycle.** Use a fast 401, a delayed successful order, delayed 402/422 responses, and repeat submission in the same test family. If my diagnosis is wrong, make the tooling show the actual ordering. This single issue created the most serious risk and the least appropriate application-level workaround.
2. **Provide one complete transactional example.** Include optional mid-form sign-in, edited defaults, a native password field, server field errors, exact request counting, and reuse after success. The individual APIs were documented; their combined lifecycle was where confidence broke down.
3. **Teach the fixed-chrome/scrolling-body arrangement earlier.** Include a narrow viewport, software-keyboard height, first-selection footer appearance, focus scrolling, and many selected items. This addresses a recurring composition pattern, not just my one app.
4. **Improve causal diagnostics.** Prefer the missing delimiter over downstream comma suggestions; connect change-ring warnings to the handlers involved; explain which request is holding a settle and why it is tracked. A snapshot of `failed: true` beside an empty form error was useful, but it did not itself reveal the sequence.
5. **Make native-input guarantees concrete.** Explain the password-without-form warning, publish tested password-manager/autofill behavior, and provide a physical-phone checklist. Documentation can guide correct construction where headless testing cannot prove it.
6. **Demonstrate dense selection accessibility.** A seat-map or similar example with roving keyboard focus, large touch targeting, distinct non-color states, and a decorative overview would be more instructive here than another ordinary list.

## What I would use it for

I would consider Declare for a custom visual application with live data, structured forms, and a constrained set of screens: booking tools, operational dashboards, editors, or other interfaces where derived state and drawn controls are central. This build gave me a reason to believe that its model can reduce synchronization work and keep the visual implementation coherent.

I would want the form issue resolved, actual autofill/mobile evidence, and broader accessibility testing before choosing it for a payment-critical public service. For document-heavy, mostly textual sites, or projects that depend heavily on existing DOM/CSS components, I would be less inclined to adopt a new scene/layout vocabulary. That is a judgment about this build’s evidence and adoption cost, not a claim that Declare cannot serve those uses.

The most useful lesson from Venue is that the language became understandable faster than the app became trustworthy. The remaining uncertainty is concentrated in lifecycle integration and real-device behavior, not in whether I could express the screens.

## A follow-up question, and its answer, word for word

Asked after the account: "In ch 6 of the guide there is a worked example that starts small and ultimately explain the
rules and model around layouts -- which isn't actually particularly complicated, though it's not like CSS/HTML. Was
this helpful? What would have made it more helpful for teaching the principles -- not this app's exact use case; that
won't work"

Yes. And rereading [chapter 6](/Users/temkin/Code/codex-eval/declarelang/docs/guide/06-layout.md), I think my account undercredited it. My recommendation for a worked example with fixed bands, a scrolling body, and an appearing action bar was misplaced: **the notes reader already teaches exactly those relationships.** That recommendation should be withdrawn.

The progression was helpful: intrinsic size → arrangement → distribution of available space → scrolling → changing participation → responsive allocation → a custom layout. The “tempting mistake” passages are particularly effective because they connect a rule to a plausible mistake and its diagnostic. The custom `Squares` example also makes an important principle concrete: width can determine the children’s geometry, whose resulting extent determines height. Those are different dimensions with a clear dependency direction.

What did not stick sufficiently was my ability to **predict a new arrangement from those rules**. I read the chapter, but I did not run its examples or work through variations before building. That is a limitation of how I learned from it, not evidence that the model is complicated or the explanation absent.

For teaching the principles more effectively, I would suggest four focused changes:

1. **Explicitly distinguish the source of a value from who decides it.**  
   The list section groups sizes as stated, from the parent, or from content. The final rule groups their deciders as the view, the parent’s layout, or content. Both make sense, but `width = 100%` moves between those classifications: its value comes from the parent, while the child itself declares that decision. By comparison, stretch lets the parent’s layout decide. One explicit sentence connecting these two classifications would have helped me avoid treating “depends on the parent” and “assigned by its layout” as interchangeable.

2. **Make the reader predict before showing the answer.**  
   The existing counterexamples are good material for this; another application is unnecessary. Before the explanation, ask: remove the list’s width while retaining the rows’ `100%`—what determines its width now? Show the action bar—which heights change? Put a spacer in a content-sized row—where would its space come from? I could read and recognize the correct answer without demonstrating that I could derive it. A few prediction checkpoints would expose that gap.

3. **Track decisions and dependencies alongside the evolving example.**  
   A small annotation at each step could say: “list width: stated; list height: assigned by stretch; row width: reads list; row height: content.” Particularly at the circular-width example, a dependency sketch would explain why removing the child width and using stretch changes the situation. The chapter already states the rule; this would make its application easier to rehearse.

4. **Make each conceptual change more visible in the code.**  
   In the plain-text reading path I used, the later examples repeat substantial dataset and application scaffolding. Showing the changed fragment prominently, while retaining the complete runnable example, would help keep attention on the one relationship being introduced. This is a presentation issue, not a request to remove the cumulative example.

The revision I would make to my assessment is: **chapter 6 supplied the necessary principles, but I did not internalize them reliably enough before applying them.** Its best improvement would be to require a little more prediction and explanation from the learner, using the example it already has. More recipes tailored to Venue would not address that learning failure.
