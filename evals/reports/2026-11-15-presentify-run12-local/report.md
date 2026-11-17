# Presentify run 12: Opus 5.5, Declare, on the local tree, standard

The second run on the global-names tree, and the first at `standard` on it: builders on their
types, `Color`'s operations, color strings in `{ }`, `app.hostProvided`, the node methods,
and three things added after run 11's audit — `app.unsavedChanges`, `destructive` on a
dialog's button, and the boot check's `Color` sample. **35.0 min, 134 turns, 185k output
tokens** (65k thinking). Not scored: the audit is the result. Timing record:
`evals/timings/2026-11-15-presentify-run12-local.txt`.

## 1. The comparison

| | 8 | 9 | 10 | **12** | 11 (bare) |
|---|---|---|---|---|---|
| total | 41.7 | 43.0 | 51.3 | **35.0 min** | 34.3 |
| turns | 142 | 143 | 153 | 134 | 129 |
| output tokens (thinking) | 188k (62k) | 217k (84k) | 221k (93k) | 185k (65k) | 174k (59k) |
| reading · writing · checking | 7.2 · 0.1 · 34.5 | 3.8 · 0.0 · 39.2 | 4.4 · 0.0 · 46.9 | 7.6 · 10.3 · 17.1 | 5.3 · 0.0 · 28.9 |
| tool time · model time | 13.6 · 28.2 | 10.4 · 32.6 | 17.9 · 33.4 | 7.2 · 27.8 | 7.9 · 26.4 |
| verify calls · help · images | 39 · 14 · 32 | 38 · 15 · 21 | 55 · 8 · 27 | 41 · 10 · 24 | 40 · 17 · 17 |
| cache reads | – | – | 48.0M | 37.5M | 37.3M |
| output per model-minute | 6678 | 6652 | 6604 | 6670 | 6605 |

- **The fastest standard run of the four,** by 6.7 minutes over run 8 and 16 over run 10, with
  the same model pace (output per model-minute within 1%). The saving is in tool time and
  checking; the verify calls are the same as runs 8–9.
- The phase split differs in kind: runs 8–11 wrote the program in one turn early (the
  "writing" column is near zero, so the checking column holds the rest); run 12 wrote in
  several, so 10.3 minutes count as writing. Read reading + writing + checking together:
  34.8 against 41.8, 43.0 and 51.3.
- **Code:** 3,108 lines in 7 Declare files, 2,582 without blank and `//` lines. Run 11:
  3,509 in 9 (one TypeScript). Run 10: 3,233 in 7.
- **Download:** 216 KB gzip as a production build (`declarec`), first load, plus the brand
  font (77 KB woff2) fetched on its own. Run 11: 214 KB.
- **Checks:** five kept scripts (`flow` 39 assertions, `editing` 26, `more` 15, `offline` 7,
  `looks` screenshots), a 100-slide `drive.profile`, and a cleanup of its test decks over HTTP.

My own work did not share the machine during this run.

## 2. What it built, and findings for the platform

All of the brief: the list of presentations (cards whose cover is the deck's first slide
fetched on its own, a menu to rename or delete, a card the opened presentation grows out of),
the editor (a slide list that glides on reorder, the stage with handles, a corner-radius
handle, snapping guides, a marquee, groups entered by double-click, typing in place on a
native field laid over the text), the inspector (mixed values, a shared palette popover with
a hex field), undo through every change with merge keys, saving with no Save button and a
status pill, conflicts shown as a banner with the other window's version drawn beside, and
presenting full screen.

1. **FIXED: the run-time color error named no place.** A `SwatchButton` declared
   `color: string = ""` and painted `fill = { classroot.color as Color }`; the default `""`
   painted before the datapath bound, and boot failed on `the color "" arrived as a string at
   run time … Nothing was painted.` with no view, attribute or line. It cost three
   verify/look rounds (account, d13) — the run's most expensive diagnostic, and it came from
   this branch's new refusal. The attribute write now names both: `the color "" on
   app.colors._body.0.grid.0.fill arrived…` (`runtime/src/attributes.ts`, `value.ts`;
   pinned in `test/color-strings.test.mjs`). Builders (`Stroke(…)`, `Shadow(…)`) still say
   no place: they don't know which attribute they will land in.
   - **To decide:** whether `""` in a color slot should simply be no color (null), as
     `null` is. Data uses `""` for "none" often enough; today it is an error.
2. **ADDED, and used: `app.unsavedChanges`.** `unsavedChanges = { app.saver.status != "saved" }`
   (presentify.declare:251), with a save on `pageVisible` turning false. The agent found it
   late, through `declare-help App --all`, and asks that guide 14's "Talking to a server"
   point to it (account, a). **Proposal:** one sentence there.
3. **Colors are still typed `string` in the schemas,** and checked by hand: `paint()`,
   `hexOk()` and `lightness()` (model.declare:177–189; the lightness is again not relative
   luminance). Three runs now. The agent met it as the refusal `the { } body of 'textColor'
   computes a string, but 'textColor' is typed Color` (d9) and cast. That refusal now ends
   with "a color written in a string is typed Color: type the schema field that holds it
   Color" (added during this audit, before reading the account; it fits d9 exactly).
   `Color.contrast` again unused (`addTitle`, `placeAt` pick ink by `lightness() < 0.45`).
4. **Schemas in script, and `| null`.** The agent wrote a parallel script type for its
   elements and met 29 sites of "`number | null | undefined` is not assignable to
   `number | undefined`" before guessing `type Elem = El` (d7). That a schema's name is a
   type in `script`, and that its optional fields read `T | null`, is said nowhere it read.
   **Proposal:** one sentence each in guide 15.
5. **Dataset writes change the record you hold.** The agent probed it (`same=true … heldx=5`,
   account, i) because undo by snapshot depends on it, and found it unwritten. **Proposal:**
   one sentence in guide 14 § Writing a record: a write changes the dataset in place, so a
   snapshot is a copy (`structuredClone`) taken before.
6. **A misplaced "host" message for a plain typo.** A rename left `flatMap(leaves)` behind;
   the compile said `'leaves' is not something every host provides — this script runs
   everywhere…` (d6). When the name is no host's global either, the message should be the
   ordinary unknown-name one with the near name (`leavesOf`). To check in the compiler.
7. **`classFor` from a script function returns a string and needs `use`** (d8) — run 11's
   finding again; the inline map form avoids both. The agent calls the difference an
   inconsistency.
8. **Replicated rows and declared siblings in a path.** `list.1` was the declared `slot`, not
   the new row (d24); the agent didn't learn which order holds and switched to a role
   locator. To say in verify.md's paths paragraph (already queued from Cadence 37).
9. **The motion-in-flight note earned its keep.** A locator timeout listed the running
   animators, which exposed a hidden duplicate `SlidePanel` replicating every thumbnail
   (d25). The same note on a covered-controls finding mid-animation (d16) was asked for.
10. **What it built from scratch** (account, g): a colour well (none in the library), a
    document undo history, and a serial write queue with retry and conflicts. The same three
    as run 11. Evidence for the design queue, not defects.

## 3. Is it idiomatic Declare?

The counts, beside runs 10 and 11 and the to-do app (`idiom.py`):

| | Run 10 | Run 11 | Run 12 | To-do |
|---|---|---|---|---|
| code | 2,594 lines Declare | 2,416 Declare, 224 TS | 2,491 lines Declare | 844 lines Declare |
| bytes | 133 KB | 129 KB | 138 KB | 48 KB |
| lines over 150 characters | 20 | 9 | 55 | 3 |
| colour literals outside theme declarations | 87 | 46 | 59 | 1 |
| theme reads | 102 | 115 | 103 | 69 |
| States | 3 | 3 | 3 | 7 |
| visible switches | 0 | 1 | 1 | 0 |
| branches on width or phone | 1 | 0 | 5 | 38 |
| flexes | 10 | 9 | 18 | 7 |
| browser scripts | 0 | 1 | 0 | 0 |
| page lookups | 0 | 0 | 0 | 0 |

No browser script this time: run 11's `window.onbeforeunload` is `unsavedChanges`. The long
lines are mostly the inspector's `IconToggle` rows and the handles (editor.declare:319–339),
each a view with five attributes on one line.

**What it gets right.**
- **The shape the docs teach.** The open presentation is a `Deck` that extends `Dataset` and
  makes every write (model.declare:261); the history, the saver (with `status`, a retry
  `Time`, and conflicts) and the editor are nodes with no view; where the person is lives on
  the App (`location`, `screen`, the menus' deck). The editor's selection facts are all
  derived (`selEls`, `selBox`, `leaves`, `single`, `style`, editing.declare:32–66), and the
  inspector reads one derived `Style` record that says "mixed" where values differ.
- **One `SlideArt` draws a slide everywhere** (slide.declare:19): the stage, thumbnails, the
  drag ghost, the conflict preview, the cards, the presenter. Each element is a view chosen
  by `classFor`; an ellipse answers inside its `clip`, a line along a rotated band — guide 9's
  answer, used as written.
- **The frame and handles are constraints** on `app.ed.selBox` × `app.zoom`
  (editor.declare:312–340): no update code.
- **The library where it fits:** `ChoiceControl` with its own `AlignChoice` (taught by
  DECLARE4026), `Popover` reading `opener` for one shared palette, `TweenLayout` for the slide
  list, `Spring` for the conflict banner, `Dialog [ presentation = "full" ]` with
  `app.fullScreen` for presenting, key bindings with `when`.
- **`unsavedChanges` and `pageVisible`** for leaving, as the platform means them.
- **It fixed every accessibility warning** and restructured the card when DECLARE4020 said a
  button sat inside a button.
- **Reorder state moved to a node** (`Reorder extends Node`, editor.declare:150) after the
  hidden-panel mistake; drag is a `Drag extends Node` as the calendar's is.

**Missteps, with how each should be written.**
- **Colors typed `string` in the schemas** (model.declare:224–241), with `paint()`, `hexOk()`
  and a hand-written `lightness()` (finding 3). `color: Color` in `Outline`, `TextRun`,
  `El.fill` and `SlideRec.background`; then `fill = { :fill }` directly, and
  `Color.contrast(bg, white) > Color.contrast(bg, ink)` for the ink choice. `Chip.color`,
  `SwatchButton.color` and `ColorWell.value` would be `Color?` with a separate "mixed" flag,
  where today they carry `"none"` and `"mixed"` in a string.
- **Delete is the dialog's default with no `destructive`.** `askDelete` passes
  `({ id: "delete", label: "Delete", default: true })` and a tone of `"error"`
  (presentify.declare:115), so Return deletes. `destructive: true` marks it, and Cancel is
  the default where the step can't be undone.
- **Its own type for the delay handle:** `_timer: object = null` cast to
  `{ cancel(): void }` at each use (model.declare:393–398). `_timer: DelayHandle? = null`.
- **A cast where `errorSchema` types the body:** `this.req.errorBody as { error?: …; current?: object }`
  (model.declare:522), and the success bodies cast likewise (494–500). `errorSchema = Refusal`
  types `errorBody`; the `Refusal` schema is already declared (247).
- **Menu keys spelled by hand:** `key: "⌘Z"` on each edit-menu record (presentify.declare:378–384),
  and `(⌘Z)` in tooltips, beside bindings that already hold the keys. `command: "undo"` on the
  record shows the binding's key as the person's keyboard spells it.
- **Finding a row's view by walking `childViews`** (presentify.declare:173, editor.declare:223).
  Guide 14 allows it in a handler, and both are handlers; the card lookup could instead be
  the card handing itself to `app.open` at the press, as the menu deck already does.
- **Redundant parentheses** `{ ({ … }) }` around object literals (DECLARE1002 hints the agent
  chose to leave), e.g. `meta: MetaMap = { ({}) }` (model.declare:381).
- **`classFor` through a script function and `use`** (slide.declare:17–38), where the inline
  map names the classes.
- **Element-kind label tables cast to an index type** (`as { [k: string]: string }`,
  editing.declare:287, 424, 720; presentify.declare:209–214): a `switch` or a typed record
  says the same without the cast.

**Workarounds the platform forced.**
- The colour well (no library control).
- Snapshot undo with `structuredClone` and `JSON.stringify` comparison (finding 5; account g4).

## 4. Names

**Misses** — three, all answered by a foreign-instinct hint and resolved in the minute:
`img` twice and `alert` (ARIA role words). The agent called both hints excellent.

**Silent misses** (from section 3): `string` for colors in the schemas, `object` for the delay
handle, the menus' hand-written `key`, `"none"`/`"mixed"` in color strings.

**Collisions:** `schema TextStyle` (a Declare type), refused with the rename asked; it became
`TextRun`.

**Lookups that missed:** none.

## 5. The agent's account

Asked after the build by resuming the session read-only (`impressions.txt`); 16k output tokens,
453k cache reads, counted apart from the build's.

# Building Presentify in Declare: an account for the people who make Declare

I built a slide editor of about 3,100 lines of Declare across seven files, plus five driver scripts. Below is what happened, as precisely as I can reconstruct it from this session. Where I quote code, it is the code as it stood when the message appeared, trimmed to the relevant lines. The messages are copied from the tool output.

---

## (a) Getting up to speed

**What I read, in order**

1. `README.md`, then `skill/SKILL.md`.
2. `docs/declare.md`, whole.
3. Guide chapters `01-what-declare-is.md`, `04-structure.md`, `05-run-and-check.md` and `06-layout.md`, whole.
4. `apps/todo/todo.declare` and `todo-parts.declare`, whole.

That is exactly the list SKILL.md gives. I then read further chapters because the brief needed them:

- `09-pointer-and-keyboard.md`: drag, `viewAt`, keyBindings, clipboard.
- `14-data.md`: DataSource writes, `onError`, `failure`.
- `18-overlays.md`, `17-your-own-views.md`, `21-motion.md` and `23-animated-arrangements.md`.
- The "Provided values" section of `11-paint-and-themes.md`, found by grep.
- Most of `docs/operational/verify.md`, once I started writing driver scripts.

I also made about 40 `npx declare-help` lookups. These included `TextInput`, `App.fullScreen`, `TweenLayout`, `Dialog.presentation`, `DataSource`, `PointerEvent`, `ClipboardEvent`, `Color`, `ChoiceControl`, `FontFace --all`, `measureText`, and `App --all`.

**What I skipped, and why**

- **Chapters:** 02, 03, 07, 08, 10, 12, 13, 15, 16, 19, 20, 22 and 24–31. SKILL.md says to read the rest when you reach the part that needs it, and I mostly got what I needed from `declare-help`.
- **Example apps:** I ran `declare-help map` on `apps/desktop/desktop.declare`, which is the closest program to mine ("objects people move and resize"). I never read any of its classes. I didn't open the calendar or the tracker at all. That was probably a mistake. The desktop's `beginSize`/`moveSize` and its resize halo would likely have shown me an idiomatic handle design before I wrote my own.
- **`intake.md`:** skipped.

**What taught me the most**

- **`docs/declare.md`.** It is dense but complete enough that most of my compile errors were cases where I *didn't* apply what it said.
- **The to-do app.** It showed the division of labour: a dataset class, user state on the App, `afterSettle(() => Focus.focus(...))`, `trackChanges`/`onChange`, `Toast` and `Shortcuts`. I copied its shapes: the `Glyph extends Icon` switch, the `theme` record spread over `SanFrancisco`, `Font [ FontFace [...] ]`.
- **`verify.md`'s table of `drive` verbs.** It made the behaviour scripts possible without guesswork.

**What was missing or misleading**

- **Can a `script` block see `schema` types?** The docs never say. I wrote a parallel TypeScript type, hit 29 incompatibility errors, then tried `type Elem = El` on a guess, and it worked.
- **Do Dataset writes mutate in place?** `14-data.md` says "a dataset's `value` is read-only" but not whether `set()` mutates the object you previously read. I had to write a probe program to learn that it does (`before === after` was `true` and the old reference saw the new value). For anyone doing undo by snapshot this is the most important fact about datasets, and I couldn't find it written down.
- **`classFor`.** The docs show it taking a bare class inline, but a script function must return the class *name as a string*, and that class then needs `use [...]`. I only learned this from the error message.
- **Strings from JSON and `Color`.** `Color` is `number | `#${string}` | ColorName`. That a JSON string must be cast, or that an empty string fails at runtime, isn't in the data chapters.
- **`unsavedChanges` and `pageVisible`.** These are exactly what an autosave app needs. I found them only by grepping `declare-help App --all` near the end. They aren't mentioned in `14-data.md`'s "Talking to a server" section, where I would have looked first.

## (b) Expressing what I wanted

**Where the language fit**

- **One slide renderer, used everywhere.** `SlideArt` is a single class rendering a slide record, scaled with `scale = { app.thumbW / 1280 }`. It gave me live thumbnails, the editor canvas, the presenter, the conflict preview, the drag ghost and the home-screen cover images. Nothing was duplicated, and "the presentation looks exactly as it does in the editor" came for free.
- **The selection frame and handles.** These are constraints on `app.ed.selBox` times `app.zoom`, so they follow during drags with no code. I never wrote an update routine.
- **Shapes as views.** The ellipse takes presses only inside its outline via `clip = { ellipsePath(w,h) }`, and the line is a rotated thin view, exactly as `09` suggests. Hit-testing was solved by the platform.
- **Small things that were each a line or two:** the slide list gliding on reorder (`TweenLayout` with a three-line `place()`), the banner sliding in (one `Spring`), menus with live labels ("Undo Move") as constraints on `items`, `Dialog [ presentation = "full" ]` plus `app.fullScreen` for presenting.
- **`keyBindings` with `when:`.** One table on the App gave me ⌘Z, arrows, tools and so on, with text fields keeping their own keys automatically.
- **The saver.** One `DataSource` re-aimed per request (`reqUrl`, `reqMethod`, `reqBody`), relying on "fetch() settles first", plus `failure` to tell "unreachable" from "refused". That was exactly the distinction the brief's save states needed.

**Where I worked against the grain**

- **Undo, snapshots, gesture state.** Every edit is a `structuredClone` of the whole document before and after. That's imperative code in methods, and the language has no opinion on it (see section g).
- **The `Drag` Node** holds gesture state in a dozen attributes and branches on a `mode` string. It reads like a hand-written state machine. I couldn't see a more declarative shape.
- **Model-layer typing.** I spent effort keeping JSON-schema types, script types and Declare types aligned (section d).

## (c) The first time it ran

**Getting it to boot.** After three compile rounds (sections d1–d12), the first boot (R4) failed with:

> `boot: the color "" arrived as a string at run time, where only hex is read — write it as "#RRGGBB" … Nothing was painted.`

It took three rounds to find the source (d13). The fix was a `paint(s, fallback)` helper.

**Home screen.** First screenshot (`declare-look --url … --shot`): correct, with real thumbnails. I was surprised how good it looked on the first paint.

**Editor, first look** (opened by clicking the first card):

- The title field was clipped. My width formula `Math.max(140, Math.min(320, app.width - 1080))` gave 200 px at 1280.
- The Arrange section's six align buttons overflowed. The layout finding named the exact view.

**The first flow run** (drawing, typing, grouping) showed the rest:

- **A rectangle 1.2× too wide.** This was my test's fault: it read `app.zoom` on the home screen before the stage existed, so it used the fallback size. I thought the app was wrong until I printed the saved slide JSON.
- **Text boxes made by a click were a fixed 420 wide.** Three of them distributed off the slide's right edge. I only saw it in a screenshot.
- **The open animation scaled the editor from its top-left corner.** The slide didn't come out of the card it was opened from. I saw this in a `--no-settle --wait 90` screenshot.

## (d) Every refusal and surprise

I've tagged each with my judgement: **mine** (my code was wrong), **docs** (the docs left it unclear), **platform** (the platform looks wrong), or **unsure**.

**Compile refusals, in order**

1. **TS arrow with a Declare-style return type.**
   - Wrote: `const deep = (e: El) -> El { return … }` inside a method.
   - Said: `Editor.styleLeaves(…) is not a valid method body — '=>' expected. [DECLARE2000]`
   - Changed to: `(e: El): El => …`
   - **Mine.** I carried `->` from method signatures into TypeScript. A good message, though "you wrote `->`; inside a body, TypeScript's arrow is `(…): T =>`" would have been instant.
2. **ARIA's role name.**
   - Wrote: `accessibilityRole = img`.
   - Said: `…got 'img' — ARIA's word; Declare's is image`
   - **Mine.** An excellent message.
3. **A width on a child that shrinks.**
   - Wrote: `title: TextInput [ shrinks = true, width = 300, minWidth = 120, … ]`
   - Said: `TextInput.width — View's SimpleLayout sizes its children, so this child does not declare its width — it shrinks…`
   - **Mine.** A good message.
4. **No `alert` role.**
   - Wrote: `accessibilityRole = alert`.
   - Said: `an alert is accessibilityRole = status with accessibilityLive = assertive`
   - **Mine.** Excellent.
5. **Schema name clashing with a built-in type.**
   - Wrote: `schema TextStyle [ … ]`
   - Said: `schema TextStyle takes the name of one of Declare's own types … Rename yours [DECLARE4015]`
   - Renamed it to `TextRun`.
   - **Fine.** Unavoidable, and clearly explained.
6. **A rename that left one reference behind, reported as a host problem.**
   - My perl rename of `leaves(` → `leavesOf(` left `flatMap(leaves)` unrenamed.
   - Said: `'leaves' is not something every host provides — this script runs everywhere… [DECLARE6001]`
   - **Unsure, leaning platform.** The real cause was an unknown identifier. Calling it a host-portability issue sent me looking in the wrong direction for a moment. "Not declared in any script block (did you mean `leavesOf`?)" would be better when the name isn't a known host global either.
7. **Schema types versus my script types: 29 sites.**
   - Wrote: a parallel `type Elem = { x?: number; … }` in `script`.
   - Said: `Type 'El' is not assignable to type 'Elem'. Types of property 'x' are incompatible. Type 'number | null | undefined' is not assignable to type 'number | undefined'. — 29 sites`
   - Changed to: `type Elem = El`.
   - **Docs.** Schemas make optional fields `| null`; I didn't know that, and didn't know schemas were usable in script. Both should be one sentence in `15-schemas.md`.
8. **`classFor` from a script function.**
   - Wrote: `function elClass(kind) { … return GroupEl … }` and `classFor = { elClass(:kind ?? "rect") }`
   - Said: `the { } body of 'classFor' computes a typeof GroupEl, but 'classFor' is typed string — inline, a class is named bare …; a script function answers its name as a string: return "GroupEl"`
   - Changed to: strings, plus `use [ GroupEl, RectEl, EllipseEl, LineEl, TextEl ]`.
   - **Docs/platform.** The message is clear. But one attribute accepting a bare class inline and a string otherwise is an inconsistency I'd smooth out.
9. **Strings into colour attributes.**
   - Wrote: `textColor = { classroot.ink }` with `ink: string`, and `fill = { classroot.color }`.
   - Said: `the { } body of 'textColor' computes a string, but 'textColor' is typed Color`
   - Changed to: `as Color`, later `paint()`.
   - **Docs.** Fine message; see (a).
10. **A union attribute declared as `string`.**
    - Wrote: `ToolTile [ tool: string = "" ]` passed to `app.ed.tool`.
    - Said: `a "select" | "rect" | … is one of a fixed set of words, and this one reached here as a plain string…`
    - **Mine.** A good message.
11. **Gradient stops.**
    - Wrote: `Gradient.linear(120, ({ color: 0xEDE8FF, at: 0 }), …)`
    - Said: `'at' does not exist in type '{ offset: number | null; color: Color; }'`
    - **Mine.** I guessed instead of looking it up.
12. **Reading `childViews` in a constraint.**
    - Wrote: `onOpenFor: string = { this.opener == null ? "" : app.deckOf(this.opener) }`, where `deckOf` did `app.home.page.grid.childViews.find(…)`.
    - Said: `aggregation over a reactive node collection (.childViews.find) — a data-dependent number of attributes; derive from data [DECLARE7001] (line 411, col 29)`
    - **Mine, and a good catch.** I set `app.menuDeck` before opening the menu instead.

**Boot error**

13. **The empty-string colour.** `boot: the color "" arrived as a string at run time … Nothing was painted.`
    - **What I tried, in order:**
      - Guarded every `:background`, `:fill` and `:stroke.color` read with `paint()`. It still failed.
      - Booted against real data (`declare-look --url … --console`). Same error, so it wasn't the sample data.
      - Read through the views built at boot and found the cause.
    - **The cause:**
      ```
      class SwatchButton extends Control [ … color: string = "", fill = { classroot.color as Color } ]
      class Chip [ color: string = "", fill = { classroot.color.startsWith("#") ? classroot.color as Color : 0xFFFFFF } ]
      ```
      The default `""` is evaluated before `color = { :@ }` binds.
    - **Judgement: platform — the single most expensive diagnostic.** My code was wrong, but the message names no view, attribute or line. Every other error in this session told me where. The runtime knows which attribute it was setting; it should say `SwatchButton.fill (app.colors._body.0.grid.0)`. It cost three verify/look cycles.

**Layout findings**

14. **Arrange row overflow.**
    - `app.editor.body.inspector.body.arrangeSec.body.0.slot's children need 222 across and it has 176…`
    - Then, after I narrowed the inspector to 256: `need 173 across and it has 152`.
    - **Mine, and accurate.** I shrank the toggles to 28 px with 1 px gaps, and kept the inspector at 280.
15. **Text-size row overflow.**
    - `app.editor.body.inspector.body.textSec.body.1.slot's children need 186 across and it has 176`
    - The library `Stepper` was too wide next to my number field. I replaced it with − and + buttons.
    - **Mine.**
16. **Controls covered by the growing editor.** During `--no-settle`: `14 control(s) another view takes the presses of … app.home.page.grid.0.face (by app.editor.body.slides.list)…`
    - That is expected mid-animation; the editor really is over the cards.
    - **Fine**, though a note that motion was in flight would help.

**Accessibility and lint warnings** (I fixed all of them)

- **DECLARE4022** on `SwatchButton`: added `accessibilityPressed`.
- **DECLARE4035**: `Handle has an accessibilityLabel but no role`. Made handles `accessibilityHidden`. The same warning on `Stage` got `region`, and on the presenter's slide got `image`.
- **DECLARE4026**: the three text-align toggles should be a `ChoiceControl`. I rewrote them as `AlignChoice extends ChoiceItem`.
- **DECLARE4020**: `more (a button) is inside DeckCard (a button)`. I restructured the card.
- **DECLARE4025**: a three-deep ternary fill. Rewritten with `State`.
- **DECLARE1002** hints: redundant parentheses around object literals in `{ ({ … }) }`. I left these.

All of these were correct and useful; 4026 in particular taught me `ChoiceControl` exists.

**Driver and look errors**

17. **Wrong index.** `a press on 'app.home.bar.1' … would reach 'app.home': it is covered there, or takes no presses`. `bar.1` was a `Spacer`. **Mine.** A good message.
18. **A click on the frame.** `a press on 'app.editor.body.stage.frame' … would reach 'app.editor.body.stage.paper.art.0'`. **Mine**: I clicked the selection frame, which takes no presses.
19. **A missing row.** `no node at '…textSec.body.5…' — … holds nothing called 5; nearest there: 0 (a Row) … 4 (a Row)`. **Mine.** Listing the nearest children was helpful.
20. **Strict match.** `getByRole("button", { name: "#FFFFFF" }) matches 2 elements` (the colour well and a swatch). **Mine.** I scoped it to the dialog.
21. **Writing a constrained attribute from the outside.** `--set app.saver.base=…` → `Saver.base is bound by a constraint … change what the constraint reads instead`. **Mine**, and correct; I set `app.api` instead.
22. **Covered element.** `a press on 'app.editor.body.stage.paper.art.0' … would reach '…art.1'`. A text box lay over the rectangle. **Mine.**
23. **Handle index.** `widened: 400.46 is not 600`: `frame.3` was the north handle, not east, because the frame's children are halo, line, then eight handles. **Mine.** Naming the handles would have avoided it.
24. **Replicated row order.** `'app.editor.body.slides.list.1' is hidden (its own visible is false)`.
    - After adding a slide, index 1 among the list's children was my hidden `slot` view rather than the new `Thumb`.
    - **Unsure.** I didn't establish whether replicated instances are ordered before or after declared siblings. I switched to `getByRole("button", { name: "Slide 2" })`.
25. **The hidden duplicate panel.** `page.getByRole("button", { name: "Slide 2" }) found nothing within 5 s — motion is still in flight … Animator on t of app.spareSlides.list.layout, a SlideStack…`
    - This was the most useful accident of the build. The message's list of running animators exposed `app.spareSlides`, a hidden fallback `SlidePanel` I'd declared so an alias would never be null. It was replicating every thumbnail a second time.
    - The code at the time:
      ```
      panel: SlidePanel = { app.editor?.body?.slides ?? app.spareSlides },
      spareSlides: SlidePanel [ visible = false ],
      ```
    - **Mine.** I moved drag state into a `Reorder extends Node`.
26. **Not a text field.** `selectAll: 'app.renameDlg.0' is not a text field`. **Mine.** Used `getByLabel("Title").fill(…)`.

**Behaviours that weren't what I meant (no error)**

27. **A background check reported "Not saved".** After my peek GET failed during an offline look, the status read "Not saved: can't reach the service" with nothing unsaved. **Mine.** Seen in a screenshot.
28. **Undo reverted two nudges at once.** "one nudge undone: 99.18 is not 100.18". My 1.5 s merge window combined the two nudges, because the script's clock doesn't advance between keys. **Mine, and a design choice.** I made each nudge its own step.
29. **Opening a deck wrote data.** It was re-measuring text heights (`trackChanges = ["height"]` → `syncHeight`), so the sample deck d1 got version-2 slides and "Edited" moved. **Mine.** Found by checking versions over HTTP.
30. **Dataset writes mutate in place.** Not a bug, but a surprise I probed deliberately. `same=true … heldx=5`. See (a).

## (e) Verifying it

**The tools I used, and what each caught**

- **`declare-verify --rung=3`** after every edit, about 25 times. It caught d1–d12. Each run took a few seconds. Messages nearly always named the fix.
- **R4 boot** caught d13 only (badly located; see above). Its notes listing classes "not built at boot, so not checked" were a good prompt to write scripts.
- **`declare-look --url … --click … --shot`** for eyeballing about 20 screens. It caught the clipped title, the 1024 px squeeze, the wrong grow origin, the false-offline state, and the overflowing "mixed" swatch stripes (the `Chip` needed `clip = true`). Pictures were where most *design* problems surfaced.
- **Five `--assert` scripts against the live service.**
  - `flow.mjs`: the brief's "what done looks like", 39 assertions.
  - `editing.mjs`: 26 assertions.
  - `more.mjs`: 15 assertions.
  - `offline.mjs`: 7 assertions; it simulates the outage by pointing `app.api` at a dead port.
  - `looks.mjs`: screenshots only.

  These caught d23–d26 and d28. The verifier's refusal to press a covered or hidden view, and its strict-match locators, prevented false passes several times. Program-owned time (`drive.wait` runs timers without waiting real time) made the 700 ms save debounce and the 3 s retry testable in seconds.
- **`drive.profile`** on a 100-slide deck. Worst drag frame about 21 ms (that one was a marquee selection), most turns 2–12 ms. It also told me *why* `Glyph.draw` re-ran. Impressive.

**What served me less well**

- The runtime colour error (d13) had no location.
- `declare-look` failures are reported as "R5 ✗ behavior" of a temporary file path, which is momentarily confusing.
- Running against the live service left debris: half-finished test decks and renamed duplicates that broke the next run's strict locators. verify.md warns about this. I cleaned up by HTTP at the end.
- I had no way to check true browser full-screen, or clipboard behaviour across two windows.

## (f) Confidence, part by part

- **§1 Presentations:** high. List, open, new (opens editing with one slide), rename and delete with confirmation are all driven by scripts.
- **§2 Slides:** high.
  - Add, duplicate, delete (the last one can't go), drag-reorder, live thumbnails and keyboard navigation are all tested.
  - Medium on drag-reorder feel. The index maths (`Math.round((y - 4) / rowStep)`) is tested in one direction only.
- **§3 Shapes and text:** high for drawing, shift-to-square or circle, click-to-make text, empty text disappearing, and corner radius surviving a resize.
  - Medium on in-place text editing. The native field over the `Text` may differ in line height from the rendered run, so text could shift slightly on entering edit. I didn't measure it.
- **§4 Selecting and changing:** high for the listed behaviours.
  - Medium on resizing groups that contain text: text height doesn't scale with the group, by design.
  - Medium on snapping, which works but is only to edges and centres, with one guide per axis.
- **§5 Inspector:** high, including "Mixed".
- **§6 Undo:** high; every category listed is tested or exercised. Typing undo inside an active text field uses the browser's native undo, not mine.
- **§7 Saving:** high for the three states, the debounce, ⌘S, offline-then-recover, and a conflict after a slide is open.
  - Lower for deck-level conflicts, such as two windows reordering or adding slides at the same time. That code path (merge order on a 409; append unknown ids) is **untested**, and a tester running two windows would most likely find problems there.
  - While a conflict is unresolved, the status shows "Saving…". This is defensible but arguable.
- **§8 Presenting:** high for keys, click and Escape returning to the right slide. Untested: real full screen, and Esc while in full screen.
- **§9 Polish:** medium. It looks good in screenshots.
  - The inspector's sections appear and vanish without motion.
  - There's no hover outline on slide elements.
  - The 1024 px layout is tight.
- **§10 Labels:** high; the role-based locators in the scripts depend on them.

## (g) Gaps I worked around

1. **Colour picker.** I listed `library/` and found none, so I wrote `ColorWell` plus one shared `Palette extends Popover` that reads `opener`. **Probably truly absent.** The Popover-with-`opener` pattern made it easy.
2. **Document undo and redo.** The to-do app's undo is a toast. I did not run `declare-help undo` or search for an undo manager. I wrote `History` with snapshot steps and merge keys. **Unsure; I didn't look properly.**
3. **A serial write queue with retry and conflict handling.** I knew of nothing beyond `DataSource`. I built a reconcile loop (`pump()`) over one re-aimed DataSource, plus `Time [ tick = 3000, running = { unreachable } ]` for retries. **Likely absent as a library feature.** It's a common need for autosaving apps.
4. **Knowing where a dataset write landed.** I needed old-versus-new for undo and for "is it dirty". I probed, then used `structuredClone` before and `JSON.stringify` comparisons for dirtiness. **A copy-on-write or versioned dataset would be the platform answer.** Unsure whether one exists.
5. **A dashed outline** for the stepped-into group's frame. I saw no dashed `Stroke`, so I used a plain tinted stroke; `setLineDash` works in `draw()`. **Unsure.**
6. **Text width that grows with what's typed.** `measureText` with a hand-built style object inside `typeText`. That is available; I just had to assemble the style myself. `providedTextStyle` didn't fit, because the style comes from data.
7. **"Save on leave."** First I planned nothing. Then I found `unsavedChanges` and `pageVisible` in `declare-help App --all`. **Present; I found it late.**
8. **Finding a row's view by its record** (to focus the current thumbnail, or locate a card's cover). I used `childViews.find` in handlers, which `14-data.md` endorses. Fine.
9. **A null-safe alias to a view that exists only sometimes.** My "spare panel" mistake (d25) came from not knowing how to type `X?` aliases cleanly. I used `View?` with `?.` in the end. **Mine.**

## (h) Changes of direction

1. **Script `Elem` type → `type Elem = El`.** During the first compiles, prompted by refusal d7.
2. **`elClass` returning classes → returning names, plus `use`.** Refusal d8.
3. **Colour casts → a `paint(s, fallback)` helper.** First boot, prompted by d13.
4. **The deck menu.** It first derived the deck from `opener` by searching `childViews`. It became `app.menuDeck`, set before the menu opens. Prompted by refusal d12.
5. **"Click on one of several selected keeps just that one."** First written as hand hit-testing against element boxes in `Drag.clicked`. Then I remembered the drift check, "Hit-testing by hand", and stored the pressed element's id at press time instead. My own second thoughts, before running it.
6. **Reorder state.** It lived on `SlidePanel`, with a hidden spare panel standing in when the editor was closed. It moved to `Reorder extends Node`. Prompted by the timeout message in d25.
7. **Save status.** A pill beside the title became a second line under it. Seen at 1024 px.
8. **Title width.** An arithmetic formula became `flexes = true, maxWidth`. Seen in the first screenshot.
9. **Text-size control.** A `NumberField` plus the library `Stepper` became the field plus − and + buttons. Prompted by layout finding d15.
10. **Text alignment.** Three `IconToggle`s became a `ChoiceControl` of `AlignChoice`s. Prompted by warning 4026.
11. **Deck card.** A `Control` containing the "more" button became a `View` holding a `face` Control and a sibling button. Prompted by warning 4020.
12. **Text tool.** A fixed 420-point box became one that grows to fit its words, or, on a shape, a box fitted inside it, centred and in a contrasting colour. Prompted by a screenshot (boxes overflowing after distribute) and by the brief's "type a title into it".
13. **Open animation.** It scaled from the editor's corner; it now aims so the slide starts exactly over the card's picture. Seen running.
14. **Nudges.** First merged within 1.5 s; now one step each. Prompted by a test failure (d28) and the brief's "one step is one thing".
15. **Height sync.** It ran on every height change; now only for text being edited or selected. Prompted by my own audit of the service's version numbers (d29).
16. **Peek failures.** They first marked the service unreachable; now they're ignored. Prompted by a screenshot (d27).
17. **Inspector width.** Briefly 256 px when the window is narrow; back to 280. Prompted by layout finding d14.

## (i) The code, quoted (for reproduction)

**The boot error with no location (d13).** Minimal repro:

```declare
class Swatch extends Control [ width = 24, height = 24,
    color: string = "",
    fill = { classroot.color as Color } ]
App [ d: Dataset { { "colors": ["#FF0000"] } },
    View [ datapath = { app.d.value }, Swatch [ datapath = :colors[], color = { :@ } ] ] ]
```

I expect this produces `boot: the color "" arrived as a string at run time, where only hex is read … Nothing was painted.` with no view named. I didn't run this minimal version; it's reconstructed from my code.

**The dataset mutation probe (d30)**, which I ran:

```declare
probe() {
    const before = this.d.value
    this.held = before.els[0]
    this.d.set(["els", 0, "x"], 5)
    const after = this.d.value
    this.out = "same=" + (before === after) + " x0=" + after.els[0].x + " heldx=" + (this.held as El).x + " frozen=" + Object.isFrozen(after.els[0])
    }
```

It printed `app.out = "same=true x0=5 heldx=5 frozen=false"`.

**The misleading host message (d6).** In `model.declare`'s script:

```
function leavesOf(e: Elem): Elem[] { return e.kind == "group" ? (e.children ?? []).flatMap(leaves) : [e] }
```

It said: `'leaves' is not something every host provides — this script runs everywhere, so it may use only what all of them do … [DECLARE6001] (model.declare:154:96)`

**The `classFor` inconsistency (d8):**

```
script { function elClass(kind: string) { switch (kind) { case "group": return GroupEl; … default: return RectEl } } }
ElView [ datapath = :elements[], classFor = { elClass(:kind ?? "rect") } ]
```

It said: `the { } body of 'classFor' computes a typeof GroupEl, but 'classFor' is typed string — inline, a class is named bare …; a script function answers its name as a string: return "GroupEl"`

The others (d1–d5, d7, d9–d12) are quoted with their code in section (d).

**Going round in circles** happened only twice: d13 (three cycles) and d25 (two cycles before the animator list gave it away).

---

## Surprises

- That fixing whole *classes* of interaction bugs was so cheap: handles following, thumbnails updating, the conflict preview — all just more constraints on the same data.
- That the verifier refuses to press a covered view and tells you what's on top. It caught real mistakes in my tests that a Playwright-style harness would have silently clicked through.
- That `script` can see schema types (undocumented, as far as I found), and that dataset writes mutate the object you hold.

## Good

- Compile messages that name the fix: almost all of the roughly 25 I hit.
- `declare-help` as the reference; I never needed to read library source.
- Program-owned time in tests.
- The accessibility warnings, which taught me the library (`ChoiceControl`).
- `TweenLayout`, `Spring`, `Dialog [ presentation = "full" ]`, `Popover` with `opener`, `keyBindings` with `when`.

## Bad

- Runtime errors without a location (d13).
- The seams where plain JSON strings meet Declare's typed world: colours, string unions, class names, `null` versus `undefined`. This was a **pattern**, not one obstacle. It cost about 6 compile rounds and 3 boot rounds, perhaps 15–20% of my iterations. What would have let me write it right the first time is one doc page, "values that arrive from data": schema fields are `T | null`; schemas are usable in script; colours from data need validating or casting; `classFor` from script returns names and needs `use`.
- Index-based view paths in scripts are fragile around replicated children (d23, d24).

## How it differs, and what it reminded me of

It's closest to QML and to OpenLaszlo, which it says it descends from: a declarative tree, bindings as constraints, states. SwiftUI is near too, but here there's no re-render and data is a place rather than a value passed down. Unlike React, I never thought about render cycles or effects. The reactive model was the part I trusted most. The data layer (JSONPath-ish cursors, datasets that mutate in place) felt more like an older desktop framework than a modern immutable store. That's fine, but it needs saying in the docs.

## Where I'd most want improvement

1. Locations on runtime errors.
2. A "values from data" section covering the typing seams.
3. Documented dataset write and identity semantics, ideally with a cheap way to snapshot a dataset.
4. A library pattern, or class, for autosave: a serial write queue with retry, conflict and pending state. I'd guess every editing app writes one.
5. A colour well.

## What I'd use it for

Interaction-heavy desktop tools like this one — editors, canvases, dashboards — where continuity and correctness under direct manipulation matter, and where an LLM is writing most of the code. The compiler and verifier catch the kind of mistakes I make. I'd hesitate for apps that are mostly a server-backed CRUD layer with complex sync, until the data and sync story is as well documented as the view story.
## 6. The names ledger

```
NAMES — eval-presentify-12: 3 missed name(s), 1 collision(s), 0 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    18 · value     · img                  · Wordmark.accessibilityRo · —                  · foreign hint · ×1  ·   18 · resolved
         Wordmark.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | grid | r
    18 · value     · img                  · View.accessibilityRole   · —                  · foreign hint · ×1  ·   18 · resolved
         View.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | grid | row |
    18 · value     · alert                · View.accessibilityRole   · browser/Node global · foreign hint · ×1  ·   18 · resolved
         View.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | grid | row |

COLLISIONS (min · held by · name)
    18 · Declare's type · TextStyle

SUMMARY: 0 of 3 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
