import type { ShapeField } from "./parser.js";
export type { ShapeField } from "./parser.js";
import type { DataShape } from "./shape-resolve.js";
/** Validate a whole DOCUMENT against a dataset's shape — the one entry both
 *  arrival and the embedded body use. A record document is the familiar
 *  field-list walk; an array-root document (`schema = Task[]`) validates
 *  each element against the record shape. */
export declare function validateDoc(value: unknown, shape: DataShape): string | null;
/** Validate a VALUE destined for the slot one field declares — the VERB-side
 *  boundary (typed data): `set`/`insert` hold a write to the shape at its
 *  target, refused at the write rather than three bindings later. `element`
 *  means the value is one ELEMENT of an array field (an insert, or a write
 *  through an index). */
export declare function fieldValueError(f: ShapeField, v: unknown, element?: boolean): string | null;
/** Validate `value` against a record shape. Returns the FIRST mismatch as a
 *  pointed message (path + expectation + what arrived), or null when the
 *  value conforms. */
export declare function validateShape(value: unknown, fields: readonly ShapeField[], at?: (string | number)[]): string | null;
