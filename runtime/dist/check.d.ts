import type { Element, Attr, Method, Program } from "./parser.js";
import { DeclareError, type Pos } from "./errors.js";
import { type ComponentSchema } from "./schema.js";
import { type AttrValue } from "./value.js";
import { type PathSeg } from "./datapath.js";
export { programSchemas, checkDecl, withDecls, manyPathOf, coerceToken } from "./program-schema.js";
export type { ClassInfo, CheckedDecl } from "./program-schema.js";
/** The styling declarations in scope while an element tree checks: the
 *  program's style bundles (fields validated per application site — a
 *  bundle types against the class it lands on) and its stylesheet names
 *  (`stylesheet = Dark` resolves against these). */
export interface StyleEnv {
    readonly bundles: ReadonlyMap<string, Element>;
    readonly stylesheets: ReadonlySet<string>;
    readonly fonts: ReadonlySet<string>;
    /** (bundle, schema) pairs already validated — one report per pairing. */
    readonly validated: Set<string>;
}
export declare function check(input: Element | Program): DeclareError[];
export declare function checkStyleDecls(program: Program, schemas: Readonly<Record<string, ComponentSchema>>, errors: DeclareError[]): StyleEnv;
/** One class-keyed entry: attribute sets only, each an attribute the class
 *  declares (any public attribute — ruled uniformity), of a stylable kind,
 *  a literal or a `{ }` (evaluated with `this` = the styled view). */
export declare function checkEntry(where: string, entry: Element, schema: ComponentSchema): DeclareError[];
/** The skin's token record: `theme: Theme [ accent = #4F8EF7, radius = 6 ]`
 *  — token names are free (a Theme is schema-less in v1), values are plain
 *  literals or decoration constructors. */
export declare function checkThemeRecord(where: string, rec: Element): DeclareError[];
/** Validate a component-typed attribute's element value (R7: the `layout:`
 *  member). The element must name a component descending from `of`, and carry no
 *  children or methods (a strategy has neither by nature). Attribute values may be
 *  literals OR `{ }` constraints — a layout attribute is reactive like any other
 *  (its setter re-flows: axis re-installs via rearm, spacing is read under
 *  tracking), so a built-in strategy takes `{ }` exactly as a user layout subclass
 *  already does (installLayoutClass). Only a `:path` cursor is refused. One message
 *  source: check() collects these, instantiate() throws the first. */
export declare function checkComponentValue(schemas: Readonly<Record<string, ComponentSchema>>, owner: string, attrName: string, of: string, el: Element): DeclareError[];
/** One checked attribute: a coerced literal value, a `{ }` binding to
 *  install, a `:path` data relationship (R8), or the (unthrown) error. */
export type CheckedAttr = {
    ok: true;
    value: AttrValue;
} | {
    ok: true;
    binding: {
        src: string;
        pos: Pos;
    };
} | {
    ok: true;
    datapath: {
        path: string;
        many: boolean;
        pos: Pos;
        plan?: readonly PathSeg[];
    };
} | {
    ok: false;
    error: DeclareError;
};
/** The CSS-instinct hint for an unknown attribute name, or "" when the miss
 *  isn't a known CSS name. */
export declare function cssAttributeHint(name: string): string;
/** Validate one attribute against a schema. check() collects the errors and
 *  instantiate() throws them — one message source, so the reporting and the
 *  running paths cannot drift apart. */
export declare function checkAttr(schema: ComponentSchema, attr: Attr): CheckedAttr;
/** One checked method member: fine, or the (unthrown) error. */
export type CheckedMethod = {
    ok: true;
} | {
    ok: false;
    error: DeclareError;
};
/** Validate one method member against a schema (R5): its name must be free
 *  (not an attribute's — methods and attributes are one member namespace,
 *  language §4), a handler-shaped name must answer a declared event (the
 *  typo'd-handler compile error §8 promises), a parameter may not shadow
 *  a scope noun, and the body must be valid statement syntax. Like checkAttr,
 *  check() collects these and instantiate() throws them — one message
 *  source. */
export declare function checkMethod(schema: ComponentSchema, m: Method): CheckedMethod;
