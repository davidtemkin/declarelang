# Murmur run 15: Opus 5.5, Declare, at 0c5a2bc0

**33.9 min, 141 turns.** Delivered, and the agent's own 9 assertions pass, but the slowest
Murmur run since the format settled: its best is 18.2 (run 12), and runs 13 and 14 took 20.5
and 21.2. Murmur has no hidden acceptance.

## Figures

| | Run 13 | Run 14 | **Run 15** | React 1 |
|---|---|---|---|---|
| time | 20.5 min | 21.2 min | **33.9 min** | 18.1 min |
| turns | 96 | 112 | **141** | 76 |
| lines of code | — | — | **1,322 all · 1,120 non-blank · 964 without comments** | 3,612 (TS and CSS in `src/`) |
| output tokens (thinking) | 88.3k (36.8k) | 93.5k (37.6k) | **113.4k (45.3k)** | |
| phases: reading · writing · checking | 5.7 · 5.2 · 9.6 | 6.5 · 3.0 · 11.7 | **4.3 · 4.5 · 25.2** | |
| tool · model time | 5.8 · 14.7 | 5.6 · 15.6 | **14.5 · 19.4** | |
| `declare-look` calls | | | **41, 12.4 min** (median 8.7 s; many wait real seconds for live arrivals) | |
| lines removed after the first write | | | **171** | |

### Where the time went

| What | Minutes |
|---|---|
| Reading | 4.3 |
| Writing the first draft | 4.5 |
| First boot: a constraint cycle (`align = end` in a column sized by its children), `lineHeight` read as pixels, badges that didn't clear | 4.0 |
| Long history, phone, live arrivals, sending | 2.2 |
| Voice: thinning the waveform, then **the scrubber hang** (about 3 min), then seeking before load | 6.1 |
| Viewer, pickers, reactions, phone sheets, dark mode | 2.7 |
| **The wrong highlight after a reorder** (rows re-pointed at other conversations keeping stale titles) | 6.9 |
| Recycled-row spot check, the composer, the R5 flow script, the design statement | 2.7 |

Two episodes took about 10 min, and live-arrival waits inside `declare-look` most of the extra
tool time.

## The audit

The compiler's refusals were all of the agent's code, by its own reading and mine: a
Spacer'd row in its own `Stack` layout, a Spring on a constrained opacity, bare weight words in
`{ }`, `rowIndex` inside an `exists` child (DECLARE4023, which it praised), the accessibility
warnings, a datapath at a literal, a child named like an attribute. Four things are not:

| What | Verdict |
|---|---|
| **The scrubber hang.** A press on its `Scrubber extends Control` (with `claim = x`, a slider role and a `draw`) stopped the page for 15 s; it went away when `super.onPointerDown()` was removed, so pressing the scrubber no longer takes focus. | **Unconfirmed platform defect.** I reproduced the hang once on the pre-fix program (`repro/murmur-before-fix.declare.txt` (kept verbatim, so not as `.declare`), with the agent's command: open t2, scroll up 900, Play, read `app.head`, then click-at the waveform). Repeating it, and every variant (focus alone, `super` without the scrub, no Play), did not hang: it is timing-dependent. A plain virtualized list of such controls does not hang. Not isolated. |
| **Stale titles after a reorder.** A recycled list row given another conversation kept `app.murmur.titleIn(classroot.tid)` while its plain comparisons re-ran; only after wheel scrolling. | **Unconfirmed.** A minimal replicated list, and a virtualized one scrolled by wheel then reordered, both update correctly. Something particular to its DataSource methods; not reproduced. |
| The cycle report named the view, not `align`. | Real gap in the message: it cost three runs. |
| `Text.lineHeight` in `declare-help Text` shows no unit; the agent read it as pixels. | Reference gap (the RichText entry says "multiplier"). |
| A `TweenLayout` subclass returning a box with no `h` gave an undefined height. | Inconsistent with guide 17's "a box names only what the layout decides". To check. |

## Is it idiomatic Declare?

`idiom.py`: 964 lines without comments (to-do 843), 2 colour literals outside a theme (1),
77 theme reads (69), 1 `State` (7), 1 visible switch, 10 width branches (38), 12 `flexes` (7),
no browser scripts. Virtualized panes with `scrollAnchor = end`, one built pane per
conversation shown or hidden (position memory for free), the socket writing into the
DataSource, a Popover that becomes a sheet on a phone. Its workarounds: a `Dataset` per row
for reaction chips (replication over a computed array), methods rewritten to take field
values after the stale-title episode, a pending seek of its own.

## Findings for the platform

1. **Hang on a pressed `Control` in a virtualized pane** (above), unconfirmed, with a program
   that showed it once. Worth a deterministic repro before anything else.
2. **Stale method-call constraints after re-pointing a recycled row** (above), unconfirmed.
   If real, a correctness bug of the first order.
3. **Cycle messages should name the attribute** that closes the loop (`align = end`).
4. **`Text.lineHeight` needs its unit in the short reference.**
5. **Live-service waits in `declare-look`**: 41 calls, 12.4 min, many waiting 26–60 s of real
   time for an arrival. The tools could offer a way to make the service's next message come now.

## Its account, word for word

# Building Murmur in Declare: an account for the Declare team

Nothing was changed for this. The dev server on 8201 has since stopped: it hit its 2-hour background limit (exit 143).

## (a) Getting up to speed

**What I read, in order.**
1. `README.md`, then `skill/SKILL.md` and `AGENTS.md`.
2. `docs/declare.md`, in full.
3. Guide chapters 01, 04, 05 and 06, in full.
4. `apps/todo/todo.declare` and `todo-parts.declare`, in full, as the skill asks.

After that I left the skill's "then stop reading" list and read more, because a chat app's hard parts are scrolling and long lists:
- In full: `07-scrolling.md`, `16-collections.md`, `13-media.md`, `14-data.md` and `18-overlays.md`.
- In part: `10-touch.md` (to line 222), `17-your-own-views.md` (lines 16–530), and the TweenLayout section of `23-animated-arrangements.md`.
- About 30 `declare-help` lookups: Socket, Stream, Spring, TweenLayout, App, Image, Text, TextInput, Popover, Dialog, Radius, "theme tokens", View.firstVisibleRow, View.scrollAnchor, View.claim, Media.position, TextInput.multiline, and others.
- A slice of `docs/operational/verify.md`, for the assert API.

**What I skipped.**
- Chapters 08 (controls), 11 (themes), 12 (text), 21 (motion) and 22 (time). I skipped them because todo showed me the patterns. Skipping 12 cost me directly: I wrote `lineHeight = 21`, thinking in CSS pixels. It is a multiplier.
- The tracker app, which the skill suggests for virtualized lists. Chapter 16 seemed enough, and it was.
- `21-motion.md`, which I would have needed for the typing dots if I had wanted to do them idiomatically. I used a frame `Time` instead.

**What taught me the most.**
- `07-scrolling.md`, the "Keeping the reader's place" and "Following the end" sections. They describe nearly the whole §4 of the brief, almost word for word. The `newBelow` constraint there became my `below`/`atBottom`.
- The todo app, for how a program is put together: a dataset class that makes every write, state on the App, `classFor`, `exists`.
- The diagnostics. Several taught me rules I had read but not absorbed.

**What was missing or misleading.**
- `14-data.md` suggests `rec: Task = { :@ }` so a row can "hold it as one and pass it on". I did exactly that (`rec: Thread = { :@ }`). Because my writes mutate fields inside the record, the attribute never changed identity, and derived values went stale. §5 of `declare.md` does say "the same object … wakes nothing". The two passages are each true, but nothing connects them, and the suggestion reads as safe.
- Nothing I read says how constraints behave when a replicated instance is handed a different record. See (j).
- `Text.lineHeight` is listed in `declare-help Text` with no unit.

## (b) Expressing what I wanted

**Where Declare fit my intent very well:**
- **Conversation behaviour:** `virtualize = true` plus `scrollAnchor = end` gave me "stay at the bottom, or hold my place and show something new" with no code.
- **Remembering position:** one built pane per conversation, shown or hidden with `visible`, did all of it.
- **Live data:** the Socket writing into the DataSource, with everything downstream following.
- **Message furniture:** deciding a row's furniture from its neighbours through `provided("rows")[rowIndex - 1]`, as chapter 16 suggests.
- **Overlays:** `Popover` turning into a bottom sheet on a phone for free, and `Dialog presentation = "full"` for the photo viewer.
- **Composer:** growing to fit its text exactly as `TextInput.multiline` describes.

**Where I had to work around it:**
- **Cross-axis alignment:** I couldn't right-align a column whose width came from its children. See (d) item 11.
- **Reaction tally:** I couldn't replicate over a computed array. I ended up with a `Dataset` per message row.
- **List rows:** methods that take a conversation id couldn't be called from rows that get re-pointed at other conversations. I rewrote them to take field values instead.
- **Voice state:** I couldn't call the base class's `onPointerDown` from my scrubber. Seeking a clip that hadn't loaded needed a pending-seek field I wrote myself.
- **Method arguments:** I couldn't pass `this.get(tid)` into a method that reads a field through its parameter. The compiler refused it (DECLARE7001).

## (c) The first time it ran

Screenshots from `declare-look`, at 1440×900 and with `--phone`, showed these problems, in order:
1. **The list's preview lines sat about 130px below their rows,** and one preview's two lines were about 250px apart. I removed `height = 36` and `lineHeight = 18` and it was fixed. I didn't understand why until much later: `lineHeight = 18` meant 18 times the line height.
2. **No messages appeared,** and the page reported a constraint cycle on `View.height` at `…list.0.line`. Found from the error text plus elimination (item 11).
3. **Text bubbles were about 350px tall.** I found the cause by dumping row geometry with `--js`: every Text was 336 tall, which is 16 × 21. `lineHeight = 21` is a multiplier.
4. **The header avatar overlapped the title.** That was my `scale = 0.77` hack, plainly visible in the screenshot.
5. **Unread badges didn't clear when I opened a conversation,** although the "N new" total did go down. Comparing those two numbers in the screenshot gave it away.
6. **The "jump to latest" button was cut off at the right edge.** Visible in the screenshot.
7. **The first `/threads.json` request returned 404.** `--requests` showed it.

## (d) Every refusal and surprise

1. **ThreadRow.width, DECLARE2000: "Stack sizes its children".** I had set `width = 100%` on the row, and my own layout also returned `w`. I removed the row's width. My code was wrong; the message was clear.
2. **DECLARE2005: a Spring can't drive `pic.opacity` because it is bound by a constraint.** I made the opacity a bare `0` and kept the Spring. My code was wrong. Chapter 07 says this in its sliding-panel example; the message was clear.
3. **DECLARE2000 on `Glyph.x` inside a Control with a SimpleLayout.** I changed the jump button's padding instead. My code was wrong.
4. **DECLARE4005: bare `bold`, `semibold` and `regular` inside `{ }`.** I quoted them. My code was wrong. `declare.md` §2 warns about exactly this and I still did it. The message was excellent.
5. **DECLARE4023 (warning): `rowIndex` inside an `exists` child resolves to that child's own `rowIndex`.** I moved it to a classroot attribute, `startsUnread`. My code was wrong. §3 says built-ins never resolve outward, but I would never have caught this without the warning. This is a very good diagnostic.
6. **Accessibility warnings:**
   - DECLARE4035: a label with no role, on Avatar and TypingRow. I added roles.
   - DECLARE4020: the close button was nested inside a full-screen Control. I restructured into sibling controls.
   - DECLARE4017 and DECLARE4027: the dismiss control had no name and was hidden from screen readers. I named it.

   All were fair.
7. **DECLARE4025 lint: conditions with 5 or more parts, and choices nested three deep.** I split them into named facts. The first split still warned at 4 parts, so I named more. This was fair, and the result reads better.
8. **DECLARE4002: the member `count` shadowed the script function `count`.** I renamed the function. Good catch.
9. **R1 refused a child named `backdrop`, because that is an attribute's name.** I renamed it `dismiss`. Reasonable.
10. **DECLARE3006: a datapath can't point at a literal (`{ { list: classroot.chips } }`).** I gave each row a `chips: Dataset [ contents = … ]`. The platform made a choice here, and the message named the fix. A Dataset per virtualized row feels heavy, but I saw no problem with it.
11. **Constraint cycle at boot (`View.height (runtime derive) … re-evaluated 100 times`) on the message line.**
    - What I wrote: a row with Spacers, and a column marked `shrinks` whose layout had `align = { mine ? "end" : "start" }`.
    - What I tried: removing the `align` fixed it; a static `align = end` still cycled. So `end` in a column sized by its children is a cycle.
    - Fix: the column takes the row's width (`flexes`), and the react button is placed by hand with `ignoreLayout`.
    - Judgement: my code was wrong by the platform's rules. `06-layout.md` explains that `align = stretch` in such a column means "as wide as the widest child", so I assumed `end` would mean "against the widest". It doesn't. The error names the view but not the attribute that caused the cycle. That cost me three runs.
12. **DECLARE6001: a `number[]` isn't a `Radius`.** I typed it `Radius`. Fine.
13. **DECLARE6001 / TS2554: `super.onPointerDown(e)` passes 1 argument, but the method takes 0.** I dropped the argument. My code was wrong.
14. **R4 layout finding: ThreadRow height is undefined.** My TweenLayout subclass returned boxes with `{x, y, w}` and no `h`. I added `h: c.height`. Unsure: `17-your-own-views.md` says a box names only what the layout decides, so leaving out `h` should leave the child its own height. With TweenLayout it gave undefined instead. That looks inconsistent.
15. **A 404 for `/threads.json`.** My `url` was `base + "/threads.json"`, and `base` starts as `""`, so `autoFetch` fetched a relative URL first. I made the url `""` until base is set. My code was wrong.
16. **The list preview and line-height surprises** in (c), items 1 and 3. Caused by my CSS habit, plus a reference entry with no unit.
17. **Stale unread badges.** See (a). Fixing it led to the next item.
18. **DECLARE7001: "titleOf(…) reads through its 't' parameter, but the argument passed for it is not a nameable path".**
    - I wrapped `titleIn(tid)` around `titleOf(this.get(tid))`. The error stayed and pointed at the call site in the view.
    - `unreadIn` and `facesIn` were built the same way and were *not* flagged.
    - I rewrote `titleIn` to read `this.thread(tid)` directly, and it passed.
    - Judgement: unsure. The likely difference is that `titleOf` read the optional field `t.title`, or passed `t` into an arrow function. The error points at the outermost call, not at the place the argument was passed, so I fixed it by trial.
19. **A hang on the scrubber.** See (j).
20. **A seek made before the clip loaded was lost.** I added `pendingSeek`, applied when `loaded` changes. Unsure: my own frame tick also overwrote the playhead with the clip's position of 0. The reference for `Media.position` doesn't say what assigning it before load does.
21. **The viewer's caption was off screen and the close button was misplaced.** An `ignoreLayout` child's `y` is measured from the parent's content box; I had computed from the full height. I switched to `contentBox()`. My code was wrong, and §6 says this.
22. **The photo picker showed 3 columns instead of 4, and was clipped in the phone sheet.** I switched to `WrappingLayout columns = 4` with `flexes` and square tiles. My code was wrong.
23. **The wrong row was highlighted after the list reordered.** See (j).
24. **R4 / look findings: a reaction chip was 45×26, then 33×44, below a finger's 44.** I made a 44-point control with a smaller pill drawn inside it. Fair finding.
25. **When I briefly swapped in SimpleLayout: "body flexes but the row is as wide as its children".** Accurate, and its fix was right.
26. **A `--read app.murmur.status` failed.** `status` is on Stream, not DataSource. My mistake.

## (e) Verifying it

**Checks I used.**
- `declare-verify`, R1 to R4, after each round of edits. It caught items 1–14 above.
- `declare-look` screenshots at both sizes, plus `--dark` and `--phone`, at each milestone. These caught everything in (c), the wrong highlight, the clipped picker, the cramped waveform, and the viewer's caption placement.
- `--js` with `__declare.find(...)`, to dump geometry and state. This was the most useful tool by far: it found the line-height multiplier and the stale title.
- `--call` and `--read`, to drive the app without pointer paths.
- `flow.mjs` at R5: 12 steps, 9 assertions, passing.

**Where the tools served me poorly.**
- **Unstable paths in virtualized lists.** `list.18` was a voice message in one run and missing in the next. The docs do say to name such rows by what they say, and accessible-name paths (`app."Play voice message, 0:07"`) worked well once I used them.
- **A misleading hang message.** It said the program "stopped answering … during settleMotion", so I guessed that my always-running typing-dots clock was keeping motion from settling, and switched to `--no-settle`. `verify.md` actually says a `Time` loop doesn't hold `settleMotion`. My guess was wrong, and the real problem was the scrubber.
- **No way to watch a TweenLayout glide mid-flight.** The gliding reorder was never seen moving.
- **Long real-time waits.** Each live-feed test needed `--wait-real` of about 27 seconds. Reading `/schedule.json` from tests would have helped, and the brief allows test drivers to use it.

## (f) Confidence, part by part

**The eight verbs (§3):**
1. **List with unread markers:** high. **Ordering kept live:** high since the fix, but only re-checked in one scenario.
2. **Scrolling all of a long history:** high with programmatic scrolling and the wheel. I never dragged the scroll thumb, which the brief names. A tester might find the thumb jumpy, because virtualized rows stand in with estimated heights.
3. **Returning to a conversation:** high on desktop. Not checked on a phone.
4. **Sending text:** high. The "Sending…" state was never seen; the service answered too fast.
5. **Sending a photo:** high.
6. **Reactions:** verified on others' messages, by hold and by mouse. Not tested on my own messages. "Doesn't disturb reading" was not tested explicitly.
7. **Voice:** play, tap-to-seek and mouse drag verified. Not verified: pause, reset at the end, and a finger drag through `claim = x`. Keyboard focus on press is gone since the fix for (j).
8. **Full-size photos:** a tall photo verified, and closing with Esc. Tapping the backdrop to close was not tested. A 3:1 photo was never opened full size.

**Brief §4 (what must be true):** grouping and dates were seen and look right. Arrival while scrolled back was verified. Seen receipts were never observed at all; that is the likeliest place for a bug.

**Brief §6 (designed states):**
- A one-message conversation: none exist in the data, so untested.
- Long names: none were long enough to truncate, so truncation was never seen.
- A photo still loading: the placeholder (alt text on the person's tint) was never captured.
- Before anything arrives: the splash was never captured; the data loads too fast.
- The floating date chip while scrolling: never seen working.

**Where I'd expect a tester to find problems:**
- Any remaining constraint that goes stale when a row is re-pointed at another record.
- Touch scrubbing.
- The phone keyboard (I used `keyboardHeight` padding, untested).
- Seen receipts.
- The date chip.

## (g) Gaps I worked around

1. **Right-aligning a column whose width comes from its children.**
   - What I tried: `align = end`. It made a cycle.
   - What I did: the column takes the full width, and the react button is placed by hand.
   - Judgement: the platform has it once the view is given room. What I lacked was knowing that `end` needs room given to it.
2. **Replicating over a computed array.** DECLARE3006 sent me to a Dataset per row. The platform has a way, just a heavier one than I expected.
3. **A phone navigation stack (push and pop).**
   - What I looked at: `ResponsiveLayout`, whose plans snap from one arrangement to the next, and `Sheet`.
   - What I did: wrote a `Stage` layout driven by a Spring.
   - Judgement: probably a real gap, but unsure. I didn't search the library.
4. **A gliding stacked list.** I copied todo's `Glide` into my `Stack`. Unsure whether the library ships a stacking TweenLayout.
5. **The breathing typing dots.** I used a frame `Time` and a script function. An `Animator` that repeats is likely the idiom; I didn't look.
6. **Seeking before load.** I wrote `pendingSeek`. Unsure whether Media already holds a seek made before load.
7. **Noting where unread messages began when a conversation is opened.** I wrote a `mark` field into the thread record. That's fine; not a gap.

## (h) Changes of direction

1. **The message line:** Spacers with a column aligned to its end, then a full-width column with a hand-placed react button. Early in the first run; caused by the cycle refusal.
2. **List rows:**
   - First: a cached record, `rec = { :@ }`.
   - Second: lookups by id. That change came from the stale badges.
   - Third: field reads such as `:messages` and `:read` passed as values. That came from the wrong-highlight bug.
3. **The header face:** a `scale` hack, then a `side` parameter. Changed when I saw it in a screenshot.
4. **Reaction chips:** a literal datapath, then a per-row Dataset. Caused by the refusal.
5. **Chip size:** a 26-point chip, then a 44-point control with a pill inside. Caused by the layout finding.
6. **The waveform:** one bar per peak, then bars downsampled to fit, and the bubble widened twice. Changed when I saw it cramped.
7. **The viewer:** a full-screen Control, then a View holding a dismiss control as a sibling. Caused by DECLARE4020.
8. **Seeking:** assigning `position` directly, then a pending seek. Caused by running it.
9. **The scrubber:** I removed its `super.onPointerDown()` call and renamed three methods. The rename didn't help, but I kept the new names.
10. **The list layout:** swapped briefly to SimpleLayout as a diagnostic, then back to Stack.
11. **Testing:** switched from settle mode to `--no-settle` on a wrong hypothesis.

## (i) Source reads

I didn't read those files. I never opened `library/dialog.declare`, `floating.declare`, `popover.declare`, `textinput.declare`, `runtime/src/schema.ts` or `view.ts`. Those paths appeared as the "source:" provenance lines at the end of `declare-help` answers, for Dialog.presentation, Floating.showFor, Popover.placement, TextInput.*, View.firstVisibleRow and View.scrollAnchor. The reference gave me what I needed each time.

The things I wanted but didn't find are:
- The unit of `lineHeight`. I never asked; the summary listing shows only `number`.
- What a `position` write before load does.
- What happens to constraints when a row is handed a different record.

## (j) Two episodes

**The scrubber that stopped answering.**
- **What I saw:** a click-at on the waveform gave "the program stopped answering for 15 s — something it ran does not finish".
- **What I tried, in order:**
  1. I blamed settleMotion and the typing-dots clock, and switched to `--no-settle`. It still hung, now "during click".
  2. Calling `app.seekVoice(...)` directly worked.
  3. Setting `dragging` and calling `scrubAt(50)` from `--js` worked.
  4. Renaming `seek`, `settle` and `to` (suspecting collisions with runtime names) didn't help.
- **What fixed it:** deleting `super.onPointerDown()` from my `onPointerDown`.
- **What I think caused it:** unsure. The Knob example in chapter 17 makes the same super call. What Scrubber had and Knob doesn't: `claim = x`, no `press()`, and a `draw` that reads `dragging`. I never built a minimal repro.
- **Cost:** about 7 runs.
- **Consequence:** pressing the scrubber no longer takes keyboard focus.
- **What would have helped:** a hang report that names the loop's frames, or the handler that was running when it stopped answering.

**The wrong highlight after a reorder.**
- **What I saw:** Priya's conversation highlighted at the top of the list while Kestrel Street was open, and the rows out of date order.
- **What I tried, in order:**
  1. I suspected the frozen test clock interrupting a glide. It reproduced in settle mode.
  2. Swapping TweenLayout for SimpleLayout: the same.
  3. Dumping each row's `tid`, `title`, `y` and `lit`. The row at y=0 had `tid` t1 (Kestrel) and was correctly lit, but its `title` was "Priya Raman".
- **Diagnosis:** that row had been re-pointed at a different conversation. Constraints that compare plainly (`here = app.openId == classroot.tid`) re-ran. Constraints of the form `app.murmur.titleIn(classroot.tid)` kept their old value. A run without the wheel steps came out correct, and I can't explain why.
- **What fixed it:** reading the record's own fields (`:messages`, `:read`, `:participants`) and passing them as values. I then spot-checked that recycled message rows matched their records; 12 sampled rows did.
- **What I think caused it:** unsure. Two possibilities:
  1. Reconciliation reused instances by position even though every record has an `id`.
  2. When a row is re-pointed, constraints that call a method aren't re-run.

  Either way, the wrong value was silent.
- **Cost:** about 6 long (~30-second) runs.
- **What would have helped:** either a guarantee in the docs, or a dev-time warning when an instance changes records.

## Overall

**The sharpest edge** wasn't one obstacle; it was a pattern: values that were silently wrong. It showed up four times:
- the cached record that never woke,
- the stale constraints after a reorder,
- the cycle whose diagnostic didn't say which attribute caused it,
- the line-height multiplier.

The compiler's refusals were never the problem; they were the best part. Together these cost perhaps a third of the build. To write it right the first time I'd have needed three things:
- a stated rule about identity and re-pointing,
- `lineHeight`'s unit in the reference,
- the cycle error naming `align`.

**What was good:**
- Diagnostics that name the fix, and accessibility warnings that taught me rules.
- `declare-help`.
- Virtualization plus scroll anchoring, which made the hardest parts of a chat app almost free.
- Overlays that adapt to a phone on their own.
- The look tool's `--js`.

**What was bad:**
- The silent wrong values above.
- The hang report giving no location.
- No view into motion while it's happening.

**How it compares:** it reminds me most of QML, with its bindings, states and anonymous subclassing. After that, Flex/MXML and, as the README says, OpenLaszlo. It is stricter than either, and the compiler does far more. Compared with React, the absence of re-render reasoning is real, and freeing. Compared with SwiftUI, layout is more explicit and easier to reason about. Data binding through `:paths` is unusual, and powerful once you learn which reads track.

**Where I'd most want improvement:**
- Guarantees and warnings around a row being handed a new record.
- Cycle diagnostics that name their cause.
- Units in the reference.
- A documented way to call base pointer handlers safely.

**What I'd use it for:** interactive, data-heavy apps that have to work on phone and desktop: messaging, feeds, dashboards, tools with long lists. That is where its scrolling, virtualization and constraint model pay off most.

## Names

```
NAMES — eval-murmur-15.noindex: 1 missed name(s), 0 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    30 · member    · people               · ThreadPane               · —                  · none         · ×1  ·   31 · resolved
         'people' is not a member of ThreadPane — declare it (people: <type> = …) or fix the name [DECLARE6001] (line 837, col 88)

SUMMARY: 1 of 1 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
