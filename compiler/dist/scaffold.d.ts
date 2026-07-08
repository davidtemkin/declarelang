import type { ComponentSchema } from "../../runtime/dist/schema.js";
import type { AttrType } from "../../runtime/dist/value.js";
import type { ClassDecl } from "../../runtime/dist/parser.js";
/** One AttrType (value.ts) → its TypeScript type, mirroring the value model.
 *  Enum and record arms reference a NAMED type (`type Stretch = …`, `Theme`)
 *  emitted in the prelude / near-use; component references the peer
 *  `declare class`. The nullable decoration slots (stroke/shadow) and the two
 *  styling channels carry their `| null` here, matching what coercion admits. */
export declare function tsType(t: AttrType): string;
/** Generate the scaffold for a program: the fixed prelude, the enum type
 *  aliases every schema references, and one `declare class` per schema (built-in
 *  + user), base-before-derived. Pure — the returned STRING is the whole
 *  product. `schemas` is `programSchemas(program.classes).schemas`; `classDecls`
 *  is `program.classes` (their methods). */
export declare function generateScaffold(schemas: Readonly<Record<string, ComponentSchema>>, classDecls: readonly ClassDecl[]): string;
