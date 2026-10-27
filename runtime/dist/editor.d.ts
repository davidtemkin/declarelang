/** The two-way **edit session** — the reusable core a field's draft runs on
 *  (language §9, the leaf-input exception). `TextInput` is the one built-in
 *  that holds a draft today; the functions take the draft slot's name, so the
 *  session is not tied to it.
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
export declare function bindTwoWay(view: View, name: string, path: string | readonly string[], type: AttrType): void;
/** Wire a DYNAMIC `name <-> { expr }`: the expression yields the field name (or a
 *  relative path) at runtime — a generic editor bound to a slot chosen by a
 *  `classroot.field` string. The path thunk reads the expr under the reseed's
 *  tracking, so changing the field reseeds the editor onto the new place. */
export declare function bindTwoWayDynamic(view: View, name: string, src: string, pos: Pos, classroot: View | null, type: AttrType): void;
/** Run the editor's own `validate(v)` method if it declares one. Returns an
 *  error MESSAGE (string) or null when valid. Pure and local by design — a
 *  `validate` that returns `false` means "invalid" (a generic message), a
 *  string is the message, and `true`/null/"" mean valid. Reactive where it is
 *  called under tracking: a rule that reads another value re-judges when that
 *  value changes. */
export declare function runValidate(view: View, v: unknown): string | null;
/** @api The schema floor's message for a bound field's draft — "must be a
 *  number" — or null: structure, which only a two-way field has. */
export declare function floorError(view: View, name: string): string | null;
/** @api Judge the draft now: an editor that judges on leaving says what is
 *  wrong from here on. Leaving the field does this; so may a Save, and a
 *  form's submit. `judged` is the editor's own slot, which the program may
 *  also write back to false (a field emptied for a fresh try). */
export declare function judgeDraft(view: View, _name: string): void;
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
