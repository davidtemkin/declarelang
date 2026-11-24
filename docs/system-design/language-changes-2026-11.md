# Changes to the base language, November 2026 — for review

Changes to the language or the runtime's semantics made on the local tree after the
2026-11-13 eval round, kept for review after the fact. Library classes and docs are not
listed. Each was asked for or approved before it was made.

## The click rule: a press is carried to what was pressed

`input.ts` (release), `view.ts` (`inputSink`). A click was a press and a release resolved to
the same view, with the pointer within slop. Now a pointer that stayed within slop clicks
what it pressed even when the release resolves to another view: the layout moved the
pressed view from under it during the press. The view takes the carried click only while it
and its ancestors are shown; a view that answers `onDoubleClick` is never carried one. In
development the runtime says once per view that it moved while pressed (verify's R5 reports
the page's `[Declare]` warnings).

Why: Presentify run 8 — a title field losing focus at the press was replaced by a narrower
label, the toolbar re-centred, and the first click on a tool landed on its neighbour and was
lost. Browsers lose it too (their click goes to the common ancestor).

Alternative not taken: leave the rule and warn only. Tests: `gesture.test` (both renderers),
`unit.test` (the click rule, and the routeInput test that now separates "moved off" from
"slid in under a still pointer").

## `T?` inside a `{ }` body

`compiler/src/typecheck.ts`, `runtime/src/expr.ts`. A body is TypeScript, and `T?` after a
type was refused there (TS17019) while a declaration on the same line could say it. Now a
body accepts it with the declaration's meaning, `T | null`, which is the type TypeScript
itself gives the node; only the 17019 syntax objection is dropped, and only inside a body
(a `script` block is bundled by esbuild and still refuses it). Valid TypeScript is never
reinterpreted: the change applies only where TypeScript reports 17019, so an optional tuple
element (`[string, number?]`), a cast followed by a ternary, a conditional type and optional
properties and parameters keep their meaning.

Two messages came with it:
- `undefined` going where the type is `T | null` (as `?.` gives) names the fix, `?? null`.
- `as T?` ending a line, the next beginning with a name, is read by TypeScript as the start
  of a `? :` (plain TypeScript does the same); the parse error now says to end the line with
  `;` or put the cast in parentheses — shown only when that rewrite parses (the probe is
  authoritative, as for the other body-error refinements).

Why: the declaration shorthand leaked into bodies in three of five runs of the round
(Ledger 7 ×4, Ledger 8 ×2, NYT ×1); one spelling of "maybe T" in a file. Alternative not
taken: keep the refusal (its message was already exact). Tests: `unit.test`. The formatter
already keeps `T?` in a body as written.

## `-> Stroke` and `-> Shadow` may be none

`compiler/src/scaffold.ts` (`signatureTsType`). A paint type written by name in a signature
(a method's return, a parameter) is now "a paint, or none": `Stroke` and `Shadow` there mean
`Stroke | null` and `Shadow | null`, as `Color` (`number | null`) and `Fill` already did, and as
the `stroke` and `shadow` slots take null. `stroke()` and `shadow()` still return a value.

Why: a regression, found by re-scoring Presentify run 7's app on the tree after the
2026-11-13 build list: `outline(s) -> Stroke { return s == null ? null : stroke(…) }`
compiled on 2026-11-12 and was refused after. The batch that changed it was not identified
(no git for the hunt); the rule now matches the rest of the paint vocabulary. Test: unit.test.

## A program's first evaluation reads the host's size

`runtime/src/view.ts` (`withStartingHost`, `App` constructor, `$bindStartingExtent`),
`runtime/src/instantiate.ts`, `runtime/src/boot.ts` (`startingSize`, `renderProgram`,
`buildProgram`'s `host`), `browser/host-client.js`, `runtime/src/dom-backend.ts`
(`becomeRoot`). A program's constraints first run at build, before mount; `hostWidth`,
`hostHeight`, `width` and `height` were 0 then and took the window's size at mount. Now the
boot reads the host's size first (the window at top level, the box when embedded) and the App
starts there: `hostWidth`/`hostHeight` are set, and an unset `width`/`height` starts at them as
a runtime write (not a binding, not the program's own), which attach binds to the host as
ever. A size the program writes on the App (a literal or a binding) is left to it. An island's
app starts at its island view's size (`buildProgram`'s `size`, from `host-islands.js`).

Two latent DOM-backend gaps surfaced and are fixed with it: a surface marked root at mount
applied the root size only on a later change (`becomeRoot` applies it at once), and the page
extent was pushed only on change, so an App laid out before its surface existed never sent it
(`App.$flush` sends it).

Why: NYT run 1 — an app keyed on `app.width` asked for phone-sized ads, then desk-sized, on every
desk load. Tests: unit.test (first evaluation; own sizes kept), gesture.test (a page-scrolling
App with no size of its own still scrolls).

## An App's unset height counts as its own in its layout

An App's unset `width` and `height` are its host's (`App.$bindExtent`), but its layout asked
before attach, found them unset and unowned, and took them as measured from the children. So
`align = center | end | stretch` on the App's own layout worked against the tallest child (the
line) instead of the window, and nothing the arrangement tracked moved when the host's size
took the slot: a row of panes on an App stretched to its tallest pane, not to the window. On a
phone, with one pane left in the row, that pane's own height came back round as the line, and
the program stopped on a constraint cycle. `sizedByChildren` now answers no for an App; a
stretch fills the window, and center and end place in it, as the reference already says ("it
fills its host by default").

Why: Ledger run 9 (a phone-only cycle). Test: unit.test ("an App's unset height is its
host's…").

## A closing overlay takes no presses on itself

`Floating.pointerEvents` follows `shown`. The library's contract was that closing stops an
overlay taking input at once, but only presses aimed past it were let go (`outsidePress`);
through its closing motion a press on the overlay itself still reached its content. Now such
a press goes to what is beneath.

Why: Presentify run 9 (Esc, then a press on the inspector reached a color chip of the
closing popover). Test: overlays.test ("a closing overlay takes no presses on itself…").

## A modal leaves live what paints above it

An open modal (`focusScope = modal`) made every element beside it inert, up its ancestor
chain, so a toast shown over a sheet painted but took no presses and was out of the
accessibility tree: its Undo did nothing, and its message was not announced. The Toast's own
reference promised the opposite ("it stays above an open dialog or sheet, its action still
clickable"). Now what paints above the modal stays live, along the paint tree (an overlay
paints in its layer, wherever it is written; the toast's notice layer is above the sheet's):

- in the DOM, only what is under the modal goes inert;
- in the runtime's semantic tree, which the Mac host reads, the toast is read with the sheet;
- for the keys, the modal's Tab cycle goes on to the toast's action and back, never behind the
  sheet; Tab there no longer closes the sheet (the menu rule, for an overlay focus has left),
  and Space presses the action.

Only the modal's own program counts: a hosted program's dialog in its host's window layer
does not take in the host's views. (`paintedAbove`, `runtime/src/interaction.ts`.)

Why: Ledger run 10 (`getByText` found no toast over the record sheet). Tests:
accessibility-browser.test ("an open modal leaves what is under it inert…"), accessibility.test
("a toast over an open sheet is read, though it is written before the sheet"), overlays.test
("a toast over an open sheet is in the sheet's Tab cycle…").

## A cell entered by Enter or F2 starts with its text selected

A DataGrid cell entered by Enter or F2 put the caret after the value, and a combobox in an
editor of your own got no selection at all, so typing appended: "Advert" became
"SoftwareAdvert". Now the grid's own field, and the first text field in an editor of your own
(a combobox's entry included), start with the value selected, as a table's edit does in
AppKit, so what is typed replaces it. A second press still puts the caret where it landed.

Why: Ledger run 10 (an in-place category edit appended; the agent wrote a select-on-focus
helper into five editors). Test: datagrid-editing.test.

## Select All in a table

`Table.selectAll()`: in a `"multi"` table, ⌘A (Ctrl+A off the Mac) selects every item that can
be selected, and a Select All button calls the method. In a DataGrid, ⌘A on a selected cell
selects the rows; in an open edit it is the field's, its text. The reference had said
select-all was not built in.

Why: every Ledger run wrote its own. Tests: table.test ("⌘A or Ctrl+A selects every row…"),
datagrid-editing.test.

## `DataSource.errorSchema`

A refusal's body can be declared, as the value is with `schema`: `errorSchema = Problem` types
`errorBody` as `Problem | null`, so a handler reads `errorBody.message` with no cast. A body that
does not match is not handed over (`errorBody` is `null`), and `error` names where it differs.
Additive: a source without it is as before.

Why: Ledger run 10 cast `errorBody as any` seven times, and four other Ledger runs share at
least one of the same workarounds. Tests: dataschema.test ("errorSchema types a refusal's
body…"), datasource-failure.test ("errorSchema: a refusal that matches it…").

## `FilePicker.save`

`FilePicker.save(contents, { name, type? })` hands the person a file the program made: its text
or a `Blob`'s bytes. A browser downloads it to where its downloads go; the Mac host shows its
save panel (`NSSavePanel`), opening in Downloads with the name filled in, and writes the bytes
where the person chose. It resolves to whether the file was saved: `false` when the panel was
cancelled; a browser does not say, and answers `true`. The type is the name extension's when
not given. Declare makes no file format; the program makes the contents.

Why: every Ledger run exported CSV through a browser-only script, which cannot run on the Mac
host. Tests: verify-requests.test ("FilePicker.save downloads the file a press makes…"),
files-save.test (what a native host is handed and answers). The Mac panel is not exercised by
a test, since it would take the screen.

## Global names: four capitalized kinds, no lowercase platform names

The design in `global-names.md`, built on the branch `global-names`. Every name the platform
puts in a program's scope is capitalized and is a class, a type, a service or a theme preset;
the platform adds no lowercase names.

- **Builders on their types**, the same spelling in a bare value and in `{ }`:
  - `Stroke(…)` and `Shadow(…)`;
  - `Gradient.linear`, `.radial`, `.conic` and `.stop`;
  - `VisualFilter.blur` and the other filters (`frost` among them);
  - `Easing.cubicBezier`, `.back`, `.steps` and `.laszlo`.

  `ImageFilter` and `FilterList` are now `VisualFilter` (and `VisualFilter[]`), and
  `EasingCurve` is merged into `Easing`. Gone with them: the callee-position rule, the
  reserved filter method names, and the hidden lowering helper.
- **`Color`'s operations:**
  - `Color.withAlpha(c, a)`, with alpha from 0 to 1;
  - `Color.mix(a, b, t)`;
  - `Color.lighter` and `Color.darker` (OKLCH);
  - `Color.contrast(a, b)` (the WCAG ratio);
  - `Color.components(c)`.

  `colorWithAlpha` and `activeTone` are retired. They ship only in a program that names
  `Color` (capabilities.ts); an `0xRRGGBBAA` literal compiles to its number. The first-load
  budget is raised to 180 KB by ruling. The calendar's bit-shifting `mix`
  helper is replaced by `Color.mix`.
- **Text:** `measureText(text, style, width)` and `escapeHtml(s)` stay plain functions, the
  rule's two exceptions: they belong to no type and to no class. `measureText` ships only in a program
  that names it.
- **Node methods:** `afterDelay`, `afterSettle` and `providedTextStyle` are now Node methods,
  one method each (the compiler's rewrite to hidden `$` twins is gone). A bare call in a body
  resolves to the node's member by the ordinary bare-name rule, so it is unchanged;
  `this.afterDelay(…)` and `row.afterDelay(…)` also work.
- **`app.hostProvided(name, fallback)`:** an App method, since the value is the program's,
  the same from every node. Bare `hostProvided(…)` calls are now `app.hostProvided(…)`.
- **`provided(…)`** is unchanged: a special form (a literal name wired at compile time, typed
  by the name, read from the nearest providing ancestor).
- **Facts instead of relays:**
  - `app.focusedView`, `View.containsFocus`, `app.focusGeometry` and `app.tooltipRequest` are
    added;
  - the `Focus [ ]` and `Tooltips [ ]` classes are removed, and `Keyboard` is a service only;
  - the library's window, grid, focus ring and tooltip read the facts.
- **Color strings:** inside `{ }` a color may be written `"#RRGGBB"`, `"#RRGGBBAA"` or a CSS
  name (`"royalblue"`), beside `0x…`, which stays valid; existing programs are unchanged.
  - `Color` is `` number | `#${string}` | ColorName | null ``; a misspelled name is a type error.
  - The compiler replaces each literal TypeScript types as a Color with its number, so the
    names' table stays out of the running program.
  - A hex string arriving at run time (from data) is read where it lands: a color slot, a
    declared `Color`, a builder or a `Color` operation. A color name arriving at run time is
    refused loudly ("use hex") and paints nothing.
  - `Color` is a schema field type; the data check accepts a number or a hex string.
  - Arithmetic on a `Color` is a type error that names `Color`'s operations.
  - Not covered: a theme token is typed `number` (colors and sizes are not told apart), so a
    color name written in a theme record in a body is not lowered; a hex string there works.
- **`app.unsavedChanges`** (new): a fact the program states. While true, leaving the page
  asks first (the browser's own question), and on the Mac the window shows the edited mark
  and closing it or quitting asks. From Presentify run 11, which wrote `window.onbeforeunload`.
- **`destructive: true`** on a `Dialog` button record (new): the label takes the theme's
  error colour (a destructive default keeps the primary look).
- **`app.focusGeometry` changes only when the outline does** (fixed after Murmur 18): the
  focus service re-reported the same outline each settle, so a watcher (the focus ring) heard
  repeated changes and the runtime warned of a change ring.
- **`Toast.clearance`** (new, after Cadence 37): how far above the bottom of its layer the
  toast sits (24 by default), so a program with a bar along its foot raises it clear.
- **`onChange` hears every change in a settle** (changed, DT, after Venue 36's focus ring
  missed a second move). A settle runs in **rounds**: constraints come to rest, then the
  `afterSettle` steps, then change events; what a step or handler assigns is settled in the
  next round, and nothing paints until a round assigns nothing. A handler is told, each
  round, every tracked value that differs from what it was last told; the once-per-chain rule
  and its "ring of change handlers" warning are gone. A handler assigning a value it tracks is
  refused **at compile time**, where a written `trackChanges` list and an `onChange` beside it
  show it (`x = …`, `this.x = …`, and `app.x = …` on the App); the run-time throw is gone (it
  left the value unchanged and could jam a flag, as an independent review's probes showed).
  A settle kept going for 100 rounds stops with an error naming the handlers and their run
  counts. Taught in guide 3 § The settle, declare.md §5, the glossary and guide 22.
- **History: one entry per settle, every round of it** (fixed to match the documented rule).
  The browser and Mac history mirrors now record when the whole settle has ended, so a handler
  that moves `location` in a later round no longer makes a second entry (`observe(…, atEnd)`).
- **A Popover given a width gives it to its content** (fixed, after Venue 37): its body sized
  itself by what it held whatever the popover's width, so `Popover [ width = 380 ]` around a
  form at `width = 100%` drew a 380-wide popover with a form 0 wide.
- **The layout check reports a child that collapses**, not only one that spills: a child that
  takes its size from a content-sized parent (through any number of such parents — a popover's
  body) and comes out at 0 is named, with the view to give a size.
- **`DECLARE4043` (new warning):** a view written inside a `Button`, which lays out only its own
  icon and label, so the child lands at its top-left; the message names `iconLeft`/`iconRight`.
- **A failed lookup's "motion is still in flight" note names only motion that could explain it**
  (after Venue 36 and 37, where it named only the focus ring's glide): motion on a view a lookup
  can neither find nor be blocked by — no role or text in it, no presses taken — is left out
  (`__declare.moving(true)`); `drive.settleMotion()` still waits for all of it.
- **Fix round after the 2026-11-15 rotation** (Presentify 13, NYT 2–4, 7GUIs 4, RealWorld 3):
  - *Platform:* an auto-fetch decides at the settle's close, always — a source given its `url`
    as the tree was built fetched before the `headers` declared after it existed (RealWorld 3's
    token-less reload); a line that begins with `:path` starts a statement (two `:field = …`
    writes without a semicolon were a syntax error); a diagonal wheel over a pane that scrolls
    both ways moves both axes (the across-scroller's own wheel listener cancelled the down part).
  - *Checks and messages:* a size capped with `Math.min(…)` is room given (the open `Menu` was
    flagged "nothing to scroll"); focusing a focusable view that is hidden says hidden — and
    names the layout that holds an arrival hidden — not "not focusable"; DECLARE4000's `classFor`
    advice says the script function returns the class's name, kept with `use [ … ]`.
  - *Reference:* `Color` (how a color is written; a schema field holding one is `Color`),
    `afterDelay` returns `DelayHandle`, `Dialog.open`'s records name `destructive`, `Menu.items`
    (a `command` row runs the binding; `key` written platform-neutral), `Form.error` (several
    unnamed refusals join; a list reads `errorBody`); guide 15 (optional fields read as
    `T | null | undefined`; a shapeless field is `any`), guide 18 (Escape on a panel that is not
    a `Floating`), guide 9 (a view drawn over others takes their hover — a veil — or is
    decoration with `pointerEvents = "none"`); verify.md (path indices count paint order;
    scrolling the App from a script).
  - *Tools:* `drive.read` and `expect.attr` read a path through values, as `look --read` does;
    requests record the headers the program set (`--requests` prints them); `wheel` logs which
    number is which; clipped screenshots stay within the window (`captureBeyondViewport: false`),
    which had dropped hover and resized the page mid-check — in verify, look, and the 7GUIs
    and NYT drives.
  - *Closed, no change:* hover vs. presses (DT: today's asymmetry is right — a veil is a use);
    `""` in a color slot stays an error; no persistence this round; the constraint cycle in
    Presentify 13 did not reproduce.
- **`minScale` / `maxScale` (new, View):** the range a view's `scale` stays in, as `minWidth`/`maxWidth`
  bound a width — a scale written, or computed by a constraint, outside it is held at the nearer
  bound, and a constraint asks again when a bound moves. They change nothing by themselves: how
  the scale changes (a pinch, buttons) is the program's. The touch-target check judges a control
  inside such a view at `maxScale` (Venue 37's overview seats). Names from the precedents (iOS's
  minimumZoomScale/maximumZoomScale, Flutter's InteractiveViewer minScale/maxScale) and Declare's
  own min/max pairs. Taught in guide 10 § Bounding a scale.
- **A `:path` read inside `{ }` has its field's type (DT, 2026-11-16).** Names were already
  checked there against the schema; the read itself was `any`, so `:done * 2` or
  `fill = { :tone }` (a string headed for a color) compiled. Now the type check gives each
  body's `this` one `$data` signature per path it reads (schema-check.ts `pathReadTypes`),
  in the check block's header — the body's text is never edited. An optional field reads as
  `T | null | undefined`; an index into an array may be absent; data of no declared shape,
  and a selection over an array, stay `any`. Declared defaults (`name: T = { :field }`) are
  checked too, names and types, as attribute values and methods already were.
  - Evidence: Presentify run 16 painted four data colors straight from `:path` reads, past the
    `Color.from` rule, because the compiler could not see their type.
  - Measured before turning it on, over every program in the repository (468: apps, docs
    demos, saved eval apps): of the 343 that compiled, 2 were newly refused — the two games'
    `classFor` lookups that left one kind of a literal union out, behind a `??` fallback
    (completed, behavior unchanged); no already-failing program's errors changed; the 341
    compiled both ways emit **byte-identical programs and dependency tables**, so nothing
    changes at run time; compile time over all 468 rose from 56.5 s to 59.7 s. The test
    suite, with it on, failed only on those two games.
  - The "not a member" message on an object type no longer advises declaring the name; it
    names the lookup case (add the entry, or type the lookup `Record<string, …>`).
  - Guide 15's table loses its braced `:path` row ("nobody yet"): the chapter's rule, "the
    compiler checks every read it can see", now covers it without a line of its own.
- **A pointer's frames, documented as the runtime has them (2026-11-16; docs only).** The
  reference said `deltaX`/`deltaY` are "in root space" on every pointer event. On a drag
  (`onDragStart`/`onDrag`/`onDragEnd`) the runtime gives them in the frame the dragged view's
  own `x`/`y` are set in — the root travel divided by the parent chain's scale, plus the
  scrolling around it since the press (`dragDeltas`, drag-autoscroll.ts) — by design, so
  `x = startX + e.deltaX` holds under any zoom. Presentify runs 15 and 16 read "root space",
  divided by their zoom, and failed the same three checks. The `PointerEvent` entry, a
  per-member entry for each field (`declare-help PointerEvent.deltaX`, which now answers
  for any shared interface's member, inherited ones included), and guide 9 § Dragging now
  say what is true.
- **A color is a value in code; data holds text (DT, 2026-11-16).** Replaces the 11-15 rule that
  a data schema field holding a color is typed `Color`, and the 11-15 change that typed such a
  required field non-null.
  - **`Color` leaves the data schema's field types**, which are JSON's: string, number, boolean,
    any, a schema, a literal union, a nested record. `fill: Color` gets the refusal `fill: Length`
    gets. The arrival check's `Color` case is gone. A color in data is a `string` (or a `number`)
    like any other value the program interprets; nothing is taught about colors in data.
  - **`Color.from(s)` (new):** the color some text writes (`"#RGB"`, `"#RRGGBB"`,
    `"#RRGGBBAA"`), or null. **`Color.hex(c)` (new, 11-15):** a color as text, from the
    renderers' own encoding. The two are the only crossings between text and a color.
  - **The compile's literal step fires on Declare's `Color` only** (known by holding the color
    names), not on any `` `#${string}` `` type: a program's own hex type is text.
  - Why: the evidence was Presentify run 15 (minimal). Its schema typed colors `Color`, as the
    hint said; the literal step turned the records' `"#5B3DF5"` into `5979637`; the service
    refused every save (422) — 11 of its 14 failed checks (16 of 19 pass with the literals kept as
    text). Root: `Color` was a union of encodings (number, hex, name), so each patch moved the
    ambiguity. Now a `Color` is one thing, a number in the runtime's encoding, and two colors
    compare with `==`.
  - The hint for a string headed for a color slot now says: "a string is text, not a color: read
    it as one with Color.from(s)". The run-time message for an unreadable color string says the
    same.
  - Considered and dropped: converting data colors on arrival or on send (a hidden conversion,
    and partial); a `HexColor` data type (special teaching for one kind of string); the compiler
    turning names into hex text (left `Color` a union, and parsed on the paint path).
- **The unit tests counted only what ran before a `summarize` call midway**: 23 later tests ran
  uncounted (all passing); the summary is now at the end.
- **The run-time color-string error names its place** (`the color "" on app.….fill …`), after
  Presentify 12 spent three rounds finding an empty-string default.
- **A quoted color in a bare value** (`fill = "#4169E1"`, `fill = "royalblue"`) is the same
  color as unquoted, as a quoted enum token already is (DT, after Presentify 12's probe).
- **Type renames:** `Numerals` is now `NumeralStyle` (with the attribute `numerals` now
  `numeralStyle`), `Axis` is now `LayoutAxis`, and `Percent` is internal (inlined in `Length`).
- **Misuse names the kind.** A service or a builder's type written as a tag is told what it is,
  and a declaration that takes one of Declare's names is told which kind of name.
- **Collisions: no shadowing (ruled).** Every Declare name stays refused at the declaration, now
  with a message naming its kind. A program's own declaration shadowing a type-only name was
  rejected: a word with a program-dependent meaning makes a program unreadable, as operator
  overloading does.
- **Not built: color strings** (the design's second stage).

Migration is out of scope by ruling (DT): the old spellings simply no longer exist.

Tests: the full suite; for the changed surfaces, `scaffold`, `unit`, `slim`, `slim-signals`,
`subclass-roots`, `focus-ring`, `accessibility-browser`, `api-signatures`, `name-scope`,
`script-block` and `declarec`.


## The Pagemap run 1 fix round (2026-11-17)

- **A size beside a computed `flexes` is refused at compile time.** `width = { … }, flexes =
  { phone }` was refused only at run time, in a state where `flexes` was true. The checker now
  refuses it at the size's line, naming the form that says the intent: `flexes = true` with a
  computed `maxWidth` (and `minWidth` for a floor). Considered and dropped: letting a stated
  size apply while the child doesn't flex. A reader from CSS takes a size beside `flexes` as
  the size it grows from, so it would be silently ignored, and the refusal that catches that
  mistake would go. The layout refusals' "to fill" clause also names the bounds now.
- **An object as a value: the message shows the person's line corrected** (`write = { {} }`),
  and the notation chapter states the rule: braces after `=` open a constraint, so an object
  takes a second pair. Considered and dropped (DT): accepting `= {}` as an empty object, and
  reading `= { a: 1 }` as an object. `= { a }` already means a constraint reading `a`, so
  forms that look alike would mean different things.
- **A bare name both a member and a top-level script binding answer to is an error**
  (DECLARE4045, DT). It was a lint warning (DECLARE4002) among many, and the member silently
  won: in Pagemap run 1 an App method `initialsOf(id)` calling the script's `initialsOf(name)`
  called itself and overflowed the stack at boot; the original Pagemap hit the same leak. A
  library class's own member meeting a program's script name stays allowed: the library never
  calls the program's script, and its code is not the program's to rename. DECLARE4002 keeps
  its other case, an inner member shadowing an outer one, which has a written fix (`app.x`).
- **`Text.truncated` reports a last line cut short with an ellipsis**, not only lines dropped
  past `maxLines`, and is a rule of its own, so a text whose height another rule states (a
  `TextLabel`) has it too. verify reads it to report a control's own words cut short.
- **A clamped run's hidden remainder is inline at no size** on the DOM, not absolutely
  positioned: Chrome named a cut "Comfortable" as "Co mfortable", and a copy carried a line
  break. Unverified in Safari and VoiceOver.
- **`Button` cuts its label inside its margins** when given a width narrower than its content:
  an ellipsis, the full label as its accessible name and, when cut, its tooltip. Its default
  width is now measured from its label and icons rather than read from its run, so the label's
  limit can read the button's width without a cycle.
- **verify: text past the view it sits in.** A run drawn past either edge of its parent is a
  layout finding when the parent has a ground (a fill or a stroke) or the spill lands on a
  neighbor, and the run sits within the parent's height (a caption under a disc does not count).
- **A view's content size is what it holds with nothing in it giving way, and a layout that
  sizes its children says how long that is** (DT 2026-11-18). `place()` may return
  `{ boxes, contentWidth }` (`contentHeight` along a column) instead of its bare boxes; the
  number is the view's content size on that axis (its padding added), worked out from what the
  children bring before the room is applied. SimpleLayout reports it when its run shrinks or
  flexes a child; WrappingLayout reports one row's length; a layout returning bare boxes leaves
  the content size to what it draws, as before. This is what `shrinks` always promised ("the
  size its content gives it"): a container's content size had counted its parts at the sizes
  its own layout gave them under the width its parent gave it, so it was a function of itself
  (Pagemap's header looped at sign-in; a title laid out empty stayed at its padding; a
  shrinking tag group stayed one tag wide). The page's scroll extent keeps what is drawn.
  Considered and dropped: separate `naturalOf` / `naturalExtent` members (a second name for an
  almost-identical concept, and a second copy of each layout's arithmetic) and a measuring run
  of `place()` outside the pass (irregular).
- **An arrangement chosen by the width it is given has no content width.** ResponsiveLayout and
  a WrappingLayout with `columns` return `contentWidth: null`; a rule that reads it (a parent
  sizing the view from its content in any way) is refused at the read, and so is the view
  when nothing gives it a width. `shrinks` on a ResponsiveLayout view is refused at compile
  time. Its documentation already required a given width; breaking that failed silently.
  Considered and dropped: a natural width for a ResponsiveLayout (its widest plan's), which
  contradicts itself, and a `needsGivenWidth()` flag (the `null` report says it).
- **Diagnostics from the layout review** (no language change): a size taken from the parent's
  through another attribute is reported below zero as a direct read is; an error raised in
  library code (a layout's `place()`, a library class's rule) names where the author wrote the
  view it was working on; verify no longer says a flexing child "takes its width from" a row
  sized by its children (the flex finding says it).

## The Pagemap functional run 1 fix round (2026-11-18)

- **A built-in color name is a color on every class.** `fill`, `textColor`, `textFill` and
  `tint` already took a value set on them as a color whatever the class declared, so a
  `tint: string` was handed numbers and its use (`Color.from(classroot.tint)`) failed with no
  report. A declaration of one of these names as anything but `Color` or `number` (what a
  color is) is now refused, naming the rule and a free name. The corpus declares `tint` only
  as a `Color` or a `number`. Considered and dropped: letting the declared type win, which
  would make the name mean two things.
- **`Switch` takes a `label`**, as `Checkbox` does: shown, part of what a press reaches, and
  its name to a screen reader. The words come first and the switch after them, every
  platform's order for a switch; given a wider width, the switch keeps to the trailing
  edge, so a full-width labeled switch is a settings row. The pill is now a part of the
  switch (`_track`), so `fill`, `stroke` and `cornerRadius` set on a `Switch` no longer
  paint it; nothing in the corpus set them. Its focus ring circles the switch alone, as
  Checkbox's circles the box.
- **No change: `press()` takes no modifier keys.** An activation has none, on every platform
  but the web's event model; the rare control that needs them reads `Keyboard` at the press,
  and extending a selection belongs to the collections.
- **Runtime and tool fixes** (no language change): a rule that closes an `exists` gate while
  the views under it come in, or while a list attaches its new rows, no longer attaches into
  the removed parent; a window the program opens no longer stalls verify (the program's page
  is put back in front, and the window is said); verify's `expect(value)` has
  `toMatchObject`; a compile records the `.ts` files its script imports bundle, and what
  they import, so an edit to one compiles the program again (the dev server had kept serving
  the old code).
- **Calling the model from a verify script** (no language change): `drive.call(path,
  method, …args)` calls a method and returns its result, so a script can test the model's
  rules directly; the app is still tested by pressing what a person presses, and the verdict
  says calls, not input. Vortex's `tests/assert.mjs` is the first, against the running game.
  Considered and dropped: test programs (a part included on its own, paired with a script
  by name in the ladder), since the running app already gives the model a quiet start, and
  several cases per file each from fresh records.
- **The release's size, back under 0.7.0** (DT 2026-11-19): the calendar had grown 6.2 KB.
  It drops `Menu` (below 480 the date goes to today when pressed, and Today hides);
  `Button` sizes from its run's content length, and `Segmented` keeps both
  `segmentWidths` with less code; neither shows a tooltip for a cut label, which is a bug
  verify reports, not something to ship. Production builds leave out what only a developer
  is told (the layout's checks, the rule loop's search, the author's line on an error).
- **A production app shows no words the platform wrote** (DT 2026-11-19, reversing the
  strip's rule that a DataSource's `.error` stays readable because an app may show it). An
  app reads a failure by its `failure` kind and says it in its own words; the platform's
  text is coded in production, with its values, wherever it would reach a person.
- **A content size heard through the view's own cell** (no language change): a rule wired
  once, at bind, read a view's content size before its layout existed, and never heard the
  length the layout later reported (a Button stayed narrow when its label grew). The view
  now has a content cell its layout signals.

## Open: what the layout guard enforces (2026-11-19, not decided)

Before a layout uses its view's own width as the room to share out, a guard
(`Layout.sizedByChildren`, behind `viewExtent`) asks whether that width depends on the
children; if it does, the room is taken as unlimited (no shortage). What was established:

- **It is broader than the rule.** It counts a read of ANY cell of a laid child, visibility
  included, while a loop can only run through what the layout writes: positions, and the sizes
  it gives. Reading the reported content length reads which children are laid (their
  visibility), so `width = { Math.min(this.contentWidth, room) }` is treated as sized by the
  children and nothing shrinks. Button works around it by reading its run's content width
  through `_natural`, which the guard does not see.
- **It is narrower than the rule.** It sees only the width rule's direct reads, so a real loop
  through another attribute passes unnoticed (the same blind spot `_natural` uses).
- **The reported length is not always independent of the room:** SimpleLayout counts a child
  sized as a percent of its parent at its current size, which the drawn content size leaves
  out for that reason.
- **It runs on every pass that asks for the room** (every frame in an animated arrangement),
  building a set of the children's cell ids each time.
- **Considered:** an exact predictive guard (transitive, through the reported length into
  the pass) needs a walk of the dependency graph whose inputs change as rules re-track, so it
  cannot simply be cached; and keeping the guard only for a view sized by its children (the
  auto-extent, where it defines "no shortage"), leaving a real loop through a rule to the
  kernel's cycle detection. The second is cheap and exact by construction, but turns a
  program that today works by the guard's silence into a reported loop. Not on solid ground
  yet (DT); nothing changed.

## Pinned children and order (2026-11-21)

Asked for by DT after the model-tour build surfaced them. Four changes, one rule: stacking,
Tab and reading all follow the declared order, and a `tabOrder()` is the one way to say
otherwise for Tab and reading.

**A pane's pinned children paint and take presses in declaration order.** A child with
`ignoreScroll` inside a scrolling view used to paint above every scrolled child, wherever
it was declared — the DOM's one shared sticky frame carried `z-index: 2`, canvas painted
pinned children in a second pass, the Mac host put them after its content layer, and the
shared hit walk offered them the point first. Now: the DOM gives each pinned child a
sticky frame of its own in its place (`makeScrollFrame`, `restackFrames` — a frame after
all the content keeps the lift, so a focus ring riding the pane stays under the chrome
declared after it); canvas paints the pane's children in one pass; the Mac host puts
pinned children declared before the first scrolling one under its content layer and the
rest over it (a pinned child between two scrolling ones goes over all of them — nothing
does that); `hit-walk.ts` offers children the point in reverse declaration order only.
The old placement was recorded in scrolling.md as a "known v1 bound", not a rule. Audit:
no first-party pane declared a pinned child before its content; the sampler's DataGrid
header is after its rows and keeps the lift. Tests: `pinned-order.test` (pane, pixels and
a press), `conform.test` (presses, DOM/canvas/Mac), the Mac gate's new `pinned-pane`
probe (0.12% vs the DOM). Alternative not taken: keep the lift and document it as an
exception to "stacking is declaration order".

**At the App level, the same order for presses.** The hit walk's lift also applied to the
App's own pinned children, so a bar declared *before* the page was hit on top while the
page painted over it once scrolled (the App-level paint fix of 2026-11-20 had already made
paint follow declaration order there). Two apps declared their bar first and relied on
the pre-fix accident that painted it last: **docs** (the chapter text covered the header
when scrolled) and **birds** (the plates covered the masthead). Both now declare the bar
after the page, with an App `tabOrder()` putting it first for Tab and reading. The
scrolling chapter's first `ignoreScroll` example declared its bar first; it now declares
it last and says why. `gesture.test`'s walk fixture likewise.

**Reading order follows `tabOrder()`.** A screen reader read a view's children in
declaration order whatever its `tabOrder()` said, so the homepage's header was first for
Tab and last for a screen reader. Now `readingOrder()` (semantics.ts) orders the runtime's
semantic tree by the view's own `tabOrder()` — its own children only, the listed ones
first, the rest after as declared, nothing removed (`visible`/`exists` decide that) — and
the DOM says the same with `aria-owns` on the view's element, only where the order differs
(semantics-dom.ts `readsInOrder`; a view with its own `tabOrder()` is now annotated even
without a role). Canvas and the Mac host have no screen-reader tree yet. Test:
`accessibility-browser.test` (Chrome's tree, the runtime's and Tab agree; a gated panel is
still read). Alternative not taken: a `tabStart`/`tabFirst` attribute — DT ruled it sugar
for a small problem; `tabOrder()` and `tabDefault()` suffice.

**The to-do app** declares the same two-line `tabOrder()` for its bars, so Tab reaches
search and New task first on a desk and the lists button first on a phone.

**Not changed, recorded:** layouts are not mirrored for right-to-left; a `reverse`
attribute on `SimpleLayout`/`WrappingLayout`, set by a constraint at the developer's
discretion (from a localization bundle's `dir`), is the recorded idea. The calendar's
collapsed `DetailSection` field is clipped but still read by a screen reader (the
accordion builds its body only while open) — a separate, existing gap.

## Two checks from the model tour (2026-11-21)

**A field read by a computed key follows its writes.** `app.choices.value[k]` read the
field once and never again: the extractor's element-access arm ended the chain at a
non-literal key and wired only the `value` slot, which a write to `["a"]` never changes.
`read([k])` is refused for the same reason (DECLARE7001); the index form slipped through
in silence. Now a computed key on a reactive chain sends the body down the tracking path
(DYNAMIC), which records the key it read — as `JSON.stringify(app.d.value)` and script
helpers handed a tree already do (`dep-extract.ts`, `intoTree`). A function written in
place and called with the tree, `((v) => v[k])(app.d.value)`, is treated the same way.
Test: `silent-failures.test` (both forms follow a write). Alternative not taken: refusing
the form as DECLARE7001 does and pointing to `:@[(k)]` — the read is legitimate
TypeScript and the tracking path answers it correctly; `:@[(k)]` stays the form the guide
teaches for a field chosen at runtime.

**Provided values set on a container are typed.** `textStyles`, `fontWeight` and the
other built-in provided values set on a view that does not read them itself — on the App,
on a container for its subtree — were typed `unknown` in the checker, so `textStyles =
{ { t } }` with an App attribute `t: number` hiding `style t` passed, and no type name in
the tour's code was colored. `tsSlotType` (`typecheck.ts`) now falls back to the type the
classes that read the value declare, the rule `compile.ts` `slotTypeOf` already used.
`theme` has no declared type in any class, so it is still unchecked (`theme = { 5 }`
passes); typing it is a schema change, not made.

**Color names are read at run time (2026-11-21, DT).** `Color.from(s)` reads a CSS color
name (any case) as well as hex, and so does a color string that reaches a color attribute
at run time (`value.ts` `toColor`, through one `namedColor`). Before, names were read only
where the compile could see them, to keep the names' table out of a running program; text
that is no color is still said and paints nothing. Cost: the 148-name table now ships in
every runtime — measured on the to-do app's production build, +1,470 bytes gzipped
(197,281 → 198,751). DT: a decent convenience, and what the `Color` type (which includes
`ColorName`) leads a reader to expect. Test: `color-strings.test`. Alternative not taken:
including the table only in programs whose source calls `Color.from` (a compile-time
exclusion); the runtime's own string reading would then still have refused names.

**A Slider's thumb sits on its track at any height (2026-11-21).** The thumb was placed at
fixed offsets (`y` 5, 4 or 2 by thumb style), which centre it only in the default 28-tall
slider; the track is `y = center`. A slider given another height (32, or 44 for a finger)
drew its thumb above the track. The thumb is now `y = center` too — the same positions at
28 for all three styles. Library only (`library/slider.declare`).

## From the language expert's probes (2026-11-22)

**Two Springs on one attribute are refused.** Each owns the slot for as long as it lives,
so two pulled against each other and never settled — accepted in silence before. The check
beside the bound-slot one (`check.ts`) now refuses the second, naming the form that works
(one spring whose target says every case); `Diag.springsSameSlot`, DECLARE2005.

**A loop among one element's declared defaults is refused at compile time.**
`a: number = { b + 1 }, b: number = { a + 1 }` was caught only by the boot's cycle guard,
though the dep sets show it. `dep-extract.ts` `refuseDeclLoops` names the loop at the line
(DECLARE7001). Main-tree elements only: a class body's default may be replaced where the
class is used. The corpus has no hit but the probes.

**Two messages say forms that work.** A computed attribute (`this[k]`) advised "bound the
key's type", which the extractor never accepted (it sees no types); it now says to read each
attribute by name, or keep the values as a record's fields and read `:@[(key)]` (the
constraints note's policy line likewise). `style` and `className` on a view answer with
Declare's forms (teach.ts) instead of "did you mean 'scale'".

**Open, not changed: the settle runs rules in invalidation order, not dependency order.**
`kernel.md` §3 says a topological order per phase; `kernel.c` (and `kernel-js.ts`) pop the
queue FIFO with re-queue. Measured: a diamond is seen half-updated (a rule reading `a0` and
`c.width`, where `c.width` follows `a0`, ran on the new `a0` and the old `c.width` and threw);
a rule summing a chain of N views re-runs about N/2 times for one change (11 at N = 20, 66 at
N = 130); at N = 260 the 100-run guard calls the acyclic graph a cycle. Applying the existing
pull at settle time (run a queued rule's queued owners first) was tried: it fixes the diamond
but not the chain (7 and 44 runs), because a chain's links are not yet queued when the reader
is reached. The fix is a queue ordered by depth (a rule's height: one more than the heights of
the rules that own its inputs), as §3 describes.

*Tried, measured, and backed out (2026-11-22).* A height per rule (above every rule whose write
wakes it, whose owned cell it reads, or that takes ownership of a cell it reads), and a
lowest-height-first heap per phase, built in both kernels, C and JS in agreement (conformance
29/29), fixed every probe: the diamond reads consistently, the chain reader runs once at
N = 20, 130, 260, no false cycle, a real cycle still caught. But it cost more than it saved
where the graph has a deliberate, converging feedback loop: a virtualized list's replicator
reads where its rows were laid out to choose its window, and the layout reads the rows it
built. Heights learned round that loop put the replicator after the layout, so it ran two to
four times a turn and its rows' nested replications rebuilt: the tracker's search scenario ran
17% more rules (28,387 → 33,270; the same state at every step), and a small filtered list with
replicated labels 2.5× as many (5,432 → 13,600; views built 899 → 1,933). Boot was unchanged
(measured back to back). "Dependency order" has no single answer inside such a loop, and FIFO by
invalidation happens to suit it. The kernels are as they were; the attempt is kept outside the
tree. Open: a design that orders the acyclic part and leaves converging loops in queue order.

## `measureText` answers exact widths and heights (2026-11-23)

`text-measure.ts`. `measureText(…).width` and `.height` were rounded up to a whole pixel;
now they are the measurer's exact values, fractions kept. A `Text`'s own size is unchanged:
its box is still its widest line rounded up. Asked for by DT, so that a program can round
as its design needs: the LZX Calendar sizes a button as OpenLaszlo did, `round(width + 4)`,
which a pre-rounded width could not reproduce, and it carried a table of measured widths
instead.

*Measured before the change.* Every use in `apps/` and `library/`: the Segmented control,
the docs app and the Calendar's date block already wrap the measure in `Math.ceil` (no
change); the Calendar picks the same label at every room from 40 to 320; a Menu panel is at
most 1 px narrower (its labels size themselves, nothing clips); the tour's chips, which
`Math.round`, are 1 px narrower in 5 of 8, their right padding centered on its 14 instead
of 14–15. Twelve apps shot under both: nine identical, three with anti-aliasing noise only.
The case rounding up would protect, a `Text` given exactly its measured width: 945 runs
(21 strings, 9 sizes, 5 faces, two weights) wrapped none at 1x, 2x or 3x, in Chrome (DOM and
canvas renderers) and Safari 27.2, whose DOM line widths agree with its canvas measure to
0.00005 px. The canvas renderer breaks lines with the runtime's own measure, and wrapped
none. The Mac host's measurer was already exact (Core Text's advance) and the rounding was the
shared runtime's; its text layer, which breaks lines natively, wrapped none of the 945 either
(each run captured beside its rounded-up twin). Firefox was not available.

*Alternative not taken:* a second, exact field beside a rounded one (two names for one
fact), or rounding to the device pixel (still a rounded measure).

## An embedded app's assets resolve beside it from its first evaluation (2026-11-23)

`boot.ts` (`buildProgram` takes the app's `assetBase`), and its callers: `renderProgramAsync`,
`host-client.js`, `host-islands.js`, `mac-boot.js`. A host registered an app's own asset
directory after building it, so a face or bitmap that started loading during the build resolved
against the page instead: in the Viewer's edit pane, the LZX Dashboard's first font came from
the Viewer's folder (a 404) while its later ones loaded. The build now runs with the app's base
as the page's, and the root holds it from then on. A bug fix; the documented rule ("relative
means beside my program") is unchanged.

## A compile that quiets a finding keeps its program (2026-11-23)

`compile.ts`. When `defaultFlags` quieted a diagnostic, `compile()` copied its result with a
spread, which dropped the program (a non-enumerable property): no program and no error. It now
copies with `carryProgram`, as the other copies do. Pinned in `diagnostics-hints.test.mjs`.

