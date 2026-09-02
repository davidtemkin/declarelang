// The data-shape validator (B4, language §9's optional `schema` — designed
// in the parked weather sketch, built 2026-07-30). Three jobs, all downstream
// of ONE parsed shape (parser.ts ShapeField):
//
//   1. validate-on-receipt — a DataSource response (or an embedded Dataset
//      body) either matches the shape or lands in `.failed`/`.error` (or a
//      build error) with a POINTED path, never `undefined` three layers into
//      a binding;
//   2. that's it — identity is NOT a schema concern (ruled 2026-07-30, the
//      invisible version): a record's `id` field is its identity by
//      convention, inferred by the reconciler; `key = :field` overrides an
//      unconventional name; the compiler's static `:path` walker lives
//      compile-side with its errors.
//
// Validation is deliberately PERMISSIVE about extras: a shape declares what
// the program RELIES on; keys the shape doesn't mention pass untouched (the
// data you actually get is ragged — the capstone brief's own words). An
// `optional` field may be absent or null; a required one must be present and
// typed. Errors speak RFC 6901 pointer paths (the B2 diagnostics discipline).
//
// Production builds without a schema stub this module out wholesale
// (declarec `slim-dataschema` — the same lever as `slim-select`), so the
// cost is pay-per-use.

import type { ShapeField } from "./parser.js";
export type { ShapeField } from "./parser.js";
import type { DataShape } from "./shape-resolve.js";
import { isArrayDoc } from "./shape-resolve.js";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const showPtr = (segs: readonly (string | number)[]): string =>
  "/" + segs.map((t) => String(t).replace(/~/g, "~0").replace(/\//g, "~1")).join("/");

function typeOk(type: "string" | "number" | "boolean" | "any", v: unknown): boolean {
  if (type === "any") return v !== undefined;
  return typeof v === type;
}

/** A field's scalar expectation. A literal union (`status: "open" |
 *  "closed"`, `col: 0 | 1 | 2`) checks by MEMBERSHIP — which implies the
 *  type, so it is the whole check. */
function fieldOk(f: ShapeField, v: unknown): boolean {
  if (f.tokens !== undefined) return f.tokens.includes(v as string | number);
  return typeOk(f.type!, v);
}

const expectation = (f: ShapeField): string =>
  f.tokens !== undefined ? f.tokens.map((t) => JSON.stringify(t)).join(" | ") : (f.type ?? "a structure");

/** Validate a whole DOCUMENT against a dataset's shape — the one entry both
 *  arrival and the embedded body use. A record document is the familiar
 *  field-list walk; an array-root document (`schema = Task[]`) validates
 *  each element against the record shape. */
export function validateDoc(value: unknown, shape: DataShape): string | null {
  if (!isArrayDoc(shape)) return validateShape(value, shape);
  if (!Array.isArray(value)) {
    return `/ — the schema declares the document is an ARRAY of records, got ${describe(value)}`;
  }
  for (let i = 0; i < value.length; i++) {
    const err = validateShape(value[i], shape.fields, [i]);
    if (err !== null) return err;
  }
  return null;
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "an array";
  return typeof v === "object" ? "an object" : typeof v;
}

/** Validate a VALUE destined for the slot one field declares — the VERB-side
 *  boundary (typed data): `set`/`insert` hold a write to the shape at its
 *  target, refused at the write rather than three bindings later. `element`
 *  means the value is one ELEMENT of an array field (an insert, or a write
 *  through an index). */
export function fieldValueError(f: ShapeField, v: unknown, element = false): string | null {
  if (f.array && !element) {
    if (!Array.isArray(v)) return `the schema declares '${f.name}[]' (an array), got ${describe(v)}`;
    for (let i = 0; i < v.length; i++) {
      const err = fieldValueError(f, v[i], true);
      if (err !== null) return `[${i}]: ${err}`;
    }
    return null;
  }
  if (v === null || v === undefined) {
    return f.optional ? null : `the schema requires ${f.fields !== undefined ? "a record" : expectation(f)} at '${f.name}' (mark it '${f.name}?' if it may be absent)`;
  }
  if (f.fields !== undefined) return validateShape(v, f.fields);
  return fieldOk(f, v) ? null : `expected ${expectation(f)}, got ${describe(v)}`;
}

/** Validate `value` against a record shape. Returns the FIRST mismatch as a
 *  pointed message (path + expectation + what arrived), or null when the
 *  value conforms. */
export function validateShape(value: unknown, fields: readonly ShapeField[], at: (string | number)[] = []): string | null {
  if (!isObj(value)) {
    return `${showPtr(at) || "/"} — expected an object with ${fields.map((f) => f.name).join(", ")}, got ${describe(value)}`;
  }
  for (const f of fields) {
    const v = value[f.name];
    const here = [...at, f.name];
    if (v === undefined || v === null) {
      if (f.optional) continue;
      return `${showPtr(here)} is ${v === null ? "null" : "missing"} — the schema requires ${f.array ? "an array" : expectation(f)} (mark it '${f.name}?' if it may be absent)`;
    }
    if (f.array) {
      if (!Array.isArray(v)) {
        return `${showPtr(here)} — the schema declares '${f.name}[]' (an array), got ${describe(v)}`;
      }
      for (let i = 0; i < v.length; i++) {
        const el = v[i];
        if (f.fields !== undefined) {
          const err = validateShape(el, f.fields, [...here, i]);
          if (err !== null) return err;
        } else if (!fieldOk(f, el)) {
          return `${showPtr([...here, i])} — expected ${expectation(f)}, got ${describe(el)}`;
        }
      }
      continue;
    }
    if (f.fields !== undefined) {
      const err = validateShape(v, f.fields, here);
      if (err !== null) return err;
      continue;
    }
    if (!fieldOk(f, v)) {
      return `${showPtr(here)} — expected ${expectation(f)}, got ${describe(v)}`;
    }
  }
  return null;
}
