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
let host = null;
export function provideFilesHost(h) {
    host = h;
}
/** url → what an upload sends: the browser's own File, or null where the url
 *  itself reads the bytes (the native host's file: URLs). A record is a file
 *  this runtime handed out — a copy of one (a dataset keeps copies) still is. */
const known = new Map();
function fromBrowser(f, path) {
    const url = URL.createObjectURL(f);
    known.set(url, f);
    return Object.freeze({ name: f.name, size: f.size, type: f.type, modified: f.lastModified, path, url });
}
function adopt(list) {
    for (const r of list)
        if (!known.has(r.url))
            known.set(r.url, null);
    return list.map((r) => Object.freeze({ ...r }));
}
/** The file dialog. Call it from what the person does — a press, a click — as
 *  a browser allows a file dialog only then; it resolves to the files chosen,
 *  none if the dialog was dismissed. */
export const FilePicker = {
    pick(options = {}) {
        if (host !== null)
            return host.pick(options).then(adopt);
        return browserPick(options);
    },
};
function browserPick(o) {
    if (typeof document === "undefined")
        return Promise.resolve([]);
    const input = document.createElement("input");
    input.type = "file";
    if (o.multiple === true)
        input.multiple = true;
    if (o.accept !== undefined && o.accept.length > 0)
        input.accept = o.accept.join(",");
    if (o.folder === true)
        input.webkitdirectory = true;
    input.style.display = "none";
    document.body.appendChild(input);
    return new Promise((resolve) => {
        let done = false;
        const finish = (list) => {
            if (done)
                return;
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
const handles = (v, name) => typeof v[name] === "function";
/** The view a drag at root point (x, y) is over that takes files: the deepest
 *  one there, or the nearest of its ancestors, declaring onFilesDrop. */
function takerAt(app, x, y) {
    for (let v = app.viewAt(x, y); v !== null; v = v.parent instanceof View ? v.parent : null) {
        if (handles(v, "onFilesDrop"))
            return v;
    }
    return null;
}
/** What each app is dragged over now — so the one it leaves hears it. */
const over = new WeakMap();
/** The point in a view's own coordinates. */
function local(v, x, y) {
    const o = v.rootOrigin();
    return { x: x - o.x, y: y - o.y };
}
/** A drag of files over an app, at root point (x, y): `over` while it moves,
 *  `out` when it leaves, `drop` with the files. Returns whether a view there
 *  takes them. The native host calls this; the browser's listeners below do. */
export function deliverFiles(app, kind, x, y, count, files = []) {
    const taker = kind === "out" ? null : takerAt(app, x, y);
    const was = over.get(app) ?? null;
    if (was !== null && (was !== taker || kind !== "over")) {
        over.delete(app);
        fireEvent(was, "filesOut");
    }
    if (taker === null)
        return false;
    const p = local(taker, x, y);
    if (kind === "over") {
        over.set(app, taker);
        fireEvent(taker, "filesOver", { count, x: p.x, y: p.y });
    }
    else {
        fireEvent(taker, "filesDrop", { files: adopt(files), x: p.x, y: p.y });
    }
    return true;
}
/** A browser host: its drag events on the app's element. A drag that is not of
 *  files is left alone; one over a view that takes files is allowed, and one
 *  anywhere else in the app is refused, so a file dropped beside a target is
 *  not opened by the browser in place of the app. */
export function wireFiles(app, el) {
    if (typeof document === "undefined" || typeof el.addEventListener !== "function" || typeof el.getBoundingClientRect !== "function")
        return;
    const isFiles = (e) => e.dataTransfer !== null && Array.from(e.dataTransfer.types).includes("Files");
    const at = (e) => {
        const r = el.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const hover = (e) => {
        if (!isFiles(e))
            return;
        const p = at(e);
        const takes = deliverFiles(app, "over", p.x, p.y, e.dataTransfer.items.length);
        e.preventDefault();
        e.stopPropagation(); // an app embedded in this one answered for its own box
        e.dataTransfer.dropEffect = takes ? "copy" : "none";
    };
    el.addEventListener("dragenter", hover);
    el.addEventListener("dragover", hover);
    el.addEventListener("dragleave", (e) => {
        if (!isFiles(e))
            return;
        // leaving a child for another is not leaving the app
        if (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))
            return;
        deliverFiles(app, "out", 0, 0, 0);
    });
    el.addEventListener("drop", (e) => {
        if (!isFiles(e))
            return;
        e.preventDefault();
        e.stopPropagation();
        const p = at(e);
        const dt = e.dataTransfer;
        // the entries must be taken now: the drop's data is gone once it returns
        const entries = Array.from(dt.items).map((i) => i.webkitGetAsEntry?.() ?? null);
        const plain = Array.from(dt.files);
        void (async () => {
            const files = [];
            if (entries.length > 0 && entries.every((x) => x !== null)) {
                for (const entry of entries)
                    await walk(entry, files, entry.isDirectory);
            }
            else {
                for (const f of plain)
                    files.push(fromBrowser(f, ""));
            }
            deliverFiles(app, "drop", p.x, p.y, files.length, files);
        })();
    });
}
/** A dropped entry, and a folder's whole tree: each file with its path from the
 *  dropped folder ("photos/2026/a.jpg"); a file dropped on its own has none. */
async function walk(entry, out, inFolder) {
    if (entry.isFile) {
        const f = await new Promise((res, rej) => entry.file(res, rej));
        out.push(fromBrowser(f, inFolder ? entry.fullPath.replace(/^\//, "") : ""));
        return;
    }
    if (!entry.isDirectory)
        return;
    const reader = entry.createReader();
    // a folder's entries come in batches, until one is empty
    for (;;) {
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (batch.length === 0)
            break;
        for (const e of batch)
            await walk(e, out, true);
    }
}
// ── uploads ──────────────────────────────────────────────────────────────────
const isFile = (v) => v !== null && typeof v === "object" && typeof v.url === "string" && known.has(v.url);
/** A DataSource body that holds files, as a form: each field a part, a file a
 *  file part (a list of files, one part each), any other object as JSON text.
 *  null when the body holds no file — it goes as JSON, as before. */
export async function formBody(body) {
    if (body === null || typeof body !== "object" || Array.isArray(body))
        return null;
    const entries = Object.entries(body);
    const hasFile = entries.some(([, v]) => isFile(v) || (Array.isArray(v) && v.some(isFile)));
    if (!hasFile)
        return null;
    const form = new FormData();
    // the browser's own File; or the bytes the url reads, typed as the record says
    // (a file: URL's reply carries no type)
    const blobOf = async (r) => {
        const own = known.get(r.url);
        if (own != null)
            return own;
        const b = await (await fetch(r.url)).blob();
        return b.type !== "" || r.type === "" ? b : new Blob([b], { type: r.type });
    };
    for (const [k, v] of entries) {
        if (v === undefined || v === null)
            continue;
        if (isFile(v))
            form.append(k, await blobOf(v), v.name);
        else if (Array.isArray(v) && v.some(isFile)) {
            for (const r of v)
                if (isFile(r))
                    form.append(k, await blobOf(r), r.name);
        }
        else
            form.append(k, typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    return form;
}
//# sourceMappingURL=files.js.map