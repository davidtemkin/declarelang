# Building Venue in Declare: an account for the Declare team

I made no changes for this. Some file-change notices came up while writing it; as far as I can tell they're from the `declare-format --write` I ran at the end of the build.

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`
2. `skill/SKILL.md`
3. `docs/declare.md`, all of it
4. Guide chapters 01, 04 and 05
5. `apps/todo/todo.declare` and `todo-parts.declare`, whole

After that I read only when a specific need came up:
- `14-data.md` from "Where data comes from" to the end of the forms sections
- parts of `08-controls.md`, `18-overlays.md`, `19-accessibility.md`, `10-touch.md` and `07-scrolling.md`
- many `npx declare-help` lookups, usually with `--all`
- two library sources: `combobox.declare` and `purpose.ts`

**What taught me the most:**
- `declare.md` gave me the mental model fast. The "Seven differences" section, the table of what you can assign (constraint-owned vs. computed default), and "derived state is never assigned" did most of the work.
- The to-do app taught me the idiom: where state goes, how `classFor`, `State` and `trackChanges` read in practice.
- SKILL.md's "What Declare handles for you" table saved the most time. Nearly every need in the brief had a row, and following the row found the right feature.

The reference fit the brief unusually well:
- `TextInput.judged` says outright "set it back to `false` … a security code emptied after a decline." That is exactly the behaviour the brief asks for.
- `Form.refusedWith` describes undoing "a reservation the refusal names", which is the 409 seat-conflict case.
- `TextInput` explains how to regroup a card number while typing and put the caret back with `select()`.
- `TextInput.purpose` has a table mapping each purpose to its autofill name and phone keyboard.

I'm honestly unsure whether this reflects a general design or docs written with this kind of task in mind. Either way it meant I almost never had to invent behaviour.

**What was missing or misleading:**
- **`viewAt`.** I used `room.viewAt(x, y)` to find seat views for arrow-key navigation, assuming plan-space coordinates. It's a root-space hit test, so it returns what a press would hit: the topmost full-size tier's rail, never a seat that is clipped or set to `pointerEvents = "none"`. The help text says this clearly; I didn't ask before using it. Still, there's no documented, non-geometric way to find "the view bound to record X." I ended up walking `childViews` and checking `instanceof SeatSpot && v.sid == id`. A way to find a replicated view by its record key would have been the natural tool.
- **`declare-help View`** cuts off at 40 members. `--all` is very long, and I grepped it to find methods like `viewAt` and `childViews`. Something between the two, such as listing only methods and events, would help.
- **Naming a schema `Card`** collided with the library class (DECLARE5000). The diagnostic was excellent and even suggested a rename. The mess that followed was mine: BSD `sed` has no `\b`, so my first rename silently did nothing.
- **`Toast`** is `wrap = false` and takes no width. On a 390pt phone, a long "seat taken" message ran off the screen. The layout check caught it, but my only fix was to shorten the message.
- **`Form.enterMoves = true`** stopped Return from submitting on a desk, because the last field was a `Combobox`, which handles Enter itself. The docs say "submits from the last", and that is technically true. Nothing warns that a form ending in a combobox can never be submitted with Return. I made `enterMoves` follow `app.touchFirst`.

## (b) Expressing what I wanted

**Where the language fit:**
- **Nothing typed is lost on sign-in.** This turned out to be the computed default and nothing else. `email: string = { app.account?.email ?? "" }` on a `PayDraft extends Node` follows the account until the person types; after that the value is theirs. The scenario passed without any special handling for sign-in.
- **Service refusals.** `Form` with `source = { app.order }` matched the API's refusal shape `{ field, message }` directly, because I named the fields `cvc`, `postalCode`, `number` and so on. Decline handling, the 409 conflict and re-fetching when signed out all fit in one `refusedWith`. Sending only once while pending came for free; the scripts confirm a double press sends one order.
- **Steps and addresses.** `location` holds the performance and `waypoint` holds the step, so Back goes from paying to the hall. This was clean.
- **Live seat updates.** An `EventStream` with `listenTo = ["seatchanged"]` writes into the `Hall` DataSource, and every seat updates through constraints. No subscription code.
- **Phone pan and zoom.** Three springs (`z`, `cx`, `cy`) with constrained targets. A hand writes the value and its target together, so a finger can take over mid-glide. It took about 40 lines and felt good at once in `declare-look`.
- **Fields and accessibility.** `purpose`, `concealed`, `Field` labels naming fields, and `accessibilityRole = toggle` with `accessibilityPressed` gave the accessible names the brief's automated test needs. `getByRole("button", { name: "Orchestra, row C, seat 14", exact: true })` worked.

**Where I worked around it:**
- **Layout that changes axis.** The hall and checkout are a row on a desk and a column on a phone. Setting `width` on a child that flexes is refused, and `flexes = { !app.phone }` together with a width was refused at boot. I used `align = stretch` instead. Making the desk checkout's form column scroll on its own needed `State [ applied = { !app.phone }, height = …, scrolls = y ]`, because there's no way to say "unset on phone." It works, but I'm not confident it's the intended idiom. It took several compile rounds of the "this child doesn't declare its width" kind. The messages were good each time; I just had no model for responsive layout up front.
- **Arrow-key navigation in two dimensions.** `focusScope = stop` moves the arrows in member order. Seat 1 is at the right of the drawing, because the API lists seats left to right as seen from the stage, so the default arrows would run backwards. I handled `onKeyDown` myself and added a `focusEntry()` so Tab doesn't land on a sold, disabled seat. That's reasonable for a seat map, but it's imperative code. Drawing seat 1 on the right is my own reading of the API; a reviewer might disagree with it.
- **Geometry.** The seat geometry is a long imperative `layout() -> Plan` method on `Hall`. I think that's legitimate (a derived dataset with a schema), but it is the most "general-purpose code" part of the program.
- **Untyped refusal bodies.** `refusedWith(body: object)` needed `body as any`, which is exactly the drift the skill warns against. A way to give refusal bodies a schema would remove that.
- **Small syntax refusals.** `{ app.phone ? 100% : 220 }` and `motion = quad` were both refused, each with a clear rewrite.

## (c) Verifying it

**The loop:** `declare-verify` for steps R1–R4 after every edit (a few seconds), `declare-look --url … --phone --click-at … --shot` to look at it, then four assert scripts kept in `tests/` that drive the real service with Playwright locators and `expect.request`.

**What served me well:**
- The diagnostics. Nearly every error named its fix, and applying exactly that fix worked.
- `expect.request("POST", "/api/orders", { count: 1 })` checks the double-submit rule as the brief states it.
- `--url` against the real dev server meant real cookies and real CORS.
- The warning that a run talked to a service earlier runs had written to stopped me from blaming the program.
- `page.evaluate(() => window.__declare.find(...))` let the scripts pick seats that are actually free.
- The R4 note listing views never built at boot (`SignInForm`, `CardChoice`) is honest about what wasn't checked.

**What didn't:**
- **Layout-finding noise.** "648 control(s) smaller than 44 × 44" fires on every phone run, even though the design zooms seats to about 44pt before they can be tapped. The checker can't know that. "Another view takes the presses of" repeated for clipped seats under the header, run after run. I learned to filter these with `grep`, which is a bad habit to learn about a checker.
- **The script clock.** The toast stayed visible across every later screenshot in the phone script. I believe its timer only advances under `drive.wait`, and I mostly used `waitReal`. I didn't confirm that, so I can't say whether the toast dismisses correctly on a real clock.
- **`expect.text` duplication.** It flattened visible and accessible text together ("Email Email grace@…"). That's harmless but confusing when reading a failure.
- **Silent no-ops.** `declare-look --call 'app.toggleSeat(...)'` did nothing visible, probably because the hall hadn't loaded or the seats were sold. Nothing said so.
- **What the tools can't reach**, by their nature: a phone's on-screen keyboard, autofill, password-manager prompts, VoiceOver on the scaled seat map, and how 648 Controls perform on real hardware. These are unverified.

## Surprises

- The library already had the exact behaviour the brief described: `judged = false` after a decline, a combobox that picks an item when autofill types its whole name, bars that keep a focused field from scrolling under them.
- Springs on a whole scaled sub-tree made phone zoom cheap to build.
- `instanceof` against my own Declare class worked in a handler.
- Some errors were good enough to make me trust the compiler more than my own reading, notably the nested-ternary warning (DECLARE4025) and the redundant-parentheses hints.

## Good and bad

**Good:**
- One home for each piece of state.
- Computed defaults.
- `Form` and `refusal`.
- Declarative data sources and streams.
- Accessibility built into the controls.
- Fix-naming diagnostics.
- A real-browser test ladder that works against a live service.

**Bad:**
- Responsive layout and axis switching is the steepest part of the language.
- Finding views imperatively by record is awkward.
- Layout checks give false positives with no way to suppress them.
- Some library parts are rigid: `Toast` has no width or wrap.
- Error bodies can't be typed.

## Differences from what I usually use, and resemblances

There's no render function and no hooks; assignment is the only way to update, and a constraint is a standing fact. That is far from React and close to spreadsheet cells. Other resemblances:
- **QML:** property bindings, `State`, springs.
- **Flex/MXML and OpenLaszlo:** which the README names as Declare's lineage.
- **SwiftUI:** environment-style values passed down the tree.
- **Svelte:** compile-time dependency tracking.

The biggest practical difference is that the compiler refuses constraints it can't follow. That rule caught real mistakes.

## Where I'd most want improvement

1. **Responsive layout.** A first-class way to switch a layout's axis, and to unset an attribute in a state.
2. **Finding a replicated view by its record key**, without walking the tree or hit-testing.
3. **Arrow-key navigation in two dimensions** inside a `focusScope = stop`, driven by geometry.
4. **Ways to scope or suppress layout findings**, for example marking a view as reached through zoom.
5. **A schema for refusal bodies.**
6. **`Toast` sizing** that can wrap or take a width on narrow screens.

## Would I use it again?

Yes, for interactive, stateful interfaces that need to be good on touch and keyboard: booking and checkout flows, tools, dashboards, anything with a spatial surface. The form, motion and accessibility pieces carried a lot of this build. I'd hesitate on a project that depends heavily on third-party widgets, needs the canvas renderer with screen-reader support (the guide says canvas doesn't carry what a screen reader reads yet), or will need a large team to hire for it.