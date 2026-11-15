# The person's files — picking, dropping, uploading

*2026-10-12. The minimum path is built; the rest is queued below, with browser parity as the
floor. What a program sees is the same on every host; each host uses its own machinery.*

---

## 1. What a program sees

**A file is a record**, not an object with methods:

| field | meaning |
|---|---|
| `name` | the file's name |
| `size` | bytes |
| `type` | MIME type (`""` when the host cannot say) |
| `modified` | when it last changed, ms since 1970 |
| `path` | its place within a chosen or dropped folder (`"pics/sub/b.txt"`); `""` for a file on its own |
| `url` | reads it — a `blob:` URL in a browser, a `file:` URL on the Mac |

The url is what makes a file fit the language with nothing new: an `Image` shows it
(`source = { f.url }`), a `DataSource` reads it (`url = { f.url }`, as text, bytes or JSON),
and a `DataSource` body that holds it uploads it.

**Two ways in:**

- **`Files.pick(options)`** — the file dialog: `{ accept: ["image/*", ".csv"], multiple: true }`,
  or `{ folder: true }` for a whole folder. Called from a press (a browser allows a dialog only
  then); resolves to the files chosen, `[]` if dismissed.
- **A drop on a view.** A view that declares `onFilesDrop(e)` takes files dragged onto it.
  The drag goes to the deepest view under it that declares `onFilesDrop`, or that view's
  nearest ancestor that does — the hit test a press uses (`viewAt`). Declaring the handler is
  the claim. The view hears `onFilesOver(e)` (`count`, `x`, `y` in its own coordinates) as the
  drag moves over it, `onFilesOut()` when it leaves, and `onFilesDrop(e)` with `e.files`.
  Anywhere else in the program a drop is refused (not-allowed cursor), so a file dropped
  beside a target is not opened by the browser in place of the app. An app embedded in
  another answers for its own box first.

**A dropped or chosen folder is flat with paths**: every file in it, at any depth, each with
its `path` from the folder (which starts with the folder's name). No record stands for a
folder; empty folders do not appear. This is the shape of the browser's own folder pick
(`webkitdirectory`, each `File` with its `webkitRelativePath`); a browser's DROP is a lazy
tree (entries, read in batches), which the runtime walks whole and flattens to the same shape.

**Uploads are the program's.** Nothing is sent until the program sends it, so it can show
what arrived, let the person choose, read files first, and upload a subset in its own order.
A `DataSource` body that holds a file — or a list of files in one field — is sent as
`multipart/form-data`, as a browser form sends a file: each other field a part (an object as
JSON text). Its multipart `Content-Type` is the platform's to set.

## 2. How each host does it

- **Browser** (runtime/src/files.ts): the dialog is the browser's file input (`accept`,
  `multiple`, `webkitdirectory`); drops are its drag events on each app's element, a folder
  walked through `webkitGetAsEntry()` and the directory reader; the url is
  `URL.createObjectURL`; an upload's file part is the browser's own `File`.
- **Mac** (mac-host Files.swift, DeclareView, mac-boot.js): the dialog is `NSOpenPanel`, a
  sheet on the window; the window registers for dragged file URLs and reports over/out/drop
  at the point, the runtime routing it (`deliverFiles`); a folder is enumerated with
  `FileManager` (hidden files and package contents skipped); the url is `file:`; an upload's
  file part is read through the host's `fetch`.
- **Slimming**: the module ships only in a program that names `Files` or a file-drop handler
  (compiler capabilities `files`); elsewhere a generated stand-in answers, and the core carries
  one call at boot and one at a DataSource request.

## 3. Queued — browser parity first

1. **Claim by type** — `acceptsFiles = ["image/*"]` on a view, the pick vocabulary: a drag
   whose items' types do not match is not this view's, falls to an ancestor that takes it,
   and shows not-allowed if none does (the browser reveals item types, not names, during a
   drag).
2. **Large folders** — today a drop delivers once the whole tree is walked. Either deliver in
   batches, or offer the drop's own laziness: a top-level-only drop (folders reported as
   folders, walked on request).
3. **Upload progress** — bytes sent, on a `DataSource` (a progress bar for a large upload).
   Browser: XHR's upload progress (fetch gives none); Mac: URLSession's sent-bytes callback.
4. **Partial reads** — a byte range of a file, for chunked and resumable uploads (the browser's
   `Blob.slice`), and reading the first bytes of a large file without reading it all.
5. **Mac large files** — an upload's file part is read into memory and crosses the bridge as
   base64; Swift should stream it from disk when the part is a `file:` record. (Reading a
   file by its url crosses in chunks already.)
6. **Hidden files** — the Mac skips dot-files in a folder; the browser's walk includes what
   its reader gives. One rule for both.
7. **Blob URL lifetime** — a browser record's `blob:` URL is never revoked; release them when
   no record can reach them (with the node that held them, or on a clear).
8. **Embedded programs on the Mac and the canvas renderer** — a drop is routed to the program
   in the window (Mac) or the canvas's app; a program inside an `AppIsland` there does not yet
   hear its own drops (the DOM renderer's nested elements already give it them).
9. **The `accept` mapping on the Mac** — MIME families beyond image/audio/video/text, and MIME
   types without a registered type.
10. **Writing files back** — handing the person a new file is `FilePicker.save(contents,
    { name, type })`: a download in a browser, the save panel on the Mac (opening in
    Downloads). Writing back to a file the person chose, in place, is not designed: the
    browser's File System Access API is Chromium only (directory handles, writable files),
    and a program that needs it uses a `script [ host = browser ]`.
11. **Other drags** — text, links, images dragged from another page or app (not files).
12. **Verification** — the Mac's real Finder drag and the open panel have been exercised only
    through their JavaScript entry points; a manual pass on the real gestures is owed.

## 4. Tests

- `test/files-browser.test.mjs` — Chrome: a pick answered with real files; a file and a folder
  dragged over and dropped by the browser's own drag events (the folder's paths); a drop where
  no view takes files; an upload as a form.
- The Mac path (drop into the runtime, upload of a `file:` record) was checked against a live
  host on 2026-10-12, not yet in a test.
