# Presentify

A slide editor written in Declare. You make presentations out of slides, shapes and words, and then present them.
It stores everything in the Presentify service (`task/api/API.md`), which must be running on
`http://127.0.0.1:8360`. The address is `app.api` in `presentify.declare`.

## Running it

```sh
npm start            # from the repository root
# then open http://127.0.0.1:8200/my-apps/presentify/presentify.declare
```

A presentation has its own address, `…/presentify.declare#d1`, and Back returns to the list.

## Where things are

Read `presentify.declare` first. Its header describes how the program is built.

| file | what it holds |
|---|---|
| `presentify.declare` | the App: where the person is, the verbs (style, align, group, slides, present), the list of presentations, the editor's frame, menus and keys |
| `presentify-model.declare` | the service's format as schemas, and `Presentation`: the working copy, undo history, the save queue and conflicts |
| `presentify-slide.declare` | `SlideView`: one slide drawn at any scale, used on the stage, in the slide list, on cards and when presenting |
| `presentify-stage.declare` | `Stage`: the slide being edited, plus selecting, moving, resizing, drawing, snapping and editing text in place |
| `presentify-panels.declare` | the slide list, the inspector, and a presentation's card |
| `presentify-parts.declare` | the palette, icons, the mark and the small controls |
| `shapes.ts` | geometry as plain functions: hit testing, bounds, resizing, snapping, aligning, grouping |

## Rules worth knowing before you change it

- **Each change creates a new pages array** that is passed to `doc.apply()`. Nothing changes an element array in
  place, because undo snapshots share those arrays with the document.
- **Each user action is one undo step.** Wrap it in `doc.begin()` and `doc.commit()`. A drag commits when the pointer
  is released, a run of typing commits when editing ends, and a held arrow key commits when the key comes up.
- **Saving is a queue**, `Presentation.send()`, that sends one request at a time in this order: create slides,
  delete slides, update the deck's title and order, then save changed slides. If the service can't be reached, the
  change is kept and the request is retried. A `409` on a slide records a conflict and shows the person a choice;
  nothing is written over another window's work without it.
- **Group children keep slide coordinates**, as the format requires. A group is drawn as a full-slide layer.

## Checks

```sh
npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/flow.mjs
npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/editing.mjs
DECK=<id of a 100-slide deck> npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/hundred.mjs
```

- `flow.mjs` runs the brief's "what done looks like" scenario against the live service, then deletes what it created.
- `editing.mjs` checks the finer editing rules: proportions, corner radius, marquee selection, held keys,
  empty text boxes, copy and paste, deleting slides, and stacking order.

## Known limits

- **Alignment while typing.** While a text box is being typed in, its text is left-aligned, because the platform's
  `TextInput` has no alignment setting. The chosen alignment returns when editing ends.
- **Clipboard.** Copy and paste go through the app and the browser's local storage, so they work across slides,
  presentations and windows of Presentify. They do not reach other applications.
