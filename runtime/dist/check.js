// check — the typecheck pass over a parsed tree. It validates every component
// tag and every literal attribute against the component schemas and reports
// EVERY problem, in source order, each with its exact position — never just
// the first. Messages name the component, the attribute, the expected type,
// and what was found.
//
// It is deliberately separable from instantiation: this module imports only
// the parse tree, the schemas, the value vocabulary, and the (runtime-free)
// expression compiler — no runtime classes — so the compiler front-end
// (APPROACH §5) runs it standalone. Bare-name scope resolution (R6) is NOT
// here: it needs real identifier analysis (the typescript package), which
// must stay out of the zero-dependency runtime graph — compile.ts owns it.
//
// A `{ }` value (R4) checks as: attribute must exist, body must be valid
// expression syntax (compileExpr, whose messages this shares with the
// binding path). Its *type* is deliberately not checked here — that is the
// tsc half of the compiler plan; the runtime path trusts the body (HANDOFF
// §R4 records the gap and the plan that closes it). Method members (R5)
// check the same way — name rules against the schema (attributes and
// methods share the member namespace; a handler must answer a declared
// event), statement-body syntax via compileBody.
//
// R6 adds the program level: user classes register as schemas (the checker's
// half of the twin tables — programSchemas), a class body checks as an
// instance of the class it declares, inline attribute declarations grow an
// element an anonymous schema, and named children join the one member
// namespace.
import { CSS_COLORS } from "./css-colors.js";
import { DeclareError, noBaselineMessage, stackBaselineMessage } from "./errors.js";
import { attrType, isReadOnly, descendsFrom, eventOfHandler, eventsOf, handlerName, PAYLOAD_TYPE_NAMES, EVENT_PAYLOAD, BUILTIN_PROVIDED } from "./schema.js";
import { Diag, nearestName } from "./diagnostics.js";
import { runtimeMethodsOf } from "./runtime-methods.js";
import { cssAttributeHint, hintedForeignName } from "./teach.js";
import { autoIncludableNames } from "./include.js";
import { coerce, describeLiteral, declaredType, isAuthoredUnion, parseLiteralUnion, DECLARED_TYPE_NAMES } from "./value.js";
import { resolveShapes, shapeNames } from "./shape-resolve.js";
// The program-under-check's declared schema names — set at check() entry
// (checkElement recurses too deep to thread one more parameter through).
let CHECK_SHAPES = new Set();
/** Class name → every member its body declares (decls, methods, named children),
 *  base chain included. A use site that names a child the same thing is
 *  redeclaring a member of the component it is instantiating — refused below,
 *  where the source shows it, rather than at boot. */
let CLASS_MEMBERS = new Map();
/** Class name → every attribute its class chain SETS (`class Reveal extends
 *  Spring [ attribute = opacity ]`). A use site inherits those sets, so a
 *  requirement one family has — an animator's `attribute`, a Dataset's data —
 *  is met by the class as well as by the site. */
let CLASS_SETS = new Map();
/** Does the class chain of `tag` (if it is a program class) set `attr`? */
function classSets(tag, attr) {
    return CLASS_SETS.get(tag)?.has(attr) === true;
}
import { validateExpr, validateBody } from "./expr.js";
import { isSelective, staticSegs } from "./datapath.js";
import { fontObjectHint } from "./font-value.js";
import { NOUNS, RESERVED, structuralReason, programSchemas, checkDecl, withDecls, manyPathOf, coerceToken } from "./program-schema.js";
import { THEME_PRESET_NAMES } from "./themes.js";
// The schema half of the twin tables — class registration, effective schemas,
// replication detection, token coercion — lives in program-schema.ts so a
// production build ships it WITHOUT this validator (which declarec substitutes
// with a stub, the registry-slimming lever). Re-exported here so every
// existing importer keeps its one import site.
export { programSchemas, checkDecl, withDecls, manyPathOf, coerceToken } from "./program-schema.js";
const EMPTY_ENV = { bundles: new Map(), themes: new Set(THEME_PRESET_NAMES), fonts: new Set(), validated: new Set() };
/** Attribute kinds a style bundle may never set — structural relationships,
 *  not values (recorded v1 refusals). */
const UNSTYLABLE = {
    component: "a component slot (layout) is structure",
    cursor: "a data cursor is structure",
};
/** Typecheck a parsed tree — a whole Program (classes + root) or a bare
 *  Element fragment. Returns every error found, in source order — an empty
 *  array means the tree is well-typed and safe to instantiate. */
/** Candidates for the unknown-component near-miss: everything that RESOLVED,
 *  plus everything the auto-include manifest could have supplied. Without the
 *  second half a misspelled library tag has no candidate at all — it was never
 *  pulled, precisely because it was misspelled. Deduped; nearestName rejects
 *  ties, so a larger pool cannot lower confidence. */
function tagCandidates(schemas) {
    return [...new Set([...Object.keys(schemas), ...autoIncludableNames()])];
}
export function check(input) {
    const program = "root" in input ? input : { classes: [], themes: [], styles: [], fonts: [], includes: [], includeSpans: [], uses: [], scripts: [], root: input };
    // Schema resolution first (typed data): named `schema =` forms rewrite to
    // resolved shape literals, refs resolve, and collisions/unknown names
    // report here. CHECK_SHAPES then answers type-position lookups below.
    const shapeResolution = resolveShapes(program);
    CHECK_SHAPES = shapeNames(program);
    const { infos, schemas, errors } = programSchemas(program.classes, CHECK_SHAPES);
    {
        const byName = new Map(program.classes.map((c) => [c.name, c]));
        const members = new Map();
        const membersOf = (name, seen = new Set()) => {
            const hit = members.get(name);
            if (hit !== undefined)
                return hit;
            const out = new Set();
            members.set(name, out);
            const decl = byName.get(name);
            if (decl === undefined || seen.has(name))
                return out;
            seen.add(name);
            for (const n of membersOf(decl.base, seen))
                out.add(n);
            for (const d of decl.body.decls)
                out.add(d.name);
            for (const m of decl.body.methods)
                out.add(m.name);
            for (const c of decl.body.children)
                if (c.name !== null)
                    out.add(c.name);
            return out;
        };
        for (const c of program.classes)
            membersOf(c.name);
        CLASS_MEMBERS = members;
        const sets = new Map();
        const setsOf = (name, seen = new Set()) => {
            const hit = sets.get(name);
            if (hit !== undefined)
                return hit;
            const out = new Set();
            sets.set(name, out);
            const decl = byName.get(name);
            if (decl === undefined || seen.has(name))
                return out;
            seen.add(name);
            for (const n of setsOf(decl.base, seen))
                out.add(n);
            for (const a of decl.body.attrs)
                out.add(a.name);
            return out;
        };
        for (const c of program.classes)
            setsOf(c.name);
        CLASS_SETS = sets;
    }
    errors.push(...shapeResolution.errors);
    const env = checkStyleDecls(program, schemas, errors);
    // A class body checks as an instance of its own (just-registered) class:
    // sets against declared + inherited attributes, handlers against inherited
    // events, children recursively — no class-specific checking machinery.
    // Its decls were consumed by registration, so only their namespace
    // membership is re-checked here (declsOwned).
    for (const info of infos) {
        checkBodyRootReplication(info.decl.body, errors, `class ${info.decl.name}'s own body`);
        checkElement(info.decl.body, errors, schemas, true, env, null, true);
    }
    checkBodyRootReplication(program.root, errors, "the program root");
    checkElement(program.root, errors, schemas, false, env);
    // Signature TYPE NAMES (`f(w: Window) -> number`). Checked program-wide,
    // here, because a written type may name any component in the program — the
    // per-method checkMethod sees only its own schema. Unresolvable names must
    // error rather than fall back to `any`: a silent `any` is exactly the
    // under-report that blinds both typecheck and dep-extraction.
    for (const info of infos)
        checkSignatureTypes(info.decl.body, errors, schemas);
    checkSignatureTypes(program.root, errors, schemas);
    // The `use` keep-list (composition.md §1c): every name must resolve to a known
    // component — a built-in, or a class the program declares or auto-includes —
    // else it is a typo that would silently keep nothing. `schemas` is the merged
    // name→schema table (built-ins + user/auto-included classes). `Layout` IS in
    // the table now (a class may extend it), but as a use-entry it names no
    // buildable component — reject it with the pointed reason, like the other
    // absent abstract bases (`RichText`).
    for (const name of program.uses) {
        if (name === "Layout") {
            errors.push(new DeclareError(`use [ Layout ]: 'Layout' is the abstract base — it names no arrangement to keep. Name a concrete strategy (SimpleLayout, WrappingLayout, ResponsiveLayout, …)`, program.root.pos));
        }
        else if (!Object.hasOwn(schemas, name)) {
            errors.push(new DeclareError(`use [ ${name} ]: unknown component '${name}' — a use entry names a built-in or a declared/included class`, program.root.pos));
        }
    }
    // (An 0xRRGGBBAA 8-hex literal is the `0x` twin of #RRGGBBAA — an alpha
    // color: compile.ts lowers it to colorWithAlpha(…) and the typecheck grounds
    // it as Color, so a color in a numeric slot fails there (or in coerce for a
    // literal attr). No source-scan lint needed.)
    // Members of different kinds interleave freely in source but are checked
    // per kind (attrs, then methods, then the child recursion); a stable sort
    // on position restores the promised source order. Every check error is
    // positioned, so the fallback never actually fires.
    errors.sort((a, b) => (a.pos?.offset ?? 0) - (b.pos?.offset ?? 0));
    return errors;
}
// ── Styling declarations: themes + style bundles ────────────────────────────
/** Validate a program's `theme`/`style`/`font` declarations and produce the
 *  StyleEnv the element walk resolves against. One message source with
 *  instantiate: both consume the same helpers (checkAttr, coerceToken via
 *  checkThemeRecord), so a direct instantiate of an unchecked tree dies with
 *  the same wording. */
/** Every method signature's written type names, recursively. A name resolves
 *  if it is in the declarable value vocabulary (`number`, `string`, `View`, an
 *  enum) or names a component in this program. */
function checkSignatureTypes(el, errors, schemas) {
    const known = (n) => {
        if (n.endsWith("[]"))
            return known(n.slice(0, -2)); // Window[] checks by its element
        // A function type validates by its PARTS: every TYPE inside it must itself
        // be known. Parameter NAMES are not types, so strip `name:` first —
        // `(id: string) -> void` checks `string` and `void`, not `id`.
        if (n.startsWith("(")) {
            const types = n.replace(/[A-Za-z_$][\w$]*\s*:/g, " ").match(/[A-Za-z_$][\w$]*/g) ?? [];
            return types.every((w) => w === "void" || known(w));
        }
        // a literal union is TypeScript's own and needs no registry
        if (isAuthoredUnion(n))
            return parseLiteralUnion(n) !== null;
        return declaredType(n) !== null || schemas[n] !== undefined || PAYLOAD_TYPE_NAMES.has(n) || CHECK_SHAPES.has(n);
    };
    const schema = schemas[el.tag];
    /** The first name inside a written type that is not a known type — so a
     *  function type's error can point at `Nonsense`, not at the whole
     *  `(id: Nonsense) -> void`. */
    const firstUnknown = (n) => {
        if (n.endsWith("[]"))
            return firstUnknown(n.slice(0, -2));
        if (!n.startsWith("("))
            return known(n) ? null : n;
        const types = n.replace(/[A-Za-z_$][\w$]*\s*:/g, " ").match(/[A-Za-z_$][\w$]*/g) ?? [];
        return types.find((w) => w !== "void" && !known(w)) ?? null;
    };
    for (const m of el.methods) {
        // A HANDLER's payload is not the author's to choose. `onMouseUp` receives a
        // PointerUpEvent; writing anything else is the override mismatch TypeScript
        // reports as TS2416 — but tsc sees it on a SYNTHESIZED class line with no
        // author position, so it is caught here instead, where the position and the
        // language's own vocabulary are both in hand.
        const ev = schema === undefined ? null : eventOfHandler(m.name);
        if (ev !== null && eventsOf(schema).includes(ev)) {
            const payload = EVENT_PAYLOAD[ev];
            const first = m.params[0];
            if (payload === undefined && first?.type !== undefined) {
                errors.push(new DeclareError(`'${m.name}' receives nothing — the '${ev}' event carries no payload, so write '${m.name}()'`, first.typePos ?? m.pos));
            }
            else if (payload !== undefined && first?.type !== undefined && first.type !== payload) {
                errors.push(new DeclareError(`'${m.name}' receives a ${payload} — write '${m.name}(${first.name}: ${payload})', not '${first.type}'`, first.typePos ?? m.pos));
            }
        }
        for (const prm of m.params) {
            // A parameter with NO written type is an error (ruled 2026-07-28: the
            // language leans into typing and static analysis — an untyped parameter
            // silently disables both, exactly the under-report an agent audit
            // flagged). The message names the payload when the runtime knows it.
            if (prm.type === undefined) {
                const payload = ev !== null && schema !== undefined && eventsOf(schema).includes(ev) ? EVENT_PAYLOAD[ev] : undefined;
                errors.push(new DeclareError(payload !== undefined
                    ? `'${prm.name}' needs its payload type — write '${m.name}(${prm.name}: ${payload})'`
                    : `parameter '${prm.name}' has no type — a signature is typed name-first: '${m.name}(${prm.name}: number)' (a primitive, a component class, a function type, or 'object' for a genuinely shapeless value)`, m.pos));
                continue;
            }
            const badP = prm.type === undefined ? null : firstUnknown(prm.type);
            if (badP !== null) {
                errors.push(new DeclareError(`unknown type '${badP}' for parameter '${prm.name}' — a signature type is one of ${DECLARED_TYPE_NAMES.join(", ")}, a component class in this program, a literal union ('"a" | "b"'), or a function type '(a: T) -> R'`, prm.typePos ?? m.pos));
            }
        }
        const badR = m.returns === undefined ? null : firstUnknown(m.returns);
        if (badR !== null) {
            errors.push(new DeclareError(`unknown return type '${badR}' for '${m.name}' — a signature type is one of ${DECLARED_TYPE_NAMES.join(", ")}, a component class in this program, a literal union ('"a" | "b"'), or a function type '(a: T) -> R'`, m.returnsPos ?? m.pos));
        }
    }
    for (const c of el.children)
        checkSignatureTypes(c, errors, schemas);
}
export function checkStyleDecls(program, schemas, errors) {
    const bundles = new Map();
    const themes = new Set(THEME_PRESET_NAMES);
    const fonts = new Set();
    const taken = (name) => Object.hasOwn(schemas, name) || bundles.has(name) || themes.has(name) || fonts.has(name);
    for (const s of program.styles) {
        if (taken(s.name)) {
            errors.push(new DeclareError(`there is already a component, theme, style, or font named '${s.name}'`, s.pos));
            continue;
        }
        errors.push(...checkStyleBody(s, schemas));
        bundles.set(s.name, s.body);
    }
    for (const s of program.themes) {
        if (taken(s.name)) {
            errors.push(new DeclareError(`there is already a component, theme, style, or font named '${s.name}'`, s.pos));
            continue;
        }
        errors.push(...checkThemeRecord(`theme ${s.name}`, s.body));
        themes.add(s.name);
    }
    // The top-level `font` form is retired (2026-09-14): a font is an object in the
    // tree. The parser still reads the old form so this can say exactly what to write.
    for (const f of program.fonts) {
        const member = f.name.charAt(0).toLowerCase() + f.name.slice(1);
        errors.push(new DeclareError(`'font ${f.name} [ … ]' is no longer a top-level declaration — ${fontObjectHint(f.name)}. Move its body into the App as '${member}: Font [ … ]' (the same family and Face children)`, f.pos));
    }
    return { bundles, themes, fonts, validated: new Set() };
}
/** A style bundle names the look of a `<span class="…">` run inside parsed
 *  prose — a set of `Text` face attributes, a look, not a component. Its fields
 *  TYPE against `Text` (a run is text), so a bundle setting something Text does
 *  not carry fails at declaration. */
function checkStyleBody(decl, schemas) {
    const errors = [];
    const b = decl.body;
    for (const d of b.decls)
        errors.push(new DeclareError(`style ${decl.name}: a bundle declares no attributes — it is a look, not a component`, d.pos));
    for (const m of b.methods)
        errors.push(new DeclareError(`style ${decl.name}: a bundle has no methods`, m.pos));
    for (const c of b.children)
        errors.push(new DeclareError(`style ${decl.name}: a bundle has no children — attribute sets only`, c.pos));
    if (b.raw !== undefined)
        errors.push(new DeclareError(`style ${decl.name}: a bundle takes [ ] members, not a { } body`, b.raw.pos));
    // A bundle is a plain record of literal values, like a theme (ruled 2026-09-14):
    // it has no place in the tree, so nothing in it can depend on where it is used.
    for (const a of b.attrs) {
        if (a.value.kind !== "code")
            continue;
        errors.push(new DeclareError(`style ${decl.name}.${a.name}: a style holds literal values only — a value that depends on where it is used is written THERE: on the rich text, textStyles = { { ${decl.name}: { ${a.name}: … } } }; in a drawing or measureText, { ...${decl.name}, ${a.name}: … }`, a.value.pos));
    }
    const text = schemas["Text"];
    if (text !== undefined)
        errors.push(...checkBundleUse(decl.name, b, text, decl.pos));
    return errors;
}
/** Validate one bundle against `Text`: every field must be a `Text` attribute
 *  of a stylable kind — the loud, positioned failure the design promises. */
function checkBundleUse(bundle, body, schema, at) {
    const errors = [];
    void at;
    for (const a of body.attrs) {
        const type = attrType(schema, a.name);
        if (type === null) {
            errors.push(new DeclareError(`style ${bundle} sets '${a.name}', which ${schema.name} does not declare`, a.pos));
            continue;
        }
        const bad = UNSTYLABLE[type.kind];
        if (bad !== undefined) {
            errors.push(new DeclareError(`style ${bundle}.${a.name}: ${bad}`, a.pos));
            continue;
        }
        const r = checkAttr(schema, a);
        if (!r.ok)
            errors.push(r.error);
    }
    return errors;
}
/** A theme's token record: `theme Cupertino [ accent = #007AFF, radius = 6 ]`
 *  — token names are free (a Theme is a schema-less record), values are plain
 *  literals or decoration constructors. `rec` is the declaration's body. */
export function checkThemeRecord(where, rec) {
    const errors = [];
    for (const d of rec.decls)
        errors.push(new DeclareError(`${where}: a token record declares nothing`, d.pos));
    for (const m of rec.methods)
        errors.push(new DeclareError(`${where}: a token record has no methods`, m.pos));
    for (const c of rec.children)
        errors.push(new DeclareError(`${where}: a token record has no children`, c.pos));
    if (rec.raw !== undefined)
        errors.push(new DeclareError(`${where}: a theme takes [ ] tokens, not a { } body`, rec.raw.pos));
    const seen = new Map();
    for (const a of rec.attrs) {
        const first = seen.get(a.name);
        if (first !== undefined) {
            errors.push(new DeclareError(`${where}.${a.name} is set twice (first set at line ${first.line}, col ${first.col})`, a.pos));
            continue;
        }
        seen.set(a.name, a.pos);
        const t = coerceToken(a.value);
        if (t === undefined) {
            errors.push(new DeclareError(`${where}.${a.name}: a token is a number, string, boolean, color, or a value constructor (gradient/stroke/shadow/frost) — got ${describeLiteral(a.value)}`, a.value.pos));
        }
    }
    return errors;
}
// ── The element walk ────────────────────────────────────────────────────────
/** A body root cannot be a replication template: the program root is one
 *  view, and a class body replicating ITSELF would make every instantiation
 *  many (put the `:path[]` on the use site instead). */
function checkBodyRootReplication(el, errors, where) {
    const many = el.attrs.find((a) => a.name === "datapath" && a.value.kind === "path" && a.value.many);
    if (many !== undefined) {
        errors.push(new DeclareError(`${where} cannot replicate — ':${many.value.path}[]' makes many instances; put it on a child element (or a use site)`, many.value.pos));
    }
}
function checkElement(el, errors, schemas, declsOwned, env = EMPTY_ENV, 
/** The enclosing element's schema — the animator's TARGET context. Threaded
 *  so the one animation check (animation.md §3) can resolve `attribute`
 *  against the parent's numeric slots; null at the root / under an unknown
 *  parent (no target to check against). */
parentSchema = null, 
/** True only for a class-declaration body root: the body IS a component
 *  definition, so the "a layout is not a child" guard — which catches a
 *  layout used as a tree child or the app root — must not fire on a legitimate
 *  `class X extends TweenLayout [ … ]`. */
classRoot = false) {
    if (el.entry === true) {
        errors.push(new DeclareError(`'${el.tag}: [ … ]' is a class-keyed entry — no declaration admits one`, el.pos));
        return;
    }
    // Own-key lookup: a tag named `constructor` must not resolve through
    // Object.prototype.
    const schema = Object.hasOwn(schemas, el.tag) ? schemas[el.tag] : null;
    // Elements consumed as component-typed attribute VALUES (a `layout:` member)
    // are checked by checkComponentValue, not as tree children.
    const consumed = new Set();
    // A typeface's shape (font.ts): a Face lives only in a Font and holds nothing;
    // a Font holds Face children only; `family` names a SYSTEM font (one with no
    // faces) — a font with faces is named by its object, never by a string.
    if (schema !== null && descendsFrom(schema, "Face")) {
        if (parentSchema === null || !descendsFrom(parentSchema, "Font")) {
            errors.push(new DeclareError(`a Face belongs inside a Font — 'brand: Font [ Face [ src = "brand.woff2" ] ]'`, el.pos));
        }
        for (const c of el.children)
            errors.push(new DeclareError(`a Face has no children — src, weight and italic only`, c.pos));
        if (!el.attrs.some((a) => a.name === "src"))
            errors.push(new DeclareError(`a Face needs a src — the file (or local("…") face) it is`, el.pos));
    }
    if (schema !== null && descendsFrom(schema, "Font")) {
        let faces = 0;
        for (const c of el.children) {
            const cs = Object.hasOwn(schemas, c.tag) ? schemas[c.tag] : null;
            if (cs !== null && descendsFrom(cs, "Face")) {
                faces++;
                continue;
            }
            errors.push(new DeclareError(`a Font holds Face children only — not '${c.tag}'`, c.pos));
        }
        const family = el.attrs.find((a) => a.name === "family");
        if (faces > 0 && family !== undefined) {
            errors.push(new DeclareError(`'family' names a system font (a Font with no faces) — a font with faces is named by its object; drop 'family'`, family.pos));
        }
    }
    // Inline declarations (an instance carrying its own members, §5) — on a
    // view and on every non-view family alike (`feed: Feed [ rows: number = 0 ]`
    // is the same one-off subclass `View [ n: number ]` is). On a class body the
    // registration pass already validated and absorbed them into the class's
    // schema (declsOwned), so only namespace membership remains to check below;
    // elsewhere they are validated here, once, and the effective schema carries
    // them for every member check that follows.
    let eff = schema;
    if (schema !== null && !declsOwned && el.decls.length > 0) {
        for (const d of el.decls) {
            const r = checkDecl(schema, d, schema.name, (n) => schemas[n] !== undefined, (n) => CHECK_SHAPES.has(n));
            if (!r.ok)
                errors.push(r.error);
        }
        eff = withDecls(schema, el.decls, (n) => schemas[n] !== undefined, (n) => CHECK_SHAPES.has(n));
    }
    if (schema === null || eff === null) {
        // A SCHEMA used as a tag (typed data): the compiler knows exactly what
        // the name is — say so, never "unknown" (the truthful-diagnostics rule).
        if (CHECK_SHAPES.has(el.tag)) {
            errors.push(new DeclareError(`'${el.tag}' is a schema — a data shape, not a component; it cannot be instantiated. Bind its data to a view (datapath = …), or declare a class for behavior`, el.pos));
        }
        else {
            errors.push(Diag.unknownComponent(el.tag, el.pos, tagCandidates(schemas)));
        }
    }
    else if (descendsFrom(schema, "Layout") && !classRoot) {
        // A layout reached as an element in the tree — anonymous, mis-named, or
        // the root. The doc's ruling (language §5, Appendix A): a layout is an
        // attribute, never a child. (A class-declaration body root is exempt — it
        // is the DEFINITION of a custom layout, not a misplaced use.)
        errors.push(new DeclareError(`'${el.tag}' is a layout — a layout is an attribute, not a child: write 'layout: ${el.tag} [ … ]' on the view it arranges`, el.pos));
        return; // nothing beneath a misplaced layout to salvage
    }
    else if (descendsFrom(schema, "Dataset")) {
        checkDataNode(el, eff, errors, classRoot);
        return; // a data node's whole surface was judged above — no subtree
    }
    else if (descendsFrom(schema, "Animator")) {
        checkAnimatorNode(el, eff, parentSchema, errors, false, classRoot);
        return; // an animator's whole surface is judged here — no subtree
    }
    else if (descendsFrom(schema, "AnimatorGroup")) {
        checkAnimatorGroupNode(el, eff, schemas, parentSchema, errors, false);
        return; // a group judges its whole subtree (its members are animators)
    }
    else if (descendsFrom(schema, "Stream")) {
        // A stream is a source with attributes (streams.md): the same shape
        // check, plus the abstract-base refusal Layout gets.
        if (schema.name === "Stream") {
            errors.push(new DeclareError(`'Stream' is the abstract base — it names no transport. Declare an EventStream (SSE) or a Socket (WebSocket)`, el.pos));
            return;
        }
        checkSourceNode(el, eff, errors);
        return; // a stream's whole surface is judged here — no subtree
    }
    else if (isSourceSchema(schema)) {
        checkSourceNode(el, eff, errors);
        return; // a source's whole surface is judged here — no subtree
    }
    else if (descendsFrom(schema, "State")) {
        checkStateNode(el, eff, schemas, parentSchema, env, errors, classRoot);
        return; // a state judges its whole subtree (overrides + child views)
    }
    else {
        if (el.raw !== undefined) {
            errors.push(new DeclareError(`only a Dataset carries a { } body — a ${el.tag}'s members go in [ ]`, el.raw.pos));
        }
        checkNamespace(el, eff, errors);
        // `key = :field` is replication metadata (language §9): on a child whose
        // datapath matches many, it names each record's STABLE identity so a
        // re-derived collection reconciles by that key (reusing instances) instead
        // of by object identity (rebuilding every fresh object). It is magic ONLY
        // on a replication template — elsewhere `key` is an ordinary attribute
        // name — so the special case can't collide with a real `key` slot.
        const replicated = manyPathOf(el, schemas) !== null;
        for (const attr of el.attrs) {
            // Both are REPLICATION metadata. They sit in View's schema so they
            // document themselves (the reference is generated from those tables) and
            // so a `{ }` body has a declared type to check against — but they mean
            // nothing on a node that replicates nothing, and schema membership alone
            // would make them silently legal there.
            if ((attr.name === "key" || attr.name === "virtualize") && !replicated) {
                errors.push(new DeclareError(`'${attr.name}' is replication metadata — it belongs on a node whose datapath matches many ('datapath = :rows[]'), beside that path. This node replicates nothing, so there is no collection for it to describe`, attr.pos));
                continue;
            }
            // `trackChanges` (the change event) names this node's reactive values:
            // schema attributes and the element's own declarations. Data is heard
            // through an attribute over the path (`kind: string = { :kind }`) — one
            // door. A COMPUTED list is not visible here; the runtime refuses an
            // unknown name when the node arms (change-event.ts trackNode).
            if (attr.name === "trackChanges" && attr.value.kind === "list") {
                for (const it of attr.value.items) {
                    if (it.kind !== "string") {
                        errors.push(new DeclareError(`${schema.name}.trackChanges: a list of attribute names as strings — 'trackChanges = [ "loaded", "kind" ]'`, it.pos));
                    }
                    else if (attrType(schema, it.value) === null && !el.decls.some((d) => d.name === it.value)) {
                        errors.push(new DeclareError(`${schema.name}.trackChanges: '${it.value}' is not a reactive value of ${schema.name} — it names this node's own attributes and facts (to hear a record's field, declare an attribute over the path: 'kind: string = { :kind }')`, it.pos));
                    }
                }
                continue;
            }
            if (attr.name === "key" && replicated) {
                if (attr.value.kind !== "path" || attr.value.many) {
                    errors.push(new DeclareError(`key = :field names each record's identity field (e.g. 'key = :id') — a single :path, not ${attr.value.kind === "path" ? "a many-path" : "a literal"}`, attr.value.pos));
                }
                continue;
            }
            // `virtualize` is replication metadata like `key` (materialization.md;
            // spelled `virtualize` since the 2026-08-02 naming ruling — the
            // MECHANISM stays materialization, the KNOB takes the word its audience
            // arrives with). A BOOLEAN, default false, and a `{ }` constraint is
            // legal: the policy is read inside the replication match, so it engages
            // and disengages reactively. Magic only on a replication template;
            // elsewhere `virtualize` is an ordinary attribute name.
            if (attr.name === "virtualize" && replicated) {
                const v = attr.value;
                const okIdent = v.kind === "ident" && (v.name === "true" || v.name === "false");
                if (!okIdent && v.kind !== "code") {
                    errors.push(new DeclareError(`virtualize = true | false | { … } — virtualize this collection (default false: every record is constructed). It is a boolean because there is no threshold to tune: a windowed block is a flat ~0.06 ms/frame at any size, while constructing every record costs N × per-instance construction`, v.pos));
                }
                continue;
            }
            const t = attrType(eff, attr.name);
            // `theme = Cupertino` — a bare name naming a theme, resolved against the
            // program's `theme` declarations (the built-in presets plus any it
            // declares itself). A Theme-typed slot or a bare `theme` provision takes
            // one; the runtime-free coercion cannot see the declarations, so it is
            // routed here. A `{ }` binding or an inline `Theme [ … ]` record needs no
            // name resolution.
            const themeTyped = (t?.kind === "record" && t.name === "Theme") || (t === null && attr.name === "theme");
            if (themeTyped && attr.value.kind === "ident" && attr.value.name !== "null") {
                if (!env.themes.has(attr.value.name)) {
                    errors.push(new DeclareError(`no theme named '${attr.value.name}' — declared themes: ${[...env.themes].join(", ")}`, attr.value.pos));
                }
                continue;
            }
            // A bare family slot takes a family string or a list of them
            // (`fontFamily = ["Helvetica Neue", "sans-serif"]`). A font is an OBJECT
            // (`brand: Font [ … ]`) reached in a { } — a bare name here names the fix.
            // Validated when PROVIDED too (`App [ fontFamily = … ]`, where the name is
            // a provided value rather than a slot of the node).
            const fontTyped = t?.kind === "font" || (t === null && (attr.name === "fontFamily" || attr.name === "codeFamily"));
            if (fontTyped && ((attr.value.kind === "ident" && attr.value.name !== "null") || attr.value.kind === "list")) {
                const items = attr.value.kind === "ident" ? [attr.value] : attr.value.items;
                for (const i of items) {
                    if (i.kind === "string")
                        continue;
                    errors.push(new DeclareError(i.kind === "ident" ? `'${i.name}' is not a family — ${fontObjectHint(i.name)}` : `a fontFamily list holds family strings`, i.pos));
                }
                continue;
            }
            // A bare `[ … ]` on an array slot is the ORDINARY literal form: the parser
            // already produces a list node and leaves item kinds to the slot ("Which
            // item kinds a slot admits is the checker's", parser.ts). Routed here like
            // the styling lists above, because AttrValue has no array arm — an array
            // reaches its slot as a whole value, not through coerce(). Without this,
            // `rows: array = [1, 2]` was refused and the message sent the author to
            // `{ [1, 2] }`, which spells a static seed as a standing relationship.
            // A bare `[tl, tr, br, bl]` on a radius slot: four numbers, clockwise from
            // the top-left. Routed around coerce() like every list, and refused here
            // by shape — a two-item list is not a shorthand, it is a mistake.
            if (attrType(eff, attr.name)?.kind === "radius" && attr.value.kind === "list") {
                if (attr.value.items.length !== 4 || attr.value.items.some((it) => it.kind !== "number")) {
                    errors.push(new DeclareError(`${eff.name}.${attr.name}: a per-corner radius is four numbers — [topLeft, topRight, bottomRight, bottomLeft], clockwise from the top-left; one number rounds all four`, attr.value.pos));
                }
                continue;
            }
            if (attrType(eff, attr.name)?.kind === "array" && attr.value.kind === "list") {
                for (const it of attr.value.items) {
                    const plain = it.kind === "number" || it.kind === "string" || it.kind === "hexColor" ||
                        (it.kind === "ident" && (it.name === "null" || it.name === "true" || it.name === "false" ||
                            Object.hasOwn(CSS_COLORS, it.name.toLowerCase())));
                    if (!plain) {
                        errors.push(new DeclareError(`${eff.name}.${attr.name}: a bare list holds plain values — numbers, strings, booleans, null, colors. For anything computed, write the whole list as a { } binding`, it.pos));
                    }
                }
                continue;
            }
            const r = checkAttr(eff, attr);
            if (!r.ok)
                errors.push(r.error);
        }
        for (const m of el.methods) {
            const r = checkMethod(eff, m);
            if (!r.ok)
                errors.push(r.error);
        }
        for (const child of el.children) {
            const many = manyPathOf(child, schemas);
            if (many !== null && child.name !== null) {
                errors.push(new DeclareError(`a replicated child cannot be named — ':${many.value.path}[]' makes one instance per record, and '${child.name}' can only name one; reach the instances through their data`, child.pos));
            }
            if (child.name === null)
                continue;
            const declared = attrType(eff, child.name);
            if (declared !== null && declared.kind === "component") {
                // The member `layout: SimpleLayout [ … ]` — a component-typed
                // attribute's VALUE in named-member clothing (the doc's layout
                // surface), not a tree child.
                consumed.add(child);
                errors.push(...checkComponentValue(schemas, schema.name, child.name, declared.of, child));
                errors.push(...checkBaselineAlignment(schemas, child, el));
                continue;
            }
            // A named child is a member of THIS element (language §4: "reachable
            // as `bg` / `this.bg`") — so its name obeys the member namespace.
            const structural = structuralReason(child.name);
            if (NOUNS.includes(child.name)) {
                errors.push(new DeclareError(`'${child.name}' is a scope noun (language §11) — a child cannot take its name`, child.pos));
            }
            else if (structural !== null) {
                errors.push(new DeclareError(`'${child.name}' is ${structural} — a child cannot take its name; choose another`, child.pos));
            }
            else if (declared !== null) {
                errors.push(new DeclareError(`${schema.name}.${child.name} is an attribute — a child may not take an attribute's name`, child.pos));
            }
            else if (!declsOwned && CLASS_MEMBERS.get(el.tag)?.has(child.name) === true) {
                // The use site is configuring the component's own child by redeclaring
                // it. Naming a different child is how to silence this and never what
                // was wanted: it puts a SECOND child beside the styled one. The answer
                // is the attribute door, so the message names it.
                errors.push(new DeclareError(`'${child.name}' is already a member of ${el.tag} — a use site configures a component through its attributes, not by redeclaring its children. Give ${el.tag} an attribute and read it in the child ('text: string = ""' on the class, 'text = { classroot.text }' on '${child.name}')`, child.pos));
            }
        }
    }
    // An unknown parent doesn't silence its subtree — child tags stand on
    // their own, so one typo can't mask every error beneath it. The children's
    // target context for the animation check is the parent's EFFECTIVE schema —
    // base + its inline attribute declarations — so a Spring/animator can target
    // a user-declared numeric attribute, not only a built-in slot. (A class body
    // already absorbed its decls into `schema`; an unknown parent stays null.)
    const childCtx = schema !== null && !declsOwned ? withDecls(schema, el.decls, (n) => schemas[n] !== undefined, (n) => CHECK_SHAPES.has(n)) : schema;
    for (const child of el.children) {
        if (!consumed.has(child))
            checkElement(child, errors, schemas, false, env, childCtx);
    }
}
/** Validate a data node (R8: Dataset / DataSource — descendsFrom "Dataset").
 *  A data node is a NAMED member (bindings reach its lifecycle by name); its
 *  members are a component's — attributes, declarations, methods and handlers
 *  (`onLoad`), checked like any node's — but it has no children: its
 *  structure is its data. A Dataset carries its JSON in the raw `{ }` body
 *  (validated here, positioned), and a DataSource's data arrives from `url`
 *  instead. `:path` attributes are refused: a data node is where data LIVES,
 *  not a reader of some other cursor. A class body (`classRoot`) is the
 *  definition, not a member: it needs no name, and its data may come from
 *  the use site. */
function checkDataNode(el, schema, errors, classRoot) {
    if (el.name === null && !classRoot) {
        errors.push(new DeclareError(`a ${el.tag} needs a name — write 'events: ${el.tag} …' so bindings can reach it`, el.pos));
    }
    if (!descendsFrom(schema, "DataSource")) {
        // A Dataset's value comes from EITHER a literal `{ }` JSON body OR a
        // derived `contents = { … }` constraint — one, not both, not neither
        // (a class body may leave it to the use site; its own `contents` counts
        // at every use site).
        const derived = el.attrs.some((a) => a.name === "contents") || classSets(el.tag, "contents");
        if (el.raw === undefined && !derived && !classRoot) {
            errors.push(new DeclareError(`a Dataset needs data — a literal JSON body ('${el.name ?? "events"}: Dataset { … }') or a derived 'contents = { … }'`, el.pos));
        }
        else if (el.raw !== undefined && derived) {
            errors.push(new DeclareError(`${el.name ?? el.tag}: a Dataset is EITHER a literal '{ … }' body OR a derived 'contents = { … }', not both`, el.raw.pos));
        }
        else if (el.raw !== undefined) {
            try {
                JSON.parse(el.raw.src);
            }
            catch (e) {
                errors.push(new DeclareError(`${el.name ?? el.tag}: the Dataset body is not valid JSON — ${e.message}`, el.raw.pos));
            }
        }
    }
    else if (el.raw !== undefined) {
        errors.push(new DeclareError(`a ${el.tag}'s data arrives from its url — only a Dataset embeds a { } body`, el.raw.pos));
    }
    // Methods and handlers check like any node's: a handler answers a declared
    // event (a DataSource fires `load`, so `onLoad() { … }` is its arrival
    // hook); the built-in lifecycle (fetch, clear, set, …) is guarded at
    // instantiate, the runtime-member fact.
    for (const m of el.methods) {
        const r = checkMethod(schema, m);
        if (!r.ok)
            errors.push(r.error);
    }
    for (const c of el.children) {
        errors.push(new DeclareError(`a data node has no children — its structure is its data`, c.pos));
    }
    for (const a of el.attrs) {
        if (a.name === "contents" && a.value.kind !== "code") {
            // A derived value is a constraint over other state, not a literal or a
            // cursor into itself: `contents = { app.buildGrid() }`.
            errors.push(new DeclareError(`${el.tag}.contents is a derived value — write 'contents = { … }' (a constraint over your reactive state)`, a.value.pos));
            continue;
        }
        if (a.value.kind === "path") {
            errors.push(new DeclareError(`${el.tag}.${a.name} = :${a.value.path}: a data node is where data lives — a :path reads a view's cursor`, a.value.pos));
            continue;
        }
        const r = checkAttr(schema, a);
        if (!r.ok)
            errors.push(r.error);
    }
}
/** Validate an animator node (animation.md §1–§3: descendsFrom "Animator").
 *  Like a data node it is a member that takes attributes only — no new
 *  declarations, no children, no { } body — BUT it carries the on* handlers
 *  (checkMethod against its declared events) and the built-in start()/stop()
 *  (guarded at instantiate, the runtime-member fact). The one animation
 *  compile check lives here, where the PARENT (the animator's target) is in
 *  context. */
/** Is this one of the SOURCE components (sources.ts) — a non-visual member
 *  whose handlers are called from outside the tree — or a program class
 *  descending from one (`class Hot extends Keys`)? Three chains rather than
 *  one base: what unites them is the shape checked below, not an inheritance
 *  relationship. */
function isSourceSchema(schema) {
    return descendsFrom(schema, "Keys") || descendsFrom(schema, "Focus") || descendsFrom(schema, "Tip");
}
/** A source node (`Keys [ onKeyUp(e) { … } ]`, `EventStream [ onMessage(m) { … } ]`):
 *  its own attributes and its handlers, nothing else. Deliberately NOT the
 *  animator path — a source drives no slot, so it has no `attribute`/`to` to
 *  validate. */
function checkSourceNode(el, schema, errors) {
    if (el.raw !== undefined) {
        errors.push(new DeclareError(`only a Dataset carries a { } body — a ${el.tag}'s members go in [ ]`, el.raw.pos));
    }
    for (const c of el.children) {
        errors.push(new DeclareError(`a ${el.tag} takes no children — it delivers events to its handlers, it is not a container`, c.pos));
    }
    for (const a of el.attrs) {
        // A bare `[ … ]` on an array slot (`listenTo = ["delta", "done"]`) — the
        // same literal form the generic walk admits; checkAttr's coercion has no
        // list arm, so it is routed around here exactly as there.
        if (attrType(schema, a.name)?.kind === "array" && a.value.kind === "list") {
            for (const it of a.value.items) {
                const plain = it.kind === "number" || it.kind === "string" || it.kind === "hexColor" ||
                    (it.kind === "ident" && (it.name === "null" || it.name === "true" || it.name === "false"));
                if (!plain) {
                    errors.push(new DeclareError(`${schema.name}.${a.name}: a bare list holds plain values — numbers, strings, booleans, null. For anything computed, write the whole list as a { } binding`, it.pos));
                }
                // `listenTo` names SSE event types, and three names are the transport's
                // own, not channels: "message" is every unnamed event and is always
                // delivered (listing it double-delivered), and "open"/"error" are
                // lifecycle Events with no data — subscribing to one delivered the
                // literal string "undefined" as a message. The list is usually a bare
                // literal, so this is refusable at compile time; a data-borne list is
                // guarded at the transport (stream-seam.ts).
                if (a.name === "listenTo" && it.kind === "string" &&
                    (it.value === "message" || it.value === "open" || it.value === "error")) {
                    errors.push(new DeclareError(`${schema.name}.listenTo: "${it.value}" is the transport's own channel, not an SSE event name — unnamed messages always arrive (drop the entry), the connection's lifecycle is the read-only 'status'/'open'/'error' surface, and failures arrive at onError`, it.pos));
                }
            }
            continue;
        }
        const r = checkAttr(schema, a);
        if (!r.ok)
            errors.push(r.error);
    }
    for (const m of el.methods) {
        const r = checkMethod(schema, m);
        if (!r.ok)
            errors.push(r.error);
    }
}
function checkAnimatorNode(el, schema, parentSchema, errors, 
/** An enclosing AnimatorGroup already provides `attribute` (the LZX
 *  default-cascade) — so a member that omits its own `attribute` is legal. */
attributeCascaded = false, 
/** A class body (`class Reveal extends Spring [ … ]`): the definition, not a
 *  use — it may leave `attribute` to its use sites, and has no target to
 *  check the slot against. */
classRoot = false) {
    if (el.raw !== undefined) {
        errors.push(new DeclareError(`only a Dataset carries a { } body — an ${el.tag}'s members go in [ ]`, el.raw.pos));
    }
    for (const c of el.children) {
        errors.push(new DeclareError(`an animator drives a slot — it has no children`, c.pos));
    }
    // Handlers (onStart/onStop/onRepeat) and any plain method install like a
    // View's; checkMethod verifies a handler answers a declared event.
    for (const m of el.methods) {
        const r = checkMethod(schema, m);
        if (!r.ok)
            errors.push(r.error);
    }
    let hasAttribute = false;
    for (const a of el.attrs) {
        if (a.name === "attribute") {
            hasAttribute = true;
            // A bare token, not a value — the whole point is that a typo dies at
            // compile time (animation.md §1). `{ }` and `:path` are refused here.
            if (a.value.kind === "ident" && a.value.name !== "null") {
                checkTargetSlot(schema, a.value.name, parentSchema, a.value.pos, errors);
                // A SLOT, not a fact: an animator writes its target every tick, and a
                // read-only attribute — the scroll offsets above all — is the platform's
                // report, not a slot Declare controls. The glide belongs to the verb.
                if (parentSchema != null && isReadOnly(parentSchema, a.value.name)) {
                    const scroll = a.value.name === "scrollX" || a.value.name === "scrollY";
                    errors.push(new DeclareError(scroll
                        ? `an animator drives a slot — ${parentSchema.name}.${a.value.name} is a platform fact, not a slot. Glide the scroller with ${a.value.name === "scrollX" ? "scrollToX(x" : "scrollTo(y"}, { duration, motion }) instead`
                        : `an animator drives a slot — ${parentSchema.name}.${a.value.name} is read-only (computed), so it cannot be driven`, a.value.pos));
                }
            }
            else {
                errors.push(new DeclareError(`${schema.name}.attribute names the target slot to drive as a bare token (like 'height' or 'x') — not ${describeLiteral(a.value)}`, a.value.pos));
            }
            continue;
        }
        if (a.value.kind === "path") {
            errors.push(new DeclareError(`${schema.name}.${a.name} = :${a.value.path}: an animator attribute is a value or a { }, not a data read`, a.value.pos));
            continue;
        }
        const r = checkAttr(schema, a);
        if (!r.ok)
            errors.push(r.error);
    }
    if (!hasAttribute && !attributeCascaded && !classRoot && !classSets(el.tag, "attribute")) {
        errors.push(new DeclareError(`an ${el.tag} needs 'attribute = <slot>' — the target slot it drives`, el.pos));
    }
}
/** Validate a state node (docs/system-design/states.md: descendsFrom "State"). Its
 *  body is special and does NOT walk as a generic component: `applied` is the
 *  one control slot (checked against StateSchema — boolean or a `{ }` gate),
 *  every OTHER attribute is an OVERRIDE checked against the ENCLOSING view's
 *  schema (the parent it targets), and the children are a conditional subtree
 *  checked as views in that same parent context. It carries the onApply /
 *  onRemove handlers; it declares no new attributes and takes no `{ }` body. */
function checkStateNode(el, schema, schemas, parentSchema, env, errors, 
/** A class body (`class Wide extends State [ … ]`): the definition — its
 *  overrides target whatever view each use site puts it in. */
classRoot = false) {
    if (el.raw !== undefined) {
        errors.push(new DeclareError(`only a Dataset carries a { } body — a ${el.tag}'s members go in [ ]`, el.raw.pos));
    }
    if (parentSchema === null && !classRoot) {
        errors.push(new DeclareError(`a ${el.tag} must be a member of a view — at the top level it has no slots to override`, el.pos));
    }
    // Handlers (onApply / onRemove) and methods install like a View's.
    for (const m of el.methods) {
        const r = checkMethod(schema, m);
        if (!r.ok)
            errors.push(r.error);
    }
    for (const a of el.attrs) {
        // The state's OWN slots — `applied` (a boolean literal or a { } gate) and
        // any attribute its class declares — check against the state; everything
        // else is an override of the enclosing view.
        if (attrType(schema, a.name) !== null) {
            const r = checkAttr(schema, a);
            if (!r.ok)
                errors.push(r.error);
            continue;
        }
        // Every other attribute overrides the ENCLOSING view — a value or a { },
        // never a data read (the override engine drives a literal or a constraint).
        if (a.value.kind === "path") {
            errors.push(new DeclareError(`${el.tag}.${a.name} = :${a.value.path}: a state override is a value or a { }, not a data read`, a.value.pos));
            continue;
        }
        if (parentSchema === null)
            continue;
        const r = checkAttr(parentSchema, a);
        if (!r.ok)
            errors.push(r.error);
    }
    // Children: a conditional subtree for the enclosing view, checked as views in
    // the parent's context (their target, and the animation-check parent, is the
    // enclosing view — not the State).
    for (const child of el.children) {
        // E-6: `layout: SimpleLayout [ … ]` INSIDE a state — the responsive-switch
        // instinct. The generic layout-as-child guard would tell the author to
        // write exactly what they wrote; the real rule is the STATE context: an
        // override drives value slots, not component slots. Name the idioms.
        const cs = Object.hasOwn(schemas, child.tag) ? schemas[child.tag] : null;
        if (cs !== null && descendsFrom(cs, "Layout")) {
            errors.push(new DeclareError(`a state cannot swap '${child.tag}' in — an override drives the view's value slots, not its layout. Keep one layout and constrain geometry off the state's flag, or reassign the view's layout in an onApply()/onRemove() handler`, child.pos));
            continue;
        }
        checkElement(child, errors, schemas, false, env, parentSchema);
    }
}
/** Validate an animatorgroup (animation.md §1, §4: descendsFrom
 *  "AnimatorGroup"). Like an animator it takes attributes + on* handlers only —
 *  no new declarations, no { } body — but its children ARE its members: each
 *  must be an Animator or a nested AnimatorGroup. The group's target is its
 *  PARENT (same as an animator's; `target =` is deferred), so its own
 *  `attribute` — and every member's — is checked against `parentSchema`, and
 *  that target is threaded UNCHANGED to the members (their target cascades from
 *  the group, not the group itself). A member may omit `attribute` when the
 *  group (or an enclosing group) supplies it — the LZX default-cascade. */
function checkAnimatorGroupNode(el, schema, schemas, parentSchema, errors, attributeCascaded) {
    if (el.raw !== undefined) {
        errors.push(new DeclareError(`only a Dataset carries a { } body — an ${el.tag}'s members go in [ ]`, el.raw.pos));
    }
    for (const m of el.methods) {
        const r = checkMethod(schema, m);
        if (!r.ok)
            errors.push(r.error);
    }
    // The group's own `attribute` (if any) cascades to members that omit theirs.
    let providesAttribute = attributeCascaded;
    for (const a of el.attrs) {
        if (a.name === "attribute") {
            providesAttribute = true;
            if (a.value.kind === "ident" && a.value.name !== "null") {
                checkTargetSlot(schema, a.value.name, parentSchema, a.value.pos, errors);
                // A SLOT, not a fact: an animator writes its target every tick, and a
                // read-only attribute — the scroll offsets above all — is the platform's
                // report, not a slot Declare controls. The glide belongs to the verb.
                if (parentSchema != null && isReadOnly(parentSchema, a.value.name)) {
                    const scroll = a.value.name === "scrollX" || a.value.name === "scrollY";
                    errors.push(new DeclareError(scroll
                        ? `an animator drives a slot — ${parentSchema.name}.${a.value.name} is a platform fact, not a slot. Glide the scroller with ${a.value.name === "scrollX" ? "scrollToX(x" : "scrollTo(y"}, { duration, motion }) instead`
                        : `an animator drives a slot — ${parentSchema.name}.${a.value.name} is read-only (computed), so it cannot be driven`, a.value.pos));
                }
            }
            else {
                errors.push(new DeclareError(`${schema.name}.attribute names the target slot to drive as a bare token (like 'height' or 'x') — not ${describeLiteral(a.value)}`, a.value.pos));
            }
            continue;
        }
        if (a.value.kind === "path") {
            errors.push(new DeclareError(`${schema.name}.${a.name} = :${a.value.path}: an animator attribute is a value or a { }, not a data read`, a.value.pos));
            continue;
        }
        const r = checkAttr(schema, a);
        if (!r.ok)
            errors.push(r.error);
    }
    // Members: animators / nested groups, each targeting the SAME parent (the
    // group's target cascades to them), inheriting `attribute` if the group set it.
    for (const child of el.children) {
        const cs = Object.hasOwn(schemas, child.tag) ? schemas[child.tag] : null;
        if (cs !== null && descendsFrom(cs, "Animator")) {
            checkAnimatorNode(child, cs, parentSchema, errors, providesAttribute);
        }
        else if (cs !== null && descendsFrom(cs, "AnimatorGroup")) {
            checkAnimatorGroupNode(child, cs, schemas, parentSchema, errors, providesAttribute);
        }
        else {
            errors.push(new DeclareError(`an ${el.tag} coordinates animators — '${child.tag}' is not an Animator or AnimatorGroup`, child.pos));
        }
    }
}
/** The one animation compile check (animation.md §3): the `attribute` token
 *  must name a NUMERIC slot (length | number) on the target — the parent
 *  component, since v1's target defaults to the parent (explicit `target =`
 *  deferred). A typo, or a non-numeric slot (`attribute = visible`), is a
 *  positioned compile error — the same shape as the existing `axis = y` enum
 *  check, nothing more. */
function checkTargetSlot(animSchema, slot, parentSchema, pos, errors) {
    if (parentSchema === null)
        return; // no resolvable target — the parent error already fired
    const t = attrType(parentSchema, slot);
    if (t === null) {
        errors.push(new DeclareError(`${animSchema.name}.attribute = ${slot}: ${parentSchema.name} has no slot '${slot}' to animate`, pos));
        return;
    }
    if (t.kind !== "length" && t.kind !== "number" && t.kind !== "radius") {
        errors.push(new DeclareError(`${animSchema.name}.attribute = ${slot}: only numeric slots animate — ${parentSchema.name}.${slot} is not a number`, pos));
    }
}
/** Validate a component-typed attribute's element value (R7: the `layout:`
 *  member). The element must name a component descending from `of`, and carry no
 *  children or methods (a strategy has neither by nature). Attribute values may be
 *  literals OR `{ }` constraints — a layout attribute is reactive like any other
 *  (its setter re-flows: axis re-installs via rearm, spacing is read under
 *  tracking), so a built-in strategy takes `{ }` exactly as a user layout subclass
 *  already does (installLayoutClass). Only a `:path` cursor is refused. One message
 *  source: check() collects these, instantiate() throws the first. */
export function checkComponentValue(schemas, owner, attrName, of, el) {
    const schema = Object.hasOwn(schemas, el.tag) ? schemas[el.tag] : null;
    if (schema === null)
        return [Diag.unknownComponent(el.tag, el.pos, tagCandidates(schemas))];
    if (!descendsFrom(schema, of)) {
        return [new DeclareError(`${owner}.${attrName} expects a ${of} — '${el.tag}' is not one`, el.pos)];
    }
    if (el.tag === "Layout") {
        return [new DeclareError(`${owner}.${attrName}: 'Layout' is the abstract base — it names no arrangement. Use a concrete strategy (SimpleLayout, WrappingLayout, …) or a class extending Layout that supplies place()`, el.pos)];
    }
    const errors = [];
    if (el.raw !== undefined) {
        errors.push(new DeclareError(`a layout takes [ ] members, not a { } body`, el.raw.pos));
    }
    for (const d of el.decls) {
        errors.push(new DeclareError(`${el.tag}.${d.name}: a layout declares no new attributes`, d.pos));
    }
    for (const m of el.methods) {
        errors.push(new DeclareError(`${el.tag}.${m.name}: a layout has no methods — it takes literal attributes only`, m.pos));
    }
    for (const c of el.children) {
        errors.push(new DeclareError(`a layout has no children — it arranges its view's`, c.pos));
    }
    for (const a of el.attrs) {
        if (a.value.kind === "path") {
            errors.push(new DeclareError(`${el.tag}.${a.name} = :${a.value.path}: a layout attribute takes a literal or { } (a :path cursor cannot bind a layout slot)`, a.value.pos));
            continue;
        }
        const r = checkAttr(schema, a);
        if (!r.ok)
            errors.push(r.error);
    }
    return errors;
}
/** `align = baseline` on a layout member, checked against the tree it will
 *  arrange — statically, wherever the checker can see it. A stack has no line
 *  (a y-axis SimpleLayout), so baseline is refused there outright. On a row,
 *  every laid sibling must DECLARE a baseline: a `Text` reports its own; a
 *  composite says which part carries it (`baseline: number = { cap.y +
 *  cap.baseline }`); or it leaves the arrangement with `ignoreLayout`. A
 *  baseline is claimed, never discovered — the layout never reaches into a
 *  child's composition to guess one. The runtime holds the same line for what
 *  only exists at run time (a bound `align`, a created child), contained and
 *  once-reported, so this is the door a mistake meets first. */
function checkBaselineAlignment(schemas, layoutEl, owner) {
    const lit = (el, name) => {
        const a = el.attrs.find((x) => x.name === name);
        return a !== undefined && a.value.kind === "ident" ? a.value.name : null;
    };
    if (lit(layoutEl, "align") !== "baseline")
        return [];
    const errors = [];
    const ls = Object.hasOwn(schemas, layoutEl.tag) ? schemas[layoutEl.tag] : null;
    if (ls !== null && descendsFrom(ls, "SimpleLayout") && (lit(layoutEl, "axis") ?? "y") === "y") {
        errors.push(new DeclareError(stackBaselineMessage(layoutEl.tag), layoutEl.pos));
        return errors;
    }
    const ownerSchema = Object.hasOwn(schemas, owner.tag) ? schemas[owner.tag] : null;
    for (const c of owner.children) {
        if (c === layoutEl || !Object.hasOwn(schemas, c.tag))
            continue;
        // a named member that is itself an attribute value (`reveal: Spring [ ]`)
        // is not a tree child; nor is any non-View — laid() arranges views only
        if (c.name !== null && ownerSchema !== null) {
            const t = attrType(ownerSchema, c.name);
            if (t !== null && t.kind === "component")
                continue;
        }
        const cs = schemas[c.tag];
        if (!descendsFrom(cs, "View"))
            continue; // Text and RichText carry `baseline` in their schemas
        // `ignoreLayout` takes the child out of the arrangement — literally, or by
        // a binding the checker cannot decide (the runtime decides that one)
        const ig = c.attrs.find((a) => a.name === "ignoreLayout");
        if (ig !== undefined && !(ig.value.kind === "ident" && ig.value.name === "false"))
            continue;
        const eff = withDecls(cs, c.decls, (n) => schemas[n] !== undefined, (n) => CHECK_SHAPES.has(n));
        if (attrType(eff, "baseline") !== null)
            continue;
        errors.push(new DeclareError(noBaselineMessage(c.tag, layoutEl.tag), c.pos));
    }
    return errors;
}
/** Attributes, declarations, methods, and named children are ONE member
 *  namespace per element (language §4/§8) — walk them in source order and
 *  flag every reuse, keeping the established wordings for the two same-kind
 *  cases the earlier rungs pinned. */
function checkNamespace(el, schema, errors) {
    const members = [
        ...el.attrs.map((a) => ({ name: a.name, pos: a.pos, kind: "set" })),
        ...el.decls.map((d) => ({ name: d.name, pos: d.pos, kind: "decl" })),
        ...el.methods.map((m) => ({ name: m.name, pos: m.pos, kind: "method" })),
        ...el.children.filter((c) => c.name !== null).map((c) => ({ name: c.name, pos: c.pos, kind: "child" })),
    ].sort((a, b) => a.pos.offset - b.pos.offset);
    const seen = new Map();
    const kindName = { set: "set", decl: "declared", method: "a method", child: "a child" };
    for (const m of members) {
        const first = seen.get(m.name);
        if (first === undefined) {
            seen.set(m.name, m);
            continue;
        }
        const at = `(first at line ${first.pos.line}, col ${first.pos.col})`;
        errors.push(new DeclareError(m.kind === "set" && first.kind === "set"
            ? `${schema.name}.${m.name} is set twice (first set at line ${first.pos.line}, col ${first.pos.col})`
            : m.kind === "method" && first.kind === "method"
                ? `${schema.name}.${m.name} is declared twice ${at}`
                : `${schema.name}.${m.name}: '${m.name}' is already ${kindName[first.kind]} ${at} — members share one namespace`, m.pos));
    }
}
/** Retired spellings (the 2026-07-29 camelCase ruling and the `scrolls` axis
 *  enum) — each names its exact rewrite, so a program written against the old
 *  surface dies with the fix in hand, never with a shrug. */
/** Every attribute name a schema answers to, its base chain included — the
 *  candidate pool for the near-miss below. Same walk `attrType` does, so the
 *  suggestion can only name something the very next compile would accept. */
function attrNames(schema) {
    const out = [];
    for (let sc = schema; sc !== null; sc = sc.base) {
        out.push(...Object.keys(sc.attrs));
        // Handlers are declared as events, not attrs, but they are WRITTEN in the
        // same position and misspelled the same way — `onclick` was the second of
        // the four names the cold reads called out. handlerName() is the one naming
        // rule, so the pool spells them exactly as the next compile would accept.
        for (const e of sc.events ?? [])
            out.push(handlerName(e));
    }
    return [...new Set(out)];
}
/** The suffix for an unknown attribute: a retired spelling names its rewrite, a
 *  CSS name names the Declare slot, and otherwise a calibrated near-miss.
 *
 *  The near-miss is last on purpose — the two tables know the reader's INTENT
 *  ('padding' is not a typo for anything, it is a concept that does not exist
 *  here), while edit distance only knows the letters. It was also the gap the
 *  cold-read rounds kept finding: `fontsize`, `onclick`, `labl` and `colour`
 *  each got a bare "has no attribute", with the whole legal list in hand and
 *  the fix one character away. Those are precisely the errors a model makes. */
function attributeMiss(schema, name) {
    const hint = cssAttributeHint(name);
    if (hint !== "")
        return hint;
    // A near-miss on a HINTED name answers with the hint, not the spelling —
    // the routing and its calibration live in teach.ts (shared with the doc CLI).
    const hinted = hintedForeignName(name);
    if (hinted !== null)
        return cssAttributeHint(hinted);
    const near = nearestName(name, attrNames(schema));
    return near === null ? "" : ` — did you mean '${near}'?`;
}
/** Validate one attribute against a schema. check() collects the errors and
 *  instantiate() throws them — one message source, so the reporting and the
 *  running paths cannot drift apart. */
export function checkAttr(schema, attr) {
    const type = attrType(schema, attr.name);
    if (type === null && BUILTIN_PROVIDED.has(attr.name)) {
        // A PROVISION of a BUILT-IN provided value (the face/theme/rich/icon names):
        // a set of a name the node's class does not declare provides it to the
        // subtree, read by a descendant's `provided("name")`. The value is validated
        // for its own well-formedness — a `{ }` compiles, a literal by its written
        // form — but not against a slot type (provided() is `any`, typed where read).
        // An undeclared name that is NOT a built-in provided value falls through to
        // the near-miss error below: a new provided value is introduced with a type
        // (`density: number = 2`), so a bare unknown name is a typo, not a provision.
        if (attr.bind === "two") {
            return { ok: false, error: new DeclareError(`${schema.name}.${attr.name} <-> …: the two-way arrow edits an editor's value slot — '${attr.name}' is not a slot of ${schema.name}`, attr.pos) };
        }
        if (attr.value.kind === "code") {
            const e = validateExpr(attr.value.src);
            if (e !== null)
                return { ok: false, error: new DeclareError(`${schema.name}.${attr.name} = { … } ${e}`, attr.value.pos) };
            return { ok: true, provision: { name: attr.name, binding: { src: attr.value.src, pos: attr.value.pos } } };
        }
        if (attr.value.kind === "path") {
            return { ok: false, error: new DeclareError(`${schema.name}.${attr.name} = :${attr.value.path}: a provided value is a plain value or a { }, not a datapath`, attr.value.pos) };
        }
        // Any literal form is a valid provision (a scalar, a color, a value
        // constructor, a font list / enum token). It is coerced at instantiation,
        // where the font registry and the reader's face type are in reach
        // (resolveProvisionLiteral) — the checker only rules out the non-literal
        // kinds above.
        return { ok: true, provision: { name: attr.name } };
    }
    if (type === null) {
        // Not a declared slot and not a built-in provided value: a genuine unknown
        // attribute — a typo (named with a near-miss), or a new provided value that
        // must be introduced with a type (`density: number = 2`) rather than bare.
        return { ok: false, error: new DeclareError(`${schema.name} has no attribute '${attr.name}'${attributeMiss(schema, attr.name)}`, attr.pos) };
    }
    if (isReadOnly(schema, attr.name)) {
        // The scroll facts get their own message: the natural mistake is to treat
        // the offset as a slot Declare controls (everything else is), and the fix
        // is a VERB (a request to the scroll process) or the declared start.
        const scroll = attr.name === "scrollY" || attr.name === "scrollX" || attr.name === "scrolling";
        const msg = scroll
            ? `${schema.name}.${attr.name} is a fact the platform reports, not a slot — nothing may set it. To move the scroller, call ${attr.name === "scrollX" ? "scrollToX(x" : "scrollTo(y"}[, { duration, motion }]); for a declared starting offset use ${attr.name === "scrollX" ? "scrollStartX" : "scrollStartY"}`
            : `${schema.name}.${attr.name} is read-only — it is computed, so a constraint may read it but nothing may set it`;
        return { ok: false, error: new DeclareError(msg, attr.pos) };
    }
    // An App is clipped by definition (ruled 2026-07-29): a program owns its
    // rectangle. `clip = false` would promise an un-clipping no realization
    // provides — refused with the rule named. (`clip = true` is legal and
    // redundant; a Shape clip keeps its meaning.)
    if (attr.name === "clip" && descendsFrom(schema, "App") &&
        attr.value.kind === "ident" && attr.value.name === "false") {
        return { ok: false, error: new DeclareError(`${schema.name}.clip = false: an App is clipped by definition — overflow along a declared scroll axis is the page's scroll range, and everything else is out of frame. Remove the attribute (a Shape clip is still legal).`, attr.pos) };
    }
    if (attr.bind === "two") {
        // `name <-> :path` — a two-way binding (language §9, the leaf-input
        // exception): only on an EDITOR's value slot, and only to a single writable
        // datapath. Caught here so misuse is a clear compile error, not a silent
        // one-way (or literal) degrade.
        if (!descendsFrom(schema, "Editor")) {
            return { ok: false, error: new DeclareError(`${schema.name}.${attr.name} <-> …: the two-way arrow edits a dataset value through an editor's value slot (e.g. 'TextInput.text') — ${schema.name} is not an editor`, attr.pos) };
        }
        // The bound field: a static datapath (`:field`) or a `{ }` that NAMES one at
        // runtime (a generic editor over `classroot.field`). Not a literal.
        if (attr.value.kind !== "path" && attr.value.kind !== "code") {
            return { ok: false, error: new DeclareError(`${schema.name}.${attr.name} <-> …: two-way binds a datapath — write '${attr.name} <-> :field' (or '<-> { expr }' for a runtime-named field)`, attr.value.pos) };
        }
        if (attr.value.kind === "path" && attr.value.many) {
            return { ok: false, error: new DeclareError(`${schema.name}.${attr.name} <-> :${attr.value.path}[]: a two-way binding edits one field, not a many-path`, attr.value.pos) };
        }
        // Valid — fall through to the ordinary :path handling, which returns the
        // datapath; instantiate.ts routes a two-way attr to the editor wiring.
    }
    if (attr.value.kind === "code" && type.kind === "component" && type.of === "Layout") {
        // The ONE component slot that stays member-or-null: a layout ATTACHES
        // (the kernel wires it, D-7), so swapping one is a lifecycle act, not a
        // pointer write. Every OTHER component-typed slot may be constrained —
        // L-20 (RULED 2026-09-01): the { } computes WHICH existing node the slot
        // points at. A pointer, re-derived like any value: never creation, never
        // ownership — the node's lifetime stays with its declaration, and
        // repointing tears nothing down. Reads THROUGH such a slot ride the
        // runtime tracking path (dep-extract sends them there): a prewired edge
        // would pin the PREVIOUS node's cells across a repoint.
        return {
            ok: false,
            error: new DeclareError(`${schema.name}.${attr.name} = { … }: the layout slot takes a member ('${attr.name}: SimpleLayout [ … ]') or null — a layout attaches; it is not a pointer to swap by constraint`, attr.value.pos),
        };
    }
    if (attr.value.kind === "code") {
        const e = validateExpr(attr.value.src);
        if (e !== null) {
            return {
                ok: false,
                error: new DeclareError(`${schema.name}.${attr.name} = { … } ${e}`, attr.value.pos),
            };
        }
        return { ok: true, binding: { src: attr.value.src, pos: attr.value.pos } };
    }
    if (attr.value.kind === "path") {
        // A datapath (language §9). On the cursor slot it is the cursor (or the
        // replication form — legality of `[]` is contextual, checked at the
        // element walk); on a value slot it is a standing data read, whose type
        // resolves at runtime until schemas land (the doc's dynamic mode). A
        // many-path never fits a value slot: one slot, many records.
        if (type.kind === "component") {
            return {
                ok: false,
                error: new DeclareError(`${schema.name}.${attr.name} expects a ${type.of} — a :path reads data`, attr.value.pos),
            };
        }
        if (attr.value.many && type.kind !== "cursor") {
            return {
                ok: false,
                error: new DeclareError(`${schema.name}.${attr.name} = :${attr.value.path}[] — a many-path replicates, which is 'datapath's meaning; a value slot reads a single :path`, attr.value.pos),
            };
        }
        // The D4 legality table (jsonpath-spelling.md §4): a SELECTIVE path
        // (slice/wildcard) is legal in value reads and in `:path[]` replication;
        // a write target and a bare cursor are ONE place each — and must be
        // STATIC (a negative index reads the array's length, a live fact).
        if (attr.value.plan !== undefined && staticSegs(attr.value.plan) === null) {
            const why = isSelective(attr.value.plan)
                ? "a selective path (slice/wildcard) matches many"
                : "a negative index resolves against the array's length — a live fact, not a place";
            if (attr.bind === "two") {
                return {
                    ok: false,
                    error: new DeclareError(`'${attr.name} <-> :${attr.value.path}' — a two-way binding writes ONE place; ${why}. Bind the editor to a singular, static path`, attr.value.pos),
                };
            }
            if (type.kind === "cursor" && !attr.value.many) {
                return {
                    ok: false,
                    error: new DeclareError(`datapath = :${attr.value.path} — a cursor is ONE place; ${why}. Read it as a value, or replicate over it: datapath = :${attr.value.path}[]`, attr.value.pos),
                };
            }
        }
        return { ok: true, datapath: { path: attr.value.path, many: attr.value.many, pos: attr.value.pos, plan: attr.value.plan } };
    }
    const c = coerce(type, attr.value);
    if (c.ok && typeof c.value === "object" && c.value !== null && "align" in c.value &&
        attr.name !== "x" && attr.name !== "y") {
        return { ok: false, error: new DeclareError(`${schema.name}.${attr.name} = ${c.value.align}: the position literals center | end are legal on x and y only — a size wants a number or a percent (width = 100%)`, attr.value.pos) };
    }
    if (!c.ok) {
        // A bare identifier in a value slot has exactly two plausible intents —
        // name them both (E-5: `text = label` cost eval cells that `text = { label }`
        // or `text = "label"` would have passed; the type rule alone names no fix).
        // Enum slots excepted: a bare ident there is a token typo, and c.expected
        // already lists the tokens — with one migration carve-out: the retired
        // boolean form of `scrolls` names its exact rewrite.
        const scrollsBool = type.kind === "enum" && type.name === "Scrolls" &&
            attr.value.kind === "ident" && (attr.value.name === "true" || attr.value.name === "false");
        const hint = scrollsBool
            ? ` — scrolls is an axis now: ${attr.value.kind === "ident" && attr.value.name === "true" ? "'scrolls = y' is the old 'scrolls = true'" : "'scrolls = none' is the old 'scrolls = false'"}`
            : attr.value.kind === "ident" && type.kind !== "enum"
                ? ` — write { ${attr.value.name} } to bind the attribute${type.kind === "string" ? `, or "${attr.value.name}" for the literal text` : ""}`
                : "";
        return {
            ok: false,
            error: new DeclareError(`${schema.name}.${attr.name} expects ${c.expected}, got ${c.found ?? describeLiteral(attr.value)}${hint}`, attr.value.pos),
        };
    }
    return { ok: true, value: c.value };
}
/** Validate one method member against a schema (R5): its name must be free
 *  (not an attribute's — methods and attributes are one member namespace,
 *  language §4), a handler-shaped name must answer a declared event (the
 *  typo'd-handler compile error §8 promises), a parameter may not shadow
 *  a scope noun, and the body must be valid statement syntax. Like checkAttr,
 *  check() collects these and instantiate() throws them — one message
 *  source. */
export function checkMethod(schema, m) {
    const err = (message, pos) => ({ ok: false, error: new DeclareError(message, pos) });
    if (attrType(schema, m.name) !== null) {
        return err(`${schema.name}.${m.name} is an attribute — a method may not take an attribute's name`, m.pos);
    }
    if (RESERVED.includes(m.name)) {
        return err(`'${m.name}' is a value constructor (gradient, stroke, shadow, stop, frost, the gradient kinds, the filter functions) — it cannot be a method name`, m.pos);
    }
    const structural = structuralReason(m.name);
    if (structural !== null) {
        return err(`'${m.name}' is ${structural} — a method cannot take its name; choose another`, m.pos);
    }
    // A METHOD named exactly like one of this component's EVENTS is a dead member:
    // the runtime fires the event, which resolves to the `on…` handler, and nothing
    // ever calls the bare name. It compiles, typechecks, and silently does nothing.
    //
    // The case that found this (cold agent run, 2026-08-05): `TextInput` fires
    // `input`, and the value pattern the guide teaches for CONTROLS is `value = { … }`
    // + `input(v)`. That is right for Checkbox/Slider/Segmented — which have no
    // `input` event and really do take an `input` METHOD — and wrong for an editor,
    // where the same spelling is a field that saves nothing, forever. Nothing named
    // the difference, so it shipped into a finished app and was caught end-to-end.
    //
    // Keyed on the schema's own event list rather than on a hardcoded name, so it
    // covers every such collision and cannot fire where the event does not exist.
    // Except where the name is ALSO the built-in's own runtime method (an
    // Animator fires `start` AND implements start()): then the member is not
    // dead but an override — the runtime calls it — and the override rule holds.
    if (eventsOf(schema).includes(m.name) && !runtimeMethodsOf(schema).has(m.name)) {
        return err(`${schema.name}.${m.name}(…) is never called — '${m.name}' is an EVENT here, delivered to '${handlerName(m.name)}'. ` +
            `Rename it to '${handlerName(m.name)}(…)'. (The 'input(v)' value pattern belongs to CONTROLS — Checkbox, Slider, ` +
            `Segmented — which fire no such event; an editor delivers through its event instead.)`, m.pos);
    }
    const event = eventOfHandler(m.name);
    if (event !== null && !eventsOf(schema).includes(event)) {
        const known = eventsOf(schema).map(handlerName);
        // The 2026-07-28 rename: the single-point raw stream is `onPointer*`, not
        // `onMouse*`. Worth its own message rather than the generic list — the old
        // spelling is what every other toolkit taught, and the reason it is wrong
        // here is a FACT about the event, not a naming preference: one handler
        // serves mouse and finger alike, immediately, with no compatibility delay.
        const renamed = /^onMouse(Down|Up|Move|Over|Out)$/.exec(m.name);
        if (renamed !== null) {
            return err(`'${m.name}' is now 'onPointer${renamed[1]}' — one handler serves a mouse and a fingertip alike (the touch-specific stream is 'onTouch…')`, m.pos);
        }
        return err(known.length > 0
            ? `${schema.name} has no '${m.name}' event — its handlers: ${known.join(", ")}`
            : `${schema.name} declares no events, so '${m.name}' can answer nothing`, m.pos);
    }
    const noun = m.params.map((p) => p.name).find((p) => p === "parent" || p === "classroot" || p === "app");
    if (noun !== undefined) {
        return err(`${schema.name}.${m.name}: a parameter may not be named '${noun}' — it is a scope noun (language §11)`, m.pos);
    }
    const e = validateBody(m.params.map((p) => p.name), m.body);
    if (e !== null) {
        return err(`${schema.name}.${m.name}(…) ${e}`, m.bodyPos);
    }
    return { ok: true };
}
//# sourceMappingURL=check.js.map