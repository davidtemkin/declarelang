import { type Pos } from "./errors.js";
/** A literal value as written — the parser classifies syntax, not type.
 *  `hex` preserves whether a number was written `0x…`: the Color type only
 *  admits the hex-written numeric form (language §6), so the written form is
 *  part of the literal, not a lexer detail to discard. */
export type Literal = {
    kind: "number";
    value: number;
    hex: boolean;
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
/** `name(params) { body }` — a method member (language §4's shorthand; the
 *  canonical typed form waits for the type surface). The body is raw TS
 *  *statement* source, captured by the same balanced-brace scan as a `{ }`
 *  value; `bodyPos` points at its opening brace so syntax errors land on the
 *  code, not the name. */
export interface Method {
    name: string;
    params: string[];
    body: string;
    pos: Pos;
    bodyPos: Pos;
    /** `member(params) <- Source { body }` — a SUBSCRIPTION (language §8): the
     *  member is installed like any method, and additionally registered with the
     *  named external source at construction (unsubscribed at discard). Absent =
     *  an ordinary method. The member's name matches the source's member
     *  literally — the `on` prefix is convention, not mapping (ruled 2026-07-13). */
    source?: string;
    sourcePos?: Pos;
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
    pos: Pos;
}
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
/** A whole source: `include` directives, top-level declarations (classes,
 *  stylesheets, style bundles — any order), then the root instance. (The
 *  module/file model is an open language question — one file, declarations
 *  above the root, is the R6 shape; see HANDOFF §R6.) `includes` is the raw
 *  reference list; the resolve phase (include.ts) folds included libraries in
 *  and empties it. */
export interface Program {
    classes: ClassDecl[];
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
    root: Element;
}
/** An included file (composition.md §1): a library of top-level declarations
 *  — classes, stylesheets, styles, and its own `include`s — with NO root. It
 *  is not a Program: it never declares an App, so it has no `root`. */
export interface Library {
    classes: ClassDecl[];
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
}
/** Parse a component fragment — one element, no class declarations. The
 *  entry tools and tests use for pieces; a whole source goes through
 *  parseProgram (which build()/render() call). */
export declare function parse(source: string): Element;
/** Parse a whole Declare source: `include`s and top-level declarations
 *  (classes, stylesheets, style bundles — in any order), then the root
 *  instance. */
export declare function parseProgram(source: string): Program;
/** Parse an INCLUDED file (composition.md §1): the same top-level
 *  declarations as a program, then eof — a library declares classes,
 *  stylesheets, and styles, never a root. A stray root element is a
 *  positioned error: an included file is a library of definitions, not an
 *  App. */
export declare function parseLibrary(source: string): Library;
