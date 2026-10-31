# Venue run 18: Declare 0727e630, Opus 5.5, recorded

**Run:** 2026-10-31, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-18 claude-opus-5-5 0727e630`, alongside Venue SwiftUI run 1.
The machine was loaded (load average about 9; a third of it the SwiftUI run's recorder, now fixed). Most of the
extra time, though, came from two verify bugs described below, and from more model time: 20.5 min against 17.0.

**Model time.** Thinking was 10.6 min over 83 pauses: reading 5.4, writing 0.1, compiling 0.3, checking 4.8.
- **Up-front planning dominates:** 128 s at 3.6 min ("Plan is forming") and 149 s at 6.4 min, just before the first
  and largest file. Those two pauses are 4.6 min.
- **Checking is spread thin;** the longest pause there is 49 s, after a failed check.
- **Against Venue 17** (reading 3.2, writing 1.8, checking 2.5) that is about +2 min of planning and +2.3 min of
  checking.
- **Output was 132k tokens against 108k,** the longer check scripts included.
- **What can't be said:** the stream keeps how long each pause lasted, not what it held, so with one run per
  version the cause can't be separated from run-to-run variation.

It validates the changes since Venue 17:
- the two layout fixes;
- the `Form` refusal order;
- the computed-axis compile rule;
- Playwright on an assert script's `page` and `expect`;
- the ARIA 1.2 `Combobox`;
- the rewritten layout paragraph in `declare.md`;
- the new account questions.

**Files beside this report:**
- the app's three files and its four assert scripts (`tests/`);
- the hidden acceptance results, delivered and at first boot (`drive/`);
- the questions it was asked (`impressions.txt`).

Its account is at the end, word for word.

## Figures

| | Venue 16 | Venue 17 | **Venue 18** |
|---|---|---|---|
| time | 25.2 min | 23.4 min | **33.8 min** (loaded machine) |
| model · tool time | 19.5 · 5.7 min | 17.0 · 6.5 min | **20.5 · 13.3 min** |
| thinking | 9.8 min | 7.5 min | **10.6 min** |
| turns · output tokens | 110 · 120.5k | 109 · 108.4k | **113 · 131.6k** |
| cached input re-read | 23.7M | 21.5M | **21.9M** |
| first app write · first compile · first boot | 8.2 · 13.2 · 14.1 min | 6.1 · 11.9 · 12.6 min | **7.1 · 10.6 · 11.6 min** |
| failing compile rounds before clean | 7 | 4 | **6 (1 min)** |
| verify calls · their time | 25 · 4.1 min | 22 · 3.5 min | **33 · 12.2 min** |
| hidden acceptance at first boot | — | 2 of 11 | **8 of 11** |
| hidden acceptance as delivered | 11 of 11 | 10 of 11 | **11 of 11** |
| code, excluding blanks and `//` lines | 1,407 | 1,394 | **1,298** |

## What the changes did

- **First boot went from 2 of 11 to 8 of 11.** The checkout fields filled their column, and the side column with
  Pay was on screen. The three flows that failed all choose seats in the lower tiers, and at first boot the
  desk hall cut off Dress Circle and Balcony with no way to scroll there ("Node is either not clickable"). The
  agent fixed that before delivery.
- **Delivered: 11 of 11, including the security-code refusal** Venue 17 lost to the `Form` ordering bug.
- **The computed-axis rule fired at compile time** (round 4): three sizes on flexing children under
  `axis = { app.phone ? … }`, each refused at its line with the fix named. Venue 17 met the same case only at boot.
- **Playwright as written.** Its four scripts (257 lines) used 42 `expect(page.…)` assertions in Playwright's
  form, chained scoping (`getByRole("dialog").getByRole(…)`), `pressSequentially` and `page.locator`, beside 49
  `drive` calls. No call was refused as "not on this page". Venue 17 lost about four rounds to the gaps.
- **Verify time rose to 12.2 min over 33 runs, and two bugs of mine caused most of it, not the load:**
  - the new locators read Chrome's computed role and name for every element on every query, about 3 ms an
    element, so one `getByRole` on the 1,889-element hall took **8.4 s**. Fixed: candidates are picked by role and a
    cheap name match first, and Chrome is asked only about the survivors, so a query takes 17.6 ms;
  - a declined `POST /api/orders` had its response but never a finish, from Puppeteer or from Chrome's own
    events. Every later settle waited out its 10 s, so `phone-story` took 54 s. Fixed: a request that has answered
    counts as done half a second later at most, and the run takes 14 s. The root cause is not explained.

  The agent's four scripts now take 37 s together.

## The audit

Every failing check, judged against the runtime:

| Round | What was refused or wrong | Verdict |
|---|---|---|
| R1 | `Seat` declared in two files (DECLARE5001) | agent's error |
| R1 ×2 | a schema named `Card`, a library class (DECLARE5000) | agent's error; the message names the rename. The same collision as Venue 16. |
| R1 | sizes on flexing children under a computed axis (the new rule) | correct refusal |
| R2 | `semibold`/`regular` bare inside `{ }` (DECLARE4005) | agent's error, as in every run |
| R3 | `string?` inside a body; calling `ChangeEvent.changed` as a function; undeclared `heading`; a possibly-null read | agent's errors. Treating `changed` as a function has now appeared in Venue 15, 17 and 18. |
| R3 | `zoomed` not a member of `HallView` | agent's error |
| R5 | its "3 seats" assertion, after a page error: **constraint cycle on `app.hallScreen.room.side.house` height** | **agent's design, a real feedback loop:** the miniature map shows when the hall is `big`, `big` reads the hall's height, and on a phone the map's own height pushes the hall's down. The runtime is right. The message names one end of the loop ("depends on its own output") and not the path through `big` and `visible`. Reproduced from the snapshot before the agent's fix (fading the map with `opacity`). |
| R5 ×3 | keyboard and focus expectations in its own scripts | the app's behaviour, fixed by the agent |

**Candidate platform improvements from the audit:**
- name the whole loop in a constraint-cycle error;
- make `ChangeEvent.changed` hard to call as a function, or catch that call;
- `Card` keeps colliding with programs' own schemas.

## The agent's account, verbatim

Asked with `account-declare.txt` (`impressions.txt`).

# Building Venue in Declare: an account for the people who make Declare

I built the whole app in one session. All four flow scripts pass against the live service. Below I've tried to separate what I know from what I'm guessing, and to say which mistakes were mine.

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`, then the brief and `API.md`.
2. `skill/SKILL.md` and `AGENTS.md`.
3. `docs/declare.md`, all of it.
4. Guide chapters `01-what-declare-is`, `04-structure` and `05-run-and-check`.
5. `apps/todo/todo.declare` and `todo-parts.declare`, both whole.

That is exactly the order the skill prescribes, and I followed it because it said "then stop reading".

**After that, I read by need:**
- `14-data.md` from "Where data comes from" to the end: forms, `DataSource` writes and streams.
- `08-controls.md` on text fields and focus.
- `19-accessibility.md` in full.
- `10-touch.md` on pan and zoom.
- The end of `06-layout.md` on scale.
- About 30 `declare-help` lookups: `TextInput.purpose`, `Form --all`, `TextInput --all`, `Field`, `Combobox --all`, `Dialog --all`, `Carousel --all`, `RadioGroup --all`, `View.focusScope`, `View.accessibilityRole`, `App`, `waypoint`, `PinchEvent`, `View.scrolls`, `View.scrollTo`, `View.tabOrder`, `ChangeEvent`/`ValueChange`, `AccessibilitySettings`, `App.lastPointerType`, and others.
- One `grep` of `library/` for `Focus.focus(`. That led me to `DatePicker._cellFor`, which showed me that walking `children` in a handler to find a view is acceptable.

**What I skipped:**
- `02-notation`, `03-constraints`, and chapters 07, 09, 11, 12, 13, 15, 16, 17, 18 and 20–23, plus the tracker and calendar apps.
- My reason: `declare.md` plus todo plus `declare-help` seemed enough. That was mostly true.
- Skipping `07-scrolling` cost me something. I learned "a scroller takes the pointer" and the `ignoreScroll`-parent rule from diagnostics instead of up front.
- Skipping `18-overlays` was fine, because the reference prose for `Dialog` and `Sheet` was enough.

**What taught me the most:**
- The todo app. It showed me where things go: dataset classes, App state, `exists` versus `visible`, computed defaults, the `addPanel`/`addSheet` pair for wide and narrow, and `afterSettle(() => Focus.focus(...))`.
- `Form --all` and `TextInput --all`. Those two reference entries designed my checkout:
  - `judged`, which is writable and is literally documented as "a security code emptied after a decline".
  - `refusedWith`, `failedMessage`, `pending`, and the note "keep the Submit button focusable… a `sending` beside `pending` is a second copy of it".
  - The `TextInput` section on regrouping a card number with `select()`.

  The brief and the library felt written for each other. That is either very good design or a sign the library was shaped around this kind of task. I can't tell which.
- `App.lastPointerType`. Its prose says, in effect, "a `press()` that branches on it… a first tap that zooms where a click chooses". That described my first phone design almost exactly and told me it was wrong.

**What was missing or misleading:**
- Nothing I read said that a `Text` subclass might not take `accessibilityRole` from a use site. See (d).
- The guide's semantics example led me to expect headings in `declare-look --semantics` output. They weren't there, so I had to check the DOM with `--js`.
- `declare-help Accessibility.announce` returned "no entry", but `declare-help Accessibility` documents `announce`. Dotted lookup into a namespace doesn't work, while dotted lookup into classes does.
- Nothing up front told me that a press on a `Control` inside a `scrolls` view becomes a canceled drag if the page scrolls during it. That one is arguably just the platform's behaviour.

## (b) Expressing what I wanted

**Where Declare fit my intent very well:**
- **The draft-follows-account behaviour.** `email: string = { classroot.account?.email ?? "" }` is a computed default: it follows the account until the person types, and then it belongs to them. That is precisely "signing in fills what's empty and loses nothing typed". I wrote no flag and no merge logic.
- **Seats changing hands.** The `EventStream` handler writes `"sold"` into the seat map and everything updates: the seat's size spring, its `disabled` state, the free count, the miniature, and removal from the choice.
- **The form:** it judges a field only after the person leaves it, judges everything on Pay with focus on the first problem, lays a refusal on the field it names, and sends once while pending. All of that came from `Form` and `Field`. My own code was `send()` building the body and `refusedWith` for the three refusals with program-level meaning.
- **`location` and `waypoint`** for the performance and the step. One line each.
- **Purpose tokens for autofill.** Again one line each.

**Where I worked around it:**
- **The seat map's keyboard model.** `focusScope = stop` moves the arrows through members in order, but I wanted the arrows to move in space. I wrote `onKeyDown` on `Seat`, a `step()` method that finds the nearest free seat geometrically, and a walk over `scroller.canvas.scene.seats.children` to find the target view. The docs anticipate this ("in a grid where Up means the row above, the view answers the arrows itself"). Still, finding a replicated view by its record's key took a child walk. A `viewFor(key)` on a replicating parent would have helped.
- **Section bands.** I used `draw()` with a hand-built path. That was fine, and it is exactly what `draw` is for.
- **Wide and narrow arrangements under a computed axis.** I needed `State [ applied = { app.wide }, width = 380 ]`-style pairs in four places. It was correct per the diagnostic, but verbose. Writing a custom layout instead would have been heavier.
- **The 409 case.** I couldn't make it occur naturally, because the stream removes taken seats before Pay. To test it I injected an already-sold seat into `app.chosen` through `page.evaluate`. That is a test workaround, not a language one.

## (c) The first time it ran

**First desktop screenshot** (`declare-look --url … --shot`). It looked like a room straight away, but:
- The Orchestra band was a wide wedge, because I'd used the maximum half-angle for the whole section. I saw it in the picture and fixed it by tracing each row's ends.
- The stage was clipped at the top. My vertical offset ignored that an arc's ends sit higher than its middle. Also seen in the picture.
- `--console` showed runtime `console.error`s: `Field.width … SimpleLayout sizes its children` and `CheckoutForm.width …`. `declare-verify` had passed R4 clean. I only saw these because I passed `--console` to `declare-look` on a screen R4 never reached.

**First phone screenshot.** It worked, but:
- The checker reported that the tap-catcher took the presses of 169 seats.
- The checker also listed 649 controls smaller than 44×44.

The tap-catcher finding, together with the `lastPointerType` prose, made me redesign the phone map.

## (d) Every refusal and surprise

1. **Schema `Seat` and class `Seat`.** DECLARE5001, "declared twice". I renamed the schema to `SeatRec`. My code was wrong, and the message was clear.

2. **Schema `Card`.** DECLARE5000, "'Card' is a library class… rename yours, as 'VenueCard'". Excellent message.
   - My own error came after it: a `sed` with `\b` (macOS sed doesn't support it) did nothing.
   - Then a `perl` rename changed the label text to "SavedCard number" and missed the `schema Card [` line, which I'd excluded. I caught both by grepping.
   - All of this was my tooling, not the platform.

3. **`height = 100%` on a `flexes` child, and `width`/`height` on `HallView`, inside a layout with a computed axis.** DECLARE2000. I removed them and used `align = stretch`. My code was wrong. The message is long but exact, and it even offers the `State` alternative.

4. **`fontWeight = { scarce ? semibold : regular }`.** DECLARE4005: inside braces it must be the string `"semibold"`. My code was wrong, and the message was clear. This is the documented "vocabulary stops at the brace" rule, which I'd read and still tripped on.

5. **The `screen` attribute's three nested ternaries.** DECLARE4025 warning. I split it into named facts (`atTickets`, `atCheckout`, `step`). The warning improved the code.

6. **`PayOption` with `accessibilityRole = radio` outside a `RadioGroup`.** DECLARE4032. I switched to a `RadioGroup` with replicated children that call `(parent as RadioGroup).pick(...)`. The warning was right, and it pointed to the library pattern I didn't know about.

7. **`let pick: Spot? = null` in a method body.** DECLARE6001: `?` shorthand isn't TypeScript, so write `Spot | null`. This was a TypeScript error under the declaration syntax. The rule is clear; my mistake was carrying the declaration syntax into a body.

8. **`e.changed("perfId")`.** "Not callable": `changed` is an array of `ValueChange`. My guess was wrong. I fixed it after `declare-help ChangeEvent`.

9. **`app.listScreen.heading`, and accesses that could be null on views gated by `exists`.** TS2339 and TS2531. I wrote explicit paths and used `?.`. My code was wrong. Good that it was caught statically.

10. **Runtime `Field.width` / `CheckoutForm.width`** (from (c)). These were the same rule as #3, raised only at run time because the widths were constraints (`width = { app.phone ? … : 0 }`), and they never surfaced in `declare-verify` output. I fixed them with `State`s.
    - Judgement: my code was wrong.
    - The platform has a gap here: a rule enforced statically in R1 but surfaced only in the browser console at runtime. I'd want R4/R5 to print these.

11. **Layout finding: zoom buttons covering seats 616/617.** I moved them. Later I moved them out of the plan entirely. A valuable finding.

12. **Layout finding: `zoomCatcher` takes 169 seats' presses, including a screen reader's activation.** This made me redesign: no catcher, a native `scrolls = both` scroller at a 44pt pitch, and a miniature. The platform was right. I'd planned on the "tap zooms first" pattern from consumer map apps.

13. **Phone-story failure: three taps, `chosen` empty, `scrollY` jumping from 103 to 248.**
    - What I wrote: `onFocus() { this.scrollIntoView() }` on `Seat`.
    - What happened: the tap focused the seat, the seat scrolled, and the tap became a moving pointer and was canceled.
    - How I found it: by probing with `--read app.chosen` and `scrollY` before and after, then comparing with a mouse click, which worked.
    - What I changed: `if (Focus.byKeyboard())`.
    - Judgement: my code was wrong, but nothing warned me. A diagnostic like "a scroll you started during a press canceled it" would have saved me about 15 minutes.

14. **The first phone-story failure, before #13: presses at the window's edges.** One press, at (22,272), landed on the miniature's box. Seats scrolled just into view can sit under overlays. I moved the miniature and zoom buttons into the strip beside the plan. My design was wrong. The lesson: overlays over a native scroller fight any scroll-into-view.

15. **Constraint cycle: `View.height … at app.hallScreen.room.side.house re-evaluated 100 times`.** The miniature's `visible` depended on `hall.big`, which depended on the hall's height, which depended on the side strip's height, which depended on the miniature being visible. I changed it to opacity plus `pointerEvents`. My code was wrong, and the error named the exact view.

16. **`accessibilityRole = heading` set on instances of `Display extends Text` didn't reach the DOM.** A plain `Text` with the same attribute did. I made `class Heading extends Text [ accessibilityRole = heading, … ]`, and that worked.
    - Judgement: **unsure**. It may be intended ("a role is fixed for a view's lifetime", with "A CLASS's accessibility facts are what the class IS" in `instantiate.ts`), but nothing told me. If it's intended, the compiler should refuse the use-site role, the way it refuses a `{ }` role. If not, it's a bug.

17. **`--semantics` never printed headings** even once the DOM had `role=heading aria-level`. I checked with `--js`. Unsure whether the printer omits headings by design.

18. **Keyboard script failure: `ArrowRight` from A7 didn't move.** That was correct behaviour, because A1–A6 were taken and seat 1 is on the right. My test was wrong. I confirmed it with a probe that logged the focused seat's label after each key.

19. **Tab order after the plan skipped "Continue to payment".** In the tree it came before the plan. I added `tabOrder()` on the room, and on the App so the masthead comes first. My structure was wrong; `tabOrder` naming deep views was exactly the right tool.

20. **Layout finding: "`payPhone` has `ignoreScroll`, but its parent does not scroll".** I moved it to the App. The message was clear, and it told me the fix.

21. **Layout finding: the confirmation line overflows at 390pt** (`ends at 408`), and **the hall heading is 221 wide in a 216 box**. I wrapped both. Real catches I wouldn't have seen otherwise.

22. **"Redundant parentheses" hints (DECLARE1002).** I filtered these out of my output with `grep -v` and never fixed them. Most came from TypeScript habits like `({ … })`.

23. **Assert-run note: "a settle waited its whole time for POST /api/orders, which never came back".** It came from my `page.evaluate(fetch(...))` rival purchase. I didn't investigate. Unsure.

## (e) Verifying it

**`declare-verify` rungs 1–4 on every edit.** These caught the compile errors above, quickly, about two seconds each. The R4 "data sources fed a sample of their schema" note was informative, but it meant R4 never exercised the real seat map.

**`declare-look --url … --shot`, `--phone`, `--click 'app."Orchestra, row C, seat 4"'`, `--read`, `--console`.** These found the visual problems: the band shape, the stage clip, the oversized labels at zoom. Naming views by accessible name in a path is a great feature. `--console` revealed the runtime layout errors.

**Assert scripts.** Four are kept in `my-apps/venue/checks/`, plus probes in `/tmp`. Playwright locators through the driver worked well: `getByRole`, `getByLabel`, `pressSequentially`, and `toBeFocused`. The "press refused because covered" behaviour turned a would-be flaky test into a design finding. `expect.request("POST", "/api/orders", { count: 2 })` proved single submission. The note "this run failed after earlier runs wrote to the service" was a thoughtful touch. Scripts using the virtual clock (`settleMotion`, `waitReal` for the stream) behaved predictably.

**Layout findings printed after each settled step.** These were the most valuable check overall: the overlay, target-size, overflow and `ignoreScroll` findings.

**`--semantics`.** I used it to confirm seat names, hints and disabled states.

**What I didn't verify:**
- Real browser autofill, the on-screen keyboard and `keyboardHeight`.
- VoiceOver or NVDA.
- Browser Back and Forward across the `waypoint` steps.
- Widths between 700 and 980.
- The 409 arriving naturally.
- `refusedWith`'s `signed_out` branch.
- Dark mode, which I didn't build.

**The tools overall:** excellent. The ladder converged. My one complaint is #10: runtime layout errors that never reached verify's report.

## (f) Confidence, part by part

**§1 Performance list: high.**
- Dates, times, the lowest price and how full each is are all shown, and "Nearly sold out" is shown below 15% left.
- A tester might note that seat counts come from the production snapshot. They're refetched only when returning to the list.

**§2 Hall: high for the structure, names and three states.** It handles live seats taken by the stream, and it handles the lost-seat notice.
- Medium for "readable at a glance on a phone": the close-up view plus a 96pt miniature is my answer, and a reviewer might find it less immediate than a full map.
- The seats use the `toggle` role, which becomes a button with `aria-pressed`. A tester using `getByRole('checkbox')` would fail. I chose button deliberately but can't know the tester's choice.

**§3 Sign-in: high.** The wrong-password sentence, show/hide, autocomplete attributes, persistence across reload and sign-out are all verified.
- Medium risk: when the dialog is open, is the masthead's "Sign in" hidden from the accessibility tree? I always scoped to the dialog in my tests, so a strict `getByRole('button', { name: 'Sign in' })` with the dialog open might hit two matches. **Unsure.**

**§4 Paying: high for the paths I drove.**
- Grouping, brand recognition, expiry and code-length checks, postcode formats, judging only on leaving, the decline keeping all but the code, the 422 on its field, single submission and the exact "Pay $X" label are all verified.
- Medium for the country combobox under real autofill. Medium for the phone keyboard covering the focused field.
- I relied on `keyboardHeight` and the browser's own scroll-into-view, with no ability to test either.

**§5 Tickets: high for content and "Sent to …".** Medium for the brief's "legible at arm's length": the type is large, but the carousel's drag-paging I only saw, not tested.

**§6 Look and feel: medium. This is judgement.**
- One accent (oxblood) means "yours" and Pay.
- But my error red (`#B42318`) is close to the accent, and a picky reviewer could call that a second red.

**§7 Phone and desk: medium-high.** The hardest requirements are met by construction (44pt seat pitch, Pay pinned in reach), but not with a real thumb.

## Surprises

- How much of a consumer checkout `Form`/`Field`/`TextInput` already handles.
- That the platform's layout checker caught design mistakes (#12, #14), not just bugs.
- That the reference prose argues design. The `lastPointerType` entry tells you not to build what I was about to build.
- That a seat taken via the stream needed zero glue beyond one `set`.

## What was good

- The diagnostics name their fix (5000, 2000, 4005, 4032, the `ignoreScroll` one).
- Computed defaults.
- `waypoint`.
- `tabOrder()`.
- Purpose tokens.
- Springs on per-seat size, at no cost while idle.
- Path naming by accessible name in tools.

## What was bad

- The heading-role surprise (#16).
- Runtime-only layout errors missing from verify (#10).
- `declare-help` not resolving `Accessibility.announce`.
- Verbose `State` pairs for responsive sizes under a computed axis.
- No built-in way to find a replicated view by key.
- Hints I learned to grep away, which is a habit worth discouraging.

## How it compares

It reminded me most of **QML** (property bindings, states, anchors-free layouts), **Flex/MXML and OpenLaszlo** (which it names as its lineage), and **SwiftUI** (states and springs, library controls as values). Unlike React, I never thought about re-rendering. Unlike SwiftUI, layout errors are explained rather than silently resolved. TypeScript inside braces meant my real logic (Luhn, regrouping, the geometry) felt like ordinary code.

The sharpest difference is that the tooling, not just the type system, holds opinions about accessibility and touch, and enforces them in the loop.

## Where I'd most want improvement

**The hardest part was a pattern, not one obstacle:** touch interaction on a transformed, scrolled scene, which is #12, #13, #14 and #15. It cost roughly a third of the session: three designs of the phone hall and two debugging probes. To get it right first time I'd have needed one guide section, "a large tappable surface on a phone", covering:
- Use a native scroller at finger scale, not transforms plus a catcher.
- Keep overlays outside the scroller.
- Never scroll during a press.

`10-touch.md`'s pan-and-zoom section points toward a draw-only surface, which doesn't fit 648 accessible controls.

After that:
- Surface runtime layout errors in verify.
- Settle the use-site role question (#16).
- Give replicated parents a way to look up a view by key.

## What I'd use it for

Forms-heavy consumer flows, internal tools and dashboards: anything where accessibility and phone/desk parity matter and the team would otherwise hand-roll them. I'd also use it for interaction prototypes that need to feel real.

I'd hesitate where I need a large third-party component ecosystem, or a team that must hire for it. And I don't yet know how it performs on low-end phones with 648 live controls. I never profiled it.
