// program-schema — the schema half of a program's user classes: class
// registration (one ClassSchema per class, chained to its base), effective
// schemas (a class plus an element's inline declarations), declaration checking,
// replication detection, and the literal provision. Split from check.ts so the
// validator proper is separable from the schema work both the checker and the
// router (route.ts) build on.
//
// It runs where schemas are wanted: in the checker, in the compiler (which
// routes the program it checked, so a built program needs no schemas at run
// time), and in the router a build carries for trees that arrive unrouted. A
// production build of a routed program carries none of it. (Until the program
// arrived routed, every production bundle shipped this module and rebuilt the
// class schemas at boot; instantiate asked them how to wire each attribute.)
//
// Everything here leans only on the schemas (schema.ts), the value vocabulary
// (value.ts), and the expression validator (expr.ts).
import { DeclareError, diag, insetOrRadiusMessage } from "./errors.js";
import { SCHEMAS, ABSTRACT_SCHEMAS, ABSTRACT_CONCRETE, attrType, isReadOnly, TextSchema, RichTextSchema } from "./schema.js";
import { fontObjectHint } from "./font-value.js";
import { coerce, coerceToken, declaredType, describeLiteral, noteLiteral, parseLiteralUnion, DECLARED_TYPE_NAMES } from "./value.js";
export { coerceToken };
/** The default (no schemas declared) — one shared frozen set. */
const EMPTY_SHAPES = new Set();
import { validateExpr, CONSTRUCTOR_NAMES, FILTER_FN_NAMES } from "./expr.js";
/** The scope nouns of language §11 — never legal as member or parameter names.
 *  `app` is the running-App noun (compiles to `this.root`); reserving it here
 *  keeps it un-shadowable, so `app.hostWidth` always means the App. */
export const NOUNS = ["this", "parent", "classroot", "app"];
/** The value-constructor names are reserved as member names:
 *  in call position a body's `gradient(…)` is always the constructor, so a
 *  member wearing the name would be unreachable there. (`fill`/`stroke`/
 *  `shadow` are already View attributes — the ordinary collision rules cover
 *  them; this catches the two that are not.) */
export const RESERVED = CONSTRUCTOR_NAMES;
/** The other two node references the scaffold declares on every View, beside the
 *  §11 nouns above (scaffold.ts groups all four: parent / classroot / root /
 *  children). They are NOT scope nouns — §11 lists four and neither of these is
 *  one; `root` is the under-the-hood spelling `app` compiles to, and `children`
 *  is Node's own child list. But neither is a schema attribute either, so the
 *  ordinary "a child may not take an attribute's name" rules miss them, and
 *  shadowing one breaks code that never mentions it.
 *
 *  `root` is the sharp case. Because `app` compiles to `this.root`, a member
 *  named `root` makes every `{ app.… }` in the SAME class resolve `app` against
 *  the shadow — so the failure surfaces as "'k' is not a member of View" at the
 *  binding's line, blaming an app attribute several lines from the name that
 *  actually took the reference. Caught here so the report names the cause.
 *  (The runtime already refuses these at instantiate; that check stands, but it
 *  fires at boot, after typecheck has had its misleading say.) */
export const STRUCTURAL = {
    root: "the node reference `app` compiles to (`app` is `this.root`)",
    children: "the node's own child list",
};
/** The reason a name is structural, or null if it is free to use. */
export function structuralReason(name) {
    return Object.hasOwn(STRUCTURAL, name) ? STRUCTURAL[name] : null;
}
/** Register a program's classes: validate each declaration and produce the
 *  program's schema table — the built-ins plus one ClassSchema per class,
 *  chained to its base exactly like the built-ins chain (the R2 "R6 plug-in
 *  shape", now plugged in). Per-PROGRAM on purpose: the global SCHEMAS stays
 *  built-ins only, so two programs' classes can never collide.
 *
 *  Declaration order constrains NOTHING (ruled 2026-08-06): a base may be
 *  declared anywhere in the program — the build below runs in dependency
 *  order regardless of source order — and children inside bodies were always
 *  order-free. The two unbuildable shapes are loud errors here: an `extends`
 *  cycle (the chain can never bottom out) and a class that (transitively)
 *  contains itself (it could never finish instantiating). */
export function programSchemas(classes, shapes = EMPTY_SHAPES) {
    const infos = [];
    const schemas = { ...SCHEMAS };
    const errors = [];
    const isShape = (n) => shapes.has(n);
    // Every class NAME up front, so an attribute may be typed by a class declared
    // later — or by its own (`class Menu extends Node [ child: Menu = null ]`, the shape a
    // submenu chain needs). A class AttrType stores only the name, so no
    // schema has to exist yet; the scaffold emits the classes base-before-derived
    // regardless of source order. `extends` needs the base's ATTRIBUTES to build
    // the chain, so the loop below runs base-before-derived too — by RECURSING
    // into a not-yet-built user base, never by demanding the author sort the file.
    const classNames = new Set(classes.map((c) => c.name));
    const isKnownClass = (n) => Object.hasOwn(schemas, n) || classNames.has(n);
    // Duplicate names report in FILE order (stable messages), before build order
    // reshuffles anything; later duplicates drop out of the build entirely.
    const byName = new Map();
    for (const decl of classes) {
        if (Object.hasOwn(SCHEMAS, decl.name)) {
            errors.push(new DeclareError(`'${decl.name}' is a built-in class — a class of the program can't take its name; rename yours`, decl.pos));
            continue;
        }
        if (byName.has(decl.name)) {
            errors.push(new DeclareError(`there is already a class named '${decl.name}'`, decl.pos));
            continue;
        }
        byName.set(decl.name, decl);
    }
    const state = new Map();
    const build = (decl) => {
        if (state.get(decl.name) === "done")
            return;
        if (state.get(decl.name) === "building")
            return; // cycle — reported by the guard below
        state.set(decl.name, "building");
        if (!Object.hasOwn(schemas, decl.base)) {
            const userBase = byName.get(decl.base);
            if (userBase !== undefined) {
                // An `extends` cycle can never bottom out — name the loop at the decl
                // whose base closes it, and leave both unbuilt (uses report unknown).
                if (state.get(decl.base) === "building") {
                    errors.push(new DeclareError(`'${decl.name}' and '${decl.base}' extend each other (an inheritance cycle) — the chain can never reach a built-in; break the loop`, decl.basePos));
                    state.set(decl.name, "done");
                    return;
                }
                build(userBase); // dependency first — source order is the author's business
            }
        }
        if (!Object.hasOwn(schemas, decl.base)) {
            // A user base that FAILED to build already reported its own cause (a
            // cycle, an unknown base of its own) — an "unknown base" echo here
            // would bury the real message under position-sorted noise.
            if (!byName.has(decl.base)) {
                errors.push(new DeclareError(`unknown base '${decl.base}' — a class extends a library class or one declared in this program`, decl.basePos));
            }
            state.set(decl.name, "done");
            return; // no schema to chain to; uses of this class report as unknown
        }
        const base = schemas[decl.base];
        // Any built-in class is a base. A class extends View, Layout, Node,
        // Dataset, Spring, Keys, State — every family alike — and gets the base's
        // attributes and behaviour plus its own declared attributes, constraints
        // and methods; the runtime builds every family through the one class-chain
        // install (instantiate.ts). The single refusal is an ABSTRACT base: a
        // schema no runtime class implements (Stream, Media, Editor) has nothing
        // to construct, so a class extends a concrete member of that family.
        if (ABSTRACT_SCHEMAS.has(decl.base)) {
            errors.push(new DeclareError(`'${decl.base}' is an abstract base — it names no class to construct; extend one of its concrete members (${ABSTRACT_CONCRETE[decl.base] ?? "a built-in that descends from it"})`, decl.basePos));
            state.set(decl.name, "done");
            return;
        }
        const attrs = {};
        const defaults = {};
        const readOnly = [];
        for (const d of decl.body.decls) {
            const r = checkDecl(base, d, decl.name, isKnownClass, isShape);
            if (!r.ok)
                errors.push(r.error);
            if (!r.ok && r.type === undefined)
                continue;
            if (Object.hasOwn(attrs, d.name))
                continue; // the namespace pass reports the duplicate
            attrs[d.name] = r.type;
            defaults[d.name] = r.ok ? r.value : undefined;
            if (d.readOnly)
                readOnly.push(d.name);
        }
        const schema = { name: decl.name, base, attrs, readOnly };
        schemas[decl.name] = schema;
        infos.push({ decl, schema, defaults });
        state.set(decl.name, "done");
    };
    for (const decl of byName.values())
        build(decl);
    // Containment cycles: DFS over "class → user classes used in its body".
    const uses = new Map();
    // A child carrying a MANY-datapath is a LAZY edge: it never constructs during
    // expansion (the parent gets a Replicator; instances materialize one per record,
    // and an empty match is the base case), so recursion through it is data-bounded
    // and terminates. Only a cycle whose every edge is EAGER can never finish
    // instantiating — that is the shape this walk exists to reject.
    const collect = (el, into) => {
        for (const child of el.children) {
            if (manyPathOf(child, schemas) !== null)
                continue;
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
            errors.push(new DeclareError(`class ${info.decl.name} contains itself — a class may not appear inside its own body (directly or through another class)`, info.decl.pos));
        }
    }
    return { infos, schemas, errors };
}
/** The value a LITERAL provision provides (`View [ textColor = navy ]`). A
 *  provision has no declared slot on the providing node, but its NAME may match
 *  a text FACE value (`fontFamily`, `fontWeight`, `textColor`, …), and then it
 *  coerces exactly as that slot would — a `fontFamily = ["Georgia", "serif"]`
 *  joins into one family chain, a `fontWeight = normal` keeps the token — so the
 *  reader (`Text`'s `provided("fontFamily")`) gets a well-formed value. A name
 *  no face value claims (`accent`, `density`) coerces by its written form.
 *  Undefined when no form admits the literal. The one context-dependent
 *  provision, a `theme` naming a theme, is the instantiation's (instantiate.ts);
 *  the checker computes every other one here, so the compile can ship it as its
 *  value (compiler/src/lower-literals.ts). */
export function provisionValue(attr) {
    const v = attr.value;
    if (v.kind === "value")
        return v.value;
    // Coerce by the KNOWN face/rich type. The type matters where a token is
    // ambiguous: `headingWeight = black` is the weight token, not the color
    // 0x000000 the coerceToken fallback would misread.
    const ptype = attrType(TextSchema, attr.name) ?? attrType(RichTextSchema, attr.name);
    let value;
    if (ptype?.kind === "font" && ((v.kind === "ident" && v.name !== "null") || v.kind === "list")) {
        // A bare list of family strings joins into one chain. A font is an object,
        // reached in a { } — a bare name here is refused (checker), thrown (unchecked).
        const items = v.kind === "ident" ? [v] : v.items;
        value = items.map((i) => {
            if (i.kind === "string")
                return i.value;
            throw new DeclareError(i.kind === "ident" ? `'${i.name}' is not a family — ${fontObjectHint(i.name)}` : `a fontFamily list holds family strings`, i.pos);
        }).join(", ");
    }
    else {
        const c = ptype !== null ? coerce(ptype, v) : null;
        if (c !== null && c.ok)
            value = c.value;
        // A bare enum-like token no face type claims still reads as its string; every
        // other written form coerces by itself (colors, numbers, value constructors).
        else if (v.kind === "ident" && v.name !== "true" && v.name !== "false" && v.name !== "null") {
            const cc = coerce({ kind: "color" }, v);
            value = cc.ok ? cc.value : v.name;
        }
        else
            value = coerceToken(v);
    }
    if (value !== undefined)
        noteLiteral(v, value);
    return value;
}
/** Resolve a WRITTEN type name to its AttrType — the one place that mapping
 *  lives. Two callers need it and MUST agree: checkDecl (which refuses an
 *  unknown type outright) and the typechecker's assignTypes (which emits the
 *  TS member signature). They were separate copies until 2026-09-04, when a
 *  literal union taught to one and not the other fell to assignTypes' `t ===
 *  null` arm, was emitted `readonly … : any`, and made every assignment to it
 *  report "read-only — a fact the class maintains" — a diagnostic blaming
 *  the wrong thing entirely. One function now, so a new type can only be added
 *  once.
 *
 *  A LITERAL UNION (`"idle" | "loading"`) resolves to an ENUM whose tokens are
 *  its members — the same AttrType the built-in vocabularies use, so a write is
 *  checked against the set and the scaffold projects the TS union it already
 *  is. The parser normalizes the spelling (JSON.stringify each member), so the
 *  test here is exact. */
export function resolveWrittenType(written, isClassName, isShape) {
    const literalUnion = (n) => {
        const tokens = parseLiteralUnion(n);
        return tokens !== null && tokens.length > 0 ? { kind: "enum", name: n, tokens } : null;
    };
    const arrayOf = (n) => {
        if (!n.endsWith("[]"))
            return null;
        const base = n.slice(0, -2);
        // the element must itself be a sayable type — a primitive, a class, a
        // declared schema, or a deeper array; fn-element arrays wait for a need
        const okBase = declaredType(base) !== null || isClassName(base) || isShape(base) || (base.endsWith("[]") && arrayOf(base) !== null);
        return okBase ? { kind: "array", of: base } : null;
    };
    // A REFERENCE type — a class, a schema, View — says whether it may be empty:
    // `Menu?` may be null, `Menu` never is. The `?` belongs to these alone.
    if (written.endsWith("?")) {
        const nullable = reference(written.slice(0, -1), isClassName, isShape);
        if (nullable !== null)
            return nullable;
    }
    const ref = reference(written, isClassName, isShape);
    if (ref !== null)
        return { ...ref, required: true };
    return declaredType(written)
        ?? literalUnion(written)
        ?? arrayOf(written)
        ?? (written.startsWith("(") ? { kind: "fn", written } : null);
}
/** The reference types a declared attribute may name: View, a class, a schema. */
function reference(written, isClassName, isShape) {
    if (written === "View")
        return { kind: "view" };
    if (isClassName(written))
        return { kind: "class", of: written };
    if (isShape(written))
        return { kind: "record", name: written, data: true };
    return null;
}
export function checkDecl(schema, d, owner = schema.name, 
/** Is this name a class in the program? A declared attribute may be typed
 *  by a class (`child: Menu = null`), not only by the value
 *  vocabulary — without it a slot holding an instance can say no more than
 *  `View`, and then NO parameter can be typed more precisely than the slot it
 *  is fed from. The asymmetry was accidental: the `class` AttrType and its
 *  coercion already existed for schema slots (`layout: Layout`); only the
 *  DECLARATION path could not name one. */
isClassName = () => false, 
/** Is this name a declared SCHEMA (typed data)? A record slot (`sel: Task
 *  = null`) and an array of records (`picked: Task[]`) are ordinary
 *  declarations whose type is the schema — the projection makes the name
 *  real in every { } body; here it resolves to the record/array kinds. */
isShape = () => false) {
    const err = (message, pos) => ({ ok: false, error: new DeclareError(message, pos) });
    if (NOUNS.includes(d.name)) {
        return err(diag `'${d.name}' is a scope noun (language §11) — it cannot be declared`, d.pos);
    }
    if (RESERVED.includes(d.name) && !FILTER_FN_NAMES.includes(d.name)) {
        return err(diag `'${d.name}' is a value constructor (gradient, stroke, shadow, stop, frost, radialGradient, conicGradient) — it cannot be a member name`, d.pos);
    }
    const structural = structuralReason(d.name);
    if (structural !== null) {
        return err(diag `'${d.name}' is ${structural} — it cannot be declared; choose another name`, d.pos);
    }
    if (attrType(schema, d.name) !== null) {
        // A read-only intrinsic must not advise "write name = …" — setting it is
        // ALSO an error (skill-arm finding: `contentWidth: number = …` got the
        // wrong fix named twice). Choose-another-name is the only repair.
        if (isReadOnly(schema, d.name)) {
            return err(diag `'${d.name}' is a built-in read-only intrinsic of ${schema.name} — it is computed for you; choose another name for your derived value`, d.pos);
        }
        return err(diag `${schema.name} already has an attribute '${d.name}' — a declaration introduces a new one; write '${d.name} = …' to set the existing one`, d.pos);
    }
    const type = resolveWrittenType(d.type, isClassName, isShape);
    if (type === null) {
        return err(diag `unknown type '${d.type.replace(/\s*\?$/, "")}' — a declared attribute's type is one of ${DECLARED_TYPE_NAMES.join(", ")}, a class, a declared schema, a literal union ('"open" | "closed"'), or a function type '(a: T) -> R' — and a class, schema or View that may be empty ends in '?' ('Menu?')`, d.typePos);
    }
    const errT = (message, pos) => ({ ok: false, error: new DeclareError(message, pos), type });
    if (d.def === null)
        return { ok: true, type, value: undefined };
    if (d.def.kind === "code") {
        // A default BINDING (the ruled R6 unlock): a live
        // per-instance fallback — in effect only while nothing provides the
        // slot, so it never contends with any offer (`labelColor: Color =
        // { theme.buttonText }` is what lets classes defer to tokens).
        const e = validateExpr(d.def.src);
        if (e !== null) {
            return errT(diag `${owner}.${d.name}'s default = { … } ${e}`, d.def.pos);
        }
        return { ok: true, type, value: undefined, binding: { src: d.def.src, pos: d.def.pos } };
    }
    if (d.def.kind === "percent") {
        return errT(diag `${owner}.${d.name}: a percent default would resolve against each instance's parent — set it per instance until percent defaults are designed`, d.def.pos);
    }
    // A bare `[ … ]` default on an array slot is the ORDINARY literal form. The
    // parser produces a list node and leaves item kinds to the slot ("Which item
    // kinds a slot admits is the checker's", parser.ts); a generic array admits the
    // unambiguous scalars. Handled here rather than in coerce() because AttrValue
    // has no array arm — an array reaches its slot as a whole value. Without this,
    // `rows: array = [1, 2]` — the first thing anyone writes when seeding a list —
    // was refused, and the message sent the author to `{ [1, 2] }`, which spells a
    // static seed as a standing relationship.
    // A bare `[tl, tr, br, bl]` default on a Radius slot — four numbers, top-left
    // clockwise; the same list form the view path admits (check.ts).
    if ((type.kind === "radius" || type.kind === "inset") && d.def.kind === "list") {
        if (d.def.items.length !== 4 || d.def.items.some((it) => it.kind !== "number")) {
            return errT(insetOrRadiusMessage(owner, d.name), d.def.pos);
        }
        return { ok: true, type, value: Object.freeze(d.def.items.map((it) => (it.kind === "number" ? it.value : 0))) };
    }
    if (type.kind === "array" && d.def.kind === "list") {
        const items = [];
        for (const it of d.def.items) {
            if (it.kind === "number" || it.kind === "string" || it.kind === "value") {
                items.push(it.value);
                continue;
            }
            if (it.kind === "hexColor" || (it.kind === "ident" && it.name !== "null" && it.name !== "true" && it.name !== "false")) {
                const cc = coerce({ kind: "color" }, it);
                if (!cc.ok) {
                    return errT(diag `${owner}.${d.name}: a bare list holds plain values — numbers, strings, booleans, null, colors. For anything computed, write the whole list as a { } constraint`, it.pos);
                }
                items.push(cc.value);
                continue;
            }
            if (it.kind === "ident") {
                items.push(it.name === "null" ? null : it.name === "true");
                continue;
            }
            return errT(diag `${owner}.${d.name}: a bare list holds plain values — numbers, strings, booleans, null, colors. For anything computed, write the whole list as a { } constraint`, it.pos);
        }
        return { ok: true, type, value: Object.freeze(items) };
    }
    const c = coerce(type, d.def);
    if (!c.ok) {
        // A raw :path default has one plausible intent — the { } constraint form the
        // corpus itself uses (`rid: string = { :id }`): name it (Run-2 finding).
        const hint = d.def.kind === "path"
            ? diag ` — to seed from data, write a { } default: ${d.name}: ${d.type} = { :${d.def.path} }`
            // A default that READS something — a provided value, a constructor, any
            // expression — is a binding, and the braces are what say so. Without this
            // the message named the type and left the author to guess the spelling
            // that works (`x: number = { provided("x", 1) }`).
            : d.def.kind === "call"
                ? diag ` — a default that reads a value is a { } constraint: ${d.name}: ${d.type} = { ${d.def.name}(…) }`
                : "";
        return errT(diag `${owner}.${d.name}'s default expects ${c.expected}, got ${c.found ?? describeLiteral(d.def)}${hint}`, d.def.pos);
    }
    return { ok: true, type, value: c.value };
}
/** An element's schema plus its inline declarations — the anonymous one-off
 *  subclass of language §5, in the checker's currency. Validation of the
 *  decls themselves is the caller's (checkDecl); this only shapes the chain. */
export function withDecls(schema, decls, isClassName = () => false, isShape = () => false) {
    if (decls.length === 0)
        return schema;
    const attrs = {};
    for (const d of decls) {
        const r = checkDecl(schema, d, schema.name, isClassName, isShape);
        if (r.type !== undefined && !Object.hasOwn(attrs, d.name)) {
            attrs[d.name] = r.type;
        }
    }
    return { name: schema.name, base: schema, attrs };
}
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
//# sourceMappingURL=program-schema.js.map