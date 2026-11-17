# Murmur run 19: Opus 5.5, Declare, on the local tree, minimal

The first run of the minimal round. At `--level minimal` the prompt's bar is: "it must build
and start with no errors. Check that and nothing more: do not drive it, script it, take
screenshots of it or look at it in a browser." **10.6 min, 43 turns, 64k output tokens**
(30k thinking). Timing record: `evals/timings/2026-11-15-murmur-run19-local.txt`.

## 1. The score

**The hidden drive: 15 of 15**, as delivered (`drive-results.json`), and 15 of 15 on the
snapshot at its first clean boot (20:05:54, recording commit `ba47031`; what followed was a
format pass, three small edits of its own judgement, and its design notes). The agent never
saw the app run: its only checks were verify's R1–R4, seven calls in 0.2 min.

## 2. The comparison

| | 16 | 17 (bare) | 18 (standard) | **19 (minimal)** |
|---|---|---|---|---|
| total | 17.8 | 31.3 | 23.6 | **10.6 min** |
| turns | 87 | 143 | 114 | 43 |
| output tokens (thinking) | 73k (23k) | 116k (43k) | 97k (37k) | 64k (30k) |
| reading · writing · checking | 4.2 · 2.4 · 11.2 | 4.3 · 0.0 · 27.0 | 6.0 · 2.7 · 14.9 | 4.8 · 3.9 · 1.9 |
| drive | 15/15 | 15/15 | – | 15/15 |

- Reading took as long as before (4.8 min); the time saved is the checking (1.9 against 14.9).
- **Code:** 1,122 lines in 2 files, 817 without comments and blank lines (Murmur 18: 1,246 and
  924). **Download:** 197 KB gzip as a production build (run 18: 194 KB, on an earlier runtime).
- **Tokens:** 64k output (30k thinking), 86 fresh input, 227k cache writes, 6.7M cache reads.
  The context at the first write and at the end are not recorded: the run's logs were deleted
  before this audit was finished, against the README.
- **Source reads:** none. The one the timing record counts is a `grep -l` over `apps` and
  `library` for examples of `scrollAnchor`.

## 3. The refusals (one compile round, all named their fix)

1. `viewAt: string` on the App → DECLARE2000, a runtime member. Renamed. The agent: say what
   `viewAt` is. (`names.py` counted no collision: its patterns miss this message — to fix.)
2. **A child `close: RoundButton` inside a `Dialog`** → "'close' is already a member of Dialog —
   … Give Dialog an attribute and read it in the child". **Platform finding:** the collision
   is with the method `close()`, and the advice fits a child-redeclaration case, not this one;
   the message should say what `close` is.
3. `accessibilityRole = slider` without its contract → DECLARE2006 listed the five members;
   added. Good refusal.
4. `bold` inside braces → DECLARE4005 exact; `cornerRadius = { classroot.corners }` with
   `corners: number[]` → DECLARE6001 (typed `Radius` instead); `Gradient.linear(90, [ … ])`
   guessed → TS2345. The agent's own.
5. Warnings: DECLARE4035 (role for a labelled Avatar), DECLARE4025 (a four-part condition,
   split — "the code is clearer for it"), DECLARE1002 (parentheses).

## 4. Findings for the platform (each reproduced, in the audit's scratch programs)

1. **An `Audio`'s `position` set before its element exists is lost, while the attribute keeps
   the value.** `Audio [ source = "tone.wav", position = 2.5 ]`: `position` reads 2.5 and the
   element's `currentTime` is 0, so the clip plays from the start. A seek after the clip has
   loaded works (2.5 and 2.5). The cause: `$load` (media.ts) copies `muted`, `loop`, `volume` and
   `playbackRate` onto a new element, not `position`; and `$seek` returns while there is no
   element. The same loses a seek written in the settle that changes `source`, which is the
   agent's case: its `pendingSeek` (the App, `load`/`player.onChange`) works round a real fault.
   `Media.playing` honours an early `true`; `position` should match. **A platform bug, to fix.**
   (The first draft of this report said an early seek holds. That was untested, and wrong.)
2. **The Dialog `close` refusal misleads** (reproduced: `Dialog [ close: Button [ … ] ]`). It
   says "a use site configures a class through its attributes, not by redeclaring its children
   … ('text: string = \"\"' on the class, 'text = { classroot.text }' on 'close')": advice for
   a redeclared child. `close` is Dialog's method. The message should say which kind of member
   the name is, as the `viewAt` message does.
3. **An on-screen back button that adds a history entry.** The phone's back button closes a
   conversation with `location = ""`, a new entry, so the browser's Back then reopens the
   conversation just closed. Browser Back itself is the platform's (`location` for an address,
   `waypoint` for a step it retraces); this is how the app wrote its own button, not a gap.
4. **`provided()` reaches a declared attribute** — confirmed (`class Pane [ group: boolean = true,
   r: Row [ ] ]`, the row reads `provided("group")` as `true`). The agent was unsure; the entry
   for `provided` could say so in one line.
5. **R4's "not built at boot, so not checked here" list** kept the agent from claiming more
   than it had checked. Its wish, a boot into a state (`--location t1`) that is not driving,
   is the honest ceiling of a start check at this level.
6. **`names.py` counted no collision for `viewAt`**: its patterns miss the "member of the
   running App" message. Ours to fix.

## 5. Is it idiomatic Declare?

| | Murmur 18 | Murmur 19 |
|---|---|---|
| code | 924 lines Declare | 817 lines Declare |
| lines over 150 characters | 6 | 0 |
| colour literals outside theme declarations | 0 | 3 |
| theme reads | 76 | 72 |
| States | 2 | 1 |
| branches on width or phone | 36 | 8 |
| flexes | 10 | 11 |
| browser scripts · page lookups | 0 · 0 | 0 · 0 |

**Read line by line.** The shape is right, and in the grain the guide teaches:

- **Data:** `Conversations extends DataSource` holds the records and makes every write
  (`append`, `confirm`, `react`, `markSeen`). The socket's `onMessage` turns each frame into
  one of those calls. Schemas type the history; the list is a derived `Dataset` (`inbox`,
  `contents = { app.convos.summaries(app.typing) }`).
- **Place:** `location` is the open conversation; one `Pane` per thread, replicated and kept,
  so scroll places survive without saving them; `scrollAnchor = end`; `firstVisibleRow` for
  the day chip; `virtualize` with `classFor` over the message's kind.
- **Layout:** one `ResponsiveLayout` plan for phone and desk; `SimpleLayout` throughout; a
  `TweenLayout` (`Stack`) so rows glide when the order changes.
- **Overlays and controls:** `Popover` for the photo and reaction pickers, `Dialog
  [ presentation = "full" ]` for the viewer; its own controls extend `Control`; the scrubber
  carries the slider role's whole contract, `claim = x`, and key bindings.
- **Theme:** `theme Paper` laid over `SanFrancisco`; 72 theme reads; the three color literals
  are the photo viewer's black ground and its scrims.

Where it drifts:

1. **Four App attributes for one record** — `viewSrc`, `viewAlt`, `viewFrom`, `viewWhen`, set
   together by `viewPhoto` — where one `viewing: Message? = null` says it; the same with
   `reactThread` and `reactMsg`.
2. **A photo's shape through `onChange`.** `pic: Image [ trackChanges = ["naturalWidth", …],
   onChange() { app.noteAspect(…) } ]` writes an App map. A constraint on
   `frame.pic.naturalWidth` and `naturalHeight` gives the shape without a handler; the map
   does keep the shape when a virtualized row is rebuilt, which is a reason, but the code
   doesn't give it.
3. **The playhead runs on a clock of its own.** `head`, advanced by a frame `Time` and
   corrected from `player.position`, because `position` is reported about four times a second.
   A judgement call for a smooth scrubber; the guide teaches the 4 Hz bar.
4. **Dates by hand.** `DAYS`, `MONTHS` and `pad2` in a script, where `Intl.DateTimeFormat`
   (`globals`) writes them in the reader's locale.
5. **The socket's frames are untyped** (`hear(f: any)` over `JSON.parse`): a schema per frame
   kind would put the feed under the same checks as the history.
6. **Seven glyphs drawn by hand**, on the library's `Icon` grid; two of them (close, back as a
   chevron) ship as `CloseIcon` and `ChevronIcon`.

None of these broke a check; all are the kind a standard run's own checking does not catch
either.

## 6. The agent's account

Asked after the build by resuming the session read-only. The first request was refused by
the API's safeguard (`reasoning_extraction`, a false positive); the same prompt, resent
unchanged, was answered (6.7k output tokens). Its two corrections: the dev server it left running was most likely stopped by `finish.sh`, which ends
what a run leaves behind (unverified: the logs are gone). The files "changed on disk after I handed over":
the recording shows a format pass (`formatted: my-apps/murmur/murmur.declare`, 20:06:46, from
its own verify call) and three edits of its own just before the hand-over; whether anything
touched them after cannot be checked now that the logs are gone.

# Building Murmur in Declare: an account for the Declare team

Two corrections to my handover come first.

1. **The dev server is no longer running.** I said it was running at `http://127.0.0.1:8600/…`. After I handed over, the background `npm start` task ended with exit code 1. I tried to read its output to find out why, but shell access is now disabled in this session, so I don't know the cause. All I established was that the server printed its address and answered one request for the program with a 200. I never confirmed that it stayed up.
2. **Both `.declare` files changed on disk after I handed over.** I didn't make those changes and haven't read them, so everything below describes the source as I left it.

## (a) Getting up to speed

**Reading order:**
1. `README.md`, then `task/brief.md` and `task/api/API.md`.
2. `skill/SKILL.md` and `AGENTS.md`.
3. Everything the skill lists as essential, read whole: `docs/declare.md`, guide chapters `01-what-declare-is`, `04-structure`, `05-run-and-check` and `06-layout`, then `apps/todo/todo.declare` and `todo-parts.declare`.
4. Chapters read because the plan needed them:
   - `07-scrolling` and `16-collections`, whole.
   - `13-media`, whole.
   - `14-data`, lines 20–450 (cursors, writes, DataSource, Streams).
   - `18-overlays`, from "Dismissal" to "Your own overlay".
5. About 25 `npx declare-help` lookups, including Socket, Audio, Image, Media.position, Media.playing, ResponsiveLayout `--all`, Text.maxLines, TextInput.onEnter, Dialog.presentation, Popover, safeTop/safeBottom, Socket.send, Time.tick, Time.onTick, firstVisibleRow, scrollAnchor, Floating.present, keyboardHeight, claim, onHold, keyBindings, defaultPlacement, TweenLayout, "theme tokens" and Gradient.linear.
6. Part of `docs/operational/verify.md`, found by grepping for flags.

**What I skipped, and why.** I skipped guide chapters 02, 03, 08–12, 17, and 21–23, plus the tracker app, to save time. The skill invites this ("everything else is read when you reach the part that needs it"). I paid for it in small ways:
- I guessed the `Gradient.linear` signature.
- I didn't know `fontWeight` tokens become strings inside braces.
- I wrote a `State` that sets `x` on a child inside a layout without knowing whether that's legal. Chapter 21 or 06 might have told me.
- I never read `10-touch` before relying on `onHold`, plus `claim = x` on a drag, inside a scrolling pane. That's the riskiest gap.

**What taught me the most.** Three things:
- **The to-do app, read whole.** It showed the overall shape of an app: a data class extending DataSource, state on the App, `classFor`, `Glide extends TweenLayout`, `exists` versus `visible`, and themes laid over SanFrancisco.
- **`07-scrolling`'s "Following the end".** It handed me the core of a chat app: `scrollAnchor = end` plus a `newBelow` constraint.
- **`16-collections`, which named a chat's date chip as the example for `firstVisibleRow`.** It told me the chat use case had been thought about.

**What was missing or misleading:**
- **Whether a declared attribute counts as "provided".** `declare.md` §9 says "providing is setting a value on a node". `16-collections` shows `provided("rows")` read from a list that declares `rows`. My whole message grouping depends on `provided("rows")`, `provided("group")` and `provided("threadId")` finding attributes declared on `Pane`. It type-checked, but those rows never ran, so I'm unsure it works.
- **Reaching media and the service.** Nothing told me how a program should reach a service on another origin. I hard-coded `api: string = "http://localhost:8330/"` and built the socket URL with `api.replace("http", "ws")`.
- **Seeking a clip that hasn't loaded.** Nothing says whether assigning `position` before the metadata arrives is honoured. `Media.playing` says an early `true` is honoured; `Media.position` says nothing equivalent. So I built a pending-seek workaround (see (g)).

## (b) Expressing what I wanted

**Where it fit well:**
- **The data model.** A `Conversations extends DataSource` class holding every write (`append`, `confirm`, `react`, `markSeen`), with the socket's `onMessage` calling into it. That came out short and readable.
- **Message kinds as classes.** `classFor` over `:kind` mapped exactly onto text, photo and voice.
- **Phone versus desk.** `ResponsiveLayout`, with a plan that reads `app.openId`, gave both arrangements in seven lines.
- **The app's built-ins.** Virtualisation, scroll anchoring and `firstVisibleRow` meant I wrote no scrolling code. The usual hard parts of a chat (keeping the reader's place, following the bottom, rows of different heights) came from three attributes.
- **Overlays.** The photo picker is a `Popover`, the reaction picker another, and the viewer is a `Dialog` with `presentation = "full"`, which the overlays chapter offers as the photo-viewer pattern.

**Where I worked around it:**
- **A message's neighbours.** Reading the previous and next message happens through a provided array and `rowIndex`. That's the documented idiom, but every built row recomputes `prev` and `next` whenever the array changes.
- **Reaction tallies.** These are computed, and a `datapath` can't point at computed values, so every message row carries its own derived `Dataset` (`tallies`) just to replicate a few chips.
- **Photo shapes.** Learned with `trackChanges` on an `Image` plus a map on the App (see (g)).

## (c) The first time it ran

I never saw it running, by design: you asked me not to drive it, script it, screenshot it or open it in a browser. Its only "runs" were `declare-verify`'s boot rung (rung 4) and one `curl` to the dev server. So I have no account of what looked wrong. Everything I fixed was found by the compiler, by verify's boot, or by reading my own code.

## (d) Every refusal and surprise

1. **`viewAt`**
   - I wrote: `viewAt: string = ""` on the App.
   - The platform said: `'viewAt' is a member of the running App (the runtime's own) — a declared attribute cannot take its name; choose another [DECLARE2000]`.
   - I renamed it `viewWhen`.
   - Judgement: my mistake, caught well. One thing I'd add to the message: what `viewAt` actually is. I only knew it existed from the drift-check text.

2. **A child named `close` inside a `Dialog`**
   - I wrote: `close: RoundButton [ … ]`.
   - The platform said: `'close' is already a member of Dialog — a use site configures a class through its attributes, not by redeclaring its children…`.
   - I renamed it `shut`.
   - Judgement: my mistake. The suggested fix ("give Dialog an attribute") doesn't fit, though. The real collision is with the `close()` method, so the message misled me about the cause.

3. **The `slider` role**
   - I wrote: `accessibilityRole = slider` on `Scrubber extends Control`.
   - The platform said: `DECLARE2006 … Scrubber has no accessibilityValue and no accessibilityMin and no accessibilityMax and no accessibilityIncrement() and no accessibilityDecrement()`.
   - I added all five.
   - Judgement: a good refusal; it made the control accessible.

4. **`fontWeight` inside braces**
   - I wrote: `fontWeight = { classroot.unread > 0 ? bold : semibold }`.
   - The platform said: `'bold' is one of fontWeight's values — bare only as the whole value … inside { } write it as a string [DECLARE4005]`.
   - I changed them to `"bold"` and `"semibold"`.
   - Judgement: my mistake. `declare.md` §2 does say the bare vocabulary stops at the brace. The message was exact.

5. **`cornerRadius` from an array**
   - I wrote: `corners: number[] = { … [18, 6, 6, 18] … }`, used as `cornerRadius = { classroot.corners }`.
   - The platform said: `the { } body of 'cornerRadius' computes a number[], but 'cornerRadius' is typed Radius… [DECLARE6001]` (3 sites).
   - I typed the attribute as `corners: Radius`.
   - Judgement: the platform is correct, but this is a mild papercut. A `number[]` of length 4 is what the docs describe in words. Unsure whether it could be inferred.

6. **`Gradient.linear`**
   - I wrote: `Gradient.linear(90, [0x00000000, 0x000000AA])`.
   - The platform said: TypeScript 2345, `Argument of type 'Color[]' is not assignable to parameter of type 'Color | `${number}deg` | …'` (shown as hints under DECLARE6001).
   - I changed it to `Gradient.linear(0x00000000, 0x000000AA)`.
   - Judgement: I guessed the signature without looking it up. My fault.

7. **Warnings and hints**
   - `DECLARE4035`: Avatar had a label but no role; I added `accessibilityRole = image`.
   - `DECLARE4025`: `runEnd` decided on one condition of four parts; I split it into `joinsPrev`, `joinsNext` and `nextDay`. The code is clearer for it.
   - `DECLARE1002`: redundant parentheses around `({ … })` and `({})`; I removed them. The parentheses were habit from TypeScript object-literal bodies.

8. **Boot**
   - It was clean every time (313 nodes, and 307 after fixes).
   - The useful finding was the note `not built at boot, so not checked here: DayHead, ReactionChip, Scrubber, Msg, TextMsg, PhotoMsg, VoiceMsg, Murmuring`. That's honest, and it's the main limit on my confidence.

**Problems I caught myself before compiling.** None of these came from the platform:
- I'd left the reaction `Popover` with no picker inside.
- I put a pointless `State [ applied = …, Glyph [ ] ]` in VoiceMsg.
- A solid round button would have drawn a white glyph on a light fill.

## (e) Verifying it

**What I ran.** `npx declare-verify my-apps/murmur/murmur.declare` about six times, and once with `--phone --desktop`. Then `npm start` and one `curl` of the program URL, which returned 200 and contained no `DECLARE` codes.

**How well it served me.** Very well. The rungs reported the first real problem each time, every message named its fix, and each loop took seconds. The "not built at boot" note stopped me claiming more than boot showed.

**What it couldn't check, given your limits.** Anything after a conversation opens. One gap of my own: I didn't confirm that `threads.json` had loaded by the time boot was checked. The node count was the same at both sizes, so the splash screen may be all it saw. Unsure.

## (f) Confidence, part by part

**Medium-high:**
- The conversation list ordered by latest activity, re-sorting as messages arrive.
- Unread badges.
- Phone and desk layouts on the first screen.
- Loading text before the data arrives.

**Medium:**
- Opening a conversation and scrolling the whole history (virtualisation plus `scrollAnchor = end`).
- Day headings and runs.
- Sending text, shown immediately.
- Sending a photo.
- The full-size viewer.

**Low-medium:**
- Returning to the same place in a conversation. I rely on hidden panes keeping their `scrollY`, which I never checked.
- The "N new" jump button, and new messages arriving while scrolled back.
- Reactions (`onHold` and `onContextMenu` on `body`; the hover button's hand-placed `x`).
- The voice scrubber: `claim = x` inside a scroller, my pending-seek logic, and `trackChanges` on `Audio`.
- Photo shapes settling after load.

**Where a tester would most likely find problems:**
- The voice player.
- `provided()` lookups failing when a conversation opens.
- `markSeen` either firing too eagerly or never firing.
- The reaction button's position.
- On a phone, whether long-press works inside the scrolling list.
- Tapping a photo after a hold.

## (g) Gaps I worked around

1. **Photo dimensions**
   - What I wanted: an image's natural aspect before it is laid out.
   - What I did: `Image [ trackChanges = ["naturalWidth","naturalHeight","loaded","source"], onChange() { … app.noteAspect(this.source, w/h) } ]`, storing aspects in an App map. A 4:3 placeholder shows until the shape is known.
   - Judgement: probably a real gap in the platform, unless an unsized `Image` inside a width-capped box would have done it and I didn't think of it. Unsure.

2. **Seeking a clip before it loads**
   - What I did: `pendingSeek`, applied in the `Audio`'s `onChange` once `duration` becomes nonzero.
   - Judgement: the platform may already handle this. I didn't find it.

3. **One-to-one versus group, and the thread id**
   - What I did: declared attributes on `Pane`, read with `provided()`.
   - Judgement: this is the documented idiom, not really a gap.

4. **A "new messages" divider at the unread boundary**
   - Not built. I dropped it for scope, not because the platform blocked it.

5. **Back on a phone**
   - What I did: the back button sets `location = ""`, which adds a history entry instead of going back.
   - Judgement: I didn't look for a "go back" verb. It may exist.

## (h) Changes of direction

There was only one real change, made in planning, before I'd written code. I considered a single conversation view whose scroll position is saved for each thread. I chose instead one replicated `Pane` per thread, hidden with `visible`, so scroll position survives switching. That was my own call, prompted by the drift check's warning against "a scroll position saved and restored".

After compiling, every change was a fix or a rename as listed in (d). Three small changes came from reviewing code I couldn't run:
- I replaced `State [ applied = …, x = 12 ]` on a child inside a layout with padding, because I feared a second decider for its position.
- I dropped the width and height overrides on `ThreadFace` in favour of `scale`.
- I removed `selectable = true` from message text so it wouldn't fight long-press.

None of these was prompted by the platform.

## (i) Code and messages, quoted

| What I wrote | What the platform said |
|---|---|
| `viewAt: string = "",` | `'viewAt' is a member of the running App (the runtime's own) — a declared attribute cannot take its name; choose another [DECLARE2000] (line 635, col 5)` |
| `viewer: Dialog [ presentation = "full", … close: RoundButton [ ignoreLayout = true, … ] ]` | `'close' is already a member of Dialog — a use site configures a class through its attributes, not by redeclaring its children. Give Dialog an attribute and read it in the child … [DECLARE2000] (line 807, col 9)` |
| `class Scrubber extends Control [ … accessibilityRole = slider, accessibilityLabel = "Position", … ]` | `… Scrubber has no accessibilityValue and no accessibilityMin and no accessibilityMax and no accessibilityIncrement() and no accessibilityDecrement() … [DECLARE2006] (murmur-parts.declare:255:25)` |
| `Text [ flexes = true, maxLines = 1, fontSize = 16, fontWeight = { classroot.unread > 0 ? bold : semibold }, … ]` | `'bold' is one of fontWeight's values — bare only as the whole value (fontWeight = bold); inside { } write it as a string: "bold" [DECLARE4005] (line 187, col 55)` |
| `corners: number[] = { classroot.mine ? [18, classroot.runStart ? 18 : 6, classroot.runEnd ? 18 : 6, 18] : […] },` used by `cornerRadius = { classroot.corners }` | `the { } body of 'cornerRadius' computes a number[], but 'cornerRadius' is typed Radius … — 3 sites, also on lines 313, 334 [DECLARE6001] (line 294, col 61)` |
| `fill = { Gradient.linear(90, [0x00000000, 0x000000AA]) }` | `Argument of type 'Color[]' is not assignable to parameter of type 'Color \| `${number}deg` \| { offset: number \| null; color: Color; }'. [DECLARE6001] (line 807, col 42)` (TypeScript 2345) |
| `runEnd: boolean = { classroot.next == null \|\| classroot.next.from != classroot.from \|\| dayKey(…) != dayKey(…) \|\| minutesBetween(…) > 8 }` | `runEnd decides on one condition of 4 parts … [DECLARE4025] (line 233, col 23)` |

I never went round in a circle. Each fix held on the next run.

## Overall

**Surprises.** The compiler caught the slider's missing accessibility contract and the clash with `App.viewAt`, which I'd never have guessed. And the docs had already thought about the chat case (the date chip, "following the end").

**What was good.**
- The error messages.
- Readable docs that state rules ("one decider for each value").
- Virtualisation and scroll anchoring being one word each.
- Type-checking that knows the data's shape through `schema`.

**What was bad.**
- I couldn't check anything past the first screen without driving the app.
- Small, scattered gaps in the docs about how media loading works and what provided values reach.

**How it differs from what I know, and what it reminded me of.** It felt like QML or OpenLaszlo crossed with SwiftUI-style state, and nothing like React. Children come from data rather than loops. Constraints instead of effects took the least effort to adopt. Picking names that don't collide with reserved members (`viewAt`, `close`) cost the most guessing, but that was a pattern of small, cheap obstacles, not one big one.

**The sharpest edge.** Not knowing which runtime behaviours hold for code that never ran: provided lookups, panes that are hidden but kept, media timing. To write it right the first time I'd need a short reference saying what `provided()` resolves to, and what `Media` honours before its metadata loads.

**Where I'd most want improvement.** A way to boot a program into a given state without counting as driving it. For example, `declare-verify --location t1`, so that rows built only after data arrives get checked at rung 4.

**What I'd use it for.** Data-heavy, mostly read-only apps with long lists: inboxes, logs, dashboards, trackers. The list, scrolling and data model clearly pay off there.
## 7. The names ledger

```
NAMES — eval-murmur-19: 0 missed name(s), 0 collision(s), 2 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)

DECLARE-HELP MISSES (min · asked for · answered)
     2 · ellipsis · Text has no member 'ellipsis' and nothing near it — the member table: declare-help Text
     2 · ellipsis · 'ellipsis' is not a Declare name — the Declare concept is Text.maxLines:

SUMMARY: 0 of 0 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
