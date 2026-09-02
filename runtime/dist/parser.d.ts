import { type Pos } from "./errors.js";
import type { PathSeg } from "./datapath.js";
/** A literal value as written — the parser classifies syntax, not type.
 *  `hex` preserves whether a number was written `0x…`: the Color type only
 *  admits the hex-written numeric form (language §6), so the written form is
 *  part of the literal, not a lexer detail to discard. */
export type Literal = {
    kind: "number";
    value: number;
    hex: boolean;
    hexLen?: number;
    pos: Pos;
} | {
    kind: "percent";
    value: number;
    pos: Pos;
} | {
    kind: "string";
    value: string;
    pos: Pos;
} | {
    kind: "hexColor";
    raw: string;
    pos: Pos;
} | {
    kind: "ident";
    name: string;
    pos: Pos;
} | {
    kind: "code";
    src: string;
    pos: Pos;
    deps?: readonly string[];
} | {
    kind: "path";
    path: string;
    many: boolean;
    pos: Pos;
    plan?: PathSeg[];
} | {
    kind: "schema";
    shape: ShapeField[];
    pos: Pos;
    arrayRoot?: boolean;
    refName?: string;
} | {
    kind: "call";
    name: string;
    args: Literal[];
    pos: Pos;
} | {
    kind: "list";
    items: Literal[];
    pos: Pos;
};
/** `name = value`. */
export interface Attr {
    name: string;
    value: Literal;
    pos: Pos;
    /** `two` when written with the two-way arrow `name <-> :path` (language §9,
     *  the leaf-input exception): the slot both READS the datapath and WRITES
     *  edits back to it. Absent = an ordinary one-way `name = value`. */
    bind?: "two";
}
/** One parameter of a method signature. `type` is the WRITTEN type name —
 *  resolving it against the value vocabulary (a primitive, or a component
 *  class) is the checker's job, exactly as for an attribute declaration's
 *  `type`. Absent means the author wrote a bare name; scaffold emits `any` for
 *  it, which under-reports both typechecking AND dep-extraction (they are one
 *  analysis viewed twice — constraints.md §2), so bare params are on their way
 *  out of the corpus. */
export interface Param {
    name: string;
    type?: string;
    /** Written `c: Menu?` — the value may be absent. A component-typed SLOT is
     *  null-defaulted, so passing one to a non-null parameter is an error; this
     *  is how a method says it accepts that. TypeScript's narrowing then does the
     *  rest: a body that checks (`c != null && c.shown`) reads cleanly, and one
     *  that does not is told so. */
    nullable?: boolean;
    /** Position of the written type name, for a positioned "unknown type" —
     *  the same role `AttrDecl.typePos` plays for a declaration. */
    typePos?: Pos;
}
/** `name(params) -> Ret { body }` — a method member. This is language §4's
 *  canonical typed form: "A method is a named field of function type …
 *  Parameters are name-first (`h: int`) … Omit `-> Ret` for a void method."
 *  Both `-> Ret` and `: Ret` parse; `->` is house style. The body is raw TS
 *  *statement* source, captured by the same balanced-brace scan as a `{ }`
 *  value; `bodyPos` points at its opening brace so syntax errors land on the
 *  code, not the name. */
export interface Method {
    name: string;
    params: Param[];
    returns?: string;
    /** Written `-> Menu?` (see `Param.nullable`). */
    returnsNullable?: boolean;
    /** Position of the written return type name (see `Param.typePos`). */
    returnsPos?: Pos;
    body: string;
    pos: Pos;
    bodyPos: Pos;
}
/** `name: Type = default` — declare a NEW typed, reactive attribute on this
 *  component (language §4: "`name = value` *sets*; `name: Type = value`
 *  *declares*"). `type` is the written type name — resolving it against the
 *  value vocabulary is the checker's job, like every other literal meaning.
 *  `def` is null when no default was written ("starts undefined until set"). */
export interface AttrDecl {
    name: string;
    type: string;
    typePos: Pos;
    def: Literal | null;
    /** Declared `prevailing name: Type …` (the styling rung): an unset slot
     *  follows the nearest providing ancestor's value, live. Part of the
     *  slot's identity, like its type. */
    prevailing: boolean;
    /** Declared `readonly name: Type = { … }`: a computed slot a constraint may
     *  read but nothing may set — the checker refuses an assignment and the
     *  runtime setter throws. Part of the slot's identity, like its type. */
    readOnly: boolean;
    /** Declared `external name: Type …` — an ISLAND BOUNDARY slot (islands.md):
     *  on an Island instance it is the host's half of the bridge; on a tenant
     *  App it is an export. Data types only, paired by name across the link,
     *  type-agreement checked at mount (the "link error"). Combines with
     *  `readonly` for an out-fact the host provably never writes. Part of the
     *  slot's identity, like its type. */
    external: boolean;
    pos: Pos;
}
/** A navigable target extracted from an activation handler's `navigate(to)`
 *  call (capabilities.md §6, links.ts): a literal URL, or a read-path to
 *  evaluate against the instance at t=0 (`this.url` — the value carries the
 *  URL, and its emptiness carries the conditionality). Compiler-attached and
 *  transported alongside the program like `deps`; the runtime stamps it onto
 *  each instance (`_navLink`) and the static extractor wraps the subtree in
 *  `<a href>`. NOT a language attribute — no Declare source names it. */
export type LinkTarget = {
    href: string;
} | {
    read: string;
};
/** A component instance: a tag with attributes, declarations, methods, and
 *  child instances. `name` is the member name when the instance was written
 *  `name: Type [ … ]` — a named child is a member of its parent (language
 *  §4: "reachable as `bg` / `this.bg`"), null when anonymous. */
export interface Element {
    tag: string;
    name: string | null;
    attrs: Attr[];
    decls: AttrDecl[];
    methods: Method[];
    children: Element[];
    /** An embedded raw `{ }` body (`events: Dataset { …json… }`, language §9) —
     *  captured verbatim; whether the tag admits one (and what the text means)
     *  is the checker's question. Absent for `[ ]`-bodied elements. */
    raw?: {
        src: string;
        pos: Pos;
    };
    /** A class-keyed ENTRY (`Button: [ fill = … ]` — the styling rung's
     *  stylesheet member): `tag` is the keyed class name. Only a stylesheet
     *  admits one — the checker's question, like every other meaning. */
    entry?: true;
    /** The navigable target of this element's activation handler, when the
     *  compiler's link extraction (compiler/src/links.ts) found a `navigate(to)`
     *  call in it. Rides the serialized program / a walk-order side-list. */
    link?: LinkTarget;
    pos: Pos;
}
/** `class Name extends Base [ … ]` (language §5). The body is an ordinary
 *  Element whose tag is the class's own name — a class body IS the member
 *  list its instances start from, so the checker and instantiator reuse the
 *  Element machinery on it unchanged. */
export interface ClassDecl {
    name: string;
    base: string;
    basePos: Pos;
    body: Element;
    pos: Pos;
}
/** A top-level `stylesheet Name [ … ]` or `style name [ … ]` declaration
 *  (styling rung). The body is an Element tagged with the declaration's own
 *  name, so the member machinery is reused unchanged; the checker owns what
 *  each body may carry. */
export interface TopDecl {
    name: string;
    body: Element;
    pos: Pos;
}
/** One field of a data-shape literal (B4, language §9's optional `schema`):
 *  `name: string`, `name?: number` (optional — absent or null is fine),
 *  `rows[]: [ … ]` (an array whose ELEMENTS have the nested shape; the array
 *  marker lives in the shape, which is what lets a shape and a replication
 *  walk agree), and `tags[]: string` (an array of scalars). Identity is NOT
 *  declared — it is INFERRED from a record's `id` field by convention (ruled
 *  2026-07-30, the invisible version; `key = :field` is the explicit
 *  override, the structural-equality fallback beneath). `type` is null
 *  exactly when `fields` carries a nested shape. */
export interface ShapeField {
    name: string;
    array: boolean;
    optional: boolean;
    type: "string" | "number" | "boolean" | "any" | null;
    fields?: ShapeField[];
    /** A literal union's members — `status: "open" | "closed"` or
     *  `col: 0 | 1 | 2` (homogeneous; `type` records which). The value must be
     *  one of these — membership is the whole check. */
    tokens?: (string | number)[];
    /** A NAMED schema in field-type position (`owner: Person`) — resolved to
     *  its fields by the checker (check.ts resolveShapeRefs); `fields` is
     *  populated there, by reference, so recursion costs nothing. */
    ref?: string;
    /** The ref's source position, for the unknown-name refusal. */
    refPos?: Pos;
}
/** A top-level `schema Name [ … ]` declaration (typed data, 2026-09-01): a
 *  named data shape — ONE type, projected as a TS interface for every `{ }`
 *  body and enforced by the runtime at every boundary data crosses. */
export interface SchemaDecl {
    name: string;
    fields: ShapeField[];
    pos: Pos;
}
/** One `include` entry — a quoted, relative path and the position of its
 *  string literal (composition.md §1). The directive `include [ "a", "b" ]`
 *  yields one IncludeRef per path; resolution is a front-end phase
 *  (include.ts), so the parser only records the reference. */
export interface IncludeRef {
    path: string;
    pos: Pos;
}
/** The half-open source span `[start, end)` of one whole `include [ … ]`
 *  directive — from the `include` keyword through the closing `]`. The
 *  source-merge (include.ts) excises these to splice included libraries into a
 *  single self-contained source; a directive listing several paths is ONE
 *  span (composition.md §1). */
export interface Span {
    start: number;
    end: number;
}
/** A top-level `script { … }` block: free TypeScript that is not a component —
 *  models, helpers, the stateless logic shared across unrelated parts of the
 *  tree (declare-language.md §5's fourth home for code). The body is captured
 *  RAW, exactly like a `Dataset`'s literal body: the parser proves only that
 *  the braces balance; TypeScript's own checker judges the contents, and the
 *  emitter places it in the program's module scope so a constraint or handler
 *  can call what it declares. */
export interface ScriptBlock {
    src: string;
    pos: Pos;
    /** The block's source span, so the source-merge can splice or excise it the
     *  way it does an `include` directive. */
    span: Span;
}
/** A whole source: `include` directives, top-level declarations (classes,
 *  stylesheets, style bundles — any order), then the root instance. (The
 *  module/file model is an open language question — one file, declarations
 *  above the root, is the R6 shape; see HANDOFF §R6.) `includes` is the raw
 *  reference list; the resolve phase (include.ts) folds included libraries in
 *  and empties it. */
export interface Program {
    classes: ClassDecl[];
    /** Top-level `schema Name [ … ]` declarations (typed data). Optional so
     *  hand-built Program literals stay valid. */
    shapes?: SchemaDecl[];
    stylesheets: TopDecl[];
    styles: TopDecl[];
    fonts: TopDecl[];
    includes: IncludeRef[];
    /** The source spans of the `include [ … ]` directives (one per directive) —
     *  what the source-merge excises to emit a self-contained program. */
    includeSpans: Span[];
    /** The `use [ … ]` keep-list: component NAMES the app may construct by a name
     *  static analysis can't trace (create-by-string, instantiation.md §8), so the
     *  build force-includes them — a built-in runtime class, an autoinclude
     *  library, or a developer class alike (one declaration, all three backends).
     *  Additive to what the tree + body scan already discover. */
    uses: string[];
    /** Top-level `script { … }` blocks, in source order. */
    scripts: ScriptBlock[];
    /** `script [ "file.ts" ]` directives — script from a FILE, spelled like
     *  `include` (composition.md §2). The compile splices each file's contents in
     *  as a synthesized `script { … }` block, so downstream nothing knows the
     *  difference. Optional: most Program literals are built without them. */
    scriptFiles?: IncludeRef[];
    scriptFileSpans?: Span[];
    root: Element;
    /** Stamped `true` by the compiler ONLY on a program it fully checked
     *  (declarec's build). instantiate.ts then routes attributes by value kind
     *  and coerces literals directly, skipping the validators — which a
     *  production bundle substitutes with a stub. Never set by the parser:
     *  parsing proves syntax, not types. */
    trusted?: boolean;
}
/** An included file (composition.md §1): a library of top-level declarations
 *  — classes, stylesheets, styles, and its own `include`s — with NO root. It
 *  is not a Program: it never declares an App, so it has no `root`. */
export interface Library {
    classes: ClassDecl[];
    /** A library's own `schema Name [ … ]` declarations, merged like classes. */
    shapes?: SchemaDecl[];
    stylesheets: TopDecl[];
    styles: TopDecl[];
    fonts: TopDecl[];
    includes: IncludeRef[];
    /** This library's own `include [ … ]` directive spans — excised when the
     *  library's source is spliced into the merged program. */
    includeSpans: Span[];
    /** A library may carry its OWN `use [ … ]` keep-list (its dynamic deps); the
     *  source-merge folds these into the program's `uses`. */
    uses: string[];
    /** A library may declare its own `script { … }` helpers; the source-merge
     *  folds these into the program's blocks, in include order. */
    scripts: ScriptBlock[];
    /** A library's own `script [ "file.ts" ]` directives — spliced into its
     *  source (relative to the library's directory) before the merge. */
    scriptFiles?: IncludeRef[];
    scriptFileSpans?: Span[];
}
/** Parse a component fragment — one element, no class declarations. The
 *  entry tools and tests use for pieces; a whole source goes through
 *  parseProgram (which build()/render() call). */
export declare function parse(source: string): Element;
/** Parse a whole Declare source: `include`s and top-level declarations
 *  (classes, stylesheets, style bundles), the root instance, and — ruled
 *  2026-08-06 — declarations may FOLLOW the root too, in any order. The
 *  reading convention stays declarations-first (the guide says so; the
 *  formatter never reorders), but the parser accepts the natural writing
 *  motion: a class extracted from the tree and pasted at the bottom of the
 *  file compiles. The languages Declare keeps company with (Go, Rust, Swift,
 *  Kotlin, LZX) are all order-free at the top level; the define-before-use
 *  holdouts (C, F#, XAML's StaticResource) are the resented company. */
export declare function parseProgram(source: string): Program;
/** Parse an INCLUDED file (composition.md §1): the same top-level
 *  declarations as a program, then eof — a library declares classes,
 *  stylesheets, and styles, never a root. A stray root element is a
 *  positioned error: an included file is a library of definitions, not an
 *  App. */
export declare function parseLibrary(source: string): Library;
