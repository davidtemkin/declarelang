# Pagemap, functional brief, run 1: Declare, standard (audit; not scored)

The first run of the functional brief (`evals/apps/pagemap-functional/brief.md`): Pagemap's needs
written as a product manager would, with nothing about screens, controls, layout, appearance or
interaction, and the service contract in `api/API.md`. Declare is the working tree on
2026-11-18 (`e349b316` plus the day's uncommitted changes), with `claude-opus-5-5` at the
standard level. The run was **stopped by hand at 100.8 minutes**, as David asked: its full flow
suite was running and it was reviewing the brief against the build. It hadn't written its
hand-over. Its session (`002b04be-6897-409f-80b8-4e970d313dae`) is kept, so it can be asked to
continue.

## 1. The numbers

| | Functional 1 | Pagemap run 1 (old brief) | The original |
|---|---|---|---|
| Time | 100.8 min, stopped (reading 8.7, writing 19.7, checking 72.4) | 61.2 min | (weeks) |
| First verify of the app | 28.4 min | 28 min | |
| Turns | 183 | 164 | |
| Output tokens | 339,414 (thinking 82,640) | 271,367 (thinking 67,952) | |
| Cache reads · writes | 77.6 M · 0.61 M | 64.2 M · 0.57 M | |
| Verify runs | 90, 40.8 min (median 11.2 s) | 54, 20.2 min | |
| Declare | 3,339 lines | 4,398 | 4,055 |
| TypeScript | 1,661 lines (`plan.ts` 1,260, `service.ts` 594, `print.ts` 41) | 631 | 787 |
| Its checks | 10 flow scripts, 2 look scripts, and Node unit tests of the rules; every flow passed by 89 min, and the full suite was rerunning when it was stopped | 15 scripts | |
| Source reads | none of the library; `compiler/src/compile-node.ts`, for npm imports | `library/sheet.declare` | |

The phases have been worked out by hand, because the timing script counts its first throwaway
program as the first verify. Both runs reached their first verify at the same point. All the
extra time is in checking (72 min against about 33): designing and redesigning what the old
brief had settled, working out what each need means, and testing more of the product by hand
(§5). Two verify stalls of 30 seconds each, from a print window taking the focus, are part of it
(§3.4).

Idiom counts (`idiom.py`):

| | Functional 1 | Pagemap 1 | Original | Venue 38 | To-do |
|---|---|---|---|---|---|
| lines over 150 characters | 234 | 128 | 238 | 11 | 3 |
| colour literals outside theme declarations | 71 | 76 | 63 | 2 | 1 |
| theme reads | 230 | 228 | 299 | 86 | 69 |
| States | 8 | 2 | 0 | 2 | 7 |
| visible switches | 19 | 17 | 6 | 2 | 0 |
| branches on width or phone | 4 | 39 | 25 | 15 | 38 |
| flexes | 38 | 25 | 36 | 14 | 7 |
| browser scripts · page lookups | 1 · 1 | 2 · 1 | 2 · 1 | 0 · 0 | 0 · 0 |

## 2. What it built, and how

It read the SKILL's first read in order, then the chapters its needs pointed to (data, overlays,
addresses, controls, verify, keyboard, themes, your own views, animated arrangements). It read
Issue 03 from the emulator with `curl`, then **wrote the issue's rules first, as plain
TypeScript with Node unit tests** (`plan.ts`, `tests/plan.test.ts`), before any interface. It
probed what the security rules let an ordinary account read by creating a throwaway account.
Then it wrote the program: a schemas file, its own two themes over SanFrancisco, the page
grid, the page panel, the side panels, and the frame with its overlays. After that it checked
flow by flow, with a second person on the service for working together and a forced conflict:
pages, stories, artwork, sharing (including someone from another team), accounts and
administration, the phone, reading, the keyboard, dark mode, help and printing.

It found and fixed real bugs of its own as it went:
- the save state hid being offline behind "Saving…";
- a view-only link followed while signed out never looked the link up;
- Select mode on a phone opened the page sheet on every tap;
- its six side-panel tabs were cut to "S…" (redesigned as a rail of labeled icons).

## 3. Findings for the platform

### 3.1 A class's own attribute named `tint` is converted to a color when set (bug)

Its `Avatar` declared `tint: string = "#80a7ff"` and filled itself with
`Color.from(classroot.tint)`. At its default, `tint` holds the string. Set at the use site, by
a literal or by a rule, it arrives as a color *number* (`"#336699"` arrives as 3368601), so
`Color.from` fails and the avatar loses its fill. Reproduced in a three-line program (scratch
`trunc/tint2.declare`). The value is typed by the *name* `tint`, a color attribute of the
library's `Image` and `Gauge`, instead of the type the class declares. Under "names mean one
thing", either the declaration is refused naming the library's `tint`, or the declared type wins.
Verify said nothing, and the agent renamed the attribute `tone`.

### 3.2 A view removed by `exists` while its rows were being built crashed (bug)

The page panel was gated `exists = { app.sel.length <= 1 && app.currentIndex >= 0 }` and fed
by a `datapath` of the current page. Taking a second page in hand with shift-click changes both
in one settle: the runtime then attached replicated `RegionEditor` rows into a parent that was
gone ("Cannot read properties of null (reading 'insertChild')"). Detached, a row's `app`
didn't reach the App, so the next error was "this.$root.shareText is not a function — in
Text.text (the library's)". The agent moved the selection test from `exists` to `visible`, so the
panel stays built, and the crash went away. A gate closing during replication must not attach
rows into a removed parent. It needs a small reproduction.

### 3.3 `press()` carries no modifier keys

Declare tells authors to override `press()`, "the activation seam … not the handlers", but
`press()` takes no event. To make shift-click extend a selection and ⌘-click add one, the
agent polled `Keyboard.isDown("ShiftLeft")` and its siblings inside `press()`. Either `press()`
should receive the modifiers (pointer and keyboard alike), or the docs should name the way to
read them.

### 3.4 Verify waits 30 seconds when the page under test loses the focus

Pressing its "Print the plan, or save it as a PDF" opened a print page that takes the focus. A
background page makes no frames, so verify's wait for two frames (`frames()`, an
`IntersectionObserver` and `requestAnimationFrame`) never ended, and after 30 seconds verify said
"it is waiting on something that never comes". That happened twice. Verify should notice the
page went to the background and say so at once.

### 3.5 Smaller

- **`Switch` has no `label`**, though `Checkbox` has one: four sites, resolved by adding a
  `Text`.
- **`radiogroup`**, ARIA's spelling, for Declare's `radioGroup`: verify named the right word at
  once.
- **Repeated friction from earlier runs:** `Color.parse` (it's `Color.from`), a bare
  `fontWeight` token inside `{ }` (DECLARE4005), and `object` as a schema field type
  (DECLARE1000). All three were caught at once, and the messages named the fix.
- **Verify's `expect` has no `toMatchObject`**, which it reached for from Playwright. The message
  lists what exists.
- **Labels cut short:** the six-tab side panel cut to "S…" is the case the new check (a
  control's own words cut short) now reports; this run predates it. Section names in its side
  panel are clipped with no ellipsis ("Front of Boo"), which is its own row widths. They're
  data, so the new check rightly says nothing.
- **Lint:** DECLARE4025 (deeply nested choices), 4035 (a label with no role), 4022 and 4032;
  it cleared them in its final pass.

## 4. Idiom review

Read part by part from its map.

**In the grain:**
- **Where the person is:** `location` for the issue and page, `waypoint` for what's open.
  Back and Forward retrace both.
- **Themes:** its two themes laid over SanFrancisco, with tokens for what a flatplan means
  (editorial, advert, open, picked, moving, landing, the four booking fits); touch sizes by
  theme.
- **The page grid:** `PlanLayout extends TweenLayout` places spreads in rows and glides moved
  pages (F-MAP-10, met by the platform's own motion).
- **Each page:** a `Control` with a computed accessible name, keys bound to commands (arrows,
  Shift+arrows, Space), a context menu on right-click and on hold, and three levels of detail by
  drawn size.
- **The frame:** `SimpleLayout` with `flexes` and `align = stretch`; Datasets for members,
  issues, comments, activity and presence; the cells as a derived dataset.
- **Desk and phone:** 8 States and only 4 branches on width, the fewest of any run: the design
  is one program that changes with the window's size, not code written twice.

**Drift:**
- **The model is script.** The issue's rules, and every change, are 1,260 lines of TypeScript
  (`plan.ts`), and the App reads them as `fol = { folios(app.fp) }`,
  `sl = { slots(app.fp) }`. The guide says the app's model belongs in Declare, on the
  dataset's class, where the compiler reads through it. Its one stated reason came
  as it chose, before writing any Declare: "I want the flatplan rules as a plain,
  unit-testable module." It never tried the rules in Declare and never said Declare couldn't
  test them. What Declare offers is a verify assert script, which boots the whole program in
  Chrome and reads or calls into it; nothing runs a class's logic on its own, in Node, in
  milliseconds, as `node:test` ran its 23 tests. So the choice was reasonable, and the gap
  is the platform's as much as the drift is the agent's.
- **The App is a 1,200-line controller** of about 70 methods, where the to-do and tracker keep
  writes on a dataset class.
- **States are strings:** `panel`, `unit`, `openState` and `filter` are `string`, cast at use
  (`app.filter as "all" | …`), where a literal union type would be checked.
- **234 lines over 150 characters**, as many as the original.
- **The reader's dark palette** (`#111110`, `#F2F1ED`) is literal, not tokens.

## 5. The design, against the original

Compared on screens of the original and this build taken on the same data, desk and phone
(the screens are not kept with this report).

**What converged:** the three-column structure: issue tools on the left, the pages in the
middle, the page panel on the right. With nothing in the brief asking for it, a grid of pages
with a place beside it to act on the chosen page is where both designers went. The domain and
tool conventions pull hard toward that shape. Its page panel covers the same ground as the
original's.

**What departed, and it's most of what a person sees:**
- **The frame:** one compact bar of icons (search, an All / Editorial / Ads / Open filter, zoom
  in and out, artwork, reader, the save state, undo and redo, share, help) and a thin strip of
  figures. The original has a wordy toolbar of menus and a large heading with a bar chart.
- **The left side:** a rail of labeled icons (Sections, Stories with a waiting badge, Ads, Art,
  Talk, Print), one panel at a time. The original has one long scrolling column.
- **The plan:** dense page drawings by default, artwork on demand. Sections are marked by a
  colored rule and a small name, not large numbered headings that fold. Each section has an eye
  to set its pages aside.
- **The page panel** leads with moving: "Move as: Page / Spread / Story / Section", with Earlier
  and Later, where the original keeps the move mode in its toolbar. It leads with the page's
  position, not the story's title in a large serif. Tags are toggle chips.
- **On a phone:** a tab bar at the foot (Panels, Find, Select, Read, Size), with a Select mode
  that gathers pages and an action strip. The original uses a drawer and press-and-hold
  dragging.
- **Print:** a generated document of the plan, not the window printed. Help is a Markdown
  document inside the app.
- **In look:** utilitarian, warm paper and a blue accent, where the original is editorial, in
  olive and gold with serif display type.

## 6. Its hand-over

Resumed to finish its review, it ran the full suite on a fresh copy of the service: 23 unit
tests and 12 browser flows, at a laptop size, a phone size and one in between, in light and
dark. One flow (two notices racing when someone else moves a page) and two phone findings
(a 38-point button) failed; it fixed them and reran those three, which passed. Its notes
say what it didn't do: it never listened with a screen reader, simulated the second person
through the service in all but one case, and left a diagnostics hook
(`window.__pagemapService`) in the app for its conflict test. The resumed session took
about 19 more minutes of work, outside the 100.8 above. Nothing is scored.

One more platform finding is in it: **the dev server doesn't notice an edit to an imported
`.ts` file**, so the browser keeps the old code until the `.declare` file is touched.

## 7. Fixed since

- §3.1: a built-in color name declared as anything but a `Color` or a `number` is refused.
- §3.2: reduced on the run's own snapshot and fixed (a view coming in, or a list attaching
  rows, stops when a rule it runs tears down the parent), with a regression test.
- §3.4: a window the program opens no longer stalls verify; the window is reported.
- §6: an edit to a `.ts` file a script imports, at any depth, now compiles the program again.
- §3.5: `Switch` takes a `label`; verify's `expect(value)` has `toMatchObject`.
- §3.3, no change: `press()` stays without modifier keys (see the change log).
