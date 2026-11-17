# Venue React run 3: Opus 5.5, React, minimal

The second run of the React minimal round, the comparison for Declare Venue 38. The prompt is
the minimal one, naming React ("… it must build and start with no errors. Check that and nothing
more: do not drive it, script it, take screenshots of it or look at it in a browser"). **14.2
min, 33 turns, 97k output tokens** (33k thinking). Timing record:
`evals/timings/2026-11-16-venue-react-run3.txt`.

## 1. The score

**The hidden drive: 11 of 11** (`drive-results.json`), against the agent's own production build
(`npm run build`, run by the agent: a type check and a Vite build), served for scoring with
`npx vite preview --host 127.0.0.1 --port 8672`, which writes nothing.

- **How it is served matters.** The first scoring served the page on `localhost` and scored 10:
  `signed_in_saved_card` failed with "You're not signed in" after correct credentials. The app
  calls the service at `127.0.0.1:8350`, and Chrome treats `localhost` and `127.0.0.1` as
  different sites, so the session cookie never came back. Served on `127.0.0.1`, as the agent
  ran it (`127.0.0.1:5173`) and as Declare Venue 38 was scored, every check passes. React Cadence
  2 has no sign-in, so its score is unaffected.

## 2. Seen running (beside Declare Venue 38)

`seen-*.png`: the performances (desk, phone), the hall (desk, phone), a seat chosen, checkout,
sign-in on a phone.

- **No polish lost.** The list, the hall drawn as the shaped house with its sections and stage,
  the phone's overview of the whole house with a section laid out below it, the selection bar
  ("1 seat · $80.00 · Orchestra A18 · Continue"), checkout with its order summary beside the form,
  and the sign-in sheet — each finished.
- Declare Venue 38 showed no loss either; its desk hall was plainer (straight rows below the
  fold), React's is closer to Venue 37's shaped house.

## 3. The comparison

| | Declare Venue 38 (minimal) | **React Venue 3 (minimal)** |
|---|---|---|
| total | 10.7 min | **14.2 min** |
| turns | 39 | 33 |
| output tokens (thinking) | 68k (30k) | 97k (33k) |
| reading · writing · checking | 5.4 · 4.3 · 1.1 | 4.2 · 8.8 · 1.2 |
| fresh input · cache writes · cache reads | 64 · 233k · 5.2M | 66 · 107k · 2.3M |
| context at first write · at end | 202k · 244k | 40k · 115k |
| drive | 11/11 | 11/11 |
| code | 1,158 lines Declare (1,518 raw), 3 files | 3,960 lines TS/TSX/CSS (4,562 raw), 44 files |
| dependencies | none (the distribution) | react, react-dom, react-router, @tanstack/react-query, react-hook-form, qrcode.react, two web fonts; Vite, TypeScript, plugin; 33 packages installed |
| download (gzip) | 193 KB, runtime included | 147 KB JS + CSS + HTML, plus 527 KB of font files |

- **Reading:** React read the brief and the API description and probed the service (4.2 min, 40k
  context at its first write); Declare read its distribution first (5.4 min, 202k).
- **Writing:** React wrote 3.4 times the lines in twice the time (8.8 min against 4.3).
- **Checking:** each did what the prompt allowed — React `npm run build`, then started its dev
  server and requested each source file through it; Declare verify through boot.

## 4. The code

Vite, React 19, TypeScript, and four libraries doing what Declare's library does: React Router
for the steps, TanStack Query for the service's data (`api/queries.ts`), React Hook Form for
checkout (`CheckoutForm.tsx`), `qrcode.react` for the tickets. The basket lives in a context
(`state/booking.tsx`) and is kept in `sessionStorage` so a reload keeps the choice; the live
seat feed is a hook (`useLiveSeats.ts`) that catches up after a dropped connection; focus moves
to each page's heading (`usePageHeading.ts`). The hall's geometry (`hallLayout.ts`), the minimap,
the card formatting (`lib/card.ts`, `FormattedInput.tsx`) and the password field are its own.

## 5. The agent's account

Not available: the read-only resume was refused twice by the API's safeguard
(`reasoning_extraction`), as for React Cadence 2.

## 6. Notes on the run

- The agent ran its dev server on `127.0.0.1:5173` (`npm start`, `vite`), a port DT's own server
  uses when running; it was free. The launch sets `PORT=8600` for the agent's dev server.
