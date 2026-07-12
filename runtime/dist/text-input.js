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
import { fireEvent, onDiscard } from "./view.js";
import { bindDerived, defineAttributes, isSet, ownerOf } from "./attributes.js";
import { Constraint } from "./reactive.js";
import { Focus } from "./focus.js";
import { isTwoWay, edited, commitDraft, Editor } from "./editor.js";
export class TextInput extends Editor {
    // The editor session (commitOn / error / valid / dirty + commit()/revert())
    // is inherited from Editor; `text` is this editor's draft slot.
    draftSlot() { return "text"; }
    attach(backend, parentSurface) {
        // A text field is a tab stop by default; an explicit `focusable = false`
        // (was-set) opts out untouched, exactly like Text's auto-size.
        if (!isSet(this, "focusable") && ownerOf(this, "focusable") === null)
            this.focusable = true;
        super.attach(backend, parentSurface);
        // Uncontrolled seed: when the author gives an `initial` (and hasn't
        // hard-set `text`), `text` follows it via a YIELDING derive — reactive, so
        // a source that arrives late fills the field, and disposed on the first
        // edit (onNativeInput) so typing takes over. A bound `text` is untouched.
        if ((isSet(this, "initial") || ownerOf(this, "initial") !== null) &&
            !isSet(this, "text") && ownerOf(this, "text") === null) {
            bindDerived(this, "text", () => this.initial);
        }
    }
    flush(s) {
        super.flush(s);
        // The style is the cold, prevailing path (like Text): a standing derive
        // over the four text slots so a provider re-rooting above re-styles the
        // field. It reads the slots under tracking; the apply re-syncs the element.
        const style = new Constraint("TextInput.editStyle", () => this.editStyle(), () => this.syncEditable(), 0);
        style.run();
        onDiscard(this, () => style.dispose());
        this.syncEditable();
    }
    editStyle() {
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
    syncEditable() {
        const s = this.surface;
        if (s === undefined || s === null)
            return;
        const spec = {
            value: this.text,
            multiline: this.multiline,
            spellcheck: this.spellcheck,
            wrap: this.wrap,
            padding: this.padding,
            placeholder: this.placeholder,
            style: this.editStyle(),
            onInput: (v) => this.onNativeInput(v),
            onFocus: () => Focus.focus(this),
            onBlur: () => {
                if (Focus.getFocus() === this)
                    Focus.blur();
                if (this.commitOn === "blur" && isTwoWay(this, "text"))
                    commitDraft(this, "text");
            },
            onEnter: () => {
                if (this.commitOn === "enter" && isTwoWay(this, "text"))
                    commitDraft(this, "text");
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
    onNativeInput(v) {
        const owner = ownerOf(this, "text");
        if (owner !== null && !owner.yielding) {
            this.syncEditable();
            return;
        }
        if (this.text !== v)
            this.text = v;
        // A two-way (`<->`) field runs its edit session FIRST — refresh
        // dirty/valid/error and commit the draft to the dataset per `commitOn`
        // (editor.ts) — so the user's `onInput` handler below sees the model already
        // settled (the committed value in the dataset), not a value about to change.
        if (isTwoWay(this, "text"))
            edited(this, "text", this.commitOn);
        fireEvent(this, "input", v);
    }
    /** Neo focus arrived/left — give or take the platform caret (Layer 2 hook,
     *  separate from the author's onFocus/onBlur). */
    focusChanged(focused) {
        this.surface?.activateEditable(focused);
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
    // commitOn / error / valid / dirty are declared on the Editor base.
});
//# sourceMappingURL=text-input.js.map