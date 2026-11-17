# Venue run 37: Opus 5.5, Declare, on the local tree, standard level

The first run after the settle's rounds: `onChange` hears every change in a settle (one call
per round), a handler assigning a value it tracks is refused at compile time, a settle kept
going for 100 rounds stops naming its handlers, and history records once per settle. Also new
since run 36: the run-time color error names its place, and the string→Color refusal names
the schema field type. **25.3 min, 91 turns, 125k output tokens** (58k thinking). Not scored:
the audit is the result. Timing record: `evals/timings/2026-11-15-venue-run37-local.txt`.

## 1. The comparison

| | 34 | 35 | 36 | **37** |
|---|---|---|---|---|
| total | 25.5 | 23.5 | 31.9 | **25.3 min** |
| turns | 100 | 98 | 119 | 91 |
| output tokens (thinking) | 135k (64k) | 120k (52k) | 163k (84k) | 125k (58k) |
| reading · writing · checking | 7.4 · 7.5 · 10.6 | 5.2 · 6.0 · 12.3 | 10.8 · 6.5 · 14.6 | 7.7 · 5.9 · 11.8 |
| tool time · model time | 4.6 · 20.9 | 4.5 · 19.0 | 6.1 · 25.8 | 5.4 · 19.9 |
| verify calls · help · images | 17 · 10 · 17 | 24 · 11 · 18 | 26 · 15 · 29 | 22 · 16 · 16 |
| cache reads | – | 20.6M | 27.6M | 16.2M |
| output per model-minute | 6444 | 6334 | 6325 | 6279 |

- **Back in the range of runs 34–35,** 6.6 minutes faster than run 36, at the same pace. The
  difference is model time (19.9 against 25.8): less reading before the first write (7.7
  against 10.8) and fewer thinking tokens. Fewest turns of the four.
- **No missed names at all** (section 4), a first for Venue.
- **Code:** 1,600 lines in five Declare files, 1,222 without blank and `//` lines (run 36:
  1,973 and 1,448).
- **Download:** 198 KB gzip as a production build, first load (run 36: 205 KB).
- **Checks:** four kept assert scripts — `phone-flow` (the brief's phone journey, a seat taken
  by another buyer on the stream), `desk-keyboard` (the desk journey by keyboard, field checks,
  the refused security code, insufficient funds, Amex), `account` (signing in midway, saved
  cards, a seat lost at payment) and `tour` (screenshots of every screen at desk and phone) —
  and a final run of all three scenario scripts after formatting.

My own work did not share the machine during this run.

## 2. What it built, and findings for the platform

All of the brief: the list of performances (availability in words and a bar, "Nearly sold
out" in bold), the hall drawn as a room (a stage and four sections on widening arcs, rows of
their real lengths, three seat looks told apart by shape), one camera on three springs (fit on
a desk; on a phone a tap flies in, a drag pans, a pinch zooms, "Whole house" flies out), seats
sold to others arriving on an `EventStream` and written into the seat map one seat at a time,
sign-in in a popover (a sheet on a phone), a checkout `Form` whose account-supplied fields are
computed defaults and whose refusals land on the field they name, saved cards in a
`RadioGroup` with the expired one disabled, and tickets in a `Carousel` with a drawn code.

1. **The settle's rounds, in use: nothing fired, and the run-36 warning is gone.** The App's one
   `onChange` (venue.declare:282) tracks `stage`, `perfId` and `liveOpen`, assigns other values
   (`chosen`, `notice`), and on a new `stage` moves focus to the screen's heading through
   `afterSettle`. That is the shape whose second focus move run 36's ring warned about ("'g'
   changed again in the same settle chain"); the warning no longer exists, none of the new
   messages appeared (no compile-time "which it tracks", no "kept one settle going"), and the
   keyboard script confirmed focus lands on each heading. The run neither tested nor needed the
   history change. Evidence that the change costs an ordinary program nothing; the rules
   themselves are covered by `test/change-event.test.mjs`.
2. **"Motion is still in flight" blamed the focus ring — the cause of run 36's open finding 5.**
   Both notes in the run named only the focus ring's springs (`Spring on y of app.8, a
   FocusRing`; `Spring on x, y, width, _rad, opacity, height of app.6, a FocusRing`). The real
   cause was a sign-in form collapsed to 20 px inside a popover (finding 3); the note sent the
   agent the wrong way (account, d14). The focus ring is pure chrome — it never hides or
   reveals what a locator looks for — so its motion should not appear in a locator's failure
   note (`tools/internal/verify-locators.mjs:299`, `inFlight`); `drive.settleMotion()` should
   still wait for it. **Proposal, small:** leave the FocusRing's tickers out of the note.
3. **Overlay content sizing, again** (Murmur 18's finding 2). `SignInForm [ width = 100% ]`
   inside a `Popover` sized by its content collapsed; nothing at compile or boot said so,
   because the popover's content exists only once it opens. The fix was an explicit width.
   Still open: the guide's overlay chapter should say a popover's content brings its own width,
   and the layout check that flags a percentage of a content-sized parent elsewhere should run
   on overlay content when a script opens it.
4. **An Icon nested in a Button is silently misplaced** (account, d15): `back: Button [ …,
   ArrowIcon [ … ] ]` drew at the button's top-left. A control lays out no children; the way
   is `iconLeft`. **Proposal:** a check that refuses a view child inside a `Button` (and the
   other leaf controls), naming `iconLeft`/`iconRight`.
5. **A field the program focused is judged when left.** The sign-in popover focuses Email on
   opening; clicking "Show password" left Email, judged it ("Enter your email address."), and
   the error line moved the checkbox under the pointer (the runtime said so). The brief's rule
   is "only once they have left it"; a field the person never entered or typed in arguably
   hasn't been left. **To decide:** judge on leaving only a field the person typed in or moved
   into.
6. **Small targets by design have no way to say so.** 338 seats under 44 × 44 in the phone
   overview, where a tap zooms rather than picks. The agent left the finding standing. A
   design question (how a control says its press doesn't commit at this size), not a defect.
7. **How a press arrived** (finger, keyboard, screen reader) is what the agent wanted most, so a
   screen reader activating a seat in the overview toggles rather than zooms. It saw
   `App.lastPointerType` and didn't use it; the reference entry could point to this use.
8. **`DECLARE6001` passes TypeScript's "Object is possibly 'null'" through** for a child with
   `exists` (d5). A Declare line — "this child has `exists`, so it may be absent" — would say
   why. To add to the hint tables.
9. **The best diagnostic of the session, by the agent's account:** `width = { cond ? null : … }`
   answered with "a size can't be unset by a value … give it in a State" (d6). And the runtime's
   "DataSource 'placeOrder' was removed while its POST was in flight" (d12) found a real race:
   the app's own purchase came back on the seat stream, emptied the choice and destroyed the
   form.

## 3. Is it idiomatic Declare?

The counts, beside runs 35 and 36 and the to-do app (`idiom.py`):

| | Run 35 | Run 36 | Run 37 | To-do |
|---|---|---|---|---|
| code | 1,274 lines Declare | 1,448 lines Declare | 1,151 lines Declare | 844 lines Declare |
| bytes | 68 KB | 81 KB | 67 KB | 48 KB |
| lines over 150 characters | 8 | 15 | 9 | 3 |
| colour literals outside theme declarations | 2 | 2 | 7 | 1 |
| theme reads | 82 | 116 | 68 | 69 |
| States | 6 | 6 | 5 | 7 |
| visible switches | 5 | 7 | 20 | 0 |
| branches on width or phone | 16 | 34 | 28 | 38 |
| flexes | 17 | 26 | 18 | 7 |
| browser scripts | 0 | 0 | 0 | 0 |
| page lookups | 0 | 0 | 0 | 0 |

**What it gets right.**
- **The shape the docs teach.** The seat map is a `DataSource` subclass that answers every
  question about seats and makes the one write (`markSold`, venue-hall.declare:60–110), applying
  sales that arrive before the map; the stream writes into it with one targeted `set`, so one
  seat's views wake. Where the person is lives on the App (`location` for the performance,
  `waypoint` for checkout, `chosen`, `notice`, `order`), and `stage` derives from them
  (venue.declare:162–173), with the nested choice named as facts after the lint.
- **The checkout leans on `Form` as written:** computed defaults from the account that a
  person's typing replaces (venue-checkout.declare:130–140), `required`/`validate`/`admit`,
  `purpose` on every field, `errorSchema = Refusal`, `refusal()`/`refusedWith()` routing a lost
  seat to the hall and emptying the security code with `judged = false` after a decline.
- **The camera is guide 10's pattern:** targets as constraints, three springs following them,
  a finger writing value and target together (venue-hall.declare:276–306).
- **Accessibility done properly:** seats are `toggle`s with labels and hints, the plane is one
  tab stop (`focusScope = stop`) with arrow bindings, headings take focus on each screen, a
  `Notice` is an assertive live region, `tabOrder()` puts the header first.
- **Theme tokens for everything,** including lists (`tiers`, `floors`) the drawing reads.

**Missteps, with how each should be written.**
- **Twenty visible switches on `stage`.** Each screen is `visible = { app.stage == "…" }`
  (venue.declare:310, 337, 386, 410), and the aside and the phone bar each declare a pair of
  buttons, summaries and notices that switch on `stage` (420–488): a "Continue" and a "Pay"
  where one button's label and action follow the stage would do, e.g.
  `Button [ label = { app.stage == "checkout" ? app.payLabel : "Continue" }, onClick() { app.next() } ]`.
  `LegendMark` likewise draws three children and shows one by `kind` (venue.declare:97–106),
  where one mark with `State`s for "mine" and "gone" says it once.
- **A `Notice` that collapses itself twice:** `height = { message == "" ? 0 : contentHeight }`
  and `visible = { message != "" }` (venue-checkout.declare:62–64). An invisible view takes no
  room in a layout; the height formula goes.
- **Keyboard moves walk `childViews` with casts** (`(s.parent as SeatRowView).childViews as
  SeatButton[]`, venue-hall.declare:344–368). Seat geometry is data (`rowRadius`, `seatX`): the
  next seat along or across can be found from the seat map's records and then focused by id,
  which keeps the handler off the view tree. The agent noted the drift itself.
- **A `Dataset` only to replicate a string array** (`basket: Dataset [ contents = { { ids:
  app.chosen } } ]`, venue.declare:203). The `infos` it already derives (`SeatInfo[]`) could be
  the basket's records, which would also give each line its data without `app.seatMap.info`
  per line.
- **`Seat.status: string`** in the schema (venue-parts.declare:18), compared with `"sold"`
  throughout: `status: "free" | "sold"` lets the compiler check each comparison.
- **A method named `settle()`** on `Hall` (venue-hall.declare:315) for "jump the camera to rest"
  — a word the platform uses for something else; `land()` or `jump()`.
- **Colours on the ticket's dark head are literals** (`#FAF7F2`, `#D9D0C2`,
  venue-tickets.declare:95–97; the STAGE label `#EDE6DA`) beside a theme that has `stage` — an
  `onStage` token pair would keep them with the palette.

**Workarounds the platform forced.**
- The overlay width (finding 3) and the nested icon (finding 4), each found only in a picture.
- Hand-written two-dimensional arrow movement over irregular rows (account, g2).

## 4. Names

**Misses:** none. **Collisions:** none. **Lookups that missed:** none. The first Venue run
with an empty ledger.

**Silent misses** (from section 3): `status: string` for a fixed set; `settle` as a method name.

## 5. The agent's account

Asked after the build by resuming the session read-only (`impressions.txt`); 16k output tokens,
336k cache reads, counted apart from the build's.

# Building Venue in Declare: an account for the people who make Declare

First, one thing about the current state: the dev server I started in the background has since exited (the harness reported exit code 144), so **http://127.0.0.1:8600/my-apps/venue/venue.declare will not load right now**. You asked me not to change anything, so I haven't restarted it. Running `npm start` in `declarelang/` brings it back. The app's files are as I left them.

---

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`, which pointed me to the skill.
2. `skill/SKILL.md`, whole.
3. `docs/declare.md`, whole (943 lines).
4. The four guide chapters the skill names, whole: `01-what-declare-is`, `04-structure`, `05-run-and-check` and `06-layout`.
5. `apps/todo/todo.declare` and `todo-parts.declare`, whole.

After that I stopped reading in full, as the skill says to, and read only by need:
- `14-data.md`: § Where data comes from, § Talking to a server, § Streams, § Editing text and forms (all of it, including A form in a sheet).
- `08-controls.md`: § Text fields, § Choosing one of many, § Keyboard focus.
- `10-touch.md`: § Pan and zoom about the fingers, § Dragging on a scrolling surface.
- `19-accessibility.md`: about the first 120 lines.
- `18-overlays.md`: Popovers through Sheets.
- `07-scrolling.md`: § Fixed headers.
- `20-urls.md`: § waypoint.
- `docs/operational/verify.md`: nearly all of it.
- The sampler's `SignUp` class (found with grep, read as an excerpt).
- `declare-help` for: `Form` (with `--all`), `TextInput` (with `--all`), `Field`, `Combobox`, `DataSource`, `DataSource.credentials`, `EventStream`, `Carousel`, `ChoiceControl`, `Radio`, `Toast`, `Sheet`, `Popover`, `Dialog`, `Spring`, `CheckIcon`, `Icon`, `PinchEvent`, `DrawContext`, `claim`, `focusScope`, `View.tabOrder`, `View.restoresFocusTo`, `ValueControl.judged`, `Control.iconLeft`, `Stream.status`, `App`, "theme tokens" and `SanFrancisco`.

**What I skipped, and why:**
- I never opened the tracker, calendar, weather or birds apps.
- I didn't read guides 09 (pointer and keyboard), 11 (paint and themes), 12 (text), 16 (collections), 17 (your own views), 21 (motion) or 23 (animated arrangements). The exception was the `keyBindings` excerpt from 09.

The skill tells you to stop reading after the core material, and `declare-help` was good enough that I trusted it instead. That was mostly right. It cost me two things I'd have caught by reading:
- **Nesting an Icon inside a Button** isn't how a control takes an icon. That's in `Control.iconLeft`, which I only read after seeing the arrow misplaced.
- **I don't know the default orientation of `ArrowIcon`.** I guessed it pointed right; it points up.

**What taught me the most:**
- **The to-do app.** It showed what idiomatic code looks like:
  - a `DataSource` subclass as the model;
  - `classFor`;
  - a bar pinned to the bottom with `y = end`;
  - `keyboardHeight`-style care (it's in the guide, but the app made it concrete);
  - computed defaults on a form class (`AddForm`).

  I copied its overall structure almost directly.
- **`declare-help Form --all`.** The `refusedWith` and `refusal` entries, and the note about setting `judged = false` on a security code emptied after a decline, read as if written for this brief. Fitting the checkout's refusal handling onto them took minutes.
- **The `TextInput.purpose` table**, which answered the questions about autofill and phone keyboards in one place.

**What was missing or misleading:**
- **Overlay sizing.** Nothing I read says that a child with `width = 100%` inside a `Popover` gets no usable width. The `Popover` example uses fixed widths, but the reference never says that's required. Details are under (d) below.
- **How a drawn control's role reaches the browser.** I set `accessibilityRole = toggle` and only assumed Chrome would expose it as `button` with `aria-pressed`. A test confirmed it. A line mapping roles to ARIA would have saved the guess.
- **The coordinate frame of a `PinchEvent`'s `x`/`y`.** I assumed it was view-local. I never tested a pinch, so I still don't know.

---

## (b) Expressing what I wanted

**Where the language fit what I meant:**
- **The data layer.**
  - The seat map is a `DataSource` subclass that owns `markSold`, `info` and `freeCount`.
  - An `EventStream` (`active`, `listenTo`, `onMessage`) writes sales into the map with one targeted `set([...path], "sold")`, and only that seat's views update.
  - Each seat's view (a `SeatButton` class) reads its own `:status`.

  That's exactly the "the room must not lie" model, written in very few lines.
- **The checkout form.**
  - `Form` with `source`; `Field` with `stacked`; `required`, `validate` and `admit`.
  - Computed defaults for account-supplied values, like `email: string = { app.account?.email ?? "" }`. Signing in halfway through fills only what the person hasn't typed. That is §3's "nothing lost", and I didn't have to write anything special for it.
  - The service's refusals route to a field by `name`: `cvc` and `postalCode` landed on their fields with no code from me.
  - `pending` blocked double payments with no flag of my own.
- **The camera.** It's a plane at native size with `scale`, `x` and `y` read from three `Spring`-driven attributes, plus target attributes. Fly-in, pinch-follow and "Whole house" are all writes to those targets. This is the pattern `10-touch.md` describes, and it carried over directly.
- **Focus after screen changes.** `focusable = quiet` headings plus `afterSettle(() => Focus.focus(...))` from `onChange` on a derived `stage`. A test confirmed focus lands on the heading.
- **`waypoint` for the checkout step**, so Back returns to the hall without putting checkout in the URL.

**Where I had to work around it:**
- **Replicating over a plain string array.** To list the chosen seats, I wrapped them in a derived `Dataset` (`basket: Dataset [ contents = { { ids: app.chosen } } ]`) and replicated over `:ids[]` with `:@`. It works and follows the "children come from data" rule. It's a small detour for "one view per element of this attribute".
- **Arrow-key movement across curved rows of different lengths.** `focusScope = stop` gives a single Tab stop. For moving between rows, I walked `childViews` with casts like `(s.parent as SeatRowView)` and picked the nearest free seat by x position. The desk test confirmed it works. It's still handler code reaching into the view tree, which is close to the "hit-testing by hand" the drift check warns about.
- **Pinning the header.** It paints over the page, so it's declared last, which also puts it last in Tab order. I fixed that by overriding `tabOrder()` on the App to put the header first. That was easy once I found `tabOrder`.
- **Deciding a seat's response by zoom level.** The phone overview needed "a press here zooms; a press there picks". I wrote that as a `canPick` flag based on `app.touchFirst` and zoom, checked inside `press()`. That ignores how the press arrived (finger, keyboard, or screen reader). See (g).

---

## (c) The first time it ran

The first compile (stopping at the type-check rung) failed on three things, then a null check, all in quick succession; they're in (d). Rung 4 (boot) then passed, with 20 findings that phone performance rows were overflowing.

My first screenshots, through `declare-look --url` on the served app, showed these problems. I found every one of them by looking at a picture, except the overflow:

1. **The performance list's arrow pointed up**, because `ArrowIcon` isn't a right arrow.
2. **I'd used the accent colour for decoration** (the weekday and the eyebrow line), against the brief's "one accent colour, and it means something". This was my own second thought on seeing it.
3. **The hall's Orchestra floor was far too wide.** I'd drawn each section as an annular sector using the widest half-angle of any row, and the short front rows sit on a small radius, so they produce a huge angle.
4. **The section labels were unreadable at the desk zoom**: a 15px font at about 0.5 scale.
5. **The hall was small on the desk**, because the plan is taller than it is wide and the legend took its own row.
6. **The back button's arrow sat at the button's top-left**, outside its layout, because I'd nested an Icon as a child.
7. **The phone performance rows overflowed**, as rung 4 had already reported.
8. On the phone, the seats-free count ran off the edge (`declare-look` printed this as a layout line).

Later screenshots showed:
- the sign-in popover's content collapsed on the desk, with its text overflowing;
- the card-number placeholder touching the field's left edge, after I set a padding that left out the left inset.

---

## (d) Every refusal and surprise

**1. A position the layout already decides (`DECLARE2000`).**
- **What I wrote** (TicketsScreen, under `SimpleLayout [ axis = y ]`):
  ```
  deck: Carousel [ width = { Math.min(parent.width, 440) }, height = { app.ticketH },
      datapath = { app.order },
      opacity = { classroot.arrive }, y = { 0 },
  ```
- **What it said:** `Carousel.y — TicketsScreen's SimpleLayout places its children, so this child does not declare its y. Remove it and let the layout place the child, or set 'ignoreLayout = true' on the child to place it yourself. [DECLARE2000] (venue-tickets.declare:157:41)`
- **What I changed:** I removed `y = { 0 }`. It was a leftover from a planned "rise in" animation that I never finished; only the opacity fade remained.
- **Judgement:** my code was wrong. The message was exact.

**2. A bare keyword inside braces (`DECLARE4005`).**
- **What I wrote:** `fontWeight = { classroot.scarce ? bold : regular }`
- **What it said:** `'bold' is one of fontWeight's values — bare only as the whole value (fontWeight = bold); inside { } write it as a string: "bold" [DECLARE4005] (line 74, col 51)`, and the same for `'regular'`.
- **What I changed:** I wrote them as `"bold"` and `"regular"`.
- **Judgement:** my code was wrong. `declare.md` §2 states this rule ("the vocabulary stops at the brace") and I'd read it. It's a habit the rule exists to catch, and the fix in the message was exact.

**3. Choices nested three deep (lint `DECLARE4025`).**
- **What I wrote:**
  ```
  stage: string = { app.order != null ? "tickets"
      : app.perfId == "" ? "list"
      : app.waypoint == "checkout" && app.chosen.length > 0 ? "checkout" : "hall" },
  ```
- **What I changed:** I named the facts, `paying` and `inHouse`, and `stage` now reads them.
- **Judgement:** fair advice. The result reads slightly better. It's a warning, not a refusal.

**4. Redundant parentheses (hint `DECLARE1002`).**
- **What I wrote:** `theme = { ({ ...SanFrancisco, ...Venue }) }` and `contents = { ({ ids: app.chosen }) }`.
- **What I changed:** I dropped the parentheses.
- **Judgement:** I copied `({ … })` from the to-do app, which uses it in method returns (`return ({ … })`). It's harmless, and only flagged in the value position.

**5. A possibly-null view (`DECLARE6001`, TypeScript 2531).**
- **What I wrote:** `if (stage == "tickets") afterSettle(() => Focus.focus(app.ticketsScreen.tickets.top.heading))`
- **What it said:** `Object is possibly 'null'. [DECLARE6001] (line 265, col 67)`
- **Why:** `tickets` has `exists = { … }`, so its type is nullable.
- **What I changed:** I added a null guard.
- **Judgement:** my code was wrong. This one passes through TypeScript's terse wording. A Declare-specific line, such as "this child has `exists`, so it may be absent", would have saved a few seconds.

**6. A size computed as null (`DECLARE6001`, TypeScript 2322).**
- **What I wrote:** `facts: View [ flexes = { app.wide }, width = { app.wide ? null : parent.contentBox("width") }, …`
- **What it said:** `the { } body of 'width' computes a null, but 'width' is typed Length — a size can't be unset by a value. To take the parent's room only sometimes, give it in a State: State [ applied = { … }, width = 100% ] …`
- **What I changed:** `State [ applied = { !app.wide }, width = 100% ]`
- **Judgement:** my code was wrong. This was the best diagnostic of the session: it understood what I was trying to do and named the idiom.

**7. Phone performance rows overflowing (rung 4 layout finding).**
- **What it said**, 20 times: `layout phone 390×844: app.listScreen.col.list.0.info.1.1's text needs 128 wide and has 100 — it runs past its box (wrap is off).`
- **What I'd written:** the availability bar and its words in a horizontal row inside a flexing column.
- **What I changed:** on narrow screens the row stacks vertically (`axis = { app.wide ? "x" : "y" }`).
- **Judgement:** a real bug, found before I'd looked at it. The tool did exactly its job.

**8. Seats below 44pt on the phone (finding at rungs 4 and 5).**
- **What it said:** `338 control(s) smaller than 44 × 44, a finger's target: … plane.bands.0.rows.0.3 11.5×13 …`
- **What I changed:** nothing. It's by design: in the overview a tap zooms in, and seats reach about 42pt before a tap can choose.
- **Judgement:** the platform is right by its own rule but can't know my intent. I didn't find a way to tell it "this control's press doesn't commit at this size". Whether that should exist, I'm unsure.

**9. A button covering seats (rung 5 finding).**
- **What it said:** `1 control(s) another view takes the presses of: … app.hallScreen.main.frame.hall.plane.bands.0.rows.13.6 (by app.hallScreen.main.frame.out). If the cover is meant only for a pointer…`
- **What I'd written:** `out: Button [ visible = { !app.hall.fit }, x = end, y = 10, label = "Whole house", … ]` floating over the hall frame.
- **What I changed:** I moved it into the row of section buttons.
- **Judgement:** a real defect, and the finding was very helpful. This was also, I think, why the first phone run failed to choose the Grand Tier seat, though I didn't confirm that.

**10. Tab order versus position (rung 5 finding).**
- **What it said:** `Tab goes from "Show Balcony, $35.00" (app.hallScreen.main.sections.4) to "Orchestra, row B, seat 10" (…), which sits above it`
- **Why:** when zoomed in, the plane extends above the clipped frame, so seats are geometrically above the section buttons.
- **What I changed:** nothing.
- **Judgement:** benign in my view, but **unsure**. The check might reasonably ignore parts clipped out of view.

**11. Section buttons only 36pt tall (rung 5 finding).** I made them 44pt. The finding was right.

**12. A data source removed mid-request (runtime note during rung 5)** — the most valuable message of the session.
- **What it said:** `the runtime said: DataSource 'placeOrder' was removed while its POST was in flight — the request may still be carried out, but its answer is lost: onLoad and onError will not run. Keep a write's source where it outlives what it sends from (a sheet, a screen).`
- **The code at that moment:**
  ```
  form: Checkout [ exists = { app.chosen.length > 0 } ]
  …
  seatTaken(id: string) {
      seatMap.markSold(id)
      if (chosen.includes(id)) {
          chosen = chosen.filter((s) => s != id)
          notice = seatLabel(id) + " was just taken by someone else. Choose another seat."
          }
      },
  ```
- **What happened:** our own successful purchase was broadcast on the seat stream. The app treated it as someone else taking our seats, emptied the choice, and that destroyed the form and its request.
- **What I changed:** two things. Seat-taken handling is skipped for seats in an order that's in flight (`!(checkout?.pending ?? false)`), and the form now exists for the whole performance (`exists = { app.perfId != "" && app.order == null }`).
- **Judgement:** my code was wrong. Without that note I'd have been staring at a missing ticket screen.

**13. A checkbox moving while pressed (runtime note, account script).**
- **What it said:** `Checkbox moved while pressed (the layout changed during the press, often a field losing focus); the press was carried to it — keep a pressed control in place`
- **Cause:** the sign-in popover focuses the empty Email field when it opens. Clicking "Show password" makes Email lose focus, so it gets judged ("Enter your email address.") and the error line pushes the checkbox down.
- **What I changed:** nothing.
- **Judgement: unsure.** I think the platform could be gentler. The person never chose to enter that field, so marking it wrong on leave feels harsher than the brief's "only once they have left it". It's defensible by the letter of the rule, though.

**14. A dialog button "not shown" (rung 5 failure, desk tour).**
- **The code:**
  ```
  class SignInForm extends Form [ width = 100%, source = { classroot.session }, …
  signInPop: Popover [ width = 380, accessibilityLabel = "Sign in", …
      SignInForm [ exists = { app.signInPop.present } ] ]
  ```
- **What it said:** `page.getByRole("dialog").getByRole("button", { name: "Sign in" }) found <div role=button> "Sign in", which is not shown — motion is still in flight on the program's clock, which the script holds (Spring on y of app.8, a FocusRing): let it land first (drive.settleMotion())`
- **What the screenshot showed:** the fields collapsed to about 20px wide and the text overflowing the popover. The phone version, presented as a sheet, looked fine.
- **What I changed:** an explicit width on the form (`width = { app.wide ? 340 : app.width - 40 }`) and no width on the Popover.
- **Judgement:** most likely my error: `100%` inside a container sized by its content. But **the diagnostic pointed the wrong way** (motion in flight), and nothing at compile or boot flagged the circular size the way rung 4 does elsewhere. That's probably because the popover's content only exists once it opens. **Unsure** whether the cause is exactly that.

**15. Button icon misplaced and arrow pointing up (seen in screenshots, no message).**
- **The code:** `back: Button [ …, ArrowIcon [ iconSize = 14, rotation = 180, pivotX = 7, pivotY = 7, ink = … ] ]`
- **What I saw:** the icon at the button's top-left, pointing up/down rather than left.
- **What I changed:** `class BackChevron extends ChevronIcon [ dir = "left" ]` with `iconLeft = "BackChevron"`.
- **Judgement:** my code was wrong. The platform could warn when a child is nested inside a control that doesn't lay out children. `declare.md` §11 says a control is a leaf, but I didn't connect that.

**16. Results that weren't what I wrote them to do:**
- **The expiry check's order** (found by a test). Typing `13` and leaving should report a bad month. My `expiryProblem` checked "fewer than 4 digits" first, so it said "Enter the expiry as MM / YY." I moved the month check first. My logic was wrong.
- **Wrong expected total in my own test.** I asserted `Pay $244.00`; the right figure is $245.00 (80+80+65 plus fees of 7+7+6). The test was wrong, not the app.
- **The lost-seat-at-payment (409) test.** My first version bought the seat from outside and *then* pressed Pay. The stream delivered the sale first, so the app correctly removed the seat, showed the notice, and paid for the remaining one. I rewrote the test to start the outside purchase and press Pay while it's still in flight. The app was right; the test was naive.

**17. Not Declare's doing:** the dev server chose port 8600 because 8200 was taken, and it was later killed by my harness's background time limit (twice, counting this last exit).

---

## (e) Verifying it

**The checks and what each caught:**
- **The ladder at the type-check rung (`--rung=3`)** after every edit. It caught all the refusals in (d) items 1–6 within seconds.
- **The boot rung (`--rung=4 --phone --desktop`)** caught the phone row overflow.
- **`declare-look --url … --click … --shot`** gave pictures. It caught every visual problem in (c). Clicking by view path (`app.listScreen.col.list.0`) and `--click-at` worked well.
- **Assert scripts (rung 5) against the served app**, since the service's cookie and live seat stream need a real origin:
  - `phone-flow.mjs`: the §10 phone scenario.
  - `desk-keyboard.mjs`: keyboard-only booking with no account, then every refusal path.
  - `account.mjs`: signing in mid-hall, autofill tokens, reload keeping the session, sign-out.
  - `tour.mjs`: screenshots of every screen at either size.

  Between them they caught the two real logic bugs (the own-purchase race and the expiry order), the covering button, and the small section buttons.

**How well the tools served me: very well.**
- The scripts accepted Playwright-style locators by role and name, which matched how the brief's tester will work.
- `drive.read`, `drive.requests()`, `drive.waitReal` (for the real-time stream) and `drive.settleMotion` each solved a real problem.
- The notes "a run that fails after earlier runs wrote to the same service" and "fed a sample of their schema at boot" were thoughtful.

**Costs:**
- Each script run took one to two minutes.
- Output is long. I filtered it with grep to drop the repeated 11.5×13 seat findings.
- The `--url` mode was essential, and I only found it by reading `verify.md` closely.

**What I didn't check at all:**
- pinch, drag-to-pan, wheel zoom;
- carousel swiping;
- `keyboardHeight` lifting the bar;
- dark mode (there's no dark theme);
- widths between phone and 1280, such as a tablet or a narrow desk window;
- the service's own postcode refusal (only my client-side check was tested);
- the `signed_out` refusal;
- the "Paying…" label while a payment is in flight;
- whether `Spring.arrive()` stops the camera visibly flying in when the hall first appears (screenshots were taken after `settleMotion`, so they wouldn't show it).

---

## (f) Confidence, part by part

- **§1 choosing a performance: high.** It's tested by name and the screenshots look right.
- **§2 the hall as a room, the three seat states, the exact summary, seats taken live: high on the desk, medium-high on a phone.**
  - Live taking is tested end to end with a real outside purchase.
  - **Main risk:** on a phone the first tap on a seat zooms rather than choosing it. A tester reading "pick the exact seat they mean, first time" may count that as a failure, even though no tap ever chooses the wrong seat.
  - **Real accessibility defect, I expect:** a phone screen reader activating a seat in the overview gets a zoom, not a toggle.
- **§3 signing in: high** for the email and password fields, show-password, the service's sentence, the reload, sign-out, saved cards and the expired card.
  - **Risk:** while the sign-in dialog is open in checkout, two "Email" fields and two "Sign in" buttons exist. I confirmed the page behind is hidden in the hall (only one "Email" was found), but only scoped my checkout test to the dialog. A test that searches the whole page in checkout could hit an ambiguous match.
- **§4 paying: high** for validation, refusals, the single payment and the exact Pay label. **Medium** for the phone keyboard and autofill, which I built to be right but can't prove headless.
- **§5 tickets: high** for content and stepping one at a time with the buttons; swiping is untested.
- **§6–7 look and feel: fairly good by my eye.**
  - I dropped the "darker rings are dearer seats" caption when I merged the legend into the heading line, so the price ramp is now only implied by the ring tones.
  - The 860–1100px range was never looked at.

---

## (g) Gaps I worked around

1. **A zoomable pane.**
   - **Wanted:** a scroll view with a zoom level, like UIScrollView.
   - **Looked:** `10-touch.md` § Pan and zoom, `claim`, `scrolls`.
   - **Did instead:** my own camera — springs, `look()` clamping, pinch maths.
   - **Judgement:** I think the platform lacks this as a ready-made part, and the guide presents the hand-written pattern as the way. Unsure whether something exists that I didn't find.
2. **Arrow-key movement across rows of different lengths.**
   - **Wanted:** a two-dimensional "nearest neighbour" for a stop's arrow keys.
   - **Looked:** `focusScope`, and Table/DataGrid's active-item model.
   - **Did instead:** `along` and `across` walking `childViews`.
   - **Judgement:** probably genuinely missing for irregular layouts. Moderately unsure.
3. **How a press arrived.**
   - **Wanted:** to know whether a press came from a finger, the keyboard or a screen reader, so the overview could zoom for fingers but toggle for keyboard and screen-reader users.
   - **Looked:** I saw `App.lastPointerType` in the `App` member list but didn't explore it.
   - **Did instead:** used `touchFirst` plus zoom.
   - **Judgement:** it may be there and I didn't use it. This is the gap I'd most want to close.
4. **Writing a record by its id.**
   - **Wanted:** "set the record whose id is X" in a nested dataset.
   - **Did instead:** found each index with `findIndex` and built the path for `set(...)`.
   - **Judgement:** didn't look for it. Unsure.
5. **Choosing a country.** The platform has no native dropdown; `declare-help` said so explicitly and pointed to a menu button or Combobox. I used Combobox with `purpose = country`. That's not really a gap; I just didn't verify that browser autofill picks a country into it.
6. **Telling the layout checker a small target is intended.** I wanted to mark the overview seats as deliberately small and found nothing. Unsure whether such a mark exists or should.
7. **Treating a 401 from `/api/me` as "signed out".** Done as `me.loaded && !me.failed`, plus `clear()` on sign-out. It works and isn't really a gap.

---

## (h) Changes of direction

All of these were made before I finished.

| What it was | What it became | When | Why |
|---|---|---|---|
| Floating "Whole house" button over the hall | A button in the section row | Mid-testing | Rung 5's "takes the presses of" finding |
| `Checkout [ exists = { app.chosen.length > 0 } ]` | `exists = { app.perfId != "" && app.order == null }`, plus the guard for seats in flight | Mid-testing | The runtime's "removed while its POST was in flight" note |
| Sections drawn as annular sectors using the widest angle | A polygon following each row's ends | First screenshots | What I saw running |
| Geometry ROW 1.18, GAP 2.0, FRONT 5.2; labels 15px | 1.12, 1.85, 5.0; labels 21px | First screenshots | Plan too small on the desk |
| Legend on its own row, with a price-ramp caption | Merged into the heading line; caption dropped | First screenshots | To give the plan more height; losing the caption was a side effect |
| Arrow icon nested in the back button | `iconLeft = "BackChevron"` | First screenshots | Seen running |
| Accent on weekday and eyebrow | Muted ink | First screenshots | My own reading of the brief |
| Availability bar and words in a row | Stacked on a phone | First boot | Rung 4 finding |
| Nested-choice `stage` | Named facts | First compile | Lint |
| Expiry check: length first | Month first | Desk test | Test failure |
| `width = 100%` on the sign-in form, Popover 380 wide | Explicit form width, Popover sized by content | Desk tour | Screenshot |

Also during planning, before writing code:
- A Toast for "seat taken" became a persistent `Notice` banner in a live region, because the message must stay visible.
- Custom card tiles in a `ChoiceControl` became a `RadioGroup`, because radio buttons are the expected way to pick a payment card.

At the end I added refetching the map when the stream reconnects, plus reconciling the choice against it. That was my own second thought, and **it's untested**.

---

## (i) The code, quoted

The refusals, findings and runtime notes are quoted with their code under (d) items 1–6, 9, 12, 13 and 14. One more thing I couldn't fully explain is the first phone-run failure:

`expect(page.getByText("3 seats · $225.00")).toBeVisible() — got no element (after 5 s) — at tests/phone-flow.mjs:64 (after: settleMotion → press at (132, 228) → settleMotion)`

At that point the Grand Tier seat chosen by the test was in row A, while `flyToSection` centres the section's *middle* row. The covering "Whole house" button sat at `y = 10` in the frame. I believe the press landed on the button, or on a seat clipped out of view, but **I didn't confirm which**. I changed both the test's choice of seats and the button's position at the same time, so this one isn't isolated.

I never went round in a circle; every fix held on the next run.

---

## Overall

**Surprises:**
- How much of checkout was already in the library: refusals routed to fields, the decline note about `judged = false`, and sending once while `pending`.
- That a live seat stream needed about ten lines.
- That the runtime notices a data source being destroyed while its request is in flight and tells you in plain words.

**Good:**
- Compiler messages that name the fix.
- `declare-help` as the true reference.
- The verify ladder and the assert scripts by role and name.
- `purpose` for autofill and keyboards.
- Springs on a few numbers for all the motion.
- Computed defaults as a model for "the person's value replaces the suggestion".

**Bad:**
- No warning when an Icon is nested inside a control.
- Width collapse inside an overlay, invisible until the overlay opens, and then a misleading diagnostic.
- No way to tell the layout checker that small targets are intentional.
- Run-to-run output is long and repetitive.

**How it differs from what I know:** it's closest to QML and to OpenLaszlo's own descendants (Flex MXML): constraints instead of re-rendering, states as reversible overrides, layout as an object. From SwiftUI it takes the feeling that controls do the right thing by default. It's unlike React: there was no state-synchronisation code anywhere in this app.

**What I'd most want improved:**
1. Knowing how a press arrived (finger, keyboard, screen reader).
2. A focus model for irregular two-dimensional arrangements of controls.
3. A zoomable pane.
4. Size diagnostics for overlay content.

**Sharpest edge:** not one obstacle but a pattern. Problems in states that exist only after interaction — the overlay's content width, our own purchase coming back on the stream, the covering button — are invisible to the compiler and to boot, and appear only once a script drives there. The tools say this honestly, and the scripts caught all three. It cost perhaps a quarter of the session. Having it right the first time would have needed either a static check for "child sized from a parent sized by its content" inside overlays, or my own foresight about the stream echoing our own purchase.

**What I'd use it for:** exactly this kind of app — form-heavy, with live data, a custom drawn surface, and phone and desk from one source.
## 6. The names ledger

```
NAMES — eval-venue-37: 0 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)

SUMMARY: 0 of 0 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
