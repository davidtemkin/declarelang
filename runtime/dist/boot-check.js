// boot-check — what a booted program can be asked before anyone looks at it:
// rung 4 of declare-verify. One implementation, reached through the page
// bridge (`__declare.bootCheck`), so a boot in a browser and a boot headless
// (tools/internal/verify-boot.mjs) say the same things in the same words.
//
// The runtime decides every box, so a boot has the real layout. In a browser it
// also has the real text; headless, text is measured by a stand-in, and the
// checks that rest on text are left out (`realText`).
import { View } from "./view.js";
import { rootFrameBox } from "./interaction.js";
import { find, pathOf } from "./inspect.js";
import { isSet, ownerOf, percentOwned, setBound } from "./attributes.js";
import { semanticTree, formatSemantics } from "./semantics.js";
import { DataSource } from "./data.js";
import { settle } from "./reactive.js";
export function bootCheck(app, opts = {}) {
    const record = { nodes: 0, notes: [], layout: [], unbuilt: [], answers: [], samples: [] };
    if (opts.feed) {
        const fed = feedSchemaSamples(app, record.samples);
        if (fed > 0) {
            settle();
            record.notes.push(`${fed} data source(s) fed a sample of their schema, so their rows were built (--samples prints them)`);
        }
    }
    const walk = (n) => { record.nodes++; for (const c of n.children)
        walk(c); };
    walk(app);
    record.notes.push(...outOfReach(app));
    record.layout.push(...layoutChecks(app, opts));
    if (opts.classes !== undefined)
        record.unbuilt = unbuiltClasses(app, opts.classes);
    if (opts.queries)
        record.answers = answer(app, opts.queries);
    return record;
}
const isA = (v, name) => {
    for (let c = v.constructor; c && c !== View; c = Object.getPrototypeOf(c))
        if (c.name === name)
            return true;
    return false;
};
/** CONTROLS NOBODY CAN REACH. A control that lies outside an ancestor which
 *  clips and does not scroll — with no scroller between them to bring it in —
 *  can never be seen or pressed; nor can one placed above or left of a
 *  scroller's origin, where no scroll reaches. Reported as a note, not a
 *  failure: a carousel that keeps cards outside its clip on purpose looks the
 *  same. The App's own frame is not a clip here: apps park closed panels
 *  off-stage by design. */
function outOfReach(app) {
    const clips = (v) => v.clip !== null && v.clip !== false && v.clip !== "";
    const out = [];
    const say = (v, why) => { out.push(`a control may be out of reach — ${pathOf(app, v)} (${v.constructor.name}) ${why}`); };
    const round = (b) => `x ${Math.round(b.x)}–${Math.round(b.x + b.width)}, y ${Math.round(b.y)}–${Math.round(b.y + b.height)}`;
    const box = (v, stop = null) => rootFrameBox(v, undefined, stop);
    const visit = (v) => {
        if (!v.visible)
            return; // a hidden view is reached when it is shown, not now
        if (isA(v, "Control") && v.width > 0 && v.height > 0) {
            const b = box(v);
            for (let a = v.parent, child = v; a instanceof View && a.parent !== null; child = a, a = a.parent) {
                if (a.scrolls !== "none") {
                    const c = box(v, a);
                    if (c.y + c.height <= 0 || c.x + c.width <= 0)
                        say(v, `lies above or left of ${pathOf(app, a)}, a scroller, where no scroll reaches (${round(c)} in its content)`);
                    break;
                }
                if (clips(a) && !child.ignoreClip) {
                    const k = box(a);
                    if (k.width <= 0 || k.height <= 0)
                        break; // a closed panel hides its content by design
                    const outside = b.x >= k.x + k.width || b.x + b.width <= k.x || b.y >= k.y + k.height || b.y + b.height <= k.y;
                    const partly = !outside && (b.x < k.x - 0.5 || b.y < k.y - 0.5 || b.x + b.width > k.x + k.width + 0.5 || b.y + b.height > k.y + k.height + 0.5);
                    if (outside || partly) {
                        say(v, `${outside ? "lies outside" : "is cut off by"} ${pathOf(app, a)}, which clips and does not scroll (the control ${round(b)}; the clip ${round(k)})`);
                        break;
                    }
                }
            }
        }
        for (const c of v.children)
            if (c instanceof View)
                visit(c);
    };
    if (app instanceof View)
        visit(app);
    return out;
}
/** What the layout shows wrong, each naming the view. */
function layoutChecks(app, { touch = false, realText = false }) {
    const out = [];
    // an App held wider than the window (a minWidth) is panned by the browser:
    // its edge is the frame's, which a person can reach
    const hostW = Math.max(app.hostWidth, app instanceof View ? app.width : 0);
    const sizedByContent = (v, size) => {
        if (isSet(v, size))
            return false;
        const o = ownerOf(v, size);
        return o === null || o.isAutoExtent === true || /content(Height|Width)/.test(o.source ?? "");
    };
    const touchSmall = [];
    const offEdge = new Set();
    const visit = (v, scrollsAcross) => {
        if (!v.visible)
            return;
        // A CHILD THE CONTENT SIZE SKIPS: its size is taken from the parent's, so
        // the parent's content size does not count it — and a parent sized by its
        // content is then smaller than the child it holds.
        for (const size of ["height", "width"]) {
            if (!sizedByContent(v, size))
                continue;
            for (const c of v.children) {
                if (!(c instanceof View) || !c.visible || !percentOwned(c, size))
                    continue;
                const end = (size === "height" ? c.y : c.x) + c[size];
                if (end > v[size] + 1) {
                    out.push(`${pathOf(app, v)} is ${Math.round(v[size])} ${size === "height" ? "tall" : "wide"}, sized by its content — but ${pathOf(app, c)} (${Math.round(c[size])}) takes its ${size} from it, so it is not counted, and spills out. Give ${pathOf(app, v)} a ${size}, or size the child from something else.`);
                }
            }
        }
        if (realText) {
            // TEXT PAST ITS BOX: a run that does not wrap and is wider than its box
            const t = v;
            if (isA(v, "Text") && t.wrap === false && v.width > 0 && typeof t.$widestLine === "function" && t.maxLines === 0) {
                const need = t.$widestLine();
                if (need > v.width + 1)
                    out.push(`${pathOf(app, v)}'s text needs ${Math.round(need)} wide and has ${Math.round(v.width)} — it runs past its box (wrap is off).`);
            }
            // PAST THE WINDOW'S EDGE: text or a control running off the window across,
            // outside any pane that scrolls that way — by the part of it that shows:
            // a view an ancestor clips ends where the clip does. Named is the outermost
            // view that runs off with it — the panel placed past the edge, once, not
            // each line it holds.
            if ((isA(v, "Text") || isA(v, "Control")) && !scrollsAcross && v.width > 0) {
                const b = rootFrameBox(v);
                let left = b.x, right = b.x + b.width;
                for (let a = v.parent; a instanceof View && a.parent !== null; a = a.parent) {
                    if (a.clip !== null && a.clip !== false && a.clip !== "") {
                        const k = rootFrameBox(a);
                        left = Math.max(left, k.x);
                        right = Math.min(right, k.x + k.width);
                    }
                }
                const side = right > hostW + 1 && left < hostW ? "right" : left < -1 && right > 0 ? "left" : null;
                if (side !== null) {
                    const past = (q) => side === "right" ? q.x + q.width > hostW + 1 : q.x < -1;
                    let at = v;
                    for (let a = v.parent; a instanceof View && a.parent !== null && past(rootFrameBox(a)); a = a.parent)
                        at = a;
                    if (!offEdge.has(at)) {
                        offEdge.add(at);
                        const k = at === v ? { x: left, width: right - left } : rootFrameBox(at);
                        const where = side === "right" ? `right edge at ${Math.round(hostW)} wide (it ends at ${Math.round(k.x + k.width)})` : `left edge (it starts at ${Math.round(k.x)})`;
                        out.push(`${pathOf(app, at)} runs past the window's ${where}${at === v ? "" : `, and ${pathOf(app, v)} with it`}.`);
                    }
                }
            }
        }
        // PINNED, BUT NOTHING TO PIN AGAINST: ignoreScroll opts a view out of its
        // OWN parent's scroll, and this parent does not scroll — so it scrolls with
        // the page, as its parent does, however it looks at the top of the page
        if (v.ignoreScroll && !v.$pinsToFrame() && v.parent instanceof View) {
            out.push(`${pathOf(app, v)} has ignoreScroll, but its parent ${pathOf(app, v.parent)} does not scroll, so it moves with ${pathOf(app, v.parent)}: a view stands still against its own parent's scroll. To stand still against the window, make it a child of the App; inside a pane, a child of the view that scrolls.`);
        }
        // A BAR AT THE WINDOW'S FOOT WRITTEN IN SCRIPT: pinned to the page with its
        // y computed from the window's height follows the browser's bars and the
        // overscroll bounce a frame late, and visibly jumps on a phone
        if (v.$pinsToFrame() && !(v.parent?.parent instanceof View) && !v.$endAnchor.has("y")) {
            const o = ownerOf(v, "y");
            if (o !== null && /hostHeight/.test(o.source ?? "")) {
                out.push(`${pathOf(app, v)} is pinned to the window and placed from its height (y = { ${(o.source ?? "").trim()} }), so on a phone it follows the browser's bars a frame late and jumps. Write y = end: the browser holds it against the window's foot itself, and runs it through the home indicator's band.`);
            }
        }
        // A TARGET TOO SMALL FOR A FINGER, on a touch screen
        if (touch && isA(v, "Control") && v.width > 0 && v.height > 0 && (v.width < 44 || v.height < 44))
            touchSmall.push(`${pathOf(app, v)} ${Math.round(v.width)}×${Math.round(v.height)}`);
        const across = scrollsAcross || v.scrolls === "x" || v.scrolls === "both";
        for (const c of v.children)
            if (c instanceof View)
                visit(c, across);
    };
    if (app instanceof View)
        visit(app, false);
    if (touchSmall.length > 0)
        out.push(`${touchSmall.length} control(s) smaller than 44 × 44, a finger's target: ${touchSmall.slice(0, 6).join(", ")}${touchSmall.length > 6 ? ", …" : "."}`);
    return out;
}
/** The program's own classes the boot never built — they appear later, after
 *  data arrives or the state changes, so nothing here checked them. */
function unbuiltClasses(app, classes) {
    const built = new Set();
    const walk = (n) => { built.add(n.constructor.name); for (const c of n.children)
        walk(c); };
    walk(app);
    return classes.filter((n) => !built.has(n));
}
/** The answers to a run's questions — reads, an outline, the semantic tree. */
function answer(app, { reads = [], outline = null, semantics = null }) {
    const out = [];
    for (const r of reads) {
        const k = r.lastIndexOf(".");
        const n = k > 0 ? find(app, r.slice(0, k)) : null;
        const v = n === null ? `(no view at ${r.slice(0, k)})` : n[r.slice(k + 1)];
        out.push(`${r} = ${typeof v === "object" && v !== null && "children" in v ? `(a ${v.constructor.name})` : JSON.stringify(v ?? null)}`);
    }
    if (outline !== null && outline !== undefined) {
        const root = outline === true ? app : find(app, outline);
        if (root === null)
            out.push(`(no view at ${outline})`);
        else {
            const lines = [];
            const w = (v, d) => {
                if (!(v instanceof View) || !v.visible || lines.length > 400)
                    return;
                const name = pathOf(app, v).split(".").pop();
                const text = v.text;
                lines.push(`${"  ".repeat(d)}${name} ${v.constructor.name}  ${Math.round(v.x)},${Math.round(v.y)}  ${Math.round(v.width)}×${Math.round(v.height)}${v.scrolls !== "none" ? "  scrolls " + v.scrolls : ""}${typeof text === "string" && text !== "" ? `  "${text.slice(0, 40)}${text.length > 40 ? "…" : ""}"` : ""}`);
                for (const c of v.children)
                    w(c, d + 1);
            };
            w(root, 0);
            out.push(lines.join("\n"));
        }
    }
    if (semantics !== null && semantics !== undefined) {
        const root = semantics === true ? app : find(app, semantics);
        out.push(root instanceof View ? formatSemantics(semanticTree(root)) : `(no view at ${semantics})`);
    }
    return out;
}
function feedSchemaSamples(app, samples) {
    const sources = [];
    const walk = (n) => { if (n instanceof DataSource)
        sources.push(n); for (const c of n.children)
        walk(c); };
    walk(app);
    let fed = 0;
    for (const ds of sources) {
        const d = ds;
        if (d.value != null || d.format === "text")
            continue;
        const shape = d.schema;
        const value = Array.isArray(shape) ? sampleOf(shape, 0)
            : shape !== null && typeof shape === "object" && shape.arrayRoot === true && Array.isArray(shape.fields)
                ? [sampleOf(shape.fields, 1, 0), sampleOf(shape.fields, 1, 1)]
                : undefined;
        if (value === undefined)
            continue;
        samples.push({ source: d.name ?? ds.constructor.name, value });
        setBound(ds, "value", value);
        setBound(ds, "loading", false);
        if (typeof d.onLoad === "function") {
            try {
                d.onLoad.call(ds);
            }
            catch (e) {
                console.error(`[Declare] onLoad on ${ds.constructor.name} threw: ${e?.message ?? e}`);
            }
        }
        fed++;
    }
    return fed;
}
/** A small document of a schema's shape: every field present, two records per
 *  list, a literal union's first member, distinct ids so rows keep identity. A
 *  string field whose name says what it holds gets a value of that kind. */
function sampleOf(fields, depth, index = 0) {
    const out = {};
    for (const f of fields) {
        const one = (i) => {
            if (f.fields !== undefined)
                return depth < 3 ? sampleOf(f.fields, depth + 1, i) : {};
            if (f.tokens !== undefined && f.tokens.length > 0)
                return f.tokens[0];
            if (f.type === "number")
                return f.name === "id" ? i + 1 : 1;
            if (f.type === "boolean")
                return false;
            if (f.name === "id")
                return `id${i + 1}`;
            return stringFor(f.name, i);
        };
        out[f.name] = f.array ? [one(0), one(1)] : one(index);
    }
    return out;
}
function stringFor(name, i) {
    const n = name.toLowerCase();
    const day = `2026-01-${String(15 + i).padStart(2, "0")}`;
    if (/(^|_)(date|day|today|birthday)$|date$|day$/.test(n))
        return day;
    if (/^(at|time|timestamp|when)$|_(at|time)$|(created|updated|started|ended|sent|seen|modified)(_?at)?$/.test(n) || /[a-z]At$/.test(name))
        return `${day}T09:30:00Z`;
    if (/url$|href$|link$|src$|image$|avatar$/.test(n))
        return `https://example.com/${name}/${i + 1}`;
    if (/email$/.test(n))
        return `person${i + 1}@example.com`;
    return "sample";
}
//# sourceMappingURL=boot-check.js.map