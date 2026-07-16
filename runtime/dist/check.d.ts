import type { Element, Attr, Method, AttrDecl, ClassDecl, Program, Literal } from "./parser.js";
import { NeoError, type Pos } from "./errors.js";
import { type ComponentSchema } from "./schema.js";
import { type AttrType, type AttrValue } from "./value.js";
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
/** Typecheck a parsed tree — a whole Program (classes + root) or a bare
 *  Element fragment. Returns every error found, in source order — an empty
 *  array means the tree is well-typed and safe to instantiate. */
export declare function check(input: Element | Program): NeoError[];
/** One registered user class: its declaration, its schema, and its declared
 *  attributes' coerced defaults (undefined = "no default; starts undefined
 *  until set"). instantiate.ts synthesizes the runtime twin from this. */
export interface ClassInfo {
    decl: ClassDecl;
    schema: ComponentSchema;
    defaults: Record<string, AttrValue | undefined>;
}
/** Register a program's classes: validate each declaration and produce the
 *  program's schema table — the built-ins plus one ComponentSchema per class,
 *  chained to its base exactly like the built-ins chain (the R2 "R6 plug-in
 *  shape", now plugged in). Per-PROGRAM on purpose: the global SCHEMAS stays
 *  built-ins only, so two programs' classes can never collide.
 *
 *  A base must be declared above its subclass (or be a built-in); children
 *  inside bodies may reference classes declared later — declaration order
 *  constrains inheritance, not composition. A class that (transitively)
 *  contains itself is an error here: it could never finish instantiating. */
export declare function programSchemas(classes: readonly ClassDecl[]): {
    infos: ClassInfo[];
    schemas: Record<string, ComponentSchema>;
    errors: NeoError[];
};
/** Validate a program's `stylesheet`/`style` declarations and produce the
 *  StyleEnv the element walk resolves against. One message source with
 *  instantiate: both consume the same helpers (checkAttr, coerceToken via
 *  checkThemeRecord/checkEntry), so a direct instantiate of an unchecked
 *  tree dies with the same wording. */
export declare function checkStyleDecls(program: Program, schemas: Readonly<Record<string, ComponentSchema>>, errors: NeoError[]): StyleEnv;
/** One class-keyed entry: attribute sets only, each an attribute the class
 *  declares (any public attribute — ruled uniformity), of a stylable kind,
 *  a literal or a `{ }` (evaluated with `this` = the styled view). */
export declare function checkEntry(where: string, entry: Element, schema: ComponentSchema): NeoError[];
/** The skin's token record: `theme: Theme [ accent = #4F8EF7, radius = 6 ]`
 *  — token names are free (a Theme is schema-less in v1), values are plain
 *  literals or decoration constructors. */
export declare function checkThemeRecord(where: string, rec: Element): NeoError[];
/** A theme token's value, or undefined when the literal isn't token-shaped.
 *  Colors coerce through the Color grammar (alpha forms included); the
 *  decoration constructors coerce through their own slots' grammars. */
export declare function coerceToken(lit: Literal): unknown;
/** One checked attribute declaration: its resolved type and coerced default
 *  — or, since the styling rung, a default BINDING (`labelColor: Color =
 *  { theme.buttonText }`, the ruled R6 unlock: a live per-instance fallback
 *  below every provision) — or the (unthrown) error. Shared by class
 *  registration and by inline declarations on instances — one message
 *  source, like checkAttr. */
export type CheckedDecl = {
    ok: true;
    type: AttrType;
    value: AttrValue | undefined;
    binding?: {
        src: string;
        pos: Pos;
    };
} | {
    ok: false;
    error: NeoError;
};
export declare function checkDecl(schema: ComponentSchema, d: AttrDecl, owner?: string): CheckedDecl;
/** An element's schema plus its inline declarations — the anonymous one-off
 *  subclass of language §5, in the checker's currency. Validation of the
 *  decls themselves is the caller's (checkDecl); this only shapes the chain. */
export declare function withDecls(schema: ComponentSchema, decls: readonly AttrDecl[]): ComponentSchema;
/** The many-path attribute (`datapath = :items[]`) that makes an element a
 *  replication template, or null. Type-directed: a many-path on a
 *  cursor-typed slot — today, View.datapath — is what replicates. */
export declare function manyPathOf(el: Element, schemas: Readonly<Record<string, ComponentSchema>>): Attr | null;
/** Validate a component-typed attribute's element value (R7: the `layout:`
 *  member). The element must name a component descending from `of`, and —
 *  this rung — carry literal attributes only: a strategy has no children or
 *  methods by nature, and `{ }`-driven layout attributes are a recorded open
 *  question. One message source: check() collects these, instantiate()
 *  throws the first. */
export declare function checkComponentValue(schemas: Readonly<Record<string, ComponentSchema>>, owner: string, attrName: string, of: string, el: Element): NeoError[];
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
    };
} | {
    ok: false;
    error: NeoError;
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
    error: NeoError;
};
/** Validate one method member against a schema (R5): its name must be free
 *  (not an attribute's — methods and attributes are one member namespace,
 *  language §4), a handler-shaped name must answer a declared event (the
 *  typo'd-handler compile error §8 promises), a parameter may not shadow
 *  a scope noun, and the body must be valid statement syntax. Like checkAttr,
 *  check() collects these and instantiate() throws them — one message
 *  source. */
export declare function checkMethod(schema: ComponentSchema, m: Method): CheckedMethod;
