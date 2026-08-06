// registry — the program's authored link namespace (location.md §0.3), and the
// checks that make a reference a CHECKED thing: every `shows` name and every
// App-tree `anchor` in one namespace, uniqueness enforced, every literal
// reference resolved against it at build. The step up from links.ts's
// handler-body inference: authored declarations are the ground truth; the
// crawler seeds from this registry and traverses the rest.
//
// What is checked WHERE (the three tiers, §0.3):
//   build  — literal references: bare `link = "#…"` slots AND string literals
//            inside `link = { … }` constraint bodies (scanned with the TS AST,
//            the same instrument links.ts uses on handler bodies).
//   crawl  — evaluated link values during extraction (crawl.ts): the data tier.
//   never  — content slugs (`#loc@heading`), runtime-fetched prose the build
//            cannot see: the documented weaker tier.
//
// Placement rules (§0.4), enforced here:
//   shows: literal string · App tree only (never a class body) · never on a
//          replicated node. Duplicate `shows` names are LEGAL (the gate split);
//          a name used by both `shows` and `anchor`, or by two anchors, errors
//          at both sites. Registered anchors live in the App tree — an
//          `anchor` inside a class body is per-instance and unregistered
//          (reachable via the `@` tier's duplicate-suffix resolution only).
import ts from "typescript";
import { DeclareError } from "../../runtime/dist/errors.js";
const isReplicated = (el) => el.attrs.some((a) => a.name === "datapath" && a.value.kind === "path" && a.value.many);
/** Build the registry from the App tree and enforce the placement and
 *  uniqueness rules. Class bodies are visited only to REJECT `shows` there. */
export function buildRegistry(program) {
    const errors = [];
    const warnings = [];
    const destinations = new Set();
    const anchorSites = new Map();
    const showsSites = new Map();
    const walk = (el, dest) => {
        const sh = el.attrs.find((a) => a.name === "shows");
        let here = dest;
        if (sh !== undefined) {
            if (sh.value.kind !== "string") {
                errors.push(new DeclareError(`shows takes a literal name — a destination is an app-level fact the compiler must read without running anything. For data-driven families, put the identity in the location itself ('#deck/' + id) and derive from app.location`, sh.pos));
            }
            else if (isReplicated(el)) {
                errors.push(new DeclareError(`shows on a replicated node — a destination is singular, one name naming one place. Replicated detail pages are computed locations: put the identity in the location ('#deck/' + :id) and derive from app.location`, sh.pos));
            }
            else {
                here = sh.value.value;
                destinations.add(here);
                if (!showsSites.has(here))
                    showsSites.set(here, sh.pos);
                const a = anchorSites.get(here);
                if (a !== undefined) {
                    errors.push(new DeclareError(`'${here}' is already an anchor name — destinations and anchors share one namespace; rename one`, sh.pos));
                    errors.push(new DeclareError(`'${here}' is also a shows name — destinations and anchors share one namespace; rename one`, a.pos));
                }
            }
        }
        const an = el.attrs.find((a) => a.name === "anchor");
        if (an !== undefined && an.value.kind === "string" && an.value.value !== "") {
            const name = an.value.value;
            const prev = anchorSites.get(name);
            if (prev !== undefined) {
                errors.push(new DeclareError(`anchor '${name}' is declared twice — registered names are unique; rename one (the runtime's '-2' suffixing serves only unregistered, class-internal anchors)`, an.pos));
                errors.push(new DeclareError(`anchor '${name}' is declared twice — registered names are unique; rename one`, prev.pos));
            }
            else if (destinations.has(name) || showsSites.has(name)) {
                errors.push(new DeclareError(`'${name}' is already a shows name — destinations and anchors share one namespace; rename one`, an.pos));
            }
            else {
                anchorSites.set(name, { dest: here, pos: an.pos });
            }
        }
        for (const c of el.children)
            walk(c, here);
    };
    walk(program.root, "");
    for (const cls of program.classes) {
        const reject = (el) => {
            const sh = el.attrs.find((a) => a.name === "shows");
            if (sh !== undefined) {
                errors.push(new DeclareError(`shows in a class body — a destination is an app-level fact, and a class instantiated twice would declare the same place twice. Declare shows on the view in the App tree (a use-site 'shows = "…"' on this component works)`, sh.pos));
            }
            for (const c of el.children)
                reject(c);
        };
        reject(cls.body);
    }
    const anchors = new Map();
    for (const [name, site] of anchorSites)
        anchors.set(name, site.dest);
    return { registry: { destinations, anchors }, errors, warnings };
}
/** Every string literal starting with "#" inside a TS expression — the
 *  build-checkable references a `link = { … }` constraint carries. */
function fragmentLiterals(src) {
    const out = [];
    let sf;
    try {
        sf = ts.createSourceFile("l.ts", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    }
    catch {
        return out;
    }
    const visit = (n) => {
        if (ts.isStringLiteralLike(n) && n.text.startsWith("#"))
            out.push(n.text);
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return out;
}
/** Check every LITERAL reference in the program against the registry — bare
 *  `link` slots, fragment literals inside `link` constraints, and the
 *  compound-for-registered-anchor rule (§0.3). Also the migration and
 *  double-gate lints (§0.10). */
export function checkReferences(program, reg) {
    const errors = [];
    const warnings = [];
    const checkRef = (ref, pos) => {
        if (!ref.startsWith("#"))
            return; // external: scheme-checked at runtime seams
        const body = ref.slice(1);
        if (body === "")
            return;
        const at = body.indexOf("@");
        if (at >= 0) {
            const name = body.slice(at + 1);
            if (reg.anchors.has(name)) {
                errors.push(new DeclareError(`'${ref}' names the registered anchor '${name}' in compound form — write '#${name}': the compiler derives its destination, and the link survives the anchor moving`, pos));
            }
            return; // content tier: best-effort, unchecked
        }
        if (body.includes("/"))
            return; // computed location: the crawl checks it
        if (!reg.destinations.has(body) && !reg.anchors.has(body)) {
            const names = [...reg.destinations, ...reg.anchors.keys()];
            const near = names.length > 0 ? ` — declared names: ${names.sort().join(", ")}` : "";
            errors.push(new DeclareError(`'#${body}' names no declared destination or anchor${near}`, pos));
        }
    };
    const walk = (el, inClass) => {
        const link = el.attrs.find((a) => a.name === "link");
        if (link !== undefined) {
            if (link.value.kind === "string")
                checkRef(link.value.value, link.pos);
            else if (link.value.kind === "code")
                for (const ref of fragmentLiterals(link.value.src))
                    checkRef(ref, link.pos);
        }
        // double-gate lint (§0.10): shows already gates by location; a visible
        // constraint ALSO reading app.location silently disagrees on anchor
        // arrivals once the destination-part rule strips the @name
        const sh = el.attrs.find((a) => a.name === "shows");
        const vis = el.attrs.find((a) => a.name === "visible");
        if (sh !== undefined && vis !== undefined && vis.value.kind === "code" && /\bapp\.location\b|\blocation\b/.test(vis.value.src)) {
            warnings.push(new DeclareError(`this view's shows already gates by location — a visible constraint reading location again is the double gate the lowering composes wrongly with; drop the location test from visible`, vis.pos));
        }
        // migration lint (§0.10): a handler that writes location on a view with no
        // link is the pre-registry idiom — invisible to the crawler
        if (link === undefined) {
            for (const m of el.methods) {
                if (m.name === "onClick" && /\bapp\.location\s*=/.test(m.body)) {
                    warnings.push(new DeclareError(`onClick writes app.location on a view with no 'link' — the crawler cannot see this edge. Declare 'link = "#…"' (the handler may stay for side effects; it runs before the follow)`, m.pos));
                    break;
                }
            }
        }
        for (const c of el.children)
            walk(c, inClass);
    };
    walk(program.root, false);
    for (const cls of program.classes)
        walk(cls.body, true);
    return { errors, warnings };
}
//# sourceMappingURL=registry.js.map