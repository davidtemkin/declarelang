# 7GUIs React run 2: Opus 5.5, React, standard

The comparison for Declare 7GUIs 4 (standard). The prompt is the standard one, naming React.
**7.7 min, 46 turns, 49k output tokens** (7k thinking). Timing record:
`evals/timings/2026-11-16-7guis-react-run2.txt`.

## 1. The score

> **Rescored 2026-11-16 on the fixed drive: 8 of 8** (`drive-results-rescored.json`). The drive
> now picks from a native `<select>` as the system list does, reads a slider counting
> milliseconds as such, finds the people's list and Create enabled or not, reads the
> background through a modal's backdrop, and prefers a drawing's own role to a region named
> after the task. Every failure sorted below as the drive's passes; the first score, 3 of 8, is kept below as it was.

**The hidden drive: 3 of 8** (`drive-results.json`), on the agent's production build served with
`npx vite preview --host 127.0.0.1`. **All five failures are the drive's, not the app's**; each
was checked against the app:

- **flight — the drive can't work a native `<select>`** (as in React run 1). Operated directly,
  the app is right: "return flight" enables the return date; a return date before the start
  disables Book and says why ("The return date is before the start date.", `seen-flight.png`).
- **timer — the drive reads the slider in the wrong unit** (as in run 1): the value is
  milliseconds (max 30000); the gauge read 0.23 at 2.3 s of 10 s, which is correct.
- **crud — the drive's layout step takes the first list on the page** (as in run 1's probe): the
  sidebar's `<ol>` of tasks (top 52), not the people list. Create, update, delete and the filter
  had all passed before it.
- **circles_select, circles_history — the drive measures the wrong element.** It looks for a
  region named /canvas|drawing|circles?/ and finds the task's own `<section>`, labelled by its
  heading "Circle Drawer" (the content column, 1,190 points wide), before the drawing (an `<svg
  role="img">` named "Drawing canvas with N circles…", 606 wide). Its clicks land at x 944,
  outside the drawing. Clicked inside it, the app draws circles (`seen-circles.png`).

**For the fix round (the drive), with run 1's four:** look for the drawing before a region named
after the task. Fixed and rescored (above).

## 2. Seen running (beside Declare 7GUIs 4)

`seen-*.png`. **Desk:** plain and finished, the browser's own controls under a light card style;
a dark numbered sidebar; under Flight, the date format and, when the dates are wrong, a sentence
saying what is wrong. **Phone:** adapted — the task list wraps across the top and the task takes
the width (`seen-phone.png`). **Addresses:** each task has its own (`#/crud`; React Router),
as Declare 7GUIs 4 used `location`. Declare 7GUIs 4 had more design: each task's challenge
stated under its title, a menu for the kind of flight.

## 3. The comparison

| | Declare 7GUIs 4 (standard) | **React 7GUIs 2 (standard)** |
|---|---|---|
| total | 13.9 min | **7.7 min** |
| turns | 86 | 46 |
| output tokens (thinking) | 70k (24k) | 49k (7k) |
| reading · writing · checking | 3.6 · 3.7 · 6.6 | 0.5 · 3.7 · 3.5 |
| cache reads · writes | 13.1M · 288k | 1.55M · 73k |
| context at first write · at end | – | 15k · 80k |
| drive | 7/8 (after the drive fixes; the covered circle) | 3/8 (all five the drive's) |
| code | 868 lines (1,218 raw), 9 files | 1,848 lines TS/TSX/CSS (2,168 raw), 13 files |
| tests | its own checks in the verify drive | 8 unit tests of the sheet (vitest), and a Playwright pass at two sizes |
| dependencies | none (the distribution) | react, react-dom, react-router-dom; Vite, TypeScript, oxlint, vitest, Playwright; 55 packages installed |
| download (gzip) | 194 KB, runtime included | 88 KB JS + CSS + HTML |

## 4. Maintainability and idiom

Vite, React 19, TypeScript, React Router (hash routes). One component per task; the spreadsheet's
model is apart from its view (`cells/formula.ts`, a parser; `cells/sheet.ts`, with unit tests),
CRUD and the circle drawer keep their state in a `useReducer` (the drawer's undo and redo as two
stacks, one step per adjustment). Lint (oxlint), types and tests ran clean in the agent's own
checks. Idiomatic, readable React; nothing that would be hard to change. Built by hand where
Declare has them: the per-frame clock, the context menu and the adjust window, the grid's keyboard
and editing, the narrow layout's CSS.

## 5. Notes on the run

- The agent stopped its own dev server with `pkill -f "vite --port 5179"`, a pattern rather than a
  PID; narrow enough here, but the habit is the risk noted before.
- It checked in a real browser with Playwright at 1366×768 and 390×844, which is what a standard
  run allows, and read its screenshots.
