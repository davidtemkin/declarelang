# Presentify

A slide editor for the desk: make a presentation from slides, shapes and words, then present it.
Every presentation is kept by the Presentify service (`../task/api/API.md`), which must be
running on `http://127.0.0.1:8361`.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check and build to dist/
npm run lint
```

## How it fits together

```
src/
  api/client.ts          Typed calls to the service; every refusal becomes an ApiError.
  model/                 The document format and pure functions over it.
    types.ts             Slides, elements, decks — exactly the service's format.
    elements.ts          Tree walking, bounds, translate/transform, hit testing.
    text.ts              Text layout shared by slide, editor and measurer.
  components/            Presentify's own controls (on Radix), icons, SlideView.
    SlideView.tsx        Draws a slide. Editor, thumbnails, list and presenter all use it.
  editor/
    store.ts             Zustand store: working document, selection, undo history.
    doc.ts               The working document (immutable; slides keyed by local id).
    commands.ts          Every action, once. Menus, buttons and shortcuts all call these.
    sync.ts              Saves to the service, retries, detects others' edits.
    backup.ts            Unsaved work kept in localStorage until the service has it.
    Canvas.tsx           Pointer work on the slide: draw, select, move, resize, type.
    SelectionOverlay.tsx Handles, outlines, guides and marquee, in screen pixels.
    snapping.ts          Snap targets and guides.  resize.ts  Handle geometry.
    SlideList.tsx  Inspector.tsx  TopBar.tsx  Presenter.tsx  ConflictBanner.tsx
  pages/                 The presentation list and the editor page.
```

### Undo

All document changes go through `editor.apply` (one step) or `editor.begin` →
`editor.preview`… → `editor.commit` (a gesture — a drag, a run of typing, a colour being
picked — that is one step however often it redraws). Each step stores the document and the
selection before and after; because the document is immutable these snapshots share almost
everything and cost little.

### Saving

There is no Save button. `DeckSync` watches the document, and about a second after the last
change sends the difference from what the service last confirmed: new slides, changed slides,
deleted slides, then the deck's title and order. Slides made in the editor have a local id
until the service gives them one, so undo history never needs rewriting.

- A failed write stays pending and is retried with back-off; the status reads
  "Not saved: can't reach the service" until it goes through. Pending work is also copied to
  `localStorage`, so closing the window while offline loses nothing.
- A `409 conflict`, or a newer version found when a slide is opened, on focus, or by the
  five-second check of the current slide, holds that slide back. The banner shows the other
  version and lets the person choose; nothing is overwritten without their say.

### Text

A text box's height is always the height of its text at its width (`snugTextHeight`), measured
with the same CSS that draws it (`textCss`). Editing happens in a textarea with those styles,
laid over the slide and scaled with it, so text doesn't move when editing starts or ends.
