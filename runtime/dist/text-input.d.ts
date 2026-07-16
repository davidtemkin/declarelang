import type { RenderBackend, Surface } from "./backend.js";
import { Editor } from "./editor.js";
export declare class TextInput extends Editor {
    text: string;
    placeholder: string;
    multiline: boolean;
    spellcheck: boolean;
    wrap: boolean;
    padding: number;
    initial: string;
    protected draftSlot(): string;
    attach(backend: RenderBackend, parentSurface: Surface | null): void;
    protected flush(s: Surface): void;
    private editStyle;
    /** Push the whole editable spec across the seam — value, style, callbacks.
     *  Idempotent and cheap; called on any model change (text/placeholder/
     *  multiline pushes, the style derive) and at flush. */
    syncEditable(): void;
    /** The native element's value changed. A writable `text` takes the edit; a
     *  HARD constraint makes text a controlled, read-only field — revert the
     *  element to the model. A YIELDING default (a `{ }` the field merely STARTS
     *  from — a theme value, a pristine source) is overridable: the edit disposes
     *  it, exactly like any author write (attributes.ts set path), so a field can
     *  be seeded from a binding yet stay editable. */
    private onNativeInput;
    /** Declare focus arrived/left — give or take the platform caret (Layer 2 hook,
     *  separate from the author's onFocus/onBlur). */
    focusChanged(focused: boolean): void;
}
