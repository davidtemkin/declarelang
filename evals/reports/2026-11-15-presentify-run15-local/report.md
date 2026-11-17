# Presentify run 15: Opus 5.5, Declare, on the local tree, minimal

The last run of the minimal round ("it must build and start with no errors. Check that and
nothing more: do not drive it, script it, take screenshots of it or look at it in a browser").
**21.6 min, 64 turns, 139k output tokens** (61k thinking). Timing record:
`evals/timings/2026-11-15-presentify-run15-local.txt`.

## 1. The score

**The hidden drive: 5 of 19**, as handed over (`drive-results.json`). Fourteen fail, and **eleven
of them are one platform bug**: the compiler rewrote the program's hex-string colors into
numbers inside data records, the service refused every slide save (422), and the app — which
sets a 422 aside as "refused format" — kept showing "All changes saved". Every scenario that
draws then fails as "never stored".

**The bug, reproduced** (`repro-color-wire.declare.txt`):

```declare
schema Shape [ id: string, fill: Color ]
script { type Hex = `#${string}` }
App [ made: Shape = { { id: "a", fill: "#5B3DF5" } }, hex: Hex = { "#5B3DF5" }, plain: string = { "#5B3DF5" }, … ]
```

`JSON.stringify` gives `{"id":"a","fill":5979637}`, `5979637`, and `"#5B3DF5"`. The compile pass
that turns a color literal into its number wherever TypeScript expects a color
(`colorLiterals`, compiler/src/typecheck.ts:388) fires on any `` `#${string}` `` context — a schema
`Color` field and the agent's own `Hex` alias included — so a record built for the wire leaves in
a form the service rejects. Seen in the app's own save: `PUT /api/slides/s102
{"elements":[{"kind":"rect",…,"fill":5979637,…}]} → 422`. The pass predates this round; the hint
("type the schema field that holds it `Color`") is what sends programs into it, and the agent
did exactly that. Its account (d9) and a runtime read (`data-schema.ts:40`) show it checked that
the *runtime* doesn't coerce strings, "because coercion would have caused … 422 refusals" — the
compiler did it instead, where it could not see.

**Audit probe, not a score** (`probe-results.json`): with the eight record literals wrapped in
`Color.hex(…)` (a string at run time), the same app passes **14 of 19**; with `inkFor()`'s two
literals too, the five remaining scenarios give two more passes — **16 of 19** in all. The last
three are the app's own: a side handle's resize not stored, a drag that lands short
(440,322 against about 357,283), and no control named "Fill" in the inspector (its swatches carry
no such name). Not investigated further.

## 2. Seen running (beside Presentify 14, standard, at 1440×900)

`seen-*.png`, each pair 15 then 14: the editor with a rectangle drawn and selected, the Edit menu,
the delete dialog, the home screen, and both on a phone.

- **Editor, menu, dialog: no lost polish.** Both inspectors are tidy; 14's is fuller (position
  and size fields, corner presets), 15's has swatches and hex fields for fill and outline. The
  menus are clean, with keys shown. The delete dialogs match: Delete marked destructive in red,
  Cancel the default.
- **On a phone both break the same way**: the home screen's cards and headline run off the right
  edge (14 loses its New presentation button there too). Neither run treated Presentify as a
  phone app; no loss relative to standard.

## 3. The comparison

| | 12 | 13 | 14 (standard) | **15 (minimal)** |
|---|---|---|---|---|
| total | 35.0 | 50.8 | 38.1 | **21.6 min** |
| turns | 134 | 177 | 146 | 64 |
| output tokens (thinking) | 185k (65k) | 212k (78k) | 194k (70k) | 139k (61k) |
| reading · writing · checking | 7.6 · 10.3 · 17.1 | 2.8 · 0.0 · 48.0 | 4.4 · 0.0 · 33.7 | 9.4 · 7.9 · 4.3 |

- **Tokens:** 139k output, 120 fresh input, 318k cache writes, 13.2M cache reads; context **204k
  at the first app write, 327k at the end**.
- **Code:** 3,031 lines in 7 files (6 Declare, one TypeScript script file), 2,388 without comments
  and blank lines (Presentify 14: 3,305 and 2,573). **Download:** 210 KB gzip (Presentify 14,
  built today: 216 KB).
- **Source reads:** five, all in `runtime/src`: a search for how a 204 is handled, and
  `data-schema.ts` / schema validation, to learn whether a `Color` field coerces strings (§1).

## 4. The refusals (read in the stream; all named their fix unless noted)

1. Name collisions, each one round: `Toolbar` (library class), `TextStyle` (a Declare type),
   `clip` (an App attribute).
2. Layout: a child's own `y` and `width` under a layout that places and sizes it.
3. `focusable = "quiet"` as a bare value — "expects … quiet (bare)"; correct.
4. **A Dialog child named `show`** → "'show' is already a member of Dialog — … Give Dialog an
   attribute and read it in the child" — the same misleading advice Murmur 19 met for `close`
   (reproduced again: `Dialog [ show: Button [ … ] ]`). `show` is a method. **Second run.**
5. The color cascade (account d9): string colors refused for `fill`/`textColor` with the "type it
   `Color`" hint → schema fields made `Color` → `string` not assignable to `NonNullable<Color>`
   (the round's new required-field type, doing what it should) → a return type written
   `` `#${string}` `` → **"unexpected character '`'" [DECLARE1000]** (reproduced:
   ``ink() -> `#${string}` { … }``; a template-literal type is refused in a Declare signature,
   with no word of why or what to write) → a script `type Hex` alias, which compiled — and whose
   literals the compiler then turned into numbers (§1).
6. Warnings, each a real improvement: an `IconButton` that shows "on" without
   `accessibilityPressed`; a `Stepper` with no name; a button inside a button (`more` in
   `DeckCard`); a three-deep `? :`.

## 5. Findings for the platform

1. **Color literals become numbers in data records** (§1). The decision for DT: in a data
   record, a color is the data's form. Options: the literal pass skips schema-typed contexts (a
   schema `Color` field's type a distinct alias the pass knows), so `"#5B3DF5"` stays a string; or
   a record bound for the wire is serialized with colors as `"#rrggbb"`. Either way, the hint that
   sends programs to `Color` must not lead to a 422.
2. **A template-literal type in a Declare signature** is refused as "unexpected character '`'".
   Either accept it (it is TypeScript, and `Color`'s own definition uses it) or say what to do.
3. **The Dialog-member message** (§4.4), now in two runs.
4. Its asks: a sanctioned string → `Color` door for user-typed hex (it wrote `asColor`, "a cast in
   disguise"); and a color picker (`declare-help ColorPicker` says there is none and how to build
   one; it built swatches).

## 6. Is it idiomatic Declare?

| | Presentify 14 | Presentify 15 |
|---|---|---|
| code | 2,573 lines Declare | 2,117 lines Declare, 271 lines TS |
| lines over 150 characters | 22 | 4 |
| colour literals outside theme declarations | 51 | 43 |
| theme reads | 109 | 103 |
| States | 2 | 5 |
| visible switches | 4 | 3 |
| branches on width or phone | 3 | 0 |
| flexes | 13 | 5 |
| browser scripts · page lookups | 0 · 0 | 0 · 0 |

The recurring missteps of runs 10–14:

| | Run 15 |
|---|---|
| Delete as default, unmarked | **Gone again:** `destructive: true`, Cancel the default (seen) |
| A home-made type for `afterDelay`'s handle | **Gone:** no handle kept (`afterDelay(950, …)` calls) |
| Menu keys spelled Mac-only | **Gone:** `"Ctrl+Shift+N"`, `"Delete"`, platform-neutral |
| A string switch on the item id | **Recurs:** `picked(id) { app.run(id) }` over a `switch` |
| Colors typed `string` | **Gone, and that exposed §1:** schema fields typed `Color` |

The shape is the standard runs' (a document model with a sync queue — one `DataSource` per request
kind, `url` and `body` as constraints on what is being sent, retry on failure, 409 conflicts
offered, 404 resent as new — `History`, an inspector over the selection, `Dialog` with `buttons`).
Where it drifts: a 271-line TypeScript script file of geometry (a legitimate use — pure functions —
though `type El = any` gave up the schema's types; it assumed schemas were not visible in script,
which guide 15 says they are); `asColor` as a cast; the 422 path that marks a refused save as saved.

## 7. The agent's account

Asked after the build by resuming the session read-only; answered on the first request (4,561
words). Its correction about the dev server: `npm start` exited 1 after the hand-over (`finish.sh`;
its log below).

# Building Presentify in Declare: an account for the people who make Declare

One correction first. In my handover I said the dev server was running on port 8600. Since then that background process has exited with code 1, and I didn't look at why. Port 8600 returned 200 when I checked, but nothing is serving the app now. As you asked, I've changed nothing since: I haven't restarted it, and I haven't read the files that changed on disk after the build.

## (a) Getting up to speed

**What I read, in order:**
1. `README.md` and `task/brief.md`, then `task/api/API.md`. I also curled `/api/decks` and `/api/decks/d1/slides` to see real data.
2. `skill/SKILL.md` and `AGENTS.md`.
3. `docs/declare.md`, in full.
4. The four required guide chapters, each in full: `01-what-declare-is`, `04-structure`, `05-run-and-check`, `06-layout`.
5. `apps/todo/todo.declare` and `todo-parts.declare`, both in full.
6. After that, only targeted reading:
   - all of `09-pointer-and-keyboard`;
   - `14-data` lines 20 to 420 (cursors, writing records, Node-on-record, DataSource, talking to a server);
   - the custom-drawing section and overlay-services table of `17-your-own-views`;
   - the Springs section of `21-motion`;
   - three parts of `18-overlays` (declaring a menu, opening, sheets/dialogs/toasts);
   - the TweenLayout section of `23-animated-arrangements`;
   - `npx declare-help map` on `apps/desktop/desktop.declare`, then its drag and resize methods (lines 435 to 510).
7. About 40 `declare-help` lookups, including: undo, History, Commands, keyBindings, Shortcuts, DataSource, DataSource.failure, DataSource.errorBody, Clipboard, PointerEvent, View.cursor, Text.italic, TextInput, ColorPicker, Dropdown, Dialog, Stepper.format, `"theme tokens"`, TweenLayout, afterDelay, rootOrigin, DrawContext, View.clip, Color, ChoiceControl and ChoiceItem.

**What I skipped, and why.** I skipped most guide chapters: notation, constraints, scrolling, controls, touch, text, media, collections, URLs, accessibility, time, and the calendar walkthrough. I didn't read the tracker or calendar apps. The skill tells you to stop after the core reading and look things up as you need them. I also had a large brief and limited context, so I went to `declare-help` and to sections rather than whole chapters. The cost was that I learned some rules only from compiler refusals. One example is that a typed symbol is spelled `Ctrl+}`. I did read that in chapter 09 and still wrote `Ctrl+Shift+]`; I caught it on a later read-through, not from a diagnostic.

**What taught me the most.**
- **`declare.md`** gave me the model.
- **The to-do app** gave me the house style. In particular:
  - the `Dataset` subclass as the holder of every write;
  - user state on the App;
  - `classFor` over a base class;
  - aliases on the App for far-away views (`list: View = { app.main.col.list }`);
  - `TweenLayout` with `retarget`;
  - `trackChanges` with `onChange`.

  I copied each of these.
- **`declare-help`** paid back more per minute than anything else. Its "doesn't exist, use X" answers (ColorPicker, Dropdown/Select, NumberInput) were especially useful.

**What was missing or misleading.**
- **Undo.** The skill's table and the to-do intro list "menus, shortcuts and undo" as things that come with the language. I looked for an undo facility: `declare-help undo` returned 17 entries, none of them a document undo stack. The to-do's "undo" is a Toast that restores one deleted record. For an editor, "undo comes with it" set an expectation the platform doesn't meet. I'm not certain I didn't miss something.
- **Script files.** Nothing I read says whether `script [ "file.ts" ]` may use `export`. I guessed it may not and stripped every export pre-emptively, so I never learned what would have happened.
- **Data bodies on classes.** Nothing I read says whether a `Dataset` subclass declaration can carry a JSON body. I wrote `class Doc extends Dataset [ … ] { {…} }`, then moved the body to the instance before compiling, on the strength of the Ledger example. Untested either way.

## (b) Expressing what I wanted

**Where it fit well:**
- **One slide renderer everywhere.** I wanted the editor, the thumbnails, the deck cards and the presenter to draw a slide the same way. One `SlideView` class did that, using a datapath plus `classFor` keyed on `:kind`, with `scale` doing the shrinking. This is the best fit in the whole build. Live thumbnails cost nothing: they read the same dataset record.
- **Shapes as views.** Each element is a view with its own handlers. The ellipse hit-tests through `clip` (an SVG path), and the line is a rotated thin view. All three ideas came straight from chapter 09's "Finding what is under the pointer".
- **`pointerEvents = "none"` on a subtree** turned off interaction for thumbnails cleanly.
- **The sync engine.** One DataSource per request kind, each with `url` and `body` as constraints on `sending`, plus "fetch() settles first", made a per-request write queue readable. The rule that `failure` says whether a write went through mapped directly onto the API's 409, 503 and 422 cases.
- **Context lookup.** `provided("live", false)` and `provided("groupTop", "")` passed context down the tree without wiring.
- **Motion.** The editor growing from its card is one `Spring` driving `x`, `y`, `scale` and `opacity`.
- **Commands.** `Shortcuts` plus a `Menu`, both routed to one `run(id)`, kept keyboard, menu and buttons in step.

**Where I worked around the language:**
- **Geometry lives in script.** All element geometry (bounds, refit, align, distribute, restack, group, snapping) is about 350 lines of plain TypeScript in `geometry.ts`. The drift check calls a long script block a smell, and its stated test is "pure helper functions". I judge pure functions over JSON correct here, but the file is large, and the line is blurry.
- **`El = any` in that script.** Schemas don't seem visible to script, and a structural index type triggered assignment friction, so I typed elements as `any`. That is in the spirit of the "as any on your own data" drift, done in script where the compiler doesn't look.
- **Change tracking is hand-built.** Sync compares `JSON.stringify` of every slide against the last body sent. Nothing in the platform said "this dataset region changed since X".
- **Undo is whole-deck JSON snapshots** in a hand-written `History extends Node`.

## (c) The first time it ran

I never saw it run, by your instruction. The only "runs" were `declare-verify`'s headless boot (the R4 step) and a curl of the served page. So I can't report what was visibly wrong. Everything in (d) comes from the compiler and the verifier. Every runtime behaviour in the brief is unobserved.

## (d) Every refusal and surprise

These are in the order they happened. All ran through `npx declare-verify my-apps/presentify/presentify.declare`.

**First run, R1 (structure): seven errors at once.** One pass reported all seven, which was good.

1. **`'Toolbar' is a library class — a class of the program can't take its name; rename yours, as 'PresentifyToolbar'` [DECLARE5000] (panels.declare:272:1).**
   - Wrote: `class Toolbar [ width = 100%, height = 56, … ]`.
   - Changed: renamed it `EditorBar`.
   - Judgement: my fault. I'd only learned the library had a `Toolbar` from the chapter 04 example. The message is excellent.
2. **`TextLabel.y — SlideRow's SimpleLayout places its children, so this child does not declare its y. Across the flow, where a child sits is the layout's 'align'…` [DECLARE2000] (panels.declare:54:29).**
   - Wrote: `TextLabel [ width = 22, y = 2, textAlign = end, … ]` inside a row with `SimpleLayout [ axis = x, align = start ]`.
   - Changed: removed `y = 2`.
   - Judgement: my code was wrong. `06-layout` says this, and I knew it in general, but I wrote a CSS-style nudge anyway.
3. **`View.focusable expects a Focusable (one of quiet, or true | false), got the string "quiet"` — 2 sites [DECLARE2000] (panels.declare:79:103).**
   - Wrote: `focusable = "quiet"`.
   - Changed: `focusable = quiet`.
   - Judgement: the docs are mildly confusing here. The reference says: *Inside `{ }` the word is a string: `focusable = { editing ? "quiet" : true }`.* I wrote the quoted form as a bare value. Bare string literals are allowed for other attributes (`cursor = "pointer"`, `method = "POST"`), so it isn't obvious that this enum rejects one. Is a quoted keyword in bare position always refused for enum-typed attributes? Unsure.
4. **`SlideRow.width — View's SlideStack sizes its children, so this child does not declare its width.`** (panels.declare:91:46)
   - Wrote: `SlideRow [ datapath = :slides[], width = 100% ]`, under my `TweenLayout` whose `place()` returns `w`.
   - Changed: removed `width`.
   - Judgement: my code was wrong. It was nice that this was caught for my own layout class.
5. **`App already has an attribute 'clip' — a declaration introduces a new one … e.g. 'appClip'` [DECLARE2000] (line 339).**
   - Wrote: `clip: string = ""` (clipboard contents).
   - Changed: renamed it `held`.
   - Judgement: my fault. The name collision is easy to make and the message is clear.
6. **`View.accessibilityRole expects an AccessibilityRole (…), got 'alert' — an alert is accessibilityRole = status with accessibilityLive = assertive`** (line 615).
   - Changed to exactly that.
   - Judgement: my fault. A great message.
7. **`'show' is already a member of Dialog — a use site configures a class through its attributes, not by redeclaring its children…`** (line 660).
   - Wrote: `presenter: Dialog [ …, show: View [ … ] ]`, a named child called `show`, which collides with the method `show()`.
   - Changed: renamed it `slideshow`.
   - Judgement: the message's advice ("Give Dialog an attribute") was off-target. My real problem was a name collision with a method. I wasn't redeclaring a child, so the explanation misled me a little, though the fix was obvious.

**Second run, R2 (resolution).**

8. **`schema TextStyle takes the name of one of Declare's own types … Rename yours, as 'PresentifyTextStyle'` [DECLARE4015] (model.declare:38:1).**
   - Changed: ran `sed -i '' 's/\bTextStyle\b/TextBlock/g'`. macOS sed has no `\b`, so it silently changed nothing. The next run reported the identical error, and I redid the rename with `perl`.
   - Judgement: my fault twice, the second time a tooling slip on my side, not Declare's. Several common words (`TextStyle`, `Toolbar`, `Stroke`) are reserved. I had already avoided `Stroke` for my outline schema (named it `Outline`), but only because I happened to remember the builder.

**Third run, R3 (analysis): colour typing.** This was the one real circle in the build.

9. **`the { } body of 'fill' computes a string, but 'fill' is typed Fill — a color written in a string is typed Color: type the schema field that holds it Color (color: Color)…` — 3 sites (brand.declare:225:82, plus slides.declare:119).** There was a twin message for `textColor`, and:

   ```
   Argument of type 'string | null' is not assignable to parameter of type 'string'.  (line 431, col 72)
   ```

   - **What I'd written:** schema `Outline [ color: string, width: number ]`, `fill?: string`, `background: string`, `TextStyle.color: string`. On views, things like `Swatch [ … chip: View [ fill = { classroot.color } ] ]` with `color: string`, and `ink: string = { :text.color ?? "#1B1530" }`. The `string | null` error was `app.ed.paste(e.get("application/x-presentify"))`.
   - **What I changed:** made every colour field in the schemas `Color`. Converted for display with `Color.hex(...) ?? "none"`. Added `?? ""` to `e.get(...)`.
   - **Run four** then said:
     - `Type 'string' is not assignable to type 'NonNullable<Color>'` — 2 sites (editor.declare:262:28, 283);
     - a long `Type 'Element | { fill: string | null; … }' is not assignable to type 'Element' … Types of property 'fill' are incompatible` (editor.declare:398);
     - the same shape for `stroke.color` (401);
     - and still the `fill` error at brand.declare:225 and line 235.
   - The cause: my setters took `c: string` from palette swatches and wrote it into elements, and `inkFor() -> string` returned literals typed as `string`.
   - **Changed:** added a script helper `asColor(s: string): `#${string}` | null` and routed every palette value through it. I typed `inkFor() -> Color`.
   - **Run five:** `Type 'Color' is not assignable to type 'NonNullable<Color>'. Type 'null' is not assignable…` (editor.declare:262:28), because `Color` includes `null` and the stroke field's `color` doesn't.
   - **Changed:** wrote the return type inline as `` inkFor() -> `#${string}` { … } ``.
   - **Run six, R1:** `unexpected character '`' [DECLARE5000] (editor.declare:279:17)`. A method's return type must be a name; `declare.md` §3 says so ("a type's **name**"), and I'd forgotten.
   - **Changed:** declared `type Hex = `#${string}`` in the script file and wrote `inkFor() -> Hex`. That finally passed.

   Judgement: this cost about six verify cycles, which was the most of anything in the build. It was a pattern, not a single obstacle. Three things combined:
   - Colours are naturally strings in this API's JSON, and in my palette dataset.
   - `Color` is `number | `#${string}` | ColorName | null`, but schema subfields are `NonNullable<Color>`.
   - There's no named "non-null hex colour" type, and no parse function from `string` to `Color` I could find. (`Color.hex` goes the other way, taking a `Color`.)

   To get it right the first time, I'd have needed:
   - (1) the guidance "type every colour field in a schema `Color` from the start", stated where schemas are taught (`15-schemas`, which I didn't read);
   - (2) a documented `Color.parse(s: string): Color` or similar for strings that arrive from user input;
   - (3) a short note that `Color` already includes `null`.

   The diagnostic did point to the right first step. The platform isn't wrong. But the string-to-Color boundary for user-typed hex has no obvious sanctioned door, and my `asColor` is a cast in disguise. Unsure whether one exists.

**Seventh run: clean through R4,** with warnings, all of which I then fixed:
- **[DECLARE4022]:** `IconButton shows whether it is the one chosen ('on'), but tells a screen reader nothing… set accessibilityPressed = { on }`. The same for `Swatch` ('current').
- **[DECLARE4026]:** `these 5 IconButtons are one choice among several — each is 'on' when app.tool equals its own value… make them ChoiceItems … of a ChoiceControl`. The same for the 3 text-alignment buttons.
- **[DECLARE4017]:** Stepper with no name, 2 sites.
- **[DECLARE4020]:** `more (a button) is inside DeckCard (a button)…`.
- **[DECLARE4035]:** `host has an accessibilityLabel but no role` (also `slideshow`).
- **[DECLARE4025]:** `cursor decides through 3 nested ? : choices` (the Handle's cursor), and `visible decides on one condition of 4 parts` (RadiusHandle).
- **[DECLARE1002] (8 sites):** redundant parentheses for `{ ({ … }) }`.

How I fixed them:
- Wrote new `ChoiceIcon extends ChoiceItem` and `ToggleIcon extends Control` classes, and wrapped the tools and alignment buttons in `ChoiceControl [ value = { app.tool }, commit(v: string) { app.useToolNamed(v) } ]`.
- Restructured `DeckCard` into a plain View holding a `face: Control` with a sibling `more` button.
- Gave the stage host and the presenter roles; named the steppers.
- Replaced the cursor ternary with a record lookup, and the RadiusHandle condition with named booleans `roomy` and `calm`.
- Regex-replaced the parentheses.

Judgement: these were the most impressive diagnostics of the session. The rule recognising "these 5 buttons are a choice of one" is clever and was right. One annoyance: `ChoiceControl.commit` hands back a `string`, so I needed `useToolNamed(t: string)` to narrow it to my union type. The redundant-parentheses hint contradicts the docs' own habit of writing `({ … })` everywhere, for example `app.tasks.set("/items/-", ({ id: … }))` in chapter 01, and in many to-do handlers. I think the rule is that it fires only where an attribute value is exactly `{ ({…}) }`. That's fine, but it surprised me given the examples.

**Final run, after the logic fixes:** clean through R4 with no warnings or hints. It reported 737 nodes booted and "752 of 847 constraints statically wired".

**Boot-time notes I didn't act on:**
- `4 data source(s) fed a sample of their schema at boot … app.library.renameRead, app.sync.probeReq, app.deckSrc, app.slidesSrc`. Good to know; it means the editor's rows were built from fake data at boot.
- `not built at boot, so not checked here: LineEl`. Honest, and it tells you exactly what went unchecked.

## (e) Verifying it

| Check | What it caught | How it served me |
|---|---|---|
| R1 to R3, `declare-verify` | Everything in (d) | Excellent: batched, positioned, and with the fix named |
| R4 boot | Nothing failed | It flagged no layout faults on the first screen, which is the empty list over sample data |
| Accessibility and lint layer | Real design flaws (nested buttons, choice-of-one semantics) | Very good |
| `declare-format --write` | Formatting only | Fine |
| Reading the runtime source | That schema `Color` validation doesn't coerce strings to numbers (`data-schema.ts` line 40 `typeOk`) | Mattered: coercion would have caused a spurious save on every open, or 422 refusals |
| curl of the served page | Returned 200 | — |

I couldn't use R5, R6, `declare-look` or the browser, by your instruction. So nothing checked:
- any interaction;
- the sync engine against the real service;
- the editor screen's layout (R4 booted the list screen, not the editor);
- my `TweenLayout`;
- the opening animation;
- the presenter.

The tools look built for exactly the next step (`--assert` scripts that drive by view path), and I'd expect them to find real bugs.

I did a careful read-through and found and fixed these without running anything:
- `endEdit` stole focus from the inspector;
- a press inside a text box being edited stole focus;
- a drag inside that box moved the box;
- the bracket shortcuts were spelled wrong;
- `structuredClone` could fail on dataset values (a guess; I switched to a JSON round-trip);
- the rename dialog's `commit(v) { }` would have thrown away typing.

## (f) Confidence, part by part

| Brief section | Confidence | Where I'd expect a tester to find problems |
|---|---|---|
| §1 List | Medium | Delete and rename go through a GET-then-PATCH pair I never ran. The `?seen=` cache-busting on thumbnails is a hack. The card's grow-open uses `rootOrigin` of a scaled card and may land slightly off. |
| §2 Slides | Medium-low | The reorder drag is `rowIndex + round(deltaY/112)` and ignores the list scrolling during a drag. I'm unsure `laid()` excludes my `ignoreLayout` drop bar from `SlideStack`; if it doesn't, rows will be misplaced. Focus after add slide moves to the list row, so the next Delete deletes the slide, not a shape. |
| §3 Drawing | Medium | Text height write-back (`noteTextHeight` via `trackChanges` on `this.height`) may loop or jitter during resize. The TextInput may not match the Text's metrics exactly, so words could jump on entering edit. "Grows taller" relies on content sizing that I never saw. |
| §4 Selecting | Medium-low | Whether `onPointerDown`, `onClick`, `onDoubleClick` and the drag events all fire as I assumed on the same `Shape` view is unverified, and so is whether `e.x` in `onDrag` is the current point in the scaled view's own coordinates. Clicking a lone rect inside a multi-selection to narrow it, and double-click into groups, are the likeliest bugs. Handles are hidden while drawing, but not during a move, so they follow; that's what the brief asks. |
| §5 Inspector | Medium | Stepper's `format` override showing "Mixed" is untested. The Fill and Outline sections disappearing per selection may read as the panel changing shape. |
| §6 Undo | Medium-high in design, untested | The dedupe-on-undo trick may hide steps in odd cases. Snapshot restores re-run `noteTextHeight`. Inspector colour changes are one step each; slider drags rely on `trackChanges = ["editing"]` firing before the first `commit`, and if it fires after, the first move is a separate step. |
| §7 Saving | Medium | The engine is coherent on paper. The "Saving…" text during a pending conflict doesn't match the brief. Polling for remote changes every 6 s with a GET is a design choice a tester may dislike, and the brief's "when they return to it" depends on `onChange` of `current` firing the probe. A deck-level 409 adopts the server's order, which could reorder slides under the person. |
| §8 Presenting | Medium-low | `Dialog presentation = "full"` plus `app.fullScreen`: does Esc reach my binding before the browser leaves full screen? Probably the browser takes it and my `trackChanges = ["fullScreen"]` ends the presentation, but unsure. |
| §9 The bar (polish) | Low to unknown | I never saw a pixel. |
| §10 Labels | Medium-high | — |

## (g) Gaps I worked around

1. **Document undo/redo.**
   - Wanted: an undo manager over a dataset, with grouping.
   - Looked at: `declare-help undo`, `History`, the to-do's Toast, the tracker skeleton (`undoDelete`).
   - Did: a hand-written `History extends Node` with JSON snapshots.
   - Judgement: probably really missing. Dataset `set` already knows every write, so a transaction or undo log on `Dataset` would be natural.
2. **Saving local edits to a REST service with versions and conflicts.**
   - Wanted: a dirty or changed-since marker on a dataset, or a "sync" facility.
   - Did: the hand-written `Sync` Node comparing stringified bodies.
   - Judgement: probably missing, and reasonably so, since it's app-specific.
3. **Knowing when another client changed something.**
   - Wanted: push notifications.
   - The service has none, so this is not Declare's gap. I polled with `Time [ tick = 6000 ]`, despite the drift check's warning about polling.
4. **Colour picker.** `declare-help ColorPicker` told me plainly there's none and described how to build one from swatches; I followed it. A real gap, honestly documented.
5. **String to Color for user-typed hex.**
   - Did: script `asColor` plus a `Hex` type.
   - Judgement: unsure. It might exist under a name I didn't try.
6. **A named type usable as a method return.** For `` `#${string}` `` I declared it in script, which is the documented route. Fine.
7. **Locating a replicated row by its record.**
   - Did: `app.slideRows.childViews.find((v) => v instanceof SlideRow && (v as SlideRow).slideId == app.currentId)`, the pattern `14-data` describes.
   - Judgement: it works, but is clunky; `declare-help View.children` pointed me to `childViews`.
8. **Translating a dragged row out of its layout during reorder.**
   - Wanted: the row to follow the pointer.
   - Didn't find: an offset or translate attribute separate from layout-owned `x`/`y`.
   - Did: dimmed the dragged row and showed an insertion bar.
   - Judgement: unsure. A State setting `ignoreLayout` might have worked, but I didn't try it.
9. **Schema types inside script.** I assumed schemas aren't visible in script and used `any`. Unsure.

## (h) Changes of direction

1. **One DataSource for all of sync's writes → four.** During planning I meant to have one `req` with `method`, `url` and `body` switched per operation. Before writing it I moved to `postReq`, `deleteReq`, `deckReq` and `putReq`, each with its own `schema` and `errorSchema`. The reason was my own second thoughts: replies would be typed, and the drift check is against `as any`.
2. **The selection overlay inside the slide → a separate overlay.** In planning, handles were children of the `SlideView` surface. Then I realised `SlideView` has `clip = true`, which would cut off handles at the slide's edges. So I made `StageOverlay` a sibling layer with the same scale. This came from second thoughts, before any code.
3. **Editor built only while open (`exists`) → always built, only `visible`.** I changed this to keep App aliases such as `stageHost` and `titleField` non-null. Second thoughts, during planning.
4. **Reordering by moving records live during the drag → an insertion bar and a move on drop.** The brief's line "the slide list does not reflow under the pointer during a drag" made me change.
5. **`IconButton` with `on` → `ChoiceIcon`, `ToggleIcon` and `ChoiceControl`.** Changed after the first clean boot, because of the DECLARE4022 and 4026 warnings.
6. **`DeckCard extends Control` → a View holding a `face: Control` and a sibling button.** Changed because of DECLARE4020.
7. **The rename dialog read `this.field.value` with a no-op `commit` → `value <-> app.renameDraft`.** My own read-through, after the build.
8. **`structuredClone` → JSON round-trip.** My own caution about dataset value proxies. Unsure it was needed.

## (i) Code, quoted

The quotes for every refusal are in (d), each with its exact message. Here is the circle reconstructed in one place, the colour sequence from editor.declare (line numbers approximate):

```declare
// first
inkFor() -> string { return lightness(app.doc.slide(app.currentId)?.background ?? "#FFFFFF") < 0.5 ? "#FFFFFF" : "#1B1530" },
… draft = lineEnd(({ id: "draft", kind: "line" as const, …, stroke: ({ color: this.inkFor(), width: 4 }) }), …)
// → Type 'string' is not assignable to type 'NonNullable<Color>'. (editor.declare:262:28)

// second
inkFor() -> Color { … }
// → Type 'Color' is not assignable to type 'NonNullable<Color>'. Type 'null' is not assignable to type 'NonNullable<Color>'. (editor.declare:262:28)

// third
inkFor() -> `#${string}` { … }
// → unexpected character '`' [DECLARE5000] (editor.declare:279:17)

// fourth (passed)
script { type Hex = `#${string}` … }
inkFor() -> Hex { … }
```

The schema at the start of that circle:

```declare
schema Outline [ color: string, width: number ]
schema Element [ …, fill?: string, stroke?: Outline, … ]
```

And the Swatch:

```declare
chip: View [ …, fill = { classroot.color } ]   // color: string
```

## Overall impressions

**Surprises:**
- How much the accessibility rules understood about intent: the "these 5 buttons are a choice of one" rule.
- That the compiler reports every error in a phase at once.
- That `Color` includes `null`.
- That redundant parentheses get a hint even though the docs write them constantly.

**What was good:**
- The core model: constraints, settles, `fetch()` settles first, `classFor`.
- Diagnostics that name the fix, for nearly all errors. The exception was the `show` collision, whose advice pointed elsewhere.
- `declare-help`'s negative answers.
- The skill document's discipline about what to read.
- Overlays as members with verbs.
- `DataSource.failure`'s write-outcome semantics, which are better than anything I've used in a UI framework.

**What was bad:**
- Colour typing across the JSON boundary.
- Reserved common names you only discover by collision (`Toolbar`, `TextStyle`, `clip` on App).
- No undo facility for an "editor" class of app.
- Some uncertainty about script-file rules (`export`) and data bodies on classes.

**How it differs from what I know.** It's closest to OpenLaszlo, as the README says, and to QML: declarative trees, bound properties and states. The data replication feels like XSLT or Angular templates. The constraint graph is like MobX or Solid signals, but extracted at compile time. Unlike React, there's no render function or diffing to reason about. That was liberating for derived UI and awkward for imperative machinery like drags and sync, which became Node classes full of methods: ordinary OO code living in a reactive tree.

**Where I'd most want improvement:**
1. A documented string-to-Color door, plus guidance on schema colours.
2. An undo or transaction facility on `Dataset`.
3. Diagnostics that list reserved library and type names, or warn on declaration rather than collision.
4. A clear statement of what `script` files may contain.

**What I'd use it for:** tools with rich direct manipulation and lots of derived state (editors, dashboards, schedulers), where the constraint model and springs pay off most. Also for anything that must ship a polished UI that an LLM writes and someone then maintains, given how much the compiler checks.

**The hardest part.** The colour types were the single costliest obstacle: one pattern, about six compile cycles. The broader hardest part was writing roughly 1,800 lines of interaction and sync logic that I couldn't run. Every claim about behaviour above rests on reading, not observation, and that's where I'd expect most of the real bugs.
## 8. The names ledger

```
NAMES — eval-presentify-15: 2 missed name(s), 3 collision(s), 1 declare-help miss(es), 0 empty search(es)

MISSES (min · kind · name · on · origin · the platform's answer · times · resolved at min · how it ended)
     1 · attribute · fontStyle            · Text                     · CSS                · foreign hint · ×1  ·    1 · resolved
         Text has no attribute 'fontStyle' — the CSS instinct: italics are Text's 'italic = true'
    17 · value     · alert                · View.accessibilityRole   · browser/Node global · foreign hint · ×1  ·   17 · resolved
         View.accessibilityRole expects an AccessibilityRole (one of none | button | toggle | checkbox | switch | radio | slider | progress | textField | link | image | heading | list | listItem | grid | row |

COLLISIONS (min · held by · name)
    17 · library class  · Toolbar
    17 · attribute      · clip
    17 · Declare's type · TextStyle

DECLARE-HELP MISSES (min · asked for · answered)
    13 · children · View has no member 'children' — related: childViews (declare-help View.<name>)

SUMMARY: 0 of 2 misses got no hint · 0 declared instead (none) · 0 never resolved (none)
```
