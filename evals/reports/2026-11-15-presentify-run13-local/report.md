# Presentify run 13: Opus 5.5, Declare, on the local tree, standard

The second standard run on the global-names tree, now with the settle's rounds, the popover
width fix, the collapse finding, DECLARE4043 and the narrowed motion note. **50.8 min, 177
turns, 212k output tokens** (78k thinking). Not scored: the audit is the result. Timing
record: `evals/timings/2026-11-15-presentify-run13-local.txt`.

## 1. The comparison

| | 8 | 9 | 10 | 12 | **13** |
|---|---|---|---|---|---|
| total | 41.7 | 43.0 | 51.3 | 35.0 | **50.8 min** |
| turns | 142 | 143 | 153 | 134 | 177 |
| output tokens (thinking) | 188k (62k) | 217k (84k) | 221k (93k) | 185k (65k) | 212k (78k) |
| reading · writing · checking | 7.2 · 0.1 · 34.5 | 3.8 · 0.0 · 39.2 | 4.4 · 0.0 · 46.9 | 7.6 · 10.3 · 17.1 | 2.8 · 0.0 · 48.0 |
| tool time · model time | 13.6 · 28.2 | 10.4 · 32.6 | 17.9 · 33.4 | 7.2 · 27.8 | 18.3 · 32.4 |
| verify calls · help · images | 39 · 14 · 32 | 38 · 15 · 21 | 55 · 8 · 27 | 41 · 10 · 24 | 58 · 9 · 45 |
| cache reads | – | – | 48.0M | 37.5M | 51.1M |
| output per model-minute | 6678 | 6652 | 6604 | 6670 | 6546 |

- **Back in the range of runs 8–10, after run 12's fast one.** The extra time is checking:
  58 verify calls (16.6 min of tool time, 15.3 of it R5 scripts driving the app) and 45 images.
  It wrote three scripts (`assert` 39 assertions, `behaviors` 57, `tour` ~30 screenshots)
  and fixed what they found. Model pace is unchanged.
- **Code:** 3,328 lines in 7 Declare files, 2,717 without blank and `//` lines (run 12: 3,108).
- **Download:** 216 KB gzip as a production build (run 12: 216 KB).
- No browser script; the agent found `unsavedChanges` by asking for `beforeunload`.

My own work did not share the machine during this run.

## 2. What it built, and findings for the platform

All of the brief: the list (cards whose cover is the live first slide, rename and delete),
the editor grown out of its card on one spring, the slide list on a `TweenLayout`, the canvas
(draw four kinds, shift for squares, click for text, select, marquee, move, nudge, resize with
proportions, corner radius, snapping guides, groups entered by double-click, align,
distribute, order), the inspector with "Mixed", a colour palette built from the recipe
`declare-help ColorPicker` gave, undo through everything, saving with three statuses and
retry, conflicts with the other version shown, and presenting.

**For the fix round — the docs and messages that produced repeated missteps (four runs now):**

1. **Colors typed `string` in the schemas, again — and this time the agent saw the hint and
   chose otherwise.** The string→Color refusal now ends "type the schema field that holds it
   `Color` (color: Color)"; the agent's next act was `npx declare-help Color`, whose entry says
   "A color is a number" and says nothing about schema fields or hex from data
   (`compiler/src/scaffold.ts:216`). It then wrote `hex(c) = (c == "" ? null : c) as Color`
   (model.declare:70), and says why (account, d10): **unsure "whether that would have survived
   my `== ""` comparisons"** — the format uses `""` for no colour. **Proposals:** (a) the Color
   entry says how a color is written (0x…, "#RRGGBB", a name), that a schema field holding one
   is typed `Color`, and that hex from data is checked as it arrives; (b) decide whether `""` in
   a Color field or slot is no colour (null) — the open question from run 12, now with the
   reason agents give for not typing the field.
2. **`afterDelay`'s own signature returns `{ cancel(): void }`** (`declare-help afterDelay`), so
   every run writes its own handle type (`type Pending = { cancel(): void }`, model.declare:66).
   The signature should say `DelayHandle`.
3. **`Dialog.open` lists button records as `{ id, label, default?, cancel? }`** — no
   `destructive`, so Delete is again the default with nothing marking it
   (presentify.declare:188). The entry should name `destructive`.
4. **`Menu.items` lists `key?` and `command?` side by side** and says nothing of what `command`
   does for the key, so every run spells `⌘Z` by hand and dispatches through a string switch
   (`act(id)`, presentify.declare:580–640, beside the same keys bound at 516–541). The entry
   should say: `command` runs the binding and shows its key as the person's keyboard spells
   it; `key` is for a row with no command.

**Platform findings:**

5. **A constraint cycle during interaction, never at boot** (account, d19): "App.$interaction
   re-evaluated 100 times… View's SimpleLayout[x] (at app.shell.editor.body) → View.height
   (stretched by View's SimpleLayout[x]) (at …stage) → …". `body` is `flexes = true` with
   `SimpleLayout [ axis = x, align = stretch ]`; its height should not depend on the stretched
   child's. The agent replaced `align = stretch` with `height = 100%`; later bare
   "re-evaluated 100 times" lines with no loop named stopped after an unrelated edit. **To
   reproduce and fix** — it may be a real cycle in cross-axis stretch under a flexed parent.
6. **Hover and `viewAt` route differently from presses** — the agent's sharpest edge (30–40
   min). A view with no handlers (a full-size overlay, a group whose box is its children's
   union) still takes `hovered`, `cursor` and `viewAt`, while presses pass it to the views that
   declared interest. Clicks worked, so only a hover screenshot showed it. **To decide:** make
   hover and `viewAt` follow press routing, or say it in guide 9 and add a finding for a
   handler-less cover above views that have handlers.
7. **Focusing a view hidden as a `TweenLayout` arrival says "it is not focusable"** — it was
   focusable, and hidden; the hidden-view check added after Presentify 11 (which climbs
   `visible`) doesn't see an arrival's hiding. The message should say hidden, and when.
8. **classFor's first refusal leads into a second:** DECLARE4000 suggests "a function in script
   … `classFor = { shapeClass(:kind) }`"; following it, a function returning the class gets
   DECLARE6001 ("a script function answers its name as a string"). The first message should
   say the function returns the name.
9. **`object` is refused in a schema** (DECLARE5000 asks for `any`) while declare.md §3 offers
   `object`/`array` as the shapeless types for declarations. One sentence where §3 says it.
10. **Test API paths disagree:** `expect.attr("app.deck", "value.title", …)` read undefined,
    `drive.read("app.hist.undos.length")` found no node, while `declare-look --read
    app.deck.value.slides.length` worked; `expect.text("app.toast", …)` read "". A third of
    verification time went to held time and these (account, e).
11. **A finding on the library's own Menu:** "app.elMenu._panel.body scrolls on y, but its height
    comes from what it holds" — the check reports a library class's internals. To check
    whether Menu or the check is wrong.
12. **Smaller:** `onDragStart`'s `rootX`/`deltaX` meaning at drag start isn't said (shapes came
    out 21 points wide); "57 timers still waiting" in messages, never explained; two `--size`
    flags to `declare-look` silently keep the last.

The branch's new rules: none fired. The App's `onChange` assigns other values; no
DECLARE4043, no collapse finding, no "kept one settle going". `declare-help beforeunload`,
`onLeave` and `leave` all answered `App.unsavedChanges`, which it used
(`unsavedChanges = { app.sync.status != "saved" }`, presentify.declare:61).

## 3. Is it idiomatic Declare?

| | Run 10 | Run 12 | Run 13 | To-do |
|---|---|---|---|---|
| code | 2,594 lines Declare | 2,491 lines Declare | 2,621 lines Declare | 844 lines Declare |
| bytes | 133 KB | 138 KB | 137 KB | 48 KB |
| lines over 150 characters | 20 | 55 | 33 | 3 |
| colour literals outside theme declarations | 87 | 59 | 86 | 1 |
| theme reads | 102 | 103 | 113 | 69 |
| States | 3 | 3 | 4 | 7 |
| visible switches | 0 | 1 | 1 | 0 |
| branches on width or phone | 1 | 5 | 0 | 38 |
| flexes | 10 | 18 | 15 | 7 |
| browser scripts | 0 | 0 | 0 | 0 |
| page lookups | 0 | 0 | 0 | 0 |

The colour literals are mostly the slide format's defaults (`"#FFFFFF"`, `"#1D1830"`,
`"#5B3FE0"` for a new shape), which belong to the data.

**What it gets right.**
- **The shape the docs teach.** `Deck` (a `Dataset`) holds the open presentation and makes its
  writes; `History` and `Sync` are nodes with no view; where the person is lives on the App
  (`location`, `current`, `sel`, `entered`, `tool`, `editingText`), as its header says. Every
  change is one verb wrapped in `hist.step` (presentify.declare:200–330).
- **One `SlideArt` for every surface**, scaled (render.declare:29), with `classFor` per kind and
  groups recursing over `:children[]`; colours from data go straight into `fill = { :background
  ?? "#FFFFFF" }`, which the runtime reads.
- **The open grows from its card** on one spring (`openT`); the slide list glides on a
  `TweenLayout`; the conflict banner springs in.
- **Keys are bindings with `when`** (presentify.declare:516–541) and a `false` return to pass a
  key on; the tool picker and alignment are `ChoiceControl`s (both from lint advice).
- **It fixed every warning,** and two (4020, 4026) changed the design for the better.

**Missteps, with how each should be written.**
- **Colors typed `string`**, `hex()` casting, `isDark()` by hand (model.declare:31–46, 70, 178):
  `color: Color` in `Outline`, `TextBody`, `Element.fill`, `Slide.background`, and
  `Color.contrast` for the ink (finding 1).
- **Delete as the dialog's default, unmarked:** `({ id: "delete", label: "Delete", default:
  true })` → `destructive: true`, and Cancel as the default where nothing can be undone
  (finding 3).
- **Its own handle type** `Pending` → `DelayHandle` (finding 2).
- **Menu keys by hand and a string switch** (`act(id)` over `"order:front"`, `"align:left"`…)
  → `command:` on each record, naming the bound command (finding 4).
- **Casts where a schema types the value:** `loadDeck.value as DeckInfo?` (presentify.declare:136)
  on a source with `schema = DeckInfo`; `this.value as ({ deck: …, slides: … })` on `creating`,
  which has no schema — give it one; `req.errorBody as Refusal?` (model.declare:511) →
  `errorSchema = Refusal`.
- **`classFor` through a script function returning names** (render.declare:19) — the inline map
  names the classes.
- **A thumb found by walking `childViews`** (editor.declare:143) to focus it after adding a slide;
  in a handler that's allowed, but the retry around a hidden arrival (finding 7) is the cost.

**Workarounds the platform forced.**
- `pointerEvents = "none"` on the overlay and `GroupEl` to get hover through (finding 6).
- A focus retry around a `TweenLayout` arrival (finding 7).
- `height = 100%` for `align = stretch` (finding 5).

## 4. Names

**Misses:** `alert` (the hint gave `status` + `accessibilityLive`), `pulse` (a leftover),
`slides` on EditorFrame (the message gave `body.slides`), `tools` on TopBar (the agent's own
edit had deleted the block). **Collisions:** `clip` and `shown`, both refused with the rename.
**Lookups that missed:** `beforeunload`, `onLeave`, `leave` — each answered with
`App.unsavedChanges` (the concept table working).

**Silent misses** (from section 3): `string` for colours, `Pending` for the delay handle, the
menus' `key`, `default: true` without `destructive`.

## 5. The agent's account

Asked after the build by resuming the session read-only (`impressions.txt`); 16k output tokens,
509k cache reads, counted apart from the build's.

# Building Presentify in Declare: an account for the people who make it

I built a slide editor of roughly 3,300 lines of Declare across six files, plus three test scripts, in one session. What follows is reconstructed from that session. Where I quote code, it is the code as it stood at the moment, as closely as I can rebuild it. A few code passages are paraphrased, and I say so where it matters. I've marked where I'm unsure.

---

## (a) Getting up to speed

**What I read, in order:**
1. `README.md`, which pointed me to the skill.
2. `skill/SKILL.md`, whole.
3. `docs/declare.md`, whole.
4. Guide chapters 01, 04, 05 and 06, whole.
5. `apps/todo/todo.declare` and `todo-parts.declare`, whole.

That is the skill's required list, done as it says. Then, as the plan needed them:
- guide chapters 09 (pointer and keyboard), 14 (data), 17 (your own views), 18 (overlays), 21 (motion) and 23 (animated arrangements);
- `docs/operational/verify.md`;
- about thirty `npx declare-help` lookups. These included `undo`, `ColorPicker`, `TweenLayout`, `App.fullScreen`, `measureText`, `DrawContext --all`, `Color`, `FontFace.weight`, `Animator.repeat`, `View.cursor`, `View.focusable`, `DataSource.failure` and `beforeunload`.

**What I skipped:**
- I never read the tracker, desktop or calendar apps. The skill names `desktop.declare` as the model for "objects people move and resize on a surface", and that is exactly what a slide canvas is. I skipped it because it is 3,500 lines and I judged that chapters 09 and 17 covered dragging. In hindsight, reading `DeskWindow`'s drag and resize code might have warned me about the hover and `pointerEvents` behaviour that bit me later. **Unsure.**
- I didn't read chapters 07, 08, 10–13, 15, 16, 19, 20 or 22. Chapter 08 (controls) would probably have pointed me to `ChoiceControl` for the tool picker sooner; I only arrived there because of lint warnings.

**What taught me the most:**
- `docs/declare.md`. The "Seven differences" list and §5 (constraints, what you can assign, the settle) did most of the work.
- The todo app. Seeing `trackChanges`/`onChange`, `afterSettle(() => Focus.focus(...))`, `State` for looks, and the `fabDock` comment ("a strip that lets presses through (`pointerEvents = "none"`), and the button takes them back") gave me working patterns. That last comment was exactly the fix I needed much later for the selection overlay. I had read it and not connected it.
- `declare-help` was the best reference tool I have used for a new language. `declare-help ColorPicker` didn't just say "no match". It told me the intended recipe: a ChoiceControl of ChoiceItems in a Popover, with a TextInput for hex. `declare-help beforeunload` pointed me to `App.unsavedChanges`. Both landed first try.

**What was missing or misleading:**
- **Drag events.** Chapter 09 says "`onDragStart(e)`: … `e.x`/`e.y` are where the press began." It doesn't say what `rootX` and `deltaX` are at that moment. I assumed `rootX` was the current pointer, subtracted `deltaX` to get the press point, and every drawn shape came out about 20 points too wide (below).
- **`hovered` versus presses.** The asymmetry is in the docs: `hovered` is "the topmost visible view under the pointer", while presses go to "a view that has declared an interest". But nothing says what follows from it: a transparent container that takes no presses still captures hover and `viewAt`. That cost me more than anything else in the language itself.
- **Types in schemas versus declarations.** `declare.md` §3 says `object`/`array` "stand for a record or list of no declared shape". Schema fields refuse `object` and want `any`. Nothing I read said the two vocabularies differ.

---

## (b) Expressing what I wanted

**Where it fit well:**
- **Rendering a slide from data.** `SlideArt` takes `datapath` to a slide record and replicates its elements with `ElBase [ datapath = :elements[], classFor = {...} ]`. Groups recurse by having `GroupEl` replicate `:children[]` with the same `classFor`, and it just worked. Wrapping the whole thing in `scale = { s }` gave the editor, the 0.125 thumbnails, the home cards and the presenter from one class. That is the strongest thing in the build: "looks exactly as it does in the editor" was free.
- **Live thumbnails.** Free, because they read the same dataset.
- **Slide reordering glides.** The `Glide extends TweenLayout`, copied from todo, glides on `deck.moveSlide`. It took no animation code.
- **Opening a presentation grows it from its card.** One spring (`openT`) plus constraints on the editor frame's `x`, `y`, `scale` and `cornerRadius`. That's about ten lines, and it looks right.
- **States for control looks.** The `DataSource` lifecycle drove the screens directly: `decks.loaded`/`failed` gave me the loading, unreachable and empty states without any flags.
- **Keys.** `keyBindings` with `when: "inEditor"`, `args`, and a `false` return to hand a key on. Clean and readable.
- **The derived inspector.** The "Mixed" logic is attributes like `fills: string[] = { … }` and a `mixed()` method. It recomputes as the selection or data change, with no wiring.

**Where I worked against the grain:**
- **The editor's interaction logic is imperative and large.** About 400 lines of the `Canvas` class are handler and method code: move, resize, snapping, marquee, drawing, text-editing lifecycle. Declare doesn't make that worse, but doesn't help much either. It's ordinary TypeScript inside methods. The drift check warns against "a long script block", and this isn't script, but it is the same shape of code. Whether that drift is necessary here, I'm unsure.
- **Undo, saving and a conflict-aware save engine** were all hand-written (`History`, `Sync`). See (g).
- **Colours from data.** The colours are hex strings from JSON, and `fill` wants `Color`. I cast through a script helper rather than typing schema fields as `Color`. That was probably the wrong call (see d10).
- **`classFor` can't consult app state.** It wants a script function that returns a class *name as a string*, which reads oddly next to the rest of the typed world.

---

## (c) The first time it ran

The first full compile reached boot after about ten rounds of errors (d1–d13). On first boot, R4 failed with `boot: onLoad on DataSource threw: Cannot read properties of null (reading 'slides')`. After fixing that, the first screenshot of the home screen was essentially right. The first screenshot of the editor was mostly right too, with these problems:
1. **"Saving…" showed right after opening an untouched presentation.** I found it by looking at the picture. Loading the deck bumped my `rev` counter, which `Sync` treats as an edit.
2. **A Tab-order finding** from the run: "Tab goes from “Select” (…tools.0) to “All presentations” (…bar.1), which sits left of it". The tools were declared first because they're `ignoreLayout`.
3. **The logo read as a red play button**, too close to a well-known video brand. I caught that by eye.
4. Inspector warnings about roles and choices (d15).

The next things wrong only showed up under driven input; see (d) and (e).

---

## (d) Every refusal and surprise

The judgement after each item is mine: whose fault it was, and how good the platform's message was.

### Compile and boot refusals
1. **`from: Box = ({ x: 0, y: 0, w: 0, h: 0 }),`** → `DECLARE1000 expected a value, got '('`. I changed it to `{ ({…}) }`; a later lint (DECLARE1002, "redundant parentheses") moved it to `{ { … } }`. **My code was wrong; the docs are clear (§2).**
2. **Schema field `current?: object`** → DECLARE5000 (quoted in (i)). I changed it to `any`. **The docs could say this:** §3 suggests `object` is a general type name.
3. **`schema SlideList` and `class SlideList`** → `DECLARE5001 'SlideList' is declared twice`. I renamed the schema `SlidesReply`. **My code was wrong**; §7 does say schemas share the classes' namespace.
4. **`held: object = {},`** → DECLARE2000, "this reads as an object literal… give the object its own braces". **My code was wrong; an excellent message.**
5. **`accessibilityRole = alert`** → refused, with the exact replacement (`status` plus `accessibilityLive = assertive`). **My code was wrong; an excellent message.**
6. **`clip: Element[] = []` on the App** → "App already has an attribute 'clip'". I renamed it `copied`. **My code was wrong; a good message.**
7. **`const fit = (e: Element) -> Element => {…}`** → "'=>' expected… '->' is for a method's own". **I mixed the two syntaxes.** The message is very good.
8. **A dialog field with `value = { app.targetTitle }` and no `commit`** → the message offered `<->` or a `commit`. I used `<->`. **My code was wrong; the fix was given.**
9. **`classFor = { app.classOf(:kind ?? "") }`** → DECLARE4000. I followed its suggested fix exactly, a script `shapeClass` returning classes, and got DECLARE6001 next: classFor is typed `string`, and "a script function answers its name as a string". **The platform's own suggestion led to a second refusal.** The first message could say up front to return the name as a string.
10. **`fill = { classroot.color }` with a `string`** → DECLARE6001, "a color written in a string is typed Color: type the schema field that holds it `Color`". I wrote `hex(c: string): Color { return (c == "" ? null : c) as Color }` instead. **I think I took the wrong fix.** The message told me the intended one, which was to type the schema field `Color`. **Unsure** whether that would have survived my `== ""` comparisons and string building.
11. **"Object is possibly 'null'" at 12 sites** → `app.canvas` was typed `Canvas?`. I used `?.` throughout. **My code was wrong.**
12. **`'pulse' is not a member of this App`** → a leftover reference. **My code was wrong.**
13. **`'slides' is not a member of EditorFrame — a child's is: 'body.slides'`** → **my code was wrong, and the message pointed straight at the right path.**
14. **The R4 boot failure from (c).** `arrived()` assumed both deck and slides had loaded, but verify feeds each schema'd DataSource a sample and fires `onLoad` separately. **My bug.** Verify surfaced a real race that could also happen in the wild. Good.
15. **Accessibility and lint warnings:**
    - DECLARE4022: IconButton has an `on` state without `accessibilityPressed`.
    - DECLARE4035: Handle has a label but no role.
    - DECLARE4026: three ToggleChips are one choice.
    - DECLARE4020: a button nested inside a button (the ··· inside DeckCard).
    - DECLARE4025: three-deep nested `? :` (four sites).
    
    I addressed every one by restructuring. **All were correct,** and two of them (4026, 4020) improved the design.
16. **`TextInput.shown is an attribute — a child may not take an attribute's name`** → renamed to `resting`. **My code was wrong.**
17. **`'tools' is not a member of TopBar`.** I went round in a circle here; details in (i). **My mistake, in my own editing tool, not Declare.**
18. **`View.focusable expects a Focusable (one of quiet, or true | false), got the string "quiet"`** → I had written `focusable = "quiet"` bare. **My code was wrong**, though the doc line `focusable = { editing ? "quiet" : true }` primed me to write the string.
19. **Constraint cycle:** "App.$interaction re-evaluated 100 times… View's SimpleLayout[x] (at app.shell.editor.body) → View.height (stretched by View's SimpleLayout[x]) (at …stage) → …". It appeared only during driven interaction, never at boot. I replaced `align = stretch` with `height = 100%` on the three columns. Later runs still showed bare "App.$interaction re-evaluated 100 times" lines with no loop given. They stopped after I changed a Handle's `hovered` to `classroot.hovered` and added App-level keys, in the same edit. **Unsure which change fixed it, and unsure whether the platform is wrong.** The layout shouldn't have looped: body's height came from `flexes`.
20. **`drive.set("app.sync", "api", …)`** → "Sync.api is bound by a constraint… a direct write would be silently overwritten". **The platform was correct**; I set `app.api` instead.

### Layout findings
- **Tab order** (above), and again for the conflict banner: Tab went from “Slide” to “Use their version”, which sits above it. Fixed by declaration order. **Correct.**
- **"15 control(s) another view takes the presses of … (by app.presenter)".** The presenter overlay left the editor reachable to a screen reader. I hid the shell while presenting. **Correct and valuable.**
- **"app.elMenu._panel.body scrolls on y, but its height comes from what it holds"** (and the same for deckMenu). This is inside the library's Menu, so I left it. **I think the platform is reporting its own library**; unsure.

### Results that weren't what I wrote them to do
- **Drawn shapes about 21 points too wide.** I had subtracted `deltaX` at drag start. Fixed by `pressedAt(e) = at(e)`. **Docs unclear** (see (a)).
- **The hover hint never appeared.** First the selection `overlay` (no handlers, full size, on top) captured `hovered`. Then a group's view, whose box is the union of its children, covered other elements: `viewAt` at the circle's centre returned `GroupEl e5`. Presses still reached the right elements, which is why my selection tests passed. Fixed with `pointerEvents = "none"` on the overlay, its handle containers and `GroupEl`, plus `"auto"` on Handle. **Documented, but a sharp edge;** detail under the sharpest edge in the closing sections.
- **Lines rendered dashed in thumbnails at scale 0.125.** First as a rotated thin view, then as a bounding-box view with a clip band. Fixed by keeping the line at least about one screen pixel wide, via a provided `px`. **Unsure:** it looks like bitmap downsampling in the DOM renderer, which may be expected.
- **The hover outline was nearly invisible on ellipses**, because the oval `clip` clipped my rectangular hint view. Fixed by drawing the hint inside `draw()`. **My design.**
- **Escape, Delete and the arrows did nothing after clicking an inspector button.** The bindings were on the board, and focus was elsewhere. Fixed by adding App-level bindings. **My design, and correct key-walk semantics.**
- **Focusing a just-added slide thumb failed.** Console: `Focus.focus(…rows.0): it is not focusable, so focus did not move — set focusable = true on it`. It *was* focusable; it was hidden as a TweenLayout arrival. Fixed with a retry. **The platform's message is misleading here:** it should say "hidden".
- **The conflict banner and the narrow top bar overflowed.** Caught in screenshots. **My layout.**

---

## (e) Verifying it

**The ladder:**
- `declare-verify` R1–R4 after every change.
- R5 with three scripts:
  - `assert.mjs`: the §12 flow, 39 assertions.
  - `behaviors.mjs`: the finer rules, 57 assertions.
  - `tour.mjs`: about 30 screenshots I inspected one by one.
- `declare-look` for spot checks: opening frames, a 1120-wide window, the failure state.

**What each caught:**
- **R4:** the onLoad race and the Tab order.
- **assert.mjs:** that the end-to-end flow actually works against the live service, including the conflict path.
- **behaviors.mjs:** the drag-origin offset; Escape after inspector clicks; focus loss on slide delete; the layout cycle.
- **The tour:** dashed lines, the clipped banner, the clipped title, the hover problem, mixed colours highlighting a swatch, inspector overflow, and the editor being reachable behind the presenter.

**How the tools served me.** Mostly very well.
- Driving by view path, real input, and `drive.press`/`moveBy`/`release` mid-drag screenshots are excellent.
- The finding that names the view that would take a press saved me from wrong guesses more than once.
- `page.evaluate(() => window.__declare.find(...))` was my escape hatch, and it was reliable.

**Friction, and it was a pattern, not one obstacle.** I'd estimate a quarter to a third of verification time:
- **Path reading is inconsistent.** `expect.attr("app.deck", "value.title", …)` gave `undefined`. `drive.read("app.hist.undos.length")` gave "no node at 'app.hist.undos'". Yet `declare-look --read app.deck.value.slides.length` worked.
- **Held time.** It's correct and well documented, but I tripped on it three times:
  - TweenLayout arrivals stayed hidden ("rows.1 is hidden");
  - an afterDelay retry never ran between two `drive.key` calls;
  - `settleMotion` "carrying the timers" closed the Toast before I could assert it.
- **Toast lookups.** `expect.text("app.toast", …)` read "", and `page.getByText(...)` found nothing. Only `expect.attr("app.toast","shown",true)` worked.
- **Two `--size` flags in one `declare-look`** silently used the last, so both of my shots were the same.
- **"57 timers still waiting"** appeared in messages. I never learned what they were.
- **The live-service note** ("the script sent 1 write … stays there") was a valuable nudge to make my scripts clean up.

---

## (f) Confidence, part by part

- **Presentations list** (open, new, rename, delete with confirmation): **high.** Tested.
- **Slides** (add after current, duplicate, delete but not the last, drag reorder, keyboard): **high.** Tested. A 100-slide deck renders and scrolls; I didn't measure drag or scroll performance with 100 slides.
- **Drawing all four kinds, shift for square/circle, click-to-make text: high.** Lines are less tested: endpoint dragging appeared only in screenshots, never asserted.
- **Selection, move, nudge, snapping guides:** high for behaviour; guides only seen in pictures.
- **Resize, keep proportions, the shift override, corner radius:** high for rectangles. Group resize maps children linearly but isn't asserted. Text boxes only change width.
- **Groups, align, distribute, order:** high.
- **Inspector and "Mixed": medium-high.** Font and weight menus were exercised only lightly.
- **Undo granularity:** high for what I tested. **Medium** for edge cases: an inspector slider drag, and undo while a text edit is open.
- **Saving and its three statuses, retry: high.** The conflict flow is tested. Deck-level conflicts (two windows reordering) are untested; **I'd expect bugs there.**
- **Presenting: medium.** True full screen has never been seen; the headless browser refuses it.
- **Polish:** subjective. I'd expect a tester to complain that selection handles don't glide between selections, that the slide swap in the editor is a hard cut, and that cursors and the focus ring vary.

**Where a tester would most likely find problems:**
- typing in a text box at unusual zoom (metrics between `TextInput` and `Text`);
- fast actions while a save is in flight;
- clipboard between two browser windows (untested);
- the min-width floor of 1120.

---

## (g) Gaps I worked around

1. **Undo and redo.**
   - *Wanted:* a history of document changes with coalesced steps.
   - *Looked:* `declare-help undo` lists only text fields, `commitOn`, Toast, waypoint.
   - *Did instead:* `History extends Node`, with whole-document snapshots, `begin`/`end` nesting, and selection restore.
   - *Judgement:* genuinely absent, and reasonably so for a small library. A `History` over a Dataset, with transactions, would fit the language's grain well.
2. **Sync with a REST service, conflict-aware.**
   - *Wanted:* a queue of writes with retry.
   - *Did instead:* one generic `DataSource` whose `url`, `method` and `body` are attributes I set before `fetch()`, plus a diff engine.
   - *Judgement:* the platform lacks it, and it would be hard to generalise. But the "fetch settles first" rule made the generic request work cleanly.
3. **Colour picker.**
   - *Wanted:* a colour well and picker.
   - *Did instead:* `declare-help` gave the recipe, and I followed it (ChoiceControl + Swatch + Popover + hex field).
   - *Judgement:* absent by design. The help made that painless.
4. **A container the pointer passes through for hover.**
   - *Wanted:* exactly that.
   - *Did instead:* `pointerEvents = "none"` on the container and `"auto"` on the children, which todo's `fabDock` comment describes.
   - *Judgement:* it is there; I didn't apply it until hover broke.
5. **Choosing the class for a record from app state.**
   - *Wanted:* a method on the App that picks the view class.
   - *Did instead:* a script function returning a class name as a string.
   - *Judgement:* intentionally refused. It works fine; it just reads oddly.
6. **Writing a laid-out text height back to data.**
   - *Wanted:* the stored `height` to follow the text box's laid-out height.
   - *Did instead:* `measureText(content, textStyleOf(t), width)` at edit end and after style changes, while the view's height follows `Text` content.
   - *Judgement:* adequate. **Unsure** whether `measureText` and `Text` always agree.
7. **Snapping and guides, and selection handles generally.**
   - *Did instead:* wrote them from scratch.
   - *Judgement:* no library support. I didn't check whether `desktop.declare` has reusable pieces.
8. **Line hit-testing.**
   - *Did instead:* the docs suggest "a thin view rotated along it", and I did that first. Thumbnails led me to a bounding box plus a clip band.
   - *Judgement:* both work; the doc's recipe is fine for the editor at full scale.
9. **Debounced saving.**
   - *Did instead:* `afterDelay` with `cancel()` on each edit, triggered via `trackChanges`.
   - *Judgement:* the docs endorse `afterDelay` for debounce. Fine.

---

## (h) Changes of direction

1. **Line rendering, mid-build.** It went from a rotated thin view to a bounding-box view with a clip band, then to a minimum one-pixel width. *Why:* thumbnails seen in the tour.
2. **Tool picker, early.** It went from `Toolbar` with `IconButton [ on = … ]` to `ChoiceControl` of `ToolChoice`. *Why:* DECLARE4022 and the Tab-order finding.
3. **DeckCard, early.** It went from a `Control` containing an `IconButton` to a View holding an opener Control and a sibling ··· button. *Why:* DECLARE4020.
4. **Alignment toggles** became a ChoiceControl. *Why:* DECLARE4026.
5. **`classOf` on the App** became the script `shapeClass` returning a string. *Why:* DECLARE4000, then DECLARE6001.
6. **Logo.** A slide with a play triangle became two overlapping cards. *Why:* my own second thoughts.
7. **Editor columns.** `align = stretch` became `height = 100%`. *Why:* the constraint cycle.
8. **Slide keys.** They were bound on the board only, then App-wide too. *Why:* a behaviours test.
9. **Board focus.** `focusable = true` became `quiet`. *Why:* the coral focus ring around the slide looked loud in screenshots.
10. **Commands on screen.** Copy and paste lived only in a context menu; I added Edit and Arrange menus to the bar, with one `act(id)` verb shared by every menu. *Why:* re-reading the brief ("every action can be found on screen").
11. **Top bar layout and floor.**
    - The title became a TextInput with an ellipsised resting Text. *Why:* a screenshot of a long title.
    - The tools went from centred to `min(centre, right.x − width)`, and the right group became `ignoreLayout`. *Why:* screenshots at the narrow width.
    - The min width went from 1024 to 1120. *Why:* the same screenshots.
12. **Conflict banner.** A fixed 64-point bar became a wrapping card, sprung in. *Why:* a screenshot (clipped buttons) and the brief's motion goals.
13. **Hover hint.** A child View on every shape became drawing inside `draw()`, with the View kept only for text. *Why:* the oval clip.
14. **Drag origin.** Subtracting `deltaX` became using the event position directly. *Why:* a test.
15. **The status shown after load** was fixed with a `baseRev`. *Why:* a screenshot.

---

## (i) The code, quoted

**Schema type (d2):**
```declare
schema Refusal [ error: string, message?: string, field?: string, current?: object ]
```
> a shape field's type is string | number | boolean | Color | any, a schema name (capitalized), a literal union of strings, or a nested [ … ] — not 'object' [DECLARE5000] (model.declare:50:77)

**classFor, two rounds (d9).** First:
```declare
ElBase [ datapath = :elements[], classFor = { app.classOf(:kind ?? "") } ]
```
> classFor reads the record and names classes — 'app' is neither (… a function in script { } can, called with the fields it needs — classFor = { shapeClass(:kind) }) [DECLARE4000] (render.declare:27:51)

Then:
```ts
function shapeClass(kind: string) { return kind == "rect" ? RectEl : kind == "ellipse" ? EllipseEl : kind == "line" ? LineEl : kind == "text" ? TextEl : GroupEl }
```
> the { } body of 'classFor' computes a typeof GroupEl, but 'classFor' is typed string — inline, a class is named bare (…); a script function answers its name as a string: return "GroupEl" [DECLARE6001] (render.declare:32:49)

**Colour (d10):**
```declare
fill = { classroot.mixed || classroot.color == "" ? null : classroot.color },
```
> the { } body of 'fill' computes a string, but 'fill' is typed Fill — a color written in a string is typed Color: type the schema field that holds it `Color` (color: Color) … [DECLARE6001] (parts.declare:266:68)

**Boot race (d14):**
```declare
arrived() {
    if (loadDeck.loading || loadSlides.loading) return
    const d = loadDeck.value as DeckInfo
    const ss = (loadSlides.value as SlidesReply).slides
```
> R4 ✗ boot — boot: onLoad on DataSource threw: Cannot read properties of null (reading 'slides')

**The circle on `tools` (d17).** A Python rewrite I ran to change the title field replaced everything from `title:` up to `Spacer [ ],` — which silently deleted the `tools: View [...]` block in between. The next line then said:
```declare
title: TextInput [ width = { Math.max(160, parent.tools.x - this.x - 16) }, …
```
> 'tools' is not a member of TopBar — declare it (tools: <type> = …) or fix the name [DECLARE6001] (editor.declare:450:55)

I changed `parent` to `classroot` and got the same error at col 58, then grepped and found the block gone. That was two wasted rounds. The message was right all along; I didn't believe it.

**Focusable (d18):**
```declare
accessibilityLabel = "Slide", accessibilityRole = group, focusable = "quiet", clip = true,
```
> View.focusable expects a Focusable (one of quiet, or true | false), got the string "quiet" [DECLARE2000] (canvas.declare:105:78)

**The cycle (d19)**, with the columns as they stood:
```declare
body: View [ width = 100%, flexes = true,
    layout: SimpleLayout [ axis = x, align = stretch ],
    slides: SlideList [ ],
    stage: View [ flexes = true, fill = { provided("theme").stage },
        canvas: Canvas [ exists = { app.ready }, width = 100%, height = 100% ],
        … ],
    inspector: Inspector [ ] ]    // Inspector: width = 280, scrolls = y
```
> page error: constraint cycle: App.$interaction re-evaluated 100 times in one settle — it (transitively) depends on its own output. The loop: View's SimpleLayout[x] (at app.shell.editor.body) → View.height (stretched by View's SimpleLayout[x]) (at app.shell.editor.body.stage) → View's SimpleLayout[x] (at app.shell.editor.body)

It appeared during a drive script (text typed, then Escape), not at boot. Inside the canvas at that time:
```declare
s: number = { Math.max(0.05, Math.min((this.width - 2 * classroot.pad) / 1280, (this.height - 2 * classroot.pad - classroot.topRoom) / 720)) },
hint: Text [ … x = center, y = { classroot.board.y + classroot.board.height + 14 }, … ]   // could extend below the stage
```
and in Handle:
```declare
dot: View [ x = center, y = center, width = { hovered || classroot.pressed ? 12 : 10 }, … ]
```

**Drag origin:**
```declare
pressedAt(e: PointerEvent) -> Point {
    const o = board.rootOrigin()
    return ({ x: (e.rootX - e.deltaX - o.x) / s, y: (e.rootY - e.deltaY - o.y) / s })
    },
```
> unexpected error: drawn width: 420.97 is not 400

That came from a test dragging 400 points at s≈0.544 on a view that also declares `onClick`.

**Hover swallowed:**
```declare
overlay: View [ x = { classroot.sx }, y = { classroot.sy }, width = { classroot.board.width }, height = { classroot.board.height },
    visible = { !app.presenting },
    outlines: View [ width = 100%, height = 100%, pointerEvents = "none", draw(d: DrawContext) { … } ], … ]
class GroupEl extends ElBase [
    ElBase [ datapath = :children[], classFor = { shapeClass(:kind ?? "") } ] ]
```
`drive.hover("…board.art.0")` reported:
> a press on '…board.art.0' — (809, 379) in the window — would reach 'app.shell.editor.body.stage.canvas.overlay': it is covered there, or takes no presses

After adding `pointerEvents = "none"` to the overlay, `viewAt` at the circle's centre still returned `GroupEl e5`, and `hovered` stayed false. Clicks on the same point still selected the circle the whole time.

**Hidden arrival:**
```declare
focusThumb(key: string) { afterSettle(() => { const t = this.thumbFor(key); if (t != null) Focus.focus(t) }) },
```
> console.warn: [Declare] Focus.focus(app.shell.editor.body.slides.pane.rows.0): it is not focusable, so focus did not move — set focusable = true on it, or focus a control inside it

The target was a `SlideThumb extends Control`, under `Glide extends TweenLayout`, just inserted.

**Test-API inconsistencies:**
```js
await expect.attr("app.deck", "value.title", "Quarterly review");   // → got undefined
await read("app.hist.undos.length");                                // → no node at 'app.hist.undos'
await expect.text("app.toast", "at least one slide");                // → got ""
```

---

## Overall

**Surprises:**
- How far the first full compile got. After about ten error rounds, a 3,000-line program type-checked and booted with the screen essentially right.
- That `classFor` wants a string.
- That hover and presses route differently.
- That verify fires each DataSource's `onLoad` independently, which caught a real bug.

**Good:**
- Diagnostics that name the fix: DECLARE2000 object-literal braces, the accessibility role, `<->`, "a child's is: 'body.slides'".
- `declare-help` answering *concepts* ("ColorPicker", "beforeunload") with the house recipe.
- Data-driven rendering with `scale` giving one slide renderer for every surface.
- Springs and TweenLayout for motion at near-zero cost.
- Accessibility lints that genuinely improved the design.
- The R5 driver with real input and "would reach X" findings.

**Bad:**
- The pointer-routing edge (below).
- Type friction at the data boundary: hex strings versus `Color`, and `object` versus `any` in schemas.
- Inconsistent path reading in the test API.
- The "not focusable" message for a hidden view.
- No undo primitive, for an app where everything must be undoable.

**Compared with what I know.** It reminded me most of OpenLaszlo (as the README says) and QML: a declarative tree, constraints as bindings, states. Next to React, it's calmer. There's no render loop to reason about, and "derived state is never assigned" is enforced rather than advised. Next to SwiftUI, its explicit layout model ("one decider per value") is more predictable, but the editor's gesture code is just as imperative as it would be anywhere.

**The sharpest edge** was pointer routing for hover and `viewAt` through views that take no presses. It was a pattern: the overlay, then groups. It cost roughly 30–40 minutes once noticed, and it would have gone unnoticed entirely without my hover screenshot, because clicks worked. Three things would have let me write it right first time:
- a sentence in chapter 09 or `declare.md` §8 saying "a view with no handlers still takes `hovered`, `cursor` and `viewAt`; use `pointerEvents = "none"` for overlays and containers";
- or a verify finding when a full-cover view with no handlers sits above views that have them;
- or having read `desktop.declare`.

The second-largest cost was learning the test harness's held time and path rules: a pattern, roughly a third of verification time.

**Where I'd most want improvement:**
1. Make hover and `viewAt` agree with press routing, or lint the difference.
2. Make `drive.read`, `expect.attr` and `--read` accept the same paths.
3. Give the hidden-arrival focus failure a message that says "hidden".
4. Smooth the JSON-colour story, so a `string` from data passes into `fill` after one checked conversion.
5. Offer an optional `History` for datasets.

**What I'd use it for:** interactive, data-driven desktop tools and dashboards where continuity matters: editors, boards, inspectors, anything with a document model and live previews. I'd be cautious with apps whose core is heavy gesture code, until the pointer model is better documented. Even there, I'd choose it again for how well it handles the rendering side.
## 6. The names ledger

```
NAMES — eval-presentify-13: 4 missed name(s), 2 collision(s), 4 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
    19 · value     · alert                · ConflictBanner.accessibi · browser/Node global · foreign hint · ×1  ·   19 · resolved
         ConflictBanner.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | gr
    19 · member    · pulse                · this App                 · —                  · none         · ×1  ·   19 · resolved
         'pulse' is not a member of this App — declare it (pulse: <type> = …) or fix the name [DECLARE6001] (editor.declare:407:68)
    19 · member    · slides               · EditorFrame              · —                  · none         · ×1  ·   19 · resolved
         'slides' is not a member of EditorFrame — a child's is: 'body.slides' (reached through the child that holds it) [DECLARE6001] (line 225, col 21)
    28 · member    · tools                · TopBar                   · —                  · none         · ×2  ·   28 · resolved
         'tools' is not a member of TopBar — declare it (tools: <type> = …) or fix the name [DECLARE6001] (editor.declare:450:55)

COLLISIONS (min · held by · name)
    19 · attribute      · clip
    28 · attribute      · shown

DECLARE-HELP MISSES (min · asked for · answered)
     7 · beforeunload · 'beforeunload' is not a Declare name — the Declare concept is App.unsavedChanges:
     7 · onLeave · App has no member 'onLeave' and nothing near it — the member table: declare-help App
     7 · onLeave · 'onLeave' is not a Declare name — the Declare concept is App.unsavedChanges:
     7 · leave · 'leave' is not a Declare name — the Declare concept is App.unsavedChanges:

SUMMARY: 3 of 4 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
