# The clipboard — what shipped, what the platforms allow, and the open design

**Status: OPEN, 2026-11-07.** A first API shipped in v0.6.4.1 (§2). The user then questioned
its shape, and the design is to be revisited (§6). This note gathers everything considered so
far, so the next pass starts from it and not from the conversation.

## 1. Why

Presentify run 5 (2026-11-07) needed copy and paste of slides between two windows of the
app. The agent looked (`declare-help Clipboard` found only `TextInput`'s own clipboard),
found nothing, and kept a "clipboard" in `localStorage` through a browser script, which
works across windows of one browser and with nothing else. The user: "this needs to be
closed." Until v0.6.4.1 a text field handled the clipboard itself and nothing else could.

What a program needs:
- **Copy, cut and paste at its own views:** a selected card, a slide, a shape, rows of a grid.
  This is the person's ⌘C / ⌘X / ⌘V, and the Edit menu, aimed at what has focus.
- **Several representations of one thing.** A copied card goes out as plain text for any app,
  HTML for a mail or a document, and the program's own type for itself, so pasting it back
  restores it whole. Every app that pastes reads the best one it understands (the user:
  "clipboards contain potentially multiple representations of the same data, and different
  apps / sites can read different representations").
- **Writing from a press:** a "Copy link" button.
- **Pasted files and images:** a screenshot pasted onto a board.

## 2. What shipped in v0.6.4.1

- **Handlers on View:** `onClipboardCopy`, `onClipboardCut`, `onClipboardPaste`, each taking a
  `ClipboardEvent`. The command goes to the focused view if it declares the handler, else its
  nearest ancestor that does (the walk `onFilesDrop` uses for drops, from focus instead of a
  point); with nothing focused, to the App. A focused text field keeps the commands.
- **`ClipboardEvent`:** `put(text)` (plain text), `put(type, data)` (any MIME type), `types`,
  `get(type)` (null when absent), `text`, `files` (file records, as `FilePicker` returns). A
  copy that puts nothing is left to the platform.
- **`Clipboard.copy(text | { type: data })`:** a global service (beside `Focus`, `Keys`,
  `FilePicker`), called from a press.
- **No reading the clipboard from code** (§4).
- Ships in every program (`runtime/src/clipboard.ts`, about 1 KB), as `files.ts` does (§5).
- Tests: `test/clipboard-browser.test.mjs` (6), `test/mac-clipboard.test.mjs` (4, in
  `test:mac`). Reference: View's three handlers; guide: chapter 9, "Copy, cut and paste".

**Names.** The first build used `copy`, `cut` and `paste` as View events (`onCopy`…). That made
every view method named `copy()`, `cut()` or `paste()` a refusal ("'cut' is an EVENT here"),
and those are exactly the verbs agents give their own methods (Presentify run 1 had all
three; a unit test had `cut()`). The user: "These names need to be more specific than that,
can't have the bare cut/copy/paste as reserved names." Hence `onClipboard…`, named like
`onFilesDrop`.

**A gap found while testing:** a click on a plain focusable `View` does not give it focus, so a
board where a click selects a card must move focus there (`Focus.focus(card)`) for ⌘C to reach
the card's handler; otherwise the command goes to the App.

## 3. What each platform allows

### The web

- **The page's own `copy`, `cut` and `paste` events** carry a `DataTransfer`. Inside the event
  a page may `setData` any number of types and `getData` every type offered, with **no
  permission prompt, in every browser**. This is what v0.6.4.1 uses.
  - Plain text, HTML and `text/uri-list` reach every other app.
  - A custom type (`application/x-…`) set in a copy event is readable by pages in the same
    browser (Chrome keeps it as "web custom data"; Safari only for the same origin), so it
    travels between an app's own windows, which is the case that matters, but not to native
    apps.
  - Pasted images and files arrive in `clipboardData.files`.
  - A copy event fires at the focused element; with a native text selection on the page the
    browser's own copy should win (v0.6.4.1 leaves a non-collapsed selection to the browser).
- **Writing outside a copy event:** `document.execCommand("copy")` from a user gesture raises
  a synthetic copy event, in which every type can be set; `Clipboard.copy` uses it, falling
  back to `navigator.clipboard.writeText` for plain text. The async API's
  `navigator.clipboard.write(ClipboardItem)` takes text, HTML and PNG; custom types only in
  Chrome, with a `"web "` prefix. `execCommand` is deprecated but universally present.
- **Reading outside a paste event:** `navigator.clipboard.read()` / `readText()`. Chrome asks
  for permission; Safari shows its own "Paste" button the person must press; Firefox only
  recently, with similar gating. Not dependable as an API a program builds on.
- **Several items:** the web has one set of representations per copy. There is no list of
  separate items.
- **Promised data:** none. Everything is written at copy time.

### The Mac (NSPasteboard)

- **Types are identifiers, not MIME types:** `public.utf8-plain-text`, `public.html`,
  `public.url`, `public.rtf`, `public.png`, `public.tiff`, `public.file-url`. The runtime
  names representations by MIME type, so the host maps: text/plain ↔ `.string`, text/html ↔
  `.html`, text/uri-list ↔ `.URL`, text/rtf ↔ `.rtf`.
- **A custom type must be a valid identifier.** Writing under a bare MIME string
  (`application/x-card`) is accepted but stored under a generated `dyn.…` name, and it is lost
  on read (found by the Mac test). v0.6.4.1 writes it as `com.declarelang.mime.<mime>` (`/` as
  `.slash.`) and maps it back. Other apps see the type and pass over it.
- **Several items:** a pasteboard holds a list of `NSPasteboardItem`s, each with its own
  representations (three cards as three items). v0.6.4.1 writes one item, matching the web.
- **Promised data:** an item can promise a type and produce it only if someone pastes it
  (`NSPasteboardItemDataProvider`), which matters for a large image. Not used.
- **Files and images:** file URLs become file records (`FileRecords.of`); an image with no
  file behind it (a screenshot, `.png` or `.tiff` data) is written to a temporary PNG and
  arrives as a file, as it does in a browser.
- **Routing:** the Edit menu's Copy, Cut and Paste send `copy:`, `cut:`, `paste:` down the
  responder chain. A native text view first responder takes them; otherwise `DeclareView`
  does, and asks the runtime (`__declareClipboard`, a bounded synchronous `ask` for copy, an
  async call for paste). `validateMenuItem` enables an item only when a view would take it
  (a 0.1 s bounded ask). A live selection in a drawn flow copies as text first.
- **Reading from code:** unrestricted historically; recent macOS shows a privacy alert when an
  app reads the pasteboard without a paste. Same conclusion as the web.

## 4. Decisions so far

- **No reading the clipboard from code.** Pasting is the person's act and arrives in the
  paste handler. Both platforms gate programmatic reads; an API that works on one host and
  prompts or fails on another is worse than none. Revisit only for a demonstrated need.
- **One set of representations per copy, on every host.** Copying several things writes one
  representation of the list (JSON under the program's own type, plus the titles joined as
  plain text). The Mac's multiple items stay unused, so behaviour does not differ by host.
- **Everything written at copy time.** No promised data.
- **A focused text field keeps the clipboard,** as on the Mac (a field's editing commands come
  before the menu's) and in a browser.
- **Representations are named by MIME type** on every host; the host maps.
- The user on the v0.6.4.1 API: "OK, for now, eventually may need more."

## 5. The capability constraint

A production build ships a runtime module only to programs that reach it, decided by signals
in `compiler/src/capabilities.ts`: a class the program constructs, a name a `{ }` body
mentions or calls, syntax (a replicating path), a slot on a replicated child, the build's own
flags, and the cut name tables. **No capability may be decided by a view member** (a method,
handler or attribute: `test/slim-signals.test.mjs`), because a member can be reached without
its name in the source: rich-text tags carry attributes, `createView` takes props from data,
code can assemble a name. So the `onClipboard…` handlers cannot gate the module, and it ships
in every program (the first-load ceiling was raised 164 → 169 KB for v0.6.4.1). A design keyed
on a class or a body name would be gateable. Handler names (methods, which neither tags nor
`createView` props define) might be exempted from the member rule; unverified.

## 6. The open design

The user questioned the handler shape ("a class though may provide a cleaner design, size
aside"), then rejected the class form proposed: "The clipboard conceptually is a global single
object. There is not a clipboard object inside each view. That is not helpful."

What is global and what varies by view:
- **The clipboard is one object.** `Clipboard.copy` already writes to it, and the event's
  `put`/`get` act on it.
- **What varies by view is who answers the Copy, Cut and Paste commands,** found from focus.

Options considered:

- **A. Handlers on View (shipped).** `onClipboardCopy` and the rest. Simple, local, nothing to
  construct. Costs: long names to avoid reserving verbs; three more members on every View; no
  place for "can I copy now?" (the Edit menu enables Copy whenever a handler exists, even with
  nothing selected), short of more View attributes; not gateable.
- **B. A `Clipboard` member per view (proposed, rejected).** `clipboard: Clipboard [ canCopy
  = …, onCopy(e) {…}, onPaste(e) {…} ]` in the view that answers, as `Keys` is a member.
  Gave plain handler names, a home for `canCopy` / `canCut` / `canPaste` and later `accepts`,
  and a class signal for slimming. Rejected: it models a clipboard per view.
- **C. Copy, Cut and Paste as standard commands in the `Shortcuts` system.** Commands like
  Save and Find are already data: a `Shortcuts` set holds records (key, label, id), a press is
  looked up from the focused view outward, the nearest set that declares the key takes it,
  `MenuBar` items carry their keys, `Keys.shortcutsInForce()` lists what is in force. Copy,
  Cut and Paste are commands of exactly this kind, with standard keys and standard menu
  items. A set declaring `copy` would take ⌘C where it is in force; its `picked("copy")`
  would need the event (or `Clipboard.put(…)` at that moment) to write the representations,
  and paste would need the clipboard's contents handed in. Enablement could be a record field
  (`enabled`). Unexplored: how the payload reaches `picked`, and whether a text field's
  precedence and the Mac's responder chain fit the Shortcuts walk.
- **D. The global `Clipboard` as the one object, with the commands as its events.** For
  example `Clipboard.onPaste` answered where focus is. Unexplored; it risks the per-view
  routing becoming the program's job.

Questions for the next pass:
1. Which of A, C, D (or another) — the user's framing: one global clipboard, commands routed
   by focus.
2. Enablement: how a program says Copy has nothing to copy, so the Edit menu greys it out
   (web has no Edit menu of the page's; the Mac and a `MenuBar` do).
3. `accepts`: whether Paste should be enabled only when the clipboard holds a type the view
   takes (the Mac can ask the pasteboard's types without reading; the web cannot before the
   paste event).
4. Focus: a click on a plain view does not focus it, so the command often reaches the App;
   whether selection should imply focus, or the routing should follow selection.
5. Capability: whether the final shape gives a gateable signal (§5).
6. Several items and promised data (§4): confirm that one representation set per copy holds.

## Code

- `runtime/src/clipboard.ts` — the event, the walk, `Clipboard.copy`, the browser wiring.
- `mac-host/Sources/DeclareMac/Clipboard.swift` — type mapping, pasteboard write and read.
- `mac-host/Sources/DeclareMac/App.swift` — `DeclareView`'s `copy:`, `cut:`, `paste:`,
  `validateMenuItem`.
- `browser/mac-boot.js` — `__declareClipboard`, `provideClipboardHost`.
- `runtime/src/schema.ts` (View's events), `compiler/src/scaffold.ts` (types).
