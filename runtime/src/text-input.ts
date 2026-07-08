// TextInput — the editable text field (design-docs/input.md, Layer 3). The top
// of the input stack: a focus client (Layer 2) whose `text` is the MODEL source
// of truth, realized by the backend as a native editable element (DOM in-box, a
// canvas overlay) so caret, selection, clipboard, IME, and accessibility are
// native — the ruled D-5 approach (OL5's static-measured-text + DOM overlay,
// here always-live for v1). No two-way operator (D-6 dropped): edits flow
// native → model through `onInput`; a `text` bound to a constraint is a
// controlled, read-only field (edits revert).
//
// Two directions of focus sync: neo focus → the native caret (focusChanged →
// activateEditable) and the native caret → neo focus (a click into the field
// fires the element's focus → Focus.focus(this)). The keyboard itself needs no
// wiring here — deliverKeys (Layer 2) already routes keys to the focused view;
// the native element consumes character input directly while it holds the
// caret.

import { View, fireEvent, onDiscard } from "./view.js";
import type { RenderBackend, Surface, EditableSpec } from "./backend.js";
import { defineAttributes, isSet, ownerOf } from "./attributes.js";
import { Constraint } from "./reactive.js";
import { Focus } from "./focus.js";
import type { TextStyle } from "./measure.js";

export class TextInput extends View {
  declare text: string;
  declare placeholder: string;
  declare multiline: boolean;

  override attach(backend: RenderBackend, parentSurface: Surface | null): void {
    // A text field is a tab stop by default; an explicit `focusable = false`
    // (was-set) opts out untouched, exactly like Text's auto-size.
    if (!isSet(this, "focusable") && ownerOf(this, "focusable") === null) this.focusable = true;
    super.attach(backend, parentSurface);
  }

  protected override flush(s: Surface): void {
    super.flush(s);
    // The style is the cold, prevailing path (like Text): a standing derive
    // over the four text slots so a provider re-rooting above re-styles the
    // field. It reads the slots under tracking; the apply re-syncs the element.
    const style = new Constraint(
      "TextInput.editStyle",
      () => this.editStyle(),
      () => this.syncEditable(),
      0
    );
    style.run();
    onDiscard(this, () => style.dispose());
    this.syncEditable();
  }

  private editStyle(): TextStyle {
    return {
      fontFamily: this.fontFamily,
      fontSize: this.fontSize,
      fontWeight: this.fontWeight,
      letterSpacing: this.letterSpacing,
      color: this.textColor,
      shadow: null,
    };
  }

  /** Push the whole editable spec across the seam — value, style, callbacks.
   *  Idempotent and cheap; called on any model change (text/placeholder/
   *  multiline pushes, the style derive) and at flush. */
  syncEditable(): void {
    const s = this.surface;
    if (s === undefined || s === null) return;
    const spec: EditableSpec = {
      value: this.text,
      multiline: this.multiline,
      placeholder: this.placeholder,
      style: this.editStyle(),
      onInput: (v) => this.onNativeInput(v),
      onFocus: () => Focus.focus(this),
      onBlur: () => {
        if (Focus.getFocus() === this) Focus.blur();
      },
      onEnter: () => fireEvent(this, "enter"),
    };
    s.setEditable(spec);
  }

  /** The native element's value changed. A writable `text` takes the edit (the
   *  push re-syncs, guarded against a caret reset); a constraint-owned `text`
   *  is controlled — revert the element to the model value. */
  private onNativeInput(v: string): void {
    if (ownerOf(this, "text") !== null) {
      this.syncEditable();
      return;
    }
    if (this.text !== v) this.text = v;
    fireEvent(this, "input", v);
  }

  /** Neo focus arrived/left — give or take the platform caret (Layer 2 hook,
   *  separate from the author's onFocus/onBlur). */
  override focusChanged(focused: boolean): void {
    this.surface?.activateEditable(focused);
  }
}

defineAttributes(TextInput, {
  text: { def: "", push: (t) => t.syncEditable() },
  placeholder: { def: "", push: (t) => t.syncEditable() },
  multiline: { def: false, push: (t) => t.syncEditable() },
});
