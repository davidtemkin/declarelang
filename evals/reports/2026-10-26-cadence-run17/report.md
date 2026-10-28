# Cadence run 17: Declare 1b3064f2, Opus 5.5

**Run:** 2026-10-26, launched with `evals/craft/launch.sh cadence ~/Code/eval-cadence-17 claude-opus-5-5 1b3064f2`
against GitHub main `1b3064f2`, in parallel with Murmur run 11. It is the first Cadence run after v0.5.2, which fixed
what run 16 met: a set of shortcuts declared inside an open sheet is in force, a clipped view rasters only its box, a
press refuses a covered point, DECLARE4022 warns of a control that shows it is chosen and reports nothing,
`WrappingLayout` deals equal cells, and the reference points at baseline wrapping, `present` and `Segmented`. It is
also the first run on the renamed foundation (`touchFirst`, `DrawContext`, `autoFetch`, the folded `TextInput`) and the
first with the names ledger (the names ledger, at the end).

Opus 5.5, web tools available, the brief's idiom sentence included, one round, the standard strip (`evals/`,
`docs/system-design/` and `test/` removed from the agent's copy).

**Try it:** the app, its assert script and eight pictures are filed beside this report (`cadence.declare`,
`cadence-parts.declare`, `tests/flow.mjs`, `shots/`).

## The comparison

| | run 15 | run 16 | **run 17** | React |
|---|---|---|---|---|
| Declare commit | `9444a776` | `b3012b76` | **`1b3064f2`** | — |
| time | 18.2 min | 19.4 min | **13.8 min** | 15.4 min |
| turns | 86 | 86 | **60** | 63 |
| tool calls | 85 | 85 | **59** | — |
| code, raw lines | 1,321 (2 files) | 1,455 (3 files) | **1,253 (2 files)** | 2,943 |
| code, excluding comments and blanks | 927 | 1,093 | **929** | 2,537 |
| **Tokens** | | | | |
| output (incl. thinking) | 94k (45k) | 101k (49k) | **64k (23k)** | 89k |
| fresh input (cache writes) | 253k | 317k | **212k** | 129k |
| cached input re-read | 15.1M | 17.2M | **8.8M** | 3.5M |
| read before first app write | 334 KB | ≈450 KB | **327 KB** | 23 KB |
| context at first write → end | 167k → 259k | 212k → 323k | **159k → 218k** | 30k → 134k |
| first app write at | 7.3 min | 7.1 min | **7.7 min** | 2.6 min |
| **Download (gzip)** | | | | |
| app + runtime | 151.7 KB | 147.1 KB | **200.0 KB** ¹ | 99 KB (+ a 90 KB web font) |

¹ Program 31.9 KB, runtime 155.3 KB, kernel 12.6 KB. The runtime is larger because this app uses `HTMLText` (about
14 KB of rich-text modules), `virtualize`, `DatePicker` and `Dialog`, not because the runtime grew; see idiom note 1.

Declare finishes before React for the first time in Cadence, as it did in Venue run 6. The reading before the first
write is the same as before (327 KB, 7.7 min). The difference is everything after it: 31 calls of checking where run 16
needed 46, at a context 100k smaller by the end. Cached input halved. It is still 2.5× React's, because React's agent
reads 23 KB before it writes.

## Where the time and the tokens went

| phase | time | API calls | cached input re-read | share of tokens |
|---|---|---|---|---|
| **Reading and planning** (0–7.7 min) | 7.7 min | 23 | 2.11M | 24% |
| **Writing** the two files (7.7–9.5) | 1.8 min | 3 | 0.48M | 5% |
| **Debugging and verification** (9.5–13.8) | 4.3 min | 31 | 6.20M | **71%** |

Verification is still most of the tokens because it runs last, at the largest context. But it took 4.3 minutes, where
run 16 took 7.5. There were 13 `declare-verify` runs, 9 `declare-look` calls (8 pictures) and 3 assert runs. **It read
no library or runtime source**; run 16 read `keys.ts` seven times.

## Reading and docs

**The order the SKILL gives, followed:** README, AGENTS, SKILL, `declare.md` whole, chapters 01, 04 and 05, and the
to-do app (`todo.declare` with its parts, about 67 KB). Then, by need: parts of chapters 14, 10, 21, 12, 17 and 18, and
about a dozen `declare-help` lookups. It read no other exemplar. Run 16 read the calendar and weather whole, about
115 KB more.

**What it says taught it most** (account, (a)):
- `declare.md`'s "Seven differences" list.
- The SKILL's "What Declare handles for you" table. It is the reason the app uses `Sheet`, `Dialog`, `Shortcuts`,
  `DatePicker` and `ResponsiveLayout` and not hand-built versions.
- Three passages: "write the value and its target together" (21), `arrive()` (21), and `12-text.md`'s "3h 40m" example
  with "A run is one thing", which led it to `HTMLText` for the hero lines.
- The to-do app's computed-default form.

**Missing or misleading** (account, (a)):
- **No worked pan-and-zoom surface.** It searched for `onPinch|onWheel` across `apps/` and `library/` and found one test
  fixture and one `onWheel`. The calendar, which the SKILL points to for "a grid you zoom", has neither handler. It wrote
  the pinch arithmetic from the `PinchEvent` entry and one sentence in chapter 10. It worked (`cadence-parts.declare:285–
  320`).
- **Generated JSON in searches.** That grep returned 1 MB of hits from `apps/docs/chapters/*.json`, 31 tracked
  generated copies of the guide. Every agent that searches for an example meets this.
- **The to-do read is expensive.** About 67 KB, much of it icon drawing and theme tables it never used. It is the first
  read the SKILL gives, so this is the same cost as run 16's exemplar reads, made smaller (D1 from run 16 applies).
- **Small gaps, one compile each:**
  - a `->` return type must be a named type (an inline `{ days: WeekDay[] }` failed; it declared `schema Week`);
  - `ResponsiveLayout` refuses a `width` on its children (it guessed `share: { now: 100, year: 100 }` for the stack,
    which `ResponsiveLayout.plan` confirms is right; the agent didn't look it up);
  - no `numeralWidth` on `HTMLText`.

## Names

From the names ledger (at the end): **1 miss, 0 collisions, 0 `declare-help` misses, 0 empty searches.**

| min | name | on | the platform's answer | outcome |
|---|---|---|---|---|
| 10 | `numeralWidth` | `HTMLText` | DECLARE2000, no hint | resolved at once, by dropping it (2 sites) |

This is not a name carried over from elsewhere. `numeralWidth` is Declare's own name, on `Text`. The miss shows a real
gap: rich text can't set tabular figures, and the hero figures are in rich text. Run 16 used no foreign names either.
Nothing was declared in place of a platform name.

## API and language

**What the compiler caught:** the boundary between bare literals and `{ }`, repeatedly:
- `outgoing: object = ({})` failed to parse;
- bare `bold`/`black` inside a `{ }` ternary gave DECLARE4005;
- style records for `d.fillText` lost their literal `fontWeight` until typed `TextStyle` (DECLARE6001);
- several redundant-paren hints.

The other errors:
- DECLARE3006 on a literal `datapath`;
- DECLARE7001 on an untraceable read (`describe(app.sessions.byId(app.deletingId))`);
- the `->` return type;
- the `ResponsiveLayout` width.

The agent reports that every message named its fix.

**Where the language fit** (account, (b), and the code agrees):
- **One source of truth, written through.** `Sessions extends DataSource` (`cadence.declare:59–125`) has `creator`,
  `updater` and `remover` sub-sources whose `onLoad` splices the reply into the records with `insert`/`removeAt`. The
  week, streak, week shape, year cells, period figures and list are all constraints over `sessions.all()`. No update
  code.
- **The year surface** (`cadence-parts.declare:285–`) is one view whose `draw` reads two sprung numbers (`vEnd`,
  `vSpan`). Drag, pinch, trackpad pinch and wheel each write value and target together (`handTo`). `claim = x` leaves
  vertical scrolling to the page.
- **Overlays as state:** `Sheet [ shown = { app.formOpen }, input(open) … ]` with `exists` on the form, so every opening
  starts fresh (`:514–517`). Delete asks through `Dialog`.
- **`Shortcuts` inside the open sheet** (`cadence-parts.declare:572–589`): letters for the sport, digits for effort,
  `=`/`-` for time, ⌘↩ to save. This is the v0.5.2 fix for run 16's L1 working as intended. The keys stand down while the
  note field has focus, with nothing written for it.
- **Computed defaults** (`:542–551`): `minutes = { source?.minutes ?? app.usualMinutes(sport) }` covers editing,
  following the sport, and the person's own value in one line.
- **"The write finished" as an overridable hook.** `Sessions.saved(s)` is an empty method (`cadence.declare:87`) that
  the App's instance overrides (`:156`). The model no longer reaches up into the App, which was run 16's L4. The agent
  found this shape itself, and it should be the documented pattern.

**Where it worked around something:**
- **A number that travels.** A five-line `Tween extends Node` (value, shown, `Spring`), used five times, with
  `arrive()` on load (`cadence-parts.declare:136–140`, `cadence.declare:204–211`). Every dashboard wants this, and the
  agent expected a library primitive.
- **Small fixed lists need a `Dataset`.** Four quick-duration chips and ten effort cells became three `Dataset`s
  (`cadence-parts.declare:557–559`) because a literal `datapath` is refused. The agent: "the dullest part (four fixed
  chips) cost a diagnostic and a `Dataset`".
- **An intermediate attribute to make a read traceable** (`deleting: Session?`, `cadence.declare:371`) — the documented
  rule, with a clear message, but still friction.

## Debugging and verification

The agent's ladder: `declare-verify` after each edit, then `declare-look` at 1280×800, 1440×900 and 390×844 `--touch`,
reaching states with `--call`, `--set`, `--click-at` and `--read`. Then an assert script (`tests/flow.mjs`, a finger on a
phone): log a session, check the streak and week count, edit it, delete it, drag and pinch the year.

| # | the question | steps | outcome | cheapest answer |
|---|---|---|---|---|
| E1 | does it compile and boot? | `declare-verify` ×~8 | the literal/`{ }` and typing errors above, each fixed from its message | — the ladder working |
| E2 | does it look right at desk and phone? | `declare-look` ×9, 8 pictures | spacing tightened so the desk form fits 800 px; hero sizes | — pictures were the right tool |
| E3 | does the flow hold? | 3 assert runs | first script used invented APIs (`drive.call?.`); then `expect.attr("app", "weekCount.shown", 3)` gave "got undefined" | `weekCount` is a node: a hint "did you mean path `app.weekCount`, attr `shown`?" (T2) |
| E4 | a failed run left a session on the live service | `curl` to delete it | restored | run 16's T4 again: nothing offers `--fixtures` or a teardown when a script writes (T3) |

**What it did not verify** (account, (c)): whether a `Sheet` scrolls when its content is taller than the window; finger
sizes in the form (rung 4 never builds `LogForm`, and the agent knows the effort cells are about 32 px wide); `virtualize`
inside the page's scroll; real-device gestures; dark mode.

**Scored from the main tree:** `declare-verify` passes R1–R5 (`tests/flow.mjs`, 30 steps). Run 16's R4 failure (a
correct drawing reported blank) is gone.

## What it built

One page in two rooms (`shots/`):

- **At a desk:** Today in 38%. The week's count and hours are set large in rich text, with small unit words. Below them
  are the streak, the week's shape as seven bars in effort colour, the running session with a ticking clock, and the last
  session. The year takes the other 62%: the drawn surface, range presets, the period's totals, and the period's sessions
  as a virtualized list.
- **On a phone:** one column on the page's scroll.

The pieces:
- the session detail as an end-edge `Sheet`, with the duration in 96-pt figures and a drawn standing among its sport;
- logging as a second `Sheet` (`LogForm`), every field a computed default, with a `DatePicker` for an earlier day;
- delete through `Dialog`;
- the live session polled every 5 s and counted on by the second between polls.

## Is it idiomatic Declare?

Yes, more so than run 16. The run 16 report listed seven missteps. Four are gone:
- the `Keys` chain (now `Shortcuts` in the sheet);
- the digit-count font size (now rich text);
- the model calling up into the App (now a hook);
- one-of-many controls reporting nothing (`Choice` reports `accessibilityPressed`).

### What remains

1. **`HTMLText` for two hero lines.** "4 sessions · 3h 40m" (`cadence.declare:407–420`) is built as an HTML string from
   the tweened figures with `<span class='Word'>`, sized per room through `textStyles`. The guide led it there and it
   works, but it costs about 14 KB of rich-text runtime for two lines, and it loses `numeralWidth`, which these figures
   need most. `WrappingLayout [ align = baseline ]` with two `Text` sizes does the same with tabular figures.
   Either the reference should say when a mixed-size line is a layout and not rich text, or `HTMLText` should take
   `numeralWidth` (L1).
2. **`Choice` is a hand-built toggle, used as a radio** (`cadence-parts.declare:156–180`) for the sport, day, quick
   durations, effort and range presets. It now reports pressed, which DECLARE4022 accepts. But a set of toggles is not
   one-of-many: a screen reader hears five pressed/unpressed buttons and not "1 of 4", and the arrows don't move among
   them. `Segmented` is the platform's answer, and the reference now points there. The agent didn't ask. DECLARE4022 could
   say "if these are one-of-many, `Segmented`" when several sibling controls share the pattern (T1).
3. **Polling with a `Time`** (`livePoll`, `cadence.declare:168`) with `readAt` stamped in `onLoad`. This is legitimate,
   since the arrival time isn't derivable. A `DataSource` refresh interval would make it one attribute; there is none.
4. **`periodList` rebuilt on every frame of a pan** (`:287`), a `Dataset` over `app.period`. It isn't measured. Under a
   finger the window moves every frame, so the list replicates every frame. This is worth a look on a phone.
5. **The form exists only while `formOpen`** (`cadence.declare:517`), so each opening starts fresh, but the sheet
   likely empties as it slides out. `exists = { app.logSheet.present }` keeps it through the motion. Not checked.
6. **The API address is fixed in the source** (`cadence-parts.declare:22`, `http://127.0.0.1:8320`), as the brief gives
   it. This is fine for the eval, but it breaks on a phone over the LAN.

## Findings, by area

### Reading and docs
- **D1 — No pan-and-zoom exemplar.** The SKILL points "a grid you zoom" at the calendar, which uses no pinch or wheel.
  Point it at a surface that does, or add a short guide section: drag, pinch and wheel about the fingers, value and
  target together. The agent's `YearSurface` is a fair draft of that example.
- **D2 — Generated guide JSON pollutes searches.** `apps/docs/chapters/*.json` (31 tracked files, 540 KB) answer every
  grep for an example. Add an `.ignore`/`.rgignore` entry, or stop tracking them.
- **D3 — The to-do read is long for a first read** (67 KB, much of it icons and themes). A line-range index at its head,
  as run 16 proposed for exemplars, lets an agent read the form and the model only.
- **D4 — A `->` return type must be a name**, which `declare.md` §3 doesn't say.

### API and language
- **L1 — `numeralWidth` on rich text,** or guidance that a mixed-size figure line is a baseline `WrappingLayout`. This is
  the run's one name miss and its one size cost.
- **L2 — A number that travels.** `Tween` (value, shown, spring, arrive) is written by hand in every dashboard-shaped
  run. A library class, or a documented four-line idiom in chapter 21.
- **L3 — Small literal lists.** Replicating four fixed chips needs a declared `Dataset`. Either accept a literal array
  as a `datapath` source for replication, or document the `Dataset { { "items": […] } }` one-liner where DECLARE3006
  fires.
- **L4 — Document the `saved` hook** this agent found for "the write finished", closing run 16's L4.

### Debugging and verification
- **T1 — Toggles used as one-of-many.** DECLARE4022 now accepts them. When a row of sibling controls each derives `on`
  from one equality over the same value, suggest `Segmented`.
- **T2 — `expect.attr` on a node path.** "got undefined" for `weekCount.shown` should say that `weekCount` is a node and
  give the split form.
- **T3 — Assert scripts write to the live service.** This is the second Cadence run in a row. Offer `--fixtures`, or a
  teardown, when a script first sends a write.
- **T4 — Boot doesn't build overlay contents,** so the form's 32-px effort cells were never checked for finger size. An
  option to open each declared `Sheet`/`Dialog` at rung 4 would cover the forms that most need it.

## What changes next

Ranked by general leverage:

1. **D2 — Hide the generated JSON from search.** It is tiny and contained, and every agent that greps meets it.
2. **T4 — Rung 4 opens overlays.** Forms live in sheets, and their targets are never checked.
3. **D1 — A pan-and-zoom surface example.** The SKILL currently points at an exemplar that lacks it.
4. **T3 — Fixtures offered for writing scripts.** It recurs.
5. **L2 — The travelling number.**
6. **T1 — Toggles used as one-of-many → `Segmented`.**
7. **L1 — `numeralWidth` on `HTMLText`.**
8. **T2, L3, L4, D3, D4.**

## The agent's account, verbatim

Asked after the build by resuming the finished session with read-only tools (Read, Glob, Grep), with the
standard questions (`impressions.txt`). 1.3 minutes, 7.1k output tokens, counted apart from the build. Also filed alone
as `account.md`.

### Building Cadence in Declare: an account for the people who make it

#### (a) Getting up to speed

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

#### (b) Expressing what I wanted

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

#### (c) Verifying it

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

#### Surprises
- How little code the gesture surface needed, given the brief's "never wait for them to let go".
- `Spring.arrive()` existing at all; the design thought behind it is evident.
- `Shortcuts` standing down inside text fields with nothing written for it.
- That the hardest-sounding part of the brief, the continuous zoomable year, was among the easiest, while the dullest part (four fixed chips) cost a diagnostic and a `Dataset`.

#### Good and bad
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

#### Differences from what I'm used to
- **No render function and no effect hooks.** In React, the week total, streak and chart would each have needed to recompute in the right places after the POST. Here the question is only "what does this depend on?"
- **No CSS.** Typography and spacing are attributes, so the "type carries the design" requirement was expressed directly rather than fought for in a stylesheet.
- **The compiler holds you to the model.** It refuses things like literal datapaths and untraceable reads that other frameworks would let you get away with. That's sometimes annoying in the moment, but it consistently pushed the code toward one source of truth.

#### What it reminded me of
- **QML**, most strongly: bindings, `State`, springs on properties, and anchors-like positions.
- **OpenLaszlo**, which the README names as its lineage, especially datapath replication.
- **SwiftUI's** `isPresented` sheets.
- **Flutter's** `CustomPainter` for `draw()`.
- A **spreadsheet**, in the sense that every value is a formula over other cells.

#### Where I'd most want improvement
1. A model app or guide section that pans and zooms a timeline about the fingers, with pinch, wheel and drag together.
2. A library animated-number primitive, or a documented idiom for one.
3. Assert scripts against live services: cleanup hooks, or at least guidance.
4. Boot checks that can optionally build overlay contents, so a sheet's targets are checked for finger size.
5. A lighter way to replicate a small fixed list.
6. A hint when a path names a node attribute rather than a view attribute.
7. Excluding generated JSON from the repo's searchable source, or flagging it.
8. `numeralWidth` on rich text.

#### What I'd use it for
Given the choice, I'd use it for:
- Data-shaped, touch-and-desk apps like this one: dashboards, logs, timelines, instruments.
- Anything where a surface is handled rather than viewed.
- Apps that should stay correct as they're edited, which is mostly an effect of the compiler's strictness.

I'd hesitate for:
- Apps that lean heavily on a third-party ecosystem (`DOMIsland` exists, but I didn't try it).
- Content-heavy sites where the existing web stack is already good enough.
- Anything where I'd need a scale or performance track record the language doesn't have yet.

That last judgment is the least certain part of this account, because I never measured performance in this build.

## The names ledger

From `evals/craft/names.py`, run on the build's logs when the report was filed: every name a check refused, what the platform answered, and how it ended.

```
NAMES — 2026-10-26-cadence-run17: 1 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    10 · attribute · numeralWidth         · HTMLText                 · —                  · none         · ×1  ·   10 · resolved
         HTMLText has no attribute 'numeralWidth' — 2 sites, also on line 387 [DECLARE2000] (line 378, col 39)

SUMMARY: 1 of 1 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
