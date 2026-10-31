# Venue run 16: Declare f62e9876, Opus 5.5

**Run:** 2026-10-30, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-16 claude-opus-5-5 f62e9876` against GitHub main,
alongside Cadence run 21. It validates two fixes to the tools, neither of them to the language:
- **verify waited out every settle.** Venue's seat stream is an `EventStream` with `credentials = include`, so the
  runtime opens it with `fetch`, and verify counted that never-ending request as pending. Every `settleData` waited
  its full 10 s.
- **`npx` audited every call against the npm registry.** Each `declare-help` and `declare-verify` call reinstalled
  the package into npm's exec cache and sent an audit request over the network. The repo's `.npmrc` now turns the
  audit off.

**Files beside this report:**
- the app's five files and its four assert scripts (`tests/`);
- the hidden acceptance result (`drive/`);
- the questions it was asked (`impressions.txt`, `layout-question.txt`).

Its account and its answer to a follow-up on layout are at the end of this report, word for word.

## The comparison

| | Venue 14 | Venue 15 | **Venue 16** | React 1 |
|---|---|---|---|---|
| Declare commit | `6aedaaa0` | `3cc1d76c` | **`f62e9876`** | — |
| time | 31.2 min | 38.1 min | **25.2 min** | 31.4 min |
| turns | 130 | 125 | **110** | 101 |
| code, raw lines (files) | 1,701 (2) | 1,653 (5) | **1,817 (5)** | |
| code, excluding blanks and `//` lines | 1,333 | 1,272 | **1,407** | |
| output tokens | 138.6k | 123.1k | **120.5k** | |
| cached input re-read | 29.9M | 26.2M | **23.7M** | 9.3M |
| first app write at | 8.1 min | 5.9 min | **8.2 min** | |
| tool time | | 20.3 min | **5.7 min** | |
| model time | | 17.8 min | **19.5 min** | |
| thinking (reading · writing · checking) | | 4.0 · 1.9 · 4.0 = 9.8 min | **5.5 · 1.4 · 3.0 = 9.8 min** | |
| verify calls · their time | | 30 · 16.3 min | **25 · 4.1 min** | |
| `declare-help` calls · their time | | 23 · 0.9 min | **18 · 0.5 min** | |
| hidden acceptance | 11 of 11 ¹ | 11 of 11 | **11 of 11** ² | 11 of 11 |
| library or runtime source read | 6 | 5 | **4** | |
| workarounds | | none | **none** | |

¹ On the fixed kernel. ² After a fix to the hidden drive (below).

"Tool time" is from each tool call to its result; "model time" is everything else. "Thinking" is the stream's
`thinking_duration_ms`, assigned to a phase by when it happened: reading is before the first app write, writing
runs up to the first verify after it, and checking is the rest.

## What the fixes did

**Tool time fell from 20.3 to 5.7 minutes**, and the run from 38.1 to 25.2. Verify averaged 33 s a call in run 15
and 10 s in run 16. Its five-check loop took 181 s in run 15; replayed against run 15's app with the fix, it took
58 s. No settle waited out its time.

**Model time didn't fall.** It was 19.5 minutes against 17.8, and thinking was 9.8 minutes in both runs. Model time
is now the larger part of the run: about three-quarters of it.

## Correctness

The app passes all 11 hidden flows. The first scoring failed `phone_guest_pays` ("never shown: 2 seats · $160.00").
The cause was the drive, not the app:
- On a phone, while seats are smaller than a thumb, the app's first tap on the hall zooms in and the next one
  chooses. The brief itself calls this the hard case ("at true scale a seat is too small to hit").
- The drive assumed one tap per seat, so its first tap only zoomed in, and seat 1 was never chosen.
- The drive now finds the seat again and taps it again when a seat that reports its chosen state isn't chosen yet,
  as a person would. With that change all 11 pass. Run 15's app still passes all 11.

## What the agent said

### The account

The account was largely positive. It said the reference fit the brief "unusually well" (`TextInput.judged`,
`Form.refusedWith`, `purpose`), and that "nothing typed is lost on sign-in" took only a computed default. It had
three complaints:
- It called responsive layout and axis switching "the steepest part of the language".
- It found no supported way to get from a record to the view replicated for it.
- The layout checks raised false alarms on the zoomable hall.

### The follow-up on layout

A remark like "the steepest part" can name one roadblock or a gap in the model, so the agent was asked to go
through it in detail. Its answer withdrew the remark:

> "The steepest part of the language" overstated it. A more accurate description: this is where my CSS habits were
> most wrong and where I had read the least.

It **never read `06-layout.md`** during the build. SKILL.md's "Then stop reading" and its belief that it already
knew flexbox kept it from treating layout as "a part that needs it". By its own account the chapter answers almost
everything it struggled with:
- the page-frame example;
- the paragraph that stretch "still holds when a constraint turns the row into a column";
- `State` for a configuration that holds at some widths;
- a layout of your own when "where the room goes" changes.

Three of its four layout errors came from one rule: what a layout decides, the child doesn't declare. Each
diagnostic named a fix that worked.

What it says remains, in its own order:
1. **Under a reactive axis, the rule is caught only at boot, and only in the state that booted.** It suggests a
   compile-time rule: under a computed axis, a child declares neither width nor height.
2. **No way to say "unset" from a constraint.** It notes this is documented (use a `State`); it was surprising, not
   missing.
3. **Sticky inside a layout is missing.** `ignoreScroll` pins only against the view's own scroller.
4. **Unclear: fixed-height screens beside scrolling ones in one App.**
5. **A diagnostic slip:** the no-percentages hint suggested `parent.width` for a height.

## Fixed after this run (585c768d)

- **Layout checks** judge a finger's target at its size on screen, and skip a control that lets presses through or
  that a clipping view cuts off. On this app, "648 controls smaller than 44 × 44" is gone. What remains is a real
  finding: a few seats under the floating "Whole hall" button when zoomed in.
- **The layout refusal of a child's size** names both ways to fill: `flexes` along the flow, `align = stretch`
  across it. That was its item 7.3.
- **The no-percentages hint** reads the parent's height for a vertical slot (its item 5).
- **A `Combobox` last in a form:** with its list closed and a choice made, Return now submits, under `enterMoves`
  too.
- **`declare-help`** lists members that share a word's stem, so `View.children` names `childViews`.
- **`Form.refusedWith`** now says an override may type the body with a schema. That already worked; the agent cast
  to `any` because nothing said so.

## Open

- **Discoverability of `06-layout.md`.** The agent's first suggestion is that the first read carry the page-frame
  example and the stretch paragraph (SKILL.md's list or `declare.md` §4). This is a question about the docs, and it
  bears directly on whether agents keep their CSS habits.
- **A compile-time rule for children of a layout whose axis is computed.**
- **Sticky positioning.** It was asked for in runs 15 and 16.
- **A content-sized view with a cap, outside a layout.** `maxWidth` bounds only what a layout gives a child, so a
  floating view can't be "as wide as its content, up to the window less a margin". That is why `Toast` can't wrap
  on a phone; runs 14, 15 and 16 all hit it. This is a gap in the model, not a `Toast` bug.
- **Finding the view replicated for a record.** It was asked for in runs 15 and 16, and passed over before.

## The agent's account, verbatim

Asked after the build by resuming the finished session with read-only tools and the standard questions (`impressions.txt`).

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

## Follow-up on layout, verbatim

Asked in the same resumed session:

> Another request separate from the build — please don't change anything; read whatever you like.
>
> In your account you wrote that responsive layout and axis switching is "the steepest part of the language". The people who make Declare want to understand exactly what that was, because a remark like that can mean one particular roadblock or something deeper in the model, and the two call for very different responses.
>
> Please explain it in detail, from your memory of the build and from the files as they stand:
>
> 1. What you wanted, in plain terms, for each place it came up (the hall page, the checkout, anything else): the arrangement on a desk, the arrangement on a phone, and what had to fill, scroll or stay fixed.
> 2. What you wrote first, and why — what model of Declare's layout you were working from at that moment, and where it came from (which doc, example or habit).
> 3. Each attempt in order: what you wrote, what the compiler, the boot check or the screen told you (quote the messages as closely as you can), what you concluded, and what you changed.
> 4. What you ended with, and whether you believe it is the intended idiom. Quote the final code.
> 5. Your judgement: was this one roadblock, several unrelated ones, or a gap in the model itself? If it is a gap, say what is missing as precisely as you can — a capability, a rule you could not find, a rule that surprised you, or a rule that exists but is hard to apply. If you think the docs did cover it, say where, and why you did not find or did not trust it.
> 6. How it compared with what you expected going in, and with how you would have done the same thing in the platforms you know best.
> 7. What, specifically, would have let you write it right the first time.
>
> Please be concrete and precise rather than general, and say where you are unsure.

The answer:

I made no changes. To answer this I re-read the final code in `venue.declare` and, for the first time, `docs/guide/06-layout.md`. That second fact shapes the answer: **I never read the layout chapter during the build, and it covers almost everything I struggled with.** "The steepest part of the language" overstated it. A more accurate description: this is where my CSS habits were most wrong and where I had read the least. A few real rough edges remain, and I separate them out in section 5.

## 1. What I wanted

**The hall page (the seat map)**
- **Desk:** a top bar, then a row: the seating plan filling all remaining width and height, and a fixed 380-wide side panel beside it. The side panel scrolls on its own if it is too tall. The page itself shouldn't scroll.
- **Phone:** a column. A one-line header with the performance, then (only after a failed payment) a notice, then the plan filling all remaining height, then a bar pinned at the bottom with the seat key or "3 seats · $240.00" and Continue.
- **The difference between them:** the side panel and the bottom bar are different children with different content, not the same child moved.

**The checkout**
- **Desk:** a centred block up to about 1000 wide holding two columns. The form column takes the rest of the width; the 360-wide order summary stays beside it the whole way down while the long form scrolls.
- **Phone:** one column: the summary at the top, then the form, with the page scrolling. A bar pinned to the window's bottom holds the total and Pay.

**Smaller cases**
- Expiry and security code side by side at equal widths. Postal code and country the same.
- The list and ticket screens: a centred column of capped width (no difficulty there).

## 2. What I wrote first, and why

From `venue.declare` as I first wrote it, the hall screen was:

```
hallScreen: View [ ..., height = { app.height - app.barH },
    layout: SimpleLayout [ axis = { app.phone ? "y" : "x" } ],
    phoneHead: View [ visible = { app.phone }, width = 100%, ... ],
    notice: FormError [ ... ],
    mapArea: View [ flexes = true, height = { app.phone ? 0 : 100% }, ... ],
    side: View [ visible = { !app.phone }, width = 380, height = 100%, scrolls = y, ... ],
    phoneBar: View [ visible = { app.phone }, width = 100%, ... ]
```

The checkout columns were:

```
cols: View [ x = center, width = { Math.min(980, parent.contentBox("width")) },
    layout: SimpleLayout [ axis = { app.phone ? "y" : "x" }, spacing = { app.phone ? 24 : 48 } ],
    formCol: View [ width = { app.phone ? parent.width : 0 }, flexes = { !app.phone }, ... ],
    summaryCol: View [ visible = { !app.phone }, width = 360, ... ]
```

The paired card fields were `PayField [ width = 0, flexes = true, ... ]`.

**The model I was working from** was flexbox with Declare's spelling:
- `flexes` is `flex: 1`.
- `width = 0` next to `flexes` is the `flex-basis: 0` trick for equal shares.
- `100%` across the flow is `height: 100%`, or flexbox's default `align-items: stretch`.
- `height = { app.phone ? 0 : 100% }` came from "in a column the flex decides height, so put a placeholder; in a row, fill."

The Declare part of the model came only from `docs/declare.md` §4, "Layout is an attribute". I had read its sentence that a layout places its children "and what it places a child does not declare", and that "`align = stretch` makes what its content would size fill the view across". I didn't apply either. I also wrote `100%` inside braces even though §2 says outright that `width = { 100% }` is a syntax error. That was habit beating what I had read.

**Why I didn't read `06-layout.md`:** SKILL.md says "Then stop reading. Everything else is read when you reach the part that needs it." I felt I already had the layout model, so I never treated layout as "a part that needs it." SKILL.md's table does point at `06-layout.md` and at the weather app's `desk: State [ applied = { !app.phone } ]`. I skipped both.

## 3. The attempts, in order

**Attempt 1: first compile of the whole program.** R1 (structure) reported, among other unrelated errors:

> `PayField.width = { … } is not a valid expression — there are no percentages: read the parent and scale, so 100% is { parent.width * 1 } [DECLARE2000] (venue-pay.declare:147:32)`

That came from `width = { app.phone ? 100% : 220 }` on the saved-card code field.

> `PayField.width — View's SimpleLayout sizes its children, so this child does not declare its width — it flexes, so the run gives it its width: the room left, shared among the children that flex. Remove the width to let it flex, or remove 'flexes' to keep its own width. — 4 sites, also on lines 206, 230, 236 [DECLARE2000] (venue-pay.declare:195:28)`

That came from my `width = 0, flexes = true` pairs.

> `View.height = { … } is not a valid expression — there are no percentages: read the parent and scale, so 100% is { parent.width * 1 } [DECLARE2000] (line 250, col 49)`

That was the hall's `mapArea` height. The suggested rewrite names `parent.width` for a height. It's a small slip in the message, but it made me pause.

What I concluded and changed:
- For the paired fields, the message was exactly right. I removed `width = 0` and they shared the room equally.
- For the saved-card field, I used `{ app.phone ? parent.width : 220 }`. It sits in a y-flow, so the layout doesn't decide its width.
- For the hall, I decided I shouldn't size those children on either axis. I added `align = stretch` to the hall's layout and removed `width = 100%` from `phoneHead` and `phoneBar`, `height = …` from `mapArea`, and `height = 100%` from `side`. That came from remembering the §4 sentence about stretch, and from the "does not declare its width" message I had just seen. The hall never gave another layout error, and both screenshots (desk and phone) were right the first time after that.

**Attempt 2: checkout columns.** R1 to R3 passed. R4 (boot) failed:

> `boot: View.width (line 326, col 37) — View's SimpleLayout sizes its children, so this child does not declare its width; remove it and let the layout size the child, or set 'ignoreLayout = true' on the child to size it yourself.`

This was `formCol`'s `width = { app.phone ? parent.width : 0 }` together with `flexes = { !app.phone }`. It was the same rule as attempt 1, but caught only at boot, I assume because `flexes` and `axis` were constraints the compiler couldn't settle. I applied the fix I had just learned: removed the width and added `align = stretch` to `cols`. It booted, and on a phone the form column filled the width. The message offered "remove it" or `ignoreLayout`. The fix I actually needed, stretch for the across axis on a phone, wasn't among its suggestions. I already knew it by then.

**Attempt 3: keeping the summary in view on a desk.** No error was involved; this was a design gap I noticed once the checkout worked. The page scrolled as a whole, so the summary scrolled away. I read `07-scrolling.md` § "Fixed headers: `ignoreScroll`". It says a pinned view must be a direct child of the scroller. Pinning the summary would have meant moving it out of its column to the App and placing it by hand at the column's x. I rejected that. Instead, on a desk only, I gave the checkout screen a fixed height and made the form column its own scroll pane. "Only on desk" couldn't be written as a constraint: I needed "a fixed height on a desk, sized by content on a phone", and I found no value that means "unset". So I used `State`. It compiled and booted clean, and the screenshot showed the form column scrolling with the summary standing still.

## 4. What I ended with, and whether it's the idiom

The hall, from `venue.declare` lines 279–374, condensed:

```
hallScreen: View [ visible = { app.step == "hall" }, width = 100%, height = { app.height - app.barH },
    accessibilityRole = main,
    layout: SimpleLayout [ axis = { app.phone ? "y" : "x" }, align = stretch ],
    phoneHead: View [ visible = { app.phone }, padding = [4, 10, 4, 4], ... ],
    notice: FormError [ visible = { app.phone && app.notice != "" }, ... ],
    mapArea: View [ flexes = true,
        padding = { app.phone ? [0, 0, 0, 0] : [24, 24, 24, 24] },
        map: HallMap [ width = 100%, height = 100%, ... ],
        ... ],
    side: View [ visible = { !app.phone }, width = 380, scrolls = y, ... ],
    phoneBar: View [ visible = { app.phone }, padding = [12, 18, 16, 18], ... ]
    ],
```

The checkout, lines 378–403:

```
payScreen: View [ visible = { app.step == "pay" }, width = 100%, accessibilityRole = main,
    padding = { app.phone ? [20, app.gutter, 220, app.gutter] : [0, app.gutter, 0, app.gutter] },
    State [ applied = { !app.phone }, height = { app.height - app.barH } ],
    cols: View [ x = center, width = { Math.min(1000, parent.contentBox("width")) },
        State [ applied = { !app.phone }, height = { parent.contentBox("height") } ],
        layout: SimpleLayout [ axis = { app.phone ? "y" : "x" }, spacing = { app.phone ? 24 : 48 }, align = stretch ],
        formCol: View [ flexes = { !app.phone },
            State [ applied = { !app.phone }, scrolls = y, padding = [40, 12, 80, 4] ],
            ... ],
        summaryCol: View [ visible = { !app.phone }, width = 360, padding = [92, 0, 0, 0],
            OrderSummary [ ] ]
        ]
    ],
```

The phone's pay bar (lines 407–408) is a child of the App with `ignoreScroll = true, ignoreLayout = true, y = end`. That is the guide's pattern and worked the first time.

**Is it the intended idiom?** Partly. Now that I've read the chapter:
- **Matches the guide:**
  - `align = stretch` with `flexes` is `06-layout.md`'s "page frame" example (lines 124–137), which is nearly my hall on a desk.
  - Lines 147–150 say stretch "still holds when a constraint turns the row into a column on a narrow screen". That is precisely my case.
  - `flexes = { !app.phone }`, `axis = { … }`, and a `State` for "a configuration that holds at some widths" are all named at lines 237–241.
- **Probably not what the authors would write:**
  - Lines 243–250 say that when what changes is "where the room goes — a panel beside the main view on a wide screen, a strip under it on a narrow one, the main view taking what is left either way", the answer is a layout of your own. That describes the hall exactly. I used two different children shown and hidden with `visible`, plus an axis switch. It works, but by the guide's own words it isn't the idiom. The checkout is closer to "only the direction changes", so it's probably fine.
- **Where I'm unsure of the idiom:**
  - `height = { app.height - app.barH }` on the hall and checkout screens is arithmetic over siblings, which the skill's drift check names as a smell. The page-frame example would give the screens `flexes = true` under an App with a y layout. But my App also scrolls (`scrolls = y`) for the list and the phone checkout, and I don't know what `flexes` means inside a scrolling App whose other screens are taller than the window. I hand-computed it instead.
  - `scrolls = y` set inside a `State` worked in the screenshots, but I didn't find it shown anywhere.
  - `summaryCol`'s `padding = [92, 0, 0, 0]` is a magic number to line the card up with the "Checkout" title. That is hand placement by another name.
  - `app.phone` reads the window width. `ResponsiveLayout` reads the view's own width, which the guide says lets plans nest. For whole screens it's equivalent here, but it isn't the more composable choice.

## 5. Judgement: one roadblock, several, or a gap?

**Mostly several small roadblocks with one root cause:** carrying flexbox habits over, combined with not reading the chapter that corrects them. The one rule, that whatever a layout decides the child doesn't declare, was behind three of the four errors (`width = 0` with `flexes`, `100%` across the flow, and the boot-time `formCol` width). The diagnostics were good, and each fix worked. The docs covered all of it, in `06-layout.md`. I didn't find it because I didn't look, not because it was hidden or untrustworthy.

What remains is real but smaller:
1. **A rule that's hard to apply when the axis is reactive.** With `axis = { … }`, which of a child's dimensions the layout decides flips with the condition. The compiler can't see that, so the error arrives at boot (R4), and only for the state that booted. My final `--phone --desk` run was clean, so both states got checked in the end, but the default laptop boot can't speak for the phone. A compile-time rule would catch it every time: "under a reactive axis, a child declares neither width nor height; use `flexes`, or `align = stretch` for across."
2. **No way to say "unset" from a constraint.** A size that is fixed in one condition and content-sized in the other needs a `State`. `06-layout.md` does point to `State` for configurations that hold at some widths. So this is a documented rule that surprised me, not a missing capability.
3. **A missing capability: sticky inside a layout.** Keeping a column's content in view while the page scrolls past it is CSS `position: sticky`. `ignoreScroll` only pins against the view's own scroller, and the guide says it must be a direct child of that scroller. My workaround, making the column the scroller, is legitimate, but it changes the page's scrolling model just to keep one card in view.
4. **One unclear rule:** fixed-height screens beside scrolling screens in one App. I couldn't find what the intended form is.
5. **A diagnostic slip:** the no-percentages message suggests `{ parent.width * 1 }` for a height.

## 6. Compared with what I expected, and with other platforms

I expected flexbox semantics:
- Stretch across by default.
- A declared size as a starting point the layout may override.
- `100%` meaning "fill" on either axis.

Declare is stricter. Stretch is opt-in, and a declared size isn't negotiated with the layout; it's refused. Once I understood that, it was easier to reason about than flexbox, because there's one decider per value and no `min-width: 0` puzzles.

**How I'd have written it elsewhere:**
- **CSS:**
  - The hall: `display: flex` with `flex-direction: column` inside a media query, `flex: 1` on the map, the side panel shown on desk and the bar on phone. About the same code.
  - The checkout's summary: `position: sticky; top: 24px`, one line where I restructured the scrolling.
  - The screen height: `height: calc(100dvh - var(--bar))`, the same arithmetic I wrote, without any sense that it was a smell.
- **SwiftUI:** `HStack`/`VStack` chosen by horizontal size class, `.frame(maxWidth: .infinity)` to fill, a `ScrollView` around the form column. That's very close to my final checkout structure.

## 7. What would have let me write it right the first time

In order of how much each would have helped:
1. **Reading `06-layout.md`.** The page-frame example and lines 143–150 and 237–250 answer every question I had. On the docs' side: SKILL.md's "Read first" list could include `06-layout.md` (or just its frame example plus the stretch paragraph), or `declare.md` §4 could carry the page-frame example. Its current one-line mention of stretch is easy to read past for someone who thinks they already know flexbox.
2. **A compile-time check for reactive axes**, worded with the across-axis fix: "this layout's axis changes; a child it arranges declares neither width nor height — use `flexes` for along and `align = stretch` for across."
3. **An R4 message that offers stretch.** When the layout decides the along axis, the message could add "for the across axis, `align = stretch` on the layout" next to "remove it" and `ignoreLayout`.
4. **A sticky option**, something like "stay in view within the scroller while my parent is on screen", or a guide example showing the intended way to keep a summary beside a long form.
5. **One sentence on fixed-height screens inside a scrolling App**, saying whether to use `flexes`, a state, or a screen that is its own scroller.
