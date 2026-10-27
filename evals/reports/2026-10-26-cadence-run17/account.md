# Building Cadence in Declare: an account for the people who make it

## (a) Getting up to speed

**What I read, in order:** `README.md`, then `AGENTS.md` and `skill/SKILL.md`, then the reading list the skill gives: `docs/declare.md` in full, guide chapters 01, 04 and 05, and the to-do app (`todo.declare` plus `todo-parts.declare`). After that I read only what each part of the plan needed: parts of `14-data.md` (Where data comes from, Talking to a server, the form sections), `10-touch.md` (Gesture claims, raw touch), `21-motion.md` (Springs), `12-text.md` (Text, fonts, rich text, reusing a style), `17-your-own-views.md` (Custom drawing) and `18-overlays.md` (popovers through sheets). I also ran a dozen or so `npx declare-help` lookups: `PinchEvent`, `WheelEvent`, `View.claim`, `Sheet.edge`, `Time`, `Shortcuts`, `ResponsiveLayout`, `Text.numeralWidth`, `Dialog.method.ask` and others.

**What taught me the most:**
- **`declare.md`** was the single most useful document. It's dense, but its "Seven differences" list told me in advance most of the mistakes I would then make anyway.
- **The table in SKILL.md, "What Declare handles for you"**, changed what I built. I reached for `Sheet`, `Dialog`, `Shortcuts`, `DatePicker` and `ResponsiveLayout` because the table named them. Otherwise I would probably have hand-built an overlay or a key handler.
- **Specific passages in `21-motion.md`.** The passage "Under the hand, write the value and its target together" is almost exactly the brief's "stay with the hand, never wait for them to let go", and my year surface's `handTo` / `glideTo` pair copies that example nearly line for line. The `arrive()` paragraph ("A figure that arrives with its data appears; it does not count up") answered a question I hadn't thought to ask yet.
- **`12-text.md`** happens to use "3h 40m" as its no-break-space example. Its "A run is one thing" section led me to `HTMLText` with a `Word` span for the hero lines (big figures, small words), which matched the brief's typography requirement exactly.
- **The to-do app's `AddForm`** is where I learned *computed defaults* as a form idiom: a field follows its formula until the person writes to it. My whole "the common case is confirming" design rests on it.

**What was missing or misleading:**
- **No model app shows pinch or wheel zoom on a surface.** Searching `.declare` files for `onPinch|onWheel` found only `tools/internal/sim/pinchlab.declare` (a test fixture) and one `onWheel` in `lzx-dashboard`. SKILL.md points "a grid you zoom from years to a day" at the calendar. I didn't read the calendar, so I can't say whether it covers this; from the search it doesn't use these handlers. I wrote the pinch maths from the `PinchEvent` reference and the one-sentence pattern in `10-touch.md` ("latching `anchor` at `onPinchEnd`"). It worked, but a worked "pan and zoom a timeline about the fingers" example would have saved real thought.
- **The to-do read is expensive.** About 67 KB counting its parts file. It was worth it, but it's the biggest single cost in the first hour, and a large share of it is icon drawing and theme tables I never used.
- **My grep for pinch handlers across `apps/` and `library/` returned 1 MB of hits from `apps/docs/chapters/*.json`.** These are generated copies of the guide. An agent searching for examples will hit this every time.
- **Smaller gaps that each cost a compile cycle:**
  - `->` return types must be a type *name*. An inline `{ days: WeekDay[] }` failed, and I had to add `schema Week`. `declare.md` §3 says "the return is written `-> Ret`" without saying it can't be an object type.
  - `ResponsiveLayout` refuses a `width` on its children. I then guessed that a `"stack"` plan needs `share: { now: 100, year: 100 }` to make them full width. It looked right, but I'm not certain it's the intended spelling.
  - `numeralWidth` exists on `Text` but not on `HTMLText`, which surprised me since my tabular figures lived in an `HTMLText`.

## (b) Expressing what I wanted

**Where the language fit closely:**
- **The year surface.** It's one view with `draw()` that reads `app.vEnd` and `app.vSpan`. Two `Spring`s drive those values, and the pointer, pinch and wheel handlers write them. Because `draw` re-records when what it reads changes, panning and the gliding presets needed no redraw code at all. `claim = x` on the same view let a vertical finger still scroll the page. Each gesture was one declaration, with no arbitration code. This is the part of the build where the language most clearly earned its place.
- **"Everything derived is immediately true."** The brief's §5 is essentially Declare's premise. When a POST answers, `Sessions.took()` inserts the reply. This week, the streak, the week's shape, the year's daily cells, the period figures and the list all follow, because each is a constraint over `sessions.all()`. I wrote no update code, and the assert script confirmed the streak going from 2 to 3 days.
- **Overlays as state.** `Sheet [ shown = { app.formOpen }, input(open) { app.formOpen = open } ]`, plus `exists` on the form so every opening starts fresh, was exactly the right shape.
- **`Shortcuts` inside the form.** Single-letter keys (`r b l s`, digits for effort, `=`/`-` for time) were safe because plain keys stand down while a text field has focus. That's what made the "denser on a desk" form cheap to build.
- **Computed defaults.** `minutes: number = { classroot.source?.minutes ?? app.usualMinutes(classroot.sport) }` covers three cases in one line: editing an existing session, following the guessed sport, and becoming the person's own value once they nudge it.

**Where I worked around something, or am unsure I chose well:**
- **Animated figures.** I wrote a small `Tween extends Node` class (a `value`, a `shown`, and a `Spring`) and used five of them, calling `spring.arrive()` on load. It's short and works, but every dashboard-style app will want "a number that travels". I'd expect a library primitive here, and I'm not sure my version is the idiomatic one.
- **The `{ }` versus bare-literal boundary caught me repeatedly, though each catch was cheap:**
  - `outgoing: object = ({})` failed to parse; it needs braces.
  - Bare `bold` / `black` inside a `{ }` ternary failed with DECLARE4005.
  - Style records for `d.fillText` lost their `fontWeight` literal type until I annotated them `TextStyle` (DECLARE6001).
  - Several redundant-paren hints.

  These are exactly what the "Seven differences" list warns about. I still made each mistake once.
- **DECLARE3006**, "a datapath is a place in declared data, and a literal is in none". I'd written `datapath = { [30, 45, 60, 90] }`. The rule is reasonable and the message named the exact fix. The cost is three small `Dataset`s for fixed button rows, which feels heavy for "four quick-duration chips".
- **DECLARE7001** on `describe(app.sessions.byId(app.deletingId))`. The fix was to name an intermediate attribute (`deleting: Session?`). It's the documented residue rule and the message was clear. It's still friction to declare an attribute just so a read can be wired.
- **Responsive sizes inside style bundles.** Style bundles hold only literals, so the hero `Word` span had to be rebuilt in a `textStyles` constraint to get different phone and desk sizes. That's documented, and fine.
- **Places I'm unsure the code is idiomatic:**
  - `live.readAt`, a timestamp written in `onLoad` so the running clock can count between polls, sits close to the "flag set when data arrives" drift pattern. I think it's legitimate, because the time of arrival isn't derivable from anything else.
  - Writing server replies straight into the `DataSource`'s own value, rather than a working copy, follows the guide's carve-out ("a source that loads once and is kept current by the app"). I'm reasonably but not fully confident.
  - `periodList` is a derived dataset that recomputes on every frame of a pan. I never measured its cost.

## (c) Verifying it

**How I checked:** `declare-verify` after every edit, then `declare-look` screenshots at 1280×800, 1440×900 and 390×844 with `--touch`. I used `--call`, `--set`, `--click-at` and `--read` to reach particular states, such as tapping one bar on the zoomed year and reading `app.picked.date`. Finally, an assert script (`flow.mjs`) as a finger on a phone: log a session, check the streak and the weekly count, edit it, delete it, then drag and pinch the year.

**How well the tools served me:** very well overall, and better than the tooling I'm used to in other UI stacks.
- **The diagnostics.** Every error named its fix. The structure and resolution errors came in batches, so a whole pass could be fixed at once.
- **Rung 4 boot.** It runs at both laptop and phone size with sample data, in about a second, and its note "not built at boot, so not checked here: Nudge, LogForm" honestly said what it hadn't seen.
- **Naming views by label** (`app.logSheet."Save session"`, `app.confirmDelete.Delete`) made the script readable and stable.
- **The virtual clock** with `settleMotion()` made a spring's end value assertable (`expect.approx("app.weekCount", "shown", 3, 0.01)`).

**Where the tools fell short, or I did:**
- **My first assert script used APIs I'd made up** (`drive.call?.`, `drive.read?.`) instead of checking the table in `verify.md`. That was my error, not the docs'.
- **`expect.attr("app", "weekCount.shown", 3)` returned "got undefined".** The real issue was that `weekCount` is a node and the path and attribute have to be split. A hint along the lines of "`weekCount` is a node; did you mean path `app.weekCount`, attr `shown`?" would have saved a run.
- **A failed run left a real session on the live service**, because the script stopped between the POST and the DELETE. I removed it with `curl`. Against a real backend, assert scripts have side effects. Guidance or a teardown hook for that would help; the docs talk about fixtures, but not about cleaning up after a run against a live service.
- **Things I did not verify:**
  - Whether a `Sheet` scrolls when its content is taller than the window. My desk form nearly clipped at 800 px tall, and I tightened the spacing rather than finding out.
  - `virtualize` inside the page's own scroll.
  - Finger-size target checks on the form. Rung 4 never builds `LogForm`, and I know the effort buttons are about 32 px wide.
  - Real-device gesture arbitration.
  - Dark mode. I didn't build one.

## Surprises
- How little code the gesture surface needed, given the brief's "never wait for them to let go".
- `Spring.arrive()` existing at all; the design thought behind it is evident.
- `Shortcuts` standing down inside text fields with nothing written for it.
- That the hardest-sounding part of the brief, the continuous zoomable year, was among the easiest, while the dullest part (four fixed chips) cost a diagnostic and a `Dataset`.

## Good and bad
**Good:**
- The reactive model really does remove update code.
- The diagnostics are aimed at whoever has to fix them, and they work.
- Overlays, shortcuts and the `DatePicker` are solid.
- The verify-and-look loop is fast and honest about what it didn't check.
- The docs anticipate the questions they're asked.

**Bad:**
- The literal versus `{ }` boundary costs repeated small mistakes.
- Replication requires declared data even for tiny fixed lists.
- There's no ready-made animated number.
- There's no worked example of a pan-and-zoom surface.
- Generated docs JSON pollutes searches.
- Assert scripts can mutate a live backend with no help cleaning up.

## Differences from what I'm used to
- **No render function and no effect hooks.** In React, the week total, streak and chart would each have needed to recompute in the right places after the POST. Here the question is only "what does this depend on?"
- **No CSS.** Typography and spacing are attributes, so the "type carries the design" requirement was expressed directly rather than fought for in a stylesheet.
- **The compiler holds you to the model.** It refuses things like literal datapaths and untraceable reads that other frameworks would let you get away with. That's sometimes annoying in the moment, but it consistently pushed the code toward one source of truth.

## What it reminded me of
- **QML**, most strongly: bindings, `State`, springs on properties, and anchors-like positions.
- **OpenLaszlo**, which the README names as its lineage, especially datapath replication.
- **SwiftUI's** `isPresented` sheets.
- **Flutter's** `CustomPainter` for `draw()`.
- A **spreadsheet**, in the sense that every value is a formula over other cells.

## Where I'd most want improvement
1. A model app or guide section that pans and zooms a timeline about the fingers, with pinch, wheel and drag together.
2. A library animated-number primitive, or a documented idiom for one.
3. Assert scripts against live services: cleanup hooks, or at least guidance.
4. Boot checks that can optionally build overlay contents, so a sheet's targets are checked for finger size.
5. A lighter way to replicate a small fixed list.
6. A hint when a path names a node attribute rather than a view attribute.
7. Excluding generated JSON from the repo's searchable source, or flagging it.
8. `numeralWidth` on rich text.

## What I'd use it for
Given the choice, I'd use it for:
- Data-shaped, touch-and-desk apps like this one: dashboards, logs, timelines, instruments.
- Anything where a surface is handled rather than viewed.
- Apps that should stay correct as they're edited, which is mostly an effect of the compiler's strictness.

I'd hesitate for:
- Apps that lean heavily on a third-party ecosystem (`DOMIsland` exists, but I didn't try it).
- Content-heavy sites where the existing web stack is already good enough.
- Anything where I'd need a scale or performance track record the language doesn't have yet.

That last judgment is the least certain part of this account, because I never measured performance in this build.
