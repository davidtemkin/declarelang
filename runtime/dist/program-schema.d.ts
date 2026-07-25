import type { Element, Attr, AttrDecl, ClassDecl, Literal } from "./parser.js";
import { DeclareError, type Pos } from "./errors.js";
import { type ComponentSchema } from "./schema.js";
import { type AttrType, type AttrValue } from "./value.js";
/** The scope nouns of language §11 — never legal as member or parameter names.
 *  `app` is the running-App noun (compiles to `this.root`); reserving it here
 *  keeps it un-shadowable, so `app.hostWidth` always means the App. */
export declare const NOUNS: string[];
/** The value-constructor names (styling rung) are reserved as member names:
 *  in call position a body's `gradient(…)` is always the constructor, so a
 *  member wearing the name would be unreachable there. (`fill`/`stroke`/
 *  `shadow` are already View attributes — the ordinary collision rules cover
 *  them; this catches the two that are not.) */
export declare const RESERVED: readonly string[];
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
    errors: DeclareError[];
};
/** Coerce a theme-record token to its runtime value (checkThemeRecord vetted
 *  the shapes): numbers and strings pass through, hex/named colors ground as
 *  Color, `true`/`false`/`null` as themselves, and a constructor call as the
 *  first of fill/stroke/shadow that admits it. */
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
    error: DeclareError;
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
