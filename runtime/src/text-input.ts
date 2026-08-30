// TextInput — the editable text field (docs/system-design/input.md, Layer 3). The top
// of the input stack: a focus client (Layer 2) whose `text` is the MODEL source
// of truth, realized by the backend as a native editable element (DOM in-box, a
// canvas overlay) so caret, selection, clipboard, IME, and accessibility are
// native — the ruled D-5 approach (OL5's static-measured-text + DOM overlay,
// here always-live for v1). No two-way operator (D-6 dropped): edits flow
// native → model through `onInput`; a `text` bound to a constraint is a
// controlled, read-only field (edits revert).
//
// Two directions of focus sync: Declare focus → the native caret (focusChanged →
// activateEditable) and the native caret → Declare focus (a click into the field
// fires the element's focus → Focus.focus(this)). The keyboard itself needs no
// wiring here — deliverKeys (Layer 2) already routes keys to the focused view;
// the native element consumes character input directly while it holds the
// caret.

import { fireEvent, onDiscard } from "./view.js";
import type { RenderBackend, Surface, EditableSpec } from "./backend.js";
import { bindDerived, defineAttributes, isSet, ownerOf } from "./attributes.js";
import { Constraint, settle } from "./reactive.js";
import { Focus } from "./focus.js";
import type { TextStyle } from "./measure.js";
import { isTwoWay, edited, commitDraft, Editor } from "./editor.js";
import { stroke } from "./value.js";

export class TextInput extends Editor {
  declare text: string;
  declare placeholder: string;
  declare multiline: boolean;
  declare spellcheck: boolean;
  declare wrap: boolean;
  declare padding: number;
  declare initial: string;
  declare focused: boolean;
  // The editor session (commitOn / error / valid / dirty + commit()/revert())
  // is inherited from Editor; `text` is this editor's draft slot.
  protected override draftSlot(): string { return "text"; }

  override attach(backend: RenderBackend, parentSurface: Surface | null): void {
    // A text field is a tab stop by default; an explicit `focusable = false`
    // (was-set) opts out untouched, exactly like Text's auto-size.
    if (!isSet(this, "focusable") && ownerOf(this, "focusable") === null) this.focusable = true;
    super.attach(backend, parentSurface);
    // Uncontrolled seed: unless the author bound or hard-set `text`, it
    // follows `initial` via a YIELDING derive — reactive, so a source that
    // arrives late fills the field — disposed on the first edit
    // (onNativeInput) so typing takes over; a programmatic `text` write
    // displaces it the same way (own()'s yielding-replace). The guard is
    // text-side ONLY: probing whether `initial` is set at attach raced
    // constraint installation on windowed creation (a late-batch grid cell
    // attached before its `initial` constraint installed, so the seed never
    // bound and the field stayed empty); following the default "" until an
    // initial arrives is the same observable behavior, race-free.
    if (!isSet(this, "text") && ownerOf(this, "text") === null) {
      bindDerived(this, "text", () => this.initial);
    }
    // The house FIELD rendition (library-charter §6: a bare TextInput must
    // carry real visual articulation — today's edgeless default is a defect).
    // Same YIELDING-derive pattern as the seed above: reactive on the
    // prevailing theme and on focus, displaced the moment the author assigns
    // the slot. Surface fill, a 1px line edge that turns accent when the
    // field holds keyboard focus, the theme's controlRadius geometry token.
    const tok = (name: string, fallback: number): number => {
      const v = (this.theme as Record<string, unknown> | null)?.[name];
      return typeof v === "number" ? v : fallback;
    };
    if (!isSet(this, "fill") && ownerOf(this, "fill") === null)
      bindDerived(this, "fill", () => tok("surface", 0xFFFFFF));
    if (!isSet(this, "stroke") && ownerOf(this, "stroke") === null)
      bindDerived(this, "stroke", () => stroke(1, this.focused ? tok("accent", 0x2E6FE0) : tok("line", 0xDBE1E9)));
    if (!isSet(this, "cornerRadius") && ownerOf(this, "cornerRadius") === null)
      bindDerived(this, "cornerRadius", () => tok("fieldRadius", tok("controlRadius", 7)));
    if (!isSet(this, "padding") && ownerOf(this, "padding") === null)
      bindDerived(this, "padding", () => tok("fieldPadding", 10));
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
      spellcheck: this.spellcheck,
      wrap: this.wrap,
      padding: this.padding,
      placeholder: this.placeholder,
      style: this.editStyle(),
      onInput: (v) => this.onNativeInput(v),
      // The native element ECHOES focus the runtime just gave it (Tab →
      // focusChanged → el.focus() → this event). Re-announcing the already-
      // focused view through Focus.focus() would clear keyboard modality —
      // every Tab into a field cancelling its own focus-visible state — so
      // the echo is silenced HERE, at its source; a genuine first focus from
      // the element (a click into the field) still claims normally.
      onFocus: () => { if (Focus.getFocus() !== this) Focus.focus(this); },
      onBlur: () => {
        if (Focus.getFocus() === this) Focus.blur();
        if (this.commitOn === "blur" && isTwoWay(this, "text")) commitDraft(this, "text");
      },
      onEnter: () => {
        if (this.commitOn === "enter" && isTwoWay(this, "text")) commitDraft(this, "text");
        fireEvent(this, "enter");
      },
    };
    s.setEditable(spec);
  }

  /** The native element's value changed. A writable `text` takes the edit; a
   *  HARD constraint makes text a controlled, read-only field — revert the
   *  element to the model. A YIELDING default (a `{ }` the field merely STARTS
   *  from — a theme value, a pristine source) is overridable: the edit disposes
   *  it, exactly like any author write (attributes.ts set path), so a field can
   *  be seeded from a binding yet stay editable. */
  private onNativeInput(v: string): void {
    const owner = ownerOf(this, "text");
    if (owner !== null && !owner.yielding) {
      // CONTROLLED — the constraint owns the slot, so the keystroke does NOT
      // land in `text`. That much is right: a `{ }` is the value's source and an
      // edit cannot overwrite it. But the attempt is still the only news the
      // program gets, and this path used to revert and return without firing —
      // so `text = { app.who }` plus an `onInput` handler was a DEAD field: no
      // edit, no event, no error at any rung, and no way for the app to drive
      // the field at all (it could not even clear a form). The event is the
      // whole mechanism of the controlled pattern — the handler writes the slot
      // the constraint reads, and the new value arrives back through it.
      //
      // Fire, settle, THEN reconcile: if the handler moved the model the
      // element lands on the new value directly, rather than flashing the old
      // one and correcting a beat later.
      fireEvent(this, "input", v);
      settle();
      this.syncEditable();
      return;
    }
    if (this.text !== v) this.text = v;
    // A two-way (`<->`) field runs its edit session FIRST — refresh
    // dirty/valid/error and commit the draft to the dataset per `commitOn`
    // (editor.ts) — so the user's `onInput` handler below sees the model already
    // settled (the committed value in the dataset), not a value about to change.
    if (isTwoWay(this, "text")) edited(this, "text", this.commitOn);
    fireEvent(this, "input", v);
  }

  /** Declare focus arrived/left — give or take the platform caret (Layer 2 hook,
   *  separate from the author's onFocus/onBlur). A held select() applies HERE,
   *  after activation — so Tab and programmatic focus land where the program
   *  said. A pointer CLICK is the exception, by the platform's own ordering:
   *  the browser places the click's caret at mouseup, after focus handlers —
   *  and that is the right ranking, because a deliberate click names a spot. */
  override focusChanged(focused: boolean): void {
    this.focused = focused; // the reactive fact themes and the house edge read
    this.surface?.activateEditable(focused);
    if (focused) this.applySelection();
  }

  /** Place the caret or select a range (#22) — the write half of the native
   *  selection, one verb: a caret IS a zero-length range. `select(7)` puts the
   *  caret at 7; `select(3, 9)` selects the range; the word forms need no
   *  lengths — `select("start")`, `select("end")`, `select("all")`. Numbers
   *  clamp to the text, like every scroll write. Applied now if the field
   *  holds focus; otherwise HELD and applied at the next non-pointer focus
   *  (Tab, or a program's), re-resolved against the text of that moment — a
   *  click into the field keeps the clicked caret. */
  select(at: number | "start" | "end" | "all", end?: number): void {
    this.pendingSel = { at, end };
    if (this.focused) this.applySelection();
  }

  private pendingSel: { at: number | "start" | "end" | "all"; end?: number } | null = null;

  private applySelection(): void {
    const p = this.pendingSel;
    if (p === null) return;
    this.pendingSel = null;
    const len = this.text.length;
    const clamp = (n: number): number => Math.max(0, Math.min(len, Math.floor(n)));
    const [s, e] =
      p.at === "start" ? [0, 0]
      : p.at === "end" ? [len, len]
      : p.at === "all" ? [0, len]
      : [clamp(p.at), clamp(p.end ?? p.at)];
    this.surface?.setSelection?.(Math.min(s, e), Math.max(s, e));
  }
}

defineAttributes(TextInput, {
  text: { def: "", push: (t) => t.syncEditable() },
  placeholder: { def: "", push: (t) => t.syncEditable() },
  multiline: { def: false, push: (t) => t.syncEditable() },
  spellcheck: { def: true, push: (t) => t.syncEditable() },
  wrap: { def: true, push: (t) => t.syncEditable() },
  padding: { def: 0, push: (t) => t.syncEditable() },
  initial: { def: "" },
  focused: { def: false },
  // commitOn / error / valid / dirty are declared on the Editor base.
});
