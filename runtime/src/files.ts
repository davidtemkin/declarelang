// files — the person's own files, chosen or dropped (docs: FilePicker, View.onFilesDrop).
//
// A file is a record: its name, size, MIME type, when it last changed, its
// path within a chosen or dropped folder ("" for a file on its own), and a
// `url` that reads it. The url is what makes a file fit the language with
// nothing new to learn: an Image shows it (`source = { f.url }`), a DataSource
// reads it (`url = { f.url }`, as text, bytes or JSON), and a DataSource body
// that holds it uploads it — sent as a form, as a browser form sends a file.
//
// The browser's own machinery does the work: the file dialog is its file
// input (`webkitdirectory` for a folder, whose files arrive with their paths),
// a drop is its drag events, and a dropped folder is walked through the drop's
// entries. A file's url is a blob: URL. The native host provides its own pick
// (provideFilesHost) and reports drags into the window (deliverFiles); there a
// url is a file: URL.
//
// This module ships only in a program that names `FilePicker` or a file-drop
// handler (compiler capabilities "files"); everywhere else a stand-in answers.

import { View, fireEvent } from "./view.js";

/** A file the person chose or dropped. */
export interface FileRecord {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  readonly modified: number;
  readonly path: string;
  readonly url: string;
}

/** What `FilePicker.pick` takes: the types offered (MIME types or extensions,
 *  `["image/*", ".csv"]`), more than one file, or a whole folder. */
export interface PickOptions {
  accept?: readonly string[];
  multiple?: boolean;
  folder?: boolean;
}

/** What `FilePicker.save` takes: the file's name, with its extension, and its
 *  MIME type (from the name's extension when left out). */
export interface SaveOptions {
  name: string;
  type?: string;
}

/** A host's own file dialogs (the native host's open and save panels). `save`
 *  is handed the bytes and answers whether the person saved them. */
export interface FilesHost {
  pick(options: PickOptions): Promise<FileRecord[]>;
  save?(bytes: Uint8Array, options: SaveOptions): Promise<boolean>;
}

let host: FilesHost | null = null;
export function provideFilesHost(h: FilesHost | null): void {
  host = h;
}

/** url → what an upload sends: the browser's own File, or null where the url
 *  itself reads the bytes (the native host's file: URLs). A record is a file
 *  this runtime handed out — a copy of one (a dataset keeps copies) still is. */
const known = new Map<string, Blob | null>();

export function fromBrowser(f: File, path: string): FileRecord {
  const url = URL.createObjectURL(f);
  known.set(url, f);
  return Object.freeze({ name: f.name, size: f.size, type: f.type, modified: f.lastModified, path, url });
}

export function adopt(list: readonly FileRecord[]): FileRecord[] {
  for (const r of list) if (!known.has(r.url)) known.set(r.url, null);
  return list.map((r) => Object.freeze({ ...r }));
}

/** The file dialog. Call it from what the person does — a press, a click — as
 *  a browser allows a file dialog only then; it resolves to the files chosen,
 *  none if the dialog was dismissed. */
export const FilePicker = {
  pick(options: PickOptions = {}): Promise<FileRecord[]> {
    if (host !== null) return host.pick(options).then(adopt);
    return browserPick(options);
  },
  /** Hand the person a file the program made: text, or a Blob's bytes. The
   *  program makes the contents (a CSV, a JSON backup, a calendar file); this
   *  delivers them. A browser downloads it, to where its downloads go; the
   *  native host shows its save panel, opening in Downloads with the name filled
   *  in. Resolves to whether it was saved: false when the person cancelled.
   *  (A browser does not say, and resolves true.) */
  save(contents: string | Blob, options: SaveOptions): Promise<boolean> {
    const name = String(options?.name ?? "").trim();
    if (name === "") return Promise.reject(new Error("FilePicker.save needs a file name: save(contents, { name: \"report.csv\" })"));
    const type = options.type ?? (typeof contents === "string" ? typeFor(name) : (contents.type || typeFor(name)));
    if (host !== null && host.save !== undefined) {
      const save = host.save.bind(host);
      return bytesOf(contents).then((bytes) => save(bytes, { name, type }));
    }
    return browserSave(contents, name, type);
  },
};

/** The MIME type a file name's extension names; text for one it does not know. */
const TYPES: Record<string, string> = {
  csv: "text/csv", tsv: "text/tab-separated-values", txt: "text/plain", md: "text/markdown", json: "application/json",
  html: "text/html", xml: "application/xml", ics: "text/calendar", svg: "image/svg+xml", png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", pdf: "application/pdf",
};
function typeFor(name: string): string {
  const ext = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";
  const t = TYPES[ext];
  return t === undefined ? "text/plain;charset=utf-8" : t.startsWith("text/") ? `${t};charset=utf-8` : t;
}

function bytesOf(contents: string | Blob): Promise<Uint8Array> {
  if (typeof contents === "string") return Promise.resolve(new TextEncoder().encode(contents));
  return contents.arrayBuffer().then((b) => new Uint8Array(b));
}

function browserSave(contents: string | Blob, name: string, type: string): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  const blob = typeof contents === "string" ? new Blob([contents], { type }) : contents;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // the download has taken the bytes by the next turn of the page; the url is let go after
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return Promise.resolve(true);
}

function browserPick(o: PickOptions): Promise<FileRecord[]> {
  if (typeof document === "undefined") return Promise.resolve([]);
  const input = document.createElement("input");
  input.type = "file";
  if (o.multiple === true) input.multiple = true;
  if (o.accept !== undefined && o.accept.length > 0) input.accept = o.accept.join(",");
  if (o.folder === true) (input as HTMLInputElement & { webkitdirectory: boolean }).webkitdirectory = true;
  input.style.display = "none";
  document.body.appendChild(input);
  return new Promise((resolve) => {
    let done = false;
    const finish = (list: FileRecord[]): void => {
      if (done) return;
      done = true;
      input.remove();
      resolve(list);
    };
    input.addEventListener("change", () => {
      const files = input.files === null ? [] : Array.from(input.files);
      finish(files.map((f) => fromBrowser(f, o.folder === true ? (f.webkitRelativePath || f.name) : "")));
    });
    input.addEventListener("cancel", () => finish([]));
    input.click();
  });
}

// ── drops ────────────────────────────────────────────────────────────────────

const handles = (v: View, name: string): boolean => typeof (v as unknown as Record<string, unknown>)[name] === "function";

/** The view a drag at root point (x, y) is over that takes files: the deepest
 *  one there, or the nearest of its ancestors, declaring onFilesDrop. */
function takerAt(app: View, x: number, y: number): View | null {
  for (let v: View | null = app.viewAt(x, y); v !== null; v = v.parent instanceof View ? v.parent : null) {
    if (handles(v, "onFilesDrop")) return v;
  }
  return null;
}

/** What each app is dragged over now — so the one it leaves hears it. */
const over = new WeakMap<View, View>();

/** The point in a view's own coordinates. */
function local(v: View, x: number, y: number): { x: number; y: number } {
  const o = v.rootOrigin();
  return { x: x - o.x, y: y - o.y };
}

/** A drag of files over an app, at root point (x, y): `over` while it moves,
 *  `out` when it leaves, `drop` with the files. Returns whether a view there
 *  takes them. The native host calls this; the browser's listeners below do. */
export function deliverFiles(app: View, kind: "over" | "out" | "drop", x: number, y: number, count: number, files: readonly FileRecord[] = []): boolean {
  const taker = kind === "out" ? null : takerAt(app, x, y);
  const was = over.get(app) ?? null;
  if (was !== null && (was !== taker || kind !== "over")) {
    over.delete(app);
    fireEvent(was, "filesOut");
  }
  if (taker === null) return false;
  const p = local(taker, x, y);
  if (kind === "over") {
    over.set(app, taker);
    fireEvent(taker, "filesOver", { count, x: p.x, y: p.y });
  } else {
    fireEvent(taker, "filesDrop", { files: adopt(files), x: p.x, y: p.y });
  }
  return true;
}

/** A browser host: its drag events on the app's element. A drag that is not of
 *  files is left alone; one over a view that takes files is allowed, and one
 *  anywhere else in the app is refused, so a file dropped beside a target is
 *  not opened by the browser in place of the app. */
export function wireFiles(app: View, el: HTMLElement): () => void {
  if (typeof document === "undefined" || typeof el.addEventListener !== "function" || typeof el.getBoundingClientRect !== "function") return () => {};
  const isFiles = (e: DragEvent): boolean => e.dataTransfer !== null && Array.from(e.dataTransfer.types).includes("Files");
  const at = (e: DragEvent): { x: number; y: number } => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hover = (e: DragEvent): void => {
    if (!isFiles(e)) return;
    const p = at(e);
    const takes = deliverFiles(app, "over", p.x, p.y, e.dataTransfer!.items.length);
    e.preventDefault();
    e.stopPropagation();     // an app embedded in this one answered for its own box
    e.dataTransfer!.dropEffect = takes ? "copy" : "none";
  };
  const leave = (e: DragEvent): void => {
    if (!isFiles(e)) return;
    // leaving a child for another is not leaving the app
    if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget)) return;
    deliverFiles(app, "out", 0, 0, 0);
  };
  const drop = (e: DragEvent): void => {
    if (!isFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const p = at(e);
    const dt = e.dataTransfer!;
    // the entries must be taken now: the drop's data is gone once it returns
    const entries = Array.from(dt.items).map((i) => (i as DataTransferItem & { webkitGetAsEntry?(): FileSystemEntry | null }).webkitGetAsEntry?.() ?? null);
    const plain = Array.from(dt.files);
    void (async () => {
      const files: FileRecord[] = [];
      if (entries.length > 0 && entries.every((x) => x !== null)) {
        for (const entry of entries as FileSystemEntry[]) await walk(entry, files, entry.isDirectory);
      } else {
        for (const f of plain) files.push(fromBrowser(f, ""));
      }
      deliverFiles(app, "drop", p.x, p.y, files.length, files);
    })();
  };
  el.addEventListener("dragenter", hover);
  el.addEventListener("dragover", hover);
  el.addEventListener("dragleave", leave);
  el.addEventListener("drop", drop);
  // the element outlives the app when it is an island's box, which hosts the
  // next program: the listeners go with this one
  return () => {
    el.removeEventListener("dragenter", hover);
    el.removeEventListener("dragover", hover);
    el.removeEventListener("dragleave", leave);
    el.removeEventListener("drop", drop);
  };
}

/** A dropped entry, and a folder's whole tree: each file with its path from the
 *  dropped folder ("photos/2026/a.jpg"); a file dropped on its own has none. */
async function walk(entry: FileSystemEntry, out: FileRecord[], inFolder: boolean): Promise<void> {
  if (entry.isFile) {
    const f = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    out.push(fromBrowser(f, inFolder ? entry.fullPath.replace(/^\//, "") : ""));
    return;
  }
  if (!entry.isDirectory) return;
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  // a folder's entries come in batches, until one is empty
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
    if (batch.length === 0) break;
    for (const e of batch) await walk(e, out, true);
  }
}

// ── uploads ──────────────────────────────────────────────────────────────────

const isFile = (v: unknown): v is FileRecord =>
  v !== null && typeof v === "object" && typeof (v as { url?: unknown }).url === "string" && known.has((v as FileRecord).url);

/** A DataSource body that holds files, as a form: each field a part, a file a
 *  file part (a list of files, one part each), any other object as JSON text.
 *  null when the body holds no file — it goes as JSON, as before. */
export async function formBody(body: unknown): Promise<FormData | null> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const entries = Object.entries(body as Record<string, unknown>);
  const hasFile = entries.some(([, v]) => isFile(v) || (Array.isArray(v) && v.some(isFile)));
  if (!hasFile) return null;
  const form = new FormData();
  // the browser's own File; or the bytes the url reads, typed as the record says
  // (a file: URL's reply carries no type)
  const blobOf = async (r: FileRecord): Promise<Blob> => {
    const own = known.get(r.url);
    if (own != null) return own;
    const b = await (await fetch(r.url)).blob();
    return b.type !== "" || r.type === "" ? b : new Blob([b], { type: r.type });
  };
  for (const [k, v] of entries) {
    if (v === undefined || v === null) continue;
    if (isFile(v)) form.append(k, await blobOf(v), v.name);
    else if (Array.isArray(v) && v.some(isFile)) { for (const r of v) if (isFile(r)) form.append(k, await blobOf(r), r.name); }
    else form.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return form;
}
