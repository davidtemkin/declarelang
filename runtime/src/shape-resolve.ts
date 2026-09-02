// Schema resolution (typed data, 2026-09-01 — the "schema is a type" ruling):
// a top-level `schema Name [ … ]` declares a NAMED data shape in the one type
// system — the proper subset of TypeScript that can be checked against data
// while the program runs. This pass, run at the front of check() and
// instantiate() (idempotent — both may run on one Program object), does the
// name work the parser deliberately left open:
//
//   1. builds the name table and refuses collisions — schema/schema within a
//      file (includes fold cross-file), and schema-vs-class / schema-vs-
//      built-in, because there is ONE namespace of type names;
//   2. resolves every `ref` field (`owner: Person`) to its schema's fields —
//      BY REFERENCE, so recursive shapes (a tree of Persons) cost nothing and
//      terminate: validation walks the data's depth, not the type's;
//   3. rewrites the named `schema =` attribute forms — `schema = TaskDoc`
//      (a record document) and `schema = Task[]` (a bare-array document) —
//      into resolved shape literals, so everything downstream (coercion,
//      validation, the static :path walk, the scaffold's projection) sees
//      ONE representation.
//
// The compiler projects the same declarations as ambient TS interfaces
// (scaffold.ts), which is what makes `Task` a real type name in every { }
// body and method signature — one declaration, both halves of the toolchain.

import type { Program, SchemaDecl, ShapeField, Element, ClassDecl } from "./parser.js";
import { DeclareError } from "./errors.js";
import { SCHEMAS } from "./schema.js";
import { declaredType } from "./value.js";

/** A resolved document shape as stored on a Dataset's `schema` slot: the
 *  familiar field list for a record document, or the array-root wrapper for
 *  `schema = Task[]`. */
export interface ArrayDocShape {
  readonly arrayRoot: true;
  readonly fields: readonly ShapeField[];
}
export type DataShape = readonly ShapeField[] | ArrayDocShape;

export const isArrayDoc = (s: DataShape): s is ArrayDocShape =>
  !Array.isArray(s) && (s as ArrayDocShape).arrayRoot === true;

/** Resolve a program's schema declarations in place. Idempotent. Returns the
 *  errors (check() reports them; instantiate() resolves for behavior and
 *  leaves reporting to the checker). */
export function resolveShapes(program: Program): { table: ReadonlyMap<string, SchemaDecl>; errors: DeclareError[] } {
  const errors: DeclareError[] = [];
  const table = new Map<string, SchemaDecl>();
  const classNames = new Set(program.classes.map((c: ClassDecl) => c.name));
  for (const s of program.shapes ?? []) {
    if (table.has(s.name)) {
      errors.push(new DeclareError(`schema '${s.name}' is declared twice`, s.pos));
      continue;
    }
    if (classNames.has(s.name) || Object.hasOwn(SCHEMAS, s.name)) {
      errors.push(new DeclareError(
        `'${s.name}' is already a component — schemas and classes share one namespace of type names; rename the schema`, s.pos));
      continue;
    }
    if (declaredType(s.name) !== null) {
      errors.push(new DeclareError(`'${s.name}' is a built-in type name — rename the schema`, s.pos));
      continue;
    }
    table.set(s.name, s);
  }

  // Resolve refs inside the declarations themselves (recursion terminates:
  // fields are shared by reference, never expanded).
  const resolveFields = (fields: ShapeField[]): void => {
    for (const f of fields) {
      if (f.ref !== undefined) {
        const target = table.get(f.ref);
        if (target === undefined) {
          errors.push(new DeclareError(
            `'${f.name}: ${f.ref}' names no schema — ${table.size > 0 ? `declared schemas: ${[...table.keys()].join(", ")}` : "no schemas are declared"} (a field's type is string | number | boolean | any, a schema name, a literal union, or a nested [ … ])`,
            f.refPos ?? undefined));
        } else if (f.fields === undefined) {
          f.fields = target.fields;
        }
      } else if (f.fields !== undefined) {
        resolveFields(f.fields);
      }
    }
  };
  for (const s of table.values()) resolveFields(s.fields);

  // Rewrite the named `schema =` forms and resolve refs in inline literals,
  // across the root and every class body.
  const visitAttrs = (el: Element): void => {
    for (const a of el.attrs) {
      if (a.value.kind === "schema") {
        resolveFields(a.value.shape);
        continue;
      }
      if (a.name !== "schema" || a.value.kind !== "ident" || a.value.name === "null") continue;
      const written = a.value.name;
      const arrayRoot = written.endsWith("[]");
      const name = arrayRoot ? written.slice(0, -2) : written;
      const target = table.get(name);
      if (target === undefined) {
        errors.push(new DeclareError(
          `schema = ${written}: '${name}' names no schema — ${table.size > 0 ? `declared schemas: ${[...table.keys()].join(", ")}` : "declare one with 'schema Name [ … ]', or write the shape inline: schema = [ field: type, … ]"}`,
          a.value.pos));
        continue;
      }
      a.value = { kind: "schema", shape: target.fields, pos: a.value.pos, refName: name, ...(arrayRoot ? { arrayRoot: true } : {}) };
    }
    for (const c of el.children) visitAttrs(c);
  };
  visitAttrs(program.root);
  for (const c of program.classes) visitAttrs(c.body);

  return { table, errors };
}

/** The shape-name set for type-position resolution (decls, signatures). */
export function shapeNames(program: Program): ReadonlySet<string> {
  return new Set((program.shapes ?? []).map((s) => s.name));
}
