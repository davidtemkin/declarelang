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
        visited,
    };
}
/** The component TAGS a tree references — every child element's tag (named and
 *  anonymous alike live in `children`), plus each class's `extends` base.
 *  Attribute declarations (`decls`) carry value-type names, not component tags,
 *  so they are not references. Deduped, in encounter order. */
function referencedTags(root, classes) {
    const out = [];
    const seen = new Set();
    const add = (tag, pos) => {
        if (tag !== "" && !seen.has(tag)) {
            seen.add(tag);
            out.push({ tag, pos });
        }
    };
    const walk = (el) => {
        for (const child of el.children) {
            add(child.tag, child.pos);
            walk(child);
        }
    };
    if (root !== null)
        walk(root);
    for (const c of classes) {
        add(c.base, c.basePos);
        walk(c.body);
    }
    return out;
}
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
export function resolveAutoIncludes(program, root, host, visited) {
    const auto = host;
    if (typeof auto.autoincludes !== "function" || typeof auto.resolveLibrary !== "function") {
        return { program, sources: [], errors: [] };
    }
    const manifest = auto.autoincludes();
    const errors = [];
    const classes = [...program.classes];
    const stylesheets = [...program.stylesheets];
    const styles = [...program.styles];
    const fonts = [...program.fonts];
    const sources = [];
    // name → the file that declared it (main + explicit includes seed it). A
    // referenced tag not present here and present in the manifest gets pulled;
    // built-in tags are never in the manifest, so they need no separate registry.
    const origin = new Map();
    for (const c of program.classes)
        origin.set(c.name, "the app");
    for (const s of program.stylesheets)
        origin.set(s.name, "the app");
    for (const s of program.styles)
        origin.set(s.name, "the app");
    for (const f of program.fonts)
        origin.set(f.name, "the app");
    const foldOne = (name, pos, from) => {
        const prev = origin.get(name);
        if (prev !== undefined) {
            errors.push(Diag.includeCollision(`'${name}' is declared twice — in "${from}" and "${prev}"`, pos));
            return false;
        }
        origin.set(name, from);
        return true;
    };
    // Post-order: a library's OWN referenced magic tags are pulled before it is
    // emitted, so a base is declared above its subclass (dependency-first, like
    // explicit includes). `origin` reserves the file's names before recursion so
    // a self/mutual reference does not re-pull.
    const pull = (tag, pos) => {
        if (origin.has(tag))
            return;
        const path = manifest[tag];
        if (path === undefined)
            return; // not a magic tag → unknownComponent, post-merge
        const resolved = auto.resolveLibrary(path);
        if (resolved === null) {
            errors.push(Diag.missingInclude(path, pos));
            origin.set(tag, path); // don't re-report per reference
            return;
        }
        if (visited.has(resolved.canonical)) {
            origin.set(tag, path);
            return;
        }
        visited.add(resolved.canonical);
        let lib;
        try {
            lib = parseLibrary(resolved.source);
        }
        catch (e) {
            if (e instanceof NeoError) {
                errors.push(e);
                return;
            }
            throw e;
        }
        const mine = [];
        for (const c of lib.classes)
            if (foldOne(c.name, c.pos, path))
                mine.push(c);
        // dependency-first: pull what this library references, then emit it
        for (const r of referencedTags(null, lib.classes))
            pull(r.tag, r.pos);
        for (const c of mine)
            classes.push(c);
        for (const s of lib.stylesheets)
            if (foldOne(s.name, s.pos, path))
                stylesheets.push(s);
        for (const s of lib.styles)
            if (foldOne(s.name, s.pos, path))
                styles.push(s);
        for (const f of lib.fonts)
            if (foldOne(f.name, f.pos, path))
                fonts.push(f);
        sources.push(exciseSpans(resolved.source, lib.includeSpans));
    };
    for (const r of referencedTags(root, program.classes))
        pull(r.tag, r.pos);
    return {
        program: { classes, stylesheets, styles, fonts, includes: [], includeSpans: [], root: program.root },
        sources,
        errors,
    };
}
//# sourceMappingURL=include.js.map