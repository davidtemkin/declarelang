// Instantiate a checked tree into a live Node/View tree — the runtime bridge
// from parsed values to typed view fields. The type work itself is check.ts's:
// build() runs the full check first (reporting every error), and instantiate
// consumes the well-typed tree. It still guards each step through the same
// checkAttr/checkMethod/checkDecl, so a direct call on an unchecked tree
// fails soundly (first error, thrown) instead of assigning garbage.
//
// R6: user classes. programSchemas (check.ts) registered the schema half;
// here each class becomes a real runtime class — a subclass of its base's
// ctor whose DECLARED attributes install through defineAttributes, so they
// get the full attribute lifecycle (typed check, prototype-chained defaults,
// reactivity, was-set, ownership) with zero new mechanism: this is the R0/R4
// plug-in shape paying off. Everything else a class body carries — sets,
// methods, children — expands per instance, merged base→leaf→use-site with
// the nearest provider winning (the same "nearest declared wins" the
// prototype chains give values). An instance with its own inline
// declarations gets a one-off anonymous subclass (language §5, literally),
// synthesized once per source element and shared by every instantiation.
//
// `classroot` (language §11) is a member-origin fact: code written in a
// class's body gets that class's instance; code written at the use site gets
// the *outer* scope's instance (the enclosing class root, or the App root —
// the anonymous App class). So the class instance's own `classroot` property
// points outward, while its class-body members' `classroot` points at itself.
//
// Two passes since R4, plus init since R5. Pass one constructs the tree,
// installs method members (compiled closures over the instance), and assigns
// literals (through the reactive setters — a literal is an author write, so
// was-set tracking comes for free). Pass two installs the *relationships* —
// `{ }` constraints, percent Lengths, `:path` data bindings, cursors, and
// (R8) replications — once the whole tree is linked, because a
// relationship's first evaluation may read the parent (or, for replication,
// the inherited cursor chain). Within pass two, install order is tree order,
// but it is not semantic: a binding that read a still-default sibling slot
// is re-run by that slot's own first write, and everything is quiescent
// before the first paint. Finally `onInit` fires, children before parents.
//
// R8: data nodes and replication. A Dataset/DataSource is a Node member —
// no visual incarnation, no classroot, attributes only (the checker
// enforces the shape; the branches here mirror it for unchecked trees). A
// child element whose datapath matches many (`:items[]`) never constructs
// here at all: the parent gets a Replicator (replicate.ts), whose instances
// run this same pipeline per record — materialize() is that pipeline as a
// value, with its own pending list so replication works identically at
// build time and at every later data arrival. `onInit` fires once per view
// (INITED), however the view came to exist.
import { DeclareError } from "./errors.js";
import { View, fireEvent } from "./view.js";
import { Node, onDiscard } from "./node.js";
import { subscribeToSource } from "./sources.js";
import { Layout } from "./layout.js";
import { Animator, AnimatorGroup } from "./animator.js";
import { Spring } from "./spring.js";
import { State } from "./state.js";
import { Constraint } from "./reactive.js";
import { attrType, descendsFrom } from "./schema.js";
import { checkAttr, checkMethod, checkDecl, checkComponentValue, withDecls, programSchemas, manyPathOf, checkEntry, checkThemeRecord, coerceToken } from "./check.js";
import { buildStylesheet, ensureApplier, registerStylesheets } from "./stylesheet.js";
import { buildFonts, collectFaces, registerFontFaces } from "./font.js";
import { compileBody, compileExpr } from "./expr.js";
import { isPercent, isAlign } from "./value.js";
import { defineAttributes, setBound } from "./attributes.js";
import { bindConstraint, bindPercent, bindAlign, bindData, bindDatapath, bindCursor } from "./bind.js";
import { bindTwoWay, bindTwoWayDynamic } from "./editor.js";
import { Replicator } from "./replicate.js";
import { provideViewCreator } from "./view.js";
import { toCursor } from "./data.js";
import { TAGS, LAYOUTS, LAYOUT_BASES, DATA, ANIMATORS, ANIMATOR_GROUPS, STATES } from "./registry.js";
/** Build a Node/View tree from a parsed Program or Element fragment (no
 *  rendering). */
export function instantiate(input) {
    const program = "root" in input ? input : { classes: [], stylesheets: [], styles: [], fonts: [], includes: [], includeSpans: [], uses: [], blocks: [], root: input };
    const { infos, schemas, errors } = programSchemas(program.classes);
    if (errors.length > 0)
        throw errors[0];
    const tags = { ...TAGS };
    const layoutCtors = { ...LAYOUT_BASES };
    const classes = new Map();
    for (const info of infos) {
        // The base ctor exists: programSchemas validated the base name, and bases
        // precede their subclasses, so a user base is already registered. A layout
        // subclass (descends from Layout) synthesizes against the layout table and
        // registers back there — a strategy is never a tree tag; a View subclass
        // synthesizes against `tags` and joins it.
        const chain = [...(classes.get(info.decl.base)?.chain ?? []), info.decl.body];
        if (descendsFrom(info.schema, "Layout")) {
            const ctor = synthesize(layoutCtors[info.schema.base.name], info.decl.name, info.decl.body, () => info.defaults);
            layoutCtors[info.decl.name] = ctor;
            classes.set(info.decl.name, { info, ctor: ctor, chain });
        }
        else {
            const ctor = synthesize(tags[info.schema.base.name], info.decl.name, info.decl.body, () => info.defaults);
            classes.set(info.decl.name, { info, ctor, chain });
            tags[info.decl.name] = ctor;
        }
    }
    const ctx = {
        tags,
        layoutCtors,
        schemas,
        classes,
        stylesheets: buildStylesheets(program, schemas),
        fonts: buildFonts(program.fonts),
        bundles: collectBundles(program),
        pending: [],
        expanding: new Set(),
    };
    const root = construct(program.root, null, ctx);
    if (!(root instanceof View)) {
        throw new DeclareError(`the root must be a view, not a ${program.root.tag}`, program.root.pos);
    }
    // The build context outlives the build for IMPERATIVE CREATION (planes.md
    // §7 — real apps create views at runtime): app.createView resolves names
    // against this tree's own classes + built-ins. Weak by root, so a
    // discarded tree releases its context with it.
    CONTEXTS.set(root, ctx);
    // The registry a body's `this.lookupStylesheet("Dark")` resolves against —
    // keyed by the tree root, registered before pass two so a `stylesheet = { … }`
    // binding's first evaluation can already look a stylesheet up.
    registerStylesheets(root, ctx.stylesheets);
    // The web faces the runtime loads before first paint (index.ts → loadFonts).
    registerFontFaces(root, collectFaces(ctx.fonts));
    installPending(ctx.pending, ctx);
    // Construction-complete lifecycle (R5): the tree is linked, methods are
    // installed, every binding has evaluated once — so `onInit` sees settled
    // structure, and its writes settle (microtask) ahead of any first paint.
    // Children init before parents (a parent may rely on initialized
    // children — the LFC's oninit ordering, kept as intent). Firing here, not
    // at attach, keeps init a *model* fact: a built-but-unrendered tree is
    // initialized, and the model stays Node-importable.
    initTree(root);
    return root;
}
/** Install pass-two relationships. Factored out of instantiate() because
 *  replication runs the same installation per materialized instance —
 *  at build time and at every later data arrival. */
function installPending(pending, ctx) {
    for (const p of pending) {
        if ("code" in p)
            bindConstraint(p.view, p.attr.name, p.code, p.attr.value.pos, p.classroot, p.attr.value.kind === "code" ? p.attr.value.deps : undefined);
        else if ("twoWay" in p)
            bindTwoWay(p.view, p.attr.name, p.twoWay, p.type);
        else if ("twoWayCode" in p)
            bindTwoWayDynamic(p.view, p.attr.name, p.twoWayCode, p.attr.value.pos, p.classroot, p.type);
        else if ("dataPath" in p)
            bindData(p.view, p.attr.name, p.dataPath, p.type);
        else if ("cursorPath" in p)
            bindDatapath(p.view, p.cursorPath);
        else if ("cursorCode" in p)
            bindCursor(p.view, p.cursorCode, p.attr.value.pos, p.classroot);
        else if ("layoutEl" in p) {
            const errs = checkComponentValue(ctx.schemas, p.view.constructor.name, p.layoutEl.name, p.of, p.layoutEl);
            if (errs.length > 0)
                throw errs[0];
            // The assignment is the install: the slot's pusher (view.ts) attaches
            // the strategy over the now-linked children.
            p.view[p.layoutEl.name] = buildLayout(p.layoutEl, p.view, ctx);
        }
        else if ("replicator" in p)
            p.replicator.arm();
        else if ("align" in p)
            bindAlign(p.view, p.attr.name, p.align, p.attr.value.pos);
        else
            bindPercent(p.view, p.attr.name, p.percent, p.attr.value.pos);
    }
}
/** Views that have fired `onInit` — init is once per lifetime, however the
 *  view arrived (the initial build, or a later replication reconcile whose
 *  own initTree ran before the root's walk reached it). */
const INITED = new WeakSet();
function initTree(view) {
    // The stylesheet channel arms here — construction-complete, before init
    // fires and before any paint, so onInit and the first frame both see the
    // skinned values. Idempotent and pay-per-use (no effective stylesheet → no
    // applier; stylesheet.ts); a stylesheet PROVIDED after this walks its subtree
    // through the slot pusher instead (stylesheetArrived). Parent before children,
    // so a provider's theme offer stands before its followers' fields read it.
    ensureApplier(view);
    for (const child of view.children) {
        if (child instanceof View)
            initTree(child);
    }
    if (!INITED.has(view)) {
        INITED.add(view);
        fireEvent(view, "init");
    }
    // Auto-start animators AFTER this view's init (and its subtree's), so an
    // onInit that sets up geometry is reflected in the animator's sampled `from`
    // (animation.md §1: LZX's auto-start-at-init). Animators are non-View
    // children, skipped by the recursion above; pay-per-use — no animators, no
    // cost. Idempotent (autoStart fires once per lifetime), so a replicated
    // subtree's own initTree covers its animators too.
    for (const child of view.children) {
        // A Spring consumes its declaration snap here — its first computed
        // target renders outright; physics governs every change after (the
        // boot-equal-to-default case never wakes, so priming cannot be lazy).
        if (child instanceof Spring)
            child.prime();
        if (child instanceof Animator || child instanceof AnimatorGroup)
            child.autoStart();
        // Apply a state's initial value once linked. A gated state has usually
        // already synced from its gate's first run in pass two (idempotent here); a
        // literal `applied = true` (no gate) applies now. Non-View, like animators.
        else if (child instanceof State)
            child.init();
    }
}
/** Build the program's stylesheets as runtime Stylesheet values — validated
 *  through the same helpers check() uses (one message source; a direct
 *  instantiate of an unchecked tree dies with the same wording). A `{ }`
 *  entry field compiles once here; the per-view applier evaluates it with
 *  `this` = the styled view (the ruled bundle rule). */
function buildStylesheets(program, schemas) {
    const stylesheets = new Map();
    for (const decl of program.stylesheets) {
        const where = `stylesheet ${decl.name}`;
        let theme = null;
        const entries = new Map();
        for (const child of decl.body.children) {
            if (child.name === "theme" && child.tag === "Theme") {
                const errs = checkThemeRecord(where, child);
                if (errs.length > 0)
                    throw errs[0];
                const rec = {};
                for (const a of child.attrs)
                    rec[a.name] = coerceToken(a.value);
                theme = Object.freeze(rec);
                continue;
            }
            const schema = Object.hasOwn(schemas, child.tag) ? schemas[child.tag] : null;
            if (child.entry !== true || schema === null) {
                throw new DeclareError(`${where}: a stylesheet's members are 'theme: Theme [ … ]' and class-keyed entries ('${child.tag}: [ … ]')`, child.pos);
            }
            const errs = checkEntry(where, child, schema);
            if (errs.length > 0)
                throw errs[0];
            entries.set(child.tag, child.attrs.map((a) => {
                if (a.value.kind === "code") {
                    const c = compileExpr(a.value.src);
                    if ("error" in c) {
                        throw new DeclareError(`${where}.${child.tag}.${a.name} = { … } ${c.error}`, a.value.pos);
                    }
                    return { name: a.name, fn: c.fn };
                }
                const r = checkAttr(schema, a);
                if (!r.ok)
                    throw r.error;
                if (!("value" in r) || isPercent(r.value) || isAlign(r.value)) {
                    throw new DeclareError(`${where}.${child.tag}.${a.name}: an entry field is a literal or a { }`, a.value.pos);
                }
                return { name: a.name, value: r.value };
            }));
        }
        stylesheets.set(decl.name, buildStylesheet(decl.name, theme, entries));
    }
    return stylesheets;
}
/** The program's style bundles, shape-guarded (a bundle is attribute sets
 *  only — check() reports the full list; this keeps a direct instantiate of
 *  an unchecked tree sound). */
function collectBundles(program) {
    const bundles = new Map();
    for (const s of program.styles) {
        const b = s.body;
        if (b.decls.length > 0 || b.methods.length > 0 || b.children.length > 0 || b.raw !== undefined) {
            throw new DeclareError(`style ${s.name}: a bundle carries attribute sets only — a look, not a component`, s.pos);
        }
        bundles.set(s.name, b);
    }
    return bundles;
}
/** Subclass `base` and install `decls` as reactive attributes (defaults from
 *  `defaults()`, no Surface push — declared attributes are model state). The
 *  one runtime-context guard: a declared name may not collide with a runtime
 *  built-in (`parent`, `attach`, …) — probed on a throwaway base instance,
 *  the same fact checkMethod leaves to the runtime (Views construct free of
 *  side effects, so the probe is safe and the ctor is built exactly once). */
function synthesize(
// A View OR a Layout base (both are Nodes with reactive attributes): the body
// only reads member names off a probe and installs attributes, so it is base-
// agnostic; abstract because TweenLayout is an abstract base (erased at runtime).
base, name, body, defaults, 
/** Inline (use-site) declarations bind their default bindings' classroot
 *  outward; a class body's bind the instance itself (R6 member origin). */
outer = false) {
    const B = base;
    const cls = class extends B {
    };
    // The class's name carries into every diagnostic ("Tally.count is bound…").
    Object.defineProperty(cls, "name", { value: name });
    if (body.decls.length > 0) {
        const probe = new B();
        const specs = {};
        const defs = defaults();
        for (const d of body.decls) {
            if (d.name in probe) {
                throw new DeclareError(`${name}.${d.name}: '${d.name}' is a built-in member of the runtime ${base.name} — choose another name`, d.pos);
            }
            // A `{ }` default becomes the slot's live rank-1 fallback (the ruled
            // R6 unlock — theme-deferring defaults); checkDecl vetted the syntax.
            let defBinding;
            if (d.def?.kind === "code") {
                const c = compileExpr(d.def.src);
                if ("error" in c)
                    throw new DeclareError(`${name}.${d.name}'s default = { … } ${c.error}`, d.def.pos);
                defBinding = c.fn;
            }
            specs[d.name] = {
                def: Object.hasOwn(defs, d.name) ? defs[d.name] : undefined,
                // The runtime half of the slot's identity: a prevailing declaration
                // makes the accessor's unset branch the follow walk (attributes.ts);
                // a readonly one makes its setter throw (its `{ }` default is the
                // value, evaluated live and un-overridable).
                prevailing: d.prevailing || undefined,
                readOnly: d.readOnly || undefined,
                defBinding,
                defOuter: outer || undefined,
            };
        }
        // The static mapped type on defineAttributes serves hand-declared
        // classes; parse-path names are dynamic, hence the cast.
        defineAttributes(cls, specs);
    }
    return cls;
}
/** The anonymous one-off subclasses (language §5): an instance with inline
 *  declarations gets one, synthesized once per source element — a class-body
 *  element instantiates once per class *instance*, and they all share the
 *  same prototype accessors, exactly as if the compiler had named the class. */
const ANON = new WeakMap();
function ctorWithDecls(el, base, schema) {
    if (el.decls.length === 0)
        return base;
    let ctor = ANON.get(el);
    if (ctor === undefined) {
        const defaults = () => {
            const defs = {};
            for (const d of el.decls) {
                const r = checkDecl(schema, d);
                if (!r.ok)
                    throw r.error;
                defs[d.name] = r.value;
            }
            return defs;
        };
        // Named like its base — an anonymous subclass is still "a View" in every
        // message — while the declared members make it the §5 one-off subtype.
        // Inline declarations are written at the USE SITE, so their default
        // bindings' classroot points outward.
        ctor = synthesize(base, base.name, el, defaults, true);
        ANON.set(el, ctor);
    }
    return ctor;
}
function construct(el, outer, ctx, parentSchema = null) {
    // Own-key lookups: a tag named `constructor` must not resolve through
    // Object.prototype.
    const baseCtor = Object.hasOwn(ctx.tags, el.tag) ? ctx.tags[el.tag] : null;
    const schema = Object.hasOwn(ctx.schemas, el.tag) ? ctx.schemas[el.tag] : null;
    if (schema !== null && descendsFrom(schema, "Layout")) {
        // Mirrors check's refusal (a layout is never a tree element), so a
        // direct instantiate of an unchecked tree dies with the same guidance.
        throw new DeclareError(`'${el.tag}' is a layout — a layout is an attribute, not a child: write 'layout: ${el.tag} [ … ]' on the view it arranges`, el.pos);
    }
    if (schema !== null && descendsFrom(schema, "Dataset")) {
        return constructData(el, schema, outer, ctx);
    }
    if (schema !== null && descendsFrom(schema, "Animator")) {
        return constructAnimator(el, schema, outer, ctx);
    }
    if (schema !== null && descendsFrom(schema, "AnimatorGroup")) {
        return constructAnimatorGroup(el, schema, outer, ctx);
    }
    if (schema !== null && descendsFrom(schema, "State")) {
        return constructState(el, schema, outer, ctx, parentSchema);
    }
    if (baseCtor === null || schema === null)
        throw new DeclareError(`unknown component '${el.tag}'`, el.pos);
    const user = ctx.classes.get(el.tag);
    const view = new (ctorWithDecls(el, baseCtor, schema))();
    view.classroot = outer;
    // The `classroot` for members written at THIS element's site: the enclosing
    // scope — or, at the tree root, the root itself (its members are written
    // in its own body: the anonymous App class's).
    const croot = outer ?? view;
    const eff = withDecls(schema, el.decls);
    // Merge the member sources: class-body chain base→leaf (classroot = this
    // instance), then the use site (classroot = the outer scope). Same-named
    // members: the nearest provider wins — a derived body overrides its base's,
    // the instance overrides the class's — and only the winner installs, so a
    // class-body `{ }` binding and an instance literal on one slot never fight
    // over ownership.
    const methods = new Map();
    const attrs = new Map();
    const sources = [...(user?.chain ?? []).map((body) => ({ el: body, croot: view })), { el, croot }];
    // Stamp the navigation target (capabilities.md §6, links.ts): the leaf-most
    // source with a `link` wins — a use-site override beats the class body, the
    // same nearest-wins rule the methods/attrs merge below follows. Read only by
    // the static extractor; runtime navigation is the handler's own navigate(to).
    for (const s of sources)
        if (s.el.link)
            view._navLink = s.el.link;
    for (const s of sources) {
        for (const m of s.el.methods)
            methods.set(m.name, { m, croot: s.croot });
    }
    // Attribute channels land in the ruled precedence order, so "nearest
    // provider wins" is simply map-insertion order: class-body sets base→leaf
    // (rank 4), then the bundles (rank 5 — the effective `styles` list, itself
    // nearest-wins across chain → use site, expanded in WRITTEN order with a
    // later bundle overwriting an earlier), then the use site (rank 6). Only
    // the winner installs, so no two channels ever contend over ownership.
    for (const s of sources.slice(0, -1)) {
        for (const a of s.el.attrs)
            attrs.set(a.name, { attr: a, croot: s.croot });
    }
    for (const name of effectiveStyles(sources, eff)) {
        const bundle = ctx.bundles.get(name);
        if (bundle === undefined) {
            throw new DeclareError(`no style named '${name}' — this program declares ${ctx.bundles.size > 0 ? [...ctx.bundles.keys()].join(", ") : "no style bundles"}`, el.pos);
        }
        // A bundle's { } fields evaluate with `this` = the styled view (the
        // ruled bundle rule) — `classroot` binds the view itself.
        for (const a of bundle.attrs)
            attrs.set(a.name, { attr: a, croot: view });
    }
    for (const a of el.attrs)
        attrs.set(a.name, { attr: a, croot });
    // Component-typed provisions (View.layout): the nearest provider wins across
    // class bodies → use site, in either form — the member `layout: SimpleLayout
    // [ … ]` or the cancelling literal `layout = null` (how a use site turns an
    // inherited arrangement off; the null itself lands through the ordinary
    // literal pass). Only the winning element builds a strategy, in pass two.
    let layoutEl = null;
    for (const s of sources) {
        for (const a of s.el.attrs) {
            if (attrType(eff, a.name)?.kind === "component")
                layoutEl = null;
        }
        for (const c of s.el.children) {
            if (c.name !== null && attrType(eff, c.name)?.kind === "component")
                layoutEl = c;
        }
    }
    if (layoutEl !== null) {
        const t = attrType(eff, layoutEl.name);
        if (t !== null && t.kind === "component")
            ctx.pending.push({ view, layoutEl, of: t.of });
    }
    // Methods first: they are the instance's behavior, in place before any
    // literal lands, any binding runs, or init fires — a sibling's constraint
    // may call them during its first evaluation.
    for (const { m, croot: mcroot } of methods.values()) {
        const r = checkMethod(eff, m);
        if (!r.ok)
            throw r.error;
        // Collision with the runtime's own members is an instantiation-context
        // fact (the checker is runtime-free by design, like percent-on-root):
        // installing over `attach`/`children`/`toString` would corrupt the view.
        if (m.name in view) {
            throw new DeclareError(`${schema.name}.${m.name}: '${m.name}' is a built-in member of the runtime ${schema.name} — choose another name`, m.pos);
        }
        const c = compileBody(m.params, m.body);
        if ("error" in c)
            throw new DeclareError(`${schema.name}.${m.name}(…) ${c.error}`, m.bodyPos);
        const fn = c.fn;
        // Close over the instance (rather than relying on call-site `this`), so
        // an extracted reference — `const f = v.select; f()` — still works and
        // `this`/`parent`/`classroot` inside the body always mean this view, its
        // parent, and the scope the member was written in.
        const installed = (...args) => fn.call(view, view.parent, mcroot, ...args);
        view[m.name] = installed;
        // A SUBSCRIPTION (`member(params) <- Source { body }`, language §8): the
        // installed member additionally registers with its source now, and
        // unsubscribes when this node is discarded — lifetime-managed, nothing
        // for the author to clean up.
        if (m.source !== undefined)
            onDiscard(view, subscribeToSource(m.source, m.name, installed));
    }
    for (const { attr, croot: acroot } of attrs.values()) {
        // The two styling-channel slots resolve against PROGRAM declarations
        // (mirroring check.ts's routing — the runtime-free coercion cannot see
        // them): the bundle list was consumed by the merge above and lands here
        // as introspection; a stylesheet name becomes the interned Stylesheet, whose
        // pusher (view.ts) walks appliers under a post-construction provide.
        const t0 = attrType(eff, attr.name);
        if (t0?.kind === "styles" && attr.value.kind === "list") {
            view[attr.name] =
                Object.freeze(attr.value.items.flatMap((n) => (n.kind === "ident" ? [n.name] : [])));
            continue;
        }
        if (t0?.kind === "styles" && attr.value.kind === "code") {
            throw new DeclareError(`${eff.name}.styles = { … }: the bundle list is static (ruled v1) — conditional looks are constraints on the slots themselves`, attr.value.pos);
        }
        if (t0?.kind === "stylesheet" && attr.value.kind === "ident" && attr.value.name !== "null") {
            const stylesheet = ctx.stylesheets.get(attr.value.name);
            if (stylesheet === undefined) {
                throw new DeclareError(ctx.stylesheets.size > 0
                    ? `no stylesheet named '${attr.value.name}' — declared stylesheets: ${[...ctx.stylesheets.keys()].join(", ")}`
                    : `no stylesheet named '${attr.value.name}' — this program declares no stylesheets`, attr.value.pos);
            }
            view[attr.name] = stylesheet;
            continue;
        }
        // `fontFamily = Name` / `[Name, "Helvetica", "sans-serif"]` → a CSS family
        // string (static): each item is a declared font (→ its family) or a raw
        // string, and a list joins them into an ordered fallback chain. A bare
        // string falls through to coercion.
        if (t0?.kind === "font" && ((attr.value.kind === "ident" && attr.value.name !== "null") || attr.value.kind === "list")) {
            const familyOf = (name, pos) => {
                const font = ctx.fonts.get(name);
                if (font === undefined) {
                    throw new DeclareError(ctx.fonts.size > 0
                        ? `no font named '${name}' — declared fonts: ${[...ctx.fonts.keys()].join(", ")}`
                        : `no font named '${name}' — this program declares no fonts`, pos);
                }
                return font.family;
            };
            const family = attr.value.kind === "ident"
                ? familyOf(attr.value.name, attr.value.pos)
                : attr.value.items.map((i) => {
                    if (i.kind === "ident")
                        return familyOf(i.name, i.pos);
                    if (i.kind === "string")
                        return i.value;
                    throw new DeclareError(`a fontFamily list holds font names and strings`, i.pos);
                }).join(", ");
            view[attr.name] = family;
            continue;
        }
        const r = checkAttr(eff, attr);
        if (!r.ok)
            throw r.error;
        if ("binding" in r) {
            if (attr.bind === "two") {
                // `name <-> { expr }` — a DYNAMIC two-way binding: the expr names the
                // field at runtime (a generic editor over `classroot.field`).
                ctx.pending.push({ view, attr, twoWayCode: r.binding.src, type: attrType(eff, attr.name), classroot: acroot });
            }
            else if (attrType(eff, attr.name)?.kind === "cursor") {
                ctx.pending.push({ view, attr, cursorCode: r.binding.src, classroot: acroot });
            }
            else {
                ctx.pending.push({ view, attr, code: r.binding.src, classroot: acroot });
            }
        }
        else if ("datapath" in r) {
            const t = attrType(eff, attr.name);
            if (t.kind === "cursor") {
                if (r.datapath.many) {
                    // A many-path replicates the element it sits on — the PARENT's
                    // walk consumes it (appendChildren); reaching here means the many
                    // is on a body root or a direct construct, which check refuses.
                    throw new DeclareError(`':${r.datapath.path}[]' makes many instances — a replication belongs on a child element, not here`, r.datapath.pos);
                }
                ctx.pending.push({ view, attr, cursorPath: r.datapath.path });
            }
            else if (attr.bind === "two") {
                // `name <-> :path` — a two-way binding on an editable leaf slot: read
                // the datapath AND write edits back to it (editor.ts). check() has
                // already confirmed the slot is eligible.
                ctx.pending.push({ view, attr, twoWay: r.datapath.path, type: t });
            }
            else {
                ctx.pending.push({ view, attr, dataPath: r.datapath.path, type: t });
            }
        }
        else if (isPercent(r.value)) {
            ctx.pending.push({ view, attr, percent: r.value.percent });
        }
        else if (isAlign(r.value)) {
            ctx.pending.push({ view, attr, align: r.value.align });
        }
        else {
            // checkAttr guarantees the value matches the field's declared type, so
            // this dynamic assignment (the parse-path bridge) is sound.
            view[attr.name] = r.value;
        }
    }
    // Children: the class bodies' (they belong to every instance, scoped to
    // it), then the use site's — concatenated, never merged: tree order is
    // paint order, deliberately semantic. `slot` threads the block-position
    // anchor for replications across the sources (R8).
    const slot = { prev: null };
    if (user !== undefined) {
        if (ctx.expanding.has(el.tag)) {
            throw new DeclareError(`class ${el.tag} contains itself — a class may not appear inside its own body`, el.pos);
        }
        ctx.expanding.add(el.tag);
        try {
            for (const body of user.chain)
                appendChildren(body, view, view, ctx, eff, slot);
        }
        finally {
            ctx.expanding.delete(el.tag);
        }
    }
    appendChildren(el, view, croot, ctx, eff, slot);
    return view;
}
/** The effective `styles` list across the member sources (class chain →
 *  use site, NEAREST wins — the slot resolves like any other; `styles =
 *  null` and an empty list both cancel an inherited one). */
function effectiveStyles(sources, eff) {
    let names = [];
    for (const s of sources) {
        for (const a of s.el.attrs) {
            if (attrType(eff, a.name)?.kind !== "styles")
                continue;
            names = a.value.kind === "list" ? a.value.items.flatMap((n) => (n.kind === "ident" ? [n.name] : [])) : [];
        }
    }
    return names;
}
/** Construct a data node (R8): a Dataset adopts its embedded JSON, a
 *  DataSource waits for fetch; attributes land like a view's (literals now,
 *  `{ }` bindings in pass two). Mirrors checkDataNode for unchecked trees. */
function constructData(el, schema, outer, ctx) {
    const handlers = el.methods.filter((m) => el.tag === "DataSource" && m.name === "onLoad");
    if (el.decls.length > 0 || el.methods.length > handlers.length || el.children.length > 0) {
        throw new DeclareError(`a ${el.tag} takes attributes only`, el.pos);
    }
    const node = new DATA[el.tag]();
    // the declared event handler (schema events: DataSource fires `load`),
    // installed like an animator's — in place before any binding runs
    for (const m of handlers) {
        const c = compileBody(m.params, m.body);
        if ("error" in c)
            throw new DeclareError(`${schema.name}.${m.name}(…) ${c.error}`, m.bodyPos);
        const fn = c.fn;
        node[m.name] =
            (...args) => fn.call(node, node.parent, outer, ...args);
    }
    for (const a of el.attrs) {
        const r = checkAttr(schema, a);
        if (!r.ok)
            throw r.error;
        if ("binding" in r)
            ctx.pending.push({ view: node, attr: a, code: r.binding.src, classroot: outer });
        else if ("datapath" in r) {
            throw new DeclareError(`${el.tag}.${a.name} = :${r.datapath.path}: a data node is where data lives — a :path reads a view's cursor`, r.datapath.pos);
        }
        else if (isPercent(r.value)) {
            throw new DeclareError(`${el.tag}.${a.name}: no axis to resolve a percent against`, a.value.pos);
        }
        else {
            node[a.name] = r.value;
        }
    }
    if (el.tag === "Dataset") {
        // A literal `{ }` body OR a derived `contents = { … }` (bound above via
        // pass two) — one or the other. The derived case leaves value null until
        // the contents constraint first runs, which mirrors it into value.
        const derived = el.attrs.some((a) => a.name === "contents");
        if (el.raw === undefined && !derived) {
            throw new DeclareError(`a Dataset needs data — a JSON body '{ … }' or a derived 'contents = { … }'`, el.pos);
        }
        if (el.raw !== undefined) {
            try {
                node.value = JSON.parse(el.raw.src);
            }
            catch (e) {
                throw new DeclareError(`${el.name ?? el.tag}: the Dataset body is not valid JSON — ${e.message}`, el.raw.pos);
            }
        }
    }
    else if (el.raw !== undefined) {
        throw new DeclareError(`a ${el.tag}'s data arrives from its url — only a Dataset embeds a { } body`, el.raw.pos);
    }
    return node;
}
/** Construct an animator node (animation.md §1–§3): a non-visual Node member
 *  that drives a target slot. Unlike a data node it carries the on* handlers
 *  AND built-in start()/stop(), so this path installs methods/handlers (like a
 *  View) as well as attributes — literals now, `{ }` bindings in pass two.
 *  The numeric-slot check is the checker's (it needs parent context); the
 *  guards here mirror checkAnimatorNode so a direct instantiate of an
 *  unchecked tree still fails soundly. `target` defaults to the parent —
 *  resolved at start() (this.parent) — so nothing to wire here. */
function constructAnimator(el, schema, outer, ctx) {
    if (el.decls.length > 0 || el.children.length > 0) {
        throw new DeclareError(`an ${el.tag} takes attributes and on* handlers only`, el.pos);
    }
    if (el.raw !== undefined) {
        throw new DeclareError(`only a Dataset carries a { } body — an ${el.tag}'s members go in [ ]`, el.raw.pos);
    }
    const node = new ANIMATORS[el.tag]();
    // Methods first (handlers + any plain method), installed like a View's — in
    // place before any binding runs or auto-start fires. The built-in guard
    // (`in node`) protects start()/stop()/tick, exactly as it does a View's own.
    for (const m of el.methods) {
        const r = checkMethod(schema, m);
        if (!r.ok)
            throw r.error;
        if (m.name in node) {
            throw new DeclareError(`${schema.name}.${m.name}: '${m.name}' is a built-in member of the runtime ${schema.name} — choose another name`, m.pos);
        }
        const c = compileBody(m.params, m.body);
        if ("error" in c)
            throw new DeclareError(`${schema.name}.${m.name}(…) ${c.error}`, m.bodyPos);
        const fn = c.fn;
        node[m.name] =
            (...args) => fn.call(node, node.parent, outer, ...args);
    }
    for (const a of el.attrs) {
        const r = checkAttr(schema, a);
        if (!r.ok)
            throw r.error;
        if ("binding" in r)
            ctx.pending.push({ view: node, attr: a, code: r.binding.src, classroot: outer });
        else if ("datapath" in r) {
            throw new DeclareError(`${el.tag}.${a.name}: an animator attribute is a value or a { }, not a data read`, a.value.pos);
        }
        else if (isPercent(r.value)) {
            throw new DeclareError(`${el.tag}.${a.name}: no axis to resolve a percent against`, a.value.pos);
        }
        else {
            node[a.name] = r.value;
        }
    }
    return node;
}
/** The attributes an AnimatorGroup cascades to a member that omits its own (the
 *  LZX default-cascade, LzAnimatorGroup.lzs:373–399). Group-level controls
 *  (process / repeat / started / paused) and events / name are NOT cascaded. */
const CASCADE_ATTRS = new Set([
    "attribute",
    "to",
    "from",
    "duration",
    "motion",
    "relative",
]);
/** Construct an animatorgroup node (animation.md §1, §4): a non-visual Node
 *  member that coordinates its child animators (and nested groups). Like an
 *  animator it installs on* handlers + built-in start()/stop() and lands its
 *  own literal attributes; unlike an animator its children are its MEMBERS —
 *  each is constructed, linked, marked group-driven (so it never self-registers
 *  with the clock), and given any of the group's cascadeable attributes it did
 *  not set itself. `inherited` carries an enclosing group's effective cascade
 *  (empty at the top level), so the LZX default-cascade threads transitively
 *  through nested groups — a member inherits from its group, which inherited
 *  from its group, own settings overriding at each level. The guards mirror
 *  checkAnimatorGroupNode so a direct instantiate of an unchecked tree still
 *  fails soundly. */
function constructAnimatorGroup(el, schema, outer, ctx, inherited = {}) {
    if (el.raw !== undefined) {
        throw new DeclareError(`only a Dataset carries a { } body — an ${el.tag}'s members go in [ ]`, el.raw.pos);
    }
    if (el.decls.length > 0) {
        throw new DeclareError(`an ${el.tag} takes attributes, on* handlers, and animator members only`, el.pos);
    }
    const node = new ANIMATOR_GROUPS[el.tag]();
    for (const m of el.methods) {
        const r = checkMethod(schema, m);
        if (!r.ok)
            throw r.error;
        if (m.name in node) {
            throw new DeclareError(`${schema.name}.${m.name}: '${m.name}' is a built-in member of the runtime ${schema.name} — choose another name`, m.pos);
        }
        const c = compileBody(m.params, m.body);
        if ("error" in c)
            throw new DeclareError(`${schema.name}.${m.name}(…) ${c.error}`, m.bodyPos);
        const fn = c.fn;
        node[m.name] =
            (...args) => fn.call(node, node.parent, outer, ...args);
    }
    // The effective cascade for members: what this group inherited, overlaid with
    // its own cascadeable literals (a `{ }`-bound cascade attribute stays on the
    // group — v1 does not cascade bindings).
    const cascade = { ...inherited };
    for (const a of el.attrs) {
        const r = checkAttr(schema, a);
        if (!r.ok)
            throw r.error;
        if ("binding" in r)
            ctx.pending.push({ view: node, attr: a, code: r.binding.src, classroot: outer });
        else if ("datapath" in r) {
            throw new DeclareError(`${el.tag}.${a.name}: an animator attribute is a value or a { }, not a data read`, a.value.pos);
        }
        else if (isPercent(r.value)) {
            throw new DeclareError(`${el.tag}.${a.name}: no axis to resolve a percent against`, a.value.pos);
        }
        else {
            node[a.name] = r.value;
            if (CASCADE_ATTRS.has(a.name))
                cascade[a.name] = r.value;
        }
    }
    // Members: each child animator / nested group, linked under the group and
    // group-driven. An animator inherits the group's cascade for attributes it
    // omitted; a nested group is threaded the effective cascade so ITS members
    // inherit transitively (constructed directly, not via the generic dispatch,
    // to carry the cascade down).
    for (const childEl of el.children) {
        const cs = Object.hasOwn(ctx.schemas, childEl.tag) ? ctx.schemas[childEl.tag] : null;
        if (cs === null || !(descendsFrom(cs, "Animator") || descendsFrom(cs, "AnimatorGroup"))) {
            throw new DeclareError(`an ${el.tag} coordinates animators — '${childEl.tag}' is not an Animator or AnimatorGroup`, childEl.pos);
        }
        let member;
        if (descendsFrom(cs, "AnimatorGroup")) {
            member = constructAnimatorGroup(childEl, cs, outer, ctx, cascade);
        }
        else {
            member = constructAnimator(childEl, cs, outer, ctx);
            const memberSet = new Set(childEl.attrs.map((a) => a.name));
            for (const k of Object.keys(cascade)) {
                if (!memberSet.has(k))
                    member[k] = cascade[k];
            }
        }
        node.appendChild(member);
        member.markGrouped();
    }
    return node;
}
/** Construct a state node (docs/system-design/states.md): a non-visual member whose
 *  body OVERRIDES the enclosing view's slots and adds a conditional child
 *  subtree, both switched by `applied`. Unlike an animator its body does NOT
 *  install onto itself — the overrides and child templates are CAPTURED for
 *  apply time (the enclosing view, the target, links only after this returns).
 *  `applied` (a literal now, a `{ }` gate in pass two) and the on* handlers do
 *  install on the node. `parentSchema` (the enclosing view) types the overrides'
 *  coercion and binding compile. The guards mirror checkStateNode so a direct
 *  instantiate of an unchecked tree still fails soundly. */
function constructState(el, schema, outer, ctx, parentSchema) {
    if (el.raw !== undefined) {
        throw new DeclareError(`only a Dataset carries a { } body — a ${el.tag}'s members go in [ ]`, el.raw.pos);
    }
    const node = new STATES[el.tag]();
    const label = el.name ?? el.tag;
    // on* handlers (onApply / onRemove) install like a View's / animator's.
    for (const m of el.methods) {
        const r = checkMethod(schema, m);
        if (!r.ok)
            throw r.error;
        if (m.name in node) {
            throw new DeclareError(`${schema.name}.${m.name}: '${m.name}' is a built-in member of the runtime ${schema.name} — choose another name`, m.pos);
        }
        const c = compileBody(m.params, m.body);
        if ("error" in c)
            throw new DeclareError(`${schema.name}.${m.name}(…) ${c.error}`, m.bodyPos);
        const fn = c.fn;
        node[m.name] = (...args) => fn.call(node, node.parent, outer, ...args);
    }
    // Attributes: `applied` is the one control slot (a literal now, a `{ }` gate
    // in pass two). Every other attribute is an OVERRIDE on the enclosing view —
    // captured as a slot + a factory that builds a FRESH driving Constraint each
    // apply, coerced / compiled against the parent's schema (the view it targets).
    const overrides = [];
    for (const a of el.attrs) {
        if (a.name === "applied") {
            const r = checkAttr(schema, a);
            if (!r.ok)
                throw r.error;
            if ("binding" in r)
                ctx.pending.push({ view: node, attr: a, code: r.binding.src, classroot: outer });
            else if ("value" in r)
                node.applied = r.value;
            continue;
        }
        if (parentSchema === null) {
            throw new DeclareError(`a ${el.tag} overrides its enclosing view's slots, but '${a.name}' has no view to target here`, a.value.pos);
        }
        const r = checkAttr(parentSchema, a);
        if (!r.ok)
            throw r.error;
        const slot = a.name;
        if ("binding" in r) {
            const c = compileExpr(r.binding.src);
            if ("error" in c)
                throw new DeclareError(`${parentSchema.name}.${slot} = { … } ${c.error}`, a.value.pos);
            const fn = c.fn;
            const croot = outer;
            overrides.push({
                slot,
                make: (t) => new Constraint(`${t.constructor.name}.${slot} (state ${label})`, () => fn.call(t, t.parent, croot), (v) => setBound(t, slot, v)),
            });
        }
        else if ("datapath" in r) {
            throw new DeclareError(`${el.tag}.${slot}: a state override is a value or a { }, not a data read`, a.value.pos);
        }
        else {
            const value = r.value;
            overrides.push({
                slot,
                make: (t) => new Constraint(`${t.constructor.name}.${slot} (state ${label})`, () => value, (v) => setBound(t, slot, v)),
            });
        }
    }
    node.overrides = overrides;
    // Child subtree: captured as templates + the materializer + this use site.
    node.childTemplates = el.children;
    node.materialize = materializer(ctx);
    node.childClassroot = outer;
    return node;
}
/** Build a layout strategy from its element (checkComponentValue has just
 *  validated it): construct the class, land the literal attributes through
 *  its reactive setters — axis and spacing get the full attribute lifecycle,
 *  which is what makes `strategy.spacing = 12` a live re-flow later. */
function buildLayout(el, owner, ctx) {
    const userClass = ctx.classes.get(el.tag);
    // A user-authored layout (`class X extends TweenLayout [ … ]`): the
    // synthesized ctor carries its declared attributes; install its class-chain
    // methods (place(), …) and any set attributes, mirroring construct().
    if (userClass !== undefined) {
        const layout = new ctx.layoutCtors[el.tag]();
        installLayoutClass(layout, el, userClass, owner, ctx);
        return layout;
    }
    // A built-in strategy (SimpleLayout): literal attributes only.
    const strategy = new LAYOUTS[el.tag]();
    const schema = ctx.schemas[el.tag];
    for (const a of el.attrs) {
        const r = checkAttr(schema, a);
        if (!r.ok)
            throw r.error;
        if (!("value" in r) || isPercent(r.value)) {
            throw new DeclareError(`${el.tag}.${a.name}: a layout attribute takes a literal`, a.pos);
        }
        strategy[a.name] = r.value;
    }
    return strategy;
}
/** Install a user layout class's methods and attributes on a freshly-built
 *  strategy — the layout-side mirror of construct()'s install. Methods close
 *  over the layout, so `this` is the strategy and `this.view` its arranged
 *  view; `parent` in a body is that view (Layout.parent), `classroot` the
 *  enclosing scope. Attributes land as literals or `{ }` bindings over the
 *  layout's own slots (place()/retarget read them). */
function installLayoutClass(layout, el, uc, owner, ctx) {
    const eff = withDecls(ctx.schemas[el.tag], el.decls);
    const croot = owner.classroot ?? owner;
    const self = layout;
    // Methods: class chain base→leaf, then the use site; nearest provider wins.
    const methods = new Map();
    for (const body of uc.chain)
        for (const m of body.methods)
            methods.set(m.name, m);
    for (const m of el.methods)
        methods.set(m.name, m);
    for (const m of methods.values()) {
        const r = checkMethod(eff, m);
        if (!r.ok)
            throw r.error;
        if (m.name in layout) {
            throw new DeclareError(`${el.tag}.${m.name}: '${m.name}' is a built-in member of the runtime layout — choose another name`, m.pos);
        }
        const c = compileBody(m.params, m.body);
        if ("error" in c)
            throw new DeclareError(`${el.tag}.${m.name}(…) ${c.error}`, m.bodyPos);
        const fn = c.fn;
        self[m.name] = (...args) => fn.call(layout, layout.parent, croot, ...args);
    }
    // Attributes: class chain base→leaf, then use site; a literal lands directly,
    // a `{ }` binding installs a constraint over the layout's slot.
    const attrs = new Map();
    for (const body of uc.chain)
        for (const a of body.attrs)
            attrs.set(a.name, a);
    for (const a of el.attrs)
        attrs.set(a.name, a);
    for (const a of attrs.values()) {
        if (a.value.kind === "code") {
            bindConstraint(layout, a.name, a.value.src, a.value.pos, croot);
            continue;
        }
        const r = checkAttr(eff, a);
        if (!r.ok)
            throw r.error;
        if (!("value" in r) || isPercent(r.value)) {
            throw new DeclareError(`${el.tag}.${a.name}: a layout attribute takes a literal or { }`, a.pos);
        }
        self[a.name] = r.value;
    }
}
/** Construct and link `from`'s child elements under `parentView`. A named
 *  child becomes a real member of its parent (language §4: reachable as
 *  `bg` / `this.bg`) — a plain property, structure like the tree itself.
 *  A member whose name is a component-typed attribute (`layout:`) is that
 *  attribute's VALUE, not a child — construct() consumed it above. A child
 *  whose datapath matches many (R8) is a TEMPLATE: it never constructs
 *  here — the parent gets a Replicator holding this pipeline as a value. */
function appendChildren(from, parentView, croot, ctx, eff, slot) {
    for (const childEl of from.children) {
        if (childEl.name !== null && attrType(eff, childEl.name)?.kind === "component")
            continue;
        const many = manyPathOf(childEl, ctx.schemas);
        if (many !== null && many.value.kind === "path") {
            if (childEl.name !== null) {
                throw new DeclareError(`a replicated child cannot be named — ':${many.value.path}[]' makes one instance per record, and '${childEl.name}' can only name one; reach the instances through their data`, childEl.pos);
            }
            // `key = :field` (optional): reconcile by this stable field instead of
            // object identity, so a re-derived collection reuses instances by key.
            const keyAttr = childEl.attrs.find((a) => a.name === "key" && a.value.kind === "path");
            const keyPath = keyAttr !== undefined ? keyAttr.value.path : null;
            const replicator = new Replicator(parentView, childEl, many.value.path, croot, materializer(ctx), slot.prev, keyPath);
            ctx.pending.push({ replicator });
            slot.prev = replicator;
            continue;
        }
        const child = construct(childEl, croot, ctx, eff);
        parentView.appendChild(child);
        // A state caches its declaration-order precedence the moment it links —
        // before any gate fires in pass two or a sibling state inserts children.
        if (child instanceof State)
            child.onLinked();
        slot.prev = child;
        if (childEl.name !== null) {
            if (childEl.name in parentView) {
                throw new DeclareError(`'${childEl.name}' is already a member of the running ${parentView.constructor.name} — choose another name for this child`, childEl.pos);
            }
            parentView[childEl.name] = child;
        }
    }
}
const CONTEXTS = new WeakMap();
/** Imperative creation (planes.md §7): instantiate `tag` by NAME into
 *  `parent`, on the tree rooted at `root` — the same construct pipeline as
 *  replication (one materializer instance: construct → link → attach →
 *  finish), so a created view is a full citizen: bindings installed, init
 *  fired, discard reachable. `props` are ordinary post-init writes (a
 *  `datapath` prop gives the instance a record context — the replication
 *  convention, reused). Name resolution is the program's registry: a class
 *  referenced ONLY here is invisible to static tracing — keep it with
 *  `use [ Name ]` (instantiation.md §8). Throws loudly on unknown names. */
export function createViewIn(root, tag, parent, props) {
    const ctx = CONTEXTS.get(root);
    if (ctx === undefined) {
        throw new DeclareError(`createView: this tree was not built from a program (no registry to resolve '${tag}' against)`);
    }
    if (!Object.hasOwn(ctx.tags, tag)) {
        const hint = tag in TAGS ? "" : ` — declare the class, include its library, or keep it with 'use [ ${tag} ]'`;
        throw new DeclareError(`createView: no component named '${tag}'${hint}`);
    }
    const el = { tag, name: null, attrs: [], decls: [], methods: [], children: [], pos: { line: 0, col: 0 } };
    const made = materializer(ctx)(el, parent);
    parent.insertChild(made.view, parent.children.length);
    const ps = parent.surface;
    if (ps !== null && parent.backend !== null)
        made.view.attach(parent.backend, ps, null);
    // Props land BEFORE finish — the replicator's own order ("linked, attached,
    // and cursored"): a `datapath` prop must be in place when the instance's
    // bindings first evaluate, or its `:path` reads boot against nothing. The
    // datapath slot holds a CURSOR — a raw record prop converts through
    // toCursor (it must be a tagged place: a record from a dataset's tree).
    if (props !== undefined) {
        for (const [k, v] of Object.entries(props)) {
            const val = k === "datapath" && v !== null && !v?.data
                ? toCursor(v, "createView: the datapath prop")
                : v;
            made.view[k] = val;
        }
    }
    made.finish();
    return made.view;
}
/** The construct pipeline as a value (replicate.ts's Materialize): build one
 *  instance with its OWN pending list — its relationships install (and its
 *  init fires) via `finish`, once the replicator has linked, attached, and
 *  cursored it. Identical machinery at build time and at every arrival. */
function materializer(ctx) {
    return (template, classroot) => {
        const saved = ctx.pending;
        ctx.pending = [];
        try {
            const node = construct(template, classroot, ctx);
            if (!(node instanceof View)) {
                throw new DeclareError(`a ${template.tag} cannot replicate — it is not a view`, template.pos);
            }
            const pending = ctx.pending;
            return {
                view: node,
                finish: () => {
                    installPending(pending, ctx);
                    initTree(node);
                },
            };
        }
        finally {
            ctx.pending = saved;
        }
    };
}
/** Instantiate a PARSED element into a live parent — the Inspector's
 *  `Tag [ … ]` evaluation. Unlike createViewIn (which synthesizes an empty
 *  element from a tag name), this takes the real parsed node, so nested
 *  children, `{ }` constraints and declarations all materialize exactly as
 *  they would in source. Resolves against the SUBJECT tree's registry. */
export function createElementIn(root, el, parent) {
    const ctx = CONTEXTS.get(root);
    if (ctx === undefined) {
        throw new DeclareError("evaluate: this tree was not built from a program (no registry to resolve against)");
    }
    const made = materializer(ctx)(el, parent);
    parent.insertChild(made.view, parent.children.length);
    const ps = parent.surface;
    if (ps !== null && parent.backend !== null)
        made.view.attach(parent.backend, ps, null);
    made.finish();
    return made.view;
}
provideViewCreator(createViewIn);
//# sourceMappingURL=instantiate.js.map