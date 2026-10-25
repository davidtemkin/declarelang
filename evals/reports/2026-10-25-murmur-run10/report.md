# Murmur run 10: Declare 613f8875 (v0.5.3), Opus 5.5

**Run:** 2026-10-25 05:18 UTC, launched with `evals/craft/launch.sh murmur ~/Code/eval-murmur-10 claude-opus-5-5 613f8875`
against GitHub main `613f8875`, the v0.5.3 release. The service ran at `--scale=100`: about 44,000 messages, with the
longest conversation at 30,500. One round, one phase, no intervention. The standard strip removed `evals/`,
`docs/system-design/` and `test/`.

It is the first Murmur since run 9 (`611b696f`). Since then, Declare has answered two of run 9's findings:
- `firstVisibleRow`, a fact of the list;
- `Text.wrapWidth`, for a bubble as wide as its text up to a cap.

The verify docs also gained a paragraph on the virtual clock. This run used both new features, and neither needed a
workaround.

The app, the agent's three assert scripts and four pictures taken from the main tree are filed beside this report. The
agent's dev server has stopped, so there is no live copy. To try it, start the service on 8330 and serve
`murmur.declare` from a Declare checkout.

**Scored from the main tree** (`be8d9117`): `declare-verify murmur.declare` is clean through R4: 1,028 nodes, 382 of
476 constraints statically wired. The program needs no `use`, so the slimming redesign's permitted-set rule doesn't
touch it.

## The comparison

The build figures come from the build's own final record. The account was asked for afterwards, in a separate
read-only resume (1.4 min, 7.0k output tokens), and is counted separately.

| | run 6 | run 7 | run 9 | **run 10** | React-2 | Svelte-1 |
|---|---|---|---|---|---|---|
| Declare commit | `75d710da` | `609f04f0` | `611b696f` | **`613f8875`** | — | — |
| time | 42.0 min | 37.7 min | 23.4 min | **21.1 min** | 17.6 min | 20.5 min |
| turns · tool calls | 226 · 225 | 170 | 124 · 123 | **109 · 108** | — | — |
| code, raw lines | — | — | 1,368 (5 files) | **1,190 (4 files)** | — | — |
| code, excluding comments and blanks | — | 1,132 | 955 | **944** | 2,815 | 2,922 |
| **Tokens** | | | | | | |
| output (incl. thinking) | — | — | 102k (44k) | **86k (35k)** | — | — |
| fresh input (cache writes) | — | — | — | **275k** | — | — |
| cached input re-read | — | — | 23.8M | **21.6M** | — | — |
| read before first app write | — | — | — | **389 KB** | — | — |
| context at first write → end | — | — | — | **177k → 283k** | — | — |
| first app write at | — | — | — | **5.2 min** | — | — |
| **Download (gzip)** | — | 131.5 KB | 148.5 KB | **156.5 KB** ¹ | 185.2 KB | 65.8 KB |
| runtime source read | — | — | — | **0** | — | — |
| library source read | — | — | — | **6 calls** (icons, themes, dialog, simplelayout) | — | — |

¹ Built with the run's own compiler (v0.5.3). Today's main tree builds the same program to **168.4 KB**. The 12 KB is
the slimming redesign's known price: 14 modules that v0.5.3 left out of Murmur now ship to every program. They include
the canvas-filter fallback (open item L-32), 3D, the image and text drawing modules, `measureText`, faces, files,
selectors and tips.

**The headline:** the fastest and smallest Murmur yet. It took 21.1 min, against 23.4 for run 9 and about 40 for runs 6
and 7. Its 944 code lines are a third of React's or Svelte's for the same brief. It used 16% fewer output tokens than
run 9 and 9% less cached input. It read no runtime source.

## Against React and Svelte, at run time

I measured all four builds on 2026-10-25 with a click-driven variant of `evals/apps/murmur/bench.mjs` (filed as
`tests/compare.mjs`). Neither Declare run puts the open conversation in the URL, so every arm opens conversations by
clicking its row.
- **Builds:** React-2 and Svelte-1 were built from their filed source with `vite build`. Declare 9 and Declare 10 were
  built with `declarec` from the main tree, so both carry today's runtime.
- **Setup:** one quiet service at `--scale=100`, headless Chrome at 1440×900, median of 3.
- **Heap:** measured after a forced GC.
- **Open time:** from the press to the frame in which the conversation's last message is visible.

| metric | React-2 | Svelte-1 | Declare 9 | **Declare 10** |
|---|---|---|---|---|
| download (gzip -9: HTML, JS, CSS) | 185.2 KB | 65.8 KB | 168.3 KB | **168.4 KB** |
| load → list shown | 106 ms | 96 ms | 233 ms | **250 ms** |
| DOM elements at rest | 112 | 122 | 289 | **498** ² |
| JS heap at rest | 10.1 MB | 9.9 MB | 17.2 MB | **19.0 MB** |
| median first open | 128 ms | 59 ms | 61 ms | **48 ms** |
| open the 30,500-message thread | 128 ms | 56 ms | 90 ms | **86 ms** |
| median reopen | 112 ms | 62 ms | 20 ms | **24 ms** |
| DOM elements, all six opened | 341 | 250 | 2,165 | **1,741** |
| JS heap, all six opened | 12.7 MB | 11.7 MB | 34.4 MB | **29.9 MB** |

² At a desk's width, run 10 opens the most recent conversation (Dana) at load, so its resting count includes one open
thread. Its "first open" of Dana is the press on an already-open row.

Both Declare programs keep every conversation they have opened built. That is how they keep each reader's place with no
code, and it accounts for both their fast reopen and their larger footprint once all six are open. React and Svelte
rebuild one thread at a time. The platform's own gaps are the same as in run 9:
- time to the first screen, about 2.5× React's;
- the resting heap, about 2× React's;
- the download: 2.6× Svelte's, though smaller than React's.

## Where the time and the tokens went

| phase | time | cached input re-read | share |
|---|---|---|---|
| **Reading and planning** (0–5.2 min) | 5.2 min | 2.93M | 14% |
| **Writing** the four files (5.2–10.4) | 5.2 min | 1.47M | 7% |
| **Debugging and verification** (10.4–21.1) | 10.7 min | 17.15M | **80%** |

The reading followed the skill's order exactly:
- `declare.md`;
- guide chapters 01, 04 and 05;
- the whole calendar;
- then the chapters its plan needed: 07, 16, 13, 14 (streams), 06, 18, 10 and 12.

It also made about 30 `declare-help` lookups. Almost every hard requirement in the brief has a guide section, and the
program shows it.

| # | the question | time · cached input | outcome | cheapest answer |
|---|---|---|---|---|
| E1 | does it compile? | 0.6 min · 1.07M (5%) | Six `declare-verify` rounds, each message fixed from its own text (listed under API and language) | — the ladder working |
| E2 | both sizes; does the long thread reach its first message? | 1.2 min · 2.26M (10%) | It does, from 2020; one layout fix | — |
| E3 | does a voice message play? | **2.9 min** · 2.59M (12%) | Under `declare-look`, `playing` and `loaded` were true but `position` stayed 0. A `--js` probe with a page `setTimeout` hung until the agent's 120 s tool timeout; it then ran `pkill -f "declare-look-"`. Shipped unconfirmed | T1. **I checked it under a real clock: the time goes 0:00 → 0:01 → 0:03, so playback works.** |
| E4 | hold to react on a phone; a live message while reading back | 1.0 min · 1.21M (6%) | Both pass. `console.log` in an assert script printed nowhere, so it wrote results to a file | T2 |
| E5 | the photo viewer and the picker | 1.3 min · 2.75M (13%) | Real fixes to the picker | — |
| E6 | the list's order: a conversation that comes to life rises | 1.5 min · 2.88M (13%) | Read guide 23 and `TweenLayout --all`, wrote `GlideStack`; one boot error ("GlideStack sizes its children") fixed from its text | D3 |
| E7 | does a reaction disturb what is being read? | 1.7 min · 2.44M (11%) | Inconclusive: `inspect` gave rows `rootY` near −146,000 (recycled rows). It added a spring on the reaction's room and said so plainly at handoff | T3; and see "Each complaint, checked" |
| E8 | `DESIGN.md`; restart the server | 0.4 min · 1.95M (9%) | — | — |

### Each complaint, checked

- **"Audio didn't advance."** It is the look tool's clock, not the program. In plain headless Chrome with no virtual
  clock, a voice message in Priya's conversation counts 0:00, 0:01, 0:03 over three seconds.
- **"I never verified that a reaction doesn't disturb what is being read."** I measured it in the production build by
  right-clicking a bubble and choosing ❤️:
  - **At the newest message,** the reacted message and everything above it rise 32 px, because the pane is pinned to
    its end. Everything below stays.
  - **Scrolled back,** everything above it stays, and everything below it drops 32 px.

  Both glide on the program's spring, so nothing jumps, but words on one side of the reaction move. A chip that hangs
  over the bubble without adding height would move nothing. Whether a 32 px glide meets the brief is a judgment I'd
  put to you. Run 9 wasn't measured on this.

## What it built

Two surfaces placed by the width:
- **At a desk:** a rail of conversations beside the open one.
- **On a phone:** the list is home, and a conversation slides over it on one spring (`openT`).

`DESIGN.md` calls the look "paper and ink": a warm page, a serif for names and headings, and each person speaking in a
hue of their own. Their bubbles take a pale wash of it in a group, and their name and "writing…" line a deep tone.

How it's built:
- **`Conversations extends DataSource`** holds the history. Every write is one of its methods: append, confirm, react,
  mark read.
- **The live feed** is a `Socket` on the App, active once the history has loaded. One `hear()` dispatches each frame.
- **The inbox** is a derived `Dataset` (`summarize()`), shown through `GlideStack`, a ten-line `TweenLayout`. A
  conversation that comes to life glides to the top.
- **One `Conversation` per thread,** replicated from the store and kept built; only the open one is visible. Each keeps
  its own scroll position and draft.
- **The history:**
  - `virtualize = true` with `classFor` over `TextMsg`, `PhotoMsg` and `VoiceMsg`, beneath a shared `Msg` frame
    (`defaultplacement = body`);
  - `scrollAnchor = end`;
  - day headings, pause times, runs, names and faces all derived from neighbours by `rowIndex`;
  - the date chip from `firstVisibleRow`.
- **Smaller pieces:**
  - **Reactions:** a `Popover` with `focusScope = stop`.
  - **The photo picker:** a `Popover`.
  - **The photo viewer:** `Dialog [ presentation = "full" ]`.
  - **The voice scrubber:** its own `Control`, which draws the recording's peaks and is a full `slider` to assistive
    technology.

## Findings, by area

### Reading and docs

- **D1. The calendar as required reading.** It was 52 KB, read whole before the first line. The account says it was
  "less useful for this app than the skill suggests… for an app shaped like a list, the tracker, or a smaller chat-like
  example, would have taught me more." This is the teaching-app question we're discussing.
- **D2. No example takes a stream all the way to a typed store.** Chapter 14's Streams section appends to a string.
  Nothing parses typed frames, dispatches on a field and writes into a schema'd `DataSource`. The agent invented that
  part and calls it its least idiomatic code.
- **D3. `TweenLayout`'s reference is thin.** The agent had to infer:
  - `laid()`;
  - `contentExtent("width")`;
  - the `{x, y, w, h, vis}` that `place()` returns;
  - that a change in the order of the replicated rows wants a `retarget(true)`. It did this from an `onChange` on an
    order string and said it wasn't sure that was the intended trigger.
- **D4. Reacting once to an image load.** The answer was `trackChanges = ["loaded"]`, found by asking. Chapter 13
  derives from `loaded` but never shows a one-time reaction to it.

### API and language

What the compiler said, all fixed from the message:
- DECLARE2005: a Spring can't drive a constrained `opacity`.
- `{}` as a default must be `{ {} }`.
- A hex color in braces must be `0x…`.
- DECLARE4005: bare `bold` in braces.
- DECLARE6001: `cornerRadius` wants a 4-tuple.
- `parent.badge` may be absent under `exists`.
- DECLARE2006: `accessibilityRole = slider` requires the value, min, max and increment members. The account says this
  made its scrubber accessible when it otherwise wouldn't have been.
- A method named `post` collided with `App.post`.
- The warnings DECLARE4023, 4022 and 4007 each caught a real bug.

- **L1. Stream frames are untyped.** `onMessage` hands over a string, so the program has a script `Frame` type,
  `JSON.parse(raw) as Frame` and `f.message as Message`. The account's top request is a `schema` on `Socket` frames,
  ideally a union on the type field.
- **L2. Keyed transient state has no typed home.** `writers: object` and `readTo: object` are cast with `as Record<…>`
  at every use, which is the drift the skill names. A `Node` or a schema'd `Dataset` would do. Before anything new,
  check whether an attribute can already be declared with a record type.
- **L3. A member that shadows a built-in.** It was reported at the use, not at the declaration. This is the third run
  in a row with a name collision: `Sheet` (Cadence 12), `Pane` (Murmur 9), and now `post`.
- **L4. No place for a per-record view fact.** A photo's measured aspect is written back into the service's record
  (`:aspect = a`, messages.declare:172). It works because extra keys pass, but it mixes view state into the data, and
  it bypasses the store that the program's own header says makes every write.

### Debugging and verification

- **T1. Media and page timers under `declare-look`'s clock.** This was the most expensive question in the run (E3, 2.9
  min).
  - Chapter `verify.md` now explains the virtual clock for the program's own timers. It doesn't say that a media
    element's `position` won't advance.
  - Nor does it say that a `--js` expression waiting on a page `setTimeout` never returns. It hung for 120 s.

  Wanted: a `--js` that fails fast, naming the clock; a sentence on media in `verify.md`; and ideally a way to let media
  run on real time in a check.
- **T2. `console.log` in an assert script goes nowhere visible.** The agent wrote its results to a file instead.
- **T3. Positions of recycled rows.** Measuring rows through `inspect` returned stale `rootY` values for rows that had
  been recycled, so the check was inconclusive.
- **T4. A port suggestion that was also taken.** The dev server's "PORT=8202" suggestion was itself in use. A small
  one.
- **Process, for the standard:**
  - its probes went to `/tmp/mm`;
  - it killed browsers by pattern (`pkill -f "declare-look-"`);
  - it read the virtual-clock paragraph only after the hang.

### What would pay most, ranked

1. **T1:** the look and check clock covers media, and `--js` fails fast. This was the run's largest single cost, and
   the reason it shipped unsure.
2. **L1:** typed stream frames. Every live-data app writes this glue.
3. **D1:** the required reading. This feeds the teaching-app discussion.
4. **D2:** a stream-to-store example in chapter 14. It may come free with L1.
5. **L3:** shadowing reported at the declaration.
6. **D3:** the `TweenLayout` reference: `laid`, the `place` return, and when to `retarget`.
7. **T2:** assert output, and **L2** and **L4**.

## Is it idiomatic Declare?

I read all four files (1,190 lines) against the SKILL drift check, `declare.md` and the guide. It's the most idiomatic
Murmur yet. Of run 9's five missteps, four are gone:
- the composer is sized by `contentHeight`;
- the inbox reorder is a `TweenLayout`;
- there's no `Keys` Esc;
- the emoji row is a single Tab stop (`focusScope = stop`).

The fifth doesn't apply: the scrubber's `input(frac)` is the value-hook form that run 9's review recommended.

### What it gets right

- **The long list as taught:**
  - `virtualize = true` with `classFor` (murmur.declare:189);
  - `scrollAnchor = end` and `scrollTo(Infinity)` to follow;
  - neighbours by `rowIndex` over provided `msgs` (messages.declare:20–27);
  - the date chip from the list's own `firstVisibleRow` (murmur.declare:202);
  - no measuring, windowing or restoring.
- **A shared frame and a class per kind.** `Msg` carries the heading, name, face, reactions and status, and each kind
  supplies only the bubble, through `defaultplacement = body`.
- **Bubbles sized by `wrapWidth`** (messages.declare:134), not `measureText`. Run 9's finding 3 is answered and used.
- **One store with its writes as methods** (store.declare). The inbox is derived and never maintained by hand.
- **The arrangement change is a layout's job:** `GlideStack extends TweenLayout` (murmur.declare:95).
- **Library overlays throughout:**
  - `Popover`s anchored by `showFor`;
  - `Dialog [ presentation = "full", shown, input ]` for the viewer;
  - no hand-built scrims.
- **`waypoint` for the open conversation,** so Back closes it; the slide is one spring that reads it.
- **Its own controls `extend Control`,** and the scrubber is a complete slider to assistive technology (role, value,
  range, increment).
- **Typed records:** `schema` for every record kind, a theme pair for light and dark, and icons drawn on `Icon`.

### Missteps, and how they should have been written

1. **A write that bypasses the store** (`PhotoMsg.learn`, messages.declare:171–173). It writes `:aspect` into the
   service's record from a row, and `aspect` isn't in the `Message` schema. The store's own header promises that every
   write goes through it.
   - If the shape must persist across row rebuilds, it belongs in the store as `app.store.learnAspect(tid, id, a)`, with
     `aspect?: number` in the schema.
   - Otherwise it's simply the image's `naturalWidth / naturalHeight`, read where it's needed.
2. **Untyped maps with casts** (`writers`, `readTo`, murmur.declare:285–286, 337, 354, 398, 406). This is the drift
   check's "`as any` on your own data". It wants a `Node` subclass, `Presence`, holding typed records and the two
   setters, or a schema'd `Dataset`.
3. **Reaching into the tree for a pane** (`pickPhoto`, murmur.declare:457–461): `app.panes.childViews.find(…) as
   Conversation`. The photo button can pass its `Conversation` to `offerPhotos`, as `offerPhotos(this, classroot)`, and
   the choice calls back into it. Or the pane can follow its own newest message from the reader, the way it already
   follows arrivals.
4. **A container's height done in arithmetic** (the picker's `grid`, murmur.declare:540): `Math.ceil(n / cols) * (size
   + 8) - 8`. A `WrappingLayout` sizes its view from its rows, so the height can be left out.
5. **The typing dots on a `Time` with a phase counter** (murmur.declare:224–232). This one is defensible: it keeps
   `settleMotion` usable, which run 9's `Animator` loop broke. It's worth a sentence in the guide on which form is
   preferred for decoration.

### Workarounds the platform forced

- **A script `Frame` type and `as` casts for the live feed** (L1).
- **`sid` and `pending` beside `id`,** so a confirmed send keeps its row. This is run 9's finding 4, still open, and the
  chapter 16 note on client refs made it easier this time.
- **An order string watched to call `retarget(true)`** (murmur.declare:484–486). A replicated set that reorders under a
  `TweenLayout` might reasonably glide by itself (D3).
- **`marks: Dataset` for six literal emoji,** because a literal `datapath` is refused. This is run 9's finding 7.

## The agent's account, verbatim

Asked by resuming the finished session with read-only tools (`impressions.txt`). 1.4 min, 7.0k output tokens.


I built Murmur in one session: a chat client with six conversations, about 44,000 messages, a live WebSocket feed, and photos and voice messages. It came to roughly 1,190 lines of Declare across four files. Below is what that was like, including where I'm unsure and where I took shortcuts.

#### (a) Getting up to speed

**What I read.** I followed `skill/SKILL.md`'s reading order exactly: `docs/declare.md` in full, guide chapters 01, 04 and 05, then all of `apps/calendar/calendar.declare`. After that I read only what I needed: chapters 06 (layout), 07 (scrolling), 10 (touch), 13 (media), 16 (collections), parts of 12 (text), 14 (data sources and streams) and 18 (overlays), and the TweenLayout section of 23. I also made about thirty `npx declare-help` lookups. I did not read `28-calendar.md`, even though the skill puts it beside the calendar source, and I did not read `intake.md`.

**What taught me the most:**
- **`docs/declare.md`** was the most valuable single file. "Seven differences" is the right way to open: it named in advance the mistakes I then made, such as colors inside braces. The two-column table under "What you can assign" was what made constraint ownership click for me: setting an attribute is owned by its constraint, while declaring one with a default can be overwritten.
- **Chapter 16 (collections)** gave me the shape of the whole message pane. Its "What sits between records belongs to the row after it" example, where a row reads `provided("rows")` and checks `rowIndex - 1`, is exactly how I did day headings, pause times and runs of messages from one person. The line about keying a message on a client `ref` before the server names it read as if written for a chat app. I chose a related design: keep the local id, and record the server's id as `sid`.
- **Chapter 07, "Keeping the reader's place" and "Following the end"** turned what is normally the hardest part of a chat client into one attribute, `scrollAnchor = end`. The example constraint `newBelow = { log.contentHeight - log.scrollY - log.height > 48 }` went into my code almost unchanged.
- **Chapter 13, "A scrubber"** supplied the voice-player pattern: a smooth playhead advanced by a frame `Time` that defers to the clip's reported position, plus `claim = x`. I adapted it close to verbatim.
- **The skill's "What Declare handles for you" table** is a strong index. Most of my needs had a row in it.

**What was missing or misleading:**
- **The calendar was less useful for this app than the skill suggests.** It is a hand-placed scene with springs mapping its geometry. A chat app is mostly layouts and a virtualized list. Reading 920 lines of it cost real context, and I used very little of it. My guess is that for an app shaped like a list, the tracker, or a smaller chat-like example, would have taught me more.
- **No complete example combines a Socket, a DataSource and incremental writes.** Chapter 14's Streams section shows `onMessage` appending to a string. It does not show the realistic pattern: parse typed JSON frames, dispatch on a type field, and write into a schema'd DataSource. I invented that part, and it is the least idiomatic code I wrote (see (b)).
- **`App.phone` doesn't exist.** I guessed it from the skill's mention of weather's `app.phone`, which is that program's own attribute. `declare-help` corrected me immediately, which is the system working as intended.
- **`Image` has no load event**, and I had to learn that by asking. In hindsight it fits the "media is state" principle, and `trackChanges = ["loaded"]` was the answer. But the media chapter never says how to react *once* to an image loading, as opposed to deriving from `loaded`.
- **`TweenLayout`'s reference entry is thin.** I wrote `GlideStack` from the guide's toy example. I had to infer `laid()`, `contentExtent("width")` and the shape `{x, y, w, h, vis}` that `place()` returns. I also had to infer that I should call `retarget(true)` from an `onChange` on a derived order string. I'm not confident that's the intended trigger.

#### (b) Expressing what I wanted to express

**Where it fit very well:**
- **The 30,500-message thread.** `Msg [ datapath = :messages[], virtualize = true, classFor = {…} ]` inside a `scrolls = y, scrollAnchor = end` view simply worked. The content height reported about 2.97 million pixels, scrolling reached the first message from 2020, and `firstVisibleRow` drove the floating date chip. I wrote no row-height code, no windowing and no restoration. This was the biggest surprise of the build, and the part I'd most want to keep.
- **Keeping each conversation's place.** I kept every conversation pane built and toggled `visible`, so each scroller kept its own `scrollY`. Switching away and back left the 30k thread at the same offset to the pixel (2,968,820 before and after). I wrote nothing for this.
- **New messages while reading back.** In a measured run, a live message arrived while I was scrolled up. `scrollY` moved by 1 pixel and the "1 new message" pill appeared through a plain constraint.
- **`classFor` with `defaultplacement = body`.** One `Msg` base class supplies the frame: heading, name, face, reactions and read status. `TextMsg`, `PhotoMsg` and `VoiceMsg` add only the bubble. This felt like the language's grain.
- **`waypoint` for the phone's Back button.** One attribute gives three behaviours: the open conversation, the Back button closing it, and the slide (a Spring on `openT`).
- **Overlays.** `Popover [ placement = "above" ]` became a bottom sheet on the phone (by width) for the photo picker. `Dialog [ presentation = "full", shown = {…}, input(open) {…} ]` gave a lightbox with Esc handling and focus for free.
- **Springs on derived values.** Fading photos in on load, and making room for reactions by springing a `room` value that a spacer's height reads, each took one line.

**Where I worked around it, or wrote code I'm not proud of:**
- **Transient feed state as untyped objects.** I held "who is writing" and "who has read how far" as `writers: object` and `readTo: object`, cast with `as Record<string, string[]>` at every use. The skill's drift check names `as any` on your own data as drift, and this is the same smell. The better form is probably a `Dataset` with a schema, or a `Node` class. I didn't take the time, and the compiler didn't push me there.
- **Socket frames are untyped.** `onMessage` gives a string, so I wrote a `script` type `Frame` and `JSON.parse(raw) as Frame`, then cast `f.message as Message`. A Socket that accepted a `schema` for its frames, the way `DataSource` does, would remove all of that. That's my top request for this kind of app.
- **Writing a UI fact into server data.** A photo's aspect ratio is only known after it loads, so `PhotoMsg` writes `:aspect = a` back into the message record. Then a virtualized row that is rebuilt later doesn't have to measure again. It works because "extra keys always pass," but it mixes view state into the service's records. I couldn't find a sanctioned per-record view cache.
- **Reaching into the tree.** `pickPhoto` finds the right conversation pane with `app.panes.childViews.find(...) as Conversation` so it can call `sendPhoto` and scroll. Chapter 04 says a part shouldn't search the tree. Routing it through state, such as a `scrollToEndRequested` value per thread, would have been cleaner.
- **Context passed through `provided()`.** Each row needs the conversation's message array, thread id, group flag and line width. Following chapter 16, I provided them as attributes on the list's column and read them with `provided("…")`. It works, but it is stringly typed, and I couldn't find whether `provided` keys are checked the way theme tokens are.

**Diagnostics I hit**, all in the first few verify runs, roughly in order:
- DECLARE2005: a Spring can't drive a constrained `opacity`. The message gave the exact rewrite.
- An object literal `{}` as a default must be written `{ {} }`.
- `#0000002A` inside braces must be `0x0000002a`.
- DECLARE2006: `accessibilityRole = slider` requires `accessibilityValue`, `Min`, `Max`, `Increment()` and `Decrement()`. This made my scrubber properly accessible, and I wouldn't have done it otherwise.
- DECLARE4005: bare `bold` inside braces must be a string.
- DECLARE6001: `cornerRadius` wants a four-number tuple, not `number[]`. Also, `parent.badge` may be absent because of `exists`.
- My method named `post` silently overrode a built-in `App.post` with an incompatible signature. The error was clear, but the collision itself surprised me: there is no reserved-name list that would have warned me in advance.
- Warnings caught real bugs: DECLARE4023 (`rowIndex` read on a non-replicated child), DECLARE4022 (selected row lacks `accessibilityPressed`), and DECLARE4007 (a `new Date()` in a constraint will never re-run).
- At boot (R4, not R1): "GlideStack sizes its children, so this child does not declare its width."

Every fix took one edit, and each message named the fix. It is the best compiler-error experience I've had in an unfamiliar language. Going from first compile to clean through R4 took six iterations.

#### (c) Verifying it

**What I used:**
- `declare-verify` R1–R4 after every edit, which takes seconds.
- `declare-look` screenshots at 390×844 with `--touch` and at 1440×900, including `--dark`.
- `--read` and `--call` for values.
- `--hold` and `--click` with view paths and accessibility-label paths such as `app.reactions."😂"`.
- Two `--assert` scripts for timed live behaviour.

**What served me well:**
- Clicking by label (`'app.panes.1."Play voice message"'`) is excellent.
- R5's "a press on X would reach Y: it is covered" message caught a bad test of mine: I had clicked a hidden pane's composer.
- `--read` on deep paths (`app.panes.3.scroller.column.firstVisibleRow`) gave numeric answers to "does it scroll to the top?" without a picture.
- `__declare.at(x, y).path` in `--js` was the quickest way to find a path to hold.

**Where the tools were hard to use:**
- **`console.log` in an `--assert` script didn't appear anywhere I could see.** I ended up writing results to a file with `fs.writeFileSync`. Either I missed the flag, or output from passing scripts is swallowed.
- **`--js` with a page-side `setTimeout` hung until my 120-second tool timeout.** I believe that's because `declare-look` controls the clock, so a raw timer never fires. That's reasonable, but nothing told me. A hang is the worst way to learn it.
- **Audio didn't advance in headless Chrome.** After a real click, `playing = true`, `loaded = true` and the duration was known, but `position` stayed at 0. My guess is that it's the same frozen clock, or headless audio policy. **I don't know which, and I shipped without confirming that playback works in a real browser.** It's the biggest open item in the build. A documented "media doesn't advance under the look clock; do X" would have saved me the uncertainty.
- **I mismeasured the effect of a reaction on reading position.** My script used `__declare.inspect(...)` and compared row positions. The "before" rows came back with `rootY` values around −146,000, which I believe were stale or virtualized instances. The measurement was inconclusive. I added the `room` spring on the reasoning that motion is better than a jump, but **I never verified the brief's requirement that a reaction doesn't disturb what's being read when the reader is at the newest message.** I should have said that more plainly at handoff.
- **Assert scripts that wait on the real service need real time.** The seeded schedule runs on the server's wall clock, while `drive.wait` advances the program's clock. I mixed the two with a `Date.now()` loop. It worked, but I'm not sure it's sanctioned.
- **I never opened the app through the dev server in an ordinary browser,** and never used the Inspector. Everything I checked was headless. The skill's "use it once as a person would" step happened only in emulation.
- **Small operational snags:** ports 8200–8202 were already taken. The message ("already taken by another Declare dev server, serving a different tree… PORT=8202") was helpful, but its suggested port was also taken. Separately, the background server died after the two-hour limit, which is my environment, not Declare.

#### Surprises

- Virtualization plus scroll anchoring at 30,000 rows of varied height just worked, with smooth `scrollTo(0)` and `scrollTo(Infinity)`.
- The compiler enforces accessibility contracts (DECLARE2006) as structure, not lint.
- `onHold` on a bubble wins over children that have their own taps, exactly as chapter 10 promises. The bubble example there is literally a chat bubble.
- It was easy to collide with built-in member names (`post`).

#### Good and bad

**Good:**
- The diagnostics are the best part of the system, for an LLM in particular. Each one names its fix.
- Collections and scrolling remove the code that usually dominates a chat client.
- Springs and states are cheap enough that I used motion casually: the list's glide, reaction room, fade-ins and the slide-over.
- The documentation is opinionated and mostly right about what I'd reach for.

**Bad:**
- Untyped stream frames.
- Transient keyed maps have no obvious typed home.
- The headless clock and media make the verification story incomplete for anything with audio or real-time behaviour.
- The reference prose for less common classes (`TweenLayout`) is thin.
- The required first read (the calendar) is expensive for apps unlike it.

#### Compared with what I'm used to

- **Versus React:** no effects, no keys, no memoization, no virtualization library, no scroll restoration. React's real-world ergonomics come from its ecosystem. Declare's come from owning the runtime, which is what chapter 16 claims, and here it held up.
- **Versus CSS:** having no cascade was freeing. Padding as the view's content box, and `flexes`, were quickly natural.
- **Two-delimiter syntax:** `[ ]` versus `{ }` caught me only on literals (colors, enum words) inside braces, and the compiler covered every case.
- **No async in handlers, and no `fetch` or timers in bodies.** I rarely felt the restriction, because `Socket` and `afterDelay` covered it.

#### What it reminded me of

- **QML** most of all: property bindings, states, anchors-like constraints, and `id`-style named children.
- **OpenLaszlo/LZX**, which it names as its parent: datapath replication and `classroot`.
- **Flex/MXML** to a degree.
- **SwiftUI's** `isPresented` pattern, in `shown` plus `input`.
- **A spreadsheet's** dependency model, but with the dependencies extracted by the compiler.

#### Where I'd most want improvement

1. **A `schema` on `Socket`/`Stream` frames**, so `onMessage` receives typed records, ideally a discriminated union on `t`.
2. **A documented, typed home for keyed transient state**, such as a schema'd map type. That would remove the `object` plus cast pattern the drift check itself discourages.
3. **Headless verification of time and media:** document how the look clock interacts with page timers and `Audio`, fail fast instead of hanging, and give a way to assert playback progress.
4. **An assert-script log channel that is always visible.**
5. **A sanctioned per-record view cache**, for facts such as a measured aspect ratio, kept separate from server data.
6. **A smaller "list app" reference** in the skill's required reading, alongside or instead of the calendar, for programs shaped like lists.
7. **A warning when a member name shadows a built-in**, at the point of declaration.

#### Would I use it going forward?

For interactive, data-heavy client apps (chat, feeds, inboxes, trackers, dashboards with motion), yes, gladly. The collection and scroll machinery alone would decide it, and the diagnostics make it unusually safe to write as an LLM. I'd hesitate on anything audio- or real-time-heavy until verification covers it. I'd also hesitate wherever an established JavaScript widget ecosystem matters, though `DOMIsland` may answer that; I didn't test it.

My judgment is least certain on three things: whether my state patterns (`provided()` context, object maps, writing `:aspect`) are what the designers intend; whether voice playback works in a real browser; and whether a reaction at the newest message really leaves the reading position undisturbed.
