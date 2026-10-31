# Murmur run 12: Declare 585c768d, Opus 5.5

**Run:** 2026-10-30, launched with
`evals/craft/launch.sh murmur ~/Code/eval-murmur-12 claude-opus-5-5 585c768d`. React Venue run 2 was building
alongside it. It is the first Murmur run since run 11, with the verify, `npx` and kernel fixes of the last week in.

**Files beside this report:** the app's two files and its five assert scripts (`tests/`). Its account is at the end of this report, word for word.

## Figures

| | Murmur 11 | **Murmur 12** | React Murmur 2 |
|---|---|---|---|
| time | 20.9 min | **18.2 min** | 17.6 min |
| turns · tool calls | 108 · 107 | **102 · 101** | |
| first app write at | 7.5 min | **5.6 min** | |
| model · tool time | | **14.4 · 3.8 min** | |
| thinking (reading · writing · checking) | | **3.4 · 1.5 · 1.8 = 6.6 min** | |
| verify calls · their time | | **20 · 2.4 min** | |
| `declare-look` calls · their time | | **18 · 1.0 min** | |
| `declare-help` calls · their time | | **7 · 0.2 min** | |
| output tokens · cached input re-read | | **90.4k · 19.9M** | |
| correctness | its five scripts pass from main | **its five scripts pass from main** | |

Its own five assert scripts were run from main: `desk`, `history`, `live-phone`, `phone-touch` and `voice`.
All pass at R5.

The fastest Murmur in Declare so far, 0.6 min behind React's. Tool time is now a fifth of the run.

## What the agent said

Its account answers the new questions (`impressions.txt`, from `account-declare.txt`) and is below, word for word.

## The agent's account, verbatim

# Building Murmur in Declare: an account for the Declare team

I haven't changed anything for this. It's written from memory of the session, and I mark the places where I'm unsure.

---

## (a) Getting up to speed

**What I read, in order**

1. `README.md`, then `task/brief.md` and `task/api/API.md`.
2. `skill/SKILL.md` in full.
3. `docs/declare.md` in full, about 940 lines.
4. Guide chapters `01-what-declare-is`, `04-structure` and `05-run-and-check`, in full.
5. `apps/todo/todo.declare` and `todo-parts.declare`, whole.
6. A small prototype (below). After that I read only what the plan needed:
   - `07-scrolling` and `16-collections`, in full;
   - `13-media`;
   - the "Where data comes from", "Streams" and "Data in a whole app" sections of `14-data`;
   - most of `18-overlays`;
   - the gesture-claims section of `10-touch`;
   - the View-or-Control, frame, custom-drawing and writing-a-layout sections of `17-your-own-views`;
   - `06-layout` in full;
   - the opening of `12-text`;
   - `15-schemas`.
7. Later, when I needed them: the source of `library/slider.declare`, `docs/briefs/scrolling.md`, the Socket demo, the `verify.md` sections on assert scripts and time, and the introspection table.
8. Throughout, `npx declare-help` for Socket, Stream, Dialog, Image, Audio, Media, Time, `firstVisibleRow`, `scrollAnchor`, App, TextInput, Popover, TweenLayout, Icon, `defaultPlacement`, ChangeEvent, `Layout.laid`, `Text.maxLines`, `Popover.placement`, `afterDelay` and SanFrancisco.

**What I skipped**

- Motion (21), time (22), animated arrangements (23), pointer and keyboard (09), controls (08), themes (11), URLs (20) and accessibility (19).
- All but one of the `docs/briefs/` files.
- The calendar and tracker apps.

I skipped them because the to-do app already showed the patterns I needed: springs, `Time`, themes, `location` links, `Control` with `press()`. The SKILL file also tells you to stop reading and look things up as needed, which I found good advice. Skipping 08 and 09 probably cost me the scrubber bug described in (d).

**What taught me the most**

- **The to-do app** taught the most about the shape of a program. It shows a dataset class that makes every write, state on the App, a derived dataset, `classFor`, `trackChanges`/`onChange` with `retarget`, `Popover`/`Sheet` bound to state, and `link` driving `location`. I copied its structure directly.
- **`07-scrolling`** was the most valuable for this app in particular. Its table under "Keeping the reader's place" and the "Following the end" section describe exactly the behaviour a chat needs, and `scrollAnchor = end` turned three of the brief's hardest requirements into one attribute.
- **`16-collections`** mentions "a chat's date chip" in the `firstVisibleRow` entry. It felt as if someone had anticipated this brief.
- **The "What Declare handles for you" table and the drift check in SKILL.md** kept me from building things by hand. I kept rereading them.

**What was missing or misleading**

- **Layout boxes vs TweenLayout boxes.** `17-your-own-views` § Writing a layout says a box "names only the attributes the layout owns" and may name a subset. `TweenLayout` silently needs all five fields (`x`, `y`, `w`, `h`, `vis`). The guide sends you to TweenLayout from that same section without mentioning this. Only the reference entry says it.
- **Datapath types.** `datapath` is typed `DataCursor | object | null`, which suggested a plain object literal would work. It is refused at structure time (DECLARE3006). The message is good; the type is what misled me.
- **The test clock.** That `declare-look --wait` and the page's timers run on a virtual clock is in `operational/verify.md`, but not in the SKILL's "Checking and looking" section. For an app built around a live socket, that is the first thing you hit.
- **Addressing rows in a virtualized list.** `verify.md` says "a replicated row by its index (`app.list.3`)". I took that as the record's index. In a virtualized list it is the index among the rows currently built. Nothing I read said so.

---

## (b) Expressing what I wanted

**Where Declare fit my intent**

- **Data model.** "Records in a dataset class, the user's place on the App, views derived from both" mapped directly onto the brief. `Chats extends DataSource` holds the history, the `Socket` and every write. The inbox is a derived `Dataset` sorted by latest activity. Requirements G2 (the list stays ordered as messages arrive) and G6 (sent messages appear immediately) cost almost nothing beyond writing the methods.
- **Scrolling.** `virtualize = true` plus `scrollAnchor = end` gave me:
  - the 30,500-message thread;
  - "the words stay put while you read back";
  - "a reaction that grows a message doesn't disturb";
  - "a photo that loads above you doesn't jump";
  - opening at the newest message.

  I wrote no scroll code apart from `scrollTo(Infinity)` after a send.
- **Remembering your place.** Keeping each conversation pane built and switching it with `visible` gave "return to where you were" for free, along with the draft text. The guide's line in `04-structure` — "`visible` for one that should come back as it was" — told me directly that this was the intended approach.
- **Row kinds and gaps between messages.** `classFor` over TextRow, PhotoRow and VoiceRow on a base frame with `defaultPlacement = slot` was clean. So was the "what sits between records belongs to the row after it" idiom from `16-collections`: day headings, pause times, the "New" rule and speaker names all read the neighbouring record through `provided("msgs")[rowIndex ± 1]`.
- **Media.** One `Audio` with `playing = { app.voiceOn }`, and each voice row comparing its own id with `app.voiceId`, is exactly the pattern `13-media` describes. It worked.
- **Overlays and the list's rows.**
  - Popovers bound to state, and `Dialog presentation = "full"` for the full-size photo, needed no hand-built overlay.
  - Making each inbox row a `link` gave the URL and Back for nothing.

**Where I had to work around the language**

- **Literal row data needs a `Dataset`.** Small per-row lists (a row's tally of reactions, the three typing dots, five placeholder rows) each needed a `Dataset` member. The reaction tally became a derived `Dataset` per message row. That is legal and the error said so, but a dataset per row so I could replicate two chips felt heavy. I didn't profile it.
- **Seeking a clip that hasn't loaded.** Assigning `position` right after changing `source` is lost, and `loaded` doesn't go false when the source changes. I ended up with `pendingSeek` plus `trackChanges = ["loaded", "duration"]` on the `Audio`. That is a workaround keyed on the duration changing, and two clips of identical length would defeat it.
- **TweenLayout and width.** TweenLayout doesn't re-place when its container's width changes. I had to add `trackChanges = ["width"]` with `retarget(false)`, copied from the to-do app.
- **The scrubber's click.** `Control` routes a click to `press()`. To have a click seek while Space plays and pauses, I overrode `onClick() { }` as a no-op and did the seeking in `onPointerUp`. It works, but an empty handler whose only purpose is to stop the click reaching `press()` is something to be wary of.
- **Hand-placed views.** The small-conversation spacer is height arithmetic over siblings (`pane.height − intro − list − typing`). The drift check calls this "a tell". I found no layout way to bottom-align short content inside a scroller. Unsure whether I missed one.
- **"Unread follows the reader."** This became an `onChange` over `["current", "atEnd", "lastId", "scrolling"]` with imperative branches inside. I think that is the legitimate "one action when something changes" case, but it is the most framework-shaped code in the app, and the date-chip fade in the same handler (an `afterDelay` with a generation counter) is shakier still.

---

## (c) The first time it ran

**The prototype.** Before writing the app, I wrote a 20-line prototype: the 5.5 MB history, a schema, thread t4 virtualized with `scrollAnchor = end`. It showed the right messages, opened at the bottom, and `firstVisibleRow` read 30468. That de-risked the core in one step.

**The first full run** (a 1440 screenshot with t1 opened) had these problems:

1. **The conversation list was empty.** Found by reading values with `declare-look --read`:
   - the inbox dataset had 6 rows;
   - `childViews.length` was 6;
   - `rows.height` was 102;
   - the first child's height read null.

   That pointed at the layout. The TweenLayout reference then told me boxes must be whole.
2. **A console error, repeated once per row.** `IconButton.y … SimpleLayout places its children` showed up only because I passed `--console` to `declare-look`. It came from a hover button I had given `y = center` inside a row laid out by `SimpleLayout`.
3. **Inbox rows 304 wide in a 364 column.** I saw this in the screenshot and confirmed it with `--read`. Fixed with the `retarget` trick.
4. **No reply after sending.** In the phone run, the sent message showed "Delivered" but the scheduled reply never came. `--read app.chats.feed.last` showed the last frame was still `sent`. I proved the server was fine with a Node WebSocket script, then found `drive.waitReal` in `verify.md` via a grep for "real time".
5. **The voice message wouldn't stay playing.** The desk check script failed with `voiceOn = false`, and the screenshot showed the pause icon. I first misread this as headless audio not playing. Reading `player.position` from a probe script showed audio played fine, which left the click → `press()` routing.
6. **Seeking an unloaded clip played from 0.** Found by logging state every 150 ms in a probe script.

---

## (d) Every refusal and surprise

| # | What I wrote | What the platform said or did | What I changed | My judgement now |
|---|---|---|---|---|
| 1 | `datapath = { app.chats.value?.threads[3] }` in the prototype | DECLARE6001: `Thread \| undefined` not assignable to `object \| DataCursor \| null` | Added `?? null` | My code. A clear message. |
| 2 | `class PhotoGrid [ width = { app.wide ? 340 : 100% } ]` | DECLARE2000: "there are no percentages: … 100% is { parent.width * 1 }" | `app.width - 48` | My code. `declare.md` §2 says exactly this. A good diagnostic. |
| 3 | `fontWeight = { fresh ? semibold : medium }` (and `regular`) | DECLARE4005: bare only as the whole value; inside `{ }` write `"semibold"` | Quoted the tokens | My code. The "vocabulary stops at the brace" rule, which I knew for colours and forgot for enum tokens. A perfect message. |
| 4 | `set([...])` and `me` used bare inside an arrow function in a `forEach` in `Chats.confirm` | DECLARE4001: cannot resolve `set` — not a member of Chats | `this.set`, `this.me`, `this.feed` | Unsure. Bare `feed.send(...)` and `append(...)` resolved fine elsewhere in method bodies. My guess is that `set` is a runtime method of Dataset rather than a declared member, so bare-name lookup doesn't find it. If so, the docs could say which names bare lookup reaches. |
| 5 | `GhostRow`'s inner views reading `rowIndex` | DECLARE4023 warning: that is the inner view's own `rowIndex`, use `classroot.rowIndex` | Did so | A real bug of mine, caught before it ran. Excellent. |
| 6 | `endsRun` and `firstNew` as four-part boolean expressions | DECLARE4025 warning: name the facts | Wrote the methods `joins(other)` and `follows(other, id)` | Style advice. Taking it made the code better. |
| 7 | An `IconButton` (close) inside a full-window `Control` in the Lightbox | DECLARE4020: a button inside a button; VoiceOver won't reach the inner one | A plain View holding a backdrop Control plus siblings | A genuine accessibility catch I wouldn't have made myself. |
| 8 | The outer parentheses in `{ ({ rows: … }) }` | DECLARE1002 hint: redundant parentheses | Removed them | The to-do app's habit of writing `({ … })` in methods led me here. Harmless. |
| 9 | A child named `backdrop: Control` | DECLARE2000: `View.backdrop` is an attribute; a child may not take its name | Renamed it `dismiss` | A surprise but fair. A list of reserved attribute names isn't something you hold in your head, and the compiler caught it immediately. |
| 10 | `datapath = { { rows: [...] } }` and `datapath = { ({ rows: classroot.marks }) }` | DECLARE3006 (3 sites): a literal is in no declared data; declare a Dataset | Added three Datasets, one of them derived per row | The message is excellent. The attribute's type (`object` allowed) misled me. Platform/docs mismatch. |
| 11 | `this.msgs.findLast(...)` and `t.messages.findLastIndex(...)` | DECLARE6001 / TS2550: change your lib to es2023 | Wrote the loops by hand | The platform's TypeScript lib is older than what browsers support. I couldn't change it, and the advice "change your lib" can't be acted on from a program. Platform, minor. |
| 12 | `classroot.slot` where `slot` is nested inside `line` (with `defaultPlacement = slot`) | DECLARE6001: not a member — a child's is `line.slot` | `classroot.line.slot` | Fine. `defaultPlacement` accepts any depth, which made me assume the name was reachable at the top as well. A clear message. |
| 13 | `corners: number[]` passed to `cornerRadius` | DECLARE6001: Radius is four numbers or one | Declared it as the tuple `[number, number, number, number]` | Fine. The message named the shape. |
| 14 | `y = center` on an IconButton laid out by `SimpleLayout` (it only appears in rows built after data arrives) | **A runtime `console.error` per row**, not a compile error. `declare-verify` R4 was green. I only saw it because I passed `--console`. | Removed the `y` | The platform looks inconsistent. `06-layout` says "Declaring it anyway is a compile error at that line." My guess is the check can only fire once the row exists. If so, the docs overstate it, and it ought to fail an R5 run rather than only log to the console. |
| 15 | TweenLayout `place()` returning `{ x, y, w }` | The inbox rendered empty: no error, children without height or visibility | Returned `{ x, y, w, h: c.height, vis: true }` | Docs unclear (see (a)). A silent failure. The **most expensive single item**: about 4 tool calls. A runtime warning for a box missing `h` or `vis` would have saved it. |
| 16 | A TweenLayout in a column whose width settles after boot | Rows kept their first width (304 instead of 364) | `trackChanges = ["width"]` with `retarget(false)` | The to-do app does exactly this with a comment, so it's documented by example. It still looks like a platform wart: a plain Layout re-runs `place()` on what it reads, and a TweenLayout seems not to re-place when the room it reads changes. Unsure. |
| 17 | `--click 'app.inbox.body.rows.childViews.1'` | "no node at …" | Named the row by its text: `app.inbox."Trail crew"` | My guess at path syntax. Naming by text is nice. |
| 18 | `row = "app.stage.threads.0.pane.col.list.4296"` (a record index) | "no node" | Wrote a `rowOf` helper using `__declare.find(...).childViews.findIndex(v => v.msgId == id)` | Docs unclear. Also odd: reading `childViews.0.rowIndex` through `declare-look --read` gave −1, while the same rows' constraints clearly see real `rowIndex` values, since grouping and day headings rendered correctly. Unsure whether that −1 is a bug or the read happening outside the row's context. |
| 19 | `declare-look … --wait 4000` to receive the service's scheduled frames | Nothing arrived. `--js` with a real `setTimeout` was refused: "2 timers are waiting on the app's clock, which moves only with --wait" | Assert scripts with `drive.waitReal(ms)` | Working as designed, and the refusal message was what got me to the answer. Cost about 5 calls. It belongs in SKILL.md's checking section for anything with a socket or a server schedule. |
| 20 | `__declare.evaluate("expr")` with a single argument | An internal crash: "Cannot read properties of undefined (reading 'trim')" | Used `__declare.find(path)` and plain JavaScript | My misuse — the signature is `evaluate(path, src)`. But the response was a stack trace, not a message, which is unlike everything else here. |
| 21 | `Scrubber extends Control` with `press()` toggling play, and seeking in `onPointerUp` | A click seeked and then also toggled play, so it paused. The check script failed on `voiceOn = false`. | `onClick() { }` override | My code. `17-your-own-views` says a click lands in `press()`. I knew that, but didn't connect it, having skipped `08-controls`. |
| 22 | `seekVoice`: change `voiceSrc`, then assign `player.position` | The position was dropped and the new clip played from 0. `player.loaded` stayed `true` across the source change. `trackChanges = ["loaded"]` never fired. | `pendingSeek`, applied when `duration` changes | I think the platform is wrong or under-specified. `13-media` promises a `playing = true` set before load is honoured, and says nothing about `position`. `loaded` not resetting on a new source looks like a bug. Fairly confident. Cost about 4 probe runs. |
| 23 | MarkChip at 26 tall; the send button scaled to 0.6 when disabled | Layout findings: controls smaller than 44 × 44 (45×26, 19×19, later 33×44) | Touch-height controls with inner pills, and a 44-wide minimum on touch | Good findings. The 19×19 was an invisible disabled button, so arguably a false positive, but restructuring improved it anyway. |
| 24 | The note "never built … so never checked for layout: GhostRow" | Shown on every run | Nothing — the loading state lasts too short to reach | Honest. Note that my loading state was therefore never seen or checked. |

---

## (e) Verifying it

**`declare-verify` (R1–R4) after every edit.** It took about 1.5 s per run. Between them, the first four checks (structure, name resolution, typechecking, boot) caught items 1–13 above, each with a usable fix. It is the best compiler-in-a-loop I've used for UI code.

**`declare-look` with `--read`, `--set`, `--shot` and `--console`.**
- Screenshots found the empty list, the narrow rows and the layout problems.
- `--read` found the TweenLayout cause.
- `--console` found item 14.

Its weakness: its waits run on the virtual clock, so it can't see a live service.

**Assert scripts, with `drive.waitReal`.** Five live in `checks/`:

- `live-phone.mjs`: send text, the reply arrives, the inbox reorders, an unbidden message from the server lands.
- `desk.mjs`: a reaction via the hover button, the full-size photo and Esc, voice play and scrub, sending a photo.
- `history.mjs`: drag the real scroll thumb to the 2020 first message; return to the same `scrollY`.
- `phone-touch.mjs`: hold to react, the typing indicator, open and dismiss a photo by finger.
- `voice.mjs`: seek within a clip, and across to a clip not yet loaded.

They caught the scrubber click (#21) and the cross-clip seek (#22). They also gave me screenshots at real states, which is where most of the judgement happened.

**A Node WebSocket probe.** To separate "the service is quiet" from "the app isn't hearing it". Necessary once, and it wouldn't have been needed if I'd known about the virtual clock.

**What I did not do:**
- No `declare-profile`.
- No `--states` visual baselines.
- No screen-reader output (`--semantics`).
- No keyboard-only pass.
- I didn't look at:
  - the photo picker as a phone sheet;
  - the full-size photo on a phone (shot taken, not viewed);
  - the desktop photo picker (shot taken, not viewed);
  - a window crossing the 760 px breakpoint while a conversation is open.

**How well the tools served me.** Very well, overall. The best parts:
- every diagnostic names its fix;
- `expect.text` against view paths;
- `page.mouse` on real scrollbars;
- driver errors that explain themselves ("--js is still waiting … timers on the app's clock").

The rough parts:
- addressing virtualized rows;
- the `evaluate` crash;
- runtime layout errors that don't fail any check.

---

## (f) Confidence, part by part

**High confidence** (seen and checked):
- the conversation list ordered by activity, with live reordering and unread badges;
- sending text, shown immediately and later confirmed;
- reading the longest conversation back to its first message by scroll thumb, and returning to the same position;
- reactions by hover button (desk) and by hold (touch);
- the full-size photo opened and dismissed;
- dates and day headings, and runs from one speaker grouped;
- photos keeping their shape in the conversation (seen in screenshots; I didn't check the extreme 3:1 and 9:16 cases specifically);
- dark mode on the phone.

**Medium confidence:**
- **Sending a photo.** Checked on desk only.
- **Voice.** Checked by probes and one screenshot. I didn't hear it, and the smooth playhead under real time is unchecked.
- **"Something new is below".** The jump button appeared in screenshots, but I didn't script a message arriving while scrolled back to watch the words stay put. I rely on `scrollAnchor` doing what `07-scrolling` says.
- **"A reaction that makes a message larger does not disturb what is being read".** Same: relied on, not shown.

**Where I'd expect a tester to find problems:**
1. **A real phone's keyboard.** I never read `app.keyboardHeight`, so the composer may sit under the keyboard.
2. **The composer is single-line.** Long drafts don't wrap.
3. **There is no edge-swipe back on the phone.** Only the back button and the browser's Back.
4. **The floating date label** can stay up after switching conversations mid-scroll. I saw this but didn't confirm it under real time.
5. **"Delivered" under old history messages** is wrong in spirit. The history doesn't say who has read them.
6. **Opening a conversation with many unread messages** jumps to the bottom and marks them all read. The "New" rule is then off-screen above. Arguably that's the wrong opening position for this case.
7. **Crossing the 760 px breakpoint** with a conversation open and the slide spring partway through is untested.
8. **Performance.** Every built row reads the whole `msgs` array through `provided`, and the inbox re-summarizes all six threads on every frame from the server. It's fine at this scale in my runs, but not profiled.

---

## Surprises

- **How little scroll code the hardest requirements took.** G4 (return to where you were), G5 (new messages while reading back) and the "a reaction doesn't disturb reading" requirement took essentially none.
- **The virtual clock in the tools**, and how good the refusal message about it was.
- **`loaded` not resetting on a new `source`.**
- **A layout rule enforced only at runtime**, though the docs call it a compile error.
- **That `datapath` rejects literals** despite its type.

## Good

- The diagnostics. Nearly every refusal named the rewrite, and applying exactly that was always right.
- The to-do app as a reference program.
- `scrollAnchor`, `virtualize` and `firstVisibleRow`.
- State as attributes, and overlays bound to state.
- Assert scripts that address views by path or by text.
- The SKILL file's reading discipline and its drift check.

## Bad

- Silent failures in the less-trodden parts: a TweenLayout box without `h`, a seek dropped while a clip loads.
- Small gaps in the docs where a guide chapter states a general rule and an exception lives only in the reference.
- Addressing virtualized rows in tests.
- An older TypeScript lib, so no `findLast` or `findLastIndex`.
- Dataset ceremony for tiny literal lists.

## How it compares

It reminded me most of **QML** (bindings, states, declared children, `id`-like names) and of **OpenLaszlo**, given the stated lineage. The dependency tracking feels like MobX or Knockout, but extracted at compile time, and refusing what it can't follow instead of falling back silently.

Compared with React, the conceptual weight is in different places. There's no render or reconcile model to reason about. Instead you think about which attribute owns a value, set versus declared, and when a settle closes.

Compared with SwiftUI, there's less magic around layout and more explicitness, with better errors.

## What I'd most like improved

1. **Fail loudly instead of silently in layouts and media.** A warning for a TweenLayout box missing fields. A defined behaviour, or an error, for `position` assigned before a clip loads, and a `loaded` that resets on a new source.

   This is a **pattern**, not one obstacle: three of my most expensive bugs (#15, #16, #22) were silent. Together they cost roughly 12–15 tool calls of the build. To write it right the first time, I'd have needed the TweenLayout box requirement in `17-your-own-views` and the media lifecycle spelled out in `13-media`.

2. **Make the virtual clock part of SKILL.md's checking section.** Say "use `drive.waitReal` for socket or server schedules" right where it tells you to use `declare-look`.
3. **Document, and ideally support, addressing virtualized rows by record**, for example by key, in drive paths.
4. **Turn runtime layout-rule errors into R5 failures**, or move the check to compile time as the docs promise.

## What I'd use it for

I'd use Declare for exactly this sort of app: data-heavy, interactive, list-centred interfaces that need to feel finished. Chat, mail, trackers, dashboards, where long lists, keeping the reader's place, and state-driven overlays are the hard parts. In those areas it removes the parts I most often get wrong in React.

I'd hesitate for anything leaning heavily on third-party web libraries. I'd also hesitate where the team needs a large community and a long record of answered questions, which by its own account it doesn't have yet.
