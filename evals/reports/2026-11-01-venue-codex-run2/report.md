# Venue Codex run 2: GPT-6 Astra (medium), Declare, with the layout chapter in the first read

**Run:** 2026-10-31 → 11-01, in the ChatGPT app's Codex (GPT-6 Astra, reasoning medium), on a fresh clone of the
distribution at 80850d75: the SKILL's first read now includes `06-layout.md`, and says to read each first-read file
whole past a read tool's truncation. Same brief, API and service as run 1. Prompt in `prompt.txt`.

**Files beside this report:** the app and its own tests (`app/`); the hidden checks' results (`drive/`: strict,
with "1 seats" accepted, and at first boot); the questions it was asked (`impressions.txt`).

Its account is at the end, word for word. (Asked not to change anything, it wrote it to `task/declare-build-account.md`.)

## Figures

| | **Codex 2** | Codex 1 | Venue 19 (Opus 5.5) |
|---|---|---|---|
| working time | **14.1 min** (6.0 + 8.1, across a credit pause) | 12.5 min | 26.8 min |
| first clean boot (verify) | **4.5 min** | 5.2 min | — |
| output tokens | **~34k** (5.2k reasoning) | ~27k | — |
| hidden checks, first boot | **0 of 11** | 5 of 11 (10 with "1 seats") | 11 of 11 |
| hidden checks, delivered | **4 of 11** (10 with "1 seats") | 5 of 11 (10 with "1 seats") | 11 of 11 |
| permission pauses | the sandbox (cache, ports, `curl`), and one asking to run order tests | several | — |

**The credit pause:** Codex hit its usage limit at 22:28:34Z after 6.0 min and resumed at 01:37:16Z. The time above
is the sum of the two working stretches. The recorder's hold was a 3-hour timer that ran out at 01:21, before the
resume, so the second stretch has no intermediate snapshots; a final one was taken after it finished. The session
log has every command.

**Reading:** the required first read was completed, past truncation, as the new SKILL line asks: `declare.md` and
`todo.declare` were each cut by Codex's output limit and each was read through straight away (in run 1 neither
was). The layout chapter came through whole. Reads outside the first read were left truncated (chapter 14, a
`Layout` reference): for the optional, Codex reads what fits.

**First boot (0 of 11):** the snapshot verify passed at R4 did not come up when served: its arch drawing called
`ellipse` with a negative radius during construction, and the App's layout cycled (below). It found both from the
served page within minutes.

**Delivered:** the "1 seats" summary again (the brief shows only the plural; to be fixed in the brief). With it
accepted, 10 of 11. The remaining failure is real: on a phone, after seats are chosen in the row sheet and checkout
begins, **the row sheet stays open over the checkout form**, so the form is behind a modal and its fields can't be
reached. (The check was taught to press a seat's section and row first when the seat isn't on screen, which any
row-first design needs; without that, it had failed earlier, at finding the seat.)

**Signed-in name:** shown on desk (run 1's missing name is fixed); hidden on a phone.

## Is it idiomatic Declare?

| | Codex 2 | Codex 1 | Venue 19 (Opus) |
|---|---|---|---|
| code | 522 lines Declare, 13 lines TS | 405 lines Declare, 26 lines TS | 1,221 lines Declare |
| bytes | 38 KB | 31 KB | 65 KB |
| lines over 150 characters | 43 | 28 | 3 |
| colour literals outside theme declarations | 3 | 34 | 2 |
| theme reads | 45 | 5 | 84 |
| States | 0 | 1 | 3 |
| visible switches (visible = { x == '…' }) | 4 | 16 | 2 |
| branches on width or phone | 19 | 10 | 21 |
| flexes | 9 | 3 | 20 |
| browser scripts (host = browser) | 0 | 1 | 0 |
| page lookups (document.querySelector…) | 0 | 1 | 0 |

Clearly more idiomatic than run 1, in the measures that moved: colours from the theme (45 theme reads, 3 literals,
against 5 and 34), screens no longer a dozen string-switched siblings (4), no DOM script. Denser than ever (43 lines
over 150 characters). Run 1's report noted the presentation layer reading like a ported single-file web app; this
one reads like a Declare program written fast.

## Audit

- **verify called intercepted requests writes to the live service. Confirmed, fixed.** Codex's checkout test
  intercepted its order with Puppeteer's `request.respond()`; verify recorded every non-GET the page made, so it
  printed "the script sent 1 write to the live service", and the ChatGPT app's automatic approval review took that
  at its word and blocked the following runs. Codex fell back to read-only tests. A request the script answers or
  aborts is now reported as "intercepted … none reached the service" and kept out of the live-write accounting
  (`tools/internal/verify-behave.mjs`, `test/verify-requests.test.mjs`).
- **"App's SimpleLayout[y] re-evaluated 100 times". Reproduced, narrowed, not yet explained.** This run's early
  snapshot (22:28) cycles on the current runtime, headless too. It needs the App column's `align = stretch` and, in the
  header row, the text `visible = { !app.phone && app.me.loaded }`: take either away and it boots; a reduced
  program with the same shapes boots. No rule reads the layout's outputs, so the loop runs through a plain write no
  rule owns. Open.
- **A cycle message that names only the rule that hit the limit.** The message now names the loop when the rules
  form one, in the order values flow, including a loop upstream of the rule that hit the limit ("The loop:
  View.width (at app.box.a) → View.width (at app.box.b) → View.width (at app.box.a)"). It does not yet see a loop
  through plain writes, which is why the case above still reads as before.
- **`draw()` runs against provisional geometry** (a negative radius before layout). True; to document.
- **`Form.refusal()` reads as if it applies a refusal; it returns one.** To clarify in its reference.

## Its account, word for word


My overall assessment: Declare was unusually effective at expressing the relationships in this app, and less predictable when those relationships involved layout. The language and library let me build a substantial interface without much infrastructure. But I spent enough time resolving layout cycles and interpreting verification results that I would not yet call this a dependable “write it, check it, trust it” experience.

I also need to qualify my delivery: I built the flow, but I did **not** establish that Venue meets the whole brief. The read-only checks were useful; they were not substitutes for testing real sign-in, session persistence, payment submission, and service refusals. My final delivery message compressed that distinction too much.

This account is based on the build history, without changing files or rerunning anything. Where I changed several things between observations, I cannot reliably isolate which change fixed the problem.

## (a) Getting up to speed

I read these in this order:

1. `declarelang/README.md`, then `declarelang/AGENTS.md`, followed by the task brief and API specification. Those arrived in one tool response.
2. `declarelang/skill/SKILL.md`.
3. `docs/declare.md`. The first response was truncated, so I fetched the missing middle sections separately.
4. `docs/guide/01-what-declare-is.md`.
5. `docs/guide/04-structure.md`.
6. `docs/guide/05-run-and-check.md`.
7. `docs/guide/06-layout.md`.
8. `apps/todo/todo.declare`. That response was also truncated, so I fetched the omitted sections.
9. `apps/todo/todo-parts.declare`.
10. When I reached forms and service integration, `docs/guide/14-data.md` and `docs/guide/19-accessibility.md`.
11. During verification, `docs/operational/verify.md`.
12. Later, targeted `declare-help` entries, and finally `library/form.declare` when I misunderstood how to simulate a refusal.

I did not read the rest of the guide consecutively. The skill explicitly told me to stop after the initial reading and look things up as needed, which was good advice. I did not read the entire calendar, tracker, or embedding examples. I also did not read the schemas, controls, or overlays chapters in full; I relied on the language reference, the to-do example, and targeted reference entries.

The `14-data.md` response had a small truncated passage around scheduled refreshing. I did not retrieve it because I was using an event stream, not scheduled refresh. That was a deliberate omission, unlike the initial truncations, which I tried to repair.

What taught me the most:

- **`06-layout.md`** gave me the crucial ownership rule: each position or size has one decider. It also explained the dangerous distinction between a size passed down and a size gathered from children.
- **The to-do app** taught the working idiom better than isolated examples: `Control.press()`, computed defaults, app-owned navigation state, dataset-owned records, and library overlays.
- **The forms section of `14-data.md`** changed my implementation plan. I had expected to write dirty/touched state, validation aggregation, pending guards, and refusal routing myself. `Form`, `Field`, and `TextInput` already covered most of it.
- **`declare-help`** was the fastest way to get unstuck once I knew what to ask.

The initial learning requirement was substantial: several long documents and a large example before writing the app. It was worthwhile, but it consumed a meaningful part of the work. Tool-output truncation added bookkeeping. A smaller, complete “service-backed transactional app” example would have been especially valuable for this task.

The most misleading documentation moment concerned `Form.refusal()`. The prose says it reads the response into problems. I interpreted that as an operation that applies them. It actually returns a list. The short reference display did not make that return value conspicuous. I eventually read the implementation and discovered the sequence: `refusedWith`, settle, `refuse(refusal(body))`, settle, `showProblems`.

## (b) Expressing what I wanted

The language fit several important parts of Venue very well.

The selection is a list of seat IDs. The cart is a derived dataset. Counts, prices, fees, button labels, and selected-seat appearance derive from those facts. This was a natural fit for Declare’s reactive model. I did not need to decide when to recalculate the total or refresh a seat’s selected state.

The service model also fit:

- `DataSource` for production, seat maps, account, session, and orders.
- `credentials = include` for the cookie-backed API.
- `EventStream` for `seatchanged`.
- Dataset writes for sold-seat updates.
- `Form.source` for checkout.
- `refusedWith` for app-specific consequences such as clearing the security code or removing unavailable seats.

Computed defaults were particularly good. Checkout fields could follow the signed-in account until the person edited them. That directly expressed the requirement that signing in halfway through checkout should populate untouched fields without replacing typed values. The read-only fixture test exercised that behavior successfully.

A custom `SeatControl extends Control` gave me keyboard activation and focus behavior while allowing a drawn seat. `Sheet` supplied the phone row picker and sign-in overlay without a homemade scrim, escape handler, or focus trap. A `Spring` on selection feedback was straightforward.

Where I had to work harder:

- **Layout required continual discipline.** I understood the rule intellectually before I reliably followed it in nested responsive layouts.
- **Phone seating needed a product solution beyond scaling.** I built a full-room drawing, section choices, row buttons, and a sheet containing large numbered seats. Declare supported those pieces, but it did not solve the interaction design for me.
- **QR codes needed an external library.** `declare-help barcode` found no feature, so I installed `qrcode`, exposed its matrix through a TypeScript helper, and painted it with `draw`. That was a reasonable ecosystem extension, not an awkward escape hatch.
- **Keeping checkout information in view took a second pass.** The initial side summary scrolled away with the form. I added a fixed bottom region with seat lines, the running total, and Pay.
- **Imperative focus still mattered.** Constraints could describe the page, but arrival focus, error focus, and scrolling the focused field into view required methods and `afterSettle`.

The implementation mostly stayed within Declare’s intended structure: data and state in the tree, pure formatting and validation helpers in TypeScript, repeated views from datapaths. I did not build a DOM island or manually manipulate rendered DOM.

## (c) The first time it ran

The first served version did not come up. My decorative arch drawing called `ellipse` while the view’s width was still small enough to produce a negative radius:

> `IndexSizeError: Failed to execute 'ellipse' ... The major-axis radius provided (-9) is negative.`

I had written geometry that was valid at its final size but invalid during construction. I clamped both radii to positive values. That was my bug. The surprise was that custom drawing could run against provisional geometry before the layout I had in mind existed.

After that, the landing page looked broadly like the intended design: cream background, large Georgia title, red arch illustration, and performance list. But the browser reported a layout cycle in the hidden ticket navigation.

The first hall screenshots exposed a different class of problem: **the implementation could be correct locally and still fail the brief visually**. The detailed room was a long scrolling map. On a phone, it initially showed rows of tiny marks beside large “Row A” buttons, but not the whole house at a glance. I added the complete-room overview and section navigation.

The first overview then overflowed its allotted height and ran behind the section buttons. No useful automated finding caught that. I saw it in the screenshot and changed the drawing’s vertical spacing to derive from the actual row count.

Other visual discoveries came later:

- The original ticket page sat at the left of a wide desktop with a large empty area.
- Focusing “Book another evening” on successful arrival scrolled past the delivery and confirmation text.
- A declined-card message at the top of the form could disappear when focus moved down to the security-code field.
- A long, single-line saved-card button was a poor phone design.

Those were found by looking, not by a clean compile.

## (d) Refusals, errors, and surprises

These are the distinct failures I recorded. Repeated reports of the same unresolved cycle are grouped together.

| What I wrote or attempted | What Declare or the tools said/did | What I changed; my judgement now |
|---|---|---|
| `Combobox [ choices = … ]` | `Combobox has no attribute 'choices' [DECLARE2000]` | Looked up `Combobox` and changed to `items`. My mistake: I guessed from another control’s vocabulary. |
| A country combobox whose value was `"US"` while its items were records | The reference explained that `value` and `input` carry the **whole chosen member** | Switched to string members with explicit country-code mapping. This was a semantic surprise caught by reading, rather than a runtime failure. |
| `rowName: string = :name` | A declaration’s default expected a string; the diagnostic explicitly suggested `rowName: string = { :name }` | Applied exactly that. My syntax error; excellent diagnostic. |
| A horizontal `SimpleLayout` with `align = baseline` containing an ordinary `View` | The view declared no baseline; the diagnostic offered a baseline declaration or another alignment | Changed to `center`. My code was wrong; the message was precise. |
| A ticket view with `x = center` inside a layout that owned its horizontal position | `DECLARE2000`, explaining that the parent’s layout places the child | Removed the competing placement. Later centered it through the parent’s alignment. My ownership error. |
| `Focus.focus(app.content.tickets.next)` | `'next' is not a member of this View [DECLARE6001]` | The button was inside an unnamed child. I changed the focus target to a directly named view. My path error. |
| A country-code lookup assigned to a string | `string \| undefined` was not assignable to `string [DECLARE6001]` | Added a fallback. Normal, useful TypeScript checking. |
| Changing the ticket view from `visible` to `exists` without changing its focus reference | `Object is possibly 'null' [DECLARE6001]` | Used an optional reference. Good checking of conditional existence. |
| Four-way nested seat-label ternaries | Warning `DECLARE4025`: name the facts rather than nesting three choices | Introduced `numberLabel`. Helpful style feedback, although it was not the main problem at the time. |
| Arch geometry assuming its final width | Browser boot failed with a negative ellipse radius | Clamped radii. My bug; a documented warning about provisional geometry would have helped. |
| A hidden ticket pager with a flexing text label in a horizontal layout | `constraint cycle: View's SimpleLayout[x] ... at app.content.tickets.4 ... re-evaluated 100 times` | I tried a fixed pager height and nonwrapping text; that did not resolve it. Then I made tickets conditional with `exists` and gave the middle label a fixed width. It stopped being the reported cycle. **Unsure** whether the root cause was invalid sizing relationships or a layout defect. I did not isolate it. |
| The app’s vertical layout used `align = stretch`, with a flexing scroll area and a conditional dock | `constraint cycle: App's SimpleLayout[y] ... re-evaluated 100 times` | A fixed dock height alone did not fix it. I removed root cross-axis stretching and explicitly gave header, content, and dock `width = 100%`, matching the guide’s frame example. Subsequent boot and behavior checks passed. **Unsure** about the precise cycle; the diagnostic named the layout but not the feedback path. |
| A full-room drawing with a fixed height and fixed row spacing | The last tier painted into the following section controls | Derived row spacing from the available height and total rows. My arithmetic was wrong. The drawing overflow was not usefully flagged. |
| Long saved-card labels in ordinary buttons | Anticipated poor phone fit from the text length and layout; desktop presentation was also blunt | Replaced them with a two-line `SavedCardChoice` control. Primarily my design correction, not a demonstrated platform defect. |
| Focus moved to a control near the bottom of the ticket page after success | The viewport jumped past the confirmation information | Added a quiet focus target on the receipt line. My focus choice was wrong; `focusable = quiet` was exactly the feature I needed. |
| Error handling relied on default focus plus a top-of-form error message | The security-code field could be poorly positioned, and the general refusal message scrolled out of view | Explicitly revealed the first problem after settling and moved the general checkout error beside the code field. Some responsibility is mine; I remain unsure whether the initial partial field visibility exposed a platform timing issue. |
| A UI-only test called `checkout.refusal(body)` expecting it to apply a decline | The security code remained `"000"`; the test expected `""` | Read `library/form.declare`. Reproduced the documented hook/application sequence using public methods. The test was wrong. The reference could make the pure return-value nature of `refusal` much clearer. |
| A scripted source replacement removed a closing bracket | `expected ']', got 'eof' [DECLARE5000]` | Restored the bracket. Entirely my editing error. |
| I wrote the forms file using a repository-prefixed path while already inside the repository | Shell: `no such file or directory`; then missing include `DECLARE5002` | Wrote the file at the correct path. Not a language issue. |

There were also environment and verification surprises, which should not be attributed to Declare’s language:

- `npx declare-help` failed because npm attempted to create a directory in an inaccessible cache. I used `node tools/declare-help.mjs` directly.
- Browser verification initially failed with `listen EPERM` in the sandbox. The tooling needed permission to open its local listener.
- Reading the local API through `curl` also needed permission.
- Chrome emitted “Password field is not contained in a form.” I looked up `TextInput.purpose`; Declare’s documentation explicitly says its native autocomplete and name attributes do not require a form wrapper. I accepted that explanation, but I did **not** verify actual password-manager save behavior.
- The verification tool reported an intercepted order request as a write to the live service, and later warned that previous runs had changed the service. That had serious consequences for this workflow.

That last point deserves precision. The test used Puppeteer request interception and `respond` to return a synthetic order with code `VN-TEST01`. The resulting ticket showed that synthetic code. A subsequent read of the seat map showed the two selected seats still available. That strongly supports the conclusion that the order was intercepted.

Nevertheless, the tool printed that it had sent a write to the live service. Automatic approval review treated that statement as evidence of a real mutation and blocked subsequent runs, including another intercepted run. I asked the user, who chose read-only testing. I then removed the purchase test and finished with tests that never submitted a payment.

I believe the request-reporting distinction is wrong or at least materially misleading here: **a request observed in the browser is not necessarily a request transmitted to the service**. I cannot claim a server-side audit, so I would still phrase the conclusion as strong evidence, rather than absolute proof.

## (e) Verification

I used the repository’s tools rather than building a separate browser harness:

- `declare-format` for canonical formatting.
- `declare-verify --rung=3` for quick structural, resolution, and type checks.
- `declare-verify --phone --desk` for browser boot checks.
- `declare-look --url …` for served-app screenshots, console output, calls, and live attribute reads.
- Assert scripts using the supplied `drive`, `expect`, and `page` interfaces.
- Screen-reader-style locators such as `getByRole` and `getByLabel`.
- Screenshot inspection at the landing page, hall, phone row picker, checkout, refusal, and ticket stages.

The tools caught real problems:

- Wrong attribute names and binding syntax.
- Bad member paths and nullable references.
- Competing layout ownership.
- Layout cycles that did not necessarily make the screenshot obviously broken.
- The incorrect test assumption about `Form.refusal`.
- Preserved or lost field values through concrete assertions.

The final read-only phone test passed eight assertions covering seat selection, validation, grouped card numbers, password concealment/reveal, preservation of typed card data across the sign-in sheet, and zero order requests.

The recovery test passed on desktop, and the final phone recovery run passed fourteen assertions. It used a profile GET fixture and locally injected refusal/ticket data to check saved cards, an expired card, account defaults, preservation of an edited name, security-code clearing, postal-error focus, conflict removal, ticket paging, and payload formatting.

Important limitations:

- R4 feeds schema samples into some sources. It is not an API integration test. The tool reported that clearly, which was good.
- I did not establish real login, logout, or cookie persistence.
- I did not complete a clean end-to-end payment test against the service.
- The recovery tests exercised UI consequences of supplied response shapes; they did not prove that those consequences were correctly triggered by an actual failed request.
- I did not test every bank outcome.
- I did not complete a keyboard-only purchase.
- I did not test a real screen reader, mobile keyboard, or browser autofill.
- I did not run R6 visual baselines.
- I did not perform the full skill-recommended manual workout of every scrollbar, resize, and appearance mode.

The strongest part of the tools was that they let me test by accessible names without setting up Playwright infrastructure. The weakest parts were the unexplained layout cycles and the misleading live-write reporting. Screenshots remained essential.

## (f) Confidence, by part of the brief

| Part | Confidence and likely remaining problems |
|---|---|
| Performance selection | **High for the basic flow.** It uses the live twenty-performance response, formats dates/times/prices, and displays remaining capacity. I did not individually exercise all twenty performances. |
| Seat identity, selection, totals | **Moderately high.** Selection and fee arithmetic derive from the same records. Desktop and phone selection were exercised. |
| Hall readability | **Medium.** The overview improved the result considerably, but the detailed map is still long. The overview and detailed stage also duplicate some information. A demanding visual review could reasonably find it short of the brief’s “room at a glance” ambition. |
| Phone precision | **Moderately high for tested rows.** The row sheet’s large numbered targets worked under touch emulation. Longer rows, cross-section choices, and repeated opening/closing deserve more testing. |
| Live seat changes | **Medium.** The event stream is connected to real data, and removal logic was exercised locally. I did not wait for and assert a particular externally generated seat-loss event or test disconnect/reconnect behavior. |
| Optional sign-in | **Medium-low end to end.** The sheet, concealment, field purposes, and preservation behavior were checked. Actual authentication, bad-password wording, cookies after reload, and sign-out remain unverified. |
| Saved cards and defaults | **Moderately high with the fixture.** The expired card was disabled; untouched defaults populated; edited values survived. Real account integration remains a separate uncertainty. |
| Local payment validation | **Moderately high for common cases.** Luhn, expiry, CVC length, email, and country-specific postal checks exist. Only a subset of edge cases was exercised. |
| Submission and duplicate prevention | **Medium-low.** I relied on the library’s `Form.pending` mechanism. I did not prove the double-click/Enter cases against a real delayed order response. |
| Payment refusals and conflicts | **Medium for presentation, lower for integration.** Local response injection exercised the UI paths. The real service-to-form lifecycle was not fully tested. |
| Tickets | **Moderately high for rendering and paging.** Ticket data renders into individual QR tickets. I did not scan a QR code with a reader or verify a real returned ticket. |
| Accessibility | **Medium.** Named controls and fields work with role-based tests, and overlays use library focus handling. That is less than a screen-reader audit or keyboard-only completion. |
| Consumer-grade polish | **Medium.** There is a coherent design and several carefully handled states, but I would expect usability testing to uncover rough edges in navigation, long seat selections, error recovery, and phone scrolling. |

## The hardest parts, and what they cost

The hardest Declare-specific problem was **a pattern of layout uncertainty**, not one isolated typo. There were two cycle reports, unsuccessful intermediate fixes, geometry reads, multiple screenshot runs, and subsequent changes to sizing ownership. It took several edit–run–inspect rounds and interrupted the feature work repeatedly. I cannot give a reliable wall-clock duration because the session included interruptions and permission delays.

To write those layouts correctly the first time, I would have needed either:

- a worked example matching this structure—fixed header and conditional footer, a scrolling body, hidden responsive screens, and a centered ticket page; or
- a cycle diagnostic that showed the actual dependency loop, including which size was being gathered from content and which layout output fed it back.

The largest verification obstacle was **one reporting problem with repeated consequences**: intercepted requests were described as live-service writes. It cost several blocked runs, a user clarification, and a rewrite of the testing strategy. Clear reporting of transmitted, intercepted, fulfilled, and aborted requests would have prevented it.

The largest design problem was **phone seating across hundreds of seats**. That was a product-design challenge, not a language flaw. It took an initial row-based implementation, screenshot review, a complete-room overview, section filtering, and another geometry correction. A reusable zoom/detail example would have helped, but I would still have needed to make the interaction decision.

## What was good, what was bad, and what it reminded me of

The best surprise was how much of the transactional UI already existed in the library. `Form`, `Field`, `purpose`, computed defaults, and `refusedWith` were more valuable to this app than the animation features.

The second good surprise was that the source could closely resemble the product’s structure. `PerformanceChoice`, `HallSection`, `SeatControl`, `Checkout`, and `TicketCard` were meaningful units rather than wrappers required by framework machinery.

Compared with React, I wrote much less lifecycle coordination. There were no effects to keep totals current, no memoization decisions, and no render loop to reason about. Compared with ordinary HTML/CSS, however, my prior layout intuition was sometimes actively unhelpful. Declare’s single-owner rules are clearer in principle, but I had to relearn what auto-sizing and stretching meant.

It reminded me most of QML and other retained declarative UI systems: a persistent object tree, properties connected by expressions, and methods for actions. The bracket structure also has some of the feel of SwiftUI’s visual hierarchy, but the persistent nodes, datasets, and writable attributes are quite different. Its explicit constraint model is the distinctive part.

The bad surprise was that a structurally clean program could still generate a cycle in a layout whose intended shape looked ordinary to me. The compiler was much more helpful for a wrong name than the runtime was for a cyclic arrangement.

## What I would improve first

1. **Explain layout cycles as dependency paths.** Name the exact input/output chain, not just the layout that exceeded 100 evaluations.
2. **Distinguish intercepted requests from service mutations.** This is important for both user trust and automated approval systems.
3. **Add a complete transactional-form example.** Include credentials, optional login, preserved drafts, saved choices, service field errors, pending submission, and a successful result.
4. **Make method signatures prominent in help.** Especially distinguish a transformer like `refusal()` from a mutator like `refuse()`.
5. **Document provisional geometry in `draw`.** Explain when drawing runs before final layout and how authors should guard geometry.
6. **Show focus and scrolling patterns for changing forms.** A fixed bottom action region plus validation messages is common, and subtle.
7. **Improve coverage reporting around custom drawings.** The overview overflow was visually obvious but not usefully surfaced by the checker.

I would choose Declare for data-driven tools, dashboards, editors, and applications where derived state, custom controls, and coordinated motion are central—and where I could invest in learning the model. I would also consider it for consumer interfaces, but I would budget explicit browser and device testing.

For a checkout-heavy app under a tight delivery deadline, I would currently want a stronger transactional reference app and more diagnostic help with layout before preferring it over a mature web stack. The core model earned my confidence faster than the final verification story did.
