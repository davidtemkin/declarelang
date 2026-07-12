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
import { View } from "./view.js";
import { type Pos } from "./errors.js";
import type { AttrType } from "./value.js";
/** @api Is `name` a two-way (`<->`) slot on this editor? An editor asks before
 *  running the session, so an unbound field costs nothing. */
export declare function isTwoWay(view: View, name: string): boolean;
/** Wire a STATIC `name <-> :path` (called from instantiate). */
export declare function bindTwoWay(view: View, name: string, path: string, type: AttrType): void;
/** Wire a DYNAMIC `name <-> { expr }`: the expression yields the field name (or a
 *  relative path) at runtime — a generic editor bound to a slot chosen by a
 *  `classroot.field` string. The path thunk reads the expr under the reseed's
 *  tracking, so changing the field reseeds the editor onto the new place. */
export declare function bindTwoWayDynamic(view: View, name: string, src: string, pos: Pos, classroot: View | null, type: AttrType): void;
/** @api The user changed the draft (a native edit, a picker selection). Refresh
 *  the session, and commit now if the policy is live (`commitOn === "input"`). */
export declare function edited(view: View, name: string, commitOn: string): void;
/** @api Commit the draft into the dataset — the write-back — but ONLY if it
 *  validates. An invalid draft never reaches the dataset (ruling #3); its error
 *  just sits in the session for presentation. Committing writes the datapath;
 *  the reseed re-reads the same value and the equality gate stops the loop. */
export declare function commitDraft(view: View, name: string): void;
/** @api Discard the draft — reset the slot to the committed value. */
export declare function revertDraft(view: View, name: string): void;
/** @api The base class for an **editor** — a component that two-way edits a
 *  dataset value via `<->`. It owns the edit-session slots (`commitOn` / `error`
 *  / `valid` / `dirty`) and the `commit()` / `revert()` verbs; a subclass only
 *  provides the editing UI and names its **draft slot** (`TextInput` → `text`,
 *  a `Picker` → `value`). Custom controls become editors by extending it. */
export declare abstract class Editor extends View {
    /** "input" (live) | "blur" | "enter" | "manual" — when a valid draft commits. */
    commitOn: string;
    /** The current validation message, "" when valid (reactive). */
    error: string;
    /** Does the draft pass validate()? (reactive) */
    valid: boolean;
    /** Does the draft differ from the committed value? (reactive) */
    dirty: boolean;
    /** The slot holding the draft (the editable value) — the one `<->` binds. */
    protected abstract draftSlot(): string;
    /** @api Commit the current draft into the bound dataset field, if it
     *  validates — for a `commitOn = "manual"` field or a Save button. */
    commit(): void;
    /** @api Discard edits — reset the field to the committed dataset value. */
    revert(): void;
}
