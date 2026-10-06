import type { Program, Element, Attr, AttrDecl } from "./parser.js";
import type { Pos } from "./errors.js";
import { type ClassSchema } from "./schema.js";
import type { AttrType } from "./value.js";
/** What a routing records. `all`: every attribute and declaration carries its
 *  slot's type — the program's literals are still as written, and each coerces
 *  by it. `ship`: only where the runtime still needs the type once the compile
 *  has turned the literals into values (lower-literals.ts) — a data read, a
 *  two-way binding, a literal that stayed as written. */
export type RouteMode = "all" | "ship";
/** One program's schemas, and the answers drawn from them. */
export interface Router {
    readonly schemas: Readonly<Record<string, ClassSchema>>;
    /** The effective schema of an element: its class plus its inline declarations. */
    effOf(tag: string, decls: readonly AttrDecl[]): ClassSchema | null;
    /** Route `el` and everything beneath it in place. `owner` is the effective
     *  schema of the node that holds it — what a State's overrides target. */
    routeElement(el: Element, owner: ClassSchema | null): void;
    /** Route a class body in place, against the class's own schema. */
    routeClass(name: string, body: Element): void;
    /** The declared type of `cls.name`, or null. */
    attrTypeOf(cls: string, name: string): AttrType | null;
    /** The declared type of `name` in an effective schema, or null. */
    typeIn(eff: ClassSchema, name: string): AttrType | null;
    readOnlyOf(cls: string, name: string): boolean;
    /** The value a literal provision provides (program-schema.ts provisionValue). */
    provisionValue(attr: Attr): unknown;
}
/** Build the router for `program`. A program whose classes do not register (a
 *  duplicate name, an `extends` cycle, a class containing itself) throws the
 *  first error — the checker reports them all; instantiation only refuses. */
export declare function makeRouter(program: Program, mode?: RouteMode, unrouted?: Pos[]): Router;
/** Route a whole program in place and stamp it `routed`: every class body, the
 *  tree, and the style bundles (records of Text attributes). Returns the router
 *  and, in `ship` mode, the positions whose wiring the compile could not decide
 *  — a build that has any keeps this module aboard to decide them at run time. */
export declare function routeProgram(program: Program, mode?: RouteMode): {
    router: Router;
    unrouted: Pos[];
};
