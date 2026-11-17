# Cadence React run 2: Opus 5.5, React, minimal

The first run of the React minimal round, the comparison for Declare Cadence 38. The prompt is
the minimal one, naming React: "Build the app described in `task/brief.md` as a React
application. … it must build and start with no errors. Check that and nothing more: do not
drive it, script it, take screenshots of it or look at it in a browser." **8.0 min, 19 turns,
55k output tokens** (13k thinking). Timing record: `evals/timings/2026-11-16-cadence-react-run2.txt`.

## 1. The score

**The hidden drive: 7 of 9** (`drive-results.json`), against the agent's own production build
(`npm run build`, run by the agent; served for scoring with `npx vite preview --port 8670`,
which writes nothing; the page binds to `localhost`). The drive accepts either reading of "this
week" (DT, 2026-11-16).

The two failures are both narrower checks than the brief, not missing behavior:

- `session_detail` — "never shown: effort 3 or 3/10". The panel shows a large **3** beside
  "EFFORT / 10" (`seen-desk-session.png`): the number precedes the label, and the drive's pattern
  wants "effort 3" or "3/10" as one run of text.
- `delete_session` — "not found: a control named delete". Delete is in the edit form: the panel
  offers Close and Edit, and Edit's form holds the Delete button (`SessionForm.tsx:214`). The
  brief says only that a person "can also correct or delete one".

**For DT:** loosening both (the number and label in either order; Delete looked for inside Edit
when the panel has none) would make the drive test the brief rather than one layout. Not done
without your word; Declare Cadence 38 passes both as they stand.

## 2. Seen running (beside Declare Cadence 38)

`seen-*.png`: today on desk and phone, the session panel, the log form on desk and phone.

- **Today, desk and phone:** finished — the large figures, the week's shape Monday first, the
  run in progress, the log button pinned under the thumb on the phone.
- **The log form loses polish on a desk:** the effort row (a ten-column grid) runs past the
  panel's right edge; "10" is cut. The day row also runs past the edge, but by design — it
  scrolls sideways (`overflow-x: auto`, scrollbar hidden).
- Declare Cadence 38 lost polish in the same two places' kind: its session panel and log form
  overflow (its report, `seen-desk-session.png`, `seen-phone-log.png`).

## 3. The comparison

| | Declare Cadence 38 (minimal) | **React Cadence 2 (minimal)** |
|---|---|---|
| total | 9.8 min | **8.0 min** |
| turns | 48 | 19 |
| output tokens (thinking) | 60k (26k) | 55k (13k) |
| reading · writing · checking | 5.5 · 2.4 · 1.8 | 1.4 · 6.2 · 0.3 |
| fresh input · cache writes · cache reads | 76 · 214k · 5.7M | 38 · 67k · 0.7M |
| context at first write · at end | 180k · 221k | 26k · 75k |
| drive | 9/9 (rescored) | 7/9 (two narrow checks, §1) |
| code | 785 lines Declare (1,091 raw), 2 files | 2,507 lines TS/TSX/CSS (2,971 raw), 26 files |
| dependencies | none (the distribution) | react, react-dom, one web font; Vite, TypeScript, plugin; 27 packages installed |
| download (gzip) | 217 KB, runtime included | 80 KB JS + CSS + HTML, plus 206 KB of font files |

- **Reading:** React read the brief, the API description and the service's own source
  (`task/api/server.mjs`), called three endpoints and looked up package versions (1.4 min, 26k
  context at its first write); Declare read its distribution first (5.5 min, 180k).
- **Writing:** React wrote three times the lines in 6.2 min, Declare 785 lines in 2.4 min.
- **Checking:** both did what the prompt allowed — React `npm run build` (type check and bundle)
  and one request to the dev server; Declare verify through boot.

## 4. The code

Vite, React 19, TypeScript; no state or data library. One `TrainingLog` context with a reducer
holds the sessions and makes every write (`state/TrainingLog.tsx`); a `client.ts` wraps fetch;
`domain/` holds dates, formats and the week and streak statistics (a Monday-first
`startOfWeek`); the year surface's pan and pinch are a hand-written hook
(`useSurfaceGestures.ts`) over a viewport model; a `useTweened` hook counts figures up; a
`Sheet` component of its own holds the detail and the form; reduced motion is honored. Built by
hand where Declare has them in the language or library: the sheet, the tweening, the gesture
handling, the responsive breakpoint (`useElementWidth`).

## 5. The agent's account

Not available: the read-only resume was refused twice by the API's safeguard
(`reasoning_extraction`), the false positive seen before; per the procedure, one retry, then the
report goes without it.

## 6. Notes on the run

- The agent started its dev server with `--port 5173 --strictPort`, a port DT's own server uses
  when running; it was free, so it bound, and `finish.sh` stopped it at the run's end. The launch
  sets `PORT=8600` for the agent's dev server; the agent did not use it.
