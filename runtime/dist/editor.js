/** The two-way **edit session** — the reusable core an Editor component owns
 *  (language §9, the leaf-input exception). `TextInput` is the first editor; a
 *  `Picker` or a `DatePopup` reuses the same functions, differing only in how a
 *  user gesture produces a new draft.
 *
 *  Two layers of ownership resolve the "who owns the value" question:
 *  - the **dataset** owns the *committed* value — the place a `:datapath` names;
 *  - the **editor** owns the *edit session* — the draft slot, its validity, its
 *    error, and *when* a valid draft graduates into the dataset.
 *
 *  `<->` wires both directions onto one slot:
 *  - **read/reseed** — the committed datapath value lands in the draft slot, and
 *    re-lands whenever the cursor moves to a new record (a fresh session) or the
 *    value changes underneath; between those, the user's edits persist.
 *  - **write** — a *valid* draft commits back into the dataset (per `commitOn`).
 *
 *  One-way `=` / `{ }` bindings are untouched — this is strictly opt-in, and the
 *  session's state slots (`error`/`valid`/`dirty`) are pay-per-use: an editor
 *  that declares none pays nothing.
 */
import { Constraint } from "./reactive.js";
import { View, onDiscard } from "./view.js";
import { setBound, defineAttributes } from "./attributes.js";
import { coerceData } from "./data.js";
import { compileExpr } from "./expr.js";
import { DeclareError } from "./errors.js";
/** Per-editor map of draft-slot → its two-way session. A WeakMap so a discarded
 *  editor's session is collected with it. */
const SESSIONS = new WeakMap();
function sessionOf(view, name) {
    return SESSIONS.get(view)?.get(name);
}
/** @api Is `name` a two-way (`<->`) slot on this editor? An editor asks before
 *  running the session, so an unbound field costs nothing. */
export function isTwoWay(view, name) {
    return sessionOf(view, name) !== undefined;
}
/** The value the dataset currently holds at the bound path — the committed
 *  truth the draft is measured against. */
function committed(view, s) {
    return coerceData(s.type, view.$data(s.path()), "");
}
/** Record the session and install the read/reseed constraint. The reseed does
 *  NOT own the slot — the user's edits write it freely — and re-fires ONLY when
 *  the datapath value (or, for a dynamic path, the field it names) changes, so an
 *  in-record edit is never clobbered mid-keystroke (the "controlled reverts"
 *  trap, avoided). */
function register(view, name, path, type) {
    let map = SESSIONS.get(view);
    if (map === undefined)
        SESSIONS.set(view, (map = new Map()));
    map.set(name, { path, type });
    const reseed = new Constraint(`${view.constructor.name}.${name} <->`, () => coerceData(type, view.$data(path()), ""), (v) => { setBound(view, name, v); refresh(view, name); });
    onDiscard(view, () => reseed.dispose());
    reseed.run();
    refresh(view, name);
}
/** Wire a STATIC `name <-> :path` (called from instantiate). */
export function bindTwoWay(view, name, path, type) {
    register(view, name, () => path, type);
}
/** Wire a DYNAMIC `name <-> { expr }`: the expression yields the field name (or a
 *  relative path) at runtime — a generic editor bound to a slot chosen by a
 *  `classroot.field` string. The path thunk reads the expr under the reseed's
 *  tracking, so changing the field reseeds the editor onto the new place. */
export function bindTwoWayDynamic(view, name, src, pos, classroot, type) {
    const c = compileExpr(src);
    if ("error" in c)
        throw new DeclareError(`${view.constructor.name}.${name} <-> { … } ${c.error}`, pos);
    const fn = c.fn;
    register(view, name, () => String(fn.call(view, view.parent, classroot)), type);
}
/** Run the editor's own `validate(v)` method if it declares one. Returns an
 *  error MESSAGE (string) or null when valid. Pure and local by design — a
 *  `validate` that returns `false` means "invalid" (a generic message), a
 *  string is the message, and `true`/null/"" mean valid. Form-wide validity is
 *  not special-cased: it is an ordinary constraint over fields' `valid` slots. */
function runValidate(view, v) {
    const fn = view.validate;
    if (typeof fn !== "function")
        return null;
    const r = fn.call(view, v);
    if (r === true || r == null || r === "")
        return null;
    if (r === false)
        return "invalid";
    return String(r);
}
/** Publish an OPTIONAL session slot only when the editor declares it, so
 *  `error`/`valid`/`dirty` stay pay-per-use. */
function publish(view, name, v) {
    if (name in view)
        setBound(view, name, v);
}
/** Recompute + publish the session state (error / valid / dirty). Cheap; called
 *  after any draft change or reseed. */
function refresh(view, name) {
    const s = sessionOf(view, name);
    if (s === undefined)
        return;
    const draft = view[name];
    const err = runValidate(view, draft);
    publish(view, "error", err ?? "");
    publish(view, "valid", err === null);
    publish(view, "dirty", draft !== committed(view, s));
}
/** @api The user changed the draft (a native edit, a picker selection). Refresh
 *  the session, and commit now if the policy is live (`commitOn === "input"`). */
export function edited(view, name, commitOn) {
    refresh(view, name);
    if (commitOn === "input")
        commitDraft(view, name);
}
/** @api Commit the draft into the dataset — the write-back — but ONLY if it
 *  validates. An invalid draft never reaches the dataset (ruling #3); its error
 *  just sits in the session for presentation. Committing writes the datapath;
 *  the reseed re-reads the same value and the equality gate stops the loop. */
export function commitDraft(view, name) {
    const s = sessionOf(view, name);
    if (s === undefined)
        return;
    const draft = view[name];
    if (runValidate(view, draft) !== null)
        return;
    view.$setData(s.path(), draft);
}
/** @api Discard the draft — reset the slot to the committed value. */
export function revertDraft(view, name) {
    const s = sessionOf(view, name);
    if (s === undefined)
        return;
    setBound(view, name, committed(view, s));
    refresh(view, name);
}
/** @api The base class for an **editor** — a component that two-way edits a
 *  dataset value via `<->`. It owns the edit-session slots (`commitOn` / `error`
 *  / `valid` / `dirty`) and the `commit()` / `revert()` verbs; a subclass only
 *  provides the editing UI and names its **draft slot** (`TextInput` → `text`,
 *  a `Picker` → `value`). Custom controls become editors by extending it. */
export class Editor extends View {
    /** @api Commit the current draft into the bound dataset field, if it
     *  validates — for a `commitOn = "manual"` field or a Save button. */
    commit() {
        commitDraft(this, this.draftSlot());
    }
    /** @api Discard edits — reset the field to the committed dataset value. */
    revert() {
        revertDraft(this, this.draftSlot());
    }
}
defineAttributes(Editor, {
    commitOn: { def: "input" },
    error: { def: "" },
    valid: { def: true },
    dirty: { def: false },
});
//# sourceMappingURL=editor.js.map