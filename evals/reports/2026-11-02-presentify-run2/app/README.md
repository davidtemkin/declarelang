# Presentify

A slide editor written in Declare. Every presentation lives behind the local
Presentify service (`task/api/API.md`, port 8360); this program is the whole
client, with no server of its own.

## Run it

```sh
npm start                      # from the repository root
# then browse to http://127.0.0.1:8200/my-apps/presentify/
```

The service must be running on `http://127.0.0.1:8360` (the App's `api`).

## Check it

```sh
npx declare-verify my-apps/presentify/presentify.declare                 # compile, types, boot
npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/done.mjs
npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/tests/editing.mjs
```

The two scripts drive the app as a person would, against the running service.
`done.mjs` is the brief's "what done looks like": a new deck, drawing and
styling, aligning and distributing, grouping with undo, duplicating and
reordering slides, presenting, auto-save, and a colleague's conflicting edit.
`editing.mjs` covers resizing and corner radii, proportions, nudging,
undo/redo, lines, the clipboard across slides, the slide list's keyboard,
saving while the service is unreachable, and renaming and deleting from the
gallery. Each removes the deck it made. Set `SHOTS=1` to save screenshots
to `/tmp/pf/`.

## Where things are

Each file opens with a comment on how it is put together; read
`presentify.declare` first.

| file | what |
|---|---|
| `presentify.declare` | the App: where the person is, the verbs (`commit`, `undo`, the commands in `run`), the menus, the screen |
| `model.declare` | the service's shapes as schemas; geometry as plain functions; `Doc` (the open deck), `History` (undo), `Saver` (keeping the service in step) |
| `art.declare` | `SlideArt`, the one drawing of a slide used everywhere |
| `editor.declare` | the stage (gestures, handles, guides, typing), slide list, inspector, colour picker, conflict notice, presenter |
| `home.declare` | the gallery |
| `brand.declare` | palette, icons, the mark, small controls |

Two rules carry the design:

- **Every gesture ends in one `app.commit()`.** That is one undo step (whole
  deck snapshots in `History`), and a nudge to the `Saver`. Writes during a
  gesture go straight to the `Doc`, so every picture of the slide follows live.
- **The `Saver` diffs; it never queues.** It compares the `Doc` with what the
  service last accepted and sends the first difference: deletes, creates, the
  deck's order and title, then slide contents. Undo, a failed write, or a
  slide deleted elsewhere therefore all converge with no special cases. A 409
  becomes a conflict the person resolves (`ConflictBar`).

Shortcut note: ⌥⌘D is taken by Declare's Inspector in development, so
Duplicate Slide is ⇧⌘D.
