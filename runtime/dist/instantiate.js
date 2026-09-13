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
import { DeclareError, diag } from "./errors.js";
import { View, fireEvent } from "./view.js";
import { Node } from "./node.js";
import { Layout } from "./layout.js";
import { Animator, AnimatorGroup } from "./animator.js";
import { Spring } from "./spring.js";
import { State } from "./state.js";
import { Constraint } from "./reactive.js";
import { attrType, descendsFrom, BUILTIN_PROVIDED, RichTextSchema, TextSchema } from "./schema.js";
// The validators (check.js) and the schema half (program-schema.js) import
// separately ON PURPOSE: a precompiled program was fully checked at build
// time, so a production bundle substitutes check.js with a stub
// (tools/declarec.mjs) and runs entirely on the trusted paths below — the
// schema half is all it needs. The dev path takes the same code with
// `trusted` false and validates every step, exactly as before.
import { checkAttr, checkMethod, checkComponentValue } from "./check.js";
import { checkDecl, withDecls, programSchemas, manyPathOf, coerceToken } from "./program-schema.js";
import { buildFonts, collectFaces, registerFontFaces } from "./font.js";
import { setStyleBundles } from "./style-bundles.js";
import { THEME_PRESETS } from "./themes.js";
import { compileBody, compileExpr, withScriptScope, evalScript } from "./expr.js";
import { coerce, isPercent, isAlign } from "./value.js";
import { defineAttributes, recordDeclarations, setBound, provideWrite } from "./attributes.js";
import { bindConstraint, provideBind, bindPercent, bindAlign, bindData, bindDatapath, bindCursor } from "./bind.js";
import { bindTwoWay, bindTwoWayDynamic } from "./editor.js";
import { Replicator } from "./replicate.js";
import { staticSegs } from "./datapath.js";
import { provideViewCreator } from "./view.js";
import { toCursor } from "./data.js";
import { validateDoc } from "./data-schema.js";
import { resolveShapes, shapeNames } from "./shape-resolve.js";
import { trackedView, unwrapValue } from "./data.js";
import { TAGS, LAYOUTS, LAYOUT_BASES, DATA, ANIMATORS, ANIMATOR_GROUPS, SOURCES, STATES } from "./registry.js";
/** A SOURCE node — duck-typed on the lifecycle hook rather than imported by
 *  class, so instantiate keeps no static edge to the individual services (which
 *  is what lets an app that never listens drop them entirely). */
function isSourceNode(n) {
    return typeof n?.autoStart === "function";
}
// The name → built-in-class tables now live in registry.ts (split out so a
// production build can substitute a slim subset — see that module). instantiate
// consumes them exactly as before; nothing else here changes.
/** One registered user class at runtime: its check-side info, its
 *  synthesized ctor, and its body chain, base-most first — the member
 *  sources every instance expands. */
/** The `$base` of a body with no class chain beneath it (a source's or
 *  animator's handler): `super` has nothing to reach, and the compiler
 *  refused it there. */
const NO_BASE = Object.freeze({});
/** Route one attribute: the trusted fast path reads the answer off the value's
 *  kind (a `{ }` is a binding, a `:path` a datapath, anything else coerces
 *  through the value vocabulary — validity was the compiler's job); the
 *  untrusted path is checkAttr, validation and all. One result shape, so every
 *  consumer downstream is unchanged. */
function routeAttr(schema, attr, trusted) {
    if (!trusted)
        return checkAttr(schema, attr);
    const v = attr.value;
    if (v.kind === "path")
        return { ok: true, datapath: { path: v.path, many: v.many, pos: v.pos, plan: v.plan } };
    const type = attrType(schema, attr.name);
    // A PROVISION: a bare set of a BUILT-IN provided value the class does not
    // declare (a new provided value is a typed decl, not a bare attr). A `{ }`
    // provision re-derives; a literal self-coerces by its written form.
    if (type === null && BUILTIN_PROVIDED.has(attr.name)) {
        if (v.kind === "code")
            return { ok: true, provision: { name: attr.name, binding: { src: v.src, pos: v.pos } } };
        return { ok: true, provision: { name: attr.name } };
    }
    if (v.kind === "code")
        return { ok: true, binding: { src: v.src, pos: v.pos } };
    const c = type !== null ? coerce(type, v) : null;
    if (c === null || !c.ok) {
        // Unreachable off a genuinely checked program — reached only when an
        // artifact and its runtime have drifted apart, so say exactly that.
        throw new DeclareError(`${schema.name}.${attr.name}: this precompiled program does not match its runtime (rebuild the artifact)`, attr.pos);
    }
    return { ok: true, value: c.value };
}
/** Apply a routed PROVISION (provided values): a `{ }` provision installs a
 *  standing computation in pass two (provideBind), a literal lands now
 *  (provideWrite). Returns whether `r` was a provision (so the caller's other
 *  branches are skipped). One helper, called at every node-build site. */
function applyProvision(r, view, attr, ctx, classroot) {
    if (!("provision" in r))
        return false;
    if (r.provision.binding !== undefined) {
        ctx.pending.push({ view: view, attr, provideCode: r.provision.binding.src, classroot });
    }
    else {
        provideWrite(view, attr.name, resolveProvisionLiteral(attr, ctx));
    }
    return true;
}
/** Coerce a LITERAL provision value. A provision has no declared slot on the
 *  providing node, but its NAME may match a text FACE value (`fontFamily`,
 *  `fontWeight`, `textColor`, …), and then it should coerce exactly as that slot
 *  would — a `fontFamily = [Sans, "sans-serif"]` resolves the declared font to
 *  its family string, a `fontWeight = normal` keeps the token — so the reader
 *  (`Text`'s `provided("fontFamily")`) gets a well-formed value. A name no face
 *  value claims (`accent`, `density`) coerces by its written form. */
function resolveProvisionLiteral(attr, ctx) {
    const v = attr.value;
    // Coerce by the KNOWN face/rich type. Use the EXPORTED schemas directly, not
    // ctx.schemas — a production runtime may not register the checker's schema
    // registry, and `attrType(undefined, …)` would crash the whole render.
    // The type matters where a token is ambiguous: `headingWeight = black` is the
    // weight token, not the color 0x000000 the coerceToken fallback would misread.
    // A `theme` provision naming a theme (`App [ theme = Cupertino ]`) → the
    // record, so a descendant's `provided("theme")` reads a token record.
    if (attr.name === "theme" && v.kind === "ident" && ctx.themes.has(v.name)) {
        return ctx.themes.get(v.name);
    }
    const ptype = attrType(TextSchema, attr.name) ?? attrType(RichTextSchema, attr.name);
    if (ptype?.kind === "font" && ((v.kind === "ident" && v.name !== "null") || v.kind === "list")) {
        const familyOf = (name) => {
            const font = ctx.fonts.get(name);
            return font !== undefined ? font.family : name;
        };
        return v.kind === "ident"
            ? familyOf(v.name)
            : v.items.map((i) => (i.kind === "ident" ? familyOf(i.name) : i.kind === "string" ? i.value : "")).join(", ");
    }
    if (ptype !== null) {
        const c = coerce(ptype, v);
        if (c.ok)
            return c.value;
    }
    // A bare enum-like token no face type claims still reads as its string; every
    // other written form coerces by itself (colors, numbers, value constructors).
    if (v.kind === "ident" && v.name !== "true" && v.name !== "false" && v.name !== "null") {
        const c = coerce({ kind: "color" }, v);
        if (c.ok)
            return c.value;
        return v.name;
    }
    return coerceToken(v);
}
/** Build a Node/View tree from a parsed Program or Element fragment (no
 *  rendering). */
export function instantiate(input) {
    const program = "root" in input ? input : { classes: [], themes: [], styles: [], fonts: [], includes: [], includeSpans: [], uses: [], scripts: [], root: input };
    // The compiler stamps `trusted` on a program it fully checked (declarec —
    // and only then), so instantiation runs on the fast paths; anything else
    // (a hand-built tree, a test fragment) validates step by step, as ever.
    const trusted = program.trusted === true;
    // Resolve schema declarations first (typed data): the named `schema =`
    // forms rewrite to shape literals and refs resolve, so coercion and the
    // embedded-body validation below see one representation. Errors are the
    // CHECKER's to report (check() runs the same idempotent pass); here the
    // resolution is for behavior.
    resolveShapes(program);
    // A program's `script { … }` helpers are evaluated ONCE, here, before any
    // body is compiled — bodies bind their scope at compile time (bindConstraint
    // compiles eagerly), so the scope has to exist before the tree is built. The
    // blocks share one namespace, in source order, exactly as a module would.
    const scriptScope = {};
    // A program's own `theme Name [ … ]` records are in `{ }`-body scope by name
    // (the built-in presets are already there, process-wide), so a body can name
    // one — `theme = { app.dark ? BrandDark : Brand }`.
    for (const t of program.themes)
        scriptScope[t.name] = themeRecord(t);
    // The blocks share one namespace, in source order, exactly as a module
    // would — and that must be true for the BLOCKS THEMSELVES, not only for
    // the { } bodies reading the merged table: a block-2 function calling a
    // block-1 function, or mutating block-1 state, resolves lexically. (Found
    // 2026-09-02: per-block evalScript closures compiled clean — the checker
    // concatenates — and threw ReferenceError at the first cross-block call.)
    // The COMPILER now merges the blocks itself (compile.ts — one body, one
    // bindings return), so a compiled program arrives with one effective
    // block. RAW blocks (the direct-instantiate dev path) concatenate here for
    // the same shared scope. A block carrying the compiled bindings marker
    // ("/*$b*/", compile.ts BINDINGS_MARK) has its own trailing return and
    // must evaluate ALONE — concatenating one would end evaluation at its
    // return and silently drop every later block (bit a stale pre-merge
    // artifact: half the script table vanished).
    const compiledBlocks = program.scripts.filter((s) => s.src.includes("/*$b*/"));
    if (compiledBlocks.length > 0) {
        for (const s of program.scripts)
            Object.assign(scriptScope, evalScript(s.src));
    }
    else if (program.scripts.length > 0) {
        Object.assign(scriptScope, evalScript(program.scripts.map((s) => s.src).join("\n;\n")));
    }
    CURRENT_SCRIPTS = scriptScope;
    return withScriptScope(scriptScope, () => buildTree(program, trusted));
}
/** The last program's script scope — replicated instances compile their
 *  bodies LAZILY (a row materializes during a settle long after build), and
 *  those compilations must see the same `script { }` helpers the eager ones
 *  did. The materializer re-enters the scope around each construct. (Found
 *  the day a replicated row called a script function: the eager bodies
 *  bound it; the first materialized instance threw ReferenceError.) */
let CURRENT_SCRIPTS = {};
function buildTree(program, trusted) {
    const programShapes = shapeNames(program);
    const { infos, schemas, errors } = programSchemas(program.classes, programShapes);
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
        const isShapeType = (n) => programShapes.has(n);
        if (descendsFrom(info.schema, "Layout")) {
            const ctor = synthesize(layoutCtors[info.schema.base.name], info.decl.name, info.decl.body, () => info.defaults, false, isShapeType);
            layoutCtors[info.decl.name] = ctor;
            classes.set(info.decl.name, { info, ctor: ctor, chain });
        }
        else {
            const ctor = synthesize(tags[info.schema.base.name], info.decl.name, info.decl.body, () => info.defaults, false, isShapeType);
            classes.set(info.decl.name, { info, ctor, chain });
            tags[info.decl.name] = ctor;
        }
    }
    const ctx = {
        tags,
        shapes: programShapes,
        layoutCtors,
        schemas,
        classes,
        fonts: buildFonts(program.fonts),
        bundles: collectBundles(program),
        themes: buildThemeMap(program.themes),
        pending: [],
        expanding: new Set(),
        trusted,
    };
    // The `style` bundles a `<span class>` inside RichText resolves against (the
    // by-name cascade's global tier) — module-scoped for the running program.
    setStyleBundles(ctx.bundles);
    const root = construct(program.root, null, ctx);
    if (!(root instanceof View)) {
        throw new DeclareError(`the root must be a view, not a ${program.root.tag}`, program.root.pos);
    }
    // The build context outlives the build for IMPERATIVE CREATION (planes.md
    // §7 — real apps create views at runtime): app.createView resolves names
    // against this tree's own classes + built-ins. Weak by root, so a
    // discarded tree releases its context with it.
    CONTEXTS.set(root, ctx);
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
 *  at build time and at every later data arrival.
 *
 *  A `{ }` provision (`App [ theme = { … } ]`) applies its first value AT
 *  INSTALL — a reader that installs first would read an unprovided name. Two
 *  install-ordering rules keep every reader's first evaluation resolvable:
 *    1. every PROVISION installs before every ordinary reader in the batch, so
 *       a descendant reading `provided("theme")` finds the ancestor's provision
 *       already landed (an ancestor's provisions precede a descendant's here,
 *       because the tree is constructed — and pushed — parent-first);
 *    2. a node's OWN provisions install in DEPENDENCY order — a provision whose
 *       `{ }` reads a peer's provided value (`textColor = { provided("theme")… }`
 *       beside `theme = { … }`) installs after that peer — so a node can both
 *       provide a value and derive another provision from it, in any source
 *       order. */
function installPending(pending, ctx) {
    const { provisions, rest } = partitionPending(pending);
    installBatch(provisions, ctx);
    installBatch(rest, ctx);
}
/** The batch in install order, split at the provision/reader boundary so a
 *  caller can land the provisions EARLY — the materializer installs them
 *  before the instance ATTACHES, because attach first-runs a Text's face push
 *  (flush → the style constraint), and a face read that misses a provision the
 *  instance is about to install keeps the default ink (the desktop Files "Open"
 *  label read black a moment before its Button provided white, 2026-09-11).
 *  The readers follow once linked, attached, and cursored, as before. */
function partitionPending(pending) {
    const provisions = [], rest = [];
    for (const p of pending) {
        if ("provideCode" in p)
            provisions.push(p);
        else
            rest.push(p);
    }
    return { provisions: orderProvisions(provisions), rest };
}
function installBatch(ordered, ctx) {
    for (const p of ordered) {
        if ("code" in p)
            bindConstraint(p.view, p.attr.name, p.code, p.attr.value.pos, p.classroot, p.attr.value.kind === "code" ? p.attr.value.deps : undefined);
        else if ("twoWay" in p)
            bindTwoWay(p.view, p.attr.name, p.twoWay, p.type);
        else if ("twoWayCode" in p)
            bindTwoWayDynamic(p.view, p.attr.name, p.twoWayCode, p.attr.value.pos, p.classroot, p.type);
        else if ("dataPath" in p)
            bindData(p.view, p.attr.name, p.dataPath, p.type, p.plan);
        else if ("cursorPath" in p)
            bindDatapath(p.view, p.cursorPath);
        else if ("cursorCode" in p)
            bindCursor(p.view, p.cursorCode, p.attr.value.pos, p.classroot);
        else if ("provideCode" in p)
            provideBind(p.view, p.attr.name, p.provideCode, p.attr.value.pos, p.classroot, p.attr.value.kind === "code" ? p.attr.value.deps : undefined);
        else if ("layoutEl" in p) {
            if (!ctx.trusted) {
                const errs = checkComponentValue(ctx.schemas, p.view.constructor.name, p.layoutEl.name, p.of, p.layoutEl);
                if (errs.length > 0)
                    throw errs[0];
            }
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
/** Order a batch's provisions so each installs after any it depends on. Groups
 *  by owning node (insertion order preserved, so an ancestor's provisions still
 *  precede a descendant's) and, within a node, emits each provision after the
 *  peer provisions its `{ }` reads via `provided("name")` — a post-order DFS
 *  over the same-node dependency edges the compiler already recorded. A cycle
 *  (a provision transitively reading itself) falls back to encounter order. */
function orderProvisions(provisions) {
    if (provisions.length < 2)
        return [...provisions];
    const groups = new Map();
    for (const p of provisions) {
        const g = groups.get(p.view);
        if (g !== undefined)
            g.push(p);
        else
            groups.set(p.view, [p]);
    }
    const out = [];
    for (const items of groups.values()) {
        if (items.length < 2) {
            out.push(...items);
            continue;
        }
        const byName = new Map();
        for (const p of items)
            byName.set(p.attr.name, p);
        const done = new Set(), active = new Set();
        // The provided values this provision's `{ }` reads, from its SOURCE — so the
        // ordering holds on the dev path too (the compiler's extracted `deps` ride
        // only a compiled program; a verify/headless boot has none). The regex
        // matches both the authored `provided("x")` and the compiled `this.$provided(
        // "x")` — `\bprovided` sits on the `$`↔`p` boundary either way. A spurious
        // match inside a string only adds a harmless edge; `byName` keeps it to this
        // node's own provisions.
        const readsOf = (p) => {
            const names = [];
            for (const m of p.provideCode.matchAll(/\bprovided\(\s*"([^"]+)"/g)) {
                if (m[1] !== p.attr.name && byName.has(m[1]))
                    names.push(m[1]);
            }
            return names;
        };
        const visit = (p) => {
            const name = p.attr.name;
            if (done.has(name) || active.has(name))
                return; // emitted, or a cycle — leave it
            active.add(name);
            for (const dep of readsOf(p))
                visit(byName.get(dep));
            active.delete(name);
            done.add(name);
            out.push(p);
        };
        for (const p of items)
            visit(p);
    }
    return out;
}
/** Views that have fired `onInit` — init is once per lifetime, however the
 *  view arrived (the initial build, or a later replication reconcile whose
 *  own initTree ran before the root's walk reached it). */
const INITED = new WeakSet();
/** Mark a whole subtree as already-inited WITHOUT firing anything — the
 *  membership-anchored lifecycle (materialization.md §2, RULED 2026-07-30):
 *  onInit fires once per record-MEMBERSHIP, so when the reconciler
 *  reconstructs an instance for a member whose init already fired (a
 *  windowed row scrolling back in, a keyed re-derivation reusing identity),
 *  it pre-marks the fresh subtree and initTree stays silent. */
export function markInited(view) {
    INITED.add(view);
    for (const child of view.children) {
        if (child instanceof View)
            markInited(child);
    }
}
/** Depth-first `init` for a faceless subtree: children first, then the node —
 *  the same order initTree gives views. Idempotent through the same INITED
 *  set, so a re-entered walk cannot double-fire. */
function initNodeTree(node) {
    for (const child of node.children) {
        if (child instanceof View)
            initTree(child);
        else if (child instanceof Node)
            initNodeTree(child);
    }
    if (!INITED.has(node)) {
        INITED.add(node);
        fireEvent(node, "init");
    }
}
function initTree(view) {
    for (const child of view.children) {
        if (child instanceof View)
            initTree(child);
        // a FACELESS child (a plain Node — a controller, a clock, an animator, a
        // coordinator) has no applier and no surface — but it has a lifecycle:
        // Node.md has always promised `init`, and until this branch the walk
        // skipped every non-View child, so a node's onInit silently never ran.
        // Animators included: their schema inherits the event, so they receive
        // it (autoStart is separate machinery, fired after inits as ever).
        else if (child instanceof Node)
            initNodeTree(child);
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
        // Sources (Keys/Focus/Tip; a Time joins its clock or arms its alarm) wire here, with the
        // animators' auto-start: construction-complete, so every declared handler
        // is installed and the source can tell which channels to subscribe.
        if (child instanceof Animator || child instanceof AnimatorGroup)
            child.autoStart();
        else if (isSourceNode(child))
            child.autoStart();
        // Apply a state's initial value once linked. A gated state has usually
        // already synced from its gate's first run in pass two (idempotent here); a
        // literal `applied = true` (no gate) applies now. Non-View, like animators.
        else if (child instanceof State)
            child.init();
    }
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
/** Resolve a `theme = Name` reference to its record, or throw naming what is
 *  declared. */
function themeByName(ctx, name, pos) {
    const rec = ctx.themes.get(name);
    if (rec === undefined) {
        throw new DeclareError(`no theme named '${name}' — declared themes: ${[...ctx.themes.keys()].join(", ")}`, pos);
    }
    return rec;
}
/** One `theme Name [ tokens ]` declaration → its frozen token record. */
function themeRecord(decl) {
    const rec = {};
    for (const a of decl.body.attrs)
        rec[a.name] = coerceToken(a.value);
    return Object.freeze(rec);
}
/** The program's theme names → records for `theme = Name` resolution: the
 *  built-in presets, plus any the program declares itself (which override a
 *  preset of the same name). */
function buildThemeMap(themes) {
    const map = new Map(Object.entries(THEME_PRESETS));
    for (const t of themes)
        map.set(t.name, themeRecord(t));
    return map;
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
outer = false, 
/** Is this written type name a declared SCHEMA (typed data)? Schema-typed
 *  slots get the L-23 tracked-view hook below. */
isShapeType = () => false) {
    const B = base;
    const cls = class extends B {
    };
    // The class's name carries into every diagnostic ("Tally.count is bound…").
    //
    // `configurable: false` is load-bearing, not tidiness. defineProperty on an
    // EXISTING property keeps whatever attributes you leave unspecified, and a
    // class's own `name` arrives configurable — so `{ value: name }` alone wrote
    // the name and left it indistinguishable from the one JS put there. That is
    // exactly the test inspect.ts:stampedName() applies to tell an authored class
    // from a minified one, so every user class read back as its base ("View")
    // instead of `Shot`, `Ev`, `DockIcon` — the names introspection documents.
    Object.defineProperty(cls, "name", { value: name, configurable: false });
    if (body.decls.length > 0) {
        const probe = new B();
        const specs = {};
        const declRecords = {};
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
            // A SCHEMA-TYPED slot (`sel: Task`, `picked: Task[]`) is LIVE past its
            // identity (typed data, 2026-09-02 — the L-23 rule extended): a tracked
            // reader gets the tracking view of the held record, so `app.sel.title`
            // in a { } wires the record's region cell and a later
            // `set(["tasks", i, "title"], …)` wakes it — a record slot never shows
            // a value that has since moved on. Untracked readers (handlers) keep
            // the raw record; a tracked view assigned INTO the slot normalizes back
            // to raw (the Dataset.value push pattern), so identity stays one thing.
            const shapeSlot = isShapeType(d.type.endsWith("[]") ? d.type.slice(0, -2) : d.type);
            specs[d.name] = {
                def: Object.hasOwn(defs, d.name) ? defs[d.name] : undefined,
                // The runtime half of the slot's identity: a `readonly` declaration
                // makes the accessor's setter throw (its `{ }` default is the value,
                // evaluated live and un-overridable).
                readOnly: d.readOnly || undefined,
                defBinding,
                defOuter: outer || undefined,
                ...(shapeSlot ? {
                    push: (self, v) => {
                        const raw = unwrapValue(v);
                        if (raw !== v)
                            setBound(self, d.name, raw);
                    },
                    tracked: (_self, v) => trackedView(v),
                } : {}),
            };
            // The tooling record (attributes.ts DECLARED): a defBinding drops the
            // source at compile, and the introspection surface went blind exactly at
            // the program's own slots — keep what explain()/slots() need to answer.
            // (pos is optional-chained throughout: a HYDRATED program — the slim
            // production artifact — rebuilds the AST from JSON without positions)
            const at = (d.def?.kind === "code" ? d.def.pos : undefined) ?? d.pos;
            declRecords[d.name] = {
                source: d.def?.kind === "code" ? d.def.src : null,
                pos: at != null && typeof at.line === "number" ? { line: at.line, col: at.col ?? 0 } : null,
                deps: d.def?.kind === "code" ? (d.def.deps ?? null) : null,
                type: d.type,
                external: d.external || undefined,
                readOnly: d.readOnly || undefined,
            };
        }
        // The static mapped type on defineAttributes serves hand-declared
        // classes; parse-path names are dynamic, hence the cast.
        defineAttributes(cls, specs);
        recordDeclarations(cls, declRecords);
    }
    return cls;
}
/** The anonymous one-off subclasses (language §5): an instance with inline
 *  declarations gets one, synthesized once per source element — a class-body
 *  element instantiates once per class *instance*, and they all share the
 *  same prototype accessors, exactly as if the compiler had named the class. */
const ANON = new WeakMap();
function ctorWithDecls(el, base, schema, isComponent, isShape = () => false) {
    if (el.decls.length === 0)
        return base;
    let ctor = ANON.get(el);
    if (ctor === undefined) {
        const defaults = () => {
            const defs = {};
            for (const d of el.decls) {
                const r = checkDecl(schema, d, schema.name, isComponent, isShape);
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
        ctor = synthesize(base, base.name, el, defaults, true, isShape);
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
    if (schema !== null && Object.hasOwn(SOURCES, el.tag)) {
        return constructSource(el, schema, outer, ctx);
    }
    if (schema !== null && descendsFrom(schema, "State")) {
        return constructState(el, schema, outer, ctx, parentSchema);
    }
    if (baseCtor === null || schema === null)
        throw new DeclareError(`unknown component '${el.tag}'`, el.pos);
    const user = ctx.classes.get(el.tag);
    const view = new (ctorWithDecls(el, baseCtor, schema, (n) => ctx.schemas[n] !== undefined, (n) => ctx.shapes.has(n)))();
    view.classroot = outer;
    // The `classroot` for members written at THIS element's site: the enclosing
    // scope — or, at the tree root, the root itself (its members are written
    // in its own body: the anonymous App class's).
    const croot = outer ?? view;
    const eff = withDecls(schema, el.decls, (n) => ctx.schemas[n] !== undefined, (n) => ctx.shapes.has(n));
    // Merge the member sources: class-body chain base→leaf (classroot = this
    // instance), then the use site (classroot = the outer scope). Same-named
    // members: the nearest provider wins — a derived body overrides its base's,
    // the instance overrides the class's — and only the winner installs, so a
    // class-body `{ }` binding and an instance literal on one slot never fight
    // over ownership.
    const attrs = new Map();
    const sources = [...(user?.chain ?? []).map((body) => ({ el: body, croot: view })), { el, croot }];
    // Stamp the navigation target (capabilities.md §6, links.ts): the leaf-most
    // source with a `link` wins — a use-site override beats the class body, the
    // same nearest-wins rule the methods/attrs merge below follows. Read only by
    // the static extractor; runtime navigation is the handler's own navigate(to).
    for (const s of sources)
        if (s.el.link)
            view._navLink = s.el.link;
    // (methods are installed per SOURCE below, so each body's `super` reaches
    // the providers beneath it — see the install loop)
    // Attribute channels land in the ruled precedence order, so "nearest
    // provider wins" is simply map-insertion order: class-body sets base→leaf
    // (rank 4), then the use site (rank 5). Only the winner installs, so no two
    // channels ever contend over ownership. (The retired `styles` bundle-on-a-view
    // channel used to sit between them — provided values and subclassing replace it;
    // `style` bundles survive only as the `<span class>` run vehicle in RichText.)
    for (const s of sources.slice(0, -1)) {
        for (const a of s.el.attrs)
            attrs.set(a.name, { attr: a, croot: s.croot });
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
    //
    // SUPER (2026-09-12): sources run base → leaf → use site, and each body's
    // methods are compiled against a SNAPSHOT of what was installed before it —
    // the `$base` object `super.name(…)` reaches (compile.ts rewrites the
    // keyword). Nearest provider still wins the instance member; a base body's
    // own `super` reaches ITS base, since its snapshot was taken before it.
    const methods = new Map();
    for (const s of sources) {
        // built only for a body that calls super (compiled bodies spell it $base):
        // a replicated row whose class never does pays no per-instance object
        const base = s.el.methods.some((m) => m.body.includes("$base")) ? Object.fromEntries(methods) : NO_BASE;
        for (const m of s.el.methods) {
            if (!ctx.trusted) {
                const r = checkMethod(eff, m);
                if (!r.ok)
                    throw r.error;
            }
            // Collision with the runtime's own members is an instantiation-context
            // fact (the checker is runtime-free by design, like percent-on-root):
            // installing over `attach`/`children`/`toString` would corrupt the view.
            if (m.name in view) {
                throw new DeclareError(`${schema.name}.${m.name}: '${m.name}' is a built-in member of the runtime ${schema.name} — choose another name`, m.pos);
            }
            const c = compileBody(m.params.map((p) => p.name), m.body);
            if ("error" in c)
                throw new DeclareError(`${schema.name}.${m.name}(…) ${c.error}`, m.bodyPos);
            const fn = c.fn;
            const mcroot = s.croot;
            // Close over the instance (rather than relying on call-site `this`), so
            // an extracted reference — `const f = v.select; f()` — still works and
            // `this`/`parent`/`classroot` inside the body always mean this view, its
            // parent, and the scope the member was written in.
            methods.set(m.name, (...args) => fn.call(view, view.parent, mcroot, base, ...args));
        }
    }
    for (const [name, installed] of methods)
        view[name] = installed;
    for (const { attr, croot: acroot } of attrs.values()) {
        const t0 = attrType(eff, attr.name);
        // A bare `[tl, tr, br, bl]` on a radius slot — check.ts vetted the shape.
        if (t0?.kind === "radius" && attr.value.kind === "list") {
            view[attr.name] =
                Object.freeze(attr.value.items.map((it) => (it.kind === "number" ? it.value : 0)));
            continue;
        }
        // A bare `[ … ]` on an array slot — the literal form check.ts validated.
        // Frozen like the styling lists: a bare literal is set once, so the value
        // the slot holds is not something a later push should appear to change.
        if (t0?.kind === "array" && attr.value.kind === "list") {
            view[attr.name] =
                Object.freeze(attr.value.items.map((it) => {
                    if (it.kind === "number" || it.kind === "string")
                        return it.value;
                    if (it.kind === "hexColor") {
                        const c = coerce({ kind: "color" }, it);
                        return c.ok ? c.value : null;
                    }
                    if (it.kind === "ident") {
                        if (it.name === "null")
                            return null;
                        if (it.name === "true")
                            return true;
                        if (it.name === "false")
                            return false;
                        const c = coerce({ kind: "color" }, it);
                        return c.ok ? c.value : null;
                    }
                    return null;
                }));
            continue;
        }
        // `theme = Cupertino` → the named theme record (a declared Theme slot),
        // resolved against the presets plus the program's own `theme` declarations.
        if (t0?.kind === "record" && t0.name === "Theme" && attr.value.kind === "ident" && attr.value.name !== "null") {
            view[attr.name] = themeByName(ctx, attr.value.name, attr.value.pos);
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
                        ? diag `no font named '${name}' — declared fonts: ${[...ctx.fonts.keys()].join(", ")}`
                        : diag `no font named '${name}' — this program declares no fonts`, pos);
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
        const r = routeAttr(eff, attr, ctx.trusted);
        if (!r.ok)
            throw r.error;
        if (applyProvision(r, view, attr, ctx, acroot))
            continue;
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
                // The D4 legality table, enforced here too for the unchecked-tree
                // path (check refuses at compile time): a cursor is ONE static place.
                const cSegs = r.datapath.plan === undefined ? null : staticSegs(r.datapath.plan);
                if (r.datapath.plan !== undefined && cSegs === null) {
                    throw new DeclareError(`datapath = :${r.datapath.path} — a cursor is ONE place; a selective or data-resolved path matches elsewhere. Read it as a value, or replicate over it: datapath = :${r.datapath.path}[]`, r.datapath.pos);
                }
                ctx.pending.push({ view, attr, cursorPath: cSegs ?? r.datapath.path });
            }
            else if (attr.bind === "two") {
                // `name <-> :path` — a two-way binding on an editable leaf slot: read
                // the datapath AND write edits back to it (editor.ts). check() has
                // already confirmed the slot is eligible — and that the path is a
                // SINGULAR, STATIC place; the unchecked-tree path enforces it here.
                const wSegs = r.datapath.plan === undefined ? null : staticSegs(r.datapath.plan);
                if (r.datapath.plan !== undefined && wSegs === null) {
                    throw new DeclareError(`'${attr.name} <-> :${r.datapath.path}' — a two-way binding writes ONE place; a selective or data-resolved path cannot name it`, r.datapath.pos);
                }
                ctx.pending.push({ view, attr, twoWay: wSegs ?? r.datapath.path, type: t });
            }
            else {
                ctx.pending.push({ view, attr, dataPath: r.datapath.path, type: t, plan: r.datapath.plan });
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
        const c = compileBody(m.params.map((p) => p.name), m.body);
        if ("error" in c)
            throw new DeclareError(`${schema.name}.${m.name}(…) ${c.error}`, m.bodyPos);
        const fn = c.fn;
        node[m.name] =
            (...args) => fn.call(node, node.parent, outer, NO_BASE, ...args);
    }
    for (const a of el.attrs) {
        const r = routeAttr(schema, a, ctx.trusted);
        if (!r.ok)
            throw r.error;
        if (applyProvision(r, node, a, ctx, outer))
            continue;
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
            let value;
            try {
                value = JSON.parse(el.raw.src);
            }
            catch (e) {
                throw new DeclareError(`${el.name ?? el.tag}: the Dataset body is not valid JSON — ${e.message}`, el.raw.pos);
            }
            // Validate the EMBEDDED body against a declared schema at build —
            // static data fails loudly and early (B4; a DataSource validates the
            // same way at arrival, landing in .failed).
            const shape = node.schema;
            if (shape !== null) {
                const err = validateDoc(value, shape);
                if (err !== null) {
                    throw new DeclareError(`${el.name ?? el.tag}: the embedded data does not match the schema — ${err}`, el.raw.pos);
                }
            }
            node.value = value;
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
        if (!ctx.trusted) {
            const r = checkMethod(schema, m);
            if (!r.ok)
                throw r.error;
        }
        if (m.name in node) {
            throw new DeclareError(`${schema.name}.${m.name}: '${m.name}' is a built-in member of the runtime ${schema.name} — choose another name`, m.pos);
        }
        const c = compileBody(m.params.map((p) => p.name), m.body);
        if ("error" in c)
            throw new DeclareError(`${schema.name}.${m.name}(…) ${c.error}`, m.bodyPos);
        const fn = c.fn;
        node[m.name] =
            (...args) => fn.call(node, node.parent, outer, NO_BASE, ...args);
    }
    for (const a of el.attrs) {
        const r = routeAttr(schema, a, ctx.trusted);
        if (!r.ok)
            throw r.error;
        if (applyProvision(r, node, a, ctx, outer))
            continue;
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
/** Construct a SOURCE node — a non-visual member whose handlers are called from
 *  outside the tree (sources.ts: `Keys`, `Focus`, `Tip`; streams.ts: the transports).
 *  Like an animator it carries attributes plus handlers; unlike one it drives no
 *  slot, so none of the animator's target checking applies. Its subscriptions
 *  are wired by initTree's autoStart — the same lifecycle hook an animator uses,
 *  which is also why a source costs nothing for a handler nobody declared. */
function constructSource(el, schema, outer, ctx) {
    if (el.decls.length > 0 || el.children.length > 0) {
        throw new DeclareError(`a ${el.tag} takes attributes and its own handlers only`, el.pos);
    }
    if (el.raw !== undefined) {
        throw new DeclareError(`only a Dataset carries a { } body — a ${el.tag}'s members go in [ ]`, el.raw.pos);
    }
    const node = new SOURCES[el.tag]();
    for (const m of el.methods) {
        if (!ctx.trusted) {
            const r = checkMethod(schema, m);
            if (!r.ok)
                throw r.error;
        }
        if (m.name in node) {
            throw new DeclareError(`${schema.name}.${m.name}: '${m.name}' is a built-in member of the runtime ${schema.name} — choose another name`, m.pos);
        }
        const c = compileBody(m.params.map((p) => p.name), m.body);
        if ("error" in c)
            throw new DeclareError(`${schema.name}.${m.name}(…) ${c.error}`, m.bodyPos);
        const fn = c.fn;
        node[m.name] =
            (...args) => fn.call(node, node.parent, outer, NO_BASE, ...args);
    }
    for (const a of el.attrs) {
        // A bare `[ … ]` on an array slot (`listenTo = ["delta", "done"]`) —
        // materialized exactly as the view path's literal-list arm above: frozen,
        // set once.
        if (attrType(schema, a.name)?.kind === "array" && a.value.kind === "list") {
            node[a.name] =
                Object.freeze(a.value.items.map((it) => {
                    if (it.kind === "number" || it.kind === "string")
                        return it.value;
                    if (it.kind === "ident") {
                        if (it.name === "null")
                            return null;
                        if (it.name === "true")
                            return true;
                        if (it.name === "false")
                            return false;
                    }
                    return null;
                }));
            continue;
        }
        const r = routeAttr(schema, a, ctx.trusted);
        if (!r.ok)
            throw r.error;
        if (applyProvision(r, node, a, ctx, outer))
            continue;
        if ("binding" in r)
            ctx.pending.push({ view: node, attr: a, code: r.binding.src, classroot: outer });
        else if ("datapath" in r) {
            throw new DeclareError(`${el.tag}.${a.name}: a ${el.tag} attribute is a value or a { }, not a data read`, a.value.pos);
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
        if (!ctx.trusted) {
            const r = checkMethod(schema, m);
            if (!r.ok)
                throw r.error;
        }
        if (m.name in node) {
            throw new DeclareError(`${schema.name}.${m.name}: '${m.name}' is a built-in member of the runtime ${schema.name} — choose another name`, m.pos);
        }
        const c = compileBody(m.params.map((p) => p.name), m.body);
        if ("error" in c)
            throw new DeclareError(`${schema.name}.${m.name}(…) ${c.error}`, m.bodyPos);
        const fn = c.fn;
        node[m.name] =
            (...args) => fn.call(node, node.parent, outer, NO_BASE, ...args);
    }
    // The effective cascade for members: what this group inherited, overlaid with
    // its own cascadeable literals (a `{ }`-bound cascade attribute stays on the
    // group — v1 does not cascade bindings).
    const cascade = { ...inherited };
    for (const a of el.attrs) {
        const r = routeAttr(schema, a, ctx.trusted);
        if (!r.ok)
            throw r.error;
        if (applyProvision(r, node, a, ctx, outer))
            continue;
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
        if (!ctx.trusted) {
            const r = checkMethod(schema, m);
            if (!r.ok)
                throw r.error;
        }
        if (m.name in node) {
            throw new DeclareError(`${schema.name}.${m.name}: '${m.name}' is a built-in member of the runtime ${schema.name} — choose another name`, m.pos);
        }
        const c = compileBody(m.params.map((p) => p.name), m.body);
        if ("error" in c)
            throw new DeclareError(`${schema.name}.${m.name}(…) ${c.error}`, m.bodyPos);
        const fn = c.fn;
        node[m.name] = (...args) => fn.call(node, node.parent, outer, NO_BASE, ...args);
    }
    // Attributes: `applied` is the one control slot (a literal now, a `{ }` gate
    // in pass two). Every other attribute is an OVERRIDE on the enclosing view —
    // captured as a slot + a factory that builds a FRESH driving Constraint each
    // apply, coerced / compiled against the parent's schema (the view it targets).
    const overrides = [];
    for (const a of el.attrs) {
        if (a.name === "applied") {
            const r = routeAttr(schema, a, ctx.trusted);
            if (!r.ok)
                throw r.error;
            if (applyProvision(r, node, a, ctx, outer))
                continue;
            if ("binding" in r)
                ctx.pending.push({ view: node, attr: a, code: r.binding.src, classroot: outer });
            else if ("value" in r)
                node.applied = r.value;
            continue;
        }
        if (parentSchema === null) {
            throw new DeclareError(`a ${el.tag} overrides its enclosing view's slots, but '${a.name}' has no view to target here`, a.value.pos);
        }
        const r = routeAttr(parentSchema, a, ctx.trusted);
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
        else if ("provision" in r) {
            throw new DeclareError(`${el.tag}.${slot}: a state override sets a declared slot of the view, not a provided value`, a.value.pos);
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
        layout.parent = owner;
        installLayoutClass(layout, el, userClass, owner, ctx);
        return layout;
    }
    // A built-in strategy (SimpleLayout): a literal lands directly; a `{ }` binding
    // installs a constraint over the strategy's slot — the same reactive path a user
    // layout subclass takes (installLayoutClass), so `axis`/`spacing` re-flow live.
    const strategy = new LAYOUTS[el.tag]();
    // Wire the arranged view (its `parent`) BEFORE the strategy's own attributes
    // bind, so an `axis`/`spacing` constraint reading `parent.width` resolves at its
    // first eval — attachTo re-wires the identical ref when the slot is pushed.
    strategy.parent = owner;
    const schema = ctx.schemas[el.tag];
    const croot = owner.classroot ?? owner;
    for (const a of el.attrs) {
        if (a.value.kind === "code") {
            bindConstraint(strategy, a.name, a.value.src, a.value.pos, croot);
            continue;
        }
        const r = routeAttr(schema, a, ctx.trusted);
        if (!r.ok)
            throw r.error;
        if (!("value" in r) || isPercent(r.value)) {
            throw new DeclareError(`${el.tag}.${a.name}: a layout attribute takes a literal or { }`, a.pos);
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
    const eff = withDecls(ctx.schemas[el.tag], el.decls, (n) => ctx.schemas[n] !== undefined, (n) => ctx.shapes.has(n));
    const croot = owner.classroot ?? owner;
    const self = layout;
    // Methods: class chain base→leaf, then the use site; nearest provider wins.
    // Each body compiles against a snapshot of the providers beneath it — what
    // its `super.name(…)` reaches (the view path's rule).
    const methods = new Map();
    for (const body of [...uc.chain, el]) {
        const base = body.methods.some((m) => m.body.includes("$base")) ? Object.fromEntries(methods) : NO_BASE;
        for (const m of body.methods) {
            if (!ctx.trusted) {
                const r = checkMethod(eff, m);
                if (!r.ok)
                    throw r.error;
            }
            if (m.name in layout) {
                throw new DeclareError(`${el.tag}.${m.name}: '${m.name}' is a built-in member of the runtime layout — choose another name`, m.pos);
            }
            const c = compileBody(m.params.map((p) => p.name), m.body);
            if ("error" in c)
                throw new DeclareError(`${el.tag}.${m.name}(…) ${c.error}`, m.bodyPos);
            const fn = c.fn;
            methods.set(m.name, (...args) => fn.call(layout, layout.parent, croot, base, ...args));
        }
    }
    for (const [name, installed] of methods)
        self[name] = installed;
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
        const r = routeAttr(eff, a, ctx.trusted);
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
            // `virtualize` — the policy slot: replication metadata like `key`,
            // consumed here, stripped from the template by the Replicator. A
            // literal is resolved now; a `{ }` becomes a thunk the Replicator calls
            // from inside its match, so the reads are tracked and the block engages
            // or disengages when the answer changes. Scope note: no instance exists
            // for a block-level value, so `this` is the CONTAINER (the realistic
            // expressions read `app.…` or `classroot.…`). check() validated the form.
            const vAttr = childEl.attrs.find((a) => a.name === "virtualize");
            let policy = false;
            if (vAttr !== undefined) {
                const wv = vAttr.value;
                if (wv.kind === "code") {
                    const c = compileExpr(wv.src ?? "");
                    if ("error" in c)
                        throw new DeclareError(`virtualize = { … } ${c.error}`, vAttr.value.pos);
                    const fn = c.fn;
                    policy = () => !!fn.call(parentView, parentView.parent, croot);
                }
                else {
                    policy = wv.name === "true";
                }
            }
            const replicator = new Replicator(parentView, childEl, many.value.path, croot, materializer(ctx), slot.prev, keyPath, many.value.plan ?? null, policy);
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
                // The BACKSTOP. The checker refuses this in the source — both the
                // runtime's own surface and a member the component declares, the
                // second with the attribute door named — so what reaches here is a
                // path that skipped the checker (a direct instantiate).
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
        const hint = tag in TAGS ? "" : diag ` — declare the class, include its library, or keep it with 'use [ ${tag} ]'`;
        throw new DeclareError(`createView: no component named '${tag}'${hint}`);
    }
    const el = { tag, name: null, attrs: [], decls: [], methods: [], children: [], pos: { line: 0, col: 0 } };
    const made = materializer(ctx)(el, parent);
    parent.insertChild(made.view, parent.children.length);
    made.provide(); // provisions before attach (partitionPending)
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
    // The arrival notify (the replicator's once-per-reconcile call, here once
    // per verb): re-arm the parent's arrangement and install/re-run auto-extent
    // — a never-sized parent EMPTY until now becomes derivable at this moment,
    // which the structure cell alone cannot express (it wakes installed
    // subscribers; it cannot install one).
    parent.childrenMutated();
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
            const node = withScriptScope(CURRENT_SCRIPTS, () => construct(template, classroot, ctx));
            if (!(node instanceof View)) {
                throw new DeclareError(`a ${template.tag} cannot replicate — it is not a view`, template.pos);
            }
            const { provisions, rest } = partitionPending(ctx.pending);
            // provide lands the instance's PROVISIONS — called by the consumer before
            // the instance attaches (see partitionPending); finish lands the rest and
            // covers a consumer that never called provide. Both COMPILE (installBatch
            // binds constraints, which capture the script scope at compile time) —
            // they need the scope exactly as construct does.
            let provided = false;
            const provide = () => {
                if (provided)
                    return;
                provided = true;
                withScriptScope(CURRENT_SCRIPTS, () => installBatch(provisions, ctx));
            };
            return {
                view: node,
                provide,
                finish: () => {
                    provide();
                    withScriptScope(CURRENT_SCRIPTS, () => installBatch(rest, ctx));
                    initTree(node);
                },
                // Membership-anchored init (the D5 ruling): the reconciler calls this
                // before finish when the record's membership already fired its init —
                // a reconstructed window row, a keyed re-derivation — so initTree
                // stays silent for the whole subtree.
                suppressInit: () => markInited(node),
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
    // The element arrived from a live parse (the Inspector\'s evaluation) — no
    // compiler vouches for it, so validate even inside a trusted tree. The whole
    // pipeline (construct → attach → finish) runs inside the window.
    const wasTrusted = ctx.trusted;
    ctx.trusted = false;
    try {
        const made = materializer(ctx)(el, parent);
        parent.insertChild(made.view, parent.children.length);
        made.provide(); // provisions before attach (partitionPending)
        const ps = parent.surface;
        if (ps !== null && parent.backend !== null)
            made.view.attach(parent.backend, ps, null);
        made.finish();
        parent.childrenMutated(); // the arrival notify — same as createViewIn
        return made.view;
    }
    finally {
        ctx.trusted = wasTrusted;
    }
}
provideViewCreator(createViewIn);
//# sourceMappingURL=instantiate.js.map