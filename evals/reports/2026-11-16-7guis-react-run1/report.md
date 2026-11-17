# 7GUIs React run 1: Opus 5.5, React, minimal

The comparison for Declare 7GUIs 5 (minimal). The prompt is the minimal one, naming React: build
it, "it must build and start with no errors. Check that and nothing more." **5.8 min, 34 turns,
41k output tokens** (10k thinking). Timing record: `evals/timings/2026-11-16-7guis-react-run1.txt`.

## 1. The score

> **Rescored 2026-11-16 on the fixed drive: 8 of 8** (`drive-results-rescored.json`). The drive
> now picks from a native `<select>` as the system list does, reads a slider counting
> milliseconds as such, finds the people's list and Create enabled or not, reads the
> background through a modal's backdrop, and prefers a drawing's own role to a region named
> after the task. Every failure sorted below as the drive's passes; the first score, 4 of 8, is kept below as it was.

**The hidden drive: 4 of 8** (`drive-results.json`), on the agent's production build served with
`npx vite preview --host 127.0.0.1`. **All four failures are the drive's, not the app's**; each
was checked against the app:

- **flight — the drive can't work a native `<select>`.** The kind of flight is a plain `<select>`.
  Its options are in the accessibility tree, so the drive tries to click one and Puppeteer refuses
  ("not clickable"); with that path skipped, its keyboard fallback doesn't take on a Mac either.
  Operated directly (`page.select`), the app is right: "return flight" enables the return date,
  and a return date before the start disables Book.
- **timer — the drive reads the slider in the wrong unit.** The slider's value is milliseconds
  (max 10000); the drive takes it as seconds. The gauge read 0.23 at 2.3 s of a 10 s duration,
  which is correct.
- **crud — two drive bugs after every behavior check passed.** Create, update, delete and the
  filter all passed (the list reached "Musterfrau, Maxine", `out/crud.png`). The layout step then
  looks Create up as enabled only (the fields are empty, so it is disabled), and, with that fixed
  in a probe copy, takes the sidebar's nav list as the people list.
- **circles_history — the drive can't measure through a modal's backdrop.** The adjust window is
  a native modal `<dialog>`, which dims the page; the drive's pixel scan sees no background and
  reads a radius of 222.5 while it is open. After closing, the circle keeps its adjusted size
  (radius 29.5, from 20; `drive-circles.png`). The window doesn't cover the circle (the drive's
  own covering note didn't fire).

**For the fix round (the drive):** native selects; the slider's unit (read its text, or
`aria-valuetext`); `controlAny` and the people list (not the first list) in the CRUD layout step;
a radius read with the backdrop accounted for. Fixed and rescored (above).

## 2. Seen running (beside Declare 7GUIs 5)

`seen-*.png`. **Desk:** finished and plain, in the browser's own controls; a numbered sidebar, a
bordered card per task, a line under Flight on how dates are written, a line under Cells on how to
edit, frozen headers in Cells (Declare 7GUIs 5's scroll away). **Phone:** not adapted — the
210-point sidebar stays, and the task is cut off at the right edge (`seen-phone.png`). Declare
7GUIs 5 used a tab strip on a desk.

## 3. The comparison

| | Declare 7GUIs 5 (minimal) | **React 7GUIs 1 (minimal)** |
|---|---|---|
| total | 6.3 min | **5.8 min** |
| turns | 49 | 34 |
| output tokens (thinking) | 38k (13k) | 41k (10k) |
| reading · writing · checking | 3.2 · 2.6 · 0.6 | 1.4 · 3.9 · 0.4 |
| cache reads · writes | 5.6M · 203k | 0.65M · 50k |
| context at first write · at end | 182k · 213k | 21k · 59k |
| drive | 6/8 (one real, one narrow) | 4/8 (all four the drive's) |
| code | 759 lines (1,053 raw), 9 files | 1,740 lines TS/TSX/CSS (2,057 raw), 19 files |
| dependencies | none (the distribution) | react, react-dom, date-fns; Vite, TypeScript, oxlint; 30 packages installed |
| download (gzip) | 193 KB, runtime included | 84 KB JS + CSS + HTML, no font files |

## 4. Maintainability and idiom

Vite, React 19, TypeScript; one component per task under `src/tasks/`, a `useState` in `App` for
the task shown (no address). Idiomatic, readable React: the models are pure functions beside the
components (`crud/people.ts`, `circle-drawer/history.ts` — undo as a list of steps,
`cells/formula.ts` a parser, `cells/sheet.ts` an immutable sheet with `recompute`), state in
`useState`/`useReducer`, the live diameter kept apart from the recorded one until the window
closes (one undo step per adjustment, as 7GUIs asks). `date-fns` parses the dates. Built by hand
where Declare has them: the per-frame clock (`requestAnimationFrame` in an effect), the grid's
keyboard and edit lifecycle, the context menu. Nothing that would be hard to change; the
phone layout is the one gap.
