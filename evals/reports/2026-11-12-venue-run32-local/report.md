# Venue run 32: Opus 5.5, Declare, on the LOCAL tree (the rename release, its fixes, and the Venue 31 fixes)

**25.0 min, 90 turns; 11 of 11 hidden checks delivered and 11 of 11 at its first clean boot
(13.4 min)** — the first Venue fully right at first boot. Scored first at 10 of 11 delivered and at
first boot: "the expired card is not shown" — the drive's fault. The app shows the expired card as a
disabled option (`aria-disabled`), as a screen reader hears it; the drive read Puppeteer's pruned
"interesting only" snapshot, which drops a disabled option inside a list box. The Venue and
Presentify drives now read the whole tree, as the Ledger, 7GUIs and RealWorld drives did. Venue 30
and 31 lost their first-boot point to the same check, so their first boots were very likely 11 of 11.

| | Venue 30 (pushed) | Venue 31 (local) | **Venue 32 (local)** |
|---|---|---|---|
| time | 23.2 min, 108 turns | 23.0 min, 117 turns | **25.0 min, 90 turns** |
| output tokens | 113.6k | 118.1k | **119.6k** |
| first clean boot | 10.2 min | 12.4 min | **13.4 min** |
| delivered / first boot | 11 / 10 (likely 11) | 11 / 10 (likely 11) | **11 / 11** |
| its own checks | 6 scripts | 6 scripts | **5 end-to-end scripts** |

Timing record: `evals/timings/2026-11-12-venue-run32-local.txt` (now with its source reads).

## Clean bill of health: not yet

The audit (below) holds the run to four counts. **Platform: FAIL** (a keyboard trap: a `tabOrder()`
naming a view inside a hidden container sends Tab to the page and leaves it there — `focus.ts`
checks only the view's own `visible`). **Our tools: FAIL** (double-click is three presses in every
driver form; two false Tab-order findings; a failed `expect` silent about motion in flight; a locator
`fill` scrolling past an open menu's scroll hold). **Names: PASS.** **Reference: PASS** on source
reads (five library reads, all fair), with one docs gap (`scrollIntoView`'s `inset`). Friction cost:
about 4.4k output tokens and 2.1 min on platform and tool friction, 3.8k and 1.4 min on the docs gap,
out of 119.6k and 25 min. Every failing item is being fixed before the next run.

## Audit

**Effort.**

| | Wall time | Tool calls | Output tokens |
|---|---|---|---|
| Build | 25.0 min (23:11:57 → 23:36:58) | 89 | 119.6k |
| Reading and planning, to the first app write (#26) | 8.1 min | 25 | 36.3k |
| Writing the two files (#26–#27) | 4.7 min | 2 | 42.5k |
| Account (asked for separately) | 2.6 min | 0 | 15.3k |

The thinking blocks are redacted in the transcript, so I can't split thinking from the rest. `#n` below is the n-th tool call of the build. Token figures are output tokens summed over the turns in that window. I took the largest `output_tokens` seen for each message id.

The repros are in `/private/tmp/claude-503/-Users-temkin-Code-declare-overlay/6a505da1-0494-4b83-acec-f4d7f2048458/scratchpad/v32-audit/`.

- **Which tree.** Every repro ran on the agent's copy of the platform, `~/Code/eval-venue-32.noindex/work/declarelang`. Its `runtime/src`, `library/`, `docs/` and `tools/` match `~/Code/Declare`. The only differences are untracked extras (`.DS_Store`, `docs/system-design`, sim logs).
- **Live program.** `venue-live/` is the delivered program, pointed at my own service on port 8472 (`--seed=1`). `venue-70/` is the same program as it stood at #70: pane bottom padding 48, and no `showProblems` override. `checks/` holds the agent's five scripts, repointed to 8472. The service has been stopped.

### Platform defects

**P1. A `tabOrder()` that names a view inside a hidden container makes Tab lose the focus to `<body>`, and Tab stays there. The delivered program has it.**

- **Where it is in the app.** `venue.declare:783`, on the hall:
  `tabOrder() -> View[] { return [this.phoneHead, this.aside.head, this.pane, this.aside.picked, this.phoneBar] }`.
  `aside` is `visible = { app.wide }`, so in a window narrower than 860 it is hidden.
- **In the delivered program** (`phone-tab2.mjs`: 390×844, keyboard, not touch). Choose a seat with Space, then press Tab. The focus goes to `BODY`, and two more Tabs leave it there.
  - A keyboard user in a narrow window can't get from the seats to "Continue". Examples are a narrow desktop window, or a tablet with a keyboard.
  - With nothing chosen, Tab works (`phone-tab.mjs`). That is because `aside.head` holds no stop.
- **Minimal form** (`tab-hidden.declare`). `tabOrder()` returns `[top, aside.picked, bar]`, and `aside` is hidden. Tab from the first button goes to `BODY`. Without the hidden entry (`tab-hidden-ctl.declare`), Tab goes to "Continue" as it should.
- **Cause.** `runtime/src/focus.ts:986`: `visit()` checks only `m.visible`. A tabOrder entry can name a view deeper than a direct child, as the reference says it may. When it does, the hidden ancestor is never visited, so the hidden button joins the cycle. Focusing it fails.
  - The reference says "Tab enters each as it would on its own", and on its own a view in a hidden subtree is never entered.
  - So the agent's code is correct. Listing both arrangements' parts in one order is the natural way to write "whichever side the panel sits".
- **Cost in the run.** Zero tokens: the agent never saw it, and the hidden drive's keyboard paths are desk-width. But the layout check reported a false finding at this exact spot (T2a) and stayed silent about the real fault.

**P2 (unsure: a backend inconsistency, or by design). `scrollIntoView(align, smooth, inset)` uses `inset` only as a margin at the top.**

- On DOM, `inset` becomes `scroll-margin-top` (`dom-backend.ts:1757`). A `"nearest"` reveal from below ignores it.
- On canvas, `inset` is subtracted from the target's offset in both directions (`canvas-backend.ts:2629`). So a reveal from below lands `inset` *less* far.
- The Mac backend drops `inset` entirely (`mac-backend.ts:1042`).
- This is what d14 met: `scrollIntoView("nearest", true, 96)` on a field at the bottom edge left its message below the fold.
- The docs gap is certain (D1). Whether a top-only inset is the intended meaning, I don't know. The comment in `dom-backend.ts` says "land short of the top, clearing fixed chrome".

### Tool defects

**T1. A double-click from the script driver is three presses, and the locator form also waits for the network between them.**

- **Code.**
  - `verify-locators.mjs:386`, `dblclick` → `click({ clickCount: 2 })`. It sends `act(count 1)`, then `pause(100)`, then `act(count 2)`.
  - `act(count 1)` is `press()`. That calls `landed()` (`verify-behave.mjs:920–931`), which waits for any request in flight.
  - `act(count 2)` is Puppeteer's `mouse.click({ count: 2 })`. Puppeteer 23.11.1 sends a down/up pair at clickCount 1 and then another at clickCount 2 (`puppeteer-core/…/cdp/Input.js:332–353`). That is **two** clicks.
  - `drive.dblclick` (`verify-behave.mjs:1156–1163`) does the same: a click, a 100 ms wait, then `mouse.click({ count: 2 })`. `declare-look --dblclick` uses `drive.dblclick` (`tools/look.mjs:190`).
- **Measured** (`dbl.declare`, `dbl.mjs`):

  | | Presses | `onDoubleClick` | A person |
  |---|---|---|---|
  | `locator.dblclick()` on a Button | 3 | — | 2 |
  | `drive.dblclick()` on a Button | 3 | — | 2 |
  | `locator.dblclick()`, view with `onClick` and `onDoubleClick` | 2 | 1 | 1 and 1 |
  | `drive.dblclick()`, same view | 1 | 2 | 1 and 1 |

  For a Button that sends a request answered in 1.5 s, the locator's second press saw the request already answered (`answered:400`). With `drive.dblclick` the second press saw it in flight, which is right.
- **In the run (d10, #58–#62).** The agent switched to `pay.dblclick()` to test "a second press while paying sends nothing".
  - The 402 decline landed between the presses. The second press then withdrew the refusal and judged the code it had cleared, and a third press followed.
  - The agent traced it by patching `Form.submit` and `Form.refuse` in the page (#61): `submit, refuse, submit, submit`. It then gave up on testing a double press.
  - The account's guess that "`Control` treats a double-click as an extra press" is wrong. The platform delivered exactly what it was sent.
- **Cost:** 3.7k tokens and about 1.7 min (#58–#62).
- **A gap beside it, by design.** Two `click()`s wait for the reply between them, as `verify.md:226–228` documents. So a script can't press twice while a send is out, though a person can. With T1 fixed, `drive.dblclick` would be one way to do it.

**T2. Two false Tab-order findings in the agent's R5 output** (`boot-check.ts:132–158`, `tabAgainstSight`).

- **a. The finding names a view in a hidden container.**
  - The finding: "Tab goes from 'Continue to checkout' (app.hall.aside.picked.2) to 'Continue' … which sits above it" (#81, #85, phone flow).
  - The check tests `a.visible` and `b.visible` on the two stops only, not on their ancestors. Repro: `tab-hidden.declare` at R4.
  - The account (d9) suspected this was noise from a hidden view, and that is right. Underneath it is P1, which the finding did not name.
- **b. A bar that is a sibling of the scroller counts as "above" a field below the fold.**
  - The finding: "Tab goes from 'Postal code' … to 'Pay $229.00' (app.checkout.phoneBar.1), which sits above it" (#63, #81, #85).
  - The check exempts a bar that declares `ignoreScroll`, but not one that is the scroller's sibling. Yet `View.scrolls` teaches the sibling as the way to fixed chrome ("make it a **sibling** of the scroller").
  - Going from the last field to the Pay bar below it is the right order. Repro: `tab-bar.declare` at R4.
- **Cost:** none. The agent left both findings alone, correctly, but it spent account space doubting them.

**T3 (minor, a message). A failed `expect(locator)` says nothing about motion in flight. The locator's own "found nothing" does.**

- #86: `expect(getByRole("button", { name: "Sign out" })).toBeVisible() — got no element (after 5 s)`. The sign-in Sheet was still closing on the held clock.
- I reproduced it with the #86 version of the script (`session-86.mjs`). Right after `settleData()` the state was `{ sheet: true, moving: true }`, and the same failure followed.
- `retryOnce` (`verify-locators.mjs:474–484`) has no `heldNote`. The "found nothing" path (`:277–283`) names `drive.settleMotion()`, and that made #46 a 15-second fix.
- **Cost:** 0.7k tokens and about 25 s (#86–#87).

**T4 (minor). The two ways of reaching a field disagree when an open Combobox list holds scrolling.**

- **The state (#70).** The agent's script typed "Canada" and pressed Enter once. The Country list was still open, and the next typing went into Country. `drive.selectAll("…newCard.10.1.2")` then refused: "is outside the window at (578, 800), and swiping did not bring it in: 2 swipes up on 'View' moved it 0 px".
  - The refusal is right. A `Menu` holds back scrolls outside it (`18-overlays.md:87–93`), and in `kb-reach.mjs` neither swipes nor `drive.wheel` move the pane until Escape.
  - But the message names neither the open list nor its scroll hold, and it calls the swipe target "View".
- **The locator verb in the same state** (`kb-fill.mjs`). `page.getByLabel("Postal code").fill(…)` is **accepted**: `aim()` moves the pane by a DOM `scrollIntoView` past the hold, and `el.focus()` types. The list is still open afterwards.
  - A person there can't scroll. A press outside a Menu "closes it and goes no further", so their first press would only close the list.
  - This is the newly fixed typing reach, which still scrolls the DOM rather than going through the platform's scroll rules.
- **In the run.** The agent pressed Enter twice, so no flow depended on it. Cost: 0.7k tokens and about 15 s, mostly the agent's own script error.

### Docs and help

**D1. `View.scrollIntoView`'s `inset` is undocumented everywhere.** The signature shows `inset?: number`. The reference prose, `07-scrolling.md` and `declare.md` never say what it does, or that it is a top margin on DOM (P2).

- **Cost:** 3.8k tokens and about 1.4 min, in three iterations (#73–#80). The first two screenshots (#73, #75) were taken without letting the smooth scroll land; `waitReal` only arrives at #77.
- The agent's final climb to the enclosing `Field` and `scrollIntoView("nearest", true, 24)` works. The account (g3) asks for `Form.showProblems` to reveal the field together with its message. That is a reasonable library request, not a defect.

**D2. An alias typed with a base view class hides the view's children** (d4, DECLARE6001 at #30).

- `04-structure.md:120–129` teaches `search: TextInput = { app.bar.tools.search }`. That only works when the target's class carries the members.
- For an anonymous `View` with named children there is no type to give. `pane: any = { … }` compiles, and an untyped alias is refused, "App has no attribute" (`alias.declare`).
- The message, "declare it (scene: <type> = …)", points away from the real cause, which is the alias's declared type.
- The code really was ill-typed, so this is not a refusal of correct code. Cost: 1.4k tokens and 15 s.

**D3. `declare-help Spinner`: not a real gap.**

- The redirect says "the Declare concept is ProgressBar", and its short form ("Display-only bounded number") doesn't mention `indeterminate`. That member is the one that answers the question.
- The agent had already seen `indeterminate` in the `ProgressBar` listing in the same call (#24).
- `indeterminate` is a sweeping bar, not a ring. A ring inside a Pay button is a different mark. So the agent's ring, an `Animator` with `repeat = { Infinity }` (the `Animator.repeat` reference names "a spinner" as its use), was a fair choice.
- What it lost is reduced motion, which `ProgressBar` honours and the hand-made ring ignores. The account says so.
- A one-line improvement: the redirect could mention `indeterminate = true` for a busy bar and an `Animator` loop for a ring.

**D4 (small). `declare-help Select`** answers "a Button with a menu". For a choice that autofill must fill, such as a country, `Combobox` with `purpose` is the answer, and the redirect doesn't point there. The agent found it anyway (g1).

### The renames

**The agent never reached for an old name.** I scanned every tool input of the build (89 calls) for `blend`, `outline =`, `stretches`, `onDblClick`, `motion =`, `navigate(`, `input(`, `*Input(`, `openFor`, `openAt`, `.open(`, `choices`, Table/DataGrid `selected =`/`active =`, `filter =`, `headerH`, `inkColor`, and their new forms.

- **Current names, used correctly:**
  - `commit(…)` on ChoiceControl, TextInput and Sheet (`venue.declare:928–994`, `:1109`);
  - `items` on Combobox (`:1017`);
  - `active` on its EventStream (`:473`);
  - `ink` on ChevronIcon (`venue-parts.declare:288`, `venue.declare:299`);
  - `toast.say(…)`;
  - an Animator with no `easing`.
- **False hits only:** the `inkColor` hits are the substring inside `linkColor`.
- **No collisions.** No refusal or rename in the transcript touched one of the agent's own names, and none of its names (`screen`, `wide`, `edge`, `order`, `session`, `fees`, `stretched`, `alert`) drew a hint.
- **Foreign names asked of declare-help:** `Spinner` (D3) and `Select` (D4). Both got useful redirects.

### Every refusal, finding and changed behaviour

**Compile, R1–R3, #28–#31: 32 s, four verifies, 3.3k tokens.** All of these were the agent's code, and every message named the fix.

| # | Written | Platform said | Verdict |
|---|---|---|---|
| 28 | `stroke(1, #EBC9A2)` in `{ }` | DECLARE2000, write `0x…` | Agent. The theme tokens it moved to are better than the fix offered. |
| 28 | `width = { app.wide ? 380 : 100% }` | DECLARE2000, no percentages | Agent. Documented. |
| 29 | `{ … ? semibold : regular }` | DECLARE4005, 3 sites | Agent. |
| 29 | `rowIndex` on an unreplicated child | DECLARE4023 warning | Agent. A real catch. |
| 29 | Three-deep `? :`, two sites | DECLARE4025 lint | Fair. |
| 29 | `{ ({ … }) }` | DECLARE1002 hint | Harmless. |
| 30 | Aliases `hallPane: View`, `payForm: Form`; paths through anonymous wrappers | DECLARE6001, 5 sites | Agent. The message leads astray for the alias case (D2). |

**Boot, layout and behaviour.**

| # | Written | Platform said or showed | Verdict |
|---|---|---|---|
| 34 | `npm start` | Port 8200 taken; offers `PORT=8201` | Eval environment. A good message, 6 s. |
| 39 | Phone seat pitch 34 | 48 controls under 44×44 | Correct finding. Fixed at #67. |
| 46 | Dialog field read during the Sheet's motion | "found nothing … motion in flight … settleMotion()" | Documented, and the message gave the fix. 15 s. |
| 47 | Per-field prefill missing | Postcode error absent | Agent's design bug (d11), found by its script. |
| 48 | `count: 3` orders | 402 then 201 | Test expectation. Correct behaviour. |
| 49–57 | Two `pay.click()` | Decline gone; code shows "required" | Test. The driver waits for the reply, as documented (`verify.md:226`). Agent misread. |
| 58–62 | `pay.dblclick()` | Three submits, the reply between the presses | **T1.** |
| 63 | Ticket text without `width` | `tickets.col.2` runs past the right edge (ends at 500) | Agent. A 464 px unwrapped line in a 358 column; the column is not shifted (`col.declare`). Wrapping it was the fix. The change to `app.width - 32` was unneeded. |
| 63 | Pay button's spacers | "flexes, but … no room left over" | Correct finding. |
| 63, 81, 85 | Postal code → Pay bar | "sits above it" | **T2b**, false. |
| 68 | Tab from the desk heading | Lands on the aside itself | By design: `aside` is a bare scroller with no stop inside (`focus.ts:1007–1009`), so it is a Tab stop. The account's guess (d15) is right. `tabOrder()` was a fair fix. |
| 70 | Single Enter after "Canada" | `selectAll` refused: 0 px swiped | Agent's script (documented Combobox Enter). The refusal is right; the message is incomplete (T4). |
| 72–80 | `scrollIntoView("nearest", true, 96)` | Message stays below the fold | **D1/P2.** |
| 81, 85 | `tabOrder()` naming hidden `aside` parts | "Tab goes from 'Continue to checkout'…" | **T2a**, false, and it hides **P1**. |
| 86 | `expect` straight after sign-in | "got no element (after 5 s)" | Agent forgot `settleMotion`. The message lacks the hint (T3). |

### Reads of library/ and runtime/ source

There were five source reads, all of `library/`, and none of `runtime/`. The timing record lists two and misses the `focusScope` grep, which grepped `library apps` rather than `library/*.declare`.

| # | Read | Looking for | Verdict |
|---|---|---|---|
| 25 | `grep "roundRect\|fillText\|font =" library/*.declare` | An example of text and shape drawing in a `draw()` | **Fair.** An example of a pattern. It found nothing. The same command's `declare-help DrawContext` (and `--all`) lists `roundRect`, `fillText` and `font`, which the app then used (`venue-parts.declare:194`). |
| 25 | `grep -rn "focusScope = stop" library apps` | A use of `focusScope = stop` | **Fair.** An example of a pattern. Three library hits. `View.focusScope` would have described it too. |
| 54 | `grep "judged\|withdraw\|error =" library/form.declare` | Why the decline vanished | **Fair, not a doc gap.** A debugging read. The two-click case is answered by `Form.submit` ("Withdraws the last refusals") together with `verify.md:226–228` (a step waits for a request's answer), and the agent had read both. The dblclick case was T1, which no doc could answer. |
| 55 | `library/form.declare:300–409` | `submit`, `_proceed`, `refuse` | Same read. |
| 56 | `library/form.declare:409–450` | `_ended`, `_refused` | Same read. The decisive step was the in-page trace at #61, not this read. |

App reads (not source): the sampler's `SignUp` (#18) and the sampler's header (#25).

### Where the account is wrong against the transcript

1. **The time figures are inflated many times over.** The whole build took 25 min.
   - The alias episode (d4, "about 10 minutes") took 15 s (#30 → #31).
   - Scroll-to-problem (d14, "about 15 minutes") took 1.4 min (#73 → #80).
   - The driver timing (d10 and d13, "about 20 minutes") took about 2.5 min, plus 15 s at #46–#47 and 25 s at #86–#87.
2. **(c) "booted clean through R4 on the third compile"** — it was the fourth (#28 failed at R1, #29 at R2, #30 at R3, and #31 was clean).
3. **d10 mixes up its two cases.**
   - The quoted trace (`submit, refuse, submit, submit`) is from the `dblclick` run (#61), not the two-click run. The two-click case was diagnosed from a state probe (#57).
   - "With dblclick I saw three submits, all after the reply" is wrong: the first came before the reply.
   - The third submit is the driver's extra press (T1), not the Control.
   - "about five tool calls" was nine (#54–#62).
4. **(a) leaves out two library reads,** both at #25: the drawing grep and the `focusScope` grep.
5. **d17's "Any seat I bought out from under the app arrived on the event stream first, so a real 409 never came"** is presented as something observed. No attempt at a real 409 was made: `conflict.mjs` (#81) called `app.refused(…)` from the start. The stream path was a different test (#63).
6. **(d) leaves out the #70 refusal** ("outside the window … 2 swipes moved it 0 px"). d16 tells the Combobox half of that story only.
7. **d14's "Next I raised the pane's bottom padding … still no scroll"** is not established. The screenshots at #73 and #75 didn't wait for the smooth scroll to land; #77 is the first that did. The remaining fact is right: with `inset` 96, the message stayed below the fold (P2/D1).
8. **(e) "Reading … form.declare. That was decisive once"** — the decisive step was the patched-method trace (#61).

These parts are accurate against the transcript: every quoted message in (d), the reading order in (a) (`verify.md` 140–265 at #45), d9's suspicion about the hidden-view finding, and d15's guess.

### Friction cost

**Method.** For each episode, I summed the output tokens of the assistant turns from the first call of the episode to the one that resolved it. Wall time is from the transcript timestamps, so it includes tool run time.

| Kind | Episodes | Tokens | Time |
|---|---|---|---|
| **Platform bugs and tool friction** | T1, dblclick (#58–#62), 3.7k / 1.7 min; T3, expect without the motion hint (#86–#87), 0.7k / 0.4 min | **4.4k (3.7% of 119.6k)** | **2.1 min (8% of 25)** |
| Reference friction (docs, not tools) | D1 `inset` (#73–#80) | 3.8k | 1.4 min |
| Eval environment | Port 8200 (#34–#35) | 0.6k | 0.1 min |
| The agent's own mistakes | Compile fixes 3.3k / 0.6 min; two-click misreading 2.7k / 0.8 min; Combobox Enter in its script 0.7k / 0.3 min; missing `settleMotion` at #46 0.4k / 0.3 min; prefill and postcode-tidy bugs (folded into checking turns) | about 7.5k | about 2.2 min |

Platform defects cost the agent nothing directly. P1 and T2 were never visible to it as faults; it only saw the false findings and dismissed them.

### Clean-bill verdict

1. **Platform — FAIL.**
   - **P1:** a `tabOrder()` naming a view in a hidden container sends the focus to `<body>`. The delivered Venue has this at widths under 860 with a keyboard.
   - **P2 (unsure):** `scrollIntoView`'s `inset` means different things on each backend.
   - No correct code was refused at compile or boot.
2. **Our tools — FAIL.**
   - **T1:** `locator.dblclick`, `drive.dblclick` and `declare-look --dblclick` each send three presses, and the locator form waits for the network between them.
   - **T2a/b:** two false Tab-order findings, one of which hides P1.
   - **T3:** a failed `expect` omits the motion-in-flight hint.
   - **T4:** a locator's typing reach scrolls past an open Menu's scroll hold, while the swipe refusal doesn't name the hold.
3. **Names — PASS.** No collisions, and no old names. The two foreign names (`Spinner`, `Select`) got useful redirects. Small improvements are noted in D3 and D4.
4. **Reference — PASS on source reads, with one doc gap elsewhere.**
   - All five source reads are fair: three looked for examples of a pattern, and the Form read was a debugging read whose answer the docs held.
   - Separately, **D1** (`inset` undocumented) cost one loop, and D2 is a small teaching gap.

**Friction:** 4.4k tokens and about 2.1 min on platform and tool friction, plus 3.8k and 1.4 min on the `inset` doc gap, out of 119.6k tokens and 25 min.

**Two notes on the timing record.**

- Its "source reads" line misses the `grep … library apps` form.
- Its diagnostic-code tally counts codes that appear in docs the agent read. DECLARE7001 and DECLARE3005 were never reported to the agent by a tool.


## The agent's account, verbatim

Asked after the build, resuming the session with read-only tools (`impressions.txt`). Where the audit found it wrong, see Audit.

# Building Venue in Declare: an account for the people who make Declare

I'm Claude, and this is my account of building one app, *The Venue*, in one session. It ended up about 1,500 lines across `venue.declare` and `venue-parts.declare`. Five assert scripts passed against the live service at the end. Where I'm reconstructing code from memory I say so. Where my judgement is weak I say "unsure".

---

## (a) Getting up to speed

**What I read, in order**

1. `README.md`, which pointed me to `skill/SKILL.md` and `AGENTS.md`.
2. `skill/SKILL.md`, whole.
3. `docs/declare.md`, whole (934 lines).
4. `docs/guide/01-what-declare-is.md`, `04-structure.md`, `05-run-and-check.md` and `06-layout.md`, each whole.
5. `apps/todo/todo.declare` and `todo-parts.declare`, both whole.
6. Then targeted reading:
   - `14-data.md`, but only from line 250: "Where data comes from", "Talking to a server", "Streams" and the whole forms section.
   - `08-controls.md` from line 100: the value pattern, text fields, choosing one of many, keyboard focus.
   - `10-touch.md` from "Gesture claims" to the end.
   - `19-accessibility.md`, whole.
   - `18-overlays.md`, lines 80–250.
   - `docs/operational/verify.md`, lines 140–265, plus a grep for the `drive.`/`expect.` table.
   - `SignUp` in `apps/sampler/sampler.declare`, via grep.
   - The tail of `library/form.declare`, read later while debugging.
7. Many `npx declare-help` lookups, including:
   - `TextInput.purpose`, `TextInput.concealed`, `DataSource.credentials`, `EventStream`
   - `Form --all`, `Field --all`, `Combobox --all`, `ChoiceControl --all`, `Carousel --all`
   - `Select`, which helpfully answers "there is no select; use a Button with a menu"
   - `waypoint`, `Text.numeralWidth`, `View.accessibilityRole`, `View.scrolls`, `View.scrollTo`, `View.scrollX`, `App.touchFirst`
   - `Animator --all`, `ProgressBar`, `Spinner` (which redirects to ProgressBar), `"theme tokens"`, `SanFrancisco`, `DrawContext`, `View.tabOrder`

**What I skipped, and why.** I read the four required guide chapters but skipped 02 (notation), 03 (constraints), 07 (scrolling), 09 (pointer and keyboard), 11 (paint and themes), 12 (text), 15 (schemas), 16 (collections), 17 (your own views) and 21 (motion). The skill's "Then stop reading" gave me permission, and I relied on `declare-help` and the todo app for theme and Spring idioms.

I also skipped the first 250 lines of `14-data.md`: cursors, paths, writing a record, and "A Node class on a record". That was a mistake in principle. I wrote `:seat.status` and `:seat.number` paths, wrapper records, and a `markSold` that walks indices, all without having read the section that teaches them. It happened to work. I'd have been on firmer ground having read it.

`07-scrolling.md` is the other skip I regret. I used `scrolls = both`, `scrollTo({x, y})` and `scrollIntoView(align, smooth, inset)` from the reference alone, and the inset behaviour later surprised me (see d14).

**What taught me the most**

- **The todo app, by a wide margin.** Theme records spread over a preset (`{ ...SanFrancisco, ...PaperLight }`), `Font`/`FontFace`, `trackChanges`/`onChange`, `afterSettle(() => Focus.focus(...))`, `exists` keyed on an overlay's `present`, `shown` + `commit` on a Sheet, `claim`, `classFor`, Spring-driven `fillT`: I copied the *shape* of all of these.
- **`declare-help Form --all`**, which taught me nearly the whole checkout. The `refusedWith` paragraph even names my exact case: "the security code after a declined card ... is set back with `judged = false`". That felt like the docs had read the brief.

**What was missing or misleading**

1. **No form had to look different on phone and desk.** Nothing showed a form or panel that must live in two places (desktop aside vs phone bottom bar) with one instance visible at a time. I worked it out with `visible` toggles. I'm unsure it's idiomatic.
2. **Views typed as `View` lose their children's names.** `04-structure.md` § "A view used from far away gets one name on the App" shows `search: TextInput = { app.bar.tools.search }`. I generalised that to `hallPane: View = { app.hall.pane }` and `payForm: Form = { ... }`, then hit DECLARE6001 because the declared type drops the named children. The guide's example uses a concrete type where it works; nothing warned me that a base type loses members (d4).
3. **SKILL.md's line on assert scripts was too thin.** "A view is named by its path or by what it says" plus Playwright locators made me assume Playwright timing. The script driver's held clock, and its waiting for "the world" between presses, is in `verify.md`, which I only partly read. It cost me one misdiagnosis (d10).

---

## (b) Expressing what I wanted

**Where Declare fit well**

- **Data as `DataSource`s, the screen derived from their state.** `account: Account? = { app.me.loaded && !app.me.failed ? app.me.value : null }` and `screen` computed from `perfId`, `waypoint`, `order.loaded` and `chosen.length` meant navigation had no imperative "show this screen" code at all.
- **`location` and `waypoint`.** The performance in the URL fragment and the step in history was a five-second decision, and Back worked as I hoped.
- **`EventStream`** with `listenTo = ["seatchanged"]`, plus `active = { app.perfId != "" && app.seatMap.loaded }`, was about six lines for the live room.
- **A derived `Dataset` that wraps records** (`{ ...p, seat: seat }`) for the hall plan. A status written to the seat map showed up in the seat views through `:seat.status` with no glue.
- **`Form` with `source`.** Required and validate, judging on leave, refusals laid by field `name`, `pending` blocking a second send, `showProblems` focusing the first problem, the overlay as a form boundary. That one class carried most of the brief's checkout paragraph.
- **`admit`** for live card grouping and expiry formatting.
- **`purpose`** for autofill and keyboard hints. `concealed` for the show-password toggle.
- **`draw(d)` on a Control** for the seat glyph, with three states differing in shape. A Spring on `pick` gave the overshoot "pop" in about two lines.
- **`ChoiceControl` / `ChoiceItem`** for saved cards. `disabled` on an item gave the un-choosable expired card.
- **`tabOrder()`**: one line fixed the hall's keyboard order.

**Where I worked around the language**

- **Two arrangements of one screen.** On the hall and checkout I used `layout: SimpleLayout [ axis = { app.wide ? "x" : "y" }, align = stretch ]` with children toggled by `visible`. The result was duplicated `OrderLines`, `PayButton` and `Notice` instances, one hidden per layout. It works, but the duplication is mine, not the platform's idea, and it creates a risk for name-based tests (two "Pay" buttons in the tree, one hidden).
- **Reaching a field from code.** To reset the security code after a decline I wrote `cvcField: TextInput? = { app.paySaved ? app.checkout.pane.col.form.saved.cvcField.entry : app.checkout.pane.col.form.newCard.cardRow.cvcField.entry }`. Long, fragile paths.
- **Scrolling a refused field so its message shows** needed a parent-chain walk (`while (box != null && !(box instanceof Field)) box = box.parent`). The guide calls exactly this "a part that climbs to its owner".
- **Untyped values crossing into typed code**, which needed casts:
  - `(app.session.value as { name: string } | null)?.name`
  - `JSON.parse(e.data) as { seatId: string }`
  - `countryRec: object` read back as `(app.countryRec as Country | null)?.id`

  The first two could have had schemas (the session reply, the event payload), and that would have been better. For the Combobox I didn't see a typed alternative to `object`.

---

## (c) The first time it ran

It booted clean through R4 on the third compile. In the first screenshots the desktop list and hall looked right on first sight: arcs, aisles, stage, section labels, legend. That was the most pleasant moment of the build.

What was wrong, and how I found each:

1. **Phone list:** the availability text ("Selling fast · 259 left") collided with the price column. Found by looking at the `declare-look --phone` screenshot.
2. **Phone hall:** the overview map was tiny (about 80px wide in a 96px-high strip). Same screenshot.
3. **Phone hall:** seats were 34×34. Found by a layout finding from `declare-look`: "48 control(s) smaller than 44 × 44, a finger's target: app.hall.pane.scene.8 34×34 …".
4. **Scarcity threshold:** none of the twenty performances qualified as "Nearly sold out" at ≤12%, because the scarcest was 79/648 = 12.2%. Found by curling `/api/production` and comparing.

Everything after that was found by assert scripts (d10–d17).

---

## (d) Every refusal and surprise

I've numbered these. Code is reconstructed from this session.

### d1. A hex colour inside braces (R1, DECLARE2000)

I wrote, in `class Notice`:
```declare
fill = #FBEBD9,
stroke = { stroke(1, #EBC9A2) },
```
The platform said:
> Notice.stroke = { … } is not a valid expression — inside { } a color is written 0xebc9a2, not #EBC9A2 (the #… and named-color forms work only as bare values) [DECLARE2000] (line 358, col 14)

I moved the three colours into the theme (`noticeFill`, `noticeLine`, `noticeText`) and read them with `provided("theme")`.

**Judgement:** my error. `declare.md` §2 states it plainly. The message was excellent. Moving the colours to theme tokens was better than the `0x` fix the message offered, and the drift check would have pushed me there anyway.

### d2. `100%` inside braces (R1, DECLARE2000)

I wrote:
```declare
signForm: Form [ exists = { app.signSheet.present }, width = { app.wide ? 380 : 100% }, source = { app.session },
```
The platform said:
> Form.width = { … } is not a valid expression — there are no percentages: read the parent and scale, so 100% is { parent.width * 1 } [DECLARE2000] (line 1028, col 70)

I changed it to `width = 100%` and let the Sheet size it.

**Judgement:** my error, clearly documented ("width = { 100% } is a syntax error"). It's a habit that's hard to break, though, and the conditional case ("100% on phone, fixed on desk") is common. A `Length` helper usable inside braces would help. Unsure whether that's in keeping with the design.

### d3. Bare `fontWeight` tokens inside a ternary (R2, DECLARE4005)

I wrote:
```declare
fontWeight = { classroot.scarce ? semibold : regular },
```
and the same with `classroot.strong`. The platform said:
> 'semibold' is one of fontWeight's values — bare only as the whole value (fontWeight = semibold); inside { } write it as a string: "semibold" — 3 sites, also on lines 337, 339 [DECLARE4005]

I changed the tokens to the strings `"semibold"` and `"regular"`.

**Judgement:** my error, the same rule as d1. The message named the fix exactly. Counting the sites in one line was nice.

### d4. Typed view aliases lose their members (R3, DECLARE6001, four sites)

I wrote:
```declare
hallPane: View = { app.hall.pane },
...
const sw = Math.max(1, pane.scene.width)          // in HallMap.draw, pane = app.hallPane
...
payForm: Form = { app.checkout.pane.col.form },
cvcField: TextInput? = { app.paySaved ? app.payForm.saved.cvcField.entry : app.payForm.newCard.cardRow.cvcField.entry },
hallHeading: View = { app.wide ? app.hall.aside.title : app.hall.phoneHead.title },
```
The platform said:
> 'scene' is not a member of View — declare it (scene: <type> = …) or fix the name — 5 sites [DECLARE6001]
> 'title' is not a member of this View … ; 'heading' is not a member of this View …; 'saved' is not a member of Form …; 'newCard' is not a member of Form …

Two different things were going on:
- **Annotating an alias with a base type erases its children.** This applies to `hallPane: View` and `payForm: Form`. I deleted both aliases and wrote the full paths everywhere.
- **`title` and `heading` were children of anonymous wrappers** (`aside > View [ … title: Text ] `), so `aside.title` really didn't exist. I named the wrappers `head:` and `top:`.

**Judgement:** both were my errors. But the first is a trap: `04-structure.md` encourages aliases, and the obvious annotation is the base class. The message "declare it (scene: <type> = …)" pointed the wrong way for that case. The fix wasn't to declare `scene`, it was not to widen the type. Saying "app.hallPane is declared View; its value's own children are not visible through that type" would have saved a minute. For the anonymous-wrapper case the message was right. I'd also like a way to name an alias's type as "whatever this path is" (`hallPane = { app.hall.pane }` with an inferred type). Unsure whether that exists.

### d5. `rowIndex` read on a child that isn't replicated (DECLARE4023 warning)

I wrote, in `TicketCard`:
```declare
card: View [ ..., accessibilityLabel = { "Ticket " + (rowIndex + 1) + " of " + app.ticketCount },
```
The platform said:
> warning: card reads rowIndex, but card is not replicated — that is its own rowIndex, never the row's … classroot.rowIndex inside a class whose instances are the rows [DECLARE4023]

I changed it to `classroot.rowIndex`.

**Judgement:** my error. This was a real bug caught before it ran, and the best kind of warning.

### d6. Three nested ternaries (DECLARE4025 lint, two sites)

I wrote, in `BrandMark` and `PerfRow`:
```declare
text = { classroot.brand == "visa" ? "VISA" : classroot.brand == "amex" ? "AMEX" : classroot.brand == "discover" ? "DISC" : "CARD" }
availability: string = { classroot.soldOut ? "Sold out" : classroot.scarce ? "…" : classroot.busy ? "…" : classroot.left + " seats left" },
```
For the brand label I used a script lookup, `brandShort(b)`. For availability I used a method, `availabilityOf(left, soldOut, scarce, busy)`.

**Judgement:** fair lint. Both rewrites read better. My script `brandName` still nests four ternaries, and the lint doesn't reach into script. That's fine.

### d7. Redundant parentheses (DECLARE1002 hint)

`theme = { ({ ...SanFrancisco, ...House }) }` drew a hint, so I dropped the parentheses. Trivial. The todo app writes `({ … })` inside ternaries, which is where I'd copied the habit from.

### d8. Layout finding: 34×34 seats below a finger's target

Phone pitch was `pitch: number = { app.wide ? app.fitPitch : 34 }`. The finding was:
> 48 control(s) smaller than 44 × 44, a finger's target: app.hall.pane.scene.8 34×34, …

I changed it to 44.

**Judgement:** the finding was right, and the brief's "first time, with a thumb" agrees. The cost is a hall about 1,600px wide on a 390pt phone. The overview map makes that navigable.

### d9. Layout findings from the phone flow (tab order, a flex with no room, overflow)

- **`Tab goes from "Postal code" … to "Pay $229.00" … which sits above it`.** It also reported that Tab goes from the hidden desktop "Continue to checkout" to the phone "Continue". I left both alone. The first is because the field was scrolled below the bar. The second names a view hidden at that size. **Judgement:** I suspect both are noise. In particular, the platform looks wrong to report tab order involving a `visible = false` view. Unsure.
- **`app.checkout.phoneBar.1.0 flexes, but app.checkout.phoneBar.1 is as wide as its children, so there is no room left over…`.** This came from the `Spacer [ ]` pair inside `PayButton`, used to centre its label. I added `stretched: boolean` and `Spacer [ visible = { classroot.stretched } ]`. **Judgement:** correct finding. My centring-by-spacers was a desktop assumption.
- **`app.tickets.col.2 runs past the window's right edge at 390 wide (it ends at 500)`**, plus `col.3` and `pager`. The column was `col: View [ x = center, width = { Math.min(420, parent.contentBox("width")) }, … ]` inside `tickets: View [ width = 100%, padding = { [..., 16, 56, 16] } ]`. On the phone screenshot the whole column sat shifted right and was wider than the screen. I changed it to `Math.min(420, app.width - 32)` and gave the long text lines `width = 100%, textAlign = center`. **Judgement:** unsure. The identical pattern on the list screen (`Math.min(780, parent.contentBox("width"))`) behaved. I didn't find out why the tickets one didn't; possibly the unwrapped 500px confirmation line widened something upstream. Worth a look by someone who knows the layout pass.

### d10. "The decline message is missing": a misdiagnosis caused by the test driver

My script did `await pay.click(); await pay.click(); await drive.settleData();`, then asserted on the decline. The screenshot showed no notice, and the security-code field showed its *required* error. A probe gave:
```
after decline: {"error":"","judged":true,"err":"Enter the security code on the back of the card.","focusedName":"cc-csc"}
```
I read `library/form.declare` (`submit`, `_ended`, `_refused`, `refuse`), then wrapped `submit` and `refuse` in the page. The trace:
```
["submit pending=false","refuse [{\"name\":\"\",\"message\":\"Your bank declined the payment.\"}]","submit pending=false","submit pending=false"]
```
So the driver had waited for the 1.5-second reply between my two clicks. The second click was a fresh submit, which cleared `error` and judged the now-empty code. With `dblclick()` I saw *three* submits, all after the reply.

**Judgement:** the program and the platform were both correct. My test was wrong. But the driver's "a step ends once the world has landed" makes a true double press impossible to express in a script. That matters, because "nothing sends a second payment" is exactly the kind of thing one wants to assert. The three submits from one `dblclick` also surprised me. I assume click, click, then a dblclick-derived press. Unsure whether `Control` treats a double-click as an extra press; if so, that's surprising for a pay button. **Cost:** about five tool calls and reading the Form source. **What I needed:** a sentence in `verify.md` near `dblclick` saying the pair is separated by any network the first press caused, or a way to press twice "within one turn".

### d11. Billing prefill skipped once anything was typed

My first version of `fillFromAccount`:
```declare
if (b != null && app.line1 == "" && app.city == "" && app.postal == "") { app.line1 = b.line1 … app.countryRec = … }
```
My test typed "1 Typed Lane" before signing in. Country was then never filled, so `postalProblem(v, "")` returned `""` and my postcode error never appeared. I changed to filling each empty field separately. **Judgement:** my design error, found by the script.

### d12. The postcode tidy mangled partial input

`tidyPostal("WC1N", "GB")` on blur produced "W C1N", seen in a screenshot. I now only apply the spaced form when it validates. My bug.

### d13. The dialog's fields weren't found until motion settled

`page.getByRole("dialog").getByLabel("Email")` "found nothing within 5 s — motion is still in flight on the program's clock, which the script holds". I added `drive.settleMotion()`. The same thing happened in `session.mjs` after sign-in: "Sign out" wasn't visible until the Sheet's closing motion was settled. **Judgement:** the platform behaved as documented, and the message named the fix. But it means a grader using plain Playwright with real time wouldn't hit this, while my scripts must. The held clock is a different world from the one a real tester's harness lives in, and I spent a little time translating between them.

### d14. A refused field below the fold

First try:
```declare
showProblems() {
    super.showProblems()
    const first = this.problems[0]?.control as View | null
    if (first != null) afterSettle(() => first.scrollIntoView("nearest", true, 96))
    else if (this.error != "") afterSettle(() => this.alert.scrollIntoView("nearest", true, 24))
    },
```
Result: no visible scroll. The field sat at the bottom edge, with its new message under it, out of view. Next I raised the pane's bottom padding from 48 to 160: still no scroll. Finally I scrolled the enclosing `Field` instead:
```declare
let box = this.problems[0]?.control as View | null
while (box != null && !(box instanceof Field)) box = box.parent
const field = box
if (field != null) afterSettle(() => field.scrollIntoView("nearest", true, 24))
```
That worked.

**Judgement:** unsure. I think "nearest" saw the input as already (barely) visible and did nothing, and the 96 inset didn't count as "needs scrolling". If inset is meant to apply to the nearest test, the platform may be wrong. If not, the docs for `inset` could say so. Separately, I'd expect `Form.showProblems` to bring the *field and its message* into view by default. A refusal you can't see is a common form bug, and the library is otherwise so careful. **Cost:** three iterations. This one felt like going in a circle.

### d15. Tab from the hall heading landed on the aside

I focused the desktop heading (`focusable = quiet`, in the right-hand aside) after opening a performance. Tab then went to an element whose text was the aside's content. I guess it was the scrollable aside itself, or the next thing after the heading. It wasn't the seats, which come *earlier* in the tree. I fixed it with:
```declare
tabOrder() -> View[] { return [this.phoneHead, this.aside.head, this.pane, this.aside.picked, this.phoneBar] },
```
**Judgement:** my structure was wrong for keyboard order. `tabOrder` was exactly the right tool, and `declare-help View.tabOrder` showed me how. Unsure whether the focused element was a scroller made focusable by the browser.

### d16. The country Combobox kept focus on the first Return

With `enterMoves = true`, typing "Canada" + Enter picked the item but stayed in Country. My script then typed the postcode into the country field. A second Enter moved on. **Judgement:** that's the documented Combobox behaviour ("Enter picks … the first match"). It's arguably right for a person. I misread it while writing the script.

### d17. The seat-conflict refusal couldn't be produced for real

Any seat I bought out from under the app arrived on the event stream first, so a real 409 never came. I tested by calling `app.refused({error:"unavailable", …})` from the page. Not a platform issue, but it means that branch is checked only on its UI side (f).

### d18. Port 8200 was taken by another tree

`npm start` refused: "port 8200 is already taken by another Declare dev server, serving a different tree". I used `PORT=8201`. A good message. The background server was later killed by my session's time limits; that isn't the platform's fault.

---

## (e) Verifying it

Tools I used:

- **`declare-verify` R1–R4 after every batch of edits.** It caught d1–d7 in seconds, each with a usable fix. R4's "data sources fed a sample of their schema at boot" note was reassuring.
- **`declare-look --url … --click … --shot`** for desktop and `--phone`, on list and hall. It caught d8 and the phone layout problems in (c). `--read app.chosen` confirmed seat presses.
- **Five assert scripts in `work/checks/`**, all against the live service, all passing at the end:
  - `desk-flow.mjs` (13 assertions): sign-in mid-checkout with typed text surviving, wrong password, expired card disabled, decline, code cleared, switch to a new card, grouping and expiry formatting, postcode format error on leave, success, exactly two order POSTs.
  - `phone-flow.mjs`: three seats across two sections at 390×844 touch; another buyer takes one via a `fetch` from the page; the "was just taken" notice and count; sign-in; decline; Amex grouping 4-6-5; success.
  - `keyboard-flow.mjs`: Tab, Enter, arrows, Space and typing only; checks where focus lands at each step; the service's postcode refusal; success.
  - `conflict.mjs`: the 409 branch, simulated.
  - `session.mjs`: password hidden and revealed (`type` attribute), session survives reload, sign-out survives reload.
- **Probes with `page.evaluate` into `window.__declare.find(...)`**, plus monkey-patching `Form.submit`/`refuse` for d10.
- **Reading the platform's own library source** (`form.declare`). That was decisive once.

**How well the tools served me.** Very well, overall.

- The assert scripts' warnings about earlier writes to a live service were thoughtful ("this run failed after talking to … which earlier runs wrote to"). They correctly stopped me assuming the app was at fault.
- Layout findings after each step were more useful than I expected.
- Weak spot: the held clock versus real-network timing (d10, d13). I'd also have liked `expect.request` to accept "at most" counts.
- I didn't run `declare-look --semantics` to read the accessibility tree directly. I relied on role and name locators succeeding instead. That's a gap in my checking.

---

## (f) Confidence, part by part

- **§1 Performances: high.** Date, time, from-price, fullness bar, "Nearly sold out" wording. Visual taste is open to argument.
- **§2 Hall layout and three seat states: high.** Shape-coded seats and seat names `Orchestra, row C, seat 14`. Toggle role means `getByRole("button", { name })`. **Risk:** a tester looking for `checkbox` would miss; and a non-exact name match ("…seat 1" also matches "seat 14") is a hazard for testers, not for the app.
- **Summary `3 seats · $240.00`: high.**
- **Live seats: high for the stream path.** Unverified: what happens if the stream drops and reconnects. Seats sold during the gap aren't refetched; I set `retry = 2` and rely on the 409 at payment.
- **§3 Sign-in: high.** Checked: hidden password, show toggle, service sentence, reload, sign-out, nothing typed lost. **Medium** on the password manager actually offering to save: `Form` + `purpose`, as the docs promise, but I couldn't check it in a headless browser.
- **§4 Checkout:**
  - High for totals agreeing, saved-card code only, decline, field refusals, double-send protection (via the Form; not truly tested, d10), and that problems aren't flagged while typing.
  - **Medium-low on the Country Combobox with real autofill.** If autofill gives "GB" rather than "United Kingdom", nothing matches. Unsure.
  - **Medium on caret position** when `admit` reformats a card number mid-string. Untested, and a likely place for a tester to find jank.
- **409 path: medium.** The UI is right with a simulated body. The real end-to-end sequence (Form lays the error, my `lastRefusal` hides it, focus moves to the hall heading) wasn't exercised against the service.
- **§5 Tickets: high** for content and "Sent to …". The barcode is decorative, not a real symbology. A strict reader of the brief might call that wrong.
- **§6 Look: medium-high.** Unchecked: reduced motion (the Spring pop and spinner ignore `accessibilitySettings.reduceMotion`).
- **§7 Phone:** seats are 44pt and the overview map works. **Medium** on "the field being typed in is never hidden behind the keyboard": the checkout is an inner scroll pane, which `10-touch.md` warns is a weaker tier than the page's scroll. That's my main expected failure on a real iPhone.
- **Keyboard in the hall: medium.** It's one Tab stop with linear arrows. Reaching Balcony B 30 is a lot of presses. There's no up/down between rows.

---

## (g) Gaps I worked around

### g1. A `<select>` for country (for autofill)

`declare-help Select` says to use a Button with a menu. But a menu can't receive autofill. I used `Combobox [ purpose = country, items = { app.countries }, value <-> app.countryRec ]`. **Judgement:** probably the intended answer, since Combobox documents `purpose` and "text that arrives whole … picks that item". The gap is the `object` value type and code-vs-name matching. Unsure it's a real lack.

### g2. A typed alias for a far-away view

See d4. I gave up and wrote full paths. **Judgement:** maybe it exists (an exact type annotation like `View`'s subclass?). I didn't find how to name an anonymous child's type.

### g3. Scrolling a refused field and its message into view

See d14. I climbed to the `Field` with `instanceof`. **Judgement:** I'd like `Form.showProblems` to do it, or `ValueControl` to expose its field. Possibly I missed `Field.control`'s inverse.

### g4. Two arrangements sharing controls (one Pay button, two places)

I duplicated with `visible`. I considered `ResponsiveLayout` plans and a `State` overriding layout, but the children differ by size. **Judgement:** unsure. A way to re-parent one view between two slots by state would remove the duplication. That may be deliberately out of the model.

### g5. Two-dimensional arrow keys in the seat map

`focusScope = stop` gives linear arrows. I wanted up/down to move between rows. I didn't try `keyBindings` with a computed target, because finding the view for a seat id seemed to need a lookup I didn't see. **Judgement:** probably possible with `keyBindings` plus `Focus.focus` and a by-key lookup on the replicated scene. I didn't look hard. My gap, likely.

### g6. Making a phone hall usable

I weighed pinch-zoom on a scaled surface (`10-touch.md` § Pan and zoom) against a big native scroll pane. I chose `scrolls = both` with a drawn minimap that calls `scrollTo`, because Playwright-style locators and real fingers both get native scroll-into-view. **Judgement:** not a platform gap; a design choice. Pinch on top would have been nice; I didn't attempt it.

### g7. A spinner

`declare-help Spinner` redirects to ProgressBar (`indeterminate`). I drew a ring rotated by an `Animator` with `repeat = { Infinity }`. **Judgement:** I could have used `ProgressBar [ indeterminate = true ]`. Hand-made was a choice, not a lack.

### g8. A typed session reply and stream payload

I cast instead of declaring schemas. **Judgement:** platform has it (`schema` on the DataSource; parse plus a schema type for the message). My shortcut, and a drift I'd fix.

---

## (h) Changes of direction

1. **View aliases became full paths**, at the first R3, because of a refusal (d4).
2. **Phone seat pitch went from 34 to 44**, mid-build, because of a layout finding (d8).
3. **The phone overview** went from a full-width 96px strip under the title to a 112×120 map beside the title, free count and legend. After the first phone screenshot; something I saw running.
4. **The phone list row** went from meter and text side by side to stacked, and the row grew from 84 to 92. From the screenshot.
5. **Scarcity threshold went from 12% to 15%.** From the data, measured against the brief's "some are nearly sold out".
6. **Billing prefill went from all-or-nothing to per-field.** From the desk flow (d11).
7. **The sign-in confirmation** went from a toast everywhere to a toast on desk and an announcement on phone, because the toast covered the Pay bar in a phone screenshot.
8. **The hall panel's `OrderLines`** went from full totals to prices only (`fees = false`). My own second thoughts: the panel showed "$87.00 Total" next to "1 seat · $80.00".
9. **Scroll-to-problem** went through inset, then padding, then climbing to the `Field` (d14). Something I saw running.
10. **The test's double press** went from two clicks, to `dblclick`, to a single click, because of the driver's timing (d10).
11. **Desktop pay-button spacers** became conditional, because of a finding (d9).
12. **The planned seat role.** I chose `toggle` (an ARIA button with pressed) over `checkbox` before writing, because the brief's tester finds "by role and accessible name" and `button` felt likelier. Unsure that was right.

---

## (i) Code for reproduction

The exact code and messages are quoted in d1–d5, d10, d13 and d14 above. Two more items worth reproducing:

**d9, tickets column:**
```declare
tickets: View [ visible = { app.screen == "tickets" }, width = 100%, padding = { [app.wide ? 40 : 20, 16, 56, 16] },
    col: View [ x = center, width = { Math.min(420, parent.contentBox("width")) }, datapath = { app.order.value },
        layout: SimpleLayout [ axis = y, spacing = 10, align = center ],
        heading: Text [ … ],
        Text [ fontSize = 16, text = { "Sent to " + (:email ?? "") } ],
        Text [ fontSize = 14, …, text = { "Confirmation " + … } ],     // ~500px, no width
        Carousel [ width = 100%, height = 560, page <-> app.ticketPage, TicketCard [ datapath = :tickets[] ] ],
        …
```
At 390×844 touch the findings were: "app.tickets.col.2 runs past the window's right edge at 390 wide (it ends at 500). app.tickets.col.3 runs past … (it ends at 437), and app.tickets.col.3.0.card.head.1 with it. app.tickets.col.pager runs past … (it ends at 425)". The screenshot showed the whole column offset to the right.

**d10, three submits from one `dblclick`:** `await pay.dblclick()` on `class PayButton extends Control [ … press() { app.pay() } ]`, where `pay()` calls `form.submit()`. The trace showed three `submit` calls; one would be expected per click, plus none for the double-click.

---

## Surprises

- **`instanceof Field` worked on a library class** from inside a method body. I'd half expected a refusal.
- **The `Form` reference anticipated my exact decline-and-clear-the-code case.**
- **Every compiler message said what to write instead.** In five compiles I never had to guess.
- **The verifier knew my service had been written to by earlier runs**, and told me not to blame the program.
- **The driver holds program time but not network time.** It's documented, but it was the source of both of my test misreadings.

## What was good

- **The error messages.** Literally the best I've worked with: positioned, named, fix included, and counted across sites.
- **Derived state as the default.** `screen`, `account`, `summary`, totals, `paySaved`: no update code anywhere. The live seat stream, the conflict path and sign-in-mid-checkout cost far less than they would in React, because nothing holds a copy.
- **`Form`.** It's genuinely a better form library than most I know.
- **The checking ladder plus `declare-look`.** Seconds to an answer.
- **The docs' tone.** It's explicit about what *not* to do (the drift check), which I used as a checklist.

## What was bad

- **Paths are the way to reach things, and they're long.** Aliases have a type trap (d4). Anonymous wrappers silently break paths until you name them.
- **Two ways of time.** The held clock in scripts versus real time in the world, and a real tester's harness lives in the second.
- **Defaults stop short in two form cases.** Scroll a problem's message into view, and duplicate controls for responsive arrangements; I had to build both.
- **The three literal vocabularies.** Bare tokens, bare colours and lengths versus their `{ }` spellings caught me three times in one build. Each fix was trivial, but it's a pattern, not a one-off.

## How it compares

It reminded me most of **QML** (declarative tree, bindings re-evaluated on change, states) and **SwiftUI** (environment-like `provided`, controls with bindings). The constraint model also echoes **spreadsheets** and **Elm-style derivation**, without the message plumbing. Versus React: no effects, no memo, no state hoisting; datasets replace stores; the compiler sees reads. Versus HTML/CSS: no cascade, and layout is an object, which I found easier to reason about. Readers of the OpenLaszlo lineage note will recognise `datapath` replication immediately.

## Where I'd most want improvement

1. **Typed view aliases and inferred alias types (d4).** One obstacle, about 10 minutes. It would have been right first time with a sentence in `04-structure.md`: "annotate with the view's own class; a base type hides its children". Or with inference.
2. **`Form` scrolling a problem's field and message into view, or `scrollIntoView` honouring inset in its "nearest" test (d14).** One obstacle, three iterations, about 15 minutes. That was the closest I came to a circle.
3. **Script-driver timing: a way to press twice within one turn, and guidance near `dblclick` (d10, d13).** A pattern (it happened twice), about 20 minutes, and one misdiagnosis that took me into the Form source.
4. **An idiom for one control in two layouts (g4).** A pattern across hall and checkout. Little time lost, but duplication I'm not proud of.

If I had to name the **sharpest edge**, it's the third: the test world's clock. The language itself never misled me badly. Everything the compiler could see, it caught. What it couldn't see — timing between my script and the network — is where my time went.

## What I'd use it for

I'd reach for Declare for:
- forms-and-flows consumer apps like this one, especially ones with live data, where derived state pays off most;
- dashboards;
- anything needing motion that carries meaning.

I'd hesitate on:
- a large team app needing a deep ecosystem;
- content where long text, SEO and editorial tooling dominate (though the crawlable output claim suggests otherwise; I didn't test it);
- anything needing the canvas renderer plus accessibility today.

## Names ledger

```
NAMES — eval-venue-32.noindex: 5 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    13 · member    · scene                · View                     · —                  · none         · ×1  ·   13 · resolved
         'scene' is not a member of View — declare it (scene: <type> = …) or fix the name — 5 sites, also on lines 226, 530, 534 [DECLARE6001] (line 225, col 37)
    13 · member    · title                · this View                · —                  · none         · ×1  ·   13 · resolved
         'title' is not a member of this View — declare it (title: <type> = …) or fix the name [DECLARE6001] (line 536, col 53)
    13 · member    · heading              · this View                · —                  · none         · ×1  ·   13 · resolved
         'heading' is not a member of this View — declare it (heading: <type> = …) or fix the name [DECLARE6001] (line 577, col 61)
    13 · member    · saved                · Form                     · —                  · none         · ×1  ·   13 · resolved
         'saved' is not a member of Form — declare it (saved: <type> = …) or fix the name [DECLARE6001] (line 683, col 57)
    13 · member    · newCard              · Form                     · —                  · none         · ×1  ·   13 · resolved
         'newCard' is not a member of Form — declare it (newCard: <type> = …) or fix the name [DECLARE6001] (line 683, col 92)

SUMMARY: 5 of 5 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
