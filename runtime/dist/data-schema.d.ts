import type { ShapeField } from "./parser.js";
export type { ShapeField } from "./parser.js";
/** Validate `value` against a record shape. Returns the FIRST mismatch as a
 *  pointed message (path + expectation + what arrived), or null when the
 *  value conforms. */
export declare function validateShape(value: unknown, fields: readonly ShapeField[], at?: (string | number)[]): string | null;
