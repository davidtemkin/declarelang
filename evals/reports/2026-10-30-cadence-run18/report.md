# Cadence run 18: Declare b641a1a9, Opus 5.5

**Run:** 2026-10-30, launched with `evals/craft/launch.sh cadence ~/Code/eval-cadence-18 claude-opus-5-5 b641a1a9`
against GitHub main `b641a1a9`. It is the first run after the layout-facts work (a child states facts — `flexes` takes a
weight, `shrinks`, ranges — and its layout decides; `align = stretch`; a class's geometry is a default) and the
subtraction pass (the public reference cut from 1,608 to 1,450 entries; the guide re-read and trimmed). It was run as
a smoke test before Venue: did either change put a roadblock in an agent's way?

**It did not.** The agent used `flexes` in six places, all correctly, met no layout error, and asked for no name that
the subtraction removed. It never read the runtime. It read the library once, for a reason unrelated to either change.

Opus 5.5, web tools available, the brief's idiom sentence included, one round, the standard strip (`evals/`,
`docs/system-design/` and `test/` removed from the agent's copy).

**Try it:** the app and its two assert scripts are filed beside this report (`cadence.declare`,
`cadence-model.declare`, `cadence-parts.declare`, `tests/flow-phone.mjs`, `tests/flow-desk.mjs`).

## The comparison

| | run 15 | run 16 | run 17 | **run 18** | React |
|---|---|---|---|---|---|
| Declare commit | `9444a776` | `b3012b76` | `1b3064f2` | **`b641a1a9`** | — |
| time | 18.2 min | 19.4 min | 13.8 min | **17.6 min** | 15.4 min |
| turns | 86 | 86 | 60 | **83** | 63 |
| tool calls | 85 | 85 | 59 | **82** | — |
| code, raw lines | 1,321 (2 files) | 1,455 (3 files) | 1,253 (2 files) | **1,197 (3 files)** | 2,943 |
| code, excluding comments and blanks | 927 | 1,093 | 929 | **883** | 2,537 |
| **Tokens** | | | | | |
| output (incl. thinking) | 94k (45k) | 101k (49k) | 64k (23k) | **96k (46k)** | 89k |
| fresh input (cache writes) | 253k | 317k | 212k | **264k** | 129k |
| cached input re-read | 15.1M | 17.2M | 8.8M | **14.8M** | 3.5M |
| read before first app write | 334 KB | ≈450 KB | 327 KB | **345 KB** | 23 KB |
| context at first write → end | 167k → 259k | 212k → 323k | 159k → 218k | **164k → 272k** | 30k → 134k |
| first app write at | 7.3 min | 7.1 min | 7.7 min | **5.3 min** | 2.6 min |
| **Download (gzip)** | | | | | |
| app + runtime | 151.7 KB | 147.1 KB | 200.0 KB | **200.7 KB** ¹ | 99 KB (+ a 90 KB web font) |

¹ Program 31.9 KB, runtime 156.0 KB, kernel 12.6 KB. Same shape as run 17: the app uses `HTMLText` (rich text),
`Dialog`, `Toast` and `Form`. The runtime is 0.7 KB larger than in run 17's build.

Reading was faster than ever: the first write came at 5.3 minutes, the earliest in any Cadence run, from a slightly
larger read (345 KB). The time went back into verification, which took 7.7 minutes against run 17's 4.3. Run 17 was
the outlier; this run sits between it and runs 15–16. The reasons are below. Two of them are platform defects this run
found. The rest is the agent's own test arithmetic, plus a typography loop the docs already answer.

## Where the time and the tokens went

| phase | time | API calls | cached input re-read | share of tokens |
|---|---|---|---|---|
| **Reading and planning** (0–5.3 min) | 5.3 min | 18 | 1.69M | 12% |
| **Writing** the three files (5.3–9.9) | 4.6 min | 4 | 0.67M | 5% |
| **Debugging and verification** (9.9–17.6) | 7.7 min | 52 | 12.41M | **83%** |

Within verification, by episode:

| episode | calls | cached re-read | time | whose |
|---|---|---|---|---|
| compile findings: `null` in an optional field, DECLARE4026, a baseline | 7 | 1.45M | 1.0 min | platform (see L1), and a real catch (4026) |
| first look at desk and phone; the hero line's DOM text and semantics | 11 | 2.44M | 1.4 min | half the agent's polish, half R1 below |
| flow script: its own date and streak arithmetic, three failed runs | 9 | 2.12M | 1.1 min | the agent's |
| `expect.text` doesn't read rich text | 1 | 0.24M | 0.1 min | tool (T2) |
| **a toast over the Edit button swallowed the tap, unsaid** | 6 | 1.47M | 1.2 min | **tool + runtime (T1)** |
| year surface: drag, pinch, wheel | 4 | 1.00M | 0.9 min | — verification working |
| polish: pill collapse, unit sizes, a break inside "4h 11m", the row threshold | 10 | 2.60M | 1.6 min | the agent's, with one silent layout (T3) and one missed idiom (D2) |
| final runs | 4 | 1.08M | — | — |

The platform's share is about 3.2M of the 12.4M re-read. Of that, 1.5M came from one tap that a tool could have
explained at once.

## Reading and docs

**The order the SKILL gives, followed exactly:** README, AGENTS, SKILL, `declare.md` whole, chapters 01, 04 and 05, the
to-do app (`todo.declare` and its parts, 74 KB). Then, by need: sections of 14 (Talking to a server, Forms), 10 (Pan and
zoom), 21 (Springs), 12 (Fonts), 06 (Responsiveness), the overlays chapter's headings, verify.md's assert section, and
about 30 `declare-help` lookups, most of them in batches. It read no other exemplar.

**What it says taught it most** (account, (a)):
- **The to-do app, "by a wide margin":** the computed-default form (`AddForm`), `Sheet` with `exists = { …present }`,
  and the `extends DataSource` model. All three appear in Cadence almost as written.
- **`declare.md` §5's table** of set attributes against declared attributes with a computed default.
- **Two reference entries:** `Spring` ("it starts where it is going", `arrive()`) and `RichText.textStyles`.
- **Chapter 21's "write the value and its target together"**, which "gave me the year surface's whole interaction model
  in about ten lines".

**Missing or misleading** (account, (a)):
- **Still no pan-and-zoom exemplar.** This is the third Cadence run to say so (run 17's D1). The SKILL points at the
  calendar, which has no `onPinch`. The agent's `YearSurface` (`cadence-parts.declare:284–375`) is the third
  independently written draft of the missing example.
- **`?` against `null`.** `declare.md` says `km: number | null` is the same field as `km?: number`. The compiler
  disagrees (L1). The agent retyped its request body as `object` and lost the checking.
- **Writing into a dataset.** It could not tell whether a record "reads back as written" after `removeAt`, so it
  rewrote `replace()` to set the whole sorted array. That was harmless, and not needed.

## Names

**No misses.** The ledger is empty: no refused name, no collision, no `declare-help` miss, no empty search. This is the
first Cadence run with none. Run 17 had one. The subtraction pass removed names (`WindowClose`, `judgeOn`,
`errorSchema`, overlay internals) that this agent never reached for.

**Silent misses** (from the idiom read):
- **`accessibilityRole = toggle` on an action** (`Pill`, `cadence-parts.declare:104–117`). The masthead's "+ Log
  session" is a `Pill` with `on = true`, so a screen reader hears "toggle, pressed" for a button that opens a form. The
  semantic tree the agent printed said exactly that (`toggle "Log a session (N)" [pressed]`), and it went unnoticed.
- **A space where a no-break space belongs.** `unit("h ")` (`cadence-model.declare:90`) gives the line a break
  opportunity inside "4h 11m". Chapter 12 teaches exactly this case, with "3h 40m" as its example. The agent did not
  read that section, and instead sized the figures from their column width to keep the line whole
  (`cadence.declare:239`). That heuristic is fragile, and it says so.

## API and language

**What the compiler caught:**
- **DECLARE6001 on the request body:** `null` in a field declared `distanceKm?: number` (L1).
- **DECLARE4026:** four `Choice` controls whose `on` was one equality over the sport, which a screen reader would hear
  as four toggles. The agent calls it "a genuine accessibility mistake I would have shipped". It moved them into a
  `RadioGroup` (below).
- **Rung 4: a baseline row of a class that declares no baseline** (`WrappingLayout [ align = baseline ]` holding
  `Figure`, an `HTMLText`). The message gave both fixes, and it took `align = end`.

**Where the language fit** (account, (b), and the code agrees):
- **"Nothing is stale" is the language's grain.** `week`, `streak`, `inView`, `hardest` and the weekly load are
  constraints over `sessions.all()`. `take`/`replace`/`drop` put the service's reply in place
  (`cadence-model.declare:217–225`), and the week, the streak, the bars, the year drawing and "Hardest in view" follow.
  No update code.
- **The year window** is two springs on `start` and `span`. The hand writes value and target together (`handTo`), the
  presets write only targets (`glideTo`), and the day's arrival calls `arrive()` (`cadence.declare:101–131`). About 30
  lines, interruptible, with no code for interruption.
- **One form for recording and correcting:** `EntryForm extends Form`, with `post` and `put` `DataSource`s inside it and
  `source` chosen by `editing == null` (`cadence-parts.declare:546–568`). Every field is a computed default following the
  sport until the person nudges it.
- **The layout facts, used without friction:** `Label [ flexes = true ]` takes the masthead's middle; `DayBar`, `Push`
  and `Choice` flex as class defaults; the presets flex only on a phone (`flexes = { !app.wide }`); "Hardest in view"
  gives its text the rest of the row. None needed explaining.

**Where it worked around something:**
- **A radio of its own copies library internals.** The effort row fills up to the chosen step in the chosen effort's
  tone, which neither `Radio` nor `Segmented` draws. `Choice extends Control` reaches its group as `parent` (the
  documented contract). To make the arrows check what they land on, it also copied `Radio.onKeyDown`, including
  `Focus.getFocus()` and a cast (`cadence-parts.declare:144–148`), after reading `library/radiogroup.declare`. That is the
  run's one library read. The arrows' "check the one you land on" belongs to the group (L2).
- **The request body typed `object`** (`cadence-parts.declare:557`), because of L1.
- **The figure size from the column width**, standing in for a no-break space (above).
- **A hard-coded font in `draw()`** (`cadence-parts.declare:329`, `:524`). Not forced: `provided("fontFamily")` reads
  the App's face inside `draw()` as anywhere else. The agent says it didn't look.

## Debugging and verification

The ladder: `declare-verify` after each edit; `declare-look` at 1400×900 and phone, with `--click`, `--read`, `--js`,
`--semantics`, `--drag` and `--pinch`; then two assert scripts against the live service (`flow-phone.mjs`: log a
session three days back, check the week and streak, correct it, delete it; `flow-desk.mjs`: N, typed minutes, save,
delete). Each script deletes what it makes. It cleaned up after its failed runs with `curl`, and left the service at
its original 248 sessions.

**T1 — a tap that a toast swallowed, without a word.** After a save, the flow opened the session's sheet and tapped
Edit, and the next step failed with "no node at `app.entrySheet."Five minutes more"`". The agent reproduced it with two
write-free scripts, guessed that the "Logged" toast was in the way, removed the toast on save, and passed. "I never
confirmed that was the cause." **Confirmed here, from the main tree:** on a phone, the toast sits at the window's foot,
over the sheet's Edit and Delete row. `verify.md` promises that "a press on a view something else covers fails, naming
what it would reach". It did not fail.
- The driver's cover check asks `__declare.pressAt` at the button's centre, and that walk answers Edit.
- The browser agrees: the DOM `pointerdown`, `touchstart` and `pointerup` all target Edit, because the toast's element
  passes pointer events through.
- Yet nothing reaches Edit: no `click` follows. A tap or a mouse click within the toast's box does nothing, while a tap
  on the same button beside the toast works. (Repro: a `Sheet` with a full-width `Button` at its foot and a `Toast` said
  on open.)

So the check and the routing disagree about a `Floating` notice. Either `pressAt` must walk the overlay strata as the
routing does, so the driver says "covered by `app.toast`", or the toast must take only presses on its own action, as
its reference says ("blocks nothing"). A person would hit the same thing: for four seconds after a save, Edit and Delete
don't answer under the toast.

**T2 — `expect.text` doesn't read rich text.** It walks `.text` on the views under the path, so a `HTMLText` reads as
empty, and the failure said `got "This week"` (the label beside it). The agent asserted on `accessibilityLabel` and
`html` instead.

**R1 — the semantic tree drops styled spans.** `--semantics` showed the hero line as `" sessions · h m"`.
**Confirmed:** `semantics.ts`'s `inlineText` handles text, code, strong, em, strike and link, and returns `""` for a
`styled` run (a `<span class>`). So every figure set through `textStyles` vanishes from what a screen reader is given
there. The DOM paragraph itself reads correctly. The agent added an `accessibilityLabel` "to be safe", which the
correct tree would not need. This is a runtime bug, and a one-line fix.

**T3 — a content-sized view that its children don't size.** `TextLabel [ x = center ]` inside a content-sized `Pill`
does not count toward the pill's width. That is the model's rule: a child placed from its parent can't also size it. So
the pill shrank to its padding (28 px), and the label overflowed both sides: "2 wee|Season|Year", a clipped "+ Log
session". Nothing said so; the agent found it in a picture. A child that overflows a parent sized by its content on
that axis is almost always this mistake, and rung 4 could name it. The fix it chose (Spacer, label, Spacer in a row) is
right.

**Its own errors, which the tool handled well:** three failed flow runs on its own arithmetic (two days back from a
Wednesday; a streak it forgot runs through July 31). Each failure named the request that was sent, and the note "this
run failed after talking to … which earlier runs wrote to" told it to look at its own leftovers. It says `--fixtures`
"would have avoided all of that, and I should have used it". The note offers `--fixtures` on every write now (run 17's
T3), and it still wasn't taken. That is the agent's choice, and acceptable.

**Not verified** (account, (c)): `declare-profile` over a `draw()` that walks every session on every pan frame; dark
mode (not built); gesture arbitration on a real phone.

**Scored from the main tree:** `declare-verify` passes R1–R5 for both scripts: phone, 29 steps and 16 assertions;
desk, 19 steps and 9 assertions.

## What it built

One page in two rooms:

- **At a desk:** a masthead with today's date and "+ Log session". Today takes 34–40% of the width: the session in
  progress (a reversed ink block with a running clock and a pulsing dot), "4 sessions · 4h 11m" with huge figures and
  small words, the streak, the week's seven bars in effort tone, and the last session. The year takes the rest: presets
  (2 weeks, Season, Year, All), the range on screen with its three totals, the drawn surface, and "Hardest in view".
- **On a phone:** one column, with a full-width "+ Log session" docked under the thumb.

The pieces:
- the session as an end-edge `Sheet`: duration at 96 pt in effort tone, the facts, "Longer than 48% of your rides",
  and a drawn field of every session of that sport with this one marked;
- logging as a second `Sheet`, filled in with today, the sport most often done on this weekday, and that sport's usual
  duration, distance and effort, so the common case is one tap on a Save button that says what it will record;
- delete through `Dialog`, with a `Toast` after it;
- the live session re-read every 5 s and counted on by the second between reads;
- N for a new session at a desk, where the minutes and kilometres are also typed fields.

## Is it idiomatic Declare?

Yes. Of run 17's six remaining items:
- `HTMLText` for the hero lines stays, and it is still the right tool for exact copy at two sizes in one run;
- `Choice` as a toggle is gone: 4026 moved it into a `RadioGroup`;
- polling with a `Time` stays (legitimate, as before);
- the per-frame list rebuild is gone, because there is no list of the period;
- the form exists through the sheet's motion (`exists = { app.entrySheet.present }`);
- the fixed API address stays, as the brief gives it.

The model file is pure: date arithmetic in `script` as plain functions, `Sessions` with every query and every write.
The App reads as a list of facts.

### What remains

1. **The masthead's log button is a toggle** (`cadence.declare:219`, `Pill [ on = true ]`). It should be a `Control`
   with the button role, the pill's look without `on`. The presets (`Span`) are one of four spans, closer to a
   `Segmented` than to four toggles, although 4026 can't see it, because their `on` is an approximate comparison.
2. **"4h 11m" without a no-break space** (`cadence-model.declare:90`), and the width heuristic standing in for it
   (`cadence.declare:239, 244`). Write `unit("h ")`, and the figure size can be the room's again.
3. **The radio of its own copies `Radio.onKeyDown`** (`cadence-parts.declare:144–148`). This is the platform's to fix
   (L2). Once fixed, `Choice` needs only `choice`, `on` and `press`.
4. **The body typed `object`** (`cadence-parts.declare:557`). With L1 fixed it can be `Draft` again.
5. **An `accessibilityLabel` that repeats the line** (`Figure`, `WeekLine`). With R1 fixed it isn't needed, and it can
   drift from the visible copy.
6. **No confirmation after a save.** The toast came out because of T1. The agent argues that the week and the streak
   moving are the confirmation. That is defensible, but it was decided by a bug.

## Findings, by area

### Reading and docs
- **D1 — A pan-and-zoom surface example.** This is the third run in a row to ask for it. Point the SKILL's "a grid you
  zoom" at a surface that pinches, or add the section to chapter 10.
- **D2 — Keeping a figure and its unit together.** Chapter 12 has the answer; `declare.md` and `HTMLText`'s entry don't
  mention it. One sentence where rich text is introduced in the reference: a no-break space keeps "3h 40m" on one line.
- **D3 — `?` against `null`** (with L1): either the doc's equivalence becomes true, or the doc says what the compiler
  does.

### API and language
- **L1 — `null` in an optional field.** `schema Draft [ km?: number ]` refuses `{ km: cond ? 3 : null }` with
  "`number | null` is not assignable to `number | undefined`". `declare.md:634` says the two spellings are one field,
  JSON services send and expect `null`, and the runtime already accepts `null` there from data. The type the compiler
  generates for `?` should admit `null`. (Repro: two lines; confirmed on main.)
- **L2 — The group checks what the arrows land on.** Move "an arrow checks the radio it lands on" from `Radio` into
  `RadioGroup` (focus moving among its stops). Then any direct child with a `choice` is a radio, and the reference can
  say how to write one of your own in a sentence.

### Debugging and verification
- **T1 — The cover check and the press routing disagree about a `Toast`.** The driver must say "covered by
  `app.toast`", which means `pressAt` walks the overlay strata as the routing does. Then decide what the toast takes.
  Its reference says it blocks nothing, but the presses within its box are lost.
- **R1 — Styled runs vanish from the semantic tree** (`semantics.ts` `inlineText`: recurse into any run that has
  `inline`, as `md.ts` and `rich-text.ts` already do).
- **T2 — `expect.text` reads rich text,** from the same text the semantic tree gives once R1 is fixed.
- **T3 — Rung 4 names a child that overflows a parent sized by its content**, on the axis where the child places
  itself from the parent.

## What changes next

Ranked by general leverage:

1. **R1 — Styled runs in the semantic tree.** This is a real accessibility defect for every app that sets figures with
   `textStyles`, and it is one line.
2. **T1 — The covered press.** It is a promise `verify.md` makes and broke here, and it cost the run its largest
   platform episode. Fix the check first, then the toast's press policy.
3. **L1 — `?` admits `null`.** It is a contradiction between the reference and the compiler, met by any app that
   writes to a JSON service.
4. **L2 — Arrows in the group.** Custom choice controls are common, and copying internals is the result.
5. **D1 — The pan-and-zoom example.** It recurs.
6. **T2, T3, D2, D3.**

## The agent's account, verbatim

Asked after the build by resuming the finished session with read-only tools (Read, Glob, Grep), with the
standard questions (`impressions.txt`). 1.2 minutes, 6.2k output tokens, counted apart from the build. Also filed alone
as `account.md`.

The account opens with a correction: the dev server it started had exited. That is the run's `finish.sh` stopping
what the agent left running, by design, and not a fault.

### Building Cadence in Declare: an account for the Declare team

First, a correction to my last message. I said the app was running at `http://127.0.0.1:8200/…`. The server did answer 200 when I checked it, but the background `npm start` exited with code 1 shortly afterwards, so it probably isn't running now. You asked me not to change anything, so I haven't restarted it. `npm start` in `declarelang/` will bring it back.

#### (a) Getting up to speed

**What I read.** I followed `skill/SKILL.md`'s order exactly: `docs/declare.md`, guide chapters 01, 04 and 05, then `apps/todo/todo.declare` and `todo-parts.declare` in full. After that I read only what I needed for specific parts:
- 10-touch § Pan and zoom
- 14-data § Talking to a server and § Forms
- 21-motion § Springs
- 12-text § Fonts
- 06-layout § Responsiveness
- the overlays chapter's headings
- verify.md's assert section

I also ran `npx declare-help` a few dozen times.

**What taught the most.**
- **The to-do app**, by a wide margin. Its `AddForm` showed the computed-default pattern: `list: string = { app.defaultList }`, which follows its formula until assigned. That became the core of my entry form, where defaults follow the chosen sport until the person nudges them. `Sheet [ … ] + exists = { …present }` and the `Tasks extends DataSource` shape were lifted almost directly.
- **`declare.md` §5's table** of *set* attributes versus *declared attributes with a computed default*. It's the single most important distinction in the language, and it's stated clearly.
- **Two `declare-help` entries** told me exactly what to do. `Spring` explains "it starts where it is going" and `arrive()`. `RichText.textStyles` showed how to set figures large inside one run of text.
- **The "write the value and its target together" example** in 21-motion. It gave me the year surface's whole interaction model in about ten lines.

**What was missing or misleading.**
- **Pan and zoom.** SKILL.md's table points to the calendar for a surface panned and zoomed about the fingers. A grep of `apps/**/*.declare` found no `onPinch` anywhere, and `onWheel` only once, in `lzx-dashboard`. So the only model was the fragment in 10-touch. It was correct, but I wrote pinch-plus-wheel-plus-drag on one view without ever seeing a working program do it. I'm not sure my `pinching` flag, and my handling of a finger lifting mid-pinch, are right.
- **Writing a record inside a handler.** §5 says a written attribute "reads back as written". I couldn't tell whether that holds for a dataset's contents after `removeAt`, so I rewrote `replace()` to set the whole sorted array. That may have been unnecessary.
- **Schema `?` versus JSON `null`.** The schema doc says `km: number | null` is the same as `km?: number`. In practice a body containing `null` failed to typecheck against my `Draft` schema (DECLARE6001: `'number | null' is not assignable to 'number | undefined'`). The service wants `null`, so I retyped `draft` as `object` and lost the checking. Either the doc's equivalence doesn't apply to values you construct yourself, or I misread it.

#### (b) Expressing what I wanted

**Where it fit well.** The brief's hardest requirement was "nothing is stale and nothing needs a refresh", and that is exactly the language's grain.
- `week`, `streak`, `inView`, `hardest` and the year's weekly load are all constraints over `sessions.all()`.
- After a POST, the reply goes in through `sessions.take(s)`, and the week total, the streak, the bars, the year drawing and the "Hardest in view" line all followed. I wrote no update code at all.
- **"Numbers travel"** came almost for free: a `Figure` class with `shown` sprung to `value`. Because the whole page `exists = { app.ready }`, every spring is built after the data has arrived, so nothing counts up on open. That's exactly the case the Spring docs describe.
- **The year window** is two springs on `start` and `span`. The hand writes value and target together, the presets write only targets, and `day.onLoad` calls `arrive()`. It was about 30 lines of App methods, and it's interruptible without any code for interruption.
- **Form with a `source` DataSource** declared inside the form class (`post` and `put`), with the source chosen by `editing == null`, was a clean way to share one form between recording and correcting.
- **DECLARE4026** (four Choices that are really one choice) caught a genuine accessibility mistake I would have shipped.

**Where I worked around it.**
- **Mixed-size text that must read as exact copy.** The brief needs "4 sessions · 3h 40m" with the figures huge and the words small. I used `HTMLText` with `<span class='fig'>`. Four things went wrong along the way:
  - (1) A span containing only a space collapsed, so the gap I put between "4h" and "11m" did nothing.
  - (2) There's no way to keep "4h 11m" together, and at one width the line broke inside it. My fix is a heuristic, `figSize = min(heroSize, this.width * 0.2)`, which I don't trust at other widths or digit counts.
  - (3) A `WrappingLayout [align = baseline]` holding Figures failed R4 because the class declares no baseline. The diagnostic was good, but I didn't know how to state a baseline for rich text, so I switched to `align = end`.
  - (4) `--semantics` showed the line as `" sessions · h m"`. I added an `accessibilityLabel` to be safe, but I don't know whether a real screen reader would actually lose the figures.
- **A custom radio-style control.** Satisfying DECLARE4026 while keeping my box-shaped choices meant writing `Choice extends Control` with `(parent as RadioGroup).pick(...)`. I also copied `Radio`'s `onKeyDown` arrow-key logic, including `Focus.getFocus()` and a cast, from `library/radiogroup.declare`. Copying library internals is a smell; a base class like `RadioItem` would have avoided it.
- **Centering a label in a content-sized control.** `TextLabel [ x = center ]` inside a `Pill` made the pill's content width collapse to its padding. That produced the unreadable "2 wee|Season|Year" buttons and a clipped "+ Log session". Nothing in R4 flagged it; I only found it in a screenshot. Spacer–label–Spacer fixed it.
- **Drawing text in `draw()`.** I hard-coded `"700 11px -apple-system, system-ui, sans-serif"`, duplicating the App's font list and the `Label` size. I didn't find a way to reach the provided face from a `DrawContext`, though I didn't look hard.
- **Desk versus phone.** `ResponsiveLayout` handled the two-column arrangement well. But I mirrored `app.wide` decisions in a dozen constraints (`app.tap`, figure sizes, the presets' `State [ applied = { !app.wide }, width = 100% ]`). That's probably fine; it's what the to-do app does too.

#### (c) Verifying it

- **`declare-verify`.** R1–R4 ran in a couple of seconds every time. The two real compile problems (the `draft` typing, the baseline) were each named with a usable fix.
- **`declare-look`.** This was the most valuable tool of the build. Screenshots caught every visual bug: the pill collapse, "81h 57m" reading as "81.57", the line breaking inside "4h 11m", faint grey making an easy session look disabled, and phone presets wrapping onto two lines. `--read`, `--js`, `--drag` and `--pinch` let me confirm the surface follows the hand (span 120→40 under a ×3 pinch) without writing a script.
- **Assert scripts.** Driving by label paths (`'app.entrySheet."Effort 8"'`, `'app.dlg."Delete"'`) is excellent; I never needed a selector. `expect.request("POST", …, { body })` checked the exact payload sent to the service.
- **Writes to the live service.** The tool said, every run, which writes it had sent and that earlier runs had left records behind. That was genuinely useful, because my first three runs failed on my own wrong expectations, not on app bugs. I miscounted "two days earlier" from a Wednesday, and I forgot Jul 31 extends the streak. Each failed run left a record that I deleted with curl. `--fixtures` would have avoided all of that, and I should have used it.
- **Where the tools fell short:**
  - `expect.text` doesn't see `HTMLText` content, so I asserted on `accessibilityLabel` and `html` instead.
  - `console.log` from an assert script didn't appear in the output.
  - After a save, a tap on the detail sheet's Edit apparently never registered, even though verify.md says a press on a covered view fails and names the cover. I guessed the toast was in the way, removed the save toast, and the flow passed. **I never confirmed that was the cause.**
- **Not checked at all:** I never ran `declare-profile`, despite a `draw()` that iterates every session on every pan frame. I didn't test dark mode (the app doesn't support it) or a real device's gesture arbitration.

#### Surprises
- How much the derivations didn't cost me. I recompute week, streak, weekly load and in-view stats freely, and nothing visibly lagged in headless Chrome. I haven't measured it.
- The type checker knows theme tokens and schema fields inside `{ }` bodies, so misspellings would have died at compile time.
- The drift checklist in SKILL.md. I read it before writing and it changed what I wrote. For example, I kept dates in `script` only as pure functions, and kept state off script.
- The service-write accounting in verify.

#### Good and bad
**Good:**
- One update model, with assignment as the only setter.
- Computed defaults.
- Springs as declarations, with `arrive()`.
- Diagnostics that name the fix.
- Label-addressed test driving.
- A small, readable surface: three files, with the App mostly a list of facts.

**Bad:**
- Rich-text figure typography is fragile: wrapping, collapsing spaces, baselines, semantics.
- Layout mistakes are silent; content size collapsing under `x = center` was found only by eye.
- Library controls aren't easily re-skinned without copying internals.
- The canonical pan/zoom pattern exists only as a doc fragment.

#### Differences from what I'm used to
There's no render function, no hooks, no dependency arrays, no flexbox, and events don't bubble. Children come from datapaths rather than `.map`, and styles come from provided values rather than a cascade. Event handlers can't be async; a request is a member (`DataSource`) whose lifecycle you read as state. I had to unlearn reaching for `fetch` and `setState`. It did slow me down for the first hour, and after that it felt simpler.

#### What it reminded me of
- **QML**, most strongly: property bindings, `State`, a `Spring` that resembles `Behavior on x`, and named child ids.
- **OpenLaszlo/Flex MXML**, which the README cites as its lineage.
- **Svelte's** `$:` reactive declarations.
- A **spreadsheet**, for the derived-value core.

#### Where I'd most want improvement
1. A rich-text "keep together" option, plus a baseline and `expect.text` support for `HTMLText`.
2. A layout lint for a content-sized view whose children position themselves relative to it.
3. A worked pan/pinch/wheel surface in one of the shipped apps (perhaps the calendar the table already cites).
4. A documented base class for custom choice controls.
5. Making the schema's null-versus-optional rule match the doc's claim, or correcting the doc.
6. A way to use fonts from inside `draw()`.

#### What I'd use it for
Given the choice, I'd use it for data-dense, glanceable apps that need direct manipulation and have to work on both phone and desk: dashboards, trackers, internal tools, interactive charts, and motion-heavy prototypes. For those, constraints plus springs gave me more quality per line than I'd expect from React. I'd hesitate for large content sites, or for anything that leans on an existing component or library ecosystem. I'd also want to see it past 1.0, and profiled on real devices, before betting a production mobile app on it. That hesitation comes from unknowns, not from any problem I actually hit.

## The names ledger

```
NAMES — eval-cadence-18: 0 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)

SUMMARY: 0 of 0 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
