# Venue run 14: Declare 6aedaaa0, Opus 5.5

**Run:** 2026-10-30, launched with
`evals/craft/launch.sh venue-checkout ~/Code/eval-venue-14 claude-opus-5-5 6aedaaa0 8350` against GitHub main,
alongside Cadence run 19. It is the first Venue run with the fixes from Cadence 18 and Venue 13:
- a stale reader of a computed default;
- `align = stretch` filling the view;
- overlays judging a press in paint order;
- styled rich text read by screen readers;
- `null` in optional fields;
- `RadioGroup` arrows;
- Playwright's locators on an assert script's `page`.

**Try it:** the app's two files, its four assert scripts (`tests/`) and both acceptance results (`drive/`) are filed
beside this report.

## The comparison

| | Venue 7 | Venue 11 | Venue 13 | **Venue 14** | React |
|---|---|---|---|---|---|
| Declare commit | | `b7bfd01b` | `b641a1a9` | **`6aedaaa0`** | — |
| time | 25.6 min | 37.7 min | 34.5 min | **31.2 min** | 31.4 min |
| turns · tool calls | 108 · 110 | 112 · 107 | 121 · 120 | **130 · 129** | 101 · 97 |
| code, raw lines | | 1,823 (5 files) | 2,024 (6 files) | **1,701 (2 files)** | |
| code, excluding blanks and `//` lines | | 1,388 | 1,488 | **1,333** | |
| output (incl. thinking) | | 125.5k | 146.7k | **138.6k (63.8k)** | |
| fresh input (cache writes) | | 313k | 356k | **347k** | |
| cached input re-read | 19.6M | 21.8M | 26.8M | **29.9M** | 9.3M |
| read before first app write | | 376 KB | — | **408 KB** | |
| context at first write → end | | 183k → 321k | 179k → 364k | **210k → 356k** | |
| first app write at | | 6.8 min | 5.6 min | **8.1 min** | |
| download (gzip) | | 172.5 KB | 172.8 KB | **175.5 KB** ¹ | |
| hidden acceptance | 11 of 11 | 11 of 11 | 11 of 11 | **10 of 11** as built; **11 of 11** on the fixed kernel | |
| runtime source read | | 0 | 1 | **4** (`text-input.ts`, `bindDerived`) | |
| library source read | | 4 | 4 | **2** (`form.declare`, `field.declare`) | |
| names refused by a check | | 0 | 5 | **0** | |
| its own harness | | Playwright | Playwright | **none**: Declare's assert scripts with the locators | |

¹ `declarec --sizes` from main: program 36.2 KB, runtime 126.5 KB, kernel 12.6 KB.

**One kernel bug cost this run both its time and its one acceptance failure.** It was a long-standing fault in the
WebAssembly kernel, confirmed and fixed (below). It accounts for:
- the declined-then-retry case hanging the page, the one acceptance failure;
- about 37 calls and roughly 11M tokens (some 38% of the run) spent on a field whose `problem` stayed stale;
- every runtime source read.

Without it, this run would likely have been the fastest Venue. Otherwise the agent stayed inside Declare's own tools,
with no harness of its own, which is the first time in three runs. It used the new locators throughout, and had no
name misses.

## Findings

**K1 — The WebAssembly kernel corrupted its dependency lists (fixed in the kernel).** A host's reads wait in a track
ring until the body returns. A cell freed in between (a view torn down mid-run) still got the read linked to it. When
the cell id was handed out again, its list was reset, orphaning that node. From then on the lists disagreed:
subscriptions were silently dropped, and eventually a list closed on itself.
- **Symptom 1, the hang:** after a declined card, paying again froze the page. The pull loops forever while installing
  a seat row's extent rule (`kernel_run → pull`).
- **Symptom 2, the stale field:** a `TextInput` whose `problem` read "Enter your card number." with the number
  filled in. The agent bisected it to "a view next to the field", read `text-input.ts` four times, and restructured
  its fields around it.
  - It reproduces exactly with its own probe script and the old field structure.
  - With the fix, `problem` is empty.
- **The JavaScript kernel** has the same orphaning gap in principle. Both kernels now refuse a subscriber for a freed
  cell.
- **Also fixed:** the pull also walked queued rules with no record of visits, re-entering cycles down every path. It now
  visits each rule once per pull.
- **Tests:** a C regression test (through the track ring, as a host reads) fails without the fix and passes with it.
  The 51 kernel checks and the C-versus-JavaScript conformance suite pass.

**T1 — A locator found the page behind an open sheet (fixed).** `getByRole("button", { name: "Sign in" })` matched both
the sheet's button and the checkout's button behind it. The platform marks the background `inert`, and the new locators
didn't consult it. They now leave out what assistive technology cannot reach, as Playwright's role queries do. The agent
worked around it by hiding the opener while the sheet was open.

**A1 — `Combobox` names two elements (left as is).** This was first seen in run 11. The wrapper (`role=combobox`) and its
input both carry the field's name, so `getByLabel("Country")` finds two. The agent replaced its country combobox with a
`RadioGroup` and a postcode-shape heuristic.
- The fix is ARIA's pattern: the input is the combobox, and the wrapper is presented as nothing.
- But the static "no name" check (DECLARE4017) reads the wrapper's role, so an unnamed `Combobox [ ]` would no longer
  be warned of.
- Fixing that means teaching the check to see through composite controls, which is more design than the gain
  warrants. The current structure is ARIA 1.1's valid combobox pattern, and a screen reader focusing the input hears its
  name once. The duplicate shows mainly to a strict test lookup.

**Smaller ones:**
- **Pages placed by hand.** The side panel, order summary and phone bars use `x`/`y` arithmetic. The agent's own call,
  and it knew the SKILL warns against it. With today's stretch fix, a page in panes is one `align = stretch` and a
  `flexes` pane.
- **Record to replicated view.** Finding the view for a seat id meant walking `childViews` (for Up and Down to the
  nearest seat). That is the app's own arrangement code, not a platform gap.
- **`Focus.focus` and scrolling.** It added `scrollIntoView` defensively because the reference doesn't say whether
  `Focus.focus` scrolls the target into view.

## Is it idiomatic Declare?

Largely, and leaner than run 13 (1,333 lines against 1,488):
- The seat map is a `DataSource` subclass with the room's geometry.
- A sale is one write, and every seat, count and summary follows.
- Seats pop and shrink on springs.
- The hall is one scaled world in a two-way scroller.
- The form is the library `Form` with the service's refusals landing on the field they name.
- Signing in mid-checkout keeps what was typed, through computed defaults.

Missteps:
- **Hand placement of the page's columns** (above).
- **The `Entry` workaround class** written to escape the stale field. With K1 fixed, `Field` serves again.

## The agent's account, verbatim

Asked after the build with read-only tools and Venue's own questions (`impressions.txt`); 1.2 minutes, 6.5k output
tokens. Also filed as `account.md`. Its "Field problem" section describes K1's second symptom from the outside: "a
`TextInput` inside a `Field` stopped re-checking its text … deterministic, and it depended on structure".

### Building The Venue in Declare: an account for the Declare team

I built a ticketing app with a performance list, a seat map drawn as the room, a sign-in sheet, checkout and tickets. It's about 1,700 lines of Declare across two files and took one long session. I read the docs, wrote the program, and checked it with `declare-verify` and `declare-look`. Where I'm unsure of a cause, I say so.

#### (a) Getting up to speed

**What I read.** I followed `skill/SKILL.md` as instructed:
- `docs/declare.md` in full
- guide chapters 01, 04 and 05
- the whole to-do app (`todo.declare` and `todo-parts.declare`)

After that I read only the parts my plan needed: guide 14 (from "Where data comes from" through forms), 08 (controls), 19 (accessibility) and 10 (touch). Everything else came from `npx declare-help`: `TextInput --all`, `Form --all`, `TextInput.purpose`, `TextInput.concealed`, `DataSource.credentials`, `EventStream`, `View.focusScope`, `View.scale`, `scrollStartX`, `App.keyboardHeight`, `revealInset`, `waypoint`, `Combobox.purpose`, `Carousel` and `DrawContext`. I read two library sources, `form.declare` and `field.declare`, when I needed exact behaviour.

**What taught me the most:**
- **`declare.md`.** It's dense, but the "Seven differences" list and §5's set-versus-declare table ("who owns the value") saved me from several React-shaped mistakes before I made them. The computed-default idea, "a formula the value follows until an assignment replaces it", turned out to carry one of the brief's hard requirements: signing in mid-checkout without losing what was typed. `email: string = { app.account.email }` did exactly that with no extra code.
- **The to-do app.** It's the best single teacher. I copied its patterns directly:
  - the `Glyph extends Icon` drawing pattern
  - the alias block (`list: View = { app.main.col.list }`)
  - the `Font [ FontFace [...] ]` setup, URL included
  - `ignoreScroll` bars
  - `afterSettle(() => Focus.focus(...))` after a change of screen
- **`declare-help Form --all`.** This was the biggest win for this brief. The `refusal` / `refusedWith` / `showProblems` contract, `pending` blocking a second send, and fields that judge themselves only once left almost exactly matched the brief's checkout section and the service's error shapes. Reading `form.declare` itself confirmed the order of operations, which I relied on when clearing the security code after a decline.

**What was missing or misleading:**
- **`Combobox.purpose`** is presented as the way to make a country field autofillable. In practice the combobox puts its accessible name on both a wrapper `div role=combobox` and the inner `<input>`, so `getByLabel("Country")` matched two elements. For an app that will be tested by label, that rules it out. I switched to a `RadioGroup`, plus a postcode-shape heuristic to set the country after autofill. The reference doesn't warn about this.
- **The Sheet's background and assistive technology.** `Sheet --all` and guide 19 say that behind an open dialog or sheet, the content is "out of reach to the keyboard and to a screen reader alike". Yet with the sign-in sheet open, a Playwright `getByRole("button", { name: "Sign in" })` matched both the sheet's button and the checkout page's button behind it. I'm not sure whether the background is inert without being `aria-hidden`, or whether the test driver ignores inertness. Either way, an author who trusts the sentence will write duplicate-name traps. I hid the opener while the sheet is open.
- **`Field`.** It's documented as holding "the control, or a row of them". That is where I hit the worst problem of the build (part b).
- **What I couldn't find:** a statement of what `focusScope = stop` does with disabled members, and whether `Focus.focus` scrolls the target into view. I guessed both and added `scrollIntoView("nearest")` defensively.

#### (b) Expressing what I wanted

**Where the language fit well:**
- **Data and state.** The seat map is a `DataSource` subclass with the room's geometry and the seat-id lookups on it. Other buyers' purchases arrive on an `EventStream` and become one `markSold` write. Every seat, the counts, the thumbnail and the summary follow from that. Nothing anywhere updates a view, and that held across all 648 seats.
- **Reactive identity.** `mine: boolean = { app.chosen.includes(classroot.seatId) }` on each seat, with a `Spring` on it, gave the "choosing a seat should register" pop for free. A second spring on `sold` made a seat bought by someone else visibly shrink away, which is exactly what the brief asked for ("they see it go"). Both are one line each.
- **The hall as one scaled world.** Seats live in the hall's own units, and the world view has `scale` and sits inside a `scrolls = both` view. `View.scale` makes hit-testing, scroll extent and parent sizing all honour the transform (its reference says so explicitly). That one fact solved the phone problem cleanly: seats drawn about 44 points apart, native panning, and Playwright's scroll-into-view still works. I trusted that sentence and it held.
- **Forms.** `purpose`, `concealed`, `required` given as a message, `validate` returning a sentence, `name` matching the service's field names, and `enterMoves`. The 422 errors landed on the right field with no mapping code at all.
- **Waypoint versus location.** Seeing these as two different things was clarifying. The performance goes in the URL; "paying" is a waypoint, so Back returns to the hall.

**Where I had to work around it:**
- **The `Field` problem (my strongest finding).** A `TextInput` inside a `Field` stopped re-checking its text after a Playwright `fill`. "Grace Hopper" stayed flagged as "Enter the name as it's printed on the card", and the form refused to send.
  - It was deterministic, and it depended on structure: it happened only when another view sat next to the field. First that was the card-brand `Text` inside the card-number `Field`; later it was a drawn `BrandMark` overlaid in a wrapper beside a neighbouring `Field`. It even happened with a constant `brand` and a fixed `x`.
  - `__declare.explain(path, "problem")` reported `live: false` and `writer: "FieldLayout"`. My guess is that the derive was created while `FieldLayout.place()` was running and was then disposed along with it. I did not confirm this in the runtime.
  - Typing key by key (`declare-look --type`) did not reproduce it. Only a whole-value `fill` did, which is roughly what autofill does. That matters for the brief's autofill requirement.
  - The workaround was my own `Entry` class that follows the `fieldLabel` / `_field` / `_hold` protocol but uses `SimpleLayout`. After that, `problem` updated, but `valid` on the same field still read `false` while `problem` was `""`, and `explain` still said `live: false`. So I'm not certain the underlying issue is gone. It's just no longer on the path my flows use.
  - This cost me the most time of anything in the build.
- **`ignoreLayout` overlays inside a wrapper.** Same trigger family as above. I ended up placing the card brand on the label line with a negative-spacing `SimpleLayout` instead of overlaying it on the input, which is the more natural design.
- **Things I placed by hand.** The desk side panel, the desk order summary and the phone bars are positioned with `x`/`y` arithmetic. The skill's drift check ("Placing everything by hand… a layout of your own") warns against exactly this, and I did it anyway because "fixed while the page scrolls" plus a two-column centred layout was quicker that way. A reviewer would rightly flag `hallH` reading `app.hallBar.height` and the repeated `Math.max(app.pad, (app.width - 900) / 2)`. That's my shortcut, not a language limit, though I'd have liked guidance on a page with a sticky side column.
- **Escape hatches.** I used `as any` in `refusedWith(body: any)` and in `focusSeat`'s tree walk (`(c as any).seatId`). Finding the view for a seat id meant walking `childViews` recursively. I didn't find a way to get from a record to its replicated view, and keyboard grid navigation (Up/Down to the nearest seat) needed exactly that. A real API for it would be welcome. I may simply have missed one.
- **Small friction, each fixed in seconds by its diagnostic:**
  - `fontWeight = { nearly ? semibold : regular }` must use strings inside braces (DECLARE4005).
  - `rowIndex` read on a nested non-replicated view (DECLARE4023). The message told me exactly that it should be `parent.rowIndex`.
  - A three-deep nested ternary (DECLARE4025) pushed me to name `inHouse` and `browsing` and to use a `titles` lookup. Better code as a result.
  - An arrow function written with `->` (DECLARE2000, with the exact fix).
  - `exists`-gated views needing `?.` in aliases (DECLARE6001).

#### (c) Verifying it

**The ladder.** `declare-verify` takes about two seconds per run, and stopping at the first failing rung kept the loop tight. R1 to R4 were clean within four edits of the first draft.

**`declare-look`** combined with my own screenshots was how I actually judged the design. Four catches came from looking, not from checks:
- the stage clipped at the top
- the fixed top bar painting under the scrolled content, because of declaration order
- the decline banner sitting below the phone's pay bar
- the ticket header overflowing on a phone

**`--url`** to the dev server mattered. The service's cookie is SameSite and needs a `127.0.0.1` origin.

**Assert scripts with Playwright locators** were the most valuable tool, because the brief says it will be graded by role and name. Strict mode caught three real defects:
- the duplicate "Country" label
- the duplicate "Sign in" buttons
- seat names whose prefixes collide ("seat 1" matching "seat 10"), which matters for anyone testing without `exact: true`

**Layout findings at R4/R5:**
- *Useful:* "7 controls another view takes the presses of … by app.hallScreen.hall.mini". That told me the thumbnail would intercept test clicks on seats. I made it `pointerEvents = "none"` and moved the zoom toggle out of the hall entirely.
- *Noisy:* "648 controls smaller than 44 × 44" fires on every run. The seats are 26 units inside a parent scaled ×1.7, so on screen they are about 44 points. The check doesn't account for the ancestor's scale. It's a false positive that drowns other output, and I had to filter it out with `grep -v`.

**Frictions:**
- Replicated views are addressed by index, and `world.2.0.3` didn't resolve. Naming views by their accessible name (`world."Orchestra, row A, seat 4"`) did, and is nicer, but I found it by trial.
- `page` is Puppeteer's, not Playwright's. `pressSequentially` doesn't exist, and `page.screenshot({ fullPage: true })` draws `ignoreScroll` views in odd places. That misled me once into thinking the layout was broken.
- The virtual clock meant a 1.5-second payment needed `drive.waitReal`. The docs explain this, but my first attempt failed silently by not waiting.
- The "this run talked to a live service that earlier runs wrote to" note was thoughtful. It's also true that my checks consumed real seats.
- **What I could not verify:** real autofill, a phone's on-screen keyboard (`keyboardHeight` lifting the pay bar is untested), a real screen reader, and the "taken while paying" refusal racing the event stream. I triggered that last one by calling `refusedWith` directly.

#### Surprises

- How closely `Form` matched both the brief and the service's error shapes, as if designed together.
- That `scale` really does carry through to hit-testing and scroll extent.
- `keyboardHeight`, `revealInset`, `concealed` and the purpose-to-autofill mapping all exist. These are things I would normally hand-roll badly.
- The `Field` bug. The rest of the system felt so deterministic that a lost dependency was jarring.
- `explain()` was the tool that cracked the bug. `live: false` plus `writer` told me more than any amount of reading the source.

#### Good and bad

**Good:**
- **The diagnostics.** Every compile error named its fix, and I applied each verbatim.
- **Behaviour comes from the data.** With the seats in one `DataSource` subclass, a sold seat, its count and its spring animation all follow one `markSold` write.
- **Springs as one-liners**, and computed defaults.
- **Accessibility arrived largely for free.** Roles, names from field labels, and `focusable = quiet` headings for moving focus after a change of screen.
- **The docs' tone:** precise, and quick to tell you what *not* to do.

**Bad:**
- The `Field` / layout derive bug, with its very non-local trigger.
- Some reference claims (the Sheet hiding its background, Combobox for autofill) don't match what a role-based test sees.
- The scale-blind touch-target warning.
- No clear answer for "this record's view" or for a sticky side column.
- Formatting expanded my main file to about 1,100 lines, and the App body became long. That's partly my structure, but Declare doesn't give much help splitting an App's screens beyond `include` and classes.

#### Compared with what I'm used to

- **No render function.** You state relationships and never re-render. Coming from React or Vue habits, the hardest adjustment was trusting that I didn't need to update anything. The second hardest was the settle model: inside a handler, values I had just written read back as written, but nothing derived from them had moved yet, hence `afterSettle`.
- **Events don't bubble, and the press happens in `press()`.** This made controls predictable.
- **Layout as an attribute, with absolute positioning as the default.** This is closer to Flex/MXML or QML than to CSS.
- **It reminded me of:**
  - OpenLaszlo, as the README says
  - QML, for property bindings with an imperative escape hatch
  - Flex/MXML
  - spreadsheet-style dataflow
  - SolidJS or MobX, for fine-grained tracking
  - SwiftUI's `@State` and `.animation(.spring)` ergonomics, but with springs as tree members

#### Where I'd most want improvement

1. **Derive lifetime.** Constraints created while a layout pass is running (the `FieldLayout` case) should not die with it. If I'm right about the cause, it would also affect autofill in real use.
2. **Make overlays and composite controls match role-based queries.** Hide the background of a modal from the accessibility tree, and give a combobox's name to one element only.
3. **Make the touch-target check aware of ancestor scale.**
4. **A documented way to get from a record to its view** (for focus and scroll), and a documented pattern for a sticky side column.
5. **Optionally, a Playwright-flavoured `page`**, or a clear note that it's Puppeteer.

#### Would I use it?

**Yes, by preference, for:** interactive, spatial, stateful interfaces like this seat map, calendars, dashboards, or internal tools where continuity and motion matter. Those parts of this build were less code and more correct than I'd expect elsewhere, and the compile-verify loop suits an LLM author very well.

**With reservations, today, for:** a public payment flow. That's because of the `Field` issue I hit and the gaps I couldn't verify (autofill, real assistive technology). I'd want those settled, or a much larger suite of flow tests, before shipping money-handling forms. My uncertainty here is genuine: the bug may be narrower than it looked to me, but I only got around it, I didn't understand it.

## The names ledger

```
NAMES — eval-venue-14: 0 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)

SUMMARY: 0 of 0 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
