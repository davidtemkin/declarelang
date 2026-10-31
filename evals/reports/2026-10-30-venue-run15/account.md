# Building Venue in Declare: an account for the people who make it

One thing first: the dev server I said was running has since stopped (exit code 144). It was a background task in my own environment, and I don't think Declare caused it. Until someone runs `npm start` in `declarelang/` again, the URL I gave won't answer. I haven't restarted it, since you asked me not to change anything.

## (a) Getting up to speed

**What I read, in order.** `README.md`, then `skill/SKILL.md` (which `AGENTS.md` points to), then all of `docs/declare.md`. Then guide chapters 01, 04 and 05, and `apps/todo/todo.declare` with `todo-parts.declare` in full. After that I only read parts, as I needed them:
- Guide chapters: `14-data.md` (Talking to a server, Streams, the forms sections), `08-controls.md`, `19-accessibility.md`, `18-overlays.md` (Popovers through Toasts), `10-touch.md` (Gesture claims, Pan and zoom), the scale section of `06-layout.md`, Springs in `21-motion.md`, and `ignoreScroll` in `07-scrolling.md`.
- Two library sources: `library/combobox.declare` and the header of `library/carousel.declare`.
- About thirty `npx declare-help` lookups.

**What taught me the most.**
- **The skill's reading order, and its "Then stop reading."** It kept me from spending my context on chapters I didn't need yet.
- **The "What Declare handles for you" table in SKILL.md.** Almost every need in the brief had a row, and each row named the right guide section and help topic.
- **`declare-help Form --all` and `declare-help TextInput --all`.** These felt as if they had been written with this brief in mind:
  - `Form.source` lays the service's refusals back on the field that has the same `name`.
  - `pending` makes a second submit do nothing.
  - `refusedWith` is where the program adds its own response to a refusal.
  - `TextInput.judged` says, nearly word for word, "set it back to `false` for a fresh try (a security code emptied after a decline)".
  - `purpose` covers autofill and the phone keyboard; `concealed` covers the show-password toggle.

  About a third of the brief's checkout section was already answered by the library. I want to be plain about that: the brief and the library fit unusually well.
- **The to-do app.** It showed me where state goes in a whole program. I copied its pattern of a sheet that opens from a flag and writes its closing back through `input`, and its `Font` setup.

**What was missing or misleading.**
- **`declare-help View.children`** answered "has no member 'children' and nothing near it". The member is `childViews`, and I only found it by dumping `View --all`. The help knows its own names, so suggesting the nearest one would have saved a round trip.
- **Replicating over a computed array.** I wrote `datapath = { app.chosenSeats() }` with a child `datapath = :[]` and got DECLARE1000, "expected a field name after ':'". I fixed it by wrapping the array in a derived `Dataset` with a `rows` field. I couldn't find anything in the docs saying a bare array has to be wrapped like that.
- **Event payloads were guesses.** For `onChange` I assumed `e.changed("perfId")` and `e.previous(...)`. It's actually an array of `ValueChange`. The chapters I read describe `trackChanges` but not what the handler receives.
- **Menu item records.** I wrote `disabled: true`, and the TypeScript error named the type `MenuItemRecord`. `declare-help MenuItemRecord` then answered "no entry". The right field, `enabled: false`, is in a comment in `library/menu.declare`.
- **The Combobox reference says autofill works** ("Text that arrives whole and names exactly one item, as autofill's does, picks that item"). That's true. But the control puts two elements in the accessibility tree that are both named "Country", the `role=combobox` div and its input. I only found out when a Playwright `getByLabel` call failed on ambiguity. Then I replaced the control (see (b)).
- **`App.lastPointerType`** says plainly not to make `press()` depend on it, and that is exactly what I went on to do (see (b)). That isn't misleading; the docs saw it coming.

## (b) Expressing what I wanted

**Where it fit well.**
- **Session state as a derivation.** Signed-in is `me.loaded && !me.failed` on a `DataSource` with `credentials = include`. Signing in calls `me.fetch()`; signing out makes `/api/me` return 401, so `failed` becomes true and everything follows. I wrote no session flag. One uncertainty: I set `format = "text"` on the DELETE request because I expected a 204 with an empty body to fail as JSON. I never checked whether that was needed.
- **Live sales.** `EventStream [ url, active = { screen is hall or checkout }, listenTo = ["seatchanged"] ]` was the whole subscription: no connect call and no teardown.
- **"Nothing typed is lost" by signing in.** These came out as computed defaults: `email: string = { app.account?.email ?? "" }`, the same for the name and each billing field. If you've typed in a field, your typing replaces the formula; if you haven't, the account fills it. This was my favourite moment. A rule that is usually fiddly became one line per field, with no "has the user edited this" flags.
- **The hall.** Hand placement on a drawn surface is what `x` and `y` are for. The derived `plan` dataset wraps each service seat record as `{ id, seat, x, y, … }` rather than copying it, so a sale written to the seat map shows up in the drawing straight away. `draw()` handled the seat shapes and the floor bands. A `scale` on the plan container moved hit-testing along with painting. For the zoom I used the pattern from "Under the hand, write the value and its target together", with three springs plus pinch handlers. That took about forty lines and behaved correctly when interrupted, with no extra code from me.

**Where I worked around it.**
- **Percentages inside a condition.** I wrote `{ app.phone ? 100% : 200 }` three times, although declare.md had already told me the literal vocabulary stops at the brace. Each fix meant a base value plus a `State [ applied = { app.phone }, width = 100% ]`. That's correct, but it's verbose for "full width on a phone". I made the same kind of slip with `semibold`, `y`, `easeout` (it's `easeOut`) and a bare `Infinity`. Every diagnostic was clear. The rule just ran against my habits every time.
- **`flexes` only acts along the layout's axis.** I switched the hall page between rows (desk) and a column (phone) with `axis = { app.phone ? "y" : "x" }`. On the phone, the room came out zero pixels wide and the screenshot was blank. The compile and boot checks didn't catch it, because the room is only built once the seat data arrives. I found it with `declare-look --read app.hallPage.house.width`.
- **Finding the view for a record.** For Up and Down arrows across rows of seats (the docs say grids handle their own arrows), I worked out the target seat's id from the data. Then I had to search `childViews` for the view with that id and cast it to `Seat`. I'd like a supported way to go from a record to its replicated instance.
- **Reaching a field from far away.** To reset `judged` on the card's security code after a decline, I named intermediate views just to make a path legal: `f.fresh.codes.codeBox.codeField.judged = false`, run inside `afterSettle`. It works, but it's brittle.
- **Disabled controls swallow presses.** A finger tap on a sold seat did nothing, because the disabled control took the press. I added `pointerEvents = { gone ? "none" : "auto" }` so the tap falls through to the room underneath. I didn't expect this, and nothing told me about it. I found it by reading `app.chosen` and `zoomed` after a tap.
- **The phone hall and what a press means.** The library warns that `press()` shouldn't depend on `lastPointerType`, and I did it anyway: a finger's tap from the zoomed-out view zooms in instead of choosing a seat. My first version laid a transparent tap-catcher over the room. Rung 4 rightly warned that it intercepted screen-reader activation of the seats underneath, so I removed it. I'm not sure my branch is right. I don't know of a better answer to "a seat is 10px and a thumb is 44px" that still lets a precise pointer, or a test tool, choose a seat directly. I'd value a supported pattern for dense targets on touch.
- **No sticky positioning.** The brief wants the order and total always in view at checkout. I restructured the desk layout so the form is its own scrolling pane beside a fixed summary. It works, but it changes which element scrolls, which sticky positioning wouldn't.
- **Smaller ones:** `Toast` doesn't wrap (I shortened the message for phones); the `Carousel` clips its pages' shadows into a grey box (I added padding); and I swapped the Combobox for a plain text field with `purpose = country` and a check that accepts common spellings.
- **Script length.** About 200 lines of `script` hold pure helpers: money, dates, card grouping, Luhn, postal formats, the barcode pattern. The drift check warns about long script blocks. I think these are the "functions of their arguments" the guide allows, but a reviewer might disagree. The hall geometry is a method on `House`, as the drift check asks.

## (c) Verifying it

- **`declare-verify` rungs 1–3.** It took about six rounds to compile cleanly, each a couple of seconds, and every error named its fix. I followed them literally and nothing got worse.
- **Rung 4 (boot)** feeds each data source a sample shaped by its schema. That's sensible, but it means rung 4 never saw the hall, checkout or tickets with real data. It did list the classes it never built, which told me what was still unchecked.
- **`declare-look --url … --set app.location=p05 --read … --shot`** was my main way of looking. Screenshots showed the hall reading as a room on the first try, and also caught the blank phone hall and a misplaced ticket carousel.
- **Assert scripts with Playwright locators against the live service** were the best part of the tooling. `expect.request("POST", "/api/orders", { count: 1 })` proved that Enter pressed twice sends one payment. Racing a real outside purchase against our own payment (`buyElsewhere` fired just before the press) produced a genuine 409, which let me test the "seat taken during payment" path end to end. Strict locators failing on ambiguity turned out to be accessibility review I hadn't planned on: they caught "Country" ×2, "Password" matching my "Show password" toggle, and two "Sign in" buttons on checkout.
- **The live-service notes** ("this run failed after talking to … which earlier runs wrote to") correctly blamed the service's state, not the program, when my phone script ran out of free Orchestra seats.

**Where the tools served me less well.**
- **Some layout findings were noisy.** "648 controls smaller than 44 × 44" on a surface built to be zoomed. "Another view takes the presses of" seats that sit clipped outside the room. I suspect the first ignores the scale transform, but I'm not sure.
- **Failure output from `expect.text("app", …)`** printed every seat's name, hundreds of lines.
- **Playwright's surface is partial.** `page.getByLabel(...).evaluate` isn't there, so I rewrote one check.
- **Screenshots of a zoomed drawing can be blurry.** A picture taken right after `settleMotion` was blurry; one taken after a real 2-second wait was sharp. My guess is that redrawing at the new scale happens after the spring arrives, and the settle helpers don't wait for it. That's a guess.

**Not verified:** real on-screen keyboards, real browser autofill, VoiceOver or TalkBack, pinch on a real device, how the choosing ripple looks, and dark mode (which I didn't build).

## Surprises

- How much of the brief the library already covered (Form, `judged`, `purpose`, `concealed`, `keyboardHeight`).
- Disabled controls taking presses.
- `flexes` working only along the layout's axis.
- That the docs predicted, and argued against, my one questionable design call.
- That strict test locators found accessibility bugs no checker had flagged.

## Good and bad

**Good:**
- The constraint model.
- Computed defaults.
- DataSource and EventStream lifecycles held as reactive values.
- Form.
- Springs that can be interrupted.
- Diagnostics that name the fix.
- The verify, look and assert tools working against real services.
- A help tool that answers by name.

**Bad:**
- The literal-versus-brace vocabulary trap, which I fell into repeatedly.
- No route from a record to its view.
- No sticky positioning.
- Some library gaps: Combobox naming, Toast wrapping.
- Help misses with no suggestions.
- Layout checks that don't account for zoom.
- Paths to deep fields that only work if you name intermediate views.

## Compared with what I'm used to

There are no re-renders, no hooks and no dependency arrays, and in this build I didn't miss them. Writing `chosen = [...chosen, id]` and having the total, the Pay label, the seat's look and the accessible hint all update felt more like a spreadsheet than React. There's no CSS, so there was no cascade to fight. The cost is relearning names: `stroke` rather than border, `textColor`, States rather than media queries.

**It reminded me most of QML:** property bindings, `states`, animated property changes and anchor-style positions. Also Flex/MXML and OpenLaszlo, which the README claims as its lineage, and SwiftUI's springs and state. The static analysis of dependencies, which refuses what it can't follow, is stricter than any of those, and I count that as a strength.

## Where I'd most want improvement

1. A supported pattern for dense targets on touch (zoom, magnifier or confirm), so programs don't branch on pointer type.
2. Going from a record to its replicated view, for keyboard grids and focus.
3. Replicating over a computed array without wrapping it in a Dataset.
4. Sticky positioning.
5. Layout checks that understand scale and clipping.
6. "Did you mean" suggestions in `declare-help`, and an entry for `MenuItemRecord`.
7. Shorter failure output from `expect.text`.
8. A short note in declare.md about percentages and enum words inside conditions.

## What I'd use it for

Stateful, interactive apps where data, motion and space meet: booking, scheduling, dashboards, spatial editors, and form-heavy flows. Venue suggests it does well there. I'd hesitate over large teams that need a big hiring pool and a mature ecosystem, and I can't judge its performance at scale beyond the roughly 650 seat controls here, which were fine. For a mostly-content site I'd want more evidence before choosing it over plain HTML.