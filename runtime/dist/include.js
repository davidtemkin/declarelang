// include — the source-merge resolve phase (composition.md §1). On
// `include [ "x" ]` the compiler resolves and parses x, recursively resolves
// ITS includes, and folds every library's top-level declarations into the one
// program — into the flat namespace (no prefixes, all classes are peers).
//
// This module is PURE: it takes the file-access host as an injected parameter
// (composition.md §1 "resolution rides the host" — filesystem on CLI/server,
// fetch in the browser) and imports only the parser and the error type. So it
// stays inside the zero-dependency runtime graph (index.ts) exactly as the
// runtime does; the Node fs host lives in its own module (include-node.ts),
// which only the Node-side entry imports.
//
// Include-once by CANONICAL path (a visited set): this makes diamonds AND
// cycles terminate, and — just as importantly — keeps a diamond from folding a
// file's declarations twice and tripping a false name-collision. Every name is
// tracked to its origin file; an included declaration whose name is already
// present is a positioned collision error naming both files, and is skipped
// (the merged program stays instantiable). Within-file duplicates stay the
// checker's job, so the main program seeds the origin table with no self-check.
import { parseLibrary } from "./parser.js";
import { NeoError } from "./errors.js";
import { Diag } from "./diagnostics.js";
/** Cut a source's `include [ … ]` directives out of its text, leaving the rest
 *  byte-for-byte (offsets after each cut shift left by its length). Splicing
 *  highest-offset first keeps earlier spans valid; directives never overlap.
 *  This is how a library's — or the main file's — source is made splice-ready
 *  for the merged, self-contained program (composition.md §1). */
export function exciseSpans(source, spans) {
    let out = source;
    for (const s of [...spans].sort((a, b) => b.start - a.start)) {
        out = out.slice(0, s.start) + out.slice(s.end);
    }
    return out;
}
/** A host that resolves nothing — the default in the zero-dependency graph
 *  (index.ts): a source with no `include`s never calls it, so behavior is
 *  unchanged; a source WITH includes but no real host reports each as
 *  unresolvable rather than importing a filesystem into the runtime graph. */
export const NO_INCLUDES = { resolve: () => null };
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
export function resolveIncludes(program, host, originDir) {
    const errors = [];
    const classes = [...program.classes];
    const stylesheets = [...program.stylesheets];
    const styles = [...program.styles];
    const fonts = [...program.fonts];
    const sources = [];
    // name → the file that declared it. The main program seeds it as "the app"
    // (composition.md §1's wording) with NO self-collision check: two decls of
    // one name WITHIN a file stay the checker's duplicate-name job.
    const MAIN = "the app";
    const origin = new Map();
    for (const c of program.classes)
        origin.set(c.name, MAIN);
    for (const s of program.stylesheets)
        origin.set(s.name, MAIN);
    for (const s of program.styles)
        origin.set(s.name, MAIN);
    for (const f of program.fonts)
        origin.set(f.name, MAIN);
    const visited = new Set();
    /** Fold one included declaration into the flat namespace, or report a
     *  collision naming both files and skip it. Returns whether it was folded. */
    const fold = (name, pos, from) => {
        const prev = origin.get(name);
        if (prev !== undefined) {
            errors.push(Diag.includeCollision(`'${name}' is declared twice — in "${from}" and "${prev}"`, pos));
            return false;
        }
        origin.set(name, from);
        return true;
    };
    const walk = (includes, fromDir) => {
        for (const inc of includes) {
            const resolved = host.resolve(fromDir, inc.path);
            if (resolved === null) {
                errors.push(Diag.missingInclude(inc.path, inc.pos));
                continue;
            }
            if (visited.has(resolved.canonical))
                continue; // include-once ⇒ diamonds + cycles terminate
            visited.add(resolved.canonical);
            let lib;
            try {
                lib = parseLibrary(resolved.source);
            }
            catch (e) {
                if (e instanceof NeoError) {
                    errors.push(e);
                    continue;
                }
                throw e;
            }
            // DEPENDENCY-FIRST: resolve the library's OWN includes before folding /
            // emitting the library itself, so an included base is declared above the
            // subclass that extends it (post-order, relative to the library's dir).
            walk(lib.includes, resolved.dir);
            // The file is named by the path it was included as — the spelling the
            // author reads in the `include` directive (composition.md §1's collision
            // message form).
            const from = inc.path;
            for (const c of lib.classes)
                if (fold(c.name, c.pos, from))
                    classes.push(c);
            for (const s of lib.stylesheets)
                if (fold(s.name, s.pos, from))
                    stylesheets.push(s);
            for (const s of lib.styles)
                if (fold(s.name, s.pos, from))
                    styles.push(s);
            for (const f of lib.fonts)
                if (fold(f.name, f.pos, from))
                    fonts.push(f);
            // Its splice-ready source — own include directives cut out — after its
            // dependencies' sources (the post-order recursion just ran).
            sources.push(exciseSpans(resolved.source, lib.includeSpans));
        }
    };
    walk(program.includes, originDir);
    return {
        program: { classes, stylesheets, styles, fonts, includes: [], includeSpans: [], root: program.root },
        sources,
        errors,
    };
}
//# sourceMappingURL=include.js.map