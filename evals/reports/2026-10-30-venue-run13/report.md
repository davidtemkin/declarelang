# Venue run 13: Declare b641a1a9, Opus 5.5

**Run:** 2026-10-30, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-13 claude-opus-5-5 b641a1a9 8350` against GitHub main, after
Cadence run 18 as a smoke test. It is the first Venue run on the layout facts (`flexes` weights, `shrinks`, ranges,
`align = stretch`, a class's geometry as a default) and the subtraction pass. Run 12 was not scored. The same brief,
service, port, model, tools and prompt as run 11, and no checker: it was removed after run 12.

**Try it:** the app's six files, the builder's own Playwright scripts (`tests/`) and the acceptance results (`drive/`)
are filed beside this report.

## The comparison

| | Venue 7 | Venue 9 | Venue 11 | **Venue 13** | React |
|---|---|---|---|---|---|
| Declare commit | | `7dd3360c` | `b7bfd01b` | **`b641a1a9`** | — |
| time | 25.6 min | 29.5 min | 37.7 min (9 waiting on the checker) | **34.5 min** | 31.4 min |
| turns · tool calls | 108 · 110 | 79 · 78 | 112 · 107 | **121 · 120** | 101 · 97 |
| code, raw lines | | 1,655 (4 files) | 1,823 (5 files) | **2,024 (6 files)** | |
| code, excluding blanks and `//` lines | | 1,223 | 1,388 | **1,488** | |
| output (incl. thinking) | | 127k | 125.5k (55.0k) | **146.7k (65.1k)** | |
| fresh input (cache writes) | | 332k | 313k | **356k** | |
| cached input re-read | 19.6M | 17.2M | 21.8M | **26.8M** | 9.3M |
| context at first write → end | | 220k → 340k | 183k → 321k | **179k → 364k** | |
| first app write at | | 7.9 min | 6.8 min | **5.6 min** | |
| download (gzip) | | 176.0 KB | 172.5 KB | **172.8 KB** ¹ | |
| hidden acceptance (`drive.mjs`) | 11 of 11 | 11 of 11 | 11 of 11 | **11 of 11** | |
| runtime source read | | 0 | 0 | **1** (a grep for `tabOrder`) | |
| library source read | | 2 calls | 4 calls | **4 calls** (Form, RadioGroup, the San Francisco theme, SimpleLayout) | |
| names refused by a check | | 6 | 0 | **5**, and one collision (`Fill`) | |

¹ `declarec --sizes` from main: program 35.8 KB, runtime 124.2 KB, kernel 12.6 KB.

**Correct, and not fast.** It passes 11 of 11 and is clean through R4 at desk and phone from main. Its first write was
the earliest of any Venue run. But it took 34.5 minutes, against 25.6 and 26.7 for runs 7 and 6, and it ended with two
workarounds that the platform caused.

## Where the time and the tokens went

| episode | calls | cached re-read | share | whose |
|---|---|---|---|---|
| reading (0–5.6 min) | 23 | 2.38M | 9% | — |
| writing the six files | 8 | 1.56M | 6% | — |
| compile fixes | 6 | 1.43M | 5% | the agent's, each fixed from its message |
| **phone hall pane: a cycle, two refused sizes, `Fill`** | 14 | 3.57M | 13% | **platform: layout (L1)** |
| assert script → its own Playwright harness | 8 | 2.16M | 8% | docs (T1) |
| desk flow; `visible` → `exists`; its own totals | 6 | 1.67M | 6% | mostly the agent's |
| **scroll to the refused field: the column sized to its content; a layout of its own** | 10 | 2.92M | 11% | **platform: layout (L1)** |
| order count | 3 | 0.90M | 3% | the agent's |
| **phone flow: a derived value that stayed `true`** | 9 | 2.77M | 10% | **platform: runtime (R1)** |
| decline banner, conflict cases, keyboard, session | 16 | 5.34M | 20% | verification working |
| final look | 6 | 2.13M | 8% | — |

The two layout episodes and the stale value come to about 9.3M of 26.8M: a third of the run.

## Findings

**R1 — A statically wired reader of a slot that went from a number-table value to an object never sees it return to
`null`.** `savedCard: SavedCard? = { app.usableCards.find(…) ?? null }` became `null`, and `usingSaved = {
classroot.savedCard != null }` stayed `true`. It is reproduced on main in five lines, it is the same on the commit
before, and only a slot that starts `null` and later holds an object shows it. A slot that first holds `null` lives in
the kernel's table. When an object arrives, it escapes to the JS store, but a kernel-compiled reader of it is not
rebound, and goes on reading the cell's null flag. A data field that escapes rebinds its readers; an attribute did not.
The agent: "nothing warned me, and it cost the most debugging time of the build". Its workaround derives `usingSaved`
from `payWith` (`venue-checkout.declare:31`).

**L1 — "Fill what is left and scroll" can't be written when the page flips its axis.** The checkout and the hall are
both a row on a desk and a column on a phone, with one pane that flexes and must fill the page across. Three things
stood in the way:
- `height = 100%` on a flexing child is refused under the phone's column, where the flow owns height.
- `align = stretch` makes a child as large as the largest child. So a scroller with 1063 px of content made the
  "line" 1063, rather than taking the row's own 736.
- `SimpleLayout.align`'s reference already says that `start`, `center` and `end` align within the view's own cross
  size, and fall back to the largest child only when the view takes its size from its children. Stretch alone was
  inconsistent.

The agent wrote `Panes`, a 20-line layout of its own (`venue.declare:514–534`), which works. Its comment names the
defect: "a stack's `stretch` can only grow a child to its content, never hold a scroller to the page". Fix: stretch
fills the same cross size as the other aligns.

**T1 — Its own harness again.** `page.getByRole is not a function`: the assert script's `page` is Puppeteer, and
`verify.md` doesn't say so. The agent guessed that "the grader likely uses Playwright" and moved every flow to its own
scripts, as in run 11. Its own lookups by label then forced two structural changes for the test's sake:
- fields hidden with `visible = false` were swapped for `exists`, because strict label lookups found the hidden ones;
- the checkout's Email field is removed while the sign-in sheet is open (`venue-checkout.declare:197`).

**Smaller ones:**
- **Name misses with no hint.** Five view paths after a rename (`listPage` under `app.pages`, `col`, `stepRow`). The
  message says the name "is not a member of this App" when it is a member one level down. A did-you-mean that finds
  the name in the subtree would have answered each.
- **The constraint-cycle error names a class, not a view** ("View's SimpleLayout[y]").
- **`declare-look --url` on a program that fails to compile** reports against the error page ("'app' has no 'hall'"),
  not the compile error.
- **A `Control` subclass's `onKeyDown` replaced the control's own.** Space stopped choosing seats until `else
  super.onKeyDown(e)`. That is documented, but it is silent.
- **`tabOrder()`** sent it to `runtime/src` to see what `tabDefault()` returns.
- **The announcer's copy.** `Accessibility.announce` leaves its text in the DOM, so a role-and-text lookup found the
  service's sentence twice.

## Is it idiomatic Declare?

Largely. The hall is a nested replication over the service's own JSON, with each seat's place a constraint on its
row. A sale is one `set()` on one record. Payment is the library `Form` over the order `DataSource`, with `refusal`
and `refusedWith` overridden at the right level, and the person's place is `location` and `waypoint`.

Missteps:
- **The sweep on Pay** is a per-frame `Time` writing `t` (`venue-checkout.declare:347–354`). An `Animator` with
  `repeat` is the declared form.
- **Structure shaped by a test's lookup** (T1, above).
- **`showProblems` scrolls the first problem into view by hand** (`venue-checkout.declare:161–166`). The form already
  focuses it. The scroll was added while the column couldn't scroll (L1), and is probably redundant now.

Workarounds the platform forced: `Panes` (L1) and `usingSaved` from `payWith` (R1). The seat map's own arrow keys (`stepSeat`/`stepRow`) are the app's arrangement, written where it belongs.

## Names

Five misses, all the agent's own view paths after a rename, all resolved within a minute, none with a hint. One
collision: `Fill`, Declare's own type, where DECLARE4015 suggested `VenueFill` and it took `Pane`.

## The agent's account, verbatim

Asked after the build by resuming the session with read-only tools, with the standard questions (`impressions.txt`).
1.1 minutes, 5.9k output tokens, counted apart. Also filed as `account.md`. The questions were sent naming "Cadence"
(the operator's error: Cadence run 18's copy of the standard questions was used), and the account opens by correcting
that. The filed `impressions.txt` is what was sent.

### Building The Venue in Declare: an account for the Declare team

One correction first: what I built was **The Venue**, the opera-ticketing app from `task/brief.md`, not something called Cadence. This account is about that build. I haven't changed anything since the last turn.

#### (a) Getting up to speed

**What I read, in order:** `README.md`, then `skill/SKILL.md` as the README directs. Then `docs/declare.md` in full, guide chapters 01, 04 and 05, and the whole to-do app (`todo.declare` and `todo-parts.declare`). Later, as needed: the server, streams and forms sections of `14-data.md`; parts of `10-touch.md`, `19-accessibility.md` and `18-overlays.md`; the `docs/briefs/` cards on loading/saving, app shape, overlays and keyboard; and `docs/operational/verify.md`. I also ran perhaps forty `npx declare-help` lookups.

**What taught me the most:**
- **`declare.md`** is the best single document. It front-loads the right warnings: "the vocabulary stops at the brace", events don't bubble, and children come from data, not code. It is also short enough to hold whole.
- **The to-do app** taught the idiom more than any prose did. Its comments say why, not just what: computed defaults for form fields, `exists` keyed on a sheet's `present`, the `Line`/`classFor` split.
- **`declare-help`** was the real reference, and it was consistently excellent. The `Form` reference in particular (`refusal`, `refusedWith`, `showProblems`, `pending`, `enterMoves`) described almost exactly the checkout behaviour the brief asked for. So did `TextInput.judged` ("a security code emptied after a decline", almost verbatim my case). I trusted the library partly because its docs anticipated my scenario.
- **The SKILL.md "What Declare handles for you" table** stopped me from hand-building overlays and from using a `View` with pointer handlers where a `Control` belonged.

**What was missing or misleading:**
- **Making a scrolling pane fill the remaining room in a row or column.** This is one of the most common app layouts, and I spent the most time here. `align = stretch` turned out to only *grow* children to the widest content, so my scroller grew to its own content (1063px) instead of the page (736px). Declaring `height = 100%` on a flexing child was refused: "View's SimpleLayout sizes its children, so this child does not declare its height". The guide line "a size a class sets is a default … still flexes" led me to try moving the size into a class. That half-worked: `HallPane` came out right, but the checkout column still sized to its content, which I only saw by reading values. I ended up writing a 20-line `Panes` layout. That is arguably idiomatic (the drift check endorses "a layout of your own"), but a stock answer for "sidebar + scrolling main" belongs in `06-layout.md`.
- **Computed defaults.** `declare.md` §5 says reading one "inlines the expression". I didn't understand what that implies when computed defaults read other computed defaults, and one of my bugs may live exactly there (see (b)).
- **The `page` in assert scripts is Puppeteer.** `verify.md` says `page` is "the browser page" but not which API. I wrote `page.getByRole`, got "page.getByRole is not a function", and moved to my own Playwright scripts outside the repo.
- **`visible` versus `exists` for accessibility and tests.** The docs frame it as state retention. They don't say that a `visible = false` field stays in the DOM where label-based queries find it, which is what made my tests ambiguous (see (c)).

#### (b) Expressing what I wanted

**Where it fit well:**
- **The hall.** It is a nested replication over the service's own JSON (`SectionBand [ datapath = :sections[] ]` → `RowLine [ datapath = :rows[] ]` → `SeatSpot [ datapath = :seats[] ]`). Each seat's `x`/`y` is a constraint over its row's radius and its `rowIndex`. A sale from the stream is one `set()` on one record and repaints exactly one seat. That is the cleanest version of this feature I can imagine writing, and it looked right on the first screenshot.
- **`draw(d)` on any view.** Section floors, the stage, seat glyphs, the mini-map and the barcode were all ordinary methods that re-run when what they read changes.
- **The payment form.** The library `Form` with `source = { app.order }` gave me judge-on-leave, judge-all on submit, focus-to-first-problem, the service's 422 landing on the field named `postalCode`, and a single send while pending, with almost no code of my own. Overriding `refusal` to swallow the 409 and `refusedWith` to clear the security code was the right level of hook.
- **`location` and `waypoint`.** Performance in the URL, checkout as a step: browser Back from checkout returned to the hall with the choice intact, and I wrote no history code.
- **Small but nice:** `TextInput.purpose` (correct `autocomplete`, `inputmode` and `current-password` came for free), `concealed`, `credentials = include` on `DataSource` and `EventStream`, and `Spring` for the seat pop.

**Where I worked around it:**
- **The `usingSaved` bug.** In my `Draft extends Node` class, `savedCard: SavedCard? = { app.usableCards.find(...) ?? null }` correctly became `null`. But `usingSaved: boolean = { classroot.savedCard != null }`, which reads it, stayed `true`, and the UI followed the stale value. `__declare.explain` showed the reader as `static: true, live: false` with deps `['this.savedCard']`, and `savedCard` as runtime-tracked. Switching `this.` to `classroot.` didn't help; deriving from `payWith` did. **I'm not certain** whether this is a runtime bug or a misuse on my part (closure-based value, change to null, computed default read through a computed default). Either way, nothing warned me, and it cost the most debugging time of the build.
- **Writing to a computed default.** I also separated "what the person picked" (`picked`) from the derived `payWith`, because I couldn't tell whether assigning to `payWith` would reach readers that had inlined its formula. I didn't isolate that, so treat it as a suspicion, not a finding.
- **`onKeyDown` override.** Overriding it on my `SeatSpot extends Control` silently replaced the Control's own handler, so Space stopped choosing seats. The language does document that subclass handlers replace the base's, and the fix (`else super.onKeyDown(e)`) is easy. But the compiler warns about plenty of subtler things; a warning when a `Control` subclass overrides `onKeyDown` without calling `super` would have caught this.
- **Arrow keys in the seat map.** `focusScope = stop` didn't give me Left/Right movement across seats nested two levels deep, so I wrote `stepSeat` and `stepRow`. **Uncertain:** this may also have been my override swallowing the keys.
- **Smaller ones:**
  - `number[][]` isn't accepted in a `schema`; I moved the type into a script `type`.
  - Arrow functions inside a method can't use the `->` return syntax ("'=>' expected"); it's an easy mix-up once you've learned `->` for methods.
  - Three-option layout values inside braces need strings (`axis = { phone ? "y" : "x" }`). The diagnostic said exactly that.

#### (c) Verifying it

**What I used:**
- `npx declare-verify` after every edit (about two seconds, four rungs).
- `declare-look --url … --shot` and `--read`, and `--phone --desk`.
- `__declare.explain` through `page.evaluate`.
- My own Playwright scripts for the full desk, phone, 409, keyboard and session flows, querying by role and label as the brief's grader will.

**What served me well:**
- **The diagnostics.** Specific ones that each saved real time:
  - `DECLARE4005` ('semibold' … inside { } write it as a string)
  - `DECLARE4023`, which caught `rowIndex` read on the wrong view in three places, all genuine bugs
  - `DECLARE4015`, which told me my class `Fill` shadowed a Declare type and suggested a rename
  - `DECLARE4025`, nested-ternary advice that led to a cleaner `screen`/`inHouse` split
  - the redundant-parentheses hints
- **The R4 runtime notes.** "Focus.focus(...map): it is not focusable" pointed straight at a real accessibility problem.
- **Boot reporting.** It caught the constraint cycle ("SimpleLayout[y] re-evaluated 100 times"), though not where it was.
- **`explain`** answered "why is this value stale" in one call.

**Where the tools fell short:**
- **When a compile failed,** `declare-look --url` booted the error page and reported against *it*: "'app' has no 'hall'" and a 44pt tap-target note about `app.body.col.retry`. That sent me looking in the wrong place before I re-ran `declare-verify` and saw the real error.
- **The constraint-cycle report** didn't name which view's layout cycled. I guessed it was a `Title` whose width read `contentWidth` and `parent.width`, changed it, and the cycle went away. I can't be sure that was it.
- **`visible = false` versus queries.** Hidden fields still matched `getByLabel`, giving a strict-mode violation: two "Security code" inputs, then two "Email" inputs while the sign-in sheet was open. Separately, `Accessibility.announce` (called by `Form.showProblems` and by `Toast`) puts a second copy of a message's text in the DOM, so `getByText(serviceSentence)` found two nodes. I worked around both: `exists` instead of `visible`, my own live regions, no toast. A test-and-accessibility note in the docs would help, and so might an announcer that doesn't leave text behind.
- **Assert scripts.** Their virtual clock is clever, but my flows depended on a real service with a 1.5-second order endpoint, and I wanted Playwright-style role queries. I never got rung 5 working for a full flow, so my R5/R6 usage was close to zero. That may be my impatience more than the tool's fault.
- **Coverage gaps.** Nothing here tests autofill or an on-screen keyboard, which the brief acknowledges. I also have **no evidence** about performance on a real phone with about 650 seat `Control`s, each with a `Spring` and a `draw`.

#### Surprises

- **The first screenshot of the hall was nearly right.** Constraints plus `draw` got a believable room on the first attempt.
- **The `Form` library was more complete than most web form libraries I know.**
- **Some sizing errors are runtime-only.** "This child does not declare its height" arrives at boot, not compile time, and depends on the parent's layout. I didn't expect that, given how much else is caught statically.
- **The runtime-tracked versus static split was visible in `explain`** and apparently mattered for correctness (the `usingSaved` case).

#### Good and bad

**Good:**
- Reactive by construction: almost no update code.
- Excellent, fix-naming diagnostics.
- A library that covers forms, overlays, focus and a11y semantics properly.
- Data-shaped replication.
- `draw` everywhere.
- A tight verify loop.
- Docs written for the reader who will actually make the mistakes.

**Bad:**
- Layout of panes that must fill and scroll.
- Murky semantics of computed defaults, and one apparent propagation failure with no warning.
- Silent replacement of `Control` key handling.
- A11y and test side effects of `visible` and announcements.
- A Puppeteer-only harness.
- A few parser messages that name the token but not the rule (the `number[][]` schema error said only "expected ']' closing the schema shape").

#### Compared with what I'm used to

- **React:** no render, no hooks, no effects. The handler-writes-facts discipline really does remove a class of bugs.
- **CSS:** no CSS at all. That was freeing for the drawn hall, more effortful for page layout, where flexbox's `flex: 1; min-height: 0; overflow: auto` is muscle memory with no direct equivalent here.
- **Reminded me of:**
  - **OpenLaszlo/LZX**, its stated ancestor
  - **QML**: property bindings, `states`, `anchors`-like `x = center`
  - **Flex/MXML**
  - **MobX or Knockout computeds** for the reactive model
  - a little of **SwiftUI's** environment in `provided()`

#### Where I'd most want improvement

1. **A documented, stock "fill the remaining room and scroll" pattern**, or a layout that does it.
2. **Computed defaults:** spell out the semantics, and warn or fix when a computed-default chain can go stale. Start by reproducing the `usingSaved` case.
3. **A warning when a `Control` subclass overrides a key or pointer handler without calling `super`.**
4. **Guidance (or behaviour) so hidden views and announcements don't duplicate accessible names and text.**
5. **The assert harness:** say which browser API `page` is, or offer Playwright-compatible role and label queries. And make `declare-look` report a failed compile as a compile error.
6. **Name the view in constraint-cycle errors**, and allow nested arrays in schemas.

#### Would I use it again?

Yes, for interfaces where structure, data and drawing interlock: seat maps, dashboards, editors with custom visuals, form-heavy flows. There, the reactive model and the library made this build faster and more correct than I'd expect in React. I'd be more cautious about large apps that depend on third-party UI ecosystems or exacting page layout until the layout story is better documented. I'd also want to measure real-device performance before shipping a 650-control scene like this one; I haven't, so I can't vouch for it.

## The names ledger

```
NAMES — eval-venue-13: 5 missed name(s), 1 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    14 · member    · stepRow              · HallPane                 · —                  · none         · ×1  ·   14 · resolved
         'stepRow' is not a member of HallPane — declare it (stepRow: <type> = …) or fix the name — 2 sites, also on line 58 [DECLARE6001] (venue-hall.declare:57:42)
    14 · member    · listPage             · this App                 · —                  · none         · ×1  ·   14 · resolved
         'listPage' is not a member of this App — declare it (listPage: <type> = …) or fix the name [DECLARE6001] (line 187, col 47)
    14 · member    · col                  · View                     · —                  · none         · ×2  ·   15 · resolved
         'col' is not a member of View — declare it (col: <type> = …) or fix the name — 2 sites, also on line 196 [DECLARE6001] (line 189, col 84)
    14 · member    · hallPage             · this App                 · —                  · none         · ×1  ·   14 · resolved
         'hallPage' is not a member of this App — declare it (hallPage: <type> = …) or fix the name [DECLARE6001] (line 195, col 28)
    14 · member    · checkoutPage         · this App                 · —                  · none         · ×1  ·   14 · resolved
         'checkoutPage' is not a member of this App — declare it (checkoutPage: <type> = …) or fix the name [DECLARE6001] (line 197, col 26)

COLLISIONS (min · held by · name)
    18 · Declare's type · Fill

SUMMARY: 5 of 5 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
