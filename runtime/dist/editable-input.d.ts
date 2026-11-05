import type { EditableSpec } from "./backend.js";
type Field = HTMLInputElement | HTMLTextAreaElement;
/** Replace the text with `next`, changing only the range that differs, through the
 *  browser's editing command so it is one undoable step; the caret goes after what
 *  was inserted. Falls back to a plain write (not undoable) where the command is
 *  unavailable. */
export declare function applyEditableText(el: Field, next: string): void;
/** Write the model's text into the element: only when it differs, never while the
 *  person is composing, keeping the caret's distance from the end of the text. */
export declare function setEditableValue(el: Field, value: string): void;
/** Wire the element's editing events to the spec the getter returns. The spec's
 *  `onInput(value, checked)` hears every change once it has landed: `checked` when
 *  `admit` already saw it, false when it couldn't (the field then judges it). */
export declare function wireEditableInput(el: Field, spec: () => EditableSpec | null): void;
export {};
