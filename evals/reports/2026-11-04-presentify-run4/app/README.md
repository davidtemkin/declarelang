# Presentify

A slide editor written in Declare. Presentations live in the local Presentify
service (`task/api/API.md`, port 8360); this program is the whole client.

## Run it

```bash
npm start                      # from the repository root: the dev server, on :8200
open http://127.0.0.1:8200/my-apps/presentify/presentify.declare
```

The service must be running on `127.0.0.1:8360` (the address is `app.api` in
`presentify.declare`).

## Where things are

| file | what it holds |
|---|---|
| `presentify.declare` | the App: where the person is, every command (`run`), undo, the screens |
| `model.declare` | the service's shapes (schemas), `Document` (the open presentation), `History` (undo), `Sync` (saving and conflicts) |
| `stage.declare` | `SlideArt` (draws a slide, used everywhere), the element classes, `Stage` (the editing surface) and `Gesture` (a press on it) |
| `panels.declare` | the gallery, the slide list, the inspector, the palette, the conflict banner, the presenter |
| `look.declare` | the palette (`PresentifyTheme`), the mark, the icons, small controls |
| `geometry.ts` | boxes, hit testing, snapping, align/distribute/order/group, as plain functions |

Each file opens with a comment on how it is put together.

## How it behaves

- **Every edit** is one write to `Document`; `Sync` notices (`rev`), waits
  700 ms for the person to pause, then sends what differs from what the service
  last accepted, one request at a time (new slides, changed slides, deleted
  slides, then order and title). Failures are retried with growing pauses;
  nothing local is dropped.
- **Undo** keeps whole-slide snapshots. A drag, a run of typing, or a slider
  drag is one step (`history.begin` / `history.end`); everything else is one
  step per command (`app.change`).
- **Conflicts**: when the person comes to a slide, `Sync` asks the service for
  it again; a newer version (or a refused save) raises the banner offering
  their version or keeping ours.
- **Clipboard** goes through local storage, so it reaches other presentations
  and other windows.

## Checks

```bash
npx declare-verify my-apps/presentify/presentify.declare \
  --url http://127.0.0.1:8200/my-apps/presentify/presentify.declare \
  --assert my-apps/presentify/checks/flow.mjs      # the brief's "what done looks like"
# and checks/editing.mjs: handles, keys, clipboard, groups, slide undo, offline
```

Both talk to the live service. `flow.mjs` leaves a "Quarterly review"
presentation behind; `editing.mjs` deletes what it makes.
