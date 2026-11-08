// clipboard — copy, cut and paste for views that are not text fields (docs:
// View.onClipboardCopy, onClipboardCut, onClipboardPaste, Clipboard).
//
// A text field keeps the clipboard's commands for itself, as on the Mac (its
// editing commands come before anything else). Everywhere else ⌘C, ⌘X and ⌘V —
// or the Edit menu — go to the focused view if it declares the handler, or to
// its nearest ancestor that does; with nothing focused, to the App. The event
// carries the clipboard as a set of REPRESENTATIONS of one thing, by MIME type:
// a copy puts as many as it likes (plain text for every app, HTML for a mail,
// its own type for itself), and a paste picks the best one it understands.
//
// The browser's own copy, cut and paste events do the work — no permission is
// asked, and every browser has them. The native host answers its Edit menu
// through `deliverCopy` / `deliverPaste` and writes for `Clipboard.copy`
// through its ClipboardHost. Reading the clipboard from code is not offered:
// pasting is something the person does.
import { View, fireEvent } from "./view.js";
import { Focus } from "./focus.js";
import { adopt, fromBrowser } from "./files.js";
/** What onClipboardCopy, onClipboardCut and onClipboardPaste receive. */
export class ClipboardEvent {
    /** the representations, by MIME type — what a paste found, or what a copy put */
    data;
    /** files and images on the clipboard (a paste), as file records */
    files;
    constructor(data = new Map(), files = []) {
        this.data = data;
        this.files = files;
    }
    /** The MIME types on offer, in the order they were put. */
    get types() {
        return [...this.data.keys()];
    }
    /** The plain text — "" when there is none. */
    get text() {
        return this.data.get("text/plain") ?? "";
    }
    /** One representation, or null when the clipboard has none of that type. */
    get(type) {
        return this.data.get(type) ?? null;
    }
    /** Put a representation: `put(text)` is plain text, `put(type, data)` any other. */
    put(typeOrText, data) {
        if (data === undefined)
            this.data.set("text/plain", String(typeOrText));
        else
            this.data.set(String(typeOrText), String(data));
    }
    /** What a copy put, as a plain record. */
    $put() {
        return Object.fromEntries(this.data);
    }
}
let host = null;
export function provideClipboardHost(h) {
    host = h;
}
const handles = (v, name) => typeof v[name] === "function";
/** The view a clipboard command goes to in `app`: the focused view or its
 *  nearest ancestor declaring the handler; with nothing focused, the App, if
 *  it does. null when focus is in another program, or nothing takes it. */
function takerIn(app, handler) {
    const f = Focus.getFocus();
    let start = app;
    if (f !== null) {
        let top = f;
        while (top.parent instanceof View)
            top = top.parent;
        if (top !== app)
            return null;
        start = f;
    }
    for (let v = start; v !== null; v = v.parent instanceof View ? v.parent : null) {
        if (handles(v, handler))
            return v;
    }
    return null;
}
/** Is there a view in `app` that takes this command now? (The native host
 *  enables its Edit menu's item by it.) */
export function takesClipboard(app, kind) {
    return takerIn(app, kind === "copy" ? "onClipboardCopy" : kind === "cut" ? "onClipboardCut" : "onClipboardPaste") !== null;
}
/** ⌘C or ⌘X: the representations the taker put, or null when no view takes it
 *  or it put nothing (the platform's own copy then goes ahead). */
export function deliverCopy(app, kind) {
    const taker = takerIn(app, kind === "copy" ? "onClipboardCopy" : "onClipboardCut");
    if (taker === null)
        return null;
    const e = new ClipboardEvent();
    fireEvent(taker, kind === "copy" ? "clipboardCopy" : "clipboardCut", e);
    return e.types.length > 0 ? e.$put() : null;
}
/** ⌘V: the clipboard's representations and files, to the view that takes it.
 *  Returns whether one did. */
export function deliverPaste(app, data, files = []) {
    const taker = takerIn(app, "onClipboardPaste");
    if (taker === null)
        return false;
    fireEvent(taker, "clipboardPaste", new ClipboardEvent(new Map(Object.entries(data)), adopt(files)));
    return true;
}
/** Writing to the clipboard from a press — a "Copy link" button. Takes plain
 *  text, or representations by MIME type. Call it from what the person does: a
 *  browser allows the write only then. */
export const Clipboard = {
    copy(what) {
        const data = typeof what === "string" ? { "text/plain": what } : { ...what };
        if (host !== null) {
            host.write(data);
            return;
        }
        if (typeof document === "undefined")
            return;
        // the browser's own copy, carrying every representation: a copy event
        // raised now, inside the press, answered by a listener for this one copy
        let wrote = false;
        const fill = (e) => {
            const cd = e.clipboardData;
            if (cd === null)
                return;
            for (const [t, d] of Object.entries(data))
                cd.setData(t, d);
            e.preventDefault();
            e.stopImmediatePropagation();
            wrote = true;
        };
        document.addEventListener("copy", fill, true);
        try {
            document.execCommand("copy");
        }
        catch { /* not allowed here */ }
        document.removeEventListener("copy", fill, true);
        if (!wrote && typeof navigator !== "undefined" && navigator.clipboard !== undefined && data["text/plain"] !== undefined) {
            void navigator.clipboard.writeText(data["text/plain"]).catch(() => { });
        }
    },
};
/** Is this element a text field's own — where the clipboard is the field's? */
const editable = (t) => {
    if (typeof HTMLElement === "undefined" || !(t instanceof HTMLElement))
        return false;
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable;
};
/** A browser host: the page's copy, cut and paste events. A text field's are
 *  left to it, and so is a copy of text selected on the page; a command no view
 *  takes is left to the browser. */
export function wireClipboard(app) {
    if (typeof document === "undefined" || typeof document.addEventListener !== "function")
        return () => { };
    const copy = (e) => {
        if (editable(e.target))
            return;
        const sel = typeof getSelection === "function" ? getSelection() : null;
        if (sel !== null && !sel.isCollapsed && sel.toString() !== "")
            return;
        const cd = e.clipboardData;
        if (cd === null)
            return;
        const put = deliverCopy(app, e.type === "cut" ? "cut" : "copy");
        if (put === null)
            return;
        for (const [t, d] of Object.entries(put))
            cd.setData(t, d);
        e.preventDefault();
    };
    const paste = (e) => {
        if (editable(e.target))
            return;
        const cd = e.clipboardData;
        if (cd === null || !takesClipboard(app, "paste"))
            return;
        const data = {};
        for (const t of Array.from(cd.types))
            if (t !== "Files")
                data[t] = cd.getData(t);
        const files = Array.from(cd.files).map((f) => fromBrowser(f, ""));
        e.preventDefault();
        deliverPaste(app, data, files);
    };
    document.addEventListener("copy", copy);
    document.addEventListener("cut", copy);
    document.addEventListener("paste", paste);
    return () => {
        document.removeEventListener("copy", copy);
        document.removeEventListener("cut", copy);
        document.removeEventListener("paste", paste);
    };
}
//# sourceMappingURL=clipboard.js.map