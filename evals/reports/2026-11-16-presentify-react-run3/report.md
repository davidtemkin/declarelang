# Presentify React run 3: Opus 5.5, React, minimal

The last run of the React minimal round, the comparison for Declare Presentify 16 (and 15), on
the minimal prompt naming React. **19.5 min, 70 turns, 140k output tokens** (32k thinking).
Timing record: `evals/timings/2026-11-16-presentify-react-run3.txt`. Audited in the lighter form
DT set for React runs: the score with each failure sorted, the measurements, a maintainability
review, a few screenshots; no account.

## 1. The score

**The hidden drive: 0 of 19** (`drive-results.json`), against the agent's own production build,
served with `npx vite preview --host 127.0.0.1 --port 8674`.

- **A real defect, in front of everything.** The editor shows the slide 64 px wide in the stage's
  top-left corner (`seen-editor.png`). `useStageLayout` measures the stage once, keyed on the
  ref object (which never changes), while the stage has almost no size; the scale is clamped at
  its floor (0.05 × 1,280 = 64 px) and never refit. Eighteen checks stop at "the slide labelled
  Slide, with a size on screen"; the nineteenth (`rename_and_delete_presentation`) fails as
  "never stored".
- **An audit probe** (`probe-results.json`, `probe-editor.png`): the hook re-measuring on every
  render, storing only a changed layout, fills the stage — and the drive then passes **6 of 19**.
  The "slide not found" failure persists intermittently in others, an alignment lands wrong
  ("aligned to 98, not the topmost edge"), and a rename is not stored: more behind the first
  defect. (A first probe that set the layout on every render looped — React error #185 — and was
  discarded.)

## 2. Seen running (for DT's judgment of care)

- `seen-home.png`, `seen-phone-home.png`: the home screen; on a phone it reflows to one column
  (Declare Presentify 14, 15 and 16 all ran off the right edge there), though the "New
  presentation" button overlaps the end of the wordmark.
- `seen-delete.png`: "Delete this presentation? 'Field notes from the coast' and its 8 slides
  will be deleted for good. This can't be undone." — "Keep it" focused, Delete in red.
- `seen-editor.png`: the editor as handed over, with the stage defect.

## 3. The comparison

| | Declare Presentify 16 (minimal) | Declare 15 (minimal) | **React Presentify 3 (minimal)** |
|---|---|---|---|
| total | 26.7 min | 21.6 min | **19.5 min** |
| turns | 62 | 64 | 70 |
| output tokens (thinking) | 172k (86k) | 139k (61k) | 140k (32k) |
| reading · writing · checking | 10.3 · 13.1 · 3.3 | 9.4 · 7.9 · 4.3 | 2.1 · 15.5 · 1.9 |
| context at first write · at end | 257k · 386k | 204k · 327k | 30k · 167k |
| drive | 16/19 | 5/19 (the color bug) | 0/19 (the stage defect) |
| code | 2,753 lines Declare, 7 files | 2,388, 7 files | 5,927 lines TS/TSX/CSS (6,830 raw), 48 files |
| dependencies | none | none | react, react-dom, react-router-dom, zustand, immer, motion, @dnd-kit (3), @radix-ui (5: alert dialog, context menu, dropdown, popover, tooltip), two web fonts; 85 packages installed |
| download (gzip) | 218 KB | 210 KB | 230 KB JS + CSS + HTML, plus 280 KB of fonts |

## 4. Is it maintainable, idiomatic React?

Yes, in its structure. The editor's state is one Zustand store over an Immer document
(`editor/store.ts`), with undo as structural snapshots and drags and typing wrapped in
transactions; the verbs are in `commands.ts`, the save queue in `sync.ts`, the model (types,
geometry, text, the element tree) in `model/`, separate from the views; menus, dialogs, popovers
and tooltips are Radix; slide reordering is dnd-kit. Each module opens with a comment saying
what it is for. The weaker parts: `Canvas.tsx` is 581 lines of pointer handling, selection and
drawing in one component, and the defect above is a hook written against React's rules (an effect
keyed on a ref object, so it never re-runs) — the kind a reviewer would catch and a run that never
looks at the app does not.

## 5. Notes on the run

- It stopped its dev server with `pkill -f "vite --port 5173"` — a kill by name pattern, which
  would have hit any matching process on the machine. Nothing of DT's was running (5173 and 8173
  were free throughout); the risk is in how agents clean up.
