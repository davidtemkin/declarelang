# Rich text editing — the design so far, and where a selection is

**Status: DIRECTION ONLY, 2026-11-07.** Nothing here is built. §1 records the design talk
of 2026-10-30, between the user and the agent, in the session that ran the Cadence 20 and
Venue 15 evals. §2 records what a program can know about a selection's position today, on
each host, against what §1 already decided. A friend of the project has an app that needs
both rich text editing and the selection's position; there are no firm requirements yet.

## 1. The design so far (2026-10-30)

### Why, and the constraint

Editing text as the main activity (notes, documents, composing email, a code or Markdown
editor) is the platform's largest coverage gap. Nothing in the evals stresses it, and
Declare's rich text is display-oriented. The user: "declare is missing a rich text editing
feature … while I would very much like a real declare native solution it may be that the
practical answer is a vendored JS component embedded in a DOM island and packaged as a
declare library component with a real declare api. But this means … DOM."

**Even a fully native editor runs on the platform's text input.** Japanese or Chinese input
(IME), dictation, autocorrect, spell-check, the system clipboard and accessible text
selection all come from the OS through a real input element. Canvas editors (Google Docs,
Figma's text tool) still hide a native input under the caret. So the choice is not DOM or
no DOM; it is how much of the editor is Declare's: the document model, rendering and
commands, while the OS supplies input and selection either way.

**Where the editing surface runs.** The Mac host is being changed to make a web view, at any
layer, realistic, and canvas can do the same through declare-gpu's planes, at the cost of not
being purely canvas-rendered. So the backend question becomes where the vendored surface
runs. The API, the document model and the renderer stay Declare's on every host.

### Declare's API first, a vendored engine behind it

- **Design the API as if it were native**, and treat the vendored editor as an implementation
  behind it.
- **ProseMirror is the best fit to vendor:** its schema-driven document maps onto Declare's
  data and schemas; it is MIT-licensed and mature. Lexical is the alternative.
- **What vendoring buys:** `contenteditable`'s quirks across browsers, IME composition, the
  clipboard (paste from Word or Google Docs), undo grouping, collaborative editing.
- **What it costs:**
  - two models of one document, kept in step through the value binding;
  - each backend needs a story (now: a web view, above);
  - size: ProseMirror's core is about 100 KB, paid only by apps that use the editor;
  - its look must come from Declare's theme tokens, not its own stylesheet;
  - the checking tools must see inside it: its text, its selection, typing into it.
- **Rendering can converge on what exists.** `RichText` already renders structured documents
  (`rich-doc.ts`). Keeping the stored format close to that model keeps a native
  implementation possible later, behind the same API.

### What ProseMirror can and cannot do

It is a toolkit for **structured documents in flowing layout**, not a word processor with
page layout. Its modules:
- the model: a schema of node and mark types with attributes and content rules;
- state and transform: transactions as invertible steps, which carry undo and collaboration;
- the view: `contenteditable` rendering, with node views and decorations;
- add-ons: lists, tables, history, input rules, keymaps, Markdown, collaboration, cursors.

Against the user's list:
- **indents:** yes (list nesting natively; paragraph indents as node attributes);
- **numbered elements:** yes (ordered lists; outline numbers derived from structure, never
  stored);
- **outlines:** yes (a heading tree is a read; outliners are a known schema design);
- **rulers:** half (a ruler is UI, a Declare view bound to the paragraph's indent attributes);
- **tab stops:** no. True tab stops, pagination, columns, headers and footers, and wrapping
  around floats need an engine that lays text out itself.

So notes, docs, wikis, comments, CMS editors and Notion- or Linear-style documents are in
range; desktop publishing and Word fidelity are out. Declare does lay out and draw text itself
on canvas, so a future native engine could honour tab stops: the document model's paragraph
attributes should include indents, and leave room for tab stops, from the start.

### All UI is Declare's

The user: "I would not want any UI drawn by the library … we would want full control over UI.
And we would want that UI to be in Declare." ProseMirror draws no UI of its own (its menus are
an optional example module, unused). Declare views come in at three points:

1. **Node views**, a Declare view as part of the document:
   - atoms, nodes with no editable text inside (a mention chip, an image with its caption and
     controls, a task checkbox, an embedded chart, a linked-record card): the node's element is
     a mount point for a Declare view fed the node's attributes, writing back through a
     command. This is `RichText`'s inline view, made editable;
   - wrappers, nodes whose text stays editable (a callout, a collapsible section, a code block
     with a language picker): Declare draws the frame around a content slot, and the editor
     owns the text in it.
2. **Widget decorations**, Declare views beside the document: a drag handle, a "+" at a
   block's edge, a comment marker, a spelling fix-it, a collaborator's cursor. Placed by the
   editor's layout, never saved.
3. **Floating UI**, ordinary Declare overlays: formatting toolbars, the slash menu, the link
   editor, autocomplete. **The editor exposes the selection's screen rectangle and the active
   marks as facts**; a `Popover` or `Menu` anchors to that rectangle and its items call the
   editor's commands. None of it lives in the editor's DOM.

The real work besides the API:
- a Declare view mounted into a foreign element, an island in reverse, reporting its size
  outward so text reflows around it (the inline-view contract `RichText` already has);
- an event and focus boundary: a node view claims the events inside it; focus and selection
  moving between the text and an embedded control need rules, as does how the accessibility
  tree reads a document holding controls;
- styling from Declare's theme tokens, keeping only the few rules `contenteditable` needs.

### Two layers, one design

The user: a high-level editor with a few attributes, and a lower-level API shaped like
ProseMirror's structure for flexible cases. One design in two layers: the high level written
in Declare on the low level, as `Card` is a `View` and the library's layouts are `Layout`
subclasses.

**The low level is Declare's structure, not ProseMirror's:**
- **node types are Declare classes:** a node declares its attributes and what it may contain,
  and its rendering is the class's own view. ProseMirror's schema and node views become one
  concept Declare already has;
- **marks** (bold, link, a comment highlight) are declared the same way;
- **the document is data:** the value, bound like any control's, schema-checked by the node
  classes;
- **edits are commands:** methods such as `toggle(mark)`, `setBlock(type)`, `insert(node)`,
  `wrapIn(type)`, `lift()`, each an undoable step;
- **selection is a fact:** where it is, the active marks, the current block, and its screen
  rectangle for anchoring overlays (see §2);
- **typing shortcuts are data** (patterns to transformations); key bindings go through
  `Shortcuts`;
- **steps and plugins stay inside**, never on the public surface.

**The high level** is a library class built from those pieces (for example a `RichTextEditor`
with a list of features, `value`, `input()` and a placeholder), exposing the same selection
facts so a toolbar of one's own sits beside it. A feature is a node class in the list; a
custom node is one more class. The boundary is features, not escape hatches: if an app must
drop to the low level for something common, the high level is missing a feature. Build the
low level first, then the high level as its first user. Teach the high level first.

### The document and its interchange

**Markdown is an interchange format, not the model.** It is limited and complex at once:
round-trips are lossy (many spellings of one document), there is no stable identity for a
block, its limits are hard walls (tables can't hold blocks or merge cells; every extension is
a dialect), and it can't hold a Declare view. Its ergonomics come in as typing shortcuts
(`# `, `**`, `- `, `[ ] `).

**The stored format is Declare's own document JSON**, close to ProseMirror's tree (`type`,
`attrs`, `content`, `marks` on text), which is Declare's existing rich-text tree (`md.ts`,
`html.ts`, `rich-doc.ts`) as schema'd data. The node classes are its schema. `RichText`
renders it today, so a read-only view comes free. Alternatives weighed: Portable Text (flat
blocks, awkward for nesting; a serializer later if a partner wants it), Quill's Delta (poor for
structure), Lexical JSON (tied to its engine).

**Interchange formats are serializers, each a stated subset:** HTML (required: the clipboard,
email, publishing), Markdown (text files, developer tools, language models; it says what it
drops), plain text (search, previews, notifications).

**Rules that make it last:** an unknown node type is kept, rendered as a labelled placeholder,
never deleted; a schema version in the document; optional stable block ids, cheap now and
painful to retrofit.

**A first scope:**
- paragraphs, headings, ordered and task lists, quote, code block;
- emphasis, strong, inline code, strike, links;
- images and inline Declare views;
- undo, the clipboard (stripped to the schema), typing shortcuts;
- the selection fact and commands as methods;
- toolbars written in Declare.

Tables render and paste in the first version, and are edited structurally later
(ProseMirror's table module). The longer target named since: what Apple Notes on the Mac
supports, images and tables included.

**Open, from the friend's app:** where its documents live today and in what format; whether
they must round-trip with Markdown files or another system; whether they need comments or
collaborative editing.

## 2. Where a selection is

§1 already decided that an editor's selection is a fact that includes its screen rectangle,
so that overlays anchor to it. That fact exists nowhere yet, for an editor or for the fields
Declare already has. The common cases outside an editor need it too: a floating format bar, @-mention suggestions placed under the caret, a custom caret,
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
