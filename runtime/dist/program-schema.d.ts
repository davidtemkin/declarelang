import type { Element, Attr, AttrDecl, ClassDecl } from "./parser.js";
import { DeclareError, type Pos } from "./errors.js";
import { type ClassSchema } from "./schema.js";
import { coerceToken, type AttrType, type AttrValue } from "./value.js";
export { coerceToken };
/** The scope nouns of language §11 — never legal as member or parameter names.
 *  `app` is the running-App noun (compiles to `this.root`); reserving it here
 *  keeps it un-shadowable, so `app.hostWidth` always means the App. */
export declare const NOUNS: string[];
/** The value-constructor names are reserved as member names:
 *  in call position a body's `gradient(…)` is always the constructor, so a
 *  member wearing the name would be unreachable there. (`fill`/`stroke`/
 *  `shadow` are already View attributes — the ordinary collision rules cover
 *  them; this catches the two that are not.) */
export declare const RESERVED: readonly string[];
/** The other two node references the scaffold declares on every View, beside the
 *  §11 nouns above (scaffold.ts groups all four: parent / classroot / root /
 *  children). They are NOT scope nouns — §11 lists four and neither of these is
 *  one; `root` is the under-the-hood spelling `app` compiles to, and `children`
 *  is Node's own child list. But neither is a schema attribute either, so the
 *  ordinary "a child may not take an attribute's name" rules miss them, and
 *  shadowing one breaks code that never mentions it.
 *
 *  `root` is the sharp case. Because `app` compiles to `this.root`, a member
 *  named `root` makes every `{ app.… }` in the SAME class resolve `app` against
 *  the shadow — so the failure surfaces as "'k' is not a member of View" at the
 *  binding's line, blaming an app attribute several lines from the name that
 *  actually took the reference. Caught here so the report names the cause.
 *  (The runtime already refuses these at instantiate; that check stands, but it
 *  fires at boot, after typecheck has had its misleading say.) */
export declare const STRUCTURAL: Readonly<Record<string, string>>;
/** The reason a name is structural, or null if it is free to use. */
export declare function structuralReason(name: string): string | null;
/** One registered user class: its declaration, its schema, and its declared
 *  attributes' coerced defaults (undefined = "no default; starts undefined
 *  until set"). */
export interface ClassInfo {
    decl: ClassDecl;
    schema: ClassSchema;
    defaults: Record<string, AttrValue | undefined>;
}
/** Register a program's classes: validate each declaration and produce the
 *  program's schema table — the built-ins plus one ClassSchema per class,
 *  chained to its base exactly like the built-ins chain (the R2 "R6 plug-in
 *  shape", now plugged in). Per-PROGRAM on purpose: the global SCHEMAS stays
 *  built-ins only, so two programs' classes can never collide.
 *
 *  Declaration order constrains NOTHING (ruled 2026-08-06): a base may be
 *  declared anywhere in the program — the build below runs in dependency
 *  order regardless of source order — and children inside bodies were always
 *  order-free. The two unbuildable shapes are loud errors here: an `extends`
 *  cycle (the chain can never bottom out) and a class that (transitively)
 *  contains itself (it could never finish instantiating). */
export declare function programSchemas(classes: readonly ClassDecl[], shapes?: ReadonlySet<string>): {
    infos: ClassInfo[];
    schemas: Record<string, ClassSchema>;
    errors: DeclareError[];
};
/** The value a LITERAL provision provides (`View [ textColor = navy ]`). A
 *  provision has no declared slot on the providing node, but its NAME may match
 *  a text FACE value (`fontFamily`, `fontWeight`, `textColor`, …), and then it
 *  coerces exactly as that slot would — a `fontFamily = ["Georgia", "serif"]`
 *  joins into one family chain, a `fontWeight = normal` keeps the token — so the
 *  reader (`Text`'s `provided("fontFamily")`) gets a well-formed value. A name
 *  no face value claims (`accent`, `density`) coerces by its written form.
 *  Undefined when no form admits the literal. The one context-dependent
 *  provision, a `theme` naming a theme, is the instantiation's (instantiate.ts);
 *  the checker computes every other one here, so the compile can ship it as its
 *  value (compiler/src/lower-literals.ts). */
export declare function provisionValue(attr: Attr): unknown;
/** One checked attribute declaration: its resolved type and coerced default
 *  — or a default BINDING (`labelColor: Color =
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
    type?: AttrType;
};
/** Resolve a WRITTEN type name to its AttrType — the one place that mapping
 *  lives. Two callers need it and MUST agree: checkDecl (which refuses an
 *  unknown type outright) and the typechecker's assignTypes (which emits the
 *  TS member signature). They were separate copies until 2026-09-04, when a
 *  literal union taught to one and not the other fell to assignTypes' `t ===
 *  null` arm, was emitted `readonly … : any`, and made every assignment to it
 *  report "read-only — a fact the class maintains" — a diagnostic blaming
 *  the wrong thing entirely. One function now, so a new type can only be added
 *  once.
 *
 *  A LITERAL UNION (`"idle" | "loading"`) resolves to an ENUM whose tokens are
 *  its members — the same AttrType the built-in vocabularies use, so a write is
 *  checked against the set and the scaffold projects the TS union it already
 *  is. The parser normalizes the spelling (JSON.stringify each member), so the
 *  test here is exact. */
export declare function resolveWrittenType(written: string, isClassName: (n: string) => boolean, isShape: (n: string) => boolean): AttrType | null;
export declare function checkDecl(schema: ClassSchema, d: AttrDecl, owner?: string, 
/** Is this name a class in the program? A declared attribute may be typed
 *  by a class (`child: Menu = null`), not only by the value
 *  vocabulary — without it a slot holding an instance can say no more than
 *  `View`, and then NO parameter can be typed more precisely than the slot it
 *  is fed from. The asymmetry was accidental: the `class` AttrType and its
 *  coercion already existed for schema slots (`layout: Layout`); only the
 *  DECLARATION path could not name one. */
isClassName?: (n: string) => boolean, 
/** Is this name a declared SCHEMA (typed data)? A record slot (`sel: Task
 *  = null`) and an array of records (`picked: Task[]`) are ordinary
 *  declarations whose type is the schema — the projection makes the name
 *  real in every { } body; here it resolves to the record/array kinds. */
isShape?: (n: string) => boolean): CheckedDecl;
/** An element's schema plus its inline declarations — the anonymous one-off
 *  subclass of language §5, in the checker's currency. Validation of the
 *  decls themselves is the caller's (checkDecl); this only shapes the chain. */
export declare function withDecls(schema: ClassSchema, decls: readonly AttrDecl[], isClassName?: (n: string) => boolean, isShape?: (n: string) => boolean): ClassSchema;
/** The many-path attribute (`datapath = :items[]`) that makes an element a
 *  replication template, or null. Type-directed: a many-path on a
 *  cursor-typed slot — today, View.datapath — is what replicates. */
export declare function manyPathOf(el: Element, schemas: Readonly<Record<string, ClassSchema>>): Attr | null;
