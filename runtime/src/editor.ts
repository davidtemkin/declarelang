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

import { Constraint } from "./reactive.js";
import { View, onDiscard, inheritedCursor } from "./view.js";
import { setBound } from "./attributes.js";
import { coerceData } from "./data.js";
import { splitPath } from "./path-plan.js";
import type { ShapeField } from "./data-schema.js";
import { compileExpr } from "./expr.js";
import { DeclareError, type Pos } from "./errors.js";
import type { AttrType } from "./value.js";
import { declareName } from "./declare-name.js";

interface Session {
  /** The bound field's path relative to the inherited cursor — a string, or
   *  pre-parsed segments (a quoted-name `<->` target, B3). A thunk, so a
   *  DYNAMIC `<->` (`name <-> { classroot.field }`) can vary it reactively — the
   *  reseed reads it under tracking, so changing the field re-seeds the editor. */
  path: () => string | readonly string[];
  type: AttrType;
}

/** Per-editor map of draft-slot → its two-way session. A WeakMap so a discarded
 *  editor's session is collected with it. */
const SESSIONS = new WeakMap<View, Map<string, Session>>();

function sessionOf(view: View, name: string): Session | undefined {
  return SESSIONS.get(view)?.get(name);
}

/** @api Is `name` a two-way (`<->`) slot on this editor? An editor asks before
 *  running the session, so an unbound field costs nothing. */
export function isTwoWay(view: View, name: string): boolean {
  return sessionOf(view, name) !== undefined;
}

/** The value the dataset currently holds at the bound path — the committed
 *  truth the draft is measured against. */
function committed(view: View, s: Session): unknown {
  return coerceData(s.type, view.$data(s.path()), "");
}

/** Record the session and install the read/reseed constraint. The reseed does
 *  NOT own the slot — the user's edits write it freely — and re-fires ONLY when
 *  the datapath value (or, for a dynamic path, the field it names) changes, so an
 *  in-record edit is never clobbered mid-keystroke (the "controlled reverts"
 *  trap, avoided). */
function register(view: View, name: string, path: () => string | readonly string[], type: AttrType): void {
  let map = SESSIONS.get(view);
  if (map === undefined) SESSIONS.set(view, (map = new Map()));
  map.set(name, { path, type });
  const reseed = new Constraint(
    `${declareName(view)}.${name} <->`,
    () => coerceData(type, view.$data(path()), ""),
    (v) => { setBound(view, name, v); refresh(view, name); }
  );
  onDiscard(view, () => reseed.dispose());
  reseed.run();
  refresh(view, name);
}

/** Wire a STATIC `name <-> :path` (called from instantiate). */
export function bindTwoWay(view: View, name: string, path: string | readonly string[], type: AttrType): void {
  register(view, name, () => path, type);
}

/** Wire a DYNAMIC `name <-> { expr }`: the expression yields the field name (or a
 *  relative path) at runtime — a generic editor bound to a slot chosen by a
 *  `classroot.field` string. The path thunk reads the expr under the reseed's
 *  tracking, so changing the field reseeds the editor onto the new place. */
export function bindTwoWayDynamic(view: View, name: string, src: string, pos: Pos, classroot: View | null, type: AttrType): void {
  const c = compileExpr(src);
  if ("error" in c) throw new DeclareError(`${declareName(view)}.${name} <-> { … } ${c.error}`, pos);
  const fn = c.fn;
  register(view, name, () => String(fn.call(view, view.parent, classroot)), type);
}

/** The schema's declared field under this session, when the dataset declares
 *  one and the path stays inside the declared world — the FLOOR under
 *  validate() (typed data, 2026-09-02): structure comes from the declaration,
 *  judgment from the author's method. Null = no schema / open path / a
 *  record-valued target (compile refuses those on `<->`). */
function declaredFloor(view: View, s: Session): ShapeField | null {
  const cursor = inheritedCursor(view);
  if (cursor === null) return null;
  const rel = s.path();
  const segs = typeof rel === "string" ? splitPath(rel) : rel;
  const at = cursor.data.$declaredField([...cursor.path, ...segs]);
  return at === null || at.f.fields !== undefined ? null : at.f;
}

/** Read a draft AS the declared type. A text editor's draft is a string; a
 *  `number` field commits the PARSED number ("42" → 42) — never the string
 *  that edited it — and a draft that cannot be read as the type is an
 *  INVALID SESSION (valid=false, the message below), never a thrown write:
 *  the edit session exists precisely because an in-progress value may be
 *  unrepresentable in the model. A literal union validates by membership. */
function readDraft(f: ShapeField | null, draft: unknown): { v: unknown; error: string | null } {
  if (f === null || f.type === null || f.type === "any" || f.array) return { v: draft, error: null };
  if (f.type === "number") {
    const t = typeof draft === "string" ? draft.trim() : draft;
    const n = typeof t === "number" ? t : t === "" ? NaN : Number(t);
    if (Number.isNaN(n)) return { v: draft, error: "must be a number" };
    if (f.tokens !== undefined && !f.tokens.includes(n)) {
      return { v: draft, error: `must be one of ${f.tokens.join(" | ")}` };
    }
    return { v: n, error: null };
  }
  if (f.type === "boolean") {
    // compile refuses `<->` onto a boolean field; this arm is the defensive
    // floor for a dynamic `<-> { expr }` that lands on one at runtime
    return typeof draft === "boolean" ? { v: draft, error: null } : { v: draft, error: "must be true or false" };
  }
  const sd = typeof draft === "string" ? draft : String(draft ?? "");
  if (f.tokens !== undefined && !f.tokens.includes(sd)) {
    return { v: draft, error: `must be one of ${f.tokens.map((t) => JSON.stringify(t)).join(" | ")}` };
  }
  return { v: sd, error: null };
}

/** Run the editor's own `validate(v)` method if it declares one. Returns an
 *  error MESSAGE (string) or null when valid. Pure and local by design — a
 *  `validate` that returns `false` means "invalid" (a generic message), a
 *  string is the message, and `true`/null/"" mean valid. Reactive where it is
 *  called under tracking: a rule that reads another value re-judges when that
 *  value changes. */
export function runValidate(view: View, v: unknown): string | null {
  const fn = (view as unknown as Record<string, unknown>).validate;
  if (typeof fn !== "function") return null;
  const r = (fn as (x: unknown) => unknown).call(view, v);
  if (r === true || r == null || r === "") return null;
  if (r === false) return "invalid";
  return String(r);
}

/** @api The schema floor's message for a bound field's draft — "must be a
 *  number" — or null: structure, which only a two-way field has. */
export function floorError(view: View, name: string): string | null {
  const s = sessionOf(view, name);
  if (s === undefined) return null;
  return readDraft(declaredFloor(view, s), (view as unknown as Record<string, unknown>)[name]).error;
}

/** @api Judge the draft now: an editor that judges on leaving says what is
 *  wrong from here on. Leaving the field does this; so may a Save, and a
 *  form's submit. `judged` is the editor's own slot, which the program may
 *  also write back to false (a field emptied for a fresh try). */
export function judgeDraft(view: View, _name: string): void {
  if ((view as unknown as { judged?: boolean }).judged !== true) setBound(view, "judged", true);
}

/** Recompute + publish the session's `dirty`. `problem`, `valid` and `error`
 *  are the field's own derives (text-input.ts), over the same rule. */
function refresh(view: View, name: string): void {
  (view as unknown as { $judging?: () => void }).$judging?.();
  const s = sessionOf(view, name);
  if (s === undefined) return;
  const draft = (view as unknown as Record<string, unknown>)[name];
  if ("dirty" in view) setBound(view, "dirty", draft !== committed(view, s));
}

/** @api The user changed the draft (a native edit, a picker selection). Refresh
 *  the session, and commit now if the policy is live (`commitOn === "input"`). */
export function edited(view: View, name: string, commitOn: string): void {
  refresh(view, name);
  if (commitOn === "input") commitDraft(view, name);
}

/** @api Commit the draft into the dataset — the write-back — but ONLY if it
 *  validates. An invalid draft never reaches the dataset (ruling #3); its error
 *  just sits in the session for presentation. Committing writes the datapath;
 *  the reseed re-reads the same value and the equality gate stops the loop. */
export function commitDraft(view: View, name: string): void {
  const s = sessionOf(view, name);
  if (s === undefined) return;
  const draft = (view as unknown as Record<string, unknown>)[name];
  if (runValidate(view, draft) !== null) return;
  // the schema floor (typed data): the commit is the draft READ AS the
  // field's declared type; a draft that cannot be is invalid and stays in
  // the session — it never reaches the dataset, and never throws
  const rd = readDraft(declaredFloor(view, s), draft);
  if (rd.error !== null) return;
  view.$setData(s.path(), rd.v);
}

/** @api Discard the draft — reset the slot to the committed value. */
export function revertDraft(view: View, name: string): void {
  const s = sessionOf(view, name);
  if (s === undefined) return;
  setBound(view, name, committed(view, s));
  refresh(view, name);
}

