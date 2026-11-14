# Presentify run 8: Opus 5.5, Declare, on the local tree (round 1, standard level)

Built on the local tree after the 2026-11-13 build list. **41.7 min, 142 turns, 188k output
tokens** (62k thinking), against run 7's 41.1 min on the bare prompt. Timing record:
`evals/timings/2026-11-13-presentify-run8-local.txt`.

## Hidden checks

| | as built, tree it was built on | today's tree (2026-11-14) |
|---|---|---|
| Score | 5/19 | **18/19** |

The 13 extra failures as built were one bug a person hits: after a new presentation opens with
its title field focused, the first press on a tool was lost (the field's blur replaced it with a
narrower label, the toolbar re-centred, and the release landed on the neighbouring tool). That
press is now carried to what was pressed (platform fix below), and the drive passes them.

The remaining failure, `conflict_is_offered`, is the app's: on a 409 the app records the conflict
for the slide on screen, but its note sets `datapath = { classroot.clash?.theirs }` — a record
from the service's error reply, in no dataset — and building it throws ("this value belongs to
no Dataset/DataSource"). The agent never drove the conflict path.

Drive fixes made while scoring: wait for the list to arrive before pressing New presentation;
wait for the typed words to be stored, not only the text box (the app saves as the person types).

## Platform findings

1. **FIXED — a press lost when the layout moves the pressed control.** See above. A pointer
   that stays within slop now clicks what it pressed (`input.ts`), taken only while the view is
   shown, never for a view that answers double-clicks; a development warning names the control
   that moved. Tests: `gesture.test` (both renderers), `unit.test`. Recorded in
   `docs/system-design/language-changes-2026-11.md`.
2. **FIXED — an overlay opened under a rebuilt view.** The agent's Edit menu opened beneath the
   editor's inspector after the editor (`exists`) was rebuilt; it worked around it by hiding the
   editor instead. Reproduced on today's tree from the run's snapshot (`logs/files.git`,
   00:54:00Z) with the agent's own check. Cause: page order had drifted from model order — the
   focus ring re-seats at the end of the root when it comes home from travelling, past the
   overlay layer; `raise()` returned early because the layer was already last in the model; the
   rebuilt editor, placed correctly before the focus ring, landed above the layer. Fixes:
   `raise()` re-asserts the front on the surface when the model already has it last; the DOM
   backend's `insertChild` does nothing when the element is already in place; a sibling that
   paints elsewhere (`paintsIn`) no longer marks an insertion place (`realSurfaceAfter`), and the
   attach path always takes the model's place. Test: `gesture.test` ("raise() puts a view
   frontmost on the surface…").
3. **For the user — `DataSource.errorBody` is not addressable.** A refusal's body is data the
   source received; a `datapath` into it fails at run time. Making it addressable as `value` is
   would have made the agent's spelling work.
4. **Message, not a defect — `classFor` from a script function.** The agent's function returned
   the class itself; the reference says it answers the class's name. The refusal ("computes a
   typeof GroupShape, but 'classFor' is typed string") could name that.

## Refusals

One-step on the message, except as noted: a schema named `Stroke` (a built-in type's name), a
child named `fill`, `App.classFor` as a method name, `clip` redeclared, arrow functions written
with `->`, a two-way field bound one way, `fullScreen` a script function after `app.fullScreen`
arrived ("Type 'Boolean' has no call signatures" — raw TypeScript, under a lint warning that
names the clash). No library or runtime source read.
