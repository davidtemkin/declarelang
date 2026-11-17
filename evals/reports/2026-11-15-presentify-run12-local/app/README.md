# Presentify

A slide editor written in Declare. Presentations live in the local service
(`task/api/API.md`, `http://127.0.0.1:8360`); this app is only the client.

## Run it

```bash
npm start            # from the declarelang/ root
# open http://127.0.0.1:8200/my-apps/presentify/presentify.declare
```

An open presentation's id is the URL fragment (`…presentify.declare#d1`), so Back
returns to the list and a link opens a presentation directly.

## Where things are

| file | what |
|---|---|
| `presentify.declare` | the App: data sources, which presentation is open, the open/close growth, keys, clipboard, menus, dialogs |
| `model.declare` | the format's schemas, geometry helpers, `Deck` (the working copy), `History` (undo), `Saver` (sync with the service) |
| `editing.declare` | `Editor` (selection, tools, every edit as one undo step) and `Drag` (one gesture: draw, move, resize, radius, marquee) |
| `slide.declare` | `SlideArt`: one slide drawn from its record — used by the editor, thumbnails and the presenter |
| `editor.declare` | the editor's screen: top bar, slide list, stage with handles and guides, inspector, presenter |
| `home.declare` | the list of presentations |
| `parts.declare` | brand theme, drawn icons, wordmark, small controls, colour palette |

## Checks

Each script drives the running app with real input against the live service
(it creates presentations there):

```bash
npx declare-verify my-apps/presentify/presentify.declare \
  --url http://127.0.0.1:8200/my-apps/presentify/presentify.declare \
  --assert my-apps/presentify/tests/flow.mjs      # the brief's "what done looks like"
# also: editing.mjs (resize, proportions, radius, undo, slides, paste across decks),
#       more.mjs (rename/delete, groups, presenting), offline.mjs (service away, then back),
#       looks.mjs (writes screenshots to /tmp for a look by eye)
```
