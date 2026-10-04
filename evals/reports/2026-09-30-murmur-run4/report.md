# Murmur run 4: Declare 9b622ea1, Opus 5.5

**Run:** 2026-09-30 01:53 UTC, launched with `evals/craft/launch.sh murmur ~/Code/eval-murmur-4 claude-opus-5-5 9b622ea1 8330`
against GitHub main `9b622ea1`, the same subject as Cadence run 10. It used Opus 5.5 (`claude-opus-5-5`), with web tools
available and the brief's idiom sentence included. One round.

The first attempt, a minute earlier, went out on port 8321, which disagreed with the brief's 8330. It was stopped before it
wrote anything and is kept at `~/Code/eval-murmur-4-aborted`.

**Try it:** http://127.0.0.1:8240/my-apps/murmur/murmur.declare (the run's own tree; the service is on :8330)

## The comparison

| | run 3 (2026-09-25) | **run 4** | React (murmur-react-1) |
|---|---|---|---|
| Declare commit | v0.5.0-era | **`9b622ea1`** | — |
| time | 23.3 min | **25.3 min** | 18.1 min |
| turns | 122 | **139** | 76 |
| code | 1,217 lines, 7 files | **1,469 lines, 10 files** (9 `.declare` + 82-line `format.ts`) | 3,612 lines (src) |
| **Tokens** | | | |
| output (incl. thinking) | — | **112k** (52k thinking) | — |
| fresh input (cache writes) | — | **303k** | — |
| cached input re-read (cache reads) | — | **20.5M** | — |
| read before first app write | 400 KB | **262 KB** | 24 KB |
| context at first app write | 172k | **140k** | 39k |
| context at end | 351k | **311k** | 156k |
| first app write at | — | **6.7 min** | 4.4 min |
| **Download (gzip)** | | | |
| app + runtime, today's runtime | 122.5 KB | **127.5 KB** | — |
| as shipped at the time | 126.1 KB | — | 85.6 KB (JS 79.7 + CSS 5.5) |
| **Page weight** | | | |
| DOM elements | 11,932 (longest thread open) | **15,376** (at rest; every pane stands) | 5,303 (longest thread) |
| JS heap | — | **85 MB** | — |

Dashes mark numbers that were not kept: the run 3 and React streams were deleted with their run directories, and only the
phase measurements survived. The run 3 and run 4 downloads in the "today's runtime" row were both compiled with
`9b622ea1`, so the difference between them is the apps' own. Neither Declare build uses a web font, and neither does
the React one.

I measured run 4's DOM in headless Chrome at 1440×900. It is the same (15,376) with the 305-message thread open, because
every conversation's pane is built up front.

## Lines of code, comments separated

The "code" row in the table above is a raw line count. Split out below: a comment line is a whole line that is a `//`
comment or sits inside a `/* … */` block, including each Declare file's Markdown header. A comment at the end of a code
line counts as code. React is every `.tsx`, `.ts` and `.css` file in `src/`, without its project files. Run 4 includes
its `format.ts`.

| | raw | blank | comment | **code** | comment share of non-blank |
|---|---|---|---|---|---|
| run 3 | 1,243 | 177 | 158 | **908** | 15% |
| **run 4** | 1,469 | 202 | 188 | **1,079** | 15% |
| React | 3,612 | 404 | 123 | **3,085** (TSX 1,148 · TS 653 · CSS 1,284) | 4% |

Declare comes to about a third of React's code.

## What the briefs changed

- **Route:** README → SKILL → intake → about 15 briefs, read in batches. From the guide it read only ch07 scrolling, ch13 media and
  ch15 schemas, plus parts of 06 and 12, then the first 420 lines of tracker. It ran `declare-help` constantly and
  called it "the most-used tool of the build".
- **Reading before the first write fell by a third:** 262 KB against 400 KB. Context was 140k at the first write, against
  172k, and 311k at the end, against 351k. This is the same drop Cadence run 10 showed (430 → 257 KB).
- **The build itself was not faster:** 25.3 minutes against 23.3, and output tokens were high (112k). The time went on two
  bugs it hunted down itself (below) and on keeping the reader's place, which the briefs do not cover.

## What it built, and how

- **Data:** one `Store extends DataSource` for the history, and the live feed as a `Socket` on App. Every derived view
  (unread counts, recency order, previews, typing, read state) is a constraint or a store method. It uses the
  new mechanisms from this commit: `classFor` picks `TextSaid`, `PhotoSaid` or `VoiceSaid` per row; rows are
  wrap-don't-copy wrappers (`{ m: <record>, runStart, day, gap, fresh, status }`); list rows glide to `rowIndex * rowH`.
  A sent message keeps its row when the service confirms it (`id = m.ref ?? m.id`).
- **Keeping the reader's place, again by hand:** about 60 lines of imperative code in `conversation.declare` (`note`,
  `keepPlace`, `firstLook`). They are driven by `trackChanges = ["scrollY", "contentHeight", "height"]`, walk `childViews`
  to find the top line, and need a `following` guard flag. This works: a line held its pixel offset through a live
  insert, and the "1 new message" pill appeared as it should. It is the same gap as run 3, where the equivalent code
  was about 40 lines. The agent says the scrolling brief and ch07 cover following the newest message but say nothing
  about a reader scrolled back while content above them changes size.
- **Every conversation pane stays standing, so each keeps its scroll position** (30515 → 30515 on return). That is
  also why the DOM count is 15,376 at rest. It did not virtualize.
- **Motion:** springs throughout, including the phone edge swipe back, which follows the brief's under-the-hand rule and
  "worked the first time".
- **Design:** warm paper, ink, and a single accent colour ("Ember") that means "new". Time is told as distance ("3 hours
  later · 14:02") instead of a stamp on every line, and the voice scrubber is the recording's waveform. The account is in
  `DESIGN.md`.
- **Verification:** clean through R4 from the main tree (73 nodes, 350 of 389 constraints statically wired). There is no
  R5 assert: it drove the app with ad-hoc puppeteer scripts and the `__declare` bridge. It covered all eight of the
  brief's behaviours at 390 (touch) and 1440, and the app followed dark mode when the OS switched.

## Findings for the platform

1. **A view that starts hidden goes wrong once shown. Two runs found this independently tonight, so it is the top item.**
   Cadence 10: an `HTMLText` inside a Sheet that started `visible = false` measured 2px wide and never re-measured.
   Murmur 4: a drawn `Icon` inside a parent that started `visible = false` never painted once shown, even though
   `explain` and `inspect` showed correct ink, size and position, and `invalidateDraw()` did nothing. Both agents worked
   around it by keeping the parent visible. The agent's guess points at `armVisibility` in `view.ts`. Neither is
   reproduced by me yet; I would build one minimal case for each.
2. **Keeping the reader's place is still left to the app.** Run 3 needed about 40 lines, run 4 about 60, plus a guard
   flag. The agent asks for a built-in `overflow-anchor` equivalent, and for a glide to the end that reports its progress.
   This matches the open scroll item from run 3.
3. **Rung 4 passed a program that failed on first load in the browser:** "TextLabel.y — View's SimpleLayout places
   its children", then the same for `ChevronIcon.y`. Library classes that set their own `y` were placed inside a layout,
   inside replicated rows that the synthetic boot never builds, because their data comes from the network. The agent
   suggests booting rung 4 with fixture data.
4. **Page weight has regressed:** 15,376 elements against run 3's 11,932 and React's 5,303, because all six panes and all
   443 messages stay built.
5. **Name collisions, four in one session:** `Face` (which then cascaded into about ten misleading errors about Font faces
   needing `src`), `attach`, `clip`, and the method `hold` (read as the `onHold` event). With Cadence 10's `Pick`,
   `surface` and `hold`, this is now a pattern across every recent run.
6. **A subclass cannot put content inside an inherited child,** and inherited children paint before the subclass's own.
   This is the same finding as Cadence 10's `SheetBody`. Here the base `Said` class exposes `bodyW`, `bodyH`, `bodyX`
   and `bodyY`, places everything by arithmetic, and moved the reaction pill so the bubble would not cover it.
7. **`pointerEvents = "none"` is a corridor, not a lid.** It is documented, but it misled the agent. With six stacked
   panes, a send went to Book club while Marco was on screen. It suggests a warning in the overlays and scrolling briefs,
   or a diagnostic.
8. **Smaller gaps:**
   - there is no `Socket` example that both sends and receives;
   - theme tokens can't be indexed (it wrote `personInk(th: any, …)`);
   - a schema can't state the union for the socket's `message` field, so the field is `any`;
   - record-typed attributes are nullable, which took about nine call-site fixes;
   - `measureText` fields don't inherit;
   - `Media.position` reports about four times a second, which it learned from `media.ts`;
   - it switched layouts on a `wide` boolean rather than `ResponsiveLayout`, and flags that itself.

## Where things are

- Run directory: `~/Code/eval-murmur-4`.
  - The app is at `work/declarelang/my-apps/murmur/`, with its design statement in `DESIGN.md` there.
  - The logs are in `logs/`. The account below is `logs/impressions.md`, and its full stream is `logs/impressions.stream.jsonl`.
- Servers:
  - the review dev server on :8240: I restarted it, because the agent's own server ended with its session;
  - the Murmur service on :8330;
  - Cadence 10 is still up on :8201, with its service on :8320.
- Filed here with the app's source, `prompt.txt` (the build prompt) and `impressions.txt` (the question that produced the account below).

---

## The agent's account, verbatim

This was asked after the build, as a separate step that could only read files, with the same prompt as Cadence run 10
("Now that you've built Murmur…"). The step took 1.3 minutes, used no tools, wrote 7.0k output tokens, and cost about
$0.24 (the session was still cached).

# Building Murmur in Declare: an account for the Declare team

Some context first. Murmur came to about 1,470 lines: nine `.declare` files plus one small TypeScript formatting helper. The build was one long session with the compiler, the dev server, and headless Chrome driven through puppeteer. Where I'm guessing about causes, I say so.

---

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`, then `skill/SKILL.md`.
2. All of `docs/declare.md`.
3. `docs/operational/intake.md`.
4. About fifteen briefs: shape-of-an-app, scrolling, lists-from-data, kinds-of-rows, layout-and-sizing, loading-and-saving, derived-values, motion, your-own-control, using-controls, pointer-and-drag, text-and-themes, overlays, time, drawing, keyboard-and-focus.
5. Guide chapters 07 (scrolling), 13 (media) and 15 (schemas), plus parts of 06 (layout) and 12 (text).
6. The first 420 lines of `apps/tracker/tracker.declare`.
7. Small pieces of runtime source: `media.ts`, `control.declare`, `icon.declare`, and part of `view.ts`.

**What taught me the most:**
- **`docs/declare.md`** gave me the model in one sitting. The "Seven differences" section and the table of set vs declared constraints stopped mistakes before I made them.
- **`npx declare-help`** was the most-used tool of the build. It gave exact member lists for `Stream`, `Media.position`, `View.claim`, `TextStyle`, `ValueChange` and `rootBounds`. The rule that "silence is trustworthy" held; I never caught it being wrong.
- **The briefs** were the right size. Each worked example compiled in my head before I wrote anything.
- **The tracker source** mattered more than I expected. Its comments explain why things are shaped the way they are, not just what they are. That's where I learned the conventions for `Roll`, `Toast` and `ListRow`.

**What was missing:**
- **Keeping a reader's place.** The scrolling brief and chapter 07 cover following new content at the bottom ("ask because something grew"). They say nothing about a reader who is scrolled back while content changes size *above* them. For a chat app that's the central scrolling problem, and I wrote it by hand. I grepped the runtime for `overflow-anchor` and scroll anchoring and found nothing.
- **Sockets.** The docs have no worked `Socket` example that sends and receives. I pieced it together from `Stream --all` and `Socket.send`. It was easy, but I did it on faith.

**What misled me:**
- **`pointerEvents`.** The docs *do* say `"none"` makes a view "a corridor, not a lid" whose children still take presses. I read that line and still built on the wrong assumption. My first version stacked six conversation panes and disabled the unselected ones with `pointerEvents = "none"`. The first real send went into Book club when Marco was on screen. The documentation is correct; it's the trap that isn't surfaced. It belongs in the overlays and scrolling briefs as a warning.
- **`measureText`.** Its `TextStyle` fields don't inherit ("a field left out takes its plain default, never an inherited value"). That's documented, but it's easy to miss that you have to pass `fontFamily` yourself.
- **`Icon` sets its own `y = center`.** I found this in `icon.declare` only after a runtime refusal (details in section b).
- **`Media.position` updates only about four times a second.** That's documented, but it changes how you build a playhead. I found out by reading `media.ts`.

---

## (b) Expressing what I wanted

**Where the language fit my intent closely:**
- **Derived data.** Unread counts, ordering by recency, list previews, "typing…", read status, and the per-thread `lines()` projection are all constraints or store methods. When a live frame arrives, one `set` or `insert` on the store and every view follows. I never wrote update code for the list, and this is the strongest part of the language.
- **Wrappers and `classFor`.** The `lines()` method returns wrappers like `{ m: <the record>, runStart, day, gap, fresh, status }`. `classFor` then picks `TextSaid`, `PhotoSaid` or `VoiceSaid`. Row identity comes from `id = m.ref ?? m.id`, so a sent message keeps its row when the service confirms it. It worked on the first try.
- **Keeping scroll position across conversations was nearly free.** Every conversation pane stays alive, so each scroller keeps its position. The brief's hardest-sounding requirement, "returning returns you to where you were", came down to never destroying anything. The test measured 30515 → 30515.
- **Springs everywhere:** the phone slide, pane cross-fades, list rows gliding to their new rank, the photo growing from its bubble, the reaction picker, the new-messages pill. The edge-swipe back followed the brief's advice to write the value and the target together, and it worked the first time.
- **Timing needed no helpers.** I used `afterSettle` for "open at the first unread line once it exists", and a frame-ticking `Time` whose `onTick(dt)` carries the voice playhead forward between the clip's position reports. In both cases the docs said exactly which tool was sanctioned.
- **Use-site method overrides.** At one point I reached for `(parent.parent.parent… as Composer)`. The fix was `TrayPhoto [ press() { classroot.sendPhoto(…) } ]` and a `willSend()` hook on the composer. That's cleaner than prop-drilling a callback.

**Where I had to work around the language:**
1. **A subclass can't put a child inside a child it inherits,** and inherited children paint before the subclass's own children. I wanted the base `Said` class to own the frame around a message (name, face, reactions, status) with each kind of message supplying a bubble inside it. Instead the base declares `bodyW`, `bodyH`, `bodyX` and `bodyY`. Each subclass sets `bodyW`/`bodyH` from its bubble, and everything around the bubble is placed by arithmetic. I also moved the reactions pill *below* the bubble rather than overlapping its edge, because the subclass's bubble would have painted over it. It works, but some sort of content slot would have been the natural form.
2. **Keeping the reader's place is imperative code:** the `note()`, `keepPlace()` and `firstLook()` methods on the conversation's scroller. They're driven by `trackChanges = ["scrollY", "contentHeight", "height"]` and walk `lines.childViews` to find the line at the top of the window. It works (a line stayed at −183px through a live insert), but it's the most framework-shaped code in the app.
3. **A guard flag I'd have avoided if I could.** The glide to the newest message got pinned halfway. Mid-glide `scrollY` said "not at the end", then a photo loaded and the anchor logic held the view there. The fix is a `following` flag. That's close to the "anything shaped like an `isAnimating` guard" pattern that intake.md warns against, and I don't know of a cleaner way. A glide that reported "in progress, heading to the end" might remove the need.
4. **Record-typed attributes are nullable** (`Thread | null`). About nine call sites failed to typecheck. I changed store methods to accept `Thread?` and return a default. I prefer that to scattering `!`, but it's defensive noise.
5. **Theme tokens can't be indexed.** To pick one of six person colours I wrote `personInk(th: any, id)` in a `script` block, which gives up typing on the theme.
6. **`message?: any` in the `Frame` schema.** The socket's `message` field is a Message on some frames and an id string on others. A schema can't state that union, so the field is typed `any` and each use casts.
7. **Parking hidden panes off-frame** (`x = parent.width + 40`) is my fix for the misrouted send in (a). I believe it's legitimate, but I'm not sure it's idiomatic.
8. **Name collisions:** `Face` (the library's font face), `attach`, `clip`, and a method named `hold` were all refused. The last was a surprise: the compiler read my `hold()` as the `onHold` event and told me to rename it. Each message named the fix, but four in one session suggests the reserved-name surface is wider than it looks.

**What I didn't use:** `State` (my conditional pieces were constraints on booleans; a reviewer might say some should have been States), `virtualize`, `location`/`waypoint`, and `ResponsiveLayout`. I switched the phone and desktop layouts on a `wide` boolean. That's a `narrow ? … : …` branch, which the drift check explicitly discourages. I judged a two-place navigation model to be more than a layout plan, but I'm not certain that was right.

---

## (c) Verifying it

**`declare-verify --rung=4`** ran after every batch of edits and took seconds. It listed every structural error at once, and nearly every message named its fix.

Diagnostics that saved real time:
- DECLARE2000: type annotations aren't allowed on names inside bodies.
- DECLARE2005: a Spring can't drive a constrained `y`, with the rewrite spelled out.
- Bare `Infinity` refused, with "write `{ Infinity }`".
- `cornerRadius` must be a `Radius`, not `number[]`.
- "'classroot.rec' may be absent here".

One cascade was confusing. Naming my class `Face` produced one correct error ("already a class named 'Face'") and then about ten errors about Font faces needing `src`. They came from the collision but read like separate problems.

**Rung 4 passed on a program that failed in the browser.** The first real load threw repeatedly: "finishing a replicated Conversation instance threw: TextLabel.y — View's SimpleLayout places its children". Then the same error for `ChevronIcon.y`. Both classes set their own `y` internally, and my code placed them inside a layout. My guess is that the synthetic boot never builds the replicated instances, because the data comes from the network and isn't there headlessly. If so, a way to boot rung 4 with fixture data would have caught it. `--fixtures` exists, but I didn't try it, so that's untested.

**The `__declare` bridge was the best tool I had.** From puppeteer I used:
- `find()` to get live nodes and call `scrollBy`, `open` and `rootBounds` on them;
- `inspect()` to read geometry and the shown state;
- `explain()` to prove an icon's `ink` was correct, which moved me off a wrong theory in one step.

I drove the anchoring test by polling `scrollY`, `contentHeight` and the top visible line every four seconds while the service sent live events. That turned "does the reading position hold?" into numbers.

**I didn't use rungs 5 or 6.** Ad-hoc puppeteer scripts plus screenshots were faster to iterate on. That's a gap: none of these checks are re-runnable as a suite.

**Screenshots caught what nothing else would:** the send going to the wrong conversation, the missing chevron and close cross, and bubbles left wide after wrapping. Seeing the pixels was essential.

**A possible runtime bug.** A drawn `Icon` inside a parent that started `visible = false` never painted once the parent was shown. `explain` said the ink was right, `inspect` said the size and position were right, and calling `invalidateDraw()` changed nothing. Keeping the parent visible and gating it with `pointerEvents`/`disabled` fixed it. In one quick experiment, opening the viewer early, the icon did paint, so the cause is uncertain. My guess, based only on the `armVisibility` comment in `view.ts`, is that the drawing's resolution is set while the view is hidden and never updated. Someone who knows the renderer should check.

---

## Surprises
- How little code the list needed. Reordering, unread badges and live typing indicators are about 40 lines of `ThreadRow`, with no event handling at all.
- Scroll position surviving because nothing was ever torn down.
- The OS switched to dark mode partway through testing, and the app followed correctly without my having looked at it.
- `hold()` being treated as an event name.
- That an icon's hidden `y = center` could break a layout, and only at runtime.

## Good
- The docs are written to be acted on: short, opinionated, and each one names a better form of the thing you were about to do.
- Diagnostics that name the fix.
- `declare-help` as a fast, dependable reference.
- The live bridge.
- Springs as the default way to move anything.
- Data-driven replication with identity that holds up through a confirm-and-rename.

## Bad
- Scrolling that keeps the reader's place (chat, feeds, logs) is left to the app, even though it's a core pattern for this kind of UI.
- Subclasses can't put their content inside an inherited child.
- Errors that only surface in replicated instances at runtime.
- Reserved and colliding names.
- The pointer-event and visibility traps. Both are technically documented; both bit me.

## Compared with frameworks I know well
- No render function, no hooks, no dependency arrays. Handlers assign facts and stop, and that discipline holds up.
- Events don't bubble. Calling a method on the owner turned out cleaner than callback props.
- Layouts own the positions they set, and the compiler (or runtime) enforces that. It's stricter than flexbox and caught real conflicts.
- No CSS cascade; theme records and `provided` replace it. It felt closer to design tokens than to styling.

## What it reminded me of
- **QML** most of all: bindings, states, springs, anchors-as-arithmetic.
- **OpenLaszlo** (the stated ancestor): datapaths and replication.
- **MobX / Solid signals**: automatic dependency tracking, here resolved at compile time.
- **SwiftUI**: modifiers-as-attributes and `@State`-like declared state.
- **Elm-ish** discipline about where effects live, though far less strict.

## Where I'd most want improvement
1. A built-in way to keep a reader's place when content above them changes size, like the browser's `overflow-anchor`, plus a way to glide to the end that reports its own progress.
2. Rung 4 building replicated instances with fixture data, so runtime-only errors like the layout-`y` refusal show up at check time.
3. Fixing, or at least documenting, drawn children that never paint under a parent that started `visible = false`.
4. Content slots for subclasses.
5. A more visible warning about the `pointerEvents` corridor behaviour, perhaps a diagnostic when an ancestor has `"none"` and a child control can still be hit.
6. Typed indexed theme tokens, or arrays as tokens.
7. A `Socket` example that both sends and receives.

## What I'd use it for
Given the choice, I'd use it for interactive, stateful, motion-heavy UIs of small to medium size: tools, dashboards, messaging-like apps, and prototypes where continuity matters. The compile-and-check loop makes it well suited to building with an LLM.

I'd hesitate on three counts, all of which I didn't measure here:
- **Accessibility:** I never checked what screen readers get.
- **Performance at scale:** I didn't virtualize the 305-message thread or measure it.
- **Maturity:** it's pre-1.0, and there's no ecosystem beyond the standard library.