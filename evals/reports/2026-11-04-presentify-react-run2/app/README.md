# Presentify

A slide editor for the desk: make a presentation out of slides, shapes and words, then give it.

Presentations are kept by the Presentify service (see `../task/api/API.md`), which must be running on
`http://127.0.0.1:8361`. Set `VITE_PRESENTIFY_API` to point somewhere else.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (model and undo)
npm run lint
npm run build
```

## How it fits together

```
src/
  api/          The service's format (types.ts) and a typed client (client.ts). Nothing else talks HTTP.
  model/        Pure functions on slide elements: geometry, resizing, snapping, grouping, aligning,
                text layout. No React, no state; unit-tested.
  slide/        SlideView, the one renderer for a slide (SVG; text in foreignObject). The canvas, the
                slide list, the presentation list and the presenter all draw slides with it.
  editor/
    store.ts    The editor's state (zustand): the document, selection, tool, and undo history.
    doc.ts      The undoable document: slide order and slide contents, keyed by session-stable keys.
    sync.ts     SyncEngine: saves to the service, retries, detects conflicts, merges remote changes.
    commands.tsx  Every action, described once; menus, buttons and the keyboard all run these.
    useShortcuts.ts  The keyboard.
    canvas/     The stage: layout, pointer gestures (useGestures), selection overlay, in-place text editing.
    slides/     The slide list (dnd-kit sortable).
    inspector/  The inspector panel.
    chrome/     Top bar, toolbar, save status, conflict banner.
  present/      Full-screen presenting.
  home/         The list of presentations.
  ui/           Design system: tokens (styles/global.css), icons, wordmark, controls, fields, menus.
```

### Undo

Everything undoable lives in `doc` (slide order and contents). Each step stores the state before it
(document, current slide, selection), so undo puts the selection back too. A gesture that spans many
updates — a drag, a run of typing — calls `begin()`, then `preview()` as it goes, then `commit()`:
one step. Inspector changes that arrive in a quick run (dragging through colours) share a coalescing
key and become one step.

### Saving

`SyncEngine` subscribes to the store and, shortly after each change, compares the document with what
the service last confirmed. It sends one request at a time — new slides, then content, then
removals, then the deck's order and title — until nothing differs. A failed write stays different,
so it is simply retried with backoff; nothing is dropped. The save status reads exactly
"All changes saved", "Saving…" or "Not saved: can't reach the service".

Slides are keyed by a session key: a slide from the service keeps its id; one made here is
`local-…` and the engine maps it to the id the service assigns. That way undoing a deleted slide
just recreates it.

The engine polls the deck every few seconds (and on window focus). A slide saved elsewhere since it
was read here becomes a *conflict*: nothing is written over it, and the conflict banner offers
"Use their version" (an undoable step) or "Keep mine". Slides added or removed elsewhere are merged
into the document and into history.

### Text

Text boxes are laid out by the browser with the same CSS everywhere (`model/textLayout.ts`); the
height stored in the format is the measured height. A box that fits its text snugly grows and
shrinks with it; one made taller than its text keeps its height.
