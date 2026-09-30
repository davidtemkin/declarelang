// capabilities — WHAT A PRODUCTION BUILD CARRIES, as one inclusion graph.
//
// A capability is a piece of the runtime a program may never reach: a module (or
// a few) plus the TRIGGERS that say a program reaches it. The build takes the
// capabilities a program triggers, closes them over `requires` (C needs B needs
// A: all three come in; name only A and only A does) — the same shape as the
// include and auto-include graphs — and every capability left out has its
// modules replaced by a stand-in GENERATED from the real module's exports, so a
// stand-in can never drift from its module.
//
// Triggers come in a fixed set of kinds, each read off the program by ONE walk
// (programFacts): a class the program constructs, a method it declares, an
// attribute it sets or writes, a name a `{ }` body mentions, calls or writes (by
// TypeScript's own parser, never a pattern), a slot set to a value the build
// cannot read, a syntax construct, and the build's own context. No capability
// has analysis code of its own: adding one is a manifest entry.
//
// A stand-in answers two ways. An export the core calls whether or not the
// program uses the capability is INERT — a benign value from a fixed vocabulary,
// declared in the manifest. Every other export REFUSES: reaching it means the
// program did need the capability, so it throws a coded "not aboard" error
// (runtime/src/errors.ts notAboard) naming the capability. A constant that can
// neither be inert-by-declaration nor throw is a build error, so every export
// gets a decision.
//
// A SUBSET capability is a table a program reaches only by the names it writes
// (the built-in class schemas): left out, its module ships as itself with
// the table cut to the entries the program names.
//
// docs/system-design/app-slimming.md is the account of all this, and
// test/slim-corpus.test.mjs the gate that what a build leaves out was unreachable.
import ts from "typescript";
import { THEME_PRESET_NAMES } from "../../runtime/dist/themes.js";
import { SCHEMAS, descendsFrom } from "../../runtime/dist/schema.js";
// ── the manifest ───────────────────────────────────────────────────────────
const FOCUS_OBJECT = { members: {
        setRoot: "noop", focus: "noop", blur: "noop", next: "noop", prev: "noop",
        byKeyboard: "false", getFocus: "null", onFocusChange: "unsubscribe", onGeometry: "unsubscribe", noteDiscarded: "noop",
    } };
const KEYS_OBJECT = { members: {
        listen: "noop", isDown: "false", held: "array", onKeyDown: "unsubscribe", onKeyUp: "unsubscribe",
        keyDown: "noop", keyUp: "noop", chord: "unsubscribe",
    } };
/** The effect constructors a literal slot or a body can name (effects.ts). */
const EFFECT_CALLS = ["blur", "brightness", "contrast", "saturate", "grayscale", "invert",
    "sepia", "hueRotate", "colorize", "frost", "radialGradient", "conicGradient"];
export const CAPABILITIES = [
    // ── what a production build leaves out unless the build asks ─────────────
    { id: "checker", describe: "the runtime checker (a program is checked when it is compiled)",
        modules: ["check"], when: [{ build: { debug: true } }], refusal: "checker" },
    { id: "bridge", describe: "the __declare introspection bridge",
        modules: ["inspect"], when: [{ build: { debug: true } }, { build: { inspector: true } }, { build: { bridge: true } }], refusal: "bridge",
        inert: { bridgeFor: "null", pickAt: "null", dependentsOf: "array", expandValue: "null", slotsOf: "array",
            inspect: "null", find: "null", explain: "null", stats: "null", pathOf: "empty-string", kindName: "empty-string", clock: "object" } },
    { id: "inspector-service", describe: "the Inspector's object-browser service",
        modules: ["inspect-service"], when: [{ build: { debug: true } }, { build: { inspector: true } }], refusal: "inspector",
        inert: { setInspectionTarget: "noop", provideEvalParser: "noop", inspectionTarget: "null", Inspect: { members: { ready: "false" } } } },
    { id: "inspector-boot", describe: "the Inspector's page wiring",
        modules: ["browser/inspector-boot"], when: [{ build: { debug: true } }, { build: { inspector: true } }], refusal: "inspector",
        inert: { openInspector: "noop", provideInspectorProgram: "noop", closeInspector: "noop", originOfElement: "noop", wireInspector: "noop" } },
    { id: "datapath-scanner", describe: "the datapath scanner (compile-time work a built program never repeats)",
        modules: ["datapath"], when: [{ build: { debug: true } }], hostsKeep: true, refusal: "unused",
        inert: { rewriteDatapaths: { wrap: "src" }, scanDatapaths: "array" } },
    { id: "compiler", describe: "the in-page compiler and live edit", modules: ["browser/compiler-client", "browser/live-edit"],
        when: [{ build: { compiler: true } }], refusal: "unused", debugKeeps: false,
        inert: { COMPILER_ABOARD: "false", loadCompiler: "rejects", loadCompilerInline: "rejects",
            ensureLibrary: { resolves: "identity" }, loadLibraryOnce: { resolves: "object" },
            installLiveEdit: { returns: { members: { watchAll: "noop", watchChild: "noop" } } } } },
    { id: "canvas-renderer", describe: "the canvas renderer", modules: ["canvas-backend"],
        when: [{ build: { render: "canvas" } }], refusal: "unused", debugKeeps: false },
    // ── what the program reaches ─────────────────────────────────────────────
    { id: "themes", describe: "the Themes preset records", modules: ["themes"], hostsKeep: true, refusal: "unused",
        when: [{ mentions: [...THEME_PRESET_NAMES, "activeTone"] }],
        inert: { THEME_PRESETS: "object", THEME_PRESET_NAMES: "array", activeTone: "identity" } },
    { id: "draw", describe: "draw(): the drawing vocabulary and raster cache", modules: ["draw"], requires: ["visibility"], hostsKeep: true, refusal: "unused",
        when: [{ methods: ["draw"] }],
        inert: { record: "null", replay: "noop", Draw: "class", DrawGradient: "class", replayArea: "zero", listIsolated: "false",
            rasterLooksBlank: "false", rasterPad: "zero", rasterEntryCap: "zero", rasterTotalCap: "zero",
            RASTER_MAX_DIM: "zero", RASTER_MAX_AREA: "zero", RASTER_GRACE_MS: "zero", makeCanvas: "null" } },
    { id: "canvas-filter", describe: "the canvas `filter` fallback (Safari paints a canvas filter as nothing)",
        modules: ["canvas-filter"], hostsKeep: true, refusal: "unused",
        when: [{ writes: ["filter"] }, { build: { render: "canvas" } }],
        inert: { isIdentity: "true", ctxFilterSupported: "true", applyFilterFallback: "identity", forceFilterFallback: "noop" } },
    { id: "focus-keys", describe: "keyboard focus and the key service", modules: ["focus", "keys"], hostsKeep: true, refusal: "unused",
        when: [{ classes: ["Keys", "Focus", "TextInput"], methods: ["onKeyDown", "onKeyUp", "onFocus", "onBlur", "onEscapeFocus"],
                attributes: ["focusable"], attributesUnless: { focusable: "false" }, mentions: ["Keys", "Focus"] }],
        inert: { Focus: FOCUS_OBJECT, deliverKeys: "unsubscribe", FocusService: "class",
            Keys: KEYS_OBJECT, setKeysFocusProbe: "noop", KeysService: "class", normalize: "null" } },
    { id: "tips", describe: "tooltips", modules: ["tip"], hostsKeep: true, refusal: "unused",
        when: [{ classes: ["Tip"], attributes: ["tip"], mentions: ["Tip"] }],
        inert: { Tip: { members: { over: "noop", out: "noop", hide: "noop", show: "noop", onTip: "unsubscribe" } } } },
    { id: "viewport-lock", describe: "the focus-zoom lock for a program that takes raw touches", modules: ["viewport-lock"],
        hostsKeep: true, refusal: "unused",
        when: [{ methods: ["onTouchStart", "onTouchMove", "onTouchEnd", "onTouchCancel"] }],
        inert: { lockFocusZoom: "noop" } },
    { id: "selectors", describe: "the path-selector evaluator (index, slice, wildcard)", modules: ["select"],
        hostsKeep: true, refusal: "selectors", when: [{ syntax: ["selector-path"] }] },
    { id: "schemas", describe: "typed data: the shape validator and resolver", modules: ["data-schema", "shape-resolve"],
        hostsKeep: true, refusal: "unused", when: [{ syntax: ["schema"] }],
        inert: { validateShape: "null", validateDoc: "null", fieldValueError: "null",
            resolveShapes: { returns: { members: { table: "map", errors: "array" } } }, shapeNames: "set", isArrayDoc: "false" } },
    { id: "effects", describe: "filters, gradients and backdrops", modules: ["effects"], hostsKeep: true, refusal: "unused",
        when: [{ calls: EFFECT_CALLS, slots: ["filter", "backdrop"], dynamicSlots: ["fill", "textFill", "ink", "background", "bg", "tintUse", "hue"] }] },
    { id: "dom-effects", describe: "the DOM's tint and mask", modules: ["dom-effects"], hostsKeep: true, refusal: "unused",
        when: [{ calls: ["colorize"], slots: ["mask", "tint"], dynamicSlots: ["filter", "backdrop"] }] },
    { id: "3d", describe: "3D transforms", modules: ["projective"], hostsKeep: true, refusal: "unused",
        when: [{ attributes: ["rotateX", "rotateY", "translateZ", "perspective", "backface"] }] },
    { id: "measure-text", describe: "measureText and providedTextStyle", modules: ["text-measure"], hostsKeep: true, refusal: "unused",
        when: [{ calls: ["measureText", "providedTextStyle"] }] },
    { id: "font-features", describe: "OpenType figures", modules: ["font-derive"], hostsKeep: true, refusal: "unused",
        when: [{ attributes: ["numerals", "numeralWidth", "slashedZero"] }] },
    { id: "faces", describe: "Face declarations", modules: ["face-literal"], hostsKeep: true, refusal: "unused",
        when: [{ classes: ["Face"] }], inert: { FONT_WEIGHTS: "object", FACE_WEIGHT_FORMS: "empty-string" } },
    { id: "draw-image", describe: "drawImage in draw()", modules: ["draw-image"], hostsKeep: true, refusal: "unused",
        when: [{ calls: ["drawImage"] }],
        inert: { registerDrawImage: "noop", drawImageBitmap: "noop", drawImageHandles: "array" } },
    { id: "draw-text", describe: "fillText and strokeText in draw()", modules: ["draw-text"], hostsKeep: true, refusal: "unused",
        when: [{ calls: ["fillText", "strokeText"] }] },
    { id: "change-event", describe: "trackChanges and onChange", modules: ["change-event"], hostsKeep: true, refusal: "unused",
        when: [{ attributes: ["trackChanges"] }],
        inert: { setChangeDispatcher: "noop", untrackNode: "noop", fireChanges: "false", endChangeChain: "noop" } },
    { id: "rich-dom", describe: "rich text's DOM flow", modules: ["dom-rich"], hostsKeep: true, refusal: "unused",
        when: [{ classes: ["Markdown", "HTMLText", "RichText"] }],
        inert: { richInlineSlots: "false", richBlocks: "false", revealRichAnchor: "false" } },
    { id: "text-clamp", describe: "maxLines: the line clamp", modules: ["text-clamp"], hostsKeep: true, refusal: "unused",
        when: [{ attributes: ["maxLines"] }] },
    { id: "rich-views", describe: "rich text laid out as views (canvas, and a line budget)", modules: ["rich-views"],
        hostsKeep: true, refusal: "unused",
        // the DOM lays rich text out itself; only a CLAMPED rich text needs the view
        // path there (its line budget) — a clamped plain Text beside it does not
        when: [{ build: { render: "canvas" } }, { scoped: { attributes: ["maxLines"], on: ["Markdown", "HTMLText", "RichText"] } }] },
    { id: "rich-doc", describe: "rich text laid out by the DOM", modules: ["rich-doc"], hostsKeep: true, refusal: "unused",
        when: [{ build: { render: "dom" } }] },
    // Literal TEXT reaches the runtime only in rich text's inline-view tags,
    // read as the text arrives, and in a literal the compile could not ship as its
    // value (program-build.ts: none in the corpus). Everywhere else the program
    // carries values, and the parsers — with the color names — stay out.
    { id: "literal-parsing", describe: "the literal parsers: colors and their names, decoration constructors, motion, shapes",
        modules: ["literal-parse"], requires: ["easing", "effects"], hostsKeep: true, refusal: "unused",
        when: [{ classes: ["RichText"] }, { syntax: ["raw-literal"] }], inert: { FILL: "empty-string" } },
    { id: "schema-table", describe: "the built-in class schemas, whole (a build ships the ones its program constructs)",
        modules: ["schema"], when: [], hostsKeep: true, refusal: "unused", subset: { export: "SCHEMAS", keys: "classes" } },
    { id: "size-report", describe: "the authoring report of a child sized from a parent with no size to give",
        modules: ["size-report"], when: [{ build: { debug: true } }], refusal: "unused",
        inert: { noteNegativeSize: "noop", judgeNegativeSizes: "noop" } },
    // ── classes and constructs the core recognises but need not carry ─────────
    { id: "data", describe: "data: Dataset, DataSource, cursors and region cells", modules: ["data"], hostsKeep: true, refusal: "unused",
        when: [{ classes: ["Dataset"] }, { syntax: ["data-read"] }],
        inert: { unwrapValue: "identity", trackedView: "identity", setAppDataBase: "noop", provideTransport: "identity" } },
    { id: "replication", describe: "replication: one instance per record", modules: ["replicate"], requires: ["data"],
        hostsKeep: true, refusal: "unused", when: [{ syntax: ["replication"] }], inert: { materializationInfo: "null" } },
    { id: "class-for", describe: "classFor: a class per record in replication", modules: ["class-for"], requires: ["replication"],
        hostsKeep: true, refusal: "unused", when: [{ attributes: ["classFor"] }] },
    { id: "state", describe: "State: a named set of overrides", modules: ["state"], hostsKeep: true, refusal: "unused",
        when: [{ classes: ["State"] }] },
    { id: "editor", describe: "editing: TextInput's draft and two-way binding", modules: ["editor"], hostsKeep: true, refusal: "unused",
        when: [{ classes: ["Editor"] }, { syntax: ["two-way"] }] },
    // the boundary: values a host provides, and islands
    { id: "host-values", describe: "host values: what a host provides and a hosted side exposes", modules: ["boundary"],
        hostsKeep: true, refusal: "unused", when: [{ mentions: ["hostProvided", "$hostProvided"] }, { classes: ["DOMIsland"] }],
        inert: { hostValuesFor: "null" } },
    { id: "islands", describe: "islands: DOMIsland, AppIsland, the tenant link, and the page's island mounting",
        modules: ["island", "browser/host-islands"], requires: ["host-values"], hostsKeep: true, refusal: "unused",
        when: [{ classes: ["DOMIsland"] }],
        inert: { wireIslands: { returns: { members: { renderChild: "noop", retry: "noop", discover: "noop", dispose: "noop" } } } } },
    // the facts of being seen; a drawing arms them for its resolution
    { id: "visibility", describe: "onScreen, visibleRect and apparentScale", modules: ["visibility", "dom-visibility"], hostsKeep: true,
        refusal: "unused", when: [{ mentions: ["onScreen", "visibleRect", "apparentScale"] }],
        inert: { reattachVisibility: "noop", retireVisibility: "noop" } },
    // motion: a Spring follows physics; the timed run, its curves, groups and the
    // tweening layout come only with what uses them
    { id: "animator", describe: "Animator: the motion family's shared base", modules: ["animator"], hostsKeep: true, refusal: "unused",
        when: [{ classes: ["Animator"] }] },
    { id: "spring", describe: "Spring: physics toward a reactive target", modules: ["spring"], requires: ["animator"],
        hostsKeep: true, refusal: "unused", when: [{ classes: ["Spring"] }], inert: { arriveSubtree: "noop" } },
    { id: "tween", describe: "an Animator's timed run", modules: ["tween"], requires: ["animator", "easing"], hostsKeep: true, refusal: "unused",
        when: [{ ownClasses: ["Animator"] }, { classes: ["AnimatorGroup", "TweenLayout"] }] },
    { id: "easing", describe: "the easing curves a motion names", modules: ["easing"], hostsKeep: true, refusal: "unused",
        when: [{ attributes: ["motion"] }, { build: { render: "canvas" } }], inert: { MOTION_TOKENS: "array" } },
    { id: "animator-group", describe: "AnimatorGroup", modules: ["animator-group"], requires: ["tween"], hostsKeep: true, refusal: "unused",
        when: [{ classes: ["AnimatorGroup"] }] },
    { id: "tween-layout", describe: "TweenLayout: animated reflow", modules: ["tween-layout"], requires: ["tween"], hostsKeep: true,
        refusal: "unused", when: [{ classes: ["TweenLayout"] }] },
];
const DYNAMIC = new Set(["code", "path", "query", "subfrom"]);
/** Read a `{ }` body with TypeScript's parser: the names it mentions, calls and writes. */
function readBody(src, into) {
    const file = ts.createSourceFile("body.ts", `(function(){${src}\n})`, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
    const visit = (n) => {
        if (ts.isIdentifier(n))
            into.mentions.add(n.text);
        else if (ts.isPropertyAccessExpression(n))
            into.mentions.add(n.name.text);
        if (ts.isCallExpression(n)) {
            const c = n.expression;
            if (ts.isIdentifier(c))
                into.calls.add(c.text);
            else if (ts.isPropertyAccessExpression(c))
                into.calls.add(c.name.text);
            // an emitted datapath plan with a selector segment: $data([ …, { … } ])
            const callee = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : "";
            if (callee === "$data")
                into.syntax.add("data-read");
            if (callee === "$data" && n.arguments.length > 0) { // `$data([…])` or the emitted `this.$data([…])`
                const a0 = n.arguments[0];
                if (ts.isArrayLiteralExpression(a0) && a0.elements.some((e) => ts.isObjectLiteralExpression(e)))
                    into.syntax.add("selector-path");
            }
        }
        if (ts.isBinaryExpression(n) && n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && n.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
            const t = n.left;
            if (ts.isPropertyAccessExpression(t))
                into.writes.add(t.name.text);
            else if (ts.isIdentifier(t))
                into.writes.add(t.text);
        }
        ts.forEachChild(n, visit);
    };
    visit(file);
}
/** Constructor calls inside a literal value (`filter = [blur(3)]`, `fill = gradient(…)`). */
function literalCalls(v, into) {
    if (v === null || typeof v !== "object")
        return;
    const o = v;
    if (o.kind === "call" && typeof o.name === "string")
        into.add(o.name);
    for (const k of Object.keys(o)) {
        const x = o[k];
        if (Array.isArray(x))
            for (const y of x)
                literalCalls(y, into);
        else if (x !== null && typeof x === "object")
            literalCalls(x, into);
    }
}
/** ONE walk over the program — its tree, its classes, every `{ }` body. */
export function programFacts(program, usedClasses) {
    const f = { classes: new Set(usedClasses), ownClasses: new Set(usedClasses), methods: new Set(), attributes: new Map(), mentions: new Set(),
        calls: new Set(), writes: new Set(), dynamicSlots: new Set(), syntax: new Set(), attributeOn: new Map() };
    // a tag's built-in class chain: a program class through its `extends`, then the built-in's bases
    const baseOf = new Map(program.classes.filter((c) => c.name).map((c) => [c.name, c.base ?? null]));
    const chainOf = (tag) => {
        const out = [];
        let t = tag ?? null;
        for (let guard = 0; t !== null && baseOf.has(t) && guard < 64; guard++)
            t = baseOf.get(t) ?? null;
        for (let s2 = t !== null && Object.hasOwn(SCHEMAS, t) ? SCHEMAS[t] : null; s2 !== null; s2 = s2.base)
            out.push(s2.name);
        return out;
    };
    const planful = (v) => v != null && v.kind === "path" && Array.isArray(v.plan) && v.plan.some((s) => typeof s !== "string");
    const walk = (el, tag = el.tag) => {
        for (const m of el.methods ?? []) {
            f.methods.add(m.name);
            if (m.body)
                readBody(m.body, f);
        }
        const chain = chainOf(tag);
        for (const a of el.attrs ?? []) {
            const v = a.value;
            let on = f.attributeOn.get(a.name);
            if (on === undefined) {
                on = new Set();
                f.attributeOn.set(a.name, on);
            }
            for (const c of chain)
                on.add(c);
            const dynamic = v != null && DYNAMIC.has(v.kind ?? "");
            const lit = v != null && v.kind === "ident" ? (v.name ?? "") : ""; // a bare identifier: `focusable = false`
            let seen = f.attributes.get(a.name);
            if (seen === undefined) {
                seen = new Set();
                f.attributes.set(a.name, seen);
            }
            seen.add(dynamic ? "" : lit);
            if (dynamic)
                f.dynamicSlots.add(a.name);
            if (v?.kind === "path" || v?.kind === "query" || v?.kind === "subfrom" || a.name === "datapath")
                f.syntax.add("data-read");
            if (v?.kind === "code" && v.src)
                readBody(v.src, f);
            literalCalls(v, f.calls);
            if (planful(v))
                f.syntax.add("selector-path");
            if (v?.kind === "schema" || (a.name === "schema" && v?.kind === "ident" && v.name !== "null"))
                f.syntax.add("schema");
            if (v?.kind === "path" && v.many === true)
                f.syntax.add("replication");
            if (a.bind === "two")
                f.syntax.add("two-way");
        }
        for (const d of el.decls ?? []) {
            if (planful(d.def))
                f.syntax.add("selector-path");
            if (d.def?.kind === "path" || d.def?.kind === "query" || d.def?.kind === "subfrom")
                f.syntax.add("data-read");
            if (d.def?.kind === "code" && d.def.src)
                readBody(d.def.src, f);
            literalCalls(d.def, f.calls);
        }
        for (const c of el.children ?? [])
            walk(c);
    };
    walk(program.root);
    for (const c of program.classes)
        walk(c.body, c.name ?? c.body.tag);
    for (const name of [...f.classes]) { // a built-in constructs its bases too: TextInput is an Editor
        for (let s = Object.hasOwn(SCHEMAS, name) ? SCHEMAS[name].base : null; s !== null; s = s.base)
            f.classes.add(s.name);
    }
    return f;
}
/** Does this trigger match? Returns what matched, for `--why`, or null. */
function matches(t, f, b) {
    for (const n of t.classes ?? [])
        if (f.classes.has(n)) {
            if (f.ownClasses.has(n))
                return `constructs ${n}`;
            const by = [...f.ownClasses].find((c) => Object.hasOwn(SCHEMAS, c) && descendsFrom(SCHEMAS[c], n));
            const an = /^[AEIOU]/.test(n) ? "an" : "a";
            return by !== undefined ? `constructs ${by}, ${an} ${n}` : `constructs ${an} ${n}`;
        }
    for (const n of t.ownClasses ?? [])
        if (f.ownClasses.has(n))
            return `constructs ${n} itself`;
    for (const n of t.methods ?? [])
        if (f.methods.has(n))
            return `declares ${n}()`;
    for (const n of t.attributes ?? []) {
        const vals = f.attributes.get(n);
        const unless = t.attributesUnless?.[n];
        if (vals !== undefined && [...vals].some((v) => unless === undefined || v !== unless))
            return `sets ${n}`;
        if (f.writes.has(n))
            return `writes ${n}`;
    }
    for (const n of t.mentions ?? [])
        if (f.mentions.has(n))
            return `names ${n}`;
    for (const n of t.calls ?? [])
        if (f.calls.has(n))
            return `calls ${n}()`;
    for (const n of t.writes ?? [])
        if (f.writes.has(n))
            return `writes .${n}`;
    for (const n of t.slots ?? [])
        if (f.attributes.has(n))
            return `sets ${n}`;
    for (const n of t.dynamicSlots ?? [])
        if (f.dynamicSlots.has(n))
            return `sets ${n} to a value known only at run time`;
    if (t.scoped !== undefined) {
        for (const n of t.scoped.attributes) {
            const set = f.attributeOn.get(n);
            const on = t.scoped.on.find((c) => set?.has(c));
            if (on !== undefined)
                return `sets ${n} on ${/^[AEIOU]/.test(on) ? "an" : "a"} ${on}`;
            const built = t.scoped.on.find((c) => f.classes.has(c));
            if (built !== undefined && (f.mentions.has(n) || f.writes.has(n)))
                return `constructs ${built}, and a body names ${n}`;
        }
    }
    for (const s of t.syntax ?? [])
        if (f.syntax.has(s))
            return `uses ${s}`;
    if (t.build !== undefined) {
        const w = t.build;
        if (w.render !== undefined && b.render === w.render)
            return `renders on ${w.render}`;
        if (w.debug && b.debug)
            return "a --debug build";
        if (w.inspector && b.inspector)
            return "ship [ inspector ]";
        if (w.compiler && b.compiler)
            return "ship [ compiler ]";
        if (w.bridge && b.bridge)
            return "a build that carries the bridge";
    }
    return null;
}
/** The capabilities a program needs, closed over `requires`, each with why. */
export function neededCapabilities(f, b, manifest = CAPABILITIES) {
    const why = new Map();
    const byId = new Map(manifest.map((c) => [c.id, c]));
    const add = (id, reason) => {
        if (why.has(id))
            return;
        why.set(id, reason);
        for (const r of byId.get(id)?.requires ?? [])
            add(r, `required by ${id}`);
    };
    for (const c of manifest) {
        if (b.debug && c.debugKeeps !== false) {
            add(c.id, "a --debug build");
            continue;
        }
        if (b.hosts && c.hostsKeep) {
            add(c.id, "the page hosts programs");
            continue;
        }
        for (const t of c.when) {
            const m = matches(t, f, b);
            if (m !== null) {
                add(c.id, m);
                break;
            }
        }
    }
    return why;
}
export function exportsOf(source) {
    const file = ts.createSourceFile("m.js", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
    const out = [];
    const isExported = (n) => (ts.getCombinedModifierFlags(n) & ts.ModifierFlags.Export) !== 0;
    for (const s of file.statements) {
        if (ts.isFunctionDeclaration(s) && s.name && isExported(s))
            out.push({ name: s.name.text, kind: "function" });
        else if (ts.isClassDeclaration(s) && s.name && isExported(s))
            out.push({ name: s.name.text, kind: "class" });
        else if (ts.isVariableStatement(s) && isExported(s)) {
            for (const d of s.declarationList.declarations) {
                if (!ts.isIdentifier(d.name))
                    continue;
                const init = d.initializer;
                const fn = init !== undefined && (ts.isArrowFunction(init) || ts.isFunctionExpression(init));
                out.push({ name: d.name.text, kind: fn ? "function" : "const" });
            }
        }
        else if (ts.isExportDeclaration(s) && s.exportClause && ts.isNamedExports(s.exportClause)) {
            // a re-export belongs to the module it comes from: the stand-in passes it through
            const from = s.moduleSpecifier !== undefined && ts.isStringLiteral(s.moduleSpecifier) ? s.moduleSpecifier.text : undefined;
            for (const e of s.exportClause.elements) {
                out.push(from !== undefined ? { name: e.name.text, kind: "reexport", local: (e.propertyName ?? e.name).text, from } : { name: e.name.text, kind: "const" });
            }
        }
    }
    return out;
}
/** The JavaScript expression for an inert value. */
function inertValue(v, asFunction, ref) {
    if (typeof v === "object") {
        if ("returns" in v)
            return `() => (${inertValue(v.returns, false, ref)})`;
        if ("resolves" in v)
            return v.resolves === "identity" ? `(x) => Promise.resolve(x)` : `() => Promise.resolve(${inertValue(v.resolves, false, ref)})`;
        if ("wrap" in v)
            return `(x) => ({ ${JSON.stringify(v.wrap)}: x })`;
        const members = Object.entries(v.members).map(([k, m]) => `${JSON.stringify(k)}: ${inertValue(m, true, `${ref}.${k}`)}`).join(", ");
        return `refuseRest({ ${members} }, ${JSON.stringify(ref)}, W)`;
    }
    const value = {
        noop: "undefined", null: "null", false: "false", true: "true", zero: "0", "empty-string": '""',
        array: "[]", set: "new Set()", map: "new Map()", object: "Object.freeze({})",
    };
    if (v === "identity")
        return "(x) => x";
    if (v === "unsubscribe")
        return "() => () => {}";
    if (v === "class")
        return "class {}";
    if (v === "rejects")
        return `() => Promise.reject(refusal(${JSON.stringify(ref)}, W))`;
    return asFunction ? `() => ${value[v]}` : value[v];
}
/** The module a SUBSET capability ships when it is not needed whole: the
 *  module's own source, its table export's object literal holding only the
 *  entries `facts` names. */
export function subsetModule(cap, moduleName, source, facts) {
    const sub = cap.subset;
    const names = facts[sub.keys];
    const file = ts.createSourceFile(moduleName + ".js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let table = null;
    for (const st of file.statements) {
        if (!ts.isVariableStatement(st))
            continue;
        for (const d of st.declarationList.declarations) {
            if (ts.isIdentifier(d.name) && d.name.text === sub.export && d.initializer !== undefined && ts.isObjectLiteralExpression(d.initializer))
                table = d.initializer;
        }
    }
    if (table === null)
        throw new Error(`capability "${cap.id}": ${moduleName} has no object literal '${sub.export}' to cut`);
    const kept = [];
    for (const p of table.properties) {
        const key = p.name !== undefined && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null;
        if (key === null)
            throw new Error(`capability "${cap.id}": ${sub.export} has an entry the cut cannot name`);
        if (names.has(key))
            kept.push(p.getText(file));
    }
    return source.slice(0, table.getStart(file)) + `{ ${kept.join(", ")} }` + source.slice(table.getEnd());
}
/** The stand-in for one module of an absent capability. `helpersFrom` is the
 *  import specifier for runtime/dist/stand-in.js as seen from the module's folder. */
export function standIn(cap, moduleName, source, helpersFrom) {
    const inert = cap.inert ?? {};
    const lines = [
        `// STAND-IN for ${moduleName} — capability "${cap.id}" (${cap.describe}) is not aboard this build.`,
        `import { refusal, refuse, refuseRest } from ${JSON.stringify(helpersFrom)};`,
        `const W = ${JSON.stringify(cap.refusal)};`,
        // one refuser per module, named by the capability: a stand-in's names cost
        // bytes in every build that leaves the capability out
        `const R = refuse(${JSON.stringify(cap.id)}, W);`,
    ];
    for (const e of exportsOf(source)) {
        const v = inert[e.name];
        if (e.kind === "reexport") {
            lines.push(`export { ${e.local === e.name ? e.name : `${e.local} as ${e.name}`} } from ${JSON.stringify(e.from)};`);
        }
        else if (v !== undefined) {
            lines.push(`export const ${e.name} = ${inertValue(v, e.kind === "function", e.name)};`);
        }
        else if (e.kind === "function") {
            lines.push(`export const ${e.name} = R;`);
        }
        else if (e.kind === "class") {
            lines.push(`export class ${e.name} { constructor() { R(); } }`);
        }
        else {
            throw new Error(`capability "${cap.id}": ${moduleName} exports the constant '${e.name}', which a stand-in cannot refuse — declare it inert in the manifest (compiler/src/capabilities.ts)`);
        }
    }
    return lines.join("\n") + "\n";
}
//# sourceMappingURL=capabilities.js.map