# Presentify

A slide editor written in Declare: make a presentation out of slides, shapes
and words, then give it. Presentations live in the Presentify service
(`task/api/API.md`), which must be running on `http://127.0.0.1:8360`; this
program writes nothing anywhere else.

## Running it

From the repository root, `npm start`, then open
`http://<the address it prints>/my-apps/presentify/presentify.declare`.

## Where things are

| file | what it holds |
|---|---|
| `presentify.declare` | the App: where the person is (the open presentation, in the URL), the screens and the grow-from-card motion, the presenter, menus, the colour palette, dialogs, the clipboard |
| `model.declare` | the data: schemas for the service's format, `Doc` (the open presentation's working copy), `History` (undo), `Sync` (keeps the service in step), `Library` (the list of presentations) |
| `editing.declare` | `Editor`: the slide being edited, the selection, the tool, the text being typed, and every verb the person applies |
| `editor.declare` | the editor's views: top bar, slide list, canvas (pointer work, handles, typing in place), inspector |
| `library.declare` | the list of presentations |
| `slide.declare` | one slide drawn at 1280 × 720, used everywhere a slide is shown |
| `parts.declare` | the look: theme, icons, wordmark, small controls |
| `geometry.ts` | pure functions over the slide format: bounds, hit-testing, moving, resizing, grouping, alignment, snapping |
| `fonts/` | Bricolage Grotesque and Inter (SIL Open Font License), the brand's two faces |

Two rules hold throughout. Every change the person makes is a write to
`app.doc` inside `app.history.step(…)` (or between `begin()` and `end()` for a
drag), so it is one undo step. `Sync` alone talks to the service, by
comparing the working copy with what the service last confirmed.

## Checks

Each script drives the running app against the live service, makes what it
needs and deletes it afterwards (the sample presentations are only read):

```bash
npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/flow.mjs        # the brief's "what done looks like"
npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/editing.mjs     # handles, proportions, undo, clipboard, offline
npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/library.mjs --boot-budget=40000   # rename, delete, long title, 100 slides
npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/presenting.mjs
npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/labels.mjs
```
