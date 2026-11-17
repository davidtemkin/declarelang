# Murmur run 18: Opus 5.5, Declare, on the local tree, standard level

The first Murmur run on the global-names tree, and the first at the `standard` level. **23.6
min, 114 turns, 97k output tokens** (37k thinking). Not scored: the audit is the result.
Timing record: `evals/timings/2026-11-15-murmur-run18-local.txt`.

## 1. The comparison

No earlier Murmur run was at `standard` (runs 13–16 ran before levels, 17 at the bare prompt),
so these are context, not a same-level comparison.

| | 14 | 15 | 16 | 17 (bare) | **18 (standard)** |
|---|---|---|---|---|---|
| total | 21.2 | 33.9 | 17.8 | 31.3 | **23.6 min** |
| turns | 112 | 141 | 87 | 143 | 114 |
| output tokens (thinking) | 94k (38k) | 113k (45k) | 73k (23k) | 116k (43k) | 97k (37k) |
| reading · checking | 6.5 · 11.7 | 4.3 · 25.2 | 4.2 · 11.2 | 4.3 · 27.0 | 6.0 · 14.9 |
| tool time · model time | 5.6 · 15.6 | 14.5 · 19.4 | 6.2 · 11.6 | 11.0 · 20.3 | 8.1 · 15.5 |
| verify calls | 22 | 16 | 22 | 29 | 25 |
| output per model-minute | 5996 | 5846 | 6333 | 5727 | 6237 |

- **Code:** 1,246 lines in three Declare files, 924 without comments and blank lines.
- **Download:** 194 KB gzip as a production build, first load.
- **Checks:** three kept assert scripts against the live service (`desktop`, 34 assertions;
  `phone`, 17; `reaction`, 4), 17 `declare-look` calls, `declare-format` clean.

Cadence 37 began as this audit did, so the machine was shared from here on; the run itself
had it alone.

## 2. What it built, and findings for the platform

All of the brief: the conversation list ordered by activity and live, unread counts, one
kept pane per conversation (place, draft and marker survive switching), a 30,500-message
history virtualized with `scrollAnchor = end`, a "new messages below" pill, optimistic sends
confirmed by the service, reactions by hover button and press-and-hold, voice messages with a
drawn waveform scrubber, photos inline at their own shape and full size, and a phone design
where the conversation slides over the list on a spring.

1. **FIXED: the focus ring's watcher warned, wrongly, on every keyboard-opened overlay.** The
   runtime said `onChange: 'g' changed again in the same settle chain — a ring of change
   handlers`, in every run of this app, and the agent went into runtime source to rule out its
   own code (account, d5). The cause was this round's change: the ring now watches the fact
   `app.focusGeometry` (tracked as `g` in `library/focusring.declare`), and the focus service
   re-reported the same outline on every settle that might have moved it, each time as a new
   record, so a new value. Tab to a button and Enter to open a popover gave five warnings, and
   a real second move in the same chain would have been dropped, leaving the ring behind. Now
   the fact changes only when the outline does (`runtime/src/view.ts` `noteFocusGeometry`);
   a test in `test/focus-ring.test.mjs` fails without it. Cadence 37 was launched before the
   fix and may show the warning; Venue and Presentify run with it.
   - **FIXED too:** the warning named only `'g'`. It now names the node it is on
     (`onChange on app.…: 'g' …`), so a warning from inside the library says so
     (`runtime/src/change-event.ts`).
2. **How an overlay's content is sized is not taught, and not checked.** A photo grid
   `width = 100%` inside a `Popover` came out at about 25 px thumbnails, with no layout finding;
   two layouts and three tries later the agent gave the grid a stated width (account, (g) and
   (i)). A popover is as large as its content, so a child sized from it has no room: the same
   circularity verify reports on a first screen, but this overlay opens only after a press, so
   R4 never built it. The phone presentation (a sheet) with an explicit `width` was a second
   surprise. **Proposals:** a paragraph in guide 18 on how a popover's, sheet's and dialog's
   content is sized and what `100%` means there; and a check of each overlay's content in its
   default state, so a screen reached only by a press is not unchecked by default.
3. **A full-screen `Dialog` stacks its children; the guide's example doesn't show it.** The
   agent's photo viewer placed three children by hand and failed at boot with "View's
   SimpleLayout places its children" — the `SimpleLayout` of the dialog's own content view,
   which the message didn't name (account, boot error). **Proposals:** the message names the
   view that owns the layout (`PhotoViewer.content`); guide 18's full-screen viewer example
   says the children stack, and shows the frame to place them in.
4. **`findLast` is refused: bodies are ES2022.** The suggested rewrite (`[...xs].reverse().find`)
   copies the array, here 30,500 messages, on a hot path (account, d8). ES2023's array methods
   (`findLast`, `findLastIndex`, `toSorted`, `toReversed`, `with`) are in every browser Declare
   supports and in JavaScriptCore. **To decide:** move bodies to ES2023.
5. **Smaller:**
   - `'Inbox' is declared twice — in "murmur-messages.declare" and "the app"`: the main file
     should be named by its file name.
   - `'pulse' is not a member of View` for `parent.pulse` (a value the list declares for its
     rows): the agent's right answer was `provided("pulse")`; the message could say so where
     the name is declared on an ancestor.
   - `defaultPlacement = bubble` named a grandchild (`line.bubble`) and worked; the guide shows
     only a direct child. To check that this is supported, and say so.

## 3. Is it idiomatic Declare?

| | Run 17 | Run 18 | To-do |
|---|---|---|---|
| code | 899 lines Declare | 924 lines Declare | 844 lines Declare |
| bytes | 52 KB | 52 KB | 48 KB |
| lines over 150 characters | 1 | 6 | 3 |
| colour literals outside theme declarations | 3 | 0 | 1 |
| theme reads | 89 | 76 | 69 |
| States | 1 | 2 | 7 |
| visible switches | 1 | 1 | 0 |
| branches on width or phone | 47 | 36 | 38 |
| flexes | 12 | 10 | 7 |
| browser scripts | 0 | 0 | 0 |
| page lookups | 0 | 0 | 0 |

**What it gets right.**
- **The records in one place.** `Chat extends DataSource` holds the history, answers what is
  true of a conversation (title, newest, unread, preview), and makes every write
  (murmur.declare:55–148). The live feed and the person's sends both go through it.
- **Where the person is on the App**, a handful of attributes (murmur.declare:220–228); the list
  a derived dataset ordered by activity (murmur.declare:235).
- **One kept pane per conversation**, replicated over the threads and hidden when not open, so
  place, draft and marker survive with no code (murmur-messages.declare:123). This is the
  decision the brief turns on, and the agent wrote it down in `DESIGN.md`.
- **The hard part in four declarations:** `virtualize = true`, `classFor` by message kind,
  `scrollAnchor = end`, and "new below" as a constraint on `contentHeight - scrollY - height`
  (murmur-messages.declare:135, 156, 168).
- **A row reads the one before it** through a provided list (`provided("rows")[rowIndex - 1]`),
  and the day heading, speaker and time are parts that `exists` only where they apply
  (murmur-messages.declare:345–377).
- **Its own layouts where none fits:** the phone's slide is a `Stage` layout reading a sprung
  `t` (murmur.declare:158), the picker a `Squares` layout.
- **The scrubber is a `ValueControl` with `draw()`**, a slider to the keyboard and a screen
  reader (murmur-messages.declare:487), modelled on the library's `Slider` source.
- **Colors are theme tokens** throughout, two themes laid over the library presets.

**Missteps, with how each should be written.**
- **Finding a pane by walking the tree:** `app.main.panes.childViews.find((c) => (c as
  ThreadView).threadId == threadId) as ThreadView` (murmur.declare:292), to scroll it after a
  send. A pane that should go to its end can follow a fact instead: the App records which
  conversation to bring to its newest (`jumpTo`), and the pane's own handler scrolls when that
  names it. The composer, a direct child of its pane, reaches it as `parent`.
- **The feed's frames are `any`** (`receive(f: any)`, murmur.declare:298). A schema per frame
  kind types them, and the switch checks its fields.
- **Per-row scans over the whole conversation.** `isLastMine` and `seenWords` walk or map every
  message, for each of the person's own rows, on every append (murmur.declare:254–274); `unread`
  walks per list row. Over 30,500 messages these belong in one derived value per conversation.
- **The "new" marker is never reset** (murmur-messages.declare:143); the agent found this itself
  writing its account.
- **Dead code:** an empty `onInit() { }` (murmur-messages.declare:151).

**Workarounds the platform forced.**
- The overlay sizing (finding 2).
- `[...xs].reverse().find` for `findLast` (finding 4).

## 4. Names

**Misses** — two, both resolved at once, both the agent's.

| name | where it came from | the platform's answer |
|---|---|---|
| `pulse` on `View` (`parent.pulse`) | a value declared on an ancestor | "declare it or fix the name" (finding 5) |
| `bubble` on `Msg` | a child moved by `defaultPlacement` | "a child's is: `line.bubble`" |

**Silent misses:** none found in the read.

**Collisions:** `at`, an attribute `Msg` already declares (renamed `playedTo`); a schema and a
class both named `Inbox` (renamed `Listing`); a child named `close`, a method of `Floating`
(renamed `shut`). Each refused with the rename named.

**Lookups that missed:** one call asking five names at once
(`declare-help View.claim View.onHold View.keyBindings Time afterDelay`), which the tool read
as one name. **Proposal:** `declare-help` answers each of several names given together.

## 5. The agent's account

Asked after the build by resuming the session read-only (`impressions.txt`); 16k output tokens,
323k cache reads, counted apart from the build's.

# Building Murmur in Declare: an account for the people who make it

## The short version

Murmur is about 1,100 lines of Declare across three files, plus three test scripts. It took one session, and it reached a working state much faster than I expected for a language I had never seen. I opened the first conversation against the live service and it rendered correctly, opened at the newest message, and cleared its unread count.

The hard requirements in this brief are a 30,500-message history, keeping the reader's place, and following the newest message. Those are where most chat apps go wrong, and Declare made them close to free: `virtualize = true`, `scrollAnchor = end`, and replicating one pane per conversation. Most of my friction was elsewhere:

- sizing overlays whose content I didn't control;
- learning the behaviour of the assert-script driver;
- a few of my own data-merge bugs.

None of it was a wall.

---

## (a) Getting up to speed

**What I read, in order:**

1. `README.md`.
2. `skill/SKILL.md`, which `AGENTS.md` points to.
3. `docs/declare.md`, all of it.
4. Guide chapters 01, 04, 05 and 06, each whole.
5. `apps/todo/todo.declare` and `todo-parts.declare`, both whole.

That is the reading the skill prescribes. Then, as each need arose:

- **`07-scrolling.md`, whole.** I knew scroll anchoring would decide this brief.
- **`16-collections.md`, whole.** For virtualization and `firstVisibleRow`.
- **`13-media.md`, whole.** For images and audio. Its "A scrubber" section described almost exactly what I needed.
- **`18-overlays.md`, most of it.**
- **`14-data.md`, in parts:** datasets, writing records, data sources, streams, and "Data in a whole app".
- **`17-your-own-views.md`, two sections:** "Writing a layout" and "A frame around content".
- **`operational/verify.md`, most of it.**
- **About 30 `npx declare-help` lookups.** Among them: `Socket`, `Stream`, `scrollAnchor`, `firstVisibleRow`, `Image.fit`, `Sheet`, `Popover`, `Dialog`, `virtualize`, `App`, `TextInput`, `Text`, `TweenLayout`, `ResponsiveLayout`, `Control`, `Media`, `Animator`, `Time.onTick`, `View.scrollTo`, `Icon`, `claim`, `onHold`, `keyBindings`, `afterDelay`, `Spring`, `waypoint`, and `"theme tokens"`.
- **Library sources:** `library/slider.declare`, and parts of `valuecontrol.declare` and `dialog.declare`.

**What I skipped:**

- **Chapters 02 (notation) and 03 (constraints).** The skill didn't list them and `declare.md` seemed to cover the ground. I can't point to anything that went wrong because of this.
- **`08-controls.md`.** I picked up the value pattern from `declare.md` §11 and the Slider source instead.
- **`10-touch.md`.** This is the one I regret. I used `onHold`, `claim = x` on the scrubber, and a scrubber dragged inside a vertically scrolling pane, all from reference entries alone. The touch chapter's "Gesture claims" and "Dragging on a scrolling surface" sections are exactly where I'm least sure the app is right on a real phone.
- **`12-text.md`, and chapters 21 through 23 on motion.** I used `Spring` and `Animator` from the reference.

**What taught me the most:**

- **The to-do app, by a wide margin.** It showed me where state lives, a dataset class with every write as a method, `classFor`, `exists` versus `visible`, and the pattern of using `Control` with `press()` for anything pressable. It also showed the phone and desktop split done with constraints on `app.wide`, and Popover and Sheet with `shown`/`commit`. I copied its shape almost directly.
- **`07-scrolling.md` § "Keeping the reader's place" and § "Following the end".** These read like the brief's §4 written by someone else. The `newBelow` constraint in that chapter is close to what I shipped.
- **`13-media.md` § "A scrubber".** It gave me the frame-`Time` playhead that defers to the clip's own position when the two disagree.

**What was missing or misleading:**

- **`18-overlays.md`'s photo-viewer example** (`class Viewer extends Dialog [ presentation = "full", … Image [ width = 100%, height = 100% … ] ]`) shows a single child. It doesn't say that a Dialog's children go into a content view that stacks them with a `SimpleLayout`. My first viewer had three hand-placed children and failed at boot. That fact is visible in `dialog.declare` (`defaultPlacement = content`), but not where I was looking.
- **Popover sizing.** I found nothing on how a Popover sizes its content area. Specifically: whether `width = 100%` inside a Popover means anything, and what happens to an explicit `width` on a phone, where it presents as a sheet. Guessing at that cost me three attempts (see (h)).
- **Schemas and classes share one namespace.** `declare.md` does say a schema is "in the classes' namespace", but I read past it and named both a schema and a class `Inbox`. The error caught it immediately, so this is minor.

---

## (b) Expressing what I wanted

**Where it fit the intent closely:**

- **A list ordered by recent activity, kept so live.** One derived dataset:
  ```
  inbox: Dataset [ schema = Listing, contents = { { rows: app.byActivity() } } ]
  ```
  It reorders whenever any conversation's messages change.
- **One pane per conversation, kept alive.** `ThreadView [ datapath = :threads[] ]` with `visible = { classroot.open }`. Each pane keeps its own scroll position, draft and marker with no code from me. This is the decision I put in `DESIGN.md`, and it was nearly free.
- **A huge history.** `Msg [ datapath = :messages[], virtualize = true, classFor = { … } ]` handled 30,500 messages.
- **Live arrivals.** `scrollAnchor = end` gave me "stay at the bottom if at the bottom, keep the place otherwise".
- **"Something new below".** A constraint over `contentHeight - scrollY - height`.
- **Decisions based on the previous message.** Each row reads the message before it: `prev: Message? = { rowIndex > 0 ? provided("rows")[rowIndex - 1] : null }`. The day heading, speaker name and time are each a part with `exists`. Following the guide's "what sits between records belongs to the row after it" pattern, this was clean.
- **The live feed.** A `Socket` whose `onMessage` calls one App method, which writes through `Chat` methods.
- **Phone versus laptop.** The phone layout came from constraints on `app.wide` plus a custom layout, without a separate program.

**Where I worked around it:**

- **Imperative state machines.** The unread "NEW" marker and the "mark as read while looking" rule needed an `onChange` over `trackChanges = ["looking", "count", "open"]`. That's the sanctioned way, but the result is the most imperative and least trustworthy part of the app (see (f)).
- **Reaching a view by data.** To scroll a pane after sending, I had to find it among replicated children:
  ```
  app.main.panes.childViews.find((c) => (c as ThreadView).threadId == threadId) as ThreadView | undefined
  ```
  `14-data.md` describes this pattern, so it's intended, but it felt like a step outside the model.
- **Messages from the service are untyped.** `receive(f: any)` takes them as `any`. I could have given the frames a schema and didn't.

---

## (c) The first time it ran

The first screenshot that loaded real data (1440×900) looked right: list order, unread badges, "writing…" in the Dana row, avatars, and the idle "murmur / Choose a conversation" panel. The second, with Book club open, was also right in substance.

What was wrong, and how I found it:

- **The send button was misaligned** inside the composer. I saw it in the screenshot and changed paddings.
- **Every group message carried a name and time header.** In the screenshot, almost every message had one, because my rule started a new "run" after any 20-minute gap. I changed it to start a run on a change of speaker or a pause of more than 60 minutes.
- **A pair conversation's header showed the person's name twice** (title and subtitle). Seen on the phone screenshot.
- **The composer field was 270×40** on the phone, below the 44-point target size. The `declare-look` layout finding reported it.

---

## (d) Every refusal and surprise

These are listed in the order I hit them.

### Compile errors

1. **Duplicate name: schema and class.**
   - *What I wrote:* `schema Inbox [ rows[]: Thread ]` and `class Inbox [ … ]`.
   - *What it said:* `'Inbox' is declared twice — in "murmur-messages.declare" and "the app" [DECLARE5001] (line 11, col 1)`
   - *What I changed:* renamed the schema to `Listing`.
   - *Judgement:* my error. The message is clear. "the app" for the main file is slightly odd wording.

2. **Redeclaring an inherited attribute.**
   - *What I wrote:* in `VoiceMsg extends Msg`, `at: number = { classroot.current ? app.head : 0 },` while `Msg` already declares `at: string`.
   - *What it said:* `Msg already has an attribute 'at' — a declaration introduces a new one; write 'at = …' to set the existing one, or, for one of your own, name it otherwise, e.g. 'msgAt' [DECLARE2000]`
   - *What I changed:* renamed it to `playedTo`.
   - *Judgement:* my error. Excellent message; without it this would have been a silent type confusion.

3. **A child named like an inherited method.**
   - *What I wrote:* `close: RoundButton [ … ]` inside `PhotoViewer extends Dialog`.
   - *What it said:* `'close' is a method of Floating, which PhotoViewer extends — a child cannot take its name; choose another (or, to change what close() does, override the method) [DECLARE2000]`
   - *What I changed:* renamed it to `shut`.
   - *Judgement:* my error, and a good catch.

4. **Bare enum values inside a constraint.**
   - *What I wrote:* `fontWeight = { classroot.fresh ? bold : semibold }`.
   - *What it said:* `'bold' is one of fontWeight's values — bare only as the whole value (fontWeight = bold); inside { } write it as a string: "bold" [DECLARE4005]`
   - *What I changed:* quoted the values.
   - *Judgement:* my error. `declare.md` warns about exactly this ("The vocabulary stops at the brace"), and I still did it. A predictable slip, and a perfect message.

5. **A view that exists only conditionally.**
   - *What I wrote:* in `Avatar`: `TextLabel [ … visible = { !classroot.pic.loaded } … ]` with `pic: Image [ exists = { classroot.picture != "" } … ]`.
   - *What it said:* `'classroot.pic' may be absent here — it is built only while its 'exists' (or its State) applies; check it [DECLARE6001]`
   - *What I changed:* `!(classroot.pic?.loaded ?? false)`.
   - *Judgement:* my error. Very good that the compiler knows this.

6. **Reading a parent's attribute through `parent`.**
   - *What I wrote:* `class Ghost [ … opacity = { parent.pulse } … ]`, where `pulse` was declared on the enclosing loading view.
   - *What it said:* `'pulse' is not a member of View — declare it (pulse: <type> = …) or fix the name [DECLARE6001]`
   - *What I changed:* `provided("pulse", 1)`. I did the same for the typing dots: `provided("phase", 0)` instead of `(parent.parent as Typing).phase`.
   - *Judgement:* my code was reasonable but untyped. The fix is the idiomatic one. The message could suggest `provided(…)`, since that's what the docs recommend for "the list's own setting".

7. **A child that `defaultPlacement` moved.**
   - *What I wrote:* `app.askReaction(classroot.threadId, classroot.msgId, classroot.bubble)`, where `bubble` sits inside `line`. I had also written `defaultPlacement = bubble` on `Msg`.
   - *What it said:* `'bubble' is not a member of Msg — a child's is: 'line.bubble' (reached through the child that holds it) — 2 sites`
   - *What I changed:* `classroot.line.bubble`.
   - *Judgement:* my error. Two things I'm unsure about here:
     - `defaultPlacement = bubble` named a grandchild. It appeared to work (subclass content landed in the bubble), but the guide only shows it naming a direct child. I don't know whether that's supported or works by accident.
     - `17-your-own-views.md` says a placed child "is still reachable by name from the class that wrote it". Placement and naming interact in ways I didn't fully check.

8. **A too-new JavaScript method.**
   - *What I wrote:* `t?.messages.findLast((x) => x.id == app.reactMessage)`.
   - *What it said:* `'findLast' is ES2023, and { } code is ES2022 — write [...xs].reverse().find(…), or a loop from the end [DECLARE6001]`
   - *What I changed:* used the suggested reverse-and-find.
   - *Judgement:* a platform limit that was clearly explained. The suggested rewrite copies a 30,500-element array, which is a quiet performance cost in exactly this app.

### Warnings and lint

- **`DECLARE4035`, three sites:** "Avatar has an accessibilityLabel but no role, so nothing reads it…". Later the same for the typing bubble and the "NEW" divider. I added `accessibilityRole = image` and `accessibilityRole = separator`. A useful warning, and it taught me that labels need roles.
- **`DECLARE4025`:** "fill decides through 3 nested ? : choices…" on `EmojiButton`. I moved the "yours" look into a `State`. Fair, and the result read better.
- **`DECLARE1002`:** redundant parentheses in `{ ({}) }` and `{ ({ rows: … }) }`. I removed them. The to-do app writes `({ … })` all over, so I had copied a habit the linter now calls redundant.

### Boot error

- *What I wrote:* `PhotoViewer extends Dialog [ presentation = "full", stage: Control [ … ], caption: View [ x = center, y = { parent.height - this.height - 20 - app.safeBottom } … ], close: … ]`
- *What it said:* `boot: the program did not come up — View.y (murmur-messages.declare:562:37) — View's SimpleLayout places its children, so this child does not declare its y; remove it and let the layout place the child, or set 'ignoreLayout = true' on the child to place it yourself.`
- *What I changed:* wrapped all three in one `frame: View [ width = 100%, height = 100%, … ]`.
- *Judgement:* the docs were unclear (see (a)). Two smaller points:
  - The message says "View's SimpleLayout", but the SimpleLayout belongs to the Dialog's internal content view. Naming the view that owns the layout (`PhotoViewer.content`) would have saved me opening `dialog.declare`.
  - It's a boot error, not a compile error, even though the compiler knows the parent class's layout.

### Layout findings (from `declare-look` and R5 runs, phone with touch)

- `app.main.panes.1.composer.row.box.field 270×40`: changed the minimum height to 44 on the phone.
- `…line.bubble.voice.0 40×40` (the play button): changed to 44 on the phone.
- `app.main.panes.1.body.toEnd 94×36` (the "Newest" pill): changed to 44 on the phone.
- `…marksRow.1 34×26` (the reactions pill): made the control 44 tall with an inner 26-tall chip. That then reported `34×44`, so I added `width = { Math.max(app.wide ? 0 : 44, this.chip.width) }`.

All correct findings, cheap to fix. Without them the phone build would have shipped with four undersized targets.

### Results that weren't what I wrote

1. **The photo picker's thumbnails were about 25 px on the laptop.** First I used `WrappingLayout [ columns = 4 … ]` with `flexes = true` thumbnails. Then my own `Squares` layout, which was still tiny. Then the grid got an explicit width, and that worked.
   - My diagnosis, not verified: `width = 100%` inside a Popover's content resolved against a box that sizes from its children, so the grid had no width to divide. Verify reports this kind of circularity ("…takes its width from its children, and every one of them takes its width from it…") on the first screen, but this was inside an overlay opened by a press, so R4 never saw it.
   - *Judgement:* unsure whether my code was wrong or the overlay's content box should give children a width. It cost three iterations.

2. **On the phone the picker was cut off at the right.** I had written `width = { app.wide ? 392 : app.width - 16 }` on the Popover, which presents as a sheet on a phone. Removing the width on the phone fixed it.
   - *Judgement:* my error, but the docs don't say what an explicit width does to the phone presentation.

3. **The waveform drew past its box** and ran under the "0:03" label. My bar width had a 1.5 px minimum plus a 2 px gap × 64 peaks, more than the available width. My arithmetic bug. Nothing in the platform reports drawing outside a view's bounds; I'm unsure whether that's possible.

4. **A confirmed photo lost its description.**
   - *What I wrote:* `confirm()` replaced the pending record with the service's `sent` message.
   - *What happened:* the service's message carries `"alt": ""`, which wiped my description. Then the phone test failed: `page.getByRole("button", { name: "Photograph: Alpine Forest in Fog" }).last() found nothing within 5 s`.
   - *What I changed:* merged the records, kept the local description when the service's is empty, and set `pending: false` explicitly. My first merge (`{ ...msgs[j], ...m }`) would have left `pending: true` forever, because the service's message has no `pending` field.
   - *Judgement:* my bug, found by the test.

5. **A runtime warning:** `onChange: 'g' changed again in the same settle chain — a ring of change handlers; the second change is not delivered`. I grepped and found `trackChanges = ["g"]` in `library/focusring.declare`. It's not mine, but it appeared in every run of my app.
   - *Judgement:* looks like a platform issue, or at least noise. A minified one-letter name in a user-facing warning sent me into runtime source to rule out my own code.

### Assert-script surprises (driver behaviour, rung 5)

- **The send happened too fast to see.**
  - *What I wrote:* `await drive.key("Enter"); … expect.equal(t3.last.pending, true);`
  - *What it said:* `expected values to be true, got undefined`
  - *Why:* the service's `sent` frame arrived within the step. `verify.md` does say a step ends once the world's answers have landed. I hadn't connected that to "you can never observe a pending state with `drive` verbs".
  - *What I changed:* a synchronous `page.evaluate` that sends and reads in the same turn. Correct behaviour; my misunderstanding.
- **Name matching is a substring match.**
  - *What it said:* `expected values to be 0, got 1`, from `getByRole("button", { name: "React" }).count()`. Then `page.getByRole("button", { name: "React" }) matches 2 elements — … app.main.panes.5.body.col.list.17.marksRow.1 (MarksPill) "🤨 💯 2 😂"; …line.reactR (RoundButton)`.
  - *Why:* my pill's label "Reactions: …" contains "React". That's Playwright semantics, and the strict-match message pinpointed it.
  - *What I changed:* `exact: true`.
- **A covered target.** `a press at its centre (905, 823) would land on app.main.panes.5.body.toEnd (Control) ("Go to newest"), which covers it there`.
  - *Judgement:* a real UX finding. My "Newest" pill covered the hover react button. I moved the pill to the right edge on the laptop.
- **Motion in flight.** `found nothing within 5 s — motion is still in flight on the program's clock, which the script holds (… Spring on openT of app.reactPicker)`. I added `drive.settleMotion()`. A very helpful message.
- **A locator passed to a path-taking assertion.** `page.getByRole(…).toJSON() — a locator here has getByRole, …` I had passed a locator to `expect.visible`, which takes paths. Changed to `expect(locator).toBeVisible()`. The message lists the locator's methods but doesn't say that `expect.visible` wants a path string.
- **Reloading is refused.** `page.reload()` gave `the page left the program …`. I wanted to hold `threads.json` and reload to see the loading state. My workaround: `--call 'app.chat.clear()'` in `declare-look`.
- **`declare-look` argument confusion.** `--shot-of app.photoPicker --shot /tmp/shots/d5.png` gave `/tmp/shots/d5.png is not an option — see --help`. I didn't investigate; unsure whether `--shot-of` takes the file argument itself.
- **Unknown view names get suggestions.** A path naming a view by text I'd guessed (`"Photograph: Plane Above Clouds"`) came back with `nearest there: "Photograph: Airplane in Pink Sunset Sky", …`. Excellent.

---

## (e) Verifying it

- **`declare-verify --rung=3`, repeatedly while writing.** It caught every compile error above, usually several at once.
- **`declare-verify --phone --desktop` (rung 4).** One boot error, then clean. Rung 4 boots with sample data, so it never built `Msg`, `TextMsg`, `PhotoMsg`, `VoiceMsg`, `Scrubber` or `MarksPill`, and it says so explicitly. That note is what pushed me to rung 5.
- **`declare-look --url … --wait-real …` with `--call`, `--click`, `--hold`, `--wheel`, `--read`, `--shot`** against the dev server and the live service. This was the workhorse.
  - *Caught:* the composer and header issues, the tiny picker, the phone picker overflow, the waveform overflow, the four undersized targets, and the loading state's look.
  - *Confirmed by reading `scrollY` before and after:* that hidden panes keep their scroll position.
- **Three rung-5 scripts against the live service:**
  - `tests/desktop.mjs` (34 assertions): reorder on arrival; arrival while reading back; the "1 new message" pill; optimistic send then confirmation; scroll memory; hover reaction; dragging the scroll thumb to the first and last message of 30,500; photo viewer; sending a photo.
  - `tests/phone.mjs` (17 assertions): slide in and out; voice length, playback and seek; back and return; press-and-hold reaction; photo picker; viewer; button send.
  - `tests/reaction.mjs` (4 assertions): reaction growth above the reader, and at the bottom.
- **What the scripts caught:** the lost-description bug, the pill covering the react button, and the alignment of the test's own assumptions.

**How well the tools served me:** very well. The diagnostics consistently named the fix, and the R5 driver's refusals ("covered by", "motion in flight", "strict match") were findings rather than noise.

**Friction:**

- I couldn't reload to test a loading state.
- Real-time scheduled events need wall-clock bookkeeping in the script (`until(ms)`).
- Grabbing the scroll thumb meant hard-coding pixel coordinates. I wrote, then didn't use, a `globalRect` probe. It is dead code still in `desktop.mjs`, which I should have removed.

**What I didn't run:** `declare-profile`, rung 6 visual baselines, or `--semantics`, and I didn't test Tab order.

---

## (f) Confidence, part by part

- **List with unread at a glance: high.** Tested.
- **Order by activity, live: high.** Tested; t6 jumped to the top at 12 s.
- **Reading back through any length: high on the laptop**, where thumb-dragging 30,500 messages to the first and back was tested. **Medium on the phone:** I swiped a few screens only. I haven't seen a fling across thousands of virtualized rows with estimated heights on a real phone.
- **Switching and returning to the same place: high.** Tested on both sizes.
- **Send text, optimistic: high.** **"Sending…" is effectively never seen** with this service.
- **Send a photo: high.**
- **Reactions: high for the mechanics.** But reactions can't be removed (the service has no "un-react"), and a new reaction replaces your previous one. A tester may read that as a bug.
- **Voice: medium-high.** Play, progress and seek all tested.
  - Only one clip at a time, through one app-wide `Audio`.
  - If the playing row scrolls out of the built window, playback continues, which is right.
  - Untested: dragging the scrubber with a finger inside the vertical pane. That's `claim = x` and touch arbitration, from the chapter I didn't read.
- **Full-size photos: high.** The viewer and in-line sizing use the image's natural ratio. Until a photo loads, its place is 4:3, and the reflow is absorbed when it sits above the reader.
- **Reaction growth not disturbing reading: high for growth above the reader** (tested, synthetically). When the reacted message is on screen, content below it moves, and at the bottom the content above it moves. That's normal chat behaviour, but arguable against the brief's wording.

**Where a tester will find problems:**

1. **The "NEW" marker is the shakiest part.** `markId` is set in `onChange` only when `open && markId == "" && !looking`, and nothing ever resets it. My comment says "kept until it is opened again", but the code doesn't do that. On a second visit the old marker stays, or no new one appears. A real bug I noticed only while writing this account.
2. **Performance with many messages.** Each of my own message rows computes `isLastMine`, which scans the conversation. `seenWords` maps every message id (30,500 in Trail crew) on every append. `unread()` re-walks per row in the list. I didn't profile; on a phone in the 30,500-message conversation it may stutter as messages arrive.
3. **Real-device gestures:** hold versus scroll, scrub versus scroll, and the on-screen keyboard lift (`app.keyboardHeight`) are all untested.
4. **Opening on a phone pins you to the bottom.** If a conversation has more unread messages than fit on screen, you start at the newest, and the "NEW" rule is above you.
5. **The service address is hard-coded** as `http://localhost:8330/`.
6. **Dead code:** an empty `onInit() { }` was left in `ThreadView`.

---

## (g) Gaps I worked around

- **Grouped reaction chips.** I wanted one chip per emoji, with a count, each tappable.
  - *Where I looked:* `declare.md` §7 and `14-data.md` refuse a datapath onto a computed value, so I would have needed a derived `Dataset` inside each row.
  - *What I did:* one pill showing a string from the `reactionSummary()` script function, opening the picker.
  - *Judgement:* the platform has what I needed (a per-row derived dataset). I chose not to use it, and I'm unsure whether that's idiomatic or too heavy.
- **A waveform scrubber.**
  - *What I tried:* I looked at `Slider` and considered extending it. Its track, bar and thumb are children, and I assumed a subclass couldn't hide them. I didn't test that.
  - *What I did:* a `ValueControl` subclass modelled on Slider's pointer code, plus `draw()`.
  - *Judgement:* probably the right call. A "draw your own track" hook on Slider would have saved about 40 lines.
- **The phone's slide between list and conversation.**
  - *What I tried:* `ResponsiveLayout`, whose share swap is instant.
  - *What I did:* a custom `Stage` layout whose `place()` reads a sprung `t`, with `vis: false` for whichever side is off-screen.
  - *Judgement:* the platform supports this well; it's the idiom in the marketmap app. Not a real gap.
- **Finding a conversation's pane from code.** `childViews.find` with a cast. Documented, but awkward; an id-keyed lookup on a replicated container would be nicer. Unsure whether one exists.
- **Showing the loading state in a test.** Reload was refused; I used `clear()`. A driver verb to restart the app with a request held would help.
- **Caching photo shapes.** `trackChanges = ["naturalWidth"]` plus `onChange` writing an App-level map. `16-collections.md` warns that `loaded` is unreliable under recycling. I'm unsure whether `naturalWidth` has the same trap when a recycled row loads an image with the same dimensions. Probably harmless, since it only caches.
- **A back gesture on the phone.** I didn't build an edge-swipe back. `waypoint` would give the browser's Back, but setting it to "" on in-app back adds a history entry, so I used a plain attribute. Unsure what the intended pattern for an app's own stack is.

---

## (h) Changes of direction

- **Run grouping.** At first a 20-minute gap started a new run. After the first screenshot, a change of speaker or a 60-minute pause does. *Cause:* seeing it running.
- **The composer.** Its sizes were redone twice, after the misalignment I saw and then the 44-point finding. *Cause:* a screenshot, then a finding.
- **Photo picker grid.** `WrappingLayout [ columns = 4 ]` with flexing thumbnails, then the custom `Squares` layout, then `Squares` plus an explicit grid width. The Popover's width went from `app.width - 16`, to a `State` that applied only on wide screens, to no width at all. All during polish. *Cause:* screenshots.
- **The reactions pill.** A 26-tall control became a 44-tall control with an inner chip, then got a minimum width. *Cause:* layout findings.
- **The "Newest" pill.** Centred became right-aligned on the laptop. *Cause:* the R5 "covers it there" refusal.
- **Confirming a send.** Replacing the record became merging it. *Cause:* the phone test failing to find the photo by its description.
- **The send test.** Driving with keys and checking `pending` became sending and reading in one synchronous evaluate. *Cause:* the R5 result.
- **The reaction test.** Waiting for the service's scheduled 16.5 s reaction became a synthetic frame through `app.receive`. *Cause:* finding that the scheduled reaction lands on an already-reacted message, so nothing grows.
- **Before writing any code:** I considered `waypoint` for the open conversation and chose a plain attribute. I considered per-emoji reaction chips and chose one pill.

---

## (i) Code as it stood, for reproduction

**The photo viewer, as it failed at boot:**

```
class PhotoViewer extends Dialog [ presentation = "full", fill = black,
    accessibilityLabel = "Photograph",
    pic: Message? = { app.viewing },
    stage: Control [ width = 100%, height = 100%, padding = { [56 + app.safeTop, 16, 72 + app.safeBottom, 16] },
        press() { app.viewing = null },
        Image [ width = 100%, height = 100%, fit = contain, source = { … } ] ],
    caption: View [ x = center, y = { parent.height - this.height - 20 - app.safeBottom }, width = { Math.min(parent.width - 32, 640) }, … ],
    shut: RoundButton [ x = { parent.width - this.width - 12 }, y = { 12 + app.safeTop }, … ]
    ]
```

→ `boot: the program did not come up — View.y (murmur-messages.declare:562:37) — View's SimpleLayout places its children, so this child does not declare its y; …`

**The tiny photo grid, opened from a button** (laptop, inside the App):

```
photoPicker: Popover [ accessibilityLabel = "Send a photograph",
    width = { app.wide ? 392 : app.width - 16 },
    Text [ … text = "Send a photograph" ],
    grid: View [ width = 100%, datapath = { app.chat.value },
        layout: WrappingLayout [ columns = 4, spacing = 6, rowSpacing = 6 ],
        SendableThumb [ datapath = :sendable[], flexes = true ] ] ]
class SendableThumb extends Control [ height = { this.width }, cornerRadius = 8, clip = true, … ]
```

→ About 25 px thumbnails, with no finding reported. Same result with `layout: Squares [ across = 4, gap = 6 ]` and `width = 100%`. Fixed by `grid: View [ width = { app.wide ? 360 : app.width - 36 }, … ]`.

**The send check that couldn't see pending:**

```
await drive.click(`${pane("t3")}.composer.row.box.field`);
await drive.type("sounds good, see you then");
await drive.key("Enter");
let t3 = await thread("t3");
expect.equal(t3.last.pending, true);
```

→ `expected values to be true, got undefined (after: click … → type … → key Enter)`

**The ring warning:** any run of the app gives `[Declare] onChange: 'g' changed again in the same settle chain — a ring of change handlers; the second change is not delivered`, which comes from `library/focusring.declare:214 trackChanges = ["g"]`.

**The marker logic I now believe is buggy** (no error; found on reflection):

```
looking: boolean = { classroot.open && (app.wide || app.slide > 0.5) && classroot.atEnd && app.pageVisible },
trackChanges = ["looking", "count", "open"],
onChange() {
    if (open && markId == "" && !looking) markId = app.chat.firstUnreadId(rec)
    if (looking) app.chat.markSeen(threadId)
    },
markId: string = "",
```

I didn't go round in circles on anything. The photo picker was the closest, at three tries.

---

## Overall

**Surprises:**

- How much of the brief's hardest section (§4) collapsed into four declarations.
- That hidden replicated panes keep their scroll position.
- That the assert driver refuses presses on covered targets. That found a genuine UX overlap.

**Good:**

- The diagnostics. Every compile error named the fix, often with the exact rewrite.
- The skill document's reading list.
- The to-do app as a model to copy.
- Scrolling semantics designed around the reader.
- One program for phone and laptop without media queries.
- `declare-look --url` as a one-line "use it and photograph it" tool.

**Bad:**

- Overlay content sizing was undocumented and unreported.
- Library-internal warnings leak into my console.
- Screens reached only after a press get no layout checks unless I write a script that reaches them.
- The ES2022 ceiling pushed me to an O(n) copy in a hot path.
- Testing a loading state is awkward.

**How it compares:** it reminded me most of QML (property bindings, a declarative tree, imperative handlers) and of OpenLaszlo, which the README names. Datapath replication recalls Knockout and Angular's repeat directive, but with identity and virtualization built in. Unlike React there is nothing to re-render and no keys, and unlike SwiftUI the layout model is explicit and queryable. Its edge over all of them is the compiler knowing the tree: "'bubble' is not a member of Msg — a child's is: 'line.bubble'" is something no JSX toolchain can tell you.

**Where I'd most want improvement:**

1. **Layout checks inside overlays and conditional screens without a script.** Even a mode that opens each overlay once in its default state would help.
2. **Documented sizing rules for Popover, Sheet and Dialog content.**
3. **Quieter or attributed library warnings.**
4. **A driver verb to restart the app with requests held.**

**The hardest part and the sharpest edge:**

- **Overlay sizing was the hardest single obstacle.** It was one obstacle that recurred across two overlays: the picker on both sizes, and the viewer's content layout. It cost roughly four or five iterations. To get it right the first time I'd have needed one paragraph in `18-overlays.md` on how the content area is sized, what `100%` means inside it, and what an explicit width does to the phone presentation.
- **The sharpest edge overall was a pattern: things that only exist after a press go unchecked by default.** Rungs 1–4 are excellent, but overlays and data-driven rows were checked only because I wrote R5 scripts.

**What I'd use it for:** data-heavy, live, reading-oriented apps (messaging, feeds, dashboards, trackers), and anything with motion between views. I'd hesitate for a large team without more ecosystem, and for anything needing many third-party UI widgets, though `DOMIsland` exists for that. I'm genuinely unsure how it performs on low-end phones with very large live datasets. I didn't measure it.

## 6. The names ledger

```
NAMES — eval-murmur-18: 2 missed name(s), 1 collision(s), 1 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
     9 · member    · pulse                · View                     · —                  · none         · ×1  ·    9 · resolved
         'pulse' is not a member of View — declare it (pulse: <type> = …) or fix the name [DECLARE6001] (murmur-messages.declare:38:87)
     9 · member    · bubble               · Msg                      · —                  · none         · ×1  ·    9 · resolved
         'bubble' is not a member of Msg — a child's is: 'line.bubble' (reached through the child that holds it) — 2 sites, also on line 369 [DECLARE6001] (murmur-messages.declare:361:116)

COLLISIONS (min · held by · name)
     9 · attribute      · at

DECLARE-HELP MISSES (min · asked for · answered)
     3 · View.claim View.onHold View.keyBindings Time afterDelay · no entry for 'View.claim View.onHold View.keyBindings Time afterDelay' — searched reference (2018 entries), classes (109), enums, diagnostics, the hint tables, 

SUMMARY: 2 of 2 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
