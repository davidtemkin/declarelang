# Murmur run 11: Declare 1b3064f2, Opus 5.5

**Run:** 2026-10-26, launched with `evals/craft/launch.sh murmur ~/Code/eval-murmur-11 claude-opus-5-5 1b3064f2`
against GitHub main `1b3064f2`, in parallel with Cadence run 17. The service ran at the same scale as run 10: about
44,000 messages, the longest conversation 30,500. One round, one phase, no intervention, the standard strip.

It is the first Murmur on the renamed foundation (`userScrolling`, `autoFetch`, `DrawContext`, the folded `TextInput`,
the page API) and the first with the names ledger.

**Try it:** the app, its five assert scripts, its `DESIGN.md` and four pictures from the main tree are filed beside this
report. A LAN copy is served at `http://10.0.0.169:8242/my-apps/murmur11/murmur.declare` while the run's service is up.

**Scored from the main tree:** `declare-verify murmur.declare` is clean through R4 (408 nodes at boot; 360 of 491
constraints statically wired). All five of the agent's assert scripts pass at R5 from main:
- `live` (5 steps);
- `phone` (10);
- `media` (9);
- `arrive` (6);
- `clock` (0 steps; a timing probe).

## The comparison

| | run 9 | run 10 | **run 11** | React-2 | Svelte-1 |
|---|---|---|---|---|---|
| Declare commit | `611b696f` | `613f8875` | **`1b3064f2`** | — | — |
| time | 23.4 min | 21.1 min | **20.9 min** | 17.6 min | 20.5 min |
| turns · tool calls | 124 · 123 | 109 · 108 | **108 · 107** | — | — |
| code, raw lines | 1,368 (5 files) | 1,190 (4 files) | **1,233 (3 files)** | — | — |
| code, excluding comments and blanks | 955 | 944 | **870** | 2,815 | 2,922 |
| **Tokens** | | | | | |
| output (incl. thinking) | 102k (44k) | 86k (35k) | **92k (41k)** | — | — |
| fresh input (cache writes) | — | 275k | **304k** | — | — |
| cached input re-read | 23.8M | 21.6M | **20.1M** | — | — |
| read before first app write | — | 389 KB | **449 KB** ¹ | — | — |
| context at first write → end | — | 177k → 283k | **208k → 310k** | — | — |
| first app write at | — | 5.2 min | **7.5 min** ¹ | — | — |
| **Download (gzip)** | 148.5 KB | 156.5 KB (168.4 on today's main) | **169.8 KB** ² | 185.2 KB | 65.8 KB |
| runtime source read | — | 0 | **0** | — | — |
| library source read | — | 6 calls | **2 greps** (`floating`, `dialog`) | — | — |

¹ It counts a throwaway prototype (`proto.declare`, written at 3.0 min and probed with `declare-look`) as reading. The
prototype tested whether hidden panes keep their scroll offset before the design committed to one pane per
conversation. The first file of the app itself was written at 7.5 min.
² Program 27.1 KB, runtime 129.9 KB, kernel 12.6 KB; built from main.

**The headline:** level with run 10 on time, with 7% less cached input and the fewest code lines yet (870). It is
Declare's third Murmur in a row near 21 minutes. React-2 is still faster at 17.6. Unlike Cadence and Venue this week,
the gain didn't come here. The reason is below: debugging and verification are 77% of the tokens, and most of that went
on three silent failures and one misleading line in `verify.md`.

## Where the time and the tokens went

| phase | time | API calls | cached input re-read | share of tokens |
|---|---|---|---|---|
| **Reading, planning and the prototype** (0–7.5 min) | 7.5 min | 27 | 3.48M | 17% |
| **Writing** the three files (7.5–12.2) | 4.7 min | 5 | 1.09M | 5% |
| **Debugging and verification** (12.2–20.9) | 8.7 min | 56 | 15.48M | **77%** |

## Reading and docs

**The order the SKILL gives, followed:** `declare.md` whole, chapters 01, 04 and 05, the to-do app whole. Then, by need:
07 Scrolling, 16 Collections, 13 Media, 12 Text, 10 Touch, 06 Layout, 18 Overlays, and the Streams part of 14. Then
about 40 `declare-help` lookups (`Socket`, `Stream`, `Media.position`, `firstVisibleRow`, `scrollAnchor`,
`Popover.asSheet`, `defaultPlacement`, `TweenLayout`, and so on). It read no exemplar beyond the to-do app; it mapped
the tracker with `declare-help map` and didn't read it.

**What it says taught it most** (account, (a)):
- Chapter 07's "Keeping the reader's place" and "Following the end": `scrollAnchor = end` is half the brief, "and it was
  true".
- Chapter 16's "What sits between records belongs to the row after it": day headings, runs of one sender and the NEW rule
  are each decided by a line from its neighbours.
- The to-do app, for `trackChanges`, `exists`, `State`, theme spreads, `Glyph extends Icon` and the custom layout.

**Library source reads (reference gaps):**

| read | what it wanted | what answers it |
|---|---|---|
| `grep showFor\|show()\|shown library/floating.declare` | why `reactor.showFor(…)` did nothing | nothing in the reference. Its own `input(open)` override on the `Popover` replaced the base's, and the base's `input` is what writes `shown`. It fixed this with `super.input(open)` (`murmur.declare:620`). (L1) |
| `grep full\|surface\|fill library/dialog.declare` | why the full-screen photo viewer had a light background | the `Dialog` paints the theme's `surface`. It fixed this with a theme override. `declare-help Dialog` could say which token the surface takes. (D2) |

## Names

From `names.txt`: **1 miss, 0 collisions, 0 `declare-help` misses, 0 empty searches.**

| min | name | on | the platform's answer | outcome |
|---|---|---|---|---|
| 13 | `fresh` | `State` | DECLARE6001 "'fresh' is not a member of State — declare it … or fix the name", no hint | resolved at once |

This is a scope slip, not a foreign name: `this.fresh` inside a `State` meant the row's own `fresh`. The message
could say "inside a `State`, `this` is the State; the row's member is `classroot.fresh`". Nothing was declared in place
of a platform name.

## API and language

**What the compiler caught** (account, (c)), each fixed from its message:
- `textAlign = end` (it's `right`);
- bare `semibold` inside braces (DECLARE4005);
- a literal `datapath` (DECLARE3006);
- `cornerRadius` typed as `number[]`;
- `this.fresh` in a `State`;
- DECLARE7001 on `titleOf(app.convos.thread(…))`;
- a boot error for a width on a row its `Flow` layout places.

DECLARE4025 ("give the facts names") made the code better: `startsRun` became `otherVoice` plus `broke`.

**Where the language fit** (the account and the code agree):
- **Scroll anchoring is one attribute.** `Transcript [ scrolls = y, scrollAnchor = end ]` (`murmur-lines.declare:93`).
  The line `virtualize = true` held a 30,500-message thread, with a jump to row 0 and a drag to row 12,735 working first
  time.
- **One pane per conversation.** `Transcript [ datapath = :threads[] ]` (`murmur.declare:398`), with the inactive ones
  hidden, so each keeps its own place. The prototype tested this before the design depended on it.
- **The live feed is one write per frame.** `Socket [ active = { app.convos.loaded } ]` → `receive` → `append`,
  `attach`, `confirm` (`:472–487`). List order, unread badges, typing lines and transcripts follow with no update code.
- **"Unread" is a constraint.** `lastSeen` advances only while the pane is `reading` (open, at the end, page visible;
  `murmur-lines.declare:104`). Badges, the "N new" pill and the header count all derive from it.
- **Optimistic sends:** appended under a local `ref`; the service's `sent` frame fills in its id (`convos.confirm`).
- **Bubble kinds:** `classFor` picks `TextLine`, `PhotoLine` or `VoiceLine` (`:125–126`), each with
  `defaultPlacement = bubble`.
- **The open conversation is the URL's fragment** (`location`, `:505–509`), so Back closes it on a phone. Run 10 didn't
  do this, and run 10's benchmark had to open conversations by clicking.

**Where it did not:**
- **Three failures with no message, each found by investigation:**
  - **A custom layout's box.** `Flow extends TweenLayout` returned `{x, y, w}`. The rows existed but drew nothing, and
    `visible` read `null`. It found the fix (`h` and `vis: true`, `murmur.declare:202`) by noticing that the to-do app's
    `Glide` returns `vis`. (L2)
  - **Overriding `input` on a Floating** without `super` silently disabled `show()`. This cost about ten minutes and a
    library grep. (L1)
  - **An `Audio` laid out by the App's own layout.** `Stage` placed it as the first pane and pushed the inbox right. The
    fix was `ignoreLayout = true` (`:678`), found at once with `--outline`. An `Audio` draws nothing, so a layout should
    pass over it. (L3)
- **A `Dataset` per row for its reaction tallies** (`counts`, `murmur-lines.declare:193`), because a computed
  `datapath` is refused. Cadence run 17 met the same rule for four fixed chips. (L4, and Cadence's L3)
- **An untyped frame dispatch.** `JSON.parse` with `any` (`:477`), because the frame's `message` field is a `Message`
  in one frame type and an id in another. That's a brief/service shape, not a Declare gap.
- **The waveform is a `View` with pointer handlers** (`murmur-parts.declare:116`): no slider role, no keyboard seek. The
  agent named the gap itself. A library scrubber that accepts a custom drawing would close it. (L5)

## Debugging and verification

| # | the question | steps | outcome | cheapest answer |
|---|---|---|---|---|
| E1 | do hidden panes keep their scroll? | the prototype, two `declare-look` runs with `--read …scrollY` | yes. This was a cheap probe before the architecture depended on it. | — a model use of `declare-look` |
| E2 | does it compile and boot? | `declare-verify` ×3 | the seven errors above, each fixed from its message | — the ladder working |
| E3 | why are the inbox rows invisible? | pictures, `--outline`, reading the to-do app's `Glide` again | the box needed `h` and `vis` | the layout contract stated where `place()` is documented, and a boot error for a box missing them (L2) |
| E4 | why is the inbox pushed right? | `--outline` | the `Audio` was laid out | a layout passing over views that draw nothing (L3) |
| E5 | why don't live frames arrive in checks? | `declare-look --wait 9000 --read app.live.last` → a WebSocket probe in Node → reading `verify.md` → a `clock.mjs` probe timing `drive.wait` | `drive.wait(6000)` took about 100 ms of wall time, so the service's real-time schedule never ran. Fixed with a Node-side `setTimeout` in each script. | `verify.md:192` says `drive.wait(ms)` passes "`ms` of real time, and exactly `ms` of the program's virtual time". The agent measured otherwise. Either the line or the driver is wrong. (T1) |
| E6 | why doesn't the reaction picker open? | `declare-look --hold …`, a grep of `library/floating.declare` | the `input` override (L1) | a warning for an overriding `input` on a Floating that never calls `super` |
| E7 | why is the photo viewer light? | pictures, a grep of `library/dialog.declare` | the Dialog paints `surface`; fixed with a theme override | the `Dialog` entry naming its surface token (D2) |
| E8 | does reading back hold still when a message arrives? does the phone return to its place after Back? | `arrive.mjs`, `phone.mjs`, touch drags | scroll offset identical before and after an arrival (219,026); unread 1 → 0 after the jump; the return position held | — assert scripts addressing views by text were the right tool |

**What it did not verify** (account, (c)):
- real-device arbitration between a hold and a scroll;
- the date chip appearing mid-scroll;
- hover-button flicker;
- the inbox glide;
- load time for the 5.5 MB history on a slow device;
- dark mode.

**A side effect worth noting:** the agent wrote a memory file into its own Claude project
(`~/.claude/projects/-Users-temkin-Code-eval-murmur-11-work/memory/declare-virtual-clock.md`) recording the virtual-clock
workaround. Eval run directories are numbered, so it can't reach a later run today. But launch.sh should run agents with
auto-memory off, or check that the memory directory starts empty, so a reused directory can't carry knowledge across
runs.

## What it built

Pictures in `shots/`:
- **At a desk:** the inbox at the side and the conversation beside it.
- **On a phone:** one at a time, the conversation sliding over the list as a custom `Stage` layout's `t` goes from 0
  to 1.

The pieces:
- **The inbox:** avatars (one face, or two tucked together for a group) and the latest line, ordered by newest activity
  with a `TweenLayout` glide. Unread counts are in the accent; the header reads "3 with news".
- **The transcript:**
  - day headings;
  - sender runs with the name over the first bubble;
  - a NEW rule where the unread began when the conversation was opened;
  - a floating date chip from `firstVisibleRow`;
  - a "jump to latest" pill when away from the end;
  - typing lines;
  - reaction tallies under bubbles;
  - photos, opening in a full-screen `Dialog` viewer;
  - voice messages with a drawn waveform scrubber, one sound at a time through a single `Audio`.
- **Reactions:** a hold on a phone, or a hover button at a desk, opens a `Popover` palette of seven marks.
- **The composer:** text, plus a photo from the tray, sent optimistically.

## Is it idiomatic Declare?

Yes, and it reads well: `DESIGN.md` and the file headers explain each decision.

### What it gets right
- Every hard requirement of the brief (place-keeping, live arrival, unread) is an attribute or a constraint, not code.
- A prototype before an architectural bet, checked with `--read`.
- A theme for the design's tokens; the open conversation in the URL; the facts API (`atEnd`, `userScrolling`,
  `firstVisibleRow`) read where the brief asks for them.

### Missteps
1. **Hand-placed overlays inside a row.** The hover react button sits at `x = { classroot.mine ? parent.col.x -
   this.width - 4 : … }` (`murmur-lines.declare:260`). This is legitimate placement relative to a sibling, and the agent
   doubted it because of the drift check. A layout of its own isn't better here.
2. **The waveform isn't a control** (L5).
3. **`counts: Dataset` in every recycled row** (L4).
4. **`Viewer.input(open)` without `super`** (`murmur.declare:602`). Here this is correct, because the viewer opens by
   state (`shown = { app.viewing != null }`). But it is the same shape that broke the `Popover`, and only the binding
   tells the two apart. L1's warning has to know the difference.

### Workarounds the platform forced
- The Node-side sleeps in every assert script (T1).
- `ignoreLayout` on the `Audio` (L3).

## Findings, by area

### Reading and docs
- **D1 — The layout box contract.** `place()` returns `{x, y, w, h, vis}`, and missing `h` or `vis` draws nothing. Say
  so in the `Layout.place` entry and in chapter 06's custom-layout section, with the full record.
- **D2 — Overlay surfaces.** `Dialog` (and the other floatings) should name the theme token their surface paints.

### API and language
- **L1 — Overriding `input` on a Floating.** A subclass's `input` that never calls `super.input` disables `show()` unless
  `shown` is bound. Warn when an override never calls `super` and `shown` isn't bound.
- **L2 — A layout box missing `h` or `vis`** should be a boot error naming the layout and the missing fields, not
  invisible rows.
- **L3 — Views that draw nothing** (`Socket` and `Time` are `Node`s; `Audio` is a View that draws nothing) should be passed
  over by layouts, or declared `ignoreLayout` by default.
- **L4 — A replicated derived array.** A per-row `Dataset` for a computed list (tallies here; Cadence's fixed chips)
  recurs. Accept a computed array as a replication source, or document the one-line `Dataset` idiom where DECLARE3006
  fires.
- **L5 — A scrubber that takes a drawing.** `Slider` with a custom track, so a waveform gets the slider role and keyboard
  seek.

### Debugging and verification
- **T1 — `drive.wait` and real time.** `verify.md:192` says real time passes; the agent measured that it doesn't. For a
  program talking to a real-time service, that sends checks in the wrong direction. Fix either the line or the driver.
  If waits are virtual by design, document the Node-side sleep beside it. This cost the run its longest episode (E5).
- **T2 — A `this` in a `State`.** DECLARE6001 on `this.fresh` inside a `State` should say that `this` is the State and
  suggest `classroot.fresh`.
- **T3 — Eval hygiene:** run agents with auto-memory off (see above).

## What changes next

Ranked by general leverage:

1. **T1 — `drive.wait` and real time.** Any app with a live service meets it; the doc currently says the opposite of
   what the agent measured.
2. **L2 + D1 — The layout box contract, stated and checked.** Custom layouts are what we want agents to write more of,
   and a missing field fails silently.
3. **L1 — The `input` override warning.**
4. **L3 — Layouts pass over views that draw nothing.**
5. **L4 — Computed arrays as a replication source.** It recurs across apps (Cadence run 17 too).
6. **T3 — Auto-memory off in eval runs.**
7. **L5, D2, T2.**

## The agent's account, verbatim

Asked after the build by resuming the finished session with read-only tools (Read, Glob, Grep), with the
standard questions (`impressions.txt`). 0.9 minutes, 4.6k output tokens, counted apart from the build. Also filed alone
as `account.md`.

### Building Murmur in Declare: an account for the Declare team

I didn't change anything for this. One housekeeping note: the dev server I started in the background has since stopped, so the URL from my last message won't load until `npm start` is run again.

#### (a) Getting up to speed

**What I read.** I followed `skill/SKILL.md` closely:
- `docs/declare.md` in full;
- guide chapters 01, 04 and 05;
- the to-do app (`todo.declare` and `todo-parts.declare`) whole.

Then I read only what the plan needed: 07 Scrolling, 16 Collections, 13 Media, 12 Text, 10 Touch, 06 Layout, 18 Overlays, and the Streams part of 14 Data. I looked everything else up with `npx declare-help`. That was about 40 lookups, mostly `Socket`, `Stream`, `Media.position`, `firstVisibleRow`, `scrollAnchor`, `Popover.asSheet`, `defaultPlacement` and `TweenLayout`.

**What taught me the most.** Three things:
- **Guide chapter 07, "Keeping the reader's place" and "Following the end".** This was the single most valuable read. Half of the brief's hard requirements are scroll anchoring: stay at the bottom when there, hold the words still when reading back, report "new below". The chapter says this is one attribute, `scrollAnchor = end`, and even gives the `newBelow` constraint. It was true.
- **Chapter 16, on `virtualize` and "What sits between records belongs to the row after it".** This gave me the whole transcript design: day headings, runs of one sender, and the NEW rule, all decided by each line from its neighbours via `rowIndex`. The `firstVisibleRow` entry literally says "a chat's date chip". It felt like the docs had anticipated my app, which may be because they were written with chat in mind.
- **The to-do app.** This is where I learned the idioms: `trackChanges`/`onChange`, `exists`, `classroot`, `State` overrides, theme spreads, the `Glyph extends Icon` drawing pattern. I copied its shape for the icons and the custom layout.

**What was missing or misleading.**
- **The custom-layout box contract.** I wrote `Flow extends TweenLayout` returning `{x, y, w}`. The rows existed but were invisible, and `visible` read `null`. The fix was adding `h` and `vis: true`, which I found by noticing that todo's `Glide` returns `vis`. I didn't see the box shape stated anywhere I read, and nothing warned me.
- **Overriding a Floating's `input`.** I wrote `input(open) { if (!open) app.reacting = null }` on a Popover. That silently disabled `show()`, because the base `input` is what writes `shown`. I found it by grepping `library/floating.declare`. Section 3 of `declare.md` does say a subclass's method replaces the base's, but a warning for overriding `input` without `super` would have saved me ten minutes.
- **Time in checks.** `verify.md` says `drive.wait(ms)` passes "`ms` of real time, and exactly `ms` of the program's virtual time". I measured a `drive.wait(6000)` taking about 100 ms of wall time, and the WebSocket server's timed frames never arrived. I may be misreading the sentence, but for a program talking to a real-time service it's misleading either way. The fix was a Node-side `setTimeout` in the assert script.

#### (b) Expressing what I wanted

**Where it fit.** Most of the brief mapped onto one declaration each:
- **Opens at the latest, keeps the place when new messages arrive:** `scrollAnchor = end`.
- **Reading back through 30,500 messages:** `virtualize = true`. Scrolling to row 0 of the 30,500-row thread worked first time, and so did dragging to the middle (row 12,735).
- **Keeping each conversation's scroll:** one `Transcript` per thread, replicated over `:threads[]`, with the inactive ones `visible = false`. Hidden panes kept their `scrollY`. I tested that in a throwaway prototype before committing to it, and it held.
- **The live feed:** a `Socket` with `active = { app.convos.loaded }`. Each frame becomes one write to the dataset (`insert`, `set`), and the list order, unread counts, typing lines and transcripts all followed with no update code.
- **Unread:** "unread" is derived from `lastSeen`, and `lastSeen` advances only while the pane `reading` (open, at the end, page visible). That one definition gave me list badges, the "N new" pill and the header count. I liked this most: the requirement became a constraint rather than bookkeeping.
- **One sound at a time:** a single `Audio` on the App with `playing = { app.voicePlaying }`. The scrubber follows the guide's own pattern (frame `Time` integrating `dt`, seek by assigning `position`).
- **Bubble kinds:** text, photo and voice are `classFor` subclasses of `Line` with `defaultPlacement = bubble`. Nested placement worked as `declare-help` said it would.

**Where I worked around it.**
- **Reaction tallies.** I wanted a computed list of tallies for each message. `datapath = { { rows: … } }` was refused with DECLARE3006, so each line now carries its own `counts: Dataset [ contents = … ]`. That works, but a Dataset per recycled row feels heavy for what's really a derived array. I'm unsure whether that's the intended idiom.
- **The live-frame handler.** It's an untyped `JSON.parse` dispatch. Frames share a field name, `message`, that is a Message in one frame type and an id string in another, so a single `schema` didn't fit. I accepted `any` rather than write a TypeScript union in script. A drift purist would object.
- **Hand-placed views.** The hover "react" button beside a bubble, and the pinned jump pill, are placed with `x = { … }` arithmetic. I think that's legitimate overlay placement. The drift check's warnings about hand-placed `x`/`y` made me second-guess it.
- **The Audio was laid out by my own layout.** The `Audio` was a child of the App, so my `Stage` layout placed it as the first pane and shoved the inbox to the right. Since `Audio` "draws nothing", I'd have guessed layouts skip it. They don't, and I needed `ignoreLayout = true`. `--outline` showed this instantly.
- **The waveform is a View with pointer handlers.** It's not a `Control`, so it has no proper slider role or keyboard seek. That's an accessibility gap I left.

#### (c) Verifying it

The ladder worked well. My errors, in order:
- `textAlign = end`;
- bare `semibold` inside braces (DECLARE4005);
- the literal datapath (DECLARE3006);
- `cornerRadius` typed as `number[]`;
- `this.fresh` inside a `State`;
- DECLARE7001 on `titleOf(app.convos.thread(…))`, where the argument isn't a nameable path;
- a boot error because `InboxRow` declared a width that the `Flow` layout owns.

Every one named its fix, and the fixes were mechanical. The DECLARE4025 warning ("give the facts names") made the code better: `startsRun` became `otherVoice` plus `broke`.

`--outline` and `--read` were excellent for "where is it?" questions. Screenshots via `declare-look` caught the things only pixels show:
- the shadow of the off-screen conversation bleeding onto the phone list;
- the light viewer background, which needed `theme = { …surface: scrim }` because the Dialog paints the theme's surface.

Assert scripts that address views by their text (`app.conversation.body.5."mine's nicer"`, `"Play voice message, 0:09"`) were pleasant. Here is what I measured, not assumed:
- scroll offset identical before and after an arrival (219026);
- unread count going 1 → 0 after the jump;
- `voiceHead` tracking `player.position`;
- the return position (1850954) on the phone after Back.

**What I did not verify:**
- real-device gesture arbitration (hold versus scroll);
- the date chip actually appearing mid-scroll;
- whether the hover button flickers in the gaps between views;
- the inbox glide animation;
- load time for the 5.5 MB history on a slow device;
- dark mode, which I didn't build.

#### Surprises

- Virtualized variable-height rows, plus anchoring, plus dragging to the first record, all simply worked. In any other stack I've used, that's the week-long part of a chat app.
- The virtual clock, described above.
- How often the docs had already named my exact case: a chat date chip, a message `ref` keyed before the server id arrives, a bubble that takes a hold while its photo takes a tap.

#### Good and bad

**Good:**
- Diagnostics that name the fix.
- `declare-help` as the reference.
- One reactive model for data, layout, motion and media.
- The "facts" API: `atEnd`, `userScrolling`, `firstVisibleRow`, `loaded`, `naturalWidth`.

**Bad:**
- Silent failures at the edges where the compiler can't see: the layout box contract, the Floating `input` override, a non-drawing view being laid out.
- The check tools' time model, at least for networked apps.
- A thin record of what the library's own `place()` and `input` contracts require, short of reading the library source.

#### Compared with what I'm used to

There are no hooks, effects or keys, and no virtualization library. The anchoring I'd normally hand-write in React with `useLayoutEffect` is an attribute here. The flip side is that you can't escape to imperative DOM when you're stuck. I didn't need to, but I noticed the absence.

It reminded me most of **QML**: property bindings, `State`s, an anchors-like literal vocabulary. Then of OpenLaszlo, which the README cites, with datapaths that feel like Laszlo's XPath ones. The reactivity resembles Solid/MobX signals with compile-time dependency extraction. Custom `place()` layouts recall Flutter's or SwiftUI's `Layout` protocol.

#### Where I'd most want improvement

1. Diagnostics or a boot check for:
   - malformed layout boxes;
   - overriding `input`/`show` without `super`;
   - a non-visual view caught by a custom layout.
2. A real-time mode for `drive.wait`, or a clear sentence that it isn't one.
3. A sanctioned way to replicate over a computed array without minting a `Dataset`.
4. A library scrubber or slider that accepts a custom drawing, so a waveform gets keyboard support and a slider role for free.

#### Would I use it

For consumer-style apps where continuity and long lists matter (chat, feeds, timelines, dashboards) and the team can live inside its library: yes, gladly. I got more of the hard requirements correct on the first try than I would have in React.

I'd hesitate for products that depend on a large third-party UI ecosystem, or for teams that need decades of Stack Overflow answers. I'm also uncertain how it behaves at real-device scale and under heavy production load, which I couldn't test here.
