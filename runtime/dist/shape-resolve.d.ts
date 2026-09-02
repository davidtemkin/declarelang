import type { Program, SchemaDecl, ShapeField } from "./parser.js";
import { DeclareError } from "./errors.js";
/** A resolved document shape as stored on a Dataset's `schema` slot: the
 *  familiar field list for a record document, or the array-root wrapper for
 *  `schema = Task[]`. */
export interface ArrayDocShape {
    readonly arrayRoot: true;
    readonly fields: readonly ShapeField[];
}
export type DataShape = readonly ShapeField[] | ArrayDocShape;
export declare const isArrayDoc: (s: DataShape) => s is ArrayDocShape;
/** Resolve a program's schema declarations in place. Idempotent. Returns the
 *  errors (check() reports them; instantiate() resolves for behavior and
 *  leaves reporting to the checker). */
export declare function resolveShapes(program: Program): {
    table: ReadonlyMap<string, SchemaDecl>;
    errors: DeclareError[];
};
/** The shape-name set for type-position resolution (decls, signatures). */
export declare function shapeNames(program: Program): ReadonlySet<string>;
