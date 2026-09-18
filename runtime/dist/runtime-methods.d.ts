import { type ComponentSchema } from "./schema.js";
export declare const RUNTIME_METHODS: Readonly<Record<string, readonly string[]>>;
/** The runtime methods a schema's instances carry — its own and every base's
 *  up the schema chain, i.e. the whole prototype chain. By NAME for a built-in
 *  (cached; empty for a name that is no schema), or by SCHEMA for any schema
 *  object, a program class's included — it resolves through its bases to the
 *  built-in that implements them. */
export declare function runtimeMethodsOf(schema: string | ComponentSchema): ReadonlySet<string>;
