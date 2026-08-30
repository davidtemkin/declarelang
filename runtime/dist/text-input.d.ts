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
    focused: boolean;
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
     *  separate from the author's onFocus/onBlur). A held select() applies HERE,
     *  after activation — so Tab and programmatic focus land where the program
     *  said. A pointer CLICK is the exception, by the platform's own ordering:
     *  the browser places the click's caret at mouseup, after focus handlers —
     *  and that is the right ranking, because a deliberate click names a spot. */
    focusChanged(focused: boolean): void;
    /** Place the caret or select a range (#22) — the write half of the native
     *  selection, one verb: a caret IS a zero-length range. `select(7)` puts the
     *  caret at 7; `select(3, 9)` selects the range; the word forms need no
     *  lengths — `select("start")`, `select("end")`, `select("all")`. Numbers
     *  clamp to the text, like every scroll write. Applied now if the field
     *  holds focus; otherwise HELD and applied at the next non-pointer focus
     *  (Tab, or a program's), re-resolved against the text of that moment — a
     *  click into the field keeps the clicked caret. */
    select(at: number | "start" | "end" | "all", end?: number): void;
    private pendingSel;
    private applySelection;
}
