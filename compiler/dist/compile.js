// compile — the source-level front-end: parse + check + compile-time scope
// resolution, producing a *resolved* program source whose `{ }` bodies read
// enclosing-scope members through explicit paths. This is where bare names
// (language §11) become meaning:
//
//   Bare names resolve up the BRACKET NESTING, innermost first — the brackets
//   are the scope exactly as they are the tree. Each enclosing element is a
//   level whose surface is its full member set (its class chain's attributes,
//   methods, and named children, plus anything declared inline); the nearest
//   level owning the name wins, and the rewrite is the explicit read the R4
//   ruling demands (compile-time resolution, never runtime `with`/Proxy
//   scoping): `this.x` at the code's own node, `parent.…x` at an intermediate
//   ancestor, `classroot.x` at the enclosing body root (a class root, or the
//   App root — the whole main tree is the anonymous App class of §5). Writes
//   rewrite identically, so `count = count + 1` in a class handler mutates
//   classroot state through the reactive setter.
//
//   Because every View level carries the built-in attributes, a bare `width`
//   always means `this.width` — outer built-ins are unreachable by shadowing,
//   which makes the doc's `opacity = { shown ? 1 : 0 }` (Screen, Appendix A)
//   work while keeping bare geometry predictable. A *user-declared* outer
//   member shadowed by a nearer resolution is the confusable case, and warns,
//   naming the qualified spelling. A name no level, parameter, or global
//   answers is a positioned error — the typo'd `lable` dies at compile time.
//
//   `App.zip` (§11's qualified form) resolves lexically: `App` names the root
//   level wherever the main tree encloses the code. Inside a named class's
//   body the App is NOT in scope — classes are lexically top-level (the
//   App-as-global question is recorded in HANDOFF §R6).
//
// Identifier classification rides the TypeScript parser (free-idents.ts —
// sanctioned reuse; see that file's header), which is exactly why this module
// is NOT part of the runtime graph: dist/index.js stays zero-dependency and
// browser-loadable, and the browser path consumes this module's *output* (a
// resolved source), compiling on the Node side of the pipeline — the same
// place the APPROACH §5 tsc front-end will live. Import it as
// `neolang/dist/compile.js`.
//
// The output is source-to-source: the input with each bare occurrence spliced
// to its explicit path (object-literal shorthand `{ count }` becomes
// `count: classroot.count`). Diagnostics always carry ORIGINAL positions —
// resolution runs on the un-rewritten tree. Resolution runs only once check()
// is clean: under an unknown tag or member the scope surfaces would be
// guesses, and phased diagnostics (syntax → types → resolution) beat noisy
// ones.
import { parseProgram } from "../../runtime/dist/parser.js";
import { NeoError, NeoErrors } from "../../runtime/dist/errors.js";
import { check, programSchemas } from "../../runtime/dist/check.js";
import { serializeDeps } from "../../runtime/dist/deps.js";
import { serializeLinks } from "../../runtime/dist/links.js";
import { annotateProgram } from "./dep-extract.js";
import { extractLinks } from "./links.js";
import { stripEditsFor, tsBodySyntax } from "./strip-types.js";
import { setBodySyntaxValidator } from "../../runtime/dist/expr.js";
// Bodies are authored as TypeScript: when the compiler is present, the
// check-phase body-syntax gate parses TS (the type-level syntax is stripped
// before emission, below). Installed at module load — every compile() on
// every host goes through this file.
setBodySyntaxValidator(tsBodySyntax);
import { freeIdentifiers } from "./free-idents.js";
import { fillDatapaths } from "../../runtime/dist/datapath.js";
import { CONSTRUCTOR_NAMES } from "../../runtime/dist/expr.js";
import { resolveIncludes, resolveAutoIncludes, exciseSpans, NO_INCLUDES } from "../../runtime/dist/include.js";
import { typecheckBodies } from "./typecheck.js";
import { Diag, toDiagnostic, renderReport } from "../../runtime/dist/diagnostics.js";
/** The value-constructor names (styling rung): in CALLEE position they are
 *  the constructors expr.ts scopes into every body — `stroke(…)` builds a
 *  Stroke while bare `stroke` is still the slot — so resolution leaves them
 *  alone there. */
const CONSTRUCTORS = new Set(CONSTRUCTOR_NAMES);
/** Assemble the unified diagnostic view: each error/warning becomes a coded
 *  Diagnostic (its own catalog code if a factory set one, else the phase
 *  fallback) CARRYING its rendered form, plus the whole-compile `report` —
 *  spread into every result literal so no exit path can omit either. Errors
 *  precede warnings; a caller wanting source order can sort on `pos`. */
function diagnose(errors, warnings, errPhase, warnPhase = "name") {
    const diagnostics = [
        ...errors.map((e) => toDiagnostic(e, "error", errPhase)),
        ...warnings.map((w) => toDiagnostic(w, "warning", warnPhase)),
    ];
    return { diagnostics, report: renderReport(diagnostics) };
}
/** Names bound in every body without being members: the scope-noun arguments of
 *  the compiled Function (expr.ts) and its own `arguments`. `this` is not an
 *  identifier and needs no entry. */
const BOUND = ["parent", "classroot", "arguments"];
// Browser globals a body may reasonably touch that a Node-side compile does
// not have in ITS globalThis. A curated list, not magic: the tsc compiler
// path replaces this whole global story with lib.dom types.
const BROWSER_GLOBALS = new Set([
    "window", "document", "navigator", "location", "history", "screen",
    "devicePixelRatio", "innerWidth", "innerHeight", "requestAnimationFrame",
    "cancelAnimationFrame", "getComputedStyle", "matchMedia", "localStorage",
    "sessionStorage", "alert", "confirm", "prompt",
]);
// The runtime services in body scope (expr.ts setBodyServices): bare `Focus`
// in a handler is the service, never a member to resolve.
const RUNTIME_SERVICES = new Set(["Focus", "Keys"]);
const isKnownGlobal = (name) => name in globalThis || BROWSER_GLOBALS.has(name) || RUNTIME_SERVICES.has(name);
/** Compile a Declare source: full diagnostics (include resolve + check + scope
 *  resolution), and a SELF-CONTAINED resolved source the zero-dependency
 *  runtime consumes with NO include host. Included libraries are spliced in
 *  (each with its own `include` directives excised, dependency-first so a base
 *  is declared above its subclass) ahead of the main file (its directives
 *  excised too), producing ONE merged source: parse → check → scope-resolve →
 *  emit all run over its identical offsets, so the output contains every
 *  included class/stylesheet/style, carries no `include` directive, and has
 *  every body — the main file's AND the included files' — bare-name-resolved.
 *
 *  Diagnostics trade-off (composition.md §1): the file-named collision /
 *  missing-file / stray-root reports come from the include walk (before the
 *  merge). Everything after — check and scope-resolution — runs on the merged
 *  source, so a type error inside an INCLUDED file is positioned within the
 *  merged text, not its own file. This is the v1 reading §1 already defers
 *  (multi-file `Pos`); it keeps the emit path drift-free — one source feeds
 *  check, the Resolver, and the output, so their offsets cannot disagree. */
export function compile(source, opts = {}) {
    let main;
    try {
        main = parseProgram(source);
    }
    catch (e) {
        // The recognition layer (parser.ts) recovers through known TS-isms and
        // raises them ALL as one NeoErrors — flatten, so each gets its own
        // positioned diagnostic like check()'s errors always have.
        if (e instanceof NeoErrors)
            return { source: null, errors: [...e.errors], warnings: [], ...diagnose([...e.errors], [], "syntax") };
        if (e instanceof NeoError)
            return { source: null, errors: [e], warnings: [], ...diagnose([e], [], "syntax") };
        throw e;
    }
    const host = opts.host ?? NO_INCLUDES;
    const resolved = resolveIncludes(main, host, opts.originDir ?? "");
    if (resolved.errors.length > 0) {
        return { source: null, errors: resolved.errors, warnings: [], ...diagnose(resolved.errors, [], "module") };
    }
    // Auto-include: pull the libraries that define the program's bare component
    // tags (`Bar [ … ]` with no `include`, no inline class) — after explicit
    // includes, sharing their visited set so the two dedup. A no-op on a host
    // without the manifest (single-file compiles stay byte-identical).
    const auto = resolveAutoIncludes(resolved.program, main.root, host, resolved.visited);
    if (auto.errors.length > 0) {
        return { source: null, errors: auto.errors, warnings: [], ...diagnose(auto.errors, [], "module") };
    }
    // The one self-contained source: explicit-include libraries, then auto-
    // included component libraries (both dependency-first, their own directives
    // cut), then the main file (its directives cut). With no includes and no
    // magic tags this is `source` unchanged, so single-file offsets are identical.
    let mainSource = exciseSpans(source, main.includeSpans);
    const libSources = [...resolved.sources, ...auto.sources];
    // The traveling focus indicator RIDES IN with the component library (OL's
    // `canvas.focusclass` default, reborn): a program whose classes include a
    // Control descendant gets `FocusRing [ ],` appended to its App root — the
    // keyboard affordance arrives with the components, undeclared. Suppressed
    // when the author defines or instantiates FocusRing themselves (which is
    // also how placement/config is customized); a wholesale opt-out (OL's
    // focusclass=null) is a follow-up App-slot ruling.
    {
        const byName = new Map(auto.program.classes.map((c) => [c.name, c]));
        const descendsControl = (name) => {
            const seen = new Set();
            for (let c = byName.get(name); c !== undefined && !seen.has(c.name); c = byName.get(c.base ?? "")) {
                if (c.name === "Control")
                    return true;
                seen.add(c.name);
                if (c.base === undefined || c.base === null)
                    break;
            }
            return false;
        };
        const treeHas = (el, tag) => el.tag === tag || el.children.some((ch) => treeHas(ch, tag));
        const usesControl = auto.program.classes.some((c) => descendsControl(c.name));
        const hasOwnRing = byName.has("FocusRing") || treeHas(main.root, "FocusRing");
        const autoHost = host;
        if (usesControl && !hasOwnRing && typeof autoHost.autoincludes === "function" && typeof autoHost.resolveLibrary === "function") {
            const path = autoHost.autoincludes()["FocusRing"];
            const lib = path !== undefined ? autoHost.resolveLibrary(path) : null;
            if (lib !== null && lib !== undefined && !resolved.visited.has(lib.canonical)) {
                libSources.push(lib.source);
                const close = mainSource.lastIndexOf("]");
                if (close >= 0) {
                    mainSource = mainSource.slice(0, close) +
                        "\n    // the traveling focus indicator — provided with the component library\n\n    FocusRing [ ],\n" +
                        mainSource.slice(close);
                }
            }
        }
    }
    const merged = libSources.length > 0
        ? libSources.join("\n") + "\n" + mainSource
        : mainSource;
    // Re-parse the merged source so every later phase indexes into ONE text.
    // (Each piece parsed cleanly on its own as a library / program, and a run of
    // top-level declarations followed by the main root is itself a valid program.)
    let program;
    try {
        program = parseProgram(merged);
    }
    catch (e) {
        if (e instanceof NeoError)
            return { source: null, errors: [e], warnings: [], ...diagnose([e], [], "syntax") };
        throw e;
    }
    const errors = check(program);
    if (errors.length > 0)
        return { source: null, errors, warnings: [], ...diagnose(errors, [], "structure") };
    // Resolve EVERY body — the main tree's and every included class/stylesheet/
    // style's — so no unresolved bare name reaches the self-contained output.
    const r = new Resolver(merged, program);
    for (const cls of program.classes)
        r.resolveElement(cls.body, [], null);
    for (const s of program.stylesheets)
        r.resolveStylesheet(s.body);
    for (const s of program.styles)
        r.resolveBundle(s.body);
    r.resolveElement(program.root, [], program.root);
    const byPos = (a, b) => (a.pos?.offset ?? 0) - (b.pos?.offset ?? 0);
    r.errors.sort(byPos);
    r.warnings.sort(byPos);
    if (r.errors.length > 0) {
        return { source: null, errors: r.errors, warnings: r.warnings, ...diagnose(r.errors, r.warnings, "name") };
    }
    // Splice highest-offset first so earlier offsets stay valid. Identifier
    // spans never overlap, so order within a body is immaterial beyond that.
    r.edits.sort((a, b) => b.start - a.start);
    let out = merged;
    for (const e of r.edits)
        out = out.slice(0, e.start) + e.text + out.slice(e.end);
    // tsc over the resolved `{ }` bodies — a phase of THE compile (on unless the
    // caller EXPLICITLY opts a latency-critical loop out). The checker is a
    // direct import: there is no front-end that can forget to wire it, on any
    // host — only the lib.d.ts SOURCE differs per host (typecheck.ts provideLib;
    // an unregistered provider throws, never silently skips). A type error
    // blocks emission like any other, mapped to its `.declare` line (NEO6001).
    if (opts.typecheck !== false) {
        const typeErrors = typecheckBodies(out, program);
        if (typeErrors.length > 0) {
            return { source: null, errors: typeErrors, warnings: r.warnings, ...diagnose(typeErrors, r.warnings, "typecheck") };
        }
    }
    // TS-only syntax is checked (above), then STRIPPED for emission
    // (strip-types.ts): bodies run as JavaScript in the zero-dependency runtime,
    // so `x as T`/`x!`/`<T>x` are removed by byte-preserving splices. Runs on a
    // fresh parse of the resolved text (its offsets are the output's offsets).
    {
        let sp = null;
        try {
            sp = parseProgram(out);
        }
        catch { /* the dep-extract parse below reports it */ }
        if (sp !== null) {
            const strips = [];
            const asCode = (v) => v !== null && typeof v === "object" && v.kind === "code" ? v : null;
            const collectStrips = (el) => {
                for (const a of el.attrs) {
                    const v = asCode(a.value);
                    if (v !== null)
                        for (const e of stripEditsFor(v.src, true))
                            strips.push({ start: v.pos.offset + 1 + e.start, end: v.pos.offset + 1 + e.end });
                }
                for (const d of el.decls) {
                    const v = asCode(d.def);
                    if (v !== null)
                        for (const e of stripEditsFor(v.src, true))
                            strips.push({ start: v.pos.offset + 1 + e.start, end: v.pos.offset + 1 + e.end });
                }
                for (const m of el.methods) {
                    for (const e of stripEditsFor(m.body, false))
                        strips.push({ start: m.bodyPos.offset + 1 + e.start, end: m.bodyPos.offset + 1 + e.end });
                }
                for (const c of el.children)
                    collectStrips(c);
            };
            collectStrips(sp.root);
            for (const cls of sp.classes)
                collectStrips(cls.body);
            strips.sort((a, b) => b.start - a.start);
            for (const e of strips)
                out = out.slice(0, e.start) + out.slice(e.end);
        }
    }
    // Final phase (NOT opt-in): static dependency extraction (design/constraints.md
    // §5). Re-parse the RESOLVED source — so every reactive read is an explicit
    // `this.…`/`parent.…`/`classroot.…`/`:path` — annotate each `{ }` constraint
    // with its read-paths, and serialize them in walk order. Folding this INTO
    // compile() is the whole point: `deps` becomes part of the ONE result every
    // caller renders, so a client can no longer re-run the extractor (the server's
    // old `depsFor`, declarec's hand-run) or forget it (the browser paths, which
    // silently fell to runtime tracking). An analyzable constraint is wired to its
    // read-paths; an UNANALYZABLE one (a §3 residue) is a BLOCKING error that names
    // the fix (constraints.md §3 + diagnostics.md §4) — never a silent fallback.
    // Legitimate calls into language methods are analyzable via their declared
    // effect signatures (effects.ts), so only genuinely-dynamic targets — indexing
    // by a runtime value, a computed datapath, node-collection aggregation, or an
    // opaque call — reach this error.
    let depProgram;
    try {
        depProgram = parseProgram(out);
    }
    catch (e) {
        if (e instanceof NeoError)
            return { source: null, errors: [e], warnings: r.warnings, ...diagnose([e], r.warnings, "syntax") };
        throw e;
    }
    const residue = annotateProgram(depProgram).errors;
    if (residue.length > 0) {
        const errs = residue
            .sort((a, b) => a.offset - b.offset)
            .map((e) => Diag.residue(e.message, posOf(out, e.offset)));
        return { source: null, errors: errs, warnings: r.warnings, ...diagnose(errs, r.warnings, "constraint") };
    }
    // The navigation relation (capabilities.md §6): attach each activation
    // handler's navigate(to) target onto its element, then serialize alongside
    // deps. Analysis-only — no diagnostics, an unresolvable target is just no link.
    extractLinks(depProgram);
    return { source: out, deps: serializeDeps(depProgram), links: serializeLinks(depProgram), errors: [], warnings: r.warnings, ...diagnose([], r.warnings, "name") };
}
/** Line/col/offset for a byte offset into `source` — positions a dep-residue
 *  error (a rare path, so a linear scan is fine). */
function posOf(source, offset) {
    let line = 1;
    let lineStart = 0;
    for (let i = 0; i < offset && i < source.length; i++) {
        if (source[i] === "\n") {
            line++;
            lineStart = i + 1;
        }
    }
    return { line, col: offset - lineStart + 1, offset };
}
class Resolver {
    errors = [];
    warnings = [];
    edits = [];
    schemas;
    /** Per-class inherited method/named-child members (attributes already ride
     *  the schema chain) and the user-declared name set, both accumulated
     *  through user bases — bases precede subclasses, so one pass suffices. */
    classExtras = new Map();
    surfaces = new Map();
    lineStarts = [0];
    constructor(source, program) {
        this.schemas = programSchemas(program.classes).schemas; // check-clean: no errors
        for (let i = 0; i < source.length; i++) {
            if (source[i] === "\n")
                this.lineStarts.push(i + 1);
        }
        for (const cls of program.classes) {
            const base = this.classExtras.get(cls.base);
            const members = new Set(base?.members);
            const declared = new Set(base?.declared);
            for (const d of cls.body.decls)
                declared.add(d.name);
            for (const m of cls.body.methods) {
                members.add(m.name);
                declared.add(m.name);
            }
            for (const c of cls.body.children) {
                if (c.name !== null) {
                    members.add(c.name);
                    declared.add(c.name);
                }
            }
            this.classExtras.set(cls.name, { members, declared });
        }
    }
    /** Walk one body root (a class body, or the main tree — `mainRoot` set
     *  there enables the lexical `App` self-name). `ancestors` is innermost
     *  first and ends at the body root. */
    resolveElement(el, ancestors, mainRoot) {
        const levels = [el, ...ancestors];
        for (const a of el.attrs) {
            if (a.value.kind === "code")
                this.resolveBody(a.value.src, a.value.pos, true, [], levels, mainRoot);
        }
        // A declaration default that is a binding (the styling rung's ruled R6
        // unlock — `labelColor: Color = { theme.buttonText }`) resolves at the
        // same levels an attribute body here does: the runtime evaluates it with
        // `this` = the instance (attributes.ts evalDefault), so `theme` means
        // `this.theme` exactly as it would in a set.
        for (const d of el.decls) {
            if (d.def?.kind === "code")
                this.resolveBody(d.def.src, d.def.pos, true, [], levels, mainRoot);
        }
        for (const m of el.methods)
            this.resolveBody(m.body, m.bodyPos, false, m.params, levels, mainRoot);
        for (const child of el.children)
            this.resolveElement(child, levels, mainRoot);
    }
    /** A stylesheet body (styling rung): each class-keyed entry's `{ }` fields
     *  resolve at ONE level — the keyed class itself (the applier evaluates a
     *  field with `this` = the styled view, the ruled bundle rule), so `theme`
     *  becomes `this.theme` and resolves through that view's prevailing chain.
     *  The theme record is literal-only (checked) — nothing to resolve. */
    resolveStylesheet(body) {
        for (const child of body.children) {
            if (child.entry !== true)
                continue;
            for (const a of child.attrs) {
                if (a.value.kind === "code")
                    this.resolveBody(a.value.src, a.value.pos, true, [], [child], null);
            }
        }
    }
    /** A style bundle's `{ }` fields apply to arbitrary views, so bare names
     *  resolve against the one surface every application is guaranteed to have
     *  — View's (`theme`, the decoration slots, the prevailing quartet all
     *  rewrite to `this.…`); a class-specific member must be written
     *  `this.member` (the conservative reading — recorded in HANDOFF). */
    resolveBundle(body) {
        for (const a of body.attrs) {
            if (a.value.kind === "code")
                this.resolveBody(a.value.src, a.value.pos, true, [], [VIEW_LEVEL], null);
        }
    }
    resolveBody(src, brace, expression, params, levels, mainRoot) {
        const bodyStart = brace.offset + 1; // the body begins just after `{`
        // Datapath islands (R8) are not TypeScript: neutralize each with a
        // same-length, identifier-free filler so the TS parse sees valid source
        // and every offset stays true. The islands themselves pass through to
        // the output untouched — `:path` is language surface; the runtime
        // rewrites it (expr.ts), keeping resolve-twice a fixpoint.
        const idents = freeIdentifiers(fillDatapaths(src), { expression, bound: [...BOUND, ...params] });
        if (idents === null)
            return; // TS could not parse what new Function did — leave the body alone
        for (const id of idents) {
            if (id.callee && CONSTRUCTORS.has(id.name))
                continue; // a value constructor, not a member
            if (id.name === "app") {
                // `app` (language §11) — the running App at the top of the tree. Sugar
                // for `this.root` (the `root` getter walks parent links to the top),
                // so it reads as a noun anywhere — `app.hostWidth`, `app.navigate(…)`
                // — and typechecks as `App` via View's `root: App` in the scaffold. A
                // scope noun, never a member, so it is intercepted before the surface
                // search; a param named `app` is forbidden (check.ts) so it cannot be
                // shadowed here.
                this.edits.push({
                    start: bodyStart + id.start,
                    end: bodyStart + id.end,
                    text: id.shorthand ? `${id.name}: this.root` : "this.root",
                });
                continue;
            }
            const pos = this.posAt(bodyStart + id.start);
            let k = levels.findIndex((lv) => this.surfaceOf(lv).all.has(id.name));
            let selfName = false;
            if (k === -1 && mainRoot !== null && id.name === "App") {
                k = levels.length - 1; // the root level itself — `App.zip` reads the anonymous App class
                selfName = true;
            }
            if (k === -1) {
                if (!isKnownGlobal(id.name)) {
                    this.errors.push(Diag.unresolved(id.name, levels.map(describe).join(" → "), pos));
                }
                continue;
            }
            const path = this.pathTo(k, levels.length);
            const expr = selfName ? path : `${path}.${id.name}`;
            this.edits.push({
                start: bodyStart + id.start,
                end: bodyStart + id.end,
                text: id.shorthand ? `${id.name}: ${expr}` : expr,
            });
            for (let j = k + 1; j < levels.length; j++) {
                if (this.surfaceOf(levels[j]).declared.has(id.name)) {
                    const outer = `${this.pathTo(j, levels.length)}.${id.name}`;
                    this.warnings.push(Diag.shadowing(`bare '${id.name}' means ${describe(levels[k])}'s here, shadowing ${describe(levels[j])}'s '${id.name}' — write ${outer} to reach the outer one`, pos));
                    break;
                }
            }
        }
    }
    /** The explicit path to level `k` of `count` levels: the node itself, a
     *  parent chain, or the body-root noun `classroot` (depth-independent, and
     *  the doc's own idiom for reaching the class instance). */
    pathTo(k, count) {
        if (k === 0)
            return "this";
        if (k === count - 1)
            return "classroot";
        return Array(k).fill("parent").join(".");
    }
    /** A level's member surface (cached per element — a class body's elements
     *  are consulted once per body they appear over). */
    surfaceOf(el) {
        let s = this.surfaces.get(el);
        if (s !== undefined)
            return s;
        const all = new Set();
        // The tag's schema chain: built-in attributes and every class-declared
        // attribute, user chains included (check-clean ⇒ the tag is known).
        for (let sc = this.schemas[el.tag]; sc !== null; sc = sc.base) {
            for (const name of Object.keys(sc.attrs))
                all.add(name);
        }
        const extras = this.classExtras.get(el.tag);
        for (const name of extras?.members ?? [])
            all.add(name);
        const declared = new Set(extras?.declared);
        for (const d of el.decls) {
            all.add(d.name);
            declared.add(d.name);
        }
        for (const m of el.methods) {
            all.add(m.name);
            declared.add(m.name);
        }
        for (const c of el.children) {
            if (c.name !== null) {
                all.add(c.name);
                declared.add(c.name);
            }
        }
        s = { all, declared };
        this.surfaces.set(el, s);
        return s;
    }
    posAt(offset) {
        let lo = 0;
        let hi = this.lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (this.lineStarts[mid] <= offset)
                lo = mid;
            else
                hi = mid - 1;
        }
        return { line: lo + 1, col: offset - this.lineStarts[lo] + 1, offset };
    }
}
const describe = (el) => (el.name !== null ? `${el.name}: ${el.tag}` : el.tag);
/** The synthetic single level a bundle body resolves at (resolveBundle):
 *  View's member surface, `this`-pathed. */
const VIEW_LEVEL = {
    tag: "View", name: null, attrs: [], decls: [], methods: [], children: [],
    pos: { line: 0, col: 0, offset: 0 },
};
//# sourceMappingURL=compile.js.map