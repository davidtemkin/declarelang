# Presentify

A slide editor written in Declare. You make presentations from slides, shapes
and words, and present them. Everything is stored by the Presentify service
(`task/api/API.md`), which must be running on `http://127.0.0.1:8360`.

## Running it

From the repository root:

```sh
npm start            # the dev server; it prints its address
```

Then browse to `http://127.0.0.1:8200/my-apps/presentify/presentify.declare`.
An open presentation has its own address (`…presentify.declare#d1`), and Back
returns to the list.

## Where things are

Start with the header comment of `presentify.declare`. It describes how the
program is put together. The files, in reading order:

| file | what it holds |
|---|---|
| `presentify.declare` | the App: where the person is, opening and closing presentations, menus, commands, copy and paste, presenting |
| `model.declare` | the service's format as schemas, and the geometry (bounds, hit-testing, moving, fitting, aligning, snapping) as plain functions |
| `doc.declare` | `Doc`: the open presentation and every verb that changes it, with gestures and undo steps |
| `sync.declare` | `Sync`, which keeps the service in step and handles conflicts and retries; `History`, the undo stacks |
| `editor.declare` | the stage (selection, drawing, handles, snapping), the slide list and the inspector |
| `slides.declare` | drawing a slide; used by the stage, the thumbnails, the covers and presenting |
| `library.declare` | the list of presentations |
| `brand.declare` | the palette, the wordmark, the icons and the small controls |

## Checking it

```sh
cd my-apps/presentify
npx declare-verify presentify.declare                              # compile, check, boot
npx declare-verify presentify.declare --assert tests/draw.mjs      # drawing, typing, undo, saving
npx declare-verify presentify.declare --assert tests/manipulate.mjs # resizing, corners, lines, paste, slides
npx declare-verify presentify.declare --assert tests/scenario.mjs  # the brief's "what done looks like"
```

Each script creates its own presentation on the service and deletes it when
it ends.
