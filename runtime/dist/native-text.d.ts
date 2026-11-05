import { View } from "./view.js";
import { Node } from "./node.js";
import type { Surface } from "./backend.js";
import { type TextStyle, type FontWeight } from "./measure.js";
import { type FamilyValue } from "./font-value.js";
import { type Color } from "./value.js";
import { type Purpose } from "./purpose.js";
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
export declare class NativeText extends Node {
    textColor: Color;
    fontSize: number;
    fontFamily: FamilyValue;
    fontWeight: FontWeight;
    letterSpacing: number;
    /** What the field shows: the field's to constrain (`text = { classroot.shown }`). */
    text: string;
    placeholder: string;
    multiline: boolean;
    wrap: boolean;
    enterSubmits: boolean;
    spellcheck: boolean;
    purpose: Purpose;
    concealed: boolean;
    numeralWidth: NumeralWidth;
    textAlign: "start" | "center" | "end" | "left" | "right";
    italic: boolean;
    /** The native selection, read-only: reported as the person moves it. */
    selectionStart: number;
    selectionEnd: number;
    /** The text's own height in the field: its lines at the field's face (no padding). */
    textHeight: number;
    /** The view this node makes a field of, once it attaches. */
    $field: Field | null;
    /** Place the caret or select a range — `select(7)`, `select(3, 9)`, `select("all")`.
     *  Applied at once when the field holds focus; otherwise held for the next
     *  non-pointer focus (Tab, or a program's). */
    select(at: number | "start" | "end" | "all", end?: number): void;
    $pendingSel: {
        at: number | "start" | "end" | "all";
        end?: number;
    } | null;
    $inInput: boolean;
    /** `len`: the text's length — inside a change being reported, the text that
     *  just landed, which `text` (constrained by the field) shows only at the
     *  next settle. */
    $applySelection(len?: number): void;
    $editStyle(): TextStyle;
    /** The text's lines at the field's face, padding excluded — the field's natural
     *  height is this plus its padding. */
    $lines(): number;
    /** Push the whole editable spec across the seam — value, style, callbacks. */
    $sync(): void;
    /** A change has landed. Judged now if `admit` couldn't see it beforehand (a
     *  composition, autofill, undo): refused, the last admitted text goes back;
     *  rewritten, the rewrite is applied — each as an undoable edit, which lands
     *  checked. Then the field hears it. */
    $onNativeInput(v: string, checked: boolean): void;
    /** The last text the field took: what a change refused after it landed returns to. */
    $admitted: string;
}
/** The controller a field view carries (View.$native): what the view's own hooks
 *  ask — an eager surface, the native caret on focus, the text's extent. */
export interface NativeHost {
    node: NativeText;
    flushed(s: Surface): void;
    focusChanged(focused: boolean): void;
    contentExtent(size: "width" | "height"): number;
}
export {};
