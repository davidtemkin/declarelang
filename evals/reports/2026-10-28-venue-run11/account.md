# Building Venue in Declare: an account for the people who make Declare

One housekeeping note first: the dev server I restarted has stopped (exit 143), so the app's URL won't answer until someone runs `npm start` again. I haven't touched anything since your request. The program files show as changed on disk since I last read them, and I've left them alone.

## (a) Getting up to speed

**What I read.** I followed `skill/SKILL.md` almost exactly:
- `docs/declare.md`, in full;
- guide chapters 01, 04 and 05;
- `apps/todo/todo.declare` and `todo-parts.declare`, both whole.

After that I read only for specific needs:
- `14-data.md` on servers, streams and forms;
- `08-controls.md` on text fields and focus;
- `18-overlays.md`, the start of `19-accessibility.md`, and the pan/zoom section of `10-touch.md`;
- `20-urls.md` on `waypoint`;
- `verify.md` on assert scripts;
- many `npx declare-help` lookups.

**What taught me the most:**
- **The to-do app.** It showed me things I'd never have guessed from the spec: constants placed in `script`, view aliases on the App (`list: View = { app.main.col.list }`), `trackChanges` with `onChange`, `exists` versus `visible`, and that a phone-sized App simply scrolls. I copied its Fraunces `Font` declaration outright.
- **"A form" in `14-data.md` and `declare-help Form --all`.** This was the best-designed part of the platform I touched. `required` and `validate` sit on the field. `judgeOn = leave` is the default. `submit()` judges everything and focuses the first problem. `pending` is the double-submit guard. `refusedWith(body)` is the hook for my own reaction, and the service's `{field, message}` lands on the field whose `name` matches. Almost every validation sentence in the brief matched a documented behaviour. I wrote no state machine for errors, and that is rare.
- **Small lookups that settled real decisions.** `declare-help TextInput.purpose` gave me `cardNumber` → `cc-number`, the `inputmode` hints, and `concealed` for show-password. `declare-help View.accessibilityRole` told me `toggle` becomes `button` with `aria-pressed`, which decided how seats would look to a test.

**What was missing or misleading:**
- **The assert script's `page`.** `verify.md` says `page` is "the browser page" for "the rare question", so I assumed Playwright. I called `page.getByRole` and got "not a function" (it appears to be Puppeteer). One sentence naming the library would have saved a round trip.
- **The "no harness of your own" advice cost me in one place.** The doc says there's "no reason to build a browser harness of your own". But the brief's test finds things by role and accessible name, and the `drive` vocabulary finds them by view path or by name. I needed `getByRole(..., {exact: true})` and Playwright's strict-mode behaviour, which only a real Playwright run shows. That's how I learned that a field hidden with `visible = false` still trips `getByLabel` strict mode. I think the advice is right for most programs, and wrong for a brief whose tests are written in Playwright.
- **The rename trap was mine, but the message pointed the way.** The compiler refused my `schema Card` because `Card` is a library class. The message was clear and offered `VenueCard`. My first rename used BSD `sed` with `\b`, which silently did nothing. My second, with `perl`, also rewrote the user-facing strings "Card number" and "Card details" into "SavedCard number" and "SavedCard details". Neither is Declare's fault. A class name colliding with a common English noun is still a sharp edge, though: `Card` is the obvious name for a payment card.
- **What I never found:** how a stroke could be dashed (I drew the ticket's tear line by hand in `draw()`); whether `Spring` animates after a direct write when its target is constant (I used it for the summary's small lift but never checked it frame by frame); and why some focus calls fail (more under (c)).

## (b) Expressing what I wanted

**Where it fit well:**
- **Values that follow the account until the person types.** A *computed default* is a declared attribute with a formula, such as `email: string = { app.me.value?.email ?? "" }`. The person's first edit replaces the formula. That is exactly "sign in halfway through and lose nothing typed", in about twelve lines, with no "dirty" flags. This is the strongest single fit between language and brief that I noticed.
- **Screens as derived state.** `screen` is computed from `placeOrder.loaded`, `perfId` (which is `location`) and `waypoint`. Back from checkout returns to the hall because `waypoint` holds the step. After the 409 handler wrote `waypoint = ""`, the hall reappeared without any navigation code.
- **Data from the service.** Each request is a `DataSource` with `credentials = include`. Signed-in is just `me.loaded && !me.failed`. Sign-out is a DELETE with `format = "text"` (so the empty 204 isn't parsed as JSON) followed by `me.clear()`. Live sales are an `EventStream` whose `active` is a constraint. It all read naturally.
- **Seats as data.** Each seat is replicated from its record, three levels deep (`:sections[]` → `:rows[]` → `:seats[]`). Each `SeatMark` places itself from helper geometry and draws itself in `draw()`. A sale written into the dataset with `hall.set(...)` immediately redraws the seat, shrinks it on its spring, and updates the summary, the overview and the "N of 648 left" count. I wrote nothing to make that happen.
- **Two families and one accent.** This was just a `theme` record spread over `SanFrancisco`, plus custom tokens (`tones`, `seatGone`, `stage`) read with `provided("theme")`.

**Where I worked around the language or library:**
- **Arrow keys on the seat plan.** `focusScope = stop` moves focus in tree order. My seat 1 sits on the screen's right, because the API numbers seats as seen from the stage, so Right Arrow went left. The docs had foreseen this ("in a grid … answers the arrows itself"). But moving focus to a computed seat had no direct form. I used an App attribute, `keySeat`, plus a `wanted` constraint on every seat with `trackChanges` and an `onChange` that calls `Focus.focus(this)`. That's 648 constraints listening to one string so that one view can take focus. It works, but it feels like a workaround for a missing "find the replicated view for this record" call. I may simply not have found one.
- **Country.** `Combobox` with `purpose = country` looked purpose-built: its source even picks an item when autofill pastes a whole name. But a Playwright click on it didn't open the list, and both the wrapper and the inner input carried the label "Country", so `getByLabel` matched twice. I switched to a `RadioGroup` and inferred the country from the postal code's format. That was arguably better design for three options, but it was chosen to get around the library.
- **Laying out the hall screen.** I wrote `flexes = true` on the lens together with `width = { app.wide ? this.width : … }`. The compiler refused it with DECLARE7001 ("'width' reads itself"), so I computed both sizes by hand. Later, `summaryCol` with `ignoreScroll = true` inside a layout looked fine at first; the checker found it scrolled away. Its explanation was the key fact: `ignoreScroll` only means something on a direct child of the scroller. I moved the summary to the App and placed it with arithmetic `x`/`y`, which the skill's own drift check calls "placing by hand". I believe it was the right call for fixed chrome, but I'm not certain there wasn't a better form.
- **Hidden versus absent.** I first used `visible` to hide the fields of whichever payment mode wasn't in use, plus the phone or desk copy of each panel. Playwright's strict mode then saw two "Security code" fields. Switching to `exists` fixed it, but every alias path then became nullable (`app.payForm.card?.pair.codeField.entry ?? null`). The docs do say a `visible = false` view stays in the DOM. They don't say that it still counts for label lookups, and that matters to anyone testing against ARIA.
- **Smaller frictions:**
  - Inside `{ }`, enum words must be strings (`fontWeight = { … ? "semibold" : "regular" }`). The error (DECLARE4005) was excellent.
  - `axis = { app.wide ? x : y }` failed the type check, with a clear message.
  - `width = { … 100% }` is refused, as documented.
  - `ChangeEvent.changed` is an array, not a function. I guessed wrong; TypeScript caught it.
  - My regex to change `press()` to `onClick()` on `Button` (prompted by warning DECLARE4013) also hit `TextButton`, because the name contains `Button [`. Again my fault, but the Button/Control difference — `onClick` for one, `press()` for the other — is a trap. The warning explaining it was excellent.

## (c) Verifying it

**The verify ladder.** `npx declare-verify` was fast and gave good messages. R1–R3 caught every syntax and type mistake, each with a precise fix (DECLARE5000, 2000, 4005, 6001, 7001), plus useful warnings: DECLARE4023 caught a `rowIndex` read on a view that isn't replicated, and DECLARE4013 caught `press()` on a `Button`. R4 booting at both laptop and phone size gave me confidence early.

**`declare-look`.** The screenshots were indispensable. Two judgements about the hall ("does it read as a room?") and the tickets came straight from them. But `--click 'app."Orchestra, row F, seat 18"'` said the seat was "outside the window at (-212, 286)", while its DOM rectangle was at x = 410. It failed again on a free seat. Reading up the parent chain showed consistent `x` values (232 + 178 = 410), so the tool's own geometry seemed wrong for views nested inside a centred canvas within a two-way scroller. I never found the cause. I switched to Playwright, so I'm unsure whether this is a real tool bug or something about how I structured the hall.

**Playwright, my own harness.** Contrary to the advice, this was where I verified behaviour. I installed it in a separate `checks/` folder outside the repo. It confirmed:
- each seat's name and pressed state;
- the summary line, card-number grouping, expiry formatting and Luhn timing;
- one POST despite a double click plus Enter;
- sign-in mid-checkout keeping a typed email;
- the decline sentence and the cleared security code;
- the 422 focus move, and the 409 path (with the event stream blocked via `page.route`);
- that the session survives a reload.

It also caught focus landing on `<body>` after sign-in. The Sheet tries to give focus back to the button that opened it, which had vanished by then.

**`declare-check`.** The independent checker was the most valuable single step. It caught two real bugs I had missed:
- My own purchase came back on the event stream before the order's 201 and was reported to the buyer as "taken by someone else". In one of its four runs the screen even fell back to the hall.
- The desk summary's `ignoreScroll` did nothing.

It also caught postcode validation that only ran once a country was chosen, plus 34-point seats, a sign-in sheet 10px too wide, a truncated row, and two `Focus.focus` calls on views not yet focusable. Its report named program lines and causes. Two problems: my dev server had died mid-run, so it fell back to its own hosted copy; and `--wait` had to be polled several times over about nine minutes. Still worth it.

**What I couldn't verify, and said so:** the phone's keyboard types, autofill, the password manager, and whether a real thumb hits the intended seat. I built these to be right, not proven.

## Surprises
- **How much of the brief's form behaviour was already in `Form`/`TextInput`.** "Not marked wrong while first typing", "taken to the field the service names", "nothing sent twice" — each was a default, not something I had to build.
- **`TextInput.select()` inside `onInput` for regrouping a card number.** The reference describes this case almost word for word ("a card number in fours").
- **The checker found a race between the service and the UI.** I wouldn't have expected a "check against the brief" tool to surface that.
- **`Focus.focus` fails quietly when the target isn't focusable yet.** The checker saw "runtime said: … is not focusable"; I didn't, until then. My fix was `afterDelay(120/400, …)`, which is timing-based and fragile. `afterSettle` wasn't late enough, presumably because the Sheet's restore runs "one turn late".

## Good and bad

**Good:**
- error messages written for the reader who has to fix them;
- computed defaults;
- `Form`;
- the platform's handling of `purpose`;
- `Spring` per seat costing nothing at rest;
- `draw()` for anything drawn;
- derived screens;
- the skill's insistence on reading a whole real app first.

**Bad, or at least rough:**
- **Testing by role.** There's a mismatch between "drive by view path" and how outside tests find things: duplicated labels in library controls (Combobox), and hidden-but-present views that still count for label lookups.
- **Focus.** Restoring it after the opener disappears, and the quiet failures above.
- **`declare-look` path clicks** that disagreed with the DOM.
- **Name collisions** with library classes (`Card`).
- **Seat-grid keyboard navigation** needing a broadcast attribute.
- **Fixed chrome inside a layout.** "Sticky" isn't a concept; `ignoreScroll` only works on a direct child of the scroller.

## Differences from what I'm used to

There's no component render. `{ }` is TypeScript and `[ ]` is the tree, which kept "logic" and "structure" cleanly apart. Children come from data, never from `.map()`; once I accepted that, the three-level seat replication was easier than its JSX equivalent. There's no CSS. Spacing and type come from layout attributes, which is pleasant until you need sticky positioning or dashes. Handlers can't be `async`; requests are members. This removed a whole class of "fetch then set state" bugs I'd normally write.

## What it reminded me of
- QML (attributes bound to expressions, `States`, `Behavior`-like springs);
- SwiftUI's environment, in the role of `provided`;
- OpenLaszlo, the lineage the README names;
- spreadsheet-style constraint systems such as MobX computed values;
- for `location`/`waypoint`, a more principled version of Elm-style URL-as-state.

These are impressions, not careful comparisons.

## Where I'd most want improvement
1. **A by-role, by-name vocabulary in `drive`/`expect`**, plus documentation of `page`'s library. Keep `getByLabel` from matching both a Combobox's wrapper and its input.
2. **Focus that holds up:** a documented way to say "after this overlay closes, focus X", and a loud error when `Focus.focus` fails.
3. **Reaching the view for a replicated record** (for focus, and for scrolling one into view), so grid keyboard navigation doesn't need a broadcast attribute.
4. **Sticky or fixed positioning** that composes with layouts.
5. **`declare-look` path geometry inside scrollers.** If it's a bug, fix it; if it's my misuse, explain it in the message.

## What I'd use it for

Form-heavy, stateful apps that run on both phone and desktop — checkout, booking, settings, internal tools. `Form` and computed defaults made the hardest part of this brief nearly free. I'd also use it for drawn, data-driven surfaces like the seat map. I'm less sure about apps that depend on rich third-party widgets, or on test suites written against the DOM. I'm also unsure how it performs well beyond the roughly 650 seat controls here; I didn't measure it.