# Presentify run 11: Opus 5.5, Declare, on the local tree, the bare prompt

The first run on the global-names tree: builders on their types (`Stroke`, `Shadow`,
`Gradient.linear`, `VisualFilter`, `Easing`), `Color`'s operations, color strings in `{ }`,
`app.hostProvided`, the focus and tooltip facts, and the node methods. **34.3 min, 129
turns, 174k output tokens** (59k thinking). Not scored: the audit is the result. Timing
record: `evals/timings/2026-11-15-presentify-run11-local.txt`.

**Launched with no `--level`**, so the agent had the bare four-sentence prompt (the SKILL's
own default of checking), where runs 8–10 had `standard`. That was my omission. Its times
compare with runs 5–7, which ran before levels with the same bare prompt, on older trees; run
10 is shown only for reference, and the difference from it measures the level as much as the
tree.

## 1. The comparison

| | 5 | 6 | 7 | **11** | 10 (standard) |
|---|---|---|---|---|---|
| total | 37.3 | 33.5 | 41.1 | **34.3 min** | 51.3 |
| turns | 126 | 145 | 148 | 129 | 153 |
| output tokens (thinking) | 179k (67k) | 175k (62k) | 189k (71k) | 174k (59k) | 221k (93k) |
| reading · checking | 6.6 · 17.2 | 2.9 · 30.6 | 6.8 · 20.7 | 5.3 · 28.9 | 4.4 · 46.9 |
| tool time · model time | 9.5 · 27.8 | 6.5 · 27.0 | 12.0 · 29.1 | 7.9 · 26.4 | 17.9 · 33.4 |
| verify calls | 29 | 26 | 30 | 40 | 55 |
| output per model-minute | 6433 | 6487 | 6506 | 6605 | 6604 |

- **In line with the bare-prompt runs.** Time, turns and tokens sit within runs 5–7; it ran
  more verify calls (40) than any of them and spent less time reading than runs 5 and 7.
- **Code:** 3,509 lines in 9 files (8 Declare, one TypeScript script file), 2,640 without
  comments and blank lines. Run 10: 3,233 lines in 7 files.
- **Download:** 214 KB gzip as a production build (`declarec`), first load.
- **Checks:** 4 kept assert scripts (`assert`, `manipulation`, `saving`, `hundred`, the last
  a 100-slide profile), `declare-format --check` clean, a final regression run over all
  four.

My own work did not share the machine during this run.

## 2. What it built, and findings for the platform

All of the brief: the list of presentations (cards with a live first slide, a menu to
rename or delete, a card the opened presentation grows out of on one spring), the editor
(slide list with drag reordering on a `TweenLayout`, the stage with handles, snapping guides,
a marquee, groups entered by double-click, typing in place), the inspector (mixed values,
a palette popover with a hex field), undo through every change, the clipboard through the
system's, saving with no Save button and a status that says where things stand, conflicts
from another window shown as a banner with both versions, and presenting full screen.

1. **Color strings did what they were for.** The service sends colors as `"#RRGGBB"`
   strings, and the program uses them as they come: `fill = { :background ?? "#FFFFFF" }`
   (slide.declare:162), `textColor = { :text?.color ?? "#1F2328" }` (slide.declare:140,
   workspace.declare:331), and the palette is a dataset of hex strings shown straight as
   chips. No color parser in the program. Run 10 wrote `colorOf(hex)` with `parseInt` and
   `colorWithAlpha` for the same data. No refusal in the run involved a color, and the
   screenshots and console showed none failing to paint.
   - **What remains:** a `paint()` helper in script (slide.declare:191) checks a string is
     hex and casts it `as Color`, because the schemas type the colors `string`
     (`fill?: string`, `color: string`). `Color` is a schema field type now; with it the
     data check would do this and the cast would go. The agent didn't find it: guide 15
     names it, but nothing it read did.
2. **`Color`'s operations went unused.** `inkAt` picks white or dark ink from a hand-written
   `luminance()` (geometry.ts:280), which also isn't relative luminance (no linearization).
   `Color.contrast(a, b)` is the operation, and the agent asked `declare-help Color`, which
   lists it. Nothing in the guide shows choosing a readable ink by contrast, which is the
   one place an app needs it. **Proposal:** one sentence and line in guide 11's color
   paragraph, with that example.
3. **ADDED after the audit: `app.unsavedChanges`.** No way to say "leaving would lose something". The agent looked for it
   (`declare-help leave`, `App.onLeave`, `App.event.leaving`, `App.pageVisible`) and wrote a
   browser script setting `window.onbeforeunload` from `Sync.pending`
   (presentify.declare:51). It also saves on `pageVisible` turning false, which is the
   platform's way. **To decide:** a fact the host honors, such as
   `app.leaveWarning = { app.sync.pending }`, read by the browser host as `beforeunload` and
   by the Mac host on window close. Language change; for the author.
4. **ADDED after the audit: `destructive: true` on a dialog's button record.** Still no destructive dialog button (run 10, finding 9). The agent read
   `library/dialog.declare` looking for one, then made Cancel the default so Return keeps
   the presentation (presentify.declare:632).
5. **`Segmented` with icons: the agent read the source.** It grepped
   `library/segmented.declare` for `icon` and `accessibilityLabel` after
   `declare-help Segmented --all` didn't settle how an icon segment is named. To check: what
   the entry says about an item's `icon` and `label`.
6. **FIXED: verify's boot check filled a color with the word "sample".** R4 boots a program
   with sample data for each schema field, and a string field got `"sample"`. Where the
   program paints that string, the new run-time refusal ("arrived as a string at run time,
   where only hex is read") failed the boot. The agent wrote its `paint()` validator because
   of this, not because of real data (account, d18). A field typed `Color` got `"sample"` too.
   Now a `Color` field gets `"#808080"` (`runtime/src/boot-check.ts`). A `string` field still
   gets `"sample"`: painting a string the schema doesn't call a color is the program's to fix,
   and the message now says how ("a schema field that holds a color is typed Color").
7. **`parent` inside a node that isn't a view.** In a `DataSource` handler inside an inline
   `Node`, `parent` was the App: at run time `parent` is the nearest enclosing *view*. The
   guide says "its parent in the tree" (04-structure.md) and `declare.md` §3 doesn't say. The
   message named the fix (`renamer.write`) but the agent couldn't see the rule (account,
   d11). **Proposal:** one clause in each: "the nearest view that holds this node".
8. **FIXED: focusing a view inside a hidden one said nothing** (`runtime/src/focus.ts` now says
   so once, naming the hidden view). `Focus.focus` on a text field in a view
   still `visible = false` left focus where it was, with no console line (account, d20). The
   `Focus.focus` entry says a view that can't take focus "says so once in the console".
9. **A parent's stroke is under its children.** The current-slide ring vanished under the
   picture it framed; the agent added a child to draw it (workspace.declare:229). This is
   "later paints on top", but a reader from CSS expects a border over the content. One
   sentence in guide 11, beside `stroke`.
10. **What it built from scratch** (account, g): an undo history on the deck, a serial write
    queue with retry, and the background saver. It asks for a `Dataset` history or
    transactions, and a documented pattern for a write queue. Evidence for the queue of
    design topics, not a defect.

## 3. Is it idiomatic Declare?

The counts, beside run 10 and the to-do app (`idiom.py`):

| | Run 10 | Run 11 | To-do |
|---|---|---|---|
| code | 2,594 lines Declare | 2,416 lines Declare, 224 lines TS | 844 lines Declare |
| bytes | 133 KB | 129 KB | 48 KB |
| lines over 150 characters | 20 | 9 | 3 |
| colour literals outside theme declarations | 87 | 46 | 1 |
| theme reads | 102 | 115 | 69 |
| States | 3 | 3 | 7 |
| visible switches | 0 | 1 | 0 |
| branches on width or phone | 1 | 0 | 38 |
| flexes | 10 | 9 | 7 |
| browser scripts | 0 | 1 | 0 |
| page lookups | 0 | 0 | 0 |

Colour literals outside the theme halved. Many that remain are the slide format's own
defaults (`"#FFFFFF"` for a new slide's background, `"#1F2328"` for new text), which belong
to the data, not the look.

**What it gets right.**
- **The shape is the one the docs teach.** The open presentation's slides are a `Deck`
  that extends `Dataset` and makes every write, with the undo history beside them
  (model.declare:39). Saving is a `Sync` node whose `status` derives from what it knows
  (model.declare:161–166), and the window's words read that. Where the person is lives on
  the App (`screen`, `cur`, `inspectorOpen`, `presenting`); what they do on the slide is an
  `Editor` node (editing.declare:20) whose selection facts are all derived (`selElems`,
  `selBox`, `count`, `leaves`). The header of each file says this, as the SKILL asks.
- **One `SlideCanvas` draws a slide everywhere**: being edited, in the slide list, on a
  card, presenting (slide.declare:161). Each element is a view picked by `classFor`, so a
  press finds its element by the ordinary hit walk; an ellipse answers inside its `clip`,
  a line along a rotated band.
- **The growing open** is one spring, `openT`, read by the workspace's place, scale,
  opacity and corners (presentify.declare:651–658), as guide 23 teaches.
- **Keys are bindings with commands**, scoped by `when` (presentify.declare:416); the slide
  list is a focus stop with its own arrow bindings (workspace.declare:146); the menus are
  records; the clipboard uses the clipboard events with a typed and a plain flavor.
- **Aliases on the App** for views used from far away (presentify.declare:187–191), typed
  with their classes.
- **Builders on their types throughout:** `Stroke(…)` 15 times, `Shadow(…)` 4, with no
  refusal.

**Missteps, with how each should be written.**
- **Menus spell their keys by hand and dispatch by id.** `editMenu`'s items say
  `key: "⌘Z"` and `picked` runs a string switch (`editCommand`, presentify.declare:487–509);
  the same keys are already bound (presentify.declare:416). An item can name the command
  instead, `({ id: "undo", label: "Undo", command: "undo" })`, which runs the binding and
  shows its key as the person's keyboard spells it, so `⌘Z` isn't Mac-only and the switch
  goes. The same for the bar's `IconButton`s: `keyHint = "⌘Z"` with `press()`
  (workspace.declare:39–64) is `command = "undo"` (`Control.command`).
- **Its own handle type for `afterDelay`.** `_timer: Cancelable?` with a script interface
  `Cancelable` (model.declare:189, 392). The type is `DelayHandle`.
- **A cast where `errorSchema` types the body.** `(req.errorBody ?? {}) as SyncRefusal`
  (model.declare:293). `errorSchema = SyncRefusal` (a schema) types `errorBody`; the
  `errorBody` reference entry says so, and the agent asked for it.
- **Colors typed `string` in the schemas**, and checked by hand (finding 1).
- **A hand-written luminance** where `Color.contrast` answers (finding 2).
- **`classFor` through a script function returning class names**, which needs `use [ … ]`
  (slide.declare:19, 186). An inline map names the classes directly:
  `classFor = { ({ rect: RectEl, ellipse: EllipseEl, line: LineEl, text: TextEl, group: GroupEl })[:kind] }`,
  with no `use` (checked).
- **Two spellings of a color in one program.** Quoted hex beside `0x…`, sometimes on one
  view (`Stroke(1, 0xFFFFFF99)` at workspace.declare:371 and 436, `0x1C183026` at
  library.declare:102, `#…` bare elsewhere). Both are legal; the docs' examples still
  write `0x…`.
- **The row height is written three times**: `Glide.rowH = 104`, `SlideThumb.height = 104`,
  and the insert bar's and drop's `104` (workspace.declare:114, 176, 205, 242).
- **Sentinel strings for "mixed" and "none"** (`"\u0000mixed"`, inspector.declare:372)
  carried through `string` attributes, where a typed value (`string | null` with a separate
  `mixed: boolean`) would say what it means.
- **A number field built by hand** (`NumberBox`, inspector.declare:244) beside the
  library's `Stepper`. The agent tried `Stepper` and left it for the brief's "Mixed" (account,
  h6).

**Workarounds the platform forced.**
- The unload warning (finding 3).
- Cancel as the dialog's default (finding 4).

## 4. Names

**Misses** — six, all resolved in the same minute (18), none from the new names.

| name | where the instinct came from | the platform's answer |
|---|---|---|
| `img` (an `accessibilityRole`) | HTML/ARIA | the list of roles (`image`) |
| `alert` (an `accessibilityRole`) | ARIA | the list of roles; it used `status` with `accessibilityLive = assertive` |
| `dragKey`, `dropAt` on a `View` | its own: written on the pane, declared on `SlideList` | "declare it or fix the name" |
| `write`, `title` on the App | its own: moved into `Renamer` | "a child's is: `renamer.write`" |

- The two role words already have their hints ("ARIA's word; Declare's is image", and an
  alert as `status` with `accessibilityLive = assertive`); the agent called them excellent.
- **A hint to consider:** for `pane.dragKey`, the message could name the class that
  declares `dragKey` (`SlideList`), as it names a child's member.

**Silent misses** (from section 3): the menu items' hand-written `key`, `keyHint`, the
`Cancelable` interface, the `string`-typed colors.

**Collisions:** a class `Divider` (a library class; renamed `BarRule`) and an attribute
declared `accessibilityLabel` (a built-in). Both refused with the rename named.

**Lookups that missed:** `onLeave` and `App.event.leaving` (finding 3).

## 5. The agent's account

Asked after the build by resuming the session read-only (`impressions.txt`); 16k output tokens,
442k cache reads, counted apart from the build's.

# Building Presentify in Declare: an account for the people who make it

All of this is reconstructed from this one session. Where I quote code, it's the code as it stood at that moment, as near as I can rebuild it. Where I'm unsure, I say so.

---

## (a) Getting up to speed

**What I read, in order**

1. `README.md`. It pointed me to `skill/SKILL.md` and `AGENTS.md`.
2. `skill/SKILL.md`, whole. This set the reading order and gave me the "What Declare handles for you" table and the drift check.
3. `docs/declare.md`, whole (944 lines).
4. The four guide chapters the skill names, whole: `01-what-declare-is.md`, `04-structure.md`, `05-run-and-check.md`, `06-layout.md`.
5. `apps/todo/todo.declare` and `todo-parts.declare`, whole.

Then I read by need:

- `09-pointer-and-keyboard.md`, whole.
- `14-data.md`, whole.
- `18-overlays.md`, whole.
- `17-your-own-views.md`, whole.
- `12-text.md`, whole.
- `21-motion.md`, whole.
- `23-animated-arrangements.md`, whole.
- About 270 lines of `apps/desktop/desktop.declare` (drag, resize, the halo), found through `npx declare-help map`.
- `docs/operational/verify.md`, read twice in parts, once to write scripts and once for the `drive` table.
- Many `npx declare-help` lookups: `View.pointerEvents`, `View.cursor`, `App.fullScreen`, `afterDelay`, `viewAt`, `DataSource.failure`, `errorBody`, `Dialog.ask`, `Clipboard`, `View.scale`, `DrawContext --all`, `Segmented --all`, `TextInput`, `Stepper`, `Toolbar`, `ToolButton`, `Checkbox`, `Menu`, `TweenLayout`, `rootOrigin`, `focusable`, `Shortcuts.items`, `Color`, `Time`, `App --all`, and "theme tokens".

**What I skipped, and why**

- Chapters 02 (notation), 03 (constraints), 07 (scrolling), 08 (controls), 10, 11, 13, 15, 16, 19, 20, 22, and 24 onward. I skipped them on the skill's instruction to "stop reading" and to look things up as needed.
- In hindsight, skipping 08 (controls) and 11 (paint and themes) cost a little. I found `Control.menu`, `ChevronIcon`, `Segmented` icon labels and theme typing by trial and error and lookups instead.
- I never read `tracker.declare` or `calendar.declare`.
- I read `desktop.declare` only around `beginSize`/`moveSize` and the halo.

**What taught me the most**

- `declare.md` §5 (the settle, who owns a constraint), §7 (data, derived datasets, wrapping rather than copying records) and §8 (`onClick` activates, `onPointerDown` manipulates).
- The "Finding what is under the pointer" section in chapter 09. It told me directly: an ellipse answers through its `clip`, and a line is a thin view rotated along it. That shaped `slide.declare` almost line for line.
- The todo app, mostly for the style: the App as "where the user is", one `Dataset` subclass making every write, and the `Glide extends TweenLayout`, which I reused nearly verbatim for the slide list.

**What was missing or misleading**

- **No guidance on undo/redo history as a whole-app concern.** The search for "undo" lands on `Toast` and `commitOn`.
- **Nothing on "a document edited, then saved in the background with retry."** The data chapter covers forms and one-shot writes well. A diff-and-push saver is a very common shape, and I designed it from scratch.
- **The `pointerEvents` subtree semantics were the decisive fact for thumbnails, and I only found them through `declare-help`.** The guide's overlay and pointer chapters don't say that `"none"` covers the whole subtree.
- **Not quite misleading:** `declare.md` says `classFor = { :kind == "heading" ? Heading : Item }`, and that inline form works. I wanted a lookup outside the constraint, and nothing in what I read said a script function must return a class *name string*. The compiler said so itself (see d1).

---

## (b) Expressing what I wanted

**Where it fit very well**

- **One drawing class, used everywhere.** `SlideCanvas` is a 1280×720 view with `scale` and `pivotX = 0, pivotY = 0`, and it draws the editor, the thumbnails, the deck cards and the presenter. "Presenting looks exactly like the editor" came for free. Scale composing correctly with hit-testing and `rootOrigin()` is what made the editor's coordinate conversion a two-line method.
- **Recursive groups through replication.** `GroupEl [ ElemView [ datapath = :children[], classFor = … ] ]` just worked on the first boot.
- **Handles that follow what they hold.** Every handle's position is a constraint on `app.editor.selBox`. There was no update code at all.
- **Motion was cheap.**
  - The inspector slides in and out through a `Spring` on its wrapper's `width`.
  - The conflict banner's room comes from a sprung `bannerT`.
  - The presentation grows from its card through one sprung `openT` that drives x, y and scale.
  - The slide list glides through `TweenLayout` with no code for reordering.
- **Keys.** `keyBindings` with `when: "inEditor"`, plus a nearer table on the slide list that takes the arrows when the list has focus. It did exactly what the walk described, and text fields kept their own keys.
- **The DataSource lifecycle.** `failure`, `statusCode` and `errorBody` mapped directly onto the brief's three save states and onto 409 conflict handling.

**Where I worked around it**

- **The sequential save queue.** It's one `DataSource` whose `method`, `url` and `body` I reassign before each `fetch()`, with a small state machine across `onLoad`/`onError` (`Sync.pump/landed/refused`). It works, but it reads like a hand-rolled coroutine.
- **Undo history.** All mine (`Deck.begin/commit/cancel/undo/redo`), relying on the convention that slides are only ever replaced whole.
- **Text box height.** The format stores "height as last laid out". I can't measure wrapped text without a view, so `TextEl` reports its laid-out height through `trackChanges = ["height"]` back to the editor, which writes it only for text the person has touched.
- **Leaving with unsaved work.** No App-level hook, so I used `window.onbeforeunload` in `script [ host = browser ]`.
- **Interaction state in a `Node` (`Editor`)** that element views reach as `app.editor`. I first considered `provided("surface")` but didn't know how to type it. `app.editor` is the todo app's `app.tasks` pattern, so I think this is idiomatic.

---

## (c) The first time it ran

- **The first spike (`spike.declare`) rendered correctly on the first try.** The one gap was the line, because I hadn't written `LineEl` yet. Data arrived cross-origin with no trouble.
- **The first boot of the whole app failed at R4** with the "sample" colour error (d18). The cause: verify feeds sample strings into my schema's `fill: string`. I fixed it with a `paint()` validator.
- **The first screenshot of the editor (opening "Field notes from the coast") looked right overall**, apart from two visual bugs:
  1. The inspector's "Send to back" button drew a `<` chevron. My `Glyph` switch used `"back"` for both the back-chevron and the send-to-back icon, and the first `case` won. I found it by looking at the screenshot.
  2. Disabled colour wells read "none". My sentinel `NONE = "\u0000none"` rendered as the visible word "none". Also found by looking.
- **In the first scenario run, typing the title landed nowhere.** The script failed `expected "Quarterly review", got "Untitled presentation"`. The cause was `Focus.focus` on a title field inside a workspace that was still `visible = false` at that settle (d20).

---

## (d) Every refusal and surprise

The verdict at the end of each item is my current judgement.

**1. `classFor` through a script lookup**

- **I wrote:** `classFor = { elemClasses()[:kind] }`, where the script returned `{ rect: RectEl, … }` typed `Record<string, typeof ElemView>`.
- **It said:** `the { } body of 'classFor' computes a typeof ElemView, but 'classFor' is typed string — inline, a class is named bare ({ :kind == "group" ? GroupShape : Shape }); a script function answers its name as a string: return "ElemView" — 2 sites [DECLARE6001] (slide.declare:146:51)`
- **I changed it to:** `elemClass(kind): string` returning names, and added `use [ RectEl, EllipseEl, LineEl, TextEl, GroupEl ]`.
- **Verdict:** my code was wrong, and the message is excellent. I'm unsure whether the `use` was needed. I added it because `declare.md` §4 says string-named classes need it for production builds. A diagnostic or a note confirming that would help.

**2. A class name clashing with the library**

- **I wrote:** `class Divider [ width = 1, height = 22, … ]`.
- **It said:** `'Divider' is a library class — a class of the program can't take its name; rename yours, as 'PresentifyDivider' [DECLARE5000]`
- **I changed it to:** `BarRule`.
- **Verdict:** fair. The library's names are a hidden namespace, and only the compiler tells you.

**3. An empty-object default**

- **I wrote:** `known: Record<string, Known> = {},` and `conflicts: … = {},`
- **It said:** `Sync.known's default = { … } is not a valid expression — this reads as an object literal, and the outer { } is the constraint's own delimiter; give the object its own braces: { { a: 1, b: 2 } } [DECLARE2000]`
- **I changed it to:** `= { {} }`.
- **Verdict:** my code was wrong, and the docs do say this. Good message.

**4. ARIA role words**

- **I wrote:** `accessibilityRole = img` and `accessibilityRole = alert`.
- **It said:** `…got 'img' — ARIA's word; Declare's is image` and `…an alert is accessibilityRole = status with accessibilityLive = assertive`.
- **Verdict:** my code was wrong, and the messages are excellent.

**5. Redeclaring a built-in attribute**

- **I wrote:** `NumberBox [ … accessibilityLabel: string = "", … ]`
- **It said:** `View already has an attribute 'accessibilityLabel' — a declaration introduces a new one; write 'accessibilityLabel = …'… [DECLARE2000]`
- **Verdict:** my code was wrong.

**6. A Dataset subclass with no data**

- **I wrote:** `deck: Deck [ trackChanges = ["gen"], onChange() { … } ],`
- **It said:** `a Dataset needs data — a literal JSON body ('deck: Deck { … }'; one the program fills itself starts from its shape's empty form, such as '{ "rows": [] }') or a derived 'contents = { … }' [DECLARE2000] (line 100, col 5)`
- **I changed it to:** `… ] { { "slides": [] } },`
- **Verdict:** my code was wrong. It's mildly surprising that a Dataset subclass whose class declares a schema can't default to that schema's empty form.

**7. A string where a word set is expected**

- **I wrote:** `send(method: string, path: string, body: object?) { req.method = method … }`
- **It said:** `a "GET" | "POST" | "PUT" | "PATCH" | "DELETE" is one of a fixed set of words, and this one reached here as a plain string… Give the local its type… [DECLARE6001] (model.declare:247:9)`
- **Verdict:** my code was wrong, and the message is good.

**8. Members not visible through an alias typed `View`**

- **I wrote:** in `SlideThumb.onDrag`, `const pane = app.slidePane; pane.dragKey = classroot.key`, where the App had `slidePane: View = { … }` and the pane declared `dragKey`/`dropAt` inline.
- **It said:** `'dragKey' is not a member of View — declare it… — 2 sites` and the same for `dropAt`.
- **I changed it:** moved the drag state onto the `SlideList` class and added `slideList: SlideList = { app.workspace.body.slides }`.
- **Verdict:** my code was wrong. `04-structure.md` warns about exactly this ("typed with a base class… the named children are hidden").

**9. A string where `Fill` is expected**

- **I wrote:** `PaletteChip [ fill = { classroot.c } ]` with `c: string`.
- **It said:** `the { } body of 'fill' computes a string, but 'fill' is typed Fill [DECLARE6001]`
- **I changed it to:** `classroot.c as Color`.
- **Verdict:** fine. A typed string needs a cast. Interestingly, `fill = { :fill ?? null }` from a schema string field was *not* refused, which I can't explain (unsure).

**10. `string | null` passed as `string`**

- **I wrote:** `e.types.includes(T) ? e.get(T) : ""`
- **It said:** `Argument of type 'string | null' is not assignable to parameter of type 'string'.`
- **I changed it to:** `e.get(T) ?? ""`.
- **Verdict:** my code was wrong.

**11. `parent` inside a DataSource handler in an inline `Node`**

- **I wrote:**
  ```
  renamer: Node [ title: string = "",
      begin(id: string, t: string) { … read.fetch() },
      read: DataSource [ url = "", schema = DeckInfo,
          onLoad() { … parent.write.url = …; parent.write.body = ({ version: d.version, title: parent.title }); parent.write.fetch() } ],
      write: DataSource [ … ] ],
  ```
- **It said:** `'write' is not a member of this App — a child's is: 'renamer.write' (reached through the child that holds it) — 3 sites` and `'title' is not a member of this App`.
- **I changed it:** promoted it to `class Renamer extends Node [ … ]` and used `classroot.write`.
- **Verdict: unsure.** I expected `parent` of the DataSource to be the Node. Either `parent` means "the enclosing *view*" and skips non-view nodes, or an inline anonymous `Node` resolves differently. The message pointed at the right fix, but I don't understand the rule. A sentence in `declare.md` §3 would settle it.

**12. A shifted symbol in a key binding (warning)**

- **I wrote:** `({ key: "Ctrl+Shift+]", … })`
- **It said:** `"Ctrl+Shift+]" is a key no press can match — a symbol is spelled as the one the keys type… "Ctrl+}" [DECLARE4038]`
- **Verdict:** my code was wrong. The guide does say this, and I'd missed it.

**13. A label with no role (warning)**

- **On:** `Stage` and `NumberBox`.
- **It said:** `has an accessibilityLabel but no role, so nothing reads it [DECLARE4035]`
- **I changed it to:** `region` and `group`.
- **Verdict:** good catch.

**14. A button inside a button (warning)**

- **On:** `DeckCard extends Control` containing an `IconButton` "more".
- **It said:** `more (a button) is inside DeckCard (a button): … Make them siblings in a plain View [DECLARE4020]`
- **I changed it:** `DeckCard` became a plain View holding an `open: Control` and a sibling `more`.
- **Verdict:** good catch, and a real accessibility bug.

**15. Three nested `? :` choices (lint)**

- **On:** `PillButton.fill` and `IconToggle.fill`.
- **It said:** `fill decides through 3 nested ? : choices… [DECLARE4025]`
- **I changed it:** the spot and on variants became `State`s. Others I left alone.
- **Verdict:** fine advice.

**16. Redundant parentheses (hint)**

- `theme = { ({ ...SanFrancisco, ...Presentify }) }` drew `[DECLARE1002]`. Fixed.

**17. `accessibilityValue` is numeric**

- **I wrote:** `accessibilityValue = { wellWord(classroot.value) }` on `ColorWell`.
- **It said:** `…'accessibilityValue' is typed number`.
- **I changed it:** moved the text to `tooltipLabel`.
- **Verdict:** I'm unsure there's no string value attribute for a colour well's current value. I didn't look further.

**18. Boot failed on verify's sample data (R4)**

- **It said:** `boot: the color "sample" arrived as a string at run time, where only hex is read — write it as "#RRGGBB"… Nothing was painted.`
- **I wrote at the time:** `fill = { :fill ?? null }`, `textColor = { :text?.color ?? "#1F2328" }`, `fill = { :background ?? "#FFFFFF" }`.
- **I changed it:** wrapped every colour in a script `paint(c)` that returns null unless the value matches `#RRGGBB` or `#RRGGBBAA`.
- **Verdict: partly the platform.** Verify's samples for a `string` field are words, which are never valid colours. Defensive rendering is good practice, but I wrote it because of the checker, not because of real data. A schema-level colour type (`fill?: Color`) might avoid this. I didn't try it.

**19. A test write to a constrained attribute**

- **I wrote:** `drive.set("app.sync", "api", …)`
- **It said:** `Sync.api is bound by a constraint (Sync.api) — a direct write would be silently overwritten; change what the constraint reads instead`
- **I changed it to:** `drive.set("app", "api", …)`.
- **Verdict:** my test was wrong, and the guard is good.

**20. Focus silently didn't land (behaviour, no message)**

- **The code:** in `creator.onLoad`, `app.start(...)` set `screen = "editor"`, then `afterSettle(() => { app.renameNow() })`, which calls `Focus.focus(title); title.select("all")`. The workspace had `visible = { app.openT > 0.002 }`, and the spring was still at 0.
- **What happened:** the typed title went nowhere. No warning appeared.
- **I changed it to:** `visible = { app.screen == "editor" || app.openT > 0.002 }`.
- **Verdict:** my code was wrong, but **the platform's silence is the sharp edge here.** A dev-mode warning such as "Focus.focus on a view that isn't visible" would have saved a test run and some reasoning.

**21. A class name used as a path step (test)**

- **I wrote:** `drive.click("app.workspace.body.side.Inspector.2.body.0.controls.ColorWell")`
- **It said:** `no node at '…ColorWell' — 'ColorWell' is a class,…`
- **I changed it:** gave the wells accessible names and clicked `app."Fill colour"`.
- **Verdict:** my mistake. Naming by label was the better result anyway.

**22. Layout finding in the palette**

- **It said:** `app.colorPop.hexRow's children need 270 across and it has 220, so app.colorPop.hexRow.2 runs past its end… ` and `…runs past the window's right edge at 1280 wide (it ends at 1291).`
- **I changed it:** the TextInput `width = 120` became `flexes = true`, and the buttons got `padH = 10`.
- **Verdict:** a real bug, and very useful to have found automatically.

**23. A just-arrived row was hidden (test)**

- **It said:** `'app.workspace.body.slides.pane.rows.1' is hidden (its own visible is false), so a drag can't reach…` This happened twice: after duplicating a slide, and after adding one.
- **I changed it:** added `drive.settleMotion()` before the drag.
- **Verdict: platform behaviour, documented** ("an arrival waits, hidden, at its own place until the glide lands", chapter 23). It surprised me twice because the script holds the clock. I'm unsure whether a real person could hit this in the 260 ms window, for example by right-clicking a just-duplicated slide at once.

**24. Reorder dropped nowhere (test, then a design gap)**

- **The code:** `list.dropAt = Math.round((y - 4) / 104)` on pointer y, and the test dragged `rows.1` by `(0, -100)`.
- **It said:** `expected values to be "po0g80ri9xt", got "s110"`.
- **Verdict:** the logic was correct and the test drag was too short. Changed it to −110. While there I added a drag ghost, which was genuinely missing.

**25. Float noise in line endpoints**

- **It said:** `expected ["line",700,100,1000,100], got ["line",700,100.00000000000004,999.9999999999999,100]`
- **I changed it:** `toSlide` now rounds to hundredths of a point.
- **Verdict:** my code was wrong. Root-to-slide maths with scale produces float noise, so persisting raw values was a bug.

**26. Marquee selected two things, not one (test)**

- **It said:** `expected 1, got 2`.
- **Verdict:** my test's box also touched the rectangle the test had earlier enlarged. Test error.

**27. Clicking one of several selected things kept all of them (real bug)**

- **It said:** `expected 1, got 3 (after: key Mod+C → click … "New slide" → key Mod+V)`.
- **Cause:** pressing an already-selected item kept the whole multi-selection, with no narrowing on release.
- **Fix:** added `_narrowTo`, applied in `endDrag` when the press didn't move.
- **Verdict:** my bug. Found only because the test assumed standard behaviour.

**28. Double-click picked the other ellipse (test)**

- **It said:** `expected ["po53e7z7ppx"], got ["po53e795p6u"]`.
- **Verdict:** two pasted ellipses overlap, and hit-testing correctly took the top one. Test error.

**29. `__declare.find` by class name (test)**

- **I wrote:** `__declare.find("app.workspace.bar.titleBox.SaveStatus").childViews[1].text`
- **It said:** `Cannot read properties of null (reading 'childViews')`.
- **I changed it:** named the views `status` and `words`.
- **Verdict:** my mistake. Unnamed class instances aren't path steps.

**30. A parent's stroke hidden under its child**

- **I wrote:** `frame: View [ clip = true, stroke = { here ? Stroke(2.5, accent) : … }, SlidePicture [ … ] ]`
- **What happened:** the current-slide ring was invisible. The picture painted over its parent's stroke.
- **I changed it:** added a `ring` child after the picture.
- **Verdict:** consistent with "children paint above". A beginner from CSS expects a border to sit on top. Worth one sentence in `11-paint-and-themes`.

**31. The conflict banner spilled past its bottom**

- **I wrote:** `class ConflictBanner [ width = 560, height = 96, padding = [12, 14, 12, 12], … ]`
- **What happened:** the buttons spilled below its bottom edge.
- **I changed it:** removed `height` so it sizes to its content, and derived the banner's room from `this.banner.height`.
- **Verdict:** my code was wrong. Verify didn't flag this one. I believe that's because the banner was never built at boot, and the scripts reached it only where it was offset (unsure).

**32. One environment note (not the platform)**

- My first failure screenshot, `/tmp/pf-01-new.png`, showed a *different* Presentify ("Add slide", "Slide 1" inspector). Another process on the machine writes the same file names. I lost a few minutes to that before switching to a unique prefix.

---

## (e) Verifying it

**`declare-verify` rungs 1–4** caught every error in (d), up to the sample-colour boot failure. It runs in a few seconds, reports every error in one pass, and every message named the fix. This was the best part of the toolchain.

**`declare-look --shot`** caught all the visual bugs:

- the "back" icon name collision;
- wells reading "none";
- the oversized Font and Weight pickers (I wrote `PickButton` for these);
- the hidden thumbnail ring;
- the overflowing banner;
- Return defaulting to Delete in the delete dialog.

That last one I caught by looking at the screenshot. It isn't a platform finding.

**Assert scripts (R5)** — `assert.mjs` (the §12 scenario), `manipulation.mjs`, `saving.mjs` and `hundred.mjs`:

- They caught the focus bug (d20), the multi-select narrowing bug (d27) and the float noise (d25), and they confirmed save, offline and conflict behaviour against the live service.
- Things that made them easy:
  - finding views by label (`app."Fill colour"`, `'app.slideMenu."Duplicate slide"'`);
  - `drive.press/moveBy/release`;
  - `expect.request`;
  - the held clock, which made the two-second save wait deterministic.
- Things that made them harder:
  - **I needed `page.evaluate(() => __declare.find(...).childViews.findIndex(...))` to locate a handle by its `kind`.** A path step by attribute value would help.
  - **The held clock hides glides**, which explains d23.
  - **The scripts write to the live service.** I made each one create and delete its own presentation. A nicer alternative to `--fixtures` for a read-write service would help.

**`drive.profile`** on 100 slides: the costliest turn was about 17 ms, and drags cost about 3 ms per frame. Easy to read.

**`--semantics`** confirmed the screen-reader names quickly.

**Not verified:**

- real browser full screen;
- the opening animation mid-flight (my `--no-settle` attempt used `--wait-real`, which let the spring finish);
- dark mode (not asked for);
- `beforeunload`;
- cross-window paste through the system clipboard.

---

## (f) Confidence, part by part

**High (driven by tests):**

- presentation list, new, open;
- drawing all four kinds;
- Shift for squares and circles;
- click-to-place text;
- resize, proportions, corner radius kept on resize;
- line ends;
- marquee, nudge, align, distribute, group and ungroup;
- going into a group;
- copy and paste across slides;
- undo and redo of every listed action, including slides, with selection restored;
- the save states, offline and recovery, ⌘S;
- conflicts on the "use theirs" path;
- presenting with the arrow keys, and Escape returning to the right slide.

**Medium (written and looked at, not driven):**

- **Rename and delete from the list.** Screenshots only; I never pressed Rename or Delete to completion.
- **The menus:** element context menu, Edit and Arrange menus, font and weight menus.
- **Inspector controls:** the italic toggle, the stepper buttons, typing hex into the palette.
- **"Keep mine"** in a conflict.
- **Ordering:** bring forward, send backward.
- **Presenting:** click and space to advance.
- **Hover outlines and move cursors.**
- **The drag ghost.**
- **Queued opening while a save is pending.**
- **The fix for a periodic conflict check racing my own save.** Found in review, never observed or tested.

**Where I'd expect a tester to find problems:**

- Text box resizing: height follows content, so vertical handles on text do little.
- Resizing a group that contains text: fonts don't scale.
- Snapping is limited to elements at the same level.
- With several windows editing the same deck, whoever saves the slide order or title last wins.
- `Sync`'s POST after an unknown-outcome network failure could create a duplicate slide.
- Undoing "use their version" will re-save my version over theirs. I think that's coherent, but it's arguable.
- The hover outline uses `trackChanges` on `hovered` and might flicker during drags.
- The inspector needs scrolling at 800 px tall.

---

## (g) Gaps I worked around

**1. Undo history**

- **Wanted:** dataset-level history, or transactions.
- **Looked at:** `declare-help undo` (Toast, commitOn, NativeText), and the tracker's toast-undo.
- **Built instead:** `Deck.past/future/open/begin/commit/cancel`.
- **Judgement:** likely genuinely absent. A `Dataset.history`, with steps per settle or per explicit begin and commit, would suit the language well, since settles are already atomic.

**2. A colour picker**

- **Looked at:** `ls library/`. No ColorPicker or ColorWell.
- **Built instead:** a `Popover` with a swatch grid and a hex field.
- **Judgement:** absent.

**3. A hook for leaving with unsaved work**

- **Looked at:** `declare-help App --all`, and searched for "leave" and "onLeave".
- **Built instead:** `script [ host = browser ] { window.onbeforeunload = … }`, plus `sync.now()` when `pageVisible` turns false.
- **Judgement:** probably absent. `verify.md` mentions that programs "save on leave" and that a "Leave site?" prompt gets answered, so there may be a mechanism I didn't find (unsure).

**4. Measuring wrapped text without a view**

- **Wanted:** the height of a text block at a given width.
- **Found:** `measureText`, which is a single run.
- **Built instead:** the live view reports its height (`trackChanges = ["height"]` → `noteTextHeight`), written only for text the person has touched.
- **Judgement:** unsure. It may exist under a name I didn't try.

**5. A sequential request queue**

- **Built:** one `req: DataSource` with dynamic method and URL, plus `onLoad/onError` driving `pump()`.
- **Judgement:** the platform has the pieces, and the docs discourage the promise from `fetch()`. A documented pattern for "a queue of writes, one at a time" would help a lot.

**6. "Mixed" in standard controls**

- **Wanted:** a mixed state in `Stepper`, and an indeterminate `Checkbox`.
- **Built instead:** `NumberBox` (a TextInput with placeholder "Mixed" plus ± controls), and a "(mixed)" suffix on the checkbox label. `Segmented` takes `value = null`.
- **Judgement:** unsure whether `Checkbox` has an indeterminate state. I didn't check `--all`.

**7. A destructive dialog button**

- **Looked at:** grepped `dialog.declare` for `destructive|danger`. Found nothing.
- **Did instead:** made Cancel the default.
- **Judgement:** absent, I think.

**8. A selection and hover overlay**

- **Built:** by hand in screen space over the scaled canvas.
- **Judgement:** that's my app's job. A note on "an overlay that tracks a scaled child" would still have helped.

**9. A save spinner**

- **Left as:** a static arc glyph.
- **Judgement:** I didn't look for a library spinner.

---

## (h) Changes of direction

1. **Classes from a script lookup → class-name strings.** Early. Cause: the refusal in d1.
2. **Server ids in slide records → a separate `known` map in Sync.** At design time, before writing. Cause: my own second thoughts, because undo snapshots would carry stale ids and create duplicates.
3. **Writing every text box's laid-out height → only text the person touched.** At design time. Cause: realising that height writes from merely viewing a slide would bump versions and produce false conflicts in other windows.
4. **A transient drag preview → writing the deck every frame inside an open undo step.** At design time. Cause: simplicity, and it gives live thumbnails for free.
5. **Element hit-testing by `viewAt` from the stage → handlers on element views, with thumbnails switched off by `pointerEvents = "none"`.** At design time. Cause: the `pointerEvents` reference saying it covers the whole subtree.
6. **`Button` for Font/Weight and a `Stepper` for numbers → `PickButton` and `NumberBox`.** Mid-build. Cause: screenshots, where the Buttons were oversized, and the brief's "Mixed".
7. **Inline `renamer: Node` → `class Renamer`.** Cause: the refusal in d11.
8. **`DeckCard extends Control` → a View with a sibling Control.** Cause: DECLARE4020.
9. **Slide reorder with just an insertion bar → with a ghost** and pointer-centred maths. Cause: the test failure (d24), then second thoughts about the brief ("dragged view is the pointer's").
10. **Corner radius from absolute pointer x → delta from the press.** Cause: second thoughts while writing the handle, which sits 14 px in at radius 0.
11. **Fixed-height conflict banner → content-sized.** Cause: the screenshot.
12. **Delete dialog defaulting to Delete → defaulting to Cancel.** Cause: the screenshot plus the brief ("nothing is deleted by a single slip").
13. **Opening a deck immediately → queued behind a pending save.** Late. Cause: my own review. I spotted the data-loss path and never observed it.
14. **The perf test needing a deck I'd made by hand → creating and deleting its own.** Late. Cause: wanting to leave the service clean.

---

## (i) Code quoted for reproduction

Covered inline in (d). The four I'd most want the platform team to reproduce:

1. **d11, `parent` in a DataSource handler inside an inline `Node`.** Minimal form:
   ```
   App [ r: Node [ t: string = "x",
       a: DataSource [ url = "", onLoad() { parent.b.fetch() } ],
       b: DataSource [ url = "" ] ] ]
   ```
   As I recall, it produced `'b' is not a member of this App — a child's is: 'r.b'`.
2. **d20, focus on an invisible view: silent.**
   ```
   w: View [ visible = { app.t > 0.002 }, f: TextInput [ ] ]
   ```
   Call `afterSettle(() => Focus.focus(app.w.f))` while `t` is 0. Then `drive.type` goes nowhere, with no diagnostic.
3. **d18, verify's samples breaking a string used as a colour.**
   ```
   schema S [ c: string ]
   … DataSource [ schema = [ s[]: S ] ]
   View [ fill = { :c } ]
   ```
   R4 fails with `the color "sample" arrived as a string…`.
4. **d9 vs RectEl.** `fill = { classroot.c }` with `c: string` was refused, while `fill = { :fill ?? null }` from a schema `fill?: string` was accepted. Either the datapath read is typed loosely, or I misread. Unsure.

---

## Overall

**Surprises**

- How much of a hard UI came out right the first time it ran: recursive groups, scaled hit-testing, handles following through constraints.
- That the diagnostics read like a reviewer who knows my intent ("ARIA's word; Declare's is image").
- On the other side, the few silent behaviours: focus on an invisible view (d20), the hidden arrival (d23), and the parent stroke under its child (d30).

**Good**

- The compiler and diagnostics.
- `declare-help` answering by name.
- View paths by label in tests.
- The held clock.
- `pointerEvents` subtree semantics.
- Springs and `TweenLayout`.
- `keyBindings` and the key walk.
- `DataSource.failure`.
- The skill's reading order. It was right, and the todo app is an excellent first program.

**Bad**

- Whole-app patterns are missing: undo history, a write queue, a background saver. These are the expensive parts of a real editor, and I designed all of them from scratch.
- A few silent failures.
- Scripts that test a live read-write service need care.
- The documentation is big. Reading cost a large share of the session, roughly a quarter of it, though nearly all of that reading paid off.

**Compared with what I know**

- It feels like **SwiftUI's declarativeness, with Elm-like discipline**: derived state is never assigned.
- **Data-driven replication reminded me of XSLT and OpenLaszlo datapaths**, which the README credits as its heritage.
- **Pointer handling is closer to UIKit** than to React: explicit drag phases, no bubbling.
- There's no virtual DOM to reason about, and in practice I never thought about re-rendering at all, which is the language's main promise and it held.

**Where I'd most want improvement, in order**

1. A history or transaction facility on `Dataset`.
2. A documented pattern, or a class, for a serial write queue with retry.
3. Dev-mode warnings for focus or interaction aimed at invisible views.
4. Library additions: a colour well, a mixed state on value controls, a destructive dialog button.
5. A path step by attribute value in `drive` and `__declare.find`.

**On "the hardest part"**

It was a pattern, not one obstacle: whole-app machinery the platform leaves to the author (undo, saving, conflicts). That was most of the design time, roughly a third of the build. To have written it right the first time, I'd have needed a guide section on "a document editor": history, background save, and conflict resolution with a DataSource.

The sharpest *edge* was the silent focus failure. One obstacle, and it cost one failed test run plus some reasoning.

**What I'd use it for**

Interactive tools with rich direct manipulation and motion: editors, dashboards, design tools, kiosks. That is exactly where its constraints-plus-springs model removes the most code. For a CRUD form app it would be pleasant but less decisive.

## 6. The names ledger

```
NAMES — eval-presentify-11: 6 missed name(s), 2 collision(s), 2 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    18 · value     · img                  · SlideCanvas.accessibilit · —                  · foreign hint · ×1  ·   18 · resolved
         SlideCanvas.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | grid 
    18 · value     · alert                · ConflictBanner.accessibi · browser/Node global · foreign hint · ×1  ·   18 · resolved
         ConflictBanner.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | gr
    18 · member    · dragKey              · View                     · —                  · none         · ×1  ·   18 · resolved
         'dragKey' is not a member of View — declare it (dragKey: <type> = …) or fix the name — 2 sites, also on line 203 [DECLARE6001] (workspace.declare:196:14)
    18 · member    · dropAt               · View                     · —                  · none         · ×1  ·   18 · resolved
         'dropAt' is not a member of View — declare it (dropAt: <type> = …) or fix the name — 3 sites, also on lines 202, 204 [DECLARE6001] (workspace.declare:198:14)
    18 · member    · write                · this App                 · —                  · none         · ×1  ·   18 · resolved
         'write' is not a member of this App — a child's is: 'renamer.write' (reached through the child that holds it) — 3 sites, also on lines 544, 545 [DECLARE6001] (line 543, col 24)
    18 · member    · title                · this App                 · —                  · none         · ×1  ·   18 · resolved
         'title' is not a member of this App — a child's is: 'renamer.title' (reached through the child that holds it) [DECLARE6001] (line 544, col 74)

COLLISIONS (min · held by · name)
    18 · library class  · Divider
    18 · attribute      · accessibilityLabel

DECLARE-HELP MISSES (min · asked for · answered)
    23 · onLeave · App has no member 'onLeave' and nothing near it — the member table: declare-help App
    24 · App.event.leaving · no entry for 'App.event.leaving' — searched reference (2017 entries), classes (109), enums, diagnostics, the hint tables, and the concept table.

SUMMARY: 4 of 6 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
