import { View } from "./view.js";
import type { RenderBackend, Surface } from "./backend.js";
import { type FontWeight } from "./measure.js";
import { type FamilyValue } from "./font-value.js";
import { type Color, type Inset } from "./value.js";
import { type Purpose } from "./purpose.js";
export declare class TextInput extends View {
    textColor: Color;
    fontSize: number;
    /** A family string, a Font, or a list of them. */
    fontFamily: FamilyValue;
    fontWeight: FontWeight;
    letterSpacing: number;
    selectable: boolean;
    text: string;
    placeholder: string;
    multiline: boolean;
    enterSubmits: boolean;
    /** The native selection, read-only: where it starts and ends (equal for a
     *  bare caret). Reported by the backend as the user moves it; `select()` is
     *  the write half. */
    selectionStart: number;
    selectionEnd: number;
    spellcheck: boolean;
    /** What the field holds — an email, a password, a card number (purpose.ts). */
    purpose: Purpose;
    /** What is typed is hidden; a password's purpose sets it. */
    concealed: boolean;
    wrap: boolean;
    padding: Inset;
    initial: string;
    /** Inert: not focusable, takes no edits, and says so to assistive technology. */
    disabled: boolean;
    /** "input" (live) | "blur" | "enter" | "manual" — when a valid draft commits. */
    commitOn: string;
    /** "leave" (the default) | "edit" — when `error` first says what is wrong:
     *  once the field has been left (or judged), or at every edit. `problem`
     *  and `valid` are true to the draft either way. */
    judgeOn: string;
    /** What is wrong with the value now, "" when nothing is: the refusal, then
     *  `required`, then `validate`, then the schema floor (reactive). */
    problem: string;
    /** `problem` once judged — the default display rule (reactive). */
    error: string;
    /** Is `problem` empty? (reactive) */
    valid: boolean;
    /** Has the field been judged: left, `judge()`d, or submitted with its form. Writable. */
    judged: boolean;
    /** The field's address in its form: the key a service names it by. */
    name: string;
    /** `true`, or the message to say, when the field may not be left empty. */
    required: boolean | string;
    /** An outside message about the value — a service's refusal. It counts while
     *  the value is the one refused. */
    refused: string;
    /** The form this field belongs to: the nearest `Form` above, unless set. */
    form: View | null;
    /** The value `refused` was said of (captured when it is written). */
    $refusedValue: unknown;
    /** Does the draft differ from the committed value? (reactive) */
    dirty: boolean;
    /** The field's element holds what is typed, the selection and focus. */
    protected $eagerSurface(): boolean;
    /** @api Commit the current draft into the bound dataset field, if it
     *  validates — for a `commitOn = "manual"` field or a Save button. */
    commit(): void;
    /** @api Discard edits — reset the field to the committed dataset value. */
    revert(): void;
    /** @api Say what is wrong with the draft now, without waiting for the field
     *  to be left — for a Save or a Pay that checks every field. */
    judge(): void;
    /** @api Say an outside message about the current value — a service's
     *  refusal. It is the field's `problem` until the value changes; `""`
     *  withdraws it. A form's `refuse` lays a service's problems this way. */
    refuse(message: string): void;
    /** Install the judging derives — `problem`, `valid`, `error` — once: at
     *  attach, or on the first edit-session refresh of a field never attached. */
    $judging(): void;
    private $judges;
    /** What is wrong with the value now — the one rule `problem` derives. */
    private $problem;
    $attach(backend: RenderBackend, parentSurface: Surface | null, before?: Surface | null): void;
    protected $flush(s: Surface): void;
    private $editStyle;
    /** Push the whole editable spec across the seam — value, style, callbacks.
     *  Idempotent and cheap; called on any model change (text/placeholder/
     *  multiline pushes, the style derive) and at flush. */
    $syncEditable(): void;
    /** The native element's value changed. A writable `text` takes the edit; a
     *  HARD constraint makes text a controlled, read-only field — revert the
     *  element to the model. A YIELDING default (a `{ }` the field merely STARTS
     *  from — a theme value, a pristine source) is overridable: the edit disposes
     *  it, exactly like any author write (attributes.ts set path), so a field can
     *  be seeded from a binding yet stay editable. */
    private $onNativeInput;
    /** An input handler is running: a select() it makes waits until the field
     *  holds the text the handler produced, so the caret lands in that text. */
    private $inInput;
    /** The field's text folds into `contentHeight` as its measured lines (the
     *  same measure as the unset-height derive), so the documented cap reads as
     *  it does for any box: `height = { Math.min(contentHeight, 120) }` — a
     *  multi-line field that grows with its text, then scrolls. */
    protected $contentExtent(size: "width" | "height"): number;
    /** Declare focus arrived/left — give or take the platform caret (Layer 2 hook,
     *  separate from the author's onFocus/onBlur). A held select() applies HERE,
     *  after activation — so Tab and programmatic focus land where the program
     *  said. A pointer CLICK is the exception, by the platform's own ordering:
     *  the browser places the click's caret at mouseup, after focus handlers —
     *  and that is the right ranking, because a deliberate click names a spot. */
    $focusChanged(focused: boolean): void;
    /** Place the caret or select a range (#22) — the write half of the native
     *  selection, one verb: a caret IS a zero-length range. `select(7)` puts the
     *  caret at 7; `select(3, 9)` selects the range; the word forms need no
     *  lengths — `select("start")`, `select("end")`, `select("all")`. Numbers
     *  clamp to the text, like every scroll write. Applied now if the field
     *  holds focus; otherwise HELD and applied at the next non-pointer focus
     *  (Tab, or a program's), re-resolved against the text of that moment — a
     *  click into the field keeps the clicked caret. Called from an input
     *  handler, it applies once the field shows the text the handler wrote. */
    select(at: number | "start" | "end" | "all", end?: number): void;
    private pendingSel;
    private $applySelection;
}
