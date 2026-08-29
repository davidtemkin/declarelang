import { type Program, type Span, type Element, type IncludeRef } from "./parser.js";
import { DeclareError } from "./errors.js";
export declare function spliceScriptFiles(source: string, refs: readonly IncludeRef[] | undefined, spans: readonly Span[] | undefined, fromDir: string, host: IncludeHost, errors: DeclareError[], excise?: readonly Span[]): Promise<string>;
export declare function exciseSpans(source: string, spans: readonly Span[]): string;
/** The file-access abstraction include resolution rides (composition.md §1).
 *  `resolve` maps an include path (relative to the including file's dir) to a
 *  canonical key + the included file's own dir (for resolving ITS includes) +
 *  its source text, or null when the file does not exist. The canonical key is
 *  what include-once dedups on, so it must be stable per file (an absolute
 *  path on the fs host). */
export interface IncludeHost {
    resolve(fromDir: string, path: string): Resolved | null | Promise<Resolved | null>;
}
/** What a host hands back for one file. Named so the filesystem host and the
 *  fetch host state the same shape, and so `resolve` can say "or later". */
export interface Resolved {
    canonical: string;
    dir: string;
    source: string;
}
/** A host that resolves nothing — the default in the zero-dependency graph
 *  (index.ts): a source with no `include`s never calls it, so behavior is
 *  unchanged; a source WITH includes but no real host reports each as
 *  unresolvable rather than importing a filesystem into the runtime graph. */
export declare const NO_INCLUDES: IncludeHost;
/** The HOSTLESS case, synchronously — the RUNTIME's path.
 *
 *  `compile()` emits one self-contained program (the walk splices every library's
 *  source ahead of the excised main), so at runtime there is nothing left to
 *  resolve: build() runs with NO_INCLUDES over an already-empty include list.
 *  Keeping that case here, sync, is what lets the seam above be async without
 *  making the runtime's build()/render() async for I/O nobody performs.
 *
 *  A source that still carries `include`s and has no host is the honest error the
 *  walk produced — one `missingInclude` per directive, same diagnostic, same order. */
export declare function resolveIncludesHostless(program: Program): {
    program: Program;
    errors: DeclareError[];
};
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
export declare function resolveIncludes(program: Program, host: IncludeHost, originDir: string): Promise<{
    program: Program;
    sources: string[];
    sourceIds: string[];
    errors: DeclareError[];
    visited: Set<string>;
}>;
export declare function autoIncludableNames(): readonly string[];
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
    resolveLibrary(path: string): Resolved | null | Promise<Resolved | null>;
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
export declare function resolveAutoIncludes(program: Program, root: Element, host: IncludeHost, visited: Set<string>): Promise<{
    program: Program;
    sources: string[];
    sourceIds: string[];
    errors: DeclareError[];
}>;
