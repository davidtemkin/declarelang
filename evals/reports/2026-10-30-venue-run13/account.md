# Building The Venue in Declare: an account for the Declare team

One correction first: what I built was **The Venue**, the opera-ticketing app from `task/brief.md`, not something called Cadence. This account is about that build. I haven't changed anything since the last turn.

## (a) Getting up to speed

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

## (b) Expressing what I wanted

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

## (c) Verifying it

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

## Surprises

- **The first screenshot of the hall was nearly right.** Constraints plus `draw` got a believable room on the first attempt.
- **The `Form` library was more complete than most web form libraries I know.**
- **Some sizing errors are runtime-only.** "This child does not declare its height" arrives at boot, not compile time, and depends on the parent's layout. I didn't expect that, given how much else is caught statically.
- **The runtime-tracked versus static split was visible in `explain`** and apparently mattered for correctness (the `usingSaved` case).

## Good and bad

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

## Compared with what I'm used to

- **React:** no render, no hooks, no effects. The handler-writes-facts discipline really does remove a class of bugs.
- **CSS:** no CSS at all. That was freeing for the drawn hall, more effortful for page layout, where flexbox's `flex: 1; min-height: 0; overflow: auto` is muscle memory with no direct equivalent here.
- **Reminded me of:**
  - **OpenLaszlo/LZX**, its stated ancestor
  - **QML**: property bindings, `states`, `anchors`-like `x = center`
  - **Flex/MXML**
  - **MobX or Knockout computeds** for the reactive model
  - a little of **SwiftUI's** environment in `provided()`

## Where I'd most want improvement

1. **A documented, stock "fill the remaining room and scroll" pattern**, or a layout that does it.
2. **Computed defaults:** spell out the semantics, and warn or fix when a computed-default chain can go stale. Start by reproducing the `usingSaved` case.
3. **A warning when a `Control` subclass overrides a key or pointer handler without calling `super`.**
4. **Guidance (or behaviour) so hidden views and announcements don't duplicate accessible names and text.**
5. **The assert harness:** say which browser API `page` is, or offer Playwright-compatible role and label queries. And make `declare-look` report a failed compile as a compile error.
6. **Name the view in constraint-cycle errors**, and allow nested arrays in schemas.

## Would I use it again?

Yes, for interfaces where structure, data and drawing interlock: seat maps, dashboards, editors with custom visuals, form-heavy flows. There, the reactive model and the library made this build faster and more correct than I'd expect in React. I'd be more cautious about large apps that depend on third-party UI ecosystems or exacting page layout until the layout story is better documented. I'd also want to measure real-device performance before shipping a 650-control scene like this one; I haven't, so I can't vouch for it.
