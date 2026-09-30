import { type ClassSchema } from "./schema.js";
export declare const RUNTIME_METHODS: Readonly<Record<string, readonly string[]>>;
/** THE RUNTIME FIELD TABLE — the other half of a runtime class's members: the
 *  names an instance carries that are neither methods (above) nor declared
 *  attributes — instance fields (`surface`, `backend`, `parent`) and prototype
 *  accessors. A child may not take one: the runtime refuses it at instantiate
 *  (`'surface' is already a member of the running App`), and the checker, being
 *  runtime-free, refuses it in the source from this table. OWN names per
 *  schema, as above; PINNED by test/override-runtime.test.mjs, which constructs
 *  each class and recomputes the lists (minus `$`-names and attributes). */
export declare const RUNTIME_FIELDS: Readonly<Record<string, readonly string[]>>;
/** The runtime fields a schema's instances carry — its own and every base's up
 *  the schema chain (RUNTIME_FIELDS). By name for a built-in, or by schema
 *  object for any schema, a program class's included. */
export declare function runtimeFieldsOf(schema: string | ClassSchema): ReadonlySet<string>;
/** The runtime methods a schema's instances carry — its own and every base's
 *  up the schema chain, i.e. the whole prototype chain. By NAME for a built-in
 *  (cached; empty for a name that is no schema), or by SCHEMA for any schema
 *  object, a program class's included — it resolves through its bases to the
 *  built-in that implements them. */
export declare function runtimeMethodsOf(schema: string | ClassSchema): ReadonlySet<string>;
