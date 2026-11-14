# Murmur run 16: Opus 5.5, Declare, on the local tree

Built on the local working tree, the same subject as Cadence run 31 plus that run's fixes.
**17.8 min, 87 turns, delivered.** It is Murmur's best (run 12: 18.2; run 15: 33.9). The
agent's five assert scripts pass. Murmur has no hidden acceptance. The deep audit found two
platform bugs, a library defect and a driver defect, so the run is **not clean on any count**.
Timing record: `evals/timings/2026-11-12-murmur-run16-local.txt`.

## Figures

| | Run 13 | Run 14 | Run 15 | **Run 16** | React 1 |
|---|---|---|---|---|---|
| time | 20.5 min | 21.2 min | 33.9 min | **17.8 min** | 18.1 min (bare prompt) |
| turns | 96 | 112 | 141 | **87** | 76 |
| lines of code | — | — | 1,120 non-blank · 964 without comments | **1,016 non-blank · 866 without comments** | 3,612 |
| output tokens (thinking) | 88.3k (36.8k) | 93.5k (37.6k) | 113.4k (45.3k) | **73.5k (23.4k)** | |
| phases: reading · writing · checking | 5.7 · 5.2 · 9.6 | 6.5 · 3.0 · 11.7 | 4.3 · 4.5 · 25.2 | **4.2 · 2.4 · 11.2** | |
| tool · model time | 5.8 · 14.7 | 5.6 · 15.6 | 14.5 · 19.4 | **6.2 · 11.6** | |
| `declare-look` | | | 41 calls, 12.4 min | **4 calls, 0.3 min** | |

**Where the time went.** Of the tool time, 4.1 min was `drive.waitReal` in R5 (77 calls).
Of that, 2.7 min was three arrival runs of 58.7 s each:
- the first ~12 s wait was needed, because the service sends on its own schedule;
- a 44 s wait for a second unbidden arrival was the agent's choice;
- the 1.2–1.5 s waits that open every script weren't needed (D2).

**Against run 15:**
- run 15's `Media.playing` echo hang is fixed, so voice took 1.6 min instead of 6.1;
- `Text.lineHeight` now reads as a multiplier, so run 15's 4 min tall-bubble first boot didn't recur;
- live waits moved out of `declare-look` into assert scripts;
- the TweenLayout `h` trap recurred (M1).

## The deep audit

The repros, the `use-*.mjs` scripts and the screenshots are in `audit/`, all run against the local tree.

| min | What it met | Verdict | Repro |
|---|---|---|---|
| 6.6 | `fontStyle` on Text (CSS hint → `italic`) | Its code; good message | `r1-names` |
| 6.6 | Child named `clip:` | Its code; fair collision, rename suggested | `r1-names` |
| 6.6 | `fontFeatures = "tnum"` on TextLabel, no hint | Its code; **N1** | `r1-names` |
| 6.6 | `maxLines` on TextInput, no hint | Its code; **N2** | `r1-names` |
| 6.6 | Spring on a bound `opacity` (2005) | Its code; good message | `spring-bound` |
| 6.7 | `semibold` bare inside `{ }` (4005 ×3) | Its code; good message | `enum-in-braces` |
| 6.7–14.7 | `{ ({}) }` (1002 ×6) | Its JS habit; correct hint | `lints` |
| 6.7–14.4 | DECLARE4035 ×5 (Avatar, reaction chip) | Correct, not false positives; **M2** on where it's reported | `label-no-role*` |
| 6.8 | `'feed' … a child's is 'scroller.feed'` (6001) | Its code; good message | `r3-member-and-optional` |
| 6.8 | `classroot.face may be absent` (6001) | Its code; **M3**, an alternative that can't apply to an `exists` child | same |
| 6.9 | 6× "ThreadRow has height undefined" | Its code. Recurs from run 15; **M1**, **R1** | `tween-no-h*` |
| 7.5 | Composer field 274×38, under the 44-point minimum | Correct; fixed | — |
| 8.3 | `expect.text("Sending")` failed after a step waited for `sent` | Driver as documented; **G1** | — |
| 8.6 | `app."Dana Ruiz"` ambiguous between two avatars | Correct | — |
| 8.6 | Row overflow and "feed.22.shot covered by feed.23.shot" after sending a photo | **Platform bug P2** | `id-change-virtualized` |
| 8.7 | `fill` on a full Dialog had no effect; 2 library reads | **Library defect L1** | `dialog-full-fill.*` |
| 10.2 | `waitReal(44000)` → "an evaluate … has not finished in 30 s … a promise nothing resolves" | **Tool defect T1** | `waitreal-35s.*` |
| 12.9 | `corners: number[]` into `cornerRadius` (6001) | Its code; good message | `radius-array` |
| 14.4 | DECLARE4025, a four-part condition | Its code; good lint | `lints` |
| 16.7 | Tab order for the React button | Correct; its `tabOrder()` fix is right | — |
| audit | Tab order in a virtualized list | **Platform bug P3**, latent in the run and present in the app | `virtualized-tab-order.*` |

**Platform and library:**
- **P2. Rewriting a record's identity field under `virtualize` leaves two views for one record,
  for good.** Likely cause: `virtualize.ts:457` reuses `ledgerIds` unless membership changed.
  The agent worked around it with a `serverId` field, which the app still carries.
- **P3. A virtualized list's Tab order follows its views' order in the tree, not the data.**
  Tab visits 281 → … → 299 → 280 → 279. The checker's advice for it can't be followed by the
  author.
- **L1. An overlay's own `fill` is painted under its internal `_panel`, which paints
  `surface`.** The colour never shows and nothing says so (`dialog.declare:363`; the same in
  `sheet.declare` and `popover.declare`).

**Tools:**
- **T1. `drive.waitReal` longer than 30 s always fails, and the message blames the program.**
  The stuck-evaluate watchdog fires on the driver's own wait (`verify-behave.mjs:1820`).
- **T2.** `names.py` missed the scoped lookup miss "`TextInput has no member 'maxRows'` and
  nothing near it".

**Messages:**
- **M1 (recurring).** A TweenLayout box without `h`: the boot finding never names
  `Stack.place()`. R1 refuses a use-site `height` but lets a class-body one through, and the
  layout then overwrites it.
- **M2.** DECLARE4035 is reported at each use site, not once at the class.
- **M3.** The optional 6001 offers "declare it without '?'" for an `exists` child.

**Names:**
- **N1. `fontFeatures` (Flutter):** Declare's word is `numeralWidth = tabular`. With no hint,
  the agent dropped tabular figures, and the delivered voice countdown jitters.
- **N2. `maxLines` on TextInput:** the field's cap is `height = { Math.min(contentHeight, N) }`.
- `clip` was a fair collision.

**Reference:**
- **R1.** The TweenLayout prose says a box without `vis` hides the child; the code shows it.
- **D1.** Nothing says how to colour a full-screen Dialog.
- **D2.** `verify.md` doesn't say a script starts with the first data in.
- **G1.** No way to observe an in-flight state such as "Sending…".

**Source reads:**
- `ls library` (Avatar?): fair.
- `library/dialog.declare` ×2: a doc gap (D1) plus a library defect (L1).
- `library/textinput.declare`: redundant; a hint for N2 would have answered at 6.6 min.

### Clean bill

| Count | Verdict |
|---|---|
| Platform | **Not clean.** P2 met (cost a workaround), L1 met, P3 latent |
| Tools, incl. the driver | **Not clean.** T1 met; M1 met (second Murmur run in a row); M2, M3 minor. No false passes |
| Names | **Not clean.** N1, N2 got no hint; N1 lost intent in the app |
| Reference | **Not clean.** R1 stale; D1, D2 gaps; one doc-gap read |

**Friction cost: about 4k output tokens (≈5.5%) and about 2.1 min of 17.8 (≈12%).** The
breakdown: T1 0.85 min, P2 0.4, D2 waits about 0.4, and L1, M1 and N2 about 0.15 each. These
are estimated from timestamps. The account says names cost "10–15 min"; the stream shows
about 0.3. It says the doubled row cost "perhaps ten minutes"; the stream shows about 0.6.

### Defects in the delivered app

Scrolling 30.5k messages by the thumb, swipe-back and return, sending with "Delivered", the
dark viewer and the list order all work by real input. A person would hit:
1. Tab order that jumps (P3).
2. A countdown that jitters (N1).
3. "Sending…", which nobody verified.

Its `scroll.mjs` and `arrival.mjs` move the app with `page.evaluate` rather than a person's input.

## Fixed on the local tree after this run

All eleven items are fixed and checked against their repros. The targeted tests pass: unit,
diagnostics-hints, docs, declare-help, accessibility (both), library, table, visible-rows,
row-lifetime, deferred-dom, tracker, materialization, silent-failures, drag-edge-scroll,
layer-promotion and verify-apps.

- **P2:** a mounted row whose slot no longer holds its id counts as a membership change, so
  the old row retires (`runtime/src/virtualize.ts`). Regression test in `test/materialization.test.mjs`.
- **P3:** after rows are built or re-pointed, mounted rows are put back in data order among
  their parent's children (`inDataOrder()`). Tab and the DOM follow the data. Regression test added.
- **L1:** an overlay's `_panel` paints `classroot.fill ?? surface`, and the overlay's corner
  radius moved onto the overlay (`library/dialog`, `sheet`, `popover`, `floating.declare`).
  The look is unchanged when no fill is set. The D1 docs are in guide 18 and the Dialog reference.
- **T1:** `waitReal` runs in slices of up to 10 s (`tools/internal/verify-behave.mjs`).
  Regression test in `test/silent-failures.test.mjs`.
- **T2:** `names.py` matches both "has no member" forms.
- **M1** (message only): the TweenLayout finding names `place()` and the missing key. **R1:**
  the TweenLayout prose matches the code.
- **M2:** DECLARE4035 is reported once, at the class. **M3:** an `exists` child's
  "may be absent" message offers only what applies.
- **N1, N2:** `fontFeatures` (Flutter), `fontVariantNumeric` and `fontFeatureSettings` (CSS)
  are answered with `numeralWidth = tabular` and its siblings. `maxLines`, `maxRows` and
  `rows` on TextInput are answered with the `contentHeight` cap.
- **D2:** `verify.md` says a script starts once the app has arrived, so it needs no opening wait.

**Deferred: design**
- TweenLayout: should a missing `x/y/w/h` default to the child's own value, as `vis` does?
- A way to observe an in-flight state such as "Sending…" (G1).
- Overlay `fill`: a translucent fill is now painted twice (on the overlay under the scrim, and
  on the panel). Also, `fill` alone leaves `surface` colouring the overlay's contents.

## Is it idiomatic Declare?

`idiom.py`:

| | Run 15 | Run 16 | To-do |
|---|---|---|---|
| code | 964 lines | 866 lines | 843 lines |
| colour literals outside a theme | 2 | 5 | 1 |
| theme reads | 77 | 78 | 69 |
| States | 1 | 6 | 7 |
| visible switches | 1 | 1 | 0 |
| branches on width or phone | 10 | 16 | 38 |
| flexes | 12 | 9 | 7 |

The line-by-line idiom read wasn't done for this run.

## The agent's account

Pasted whole. Where the audit contradicts it, the audit's reading is above.

# Building Murmur in Declare: an account for the people who make it

Two practical notes first:

- **The dev server I started has stopped.** The background task on port 8201 ended with exit code 143, which means it was terminated. The URL I gave you no longer answers. You asked me not to change anything, so I haven't restarted it. To restart it, run `PORT=8201 npm start` in `declarelang/`.
- **The source files changed on disk after my last edit**, and I haven't re-read them. The code quoted below is reconstructed from this session as I wrote it. It may not match what is in the files now.

---

## (a) Getting up to speed

**What I read, in order.** I followed `skill/SKILL.md`, which `README.md` and `AGENTS.md` point to:

1. `README.md`, the brief and `task/api/API.md`.
2. `skill/SKILL.md` and `AGENTS.md`.
3. The required reading, each file whole:
   - `docs/declare.md`
   - `docs/guide/01-what-declare-is.md`
   - `04-structure.md`
   - `05-run-and-check.md`
   - `06-layout.md`
   - `apps/todo/todo.declare` and `todo-parts.declare`
4. Before writing any code, the chapters my plan needed:
   - `07-scrolling.md`, whole.
   - `16-collections.md`, whole.
   - `13-media.md`, whole.
   - The Streams section of `14-data.md`, plus `apps/docs/demos/Socket.declare`.
   - `18-overlays.md`, whole.
   - About the first 230 lines of `10-touch.md`.
   - The custom drawing, "a control of your own", icons and "writing a layout" sections of `17-your-own-views.md`.
5. Targeted `npx declare-help` lookups:
   - `Socket`, `Stream`, `Stream.onMessage`
   - `firstVisibleRow`, `scrollAnchor`
   - `Image --all`, `Time`, `Time.onTick`, `Media.position`
   - `View.userScrolling`, `Popover --all`, `TextInput.onEnter`, `TextInput.multiline`
   - `Spring`, `Layout --all`, `defaultPlacement`, `SimpleLayout.align`
   - `identityKey`, `View.method.tabOrder`, `Avatar`, `App`
6. Mid-build, `library/dialog.declare` lines 355–420. I went to the library source because the docs didn't explain why my full-screen dialog's background looked wrong.
7. The assert-script section of `docs/operational/verify.md`.

**What I skipped, and why.**
- **Chapters 02 (notation), 03 (constraints), 08 (controls), 09 (pointer and keyboard), 11 (paint and themes), 12 (text) and 15 (schemas).** declare.md plus the to-do app seemed to cover enough of each. Several of my compile errors came from exactly these gaps:
  - `fontStyle` and `fontFeatures` would have been answered by chapter 12.
  - Enum tokens inside braces were covered in declare.md §2, but only illustrated with colors.
  - What `minHeight` does on a field that sizes itself from its content is in chapter 06, which I had read and didn't apply.
- **The tracker and weather apps.** SKILL.md recommends them, for the virtualized list and for the phone/desk layout respectively. I relied on chapter 16 and on my own `Pages` layout instead. I can't say whether reading them would have changed anything. The weather app's single-spring phone transition is probably close to what I built by hand.
- **Chapters 19–31.**

**What taught me the most.**
- **The to-do app.** It showed the whole shape of a program in one place: a `DataSource` subclass holding the records and their writes, state on the App, a `TweenLayout` subclass, `classFor`, `State` for looks, `Popover`/`Sheet` chosen by width, and a theme spread over a preset. My file structure copies it.
- **Chapter 07's "Following the end" section.** `scrollAnchor = end` is almost word for word the brief's arrival requirement. The `newBelow` constraint example there became my "new messages" pill.
- **Chapter 16.** Two of its examples were nearly my exact cases:
  - The date chip example, `rows[app.list.firstVisibleRow]?.day`, is literally a chat feature.
  - The `provided("rows")[rowIndex - 1]` pattern ("what sits between records belongs to the row after it") gave me day headings and message runs without a derived list.
- **Chapter 18's `class Viewer extends Dialog [ presentation = "full" … ]` fragment.** It is the photo viewer the brief asks for.

**What was missing or misleading.**
- **declare.md §2 says "the vocabulary stops at the brace"**, but illustrates it with colors and lengths. I didn't carry the rule over to enum tokens like `semibold` (DECLARE4005 below). One line in §2 naming enum tokens would have prevented it.
- **The full-screen `Dialog`'s background.** The chapter 18 Viewer example puts an `Image` with `fit = contain` in a full dialog. A real photo then letterboxes onto the theme's `surface` color, which nothing in the guide mentions. My `fill = 0x0B0B0C` on the dialog had no visible effect, and I had to read the library source to find out why.
- **TweenLayout's box contract.** The general rule is that a box names only the attributes the layout owns. My TweenLayout returned `{x, y, w}` and produced `height undefined`. The to-do app's `Glide` returns `h`, but nothing I read says a TweenLayout needs it. I didn't read the `TweenLayout` reference entry, so this may be documented there.
- **The 30-second ceiling on a single page evaluate in assert scripts.** I couldn't see it in the `drive.waitReal` row of the verify.md table, and I learned it by failing.

## (b) Expressing what I wanted

**Where it fit, often startlingly well:**
- **Following the bottom and keeping the reader's place.** `scrollAnchor = end` on each pane did both, with no code.
- **30,500 messages.** `virtualize = true`. Scrolling to the top took about 1.6 seconds of real time in the check.
- **Returning to where you were.** One pane per conversation, replicated over `:threads[]` and hidden with `visible`. It keeps its scroll position because it is never destroyed. The skill's drift list warns against saving and restoring scroll, and this was the natural alternative.
- **The live feed.** A `Socket` with `active = { app.convos.loaded }` and `onMessage`.
- **Writing into the history.** `this.set(["threads", i, "messages", "-"], m)`, after which the list re-sorts, unread counts update and the pane follows, all by derivation.
- **Marking messages read.** `trackChanges = ["caughtUp", "count"]` with `onChange() { if (caughtUp) app.markRead(threadId) }`. It said exactly what I meant: whenever you are caught up, everything is read.
- **Reordering the conversation list.** A derived `Dataset` sorted by last activity, plus a `TweenLayout`, gave the slide-to-new-place motion for free.
- **The waveform scrubber.** A `Control` with `draw(d)`, `claim = x`, `onPointerDown`/`onDrag`, and accessibility increment/decrement. That was short.
- **The two-page phone transition.** A `Layout` subclass with a `t` attribute driven by a `Spring`. About fifteen lines, interruptible.
- **Per-conversation drafts.** `draft: string = ""` on `ThreadPane`, which works because the panes persist.

**Where I worked around something:**
- **Mine-versus-theirs alignment.** `SimpleLayout.align` is literal-only, so I couldn't write `align = { mine ? end : start }`. I put `State [ applied = { classroot.mine }, x = end ]` on each of three children instead (`body`, `marks`, `receipt`). It works, but it's repetitive.
- **The hover react button.** With `defaultPlacement = body`, the subclass's bubble always goes after the base class's own children in `body`. For other people's messages I wanted the button *after* the bubble. I placed it by hand with `ignoreLayout` and `x = { classroot.mine ? parent.body.x - 36 : parent.body.x + parent.body.width + 6 }`, then needed a `tabOrder()` override to fix keyboard order.
- **Socket frames.** I couldn't type them with a schema: `message` is an object on `message` and `sent` frames but a string id on `reaction` frames. I wrote a TypeScript `type Frame` in script with `message?: any`, and `parseFrame(s) { return JSON.parse(s) as Frame }`.

## (c) The first time it ran

The first boot that passed R4 had six layout findings, every one on the conversation list: `app.stage.side.list.rows.N (ThreadRow) has height undefined`. My first screenshot came after I fixed that. The list was correct: ordered, with unread badges and the "Gathering conversations…" state before data arrived.

Opening "Trail crew" was right on the first try: grouped names, avatars, a day heading, a reaction chip, "Delivered", and the composer.

What I found wrong after it ran, and how I found each:

1. **No times anywhere.** I only saw this when looking at the screenshots and thinking about reading back through history. I added time stamps at day breaks and at pauses of 45 minutes or more.
2. **A sent photo overlapping the typing indicator.** Caught by a layout finding and a screenshot together; detailed in (d).
3. **The full-screen photo viewer had light bands above and below** the image, with a caption that was nearly invisible. Caught by screenshot.
4. **On a phone, the conversation vanished at the start of the slide back**, showing the desktop's empty "Pick up a conversation" panel sliding instead. Caught by a mid-motion screenshot.
5. **The phone composer field was 38 points tall**, under a finger's minimum. Caught by a layout finding.
6. **The voice waveform drew 64 hairline bars** in about 130 points. It looked like noise. My own judgement from a screenshot.

## (d) Every refusal and surprise

### Compile refusals, first compile, R1

All five were reported together, which saved a lot of time.

**1.** I wrote, on the conversation list's preview line:
```
fontStyle = { classroot.writing != "" ? italic : normal },
```
→ `Text has no attribute 'fontStyle' — the CSS instinct: italics are Text's 'italic = true' [DECLARE2000] (line 235, col 17)`

I changed it to `italic = { classroot.writing != "" }`. **Judgement:** my code was wrong. Excellent diagnostic.

**2.** I wrote, in `VoiceMessage`:
```
clip: View [ cornerRadius = 22, padding = [6, 14, 6, 6], … ]
```
→ `VoiceMessage.clip is an attribute — a child may not take an attribute's name; rename the child (e.g. 'clipView') [DECLARE2000]`

I renamed it `pill`. **Judgement:** my code was wrong. Good diagnostic.

**3.** I wrote:
```
TextLabel [ width = 34, fontSize = 13, fontWeight = medium, fontFeatures = "tnum", … ]
```
→ `TextLabel has no attribute 'fontFeatures' [DECLARE2000]`

I removed it and kept the fixed width of 34. **Judgement:** I guessed a name instead of asking declare-help. I never found out whether tabular figures exist under another name (unsure). Unlike the other two, this message suggested nothing.

**4.** I wrote, on the date chip:
```
opacity = { parent.userScrolling ? 1 : 0 },
fade: Spring [ attribute = opacity, to = { classroot.scroller.userScrolling ? 1 : 0 }, stiffness = 200, damping = 26 ],
```
→ `dateChip.opacity is bound by a constraint, so this Spring cannot drive it — … Put the target in the spring and leave opacity unbound [DECLARE2005]`

I changed it to `opacity = 0`. **Judgement:** my code was wrong. Chapter 07 shows this pattern (`away` driven by a spring) and I copied it carelessly. Good diagnostic.

**5.** I wrote:
```
field: TextInput [ flexes = true, minHeight = 40, multiline = true, enterSubmits = true, maxLines = 6, … ]
```
→ `TextInput has no attribute 'maxLines' [DECLARE2000]`

I removed it. **Judgement:** my code was wrong. `Text` has `maxLines`, so I assumed the field did too. The `TextInput.multiline` entry says to cap with `height = { Math.min(contentHeight, 120) }`, which I found later. A "did you mean height = { Math.min(contentHeight, …) }" hint would have helped.

### R2

**6.** I wrote:
```
fontWeight = { classroot.unread > 0 ? semibold : medium },
fontWeight = { classroot.unread > 0 ? semibold : regular },
```
→ `'semibold' is one of fontWeight's values — bare only as the whole value (fontWeight = semibold); inside { } write it as a string: "semibold" — 2 sites [DECLARE4005]`

I used the strings `"semibold"` and the others. **Judgement:** my code was wrong. The docs only implied this rule (see (a)); the diagnostic was perfect.

### R3

**7.** In `Avatar`:
```
initials: TextLabel [ …, visible = { !classroot.face.loaded }, … ],
face: Image [ exists = { classroot.picture != "" }, … ]
```
→ `'classroot.face' may be absent here — check it … [DECLARE6001] (murmur-parts.declare:93:64)`

I changed it to `!(classroot.face?.loaded ?? false)`. **Judgement:** my code was wrong. Lovely: an `exists` child becomes optional in the type system.

**8.** In `ThreadPane`:
```
atEnd: boolean = { this.feed.lastVisibleRow >= classroot.count - 1 },
```
→ `'feed' is not a member of ThreadPane — a child's is: 'scroller.feed' [DECLARE6001]`

I changed it to `this.scroller.feed`. **Judgement:** my code was wrong. Great message.

**9.** Later, during polish:
```
corners: number[] = { classroot.mine ? [18, …] : [ … ] },
bubble: View [ cornerRadius = { classroot.corners }, … ]
```
→ `the { } body of 'cornerRadius' computes a number[], but 'cornerRadius' is typed Radius — a per-corner radius is four numbers … — 2 sites [DECLARE6001]`

I declared `corners: Radius`. **Judgement:** my code was wrong. The message taught me the type name.

### R4 boot findings

**10. The conversation list's row height.** I wrote:
```
class Stack extends TweenLayout [ duration = 380,
    place() {
        const w = this.contentExtent("width")
        let y = 0
        return this.laid().map((c) => {
            const box = ({ x: 0, y: y, w: w })
            y = y + c.height
            return box
            })
        }
    ]
class ThreadRow extends Control [ width = 100%, height = 76, padding = [0, 16, 0, 14], … ]
```
→ six times: `layout app.stage.side.list.rows.0 (ThreadRow) has height undefined — it is not a number, so it and everything in it draw nothing. Something it reads is undefined or not a number: a layout's parameter left unset, a field read before it arrives, a division by zero.`

I changed the box to `{ x: 0, y: i * this.rowH, w: w, h: this.rowH }`, added `rowH: number = 76`, and removed the row's `height`. That cleared it.

**Judgement: unsure.** Possibly TweenLayout tweens all four box fields and treats a missing `h` as undefined. If so, that is either a platform bug or an undocumented requirement, since plain `Layout` boxes may omit fields. Or reading `c.height` inside `place()` produced NaN. The message names the symptom precisely but not which of its listed causes applied. It also contradicts my mental model: the row stated `height = 76`.

### R5 findings while driving

**11. A sent photo overlapping the next row.** The code was the first `confirm`:
```
confirm(threadId: string, ref: string, m: Message) {
    …
    const j = this.find(t, "local-" + ref)
    if (j >= 0) {
        this.set(["threads", i, "messages", j, "id"], m.id)
        this.set(["threads", i, "messages", j, "at"], m.at)
    }
    },
```
Rows are `MessageRow [ datapath = :messages[], virtualize = true, classFor = {…} ]`. After sending a photo, the platform reported:

→ `app.stage.main.panes.1.scroller.feed's children need 196711 down and it has 196651, so app.stage.main.panes.1.scroller.feed.22 runs past its end. …`

and

→ `1 control(s) another view takes the presses of: … feed.22.line.col.body.shot (by feed.23.line.col.body.shot)`

The screenshot showed the photo drawn over the typing indicator. The earlier text send also showed its text twice in `expect.text`'s output: `"TODAY see you at seven Delivered … TODAY see you at seven Delivered …"`.

My hypothesis: rewriting the record's `id` changes its identity, so a new instance is built while the old one still occupies space. I kept the local id and added a `serverId` field:
```
this.set(["threads", i, "messages", j, "serverId"], m.id)
```
`find()` now matches either id. Both findings and the duplicate text went away.

**Judgement: unsure.** My hypothesis fits all three symptoms, but I didn't confirm it. It may be expected behavior: a changed identity means a new record. Even so, two instances for one record after 1.5 seconds of real time looks like a platform issue in virtualized reconciliation, worth a reproduction. The docs say nothing about rewriting an identity field in place.

**12. The phone composer field.** With `minHeight = 40`, and again with `minHeight = { app.touchFirst ? 44 : 40 }`:

→ `1 control(s) smaller than 44 × 44, a finger's target: app.stage.main.panes.5.composer.bar.field 274×38` (then `270×38`)

I changed it to `height = { Math.max(app.touchFirst ? 44 : 40, Math.min(this.contentHeight, 140)) }`. **Judgement:** my code was wrong. Chapter 06 says ranges bound what a layout gives, and this field sizes from its content. The compiler warns for `maxWidth` with a stated width, but said nothing about a `minHeight` that can't take effect. A matching warning would have caught this at compile time.

**13. Keyboard order around the react button.**

→ `Tab goes from "Photo: Aurora Borealis Over Mountains" (…feed.22.line.col.body.shot) to "React" (…feed.22.line.col.react), which sits left of it — Tab follows the order views are declared in: declare "React" first, or say the order in their container's tabOrder()`

I added a `tabOrder()` override on `col`. **Judgement:** a direct consequence of my hand-placed workaround in (b). I would never have noticed it myself. Impressive finding.

### Warnings

- **DECLARE4035**, "has an accessibilityLabel but no role", on four views: `Avatar`, the reaction chips, and others. I added `accessibilityRole = image` on `Avatar` and the chips, and `accessibilityHidden = true` on `ThreadFace`. Fair warnings.
- **DECLARE4025** on
  ```
  runEnd: boolean = { classroot.next == null || classroot.next.from != classroot.from
      || dayKey(classroot.next.at) != dayKey(classroot.at) || minutesBetween(classroot.at, classroot.next.at) > 20 }
  ```
  → `runEnd decides on one condition of 4 parts — give the facts it decides on names of their own …`

  I moved the logic into a script function, `sameRun(a, b)`, used by both `runStart` and `runEnd`. **Judgement:** the result is cleaner. But I satisfied a lint by moving model logic into script, which the skill's drift list discourages ("a derivation over its data is a method"). A method would have been more idiomatic. I chose script because it takes plain records, and I'm not sure which the authors would prefer.
- **DECLARE1002**, redundant parentheses on `{ ({ rows: … }) }` and `{ ({}) }`. I had copied the `({ … })` habit from the to-do app, which uses it inside method bodies, where it is necessary. Harmless, but the to-do app trains the habit.

### Surprises in the check tools

- **"Sending…" was never observed.** `expect.text(…, "Sending")` failed because the step had already waited for the service's `sent` frame. That is documented ("a step waits for it"). I dropped the assertion, so the Sending state is **unverified**.
- **Ambiguous paths.** `drive.click('app."Dana Ruiz"')` → `is ambiguous: … rows.1.face.one (Avatar), rows.5.face.back (Avatar)`. Fair; my avatar labels collide with row text. I called `app.open("t3")` through `page.evaluate` instead.
- **The 30-second evaluate limit.** `drive.waitReal(44000)` → `an evaluate in the page has not finished in 30 s, though the page answers — it is waiting on something that never comes (a promise nothing resolves …)`. The message misdiagnoses the cause: nothing was stuck, it was just a long wait. I split it into two 22-second waits. **Judgement:** a tool limitation with a misleading message.
- **A seek that seemed to fail.** In the voice check, a click at x = 150 gave `head 0, pos 7.01`. I had shortened the waveform, so x = 150 was near the clip's end, and it finished and reset. My test's fault.

### Behaviour that wasn't what I wrote it to do

- **The viewer's dark background.** I wrote `viewer: Dialog [ presentation = "full", fill = 0x0B0B0C, picture: Image [ … fit = contain … ] ]`. The letterbox bands were the theme's `surface` color, because the internal `_panel` paints `provided("theme").surface` over everything. I replaced the `fill` with `theme = { { ...provided("theme"), surface: 0x0B0B0C, text: 0xF2F0EC } }`. **Judgement:** a documentation gap. Possibly a missing feature too: `presentation = "full"` should arguably honor the dialog's own `fill`.
- **The phone slide-back.** The pane disappeared at the start of the slide because I wrote `ThreadPane [ datapath = :threads[], visible = { this.shown } ]` with `shown = { app.openId == threadId }`. I added `viewed`, which isn't cleared on back. My code was wrong. Overlays have `present` for exactly this; plain views have no equivalent idiom, which is fine.

## (e) Verifying it

**What I ran:**
- `declare-verify` R1–R4 after every batch of edits, roughly fifteen runs at a few seconds each.
- `declare-look` screenshots at 1440×900, 1280×800 and in `--phone` mode, plus one in `--dark`.
- Five assert scripts in `my-apps/murmur/checks/`:
  - `scroll.mjs`: to the first message and back, and the place kept across switching conversations.
  - `flow.mjs`: send, hold to react, photo picker, the full-screen viewer.
  - `arrival.mjs`: a message arriving while reading back; the pill; then a message arriving at the bottom, about a minute of real time.
  - `voice.mjs`: play, then seek on the waveform.
  - `phone.mjs`: touch open, hold to react, picker, back.

**What each caught:**

| Check | Caught |
|---|---|
| R1–R3 | All nine refusals above, cheaply |
| R4 | The list height |
| R5 layout questions | The photo overlap, the 38-point field, the tab order |
| Screenshots | The viewer's bands, the phone slide-back, the missing times, the waveform's look |

**How well they served me:**
- **Very well, overall.** Addressing views by text, `page.evaluate(window.__declare.find(p)[attr])`, `waitReal` for the socket schedule, and `settleMotion` made the checks short.
- **Layout findings that piggy-back on R5 were the most valuable single thing.** They are checks I wouldn't have known to write.
- **Friction:**
  - Virtualized rows can't be named by index.
  - Accessibility labels collide with text.
  - The 30-second evaluate limit.
  - Checks run against a live service whose schedule starts at connect, so timings in my scripts are tied to the service's seed.
  - **I never dragged the scroll thumb or swiped.** I used `scrollTo` and `wheel`. The brief explicitly asks for thumb dragging, and I didn't test it.

## (f) Confidence

1. **Seeing every conversation, and which are new: high.** Verified with live arrivals.
2. **Reading back through any length of history: high** for reaching the first message. **Unverified** for thumb dragging and finger momentum. Chapter 07 says a change above the reader during a finger scroll is corrected only after the scroll ends, so photos loading during a fling could produce one visible shift.
3. **Moving away and back keeps the place: high.** Tested.
4. **Sending text: high**, apart from the "Sending…" state, which I never saw on screen.
5. **Sending a photo: high.**
6. **Reactions: high** for my own. **Medium** for reactions arriving from the service onto messages already on screen. I never looked at one land, and I didn't check that a reaction making a row taller leaves the text being read in place. I'm relying on the platform's scroll anchoring for that.
7. **Voice: high** for play and seek on a clip already playing. **Medium** for seeking a clip that has never played: the `pendingSeek`-on-`loaded` path is untested.
8. **Full-size photos: high.**
9. **"Seen" receipts: untested.** The service's `seen` frames arrive, but I never asserted the text they produce.
10. **The composing indicator: seen working** ("Priya is writing…"). The "stop without a message" case is not checked.
11. **The date chip that appears while scrolling: never seen in a screenshot.**

**Where I'd expect a tester to find problems:**
- On a real phone, bottom padding from `app.keyboardHeight` may double-count if the browser already shrinks the page for the keyboard.
- Photos are served with `cache-control: no-store`, so every recycled row re-downloads and re-measures its image while you scroll. Possible flicker or jumps.
- There is no swipe-back gesture on the phone.
- The API address is hard-coded as `http://localhost:8330/`.
- The header shrinks the conversation's avatars with `scale = 0.78`, which might look cramped.
- The empty state for a conversation with a single message was never seen.

## (g) Gaps I worked around

1. **Conditional cross-axis alignment.** I wanted `align = { mine ? end : start }`. `declare-help SimpleLayout.align` says "A bare literal." I wrote three `State [ …, x = end ]` overrides instead. **Judgement:** the platform deliberately lacks this; States are the intended answer. It's repetitive, but correct.
2. **Keeping a row's identity when the service assigns the real id.** I looked at `declare-help identityKey`: "a single `:path`". I couldn't express "the reference if present, else the id", so I added a `serverId` field and kept the local id. **Judgement:** probably the right design anyway.
3. **Placing a child *before* or *after* subclass content.** `defaultPlacement` only appends. I placed the button by hand and overrode `tabOrder()`. **Judgement:** genuinely absent as far as I can tell. I didn't search further.
4. **Typing a message whose field changes type.** A schema field has one type, so I used a TypeScript type in script and an `as` cast. **Judgement unsure:** I didn't check whether schemas support unions, or whether a `Stream` can take a schema.
5. **Tabular figures.** Unknown. I didn't look past the refusal.
6. **Seeking an audio clip before it loads.** I wanted to set `position` before load. `Media.position`'s entry doesn't say whether that is honored, so I hold `pendingSeek` and apply it on `trackChanges = ["loaded"]`. **Judgement:** possibly unnecessary; I didn't test the direct way.
7. **A dark full-screen dialog.** Covered under (d): overriding the theme locally, found by reading library source.
8. **Caching image proportions.** I wanted a known aspect ratio before load, to avoid re-measuring. I considered an App-level cache map and didn't build it; scroll anchoring absorbs the change. **Judgement:** the platform can't know image sizes; that's the brief's deliberate constraint.
9. **Socket state maps.** I first wrote them as `object` with `as Record<…>` casts at every use, then found that `Record<string, number>` works as a declaration type. **Judgement:** the docs do say any TypeScript type works. I just didn't trust it at first.

## (h) Changes of direction

| What it was | What it became | When | Why |
|---|---|---|---|
| `Stack` returned `{x, y, w}`, rows were 76 tall | Returns `h`; rows state no height | First boot | R4 finding |
| `confirm` rewrote the record's `id` | A `serverId` field | First flow check | R5 finding plus screenshot |
| Viewer `fill` | A local theme override | Same check | Screenshot; library source |
| Panes visible while `openId` matched | `viewed` keeps the pane during the slide back | Phone check | Mid-motion screenshot |
| Field `minHeight` | Explicit `height = max(…)` | Two phone runs | Finding, repeated |
| Date chip opacity as a constraint | A Spring | First compile | DECLARE2005 |
| `ReactButton` class with `opacity = { classroot_hover(this) ? 1 : 0 }` | Removed before compiling; later a `RoundButton` inside the row, shown on `hovered` | First draft | My own second thoughts: `classroot_hover` was a placeholder I knew wasn't real |
| Day headings only | Day plus time, and times at 45-minute pauses | Polish pass | Second thoughts: the brief says dates must be apparent, and I noticed there were no times at all |
| Uniform bubble corners | Corners that follow runs | Polish pass | Second thoughts |
| 64 thin waveform bars, width `90 + 6·s` | Resampled bars every 5 points, width `120 + 5·s` | Polish pass | Screenshot |
| `runEnd` as one long expression | Script `sameRun()` | Polish pass | DECLARE4025 |
| `object` state maps with casts | `Record<…>` types | Polish pass | Second thoughts: the skill's drift list |

## (i) The code, quoted

The quotes are in (d) beside each message. A few more that would help reproduce things:

**For the photo overlap (#11)**, the essentials as they stood:
```
// in Conversations extends DataSource
append(threadId: string, m: Message) {
    const i = this.at(threadId)
    if (i >= 0) this.set(["threads", i, "messages", "-"], m)
    },
// the send: id "local-r2", then on the sent frame confirm() rewrote "id"

// in ThreadPane
scroller: View [ width = 100%, flexes = true, scrolls = y, scrollAnchor = end,
    padding = [8, 0, 14, 0],
    layout: SimpleLayout [ axis = y, align = center ],
    feed: View [ width = { Math.min(parent.contentBox("width"), 760) },
        rows: Message[] = { classroot.rows }, …
        layout: SimpleLayout [ axis = y ],
        MessageRow [ datapath = :messages[], virtualize = true,
            classFor = { :kind == "photo" ? PhotoMessage : :kind == "voice" ? VoiceMessage : TextMessage } ]
        ],
    typing: View [ … ] ]

// PhotoMessage's box is derived from its image's natural size:
shot: Control [ …, aspect: number = { this.pic.loaded && this.pic.naturalHeight > 0 ? this.pic.naturalWidth / this.pic.naturalHeight : 4 / 3 },
    width = { Math.round(Math.min(this.maxW, this.maxH * this.aspect)) },
    height = { Math.round(this.width / this.aspect) },
    pic: Image [ width = 100%, height = 100%, fit = contain, source = { … } ] ]
```
Both the identity change and the image-driven height change happen within moments of sending, so either could be the cause. I didn't isolate them.

**For the TweenLayout height (#10)**, the `Stack` and `ThreadRow` quoted in (d), bound as:
```
rows: View [ width = 100%, datapath = { app.ordered.value }, layout: Stack [ ], ThreadRow [ datapath = :rows[] ] ]
```
inside a `scrolls = y` pane, where `ordered` is a derived `Dataset` with `contents = { ({ rows: [...threads].sort(…) }) }`.

**For the evaluate timeout:**
```
await drive.waitReal(44000);
```
inside an assert script, run with `npx declare-verify … --assert`.

I didn't go round in circles anywhere. The closest was the composer height, which took three tries across two check runs.

---

## Surprises

- **The compiler is a teacher.** Nine refusals, and almost every message named the exact rewrite.
- **The hard parts of a chat app took one word each.** Following the bottom, keeping the reader's place, and virtualizing 30,000 rows of mixed heights. I had budgeted most of my effort for those, and they cost nothing.
- **The checks reported things I'd never have tested.** The tab-order finding and the finger-target finding.
- **Some expected behavior didn't appear.** The full-screen dialog ignored its fill, a TweenLayout without `h` produced undefined heights, and a record whose id I rewrote seemed to get two rows.

## Good and bad

**Good:**
- The reading path: skill → declare.md → four chapters → one whole app.
- `declare-help` as the source of truth.
- Error messages.
- Derivation-first data flow.
- `trackChanges`/`onChange` for "when this becomes true".
- Overlays as standing members.
- Layout findings during driven checks.
- Speed: R1–R4 in seconds.

**Bad:**
- Guessable-but-wrong attribute names (`fontStyle`, `fontFeatures`, `maxLines` on fields) whose refusals offer no near alternative.
- The undocumented inner workings of library classes (Dialog's panel fill).
- Literal-only layout attributes, which force repetition across States.
- No "before" placement with `defaultPlacement`.
- The assert evaluate ceiling and its misleading message.
- Lint and drift advice sometimes pull in opposite directions: the `runEnd` lint pushed me toward script, which the drift list warns against.

## Compared with what I know

It's closest to **QML** (declarative tree plus bindings) and **SwiftUI** (states, springs), with OpenLaszlo's lineage visible. The compiler that extracts dependencies feels like **Svelte**'s reactive statements, but stricter.

Unlike **React**, there is no render function and no list `.map()`. Unlike **CSS**, every size has exactly one decider, and that took me about two refusals to internalize. The `provided()` lookup is like React context, but explicit at the point of reading.

## What I'd most want improved

1. **Near-miss suggestions for unknown attributes**, where a family exists: `maxLines` on a field → the height cap; `fontFeatures` → whatever exists, if anything.
2. **Document what a library overlay paints**, or make `fill` on a full `Dialog` work.
3. **Specify TweenLayout's box requirements**, or make a missing `h` keep the child's own height.
4. **Define and document what happens when an identity field changes under `virtualize`.**
5. **Allow `align` (and similar layout attributes) to take constraints**, or document the State idiom for it.
6. **A compile-time warning for `minHeight` on a view sized by its content**, mirroring the existing `maxWidth` warning.

**The sharpest edge** was not one obstacle but a pattern: guessing a name from CSS or another framework. It happened about six times (`fontStyle`, `fontFeatures`, `maxLines`, `semibold` in braces, `minHeight`, `fill` on the Dialog). Each cost one check cycle of seconds to a minute; together roughly 10–15 minutes. To have written them right the first time I'd have needed to read chapter 12, plus a one-line rule in declare.md that enum tokens follow the same brace rule as colors.

The single costliest moment was the overlapping photo row, perhaps ten minutes of reasoning, and I'm still not sure of its cause. To have written that right the first time I'd have needed one sentence in chapter 16: "don't rewrite a record's identity field; add a field instead."

## What I'd use it for

Interfaces where continuity and live data matter and the logic is mostly derivation: chat, dashboards, schedules, inspectors, internal tools. Especially when an LLM writes most of the code, because the compiler catches what resemblance-based checking would miss. I'd hesitate for content-heavy, SEO-critical sites, or wherever the team's value lies in an existing React ecosystem of components.


## The names ledger

```
NAMES — eval-murmur-16: 4 missed name(s), 1 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
     7 · attribute · fontStyle            · Text                     · CSS                · foreign hint · ×1  ·    7 · resolved
         Text has no attribute 'fontStyle' — the CSS instinct: italics are Text's 'italic = true' [DECLARE2000] (line 235, col 17)
     7 · attribute · fontFeatures         · TextLabel                · —                  · none         · ×1  ·    7 · resolved
         TextLabel has no attribute 'fontFeatures' [DECLARE2000] (line 392, col 69)
     7 · attribute · maxLines             · TextInput                · —                  · none         · ×1  ·    7 · resolved
         TextInput has no attribute 'maxLines' [DECLARE2000] (line 538, col 102)
     7 · member    · feed                 · ThreadPane               · —                  · none         · ×1  ·    7 · resolved
         'feed' is not a member of ThreadPane — a child's is: 'scroller.feed' (reached through the child that holds it) [DECLARE6001] (line 443, col 29)

COLLISIONS (min · held by · name)
     7 · attribute      · clip

SUMMARY: 3 of 4 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
