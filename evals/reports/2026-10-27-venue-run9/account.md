# Building Venue in Declare: an account for the people who make it

This covers one build of a few hours: a ticketing app with a 648-seat live map, a checkout form, sign-in and tickets, for phone and desk. I'd never seen Declare before. Everything below comes from that one session, and I say so where the evidence is thin.

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`, which pointed me to `skill/SKILL.md`.
2. `docs/declare.md`, whole.
3. Guide chapters 01, 04 and 05.
4. `apps/todo/todo.declare` and `todo-parts.declare`, whole.
5. The bundle from `npx declare-start --pick form,service,touch,accessibility,layout,motion --program tracker`: about 79 KB of guide sections, 21 KB of reference and a 5 KB outline of the tracker.

After that, only targeted `npx declare-help` lookups: EventStream, Stream, TextInput, Form, Field, Sheet, RadioGroup, Combobox, Carousel, Layout, focusScope, waypoint, scrollX, tabOrder, accessibilitySettings and a few more.

**What taught me the most:**
- **The todo app.** Its comments explain *why* things live where they do. Patterns I copied almost directly:
  - state on the App, with aliases like `list: View = { app.main.col.list }` for views used from far away;
  - computed defaults that become the user's once they type;
  - `exists` for a form that should start fresh;
  - one Spring per motion.
- **The Form reference** (`declare-help Form --all`) was the single most valuable page. It told me, before I wrote anything:
  - that `refusal(body)` already understands `{ field, message }`;
  - the order `refusedWith` runs in;
  - that `pending` already blocks a double submit;
  - that `judged = false` exists for a security code emptied after a decline.

  That last item matched the brief so closely it felt written for it. I built almost no form machinery myself. The 422 → field → focus behaviour, which would have been an afternoon in React, came free.
- **`docs/declare.md` §5** on settled versus computed defaults, and the "what you can assign" table. This is the one idea you must hold to avoid fighting the runtime, and the table states it well.
- **The SKILL's drift check.** It stopped me hand-building a scrim overlay, and pushed me to write a `Layout` subclass (`PanelLayout`) instead of `width = { app.wide ? … }` arithmetic on siblings. Its sentence "a layout of your own: one `place()` that divides the room" was exactly right for my case.

**What was missing or misleading:**
- **`declare.md` §10 repeats a paragraph verbatim** ("Inside a state, an override is the view's…" appears twice). This is harmless, but in a document that sells itself as compact and authoritative it made me briefly wonder whether I'd misread.
- **`provided(…)` on the App.** The docs say `provided("accessibilitySettings")` is how to read it "anywhere". On the App itself it throws at runtime: "no ancestor provides 'accessibilitySettings'". §9 does say `provided` "walks up, never to itself". But the `App.accessibilitySettings` entry says "read it anywhere as `provided(...)`", and the App is the obvious place to put an app-wide `stillness` flag. The compiler didn't catch it; I found it only because every assert script failed at R5.
- **Copying an Animator's value into a Spring.** I didn't know whether writing a sprung attribute directly would wake its Spring. The motion chapter answers it, but only in passing inside the carousel example ("Write only `offset` … changes nothing a sleeping spring watches"). I used an `Animator` instead. A one-line statement in the `Spring` reference would help.
- **Two facts I found only by trying:**
  - A `Radio` must be a direct child of its `RadioGroup` (only the source comment says so). Replicated Radios via `datapath = :cards[]` did work, which I wasn't sure of.
  - A `Button` can't flex in a row, because it owns its width. The error told me; nothing earlier warned me.
- **Generic arrow-key movement inside `focusScope = stop`.** I couldn't tell from the docs whether a `stop` works for arbitrary Controls or only for ones that implement `onKeyDown`, like Radio. It does work generically: arrows moved along a row of seats. I'd have liked to know that before relying on it.
- **The size of the starting bundle.** The `declare-start` output is large. Reading it once was right, but much of the guide text (pan-and-zoom, the whole accessibility chapter) I used only lightly. That was my choice of picks, not the tool's fault.

## (b) Expressing what I wanted to express

**Where it fit well:**
- **Data from the service.** Each `DataSource` with a `schema` was one declaration: production, seat map, `me` and order. Typed `.value` everywhere and no casts. `credentials = include` and an absolute URL just worked cross-origin.
- **The live stream.** `EventStream [ listenTo = ["seatchanged"], url = { … } ]` connects and disconnects with the performance. "Refetch the map once the stream opens" was a single `onOpen() { app.house.fetch() }`, which closes the gap between the first fetch and the stream opening. The reference warned about `listenTo` for named events. Without that sentence I'd have lost time to a silent stream.
- **Screens.** `location` for the performance and `waypoint = "pay"` for checkout gave a Back button that does the right thing, with no router. `screen` is a derived string; screens are `visible = { app.screen == … }`.
- **Signing in mid-checkout without losing anything.** This came from where I put the state. Checkout values live on the App as computed defaults (`email: string = { app.account?.email ?? "" }`), so signing in fills empty fields and leaves typed ones alone. That's the brief's exact requirement, met by the semantics of declaring versus setting an attribute, not by code.
- **Field-level behaviour.** `purpose = cardNumber | cardExpiry | cardCode | postalCode | …` produced correct `autocomplete` and `inputmode` attributes, which I confirmed in the DOM. `concealed` gave show-password while keeping it a password field. Card grouping with caret repair (`onInput` + `select(caretAfterDigits(…))`) is described in the TextInput prose, almost for exactly this case.
- **The hall as a scene.** Pure geometry functions in `script` (`seatDX`, `seatLift`, `sectionTops`) drove seat `x`/`y` constraints, the tier plates (`draw`), the minimap (`draw`) and the burst position. One source of truth and no layout fighting. The guide's framing ("hand-written x/y belong on a diagram's scene") gave me permission to do this without feeling I'd drifted.
- **States for the three seat looks.** `SeatMark` with two `State`s, including a `CheckIcon` child only while chosen, read cleanly.

**Where I worked around it:**
- **Paths into nested, unnamed children.** `refusedWith` had to reach the security-code field. My first try, `this.saved.code`, failed (DECLARE6001) because the `Field` in between was unnamed. I named the Fields (`cvcField`). Later I switched the blocks to `exists`, which made the paths nullable (`this.saved?.cvcField.code`). The rule is fine; I hit it three times.
- **Name collisions between schemas and classes.** `schema Seat` and `class Seat` collided (DECLARE5001), so I renamed the schema `SeatRecord`. Reasonable, but it's a shared namespace that a newcomer from TypeScript (where types and values are separate) won't expect.
- **Pitch tuning and row depth.** For thumb-sized seats I made the row depth a parameter, which meant threading `app.rowDepth` through every geometry call. That came from my own design choice, not the language.
- **Tab order in the hall.** By default, Tab reached the 26 rows before the side panel, and my first `tabOrder()` override broke `Focus.focus(heading)` (more under Surprises). The final `tabOrder() { return [overview, side, hallPane] }` is one line, but finding it took three iterations.
- **Countries.** For country I used `Combobox [ purpose = country ]` to give autofill a chance. Whether browser autofill selects a member of a Combobox is undocumented, and I couldn't test it.
- **Nested ternaries.** `screen` hit DECLARE4025. The fix (naming `paying` and `atPerformance`) genuinely read better.

## (c) Verifying it

**The ladder** (`npx declare-verify`) was the best part of the experience.
- R1–R3 errors arrived together, each with a fix I could apply mechanically:
  - `View already has an attribute 'scale' — … write 'scale = …'`;
  - `Amount has no attribute 'textAlign'`, because a class with no base is a View, not a Text;
  - `'semibold' … inside { } write it as a string`;
  - `Text.accessibilityRole … got 'alert'` (the list of valid roles was right there);
  - the Button-flexes message, which named both possible fixes.
- R4 booted at laptop and phone sizes and gave layout findings I acted on: 36×31 seats, a 32×44 back button and a 30px Combobox, all flagged against 44×44.

**Assert scripts at R5** carried the real verification. I wrote six:
- desk guest checkout;
- the phone version of the brief's §10 story;
- phone guest;
- keyboard only;
- session, reload and double press;
- the 409 conflict.

What helped:
- Naming views by accessible name, as in `app.screens.pay.formPane.col.form."Card number"` or `app.signInSheet."Password"`, made the scripts read like the brief. It also checked naming as a side effect: if the click worked, the label was right.
- `expect.request("POST", "/api/orders", { count: 0 })` proved that nothing reached the service from an invalid form.
- `drive.requests()` let me count orders after a click, a second click and Enter.
- `drive.waitReal` was necessary because the order takes 1.5 s against a live service. The distinction between virtual and real time is well explained.
- `page` gave the escape hatches I needed: `page.screenshot`, `page.reload()`, `page.evaluate(() => fetch(...))` to buy a seat as "someone else", and `drive.set("app.live", "active", false)` to force the 409 path by silencing the stream.

**`declare-look --js`** answered "what does the DOM actually expose" in one command. That is how I confirmed `role="checkbox" aria-label="Orchestra, row C, seat 14"` with `aria-description="Sold"`, and the `autocomplete`/`inputmode` attributes per field. It is also how I spotted the duplicate hidden "Security code" input that could make a by-label lookup ambiguous.

**Where the tools served me less well:**
- **R5 failure messages for missing paths** say only "no node at …". Twice the cause was my own wrong price in the script (`Pay $246.00` instead of `$245.00`; `$139` instead of `$142`). A hint like "views with similar names: `Pay $245.00`" would have saved a round trip.
- **The `provided()` error surfaced only at R5,** as a runtime throw in every script. R3 could, I think, know statically that a `{ }` default on the App reads `provided(…)` with no default and no ancestor.
- **Writes to the live service.** The scripts placed real orders and sign-ins. `verify` says so in a note and points at `--fixtures`, which is fair. I chose the live service deliberately, and the service's state is now different (sold seats on several performances).
- **What I couldn't verify:** a phone's on-screen keyboard (`app.keyboardHeight` is 0 headless), browser autofill, and a real screen reader. The tools say this honestly. I used `--js` and the semantics rather than `--semantics` itself; I didn't try `--semantics` and can't judge it.
- **I didn't use a checker sub-agent** (`docs/operational/checking.md`) despite the skill recommending it. Assert scripts plus a few screenshots were enough; I can't say whether a checker would have caught more.

## Surprises

- **Changing Tab order broke programmatic focus.** I overrode `HallSide.tabOrder()` to leave out its heading, so `HallScreen.tabOrder()` could list the heading first. After that, `Focus.focus(app.hallScreen.side.heading)` silently did nothing and focus fell to `<body>`. My keyboard probe printed the whole page's text as the "focused element". Putting the heading back in its parent's `tabOrder` fixed it. I infer that `Focus.focus` refuses a view that isn't reachable in traversal, but that's an inference, not something I read. Either way it was silent, and it's exactly the "focus is never lost after an action" failure the brief warns about. A dev-mode warning ("focus() target is not in any tab order; ignored") would have saved real time.
- **R4 builds sample rows from schemas** ("3 data source(s) fed a sample of their schema"). So the hall was layout-checked at boot without the live service. I didn't expect that, and it's clever.
- **Most of the form came free.** Building a checkout with refusals mapped to fields, focus moved to the first problem, a single send while pending, and judging deferred until a field is left, with no form code of my own.
- **Performance at this size never came up.** 648 seat Controls, each with several constraints, plus a minimap `draw()` reading every seat on each scroll. Picks felt instant in the screenshots, but I didn't profile, so treat that as unmeasured.

## Good and bad

**Good:**
- The compiler's errors. Each one named its fix, and I never had to guess.
- The rule of state on the App versus records in datasets, and the computed-default idiom.
- Form, Field and TextInput as a complete, well-thought-through contract.
- `purpose` as one attribute serving autofill, phone keyboards and screen readers.
- `EventStream` and `DataSource` as declarations rather than effects.
- Accessibility as a first-class attribute set that `declare-look --js` could confirm.
- `declare-verify` R5 with accessible-name paths.

**Bad, or at least rough:**
- Silent failures: the `Focus.focus` case above, and `provided()` on the App reaching runtime.
- Small documentation gaps listed in (a).
- Path depth. Unnamed intermediate views make deep paths brittle (`app.screens.pay.formPane.col.form`). I compensated with App-level aliases, as the docs advise, but it's a recurring tax.
- The shared namespace for schemas and classes.
- `textAlign` takes `left | center | right`, while layouts and positions use `start | end`. I wrote `end`, it failed, and I used `right`. Minor, but inconsistent within one language.

## Differences from what I usually use

- **No render cycle and no hooks.** Assignments, constraints and settles replace them. After an hour this felt simpler than React. The one real adjustment was "inside a handler you read the world before your writes land", which `afterSettle` handles. I used it for focus after a screen change and after a decline.
- **Children come from data, never from code.** `datapath = :sections[]` replaces `.map()`. This fit the seat map perfectly: sections → rows → seats nested three levels deep with nothing written by hand. It's less natural for one-off lists derived from App state; I had to wrap `picks` in a `Dataset [ contents = { { lines: app.picks } } ]` just to replicate order lines.
- **No CSS.** Paint lives on the view, `padding` belongs to the view not the layout, and stacking is declaration order. Nothing here cost me anything.
- **Layout is a class you can write.** `PanelLayout` was about 15 lines and replaced what would have been media queries plus flex rules in CSS.

## What it reminded me of

- **OpenLaszlo/LZX**, which the README cites as its ancestor: constraints, datapaths, states, and classes defined in markup.
- **SwiftUI**, for State-as-configuration and springs as declarations.
- **QML**, more than anything: property bindings, states, a tree of typed elements, and JavaScript in braces. QML is the closest living relative of my experience here.
- **Elm**, a little, in how strongly the guidance discourages imperative escape.

## Where I'd most want improvement

1. **No silent failures in focus and providers.** Warn when `Focus.focus` ignores its target. Catch `provided()` reads with no possible provider at compile time.
2. **Better R5 diagnostics for missing paths:** nearest names, and the visible labels of the siblings.
3. **A short "known edges" section in the reference:**
   - Radio must be a direct child of its group;
   - Button can't flex;
   - writing a sprung value doesn't wake its Spring;
   - Combobox and browser autofill;
   - arrow keys under `focusScope = stop` work for any Control.
4. **Consistent alignment vocabulary** (`start`/`end` for `textAlign`).
5. **Replicating from a derived array without wrapping it in a Dataset**, or the docs should say plainly that the wrapper is the intended idiom. I'm unsure which is right.

## What I'd use it for

On this evidence, I'd choose Declare for:
- **Form-heavy consumer flows** that must be accessible and work on phones: checkout, booking, onboarding. The Form/Field/TextInput contract is the strongest part of what I used.
- **Live, data-driven visual surfaces:** seat maps, schedules, dashboards fed by streams. Its "scene from geometry functions plus constraints" handled the hall with almost no friction.
- **Work written mostly by an agent and checked by tools,** because the compiler and verifier gave me a tight, trustworthy loop.

I'd hesitate:
- where a team needs the npm UI ecosystem;
- where hosting must be server-rendered in a conventional stack;
- for very large teams. The library is small and the community knowledge is thin, though the docs are good enough that this mattered less than I expected.

My judgment rests on one build of moderate size. I didn't stress performance, the canvas renderer, dark mode, or long-term maintenance.