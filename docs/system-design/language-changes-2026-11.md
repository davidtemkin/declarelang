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

