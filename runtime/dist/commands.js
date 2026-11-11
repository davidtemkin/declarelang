// Commands — a command run by name, from a menu, a button or code
// (docs/system-design/key-bindings.md). A command walks from the command
// target — the last focus outside command chrome (a menu bar, a menu, a command
// button) — outward, as a key does, and the first view whose `keyBindings` bind
// it runs it: so a menu's Copy and Ctrl+C reach the same view. The standard
// verbs `undo`, `redo`, `selectAll` and `delete` also reach a view with a
// method of that name. `copy`, `cut` and `paste` keep the clipboard's own path:
// the nearest view's onClipboardCopy, onClipboardCut, onClipboardPaste.
import { View } from "./view.js";
import { Focus, walkCommand, setCommandRunner } from "./focus.js";
import { Clipboard, deliverCopy, takesClipboard, hasClipboardHost } from "./clipboard.js";
const CLIPBOARD = new Set(["copy", "cut", "paste"]);
const fieldOf = (v) => {
    const t = v;
    return t !== null && typeof t.placeholder === "string" && typeof t.multiline === "boolean" ? t : null;
};
const selected = (f) => {
    const all = String(f.shown ?? "");
    const a = Math.max(0, Math.min(all.length, f.selectionStart ?? 0));
    const b = Math.max(a, Math.min(all.length, f.selectionEnd ?? a));
    return { text: all.slice(a, b), a, b };
};
const pageSelection = () => {
    const s = typeof getSelection === "function" ? getSelection() : null;
    return s !== null && !s.isCollapsed ? s.toString() : "";
};
const rootOf = (v) => { let r = v; while (r.parent instanceof View)
    r = r.parent; return r; };
/** Copy, Cut and Paste picked from a menu or a button: run inside the pick's own
 *  event, as the platform asks of a clipboard write. */
function clipboard(name, from, run) {
    const start = from ?? Focus.commandStart();
    if (start === null)
        return "none";
    if (name === "paste") {
        // a page can't read the clipboard: pasting is what the person does (⌘V)
        if (!hasClipboardHost())
            return "off";
        return takesClipboard(rootOf(start), "paste", start) || fieldOf(start) !== null ? "on" : "none";
    }
    const kind = name;
    const field = fieldOf(start);
    if (field !== null) {
        const s = selected(field);
        if (s.text === "")
            return "off";
        if (!run)
            return "on";
        Clipboard.copy(s.text);
        if (kind === "cut" && typeof field._typed === "function") {
            const all = String(field.shown ?? "");
            field._typed(all.slice(0, s.a) + all.slice(s.b));
        }
        return "taken";
    }
    // a selection on the page wins, as for the key
    const page = pageSelection();
    if (page !== "" && kind === "copy") {
        if (run)
            Clipboard.copy(page);
        return run ? "taken" : "on";
    }
    if (!takesClipboard(rootOf(start), kind, start))
        return "none";
    if (!run)
        return "on";
    const put = deliverCopy(rootOf(start), kind, start);
    if (put === null)
        return "off";
    Clipboard.copy(put);
    return "taken";
}
/** The command service. */
export const Commands = {
    /** Run a command by name, from `from` (else the command target). True when a
     *  view took it. */
    run(name, from) {
        const n = String(name);
        if (CLIPBOARD.has(n))
            return clipboard(n, from ?? null, true) === "taken";
        return walkCommand(n, from ?? null, true) === "taken";
    },
    /** Is a command there to run now, and enabled — what a menu greys by.
     *  "on", "off" (shown greyed) or "none" (no view answers it). */
    state(name, from) {
        const n = String(name);
        const r = CLIPBOARD.has(n) ? clipboard(n, from ?? null, false) : walkCommand(n, from ?? null, false);
        return r === "taken" ? "on" : r;
    },
    /** Where a command starts now: the last focus outside command chrome. */
    target() {
        return Focus.commandStart();
    },
};
// a MenuBar item's key runs its command through here (focus.ts tableAt)
setCommandRunner((name) => Commands.run(name));
//# sourceMappingURL=commands.js.map