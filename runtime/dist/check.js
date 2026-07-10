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
import { NeoError } from "./errors.js";
import { SCHEMAS, attrType, isReadOnly, descendsFrom, eventOfHandler, eventsOf, handlerName } from "./schema.js";
import { Diag } from "./diagnostics.js";
import { coerce, declaredType, describeLiteral, DECLARED_TYPE_NAMES } from "./value.js";
import { compileExpr, compileBody, CONSTRUCTOR_NAMES } from "./expr.js";
import { faceWeight, FONT_WEIGHTS } from "./font.js";
const EMPTY_ENV = { bundles: new Map(), stylesheets: new Set(), fonts: new Set(), validated: new Set() };
/** Attribute kinds a stylesheet entry or style bundle may never set —
 *  structural relationships, not values (recorded v1 refusals). */
const UNSTYLABLE = {
    component: "a component slot (layout) is structure",
    cursor: "a data cursor is structure",
    styles: "a bundle list cannot arrive through the styling channels",
    stylesheet: "a stylesheet cannot set the stylesheet",
};
/** The scope nouns of language §11 — never legal as member or parameter names.
 *  `app` is the running-App noun (compiles to `this.root`); reserving it here
 *  keeps it un-shadowable, so `app.hostWidth` always means the App. */
const NOUNS = ["this", "parent", "classroot", "app"];
/** The value-constructor names (styling rung) are reserved as member names:
 *  in call position a body's `gradient(…)` is always the constructor, so a
 *  member wearing the name would be unreachable there. (`fill`/`stroke`/
 *  `shadow` are already View attributes — the ordinary collision rules cover
 *  them; this catches the two that are not.) */
const RESERVED = CONSTRUCTOR_NAMES;
/** Typecheck a parsed tree — a whole Program (classes + root) or a bare
 *  Element fragment. Returns every error found, in source order — an empty
 *  array means the tree is well-typed and safe to instantiate. */
export function check(input) {
    const program = "root" in input ? input : { classes: [], stylesheets: [], styles: [], fonts: [], includes: [], includeSpans: [], root: input };
    const { infos, schemas, errors } = programSchemas(program.classes);
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
    // Members of different kinds interleave freely in source but are checked
    // per kind (attrs, then methods, then the child recursion); a stable sort
    // on position restores the promised source order. Every check error is
    // positioned, so the fallback never actually fires.
    errors.sort((a, b) => (a.pos?.offset ?? 0) - (b.pos?.offset ?? 0));
    return errors;
}
/** Register a program's classes: validate each declaration and produce the
 *  program's schema table — the built-ins plus one ComponentSchema per class,
 *  chained to its base exactly like the built-ins chain (the R2 "R6 plug-in
 *  shape", now plugged in). Per-PROGRAM on purpose: the global SCHEMAS stays
 *  built-ins only, so two programs' classes can never collide.
 *
 *  A base must be declared above its subclass (or be a built-in); children
 *  inside bodies may reference classes declared later — declaration order
 *  constrains inheritance, not composition. A class that (transitively)
 *  contains itself is an error here: it could never finish instantiating. */
export function programSchemas(classes) {
    const infos = [];
    const schemas = { ...SCHEMAS };
    const errors = [];
    for (const decl of classes) {
        if (Object.hasOwn(schemas, decl.name)) {
            errors.push(new NeoError(`there is already a component named '${decl.name}'`, decl.pos));
            continue;
        }
        if (!Object.hasOwn(schemas, decl.base)) {
            errors.push(new NeoError(`unknown base '${decl.base}' — a class extends a built-in component or a class declared above it`, decl.basePos));
            continue; // no schema to chain to; uses of this class report as unknown
        }
        const base = schemas[decl.base];
        // The general rule is that a class may be subclassed like any class. Three
        // roots are WIRED today: View (visual), Layout (a strategy — §5 "…and ones
        // you write"), and Node (the plain atom — a non-visual controller / service
        // / coordinator). The rest is a wiring gap, not a language rule: Dataset and
        // Animator are subclassable IN PRINCIPLE (their construct paths simply don't
        // yet install a subclass's own decls — the same plumbing D-7 did for Layout;
        // note DataSource already IS a Dataset subclass), and State is declarative,
        // with no computation to override. Hence "not wired yet", not "sealed".
        if (!descendsFrom(base, "View") && !descendsFrom(base, "Layout") && !descendsFrom(base, "Node")) {
            errors.push(new NeoError(`subclassing '${decl.base}' is not wired yet — a class extends View, Layout, or Node today (Dataset/Animator want the same plumbing; State is declarative)`, decl.basePos));
            continue;
        }
        const attrs = {};
        const defaults = {};
        const prevailing = [];
        const readOnly = [];
        for (const d of decl.body.decls) {
            const r = checkDecl(base, d, decl.name);
            if (!r.ok) {
                errors.push(r.error);
                continue;
            }
            if (Object.hasOwn(attrs, d.name))
                continue; // the namespace pass reports the duplicate
            attrs[d.name] = r.type;
            defaults[d.name] = r.value;
            if (d.prevailing)
                prevailing.push(d.name);
            if (d.readOnly)
                readOnly.push(d.name);
        }
        const schema = { name: decl.name, base, attrs, prevailing, readOnly };
        schemas[decl.name] = schema;
        infos.push({ decl, schema, defaults });
    }
    // Containment cycles: DFS over "class → user classes used in its body".
    const uses = new Map();
    const collect = (el, into) => {
        for (const child of el.children) {
            if (uses.has(child.tag))
                into.add(child.tag);
            collect(child, into);
        }
    };
    for (const info of infos)
        uses.set(info.decl.name, new Set());
    for (const info of infos)
        collect(info.decl.body, uses.get(info.decl.name));
    for (const info of infos) {
        const seen = new Set();
        const reaches = (name) => {
            if (seen.has(name))
                return false;
            seen.add(name);
            const used = uses.get(name);
            return used !== undefined && (used.has(info.decl.name) || [...used].some(reaches));
        };
        if (uses.get(info.decl.name).has(info.decl.name) || [...uses.get(info.decl.name)].some(reaches)) {
            errors.push(new NeoError(`class ${info.decl.name} contains itself — a class may not appear inside its own body (directly or through another class)`, info.decl.pos));
        }
    }
    return { infos, schemas, errors };
}
// ── Styling declarations: stylesheets + style bundles ───────────────────────
/** Validate a program's `stylesheet`/`style` declarations and produce the
 *  StyleEnv the element walk resolves against. One message source with
 *  instantiate: both consume the same helpers (checkAttr, coerceToken via
 *  checkThemeRecord/checkEntry), so a direct instantiate of an unchecked
 *  tree dies with the same wording. */
export function checkStyleDecls(program, schemas, errors) {
    const bundles = new Map();
    const stylesheets = new Set();
    const fonts = new Set();
    const taken = (name) => Object.hasOwn(schemas, name) || bundles.has(name) || stylesheets.has(name) || fonts.has(name);
    for (const s of program.styles) {
        if (taken(s.name)) {
            errors.push(new NeoError(`there is already a component, stylesheet, style, or font named '${s.name}'`, s.pos));
            continue;
        }
        errors.push(...checkStyleBody(s));
        bundles.set(s.name, s.body);
    }
    for (const s of program.stylesheets) {
        if (taken(s.name)) {
            errors.push(new NeoError(`there is already a component, stylesheet, style, or font named '${s.name}'`, s.pos));
            continue;
        }
        errors.push(...checkStylesheetBody(s, schemas));
        stylesheets.add(s.name);
    }
    for (const f of program.fonts) {
        if (taken(f.name)) {
            errors.push(new NeoError(`there is already a component, stylesheet, style, or font named '${f.name}'`, f.pos));
            continue;
        }
        errors.push(...checkFontBody(f));
        fonts.add(f.name);
    }
    return { bundles, stylesheets, fonts, validated: new Set() };
}
/** A style bundle carries attribute sets only — a look, not a component.
 *  Its fields TYPE against each class it is applied to (checkBundleUse),
 *  so declaration-time checking is shape + the always-wrong names. */
function checkStyleBody(decl) {
    const errors = [];
    const b = decl.body;
    for (const d of b.decls)
        errors.push(new NeoError(`style ${decl.name}: a bundle declares no attributes — it is a look, not a component`, d.pos));
    for (const m of b.methods)
        errors.push(new NeoError(`style ${decl.name}: a bundle has no methods`, m.pos));
    for (const c of b.children)
        errors.push(new NeoError(`style ${decl.name}: a bundle has no children — attribute sets only`, c.pos));
    if (b.raw !== undefined)
        errors.push(new NeoError(`style ${decl.name}: a bundle takes [ ] members, not a { } body`, b.raw.pos));
    return errors;
}
/** A font names a FAMILY that owns its faces (design-docs/fonts.md): an optional
 *  'family = "…"' (defaults to the name) and zero or more `Face` children; no
 *  faces = a system font. Reports every problem (like the bundle check); the
 *  buildFonts in font.ts is the throwing safety net. */
function checkFontBody(decl) {
    const errors = [];
    const b = decl.body;
    for (const d of b.decls)
        errors.push(new NeoError(`font ${decl.name}: a font has no declarations`, d.pos));
    for (const m of b.methods)
        errors.push(new NeoError(`font ${decl.name}: a font has no methods`, m.pos));
    if (b.raw !== undefined)
        errors.push(new NeoError(`font ${decl.name}: a font takes a [ ] body, not { }`, b.raw.pos));
    for (const a of b.attrs) {
        if (a.name === "family") {
            if (a.value.kind !== "string")
                errors.push(new NeoError(`font ${decl.name}: family is a quoted string`, a.value.pos));
            continue;
        }
        errors.push(new NeoError(`font ${decl.name}: a font body carries 'family = "…"' and Face children only — not '${a.name}'`, a.pos));
    }
    let faces = 0;
    for (const c of b.children) {
        if (c.tag !== "Face") {
            errors.push(new NeoError(`font ${decl.name}: '${c.tag}' is not a Face`, c.pos));
            continue;
        }
        errors.push(...checkFace(decl.name, c));
        faces++;
    }
    if (b.attrs.length === 0 && faces === 0) {
        errors.push(new NeoError(`font ${decl.name}: declare a family ('family = "…"') or at least one Face`, decl.pos));
    }
    return errors;
}
/** One `Face [ src, weight?, italic? ]`. src is required; weight is a formalized
 *  token; italic is a boolean. */
function checkFace(fontName, face) {
    const errors = [];
    let hasSrc = false;
    for (const a of face.attrs) {
        if (a.name === "src") {
            errors.push(...checkSource(fontName, a.value));
            hasSrc = true;
            continue;
        }
        if (a.name === "weight") {
            if (a.value.kind !== "ident" || faceWeight(a.value.name) === null)
                errors.push(new NeoError(`font ${fontName}: a Face weight is a token (${Object.keys(FONT_WEIGHTS).join(", ")})`, a.value.pos));
            continue;
        }
        if (a.name === "italic") {
            if (a.value.kind !== "ident" || (a.value.name !== "true" && a.value.name !== "false"))
                errors.push(new NeoError(`font ${fontName}: a Face's italic is true or false`, a.value.pos));
            continue;
        }
        errors.push(new NeoError(`font ${fontName}: a Face has src, weight, italic — not '${a.name}'`, a.pos));
    }
    for (const c of face.children)
        errors.push(new NeoError(`font ${fontName}: a Face has no children`, c.pos));
    if (!hasSrc)
        errors.push(new NeoError(`font ${fontName}: a Face needs a src`, face.pos));
    return errors;
}
/** A Face source: a URL string, `url("…")` / `local("…")`, or a list of those. */
function checkSource(fontName, lit) {
    if (lit.kind === "string")
        return [];
    if (lit.kind === "call") {
        if (lit.name !== "url" && lit.name !== "local")
            return [new NeoError(`font ${fontName}: a face source is a URL string, url("…"), local("…"), or a list — not '${lit.name}(…)'`, lit.pos)];
        if (lit.args.length !== 1 || lit.args[0].kind !== "string")
            return [new NeoError(`font ${fontName}: ${lit.name}(…) takes one quoted string`, lit.pos)];
        return [];
    }
    if (lit.kind === "list") {
        if (lit.items.length === 0)
            return [new NeoError(`font ${fontName}: a face source list is empty`, lit.pos)];
        return lit.items.flatMap((i) => checkSource(fontName, i));
    }
    return [new NeoError(`font ${fontName}: a face source is a URL string, url("…"), local("…"), or a list of them`, lit.pos)];
}
/** Validate one bundle against one applied-to schema (memoized per pairing
 *  by the caller): every field must be an attribute of that class, of a
 *  stylable kind — the loud, positioned failure the ruled design promises. */
function checkBundleUse(bundle, body, schema, at) {
    const errors = [];
    for (const a of body.attrs) {
        const type = attrType(schema, a.name);
        if (type === null) {
            errors.push(new NeoError(`style ${bundle} sets '${a.name}', which ${schema.name} (styled at line ${at.line}, col ${at.col}) does not declare`, a.pos));
            continue;
        }
        const bad = UNSTYLABLE[type.kind];
        if (bad !== undefined) {
            errors.push(new NeoError(`style ${bundle}.${a.name}: ${bad}`, a.pos));
            continue;
        }
        const r = checkAttr(schema, a);
        if (!r.ok)
            errors.push(r.error);
    }
    return errors;
}
/** A stylesheet body: an optional `theme: Theme [ tokens ]` record plus
 *  class-keyed entries (`Button: [ sets ]`), nothing else. Entries validate
 *  against the named class's schema — a stale skin fails loudly (ruled). */
function checkStylesheetBody(decl, schemas) {
    const errors = [];
    const b = decl.body;
    const where = `stylesheet ${decl.name}`;
    for (const a of b.attrs) {
        errors.push(new NeoError(`${where}: a stylesheet carries a theme record and class-keyed entries — write 'theme: Theme [ … ]' or 'ClassName: [ … ]'`, a.pos));
    }
    for (const d of b.decls)
        errors.push(new NeoError(`${where}: a stylesheet declares no attributes`, d.pos));
    for (const m of b.methods)
        errors.push(new NeoError(`${where}: a stylesheet has no methods`, m.pos));
    if (b.raw !== undefined)
        errors.push(new NeoError(`${where}: a stylesheet takes [ ] members, not a { } body`, b.raw.pos));
    const seen = new Map();
    for (const child of b.children) {
        if (child.name === "theme" && child.tag === "Theme") {
            errors.push(...checkThemeRecord(where, child));
            continue;
        }
        if (child.entry !== true) {
            errors.push(new NeoError(`${where}: a stylesheet's members are 'theme: Theme [ … ]' and class-keyed entries ('${child.tag}: [ … ]')`, child.pos));
            continue;
        }
        const schema = Object.hasOwn(schemas, child.tag) ? schemas[child.tag] : null;
        if (schema === null) {
            errors.push(new NeoError(`${where}: unknown component '${child.tag}' — an entry is keyed by a class name`, child.pos));
            continue;
        }
        if (!descendsFrom(schema, "View")) {
            errors.push(new NeoError(`${where}: '${child.tag}' is not a View — only views are styled`, child.pos));
            continue;
        }
        const first = seen.get(child.tag);
        if (first !== undefined) {
            errors.push(new NeoError(`${where}: '${child.tag}' has two entries (first at line ${first.line}, col ${first.col}) — one entry per class`, child.pos));
            continue;
        }
        seen.set(child.tag, child.pos);
        errors.push(...checkEntry(where, child, schema));
    }
    return errors;
}
/** One class-keyed entry: attribute sets only, each an attribute the class
 *  declares (any public attribute — ruled uniformity), of a stylable kind,
 *  a literal or a `{ }` (evaluated with `this` = the styled view). */
export function checkEntry(where, entry, schema) {
    const errors = [];
    for (const d of entry.decls)
        errors.push(new NeoError(`${where}.${entry.tag}: an entry declares nothing — attribute sets only`, d.pos));
    for (const m of entry.methods)
        errors.push(new NeoError(`${where}.${entry.tag}: an entry has no methods`, m.pos));
    for (const c of entry.children)
        errors.push(new NeoError(`${where}.${entry.tag}: an entry has no children — attribute sets only`, c.pos));
    const seen = new Map();
    for (const a of entry.attrs) {
        const first = seen.get(a.name);
        if (first !== undefined) {
            errors.push(new NeoError(`${where}.${entry.tag}.${a.name} is set twice (first set at line ${first.line}, col ${first.col})`, a.pos));
            continue;
        }
        seen.set(a.name, a.pos);
        const type = attrType(schema, a.name);
        if (type === null) {
            errors.push(new NeoError(`${where}: ${entry.tag} has no attribute '${a.name}'`, a.pos));
            continue;
        }
        const bad = UNSTYLABLE[type.kind];
        if (bad !== undefined) {
            errors.push(new NeoError(`${where}.${entry.tag}.${a.name}: ${bad}`, a.pos));
            continue;
        }
        if (a.value.kind === "percent") {
            errors.push(new NeoError(`${where}.${entry.tag}.${a.name}: a percent resolves against a parent — an entry carries values (use a { } reading parent.* if you mean it)`, a.value.pos));
            continue;
        }
        if (a.value.kind === "path") {
            errors.push(new NeoError(`${where}.${entry.tag}.${a.name}: a :path reads a view's cursor — not stylesheet surface (v1)`, a.value.pos));
            continue;
        }
        const r = checkAttr(schema, a);
        if (!r.ok)
            errors.push(r.error);
    }
    return errors;
}
/** The skin's token record: `theme: Theme [ accent = #4F8EF7, radius = 6 ]`
 *  — token names are free (a Theme is schema-less in v1), values are plain
 *  literals or decoration constructors. */
export function checkThemeRecord(where, rec) {
    const errors = [];
    for (const d of rec.decls)
        errors.push(new NeoError(`${where}.theme: a token record declares nothing`, d.pos));
    for (const m of rec.methods)
        errors.push(new NeoError(`${where}.theme: a token record has no methods`, m.pos));
    for (const c of rec.children)
        errors.push(new NeoError(`${where}.theme: a token record has no children`, c.pos));
    const seen = new Map();
    for (const a of rec.attrs) {
        const first = seen.get(a.name);
        if (first !== undefined) {
            errors.push(new NeoError(`${where}.theme.${a.name} is set twice (first set at line ${first.line}, col ${first.col})`, a.pos));
            continue;
        }
        seen.set(a.name, a.pos);
        const t = coerceToken(a.value);
        if (t === undefined) {
            errors.push(new NeoError(`${where}.theme.${a.name}: a token is a number, string, boolean, color, or a value constructor (gradient/stroke/shadow) — got ${describeLiteral(a.value)}`, a.value.pos));
        }
    }
    return errors;
}
/** A theme token's value, or undefined when the literal isn't token-shaped.
 *  Colors coerce through the Color grammar (alpha forms included); the
 *  decoration constructors coerce through their own slots' grammars. */
export function coerceToken(lit) {
    switch (lit.kind) {
        case "number":
            return lit.value;
        case "string":
            return lit.value;
        case "hexColor": {
            const c = coerce({ kind: "color" }, lit);
            return c.ok ? c.value : undefined;
        }
        case "ident": {
            if (lit.name === "true")
                return true;
            if (lit.name === "false")
                return false;
            if (lit.name === "null")
                return null;
            const c = coerce({ kind: "color" }, lit); // named colors
            return c.ok ? c.value : undefined;
        }
        case "call": {
            const asFill = coerce({ kind: "fill" }, lit);
            if (asFill.ok)
                return asFill.value;
            const asStroke = coerce({ kind: "stroke" }, lit);
            if (asStroke.ok)
                return asStroke.value;
            const asShadow = coerce({ kind: "shadow" }, lit);
            return asShadow.ok ? asShadow.value : undefined;
        }
        default:
            return undefined;
    }
}
export function checkDecl(schema, d, owner = schema.name) {
    const err = (message, pos) => ({ ok: false, error: new NeoError(message, pos) });
    if (NOUNS.includes(d.name)) {
        return err(`'${d.name}' is a scope noun (language §11) — it cannot be declared`, d.pos);
    }
    if (RESERVED.includes(d.name)) {
        return err(`'${d.name}' is a value constructor (gradient/stroke/shadow/stop) — it cannot be a member name`, d.pos);
    }
    if (attrType(schema, d.name) !== null) {
        return err(`${schema.name} already has an attribute '${d.name}' — a declaration introduces a new one; write '${d.name} = …' to set the existing one`, d.pos);
    }
    const type = declaredType(d.type);
    if (type === null) {
        return err(`unknown type '${d.type}' — a declared attribute's type is one of ${DECLARED_TYPE_NAMES.join(", ")}`, d.typePos);
    }
    if (d.def === null)
        return { ok: true, type, value: undefined };
    if (d.def.kind === "code") {
        // A default BINDING (styling rung, the ruled R6 unlock): a live
        // per-instance fallback — in effect only while nothing provides the
        // slot, so it never contends with any offer (`labelColor: Color =
        // { theme.buttonText }` is what lets components defer to tokens).
        const c = compileExpr(d.def.src);
        if ("error" in c) {
            return err(`${owner}.${d.name}'s default = { … } ${c.error}`, d.def.pos);
        }
        return { ok: true, type, value: undefined, binding: { src: d.def.src, pos: d.def.pos } };
    }
    if (d.def.kind === "percent") {
        return err(`${owner}.${d.name}: a percent default would resolve against each instance's parent — set it per instance until percent defaults are designed`, d.def.pos);
    }
    const c = coerce(type, d.def);
    if (!c.ok) {
        return err(`${owner}.${d.name}'s default expects ${c.expected}, got ${c.found ?? describeLiteral(d.def)}`, d.def.pos);
    }
    return { ok: true, type, value: c.value };
}
/** An element's schema plus its inline declarations — the anonymous one-off
 *  subclass of language §5, in the checker's currency. Validation of the
 *  decls themselves is the caller's (checkDecl); this only shapes the chain. */
export function withDecls(schema, decls) {
    if (decls.length === 0)
        return schema;
    const attrs = {};
    const prevailing = [];
    for (const d of decls) {
        const r = checkDecl(schema, d);
        if (r.ok && !Object.hasOwn(attrs, d.name)) {
            attrs[d.name] = r.type;
            if (d.prevailing)
                prevailing.push(d.name);
        }
    }
    return { name: schema.name, base: schema, attrs, prevailing };
}
// ── The element walk ────────────────────────────────────────────────────────
/** The many-path attribute (`datapath = :items[]`) that makes an element a
 *  replication template, or null. Type-directed: a many-path on a
 *  cursor-typed slot — today, View.datapath — is what replicates. */
export function manyPathOf(el, schemas) {
    const schema = Object.hasOwn(schemas, el.tag) ? schemas[el.tag] : null;
    if (schema === null)
        return null;
    for (const a of el.attrs) {
        if (a.value.kind === "path" && a.value.many && attrType(schema, a.name)?.kind === "cursor") {
            return a;
        }
    }
    return null;
}
/** A body root cannot be a replication template: the program root is one
 *  view, and a class body replicating ITSELF would make every instantiation
 *  many (put the `:path[]` on the use site instead). */
function checkBodyRootReplication(el, errors, where) {
    const many = el.attrs.find((a) => a.name === "datapath" && a.value.kind === "path" && a.value.many);
    if (many !== undefined) {
        errors.push(new NeoError(`${where} cannot replicate — ':${many.value.path}[]' makes many instances; put it on a child element (or a use site)`, many.value.pos));
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
        errors.push(new NeoError(`'${el.tag}: [ … ]' is a class-keyed entry — it belongs in a stylesheet`, el.pos));
        return;
    }
    // Own-key lookup: a tag named `constructor` must not resolve through
    // Object.prototype.
    const schema = Object.hasOwn(schemas, el.tag) ? schemas[el.tag] : null;
    // Elements consumed as component-typed attribute VALUES (a `layout:` member)
    // are checked by checkComponentValue, not as tree children.
    const consumed = new Set();
    if (schema === null) {
        errors.push(Diag.unknownComponent(el.tag, el.pos));
    }
    else if (descendsFrom(schema, "Layout") && !classRoot) {
        // A layout reached as an element in the tree — anonymous, mis-named, or
        // the root. The doc's ruling (language §5, Appendix A): a layout is an
        // attribute, never a child. (A class-declaration body root is exempt — it
        // is the DEFINITION of a custom layout, not a misplaced use.)
        errors.push(new NeoError(`'${el.tag}' is a layout — a layout is an attribute, not a child: write 'layout: ${el.tag} [ … ]' on the view it arranges`, el.pos));
        return; // nothing beneath a misplaced layout to salvage
    }
    else if (descendsFrom(schema, "Dataset")) {
        checkDataNode(el, schema, errors);
        return; // a data node's whole surface was judged above — no subtree
    }
    else if (descendsFrom(schema, "Animator")) {
        checkAnimatorNode(el, schema, parentSchema, errors);
        return; // an animator's whole surface is judged here — no subtree
    }
    else if (descendsFrom(schema, "AnimatorGroup")) {
        checkAnimatorGroupNode(el, schema, schemas, parentSchema, errors, false);
        return; // a group judges its whole subtree (its members are animators)
    }
    else if (descendsFrom(schema, "State")) {
        checkStateNode(el, schema, schemas, parentSchema, env, errors);
        return; // a state judges its whole subtree (overrides + child views)
    }
    else {
        // Inline declarations (an instance carrying its own members, §5). On a
        // class body the registration pass already validated and absorbed them
        // into the class's schema (declsOwned), so only namespace membership
        // remains to check below.
        if (el.raw !== undefined) {
            errors.push(new NeoError(`only a Dataset carries a { } body — a ${el.tag}'s members go in [ ]`, el.raw.pos));
        }
        let eff = schema;
        if (!declsOwned) {
            for (const d of el.decls) {
                const r = checkDecl(schema, d);
                if (!r.ok)
                    errors.push(r.error);
            }
            eff = withDecls(schema, el.decls);
        }
        checkNamespace(el, eff, errors);
        for (const attr of el.attrs) {
            const t = attrType(eff, attr.name);
            // The two styling-channel slots resolve against PROGRAM declarations,
            // which the runtime-free coercion cannot see — routed here.
            if (t?.kind === "styles" && attr.value.kind === "list") {
                for (const n of attr.value.items) {
                    if (n.kind !== "ident") {
                        errors.push(new NeoError(`a style list holds style names, not values`, n.pos));
                        continue;
                    }
                    const bundle = env.bundles.get(n.name);
                    if (bundle === undefined) {
                        errors.push(new NeoError(env.bundles.size > 0
                            ? `no style named '${n.name}' — declared styles: ${[...env.bundles.keys()].join(", ")}`
                            : `no style named '${n.name}' — this program declares no style bundles`, n.pos));
                        continue;
                    }
                    // A bundle types against the class it lands on — once per pairing.
                    const key = `${n.name}@${eff.name}`;
                    if (!env.validated.has(key)) {
                        env.validated.add(key);
                        errors.push(...checkBundleUse(n.name, bundle, eff, n.pos));
                    }
                }
                continue;
            }
            if (t?.kind === "styles" && attr.value.kind === "code") {
                errors.push(new NeoError(`${eff.name}.styles = { … }: the bundle list is static (ruled v1) — conditional looks are constraints on the slots themselves`, attr.value.pos));
                continue;
            }
            if (t?.kind === "stylesheet" && attr.value.kind === "ident" && attr.value.name !== "null") {
                if (!env.stylesheets.has(attr.value.name)) {
                    errors.push(new NeoError(env.stylesheets.size > 0
                        ? `no stylesheet named '${attr.value.name}' — declared stylesheets: ${[...env.stylesheets].join(", ")}`
                        : `no stylesheet named '${attr.value.name}' — this program declares no stylesheets`, attr.value.pos));
                }
                continue;
            }
            // `fontFamily = Name` / `[Name, "Helvetica", "sans-serif"]` resolves
            // against the program's `font` declarations — a name must be declared, a
            // string passes as a raw family (a bare string family falls through to
            // coercion). Routed here for the same reason as stylesheet — runtime-free
            // coercion cannot see the declarations.
            if (t?.kind === "font" && ((attr.value.kind === "ident" && attr.value.name !== "null") || attr.value.kind === "list")) {
                const items = attr.value.kind === "ident" ? [attr.value] : attr.value.items;
                for (const i of items) {
                    if (i.kind === "string")
                        continue;
                    if (i.kind !== "ident") {
                        errors.push(new NeoError(`a fontFamily list holds font names and strings`, i.pos));
                        continue;
                    }
                    if (!env.fonts.has(i.name)) {
                        errors.push(new NeoError(env.fonts.size > 0
                            ? `no font named '${i.name}' — declared fonts: ${[...env.fonts].join(", ")}`
                            : `no font named '${i.name}' — this program declares no fonts (use a raw family string, or add a 'font ${i.name} [ … ]')`, i.pos));
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
                errors.push(new NeoError(`a replicated child cannot be named — ':${many.value.path}[]' makes one instance per record, and '${child.name}' can only name one; reach the instances through their data`, child.pos));
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
                continue;
            }
            // A named child is a member of THIS element (language §4: "reachable
            // as `bg` / `this.bg`") — so its name obeys the member namespace.
            if (NOUNS.includes(child.name)) {
                errors.push(new NeoError(`'${child.name}' is a scope noun (language §11) — a child cannot take its name`, child.pos));
            }
            else if (declared !== null) {
                errors.push(new NeoError(`${schema.name}.${child.name} is an attribute — a child may not take an attribute's name`, child.pos));
            }
        }
    }
    // An unknown parent doesn't silence its subtree — child tags stand on
    // their own, so one typo can't mask every error beneath it. The children's
    // target context for the animation check is the parent's EFFECTIVE schema —
    // base + its inline attribute declarations — so a Spring/animator can target
    // a user-declared numeric attribute, not only a built-in slot. (A class body
    // already absorbed its decls into `schema`; an unknown parent stays null.)
    const childCtx = schema !== null && !declsOwned ? withDecls(schema, el.decls) : schema;
    for (const child of el.children) {
        if (!consumed.has(child))
            checkElement(child, errors, schemas, false, env, childCtx);
    }
}
/** Validate a data node (R8: Dataset / DataSource — descendsFrom "Dataset").
 *  A data node is a NAMED member (bindings reach its lifecycle by name), it
 *  takes attributes only (its behavior is built in — no declarations,
 *  methods, or children), a Dataset carries its JSON in the raw `{ }` body
 *  (validated here, positioned), and a DataSource's data arrives from `url`
 *  instead. `:path` attributes are refused: a data node is where data LIVES,
 *  not a reader of some other cursor. */
function checkDataNode(el, schema, errors) {
    if (el.name === null) {
        errors.push(new NeoError(`a ${el.tag} needs a name — write 'events: ${el.tag} …' so bindings can reach it`, el.pos));
    }
    if (el.tag === "Dataset") {
        if (el.raw === undefined) {
            errors.push(new NeoError(`a Dataset carries its JSON body: '${el.name ?? "events"}: Dataset { … }'`, el.pos));
        }
        else {
            try {
                JSON.parse(el.raw.src);
            }
            catch (e) {
                errors.push(new NeoError(`${el.name ?? el.tag}: the Dataset body is not valid JSON — ${e.message}`, el.raw.pos));
            }
        }
    }
    else if (el.raw !== undefined) {
        errors.push(new NeoError(`a ${el.tag}'s data arrives from its url — only a Dataset embeds a { } body`, el.raw.pos));
    }
    for (const d of el.decls) {
        errors.push(new NeoError(`${el.tag}.${d.name}: a data node declares no new attributes`, d.pos));
    }
    for (const m of el.methods) {
        errors.push(new NeoError(`${el.tag}.${m.name}: a data node has no method members — its lifecycle (fetch, clear, set, …) is built in`, m.pos));
    }
    for (const c of el.children) {
        errors.push(new NeoError(`a data node has no children — its structure is its data`, c.pos));
    }
    for (const a of el.attrs) {
        if (a.value.kind === "path") {
            errors.push(new NeoError(`${el.tag}.${a.name} = :${a.value.path}: a data node is where data lives — a :path reads a view's cursor`, a.value.pos));
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
function checkAnimatorNode(el, schema, parentSchema, errors, 
/** An enclosing AnimatorGroup already provides `attribute` (the LZX
 *  default-cascade) — so a member that omits its own `attribute` is legal. */
attributeCascaded = false) {
    if (el.raw !== undefined) {
        errors.push(new NeoError(`only a Dataset carries a { } body — an ${el.tag}'s members go in [ ]`, el.raw.pos));
    }
    for (const d of el.decls) {
        errors.push(new NeoError(`${el.tag}.${d.name}: an animator declares no new attributes — its surface is built in`, d.pos));
    }
    for (const c of el.children) {
        errors.push(new NeoError(`an animator drives a slot — it has no children`, c.pos));
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
            }
            else {
                errors.push(new NeoError(`${schema.name}.attribute names the target slot to drive as a bare token (like 'height' or 'x') — not ${describeLiteral(a.value)}`, a.value.pos));
            }
            continue;
        }
        if (a.value.kind === "path") {
            errors.push(new NeoError(`${schema.name}.${a.name} = :${a.value.path}: an animator attribute is a value or a { }, not a data read`, a.value.pos));
            continue;
        }
        const r = checkAttr(schema, a);
        if (!r.ok)
            errors.push(r.error);
    }
    if (!hasAttribute && !attributeCascaded) {
        errors.push(new NeoError(`an ${el.tag} needs 'attribute = <slot>' — the target slot it drives`, el.pos));
    }
}
/** Validate a state node (design-docs/states.md: descendsFrom "State"). Its
 *  body is special and does NOT walk as a generic component: `applied` is the
 *  one control slot (checked against StateSchema — boolean or a `{ }` gate),
 *  every OTHER attribute is an OVERRIDE checked against the ENCLOSING view's
 *  schema (the parent it targets), and the children are a conditional subtree
 *  checked as views in that same parent context. It carries the onApply /
 *  onRemove handlers; it declares no new attributes and takes no `{ }` body. */
function checkStateNode(el, schema, schemas, parentSchema, env, errors) {
    if (el.raw !== undefined) {
        errors.push(new NeoError(`only a Dataset carries a { } body — a ${el.tag}'s members go in [ ]`, el.raw.pos));
    }
    for (const d of el.decls) {
        errors.push(new NeoError(`${el.tag}.${d.name}: a state declares no new attributes — it overrides its view's slots and adds children`, d.pos));
    }
    if (parentSchema === null) {
        errors.push(new NeoError(`a ${el.tag} must be a member of a view — at the top level it has no slots to override`, el.pos));
    }
    // Handlers (onApply / onRemove) install like a View's.
    for (const m of el.methods) {
        const r = checkMethod(schema, m);
        if (!r.ok)
            errors.push(r.error);
    }
    for (const a of el.attrs) {
        if (a.name === "applied") {
            const r = checkAttr(schema, a); // boolean literal or a { } gate
            if (!r.ok)
                errors.push(r.error);
            continue;
        }
        // Every other attribute overrides the ENCLOSING view — a value or a { },
        // never a data read (the override engine drives a literal or a constraint).
        if (a.value.kind === "path") {
            errors.push(new NeoError(`${el.tag}.${a.name} = :${a.value.path}: a state override is a value or a { }, not a data read`, a.value.pos));
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
        errors.push(new NeoError(`only a Dataset carries a { } body — an ${el.tag}'s members go in [ ]`, el.raw.pos));
    }
    for (const d of el.decls) {
        errors.push(new NeoError(`${el.tag}.${d.name}: an animatorgroup declares no new attributes — its surface is built in`, d.pos));
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
            }
            else {
                errors.push(new NeoError(`${schema.name}.attribute names the target slot to drive as a bare token (like 'height' or 'x') — not ${describeLiteral(a.value)}`, a.value.pos));
            }
            continue;
        }
        if (a.value.kind === "path") {
            errors.push(new NeoError(`${schema.name}.${a.name} = :${a.value.path}: an animator attribute is a value or a { }, not a data read`, a.value.pos));
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
            errors.push(new NeoError(`an ${el.tag} coordinates animators — '${child.tag}' is not an Animator or AnimatorGroup`, child.pos));
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
        errors.push(new NeoError(`${animSchema.name}.attribute = ${slot}: ${parentSchema.name} has no slot '${slot}' to animate`, pos));
        return;
    }
    if (t.kind !== "length" && t.kind !== "number") {
        errors.push(new NeoError(`${animSchema.name}.attribute = ${slot}: only numeric slots animate — ${parentSchema.name}.${slot} is not a number`, pos));
    }
}
/** Validate a component-typed attribute's element value (R7: the `layout:`
 *  member). The element must name a component descending from `of`, and —
 *  this rung — carry literal attributes only: a strategy has no children or
 *  methods by nature, and `{ }`-driven layout attributes are a recorded open
 *  question. One message source: check() collects these, instantiate()
 *  throws the first. */
export function checkComponentValue(schemas, owner, attrName, of, el) {
    const schema = Object.hasOwn(schemas, el.tag) ? schemas[el.tag] : null;
    if (schema === null)
        return [Diag.unknownComponent(el.tag, el.pos)];
    if (!descendsFrom(schema, of)) {
        return [new NeoError(`${owner}.${attrName} expects a ${of} — '${el.tag}' is not one`, el.pos)];
    }
    const errors = [];
    if (el.raw !== undefined) {
        errors.push(new NeoError(`a layout takes [ ] members, not a { } body`, el.raw.pos));
    }
    for (const d of el.decls) {
        errors.push(new NeoError(`${el.tag}.${d.name}: a layout declares no new attributes`, d.pos));
    }
    for (const m of el.methods) {
        errors.push(new NeoError(`${el.tag}.${m.name}: a layout has no methods — it takes literal attributes only`, m.pos));
    }
    for (const c of el.children) {
        errors.push(new NeoError(`a layout has no children — it arranges its view's`, c.pos));
    }
    for (const a of el.attrs) {
        if (a.value.kind === "code") {
            errors.push(new NeoError(`${el.tag}.${a.name} = { … }: a layout attribute takes a literal — constraining it is not yet surface (swap the whole layout by assignment instead)`, a.value.pos));
            continue;
        }
        if (a.value.kind === "path") {
            errors.push(new NeoError(`${el.tag}.${a.name} = :${a.value.path}: a layout attribute takes a literal`, a.value.pos));
            continue;
        }
        const r = checkAttr(schema, a);
        if (!r.ok)
            errors.push(r.error);
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
        errors.push(new NeoError(m.kind === "set" && first.kind === "set"
            ? `${schema.name}.${m.name} is set twice (first set at line ${first.pos.line}, col ${first.pos.col})`
            : m.kind === "method" && first.kind === "method"
                ? `${schema.name}.${m.name} is declared twice ${at}`
                : `${schema.name}.${m.name}: '${m.name}' is already ${kindName[first.kind]} ${at} — members share one namespace`, m.pos));
    }
}
/** Validate one attribute against a schema. check() collects the errors and
 *  instantiate() throws them — one message source, so the reporting and the
 *  running paths cannot drift apart. */
export function checkAttr(schema, attr) {
    const type = attrType(schema, attr.name);
    if (type === null) {
        return { ok: false, error: new NeoError(`${schema.name} has no attribute '${attr.name}'`, attr.pos) };
    }
    if (isReadOnly(schema, attr.name)) {
        return { ok: false, error: new NeoError(`${schema.name}.${attr.name} is read-only — it is computed, so a constraint may read it but nothing may set it`, attr.pos) };
    }
    if (attr.value.kind === "code" && type.kind === "component") {
        // The doc promises a swappable/constrainable layout slot; the swap is a
        // plain assignment today, the `{ }` form is a recorded open question.
        return {
            ok: false,
            error: new NeoError(`${schema.name}.${attr.name} = { … }: a component slot takes a member ('${attr.name}: SimpleLayout [ … ]') or null — constraining it is not yet surface`, attr.value.pos),
        };
    }
    if (attr.value.kind === "code") {
        const c = compileExpr(attr.value.src);
        if ("error" in c) {
            return {
                ok: false,
                error: new NeoError(`${schema.name}.${attr.name} = { … } ${c.error}`, attr.value.pos),
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
                error: new NeoError(`${schema.name}.${attr.name} expects a ${type.of} — a :path reads data`, attr.value.pos),
            };
        }
        if (attr.value.many && type.kind !== "cursor") {
            return {
                ok: false,
                error: new NeoError(`${schema.name}.${attr.name} = :${attr.value.path}[] — a many-path replicates, which is 'datapath's meaning; a value slot reads a single :path`, attr.value.pos),
            };
        }
        return { ok: true, datapath: { path: attr.value.path, many: attr.value.many, pos: attr.value.pos } };
    }
    const c = coerce(type, attr.value);
    if (!c.ok) {
        return {
            ok: false,
            error: new NeoError(`${schema.name}.${attr.name} expects ${c.expected}, got ${c.found ?? describeLiteral(attr.value)}`, attr.value.pos),
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
    const err = (message, pos) => ({ ok: false, error: new NeoError(message, pos) });
    if (attrType(schema, m.name) !== null) {
        return err(`${schema.name}.${m.name} is an attribute — a method may not take an attribute's name`, m.pos);
    }
    if (RESERVED.includes(m.name)) {
        return err(`'${m.name}' is a value constructor (gradient/stroke/shadow/stop) — it cannot be a member name`, m.pos);
    }
    const event = eventOfHandler(m.name);
    if (event !== null && !eventsOf(schema).includes(event)) {
        const known = eventsOf(schema).map(handlerName);
        return err(known.length > 0
            ? `${schema.name} has no '${m.name}' event — its handlers: ${known.join(", ")}`
            : `${schema.name} declares no events, so '${m.name}' can answer nothing`, m.pos);
    }
    const noun = m.params.find((p) => p === "parent" || p === "classroot" || p === "app");
    if (noun !== undefined) {
        return err(`${schema.name}.${m.name}: a parameter may not be named '${noun}' — it is a scope noun (language §11)`, m.pos);
    }
    const c = compileBody(m.params, m.body);
    if ("error" in c) {
        return err(`${schema.name}.${m.name}(…) ${c.error}`, m.bodyPos);
    }
    return { ok: true };
}
//# sourceMappingURL=check.js.map