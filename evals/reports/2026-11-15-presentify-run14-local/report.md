# Presentify run 14: Opus 5.5, Declare, on the local tree, standard

Run after the fix round (DT: Presentify surfaced most of it), before the minimal round. **38.1
min, 146 turns, 194k output tokens** (70k thinking). Not scored: the audit is the result.
Timing record: `evals/timings/2026-11-15-presentify-run14-local.txt`.

## 1. The comparison

| | 8 | 9 | 10 | 12 | 13 | **14** |
|---|---|---|---|---|---|---|
| total | 41.7 | 43.0 | 51.3 | 35.0 | 50.8 | **38.1 min** |
| turns | 142 | 143 | 153 | 134 | 177 | 146 |
| output tokens (thinking) | 188k (62k) | 217k (84k) | 221k (93k) | 185k (65k) | 212k (78k) | 194k (70k) |
| reading · checking | 7.2 · 34.5 | 3.8 · 39.2 | 4.4 · 46.9 | 7.6 · 27.4 | 2.8 · 48.0 | 4.4 · 33.7 |
| tool time · model time | 13.6 · 28.2 | 10.4 · 32.6 | 17.9 · 33.4 | 7.2 · 27.8 | 18.3 · 32.4 | 8.6 · 29.5 |
| verify calls · help · images | 39 · 14 · 32 | 38 · 15 · 21 | 55 · 8 · 27 | 41 · 10 · 24 | 58 · 9 · 45 | 43 · 8 · 28 |

- 12.7 minutes faster than run 13, at the same pace; four scripts (`assert`, `more` 44
  assertions, `scale`, `look` ~23 screenshots). **Code:** 3,305 lines in 8 Declare files.
  **Download:** 216 KB gzip. No source reads.

## 2. What the fix round changed here

| Recurring misstep (runs 10–13) | Run 14 | Why |
|---|---|---|
| A home-made type for `afterDelay`'s handle | **Gone:** `timer: DelayHandle? = null` | `afterDelay`'s signature now names `DelayHandle` |
| Delete as the dialog's default, unmarked | **Gone:** `destructive: true`, Cancel the default (presentify.declare:310) — the first run | It looked up `Dialog.buttons` after a screenshot of its dialog |
| Menu keys spelled Mac-only, a string switch on `id` | **Recurs:** `key: "⌘X"`; `picked(id) { app.run(id) }` | It never opened `Menu.items` |
| Colors typed `string` in schemas, cast at each use | **Recurs, for a new reason** (below) | It followed the hint, and `Color` failed it as data |
| The interaction-only constraint cycle | Not seen | — |
| Hidden-focus message | Met twice; it called the message "great" and fixed its code | — |

**Colors, run to its cause** (account, d10–d11). The R4 refusal said "a schema field that holds a
color is typed Color", and the agent did it: `background: Color` in its schemas. R3 then refused
code that treats colors as data — `uniq(this.shapes.map((e) => e.fill ?? "none"))` with
`uniq(xs: string[])`, the inspector's "Mixed" logic — because in code a `Color` field is the whole
union: a number, a hex string, 140 names, `null`. It reverted to `string` with
`paintOf(c, fallback) as Color` (slide-art.declare:25–119) and a hand-written `lightness()`
(editor.declare:246). Its own words: "A colour typed `Color` is hard to treat as data." **For DT:**
a schema field typed `Color` holds what the data carries — a hex string — so it could read in code
as exactly that (`` `#${string}` ``, with `null` when optional): assignable to every color slot,
and a string for comparison, sets and `uniq`.

## 3. Findings for the platform

1. **A Control's click did not fire when the point lay over descendants that declared handlers,
   even under `pointerEvents = "none"`** (account, d13; the run's worst cost, ~20 min). A deck
   card (`Control`, `press()`) held a slide picture whose element views declared `onPointerDown`,
   `onDoubleClick`, drag handlers and `onContextMenu`, with `pointerEvents = { live ? "auto" :
   "none" }` (false on a card). A click on a card's centre over shapes: `pressed` and `hovered`
   true, `press()` never ran; over empty background it opened. The agent moved all handling to the
   stage and `viewAt`. **To run to ground** — likely a real routing bug.
2. **A group view sized by children outside its box** spanned the whole slide and covered its
   siblings for `viewAt` (d14) — `viewAt` is the drawn view, as ruled; the agent set the group's
   size to 0. Correct behavior; the guide 9 sentence added this round covers it.
3. **`Dialog.open`'s tone took `"danger"` silently** (d25): the tone is `"error" | ""` but typed
   `string`. A union type would refuse it.
4. **`Box` is a Declare type the checker didn't flag as a schema name** — the agent renamed it
   pre-emptively (d3); to check.
5. **⌘Z in a focused number field undoes the field, not the document** (d20) — correct, and a trap
   for an editor: worth a sentence where undo is taught, or a rule that a field with nothing to
   undo hands the key on.
6. Repeated asks: schema optionals as `T | null | undefined` in script (now in guide 15 — the agent
   read chapter 4 instead); a colour well; a document undo manager; a write queue with retry.

## 4. Is it idiomatic Declare?

| | Run 13 | Run 14 |
|---|---|---|
| code | 2,621 lines Declare | 2,573 lines Declare |
| lines over 150 characters | 33 | 22 |
| colour literals outside theme declarations | 86 | 51 |
| theme reads | 113 | 109 |
| States | 4 | 2 |
| visible switches | 1 | 4 |
| browser scripts · page lookups | 0 · 0 | 0 · 0 |

The shape is the one runs 12–13 had (a `Dataset` document, `History`, `Sync`, one `SlideArt` for
every surface, verbs wrapped in one undo step, `unsavedChanges` found by `declare-help leave`,
`errorSchema = Refusal` now used — one cast left for a field the schema lacks, model.declare:676).
Its missteps are the two recurring rows above, bare hex and named colours inside braces (~10
sites, one compile round), and the in-app clipboard where `onClipboardCopy`/`onClipboardPaste`
exist (the agent's own note).

## 5. Names

Misses: `history` (host hint → location/waypoint), `alert` (status hint). Collisions: `TextStyle`
(Declare's type), `fill` (an attribute). Lookups that missed, all answered: `fullscreen` →
App.fullScreen, `leave`/`onLeave` → App.unsavedChanges.

## 6. The agent's account

Asked after the build by resuming the session read-only; 17k output tokens, 467k cache reads.

# Building Presentify in Declare: an account for the people who make Declare

I changed nothing for this. Everything below is reconstructed from this session. The quotes are as exact as I can make them; where I'm reconstructing from memory rather than from output I still have, I say so.

---

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`, then `task/brief.md` and `task/api/API.md`.
2. `skill/SKILL.md` and `AGENTS.md`.
3. `docs/declare.md`, whole.
4. Guide chapters `01-what-declare-is.md`, `04-structure.md`, `05-run-and-check.md` and `06-layout.md`, whole.
5. `apps/todo/todo.declare` and `todo-parts.declare`, whole.

That is exactly the reading list SKILL.md prescribes, and I followed it. After that I read on demand:
- `09-pointer-and-keyboard.md`, whole.
- `14-data.md`, whole. It was too long for my tool's output, so I read it from the saved file.
- `18-overlays.md`, `21-motion.md` and `23-animated-arrangements.md`.
- `docs/operational/verify.md`, whole.
- The first halves of `12-text.md` and `08-controls.md`.
- The "Provided values" section of `11-paint-and-themes.md`.
- Lines 425–530 of `apps/desktop/desktop.declare` (window drag and resize), found with `declare-help map`.

I also ran about 30 `declare-help` lookups. These included `Stroke`, `Icon`, `View.cursor`, `Popover`, `Segmented`, `Switch`, `ClipPath`, `TextInput`, `"theme tokens"`, `MenuBar --all`, `rootBounds`, `Layout`, `Dialog.buttons` and `App.fullScreen`. One of them was "leave", which found `App.unsavedChanges`.

**What I skipped, and why.** I skipped chapters 02, 03, 07, 10, 13, 15, 16, 17, 19, 20, 22 and 24–31, and the tracker and calendar apps. The reason was context budget: SKILL.md says "then stop reading", and I trusted the compiler to catch the rest.

I meant to read the calendar's `Drag` class and never did. In hindsight these would have paid:
- **17 (your own views).** It covers drawing and when a View versus a Control takes presses. My worst bug was in exactly that territory.
- **16 (collections).** It covers TweenLayout arrivals, which surprised me in a test.
- **15 (schemas).** It might have told me that schema types are visible inside `script`; I found that out by trying.

**What taught me the most:**
1. `declare.md`, which was dense and well-ordered.
2. The todo app. It showed the real idioms: a `Dataset` subclass, `classFor`, `TweenLayout` (via `Glide`), `Shortcuts`, `Sheet`/`Popover`, and `trackChanges`/`onChange`.
3. Above all, the compiler's messages. Nearly every one named its own fix.

**What was missing or misleading:**
- **`classFor`.** `declare.md` shows `classFor = { :kind == "heading" ? Heading : Item }`. Nothing I read said it may not call a method; I learned that from DECLARE4000.
- **Schema types inside `script` blocks.** I found by experiment that they are usable there. Knowing that up front would have saved a round of 39 type errors.
- **Name clashes with built-in types.** My `TextStyle` and `Box` collided with built-ins. The compiler caught `TextStyle`; I caught `Box` only because I happened to read `Layout.place(): Box[]` in `declare-help`.
- **Method parameters.** I didn't see it stated that they can't have default values.
- **Which views receive a press.** Section 8 says "a view takes the pointer when it has declared an interest in it" and lists `pointerEvents = "none"` as the third tool for presence. It doesn't say what happens to a subtree whose views declare handlers but are `pointerEvents = "none"`. That is where my worst bug lived (see (d)13).

## (b) Expressing what I wanted

**Where the language fit my intent:**
- **Rendering a slide at any scale.** One `SlideArt` view, 1280×720 with `scale = s`, serves the stage, the thumbnails, the home cards and the presenter. The guarantee that "every reader agrees on the one geometry" under `scale` made this trivial and exact.
- **Recursive group rendering.** A `GroupEl` replicates `ElementView [ datapath = :children[], classFor = … ]`, and it worked on the first run.
- **Selection handles that follow what they hold.** Every handle position is a constraint on `app.ed.box`, which is derived from the document. During a drag I write the document on every move, and the handles, the thumbnail and the inspector all follow with no extra code.
- **Motion.** The editor growing out of the card is one spring (`openT`) and four constraints. The conflict bar sliding down is one spring. The slide list glides by subclassing `TweenLayout`.
- **Library pieces.** `Popover`, `Dialog.open(...)` with destructive buttons, `Toast`, `ContextMenu`, and `MenuBar` (its item keys become the program's shortcuts) saved a great deal of work.
- **Others.** `App.unsavedChanges`, `App.fullScreen`, `afterDelay` returning a cancellable handle (my debounce), and `DataSource` with `errorSchema`, `statusCode` and `errorBody` (my 409 conflict path).

**Where I had to work around it:**
- **The save engine.** It is imperative: one `DataSource` (`req`) whose `url`, `method` and `body` I set before each `fetch()`, a hand-written queue in `pump()`, and `onLoad`/`onError` dispatching on a `job` string. It works, but it's the least declarative part of the program, and `req.value` is untyped because one source serves five response shapes. I cast it (`v.slide as Slide`, `v as Deck`).
- **Element press handling.** It ended up on the stage, using `viewAt` and `instanceof Shape`, because I couldn't make handlers on element views inert in thumbnails (see (d)13).
- **Colours.** The service sends colours as strings, and I kept them as strings, so every place a colour is painted calls a script coercion: `paintOf(c, fallback) as Color`.

## (c) The first time it ran

The first full run, a screenshot of home at 1440×900, looked right. Then:

1. **Clicking the first card did nothing.** The second and third cards opened their presentations. I found this with `declare-look --click … --read app.location`, which read `""`. I then narrowed it with `--js` calls to `viewAt` and with a stepwise `drive.press`/`drive.release` script, which reported `pressed` true but `press()` never ran. Details in (d)13.
2. **Opening by setting `app.location="d1"` worked,** but the console warned that `Focus.focus(app.editor.body.stage)` landed on a hidden view. The editor was only visible once the spring passed 0.005.
3. **Tab order.** The layout check said Tab went from Present to Select, which sits to its left.
4. **In the first full scenario run:**
   - two buttons matched the name "Align centre";
   - at 1280 wide, the centred tool palette covered the "Slide" menu title;
   - with the service down, the status text ran under the menu bar;
   - during a conflict where the person had no unsaved changes, the status said "All changes saved". That was accurate in that case, but the same logic would have said it while a slide's changes were held back. That was my bug.
   - a long title was cut off mid-letter in the title field.

I found every one of these with `declare-look`, verify's layout findings, assert-script failures, or by reading screenshots from my own `look.mjs`.

## (d) Every refusal and surprise

1. **classFor calling a method.**
   - Wrote: `classFor = { app.classOf(:kind) }`, with `classOf` an App method returning a class.
   - Said: DECLARE4000, "classFor reads the record and names classes — 'app' is neither … a function in script { } can, … returning the class's name as a string … and use [ RectShape, … ]".
   - Changed to: a script `elementClass(kind)` returning strings, plus `use [ RectEl, … ]`.
   - Judgement: my code, though the docs I read didn't state the rule. The message was excellent.
2. **Schema name taken by a built-in.**
   - Wrote: `schema TextStyle [ … ]`.
   - Said: DECLARE4015, "schema TextStyle takes the name of one of Declare's own types … Rename yours".
   - Changed to: `TextRun`.
   - Judgement: fine. Prefixing user schemas, or namespacing built-ins, would avoid it.
3. **`Box`.** I avoided this clash pre-emptively after seeing `Layout.place(): Box[]` in help, and renamed my schema to `Bounds`. Judgement: the platform should flag this just as it did `TextStyle`. I didn't test whether it would.
4. **Record default without braces.**
   - Wrote: `from: Bounds = ({ x: 0, y: 0, w: 0, h: 0 }),`
   - Said: DECLARE1000, "expected a value, got '(' — a value written bare is a literal; an expression goes in braces".
   - Changed to: `= { ({ … }) }`.
   - Judgement: my code; the docs are clear.
5. **Default parameter.**
   - Wrote: `present(fromStart: boolean = false) {`
   - Said: DECLARE1000, "expected ')', got '='" (line 321).
   - Changed to: a required parameter, with callers passing `false`.
   - Judgement: an undocumented limit, as far as I read. The message didn't name the fix, unusually.
6. **A batch of DECLARE2000 at structure, all reported together, which was helpful:**
   - (a) `const fix = (s: Step) -> Step => …` inside a method: "an arrow function in a body is TypeScript … '->' is for a method's own". My error, carrying over the signature syntax.
   - (b) `revs: object = {},` → "this reads as an object literal … give the object its own braces: { { a: 1 } }". Mine.
   - (c) Bare hex inside braces, e.g. `stroke = { Stroke(1, #FFFFFFE6) }` and `classroot.lift > 0.5 ? #2A1F5A33 : #2A1F5A1F`: "inside { } a color is a string or a number". Mine. It was documented in §2 and I still did it about eight times. This was a pattern; it cost one cycle.
   - (d) `accessibilityRole = alert` → "an alert is `accessibilityRole = status` with `accessibilityLive = assertive`". A good message.
   - (e) A child named `fill: Section [ … ]` → "a child may not take an attribute's name". Mine.
   - (f) `brand: Font [ family = "Bricolage Grotesque", FontFace [ src = … ] … ]` → "'family' names a system font … drop 'family'". I wanted the family name so slide text could refer to it by string. I dropped it, and later removed that font from the slide font list because I couldn't verify a string would reach it. Unsure whether that is possible at all.
7. **`white` inside braces.** `stroke = { Stroke(1.5, white) }` → DECLARE4004, "'white' is a named color — inside { } a color is a string or a number". Mine.
8. **Warnings at the same pass, each fixed:**
   - DECLARE4023: `num: Text [ … text = { "" + (rowIndex + 1) } ]` inside the `Thumb` class reads its own `rowIndex`, not the row's. I changed it to `classroot.rowIndex`. An excellent catch: silently wrong otherwise.
   - DECLARE4022: `IconButton` has `on` but no `accessibilityPressed`. I first added pressed state to every IconButton; that would have announced Undo as a toggle. I then split out a `ToggleButton` class.
   - DECLARE4035: the Stage, and later the conflict thumbnail, had a label but no role.
   - DECLARE4032: `ToolChip` with `accessibilityRole = radio` outside a RadioGroup. I changed it to a pressed toggle. Unsure whether a `ChoiceControl` would have been better; probably yes.
   - DECLARE4020: the "more" button nested inside the `DeckCard` Control. I restructured the card into a View with two sibling controls. Good catch.
   - DECLARE4025 and DECLARE1002 (lint): nested ternaries and redundant parentheses. I fixed four of the nested ternaries, with lookups and one `State`. I left the redundant parentheses alone.
9. **Script type versus schema type (R3).**
   - Wrote, in a script: `type Elt = { id: string, kind: string, x?: number, …, fill?: string | null, … }`, with helpers taking `Elt[]`, called from bodies with schema `El[]`.
   - Said: DECLARE6001, "Argument of type 'El[]' is not assignable to parameter of type 'Elt[]' … Type 'null' is not assignable to type 'number | undefined' — 39 sites". Also "a "rect" | "ellipse" | … is one of a fixed set of words, and this one reached here as a plain string … 25 sites".
   - Changed to: `type Elt = El` and `type Bx = Bounds` inside the script, which worked.
   - Judgement: the docs were unclear. That optional schema fields are `T | null | undefined`, and that schemas can be named in script, both deserve a sentence in §7 or chapter 4.
10. **`Fill` from a string.** `fill = { classroot.value.startsWith("#") ? classroot.value : "#FFFFFF" }` → "computes a string, but 'fill' is typed Fill … type the schema field that holds it `Color`". I cast with `as Color`. See 12.
11. **Boot with sample data.**
    - Said, at R4: "the color "sample" on app.editor.body.film.list.rows.0.pic.0.fill arrived as a string at run time, where only hex is read … a schema field that holds a color is typed Color. Nothing was painted."
    - I followed the advice: `background: Color` and so on in the schema. R3 then produced a cascade: "Argument of type 'Color' is not assignable to parameter of type 'string'. Type 'null' is not assignable…", and the `(number | `#${string}` | "aliceblue" | … 135 more … | "none")[]` error.
    - Reverted to strings and added `paintOf()`.
    - Judgement: partly the platform. A colour typed `Color` is hard to treat as data, because `Color` includes numbers, null, names and "none". And the boot failure was caused by verify's generated sample, though it did expose real fragility.
12. **Click not landing on a card.** Covered in (c)1 and (d)13.
13. **The worst one: cards with element views didn't open on click.**
    - Element views were `class Shape extends ElementView [ … pointerEvents = { classroot.live ? "auto" : "none" }, onPointerDown(…), onDoubleClick(…), onDragStart/onDrag/onDragEnd(…), onContextMenu(…) ]`, used inside a `DeckCard` Control (later the `card` child) with `press() { app.openDeck(…) }`.
    - Clicking card 0 did nothing; card 1 and card 2 worked. `viewAt(244,400)` returned `GroupEl < SlideArt < View < Control < DeckCard`.
    - I added `pointerEvents = { provided("live") ? "auto" : "none" }` to the ElementView base and to `SlideArt`. `viewAt` then returned the `pic` View, which is correct, but the click still didn't call `press()`.
    - A stepwise `drive.press` showed `[pressed=true, hovered=true]`, and after `drive.release()` the location was still `""`. Calling `press()` directly from `--js` worked.
    - The difference between the cards: card 0's centre lies over shapes, a group of ellipses. Card 1's centre is over empty background.
    - I never identified the mechanism. My best guess is that a descendant declaring `onDoubleClick` or drag handlers still claims or delays the gesture even when `pointerEvents = "none"`, so the Control's click resolution never fires.
    - Fixed by removing every handler from element views; the Stage asks `app.viewAt(e.rootX, e.rootY)` and walks up to a `Shape`.
    - Judgement: **the platform looks wrong, or at least undocumented.** Unsure of the exact cause. Cost: about 15–20 minutes and four or five probe runs.
    - What I'd have needed: either a sentence like "handlers declared under `pointerEvents = "none"` still claim gestures", or for them not to.
14. **`viewAt` returning a view with no handlers that covered everything.** After the fix, clicking the sun on slide 1 selected nothing.
    - `viewAt` returned `GroupEl`. A group view with no size takes its size from its children, which sit at slide coordinates, so its box spanned the whole slide. It was declared after the sun.
    - Fixed with `class GroupEl extends ElementView [ width = 0, height = 0, … ]`. The children stay hit-testable outside the zero box.
    - Judgement: my code. The docs do say `viewAt` returns "the deepest visible view". But the interaction with auto-sizing from out-of-box children is a trap, and the press-routing rule (only interested views take presses) differs from `viewAt` (any view). That asymmetry is worth a line in chapter 9.
15. **Focus on a hidden view.** Console: "Focus.focus(app.editor.body.stage): it is inside app.editor, which is hidden (visible is false), so the focus can't stay — focus it once that view is shown". I made the editor visible as soon as `app.open` is true. My code; the message was great.
16. **Tab order.** Layout finding: "Tab goes from “Present” (app.editor.bar.present) to “Select” (app.editor.bar.tools.0), which sits left of it … declare “Select” first". The tools were declared last with `ignoreLayout = true, x = center`. I moved them into the flow between two Spacers. Mine.
17. **Locator matched two buttons.** "page.getByRole("button", { name: "Align centre" }) matches 2 elements". "Centre text" versus "Align centres": name matching is substring by default. I renamed the text-alignment labels. This was in my test, but it also showed two labels were too close for a screen-reader user.
18. **Press covered.** "a press on 'app.editor.bar.menus.Slide' — (560, 29) in the window — would reach 'app.editor.bar.tools.0': it is covered there". The centred tools overlapped the MenuBar at 1280 wide. A real bug; the finding was exact.
19. **Constraint-bound attribute.** "DeclareError: Sync.base is bound by a constraint (Sync.base) — a direct write would be silently overwritten". My test wrote `app.sync.base`; I changed it to write `app.base`. Fine.
20. **Undo after a number field.** "expected values to be 27, got 24 (after: … key Mod+Z)". Focus stayed in the `NumField`, so ⌘Z went to the native field. I added `onEnter() { app.focusStage() }` to NumField. Platform behaviour is correct, but a trap for an editor. Unsure what the best general answer is: perhaps let the app's undo take ⌘Z when the field has nothing of its own to undo.
21. **New slide still hidden.** "'app.editor.body.film.list.rows.1' is hidden (its own visible is false)" right after adding a slide: TweenLayout keeps an arrival hidden until the glide lands. Documented in chapter 23; I added `settleMotion` in the test.
22. **Expect during a spring.** "expected … hidden — it is shown … motion is still in flight (Spring on t …) … drive.settleMotion() runs it to rest". The message named the cause precisely.
23. **`declare-look --js` rejected statements.** I passed `'window.__declare.find(...).press(); return …'` and got "Unexpected token ';'". It takes an expression, so I wrapped the code in an immediately-invoked function. Minor.
24. **Unexplained in my look script.** After `drive.key("Escape")` closed the presenter, `drive.click("app.editor.bar.home")` didn't navigate. Adding `settleMotion` first fixed it, and the same sequence in `declare-look` worked. My guess is that the closing Dialog still held the press, and drive didn't report the target as covered. Unsure.
25. **Dialog tone.** I passed `"danger"` as the tone to `Dialog.open`. It isn't a tone (only `"error"`), and nothing warned me, because it is a string. The fix was `destructive: true` on the button record. Mine; a typed union would have caught it.

## (e) Verifying it

**`declare-verify`, rungs 1–4.** Every compile error above came from here, plus R4's sample-data colour failure and the first-screen layout and accessibility findings. It was fast (a couple of seconds) and its messages were actionable.

**`declare-look --url` against the dev server.** This was my main probe: `--read`, `--set`, `--js`, `--click-at` and `--shot`. It found the card-click bug, the focus warning, and the Tab-order and covered-press findings.

**Behavior scripts (rung 5, `--url`, against the live service):**
- `tests/assert.mjs`: the brief's scenario, 93 steps and 37 assertions. It caught the duplicate label, the overlapping tools and the conflict-bar timing.
- `tests/more.mjs`: 92 steps and 44 assertions. It caught the ⌘Z-in-field trap and TweenLayout's hidden arrival.
- `tests/scale.mjs`: 100 slides and a long title, with `drive.profile`.
- `tests/look.mjs`: 23 screenshots, with no assertions. Reading them caught the status overflow, the truncated title, the misleading conflict status, the delete button being the default, and the selection failure caused by `GroupEl`.

The tools served me very well:
- `drive.press`/`moveBy`/`release` let me picture a drag in progress.
- `drive.wait` moving program time made debounced saves testable deterministically.
- `expect` failures said why: motion in flight, a view hidden, a view covered.
- The report of "writes sent to the live service" was a useful nudge.

**Weaknesses:**
- Failed runs left scratch presentations in the service. My fault, but it twice broke later runs through duplicate names. I added `try/finally`.
- Passing Playwright values back needed `JSON.parse(JSON.stringify(...))` through `page.evaluate`, which I worked out myself.
- I never ran rung 6 (visual baselines), dark mode or touch; none was in scope for a desktop brief.
- Everything was headless. I never used the app in a headed browser, so real fullscreen, real trackpad feel, cursor shapes and tooltip timing are unverified by eye.

## (f) Confidence, part by part

| Part | Confidence | Why |
|---|---|---|
| Presentations: list, open, new, rename, delete with confirmation | High | Driven and asserted |
| Slide list: live thumbnails, add after current, duplicate, delete (not the last), drag to reorder, keyboard | High | Driven |
| Slide shape fixed at 1280×720 | High | |
| Drawing four kinds, Shift for square/circle, click for an empty text box | High | |
| Styling: fill, outline, corner radius by inspector and handle, radius kept on resize | High | |
| Text: style, wrapping, growing taller, edit in place, Escape or click away ends it, empty box disappears | Medium-high | Caret placement and IME inside a scaled view are untested |
| Selection: click, Shift-click, marquee, Escape | High | |
| Visible on any colour | Medium | Judged by eye on a few backgrounds only |
| Move, nudge, resize, keep proportions with the Shift override, line ends | High | |
| Snapping and guides | Medium | Seen in screenshots, not asserted |
| Delete, duplicate, copy and paste across slides and presentations | High within one window | Not across browser windows |
| Groups, double-click inside, ungroup in place | High | |
| Align and distribute | High | |
| Stacking order | Medium | Not asserted |
| Inspector "Mixed" handling | Medium | Screenshotted, not asserted per field |
| Undo for everything listed, selection restored | High for drawing, moving, typing, grouping, styling and slides; medium for undo of a slide insert after the service renamed its id | That path is logically handled (`History.renameSlide`) but not exercised |
| Saving: the three exact states, retry, ⌘S | High | Asserted, including outage and recovery |
| Conflicts | High for detection by probe, and "use theirs" | "Keep mine" was only clicked in `look.mjs`, and a 409 returned by a save is untested |
| Presenting | Medium-high | Arrows, Escape and the return slide are tested; real fullscreen and Escape exiting it are not |

**Where I'd expect a tester to find problems:**
- **Stale home thumbnails.** Each card's `DataSource` only refetches when its URL changes. The deck list itself is refetched on Home, so the title and slide count update, but the thumbnail of an edited first slide probably doesn't. A likely real bug.
- **Closing animation lands in the wrong place.** It shrinks back into the card rectangle stored at open time, but the list re-sorts most-recent-first, so the card may have moved.
- **Focus edge cases.** For example, ⌘ shortcuts while focus sits in an inspector colour popover.
- **Text editing inside a scaled TextInput.** Line-height mismatches against the rendered `Text` with unusual fonts.
- **Slides added elsewhere.** They are only merged when a deck PATCH conflicts.
- **No hover outline on elements.** Only the cursor changes.
- **Performance** with slides holding hundreds of elements, since a drag rewrites the whole elements array on every move.

## (g) Gaps I worked around

- **Colour picker.** No library control. I built `ColorWell` plus a shared `ColorPop` (a `Popover` with swatches and a hex field). I believe it genuinely isn't there.
- **Number field that can show "Mixed".** `Stepper` can't show an indeterminate value. I built `NumField extends TextInput` with `admit`, `commitOn = "end"` and arrow-key bindings. Probably a real gap.
- **Undo manager.** I wrote my own `History` node of before/after snapshots. `declare.md` mentions "history can count 'one entry per settle'", which made me wonder whether some history facility exists; I searched `declare-help undo` and found nothing app-level. Unsure: it might exist and I didn't find it.
- **Write queue, offline retry and conflicts.** I wrote a serial queue over one `DataSource`, with `afterDelay` backoff. I didn't look for a built-in; it probably doesn't exist, and it would be a valuable library class.
- **Inert handlers.** I wanted element views to take presses only on the stage. I tried `pointerEvents = "none"`, then moved all handling to the stage with `viewAt`. Unsure whether a sanctioned way exists. `classFor` can't read `live`, so I couldn't swap in handler-free classes either.
- **Clipboard.** I used an in-app array behind MenuBar keys. **The platform does offer this.** Chapter 9 documents `onClipboardCopy`/`onClipboardPaste` with custom MIME types "to another of its windows". I read that and still didn't use it. That was my miss: it would have given paste across browser windows.
- **Drag-to-reorder in a list.** I built a ghost and a drop line myself. Unsure whether chapter 16, which I didn't read, offers something.
- **Debounce.** Uses the cancellable `afterDelay` handle. That is the platform's answer, and it was fine.

## (h) Changes of direction

1. **Drag preview (planning, before any code).** I first planned a separate preview `Dataset` during drags, then decided to write the document on every move and record one step at the end. My own second thoughts: simpler, and thumbnails update live.
2. **`classFor`.** An App method, then a script function returning a string. Changed at the first compile, because of a refusal.
3. **Script element type.** A hand-written `Elt`, then the schema `El`. Changed at R3, because of a refusal.
4. **Colours.** Schema strings, then `Color`, then strings again with `paintOf`, within minutes. R4's advice led to an R3 cascade.
5. **Element press handling.** On each element view, then on the Stage via `viewAt`. Changed right after the first run, because of the behaviour I saw.
6. **Group view size.** Auto, then 0×0. Same session, because of a selection failure I saw.
7. **`DeckCard`.** A Control containing a button, then a View with two sibling controls. Because of DECLARE4020.
8. **Icon buttons.** `IconButton` with `on`, then a separate `ToggleButton`. Because of DECLARE4022 and my second thoughts about Undo announcing as a toggle.
9. **The tool palette.** Absolutely centred, then in flow between Spacers. Because of the Tab-order and covered-press findings.
10. **Save status.** `pending` excluded slides held back by a conflict, then included them, and a separate `sendable` flag was added for switching presentations. Because of a screenshot.
11. **The title.** A plain `TextInput`, then a TextInput with an ellipsised `Text` overlaid when not focused. Because of a screenshot.
12. **Pasting.** Same position on another slide, then always offset. My re-reading of the brief.
13. **Delete confirmation.** My invented `"danger"` tone, then `destructive: true` with Cancel as the default. Because of a screenshot plus `declare-help Dialog.buttons`.
14. **The conflict bar.** It appeared instantly, then slid in on a spring. Because of the brief's motion bar.
15. **"Bricolage Grotesque" in the slide font list.** Added, then removed because I couldn't verify it rendered.

## (i) The code, quoted

The minimum reproduction for (d)13, reconstructed. The inner view stands for `Shape`; in thumbnails `live` was false, so `pointerEvents` was `"none"`:

```declare
class Card extends Control [ width = 300, height = 200,
    press() { app.opened = true },
    View [ width = 300, height = 200, clip = true, pointerEvents = "none",
        View [ x = 100, y = 50, width = 100, height = 100, pointerEvents = "none",
            onDoubleClick(e: PointerEvent) { },
            onDragStart(e: PointerEvent) { }, onDrag(e: PointerEvent) { },
            onDragEnd(e: DragEndEvent) { } ] ] ]
```

A click at the centre of the card didn't call `press()` in my app; a click on empty area of a similar card did. There was no error message. `drive.press` showed `pressed: true`, and nothing happened on release. I didn't reduce it to this exact program, so treat this as a likely reproduction, not a confirmed one.

`viewAt` and an auto-sized group (d)14:

```declare
class GroupEl extends ElementView [
    ElementView [ datapath = :children[], classFor = { elementClass(:kind) } ] ]
```

Children sit at slide coordinates out to x=1500. `viewAt(point over an earlier sibling)` returned `GroupEl`. The `--js` output was `"GroupEl<SlideArt<View<Stage<View<View<App"`.

The colour cascade (d)11: `schema Slide [ …, background: Color, … ]`, then `if (s.background != b.background)` and `uniq(this.shapes.map((e) => e.fill ?? "none"))` with `uniq(xs: string[])` produced the errors quoted in (d)11.

The other quotes are given inline in (d).

## Surprises

- `instanceof Shape` works on Declare classes.
- `object`-typed attributes (`revs: object = { {} }`, then `revs[id] ?? 0`) compiled without complaint. It looks like `object` is effectively untyped, which quietly weakens the checking the language advertises. Unsure.
- Recursive schemas (`children[]?: El` inside `El`) just worked.
- A zero-size view still lets its overflowing children be hit.

## Good and bad

**Good:**
- The diagnostics are the best I've worked with: almost every one named the fix, and independent errors came in batches.
- Constraints make an editor's derived UI (handles, inspector, thumbnails) nearly free.
- Springs and TweenLayout are pleasant to use.
- verify and drive form a genuinely good test harness, especially the program-owned clock.
- `declare-help` is fast and precise.

**Bad:**
- The pointer and gesture-claim model was the one place I couldn't reason from the docs to the behaviour.
- The data-to-paint boundary for colours is awkward.
- Imperative service work (queues, retries, one source serving many response shapes) falls back to stringly-typed dispatch.
- There is a lot of required reading up front.
- A few undocumented syntactic limits: default parameters, and what `classFor` may read.

## How it compares

It felt most like QML: a tree of typed nodes, property bindings, `states`, and `parent` and root references. A bit like Flex MXML, and OpenLaszlo as the README says. Compared with React there's no render pass to reason about, which suited an editor where many views derive from one document. Compared with SwiftUI, springs are attached to the attribute rather than to a transaction, and I preferred that.

## Where I'd most want improvement

1. **Gesture claims under `pointerEvents = "none"`.** Document them, or make such views claim nothing. That was one obstacle, about 20 minutes, and it forced a design change. I'd have needed a sentence in chapter 9, or a verify finding along the lines of "this Control's clicks are claimed by a descendant's `onDoubleClick`".
2. **A colour type usable as data.** For example a `Hex` string type, or schema `Color` narrowed to string hex.
3. **Library pieces:** a colour well and picker, an indeterminate numeric field, an undo manager, and a write queue for `DataSource` with retry and conflict handling.
4. **The script–schema bridge.** Document it, along with optional fields being `T | null | undefined`.
5. **`classFor`.** Allow it to read a provided value such as `live`.
6. **Smaller items.** Typed dialog tones, and a warning when a Playwright name matches as a substring.

**The hardest part**, if I name one: the click being claimed inside thumbnails (d)13. It was a single obstacle, not a pattern. It cost roughly 20 minutes and a redesign of where press handling lives. To write it right the first time I'd have needed an explicit rule about which views claim a gesture when an ancestor is a Control. The most repeated cost was a pattern: bare colour literals and named colours inside braces, about ten sites, one compile cycle, and entirely my own carelessness against a clear §2.

## What I'd use it for

Interactive, design-heavy tools: editors, dashboards, canvases and internal apps, where many views derive from one model and motion matters. I'd hesitate on apps dominated by service orchestration until the data-writing side gets richer primitives. And I'd hesitate on teams who can't absorb a new language, though the compiler makes it far more approachable than a new language usually is.
## 7. The names ledger

```
NAMES — eval-presentify-14: 2 missed name(s), 2 collision(s), 4 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
     1 · global    · history              ·                          · browser/Node global · foreign hint · ×1  ·    2 · resolved
         'history' is the host's, not Declare's — a program runs on three renderers and names none of their globals. Back/forward is the (location, waypoint) pair the host walks; a program writes app.location
    19 · value     · alert                · ConflictBar.accessibilit · browser/Node global · foreign hint · ×1  ·   20 · resolved
         ConflictBar.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | grid 

COLLISIONS (min · held by · name)
     4 · Declare's type · TextStyle
    19 · attribute      · fill

DECLARE-HELP MISSES (min · asked for · answered)
     1 · fullscreen · 'fullscreen' is not a Declare name — the Declare concept is App.fullScreen:
     4 · leave · 'leave' is not a Declare name — the Declare concept is App.unsavedChanges:
     4 · onLeave · App has no member 'onLeave' and nothing near it — the member table: declare-help App
     4 · onLeave · 'onLeave' is not a Declare name — the Declare concept is App.unsavedChanges:

SUMMARY: 0 of 2 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
