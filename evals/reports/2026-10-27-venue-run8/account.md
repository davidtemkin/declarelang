# Building Venue in Declare: an account for the people who make it

I haven't changed anything. This is written from the build session, and where I'm unsure I say so.

## (a) Getting up to speed

**What I read, in order.** I started with `README.md`, which sent me to `skill/SKILL.md`. Following the skill, I read `docs/declare.md` whole, then guide chapters 01, 04 and 05, then `apps/todo/todo.declare` with `todo-parts.declare`. After that I read only what the plan needed:
- `14-data.md`: *Talking to a server*, *Streams*, and *A form* through *A form in a sheet*
- `08-controls.md`: *Text fields*, *Choosing one of many*, *Keyboard focus*
- `10-touch.md`: *Gesture claims* and *Pan and zoom*
- `19-accessibility.md`, first half

I also made about thirty `declare-help` lookups, and read the library source for `form.declare`, `radiogroup.declare` and `combobox.declare`.

**What taught me the most:**
- **The skill's "What Declare handles for you" table.** It is the most useful page in the distribution. Nearly every need in the brief had a row: a form that checks itself, a service's refusal on the field it names, sending once while pending, `TextInput.purpose`, `EventStream`. Without it I would have hand-built at least the refusal mapping and the double-submit guard.
- **The `Form` reference prose.** I read it as `declare-help Form --all`, which printed the doc comment in `library/form.declare`. It told me `refusal(body)` understands `{ "field", "message" }`, and the Venue API's 422 body is exactly that shape. Naming my fields `cvc`, `postalCode`, `number`, `expiry` and `email` was the whole integration. The test run confirmed it: "The postal code doesn't match the card's billing address" landed under the postal field and took the focus.
- **`TextInput --all` on regrouping.** One paragraph says a field that regroups as it is typed should write its text from `onInput`, then call `select()` using `selectionStart`. That was precisely the card-number problem. I wish more reference entries anticipated a real use that concretely.
- **The to-do app.** It gave me the house shape: a `DataSource` subclass for the model, user state on the App, `exists` for transient forms, computed defaults. I copied its idioms almost directly: `focusSoon`-style `afterSettle(() => Focus.focus(...))`, `ignoreScroll` bars, the `Fraunces` `Font` with fallbacks.

**What was missing or misleading:**
- **`declare.md` §10 repeats a paragraph.** "Inside a state, an override is the view's…" appears twice, word for word. It's small, but in the one file meant to be read whole, it made me reread to see whether something differed.
- **`declare-help Accessibility.announce` returns "no entry".** `declare-help Accessibility` has the answer. Dotted lookups on namespaces (as opposed to classes) don't resolve, and the miss message doesn't suggest the parent.
- **Combobox and autofill.** The behaviour I most needed was "text that arrives whole (autofill, a paste) and names exactly one item picks it". As far as I found, it's documented only in a comment inside `combobox.declare`. It decided whether a Combobox could be the country field at all, so it belongs in the reference entry.
- **RadioGroup's direct-child rule.** The `RadioGroup` doc says radios are direct children. It doesn't say that index 0 of `children`, and so of a view path like `methods.0`, is something else. In practice `methods.0` was not a radio, and I lost a debugging round when `methods.2` turned out to be the expired Mastercard rather than "A new card". This is partly my fault for using indices, but the path docs present `app.list.3` as the normal way to name a row.
- **Cross-axis sizing under `SimpleLayout` with `flexes`.** I didn't find this stated plainly. My first desk hall had `stageBox.height = 0` and an empty screen. I solved it with `State [ applied = { app.wide }, height = 100% ]` and a twin State for width. I'm not sure that's the intended idiom. A `ResponsiveLayout` might have been the answer, but I didn't read its entry, and the guide didn't push me to it for this case.
- **`PinchEvent`.** The guide's example uses `e.x`, while the `onPinch` reference says `e.center` is in root space. I used `e.x`, and I never tested a real pinch. I'm unsure that code is right.

## (b) Expressing what I meant

**Where the language fit my intent closely:**
- **The seat map as nested replication.** `SectionView [ datapath = :sections[] ]` contains `SeatRowView [ datapath = :rows[] ]`, which contains `SeatDot [ datapath = :seats[] ]`. Each seat computes its position on an arc from `rowIndex` and its row's radius. A screen-reader structure (section group, then seats) fell out for free. The service's own data drove the geometry, and the event stream's one write (`markSold` → `set([... "status"], "sold")`) updated exactly the seat that changed.
- **Computed defaults for "signing in loses nothing".** This was the best fit in the whole build. `email: string = { this.account?.email ?? "" }` follows the account until the person types, and then the value is theirs. "Their name and email fill in, and nothing typed is lost" became one line per field, with no "dirty" flags. The phone test confirmed a name typed before sign-in survived it.
- **`method: string = { this.number == "" && this.firstUsable != null ? this.firstUsable.id : "new" }`.** This offers the saved card on sign-in unless the person had already started typing a new one. It's another computed default, and it would have been fiddly state-machine code elsewhere.
- **`Spring` for the seat "pop".** `Spring [ attribute = grow, to = { mine ? 1 : 0 }, stiffness = 560, damping = 16 ]` gives an overshoot that registers the commitment. For the summary pulse I wrote `bump = 1` against a spring whose target is 0, a trick I inferred from the swipe example in the to-do app. It's idiomatic enough, but I'm not certain it's the intended way to do a one-shot pulse.
- **The hall's Springs for tap-to-zoom.** Three springs (`zoom`, `panX`, `panY`) carry it, and a finger writes value and target together. The guide's "the point under the hand stays under the hand" framing was exactly right.
- **`DataSource [ credentials = include ]` and `EventStream [ listenTo = ["seatchanged"] ]`.** Both worked first time against a cross-origin cookie service.
- **`exists` versus `visible`.** Having two words for presence and visibility was the right distinction, and I used both deliberately. Late on I switched the unused half of the payment form to `exists`, so only one "Security code" input is ever in the page.

**Where I worked around the language or library:**
1. **A sticky summary panel.** On desk I wanted the order summary to sit level with the form and then hold at the top as the form scrolls. `ignoreScroll` inside the layout produced a precise diagnostic: "has ignoreScroll, but its parent … does not scroll … To stand still against the window, make it a child of the App". So I moved it to the App and hand-placed it with `y = { Math.max(app.barH - 36, app.barH + 28 + (app.checkoutScreen?.col.head.height ?? 100) + 20 - app.scrollY) }` and `x = { (app.width + app.checkoutWidth) / 2 - 380 }`. This is the "placing everything by hand" smell the skill warns against, and it duplicates layout knowledge. A sticky placement would remove it.
2. **Grid keyboard navigation.** `focusScope = stop` gives linear arrows, and the reference says so honestly: "in a grid where Up means the row above, the view answers the arrows itself". So `Hall.arrow()` walks `surface.children → children → children`, filters by `radius`, and sorts by `cx`. It works, but it's 30 lines of handler code reconstructing spatial adjacency the runtime already knows from geometry. A "spatial" arrow mode for stops would be valuable.
3. **The form discarded during its own refusal.** On a 409 my `refusedWith` set `step = "seats"`, which discards the checkout and so the form. The page then threw `TypeError: Cannot read properties of undefined (reading 'length')` from an `afterSettle` callback, with a stack pointing only at `eval (:6:16)`. Deferring my step change with another `afterSettle` fixed it. I believe the library's `Form` assumes it outlives its own `_heard` → `refuse` → `showProblems` sequence. "Leave the screen when the order is refused" is a natural thing to do from `refusedWith`, so this should be robust, or documented.
4. **A double-submit guard I may not have needed.** I added `sending` with `send() { if (sending) return; … }` because I reasoned two presses could each reach `_proceed` before `pending` re-derived. I never proved that race exists. The `expect.request("POST", "/api/orders", { count: 1 })` check passed, but it would probably have passed without my guard too.
5. **Taken seats swallowed taps.** A disabled `Control` still takes the pointer and does nothing. So on a phone, a tap that happened to land on a taken seat at full-hall scale neither zoomed nor chose. I fixed it with `pointerEvents = { gone ? "none" : "auto" }`. That's defensible, but I'd have expected a disabled control either to pass presses through or for the docs to say it doesn't.
6. **Judging an untouched empty field on blur.** Under touch emulation, opening the sign-in sheet left focus on `BODY` and the Email field immediately said "Enter your email address.", which is exactly what the brief forbids. I overrode `onBlur` in `Entry` with an `afterSettle` that un-judges an empty, untouched field. My first attempt called `super.onBlur()`, and DECLARE4000 told me clearly that a built-in has no handler body to call. I'm uncertain whether the lost focus is real on phones or an artifact of the tool's synthesized compatibility mouse events (with the mouse, focus landed in Email). Either way, judging an empty field the person never typed in, on leave, is a stricter default than most consumer forms use.
7. **Small frictions:**
   - `let to: SeatDot? = null` inside a method body fails as TypeScript (DECLARE6001 / TS17019), though `T?` is legal in declarations. That inconsistency is easy to trip on.
   - Bare tokens like `semibold` are legal as a whole value but not inside `{ }` (DECLARE4005). The message was clear, but I hit it four times.
   - `Carousel` refused `datapath = { app.order }` with a runtime `DeclareError` ("belongs to no Dataset/DataSource"). It only surfaced when I set `order` from outside; in the real flow `order` came from a `DataSource` value. Wrapping it in `tickets: Dataset [ contents = { … } ]` fixed it. A compile-time check would have been nicer, though I see why it's hard.
   - DECLARE4025, the nested-ternary warning, nudged me into `columns: number = { [560, 820, 1180].filter((w) => app.width >= w).length + 1 }`. That's arguably *less* readable than the chain it replaced. The warning is good in general, but a breakpoint ladder may be a case for an exemption, or for a responsive primitive.

**Diagnostics worth praising specifically:**
- **DECLARE4013** (`press()` on a `Button` replaces its activation path; put the action in `onClick`) caught a real bug in five places. I'd note that it exists *because* `Button` inverts the `Control` convention, and that inversion is itself a trap.
- **DECLARE4023** ("Text reads rowIndex, but Text is not replicated … the index is parent.rowIndex") saw a subtle bug in the ticket numbering and named the fix.
- **DECLARE4002** (my `brandName` child shadowing the script function) would have been a confusing runtime bug.

## (c) Verifying it

**The ladder.** `declare-verify` was fast: R1–R4 in a few seconds, and it fed sample data shaped by each schema so the boot exercised replicated views. "clean through R4 (514 of 653 constraints statically wired)" was reassuring. I didn't investigate the unwired third, and I don't know whether any of it mattered.

**`declare-look` was the workhorse.** `--set app.location=p06 --set 'app.chosen=[…]' --call 'app.toCheckout()' --shot` let me reach any screen in one command, and `--read` answered geometry questions faster than a screenshot. The `--outline`/`--read` habit the skill recommends paid off. `stageBox.height = 0` diagnosed the empty desk hall in one call.

**The tool understood fingers.** It refused my `--click` on a full-scale seat under `--touch`: "a tap … lands within 6 px of … surface.1.6.9, and a finger there is taken by it — a browser moves a tap onto a control that close." That's not noise; it's the brief's own "hard case", stated by the checker. It pushed me to make a tap anywhere on the room zoom in, which is better design. The standing finding "648 control(s) smaller than 44 × 44" then became noise I couldn't acknowledge. I'd like a way to mark a finding as understood (for example, "these targets are reached through zoom").

**Assert scripts against the live service** (`--no-boot --url http://127.0.0.1:8200/…`) gave real cookies and a real SSE stream. I wrote four flows and all four pass. `drive.requests()` and `expect.request(…, { count })` let me assert "one payment, not two", and naming views by accessible name (`methods."A new card"`) was sturdier than indices.

**Where verification hurt:**
- **`page` is not full Playwright.** `page.route` "is not a function", so I couldn't stub out the event stream to force the 409 race. I reached the 409 path by putting an already-sold seat in `chosen` instead. It's a weaker test of the real race, since the stream beat my click in the honest version.
- **Live mutation.** The note says so ("what they made stays there; --fixtures … leaves nothing behind"), and I ignored it for realism. My runs bought seats, which later broke my own keyboard script: the seats it assumed were free had been sold. I should have used fixtures for repeatable checks and kept a single live smoke test. That was my call, not a tool failure.
- **Runtime errors have no source position.** The 409 crash stack was `eval (:6:16)` inside `declare-boot.js`. I found the cause by reasoning, not by the stack. For a language whose diagnostics are otherwise this good, a runtime error that names the `.declare` line would be a big step.
- **`expect.attr("app.chosen", "length", 2)` fails as `undefined`.** I fell back to `page.evaluate`. Either attribute paths or a small `expect.value(fn)` would help.
- **Things I couldn't verify at all:**
  - real phone keyboards and autofill (as the brief anticipated)
  - a real pinch
  - performance of 648 `Control`s, each with a `Spring`, on an actual phone
  - VoiceOver's actual reading

  `--semantics` showed the tree (`toggle "Orchestra, row A, seat 4" hint "Free, $80.00" [not pressed]`), which is good evidence but not the experience.

## Surprises

- **`scale` carries hit-testing and the parent's footprint**, not just paint ("every reader agrees on the one geometry"). Scaling one surface for the zoom was safe because of this. I expected CSS-transform semantics and was braced to fight them.
- **The finger-proximity check** in the driver, described above.
- **How directly the library's conventions matched a hand-written REST API I'd never seen**: `{ field, message }` refusals, `purpose` tokens mapping to `cc-number`/`cc-exp`/`postal-code`. I confirmed the attributes on the real inputs.
- **`location` as a plain attribute.** Opening a performance is `app.location = :id`, Back works, and a `trackChanges = ["perfId"]` handler resets the choice and moves focus. No router.
- **The formatter rewrote six files**, including the theme's comment spacing, without breaking anything.

## Good and bad, plainly

**Good:**
- The compiler is a genuine collaborator. Its errors name the fix, and applying exactly that fix almost always worked.
- Computed defaults, Springs and `exists` are small ideas that carry a lot.
- The skill's routing table saves real time.
- The forms stack is unusually complete: judging on leave, a service's refusal on the field it names, `enterMoves`, `purpose`.
- The checking tools understand input modality.

**Bad:**
- Layout was the area I most often reached past the idiom: a breakpoint swap, a sticky panel, and cross-axis sizing under a flexed layout.
- Spatial keyboard navigation has to be built by hand.
- A runtime error inside the library gave me no Declare position.
- Two library behaviours (disabled controls eating presses, judging untouched fields on blur) went against what I expected, and I had to discover both by testing.
- Some docs live only in library source comments.

## Compared with what I'm used to

The biggest difference is that there is no render function. I never once thought about re-rendering, memoisation or effect dependencies. Instead I thought about "who owns this value": a set constraint versus a declared computed default. The §5 table on that is the single most important page for a React-trained writer.

The second difference is that events don't bubble, and children report up by calling methods. That was cleaner than I expected. The first-class `press()` versus `onClick` split on `Button` was the one place the model leaked.

Styling without CSS was easy, and theme tokens via `provided("theme")` read like design tokens done properly.

## What it reminded me of

**QML** most of all: property bindings as constraints, `State`s with automatic revert, Springs as Behaviors, a tree with ids, and imperative JavaScript in handlers. Also **Flex/MXML** and, by its own account, **OpenLaszlo**. The reactivity feels like Svelte's or Solid's fine-grained signals, but compile-time-wired and stricter. The `location`/`waypoint` split has an Elm-like clarity about what state is.

## Where I'd most want improvement

1. **Responsive arrangement primitives.** Swapping a row for a column and sizing the cross axis without `State` pairs, plus sticky placement within a scroller.
2. **Spatial focus navigation** for `focusScope = stop`, or a grid helper that uses view geometry.
3. **Runtime errors mapped to `.declare` source**, and `Form` robust to being discarded inside `refusedWith`.
4. **Driver capabilities:** network interception in assert scripts, `expect` over expressions, and a way to acknowledge known layout findings.
5. **Docs:** move behaviour now documented only in source comments (Combobox autofill picking, `RadioGroup` children indices) into the reference; fix the duplicated §10 paragraph; let namespace member lookups resolve.
6. **Default judging:** reconsider judging an untouched, empty field on blur, and say what a disabled control does with a press.

## Would I use it again?

Yes, for interaction-heavy consumer surfaces: checkout and booking flows, seat maps and other spatial pickers, dashboards with live data, anything where continuity of motion matters. Venue's hall, forms and live-seat handling took noticeably less glue than I'd expect in React. The parts that stayed hard were layout and spatial keyboard navigation, not reactivity.

I'd be more hesitant, with genuine uncertainty, about a large team codebase today. The ecosystem is young and real-device performance is unproven to me; I didn't measure 650 sprung controls on a mid-range phone. For long text-heavy sites I'd want to see the crawler output and accessibility hold up under real screen readers before committing.