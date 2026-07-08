import { View } from "./view.js";
import type { RenderBackend, Surface } from "./backend.js";
export declare class TextInput extends View {
    text: string;
    placeholder: string;
    multiline: boolean;
    attach(backend: RenderBackend, parentSurface: Surface | null): void;
    protected flush(s: Surface): void;
    private editStyle;
    /** Push the whole editable spec across the seam — value, style, callbacks.
     *  Idempotent and cheap; called on any model change (text/placeholder/
     *  multiline pushes, the style derive) and at flush. */
    syncEditable(): void;
    /** The native element's value changed. A writable `text` takes the edit (the
     *  push re-syncs, guarded against a caret reset); a constraint-owned `text`
     *  is controlled — revert the element to the model value. */
    private onNativeInput;
    /** Neo focus arrived/left — give or take the platform caret (Layer 2 hook,
     *  separate from the author's onFocus/onBlur). */
    focusChanged(focused: boolean): void;
}
