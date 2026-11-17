# Presentify

A slide editor written in Declare: a list of presentations, an editor for
slides, shapes and words, and full-screen presenting. Every presentation is
kept by the local presentation service (`task/api/API.md`, port 8360); this
program has no server of its own.

Run the dev server from the repository root (`npm start`) and open
`http://127.0.0.1:8200/my-apps/presentify/presentify.declare`.

## Where things are

Start with the header of `presentify.declare`; each file opens with a comment
on what it holds.

| file | what it is |
|---|---|
| `presentify.declare` | the App: where the person is, the screens, menus, keys, clipboard, presenting |
| `slide.declare` | the service's format as schemas, and `SlideCanvas`, the one view that draws a slide everywhere |
| `model.declare` | `Deck` (the open presentation and its undo history) and `Sync` (saving, retrying, conflicts) |
| `editing.declare` | `Editor`: selection, tools, drags, snapping, typing, grouping, aligning, styling |
| `workspace.declare` | the editor's views: top bar, slide list, stage, selection handles, conflict banner |
| `inspector.declare` | the inspector panel and its colour palette |
| `library.declare` | the list of presentations |
| `look.declare` | the Presentify theme, icons, brand mark and small controls |
| `geometry.ts` | pure geometry over element records: bounds, resizing, snapping, aligning |

## Three rules the code keeps

- **A slide is never changed in place.** Every change writes a whole new
  slide record (`Deck.put` and friends). Undo steps hold old slides by
  reference, so they cost almost nothing.
- **Every change is one undo step.** `Editor.act`, `App.slideStep`, or a drag's
  `begin` on press and `commit` on release. A drag of a hundred frames is one
  step, and so is a run of typing.
- **Saving is a comparison, not a log.** `Sync.next()` compares the deck with
  what the service is known to hold and sends the first difference. A failed
  request just means the difference is still there next time, so nothing is
  lost and nothing needs replaying.

## Checks

From the repository root:

```sh
npx declare-verify my-apps/presentify/presentify.declare                      # rungs 1–4
npx declare-verify my-apps/presentify/presentify.declare --no-boot \
    --assert my-apps/presentify/tests/assert.mjs        # the brief's §12, end to end
#   …/tests/manipulation.mjs   handles, proportions, corners, lines, marquee, clipboard, groups, slides
#   …/tests/saving.mjs         saving, the service unreachable and back, ⌘S
#   …/tests/hundred.mjs        a hundred slides stay quick
```

The scripts run against the live service. Each one makes its own presentation
and deletes it at the end. `SHOTS=1` saves screenshots to
`/tmp/presentify-check-*.png`.
