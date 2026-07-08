import { type Program, type Span } from "./parser.js";
import { NeoError } from "./errors.js";
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
    errors: NeoError[];
};
