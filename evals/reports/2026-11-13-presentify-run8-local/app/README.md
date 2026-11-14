# Presentify

A slide editor written in Declare: a list of presentations, each opened into
its slides; rectangles, ellipses, lines and text boxes drawn, moved, resized,
styled, grouped, aligned and stacked; undo for all of it; saving as it goes;
presenting full screen. Desktop only.

## Running it

The data service (`task/api/API.md`) must be running on port 8360. Then, from
the repository root:

```bash
npm start
```

and browse to `http://127.0.0.1:8200/my-apps/presentify/presentify.declare`
(or whatever address `npm start` prints).

## The files

| file | what it holds |
|---|---|
| `presentify.declare` | the App: where the person is, every verb they can use, and the screens (the list, the editor, presenting) |
| `presentify-model.declare` | the service's format as schemas, the geometry and arranging functions, `Library` (the list of presentations) and `Presentation` (the open one, and the loop that saves it) |
| `presentify-slide.declare` | how a slide is drawn — one class, used by the editor, every thumbnail and the presenter |
| `presentify-parts.declare` | the look: the theme, the drawn icons and logo, and the small controls |

Each file opens with a comment on how it is put together; start with
`presentify.declare`.

## How it holds together

- **Edits are immediate; saving follows.** Every change writes the working
  copy (`app.doc`) at once. `Presentation` compares it with what the service
  last confirmed and sends the difference, one request at a time: new slides,
  removed slides, the title and order, then each changed slide. Whether
  anything is unsaved is derived from that comparison, so a failed request
  loses nothing — the difference is still there and is sent again.
- **Undo is snapshots.** Each verb on the App starts with `checkpoint`, which
  keeps the slides, the open slide and the selection as they were. A drag
  checkpoints once, when it starts; typing once, when it ends.
- **Remote changes** are found when a slide is opened and every few seconds
  while it is open (a newer version than this window saved), or when a save is
  refused as a conflict. The person is told on the slide and chooses.

## Checking it

The scripts in `checks/` drive the app in a real browser against the live
service, as a person would, and assert what should have happened. Each
cleans up what it makes, except `scenario.mjs`, which leaves its
"Quarterly review" presentation behind.

```bash
npx declare-verify my-apps/presentify/presentify.declare --assert my-apps/presentify/checks/scenario.mjs
```

| script | what it covers |
|---|---|
| `scenario.mjs` | the brief's "what done looks like", end to end, including a colleague's change |
| `editing.mjs` | selecting, marquee, handles, keep-proportions, snapping, nudging, clipboard, typing as one step, slide undo |
| `states.mjs` | a hundred slides, a very long title, dialogs, menus, the colour popover, the radius handle, lines, paste across presentations, saving while the service is unreachable |
| `list-states.mjs` | the list loading, unreachable, and empty |
| `list-actions.mjs` | rename and delete from the list |
