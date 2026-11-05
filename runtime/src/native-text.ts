// NativeText — the native text element a field is made of (docs/system-design/
// editing-values.md §4.9). It is a node, not a view: placed inside a view (the
// library's TextInput), it makes THAT view a native editable field, realized by the
// backend as a real <input>/<textarea> (in-box on the DOM, an overlay in canvas mode,
// NSTextField/NSTextView on the Mac), so caret, selection, composition, the clipboard,
// undo and accessibility are the platform's. The field stays the focused view: focus,
// `focused`, and the field's own `onFocus`/`onBlur`/`onKeyDown` are the field's.
//
// What the field means — its value, what it shows while the person edits, `admit` and
// `commit`, judging, the form — is the library's ValueControl, once for every control.
// This node only carries text across the seam in both directions:
// - DOWN: `text` (what the field shows, constrained by the field) is written into the
//   element only when it differs, never during a composition (editable-input.ts);
// - UP: each change the person makes is put to the field's `admit` before it lands
//   where the platform describes it beforehand, and reported once it has landed to
//   the field's `_typed(text)` — after `admit` has judged it, if it couldn't before.
//
// The field (its parent view) answers to: `admit(t)`, `_typed(t)`, `endEdit()`,
// `onEnter()`, `disabled`, `padding`, `form`, `multiline` reads on itself; its face
// (font, colour) comes through the provided face values, as any text leaf's does.

import { View, onDiscard, setNativeTextHook } from "./view.js";
import { Node } from "./node.js";
import type { Surface, EditableSpec } from "./backend.js";
import { bindDerived, defineAttributes, faceSlots, isSet, ownerOf } from "./attributes.js";
import { Constraint } from "./reactive.js";
import { Focus } from "./focus.js";
import { fontMetrics, fontString, wrapEditable, type TextStyle, type FontWeight } from "./measure.js";
import { heldFamily, type FamilyValue } from "./font-value.js";
import { insetSides, type Color, type Inset } from "./value.js";
import { hintsOf, type Purpose } from "./purpose.js";
import { physicalAlign, runDirection } from "./text.js";
import type { NumeralWidth } from "./font-features.js";

/** What the node needs of the field it rides: the library TextInput's members. */
interface Field extends View {
  admit?: (t: string) => string | null;
  _typed?: (t: string) => void;
  endEdit?: () => void;
  onEnter?: () => void;
  disabled?: boolean;
  form?: unknown;
}

export class NativeText extends Node {
  declare textColor: Color;
  declare fontSize: number;
  declare fontFamily: FamilyValue;
  declare fontWeight: FontWeight;
  declare letterSpacing: number;
  /** What the field shows: the field's to constrain (`text = { classroot.shown }`). */
  declare text: string;
  declare placeholder: string;
  declare multiline: boolean;
  declare wrap: boolean;
  declare enterSubmits: boolean;
  declare spellcheck: boolean;
  declare purpose: Purpose;
  declare concealed: boolean;
  declare numeralWidth: NumeralWidth;
  declare textAlign: "start" | "center" | "end" | "left" | "right";
  declare italic: boolean;
  /** The native selection, read-only: reported as the person moves it. */
  declare selectionStart: number;
  declare selectionEnd: number;
  /** The text's own height in the field: its lines at the field's face (no padding). */
  declare textHeight: number;

  /** The view this node makes a field of, once it attaches. */
  $field: Field | null = null;

  /** Place the caret or select a range — `select(7)`, `select(3, 9)`, `select("all")`.
   *  Applied at once when the field holds focus; otherwise held for the next
   *  non-pointer focus (Tab, or a program's). */
  select(at: number | "start" | "end" | "all", end?: number): void {
    this.$pendingSel = { at, end };
    if (this.$field?.focused === true && !this.$inInput) this.$applySelection();
  }

  $pendingSel: { at: number | "start" | "end" | "all"; end?: number } | null = null;
  $inInput = false;

  /** `len`: the text's length — inside a change being reported, the text that
   *  just landed, which `text` (constrained by the field) shows only at the
   *  next settle. */
  $applySelection(len = this.text.length): void {
    const p = this.$pendingSel;
    if (p === null) return;
    this.$pendingSel = null;
    const clamp = (n: number): number => Math.max(0, Math.min(len, Math.floor(n)));
    const [s, e] =
      p.at === "start" ? [0, 0]
      : p.at === "end" ? [len, len]
      : p.at === "all" ? [0, len]
      : [clamp(p.at), clamp(p.end ?? p.at)];
    this.$field?.$surface?.setSelection?.(Math.min(s, e), Math.max(s, e));
  }

  $editStyle(): TextStyle {
    const f = this.$field;
    return {
      fontFamily: heldFamily(this, "fontFamily", this.fontFamily),
      fontSize: this.fontSize,
      fontWeight: this.fontWeight,
      letterSpacing: this.letterSpacing,
      color: this.textColor,
      shadow: null,
      ...(this.numeralWidth !== "normal" ? { numeralWidth: this.numeralWidth } : {}),
      align: physicalAlign(this.textAlign, f !== null ? runDirection(f) : "ltr"),
      italic: this.italic,
    };
  }

  /** The text's lines at the field's face, padding excluded — the field's natural
   *  height is this plus its padding. */
  $lines(): number {
    const f = this.$field;
    if (!this.multiline || f === null) return 1;
    const font = fontString(this.$editStyle());
    const [, r, , l] = insetSides(f.padding as Inset);
    const inner = f.width - l - r;
    return this.wrap && inner > 0 ? wrapEditable(this.text, font, inner, this.letterSpacing).length : this.text.split("\n").length;
  }

  /** Push the whole editable spec across the seam — value, style, callbacks. */
  $sync(): void {
    const f = this.$field;
    const s = f?.$surface;
    if (f === null || s === undefined || s === null) return;
    const form = f.form as { _enterHint?: (c: View) => string } | null | undefined;
    const spec: EditableSpec = {
      value: this.text,
      multiline: this.multiline,
      spellcheck: this.spellcheck,
      purpose: this.purpose,
      concealed: this.concealed,
      wrap: this.wrap,
      padding: f.padding as Inset,
      placeholder: this.placeholder,
      style: this.$editStyle(),
      enterSubmits: this.enterSubmits,
      enterHint: this.multiline || form == null ? "" : String(form._enterHint?.(f) ?? ""),
      disabled: f.disabled === true,
      admit: typeof f.admit === "function" ? (t) => f.admit!.call(f, t) : undefined,
      onInput: (v, checked) => this.$onNativeInput(v, checked === true),
      // the element echoes focus the runtime just gave it; only a genuine first
      // focus from the element (a click into it) claims
      onFocus: () => { if (Focus.getFocus() !== f) Focus.focus(f); },
      onBlur: () => { if (Focus.getFocus() === f && Focus.reaches(f)) Focus.blur(); },
      onEnter: () => {
        // Return ends the edit, then is the field's: by default its form's
        // (submit, or on to the next), unless the field says otherwise
        f.endEdit?.();
        if (typeof f.onEnter === "function") f.onEnter();
      },
      onSelect: (start, end) => {
        if (this.selectionStart !== start) this.selectionStart = start;
        if (this.selectionEnd !== end) this.selectionEnd = end;
      },
    };
    s.setEditable(spec);
  }

  /** A change has landed. Judged now if `admit` couldn't see it beforehand (a
   *  composition, autofill, undo): refused, the last admitted text goes back;
   *  rewritten, the rewrite is applied — each as an undoable edit, which lands
   *  checked. Then the field hears it. */
  $onNativeInput(v: string, checked: boolean): void {
    const f = this.$field;
    if (f === null) return;
    if (f.disabled === true) { this.$sync(); return; }
    if (!checked && typeof f.admit === "function") {
      const r = f.admit.call(f, v);
      const back = r === null ? this.$admitted : r;
      if (back !== v) { f.$surface?.applyEditableText?.(back, v); return; }
    }
    this.$admitted = v;
    this.$inInput = true;
    try { f._typed?.call(f, v); }
    finally { this.$inInput = false; }
    this.$applySelection(v.length);
  }
  /** The last text the field took: what a change refused after it landed returns to. */
  $admitted = "";
}

defineAttributes(NativeText as never, {
  ...faceSlots(),
  text: { def: "", push: (n: NativeText) => { n.$admitted = n.text; n.$sync(); } },
  placeholder: { def: "", push: (n: NativeText) => n.$sync() },
  multiline: { def: false, push: (n: NativeText) => n.$sync() },
  wrap: { def: true, push: (n: NativeText) => n.$sync() },
  enterSubmits: { def: false, push: (n: NativeText) => n.$sync() },
  spellcheck: { def: true, push: (n: NativeText) => n.$sync() },
  purpose: { def: "text", push: (n: NativeText) => n.$sync() },
  concealed: { def: false, push: (n: NativeText) => n.$sync() },
  numeralWidth: { def: "normal" },
  textAlign: { def: "start" },
  italic: { def: false },
  selectionStart: { def: 0 },
  selectionEnd: { def: 0 },
  textHeight: { def: 0 },
});

/** The controller a field view carries (View.$native): what the view's own hooks
 *  ask — an eager surface, the native caret on focus, the text's extent. */
export interface NativeHost {
  node: NativeText;
  flushed(s: Surface): void;
  focusChanged(focused: boolean): void;
  contentExtent(size: "width" | "height"): number;
}

function install(view: View): NativeHost | null {
  let node: NativeText | null = null;
  for (const c of view.children) if (c instanceof NativeText) { node = c; break; }
  if (node === null) return null;
  const n = node;
  n.$field = view as Field;
  // a password is hidden unless the field shows it (a reveal sets `concealed`)
  if (!isSet(n, "concealed") && ownerOf(n, "concealed") === null) bindDerived(n, "concealed", () => hintsOf(n.purpose).concealed);
  bindDerived(n, "textHeight", () => {
    const met = fontMetrics(fontString(n.$editStyle()));
    return Math.ceil(n.$lines() * (met.ascent + met.descent));
  });
  const host: NativeHost = {
    node: n,
    flushed() {
      // what the spec reads off the field beyond this node's own attributes — the
      // face (the cold, provided path: a provider above re-styles the field), its
      // padding, and whether it is disabled — through one standing derive that
      // re-syncs the element when any of them changes
      const style = new Constraint("NativeText.editStyle", () => {
        const f = view as Field;
        return [n.$editStyle(), f.padding, f.disabled === true];
      }, () => n.$sync(), 0);
      style.run();
      onDiscard(view, () => style.dispose());
      n.$sync();
    },
    focusChanged(focused) {
      if (focused && (view as Field).form != null) n.$sync();   // the Return key's word depends on the form
      view.$surface?.activateEditable(focused);
      if (focused) n.$applySelection();
    },
    contentExtent(size) {
      return size === "width" ? 0 : n.textHeight;
    },
  };
  return host;
}

setNativeTextHook(install);

// what a view holding native text is to assistive technology: a text field — a
// fact of its children, so it holds before the view is attached (a semantic tree
// of a program built and not yet shown). Text and Image say their own.
if (typeof __DECLARE_ACCESSIBILITY__ === "undefined" || __DECLARE_ACCESSIBILITY__) {
  (View.prototype as View & { $leafRole?: () => "textField" | undefined }).$leafRole = function (this: View) {
    for (const c of this.children) if (c instanceof NativeText) return "textField";
    return undefined;
  } as never;
}
