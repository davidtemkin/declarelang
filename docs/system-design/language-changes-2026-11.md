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
