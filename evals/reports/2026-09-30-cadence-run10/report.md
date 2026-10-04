# Cadence run 10: Declare 9b622ea1, Opus 5.5

**Run:** 2026-09-30 01:11 UTC, launched with `evals/craft/launch.sh cadence ~/Code/eval-cadence-10 claude-opus-5-5`
against GitHub main `9b622ea1`: data model, vocabulary pass, the 21 task briefs, and the heading pass. No
GitHub Release has been cut for it; the latest Release is still v0.5.0, the commit run 8 used. Opus 5.5
(`claude-opus-5-5`), with web tools available and the brief's idiom sentence included. One round.

## The comparison

| | run 8 | run 9 | **run 10** | React |
|---|---|---|---|---|
| Declare commit | v0.5.0 `cd699d70` | `224f6940` | **`9b622ea1`** | — |
| time | 29.9 min | 12.4 min | **19.6 min** | 15.4 min |
| turns | 145 | 71 | **85** | 63 |
| code | 1,606 lines, 6 files | 1,128 lines, 3 files | **1,077 lines, 1 file** | 3,008 lines |
| **Tokens** | | | | |
| output (incl. thinking) | 149k | 65k | **83k** (32k thinking) | 89k |
| fresh input (cache writes) | 376k | — | **228k** | 129k |
| cached input re-read (cache reads) | 32.4M | — | **11.0M** | 3.5M |
| read before first app write | 367 KB | 430 KB | **257 KB** | 23 KB |
| context at first app write | — | 192k | **136k** | 30k |
| context at end | — | 266k | **233k** | 134k |
| first app write at | — | 5.9 min | **9.3 min** | 2.6 min |
| **Download (gzip -9)** | | | | |
| app + runtime | — ¹ | 141 KB ² | **139 KB** ² | 99 KB (JS 94 + CSS 5) |
| web fonts | none | none | **none** | Archivo, 90 KB upright (+102 KB italic if used) |

¹ Run 8 was built on v0.5.0 and no longer compiles on today's runtime: a class with no `extends` is
now a View, and its event-named methods are refused. So there is no current measurement.
² Both Declare apps were compiled with today's runtime (`9b622ea1`, `declarec`, WebAssembly kernel), so
the difference between them is the app's own. Neither uses a web font; both use system type.

The React bundle was rebuilt from the filed source (`evals/reports/2026-09-25-cadence-react-1`) with a
stock `index.html` and `vite.config.ts`, because the report keeps only `src/` and `package.json`.

The run 9 cache totals weren't kept: its stream was deleted with the run directory, and only the
phase measurements survived. "Read before first app write" is the size of tool results before the
first Write or Edit to the app. "Context" is the prompt size of that turn.

## Lines of code, comments separated

The "code" row in the table above is a raw line count. Split out below: a comment line is a whole line that is a `//`
comment or sits inside a `/* … */` block, including each Declare file's Markdown header. A comment at the end of a code
line counts as code. React is every `.tsx`, `.ts` and `.css` file in `src/`; its `index.html`, `vite.config.ts`,
`tsconfig.json` and `package.json` (65 lines in the original run) are not counted.

| | raw | blank | comment | **code** | comment share of non-blank |
|---|---|---|---|---|---|
| run 8 | 1,687 | 268 | 259 | **1,160** | 18% |
| run 9 | 1,189 | 158 | 160 | **871** | 16% |
| **run 10** | 1,077 | 95 | 93 | **889** | 9% |
| React | 2,943 | 280 | 126 | **2,537** (TSX 1,266 · TS 492 · CSS 779) | 5% |

On code alone, run 10 is the same size as run 9. It carries half the comments of runs 8 and 9. Declare comes to about
a third of React's code.

## What changed with the briefs

- **The route changed as intended.** The agent went README → SKILL → the brief index, then read 18 of the
  21 briefs, all of declare.md, only two guide chapters (10 touch, most of 12 text) and half of
  tracker.declare. It ran `declare-help` about 30 times. Run 9 read 18 guide chapters and all of
  calendar.declare.
- **Reading dropped 40%:** 257 KB against 430 KB before the first write. Context at the first write
  dropped from 192k to 136k, and context at the end from 266k to 233k.
- **The first write still came later (9.3 against 5.9 minutes).** That's mostly how it wrote, not how
  much it read. Run 10 wrote the whole app as one 1,069-line Write, and generating that is in the
  timestamp. Run 9 wrote its model file first. Output tokens rose to 83k, 32k of them thinking.
- **In its own account, it names the briefs as "the most efficient format."** The `motion` brief's
  under-the-hand rule shaped the whole year chart, and it "worked first time."

## What it built, and how

- **Data, all through DataSource.** It loads through one `class Log extends Dataset` with the summary
  methods (`streak`, `between`, `usualMinutes`, `harderThan`). It saves, edits and deletes through
  DataSource POST, PUT and DELETE, and polls the live session with `Time`. Its derived Datasets are built
  from methods. There is no raw `fetch`. This follows the new data teaching; one `log.put(record)` after a
  POST moves every total.
- **Motion:** a `Tally extends Node` (a Spring plus `trackChanges`/`onChange`, modelled on tracker's
  `Roll`), and one sprung `t` per sheet.
- **Gestures:** claims only (`claim = x`, pinch, wheel), with no arbitration code. The bars take no
  pointer input, and the chart finds the nearest session to a tap.
- **Verification:** clean through R4 from the main tree (242 nodes, 249 of 308 constraints statically
  wired). No R5 assert: it checked with its own puppeteer scripts and then deleted them. It saved, edited
  and deleted a real session through the UI, and left the service back at 248 records.
- **One file of 1,077 lines,** where run 9 had three. It uses no library Button or Segmented; it built
  its own `Control` subclasses (`Option`, `Nudge`, `EffortCell`, `SpanChip`, `SaveButton` and others).

## Findings for the platform

1. **Rich text inside a view that starts hidden measures 2px wide and never re-measures (likely a runtime
   bug, not yet reproduced by me).** An `HTMLText` with no width inside a Sheet with `visible` false at
   first layout rendered one character per line once the sheet opened. The agent confirmed the cause by
   removing the Sheet's `visible` (width 158px). Its workaround was plain `Text` in the sheets, so the
   units there are the same size as the digits. No rung caught it; only a screenshot did. This is also
   the main cause of the extra time over run 9.
2. **Built-in name collisions, for the third run running:** `Pick` (TypeScript's, DECLARE4015),
   `surface`, and now the method `hold` (an event name). Every one was caught at compile time with a
   clear fix, but it is a recurring tax.
3. **A subclass cannot supply content to its base class's child** ("'body' is a child DetailSheet
   inherits from Sheet — a subclass cannot declare it again"). It restructured into a `SheetBody` class.
4. **Replicated rows can't reach typed ancestor geometry:** `parent` is a plain `View`, and a nullable
   alias turns every read into "possibly null". It moved the chart geometry to App and used long absolute
   paths (`app.page.today.shape.colW`). It flags this itself as brittle.
5. **Doc gaps it names:**
   - the coordinate frame of `PinchEvent.center`: it had to grep `runtime/src/backend.ts`;
   - whether `onClick` receives an event;
   - `Keys` firing while a text field has focus;
   - baseline alignment refusing a `Spacer`.

## Where things are

- Run directory: `~/Code/eval-cadence-10`; the app is at `work/declarelang/my-apps/cadence/cadence.declare`,
  and the logs are in `logs/`. The account below is `logs/impressions.md`, and its full stream is
  `logs/impressions.stream.jsonl`.
- Review URL, while the agent's dev server is up: http://localhost:8201/my-apps/cadence/cadence.declare
- Filed here with the app's source, `prompt.txt` (the build prompt) and `impressions.txt` (the question that produced the account below).

---

## The agent's account, verbatim

This was asked after the build, as a separate step that could only read files, with the same prompt as
Cadence run 9 and Murmur run 3. The step took 1.3 minutes, used no tools, wrote 6.6k output tokens, and
cost about $0.19 (the session was still cached).

# Building Cadence in Declare: an account for the Declare team

For scale: Cadence is one file of about 1,080 lines. It took roughly a dozen compile-and-fix cycles to reach a clean compile, then about six rounds of screenshots and fixes. Most of my time went to reading beforehand and checking in the browser afterwards, not to fighting the compiler.

## (a) Getting up to speed

**What I read, in order:** `README.md`, then `skill/SKILL.md`, then all of `docs/declare.md`. After that, `docs/operational/intake.md` and the briefs `shape-of-an-app`, `loading-and-saving`, `pointer-and-drag`, `motion`, `derived-values`, `layout-and-sizing`, `text-and-themes`, `editing-records`, `overlays`, `drawing`, `time`, `your-own-control`, `using-controls`, `lists-from-data`, `moving-arrangements` and `scrolling`. I also read `guide/10-touch.md`, most of `guide/12-text.md`, and the first 500 lines of `apps/tracker/tracker.declare`. I ran `npx declare-help` perhaps 30 times.

**What taught me the most:**
- **`docs/declare.md`** was the best single read. Two passages in particular set my defaults before I wrote a line: "the 'Seven differences'" and the table of *set* versus *declared* attributes in §5 (an attribute written `x = { … }` is owned by its constraint; one declared `x: T = { … }` is a replaceable formula).
- **The briefs** were the most efficient format: a verified example, then a short list of rules that bite. The `motion` brief's line "Under the hand, write the value and the spring's target together, so the spring rests" shaped the whole year chart. The chart's `setPeriod` writes both `start` and `startTo` while a finger is down, and only the target from the preset buttons. That worked first time.
- **The drift check at the end of SKILL.md** was useful. It stopped me reaching for `narrow ? … : …` branches and pushed me to `ResponsiveLayout`.
- **`declare-help`** was the tool I trusted most. The claim that "a true miss exits 1, so silence is trustworthy" held up. Its answer for `lerp` ("no entry…") told me immediately to write my own in `script`.
- **The tracker app** taught me idioms no brief covers: spreading a preset theme with app tokens (`{ ...SanFrancisco, ...Tracker }`), and `Roll`, a Spring-on-a-number class that became my `Tally`.

**What was missing or misleading:**
- **Pinch coordinates.** `PinchEvent.center` is documented as a field, but not which coordinate frame it uses. I had to grep `runtime/src/backend.ts` to find "root-space e.center". I then used `e.x`, assuming it is view-local like other pointer events. I never confirmed that on a real two-finger gesture, only in emulation.
- **Event payloads.** `declare-help View.onClick` doesn't say whether the handler receives an event. I assumed it doesn't, stored the press point in `onPointerDown`, and read it back in `onClick`. That works, but I may have worked around something that was never a limitation.
- **Rich text sizing.** `RichText`'s reference says a short run with no width "is as wide as its words". That is true until the text sits inside a hidden ancestor (see below), and nothing warns about that.
- **Locals can't be annotated.** Nothing in the docs I read prepared me for `const out: Bar[] = []` being refused in a method body. §2 does say "that covers locals", but in a paragraph about value bodies, and I read it as not applying to methods. The diagnostic was clear, so this cost one cycle.

## (b) Expressing what I wanted

**Where it fit my intent well:**
- **Derived state.** "Everything derived from the history is immediately true" is exactly what the language is built for. `Log extends Dataset` holds summary methods (`streak`, `between`, `usualMinutes`, `harderThan`). Every screen is a constraint over them. After a successful POST, one `log.put(record)` updates the week total, streak, week bars, year bars and period stats with no extra wiring. Watching "2 · 1h 24m" become "3 · 3h 4m" in the harness was the moment the model paid off most clearly.
- **Springs.** Getting numbers to glide to new values, and seeding them outright on first load, was one small class: `Tally extends Node`, with a Spring plus `trackChanges`/`onChange`. The sheet's rise and fall is one sprung scalar `t`, and position, scrim opacity and visibility all derive from it.
- **Gesture claims.** "the handler is the claim" plus `claim = x` gave the year chart exactly the policy the brief asked for (sideways drag, two-finger pinch, the page keeps vertical scroll). I verified that the element gets `touch-action: pan-y`. I did not have to write a gesture-arbitration layer at all, which was a real relief.
- **No bubbling was a good design constraint.** Because presses don't propagate, bars with their own tap handlers would have blocked dragging the chart. So the bars take no pointer input, and the chart finds the nearest session to a tap (`pickAt`). That turned out better on a phone anyway, because the tap target is wider than the bar.
- **Data sources.** `DataSource` covers GET, POST, PUT and DELETE, and `schema = Session` typed the replies. `url = { … + app.selId }` followed by `fetch()` ("fetch() settles first") made "aim and send" one line.

**Where I had to work around it:**
1. **Rich text collapses inside hidden views.** An `HTMLText` with no width, inside a Sheet whose `visible` is false when it first lays out, measured 2px wide and stayed that way after the sheet opened, so the text rendered one character per line. I first suspected negative `letterSpacing` and was wrong; removing it changed nothing. Temporarily removing the Sheet's `visible` fixed it (158px), which confirmed the cause. My workaround was plain `Text` runs in the sheets, so there units are the same size as the digits, against the text guide's own "a run is one thing" advice. This is the one place the finished app is visibly worse than I intended because of the platform. I'm fairly confident it's a runtime bug rather than misuse, but I haven't reduced it to a minimal case.
2. **No way for a subclass to supply content to its base class.** I wanted a `Sheet` base class with a padded `body` that each subclass fills. The compiler said "'body' is a child DetailSheet inherits from Sheet — a subclass cannot declare it again". I ended up with a separate `SheetBody` class that each subclass instantiates, and the Sheet sizes itself from `contentHeight`. It's fine, but "a frame class with content supplied by the subclass" is a very common shape, and the rule pushed me to restructure rather than express it.
3. **Reaching an ancestor from replicated rows.** A replicated `WeekBar`'s `parent` is typed as plain `View`, so the geometry on the parent (`colW`, `barsH`) wasn't reachable in a typed way. A nullable alias (`strip: Strip = { app.page.year.plot }`) turned every read into "Object is possibly 'null'". So I moved the chart geometry up to `App` and used long absolute paths like `app.page.today.shape.colW`. It works, but it's brittle: rename a container and the paths break, and the geometry now lives on the App instead of the view it describes. I may be missing an idiom here; if there is one, the `lists-from-data` brief is where I'd have looked for it.
4. **Method names collide with events.** Naming a method `hold` produced "'hold' is an EVENT here, delivered to 'onHold'". That is a good diagnostic for a real trap, but it means the event namespace is reserved against ordinary verbs. The same class of problem: a child named `surface` collided with a runtime member, and a class named `Pick` collided with TypeScript's `Pick` (DECLARE4015). All three were caught at compile time with clear fixes, which is the right outcome.
5. **Baseline alignment.** `SimpleLayout [ align = baseline ]` requires every child, including `Spacer`, to declare a `baseline`. I fell back to `align = end` or `center`. That's defensible, but a row of type at different sizes is exactly where baseline alignment matters most.
6. **Things I did that may not be idiomatic:**
   - I used `as any` on `DataSource.errorBody` in `why()`, which the drift check warns against. That body is the server's shape, not my data, but a schema for error bodies would have avoided it.
   - The Dial sizes its font from the string's length times 0.58. It's a heuristic because a view can't size from its own measured width without a cycle.
   - I wrote the sheet's keyboard guard (skip shortcuts while the note field is focused) by hand, because `Keys` fires regardless of focus. I think that's by design, but it's easy to get wrong.

## (c) Verifying it

**What I used:**
- **`npx declare-verify --rung=4`** after every edit. Rungs 1 to 3 (structure, resolution, typecheck) reported all independent errors at once, and nearly every message named the exact rewrite: DECLARE2005 for a Spring on a constraint-bound `height`, DECLARE1002 for redundant parentheses, DECLARE4011 hinting `x = center`. That is the best compiler-error experience I've had in an unfamiliar language. Rung 4's headless boot caught a real bug (`null.rows` from reading a derived dataset before its source loaded) that the typechecker could not.
- **My own puppeteer scripts** against the dev server, at 1440×900 and 390×844 with touch. I took screenshots, read values with `__declare.find`, `inspect` and `explain`, and drove input with the mouse, the touchscreen, and raw CDP `Input.dispatchTouchEvent` for drags and pinches. I also posted, edited and deleted a real session through the UI, then confirmed the service was back to 248 records.

**How well the tools served me:**
- **Rungs 1 to 4:** excellent, as above.
- **Introspection:** good. `inspect(...).width` returning 2 found the rich-text bug in one query, and `explain` showed the width was a static constraint with no writer, which pointed me away from my own code. On `inspect` versus `find` I just followed `verify.md`'s note that `find(path)[attr]` is the real read, and I didn't compare them myself.
- **What I didn't use:**
  - I skipped the official rung 5/6 path (`--assert` and `--states` scripts). A throwaway puppeteer harness was quicker for exploring, but it means none of my checks are left behind as repeatable tests.
  - I never opened the Inspector.
  - I didn't look into why 59 of 308 constraints fall back to runtime tracking rather than being wired statically.
  - I didn't test dark mode, the 400-error path, or a real device.
- **The core limitation:** no rung saw the rich-text collapse. It settled cleanly, typechecked, and booted. Only a screenshot showed it. `verify.md` is honest that rungs 1 to 4 can't see this. It would help if the headless boot flagged pathological measurements, such as a text box 2px wide and 300px tall.

## Surprises

- How often the first working version of a behaviour was also the continuous one. Drag, pinch and wheel all update `start` and `span` in the same frame, and every bar, tick and statistic follows, with no special animation code.
- That `onClick` and `onPointerMove` coexist on one view, with the runtime settling tap versus drag. I expected to write my own threshold.
- That `script` functions are opaque to dependency tracking. The docs say so plainly, and it shaped my code: summaries became methods on `Log`, and only pure formatting stayed in `script`.
- The effort it took to find out what `PinchEvent` coordinates mean.

## Good and bad

**Good:**
- Compiler diagnostics that name the fix.
- `declare-help`.
- The briefs.
- Springs that can be retargeted mid-motion.
- Gesture claims declared by the handler.
- Data sources whose state is reactive.
- Summaries as methods on a `Dataset` subclass.
- Theme spreading.
- The rule that no attribute may be both set and constrained, which prevented a whole class of bugs I didn't have to think about.

**Bad:**
- The hidden-measurement bug in rich text.
- No content supplied by subclasses.
- Untyped `parent` in replicated rows.
- Baseline alignment that fails as soon as a `Spacer` is involved.
- Event names squatting on ordinary method names.
- Payload shapes and coordinate frames not always documented.

## Differences from what I'm used to

- **No render function.** Instead there are standing relationships, and a handler writes facts, never consequences. Coming from React, the biggest adjustment was not wanting an effect anywhere.
- **Replication from datapaths (`:rows[]`) instead of `.map()`.** Combined with derived datasets that keep the source's own records, filtered rows write back without any id bookkeeping.
- **No CSS and no cascade.** Values are provided down the tree instead, and layout is an attribute you can swap or animate.
- **The strictness is closer to Elm or Rust than to JavaScript frameworks.** It refuses things that others allow and then leave to fail at runtime.

## What it reminded me of

- **QML** most of all: property bindings, states, animated springs, a typed declarative tree with a scripting language underneath.
- **OpenLaszlo** by lineage, which the README states.
- **SwiftUI** for the modifier-free but attribute-dense feel.
- **Solid and Svelte's newer reactivity** for the fine-grained updates. Declare differs in that dependencies are extracted at compile time.
- **Spreadsheets**, in the plain sense that every cell is a formula.

## Where I'd most want improvement

1. **Fix rich text measured while hidden, and have rung 4 flag degenerate text boxes.**
2. **A slot or content mechanism for subclasses** of frame-like classes (sheets, cards, dialogs).
3. **Typed access to an ancestor from replicated children**, or a documented idiom for it.
4. **Event signatures and coordinate frames in `declare-help`** (`onClick`'s payload, `PinchEvent.center`).
5. **Baseline alignment that tolerates `Spacer`** and views with no text.
6. **A starter template for `--assert` scripts**, so the quick ad-hoc harness I wrote becomes the repeatable test by default.

## What I'd use it for

- **Readily:** direct-manipulation, data-heavy, motion-rich interfaces like Cadence's year chart. That includes dashboards, timelines, calendars, trackers, and tools where one surface zooms and pans. There, the combination of constraints, springs and gesture claims is a real advantage, and the compiler's strictness makes machine-written code reviewable.
- **More cautiously:** anything relying on deep accessibility, complex text editing, or a large third-party component ecosystem. That's not because I found problems there. I didn't exercise those areas, and the platform is pre-1.0.
- **Uncertain:** large-team maintainability (the long absolute paths worried me), and how it behaves under real-device gesture conflicts, which I could only emulate.