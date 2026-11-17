# Murmur React run 2: Opus 5.5, React, minimal

The third run of the React minimal round, the comparison for Declare Murmur 19, on the minimal
prompt naming React. **9.0 min, 29 turns, 59k output tokens** (17k thinking). Timing record:
`evals/timings/2026-11-16-murmur-react-run2.txt`.

## 1. The score

**The hidden drive: 13 of 15** (`drive-results.json`), against the agent's own production build
(`npm run build`), served with `npx vite preview --host 127.0.0.1 --port 8673`; its
`vite.config.ts` proxies the service's paths (`/threads.json`, media, the `/live` socket) for
both the dev and the preview server, so the build reaches the service as it did for the agent.

- **`return_to_place` — a real failure.** Reading back in Trail crew, opening another
  conversation and returning lands elsewhere ("they read 'it's better than what's there #8'").
  The thread view imports react-virtuoso's `StateSnapshot`, so it means to keep the place; the
  restore does not land.
- **`voice` — the drive narrower than the brief.** It opens the first conversation with a voice
  message among its last 60 (Priya Raman, the nearest 12 messages from the end) and looks for a
  control named "play" without scrolling (`drive-voice.png`). The control exists, named "Play
  voice message" (`VoiceBubble.tsx:90`), but the list is virtualized and builds only what is on
  screen, so the row 12 messages up is not in the page. Declare Murmur 19 builds rows a little
  beyond the visible area, so its play control was there to find. A person would scroll; the
  drive could scroll to the message first — for DT, with the two Cadence checks.

## 2. Seen running (beside Declare Murmur 19)

`seen-desk-convo.png`, `seen-phone-list.png`, `seen-phone-convo.png`; Murmur 19's same states are
now filed in its own report folder (`seen-m19-*.png`).

- **No polish lost**, on either side: the list with its unread badges and group faces, the
  conversation with day headings, runs, names in a group and reactions, the composer; on the
  phone the list and the conversation with its back control.

## 3. The comparison

| | Declare Murmur 19 (minimal) | **React Murmur 2 (minimal)** |
|---|---|---|
| total | 10.6 min | **9.0 min** |
| turns | 43 | 29 |
| output tokens (thinking) | 64k (30k) | 59k (17k) |
| reading · writing · checking | 4.8 · 3.9 · 1.9 | 2.3 · 6.0 · 0.7 |
| fresh input · cache writes · cache reads | 86 · 227k · 6.7M | 58 · 70k · 1.3M |
| context at first write · at end | not kept (logs deleted early) | 32k · 79k |
| drive | 15/15 | 13/15 (one real, one narrow, §1) |
| code | 817 lines Declare (1,122 raw), 2 files | 2,447 lines TS/TSX/CSS (2,850 raw), 29 files |
| dependencies | none (the distribution) | react, react-dom, react-router, react-virtuoso, zustand, date-fns, @floating-ui/react, react-textarea-autosize, clsx; Vite, TypeScript, oxlint; 48 packages installed |
| download (gzip) | 197 KB, runtime included | 135 KB JS + CSS + HTML (no web fonts) |

- **Reading:** React read the brief and the API description, then fetched the history and
  examined it with a few scripts (2.3 min); Declare read its distribution (4.8 min).
- **Checking:** React `npm run build`, then started its dev server and looked at its first lines
  of output; Declare verify through boot.

## 4. The code

Vite's React template, React 19, TypeScript; a Zustand store holds the conversations and every
write (`state/store.ts`), a second holds the one shared audio player (`state/player.ts`); the
live feed is a WebSocket module (`api/live.ts`); each conversation is a react-virtuoso list
following the newest message (`ThreadView.tsx`, `followOutput`); a long press is a hook of its
own (`useLongPress.ts`); the reaction picker floats with `@floating-ui/react`; the composer grows
with `react-textarea-autosize`; dates go through date-fns. Libraries stand where Declare has the
language or its library: virtualization, following the end, a popover, a growing field, a
store.

## 5. The agent's account

Not available: the read-only resume was refused twice by the API's safeguard
(`reasoning_extraction`), as for the other React runs.

## 6. Notes on the run

- Its dev server again took `5173` (`npx vite --port 5173 --strictPort`), free at the time;
  `finish.sh` stopped it.
