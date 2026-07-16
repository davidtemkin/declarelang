import { type Program, type Span, type Element } from "./parser.js";
import { DeclareError } from "./errors.js";
/** Cut a source's `include [ … ]` directives out of its text, leaving the rest
 *  byte-for-byte (offsets after each cut shift left by its length). Splicing
 *  highest-offset first keeps earlier spans valid; directives never overlap.
 *  This is how a library's — or the main file's — source is made splice-ready
 *  for the merged, self-contained program (composition.md §1). */
export declare function exciseSpans(source: string, spans: readonly Span[]): string;
/** The file-access abstraction include resolution rides (composition.md §1).
 *  `resolve` maps an include path (relative to the including file's dir) to a
 *  canonical key + the included file's own dir (for resolving ITS includes) +
 *  its source text, or null when the file does not exist. The canonical key is
 *  what include-once dedups on, so it must be stable per file (an absolute
 *  path on the fs host). */
export interface IncludeHost {
    resolve(fromDir: string, path: string): {
        canonical: string;
        dir: string;
        source: string;
    } | null;
}
/** A host that resolves nothing — the default in the zero-dependency graph
 *  (index.ts): a source with no `include`s never calls it, so behavior is
 *  unchanged; a source WITH includes but no real host reports each as
 *  unresolvable rather than importing a filesystem into the runtime graph. */
export declare const NO_INCLUDES: IncludeHost;
/** Resolve a program's `include`s (composition.md §1): recursively parse each
 *  included library relative to the including file, fold every library's
 *  top-level declarations into the accumulator (the main program's first), and
 *  return the merged program with `includes` emptied. Collisions, missing
 *  files, and library parse errors are collected (positioned), never thrown —
 *  one report per problem, in resolve order.
 *
 *  ONE traversal, two products (so the Program-merge and the source-merge
 *  cannot drift): `program` is the folded declarations build()/instantiate
 *  consume; `sources` is each visited library's own source with ITS include
 *  directives excised, in DEPENDENCY-FIRST (post-order) order — a library is
 *  emitted only after the libraries it includes, so a base is always declared
 *  above its subclass. compile() concatenates `sources` ahead of the excised
 *  main source to emit ONE self-contained program the hostless runtime runs. */
export declare function resolveIncludes(program: Program, host: IncludeHost, originDir: string): {
    program: Program;
    sources: string[];
    errors: DeclareError[];
    visited: Set<string>;
};
/** A host that ALSO auto-includes component libraries by bare tag — the LZX
 *  `lzx-autoincludes` mechanism, ported (composition.md §1a). Using `Bar [ … ]`
 *  with no `include` and no inline `class Bar` pulls in the library that
 *  declares `Bar`. `autoincludes()` is the tag→library-path manifest;
 *  `resolveLibrary(path)` reads a library file, keyed the SAME canonical way
 *  `resolve` is so an explicit include and an auto-include of one file dedup
 *  through the shared visited set. A plain IncludeHost lacks these, so
 *  auto-include is a no-op there (single-file compiles stay byte-identical). */
export interface AutoIncludeHost extends IncludeHost {
    autoincludes(): Record<string, string>;
    resolveLibrary(path: string): {
        canonical: string;
        dir: string;
        source: string;
    } | null;
}
/** The component NAMES a program STATICALLY references — its tree tags (children,
 *  including component-valued members like `layout:`/`data:`/animators/states)
 *  and every class's `extends` base. The static half of the used-set a production
 *  build keeps (the compiler adds `{ }`-body construction refs and the `use`
 *  list). The same walk `resolveAutoIncludes` trusts to pull libraries — so it is
 *  proven to see every static reference. Deduped. */
export declare function referencedComponentNames(program: Program): string[];
/** Pull the libraries that define a program's bare component tags — the
 *  auto-include phase, run AFTER explicit includes (composition.md §1a). A
 *  referenced tag that is neither provided (main or explicit include) nor a
 *  built-in is looked up in the manifest; if found, its library is spliced in
 *  exactly like an explicit include — dependency-first (a library's own magic
 *  bases/children are pulled before it is emitted), include-once through the
 *  shared `visited` set. A tag absent from the manifest is left alone: it is a
 *  genuine unknown component the checker reports after the merge.
 *
 *  Backends without the auto-include methods (NO_INCLUDES, a plain fs host)
 *  make this a no-op returning the program unchanged. */
export declare function resolveAutoIncludes(program: Program, root: Element, host: IncludeHost, visited: Set<string>): {
    program: Program;
    sources: string[];
    errors: DeclareError[];
};
