# Rich text editing — direction, and where a selection is

**Status: DIRECTION ONLY, 2026-11-07.** Nothing here is built. §1 records the direction agreed
on 2026-10-30. §2 records what a program can know about a selection today, what each host
offers, and the shape of an addition. A friend of the project has an app that needs both
rich text editing and the selection's position; there are no firm requirements yet.

## 1. The direction (2026-10-30)

Rich text editing is the platform's largest coverage gap. The agreed direction:

- **Declare's API first**, with a vendored engine behind it (ProseMirror), running in a DOM
  island. The Mac host's web views, and declare-gpu's planes, make that workable on every
  host.
- **The library draws no UI.** All UI is Declare views: node views, decorations, and
  overlays anchored to the selection.
- **Two levels:**
  - a high-level editor class configured by a few attributes, written in Declare;
  - the low-level primitives it is written on, which mirror ProseMirror's structure:
    schema, nodes, marks, selection, commands.
- **Interchange:**
  - the canonical form is Declare's own document JSON, close to ProseMirror's tree;
  - HTML, Markdown and plain text are serializers;
  - nodes it doesn't know are preserved.
- **Target:** what Apple Notes on the Mac supports, images and tables included. Tables need
  structural editing to reach that level.

Design the API before choosing which of the engine's surface to expose.

## 2. Where a selection is

Overlays anchored to the selection (§1) need its geometry. So do the common cases outside an
editor: a floating format bar, @-mention suggestions placed under the caret, a custom caret,
a "quote this" button beside a selection in read-only text.

### What Declare offers today (2026-11-07)

- **Editable text** (`TextInput`, or a control of one's own on `NativeText`):
  - `selectionStart` and `selectionEnd` are read-only indexes into `text`, kept current as
    the person moves the caret or selects; they are equal for a bare caret;
  - `select(at, end)` sets them.
- **No geometry anywhere:** no box for the caret or the selection, and nothing that turns a
  point into a character index.
- **Read-only text** under `selectable = true` (`Text`, `Markdown`, `HTMLText`) can be
  selected by the person, but the program cannot read what is selected or where.
- **The only workaround** is `measureText` on the text before the caret. That is right for
  one line of plain text, and wrong once text wraps, mixes directions, or is being composed
  through an input method.

### What the web offers

- **The Selection API:** `getSelection()` returns ranges, and `selectionchange` fires as
  they move.
- **A `Range`'s geometry:** `getBoundingClientRect()` for the whole selection, and
  `getClientRects()` for one box per line. This is what places a floating toolbar or a caret
  marker.
- **From a point:** `caretPositionFromPoint()` (`caretRangeFromPoint()` in Chromium and
  WebKit) turns a point into a node and offset.
- **`<input>` and `<textarea>`** give `selectionStart` and `selectionEnd` but **no
  geometry**. The usual technique is a hidden mirror of the field, with the same styles and
  text, measured where the caret falls. Declare's web fields are in this case.
- **Newer:**
  - the `EditContext` API (Chromium) lets a custom editor give the input method its
    character bounds;
  - the CSS Custom Highlight API paints ranges without changing the document.

### What the Mac offers (AppKit)

- **`NSTextView`**, which is also the field editor behind an `NSTextField` while it is
  edited:
  - `selectedRange()` and `selectedRanges`;
  - `textViewDidChangeSelection` on the delegate.
- **Geometry:**
  - `firstRect(forCharacterRange:actualRange:)`, from `NSTextInputClient`, is how the input
    method places its candidate window, in screen coordinates;
  - TextKit 1: `NSLayoutManager.boundingRect(forGlyphRange:in:)`;
  - TextKit 2: `NSTextLayoutManager.enumerateTextSegments`, one box per line of a range;
  - `characterIndex(for:)` turns a point into an index.
- The Mac host already reads `selectedRange()` for a field's selection
  (`mac-host/Sources/DeclareMac/Overlays.swift`), so the geometry calls sit beside code
  that exists.

### The shape of an addition

The addition is mostly plumbing, since every host has the geometry. On `NativeText`, as
facts in the view's own coordinates:

- `caretBounds`, one box;
- `selectionBounds`, a box per line.

Where each host's figures come from:

- **The Mac:** `firstRect` or the layout manager.
- **The web:** the mirror measurement, since its fields have no geometry API.
- **Read-only selectable text:** possible on the DOM, because it is rendered as real flowing
  HTML and `Range` boxes apply. The canvas and the Mac's own text renderer would each need
  their own path.

Open, to settle with the editor design rather than apart from it:

- the point-to-index direction;
- whether read-only text's selection becomes readable at all, as text or as offsets;
- how an editor's selection (§1) presents the same facts, so an overlay is written once for
  a field and for an editor.

Related: text-selection.md (where a selection may begin, and what a copy carries),
editing-values.md (the field model).
