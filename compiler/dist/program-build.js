// program-build — from a compiled (source-to-source) result to the PROGRAM the
// runtime instantiates: the parse of the merged source, the structural check,
// the extracted dependencies zipped on, the used-component set, and the
// trusted stamp. This is the tail every program-shaped build shares — the
// declarec CLI in Node (declarec.ts) and the in-browser compiler
// (compile-browser.ts compileProgram) — so a live edit on a static host lands
// as the same artifact a deploy ships, and the runtime's parser is never
// needed on the far side of a compile. Browser- and server-usable: it reads
// no files and owns no bundler.
import { applyDeps } from "../../runtime/dist/deps.js";
import { freeIdentifiers } from "./free-idents.js";
import { parseProgram } from "../../runtime/dist/parser.js";
import { resolveIncludes, NO_INCLUDES, referencedComponentNames } from "../../runtime/dist/include.js";
import { REGISTRY_NAMES } from "../../runtime/dist/registry.js";
import { SCHEMAS, descendsFrom } from "../../runtime/dist/schema.js";
import { check } from "../../runtime/dist/check.js";
import { toDiagnostic, renderReport } from "../../runtime/dist/diagnostics.js";
/** Each rich-text format's CONTENT slot, keyed by the schema that owns it. An
 *  inline view inside that content is written as a tag, so the slot's text is a
 *  reference site for the program's own classes — see inlineViewNames below. */
const RICH_TEXT_CONTENT = [["HTMLText", "html"], ["Markdown", "text"]];
/** `<Name` — the cheapest possible tag-name scan. The capture swallows the whole
 *  name, so the match already ends on a name-character boundary (`<Issues` never
 *  yields `Issue`), and a close tag is skipped because `/` is not a name start.
 *  Nothing else about the content is parsed: the intersection with the program's
 *  own class names is what makes a hit meaningful. */
const TAG_NAME = /<([A-Za-z_$][\w$]*)/g;
/** The program classes a LITERAL rich-text document names as an inline view.
 *  Inside `HTMLText.html` / `Markdown.text`, a tag whose name matches a class
 *  declared in the program builds one real view of that class — so the string IS
 *  a static reference, and the used-set must see it or a production build drops
 *  the class and the tag renders as plain text (dev, which ships the registry
 *  whole, would keep working: the worst shape of bug this build can have).
 *
 *  Only a literal is scanned, and only against the program's own class names:
 *  a whitelisted tag (`<b>`, `<span>`) keeps nothing, and content a body
 *  computes or a `DataSource` fetches keeps nothing either — `use [ Issue ]` is
 *  the author's tool for a class named by a string it cannot see. */
function inlineViewNames(el, classNames, schemaOf) {
    const schema = schemaOf(el.tag);
    if (schema === null)
        return [];
    const out = [];
    for (const [base, slot] of RICH_TEXT_CONTENT) {
        if (schema.name !== base && !descendsFrom(schema, base))
            continue;
        const a = el.attrs.find((x) => x.name === slot);
        if (a === undefined || a.value.kind !== "string")
            continue;
        for (const m of a.value.value.matchAll(TAG_NAME))
            if (classNames.has(m[1]))
                out.push(m[1]);
    }
    return out;
}
/** The component NAMES a program may instantiate: its STATIC tree references
 *  (tags + class bases) ∪ any component a `{ }` body constructs BY NAME
 *  (`new Markdown()`, scanned via free-idents) ∪ the classes a LITERAL rich-text
 *  document names as inline-view tags ∪ the explicit `use [ … ]` keep-list.
 *  Sound because Declare has no reflective new-by-value: every construction path
 *  is a compile-time literal, so this set is complete (create-by-STRING — an
 *  `iconLeft = "TrashIcon"`, a fetched document — is what `use` covers). The
 *  scan vocabulary is the built-in registry plus the program's own class names,
 *  so only real component identifiers count — `Math`, `console`, locals, etc.
 *  are ignored, and a name shadowed by a local is (correctly) not free. */
export function usedComponentNames(program) {
    const classNames = new Set(program.classes.map((c) => c.name));
    const vocab = new Set([...REGISTRY_NAMES, ...classNames]);
    const used = new Set(referencedComponentNames(program));
    for (const name of program.uses)
        used.add(name);
    // A tag's BUILT-IN schema: walk the declared-class chain to its terminal base,
    // then the schema table. This is what makes the rich-text test a schema-chain
    // question rather than a literal tag-name one — a `class Note extends Markdown`
    // carries `text`, and a class of the author's named `Markdown`-something does
    // not (the same discipline compile.ts's tagDescendsFrom follows).
    const bases = new Map(program.classes.map((c) => [c.name, c.base]));
    const schemaOf = (tag) => {
        let name = tag;
        const seen = new Set();
        while (bases.has(name) && !seen.has(name)) {
            seen.add(name);
            const b = bases.get(name);
            if (b === undefined || b === null || b === "")
                return null;
            name = b;
        }
        return Object.hasOwn(SCHEMAS, name) ? SCHEMAS[name] : null;
    };
    const scan = (src, expression, params) => {
        const ids = freeIdentifiers(src, { expression, bound: [...params] });
        if (ids === null)
            return; // unparseable body — the checker owns that error
        for (const id of ids)
            if (vocab.has(id.name))
                used.add(id.name);
    };
    const walk = (el) => {
        for (const a of el.attrs)
            if (a.value.kind === "code")
                scan(a.value.src, true, []);
        for (const d of el.decls)
            if (d.def?.kind === "code")
                scan(d.def.src, true, []);
        for (const m of el.methods)
            scan(m.body, false, m.params.map((p) => p.name));
        for (const n of inlineViewNames(el, classNames, schemaOf))
            used.add(n);
        for (const c of el.children)
            walk(c);
    };
    walk(program.root);
    for (const cls of program.classes)
        walk(cls.body);
    return [...used];
}
/** Every source-position key the parse tree carries — `pos` everywhere, plus
 *  the named companions (`typePos` on a declaration, `bodyPos` on a method,
 *  `basePos` on a class, `sourcePos` on a subscription). All exist only for
 *  error messages, which a precompiled program never emits at runtime. */
const POS_KEYS = ["pos", "typePos", "bodyPos", "basePos", "sourcePos"];
/** Recursively delete position keys. Mutates in place and returns the value. */
export function stripPos(node) {
    if (Array.isArray(node)) {
        for (const el of node)
            stripPos(el);
    }
    else if (node !== null && typeof node === "object") {
        for (const k of POS_KEYS)
            delete node[k];
        for (const k of Object.keys(node))
            stripPos(node[k]);
    }
    return node;
}
/** The program-shaped tail of a compile: parse the resolved source into the
 *  program the runtime's `renderProgram` consumes, check what will ship, zip
 *  the extracted deps on, compute the used set, stamp it trusted, and (by
 *  default) strip positions. `c` is the ONE compile result (compileTracked,
 *  on either host); on any error `program` is null and `errors` carries every
 *  diagnostic (nothing is emitted). */
export async function programFromCompiled(c, opts = {}) {
    if (c.source === null) {
        return { program: null, errors: c.errors, warnings: c.warnings, diagnostics: c.diagnostics, report: c.report, closure: c.closure, usedComponents: [] };
    }
    // Parse the resolved source into a program. Includes are already inlined,
    // so NO_INCLUDES is a guard, not a resolver.
    const parsed = parseProgram(c.source);
    const { program, errors: incErrors } = await resolveIncludes(parsed, NO_INCLUDES, "");
    // Belt-and-suspenders: typecheck the program we will actually ship (the
    // resolved re-parse), so the emitted artifact is provably valid. A failure
    // here is OUR bug (compile() accepted what the re-check rejects), so the
    // structured view is composed the same way compile() composes its own.
    const errors = [...incErrors, ...check(program)];
    if (errors.length > 0) {
        const diagnostics = errors.map((e) => toDiagnostic(e, "error", "structure"));
        return { program: null, errors, warnings: c.warnings, diagnostics, report: renderReport(diagnostics), closure: c.closure, usedComponents: [] };
    }
    // Zip the extracted constraint dependencies (docs/system-design/constraints.md §5) onto
    // the program we ship, so it boots on the runtime's static-constraint path.
    // compile() already ran the extraction (and would have BLOCKED on an
    // unanalyzable residue above), so we re-hydrate its walk-order list onto this
    // identical re-parse rather than extracting a second time.
    applyDeps(program, c.deps ?? []);
    // Compute the used-set BEFORE stripping positions (the scan walks bodies; it
    // needs nothing positional, but order it here so it reads the same program).
    const usedComponents = usedComponentNames(program);
    // The program is now provably checked (the gate above), so stamp it trusted:
    // instantiate routes by value kind and coerces directly, and the production
    // bundle ships no validator at all (tools/declarec.mjs stubs check.js).
    program.trusted = true;
    if (opts.stripPos ?? true)
        stripPos(program);
    return { program, errors: [], warnings: c.warnings, diagnostics: c.diagnostics, report: c.report, closure: c.closure, usedComponents };
}
//# sourceMappingURL=program-build.js.map